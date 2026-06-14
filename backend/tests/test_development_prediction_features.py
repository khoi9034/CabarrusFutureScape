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
CONFIG_FILE = REPO_ROOT / "config" / "development_prediction_features.json"
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_feature_matrix.py"
)
ZONING_TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_zoning_enhanced_features.py"
)
ZONING_MODEL_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "modeling"
    / "train_development_zoning_enhanced_model.py"
)
PHASE10E_METRICS_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10e_model_comparison_metrics.json"
)
PHASE10E_SAMPLE_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10e_zoning_enhanced_predictions_sample.csv"
)
PHASE10F_SUMMARY_FILE = (
    REPO_ROOT / "outputs" / "phase10f_development_prediction_model_qa_summary.json"
)
PHASE10F_CALIBRATION_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_calibration_review.json"
)
PHASE10F_TOP_REVIEW_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10f_top_ranked_parcel_review.csv"
)
PHASE10G_SUMMARY_FILE = (
    REPO_ROOT / "outputs" / "phase10g_internal_development_ranking_summary.json"
)
PHASE10G_VALIDATION_FILE = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10g_ranking_class_validation.json"
)
spec = importlib.util.spec_from_file_location(
    "create_development_prediction_feature_matrix",
    TRANSFORM_SCRIPT,
)
assert spec and spec.loader
feature_matrix = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = feature_matrix
spec.loader.exec_module(feature_matrix)
zoning_transform_spec = importlib.util.spec_from_file_location(
    "create_development_prediction_zoning_enhanced_features",
    ZONING_TRANSFORM_SCRIPT,
)
assert zoning_transform_spec and zoning_transform_spec.loader
zoning_transform = importlib.util.module_from_spec(zoning_transform_spec)
sys.modules[zoning_transform_spec.name] = zoning_transform
zoning_transform_spec.loader.exec_module(zoning_transform)
zoning_model_spec = importlib.util.spec_from_file_location(
    "train_development_zoning_enhanced_model",
    ZONING_MODEL_SCRIPT,
)
assert zoning_model_spec and zoning_model_spec.loader
zoning_model = importlib.util.module_from_spec(zoning_model_spec)
sys.modules[zoning_model_spec.name] = zoning_model
zoning_model_spec.loader.exec_module(zoning_model)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_development_prediction_feature_config_parses() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["model_active"] is False
    assert config["prediction_probability_available"] is False
    assert "permit_history_features" in config["feature_groups"]
    assert "new_construction_history_features" in feature_matrix.feature_registry_groups()
    assert "zoning_history_available_flag" in {
        feature["feature_name"] for feature in config["features"]
    }


@db_required
def test_development_prediction_features_summary_endpoint() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["feature_matrix_available"] is True
    assert body["row_count"] == 1430221
    assert body["unique_parcel_count"] == 110017
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert "prediction_probability" not in body
    assert body["production_ready"] is False
    assert body["zoning_enhanced_feature_matrix_available"] is True
    assert body["zoning_enhanced_row_count"] == 1430221
    assert body["zoning_enhanced_model_experiment_available"] is True
    assert body["latest_zoning_enhanced_experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert body["baseline_vs_zoning_metrics_summary"]["internal_only"] is True
    assert body["baseline_vs_zoning_metrics_summary"]["model_active"] is False
    assert body["baseline_vs_zoning_metrics_summary"][
        "prediction_probability_available"
    ] is False
    assert body["latest_model_qa_available"] is True
    assert body["latest_model_qa_id"] == "phase10f_model_qa_v1"
    assert body["standardized_metrics_available"] is True
    assert body["calibration_review_available"] is True
    assert body["label_positive_rates"]
    assert body["leakage_caveats"]


@db_required
def test_development_prediction_feature_rows_match_labels() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features)
                    AS feature_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_labels)
                    AS label_rows
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["label_rows"] == 1430221


@db_required
def test_development_prediction_prior_windows_do_not_go_negative() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE years_since_last_permit < 0)
                    AS negative_permit_age_rows,
                  COUNT(*) FILTER (WHERE years_since_last_new_construction < 0)
                    AS negative_new_construction_age_rows,
                  COUNT(*) FILTER (
                    WHERE permits_prior_1yr < 0
                       OR permits_prior_3yr < 0
                       OR permits_prior_5yr < 0
                       OR new_construction_permits_prior_1yr < 0
                       OR new_construction_permits_prior_3yr < 0
                       OR new_construction_permits_prior_5yr < 0
                  ) AS negative_count_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["negative_permit_age_rows"] == 0
    assert row["negative_new_construction_age_rows"] == 0
    assert row["negative_count_rows"] == 0


