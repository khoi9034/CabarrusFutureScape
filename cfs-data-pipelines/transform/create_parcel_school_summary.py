"""Create and validate public.parcel_school_summary."""

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

PARCEL_TABLE = "public.parcels_enriched"
REFERENCE_TABLE = "public.school_reference"
ZONE_TABLE = "public.school_zones"
ASSIGNMENT_TABLE = "public.parcel_school_assignment"
CAPACITY_TABLE = "public.school_capacity"
SUMMARY_TABLE = "public.parcel_school_summary"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_school_summary.sql"

VALIDATION_FILENAME = "parcel_school_summary_validation.json"
PHASE_SUMMARY_FILENAME = "phase8a_school_constraint_ingestion_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_school_summary.",
    )
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
    log_path = LOG_DIR / f"create_parcel_school_summary_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating school summary."
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


def scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


def table_exists(engine: Engine, table_name: str) -> bool:
    return bool(scalar(engine, "SELECT to_regclass(:table_name) IS NOT NULL", {"table_name": table_name}))


def verify_sources(engine: Engine, skip_transform: bool) -> None:
    for table_name in [PARCEL_TABLE, ASSIGNMENT_TABLE, CAPACITY_TABLE]:
        if not table_exists(engine, table_name):
            raise RuntimeError(f"Required table {table_name} does not exist.")
    if skip_transform and not table_exists(engine, SUMMARY_TABLE):
        raise RuntimeError(f"--skip-transform supplied, but {SUMMARY_TABLE} does not exist.")


def execute_sql_file(engine: Engine) -> None:
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


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        with (output_dir / filename).open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def count_if_exists(engine: Engine, table_name: str, where: str = "1=1") -> int | None:
    if not table_exists(engine, table_name):
        return None
    return int(scalar(engine, f"SELECT COUNT(*) FROM {table_name} WHERE {where}"))


