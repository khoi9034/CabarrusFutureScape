"""Create parcel-year zoning snapshots from historical zoning sources."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DEFAULT_START_YEAR = 2005
DEFAULT_END_YEAR = 2026
DEFAULT_STALE_YEAR_THRESHOLD = 5

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_zoning_snapshot_year.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
VALIDATION_OUTPUT = OUTPUT_DIR / "parcel_zoning_snapshot_year_validation.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create public.parcel_zoning_snapshot_year.")
    parser.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    parser.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    parser.add_argument("--stale-year-threshold", type=int, default=DEFAULT_STALE_YEAR_THRESHOLD)
    parser.add_argument("--skip-transform", action="store_true")
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError("CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is not set.")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def calculate_source_age(snapshot_year: int, source_year: int | None) -> int | None:
    if source_year is None:
        return None
    if source_year > snapshot_year:
        raise ValueError("source_year must not be after snapshot_year")
    return snapshot_year - source_year


def source_year_for_snapshot(snapshot_year: int, source_years: list[int]) -> int | None:
    eligible = [year for year in source_years if year <= snapshot_year]
    return max(eligible) if eligible else None


def execute_transform(engine: Engine, start_year: int, end_year: int, stale_year_threshold: int) -> None:
    sql = (
        SQL_FILE.read_text(encoding="utf-8")
        .replace(":start_year", str(int(start_year)))
        .replace(":end_year", str(int(end_year)))
        .replace(":stale_year_threshold", str(int(stale_year_threshold)))
    )
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


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql), params or {}).mappings()]


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def validate_snapshot(engine: Engine, start_year: int, end_year: int) -> dict[str, Any]:
    parcel_count = int(fetch_scalar(engine, "SELECT COUNT(*) FROM public.parcels_enriched"))
    snapshot_year_count = end_year - start_year + 1
    row_count = int(fetch_scalar(engine, "SELECT COUNT(*) FROM public.parcel_zoning_snapshot_year"))
    coverage_by_year = fetch_rows(
        engine,
        """
        SELECT
          snapshot_year,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE zoning_known_flag) AS zoning_known_count,
          COUNT(*) FILTER (WHERE NOT zoning_known_flag) AS zoning_unknown_count,
          COUNT(*) FILTER (WHERE temporal_status = 'exact_year') AS exact_year_count,
          COUNT(*) FILTER (WHERE temporal_status = 'prior_available_year') AS prior_available_year_count,
          COUNT(*) FILTER (WHERE temporal_status = 'unavailable') AS unavailable_count,
          COUNT(*) FILTER (WHERE zoning_review_required_flag) AS review_required_count
        FROM public.parcel_zoning_snapshot_year
        GROUP BY snapshot_year
        ORDER BY snapshot_year
        """,
    )
    temporal_distribution = fetch_rows(
        engine,
        """
        SELECT temporal_status, COUNT(*) AS row_count
        FROM public.parcel_zoning_snapshot_year
        GROUP BY temporal_status
        ORDER BY row_count DESC
        """,
    )
    age_distribution = fetch_rows(
        engine,
        """
        SELECT zoning_source_age_years, COUNT(*) AS row_count
        FROM public.parcel_zoning_snapshot_year
        GROUP BY zoning_source_age_years
        ORDER BY zoning_source_age_years
        """,
    )
    quality_distribution = fetch_rows(
        engine,
        """
        SELECT zoning_assignment_quality, COUNT(*) AS row_count
        FROM public.parcel_zoning_snapshot_year
        GROUP BY zoning_assignment_quality
        ORDER BY row_count DESC
        """,
    )
    snapshot_by_jurisdiction = fetch_rows(
        engine,
        """
        SELECT snapshot_year, zoning_jurisdiction, COUNT(*) AS parcel_count
        FROM public.parcel_zoning_snapshot_year
        WHERE zoning_known_flag
        GROUP BY snapshot_year, zoning_jurisdiction
        ORDER BY snapshot_year, parcel_count DESC
        """,
    )
    summary_csv = OUTPUT_DIR / "parcel_zoning_snapshot_year_summary.csv"
    write_csv(summary_csv, coverage_by_year)
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "start_year": start_year,
        "end_year": end_year,
        "parcel_count": parcel_count,
        "snapshot_year_count": snapshot_year_count,
        "expected_row_count": parcel_count * snapshot_year_count,
        "row_count": row_count,
        "row_count_matches_expected": row_count == parcel_count * snapshot_year_count,
        "coverage_by_year": coverage_by_year,
        "temporal_distribution": temporal_distribution,
        "zoning_source_age_years_distribution": age_distribution,
        "zoning_assignment_quality_distribution": quality_distribution,
        "snapshot_by_jurisdiction": snapshot_by_jurisdiction,
        "current_context_used": False,
        "summary_csv": str(summary_csv),
    }


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.end_year < args.start_year:
        raise ValueError("--end-year must be >= --start-year")
    engine = create_engine_from_env()
    if not args.skip_transform:
        execute_transform(engine, args.start_year, args.end_year, args.stale_year_threshold)
    validation = validate_snapshot(engine, args.start_year, args.end_year)
    VALIDATION_OUTPUT.write_text(
        json.dumps(validation, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    print(json.dumps(validation, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
