"""Create parcel-level permit intelligence segment summaries."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

SEGMENT_TABLE = "public.permit_intelligence_segments"
RELATIONSHIP_TABLE = "public.real_property_permit_parcel_relationship"
PARCEL_SUMMARY_TABLE = "public.parcel_permit_segment_summary"

MODEL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODEL_DIR.parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs"
LOG_DIR = MODEL_DIR / "logs"

VALIDATION_OUTPUT = OUTPUT_DIR / "parcel_permit_segment_summary_validation.json"
TOP_RESIDENTIAL_OUTPUT = OUTPUT_DIR / "parcel_permit_segment_top_residential_growth.csv"
TOP_COMMERCIAL_OUTPUT = OUTPUT_DIR / "parcel_permit_segment_top_commercial_activity.csv"
TOP_REDEVELOPMENT_OUTPUT = OUTPUT_DIR / "parcel_permit_segment_top_redevelopment_signal.csv"
TOP_MAJOR_VALUE_OUTPUT = OUTPUT_DIR / "parcel_permit_segment_top_major_value.csv"
FINAL_SUMMARY_OUTPUT = OUTPUT_DIR / "permit_intelligence_segmentation_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create parcel permit intelligence summary from segmented permits.",
    )
    parser.add_argument(
        "--skip-table",
        action="store_true",
        help="Only validate and export summaries from the existing parcel segment summary table.",
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
    log_path = LOG_DIR / f"create_parcel_permit_segment_summary_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is not set. Export it before creating parcel permit summaries."
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
    for required_table in [SEGMENT_TABLE, RELATIONSHIP_TABLE]:
        if not table_exists(engine, required_table):
            raise RuntimeError(f"Required source table {required_table} does not exist.")
    if skip_table and not table_exists(engine, PARCEL_SUMMARY_TABLE):
        raise RuntimeError(
            f"--skip-table was supplied, but {PARCEL_SUMMARY_TABLE} does not exist."
        )


def create_summary_table(engine: Engine) -> None:
    sql = f"""
    DROP TABLE IF EXISTS {PARCEL_SUMMARY_TABLE};

    CREATE TABLE {PARCEL_SUMMARY_TABLE} AS
    WITH activity_anchor AS (
      SELECT MAX(permit_date) AS anchor_date
      FROM {SEGMENT_TABLE}
      WHERE permit_date IS NOT NULL
    ),
    matched AS (
      SELECT
        relationship.official_parcel_id,
        relationship.pin14,
        relationship.relationship_confidence,
        relationship.has_multiple_parcel_matches,
        segment.permit_id,
        segment.permit_number,
        segment.parcel_number,
        segment.permit_date,
        segment.activity_year,
        segment.activity_month,
        segment.permit_type,
        segment.work_type,
        segment.permit_status,
        segment.permit_amount,
        segment.permit_segment,
        segment.permit_growth_signal,
        segment.development_domain,
        segment.permit_value_class,
        segment.permit_status_stage,
        segment.is_residential_growth,
        segment.is_commercial_activity,
        segment.is_industrial_activity,
        segment.is_institutional_activity,
        segment.is_redevelopment_signal,
        segment.is_minor_maintenance,
        segment.is_demolition,
        segment.is_active_construction,
        segment.is_completed,
        segment.is_high_value,
        segment.is_major_value,
        segment.is_map_relevant,
        segment.is_future_prediction_relevant,
        segment.permit_signal_score
      FROM {RELATIONSHIP_TABLE} AS relationship
      INNER JOIN {SEGMENT_TABLE} AS segment
        ON segment.permit_id = relationship.permit_id
      WHERE relationship.has_parcel_match
        AND relationship.official_parcel_id IS NOT NULL
    ),
    rollup AS (
      SELECT
        official_parcel_id,
        MAX(pin14) AS pin14,
        COUNT(DISTINCT permit_id)::integer AS total_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_residential_growth)::integer
          AS residential_growth_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_commercial_activity)::integer
          AS commercial_activity_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_industrial_activity)::integer
          AS industrial_activity_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_institutional_activity)::integer
          AS institutional_activity_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_redevelopment_signal)::integer
          AS redevelopment_signal_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_minor_maintenance)::integer
          AS minor_maintenance_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_demolition)::integer
          AS demolition_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE permit_status_stage = 'active_construction')::integer
          AS active_construction_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE permit_status_stage = 'issued_or_starting')::integer
          AS issued_or_starting_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_completed)::integer
          AS completed_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_high_value)::integer
          AS high_value_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_major_value)::integer
          AS major_value_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_map_relevant)::integer
          AS map_relevant_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE is_future_prediction_relevant)::integer
          AS future_prediction_relevant_permits,
        COUNT(DISTINCT permit_id) FILTER (WHERE has_multiple_parcel_matches)::integer
          AS ambiguous_relationship_permits,
        SUM(permit_amount) AS total_permit_amount,
        MIN(permit_date) AS first_permit_date,
        MAX(permit_date) AS latest_permit_date,
        COUNT(DISTINCT activity_year) FILTER (WHERE activity_year IS NOT NULL)::integer
          AS active_year_count,
        MAX(permit_signal_score) AS permit_signal_score_max,
        ROUND(AVG(permit_signal_score)::numeric, 2) AS permit_signal_score_avg
      FROM matched
      GROUP BY official_parcel_id
    ),
    segment_rank AS (
      SELECT
        official_parcel_id,
        permit_segment,
        ROW_NUMBER() OVER (
          PARTITION BY official_parcel_id
          ORDER BY
            COUNT(DISTINCT permit_id) DESC,
            MAX(permit_signal_score) DESC,
            MAX(permit_date) DESC NULLS LAST,
            permit_segment
        ) AS segment_rank
      FROM matched
      GROUP BY official_parcel_id, permit_segment
    ),
    signal_rank AS (
      SELECT
        official_parcel_id,
        permit_growth_signal,
        ROW_NUMBER() OVER (
          PARTITION BY official_parcel_id
          ORDER BY
            COUNT(DISTINCT permit_id) DESC,
            MAX(permit_signal_score) DESC,
            MAX(permit_date) DESC NULLS LAST,
            permit_growth_signal
        ) AS signal_rank
      FROM matched
      GROUP BY official_parcel_id, permit_growth_signal
    )
    SELECT
      rollup.official_parcel_id,
      rollup.pin14,
      rollup.total_permits,
      rollup.residential_growth_permits,
      rollup.commercial_activity_permits,
      rollup.industrial_activity_permits,
      rollup.institutional_activity_permits,
      rollup.redevelopment_signal_permits,
      rollup.minor_maintenance_permits,
      rollup.demolition_permits,
      rollup.active_construction_permits,
      rollup.completed_permits,
      rollup.high_value_permits,
      rollup.major_value_permits,
      rollup.total_permit_amount,
      rollup.latest_permit_date,
      rollup.first_permit_date,
      rollup.active_year_count,
      segment_rank.permit_segment AS dominant_permit_segment,
      signal_rank.permit_growth_signal AS dominant_growth_signal,
      rollup.permit_signal_score_max,
      rollup.permit_signal_score_avg,
      CASE
        WHEN rollup.active_construction_permits > 0 THEN 'active_construction'
        WHEN rollup.issued_or_starting_permits > 0
          AND rollup.latest_permit_date >= (SELECT anchor_date FROM activity_anchor) - INTERVAL '3 years'
          THEN 'recently_issued'
        WHEN rollup.latest_permit_date < (SELECT anchor_date FROM activity_anchor) - INTERVAL '3 years'
          THEN 'no_recent_activity'
        WHEN rollup.completed_permits > 0 THEN 'completed_historical'
        ELSE 'unknown'
      END AS current_activity_status,
      rollup.issued_or_starting_permits,
      rollup.map_relevant_permits,
      rollup.future_prediction_relevant_permits,
      rollup.ambiguous_relationship_permits,
      (SELECT anchor_date FROM activity_anchor) AS activity_anchor_date,
      now()::timestamptz AS summarized_at
    FROM rollup
    LEFT JOIN segment_rank
      ON segment_rank.official_parcel_id = rollup.official_parcel_id
     AND segment_rank.segment_rank = 1
    LEFT JOIN signal_rank
      ON signal_rank.official_parcel_id = rollup.official_parcel_id
     AND signal_rank.signal_rank = 1;

    COMMENT ON TABLE {PARCEL_SUMMARY_TABLE} IS
      'CFS parcel-level permit intelligence summary derived from segmented Real Property Permit records.';
    COMMENT ON COLUMN {PARCEL_SUMMARY_TABLE}.permit_signal_score_max IS
      'Maximum descriptive permit signal score for permits attached to the parcel. Not a prediction probability.';
    COMMENT ON COLUMN {PARCEL_SUMMARY_TABLE}.current_activity_status IS
      'Interpretable current permit activity status from segmented permits and status stages.';

    ALTER TABLE {PARCEL_SUMMARY_TABLE}
      ADD CONSTRAINT parcel_permit_segment_summary_pkey PRIMARY KEY (official_parcel_id);

    CREATE INDEX parcel_permit_segment_summary_pin14_idx
      ON {PARCEL_SUMMARY_TABLE} (pin14);
    CREATE INDEX parcel_permit_segment_summary_dominant_segment_idx
      ON {PARCEL_SUMMARY_TABLE} (dominant_permit_segment);
    CREATE INDEX parcel_permit_segment_summary_growth_signal_idx
      ON {PARCEL_SUMMARY_TABLE} (dominant_growth_signal);
    CREATE INDEX parcel_permit_segment_summary_status_idx
      ON {PARCEL_SUMMARY_TABLE} (current_activity_status);
    CREATE INDEX parcel_permit_segment_summary_latest_date_idx
      ON {PARCEL_SUMMARY_TABLE} (latest_permit_date);
    CREATE INDEX parcel_permit_segment_summary_score_idx
      ON {PARCEL_SUMMARY_TABLE} (permit_signal_score_max);

    ANALYZE {PARCEL_SUMMARY_TABLE};
    """
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(sql)
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


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


def top_parcels_sql(where_clause: str) -> str:
    return f"""
    SELECT
      official_parcel_id,
      pin14,
      total_permits,
      residential_growth_permits,
      commercial_activity_permits,
      redevelopment_signal_permits,
      demolition_permits,
      high_value_permits,
      major_value_permits,
      total_permit_amount,
      first_permit_date,
      latest_permit_date,
      active_year_count,
      dominant_permit_segment,
      dominant_growth_signal,
      permit_signal_score_max,
      permit_signal_score_avg,
      current_activity_status
    FROM {PARCEL_SUMMARY_TABLE}
    WHERE {where_clause}
    ORDER BY
      permit_signal_score_max DESC,
      total_permits DESC,
      total_permit_amount DESC NULLS LAST,
      latest_permit_date DESC NULLS LAST,
      official_parcel_id
    LIMIT 500
    """


def export_top_parcel_outputs(engine: Engine) -> dict[str, list[dict[str, Any]]]:
    outputs = {
        "top_residential_growth": fetch_rows(
            engine,
            top_parcels_sql("residential_growth_permits > 0"),
        ),
        "top_commercial_activity": fetch_rows(
            engine,
            top_parcels_sql("commercial_activity_permits > 0"),
        ),
        "top_redevelopment_signal": fetch_rows(
            engine,
            top_parcels_sql("redevelopment_signal_permits > 0 OR demolition_permits > 0"),
        ),
        "top_major_value": fetch_rows(
            engine,
            top_parcels_sql("major_value_permits > 0"),
        ),
    }
    write_csv(TOP_RESIDENTIAL_OUTPUT, outputs["top_residential_growth"])
    write_csv(TOP_COMMERCIAL_OUTPUT, outputs["top_commercial_activity"])
    write_csv(TOP_REDEVELOPMENT_OUTPUT, outputs["top_redevelopment_signal"])
    write_csv(TOP_MAJOR_VALUE_OUTPUT, outputs["top_major_value"])
    return outputs


def distribution(engine: Engine, column_name: str, label_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS {label_name},
          COUNT(*) AS parcel_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}), 0), 4)
            AS parcel_percentage,
          SUM(total_permits) AS permit_count,
          ROUND(AVG(permit_signal_score_avg)::numeric, 2) AS avg_parcel_permit_signal_score
        FROM {PARCEL_SUMMARY_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, {column_name}
        """,
    )


