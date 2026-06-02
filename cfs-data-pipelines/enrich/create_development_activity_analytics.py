"""Create and validate Phase 3 development activity analytics tables."""

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

PERMIT_TABLE = "public.real_property_permit_clean"
RELATIONSHIP_TABLE = "public.real_property_permit_parcel_relationship"
PARCEL_TABLE = "public.parcels_enriched"
ZONING_TABLE = "public.parcel_zoning_overlay_v2"
ZONING_QA_TABLE = "public.parcel_zoning_intelligence_qa"
PARCEL_SUMMARY_TABLE = "public.development_activity_parcel_summary"
TIME_SUMMARY_TABLE = "public.development_activity_time_summary"
ZONING_SUMMARY_TABLE = "public.development_activity_zoning_summary"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_development_activity_analytics.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "development_activity_parcel_summary_validation.json"
TOP_PARCELS_OUTPUT = OUTPUT_DIR / "development_activity_top_parcels.csv"
YEAR_SUMMARY_OUTPUT = OUTPUT_DIR / "development_activity_year_summary.csv"
MONTH_SUMMARY_OUTPUT = OUTPUT_DIR / "development_activity_month_summary.csv"
ZONING_SUMMARY_OUTPUT = OUTPUT_DIR / "development_activity_zoning_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate Phase 3 development activity analytics.",
    )
    parser.add_argument(
        "--skip-analytics",
        action="store_true",
        help="Only validate existing development activity analytics tables.",
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
    log_path = LOG_DIR / f"create_development_activity_analytics_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating analytics."
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


def verify_database(engine: Engine, skip_analytics: bool) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()

    for required_table in [
        PERMIT_TABLE,
        RELATIONSHIP_TABLE,
        PARCEL_TABLE,
        ZONING_TABLE,
        ZONING_QA_TABLE,
    ]:
        if not table_exists(engine, required_table):
            raise RuntimeError(f"Required source table {required_table} does not exist.")

    if skip_analytics:
        for summary_table in [
            PARCEL_SUMMARY_TABLE,
            TIME_SUMMARY_TABLE,
            ZONING_SUMMARY_TABLE,
        ]:
            if not table_exists(engine, summary_table):
                raise RuntimeError(
                    f"--skip-analytics was supplied, but {summary_table} does not exist."
                )


def execute_analytics_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Analytics SQL file not found: {SQL_FILE}")

    logging.info("Executing development activity analytics SQL: %s", SQL_FILE)
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


def get_activity_class_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          development_activity_class,
          COUNT(*) AS parcel_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}), 0), 4)
            AS parcel_percentage,
          COUNT(*) FILTER (WHERE has_unmatched_or_ambiguous_permit_flag) AS ambiguous_flag_parcel_count,
          ROUND(AVG(development_activity_score)::numeric, 4) AS avg_development_activity_score
        FROM {PARCEL_SUMMARY_TABLE}
        GROUP BY development_activity_class
        ORDER BY
          CASE development_activity_class
            WHEN 'very_high_activity' THEN 1
            WHEN 'high_activity' THEN 2
            WHEN 'moderate_activity' THEN 3
            WHEN 'low_activity' THEN 4
            WHEN 'no_activity' THEN 5
            ELSE 6
          END
        """,
    )


def get_top_activity_parcels(engine: Engine, limit: int = 500) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          subdiv_name,
          nbh_name,
          parcel_quality_status,
          valuation_band,
          parcel_size_category,
          zoning_jurisdiction_name,
          planning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          zoning_assignment_confidence,
          primary_governance_warning,
          total_permit_count,
          first_permit_date,
          latest_permit_date,
          active_year_count,
          recent_permit_count_1yr,
          recent_permit_count_3yr,
          total_permit_amount,
          avg_permit_amount,
          dominant_permit_type,
          dominant_work_type,
          latest_permit_status,
          ambiguous_permit_count,
          has_unmatched_or_ambiguous_permit_flag,
          co_date_future_outlier_count,
          development_activity_score,
          development_activity_class
        FROM {PARCEL_SUMMARY_TABLE}
        WHERE total_permit_count > 0
        ORDER BY
          development_activity_score DESC,
          total_permit_count DESC,
          total_permit_amount DESC NULLS LAST,
          latest_permit_date DESC NULLS LAST,
          official_parcel_id
        LIMIT {limit}
        """,
    )


