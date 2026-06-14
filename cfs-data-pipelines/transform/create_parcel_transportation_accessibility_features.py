"""Create parcel-level transportation/accessibility features for Phase 12B."""

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
SQL_FILE = PIPELINE_ROOT / "sql" / "create_transportation_accessibility_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "transportation_accessibility_feature_profile.json"
MISSINGNESS_OUTPUT = OUTPUT_DIR / "transportation_accessibility_missingness.csv"
DISTANCE_DISTRIBUTION_OUTPUT = OUTPUT_DIR / "transportation_accessibility_distance_distribution.csv"
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase12b_transportation_accessibility_feature_summary.json"
INGEST_SUMMARY_OUTPUT = OUTPUT_DIR / "transportation_centerline_ingest_summary.json"

FEATURE_TABLE = "parcel_transportation_accessibility_features"
MIN_MAJOR_ROAD_SEGMENTS_FOR_COUNTYWIDE_FEATURE = 100


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
    DROP TABLE IF EXISTS pg_temp.tmp_parcel_transportation_work;

    CREATE TEMP TABLE tmp_parcel_transportation_work AS
    SELECT
      official_parcel_id,
      pin14,
      CASE
        WHEN geometry IS NOT NULL THEN ST_PointOnSurface(ST_Transform(geometry, 2264))
        ELSE NULL
      END AS centroid_ft
    FROM public.parcels_enriched;

    CREATE INDEX tmp_parcel_transportation_work_centroid_ft_idx
      ON tmp_parcel_transportation_work USING gist (centroid_ft);

    TRUNCATE public.parcel_transportation_accessibility_features;

    INSERT INTO public.parcel_transportation_accessibility_features (
      official_parcel_id,
      pin14,
      distance_to_nearest_road_ft,
      nearest_road_name,
      nearest_road_type,
      distance_to_nearest_major_road_ft,
      nearest_major_road_name,
      road_length_within_500ft,
      road_length_within_1000ft,
      road_length_within_half_mile,
      road_density_1000ft,
      road_density_half_mile,
      intersection_count_within_1000ft,
      intersection_feature_status,
      distance_to_nearest_rail_ft,
      rail_corridor_within_half_mile,
      transportation_accessibility_data_quality,
      current_context_only
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      nr.distance_to_nearest_road_ft,
      nr.road_name,
      nr.road_type,
      nmr.distance_to_nearest_major_road_ft,
      nmr.road_name AS nearest_major_road_name,
      COALESCE(r500.road_length_within_500ft, 0) AS road_length_within_500ft,
      COALESCE(r1000.road_length_within_1000ft, 0) AS road_length_within_1000ft,
      COALESCE(rhalf.road_length_within_half_mile, 0) AS road_length_within_half_mile,
      CASE
        WHEN r1000.road_length_within_1000ft IS NULL THEN 0
        ELSE r1000.road_length_within_1000ft / 5280.0 / (pi() * 1000.0 * 1000.0 / (5280.0 * 5280.0))
      END AS road_density_1000ft,
      CASE
        WHEN rhalf.road_length_within_half_mile IS NULL THEN 0
        ELSE rhalf.road_length_within_half_mile / 5280.0 / (pi() * 2640.0 * 2640.0 / (5280.0 * 5280.0))
      END AS road_density_half_mile,
      NULL::integer AS intersection_count_within_1000ft,
      'not_built_unreliable_for_phase12b' AS intersection_feature_status,
      rail.distance_to_nearest_rail_ft,
      COALESCE(rail_corridor.rail_corridor_within_half_mile, false) AS rail_corridor_within_half_mile,
      CASE
        WHEN p.centroid_ft IS NULL THEN 'missing_parcel_geometry'
        WHEN nr.distance_to_nearest_road_ft IS NULL THEN 'missing_nearest_road'
        WHEN nmr.distance_to_nearest_major_road_ft IS NULL THEN 'basic_accessibility_no_major_road_classification'
        ELSE 'complete_basic_accessibility'
      END AS transportation_accessibility_data_quality,
      true AS current_context_only
    FROM tmp_parcel_transportation_work p
    LEFT JOIN LATERAL (
      SELECT
        c.road_name,
        c.road_type,
        ST_Distance(p.centroid_ft, c.geometry_ft) AS distance_to_nearest_road_ft
      FROM public.transportation_centerlines_clean c
      WHERE p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
      ORDER BY p.centroid_ft <-> c.geometry_ft
      LIMIT 1
    ) nr ON true
    LEFT JOIN LATERAL (
      SELECT
        c.road_name,
        ST_Distance(p.centroid_ft, c.geometry_ft) AS distance_to_nearest_major_road_ft
      FROM public.transportation_centerlines_clean c
      WHERE p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND c.is_major_road IS TRUE
      ORDER BY p.centroid_ft <-> c.geometry_ft
      LIMIT 1
    ) nmr ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(ST_Length(ST_Intersection(c.geometry_ft, ST_Buffer(p.centroid_ft, 500)))) AS road_length_within_500ft
      FROM public.transportation_centerlines_clean c
      WHERE p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_DWithin(c.geometry_ft, p.centroid_ft, 500)
    ) r500 ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(ST_Length(ST_Intersection(c.geometry_ft, ST_Buffer(p.centroid_ft, 1000)))) AS road_length_within_1000ft
      FROM public.transportation_centerlines_clean c
      WHERE p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_DWithin(c.geometry_ft, p.centroid_ft, 1000)
    ) r1000 ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(ST_Length(ST_Intersection(c.geometry_ft, ST_Buffer(p.centroid_ft, 2640)))) AS road_length_within_half_mile
      FROM public.transportation_centerlines_clean c
      WHERE p.centroid_ft IS NOT NULL
        AND c.geometry_ft IS NOT NULL
        AND ST_DWithin(c.geometry_ft, p.centroid_ft, 2640)
    ) rhalf ON true
    LEFT JOIN LATERAL (
      SELECT ST_Distance(p.centroid_ft, r.geometry_ft) AS distance_to_nearest_rail_ft
      FROM public.transportation_rail_clean r
      WHERE p.centroid_ft IS NOT NULL
        AND r.geometry_ft IS NOT NULL
        AND r.is_corridor IS FALSE
      ORDER BY p.centroid_ft <-> r.geometry_ft
      LIMIT 1
    ) rail ON true
    LEFT JOIN LATERAL (
      SELECT true AS rail_corridor_within_half_mile
      FROM public.transportation_rail_clean r
      WHERE p.centroid_ft IS NOT NULL
        AND r.geometry_ft IS NOT NULL
        AND r.is_corridor IS TRUE
        AND ST_DWithin(r.geometry_ft, p.centroid_ft, 2640)
      LIMIT 1
    ) rail_corridor ON true;
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
          COUNT(*) FILTER (WHERE distance_to_nearest_road_ft IS NULL) AS missing_nearest_road_count,
          COUNT(*) FILTER (WHERE distance_to_nearest_major_road_ft IS NULL)
            AS missing_major_road_classification_count,
          COUNT(*) FILTER (WHERE distance_to_nearest_rail_ft IS NULL) AS missing_nearest_rail_count,
          COUNT(*) FILTER (WHERE rail_corridor_within_half_mile IS TRUE)
            AS rail_corridor_within_half_mile_count,
          COUNT(*) FILTER (WHERE current_context_only IS TRUE) AS current_context_only_count,
          MIN(distance_to_nearest_road_ft) AS nearest_road_min_ft,
          AVG(distance_to_nearest_road_ft) AS nearest_road_avg_ft,
          MAX(distance_to_nearest_road_ft) AS nearest_road_max_ft,
          MIN(distance_to_nearest_rail_ft) AS nearest_rail_min_ft,
          AVG(distance_to_nearest_rail_ft) AS nearest_rail_avg_ft,
          MAX(distance_to_nearest_rail_ft) AS nearest_rail_max_ft
        FROM public.parcel_transportation_accessibility_features
        """,
    )


def generate_missingness(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        WITH stats AS (
          SELECT
            COUNT(*) AS total_rows,
            COUNT(*) FILTER (WHERE distance_to_nearest_road_ft IS NULL) AS distance_to_nearest_road_ft,
            COUNT(*) FILTER (WHERE nearest_road_name IS NULL) AS nearest_road_name,
            COUNT(*) FILTER (WHERE nearest_road_type IS NULL) AS nearest_road_type,
            COUNT(*) FILTER (WHERE distance_to_nearest_major_road_ft IS NULL)
              AS distance_to_nearest_major_road_ft,
            COUNT(*) FILTER (WHERE nearest_major_road_name IS NULL) AS nearest_major_road_name,
            COUNT(*) FILTER (WHERE road_length_within_500ft IS NULL) AS road_length_within_500ft,
            COUNT(*) FILTER (WHERE road_length_within_1000ft IS NULL) AS road_length_within_1000ft,
            COUNT(*) FILTER (WHERE road_length_within_half_mile IS NULL) AS road_length_within_half_mile,
            COUNT(*) FILTER (WHERE road_density_1000ft IS NULL) AS road_density_1000ft,
            COUNT(*) FILTER (WHERE road_density_half_mile IS NULL) AS road_density_half_mile,
            COUNT(*) FILTER (WHERE intersection_count_within_1000ft IS NULL)
              AS intersection_count_within_1000ft,
            COUNT(*) FILTER (WHERE distance_to_nearest_rail_ft IS NULL) AS distance_to_nearest_rail_ft,
            COUNT(*) FILTER (WHERE rail_corridor_within_half_mile IS NULL)
              AS rail_corridor_within_half_mile
          FROM public.parcel_transportation_accessibility_features
        )
        SELECT
          feature_name,
          missing_count,
          ROUND(missing_count * 100.0 / NULLIF(total_rows, 0), 4) AS missing_pct
        FROM stats,
        LATERAL (
          VALUES
            ('distance_to_nearest_road_ft', distance_to_nearest_road_ft),
            ('nearest_road_name', nearest_road_name),
            ('nearest_road_type', nearest_road_type),
            ('distance_to_nearest_major_road_ft', distance_to_nearest_major_road_ft),
            ('nearest_major_road_name', nearest_major_road_name),
            ('road_length_within_500ft', road_length_within_500ft),
            ('road_length_within_1000ft', road_length_within_1000ft),
            ('road_length_within_half_mile', road_length_within_half_mile),
            ('road_density_1000ft', road_density_1000ft),
            ('road_density_half_mile', road_density_half_mile),
            ('intersection_count_within_1000ft', intersection_count_within_1000ft),
            ('distance_to_nearest_rail_ft', distance_to_nearest_rail_ft),
            ('rail_corridor_within_half_mile', rail_corridor_within_half_mile)
        ) AS v(feature_name, missing_count)
        ORDER BY missing_pct DESC, feature_name
        """,
    )


