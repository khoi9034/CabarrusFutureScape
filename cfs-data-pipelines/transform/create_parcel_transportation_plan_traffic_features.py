"""Create Phase 13B parcel STIP/AADT transportation planning context features."""

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

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
SQL_FILE = PIPELINE_ROOT / "sql" / "create_transportation_plan_traffic_feature_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_transportation_plan_traffic_feature_profile.json"
MISSINGNESS_OUTPUT = OUTPUT_DIR / "parcel_transportation_plan_traffic_missingness.csv"
DISTANCE_DISTRIBUTION_OUTPUT = (
    OUTPUT_DIR / "parcel_transportation_plan_traffic_distance_distribution.csv"
)
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase13b_stip_aadt_feature_engineering_summary.json"
STIP_INGEST_SUMMARY_OUTPUT = OUTPUT_DIR / "stip_project_ingest_summary.json"
AADT_INGEST_SUMMARY_OUTPUT = OUTPUT_DIR / "aadt_traffic_count_ingest_summary.json"

FEATURE_TABLE = "parcel_transportation_plan_traffic_features"


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


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": f"public.{table_name}"},
            ).scalar_one(),
        )


def fetch_rows(engine: Engine, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(query), params or {}).mappings().all()]


def fetch_one(engine: Engine, query: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(query), params or {}).mappings().one())