def get_year_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        WITH permit_year AS (
          SELECT
            relationship.activity_year,
            relationship.permit_id,
            MAX(relationship.activity_date) AS activity_date,
            MAX(source_permit.permit_amount) AS permit_amount,
            BOOL_OR(relationship.missing_parcel_match) AS is_unmatched,
            BOOL_OR(relationship.has_multiple_parcel_matches) AS is_ambiguous
          FROM public.real_property_permit_parcel_relationship AS relationship
          LEFT JOIN public.real_property_permit_clean AS source_permit
            ON source_permit.permit_id = relationship.permit_id
          GROUP BY relationship.activity_year, relationship.permit_id
        ),
        relationship_year AS (
          SELECT
            activity_year,
            COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match)
              AS active_parcel_count,
            COUNT(DISTINCT zoning_jurisdiction_name)
              FILTER (WHERE zoning_jurisdiction_name IS NOT NULL)
              AS active_zoning_jurisdiction_count,
            SUM(permit_amount) AS relationship_permit_amount_total
          FROM public.real_property_permit_parcel_relationship
          GROUP BY activity_year
        )
        SELECT
          permit_year.activity_year,
          COUNT(*) AS permit_count,
          MAX(relationship_year.active_parcel_count) AS active_parcel_count,
          COUNT(*) FILTER (WHERE permit_year.is_unmatched) AS unmatched_permit_count,
          COUNT(*) FILTER (WHERE permit_year.is_ambiguous) AS ambiguous_permit_count,
          MAX(relationship_year.active_zoning_jurisdiction_count)
            AS active_zoning_jurisdiction_count,
          SUM(permit_year.permit_amount) AS source_permit_amount_total,
          MAX(relationship_year.relationship_permit_amount_total)
            AS relationship_permit_amount_total,
          MIN(permit_year.activity_date) AS first_permit_date,
          MAX(permit_year.activity_date) AS latest_permit_date
        FROM permit_year
        LEFT JOIN relationship_year
          ON relationship_year.activity_year IS NOT DISTINCT FROM permit_year.activity_year
        GROUP BY permit_year.activity_year
        ORDER BY permit_year.activity_year
        """,
    )


def get_month_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        WITH permit_month AS (
          SELECT
            relationship.activity_year,
            relationship.activity_month,
            relationship.permit_id,
            MAX(relationship.activity_date) AS activity_date,
            MAX(source_permit.permit_amount) AS permit_amount,
            BOOL_OR(relationship.missing_parcel_match) AS is_unmatched,
            BOOL_OR(relationship.has_multiple_parcel_matches) AS is_ambiguous
          FROM public.real_property_permit_parcel_relationship AS relationship
          LEFT JOIN public.real_property_permit_clean AS source_permit
            ON source_permit.permit_id = relationship.permit_id
          GROUP BY
            relationship.activity_year,
            relationship.activity_month,
            relationship.permit_id
        ),
        relationship_month AS (
          SELECT
            activity_year,
            activity_month,
            COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match)
              AS active_parcel_count,
            SUM(permit_amount) AS relationship_permit_amount_total
          FROM public.real_property_permit_parcel_relationship
          GROUP BY activity_year, activity_month
        )
        SELECT
          permit_month.activity_year,
          permit_month.activity_month,
          COUNT(*) AS permit_count,
          MAX(relationship_month.active_parcel_count) AS active_parcel_count,
          COUNT(*) FILTER (WHERE permit_month.is_unmatched) AS unmatched_permit_count,
          COUNT(*) FILTER (WHERE permit_month.is_ambiguous) AS ambiguous_permit_count,
          SUM(permit_month.permit_amount) AS source_permit_amount_total,
          MAX(relationship_month.relationship_permit_amount_total)
            AS relationship_permit_amount_total,
          MIN(permit_month.activity_date) AS first_permit_date,
          MAX(permit_month.activity_date) AS latest_permit_date
        FROM permit_month
        LEFT JOIN relationship_month
          ON relationship_month.activity_year IS NOT DISTINCT FROM permit_month.activity_year
         AND relationship_month.activity_month IS NOT DISTINCT FROM permit_month.activity_month
        GROUP BY permit_month.activity_year, permit_month.activity_month
        ORDER BY permit_month.activity_year, permit_month.activity_month
        """,
    )


def get_zoning_summary(engine: Engine, limit: int | None = None) -> list[dict[str, Any]]:
    limit_clause = f"LIMIT {limit}" if limit else ""
    return fetch_rows(
        engine,
        f"""
        SELECT
          zoning_jurisdiction_name,
          dominant_zoning_general_normalized,
          dominant_zoning_code_raw,
          permit_type,
          permit_count,
          relationship_row_count,
          active_parcel_count,
          unmatched_permit_count,
          ambiguous_permit_count,
          total_permit_amount,
          avg_permit_amount,
          first_permit_date,
          latest_permit_date
        FROM {ZONING_SUMMARY_TABLE}
        ORDER BY permit_count DESC,
                 total_permit_amount DESC NULLS LAST,
                 zoning_jurisdiction_name,
                 dominant_zoning_code_raw
        {limit_clause}
        """,
    )


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
            'development_activity_parcel_summary',
            'development_activity_time_summary',
            'development_activity_zoning_summary'
          )
        ORDER BY tablename, indexname
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


