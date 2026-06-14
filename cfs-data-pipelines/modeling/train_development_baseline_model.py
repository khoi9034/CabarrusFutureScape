"""Train internal Phase 10C baseline development prediction experiments.

This script is intentionally internal-only. It does not publish production
scores, does not expose frontend probabilities, and does not modify Phase 10A
labels or the Phase 10B feature matrix.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

MODELING_DIR = Path(__file__).resolve().parent
if str(MODELING_DIR) not in sys.path:
    sys.path.append(str(MODELING_DIR))

import development_model_metrics

try:
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (
        average_precision_score,
        brier_score_loss,
        confusion_matrix,
        roc_auc_score,
    )
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
    from sklearn.utils.class_weight import compute_sample_weight
except ImportError as exc:  # pragma: no cover - exercised only in missing envs
    raise RuntimeError(
        "scikit-learn is required for Phase 10C. Install cfs-data-pipelines "
        "requirements with: python -m pip install -r cfs-data-pipelines/requirements.txt",
    ) from exc


DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR_DEFAULT = REPO_ROOT / "outputs" / "modeling" / "development_prediction"
ROOT_OUTPUT_SUMMARY = REPO_ROOT / "outputs" / "phase10c_baseline_development_prediction_experiment_summary.json"
MODEL_CARD_PATH = REPO_ROOT / "docs" / "modeling" / "development_prediction_baseline_model_card.md"
FEATURE_REGISTRY_PATH = REPO_ROOT / "config" / "development_prediction_features.json"

FEATURE_TABLE = "parcel_development_prediction_features"
SCORE_TABLE = "development_prediction_model_experiment_scores"

TARGET_HORIZONS = {
    "new_construction_next_1yr": 1,
    "new_construction_next_3yr": 3,
    "residential_new_construction_next_3yr": 3,
    "commercial_new_construction_next_3yr": 3,
}

TARGET_COLUMNS = {
    "new_construction_next_1yr",
    "new_construction_next_3yr",
    "residential_new_construction_next_3yr",
    "commercial_new_construction_next_3yr",
    "co_issued_next_3yr",
    "future_permit_count_3yr",
    "first_future_new_construction_date",
}

STRICT_TIME_SAFE_NUMERIC_FEATURES = [
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
]

STRICT_TIME_SAFE_BOOLEAN_FEATURES = [
    "had_prior_major_development_flag",
]

CURRENT_CONTEXT_NUMERIC_FEATURES = STRICT_TIME_SAFE_NUMERIC_FEATURES + [
    "parcel_area_acres",
    "land_value",
    "improvement_value",
    "total_value",
    "value_per_acre",
    "flood_constraint_score",
    "percent_parcel_constrained",
    "development_activity_score_current_context",
    "total_permit_count_current_context",
    "recent_permit_count_1yr_current_context",
    "recent_permit_count_3yr_current_context",
]

CURRENT_CONTEXT_BOOLEAN_FEATURES = STRICT_TIME_SAFE_BOOLEAN_FEATURES + [
    "vacant_or_underbuilt_flag",
    "zoning_known_flag",
    "zoning_review_required_flag",
    "flood_review_required",
    "floodway_present",
    "sfha_present",
    "school_missing_assignment_flag",
    "county_unincorporated_flag",
    "etj_flag",
]

CURRENT_CONTEXT_CATEGORICAL_FEATURES = [
    "parcel_size_category",
    "valuation_band",
    "parcel_quality_status",
    "zoning_code",
    "zoning_jurisdiction",
    "zoning_category",
    "zoning_assignment_quality",
    "planning_jurisdiction_name",
    "planning_boundary_type",
    "flood_severity_class",
    "dominant_flood_zone",
    "buildability_impact",
    "school_assignment_confidence",
    "school_capacity_status",
    "school_constraint_class",
    "development_activity_class_current_context",
    "dominant_permit_type_current_context",
    "dominant_work_type_current_context",
]

FEATURE_SETS = {
    "strict_time_safe_baseline": {
        "numeric": STRICT_TIME_SAFE_NUMERIC_FEATURES,
        "boolean": STRICT_TIME_SAFE_BOOLEAN_FEATURES,
        "categorical": [],
        "description": "Uses only date-windowed prior permit and new-construction features.",
    },
    "current_context_exploratory": {
        "numeric": CURRENT_CONTEXT_NUMERIC_FEATURES,
        "boolean": CURRENT_CONTEXT_BOOLEAN_FEATURES,
        "categorical": CURRENT_CONTEXT_CATEGORICAL_FEATURES,
        "description": "Exploratory only; includes current-context parcel, zoning, flood, school, and activity fields.",
    },
}


@dataclass(frozen=True)
class TemporalSplit:
    train_years: list[int]
    validation_years: list[int]
    test_years: list[int]

    def as_dict(self) -> dict[str, list[int]]:
        return {
            "train_years": self.train_years,
            "validation_years": self.validation_years,
            "test_years": self.test_years,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train internal baseline development prediction model experiments.",
    )
    parser.add_argument("--target", default="new_construction_next_3yr", choices=sorted(TARGET_HORIZONS))
    parser.add_argument(
        "--feature-set",
        default="strict_time_safe_baseline",
        choices=sorted(FEATURE_SETS),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR_DEFAULT))
    parser.add_argument(
        "--write-score-table",
        action="store_true",
        help="Write internal-only test split experiment scores to PostGIS.",
    )
    parser.add_argument(
        "--skip-tree-model",
        action="store_true",
        help="Train logistic regression only.",
    )
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is required for Phase 10C.",
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


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def mature_snapshot_years(max_observed_date: date, horizon_years: int) -> list[int]:
    latest_mature_year = max_observed_date.year - horizon_years
    if max_observed_date < date(max_observed_date.year, 12, 31):
        latest_mature_year -= 1
    return list(range(2014, latest_mature_year + 1))


def build_temporal_split(mature_years: list[int]) -> TemporalSplit:
    years = sorted(set(mature_years))
    if len(years) < 4:
        raise ValueError("At least four mature snapshot years are required.")

    test_years = [years[-1]]
    validation_years = years[-3:-1] if len(years) >= 6 else [years[-2]]
    train_years = [year for year in years if year not in {*validation_years, *test_years}]
    if not train_years:
        raise ValueError("Temporal split produced no training years.")
    return TemporalSplit(
        train_years=train_years,
        validation_years=validation_years,
        test_years=test_years,
    )


def feature_columns_for_set(feature_set_name: str) -> list[str]:
    feature_set = FEATURE_SETS[feature_set_name]
    return [
        *feature_set["numeric"],
        *feature_set["boolean"],
        *feature_set["categorical"],
    ]


def assert_no_target_leakage(feature_columns: list[str]) -> None:
    leaked = sorted(set(feature_columns).intersection(TARGET_COLUMNS))
    if leaked:
        raise ValueError(f"Target leakage columns selected as features: {leaked}")


def max_observed_permit_date(engine: Engine) -> date:
    with engine.connect() as connection:
        value = connection.execute(
            text("SELECT MAX(permit_file_date) FROM public.new_construction_permits_clean"),
        ).scalar_one()
    if value is None:
        raise RuntimeError("No max permit_file_date found in new construction clean table.")
    return value


def fetch_label_distribution(engine: Engine) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [
            dict(row)
            for row in connection.execute(
                text(
                    f"""
                    SELECT
                      snapshot_year,
                      COUNT(*) AS row_count,
                      COUNT(*) FILTER (WHERE new_construction_next_1yr) AS positive_next_1yr,
                      COUNT(*) FILTER (WHERE new_construction_next_3yr) AS positive_next_3yr,
                      COUNT(*) FILTER (WHERE residential_new_construction_next_3yr)
                        AS residential_positive_next_3yr,
                      COUNT(*) FILTER (WHERE commercial_new_construction_next_3yr)
                        AS commercial_positive_next_3yr
                    FROM public.{FEATURE_TABLE}
                    GROUP BY snapshot_year
                    ORDER BY snapshot_year
                    """,
                ),
            ).mappings()
        ]


def read_model_frame(
    engine: Engine,
    target: str,
    feature_set_name: str,
    split: TemporalSplit,
) -> pd.DataFrame:
    columns = [
        "official_parcel_id",
        "pin14",
        "snapshot_year",
        target,
        *feature_columns_for_set(feature_set_name),
    ]
    selected_years = split.train_years + split.validation_years + split.test_years
    sql = text(
        f"""
        SELECT {", ".join(columns)}
        FROM public.{FEATURE_TABLE}
        WHERE snapshot_year = ANY(:snapshot_years)
        """,
    )
    return pd.read_sql_query(
        sql,
        engine,
        params={"snapshot_years": selected_years},
    )


def split_frame(df: pd.DataFrame, split: TemporalSplit, target: str) -> dict[str, tuple[pd.DataFrame, pd.Series]]:
    result = {}
    for split_name, years in {
        "train": split.train_years,
        "validation": split.validation_years,
        "test": split.test_years,
    }.items():
        subset = df[df["snapshot_year"].isin(years)].copy()
        y = subset[target].astype(bool)
        x = subset.drop(columns=[target])
        result[split_name] = (x, y)
    return result


def preprocess_boolean_columns(df: pd.DataFrame, feature_set_name: str) -> pd.DataFrame:
    feature_set = FEATURE_SETS[feature_set_name]
    processed = df.copy()
    for column in feature_set["boolean"]:
        if column in processed:
            processed[column] = processed[column].map(
                {True: 1, False: 0, "true": 1, "false": 0},
            )
    return processed


def build_logistic_pipeline(feature_set_name: str, random_state: int) -> Pipeline:
    feature_set = FEATURE_SETS[feature_set_name]
    transformers = []
    if feature_set["numeric"] or feature_set["boolean"]:
        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ],
                ),
                [*feature_set["numeric"], *feature_set["boolean"]],
            ),
        )
    if feature_set["categorical"]:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="ignore", min_frequency=100),
                        ),
                    ],
                ),
                feature_set["categorical"],
            ),
        )

    return Pipeline(
        [
            ("preprocess", ColumnTransformer(transformers)),
            (
                "model",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=250,
                    random_state=random_state,
                    solver="lbfgs",
                ),
            ),
        ],
    )


def build_hist_gradient_pipeline(feature_set_name: str, random_state: int) -> Pipeline:
    feature_set = FEATURE_SETS[feature_set_name]
    transformers = []
    if feature_set["numeric"] or feature_set["boolean"]:
        transformers.append(
            (
                "num",
                SimpleImputer(strategy="median"),
                [*feature_set["numeric"], *feature_set["boolean"]],
            ),
        )
    if feature_set["categorical"]:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "ordinal",
                            OrdinalEncoder(
                                handle_unknown="use_encoded_value",
                                unknown_value=-1,
                            ),
                        ),
                    ],
                ),
                feature_set["categorical"],
            ),
        )

    return Pipeline(
        [
            ("preprocess", ColumnTransformer(transformers)),
            (
                "model",
                HistGradientBoostingClassifier(
                    learning_rate=0.08,
                    max_iter=80,
                    max_leaf_nodes=31,
                    random_state=random_state,
                ),
            ),
        ],
    )


def probabilities(model: Pipeline, x: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        return model.predict_proba(x)[:, 1]
    decision = model.decision_function(x)
    return 1.0 / (1.0 + np.exp(-decision))


def precision_recall_lift_at_fraction(
    y_true: pd.Series | np.ndarray,
    y_probability: np.ndarray,
    fraction: float,
) -> dict[str, Any]:
    return development_model_metrics.precision_recall_lift_at_fraction(
        y_true,
        y_probability,
        fraction,
    )


def metrics_for_predictions(y_true: pd.Series, y_probability: np.ndarray) -> dict[str, Any]:
    return development_model_metrics.metrics_for_predictions(y_true, y_probability)


def fit_models(
    frames: dict[str, tuple[pd.DataFrame, pd.Series]],
    feature_set_name: str,
    random_state: int,
    skip_tree_model: bool,
) -> dict[str, dict[str, Any]]:
    x_train = preprocess_boolean_columns(frames["train"][0], feature_set_name)
    y_train = frames["train"][1]
    x_validation = preprocess_boolean_columns(frames["validation"][0], feature_set_name)
    y_validation = frames["validation"][1]
    x_test = preprocess_boolean_columns(frames["test"][0], feature_set_name)
    y_test = frames["test"][1]

    drop_columns = ["official_parcel_id", "pin14", "snapshot_year"]
    x_train_features = x_train.drop(columns=drop_columns)
    x_validation_features = x_validation.drop(columns=drop_columns)
    x_test_features = x_test.drop(columns=drop_columns)

    model_specs: list[tuple[str, Pipeline]] = [
        ("logistic_regression", build_logistic_pipeline(feature_set_name, random_state)),
    ]
    if not skip_tree_model:
        model_specs.append(
            (
                "hist_gradient_boosting",
                build_hist_gradient_pipeline(feature_set_name, random_state),
            ),
        )

    trained: dict[str, dict[str, Any]] = {}
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_train)
    for model_name, model in model_specs:
        fit_kwargs = {"model__sample_weight": sample_weight}
        model.fit(x_train_features, y_train, **fit_kwargs)
        validation_probability = probabilities(model, x_validation_features)
        test_probability = probabilities(model, x_test_features)
        trained[model_name] = {
            "model": model,
            "validation_probability": validation_probability,
            "test_probability": test_probability,
            "validation_metrics": metrics_for_predictions(y_validation, validation_probability),
            "test_metrics": metrics_for_predictions(y_test, test_probability),
            "x_test_metadata": x_test[drop_columns].reset_index(drop=True),
            "y_test": y_test.reset_index(drop=True),
        }
    return trained


def best_model_name(trained: dict[str, dict[str, Any]]) -> str:
    return max(
        trained,
        key=lambda name: trained[name]["validation_metrics"].get("average_precision_pr_auc")
        or -1,
    )


def load_registry_metadata() -> dict[str, dict[str, Any]]:
    registry = json.loads(FEATURE_REGISTRY_PATH.read_text(encoding="utf-8"))
    return {
        feature["feature_name"]: feature
        for feature in registry.get("features", [])
    }


def feature_importance_rows(
    model: Pipeline,
    model_name: str,
    feature_set_name: str,
) -> list[dict[str, Any]]:
    if model_name != "logistic_regression":
        return []

    registry = load_registry_metadata()
    preprocessor = model.named_steps["preprocess"]
    names = preprocessor.get_feature_names_out()
    coefficients = model.named_steps["model"].coef_[0]
    rows: list[dict[str, Any]] = []
    for name, coefficient in zip(names, coefficients, strict=True):
        clean_name = name.replace("num__", "").replace("cat__", "")
        base_feature = clean_name.split("_", 1)[0]
        metadata = registry.get(clean_name) or registry.get(base_feature) or {}
        rows.append(
            {
                "model_name": model_name,
                "feature_set_name": feature_set_name,
                "feature_name": clean_name,
                "coefficient": round(float(coefficient), 8),
                "absolute_coefficient": round(abs(float(coefficient)), 8),
                "feature_group": metadata.get("feature_group", "model_feature"),
                "temporal_status": metadata.get("temporal_status", "time_safe")
                if feature_set_name == "strict_time_safe_baseline"
                else metadata.get("temporal_status", "current_context"),
                "leakage_risk": metadata.get("leakage_risk", "low")
                if feature_set_name == "strict_time_safe_baseline"
                else metadata.get("leakage_risk", "review_required"),
            },
        )
    return sorted(rows, key=lambda row: row["absolute_coefficient"], reverse=True)


def prediction_sample_rows(
    metadata: pd.DataFrame,
    y_true: pd.Series,
    y_probability: np.ndarray,
    target: str,
    model_name: str,
    feature_set_name: str,
    experiment_id: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    frame = metadata.copy()
    frame["actual_label"] = y_true.astype(bool).to_numpy()
    frame["experimental_probability"] = y_probability
    frame = frame.sort_values("experimental_probability", ascending=False).reset_index(drop=True)
    frame["probability_rank"] = np.arange(1, len(frame) + 1)
    frame["probability_percentile"] = 1.0 - ((frame["probability_rank"] - 1) / len(frame))
    rows = []
    for row in frame.head(limit).to_dict("records"):
        rows.append(
            {
                "model_experiment_id": experiment_id,
                "official_parcel_id": row["official_parcel_id"],
                "pin14": row.get("pin14"),
                "snapshot_year": int(row["snapshot_year"]),
                "target_name": target,
                "actual_label": bool(row["actual_label"]),
                "experimental_probability": round(float(row["experimental_probability"]), 8),
                "probability_rank": int(row["probability_rank"]),
                "probability_percentile": round(float(row["probability_percentile"]), 8),
                "model_name": model_name,
                "feature_set_name": feature_set_name,
                "no_frontend_exposure": True,
                "production_ready": False,
                "caveat": "internal_experiment_not_for_public_decision",
            },
        )
    return rows


def write_score_table(
    engine: Engine,
    metadata: pd.DataFrame,
    y_probability: np.ndarray,
    target: str,
    model_name: str,
    feature_set_name: str,
    experiment_id: str,
    split: TemporalSplit,
) -> int:
    frame = metadata.copy().reset_index(drop=True)
    frame["model_experiment_id"] = experiment_id
    frame["target_name"] = target
    frame["experimental_probability"] = y_probability
    frame = frame.sort_values("experimental_probability", ascending=False).reset_index(drop=True)
    frame["probability_rank"] = np.arange(1, len(frame) + 1)
    frame["probability_percentile"] = 1.0 - ((frame["probability_rank"] - 1) / len(frame))
    frame["model_name"] = model_name
    frame["feature_set_name"] = feature_set_name
    frame["training_window"] = (
        f"train={min(split.train_years)}-{max(split.train_years)};"
        f"validation={min(split.validation_years)}-{max(split.validation_years)};"
        f"test={min(split.test_years)}-{max(split.test_years)}"
    )
    frame["score_created_at"] = datetime.now()
    frame["production_ready"] = False
    frame["caveat"] = "internal_experiment_not_for_public_decision"
    columns = [
        "model_experiment_id",
        "official_parcel_id",
        "pin14",
        "snapshot_year",
        "target_name",
        "experimental_probability",
        "probability_rank",
        "probability_percentile",
        "model_name",
        "feature_set_name",
        "training_window",
        "score_created_at",
        "production_ready",
        "caveat",
    ]
    with engine.begin() as connection:
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS public.{SCORE_TABLE} (
                  model_experiment_id text NOT NULL,
                  official_parcel_id text NOT NULL,
                  pin14 text,
                  snapshot_year integer NOT NULL,
                  target_name text NOT NULL,
                  experimental_probability numeric,
                  probability_rank integer,
                  probability_percentile numeric,
                  model_name text,
                  feature_set_name text,
                  training_window text,
                  score_created_at timestamptz,
                  production_ready boolean NOT NULL DEFAULT false,
                  caveat text
                )
                """,
            ),
        )
        connection.execute(
            text(
                f"DELETE FROM public.{SCORE_TABLE} WHERE model_experiment_id = :experiment_id",
            ),
            {"experiment_id": experiment_id},
        )
    frame[columns].to_sql(
        SCORE_TABLE,
        engine,
        schema="public",
        if_exists="append",
        index=False,
        chunksize=1000,
        method="multi",
    )
    return len(frame)


