from fastapi.testclient import TestClient

from app.dependencies.database import get_read_only_db
from app.main import app
from app.routers import economics_router
from app.routers.economics_router import (
    _economics_signal,
    _opportunity_class_breakdown,
    _unavailable_payload,
    calculate_improvement_to_land_ratio,
    calculate_value_per_acre,
    estimate_county_tax,
)
from app.services.enterprise_export_service import (
    build_enterprise_export_payload,
    build_powerbi_export_payload,
)


client = TestClient(app)


def test_economics_screening_calculations_are_transparent() -> None:
    assert calculate_value_per_acre(500_000, 2) == 250_000
    assert calculate_value_per_acre(500_000, 0) is None
    assert calculate_improvement_to_land_ratio(200_000, 400_000) == 0.5
    assert calculate_improvement_to_land_ratio(200_000, 0) is None
    assert estimate_county_tax(500_000, 0.57) == 2850


def test_economics_missing_fields_return_data_needed_schema() -> None:
    payload = _unavailable_payload("2026-01-01T00:00:00+00:00", "Parcel value fields unavailable.")

    assert payload["mode"] == "live"
    assert payload["summary"]["total_parcels_analyzed"] == 0
    assert payload["summary"]["data_needed_count"] == 1
    assert payload["kpis"]
    assert payload["parcel_economic_signals"] == []
    assert payload["underbuilt_watchlist"] == []
    assert payload["opportunity_class_breakdown"] == []
    assert payload["jurisdiction_value_summary"] == []
    assert payload["scenario_inputs"]
    assert payload["scenario_outputs"]
    assert {
        "estimated_tax_base_lift_band",
        "revenue_per_acre_band",
        "service_burden_band",
        "infrastructure_burden_band",
        "constraint_adjusted_opportunity_band",
        "data_confidence",
    }.issubset(payload["scenario_outputs"][0])
    assert payload["watchlist"] == []
    assert "formal appraisal" in " ".join(payload["caveats"])


def test_economics_signal_uses_bands_and_excludes_contact_fields() -> None:
    signal = _economics_signal(
        {
            "acreage": 2,
            "assessed_value": 500_000,
            "geography_label": "Demo corridor",
            "improvement_to_land_ratio": 0.4,
            "improvement_value": 100_000,
            "land_value": 250_000,
            "official_parcel_id": "demo-1",
            "permit_activity_context": "Recent observed permit activity",
            "value_per_acre": 250_000,
        },
        0.57,
    )

    assert signal["estimated_county_tax"] == 2850
    assert signal["estimated_county_tax_screening"] == 2850
    assert signal["economic_data_confidence"] == "strong"
    assert signal["economic_status_band"] == "underbuilt_watch"
    assert signal["opportunity_class"] == "Underbuilt Redevelopment Candidate"
    assert "owner" not in str(signal).lower()
    assert "mailing" not in str(signal).lower()


def test_economics_signal_handles_missing_denominators_and_class_bands() -> None:
    data_needed = _economics_signal(
        {
            "acreage": None,
            "assessed_value": 500_000,
            "geography_label": "Incomplete parcel",
            "improvement_value": None,
            "land_value": None,
            "official_parcel_id": "demo-missing",
            "value_per_acre": None,
        },
        0.57,
    )
    tax_base = _economics_signal(
            {
                "acreage": 2,
                "assessed_value": 200_000,
                "geography_label": "Growth area",
            "improvement_value": 125_000,
            "land_value": 75_000,
            "official_parcel_id": "demo-tax",
            "permit_activity_context": "Recent observed permit activity",
            "value_per_acre": 100_000,
        },
        0.57,
    )

    assert data_needed["economic_status_band"] == "data_needed"
    assert data_needed["opportunity_class"] == "Needs More Data Before Recommendation"
    assert data_needed["improvement_to_land_ratio"] is None
    assert tax_base["economic_status_band"] == "tax_base_opportunity"
    assert tax_base["opportunity_class"] == "Tax-Base Opportunity"
    assert _opportunity_class_breakdown([data_needed, tax_base]) == [
        {"count": 1, "opportunity_class": "Needs More Data Before Recommendation"},
        {"count": 1, "opportunity_class": "Tax-Base Opportunity"},
    ]


