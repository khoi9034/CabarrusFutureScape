"""Dry-run safe importer for future school capacity/enrollment files.

Phase 8D readiness only. Do not use this script to fabricate enrollment,
capacity, utilization, or score values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
TRANSFORM_DIR = PIPELINE_ROOT / "transform"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_school_capacity_readiness_tables.sql"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"

sys.path.insert(0, str(TRANSFORM_DIR))
from validate_school_capacity_data import (  # noqa: E402
    DATASET_SPECS,
    parse_decimal,
    parse_int,
    read_tabular_file,
    summarize_validation,
    validate_records,
)

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

TARGET_TABLES = {
    "capacity": "public.school_capacity_history",
    "enrollment_history": "public.school_enrollment_history",
    "grade_enrollment": "public.school_grade_enrollment_history",
    "projection": "public.school_capacity_projection",
    "planned_capacity": "public.school_planned_capacity_changes",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or ingest future school capacity/enrollment source files.",
    )
    parser.add_argument("--file", required=True, help="CSV or XLSX source file path.")
    parser.add_argument("--dataset", required=True, choices=sorted(DATASET_SPECS))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate only and do not write rows to PostGIS.",
    )
    parser.add_argument(
        "--validation-only",
        action="store_true",
        help="Alias for dry-run; validates without writing rows.",
    )
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD must be set before non-dry-run ingestion."
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


def reference_lookup(engine: Engine) -> dict[tuple[str, str, str], str]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT school_name_normalized, school_level, school_system, school_reference_id
                FROM public.school_reference
                WHERE school_name_normalized IS NOT NULL
                  AND school_level IS NOT NULL
                  AND school_system IS NOT NULL
                """
            )
        ).mappings().all()
    return {
        (
            str(row["school_name_normalized"]),
            str(row["school_level"]),
            str(row["school_system"]).upper(),
        ): str(row["school_reference_id"])
        for row in rows
    }


