"""Run QA and governance readiness checks for parcel_zoning_overlay_v2.

This pass creates public.parcel_zoning_intelligence_qa and writes governance
outputs for future backend/API planning. It does not modify the frontend
dashboard, connect APIs, ingest more layers, hide ambiguity, or force zoning
equivalency across jurisdictions.
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
V2_OVERLAY_TABLE = "public.parcel_zoning_overlay_v2"
QA_TABLE = "public.parcel_zoning_intelligence_qa"
V1_OVERLAY_TABLE = "public.parcel_zoning_overlay"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "qa_parcel_zoning_overlay_v2.sql"

SUMMARY_OUTPUT = OUTPUT_DIR / "parcel_zoning_intelligence_qa_summary.json"
WARNINGS_OUTPUT = OUTPUT_DIR / "parcel_zoning_governance_warnings.csv"
JURISDICTION_OUTPUT = OUTPUT_DIR / "parcel_zoning_by_jurisdiction_summary.csv"
HOTSPOTS_OUTPUT = OUTPUT_DIR / "parcel_zoning_ambiguity_hotspots.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_zoning_intelligence_qa.",
    )
    parser.add_argument(
        "--skip-qa-table",
        action="store_true",
        help="Only run report generation against an existing QA table.",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=50,
        help="Number of example rows to include in the JSON summary.",
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
    log_path = LOG_DIR / f"qa_parcel_zoning_overlay_v2_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before running zoning QA."
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


def verify_database(engine: Engine, skip_qa_table: bool) -> dict[str, bool]:
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
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. Confirm PostgreSQL "
            "is listening on localhost:5433, cfs_dev exists, PostGIS is enabled, "
            "and CFS_POSTGRES_PASSWORD is correct."
        ) from error

    existence = {
        "parcel_zoning_overlay_v2": table_exists(engine, V2_OVERLAY_TABLE),
        "parcel_zoning_intelligence_qa": table_exists(engine, QA_TABLE),
        "parcel_zoning_overlay_v1": table_exists(engine, V1_OVERLAY_TABLE),
    }

    if not existence["parcel_zoning_overlay_v2"]:
        raise RuntimeError("Source table public.parcel_zoning_overlay_v2 does not exist.")
    if skip_qa_table and not existence["parcel_zoning_intelligence_qa"]:
        raise RuntimeError(
            "--skip-qa-table was supplied, but public.parcel_zoning_intelligence_qa does not exist."
        )

    return existence


def execute_qa_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"QA SQL file not found: {SQL_FILE}")

    logging.info("Executing QA SQL: %s", SQL_FILE)
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


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def get_count_summary(engine: Engine, has_v1: bool) -> dict[str, Any]:
    summary = fetch_rows(
        engine,
        f"""
        SELECT
          COUNT(*) AS total_parcels,
          COUNT(*) FILTER (WHERE NOT has_no_zoning_match) AS assigned_parcels,
          COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_parcels,
          COUNT(*) FILTER (WHERE safe_for_dashboard) AS safe_for_dashboard_parcels,
          COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels,
          ROUND(COUNT(*) FILTER (WHERE safe_for_dashboard) * 100.0 / NULLIF(COUNT(*), 0), 4)
            AS safe_for_dashboard_percentage,
          ROUND(COUNT(*) FILTER (WHERE needs_governance_review) * 100.0 / NULLIF(COUNT(*), 0), 4)
            AS review_percentage,
          COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_parcels,
          COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions)
            AS multi_jurisdiction_parcels,
          COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS sliver_overlap_parcels,
          COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split) AS near_tie_parcels,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_confidence_parcels
        FROM {QA_TABLE}
        """,
    )[0]

    if has_v1:
        v1 = fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE NOT has_no_zoning_match) AS v1_assigned_parcels,
              COUNT(*) FILTER (WHERE has_no_zoning_match) AS v1_no_match_parcels
            FROM {V1_OVERLAY_TABLE}
            """,
        )[0]
        summary.update(v1)
        summary["v2_assignment_improvement"] = (
            summary["assigned_parcels"] - summary["v1_assigned_parcels"]
        )
        summary["v2_no_match_reduction"] = (
            summary["v1_no_match_parcels"] - summary["no_match_parcels"]
        )
    else:
        summary.update(
            {
                "v1_assigned_parcels": None,
                "v1_no_match_parcels": None,
                "v2_assignment_improvement": None,
                "v2_no_match_reduction": None,
            }
        )

    return summary


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS parcel_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {QA_TABLE}), 0), 4)
            AS parcel_percentage
        FROM {QA_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, value
        """,
    )


def get_warning_category_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          warning_category,
          COUNT(*) AS parcel_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {QA_TABLE}), 0), 4)
            AS parcel_percentage
        FROM {QA_TABLE}
        CROSS JOIN LATERAL unnest(governance_warning_categories) AS warning_category
        GROUP BY warning_category
        ORDER BY parcel_count DESC, warning_category
        """,
    )