def generate_distance_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT
          metric_name,
          COUNT(value) AS non_null_count,
          MIN(value) AS min_ft,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY value) AS p25_ft,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS median_ft,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75_ft,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY value) AS p90_ft,
          MAX(value) AS max_ft,
          AVG(value) AS avg_ft
        FROM (
          SELECT 'distance_to_nearest_road_ft' AS metric_name, distance_to_nearest_road_ft AS value
          FROM public.parcel_transportation_accessibility_features
          UNION ALL
          SELECT 'distance_to_nearest_major_road_ft', distance_to_nearest_major_road_ft
          FROM public.parcel_transportation_accessibility_features
          UNION ALL
          SELECT 'distance_to_nearest_rail_ft', distance_to_nearest_rail_ft
          FROM public.parcel_transportation_accessibility_features
        ) metrics
        GROUP BY metric_name
        ORDER BY metric_name
        """,
    )


def data_quality_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT transportation_accessibility_data_quality, COUNT(*) AS row_count
        FROM public.parcel_transportation_accessibility_features
        GROUP BY transportation_accessibility_data_quality
        ORDER BY row_count DESC
        """,
    )


def source_counts(engine: Engine) -> dict[str, Any]:
    return fetch_one(
        engine,
        """
        SELECT
          (SELECT COUNT(*) FROM public.transportation_centerlines_clean) AS road_clean_rows,
          (SELECT COUNT(*) FROM public.transportation_rail_clean) AS rail_clean_rows,
          (SELECT COUNT(*) FROM public.transportation_centerlines_clean WHERE is_major_road IS TRUE)
            AS major_road_clean_rows
        """,
    )


