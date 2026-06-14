"""Create parcel-level Concord Central Area Plan features for Phase 16A."""

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
SQL_FILE = PIPELINE_ROOT / "sql" / "create_planning_pipeline_utility_feature_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_central_area_plan_feature_profile.json"

FEATURE_TABLE = "parcel_central_area_plan_features"


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
    DROP TABLE IF EXISTS pg_temp.tmp_parcel_central_area_work;

    CREATE TEMP TABLE tmp_parcel_central_area_work AS
    SELECT
      official_parcel_id,
      pin14,
      geometry,
      CASE WHEN geometry IS NOT NULL THEN ST_Transform(geometry, 2264) END AS geometry_ft,
      CASE WHEN geometry IS NOT NULL THEN ST_PointOnSurface(ST_Transform(geometry, 2264)) END AS centroid_ft
    FROM public.parcels_enriched;

    CREATE INDEX tmp_parcel_central_area_work_geom_idx
      ON tmp_parcel_central_area_work USING gist (geometry);
    CREATE INDEX tmp_parcel_central_area_work_centroid_idx
      ON tmp_parcel_central_area_work USING gist (centroid_ft);

    TRUNCATE public.parcel_central_area_plan_features;

    INSERT INTO public.parcel_central_area_plan_features (
      official_parcel_id,
      pin14,
      inside_central_area_plan,
      central_area_future_land_use,
      central_area_future_land_use_growth_alignment,
      inside_primary_activity_area,
      inside_service_node,
      inside_special_corridor,
      inside_special_use_area,
      distance_to_nearest_service_node_ft,
      distance_to_nearest_special_corridor_ft,
      concord_only_context,
      current_context_only,
      time_safe_for_training,
      planning_intent_data_quality
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      COALESCE(boundary.inside_central_area_plan, false),
      flu.future_land_use,
      flu.growth_alignment_class,
      COALESCE(activity.inside_primary_activity_area, false),
      COALESCE(service_node_inside.inside_service_node, false),
      COALESCE(corridor_inside.inside_special_corridor, false),
      COALESCE(special_use.inside_special_use_area, false),
      nearest_node.distance_to_nearest_service_node_ft,
      nearest_corridor.distance_to_nearest_special_corridor_ft,
      true,
      true,
      false,
      CASE
        WHEN p.geometry IS NULL THEN 'missing_parcel_geometry'
        WHEN (SELECT COUNT(*) FROM public.central_area_plan_clean) = 0
          THEN 'central_area_plan_not_loaded'
        WHEN COALESCE(boundary.inside_central_area_plan, false) IS FALSE
          THEN 'outside_concord_central_area_plan_scope'
        ELSE 'complete_concord_current_context'
      END
    FROM tmp_parcel_central_area_work p
    LEFT JOIN LATERAL (
      SELECT true AS inside_central_area_plan
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'planning_boundary'
        AND p.geometry IS NOT NULL
        AND c.geometry IS NOT NULL
        AND ST_Intersects(p.geometry, c.geometry)
      LIMIT 1
    ) boundary ON true
    LEFT JOIN LATERAL (
      SELECT c.future_land_use, c.growth_alignment_class
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'future_land_use'
        AND p.geometry_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_Intersects(p.geometry_ft, c.geometry_ft)
      ORDER BY ST_Area(ST_Intersection(p.geometry_ft, c.geometry_ft)) DESC NULLS LAST
      LIMIT 1
    ) flu ON true
    LEFT JOIN LATERAL (
      SELECT true AS inside_primary_activity_area
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'activity_area'
        AND p.geometry IS NOT NULL
        AND c.geometry IS NOT NULL
        AND ST_Intersects(p.geometry, c.geometry)
      LIMIT 1
    ) activity ON true
    LEFT JOIN LATERAL (
      SELECT true AS inside_service_node
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'service_node'
        AND p.geometry_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_DWithin(p.geometry_ft, c.geometry_ft, 1)
      LIMIT 1
    ) service_node_inside ON true
    LEFT JOIN LATERAL (
      SELECT true AS inside_special_corridor
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'special_corridor'
        AND p.geometry_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_DWithin(p.geometry_ft, c.geometry_ft, 1)
      LIMIT 1
    ) corridor_inside ON true
    LEFT JOIN LATERAL (
      SELECT true AS inside_special_use_area
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'special_use_area'
        AND p.geometry IS NOT NULL
        AND c.geometry IS NOT NULL
        AND ST_Intersects(p.geometry, c.geometry)
      LIMIT 1
    ) special_use ON true
    LEFT JOIN LATERAL (
      SELECT ST_Distance(p.centroid_ft, c.geometry_ft) AS distance_to_nearest_service_node_ft
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'service_node'
        AND p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> c.geometry_ft
      LIMIT 1
    ) nearest_node ON true
    LEFT JOIN LATERAL (
      SELECT ST_Distance(p.centroid_ft, c.geometry_ft) AS distance_to_nearest_special_corridor_ft
      FROM public.central_area_plan_clean c
      WHERE c.layer_role = 'special_corridor'
        AND p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> c.geometry_ft
      LIMIT 1
    ) nearest_corridor ON true;
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
          COUNT(*) FILTER (WHERE inside_central_area_plan) AS inside_central_area_plan_count,
          COUNT(*) FILTER (WHERE inside_primary_activity_area) AS inside_primary_activity_area_count,
          COUNT(*) FILTER (WHERE inside_service_node) AS inside_service_node_count,
          COUNT(*) FILTER (WHERE inside_special_corridor) AS inside_special_corridor_count,
          COUNT(*) FILTER (WHERE inside_special_use_area) AS inside_special_use_area_count,
          COUNT(*) FILTER (WHERE central_area_future_land_use IS NOT NULL) AS future_land_use_assigned_count,
          COUNT(*) FILTER (WHERE current_context_only) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS FALSE) AS not_time_safe_count
        FROM public.parcel_central_area_plan_features
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
        "concord_only_context": True,
        "current_context_only": True,
        "time_safe_for_training": False,
        **generate_profile(engine),
    }
    write_json(PROFILE_OUTPUT, profile)
    print(f"Wrote {PROFILE_OUTPUT}")


if __name__ == "__main__":
    main()
