"""Unified CFS Investment research context and report generation."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.investment import InvestmentReportRequest, InvestmentStrategyId
from app.services.investment_environmental_context_service import candidate_environmental_context
from app.services.investment_intake_service import analyze_intake_candidate
from app.services.investment_market_context_service import candidate_market_context
from app.services.investment_screening_service import SAFE_CAVEAT, candidate_detail

UNSAFE_KEYS = {
    "owner",
    "owner_name",
    "owner_display",
    "mailing",
    "mailing_address",
    "mailing_city",
    "mailing_state",
    "grantor",
    "grantee",
    "raw_score",
    "prediction_probability",
    "exact_probability",
    "_score",
}

REPORT_TYPES: dict[str, dict[str, Any]] = {
    "land_investment_review": {"title": "Land Investment Review", "sections": ("summary", "fundamentals", "basis", "readiness", "environmental", "diligence")},
    "development_site_review": {"title": "Development Site Review", "sections": ("summary", "readiness", "planning", "utility", "environmental", "diligence")},
    "long_term_land_banking_memorandum": {"title": "Long-Term Land Banking Memorandum", "sections": ("summary", "market", "readiness", "basis", "environmental", "diligence")},
    "entitlement_repositioning_review": {"title": "Entitlement and Repositioning Review", "sections": ("summary", "planning", "readiness", "basis", "environmental", "diligence")},
    "existing_use_property_review": {"title": "Existing-Use Property Review", "sections": ("summary", "fundamentals", "basis", "market", "environmental", "diligence")},
    "market_area_report": {"title": "Market Area Report", "sections": ("summary", "market", "economic", "sources", "diligence")},
    "candidate_comparison_report": {"title": "Candidate Comparison Report", "sections": ("summary", "basis", "readiness", "market", "environmental", "diligence")},
    "due_diligence_brief": {"title": "Due-Diligence Brief", "sections": ("summary", "missing", "diligence", "sources")},
    "planning_utility_question_guide": {"title": "Planning and Utility Question Guide", "sections": ("summary", "planning", "utility", "diligence", "sources")},
    "acquisition_underwriting_summary": {"title": "Acquisition Underwriting Summary", "sections": ("summary", "basis", "underwriting", "sources")},
    "development_feasibility_review": {"title": "Development Feasibility Review", "sections": ("summary", "readiness", "underwriting", "environmental", "diligence")},
    "land_banking_scenario_memorandum": {"title": "Land Banking Scenario Memorandum", "sections": ("summary", "market", "underwriting", "diligence", "sources")},
    "entitlement_scenario_analysis": {"title": "Entitlement Scenario Analysis", "sections": ("summary", "planning", "underwriting", "diligence", "sources")},
    "existing_use_underwriting_summary": {"title": "Existing-Use Underwriting Summary", "sections": ("summary", "fundamentals", "underwriting", "market", "sources")},
    "scenario_comparison": {"title": "Scenario Comparison", "sections": ("summary", "underwriting", "missing", "sources")},
    "sources_and_uses": {"title": "Sources and Uses", "sections": ("summary", "underwriting", "sources")},
    "sensitivity_analysis": {"title": "Sensitivity Analysis", "sections": ("summary", "underwriting", "diligence")},
}


def build_parcel_research_context(
    db: Session,
    investment_rows: list[dict[str, Any]],
    parcel_id: str,
    *,
    strategy: InvestmentStrategyId = "development_land",
    candidate_id: str | None = None,
) -> dict[str, Any]:
    row = _find_row(investment_rows, parcel_id)
    screening = candidate_detail(investment_rows, parcel_id, strategy=strategy)
    intake = analyze_intake_candidate(db, candidate_id, investment_rows) if candidate_id else None
    context = _context_from_parts(
        parcel_id=parcel_id,
        row=row,
        strategy=strategy,
        screening=screening,
        market=candidate_market_context(db, parcel_id),
        environmental=candidate_environmental_context(db, parcel_id),
        intake=intake,
    )
    return _scrub(context)


def build_intake_research_context(
    db: Session,
    investment_rows: list[dict[str, Any]],
    candidate_id: str,
) -> dict[str, Any] | None:
    intake = analyze_intake_candidate(db, candidate_id, investment_rows)
    if not intake:
        return None
    candidate = intake["candidate"]
    parcel_id = candidate.get("parcel_id") or f"intake:{candidate_id}"
    row = _find_row(investment_rows, parcel_id)
    context = _context_from_parts(
        parcel_id=parcel_id,
        row=row,
        strategy=candidate.get("strategy") or "development_land",
        screening=intake.get("screening_context") or candidate_detail(investment_rows, parcel_id, strategy=candidate.get("strategy") or "development_land"),
        market=intake.get("market_area_context") or candidate_market_context(db, parcel_id),
        environmental=intake.get("environmental_context") or candidate_environmental_context(db, parcel_id),
        intake=intake,
    )
    return _scrub(context)


def generate_investment_report(
    db: Session,
    investment_rows: list[dict[str, Any]],
    request: InvestmentReportRequest,
) -> dict[str, Any]:
    template = REPORT_TYPES.get(request.report_type)
    if not template:
        raise ValueError("Unsupported CFS Investment report type.")
    context = (
        build_intake_research_context(db, investment_rows, request.candidate_id)
        if request.candidate_id
        else build_parcel_research_context(db, investment_rows, request.parcel_id or "Data Needed", strategy=request.strategy)
    )
    if not context:
        raise ValueError("Investment research context unavailable.")
    section_ids = tuple(request.selected_sections or template["sections"])
    sections = [_report_section(section_id, context) for section_id in section_ids]
    return _scrub(
        {
            "as_of": datetime.now(UTC).isoformat(),
            "brand": "CFS Investment",
            "report_type": request.report_type,
            "report_title": template["title"],
            "parcel_id": context["identity"].get("parcel_id"),
            "candidate_id": context["identity"].get("intake_candidate_id"),
            "strategy": context.get("selected_strategy"),
            "purpose": "Screening-level land, property, and real-estate research for manual due diligence.",
            "sections": sections,
            "report_bucket_item": {
                "title": template["title"],
                "type": "investment_report",
                "summary": context["safe_summary"],
                "content": "\n\n".join(f"{section['title']}\n{section['body']}" for section in sections),
                "caveats": [SAFE_CAVEAT],
            },
            "limitations": [SAFE_CAVEAT, "Reports are structured decision-support notes, not recommendations to buy, sell, develop, or value property."],
        }
    )


def _context_from_parts(
    *,
    parcel_id: str,
    row: dict[str, Any],
    strategy: InvestmentStrategyId,
    screening: dict[str, Any],
    market: dict[str, Any],
    environmental: dict[str, Any],
    intake: dict[str, Any] | None,
) -> dict[str, Any]:
    candidate = intake.get("candidate", {}) if intake else {}
    acquisition = intake.get("acquisition_basis", {}) if intake else {}
    missing = _missing_evidence(row, screening, market, environmental, acquisition)
    return {
        "brand": "CFS Investment",
        "identity": {
            "parcel_id": parcel_id,
            "intake_candidate_id": candidate.get("id"),
            "private_candidate_label": candidate.get("candidate_name"),
            "geography_label": row.get("geography_label") or row.get("municipality") or row.get("jurisdiction"),
            "approximate_acreage": row.get("acreage") or row.get("parcel_acres") or row.get("parcel_area_acres_calc"),
        },
        "selected_strategy": strategy,
        "parcel_fundamentals": {
            "acreage": row.get("acreage") or row.get("parcel_acres") or row.get("parcel_area_acres_calc"),
            "land_use_context": row.get("economic_segment") or row.get("land_use_context") or row.get("property_type"),
            "zoning_context": row.get("zoning_support_band") or row.get("zoning"),
            "future_use_context": row.get("future_land_use") or row.get("future_use_context"),
            "assessor_context": {
                "land_value_context": row.get("assessed_land_value_context") or row.get("land_value_band"),
                "improvement_value_context": row.get("assessed_improvement_value_context") or row.get("improvement_value_band"),
                "note": "Assessed values are assessor context only, not market value or an appraisal.",
            },
        },
        "development_readiness": {
            "candidate_band": screening.get("candidate_band"),
            "dimension_bands": screening.get("dimension_bands", {}),
            "permit_or_growth_context": row.get("growth_pressure_band") or row.get("development_readiness_band"),
            "verification_requirements": screening.get("verification_requirements", []),
        },
        "planning_context": {
            "zoning_support_band": row.get("zoning_support_band"),
            "planning_activity": row.get("planning_activity_band") or row.get("due_diligence_flags"),
        },
        "transportation_context": {
            "transportation_access_band": row.get("transportation_access_band") or row.get("access_context_band"),
        },
        "utility_context": {
            "sewer_proxy_class": row.get("sewer_proxy_class"),
            "utility_readiness_proxy_class": row.get("utility_readiness_proxy_class"),
            "capacity_status": row.get("utility_capacity_status") or "Capacity data not confirmed",
            "planned_extension_status": row.get("planned_extension_status") or "Planned extension data not confirmed",
        },
        "economic_context": {
            "opportunity_class": row.get("opportunity_class") or row.get("land_opportunity_class"),
            "economic_segment": row.get("economic_segment"),
            "economic_opportunity_band": row.get("economic_opportunity_band") or row.get("tax_base_opportunity_band"),
            "data_confidence": row.get("data_confidence") or row.get("economic_data_confidence"),
        },
        "market_area_context": market,
        "acquisition_basis": acquisition or {
            "basis_context_band": screening.get("basis_context_band"),
            "basis_data_confidence": screening.get("basis_data_confidence"),
        },
        "historical_sale_context": {
            "sale_quality_band": screening.get("sale_quality_band"),
            "sale_recency_band": screening.get("sale_recency_band"),
            "basis_caution_reasons": screening.get("basis_caution_reasons", []),
        },
        "comparable_context": {
            "basis_context_band": screening.get("basis_context_band"),
            "comparable_count_band": screening.get("comparable_count_band"),
            "comparable_confidence_band": screening.get("comparable_confidence_band"),
            "summary": screening.get("comparable_context_summary"),
        },
        "environmental_context": environmental,
        "constraint_context": {
            "flood_context": environmental.get("flood_context"),
            "overall_environmental_constraint_band": environmental.get("overall_environmental_constraint_band"),
            "constraint_burden": screening.get("dimension_bands", {}).get("constraint_burden"),
        },
        "evidence_quality": {
            "overall_data_confidence": row.get("data_confidence") or row.get("economic_data_confidence") or environmental.get("environmental_data_confidence"),
            "missing_source_count": len(missing),
            "critical_missing_evidence": missing,
            "authoritative_vs_proxy": [
                "FEMA, ACS, NWI, NRCS, EPA, and assessor/deed context are public-source or assessor context where available.",
                "Sewer proximity, utility readiness, usable-area, development readiness, and comparable context are CFS-derived screening proxies.",
            ],
        },
        "missing_evidence": missing,
        "verification_requirements": _verification_requirements(screening, environmental),
        "source_registry": _source_registry(market, environmental),
        "safe_summary": _safe_summary(parcel_id, screening, market, environmental),
        "limitations": [SAFE_CAVEAT, "Utility capacity, water service, environmental clearance, and parcel value are not confirmed by this context."],
    }


def _report_section(section_id: str, context: dict[str, Any]) -> dict[str, Any]:
    title_map = {
        "summary": "Executive Summary",
        "fundamentals": "Parcel Fundamentals",
        "basis": "Acquisition-Basis and Comparable Context",
        "readiness": "Development-Readiness Signals",
        "planning": "Planning and Entitlement Review",
        "utility": "Utility and Infrastructure Review",
        "economic": "Economic Context",
        "market": "Market-Area Context",
        "environmental": "Environmental and Physical Context",
        "missing": "Missing Evidence",
        "diligence": "Recommended Verification Sequence",
        "sources": "Sources and Limitations",
        "underwriting": "Underwriting Scenario Context",
    }
    title = title_map.get(section_id, section_id.replace("_", " ").title())
    if section_id == "summary":
        body = context["safe_summary"]
    elif section_id == "diligence":
        body = "; ".join(context.get("verification_requirements") or ["Manual due diligence required."])
    elif section_id == "sources":
        body = "; ".join(source["name"] for source in context.get("source_registry", []))
    elif section_id == "underwriting":
        body = "Use the Underwriting Lab for deterministic scenario assumptions, calculated results, sensitivity outputs, and exports. Financial outputs are user-entered modeled scenarios, not CFS forecasts or recommendations."
    else:
        body = _compact(context.get(_section_context_key(section_id), {}))
    return {
        "id": section_id,
        "title": title,
        "body": body or "No current evidence available for this section.",
        "sources": context.get("source_registry", [])[:5],
        "limitations": context.get("limitations", []),
    }


def _section_context_key(section_id: str) -> str:
    return {
        "fundamentals": "parcel_fundamentals",
        "basis": "comparable_context",
        "readiness": "development_readiness",
        "planning": "planning_context",
        "utility": "utility_context",
        "economic": "economic_context",
        "market": "market_area_context",
        "environmental": "environmental_context",
        "missing": "evidence_quality",
    }.get(section_id, section_id)


def _compact(value: Any) -> str:
    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            if item in (None, "", [], {}):
                continue
            parts.append(f"{key.replace('_', ' ').title()}: {_compact(item)}")
        return "; ".join(parts[:8])
    if isinstance(value, list):
        return "; ".join(str(item) for item in value[:6])
    return str(value)


def _find_row(rows: list[dict[str, Any]], parcel_id: str) -> dict[str, Any]:
    for row in rows:
        if str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id")) == str(parcel_id):
            return dict(row)
    return {"parcel_id": parcel_id}


def _missing_evidence(row: dict[str, Any], screening: dict[str, Any], market: dict[str, Any], environmental: dict[str, Any], acquisition: dict[str, Any]) -> list[str]:
    missing = []
    if not row or len(row) <= 1:
        missing.append("Parcel is not matched to the current CFS Investment export.")
    if market.get("data_confidence") in {None, "Data Needed", "Insufficient Information"}:
        missing.append("Market-area geography or ACS context requires verification.")
    if environmental.get("environmental_data_confidence") in {None, "Data Needed", "Insufficient"}:
        missing.append("Environmental context is incomplete.")
    if screening.get("basis_context_band") in {None, "Insufficient Basis Information", "Verification Required"} and not acquisition:
        missing.append("Comparable sale or acquisition-basis evidence requires verification.")
    return missing


def _verification_requirements(screening: dict[str, Any], environmental: dict[str, Any]) -> list[str]:
    items = list(screening.get("verification_requirements") or [])
    items.extend(environmental.get("verification_requirements") or [])
    items.extend(["Verify zoning and entitlement pathway with planning staff.", "Verify utility service and capacity with the appropriate provider."])
    return list(dict.fromkeys(item for item in items if item))[:10]


def _source_registry(market: dict[str, Any], environmental: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"name": "CFS Economics export", "category": "economic_context", "authority_level": "CFS-derived screening context", "limitation": "Not an appraisal or tax bill."},
        {"name": "Investment Intelligence Engine", "category": "screening_rules", "authority_level": "CFS-derived screening context", "limitation": "No raw scores or exact probabilities."},
        {"name": str(market.get("source") or "ACS market-area context"), "category": "market_area", "authority_level": "Federal aggregate estimate", "limitation": "Does not prove demand or future performance."},
        {"name": str(environmental.get("source_attribution", {}).get("wetlands") or "Environmental source extracts"), "category": "environmental", "authority_level": "Mapped public evidence", "limitation": "Requires professional verification."},
    ]


def _safe_summary(parcel_id: str, screening: dict[str, Any], market: dict[str, Any], environmental: dict[str, Any]) -> str:
    return (
        f"{parcel_id} is a screening-level CFS Investment research candidate with "
        f"{screening.get('candidate_band', 'insufficient')} readiness context, "
        f"{market.get('data_confidence', 'Data Needed')} market-area confidence, and "
        f"{environmental.get('overall_environmental_constraint_band', 'environmental context unavailable')} environmental context. "
        "Use this to prioritize manual due diligence, not as investment advice or an appraisal."
    )


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _scrub(item) for key, item in value.items() if key.lower() not in UNSAFE_KEYS and not key.startswith("_")}
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value
