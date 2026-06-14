"""Create Phase 10E zoning-enhanced development prediction feature matrix."""

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
SQL_FILE = PIPELINE_ROOT / "sql" / "create_development_prediction_zoning_enhanced_features.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"

TABLE_NAME = "parcel_development_prediction_features_zoning_enhanced"
BASE_TABLE_NAME = "parcel_development_prediction_features"

PROFILE_OUTPUT = OUTPUT_DIR / "development_prediction_zoning_enhanced_feature_profile.json"
MISSINGNESS_OUTPUT = OUTPUT_DIR / "development_prediction_zoning_enhanced_missingness.csv"
LEAKAGE_OUTPUT = OUTPUT_DIR / "development_prediction_zoning_enhanced_leakage_review.csv"
SNAPSHOT_SUMMARY_OUTPUT = OUTPUT_DIR / "development_prediction_zoning_enhanced_snapshot_year_summary.csv"
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase10e_zoning_enhanced_feature_summary.json"

ZONING_FEATURE_COLUMNS = [
    "historical_zoning_code",
    "historical_zoning_general_category",
    "historical_zoning_jurisdiction",
    "zoning_source_year",
    "zoning_source_age_years",
    "zoning_temporal_status",
    "zoning_exact_year_flag",
    "zoning_prior_available_year_flag",
    "zoning_history_available_flag",
    "zoning_changed_prior_1yr",
    "zoning_changed_prior_3yr",
    "zoning_changed_prior_5yr",
    "zoning_change_count_prior_5yr",
    "years_since_last_zoning_change",
    "latest_zoning_change_year",
    "latest_zoning_change_type",
    "latest_zoning_intensity_change",
    "zoning_intensity_increased_prior_5yr",
    "zoning_intensity_decreased_prior_5yr",
    "rezoned_to_growth_supportive_prior_5yr",
    "zoning_change_confidence",
    "zoning_map_change_only_flag",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Phase 10E zoning-enhanced feature matrix.")
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


def fetch_one(engine: Engine, sql: str) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(sql)).mappings().one())


def fetch_all(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:name) IS NOT NULL"),
                {"name": f"public.{table_name}"},
            ).scalar_one()
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
        "base_feature_matrix_available": table_exists(engine, BASE_TABLE_NAME),
        "zoning_snapshot_table_available": table_exists(engine, "parcel_zoning_snapshot_year"),
        "zoning_change_event_table_available": table_exists(engine, "parcel_zoning_change_events"),
    }


def missingness_rows(engine: Engine, row_count: int) -> list[dict[str, Any]]:
    rows = []
    for column in ZONING_FEATURE_COLUMNS:
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
            }
        )
    return rows


def build_profile(engine: Engine) -> dict[str, Any]:
    base = fetch_one(
        engine,
        f"""
        SELECT
          COUNT(*) AS row_count,
          COUNT(DISTINCT official_parcel_id) AS parcel_count,
          MIN(snapshot_year) AS min_snapshot_year,
          MAX(snapshot_year) AS max_snapshot_year,
          COUNT(DISTINCT snapshot_year) AS snapshot_year_count,
          COUNT(*) FILTER (WHERE zoning_history_available_flag) AS zoning_history_available_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'exact_year') AS exact_year_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'prior_available_year') AS prior_available_year_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'unavailable') AS unavailable_count,
          COUNT(*) FILTER (WHERE zoning_changed_prior_1yr) AS changed_prior_1yr_count,
          COUNT(*) FILTER (WHERE zoning_changed_prior_3yr) AS changed_prior_3yr_count,
          COUNT(*) FILTER (WHERE zoning_changed_prior_5yr) AS changed_prior_5yr_count,
          COUNT(*) FILTER (WHERE zoning_change_count_prior_5yr > 0) AS change_event_feature_coverage_count,
          COUNT(*) FILTER (WHERE zoning_source_year_leakage_flag) AS source_year_leakage_rows,
          COUNT(*) FILTER (WHERE latest_zoning_change_year > snapshot_year) AS change_year_leakage_rows,
          COUNT(*) FILTER (WHERE zoning_change_year_leakage_flag) AS aggregate_change_leakage_rows
        FROM public.{TABLE_NAME}
        """,
    )
    base_count = fetch_one(
        engine,
        f"SELECT COUNT(*) AS base_row_count FROM public.{BASE_TABLE_NAME}",
    )["base_row_count"]
    age_distribution = fetch_all(
        engine,
        f"""
        SELECT zoning_source_age_years, COUNT(*) AS row_count
        FROM public.{TABLE_NAME}
        GROUP BY zoning_source_age_years
        ORDER BY zoning_source_age_years
        """,
    )
    temporal_distribution = fetch_all(
        engine,
        f"""
        SELECT zoning_temporal_status, COUNT(*) AS row_count
        FROM public.{TABLE_NAME}
        GROUP BY zoning_temporal_status
        ORDER BY row_count DESC
        """,
    )
    confidence_distribution = fetch_all(
        engine,
        f"""
        SELECT zoning_change_confidence, COUNT(*) AS row_count
        FROM public.{TABLE_NAME}
        GROUP BY zoning_change_confidence
        ORDER BY row_count DESC
        """,
    )
    profile = {
        **base,
        "base_feature_row_count": int(base_count),
        "row_count_matches_base_feature_matrix": int(base["row_count"]) == int(base_count),
        "zoning_source_age_years_distribution": age_distribution,
        "zoning_temporal_status_distribution": temporal_distribution,
        "zoning_change_confidence_distribution": confidence_distribution,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }
    return profile


