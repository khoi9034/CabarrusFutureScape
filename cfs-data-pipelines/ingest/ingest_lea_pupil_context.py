"""Ingest district-level LEA pupil context from the uploaded CCS CSV.

The source is districtwide grade/measure context only. It must not populate
public.school_capacity, create school-level capacity values, or score parcels.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
SQL_FILE = PIPELINE_ROOT / "sql" / "create_school_lea_pupil_context.sql"
DEFAULT_SOURCE_FILE = PROJECT_ROOT / "data" / "schools" / "raw" / "lea_pupil_info_2025.csv"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DATASET_NAME = "lea_pupil_context"
SOURCE_CONFIDENCE = "uploaded_lea_pupil_file"
CONTEXT_NOTE = "District-level LEA pupil context only; not school-level capacity or utilization."
VALID_MEASURE_TYPES = {"Enrollment", "ADM", "ADA", "MLD"}

GRADE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("KIND", "kindergarten"),
    ("1st", "grade_1"),
    ("2nd", "grade_2"),
    ("3rd", "grade_3"),
    ("4th", "grade_4"),
    ("5th", "grade_5"),
    ("6th", "grade_6"),
    ("7th", "grade_7"),
    ("8th", "grade_8"),
    ("9th", "grade_9"),
    ("10th", "grade_10"),
    ("11th", "grade_11"),
    ("12th", "grade_12"),
    ("13th", "grade_13"),
    ("Total", "total"),
)
REQUIRED_COLUMNS = (
    "Year",
    "LEA",
    "LEA Name",
    "Month",
    "Type",
    *(column for column, _grade in GRADE_COLUMNS),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or load district-level CCS LEA pupil context.",
    )
    parser.add_argument("--file", default=str(DEFAULT_SOURCE_FILE), help="LEA pupil CSV path.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and summarize without writing to PostGIS.",
    )
    parser.add_argument(
        "--truncate-and-load",
        action="store_true",
        help="Create table, truncate existing LEA context rows, and load the CSV.",
    )
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD must be set before DB-backed LEA context loading."
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


def execute_sql_file(engine: Engine) -> None:
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(SQL_FILE.read_text(encoding="utf-8"))
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def read_lea_pupil_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        validate_required_columns(reader.fieldnames or [])
        return list(reader)


def validate_required_columns(fieldnames: list[str]) -> None:
    missing = [column for column in REQUIRED_COLUMNS if column not in fieldnames]
    if missing:
        raise ValueError(f"Missing required LEA pupil column(s): {', '.join(missing)}")


def parse_int(value: Any) -> int | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value:
        return None
    return int(text_value.replace(",", ""))


def transform_lea_pupil_rows(
    raw_rows: list[dict[str, str]],
    *,
    source_file: Path,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for row_number, row in enumerate(raw_rows, start=2):
        measure_type = (row.get("Type") or "").strip()
        if measure_type not in VALID_MEASURE_TYPES:
            raise ValueError(
                f"Unsupported measure type '{measure_type}' at source row {row_number}."
            )
        school_year = parse_int(row.get("Year"))
        if school_year is None:
            raise ValueError(f"Missing or invalid school year at source row {row_number}.")

        lea = (row.get("LEA") or "").strip()
        if not lea:
            raise ValueError(f"Missing LEA at source row {row_number}.")

        for column, grade_level in GRADE_COLUMNS:
            pupil_count = parse_int(row.get(column))
            record = {
                "lea_pupil_context_id": make_context_id(
                    school_year=school_year,
                    lea=lea,
                    month=(row.get("Month") or "").strip(),
                    measure_type=measure_type,
                    grade_level=grade_level,
                ),
                "school_year": school_year,
                "lea": lea,
                "lea_name": (row.get("LEA Name") or "").strip() or None,
                "month": (row.get("Month") or "").strip() or None,
                "measure_type": measure_type,
                "grade_level": grade_level,
                "pupil_count": pupil_count,
                "source_file": str(source_file),
                "source_confidence": SOURCE_CONFIDENCE,
                "notes": CONTEXT_NOTE,
            }
            records.append(record)
    return records


def make_context_id(
    *,
    school_year: int,
    lea: str,
    month: str,
    measure_type: str,
    grade_level: str,
) -> str:
    seed = f"{school_year}|{lea}|{month}|{measure_type}|{grade_level}"
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:18].upper()
    return f"LEA-PUPIL-{digest}"


def load_context_rows(engine: Engine, rows: list[dict[str, Any]]) -> int:
    statement = text(
        """
        INSERT INTO public.school_lea_pupil_context (
          lea_pupil_context_id,
          school_year,
          lea,
          lea_name,
          month,
          measure_type,
          grade_level,
          pupil_count,
          source_file,
          source_confidence,
          notes,
          ingested_at
        ) VALUES (
          :lea_pupil_context_id,
          :school_year,
          :lea,
          :lea_name,
          :month,
          :measure_type,
          :grade_level,
          :pupil_count,
          :source_file,
          :source_confidence,
          :notes,
          NOW()
        )
        ON CONFLICT (lea_pupil_context_id) DO UPDATE SET
          school_year = EXCLUDED.school_year,
          lea = EXCLUDED.lea,
          lea_name = EXCLUDED.lea_name,
          month = EXCLUDED.month,
          measure_type = EXCLUDED.measure_type,
          grade_level = EXCLUDED.grade_level,
          pupil_count = EXCLUDED.pupil_count,
          source_file = EXCLUDED.source_file,
          source_confidence = EXCLUDED.source_confidence,
          notes = EXCLUDED.notes,
          ingested_at = NOW()
        """
    )

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE public.school_lea_pupil_context"))
        connection.execute(statement, rows)
        connection.execute(text("ANALYZE public.school_lea_pupil_context"))
    return len(rows)


def summarize(
    *,
    raw_rows: list[dict[str, str]],
    long_rows: list[dict[str, Any]],
    source_file: Path,
    dry_run: bool,
    inserted_rows: int,
) -> dict[str, Any]:
    enrollment_total = next(
        (
            row["pupil_count"]
            for row in long_rows
            if row["measure_type"] == "Enrollment" and row["grade_level"] == "total"
        ),
        None,
    )
    return {
        "generated_at": datetime.now().isoformat(),
        "dataset": DATASET_NAME,
        "source_file": str(source_file),
        "dry_run": dry_run,
        "input_measure_rows": len(raw_rows),
        "long_row_count": len(long_rows),
        "inserted_rows": inserted_rows,
        "measure_types": sorted({row["measure_type"] for row in long_rows}),
        "grade_levels": [grade for _column, grade in GRADE_COLUMNS],
        "districtwide_enrollment_total": enrollment_total,
        "source_confidence": SOURCE_CONFIDENCE,
        "public_school_capacity_untouched": True,
        "school_capacity_scores_calculated": False,
        "notes": CONTEXT_NOTE,
    }


def write_summary(payload: dict[str, Any]) -> Path:
    ROOT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = ROOT_OUTPUT_DIR / "lea_pupil_context_ingestion_summary.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def main() -> int:
    args = parse_args()
    source_file = Path(args.file)
    if args.dry_run and args.truncate_and_load:
        raise SystemExit("Choose either --dry-run or --truncate-and-load, not both.")
    if not args.dry_run and not args.truncate_and_load:
        raise SystemExit("Use --dry-run or --truncate-and-load explicitly.")
    if not source_file.exists():
        raise SystemExit(f"LEA pupil CSV does not exist: {source_file}")

    raw_rows = read_lea_pupil_csv(source_file)
    long_rows = transform_lea_pupil_rows(raw_rows, source_file=source_file)
    inserted_rows = 0
    if args.truncate_and_load:
        engine = create_engine_from_env()
        execute_sql_file(engine)
        inserted_rows = load_context_rows(engine, long_rows)

    payload = summarize(
        raw_rows=raw_rows,
        long_rows=long_rows,
        source_file=source_file,
        dry_run=args.dry_run,
        inserted_rows=inserted_rows,
    )
    summary_path = write_summary(payload)
    payload["summary_path"] = str(summary_path)
    print(json.dumps(payload, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