def execute_feature_sql(engine: Engine) -> None:
    sql = """
    DROP TABLE IF EXISTS pg_temp.tmp_parcel_plan_traffic_work;

    CREATE TEMP TABLE tmp_parcel_plan_traffic_work AS
    SELECT
      official_parcel_id,
      pin14,
      CASE
        WHEN geometry IS NOT NULL THEN ST_PointOnSurface(ST_Transform(geometry, 2264))
        ELSE NULL
      END AS centroid_ft
    FROM public.parcels_enriched;

    CREATE INDEX tmp_parcel_plan_traffic_work_centroid_ft_idx
      ON tmp_parcel_plan_traffic_work USING gist (centroid_ft);

    TRUNCATE public.parcel_transportation_plan_traffic_features;

    INSERT INTO public.parcel_transportation_plan_traffic_features (
      official_parcel_id,
      pin14,
      nearest_stip_project_distance_ft,
      nearest_stip_project_name,
      nearest_stip_project_type,
      nearest_stip_project_year,
      stip_project_within_half_mile,
      stip_project_within_1_mile,
      stip_project_count_within_1_mile,
      stip_project_count_within_3_miles,
      planned_transportation_investment_flag,
      planned_transportation_context_quality,
      nearest_aadt_station_distance_ft,
      nearest_aadt_station_route,
      nearest_aadt_value,
      nearest_aadt_count_year,
      max_aadt_within_half_mile,
      max_aadt_within_1_mile,
      avg_aadt_within_1_mile,
      aadt_station_count_within_1_mile,
      traffic_demand_context_quality,
      current_context_only,
      time_safe_for_training
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      ns.nearest_stip_project_distance_ft,
      ns.project_name,
      ns.project_type,
      ns.project_year,
      COALESCE(stip_counts.stip_project_within_half_mile, false),
      COALESCE(stip_counts.stip_project_within_1_mile, false),
      COALESCE(stip_counts.stip_project_count_within_1_mile, 0),
      COALESCE(stip_counts.stip_project_count_within_3_miles, 0),
      COALESCE(stip_counts.stip_project_count_within_1_mile, 0) > 0,
      CASE
        WHEN p.centroid_ft IS NULL THEN 'missing_parcel_geometry'
        WHEN (SELECT COUNT(*) FROM public.transportation_stip_projects_clean) = 0
          THEN 'no_stip_project_context_loaded'
        WHEN ns.nearest_stip_project_distance_ft IS NULL THEN 'missing_nearest_stip_project'
        ELSE 'complete_current_context'
      END AS planned_transportation_context_quality,
      na.nearest_aadt_station_distance_ft,
      na.route_name,
      na.aadt_value,
      na.count_year,
      aadt_counts.max_aadt_within_half_mile,
      aadt_counts.max_aadt_within_1_mile,
      aadt_counts.avg_aadt_within_1_mile,
      COALESCE(aadt_counts.aadt_station_count_within_1_mile, 0),
      CASE
        WHEN p.centroid_ft IS NULL THEN 'missing_parcel_geometry'
        WHEN (SELECT COUNT(*) FROM public.transportation_aadt_stations_clean) = 0
          THEN 'no_aadt_station_context_loaded'
        WHEN na.nearest_aadt_station_distance_ft IS NULL THEN 'missing_nearest_aadt_station'
        WHEN na.aadt_value IS NULL THEN 'nearest_aadt_station_missing_count'
        ELSE 'complete_current_context'
      END AS traffic_demand_context_quality,
      true AS current_context_only,
      false AS time_safe_for_training
    FROM tmp_parcel_plan_traffic_work p
    LEFT JOIN LATERAL (
      SELECT
        s.project_name,
        s.project_type,
        COALESCE(s.construction_year, s.start_year, s.fiscal_year, s.end_year) AS project_year,
        ST_Distance(p.centroid_ft, s.geometry_ft) AS nearest_stip_project_distance_ft
      FROM public.transportation_stip_projects_clean s
      WHERE p.centroid_ft IS NOT NULL
        AND s.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> s.geometry_ft
      LIMIT 1
    ) ns ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE ST_DWithin(s.geometry_ft, p.centroid_ft, 2640)) > 0
          AS stip_project_within_half_mile,
        COUNT(*) FILTER (WHERE ST_DWithin(s.geometry_ft, p.centroid_ft, 5280)) > 0
          AS stip_project_within_1_mile,
        COUNT(*) FILTER (WHERE ST_DWithin(s.geometry_ft, p.centroid_ft, 5280))
          AS stip_project_count_within_1_mile,
        COUNT(*) AS stip_project_count_within_3_miles
      FROM public.transportation_stip_projects_clean s
      WHERE p.centroid_ft IS NOT NULL
        AND s.geometry_ft IS NOT NULL
        AND ST_DWithin(s.geometry_ft, p.centroid_ft, 15840)
    ) stip_counts ON true
    LEFT JOIN LATERAL (
      SELECT
        a.route_name,
        a.aadt_value,
        a.count_year,
        ST_Distance(p.centroid_ft, a.geometry_ft) AS nearest_aadt_station_distance_ft
      FROM public.transportation_aadt_stations_clean a
      WHERE p.centroid_ft IS NOT NULL
        AND a.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> a.geometry_ft
      LIMIT 1
    ) na ON true
    LEFT JOIN LATERAL (
      SELECT
        MAX(a.aadt_value) FILTER (WHERE ST_DWithin(a.geometry_ft, p.centroid_ft, 2640))
          AS max_aadt_within_half_mile,
        MAX(a.aadt_value) AS max_aadt_within_1_mile,
        AVG(a.aadt_value) AS avg_aadt_within_1_mile,
        COUNT(*) AS aadt_station_count_within_1_mile
      FROM public.transportation_aadt_stations_clean a
      WHERE p.centroid_ft IS NOT NULL
        AND a.geometry_ft IS NOT NULL
        AND ST_DWithin(a.geometry_ft, p.centroid_ft, 5280)
    ) aadt_counts ON true;
    """
    with engine.begin() as connection:
        connection.execute(text(sql))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def generate_profile(engine: Engine) -> dict[str, Any]:
    return fetch_one(
        engine,
        """
        SELECT
          (SELECT COUNT(*) FROM public.parcels_enriched) AS expected_parcel_count,
          COUNT(*) AS row_count,
          COUNT(DISTINCT official_parcel_id) AS unique_parcel_count,
          COUNT(*) = (SELECT COUNT(*) FROM public.parcels_enriched) AS row_count_matches_parcels,
          (SELECT COUNT(*) FROM public.transportation_stip_projects_raw) AS stip_raw_rows,
          (SELECT COUNT(*) FROM public.transportation_stip_projects_clean) AS stip_clean_rows,
          (SELECT COUNT(*) FROM public.transportation_aadt_stations_raw) AS aadt_raw_rows,
          (SELECT COUNT(*) FROM public.transportation_aadt_stations_clean) AS aadt_clean_rows,
          COUNT(*) FILTER (WHERE nearest_stip_project_distance_ft IS NULL)
            AS missing_nearest_stip_project_count,
          COUNT(*) FILTER (WHERE nearest_aadt_station_distance_ft IS NULL)
            AS missing_nearest_aadt_station_count,
          COUNT(*) FILTER (WHERE stip_project_within_half_mile IS TRUE)
            AS stip_project_within_half_mile_count,
          COUNT(*) FILTER (WHERE stip_project_within_1_mile IS TRUE)
            AS stip_project_within_1_mile_count,
          COUNT(*) FILTER (WHERE planned_transportation_investment_flag IS TRUE)
            AS planned_transportation_investment_count,
          COUNT(*) FILTER (WHERE current_context_only IS TRUE) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS TRUE) AS time_safe_for_training_count,
          MIN(nearest_stip_project_distance_ft) AS nearest_stip_min_ft,
          AVG(nearest_stip_project_distance_ft) AS nearest_stip_avg_ft,
          MAX(nearest_stip_project_distance_ft) AS nearest_stip_max_ft,
          MIN(nearest_aadt_station_distance_ft) AS nearest_aadt_min_ft,
          AVG(nearest_aadt_station_distance_ft) AS nearest_aadt_avg_ft,
          MAX(nearest_aadt_station_distance_ft) AS nearest_aadt_max_ft,
          MIN(nearest_aadt_value) AS nearest_aadt_min_value,
          AVG(nearest_aadt_value) AS nearest_aadt_avg_value,
          MAX(nearest_aadt_value) AS nearest_aadt_max_value
        FROM public.parcel_transportation_plan_traffic_features
        """,
    )


