"""Map-safe result sets for Management-to-Analyst handoffs."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dependencies.database import get_read_only_db

router = APIRouter(prefix="/development", tags=["Development"])

ManagementMapSelection = Literal[
    "active-development-parcels",
    "permit-activity",
    "hotspot",
    "flood-review",
    "flood-high-severe",
    "development-signals",
    "development-signals-high",
    "development-signals-very-high",
]

_META = {
    "active-development-parcels": ("Active Development Parcels", "Observed permit activity", "polygon"),
    "permit-activity": ("Permit Activity", "Observed permit activity", "point"),
    "hotspot": ("Development Area", "Observed permit activity", "polygon"),
    "flood-review": ("Flood Review", "FEMA floodplain review context", "polygon"),
    "flood-high-severe": ("High / Severe Flood Review", "FEMA floodplain review context", "polygon"),
    "development-signals": ("Elevated Development Signals", "Development Signals model evidence", "polygon"),
    "development-signals-high": ("High Development Signals", "Development Signals model evidence", "polygon"),
    "development-signals-very-high": ("Very High Development Signals", "Development Signals model evidence", "polygon"),
}


@router.get("/management-map")
def get_management_map_result(
    selection: ManagementMapSelection,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    selected_parcel: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_read_only_db, scope="function"),
) -> dict[str, object]:
    """Return simplified geometry and aggregate weights; parcel IDs stay server-side."""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")

    title, source, geometry_kind = _META[selection]
    rows = db.execute(
        text(_selection_sql(selection)),
        {
            "end_date": end_date,
            "selected_parcel": selected_parcel,
            "start_date": start_date,
        },
    ).mappings().all()
    features = [
        {"geometry": row["geometry"], "weight": int(row["weight"] or 1)}
        for row in rows
        if row["geometry"]
    ]
    return {
        "feature_count": len(features),
        "features": features,
        "geometry_kind": geometry_kind,
        "record_count": int(rows[0]["record_count"] if rows else 0),
        "selection": selection,
        "source": source,
        "title": title,
    }


def _selection_sql(selection: ManagementMapSelection) -> str:
    geometry = "ST_SimplifyPreserveTopology(p.geometry, 0.00002)"
    if selection in {"active-development-parcels", "permit-activity", "hotspot"}:
        selected_filter = (
            "AND r.official_parcel_id = :selected_parcel"
            if selection == "hotspot"
            else ""
        )
        output_geometry = "ST_PointOnSurface(p.geometry)" if selection == "permit-activity" else geometry
        return f"""
            WITH eligible AS (
              SELECT r.official_parcel_id, r.permit_id
              FROM public.real_property_permit_parcel_relationship r
              WHERE r.has_parcel_match IS TRUE
                AND (:start_date IS NULL OR r.activity_date >= :start_date)
                AND (:end_date IS NULL OR r.activity_date <= :end_date)
                {selected_filter}
            ), matches AS (
              SELECT r.official_parcel_id, COUNT(DISTINCT r.permit_id)::int AS weight
              FROM eligible r
              GROUP BY r.official_parcel_id
            ), totals AS (
              SELECT COUNT(DISTINCT r.permit_id)::int AS record_count
              FROM public.real_property_permit_parcel_relationship r
              WHERE (:start_date IS NULL OR r.activity_date >= :start_date)
                AND (:end_date IS NULL OR r.activity_date <= :end_date)
                {selected_filter}
            )
            SELECT ST_AsGeoJSON({output_geometry}, 6)::json AS geometry,
                   m.weight, totals.record_count
            FROM matches m
            JOIN public.parcels_enriched p USING (official_parcel_id)
            CROSS JOIN totals
            WHERE p.geometry IS NOT NULL AND NOT ST_IsEmpty(p.geometry)
            ORDER BY m.weight DESC
        """
    if selection in {"flood-review", "flood-high-severe"}:
        severity_filter = (
            "AND LOWER(COALESCE(f.buildability_impact, '')) IN ('high', 'severe')"
            if selection == "flood-high-severe"
            else ""
        )
        return f"""
            SELECT ST_AsGeoJSON({geometry}, 6)::json AS geometry, 1::int AS weight,
                   COUNT(*) OVER ()::int AS record_count
            FROM public.parcel_flood_constraint_overlay f
            JOIN public.parcels_enriched p USING (official_parcel_id)
            WHERE f.flood_review_required IS TRUE
              {severity_filter}
              AND p.geometry IS NOT NULL AND NOT ST_IsEmpty(p.geometry)
        """

    class_filter = {
        "development-signals": "r.development_signal_class IN ('very_high_development_signal', 'high_development_signal')",
        "development-signals-high": "r.development_signal_class = 'high_development_signal'",
        "development-signals-very-high": "r.development_signal_class = 'very_high_development_signal'",
    }[selection]
    return f"""
        WITH latest AS (
          SELECT model_experiment_id
          FROM public.development_prediction_ranking_classes
          GROUP BY model_experiment_id
          ORDER BY MAX(created_at) DESC
          LIMIT 1
        )
        SELECT ST_AsGeoJSON({geometry}, 6)::json AS geometry, 1::int AS weight,
               COUNT(*) OVER ()::int AS record_count
        FROM public.development_prediction_ranking_classes r
        JOIN latest USING (model_experiment_id)
        JOIN public.parcels_enriched p USING (official_parcel_id)
        WHERE {class_filter}
          AND p.geometry IS NOT NULL AND NOT ST_IsEmpty(p.geometry)
    """