def apply_quality_guardrails(engine: Engine) -> dict[str, Any]:
    """Disable fields that are present but too incomplete for countywide use."""

    counts = source_counts(engine)
    major_count = int(counts["major_road_clean_rows"])
    guardrails = {
        "major_road_clean_rows": major_count,
        "major_road_minimum_required_segments": MIN_MAJOR_ROAD_SEGMENTS_FOR_COUNTYWIDE_FEATURE,
        "major_road_features_enabled": major_count >= MIN_MAJOR_ROAD_SEGMENTS_FOR_COUNTYWIDE_FEATURE,
        "actions": [],
    }
    if major_count < MIN_MAJOR_ROAD_SEGMENTS_FOR_COUNTYWIDE_FEATURE:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE public.parcel_transportation_accessibility_features
                    SET
                      distance_to_nearest_major_road_ft = NULL,
                      nearest_major_road_name = NULL,
                      transportation_accessibility_data_quality =
                        CASE
                          WHEN transportation_accessibility_data_quality = 'complete_basic_accessibility'
                            THEN 'basic_accessibility_no_major_road_classification'
                          ELSE transportation_accessibility_data_quality
                        END
                    """,
                ),
            )
        guardrails["actions"].append(
            "major road distance fields set to null because source major-road classification is too sparse for countywide use",
        )
    return guardrails


def generate_qa_outputs(engine: Engine, dry_run: bool) -> dict[str, Any]:
    guardrails = apply_quality_guardrails(engine)
    profile = generate_profile(engine)
    missingness = generate_missingness(engine)
    distance_distribution = generate_distance_distribution(engine)
    quality_distribution = data_quality_distribution(engine)
    counts = source_counts(engine)

    write_json(PROFILE_OUTPUT, profile)
    write_csv(
        MISSINGNESS_OUTPUT,
        missingness,
        ["feature_name", "missing_count", "missing_pct"],
    )
    write_csv(
        DISTANCE_DISTRIBUTION_OUTPUT,
        distance_distribution,
        [
            "metric_name",
            "non_null_count",
            "min_ft",
            "p25_ft",
            "median_ft",
            "p75_ft",
            "p90_ft",
            "max_ft",
            "avg_ft",
        ],
    )

    ingest_summary = {}
    if INGEST_SUMMARY_OUTPUT.exists():
        try:
            ingest_summary = json.loads(INGEST_SUMMARY_OUTPUT.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            ingest_summary = {"warning": "transportation ingest summary was not valid JSON"}

    summary = {
        "phase": "12B_transportation_accessibility_feature_engineering",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "feature_table": "public.parcel_transportation_accessibility_features",
        "parcel_feature_table_status": "available",
        "parcel_feature_row_count": int(profile["row_count"]),
        "expected_parcel_count": int(profile["expected_parcel_count"]),
        "row_count_matches_parcels": bool(profile["row_count_matches_parcels"]),
        "sources": {
            "road_clean_rows": int(counts["road_clean_rows"]),
            "rail_clean_rows": int(counts["rail_clean_rows"]),
            "major_road_clean_rows": int(counts["major_road_clean_rows"]),
        },
        "quality_guardrails": guardrails,
        "accessibility_features_created": [
            "distance_to_nearest_road_ft",
            "nearest_road_name",
            "nearest_road_type",
            "distance_to_nearest_major_road_ft",
            "nearest_major_road_name",
            "road_length_within_500ft",
            "road_length_within_1000ft",
            "road_length_within_half_mile",
            "road_density_1000ft",
            "road_density_half_mile",
            "intersection_count_within_1000ft",
            "distance_to_nearest_rail_ft",
            "rail_corridor_within_half_mile",
        ],
        "missingness": missingness,
        "distance_distribution": distance_distribution,
        "data_quality_distribution": quality_distribution,
        "rail_corridor_within_half_mile_count": int(profile["rail_corridor_within_half_mile_count"]),
        "missing_major_road_classification_count": int(
            profile["missing_major_road_classification_count"],
        ),
        "current_context_only": True,
        "current_context_caveat": (
            "Road and rail layers are current-context. Do not use these features "
            "as time-safe historical model inputs until historical roads or dated "
            "transportation project records are available."
        ),
        "fields_unavailable": [
            "planned transportation project status/year/funding/geometry",
            "reliable intersection density derived from cleaned network topology",
            "countywide major-road/highway/interchange classification beyond sparse source road class keywords",
        ],
        "ingest_summary": ingest_summary,
        "model_active": False,
        "prediction_probability_available": False,
        "ready_for_phase12c_transportation_enhanced_model_comparison": bool(
            profile["row_count_matches_parcels"],
        ),
        "outputs": {
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
        road_table = table_exists(engine, "transportation_centerlines_clean")
        rail_table = table_exists(engine, "transportation_rail_clean")
        feature_table = table_exists(engine, FEATURE_TABLE)
        write_json(
            PHASE_SUMMARY_OUTPUT,
            {
                "phase": "12B_transportation_accessibility_feature_engineering",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "dry_run": True,
                "would_create_table": f"public.{FEATURE_TABLE}",
                "road_table_available": road_table,
                "rail_table_available": rail_table,
                "feature_table_available": feature_table,
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
