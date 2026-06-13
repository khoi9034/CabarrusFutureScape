"""Create Phase 10B parcel-year development prediction feature matrix.

This script prepares model-readiness features only. It does not train a model,
does not write prediction probabilities, and does not modify Phase 10A labels.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime
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
SQL_FILE = PIPELINE_ROOT / "sql" / "create_development_prediction_feature_matrix.sql"
CONFIG_FILE = REPO_ROOT / "config" / "development_prediction_features.json"
OUTPUT_DIR = REPO_ROOT / "outputs"

PROFILE_OUTPUT = OUTPUT_DIR / "development_prediction_feature_matrix_profile.json"
MISSINGNESS_OUTPUT = OUTPUT_DIR / "development_prediction_feature_missingness.csv"
LEAKAGE_REVIEW_OUTPUT = OUTPUT_DIR / "development_prediction_feature_leakage_review.csv"
LABEL_BALANCE_OUTPUT = OUTPUT_DIR / "development_prediction_feature_label_balance.csv"
SNAPSHOT_SUMMARY_OUTPUT = OUTPUT_DIR / "development_prediction_feature_snapshot_year_summary.csv"
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase10b_development_prediction_feature_matrix_summary.json"

FEATURE_TABLE = "parcel_development_prediction_features"
LABEL_TABLE = "parcel_development_prediction_labels"

LABEL_COLUMNS = {
    "new_construction_next_1yr",
    "new_construction_next_3yr",
    "residential_new_construction_next_3yr",
    "commercial_new_construction_next_3yr",
    "co_issued_next_3yr",
}

NON_FEATURE_COLUMNS = {
    "official_parcel_id",
    "pin14",
    "snapshot_year",
    "snapshot_end_date",
    "objectid_1",
    "first_future_new_construction_date",
    "future_permit_count_3yr",
    "label_source",
    "feature_set_version",
    "temporal_leakage_status",
    "feature_created_at",
    *LABEL_COLUMNS,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build Phase 10B development prediction feature matrix.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--truncate-and-load",
        action="store_true",
        help="Drop/recreate the Phase 10B feature matrix.",
    )
    parser.add_argument("--snapshot-start-year", type=int, default=None)
    parser.add_argument("--snapshot-end-year", type=int, default=None)
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is required for Phase 10B.",
        )

    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def load_feature_registry() -> dict[str, Any]:
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def feature_registry_groups() -> set[str]:
    registry = load_feature_registry()
    return {str(feature["feature_group"]) for feature in registry["features"]}


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": f"public.{table_name}"},
            ).scalar_one(),
        )


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def fetch_dict(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    with engine.connect() as connection:
        row = connection.execute(text(sql), params or {}).mappings().one()
        return dict(row)


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql), params or {}).mappings()]


def source_label_profile(
    engine: Engine,
    snapshot_start_year: int | None,
    snapshot_end_year: int | None,
) -> dict[str, Any]:
    return fetch_dict(
        engine,
        f"""
        SELECT
          COUNT(*) AS selected_label_rows,
          COUNT(DISTINCT official_parcel_id) AS selected_parcels,
          MIN(snapshot_year) AS min_snapshot_year,
          MAX(snapshot_year) AS max_snapshot_year,
          COUNT(*) FILTER (WHERE new_construction_next_3yr) AS positive_next_3yr_count
        FROM public.{LABEL_TABLE}
        WHERE snapshot_year >= COALESCE(:snapshot_start_year, snapshot_year)
          AND snapshot_year <= COALESCE(:snapshot_end_year, snapshot_year)
        """,
        {
            "snapshot_start_year": snapshot_start_year,
            "snapshot_end_year": snapshot_end_year,
        },
    )


def execute_feature_sql(
    engine: Engine,
    snapshot_start_year: int | None,
    snapshot_end_year: int | None,
) -> None:
    sql = SQL_FILE.read_text(encoding="utf-8")
    with engine.begin() as connection:
        if snapshot_start_year is not None:
            connection.execute(
                text("SELECT set_config('cfs.snapshot_start_year', :value, true)"),
                {"value": str(snapshot_start_year)},
            )
        if snapshot_end_year is not None:
            connection.execute(
                text("SELECT set_config('cfs.snapshot_end_year', :value, true)"),
                {"value": str(snapshot_end_year)},
            )
        connection.execute(text(sql))


def feature_columns(engine: Engine) -> list[str]:
    rows = fetch_rows(
        engine,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :table_name
        ORDER BY ordinal_position
        """,
        {"table_name": FEATURE_TABLE},
    )
    return [row["column_name"] for row in rows]


