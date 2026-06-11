"""Create and validate public.parcel_school_assignment."""

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
ZONE_TABLE = "public.school_zones"
ASSIGNMENT_TABLE = "public.parcel_school_assignment"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_school_assignment.sql"

VALIDATION_FILENAME = "parcel_school_assignment_validation.json"
WARNINGS_FILENAME = "parcel_school_assignment_warnings.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_school_assignment.",
    )
    parser.add_argument("--skip-transform", action="store_true")
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"create_parcel_school_assignment_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating school assignment."
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


def table_exists(engine: Engine, table_name: str) -> bool:
    return bool(scalar(engine, "SELECT to_regclass(:table_name) IS NOT NULL", {"table_name": table_name}))


def scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


def verify_sources(engine: Engine, skip_transform: bool) -> None:
    for table_name in [PARCEL_TABLE, ZONE_TABLE]:
        if not table_exists(engine, table_name):
            raise RuntimeError(f"Required table {table_name} does not exist.")
    if skip_transform and not table_exists(engine, ASSIGNMENT_TABLE):
        raise RuntimeError(f"--skip-transform supplied, but {ASSIGNMENT_TABLE} does not exist.")


def execute_sql_file(engine: Engine) -> None:
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


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / filename).open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def write_csv_all(filename: str, rows: list[dict[str, Any]], headers: list[str]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / filename).open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)