def generate_missingness(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        WITH stats AS (
          SELECT
            COUNT(*) AS total_rows,
            COUNT(*) FILTER (WHERE nearest_stip_project_distance_ft IS NULL)
              AS nearest_stip_project_distance_ft,
            COUNT(*) FILTER (WHERE nearest_stip_project_name IS NULL)
              AS nearest_stip_project_name,
            COUNT(*) FILTER (WHERE nearest_stip_project_type IS NULL)
              AS nearest_stip_project_type,
            COUNT(*) FILTER (WHERE nearest_stip_project_year IS NULL)
              AS nearest_stip_project_year,
            COUNT(*) FILTER (WHERE nearest_aadt_station_distance_ft IS NULL)
              AS nearest_aadt_station_distance_ft,
            COUNT(*) FILTER (WHERE nearest_aadt_station_route IS NULL)
              AS nearest_aadt_station_route,
            COUNT(*) FILTER (WHERE nearest_aadt_value IS NULL)
              AS nearest_aadt_value,
            COUNT(*) FILTER (WHERE nearest_aadt_count_year IS NULL)
              AS nearest_aadt_count_year,
            COUNT(*) FILTER (WHERE max_aadt_within_half_mile IS NULL)
              AS max_aadt_within_half_mile,
            COUNT(*) FILTER (WHERE max_aadt_within_1_mile IS NULL)
              AS max_aadt_within_1_mile,
            COUNT(*) FILTER (WHERE avg_aadt_within_1_mile IS NULL)
              AS avg_aadt_within_1_mile
          FROM public.parcel_transportation_plan_traffic_features
        )
        SELECT
          feature_name,
          missing_count,
          ROUND(missing_count * 100.0 / NULLIF(total_rows, 0), 4) AS missing_pct
        FROM stats,
        LATERAL (
          VALUES
            ('nearest_stip_project_distance_ft', nearest_stip_project_distance_ft),
            ('nearest_stip_project_name', nearest_stip_project_name),
            ('nearest_stip_project_type', nearest_stip_project_type),
            ('nearest_stip_project_year', nearest_stip_project_year),
            ('nearest_aadt_station_distance_ft', nearest_aadt_station_distance_ft),
            ('nearest_aadt_station_route', nearest_aadt_station_route),
            ('nearest_aadt_value', nearest_aadt_value),
            ('nearest_aadt_count_year', nearest_aadt_count_year),
            ('max_aadt_within_half_mile', max_aadt_within_half_mile),
            ('max_aadt_within_1_mile', max_aadt_within_1_mile),
            ('avg_aadt_within_1_mile', avg_aadt_within_1_mile)
        ) AS v(feature_name, missing_count)
        ORDER BY missing_pct DESC, feature_name
        """,
    )


def generate_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT
          metric_name,
          metric_unit,
          COUNT(value) AS non_null_count,
          MIN(value) AS min_value,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY value) AS p25_value,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS median_value,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_value,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY value) AS p90_value,
          MAX(value) AS max_value,
          AVG(value) AS avg_value
        FROM (
          SELECT 'nearest_stip_project_distance_ft' AS metric_name, 'feet' AS metric_unit,
                 nearest_stip_project_distance_ft AS value
          FROM public.parcel_transportation_plan_traffic_features
          UNION ALL
          SELECT 'nearest_aadt_station_distance_ft', 'feet',
                 nearest_aadt_station_distance_ft
          FROM public.parcel_transportation_plan_traffic_features
          UNION ALL
          SELECT 'nearest_aadt_value', 'vehicles_per_day',
                 nearest_aadt_value::double precision
          FROM public.parcel_transportation_plan_traffic_features
          UNION ALL
          SELECT 'max_aadt_within_1_mile', 'vehicles_per_day',
                 max_aadt_within_1_mile::double precision
          FROM public.parcel_transportation_plan_traffic_features
          UNION ALL
          SELECT 'avg_aadt_within_1_mile', 'vehicles_per_day',
                 avg_aadt_within_1_mile
          FROM public.parcel_transportation_plan_traffic_features
        ) metrics
        GROUP BY metric_name, metric_unit
        ORDER BY metric_name
        """,
    )


