from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import CfsAiSearchService
from app.services.investment_environmental_context_service import (
    SAFE_LIMITATION,
    candidate_environmental_context,
)

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


class FakeResult:
    def __init__(self, row=None, scalar_value=0):  # noqa: ANN001
        self.row = row
        self.scalar_value = scalar_value

    def mappings(self):
        return self

    def first(self):
        return self.row

    def scalar(self):
        return self.scalar_value


class FakeDb:
    def execute(self, statement, params=None):  # noqa: ANN001
        sql = str(statement)
        if "SELECT * FROM investment_parcel_environmental_context" in sql:
            return FakeResult(
                {
                    "parcel_id": (params or {}).get("parcel_id") or "P1",
                    "flood_context_band": "Mapped floodplain context",
                    "wetland_context_band": "Data Unavailable",
                    "terrain_context_band": "Data Unavailable",
                    "soil_limitation_band": "Data Unavailable",
                    "regulated_facility_context_band": "Data Unavailable",
                    "usable_area_screening_proxy": "Moderate Usable-Area Limitations",
                    "overall_environmental_constraint_band": "Moderate Mapped Constraint",
                    "environmental_data_confidence": "Limited",
                    "environmental_verification_flags": ["Review floodplain context"],
                    "source_attribution": {"flood": "FEMA National Flood Hazard Layer parcel overlay"},
                    "source_version": "FEMA NFHL parcel overlay; extracts pending",
                    "refreshed_at": "2026-07-13T00:00:00Z",
                }
            )
        return FakeResult()


def test_candidate_environmental_context_is_screening_level_and_safe() -> None:
    context = candidate_environmental_context(FakeDb(), "P1")
    text = str(context).lower()

    assert context["overall_environmental_constraint_band"] == "Moderate Mapped Constraint"
    assert context["usable_area_screening_proxy"] == "Moderate Usable-Area Limitations"
    assert SAFE_LIMITATION in context["limitations"]
    for unsafe in ["wetland-free", "environmentally cleared", "safe to develop", "buy this parcel", "guaranteed value", "raw_score"]:
        assert unsafe not in text


def test_environmental_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    monkeypatch.setattr(investment_router, "environmental_status", lambda db: {"status": "loaded", "parcel_summary": {"parcel_summary_count": 2}})
    monkeypatch.setattr(investment_router, "refresh_environmental_context", lambda db, source="all": {"status": "ok", "source_requested": source})
    monkeypatch.setattr(investment_router, "candidate_environmental_context", lambda db, parcel_id: {"parcel_id": parcel_id, "environmental_data_confidence": "Limited"})
    monkeypatch.setattr(investment_router, "get_intake_candidate", lambda db, candidate_id: {"id": candidate_id, "parcel_id": "P1"})
    try:
        assert client.get("/investment/environmental/status").json()["status"] == "loaded"
        assert client.post("/investment/environmental/refresh?source=nwi").json()["source_requested"] == "nwi"
        assert client.get("/investment/candidates/P1/environmental-context").json()["environmental_data_confidence"] == "Limited"
        assert client.get("/investment/intake/C1/environmental-context").json()["parcel_id"] == "P1"
    finally:
        app.dependency_overrides.clear()


def test_ask_cfs_environmental_prompt_is_grounded_and_safe() -> None:
    response = CfsAiSearchService(
        SimpleNamespace(cfs_ai_enabled=False, cfs_ai_model="", cfs_ai_provider="none", openai_api_key="")
    ).search(
        CfsAiSearchRequest(
            app_mode="economics",
            filter_context={
                "mode": "investment_panel",
                "active_intake_candidate": "Lead A",
                "active_wetland_context": "Data Unavailable",
                "active_terrain_context": "Data Unavailable",
                "active_soil_context": "Data Unavailable",
                "active_facility_context": "Data Unavailable",
                "active_usable_area_proxy": "Moderate Usable-Area Limitations",
                "active_environmental_confidence": "Limited",
            },
            query="Summarize the major physical constraints for this candidate.",
        ),
        {"economics_intelligence": {}},
    )
    text = response.answer.lower()

    assert "environmental & physical context" in text
    assert "wetland delineation" in text
    assert "professional wetland" in text
    assert "geotechnical" in text
    assert "buy this" not in text
    assert "guaranteed value" not in text
    assert "wetland-free" not in text


def test_environmental_frontend_contracts() -> None:
    source = (ROOT / "src/components/economics/EconomicsShell.tsx").read_text()

    for text in [
        "Environmental & Physical Context",
        "Mapped Wetland Context",
        "Terrain / Slope Context",
        "Usable-Area Screening Proxy",
        "Environmental verification requirements",
        "What environmental due diligence should come next?",
    ]:
        assert text in source
    assert "buildability" not in source.lower()


def test_environmental_docs_and_registry_are_safe() -> None:
    doc = (ROOT / "docs/investment-environmental-context.md").read_text().lower()
    registry = (ROOT / "config/investment_data_sources.json").read_text().lower()

    assert "usgs_3dep" in registry
    assert "nrcs_soils" in registry
    assert "usable-area screening proxy" in doc
    for unsafe in ["environmentally cleared", "safe to develop", "guaranteed development", "investment advice"]:
        assert unsafe not in doc.replace("not investment advice", "")
