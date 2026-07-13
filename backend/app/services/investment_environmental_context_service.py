"""Environmental screening context for internal Investment Panel candidates."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

ENV_TABLE = "investment_parcel_environmental_context"
NWI_TABLE = "investment_nwi_wetlands"
SOIL_TABLE = "investment_soil_units"
FACILITY_TABLE = "investment_environmental_facilities"

SAFE_LIMITATION = (
    "Environmental context is screening-level only and does not replace survey, wetland delineation, "
    "engineering, geotechnical, zoning, utility, or environmental review."
)
PROXY_LIMITATION = "Usable-area screening proxy is not a certified site-area calculation or a development certification."
MISSING_SOURCE_NOTE = "NWI wetlands, USGS slope, NRCS soils, and EPA facility extracts have not been refreshed locally yet."


def environmental_status(db: Session) -> dict[str, Any]:
    _ensure_tables(db)
    summary = db.execute(
        text(
            f"""
            SELECT
              COUNT(*)::int AS parcel_summary_count,
              COUNT(*) FILTER (WHERE wetland_intersection_flag)::int AS mapped_wetland_parcels,
              COUNT(*) FILTER (WHERE terrain_context_band = 'Higher-Slope Constraint')::int AS higher_slope_parcels,
              COUNT(*) FILTER (WHERE soil_data_status = 'Available')::int AS soil_context_parcels,
              COUNT(*) FILTER (WHERE regulated_facility_nearby_flag)::int AS regulated_facility_nearby_parcels,
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'Medium')::int AS medium_confidence_parcels,
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'Limited')::int AS limited_confidence_parcels,
              MAX(refreshed_at) AS last_refreshed
            FROM {ENV_TABLE}
            """
        )
    ).mappings().first() or {}
    return {
        "status": "loaded" if int(summary.get("parcel_summary_count") or 0) else "not_loaded",
        "parcel_summary": _json_ready(summary),
        "source_rows": _source_counts(db),
        "sources": _source_statuses(db),
        "limitations": [SAFE_LIMITATION, PROXY_LIMITATION, MISSING_SOURCE_NOTE],
    }


def refresh_environmental_context(db: Session, *, source: str = "all") -> dict[str, Any]:
    _ensure_tables(db)
    if source not in {"all", "nwi", "slope", "soils", "epa"}:
        raise ValueError("source must be one of all, nwi, slope, soils, or epa")
    # ponytail: source-specific downloads are intentionally not hidden in API requests; load official extracts, then rerun this summary.
    _refresh_parcel_summary(db)
    status = environmental_status(db)
    return {
        "status": "ok",
        "source_requested": source,
        "parcel_summary_count": status["parcel_summary"]["parcel_summary_count"],
        "source_rows": status["source_rows"],
        "last_refreshed": status["parcel_summary"].get("last_refreshed"),
        "last_good_data_preserved": True,
        "limitations": status["limitations"],
    }


def candidate_environmental_context(db: Session, parcel_id: str | None) -> dict[str, Any]:
    _ensure_tables(db)
    if not parcel_id:
        return _unavailable("No parcel identifier was provided.")
    row = db.execute(text(f"SELECT * FROM {ENV_TABLE} WHERE parcel_id = :parcel_id"), {"parcel_id": parcel_id}).mappings().first()
    if not row:
        _refresh_one(db, parcel_id)
        row = db.execute(text(f"SELECT * FROM {ENV_TABLE} WHERE parcel_id = :parcel_id"), {"parcel_id": parcel_id}).mappings().first()
    if not row:
        return _unavailable("Environmental context unavailable for this parcel.", parcel_id=parcel_id)
    data = _json_ready(row)
    return {
        "parcel_id": data.get("parcel_id"),
        "flood_context": data.get("flood_context_band") or "Data Unavailable",
        "mapped_wetland_context": data.get("wetland_context_band") or "Data Unavailable",
        "wetland_percent_of_parcel": data.get("wetland_percent"),
        "terrain_context": data.get("terrain_context_band") or "Data Unavailable",
        "mean_slope_percent": data.get("mean_slope_percent"),
        "soil_context": data.get("soil_limitation_band") or "Data Unavailable",
        "environmental_facility_context": data.get("regulated_facility_context_band") or "Data Unavailable",
        "usable_area_screening_proxy": data.get("usable_area_screening_proxy") or "Insufficient Environmental Information",
        "overall_environmental_constraint_band": data.get("overall_environmental_constraint_band") or "Insufficient Information",
        "environmental_data_confidence": data.get("environmental_data_confidence") or "Data Needed",
        "verification_requirements": data.get("environmental_verification_flags") or _default_verification_flags(),
        "source_attribution": data.get("source_attribution") or _source_attribution(),
        "source_version": data.get("source_version") or "FEMA flood overlay plus pending environmental source extracts",
        "last_refreshed": data.get("refreshed_at"),
        "limitations": [SAFE_LIMITATION, PROXY_LIMITATION],
    }


def _ensure_tables(db: Session) -> None:
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {NWI_TABLE} (
              source_id text PRIMARY KEY,
              wetland_type text,
              source_date text,
              source_attribution text NOT NULL DEFAULT 'U.S. Fish and Wildlife Service National Wetlands Inventory',
              retrieved_at timestamptz NOT NULL DEFAULT now(),
              geometry geometry(MultiPolygon, 4326)
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{NWI_TABLE}_geometry ON {NWI_TABLE} USING GIST (geometry)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {SOIL_TABLE} (
              source_id text PRIMARY KEY,
              map_unit text,
              hydrologic_soil_group text,
              drainage_class text,
              prime_farmland_class text,
              soil_limitation_note text,
              source_attribution text NOT NULL DEFAULT 'USDA NRCS soil survey context',
              retrieved_at timestamptz NOT NULL DEFAULT now(),
              geometry geometry(MultiPolygon, 4326)
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{SOIL_TABLE}_geometry ON {SOIL_TABLE} USING GIST (geometry)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {FACILITY_TABLE} (
              source_id text PRIMARY KEY,
              facility_name text,
              program_type text,
              facility_status text,
              source_attribution text NOT NULL DEFAULT 'U.S. Environmental Protection Agency facility context',
              retrieved_at timestamptz NOT NULL DEFAULT now(),
              geometry geometry(Point, 4326)
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{FACILITY_TABLE}_geometry ON {FACILITY_TABLE} USING GIST (geometry)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {ENV_TABLE} (
              parcel_id text PRIMARY KEY,
              flood_context_band text,
              flood_percent numeric,
              wetland_intersection_flag boolean NOT NULL DEFAULT false,
              wetland_area_acres numeric,
              wetland_percent numeric,
              wetland_context_band text NOT NULL DEFAULT 'Data Unavailable',
              wetland_data_status text NOT NULL DEFAULT 'Data Unavailable',
              mean_slope_percent numeric,
              steep_slope_percent numeric,
              terrain_context_band text NOT NULL DEFAULT 'Data Unavailable',
              slope_data_status text NOT NULL DEFAULT 'Data Unavailable',
              dominant_soil_group text,
              soil_limitation_band text NOT NULL DEFAULT 'Data Unavailable',
              soil_data_status text NOT NULL DEFAULT 'Data Unavailable',
              soil_verification_required boolean NOT NULL DEFAULT true,
              regulated_facility_nearby_flag boolean NOT NULL DEFAULT false,
              regulated_facility_count_band text NOT NULL DEFAULT 'Data Unavailable',
              nearest_regulated_facility_distance_band text NOT NULL DEFAULT 'Data Unavailable',
              regulated_facility_context_band text NOT NULL DEFAULT 'Data Unavailable',
              epa_data_status text NOT NULL DEFAULT 'Data Unavailable',
              usable_area_screening_proxy text NOT NULL DEFAULT 'Insufficient Environmental Information',
              overall_environmental_constraint_band text NOT NULL DEFAULT 'Insufficient Information',
              environmental_data_confidence text NOT NULL DEFAULT 'Data Needed',
              environmental_verification_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
              source_attribution jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              source_version text,
              refreshed_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{ENV_TABLE}_constraint_band ON {ENV_TABLE}(overall_environmental_constraint_band)"))


def _refresh_parcel_summary(db: Session) -> None:
    has_flood = _table_exists(db, "parcel_flood_constraint_overlay")
    has_nwi = _source_counts(db)[NWI_TABLE] > 0
    if has_nwi:
        _refresh_summary_with_nwi(db, has_flood=has_flood)
    else:
        _refresh_summary_without_nwi(db, has_flood=has_flood)


def _refresh_summary_without_nwi(db: Session, *, has_flood: bool) -> None:
    flood_join = "LEFT JOIN parcel_flood_constraint_overlay f ON f.official_parcel_id = p.official_parcel_id" if has_flood else ""
    flood_percent = "COALESCE(f.percent_parcel_constrained, 0)" if has_flood else "NULL"
    flood_context = (
        """
        CASE
          WHEN f.flood_review_required THEN 'Floodplain review required'
          WHEN f.floodplain_present THEN 'Mapped floodplain context'
          WHEN f.official_parcel_id IS NOT NULL THEN 'No mapped FEMA floodplain intersection'
          ELSE 'Data Unavailable'
        END
        """
        if has_flood
        else "'Data Unavailable'"
    )
    db.execute(
        text(
            f"""
            INSERT INTO {ENV_TABLE} (
              parcel_id, flood_context_band, flood_percent, wetland_intersection_flag,
              wetland_area_acres, wetland_percent, wetland_context_band, wetland_data_status,
              terrain_context_band, slope_data_status, soil_limitation_band, soil_data_status,
              regulated_facility_context_band, epa_data_status, usable_area_screening_proxy,
              overall_environmental_constraint_band, environmental_data_confidence,
              environmental_verification_flags, source_attribution, source_version, refreshed_at
            )
            SELECT
              p.official_parcel_id,
              {flood_context},
              {flood_percent},
              false,
              NULL,
              NULL,
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              CASE
                WHEN {flood_percent} >= 30 THEN 'Material Usable-Area Limitations'
                WHEN {flood_percent} > 0 THEN 'Moderate Usable-Area Limitations'
                ELSE 'Insufficient Environmental Information'
              END,
              CASE
                WHEN {flood_percent} >= 30 THEN 'Material Mapped Constraint'
                WHEN {flood_percent} > 0 THEN 'Moderate Mapped Constraint'
                ELSE 'Insufficient Information'
              END,
              CASE WHEN {flood_percent} IS NULL THEN 'Data Needed' ELSE 'Limited' END,
              CAST(:flags AS jsonb),
              CAST(:sources AS jsonb),
              'FEMA NFHL parcel overlay; NWI/USGS/NRCS/EPA extracts pending',
              now()
            FROM parcels_enriched p
            {flood_join}
            WHERE p.official_parcel_id IS NOT NULL
            ON CONFLICT (parcel_id) DO UPDATE SET
              flood_context_band = EXCLUDED.flood_context_band,
              flood_percent = EXCLUDED.flood_percent,
              wetland_intersection_flag = EXCLUDED.wetland_intersection_flag,
              wetland_area_acres = EXCLUDED.wetland_area_acres,
              wetland_percent = EXCLUDED.wetland_percent,
              wetland_context_band = EXCLUDED.wetland_context_band,
              wetland_data_status = EXCLUDED.wetland_data_status,
              terrain_context_band = EXCLUDED.terrain_context_band,
              slope_data_status = EXCLUDED.slope_data_status,
              soil_limitation_band = EXCLUDED.soil_limitation_band,
              soil_data_status = EXCLUDED.soil_data_status,
              regulated_facility_context_band = EXCLUDED.regulated_facility_context_band,
              epa_data_status = EXCLUDED.epa_data_status,
              usable_area_screening_proxy = EXCLUDED.usable_area_screening_proxy,
              overall_environmental_constraint_band = EXCLUDED.overall_environmental_constraint_band,
              environmental_data_confidence = EXCLUDED.environmental_data_confidence,
              environmental_verification_flags = EXCLUDED.environmental_verification_flags,
              source_attribution = EXCLUDED.source_attribution,
              source_version = EXCLUDED.source_version,
              refreshed_at = now()
            """
        ),
        {"flags": _json(_default_verification_flags()), "sources": _json(_source_attribution())},
    )


def _refresh_summary_with_nwi(db: Session, *, has_flood: bool) -> None:
    flood_join = "LEFT JOIN parcel_flood_constraint_overlay f ON f.official_parcel_id = p.official_parcel_id" if has_flood else ""
    flood_percent = "COALESCE(f.percent_parcel_constrained, 0)" if has_flood else "0"
    flood_context = (
        "CASE WHEN f.flood_review_required THEN 'Floodplain review required' WHEN f.floodplain_present THEN 'Mapped floodplain context' ELSE 'No mapped FEMA floodplain intersection' END"
        if has_flood
        else "'Data Unavailable'"
    )
    db.execute(
        text(
            f"""
            WITH parcel_base AS (
              SELECT p.official_parcel_id, p.geometry, p.parcel_area_acres_calc, {flood_percent} AS flood_pct, {flood_context} AS flood_context
              FROM parcels_enriched p
              {flood_join}
              WHERE p.official_parcel_id IS NOT NULL AND p.geometry IS NOT NULL AND NOT ST_IsEmpty(p.geometry)
            ),
            wetland AS (
              SELECT p.official_parcel_id,
                     SUM(ST_Area(ST_Intersection(
                       CASE WHEN ST_SRID(p.geometry) = 4326 THEN p.geometry ELSE ST_Transform(p.geometry, 4326) END,
                       w.geometry
                     )::geography) / 4046.8564224) AS wetland_acres
              FROM parcel_base p
              JOIN {NWI_TABLE} w
                ON ST_Intersects(CASE WHEN ST_SRID(p.geometry) = 4326 THEN p.geometry ELSE ST_Transform(p.geometry, 4326) END, w.geometry)
              GROUP BY p.official_parcel_id
            )
            INSERT INTO {ENV_TABLE} (
              parcel_id, flood_context_band, flood_percent, wetland_intersection_flag,
              wetland_area_acres, wetland_percent, wetland_context_band, wetland_data_status,
              terrain_context_band, slope_data_status, soil_limitation_band, soil_data_status,
              regulated_facility_context_band, epa_data_status, usable_area_screening_proxy,
              overall_environmental_constraint_band, environmental_data_confidence,
              environmental_verification_flags, source_attribution, source_version, refreshed_at
            )
            SELECT
              p.official_parcel_id,
              p.flood_context,
              p.flood_pct,
              COALESCE(w.wetland_acres, 0) > 0,
              COALESCE(w.wetland_acres, 0),
              CASE WHEN p.parcel_area_acres_calc > 0 THEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 ELSE NULL END,
              CASE
                WHEN p.parcel_area_acres_calc IS NULL OR p.parcel_area_acres_calc <= 0 THEN 'Data Unavailable'
                WHEN COALESCE(w.wetland_acres, 0) = 0 THEN 'No Mapped Intersection'
                WHEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 < 5 THEN 'Limited Mapped Intersection'
                WHEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 < 20 THEN 'Moderate Mapped Intersection'
                ELSE 'Substantial Mapped Intersection'
              END,
              'Available',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              'Data Unavailable',
              CASE
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 END, 0)) >= 30 THEN 'Material Usable-Area Limitations'
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 END, 0)) > 0 THEN 'Moderate Usable-Area Limitations'
                ELSE 'Broad Usable-Area Signal'
              END,
              CASE
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 END, 0)) >= 30 THEN 'Material Mapped Constraint'
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100 END, 0)) > 0 THEN 'Moderate Mapped Constraint'
                ELSE 'Limited Mapped Constraint'
              END,
              'Limited',
              CAST(:flags AS jsonb),
              CAST(:sources AS jsonb),
              'FEMA NFHL parcel overlay; NWI wetland extract; USGS/NRCS/EPA extracts pending',
              now()
            FROM parcel_base p
            LEFT JOIN wetland w ON w.official_parcel_id = p.official_parcel_id
            ON CONFLICT (parcel_id) DO UPDATE SET
              flood_context_band = EXCLUDED.flood_context_band,
              flood_percent = EXCLUDED.flood_percent,
              wetland_intersection_flag = EXCLUDED.wetland_intersection_flag,
              wetland_area_acres = EXCLUDED.wetland_area_acres,
              wetland_percent = EXCLUDED.wetland_percent,
              wetland_context_band = EXCLUDED.wetland_context_band,
              wetland_data_status = EXCLUDED.wetland_data_status,
              usable_area_screening_proxy = EXCLUDED.usable_area_screening_proxy,
              overall_environmental_constraint_band = EXCLUDED.overall_environmental_constraint_band,
              environmental_data_confidence = EXCLUDED.environmental_data_confidence,
              environmental_verification_flags = EXCLUDED.environmental_verification_flags,
              source_attribution = EXCLUDED.source_attribution,
              source_version = EXCLUDED.source_version,
              refreshed_at = now()
            """
        ),
        {"flags": _json(_default_verification_flags()), "sources": _json(_source_attribution(nwi=True))},
    )


def _refresh_one(db: Session, parcel_id: str) -> None:
    # Single-row fallback keeps candidate pages usable before a full refresh.
    has_flood = _table_exists(db, "parcel_flood_constraint_overlay")
    flood_join = "LEFT JOIN parcel_flood_constraint_overlay f ON f.official_parcel_id = p.official_parcel_id" if has_flood else ""
    flood_context = "CASE WHEN f.flood_review_required THEN 'Floodplain review required' WHEN f.floodplain_present THEN 'Mapped floodplain context' ELSE 'No mapped FEMA floodplain intersection' END" if has_flood else "'Data Unavailable'"
    flood_percent = "COALESCE(f.percent_parcel_constrained, 0)" if has_flood else "NULL"
    db.execute(
        text(
            f"""
            INSERT INTO {ENV_TABLE} (
              parcel_id, flood_context_band, flood_percent, environmental_verification_flags,
              source_attribution, source_version, refreshed_at
            )
            SELECT p.official_parcel_id, {flood_context}, {flood_percent}, CAST(:flags AS jsonb), CAST(:sources AS jsonb),
                   'FEMA NFHL parcel overlay; environmental source extracts pending', now()
            FROM parcels_enriched p
            {flood_join}
            WHERE p.official_parcel_id = :parcel_id
            ON CONFLICT (parcel_id) DO NOTHING
            """
        ),
        {"parcel_id": parcel_id, "flags": _json(_default_verification_flags()), "sources": _json(_source_attribution())},
    )


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(db.execute(text("SELECT to_regclass(:name)"), {"name": f"public.{table_name}"}).scalar())


def _source_counts(db: Session) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in (NWI_TABLE, SOIL_TABLE, FACILITY_TABLE):
        counts[table] = int(db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)
    counts["parcel_flood_constraint_overlay"] = int(db.execute(text("SELECT COUNT(*) FROM parcel_flood_constraint_overlay")).scalar() or 0) if _table_exists(db, "parcel_flood_constraint_overlay") else 0
    return counts


def _source_statuses(db: Session) -> list[dict[str, Any]]:
    counts = _source_counts(db)
    return [
        _source("fema_nfhl", "FEMA National Flood Hazard Layer", counts["parcel_flood_constraint_overlay"], "Available" if counts["parcel_flood_constraint_overlay"] else "Data Unavailable", "Official flood hazard overlay already used by CFS."),
        _source("usfws_nwi", "USFWS National Wetlands Inventory", counts[NWI_TABLE], "Available" if counts[NWI_TABLE] else "Data Unavailable", "Mapped wetland context only; professional delineation may still be required."),
        _source("usgs_3dep", "USGS 3DEP elevation and slope", 0, "Data Unavailable", "Slope summaries require a county-clipped elevation workflow."),
        _source("nrcs_soils", "NRCS soil survey context", counts[SOIL_TABLE], "Available" if counts[SOIL_TABLE] else "Data Unavailable", "Soil mapping is screening context, not geotechnical confirmation."),
        _source("epa_echo", "EPA regulated facility proximity", counts[FACILITY_TABLE], "Available" if counts[FACILITY_TABLE] else "Data Unavailable", "Facility proximity does not imply parcel contamination."),
    ]


def _source(source_id: str, name: str, row_count: int, status: str, limitation: str) -> dict[str, Any]:
    return {"source_id": source_id, "source_name": name, "row_count": row_count, "status": status, "limitation": limitation}


def _default_verification_flags() -> list[str]:
    return [
        "Review FEMA floodplain context where mapped.",
        "Review NWI mapping when available and obtain professional wetland delineation if needed.",
        "Obtain topographic survey and engineering review for slope/grading feasibility.",
        "Review NRCS soil mapping and obtain geotechnical investigation where appropriate.",
        "Review nearby regulated facilities and consider Phase I environmental site assessment where appropriate.",
    ]


def _source_attribution(*, nwi: bool = False) -> dict[str, str]:
    sources = {
        "flood": "FEMA National Flood Hazard Layer parcel overlay",
        "slope": "USGS 3DEP elevation/slope extract not yet refreshed locally",
        "soils": "USDA NRCS soil extract not yet refreshed locally",
        "regulated_facilities": "U.S. EPA facility extract not yet refreshed locally",
    }
    sources["wetlands"] = "USFWS National Wetlands Inventory" if nwi else "USFWS NWI extract not yet refreshed locally"
    return sources


def _unavailable(reason: str, *, parcel_id: str | None = None) -> dict[str, Any]:
    return {
        "parcel_id": parcel_id,
        "flood_context": "Data Unavailable",
        "mapped_wetland_context": "Data Unavailable",
        "terrain_context": "Data Unavailable",
        "soil_context": "Data Unavailable",
        "environmental_facility_context": "Data Unavailable",
        "usable_area_screening_proxy": "Insufficient Environmental Information",
        "overall_environmental_constraint_band": "Insufficient Information",
        "environmental_data_confidence": "Data Needed",
        "verification_requirements": _default_verification_flags(),
        "source_attribution": _source_attribution(),
        "last_refreshed": None,
        "limitations": [SAFE_LIMITATION, PROXY_LIMITATION, reason],
    }


def _json_ready(row: Any) -> dict[str, Any]:
    data = dict(row)
    for key, value in list(data.items()):
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
        elif isinstance(value, Decimal):
            try:
                data[key] = float(value)
            except (TypeError, ValueError):
                pass
    return data


def _json(value: Any) -> str:
    import json

    return json.dumps(value)
