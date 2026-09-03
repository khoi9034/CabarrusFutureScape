"""Grounded CFS AI/search endpoint."""

from __future__ import annotations

import json
import copy
import logging
import time
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_optional_read_only_db
from app.routers.economics_router import get_cached_economics_intelligence
from app.routers.indicators_router import get_cached_indicator_intelligence
from app.schemas.ai_search import CfsAiContext, CfsAiSearchRequest, CfsAiSearchResponse
from app.services.ai_search_service import (
    CfsAiSearchService,
    get_ai_provider_status,
    is_map_context_query,
    safe_filter_context,
)

router = APIRouter(prefix="/ai", tags=["CFS AI Search"])
LOGGER = logging.getLogger(__name__)
ASK_CFS_CONTEXT_CACHE_TTL = timedelta(minutes=30)
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

_MAP_EXTENT_SQL = text(
    """
    WITH bounds AS (
      SELECT ST_MakeEnvelope(:xmin, :ymin, :xmax, :ymax, 4326) AS geometry
    ),
    visible_parcels AS MATERIALIZED (
      SELECT p.official_parcel_id, p.pin14, p.parcel_area_acres_calc
      FROM public.parcels_enriched p
      CROSS JOIN bounds b
      WHERE :countywide OR (
        p.geometry && b.geometry
        AND ST_Intersects(p.geometry, b.geometry)
      )
    ),
    visible_permits AS MATERIALIZED (
      SELECT
        r.permit_id,
        r.permit_number,
        r.official_parcel_id,
        r.pin14,
        r.activity_date,
        r.permit_type,
        s.permit_segment,
        s.is_residential_growth,
        s.is_commercial_activity,
        s.is_major_value,
        s.permit_signal_score,
        COALESCE(f.flood_review_required, FALSE) AS flood_review_required
      FROM public.real_property_permit_parcel_relationship r
      JOIN visible_parcels p ON p.official_parcel_id = r.official_parcel_id
      LEFT JOIN public.permit_intelligence_segments s ON s.permit_id = r.permit_id
      LEFT JOIN public.parcel_flood_constraint_overlay f
        ON f.official_parcel_id = r.official_parcel_id
      WHERE (CAST(:permit_year_start AS integer) IS NULL OR r.activity_year >= CAST(:permit_year_start AS integer))
        AND (CAST(:permit_year_end AS integer) IS NULL OR r.activity_year <= CAST(:permit_year_end AS integer))
        AND (CAST(:permit_segment AS text) IS NULL OR s.permit_segment = CAST(:permit_segment AS text))
    )
    SELECT
      (SELECT COUNT(*)::int FROM visible_parcels) AS parcel_count,
      (SELECT COUNT(DISTINCT permit_id)::int FROM visible_permits) AS permit_count,
      (SELECT MIN(activity_date) FROM visible_permits) AS permit_date_min,
      (SELECT MAX(activity_date) FROM visible_permits) AS permit_date_max,
      (SELECT (COUNT(DISTINCT permit_id) FILTER (WHERE is_residential_growth))::int FROM visible_permits) AS residential_permit_count,
      (SELECT (COUNT(DISTINCT permit_id) FILTER (WHERE is_commercial_activity))::int FROM visible_permits) AS commercial_permit_count,
      (SELECT (COUNT(DISTINCT permit_id) FILTER (WHERE is_major_value))::int FROM visible_permits) AS major_value_permit_count,
      (
        SELECT COUNT(*)::int
        FROM public.development_activity_parcel_summary d
        JOIN visible_parcels p ON p.official_parcel_id = d.official_parcel_id
        WHERE COALESCE(d.total_permit_count, 0) > 0
      ) AS hotspot_count,
      (
        SELECT COUNT(*)::int
        FROM public.parcel_flood_constraint_overlay f
        JOIN visible_parcels p ON p.official_parcel_id = f.official_parcel_id
        WHERE f.flood_review_required IS TRUE
      ) AS flood_review_parcel_count,
      (
        SELECT COUNT(*)::int
        FROM public.school_zones z
        CROSS JOIN bounds b
        WHERE :countywide OR (
          z.geometry && b.geometry
          AND ST_Intersects(z.geometry, b.geometry)
        )
      ) AS school_zone_count,
      (
        SELECT COUNT(DISTINCT z.zone_id)::int
        FROM public.school_zones z
        JOIN public.school_presentation_utilization_seed u
          ON u.matched_school_reference_id = z.matched_school_reference_id
        CROSS JOIN bounds b
        WHERE (:countywide OR (
            z.geometry && b.geometry
            AND ST_Intersects(z.geometry, b.geometry)
          ))
          AND u.utilization_class IN ('over_capacity', 'severely_over_capacity')
      ) AS school_pressure_zone_count,
      CASE WHEN :include_top_permits THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(ranked))
        FROM (
          SELECT
            permit_id, permit_number, official_parcel_id, pin14, activity_date,
            permit_type, permit_segment, is_major_value, flood_review_required
          FROM (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY permit_id
              ORDER BY is_major_value DESC NULLS LAST,
                permit_signal_score DESC NULLS LAST, activity_date DESC NULLS LAST
            ) AS duplicate_rank
            FROM visible_permits
            WHERE permit_id IS NOT NULL
          ) candidates
          WHERE duplicate_rank = 1
          ORDER BY is_major_value DESC NULLS LAST,
            permit_signal_score DESC NULLS LAST, activity_date DESC NULLS LAST
          LIMIT 5
        ) ranked
      ), '[]'::jsonb) ELSE '[]'::jsonb END AS top_permits,
      CASE WHEN :include_top_hotspots THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(ranked))
        FROM (
          SELECT d.official_parcel_id, d.pin14, d.latest_permit_date,
            d.total_permit_count, d.recent_permit_count_1yr,
            d.dominant_permit_type, d.development_activity_class
          FROM public.development_activity_parcel_summary d
          JOIN visible_parcels p ON p.official_parcel_id = d.official_parcel_id
          WHERE COALESCE(d.total_permit_count, 0) > 0
          ORDER BY d.recent_permit_count_1yr DESC NULLS LAST,
            d.latest_permit_date DESC NULLS LAST,
            d.total_permit_count DESC NULLS LAST
          LIMIT 5
        ) ranked
      ), '[]'::jsonb) ELSE '[]'::jsonb END AS top_hotspots
    """
)


