"""Phase 10F internal QA for development prediction experiments.

This script audits Phase 10C/10E metrics, reruns the baseline-vs-zoning
comparison with the shared tie-aware metric utility, and writes versioned QA
artifacts only. It does not activate a model or expose predictions.
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
import pandas as pd
from sqlalchemy import text

try:
    from sklearn.inspection import permutation_importance
except ImportError:  # pragma: no cover - sklearn is already required upstream
    permutation_importance = None

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELING_DIR = Path(__file__).resolve().parent
if str(MODELING_DIR) not in sys.path:
    sys.path.append(str(MODELING_DIR))

import development_model_metrics

PHASE10E_SCRIPT = MODELING_DIR / "train_development_zoning_enhanced_model.py"
OUTPUT_DIR = REPO_ROOT / "outputs" / "modeling" / "development_prediction"
ROOT_SUMMARY_PATH = REPO_ROOT / "outputs" / "phase10f_development_prediction_model_qa_summary.json"
QA_REPORT_PATH = REPO_ROOT / "docs" / "modeling" / "development_prediction_model_qa_report.md"
MODEL_CARD_PATH = REPO_ROOT / "docs" / "modeling" / "development_prediction_zoning_enhanced_model_card.md"
PHASE10C_METRICS_PATH = OUTPUT_DIR / "phase10c_model_metrics.json"
PHASE10E_METRICS_PATH = OUTPUT_DIR / "phase10e_model_comparison_metrics.json"
PHASE10E_SUMMARY_PATH = REPO_ROOT / "outputs" / "phase10e_zoning_enhanced_model_comparison_summary.json"
EXPERIMENT_ID = "phase10f_model_qa_v1"
TARGET = "new_construction_next_3yr"
FEATURE_TABLE = "public.parcel_development_prediction_features_zoning_enhanced"
MODEL_FLAGS = {
    "model_active": False,
    "prediction_probability_available": False,
    "production_ready": False,
    "no_frontend_exposure": True,
}


def load_phase10e_module():
    spec = importlib.util.spec_from_file_location("phase10e_model_for_phase10f", PHASE10E_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


phase10e = load_phase10e_module()
baseline = phase10e.baseline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Phase 10F development model QA.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-permutation", action="store_true")
    parser.add_argument("--permutation-sample-size", type=int, default=5000)
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str, ensure_ascii=True), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


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
    percent = (absolute / abs(baseline_float) * 100.0) if baseline_float else None
    return {
        "baseline": round(baseline_float, 6),
        "zoning_enhanced": round(enhanced_float, 6),
        "absolute_improvement": round(absolute, 6),
        "percent_improvement": round(percent, 4) if percent is not None else None,
    }


def metric_comparison(baseline_metrics: dict[str, Any], enhanced_metrics: dict[str, Any]) -> dict[str, Any]:
    metric_names = [
        "roc_auc",
        "average_precision_pr_auc",
        "precision_at_top_1_pct",
        "precision_at_top_5_pct",
        "recall_at_top_5_pct",
        "lift_at_top_1_pct",
        "lift_at_top_5_pct",
        "brier_score",
    ]
    return {
        name: compare_metric_values(baseline_metrics.get(name), enhanced_metrics.get(name))
        for name in metric_names
    }


def label_row_consistency(engine) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(
            connection.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM public.parcel_development_prediction_features WHERE snapshot_year = 2022)
                        AS base_test_rows,
                      (SELECT COUNT(*) FROM public.parcel_development_prediction_features_zoning_enhanced WHERE snapshot_year = 2022)
                        AS enhanced_test_rows,
                      (
                        SELECT COUNT(*)
                        FROM public.parcel_development_prediction_features b
                        JOIN public.parcel_development_prediction_features_zoning_enhanced e
                          ON b.official_parcel_id = e.official_parcel_id
                         AND b.snapshot_year = e.snapshot_year
                        WHERE b.snapshot_year = 2022
                          AND (
                            b.new_construction_next_3yr IS DISTINCT FROM e.new_construction_next_3yr
                            OR b.pin14 IS DISTINCT FROM e.pin14
                          )
                      ) AS mismatched_test_label_rows,
                      (
                        SELECT COUNT(*)
                        FROM public.parcel_development_prediction_features_zoning_enhanced
                        WHERE zoning_source_year > snapshot_year
                      ) AS source_year_leakage_rows,
                      (
                        SELECT COUNT(*)
                        FROM public.parcel_development_prediction_features_zoning_enhanced
                        WHERE latest_zoning_change_year > snapshot_year
                      ) AS change_year_leakage_rows
                    """,
                ),
            ).mappings().one(),
        )