def build_validation(engine: Engine, elapsed_seconds: float, log_path: Path) -> dict[str, Any]:
    parcel_count = int(scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_TABLE}"))
    assignment_count = int(scalar(engine, f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE}"))
    included_zone_count = int(
        scalar(engine, f"SELECT COUNT(*) FROM {ZONE_TABLE} WHERE include_in_cfs_v1")
    )
    validation = {
        "generated_at": datetime.now().isoformat(),
        "parcel_table": PARCEL_TABLE,
        "zone_table": ZONE_TABLE,
        "assignment_table": ASSIGNMENT_TABLE,
        "parcel_row_count": parcel_count,
        "assignment_row_count": assignment_count,
        "row_count_delta": assignment_count - parcel_count,
        "row_counts_match": assignment_count == parcel_count,
        "included_school_zone_count": included_zone_count,
        "null_official_parcel_id_count": int(
            scalar(
                engine,
                f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE} WHERE official_parcel_id IS NULL",
            )
        ),
        "assignment_counts": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE has_elementary_assignment) AS elementary_assigned,
              COUNT(*) FILTER (WHERE has_middle_assignment) AS middle_assigned,
              COUNT(*) FILTER (WHERE has_high_assignment) AS high_assigned,
              COUNT(*) FILTER (WHERE missing_elementary_zone) AS missing_elementary,
              COUNT(*) FILTER (WHERE missing_middle_zone) AS missing_middle,
              COUNT(*) FILTER (WHERE missing_high_zone) AS missing_high,
              COUNT(*) FILTER (WHERE school_assignment_review_required) AS review_required,
              COUNT(*) FILTER (WHERE any_unmatched_school_reference) AS unmatched_reference
            FROM {ASSIGNMENT_TABLE}
            """,
        )[0],
        "multiple_zone_overlap_counts": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE multiple_elementary_zone_overlap)
                AS multiple_elementary,
              COUNT(*) FILTER (WHERE multiple_middle_zone_overlap)
                AS multiple_middle,
              COUNT(*) FILTER (WHERE multiple_high_zone_overlap)
                AS multiple_high
            FROM {ASSIGNMENT_TABLE}
            """,
        )[0],
        "assignment_confidence_distribution": fetch_rows(
            engine,
            f"""
            SELECT school_assignment_confidence, COUNT(*) AS parcel_count
            FROM {ASSIGNMENT_TABLE}
            GROUP BY school_assignment_confidence
            ORDER BY parcel_count DESC, school_assignment_confidence
            """,
        ),
        "school_name_distribution": {
            "elementary": fetch_rows(
                engine,
                f"""
                SELECT COALESCE(elementary_school_name, 'UNASSIGNED') AS school_name,
                       COUNT(*) AS parcel_count
                FROM {ASSIGNMENT_TABLE}
                GROUP BY COALESCE(elementary_school_name, 'UNASSIGNED')
                ORDER BY parcel_count DESC, school_name
                """,
            ),
            "middle": fetch_rows(
                engine,
                f"""
                SELECT COALESCE(middle_school_name, 'UNASSIGNED') AS school_name,
                       COUNT(*) AS parcel_count
                FROM {ASSIGNMENT_TABLE}
                GROUP BY COALESCE(middle_school_name, 'UNASSIGNED')
                ORDER BY parcel_count DESC, school_name
                """,
            ),
            "high": fetch_rows(
                engine,
                f"""
                SELECT COALESCE(high_school_name, 'UNASSIGNED') AS school_name,
                       COUNT(*) AS parcel_count
                FROM {ASSIGNMENT_TABLE}
                GROUP BY COALESCE(high_school_name, 'UNASSIGNED')
                ORDER BY parcel_count DESC, school_name
                """,
            ),
        },
        "geometry_validation": {
            "invalid_geometry_count": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            ),
            "null_geometry_count": int(
                scalar(engine, f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE} WHERE geometry IS NULL")
            ),
            "srid_counts": fetch_rows(
                engine,
                f"""
                SELECT ST_SRID(geometry) AS srid, COUNT(*) AS parcel_count
                FROM {ASSIGNMENT_TABLE}
                WHERE geometry IS NOT NULL
                GROUP BY ST_SRID(geometry)
                ORDER BY srid
                """,
            ),
        },
        "qa_policy": {
            "assignment_method": "attendance_zone_largest_overlap",
            "school_point_distance_used": False,
            "capacity_scoring_included": False,
        },
        "qa_pass": {
            "row_count_equals_parcels": assignment_count == parcel_count,
            "no_null_official_parcel_id": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE} WHERE official_parcel_id IS NULL",
                )
            )
            == 0,
            "no_invalid_geometries": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {ASSIGNMENT_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            )
            == 0,
        },
        "elapsed_seconds": elapsed_seconds,
        "log_path": str(log_path),
    }

    warning_rows = fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          pin14,
          elementary_school_name,
          middle_school_name,
          high_school_name,
          school_assignment_confidence,
          school_assignment_review_required,
          missing_elementary_zone,
          missing_middle_zone,
          missing_high_zone,
          multiple_elementary_zone_overlap,
          multiple_middle_zone_overlap,
          multiple_high_zone_overlap,
          any_unmatched_school_reference,
          data_quality_flags
        FROM {ASSIGNMENT_TABLE}
        WHERE school_assignment_review_required
           OR school_assignment_confidence IN ('low', 'review')
        ORDER BY official_parcel_id
        """,
    )
    write_csv_all(
        WARNINGS_FILENAME,
        warning_rows,
        [
            "official_parcel_id",
            "pin14",
            "elementary_school_name",
            "middle_school_name",
            "high_school_name",
            "school_assignment_confidence",
            "school_assignment_review_required",
            "missing_elementary_zone",
            "missing_middle_zone",
            "missing_high_zone",
            "multiple_elementary_zone_overlap",
            "multiple_middle_zone_overlap",
            "multiple_high_zone_overlap",
            "any_unmatched_school_reference",
            "data_quality_flags",
        ],
    )
    validation["warning_row_count"] = len(warning_rows)
    return validation


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    engine = create_engine_from_env()

    verify_sources(engine, args.skip_transform)
    if not args.skip_transform:
        logging.info("Executing parcel school assignment SQL: %s", SQL_FILE)
        execute_sql_file(engine)

    validation = build_validation(
        engine,
        elapsed_seconds=round(time.perf_counter() - started_at, 2),
        log_path=log_path,
    )
    write_json_all(VALIDATION_FILENAME, validation)
    logging.info(
        "Parcel school assignment row count: %s",
        validation["assignment_row_count"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