@router.post("/search", response_model=CfsAiSearchResponse)
def search_cfs(
    request: CfsAiSearchRequest,
    db: Session | None = Depends(get_optional_read_only_db, scope="function"),
) -> CfsAiSearchResponse:
    """Answer CFS indicator questions from compact server-side context."""

    start = time.perf_counter()
    context = gather_cfs_ai_context(db, request)
    context_ms = int((time.perf_counter() - start) * 1000)
    response = CfsAiSearchService(get_settings()).search(request, context)
    response.timings_ms = {**response.timings_ms, "context_ms": context_ms}
    response.response_time_ms = (
        response.timings_ms.get("total_ms", 0) + context_ms
    )
    LOGGER.info(
        "ai_search request_received request_id=%s app_mode=%s context_ms=%s total_ms=%s provider_status=%s",
        response.request_id,
        request.app_mode,
        context_ms,
        response.timings_ms.get("total_ms"),
        response.provider_status,
    )
    return response


@router.get("/status")
def ai_status() -> dict[str, Any]:
    """Return safe AI/search status for local presentation checks."""

    context_keys = [key for key in _ASK_CFS_CONTEXT_CACHE if key.startswith("payload_")]
    return {
        **get_ai_provider_status(get_settings()),
        "context_cache": {
            "active_keys": context_keys,
            "ttl_seconds": int(ASK_CFS_CONTEXT_CACHE_TTL.total_seconds()),
        },
    }


def gather_cfs_ai_context(_db: Session | None, request: CfsAiSearchRequest | None = None) -> CfsAiContext:
    cache_key = f"payload_{request.app_mode if request else 'planning'}"
    expires_key = f"expires_at_{request.app_mode if request else 'planning'}"
    cached = _ASK_CFS_CONTEXT_CACHE.get(cache_key)
    expires_at = _ASK_CFS_CONTEXT_CACHE.get(expires_key)
    if (
        _db is not None
        and isinstance(expires_at, datetime)
        and expires_at > datetime.now(UTC)
        and cached
    ):
        return _with_request_context(copy.deepcopy(cached), request, _db)

    context: CfsAiContext = {
        "as_of": datetime.now(UTC).isoformat(),
        "caveats": [],
        "context_freshness": "current_session",
        "data_source": "local_live_backend",
        "provenance": {
            "data_origin": "local_api",
            "runtime_mode": "local",
            "schema_version": "1.0",
        },
        "methodology": {
            "school_pressure": (
                "CFS combines preliminary school utilization context with observed permit activity "
                "inside attendance areas as a planning review signal, not an official enrollment forecast."
            ),
            "model_lab": "Model Lab is internal research only and does not expose exact probabilities.",
        },
    }
    if _db is None:
        context["context_freshness"] = "fallback_partial"
        context["data_source"] = "unavailable"
        context["provenance"]["data_origin"] = "unavailable"
        context["caveats"].append(
            "Local PostGIS context is unavailable; no demonstration business data was substituted.",
        )

    indicator_intelligence = (
        get_cached_indicator_intelligence() if _db is not None else None
    )
    context["indicator_intelligence"] = indicator_intelligence or _fast_development_context(_db, context)
    if indicator_intelligence is None:
        context["context_freshness"] = "fallback_partial"
        context["caveats"].append(
            "Live indicator context is still warming, so CFS used available grounded summary context.",
        )
    context["indicator_summary"] = {}
    context["school_pressure"] = {"features": [], "summary": {}, "total_count": 0}
    if request and request.app_mode == "economics":
        if _db is None:
            context["context_freshness"] = "fallback_partial"
            context["caveats"].append("Economics context is unavailable, so CFS used data-needed economics guidance.")
            context["economics_intelligence"] = {}
        else:
            try:
                context["economics_intelligence"] = get_cached_economics_intelligence(_db)
            except Exception:
                context["context_freshness"] = "fallback_partial"
                context["caveats"].append("Economics context is unavailable, so CFS used data-needed economics guidance.")
                context["economics_intelligence"] = {}

    if context.get("context_freshness") != "fallback_partial":
        # ponytail: in-process cache; switch to shared cache if API runs multi-worker locally.
        _ASK_CFS_CONTEXT_CACHE[cache_key] = copy.deepcopy(context)
        _ASK_CFS_CONTEXT_CACHE[expires_key] = datetime.now(UTC) + ASK_CFS_CONTEXT_CACHE_TTL
    return _with_request_context(context, request, _db)


