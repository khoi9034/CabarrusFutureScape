"""Train internal Phase 10E zoning-enhanced model comparison.

This script is internal-only. It does not publish production scores, expose a
frontend probability, or modify Phase 10A/10B/10C artifacts.
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

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_SCRIPT = REPO_ROOT / "cfs-data-pipelines" / "modeling" / "train_development_baseline_model.py"
OUTPUT_DIR_DEFAULT = REPO_ROOT / "outputs" / "modeling" / "development_prediction"
ROOT_OUTPUT_SUMMARY = REPO_ROOT / "outputs" / "phase10e_zoning_enhanced_model_comparison_summary.json"
MODEL_CARD_PATH = REPO_ROOT / "docs" / "modeling" / "development_prediction_zoning_enhanced_model_card.md"
PHASE10C_METRICS_PATH = OUTPUT_DIR_DEFAULT / "phase10c_model_metrics.json"

ENHANCED_FEATURE_TABLE = "parcel_development_prediction_features_zoning_enhanced"
EXPERIMENT_ID = "phase10e_zoning_enhanced_v1"

ZONING_ENHANCED_NUMERIC_FEATURES = [
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

ZONING_ENHANCED_BOOLEAN_FEATURES = [
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

ZONING_ENHANCED_CATEGORICAL_FEATURES = [
    "historical_zoning_code",
    "historical_zoning_general_category",
    "historical_zoning_jurisdiction",
    "zoning_temporal_status",
    "latest_zoning_change_type",
    "latest_zoning_intensity_change",
    "zoning_change_confidence",
]

ZONING_FEATURE_NAMES = {
    "zoning_source_age_years",
    "zoning_change_count_prior_5yr",
    "years_since_last_zoning_change",
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
    "historical_zoning_code",
    "historical_zoning_general_category",
    "historical_zoning_jurisdiction",
    "zoning_temporal_status",
    "latest_zoning_change_type",
    "latest_zoning_intensity_change",
    "zoning_change_confidence",
}


def load_baseline_module():
    spec = importlib.util.spec_from_file_location("phase10c_baseline_model_for_phase10e", BASELINE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


baseline = load_baseline_module()
baseline.FEATURE_TABLE = ENHANCED_FEATURE_TABLE
baseline.FEATURE_SETS["zoning_enhanced_history"] = {
    "numeric": ZONING_ENHANCED_NUMERIC_FEATURES,
    "boolean": ZONING_ENHANCED_BOOLEAN_FEATURES,
    "categorical": ZONING_ENHANCED_CATEGORICAL_FEATURES,
    "description": "Strict prior permit baseline plus historical zoning snapshot and map-change features.",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train Phase 10E zoning-enhanced comparison.")
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


def compare_metric_values(baseline_value: Any, enhanced_value: Any) -> dict[str, Any]:
    if baseline_value is None or enhanced_value is None:
        return {
            "baseline": baseline_value,
            "zoning_enhanced": enhanced_value,
            "absolute_improvement": None,
            "percent_improvement": None,
        }
    baseline_float = float(baseline_value)
    enhanced_float = float(enhanced_value)
    absolute = enhanced_float - baseline_float
    percent = (absolute / abs(baseline_float) * 100.0) if baseline_float != 0 else None
    return {
        "baseline": round(baseline_float, 6),
        "zoning_enhanced": round(enhanced_float, 6),
        "absolute_improvement": round(absolute, 6),
        "percent_improvement": round(percent, 4) if percent is not None else None,
    }


def load_phase10c_reference_metrics() -> dict[str, Any]:
    if not PHASE10C_METRICS_PATH.exists():
        return {}
    try:
        return json.loads(PHASE10C_METRICS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


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
    df = baseline.read_model_frame(engine, target, feature_set_name, split)
    frames = baseline.split_frame(df, split, target)
    trained = baseline.fit_models(frames, feature_set_name, random_state, skip_tree_model)
    selected_model_name = baseline.best_model_name(trained)
    selected = trained[selected_model_name]
    return {
        "feature_set_name": feature_set_name,
        "feature_columns": feature_columns,
        "frames": frames,
        "trained": trained,
        "selected_model_name": selected_model_name,
        "selected": selected,
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


def zoning_feature_importance_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    rows = baseline.feature_importance_rows(
        result["trained"]["logistic_regression"]["model"],
        "logistic_regression",
        result["feature_set_name"],
    )
    for row in rows:
        row["is_zoning_feature"] = any(
            row["feature_name"] == name or row["feature_name"].startswith(f"{name}_")
            for name in ZONING_FEATURE_NAMES
        )
        if row["is_zoning_feature"]:
            row["feature_group"] = "historical_zoning_features"
            row["temporal_status"] = "historical_snapshot_time_safe"
            row["leakage_risk"] = "low_to_medium_staleness_review"
    return rows


def render_caveats(path: Path, excluded_years: list[int], comparison: dict[str, Any]) -> None:
    content = f"""# Phase 10E Zoning-Enhanced Model Caveats

