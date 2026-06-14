"""Create Phase 10G internal development ranking classes and explanations.

This is an internal review layer only. It converts Phase 10E experimental
scores into percentile/rank classes and lightweight explanation summaries
without exposing exact probabilities or enabling production use.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "outputs" / "modeling" / "development_prediction"
ROOT_SUMMARY_PATH = REPO_ROOT / "outputs" / "phase10g_internal_development_ranking_summary.json"

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

EXPERIMENT_ID = "phase10e_zoning_enhanced_v1"
RANKING_METHOD = "phase10g_percentile_rank_classes_no_probability"
CAVEAT = "internal_ranking_research_not_for_public_decision"
CLASS_TABLE = "development_prediction_ranking_classes"
EXPLANATION_TABLE = "development_prediction_ranking_explanations"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build internal development ranking classes.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--experiment-id", default=EXPERIMENT_ID)
    return parser.parse_args()


def build_database_url() -> URL:
    password = os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD") or ""
    return URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", DEFAULT_DB_USER),
        password=password,
        host=os.getenv("POSTGRES_HOST", DEFAULT_DB_HOST),
        port=int(os.getenv("POSTGRES_PORT", DEFAULT_DB_PORT)),
        database=os.getenv("POSTGRES_DB", DEFAULT_DB_NAME),
    )


def create_engine_from_env() -> Engine:
    return create_engine(build_database_url(), pool_pre_ping=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str, ensure_ascii=True), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def create_tables(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS public.{CLASS_TABLE} (
                  ranking_class_id bigserial PRIMARY KEY,
                  model_experiment_id text NOT NULL,
                  official_parcel_id text NOT NULL,
                  pin14 text,
                  snapshot_year integer NOT NULL,
                  development_signal_class text NOT NULL,
                  development_signal_rank integer NOT NULL,
                  development_signal_percentile numeric NOT NULL,
                  ranking_method text NOT NULL,
                  model_name text,
                  feature_set_name text,
                  production_ready boolean NOT NULL DEFAULT false,
                  public_exposure_allowed boolean NOT NULL DEFAULT false,
                  caveat text NOT NULL,
                  created_at timestamptz NOT NULL DEFAULT now()
                )
                """,
            ),
        )
        connection.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{CLASS_TABLE}_experiment
                ON public.{CLASS_TABLE} (model_experiment_id)
                """,
            ),
        )
        connection.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{CLASS_TABLE}_parcel
                ON public.{CLASS_TABLE} (official_parcel_id)
                """,
            ),
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS public.{EXPLANATION_TABLE} (
                  explanation_id bigserial PRIMARY KEY,
                  model_experiment_id text NOT NULL,
                  official_parcel_id text NOT NULL,
                  pin14 text,
                  snapshot_year integer NOT NULL,
                  development_signal_class text NOT NULL,
                  top_driver_1 text,
                  top_driver_2 text,
                  top_driver_3 text,
                  driver_summary text NOT NULL,
                  zoning_driver_flag boolean NOT NULL DEFAULT false,
                  permit_history_driver_flag boolean NOT NULL DEFAULT false,
                  parcel_characteristics_driver_flag boolean NOT NULL DEFAULT false,
                  flood_constraint_driver_flag boolean NOT NULL DEFAULT false,
                  school_context_driver_flag boolean NOT NULL DEFAULT false,
                  explanation_method text NOT NULL,
                  caveat text NOT NULL,
                  created_at timestamptz NOT NULL DEFAULT now()
                )
                """,
            ),
        )
        connection.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{EXPLANATION_TABLE}_experiment
                ON public.{EXPLANATION_TABLE} (model_experiment_id)
                """,
            ),
        )
        connection.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS idx_{EXPLANATION_TABLE}_parcel
                ON public.{EXPLANATION_TABLE} (official_parcel_id)
                """,
            ),
        )


def class_for_rank(rank: int, total_rows: int) -> str:
    top_1 = max(1, int((total_rows * 0.01) + 0.999999))
    top_5 = max(1, int((total_rows * 0.05) + 0.999999))
    top_15 = max(1, int((total_rows * 0.15) + 0.999999))
    if rank <= top_1:
        return "very_high_development_signal"
    if rank <= top_5:
        return "high_development_signal"
    if rank <= top_15:
        return "moderate_development_signal"
    return "low_development_signal"


def fetch_score_frame(engine: Engine, experiment_id: str) -> pd.DataFrame:
    return pd.read_sql_query(
        text(
            """
            SELECT
              model_experiment_id,
              official_parcel_id,
              pin14,
              snapshot_year,
              probability_rank::integer AS development_signal_rank,
              probability_percentile::float AS development_signal_percentile,
              model_name,
              feature_set_name
            FROM public.development_prediction_model_experiment_scores
            WHERE model_experiment_id = :experiment_id
            ORDER BY probability_rank ASC, official_parcel_id ASC
            """,
        ),
        engine,
        params={"experiment_id": experiment_id},
    )


def fetch_feature_context(engine: Engine, experiment_id: str) -> pd.DataFrame:
    return pd.read_sql_query(
        text(
            """
            WITH scored AS (
              SELECT official_parcel_id, snapshot_year
              FROM public.development_prediction_model_experiment_scores
              WHERE model_experiment_id = :experiment_id
            )
            SELECT
              f.official_parcel_id,
              f.pin14,
              f.snapshot_year,
              f.parcel_area_acres,
              f.value_per_acre,
              f.vacant_or_underbuilt_flag,
              f.zoning_code,
              f.zoning_category,
              f.historical_zoning_code,
              f.historical_zoning_general_category,
              f.historical_zoning_jurisdiction,
              f.zoning_source_age_years,
              f.zoning_temporal_status,
              f.zoning_changed_prior_1yr,
              f.zoning_changed_prior_3yr,
              f.zoning_changed_prior_5yr,
              f.zoning_change_count_prior_5yr,
              f.latest_zoning_change_type,
              f.latest_zoning_intensity_change,
              f.zoning_intensity_increased_prior_5yr,
              f.rezoned_to_growth_supportive_prior_5yr,
              f.zoning_map_change_only_flag,
              f.permits_prior_1yr,
              f.permits_prior_3yr,
              f.permits_prior_5yr,
              f.major_permits_prior_3yr,
              f.new_construction_permits_prior_1yr,
              f.new_construction_permits_prior_3yr,
              f.years_since_last_permit,
              f.years_since_last_new_construction,
              f.flood_review_required,
              f.floodway_present,
              f.sfha_present,
              f.percent_parcel_constrained,
              f.flood_constraint_score,
              f.has_elementary_assignment,
              f.has_middle_assignment,
              f.has_high_assignment,
              f.school_capacity_status,
              f.school_constraint_class
            FROM public.parcel_development_prediction_features_zoning_enhanced f
            JOIN scored s
              ON f.official_parcel_id = s.official_parcel_id
             AND f.snapshot_year = s.snapshot_year
            """,
        ),
        engine,
        params={"experiment_id": experiment_id},
    )


def build_ranking_frame(score_frame: pd.DataFrame) -> pd.DataFrame:
    total_rows = len(score_frame)
    frame = score_frame.copy()
    frame["development_signal_class"] = frame["development_signal_rank"].apply(
        lambda rank: class_for_rank(int(rank), total_rows),
    )
    frame["ranking_method"] = RANKING_METHOD
    frame["production_ready"] = False
    frame["public_exposure_allowed"] = False
    frame["caveat"] = CAVEAT
    return frame[
        [
            "model_experiment_id",
            "official_parcel_id",
            "pin14",
            "snapshot_year",
            "development_signal_class",
            "development_signal_rank",
            "development_signal_percentile",
            "ranking_method",
            "model_name",
            "feature_set_name",
            "production_ready",
            "public_exposure_allowed",
            "caveat",
        ]
    ]


def truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    return str(value).lower() in {"true", "1", "yes", "y"}


def numeric(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def explanation_for_row(row: pd.Series) -> dict[str, Any]:
    drivers: list[tuple[str, str]] = []

    if truthy(row.get("zoning_intensity_increased_prior_5yr")):
        drivers.append(("zoning", "historical zoning intensity increase signal"))
    elif truthy(row.get("rezoned_to_growth_supportive_prior_5yr")):
        drivers.append(("zoning", "growth-supportive historical zoning map-change signal"))
    elif truthy(row.get("zoning_changed_prior_5yr")) or numeric(row.get("zoning_change_count_prior_5yr")):
        change_count = numeric(row.get("zoning_change_count_prior_5yr")) or 0
        if change_count > 0:
            drivers.append(("zoning", "recent historical zoning map-change signal"))
    elif row.get("historical_zoning_general_category") not in {None, "", "unknown"}:
        drivers.append(("zoning", "historical zoning context available"))

    new_construction_prior = numeric(row.get("new_construction_permits_prior_3yr")) or 0
    permits_prior = numeric(row.get("permits_prior_3yr")) or 0
    major_permits = numeric(row.get("major_permits_prior_3yr")) or 0
    if new_construction_prior > 0:
        drivers.append(("permit", "recent new-construction permit history"))
    elif major_permits > 0:
        drivers.append(("permit", "recent major permit activity"))
    elif permits_prior >= 3:
        drivers.append(("permit", "repeated recent permit activity"))

    parcel_area = numeric(row.get("parcel_area_acres"))
    value_per_acre = numeric(row.get("value_per_acre"))
    if truthy(row.get("vacant_or_underbuilt_flag")):
        drivers.append(("parcel", "vacant or underbuilt parcel context"))
    elif parcel_area is not None and parcel_area >= 5:
        drivers.append(("parcel", "larger parcel acreage context"))
    elif value_per_acre is not None and value_per_acre > 0:
        drivers.append(("parcel", "parcel valuation context available"))

    flood_score = numeric(row.get("flood_constraint_score")) or 0
    percent_constrained = numeric(row.get("percent_parcel_constrained")) or 0
    if truthy(row.get("flood_review_required")):
        drivers.append(("flood", "FEMA flood review constraint present"))
    elif flood_score == 0 and percent_constrained == 0:
        drivers.append(("flood", "low FEMA flood constraint exposure"))

    if (
        truthy(row.get("has_elementary_assignment"))
        or truthy(row.get("has_middle_assignment"))
        or truthy(row.get("has_high_assignment"))
    ):
        drivers.append(("school", "school attendance-zone context available but not capacity-scored"))

    unique_drivers: list[tuple[str, str]] = []
    seen: set[str] = set()
    for category, label in drivers:
        if label not in seen:
            unique_drivers.append((category, label))
            seen.add(label)

    selected = unique_drivers[:3]
    if not selected:
        selected = [("unknown", "insufficient_feature_context")]

    labels = [label for _, label in selected]
    categories = {category for category, _ in selected}
    return {
        "top_driver_1": labels[0] if len(labels) > 0 else None,
        "top_driver_2": labels[1] if len(labels) > 1 else None,
        "top_driver_3": labels[2] if len(labels) > 2 else None,
        "driver_summary": "; ".join(labels),
        "zoning_driver_flag": "zoning" in categories,
        "permit_history_driver_flag": "permit" in categories,
        "parcel_characteristics_driver_flag": "parcel" in categories,
        "flood_constraint_driver_flag": "flood" in categories,
        "school_context_driver_flag": "school" in categories,
    }


def build_explanation_frame(ranking_frame: pd.DataFrame, feature_context: pd.DataFrame) -> pd.DataFrame:
    frame = ranking_frame.merge(
        feature_context,
        on=["official_parcel_id", "pin14", "snapshot_year"],
        how="left",
    )
    explanation_rows: list[dict[str, Any]] = []
    for row in frame.to_dict("records"):
        explanation = explanation_for_row(pd.Series(row))
        explanation_rows.append(
            {
                "model_experiment_id": row["model_experiment_id"],
                "official_parcel_id": row["official_parcel_id"],
                "pin14": row.get("pin14"),
                "snapshot_year": int(row["snapshot_year"]),
                "development_signal_class": row["development_signal_class"],
                **explanation,
                "explanation_method": "phase10g_rule_based_from_feature_context_and_phase10f_importance",
                "caveat": CAVEAT,
            },
        )
    return pd.DataFrame(explanation_rows)


def load_tables(
    engine: Engine,
    ranking_frame: pd.DataFrame,
    explanation_frame: pd.DataFrame,
    experiment_id: str,
    truncate_and_load: bool,
) -> None:
    with engine.begin() as connection:
        if truncate_and_load:
            connection.execute(
                text(
                    f"DELETE FROM public.{EXPLANATION_TABLE} WHERE model_experiment_id = :experiment_id",
                ),
                {"experiment_id": experiment_id},
            )
            connection.execute(
                text(
                    f"DELETE FROM public.{CLASS_TABLE} WHERE model_experiment_id = :experiment_id",
                ),
                {"experiment_id": experiment_id},
            )
    ranking_frame.to_sql(CLASS_TABLE, engine, schema="public", if_exists="append", index=False)
    explanation_frame.to_sql(EXPLANATION_TABLE, engine, schema="public", if_exists="append", index=False)


def validation_summary(engine: Engine, experiment_id: str) -> dict[str, Any]:
    with engine.connect() as connection:
        return dict(
            connection.execute(
                text(
                    f"""
                    SELECT
                      (SELECT COUNT(*) FROM public.{CLASS_TABLE}
                       WHERE model_experiment_id = :experiment_id) AS ranking_row_count,
                      (SELECT COUNT(DISTINCT official_parcel_id) FROM public.{CLASS_TABLE}
                       WHERE model_experiment_id = :experiment_id) AS unique_parcels,
                      (SELECT COUNT(*) FROM public.{EXPLANATION_TABLE}
                       WHERE model_experiment_id = :experiment_id) AS explanation_row_count,
                      (SELECT COUNT(*) FROM public.{CLASS_TABLE}
                       WHERE model_experiment_id = :experiment_id
                         AND production_ready IS TRUE) AS production_ready_rows,
                      (SELECT COUNT(*) FROM public.{CLASS_TABLE}
                       WHERE model_experiment_id = :experiment_id
                         AND public_exposure_allowed IS TRUE) AS public_exposure_allowed_rows,
                      (SELECT COUNT(*) FROM public.{EXPLANATION_TABLE}
                       WHERE model_experiment_id = :experiment_id
                         AND driver_summary = 'insufficient_feature_context') AS missing_explanation_count
                    """,
                ),
                {"experiment_id": experiment_id},
            ).mappings().one(),
        )


def write_outputs(
    ranking_frame: pd.DataFrame,
    explanation_frame: pd.DataFrame,
    validation: dict[str, Any],
    experiment_id: str,
) -> dict[str, Any]:
    class_distribution = (
        ranking_frame.groupby("development_signal_class")
        .size()
        .reset_index(name="row_count")
        .sort_values("development_signal_class")
    )
    class_distribution["pct_of_rows"] = (
        class_distribution["row_count"] / len(ranking_frame) * 100
    ).round(4)
    class_distribution.to_csv(
        OUTPUT_DIR / "phase10g_ranking_class_distribution.csv",
        index=False,
    )

    top_review = ranking_frame.head(200).merge(
        explanation_frame,
        on=[
            "model_experiment_id",
            "official_parcel_id",
            "pin14",
            "snapshot_year",
            "development_signal_class",
        ],
        how="left",
    )
    top_review.to_csv(
        OUTPUT_DIR / "phase10g_top_ranked_internal_review.csv",
        index=False,
    )

    driver_rows = []
    for column, label in [
        ("zoning_driver_flag", "zoning"),
        ("permit_history_driver_flag", "permit_history"),
        ("parcel_characteristics_driver_flag", "parcel_characteristics"),
        ("flood_constraint_driver_flag", "flood_constraint"),
        ("school_context_driver_flag", "school_context"),
    ]:
        driver_rows.append(
            {
                "driver_category": label,
                "row_count": int(explanation_frame[column].sum()),
                "pct_of_explanations": round(float(explanation_frame[column].mean() * 100), 4),
            },
        )
    write_csv(
        OUTPUT_DIR / "phase10g_driver_summary_counts.csv",
        driver_rows,
        ["driver_category", "row_count", "pct_of_explanations"],
    )

    class_counts = {
        row["development_signal_class"]: int(row["row_count"])
        for row in class_distribution.to_dict("records")
    }
    validation_payload = {
        "experiment_id": experiment_id,
        "ranking_table": f"public.{CLASS_TABLE}",
        "explanation_table": f"public.{EXPLANATION_TABLE}",
        "ranking_row_count": int(validation["ranking_row_count"]),
        "unique_parcels": int(validation["unique_parcels"]),
        "explanation_row_count": int(validation["explanation_row_count"]),
        "class_distribution": class_counts,
        "top_1_percent_count": int(class_counts.get("very_high_development_signal", 0)),
        "top_5_percent_count": int(
            class_counts.get("very_high_development_signal", 0)
            + class_counts.get("high_development_signal", 0),
        ),
        "top_15_percent_count": int(
            class_counts.get("very_high_development_signal", 0)
            + class_counts.get("high_development_signal", 0)
            + class_counts.get("moderate_development_signal", 0),
        ),
        "production_ready_rows": int(validation["production_ready_rows"]),
        "public_exposure_allowed_rows": int(validation["public_exposure_allowed_rows"]),
        "missing_explanation_count": int(validation["missing_explanation_count"]),
        "exact_probabilities_exposed": False,
        "production_ready": False,
        "public_exposure_allowed": False,
        "caveat": CAVEAT,
    }
    write_json(OUTPUT_DIR / "phase10g_ranking_class_validation.json", validation_payload)

    summary = {
        "phase": "10G",
        "generated_at": datetime.now().isoformat(),
        "experiment_id": experiment_id,
        "ranking_class_table_status": {
            "table": f"public.{CLASS_TABLE}",
            "row_count": validation_payload["ranking_row_count"],
            "unique_parcels": validation_payload["unique_parcels"],
        },
        "class_distribution": validation_payload["class_distribution"],
        "top_1_percent_count": validation_payload["top_1_percent_count"],
        "top_5_percent_count": validation_payload["top_5_percent_count"],
        "top_15_percent_count": validation_payload["top_15_percent_count"],
        "explanation_table_status": {
            "table": f"public.{EXPLANATION_TABLE}",
            "row_count": validation_payload["explanation_row_count"],
            "missing_explanation_count": validation_payload["missing_explanation_count"],
        },
        "driver_summary_counts": driver_rows,
        "aggregate_endpoint_status": "implemented: GET /development/prediction/ranking/summary",
        "exact_probabilities_exposed": False,
        "frontend_exposure": False,
        "production_ready": False,
        "public_exposure_allowed": False,
        "limitations": [
            "Internal ranking research only.",
            "Classes are percentile/rank bands, not calibrated probabilities.",
            "Explanations are lightweight rule-based summaries, not SHAP.",
            "Official rezoning case dates, future land use, accessibility/utilities, school capacity, and economic controls remain missing.",
        ],
        "recommended_phase10h_next_step": (
            "Conduct human review of top-ranked parcels and add official rezoning/future "
            "land-use/accessibility controls before any user-facing class display."
        ),
        "outputs": {
            "class_distribution": str(OUTPUT_DIR / "phase10g_ranking_class_distribution.csv"),
            "top_ranked_review": str(OUTPUT_DIR / "phase10g_top_ranked_internal_review.csv"),
            "driver_counts": str(OUTPUT_DIR / "phase10g_driver_summary_counts.csv"),
            "validation": str(OUTPUT_DIR / "phase10g_ranking_class_validation.json"),
            "summary": str(ROOT_SUMMARY_PATH),
        },
    }
    write_json(ROOT_SUMMARY_PATH, summary)
    return summary


def main() -> int:
    args = parse_args()
    engine = create_engine_from_env()
    create_tables(engine)
    score_frame = fetch_score_frame(engine, args.experiment_id)
    if score_frame.empty:
        raise RuntimeError(f"No scores found for {args.experiment_id}")
    ranking_frame = build_ranking_frame(score_frame)
    feature_context = fetch_feature_context(engine, args.experiment_id)
    explanation_frame = build_explanation_frame(ranking_frame, feature_context)

    if args.dry_run:
        payload = {
            "experiment_id": args.experiment_id,
            "score_rows": int(len(score_frame)),
            "ranking_rows_to_create": int(len(ranking_frame)),
            "explanation_rows_to_create": int(len(explanation_frame)),
            "production_ready": False,
            "public_exposure_allowed": False,
            "exact_probabilities_exposed": False,
        }
        print(json.dumps(payload, indent=2))
        return 0

    load_tables(
        engine=engine,
        ranking_frame=ranking_frame,
        explanation_frame=explanation_frame,
        experiment_id=args.experiment_id,
        truncate_and_load=args.truncate_and_load,
    )
    validation = validation_summary(engine, args.experiment_id)
    summary = write_outputs(ranking_frame, explanation_frame, validation, args.experiment_id)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
