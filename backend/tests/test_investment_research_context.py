from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.investment import InvestmentReportRequest
from app.services import investment_research_context_service as service
from app.services.investment_research_context_service import REPORT_TYPES, build_parcel_research_context, generate_investment_report

client = TestClient(app)


ROW = {
    "parcel_id": "P1",
    "geography_label": "Demo corridor",
    "acreage": 12.5,
    "economic_segment": "Vacant / underbuilt land",
    "opportunity_class": "Underbuilt Redevelopment Candidate",
    "development_readiness_band": "Strong infrastructure-supported review candidate",
    "sewer_proxy_class": "Near sewer infrastructure",
    "utility_readiness_proxy_class": "Moderate sewer-proximity signal",
    "data_confidence": "Medium",
    "basis_context_band": "Near Comparable Context",
    "sale_quality_band": "Qualified",
    "owner": "Do Not Return",
    "raw_score": 99,
}


def market(_db, _parcel_id):  # noqa: ANN001
    return {
        "source": "U.S. Census Bureau ACS API",
        "acs_year": 2024,
        "geography_type": "tract",
        "geoid": "37025000100",
        "population_context": {"band": "Typical Local Context"},
        "data_confidence": "Medium",
        "limitations": ["Aggregate context only."],
    }


def environmental(_db, _parcel_id):  # noqa: ANN001
    return {
        "flood_context": "Limited mapped flood context",
        "mapped_wetland_context": "Limited Mapped Intersection",
        "terrain_context": "Generally Level",
        "soil_context": "Moderate Soil Review Need",
        "environmental_facility_context": "No Facility Identified in Screening Radius",
        "usable_area_screening_proxy": "Broad Usable-Area Signal",
        "overall_environmental_constraint_band": "Moderate Mapped Constraint",
        "environmental_data_confidence": "High",
        "verification_requirements": ["Review NWI mapping."],
        "source_attribution": {"wetlands": "USFWS National Wetlands Inventory"},
    }


def test_research_context_assembles_safe_parcel_context(monkeypatch) -> None:
    monkeypatch.setattr(service, "candidate_market_context", market)
    monkeypatch.setattr(service, "candidate_environmental_context", environmental)

    context = build_parcel_research_context(SimpleNamespace(), [ROW], "P1")
    text = str(context).lower()

    assert context["identity"]["parcel_id"] == "P1"
    assert context["market_area_context"]["acs_year"] == 2024
    assert context["environmental_context"]["terrain_context"] == "Generally Level"
    assert "utility_readiness_proxy_class" in context["utility_context"]
    assert "owner" not in text
    assert "raw_score" not in text
    assert "investment advice" in text


def test_every_report_type_is_structured_and_safe(monkeypatch) -> None:
    monkeypatch.setattr(service, "candidate_market_context", market)
    monkeypatch.setattr(service, "candidate_environmental_context", environmental)

    for report_type in REPORT_TYPES:
        report = generate_investment_report(
            SimpleNamespace(),
            [ROW],
            InvestmentReportRequest(report_type=report_type, parcel_id="P1"),
        )
        text = str(report).lower()
        assert report["brand"] == "CFS Investment"
        assert report["sections"]
        assert all(section["sources"] for section in report["sections"])
        assert "recommended investment" not in text
        assert "buy this parcel" not in text
        assert "official appraisal" not in text
        assert "confirmed capacity" not in text
        assert "owner" not in text
        assert "raw_score" not in text


def test_research_context_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    monkeypatch.setattr(investment_router, "_investment_rows", lambda db: [ROW])
    monkeypatch.setattr(service, "candidate_market_context", market)
    monkeypatch.setattr(service, "candidate_environmental_context", environmental)
    monkeypatch.setattr(
        service,
        "analyze_intake_candidate",
        lambda db, candidate_id, rows: {
            "candidate": {"id": candidate_id, "parcel_id": "P1", "candidate_name": "Private candidate", "strategy": "development_land"},
            "acquisition_basis": {"asking_basis_band": "Near Comparable Context", "evidence_type": "User-entered information"},
            "market_area_context": market(db, "P1"),
            "environmental_context": environmental(db, "P1"),
            "screening_context": None,
        },
    )
    try:
        parcel = client.get("/investment/research-context/P1")
        intake = client.get("/investment/intake/C1/research-context")
        report = client.post("/investment/reports/generate", json={"report_type": "development_site_review", "parcel_id": "P1"})
        assert parcel.status_code == 200
        assert intake.status_code == 200
        assert report.status_code == 200
        assert report.json()["brand"] == "CFS Investment"
    finally:
        app.dependency_overrides.clear()