def make_id(prefix: str, row: dict[str, Any], index: int) -> str:
    seed = "|".join(
        str(row.get(key, ""))
        for key in (
            "school_name_normalized",
            "school_level",
            "school_system",
            "school_year",
            "projection_year",
            "grade_level",
            "project_name",
            "source_name",
        )
    )
    digest = hashlib.sha1(f"{seed}|{index}".encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def _int_or_none(value: Any) -> int | None:
    return parse_int(value)


def _decimal_or_none(value: Any) -> Decimal | None:
    return parse_decimal(value)


def match_reference(
    row: dict[str, Any],
    references: dict[tuple[str, str, str], str],
) -> tuple[str | None, str]:
    key = (
        row.get("school_name_normalized", ""),
        row.get("school_level", ""),
        row.get("school_system", "").upper(),
    )
    reference_id = references.get(key)
    return reference_id, "normalized_exact" if reference_id else "unmatched_reference_review"


def insert_rows(
    engine: Engine,
    dataset: str,
    rows: list[dict[str, Any]],
    references: dict[tuple[str, str, str], str],
) -> int:
    if not rows:
        return 0

    table = TARGET_TABLES[dataset]
    statements = {
        "capacity": text(
            f"""
            INSERT INTO {table} (
              capacity_history_id, school_name, school_name_normalized, school_level,
              school_system, school_year, functional_capacity, current_enrollment,
              available_seats, utilization_pct, capacity_status,
              matched_school_reference_id, match_confidence, source_name, source_url,
              notes, ingested_at
            ) VALUES (
              :id, :school_name, :school_name_normalized, :school_level,
              :school_system, :school_year, :functional_capacity, :current_enrollment,
              :available_seats, :utilization_pct, :capacity_status,
              :matched_school_reference_id, :match_confidence, :source_name, :source_url,
              :notes, NOW()
            )
            ON CONFLICT (capacity_history_id) DO NOTHING
            """
        ),
        "enrollment_history": text(
            f"""
            INSERT INTO {table} (
              enrollment_history_id, school_name, school_name_normalized, school_level,
              school_system, school_year, total_enrollment,
              matched_school_reference_id, match_confidence, source_name, source_url,
              notes, ingested_at
            ) VALUES (
              :id, :school_name, :school_name_normalized, :school_level,
              :school_system, :school_year, :total_enrollment,
              :matched_school_reference_id, :match_confidence, :source_name, :source_url,
              :notes, NOW()
            )
            ON CONFLICT (enrollment_history_id) DO NOTHING
            """
        ),
        "grade_enrollment": text(
            f"""
            INSERT INTO {table} (
              grade_enrollment_id, school_name, school_name_normalized, school_level,
              school_system, school_year, grade_level, grade_enrollment,
              grade_capacity, grade_utilization_pct,
              matched_school_reference_id, match_confidence, source_name, source_url,
              notes, ingested_at
            ) VALUES (
              :id, :school_name, :school_name_normalized, :school_level,
              :school_system, :school_year, :grade_level, :grade_enrollment,
              :grade_capacity, :grade_utilization_pct,
              :matched_school_reference_id, :match_confidence, :source_name, :source_url,
              :notes, NOW()
            )
            ON CONFLICT (grade_enrollment_id) DO NOTHING
            """
        ),
        "projection": text(
            f"""
            INSERT INTO {table} (
              projection_id, school_name, school_name_normalized, school_level,
              school_system, projection_year, projected_enrollment, projected_capacity,
              projected_utilization_pct, projection_method,
              matched_school_reference_id, match_confidence, source_name, source_url,
              notes, ingested_at
            ) VALUES (
              :id, :school_name, :school_name_normalized, :school_level,
              :school_system, :projection_year, :projected_enrollment, :projected_capacity,
              :projected_utilization_pct, :projection_method,
              :matched_school_reference_id, :match_confidence, :source_name, :source_url,
              :notes, NOW()
            )
            ON CONFLICT (projection_id) DO NOTHING
            """
        ),
        "planned_capacity": text(
            f"""
            INSERT INTO {table} (
              planned_change_id, school_name, school_name_normalized, school_level,
              school_system, project_name, project_type, planned_capacity_added,
              planned_capacity_removed, net_capacity_change, expected_open_year, status,
              matched_school_reference_id, match_confidence, source_name, source_url,
              notes, ingested_at
            ) VALUES (
              :id, :school_name, :school_name_normalized, :school_level,
              :school_system, :project_name, :project_type, :planned_capacity_added,
              :planned_capacity_removed, :net_capacity_change, :expected_open_year, :status,
              :matched_school_reference_id, :match_confidence, :source_name, :source_url,
              :notes, NOW()
            )
            ON CONFLICT (planned_change_id) DO NOTHING
            """
        ),
    }

    inserted = 0
    with engine.begin() as connection:
        for index, row in enumerate(rows, start=1):
            reference_id, confidence = match_reference(row, references)
            params = {
                **row,
                "id": make_id(dataset.upper(), row, index),
                "matched_school_reference_id": reference_id,
                "match_confidence": confidence,
            }
            for key in (
                "school_year",
                "projection_year",
                "expected_open_year",
                "functional_capacity",
                "current_enrollment",
                "available_seats",
                "total_enrollment",
                "grade_enrollment",
                "grade_capacity",
                "projected_enrollment",
                "projected_capacity",
                "planned_capacity_added",
                "planned_capacity_removed",
                "net_capacity_change",
            ):
                if key in params:
                    params[key] = _int_or_none(params[key])
            for key in (
                "utilization_pct",
                "grade_utilization_pct",
                "projected_utilization_pct",
            ):
                if key in params:
                    params[key] = _decimal_or_none(params[key])
            result = connection.execute(statements[dataset], params)
            inserted += result.rowcount or 0
    return inserted


def write_qa_rows(
    engine: Engine,
    dataset: str,
    source_file: Path,
    issues: list[dict[str, Any]],
) -> int:
    if not issues:
        return 0

    statement = text(
        """
        INSERT INTO public.school_capacity_ingestion_qa (
          qa_id, dataset_name, source_file, school_name, school_name_normalized,
          school_level, school_system, issue_type, severity, issue_description,
          recommended_fix, row_number, created_at
        ) VALUES (
          :qa_id, :dataset_name, :source_file, :school_name, :school_name_normalized,
          :school_level, :school_system, :issue_type, :severity, :issue_description,
          :recommended_fix, :row_number, NOW()
        )
        ON CONFLICT (qa_id) DO NOTHING
        """
    )
    with engine.begin() as connection:
        for index, issue in enumerate(issues, start=1):
            seed = f"{dataset}|{source_file}|{issue.get('row_number')}|{issue.get('issue_type')}|{index}"
            payload = {
                **issue,
                "qa_id": f"SCHOOL-CAPACITY-QA-{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:16]}",
                "source_file": str(source_file),
            }
            connection.execute(statement, payload)
    return len(issues)


def write_summary(payload: dict[str, Any]) -> Path:
    ROOT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = ROOT_OUTPUT_DIR / "school_capacity_ingestion_last_run.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def main() -> int:
    args = parse_args()
    source_path = Path(args.file)
    if not source_path.exists():
        raise SystemExit(f"Source file does not exist: {source_path}")

    dry_run = bool(args.dry_run or args.validation_only)
    rows = read_tabular_file(source_path)

    reference_keys: set[tuple[str, str, str]] | None = None
    references: dict[tuple[str, str, str], str] = {}
    engine: Engine | None = None
    if not dry_run:
        engine = create_engine_from_env()
        execute_sql_file(engine)
        references = reference_lookup(engine)
        reference_keys = set(references)

    standardized, issues = validate_records(
        rows,
        args.dataset,
        source_file=str(source_path),
        reference_lookup=reference_keys,
    )
    summary = summarize_validation(standardized, issues)
    inserted_rows = 0
    qa_rows = 0

    if not dry_run:
        assert engine is not None
        if summary["error_count"] > 0:
            qa_rows = write_qa_rows(engine, args.dataset, source_path, issues)
            raise SystemExit(
                f"Validation failed with {summary['error_count']} error(s); QA rows written: {qa_rows}."
            )
        inserted_rows = insert_rows(engine, args.dataset, standardized, references)
        qa_rows = write_qa_rows(engine, args.dataset, source_path, issues)

    payload = {
        "generated_at": datetime.now().isoformat(),
        "dataset": args.dataset,
        "source_file": str(source_path),
        "dry_run": dry_run,
        "validation_summary": summary,
        "inserted_rows": inserted_rows,
        "qa_rows_written": qa_rows,
        "no_fake_values_generated": True,
    }
    output_path = write_summary(payload)
    print(json.dumps(payload, indent=2, default=str))
    print(f"Wrote summary: {output_path}")
    return 1 if summary["error_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
