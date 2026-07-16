"""Environmental screening context for internal CFS Investment candidates."""

from __future__ import annotations

import csv
import io
import json
import threading
from datetime import UTC, datetime
from decimal import Decimal
from itertools import batched
from pathlib import Path
from typing import Any

import numpy as np
import requests
from PIL import Image
from shapely.geometry import mapping, shape
from shapely.validation import make_valid

from sqlalchemy import text
from sqlalchemy.orm import Session

ENV_TABLE = "investment_parcel_environmental_context"
NWI_TABLE = "investment_nwi_wetlands"
TERRAIN_TABLE = "investment_terrain_context"
SOIL_TABLE = "investment_soil_units"
FACILITY_TABLE = "investment_environmental_facilities"
COUNTY_FIPS = "37025"
TERRAIN_CACHE_DIR_ENV = "CFS_ENVIRONMENTAL_CACHE_DIR"
NWI_QUERY_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query"
NWI_SOURCE_VERSION = "USFWS NWI Wetlands Map Service; state downloads last updated May 2026"
NRCS_WFS_URL = "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs"
NRCS_SOURCE_VERSION = "USDA NRCS Soil Data Access WFS mapunitpolyextended"
USGS_3DEP_EXPORT_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
USGS_3DEP_SOURCE_VERSION = "USGS 3DEP Elevation ImageServer export; county screening raster"
EPA_ECHO_BASE_URL = "https://echodata.epa.gov/echo/echo_rest_services"
EPA_ECHO_SOURCE_VERSION = "EPA ECHO All Media Programs Facility Search"
STEEP_SLOPE_PERCENT = 15
TERRAIN_RASTER_SIZE = 512
TERRAIN_PIXEL_INSERT_BATCH = 5000
EPA_IMMEDIATE_ADJACENT_METERS = 30.48
_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()

SAFE_LIMITATION = (
    "Environmental context is screening-level only and does not replace survey, wetland delineation, "
    "engineering, geotechnical, zoning, utility, or environmental review."
)
PROXY_LIMITATION = "Usable-area screening proxy is not a certified site-area calculation or a development certification."

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
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'High')::int AS high_confidence_parcels,
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'Medium')::int AS medium_confidence_parcels,
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'Limited')::int AS limited_confidence_parcels,
              COUNT(*) FILTER (WHERE environmental_data_confidence = 'Insufficient')::int AS insufficient_confidence_parcels,
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
        "limitations": _source_limitations(_source_counts(db)),
    }


def refresh_environmental_context(db: Session, *, source: str = "all") -> dict[str, Any]:
    _ensure_tables(db)
    if source == "slope":
        source = "terrain"
    if source not in {"all", "nwi", "terrain", "soils", "epa", "summaries"}:
        raise ValueError("source must be one of all, nwi, terrain, soils, epa, or summaries")
    loaders = {
        "nwi": _load_nwi_wetlands,
        "terrain": _load_usgs_terrain,
        "soils": _load_nrcs_soils,
        "epa": _load_epa_facilities,
    }
    loaded_sources: dict[str, Any] = {}
    if source != "summaries":
        for source_name, loader in loaders.items():
            if source in {"all", source_name}:
                loaded_sources[source_name] = loader(db)
    _refresh_parcel_summary(db, source=source)
    status = environmental_status(db)
    return {
        "status": "ok",
        "source_requested": source,
        "loaded_sources": loaded_sources,
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
        "minimum_elevation": data.get("minimum_elevation"),
        "maximum_elevation": data.get("maximum_elevation"),
        "mean_elevation": data.get("mean_elevation"),
        "elevation_range": data.get("elevation_range"),
        "terrain_context": data.get("terrain_context_band") or "Data Unavailable",
        "mean_slope_percent": data.get("mean_slope_percent"),
        "maximum_slope_percent": data.get("maximum_slope_percent"),
        "steep_slope_percent": data.get("steep_slope_percent"),
        "terrain_source_resolution": data.get("terrain_source_resolution"),
        "terrain_source_date": data.get("terrain_source_date"),
        "soil_context": data.get("soil_limitation_band") or "Data Unavailable",
        "dominant_soil_group": data.get("dominant_soil_group"),
        "poor_drainage_percent": data.get("poor_drainage_percent"),
        "prime_farmland_percent": data.get("prime_farmland_percent"),
        "environmental_facility_context": data.get("regulated_facility_context_band") or "Data Unavailable",
        "regulated_facility_count_1mi": data.get("regulated_facility_count_1mi"),
        "nearest_regulated_facility_distance_miles": data.get("nearest_regulated_facility_distance_miles"),
        "usable_area_screening_proxy": data.get("usable_area_screening_proxy") or "Insufficient Environmental Information",
        "overall_environmental_constraint_band": data.get("overall_environmental_constraint_band") or "Insufficient Information",
        "environmental_data_confidence": data.get("environmental_data_confidence") or "Data Needed",
        "verification_requirements": data.get("environmental_verification_flags") or _default_verification_flags(),
        "source_attribution": data.get("source_attribution") or _source_attribution(),
        "source_version": data.get("source_version") or "FEMA flood overlay plus pending environmental source extracts",
        "last_refreshed": data.get("refreshed_at"),
        "limitations": _source_limitations(_source_counts(db)),
    }


def _ensure_tables(db: Session) -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        _ensure_tables_unlocked(db)
        commit = getattr(db, "commit", None)
        if callable(commit):
            commit()
            _SCHEMA_READY = True


