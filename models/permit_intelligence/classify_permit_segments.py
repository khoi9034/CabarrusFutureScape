"""Create permit-level intelligence segments from Real Property Permit records."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

SOURCE_TABLE = "public.real_property_permit_clean"
SEGMENT_TABLE = "public.permit_intelligence_segments"

MODEL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODEL_DIR.parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs"
LOG_DIR = MODEL_DIR / "logs"
DEFAULT_RULES_FILE = MODEL_DIR / "permit_segmentation_rules.yaml"

VALIDATION_OUTPUT = OUTPUT_DIR / "permit_segmentation_validation.json"
SEGMENT_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_segment_summary.csv"
GROWTH_SIGNAL_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_growth_signal_summary.csv"
STATUS_STAGE_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_status_stage_summary.csv"
VALUE_CLASS_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_value_class_summary.csv"
SEGMENT_BY_YEAR_OUTPUT = OUTPUT_DIR / "permit_segment_by_year_summary.csv"
SEGMENT_EXAMPLES_OUTPUT = OUTPUT_DIR / "permit_segment_examples.csv"
FINAL_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_intelligence_segmentation_summary.json"

TEXT_SPLIT_RE = re.compile(r"[^0-9a-zA-Z]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Classify Real Property Permit records into CFS permit intelligence segments.",
    )
    parser.add_argument(
        "--rules",
        type=Path,
        default=DEFAULT_RULES_FILE,
        help="Path to permit segmentation YAML rules.",
    )
    parser.add_argument(
        "--skip-table",
        action="store_true",
        help="Only validate and export summaries from the existing segment table.",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"classify_permit_segments_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is not set. Export it before classifying permits."
        )

    url = URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", DEFAULT_DB_USER),
        password=password,
        host=os.getenv("POSTGRES_HOST", DEFAULT_DB_HOST),
        port=int(os.getenv("POSTGRES_PORT", str(DEFAULT_DB_PORT))),
        database=os.getenv("POSTGRES_DB", DEFAULT_DB_NAME),
    )
    return create_engine(url, pool_pre_ping=True)


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": table_name},
            ).scalar_one()
        )


def verify_database(engine: Engine, skip_table: bool) -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1")).scalar_one()

    if not table_exists(engine, SOURCE_TABLE):
        raise RuntimeError(f"Required source table {SOURCE_TABLE} does not exist.")
    if skip_table and not table_exists(engine, SEGMENT_TABLE):
        raise RuntimeError(f"--skip-table was supplied, but {SEGMENT_TABLE} does not exist.")


def load_rules(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Permit segmentation rules file not found: {path}")
    with path.open("r", encoding="utf-8") as file:
        rules = yaml.safe_load(file)
    if not isinstance(rules, dict):
        raise ValueError("Permit segmentation rules must load as a mapping.")
    for required_key in [
        "allowed_values",
        "value_thresholds",
        "status_mappings",
        "classification_priority",
        "keyword_groups",
        "segment_rules",
        "scoring",
    ]:
        if required_key not in rules:
            raise ValueError(f"Permit segmentation rules missing required key: {required_key}")
    return rules


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return TEXT_SPLIT_RE.sub(" ", str(value).lower()).strip()


def normalize_token(value: Any) -> str:
    return "_".join(normalize_text(value).split())


def decimal_or_none(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def expand_keywords(value: Any, rules: dict[str, Any]) -> list[str]:
    groups = rules.get("keyword_groups", {})
    if value is None:
        return []
    if isinstance(value, str):
        return [normalize_text(item) for item in groups.get(value, [value]) if normalize_text(item)]
    expanded: list[str] = []
    if isinstance(value, list):
        for item in value:
            expanded.extend(expand_keywords(item, rules))
    return expanded


def text_contains_any(haystack: str, keywords: list[str]) -> bool:
    return any(keyword and keyword in haystack for keyword in keywords)


def permit_value_class(amount: Decimal | None, rules: dict[str, Any]) -> str:
    if amount is None:
        return "unknown_value"
    thresholds = rules["value_thresholds"]
    if amount < Decimal(str(thresholds["low_value"]["max_exclusive"])):
        return "low_value"
    if Decimal(str(thresholds["medium_value"]["min_inclusive"])) <= amount <= Decimal(
        str(thresholds["medium_value"]["max_inclusive"])
    ):
        return "medium_value"
    if Decimal(str(thresholds["high_value"]["min_inclusive"])) <= amount <= Decimal(
        str(thresholds["high_value"]["max_inclusive"])
    ):
        return "high_value"
    if amount >= Decimal(str(thresholds["major_value"]["min_inclusive"])):
        return "major_value"
    return "unknown_value"


def permit_status_stage(status: Any, rules: dict[str, Any]) -> str:
    status_token = normalize_token(status)
    if not status_token:
        return "unknown"
    for stage, values in rules["status_mappings"].items():
        normalized_values = {normalize_token(value) for value in values}
        if status_token in normalized_values:
            return stage
    return "unknown"


def source_text(row: dict[str, Any]) -> dict[str, str]:
    permit_type = normalize_text(row.get("permit_type_normalized") or row.get("permit_type_raw"))
    work_type = normalize_text(row.get("work_type_normalized") or row.get("work_type_raw"))
    permit_code = normalize_text(row.get("permit_code_normalized") or row.get("permit_code"))
    notes = normalize_text(row.get("permit_notes"))
    combined = " ".join(part for part in [permit_type, work_type, permit_code, notes] if part)
    return {
        "permit_type": permit_type,
        "work_type": work_type,
        "permit_code": permit_code,
        "notes": notes,
        "combined": combined,
    }


def segment_matches(segment_name: str, row_text: dict[str, str], rules: dict[str, Any]) -> bool:
    segment_rule = rules["segment_rules"].get(segment_name, {})
    matched = False

    keyword_spec = segment_rule.get("keywords", {}).get("any")
    keywords = expand_keywords(keyword_spec, rules)
    if keywords:
        matched = matched or text_contains_any(row_text["combined"], keywords)

    permit_type_keywords = [normalize_text(value) for value in segment_rule.get("permit_type_keywords", [])]
    if permit_type_keywords:
        matched = matched or text_contains_any(row_text["permit_type"], permit_type_keywords)

    work_type_keywords = [normalize_text(value) for value in segment_rule.get("work_type_keywords", [])]
    if work_type_keywords:
        matched = matched or text_contains_any(row_text["work_type"], work_type_keywords)

    permit_code_keywords = [normalize_text(value) for value in segment_rule.get("permit_code_keywords", [])]
    if permit_code_keywords:
        matched = matched or text_contains_any(row_text["permit_code"], permit_code_keywords)

    notes_keywords = expand_keywords(segment_rule.get("notes_keywords"), rules)
    if notes_keywords:
        matched = matched or text_contains_any(row_text["notes"], notes_keywords)

    return matched


def has_new_growth_signal(row_text: dict[str, str], rules: dict[str, Any]) -> bool:
    return text_contains_any(row_text["combined"], expand_keywords("new_growth", rules))


def has_redevelopment_signal(row_text: dict[str, str], rules: dict[str, Any]) -> bool:
    return text_contains_any(row_text["combined"], expand_keywords("redevelopment", rules))


def classify_segment(
    row_text: dict[str, str],
    value_class: str,
    rules: dict[str, Any],
) -> tuple[str, str]:
    priority = rules["classification_priority"]
    growth_segments = [
        "residential_growth",
        "commercial_activity",
        "industrial_activity",
        "institutional_activity",
    ]

    for priority_item in priority:
        if priority_item == "major_new_growth":
            if value_class in {"high_value", "major_value"} or has_new_growth_signal(row_text, rules):
                for segment in growth_segments:
                    if segment_matches(segment, row_text, rules):
                        return segment, "major_new_growth"
            continue
        if priority_item in growth_segments:
            if segment_matches(priority_item, row_text, rules):
                return priority_item, priority_item
            continue
        if priority_item == "administrative_or_unknown":
            continue
        if segment_matches(priority_item, row_text, rules):
            return priority_item, priority_item

    if segment_matches("accessory_or_misc", row_text, rules):
        return "accessory_or_misc", "accessory_or_misc"
    return "administrative_or_unknown", "default_unknown"


def growth_signal(
    segment: str,
    value_class: str,
    row_text: dict[str, str],
    rules: dict[str, Any],
) -> str:
    if segment in {"demolition", "redevelopment_signal"}:
        return "redevelopment_signal"
    if segment in {
        "residential_growth",
        "commercial_activity",
        "industrial_activity",
        "institutional_activity",
    }:
        if value_class in {"high_value", "major_value"} or has_new_growth_signal(row_text, rules):
            return "major_growth"
        return "moderate_activity"
    if segment in {"minor_maintenance", "accessory_or_misc"}:
        return "minor_activity"
    return "unknown"


def calculate_score(
    segment: str,
    value_class: str,
    status_stage: str,
    row_text: dict[str, str],
    rules: dict[str, Any],
) -> float:
    scoring = rules["scoring"]
    score = Decimal(str(scoring["base_by_segment"].get(segment, 0)))
    score += Decimal(str(scoring["value_bonus"].get(value_class, 0)))
    score += Decimal(str(scoring["status_bonus"].get(status_stage, 0)))
    if has_new_growth_signal(row_text, rules):
        score += Decimal(str(scoring["keyword_bonus"].get("new_growth", 0)))
    if has_redevelopment_signal(row_text, rules):
        score += Decimal(str(scoring["keyword_bonus"].get("redevelopment", 0)))
    if segment == "demolition":
        score += Decimal(str(scoring["keyword_bonus"].get("demolition", 0)))

    floor = Decimal(str(scoring.get("floor", 0)))
    cap = Decimal(str(scoring.get("cap", 100)))
    return float(max(floor, min(cap, score)))


def classify_row(row: dict[str, Any], rules: dict[str, Any]) -> dict[str, Any]:
    amount = decimal_or_none(row.get("permit_amount"))
    row_text = source_text(row)
    value_class = permit_value_class(amount, rules)
    status_stage = permit_status_stage(row.get("permit_status_normalized"), rules)
    segment, rule_reason = classify_segment(row_text, value_class, rules)
    segment_rule = rules["segment_rules"].get(segment, {})
    domain = segment_rule.get("development_domain", "mixed_or_unknown")
    signal = growth_signal(segment, value_class, row_text, rules)
    score = calculate_score(segment, value_class, status_stage, row_text, rules)

    is_high_value = value_class in {"high_value", "major_value"}
    is_major_value = value_class == "major_value"
    is_map_relevant = (
        segment in set(rules["map_relevance"]["relevant_segments"])
        or value_class in set(rules["map_relevance"]["relevant_value_classes"])
        or score >= float(rules["map_relevance"]["minimum_signal_score"])
    ) and segment != "administrative_or_unknown"
    is_future_prediction_relevant = (
        segment in set(rules["future_prediction_readiness"]["relevant_segments"])
        or signal in set(rules["future_prediction_readiness"]["relevant_growth_signals"])
        or value_class in set(rules["future_prediction_readiness"]["relevant_value_classes"])
    ) and segment not in {"minor_maintenance", "accessory_or_misc", "administrative_or_unknown"}

    return {
        "permit_id": row.get("permit_id"),
        "permit_number": row.get("permit_number"),
        "parcel_number": row.get("parcel_number"),
        "permit_date": row.get("permit_date"),
        "activity_year": row.get("activity_year"),
        "activity_month": row.get("activity_month"),
        "permit_type": row.get("permit_type_normalized") or row.get("permit_type_raw"),
        "work_type": row.get("work_type_normalized") or row.get("work_type_raw"),
        "permit_status": row.get("permit_status_normalized") or row.get("permit_status_raw"),
        "permit_amount": amount,
        "permit_notes": row.get("permit_notes"),
        "co_date": row.get("co_date"),
        "appraiser": row.get("appraiser"),
        "source_transformed_at": row.get("source_transformed_at"),
        "permit_segment": segment,
        "permit_growth_signal": signal,
        "development_domain": domain,
        "permit_value_class": value_class,
        "permit_status_stage": status_stage,
        "is_residential_growth": segment == "residential_growth",
        "is_commercial_activity": segment == "commercial_activity",
        "is_industrial_activity": segment == "industrial_activity",
        "is_institutional_activity": segment == "institutional_activity",
        "is_redevelopment_signal": segment == "redevelopment_signal",
        "is_minor_maintenance": segment == "minor_maintenance",
        "is_demolition": segment == "demolition",
        "is_active_construction": status_stage == "active_construction",
        "is_completed": status_stage == "completed",
        "is_high_value": is_high_value,
        "is_major_value": is_major_value,
        "is_map_relevant": is_map_relevant,
        "is_future_prediction_relevant": is_future_prediction_relevant,
        "permit_signal_score": score,
        "classification_reason": rule_reason,
        "rules_version": rules.get("rules_version"),
    }


def fetch_source_rows(engine: Engine) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                  permit_id,
                  permit_number,
                  parcel_number,
                  permit_date,
                  activity_year,
                  activity_month,
                  permit_code,
                  permit_code_normalized,
                  permit_amount,
                  permit_notes,
                  work_type_raw,
                  work_type_normalized,
                  permit_type_raw,
                  permit_type_normalized,
                  co_date,
                  permit_status_raw,
                  permit_status_normalized,
                  appraiser,
                  transformed_at AS source_transformed_at
                FROM {SOURCE_TABLE}
                ORDER BY permit_id
                """
            )
        ).mappings()
        return [dict(row) for row in rows]


