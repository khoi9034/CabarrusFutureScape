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
CONFIG_FILE = REPO_ROOT / "config" / "planning_pipeline_utility_sources.json"
COMBINED_TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_parcel_planning_pipeline_utility_features.py"
)

spec = importlib.util.spec_from_file_location(
    "create_parcel_planning_pipeline_utility_features",
    COMBINED_TRANSFORM_SCRIPT,
)
assert spec and spec.loader
combined_transform = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = combined_transform
spec.loader.exec_module(combined_transform)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase16a_source_config_parses_and_constructs_rest_urls() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["policy"]["inventory_and_feature_engineering_only"] is True
    assert config["policy"]["model_training_allowed"] is False
    sources = {source["source_key"]: source for source in config["sources"]}

    central_boundary = sources["concord_central_area_plan_boundary"]
    assert central_boundary["full_layer_url"].endswith("/MapServer/50")
    assert central_boundary["full_layer_url"] == (
        f"{central_boundary['service_root_url']}/{central_boundary['layer_id']}"
    )

    wsacc_lines = sources["wsacc_sewer_lines_revalmap"]
    assert wsacc_lines["full_layer_url"].endswith("/MapServer/44")
    assert wsacc_lines["true_capacity_available"] is False


def test_phase16a_config_preserves_concord_and_utility_guardrails() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    sources = config["sources"]

    central_sources = [source for source in sources if source.get("source_group") == "central_area_plan"]
    utility_sources = [source for source in sources if source.get("source_group") == "utility_proxy"]
    tax_sources = [source for source in sources if source.get("source_group") == "tax_parcel_full"]

    assert central_sources
    assert all(source["jurisdiction"] == "Concord" for source in central_sources)
    assert all(source["current_context_only"] is True for source in central_sources)
    assert all(source["time_safe_for_training"] is False for source in central_sources)

    assert utility_sources
    assert all(source["true_capacity_available"] is False for source in utility_sources)
    assert all(source["time_safe_for_training"] is False for source in utility_sources)

    assert tax_sources[0]["do_not_overwrite_table"] == "public.parcels_enriched"


def test_phase16a_combined_transform_constants() -> None:
    assert combined_transform.FEATURE_TABLE == "parcel_planning_pipeline_utility_features"


def test_phase16a_feature_registry_marks_features_current_context_only() -> None:
    registry = json.loads((REPO_ROOT / "config" / "development_prediction_features.json").read_text(encoding="utf-8"))
    features = [
        feature
        for feature in registry["features"]
        if feature.get("feature_group") == "planning_pipeline_utility_features"
    ]

    assert features
    assert all(feature.get("current_context_only") is True for feature in features)
    assert all(feature.get("time_safe") is False for feature in features)
    assert all(feature.get("include_in_strict_baseline") is False for feature in features)


@db_required
def test_phase16a_combined_feature_table_matches_parcel_count() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcels_enriched) AS parcel_rows,
                  (SELECT COUNT(*) FROM public.parcel_planning_pipeline_utility_features)
                    AS feature_rows,
                  (SELECT COUNT(DISTINCT official_parcel_id)
                   FROM public.parcel_planning_pipeline_utility_features)
                    AS unique_feature_parcels,
                  (SELECT COUNT(*)
                   FROM public.parcel_planning_pipeline_utility_features
                   WHERE current_context_only IS TRUE) AS current_context_rows,
                  (SELECT COUNT(*)
                   FROM public.parcel_planning_pipeline_utility_features
                   WHERE time_safe_for_training IS FALSE) AS not_time_safe_rows,
                  (SELECT COUNT(*)
                   FROM public.parcel_planning_pipeline_utility_features
                   WHERE true_utility_capacity_available IS TRUE) AS true_capacity_rows
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["unique_feature_parcels"] == row["parcel_rows"] == 110017
    assert row["current_context_rows"] == row["feature_rows"]
    assert row["not_time_safe_rows"] == row["feature_rows"]
    assert row["true_capacity_rows"] == 0


@db_required
def test_phase16a_tax_enrichment_does_not_overwrite_parcels() -> None:
    with get_engine().connect() as connection:
        overwritten = connection.execute(
            text(
                """
                SELECT COUNT(*)
                FROM public.parcel_tax_value_enrichment_features
                WHERE base_parcels_overwritten IS TRUE
                """,
            ),
        ).scalar_one()

    assert overwritten == 0


def test_phase16a_no_public_prediction_endpoint_added() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = set(response.json()["paths"])
    assert "/development/prediction/planning-pipeline-utility/{official_parcel_id}" not in paths
    assert "/development/prediction/{official_parcel_id}" not in paths
    assert "/development/prediction/score/{official_parcel_id}" not in paths