def _ensure_tables_unlocked(db: Session) -> None:
    # ponytail: process-local schema guard; use migrations when this service needs multi-process DDL.
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
            CREATE TABLE IF NOT EXISTS {TERRAIN_TABLE} (
              parcel_id text PRIMARY KEY,
              minimum_elevation numeric,
              maximum_elevation numeric,
              mean_elevation numeric,
              elevation_range numeric,
              mean_slope_percent numeric,
              maximum_slope_percent numeric,
              steep_slope_percent numeric,
              terrain_context_band text NOT NULL DEFAULT 'Data Unavailable',
              source_attribution text NOT NULL DEFAULT 'U.S. Geological Survey 3D Elevation Program',
              source_version text,
              terrain_source_resolution text,
              terrain_source_date text,
              retrieved_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    )
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
              physical_facility_key text,
              program_type text,
              program_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
              active_program_count integer NOT NULL DEFAULT 0,
              historical_program_count integer NOT NULL DEFAULT 0,
              facility_status_band text,
              coordinate_quality_band text,
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
              minimum_elevation numeric,
              maximum_elevation numeric,
              elevation_range numeric,
              mean_slope_percent numeric,
              maximum_slope_percent numeric,
              steep_slope_percent numeric,
              terrain_source_resolution text,
              terrain_source_date text,
              terrain_context_band text NOT NULL DEFAULT 'Data Unavailable',
              slope_data_status text NOT NULL DEFAULT 'Data Unavailable',
              dominant_soil_group text,
              poor_drainage_percent numeric,
              prime_farmland_percent numeric,
              soil_limitation_band text NOT NULL DEFAULT 'Data Unavailable',
              soil_data_status text NOT NULL DEFAULT 'Data Unavailable',
              soil_verification_required boolean NOT NULL DEFAULT true,
              regulated_facility_nearby_flag boolean NOT NULL DEFAULT false,
              regulated_facility_count_1mi integer,
              nearest_regulated_facility_distance_miles numeric,
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
    for column, definition in {
        "minimum_elevation": "numeric",
        "maximum_elevation": "numeric",
        "mean_elevation": "numeric",
        "elevation_range": "numeric",
        "poor_drainage_percent": "numeric",
        "prime_farmland_percent": "numeric",
        "regulated_facility_count_1mi": "integer",
        "nearest_regulated_facility_distance_miles": "numeric",
        "maximum_slope_percent": "numeric",
        "terrain_source_resolution": "text",
        "terrain_source_date": "text",
    }.items():
        db.execute(text(f"ALTER TABLE {ENV_TABLE} ADD COLUMN IF NOT EXISTS {column} {definition}"))
    for column, definition in {
        "elevation_range": "numeric",
        "maximum_slope_percent": "numeric",
        "terrain_source_resolution": "text",
        "terrain_source_date": "text",
    }.items():
        db.execute(text(f"ALTER TABLE {TERRAIN_TABLE} ADD COLUMN IF NOT EXISTS {column} {definition}"))
    for column, definition in {
        "physical_facility_key": "text",
        "program_categories": "jsonb NOT NULL DEFAULT '[]'::jsonb",
        "active_program_count": "integer NOT NULL DEFAULT 0",
        "historical_program_count": "integer NOT NULL DEFAULT 0",
        "facility_status_band": "text",
        "coordinate_quality_band": "text",
    }.items():
        db.execute(text(f"ALTER TABLE {FACILITY_TABLE} ADD COLUMN IF NOT EXISTS {column} {definition}"))


def _refresh_parcel_summary(db: Session, *, source: str = "all") -> None:
    source_counts = _source_counts(db)
    if source == "summaries":
        _recalculate_environmental_bands(db)
        return
    has_summary = bool(db.execute(text(f"SELECT EXISTS (SELECT 1 FROM {ENV_TABLE})")).scalar())
    if source in {"all", "nwi"} or not has_summary:
        has_flood = _table_exists(db, "parcel_flood_constraint_overlay")
        if source_counts[NWI_TABLE] > 0:
            _refresh_summary_with_nwi(db, has_flood=has_flood)
        else:
            _refresh_summary_without_nwi(db, has_flood=has_flood)
    if source in {"all", "terrain", "summaries"} and source_counts[TERRAIN_TABLE] > 0:
        _apply_terrain_summary(db)
    if source in {"all", "soils", "summaries"} and source_counts[SOIL_TABLE] > 0:
        _apply_soil_summary(db)
    if source in {"all", "epa", "summaries"} and source_counts[FACILITY_TABLE] > 0:
        _apply_facility_summary(db)
    _recalculate_environmental_bands(db)


def _apply_terrain_summary(db: Session) -> None:
    db.execute(
        text(
            f"""
            UPDATE {ENV_TABLE} e
            SET minimum_elevation = t.minimum_elevation,
                maximum_elevation = t.maximum_elevation,
                mean_elevation = t.mean_elevation,
                elevation_range = t.elevation_range,
                mean_slope_percent = t.mean_slope_percent,
                maximum_slope_percent = t.maximum_slope_percent,
                steep_slope_percent = t.steep_slope_percent,
                terrain_source_resolution = t.terrain_source_resolution,
                terrain_source_date = t.terrain_source_date,
                terrain_context_band = t.terrain_context_band,
                slope_data_status = 'Available'
            FROM {TERRAIN_TABLE} t
            WHERE t.parcel_id = e.parcel_id
            """
        )
    )


def _apply_soil_summary(db: Session) -> None:
    db.execute(
        text(
            f"""
            WITH parcel_base AS (
              SELECT official_parcel_id AS parcel_id, CASE WHEN ST_SRID(geometry) = 4326 THEN geometry ELSE ST_Transform(geometry, 4326) END AS geom
              FROM parcels_enriched
              WHERE official_parcel_id IS NOT NULL AND geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ),
            overlap AS (
              SELECT p.parcel_id,
                     s.hydrologic_soil_group,
                     s.drainage_class,
                     s.prime_farmland_class,
                     s.soil_limitation_note,
                     ST_Area(ST_Intersection(p.geom, s.geometry)::geography) AS area_m2
              FROM parcel_base p
              JOIN {SOIL_TABLE} s ON ST_Intersects(p.geom, s.geometry)
            ),
            ranked AS (
              SELECT *,
                     ROW_NUMBER() OVER (PARTITION BY parcel_id ORDER BY area_m2 DESC NULLS LAST) AS rn,
                     SUM(area_m2) OVER (PARTITION BY parcel_id) AS total_area_m2,
                     SUM(area_m2) FILTER (WHERE drainage_class ILIKE '%poor%' OR drainage_class ILIKE '%very poorly%') OVER (PARTITION BY parcel_id) AS poor_area_m2,
                     SUM(area_m2) FILTER (WHERE prime_farmland_class ILIKE '%prime%' OR prime_farmland_class ILIKE '%farmland%') OVER (PARTITION BY parcel_id) AS prime_area_m2,
                     BOOL_OR(soil_limitation_note ILIKE '%Very limited%') OVER (PARTITION BY parcel_id) AS has_very_limited,
                     BOOL_OR(soil_limitation_note ILIKE '%Somewhat limited%') OVER (PARTITION BY parcel_id) AS has_somewhat_limited
              FROM overlap
            )
            UPDATE {ENV_TABLE} e
            SET dominant_soil_group = r.hydrologic_soil_group,
                poor_drainage_percent = round((COALESCE(r.poor_area_m2, 0) / NULLIF(r.total_area_m2, 0) * 100)::numeric, 2),
                prime_farmland_percent = round((COALESCE(r.prime_area_m2, 0) / NULLIF(r.total_area_m2, 0) * 100)::numeric, 2),
                soil_limitation_band = CASE
                  WHEN r.has_very_limited OR COALESCE(r.poor_area_m2, 0) / NULLIF(r.total_area_m2, 0) >= 0.30 THEN 'Material Soil Review Need'
                  WHEN r.has_somewhat_limited OR COALESCE(r.poor_area_m2, 0) / NULLIF(r.total_area_m2, 0) > 0 THEN 'Moderate Soil Review Need'
                  ELSE 'Limited Mapped Soil Limitation'
                END,
                soil_data_status = 'Available',
                soil_verification_required = true
            FROM ranked r
            WHERE r.rn = 1 AND r.parcel_id = e.parcel_id
            """
        )
    )


