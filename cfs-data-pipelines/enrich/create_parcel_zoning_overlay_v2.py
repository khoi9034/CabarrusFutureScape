"""Create and validate the CFS multi-source parcel zoning overlay v2.

This local-development enrichment step reads public.parcels_enriched and
public.zoning_jurisdictional_clean, joins optional planning context from
public.parcel_jurisdiction_overlay, creates public.parcel_zoning_overlay_v2,
and compares it with the county-only public.parcel_zoning_overlay v1.

It intentionally does not modify the frontend dashboard, connect APIs, ingest
more layers, force zoning equivalency, or hardcode county zoning dominance.
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
PARCEL_TABLE = "public.parcels_enriched"
ZONING_TABLE = "public.zoning_jurisdictional_clean"
PLANNING_CONTEXT_TABLE = "public.parcel_jurisdiction_overlay"
V1_OVERLAY_TABLE = "public.parcel_zoning_overlay"
V2_OVERLAY_TABLE = "public.parcel_zoning_overlay_v2"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_zoning_overlay_v2.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "parcel_zoning_overlay_v2_validation.json"
SUMMARY_OUTPUT = OUTPUT_DIR / "parcel_zoning_overlay_v2_summary.csv"
NO_MATCH_OUTPUT = OUTPUT_DIR / "parcel_zoning_overlay_v2_no_match.csv"
LOW_CONFIDENCE_OUTPUT = OUTPUT_DIR / "parcel_zoning_overlay_v2_low_confidence.csv"
MULTI_JURISDICTION_OUTPUT = (
    OUTPUT_DIR / "parcel_zoning_overlay_v2_multi_jurisdiction.csv"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_zoning_overlay_v2.",
    )
    parser.add_argument(
        "--skip-overlay",
        action="store_true",
        help="Only run validation against an existing parcel_zoning_overlay_v2 table.",
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
    log_path = LOG_DIR / f"create_parcel_zoning_overlay_v2_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating "
            "parcel_zoning_overlay_v2."
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


def verify_database(engine: Engine, skip_overlay: bool) -> dict[str, bool]:
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
        "parcels_enriched": table_exists(engine, PARCEL_TABLE),
        "zoning_jurisdictional_clean": table_exists(engine, ZONING_TABLE),
        "parcel_jurisdiction_overlay": table_exists(engine, PLANNING_CONTEXT_TABLE),
        "parcel_zoning_overlay_v1": table_exists(engine, V1_OVERLAY_TABLE),
        "parcel_zoning_overlay_v2": table_exists(engine, V2_OVERLAY_TABLE),
    }

    if not existence["parcels_enriched"]:
        raise RuntimeError("Source table public.parcels_enriched does not exist.")
    if not existence["zoning_jurisdictional_clean"]:
        raise RuntimeError("Source table public.zoning_jurisdictional_clean does not exist.")
    if not existence["parcel_jurisdiction_overlay"]:
        raise RuntimeError("Supporting table public.parcel_jurisdiction_overlay does not exist.")
    if skip_overlay and not existence["parcel_zoning_overlay_v2"]:
        raise RuntimeError(
            "--skip-overlay was supplied, but public.parcel_zoning_overlay_v2 does not exist."
        )

    if not existence["parcel_zoning_overlay_v1"]:
        logging.warning(
            "County-only public.parcel_zoning_overlay v1 was not found; "
            "v1/v2 comparison fields will be null."
        )

    return existence


def execute_overlay_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Overlay SQL file not found: {SQL_FILE}")

    logging.info("Executing overlay SQL: %s", SQL_FILE)
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


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS parcel_count,
          ROUND((COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {V2_OVERLAY_TABLE}), 0))::numeric, 4)
            AS parcel_percentage
        FROM {V2_OVERLAY_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, value
        """,
    )


