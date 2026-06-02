"""Create and validate the CFS trusted parcel enrichment layer.

This local-development step reads public.parcels_clean, creates
public.parcels_enriched, and writes quality/outlier summaries for Phase 2
Parcel Intelligence. It intentionally does not modify the frontend dashboard,
connect APIs, ingest zoning/floodplain layers, or add AI/forecasting systems.
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
CLEAN_TABLE = "public.parcels_clean"
ENRICHED_TABLE = "public.parcels_enriched"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcels_enriched.sql"

SUMMARY_OUTPUT = OUTPUT_DIR / "parcels_enriched_summary.json"
QUALITY_FLAGS_OUTPUT = OUTPUT_DIR / "parcels_quality_flags.csv"
OUTLIER_SUMMARY_OUTPUT = OUTPUT_DIR / "parcels_outlier_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcels_enriched.",
    )
    parser.add_argument(
        "--skip-enrich",
        action="store_true",
        help="Only run validation against an existing public.parcels_enriched table.",
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
    log_path = LOG_DIR / f"create_parcels_enriched_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating parcels_enriched."
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
            clean_exists = connection.execute(
                text("SELECT to_regclass('public.parcels_clean') IS NOT NULL")
            ).scalar_one()
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    if not clean_exists:
        raise RuntimeError(
            "Source table public.parcels_clean does not exist. Run "
            "transform/create_parcels_clean.py before enrichment."
        )


def execute_enrichment_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Enrichment SQL file not found: {SQL_FILE}")

    logging.info("Executing enrichment SQL: %s", SQL_FILE)
    sql = SQL_FILE.read_text(encoding="utf-8")
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


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS parcel_count,
          ROUND((COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {ENRICHED_TABLE}), 0))::numeric, 4)
            AS parcel_percentage
        FROM {ENRICHED_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, value
        """,
    )


def get_row_count_comparison(engine: Engine) -> dict[str, Any]:
    clean_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {CLEAN_TABLE}"))
    enriched_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {ENRICHED_TABLE}"))
    return {
        "clean_table": CLEAN_TABLE,
        "enriched_table": ENRICHED_TABLE,
        "clean_row_count": clean_count,
        "enriched_row_count": enriched_count,
        "row_count_delta": enriched_count - clean_count,
        "row_counts_match": clean_count == enriched_count,
    }


def get_geometry_summary(engine: Engine) -> dict[str, Any]:
    return {
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {ENRICHED_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {ENRICHED_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {ENRICHED_TABLE} WHERE NOT ST_IsValid(geometry)",
            )
        ),
        "source_geometry_repaired_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {ENRICHED_TABLE} WHERE source_geometry_was_invalid",
            )
        ),
    }


def get_flag_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          flag AS outlier_flag,
          COUNT(*) AS parcel_count,
          ROUND((COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {ENRICHED_TABLE}), 0))::numeric, 4)
            AS parcel_percentage,
          ROUND(MAX(parcel_area_acres_calc)::numeric, 4) AS max_area_acres,
          ROUND(MAX(value_per_acre)::numeric, 2) AS max_value_per_acre
        FROM {ENRICHED_TABLE}
        CROSS JOIN LATERAL unnest(outlier_flags) AS flag
        GROUP BY flag
        ORDER BY parcel_count DESC, flag
        """,
    )


def get_flagged_parcels(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          geometry_quality_status,
          area_quality_status,
          valuation_quality_status,
          subdivision_quality_status,
          parcel_size_category,
          valuation_band,
          nbh_name,
          subdiv_name,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc,
          ROUND(value_per_acre::numeric, 2) AS value_per_acre,
          array_to_string(outlier_flags, '|') AS outlier_flags
        FROM {ENRICHED_TABLE}
        WHERE parcel_quality_status <> 'trusted'
          OR outlier_flag_count > 0
        ORDER BY outlier_flag_count DESC, official_parcel_id
        """,
    )


def get_duplicate_pin14_groups(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          pin14,
          COUNT(*) AS parcel_count,
          MIN(official_parcel_id) AS sample_official_parcel_id,
          array_to_string(array_agg(objectid_1 ORDER BY objectid_1), ',') AS objectid_1_values
        FROM {ENRICHED_TABLE}
        WHERE pin14 IS NOT NULL
        GROUP BY pin14
        HAVING COUNT(*) > 1
        ORDER BY parcel_count DESC, pin14
        LIMIT 25
        """,
    )


def get_top_suspicious_subdivisions(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(subdiv_name, '(missing)') AS subdivision,
          subdivision_quality_status,
          COUNT(*) AS parcel_count,
          ROUND(SUM(parcel_area_acres_calc)::numeric, 2) AS total_area_acres
        FROM {ENRICHED_TABLE}
        WHERE subdivision_quality_status <> 'valid'
          OR is_probable_administrative_group
        GROUP BY COALESCE(subdiv_name, '(missing)'), subdivision_quality_status
        ORDER BY parcel_count DESC, subdivision
        LIMIT 20
        """,
    )


