"""Create combined Phase 16A planning/pipeline/utility feature table."""

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
PROFILE_OUTPUT = OUTPUT_DIR / "parcel_planning_pipeline_utility_feature_profile.json"
PHASE_SUMMARY_OUTPUT = OUTPUT_DIR / "phase16a_planning_pipeline_utility_integration_summary.json"

FEATURE_TABLE = "parcel_planning_pipeline_utility_features"


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
    TRUNCATE public.parcel_planning_pipeline_utility_features;

    INSERT INTO public.parcel_planning_pipeline_utility_features (
      official_parcel_id,
      pin14,
      inside_central_area_plan,
      central_area_future_land_use,
      central_area_future_land_use_growth_alignment,
      inside_primary_activity_area,
      inside_service_node,
      inside_special_corridor,
      inside_special_use_area,
      active_plan_review_count,
      early_pipeline_signal_flag,
      distance_to_nearest_wsacc_manhole_ft,
      distance_to_nearest_wsacc_sewer_line_ft,
      inside_wsacc_district_proxy,
      utility_proxy_service_context_flag,
      true_utility_capacity_available,
      tax_parcel_full_match_found,
      tax_full_land_value,
      tax_full_improvement_value,
      tax_full_total_value,
      current_context_only,
      time_safe_for_training,
      include_in_strict_baseline,
      include_in_future_model,
      feature_caveat,
      data_quality_summary
    )
    SELECT
      p.official_parcel_id,
      p.pin14,
      COALESCE(cap.inside_central_area_plan, false),
      cap.central_area_future_land_use,
      cap.central_area_future_land_use_growth_alignment,
      COALESCE(cap.inside_primary_activity_area, false),
      COALESCE(cap.inside_service_node, false),
      COALESCE(cap.inside_special_corridor, false),
      COALESCE(cap.inside_special_use_area, false),
      COALESCE(accela.active_plan_review_count, 0),
      COALESCE(accela.early_pipeline_signal_flag, false),
      utility.distance_to_nearest_wsacc_manhole_ft,
      utility.distance_to_nearest_wsacc_sewer_line_ft,
      COALESCE(utility.inside_wsacc_district_proxy, false),
      COALESCE(utility.utility_proxy_service_context_flag, false),
      false,
      COALESCE(tax.tax_parcel_full_match_found, false),
      tax.tax_full_land_value,
      tax.tax_full_improvement_value,
      tax.tax_full_total_value,
      true,
      false,
      false,
      true,
      'current_context_only_not_time_safe_for_training',
      CONCAT_WS(
        '; ',
        COALESCE(cap.planning_intent_data_quality, 'central_area_feature_missing'),
        COALESCE(accela.plan_review_data_quality, 'accela_feature_missing'),
        COALESCE(utility.utility_proxy_data_quality, 'utility_proxy_feature_missing'),
        COALESCE(tax.tax_enrichment_data_quality, 'tax_enrichment_feature_missing')
      )
    FROM public.parcels_enriched p
    LEFT JOIN public.parcel_central_area_plan_features cap
      ON cap.official_parcel_id = p.official_parcel_id
    LEFT JOIN public.parcel_accela_plan_review_features accela
      ON accela.official_parcel_id = p.official_parcel_id
    LEFT JOIN public.parcel_utility_proxy_features utility
      ON utility.official_parcel_id = p.official_parcel_id
    LEFT JOIN public.parcel_tax_value_enrichment_features tax
      ON tax.official_parcel_id = p.official_parcel_id;
    """
    with engine.begin() as connection:
        connection.execute(text(sql))


def fetch_one(engine: Engine, query: str) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(query)).mappings().one())


def fetch_rows(engine: Engine, query: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(query)).mappings().all()]


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
          COUNT(DISTINCT official_parcel_id) AS unique_parcels,
          COUNT(*) = (SELECT COUNT(*) FROM public.parcels_enriched) AS row_count_matches_parcels,
          COUNT(*) FILTER (WHERE inside_central_area_plan) AS inside_central_area_plan_count,
          COUNT(*) FILTER (WHERE early_pipeline_signal_flag) AS parcels_with_plan_review_signal,
          COUNT(*) FILTER (WHERE utility_proxy_service_context_flag) AS parcels_with_utility_proxy_context,
          COUNT(*) FILTER (WHERE true_utility_capacity_available) AS true_utility_capacity_available_count,
          COUNT(*) FILTER (WHERE tax_parcel_full_match_found) AS tax_parcel_full_match_count,
          COUNT(*) FILTER (WHERE current_context_only) AS current_context_only_count,
          COUNT(*) FILTER (WHERE time_safe_for_training IS FALSE) AS not_time_safe_count,
          COUNT(*) FILTER (WHERE include_in_strict_baseline IS FALSE) AS excluded_from_strict_baseline_count,
          COUNT(*) FILTER (WHERE include_in_future_model IS TRUE) AS future_model_candidate_count
        FROM public.parcel_planning_pipeline_utility_features
        """,
    )


def main() -> None:
    args = parse_args()
    engine = create_engine_from_env()
    execute_sql_file(engine)
    if args.dry_run:
        print("Dry run: SQL table foundation verified; combined feature table not rebuilt.")
        return
    execute_feature_sql(engine)
    profile = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_table": FEATURE_TABLE,
        "current_context_only": True,
        "time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        **generate_profile(engine),
    }
    write_json(PROFILE_OUTPUT, profile)
    phase_summary = {
        **profile,
        "source_families": [
            "Concord Central Area Plan",
            "Cabarrus Accela Plan Reviews",
            "WSACC/RevalMap utility proxy layers",
            "Tax Parcels Full enrichment gap check",
        ],
        "concord_sources_countywide": False,
        "utility_proxy_true_capacity": False,
        "base_parcels_overwritten": False,
        "prediction_exposure": False,
        "ready_for_phase16b_model_comparison": profile["row_count_matches_parcels"],
        "caveats": [
            "All features are current-context only.",
            "Concord plan layers are not countywide future land-use data.",
            "WSACC/RevalMap utility layers are proximity proxies, not capacity data.",
            "Tax Parcels Full is separate enrichment only and does not overwrite public.parcels_enriched."
        ],
    }
    write_json(PHASE_SUMMARY_OUTPUT, phase_summary)
    print(f"Wrote {PROFILE_OUTPUT}")
    print(f"Wrote {PHASE_SUMMARY_OUTPUT}")


if __name__ == "__main__":
    main()
