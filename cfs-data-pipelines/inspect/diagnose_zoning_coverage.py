"""Diagnose zoning coverage gaps in the CFS parcel-zoning overlay.

This diagnostic pass explains the high no-match count in
public.parcel_zoning_overlay. It does not force zoning assignments, ingest new
layers, connect APIs, or modify the frontend dashboard.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
PARCEL_TABLE = "public.parcels_enriched"
ZONING_TABLE = "public.zoning_clean"
OVERLAY_TABLE = "public.parcel_zoning_overlay"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"

SUMMARY_OUTPUT = OUTPUT_DIR / "zoning_coverage_diagnostics.json"
NO_MATCH_NEIGHBORHOOD_OUTPUT = OUTPUT_DIR / "zoning_no_match_by_neighborhood.csv"
NO_MATCH_SUBDIVISION_OUTPUT = OUTPUT_DIR / "zoning_no_match_by_subdivision.csv"
NO_MATCH_SAMPLES_OUTPUT = OUTPUT_DIR / "zoning_no_match_samples.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Diagnose zoning coverage gaps for parcel_zoning_overlay.",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=100,
        help="Number of no-match and assigned sample records to include.",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"diagnose_zoning_coverage_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before running diagnostics."
        )

    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def verify_database(engine: Engine) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )
    required_tables = (
        "public.parcels_enriched",
        "public.zoning_clean",
        "public.parcel_zoning_overlay",
    )

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            connection.execute(text("SELECT postgis_full_version()")).scalar_one()
            missing_tables = [
                table
                for table in required_tables
                if not connection.execute(
                    text("SELECT to_regclass(:table_name) IS NOT NULL"),
                    {"table_name": table},
                ).scalar_one()
            ]
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    if missing_tables:
        raise RuntimeError(f"Missing required table(s): {', '.join(missing_tables)}")


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def fetch_scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def get_count_summary(engine: Engine) -> dict[str, Any]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COUNT(*) AS total_parcels,
          COUNT(*) FILTER (WHERE NOT has_no_zoning_match) AS assigned_parcels,
          COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_parcels,
          COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_parcels,
          ROUND(
            COUNT(*) FILTER (WHERE has_no_zoning_match) * 100.0 / NULLIF(COUNT(*), 0),
            4
          ) AS no_match_percentage
        FROM {OVERLAY_TABLE}
        """,
    )[0]


def get_available_jurisdiction_fields(engine: Engine) -> list[str]:
    jurisdiction_tokens = (
        "city",
        "jurisdiction",
        "municipal",
        "municipality",
        "town",
    )
    rows = fetch_rows(
        engine,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'parcels_enriched'
        ORDER BY ordinal_position
        """,
    )
    return [
        row["column_name"]
        for row in rows
        if any(token in row["column_name"].lower() for token in jurisdiction_tokens)
    ]


def get_extent_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        WITH extents AS (
          SELECT 'all_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
          FROM {PARCEL_TABLE}
          UNION ALL
          SELECT 'zoning_clean' AS layer_name, ST_Extent(geometry)::box2d AS extent
          FROM {ZONING_TABLE}
          UNION ALL
          SELECT 'assigned_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
          FROM {OVERLAY_TABLE}
          WHERE NOT has_no_zoning_match
          UNION ALL
          SELECT 'no_match_parcels' AS layer_name, ST_Extent(geometry)::box2d AS extent
          FROM {OVERLAY_TABLE}
          WHERE has_no_zoning_match
        )
        SELECT
          layer_name,
          ST_XMin(extent) AS xmin,
          ST_YMin(extent) AS ymin,
          ST_XMax(extent) AS xmax,
          ST_YMax(extent) AS ymax
        FROM extents
        ORDER BY layer_name
        """,
    )


def get_extent_overlap_summary(engine: Engine) -> dict[str, Any]:
    return fetch_rows(
        engine,
        f"""
        WITH zoning_extent AS (
          SELECT ST_SetSRID(ST_Envelope(ST_Extent(geometry)::geometry), 4326) AS extent_geometry
          FROM {ZONING_TABLE}
        )
        SELECT
          COUNT(*) AS no_match_count,
          COUNT(*) FILTER (
            WHERE NOT ST_Intersects(overlay.geometry, zoning_extent.extent_geometry)
          ) AS outside_zoning_extent_count,
          COUNT(*) FILTER (
            WHERE ST_Intersects(overlay.geometry, zoning_extent.extent_geometry)
          ) AS inside_zoning_extent_count,
          ROUND(
            COUNT(*) FILTER (
              WHERE NOT ST_Intersects(overlay.geometry, zoning_extent.extent_geometry)
            ) * 100.0 / NULLIF(COUNT(*), 0),
            4
          ) AS outside_zoning_extent_percentage
        FROM {OVERLAY_TABLE} AS overlay
        CROSS JOIN zoning_extent
        WHERE overlay.has_no_zoning_match
        """,
    )[0]


