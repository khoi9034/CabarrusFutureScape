"""Indicator Center monitoring summary routes."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_read_only_db
from app.repositories import DevelopmentRepository
from app.repositories.constraints_repository import ConstraintsRepository
from app.repositories.development_repository import (
    DevelopmentStatisticsFilters,
    DevelopmentTrendsFilters,
)
from app.repositories.school_constraints_repository import SchoolConstraintsRepository
from app.schemas.school_constraints import SchoolUtilizationSeedResponse
from app.services import DevelopmentService
from app.services.constraints_service import ConstraintsService
from app.services.school_constraints_service import SchoolConstraintsService

router = APIRouter(prefix="/indicators", tags=["Indicator Center"])

MISSING_DATASETS = [
    "WSACC true utility capacity",
    "official school enrollment/capacity",
    "official rezoning case records",
    "countywide development pipeline",
    "countywide future land use",
    "planned local road projects",
    "planned utility extensions",
]


@router.get("/summary")
def get_indicator_summary(
    time_window: str = Query(default="all_time"),
    db: Session = Depends(get_read_only_db),
) -> dict[str, Any]:
    """Return dashboard-ready monitoring metrics for Indicator Center."""

    development = DevelopmentService(DevelopmentRepository(db))
    flood = ConstraintsService(ConstraintsRepository(db))
    schools = SchoolConstraintsService(SchoolConstraintsRepository(db))

    development_stats = development.get_statistics(
        filters=DevelopmentStatisticsFilters()
    )
    development_trends = development.get_trends(filters=DevelopmentTrendsFilters())
    permit_segments = development.get_permit_segment_statistics()
    flood_summary = flood.get_flood_summary()
    school_seed = schools.get_utilization_seed_rows(limit=500)

    school_counts = _school_class_counts(school_seed.rows)
    over_count = school_counts.get("over_capacity", 0)
    very_high_count = (
        school_counts.get("severely_over_capacity", 0)
        + school_counts.get("very_high", 0)
    )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "time_window": time_window,
        "signal_tiles": [
            {
                "id": "development_activity",
                "label": "Development Activity",
                "metric": development_stats.parcels_with_activity,
                "sublabel": f"{development_stats.total_permits:,} permit records",
                "status": "Observed Activity",
                "caveat": "Observed activity only.",
            },
            {
                "id": "school_capacity_watch",
                "label": "School Capacity Watch",
                "metric": over_count + very_high_count,
                "sublabel": "official verification needed",
                "status": "Preliminary Data",
                "caveat": "Verify with official enrollment/capacity.",
            },
            {
                "id": "floodplain_review",
                "label": "Floodplain Review",
                "metric": flood_summary.review_required_parcels,
                "sublabel": (
                    f"{flood_summary.sfha_parcels:,} Special Flood Hazard Area / "
                    f"{flood_summary.floodway_parcels:,} floodway"
                ),
                "status": "Review Needed",
                "caveat": "Based on FEMA floodplain data.",
            },
            {
                "id": "utility_readiness",
                "label": "Utility Readiness",
                "metric": "Proxy Only",
                "sublabel": "true capacity missing",
                "status": "Data Needed",
                "caveat": "Proxy does not confirm capacity.",
            },
            {
                "id": "data_readiness",
                "label": "Data Still Needed",
                "metric": len(MISSING_DATASETS),
                "sublabel": "priority missing datasets",
                "status": "Data Needed",
                "caveat": "Official source data needed.",
            },
            {
                "id": "model_governance",
                "label": "Model Status",
                "metric": "Internal Only",
                "sublabel": "not production-ready",
                "status": "Research Only",
                "caveat": "No exact probabilities.",
            },
        ],
        "monitoring_cards": [
            {
                "id": "growth_monitor",
                "status": "Observed Activity",
                "metrics": {
                    "permit_records": development_stats.total_permits,
                    "active_parcels": development_stats.parcels_with_activity,
                    "recent_12_month_parcels": development_stats.recent_activity_parcels_1yr,
                    "recent_36_month_parcels": development_stats.recent_activity_parcels_3yr,
                    "top_permit_segment": _top_bucket(
                        permit_segments.by_permit_segment
                    ),
                },
            },
            {
                "id": "capacity_monitor",
                "status": "Preliminary Data",
                "metrics": {
                    "total_preliminary_records": school_seed.total_count,
                    "over_capacity": over_count,
                    "very_high": very_high_count,
                    "official_capacity_status": "Needs official data",
                },
            },
            {
                "id": "constraint_monitor",
                "status": "Review Needed",
                "metrics": {
                    "review_parcels": flood_summary.review_required_parcels,
                    "floodway_parcels": flood_summary.floodway_parcels,
                    "special_flood_hazard_area_parcels": flood_summary.sfha_parcels,
                    "high_severe_impact": flood_summary.high_severe_buildability_parcels,
                },
            },
        ],
        "priority_issues": [
            {
                "priority": "High Attention",
                "signal": "School Capacity Watch",
                "evidence": (
                    f"{over_count} above capacity / "
                    f"{very_high_count} very high utilization"
                ),
                "status": "Preliminary data",
                "next_action": "Request official capacity/enrollment",
            },
            {
                "priority": "Review Needed",
                "signal": "Floodplain Review",
                "evidence": f"{flood_summary.review_required_parcels:,} review parcels",
                "status": "FEMA floodplain data",
                "next_action": "Confirm floodplain requirements",
            },
            {
                "priority": "High Attention",
                "signal": "Development activity",
                "evidence": f"{development_stats.parcels_with_activity:,} active parcels",
                "status": "Observed activity",
                "next_action": "Review permit context",
            },
        ],
        "chart_data": {
            "development_permit_trend": [
                {"label": str(row.year), "value": row.permit_count}
                for row in development_trends.annual_trends[-6:]
            ],
            "permit_segment_breakdown": [
                {"label": row.value, "value": row.count}
                for row in permit_segments.by_permit_segment[:6]
            ],
            "school_capacity_category_breakdown": [
                {"label": key, "value": value}
                for key, value in sorted(school_counts.items())
            ],
            "flood_review_breakdown": [
                {"label": row.value, "value": row.parcel_count}
                for row in flood_summary.severity_distribution[:6]
            ],
            "data_gap_category_count": [
                {"label": "Utility / infrastructure", "value": 3},
                {"label": "Schools", "value": 1},
                {"label": "Planning / pipeline", "value": 3},
            ],
        },
        "data_readiness": [
            {
                "dataset": dataset,
                "status": "Needs official data",
                "best_format": "REST/GIS/table",
            }
            for dataset in MISSING_DATASETS
        ],
        "safety_flags": {
            "exact_probabilities_exposed": False,
            "raw_model_scores_exposed": False,
            "official_prediction_classes_exposed": False,
            "official_risk_scores_created": False,
            "public_prediction_endpoint": False,
        },
    }


@router.get("/school-utilization-detail")
def get_school_utilization_detail(
    db: Session = Depends(get_read_only_db),
) -> dict[str, Any]:
    """Return evidence rows for the school capacity watch drilldown."""

    schools = SchoolConstraintsService(SchoolConstraintsRepository(db))
    page = schools.get_utilization_seed_rows(limit=500)
    counts = _school_class_counts(page.rows)
    grouped = {
        "over_capacity_schools": _seed_rows(
            page.rows, {"over_capacity"}
        ),
        "very_high_schools": _seed_rows(
            page.rows, {"severely_over_capacity", "very_high"}
        ),
        "approaching_capacity_schools": _seed_rows(
            page.rows, {"approaching_capacity"}
        ),
        "under_capacity_schools": _seed_rows(page.rows, {"under_capacity"}),
        "unmatched_references": [
            _seed_row(row)
            for row in page.rows
            if row.match_confidence == "unmatched_reference_review"
        ],
    }

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "summary_counts": {
            "total_preliminary_records": page.total_count,
            "over_capacity": counts.get("over_capacity", 0),
            "very_high": counts.get("severely_over_capacity", 0)
            + counts.get("very_high", 0),
            "approaching": counts.get("approaching_capacity", 0),
            "under": counts.get("under_capacity", 0),
            "unmatched": len(grouped["unmatched_references"]),
            "official_status": "Needs verification",
        },
        "utilization_class_counts": counts,
        **grouped,
        "fields_available": [
            "school_name",
            "school_level",
            "utilization_percent",
            "utilization_class",
            "source_confidence",
            "needs_verification",
            "matched_school_reference_id",
            "match_confidence",
            "school_year",
        ],
        "fields_missing": [
            "school_id",
            "enrollment",
            "functional_capacity",
            "source_year",
            "projection_year",
            "attendance_zone_id",
            "related_zone",
        ],
        "caveats": [
            "Preliminary utilization from planning materials.",
            "Confirm with official enrollment/capacity.",
            "No official school capacity determination is made by this endpoint.",
        ],
    }


def _school_class_counts(
    rows: list[SchoolUtilizationSeedResponse],
) -> dict[str, int]:
    counts = Counter(row.utilization_class or "not_available" for row in rows)
    return dict(counts)


def _seed_rows(
    rows: list[SchoolUtilizationSeedResponse],
    classes: set[str],
) -> list[dict[str, Any]]:
    return [
        _seed_row(row)
        for row in rows
        if (row.utilization_class or "not_available") in classes
    ]


def _seed_row(row: SchoolUtilizationSeedResponse) -> dict[str, Any]:
    return {
        "school_name": row.school_name,
        "school_level": row.school_level,
        "utilization_percent": row.utilization_pct,
        "enrollment": None,
        "capacity": None,
        "utilization_class": row.utilization_class,
        "source_confidence": row.source_confidence,
        "needs_verification": row.needs_verification,
        "matched_status": row.match_confidence,
        "matched_school_reference_id": row.matched_school_reference_id,
        "unmatched_reason": (
            "Reference review needed"
            if row.match_confidence == "unmatched_reference_review"
            else None
        ),
        "related_zone": None,
    }


def _top_bucket(rows: list[Any]) -> str:
    if not rows:
        return "Not available from current source"
    first = rows[0]
    return f"{first.value} ({first.count:,})"