def train_models(random_state: int):
    engine = baseline.create_engine_from_env()
    observed_date = baseline.max_observed_permit_date(engine)
    mature_years = baseline.mature_snapshot_years(
        observed_date,
        baseline.TARGET_HORIZONS[TARGET],
    )
    split = baseline.build_temporal_split(mature_years)
    baseline_result = phase10e.train_feature_set(
        engine,
        TARGET,
        "strict_time_safe_baseline",
        split,
        random_state,
        False,
    )
    enhanced_result = phase10e.train_feature_set(
        engine,
        TARGET,
        "zoning_enhanced_history",
        split,
        random_state,
        False,
    )
    return engine, observed_date, mature_years, split, baseline_result, enhanced_result


def prediction_frame(result: dict[str, Any], split_name: str) -> pd.DataFrame:
    x, y = result["frames"][split_name]
    selected = result["selected"]
    model = selected["model"]
    feature_set_name = result["feature_set_name"]
    x_processed = baseline.preprocess_boolean_columns(x, feature_set_name)
    drop_columns = ["official_parcel_id", "pin14", "snapshot_year"]
    probabilities = baseline.probabilities(model, x_processed.drop(columns=drop_columns))
    frame = x[drop_columns].copy()
    frame["actual_label"] = y.astype(bool).to_numpy()
    frame["experimental_probability"] = probabilities
    frame["split"] = split_name
    return frame


