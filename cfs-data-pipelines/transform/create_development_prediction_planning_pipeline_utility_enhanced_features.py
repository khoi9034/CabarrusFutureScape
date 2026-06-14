"""Create Phase 16B planning/pipeline/utility-enhanced prediction features."""

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
SQL_FILE = (
    PIPELINE_ROOT
    / "sql"
    / "create_development_prediction_planning_pipeline_utility_enhanced_features.sql"
)
OUTPUT_DIR = REPO_ROOT / "outputs"

TABLE_NAME = "parcel_development_prediction_features_planning_pipeline_utility_enhanced"
BASE_TABLE_NAME = "parcel_development_prediction_features_transportation_enhanced"

PROFILE_OUTPUT = (
    OUTPUT_DIR
    / "development_prediction_planning_pipeline_utility_enhanced_feature_profile.json"
)
MISSINGNESS_OUTPUT = (
    OUTPUT_DIR
    / "development_prediction_planning_pipeline_utility_enhanced_missingness.csv"
)
LEAKAGE_OUTPUT = (
    OUTPUT_DIR
    / "development_prediction_planning_pipeline_utility_enhanced_leakage_review.csv"
)
SNAPSHOT_SUMMARY_OUTPUT = (
    OUTPUT_DIR
    / "development_prediction_planning_pipeline_utility_enhanced_snapshot_year_summary.csv"
)
PHASE_SUMMARY_OUTPUT = (
    OUTPUT_DIR / "phase16b_planning_pipeline_utility_enhanced_feature_summary.json"
)

