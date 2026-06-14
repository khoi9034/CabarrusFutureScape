"""Train internal Phase 16B planning/pipeline/utility model comparison.

This experiment is exploratory because planning, pipeline, utility proxy, and
tax enrichment features are current-context only. It does not activate a
production model, expose frontend probabilities, or add a public parcel
prediction endpoint.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_SCRIPT = REPO_ROOT / "cfs-data-pipelines" / "modeling" / "train_development_baseline_model.py"
OUTPUT_DIR_DEFAULT = REPO_ROOT / "outputs" / "modeling" / "development_prediction"
ROOT_OUTPUT_SUMMARY = (
    REPO_ROOT / "outputs" / "phase16b_planning_pipeline_utility_model_comparison_summary.json"
)
CAVEATS_PATH = OUTPUT_DIR_DEFAULT / "phase16b_planning_pipeline_utility_model_caveats.md"

ENHANCED_FEATURE_TABLE = "parcel_development_prediction_features_planning_pipeline_utility_enhanced"
EXPERIMENT_ID = "phase16b_planning_pipeline_utility_enhanced_v1"

ZONING_NUMERIC_FEATURES = [
    "permits_prior_1yr",
    "permits_prior_3yr",
    "permits_prior_5yr",
    "major_permits_prior_3yr",
    "residential_growth_permits_prior_3yr",
    "commercial_activity_permits_prior_3yr",
    "redevelopment_permits_prior_3yr",
    "demolition_permits_prior_3yr",
    "new_construction_permits_prior_1yr",
    "new_construction_permits_prior_3yr",
    "new_construction_permits_prior_5yr",
    "residential_new_construction_prior_3yr",
    "commercial_new_construction_prior_3yr",
    "completed_new_construction_prior_3yr",
    "active_uncompleted_new_construction_prior_3yr",
    "years_since_last_permit",
    "years_since_last_new_construction",
    "zoning_source_age_years",
    "zoning_change_count_prior_5yr",
    "years_since_last_zoning_change",
]

ZONING_BOOLEAN_FEATURES = [
    "had_prior_major_development_flag",
    "zoning_exact_year_flag",
    "zoning_prior_available_year_flag",
    "zoning_history_available_flag",
    "zoning_changed_prior_1yr",
    "zoning_changed_prior_3yr",
    "zoning_changed_prior_5yr",
    "zoning_intensity_increased_prior_5yr",
    "zoning_intensity_decreased_prior_5yr",
    "rezoned_to_growth_supportive_prior_5yr",
    "zoning_map_change_only_flag",
]

ZONING_CATEGORICAL_FEATURES = [
    "historical_zoning_code",
    "historical_zoning_general_category",
    "historical_zoning_jurisdiction",
    "zoning_temporal_status",
    "latest_zoning_change_type",
    "latest_zoning_intensity_change",
    "zoning_change_confidence",
]

TRANSPORTATION_NUMERIC_FEATURES = [
    "distance_to_nearest_road_ft",
    "road_density_1000ft",
    "road_density_half_mile",
    "distance_to_nearest_rail_ft",
    "nearest_stip_project_distance_ft",
    "stip_project_count_within_1_mile",
    "stip_project_count_within_3_miles",
    "nearest_aadt_station_distance_ft",
    "nearest_aadt_value",
    "max_aadt_within_half_mile",
    "max_aadt_within_1_mile",
    "avg_aadt_within_1_mile",
    "aadt_station_count_within_1_mile",
]

TRANSPORTATION_BOOLEAN_FEATURES = [
    "rail_corridor_within_half_mile",
    "stip_project_within_half_mile",
    "stip_project_within_1_mile",
    "planned_transportation_investment_flag",
    "transportation_current_context_only_flag",
    "transportation_time_safe_for_training_flag",
    "transportation_accessibility_joined_flag",
    "transportation_plan_traffic_joined_flag",
]

PLANNING_PIPELINE_UTILITY_NUMERIC_FEATURES = [
    "distance_to_service_node_ft",
    "distance_to_special_corridor_ft",
    "total_plan_review_count",
    "recent_plan_review_count_12mo",
    "max_days_open",
    "distance_to_wsacc_sewer_line_ft",
    "distance_to_nearest_manhole_ft",
    "utility_access_proxy_score",
    "building_value",
    "land_to_building_value_ratio",
    "tax_enriched_land_value",
    "tax_enriched_total_value",
]

PLANNING_PIPELINE_UTILITY_BOOLEAN_FEATURES = [
    "inside_central_area_plan",
    "inside_primary_activity_area",
    "inside_service_node",
    "inside_special_corridor",
    "inside_special_use_area",
    "concord_only_flag",
    "active_plan_review_on_parcel",
    "review_type_major_flag",
    "inside_wsacc_district",
    "true_utility_capacity_available",
    "vacant_or_underbuilt_proxy",
    "planning_pipeline_utility_current_context_only_flag",
    "concord_only_feature_flag",
    "utility_proxy_only_flag",
    "planning_pipeline_utility_time_safe_for_training_flag",
]

PLANNING_PIPELINE_UTILITY_CATEGORICAL_FEATURES = [
    "future_land_use_category",
    "future_land_use_growth_alignment",
    "latest_plan_review_status",
    "latest_plan_review_type",
    "value_enrichment_quality",
]

PLANNING_PIPELINE_UTILITY_FEATURE_NAMES = set(
    PLANNING_PIPELINE_UTILITY_NUMERIC_FEATURES
    + PLANNING_PIPELINE_UTILITY_BOOLEAN_FEATURES
    + PLANNING_PIPELINE_UTILITY_CATEGORICAL_FEATURES
)


def load_baseline_module():
    spec = importlib.util.spec_from_file_location("phase10c_baseline_model_for_phase16b", BASELINE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


baseline = load_baseline_module()
baseline.FEATURE_TABLE = ENHANCED_FEATURE_TABLE
baseline.FEATURE_SETS["zoning_transportation_current_context"] = {
    "numeric": [*ZONING_NUMERIC_FEATURES, *TRANSPORTATION_NUMERIC_FEATURES],
    "boolean": [*ZONING_BOOLEAN_FEATURES, *TRANSPORTATION_BOOLEAN_FEATURES],
    "categorical": ZONING_CATEGORICAL_FEATURES,
    "description": "Exploratory zoning-enhanced model plus current-context transportation accessibility/STIP/AADT fields.",
}
baseline.FEATURE_SETS["planning_pipeline_utility_current_context"] = {
    "numeric": [
        *ZONING_NUMERIC_FEATURES,
        *TRANSPORTATION_NUMERIC_FEATURES,
        *PLANNING_PIPELINE_UTILITY_NUMERIC_FEATURES,
    ],
    "boolean": [
        *ZONING_BOOLEAN_FEATURES,
        *TRANSPORTATION_BOOLEAN_FEATURES,
        *PLANNING_PIPELINE_UTILITY_BOOLEAN_FEATURES,
    ],
    "categorical": [
        *ZONING_CATEGORICAL_FEATURES,
        *PLANNING_PIPELINE_UTILITY_CATEGORICAL_FEATURES,
    ],
    "description": "Exploratory transportation-enhanced model plus current-context planning, pipeline, utility proxy, and tax enrichment fields.",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="new_construction_next_3yr", choices=sorted(baseline.TARGET_HORIZONS))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR_DEFAULT))
    parser.add_argument("--write-score-table", action="store_true")
    parser.add_argument("--skip-tree-model", action="store_true")
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str, ensure_ascii=True), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def compare_metric_values(reference_value: Any, enhanced_value: Any) -> dict[str, Any]:
    if reference_value is None or enhanced_value is None:
        return {
            "transportation_enhanced": reference_value,
            "planning_pipeline_utility_enhanced": enhanced_value,
            "absolute_improvement": None,
            "percent_improvement": None,
        }
    reference_float = float(reference_value)
    enhanced_float = float(enhanced_value)
    absolute = enhanced_float - reference_float
    percent = (absolute / abs(reference_float) * 100.0) if reference_float != 0 else None
    return {
        "transportation_enhanced": round(reference_float, 6),
        "planning_pipeline_utility_enhanced": round(enhanced_float, 6),
        "absolute_improvement": round(absolute, 6),
        "percent_improvement": round(percent, 4) if percent is not None else None,
    }


def train_feature_set(
    engine,
    target: str,
    feature_set_name: str,
    split,
    random_state: int,
    skip_tree_model: bool,
) -> dict[str, Any]:
    feature_columns = baseline.feature_columns_for_set(feature_set_name)
    baseline.assert_no_target_leakage(feature_columns)
    frame = baseline.read_model_frame(engine, target, feature_set_name, split)
    frames = baseline.split_frame(frame, split, target)
    trained = baseline.fit_models(frames, feature_set_name, random_state, skip_tree_model)
    selected_model_name = baseline.best_model_name(trained)
    return {
        "feature_set_name": feature_set_name,
        "feature_columns": feature_columns,
        "frames": frames,
        "trained": trained,
        "selected_model_name": selected_model_name,
        "selected": trained[selected_model_name],
        "rows": {
            split_name: {
                "row_count": int(len(y)),
                "positive_count": int(y.sum()),
                "positive_rate": round(float(y.mean()), 6) if len(y) else 0.0,
            }
            for split_name, (_, y) in frames.items()
        },
    }


def model_metrics_payload(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "best_model_name": result["selected_model_name"],
        "models": {
            name: {
                "validation": payload["validation_metrics"],
                "test": payload["test_metrics"],
            }
            for name, payload in result["trained"].items()
        },
    }


def feature_importance_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    rows = baseline.feature_importance_rows(
        result["trained"]["logistic_regression"]["model"],
        "logistic_regression",
        result["feature_set_name"],
    )
    for row in rows:
        is_phase16b = any(
            row["feature_name"] == name or row["feature_name"].startswith(f"{name}_")
            for name in PLANNING_PIPELINE_UTILITY_FEATURE_NAMES
        )
        row["is_planning_pipeline_utility_feature"] = is_phase16b
        if is_phase16b:
            row["feature_group"] = "planning_pipeline_utility_current_context_features"
            row["temporal_status"] = "current_context_only"
            row["leakage_risk"] = "high_for_historical_backtesting_without_source_dates"
    return rows


def write_planning_pipeline_utility_score_table(
    engine,
    selected: dict[str, Any],
    target: str,
    model_name: str,
    feature_set: str,
    split,
) -> int:
    rows_written = baseline.write_score_table(
        engine,
        selected["x_test_metadata"],
        selected["test_probability"],
        target,
        model_name,
        feature_set,
        EXPERIMENT_ID,
        split,
    )
    with engine.begin() as connection:
        connection.execute(
            baseline.text(
                f"""
                ALTER TABLE public.{baseline.SCORE_TABLE}
                ADD COLUMN IF NOT EXISTS public_exposure_allowed boolean NOT NULL DEFAULT false
                """,
            ),
        )
        connection.execute(
            baseline.text(
                f"""
                UPDATE public.{baseline.SCORE_TABLE}
                SET
                  public_exposure_allowed = false,
                  production_ready = false,
                  caveat = 'internal_current_context_planning_pipeline_utility_experiment_not_for_public_decision'
                WHERE model_experiment_id = :experiment_id
                """,
            ),
            {"experiment_id": EXPERIMENT_ID},
        )
    return rows_written


def render_caveats(path: Path, excluded_years: list[int], comparison: dict[str, Any]) -> None:
    content = f"""# Phase 16B Planning / Pipeline / Utility Model Caveats