def get_no_match_by_neighborhood(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(parcel.nbh_name, '(missing)') AS neighborhood,
          COUNT(*) AS no_match_count,
          ROUND(SUM(overlay.parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
          COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'trusted') AS trusted_count,
          COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'review') AS review_count,
          ROUND(AVG(overlay.parcel_area_acres_calc)::numeric, 4) AS avg_area_acres
        FROM {OVERLAY_TABLE} AS overlay
        JOIN {PARCEL_TABLE} AS parcel
          ON parcel.official_parcel_id = overlay.official_parcel_id
        WHERE overlay.has_no_zoning_match
        GROUP BY COALESCE(parcel.nbh_name, '(missing)')
        ORDER BY no_match_count DESC, neighborhood
        """,
    )


def get_no_match_by_subdivision(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(parcel.subdiv_name, '(missing)') AS subdivision,
          COUNT(*) AS no_match_count,
          ROUND(SUM(overlay.parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
          COUNT(*) FILTER (WHERE parcel.subdivision_quality_status <> 'valid') AS subdivision_review_count,
          ROUND(AVG(overlay.parcel_area_acres_calc)::numeric, 4) AS avg_area_acres
        FROM {OVERLAY_TABLE} AS overlay
        JOIN {PARCEL_TABLE} AS parcel
          ON parcel.official_parcel_id = overlay.official_parcel_id
        WHERE overlay.has_no_zoning_match
        GROUP BY COALESCE(parcel.subdiv_name, '(missing)')
        ORDER BY no_match_count DESC, subdivision
        """,
    )


def get_no_match_by_quality(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          parcel_quality_status,
          COUNT(*) AS no_match_count,
          ROUND(SUM(parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
          ROUND(AVG(parcel_area_acres_calc)::numeric, 4) AS avg_area_acres
        FROM {OVERLAY_TABLE}
        WHERE has_no_zoning_match
        GROUP BY parcel_quality_status
        ORDER BY no_match_count DESC, parcel_quality_status
        """,
    )


def get_area_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          CASE
            WHEN parcel_area_acres_calc < 0.01 THEN 'micro'
            WHEN parcel_area_acres_calc < 2 THEN 'residential_standard'
            WHEN parcel_area_acres_calc < 10 THEN 'estate'
            WHEN parcel_area_acres_calc < 100 THEN 'commercial_large'
            ELSE 'extreme_large'
          END AS parcel_size_category,
          COUNT(*) AS no_match_count,
          ROUND(SUM(parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
          ROUND(AVG(parcel_area_acres_calc)::numeric, 4) AS avg_area_acres
        FROM {OVERLAY_TABLE}
        WHERE has_no_zoning_match
        GROUP BY parcel_size_category
        ORDER BY no_match_count DESC, parcel_size_category
        """,
    )


def get_no_match_by_mailcity(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(parcel.mailcity, '(missing)') AS mailcity,
          COUNT(*) AS no_match_count,
          ROUND(SUM(overlay.parcel_area_acres_calc)::numeric, 2) AS no_match_area_acres,
          COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'trusted') AS trusted_count,
          COUNT(*) FILTER (WHERE parcel.parcel_quality_status = 'review') AS review_count
        FROM {OVERLAY_TABLE} AS overlay
        JOIN {PARCEL_TABLE} AS parcel
          ON parcel.official_parcel_id = overlay.official_parcel_id
        WHERE overlay.has_no_zoning_match
        GROUP BY COALESCE(parcel.mailcity, '(missing)')
        ORDER BY no_match_count DESC, mailcity
        LIMIT 25
        """,
    )


def get_nearest_zoning_distance_summary(engine: Engine) -> dict[str, Any]:
    summary = fetch_rows(
        engine,
        f"""
        WITH no_match_distances AS (
          SELECT
            overlay.official_parcel_id,
            ST_Distance(
              ST_Transform(ST_PointOnSurface(overlay.geometry), 3857),
              nearest_zoning.geometry_3857
            ) AS nearest_zoning_distance_m
          FROM {OVERLAY_TABLE} AS overlay
          CROSS JOIN LATERAL (
            SELECT ST_Transform(zoning.geometry, 3857) AS geometry_3857
            FROM {ZONING_TABLE} AS zoning
            ORDER BY ST_PointOnSurface(overlay.geometry) <-> zoning.geometry
            LIMIT 1
          ) AS nearest_zoning
          WHERE overlay.has_no_zoning_match
        )
        SELECT
          COUNT(*) AS no_match_count,
          ROUND(MIN(nearest_zoning_distance_m)::numeric, 2) AS min_distance_m,
          ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2)
            AS p25_distance_m,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2)
            AS median_distance_m,
          ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2)
            AS p75_distance_m,
          ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY nearest_zoning_distance_m)::numeric, 2)
            AS p90_distance_m,
          ROUND(MAX(nearest_zoning_distance_m)::numeric, 2) AS max_distance_m,
          COUNT(*) FILTER (WHERE nearest_zoning_distance_m <= 10) AS within_10m_count,
          COUNT(*) FILTER (WHERE nearest_zoning_distance_m <= 100) AS within_100m_count,
          COUNT(*) FILTER (WHERE nearest_zoning_distance_m <= 1000) AS within_1km_count
        FROM no_match_distances
        """,
    )[0]
    summary["distance_method"] = (
        "Approximate distance in meters from each no-match parcel representative "
        "point to the nearest zoning polygon. Used for coverage diagnostics, not "
        "authoritative parcel boundary distance."
    )
    return summary


def get_no_match_samples(engine: Engine, sample_limit: int) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          overlay.official_parcel_id,
          overlay.objectid_1,
          overlay.pin14,
          parcel.nbh_name,
          parcel.subdiv_name,
          overlay.parcel_quality_status,
          ROUND(overlay.parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc,
          nearest.nearest_zoning_distance_m,
          overlay.zoning_join_status
        FROM {OVERLAY_TABLE} AS overlay
        JOIN {PARCEL_TABLE} AS parcel
          ON parcel.official_parcel_id = overlay.official_parcel_id
        CROSS JOIN LATERAL (
          SELECT ROUND(
            ST_Distance(
              ST_Transform(ST_PointOnSurface(overlay.geometry), 3857),
              ST_Transform(zoning.geometry, 3857)
            )::numeric,
            2
          ) AS nearest_zoning_distance_m
          FROM {ZONING_TABLE} AS zoning
          ORDER BY ST_PointOnSurface(overlay.geometry) <-> zoning.geometry
          LIMIT 1
        ) AS nearest
        WHERE overlay.has_no_zoning_match
        ORDER BY overlay.parcel_area_acres_calc DESC NULLS LAST, overlay.official_parcel_id
        LIMIT :sample_limit
        """,
        {"sample_limit": sample_limit},
    )


