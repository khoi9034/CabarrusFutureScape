"""Safely refresh the governed permit intelligence snapshot.

This is the Phase 1 worker for an approved Real Property Permit source.  It
never truncates a live table before the complete replacement, parcel
relationship, and Management summaries have validated inside one transaction.
It is deliberately a scheduler-friendly command, not a browser data path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy import Text, inspect, text

PIPELINE_ROOT = Path(__file__).resolve().parent
ROOT = PIPELINE_ROOT.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from ingest.ingest_real_property_permit import (  # noqa: E402
    append_source_metadata,
    create_engine_from_env,
    create_requests_session,
    download_source,
    load_source_config,
    read_real_property_csv,
)

SOURCE_CONFIG = PIPELINE_ROOT / "config" / "real_property_permit_sources.json"
SQL_FILES = (
    PIPELINE_ROOT / "sql" / "create_real_property_permit_clean.sql",
    PIPELINE_ROOT / "sql" / "create_real_property_permit_parcel_relationship.sql",
    PIPELINE_ROOT / "sql" / "create_development_activity_analytics.sql",
)
REQUIRED_FIELDS = ("permitid", "permitdate", "parcelnumber")
MAX_SAFE_DROP = 0.20


class RefreshValidationError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh governed CFS permit intelligence.")
    parser.add_argument("--apply", action="store_true", help="Publish only after staging and validation.")
    parser.add_argument("--dry-run", action="store_true", help="Download and validate without a database mutation.")
    return parser.parse_args()


def validate_frame(frame, prior_count: int | None) -> dict[str, object]:
    missing = sorted(set(REQUIRED_FIELDS) - set(frame.columns))
    if missing:
        raise RefreshValidationError("Required source fields are missing: " + ", ".join(missing))
    if frame.empty:
        raise RefreshValidationError("The approved permit source returned no records.")
    blank_counts = {
        field: int(frame[field].isna().sum() + frame[field].astype("string").str.strip().eq("").sum())
        for field in REQUIRED_FIELDS
    }
    blank_fields = sorted(field for field, count in blank_counts.items() if count)
    if blank_fields:
        raise RefreshValidationError("Required source fields contain blank values: " + ", ".join(blank_fields))
    duplicate_count = int(frame["permitid"].duplicated().sum())
    if duplicate_count:
        raise RefreshValidationError("The approved permit source contains duplicate PermitID values.")
    row_count = int(len(frame))
    if prior_count and row_count < prior_count * (1 - MAX_SAFE_DROP):
        raise RefreshValidationError(
            f"Source row count dropped from {prior_count} to {row_count}; publishing was blocked."
        )
    source_dates = __import__("pandas").to_datetime(frame["permitdate"], errors="coerce")
    if int(source_dates.notna().sum()) == 0:
        raise RefreshValidationError("The approved permit source has no parseable PermitDate values.")
    checksum = hashlib.sha256(
        frame.sort_values("permitid").to_json(orient="records", date_format="iso").encode()
    ).hexdigest()
    return {
        "checksum": checksum,
        "current_through": source_dates.max().date().isoformat(),
        "duplicate_count": duplicate_count,
        "row_count": row_count,
    }


def ensure_status_table(engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS public.cfs_data_refresh_status (
              dataset text PRIMARY KEY,
              source_name text NOT NULL,
              last_attempt_at timestamptz NOT NULL,
              last_success_at timestamptz,
              source_current_through date,
              row_count integer,
              status text NOT NULL,
              failure_message text,
              duration_seconds numeric,
              checksum text,
              published_at timestamptz
            )
        """))