def get_jurisdiction_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(no match)') AS zoning_jurisdiction_name,
          COUNT(*) AS total_parcels,
          COUNT(*) FILTER (WHERE NOT has_no_zoning_match) AS assigned_parcels,
          COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_parcels,
          COUNT(*) FILTER (WHERE safe_for_dashboard) AS safe_for_dashboard_parcels,
          COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_confidence_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions) AS multi_jurisdiction_count,
          COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS sliver_overlap_count,
          COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split) AS near_tie_count,
          COUNT(*) FILTER (
            WHERE 'jurisdiction_code_semantics_review' = ANY(governance_warning_categories)
          ) AS jurisdiction_code_semantics_review_count,
          ROUND(AVG(dominant_overlap_pct)::numeric, 6) AS avg_dominant_overlap_pct,
          ROUND(MIN(dominant_overlap_pct)::numeric, 6) AS min_dominant_overlap_pct,
          ROUND(MAX(dominant_overlap_pct)::numeric, 6) AS max_dominant_overlap_pct
        FROM {QA_TABLE}
        GROUP BY COALESCE(zoning_jurisdiction_name, '(no match)')
        ORDER BY total_parcels DESC, zoning_jurisdiction_name
        """,
    )


def get_zoning_code_distribution_by_jurisdiction(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(no match)') AS zoning_jurisdiction_name,
          COALESCE(dominant_zoning_code_raw, '(no match)') AS dominant_zoning_code_raw,
          COALESCE(dominant_zoning_general_normalized, '(no match)')
            AS dominant_zoning_general_normalized,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE safe_for_dashboard) AS safe_for_dashboard_parcels,
          COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_confidence_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions) AS multi_jurisdiction_count,
          COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS sliver_overlap_count,
          COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split) AS near_tie_count
        FROM {QA_TABLE}
        GROUP BY
          COALESCE(zoning_jurisdiction_name, '(no match)'),
          COALESCE(dominant_zoning_code_raw, '(no match)'),
          COALESCE(dominant_zoning_general_normalized, '(no match)')
        ORDER BY parcel_count DESC, zoning_jurisdiction_name, dominant_zoning_code_raw
        """,
    )