def quality_distribution(engine: Engine) -> dict[str, list[dict[str, Any]]]:
    return {
        "planned_transportation_context_quality": fetch_rows(
            engine,
            """
            SELECT planned_transportation_context_quality AS quality, COUNT(*) AS row_count
            FROM public.parcel_transportation_plan_traffic_features
            GROUP BY planned_transportation_context_quality
            ORDER BY row_count DESC
            """,
        ),
        "traffic_demand_context_quality": fetch_rows(
            engine,
            """
            SELECT traffic_demand_context_quality AS quality, COUNT(*) AS row_count
            FROM public.parcel_transportation_plan_traffic_features
            GROUP BY traffic_demand_context_quality
            ORDER BY row_count DESC
            """,
        ),
    }


def load_summary(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"warning": f"{path} was not valid JSON"}


def generate_qa_outputs(engine: Engine, dry_run: bool) -> dict[str, Any]:
    profile = generate_profile(engine)
    missingness = generate_missingness(engine)
    distribution = generate_distribution(engine)
    quality = quality_distribution(engine)

    write_json(PROFILE_OUTPUT, profile)
    write_csv(
        MISSINGNESS_OUTPUT,
        missingness,
        ["feature_name", "missing_count", "missing_pct"],
    )
    write_csv(
        DISTANCE_DISTRIBUTION_OUTPUT,
        distribution,
        [
            "metric_name",
            "metric_unit",
            "non_null_count",
            "min_value",
            "p25_value",
            "median_value",
            "p75_value",
            "p90_value",
            "max_value",
            "avg_value",
        ],
    )

    summary = {
        "phase": "13B_stip_aadt_feature_engineering",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "feature_table": "public.parcel_transportation_plan_traffic_features",
        "parcel_feature_table_status": "available",
        "parcel_feature_row_count": int(profile["row_count"]),
        "expected_parcel_count": int(profile["expected_parcel_count"]),
        "row_count_matches_parcels": bool(profile["row_count_matches_parcels"]),
        "sources_ingested": [
            "ncdot_stip_2026_2035",
            "ncdot_aadt_traffic_counts",
        ],
        "stip_rows": {
            "raw": int(profile["stip_raw_rows"]),
            "clean": int(profile["stip_clean_rows"]),
        },
        "aadt_rows": {
            "raw": int(profile["aadt_raw_rows"]),
            "clean": int(profile["aadt_clean_rows"]),
        },
        "features_created": [
            "nearest_stip_project_distance_ft",
            "nearest_stip_project_name",
            "nearest_stip_project_type",
            "nearest_stip_project_year",
            "stip_project_within_half_mile",
            "stip_project_within_1_mile",
            "stip_project_count_within_1_mile",
            "stip_project_count_within_3_miles",
            "planned_transportation_investment_flag",
            "nearest_aadt_station_distance_ft",
            "nearest_aadt_station_route",
            "nearest_aadt_value",
            "nearest_aadt_count_year",
            "max_aadt_within_half_mile",
            "max_aadt_within_1_mile",
            "avg_aadt_within_1_mile",
            "aadt_station_count_within_1_mile",
        ],
        "missingness": missingness,
        "distance_and_value_distribution": distribution,
        "quality_distribution": quality,
        "stip_proximity_counts": {
            "within_half_mile": int(profile["stip_project_within_half_mile_count"]),
            "within_1_mile": int(profile["stip_project_within_1_mile_count"]),
            "planned_transportation_investment_flag": int(
                profile["planned_transportation_investment_count"],
            ),
        },
        "current_context_only": True,
        "time_safe_for_training": False,
        "current_context_caveats": [
            "STIP and AADT features are current/planned context only in Phase 13B.",
            "Do not use these features in strict historical training until temporal availability is reviewed.",
            "STIP is a funded/planned project layer and does not cover every local concept road or small intersection project.",
            "AADT station proximity is a traffic-demand proxy, not parcel-specific driveway traffic.",
        ],
        "model_active": False,
        "prediction_probability_available": False,
        "phase13c_model_comparison_ready": bool(profile["row_count_matches_parcels"]),
        "ingest_summaries": {
            "stip": load_summary(STIP_INGEST_SUMMARY_OUTPUT),
            "aadt": load_summary(AADT_INGEST_SUMMARY_OUTPUT),
        },
        "outputs": {
            "stip_ingest_summary": str(STIP_INGEST_SUMMARY_OUTPUT),
            "aadt_ingest_summary": str(AADT_INGEST_SUMMARY_OUTPUT),
            "profile": str(PROFILE_OUTPUT),
            "missingness": str(MISSINGNESS_OUTPUT),
            "distance_distribution": str(DISTANCE_DISTRIBUTION_OUTPUT),
            "phase_summary": str(PHASE_SUMMARY_OUTPUT),
        },
    }
    write_json(PHASE_SUMMARY_OUTPUT, summary)
    return summary


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine_from_env()
    execute_sql_file(engine)

    if args.dry_run:
        write_json(
            PHASE_SUMMARY_OUTPUT,
            {
                "phase": "13B_stip_aadt_feature_engineering",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "dry_run": True,
                "would_create_table": f"public.{FEATURE_TABLE}",
                "stip_table_available": table_exists(engine, "transportation_stip_projects_clean"),
                "aadt_table_available": table_exists(engine, "transportation_aadt_stations_clean"),
                "feature_table_available": table_exists(engine, FEATURE_TABLE),
                "model_active": False,
                "prediction_probability_available": False,
            },
        )
        return 0

    if args.truncate_and_load:
        execute_feature_sql(engine)
    elif not table_exists(engine, FEATURE_TABLE):
        raise RuntimeError("Feature table does not exist. Use --truncate-and-load to create it.")

    summary = generate_qa_outputs(engine, dry_run=False)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