def write_label_distribution(path: Path, rows: list[dict[str, Any]], split: TemporalSplit) -> None:
    split_by_year = {
        **{year: "train" for year in split.train_years},
        **{year: "validation" for year in split.validation_years},
        **{year: "test" for year in split.test_years},
    }
    output_rows = []
    for row in rows:
        year = int(row["snapshot_year"])
        output_rows.append(
            {
                **row,
                "split": split_by_year.get(year, "excluded_incomplete_future_window"),
            },
        )
    write_csv(
        path,
        output_rows,
        [
            "snapshot_year",
            "split",
            "row_count",
            "positive_next_1yr",
            "positive_next_3yr",
            "residential_positive_next_3yr",
            "commercial_positive_next_3yr",
        ],
    )


def render_model_card(
    path: Path,
    target: str,
    feature_set_name: str,
    split: TemporalSplit,
    metrics: dict[str, Any],
    top_features: list[dict[str, Any]],
    experiment_id: str,
) -> None:
    top_feature_lines = "\n".join(
        f"- `{row['feature_name']}` ({row['feature_group']}): coefficient `{row['coefficient']}`"
        for row in top_features[:10]
    ) or "- Feature importance unavailable for the selected best model."
    content = f"""# Development Prediction Baseline Model Card

Experiment ID: `{experiment_id}`

## Status

This is an internal Phase 10C experiment only. It is **not** production ready,
does not expose predictions in the frontend, and does not support public parcel
decision-making.

## Target

Primary target used: `{target}`.

The target is a Phase 10A future label. It is never used as a feature.

## Training Data

Source table: `public.parcel_development_prediction_features`

Only mature snapshot years are used. For the 3-year target, years after `2022`
are excluded because their full future window is not observable from the current
permit extract.

Temporal split:

- Train: `{min(split.train_years)}-{max(split.train_years)}`
- Validation: `{min(split.validation_years)}-{max(split.validation_years)}`
- Test: `{min(split.test_years)}-{max(split.test_years)}`

## Feature Set

Feature set: `{feature_set_name}`

The strict baseline uses prior-window permit and new-construction history only.
Current zoning, valuation, school assignment, flood, and all-time development
activity fields are excluded from the strict model unless the explicitly marked
exploratory feature set is used.

## Test Metrics

```json
{json.dumps(metrics, indent=2)}
```

## Important Features

{top_feature_lines}

## Limitations

- This is descriptive baseline research, not a production prediction product.
- Labels are sparse and class-imbalanced, so PR-AUC, precision@k, and lift are
  more important than accuracy.
- Current zoning changes, subdivision approvals, market/economic controls,
  infrastructure readiness, road/accessibility, and official school capacity
  are not in the strict baseline.
- Official school capacity/enrollment is not active.
- No fairness, governance, calibration, or external validation approval has
  been completed.

## Future Improvements Needed

- Historical zoning change series.
- Future land-use and subdivision approval features.
- Road/accessibility and infrastructure readiness.
- Official school capacity/enrollment.
- Market/economic controls.
- Parcel vacancy and underbuilt indicators validated against historical values.
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def render_caveats(path: Path, target: str, feature_set_name: str, excluded_years: list[int]) -> None:
    content = f"""# Phase 10C Model Caveats