def _with_request_context(
    context: CfsAiContext,
    request: CfsAiSearchRequest | None,
    db: Session | None = None,
) -> CfsAiContext:
    if not request:
        return context
    clean_filters = safe_filter_context(request.filter_context)
    if clean_filters:
        context["filter_context"] = clean_filters
        context["filtered_context_summary"] = "; ".join(
            f"{key.replace('_', ' ')}={value}" for key, value in clean_filters.items()
        )
    if request.map_context:
        context["map_context"] = request.map_context.model_dump(exclude_none=True)
        if db is not None and is_map_context_query(request):
            map_context = request.map_context
            map_cache_key = (
                f"map_{map_context.view_signature}_{map_context.permit_year_start}_"
                f"{map_context.permit_year_end}_{map_context.permit_segment}"
            )
            cached_map = _ASK_CFS_CONTEXT_CACHE.get(map_cache_key)
            cached_map_expires = _ASK_CFS_CONTEXT_CACHE.get(f"expires_at_{map_cache_key}")
            if (
                isinstance(cached_map, dict)
                and isinstance(cached_map_expires, datetime)
                and cached_map_expires > datetime.now(UTC)
            ):
                context["map_extent_summary"] = copy.deepcopy(cached_map)
                return context
            try:
                extent = map_context.extent
                normalized_query = request.query.lower()
                prior_permit_question = any(
                    "permit" in turn.query.lower()
                    for turn in request.conversation_context[-3:]
                )
                # ponytail: reuse whole-table aggregates only when the view contains the
                # current governed parcel-geometry extent; update after a parcel refresh.
                countywide = (
                    extent.xmin <= -80.787149
                    and extent.ymin <= 35.185001
                    and extent.xmax >= -80.295428
                    and extent.ymax >= 35.553456
                )
                row = db.execute(
                    _MAP_EXTENT_SQL,
                    {
                        "xmax": extent.xmax,
                        "xmin": extent.xmin,
                        "ymax": extent.ymax,
                        "ymin": extent.ymin,
                        "countywide": countywide,
                        "permit_segment": map_context.permit_segment,
                        "permit_year_end": map_context.permit_year_end,
                        "permit_year_start": map_context.permit_year_start,
                        "include_top_permits": (
                            any(term in normalized_query for term in ("inspect", "which ones", "which three"))
                            and ("permit" in normalized_query or prior_permit_question)
                        ),
                        "include_top_hotspots": not (
                            "permit" in normalized_query
                            and any(term in normalized_query for term in ("how many", "count", "number"))
                        ),
                    },
                ).mappings().one()
                context["map_extent_summary"] = {
                    key: (
                        list(value)
                        if key in {"top_hotspots", "top_permits"} and value
                        else value.isoformat()
                        if isinstance(value, (date, datetime))
                        else value
                    )
                    for key, value in row.items()
                }
                map_keys = [key for key in _ASK_CFS_CONTEXT_CACHE if key.startswith("map_")]
                if len(map_keys) >= 24:
                    oldest = map_keys[0]
                    _ASK_CFS_CONTEXT_CACHE.pop(oldest, None)
                    _ASK_CFS_CONTEXT_CACHE.pop(f"expires_at_{oldest}", None)
                _ASK_CFS_CONTEXT_CACHE[map_cache_key] = copy.deepcopy(context["map_extent_summary"])
                _ASK_CFS_CONTEXT_CACHE[f"expires_at_{map_cache_key}"] = datetime.now(UTC) + timedelta(minutes=2)
            except Exception:
                LOGGER.exception("Ask CFS map-extent aggregation failed")
                context["map_extent_summary"] = {"status": "unavailable"}
    return context


def _fast_development_context(db: Session | None, context: CfsAiContext) -> dict:
    if db is None:
        context["caveats"].append("Fast development activity summary is unavailable.")
        return {}
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