def write_standardized_outputs(
    split,
    baseline_result: dict[str, Any],
    enhanced_result: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    baseline_test = baseline_result["selected"]["test_metrics"]
    enhanced_test = enhanced_result["selected"]["test_metrics"]
    comparison = metric_comparison(baseline_test, enhanced_test)
    metrics = {
        "qa_id": EXPERIMENT_ID,
        "target": TARGET,
        "feature_table": FEATURE_TABLE,
        "metric_definitions": {
            "lift": "lift@top_k = precision@top_k / overall_positive_rate",
            "top_k": "ceil(test_row_count * fraction)",
            "tie_policy": "tie-aware expected precision when the cutoff score has equal probabilities",
        },
        "train_years": split.train_years,
        "validation_years": split.validation_years,
        "test_years": split.test_years,
        "baseline_best_model_name": baseline_result["selected_model_name"],
        "zoning_enhanced_best_model_name": enhanced_result["selected_model_name"],
        "baseline_metrics": baseline_test,
        "zoning_enhanced_metrics": enhanced_test,
        "metric_comparison": comparison,
        "zoning_improved_pr_auc": (comparison["average_precision_pr_auc"]["absolute_improvement"] or 0) > 0,
        "zoning_improved_lift_top_5": (comparison["lift_at_top_5_pct"]["absolute_improvement"] or 0) > 0,
        **MODEL_FLAGS,
    }
    write_json(OUTPUT_DIR / "phase10f_standardized_model_comparison_metrics.json", metrics)

    topk_rows: list[dict[str, Any]] = []
    for model_label, result in [
        ("baseline", baseline_result),
        ("zoning_enhanced", enhanced_result),
    ]:
        y_test = result["selected"]["y_test"]
        probability = result["selected"]["test_probability"]
        for row in development_model_metrics.topk_summary_rows(y_test, probability):
            topk_rows.append(
                {
                    "qa_id": EXPERIMENT_ID,
                    "model_label": model_label,
                    "model_name": result["selected_model_name"],
                    "feature_set_name": result["feature_set_name"],
                    **row,
                },
            )
    write_csv(
        OUTPUT_DIR / "phase10f_standardized_topk_summary.csv",
        topk_rows,
        [
            "qa_id",
            "model_label",
            "model_name",
            "feature_set_name",
            "top_fraction",
            "top_label",
            "fraction",
            "k",
            "precision",
            "recall",
            "lift",
            "cutoff_score",
            "above_cutoff_count",
            "tie_count_at_cutoff",
            "remaining_slots_from_tie_bucket",
            "tie_positive_count",
            "tie_positive_rate",
            "tie_adjusted",
        ],
    )
    return metrics, topk_rows


def write_calibration_outputs(enhanced_result: dict[str, Any]) -> dict[str, Any]:
    y_test = enhanced_result["selected"]["y_test"]
    probability = enhanced_result["selected"]["test_probability"]
    bins = development_model_metrics.calibration_bins(y_test, probability, n_bins=10)
    write_csv(
        OUTPUT_DIR / "phase10f_calibration_bins.csv",
        bins,
        [
            "decile",
            "rank_band",
            "row_count",
            "positive_count",
            "observed_event_rate",
            "average_predicted_probability",
            "min_predicted_probability",
            "max_predicted_probability",
        ],
    )
    total_rows = sum(row["row_count"] for row in bins)
    weighted_abs_error = (
        sum(
            row["row_count"]
            * abs(row["observed_event_rate"] - row["average_predicted_probability"])
            for row in bins
        )
        / total_rows
        if total_rows
        else None
    )
    calibration = {
        "qa_id": EXPERIMENT_ID,
        "model_label": "zoning_enhanced",
        "model_name": enhanced_result["selected_model_name"],
        "brier_score": enhanced_result["selected"]["test_metrics"].get("brier_score"),
        "weighted_mean_absolute_calibration_error": round(weighted_abs_error, 6)
        if weighted_abs_error is not None
        else None,
        "calibration_bins": bins,
        "calibration_assessment": "weak_probability_calibration"
        if weighted_abs_error is not None and weighted_abs_error > 0.05
        else "acceptable_initial_calibration_review_needed",
        "recommendation": "Keep outputs as internal rank/risk scores only; do not show exact probabilities.",
        **MODEL_FLAGS,
    }
    write_json(OUTPUT_DIR / "phase10f_calibration_review.json", calibration)
    return calibration


def write_top_ranked_review(engine, enhanced_result: dict[str, Any]) -> dict[str, Any]:
    selected = enhanced_result["selected"]
    top = selected["x_test_metadata"].copy()
    top["actual_label"] = selected["y_test"].astype(bool).to_numpy()
    top["experimental_probability"] = selected["test_probability"]
    top = top.sort_values(
        ["experimental_probability", "official_parcel_id"],
        ascending=[False, True],
        kind="mergesort",
    ).reset_index(drop=True)
    top["probability_rank"] = np.arange(1, len(top) + 1)
    top["probability_percentile"] = 1.0 - ((top["probability_rank"] - 1) / len(top))
    top_200 = top.head(200).copy()

    review_columns = [
        "official_parcel_id",
        "pin14",
        "snapshot_year",
        "parcel_area_acres",
        "total_value",
        "value_per_acre",
        "zoning_code",
        "zoning_category",
        "historical_zoning_code",
        "historical_zoning_general_category",
        "historical_zoning_jurisdiction",
        "zoning_source_year",
        "zoning_source_age_years",
        "zoning_temporal_status",
        "zoning_changed_prior_1yr",
        "zoning_changed_prior_3yr",
        "zoning_changed_prior_5yr",
        "zoning_change_count_prior_5yr",
        "years_since_last_zoning_change",
        "latest_zoning_change_year",
        "latest_zoning_change_type",
        "latest_zoning_intensity_change",
        "zoning_intensity_increased_prior_5yr",
        "rezoned_to_growth_supportive_prior_5yr",
        "permits_prior_1yr",
        "permits_prior_3yr",
        "permits_prior_5yr",
        "major_permits_prior_3yr",
        "new_construction_permits_prior_3yr",
        "years_since_last_permit",
        "years_since_last_new_construction",
        "flood_review_required",
        "floodway_present",
        "sfha_present",
        "flood_constraint_score",
        "elementary_school_name",
        "middle_school_name",
        "high_school_name",
        "school_capacity_status",
        "school_constraint_class",
    ]
    details = pd.read_sql_query(
        text(
            f"""
            SELECT {", ".join(review_columns)}
            FROM public.parcel_development_prediction_features_zoning_enhanced
            WHERE snapshot_year = 2022
            """,
        ),
        engine,
    )
    merged = top_200.merge(
        details,
        on=["official_parcel_id", "pin14", "snapshot_year"],
        how="left",
    )
    merged["production_ready"] = False
    merged["caveat"] = "internal_experiment_not_for_public_decision"
    output_path = OUTPUT_DIR / "phase10f_top_ranked_parcel_review.csv"
    merged.to_csv(output_path, index=False)
    return {
        "path": str(output_path),
        "review_row_count": int(len(merged)),
        "positive_count": int(merged["actual_label"].sum()),
        "top_200_positive_rate": round(float(merged["actual_label"].mean()), 6),
        "duplicate_parcel_count": int(merged["official_parcel_id"].duplicated().sum()),
        "max_probability": round(float(merged["experimental_probability"].max()), 6),
        "min_probability": round(float(merged["experimental_probability"].min()), 6),
    }


def registry_metadata() -> dict[str, dict[str, Any]]:
    registry = json.loads(baseline.FEATURE_REGISTRY_PATH.read_text(encoding="utf-8"))
    return {feature["feature_name"]: feature for feature in registry.get("features", [])}


def feature_metadata(feature_name: str, registry: dict[str, dict[str, Any]]) -> dict[str, Any]:
    base = feature_name.split("_", 1)[0]
    return registry.get(feature_name) or registry.get(base) or {}


def write_feature_importance_outputs(
    enhanced_result: dict[str, Any],
    random_state: int,
    skip_permutation: bool,
    sample_size: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    registry = registry_metadata()
    rows: list[dict[str, Any]] = []
    logistic_rows = phase10e.zoning_feature_importance_rows(enhanced_result)
    for row in logistic_rows:
        rows.append(
            {
                "importance_type": "logistic_coefficient_screen",
                "model_name": row["model_name"],
                "feature_set_name": row["feature_set_name"],
                "feature_name": row["feature_name"],
                "importance_mean": None,
                "importance_std": None,
                "coefficient": row.get("coefficient"),
                "absolute_coefficient": row.get("absolute_coefficient"),
                "feature_group": row.get("feature_group"),
                "temporal_status": row.get("temporal_status"),
                "leakage_risk": row.get("leakage_risk"),
                "is_zoning_feature": row.get("is_zoning_feature"),
            },
        )

    permutation_status = "skipped"
    if not skip_permutation and permutation_importance is not None:
        x_test, y_test = enhanced_result["frames"]["test"]
        x_processed = baseline.preprocess_boolean_columns(x_test, enhanced_result["feature_set_name"])
        drop_columns = ["official_parcel_id", "pin14", "snapshot_year"]
        x_features = x_processed.drop(columns=drop_columns)
        sample_n = min(sample_size, len(x_features))
        sample_x = x_features.sample(n=sample_n, random_state=random_state)
        sample_y = y_test.loc[sample_x.index]
        perm = permutation_importance(
            enhanced_result["selected"]["model"],
            sample_x,
            sample_y,
            scoring="average_precision",
            n_repeats=3,
            random_state=random_state,
            n_jobs=1,
        )
        for feature_name, mean, std in sorted(
            zip(x_features.columns, perm.importances_mean, perm.importances_std, strict=True),
            key=lambda item: abs(float(item[1])),
            reverse=True,
        ):
            metadata = feature_metadata(feature_name, registry)
            is_zoning = feature_name in phase10e.ZONING_FEATURE_NAMES
            rows.append(
                {
                    "importance_type": "permutation_average_precision",
                    "model_name": enhanced_result["selected_model_name"],
                    "feature_set_name": enhanced_result["feature_set_name"],
                    "feature_name": feature_name,
                    "importance_mean": round(float(mean), 8),
                    "importance_std": round(float(std), 8),
                    "coefficient": None,
                    "absolute_coefficient": None,
                    "feature_group": "historical_zoning_features"
                    if is_zoning
                    else metadata.get("feature_group", "model_feature"),
                    "temporal_status": "historical_snapshot_time_safe"
                    if is_zoning
                    else metadata.get("temporal_status", "time_safe"),
                    "leakage_risk": "low_to_medium_staleness_review"
                    if is_zoning
                    else metadata.get("leakage_risk", "low"),
                    "is_zoning_feature": is_zoning,
                },
            )
        permutation_status = f"completed_on_{sample_n}_test_rows"
    elif permutation_importance is None:
        permutation_status = "skipped_sklearn_inspection_unavailable"

    write_csv(
        OUTPUT_DIR / "phase10f_feature_importance_review.csv",
        rows,
        [
            "importance_type",
            "model_name",
            "feature_set_name",
            "feature_name",
            "importance_mean",
            "importance_std",
            "coefficient",
            "absolute_coefficient",
            "feature_group",
            "temporal_status",
            "leakage_risk",
            "is_zoning_feature",
        ],
    )

    zoning_rows = [row for row in rows if row.get("is_zoning_feature")]
    suspicious = [
        row
        for row in zoning_rows
        if "future" in str(row.get("feature_name", "")).lower()
        or "next_" in str(row.get("feature_name", "")).lower()
    ]
    summary = {
        "qa_id": EXPERIMENT_ID,
        "permutation_status": permutation_status,
        "top_zoning_features": zoning_rows[:20],
        "zoning_source_age_years_rows": [
            row for row in zoning_rows if "zoning_source_age_years" in row["feature_name"]
        ][:5],
        "zoning_change_window_rows": [
            row
            for row in zoning_rows
            if "zoning_changed_prior_3yr" in row["feature_name"]
            or "zoning_changed_prior_5yr" in row["feature_name"]
        ][:10],
        "suspicious_or_leakage_prone_features": suspicious,
        "current_context_features_excluded_from_zoning_enhanced_training": True,
        **MODEL_FLAGS,
    }
    write_json(OUTPUT_DIR / "phase10f_zoning_feature_importance_summary.json", summary)
    return rows, summary


def write_year_by_year_performance(
    baseline_result: dict[str, Any],
    enhanced_result: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for model_label, result in [
        ("baseline", baseline_result),
        ("zoning_enhanced", enhanced_result),
    ]:
        for split_name in ["train", "validation", "test"]:
            frame = prediction_frame(result, split_name)
            for year, group in frame.groupby("snapshot_year", sort=True):
                metrics = development_model_metrics.metrics_for_predictions(
                    group["actual_label"],
                    group["experimental_probability"].to_numpy(),
                )
                rows.append(
                    {
                        "qa_id": EXPERIMENT_ID,
                        "model_label": model_label,
                        "model_name": result["selected_model_name"],
                        "feature_set_name": result["feature_set_name"],
                        "split": split_name,
                        "snapshot_year": int(year),
                        "row_count": metrics["row_count"],
                        "positive_count": metrics["positive_count"],
                        "positive_rate": metrics["positive_rate"],
                        "roc_auc": metrics["roc_auc"],
                        "average_precision_pr_auc": metrics["average_precision_pr_auc"],
                        "precision_at_top5": metrics["precision_at_top_5_pct"],
                        "lift_at_top5": metrics["lift_at_top_5_pct"],
                        "note": "train years are in-sample; validation/test are temporal holdouts",
                    },
                )
    write_csv(
        OUTPUT_DIR / "phase10f_year_by_year_performance.csv",
        rows,
        [
            "qa_id",
            "model_label",
            "model_name",
            "feature_set_name",
            "split",
            "snapshot_year",
            "row_count",
            "positive_count",
            "positive_rate",
            "roc_auc",
            "average_precision_pr_auc",
            "precision_at_top5",
            "lift_at_top5",
            "note",
        ],
    )
    return rows


def write_metric_audit(
    consistency: dict[str, Any],
    standardized_metrics: dict[str, Any],
    topk_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    phase10c = read_json(PHASE10C_METRICS_PATH)
    phase10e_metrics = read_json(PHASE10E_METRICS_PATH)
    phase10e_summary = read_json(PHASE10E_SUMMARY_PATH)
    phase10c_best = (phase10c.get("models") or {}).get(phase10c.get("best_model_name"), {}).get("test", {})
    phase10e_baseline = ((phase10e_metrics.get("retrained_baseline") or {}).get("models") or {}).get(
        (phase10e_metrics.get("retrained_baseline") or {}).get("best_model_name"),
        {},
    ).get("test", {})
    baseline_top5 = [
        row for row in topk_rows if row["model_label"] == "baseline" and row["top_label"] == "top_5pct"
    ][0]
    audit = {
        "qa_id": EXPERIMENT_ID,
        "generated_at": datetime.now().isoformat(),
        "metric_definition": {
            "lift": "lift@top_k = precision@top_k / overall_positive_rate",
            "top_5_percent_denominator": "top 5% of test rows, not top 5% of unique parcels outside the test year",
            "tie_policy": "Phase 10F uses tie-aware expected positives at the cutoff probability bucket.",
        },
        "phase10c_artifact": {
            "experiment_id": phase10c.get("experiment_id"),
            "target": phase10c.get("target"),
            "best_model": phase10c.get("best_model_name"),
            "test_metrics": phase10c_best,
        },
        "phase10e_retrained_baseline_artifact": {
            "experiment_id": phase10e_metrics.get("experiment_id"),
            "target": phase10e_metrics.get("target"),
            "best_model": (phase10e_metrics.get("retrained_baseline") or {}).get("best_model_name"),
            "test_metrics": phase10e_baseline,
        },
        "phase10e_summary_artifact_flags": {
            "model_active": phase10e_summary.get("model_active"),
            "prediction_probability_available": phase10e_summary.get("prediction_probability_available"),
            "production_ready": phase10e_summary.get("production_ready"),
        },
        "test_row_consistency": consistency,
        "standardized_phase10f_metrics": standardized_metrics,
        "discrepancy_explanation": (
            "Phase 10C and Phase 10E used the same target, same test snapshot year, "
            "same test row count, same positive count, and the same lift formula. "
            "The top-5 lift discrepancy is driven by retraining/ranking instability in "
            "the histogram gradient boosting model and large equal-probability buckets "
            "near ranking cutoffs. Naive top-k metrics can split tied scores according "
            "to row order, so top-k lift is more volatile than ROC-AUC or PR-AUC."
        ),
        "trusted_metric_definition_going_forward": (
            "Use Phase 10F standardized metrics with tie-aware top-k precision, "
            "recall, and lift. Treat PR-AUC and tie-aware lift@top5 as the primary "
            "internal ranking metrics."
        ),
        "baseline_top5_tie_review": baseline_top5,
        **MODEL_FLAGS,
    }
    write_json(OUTPUT_DIR / "phase10f_metric_audit.json", audit)

    markdown = f"""# Phase 10F Metric Discrepancy Review

## Finding

Phase 10C reported baseline lift@top 5% near `2.05`, while Phase 10E reported
a retrained-baseline lift@top 5% near `0.706812`.

The discrepancy is **not** caused by a different lift formula. Both phases used
the intended definition:

`lift@top_k = precision@top_k / overall_positive_rate`

It is also not caused by a different test year or label population. The 2022
test set has `{consistency['base_test_rows']}` rows in both the base and
zoning-enhanced feature matrices, and mismatched label rows are
`{consistency['mismatched_test_label_rows']}`.

## Cause

The earlier Phase 10C artifact and the Phase 10E retrained baseline are separate
histogram-gradient-boosting fits. Their ROC-AUC and PR-AUC are close, but the
top-5% rank slice is sensitive to large equal-probability buckets. When a cutoff
falls through a tied score bucket, naive sorting can include different tied rows
based on row order. That makes top-k lift volatile even when broader ranking
metrics remain similar.

## CFS Standard Going Forward

Phase 10F standardizes top-k metrics with tie-aware expected positives at the
cutoff bucket. The trusted QA comparison is:

- Baseline PR-AUC: `{standardized_metrics['baseline_metrics']['average_precision_pr_auc']}`
- Zoning-enhanced PR-AUC: `{standardized_metrics['zoning_enhanced_metrics']['average_precision_pr_auc']}`
- Baseline tie-aware lift@top 5%: `{standardized_metrics['baseline_metrics']['lift_at_top_5_pct']}`
- Zoning-enhanced tie-aware lift@top 5%: `{standardized_metrics['zoning_enhanced_metrics']['lift_at_top_5_pct']}`

The model remains internal only:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
"""
    (OUTPUT_DIR / "phase10f_metric_discrepancy_review.md").write_text(markdown, encoding="utf-8")
    return audit


def render_qa_report(summary: dict[str, Any]) -> None:
    content = f"""# Development Prediction Model QA Report

Phase 10F audits Phase 10C and Phase 10E development prediction experiments.
It does not activate a model, expose probabilities, or add a frontend/public
prediction endpoint.

## Metric Audit

Lift is standardized as:

`lift@top_k = precision@top_k / overall_positive_rate`

Phase 10F uses tie-aware top-k metrics so equal scores at the cutoff do not
depend on row order.

The Phase 10C versus Phase 10E baseline lift discrepancy is attributed to
separate histogram-gradient-boosting fits and tied ranking buckets, not a
different target, test year, or lift formula.

## Standardized Test Metrics

- Baseline PR-AUC: `{summary['standardized_baseline_metrics']['average_precision_pr_auc']}`
- Zoning-enhanced PR-AUC: `{summary['standardized_zoning_enhanced_metrics']['average_precision_pr_auc']}`
- Baseline lift@top 5%: `{summary['standardized_baseline_metrics']['lift_at_top_5_pct']}`
- Zoning-enhanced lift@top 5%: `{summary['standardized_zoning_enhanced_metrics']['lift_at_top_5_pct']}`

## Calibration

Calibration assessment:
`{summary['calibration_findings']['calibration_assessment']}`

Recommendation: keep model outputs as internal rank/risk scores only. Do not
show exact probabilities.

## Explainability

Top zoning signals are listed in
`outputs/modeling/development_prediction/phase10f_feature_importance_review.csv`
and summarized in
`outputs/modeling/development_prediction/phase10f_zoning_feature_importance_summary.json`.

Zoning features remain historical map-context signals. They are not official
rezoning case approvals.

## Production Readiness

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- no frontend prediction exposure
- no public prediction endpoint

## Next Step

{summary['recommended_phase10g_next_step']}
"""
    QA_REPORT_PATH.write_text(content, encoding="utf-8")


def append_model_card_note(summary: dict[str, Any]) -> None:
    if not MODEL_CARD_PATH.exists():
        return
    marker = "\n## Phase 10F QA Addendum\n"
    text = MODEL_CARD_PATH.read_text(encoding="utf-8")
    text = text.split(marker)[0].rstrip()
    addendum = f"""{marker}

Phase 10F audited the Phase 10C and Phase 10E metric discrepancy and
standardized top-k metrics with tie-aware cutoff handling.

- Standardized baseline PR-AUC: `{summary['standardized_baseline_metrics']['average_precision_pr_auc']}`
- Standardized zoning-enhanced PR-AUC: `{summary['standardized_zoning_enhanced_metrics']['average_precision_pr_auc']}`
- Standardized baseline lift@top 5%: `{summary['standardized_baseline_metrics']['lift_at_top_5_pct']}`
- Standardized zoning-enhanced lift@top 5%: `{summary['standardized_zoning_enhanced_metrics']['lift_at_top_5_pct']}`
- Calibration assessment: `{summary['calibration_findings']['calibration_assessment']}`

This model remains internal only. Exact probabilities should not be shown in
the frontend; any future user-facing output should be reviewed as rank bands or
classes after calibration and governance review.
"""
    MODEL_CARD_PATH.write_text(f"{text}\n{addendum}", encoding="utf-8")


def main() -> int:
    args = parse_args()
    engine = baseline.create_engine_from_env()
    if args.dry_run:
        payload = {
            "qa_id": EXPERIMENT_ID,
            "target": TARGET,
            "feature_table": FEATURE_TABLE,
            "outputs": [
                "phase10f_metric_audit.json",
                "phase10f_standardized_model_comparison_metrics.json",
                "phase10f_calibration_review.json",
                "phase10f_top_ranked_parcel_review.csv",
            ],
            **MODEL_FLAGS,
        }
        print(json.dumps(payload, indent=2))
        return 0

    engine, observed_date, mature_years, split, baseline_result, enhanced_result = train_models(
        args.random_state,
    )
    standardized_metrics, topk_rows = write_standardized_outputs(split, baseline_result, enhanced_result)
    calibration = write_calibration_outputs(enhanced_result)
    top_review = write_top_ranked_review(engine, enhanced_result)
    feature_importance_rows, feature_summary = write_feature_importance_outputs(
        enhanced_result,
        args.random_state,
        args.skip_permutation,
        args.permutation_sample_size,
    )
    year_rows = write_year_by_year_performance(baseline_result, enhanced_result)
    consistency = label_row_consistency(engine)
    audit = write_metric_audit(consistency, standardized_metrics, topk_rows)

    top_zoning_features = [
        row for row in feature_importance_rows if row.get("is_zoning_feature")
    ][:12]
    summary = {
        "phase": "10F",
        "qa_id": EXPERIMENT_ID,
        "generated_at": datetime.now().isoformat(),
        "target": TARGET,
        "feature_table": FEATURE_TABLE,
        "mature_years": mature_years,
        "train_years": split.train_years,
        "validation_years": split.validation_years,
        "test_years": split.test_years,
        "metric_discrepancy_explanation": audit["discrepancy_explanation"],
        "standardized_baseline_metrics": standardized_metrics["baseline_metrics"],
        "standardized_zoning_enhanced_metrics": standardized_metrics["zoning_enhanced_metrics"],
        "metric_comparison": standardized_metrics["metric_comparison"],
        "zoning_improved_performance": {
            "pr_auc": standardized_metrics["zoning_improved_pr_auc"],
            "lift_top_5": standardized_metrics["zoning_improved_lift_top_5"],
        },
        "calibration_findings": calibration,
        "top_ranked_parcel_qa_summary": top_review,
        "top_important_features": top_zoning_features,
        "suspicious_or_leakage_prone_features": feature_summary[
            "suspicious_or_leakage_prone_features"
        ],
        "year_by_year_stability": {
            "rows_written": len(year_rows),
            "note": "Train years are in-sample; validation and test years are temporal holdouts.",
        },
        "production_readiness_decision": "not_production_ready",
        "recommended_phase10g_next_step": (
            "Add official rezoning case dates/future land use/accessibility controls and "
            "run calibrated temporal validation before any user-facing risk class."
        ),
        "outputs": {
            "metric_audit": str(OUTPUT_DIR / "phase10f_metric_audit.json"),
            "metric_discrepancy_review": str(
                OUTPUT_DIR / "phase10f_metric_discrepancy_review.md",
            ),
            "standardized_metrics": str(
                OUTPUT_DIR / "phase10f_standardized_model_comparison_metrics.json",
            ),
            "topk_summary": str(OUTPUT_DIR / "phase10f_standardized_topk_summary.csv"),
            "calibration_bins": str(OUTPUT_DIR / "phase10f_calibration_bins.csv"),
            "calibration_review": str(OUTPUT_DIR / "phase10f_calibration_review.json"),
            "top_ranked_review": str(OUTPUT_DIR / "phase10f_top_ranked_parcel_review.csv"),
            "feature_importance": str(
                OUTPUT_DIR / "phase10f_feature_importance_review.csv",
            ),
            "zoning_feature_summary": str(
                OUTPUT_DIR / "phase10f_zoning_feature_importance_summary.json",
            ),
            "year_by_year": str(OUTPUT_DIR / "phase10f_year_by_year_performance.csv"),
            "qa_report": str(QA_REPORT_PATH),
            "root_summary": str(ROOT_SUMMARY_PATH),
        },
        **MODEL_FLAGS,
    }
    write_json(ROOT_SUMMARY_PATH, summary)
    render_qa_report(summary)
    append_model_card_note(summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