def _apply_facility_summary(db: Session) -> None:
    db.execute(
        text(
            f"""
            WITH parcel_points AS (
              SELECT official_parcel_id AS parcel_id, ST_Transform(geometry, 3857) AS geom
              FROM parcels_enriched
              WHERE official_parcel_id IS NOT NULL AND geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ),
            facility_points AS (
              SELECT source_id, program_type, ST_Transform(geometry, 3857) AS geom
              FROM {FACILITY_TABLE}
              WHERE geometry IS NOT NULL
            ),
            nearby AS (
              SELECT p.parcel_id,
                     COUNT(f.source_id)::int AS facility_count,
                     MIN(ST_Distance(p.geom, f.geom)) / 1609.344 AS nearest_miles
              FROM parcel_points p
              LEFT JOIN facility_points f ON ST_DWithin(p.geom, f.geom, 1609.344)
              GROUP BY p.parcel_id
            )
            UPDATE {ENV_TABLE} e
            SET regulated_facility_nearby_flag = COALESCE(n.facility_count, 0) > 0,
                regulated_facility_count_1mi = COALESCE(n.facility_count, 0),
                nearest_regulated_facility_distance_miles = round(n.nearest_miles::numeric, 2),
                regulated_facility_count_band = CASE
                  WHEN COALESCE(n.facility_count, 0) = 0 THEN 'No Facility Identified in Screening Radius'
                  WHEN n.facility_count = 1 THEN 'One Facility Within 1 Mile'
                  WHEN n.facility_count <= 4 THEN 'Multiple Facilities Within 1 Mile'
                  ELSE 'Five or More Facilities Within 1 Mile'
                END,
                nearest_regulated_facility_distance_band = CASE
                  WHEN n.nearest_miles IS NULL THEN 'No Facility Identified in Screening Radius'
                  WHEN n.nearest_miles <= (:immediate_meters / 1609.344) THEN 'Facility Intersects or Is Immediately Adjacent'
                  WHEN n.nearest_miles <= 0.25 THEN 'Facility Within 0.25 Mile'
                  WHEN n.nearest_miles <= 0.5 THEN 'Facility Between 0.25 and 0.5 Mile'
                  WHEN n.nearest_miles <= 1 THEN 'Facility Between 0.5 and 1 Mile'
                  ELSE 'No Facility Identified in Screening Radius'
                END,
                regulated_facility_context_band = CASE
                  WHEN n.nearest_miles IS NULL THEN 'No Facility Identified in Screening Radius'
                  WHEN n.nearest_miles <= (:immediate_meters / 1609.344) THEN 'Facility Intersects or Is Immediately Adjacent'
                  WHEN n.nearest_miles <= 0.25 THEN 'Facility Within 0.25 Mile'
                  WHEN n.nearest_miles <= 0.5 THEN 'Facility Between 0.25 and 0.5 Mile'
                  WHEN n.nearest_miles <= 1 THEN 'Facility Between 0.5 and 1 Mile'
                  ELSE 'No Facility Identified in Screening Radius'
                END,
                epa_data_status = 'Available'
            FROM nearby n
            WHERE n.parcel_id = e.parcel_id
            """
        ),
        {"immediate_meters": EPA_IMMEDIATE_ADJACENT_METERS},
    )


def _recalculate_environmental_bands(db: Session) -> None:
    source_counts = _source_counts(db)
    available_count = sum(
        1
        for table in ("parcel_flood_constraint_overlay", NWI_TABLE, TERRAIN_TABLE, SOIL_TABLE, FACILITY_TABLE)
        if source_counts.get(table, 0) > 0
    )
    source_version = _source_version_text(source_counts)
    db.execute(
        text(
            f"""
            UPDATE {ENV_TABLE}
            SET wetland_percent = CASE WHEN wetland_percent IS NULL THEN NULL ELSE LEAST(wetland_percent, 100) END,
                usable_area_screening_proxy = CASE
                  WHEN GREATEST(COALESCE(flood_percent, 0), LEAST(COALESCE(wetland_percent, 0), 100), COALESCE(steep_slope_percent, 0)) >= 30 THEN 'Material Usable-Area Limitations'
                  WHEN GREATEST(COALESCE(flood_percent, 0), LEAST(COALESCE(wetland_percent, 0), 100), COALESCE(steep_slope_percent, 0)) > 0 THEN 'Moderate Usable-Area Limitations'
                  WHEN :available_count >= 2 THEN 'Broad Usable-Area Signal'
                  ELSE 'Insufficient Environmental Information'
                END,
                overall_environmental_constraint_band = CASE
                  WHEN GREATEST(COALESCE(flood_percent, 0), LEAST(COALESCE(wetland_percent, 0), 100), COALESCE(steep_slope_percent, 0)) >= 30
                       OR terrain_context_band = 'Higher-Slope Constraint' THEN 'Material Mapped Constraint'
                  WHEN GREATEST(COALESCE(flood_percent, 0), LEAST(COALESCE(wetland_percent, 0), 100), COALESCE(steep_slope_percent, 0)) > 0
                       OR regulated_facility_context_band IN ('Facility Intersects or Is Immediately Adjacent', 'Facility Within 0.25 Mile')
                       OR terrain_context_band IN ('Mixed Terrain', 'Moderate Terrain')
                       OR soil_limitation_band = 'Moderate Soil Review Need' THEN 'Moderate Mapped Constraint'
                  WHEN soil_limitation_band = 'Material Soil Review Need' THEN 'High Verification Need'
                  WHEN :available_count >= 2 THEN 'Limited Mapped Constraint'
                  ELSE 'Insufficient Information'
                END,
                environmental_data_confidence = CASE
                  WHEN :available_count >= 5 THEN 'High'
                  WHEN :available_count >= 4 THEN 'Medium'
                  WHEN :available_count >= 2 THEN 'Limited'
                  ELSE 'Insufficient'
                END,
                source_attribution = CAST(:source_attribution AS jsonb),
                source_version = :source_version,
                refreshed_at = now()
            """
        ),
        {
            "available_count": available_count,
            "source_version": source_version,
            "source_attribution": _json(
                _source_attribution(
                    nwi=source_counts.get(NWI_TABLE, 0) > 0,
                    terrain=source_counts.get(TERRAIN_TABLE, 0) > 0,
                    soils=source_counts.get(SOIL_TABLE, 0) > 0,
                    epa=source_counts.get(FACILITY_TABLE, 0) > 0,
                )
            ),
        },
    )