def get_warning_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          nbh_name,
          subdiv_name,
          zoning_jurisdiction_name,
          planning_jurisdiction_name,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          zoning_assignment_confidence,
          zoning_join_status,
          primary_governance_warning,
          array_to_string(governance_warning_categories, '|') AS governance_warning_categories,
          governance_warning_count,
          has_multiple_zoning,
          has_multiple_zoning_jurisdictions,
          has_nearly_equal_overlap_split,
          has_tiny_sliver_overlap,
          tiny_sliver_overlap_count,
          has_no_zoning_match,
          ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
          second_zoning_jurisdiction_name,
          second_zoning_code_raw,
          ROUND(second_overlap_pct::numeric, 6) AS second_overlap_pct,
          ROUND(top_two_overlap_pct_gap::numeric, 6) AS top_two_overlap_pct_gap,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {QA_TABLE}
        WHERE needs_governance_review
        ORDER BY
          CASE primary_governance_warning
            WHEN 'no_zoning_match' THEN 1
            WHEN 'review_low_confidence' THEN 2
            WHEN 'review_multi_jurisdiction' THEN 3
            WHEN 'review_near_tie' THEN 4
            WHEN 'review_sliver_overlap' THEN 5
            WHEN 'jurisdiction_code_semantics_review' THEN 6
            ELSE 7
          END,
          governance_warning_count DESC,
          zoning_jurisdiction_name,
          official_parcel_id
        """,
    )


def get_ambiguity_hotspots(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        WITH hotspot_rows AS (
          SELECT
            'neighborhood' AS hotspot_type,
            COALESCE(NULLIF(btrim(nbh_name), ''), '(unknown)') AS hotspot_name,
            COUNT(*) AS total_parcels,
            COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels,
            COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_confidence_count,
            COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_count,
            COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions) AS multi_jurisdiction_count,
            COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS sliver_overlap_count,
            COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split) AS near_tie_count,
            COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_count,
            COUNT(*) FILTER (
              WHERE 'jurisdiction_code_semantics_review' = ANY(governance_warning_categories)
            ) AS jurisdiction_code_semantics_review_count
          FROM {QA_TABLE}
          GROUP BY COALESCE(NULLIF(btrim(nbh_name), ''), '(unknown)')

          UNION ALL

          SELECT
            'subdivision' AS hotspot_type,
            COALESCE(NULLIF(btrim(subdiv_name), ''), '(unknown)') AS hotspot_name,
            COUNT(*) AS total_parcels,
            COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels,
            COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_confidence_count,
            COUNT(*) FILTER (WHERE has_multiple_zoning) AS multi_zoning_count,
            COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions) AS multi_jurisdiction_count,
            COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS sliver_overlap_count,
            COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split) AS near_tie_count,
            COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_count,
            COUNT(*) FILTER (
              WHERE 'jurisdiction_code_semantics_review' = ANY(governance_warning_categories)
            ) AS jurisdiction_code_semantics_review_count
          FROM {QA_TABLE}
          GROUP BY COALESCE(NULLIF(btrim(subdiv_name), ''), '(unknown)')
        )
        SELECT
          *,
          ROUND(review_parcels * 100.0 / NULLIF(total_parcels, 0), 4) AS review_percentage
        FROM hotspot_rows
        WHERE review_parcels > 0
        ORDER BY review_parcels DESC, review_percentage DESC, hotspot_type, hotspot_name
        LIMIT 150
        """,
    )


def get_no_match_examples(engine: Engine, sample_limit: int) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          parcel_quality_status,
          nbh_name,
          subdiv_name,
          planning_jurisdiction_name,
          planning_boundary_type,
          primary_governance_warning,
          array_to_string(governance_warning_categories, '|') AS governance_warning_categories,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {QA_TABLE}
        WHERE has_no_zoning_match
        ORDER BY parcel_area_acres_calc DESC NULLS LAST, official_parcel_id
        LIMIT :sample_limit
        """,
        {"sample_limit": sample_limit},
    )


def get_code_semantics_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(no match)') AS zoning_jurisdiction_name,
          COALESCE(dominant_zoning_code_raw, '(missing)') AS dominant_zoning_code_raw,
          COALESCE(dominant_zoning_label_normalized, '(missing)') AS dominant_zoning_label_normalized,
          COALESCE(dominant_zoning_general_normalized, '(missing)')
            AS dominant_zoning_general_normalized,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE safe_for_dashboard) AS safe_for_dashboard_parcels,
          COUNT(*) FILTER (WHERE needs_governance_review) AS review_parcels
        FROM {QA_TABLE}
        WHERE 'jurisdiction_code_semantics_review' = ANY(governance_warning_categories)
        GROUP BY
          COALESCE(zoning_jurisdiction_name, '(no match)'),
          COALESCE(dominant_zoning_code_raw, '(missing)'),
          COALESCE(dominant_zoning_label_normalized, '(missing)'),
          COALESCE(dominant_zoning_general_normalized, '(missing)')
        ORDER BY parcel_count DESC, zoning_jurisdiction_name, dominant_zoning_code_raw
        LIMIT 100
        """,
    )


def get_geometry_summary(engine: Engine) -> dict[str, Any]:
    return {
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {QA_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {QA_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {QA_TABLE} WHERE NOT ST_IsValid(geometry)",
            )
        ),
    }


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'parcel_zoning_intelligence_qa'
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


