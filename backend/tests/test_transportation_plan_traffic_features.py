import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import get_engine
from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
FOUND_SOURCE_CONFIG = REPO_ROOT / "config" / "found_planning_transportation_sources.json"
STIP_INGEST_SCRIPT = (
    REPO_ROOT / "cfs-data-pipelines" / "ingest" / "ingest_transportation_stip_projects.py"
)
AADT_INGEST_SCRIPT = REPO_ROOT / "cfs-data-pipelines" / "ingest" / "ingest_aadt_traffic_counts.py"
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_parcel_transportation_plan_traffic_features.py"
)


def load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


stip_ingest = load_module("ingest_transportation_stip_projects", STIP_INGEST_SCRIPT)
aadt_ingest = load_module("ingest_aadt_traffic_counts", AADT_INGEST_SCRIPT)
plan_traffic_transform = load_module(
    "create_parcel_transportation_plan_traffic_features",
    TRANSFORM_SCRIPT,
)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase13b_source_config_parses() -> None:
    config = json.loads(FOUND_SOURCE_CONFIG.read_text(encoding="utf-8"))
    source_keys = {source["source_key"] for source in config["sources"]}

    assert "ncdot_stip_2026_2035" in source_keys
    assert "ncdot_aadt_traffic_counts" in source_keys
    assert config["policy"]["do_not_train_model"] is True
    assert config["policy"]["do_not_expose_predictions"] is True


def test_phase13b_ingest_field_mappings_do_not_invent_missing_fields() -> None:
    assert stip_ingest.FIELD_MAPPING["project_name"] == ["TIP"]
    assert stip_ingest.FIELD_MAPPING["construction_year"] == ["ConstructionYear"]
    assert "project_status" not in stip_ingest.FIELD_MAPPING
    assert "funding_status" not in stip_ingest.FIELD_MAPPING

    assert aadt_ingest.FIELD_MAPPING["station_id"] == ["LocationID"]
    assert aadt_ingest.FIELD_MAPPING["route_name"] == ["ROUTE"]
    assert aadt_ingest.latest_aadt({"AADT_2021": "1000", "AADT_2022": "1250"}) == (
        1250,
        2022,
    )


def test_phase13b_transform_table_name_and_guardrails() -> None:
    assert (
        plan_traffic_transform.FEATURE_TABLE
        == "parcel_transportation_plan_traffic_features"
    )
    assert "phase13b_stip_aadt_feature_engineering_summary.json" in str(
        plan_traffic_transform.PHASE_SUMMARY_OUTPUT,
    )


@db_required
def test_phase13b_parcel_feature_row_count_and_context_flags() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcels_enriched) AS parcel_rows,
                  (SELECT COUNT(*) FROM public.parcel_transportation_plan_traffic_features)
                    AS feature_rows,
                  (SELECT COUNT(DISTINCT official_parcel_id)
                   FROM public.parcel_transportation_plan_traffic_features)
                    AS unique_feature_parcels,
                  (SELECT COUNT(*) FROM public.parcel_transportation_plan_traffic_features
                   WHERE current_context_only IS TRUE) AS current_context_rows,
                  (SELECT COUNT(*) FROM public.parcel_transportation_plan_traffic_features
                   WHERE time_safe_for_training IS TRUE) AS time_safe_rows
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["unique_feature_parcels"] == row["parcel_rows"] == 110017
    assert row["current_context_rows"] == 110017
    assert row["time_safe_rows"] == 0


@db_required
def test_phase13b_stip_and_aadt_sources_loaded() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.transportation_stip_projects_clean)
                    AS stip_clean_rows,
                  (SELECT COUNT(*) FROM public.transportation_aadt_stations_clean)
                    AS aadt_clean_rows,
                  (SELECT COUNT(*) FROM public.transportation_stip_projects_clean
                   WHERE project_status IS NULL) AS missing_stip_status_rows,
                  (SELECT COUNT(*) FROM public.transportation_aadt_stations_clean
                   WHERE aadt_value IS NULL) AS missing_aadt_value_rows
                """,
            ),
        ).mappings().one()

    assert row["stip_clean_rows"] == 18
    assert row["aadt_clean_rows"] == 642
    assert row["missing_stip_status_rows"] == 18
    assert row["missing_aadt_value_rows"] == 0


@db_required
def test_phase13b_transportation_plan_traffic_summary_endpoint_is_aggregate_only() -> None:
    response = client.get("/development/prediction/transportation-plan-traffic/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["feature_table_available"] is True
    assert body["row_count"] == 110017
    assert body["unique_parcel_count"] == 110017
    assert body["row_count_matches_parcels"] is True
    assert body["stip_clean_rows"] == 18
    assert body["aadt_clean_rows"] == 642
    assert body["current_context_only"] is True
    assert body["time_safe_for_training"] is False
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert "prediction_probability" not in body
    assert "official_parcel_id" not in body
    assert body["distribution_summary"]
    assert body["missingness_summary"]


def test_phase13b_transportation_plan_traffic_summary_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert (
        "/development/prediction/transportation-plan-traffic/summary"
        in response.json()["paths"]
    )
