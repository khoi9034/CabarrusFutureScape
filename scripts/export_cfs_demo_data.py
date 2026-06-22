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
SAMPLE_PARCEL_LIMIT = 300

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
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    with psycopg.connect(get_local_connection_string(), row_factory=dict_row) as conn:
        development_statistics = build_development_statistics(conn)
        development_activity_summary = build_development_activity_summary(conn)
        permit_segments = build_permit_segment_statistics(conn)
        development_trends = build_development_trends(conn)
        flood_summary = build_flood_summary(conn)
        school_watch = build_school_capacity_watch(conn)
        model_status = build_model_status(generated_at)
        sample_parcels = build_sample_parcels(conn, generated_at)

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
        "utility_readiness": {
            "caveat": "Utility proxy does not confirm available capacity.",
            "status": "Data still needed",
            "true_capacity_available": False,
        },
    }

    files = {
        "demo_manifest.json": {
            "caveat": "Portfolio demo uses cached CFS demo data, not a live production database.",
            "generated_at": generated_at,
            "mode": "portfolio_demo",
            "record_counts": {
                "sample_parcels": sample_parcels["total_count"],
                "school_capacity_rows": school_watch["utilization_seed"]["total_count"],
                "permit_segment_buckets": len(permit_segments["by_permit_segment"]),
                "development_annual_trends": len(development_trends["annual_trends"]),
            },
            "source_label": "Local CFS PostGIS cached extract",
        },
        "indicator_summary.json": indicator_summary,
        "development_trends.json": {
            "available": bool(development_trends["annual_trends"]),
            "generated_at": generated_at,
            "trends": development_trends,
        },
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
        "model_status.json": model_status,
        "sample_parcels.json": sample_parcels,
        "model_lab_demo_clusters.json": {
            "available": False,
            "caveat": "Portfolio demo does not include parcel-level model preview clusters.",
            "clusters": [],
            "exact_probabilities_shown": False,
            "generated_at": generated_at,
            "raw_scores_shown": False,
            "relative_research_bands_only": True,
        },
    }

    for filename, payload in files.items():
        write_json(DEMO_DATA_DIR / filename, payload)

    total_bytes = sum(path.stat().st_size for path in DEMO_DATA_DIR.glob("*.json"))
    print(
        json.dumps(
            {
                "demo_data_dir": str(DEMO_DATA_DIR),
                "file_count": len(files),
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
        "raw_scores_shown": False,
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


def fetch_one(
    conn: psycopg.Connection,
    query: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
    return dict(row or {})


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