def test_enterprise_export_payload_has_facts_dimensions_and_decision_pack() -> None:
    payload = build_enterprise_export_payload(
        {
            "as_of": "2026-01-01T00:00:00+00:00",
            "caveats": ["Screening-level context."],
            "data_readiness": [
                {
                    "current_use": "Value baseline",
                    "data_status": "available",
                    "domain": "Parcel Value",
                    "gap_or_next_need": "None",
                }
            ],
            "kpis": [
                {
                    "id": "parcels_analyzed",
                    "label": "Parcels analyzed",
                    "status_band": "stable_high_value",
                    "unit": "parcels",
                    "value": 12,
                }
            ],
            "mode": "live",
            "scenario_templates": [
                {
                    "data_confidence": "screening",
                    "id": "current_conditions",
                    "title": "Current Conditions",
                    "what_it_tests": "Baseline",
                }
            ],
            "scenario_inputs": [
                {
                    "assumption": "Intensity band",
                    "current_value": "Medium",
                    "data_confidence": "screening",
                    "use": "Scenario model input",
                }
            ],
            "scenario_outputs": [
                {
                    "data_confidence": "screening",
                    "estimated_tax_base_lift_band": "baseline",
                    "infrastructure_burden_band": "medium",
                    "recommended_next_diligence": "Document assumptions.",
                    "revenue_per_acre_band": "moderate",
                    "scenario_id": "current_conditions",
                    "service_burden_band": "medium",
                    "title": "Current Conditions",
                }
            ],
            "signals": [
                {
                    "economic_status_band": "underbuilt_watch",
                    "estimated_county_tax": 1200,
                    "geography_label": "Demo corridor",
                    "opportunity_class": "Underbuilt Redevelopment Candidate",
                    "parcel_id": "demo-1",
                    "recommended_followup": "Review records.",
                    "value_per_acre": 100000,
                }
            ],
            "summary": {
                "median_value_per_acre": 100000,
                "source_mode": "live",
                "total_assessed_value": 500000,
            },
            "watchlist": [],
        }
    )

    exports = payload["exports"]
    assert exports["power_bi"]["kpi_fact"][0]["kpi_id"] == "parcels_analyzed"
    assert exports["power_bi"]["scenario_fact"][0]["estimated_tax_base_lift_band"] == "baseline"
    assert exports["power_bi"]["scenario_fact"][0]["revenue_per_acre_band"] == "moderate"
    assert exports["power_bi"]["dimensions"]["geography"][0]["geography_label"] == "Demo corridor"
    assert "Assessed Value" in exports["planning_model"]["measures"]
    assert {
        "measure": "Tax-Base Lift Band",
        "scenario": "Current Conditions",
        "value": "baseline",
    } in exports["planning_model"]["cells"]
    assert exports["planning_model"]["scenarios"] == ["Current Conditions"]
    assert "executive_takeaway" in exports["decision_pack"]
    assert payload["scenario_templates"][0]["title"] == "Current Conditions"
    assert payload["scenario_assumptions"][0]["assumption"] == "Intensity band"
    assert payload["scenario_output_bands"][0]["estimated_tax_base_lift_band"] == "baseline"
    assert "Scenario" in payload["planning_model_dimensions"]
    assert "Revenue per Acre Band" in payload["planning_model_measures"]
    assert "Executive takeaway" in payload["decision_pack_template"]["sections"]
    assert "owner" not in str(payload).lower()
    assert "mailing" not in str(payload).lower()