- This is an internal exploratory comparison only.
- Planning, Accela pipeline, WSACC utility proxy, and Tax Parcels Full fields
  are current-context inputs, not strict historical training features.
- Concord Central Area Plan fields are not countywide future land-use coverage.
- Accela plan review records are early pipeline signals, not approvals or
  completed development.
- WSACC proxy layers describe proximity/service context only. They do not
  report sewer allocation, remaining capacity, or buildable service rights.
- Tax Parcels Full enriches current value context and does not overwrite the
  base parcel table.
- No prediction probabilities are exposed in the frontend.
- No parcel-level ranking classes are exposed.
- No public parcel prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `{excluded_years}`.

## Comparison Summary

```json
{json.dumps(comparison, indent=2)}
```
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = baseline.create_engine_from_env()

    observed_date = baseline.max_observed_permit_date(engine)
    mature_years = baseline.mature_snapshot_years(observed_date, baseline.TARGET_HORIZONS[args.target])
    split = baseline.build_temporal_split(mature_years)
    all_label_rows = baseline.fetch_label_distribution(engine)
    all_years = [int(row["snapshot_year"]) for row in all_label_rows]
    excluded_years = [year for year in all_years if year not in mature_years]

    dry_run_payload = {
        "experiment_id": EXPERIMENT_ID,
        "target": args.target,
        "mature_snapshot_years": mature_years,
        "excluded_snapshot_years": excluded_years,
        "temporal_split": split.as_dict(),
        "feature_sets": {
            "zoning_transportation_current_context": baseline.feature_columns_for_set(
                "zoning_transportation_current_context",
            ),
            "planning_pipeline_utility_current_context": baseline.feature_columns_for_set(
                "planning_pipeline_utility_current_context",
            ),
        },
        "current_context_only": True,
        "time_safe_for_training": False,
        "concord_only_features_present": True,
        "utility_proxy_only_features_present": True,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }
    if args.dry_run:
        write_json(output_dir / "phase16b_planning_pipeline_utility_temporal_split_summary.json", dry_run_payload)
        print(json.dumps(dry_run_payload, indent=2))
        return 0

    transportation_result = train_feature_set(
        engine,
        args.target,
        "zoning_transportation_current_context",
        split,
        args.random_state,
        args.skip_tree_model,
    )
    phase16b_result = train_feature_set(
        engine,
        args.target,
        "planning_pipeline_utility_current_context",
        split,
        args.random_state,
        args.skip_tree_model,
    )

    transportation_test = transportation_result["selected"]["test_metrics"]
    phase16b_test = phase16b_result["selected"]["test_metrics"]
    metric_names = [
        "roc_auc",
        "average_precision_pr_auc",
        "precision_at_top_1_pct",
        "precision_at_top_5_pct",
        "recall_at_top_5_pct",
        "lift_at_top_1_pct",
        "lift_at_top_5_pct",
        "brier_score",
        "positive_rate",
    ]
    comparison = {
        name: compare_metric_values(transportation_test.get(name), phase16b_test.get(name))
        for name in metric_names
    }
    pr_improvement = comparison["average_precision_pr_auc"]["absolute_improvement"]
    lift_improvement = comparison["lift_at_top_5_pct"]["absolute_improvement"]
    planning_pipeline_utility_helped = bool(
        pr_improvement is not None
        and pr_improvement > 0.001
        and lift_improvement is not None
        and lift_improvement > 0
    )

    importance_rows = feature_importance_rows(phase16b_result)
    top_phase16b_features = [
        row for row in importance_rows if row.get("is_planning_pipeline_utility_feature")
    ][:25]
    write_csv(
        output_dir / "phase16b_planning_pipeline_utility_feature_importance.csv",
        importance_rows,
        [
            "model_name",
            "feature_set_name",
            "feature_name",
            "coefficient",
            "absolute_coefficient",
            "feature_group",
            "temporal_status",
            "leakage_risk",
            "is_planning_pipeline_utility_feature",
        ],
    )

    selected = phase16b_result["selected"]
    sample_rows = baseline.prediction_sample_rows(
        selected["x_test_metadata"],
        selected["y_test"],
        selected["test_probability"],
        args.target,
        phase16b_result["selected_model_name"],
        "planning_pipeline_utility_current_context",
        EXPERIMENT_ID,
    )
    for row in sample_rows:
        row["caveat"] = "internal_current_context_planning_pipeline_utility_experiment_not_for_public_decision"
    write_csv(
        output_dir / "phase16b_planning_pipeline_utility_predictions_sample.csv",
        sample_rows,
        [
            "model_experiment_id",
            "official_parcel_id",
            "pin14",
            "snapshot_year",
            "target_name",
            "actual_label",
            "experimental_probability",
            "probability_rank",
            "probability_percentile",
            "model_name",
            "feature_set_name",
            "no_frontend_exposure",
            "production_ready",
            "caveat",
        ],
    )

    score_table_rows = 0
    if args.write_score_table:
        score_table_rows = write_planning_pipeline_utility_score_table(
            engine,
            selected,
            args.target,
            phase16b_result["selected_model_name"],
            "planning_pipeline_utility_current_context",
            split,
        )

    metrics = {
        "experiment_id": EXPERIMENT_ID,
        "target": args.target,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "current_context_only": True,
        "time_safe_for_training": False,
        "concord_only_features_present": True,
        "utility_proxy_only_features_present": True,
        "transportation_enhanced": model_metrics_payload(transportation_result),
        "planning_pipeline_utility_enhanced": model_metrics_payload(phase16b_result),
        "comparison_on_selected_best_models": comparison,
        "planning_pipeline_utility_helped": planning_pipeline_utility_helped,
        "top_planning_pipeline_utility_features": top_phase16b_features[:15],
        "no_frontend_exposure": True,
    }
    write_json(output_dir / "phase16b_planning_pipeline_utility_model_comparison_metrics.json", metrics)
    write_json(
        output_dir / "phase16b_planning_pipeline_utility_temporal_split_summary.json",
        {
            **dry_run_payload,
            "rows": {
                "transportation_enhanced": transportation_result["rows"],
                "planning_pipeline_utility_enhanced": phase16b_result["rows"],
            },
            "max_observed_new_construction_permit_date": observed_date,
        },
    )
    render_caveats(CAVEATS_PATH, excluded_years, comparison)

    summary = {
        "phase": "16B_planning_pipeline_utility_model_comparison",
        "generated_at": datetime.now().isoformat(),
        "experiment_id": EXPERIMENT_ID,
        "target_used": args.target,
        "feature_table": f"public.{ENHANCED_FEATURE_TABLE}",
        "train_years": split.train_years,
        "validation_years": split.validation_years,
        "test_years": split.test_years,
        "excluded_snapshot_years": excluded_years,
        "transportation_enhanced_metrics": transportation_test,
        "planning_pipeline_utility_enhanced_metrics": phase16b_test,
        "metric_comparison": comparison,
        "planning_pipeline_utility_helped": planning_pipeline_utility_helped,
        "top_planning_pipeline_utility_features": top_phase16b_features[:15],
        "experiment_score_table_created": args.write_score_table,
        "experiment_score_rows": score_table_rows,
        "current_context_only": True,
        "time_safe_for_training": False,
        "concord_only_features_present": True,
        "utility_proxy_only_features_present": True,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "no_frontend_exposure": True,
        "caveats": [
            "Internal exploratory experiment only; no frontend exposure.",
            "Central Area Plan features are Concord-only/current-context and not countywide future land-use coverage.",
            "Accela plan reviews are early pipeline signals, not approvals.",
            "WSACC features are utility proximity proxies only and do not represent capacity or allocation.",
            "Tax Parcels Full fields are current enrichment context and not historical value snapshots.",
        ],
        "recommended_next_step": "Phase 16C should acquire dated official development pipeline, utility capacity/allocation, and countywide future land-use records before any production modeling claim.",
        "outputs": {
            "metrics": str(output_dir / "phase16b_planning_pipeline_utility_model_comparison_metrics.json"),
            "feature_importance": str(output_dir / "phase16b_planning_pipeline_utility_feature_importance.csv"),
            "prediction_sample": str(output_dir / "phase16b_planning_pipeline_utility_predictions_sample.csv"),
            "temporal_split": str(output_dir / "phase16b_planning_pipeline_utility_temporal_split_summary.json"),
            "caveats": str(CAVEATS_PATH),
            "summary": str(ROOT_OUTPUT_SUMMARY),
        },
    }
    write_json(ROOT_OUTPUT_SUMMARY, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
