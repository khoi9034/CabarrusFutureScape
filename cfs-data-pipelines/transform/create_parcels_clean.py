"""Create and validate the CFS curated parcels_clean table.

This local-development transform reads public.parcels, creates
public.parcels_clean, and writes validation artifacts for Phase 2 Parcel
Intelligence. It intentionally does not modify the frontend dashboard, ingest
additional layers, or create APIs.
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
RAW_SCHEMA = "public"
RAW_TABLE = "parcels"
CLEAN_SCHEMA = "public"
CLEAN_TABLE = "parcels_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcels_clean.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "parcels_clean_validation.json"
SUBDIVISION_OUTPUT = OUTPUT_DIR / "parcels_subdivision_summary.csv"
NEIGHBORHOOD_OUTPUT = OUTPUT_DIR / "parcels_neighborhood_summary.csv"

NUMERIC_VALUE_FIELDS = (
    "marketvalue",
    "assessedvalue",
    "landvalue",
    "deferredvalue",
    "buildingvalue",
    "obxfvalue",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcels_clean.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Only run validation against an existing public.parcels_clean table.",
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
    log_path = LOG_DIR / f"create_parcels_clean_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating parcels_clean."
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


def qualified_table(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def verify_database(engine: Engine) -> None:
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
            source_exists = connection.execute(
                text(
                    """
                    SELECT to_regclass('public.parcels') IS NOT NULL
                    """
                )
            ).scalar_one()
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    if not source_exists:
        raise RuntimeError("Source table public.parcels does not exist.")


def execute_transform_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Transform SQL file not found: {SQL_FILE}")

    sql = SQL_FILE.read_text(encoding="utf-8")
    logging.info("Executing transform SQL: %s", SQL_FILE)

    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(sql)
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def get_row_count_comparison(engine: Engine) -> dict[str, Any]:
    raw_table = qualified_table(RAW_SCHEMA, RAW_TABLE)
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)
    raw_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {raw_table}"))
    clean_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {clean_table}"))

    return {
        "raw_table": f"{RAW_SCHEMA}.{RAW_TABLE}",
        "clean_table": f"{CLEAN_SCHEMA}.{CLEAN_TABLE}",
        "raw_row_count": raw_count,
        "clean_row_count": clean_count,
        "row_count_delta": clean_count - raw_count,
        "row_counts_match": raw_count == clean_count,
    }


def get_geometry_validation(engine: Engine) -> dict[str, Any]:
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)

    geometry_type_counts = fetch_rows(
        engine,
        f"""
        SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
        FROM {clean_table}
        GROUP BY ST_GeometryType(geometry)
        ORDER BY feature_count DESC
        """,
    )
    srid_counts = fetch_rows(
        engine,
        f"""
        SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
        FROM {clean_table}
        GROUP BY ST_SRID(geometry)
        ORDER BY srid
        """,
    )
    invalid_geometry_count = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {clean_table} WHERE NOT ST_IsValid(geometry)",
        )
    )
    null_geometry_count = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {clean_table} WHERE geometry IS NULL",
        )
    )

    return {
        "geometry_type_counts": geometry_type_counts,
        "srid_counts": srid_counts,
        "invalid_geometry_count": invalid_geometry_count,
        "null_geometry_count": null_geometry_count,
        "geometry_cleaning_policy": (
            "ST_MakeValid is applied, polygonal components are extracted with "
            "ST_CollectionExtract(..., 3), and geometries are coerced to "
            "MultiPolygon in SRID 4326."
        ),
    }


def get_numeric_cast_validation(engine: Engine) -> dict[str, Any]:
    raw_table = qualified_table(RAW_SCHEMA, RAW_TABLE)
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)
    validation: dict[str, Any] = {}

    for field in NUMERIC_VALUE_FIELDS:
        clean_field = f"{field}_numeric"
        row = fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (
                WHERE NULLIF(btrim(raw."{field}"), '') IS NOT NULL
              ) AS raw_non_empty_count,
              COUNT(clean."{clean_field}") AS clean_numeric_count,
              COUNT(*) FILTER (
                WHERE NULLIF(btrim(raw."{field}"), '') IS NOT NULL
                  AND clean."{clean_field}" IS NULL
              ) AS failed_cast_count,
              MIN(clean."{clean_field}") AS min_value,
              MAX(clean."{clean_field}") AS max_value,
              AVG(clean."{clean_field}") AS avg_value
            FROM {raw_table} AS raw
            LEFT JOIN {clean_table} AS clean
              ON clean.objectid_1 = raw.objectid_1
            """,
        )[0]
        validation[field] = row

    return validation


def get_duplicate_pin14_summary(engine: Engine) -> dict[str, Any]:
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)
    return fetch_rows(
        engine,
        f"""
        WITH grouped_values AS (
          SELECT pin14, COUNT(*) AS row_count
          FROM {clean_table}
          WHERE pin14 IS NOT NULL
          GROUP BY pin14
        )
        SELECT
          COUNT(*) AS distinct_non_null_pin14_count,
          COUNT(*) FILTER (WHERE row_count > 1) AS duplicate_pin14_value_count,
          COALESCE(SUM(row_count - 1) FILTER (WHERE row_count > 1), 0) AS duplicate_pin14_excess_rows,
          (SELECT COUNT(*) FROM {clean_table} WHERE pin14 IS NULL) AS null_pin14_count
        FROM grouped_values
        """,
    )[0]


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'parcels_clean'
        ORDER BY indexname
        """,
    )


def get_primary_key_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT
          conname AS constraint_name,
          pg_get_constraintdef(oid) AS constraint_definition
        FROM pg_constraint
        WHERE conrelid = 'public.parcels_clean'::regclass
          AND contype = 'p'
        ORDER BY conname
        """,
    )


