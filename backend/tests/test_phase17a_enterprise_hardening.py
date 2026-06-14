import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_RECOVERY_DOC = REPO_ROOT / "docs" / "engineering" / "runtime_recovery.md"
PREDICTION_GUARDRAILS_DOC = (
    REPO_ROOT / "docs" / "engineering" / "prediction_exposure_guardrails.md"
)
RELEASE_CHECKLIST_DOC = (
    REPO_ROOT / "docs" / "engineering" / "release_candidate_checklist.md"
)
APP_SHELL = REPO_ROOT / "src" / "components" / "layout" / "AppShell.tsx"
COMMAND_PALETTE = (
    REPO_ROOT / "src" / "components" / "dashboard" / "CommandPalette.tsx"
)
METHODOLOGY_WORKSPACE = (
    REPO_ROOT / "src" / "components" / "dashboard" / "MethodologyWorkspace.tsx"
)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase17a_runtime_docs_include_safe_and_emergency_recovery() -> None:
    assert RUNTIME_RECOVERY_DOC.exists()
    text = RUNTIME_RECOVERY_DOC.read_text(encoding="utf-8")

    assert "npm run dev:cfs" in text
    assert "http://localhost:3000" in text
    assert "http://127.0.0.1:8000" in text
    assert "taskkill /F /IM node.exe" in text
    assert "taskkill /F /IM python.exe" in text
    assert "Remove-Item \".next\" -Recurse -Force" in text
    assert "kills all local Node and Python processes" in text
    assert "Cabarrus County GIS services may move" in text
    assert "logs/backend-dev.log" in text
    assert "logs/next-dev.log" in text


def test_phase17a_prediction_guardrail_docs_define_allowed_routes() -> None:
    assert PREDICTION_GUARDRAILS_DOC.exists()
    text = PREDICTION_GUARDRAILS_DOC.read_text(encoding="utf-8")

    for path in [
        "/development/prediction/features/summary",
        "/development/prediction/ranking/summary",
        "/development/prediction/transportation-accessibility/summary",
        "/development/prediction/transportation-plan-traffic/summary",
    ]:
        assert path in text

    assert "/development/prediction/{official_parcel_id}" in text
    assert "model_active = false" in text
    assert "prediction_probability_available = false" in text
    assert "production_ready = false" in text
    assert "public_exposure_allowed = false" in text


def test_phase17a_release_candidate_checklist_covers_demo_modes_and_layers() -> None:
    assert RELEASE_CHECKLIST_DOC.exists()
    text = RELEASE_CHECKLIST_DOC.read_text(encoding="utf-8")

    for phrase in [
        "Overview loads",
        "Due Diligence loads",
        "Methodology loads without rendering SceneView",
        "Executive Print loads",
        "Development Hotspots",
        "Flood Constraints",
        "FEMA Flood Zones",
        "School Utilization Seed",
        "CFS-PARCEL-0149726579",
    ]:
        assert phrase in text


def test_phase17a_methodology_mode_remains_sceneview_free() -> None:
    text = APP_SHELL.read_text(encoding="utf-8")

    methodology_branch = text.split(") : methodologyMode ? (", 1)[1].split(
        ") : (",
        1,
    )[0]
    assert "MethodologyWorkspace" in methodology_branch
    assert "SceneViewContainer" not in methodology_branch


def test_phase17a_command_palette_blocks_disabled_keyboard_execution() -> None:
    text = COMMAND_PALETTE.read_text(encoding="utf-8")

    assert "if (result.disabled)" in text
    assert "if (!selectedResult.disabled)" in text


def test_phase17a_methodology_avoids_parcel_level_prediction_claims() -> None:
    text = METHODOLOGY_WORKSPACE.read_text(encoding="utf-8")
    lower = text.lower()

    assert "Current best internal model" in text
    assert "Zoning + Transportation + Tax/Value" in text
    assert "experimental_probability" not in text
    assert "this parcel will develop" not in lower
    assert "official growth score" not in lower
    assert "production prediction" not in lower


def test_phase17a_public_prediction_routes_remain_aggregate_only() -> None:
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


@db_required
def test_phase17a_prediction_summary_flags_remain_false() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["current_best_internal_model_available"] is True
    assert (
        body["current_best_internal_model_variant"]
        == "transportation_plus_tax_value_only"
    )
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert body["production_ready"] is False
    assert body["current_best_internal_model_public_exposure_allowed"] is False
    assert body["current_best_internal_model_production_ready"] is False
    assert "experimental_probability" not in body