def record_status(engine, source: dict, status: str, started: float, **values) -> None:
    ensure_status_table(engine)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO public.cfs_data_refresh_status (
              dataset, source_name, last_attempt_at, last_success_at,
              source_current_through, row_count, status, failure_message,
              duration_seconds, checksum, published_at
            ) VALUES (
              'permits', :source_name, now(), :last_success_at,
              :current_through, :row_count, :status, :failure_message,
              :duration_seconds, :checksum, :published_at
            ) ON CONFLICT (dataset) DO UPDATE SET
              source_name = EXCLUDED.source_name,
              last_attempt_at = EXCLUDED.last_attempt_at,
              last_success_at = COALESCE(EXCLUDED.last_success_at, public.cfs_data_refresh_status.last_success_at),
              source_current_through = COALESCE(EXCLUDED.source_current_through, public.cfs_data_refresh_status.source_current_through),
              row_count = COALESCE(EXCLUDED.row_count, public.cfs_data_refresh_status.row_count),
              status = EXCLUDED.status,
              failure_message = EXCLUDED.failure_message,
              duration_seconds = EXCLUDED.duration_seconds,
              checksum = COALESCE(EXCLUDED.checksum, public.cfs_data_refresh_status.checksum),
              published_at = COALESCE(EXCLUDED.published_at, public.cfs_data_refresh_status.published_at)
        """), {
            "source_name": source["name"], "status": status,
            "last_success_at": values.get("last_success_at"),
            "current_through": values.get("current_through"),
            "row_count": values.get("row_count"),
            "failure_message": values.get("failure_message"),
            "duration_seconds": round(time.perf_counter() - started, 2),
            "checksum": values.get("checksum"), "published_at": values.get("published_at"),
        })


def _table_count(engine, table: str) -> int | None:
    schema, name = table.split(".", 1)
    if not inspect(engine).has_table(name, schema=schema):
        return None
    with engine.connect() as connection:
        return int(connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())


def stage_and_publish(engine, frame) -> None:
    token = uuid4().hex[:12]
    stage = f"cfs_stage_real_property_permit_{token}"
    backup = f"cfs_previous_real_property_permit_{token}"
    frame.to_sql(stage, engine, schema="public", if_exists="fail", index=False,
                 chunksize=1000, method="multi", dtype={column: Text() for column in frame.columns})
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            cursor.execute("BEGIN")
            cursor.execute("SELECT to_regclass('public.real_property_permit')")
            existing = cursor.fetchone()[0]
            if existing:
                cursor.execute(f'ALTER TABLE public.real_property_permit RENAME TO "{backup}"')
            cursor.execute(f'ALTER TABLE public."{stage}" RENAME TO real_property_permit')
            for sql_file in SQL_FILES:
                cursor.execute(sql_file.read_text(encoding="utf-8"))
            if existing:
                cursor.execute(f'DROP TABLE public."{backup}"')
            cursor.execute("COMMIT")
    except Exception:
        raw.rollback()
        with engine.begin() as connection:
            connection.execute(text(f'DROP TABLE IF EXISTS public."{stage}"'))
        raise
    finally:
        raw.close()


def run(args: argparse.Namespace) -> dict[str, object]:
    started = time.perf_counter()
    source = load_source_config(SOURCE_CONFIG, None)
    engine = create_engine_from_env()
    try:
        download = download_source(create_requests_session(), source, timeout=120)
        frame = append_source_metadata(read_real_property_csv(download["content"]), source, download)
        validation = validate_frame(frame, _table_count(engine, "public.real_property_permit"))
        if args.dry_run:
            return {"status": "validated", "dataset": "permits", **validation}
        if not args.apply:
            raise RefreshValidationError("Refusing to publish without --apply.")
        stage_and_publish(engine, frame)
        now = datetime.now(UTC).isoformat()
        record_status(engine, source, "published", started, last_success_at=now,
                      published_at=now, **validation)
        return {"status": "published", "dataset": "permits", **validation}
    except Exception as exc:
        try:
            record_status(engine, source, "failed", started, failure_message=str(exc)[:500])
        except Exception:
            pass
        raise
    finally:
        engine.dispose()


def main() -> int:
    args = parse_args()
    try:
        print(json.dumps(run(args), sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "failed", "message": str(exc)[:500]}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
