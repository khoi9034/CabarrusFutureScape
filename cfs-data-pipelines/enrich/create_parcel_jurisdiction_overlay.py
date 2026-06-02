"""Create and validate the CFS parcel jurisdiction / planning-boundary overlay.

This local-development enrichment step reads public.parcels_enriched and
public.planning_boundaries_clean, creates public.parcel_jurisdiction_overlay,
and writes planning-context validation artifacts. It intentionally does not
modify the frontend dashboard, connect APIs, ingest more layers, force zoning
assignment, or treat planning boundaries as zoning.
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
PLANNING_BOUNDARY_TABLE = "public.planning_boundaries_clean"
OVERLAY_TABLE = "public.parcel_jurisdiction_overlay"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_jurisdiction_overlay.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "parcel_jurisdiction_overlay_validation.json"
SUMMARY_OUTPUT = OUTPUT_DIR / "parcel_jurisdiction_summary.csv"
NO_MATCH_OUTPUT = OUTPUT_DIR / "parcel_jurisdiction_no_match.csv"
LOW_CONFIDENCE_OUTPUT = OUTPUT_DIR / "parcel_jurisdiction_low_confidence.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_jurisdiction_overlay.",
    )
    parser.add_argument(
        "--skip-overlay",
        action="store_true",
        help="Only run validation against an existing parcel_jurisdiction_overlay table.",
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
    log_path = LOG_DIR / f"create_parcel_jurisdiction_overlay_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating "
            "parcel_jurisdiction_overlay."
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


def verify_database(engine: Engine, skip_overlay: bool) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            connection.execute(text("SELECT postgis_full_version()")).scalar_one()
            parcels_exists = connection.execute(
                text("SELECT to_regclass('public.parcels_enriched') IS NOT NULL")
            ).scalar_one()
            boundaries_exist = connection.execute(
                text("SELECT to_regclass('public.planning_boundaries_clean') IS NOT NULL")
            ).scalar_one()
            overlay_exists = connection.execute(
                text("SELECT to_regclass('public.parcel_jurisdiction_overlay') IS NOT NULL")
            ).scalar_one()
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    if not parcels_exists:
        raise RuntimeError("Source table public.parcels_enriched does not exist.")
    if not boundaries_exist:
        raise RuntimeError("Source table public.planning_boundaries_clean does not exist.")
    if skip_overlay and not overlay_exists:
        raise RuntimeError(
            "--skip-overlay was supplied, but public.parcel_jurisdiction_overlay does not exist."
        )


def execute_overlay_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Overlay SQL file not found: {SQL_FILE}")

    logging.info("Executing overlay SQL: %s", SQL_FILE)
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(SQL_FILE.read_text(encoding="utf-8"))
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def get_row_count_summary(engine: Engine) -> dict[str, Any]:
    total_parcels = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_TABLE}"))
    overlay_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {OVERLAY_TABLE}"))
    assigned_count = int(
        fetch_scalar(
            engine,
            f"""
            SELECT COUNT(*)
            FROM {OVERLAY_TABLE}
            WHERE NOT has_no_planning_boundary_match
            """,
        )
    )
    no_match_count = int(
        fetch_scalar(
            engine,
            f"""
            SELECT COUNT(*)
            FROM {OVERLAY_TABLE}
            WHERE has_no_planning_boundary_match
            """,
        )
    )
    multiple_count = int(
        fetch_scalar(
            engine,
            f"""
            SELECT COUNT(*)
            FROM {OVERLAY_TABLE}
            WHERE has_multiple_jurisdictions
            """,
        )
    )

    return {
        "source_parcel_count": total_parcels,
        "overlay_row_count": overlay_count,
        "row_count_delta": overlay_count - total_parcels,
        "row_counts_match": overlay_count == total_parcels,
        "parcels_assigned_to_planning_boundary": assigned_count,
        "parcels_with_no_planning_boundary_match": no_match_count,
        "parcels_with_multiple_jurisdiction_overlaps": multiple_count,
    }


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS parcel_count,
          ROUND((COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {OVERLAY_TABLE}), 0))::numeric, 4)
            AS parcel_percentage
        FROM {OVERLAY_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, value
        """,
    )


def get_jurisdiction_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(planning_jurisdiction_name, '(no match)') AS planning_jurisdiction_name,
          COALESCE(planning_boundary_type, '(no match)') AS planning_boundary_type,
          COALESCE(boundary_name, '(no match)') AS boundary_name,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE has_multiple_jurisdictions) AS multiple_jurisdiction_count,
          COUNT(*) FILTER (WHERE jurisdiction_assignment_confidence = 'low') AS low_confidence_count,
          COUNT(*) FILTER (WHERE jurisdiction_assignment_confidence = 'no_match') AS no_match_count,
          ROUND(AVG(dominant_jurisdiction_overlap_pct)::numeric, 6) AS avg_dominant_overlap_pct,
          ROUND(MIN(dominant_jurisdiction_overlap_pct)::numeric, 6) AS min_dominant_overlap_pct,
          ROUND(MAX(dominant_jurisdiction_overlap_pct)::numeric, 6) AS max_dominant_overlap_pct
        FROM {OVERLAY_TABLE}
        GROUP BY
          COALESCE(planning_jurisdiction_name, '(no match)'),
          COALESCE(planning_boundary_type, '(no match)'),
          COALESCE(boundary_name, '(no match)')
        ORDER BY parcel_count DESC, planning_jurisdiction_name, boundary_name
        """,
    )


def get_no_match_neighborhoods(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(NULLIF(btrim(nbh_name), ''), '(unknown)') AS nbh_name,
          COUNT(*) AS parcel_count
        FROM {OVERLAY_TABLE}
        WHERE has_no_planning_boundary_match
        GROUP BY COALESCE(NULLIF(btrim(nbh_name), ''), '(unknown)')
        ORDER BY parcel_count DESC, nbh_name
        LIMIT 30
        """,
    )


