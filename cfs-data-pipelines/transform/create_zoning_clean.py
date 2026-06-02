"""Create and validate the CFS cleaned zoning overlay layer.

This local-development transform reads public.zoning, creates
public.zoning_clean, and writes validation artifacts for the Phase 2 zoning
overlay pilot. It intentionally does not modify the frontend dashboard, connect
APIs, ingest additional layers, or perform parcel-zoning joins.
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
RAW_TABLE = "public.zoning"
CLEAN_TABLE = "public.zoning_clean"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_zoning_clean.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "zoning_clean_validation.json"
CLASS_SUMMARY_OUTPUT = OUTPUT_DIR / "zoning_class_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.zoning_clean.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Only run validation against an existing public.zoning_clean table.",
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
    log_path = LOG_DIR / f"create_zoning_clean_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating zoning_clean."
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
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            connection.execute(text("SELECT postgis_full_version()")).scalar_one()
            zoning_exists = connection.execute(
                text("SELECT to_regclass('public.zoning') IS NOT NULL")
            ).scalar_one()
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    if not zoning_exists:
        raise RuntimeError("Source table public.zoning does not exist.")


def execute_transform_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Transform SQL file not found: {SQL_FILE}")

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


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def get_row_count_comparison(engine: Engine) -> dict[str, Any]:
    raw_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RAW_TABLE}"))
    clean_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE}"))
    return {
        "raw_table": RAW_TABLE,
        "clean_table": CLEAN_TABLE,
        "raw_row_count": raw_count,
        "clean_row_count": clean_count,
        "row_count_delta": clean_count - raw_count,
        "row_counts_match": raw_count == clean_count,
    }


def get_geometry_validation(engine: Engine) -> dict[str, Any]:
    return {
        "raw_invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {RAW_TABLE} WHERE NOT ST_IsValid(geometry)",
            )
        ),
        "clean_invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE NOT ST_IsValid(geometry)",
            )
        ),
        "clean_null_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE geometry IS NULL",
            )
        ),
        "clean_geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {CLEAN_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "clean_srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {CLEAN_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "geometry_cleaning_policy": (
            "ST_MakeValid is applied, polygonal components are extracted with "
            "ST_CollectionExtract(..., 3), and geometries are coerced to "
            "MultiPolygon in SRID 4326."
        ),
    }


def get_zoning_class_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          zoning_code,
          zoning_general,
          zoning_label,
          COUNT(*) AS feature_count,
          ROUND(SUM(ST_Area(geometry::geography) / 4046.8564224)::numeric, 2)
            AS total_area_acres,
          ROUND(AVG(ST_Area(geometry::geography) / 4046.8564224)::numeric, 2)
            AS avg_feature_area_acres
        FROM {CLEAN_TABLE}
        GROUP BY zoning_code, zoning_general, zoning_label
        ORDER BY feature_count DESC, zoning_label
        """,
    )


def get_dropped_features(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          raw.objectid AS source_objectid,
          raw.zoningcode AS zoning_code,
          raw.zoning_gen AS zoning_general,
          ST_GeometryType(raw.geometry) AS raw_geometry_type,
          ST_IsValid(raw.geometry) AS raw_is_valid,
          ST_IsValidReason(raw.geometry) AS raw_validity_reason
        FROM {RAW_TABLE} AS raw
        LEFT JOIN {CLEAN_TABLE} AS clean
          ON clean.source_objectid = raw.objectid
        WHERE clean.source_objectid IS NULL
        ORDER BY raw.objectid
        """,
    )


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'zoning_clean'
        ORDER BY indexname
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
    class_summary = get_zoning_class_summary(engine)
    dropped_features = get_dropped_features(engine)
    duration_seconds = round(time.perf_counter() - start_time, 2)
    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "raw_table": RAW_TABLE,
            "clean_table": CLEAN_TABLE,
        },
        "row_count_comparison": get_row_count_comparison(engine),
        "geometry_validation": get_geometry_validation(engine),
        "dropped_feature_count": len(dropped_features),
        "dropped_features": dropped_features,
        "dropped_feature_policy": (
            "Features are dropped from zoning_clean only when ST_MakeValid plus "
            "polygon extraction cannot produce a non-empty polygonal geometry."
        ),
        "zoning_class_count": len(class_summary),
        "zoning_class_summary": class_summary,
        "index_summary": get_index_summary(engine),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "zoning_class_summary_csv": str(CLASS_SUMMARY_OUTPUT),
        },
    }
    write_summary_json(summary)
    write_csv(CLASS_SUMMARY_OUTPUT, class_summary)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS zoning_clean transform.")
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
        logging.info("Raw zoning row count: %s", row_counts["raw_row_count"])
        logging.info("Clean zoning row count: %s", row_counts["clean_row_count"])
        logging.info(
            "Invalid geometries before/after cleaning: %s/%s",
            geometry["raw_invalid_geometry_count"],
            geometry["clean_invalid_geometry_count"],
        )
        logging.info("Clean geometry types: %s", geometry["clean_geometry_type_counts"])
        logging.info("Clean SRID distribution: %s", geometry["clean_srid_counts"])
        logging.info("Zoning class count: %s", summary["zoning_class_count"])
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote class summary CSV: %s", CLASS_SUMMARY_OUTPUT)
        logging.info("Transform duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS zoning_clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
