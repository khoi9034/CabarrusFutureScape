"""Create and validate public.real_property_permit_clean for Phase 3."""

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

RAW_TABLE = "public.real_property_permit"
CLEAN_TABLE = "public.real_property_permit_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_real_property_permit_clean.sql"
VALIDATION_OUTPUT = OUTPUT_DIR / "real_property_permit_clean_validation.json"
YEAR_SUMMARY_OUTPUT = OUTPUT_DIR / "real_property_permit_year_summary.csv"
TYPE_SUMMARY_OUTPUT = OUTPUT_DIR / "real_property_permit_type_summary.csv"
STATUS_SUMMARY_OUTPUT = OUTPUT_DIR / "real_property_permit_status_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.real_property_permit_clean.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Only validate an existing clean table.",
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
    log_path = LOG_DIR / f"create_real_property_permit_clean_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before transforming permits."
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
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": table_name},
            ).scalar_one()
        )


def verify_database(engine: Engine, skip_transform: bool) -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()

    if not table_exists(engine, RAW_TABLE):
        raise RuntimeError("Raw table public.real_property_permit does not exist.")
    if skip_transform and not table_exists(engine, CLEAN_TABLE):
        raise RuntimeError(
            "--skip-transform was supplied, but public.real_property_permit_clean does not exist."
        )


def execute_transform_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Transform SQL file not found: {SQL_FILE}")

    logging.info("Executing Real Property Permit clean SQL: %s", SQL_FILE)
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


def get_distribution(
    engine: Engine,
    column_name: str,
    output_name: str,
    limit: int = 25,
) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS {output_name},
          COUNT(*) AS permit_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {CLEAN_TABLE}), 0), 4)
            AS permit_percentage
        FROM {CLEAN_TABLE}
        GROUP BY {column_name}
        ORDER BY permit_count DESC, {output_name}
        LIMIT {limit}
        """,
    )


def get_year_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          activity_year,
          COUNT(*) AS permit_count,
          COUNT(*) FILTER (WHERE has_invalid_or_future_permit_date) AS invalid_or_future_permit_date_count,
          COUNT(*) FILTER (WHERE has_invalid_or_future_co_date) AS invalid_or_future_co_date_count
        FROM {CLEAN_TABLE}
        GROUP BY activity_year
        ORDER BY activity_year
        """,
    )


