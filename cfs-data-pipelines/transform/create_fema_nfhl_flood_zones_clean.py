"""Create and validate public.fema_nfhl_flood_zones_clean."""

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
RAW_TABLE = "public.fema_nfhl_flood_zones_raw"
CLEAN_TABLE = "public.fema_nfhl_flood_zones_clean"
PARCEL_TABLE = "public.parcels_enriched"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_fema_nfhl_flood_zones_clean.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "fema_nfhl_flood_zone_clean_validation.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.fema_nfhl_flood_zones_clean.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Only run validation against an existing clean FEMA flood table.",
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
    log_path = LOG_DIR / f"create_fema_nfhl_flood_zones_clean_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating FEMA clean."
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
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()
        raw_exists = connection.execute(
            text("SELECT to_regclass('public.fema_nfhl_flood_zones_raw') IS NOT NULL")
        ).scalar_one()

    if not raw_exists:
        raise RuntimeError("Source table public.fema_nfhl_flood_zones_raw does not exist.")


def execute_transform_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Transform SQL file not found: {SQL_FILE}")

    logging.info("Executing FEMA flood clean SQL: %s", SQL_FILE)
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
                f"SELECT COUNT(*) FROM {RAW_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
            )
        ),
        "clean_invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
            )
        ),
        "clean_null_geometry_count": int(
            fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE} WHERE geometry IS NULL")
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
            "ST_MakeValid repairs invalid geometries, polygonal components are "
            "extracted with ST_CollectionExtract(..., 3), and outputs are coerced "
            "to MultiPolygon in SRID 4326."
        ),
    }


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE({column_name}::text, 'UNKNOWN') AS value,
          COUNT(*) AS feature_count,
          ROUND(SUM(ST_Area(geometry::geography) / 4046.8564224)::numeric, 2)
            AS total_area_acres
        FROM {CLEAN_TABLE}
        GROUP BY COALESCE({column_name}::text, 'UNKNOWN')
        ORDER BY feature_count DESC, value
        """,
    )


def get_duplicate_identifier_summary(engine: Engine) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for column in ("globalid", "gfid", "fld_ar_id"):
        rows = fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) AS duplicate_groups,
              COALESCE(SUM(feature_count), 0) AS duplicate_rows
            FROM (
              SELECT {column}, COUNT(*) AS feature_count
              FROM {CLEAN_TABLE}
              WHERE {column} IS NOT NULL
              GROUP BY {column}
              HAVING COUNT(*) > 1
            ) AS duplicates
            """,
        )
        row = rows[0]
        summaries.append(
            {
                "identifier_field": column,
                "duplicate_groups": int(row["duplicate_groups"]),
                "duplicate_rows": int(row["duplicate_rows"]),
            }
        )
    return summaries


def get_county_coverage_sanity(engine: Engine) -> dict[str, Any]:
    rows = fetch_rows(
        engine,
        f"""
        WITH parcel_extent AS (
          SELECT ST_SetSRID(ST_Extent(geometry)::geometry, 4326) AS extent
          FROM {PARCEL_TABLE}
          WHERE geometry IS NOT NULL
        ),
        flood_extent AS (
          SELECT ST_SetSRID(ST_Extent(geometry)::geometry, 4326) AS extent
          FROM {CLEAN_TABLE}
          WHERE geometry IS NOT NULL
        )
        SELECT
          ST_XMin(parcel_extent.extent) AS parcel_xmin,
          ST_YMin(parcel_extent.extent) AS parcel_ymin,
          ST_XMax(parcel_extent.extent) AS parcel_xmax,
          ST_YMax(parcel_extent.extent) AS parcel_ymax,
          ST_XMin(flood_extent.extent) AS flood_xmin,
          ST_YMin(flood_extent.extent) AS flood_ymin,
          ST_XMax(flood_extent.extent) AS flood_xmax,
          ST_YMax(flood_extent.extent) AS flood_ymax,
          ST_Intersects(parcel_extent.extent, flood_extent.extent) AS extents_intersect
        FROM parcel_extent, flood_extent
        """,
    )
    return rows[0] if rows else {}


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'fema_nfhl_flood_zones_clean'
        ORDER BY indexname
        """,
    )


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    engine = create_engine_from_env()
    verify_database(engine)
    if not args.skip_transform:
        execute_transform_sql(engine)

    row_count_comparison = get_row_count_comparison(engine)
    geometry_validation = get_geometry_validation(engine)
    validation = {
        "generated_at": datetime.now().isoformat(),
        "row_count_comparison": row_count_comparison,
        "geometry_validation": geometry_validation,
        "flood_zone_distribution": get_distribution(engine, "flood_zone_code"),
        "flood_constraint_type_distribution": get_distribution(engine, "flood_constraint_type"),
        "flood_severity_distribution": get_distribution(engine, "flood_severity_class"),
        "floodway_counts": fetch_rows(
            engine,
            f"""
            SELECT is_floodway, COUNT(*) AS feature_count
            FROM {CLEAN_TABLE}
            GROUP BY is_floodway
            ORDER BY is_floodway DESC
            """,
        ),
        "duplicate_identifier_summary": get_duplicate_identifier_summary(engine),
        "county_coverage_sanity_check": get_county_coverage_sanity(engine),
        "indexes": get_index_summary(engine),
        "qa_pass": {
            "no_invalid_geometries": geometry_validation["clean_invalid_geometry_count"] == 0,
            "srid_4326_only": geometry_validation["clean_srid_counts"]
            == [
                {
                    "srid": 4326,
                    "feature_count": row_count_comparison["clean_row_count"],
                }
            ],
            "raw_clean_counts_match": row_count_comparison["row_counts_match"],
        },
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }

    with VALIDATION_OUTPUT.open("w", encoding="utf-8") as file:
        json.dump(validation, file, indent=2, default=to_jsonable)

    logging.info("Wrote FEMA clean validation: %s", VALIDATION_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