def get_no_match_subdivisions(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(NULLIF(btrim(subdiv_name), ''), '(unknown)') AS subdiv_name,
          COUNT(*) AS parcel_count
        FROM {OVERLAY_TABLE}
        WHERE has_no_planning_boundary_match
        GROUP BY COALESCE(NULLIF(btrim(subdiv_name), ''), '(unknown)')
        ORDER BY parcel_count DESC, subdiv_name
        LIMIT 30
        """,
    )


def get_low_confidence_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          planning_jurisdiction_name,
          planning_boundary_type,
          boundary_name,
          jurisdiction_overlap_count,
          ROUND(dominant_jurisdiction_overlap_pct::numeric, 6)
            AS dominant_jurisdiction_overlap_pct,
          ROUND(total_jurisdiction_overlap_pct::numeric, 6)
            AS total_jurisdiction_overlap_pct,
          jurisdiction_assignment_confidence,
          has_multiple_jurisdictions,
          jurisdiction_join_status,
          parcel_quality_status,
          nbh_name,
          subdiv_name,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {OVERLAY_TABLE}
        WHERE jurisdiction_assignment_confidence = 'low'
        ORDER BY dominant_jurisdiction_overlap_pct NULLS LAST,
                 jurisdiction_overlap_count DESC,
                 official_parcel_id
        """,
    )


def get_no_match_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          nbh_name,
          subdiv_name,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc,
          jurisdiction_join_status
        FROM {OVERLAY_TABLE}
        WHERE has_no_planning_boundary_match
        ORDER BY parcel_area_acres_calc DESC NULLS LAST, official_parcel_id
        """,
    )


def get_geometry_summary(engine: Engine) -> dict[str, Any]:
    return {
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {OVERLAY_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {OVERLAY_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {OVERLAY_TABLE} WHERE NOT ST_IsValid(geometry)",
            )
        ),
    }


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'parcel_jurisdiction_overlay'
        ORDER BY indexname
        """,
    )


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    return value


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
    VALIDATION_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def run_validation(engine: Engine, start_time: float, log_path: Path) -> dict[str, Any]:
    jurisdiction_summary = get_jurisdiction_summary(engine)
    low_confidence_rows = get_low_confidence_rows(engine)
    no_match_rows = get_no_match_rows(engine)
    duration_seconds = round(time.perf_counter() - start_time, 2)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "parcel_table": PARCEL_TABLE,
            "planning_boundary_table": PLANNING_BOUNDARY_TABLE,
            "overlay_table": OVERLAY_TABLE,
        },
        "row_count_summary": get_row_count_summary(engine),
        "confidence_distribution": get_distribution(
            engine,
            "jurisdiction_assignment_confidence",
        ),
        "join_status_distribution": get_distribution(engine, "jurisdiction_join_status"),
        "planning_jurisdiction_distribution": jurisdiction_summary,
        "top_no_match_neighborhoods": get_no_match_neighborhoods(engine),
        "top_no_match_subdivisions": get_no_match_subdivisions(engine),
        "sample_low_confidence_records": low_confidence_rows[:25],
        "sample_no_match_records": no_match_rows[:25],
        "geometry_summary": get_geometry_summary(engine),
        "index_summary": get_index_summary(engine),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "parcel_jurisdiction_summary_csv": str(SUMMARY_OUTPUT),
            "no_match_csv": str(NO_MATCH_OUTPUT),
            "low_confidence_csv": str(LOW_CONFIDENCE_OUTPUT),
        },
    }

    write_summary(summary)
    write_csv(SUMMARY_OUTPUT, jurisdiction_summary)
    write_csv(NO_MATCH_OUTPUT, no_match_rows)
    write_csv(LOW_CONFIDENCE_OUTPUT, low_confidence_rows)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcel_jurisdiction_overlay build.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        verify_database(engine, args.skip_overlay)

        if args.skip_overlay:
            logging.warning("Skipping overlay SQL because --skip-overlay was supplied.")
        else:
            execute_overlay_sql(engine)

        summary = run_validation(engine, start_time, log_path)
        engine.dispose()

        row_counts = summary["row_count_summary"]
        logging.info("Source parcel count: %s", row_counts["source_parcel_count"])
        logging.info("Overlay row count: %s", row_counts["overlay_row_count"])
        logging.info(
            "Assigned/no-match/multiple: %s/%s/%s",
            row_counts["parcels_assigned_to_planning_boundary"],
            row_counts["parcels_with_no_planning_boundary_match"],
            row_counts["parcels_with_multiple_jurisdiction_overlaps"],
        )
        logging.info(
            "Confidence distribution: %s",
            summary["confidence_distribution"],
        )
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote parcel jurisdiction summary CSV: %s", SUMMARY_OUTPUT)
        logging.info("Wrote no-match CSV: %s", NO_MATCH_OUTPUT)
        logging.info("Wrote low-confidence CSV: %s", LOW_CONFIDENCE_OUTPUT)
        logging.info("Overlay duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS parcel_jurisdiction_overlay build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
