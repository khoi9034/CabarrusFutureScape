"""Grounded CFS AI/search endpoint."""

from __future__ import annotations

import json
import copy
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_read_only_db
from app.routers.indicators_router import get_cached_indicator_intelligence
from app.schemas.ai_search import CfsAiContext, CfsAiSearchRequest, CfsAiSearchResponse
from app.services.ai_search_service import CfsAiSearchService

router = APIRouter(prefix="/ai", tags=["CFS AI Search"])
ASK_CFS_CONTEXT_CACHE_TTL = timedelta(minutes=5)
_ASK_CFS_CONTEXT_CACHE: dict[str, Any] = {"expires_at": None, "payload": None}

_FAST_DEVELOPMENT_SQL = text(
    """
    SELECT
      (SELECT COUNT(DISTINCT permit_id) FROM public.real_property_permit_parcel_relationship) AS total_records,
      (
        SELECT COUNT(DISTINCT official_parcel_id)
        FROM public.real_property_permit_parcel_relationship
        WHERE has_parcel_match IS TRUE
      ) AS active_parcels,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('year', activity_year, 'count', permit_count) ORDER BY activity_year), '[]'::jsonb)
        FROM (
          SELECT activity_year, COUNT(DISTINCT permit_id) AS permit_count
          FROM public.real_property_permit_parcel_relationship
          WHERE activity_year IS NOT NULL
          GROUP BY activity_year
        ) yearly
      ) AS yearly_counts,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('label', permit_type, 'count', permit_count) ORDER BY permit_count DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(permit_type, 'unknown') AS permit_type, COUNT(DISTINCT permit_id) AS permit_count
          FROM public.real_property_permit_parcel_relationship
          GROUP BY COALESCE(permit_type, 'unknown')
          ORDER BY permit_count DESC, COALESCE(permit_type, 'unknown')
          LIMIT 6
        ) types
      ) AS top_permit_types,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('label', permit_segment, 'count', permit_count) ORDER BY permit_count DESC), '[]'::jsonb)
        FROM (
          SELECT permit_segment, COUNT(*) AS permit_count
          FROM public.permit_intelligence_segments
          WHERE NULLIF(TRIM(permit_segment), '') IS NOT NULL
          GROUP BY permit_segment
          ORDER BY permit_count DESC
          LIMIT 6
        ) segments
      ) AS top_segments,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('label', zoning_jurisdiction_name, 'count', permit_count) ORDER BY permit_count DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(zoning_jurisdiction_name, 'unknown') AS zoning_jurisdiction_name, COUNT(DISTINCT permit_id) AS permit_count
          FROM public.real_property_permit_parcel_relationship
          GROUP BY COALESCE(zoning_jurisdiction_name, 'unknown')
          ORDER BY permit_count DESC, COALESCE(zoning_jurisdiction_name, 'unknown')
          LIMIT 6
        ) geographies
      ) AS top_geographies
    """,
)


@router.post("/search", response_model=CfsAiSearchResponse)
def search_cfs(
    request: CfsAiSearchRequest,
    db: Session = Depends(get_read_only_db),
) -> CfsAiSearchResponse:
    """Answer CFS indicator questions from compact server-side context."""

    context = gather_cfs_ai_context(db)
    return CfsAiSearchService(get_settings()).search(request, context)


def gather_cfs_ai_context(_db: Session) -> CfsAiContext:
    cached = _ASK_CFS_CONTEXT_CACHE.get("payload")
    expires_at = _ASK_CFS_CONTEXT_CACHE.get("expires_at")
    if isinstance(expires_at, datetime) and expires_at > datetime.now(UTC) and cached:
        return copy.deepcopy(cached)

    context: CfsAiContext = {
        "as_of": datetime.now(UTC).isoformat(),
        "caveats": [],
        "methodology": {
            "school_pressure": (
                "CFS combines preliminary school utilization context with observed permit activity "
                "inside attendance areas as a planning review signal, not an official enrollment forecast."
            ),
            "model_lab": "Model Lab is internal research only and does not expose exact probabilities.",
        },
    }

    indicator_intelligence = get_cached_indicator_intelligence()
    if indicator_intelligence is None:
        context["caveats"].append(
            "Live indicator context is still warming, so CFS used available grounded summary context.",
        )
    context["indicator_intelligence"] = indicator_intelligence or _fast_development_context(_db, context)
    context["indicator_summary"] = {}
    context["school_pressure"] = {"features": [], "summary": {}, "total_count": 0}

    # ponytail: in-process cache; switch to shared cache if API runs multi-worker locally.
    _ASK_CFS_CONTEXT_CACHE["payload"] = copy.deepcopy(context)
    _ASK_CFS_CONTEXT_CACHE["expires_at"] = datetime.now(UTC) + ASK_CFS_CONTEXT_CACHE_TTL
    return context


def _fast_development_context(db: Session, context: CfsAiContext) -> dict:
    try:
        row = db.execute(_FAST_DEVELOPMENT_SQL).mappings().one()
    except Exception:
        context["caveats"].append("Fast development activity summary is unavailable.")
        return {}

    yearly_counts = _json_rows(row.get("yearly_counts"))
    latest = yearly_counts[-1] if yearly_counts else {}
    previous = yearly_counts[-2] if len(yearly_counts) > 1 else {}
    recent_count = int(latest.get("count") or 0)
    previous_count = int(previous.get("count") or 0)
    delta = recent_count - previous_count if latest and previous else None
    pct = (delta / previous_count * 100) if delta is not None and previous_count else None

    return {
        "development_activity_detail": {
            "active_parcels": int(row.get("active_parcels") or 0),
            "caveats": [
                "Observed permit activity only; not a prediction.",
                "Permit records do not always equal completed construction.",
            ],
            "delta": delta,
            "pct_change": pct,
            "previous_count": previous_count,
            "previous_window": previous.get("year"),
            "recent_count": recent_count,
            "recent_window": latest.get("year"),
            "strongest_year": max(yearly_counts, key=lambda item: item["count"], default={}),
            "top_geographies": _json_rows(row.get("top_geographies")),
            "top_geography_type": "zoning jurisdiction",
            "top_permit_types": _json_rows(row.get("top_permit_types")),
            "top_segments": _json_rows(row.get("top_segments")),
            "total_records": int(row.get("total_records") or 0),
            "weakest_year": min(yearly_counts, key=lambda item: item["count"], default={}),
            "yearly_counts": yearly_counts,
            "years_available": [item["year"] for item in yearly_counts],
        },
    }


def _json_rows(value: Any) -> list[dict[str, Any]]:
    if not value:
        return []
    rows = json.loads(value) if isinstance(value, str) else value
    return [
        {
            "count": int(row.get("count") or 0),
            **({"year": int(row["year"])} if row.get("year") is not None else {"label": row.get("label")}),
        }
        for row in rows
        if isinstance(row, dict)
    ]