@db_required
def test_development_prediction_school_capacity_remains_inactive() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE school_capacity_status <> 'not_available')
                    AS active_capacity_rows,
                  COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)
                    AS scored_rows,
                  COUNT(*) FILTER (WHERE school_constraint_class <> 'not_scored')
                    AS classified_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["active_capacity_rows"] == 0
    assert row["scored_rows"] == 0
    assert row["classified_rows"] == 0


def test_development_prediction_features_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/prediction/features/summary" in response.json()["paths"]


@db_required
def test_zoning_enhanced_feature_matrix_preserves_base_rows_and_blocks_future_leakage() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features)
                    AS base_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features_zoning_enhanced)
                    AS enhanced_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE zoning_source_year > snapshot_year
                  ) AS source_year_leakage_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE latest_zoning_change_year > snapshot_year
                  ) AS change_year_leakage_rows,
                  (
                    SELECT COUNT(*)
                    FROM public.parcel_development_prediction_features_zoning_enhanced
                    WHERE zoning_temporal_status = 'current_context'
                  ) AS current_context_rows
                """,
            ),
        ).mappings().one()

    assert row["base_rows"] == row["enhanced_rows"] == 1430221
    assert row["source_year_leakage_rows"] == 0
    assert row["change_year_leakage_rows"] == 0
    assert row["current_context_rows"] == 0


def test_zoning_enhanced_model_feature_set_has_no_target_leakage() -> None:
    feature_columns = zoning_model.baseline.feature_columns_for_set(
        "zoning_enhanced_history",
    )

    zoning_model.baseline.assert_no_target_leakage(feature_columns)
    assert "historical_zoning_code" in feature_columns
    assert "zoning_changed_prior_5yr" in feature_columns
    assert "new_construction_next_3yr" not in feature_columns


def test_phase10e_model_output_structure_is_internal_only() -> None:
    assert PHASE10E_METRICS_FILE.exists()
    payload = json.loads(PHASE10E_METRICS_FILE.read_text(encoding="utf-8"))

    assert payload["experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False
    assert payload["zoning_enhanced"]["best_model_name"]
    assert payload["comparison_on_selected_best_models"]


def test_phase10e_prediction_sample_is_not_frontend_ready() -> None:
    assert PHASE10E_SAMPLE_FILE.exists()
    sample_text = PHASE10E_SAMPLE_FILE.read_text(encoding="utf-8")

    assert "experimental_probability" in sample_text
    assert "internal_experiment_not_for_public_decision" in sample_text
    assert "production_ready" in sample_text


def test_no_public_development_prediction_score_endpoint_exists() -> None:
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
    assert all("{official_parcel_id}" not in path for path in prediction_paths)


def test_standardized_lift_calculation_is_tie_aware() -> None:
    metrics = zoning_model.baseline.development_model_metrics.precision_recall_lift_at_fraction(
        [1, 0, 1, 0, 1],
        zoning_model.np.asarray([0.9, 0.8, 0.8, 0.8, 0.1]),
        0.4,
    )

    assert metrics["k"] == 2
    assert metrics["tie_count_at_cutoff"] == 3
    assert metrics["tie_adjusted"] is True
    assert metrics["precision"] == 0.666667
    assert metrics["lift"] == 1.111111


def test_phase10f_qa_outputs_keep_model_inactive() -> None:
    assert PHASE10F_SUMMARY_FILE.exists()
    payload = json.loads(PHASE10F_SUMMARY_FILE.read_text(encoding="utf-8"))

    assert payload["qa_id"] == "phase10f_model_qa_v1"
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False
    assert payload["standardized_baseline_metrics"]["row_count"] == 110017
    assert payload["standardized_zoning_enhanced_metrics"]["row_count"] == 110017
    assert payload["test_years"] == [2022]
    assert max(payload["mature_years"]) == 2022


def test_phase10f_calibration_output_structure() -> None:
    assert PHASE10F_CALIBRATION_FILE.exists()
    payload = json.loads(PHASE10F_CALIBRATION_FILE.read_text(encoding="utf-8"))

    assert payload["qa_id"] == "phase10f_model_qa_v1"
    assert payload["calibration_bins"]
    assert payload["calibration_bins"][0]["row_count"] > 0
    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False


def test_phase10f_top_ranked_review_is_internal_only() -> None:
    assert PHASE10F_TOP_REVIEW_FILE.exists()
    review_text = PHASE10F_TOP_REVIEW_FILE.read_text(encoding="utf-8")

    assert "experimental_probability" in review_text
    assert "production_ready" in review_text
    assert "internal_experiment_not_for_public_decision" in review_text


@db_required
def test_phase10g_ranking_class_assignment_counts_and_flags() -> None:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT development_signal_class, COUNT(*) AS row_count
                FROM public.development_prediction_ranking_classes
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                GROUP BY development_signal_class
                """,
            ),
        ).mappings().all()
        flags = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS row_count,
                  COUNT(DISTINCT official_parcel_id) AS parcel_count,
                  COUNT(*) FILTER (WHERE production_ready IS TRUE) AS production_ready_rows,
                  COUNT(*) FILTER (WHERE public_exposure_allowed IS TRUE)
                    AS public_exposure_rows
                FROM public.development_prediction_ranking_classes
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                """,
            ),
        ).mappings().one()

    counts = {row["development_signal_class"]: row["row_count"] for row in rows}
    assert counts["very_high_development_signal"] == 1101
    assert counts["very_high_development_signal"] + counts["high_development_signal"] == 5501
    assert (
        counts["very_high_development_signal"]
        + counts["high_development_signal"]
        + counts["moderate_development_signal"]
        == 16503
    )
    assert flags["row_count"] == flags["parcel_count"] == 110017
    assert flags["production_ready_rows"] == 0
    assert flags["public_exposure_rows"] == 0


@db_required
def test_phase10g_ranking_tables_do_not_store_public_probability_fields() -> None:
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name IN (
                    'development_prediction_ranking_classes',
                    'development_prediction_ranking_explanations'
                  )
                  AND column_name ILIKE '%probability%'
                """,
            ),
        ).mappings().all()

    assert rows == []


