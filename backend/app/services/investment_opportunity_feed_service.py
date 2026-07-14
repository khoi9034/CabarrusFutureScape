"""Opportunity references and governed search links for CFS Investment."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy.orm import Session

from app.schemas.investment import InvestmentIntakePayload
from app.schemas.investment_opportunities import InvestmentOpportunityIntakeRequest, InvestmentOpportunityMatchRequest
from app.services.investment_intake_service import create_intake_candidate, list_intake_candidates
from app.services.investment_screening_service import SAFE_CAVEAT

SOURCE_REGISTRY = [
    {
        "source_id": "cabarrus_tax_foreclosures",
        "source_name": "Cabarrus County Tax Foreclosures",
        "source_type": "Public Government Feed",
        "access_mode": "Monitored official reference",
        "coverage": "Cabarrus County, NC",
        "last_checked": "2026-07-14",
        "last_refreshed": None,
        "storage_allowed": "Reference metadata only until machine-readable terms are confirmed",
        "attribution_required": "Cabarrus County Tax Administration",
        "license_status": "Official public notice/reference; verify details with source",
        "data_confidence": "Medium",
        "enabled": True,
        "source_url": "https://www.cabarruscounty.us/Government/Departments/Tax-Administration/Tax-Collections/Foreclosures",
    },
    {
        "source_id": "nc_state_surplus_property",
        "source_name": "NC State Surplus Property",
        "source_type": "Public Government Feed",
        "access_mode": "Official auction/reference site",
        "coverage": "North Carolina statewide",
        "last_checked": "2026-07-14",
        "last_refreshed": None,
        "storage_allowed": "Reference metadata only until property-specific terms are confirmed",
        "attribution_required": "North Carolina Department of Administration",
        "license_status": "Official public auction/reference; verify source terms",
        "data_confidence": "Medium",
        "enabled": True,
        "source_url": "https://www.doa.nc.gov/divisions/state-surplus-property",
    },
    {
        "source_id": "crexi_external_search",
        "source_name": "Crexi External Search",
        "source_type": "External Search Link",
        "access_mode": "Open in browser; no scraping",
        "coverage": "External platform availability varies",
        "last_checked": "2026-07-14",
        "last_refreshed": None,
        "storage_allowed": "Do not persist restricted listing content without approved terms",
        "attribution_required": "Crexi",
        "license_status": "External reference only",
        "data_confidence": "Source verification required",
        "enabled": True,
        "source_url": "https://www.crexi.com/properties",
    },
    {
        "source_id": "loopnet_external_search",
        "source_name": "LoopNet External Search",
        "source_type": "External Search Link",
        "access_mode": "Open in browser; no scraping",
        "coverage": "External platform availability varies",
        "last_checked": "2026-07-14",
        "last_refreshed": None,
        "storage_allowed": "Do not persist restricted listing content without approved terms",
        "attribution_required": "LoopNet",
        "license_status": "External reference only",
        "data_confidence": "Source verification required",
        "enabled": True,
        "source_url": "https://www.loopnet.com/search/commercial-real-estate/cabarrus-county-nc/for-sale/",
    },
    {
        "source_id": "approved_mls_disabled",
        "source_name": "Approved MLS / Bridge Connector",
        "source_type": "Approved API",
        "access_mode": "Disabled until access agreement and credentials are approved",
        "coverage": "Depends on executed agreement",
        "last_checked": "2026-07-14",
        "last_refreshed": None,
        "storage_allowed": "Per license only",
        "attribution_required": "Per license",
        "license_status": "Restricted - disabled",
        "data_confidence": "Unavailable",
        "enabled": False,
        "source_url": None,
    },
]


def opportunity_sources() -> dict[str, Any]:
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "count": len(SOURCE_REGISTRY),
        "sources": SOURCE_REGISTRY,
        "caveats": [SAFE_CAVEAT, "External search references are not synchronized listings. Verify availability and terms on the source platform."],
    }


def list_opportunities(db: Session, investment_rows: list[dict[str, Any]], filters: dict[str, Any] | None = None) -> dict[str, Any]:
    filters = filters or {}
    intake = list_intake_candidates(db, investment_rows).get("candidates", [])
    items = [_from_intake(row) for row in intake]
    items.extend(_from_cfs_candidate(row) for row in investment_rows[:80])
    items = _deduped(_with_search_links(item) for item in items)
    filtered = [item for item in items if _matches(item, filters)]
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "count": len(filtered),
        "opportunities": filtered[:250],
        "source_modes": sorted({source["source_type"] for source in SOURCE_REGISTRY}),
        "caveats": [SAFE_CAVEAT, "Available opportunity references from enabled sources; not all available properties."],
    }


def refresh_opportunities(source_id: str | None = None) -> dict[str, Any]:
    sources = [source for source in SOURCE_REGISTRY if source_id in {None, source["source_id"]}]
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "refreshed_sources": len(sources),
        "source_ids": [source["source_id"] for source in sources],
        "status": "Reference metadata checked; no external scraping or restricted API ingestion performed.",
        "caveats": [SAFE_CAVEAT],
    }


def match_opportunity(db: Session, opportunity_id: str, investment_rows: list[dict[str, Any]], request: InvestmentOpportunityMatchRequest) -> dict[str, Any]:
    opportunity = get_opportunity(db, investment_rows, opportunity_id)
    requested = request.parcel_id or opportunity.get("parcel_id")
    matches = [row for row in investment_rows if str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id")) == str(requested)]
    status = "Matched" if len(matches) == 1 else "Unmatched"
    if len(matches) > 1:
        status = "Multiple Possible Matches"
    if not requested:
        status = "Manual Verification Required"
    return {
        "opportunity_id": opportunity_id,
        "parcel_id": requested,
        "parcel_match_status": status,
        "candidate_count": len(matches),
        "caveats": [SAFE_CAVEAT, "Do not silently select a parcel when match evidence is ambiguous."],
    }


def opportunity_to_intake(db: Session, opportunity_id: str, investment_rows: list[dict[str, Any]], request: InvestmentOpportunityIntakeRequest) -> dict[str, Any]:
    opportunity = get_opportunity(db, investment_rows, opportunity_id)
    payload = InvestmentIntakePayload(
        asking_price=opportunity.get("asking_price"),
        candidate_name=opportunity.get("title") or "Opportunity reference",
        listing_status=opportunity.get("listing_status"),
        parcel_id=opportunity.get("parcel_id"),
        property_type=opportunity.get("property_type"),
        source_name=opportunity.get("source_name"),
        source_type="Existing CFS Candidate" if opportunity.get("source_type") == "Internal CFS Evidence" else "Manual Research",
        source_url=opportunity.get("source_url"),
        strategy=request.strategy,
        user_notes="Created from Opportunity Feed. Verify source availability before relying on this reference.",
    )
    return create_intake_candidate(db, payload, investment_rows)


def get_opportunity(db: Session, investment_rows: list[dict[str, Any]], opportunity_id: str) -> dict[str, Any]:
    for item in list_opportunities(db, investment_rows).get("opportunities", []):
        if item["external_opportunity_id"] == opportunity_id:
            return item
    return {
        "external_opportunity_id": opportunity_id,
        "parcel_id": opportunity_id.removeprefix("cfs-") if opportunity_id.startswith("cfs-") else None,
        "parcel_match_status": "Manual Verification Required",
        "source_name": "Manual opportunity reference",
        "source_type": "Manual / Off-Market Lead",
        "title": "Manual opportunity reference",
    }


def _from_intake(row: dict[str, Any]) -> dict[str, Any]:
    acres = row.get("parcel_acres") or row.get("acreage")
    asking = row.get("asking_price")
    return {
        "external_opportunity_id": f"intake-{row['id']}",
        "source_id": "candidate_intake",
        "source_name": row.get("source_name") or "Candidate Intake",
        "source_type": "Manual / Off-Market Lead",
        "title": row.get("candidate_name"),
        "property_type": row.get("property_type") or "Land / property reference",
        "listing_status": row.get("listing_status") or row.get("review_status") or "Needs Verification",
        "asking_price": asking,
        "price_per_acre": round(float(asking) / float(acres), 2) if asking and acres else None,
        "acreage": acres,
        "building_area": None,
        "general_location": row.get("geography_label") or row.get("parcel_id"),
        "latitude": None,
        "longitude": None,
        "parcel_id": row.get("parcel_id"),
        "parcel_match_status": row.get("parcel_match_status") or "Manual Verification Required",
        "source_url": row.get("source_url"),
        "listed_date": row.get("asking_price_date"),
        "last_seen": row.get("last_verified") or row.get("date_added"),
        "data_freshness_band": "Verify source recency",
        "attribution": row.get("source_name") or "User-entered reference",
        "storage_policy": "Private CFS intake record",
    }


def _from_cfs_candidate(row: dict[str, Any]) -> dict[str, Any]:
    parcel_id = str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id") or "")
    return {
        "external_opportunity_id": f"cfs-{parcel_id}",
        "source_id": "cfs_review_candidate",
        "source_name": "CFS Opportunity Radar",
        "source_type": "Internal CFS Evidence",
        "title": row.get("display_label") or f"CFS review target {parcel_id}",
        "property_type": row.get("economic_segment") or "Land review candidate",
        "listing_status": "Not a listing - search target",
        "asking_price": None,
        "price_per_acre": None,
        "acreage": row.get("acreage") or row.get("parcel_acres"),
        "building_area": None,
        "general_location": row.get("geography_label"),
        "latitude": None,
        "longitude": None,
        "parcel_id": parcel_id,
        "parcel_match_status": "Matched",
        "source_url": None,
        "listed_date": None,
        "last_seen": None,
        "data_freshness_band": row.get("data_confidence") or "Screening context",
        "attribution": "CFS Investment Intelligence",
        "storage_policy": "CFS-derived search target; not an external listing",
        "cfs_review_signal": row.get("development_readiness_band") or row.get("opportunity_class"),
    }


def _with_search_links(item: dict[str, Any]) -> dict[str, Any]:
    place = quote_plus(str(item.get("general_location") or "Cabarrus County NC"))
    property_type = quote_plus(str(item.get("property_type") or "land"))
    return {
        **item,
        "external_search_links": [
            {"source_name": "Crexi", "url": f"https://www.crexi.com/properties?place={place}&types={property_type}"},
            {"source_name": "LoopNet", "url": "https://www.loopnet.com/search/commercial-real-estate/cabarrus-county-nc/for-sale/"},
            {"source_name": "Cabarrus Tax Foreclosures", "url": SOURCE_REGISTRY[0]["source_url"]},
        ],
        "source_caveat": "External search reference. Listing availability and content must be verified on the source platform.",
    }


def _deduped(items: Any) -> list[dict[str, Any]]:
    seen: set[str] = set()
    results = []
    for index, item in enumerate(items):
        key = str(item.get("parcel_id") or item.get("source_url") or f"{item.get('source_id')}:{index}")
        if key in seen:
            continue
        seen.add(key)
        results.append({**item, "dedupe_key": key})
    return results


def _matches(item: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key in ("source_id", "property_type", "listing_status", "parcel_match_status"):
        if filters.get(key) and str(filters[key]).lower() not in str(item.get(key, "")).lower():
            return False
    minimum = filters.get("minimum_acres")
    maximum = filters.get("maximum_acres")
    acres = item.get("acreage")
    if minimum is not None and (acres is None or float(acres) < float(minimum)):
        return False
    if maximum is not None and (acres is None or float(acres) > float(maximum)):
        return False
    return True