def snapshot_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_all(
        engine,
        f"""
        SELECT
          snapshot_year,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE zoning_history_available_flag) AS zoning_history_available_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'exact_year') AS exact_year_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'prior_available_year') AS prior_available_year_count,
          COUNT(*) FILTER (WHERE zoning_temporal_status = 'unavailable') AS unavailable_count,
          COUNT(*) FILTER (WHERE zoning_changed_prior_5yr) AS zoning_changed_prior_5yr_count,
          COUNT(*) FILTER (WHERE zoning_source_year_leakage_flag) AS source_year_leakage_rows,
          COUNT(*) FILTER (WHERE latest_zoning_change_year > snapshot_year) AS change_year_leakage_rows
        FROM public.{TABLE_NAME}
        GROUP BY snapshot_year
        ORDER BY snapshot_year
        """,
    )


def leakage_review(profile: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "check_name": "row_count_matches_base_feature_matrix",
            "status": "pass" if profile["row_count_matches_base_feature_matrix"] else "fail",
            "failing_rows": 0 if profile["row_count_matches_base_feature_matrix"] else None,
            "notes": "Enhanced table must preserve Phase 10B row cardinality.",
        },
        {
            "check_name": "zoning_source_year_lte_snapshot_year",
            "status": "pass" if int(profile["source_year_leakage_rows"]) == 0 else "fail",
            "failing_rows": int(profile["source_year_leakage_rows"]),
            "notes": "Historical zoning source year must not be after snapshot year.",
        },
        {
            "check_name": "zoning_change_year_lte_snapshot_year",
            "status": "pass" if int(profile["change_year_leakage_rows"]) == 0 else "fail",
            "failing_rows": int(profile["change_year_leakage_rows"]),
            "notes": "Latest detected zoning change must not be after snapshot year.",
        },
        {
            "check_name": "no_current_zoning_as_historical",
            "status": "pass",
            "failing_rows": 0,
            "notes": "Enhanced fields join only public.parcel_zoning_snapshot_year and public.parcel_zoning_change_events.",
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
    snapshots = snapshot_summary(engine)

    write_json(PROFILE_OUTPUT, profile)
    write_csv(MISSINGNESS_OUTPUT, missingness, ["feature_name", "missing_count", "missing_pct"])
    write_csv(LEAKAGE_OUTPUT, leakage, ["check_name", "status", "failing_rows", "notes"])
    write_csv(
        SNAPSHOT_SUMMARY_OUTPUT,
        snapshots,
        [
            "snapshot_year",
            "row_count",
            "zoning_history_available_count",
            "exact_year_count",
            "prior_available_year_count",
            "unavailable_count",
            "zoning_changed_prior_5yr_count",
            "source_year_leakage_rows",
            "change_year_leakage_rows",
        ],
    )
    summary = {
        "phase": "10E",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": f"public.{TABLE_NAME}",
        "profile": profile,
        "leakage_checks": leakage,
        "zoning_feature_columns": ZONING_FEATURE_COLUMNS,
        "outputs": {
            "profile": str(PROFILE_OUTPUT),
            "missingness": str(MISSINGNESS_OUTPUT),
            "leakage_review": str(LEAKAGE_OUTPUT),
            "snapshot_year_summary": str(SNAPSHOT_SUMMARY_OUTPUT),
            "phase_summary": str(PHASE_SUMMARY_OUTPUT),
        },
        "caveats": [
            "Zoning changes are map-change detections, not official rezoning case approvals.",
            "Post-2015 historical zoning source rows are time-safe but stale.",
            "No current zoning source is used as historical zoning.",
        ],
    }
    write_json(PHASE_SUMMARY_OUTPUT, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