def get_assigned_samples(engine: Engine, sample_limit: int) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          overlay.official_parcel_id,
          overlay.objectid_1,
          overlay.pin14,
          parcel.nbh_name,
          parcel.subdiv_name,
          overlay.dominant_zoning_code,
          overlay.dominant_zoning_general,
          overlay.zoning_overlap_count,
          ROUND(overlay.dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
          overlay.zoning_assignment_confidence,
          overlay.zoning_join_status,
          ROUND(overlay.parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {OVERLAY_TABLE} AS overlay
        JOIN {PARCEL_TABLE} AS parcel
          ON parcel.official_parcel_id = overlay.official_parcel_id
        WHERE NOT overlay.has_no_zoning_match
        ORDER BY overlay.dominant_overlap_pct DESC NULLS LAST, overlay.official_parcel_id
        LIMIT :sample_limit
        """,
        {"sample_limit": sample_limit},
    )


def get_jurisdiction_proxy_summary(
    no_match_by_neighborhood: list[dict[str, Any]],
    no_match_by_subdivision: list[dict[str, Any]],
) -> dict[str, Any]:
    # No explicit municipality/jurisdiction fields currently exist in
    # public.parcels_enriched. These terms are only a lightweight proxy to
    # surface likely municipal or extraterritorial clusters for source discovery.
    municipal_terms = (
        "CONCORD",
        "KANNAPOLIS",
        "HARRISBURG",
        "MIDLAND",
        "MOUNT PLEASANT",
        "MT PLEASANT",
        "CHARLOTTE",
    )

    neighborhood_hits = [
        row
        for row in no_match_by_neighborhood
        if any(term in str(row["neighborhood"]).upper() for term in municipal_terms)
    ][:25]
    subdivision_hits = [
        row
        for row in no_match_by_subdivision
        if any(term in str(row["subdivision"]).upper() for term in municipal_terms)
    ][:25]

    return {
        "explicit_jurisdiction_fields_available": False,
        "proxy_terms": municipal_terms,
        "neighborhood_proxy_matches_top_25": neighborhood_hits,
        "subdivision_proxy_matches_top_25": subdivision_hits,
        "interpretation": (
            "No direct municipality/jurisdiction field was found. Proxy matches "
            "are based on neighborhood/subdivision names only and should be "
            "verified with real jurisdiction or municipal boundary layers."
        ),
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(normalize_json_value(row))


def write_summary(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, tuple):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    return value


def run_diagnostics(engine: Engine, sample_limit: int, start_time: float, log_path: Path) -> dict[str, Any]:
    no_match_by_neighborhood = get_no_match_by_neighborhood(engine)
    no_match_by_subdivision = get_no_match_by_subdivision(engine)
    no_match_samples = get_no_match_samples(engine, sample_limit)
    assigned_samples = get_assigned_samples(engine, sample_limit)
    duration_seconds = round(time.perf_counter() - start_time, 2)

    jurisdiction_fields = get_available_jurisdiction_fields(engine)
    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "parcel_table": PARCEL_TABLE,
            "zoning_table": ZONING_TABLE,
            "overlay_table": OVERLAY_TABLE,
        },
        "count_summary": get_count_summary(engine),
        "available_jurisdiction_fields": jurisdiction_fields,
        "jurisdiction_field_note": (
            "No municipality/jurisdiction fields were found in parcels_enriched."
            if not jurisdiction_fields
            else "Potential jurisdiction-like fields were found and should be reviewed."
        ),
        "extent_summary": get_extent_summary(engine),
        "extent_overlap_summary": get_extent_overlap_summary(engine),
        "nearest_zoning_distance_summary": get_nearest_zoning_distance_summary(engine),
        "no_match_by_quality_status": get_no_match_by_quality(engine),
        "no_match_area_distribution": get_area_distribution(engine),
        "no_match_by_mailcity_top_25": get_no_match_by_mailcity(engine),
        "mailcity_note": (
            "mailcity is a mailing-address field, not a governed jurisdiction "
            "field. It is included only as a weak coverage clue."
        ),
        "top_no_match_neighborhoods": no_match_by_neighborhood[:25],
        "top_no_match_subdivisions": no_match_by_subdivision[:25],
        "jurisdiction_proxy_summary": get_jurisdiction_proxy_summary(
            no_match_by_neighborhood,
            no_match_by_subdivision,
        ),
        "sample_no_match_parcels": no_match_samples,
        "sample_assigned_parcels": assigned_samples,
        "diagnostic_interpretation": (
            "This diagnostic does not prove municipal jurisdiction by itself. "
            "A high no-match count combined with large nearest-zoning distances "
            "and broad no-match extents indicates the current zoning layer likely "
            "covers only part of the parcel geography. Municipal zoning or "
            "jurisdiction boundary layers should be investigated before forcing "
            "zoning assignments."
        ),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "diagnostics_json": str(SUMMARY_OUTPUT),
            "no_match_by_neighborhood_csv": str(NO_MATCH_NEIGHBORHOOD_OUTPUT),
            "no_match_by_subdivision_csv": str(NO_MATCH_SUBDIVISION_OUTPUT),
            "no_match_samples_csv": str(NO_MATCH_SAMPLES_OUTPUT),
        },
    }

    write_summary(summary)
    write_csv(NO_MATCH_NEIGHBORHOOD_OUTPUT, no_match_by_neighborhood)
    write_csv(NO_MATCH_SUBDIVISION_OUTPUT, no_match_by_subdivision)
    write_csv(NO_MATCH_SAMPLES_OUTPUT, no_match_samples)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS zoning coverage diagnostics.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        verify_database(engine)
        summary = run_diagnostics(engine, args.sample_limit, start_time, log_path)
        engine.dispose()

        counts = summary["count_summary"]
        distances = summary["nearest_zoning_distance_summary"]
        extent = summary["extent_overlap_summary"]
        logging.info("Total parcels: %s", counts["total_parcels"])
        logging.info("Assigned parcels: %s", counts["assigned_parcels"])
        logging.info("No-match parcels: %s", counts["no_match_parcels"])
        logging.info(
            "No-match outside zoning extent: %s",
            extent["outside_zoning_extent_count"],
        )
        logging.info("Median nearest zoning distance (m): %s", distances["median_distance_m"])
        logging.info("Wrote diagnostics JSON: %s", SUMMARY_OUTPUT)
        logging.info("Wrote no-match neighborhood CSV: %s", NO_MATCH_NEIGHBORHOOD_OUTPUT)
        logging.info("Wrote no-match subdivision CSV: %s", NO_MATCH_SUBDIVISION_OUTPUT)
        logging.info("Wrote no-match sample CSV: %s", NO_MATCH_SAMPLES_OUTPUT)
        logging.info("Diagnostics duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS zoning coverage diagnostics failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
