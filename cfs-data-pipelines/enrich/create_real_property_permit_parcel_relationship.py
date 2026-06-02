"""Create and validate the Real Property Permit-to-Parcel relationship model."""

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
PARCEL_TABLE = "public.parcels_enriched"
ZONING_TABLE = "public.parcel_zoning_overlay_v2"
ZONING_QA_TABLE = "public.parcel_zoning_intelligence_qa"
RELATIONSHIP_TABLE = "public.real_property_permit_parcel_relationship"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_real_property_permit_parcel_relationship.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "real_property_permit_parcel_relationship_validation.json"
SUMMARY_OUTPUT = OUTPUT_DIR / "real_property_permit_parcel_relationship_summary.csv"
NO_MATCH_OUTPUT = OUTPUT_DIR / "real_property_permit_parcel_no_match.csv"
AMBIGUOUS_OUTPUT = OUTPUT_DIR / "real_property_permit_parcel_ambiguous.csv"
BY_PARCEL_OUTPUT = OUTPUT_DIR / "real_property_permit_by_parcel_summary.csv"
BY_YEAR_OUTPUT = OUTPUT_DIR / "real_property_permit_by_year_summary.csv"
BY_ZONING_OUTPUT = OUTPUT_DIR / "real_property_permit_by_zoning_summary.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.real_property_permit_parcel_relationship.",
    )
    parser.add_argument(
        "--skip-relationship",
        action="store_true",
        help="Only validate an existing relationship table.",
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
    log_path = LOG_DIR / f"create_real_property_permit_parcel_relationship_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating permit relationships."
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


def verify_database(engine: Engine, skip_relationship: bool) -> None:
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

    for required_table in [PERMIT_TABLE, PARCEL_TABLE, ZONING_TABLE, ZONING_QA_TABLE]:
        if not table_exists(engine, required_table):
            raise RuntimeError(f"Required source table {required_table} does not exist.")

    if skip_relationship and not table_exists(engine, RELATIONSHIP_TABLE):
        raise RuntimeError(
            "--skip-relationship was supplied, but public.real_property_permit_parcel_relationship does not exist."
        )


def execute_relationship_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Relationship SQL file not found: {SQL_FILE}")

    logging.info("Executing Real Property Permit relationship SQL: %s", SQL_FILE)
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


def distribution(engine: Engine, column_name: str, label_name: str = "value") -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS {label_name},
          COUNT(DISTINCT permit_id) AS permit_count,
          COUNT(*) AS relationship_row_count,
          ROUND(
            COUNT(DISTINCT permit_id) * 100.0
            / NULLIF((SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE}), 0),
            4
          ) AS permit_percentage
        FROM {RELATIONSHIP_TABLE}
        GROUP BY {column_name}
        ORDER BY permit_count DESC, {label_name}
        """,
    )


def top_permit_dimension(
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
          COUNT(DISTINCT permit_id) AS permit_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS parcel_count,
          ROUND(
            COUNT(DISTINCT permit_id) * 100.0
            / NULLIF((SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE}), 0),
            4
          ) AS permit_percentage
        FROM {RELATIONSHIP_TABLE}
        GROUP BY {column_name}
        ORDER BY permit_count DESC, {output_name}
        LIMIT {limit}
        """,
    )


def get_relationship_summary_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          relationship_confidence,
          relationship_method,
          has_parcel_match,
          has_multiple_parcel_matches,
          missing_parcel_match,
          COUNT(DISTINCT permit_id) AS permit_count,
          COUNT(*) AS relationship_row_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS parcel_count,
          ROUND(
            COUNT(DISTINCT permit_id) * 100.0
            / NULLIF((SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE}), 0),
            4
          ) AS permit_percentage
        FROM {RELATIONSHIP_TABLE}
        GROUP BY
          relationship_confidence,
          relationship_method,
          has_parcel_match,
          has_multiple_parcel_matches,
          missing_parcel_match
        ORDER BY permit_count DESC, relationship_confidence, relationship_method
        """,
    )


def get_no_match_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          permit_id,
          permit_number,
          parcel_number,
          parcel_number_normalized,
          permit_date,
          activity_year,
          permit_code,
          permit_type,
          work_type,
          permit_status,
          permit_amount,
          relationship_method,
          relationship_confidence,
          co_date_future_outlier
        FROM {RELATIONSHIP_TABLE}
        WHERE missing_parcel_match
        ORDER BY activity_date DESC NULLS LAST, permit_id
        """,
    )


