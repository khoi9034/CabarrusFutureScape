"""Export a small static CFS portfolio demo dataset.

This script reads the local PostGIS-backed CFS development database and writes
safe, browser-served JSON files under public/demo-data. It intentionally uses
clean/summary tables only and does not export owner names, mailing addresses,
raw model scores, exact probabilities, or raw/source-heavy tables.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import psycopg
from psycopg.rows import dict_row


REPO_ROOT = Path(__file__).resolve().parents[1]
DEMO_DATA_DIR = REPO_ROOT / "public" / "demo-data"
DEMO_MAP_LAYER_DIR = DEMO_DATA_DIR / "map_layers"
SAMPLE_PARCEL_LIMIT = 300
DEMO_PARCEL_LAYER_LIMIT = 300
DEMO_HOTSPOT_LAYER_LIMIT = 220
DEMO_FLOOD_LAYER_LIMIT = 160
DEMO_SCHOOL_LAYER_LIMIT = 120
DEMO_TRANSPORTATION_LAYER_LIMIT = 80
DEMO_MODEL_LAB_MARKER_LIMIT = 180

DATA_STILL_NEEDED = [
    {
        "best_format": "REST/GIS/table",
        "id": "wsacc-utility-capacity",
        "label": "WSACC true utility capacity",
        "status": "Data still needed",
        "unlocks": "Capacity-aware utility readiness review",
    },
    {
        "best_format": "REST/GIS/table",
        "id": "official-school-capacity",
        "label": "Official school enrollment/capacity",
        "status": "Data still needed",
        "unlocks": "Verified school capacity watch",
    },
    {
        "best_format": "REST/GIS/table",
        "id": "official-rezoning-records",
        "label": "Official rezoning records",
        "status": "Data still needed",
        "unlocks": "Rezoning-aware planning context",
    },
    {
        "best_format": "REST/GIS/table",
        "id": "countywide-development-pipeline",
        "label": "Countywide development pipeline",
        "status": "Data still needed",
        "unlocks": "Subdivision and site-plan monitoring",
    },
    {
        "best_format": "GIS/table",
        "id": "future-land-use",
        "label": "Future land use / small-area plans",
        "status": "Data still needed",
        "unlocks": "Plan-alignment review",
    },
    {
        "best_format": "GIS/table",
        "id": "planned-road-projects",
        "label": "Planned road projects",
        "status": "Data still needed",
        "unlocks": "Transportation readiness context",
    },
    {
        "best_format": "GIS/table",
        "id": "planned-utility-extensions",
        "label": "Planned utility extensions",
        "status": "Data still needed",
        "unlocks": "Utility expansion context",
    },
]


def main() -> int:
    DEMO_DATA_DIR.mkdir(parents=True, exist_ok=True)
    DEMO_MAP_LAYER_DIR.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    with psycopg.connect(get_local_connection_string(), row_factory=dict_row) as conn:
        development_statistics = build_development_statistics(conn)
        development_activity_summary = build_development_activity_summary(conn)
        development_years = build_development_years(conn, generated_at)
        permit_segments = build_permit_segment_statistics(conn)
        development_trends = build_development_trends(conn)
        flood_summary = build_flood_summary(conn)
        school_watch = build_school_capacity_watch(conn)
        school_pressure = build_school_pressure_demo(conn, generated_at)
        school_pressure_summary = summarize_school_pressure_response(
            school_pressure,
        )
        model_status = build_model_status(generated_at)
        model_lab_demo_clusters = build_model_lab_demo_clusters(conn, generated_at)
        sample_parcels = build_sample_parcels(conn, generated_at)
        map_layer_manifest = export_demo_map_layers(
            conn,
            generated_at,
            school_pressure,
        )

    indicator_summary = {
        "available": True,
        "caveats": [
            "Portfolio demo uses a cached local extract, not a live production database.",
            "Monitoring indicators are not official determinations.",
            "Preliminary school utilization must be verified with official enrollment and capacity.",
            "Utility proxy context does not confirm available capacity.",
            "Model research remains internal and does not show exact probabilities or raw scores.",
        ],
        "data_still_needed": DATA_STILL_NEEDED,
        "development_activity": {
            "activity_summary": development_activity_summary,
            "permit_segments": permit_segments,
            "statistics": development_statistics,
        },
        "floodplain_review": flood_summary,
        "generated_at": generated_at,
        "model_status": model_status,
        "school_capacity_watch": {
            "qa_summary": school_watch["qa_summary"],
            "statistics": school_watch["statistics"],
            "utilization_seed": school_watch["utilization_seed"],
        },
        "school_pressure": school_pressure_summary,
        "utility_readiness": {
            "caveat": "Utility proxy does not confirm available capacity.",
            "status": "Data still needed",
            "true_capacity_available": False,
        },
    }
    indicator_intelligence = build_indicator_intelligence_demo(
        generated_at=generated_at,
        development_statistics=development_statistics,
        development_trends=development_trends,
        flood_summary=flood_summary,
        permit_segments=permit_segments,
        school_pressure_summary=school_pressure_summary,
    )

    files = {
        "demo_manifest.json": {
            "caveat": "Portfolio demo uses cached CFS demo data, not a live production database.",
            "generated_at": generated_at,
            "mode": "portfolio_demo",
            "record_counts": {
                "demo_map_layers": map_layer_manifest["layer_count"],
                "sample_parcels": sample_parcels["total_count"],
                "school_capacity_rows": school_watch["utilization_seed"]["total_count"],
                "permit_segment_buckets": len(permit_segments["by_permit_segment"]),
                "development_annual_trends": len(development_trends["annual_trends"]),
            },
            "source_label": "Local CFS PostGIS cached extract",
        },
        "indicator_intelligence.json": indicator_intelligence,
        "indicator_summary.json": indicator_summary,
        "development_trends.json": {
            "available": bool(development_trends["annual_trends"]),
            "generated_at": generated_at,
            "trends": development_trends,
        },
        "development_years.json": development_years,
        "flood_summary.json": {
            "available": flood_summary["total_parcels"] > 0,
            "generated_at": generated_at,
            "summary": flood_summary,
        },
        "school_capacity_watch.json": {
            "available": school_watch["statistics"]["total_parcels"] > 0
            or school_watch["utilization_seed"]["total_count"] > 0,
            "generated_at": generated_at,
            **school_watch,
        },
        "school_pressure_summary.json": school_pressure_summary,
        "model_status.json": model_status,
        "sample_parcels.json": sample_parcels,
        "model_lab_demo_clusters.json": model_lab_demo_clusters,
    }

    for filename, payload in files.items():
        write_json(DEMO_DATA_DIR / filename, payload)

    total_bytes = sum(path.stat().st_size for path in DEMO_DATA_DIR.rglob("*") if path.is_file())
    print(
        json.dumps(
            {
                "demo_data_dir": str(DEMO_DATA_DIR),
                "file_count": len(files) + map_layer_manifest["layer_count"] + 1,
                "sample_parcels": sample_parcels["total_count"],
                "total_bytes": total_bytes,
            },
            indent=2,
        ),
    )
    return 0


def get_local_connection_string() -> str:
    explicit_url = os.getenv("CFS_DEMO_EXPORT_DATABASE_URL") or os.getenv(
        "CFS_LOCAL_DATABASE_URL",
    )
    if explicit_url:
        return normalize_psycopg_url(explicit_url)

    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5433")
    database = os.getenv("POSTGRES_DB", "cfs_dev")
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD") or ""
    auth = quote_plus(user)
    if password:
        auth = f"{auth}:{quote_plus(password)}"
    return f"postgresql://{auth}@{host}:{port}/{database}"


def normalize_psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


STATUS_SEVERITY = {
    "normal": 0,
    "monitor": 1,
    "review": 2,
    "data_needed": 2,
    "unavailable": 2,
    "elevated_review": 4,
}

WATCHLIST_SORT = {
    "elevated_review": 0,
    "review": 1,
    "data_needed": 2,
    "monitor": 3,
    "unavailable": 4,
    "normal": 5,
}


def build_indicator_intelligence_demo(
    *,
    generated_at: str,
    development_statistics: dict[str, Any],
    development_trends: dict[str, Any],
    flood_summary: dict[str, Any],
    permit_segments: dict[str, Any],
    school_pressure_summary: dict[str, Any],
) -> dict[str, Any]:
    annual = development_trends.get("annual_trends", [])
    latest = annual[-1] if annual else {}
    previous = annual[-2] if len(annual) > 1 else {}
    latest_count = int(latest.get("permit_count") or 0)
    previous_count = int(previous.get("permit_count") or 0)
    delta = latest_count - previous_count if latest and previous else 0
    pct = (delta / previous_count * 100) if previous_count else None
    school_summary = school_pressure_summary.get("summary", {})
    school_elevated = int(school_summary.get("elevated_review_count") or 0)
    school_data_needed = int(school_summary.get("data_needed_count") or 0)
    flood_review = int(flood_summary.get("review_required_parcels") or 0)
    flood_high = int(flood_summary.get("high_severe_buildability_parcels") or 0)
    top_segment = _top_demo_segment(permit_segments.get("by_permit_segment", []))

    signals = [
        _demo_signal(
            "observed_development_activity",
            "development_activity",
            "Observed Development Activity",
            "elevated_review" if pct is not None and pct >= 15 else "review" if delta > 0 else "monitor",
            latest_count or development_statistics.get("total_permits"),
            "permits",
            f"{delta:+,} permits" + (f" ({pct:+.1f}%)" if pct is not None else "") if latest and previous else "Trend comparison not available",
            "Countywide",
            [
                f"{development_statistics.get('total_permits', 0):,} permit records across {development_statistics.get('parcels_with_activity', 0):,} active parcels.",
                f"Dominant permit segment: {top_segment}.",
            ],
            ["Observed permit activity only; not a prediction."],
            "Review Development Hotspots by permit segment and year range.",
            ["Development Hotspots"],
            generated_at,
            confidence="high" if annual else "medium",
            trend_direction="up" if delta > 0 else "down" if delta < 0 else "flat",
        ),
        _demo_signal(
            "school_pressure",
            "school_pressure",
            "School Utilization + Growth Pressure",
            "elevated_review" if school_elevated else "data_needed" if school_data_needed else "review",
            school_elevated,
            "areas",
            None,
            "Attendance areas",
            [
                f"{school_summary.get('areas_analyzed', 0):,} attendance areas reviewed.",
                f"{school_elevated:,} areas have elevated review signal.",
                f"{school_data_needed:,} areas need utilization data follow-up.",
            ],
            school_pressure_summary.get("caveats", []),
            "Compare school utilization context with observed residential permit activity.",
            ["School Utilization + Permit Pressure", "Development Hotspots"],
            generated_at,
            confidence="medium",
        ),
        _demo_signal(
            "floodplain_review",
            "floodplain_review",
            "Floodplain Review",
            "elevated_review" if flood_high else "review" if flood_review else "monitor",
            flood_review,
            "parcels",
            None,
            "Countywide",
            [
                f"{flood_review:,} parcels need floodplain review.",
                f"{flood_summary.get('sfha_parcels', 0):,} Special Flood Hazard Area parcels; {flood_summary.get('floodway_parcels', 0):,} floodway parcels.",
            ],
            ["Floodplain Review is planning context, not a permitting determination."],
            "Confirm floodway, Special Flood Hazard Area, and local review requirements.",
            ["Floodplain Review"],
            generated_at,
        ),
        _demo_signal("utility_readiness", "utility_readiness", "Utility Readiness Coverage", "data_needed", "Data needed", None, None, "Countywide", ["True utility capacity and service readiness data are not available in CFS yet."], ["Utility proxy does not confirm available capacity."], "Request WSACC capacity and service readiness fields.", ["Utility Proxy"], generated_at, confidence="low"),
        _demo_signal("transportation_context", "transportation_context", "Transportation Project Context", "monitor", "Context available", None, None, "Countywide", ["Transportation context can be reviewed with observed permit activity."], ["Transportation Context is a coordination signal, not project approval."], "Review transportation context near active development areas.", ["Transportation Context", "Development Hotspots"], generated_at, confidence="medium"),
        _demo_signal("zoning_land_use_readiness", "zoning_land_use", "Zoning / Land Use Readiness", "data_needed", "Partial", None, None, "Countywide", ["Parcel zoning context is available; official rezoning and future land use data are still needed."], ["Official rezoning case records and future land use GIS remain data needs where unavailable."], "Request rezoning case records and future land use layers.", ["Parcel Intelligence"], generated_at, confidence="low"),
        _demo_signal("model_research_status", "model_research", "Model Research Status", "monitor", "Internal only", None, None, "Countywide", ["Model Lab exposes relative research signal context only."], ["Internal model research only; no exact probabilities or raw values are shown."], "Use Model Lab to guide questions, then verify source records.", ["Model Lab Research Signals"], generated_at, confidence="medium"),
        _demo_signal("data_readiness", "data_readiness", "Data Readiness", "data_needed", len(DATA_STILL_NEEDED), "data needs", None, "Countywide", [f"{len(DATA_STILL_NEEDED)} priority data needs are tracked."] + [item["label"] for item in DATA_STILL_NEEDED[:3]], ["Missing official data limits how far CFS can go beyond review signals."], "Prioritize official utility, school, rezoning, pipeline, and planning context data requests.", [], generated_at, confidence="high"),
    ]
    watchlist = sorted(
        [signal for signal in signals if signal["status_band"] != "normal"],
        key=lambda item: (-int(item["severity"]), WATCHLIST_SORT[item["status_band"]], item["title"]),
    )
    return {
        "as_of": generated_at,
        "caveats": [
            "Portfolio Demo uses a cached CFS demo extract.",
            "CFS indicators are planning review signals, not official determinations.",
            "Observed permit activity is not a prediction.",
        ],
        "domain_readiness": build_demo_domain_readiness(generated_at),
        "kpis": signals[:8],
        "mode": "demo",
        "signals": signals,
        "summary": {
            "total_signals": len(signals),
            "elevated_review_count": sum(1 for signal in signals if signal["status_band"] == "elevated_review"),
            "review_count": sum(1 for signal in signals if signal["status_band"] == "review"),
            "data_needed_count": sum(1 for signal in signals if signal["status_band"] == "data_needed"),
            "unavailable_count": sum(1 for signal in signals if signal["status_band"] == "unavailable"),
        },
        "watchlist": watchlist,
    }


def _demo_signal(
    id: str,
    domain: str,
    title: str,
    status_band: str,
    value: int | str | None,
    unit: str | None,
    trend_label: str | None,
    geography_label: str,
    evidence: list[str],
    caveats: list[str],
    recommended_followup: str,
    related_layers: list[str],
    generated_at: str,
    *,
    confidence: str = "high",
    trend_direction: str = "not_available",
) -> dict[str, Any]:
    return {
        "id": id,
        "domain": domain,
        "title": title,
        "status_band": status_band,
        "severity": STATUS_SEVERITY[status_band],
        "confidence": confidence,
        "value": value,
        "unit": unit,
        "trend_direction": trend_direction,
        "trend_label": trend_label,
        "geography_label": geography_label,
        "evidence": evidence,
        "caveats": caveats,
        "recommended_followup": recommended_followup,
        "related_layers": related_layers,
        "data_freshness": generated_at,
        "source_mode": "demo",
    }


def build_demo_domain_readiness(generated_at: str) -> list[dict[str, Any]]:
    return [
        _demo_readiness("Development Activity", True, True, True, "Observed permit and activity monitoring", "Permit record updates and segment normalization.", generated_at),
        _demo_readiness("Schools", True, True, True, "Preliminary school capacity watch plus permit pressure", "Official enrollment/capacity and student generation assumptions.", generated_at),
        _demo_readiness("Floodplain", True, True, False, "Floodplain review context", "Local floodplain review status and update cadence.", generated_at),
        _demo_readiness("Utilities", False, False, False, "Proxy context only", "True capacity and service readiness data.", generated_at),
        _demo_readiness("Transportation", True, True, False, "Transportation context with growth review", "Planned local project status and dated geometry.", generated_at),
        _demo_readiness("Zoning / Land Use", True, True, False, "Parcel zoning context", "Official rezoning case records and future land use layers.", generated_at),
        _demo_readiness("Model Research", True, True, False, "Internal relative research signal", "Governed model release criteria before production use.", generated_at),
    ]


def _demo_readiness(domain: str, available: bool, geometry: bool, temporal: bool, current_use: str, next_need: str, generated_at: str) -> dict[str, Any]:
    return {
        "domain": domain,
        "data_available": "yes" if available else "no",
        "geometry_available": geometry,
        "temporal_fields_available": temporal,
        "update_cadence_known": False,
        "source_freshness": generated_at,
        "local_live_status": "available" if available else "data needed",
        "demo_extract_status": "cached extract" if available else "not included",
        "coverage": "available" if available else "data needed",
        "current_use": current_use,
        "caveat": "Portfolio demo uses cached extract values; verify official source data before final decisions.",
        "next_data_need": next_need,
    }


def _top_demo_segment(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Not available from current source"
    first = rows[0]
    return f"{first.get('value', 'Unknown')} ({int(first.get('count') or 0):,})"


def build_development_statistics(conn: psycopg.Connection) -> dict[str, Any]:
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        return empty_development_statistics()

    relationship = fetch_one(
        conn,
        """
        SELECT
          COUNT(DISTINCT permit_id)::int AS total_permits,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS parcels_with_activity,
          MIN(activity_date)::text AS activity_date_min,
          MAX(activity_date)::text AS activity_date_max
        FROM public.real_property_permit_parcel_relationship
        """,
    )
    parcel_universe = table_count(conn, "development_activity_parcel_summary")
    activity_classes = {
        "high_activity": 0,
        "low_activity": 0,
        "moderate_activity": 0,
        "no_activity": 0,
        "very_high_activity": 0,
    }
    if table_exists(conn, "development_activity_parcel_summary"):
        for row in fetch_all(
            conn,
            """
            SELECT COALESCE(development_activity_class, 'no_activity') AS value,
                   COUNT(*)::int AS count
            FROM public.development_activity_parcel_summary
            GROUP BY COALESCE(development_activity_class, 'no_activity')
            """,
        ):
            if row["value"] in activity_classes:
                activity_classes[row["value"]] = int(row["count"] or 0)
    return {
        "activity_classes": activity_classes,
        "activity_date_max": relationship["activity_date_max"],
        "activity_date_min": relationship["activity_date_min"],
        "by_permit_type": bucket(conn, "real_property_permit_parcel_relationship", "permit_type"),
        "by_status": bucket(conn, "real_property_permit_parcel_relationship", "permit_status"),
        "by_work_type": bucket(conn, "real_property_permit_parcel_relationship", "work_type"),
        "by_zoning_category": bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "dominant_zoning_general_normalized",
        ),
        "by_zoning_jurisdiction": bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "zoning_jurisdiction_name",
        ),
        "filters_applied": {},
        "parcels_with_activity": int(relationship["parcels_with_activity"] or 0),
        "parcels_without_activity": max(
            int(parcel_universe) - int(relationship["parcels_with_activity"] or 0),
            0,
        ),
        "recent_activity_parcels_1yr": count_summary_positive(
            conn,
            "development_activity_parcel_summary",
            "recent_permit_count_1yr",
        ),
        "recent_activity_parcels_3yr": count_summary_positive(
            conn,
            "development_activity_parcel_summary",
            "recent_permit_count_3yr",
        ),
        "total_permits": int(relationship["total_permits"] or 0),
    }


def build_development_activity_summary(conn: psycopg.Connection) -> dict[str, Any]:
    stats = build_development_statistics(conn)
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        return empty_development_activity_summary()

    summary = fetch_one(
        conn,
        """
        SELECT
          COUNT(DISTINCT permit_id)::int AS total_permits,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS active_parcel_count,
          SUM(permit_amount)::float8 AS total_permit_amount,
          AVG(permit_amount)::float8 AS avg_permit_amount,
          MIN(activity_date)::text AS activity_date_min,
          MAX(activity_date)::text AS activity_date_max
        FROM public.real_property_permit_parcel_relationship
        """,
    )
    return {
        "active_parcel_count": int(summary["active_parcel_count"] or 0),
        "avg_permit_amount": as_number(summary["avg_permit_amount"]),
        "by_activity_class": summary_bucket(
            conn,
            "development_activity_parcel_summary",
            "development_activity_class",
        ),
        "by_month": monthly_trend(conn),
        "by_permit_type": summary_bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "permit_type",
        ),
        "by_status": summary_bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "permit_status",
        ),
        "by_work_type": summary_bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "work_type",
        ),
        "by_year": annual_summary(conn),
        "by_zoning_category": summary_bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "dominant_zoning_general_normalized",
        ),
        "by_zoning_jurisdiction": summary_bucket(
            conn,
            "real_property_permit_parcel_relationship",
            "zoning_jurisdiction_name",
        ),
        "date_range": {
            "activity_date_max": summary["activity_date_max"],
            "activity_date_min": summary["activity_date_min"],
        },
        "filters_applied": {},
        "recent_activity": {
            "recent_1yr_parcels": stats["recent_activity_parcels_1yr"],
            "recent_3yr_parcels": stats["recent_activity_parcels_3yr"],
        },
        "total_permit_amount": as_number(summary["total_permit_amount"]),
        "total_permits": int(summary["total_permits"] or 0),
    }


def build_permit_segment_statistics(conn: psycopg.Connection) -> dict[str, Any]:
    if not table_exists(conn, "permit_intelligence_segments"):
        return {
            "by_development_domain": [],
            "by_permit_growth_signal": [],
            "by_permit_segment": [],
            "by_permit_status_stage": [],
            "by_permit_value_class": [],
            "total_permits": 0,
        }
    return {
        "by_development_domain": bucket(conn, "permit_intelligence_segments", "development_domain"),
        "by_permit_growth_signal": bucket(conn, "permit_intelligence_segments", "permit_growth_signal"),
        "by_permit_segment": bucket(conn, "permit_intelligence_segments", "permit_segment"),
        "by_permit_status_stage": bucket(conn, "permit_intelligence_segments", "permit_status_stage"),
        "by_permit_value_class": bucket(conn, "permit_intelligence_segments", "permit_value_class"),
        "total_permits": table_count_distinct(conn, "permit_intelligence_segments", "permit_id"),
    }


def build_development_trends(conn: psycopg.Connection) -> dict[str, Any]:
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        empty = {
            "annual_trends": [],
            "date_range": {
                "activity_date_max": None,
                "activity_date_min": None,
                "end_year": None,
                "start_year": None,
            },
            "filters_applied": {},
            "group_by": None,
            "grouped_trends": [],
            "monthly_trends": [],
            "peak_month": None,
            "peak_year": None,
            "rolling_summary": None,
            "rolling_window": None,
            "total_permits": 0,
            "trend_direction": "Data still needed",
        }
        return empty

    annual = fetch_all(
        conn,
        """
        SELECT
          activity_year AS year,
          NULL::int AS month,
          COUNT(DISTINCT permit_id)::int AS permit_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS parcel_count,
          SUM(permit_amount)::float8 AS total_permit_amount,
          NULL::text AS permit_type,
          NULL::text AS work_type,
          NULL::text AS zoning_category,
          NULL::text AS zoning_jurisdiction_name
        FROM public.real_property_permit_parcel_relationship
        WHERE activity_year IS NOT NULL
        GROUP BY activity_year
        ORDER BY activity_year
        """,
    )
    monthly = fetch_all(
        conn,
        """
        SELECT
          activity_year AS year,
          activity_month AS month,
          COUNT(DISTINCT permit_id)::int AS permit_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS parcel_count,
          SUM(permit_amount)::float8 AS total_permit_amount,
          NULL::text AS permit_type,
          NULL::text AS work_type,
          NULL::text AS zoning_category,
          NULL::text AS zoning_jurisdiction_name
        FROM public.real_property_permit_parcel_relationship
        WHERE activity_year IS NOT NULL
          AND activity_month IS NOT NULL
        GROUP BY activity_year, activity_month
        ORDER BY activity_year DESC, activity_month DESC
        LIMIT 24
        """,
    )
    monthly = list(reversed(monthly))
    bounds = fetch_one(
        conn,
        """
        SELECT
          MIN(activity_date)::text AS activity_date_min,
          MAX(activity_date)::text AS activity_date_max,
          MIN(activity_year)::int AS start_year,
          MAX(activity_year)::int AS end_year,
          COUNT(DISTINCT permit_id)::int AS total_permits
        FROM public.real_property_permit_parcel_relationship
        """,
    )
    peak_year = None
    if annual:
      peak_year = max(annual, key=lambda row: row["permit_count"] or 0)["year"]
    return {
        "annual_trends": annual,
        "date_range": {
            "activity_date_max": bounds["activity_date_max"],
            "activity_date_min": bounds["activity_date_min"],
            "end_year": bounds["end_year"],
            "start_year": bounds["start_year"],
        },
        "filters_applied": {},
        "group_by": None,
        "grouped_trends": [],
        "monthly_trends": monthly,
        "peak_month": None,
        "peak_year": peak_year,
        "rolling_summary": None,
        "rolling_window": None,
        "total_permits": int(bounds["total_permits"] or 0),
        "trend_direction": trend_direction(annual),
    }


def build_development_years(
    conn: psycopg.Connection,
    generated_at: str,
) -> dict[str, Any]:
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        return {
            "available_years": [],
            "default_year_end": None,
            "default_year_start": None,
            "generated_at": generated_at,
            "max_year": None,
            "min_year": None,
            "mode": "portfolio_demo",
            "segment_year_counts": {},
            "yearly_counts": {},
        }

    segment_join = table_exists(conn, "permit_intelligence_segments")
    rows = fetch_all(
        conn,
        f"""
        SELECT
          r.activity_year::int AS year,
          COALESCE(s.permit_segment, 'administrative_or_unknown') AS permit_segment,
          COUNT(DISTINCT r.permit_id)::int AS permit_count
        FROM public.real_property_permit_parcel_relationship r
        {"""
        LEFT JOIN public.permit_intelligence_segments s
          ON s.permit_id = r.permit_id
        """ if segment_join else "LEFT JOIN (SELECT NULL::text AS permit_id, NULL::text AS permit_segment) s ON FALSE"}
        WHERE r.activity_year IS NOT NULL
        GROUP BY r.activity_year, COALESCE(s.permit_segment, 'administrative_or_unknown')
        ORDER BY r.activity_year, COALESCE(s.permit_segment, 'administrative_or_unknown')
        """,
    )

    yearly_counts: dict[str, int] = {}
    segment_year_counts: dict[str, dict[str, int]] = {}
    for row in rows:
        year = str(row["year"])
        segment = row["permit_segment"] or "administrative_or_unknown"
        count = int(row["permit_count"] or 0)
        yearly_counts[year] = yearly_counts.get(year, 0) + count
        segment_year_counts.setdefault(segment, {})[year] = count

    available_years = sorted(int(year) for year in yearly_counts)
    min_year = available_years[0] if available_years else None
    max_year = available_years[-1] if available_years else None

    return {
        "available_years": available_years,
        "caveat": "Demo permit years come from the cached local extract.",
        "default_year_end": max_year,
        "default_year_start": min_year,
        "generated_at": generated_at,
        "max_year": max_year,
        "min_year": min_year,
        "mode": "portfolio_demo",
        "segment_year_counts": segment_year_counts,
        "yearly_counts": yearly_counts,
    }


def build_flood_summary(conn: psycopg.Connection) -> dict[str, Any]:
    if not table_exists(conn, "parcel_flood_constraint_overlay"):
        return empty_flood_summary()
    total = table_count(conn, "parcel_flood_constraint_overlay")
    metrics = fetch_one(
        conn,
        """
        SELECT
          COUNT(*)::int AS total_parcels,
          COUNT(*) FILTER (WHERE floodplain_present)::int AS floodplain_parcels,
          COUNT(*) FILTER (WHERE floodway_present)::int AS floodway_parcels,
          COUNT(*) FILTER (WHERE sfha_present)::int AS sfha_parcels,
          COUNT(*) FILTER (WHERE flood_review_required)::int AS review_required_parcels,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(buildability_impact, '')) IN ('high', 'severe')
          )::int AS high_severe_buildability_parcels,
          ROUND(AVG(percent_parcel_constrained)::numeric, 4)::float8 AS average_percent_constrained,
          ROUND(MAX(percent_parcel_constrained)::numeric, 4)::float8 AS max_percent_constrained
        FROM public.parcel_flood_constraint_overlay
        """,
    )
    return {
        "average_percent_constrained": as_number(metrics["average_percent_constrained"]),
        "buildability_impact_distribution": flood_bucket(conn, "buildability_impact", total),
        "caveats": ["Based on FEMA floodplain data; FEMA remains authoritative."],
        "dominant_zone_distribution": flood_bucket(conn, "dominant_flood_zone", total),
        "filters_applied": {},
        "floodplain_parcels": int(metrics["floodplain_parcels"] or 0),
        "floodway_parcels": int(metrics["floodway_parcels"] or 0),
        "high_severe_buildability_parcels": int(
            metrics["high_severe_buildability_parcels"] or 0,
        ),
        "max_percent_constrained": as_number(metrics["max_percent_constrained"]),
        "review_required_parcels": int(metrics["review_required_parcels"] or 0),
        "severity_distribution": flood_bucket(conn, "flood_severity_class", total),
        "sfha_parcels": int(metrics["sfha_parcels"] or 0),
        "total_parcels": int(metrics["total_parcels"] or 0),
    }


def build_school_capacity_watch(conn: psycopg.Connection) -> dict[str, Any]:
    statistics = build_school_statistics(conn)
    qa_summary = build_school_qa_summary(conn, statistics)
    utilization_seed = build_school_utilization_seed(conn)
    return {
        "qa_summary": qa_summary,
        "statistics": statistics,
        "utilization_seed": utilization_seed,
    }


def build_school_statistics(conn: psycopg.Connection) -> dict[str, Any]:
    if not table_exists(conn, "parcel_school_summary"):
        return empty_school_statistics()

    total = table_count(conn, "parcel_school_summary")
    metrics = fetch_one(
        conn,
        """
        SELECT
          COUNT(*)::int AS total_parcels,
          COUNT(*) FILTER (WHERE has_elementary_assignment)::int AS elementary_assigned_parcels,
          COUNT(*) FILTER (WHERE has_middle_assignment)::int AS middle_assigned_parcels,
          COUNT(*) FILTER (WHERE has_high_assignment)::int AS high_assigned_parcels,
          COUNT(*) FILTER (WHERE NOT has_elementary_assignment)::int
            AS missing_elementary_assignment_parcels,
          COUNT(*) FILTER (WHERE NOT has_middle_assignment)::int
            AS missing_middle_assignment_parcels,
          COUNT(*) FILTER (WHERE NOT has_high_assignment)::int
            AS missing_high_assignment_parcels,
          COUNT(*) FILTER (WHERE school_assignment_review_required)::int
            AS assignment_review_required_parcels,
          COUNT(*) FILTER (WHERE school_capacity_data_available)::int
            AS capacity_data_available_parcels,
          COUNT(*) FILTER (WHERE NOT school_capacity_data_available)::int
            AS capacity_not_available_parcels,
          COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)::int
            AS school_constraint_score_non_null_parcels
        FROM public.parcel_school_summary
        """,
    )
    return {
        **{key: int(value or 0) for key, value in metrics.items()},
        "assignment_confidence_distribution": school_bucket(
            conn,
            "school_assignment_confidence",
            total,
        ),
        "caveats": [
            "School assignment context is preliminary until official capacity data is received.",
        ],
        "constraint_class_distribution": school_bucket(
            conn,
            "school_constraint_class",
            total,
        ),
        "filters_applied": {},
        "included_cfs_v1_zone_count": count_where(
            conn,
            "school_zones",
            "include_in_cfs_v1 IS TRUE",
        ),
        "included_public_ccs_reference_count": count_where(
            conn,
            "school_reference",
            "include_in_cfs_v1 IS TRUE AND school_system = 'CCS'",
        ),
        "reference_exclusion_distribution": school_reference_exclusions(conn),
        "safe_for_api_exposure": True,
        "school_reference_count": table_count(conn, "school_reference"),
        "school_zone_count": table_count(conn, "school_zones"),
        "summary_status_distribution": school_bucket(
            conn,
            "school_summary_status",
            total,
        ),
        "zone_level_distribution": zone_level_distribution(conn),
    }


def build_school_qa_summary(
    conn: psycopg.Connection,
    statistics: dict[str, Any],
) -> dict[str, Any]:
    return {
        "capacity_available": table_count(conn, "school_capacity") > 0,
        "caveats": ["Official school enrollment/capacity data is still needed."],
        "duplicate_normalized_names": [],
        "excluded_count_by_reason": school_reference_exclusions(conn),
        "included_public_ccs_count": statistics["included_public_ccs_reference_count"],
        "missing_elementary_assignment_count": statistics[
            "missing_elementary_assignment_parcels"
        ],
        "missing_high_assignment_count": statistics["missing_high_assignment_parcels"],
        "missing_middle_assignment_count": statistics["missing_middle_assignment_parcels"],
        "multi_zone_overlap_counts": {},
        "parcel_assignment_count": statistics["total_parcels"],
        "parcels_assigned_to_unmatched_school_zones": 0,
        "safe_for_api_exposure": True,
        "school_reference_count": statistics["school_reference_count"],
        "school_zones_count_by_level": zone_level_distribution(conn),
        "unmatched_zone_names": unmatched_zone_names(conn),
    }


def build_school_utilization_seed(conn: psycopg.Connection) -> dict[str, Any]:
    source_table = None
    if relation_exists(conn, "school_utilization_seed_current"):
        source_table = "school_utilization_seed_current"
    elif table_exists(conn, "school_presentation_utilization_seed"):
        source_table = "school_presentation_utilization_seed"

    if not source_table:
        return {
            "caveats": ["Preliminary school utilization data is not available."],
            "filters_applied": {},
            "limit": 0,
            "offset": 0,
            "rows": [],
            "total_count": 0,
        }

    total = table_count(conn, source_table)
    rows = fetch_all(
        conn,
        f"""
        SELECT
          school_name,
          school_name_normalized,
          school_level,
          school_year,
          utilization_pct::float8 AS utilization_pct,
          utilization_class,
          COALESCE(source_confidence, 'not_available') AS source_confidence,
          COALESCE(needs_verification, TRUE) AS needs_verification,
          matched_school_reference_id,
          match_confidence
        FROM public.{source_table}
        ORDER BY utilization_pct DESC NULLS LAST, school_level, school_name
        LIMIT 500
        """,
    )
    return {
        "caveats": [
            "Preliminary utilization from planning materials. Confirm with official enrollment and capacity.",
        ],
        "filters_applied": {},
        "limit": 500,
        "offset": 0,
        "rows": rows,
        "total_count": total,
    }


def build_model_status(generated_at: str) -> dict[str, Any]:
    return {
        "caveat": "Internal research only. No exact probabilities or raw scores are shown.",
        "current_best_internal_model": "Zoning + Transportation + Tax/Value",
        "exact_probabilities_shown": False,
        "feature_rows": 1430221,
        "generated_at": generated_at,
        "model_status": "Internal only",
        "production_ready": False,
        "public_exposure_allowed": False,
        "raw_model_values_visible": False,
    }


def build_model_lab_demo_clusters(
    conn: psycopg.Connection,
    generated_at: str,
) -> dict[str, Any]:
    required_tables = [
        "development_prediction_ranking_classes",
        "parcels_enriched",
    ]
    if not all(table_exists(conn, table) for table in required_tables):
        return {
            "available": False,
            "caveat": "Portfolio demo model research markers are not available from the current local source.",
            "generated_at": generated_at,
            "markers": [],
            "mode": "portfolio_demo",
            "relative_research_bands_only": True,
            "total_count": 0,
        }

    explanation_join = table_exists(
        conn,
        "development_prediction_ranking_explanations",
    )
    latest = fetch_one_or_none(
        conn,
        """
        SELECT model_experiment_id
        FROM public.development_prediction_ranking_classes
        GROUP BY model_experiment_id
        ORDER BY MAX(created_at) DESC
        LIMIT 1
        """,
    )
    if not latest:
        return {
            "available": False,
            "caveat": "Portfolio demo model research markers are not available from the current local source.",
            "generated_at": generated_at,
            "markers": [],
            "mode": "portfolio_demo",
            "relative_research_bands_only": True,
            "total_count": 0,
        }

    explanation_select = (
        """
          e.top_driver_1,
          e.top_driver_2,
          e.top_driver_3,
        """
        if explanation_join
        else """
          NULL::text AS top_driver_1,
          NULL::text AS top_driver_2,
          NULL::text AS top_driver_3,
        """
    )
    explanation_sql = (
        """
        LEFT JOIN public.development_prediction_ranking_explanations e
          ON e.model_experiment_id = r.model_experiment_id
         AND e.official_parcel_id = r.official_parcel_id
        """
        if explanation_join
        else ""
    )
    rows = fetch_all(
        conn,
        f"""
        SELECT
          r.official_parcel_id,
          r.model_experiment_id AS model_version,
          CASE
            WHEN r.development_signal_class = 'very_high_development_signal'
              THEN 'Very Strong Research Signal'
            WHEN r.development_signal_class = 'high_development_signal'
              THEN 'Strong Research Signal'
            WHEN r.development_signal_class = 'moderate_development_signal'
              THEN 'Moderate Research Signal'
            WHEN r.development_signal_class = 'low_development_signal'
              THEN 'Lower Research Signal'
            ELSE 'Insufficient Data'
          END AS research_band,
          CASE
            WHEN r.development_signal_class = 'very_high_development_signal'
              THEN 'top_5_percent_research_band'
            WHEN r.development_signal_class = 'high_development_signal'
              THEN 'top_15_percent_research_band'
            WHEN r.development_signal_class = 'moderate_development_signal'
              THEN 'top_15_percent_research_band'
            WHEN r.development_signal_class = 'low_development_signal'
              THEN 'remaining_research_band'
            ELSE 'insufficient_data'
          END AS research_rank_band,
          {explanation_select}
          ST_X(ST_PointOnSurface(p.geometry))::float8 AS longitude,
          ST_Y(ST_PointOnSurface(p.geometry))::float8 AS latitude
        FROM public.development_prediction_ranking_classes r
        JOIN public.parcels_enriched p
          ON p.official_parcel_id = r.official_parcel_id
        {explanation_sql}
        WHERE r.model_experiment_id = %s
          AND p.geometry IS NOT NULL
          AND NOT ST_IsEmpty(p.geometry)
          AND r.development_signal_class IN (
            'very_high_development_signal',
            'high_development_signal',
            'moderate_development_signal',
            'low_development_signal'
          )
        ORDER BY
          CASE r.development_signal_class
            WHEN 'very_high_development_signal' THEN 1
            WHEN 'high_development_signal' THEN 2
            WHEN 'moderate_development_signal' THEN 3
            WHEN 'low_development_signal' THEN 4
            ELSE 5
          END,
          md5(r.official_parcel_id)
        LIMIT %s
        """,
        (latest["model_experiment_id"], DEMO_MODEL_LAB_MARKER_LIMIT),
    )

    markers = []
    for index, row in enumerate(rows, start=1):
        drivers = [
            driver
            for driver in [
                normalize_model_driver(row.get("top_driver_1")),
                normalize_model_driver(row.get("top_driver_2")),
                normalize_model_driver(row.get("top_driver_3")),
            ]
            if driver
        ] or [
            "zoning context",
            "transportation access",
            "parcel/tax/value context",
        ]
        markers.append(
            {
                "caveat": "Relative research signal only. No exact probability shown.",
                "confidence_label": "Internal research only",
                "count": 1,
                "id": f"demo-model-{index:03d}",
                "label": f"Demo research parcel {index:03d}",
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "model_version": row.get("model_version"),
                "official_parcel_id": row.get("official_parcel_id"),
                "recommended_follow_up": "Review source records before drawing conclusions.",
                "research_band": row.get("research_band"),
                "research_rank_band": row.get("research_rank_band"),
                "top_drivers": drivers[:3],
                "type": "parcel",
            },
        )

    return {
        "available": bool(markers),
        "caveat": "Relative research signal only. No exact probability shown.",
        "generated_at": generated_at,
        "markers": markers,
        "mode": "portfolio_demo",
        "relative_research_bands_only": True,
        "safe_export_notes": [
            "No exact probabilities, raw model values, or official parcel classes are exported.",
            "Markers are cached demo context for portfolio review.",
        ],
        "total_count": len(markers),
    }


def build_sample_parcels(conn: psycopg.Connection, generated_at: str) -> dict[str, Any]:
    if not table_exists(conn, "parcels_enriched"):
        return {
            "available": False,
            "generated_at": generated_at,
            "records": [],
            "safe_export_notes": [
                "No parcel sample was exported because parcels_enriched is unavailable.",
            ],
            "total_count": 0,
        }

    zoning_join = table_exists(conn, "parcel_zoning_overlay_v2")
    qa_join = table_exists(conn, "parcel_zoning_intelligence_qa")
    dev_join = table_exists(conn, "development_activity_parcel_summary")
    flood_join = table_exists(conn, "parcel_flood_constraint_overlay")
    school_join = table_exists(conn, "parcel_school_summary")
    activity_order_expr = (
        "COALESCE(d.total_permit_count, 0)" if dev_join else "0"
    )

    select_sql = f"""
      SELECT
        p.official_parcel_id,
        p.objectid_1,
        p.pin14,
        p.subdiv_name AS subdivision,
        p.nbh_name AS neighborhood,
        p.parcel_quality_status,
        p.parcel_size_category,
        p.valuation_band,
        {column_expr('z', 'planning_jurisdiction_name', zoning_join)} AS planning_jurisdiction,
        {column_expr('z', 'zoning_jurisdiction_name', zoning_join)} AS zoning_jurisdiction,
        {column_expr('z', 'dominant_zoning_code_raw', zoning_join)} AS zoning_code,
        {column_expr('z', 'dominant_zoning_general_normalized', zoning_join)}
          AS zoning_category,
        {column_expr('z', 'zoning_assignment_confidence', zoning_join)}
          AS zoning_assignment_confidence,
        {array_expr('q', 'governance_warning_categories', qa_join)}
          AS governance_warnings,
        COALESCE({bool_expr('q', 'safe_for_dashboard', qa_join)}, TRUE)
          AS safe_for_dashboard,
        {column_expr('d', 'development_activity_class', dev_join)}
          AS development_activity_summary,
        {bool_expr('f', 'flood_review_required', flood_join)} AS flood_review_required,
        {bool_expr('f', 'sfha_present', flood_join)} AS sfha_present,
        {bool_expr('f', 'floodway_present', flood_join)} AS floodway_present,
        {column_expr('s', 'school_summary_status', school_join)}
          AS school_assignment_summary,
        {column_expr('s', 'elementary_school_name', school_join)}
          AS elementary_school_name,
        {column_expr('s', 'middle_school_name', school_join)}
          AS middle_school_name,
        {column_expr('s', 'high_school_name', school_join)}
          AS high_school_name
      FROM public.parcels_enriched p
      {optional_join(zoning_join, 'parcel_zoning_overlay_v2', 'z')}
      {optional_join(qa_join, 'parcel_zoning_intelligence_qa', 'q')}
      {optional_join(dev_join, 'development_activity_parcel_summary', 'd')}
      {optional_join(flood_join, 'parcel_flood_constraint_overlay', 'f')}
      {optional_join(school_join, 'parcel_school_summary', 's')}
      WHERE COALESCE({bool_expr('q', 'safe_for_dashboard', qa_join)}, TRUE) IS TRUE
      ORDER BY
        {activity_order_expr} DESC NULLS LAST,
        p.official_parcel_id ASC
      LIMIT %s
    """
    rows = fetch_all(conn, select_sql, (SAMPLE_PARCEL_LIMIT,))
    records = []
    for row in rows:
        school_parts = [
            row.get("elementary_school_name"),
            row.get("middle_school_name"),
            row.get("high_school_name"),
        ]
        school_summary = " / ".join(str(value) for value in school_parts if value)
        flood_bits = []
        if row.get("flood_review_required"):
            flood_bits.append("Flood review")
        if row.get("sfha_present"):
            flood_bits.append("Special Flood Hazard Area")
        if row.get("floodway_present"):
            flood_bits.append("Floodway")
        record = {
            "development_activity_summary": row.get("development_activity_summary"),
            "flood_summary": " / ".join(flood_bits) or None,
            "governance_warnings": row.get("governance_warnings") or [],
            "municipality": row.get("planning_jurisdiction"),
            "neighborhood": row.get("neighborhood"),
            "objectid_1": row.get("objectid_1"),
            "official_parcel_id": row["official_parcel_id"],
            "parcel_quality_status": row.get("parcel_quality_status"),
            "parcel_size_category": row.get("parcel_size_category"),
            "pin14": row.get("pin14"),
            "planning_boundary_type": None,
            "planning_jurisdiction": row.get("planning_jurisdiction"),
            "safe_for_dashboard": row.get("safe_for_dashboard"),
            "school_assignment_summary": school_summary or row.get("school_assignment_summary"),
            "subdivision": row.get("subdivision"),
            "valuation_band": row.get("valuation_band"),
            "zoning_assignment_confidence": row.get("zoning_assignment_confidence"),
            "zoning_category": row.get("zoning_category"),
            "zoning_code": row.get("zoning_code"),
            "zoning_jurisdiction": row.get("zoning_jurisdiction"),
        }
        record["search_text"] = " ".join(
            str(value)
            for value in [
                record["official_parcel_id"],
                record.get("pin14"),
                record.get("subdivision"),
                record.get("neighborhood"),
                record.get("zoning_jurisdiction"),
                record.get("zoning_code"),
                record.get("zoning_category"),
                record.get("school_assignment_summary"),
                record.get("development_activity_summary"),
                record.get("flood_summary"),
            ]
            if value
        )
        records.append(record)
    return {
        "available": bool(records),
        "generated_at": generated_at,
        "records": records,
        "safe_export_notes": [
            "Sensitive contact fields are excluded from the portfolio extract.",
            "Sample records are capped for portfolio demo use.",
        ],
        "total_count": len(records),
    }


def export_demo_map_layers(
    conn: psycopg.Connection,
    generated_at: str,
    school_pressure: dict[str, Any],
) -> dict[str, Any]:
    layers = {
        "demo_county_boundary.geojson": build_demo_county_boundary(generated_at),
        "demo_parcels.geojson": build_demo_parcel_features(conn, generated_at),
        "demo_development_hotspots.geojson": build_demo_development_hotspots(
            conn,
            generated_at,
        ),
        "demo_floodplain_review.geojson": build_demo_floodplain_review(
            conn,
            generated_at,
        ),
        "demo_school_capacity.geojson": build_demo_school_capacity(conn, generated_at),
        "demo_school_pressure_areas.geojson": feature_collection(
            school_pressure.get("features", []),
            generated_at=generated_at,
            layer_id="school_pressure",
            layer_label="Demo School Utilization + Permit Pressure",
            source_basis="school_zones plus observed permit activity by attendance area",
        ),
        "demo_transportation_context.geojson": build_demo_transportation_context(
            conn,
            generated_at,
        ),
        "demo_model_research.geojson": empty_feature_collection(
            generated_at=generated_at,
            layer_id="model_research",
            layer_label="Internal Model Research",
            message="Portfolio demo does not include parcel-level model research geometry.",
        ),
    }

    manifest_layers = []
    for filename, payload in layers.items():
        write_json(DEMO_MAP_LAYER_DIR / filename, payload)
        manifest_layers.append(
            {
                "feature_count": len(payload["features"]),
                "file": f"map_layers/{filename}",
                "id": payload["metadata"]["layer_id"],
                "label": payload["metadata"]["layer_label"],
                "status": payload["metadata"]["status"],
            },
        )

    manifest = {
        "generated_at": generated_at,
        "layer_count": len(layers),
        "layers": manifest_layers,
        "mode": "portfolio_demo",
        "safe_export_notes": [
            "Demo map layers are small cached extracts for portfolio review.",
            "Sensitive contact fields, exact probabilities, and raw model scores are excluded.",
        ],
    }
    write_json(DEMO_MAP_LAYER_DIR / "demo_layer_manifest.json", manifest)
    return manifest


def build_demo_parcel_features(conn: psycopg.Connection, generated_at: str) -> dict[str, Any]:
    if not table_exists(conn, "parcels_enriched"):
        return empty_feature_collection(
            generated_at=generated_at,
            layer_id="parcels",
            layer_label="Demo Parcels",
            message="Demo parcel geometry is not available from the local source.",
        )

    zoning_join = table_exists(conn, "parcel_zoning_overlay_v2")
    dev_join = table_exists(conn, "development_activity_parcel_summary")
    flood_join = table_exists(conn, "parcel_flood_constraint_overlay")
    school_join = table_exists(conn, "parcel_school_summary")
    activity_order_expr = "COALESCE(d.total_permit_count, 0)" if dev_join else "0"

    rows = fetch_all(
        conn,
        f"""
        SELECT
          p.official_parcel_id,
          ROUND(p.parcel_area_acres_calc::numeric, 3)::float8 AS acreage,
          p.parcel_size_category,
          {column_expr('z', 'planning_jurisdiction_name', zoning_join)} AS municipality,
          {column_expr('z', 'dominant_zoning_code_raw', zoning_join)} AS zoning,
          {column_expr('z', 'dominant_zoning_general_normalized', zoning_join)}
            AS zoning_category,
          {column_expr('d', 'development_activity_class', dev_join)}
            AS development_summary,
          {bool_expr('f', 'flood_review_required', flood_join)} AS flood_review_required,
          {bool_expr('f', 'sfha_present', flood_join)} AS sfha_present,
          {bool_expr('f', 'floodway_present', flood_join)} AS floodway_present,
          {column_expr('s', 'school_summary_status', school_join)}
            AS school_summary,
          {column_expr('s', 'elementary_school_name', school_join)}
            AS elementary_school_name,
          {column_expr('s', 'middle_school_name', school_join)}
            AS middle_school_name,
          {column_expr('s', 'high_school_name', school_join)}
            AS high_school_name,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(p.geometry, 0.00005),
            6
          ) AS geometry_geojson,
          ST_X(ST_PointOnSurface(p.geometry))::float8 AS centroid_lon,
          ST_Y(ST_PointOnSurface(p.geometry))::float8 AS centroid_lat,
          ST_XMin(p.geometry::box3d)::float8 AS xmin,
          ST_YMin(p.geometry::box3d)::float8 AS ymin,
          ST_XMax(p.geometry::box3d)::float8 AS xmax,
          ST_YMax(p.geometry::box3d)::float8 AS ymax
        FROM public.parcels_enriched p
        {optional_join(zoning_join, 'parcel_zoning_overlay_v2', 'z')}
        {optional_join(dev_join, 'development_activity_parcel_summary', 'd')}
        {optional_join(flood_join, 'parcel_flood_constraint_overlay', 'f')}
        {optional_join(school_join, 'parcel_school_summary', 's')}
        WHERE p.geometry IS NOT NULL
          AND COALESCE(p.has_valid_geometry, TRUE) IS TRUE
        ORDER BY
          {activity_order_expr} DESC NULLS LAST,
          p.official_parcel_id ASC
        LIMIT %s
        """,
        (DEMO_PARCEL_LAYER_LIMIT,),
    )

    features = []
    for row in rows:
        flood_summary = []
        if row.get("flood_review_required"):
            flood_summary.append("Floodplain review")
        if row.get("sfha_present"):
            flood_summary.append("Special Flood Hazard Area")
        if row.get("floodway_present"):
            flood_summary.append("Floodway")

        school_summary = " / ".join(
            str(value)
            for value in [
                row.get("elementary_school_name"),
                row.get("middle_school_name"),
                row.get("high_school_name"),
            ]
            if value
        ) or row.get("school_summary")

        features.append(
            geojson_feature(
                row.get("geometry_geojson"),
                {
                    "acreage": row.get("acreage"),
                    "centroid_latitude": row.get("centroid_lat"),
                    "centroid_longitude": row.get("centroid_lon"),
                    "development_summary": row.get("development_summary"),
                    "extent": {
                        "spatialReference": {"wkid": 4326},
                        "xmax": row.get("xmax"),
                        "xmin": row.get("xmin"),
                        "ymax": row.get("ymax"),
                        "ymin": row.get("ymin"),
                    },
                    "flood_summary": " / ".join(flood_summary) or None,
                    "municipality": row.get("municipality"),
                    "official_parcel_id": row.get("official_parcel_id"),
                    "parcel_size_category": row.get("parcel_size_category"),
                    "school_summary": school_summary,
                    "zoning": row.get("zoning"),
                    "zoning_category": row.get("zoning_category"),
                },
            ),
        )

    return feature_collection(
        features,
        generated_at=generated_at,
        layer_id="parcels",
        layer_label="Demo Parcels",
        source_basis="parcels_enriched joined to clean summary tables",
    )


def build_demo_development_hotspots(
    conn: psycopg.Connection,
    generated_at: str,
) -> dict[str, Any]:
    required_tables = [
        "parcels_enriched",
        "real_property_permit_parcel_relationship",
        "permit_intelligence_segments",
    ]
    if not all(table_exists(conn, table) for table in required_tables):
        return empty_feature_collection(
            generated_at=generated_at,
            layer_id="development_hotspots",
            layer_label="Demo Development Hotspots",
            message="Demo development hotspot geometry is not available from the local source.",
        )

    dev_join = table_exists(conn, "development_activity_parcel_summary")
    rows = fetch_all(
        conn,
        f"""
        WITH permit_events AS (
          SELECT
            r.official_parcel_id,
            r.permit_id,
            COALESCE(s.permit_segment, 'administrative_or_unknown')
              AS permit_segment,
            s.permit_growth_signal,
            s.is_active_construction,
            s.is_high_value,
            s.is_major_value,
            r.activity_date,
            r.activity_year::int AS permit_year
          FROM public.real_property_permit_parcel_relationship r
          LEFT JOIN public.permit_intelligence_segments s
            ON s.permit_id = r.permit_id
          WHERE r.has_parcel_match IS TRUE
            AND r.official_parcel_id IS NOT NULL
            AND r.activity_year IS NOT NULL
        ),
        parcel_year_segments AS (
          SELECT
            official_parcel_id,
            permit_segment,
            permit_year,
            COUNT(DISTINCT permit_id)::int AS permit_count
          FROM permit_events
          GROUP BY official_parcel_id, permit_segment, permit_year
        ),
        parcel_segments AS (
          SELECT
            official_parcel_id,
            COUNT(DISTINCT permit_id)::int AS total_permit_count,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'residential_growth'
            )::int AS residential_growth_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'commercial_activity'
            )::int AS commercial_activity_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'industrial_activity'
            )::int AS industrial_activity_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'institutional_activity'
            )::int AS institutional_activity_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'redevelopment_signal'
            )::int AS redevelopment_signal_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'minor_maintenance'
            )::int AS minor_maintenance_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE permit_segment = 'demolition'
            )::int AS demolition_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE is_active_construction IS TRUE
            )::int AS active_construction_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE is_high_value IS TRUE
            )::int AS high_value_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE is_major_value IS TRUE
            )::int AS major_value_permits,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE activity_date >= CURRENT_DATE - INTERVAL '1 year'
            )::int AS recent_permit_count_1yr,
            COUNT(DISTINCT permit_id) FILTER (
              WHERE activity_date >= CURRENT_DATE - INTERVAL '3 years'
            )::int AS recent_permit_count_3yr,
            MODE() WITHIN GROUP (ORDER BY permit_segment)
              AS dominant_permit_segment,
            MODE() WITHIN GROUP (ORDER BY permit_growth_signal)
              AS dominant_growth_signal,
            MIN(permit_year)::int AS year_start,
            MAX(permit_year)::int AS year_end,
            MAX(activity_date)::text AS latest_activity_date
          FROM permit_events
          GROUP BY official_parcel_id
        ),
        parcel_year_counts AS (
          SELECT
            official_parcel_id,
            jsonb_object_agg(permit_year::text, permit_count ORDER BY permit_year)
              AS yearly_counts
          FROM (
            SELECT
              official_parcel_id,
              permit_year,
              SUM(permit_count)::int AS permit_count
            FROM parcel_year_segments
            GROUP BY official_parcel_id, permit_year
          ) year_totals
          GROUP BY official_parcel_id
        ),
        parcel_segment_year_counts AS (
          SELECT
            official_parcel_id,
            jsonb_object_agg(permit_segment, year_counts ORDER BY permit_segment)
              AS segment_year_counts
          FROM (
            SELECT
              official_parcel_id,
              permit_segment,
              jsonb_object_agg(permit_year::text, permit_count ORDER BY permit_year)
                AS year_counts
            FROM parcel_year_segments
            GROUP BY official_parcel_id, permit_segment
          ) segment_totals
          GROUP BY official_parcel_id
        )
        SELECT
          ps.*,
          pyc.yearly_counts,
          psyc.segment_year_counts,
          p.pin14,
          {column_expr('d', 'development_activity_class', dev_join)}
            AS development_activity_class,
          {column_expr('d', 'dominant_zoning_code_raw', dev_join)}
            AS dominant_zoning_code_raw,
          {column_expr('d', 'zoning_jurisdiction_name', dev_join)}
            AS zoning_jurisdiction_name,
          ST_AsGeoJSON(ST_PointOnSurface(p.geometry), 6) AS geometry_geojson,
          ST_X(ST_PointOnSurface(p.geometry))::float8 AS centroid_lon,
          ST_Y(ST_PointOnSurface(p.geometry))::float8 AS centroid_lat
        FROM parcel_segments ps
        LEFT JOIN parcel_year_counts pyc
          ON pyc.official_parcel_id = ps.official_parcel_id
        LEFT JOIN parcel_segment_year_counts psyc
          ON psyc.official_parcel_id = ps.official_parcel_id
        JOIN public.parcels_enriched p
          ON p.official_parcel_id = ps.official_parcel_id
        {optional_join(dev_join, 'development_activity_parcel_summary', 'd')}
        WHERE p.geometry IS NOT NULL
        ORDER BY ps.total_permit_count DESC, ps.official_parcel_id ASC
        LIMIT %s
        """,
        (DEMO_HOTSPOT_LAYER_LIMIT,),
    )

    features = [
        geojson_feature(
            row.get("geometry_geojson"),
            {
                "active_construction_permits": row.get("active_construction_permits"),
                "commercial_activity_permits": row.get("commercial_activity_permits"),
                "demolition_permits": row.get("demolition_permits"),
                "development_activity_class": row.get("development_activity_class"),
                "dominant_growth_signal": row.get("dominant_growth_signal"),
                "dominant_permit_segment": row.get("dominant_permit_segment"),
                "dominant_zoning_code_raw": row.get("dominant_zoning_code_raw"),
                "high_value_permits": row.get("high_value_permits"),
                "industrial_activity_permits": row.get("industrial_activity_permits"),
                "institutional_activity_permits": row.get("institutional_activity_permits"),
                "intensity_category": get_demo_intensity_category(
                    int(row.get("total_permit_count") or 0),
                ),
                "label": format_demo_segment_label(row.get("dominant_permit_segment")),
                "latest_activity_date": row.get("latest_activity_date"),
                "major_value_permits": row.get("major_value_permits"),
                "minor_maintenance_permits": row.get("minor_maintenance_permits"),
                "official_parcel_id": row.get("official_parcel_id"),
                "permit_segment": row.get("dominant_permit_segment")
                or "administrative_or_unknown",
                "recent_permit_count_1yr": row.get("recent_permit_count_1yr"),
                "recent_permit_count_3yr": row.get("recent_permit_count_3yr"),
                "redevelopment_signal_permits": row.get("redevelopment_signal_permits"),
                "residential_growth_permits": row.get("residential_growth_permits"),
                "segment_year_counts": row.get("segment_year_counts") or {},
                "total_permit_count": row.get("total_permit_count"),
                "year_end": row.get("year_end"),
                "year_start": row.get("year_start"),
                "yearly_counts": row.get("yearly_counts") or {},
                "zoning_jurisdiction_name": row.get("zoning_jurisdiction_name"),
            },
        )
        for row in rows
    ]

    return feature_collection(
        features,
        generated_at=generated_at,
        layer_id="development_hotspots",
        layer_label="Demo Development Hotspots",
        source_basis="real_property_permit_parcel_relationship + permit_intelligence_segments",
    )


def build_demo_floodplain_review(
    conn: psycopg.Connection,
    generated_at: str,
) -> dict[str, Any]:
    if not table_exists(conn, "parcel_flood_constraint_overlay"):
        return empty_feature_collection(
            generated_at=generated_at,
            layer_id="floodplain_review",
            layer_label="Demo Floodplain Review",
            message="Demo floodplain review geometry is not available from the local source.",
        )

    rows = fetch_all(
        conn,
        """
        SELECT
          official_parcel_id,
          pin14,
          flood_review_required,
          floodway_present,
          sfha_present,
          dominant_flood_zone,
          dominant_flood_constraint_type,
          flood_severity_class,
          percent_parcel_constrained::float8 AS percent_parcel_constrained,
          buildability_impact,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(geometry, 0.00006),
            6
          ) AS geometry_geojson,
          ST_X(ST_PointOnSurface(geometry))::float8 AS centroid_lon,
          ST_Y(ST_PointOnSurface(geometry))::float8 AS centroid_lat
        FROM public.parcel_flood_constraint_overlay
        WHERE geometry IS NOT NULL
          AND (
            flood_review_required IS TRUE
            OR floodway_present IS TRUE
            OR sfha_present IS TRUE
          )
        ORDER BY
          floodway_present DESC,
          sfha_present DESC,
          percent_parcel_constrained DESC NULLS LAST,
          official_parcel_id ASC
        LIMIT %s
        """,
        (DEMO_FLOOD_LAYER_LIMIT,),
    )

    features = [
        geojson_feature(
            row.get("geometry_geojson"),
            {
                "buildability_impact": row.get("buildability_impact"),
                "centroid_latitude": row.get("centroid_lat"),
                "centroid_longitude": row.get("centroid_lon"),
                "dominant_flood_zone": row.get("dominant_flood_zone"),
                "flood_constraint_type": row.get("dominant_flood_constraint_type"),
                "flood_review_required": row.get("flood_review_required"),
                "flood_severity_class": normalize_flood_severity(
                    row.get("flood_severity_class"),
                    bool(row.get("floodway_present")),
                    bool(row.get("sfha_present")),
                ),
                "floodway_present": row.get("floodway_present"),
                "label": "Floodplain Review",
                "official_parcel_id": row.get("official_parcel_id"),
                "percent_parcel_constrained": row.get("percent_parcel_constrained"),
                "sfha_present": row.get("sfha_present"),
                "source_label": "FEMA floodplain data",
            },
        )
        for row in rows
    ]

    return feature_collection(
        features,
        generated_at=generated_at,
        layer_id="floodplain_review",
        layer_label="Demo Floodplain Review",
        source_basis="parcel_flood_constraint_overlay",
    )


def build_demo_school_capacity(conn: psycopg.Connection, generated_at: str) -> dict[str, Any]:
    if not table_exists(conn, "school_zones"):
        return empty_feature_collection(
            generated_at=generated_at,
            layer_id="school_capacity",
            layer_label="Demo School Capacity Watch",
            message="Demo school capacity geometry is not available from the local source.",
        )

    utilization_table = "school_utilization_seed_current" if relation_exists(
        conn,
        "school_utilization_seed_current",
    ) else (
        "school_presentation_utilization_seed"
        if table_exists(conn, "school_presentation_utilization_seed")
        else None
    )
    utilization_join = bool(utilization_table)
    utilization_pct_expr = (
        "u.utilization_pct::float8" if utilization_join else "NULL::float8"
    )
    rows = fetch_all(
        conn,
        f"""
        SELECT
          z.zone_id,
          z.school_name_raw AS school_name,
          z.school_name_normalized,
          z.school_level,
          z.school_system,
          z.matched_school_reference_id,
          z.match_confidence AS zone_match_confidence,
          z.source_layer,
          z.source_objectid,
          {column_expr('u', 'school_year', utilization_join)} AS school_year,
          {column_expr('u', 'utilization_class', utilization_join)}
            AS utilization_class,
          {column_expr('u', 'source_confidence', utilization_join)}
            AS source_confidence,
          {bool_expr('u', 'needs_verification', utilization_join)}
            AS needs_verification,
          {column_expr('u', 'match_confidence', utilization_join)}
            AS match_confidence,
          {utilization_pct_expr} AS utilization_pct,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(z.geometry, 0.00006),
            6
          ) AS geometry_geojson
        FROM public.school_zones z
        {optional_join_school_utilization(utilization_table)}
        WHERE z.geometry IS NOT NULL
          AND COALESCE(z.include_in_cfs_v1, TRUE) IS TRUE
        ORDER BY
          utilization_pct DESC NULLS LAST,
          z.school_level,
          z.school_name_raw
        LIMIT %s
        """,
        (DEMO_SCHOOL_LAYER_LIMIT,),
    )

    features = [
        geojson_feature(
            row.get("geometry_geojson"),
            {
                "label": "School Capacity Watch",
                "match_confidence": row.get("match_confidence"),
                "matched_school_reference_id": row.get("matched_school_reference_id"),
                "needs_verification": True
                if row.get("needs_verification") is None
                else row.get("needs_verification"),
                "school_level": row.get("school_level"),
                "school_name": row.get("school_name"),
                "school_name_normalized": row.get("school_name_normalized"),
                "school_system": row.get("school_system"),
                "school_year": row.get("school_year"),
                "source_confidence": row.get("source_confidence")
                or "not_available",
                "source_layer": row.get("source_layer"),
                "source_objectid": row.get("source_objectid"),
                "utilization_class": row.get("utilization_class"),
                "utilization_pct": row.get("utilization_pct"),
                "verification_status": "Needs official verification",
                "zone_id": row.get("zone_id"),
                "zone_match_confidence": row.get("zone_match_confidence"),
            },
        )
        for row in rows
    ]

    return feature_collection(
        features,
        generated_at=generated_at,
        layer_id="school_capacity",
        layer_label="Demo School Capacity Watch",
        source_basis="school_zones joined to preliminary utilization from planning materials",
    )


def build_school_pressure_demo(conn: psycopg.Connection, generated_at: str) -> dict[str, Any]:
    if not table_exists(conn, "school_zones"):
        return empty_school_pressure_response(generated_at)

    utilization_table = "school_utilization_seed_current" if relation_exists(
        conn,
        "school_utilization_seed_current",
    ) else (
        "school_presentation_utilization_seed"
        if table_exists(conn, "school_presentation_utilization_seed")
        else None
    )
    utilization_join = bool(utilization_table)
    permit_join = table_exists(
        conn,
        "real_property_permit_parcel_relationship",
    ) and table_exists(conn, "parcel_school_summary")
    permit_cte = """
      , permit_counts AS (
          SELECT NULL::text AS school_level,
                 NULL::text AS zone_id,
                 NULL::int AS permit_count_recent,
                 NULL::int AS permit_count_previous,
                 NULL::int AS residential_permit_count_recent,
                 NULL::int AS multifamily_permit_count_recent,
                 NULL::int AS major_development_permit_count_recent
          WHERE FALSE
      )
    """
    if permit_join:
        permit_cte = """
          , latest_permit_year AS (
              SELECT MAX(activity_year)::int AS max_year
              FROM public.real_property_permit_parcel_relationship
              WHERE activity_year BETWEEN 1990 AND 2100
          ),
          zone_parcels AS (
              SELECT 'elementary'::text AS school_level,
                     elementary_zone_id AS zone_id,
                     official_parcel_id
              FROM public.parcel_school_summary
              WHERE elementary_zone_id IS NOT NULL
              UNION ALL
              SELECT 'middle'::text, middle_zone_id, official_parcel_id
              FROM public.parcel_school_summary
              WHERE middle_zone_id IS NOT NULL
              UNION ALL
              SELECT 'high'::text, high_zone_id, official_parcel_id
              FROM public.parcel_school_summary
              WHERE high_zone_id IS NOT NULL
          ),
          permit_counts AS (
              SELECT
                  parcels.school_level,
                  parcels.zone_id,
                  COUNT(permit.official_parcel_id) FILTER (
                      WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                  )::int AS permit_count_recent,
                  COUNT(permit.official_parcel_id) FILTER (
                      WHERE permit.activity_year BETWEEN latest.max_year - 5 AND latest.max_year - 3
                  )::int AS permit_count_previous,
                  COUNT(permit.official_parcel_id) FILTER (
                      WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                        AND (
                          permit.permit_type ILIKE '%%residential%%'
                          OR permit.work_type ILIKE '%%residential%%'
                          OR permit.work_type ILIKE '%%single%%'
                          OR permit.work_type ILIKE '%%multi%%'
                        )
                  )::int AS residential_permit_count_recent,
                  COUNT(permit.official_parcel_id) FILTER (
                      WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                        AND permit.work_type ILIKE '%%multi%%'
                  )::int AS multifamily_permit_count_recent,
                  COUNT(permit.official_parcel_id) FILTER (
                      WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                        AND COALESCE(permit.permit_amount, 0) >= 1000000
                  )::int AS major_development_permit_count_recent
              FROM zone_parcels AS parcels
              CROSS JOIN latest_permit_year AS latest
              LEFT JOIN public.real_property_permit_parcel_relationship AS permit
                ON permit.official_parcel_id = parcels.official_parcel_id
              GROUP BY parcels.school_level, parcels.zone_id
          )
        """

    rows = fetch_all(
        conn,
        f"""
        WITH pressure_zones AS (
          SELECT
            z.zone_id,
            z.school_name_raw AS school_name,
            z.school_name_normalized,
            z.school_level,
            {column_expr('u', 'school_year', utilization_join)} AS school_year,
            {column_expr('u', 'utilization_class', utilization_join)} AS utilization_class,
            {"u.utilization_pct::float8" if utilization_join else "NULL::float8"} AS utilization_pct,
            {bool_expr('u', 'needs_verification', utilization_join)} AS needs_verification,
            ST_AsGeoJSON(
              ST_SimplifyPreserveTopology(z.geometry, 0.00006),
              6
            ) AS geometry_geojson
          FROM public.school_zones z
          {optional_join_school_utilization(utilization_table)}
          WHERE z.geometry IS NOT NULL
            AND COALESCE(z.include_in_cfs_v1, TRUE) IS TRUE
        )
        {permit_cte}
        SELECT
          pressure_zones.*,
          permit_counts.permit_count_recent,
          permit_counts.permit_count_previous,
          permit_counts.residential_permit_count_recent,
          permit_counts.multifamily_permit_count_recent,
          permit_counts.major_development_permit_count_recent
        FROM pressure_zones
        LEFT JOIN permit_counts
          ON permit_counts.zone_id = pressure_zones.zone_id
         AND permit_counts.school_level = pressure_zones.school_level
        ORDER BY
          pressure_zones.utilization_pct DESC NULLS LAST,
          COALESCE(permit_counts.permit_count_recent, 0) DESC,
          pressure_zones.school_level,
          pressure_zones.school_name
        LIMIT %s
        """,
        (DEMO_SCHOOL_LAYER_LIMIT,),
    )

    features = []
    for row in rows:
        properties = build_school_pressure_properties(row, permit_join)
        features.append(geojson_feature(row.get("geometry_geojson"), properties))

    summary = summarize_school_pressure_features(features)
    return {
        "as_of": generated_at,
        "caveats": [
            "Portfolio demo uses a cached CFS demo extract.",
            "Permit activity is not the same as student generation.",
            "This is not an official enrollment forecast.",
        ],
        "data_coverage_notes": [
            "Observed permit activity joined by parcel assignment to school attendance areas."
            if permit_join
            else "Permit activity by attendance area is not available in the cached demo extract.",
            "Official school enrollment/capacity verification is still needed.",
        ],
        "features": features,
        "limit": DEMO_SCHOOL_LAYER_LIMIT,
        "mode": "demo",
        "offset": 0,
        "summary": summary,
        "total_count": len(features),
    }


def build_demo_transportation_context(
    conn: psycopg.Connection,
    generated_at: str,
) -> dict[str, Any]:
    if not table_exists(conn, "transportation_centerlines_clean"):
        return empty_feature_collection(
            generated_at=generated_at,
            layer_id="transportation_context",
            layer_label="Demo Transportation Context",
            message="Demo transportation geometry is not available from the local source.",
        )

    rows = fetch_all(
        conn,
        """
        SELECT
          transportation_centerline_id,
          road_name,
          road_type,
          road_class,
          route_type,
          jurisdiction_or_maintenance,
          speed_limit,
          is_major_road,
          ROUND(geometry_length_ft::numeric, 1)::float8 AS geometry_length_ft,
          ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(geometry, 0.00008),
            6
          ) AS geometry_geojson
        FROM public.transportation_centerlines_clean
        WHERE geometry IS NOT NULL
          AND (
            is_major_road IS TRUE
            OR road_class IS NOT NULL
            OR geometry_length_ft > 2500
          )
        ORDER BY is_major_road DESC, geometry_length_ft DESC NULLS LAST
        LIMIT %s
        """,
        (DEMO_TRANSPORTATION_LAYER_LIMIT,),
    )

    features = [
        geojson_feature(
            row.get("geometry_geojson"),
            {
                "context_status": "Context available",
                "is_major_road": row.get("is_major_road"),
                "jurisdiction_or_maintenance": row.get("jurisdiction_or_maintenance"),
                "label": row.get("road_name") or "Transportation corridor",
                "length_ft": row.get("geometry_length_ft"),
                "road_class": row.get("road_class"),
                "road_name": row.get("road_name"),
                "road_type": row.get("road_type"),
                "route_type": row.get("route_type"),
                "speed_limit": row.get("speed_limit"),
                "transportation_centerline_id": row.get(
                    "transportation_centerline_id",
                ),
            },
        )
        for row in rows
    ]

    return feature_collection(
        features,
        generated_at=generated_at,
        layer_id="transportation_context",
        layer_label="Demo Transportation Context",
        source_basis="transportation_centerlines_clean",
    )


def build_demo_county_boundary(generated_at: str) -> dict[str, Any]:
    geometry = {
        "coordinates": [
            [
                [-80.861, 35.197],
                [-80.835, 35.548],
                [-80.513, 35.574],
                [-80.346, 35.414],
                [-80.386, 35.238],
                [-80.861, 35.197],
            ],
        ],
        "type": "Polygon",
    }
    return feature_collection(
        [
            {
                "geometry": geometry,
                "properties": {
                    "label": "Cabarrus County operating extent",
                    "source_label": "CFS operating extent reference",
                },
                "type": "Feature",
            },
        ],
        generated_at=generated_at,
        layer_id="county_boundary",
        layer_label="Demo County Boundary",
        source_basis="CFS operating extent reference",
    )


def feature_collection(
    features: list[dict[str, Any]],
    *,
    generated_at: str,
    layer_id: str,
    layer_label: str,
    source_basis: str,
) -> dict[str, Any]:
    return {
        "features": [feature for feature in features if feature.get("geometry")],
        "metadata": {
            "caveat": "Portfolio demo layer uses a cached sample extract, not full county production coverage.",
            "generated_at": generated_at,
            "layer_id": layer_id,
            "layer_label": layer_label,
            "mode": "portfolio_demo",
            "source_basis": source_basis,
            "status": "available" if features else "not_available",
        },
        "type": "FeatureCollection",
    }


def empty_feature_collection(
    *,
    generated_at: str,
    layer_id: str,
    layer_label: str,
    message: str,
) -> dict[str, Any]:
    return {
        "features": [],
        "metadata": {
            "caveat": "Portfolio demo layer is not included in the current cached extract.",
            "generated_at": generated_at,
            "layer_id": layer_id,
            "layer_label": layer_label,
            "message": message,
            "mode": "portfolio_demo",
            "source_basis": "Data still needed",
            "status": "not_available",
        },
        "type": "FeatureCollection",
    }


def geojson_feature(geometry_geojson: str | None, properties: dict[str, Any]) -> dict[str, Any]:
    geometry = json.loads(geometry_geojson) if geometry_geojson else None
    return {
        "geometry": geometry,
        "properties": properties,
        "type": "Feature",
    }


def get_demo_intensity_category(count: int) -> str:
    if count >= 26:
        return "Very high observed activity"
    if count >= 11:
        return "High observed activity"
    if count >= 3:
        return "Moderate observed activity"
    return "Context available"


def format_demo_segment_label(value: Any) -> str:
    if not value:
        return "Permit activity"
    return str(value).replace("_", " ").title()


def normalize_flood_severity(
    value: Any,
    floodway_present: bool,
    sfha_present: bool,
) -> str | None:
    normalized = str(value or "").lower()
    if floodway_present or normalized == "severe":
        return "severe"
    if sfha_present or normalized == "high":
        return "high"
    if normalized == "moderate":
        return "moderate"
    return "low" if normalized == "low" else None


def empty_school_pressure_response(generated_at: str) -> dict[str, Any]:
    return {
        "as_of": generated_at,
        "caveats": ["School utilization + permit pressure demo data is not available."],
        "data_coverage_notes": ["Data still needed."],
        "features": [],
        "limit": DEMO_SCHOOL_LAYER_LIMIT,
        "mode": "demo",
        "offset": 0,
        "summary": {
            "areas_analyzed": 0,
            "areas_with_recent_permits": 0,
            "areas_with_utilization": 0,
            "data_needed_count": 0,
            "elevated_review_count": 0,
            "recent_residential_permits_in_watched_areas": 0,
        },
        "total_count": 0,
    }


def summarize_school_pressure_response(response: dict[str, Any]) -> dict[str, Any]:
    return {
        "as_of": response.get("as_of"),
        "available": bool(response.get("features")),
        "caveats": response.get("caveats", []),
        "data_coverage_notes": response.get("data_coverage_notes", []),
        "limit": response.get("limit", 0),
        "mode": response.get("mode", "demo"),
        "offset": response.get("offset", 0),
        "summary": response.get("summary", {}),
        "total_count": response.get("total_count", 0),
    }


def build_school_pressure_properties(
    row: dict[str, Any],
    permit_join: bool,
) -> dict[str, Any]:
    utilization_pct = row.get("utilization_pct")
    utilization_status = row.get("utilization_class") or demo_utilization_status(
        utilization_pct,
    )
    recent = row.get("permit_count_recent")
    previous = row.get("permit_count_previous")
    delta = recent - previous if recent is not None and previous is not None else None
    growth_pct = round((delta / previous) * 100, 1) if delta is not None and previous else None
    watch_band = demo_school_pressure_watch_band(
        permit_join=permit_join,
        recent=recent,
        utilization_pct=utilization_pct,
        utilization_status=utilization_status,
    )
    return {
        "attendance_area_id": row.get("zone_id"),
        "caveats": [
            "Cached demo extract.",
            "Permit activity is not the same as student generation.",
            "This is not an official enrollment forecast.",
        ],
        "enrollment_year": row.get("school_year"),
        "major_development_permit_count_recent": row.get(
            "major_development_permit_count_recent",
        ),
        "multifamily_permit_count_recent": row.get(
            "multifamily_permit_count_recent",
        ),
        "observed_growth_pressure_band": demo_growth_pressure_band(recent),
        "permit_count_previous": previous,
        "permit_count_recent": recent,
        "permit_growth_delta": delta,
        "permit_growth_pct": growth_pct,
        "recommended_followup": demo_school_pressure_followup(watch_band),
        "residential_permit_count_recent": row.get(
            "residential_permit_count_recent",
        ),
        "school_level": row.get("school_level"),
        "school_name": row.get("school_name"),
        "school_pressure_watch_band": watch_band,
        "top_reasons": demo_school_pressure_reasons(
            permit_join=permit_join,
            recent=recent,
            utilization_pct=utilization_pct,
            utilization_status=utilization_status,
        ),
        "utilization_pct": utilization_pct,
        "utilization_status": utilization_status,
    }


def summarize_school_pressure_features(features: list[dict[str, Any]]) -> dict[str, int]:
    properties = [feature.get("properties", {}) for feature in features]
    return {
        "areas_analyzed": len(features),
        "areas_with_recent_permits": sum(
            1 for item in properties if (item.get("permit_count_recent") or 0) > 0
        ),
        "areas_with_utilization": sum(
            1 for item in properties if item.get("utilization_pct") is not None
        ),
        "data_needed_count": sum(
            1
            for item in properties
            if item.get("school_pressure_watch_band") == "data needed"
        ),
        "elevated_review_count": sum(
            1
            for item in properties
            if item.get("school_pressure_watch_band") == "elevated review"
        ),
        "recent_residential_permits_in_watched_areas": sum(
            int(item.get("residential_permit_count_recent") or 0)
            for item in properties
            if item.get("school_pressure_watch_band") in {"review", "elevated review"}
        ),
    }


def demo_utilization_status(value: Any) -> str | None:
    if value is None:
        return None
    utilization_pct = float(value)
    if utilization_pct >= 110:
        return "severely_over_capacity"
    if utilization_pct >= 100:
        return "over_capacity"
    if utilization_pct >= 90:
        return "near_capacity"
    if utilization_pct >= 80:
        return "approaching_capacity"
    return "under_capacity"


def demo_growth_pressure_band(recent: Any) -> str:
    if recent is None:
        return "unknown"
    count = int(recent)
    if count >= 40:
        return "high"
    if count >= 15:
        return "elevated"
    if count >= 5:
        return "moderate"
    return "low"


def demo_school_pressure_watch_band(
    *,
    permit_join: bool,
    recent: Any,
    utilization_pct: Any,
    utilization_status: str | None,
) -> str:
    if utilization_pct is None or not permit_join or recent is None:
        return "data needed"
    high_utilization = utilization_status in {
        "near_capacity",
        "over_capacity",
        "severely_over_capacity",
    }
    recent_count = int(recent)
    if high_utilization and recent_count >= 15:
        return "elevated review"
    if high_utilization or recent_count >= 5:
        return "review"
    return "monitor"


def demo_school_pressure_reasons(
    *,
    permit_join: bool,
    recent: Any,
    utilization_pct: Any,
    utilization_status: str | None,
) -> list[str]:
    reasons = []
    if utilization_pct is None:
        reasons.append("Utilization context is not available from the current source.")
    elif utilization_status in {"near_capacity", "over_capacity", "severely_over_capacity"}:
        reasons.append("Current utilization context is near or above local review thresholds.")
    else:
        reasons.append("Current utilization context is below local review thresholds.")

    if not permit_join or recent is None:
        reasons.append("Observed permit activity by attendance area is data needed.")
    elif int(recent) >= 15:
        reasons.append("Recent observed permit activity is elevated inside the attendance area.")
    elif int(recent) > 0:
        reasons.append("Observed permit activity exists inside the attendance area.")
    else:
        reasons.append("No recent observed permit activity was joined to this attendance area.")
    return reasons


def demo_school_pressure_followup(watch_band: str) -> str:
    if watch_band == "data needed":
        return "Request official enrollment/capacity data and confirm permit-to-attendance-area coverage."
    if watch_band == "elevated review":
        return "Review enrollment trends, approved subdivisions, and school capacity assumptions."
    if watch_band == "review":
        return "Review school utilization context with recent residential permit activity."
    return "Monitor as part of regular planning review."


def empty_development_statistics() -> dict[str, Any]:
    return {
        "activity_classes": {
            "high_activity": 0,
            "low_activity": 0,
            "moderate_activity": 0,
            "no_activity": 0,
            "very_high_activity": 0,
        },
        "activity_date_max": None,
        "activity_date_min": None,
        "by_permit_type": [],
        "by_status": [],
        "by_work_type": [],
        "by_zoning_category": [],
        "by_zoning_jurisdiction": [],
        "filters_applied": {},
        "parcels_with_activity": 0,
        "parcels_without_activity": 0,
        "recent_activity_parcels_1yr": 0,
        "recent_activity_parcels_3yr": 0,
        "total_permits": 0,
    }


def empty_development_activity_summary() -> dict[str, Any]:
    return {
        "active_parcel_count": 0,
        "avg_permit_amount": None,
        "by_activity_class": [],
        "by_month": [],
        "by_permit_type": [],
        "by_status": [],
        "by_work_type": [],
        "by_year": [],
        "by_zoning_category": [],
        "by_zoning_jurisdiction": [],
        "date_range": {
            "activity_date_max": None,
            "activity_date_min": None,
        },
        "filters_applied": {},
        "recent_activity": {
            "recent_1yr_parcels": 0,
            "recent_3yr_parcels": 0,
        },
        "total_permit_amount": None,
        "total_permits": 0,
    }


def empty_flood_summary() -> dict[str, Any]:
    return {
        "average_percent_constrained": None,
        "buildability_impact_distribution": [],
        "caveats": ["Floodplain summary is not available in this demo extract."],
        "dominant_zone_distribution": [],
        "filters_applied": {},
        "floodplain_parcels": 0,
        "floodway_parcels": 0,
        "high_severe_buildability_parcels": 0,
        "max_percent_constrained": None,
        "review_required_parcels": 0,
        "severity_distribution": [],
        "sfha_parcels": 0,
        "total_parcels": 0,
    }


def empty_school_statistics() -> dict[str, Any]:
    return {
        "assignment_confidence_distribution": [],
        "assignment_review_required_parcels": 0,
        "capacity_data_available_parcels": 0,
        "capacity_not_available_parcels": 0,
        "caveats": ["School assignment summary is not available in this demo extract."],
        "constraint_class_distribution": [],
        "elementary_assigned_parcels": 0,
        "filters_applied": {},
        "high_assigned_parcels": 0,
        "included_cfs_v1_zone_count": 0,
        "included_public_ccs_reference_count": 0,
        "middle_assigned_parcels": 0,
        "missing_elementary_assignment_parcels": 0,
        "missing_high_assignment_parcels": 0,
        "missing_middle_assignment_parcels": 0,
        "reference_exclusion_distribution": [],
        "safe_for_api_exposure": True,
        "school_constraint_score_non_null_parcels": 0,
        "school_reference_count": 0,
        "school_zone_count": 0,
        "summary_status_distribution": [],
        "total_parcels": 0,
        "zone_level_distribution": [],
    }


def table_exists(conn: psycopg.Connection, table_name: str) -> bool:
    return bool(
        fetch_one(
            conn,
            "SELECT to_regclass(%s) IS NOT NULL AS exists",
            (f"public.{table_name}",),
        )["exists"],
    )


def relation_exists(conn: psycopg.Connection, relation_name: str) -> bool:
    return table_exists(conn, relation_name)


def table_count(conn: psycopg.Connection, table_name: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    return int(fetch_one(conn, f"SELECT COUNT(*)::int AS count FROM public.{table_name}")["count"] or 0)


def table_count_distinct(conn: psycopg.Connection, table_name: str, column_name: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    return int(
        fetch_one(
            conn,
            f"SELECT COUNT(DISTINCT {column_name})::int AS count FROM public.{table_name}",
        )["count"]
        or 0,
    )


def count_summary_positive(conn: psycopg.Connection, table_name: str, column_name: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    return int(
        fetch_one(
            conn,
            f"SELECT COUNT(*)::int AS count FROM public.{table_name} WHERE COALESCE({column_name}, 0) > 0",
        )["count"]
        or 0,
    )


def count_where(conn: psycopg.Connection, table_name: str, where_sql: str) -> int:
    if not table_exists(conn, table_name):
        return 0
    return int(
        fetch_one(
            conn,
            f"SELECT COUNT(*)::int AS count FROM public.{table_name} WHERE {where_sql}",
        )["count"]
        or 0,
    )


def bucket(
    conn: psycopg.Connection,
    table_name: str,
    column_name: str,
    *,
    limit: int = 12,
) -> list[dict[str, Any]]:
    if not table_exists(conn, table_name):
        return []
    return fetch_all(
        conn,
        f"""
        SELECT COALESCE(NULLIF({column_name}::text, ''), 'unknown') AS value,
               COUNT(*)::int AS count
        FROM public.{table_name}
        GROUP BY COALESCE(NULLIF({column_name}::text, ''), 'unknown')
        ORDER BY count DESC, value ASC
        LIMIT %s
        """,
        (limit,),
    )


def summary_bucket(conn: psycopg.Connection, table_name: str, column_name: str) -> list[dict[str, Any]]:
    if not table_exists(conn, table_name):
        return []
    if table_name == "development_activity_parcel_summary":
        return fetch_all(
            conn,
            f"""
            SELECT
              COALESCE(NULLIF({column_name}::text, ''), 'unknown') AS value,
              COUNT(*) FILTER (WHERE COALESCE(total_permit_count, 0) > 0)::int
                AS active_parcel_count,
              COALESCE(SUM(total_permit_count), 0)::int AS permit_count,
              SUM(total_permit_amount)::float8 AS total_permit_amount
            FROM public.{table_name}
            GROUP BY COALESCE(NULLIF({column_name}::text, ''), 'unknown')
            ORDER BY permit_count DESC, value ASC
            LIMIT 12
            """,
        )
    return fetch_all(
        conn,
        f"""
        SELECT
          COALESCE(NULLIF({column_name}::text, ''), 'unknown') AS value,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS active_parcel_count,
          COUNT(DISTINCT permit_id)::int AS permit_count,
          SUM(permit_amount)::float8 AS total_permit_amount
        FROM public.{table_name}
        GROUP BY COALESCE(NULLIF({column_name}::text, ''), 'unknown')
        ORDER BY permit_count DESC, value ASC
        LIMIT 12
        """,
    )


def annual_summary(conn: psycopg.Connection) -> list[dict[str, Any]]:
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        return []
    return fetch_all(
        conn,
        """
        SELECT
          activity_year AS year,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS active_parcel_count,
          COUNT(DISTINCT permit_id)::int AS permit_count,
          SUM(permit_amount)::float8 AS total_permit_amount
        FROM public.real_property_permit_parcel_relationship
        WHERE activity_year IS NOT NULL
        GROUP BY activity_year
        ORDER BY activity_year
        """,
    )


def monthly_trend(conn: psycopg.Connection) -> list[dict[str, Any]]:
    if not table_exists(conn, "real_property_permit_parcel_relationship"):
        return []
    rows = fetch_all(
        conn,
        """
        SELECT
          activity_year AS year,
          activity_month AS month,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match IS TRUE)::int
            AS active_parcel_count,
          COUNT(DISTINCT permit_id)::int AS permit_count,
          SUM(permit_amount)::float8 AS total_permit_amount
        FROM public.real_property_permit_parcel_relationship
        WHERE activity_year IS NOT NULL
          AND activity_month IS NOT NULL
        GROUP BY activity_year, activity_month
        ORDER BY activity_year DESC, activity_month DESC
        LIMIT 24
        """,
    )
    return list(reversed(rows))


def flood_bucket(conn: psycopg.Connection, column_name: str, total_count: int) -> list[dict[str, Any]]:
    rows = bucket(conn, "parcel_flood_constraint_overlay", column_name, limit=12)
    return [
        {
            "parcel_count": row["count"],
            "percentage": round(row["count"] * 100 / total_count, 4) if total_count else None,
            "value": row["value"],
        }
        for row in rows
    ]


def school_bucket(conn: psycopg.Connection, column_name: str, total_count: int) -> list[dict[str, Any]]:
    rows = bucket(conn, "parcel_school_summary", column_name, limit=12)
    return [
        {
            "count": row["count"],
            "percentage": round(row["count"] * 100 / total_count, 4) if total_count else None,
            "value": row["value"],
        }
        for row in rows
    ]


def school_reference_exclusions(conn: psycopg.Connection) -> list[dict[str, Any]]:
    if not table_exists(conn, "school_reference"):
        return []
    return fetch_all(
        conn,
        """
        SELECT COALESCE(exclusion_reason, 'included') AS value,
               COUNT(*)::int AS count
        FROM public.school_reference
        GROUP BY COALESCE(exclusion_reason, 'included')
        ORDER BY count DESC, value ASC
        """,
    )


def zone_level_distribution(conn: psycopg.Connection) -> list[dict[str, Any]]:
    if not table_exists(conn, "school_zones"):
        return []
    return fetch_all(
        conn,
        """
        SELECT school_level AS value,
               COUNT(*)::int AS count
        FROM public.school_zones
        GROUP BY school_level
        ORDER BY school_level
        """,
    )


def unmatched_zone_names(conn: psycopg.Connection) -> list[dict[str, Any]]:
    if not table_exists(conn, "school_zones"):
        return []
    return fetch_all(
        conn,
        """
        SELECT
          'unmatched_reference_review' AS issue_type,
          COALESCE(exclusion_reason, 'Reference review needed') AS detail,
          NULL::int AS parcel_count,
          'Verify official school reference and attendance-zone mapping.' AS recommended_action,
          school_level,
          school_name_raw AS school_name,
          'review' AS severity
        FROM public.school_zones
        WHERE match_confidence = 'unmatched_reference_review'
        ORDER BY school_level, school_name_raw
        LIMIT 50
        """,
    )


def trend_direction(annual: list[dict[str, Any]]) -> str:
    if len(annual) < 2:
        return "Context available"
    latest = annual[-1]["permit_count"] or 0
    previous = annual[-2]["permit_count"] or 0
    if latest > previous:
        return "Increasing"
    if latest < previous:
        return "Decreasing"
    return "Stable"


def column_expr(alias: str, column: str, enabled: bool) -> str:
    return f"{alias}.{column}" if enabled else "NULL::text"


def bool_expr(alias: str, column: str, enabled: bool) -> str:
    return f"{alias}.{column}" if enabled else "NULL::boolean"


def array_expr(alias: str, column: str, enabled: bool) -> str:
    return f"COALESCE({alias}.{column}, ARRAY[]::text[])" if enabled else "ARRAY[]::text[]"


def optional_join(enabled: bool, table_name: str, alias: str) -> str:
    if not enabled:
        return ""
    return (
        f"LEFT JOIN public.{table_name} {alias} "
        "ON {alias}.official_parcel_id = p.official_parcel_id"
    ).format(alias=alias)


def optional_join_school_utilization(table_name: str | None) -> str:
    if not table_name:
        return ""
    return f"""
        LEFT JOIN public.{table_name} u
          ON (
            u.matched_school_reference_id = z.matched_school_reference_id
            OR (
              u.school_name_normalized = z.school_name_normalized
              AND LOWER(COALESCE(u.school_level, '')) = LOWER(COALESCE(z.school_level, ''))
            )
          )
    """


def fetch_one(
    conn: psycopg.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
    return dict(row or {})


def fetch_one_or_none(
    conn: psycopg.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any] | None:
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
    return dict(row) if row else None


def fetch_all(
    conn: psycopg.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> list[dict[str, Any]]:
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def as_number(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def normalize_model_driver(value: Any) -> str | None:
    if not value:
        return None

    normalized = str(value).strip().lower().replace("_", " ")
    aliases = {
        "historical zoning": "zoning context",
        "new construction permit labels": "permit activity context",
        "parcel tax value context": "parcel/tax/value context",
        "tax value enrichment": "parcel/tax/value context",
        "transportation accessibility": "transportation access",
    }
    return aliases.get(normalized, normalized)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=json_default)
        + "\n",
        encoding="utf-8",
    )


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except psycopg.Error as error:
        print(f"Demo data export failed: {error.__class__.__name__}", file=sys.stderr)
        raise SystemExit(1)