def get_month_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          activity_year,
          activity_month,
          COUNT(*) AS permit_count
        FROM {CLEAN_TABLE}
        WHERE activity_year IS NOT NULL
          AND activity_month IS NOT NULL
        GROUP BY activity_year, activity_month
        ORDER BY activity_year, activity_month
        """,
    )


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def validate_clean_table(engine: Engine, duration_seconds: float, log_path: Path) -> dict[str, Any]:
    raw_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RAW_TABLE}"))
    clean_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE}"))
    year_summary = get_year_summary(engine)
    month_summary = get_month_summary(engine)
    type_summary = get_distribution(engine, "permit_type_normalized", "permit_type")
    status_summary = get_distribution(engine, "permit_status_normalized", "permit_status")
    work_type_summary = get_distribution(engine, "work_type_normalized", "work_type")

    write_csv(YEAR_SUMMARY_OUTPUT, year_summary)
    write_csv(TYPE_SUMMARY_OUTPUT, type_summary)
    write_csv(STATUS_SUMMARY_OUTPUT, status_summary)

    validation = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "raw_table": RAW_TABLE,
            "clean_table": CLEAN_TABLE,
        },
        "row_count_comparison": {
            "raw_row_count": raw_count,
            "clean_row_count": clean_count,
            "row_count_delta": clean_count - raw_count,
            "row_counts_match": raw_count == clean_count,
        },
        "permit_id_health": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE permit_id IS NOT NULL) AS permit_id_non_null_count,
              COUNT(DISTINCT permit_id) AS permit_id_distinct_count,
              (
                SELECT COUNT(*)
                FROM (
                  SELECT permit_id
                  FROM {CLEAN_TABLE}
                  WHERE permit_id IS NOT NULL
                  GROUP BY permit_id
                  HAVING COUNT(*) > 1
                ) duplicate_permits
              ) AS duplicate_permit_id_groups
            FROM {CLEAN_TABLE}
            """,
        )[0],
        "date_summary": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(permit_date) AS min_permit_date,
              MAX(permit_date) AS max_permit_date,
              COUNT(*) FILTER (WHERE permit_date IS NOT NULL) AS parsed_permit_date_count,
              COUNT(*) FILTER (WHERE permit_date_quality_status = 'missing') AS missing_permit_date_count,
              COUNT(*) FILTER (WHERE permit_date_quality_status = 'invalid') AS invalid_permit_date_count,
              COUNT(*) FILTER (WHERE permit_date_quality_status = 'future_outlier') AS future_permit_date_count,
              MIN(co_date) AS min_co_date,
              MAX(co_date) AS max_co_date,
              COUNT(*) FILTER (WHERE co_date IS NOT NULL) AS parsed_co_date_count,
              COUNT(*) FILTER (WHERE co_date_quality_status = 'missing') AS missing_co_date_count,
              COUNT(*) FILTER (WHERE co_date_quality_status = 'invalid') AS invalid_co_date_count,
              COUNT(*) FILTER (WHERE co_date_quality_status = 'future_outlier') AS future_co_date_count
            FROM {CLEAN_TABLE}
            """,
        )[0],
        "parcel_join_field_health": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE parcel_number IS NOT NULL) AS parcel_number_non_null_count,
              COUNT(DISTINCT parcel_number) AS parcel_number_distinct_count,
              (
                SELECT COUNT(*)
                FROM (
                  SELECT parcel_number
                  FROM {CLEAN_TABLE}
                  WHERE parcel_number IS NOT NULL
                  GROUP BY parcel_number
                  HAVING COUNT(*) > 1
                ) duplicate_parcels
              ) AS duplicate_parcel_number_groups
            FROM {CLEAN_TABLE}
            """,
        )[0],
        "field_presence_summary": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE permit_number IS NOT NULL) AS permit_number_non_null_count,
              COUNT(*) FILTER (WHERE permit_code IS NOT NULL) AS permit_code_non_null_count,
              COUNT(*) FILTER (WHERE permit_amount IS NOT NULL) AS permit_amount_numeric_count,
              COUNT(*) FILTER (WHERE permit_notes IS NOT NULL) AS permit_notes_non_null_count,
              COUNT(*) FILTER (WHERE building_number IS NOT NULL) AS building_number_non_null_count,
              COUNT(*) FILTER (WHERE work_type_raw IS NOT NULL) AS work_type_non_null_count,
              COUNT(*) FILTER (WHERE permit_type_raw IS NOT NULL) AS permit_type_non_null_count,
              COUNT(*) FILTER (WHERE permit_status_raw IS NOT NULL) AS permit_status_non_null_count
            FROM {CLEAN_TABLE}
            """,
        )[0],
        "top_permit_types": type_summary,
        "top_permit_statuses": status_summary,
        "top_work_types": work_type_summary,
        "permits_by_year": year_summary,
        "permits_by_month": month_summary,
        "source_metadata": fetch_rows(
            engine,
            f"""
            SELECT
              cfs_source_id,
              cfs_source_name,
              cfs_source_final_url,
              cfs_source_filename,
              source_last_modified,
              source_last_modified_at,
              cfs_source_etag,
              MIN(cfs_ingested_at) AS first_ingested_at,
              MAX(cfs_ingested_at) AS last_ingested_at
            FROM {CLEAN_TABLE}
            GROUP BY
              cfs_source_id,
              cfs_source_name,
              cfs_source_final_url,
              cfs_source_filename,
              source_last_modified,
              source_last_modified_at,
              cfs_source_etag
            """,
        ),
        "index_summary": fetch_rows(
            engine,
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'real_property_permit_clean'
            ORDER BY indexname
            """,
        ),
        "output_files": {
            "validation": str(VALIDATION_OUTPUT),
            "year_summary": str(YEAR_SUMMARY_OUTPUT),
            "type_summary": str(TYPE_SUMMARY_OUTPUT),
            "status_summary": str(STATUS_SUMMARY_OUTPUT),
        },
        "duration_seconds": round(duration_seconds, 2),
        "log_path": str(log_path),
    }
    return validation


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting Real Property Permit clean transform.")

    try:
        engine = create_engine_from_env()
        verify_database(engine, args.skip_transform)

        if not args.skip_transform:
            execute_transform_sql(engine)

        duration_seconds = time.perf_counter() - started_at
        validation = validate_clean_table(engine, duration_seconds, log_path)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        VALIDATION_OUTPUT.write_text(
            json.dumps(validation, indent=2, default=json_default),
            encoding="utf-8",
        )
        engine.dispose()

        logging.info(
            "real_property_permit_clean row count: %s",
            validation["row_count_comparison"]["clean_row_count"],
        )
        logging.info(
            "Future CODate warning count: %s",
            validation["date_summary"]["future_co_date_count"],
        )
        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        return 0
    except Exception:
        logging.exception("Real Property Permit clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
