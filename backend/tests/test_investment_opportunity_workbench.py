from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.investment_opportunities import InvestmentUnderwritingPrefillRequest
from app.services import ai_search_service
from app.services import investment_opportunity_feed_service as opportunities
from app.services.investment_area_radar_service import radar_search
from app.services.investment_underwriting_service import DEFAULT_TEMPLATES, prefill_underwriting

client = TestClient(app)


ROWS = [
    {
        "parcel_id": "P1",
        "display_label": "Cabarrus review tract",
        "geography_label": "Kannapolis",
        "acreage": 52,
        "economic_segment": "Industrial land",
        "development_readiness_band": "Strong infrastructure-supported review candidate",
        "sewer_proxy_class": "Near sewer infrastructure",
        "overall_environmental_constraint_band": "Limited Mapped Constraint",
        "data_confidence": "Medium",
    },
    {
        "parcel_id": "P2",
        "display_label": "Mixed evidence tract",
        "geography_label": "Concord",
        "acreage": 9,
        "economic_segment": "Commercial land",
        "development_readiness_band": "Opportunity signal, capacity data needed",
        "utility_readiness_proxy_class": "Sewer basin context only",
        "overall_environmental_constraint_band": "Material Mapped Constraint",
        "data_confidence": "Data Needed",
    },
]


def test_opportunity_sources_are_governed_and_do_not_scrape() -> None:
    response = opportunities.opportunity_sources()
    text = str(response).lower()

    assert response["count"] >= 5
    assert any(source["source_type"] == "External Search Link" for source in response["sources"])
    assert any(source["enabled"] is False for source in response["sources"])
    assert "no scraping" in text or "not synchronized" in text
    assert "owner" not in text
    assert "mailing" not in text


def test_opportunity_feed_normalizes_dedupes_and_filters(monkeypatch) -> None:
    monkeypatch.setattr(
        opportunities,
        "list_intake_candidates",
        lambda _db, _rows: {
            "candidates": [
                {
                    "id": "C1",
                    "candidate_name": "Broker lead",
                    "parcel_id": "P1",
                    "parcel_acres": 52,
                    "asking_price": 2_600_000,
                    "source_name": "Analyst import",
                    "listing_status": "Needs Verification",
                }
            ]
        },
    )

    response = opportunities.list_opportunities(SimpleNamespace(), ROWS, {"minimum_acres": 10})

    assert response["count"] == 1
    item = response["opportunities"][0]
    assert item["parcel_id"] == "P1"
    assert item["price_per_acre"] == 50_000
    assert item["external_search_links"]
    assert "not all available properties" in str(response).lower()


def test_area_radar_explains_search_areas_without_raw_scores() -> None:
    response = radar_search(ROWS, strategy="industrial_site")
    text = str(response).lower()

    assert response["areas"]
    assert response["areas"][0]["area_classification"] in {
        "Priority Search Area",
        "Strong Search Area",
        "Emerging Search Area",
        "Mixed Evidence",
        "Limited Current Signal",
        "Insufficient Information",
    }
    assert "why_it_surfaced" in response["areas"][0]
    assert "_sort" not in text
    assert "all available properties" not in text


def test_underwriting_prefill_preserves_manual_overrides(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.investment_underwriting_service.build_parcel_research_context",
        lambda *_args, **_kwargs: {"identity": {"approximate_acreage": 52}, "parcel_fundamentals": {}},
    )
    monkeypatch.setattr(
        "app.services.investment_opportunity_feed_service.get_opportunity",
        lambda *_args, **_kwargs: {"asking_price": 2_600_000, "acreage": 52},
    )
    monkeypatch.setattr(
        "app.services.investment_underwriting_service._template_by_id",
        lambda *_args, **_kwargs: DEFAULT_TEMPLATES[0],
    )

    result = prefill_underwriting(
        SimpleNamespace(),
        InvestmentUnderwritingPrefillRequest(
            parcel_id="P1",
            opportunity_id="cfs-P1",
            scenario_type="development_land",
            template_id="dev-residential",
            existing_assumptions={"scenario_site_area": 40},
        ),
        ROWS,
    )

    assert result["assumptions"]["scenario_site_area"] == 40
    assert result["field_sources"]["scenario_site_area"] == "Manual analyst override"
    assert result["assumptions"]["asking_price"] == 2_600_000
    assert "utility_capacity" in result["prefill_summary"]["fields_requiring_professional_verification"]


def test_consulting_intents_route_to_new_workbench_context() -> None:
    assert ai_search_service._investment_intent("Find parcels matching this engagement's must-have criteria.") == "Consulting Engagement"
    assert ai_search_service._investment_intent("Which areas should I investigate for a 50-acre industrial site?") == "Area Opportunity Radar"
    assert ai_search_service._investment_intent("Show available opportunities inside the top search areas.") == "Opportunity Feed"
    assert ai_search_service._investment_intent("Start a land-banking scenario.") == "Underwriting"


