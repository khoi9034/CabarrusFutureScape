"""Create parcel-level current Accela plan-review pipeline features for Phase 16A."""

from __future__ import annotations

import argparse
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
SQL_FILE = PIPELINE_ROOT / "sql" / "create_planning_pipeline_utility_feature_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_accela_plan_review_feature_profile.json"

FEATURE_TABLE = "parcel_accela_plan_review_features"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
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


def execute_sql_file(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(SQL_FILE.read_text(encoding="utf-8")))


def execute_feature_sql(engine: Engine) -> None:
    sql = """
    DROP TABLE IF EXISTS pg_temp.tmp_accela_review_parcel_matches;

    CREATE TEMP TABLE tmp_accela_review_parcel_matches AS
    SELECT DISTINCT
      p.official_parcel_id,
      p.pin14,
      a.accela_plan_review_id,
      a.review_status,
      a.review_type,
      a.file_date,
      a.days_open
    FROM public.parcels_enriched p
    JOIN public.accela_plan_reviews_clean a
      ON (
        (a.official_parcel_id IS NOT NULL AND a.official_parcel_id = p.official_parcel_id)
        OR (a.pin14 IS NOT NULL AND a.pin14 = p.pin14)
        OR (
          a.geometry IS NOT NULL
          AND p.geometry IS NOT NULL
          AND ST_Intersects(a.geometry, p.geometry)
        )
      );

    CREATE INDEX tmp_accela_review_parcel_matches_parcel_idx
      ON tmp_accela_review_parcel_matches (official_parcel_id);

    TRUNCATE public.parcel_accela_plan_review_features;

    INSERT INTO public.parcel_accela_plan_review_features (
      official_parcel_id,
      pin14,
      active_plan_review_count,
      open_plan_review_count,
      recent_plan_review_count,
      latest_plan_review_status,
      latest_plan_review_type,
      latest_plan_review_file_date,
      max_plan_review_days_open,
      early_pipeline_signal_flag,
      current_context_only,
      time_safe_for_training,
      plan_review_data_quality
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      COALESCE(r.active_plan_review_count, 0),
      COALESCE(r.open_plan_review_count, 0),
      COALESCE(r.recent_plan_review_count, 0),
      latest.review_status,
      latest.review_type,
      latest.file_date,
      r.max_plan_review_days_open,
      COALESCE(r.active_plan_review_count, 0) > 0,
      true,
      false,
      CASE
        WHEN (SELECT COUNT(*) FROM public.accela_plan_reviews_clean) = 0
          THEN 'accela_plan_reviews_not_loaded'
        WHEN COALESCE(r.active_plan_review_count, 0) = 0
          THEN 'no_linked_current_plan_review'
        ELSE 'linked_current_plan_review_signal'
      END
    FROM public.parcels_enriched p
    LEFT JOIN (
      SELECT
        official_parcel_id,
        COUNT(*) AS active_plan_review_count,
        COUNT(*) FILTER (
          WHERE COALESCE(review_status, '') !~* '(closed|complete|issued|cancel|withdraw)'
        ) AS open_plan_review_count,
        COUNT(*) FILTER (WHERE file_date >= CURRENT_DATE - INTERVAL '365 days') AS recent_plan_review_count,
        MAX(days_open) AS max_plan_review_days_open
      FROM tmp_accela_review_parcel_matches
      GROUP BY official_parcel_id
    ) r ON r.official_parcel_id = p.official_parcel_id
    LEFT JOIN LATERAL (
      SELECT review_status, review_type, file_date
      FROM tmp_accela_review_parcel_matches m
      WHERE m.official_parcel_id = p.official_parcel_id
      ORDER BY file_date DESC NULLS LAST, accela_plan_review_id DESC
      LIMIT 1
    ) latest ON true;
    """
    with engine.begin() as connection:
        connection.execute(text(sql))


def fetch_one(engine: Engine, query: str) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(query)).mappings().one())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def generate_profile(engine: Engine) -> dict[str, Any]:
    return fetch_one(
        engine,
        """
        SELECT
          (SELECT COUNT(*) FROM public.parcels_enriched) AS expected_parcel_count,
          COUNT(*) AS row_count,
          COUNT(DISTINCT official_parcel_id) AS unique_parcels,
          COUNT(*) = (SELECT COUNT(*) FROM public.parcels_enriched) AS row_count_matches_parcels,
          COUNT(*) FILTER (WHERE early_pipeline_signal_flag) AS parcels_with_plan_review_signal,
          SUM(active_plan_review_count) AS linked_plan_review_count,
          SUM(open_plan_review_count) AS open_plan_review_count,
          SUM(recent_plan_review_count) AS recent_plan_review_count,
          COUNT(*) FILTER (WHERE current_context_only) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS FALSE) AS not_time_safe_count
        FROM public.parcel_accela_plan_review_features
        """,
    )


def main() -> None:
    args = parse_args()
    engine = create_engine_from_env()
    execute_sql_file(engine)
    if args.dry_run:
        print("Dry run: SQL table foundation verified; feature table not rebuilt.")
        return
    execute_feature_sql(engine)
    profile = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_table": FEATURE_TABLE,
        "early_pipeline_signal_only": True,
        "current_context_only": True,
        "time_safe_for_training": False,
        **generate_profile(engine),
    }
    write_json(PROFILE_OUTPUT, profile)
    print(f"Wrote {PROFILE_OUTPUT}")


if __name__ == "__main__":
    main()
