"""Create and validate the CFS planning/ETJ boundary clean table."""

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
RAW_TABLE = "public.planning_boundaries"
CLEAN_TABLE = "public.planning_boundaries_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_planning_boundaries_clean.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "planning_boundaries_clean_validation.json"
SUMMARY_CSV_OUTPUT = OUTPUT_DIR / "planning_boundaries_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create public.planning_boundaries_clean.")
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
    log_path = LOG_DIR / f"create_planning_boundaries_clean_{timestamp}.log"
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
        raise RuntimeError("CFS_POSTGRES_PASSWORD is not set.")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def fetch_scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def verify_database(engine: Engine) -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()
        exists = connection.execute(
            text("SELECT to_regclass('public.planning_boundaries') IS NOT NULL")
        ).scalar_one()
    if not exists:
        raise RuntimeError("Missing raw planning boundary table: public.planning_boundaries")


def execute_transform_sql(engine: Engine) -> None:
    logging.info("Executing transform SQL: %s", SQL_FILE)
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


def get_columns(engine: Engine, table_name: str) -> list[dict[str, Any]]:
    schema, table = table_name.split(".", 1)
    return fetch_rows(
        engine,
        """
        SELECT column_name, data_type, udt_name, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :table
        ORDER BY ordinal_position
        """,
        {"schema": schema, "table": table},
    )


def get_geometry_counts(engine: Engine, table_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
        FROM {table_name}
        GROUP BY ST_GeometryType(geometry)
        ORDER BY feature_count DESC
        """,
    )


def get_validation(engine: Engine, start_time: float, log_path: Path) -> dict[str, Any]:
    summary_rows = fetch_rows(
        engine,
        f"""
        SELECT
          jurisdiction_name,
          boundary_type,
          boundary_name,
          COUNT(*) AS feature_count,
          ROUND(SUM(ST_Area(geometry::geography) / 4046.8564224)::numeric, 2)
            AS total_area_acres
        FROM {CLEAN_TABLE}
        GROUP BY jurisdiction_name, boundary_type, boundary_name
        ORDER BY jurisdiction_name, boundary_name
        """,
    )
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "raw_table": RAW_TABLE,
        "clean_table": CLEAN_TABLE,
        "raw_feature_count": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RAW_TABLE}")),
        "clean_feature_count": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE}")),
        "raw_geometry_type_counts": get_geometry_counts(engine, RAW_TABLE),
        "clean_geometry_type_counts": get_geometry_counts(engine, CLEAN_TABLE),
        "clean_srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {CLEAN_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "raw_invalid_geometry_count": int(
            fetch_scalar(engine, f"SELECT COUNT(*) FROM {RAW_TABLE} WHERE NOT ST_IsValid(geometry)")
        ),
        "clean_invalid_geometry_count": int(
            fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE NOT ST_IsValid(geometry)")
        ),
        "raw_field_inventory": get_columns(engine, RAW_TABLE),
        "inferred_boundary_summary": summary_rows,
        "index_summary": fetch_rows(
            engine,
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'planning_boundaries_clean'
            ORDER BY indexname
            """,
        ),
        "duration_seconds": round(time.perf_counter() - start_time, 2),
        "log_path": str(log_path),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "summary_csv": str(SUMMARY_CSV_OUTPUT),
        },
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
    VALIDATION_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
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


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS planning_boundaries_clean transform.")
    logging.info("Log file: %s", log_path)
    try:
        engine = create_engine_from_env()
        verify_database(engine)
        if args.skip_transform:
            logging.warning("Skipping transform SQL because --skip-transform was supplied.")
        else:
            execute_transform_sql(engine)
        summary = get_validation(engine, start_time, log_path)
        write_summary(summary)
        write_csv(SUMMARY_CSV_OUTPUT, summary["inferred_boundary_summary"])
        engine.dispose()
        logging.info("Planning boundary clean feature count: %s", summary["clean_feature_count"])
        logging.info("Invalid geometries before/after: %s/%s", summary["raw_invalid_geometry_count"], summary["clean_invalid_geometry_count"])
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote boundary summary CSV: %s", SUMMARY_CSV_OUTPUT)
        return 0
    except Exception:
        logging.exception("CFS planning_boundaries_clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
