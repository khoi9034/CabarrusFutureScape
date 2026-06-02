"""Create and validate public.permit_activity_clean for Phase 3."""

from __future__ import annotations

import argparse
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

RAW_TABLE = "public.permit_activity"
CLEAN_TABLE = "public.permit_activity_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_permit_activity_clean.sql"
VALIDATION_OUTPUT = OUTPUT_DIR / "permit_activity_clean_validation.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.permit_activity_clean.",
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
    log_path = LOG_DIR / f"create_permit_activity_clean_{timestamp}.log"
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
        raise RuntimeError("Raw table public.permit_activity does not exist.")
    if skip_transform and not table_exists(engine, CLEAN_TABLE):
        raise RuntimeError(
            "--skip-transform was supplied, but public.permit_activity_clean does not exist."
        )


def execute_transform_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Transform SQL file not found: {SQL_FILE}")

    logging.info("Executing permit activity clean SQL: %s", SQL_FILE)
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


def get_distribution(engine: Engine, column_name: str, limit: int = 25) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS permit_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {CLEAN_TABLE}), 0), 4)
            AS permit_percentage
        FROM {CLEAN_TABLE}
        GROUP BY {column_name}
        ORDER BY permit_count DESC, value
        LIMIT {limit}
        """,
    )


def validate_clean_table(engine: Engine, duration_seconds: float, log_path: Path) -> dict[str, Any]:
    raw_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RAW_TABLE}"))
    clean_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE}"))

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
        "geometry_summary": {
            "geometry_type_counts": fetch_rows(
                engine,
                f"""
                SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
                FROM {CLEAN_TABLE}
                GROUP BY ST_GeometryType(geometry)
                ORDER BY feature_count DESC
                """,
            ),
            "srid_distribution": fetch_rows(
                engine,
                f"""
                SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
                FROM {CLEAN_TABLE}
                GROUP BY ST_SRID(geometry)
                ORDER BY feature_count DESC
                """,
            ),
            "invalid_geometry_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            ),
            "null_geometry_count": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE geometry IS NULL")
            ),
        },
        "date_summary": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(activity_date) AS min_activity_date,
              MAX(activity_date) AS max_activity_date,
              COUNT(*) FILTER (WHERE activity_date IS NOT NULL) AS parsed_activity_date_count,
              COUNT(*) FILTER (WHERE activity_date IS NULL) AS missing_activity_date_count
            FROM {CLEAN_TABLE}
            """,
        )[0],
        "candidate_field_summary": {
            "permit_id_non_null_count": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE permit_id IS NOT NULL")
            ),
            "pin14_non_null_count": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE pin14 IS NOT NULL")
            ),
            "address_non_null_count": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE address IS NOT NULL")
            ),
            "status_non_null_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE permit_status_normalized IS NOT NULL",
                )
            ),
            "type_non_null_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE permit_type_normalized IS NOT NULL",
                )
            ),
        },
        "duplicate_summary": {
            "duplicate_permit_id_groups": int(
                fetch_scalar(
                    engine,
                    f"""
                    SELECT COUNT(*)
                    FROM (
                      SELECT permit_id
                      FROM {CLEAN_TABLE}
                      WHERE permit_id IS NOT NULL
                      GROUP BY permit_id
                      HAVING COUNT(*) > 1
                    ) duplicates
                    """,
                )
            ),
            "duplicate_pin14_groups": int(
                fetch_scalar(
                    engine,
                    f"""
                    SELECT COUNT(*)
                    FROM (
                      SELECT pin14
                      FROM {CLEAN_TABLE}
                      WHERE pin14 IS NOT NULL
                      GROUP BY pin14
                      HAVING COUNT(*) > 1
                    ) duplicates
                    """,
                )
            ),
        },
        "status_distribution": get_distribution(engine, "permit_status_normalized"),
        "type_distribution": get_distribution(engine, "permit_type_normalized"),
        "category_distribution": get_distribution(engine, "permit_category_normalized"),
        "index_summary": fetch_rows(
            engine,
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'permit_activity_clean'
            ORDER BY indexname
            """,
        ),
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
    logging.info("Starting permit activity clean transform.")

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
            "permit_activity_clean row count: %s",
            validation["row_count_comparison"]["clean_row_count"],
        )
        logging.info(
            "Invalid geometries after cleaning: %s",
            validation["geometry_summary"]["invalid_geometry_count"],
        )
        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        return 0
    except Exception:
        logging.exception("Permit activity clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