def generate_profile(engine: Engine) -> dict[str, Any]:
    profile = fetch_dict(
        engine,
        f"""
        SELECT
          COUNT(*) AS row_count,
          COUNT(DISTINCT official_parcel_id) AS unique_parcel_count,
          MIN(snapshot_year) AS min_snapshot_year,
          MAX(snapshot_year) AS max_snapshot_year,
          COUNT(DISTINCT snapshot_year) AS snapshot_year_count,
          MIN(feature_set_version) AS feature_set_version,
          COUNT(*) FILTER (WHERE temporal_leakage_status = 'mixed_time_safe_and_current_context_features')
            AS mixed_temporal_status_rows,
          COUNT(*) FILTER (WHERE school_capacity_status <> 'not_available')
            AS non_placeholder_school_capacity_rows,
          COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)
            AS non_null_school_score_rows
        FROM public.{FEATURE_TABLE}
        """,
    )
    label_rows = fetch_dict(
        engine,
        f"SELECT COUNT(*) AS label_row_count FROM public.{LABEL_TABLE}",
    )
    profile["label_row_count"] = label_rows["label_row_count"]
    profile["row_count_matches_labels"] = (
        profile["row_count"] == label_rows["label_row_count"]
    )
    profile["model_active"] = False
    profile["prediction_probability_available"] = False
    return profile


def generate_missingness(engine: Engine) -> list[dict[str, Any]]:
    columns = [column for column in feature_columns(engine) if column not in NON_FEATURE_COLUMNS]
    if not columns:
        return []

    select_parts = [
        f"COUNT(*) FILTER (WHERE \"{column}\" IS NULL) AS \"{column}\""
        for column in columns
    ]
    row = fetch_dict(
        engine,
        f"""
        SELECT
          COUNT(*) AS total_rows,
          {", ".join(select_parts)}
        FROM public.{FEATURE_TABLE}
        """,
    )
    total_rows = int(row["total_rows"] or 0)
    results: list[dict[str, Any]] = []
    for column in columns:
        missing_count = int(row[column] or 0)
        missing_pct = round(missing_count * 100.0 / total_rows, 4) if total_rows else 0.0
        results.append(
            {
                "feature_name": column,
                "missing_count": missing_count,
                "missing_pct": missing_pct,
            },
        )
    return sorted(results, key=lambda item: (-item["missing_pct"], item["feature_name"]))


def generate_leakage_review() -> list[dict[str, Any]]:
    registry = load_feature_registry()
    rows: list[dict[str, Any]] = []
    for feature in registry["features"]:
        rows.append(
            {
                "feature_name": feature["feature_name"],
                "feature_group": feature["feature_group"],
                "source_table": feature["source_table"],
                "temporal_status": feature["temporal_status"],
                "leakage_risk": feature["leakage_risk"],
                "include_in_baseline_model": feature["include_in_baseline_model"],
                "include_in_future_model": feature["include_in_future_model"],
                "notes": feature["notes"],
            },
        )
    return rows


def generate_label_balance(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          snapshot_year,
          label_name,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE label_value) AS positive_count,
          ROUND(
            COUNT(*) FILTER (WHERE label_value) * 100.0 / NULLIF(COUNT(*), 0),
            4
          ) AS positive_rate_pct
        FROM (
          SELECT snapshot_year, 'new_construction_next_1yr' AS label_name, new_construction_next_1yr AS label_value
          FROM public.{FEATURE_TABLE}
          UNION ALL
          SELECT snapshot_year, 'new_construction_next_3yr', new_construction_next_3yr
          FROM public.{FEATURE_TABLE}
          UNION ALL
          SELECT snapshot_year, 'residential_new_construction_next_3yr', residential_new_construction_next_3yr
          FROM public.{FEATURE_TABLE}
          UNION ALL
          SELECT snapshot_year, 'commercial_new_construction_next_3yr', commercial_new_construction_next_3yr
          FROM public.{FEATURE_TABLE}
          UNION ALL
          SELECT snapshot_year, 'co_issued_next_3yr', co_issued_next_3yr
          FROM public.{FEATURE_TABLE}
        ) labels
        GROUP BY snapshot_year, label_name
        ORDER BY snapshot_year, label_name
        """,
    )


def generate_snapshot_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          snapshot_year,
          COUNT(*) AS row_count,
          COUNT(*) FILTER (WHERE new_construction_next_3yr) AS positive_next_3yr_count,
          ROUND(AVG(permits_prior_3yr)::numeric, 4) AS avg_permits_prior_3yr,
          ROUND(AVG(new_construction_permits_prior_3yr)::numeric, 4)
            AS avg_new_construction_prior_3yr,
          COUNT(*) FILTER (WHERE flood_review_required) AS flood_review_required_count,
          COUNT(*) FILTER (WHERE school_missing_assignment_flag) AS school_missing_assignment_count
        FROM public.{FEATURE_TABLE}
        GROUP BY snapshot_year
        ORDER BY snapshot_year
        """,
    )