def write_summary(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def run_reports(
    engine: Engine,
    has_v1: bool,
    sample_limit: int,
    start_time: float,
    log_path: Path,
) -> dict[str, Any]:
    governance_warnings = get_warning_rows(engine)
    jurisdiction_summary = get_jurisdiction_summary(engine)
    ambiguity_hotspots = get_ambiguity_hotspots(engine)
    code_distribution = get_zoning_code_distribution_by_jurisdiction(engine)
    duration_seconds = round(time.perf_counter() - start_time, 2)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "v2_overlay_table": V2_OVERLAY_TABLE,
            "qa_table": QA_TABLE,
        },
        "count_summary": get_count_summary(engine, has_v1),
        "confidence_distribution": get_distribution(
            engine,
            "zoning_assignment_confidence",
        ),
        "primary_governance_warning_distribution": get_distribution(
            engine,
            "primary_governance_warning",
        ),
        "governance_warning_category_distribution": (
            get_warning_category_distribution(engine)
        ),
        "zoning_jurisdiction_distribution": jurisdiction_summary,
        "zoning_code_distribution_by_jurisdiction": code_distribution[:250],
        "low_confidence_by_jurisdiction": [
            row for row in jurisdiction_summary if row["low_confidence_count"] > 0
        ],
        "multi_zoning_by_jurisdiction": [
            row for row in jurisdiction_summary if row["multi_zoning_count"] > 0
        ],
        "multi_jurisdiction_by_jurisdiction": [
            row for row in jurisdiction_summary if row["multi_jurisdiction_count"] > 0
        ],
        "sliver_overlap_by_jurisdiction": [
            row for row in jurisdiction_summary if row["sliver_overlap_count"] > 0
        ],
        "near_tie_by_jurisdiction": [
            row for row in jurisdiction_summary if row["near_tie_count"] > 0
        ],
        "no_match_examples": get_no_match_examples(engine, sample_limit),
        "top_ambiguity_hotspots": ambiguity_hotspots[:50],
        "jurisdiction_code_semantics_review_top_codes": (
            get_code_semantics_summary(engine)
        ),
        "geometry_summary": get_geometry_summary(engine),
        "index_summary": get_index_summary(engine),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "qa_summary_json": str(SUMMARY_OUTPUT),
            "governance_warnings_csv": str(WARNINGS_OUTPUT),
            "jurisdiction_summary_csv": str(JURISDICTION_OUTPUT),
            "ambiguity_hotspots_csv": str(HOTSPOTS_OUTPUT),
        },
    }

    write_summary(summary)
    write_csv(WARNINGS_OUTPUT, governance_warnings)
    write_csv(JURISDICTION_OUTPUT, jurisdiction_summary)
    write_csv(HOTSPOTS_OUTPUT, ambiguity_hotspots)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcel zoning intelligence QA.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        existence = verify_database(engine, args.skip_qa_table)

        if args.skip_qa_table:
            logging.warning("Skipping QA table SQL because --skip-qa-table was supplied.")
        else:
            execute_qa_sql(engine)

        summary = run_reports(
            engine,
            existence["parcel_zoning_overlay_v1"],
            args.sample_limit,
            start_time,
            log_path,
        )
        engine.dispose()

        counts = summary["count_summary"]
        logging.info("Total parcels: %s", counts["total_parcels"])
        logging.info("Safe-for-dashboard parcels: %s", counts["safe_for_dashboard_parcels"])
        logging.info("Review parcels: %s", counts["review_parcels"])
        logging.info("No-match parcels: %s", counts["no_match_parcels"])
        logging.info(
            "Most common warning categories: %s",
            summary["governance_warning_category_distribution"][:5],
        )
        logging.info("Wrote QA summary JSON: %s", SUMMARY_OUTPUT)
        logging.info("Wrote governance warnings CSV: %s", WARNINGS_OUTPUT)
        logging.info("Wrote jurisdiction summary CSV: %s", JURISDICTION_OUTPUT)
        logging.info("Wrote ambiguity hotspots CSV: %s", HOTSPOTS_OUTPUT)
        logging.info("QA duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS parcel zoning intelligence QA failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
