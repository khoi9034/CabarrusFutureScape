"""Train internal Phase 13C transportation-enhanced model comparison.

This experiment is exploratory because transportation features are
current-context only. It does not activate a production model, expose frontend
probabilities, or create a public parcel prediction endpoint.
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
    REPO_ROOT / "outputs" / "phase13c_transportation_enhanced_model_comparison_summary.json"
)
CAVEATS_PATH = OUTPUT_DIR_DEFAULT / "phase13c_transportation_model_caveats.md"

ENHANCED_FEATURE_TABLE = "parcel_development_prediction_features_transportation_enhanced"
EXPERIMENT_ID = "phase13c_transportation_enhanced_v1"

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

TRANSPORTATION_FEATURE_NAMES = set(TRANSPORTATION_NUMERIC_FEATURES + TRANSPORTATION_BOOLEAN_FEATURES)


def load_baseline_module():
    spec = importlib.util.spec_from_file_location("phase10c_baseline_model_for_phase13c", BASELINE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


baseline = load_baseline_module()
baseline.FEATURE_TABLE = ENHANCED_FEATURE_TABLE
baseline.FEATURE_SETS["zoning_enhanced_history"] = {
    "numeric": ZONING_NUMERIC_FEATURES,
    "boolean": ZONING_BOOLEAN_FEATURES,
    "categorical": ZONING_CATEGORICAL_FEATURES,
    "description": "Strict prior permit baseline plus historical zoning snapshot and map-change features.",
}
baseline.FEATURE_SETS["zoning_transportation_current_context"] = {
    "numeric": [*ZONING_NUMERIC_FEATURES, *TRANSPORTATION_NUMERIC_FEATURES],
    "boolean": [*ZONING_BOOLEAN_FEATURES, *TRANSPORTATION_BOOLEAN_FEATURES],
    "categorical": ZONING_CATEGORICAL_FEATURES,
    "description": "Exploratory zoning-enhanced model plus current-context transportation accessibility/STIP/AADT fields.",
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
            "zoning_enhanced": reference_value,
            "transportation_enhanced": enhanced_value,
            "absolute_improvement": None,
            "percent_improvement": None,
        }
    reference_float = float(reference_value)
    enhanced_float = float(enhanced_value)
    absolute = enhanced_float - reference_float
    percent = (absolute / abs(reference_float) * 100.0) if reference_float != 0 else None
    return {
        "zoning_enhanced": round(reference_float, 6),
        "transportation_enhanced": round(enhanced_float, 6),
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
        is_transportation = any(
            row["feature_name"] == name or row["feature_name"].startswith(f"{name}_")
            for name in TRANSPORTATION_FEATURE_NAMES
        )
        row["is_transportation_feature"] = is_transportation
        if is_transportation:
            row["feature_group"] = "transportation_current_context_features"
            row["temporal_status"] = "current_context_only"
            row["leakage_risk"] = "medium_for_historical_backtesting"
    return rows


def write_transportation_score_table(engine, selected: dict[str, Any], target: str, model_name: str, feature_set: str, split) -> int:
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
                  caveat = 'internal_current_context_transportation_experiment_not_for_public_decision'
                WHERE model_experiment_id = :experiment_id
                """,
            ),
            {"experiment_id": EXPERIMENT_ID},
        )
    return rows_written


