import csv
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
CURRENT_BEST_REGISTRY = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "current_best_internal_model_registry.json"
)
FEATURE_GROUP_GOVERNANCE_MATRIX = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "feature_group_governance_matrix.csv"
)
METHODOLOGY_WORKSPACE = (
    REPO_ROOT / "src" / "components" / "dashboard" / "MethodologyWorkspace.tsx"
)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase16d_current_best_registry_exists_and_is_internal_only() -> None:
    assert CURRENT_BEST_REGISTRY.exists()
    registry = json.loads(CURRENT_BEST_REGISTRY.read_text(encoding="utf-8"))

    assert registry["recommended_feature_set"] == "transportation_plus_tax_value_only"
    assert registry["recommended_experiment_id"] == (
        "phase16c_planning_pipeline_utility_ablation_v1"
    )
    assert registry["model_status"] == "internal_research_only"
    assert registry["production_ready"] is False
    assert registry["public_exposure_allowed"] is False
    assert registry["prediction_probability_available"] is False
    assert registry["model_active"] is False
    assert "public_decision_making" in registry["not_recommended_use"]
    assert "parcel_level_probability_display" in registry["not_recommended_use"]
    assert "Accela plan reviews" in registry["excluded_feature_groups"]


def test_phase16d_feature_governance_matrix_marks_excluded_groups() -> None:
    assert FEATURE_GROUP_GOVERNANCE_MATRIX.exists()
    rows = list(
        csv.DictReader(FEATURE_GROUP_GOVERNANCE_MATRIX.open("r", encoding="utf-8")),
    )
    by_group = {row["feature_group"]: row for row in rows}

    assert by_group["tax/value enrichment"][
        "included_in_current_best_internal_model"
    ] == "true"
    for group in ["Accela plan reviews", "Central Area Plan", "utility proxy"]:
        assert by_group[group]["included_in_current_best_internal_model"] == "false"
        assert by_group[group]["current_context_only"] == "true"

    assert by_group["future land use missing"]["current_status"] == "missing"
    assert by_group["true utility capacity missing"]["current_status"] == "missing"


@db_required
def test_phase16d_backend_summary_reports_current_best_without_activation() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["current_best_internal_model_available"] is True
    assert (
        body["current_best_internal_model_variant"]
        == "transportation_plus_tax_value_only"
    )
    assert body["current_best_internal_model_public_exposure_allowed"] is False
    assert body["current_best_internal_model_production_ready"] is False
    assert "Accela plan reviews" in body["excluded_feature_groups_current_best"]
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["production_ready"] is False
    assert "experimental_probability" not in body


def test_phase16d_methodology_text_is_aggregate_only() -> None:
    text = METHODOLOGY_WORKSPACE.read_text(encoding="utf-8")

    assert "Current best internal model" in text
    assert "Zoning + Transportation + Tax/Value" in text
    assert "parcel IDs" in text
    assert "model probability values" in text
    assert "experimental_probability" not in text
    assert "exact probabilities" not in text.lower()
    assert "parcel-level classes are not exposed" in text


def test_phase16d_no_public_parcel_prediction_endpoint_exists() -> None:
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
