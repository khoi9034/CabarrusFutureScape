"""Create the current public.school_capacity snapshot from capacity history.

Phase 8D readiness only. If no capacity history exists, this script leaves the
current snapshot empty/unchanged and exits successfully.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
SQL_FILE = PIPELINE_ROOT / "sql" / "create_school_capacity_readiness_tables.sql"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build public.school_capacity from latest school_capacity_history rows.",
    )
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip creating readiness tables before snapshot.",
    )
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD must be set before creating school capacity snapshot."
        )
    url = URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", DEFAULT_DB_USER),
        password=password,
        host=os.getenv("POSTGRES_HOST", DEFAULT_DB_HOST),
        port=int(os.getenv("POSTGRES_PORT", str(DEFAULT_DB_PORT))),
        database=os.getenv("POSTGRES_DB", DEFAULT_DB_NAME),
    )
    return create_engine(url, pool_pre_ping=True)


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


def scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def build_snapshot(engine: Engine) -> dict[str, Any]:
    history_count = int(
        scalar(engine, "SELECT COUNT(*) FROM public.school_capacity_history")
    )
    if history_count == 0:
        current_count = int(scalar(engine, "SELECT COUNT(*) FROM public.school_capacity"))
        return {
            "history_row_count": history_count,
            "snapshot_row_count": current_count,
            "snapshot_rebuilt": False,
            "message": "No school_capacity_history rows exist; no current capacity snapshot is available.",
        }

    sql = """
    TRUNCATE public.school_capacity;

    INSERT INTO public.school_capacity (
      school_capacity_id,
      school_reference_id,
      school_name_normalized,
      school_level,
      school_system,
      school_year,
      enrollment,
      program_capacity,
      utilization_percent,
      available_seats,
      capacity_status,
      capacity_data_available,
      source_name,
      source_date,
      source_notes,
      created_at
    )
    WITH ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY school_name_normalized, school_level, school_system
          ORDER BY school_year DESC, ingested_at DESC
        ) AS capacity_rank
      FROM public.school_capacity_history
    ),
    latest AS (
      SELECT *
      FROM ranked
      WHERE capacity_rank = 1
    ),
    calculated AS (
      SELECT
        'SCHOOLCAP-' || upper(substr(md5(
          COALESCE(school_name_normalized, '') || '|' ||
          COALESCE(school_level, '') || '|' ||
          COALESCE(school_system, '') || '|' ||
          COALESCE(school_year::text, '')
        ), 1, 16)) AS school_capacity_id,
        matched_school_reference_id AS school_reference_id,
        school_name_normalized,
        school_level,
        school_system,
        school_year::text AS school_year,
        current_enrollment AS enrollment,
        functional_capacity AS program_capacity,
        CASE
          WHEN current_enrollment IS NOT NULL
            AND functional_capacity IS NOT NULL
            AND functional_capacity > 0
            THEN ROUND((current_enrollment::numeric / functional_capacity::numeric * 100.0), 4)
          ELSE utilization_pct
        END AS utilization_percent,
        CASE
          WHEN current_enrollment IS NOT NULL
            AND functional_capacity IS NOT NULL
            THEN functional_capacity - current_enrollment
          ELSE available_seats
        END AS available_seats,
        source_name,
        notes AS source_notes
      FROM latest
    )
    SELECT
      school_capacity_id,
      school_reference_id,
      school_name_normalized,
      school_level,
      school_system,
      school_year,
      enrollment,
      program_capacity,
      utilization_percent,
      available_seats,
      CASE
        WHEN enrollment IS NULL OR program_capacity IS NULL OR program_capacity <= 0
          THEN 'not_available'
        WHEN utilization_percent < 85
          THEN 'under_capacity'
        WHEN utilization_percent < 100
          THEN 'near_capacity'
        WHEN utilization_percent < 115
          THEN 'over_capacity'
        ELSE 'severely_over_capacity'
      END AS capacity_status,
      (enrollment IS NOT NULL AND program_capacity IS NOT NULL AND program_capacity > 0)
        AS capacity_data_available,
      source_name,
      NULL::date AS source_date,
      source_notes,
      NOW()
    FROM calculated;
    """
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

    return {
        "history_row_count": history_count,
        "snapshot_row_count": int(scalar(engine, "SELECT COUNT(*) FROM public.school_capacity")),
        "snapshot_rebuilt": True,
        "message": "Current school capacity snapshot rebuilt from latest school_capacity_history rows.",
    }


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (ROOT_OUTPUT_DIR, PIPELINE_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / filename).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    started = time.perf_counter()
    engine = create_engine_from_env()
    if not args.skip_schema:
        execute_sql_file(engine)
    snapshot = build_snapshot(engine)
    payload = {
        "generated_at": datetime.now().isoformat(),
        "table": "public.school_capacity",
        "snapshot": snapshot,
        "capacity_score_created": False,
        "parcel_school_summary_recalculated": False,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
    }
    write_json_all("school_capacity_current_snapshot_validation.json", payload)
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