def generate_qa_outputs(engine: Engine, dry_run: bool) -> dict[str, Any]:
    if not table_exists(engine, FEATURE_TABLE):
        raise RuntimeError(
            "Feature table does not exist. Run with --truncate-and-load first.",
        )

    profile = generate_profile(engine)
    missingness = generate_missingness(engine)
    leakage_review = generate_leakage_review()
    label_balance = generate_label_balance(engine)
    snapshot_summary = generate_snapshot_summary(engine)

    write_json(PROFILE_OUTPUT, profile)
    write_csv(
        MISSINGNESS_OUTPUT,
        missingness,
        ["feature_name", "missing_count", "missing_pct"],
    )
    write_csv(
        LEAKAGE_REVIEW_OUTPUT,
        leakage_review,
        [
            "feature_name",
            "feature_group",
            "source_table",
            "temporal_status",
            "leakage_risk",
            "include_in_baseline_model",
            "include_in_future_model",
            "notes",
        ],
    )
    write_csv(
        LABEL_BALANCE_OUTPUT,
        label_balance,
        [
            "snapshot_year",
            "label_name",
            "row_count",
            "positive_count",
            "positive_rate_pct",
        ],
    )
    write_csv(
        SNAPSHOT_SUMMARY_OUTPUT,
        snapshot_summary,
        [
            "snapshot_year",
            "row_count",
            "positive_next_3yr_count",
            "avg_permits_prior_3yr",
            "avg_new_construction_prior_3yr",
            "flood_review_required_count",
            "school_missing_assignment_count",
        ],
    )

    summary = {
        "phase": "10B",
        "generated_at": datetime.now().isoformat(),
        "dry_run": dry_run,
        "feature_table": f"public.{FEATURE_TABLE}",
        "label_table": f"public.{LABEL_TABLE}",
        "outputs": {
            "profile": str(PROFILE_OUTPUT),
            "missingness": str(MISSINGNESS_OUTPUT),
            "leakage_review": str(LEAKAGE_REVIEW_OUTPUT),
            "label_balance": str(LABEL_BALANCE_OUTPUT),
            "snapshot_summary": str(SNAPSHOT_SUMMARY_OUTPUT),
        },
        "profile": profile,
        "feature_groups": sorted(load_feature_registry()["feature_groups"]),
        "model_active": False,
        "prediction_probability_available": False,
        "readiness": {
            "feature_matrix_created": True,
            "labels_preserved": True,
            "time_safe_prior_windows": True,
            "current_context_caveats_documented": True,
            "ready_for_internal_baseline_experiment": True,
            "ready_for_frontend_prediction_display": False,
        },
    }
    write_json(PHASE_SUMMARY_OUTPUT, summary)
    return summary


def main() -> int:
    args = parse_args()
    engine = create_engine_from_env()

    if args.snapshot_start_year and args.snapshot_end_year:
        if args.snapshot_start_year > args.snapshot_end_year:
            raise ValueError("--snapshot-start-year cannot be after --snapshot-end-year")

    source_profile = source_label_profile(
        engine,
        args.snapshot_start_year,
        args.snapshot_end_year,
    )
    print(json.dumps({"selected_labels": source_profile}, indent=2, default=str))

    if args.dry_run:
        write_json(
            PHASE_SUMMARY_OUTPUT,
            {
                "phase": "10B",
                "generated_at": datetime.now().isoformat(),
                "dry_run": True,
                "would_create_table": f"public.{FEATURE_TABLE}",
                "selected_labels": source_profile,
                "model_active": False,
                "prediction_probability_available": False,
            },
        )
        return 0

    if args.truncate_and_load:
        execute_feature_sql(
            engine,
            args.snapshot_start_year,
            args.snapshot_end_year,
        )
    elif not table_exists(engine, FEATURE_TABLE):
        raise RuntimeError(
            "Feature table does not exist. Use --truncate-and-load to create it.",
        )

    summary = generate_qa_outputs(engine, dry_run=False)
    print(json.dumps(summary["profile"], indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
