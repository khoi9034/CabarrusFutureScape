"""Create parcel zoning change-event foundation from historical snapshots."""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_zoning_change_events.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
VALIDATION_OUTPUT = OUTPUT_DIR / "parcel_zoning_change_events_validation.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create public.parcel_zoning_change_events.")
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


def detect_zoning_change_event(previous: dict[str, Any], current: dict[str, Any]) -> str:
    if previous.get("zoning_general_category") != current.get("zoning_general_category"):
        if previous.get("zoning_code") != current.get("zoning_code"):
            return "code_and_category_changed"
        return "category_changed"
    if previous.get("zoning_code") != current.get("zoning_code"):
        return "zoning_code_changed"
    if previous.get("zoning_jurisdiction") != current.get("zoning_jurisdiction"):
        return "jurisdiction_context_changed"
    return "no_change"


def classify_intensity_change(previous_category: str | None, new_category: str | None) -> str:
    ranks = {
        "agricultural_or_rural": 1,
        "residential": 2,
        "institutional": 2,
        "mixed_use_or_planned": 3,
        "commercial": 3,
        "industrial": 4,
    }
    previous_rank = ranks.get(previous_category or "")
    new_rank = ranks.get(new_category or "")
    if previous_rank is None or new_rank is None:
        return "review_required"
    if new_rank > previous_rank:
        return "increased"
    if new_rank < previous_rank:
        return "decreased"
    return "lateral_or_code_only"


def execute_transform(engine: Engine) -> None:
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


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


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


def validate_events(engine: Engine) -> dict[str, Any]:
    total_events = int(fetch_scalar(engine, "SELECT COUNT(*) FROM public.parcel_zoning_change_events"))
    by_year = fetch_rows(
        engine,
        """
        SELECT change_year, COUNT(*) AS event_count
        FROM public.parcel_zoning_change_events
        GROUP BY change_year
        ORDER BY change_year
        """,
    )
    by_type = fetch_rows(
        engine,
        """
        SELECT zoning_change_type, COUNT(*) AS event_count
        FROM public.parcel_zoning_change_events
        GROUP BY zoning_change_type
        ORDER BY event_count DESC
        """,
    )
    by_intensity = fetch_rows(
        engine,
        """
        SELECT zoning_intensity_change, COUNT(*) AS event_count
        FROM public.parcel_zoning_change_events
        GROUP BY zoning_intensity_change
        ORDER BY event_count DESC
        """,
    )
    by_confidence = fetch_rows(
        engine,
        """
        SELECT confidence, COUNT(*) AS event_count
        FROM public.parcel_zoning_change_events
        GROUP BY confidence
        ORDER BY event_count DESC
        """,
    )
    review_required_count = int(
        fetch_scalar(
            engine,
            """
            SELECT COUNT(*)
            FROM public.parcel_zoning_change_events
            WHERE confidence = 'low'
               OR zoning_intensity_change = 'review_required'
            """,
        )
    )
    samples = fetch_rows(
        engine,
        """
        SELECT *
        FROM public.parcel_zoning_change_events
        ORDER BY change_year, official_parcel_id
        LIMIT 50
        """,
    )
    sample_csv = OUTPUT_DIR / "parcel_zoning_change_events_sample.csv"
    write_csv(sample_csv, samples)
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "zoning_change_event_count": total_events,
        "change_events_by_year": by_year,
        "change_types_detected": by_type,
        "zoning_intensity_change_distribution": by_intensity,
        "confidence_distribution": by_confidence,
        "review_required_count": review_required_count,
        "temporal_status": "historical_map_change_detected_not_official_rezoning_case_history",
        "sample_csv": str(sample_csv),
    }


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine_from_env()
    if not args.skip_transform:
        execute_transform(engine)
    validation = validate_events(engine)
    VALIDATION_OUTPUT.write_text(
        json.dumps(validation, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    print(json.dumps(validation, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
