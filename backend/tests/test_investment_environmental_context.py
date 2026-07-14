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
    FACILITY_TABLE,
    NWI_TABLE,
    SAFE_LIMITATION,
    SOIL_TABLE,
    TERRAIN_TABLE,
    _epa_physical_facility_key,
    _epa_program_categories,
    _epa_status_band,
    _clean_source_text,
    _soil_limit_note,
    _source_attribution,
    _source_limitations,
    candidate_environmental_context,
    environmental_context_by_parcel,
)

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


class FakeResult:
    def __init__(self, row=None, rows=None, scalar_value=0):  # noqa: ANN001
        self.row = row
        self.rows = rows or []
        self.scalar_value = scalar_value

    def __iter__(self):
        return iter(self.rows)

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
        if "WHERE parcel_id = ANY" in sql:
            return FakeResult(
                rows=[
                    {
                        "parcel_id": "P1",
                        "flood_context_band": "Mapped floodplain context",
                        "wetland_context_band": "Data Unavailable",
                        "terrain_context_band": "Data Unavailable",
                        "soil_limitation_band": "Data Unavailable",
                        "regulated_facility_context_band": "Data Unavailable",
                        "usable_area_screening_proxy": "Moderate Usable-Area Limitations",
                        "overall_environmental_constraint_band": "Moderate Mapped Constraint",
                        "environmental_data_confidence": "Limited",
                    }
                ]
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


def test_environmental_source_limitations_reflect_loaded_sources() -> None:
    counts = {NWI_TABLE: 1, TERRAIN_TABLE: 0, SOIL_TABLE: 1, FACILITY_TABLE: 1}
    limitations = " ".join(_source_limitations(counts))
    attribution = _source_attribution(nwi=True, terrain=False, soils=True, epa=True)

    assert "USGS terrain/slope context has not been refreshed locally" in limitations
    assert "USFWS NWI wetlands context has not been refreshed" not in limitations
    assert attribution["wetlands"] == "USFWS National Wetlands Inventory"
    assert attribution["soils"] == "USDA NRCS Soil Data Access / SSURGO mapunitpolyextended"
    assert attribution["regulated_facilities"] == "U.S. EPA ECHO All Media Programs Facility Search"
    assert "not yet refreshed" in attribution["slope"]


def test_soil_limitation_note_uses_focused_nrcs_fields() -> None:
    assert _soil_limit_note({"engdwobdcd": "Very limited", "engdwbdcd": None}) == "Very limited"
    assert _soil_limit_note({"engdwobdcd": None, "engdwbdcd": "Somewhat limited"}) == "Somewhat limited"
    assert _soil_limit_note({}) is None
    assert _clean_source_text("nan") is None


def test_epa_facility_dedup_and_program_categories() -> None:
    key_a = _epa_physical_facility_key(" Example Facility  ", 35.123456, -80.123456, "1")
    key_b = _epa_physical_facility_key("EXAMPLE   FACILITY", 35.123457, -80.123455, "2")
    categories = _epa_program_categories(
        {"RCRAIDs": "NCD1", "NPDESIDs": "NC002", "AIRIDs": "AIR1", "TRIIDs": "TRI1"},
        {"RCRAInspectionCount": 1},
    )

    assert key_a == key_b
    assert "Hazardous Waste / RCRA Context" in categories
    assert "Water-Discharge / NPDES Context" in categories
    assert "Air-Regulated Facility Context" in categories
    assert _epa_status_band(1, 0) == "Active regulatory program context"
    assert _epa_status_band(0, 2) == "Historical regulatory program context"


def test_environmental_context_by_parcel_returns_screening_fields() -> None:
    contexts = environmental_context_by_parcel(FakeDb(), ["P1", "P1", ""])

    assert contexts["P1"]["overall_environmental_constraint_band"] == "Moderate Mapped Constraint"
    assert contexts["P1"]["usable_area_screening_proxy"] == "Moderate Usable-Area Limitations"
    assert contexts["P1"]["environmental_data_confidence"] == "Limited"


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
        "Environmental filters",
        "Environmental Screening Context",
        "What environmental due diligence should come next?",
    ]:
        assert text in source
    assert "buildability" not in source.lower()


def test_environmental_docs_and_registry_are_safe() -> None:
    doc = (ROOT / "docs/investment-environmental-context.md").read_text().lower()
    registry = (ROOT / "config/investment_data_sources.json").read_text().lower()
    service = (ROOT / "backend/app/services/investment_environmental_context_service.py").read_text()

    assert "usgs_3dep" in registry
    assert "nrcs_soils" in registry
    assert "USFWS NWI Wetlands Map Service" in service
    assert "USDA NRCS Soil Data Access WFS" in service
    assert "EPA ECHO All Media Programs Facility Search" in service
    assert "tmp_cfs_terrain_points" in service
    assert "CFS_ENVIRONMENTAL_CACHE_DIR" in service
    assert "usable-area screening proxy" in doc
    assert "--source terrain" in doc
    assert "--source summaries" in doc
    assert '"source_rows": 1497' in registry
    for unsafe in ["environmentally cleared", "safe to develop", "guaranteed development", "investment advice"]:
        assert unsafe not in doc.replace("not investment advice", "")