def render_caveats(path: Path, excluded_years: list[int], comparison: dict[str, Any]) -> None:
    content = f"""# Phase 13C Transportation-Enhanced Model Caveats

- This is an internal exploratory comparison only.
- Transportation features are current-context only and are not strict
  historical training features.
- No prediction probabilities are exposed in the frontend.
- No parcel-level ranking classes are exposed.
- No public parcel prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `{excluded_years}`.
- STIP is a 2026-2035 planned/funded project program and does not represent a
  complete local transportation plan history.
- AADT station proximity is traffic-demand context, not parcel-specific trip
  generation.
- Future production-safe transportation modeling would need historical road
  networks, dated STIP/project records, construction/completion dates,
  historical AADT by year, and local transportation project GIS.

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
            "zoning_enhanced_history": baseline.feature_columns_for_set("zoning_enhanced_history"),
            "zoning_transportation_current_context": baseline.feature_columns_for_set(
                "zoning_transportation_current_context",
            ),
        },
        "current_context_only": True,
        "transportation_time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }
    if args.dry_run:
        write_json(output_dir / "phase13c_transportation_temporal_split_summary.json", dry_run_payload)
        print(json.dumps(dry_run_payload, indent=2))
        return 0

    zoning_result = train_feature_set(
        engine,
        args.target,
        "zoning_enhanced_history",
        split,
        args.random_state,
        args.skip_tree_model,
    )
    transportation_result = train_feature_set(
        engine,
        args.target,
        "zoning_transportation_current_context",
        split,
        args.random_state,
        args.skip_tree_model,
    )

    zoning_test = zoning_result["selected"]["test_metrics"]
    transportation_test = transportation_result["selected"]["test_metrics"]
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
        name: compare_metric_values(zoning_test.get(name), transportation_test.get(name))
        for name in metric_names
    }
    pr_improvement = comparison["average_precision_pr_auc"]["absolute_improvement"]
    lift_improvement = comparison["lift_at_top_5_pct"]["absolute_improvement"]
    transportation_helped = bool(
        pr_improvement is not None
        and pr_improvement > 0.001
        and lift_improvement is not None
        and lift_improvement > 0
    )

    importance_rows = feature_importance_rows(transportation_result)
    top_transportation_features = [
        row for row in importance_rows if row.get("is_transportation_feature")
    ][:25]
    write_csv(
        output_dir / "phase13c_transportation_feature_importance.csv",
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
            "is_transportation_feature",
        ],
    )

    selected = transportation_result["selected"]
    sample_rows = baseline.prediction_sample_rows(
        selected["x_test_metadata"],
        selected["y_test"],
        selected["test_probability"],
        args.target,
        transportation_result["selected_model_name"],
        "zoning_transportation_current_context",
        EXPERIMENT_ID,
    )
    for row in sample_rows:
        row["caveat"] = "internal_current_context_transportation_experiment_not_for_public_decision"
    write_csv(
        output_dir / "phase13c_transportation_predictions_sample.csv",
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
        score_table_rows = write_transportation_score_table(
            engine,
            selected,
            args.target,
            transportation_result["selected_model_name"],
            "zoning_transportation_current_context",
            split,
        )

    metrics = {
        "experiment_id": EXPERIMENT_ID,
        "target": args.target,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "current_context_only": True,
        "transportation_time_safe_for_training": False,
        "zoning_enhanced": model_metrics_payload(zoning_result),
        "transportation_enhanced": model_metrics_payload(transportation_result),
        "comparison_on_selected_best_models": comparison,
        "transportation_helped": transportation_helped,
        "top_transportation_features": top_transportation_features[:15],
        "no_frontend_exposure": True,
    }
    write_json(output_dir / "phase13c_transportation_model_comparison_metrics.json", metrics)
    write_json(
        output_dir / "phase13c_transportation_temporal_split_summary.json",
        {
            **dry_run_payload,
            "rows": {
                "zoning_enhanced": zoning_result["rows"],
                "transportation_enhanced": transportation_result["rows"],
            },
            "max_observed_new_construction_permit_date": observed_date,
        },
    )
    render_caveats(CAVEATS_PATH, excluded_years, comparison)

    summary = {
        "phase": "13C_transportation_enhanced_model_comparison",
        "generated_at": datetime.now().isoformat(),
        "experiment_id": EXPERIMENT_ID,
        "target_used": args.target,
        "feature_table": f"public.{ENHANCED_FEATURE_TABLE}",
        "train_years": split.train_years,
        "validation_years": split.validation_years,
        "test_years": split.test_years,
        "excluded_snapshot_years": excluded_years,
        "zoning_enhanced_metrics": zoning_test,
        "transportation_enhanced_metrics": transportation_test,
        "metric_comparison": comparison,
        "transportation_helped": transportation_helped,
        "top_transportation_features": top_transportation_features[:15],
        "experiment_score_table_created": args.write_score_table,
        "experiment_score_rows": score_table_rows,
        "current_context_only": True,
        "transportation_time_safe_for_training": False,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "no_frontend_exposure": True,
        "caveats": [
            "Internal exploratory experiment only; no frontend exposure.",
            "Transportation features are current-context only and not strict historical training features.",
            "Do not interpret this as a production-ready model comparison.",
            "Future time-safe transportation modeling needs historical roads, dated project records, and historical AADT by year.",
        ],
        "recommended_next_step": "Phase 13D should add official historical/datable transportation project sources or run a governance review before any public-facing transportation signal.",
        "outputs": {
            "metrics": str(output_dir / "phase13c_transportation_model_comparison_metrics.json"),
            "feature_importance": str(output_dir / "phase13c_transportation_feature_importance.csv"),
            "prediction_sample": str(output_dir / "phase13c_transportation_predictions_sample.csv"),
            "temporal_split": str(output_dir / "phase13c_transportation_temporal_split_summary.json"),
            "caveats": str(CAVEATS_PATH),
            "summary": str(ROOT_OUTPUT_SUMMARY),
        },
    }
    write_json(ROOT_OUTPUT_SUMMARY, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
