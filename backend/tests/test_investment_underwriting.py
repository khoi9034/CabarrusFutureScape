from types import SimpleNamespace
from fastapi.testclient import TestClient

from app.dependencies.database import get_db
from app.main import app
from app.routers import investment_router
from app.schemas.investment_underwriting import InvestmentUnderwritingCalculateRequest
from app.services import investment_underwriting_service as service
from app.services.investment_research_context_service import REPORT_TYPES
from app.services.investment_underwriting_service import calculate_underwriting

client = TestClient(app)


def calc(scenario_type: str, assumptions: dict) -> dict:
    return calculate_underwriting(
        InvestmentUnderwritingCalculateRequest(
            scenario_name="Safe scenario",
            scenario_type=scenario_type,
            strategy="development_land" if scenario_type != "existing_use_acquisition" else "existing_use",
            assumptions=assumptions,
        )
    )


def test_development_land_calculation_is_deterministic_and_labeled() -> None:
    result = calc(
        "development_land",
        {
            "purchase_price": 1_000_000,
            "scenario_unit_count": 20,
            "site_preparation_cost": 250_000,
            "vertical_construction_cost": 3_000_000,
            "contingency_percent": 10,
            "sale_price_per_unit": 260_000,
            "entitlement_period_months": 12,
            "construction_period_months": 18,
        },
    )

    assert result["results"]["total_project_cost"] > 0
    assert result["results"]["cost_per_unit"] > 0
    assert result["results"]["estimated_scenario_revenue"] == 5_200_000
    assert result["assumption_evidence"]["purchase_price"] == "User-entered assumption"
    assert result["results"]["evidence_label"] == "Calculated result"
    assert "not investment advice" in str(result).lower()


def test_land_banking_entitlement_and_existing_use_models() -> None:
    land = calc(
        "land_banking",
        {
            "acquisition_basis": 500_000,
            "closing_cost_percent": 2,
            "annual_property_tax_assumption": 4_000,
            "annual_insurance_assumption": 1_000,
            "holding_period_years": 5,
            "exit_price_scenario": 650_000,
            "selling_cost_percent": 3,
        },
    )
    entitlement = calc(
        "entitlement_repositioning",
        {
            "acquisition_basis": 600_000,
            "entitlement_cost": 60_000,
            "planning_consultant_cost": 35_000,
            "legal_cost": 20_000,
            "contingency_percent": 10,
            "holding_period": 2,
            "post_entitlement_exit_basis": 850_000,
        },
    )
    existing = calc(
        "existing_use_acquisition",
        {
            "purchase_price": 1_200_000,
            "gross_potential_income": 160_000,
            "vacancy_and_credit_loss": 5,
            "operating_expenses": 52_000,
            "capital_reserves": 8_000,
            "loan_to_value": 60,
            "interest_rate": 6,
            "amortization_years": 25,
            "exit_cap_rate": 7,
            "holding_period": 5,
        },
    )

    assert land["results"]["total_holding_cost"] == 25_000
    assert land["results"]["break_even_exit_price"] > land["results"]["total_basis_at_exit"]
    assert entitlement["results"]["total_basis_after_entitlement"] > 600_000
    assert entitlement["results"]["scenario_return"] is not None
    assert existing["results"]["net_operating_income"] == 92_000
    assert existing["results"]["debt_service_coverage_ratio"] is not None
    assert existing["results"]["break_even_occupancy"] is not None


def test_missing_and_invalid_assumptions_are_warnings_not_zero_filled() -> None:
    result = calc(
        "development_land",
        {
            "analysis_start_date": "2024-01-01",
            "closing_cost_percent": 125,
            "exit_date": "not-a-date",
            "acquisition_date": "2025-01-01",
            "purchase_price": -1,
            "scenario_unit_count": 0,
        },
    )
    text = str(result).lower()

    assert result["missing_inputs"]
    assert any("negative" in warning for warning in result["warnings"])
    assert any("above 100%" in warning for warning in result["warnings"])
    assert any("earlier than acquisition" in warning for warning in result["warnings"])
    assert any("invalid" in warning for warning in result["warnings"])
    assert "guaranteed return" not in text
    assert "buy this parcel" not in text
    assert "official appraisal" not in text


def test_sensitivity_matrix_uses_deterministic_results() -> None:
    result = calc(
        "land_banking",
        {
            "acquisition_basis": 100_000,
            "holding_period_years": 3,
            "exit_price_scenario": 150_000,
        },
    )

    assert result["sensitivity"]["status"] == "Calculated"
    assert len(result["sensitivity"]["matrix"]) == 3
    assert all(len(row["outcomes"]) == 3 for row in result["sensitivity"]["matrix"])


def test_underwriting_report_types_are_registered() -> None:
    for report_type in [
        "acquisition_underwriting_summary",
        "development_feasibility_review",
        "land_banking_scenario_memorandum",
        "entitlement_scenario_analysis",
        "existing_use_underwriting_summary",
        "scenario_comparison",
        "sources_and_uses",
        "sensitivity_analysis",
    ]:
        assert report_type in REPORT_TYPES


def test_underwriting_routes_are_wired(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    scenario = {
        "id": "S1",
        "scenario_name": "Route scenario",
        "scenario_type": "development_land",
        "scenario_type_label": "Development Land",
        "scenario_status": "Draft",
        "strategy": "development_land",
        "assumptions": {},
        "results": {"missing_inputs": [], "warnings": []},
    }
    monkeypatch.setattr(investment_router, "_investment_rows", lambda db: [])
    monkeypatch.setattr(investment_router, "list_underwriting_scenarios", lambda db: {"count": 1, "scenarios": [scenario]})
    monkeypatch.setattr(investment_router, "create_underwriting_scenario", lambda db, request, rows: scenario)
    monkeypatch.setattr(investment_router, "get_underwriting_scenario", lambda db, scenario_id: scenario)
    monkeypatch.setattr(investment_router, "update_underwriting_scenario", lambda db, scenario_id, request, rows: {**scenario, "scenario_status": request.scenario_status or "Draft"})
    monkeypatch.setattr(investment_router, "delete_underwriting_scenario", lambda db, scenario_id: True)
    monkeypatch.setattr(investment_router, "calculate_saved_underwriting_scenario", lambda db, scenario_id, rows: scenario)
    monkeypatch.setattr(investment_router, "compare_underwriting_scenarios", lambda db, scenario_ids: {"count": len(scenario_ids), "scenarios": [scenario], "summary": ["Tradeoffs only."]})
    try:
        assert client.get("/investment/underwriting/scenarios").json()["count"] == 1
        assert client.post("/investment/underwriting/scenarios", json={"scenario_name": "Route scenario", "assumptions": {}}).status_code == 200
        assert client.get("/investment/underwriting/scenarios/S1").json()["id"] == "S1"
        assert client.patch("/investment/underwriting/scenarios/S1", json={"scenario_status": "Archived"}).json()["scenario_status"] == "Archived"
        assert client.post("/investment/underwriting/scenarios/S1/calculate").status_code == 200
        assert client.post("/investment/underwriting/compare", json={"scenario_ids": ["S1", "S2"]}).json()["count"] == 2
        assert client.delete("/investment/underwriting/scenarios/S1").json()["deleted"] is True
    finally:
        app.dependency_overrides.clear()


def test_no_ai_provider_is_used_for_underwriting_math() -> None:
    source = service.__loader__.get_source(service.__name__)  # type: ignore[union-attr]

    assert "openai" not in source.lower()
    assert "chatcompletion" not in source.lower()
    assert "client.chat" not in source.lower()
