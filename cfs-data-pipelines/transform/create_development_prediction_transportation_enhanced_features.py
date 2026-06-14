"""Create Phase 13C transportation-enhanced development prediction features."""

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

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = PIPELINE_ROOT / "sql" / "create_development_prediction_transportation_enhanced_features.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"

TABLE_NAME = "parcel_development_prediction_features_transportation_enhanced"
BASE_TABLE_NAME = "parcel_development_prediction_features_zoning_enhanced"

PROFILE_OUTPUT = OUTPUT_DIR / "development_prediction_transportation_enhanced_feature_profile.json"
MISSINGNESS_OUTPUT = OUTPUT_DIR / "development_prediction_transportation_enhanced_missingness.csv"
LEAKAGE_OUTPUT = OUTPUT_DIR / "development_prediction_transportation_enhanced_feature_leakage_review.csv"
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase13c_transportation_enhanced_feature_summary.json"

TRANSPORTATION_FEATURE_COLUMNS = [
    "distance_to_nearest_road_ft",
    "road_density_1000ft",
    "road_density_half_mile",
    "distance_to_nearest_rail_ft",
    "rail_corridor_within_half_mile",
    "nearest_stip_project_distance_ft",
    "stip_project_within_half_mile",
    "stip_project_within_1_mile",
    "stip_project_count_within_1_mile",
    "stip_project_count_within_3_miles",
    "planned_transportation_investment_flag",
    "nearest_aadt_station_distance_ft",
    "nearest_aadt_value",
    "max_aadt_within_half_mile",
    "max_aadt_within_1_mile",
    "avg_aadt_within_1_mile",
    "aadt_station_count_within_1_mile",
    "transportation_current_context_only_flag",
    "transportation_time_safe_for_training_flag",
    "transportation_accessibility_joined_flag",
    "transportation_plan_traffic_joined_flag",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError("CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is required.")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str, ensure_ascii=True), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def fetch_one(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(sql), params or {}).mappings().one())


def fetch_all(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql), params or {}).mappings()]


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:name) IS NOT NULL"),
                {"name": f"public.{table_name}"},
            ).scalar_one(),
        )


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


def dry_run_summary(engine: Engine) -> dict[str, Any]:
    return {
        "dry_run": True,
        "zoning_enhanced_feature_matrix_available": table_exists(engine, BASE_TABLE_NAME),
        "transportation_accessibility_features_available": table_exists(
            engine,
            "parcel_transportation_accessibility_features",
        ),
        "transportation_plan_traffic_features_available": table_exists(
            engine,
            "parcel_transportation_plan_traffic_features",
        ),
        "would_create_table": f"public.{TABLE_NAME}",
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }


def missingness_rows(engine: Engine, row_count: int) -> list[dict[str, Any]]:
    rows = []
    for column in TRANSPORTATION_FEATURE_COLUMNS:
        missing_count = fetch_one(
            engine,
            f"""
            SELECT COUNT(*) AS missing_count
            FROM public.{TABLE_NAME}
            WHERE "{column}" IS NULL
            """,
        )["missing_count"]
        rows.append(
            {
                "feature_name": column,
                "missing_count": int(missing_count),
                "missing_pct": round((int(missing_count) * 100.0 / row_count), 4)
                if row_count
                else 0.0,
            },
        )
    return rows