def test_enterprise_export_endpoint_returns_stable_schema(monkeypatch) -> None:
    app.dependency_overrides[get_read_only_db] = lambda: object()
    monkeypatch.setattr(
        economics_router,
        "_cached_economics_intelligence",
        lambda _db: {
            "as_of": "2026-01-01T00:00:00+00:00",
            "data_readiness": [],
            "kpis": [],
            "mode": "live",
            "scenario_templates": [],
            "signals": [],
            "summary": {"source_mode": "live"},
            "watchlist": [],
        },
    )

    try:
        response = client.get("/economics/enterprise-export")
    finally:
        app.dependency_overrides.pop(get_read_only_db, None)

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "live"
    assert set(body["exports"]) == {"decision_pack", "planning_model", "power_bi"}
    assert "kpi_fact" in body["exports"]["power_bi"]
    assert "dimensions" in body["exports"]["planning_model"]
    assert "scenario_templates" in body
    assert "scenario_output_bands" in body


def test_powerbi_export_payload_has_required_tables_and_relationships() -> None:
    payload = build_powerbi_export_payload(
        {
            "as_of": "2026-01-01T00:00:00+00:00",
            "data_readiness": [
                {
                    "current_use": "Value baseline",
                    "data_status": "available",
                    "domain": "Parcel Value",
                    "gap_or_next_need": "None",
                }
            ],
            "kpis": [
                {
                    "id": "parcels_analyzed",
                    "label": "Parcels analyzed",
                    "status_band": "stable_high_value",
                    "unit": "parcels",
                    "value": 12,
                }
            ],
            "mode": "live",
            "scenario_outputs": [
                {
                    "data_confidence": "screening",
                    "estimated_tax_base_lift_band": "baseline",
                    "infrastructure_burden_band": "medium",
                    "revenue_per_acre_band": "moderate",
                    "scenario_id": "current_conditions",
                    "service_burden_band": "medium",
                    "title": "Current Conditions",
                }
            ],
            "scenario_templates": [
                {
                    "caveats": ["Scenario values depend on assumptions."],
                    "id": "current_conditions",
                    "title": "Current Conditions",
                    "what_it_tests": "Baseline",
                }
            ],
            "signals": [
                {
                    "economic_data_confidence": "strong",
                    "economic_status_band": "underbuilt_watch",
                    "geography_label": "Demo corridor",
                    "improvement_to_land_ratio": 0.4,
                    "opportunity_class": "Underbuilt Redevelopment Candidate",
                    "parcel_id": "demo-1",
                    "recommended_followup": "Review records.",
                    "value_per_acre": 100000,
                }
            ],
            "summary": {"source_mode": "live"},
        },
        mode="live",
    )

    tables = payload["tables"]
    assert set(tables) == {
        "domain_readiness_dim",
        "economics_kpi_fact",
        "geography_dim",
        "parcel_economic_signal_fact",
        "scenario_dim",
        "scenario_output_fact",
        "time_dim",
    }
    assert tables["economics_kpi_fact"][0]["kpi_name"] == "Parcels analyzed"
    assert tables["parcel_economic_signal_fact"][0]["improvement_to_land_ratio_band"] == "low"
    assert tables["scenario_output_fact"][0]["scenario_id"] == "current_conditions"
    assert tables["scenario_dim"][0]["scenario_id"] == "current_conditions"
    assert {
        "from_table": "scenario_output_fact",
        "from_column": "scenario_id",
        "to_table": "scenario_dim",
        "to_column": "scenario_id",
    } in payload["relationships"]
    assert "owner" not in str(payload).lower()
    assert "mailing" not in str(payload).lower()


def test_powerbi_export_endpoint_returns_stable_schema(monkeypatch) -> None:
    app.dependency_overrides[get_read_only_db] = lambda: object()
    monkeypatch.setattr(
        economics_router,
        "_cached_economics_intelligence",
        lambda _db: {
            "as_of": "2026-01-01T00:00:00+00:00",
            "data_readiness": [],
            "kpis": [],
            "mode": "live",
            "scenario_outputs": [],
            "scenario_templates": [],
            "signals": [],
            "summary": {"source_mode": "live"},
        },
    )

    try:
        response = client.get("/economics/powerbi-export")
    finally:
        app.dependency_overrides.pop(get_read_only_db, None)

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "live"
    assert "tables" in body
    assert "relationships" in body
    assert "suggested_visuals" in body
