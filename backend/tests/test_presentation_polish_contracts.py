from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_ask_cfs_panel_has_presentation_error_states() -> None:
    source = _read("src/components/dashboard/AskCfsPanel.tsx")

    assert "CFS data service is unavailable" in source
    assert "presentation timeout" in source
    assert "OpenAI enhancement is temporarily unavailable" in source
    assert "latestRequestId" in source
    assert "Evidence used" in source
    assert "OpenAI enhanced" in source


def test_economics_dashboard_and_powerbi_are_segmented_for_presentation() -> None:
    source = _read("src/components/economics/EconomicsShell.tsx")

    for label in [
        "Executive Pulse",
        "Land Economics",
        "Scenario Burden",
        "Data Confidence",
        "Report Builder",
        "Data Tables",
        "Land Screener",
        "Report Bucket",
        "Apply AI Plan",
    ]:
        assert label in source

    assert "activeDashboardSegment" in source
    assert "activeToolsTab" in source


def test_presentation_check_script_is_registered_and_safe() -> None:
    package_json = json.loads(_read("package.json"))
    script = _read("scripts/check-presentation.mjs")

    assert package_json["scripts"]["check:presentation"] == "node scripts/check-presentation.mjs"
    assert "/ai/status" in script
    assert "/ai/search" in script
    assert "api_key_configured" in script
    assert "OPENAI_API_KEY" not in script
    assert "sk-" not in script


def test_backend_ai_check_does_not_print_secret_values() -> None:
    source = _read("backend/app/scripts/check_cfs_ai.py")

    assert "api_key_configured" in source
    assert "structured_response_status" in source
    assert "openai_api_key" not in source.lower()
    assert "Summarize this diagnostic CFS context." in source
