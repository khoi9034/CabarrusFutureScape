"""Rules-based CFS Investment screening foundation."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from app.schemas.investment import InvestmentStrategyId

SAFE_CAVEAT = (
    "Screening-level review only: not investment advice, not an appraisal, "
    "not a utility service confirmation, and not a guarantee of future value."
)

STRATEGIES: dict[InvestmentStrategyId, dict[str, Any]] = {
    "development_land": {
        "label": "Development Land",
        "emphasis": [
            "Near-to-mid-term development-readiness",
            "Planning and zoning support",
            "Sewer proximity proxy",
            "Manageable constraints",
        ],
        "signals": ("readiness", "utility", "growth", "zoning", "opportunity"),
    },
    "land_banking": {
        "label": "Long-Term Land Banking",
        "emphasis": [
            "Growth-edge context",
            "Longer-term optionality",
            "Transportation and development momentum",
            "Limited existing improvement intensity",
        ],
        "signals": ("growth", "acreage", "opportunity", "readiness", "basis"),
    },
    "entitlement_repositioning": {
        "label": "Entitlement / Repositioning",
        "emphasis": [
            "Zoning versus future land-use direction",
            "Nearby planning or permit activity",
            "Underbuilt or transition context",
            "Entitlement uncertainty",
        ],
        "signals": ("zoning", "opportunity", "growth", "utility", "constraints"),
    },
    "existing_use": {
        "label": "Existing-Use Land",
        "emphasis": [
            "Existing-use compatibility",
            "Improvement context",
            "Access and constraints",
            "Comparable-data confidence",
        ],
        "signals": ("basis", "existing_use", "constraints", "confidence", "opportunity"),
    },
}

UNSAFE_RESPONSE_KEYS = {
    "owner",
    "owner_name",
    "mailing",
    "mailing_address",
    "raw_score",
    "prediction_probability",
    "exact_probability",
}


def strategy_catalog() -> dict[str, Any]:
    return {
        "caveat": SAFE_CAVEAT,
        "strategies": [
            {
                "id": key,
                "label": value["label"],
                "emphasis": value["emphasis"],
            }
            for key, value in STRATEGIES.items()
        ],
    }


def screen_candidates(
    rows: list[dict[str, Any]],
    *,
    filters: dict[str, Any] | None = None,
    limit: int = 80,
    strategy: InvestmentStrategyId = "development_land",
) -> dict[str, Any]:
    filtered = [_sanitize_row(row) for row in rows if _matches_filters(row, filters or {})]
    candidates = [_candidate(row, strategy) for row in filtered]
    candidates.sort(key=lambda item: item["_score"], reverse=True)
    visible = [_strip_internal(item, index + 1) for index, item in enumerate(candidates[:limit])]
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "caveats": [SAFE_CAVEAT],
        "candidate_count": len(visible),
        "data_quality": data_quality(rows),
        "strategy": strategy,
        "strategy_label": STRATEGIES[strategy]["label"],
        "candidates": visible,
    }


def candidate_detail(
    rows: list[dict[str, Any]],
    parcel_id: str,
    *,
    strategy: InvestmentStrategyId = "development_land",
) -> dict[str, Any]:
    for row in rows:
        if str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id")) == parcel_id:
            return _strip_internal(_candidate(_sanitize_row(row), strategy), 1)
    return {
        "parcel_id": parcel_id,
        "candidate_band": "Insufficient Information",
        "caveats": [SAFE_CAVEAT],
        "positive_reason_codes": [],
        "caution_reason_codes": ["Missing critical information"],
        "verification_requirements": ["Confirm parcel appears in current CFS economics export."],
    }


def compare_candidates(
    rows: list[dict[str, Any]],
    parcel_ids: list[str],
    *,
    strategy: InvestmentStrategyId = "development_land",
) -> dict[str, Any]:
    wanted = {str(parcel_id) for parcel_id in parcel_ids}
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        row_id = str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id"))
        if row_id in wanted and row_id not in seen:
            seen.add(row_id)
            candidates.append(_candidate(_sanitize_row(row), strategy))
    candidates.sort(key=lambda item: item["_score"], reverse=True)
    return {
        "caveats": [SAFE_CAVEAT],
        "candidates": [_strip_internal(candidate, index + 1) for index, candidate in enumerate(candidates)],
        "strategy": strategy,
        "strategy_label": STRATEGIES[strategy]["label"],
    }


def data_quality(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    confidence = Counter(_band(row.get("data_confidence") or row.get("economic_data_confidence")) for row in rows)
    missing_basis = sum(1 for row in rows if not row.get("value_per_acre_band") and not row.get("comparison_group"))
    utility_proxy = sum(1 for row in rows if row.get("sewer_proxy_class") or row.get("utility_readiness_proxy_class"))
    sale_quality = Counter(_band(row.get("sale_quality_band")) for row in rows)
    comparable_depth = Counter(_band(row.get("comparable_count_band")) for row in rows)
    return {
        "comparable_basis_gap_count": missing_basis,
        "comparable_depth_mix": dict(comparable_depth),
        "confidence_mix": dict(confidence),
        "critical_verification_flags": [
            "Comparable verification required" if missing_basis else "Comparable context available for some rows",
            "Utility capacity data not provided",
            "Water service data not provided",
            "Planned extension data not provided",
        ],
        "multi_parcel_transaction_count": sum(1 for row in rows if row.get("multi_parcel_sale_flag")),
        "parcels_missing_sale_date": sum(1 for row in rows if row.get("basis_missing_sale_date_flag")),
        "parcels_missing_sale_price": sum(1 for row in rows if row.get("basis_missing_sale_price_flag")),
        "parcels_requiring_manual_basis_verification": sum(1 for row in rows if row.get("basis_verification_required")),
        "parcels_with_potentially_qualified_sales": sale_quality.get("Qualified", 0) + sale_quality.get("Potentially Qualified", 0),
        "parcels_with_sale_data": sum(1 for row in rows if row.get("sale_quality_band") not in (None, "", "Not Available")),
        "parcels_with_stale_sale_evidence": sum(1 for row in rows if row.get("basis_stale_sale_flag")),
        "sale_quality_mix": dict(sale_quality),
        "sufficient_comparable_group_count": sum(
            1 for row in rows if row.get("comparable_count_band") in {"Moderate", "Strong"}
        ),
        "total_rows": total,
        "utility_proxy_row_count": utility_proxy,
    }


def _candidate(row: dict[str, Any], strategy: InvestmentStrategyId) -> dict[str, Any]:
    signals = _strategy_scores(row, strategy)
    constraint_score = _constraint_score(row)
    missing_count = _missing_count(row, strategy)
    score = sum(signals.values()) - constraint_score - min(missing_count, 4)
    positive = _positive_reasons(row, strategy)
    cautions = _caution_reasons(row, strategy)
    band = _candidate_band(score, missing_count, cautions)
    confidence = _confidence_band(row, missing_count)
    return {
        "_score": score,
        "basis_context_band": _basis_band(row),
        "basis_caution_reasons": list(row.get("basis_caution_reasons") or []),
        "basis_data_confidence": row.get("basis_data_confidence") or "Low",
        "basis_positive_reasons": list(row.get("basis_positive_reasons") or []),
        "basis_verification_required": bool(row.get("basis_verification_required")),
        "candidate_band": band,
        "caution_reason_codes": cautions,
        "caveats": [SAFE_CAVEAT],
        "comparable_context_summary": row.get("comparable_context_summary") or "Basis context requires manual verification.",
        "comparable_count_band": row.get("comparable_count_band") or "No comparable evidence",
        "comparable_confidence_band": row.get("comparable_confidence_band") or row.get("basis_data_confidence") or "Low",
        "data_confidence_band": confidence,
        "dimension_bands": {
            "basis_context": _basis_band(row),
            "constraint_burden": _constraint_band(row, constraint_score),
            "data_confidence": confidence,
            "readiness_signal": _support_band(signals.get("readiness", 0) + signals.get("utility", 0)),
            "strategy_fit": _support_band(max(signals.values()) if signals else 0),
        },
        "factor_groups": _factor_groups(row, missing_count, strategy),
        "freshness_context": row.get("as_of") or "Current CFS economics extract",
        "parcel_id": str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id") or "Data Needed"),
        "positive_reason_codes": positive,
        "safe_display_fields": _safe_display_fields(row),
        "sale_quality_band": row.get("sale_quality_band") or "Not Available",
        "sale_recency_band": row.get("sale_recency_band") or "No sale information available",
        "strategy": strategy,
        "strategy_label": STRATEGIES[strategy]["label"],
        "verification_requirements": _verification_requirements(row, cautions),
    }


def _strategy_scores(row: dict[str, Any], strategy: InvestmentStrategyId) -> dict[str, int]:
    text = _row_text(row)
    readiness = _points(text, ["strong infrastructure", "good candidate", "opportunity signal", "readiness"], 3)
    utility = _points(text, ["adjacent to sewer", "near sewer", "sewer basin", "sewer-proximity"], 3)
    growth = _points(text, ["growth pressure", "permit pressure", "elevated", "strong"], 2)
    zoning = _points(text, ["zoning support", "supportive", "planning alignment", "future land"], 2)
    opportunity = _points(text, ["underbuilt", "redevelopment", "tax-base", "opportunity"], 3)
    basis = _basis_points(row)
    acreage = 1 if row.get("acreage_band") or row.get("land_opportunity_class") else 0
    confidence = 1 if _band(row.get("data_confidence")).lower().startswith(("high", "medium")) else 0
    existing_use = _points(text, ["high-value stable", "commercial", "existing", "improvement"], 4)
    raw = {
        "acreage": acreage,
        "basis": basis,
        "confidence": confidence,
        "constraints": max(0, 2 - _constraint_score(row)),
        "existing_use": existing_use,
        "growth": growth,
        "opportunity": opportunity,
        "readiness": readiness,
        "utility": utility,
        "zoning": zoning,
    }
    return {key: raw[key] for key in STRATEGIES[strategy]["signals"]}


def _factor_groups(row: dict[str, Any], missing_count: int, strategy: InvestmentStrategyId) -> dict[str, Any]:
    return {
        "constraints": {
            "access_uncertainty": "Verify",
            "entitlement_requirement": "Verify with planning if zoning/future land-use support is unclear",
            "environmental_constraint": _band(row.get("overall_environmental_constraint_band")),
            "flood_constraint": _band(row.get("flood_constraint_band")),
            "missing_critical_information": missing_count,
            "overall_constraint_band": _band(row.get("constraint_burden_band") or row.get("public_cost_risk_band")),
            "usable_area_screening_proxy": _band(row.get("usable_area_screening_proxy")),
            "utility_verification_requirement": "Verify with utility provider",
        },
        "development_readiness_signals": {
            "future_land_use_alignment": _band(row.get("land_opportunity_class")),
            "nearby_development_momentum": _band(row.get("growth_pressure_band")),
            "nearby_major_permit_activity": _band(row.get("growth_pressure_band")),
            "planning_case_context": "Verify",
            "road_access_context": _band(row.get("transportation_access_band")),
            "sewer_proximity_proxy": _band(row.get("sewer_proxy_class")),
            "utility_readiness_proxy": _band(row.get("utility_readiness_proxy_class")),
            "zoning_alignment": _band(row.get("zoning_support_band")),
        },
        "evidence_quality": {
            "critical_verification_flags": _verification_requirements(row, _caution_reasons(row, strategy)),
            "data_confidence_band": _confidence_band(row, missing_count),
            "data_freshness": row.get("as_of") or "Current CFS extract",
            "manual_review_requirement": "Due diligence required",
            "missing_data_count": missing_count,
        },
        "market_basis_context": {
            "basis_verification_required": bool(row.get("basis_verification_required")),
            "comparable_data_confidence": row.get("comparable_confidence_band") or "Comparable verification required",
            "comparable_depth": row.get("comparable_count_band") or "No comparable evidence",
            "nearby_comparable_context": row.get("comparable_context_summary") or "Insufficient basis information",
            "price_per_acre_context": row.get("basis_context_band") or row.get("value_per_acre_band") or "Comparable verification required",
            "recent_qualified_sale_availability": row.get("sale_quality_band") or "Insufficient basis information",
            "relative_basis_band": _basis_band(row),
            "sale_recency_band": row.get("sale_recency_band") or "Comparable verification required",
        },
        "parcel_fundamentals": {
            "acreage": row.get("acreage_band") or "Data Needed",
            "assessed_improvement_value_context": row.get("improvement_to_land_ratio_band") or "Data Needed",
            "assessed_land_value_context": row.get("value_per_acre_band") or "Data Needed",
            "existing_building_area_context": row.get("improvement_to_land_ratio_band") or "Data Needed",
            "existing_land_use_classification": row.get("economic_segment") or "Data Needed",
            "future_land_use_context": row.get("land_opportunity_class") or "Data Needed",
            "parcel_identifier": row.get("parcel_id") or row.get("signal_id") or "Data Needed",
            "usable_acreage_proxy": row.get("acreage_band") or "Data Needed",
            "vacant_or_improved_status": row.get("land_efficiency_band") or "Data Needed",
            "zoning": row.get("zoning_support_band") or "Data Needed",
        },
    }


def _positive_reasons(row: dict[str, Any], strategy: InvestmentStrategyId) -> list[str]:
    text = _row_text(row)
    basis_reasons = list(row.get("basis_positive_reasons") or [])
    if strategy == "existing_use":
        return _unique(
            basis_reasons + [
                "Comparable context appears supportive" if row.get("value_per_acre_band") or row.get("comparison_group") else "",
                "Existing-use compatibility has supportable screening context" if row.get("economic_segment") else "",
                "Existing improvement intensity is available for review" if row.get("improvement_to_land_ratio_band") else "",
            ],
        )
    reasons = [
        ("Future land-use context supports the selected strategy", row.get("land_opportunity_class") or "future land" in text),
        ("Nearby major-development activity is elevated", _has(text, "growth pressure", "permit pressure", "elevated")),
        ("Parcel acreage supports broader review", bool(row.get("acreage_band") or row.get("land_opportunity_class"))),
        ("Sewer infrastructure appears nearby based on a proximity proxy", _has(text, "adjacent to sewer", "near sewer", "sewer basin")),
        ("Comparable context appears supportive", bool(row.get("value_per_acre_band") or row.get("comparison_group"))),
        ("Existing improvement intensity is limited", _has(text, "underbuilt", "redevelopment", "low improvement", "vacant")),
    ]
    return _unique(basis_reasons + [reason for reason, include in reasons if include])


def _caution_reasons(row: dict[str, Any], strategy: InvestmentStrategyId | None = None) -> list[str]:
    text = _row_text(row)
    reasons = [
        ("Utility availability and capacity require verification", True),
        ("Flood constraints affect part of the parcel", _has(text, "flood", "constraint")),
        ("Access conditions require confirmation", not row.get("transportation_access_band")),
        ("Entitlement action may be necessary", not row.get("zoning_support_band") or _has(text, "entitlement", "verify zoning")),
        ("Comparable evidence is limited or stale", not row.get("value_per_acre_band") and not row.get("comparison_group")),
        ("Critical data fields are missing", _missing_count(row, strategy) >= 3),
    ]
    return _unique(list(row.get("basis_caution_reasons") or []) + [reason for reason, include in reasons if include])


def _verification_requirements(row: dict[str, Any], cautions: list[str]) -> list[str]:
    requirements = [
        "Verify zoning and entitlement path with planning staff.",
        "Verify utility service and capacity with the utility provider.",
        "Confirm road frontage, legal access, title, and easements.",
    ]
    if "Comparable evidence is limited or stale" in cautions or row.get("basis_verification_required"):
        requirements.append("Verify comparable sales and basis context manually.")
    if "Flood constraints affect part of the parcel" in cautions:
        requirements.append("Review floodplain, wetland, and usable-area screening constraints.")
    if row.get("planned_extension_status") in (None, "", "Planned extension data not provided"):
        requirements.append("Confirm planned utility extension data before interpretation.")
    return _unique(requirements)


def _safe_display_fields(row: dict[str, Any]) -> dict[str, Any]:
    fields = {
        "display_label": row.get("display_label") or row.get("parcel_id") or row.get("signal_id"),
        "geography_label": row.get("geography_label"),
        "land_opportunity_class": row.get("land_opportunity_class"),
        "development_readiness_band": row.get("development_readiness_band"),
        "growth_pressure_band": row.get("growth_pressure_band"),
        "economic_opportunity_band": row.get("economic_opportunity_band"),
        "sewer_proxy_class": row.get("sewer_proxy_class"),
        "utility_readiness_proxy_class": row.get("utility_readiness_proxy_class"),
        "data_confidence": row.get("data_confidence") or row.get("economic_data_confidence"),
        "basis_context_band": row.get("basis_context_band"),
        "sale_quality_band": row.get("sale_quality_band"),
        "comparable_count_band": row.get("comparable_count_band"),
        "environmental_constraint_band": row.get("overall_environmental_constraint_band"),
        "mapped_wetland_context": row.get("wetland_context_band"),
        "terrain_context": row.get("terrain_context_band"),
        "soil_limitation_band": row.get("soil_limitation_band"),
        "usable_area_screening_proxy": row.get("usable_area_screening_proxy"),
    }
    return {key: value for key, value in fields.items() if key not in UNSAFE_RESPONSE_KEYS}


def _sanitize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key.lower() not in UNSAFE_RESPONSE_KEYS}


def _matches_filters(row: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key, expected in filters.items():
        if expected in (None, "", "All"):
            continue
        actual = row.get(key)
        if isinstance(expected, list):
            if actual not in expected:
                return False
        elif str(actual or "").lower() != str(expected).lower():
            return False
    return True


def _candidate_band(score: int, missing_count: int, cautions: list[str]) -> str:
    if missing_count >= 5:
        return "Insufficient Information"
    if score >= 8 and len(cautions) <= 3:
        return "Priority Review"
    if score >= 5:
        return "Strong Review Candidate"
    if score >= 2:
        return "Moderate Review Candidate"
    return "Limited Current Signal"


def _support_band(value: int) -> str:
    if value >= 4:
        return "Supportive"
    if value >= 2:
        return "Moderately Supportive"
    if value == 1:
        return "Neutral"
    return "Verify"


def _constraint_band(row: dict[str, Any], score: int) -> str:
    text = _row_text(row)
    if _has(text, "high", "flood", "constraint") or score >= 3:
        return "High Constraint"
    if score:
        return "Moderate Constraint"
    return "Low Constraint"


def _basis_band(row: dict[str, Any]) -> str:
    if row.get("basis_context_band"):
        return str(row["basis_context_band"])
    if row.get("value_per_acre_band") and row.get("comparison_group"):
        return "Moderately Supportive"
    if row.get("value_per_acre_band") or row.get("comparison_group"):
        return "Verify"
    return "Insufficient basis information"


def _basis_points(row: dict[str, Any]) -> int:
    band = str(row.get("basis_context_band") or "").lower()
    if band in {"supportive", "moderately supportive", "near comparable context"}:
        return 2
    if band in {"elevated", "highly elevated", "verification required"}:
        return 0
    return 1 if row.get("value_per_acre_band") or row.get("comparison_group") else 0


def _confidence_band(row: dict[str, Any], missing_count: int) -> str:
    text = _band(row.get("data_confidence") or row.get("economic_data_confidence")).lower()
    if missing_count >= 4 or "data" in text and "needed" in text:
        return "Low Confidence"
    if "strong" in text or "high" in text:
        return "High Confidence"
    return "Medium Confidence"


def _constraint_score(row: dict[str, Any]) -> int:
    text = _row_text(row)
    return (
        (2 if _has(text, "flood", "high constraint", "limited utility") else 0)
        + (1 if _has(text, "data needed", "not provided", "verify") else 0)
    )


def _missing_count(row: dict[str, Any], strategy: InvestmentStrategyId | None = None) -> int:
    keys = (
        "economic_segment",
        "opportunity_class",
        "value_per_acre_band",
        "comparison_group",
        "data_confidence",
    ) if strategy == "existing_use" else (
        "development_readiness_band",
        "land_opportunity_class",
        "sewer_proxy_class",
        "growth_pressure_band",
        "economic_opportunity_band",
        "data_confidence",
        "value_per_acre_band",
    )
    return sum(1 for key in keys if not row.get(key))


def _points(text: str, terms: list[str], value: int) -> int:
    return value if _has(text, *terms) else 0


def _row_text(row: dict[str, Any]) -> str:
    return " ".join(str(value) for value in row.values() if value not in (None, "")).lower()


def _has(text: str, *terms: str) -> bool:
    return any(term in text for term in terms)


def _band(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else "Data Needed"


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _strip_internal(candidate: dict[str, Any], sort_order: int) -> dict[str, Any]:
    return {key: value for key, value in candidate.items() if key != "_score"} | {"sort_order": sort_order}