- This is an internal model comparison only.
- No prediction probabilities are exposed in the frontend.
- No public prediction endpoint is added.
- `production_ready=false`, `model_active=false`, and
  `prediction_probability_available=false` remain mandatory.
- Excluded incomplete future-window snapshot years: `{excluded_years}`.
- Historical zoning snapshots never use current zoning as past zoning.
- Zoning source years and map-change years are constrained to be less than or
  equal to the model snapshot year.
- Zoning changes are map-change detections, not official rezoning case
  approvals.
- Post-2015 zoning snapshots are time-safe but stale when they use the latest
  2015 historical source as `prior_available_year`.

## Comparison Summary

```json
{json.dumps(comparison, indent=2)}
```
"""
    path.write_text(content, encoding="utf-8")


def render_model_card(path: Path, split, metrics: dict[str, Any], top_zoning_features: list[dict[str, Any]]) -> None:
    feature_lines = "\n".join(
        f"- `{row['feature_name']}`: coefficient `{row.get('coefficient')}`"
        for row in top_zoning_features[:12]
    ) or "- No zoning coefficient rows were available from the logistic screen."
    content = f"""# Development Prediction Zoning-Enhanced Model Card

## Status

Phase 10E is an internal model-comparison experiment. It is not production
ready, does not expose prediction probabilities, and does not add a frontend or
public API prediction experience.

## Data

Feature table:

`public.parcel_development_prediction_features_zoning_enhanced`

The table preserves Phase 10B rows and appends historical zoning snapshot and
map-change features from:

- `public.parcel_zoning_snapshot_year`
- `public.parcel_zoning_change_events`

## Temporal Split

- Train: `{min(split.train_years)}-{max(split.train_years)}`
- Validation: `{min(split.validation_years)}-{max(split.validation_years)}`
- Test: `{min(split.test_years)}-{max(split.test_years)}`

Years after 2022 are excluded for the 3-year target because their full future
window is incomplete.

## Zoning Feature Caveats

- Historical zoning source years must be `<= snapshot_year`.
- Zoning change years must be `<= snapshot_year`.
- Current zoning is never used as historical zoning.
- Post-2015 zoning context is stale when the most recent historical source is
  2015.
- Detected zoning changes are map changes, not official rezoning approvals.

## Metrics

```json
{json.dumps(metrics, indent=2)}
```

## Top Zoning Coefficient Signals

{feature_lines}

## Future Improvements