def _source_version_text(counts: dict[str, int]) -> str:
    parts = ["FEMA NFHL parcel overlay"]
    if counts.get(NWI_TABLE):
        parts.append(NWI_SOURCE_VERSION)
    if counts.get(TERRAIN_TABLE):
        parts.append(USGS_3DEP_SOURCE_VERSION)
    if counts.get(SOIL_TABLE):
        parts.append(NRCS_SOURCE_VERSION)
    if counts.get(FACILITY_TABLE):
        parts.append(EPA_ECHO_SOURCE_VERSION)
    return "; ".join(parts)


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
              CASE WHEN p.parcel_area_acres_calc > 0 THEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) ELSE NULL END,
              CASE
                WHEN p.parcel_area_acres_calc IS NULL OR p.parcel_area_acres_calc <= 0 THEN 'Data Unavailable'
                WHEN COALESCE(w.wetland_acres, 0) = 0 THEN 'No Mapped Intersection'
                WHEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) < 5 THEN 'Limited Mapped Intersection'
                WHEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) < 20 THEN 'Moderate Mapped Intersection'
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
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) END, 0)) >= 30 THEN 'Material Usable-Area Limitations'
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) END, 0)) > 0 THEN 'Moderate Usable-Area Limitations'
                ELSE 'Broad Usable-Area Signal'
              END,
              CASE
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) END, 0)) >= 30 THEN 'Material Mapped Constraint'
                WHEN GREATEST(COALESCE(p.flood_pct, 0), COALESCE(CASE WHEN p.parcel_area_acres_calc > 0 THEN LEAST(100, COALESCE(w.wetland_acres, 0) / p.parcel_area_acres_calc * 100) END, 0)) > 0 THEN 'Moderate Mapped Constraint'
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
    for table in (NWI_TABLE, TERRAIN_TABLE, SOIL_TABLE, FACILITY_TABLE):
        counts[table] = int(db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)
    counts["parcel_flood_constraint_overlay"] = int(db.execute(text("SELECT COUNT(*) FROM parcel_flood_constraint_overlay")).scalar() or 0) if _table_exists(db, "parcel_flood_constraint_overlay") else 0
    return counts


def _source_statuses(db: Session) -> list[dict[str, Any]]:
    counts = _source_counts(db)
    return [
        _source("fema_nfhl", "FEMA National Flood Hazard Layer", counts["parcel_flood_constraint_overlay"], "Available" if counts["parcel_flood_constraint_overlay"] else "Data Unavailable", "Official flood hazard overlay already used by CFS."),
        _source("usfws_nwi", "USFWS National Wetlands Inventory", counts[NWI_TABLE], "Available" if counts[NWI_TABLE] else "Data Unavailable", "Mapped wetland context only; professional delineation may still be required."),
        _source("usgs_3dep", "USGS 3DEP elevation and slope", counts[TERRAIN_TABLE], "Available" if counts[TERRAIN_TABLE] else "Data Unavailable", "Slope summaries are screening context, not engineering conclusions."),
        _source("nrcs_soils", "NRCS soil survey context", counts[SOIL_TABLE], "Available" if counts[SOIL_TABLE] else "Data Unavailable", "Soil mapping is screening context, not geotechnical confirmation."),
        _source("epa_echo", "EPA regulated facility proximity", counts[FACILITY_TABLE], "Available" if counts[FACILITY_TABLE] else "Data Unavailable", "Facility proximity does not imply parcel contamination."),
    ]


def _source(source_id: str, name: str, row_count: int, status: str, limitation: str) -> dict[str, Any]:
    return {"source_id": source_id, "source_name": name, "row_count": row_count, "status": status, "limitation": limitation}


def _county_bbox(db: Session) -> tuple[float, float, float, float]:
    row = db.execute(
        text(
            """
            SELECT ST_XMin(extent) AS xmin, ST_YMin(extent) AS ymin, ST_XMax(extent) AS xmax, ST_YMax(extent) AS ymax
            FROM (
              SELECT ST_Extent(CASE WHEN ST_SRID(geometry) = 4326 THEN geometry ELSE ST_Transform(geometry, 4326) END) AS extent
              FROM parcels_enriched
              WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ) bounds
            """
        )
    ).mappings().first()
    if not row or row["xmin"] is None:
        raise RuntimeError("Parcel geometry extent is unavailable.")
    return (float(row["xmin"]), float(row["ymin"]), float(row["xmax"]), float(row["ymax"]))


def _county_bbox_3857(db: Session) -> tuple[float, float, float, float]:
    row = db.execute(
        text(
            """
            SELECT ST_XMin(extent) AS xmin, ST_YMin(extent) AS ymin, ST_XMax(extent) AS xmax, ST_YMax(extent) AS ymax
            FROM (
              SELECT ST_Extent(ST_Transform(geometry, 3857)) AS extent
              FROM parcels_enriched
              WHERE geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ) bounds
            """
        )
    ).mappings().first()
    if not row or row["xmin"] is None:
        raise RuntimeError("Parcel geometry extent is unavailable.")
    return (float(row["xmin"]), float(row["ymin"]), float(row["xmax"]), float(row["ymax"]))


