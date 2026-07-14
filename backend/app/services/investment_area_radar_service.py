"""CFS-derived area opportunity radar."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.services.investment_opportunity_feed_service import list_opportunities
from app.services.investment_screening_service import SAFE_CAVEAT

RADAR_PRESETS = {
    "residential_development": "Residential Development Search",
    "industrial_site": "Industrial Site Search",
    "commercial_retail": "Commercial / Retail Search",
    "land_banking": "Long-Term Land Banking",
    "entitlement_repositioning": "Entitlement / Repositioning",
    "existing_use": "Existing-Use Acquisition",
    "custom_client": "Custom Client Criteria",
}


def radar_search(investment_rows: list[dict[str, Any]], *, strategy: str = "industrial_site", limit: int = 25) -> dict[str, Any]:
    areas = _areas(investment_rows, strategy)
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "strategy": strategy,
        "strategy_label": RADAR_PRESETS.get(strategy, strategy.replace("_", " ").title()),
        "count": len(areas),
        "areas": areas[:limit],
        "caveats": [SAFE_CAVEAT, "Area Radar is a CFS-derived search aid, not a complete property inventory."],
    }


def radar_area(investment_rows: list[dict[str, Any]], area_id: str, *, strategy: str = "industrial_site") -> dict[str, Any]:
    for area in _areas(investment_rows, strategy):
        if area["area_id"] == area_id:
            return area
    return {
        "area_id": area_id,
        "area_name": area_id.replace("-", " ").title(),
        "area_classification": "Insufficient Information",
        "why_it_surfaced": [],
        "major_cautions": ["No current CFS area evidence found for this geography."],
        "missing_evidence": ["Available opportunity references require manual search."],
        "data_confidence": "Limited",
    }


def radar_area_parcels(investment_rows: list[dict[str, Any]], area_id: str, *, limit: int = 80) -> dict[str, Any]:
    rows = [row for row in investment_rows if _area_id(row) == area_id][:limit]
    return {"area_id": area_id, "count": len(rows), "parcels": rows, "caveats": [SAFE_CAVEAT]}


def radar_area_opportunities(db: Session, investment_rows: list[dict[str, Any]], area_id: str) -> dict[str, Any]:
    area = radar_area(investment_rows, area_id)
    opportunities = [
        item for item in list_opportunities(db, investment_rows).get("opportunities", [])
        if str(area.get("area_name", "")).lower() in str(item.get("general_location", "")).lower()
    ]
    return {"area_id": area_id, "count": len(opportunities), "opportunities": opportunities[:80], "caveats": [SAFE_CAVEAT]}


def _areas(rows: list[dict[str, Any]], strategy: str) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[_area_id(row)].append(row)
    areas = [_area_summary(area_id, area_rows, strategy) for area_id, area_rows in groups.items()]
    sorted_areas = sorted(areas, key=lambda item: (item["_sort"], item["area_name"]), reverse=True)
    for area in sorted_areas:
        area.pop("_sort", None)
    return sorted_areas


def _area_summary(area_id: str, rows: list[dict[str, Any]], strategy: str) -> dict[str, Any]:
    total = len(rows)
    sewer = sum(1 for row in rows if "sewer" in str(row.get("sewer_proxy_class") or row.get("utility_readiness_proxy_class") or "").lower())
    readiness = sum(1 for row in rows if "strong" in str(row.get("development_readiness_band") or "").lower() or "underbuilt" in str(row.get("opportunity_class") or "").lower())
    constrained = sum(1 for row in rows if "material" in str(row.get("overall_environmental_constraint_band") or row.get("flood_constraint_band") or "").lower())
    data_needed = sum(1 for row in rows if "data" in str(row.get("data_confidence") or row.get("economic_data_confidence") or "").lower())
    signal = readiness + sewer - constrained
    if total < 3:
        band = "Insufficient Information"
    elif signal >= 12:
        band = "Priority Search Area"
    elif signal >= 7:
        band = "Strong Search Area"
    elif signal >= 3:
        band = "Emerging Search Area"
    elif constrained > readiness:
        band = "Mixed Evidence"
    else:
        band = "Limited Current Signal"
    return {
        "_sort": signal,
        "area_id": area_id,
        "area_name": rows[0].get("geography_label") or area_id.replace("-", " ").title(),
        "geography_type": "CFS geography label",
        "strategy_label": RADAR_PRESETS.get(strategy, strategy.replace("_", " ").title()),
        "area_classification": band,
        "candidate_count": total,
        "available_opportunity_count": 0,
        "why_it_surfaced": _why(readiness, sewer, strategy),
        "major_cautions": _cautions(constrained, data_needed),
        "data_confidence": "Medium" if data_needed < max(total / 3, 1) else "Limited",
        "missing_evidence": ["Live listing completeness is not confirmed.", "Utility capacity and entitlement outcomes require verification."],
        "recommended_next_search_action": "Open external search links and review matched CFS parcel candidates.",
        "external_search_links": [
            {"source_name": "LoopNet", "url": "https://www.loopnet.com/search/commercial-real-estate/cabarrus-county-nc/for-sale/"},
            {"source_name": "Cabarrus Tax Foreclosures", "url": "https://www.cabarruscounty.us/Government/Departments/Tax-Administration/Tax-Collections/Foreclosures"},
        ],
    }


def _why(readiness: int, sewer: int, strategy: str) -> list[str]:
    reasons = []
    if readiness:
        reasons.append(f"{readiness} parcel records show development-readiness or opportunity context.")
    if sewer:
        reasons.append(f"{sewer} parcel records include sewer-proximity or utility-readiness proxy evidence.")
    if strategy in {"industrial_site", "commercial_retail"}:
        reasons.append("Preset emphasizes access, utility proxy, and parcel opportunity evidence.")
    return reasons or ["Area surfaced for manual search because available evidence is limited but present."]


def _cautions(constrained: int, data_needed: int) -> list[str]:
    cautions = []
    if constrained:
        cautions.append(f"{constrained} parcel records show mapped constraint or verification burden.")
    if data_needed:
        cautions.append(f"{data_needed} parcel records need additional data confidence review.")
    return cautions or ["No single data source confirms availability, feasibility, or value."]


def _area_id(row: dict[str, Any]) -> str:
    label = str(row.get("geography_label") or row.get("jurisdiction") or "countywide")
    return "".join(char.lower() if char.isalnum() else "-" for char in label).strip("-") or "countywide"