def get_v1_v2_comparison(engine: Engine, has_v1: bool) -> dict[str, Any]:
    total_parcels = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_TABLE}"))
    v2_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {V2_OVERLAY_TABLE}"))
    v2_assigned = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {V2_OVERLAY_TABLE} WHERE NOT has_no_zoning_match",
        )
    )
    v2_no_match = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {V2_OVERLAY_TABLE} WHERE has_no_zoning_match",
        )
    )
    v2_multi_zone = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {V2_OVERLAY_TABLE} WHERE has_multiple_zoning",
        )
    )
    v2_multi_jurisdiction = int(
        fetch_scalar(
            engine,
            f"""
            SELECT COUNT(*)
            FROM {V2_OVERLAY_TABLE}
            WHERE has_multiple_zoning_jurisdictions
            """,
        )
    )

    if has_v1:
        v1_assigned = int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {V1_OVERLAY_TABLE} WHERE NOT has_no_zoning_match",
            )
        )
        v1_no_match = int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {V1_OVERLAY_TABLE} WHERE has_no_zoning_match",
            )
        )
    else:
        v1_assigned = None
        v1_no_match = None

    return {
        "total_parcels": total_parcels,
        "v2_overlay_row_count": v2_count,
        "row_count_delta": v2_count - total_parcels,
        "row_counts_match": v2_count == total_parcels,
        "v1_assigned_count": v1_assigned,
        "v2_assigned_count": v2_assigned,
        "assignment_improvement": (
            None if v1_assigned is None else v2_assigned - v1_assigned
        ),
        "v1_no_match_count": v1_no_match,
        "v2_no_match_count": v2_no_match,
        "no_match_reduction": None if v1_no_match is None else v1_no_match - v2_no_match,
        "v2_multiple_zoning_count": v2_multi_zone,
        "v2_multiple_zoning_jurisdiction_count": v2_multi_jurisdiction,
    }


def get_zoning_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(no match)') AS zoning_jurisdiction_name,
          COALESCE(dominant_zoning_code_raw, '(no match)') AS dominant_zoning_code_raw,
          COALESCE(dominant_zoning_general_normalized, '(no match)')
            AS dominant_zoning_general_normalized,
          COALESCE(dominant_zoning_label_normalized, '(no match)')
            AS dominant_zoning_label_normalized,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning) AS multiple_zoning_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions)
            AS multiple_zoning_jurisdiction_count,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low')
            AS low_confidence_count,
          COUNT(*) FILTER (WHERE has_no_zoning_match) AS no_match_count,
          COUNT(*) FILTER (WHERE municipal_zoning_dominates_county_overlap)
            AS municipal_dominates_county_count,
          COUNT(*) FILTER (WHERE has_nearly_equal_overlap_split)
            AS nearly_equal_split_count,
          COUNT(*) FILTER (WHERE has_tiny_sliver_overlap) AS tiny_sliver_count,
          ROUND(AVG(dominant_overlap_pct)::numeric, 6) AS avg_dominant_overlap_pct,
          ROUND(MIN(dominant_overlap_pct)::numeric, 6) AS min_dominant_overlap_pct,
          ROUND(MAX(dominant_overlap_pct)::numeric, 6) AS max_dominant_overlap_pct
        FROM {V2_OVERLAY_TABLE}
        GROUP BY
          COALESCE(zoning_jurisdiction_name, '(no match)'),
          COALESCE(dominant_zoning_code_raw, '(no match)'),
          COALESCE(dominant_zoning_general_normalized, '(no match)'),
          COALESCE(dominant_zoning_label_normalized, '(no match)')
        ORDER BY parcel_count DESC,
                 zoning_jurisdiction_name,
                 dominant_zoning_code_raw
        """,
    )


def get_jurisdiction_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(zoning_jurisdiction_name, '(no match)') AS zoning_jurisdiction_name,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'high') AS high_count,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'medium') AS medium_count,
          COUNT(*) FILTER (WHERE zoning_assignment_confidence = 'low') AS low_count,
          COUNT(*) FILTER (WHERE has_multiple_zoning_jurisdictions)
            AS multiple_zoning_jurisdiction_count,
          ROUND(AVG(dominant_overlap_pct)::numeric, 6) AS avg_dominant_overlap_pct
        FROM {V2_OVERLAY_TABLE}
        GROUP BY COALESCE(zoning_jurisdiction_name, '(no match)')
        ORDER BY parcel_count DESC, zoning_jurisdiction_name
        """,
    )