def build_profile(engine: Engine) -> dict[str, Any]:
    base = fetch_one(
        engine,
        f"""
        SELECT
          COUNT(*) AS row_count,
          COUNT(DISTINCT official_parcel_id) AS unique_parcel_count,
          MIN(snapshot_year) AS min_snapshot_year,
          MAX(snapshot_year) AS max_snapshot_year,
          COUNT(DISTINCT snapshot_year) AS snapshot_year_count,
          COUNT(*) FILTER (WHERE transportation_accessibility_joined_flag)
            AS transportation_accessibility_joined_count,
          COUNT(*) FILTER (WHERE transportation_plan_traffic_joined_flag)
            AS transportation_plan_traffic_joined_count,
          COUNT(*) FILTER (WHERE transportation_current_context_only_flag)
            AS transportation_current_context_only_count,
          COUNT(*) FILTER (WHERE transportation_time_safe_for_training_flag)
            AS transportation_time_safe_for_training_count,
          COUNT(*) FILTER (WHERE planned_transportation_investment_flag)
            AS planned_transportation_investment_count,
          COUNT(*) FILTER (WHERE stip_project_within_half_mile)
            AS stip_project_within_half_mile_count,
          COUNT(*) FILTER (WHERE stip_project_within_1_mile)
            AS stip_project_within_1_mile_count
        FROM public.{TABLE_NAME}
        """,
    )
    base_count = fetch_one(
        engine,
        f"SELECT COUNT(*) AS base_row_count FROM public.{BASE_TABLE_NAME}",
    )["base_row_count"]
    duplicate_rows = fetch_one(
        engine,
        f"""
        SELECT COUNT(*) AS duplicate_parcel_year_groups
        FROM (
          SELECT official_parcel_id, snapshot_year, COUNT(*) AS row_count
          FROM public.{TABLE_NAME}
          GROUP BY official_parcel_id, snapshot_year
          HAVING COUNT(*) > 1
        ) duplicates
        """,
    )["duplicate_parcel_year_groups"]
    snapshot_rows = fetch_all(
        engine,
        f"""
        SELECT
          snapshot_year,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE transportation_current_context_only_flag)
            AS current_context_rows,
          COUNT(*) FILTER (WHERE transportation_time_safe_for_training_flag)
            AS time_safe_rows,
          COUNT(*) FILTER (WHERE planned_transportation_investment_flag)
            AS planned_transportation_investment_rows
        FROM public.{TABLE_NAME}
        GROUP BY snapshot_year
        ORDER BY snapshot_year
        """,
    )
    return {
        **base,
        "base_zoning_enhanced_row_count": int(base_count),
        "row_count_matches_zoning_enhanced_matrix": int(base["row_count"]) == int(base_count),
        "duplicate_parcel_year_groups": int(duplicate_rows),
        "snapshot_year_summary": snapshot_rows,
        "current_context_only": True,
        "time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }


def leakage_review(profile: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "check_name": "row_count_matches_zoning_enhanced_matrix",
            "status": "pass" if profile["row_count_matches_zoning_enhanced_matrix"] else "fail",
            "failing_rows": 0 if profile["row_count_matches_zoning_enhanced_matrix"] else None,
            "notes": "Transportation-enhanced table must preserve Phase 10E row cardinality.",
        },
        {
            "check_name": "no_duplicate_parcel_year_rows",
            "status": "pass" if int(profile["duplicate_parcel_year_groups"]) == 0 else "fail",
            "failing_rows": int(profile["duplicate_parcel_year_groups"]),
            "notes": "Transportation joins must not duplicate official_parcel_id/snapshot_year rows.",
        },
        {
            "check_name": "transportation_current_context_flag_true",
            "status": "pass"
            if int(profile["transportation_current_context_only_count"]) == int(profile["row_count"])
            else "fail",
            "failing_rows": int(profile["row_count"])
            - int(profile["transportation_current_context_only_count"]),
            "notes": "All Phase 13C transportation features must be marked current-context only.",
        },
        {
            "check_name": "transportation_time_safe_flag_false",
            "status": "pass"
            if int(profile["transportation_time_safe_for_training_count"]) == 0
            else "fail",
            "failing_rows": int(profile["transportation_time_safe_for_training_count"]),
            "notes": "Current-context transportation features are not strict historical training features.",
        },
    ]


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine_from_env()
    if args.dry_run:
        payload = dry_run_summary(engine)
        write_json(PHASE_SUMMARY_OUTPUT, payload)
        print(json.dumps(payload, indent=2))
        return 0

    if args.truncate_and_load or not table_exists(engine, TABLE_NAME):
        execute_transform(engine)

    profile = build_profile(engine)
    missingness = missingness_rows(engine, int(profile["row_count"]))
    leakage = leakage_review(profile)

    write_json(PROFILE_OUTPUT, profile)
    write_csv(MISSINGNESS_OUTPUT, missingness, ["feature_name", "missing_count", "missing_pct"])
    write_csv(LEAKAGE_OUTPUT, leakage, ["check_name", "status", "failing_rows", "notes"])

    summary = {
        "phase": "13C_transportation_enhanced_feature_matrix",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": f"public.{TABLE_NAME}",
        "profile": profile,
        "transportation_feature_columns": TRANSPORTATION_FEATURE_COLUMNS,
        "missingness": missingness,
        "leakage_checks": leakage,
        "current_context_caveats": [
            "Transportation accessibility, STIP, and AADT features are current-context only.",
            "Do not use these fields for strict historical production claims.",
            "STIP is a 2026-2035 planned/funded program context, not a complete local road-plan history.",
            "AADT station proximity is traffic-demand context, not parcel-specific trip generation.",
        ],
        "ready_for_exploratory_model_comparison": bool(
            profile["row_count_matches_zoning_enhanced_matrix"]
            and int(profile["duplicate_parcel_year_groups"]) == 0,
        ),
        "outputs": {
            "profile": str(PROFILE_OUTPUT),
            "missingness": str(MISSINGNESS_OUTPUT),
            "leakage_review": str(LEAKAGE_OUTPUT),
            "phase_summary": str(PHASE_SUMMARY_OUTPUT),
        },
    }
    write_json(PHASE_SUMMARY_OUTPUT, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