def get_derived_field_summary(engine: Engine) -> dict[str, Any]:
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)
    return fetch_rows(
        engine,
        f"""
        SELECT
          COUNT(parcel_area_sq_m) AS parcel_area_sq_m_count,
          MIN(parcel_area_sq_m) AS min_area_sq_m,
          MAX(parcel_area_sq_m) AS max_area_sq_m,
          AVG(parcel_area_sq_m) AS avg_area_sq_m,
          COUNT(parcel_area_acres_calc) AS parcel_area_acres_count,
          MIN(parcel_area_acres_calc) AS min_area_acres,
          MAX(parcel_area_acres_calc) AS max_area_acres,
          AVG(parcel_area_acres_calc) AS avg_area_acres,
          COUNT(value_per_acre) AS value_per_acre_count,
          MIN(value_per_acre) AS min_value_per_acre,
          MAX(value_per_acre) AS max_value_per_acre,
          AVG(value_per_acre) AS avg_value_per_acre
        FROM {clean_table}
        """,
    )[0]


def get_group_summary(engine: Engine, column: str, label: str) -> list[dict[str, Any]]:
    clean_table = qualified_table(CLEAN_SCHEMA, CLEAN_TABLE)
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column} AS {label},
          COUNT(*) AS parcel_count,
          ROUND(SUM(parcel_area_acres_calc)::numeric, 2) AS total_area_acres,
          ROUND(AVG(marketvalue_numeric)::numeric, 2) AS avg_marketvalue,
          ROUND(AVG(assessedvalue_numeric)::numeric, 2) AS avg_assessedvalue
        FROM {clean_table}
        WHERE {column} IS NOT NULL
        GROUP BY {column}
        ORDER BY parcel_count DESC, {column}
        LIMIT 20
        """,
    )


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


def write_summary_json(summary: dict[str, Any]) -> None:
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


def run_validation(engine: Engine, start_time: float, log_path: Path) -> dict[str, Any]:
    subdivision_summary = get_group_summary(engine, "subdiv_name", "subdivision")
    neighborhood_summary = get_group_summary(engine, "nbh_name", "neighborhood")
    duration_seconds = round(time.perf_counter() - start_time, 2)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "raw_table": f"{RAW_SCHEMA}.{RAW_TABLE}",
            "clean_table": f"{CLEAN_SCHEMA}.{CLEAN_TABLE}",
        },
        "row_count_comparison": get_row_count_comparison(engine),
        "geometry_validation": get_geometry_validation(engine),
        "numeric_cast_validation": get_numeric_cast_validation(engine),
        "duplicate_pin14_summary": get_duplicate_pin14_summary(engine),
        "primary_key_summary": get_primary_key_summary(engine),
        "index_summary": get_index_summary(engine),
        "derived_field_summary": get_derived_field_summary(engine),
        "top_subdivisions_by_parcel_count": subdivision_summary,
        "top_neighborhoods_by_parcel_count": neighborhood_summary,
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "subdivision_summary_csv": str(SUBDIVISION_OUTPUT),
            "neighborhood_summary_csv": str(NEIGHBORHOOD_OUTPUT),
        },
    }

    write_summary_json(summary)
    write_csv(SUBDIVISION_OUTPUT, subdivision_summary)
    write_csv(NEIGHBORHOOD_OUTPUT, neighborhood_summary)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcels_clean transform.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        verify_database(engine)

        if args.skip_transform:
            logging.warning("Skipping transform SQL because --skip-transform was supplied.")
        else:
            execute_transform_sql(engine)

        summary = run_validation(engine, start_time, log_path)
        engine.dispose()

        row_counts = summary["row_count_comparison"]
        geometry = summary["geometry_validation"]
        pin14 = summary["duplicate_pin14_summary"]
        logging.info("Raw row count: %s", row_counts["raw_row_count"])
        logging.info("Clean row count: %s", row_counts["clean_row_count"])
        logging.info("Geometry types: %s", geometry["geometry_type_counts"])
        logging.info("SRID distribution: %s", geometry["srid_counts"])
        logging.info("Invalid geometry count after cleaning: %s", geometry["invalid_geometry_count"])
        logging.info(
            "PIN14 duplicates: values=%s excess_rows=%s nulls=%s",
            pin14["duplicate_pin14_value_count"],
            pin14["duplicate_pin14_excess_rows"],
            pin14["null_pin14_count"],
        )
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote subdivision summary CSV: %s", SUBDIVISION_OUTPUT)
        logging.info("Wrote neighborhood summary CSV: %s", NEIGHBORHOOD_OUTPUT)
        logging.info("Transform duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS parcels_clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