def get_ambiguous_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          permit_id,
          permit_number,
          parcel_number,
          parcel_number_normalized,
          official_parcel_id,
          objectid_1,
          pin14,
          permit_date,
          activity_year,
          permit_code,
          permit_type,
          work_type,
          permit_status,
          parcel_quality_status,
          valuation_band,
          parcel_size_category,
          zoning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          zoning_assignment_confidence,
          governance_warning_categories,
          relationship_method,
          relationship_confidence
        FROM {RELATIONSHIP_TABLE}
        WHERE has_multiple_parcel_matches
        ORDER BY permit_id, official_parcel_id
        """,
    )


def get_by_parcel_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          valuation_band,
          parcel_size_category,
          zoning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          zoning_assignment_confidence,
          governance_warning_categories,
          COUNT(DISTINCT permit_id) AS permit_count,
          MIN(activity_date) AS first_permit_date,
          MAX(activity_date) AS latest_permit_date,
          COUNT(DISTINCT permit_type_normalized) FILTER (WHERE permit_type_normalized IS NOT NULL)
            AS permit_type_count,
          SUM(permit_amount) AS total_permit_amount,
          COUNT(*) FILTER (WHERE co_date_future_outlier) AS co_date_future_outlier_count
        FROM {RELATIONSHIP_TABLE}
        WHERE has_parcel_match
        GROUP BY
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          valuation_band,
          parcel_size_category,
          zoning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          zoning_assignment_confidence,
          governance_warning_categories
        ORDER BY permit_count DESC, latest_permit_date DESC NULLS LAST, official_parcel_id
        LIMIT 500
        """,
    )


def get_by_year_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          activity_year,
          activity_month,
          COUNT(DISTINCT permit_id) AS permit_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS parcel_count,
          COUNT(DISTINCT permit_id) FILTER (WHERE missing_parcel_match) AS unmatched_permit_count,
          COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches) AS ambiguous_permit_count,
          COUNT(*) FILTER (WHERE co_date_future_outlier) AS co_date_future_outlier_count,
          SUM(permit_amount) AS total_permit_amount
        FROM {RELATIONSHIP_TABLE}
        GROUP BY activity_year, activity_month
        ORDER BY activity_year, activity_month
        """,
    )


def get_by_zoning_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(unmatched parcel)') AS zoning_jurisdiction_name,
          COALESCE(dominant_zoning_general_normalized, '(unknown)') AS dominant_zoning_general_normalized,
          COALESCE(dominant_zoning_code_raw, '(unknown)') AS dominant_zoning_code_raw,
          zoning_assignment_confidence,
          COUNT(DISTINCT permit_id) AS permit_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE has_parcel_match) AS parcel_count,
          COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches) AS ambiguous_permit_count,
          SUM(permit_amount) AS total_permit_amount
        FROM {RELATIONSHIP_TABLE}
        GROUP BY
          COALESCE(zoning_jurisdiction_name, '(unmatched parcel)'),
          COALESCE(dominant_zoning_general_normalized, '(unknown)'),
          COALESCE(dominant_zoning_code_raw, '(unknown)'),
          zoning_assignment_confidence
        ORDER BY permit_count DESC, zoning_jurisdiction_name, dominant_zoning_code_raw
        """,
    )