def create_segment_table(engine: Engine) -> None:
    ddl = f"""
    DROP TABLE IF EXISTS {SEGMENT_TABLE};

    CREATE TABLE {SEGMENT_TABLE} (
      permit_id text PRIMARY KEY,
      permit_number text,
      parcel_number text,
      permit_date date,
      activity_year integer,
      activity_month integer,
      permit_type text,
      work_type text,
      permit_status text,
      permit_amount numeric,
      permit_notes text,
      co_date date,
      appraiser text,
      source_transformed_at timestamptz,
      permit_segment text NOT NULL,
      permit_growth_signal text NOT NULL,
      development_domain text NOT NULL,
      permit_value_class text NOT NULL,
      permit_status_stage text NOT NULL,
      is_residential_growth boolean NOT NULL,
      is_commercial_activity boolean NOT NULL,
      is_industrial_activity boolean NOT NULL,
      is_institutional_activity boolean NOT NULL,
      is_redevelopment_signal boolean NOT NULL,
      is_minor_maintenance boolean NOT NULL,
      is_demolition boolean NOT NULL,
      is_active_construction boolean NOT NULL,
      is_completed boolean NOT NULL,
      is_high_value boolean NOT NULL,
      is_major_value boolean NOT NULL,
      is_map_relevant boolean NOT NULL,
      is_future_prediction_relevant boolean NOT NULL,
      permit_signal_score numeric(5,2) NOT NULL,
      classification_reason text,
      rules_version text,
      transformed_at timestamptz NOT NULL DEFAULT now()
    );

    COMMENT ON TABLE {SEGMENT_TABLE} IS
      'CFS descriptive permit intelligence segmentation. Scores are operational signals, not prediction probabilities.';

    CREATE INDEX permit_intelligence_segments_parcel_number_idx
      ON {SEGMENT_TABLE} (parcel_number);
    CREATE INDEX permit_intelligence_segments_segment_idx
      ON {SEGMENT_TABLE} (permit_segment);
    CREATE INDEX permit_intelligence_segments_growth_signal_idx
      ON {SEGMENT_TABLE} (permit_growth_signal);
    CREATE INDEX permit_intelligence_segments_domain_idx
      ON {SEGMENT_TABLE} (development_domain);
    CREATE INDEX permit_intelligence_segments_value_class_idx
      ON {SEGMENT_TABLE} (permit_value_class);
    CREATE INDEX permit_intelligence_segments_status_stage_idx
      ON {SEGMENT_TABLE} (permit_status_stage);
    CREATE INDEX permit_intelligence_segments_activity_year_idx
      ON {SEGMENT_TABLE} (activity_year);
    CREATE INDEX permit_intelligence_segments_score_idx
      ON {SEGMENT_TABLE} (permit_signal_score);
    """
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(ddl)
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def insert_segments(engine: Engine, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    insert_sql = text(
        f"""
        INSERT INTO {SEGMENT_TABLE} (
          permit_id,
          permit_number,
          parcel_number,
          permit_date,
          activity_year,
          activity_month,
          permit_type,
          work_type,
          permit_status,
          permit_amount,
          permit_notes,
          co_date,
          appraiser,
          source_transformed_at,
          permit_segment,
          permit_growth_signal,
          development_domain,
          permit_value_class,
          permit_status_stage,
          is_residential_growth,
          is_commercial_activity,
          is_industrial_activity,
          is_institutional_activity,
          is_redevelopment_signal,
          is_minor_maintenance,
          is_demolition,
          is_active_construction,
          is_completed,
          is_high_value,
          is_major_value,
          is_map_relevant,
          is_future_prediction_relevant,
          permit_signal_score,
          classification_reason,
          rules_version
        )
        VALUES (
          :permit_id,
          :permit_number,
          :parcel_number,
          :permit_date,
          :activity_year,
          :activity_month,
          :permit_type,
          :work_type,
          :permit_status,
          :permit_amount,
          :permit_notes,
          :co_date,
          :appraiser,
          :source_transformed_at,
          :permit_segment,
          :permit_growth_signal,
          :development_domain,
          :permit_value_class,
          :permit_status_stage,
          :is_residential_growth,
          :is_commercial_activity,
          :is_industrial_activity,
          :is_institutional_activity,
          :is_redevelopment_signal,
          :is_minor_maintenance,
          :is_demolition,
          :is_active_construction,
          :is_completed,
          :is_high_value,
          :is_major_value,
          :is_map_relevant,
          :is_future_prediction_relevant,
          :permit_signal_score,
          :classification_reason,
          :rules_version
        )
        """
    )

    with engine.begin() as connection:
        for start in range(0, len(rows), 1000):
            connection.execute(insert_sql, rows[start : start + 1000])
        connection.execute(text(f"ANALYZE {SEGMENT_TABLE}"))


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    return value


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(normalize_json_value(row))


def distribution_sql(column_name: str, label_name: str) -> str:
    return f"""
    SELECT
      {column_name} AS {label_name},
      COUNT(*) AS permit_count,
      ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {SEGMENT_TABLE}), 0), 4)
        AS permit_percentage,
      ROUND(AVG(permit_signal_score)::numeric, 2) AS avg_permit_signal_score,
      MAX(permit_signal_score) AS max_permit_signal_score,
      COUNT(*) FILTER (WHERE is_map_relevant) AS map_relevant_count,
      COUNT(*) FILTER (WHERE is_future_prediction_relevant) AS future_prediction_relevant_count
    FROM {SEGMENT_TABLE}
    GROUP BY {column_name}
    ORDER BY permit_count DESC, {column_name}
    """


def validate_allowed_values(engine: Engine, rules: dict[str, Any]) -> dict[str, Any]:
    checks = {
        "permit_segment": "permit_segment",
        "permit_growth_signal": "permit_growth_signal",
        "development_domain": "development_domain",
        "permit_value_class": "permit_value_class",
        "permit_status_stage": "permit_status_stage",
    }
    results: dict[str, Any] = {}
    for rules_key, column_name in checks.items():
        allowed = set(rules["allowed_values"][rules_key])
        observed = {
            row[column_name]
            for row in fetch_rows(engine, f"SELECT DISTINCT {column_name} FROM {SEGMENT_TABLE}")
        }
        results[rules_key] = {
            "allowed_count": len(allowed),
            "observed_count": len(observed),
            "unexpected_values": sorted(observed - allowed),
            "missing_allowed_values": sorted(allowed - observed),
        }
    return results


def export_summaries(engine: Engine) -> dict[str, Any]:
    segment_summary = fetch_rows(engine, distribution_sql("permit_segment", "permit_segment"))
    growth_signal_summary = fetch_rows(
        engine,
        distribution_sql("permit_growth_signal", "permit_growth_signal"),
    )
    status_stage_summary = fetch_rows(engine, distribution_sql("permit_status_stage", "permit_status_stage"))
    value_class_summary = fetch_rows(engine, distribution_sql("permit_value_class", "permit_value_class"))
    segment_by_year = fetch_rows(
        engine,
        f"""
        SELECT
          activity_year,
          permit_segment,
          permit_growth_signal,
          COUNT(*) AS permit_count,
          COUNT(*) FILTER (WHERE is_map_relevant) AS map_relevant_count,
          COUNT(*) FILTER (WHERE is_future_prediction_relevant) AS future_prediction_relevant_count,
          SUM(permit_amount) AS total_permit_amount,
          ROUND(AVG(permit_signal_score)::numeric, 2) AS avg_permit_signal_score
        FROM {SEGMENT_TABLE}
        GROUP BY activity_year, permit_segment, permit_growth_signal
        ORDER BY activity_year, permit_segment, permit_growth_signal
        """,
    )
    examples = fetch_rows(
        engine,
        f"""
        SELECT
          permit_id,
          permit_number,
          parcel_number,
          permit_date,
          activity_year,
          permit_type,
          work_type,
          permit_status,
          permit_amount,
          permit_segment,
          permit_growth_signal,
          development_domain,
          permit_value_class,
          permit_status_stage,
          permit_signal_score,
          is_map_relevant,
          is_future_prediction_relevant,
          classification_reason
        FROM {SEGMENT_TABLE}
        ORDER BY permit_signal_score DESC, permit_date DESC NULLS LAST, permit_id
        LIMIT 500
        """,
    )

    write_csv(SEGMENT_SUMMARY_OUTPUT, segment_summary)
    write_csv(GROWTH_SIGNAL_SUMMARY_OUTPUT, growth_signal_summary)
    write_csv(STATUS_STAGE_SUMMARY_OUTPUT, status_stage_summary)
    write_csv(VALUE_CLASS_SUMMARY_OUTPUT, value_class_summary)
    write_csv(SEGMENT_BY_YEAR_OUTPUT, segment_by_year)
    write_csv(SEGMENT_EXAMPLES_OUTPUT, examples)

    return {
        "segment_summary": segment_summary,
        "growth_signal_summary": growth_signal_summary,
        "status_stage_summary": status_stage_summary,
        "value_class_summary": value_class_summary,
        "segment_by_year_rows": len(segment_by_year),
        "example_rows": examples[:25],
    }


def validate_segments(
    engine: Engine,
    rules: dict[str, Any],
    started_at: float,
    log_path: Path,
) -> dict[str, Any]:
    source_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {SOURCE_TABLE}"))
    segment_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {SEGMENT_TABLE}"))
    source_unique_permit_ids = int(
        fetch_scalar(engine, f"SELECT COUNT(DISTINCT permit_id) FROM {SOURCE_TABLE}")
    )
    segment_unique_permit_ids = int(
        fetch_scalar(engine, f"SELECT COUNT(DISTINCT permit_id) FROM {SEGMENT_TABLE}")
    )
    summaries = export_summaries(engine)
    validation = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rules_version": rules.get("rules_version"),
        "database": {
            "host": os.getenv("POSTGRES_HOST", DEFAULT_DB_HOST),
            "port": int(os.getenv("POSTGRES_PORT", str(DEFAULT_DB_PORT))),
            "database": os.getenv("POSTGRES_DB", DEFAULT_DB_NAME),
            "source_table": SOURCE_TABLE,
            "segment_table": SEGMENT_TABLE,
        },
        "row_count_validation": {
            "source_row_count": source_count,
            "segment_row_count": segment_count,
            "source_unique_permit_ids": source_unique_permit_ids,
            "segment_unique_permit_ids": segment_unique_permit_ids,
            "row_counts_match": source_count == segment_count,
            "unique_permit_ids_match": source_unique_permit_ids == segment_unique_permit_ids,
        },
        "score_validation": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(permit_signal_score) AS min_score,
              MAX(permit_signal_score) AS max_score,
              ROUND(AVG(permit_signal_score)::numeric, 2) AS avg_score,
              COUNT(*) FILTER (WHERE permit_signal_score < 0 OR permit_signal_score > 100) AS out_of_range_count
            FROM {SEGMENT_TABLE}
            """,
        )[0],
        "map_and_prediction_readiness_flags": fetch_rows(
            engine,
            f"""
            SELECT
              COUNT(*) FILTER (WHERE is_map_relevant) AS map_relevant_permit_count,
              COUNT(*) FILTER (WHERE is_future_prediction_relevant) AS future_prediction_relevant_permit_count,
              COUNT(*) FILTER (WHERE is_high_value) AS high_value_permit_count,
              COUNT(*) FILTER (WHERE is_major_value) AS major_value_permit_count,
              COUNT(*) FILTER (WHERE is_active_construction) AS active_construction_permit_count,
              COUNT(*) FILTER (WHERE is_completed) AS completed_permit_count
            FROM {SEGMENT_TABLE}
            """,
        )[0],
        "allowed_value_validation": validate_allowed_values(engine, rules),
        "permit_segment_summary": summaries["segment_summary"],
        "permit_growth_signal_summary": summaries["growth_signal_summary"],
        "permit_status_stage_summary": summaries["status_stage_summary"],
        "permit_value_class_summary": summaries["value_class_summary"],
        "sample_top_signal_permits": summaries["example_rows"],
        "prediction_boundary": {
            "prediction_model_created": False,
            "prediction_probabilities_created": False,
            "random_train_test_split_used": False,
            "frontend_prediction_exposed": False,
            "notes": "This layer is descriptive segmentation and modeling readiness only.",
        },
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "segment_summary_csv": str(SEGMENT_SUMMARY_OUTPUT),
            "growth_signal_summary_csv": str(GROWTH_SIGNAL_SUMMARY_OUTPUT),
            "status_stage_summary_csv": str(STATUS_STAGE_SUMMARY_OUTPUT),
            "value_class_summary_csv": str(VALUE_CLASS_SUMMARY_OUTPUT),
            "segment_by_year_summary_csv": str(SEGMENT_BY_YEAR_OUTPUT),
            "segment_examples_csv": str(SEGMENT_EXAMPLES_OUTPUT),
        },
        "duration_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }
    return validation


def write_json(path: Path, payload: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(normalize_json_value(payload), indent=2), encoding="utf-8")


def run_classification(engine: Engine, rules: dict[str, Any]) -> int:
    source_rows = fetch_source_rows(engine)
    logging.info("Fetched %s source permit rows.", len(source_rows))
    segment_rows = [classify_row(row, rules) for row in source_rows]
    create_segment_table(engine)
    insert_segments(engine, segment_rows)
    return len(segment_rows)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS permit intelligence segmentation.")

    try:
        rules = load_rules(args.rules)
        engine = create_engine_from_env()
        verify_database(engine, args.skip_table)

        if args.skip_table:
            logging.warning("Skipping segment table creation because --skip-table was supplied.")
        else:
            inserted = run_classification(engine, rules)
            logging.info("Materialized %s permit segment rows.", inserted)

        validation = validate_segments(engine, rules, started_at, log_path)
        write_json(VALIDATION_OUTPUT, validation)
        summary = {
            "generated_at": validation["generated_at"],
            "rules_version": validation["rules_version"],
            "permit_level_status": "complete",
            "source_table": SOURCE_TABLE,
            "segment_table": SEGMENT_TABLE,
            "row_count_validation": validation["row_count_validation"],
            "permit_segment_summary": validation["permit_segment_summary"],
            "permit_growth_signal_summary": validation["permit_growth_signal_summary"],
            "prediction_boundary": validation["prediction_boundary"],
            "outputs": validation["outputs"],
        }
        existing_summary: dict[str, Any] = {}
        if FINAL_SUMMARY_OUTPUT.exists():
            try:
                existing_summary = json.loads(FINAL_SUMMARY_OUTPUT.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing_summary = {}
        existing_summary.update(summary)
        write_json(FINAL_SUMMARY_OUTPUT, existing_summary)
        engine.dispose()

        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        logging.info("Wrote final summary output: %s", FINAL_SUMMARY_OUTPUT)
        return 0
    except Exception:
        logging.exception("Permit intelligence segmentation failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