def build_validation(engine: Engine, elapsed_seconds: float, log_path: Path) -> dict[str, Any]:
    parcel_count = int(scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_TABLE}"))
    summary_count = int(scalar(engine, f"SELECT COUNT(*) FROM {SUMMARY_TABLE}"))
    capacity_count = int(scalar(engine, f"SELECT COUNT(*) FROM {CAPACITY_TABLE}"))
    capacity_data_count = int(
        scalar(engine, f"SELECT COUNT(*) FROM {CAPACITY_TABLE} WHERE capacity_data_available")
    )
    school_constraint_score_non_null = int(
        scalar(engine, f"SELECT COUNT(*) FROM {SUMMARY_TABLE} WHERE school_constraint_score IS NOT NULL")
    )
    validation = {
        "generated_at": datetime.now().isoformat(),
        "summary_table": SUMMARY_TABLE,
        "source_tables": {
            "parcels": PARCEL_TABLE,
            "school_reference": REFERENCE_TABLE,
            "school_zones": ZONE_TABLE,
            "parcel_school_assignment": ASSIGNMENT_TABLE,
            "school_capacity": CAPACITY_TABLE,
        },
        "parcel_row_count": parcel_count,
        "summary_row_count": summary_count,
        "row_count_delta": summary_count - parcel_count,
        "row_counts_match": summary_count == parcel_count,
        "capacity_table_row_count": capacity_count,
        "capacity_data_available_count": capacity_data_count,
        "school_constraint_score_non_null_count": school_constraint_score_non_null,
        "capacity_scoring_status": "not_scored_until_real_capacity_data_exists",
        "summary_status_distribution": fetch_rows(
            engine,
            f"""
            SELECT school_summary_status, COUNT(*) AS parcel_count
            FROM {SUMMARY_TABLE}
            GROUP BY school_summary_status
            ORDER BY parcel_count DESC, school_summary_status
            """,
        ),
        "constraint_class_distribution": fetch_rows(
            engine,
            f"""
            SELECT school_constraint_class, COUNT(*) AS parcel_count
            FROM {SUMMARY_TABLE}
            GROUP BY school_constraint_class
            ORDER BY parcel_count DESC, school_constraint_class
            """,
        ),
        "assignment_counts": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE has_elementary_assignment) AS elementary_assigned,
              COUNT(*) FILTER (WHERE has_middle_assignment) AS middle_assigned,
              COUNT(*) FILTER (WHERE has_high_assignment) AS high_assigned,
              COUNT(*) FILTER (WHERE school_assignment_review_required) AS assignment_review_required,
              COUNT(*) FILTER (WHERE school_capacity_data_available) AS capacity_data_available_parcels
            FROM {SUMMARY_TABLE}
            """,
        )[0],
        "capacity_status_distribution": {
            "elementary": fetch_rows(
                engine,
                f"""
                SELECT elementary_capacity_status AS capacity_status,
                       COUNT(*) AS parcel_count
                FROM {SUMMARY_TABLE}
                GROUP BY elementary_capacity_status
                ORDER BY parcel_count DESC, capacity_status
                """,
            ),
            "middle": fetch_rows(
                engine,
                f"""
                SELECT middle_capacity_status AS capacity_status,
                       COUNT(*) AS parcel_count
                FROM {SUMMARY_TABLE}
                GROUP BY middle_capacity_status
                ORDER BY parcel_count DESC, capacity_status
                """,
            ),
            "high": fetch_rows(
                engine,
                f"""
                SELECT high_capacity_status AS capacity_status,
                       COUNT(*) AS parcel_count
                FROM {SUMMARY_TABLE}
                GROUP BY high_capacity_status
                ORDER BY parcel_count DESC, capacity_status
                """,
            ),
        },
        "geometry_validation": {
            "invalid_geometry_count": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {SUMMARY_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            ),
            "null_geometry_count": int(
                scalar(engine, f"SELECT COUNT(*) FROM {SUMMARY_TABLE} WHERE geometry IS NULL")
            ),
            "srid_counts": fetch_rows(
                engine,
                f"""
                SELECT ST_SRID(geometry) AS srid, COUNT(*) AS parcel_count
                FROM {SUMMARY_TABLE}
                WHERE geometry IS NOT NULL
                GROUP BY ST_SRID(geometry)
                ORDER BY srid
                """,
            ),
        },
        "qa_pass": {
            "row_count_equals_parcels": summary_count == parcel_count,
            "no_null_official_parcel_id": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {SUMMARY_TABLE} WHERE official_parcel_id IS NULL",
                )
            )
            == 0,
            "no_invalid_geometries": int(
                scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {SUMMARY_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            )
            == 0,
            "capacity_score_not_fabricated": school_constraint_score_non_null == 0,
        },
        "elapsed_seconds": elapsed_seconds,
        "log_path": str(log_path),
    }
    return validation


def build_phase_summary(engine: Engine, validation: dict[str, Any]) -> dict[str, Any]:
    reference_status = None
    if (ROOT_OUTPUT_DIR / "school_reference_validation.json").exists():
        reference_status = json.loads(
            (ROOT_OUTPUT_DIR / "school_reference_validation.json").read_text(encoding="utf-8")
        )
    zone_status = None
    if (ROOT_OUTPUT_DIR / "school_zones_validation.json").exists():
        zone_status = json.loads(
            (ROOT_OUTPUT_DIR / "school_zones_validation.json").read_text(encoding="utf-8")
        )

    return {
        "generated_at": datetime.now().isoformat(),
        "phase": "Phase 8A School Constraint Ingestion and Parcel Attendance-Zone Assignment",
        "postgis_tables": {
            "school_reference_raw": "public.school_reference_raw",
            "school_reference": REFERENCE_TABLE,
            "school_zones_elementary_raw": "public.school_zones_elementary_raw",
            "school_zones_middle_raw": "public.school_zones_middle_raw",
            "school_zones_high_raw": "public.school_zones_high_raw",
            "school_zones": ZONE_TABLE,
            "parcel_school_assignment": ASSIGNMENT_TABLE,
            "school_capacity": CAPACITY_TABLE,
            "parcel_school_summary": SUMMARY_TABLE,
        },
        "source_counts": {
            "school_reference_raw_rows": count_if_exists(engine, "public.school_reference_raw"),
            "school_reference_clean_rows": count_if_exists(engine, REFERENCE_TABLE),
            "school_reference_included_cfs_v1_rows": count_if_exists(
                engine,
                REFERENCE_TABLE,
                "include_in_cfs_v1",
            ),
            "school_zones_clean_rows": count_if_exists(engine, ZONE_TABLE),
            "school_zones_included_cfs_v1_rows": count_if_exists(
                engine,
                ZONE_TABLE,
                "include_in_cfs_v1",
            ),
        },
        "assignment_summary": validation["assignment_counts"],
        "capacity_summary": {
            "capacity_table_rows": validation["capacity_table_row_count"],
            "capacity_data_available_rows": validation["capacity_data_available_count"],
            "school_constraint_score_non_null_rows": validation[
                "school_constraint_score_non_null_count"
            ],
            "capacity_scoring_status": validation["capacity_scoring_status"],
        },
        "row_count_validation": {
            "parcel_row_count": validation["parcel_row_count"],
            "parcel_school_summary_row_count": validation["summary_row_count"],
            "row_counts_match": validation["row_counts_match"],
        },
        "school_point_policy": {
            "school_points_used_for_assignment": False,
            "assignment_method": "attendance-zone polygon overlap by largest intersection area",
        },
        "cfs_v1_scope": {
            "included": "Public elementary, middle, and high attendance-zone assignments.",
            "excluded": "Private, magnet, and Other records are preserved in raw/QA outputs but not included in CFS V1 assignments.",
        },
        "capacity_policy": {
            "capacity_score_created": False,
            "reason": "No vetted real capacity/enrollment source has been ingested.",
        },
        "source_availability": {
            "school_reference": {
                "source_status": reference_status.get("source_status") if reference_status else None,
                "source_error": reference_status.get("source_error") if reference_status else None,
            },
            "school_zones": zone_status.get("layer_statuses") if zone_status else None,
        },
        "qa_pass": validation["qa_pass"],
        "readiness": {
            "ready_for_school_constraint_api_planning": validation["qa_pass"][
                "row_count_equals_parcels"
            ],
            "blocked_for_real_school_assignment_if_sources_unavailable": (
                validation["assignment_counts"]["elementary_assigned"] == 0
                and validation["assignment_counts"]["middle_assigned"] == 0
                and validation["assignment_counts"]["high_assigned"] == 0
            ),
            "capacity_scoring_blocker": "Real enrollment/capacity data source required.",
        },
    }


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    engine = create_engine_from_env()

    verify_sources(engine, args.skip_transform)
    if not args.skip_transform:
        logging.info("Executing parcel school summary SQL: %s", SQL_FILE)
        execute_sql_file(engine)

    validation = build_validation(
        engine,
        elapsed_seconds=round(time.perf_counter() - started_at, 2),
        log_path=log_path,
    )
    write_json_all(VALIDATION_FILENAME, validation)
    write_json_all(PHASE_SUMMARY_FILENAME, build_phase_summary(engine, validation))
    logging.info("Parcel school summary row count: %s", validation["summary_row_count"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