def get_top_parcels(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          pin14,
          COUNT(DISTINCT permit_id) AS permit_count,
          MIN(activity_date) AS first_permit_date,
          MAX(activity_date) AS latest_permit_date,
          zoning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          parcel_quality_status,
          valuation_band,
          parcel_size_category,
          SUM(permit_amount) AS total_permit_amount
        FROM {RELATIONSHIP_TABLE}
        WHERE has_parcel_match
        GROUP BY
          official_parcel_id,
          pin14,
          zoning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          parcel_quality_status,
          valuation_band,
          parcel_size_category
        ORDER BY permit_count DESC, latest_permit_date DESC NULLS LAST, official_parcel_id
        LIMIT 25
        """,
    )


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'real_property_permit_parcel_relationship'
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


def validate_relationship(engine: Engine, started_at: float, log_path: Path) -> dict[str, Any]:
    total_permits = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PERMIT_TABLE}"))
    relationship_rows = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {RELATIONSHIP_TABLE}"))
    matched_permits = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE has_parcel_match",
        )
    )
    unmatched_permits = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE missing_parcel_match",
        )
    )
    multiple_match_permits = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE has_multiple_parcel_matches",
        )
    )

    relationship_summary = get_relationship_summary_rows(engine)
    no_match_rows = get_no_match_rows(engine)
    ambiguous_rows = get_ambiguous_rows(engine)
    by_parcel_summary = get_by_parcel_summary(engine)
    by_year_summary = get_by_year_summary(engine)
    by_zoning_summary = get_by_zoning_summary(engine)

    write_csv(SUMMARY_OUTPUT, relationship_summary)
    write_csv(NO_MATCH_OUTPUT, no_match_rows)
    write_csv(AMBIGUOUS_OUTPUT, ambiguous_rows)
    write_csv(BY_PARCEL_OUTPUT, by_parcel_summary)
    write_csv(BY_YEAR_OUTPUT, by_year_summary)
    write_csv(BY_ZONING_OUTPUT, by_zoning_summary)

    validation = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "permit_table": PERMIT_TABLE,
            "parcel_table": PARCEL_TABLE,
            "zoning_table": ZONING_TABLE,
            "zoning_qa_table": ZONING_QA_TABLE,
            "relationship_table": RELATIONSHIP_TABLE,
        },
        "match_summary": {
            "total_permit_records": total_permits,
            "relationship_row_count": relationship_rows,
            "permits_matched_to_parcels": matched_permits,
            "permits_unmatched": unmatched_permits,
            "multiple_parcel_match_permit_count": multiple_match_permits,
            "match_rate_pct": round(matched_permits * 100.0 / total_permits, 4)
            if total_permits
            else 0,
            "unmatched_rate_pct": round(unmatched_permits * 100.0 / total_permits, 4)
            if total_permits
            else 0,
        },
        "method_counts": {
            "exact_match_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE relationship_method = 'exact_pin14'",
                )
            ),
            "normalized_match_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE relationship_method = 'normalized_pin14'",
                )
            ),
            "no_match_count": unmatched_permits,
        },
        "relationship_confidence_distribution": distribution(
            engine,
            "relationship_confidence",
            "relationship_confidence",
        ),
        "relationship_method_distribution": distribution(
            engine,
            "relationship_method",
            "relationship_method",
        ),
        "duplicate_parcel_permit_counts": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) AS parcels_with_multiple_permits,
              MAX(permit_count) AS max_permits_on_single_parcel,
              ROUND(AVG(permit_count)::numeric, 4) AS avg_permits_per_multi_permit_parcel
            FROM (
              SELECT official_parcel_id, COUNT(DISTINCT permit_id) AS permit_count
              FROM {RELATIONSHIP_TABLE}
              WHERE has_parcel_match
              GROUP BY official_parcel_id
              HAVING COUNT(DISTINCT permit_id) > 1
            ) multi_permit_parcels
            """,
        )[0],
        "top_parcels_by_permit_count": get_top_parcels(engine),
        "permits_by_year_month": by_year_summary,
        "top_permit_types": top_permit_dimension(
            engine,
            "permit_type_normalized",
            "permit_type",
        ),
        "top_work_types": top_permit_dimension(
            engine,
            "work_type_normalized",
            "work_type",
        ),
        "top_permit_statuses": top_permit_dimension(
            engine,
            "permit_status_normalized",
            "permit_status",
        ),
        "permits_by_zoning_jurisdiction": top_permit_dimension(
            engine,
            "zoning_jurisdiction_name",
            "zoning_jurisdiction_name",
        ),
        "permits_by_zoning_category": top_permit_dimension(
            engine,
            "dominant_zoning_general_normalized",
            "dominant_zoning_general_normalized",
        ),
        "co_date_outlier_summary": {
            "relationship_rows_with_future_co_date": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {RELATIONSHIP_TABLE} WHERE co_date_future_outlier",
                )
            ),
            "distinct_permits_with_future_co_date": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT permit_id) FROM {RELATIONSHIP_TABLE} WHERE co_date_future_outlier",
                )
            ),
        },
        "sample_no_match_records": no_match_rows[:25],
        "sample_ambiguous_records": ambiguous_rows[:25],
        "index_summary": get_index_summary(engine),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "relationship_summary_csv": str(SUMMARY_OUTPUT),
            "no_match_csv": str(NO_MATCH_OUTPUT),
            "ambiguous_csv": str(AMBIGUOUS_OUTPUT),
            "by_parcel_summary_csv": str(BY_PARCEL_OUTPUT),
            "by_year_summary_csv": str(BY_YEAR_OUTPUT),
            "by_zoning_summary_csv": str(BY_ZONING_OUTPUT),
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
    logging.info("Starting Real Property Permit-to-Parcel relationship build.")

    try:
        engine = create_engine_from_env()
        verify_database(engine, args.skip_relationship)

        if args.skip_relationship:
            logging.warning("Skipping relationship SQL because --skip-relationship was supplied.")
        else:
            execute_relationship_sql(engine)

        validation = validate_relationship(engine, started_at, log_path)
        write_validation(validation)
        engine.dispose()

        match_summary = validation["match_summary"]
        logging.info("Total permit records: %s", match_summary["total_permit_records"])
        logging.info("Permits matched: %s", match_summary["permits_matched_to_parcels"])
        logging.info("Permits unmatched: %s", match_summary["permits_unmatched"])
        logging.info(
            "Multiple parcel match permit count: %s",
            match_summary["multiple_parcel_match_permit_count"],
        )
        logging.info(
            "Relationship confidence distribution: %s",
            validation["relationship_confidence_distribution"],
        )
        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        return 0
    except Exception:
        logging.exception("Real Property Permit-to-Parcel relationship build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