PLANNING_PIPELINE_UTILITY_FEATURE_COLUMNS = [
    "inside_central_area_plan",
    "central_area_future_land_use",
    "future_land_use_category",
    "future_land_use_growth_alignment",
    "inside_primary_activity_area",
    "inside_service_node",
    "inside_special_corridor",
    "inside_special_use_area",
    "distance_to_primary_activity_area_ft",
    "distance_to_service_node_ft",
    "distance_to_special_corridor_ft",
    "concord_only_flag",
    "active_plan_review_on_parcel",
    "total_plan_review_count",
    "recent_plan_review_count_12mo",
    "recent_plan_review_count_36mo",
    "plan_review_count_nearby_half_mile",
    "latest_plan_review_file_date",
    "latest_plan_review_status",
    "latest_plan_review_type",
    "max_days_open",
    "review_type_major_flag",
    "inside_wsacc_district",
    "wsacc_district_name",
    "distance_to_wsacc_sewer_line_ft",
    "distance_to_nearest_manhole_ft",
    "nearest_utility_owner",
    "nearest_pipe_size",
    "nearest_pipe_year",
    "utility_access_proxy_score",
    "true_utility_capacity_available",
    "building_value",
    "land_to_building_value_ratio",
    "sale_price",
    "sale_year",
    "sale_recency_years",
    "deferred_value_flag",
    "vacant_or_underbuilt_proxy",
    "value_enrichment_quality",
    "tax_enriched_land_value",
    "tax_enriched_total_value",
    "planning_pipeline_utility_current_context_only_flag",
    "concord_only_feature_flag",
    "utility_proxy_only_flag",
    "planning_pipeline_utility_time_safe_for_training_flag",
    "planning_pipeline_utility_feature_set_version",
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
    path.write_text(
        json.dumps(payload, indent=2, default=str, ensure_ascii=True),
        encoding="utf-8",
    )


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
        "transportation_enhanced_feature_matrix_available": table_exists(
            engine,
            BASE_TABLE_NAME,
        ),
        "planning_pipeline_utility_features_available": table_exists(
            engine,
            "parcel_planning_pipeline_utility_features",
        ),
        "would_create_table": f"public.{TABLE_NAME}",
        "current_context_only": True,
        "time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }


def missingness_rows(engine: Engine, row_count: int) -> list[dict[str, Any]]:
    rows = []
    for column in PLANNING_PIPELINE_UTILITY_FEATURE_COLUMNS:
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


def snapshot_summary_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_all(
        engine,
        f"""
        SELECT
          snapshot_year,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE planning_pipeline_utility_current_context_only_flag)
            AS current_context_rows,
          COUNT(*) FILTER (WHERE planning_pipeline_utility_time_safe_for_training_flag)
            AS time_safe_rows,
          COUNT(*) FILTER (WHERE inside_central_area_plan) AS central_area_plan_rows,
          COUNT(*) FILTER (WHERE active_plan_review_on_parcel) AS plan_review_rows,
          COUNT(*) FILTER (WHERE inside_wsacc_district) AS wsacc_district_rows,
          COUNT(*) FILTER (WHERE true_utility_capacity_available) AS true_capacity_rows
        FROM public.{TABLE_NAME}
        GROUP BY snapshot_year
        ORDER BY snapshot_year
        """,
    )


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
          COUNT(*) FILTER (WHERE inside_central_area_plan) AS inside_central_area_plan_count,
          COUNT(*) FILTER (WHERE inside_primary_activity_area) AS inside_primary_activity_area_count,
          COUNT(*) FILTER (WHERE inside_service_node) AS inside_service_node_count,
          COUNT(*) FILTER (WHERE inside_special_corridor) AS inside_special_corridor_count,
          COUNT(*) FILTER (WHERE active_plan_review_on_parcel) AS active_plan_review_count,
          COUNT(*) FILTER (WHERE recent_plan_review_count_12mo > 0)
            AS recent_plan_review_12mo_count,
          COUNT(*) FILTER (WHERE recent_plan_review_count_36mo > 0)
            AS recent_plan_review_36mo_count,
          COUNT(*) FILTER (WHERE inside_wsacc_district) AS inside_wsacc_district_count,
          COUNT(*) FILTER (WHERE utility_access_proxy_score IS NOT NULL)
            AS utility_proxy_score_count,
          COUNT(*) FILTER (WHERE true_utility_capacity_available)
            AS true_utility_capacity_available_count,
          COUNT(*) FILTER (WHERE tax_enriched_land_value IS NOT NULL)
            AS tax_enriched_land_value_count,
          COUNT(*) FILTER (WHERE planning_pipeline_utility_current_context_only_flag)
            AS current_context_only_count,
          COUNT(*) FILTER (WHERE planning_pipeline_utility_time_safe_for_training_flag)
            AS time_safe_for_training_count,
          COUNT(*) FILTER (WHERE concord_only_feature_flag) AS concord_only_feature_count,
          COUNT(*) FILTER (WHERE utility_proxy_only_flag) AS utility_proxy_only_count
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
    return {
        **base,
        "base_transportation_enhanced_row_count": int(base_count),
        "row_count_matches_transportation_enhanced_matrix": int(base["row_count"])
        == int(base_count),
        "duplicate_parcel_year_groups": int(duplicate_rows),
        "snapshot_year_summary": snapshot_summary_rows(engine),
        "current_context_only": True,
        "concord_only_features_present": True,
        "utility_proxy_only_features_present": True,
        "time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }


def leakage_review(profile: dict[str, Any]) -> list[dict[str, Any]]:
    row_count = int(profile["row_count"])
    return [
        {
            "check_name": "row_count_matches_transportation_enhanced_matrix",
            "status": "pass"
            if profile["row_count_matches_transportation_enhanced_matrix"]
            else "fail",
            "failing_rows": 0
            if profile["row_count_matches_transportation_enhanced_matrix"]
            else None,
            "notes": "Phase 16B must preserve Phase 13C parcel-year cardinality.",
        },
        {
            "check_name": "no_duplicate_parcel_year_rows",
            "status": "pass" if int(profile["duplicate_parcel_year_groups"]) == 0 else "fail",
            "failing_rows": int(profile["duplicate_parcel_year_groups"]),
            "notes": "Planning/pipeline/utility joins must not duplicate parcel-year rows.",
        },
        {
            "check_name": "current_context_flag_true",
            "status": "pass"
            if int(profile["current_context_only_count"]) == row_count
            else "fail",
            "failing_rows": row_count - int(profile["current_context_only_count"]),
            "notes": "All Phase 16B rows must be marked current-context only.",
        },
        {
            "check_name": "time_safe_flag_false",
            "status": "pass"
            if int(profile["time_safe_for_training_count"]) == 0
            else "fail",
            "failing_rows": int(profile["time_safe_for_training_count"]),
            "notes": "Current-context planning, utility, and tax fields are not strict historical training features.",
        },
        {
            "check_name": "true_utility_capacity_not_inferred",
            "status": "pass"
            if int(profile["true_utility_capacity_available_count"]) == 0
            else "fail",
            "failing_rows": int(profile["true_utility_capacity_available_count"]),
            "notes": "WSACC proxy geometry must not be converted into true capacity availability.",
        },
        {
            "check_name": "concord_only_flag_preserved",
            "status": "pass"
            if int(profile["concord_only_feature_count"]) == row_count
            else "fail",
            "failing_rows": row_count - int(profile["concord_only_feature_count"]),
            "notes": "Central Area Plan fields are Concord-only/current-context planning inputs.",
        },
        {
            "check_name": "utility_proxy_only_flag_preserved",
            "status": "pass"
            if int(profile["utility_proxy_only_count"]) == row_count
            else "fail",
            "failing_rows": row_count - int(profile["utility_proxy_only_count"]),
            "notes": "Utility fields are proximity/service-context proxies, not capacity or allocation.",
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
    snapshot_rows = profile["snapshot_year_summary"]

    write_json(PROFILE_OUTPUT, profile)
    write_csv(MISSINGNESS_OUTPUT, missingness, ["feature_name", "missing_count", "missing_pct"])
    write_csv(LEAKAGE_OUTPUT, leakage, ["check_name", "status", "failing_rows", "notes"])
    write_csv(
        SNAPSHOT_SUMMARY_OUTPUT,
        snapshot_rows,
        [
            "snapshot_year",
            "row_count",
            "current_context_rows",
            "time_safe_rows",
            "central_area_plan_rows",
            "plan_review_rows",
            "wsacc_district_rows",
            "true_capacity_rows",
        ],
    )

    summary = {
        "phase": "16B_planning_pipeline_utility_enhanced_feature_matrix",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": f"public.{TABLE_NAME}",
        "profile": profile,
        "planning_pipeline_utility_feature_columns": PLANNING_PIPELINE_UTILITY_FEATURE_COLUMNS,
        "missingness": missingness,
        "leakage_checks": leakage,
        "current_context_caveats": [
            "Central Area Plan features are Concord-only and current-context.",
            "Accela plan reviews are early pipeline signals, not approvals or completed development.",
            "WSACC RevalMap layers are utility proximity proxies and do not report capacity or allocation.",
            "Tax Parcels Full enriches value context without overwriting the base parcel table.",
            "The feature set is excluded from strict production claims until datable/historical sources are available.",
        ],
        "ready_for_exploratory_model_comparison": bool(
            profile["row_count_matches_transportation_enhanced_matrix"]
            and int(profile["duplicate_parcel_year_groups"]) == 0
            and int(profile["current_context_only_count"]) == int(profile["row_count"])
            and int(profile["time_safe_for_training_count"]) == 0
        ),
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "outputs": {
            "profile": str(PROFILE_OUTPUT),
            "missingness": str(MISSINGNESS_OUTPUT),
            "leakage_review": str(LEAKAGE_OUTPUT),
            "snapshot_year_summary": str(SNAPSHOT_SUMMARY_OUTPUT),
            "phase_summary": str(PHASE_SUMMARY_OUTPUT),
        },
    }
    write_json(PHASE_SUMMARY_OUTPUT, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
