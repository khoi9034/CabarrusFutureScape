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
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_planning_pipeline_utility_enhanced_features.py"
)
MODEL_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "modeling"
    / "train_development_planning_pipeline_utility_enhanced_model.py"
)
SUMMARY_OUTPUT = (
    REPO_ROOT / "outputs" / "phase16b_planning_pipeline_utility_model_comparison_summary.json"
)
METRICS_OUTPUT = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase16b_planning_pipeline_utility_model_comparison_metrics.json"
)


def load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


phase16b_transform = load_module(
    "create_development_prediction_planning_pipeline_utility_enhanced_features",
    TRANSFORM_SCRIPT,
)
phase16b_model = load_module(
    "train_development_planning_pipeline_utility_enhanced_model",
    MODEL_SCRIPT,
)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase16b_transform_constants() -> None:
    assert phase16b_transform.TABLE_NAME == (
        "parcel_development_prediction_features_planning_pipeline_utility_enhanced"
    )
    assert (
        phase16b_transform.BASE_TABLE_NAME
        == "parcel_development_prediction_features_transportation_enhanced"
    )
    assert (
        "planning_pipeline_utility_current_context_only_flag"
        in phase16b_transform.PLANNING_PIPELINE_UTILITY_FEATURE_COLUMNS
    )
    assert (
        "planning_pipeline_utility_time_safe_for_training_flag"
        in phase16b_transform.PLANNING_PIPELINE_UTILITY_FEATURE_COLUMNS
    )


def test_phase16b_model_constants_are_internal_only() -> None:
    assert phase16b_model.EXPERIMENT_ID == (
        "phase16b_planning_pipeline_utility_enhanced_v1"
    )
    assert phase16b_model.ENHANCED_FEATURE_TABLE == (
        "parcel_development_prediction_features_planning_pipeline_utility_enhanced"
    )
    assert (
        "utility_access_proxy_score"
        in phase16b_model.PLANNING_PIPELINE_UTILITY_FEATURE_NAMES
    )
    assert "active_plan_review_on_parcel" in phase16b_model.PLANNING_PIPELINE_UTILITY_FEATURE_NAMES


@db_required
def test_phase16b_feature_row_count_and_no_duplicates() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features_transportation_enhanced)
                    AS transportation_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features_planning_pipeline_utility_enhanced)
                    AS phase16b_rows,
                  (SELECT COUNT(DISTINCT official_parcel_id)
                   FROM public.parcel_development_prediction_features_planning_pipeline_utility_enhanced)
                    AS unique_parcels,
                  (SELECT COUNT(*) FROM (
                    SELECT official_parcel_id, snapshot_year, COUNT(*) AS row_count
                    FROM public.parcel_development_prediction_features_planning_pipeline_utility_enhanced
                    GROUP BY official_parcel_id, snapshot_year
                    HAVING COUNT(*) > 1
                   ) duplicate_groups) AS duplicate_groups
                """,
            ),
        ).mappings().one()

    assert row["phase16b_rows"] == row["transportation_rows"] == 1430221
    assert row["unique_parcels"] == 110017
    assert row["duplicate_groups"] == 0


@db_required
def test_phase16b_current_context_and_proxy_flags() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS row_count,
                  COUNT(*) FILTER (
                    WHERE planning_pipeline_utility_current_context_only_flag IS TRUE
                  ) AS current_context_rows,
                  COUNT(*) FILTER (
                    WHERE planning_pipeline_utility_time_safe_for_training_flag IS TRUE
                  ) AS time_safe_rows,
                  COUNT(*) FILTER (WHERE concord_only_feature_flag IS TRUE)
                    AS concord_only_rows,
                  COUNT(*) FILTER (WHERE utility_proxy_only_flag IS TRUE)
                    AS utility_proxy_rows,
                  COUNT(*) FILTER (WHERE true_utility_capacity_available IS TRUE)
                    AS true_capacity_rows
                FROM public.parcel_development_prediction_features_planning_pipeline_utility_enhanced
                """,
            ),
        ).mappings().one()

    assert row["row_count"] == 1430221
    assert row["current_context_rows"] == row["row_count"]
    assert row["time_safe_rows"] == 0
    assert row["concord_only_rows"] == row["row_count"]
    assert row["utility_proxy_rows"] == row["row_count"]
    assert row["true_capacity_rows"] == 0


def test_phase16b_model_output_structure_is_internal_only() -> None:
    assert SUMMARY_OUTPUT.exists()
    assert METRICS_OUTPUT.exists()
    summary = json.loads(SUMMARY_OUTPUT.read_text(encoding="utf-8"))
    metrics = json.loads(METRICS_OUTPUT.read_text(encoding="utf-8"))

    assert summary["experiment_id"] == "phase16b_planning_pipeline_utility_enhanced_v1"
    assert summary["production_ready"] is False
    assert summary["prediction_probability_available"] is False
    assert summary["no_frontend_exposure"] is True
    assert summary["current_context_only"] is True
    assert summary["time_safe_for_training"] is False
    assert summary["concord_only_features_present"] is True
    assert summary["utility_proxy_only_features_present"] is True
    assert "average_precision_pr_auc" in summary["metric_comparison"]
    assert metrics["production_ready"] is False
    assert metrics["prediction_probability_available"] is False
    assert metrics["current_context_only"] is True


@db_required
def test_phase16b_internal_score_table_guardrails() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS score_rows,
                  BOOL_OR(production_ready) AS any_production_ready,
                  BOOL_OR(public_exposure_allowed) AS any_public_exposure_allowed
                FROM public.development_prediction_model_experiment_scores
                WHERE model_experiment_id = 'phase16b_planning_pipeline_utility_enhanced_v1'
                """,
            ),
        ).mappings().one()

    assert row["score_rows"] == 110017
    assert row["any_production_ready"] is False
    assert row["any_public_exposure_allowed"] is False


@db_required
def test_phase16b_backend_summary_metadata() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["planning_pipeline_utility_feature_matrix_available"] is True
    assert body["planning_pipeline_utility_row_count"] == 1430221
    assert body["planning_pipeline_utility_model_experiment_available"] is True
    assert body["latest_planning_pipeline_utility_experiment_id"] == (
        "phase16b_planning_pipeline_utility_enhanced_v1"
    )
    assert body["planning_pipeline_utility_current_context_only"] is True
    assert body["concord_only_features_present"] is True
    assert body["utility_proxy_only_features_present"] is True
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["production_ready"] is False


def test_phase16b_no_public_parcel_prediction_endpoint_exists() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    prediction_paths = [
        path
        for path in response.json()["paths"]
        if path.startswith("/development/prediction")
    ]
    assert sorted(prediction_paths) == [
        "/development/prediction/features/summary",
        "/development/prediction/ranking/summary",
        "/development/prediction/transportation-accessibility/summary",
        "/development/prediction/transportation-plan-traffic/summary",
    ]
