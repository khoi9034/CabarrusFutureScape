"""Ingest staff-provided new construction permits and build Phase 10A labels.

This workflow is intentionally separate from the existing real-property permit
intelligence stack. It creates a new construction-specific clean layer,
parcel relationship table, parcel summary, and future target labels for later
modeling. It does not train a model and does not produce prediction scores.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
SOURCE_CONFIDENCE = "staff_provided_extract"
SOURCE_FILE_NAME = "BuildingPermits_NewConstruction.csv"

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = REPO_ROOT / "data" / "development" / "raw" / SOURCE_FILE_NAME
SQL_FILE = PIPELINE_ROOT / "sql" / "create_new_construction_permit_tables.sql"
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = REPO_ROOT / "outputs"

SOURCE_PROFILE_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_source_profile.json"
TYPE_SUMMARY_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_type_summary.csv"
YEAR_SUMMARY_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_year_summary.csv"
MATCH_QA_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_parcel_match_qa.csv"
UNMATCHED_SAMPLES_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_unmatched_samples.csv"
PLACEHOLDER_OUTPUT = ROOT_OUTPUT_DIR / "new_construction_permit_placeholder_parcels.csv"
SUMMARY_VALIDATION_OUTPUT = ROOT_OUTPUT_DIR / "parcel_new_construction_summary_validation.json"
LABEL_VALIDATION_OUTPUT = ROOT_OUTPUT_DIR / "parcel_development_prediction_labels_validation.json"
PHASE_SUMMARY_OUTPUT = ROOT_OUTPUT_DIR / "phase10a_new_construction_permit_intelligence_summary.json"

RAW_TABLE = "new_construction_permits_raw"


@dataclass(frozen=True)
class LabelWindow:
    future_start: date
    next_1yr_end: date
    next_3yr_end: date


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest staff-provided new construction permits into PostGIS.",
    )
    parser.add_argument("--file", default=str(SOURCE_PATH))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--truncate-and-load",
        action="store_true",
        help="Replace Phase 10A raw/derived new construction tables.",
    )
    parser.add_argument(
        "--skip-transform",
        action="store_true",
        help="Load/profile raw data only; do not execute derived table SQL.",
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
    log_path = LOG_DIR / f"ingest_new_construction_permits_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is required for Phase 10A ingestion.",
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


def classify_permit_type(value: str | None) -> str:
    normalized = (value or "").strip()
    if normalized == "Building Residential New":
        return "residential_new_construction"
    if normalized == "Building Commercial New":
        return "commercial_new_construction"
    return "review_required"


def normalize_parcel_number(value: str | None) -> str | None:
    digits = re.sub(r"[^0-9]", "", str(value or ""))
    return digits or None


def is_placeholder_parcel_number(value: str | None) -> bool:
    normalized = normalize_parcel_number(value)
    if not normalized:
        return True
    if len(normalized) != 14:
        return True
    if len(set(normalized)) == 1:
        return True
    return False


def parse_date_value(value: str | None) -> date | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value:
        return None
    parsed = pd.to_datetime(text_value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def parse_co_issued(value: str | None) -> bool | None:
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "true", "t", "yes", "y"}:
        return True
    if normalized in {"0", "false", "f", "no", "n"}:
        return False
    return None


def classify_construction_status(
    co_issued: bool | None,
    co_date: date | None,
    permit_file_date: date | None = None,
) -> str:
    if co_issued is False and co_date is not None:
        return "review_required"
    if (
        co_date is not None
        and permit_file_date is not None
        and co_date < permit_file_date
    ):
        return "review_required"
    if co_issued is True or co_date is not None:
        return "completed"
    if co_issued is False and co_date is None:
        return "permitted_not_completed"
    return "review_required"


def calculate_days_to_co(permit_file_date: date | None, co_date: date | None) -> int | None:
    if permit_file_date is None or co_date is None or co_date < permit_file_date:
        return None
    return (co_date - permit_file_date).days


def label_window_for_snapshot(snapshot_year: int) -> LabelWindow:
    return LabelWindow(
        future_start=date(snapshot_year + 1, 1, 1),
        next_1yr_end=date(snapshot_year + 1, 12, 31),
        next_3yr_end=date(snapshot_year + 3, 12, 31),
    )


def read_source_csv(source_path: Path) -> pd.DataFrame:
    if not source_path.exists():
        raise FileNotFoundError(f"New construction permit source not found: {source_path}")

    dataframe = pd.read_csv(source_path, dtype=str, keep_default_na=False)
    expected_columns = {
        "B1_ALT_ID",
        "B1_APP_TYPE_ALIAS",
        "B1_FILE_DD",
        "address",
        "parcelNum",
        "CO_Issued",
        "CO_Date",
    }
    missing = sorted(expected_columns - set(dataframe.columns))
    if missing:
        raise ValueError(f"Source file missing required columns: {', '.join(missing)}")

    return dataframe


def source_profile(dataframe: pd.DataFrame, source_path: Path) -> dict[str, Any]:
    permit_dates = pd.to_datetime(dataframe["B1_FILE_DD"], errors="coerce")
    co_dates = pd.to_datetime(dataframe["CO_Date"], errors="coerce")
    parcel_numbers = dataframe["parcelNum"].astype("string")
    placeholder_mask = parcel_numbers.map(is_placeholder_parcel_number)

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_file": str(source_path),
        "source_confidence": SOURCE_CONFIDENCE,
        "row_count": int(len(dataframe)),
        "columns": list(dataframe.columns),
        "permit_file_date": {
            "parsed_count": int(permit_dates.notna().sum()),
            "missing_or_invalid_count": int(permit_dates.isna().sum()),
            "min": date_to_iso(permit_dates.min()),
            "max": date_to_iso(permit_dates.max()),
        },
        "co_date": {
            "parsed_count": int(co_dates.notna().sum()),
            "missing_or_invalid_count": int(co_dates.isna().sum()),
            "min": date_to_iso(co_dates.min()),
            "max": date_to_iso(co_dates.max()),
        },
        "permit_type_counts": value_counts(dataframe["B1_APP_TYPE_ALIAS"]),
        "co_issued_counts": value_counts(dataframe["CO_Issued"]),
        "parcel_quality": {
            "null_or_blank_parcel_count": int(
                parcel_numbers.fillna("").str.strip().eq("").sum(),
            ),
            "invalid_or_placeholder_parcel_count": int(placeholder_mask.sum()),
            "normalized_length_counts": value_counts(
                parcel_numbers.fillna("").map(normalize_parcel_number).fillna("").map(len),
            ),
        },
    }


def date_to_iso(value: Any) -> str | None:
    if pd.isna(value):
        return None
    if hasattr(value, "date"):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def value_counts(series: pd.Series) -> dict[str, int]:
    counts = series.fillna("").astype(str).replace({"": "blank"}).value_counts()
    return {str(key): int(value) for key, value in counts.items()}


def prepare_raw_dataframe(dataframe: pd.DataFrame, source_path: Path) -> pd.DataFrame:
    raw = dataframe.copy()
    raw.insert(0, "source_row_number", range(1, len(raw) + 1))
    raw = raw.rename(
        columns={
            "B1_ALT_ID": "b1_alt_id",
            "B1_APP_TYPE_ALIAS": "b1_app_type_alias",
            "B1_FILE_DD": "b1_file_dd",
            "parcelNum": "parcelnum",
            "CO_Issued": "co_issued",
            "CO_Date": "co_date",
        },
    )
    raw["source_file"] = source_path.name
    raw["source_confidence"] = SOURCE_CONFIDENCE
    raw["ingested_at"] = datetime.now()
    return raw[
        [
            "source_row_number",
            "b1_alt_id",
            "b1_app_type_alias",
            "b1_file_dd",
            "address",
            "parcelnum",
            "co_issued",
            "co_date",
            "source_file",
            "source_confidence",
            "ingested_at",
        ]
    ]


def ensure_raw_table(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.new_construction_permits_raw (
                  source_row_number integer PRIMARY KEY,
                  b1_alt_id text,
                  b1_app_type_alias text,
                  b1_file_dd text,
                  address text,
                  parcelnum text,
                  co_issued text,
                  co_date text,
                  source_file text NOT NULL DEFAULT 'BuildingPermits_NewConstruction.csv',
                  source_confidence text NOT NULL DEFAULT 'staff_provided_extract',
                  ingested_at timestamptz NOT NULL DEFAULT now()
                )
                """,
            ),
        )