def get_top_zoning_codes(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(dominant_zoning_code_raw, '(no match)') AS dominant_zoning_code_raw,
          COALESCE(dominant_zoning_general_normalized, '(no match)')
            AS dominant_zoning_general_normalized,
          COUNT(*) AS parcel_count
        FROM {V2_OVERLAY_TABLE}
        GROUP BY
          COALESCE(dominant_zoning_code_raw, '(no match)'),
          COALESCE(dominant_zoning_general_normalized, '(no match)')
        ORDER BY parcel_count DESC, dominant_zoning_code_raw
        LIMIT 30
        """,
    )


def get_no_match_rows(engine: Engine) -> list[dict[str, Any]]:
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
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc,
          zoning_join_status
        FROM {V2_OVERLAY_TABLE}
        WHERE has_no_zoning_match
        ORDER BY parcel_area_acres_calc DESC NULLS LAST, official_parcel_id
        """,
    )


def get_low_confidence_rows(engine: Engine) -> list[dict[str, Any]]:
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
          planning_boundary_type,
          dominant_zoning_code_raw,
          dominant_zoning_general_normalized,
          dominant_zoning_label_normalized,
          zoning_overlap_count,
          zoning_jurisdiction_overlap_count,
          ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
          ROUND(total_zoning_overlap_pct::numeric, 6) AS total_zoning_overlap_pct,
          second_zoning_jurisdiction_name,
          second_zoning_code_raw,
          ROUND(second_overlap_pct::numeric, 6) AS second_overlap_pct,
          ROUND(top_two_overlap_pct_gap::numeric, 6) AS top_two_overlap_pct_gap,
          zoning_assignment_confidence,
          zoning_join_status,
          has_multiple_zoning,
          has_multiple_zoning_jurisdictions,
          tiny_sliver_overlap_count,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {V2_OVERLAY_TABLE}
        WHERE zoning_assignment_confidence = 'low'
        ORDER BY dominant_overlap_pct NULLS LAST,
                 zoning_jurisdiction_overlap_count DESC,
                 zoning_overlap_count DESC,
                 official_parcel_id
        """,
    )


def get_multi_jurisdiction_rows(engine: Engine) -> list[dict[str, Any]]:
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
          zoning_overlap_count,
          zoning_jurisdiction_overlap_count,
          ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
          second_zoning_jurisdiction_name,
          second_zoning_code_raw,
          ROUND(second_overlap_pct::numeric, 6) AS second_overlap_pct,
          ROUND(top_two_overlap_pct_gap::numeric, 6) AS top_two_overlap_pct_gap,
          zoning_assignment_confidence,
          zoning_join_status,
          municipal_zoning_dominates_county_overlap,
          has_nearly_equal_overlap_split,
          tiny_sliver_overlap_count,
          ROUND(parcel_area_acres_calc::numeric, 6) AS parcel_area_acres_calc
        FROM {V2_OVERLAY_TABLE}
        WHERE has_multiple_zoning_jurisdictions
        ORDER BY top_two_overlap_pct_gap NULLS LAST,
                 dominant_overlap_pct,
                 official_parcel_id
        """,
    )