- Official rezoning case dates with old/new zoning.
- Future land-use and subdivision approval records.
- Road/accessibility and utility capacity.
- Official school enrollment/capacity.
- Economic and year controls.
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
            "baseline": baseline.feature_columns_for_set("strict_time_safe_baseline"),
            "zoning_enhanced": baseline.feature_columns_for_set("zoning_enhanced_history"),
        },
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }
    if args.dry_run:
        write_json(output_dir / "phase10e_temporal_split_summary.json", dry_run_payload)
        print(json.dumps(dry_run_payload, indent=2))
        return 0

    baseline_result = train_feature_set(
        engine,
        args.target,
        "strict_time_safe_baseline",
        split,
        args.random_state,
        args.skip_tree_model,
    )
    enhanced_result = train_feature_set(
        engine,
        args.target,
        "zoning_enhanced_history",
        split,
        args.random_state,
        args.skip_tree_model,
    )

    baseline_selected_test = baseline_result["selected"]["test_metrics"]
    enhanced_selected_test = enhanced_result["selected"]["test_metrics"]
    metric_names = [
        "roc_auc",
        "average_precision_pr_auc",
        "precision_at_top_1_pct",
        "precision_at_top_5_pct",
        "recall_at_top_5_pct",
        "lift_at_top_5_pct",
        "brier_score",
    ]
    comparison = {
        name: compare_metric_values(baseline_selected_test.get(name), enhanced_selected_test.get(name))
        for name in metric_names
    }
    pr_improvement = comparison["average_precision_pr_auc"]["absolute_improvement"]
    lift_improvement = comparison["lift_at_top_5_pct"]["absolute_improvement"]
    meaningful = bool(
        pr_improvement is not None
        and pr_improvement > 0.002
        and lift_improvement is not None
        and lift_improvement > 0
    )

    importance_rows = zoning_feature_importance_rows(enhanced_result)
    top_zoning_features = [
        row for row in importance_rows if row.get("is_zoning_feature")
    ][:25]
    write_csv(
        output_dir / "phase10e_zoning_enhanced_feature_importance.csv",
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
            "is_zoning_feature",
        ],
    )

    selected = enhanced_result["selected"]
    sample_rows = baseline.prediction_sample_rows(
        selected["x_test_metadata"],
        selected["y_test"],
        selected["test_probability"],
        args.target,
        enhanced_result["selected_model_name"],
        "zoning_enhanced_history",
        EXPERIMENT_ID,
    )
    write_csv(
        output_dir / "phase10e_zoning_enhanced_predictions_sample.csv",
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
        score_table_rows = baseline.write_score_table(
            engine,
            selected["x_test_metadata"],
            selected["test_probability"],
            args.target,
            enhanced_result["selected_model_name"],
            "zoning_enhanced_history",
            EXPERIMENT_ID,
            split,
        )

    metrics = {
        "experiment_id": EXPERIMENT_ID,
        "target": args.target,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "phase10c_reference_metrics": load_phase10c_reference_metrics(),
        "retrained_baseline": model_metrics_payload(baseline_result),
        "zoning_enhanced": model_metrics_payload(enhanced_result),
        "comparison_on_selected_best_models": comparison,
        "improvement_meaningful": meaningful,
        "zoning_features_appear_important": bool(top_zoning_features),
        "top_zoning_features": top_zoning_features[:15],
    }
    write_json(output_dir / "phase10e_model_comparison_metrics.json", metrics)

    split_summary = {
        **dry_run_payload,
        "rows": {
            "baseline": baseline_result["rows"],
            "zoning_enhanced": enhanced_result["rows"],
        },
        "max_observed_new_construction_permit_date": observed_date,
    }
    write_json(output_dir / "phase10e_temporal_split_summary.json", split_summary)

    render_caveats(
        output_dir / "phase10e_model_caveats.md",
        excluded_years,
        comparison,
    )
    render_model_card(MODEL_CARD_PATH, split, metrics, top_zoning_features)

    summary = {
        "phase": "10E",
        "generated_at": datetime.now().isoformat(),
        "experiment_id": EXPERIMENT_ID,
        "target_used": args.target,
        "feature_table": f"public.{ENHANCED_FEATURE_TABLE}",
        "train_years": split.train_years,
        "validation_years": split.validation_years,
        "test_years": split.test_years,
        "excluded_snapshot_years": excluded_years,
        "baseline_metrics": baseline_selected_test,
        "zoning_enhanced_metrics": enhanced_selected_test,
        "metric_comparison": comparison,
        "improvement_meaningful": meaningful,
        "top_zoning_features": top_zoning_features[:15],
        "experiment_score_table_created": args.write_score_table,
        "experiment_score_table": "public.development_prediction_model_experiment_scores"
        if args.write_score_table
        else None,
        "experiment_score_rows": score_table_rows,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "no_frontend_exposure": True,
        "caveats": [
            "Internal experiment only; no frontend exposure.",
            "Zoning changes are map-change detections, not official rezoning case approvals.",
            "Post-2015 zoning snapshots are time-safe but stale.",
            "Current zoning was not used as historical zoning.",
        ],
        "recommended_phase10f_next_step": "Review zoning-enhanced gains and add official rezoning case/future land-use/accessibility controls before any production discussion.",
        "outputs": {
            "metrics": str(output_dir / "phase10e_model_comparison_metrics.json"),
            "feature_importance": str(output_dir / "phase10e_zoning_enhanced_feature_importance.csv"),
            "prediction_sample": str(output_dir / "phase10e_zoning_enhanced_predictions_sample.csv"),
            "temporal_split": str(output_dir / "phase10e_temporal_split_summary.json"),
            "caveats": str(output_dir / "phase10e_model_caveats.md"),
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
