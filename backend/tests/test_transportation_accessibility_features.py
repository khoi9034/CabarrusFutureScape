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
CONFIG_FILE = REPO_ROOT / "config" / "transportation_accessibility_sources.json"
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_parcel_transportation_accessibility_features.py"
)

spec = importlib.util.spec_from_file_location(
    "create_parcel_transportation_accessibility_features",
    TRANSFORM_SCRIPT,
)
assert spec and spec.loader
transport_transform = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = transport_transform
spec.loader.exec_module(transport_transform)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_transportation_source_config_parses() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["policy"]["inventory_only"] is True
    source_keys = {source["source_key"] for source in config["sources"]}
    assert "cabarrus_county_centerlines_dedicated" in source_keys
    assert "opendata_nc_railroad_centerline_legacy" in source_keys
    assert "opendata_nc_railroad_corridor_legacy" in source_keys


def test_transportation_transform_constants_preserve_major_road_guardrail() -> None:
    assert transport_transform.FEATURE_TABLE == "parcel_transportation_accessibility_features"
    assert transport_transform.MIN_MAJOR_ROAD_SEGMENTS_FOR_COUNTYWIDE_FEATURE >= 100


@db_required
def test_transportation_accessibility_feature_table_row_count() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcels_enriched) AS parcel_rows,
                  (SELECT COUNT(*) FROM public.parcel_transportation_accessibility_features)
                    AS feature_rows,
                  (SELECT COUNT(DISTINCT official_parcel_id)
                   FROM public.parcel_transportation_accessibility_features)
                    AS unique_feature_parcels
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["unique_feature_parcels"] == row["parcel_rows"] == 110017


@db_required
def test_transportation_accessibility_missing_road_class_handled_safely() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE distance_to_nearest_road_ft IS NULL)
                    AS missing_nearest_road,
                  COUNT(*) FILTER (WHERE distance_to_nearest_major_road_ft IS NULL)
                    AS missing_major_road,
                  COUNT(*) FILTER (
                    WHERE transportation_accessibility_data_quality =
                      'basic_accessibility_no_major_road_classification'
                  ) AS no_major_classification_rows,
                  COUNT(*) AS total_rows
                FROM public.parcel_transportation_accessibility_features
                """,
            ),
        ).mappings().one()

    assert row["missing_nearest_road"] == 0
    assert row["missing_major_road"] == row["total_rows"] == 110017
    assert row["no_major_classification_rows"] == 110017


@db_required
def test_transportation_accessibility_summary_endpoint_is_aggregate_only() -> None:
    response = client.get("/development/prediction/transportation-accessibility/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["feature_table_available"] is True
    assert body["row_count"] == 110017
    assert body["unique_parcel_count"] == 110017
    assert body["row_count_matches_parcels"] is True
    assert body["current_context_only"] is True
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert "prediction_probability" not in body
    assert "official_parcel_id" not in body
    assert body["distance_summary"]
    assert body["missingness_summary"]


def test_transportation_accessibility_summary_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert (
        "/development/prediction/transportation-accessibility/summary"
        in response.json()["paths"]
    )