def _load_nwi_wetlands(db: Session) -> dict[str, Any]:
    xmin, ymin, xmax, ymax = _county_bbox(db)
    params = {
        "f": "json",
        "where": "1=1",
        "returnIdsOnly": "true",
        "geometry": f"{xmin},{ymin},{xmax},{ymax}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }
    ids = requests.get(NWI_QUERY_URL, params=params, timeout=180).json().get("objectIds") or []
    rows: list[dict[str, Any]] = []
    invalid_count = 0
    for chunk in batched(ids, 100):
        response = requests.get(
            NWI_QUERY_URL,
            params={
                "f": "geojson",
                "objectIds": ",".join(str(value) for value in chunk),
                "outFields": "Wetlands.OBJECTID,Wetlands.ATTRIBUTE,Wetlands.WETLAND_TYPE,Wetlands.ACRES,Wetlands.GLOBALID",
                "returnGeometry": "true",
                "outSR": "4326",
            },
            timeout=120,
        )
        response.raise_for_status()
        for feature in response.json().get("features") or []:
            geometry_json = feature.get("geometry")
            if not geometry_json:
                continue
            geom = make_valid(shape(geometry_json))
            if geom.is_empty:
                invalid_count += 1
                continue
            if not geom.is_valid:
                invalid_count += 1
            props = feature.get("properties") or {}
            source_id = str(props.get("Wetlands.OBJECTID") or feature.get("id") or props.get("OBJECTID"))
            rows.append(
                {
                    "source_id": source_id,
                    "wetland_type": props.get("Wetlands.WETLAND_TYPE") or props.get("WETLAND_TYPE") or props.get("Wetlands.ATTRIBUTE") or props.get("ATTRIBUTE"),
                    "source_date": NWI_SOURCE_VERSION,
                    "source_attribution": "U.S. Fish and Wildlife Service National Wetlands Inventory",
                    "geometry": json.dumps(mapping(geom)),
                }
            )
    if rows:
        db.execute(text(f"DELETE FROM {NWI_TABLE}"))
        db.execute(
            text(
                f"""
                INSERT INTO {NWI_TABLE} (source_id, wetland_type, source_date, source_attribution, geometry)
                VALUES (
                  :source_id, :wetland_type, :source_date, :source_attribution,
                  ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 3))
                )
                ON CONFLICT (source_id) DO UPDATE SET
                  wetland_type = EXCLUDED.wetland_type,
                  source_date = EXCLUDED.source_date,
                  source_attribution = EXCLUDED.source_attribution,
                  retrieved_at = now(),
                  geometry = EXCLUDED.geometry
                """
            ),
            rows,
        )
    return {"source_rows": len(rows), "invalid_geometry_count": invalid_count, "source_version": NWI_SOURCE_VERSION}


def _load_nrcs_soils(db: Session) -> dict[str, Any]:
    import geopandas as gpd

    xmin, ymin, xmax, ymax = _county_bbox(db)
    url = (
        f"{NRCS_WFS_URL}?service=WFS&version=1.0.0&request=GetFeature&typeName=mapunitpolyextended"
        f"&srsName=EPSG:4326&BBOX={xmin},{ymin},{xmax},{ymax}"
    )
    gdf = gpd.read_file(url)
    if gdf.empty:
        return {"source_rows": 0, "source_version": NRCS_SOURCE_VERSION}
    rows: list[dict[str, Any]] = []
    invalid_count = 0
    for record in gdf.to_dict("records"):
        geom = record.get("geometry")
        if geom is None or geom.is_empty:
            invalid_count += 1
            continue
        geom = make_valid(geom)
        if not geom.is_valid:
            invalid_count += 1
        if geom.is_empty:
            continue
        source_id = str(record.get("mupolygonkey") or record.get("gml_id") or record.get("mukey"))
        rows.append(
            {
                "source_id": source_id,
                "map_unit": _clean_source_text(record.get("muname") or record.get("musym") or record.get("mukey")),
                "hydrologic_soil_group": _clean_source_text(record.get("hydgrpdcd")),
                "drainage_class": _clean_source_text(record.get("drclassdcd") or record.get("drclasswettest")),
                "prime_farmland_class": _clean_source_text(record.get("iccdcd") or record.get("niccdcd")),
                "soil_limitation_note": _soil_limit_note(record),
                "source_attribution": "USDA NRCS Soil Data Access / SSURGO mapunitpolyextended",
                "geometry": json.dumps(mapping(geom)),
            }
        )
    if rows:
        db.execute(text(f"DELETE FROM {SOIL_TABLE}"))
        db.execute(
            text(
                f"""
                INSERT INTO {SOIL_TABLE} (
                  source_id, map_unit, hydrologic_soil_group, drainage_class,
                  prime_farmland_class, soil_limitation_note, source_attribution, geometry
                ) VALUES (
                  :source_id, :map_unit, :hydrologic_soil_group, :drainage_class,
                  :prime_farmland_class, :soil_limitation_note, :source_attribution,
                  ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 3))
                )
                ON CONFLICT (source_id) DO UPDATE SET
                  map_unit = EXCLUDED.map_unit,
                  hydrologic_soil_group = EXCLUDED.hydrologic_soil_group,
                  drainage_class = EXCLUDED.drainage_class,
                  prime_farmland_class = EXCLUDED.prime_farmland_class,
                  soil_limitation_note = EXCLUDED.soil_limitation_note,
                  source_attribution = EXCLUDED.source_attribution,
                  retrieved_at = now(),
                  geometry = EXCLUDED.geometry
                """
            ),
            rows,
        )
    return {"source_rows": len(rows), "invalid_geometry_count": invalid_count, "source_version": NRCS_SOURCE_VERSION}


def _soil_limit_note(record: dict[str, Any]) -> str | None:
    values = [
        record.get("engdwobdcd"),
        record.get("engdwbdcd"),
        record.get("engdwbll"),
        record.get("engdwbml"),
        record.get("engstafdcd"),
        record.get("engstafll"),
        record.get("engstafml"),
        record.get("engsldcd"),
        record.get("engsldcp"),
        record.get("urbrecptdcd"),
        record.get("forpehrtdcp"),
    ]
    notes = [str(value) for value in values if value not in (None, "")]
    if any("Very limited" in note or "severe" in note.lower() for note in notes):
        return "Very limited"
    if any("Somewhat limited" in note or "moderate" in note.lower() for note in notes):
        return "Somewhat limited"
    return notes[0] if notes else None


def _load_epa_facilities(db: Session) -> dict[str, Any]:
    xmin, ymin, xmax, ymax = _county_bbox(db)
    facilities_response = requests.get(
        f"{EPA_ECHO_BASE_URL}.get_facilities",
        params={"output": "JSON", "p_st": "NC", "p_co": "Cabarrus"},
        timeout=60,
    )
    facilities_response.raise_for_status()
    result = facilities_response.json().get("Results") or {}
    qid = result.get("QueryID")
    if not qid:
        return {"source_rows": 0, "source_version": EPA_ECHO_SOURCE_VERSION}
    lat_by_registry: dict[str, dict[str, Any]] = {}
    page = 1
    while True:
        page_response = requests.get(
            f"{EPA_ECHO_BASE_URL}.get_qid",
            params={"output": "JSON", "qid": qid, "pageno": page},
            timeout=60,
        )
        page_response.raise_for_status()
        rows = ((page_response.json().get("Results") or {}).get("Facilities") or [])
        if not rows:
            break
        for row in rows:
            registry_id = str(row.get("RegistryID") or "")
            if registry_id:
                lat_by_registry[registry_id] = row
        if len(rows) < 5000:
            break
        page += 1
    csv_response = requests.get(f"{EPA_ECHO_BASE_URL}.get_download", params={"qid": qid}, timeout=120)
    csv_response.raise_for_status()
    facilities: dict[str, dict[str, Any]] = {}
    raw_count = 0
    invalid_coordinate_count = 0
    outside_count = 0
    for row in csv.DictReader(io.StringIO(csv_response.text)):
        raw_count += 1
        registry_id = str(row.get("RegistryID") or "")
        details = lat_by_registry.get(registry_id, {})
        lat = _float(details.get("FacLat"))
        lon = _float(row.get("FacLong"))
        if not registry_id or lat is None or lon is None:
            invalid_coordinate_count += 1
            continue
        if not (xmin - 0.05 <= lon <= xmax + 0.05 and ymin - 0.05 <= lat <= ymax + 0.05):
            outside_count += 1
            continue
        key = _epa_physical_facility_key(row.get("FacName"), lat, lon, registry_id)
        active = str(details.get("FacActiveFlag") or row.get("FacActiveFlag") or "").upper() == "Y"
        categories = _epa_program_categories(row, details)
        facility = facilities.setdefault(
            key,
            {
                "source_id": key,
                "physical_facility_key": key,
                "facility_name": row.get("FacName"),
                "program_categories": set(),
                "active_program_count": 0,
                "historical_program_count": 0,
                "lon": lon,
                "lat": lat,
            },
        )
        facility["program_categories"].update(categories)
        if active:
            facility["active_program_count"] += 1
        else:
            facility["historical_program_count"] += 1
    rows = []
    category_counts: dict[str, int] = {}
    for facility in facilities.values():
        categories = sorted(facility["program_categories"]) or ["Insufficient Program Information"]
        for category in categories:
            category_counts[category] = category_counts.get(category, 0) + 1
        active_count = int(facility["active_program_count"])
        historical_count = int(facility["historical_program_count"])
        rows.append(
            {
                "source_id": facility["source_id"],
                "physical_facility_key": facility["physical_facility_key"],
                "facility_name": facility["facility_name"],
                "program_type": ", ".join(categories),
                "program_categories": json.dumps(categories),
                "active_program_count": active_count,
                "historical_program_count": historical_count,
                "facility_status_band": _epa_status_band(active_count, historical_count),
                "coordinate_quality_band": "Mapped coordinate provided",
                "facility_status": _epa_status_band(active_count, historical_count),
                "source_attribution": "U.S. Environmental Protection Agency ECHO",
                "lon": facility["lon"],
                "lat": facility["lat"],
            }
        )
    if rows:
        db.execute(text(f"DELETE FROM {FACILITY_TABLE}"))
        db.execute(
            text(
                f"""
                INSERT INTO {FACILITY_TABLE} (
                  source_id, physical_facility_key, facility_name, program_type, program_categories,
                  active_program_count, historical_program_count, facility_status_band,
                  coordinate_quality_band, facility_status, source_attribution, geometry
                ) VALUES (
                  :source_id, :physical_facility_key, :facility_name, :program_type, CAST(:program_categories AS jsonb),
                  :active_program_count, :historical_program_count, :facility_status_band,
                  :coordinate_quality_band, :facility_status, :source_attribution,
                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                )
                ON CONFLICT (source_id) DO UPDATE SET
                  physical_facility_key = EXCLUDED.physical_facility_key,
                  facility_name = EXCLUDED.facility_name,
                  program_type = EXCLUDED.program_type,
                  program_categories = EXCLUDED.program_categories,
                  active_program_count = EXCLUDED.active_program_count,
                  historical_program_count = EXCLUDED.historical_program_count,
                  facility_status_band = EXCLUDED.facility_status_band,
                  coordinate_quality_band = EXCLUDED.coordinate_quality_band,
                  facility_status = EXCLUDED.facility_status,
                  source_attribution = EXCLUDED.source_attribution,
                  retrieved_at = now(),
                  geometry = EXCLUDED.geometry
                """
            ),
            rows,
        )
    return {
        "raw_echo_records": raw_count,
        "source_rows": len(rows),
        "unique_physical_facilities": len(rows),
        "duplicate_records_consolidated": max(raw_count - len(rows) - invalid_coordinate_count - outside_count, 0),
        "invalid_coordinate_count": invalid_coordinate_count,
        "outside_count": outside_count,
        "program_categories": category_counts,
        "source_version": EPA_ECHO_SOURCE_VERSION,
    }


def _epa_physical_facility_key(name: Any, lat: float, lon: float, registry_id: str) -> str:
    normalized = " ".join(str(name or "").upper().split())[:80]
    if not normalized:
        normalized = f"REGISTRY {registry_id}"
    return f"{round(lat, 5)}:{round(lon, 5)}:{normalized}"


def _epa_program_categories(row: dict[str, Any], details: dict[str, Any]) -> set[str]:
    categories = set()
    if row.get("RCRAIDs") or details.get("RCRAComplianceStatus") or details.get("RCRAInspectionCount"):
        categories.add("Hazardous Waste / RCRA Context")
    if row.get("NPDESIDs") or details.get("CWAComplianceTracking"):
        categories.add("Water-Discharge / NPDES Context")
    if row.get("AIRIDs") or row.get("FacSICCodes") or details.get("AIRFlag") == "Y":
        categories.add("Air-Regulated Facility Context")
    if row.get("TRIIDs") or details.get("TRIFlag") == "Y":
        categories.add("Other Regulated-Facility Context")
    if row.get("SDWAIDs") or details.get("SDWASystemTypes"):
        categories.add("Other Regulated-Facility Context")
    if row.get("SuperfundIDs") or row.get("BrownfieldsIDs") or details.get("SuperfundFlag") == "Y":
        categories.add("Superfund or Cleanup Context")
    return categories or {"Insufficient Program Information"}


def _epa_status_band(active_count: int, historical_count: int) -> str:
    if active_count and historical_count:
        return "Active and historical program context"
    if active_count:
        return "Active regulatory program context"
    if historical_count:
        return "Historical regulatory program context"
    return "Status not provided"


def _load_usgs_terrain(db: Session) -> dict[str, Any]:
    raster_path = _ensure_usgs_dem_cache(db)
    with Image.open(raster_path) as image:
        elevation = np.array(image, dtype="float64")
        scale = image.tag_v2.get(33550) or (1.0, 1.0, 0.0)
        tiepoint = image.tag_v2.get(33922)
        if not tiepoint or len(tiepoint) < 6:
            raise RuntimeError("Cached USGS terrain raster is missing GeoTIFF tiepoint metadata.")
        pixel_x = float(scale[0])
        pixel_y = float(scale[1])
        origin_x = float(tiepoint[3])
        origin_y = float(tiepoint[4])
    elevation[~np.isfinite(elevation)] = np.nan
    slope_y, slope_x = np.gradient(elevation, pixel_y, pixel_x)
    slope_percent = np.sqrt((slope_x**2) + (slope_y**2)) * 100
    valid = np.isfinite(elevation) & np.isfinite(slope_percent)
    row_indexes, col_indexes = np.where(valid)
    if len(row_indexes) == 0:
        raise RuntimeError("USGS terrain raster contained no valid elevation cells.")

    db.execute(text("CREATE TEMP TABLE tmp_cfs_terrain_points (elev double precision, slope double precision, steep boolean, geom geometry(Point, 3857)) ON COMMIT DROP"))
    insert_sql = text(
        """
        INSERT INTO tmp_cfs_terrain_points (elev, slope, steep, geom)
        VALUES (:elev, :slope, :steep, ST_SetSRID(ST_MakePoint(:x, :y), 3857))
        """
    )
    point_rows = (
        {
            "elev": float(elevation[row, col]),
            "slope": float(slope_percent[row, col]),
            "steep": bool(slope_percent[row, col] >= STEEP_SLOPE_PERCENT),
            "x": origin_x + (float(col) + 0.5) * pixel_x,
            "y": origin_y - (float(row) + 0.5) * pixel_y,
        }
        for row, col in zip(row_indexes, col_indexes, strict=True)
    )
    batch: list[dict[str, Any]] = []
    for point in point_rows:
        batch.append(point)
        if len(batch) >= TERRAIN_PIXEL_INSERT_BATCH:
            db.execute(insert_sql, batch)
            batch.clear()
    if batch:
        db.execute(insert_sql, batch)
    db.execute(text("CREATE INDEX tmp_cfs_terrain_points_geom_idx ON tmp_cfs_terrain_points USING GIST (geom)"))
    db.execute(text("ANALYZE tmp_cfs_terrain_points"))
    db.execute(text(f"DELETE FROM {TERRAIN_TABLE}"))
    db.execute(
        text(
            f"""
            INSERT INTO {TERRAIN_TABLE} (
              parcel_id, minimum_elevation, maximum_elevation, mean_elevation, elevation_range,
              mean_slope_percent, maximum_slope_percent, steep_slope_percent,
              terrain_context_band, source_version, terrain_source_resolution, terrain_source_date
            )
            WITH parcel_base AS (
              SELECT official_parcel_id,
                     ST_Transform(geometry, 3857) AS geom,
                     ST_Transform(ST_PointOnSurface(geometry), 3857) AS pt
              FROM parcels_enriched
              WHERE official_parcel_id IS NOT NULL AND geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
            ),
            zonal AS (
              SELECT p.official_parcel_id,
                     MIN(t.elev) AS min_elev,
                     MAX(t.elev) AS max_elev,
                     AVG(t.elev) AS mean_elev,
                     AVG(t.slope) AS mean_slope,
                     MAX(t.slope) AS max_slope,
                     SUM(CASE WHEN t.steep THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100 AS steep_pct
              FROM parcel_base p
              JOIN tmp_cfs_terrain_points t ON ST_Intersects(p.geom, t.geom)
              GROUP BY p.official_parcel_id
            ),
            nearest AS (
              SELECT p.official_parcel_id, n.elev, n.slope
              FROM parcel_base p
              LEFT JOIN zonal z ON z.official_parcel_id = p.official_parcel_id
              JOIN LATERAL (
                SELECT elev, slope
                FROM tmp_cfs_terrain_points
                ORDER BY geom <-> p.pt
                LIMIT 1
              ) n ON z.official_parcel_id IS NULL
            )
            SELECT
              p.official_parcel_id,
              round(COALESCE(z.min_elev, n.elev)::numeric, 2),
              round(COALESCE(z.max_elev, n.elev)::numeric, 2),
              round(COALESCE(z.mean_elev, n.elev)::numeric, 2),
              round((COALESCE(z.max_elev, n.elev) - COALESCE(z.min_elev, n.elev))::numeric, 2),
              round(COALESCE(z.mean_slope, n.slope)::numeric, 2),
              round(COALESCE(z.max_slope, n.slope)::numeric, 2),
              round(COALESCE(z.steep_pct, CASE WHEN n.slope >= {STEEP_SLOPE_PERCENT} THEN 100 ELSE 0 END)::numeric, 2),
              CASE
                WHEN COALESCE(z.mean_slope, n.slope) IS NULL THEN 'Data Unavailable'
                WHEN COALESCE(z.steep_pct, CASE WHEN n.slope >= {STEEP_SLOPE_PERCENT} THEN 100 ELSE 0 END) >= 30
                     OR COALESCE(z.mean_slope, n.slope) >= 15
                     OR COALESCE(z.max_slope, n.slope) >= 25 THEN 'Higher-Slope Constraint'
                WHEN COALESCE(z.steep_pct, 0) >= 10
                     OR COALESCE(z.mean_slope, n.slope) >= 8
                     OR COALESCE(z.max_slope, n.slope) >= 15 THEN 'Mixed Terrain'
                WHEN COALESCE(z.mean_slope, n.slope) >= 4
                     OR COALESCE(z.max_slope, n.slope) >= 8 THEN 'Moderate Terrain'
                ELSE 'Generally Level'
              END,
              :source_version,
              :source_resolution,
              :source_date
            FROM parcel_base p
            LEFT JOIN zonal z ON z.official_parcel_id = p.official_parcel_id
            LEFT JOIN nearest n ON n.official_parcel_id = p.official_parcel_id
            WHERE COALESCE(z.mean_elev, n.elev) IS NOT NULL
            ON CONFLICT (parcel_id) DO UPDATE SET
              minimum_elevation = EXCLUDED.minimum_elevation,
              maximum_elevation = EXCLUDED.maximum_elevation,
              mean_elevation = EXCLUDED.mean_elevation,
              elevation_range = EXCLUDED.elevation_range,
              mean_slope_percent = EXCLUDED.mean_slope_percent,
              maximum_slope_percent = EXCLUDED.maximum_slope_percent,
              steep_slope_percent = EXCLUDED.steep_slope_percent,
              terrain_context_band = EXCLUDED.terrain_context_band,
              source_version = EXCLUDED.source_version,
              terrain_source_resolution = EXCLUDED.terrain_source_resolution,
              terrain_source_date = EXCLUDED.terrain_source_date,
              retrieved_at = now()
            """
        ),
        {
            "source_version": USGS_3DEP_SOURCE_VERSION,
            "source_resolution": f"{round(pixel_x, 2)} x {round(pixel_y, 2)} meters per pixel",
            "source_date": datetime.now(UTC).date().isoformat(),
        },
    )
    count = int(db.execute(text(f"SELECT COUNT(*) FROM {TERRAIN_TABLE}")).scalar() or 0)
    return {
        "source_rows": count,
        "source_version": USGS_3DEP_SOURCE_VERSION,
        "resolution": f"{round(pixel_x, 2)} x {round(pixel_y, 2)} meters per pixel",
        "raster_cache_path": str(raster_path),
        "elevation_units": "meters",
        "slope_units": "percent rise",
    }


def _ensure_usgs_dem_cache(db: Session) -> Path:
    cache_dir = Path(__import__("os").environ.get(TERRAIN_CACHE_DIR_ENV, Path.home() / ".cfs_cache" / "environmental"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    raster_path = cache_dir / f"usgs_3dep_cabarrus_{TERRAIN_RASTER_SIZE}_3857.tif"
    if raster_path.exists() and raster_path.stat().st_size > 0:
        return raster_path
    xmin, ymin, xmax, ymax = _county_bbox_3857(db)
    export = requests.get(
        USGS_3DEP_EXPORT_URL,
        params={
            "f": "json",
            "bbox": f"{xmin},{ymin},{xmax},{ymax}",
            "bboxSR": "3857",
            "imageSR": "3857",
            "size": f"{TERRAIN_RASTER_SIZE},{TERRAIN_RASTER_SIZE}",
            "format": "tiff",
            "pixelType": "F32",
            "interpolation": "RSP_BilinearInterpolation",
        },
        timeout=180,
    )
    export.raise_for_status()
    href = export.json().get("href")
    if not href:
        raise RuntimeError("USGS 3DEP export did not return a raster href.")
    raster = requests.get(href, timeout=240)
    raster.raise_for_status()
    raster_path.write_bytes(raster.content)
    return raster_path


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clean_source_text(value: Any) -> str | None:
    text_value = str(value).strip() if value is not None else ""
    return None if not text_value or text_value.lower() == "nan" else text_value


def _default_verification_flags() -> list[str]:
    return [
        "Review FEMA floodplain context where mapped.",
        "Review NWI mapping when available and obtain professional wetland delineation if needed.",
        "Obtain topographic survey and engineering review for slope/grading feasibility.",
        "Review NRCS soil mapping and obtain geotechnical investigation where appropriate.",
        "Review nearby regulated facilities and consider Phase I environmental site assessment where appropriate.",
    ]


def _source_limitations(source_counts: dict[str, int]) -> list[str]:
    missing = []
    if source_counts.get(NWI_TABLE, 0) <= 0:
        missing.append("USFWS NWI wetlands")
    if source_counts.get(TERRAIN_TABLE, 0) <= 0:
        missing.append("USGS terrain/slope")
    if source_counts.get(SOIL_TABLE, 0) <= 0:
        missing.append("NRCS soils")
    if source_counts.get(FACILITY_TABLE, 0) <= 0:
        missing.append("EPA facility proximity")
    limitations = [SAFE_LIMITATION, PROXY_LIMITATION]
    if missing:
        limitations.append(f"{', '.join(missing)} context has not been refreshed locally; missing source coverage is not evidence of no constraint.")
    limitations.append("Loaded source evidence is mapped or aggregate screening context and requires professional verification.")
    return limitations


def _source_attribution(*, nwi: bool = False, terrain: bool = False, soils: bool = False, epa: bool = False) -> dict[str, str]:
    sources = {
        "flood": "FEMA National Flood Hazard Layer parcel overlay",
        "slope": "USGS 3DEP elevation/slope extract" if terrain else "USGS 3DEP elevation/slope extract not yet refreshed locally",
        "soils": "USDA NRCS Soil Data Access / SSURGO mapunitpolyextended" if soils else "USDA NRCS soil extract not yet refreshed locally",
        "regulated_facilities": "U.S. EPA ECHO All Media Programs Facility Search" if epa else "U.S. EPA facility extract not yet refreshed locally",
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


def environmental_context_by_parcel(db: Session, parcel_ids: list[str]) -> dict[str, dict[str, Any]]:
    ids = [str(parcel_id) for parcel_id in dict.fromkeys(parcel_ids) if parcel_id]
    if not ids:
        return {}
    if not _table_exists(db, ENV_TABLE):
        return {}
    rows = db.execute(
        text(
            f"""
            SELECT parcel_id, flood_context_band, wetland_context_band, terrain_context_band,
                   soil_limitation_band, regulated_facility_context_band, usable_area_screening_proxy,
                   overall_environmental_constraint_band, environmental_data_confidence
            FROM {ENV_TABLE}
            WHERE parcel_id = ANY(:parcel_ids)
            """
        ),
        {"parcel_ids": ids},
    ).mappings()
    return {
        str(row["parcel_id"]): {
            "flood_context_band": row.get("flood_context_band"),
            "wetland_context_band": row.get("wetland_context_band"),
            "terrain_context_band": row.get("terrain_context_band"),
            "soil_limitation_band": row.get("soil_limitation_band"),
            "regulated_facility_context_band": row.get("regulated_facility_context_band"),
            "usable_area_screening_proxy": row.get("usable_area_screening_proxy"),
            "overall_environmental_constraint_band": row.get("overall_environmental_constraint_band"),
            "environmental_data_confidence": row.get("environmental_data_confidence"),
        }
        for row in rows
    }


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(db.execute(text("SELECT to_regclass(:table_name)"), {"table_name": table_name}).scalar())


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