@db_required
def test_phase10g_explanations_generated_without_fake_missing_drivers() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) AS explanation_rows,
                  COUNT(*) FILTER (WHERE driver_summary = 'insufficient_feature_context')
                    AS insufficient_rows,
                  COUNT(*) FILTER (WHERE caveat <> 'internal_ranking_research_not_for_public_decision')
                    AS bad_caveat_rows
                FROM public.development_prediction_ranking_explanations
                WHERE model_experiment_id = 'phase10e_zoning_enhanced_v1'
                """,
            ),
        ).mappings().one()

    assert row["explanation_rows"] == 110017
    assert row["insufficient_rows"] == 0
    assert row["bad_caveat_rows"] == 0


def test_phase10g_aggregate_endpoint_is_internal_readiness_only() -> None:
    response = client.get("/development/prediction/ranking/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["ranking_available"] is True
    assert body["experiment_id"] == "phase10e_zoning_enhanced_v1"
    assert body["ranking_row_count"] == 110017
    assert body["production_ready"] is False
    assert body["public_exposure_allowed"] is False
    assert body["prediction_probability_available"] is False
    assert body["exact_probabilities_exposed"] is False
    assert body["no_parcel_level_scores"] is True
    assert "experimental_probability" not in body
    assert body["calibration_status"] == "weak_probability_calibration"


def test_phase10g_summary_outputs_are_internal_only() -> None:
    assert PHASE10G_SUMMARY_FILE.exists()
    assert PHASE10G_VALIDATION_FILE.exists()
    summary = json.loads(PHASE10G_SUMMARY_FILE.read_text(encoding="utf-8"))
    validation = json.loads(PHASE10G_VALIDATION_FILE.read_text(encoding="utf-8"))

    assert summary["exact_probabilities_exposed"] is False
    assert summary["frontend_exposure"] is False
    assert summary["production_ready"] is False
    assert validation["public_exposure_allowed"] is False
    assert validation["production_ready"] is False
