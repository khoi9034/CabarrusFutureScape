import csv
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
SUMMARY_OUTPUT = REPO_ROOT / "outputs" / "phase16c_feature_ablation_governance_summary.json"
ABLATION_METRICS_OUTPUT = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase16c_feature_ablation_metrics.csv"
)
GROUP_RECOMMENDATIONS_OUTPUT = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase16c_feature_group_recommendations.csv"
)
NOISY_FEATURE_REVIEW_OUTPUT = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase16c_noisy_feature_review.csv"
)
FEATURE_REGISTRY = REPO_ROOT / "config" / "development_prediction_features.json"

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase16c_ablation_outputs_exist_and_are_internal_only() -> None:
    assert SUMMARY_OUTPUT.exists()
    assert ABLATION_METRICS_OUTPUT.exists()
    assert GROUP_RECOMMENDATIONS_OUTPUT.exists()
    assert NOISY_FEATURE_REVIEW_OUTPUT.exists()

    summary = json.loads(SUMMARY_OUTPUT.read_text(encoding="utf-8"))
    assert summary["experiment_id"] == "phase16c_planning_pipeline_utility_ablation_v1"
    assert summary["model_safety_confirmation"]["production_ready"] is False
    assert summary["model_safety_confirmation"]["model_active"] is False
    assert summary["model_safety_confirmation"]["prediction_probability_available"] is False
    assert summary["model_safety_confirmation"]["public_prediction_endpoint_added"] is False
    assert summary["model_safety_confirmation"]["frontend_prediction_exposure_added"] is False


def test_phase16c_ablation_variant_inventory() -> None:
    rows = list(csv.DictReader(ABLATION_METRICS_OUTPUT.open("r", encoding="utf-8")))
    assert {row["variant_name"] for row in rows} == {
        "transportation_enhanced_base",
        "transportation_plus_tax_value_only",
        "transportation_plus_accela_only",
        "transportation_plus_central_area_only",
        "transportation_plus_utility_proxy_only",
        "transportation_plus_all_phase16b",
    }
    for row in rows:
        assert row["production_ready"] == "False"
        assert row["model_active"] == "False"
        assert row["prediction_probability_available"] == "False"


def test_phase16c_recommended_model_is_internal_only() -> None:
    summary = json.loads(SUMMARY_OUTPUT.read_text(encoding="utf-8"))
    decision = summary["recommended_current_best_internal_model"]

    assert decision["recommended_internal_model_experiment_id"] == (
        "phase16c_planning_pipeline_utility_ablation_v1"
    )
    assert decision["recommended_variant"] == "transportation_plus_tax_value_only"
    assert decision["phase16b_full_feature_set_recommended"] is False
    assert summary["model_safety_confirmation"]["production_ready"] is False


def test_phase16c_feature_registry_marks_phase16b_current_context() -> None:
    registry = json.loads(FEATURE_REGISTRY.read_text(encoding="utf-8"))
    features = {
        feature["feature_name"]: feature
        for feature in registry["features"]
    }
    for feature_name in [
        "future_land_use_category",
        "total_plan_review_count",
        "utility_access_proxy_score",
        "tax_enriched_total_value",
        "planning_pipeline_utility_current_context_only_flag",
    ]:
        feature = features[feature_name]
        assert feature["current_context_only"] is True
        assert feature["time_safe"] is False
        assert feature["include_in_strict_baseline"] is False
        assert feature["recommended_for_production_model"] is False

    assert (
        features["tax_enriched_total_value"]["recommended_for_current_best_internal_model"]
        is True
    )
    assert (
        features["utility_access_proxy_score"]["recommended_for_current_best_internal_model"]
        is False
    )


@db_required
def test_phase16c_backend_summary_metadata() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["latest_feature_ablation_available"] is True
    assert body["recommended_internal_model_experiment_id"] == (
        "phase16c_planning_pipeline_utility_ablation_v1"
    )
    assert body["recommended_internal_model_variant"] == "transportation_plus_tax_value_only"
    assert body["phase16b_full_feature_set_recommended"] is False
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["production_ready"] is False


def test_phase16c_no_public_parcel_prediction_endpoint_exists() -> None:
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