- Target: `{target}`
- Feature set: `{feature_set_name}`
- Excluded snapshot years due to incomplete future windows: `{excluded_years}`
- This experiment is internal and not production ready.
- No frontend prediction probabilities are exposed.
- Strict baseline features are time-windowed to snapshot year-end.
- Current-context exploratory features, if used, are not historically perfect.
- School capacity scoring remains disabled until official enrollment/capacity
  data is ingested and vetted.
"""
    path.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    engine = create_engine_from_env()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    feature_columns = feature_columns_for_set(args.feature_set)
    assert_no_target_leakage(feature_columns)

    observed_date = max_observed_permit_date(engine)
    mature_years = mature_snapshot_years(observed_date, TARGET_HORIZONS[args.target])
    split = build_temporal_split(mature_years)
    all_label_rows = fetch_label_distribution(engine)
    all_years = [int(row["snapshot_year"]) for row in all_label_rows]
    excluded_years = [year for year in all_years if year not in mature_years]
    experiment_id = (
        f"phase10c_{args.target}_{args.feature_set}_"
        f"{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )

    dry_run_summary = {
        "experiment_id": experiment_id,
        "target": args.target,
        "feature_set": args.feature_set,
        "feature_columns": feature_columns,
        "mature_snapshot_years": mature_years,
        "excluded_snapshot_years": excluded_years,
        "temporal_split": split.as_dict(),
        "max_observed_new_construction_permit_date": observed_date,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
    }
    if args.dry_run:
        write_json(output_dir / "phase10c_temporal_split_summary.json", dry_run_summary)
        return 0

    df = read_model_frame(engine, args.target, args.feature_set, split)
    frames = split_frame(df, split, args.target)
    trained = fit_models(frames, args.feature_set, args.random_state, args.skip_tree_model)
    selected_model_name = best_model_name(trained)
    selected = trained[selected_model_name]

    metrics = {
        "experiment_id": experiment_id,
        "target": args.target,
        "feature_set": args.feature_set,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "best_model_name": selected_model_name,
        "models": {
            name: {
                "validation": payload["validation_metrics"],
                "test": payload["test_metrics"],
            }
            for name, payload in trained.items()
        },
    }
    write_json(output_dir / "phase10c_model_metrics.json", metrics)

    split_summary = {
        **dry_run_summary,
        "rows": {
            split_name: {
                "row_count": int(len(y)),
                "positive_count": int(y.sum()),
                "positive_rate": round(float(y.mean()), 6) if len(y) else 0.0,
            }
            for split_name, (_, y) in frames.items()
        },
    }
    write_json(output_dir / "phase10c_temporal_split_summary.json", split_summary)
    write_label_distribution(
        output_dir / "phase10c_label_distribution.csv",
        all_label_rows,
        split,
    )

    importance_rows = feature_importance_rows(
        trained["logistic_regression"]["model"],
        "logistic_regression",
        args.feature_set,
    )
    write_csv(
        output_dir / "phase10c_feature_importance.csv",
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
        ],
    )

    sample_rows = prediction_sample_rows(
        selected["x_test_metadata"],
        selected["y_test"],
        selected["test_probability"],
        args.target,
        selected_model_name,
        args.feature_set,
        experiment_id,
    )
    write_csv(
        output_dir / "phase10c_predictions_sample.csv",
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
        score_table_rows = write_score_table(
            engine,
            selected["x_test_metadata"],
            selected["test_probability"],
            args.target,
            selected_model_name,
            args.feature_set,
            experiment_id,
            split,
        )

    render_caveats(
        output_dir / "phase10c_model_caveats.md",
        args.target,
        args.feature_set,
        excluded_years,
    )
    render_model_card(
        MODEL_CARD_PATH,
        args.target,
        args.feature_set,
        split,
        selected["test_metrics"],
        importance_rows,
        experiment_id,
    )

    summary = {
        "phase": "10C",
        "generated_at": datetime.now().isoformat(),
        "experiment_id": experiment_id,
        "target_used": args.target,
        "feature_set_used": args.feature_set,
        "mature_snapshot_years_used": mature_years,
        "excluded_snapshot_years": excluded_years,
        "temporal_split": split.as_dict(),
        "rows_used": split_summary["rows"],
        "model_types_trained": list(trained),
        "best_model_name": selected_model_name,
        "metrics": metrics["models"][selected_model_name],
        "top_important_features": importance_rows[:10],
        "positive_rate": split_summary["rows"]["test"]["positive_rate"],
        "experiment_score_table_created": args.write_score_table,
        "experiment_score_table": f"public.{SCORE_TABLE}" if args.write_score_table else None,
        "experiment_score_rows": score_table_rows,
        "model_active": False,
        "prediction_probability_available": False,
        "production_ready": False,
        "limitations": [
            "Internal experiment only; no frontend exposure.",
            "Uses mature labels only; incomplete future windows are excluded.",
            "Strict baseline excludes current-context zoning, school, flood, valuation, and activity features.",
            "No official school capacity score is active.",
            "No external validation or governance approval has been completed.",
        ],
        "recommended_next_step": "Review strict baseline PR-AUC, lift, and top-k precision before any broader exploratory model.",
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