def validate_analytics(engine: Engine, started_at: float, log_path: Path) -> dict[str, Any]:
    top_parcels = get_top_activity_parcels(engine)
    year_summary = get_year_summary(engine)
    month_summary = get_month_summary(engine)
    zoning_summary = get_zoning_summary(engine)

    write_csv(TOP_PARCELS_OUTPUT, top_parcels)
    write_csv(YEAR_SUMMARY_OUTPUT, year_summary)
    write_csv(MONTH_SUMMARY_OUTPUT, month_summary)
    write_csv(ZONING_SUMMARY_OUTPUT, zoning_summary)

    validation = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "permit_table": PERMIT_TABLE,
            "relationship_table": RELATIONSHIP_TABLE,
            "parcel_table": PARCEL_TABLE,
            "parcel_summary_table": PARCEL_SUMMARY_TABLE,
            "time_summary_table": TIME_SUMMARY_TABLE,
            "zoning_summary_table": ZONING_SUMMARY_TABLE,
        },
        "parcel_activity_summary": {
            "total_parcels": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}")),
            "parcels_with_permits": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE total_permit_count > 0")
            ),
            "parcels_without_permits": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE total_permit_count = 0")
            ),
            "parcels_with_recent_1yr_activity": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE recent_permit_count_1yr > 0")
            ),
            "parcels_with_recent_3yr_activity": int(
                fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE recent_permit_count_3yr > 0")
            ),
            "parcels_with_ambiguous_permit_flag": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE has_unmatched_or_ambiguous_permit_flag",
                )
            ),
        },
        "permit_representation_summary": {
            "source_permit_count": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PERMIT_TABLE}")),
            "relationship_distinct_permit_count": int(
                fetch_scalar(engine, f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE}")
            ),
            "matched_distinct_permit_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE has_parcel_match",
                )
            ),
            "unmatched_distinct_permit_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE missing_parcel_match",
                )
            ),
            "ambiguous_distinct_permit_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE has_multiple_parcel_matches",
                )
            ),
            "relationship_row_count": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RELATIONSHIP_TABLE}")),
        },
        "permit_amount_summary": fetch_rows(
            engine,
            f"""
            SELECT
              (SELECT SUM(permit_amount) FROM {PERMIT_TABLE}) AS source_permit_amount_total,
              (SELECT SUM(permit_amount) FROM {RELATIONSHIP_TABLE}) AS relationship_row_permit_amount_total,
              (SELECT SUM(total_permit_amount) FROM {PARCEL_SUMMARY_TABLE}) AS parcel_summary_permit_amount_total
            """,
        )[0],
        "date_range": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(first_permit_date) AS first_permit_date,
              MAX(latest_permit_date) AS latest_permit_date,
              MAX(activity_anchor_date) AS activity_anchor_date
            FROM {PARCEL_SUMMARY_TABLE}
            WHERE total_permit_count > 0
            """,
        )[0],
        "activity_class_distribution": get_activity_class_distribution(engine),
        "top_activity_parcels": top_parcels[:25],
        "annual_trend_summary": year_summary,
        "recent_monthly_trend_summary": month_summary[-36:],
        "zoning_activity_summary": zoning_summary[:50],
        "summary_table_counts": {
            "parcel_summary_rows": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}")),
            "time_summary_rows": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {TIME_SUMMARY_TABLE}")),
            "zoning_summary_rows": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {ZONING_SUMMARY_TABLE}")),
        },
        "index_summary": get_index_summary(engine),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "top_parcels_csv": str(TOP_PARCELS_OUTPUT),
            "year_summary_csv": str(YEAR_SUMMARY_OUTPUT),
            "month_summary_csv": str(MONTH_SUMMARY_OUTPUT),
            "zoning_summary_csv": str(ZONING_SUMMARY_OUTPUT),
        },
        "duration_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }
    return validation


def write_validation(validation: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    VALIDATION_OUTPUT.write_text(
        json.dumps(normalize_json_value(validation), indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting Phase 3 development activity analytics build.")

    try:
        engine = create_engine_from_env()
        verify_database(engine, args.skip_analytics)

        if args.skip_analytics:
            logging.warning("Skipping analytics SQL because --skip-analytics was supplied.")
        else:
            execute_analytics_sql(engine)

        validation = validate_analytics(engine, started_at, log_path)
        write_validation(validation)
        engine.dispose()

        parcel_summary = validation["parcel_activity_summary"]
        logging.info("Total parcels: %s", parcel_summary["total_parcels"])
        logging.info("Parcels with permits: %s", parcel_summary["parcels_with_permits"])
        logging.info("Parcels without permits: %s", parcel_summary["parcels_without_permits"])
        logging.info(
            "Activity class distribution: %s",
            validation["activity_class_distribution"],
        )
        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        return 0
    except Exception:
        logging.exception("Development activity analytics build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