def test_opportunity_workbench_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    engagement = {
        "id": "E1",
        "engagement_name": "Client search",
        "selected_strategy": "development_land",
        "engagement_status": "Draft",
        "brief": {},
        "criteria": [],
        "shortlist": [],
        "portfolio_summary": {"shortlist_count": 0},
    }
    report = {
        "as_of": "2026-07-14T00:00:00Z",
        "brand": "CFS Investment",
        "candidate_id": None,
        "limitations": ["Screening-level only."],
        "parcel_id": None,
        "purpose": "Screening-level consulting report.",
        "report_bucket_item": {"title": "Report", "type": "investment_report", "summary": "Summary", "content": "Body", "caveats": []},
        "report_title": "Report",
        "report_type": "site_selection_screening_report",
        "sections": [{"id": "summary", "title": "Summary", "body": "Body", "sources": [{}], "limitations": []}],
        "strategy": "development_land",
    }
    monkeypatch.setattr(investment_router, "_investment_rows", lambda db: ROWS)
    monkeypatch.setattr(investment_router, "opportunity_sources", lambda: {"count": 1, "sources": []})
    monkeypatch.setattr(investment_router, "list_opportunities", lambda db, rows, filters=None: {"count": 1, "opportunities": [{"external_opportunity_id": "cfs-P1"}]})
    monkeypatch.setattr(investment_router, "refresh_opportunities", lambda source_id=None: {"status": "ok"})
    monkeypatch.setattr(investment_router, "match_opportunity", lambda db, opportunity_id, rows, request: {"parcel_match_status": "Matched"})
    monkeypatch.setattr(investment_router, "opportunity_to_intake", lambda db, opportunity_id, rows, request: {"id": "C1", "parcel_id": "P1"})
    monkeypatch.setattr(investment_router, "radar_search", lambda rows, **kwargs: {"count": 1, "areas": [{"area_id": "kannapolis"}]})
    monkeypatch.setattr(investment_router, "radar_area", lambda rows, area_id, **kwargs: {"area_id": area_id})
    monkeypatch.setattr(investment_router, "radar_area_parcels", lambda rows, area_id, **kwargs: {"count": 1, "parcels": rows})
    monkeypatch.setattr(investment_router, "radar_area_opportunities", lambda db, rows, area_id: {"count": 0, "opportunities": []})
    monkeypatch.setattr(investment_router, "list_engagements", lambda db: {"count": 1, "engagements": [engagement]})
    monkeypatch.setattr(investment_router, "create_engagement", lambda db, payload: engagement)
    monkeypatch.setattr(investment_router, "get_engagement", lambda db, engagement_id: engagement)
    monkeypatch.setattr(investment_router, "update_engagement", lambda db, engagement_id, patch: engagement)
    monkeypatch.setattr(investment_router, "delete_engagement", lambda db, engagement_id: True)
    monkeypatch.setattr(investment_router, "set_criteria", lambda db, engagement_id, request: {**engagement, "criteria": request.criteria})
    monkeypatch.setattr(investment_router, "add_shortlist_item", lambda db, engagement_id, request: {**engagement, "shortlist": [request.model_dump()]})
    monkeypatch.setattr(investment_router, "engagement_report", lambda db, engagement_id: report)
    monkeypatch.setattr(investment_router, "list_underwriting_templates", lambda db: {"count": 1, "templates": [DEFAULT_TEMPLATES[0]]})
    monkeypatch.setattr(investment_router, "create_underwriting_template", lambda db, payload: {**payload.model_dump(), "id": "T1"})
    monkeypatch.setattr(investment_router, "prefill_underwriting", lambda db, request, rows: {"assumptions": {"asking_price": 1}, "field_sources": {"asking_price": "Third-party or user-entered opportunity reference"}})

    try:
        assert client.get("/investment/opportunities/sources").json()["count"] == 1
        assert client.get("/investment/opportunities").json()["count"] == 1
        assert client.post("/investment/opportunities/refresh", json={}).json()["status"] == "ok"
        assert client.post("/investment/opportunities/cfs-P1/match", json={"parcel_id": "P1"}).json()["parcel_match_status"] == "Matched"
        assert client.post("/investment/opportunities/cfs-P1/intake", json={"strategy": "development_land"}).json()["id"] == "C1"
        assert client.post("/investment/radar/search", json={"strategy": "industrial_site"}).json()["count"] == 1
        assert client.get("/investment/radar/areas/kannapolis").json()["area_id"] == "kannapolis"
        assert client.get("/investment/radar/areas/kannapolis/parcels").json()["count"] == 1
        assert client.get("/investment/radar/areas/kannapolis/opportunities").json()["count"] == 0
        assert client.get("/investment/engagements").json()["count"] == 1
        assert client.post("/investment/engagements", json={"engagement_name": "Client search"}).json()["id"] == "E1"
        assert client.get("/investment/engagements/E1").json()["id"] == "E1"
        assert client.patch("/investment/engagements/E1", json={"timeline": "Q3"}).json()["id"] == "E1"
        assert client.post("/investment/engagements/E1/criteria", json={"criteria": [{"type": "Must Have", "criterion": "50 acres"}]}).json()["criteria"]
        assert client.post("/investment/engagements/E1/shortlist", json={"item_id": "P1", "item_type": "parcel"}).json()["shortlist"]
        assert client.post("/investment/engagements/E1/report").json()["brand"] == "CFS Investment"
        assert client.get("/investment/underwriting/templates").json()["count"] == 1
        assert client.post("/investment/underwriting/templates", json={"template_name": "Custom", "scenario_type": "development_land"}).json()["id"] == "T1"
        assert client.post("/investment/underwriting/prefill", json={"scenario_type": "development_land", "parcel_id": "P1"}).json()["assumptions"]["asking_price"] == 1
        assert client.delete("/investment/engagements/E1").json()["deleted"] is True
    finally:
        app.dependency_overrides.clear()
