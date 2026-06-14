"""Create parcel-level WSACC/RevalMap utility proxy features for Phase 16A."""

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
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_utility_proxy_feature_profile.json"

FEATURE_TABLE = "parcel_utility_proxy_features"


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
    DROP TABLE IF EXISTS pg_temp.tmp_parcel_utility_proxy_work;

    CREATE TEMP TABLE tmp_parcel_utility_proxy_work AS
    SELECT
      official_parcel_id,
      pin14,
      geometry,
      CASE WHEN geometry IS NOT NULL THEN ST_Transform(geometry, 2264) END AS geometry_ft,
      CASE WHEN geometry IS NOT NULL THEN ST_PointOnSurface(ST_Transform(geometry, 2264)) END AS centroid_ft
    FROM public.parcels_enriched;

    CREATE INDEX tmp_parcel_utility_proxy_work_geom_idx
      ON tmp_parcel_utility_proxy_work USING gist (geometry);
    CREATE INDEX tmp_parcel_utility_proxy_work_centroid_idx
      ON tmp_parcel_utility_proxy_work USING gist (centroid_ft);

    TRUNCATE public.parcel_utility_proxy_features;

    INSERT INTO public.parcel_utility_proxy_features (
      official_parcel_id,
      pin14,
      distance_to_nearest_wsacc_manhole_ft,
      distance_to_nearest_wsacc_sewer_line_ft,
      inside_wsacc_district_proxy,
      nearest_wsacc_district_name,
      utility_proxy_service_context_flag,
      true_utility_capacity_available,
      utility_capacity_status,
      current_context_only,
      time_safe_for_training,
      utility_proxy_data_quality
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      manhole.distance_to_nearest_wsacc_manhole_ft,
      sewer_line.distance_to_nearest_wsacc_sewer_line_ft,
      COALESCE(district.inside_wsacc_district_proxy, false),
      district.district_name,
      (
        manhole.distance_to_nearest_wsacc_manhole_ft IS NOT NULL
        OR sewer_line.distance_to_nearest_wsacc_sewer_line_ft IS NOT NULL
        OR COALESCE(district.inside_wsacc_district_proxy, false)
      ) AS utility_proxy_service_context_flag,
      false,
      'not_capacity_data',
      true,
      false,
      CASE
        WHEN p.geometry IS NULL THEN 'missing_parcel_geometry'
        WHEN (SELECT COUNT(*) FROM public.utility_proxy_wsacc_clean) = 0
          THEN 'utility_proxy_layers_not_loaded'
        WHEN (
          manhole.distance_to_nearest_wsacc_manhole_ft IS NOT NULL
          OR sewer_line.distance_to_nearest_wsacc_sewer_line_ft IS NOT NULL
          OR COALESCE(district.inside_wsacc_district_proxy, false)
        ) THEN 'utility_service_context_proxy_available_not_capacity'
        ELSE 'no_utility_proxy_context'
      END
    FROM tmp_parcel_utility_proxy_work p
    LEFT JOIN LATERAL (
      SELECT ST_Distance(p.centroid_ft, u.geometry_ft) AS distance_to_nearest_wsacc_manhole_ft
      FROM public.utility_proxy_wsacc_clean u
      WHERE u.utility_layer_role = 'manhole'
        AND p.centroid_ft IS NOT NULL
        AND u.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> u.geometry_ft
      LIMIT 1
    ) manhole ON true
    LEFT JOIN LATERAL (
      SELECT ST_Distance(p.centroid_ft, u.geometry_ft) AS distance_to_nearest_wsacc_sewer_line_ft
      FROM public.utility_proxy_wsacc_clean u
      WHERE u.utility_layer_role = 'sewer_line'
        AND p.centroid_ft IS NOT NULL
        AND u.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> u.geometry_ft
      LIMIT 1
    ) sewer_line ON true
    LEFT JOIN LATERAL (
      SELECT true AS inside_wsacc_district_proxy, u.district_name
      FROM public.utility_proxy_wsacc_clean u
      WHERE u.utility_layer_role = 'district'
        AND p.geometry IS NOT NULL
        AND u.geometry IS NOT NULL
        AND ST_Intersects(p.geometry, u.geometry)
      ORDER BY ST_Area(ST_Intersection(p.geometry_ft, u.geometry_ft)) DESC NULLS LAST
      LIMIT 1
    ) district ON true;
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
          COUNT(*) FILTER (WHERE distance_to_nearest_wsacc_manhole_ft IS NOT NULL)
            AS parcels_with_manhole_distance,
          COUNT(*) FILTER (WHERE distance_to_nearest_wsacc_sewer_line_ft IS NOT NULL)
            AS parcels_with_sewer_line_distance,
          COUNT(*) FILTER (WHERE inside_wsacc_district_proxy) AS parcels_inside_wsacc_district_proxy,
          COUNT(*) FILTER (WHERE utility_proxy_service_context_flag)
            AS parcels_with_utility_proxy_context,
          COUNT(*) FILTER (WHERE true_utility_capacity_available) AS true_capacity_available_count,
          COUNT(*) FILTER (WHERE current_context_only) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS FALSE) AS not_time_safe_count,
          MIN(distance_to_nearest_wsacc_sewer_line_ft) AS nearest_sewer_line_min_ft,
          AVG(distance_to_nearest_wsacc_sewer_line_ft) AS nearest_sewer_line_avg_ft,
          MAX(distance_to_nearest_wsacc_sewer_line_ft) AS nearest_sewer_line_max_ft
        FROM public.parcel_utility_proxy_features
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
        "utility_proxy_only": True,
        "true_capacity_available": False,
        "current_context_only": True,
        "time_safe_for_training": False,
        **generate_profile(engine),
    }
    write_json(PROFILE_OUTPUT, profile)
    print(f"Wrote {PROFILE_OUTPUT}")


if __name__ == "__main__":
    main()