def validate_summary(engine: Engine, started_at: float, log_path: Path) -> dict[str, Any]:
    top_outputs = export_top_parcel_outputs(engine)
    matched_parcels = int(
        fetch_scalar(
            engine,
            f"""
            SELECT COUNT(DISTINCT official_parcel_id)
            FROM {RELATIONSHIP_TABLE}
            WHERE has_parcel_match
              AND official_parcel_id IS NOT NULL
            """,
        )
    )
    validation = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "database": {
            "segment_table": SEGMENT_TABLE,
            "relationship_table": RELATIONSHIP_TABLE,
            "parcel_summary_table": PARCEL_SUMMARY_TABLE,
        },
        "row_count_validation": {
            "matched_parcels_with_permit_activity": matched_parcels,
            "parcel_summary_rows": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}")),
            "row_count_matches_matched_parcels": matched_parcels
            == int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE}")),
            "null_official_parcel_id_count": int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(*) FROM {PARCEL_SUMMARY_TABLE} WHERE official_parcel_id IS NULL",
                )
            ),
        },
        "permit_rollup_validation": fetch_rows(
            engine,
            f"""
            SELECT
              SUM(total_permits) AS parcel_distinct_permit_total,
              SUM(residential_growth_permits) AS residential_growth_permits,
              SUM(commercial_activity_permits) AS commercial_activity_permits,
              SUM(industrial_activity_permits) AS industrial_activity_permits,
              SUM(institutional_activity_permits) AS institutional_activity_permits,
              SUM(redevelopment_signal_permits) AS redevelopment_signal_permits,
              SUM(minor_maintenance_permits) AS minor_maintenance_permits,
              SUM(demolition_permits) AS demolition_permits,
              SUM(active_construction_permits) AS active_construction_permits,
              SUM(completed_permits) AS completed_permits,
              SUM(high_value_permits) AS high_value_permits,
              SUM(major_value_permits) AS major_value_permits,
              SUM(total_permit_amount) AS total_permit_amount
            FROM {PARCEL_SUMMARY_TABLE}
            """,
        )[0],
        "date_range": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(first_permit_date) AS first_permit_date,
              MAX(latest_permit_date) AS latest_permit_date,
              MAX(activity_anchor_date) AS activity_anchor_date
            FROM {PARCEL_SUMMARY_TABLE}
            """,
        )[0],
        "dominant_permit_segment_distribution": distribution(
            engine,
            "dominant_permit_segment",
            "dominant_permit_segment",
        ),
        "dominant_growth_signal_distribution": distribution(
            engine,
            "dominant_growth_signal",
            "dominant_growth_signal",
        ),
        "current_activity_status_distribution": distribution(
            engine,
            "current_activity_status",
            "current_activity_status",
        ),
        "score_validation": fetch_rows(
            engine,
            f"""
            SELECT
              MIN(permit_signal_score_avg) AS min_avg_score,
              MAX(permit_signal_score_max) AS max_score,
              ROUND(AVG(permit_signal_score_avg)::numeric, 2) AS avg_score
            FROM {PARCEL_SUMMARY_TABLE}
            """,
        )[0],
        "top_parcels": {
            "residential_growth": top_outputs["top_residential_growth"][:25],
            "commercial_activity": top_outputs["top_commercial_activity"][:25],
            "redevelopment_signal": top_outputs["top_redevelopment_signal"][:25],
            "major_value": top_outputs["top_major_value"][:25],
        },
        "prediction_boundary": {
            "prediction_model_created": False,
            "prediction_probabilities_created": False,
            "frontend_prediction_exposed": False,
            "notes": "Parcel segment summary is descriptive permit intelligence and modeling readiness only.",
        },
        "outputs": {
            "validation_json": str(VALIDATION_OUTPUT),
            "top_residential_growth_csv": str(TOP_RESIDENTIAL_OUTPUT),
            "top_commercial_activity_csv": str(TOP_COMMERCIAL_OUTPUT),
            "top_redevelopment_signal_csv": str(TOP_REDEVELOPMENT_OUTPUT),
            "top_major_value_csv": str(TOP_MAJOR_VALUE_OUTPUT),
        },
        "duration_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }
    return validation


def write_json(path: Path, payload: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(normalize_json_value(payload), indent=2), encoding="utf-8")


def update_final_summary(validation: dict[str, Any]) -> None:
    existing_summary: dict[str, Any] = {}
    if FINAL_SUMMARY_OUTPUT.exists():
        try:
            existing_summary = json.loads(FINAL_SUMMARY_OUTPUT.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing_summary = {}

    existing_summary.update(
        {
            "parcel_level_status": "complete",
            "parcel_summary_table": PARCEL_SUMMARY_TABLE,
            "parcel_summary_validation": validation["row_count_validation"],
            "dominant_permit_segment_distribution": validation[
                "dominant_permit_segment_distribution"
            ],
            "dominant_growth_signal_distribution": validation[
                "dominant_growth_signal_distribution"
            ],
            "current_activity_status_distribution": validation[
                "current_activity_status_distribution"
            ],
            "parcel_outputs": validation["outputs"],
            "prediction_boundary": validation["prediction_boundary"],
            "completed_at": validation["generated_at"],
        }
    )
    write_json(FINAL_SUMMARY_OUTPUT, existing_summary)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS parcel permit segment summary build.")

    try:
        engine = create_engine_from_env()
        verify_database(engine, args.skip_table)

        if args.skip_table:
            logging.warning("Skipping parcel summary table creation because --skip-table was supplied.")
        else:
            create_summary_table(engine)
            logging.info("Materialized %s.", PARCEL_SUMMARY_TABLE)

        validation = validate_summary(engine, started_at, log_path)
        write_json(VALIDATION_OUTPUT, validation)
        update_final_summary(validation)
        engine.dispose()

        logging.info("Wrote validation output: %s", VALIDATION_OUTPUT)
        logging.info("Wrote final summary output: %s", FINAL_SUMMARY_OUTPUT)
        return 0
    except Exception:
        logging.exception("Parcel permit segment summary build failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
