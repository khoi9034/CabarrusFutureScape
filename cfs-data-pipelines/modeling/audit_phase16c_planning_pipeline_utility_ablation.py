"""Phase 16C planning/pipeline/utility feature ablation and governance review.

This is an internal QA script only. It does not write public prediction
endpoints, expose parcel-level predictions, or mark any model production-ready.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text


REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_SCRIPT = REPO_ROOT / "cfs-data-pipelines" / "modeling" / "train_development_baseline_model.py"
OUTPUT_DIR = REPO_ROOT / "outputs"
MODEL_OUTPUT_DIR = OUTPUT_DIR / "modeling" / "development_prediction"

FEATURE_TABLE = "parcel_development_prediction_features_planning_pipeline_utility_enhanced"
SUMMARY_OUTPUT = OUTPUT_DIR / "phase16c_feature_ablation_governance_summary.json"
ABLATION_METRICS_OUTPUT = MODEL_OUTPUT_DIR / "phase16c_feature_ablation_metrics.csv"
GROUP_RECOMMENDATIONS_OUTPUT = MODEL_OUTPUT_DIR / "phase16c_feature_group_recommendations.csv"
NOISY_FEATURE_REVIEW_OUTPUT = MODEL_OUTPUT_DIR / "phase16c_noisy_feature_review.csv"
GOVERNANCE_REVIEW_OUTPUT = MODEL_OUTPUT_DIR / "phase16c_feature_group_governance_review.json"

PHASE16B_SUMMARY_PATH = OUTPUT_DIR / "phase16b_planning_pipeline_utility_model_comparison_summary.json"
PHASE16B_IMPORTANCE_PATH = MODEL_OUTPUT_DIR / "phase16b_planning_pipeline_utility_feature_importance.csv"
PHASE16B_MISSINGNESS_PATH = OUTPUT_DIR / "development_prediction_planning_pipeline_utility_enhanced_missingness.csv"

EXPERIMENT_ID = "phase16c_planning_pipeline_utility_ablation_v1"
BASE_RECOMMENDED_EXPERIMENT_ID = "phase13c_transportation_enhanced_v1"

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

CENTRAL_AREA_NUMERIC = [
    "distance_to_service_node_ft",
    "distance_to_special_corridor_ft",
]
CENTRAL_AREA_BOOLEAN = [
    "inside_central_area_plan",
    "inside_primary_activity_area",
    "inside_service_node",
    "inside_special_corridor",
    "inside_special_use_area",
    "concord_only_flag",
]
CENTRAL_AREA_CATEGORICAL = [
    "future_land_use_category",
    "future_land_use_growth_alignment",
]

ACCELA_NUMERIC = [
    "total_plan_review_count",
    "recent_plan_review_count_12mo",
    "max_days_open",
]
ACCELA_BOOLEAN = [
    "active_plan_review_on_parcel",
    "review_type_major_flag",
]
ACCELA_CATEGORICAL = [
    "latest_plan_review_status",
    "latest_plan_review_type",
]

UTILITY_NUMERIC = [
    "distance_to_wsacc_sewer_line_ft",
    "distance_to_nearest_manhole_ft",
    "utility_access_proxy_score",
]
UTILITY_BOOLEAN = [
    "inside_wsacc_district",
    "true_utility_capacity_available",
    "utility_proxy_only_flag",
]
UTILITY_CATEGORICAL: list[str] = []

TAX_NUMERIC = [
    "building_value",
    "land_to_building_value_ratio",
    "tax_enriched_land_value",
    "tax_enriched_total_value",
]
TAX_BOOLEAN = [
    "vacant_or_underbuilt_proxy",
]
TAX_CATEGORICAL = [
    "value_enrichment_quality",
]

METADATA_BOOLEAN = [
    "planning_pipeline_utility_current_context_only_flag",
    "concord_only_feature_flag",
    "planning_pipeline_utility_time_safe_for_training_flag",
]


@dataclass(frozen=True)
class FeatureGroup:
    group_key: str
    label: str
    numeric: list[str]
    boolean: list[str]
    categorical: list[str]
    affected_condition: str
    risk: str
    caveat: str

    @property
    def all_features(self) -> list[str]:
        return [*self.numeric, *self.boolean, *self.categorical]


FEATURE_GROUPS = [
    FeatureGroup(
        "central_area_plan",
        "Central Area Plan / future land use",
        CENTRAL_AREA_NUMERIC,
        CENTRAL_AREA_BOOLEAN,
        CENTRAL_AREA_CATEGORICAL,
        """
        inside_central_area_plan
        OR inside_primary_activity_area
        OR inside_service_node
        OR inside_special_corridor
        OR inside_special_use_area
        OR future_land_use_category IS NOT NULL
        """,
        "high_for_historical_backtesting_without_countywide_historical_plan_versions",
        "Concord-only current-context plan coverage; not countywide future land use.",
    ),
    FeatureGroup(
        "accela_plan_review",
        "Accela plan review activity",
        ACCELA_NUMERIC,
        ACCELA_BOOLEAN,
        ACCELA_CATEGORICAL,
        """
        active_plan_review_on_parcel
        OR total_plan_review_count > 0
        OR latest_plan_review_status IS NOT NULL
        """,
        "high_without_temporal_and_jurisdiction_qa",
        "Early pipeline signal only; not approval, entitlement, or completed development.",
    ),
    FeatureGroup(
        "utility_proxy",
        "Utility proxy",
        UTILITY_NUMERIC,
        UTILITY_BOOLEAN,
        UTILITY_CATEGORICAL,
        """
        distance_to_wsacc_sewer_line_ft IS NOT NULL
        OR distance_to_nearest_manhole_ft IS NOT NULL
        OR inside_wsacc_district
        """,
        "high_without_true_capacity_or_allocation_data",
        "Proximity/service-context proxy only; does not imply sewer capacity.",
    ),
    FeatureGroup(
        "tax_value_enrichment",
        "Tax parcel value enrichment",
        TAX_NUMERIC,
        TAX_BOOLEAN,
        TAX_CATEGORICAL,
        """
        tax_enriched_land_value IS NOT NULL
        OR tax_enriched_total_value IS NOT NULL
        OR building_value IS NOT NULL
        """,
        "high_without_historical_assessment_snapshots",
        "Current value enrichment only; not a historical valuation series.",
    ),
    FeatureGroup(
        "metadata_guardrails",
        "Combined metadata/current-context flags",
        [],
        METADATA_BOOLEAN,
        [],
        """
        planning_pipeline_utility_current_context_only_flag
        OR concord_only_feature_flag
        OR utility_proxy_only_flag
        """,
        "low_for_metadata_but_not_predictive",
        "Guardrail flags should document caveats, not drive model ranking.",
    ),
]


def load_baseline_module():
    spec = importlib.util.spec_from_file_location("phase10c_baseline_model_for_phase16c", BASELINE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


baseline = load_baseline_module()
baseline.FEATURE_TABLE = FEATURE_TABLE

BASE_FEATURE_SET = {
    "numeric": [*ZONING_NUMERIC_FEATURES, *TRANSPORTATION_NUMERIC_FEATURES],
    "boolean": [*ZONING_BOOLEAN_FEATURES, *TRANSPORTATION_BOOLEAN_FEATURES],
    "categorical": ZONING_CATEGORICAL_FEATURES,
    "description": "Phase 13C transportation-enhanced base feature set.",
}

VARIANT_GROUPS = {
    "transportation_enhanced_base": [],
    "transportation_plus_tax_value_only": ["tax_value_enrichment"],
    "transportation_plus_accela_only": ["accela_plan_review"],
    "transportation_plus_central_area_only": ["central_area_plan"],
    "transportation_plus_utility_proxy_only": ["utility_proxy"],
    "transportation_plus_all_phase16b": [
        "tax_value_enrichment",
        "accela_plan_review",
        "central_area_plan",
        "utility_proxy",
        "metadata_guardrails",
    ],
}

GROUP_BY_KEY = {group.group_key: group for group in FEATURE_GROUPS}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="new_construction_next_3yr", choices=sorted(baseline.TARGET_HORIZONS))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-tree-model", action="store_true")
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str, ensure_ascii=True) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def configure_feature_sets() -> None:
    for variant_name, group_keys in VARIANT_GROUPS.items():
        numeric = list(BASE_FEATURE_SET["numeric"])
        boolean = list(BASE_FEATURE_SET["boolean"])
        categorical = list(BASE_FEATURE_SET["categorical"])
        for group_key in group_keys:
            group = GROUP_BY_KEY[group_key]
            numeric.extend(group.numeric)
            boolean.extend(group.boolean)
            categorical.extend(group.categorical)
        baseline.FEATURE_SETS[variant_name] = {
            "numeric": list(dict.fromkeys(numeric)),
            "boolean": list(dict.fromkeys(boolean)),
            "categorical": list(dict.fromkeys(categorical)),
            "description": f"Phase 16C ablation variant: {variant_name}",
        }


def fetch_all(engine, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(query), params or {}).mappings()]


def fetch_one(engine, query: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(connection.execute(text(query), params or {}).mappings().one())


def load_importance_ranks() -> dict[str, dict[str, Any]]:
    if not PHASE16B_IMPORTANCE_PATH.exists():
        return {}
    rows = list(csv.DictReader(PHASE16B_IMPORTANCE_PATH.open("r", encoding="utf-8")))
    ranks: dict[str, dict[str, Any]] = {}
    for rank, row in enumerate(rows, start=1):
        feature_name = row["feature_name"]
        for group in FEATURE_GROUPS:
            for base_feature in group.all_features:
                if feature_name == base_feature or feature_name.startswith(f"{base_feature}_"):
                    existing = ranks.get(base_feature)
                    if existing is None or rank < existing["importance_rank"]:
                        ranks[base_feature] = {
                            "importance_rank": rank,
                            "top_transformed_feature": feature_name,
                            "absolute_coefficient": row.get("absolute_coefficient"),
                            "coefficient": row.get("coefficient"),
                        }
    return ranks


def load_missingness() -> dict[str, dict[str, Any]]:
    if not PHASE16B_MISSINGNESS_PATH.exists():
        return {}
    return {
        row["feature_name"]: {
            "missing_count": int(float(row["missing_count"])),
            "missing_pct": float(row["missing_pct"]),
        }
        for row in csv.DictReader(PHASE16B_MISSINGNESS_PATH.open("r", encoding="utf-8"))
    }


def feature_statistics(engine, feature_name: str, data_type: str) -> dict[str, Any]:
    quoted = f'"{feature_name}"'
    if data_type == "boolean":
        return fetch_one(
            engine,
            f"""
            SELECT
              COUNT(*) AS row_count,
              COUNT({quoted}) AS non_null_count,
              COUNT(DISTINCT {quoted}) AS distinct_count,
              COUNT(*) FILTER (WHERE {quoted} IS TRUE) AS true_count,
              COUNT(DISTINCT official_parcel_id) FILTER (WHERE {quoted} IS TRUE)
                AS affected_parcels,
              NULL::double precision AS stddev_pop
            FROM public.{FEATURE_TABLE}
            """,
        )
    if data_type in {
        "integer",
        "bigint",
        "double precision",
        "numeric",
        "real",
    }:
        return fetch_one(
            engine,
            f"""
            SELECT
              COUNT(*) AS row_count,
              COUNT({quoted}) AS non_null_count,
              COUNT(DISTINCT {quoted}) AS distinct_count,
              COUNT(DISTINCT official_parcel_id) FILTER (
                WHERE {quoted} IS NOT NULL AND {quoted} <> 0
              ) AS affected_parcels,
              NULL::bigint AS true_count,
              STDDEV_POP({quoted}::double precision) AS stddev_pop
            FROM public.{FEATURE_TABLE}
            """,
        )
    return fetch_one(
        engine,
        f"""
        SELECT
          COUNT(*) AS row_count,
          COUNT({quoted}) AS non_null_count,
          COUNT(DISTINCT {quoted}) AS distinct_count,
          COUNT(DISTINCT official_parcel_id) FILTER (WHERE {quoted} IS NOT NULL)
            AS affected_parcels,
          NULL::bigint AS true_count,
          NULL::double precision AS stddev_pop
        FROM public.{FEATURE_TABLE}
        """,
    )


def feature_review_rows(engine) -> list[dict[str, Any]]:
    missingness = load_missingness()
    importance = load_importance_ranks()
    group_for_feature = {
        feature: group
        for group in FEATURE_GROUPS
        for feature in group.all_features
    }
    data_types = {
        row["column_name"]: row["data_type"]
        for row in fetch_all(
            engine,
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table_name
            """,
            {"table_name": FEATURE_TABLE},
        )
    }
    rows = []
    for feature_name, group in sorted(group_for_feature.items()):
        if feature_name not in data_types:
            continue
        stats = feature_statistics(engine, feature_name, data_types[feature_name])
        missing = missingness.get(feature_name, {})
        rank = importance.get(feature_name, {})
        row_count = int(stats["row_count"] or 0)
        non_null_count = int(stats["non_null_count"] or 0)
        distinct_count = int(stats["distinct_count"] or 0)
        missing_pct = float(missing.get("missing_pct", 0.0 if row_count == non_null_count else 100.0))
        flags = []
        recommendation = "keep_for_current_context_dashboard"
        if missing_pct >= 99.0:
            flags.append("near_or_full_missingness")
            recommendation = "exclude_from_model_for_now"
        if distinct_count <= 1:
            flags.append("constant_or_no_variance")
            recommendation = "exclude_from_model_for_now"
        if group.group_key == "central_area_plan":
            flags.append("concord_only_coverage")
            if recommendation != "exclude_from_model_for_now":
                recommendation = "needs_countywide_coverage"
        if group.group_key == "utility_proxy":
            flags.append("proxy_not_capacity")
            if recommendation != "exclude_from_model_for_now":
                recommendation = "needs_true_capacity_data"
        if group.group_key == "accela_plan_review":
            flags.append("needs_temporal_and_jurisdiction_qa")
        if group.group_key == "metadata_guardrails":
            flags.append("metadata_not_predictive")
            recommendation = "exclude_from_model_for_now"
        rows.append(
            {
                "feature_name": feature_name,
                "feature_group": group.group_key,
                "display_group": group.label,
                "data_type": data_types[feature_name],
                "row_count": row_count,
                "non_null_count": non_null_count,
                "missing_pct": round(missing_pct, 4),
                "distinct_count": distinct_count,
                "true_count": int(stats["true_count"]) if stats.get("true_count") is not None else "",
                "affected_parcels": int(stats["affected_parcels"] or 0),
                "stddev_pop": round(float(stats["stddev_pop"]), 6)
                if stats.get("stddev_pop") is not None
                else "",
                "importance_rank": rank.get("importance_rank", ""),
                "top_transformed_feature": rank.get("top_transformed_feature", ""),
                "absolute_coefficient": rank.get("absolute_coefficient", ""),
                "noise_flags": ";".join(flags),
                "recommendation": recommendation,
                "current_context_only": True,
                "production_ready": False,
            },
        )
    return rows


