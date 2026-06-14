"""Create separate parcel tax-value enrichment gap-check features for Phase 16A."""

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
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_tax_value_enrichment_feature_profile.json"

FEATURE_TABLE = "parcel_tax_value_enrichment_features"


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
    DROP TABLE IF EXISTS pg_temp.tmp_tax_parcel_matches;

    CREATE TEMP TABLE tmp_tax_parcel_matches AS
    SELECT DISTINCT ON (p.official_parcel_id)
      p.official_parcel_id,
      p.pin14,
      t.tax_parcel_value_enrichment_id,
      t.land_value,
      t.improvement_value,
      t.total_value,
      t.assessed_value,
      t.acreage
    FROM public.parcels_enriched p
    JOIN public.tax_parcel_value_enrichment t
      ON (
        (t.official_parcel_id IS NOT NULL AND t.official_parcel_id = p.official_parcel_id)
        OR (t.pin14 IS NOT NULL AND t.pin14 = p.pin14)
        OR (
          t.geometry IS NOT NULL
          AND p.geometry IS NOT NULL
          AND ST_Intersects(t.geometry, p.geometry)
        )
      )
    ORDER BY
      p.official_parcel_id,
      CASE
        WHEN t.official_parcel_id = p.official_parcel_id THEN 1
        WHEN t.pin14 = p.pin14 THEN 2
        ELSE 3
      END,
      CASE
        WHEN t.geometry IS NOT NULL AND p.geometry IS NOT NULL
          THEN ST_Area(ST_Intersection(ST_Transform(t.geometry, 2264), ST_Transform(p.geometry, 2264)))
        ELSE 0
      END DESC NULLS LAST;

    CREATE INDEX tmp_tax_parcel_matches_parcel_idx
      ON tmp_tax_parcel_matches (official_parcel_id);

    TRUNCATE public.parcel_tax_value_enrichment_features;

    INSERT INTO public.parcel_tax_value_enrichment_features (
      official_parcel_id,
      pin14,
      tax_parcel_full_match_found,
      tax_full_land_value,
      tax_full_improvement_value,
      tax_full_total_value,
      tax_full_assessed_value,
      tax_full_acreage,
      value_enrichment_gap_flags,
      base_parcels_overwritten,
      current_context_only,
      time_safe_for_training,
      tax_enrichment_data_quality
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      m.tax_parcel_value_enrichment_id IS NOT NULL,
      m.land_value,
      m.improvement_value,
      m.total_value,
      m.assessed_value,
      m.acreage,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN m.tax_parcel_value_enrichment_id IS NULL THEN 'no_tax_parcel_full_match' END,
        CASE WHEN m.land_value IS NULL THEN 'missing_land_value' END,
        CASE WHEN m.improvement_value IS NULL THEN 'missing_improvement_value' END,
        CASE WHEN m.total_value IS NULL AND m.assessed_value IS NULL THEN 'missing_total_or_assessed_value' END,
        CASE WHEN m.acreage IS NULL THEN 'missing_tax_full_acreage' END
      ], NULL) AS value_enrichment_gap_flags,
      false,
      true,
      false,
      CASE
        WHEN (SELECT COUNT(*) FROM public.tax_parcel_value_enrichment) = 0
          THEN 'tax_parcel_full_not_loaded'
        WHEN m.tax_parcel_value_enrichment_id IS NULL THEN 'no_tax_parcel_full_match'
        ELSE 'separate_tax_enrichment_match_available'
      END
    FROM public.parcels_enriched p
    LEFT JOIN tmp_tax_parcel_matches m
      ON m.official_parcel_id = p.official_parcel_id;
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
          COUNT(*) FILTER (WHERE tax_parcel_full_match_found) AS matched_tax_full_count,
          COUNT(*) FILTER (WHERE tax_full_land_value IS NOT NULL) AS rows_with_land_value,
          COUNT(*) FILTER (WHERE tax_full_improvement_value IS NOT NULL) AS rows_with_improvement_value,
          COUNT(*) FILTER (WHERE tax_full_total_value IS NOT NULL) AS rows_with_total_value,
          COUNT(*) FILTER (WHERE tax_full_assessed_value IS NOT NULL) AS rows_with_assessed_value,
          COUNT(*) FILTER (WHERE base_parcels_overwritten) AS base_parcels_overwritten_count,
          COUNT(*) FILTER (WHERE current_context_only) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS FALSE) AS not_time_safe_count
        FROM public.parcel_tax_value_enrichment_features
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
        "base_parcels_overwritten": False,
        "current_context_only": True,
        "time_safe_for_training": False,
        **generate_profile(engine),
    }
    write_json(PROFILE_OUTPUT, profile)
    print(f"Wrote {PROFILE_OUTPUT}")


if __name__ == "__main__":
    main()