def get_largest_parcels(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          subdiv_name,
          nbh_name,
          parcel_size_category,
          ROUND(parcel_area_acres_calc::numeric, 4) AS parcel_area_acres_calc,
          marketvalue_numeric,
          assessedvalue_numeric,
          parcel_quality_status,
          array_to_string(outlier_flags, '|') AS outlier_flags
        FROM {ENRICHED_TABLE}
        ORDER BY parcel_area_acres_calc DESC NULLS LAST
        LIMIT 20
        """,
    )


def get_highest_value_per_acre(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          subdiv_name,
          nbh_name,
          valuation_band,
          ROUND(parcel_area_acres_calc::numeric, 8) AS parcel_area_acres_calc,
          marketvalue_numeric,
          landvalue_numeric,
          ROUND(value_per_acre::numeric, 2) AS value_per_acre,
          parcel_quality_status,
          array_to_string(outlier_flags, '|') AS outlier_flags
        FROM {ENRICHED_TABLE}
        WHERE value_per_acre IS NOT NULL
        ORDER BY value_per_acre DESC
        LIMIT 20
        """,
    )


def get_group_quality_summary(engine: Engine, column_name: str, label: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE({column_name}, '(missing)') AS {label},
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE parcel_quality_status = 'trusted') AS trusted_count,
          COUNT(*) FILTER (WHERE parcel_quality_status = 'review') AS review_count,
          COUNT(*) FILTER (WHERE parcel_quality_status = 'critical') AS critical_count,
          ROUND(AVG(outlier_flag_count)::numeric, 3) AS avg_outlier_flag_count
        FROM {ENRICHED_TABLE}
        GROUP BY COALESCE({column_name}, '(missing)')
        ORDER BY review_count DESC, critical_count DESC, parcel_count DESC
        LIMIT 20
        """,
    )


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'parcels_enriched'
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
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    return value


def run_validation(engine: Engine, start_time: float, log_path: Path) -> dict[str, Any]:
    flag_summary = get_flag_summary(engine)
    flagged_parcels = get_flagged_parcels(engine)
    duplicate_pin14_groups = get_duplicate_pin14_groups(engine)
    duration_seconds = round(time.perf_counter() - start_time, 2)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "clean_table": CLEAN_TABLE,
            "enriched_table": ENRICHED_TABLE,
        },
        "row_count_comparison": get_row_count_comparison(engine),
        "geometry_summary": get_geometry_summary(engine),
        "flagged_parcel_count": len(flagged_parcels),
        "flag_summary": flag_summary,
        "duplicate_pin14_group_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM (
                  SELECT pin14
                  FROM {ENRICHED_TABLE}
                  WHERE pin14 IS NOT NULL
                  GROUP BY pin14
                  HAVING COUNT(*) > 1
                ) AS duplicate_groups
                """,
            )
        ),
        "duplicate_pin14_groups_top_25": duplicate_pin14_groups,
        "quality_distributions": {
            "parcel_quality_status": get_distribution(engine, "parcel_quality_status"),
            "geometry_quality_status": get_distribution(engine, "geometry_quality_status"),
            "area_quality_status": get_distribution(engine, "area_quality_status"),
            "valuation_quality_status": get_distribution(engine, "valuation_quality_status"),
            "subdivision_quality_status": get_distribution(engine, "subdivision_quality_status"),
            "parcel_size_category": get_distribution(engine, "parcel_size_category"),
            "valuation_band": get_distribution(engine, "valuation_band"),
            "neighborhood_density_class": get_distribution(engine, "neighborhood_density_class"),
        },
        "top_suspicious_subdivisions": get_top_suspicious_subdivisions(engine),
        "largest_parcels": get_largest_parcels(engine),
        "highest_value_per_acre_parcels": get_highest_value_per_acre(engine),
        "subdivision_quality_summary": get_group_quality_summary(
            engine,
            "subdiv_name",
            "subdivision",
        ),
        "neighborhood_quality_summary": get_group_quality_summary(
            engine,
            "nbh_name",
            "neighborhood",
        ),
        "index_summary": get_index_summary(engine),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "summary_json": str(SUMMARY_OUTPUT),
            "quality_flags_csv": str(QUALITY_FLAGS_OUTPUT),
            "outlier_summary_csv": str(OUTLIER_SUMMARY_OUTPUT),
        },
    }

    write_summary(summary)
    write_csv(QUALITY_FLAGS_OUTPUT, flagged_parcels)
    write_csv(OUTLIER_SUMMARY_OUTPUT, flag_summary)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcels_enriched build.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        verify_database(engine)

        if args.skip_enrich:
            logging.warning("Skipping enrichment SQL because --skip-enrich was supplied.")
        else:
            execute_enrichment_sql(engine)

        summary = run_validation(engine, start_time, log_path)
        engine.dispose()

        row_counts = summary["row_count_comparison"]
        geometry = summary["geometry_summary"]
        logging.info("Clean row count: %s", row_counts["clean_row_count"])
        logging.info("Enriched row count: %s", row_counts["enriched_row_count"])
        logging.info("Geometry summary: %s", geometry)
        logging.info("Flagged parcel count: %s", summary["flagged_parcel_count"])
        logging.info("Duplicate PIN14 group count: %s", summary["duplicate_pin14_group_count"])
        logging.info("Wrote summary JSON: %s", SUMMARY_OUTPUT)
        logging.info("Wrote quality flags CSV: %s", QUALITY_FLAGS_OUTPUT)
        logging.info("Wrote outlier summary CSV: %s", OUTLIER_SUMMARY_OUTPUT)
        logging.info("Enrichment duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS parcels_enriched build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