def get_no_match_clusters(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(NULLIF(btrim({column_name}), ''), '(unknown)') AS cluster_name,
          COUNT(*) AS parcel_count
        FROM {V2_OVERLAY_TABLE}
        WHERE has_no_zoning_match
        GROUP BY COALESCE(NULLIF(btrim({column_name}), ''), '(unknown)')
        ORDER BY parcel_count DESC, cluster_name
        LIMIT 30
        """,
    )


def get_overlap_edge_case_summary(engine: Engine) -> dict[str, Any]:
    return {
        "municipal_zoning_dominates_county_overlap_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM {V2_OVERLAY_TABLE}
                WHERE municipal_zoning_dominates_county_overlap
                """,
            )
        ),
        "nearly_equal_overlap_split_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM {V2_OVERLAY_TABLE}
                WHERE has_nearly_equal_overlap_split
                """,
            )
        ),
        "tiny_sliver_overlap_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM {V2_OVERLAY_TABLE}
                WHERE has_tiny_sliver_overlap
                """,
            )
        ),
        "assigned_with_tiny_sliver_overlap_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM {V2_OVERLAY_TABLE}
                WHERE has_tiny_sliver_overlap
                  AND NOT has_no_zoning_match
                """,
            )
        ),
        "low_confidence_multi_jurisdiction_count": int(
            fetch_scalar(
                engine,
                f"""
                SELECT COUNT(*)
                FROM {V2_OVERLAY_TABLE}
                WHERE has_multiple_zoning_jurisdictions
                  AND zoning_assignment_confidence = 'low'
                """,
            )
        ),
        "municipal_dominates_county_examples": fetch_rows(
            engine,
            f"""
            SELECT
              official_parcel_id,
              objectid_1,
              pin14,
              zoning_jurisdiction_name,
              dominant_zoning_code_raw,
              ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
              ROUND(county_max_overlap_pct::numeric, 6) AS county_max_overlap_pct,
              ROUND(municipal_max_overlap_pct::numeric, 6) AS municipal_max_overlap_pct,
              second_zoning_jurisdiction_name,
              second_zoning_code_raw,
              ROUND(second_overlap_pct::numeric, 6) AS second_overlap_pct,
              zoning_assignment_confidence
            FROM {V2_OVERLAY_TABLE}
            WHERE municipal_zoning_dominates_county_overlap
            ORDER BY dominant_overlap_pct DESC, official_parcel_id
            LIMIT 25
            """,
        ),
        "nearly_equal_overlap_split_examples": fetch_rows(
            engine,
            f"""
            SELECT
              official_parcel_id,
              objectid_1,
              pin14,
              zoning_jurisdiction_name,
              dominant_zoning_code_raw,
              ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
              second_zoning_jurisdiction_name,
              second_zoning_code_raw,
              ROUND(second_overlap_pct::numeric, 6) AS second_overlap_pct,
              ROUND(top_two_overlap_pct_gap::numeric, 6) AS top_two_overlap_pct_gap,
              zoning_assignment_confidence,
              zoning_join_status
            FROM {V2_OVERLAY_TABLE}
            WHERE has_nearly_equal_overlap_split
            ORDER BY top_two_overlap_pct_gap, official_parcel_id
            LIMIT 25
            """,
        ),
        "tiny_sliver_overlap_examples": fetch_rows(
            engine,
            f"""
            SELECT
              official_parcel_id,
              objectid_1,
              pin14,
              zoning_jurisdiction_name,
              dominant_zoning_code_raw,
              zoning_overlap_count,
              zoning_jurisdiction_overlap_count,
              tiny_sliver_overlap_count,
              ROUND(dominant_overlap_pct::numeric, 6) AS dominant_overlap_pct,
              zoning_assignment_confidence,
              zoning_join_status
            FROM {V2_OVERLAY_TABLE}
            WHERE has_tiny_sliver_overlap
            ORDER BY tiny_sliver_overlap_count DESC,
                     zoning_jurisdiction_overlap_count DESC,
                     official_parcel_id
            LIMIT 25
            """,
        ),
    }


def get_geometry_summary(engine: Engine) -> dict[str, Any]:
    return {
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {V2_OVERLAY_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {V2_OVERLAY_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {V2_OVERLAY_TABLE} WHERE NOT ST_IsValid(geometry)",
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
          AND tablename = 'parcel_zoning_overlay_v2'
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
    VALIDATION_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def run_validation(
    engine: Engine,
    has_v1: bool,
    start_time: float,
    log_path: Path,
) -> dict[str, Any]:
    zoning_summary = get_zoning_summary(engine)
    no_match_rows = get_no_match_rows(engine)
    low_confidence_rows = get_low_confidence_rows(engine)
    multi_jurisdiction_rows = get_multi_jurisdiction_rows(engine)
    duration_seconds = round(time.perf_counter() - start_time, 2)

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "host": DEFAULT_DB_HOST,
            "port": DEFAULT_DB_PORT,
            "database": DEFAULT_DB_NAME,
            "parcel_table": PARCEL_TABLE,
            "zoning_table": ZONING_TABLE,
            "planning_context_table": PLANNING_CONTEXT_TABLE,
            "v1_overlay_table": V1_OVERLAY_TABLE,
            "v2_overlay_table": V2_OVERLAY_TABLE,
        },
        "v1_v2_comparison": get_v1_v2_comparison(engine, has_v1),
        "confidence_distribution": get_distribution(
            engine,
            "zoning_assignment_confidence",
        ),
        "join_status_distribution": get_distribution(engine, "zoning_join_status"),
        "assigned_parcels_by_zoning_jurisdiction": get_jurisdiction_distribution(engine),
        "top_zoning_codes_and_classes": get_top_zoning_codes(engine),
        "zoning_summary": zoning_summary,
        "top_no_match_neighborhoods": get_no_match_clusters(engine, "nbh_name"),
        "top_no_match_subdivisions": get_no_match_clusters(engine, "subdiv_name"),
        "overlap_edge_case_summary": get_overlap_edge_case_summary(engine),
        "sample_low_confidence_records": low_confidence_rows[:25],
        "sample_no_match_records": no_match_rows[:25],
        "sample_multi_jurisdiction_records": multi_jurisdiction_rows[:25],
        "geometry_summary": get_geometry_summary(engine),
        "index_summary": get_index_summary(engine),
        "duration_seconds": duration_seconds,
        "log_path": str(log_path),
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "summary_csv": str(SUMMARY_OUTPUT),
            "no_match_csv": str(NO_MATCH_OUTPUT),
            "low_confidence_csv": str(LOW_CONFIDENCE_OUTPUT),
            "multi_jurisdiction_csv": str(MULTI_JURISDICTION_OUTPUT),
        },
    }

    write_summary(summary)
    write_csv(SUMMARY_OUTPUT, zoning_summary)
    write_csv(NO_MATCH_OUTPUT, no_match_rows)
    write_csv(LOW_CONFIDENCE_OUTPUT, low_confidence_rows)
    write_csv(MULTI_JURISDICTION_OUTPUT, multi_jurisdiction_rows)
    return summary


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcel_zoning_overlay_v2 build.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        existence = verify_database(engine, args.skip_overlay)

        if args.skip_overlay:
            logging.warning("Skipping overlay SQL because --skip-overlay was supplied.")
        else:
            execute_overlay_sql(engine)

        summary = run_validation(
            engine,
            existence["parcel_zoning_overlay_v1"],
            start_time,
            log_path,
        )
        engine.dispose()

        comparison = summary["v1_v2_comparison"]
        logging.info("Total parcels: %s", comparison["total_parcels"])
        logging.info(
            "V1 assigned/no-match: %s/%s",
            comparison["v1_assigned_count"],
            comparison["v1_no_match_count"],
        )
        logging.info(
            "V2 assigned/no-match: %s/%s",
            comparison["v2_assigned_count"],
            comparison["v2_no_match_count"],
        )
        logging.info(
            "Assignment improvement/no-match reduction: %s/%s",
            comparison["assignment_improvement"],
            comparison["no_match_reduction"],
        )
        logging.info(
            "V2 multi zoning/multi jurisdiction: %s/%s",
            comparison["v2_multiple_zoning_count"],
            comparison["v2_multiple_zoning_jurisdiction_count"],
        )
        logging.info(
            "Confidence distribution: %s",
            summary["confidence_distribution"],
        )
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote summary CSV: %s", SUMMARY_OUTPUT)
        logging.info("Wrote no-match CSV: %s", NO_MATCH_OUTPUT)
        logging.info("Wrote low-confidence CSV: %s", LOW_CONFIDENCE_OUTPUT)
        logging.info("Wrote multi-jurisdiction CSV: %s", MULTI_JURISDICTION_OUTPUT)
        logging.info("Overlay duration: %s seconds", summary["duration_seconds"])
        return 0
    except Exception:
        logging.exception("CFS parcel_zoning_overlay_v2 build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
