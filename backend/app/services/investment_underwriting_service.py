"""Deterministic underwriting calculations for CFS Investment."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from math import isfinite
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.investment_underwriting import (
    InvestmentUnderwritingCalculateRequest,
    InvestmentUnderwritingScenarioPatch,
    InvestmentUnderwritingScenarioPayload,
)
from app.services.investment_research_context_service import build_intake_research_context, build_parcel_research_context
from app.services.investment_screening_service import SAFE_CAVEAT

UNDERWRITING_TABLE = "investment_underwriting_scenario"
SCENARIO_LABELS = {
    "development_land": "Development Land",
    "land_banking": "Long-Term Land Banking",
    "entitlement_repositioning": "Entitlement / Repositioning",
    "existing_use_acquisition": "Existing-Use Acquisition",
}


def calculate_underwriting(
    request: InvestmentUnderwritingCalculateRequest,
    *,
    research_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    assumptions = _clean_assumptions(request.assumptions)
    warnings = _input_warnings(request.assumptions)
    results = _calculate_results(request.scenario_type, assumptions, warnings, research_context)
    sensitivity = _sensitivity(request, assumptions, research_context)
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "brand": "CFS Investment",
        "scenario_name": request.scenario_name,
        "scenario_type": request.scenario_type,
        "scenario_type_label": SCENARIO_LABELS[request.scenario_type],
        "strategy": request.strategy,
        "parcel_id": request.parcel_id,
        "candidate_id": request.candidate_id,
        "assumptions": assumptions,
        "assumption_evidence": _assumption_evidence(assumptions),
        "results": results,
        "sensitivity": sensitivity,
        "research_context_summary": _research_summary(research_context),
        "missing_inputs": results["missing_inputs"],
        "warnings": list(dict.fromkeys(warnings + results["warnings"])),
        "limitations": [
            SAFE_CAVEAT,
            "Underwriting outputs are modeled scenario calculations based on user-entered assumptions.",
            "CFS does not provide investment advice, appraisal conclusions, financing commitments, or guarantees of future value.",
        ],
    }


def list_underwriting_scenarios(db: Session) -> dict[str, Any]:
    _ensure_table(db)
    rows = [_serialize(row) for row in db.execute(text(f"SELECT * FROM {UNDERWRITING_TABLE} ORDER BY updated_at DESC LIMIT 250")).mappings()]
    return {"count": len(rows), "scenarios": rows, "caveats": [SAFE_CAVEAT]}


def create_underwriting_scenario(
    db: Session,
    payload: InvestmentUnderwritingScenarioPayload,
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    _ensure_table(db)
    result = _calculate_with_context(db, payload, investment_rows)
    now = datetime.now(UTC)
    scenario_id = str(uuid4())
    db.execute(
        text(
            f"""
            INSERT INTO {UNDERWRITING_TABLE} (
                id, scenario_name, parcel_id, candidate_id, scenario_type, strategy,
                assumptions_json, results_json, scenario_status, private_notes,
                created_at, updated_at, last_calculated_at
            ) VALUES (
                :id, :scenario_name, :parcel_id, :candidate_id, :scenario_type, :strategy,
                CAST(:assumptions_json AS jsonb), CAST(:results_json AS jsonb), :scenario_status, :private_notes,
                :created_at, :updated_at, :last_calculated_at
            )
            """
        ),
        _row_values(scenario_id, payload, result, now),
    )
    return get_underwriting_scenario(db, scenario_id) or {}


def get_underwriting_scenario(db: Session, scenario_id: str) -> dict[str, Any] | None:
    _ensure_table(db)
    row = db.execute(text(f"SELECT * FROM {UNDERWRITING_TABLE} WHERE id = :id"), {"id": scenario_id}).mappings().first()
    return _serialize(row) if row else None


def update_underwriting_scenario(
    db: Session,
    scenario_id: str,
    patch: InvestmentUnderwritingScenarioPatch,
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    current = get_underwriting_scenario(db, scenario_id)
    if not current:
        return None
    merged = {**current, **patch.model_dump(exclude_unset=True)}
    payload = InvestmentUnderwritingScenarioPayload(
        assumptions=merged.get("assumptions") or {},
        candidate_id=merged.get("candidate_id"),
        parcel_id=merged.get("parcel_id"),
        private_notes=merged.get("private_notes"),
        scenario_name=merged.get("scenario_name") or "Underwriting Scenario",
        scenario_status=merged.get("scenario_status") or "Draft",
        scenario_type=merged.get("scenario_type") or "development_land",
        strategy=merged.get("strategy") or "development_land",
    )
    result = _calculate_with_context(db, payload, investment_rows)
    values = _row_values(scenario_id, payload, result, datetime.now(UTC))
    db.execute(
        text(
            f"""
            UPDATE {UNDERWRITING_TABLE}
               SET scenario_name = :scenario_name,
                   parcel_id = :parcel_id,
                   candidate_id = :candidate_id,
                   scenario_type = :scenario_type,
                   strategy = :strategy,
                   assumptions_json = CAST(:assumptions_json AS jsonb),
                   results_json = CAST(:results_json AS jsonb),
                   scenario_status = :scenario_status,
                   private_notes = :private_notes,
                   updated_at = :updated_at,
                   last_calculated_at = :last_calculated_at
             WHERE id = :id
            """
        ),
        values,
    )
    return get_underwriting_scenario(db, scenario_id)


def delete_underwriting_scenario(db: Session, scenario_id: str) -> bool:
    _ensure_table(db)
    result = db.execute(text(f"DELETE FROM {UNDERWRITING_TABLE} WHERE id = :id"), {"id": scenario_id})
    return bool(result.rowcount)


def calculate_saved_underwriting_scenario(
    db: Session,
    scenario_id: str,
    investment_rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    scenario = get_underwriting_scenario(db, scenario_id)
    if not scenario:
        return None
    payload = InvestmentUnderwritingScenarioPayload(
        assumptions=scenario.get("assumptions") or {},
        candidate_id=scenario.get("candidate_id"),
        parcel_id=scenario.get("parcel_id"),
        private_notes=scenario.get("private_notes"),
        scenario_name=scenario["scenario_name"],
        scenario_status=scenario["scenario_status"],
        scenario_type=scenario["scenario_type"],
        strategy=scenario["strategy"],
    )
    return update_underwriting_scenario(db, scenario_id, InvestmentUnderwritingScenarioPatch(**payload.model_dump()), investment_rows)


def compare_underwriting_scenarios(db: Session, scenario_ids: list[str]) -> dict[str, Any]:
    scenarios = [scenario for scenario_id in scenario_ids if (scenario := get_underwriting_scenario(db, scenario_id))]
    return {
        "caveats": [SAFE_CAVEAT, "Scenario comparison shows modeled tradeoffs only and does not declare a winner."],
        "count": len(scenarios),
        "scenarios": scenarios,
        "summary": [
            f"{scenario['scenario_name']}: {scenario['scenario_type_label']} with total cost {scenario['results'].get('total_project_cost') or scenario['results'].get('total_basis_at_exit') or scenario['results'].get('total_basis_after_entitlement') or 'not available'} and return context {scenario['results'].get('scenario_return') or scenario['results'].get('scenario_irr') or 'not available'}."
            for scenario in scenarios
        ],
    }


def _calculate_with_context(db: Session, payload: InvestmentUnderwritingScenarioPayload, investment_rows: list[dict[str, Any]]) -> dict[str, Any]:
    context = None
    if payload.candidate_id:
        context = build_intake_research_context(db, investment_rows, payload.candidate_id)
    elif payload.parcel_id:
        context = build_parcel_research_context(db, investment_rows, payload.parcel_id, strategy=payload.strategy)
    return calculate_underwriting(payload, research_context=context)


def _calculate_results(
    scenario_type: str,
    assumptions: dict[str, float],
    warnings: list[str],
    research_context: dict[str, Any] | None,
) -> dict[str, Any]:
    if scenario_type == "development_land":
        return _development_land(assumptions, warnings)
    if scenario_type == "land_banking":
        return _land_banking(assumptions, warnings, research_context)
    if scenario_type == "entitlement_repositioning":
        return _entitlement(assumptions, warnings)
    return _existing_use(assumptions, warnings)


def _development_land(a: dict[str, float], base_warnings: list[str]) -> dict[str, Any]:
    units = a.get("scenario_unit_count")
    sf = a.get("scenario_building_area")
    acquisition = _acquisition_cost(a)
    site = _sum(a, "site_preparation_cost", "grading_cost", "road_improvement_cost", "utility_extension_cost", "stormwater_cost", "environmental_mitigation_cost")
    vertical = a.get("vertical_construction_cost", 0)
    soft_before_contingency = _sum(a, "professional_fees", "permit_and_impact_fees", "marketing_and_sales_cost", "developer_overhead")
    contingency = _rate(a.get("contingency_percent")) * (acquisition + site + vertical + soft_before_contingency)
    financing = _sum(a, "financing_cost", "financing_fee")
    total = acquisition + site + vertical + soft_before_contingency + contingency + financing
    revenue = _development_revenue(a, units, sf)
    missing = _missing(a, ("scenario_unit_count", "scenario_building_area"), any_one=True) + _missing(a, ("sale_price_per_unit", "sale_price_per_square_foot", "rent_per_unit", "rent_per_square_foot"), any_one=True)
    margin = revenue - total if revenue is not None else None
    duration = max((a.get("entitlement_period_months", 0) + a.get("construction_period_months", 0) + a.get("absorption_period_months", 0)) / 12, 1)
    return _result(
        {
            "total_acquisition_cost": _round(acquisition),
            "total_site_and_infrastructure_cost": _round(site),
            "total_vertical_cost": _round(vertical),
            "total_soft_cost": _round(soft_before_contingency + contingency),
            "total_financing_cost": _round(financing),
            "total_project_cost": _round(total),
            "cost_per_unit": _round(total / units) if units else None,
            "cost_per_square_foot": _round(total / sf) if sf else None,
            "estimated_scenario_revenue": _round(revenue),
            "estimated_scenario_margin": _round(margin),
            "break_even_sale_price": _round(total / units) if units else None,
            "break_even_rent": _round((total * _rate(a.get("exit_cap_rate"))) / units / 12) if units and a.get("exit_cap_rate") else None,
            "unlevered_return_context": _percent(margin / total) if margin is not None and total else None,
            "levered_return_context": "Financing assumptions incomplete" if not a.get("loan_amount") else _percent(margin / max(total - a.get("loan_amount", 0), 1)) if margin is not None else None,
            "equity_multiple": _round(revenue / total) if revenue is not None and total else None,
            "scenario_irr": _percent(_irr([-total, revenue or 0], duration_years=duration)) if revenue is not None and total else None,
        },
        missing,
        base_warnings,
    )


def _land_banking(a: dict[str, float], base_warnings: list[str], context: dict[str, Any] | None) -> dict[str, Any]:
    acres = a.get("scenario_site_area") or _context_acres(context)
    basis = a.get("acquisition_basis") or _basis(a)
    closing = basis * _rate(a.get("closing_cost_percent"))
    years = int(a.get("holding_period_years") or 0)
    annual = _sum(a, "annual_property_tax_assumption", "annual_insurance_assumption", "annual_land_management_cost", "annual_legal_or_compliance_cost", "annual_other_holding_cost")
    growth = _rate(a.get("annual_cost_growth_rate"))
    holding_cost = sum(annual * ((1 + growth) ** year) for year in range(years))
    total_basis = basis + closing + holding_cost
    exit_price = a.get("exit_price_scenario") or ((a.get("exit_price_per_acre_scenario") or 0) * (acres or 0))
    selling = exit_price * _rate(a.get("selling_cost_percent"))
    net_exit = exit_price - selling
    cash_flows = [-(basis + closing), *[-annual * ((1 + growth) ** year) for year in range(years)], net_exit]
    gain = net_exit - total_basis if exit_price else None
    return _result(
        {
            "total_holding_cost": _round(holding_cost),
            "total_basis_at_exit": _round(total_basis),
            "break_even_exit_price": _round(total_basis / max(1 - _rate(a.get("selling_cost_percent")), 0.0001)),
            "break_even_exit_price_per_acre": _round(total_basis / acres) if acres else None,
            "scenario_gain_or_loss": _round(gain),
            "scenario_equity_multiple": _round(net_exit / max(basis + closing + holding_cost, 1)) if exit_price else None,
            "scenario_irr": _percent(_irr(cash_flows)) if exit_price and years else None,
        },
        _missing(a, ("acquisition_basis", "purchase_price", "negotiated_price", "asking_price"), any_one=True) + _missing(a, ("holding_period_years", "exit_price_scenario", "exit_price_per_acre_scenario")),
        base_warnings,
    )


def _entitlement(a: dict[str, float], base_warnings: list[str]) -> dict[str, Any]:
    basis = a.get("acquisition_basis") or _basis(a)
    entitlement = _sum(a, "entitlement_cost", "planning_consultant_cost", "legal_cost", "engineering_cost", "application_and_review_fees", "environmental_review_cost")
    contingency = _rate(a.get("contingency_percent") or a.get("contingency")) * entitlement
    total_entitlement = entitlement + contingency
    total_basis = basis + total_entitlement
    exit_basis = a.get("post_entitlement_exit_basis") or a.get("development_partner_sale_basis")
    gain = exit_basis - total_basis if exit_basis else None
    return _result(
        {
            "total_pre_entitlement_basis": _round(basis),
            "total_entitlement_cost": _round(total_entitlement),
            "total_basis_after_entitlement": _round(total_basis),
            "break_even_post_entitlement_value": _round(total_basis),
            "scenario_gain_or_loss": _round(gain),
            "scenario_return": _percent(gain / total_basis) if gain is not None and total_basis else None,
            "major_entitlement_sensitivities": ["Timeline", "consultant/legal/engineering cost", "post-entitlement exit basis"],
        },
        _missing(a, ("acquisition_basis", "purchase_price", "negotiated_price", "asking_price"), any_one=True) + _missing(a, ("holding_period", "post_entitlement_exit_basis", "development_partner_sale_basis")),
        base_warnings,
    )


def _existing_use(a: dict[str, float], base_warnings: list[str]) -> dict[str, Any]:
    price = _basis(a)
    gpi = a.get("gross_potential_income")
    vacancy = gpi * _rate(a.get("vacancy_and_credit_loss")) if gpi is not None else 0
    egi = a.get("effective_gross_income") or ((gpi or 0) - vacancy + a.get("other_income", 0))
    expenses = a.get("operating_expenses", 0) + a.get("capital_reserves", 0)
    noi = a.get("net_operating_income") or (egi - expenses if egi else None)
    loan = a.get("loan_amount") or (price * _rate(a.get("loan_to_value")) if price and a.get("loan_to_value") else 0)
    debt = _annual_debt_service(loan, _rate(a.get("interest_rate")), int(a.get("amortization_years") or 0), a.get("interest_only_period", 0) > 0)
    holding = int(a.get("holding_period") or a.get("holding_period_years") or 0)
    exit_noi = (noi or 0) * ((1 + _rate(a.get("annual_income_growth"))) ** holding)
    exit_value = exit_noi / _rate(a.get("exit_cap_rate")) if a.get("exit_cap_rate") and noi is not None else None
    sale_cost = (exit_value or 0) * _rate(a.get("sale_cost") or a.get("selling_cost_percent"))
    cash_flow = (noi or 0) - debt
    equity = max(price - loan + price * _rate(a.get("closing_cost_percent")) + a.get("capital_improvement_plan", 0), 0)
    cash_flows = [-equity, *[cash_flow for _ in range(max(holding - 1, 0))], cash_flow + (exit_value or 0) - sale_cost - loan]
    return _result(
        {
            "net_operating_income": _round(noi),
            "going_in_cap_rate": _percent(noi / price) if noi is not None and price else None,
            "debt_service": _round(debt),
            "debt_service_coverage_ratio": _round(noi / debt) if noi is not None and debt else None,
            "cash_flow_before_tax": _round(cash_flow) if noi is not None else None,
            "cash_on_cash_return": _percent(cash_flow / equity) if equity and noi is not None else None,
            "break_even_occupancy": _percent((expenses + debt) / gpi) if gpi else None,
            "exit_value_scenario": _round(exit_value),
            "equity_multiple": _round(((sum(cash_flows[1:]) if len(cash_flows) > 1 else 0) / equity)) if equity and exit_value else None,
            "levered_irr": _percent(_irr(cash_flows)) if equity and exit_value and holding else None,
            "unlevered_irr": _percent(_irr([-price, *[(noi or 0) for _ in range(max(holding - 1, 0))], (noi or 0) + (exit_value or 0) - sale_cost])) if price and exit_value and holding else None,
        },
        _missing(a, ("purchase_price", "negotiated_price", "asking_price"), any_one=True) + _missing(a, ("gross_potential_income", "effective_gross_income", "net_operating_income"), any_one=True) + _missing(a, ("exit_cap_rate", "holding_period")),
        base_warnings + _loan_warnings(a, price, loan),
    )


def _result(values: dict[str, Any], missing: list[str], warnings: list[str]) -> dict[str, Any]:
    return {
        **values,
        "missing_inputs": list(dict.fromkeys(missing)),
        "warnings": list(dict.fromkeys(warnings)),
        "evidence_label": "Calculated result",
        "scenario_interpretation": "Modeled scenario result based on user-entered assumptions; due diligence required.",
    }


def _sensitivity(request: InvestmentUnderwritingCalculateRequest, assumptions: dict[str, float], context: dict[str, Any] | None) -> dict[str, Any]:
    pairs = {
        "development_land": ("sale_price_per_unit", "vertical_construction_cost"),
        "land_banking": ("holding_period_years", "exit_price_scenario"),
        "entitlement_repositioning": ("entitlement_cost", "post_entitlement_exit_basis"),
        "existing_use_acquisition": ("interest_rate", "purchase_price"),
    }
    left, right = pairs[request.scenario_type]
    if left not in assumptions or right not in assumptions:
        return {"status": "Missing sensitivity inputs", "variables": [left, right], "matrix": []}
    matrix = []
    for l_factor in (0.9, 1.0, 1.1):
        row = []
        for r_factor in (0.9, 1.0, 1.1):
            next_assumptions = {**assumptions, left: assumptions[left] * l_factor, right: assumptions[right] * r_factor}
            result = _calculate_results(request.scenario_type, next_assumptions, _input_warnings(next_assumptions), context)
            row.append(result.get("scenario_irr") or result.get("scenario_return") or result.get("estimated_scenario_margin") or result.get("scenario_gain_or_loss"))
        matrix.append({"variable_value": _round(assumptions[left] * l_factor), "outcomes": row})
    return {"status": "Calculated", "variables": [left, right], "matrix": matrix}


def _ensure_table(db: Session) -> None:
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {UNDERWRITING_TABLE} (
                id text PRIMARY KEY,
                scenario_name text NOT NULL,
                parcel_id text,
                candidate_id text,
                scenario_type text NOT NULL,
                strategy text NOT NULL,
                assumptions_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                results_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                scenario_status text NOT NULL DEFAULT 'Draft',
                private_notes text,
                created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL,
                last_calculated_at timestamptz
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{UNDERWRITING_TABLE}_parcel ON {UNDERWRITING_TABLE}(parcel_id)"))
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{UNDERWRITING_TABLE}_candidate ON {UNDERWRITING_TABLE}(candidate_id)"))


def _row_values(scenario_id: str, payload: InvestmentUnderwritingScenarioPayload, result: dict[str, Any], now: datetime) -> dict[str, Any]:
    return {
        "id": scenario_id,
        "scenario_name": payload.scenario_name,
        "parcel_id": payload.parcel_id,
        "candidate_id": payload.candidate_id,
        "scenario_type": payload.scenario_type,
        "strategy": payload.strategy,
        "assumptions_json": json.dumps(result["assumptions"]),
        "results_json": json.dumps(result),
        "scenario_status": payload.scenario_status,
        "private_notes": payload.private_notes,
        "created_at": now,
        "updated_at": now,
        "last_calculated_at": now,
    }


def _serialize(row: Any) -> dict[str, Any]:
    if not row:
        return {}
    data = dict(row)
    results = data.pop("results_json", {}) or {}
    assumptions = data.pop("assumptions_json", {}) or {}
    if isinstance(results, str):
        results = json.loads(results)
    if isinstance(assumptions, str):
        assumptions = json.loads(assumptions)
    return {
        **data,
        "assumptions": assumptions,
        "results": results.get("results", results),
        "calculation": results,
        "scenario_type_label": SCENARIO_LABELS.get(data.get("scenario_type"), data.get("scenario_type")),
        "limitations": results.get("limitations", [SAFE_CAVEAT]) if isinstance(results, dict) else [SAFE_CAVEAT],
    }


def _clean_assumptions(values: dict[str, Any]) -> dict[str, float]:
    cleaned: dict[str, float] = {}
    for key, value in values.items():
        if value in (None, ""):
            continue
        if isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if isfinite(number):
            cleaned[key] = number
    return cleaned


def _input_warnings(a: dict[str, Any]) -> list[str]:
    warnings = []
    for key, value in a.items():
        number = _number(value)
        if number is None:
            continue
        if number < 0:
            warnings.append(f"{key} is negative; verify this assumption.")
        if key in {"closing_cost_percent", "contingency_percent", "loan_to_value", "selling_cost_percent", "vacancy_and_credit_loss"} and number > 100:
            warnings.append(f"{key} is above 100%; verify this percentage assumption.")
    if _number(a.get("scenario_site_area")) == 0:
        warnings.append("Scenario site area cannot be zero for per-acre interpretation.")
    acquisition_date = _date_value(a.get("acquisition_date"))
    analysis_start_date = _date_value(a.get("analysis_start_date"))
    exit_date = _date_value(a.get("exit_date"))
    if a.get("acquisition_date") and acquisition_date is None:
        warnings.append("acquisition_date is invalid; use ISO date format.")
    if a.get("analysis_start_date") and analysis_start_date is None:
        warnings.append("analysis_start_date is invalid; use ISO date format.")
    if a.get("exit_date") and exit_date is None:
        warnings.append("exit_date is invalid; use ISO date format.")
    if acquisition_date and analysis_start_date and analysis_start_date < acquisition_date:
        warnings.append("Analysis start date appears earlier than acquisition date.")
    if acquisition_date and exit_date and exit_date < acquisition_date:
        warnings.append("Exit date appears earlier than acquisition date.")
    return warnings


def _missing(a: dict[str, float], keys: tuple[str, ...], *, any_one: bool = False) -> list[str]:
    if any_one:
        return [] if any(key in a and a[key] > 0 for key in keys) else [f"One of {', '.join(keys)}"]
    return [key for key in keys if key not in a or a[key] <= 0]


def _assumption_evidence(a: dict[str, float]) -> dict[str, str]:
    return {key: "User-entered assumption" for key in a}


def _research_summary(context: dict[str, Any] | None) -> dict[str, Any]:
    if not context:
        return {"status": "Research context unavailable", "evidence_type": "Missing or unverified"}
    return {
        "parcel_id": (context.get("identity") or {}).get("parcel_id"),
        "development_readiness": (context.get("development_readiness") or {}).get("candidate_band"),
        "utility_context": context.get("utility_context"),
        "market_area_context": context.get("market_area_context"),
        "environmental_context": context.get("environmental_context"),
        "evidence_type": "CFS evidence and CFS-derived proxy",
    }


def _acquisition_cost(a: dict[str, float]) -> float:
    basis = a.get("land_acquisition_cost") or _basis(a)
    return basis + basis * _rate(a.get("closing_cost_percent")) + _sum(a, "due_diligence_cost", "legal_cost", "survey_cost", "environmental_review_cost", "initial_capital_improvement")


def _basis(a: dict[str, float]) -> float:
    return a.get("negotiated_price") or a.get("purchase_price") or a.get("asking_price") or a.get("acquisition_basis") or a.get("land_acquisition_cost") or 0


def _development_revenue(a: dict[str, float], units: float | None, sf: float | None) -> float | None:
    if units and a.get("sale_price_per_unit"):
        return units * a["sale_price_per_unit"]
    if sf and a.get("sale_price_per_square_foot"):
        return sf * a["sale_price_per_square_foot"]
    if units and a.get("rent_per_unit") and a.get("exit_cap_rate"):
        return (units * a["rent_per_unit"] * 12) / _rate(a["exit_cap_rate"])
    if sf and a.get("rent_per_square_foot") and a.get("exit_cap_rate"):
        return (sf * a["rent_per_square_foot"]) / _rate(a["exit_cap_rate"])
    return None


def _annual_debt_service(loan: float, rate: float, amortization_years: int, interest_only: bool) -> float:
    if loan <= 0 or rate <= 0:
        return 0
    if interest_only or amortization_years <= 0:
        return loan * rate
    monthly = rate / 12
    months = amortization_years * 12
    return (loan * monthly / (1 - (1 + monthly) ** -months)) * 12


def _loan_warnings(a: dict[str, float], price: float, loan: float) -> list[str]:
    warnings = []
    ltv = _rate(a.get("loan_to_value"))
    if price and loan and ltv and abs(loan - price * ltv) > max(1, price * 0.02):
        warnings.append("Loan amount and loan-to-value assumptions are inconsistent; verify financing inputs.")
    if price and loan > price:
        warnings.append("Loan amount is above purchase price; verify financing assumptions.")
    return warnings


def _context_acres(context: dict[str, Any] | None) -> float | None:
    value = ((context or {}).get("identity") or {}).get("approximate_acreage")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _sum(a: dict[str, float], *keys: str) -> float:
    return sum(a.get(key, 0) for key in keys)


def _rate(value: float | None) -> float:
    if value is None:
        return 0
    return value / 100 if abs(value) > 1 else value


def _round(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _percent(value: Any) -> str | None:
    rounded = _round(float(value) * 100) if value is not None else None
    return f"{rounded:.2f}%" if rounded is not None else None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None


def _date_value(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _irr(cash_flows: list[float], *, duration_years: float | None = None) -> float | None:
    if not cash_flows or not any(v < 0 for v in cash_flows) or not any(v > 0 for v in cash_flows):
        return None
    if duration_years and len(cash_flows) == 2:
        initial, terminal = cash_flows
        if initial >= 0 or terminal <= 0:
            return None
        return (terminal / abs(initial)) ** (1 / duration_years) - 1
    low, high = -0.99, 10.0
    for _ in range(100):
        mid = (low + high) / 2
        npv = sum(value / ((1 + mid) ** period) for period, value in enumerate(cash_flows))
        if abs(npv) < 0.0001:
            return mid
        if npv > 0:
            low = mid
        else:
            high = mid
    return (low + high) / 2