def group_audit_rows(engine, feature_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    feature_rows_by_group: dict[str, list[dict[str, Any]]] = {}
    for row in feature_rows:
        feature_rows_by_group.setdefault(row["feature_group"], []).append(row)
    for group in FEATURE_GROUPS:
        affected = fetch_one(
            engine,
            f"""
            SELECT
              COUNT(DISTINCT official_parcel_id) AS affected_parcels,
              COUNT(*) AS affected_rows
            FROM public.{FEATURE_TABLE}
            WHERE {group.affected_condition}
            """,
        )
        group_features = feature_rows_by_group.get(group.group_key, [])
        missing_values = [float(row["missing_pct"]) for row in group_features]
        importance_ranks = [
            int(row["importance_rank"])
            for row in group_features
            if str(row["importance_rank"]).strip()
        ]
        rows.append(
            {
                "feature_group": group.group_key,
                "display_group": group.label,
                "feature_count": len(group_features),
                "avg_missing_pct": round(sum(missing_values) / len(missing_values), 4)
                if missing_values
                else 0.0,
                "affected_parcels": int(affected["affected_parcels"] or 0),
                "affected_rows": int(affected["affected_rows"] or 0),
                "concord_only_coverage": group.group_key == "central_area_plan",
                "current_context_only": True,
                "best_importance_rank": min(importance_ranks) if importance_ranks else "",
                "potential_leakage_or_noise_risk": group.risk,
                "source_caveat": group.caveat,
            },
        )
    return rows


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


def metric_row(variant_name: str, result: dict[str, Any], base_metrics: dict[str, Any] | None) -> dict[str, Any]:
    metrics = result["selected"]["test_metrics"]
    row = {
        "variant_name": variant_name,
        "feature_groups_added": ",".join(VARIANT_GROUPS[variant_name]) or "none",
        "best_model_name": result["selected_model_name"],
        "row_count": metrics.get("row_count"),
        "positive_count": metrics.get("positive_count"),
        "positive_rate": metrics.get("positive_rate"),
        "roc_auc": metrics.get("roc_auc"),
        "average_precision_pr_auc": metrics.get("average_precision_pr_auc"),
        "precision_at_top_1_pct": metrics.get("precision_at_top_1_pct"),
        "precision_at_top_5_pct": metrics.get("precision_at_top_5_pct"),
        "lift_at_top_1_pct": metrics.get("lift_at_top_1_pct"),
        "lift_at_top_5_pct": metrics.get("lift_at_top_5_pct"),
        "brier_score": metrics.get("brier_score"),
        "production_ready": False,
        "model_active": False,
        "prediction_probability_available": False,
    }
    if base_metrics:
        row["delta_pr_auc_vs_base"] = round(
            float(metrics.get("average_precision_pr_auc") or 0)
            - float(base_metrics.get("average_precision_pr_auc") or 0),
            6,
        )
        row["delta_lift_top5_vs_base"] = round(
            float(metrics.get("lift_at_top_5_pct") or 0)
            - float(base_metrics.get("lift_at_top_5_pct") or 0),
            6,
        )
    else:
        row["delta_pr_auc_vs_base"] = 0.0
        row["delta_lift_top5_vs_base"] = 0.0
    return row


def recommendation_for_group(group_key: str, metrics_by_variant: dict[str, dict[str, Any]]) -> str:
    variant_name = {
        "tax_value_enrichment": "transportation_plus_tax_value_only",
        "accela_plan_review": "transportation_plus_accela_only",
        "central_area_plan": "transportation_plus_central_area_only",
        "utility_proxy": "transportation_plus_utility_proxy_only",
    }.get(group_key)
    if group_key == "metadata_guardrails":
        return "exclude_from_model_for_now;keep_as_governance_metadata"
    if not variant_name:
        return "needs_review"
    metrics = metrics_by_variant[variant_name]
    pr_delta = float(metrics["delta_pr_auc_vs_base"])
    lift_delta = float(metrics["delta_lift_top5_vs_base"])
    if pr_delta > 0.001 and lift_delta > 0:
        return "keep_for_future_model_after_more_data"
    if pr_delta < -0.001 or lift_delta < 0:
        return "exclude_from_model_for_now"
    return "needs_better_source"


def enrich_group_recommendations(
    group_rows: list[dict[str, Any]],
    metrics_by_variant: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = []
    for row in group_rows:
        group_key = row["feature_group"]
        recommendation = recommendation_for_group(group_key, metrics_by_variant)
        blockers = []
        if group_key == "central_area_plan":
            blockers.append("needs_countywide_coverage")
        if group_key == "accela_plan_review":
            blockers.extend(["needs_temporal_filtering", "needs_jurisdiction_qa"])
        if group_key == "utility_proxy":
            blockers.append("needs_true_capacity_data")
        if group_key == "tax_value_enrichment":
            blockers.append("needs_historical_value_snapshots")
        if group_key == "metadata_guardrails":
            blockers.append("metadata_not_predictive")
        variant = {
            "tax_value_enrichment": "transportation_plus_tax_value_only",
            "accela_plan_review": "transportation_plus_accela_only",
            "central_area_plan": "transportation_plus_central_area_only",
            "utility_proxy": "transportation_plus_utility_proxy_only",
            "metadata_guardrails": "",
        }[group_key]
        rows.append(
            {
                **row,
                "ablation_variant": variant,
                "delta_pr_auc_vs_base": metrics_by_variant.get(variant, {}).get(
                    "delta_pr_auc_vs_base",
                    "",
                ),
                "delta_lift_top5_vs_base": metrics_by_variant.get(variant, {}).get(
                    "delta_lift_top5_vs_base",
                    "",
                ),
                "recommendation": recommendation,
                "governance_actions": ";".join(blockers),
                "keep_for_current_context_dashboard": True,
                "production_ready": False,
            },
        )
    return rows


def best_internal_model(metrics_rows: list[dict[str, Any]]) -> dict[str, Any]:
    base = metrics_rows[0]
    candidates = [
        row
        for row in metrics_rows[1:]
        if float(row["average_precision_pr_auc"] or 0) > float(base["average_precision_pr_auc"] or 0)
        and float(row["lift_at_top_5_pct"] or 0) > float(base["lift_at_top_5_pct"] or 0)
    ]
    if not candidates:
        return {
            "recommended_internal_model_experiment_id": BASE_RECOMMENDED_EXPERIMENT_ID,
            "recommended_variant": "transportation_enhanced_base",
            "phase16b_full_feature_set_recommended": False,
            "decision_reason": "No Phase 16C ablation variant beat the Phase 13C transportation-enhanced base on both PR-AUC and lift@top 5%.",
        }
    winner = max(
        candidates,
        key=lambda row: (
            float(row["average_precision_pr_auc"] or 0),
            float(row["lift_at_top_5_pct"] or 0),
        ),
    )
    return {
        "recommended_internal_model_experiment_id": EXPERIMENT_ID,
        "recommended_variant": winner["variant_name"],
        "phase16b_full_feature_set_recommended": winner["variant_name"]
        == "transportation_plus_all_phase16b",
        "decision_reason": "A Phase 16C ablation variant beat the transportation base on both PR-AUC and lift@top 5%. Internal-only review still required.",
    }


def main() -> int:
    args = parse_args()
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    configure_feature_sets()
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
        "variants": {
            name: baseline.feature_columns_for_set(name)
            for name in VARIANT_GROUPS
        },
        "feature_groups": [group.group_key for group in FEATURE_GROUPS],
        "production_ready": False,
        "model_active": False,
        "prediction_probability_available": False,
    }
    if args.dry_run:
        write_json(SUMMARY_OUTPUT, dry_run_payload)
        print(json.dumps(dry_run_payload, indent=2))
        return 0

    feature_rows = feature_review_rows(engine)
    group_rows = group_audit_rows(engine, feature_rows)

    results = {}
    metric_rows = []
    base_metrics = None
    for variant_name in VARIANT_GROUPS:
        result = train_feature_set(
            engine,
            args.target,
            variant_name,
            split,
            args.random_state,
            args.skip_tree_model,
        )
        results[variant_name] = result
        row = metric_row(variant_name, result, base_metrics)
        if variant_name == "transportation_enhanced_base":
            base_metrics = result["selected"]["test_metrics"]
            row = metric_row(variant_name, result, None)
        metric_rows.append(row)

    metrics_by_variant = {row["variant_name"]: row for row in metric_rows}
    group_recommendations = enrich_group_recommendations(group_rows, metrics_by_variant)
    best_decision = best_internal_model(metric_rows)

    write_csv(
        ABLATION_METRICS_OUTPUT,
        metric_rows,
        [
            "variant_name",
            "feature_groups_added",
            "best_model_name",
            "row_count",
            "positive_count",
            "positive_rate",
            "roc_auc",
            "average_precision_pr_auc",
            "precision_at_top_1_pct",
            "precision_at_top_5_pct",
            "lift_at_top_1_pct",
            "lift_at_top_5_pct",
            "brier_score",
            "delta_pr_auc_vs_base",
            "delta_lift_top5_vs_base",
            "production_ready",
            "model_active",
            "prediction_probability_available",
        ],
    )
    write_csv(
        GROUP_RECOMMENDATIONS_OUTPUT,
        group_recommendations,
        [
            "feature_group",
            "display_group",
            "feature_count",
            "avg_missing_pct",
            "affected_parcels",
            "affected_rows",
            "concord_only_coverage",
            "current_context_only",
            "best_importance_rank",
            "potential_leakage_or_noise_risk",
            "source_caveat",
            "ablation_variant",
            "delta_pr_auc_vs_base",
            "delta_lift_top5_vs_base",
            "recommendation",
            "governance_actions",
            "keep_for_current_context_dashboard",
            "production_ready",
        ],
    )
    write_csv(
        NOISY_FEATURE_REVIEW_OUTPUT,
        feature_rows,
        [
            "feature_name",
            "feature_group",
            "display_group",
            "data_type",
            "row_count",
            "non_null_count",
            "missing_pct",
            "distinct_count",
            "true_count",
            "affected_parcels",
            "stddev_pop",
            "importance_rank",
            "top_transformed_feature",
            "absolute_coefficient",
            "noise_flags",
            "recommendation",
            "current_context_only",
            "production_ready",
        ],
    )

    governance_review = {
        "experiment_id": EXPERIMENT_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "feature_group_audit": group_recommendations,
        "feature_count_reviewed": len(feature_rows),
        "noisy_or_excluded_features": [
            row for row in feature_rows if row["recommendation"] == "exclude_from_model_for_now"
        ],
        "best_current_model_decision": best_decision,
        "production_ready": False,
        "model_active": False,
        "prediction_probability_available": False,
    }
    write_json(GOVERNANCE_REVIEW_OUTPUT, governance_review)

    metrics_lookup = {row["variant_name"]: row for row in metric_rows}
    helped_groups = [
        row["feature_group"]
        for row in group_recommendations
        if str(row["recommendation"]).startswith("keep_for_future_model")
    ]
    hurt_groups = [
        row["feature_group"]
        for row in group_recommendations
        if "exclude_from_model_for_now" in str(row["recommendation"])
    ]
    summary = {
        "phase": "16C_planning_pipeline_utility_feature_ablation_governance",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "experiment_id": EXPERIMENT_ID,
        "target": args.target,
        "phase16b_issue_summary": {
            "transportation_pr_auc": 0.083925,
            "phase16b_pr_auc": 0.073322,
            "transportation_lift_top5": 3.553034,
            "phase16b_lift_top5": 0.588219,
            "conclusion": "Phase 16B full feature set improved ROC-AUC but degraded PR-AUC and top-k ranking metrics.",
        },
        "temporal_split": split.as_dict(),
        "mature_snapshot_years": mature_years,
        "excluded_snapshot_years": excluded_years,
        "ablation_variants_tested": list(VARIANT_GROUPS),
        "metrics_by_variant": metric_rows,
        "feature_group_recommendations": group_recommendations,
        "feature_groups_that_helped": helped_groups,
        "feature_groups_that_hurt_or_should_be_excluded": hurt_groups,
        "recommended_current_best_internal_model": best_decision,
        "features_to_exclude_for_now": [
            row["feature_name"]
            for row in feature_rows
            if row["recommendation"] == "exclude_from_model_for_now"
        ],
        "features_to_keep_as_planning_context_only": [
            row["feature_name"]
            for row in feature_rows
            if row["recommendation"] != "exclude_from_model_for_now"
        ],
        "data_needed_to_improve_phase16b_features_later": [
            "countywide future land use and small-area plan coverage with adoption/effective dates",
            "Accela or pipeline records with status semantics, jurisdiction QA, and source availability rules",
            "true WSACC utility capacity/allocation or service-area constraints",
            "historical assessment/value snapshots if value context is used in backtesting",
            "official development approval/subdivision pipeline records with dates and outcomes",
        ],
        "model_safety_confirmation": {
            "model_active": False,
            "prediction_probability_available": False,
            "production_ready": False,
            "public_prediction_endpoint_added": False,
            "frontend_prediction_exposure_added": False,
            "parcel_level_ranking_exposure_added": False,
        },
        "outputs": {
            "ablation_metrics": str(ABLATION_METRICS_OUTPUT),
            "feature_group_recommendations": str(GROUP_RECOMMENDATIONS_OUTPUT),
            "noisy_feature_review": str(NOISY_FEATURE_REVIEW_OUTPUT),
            "governance_review": str(GOVERNANCE_REVIEW_OUTPUT),
            "summary": str(SUMMARY_OUTPUT),
        },
        "validation_results": {},
    }
    write_json(SUMMARY_OUTPUT, summary)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