def load_raw_table(
    engine: Engine,
    raw_dataframe: pd.DataFrame,
    *,
    truncate_and_load: bool,
) -> None:
    ensure_raw_table(engine)
    with engine.begin() as connection:
        if truncate_and_load:
            connection.execute(text("TRUNCATE TABLE public.new_construction_permits_raw"))
    raw_dataframe.to_sql(
        RAW_TABLE,
        engine,
        schema="public",
        if_exists="append",
        index=False,
        method="multi",
        chunksize=2000,
    )


def execute_transform_sql(engine: Engine) -> None:
    sql_text = SQL_FILE.read_text(encoding="utf-8")
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(sql_text)
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def fetch_one(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    rows = fetch_rows(engine, sql, params)
    return rows[0] if rows else {}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=json_default), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def json_default(value: Any) -> str | int | float | bool | None:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def generate_database_outputs(
    engine: Engine,
    profile: dict[str, Any],
    *,
    source_path: Path,
    started_at: float,
    log_path: Path,
) -> dict[str, Any]:
    type_summary = fetch_rows(
        engine,
        """
        SELECT
          permit_type_class,
          permit_type_raw,
          COUNT(*) AS permit_count
        FROM public.new_construction_permits_clean
        GROUP BY permit_type_class, permit_type_raw
        ORDER BY permit_count DESC, permit_type_class
        """,
    )
    year_summary = fetch_rows(
        engine,
        """
        SELECT
          permit_year,
          COUNT(*) AS permit_count,
          COUNT(*) FILTER (WHERE permit_type_class = 'residential_new_construction') AS residential_count,
          COUNT(*) FILTER (WHERE permit_type_class = 'commercial_new_construction') AS commercial_count,
          COUNT(*) FILTER (WHERE construction_status = 'completed') AS completed_count,
          COUNT(*) FILTER (WHERE construction_status = 'permitted_not_completed') AS active_uncompleted_count
        FROM public.new_construction_permits_clean
        GROUP BY permit_year
        ORDER BY permit_year
        """,
    )
    match_qa = fetch_rows(
        engine,
        """
        SELECT
          match_confidence,
          match_method,
          COUNT(*) AS permit_count
        FROM public.new_construction_permit_parcel_relationship
        GROUP BY match_confidence, match_method
        ORDER BY permit_count DESC, match_confidence, match_method
        """,
    )
    unmatched_samples = fetch_rows(
        engine,
        """
        SELECT
          r.source_permit_id,
          c.permit_type_class,
          c.permit_file_date,
          c.address_raw,
          r.parcel_num_raw,
          r.parcel_num_normalized,
          r.match_confidence,
          r.match_warning
        FROM public.new_construction_permit_parcel_relationship r
        JOIN public.new_construction_permits_clean c
          ON c.new_construction_permit_id = r.new_construction_permit_id
        WHERE r.match_confidence IN ('unmatched', 'ambiguous')
        ORDER BY c.permit_file_date DESC NULLS LAST, r.source_permit_id
        LIMIT 100
        """,
    )
    placeholder_rows = fetch_rows(
        engine,
        """
        SELECT
          r.source_permit_id,
          c.permit_file_date,
          c.address_raw,
          r.parcel_num_raw,
          r.parcel_num_normalized,
          r.match_warning
        FROM public.new_construction_permit_parcel_relationship r
        JOIN public.new_construction_permits_clean c
          ON c.new_construction_permit_id = r.new_construction_permit_id
        WHERE r.match_confidence = 'invalid_placeholder'
        ORDER BY c.permit_file_date DESC NULLS LAST, r.source_permit_id
        LIMIT 250
        """,
    )
    summary_validation = fetch_one(
        engine,
        """
        SELECT
          (SELECT COUNT(*) FROM public.parcel_new_construction_summary) AS parcel_summary_row_count,
          COUNT(*) FILTER (WHERE development_stage = 'completed_recent') AS completed_recent_count,
          COUNT(*) FILTER (WHERE development_stage = 'active_permitted') AS active_permitted_count,
          COUNT(*) FILTER (WHERE development_stage = 'historical_completed') AS historical_completed_count,
          COUNT(*) FILTER (WHERE development_stage = 'repeated_activity') AS repeated_activity_count,
          COUNT(*) FILTER (WHERE development_stage = 'review_required') AS review_required_count,
          MIN(first_new_construction_permit_date) AS first_permit_date_min,
          MAX(latest_new_construction_permit_date) AS latest_permit_date_max,
          SUM(total_new_construction_permits)::integer AS summarized_permit_count
        FROM public.parcel_new_construction_summary
        """,
    )
    label_validation = {
        **fetch_one(
            engine,
            """
            SELECT
              COUNT(*) AS label_table_row_count,
              MIN(snapshot_year) AS min_snapshot_year,
              MAX(snapshot_year) AS max_snapshot_year,
              COUNT(DISTINCT snapshot_year) AS snapshot_year_count
            FROM public.parcel_development_prediction_labels
            """,
        ),
        "positive_rate_by_snapshot_year": fetch_rows(
            engine,
            """
            SELECT
              snapshot_year,
              COUNT(*) AS parcel_count,
              COUNT(*) FILTER (WHERE new_construction_next_1yr) AS positive_next_1yr_count,
              ROUND(
                COUNT(*) FILTER (WHERE new_construction_next_1yr) * 100.0 / NULLIF(COUNT(*), 0),
                4
              ) AS positive_next_1yr_pct,
              COUNT(*) FILTER (WHERE new_construction_next_3yr) AS positive_next_3yr_count,
              ROUND(
                COUNT(*) FILTER (WHERE new_construction_next_3yr) * 100.0 / NULLIF(COUNT(*), 0),
                4
              ) AS positive_next_3yr_pct
            FROM public.parcel_development_prediction_labels
            GROUP BY snapshot_year
            ORDER BY snapshot_year
            """,
        ),
    }

    write_csv(TYPE_SUMMARY_OUTPUT, type_summary)
    write_csv(YEAR_SUMMARY_OUTPUT, year_summary)
    write_csv(MATCH_QA_OUTPUT, match_qa)
    write_csv(UNMATCHED_SAMPLES_OUTPUT, unmatched_samples)
    write_csv(PLACEHOLDER_OUTPUT, placeholder_rows)
    write_json(SUMMARY_VALIDATION_OUTPUT, summary_validation)
    write_json(LABEL_VALIDATION_OUTPUT, label_validation)

    high_level = fetch_one(
        engine,
        """
        SELECT
          (SELECT COUNT(*) FROM public.new_construction_permits_clean) AS source_row_count,
          MIN(permit_file_date) AS permit_date_min,
          MAX(permit_file_date) AS permit_date_max,
          COUNT(*) FILTER (WHERE co_issued = true) AS co_issued_count,
          COUNT(*) FILTER (WHERE co_issued = false) AS co_not_issued_count,
          MIN(co_date) AS co_date_min,
          MAX(co_date) AS co_date_max,
          COUNT(*) FILTER (WHERE c.parcel_num_raw IS NULL OR trim(c.parcel_num_raw) = '') AS null_parcel_count,
          COUNT(*) FILTER (WHERE r.match_confidence = 'invalid_placeholder') AS invalid_placeholder_parcel_count,
          COUNT(*) FILTER (WHERE r.match_confidence IN ('exact', 'normalized_exact')) AS matched_permit_count,
          COUNT(*) FILTER (WHERE r.match_confidence = 'unmatched') AS unmatched_permit_count,
          COUNT(*) FILTER (WHERE r.match_confidence = 'ambiguous') AS ambiguous_permit_count,
          COUNT(DISTINCT r.official_parcel_id) FILTER (WHERE r.official_parcel_id IS NOT NULL) AS unique_matched_parcel_count
        FROM public.new_construction_permit_parcel_relationship r
        JOIN public.new_construction_permits_clean c
          ON c.new_construction_permit_id = r.new_construction_permit_id
        """,
    )

    phase_summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "duration_seconds": round(time.time() - started_at, 2),
        "log_path": str(log_path),
        "source_file_path": str(source_path),
        "source_profile": profile,
        "database_tables": {
            "raw": "public.new_construction_permits_raw",
            "clean": "public.new_construction_permits_clean",
            "relationship": "public.new_construction_permit_parcel_relationship",
            "parcel_summary": "public.parcel_new_construction_summary",
            "label_factory": "public.parcel_development_prediction_labels",
        },
        "high_level_qa": high_level,
        "permit_type_distribution": type_summary,
        "parcel_match_status": match_qa,
        "parcel_summary_validation": summary_validation,
        "label_validation": label_validation,
        "backend_endpoints": [
            "GET /development/new-construction/statistics",
            "GET /development/new-construction/trends",
            "GET /development/new-construction/parcel/{official_parcel_id}",
            "GET /development/new-construction/labels/summary",
        ],
        "modeling_boundary": {
            "prediction_model_trained": False,
            "prediction_probability_exposed": False,
            "labels_are_targets_only": True,
            "temporal_leakage_warning": "Snapshot labels only look after Dec 31 of each snapshot_year.",
        },
    }
    write_json(PHASE_SUMMARY_OUTPUT, phase_summary)
    write_json(PIPELINE_OUTPUT_DIR / PHASE_SUMMARY_OUTPUT.name, phase_summary)

    return phase_summary


def main() -> None:
    args = parse_args()
    started_at = time.time()
    log_path = configure_logging(args.log_level)
    source_path = Path(args.file).resolve()
    dataframe = read_source_csv(source_path)
    profile = source_profile(dataframe, source_path)
    write_json(SOURCE_PROFILE_OUTPUT, profile)
    write_json(PIPELINE_OUTPUT_DIR / SOURCE_PROFILE_OUTPUT.name, profile)

    logging.info(
        "Read %s rows from %s. Permit date range: %s to %s",
        profile["row_count"],
        source_path,
        profile["permit_file_date"]["min"],
        profile["permit_file_date"]["max"],
    )

    if args.dry_run:
        logging.info("Dry run complete; database was not modified.")
        dry_run_summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "dry_run": True,
            "source_file_path": str(source_path),
            "source_profile": profile,
            "database_modified": False,
        }
        write_json(PHASE_SUMMARY_OUTPUT, dry_run_summary)
        return

    if not args.truncate_and_load:
        raise RuntimeError(
            "Refusing to write database tables without --truncate-and-load. "
            "This protects prior Phase 10A review artifacts from accidental reloads.",
        )

    engine = create_engine_from_env()
    raw_dataframe = prepare_raw_dataframe(dataframe, source_path)
    logging.info("Loading raw new construction permits into PostGIS.")
    load_raw_table(engine, raw_dataframe, truncate_and_load=True)

    if not args.skip_transform:
        logging.info("Executing Phase 10A new construction transform SQL.")
        execute_transform_sql(engine)
        phase_summary = generate_database_outputs(
            engine,
            profile,
            source_path=source_path,
            started_at=started_at,
            log_path=log_path,
        )
        logging.info(
            "Phase 10A complete. Matched permits: %s. Labels: %s.",
            phase_summary["high_level_qa"].get("matched_permit_count"),
            phase_summary["label_validation"].get("label_table_row_count"),
        )


if __name__ == "__main__":
    main()
