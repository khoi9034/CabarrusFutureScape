"""Ingest the Phase 8E presentation-derived school utilization seed.

This seed is temporary planning context from CCS capital planning presentation
maps. It is not official enrollment/capacity ingestion and must not populate
public.school_capacity.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
TRANSFORM_DIR = PIPELINE_ROOT / "transform"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_school_presentation_utilization_seed.sql"
SEED_FILE = (
    PROJECT_ROOT
    / "data"
    / "schools"
    / "raw"
    / "presentation_utilization_seed_sy2024_2025.csv"
)
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"

sys.path.insert(0, str(TRANSFORM_DIR))
from validate_school_capacity_data import normalize_school_name  # noqa: E402

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DATASET_NAME = "presentation_utilization_seed"
SOURCE_SYSTEM = "CCS"
VALID_LEVELS = {"elementary", "middle", "high"}
SAFE_REFERENCE_MATCH_ALIASES = {
    ("harris_road_middle", "middle"): ("harris_rd_middle", "middle"),
    ("mount_pleasant_elementary", "elementary"): (
        "mt_pleasant_elementary",
        "elementary",
    ),
    ("mount_pleasant_high", "high"): ("mt_pleasant_high", "high"),
    ("mount_pleasant_middle", "middle"): ("mt_pleasant_middle", "middle"),
    ("pitts_school_road_elementary", "elementary"): (
        "pitts_road_elementary",
        "elementary",
    ),
    ("royal_oaks_of_the_arts", "elementary"): (
        "royal_oaks_elementary",
        "elementary",
    ),
}
REQUIRED_COLUMNS = (
    "school_abbreviation",
    "school_name",
    "school_name_normalized",
    "school_level",
    "school_year",
    "utilization_pct",
    "utilization_class",
    "source_name",
    "source_confidence",
    "needs_verification",
    "notes",
)
NO_FAKE_VALUES_NOTE = (
    "This seed contains utilization percentages only. It does not generate "
    "current_enrollment, functional_capacity, available_seats, or official scores."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or load the presentation-derived school utilization seed.",
    )
    parser.add_argument("--file", default=str(SEED_FILE), help="Seed CSV path.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and optionally match references without writing rows.",
    )
    parser.add_argument(
        "--truncate-and-load",
        action="store_true",
        help="Create seed table, truncate seed rows, and load the seed CSV.",
    )
    return parser.parse_args()


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD must be set before DB-backed seed validation/loading."
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


def read_seed_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value:
        return None
    try:
        return Decimal(text_value.replace(",", ""))
    except InvalidOperation:
        return None


def parse_bool(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y"}


def classify_utilization(value: Decimal | int | str | None) -> str:
    utilization = parse_decimal(value)
    if utilization is None:
        return "review_required"
    if utilization < Decimal("80"):
        return "under_capacity"
    if utilization < Decimal("100"):
        return "approaching_capacity"
    if utilization <= Decimal("110"):
        return "over_capacity"
    return "severely_over_capacity"


def seed_id_for(row: dict[str, Any]) -> str:
    seed = "|".join(
        str(row.get(key, ""))
        for key in (
            "school_name_normalized",
            "school_level",
            "school_year",
            "source_confidence",
        )
    )
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
    return f"SCHOOL-UTIL-SEED-{digest}"


def match_reference_id(
    normalized_name: str,
    school_level: str,
    reference_lookup: dict[tuple[str, str], str],
) -> tuple[str | None, str]:
    direct_key = (normalized_name, school_level)
    reference_id = reference_lookup.get(direct_key)
    if reference_id:
        return reference_id, "normalized_exact"

    alias_key = SAFE_REFERENCE_MATCH_ALIASES.get(direct_key)
    if alias_key:
        reference_id = reference_lookup.get(alias_key)
        if reference_id:
            return reference_id, "safe_alias_normalized"

    return None, "unmatched_reference_review"


def issue(
    *,
    row: dict[str, Any] | None,
    row_number: int | None,
    issue_type: str,
    severity: str,
    description: str,
    recommended_fix: str,
    source_file: Path,
) -> dict[str, Any]:
    row = row or {}
    return {
        "dataset_name": DATASET_NAME,
        "source_file": str(source_file),
        "school_name": row.get("school_name"),
        "school_name_normalized": row.get("school_name_normalized"),
        "school_level": row.get("school_level"),
        "school_system": SOURCE_SYSTEM,
        "issue_type": issue_type,
        "severity": severity,
        "issue_description": description,
        "recommended_fix": recommended_fix,
        "row_number": row_number,
    }


def validate_seed_rows(
    rows: list[dict[str, str]],
    *,
    source_file: Path,
    reference_lookup: dict[tuple[str, str], str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    standardized: list[dict[str, Any]] = []

    if not rows:
        return [], [
            issue(
                row=None,
                row_number=None,
                issue_type="empty_source_file",
                severity="error",
                description="Presentation utilization seed contains no data rows.",
                recommended_fix="Provide the Phase 8E seed CSV rows.",
                source_file=source_file,
            )
        ]

    actual_columns = set(rows[0])
    for column in REQUIRED_COLUMNS:
        if column not in actual_columns:
            issues.append(
                issue(
                    row=None,
                    row_number=None,
                    issue_type="missing_required_column",
                    severity="error",
                    description=f"Required column '{column}' is missing.",
                    recommended_fix="Use the Phase 8E presentation utilization seed template.",
                    source_file=source_file,
                )
            )

    seen: set[tuple[str, str, str]] = set()
    for row_number, raw_row in enumerate(rows, start=2):
        row = {key: str(value or "").strip() for key, value in raw_row.items()}
        normalized_name = row.get("school_name_normalized") or normalize_school_name(
            row.get("school_name")
        )
        school_level = row.get("school_level", "").lower()
        utilization_pct = parse_decimal(row.get("utilization_pct"))
        calculated_class = classify_utilization(utilization_pct)
        provided_class = row.get("utilization_class", "")

        row["school_name_normalized"] = normalized_name
        row["school_level"] = school_level
        row["needs_verification"] = parse_bool(row.get("needs_verification"))
        row["utilization_pct"] = utilization_pct
        row["utilization_class"] = calculated_class
        row["seed_id"] = seed_id_for(row)

        if school_level not in VALID_LEVELS:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="invalid_school_level",
                    severity="error",
                    description="school_level must be elementary, middle, or high.",
                    recommended_fix="Correct the level before loading.",
                    source_file=source_file,
                )
            )

        if utilization_pct is None:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="invalid_utilization_pct",
                    severity="error",
                    description="utilization_pct must be numeric.",
                    recommended_fix="Provide the percentage read from the presentation map.",
                    source_file=source_file,
                )
            )
        elif utilization_pct < 0:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="negative_utilization_pct",
                    severity="error",
                    description="utilization_pct cannot be negative.",
                    recommended_fix="Correct the source value.",
                    source_file=source_file,
                )
            )

        if provided_class and provided_class != calculated_class:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="utilization_class_mismatch",
                    severity="review",
                    description=(
                        f"Provided utilization_class '{provided_class}' was recalculated as "
                        f"'{calculated_class}'."
                    ),
                    recommended_fix="Use the Phase 8E utilization class rules.",
                    source_file=source_file,
                )
            )

        if row.get("source_confidence") != "presentation_derived":
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="unexpected_source_confidence",
                    severity="review",
                    description="source_confidence should be presentation_derived.",
                    recommended_fix="Keep this seed clearly marked as presentation-derived.",
                    source_file=source_file,
                )
            )

        if row.get("needs_verification") is not True:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="needs_verification_not_true",
                    severity="error",
                    description="needs_verification must be true for presentation-derived seed rows.",
                    recommended_fix="Set needs_verification=true.",
                    source_file=source_file,
                )
            )

        duplicate_key = (
            str(normalized_name),
            school_level,
            row.get("school_year", ""),
        )
        if duplicate_key in seen:
            issues.append(
                issue(
                    row=row,
                    row_number=row_number,
                    issue_type="duplicate_seed_school_year",
                    severity="review",
                    description="Duplicate school utilization seed row for the same school/year.",
                    recommended_fix="Keep one governed seed row per school/year/level.",
                    source_file=source_file,
                )
            )
        seen.add(duplicate_key)

        reference_id = None
        match_confidence = "reference_lookup_not_run"
        if reference_lookup is not None:
            reference_id, match_confidence = match_reference_id(
                str(normalized_name),
                school_level,
                reference_lookup,
            )
            if reference_id is None:
                issues.append(
                    issue(
                        row=row,
                        row_number=row_number,
                        issue_type="unmatched_school_reference",
                        severity="review",
                        description=(
                            "Seed row does not match an included CCS public school_reference "
                            "record by normalized name and school level."
                        ),
                        recommended_fix=(
                            "Review school_name_normalized or keep as presentation QA until "
                            "official capacity data arrives."
                        ),
                        source_file=source_file,
                    )
                )

        row["matched_school_reference_id"] = reference_id
        row["match_confidence"] = match_confidence
        standardized.append(row)

    return standardized, issues


def reference_lookup(engine: Engine) -> dict[tuple[str, str], str]:
    rows = engine.connect().execute(
        text(
            """
            SELECT school_name_normalized, school_level, school_reference_id
            FROM public.school_reference
            WHERE include_in_cfs_v1
              AND school_system = 'CCS'
              AND school_name_normalized IS NOT NULL
              AND school_level IS NOT NULL
            """
        )
    ).mappings().all()
    return {
        (str(row["school_name_normalized"]), str(row["school_level"])): str(
            row["school_reference_id"]
        )
        for row in rows
    }


def write_qa_rows(
    engine: Engine,
    issues: list[dict[str, Any]],
    *,
    source_file: Path,
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
    written = 0
    with engine.begin() as connection:
        for index, row in enumerate(issues, start=1):
            seed = (
                f"{DATASET_NAME}|{source_file}|{row.get('row_number')}|"
                f"{row.get('issue_type')}|{row.get('school_name')}|{index}"
            )
            payload = {
                **row,
                "qa_id": f"SCHOOL-UTIL-SEED-QA-{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:16]}",
                "source_file": str(source_file),
            }
            result = connection.execute(statement, payload)
            written += result.rowcount or 0
    return written


def load_seed_rows(engine: Engine, rows: list[dict[str, Any]]) -> int:
    statement = text(
        """
        INSERT INTO public.school_presentation_utilization_seed (
          seed_id,
          school_abbreviation,
          school_name,
          school_name_normalized,
          school_level,
          school_year,
          utilization_pct,
          utilization_class,
          matched_school_reference_id,
          match_confidence,
          source_name,
          source_confidence,
          needs_verification,
          notes,
          ingested_at
        ) VALUES (
          :seed_id,
          :school_abbreviation,
          :school_name,
          :school_name_normalized,
          :school_level,
          :school_year,
          :utilization_pct,
          :utilization_class,
          :matched_school_reference_id,
          :match_confidence,
          :source_name,
          :source_confidence,
          :needs_verification,
          :notes,
          NOW()
        )
        ON CONFLICT (seed_id) DO UPDATE SET
          school_abbreviation = EXCLUDED.school_abbreviation,
          school_name = EXCLUDED.school_name,
          school_name_normalized = EXCLUDED.school_name_normalized,
          school_level = EXCLUDED.school_level,
          school_year = EXCLUDED.school_year,
          utilization_pct = EXCLUDED.utilization_pct,
          utilization_class = EXCLUDED.utilization_class,
          matched_school_reference_id = EXCLUDED.matched_school_reference_id,
          match_confidence = EXCLUDED.match_confidence,
          source_name = EXCLUDED.source_name,
          source_confidence = EXCLUDED.source_confidence,
          needs_verification = EXCLUDED.needs_verification,
          notes = EXCLUDED.notes,
          ingested_at = NOW()
        """
    )

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE public.school_presentation_utilization_seed"))
        inserted = 0
        for row in rows:
            result = connection.execute(statement, row)
            inserted += result.rowcount or 0
        connection.execute(text("ANALYZE public.school_presentation_utilization_seed"))
    return inserted


def summarize(rows: list[dict[str, Any]], issues: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "row_count": len(rows),
        "elementary_row_count": count_rows(rows, "school_level", "elementary"),
        "middle_row_count": count_rows(rows, "school_level", "middle"),
        "high_row_count": count_rows(rows, "school_level", "high"),
        "matched_school_reference_count": sum(
            1 for row in rows if row.get("matched_school_reference_id")
        ),
        "unmatched_or_review_count": sum(
            1
            for row in rows
            if row.get("match_confidence") == "unmatched_reference_review"
        ),
        "utilization_class_distribution": distribution(rows, "utilization_class"),
        "issue_count": len(issues),
        "error_count": sum(1 for row in issues if row["severity"] == "error"),
        "review_count": sum(1 for row in issues if row["severity"] == "review"),
        "issues_by_type": {
            issue_type: sum(1 for row in issues if row["issue_type"] == issue_type)
            for issue_type in sorted({row["issue_type"] for row in issues})
        },
    }


def count_rows(rows: list[dict[str, Any]], key: str, value: str) -> int:
    return sum(1 for row in rows if row.get(key) == value)


def distribution(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    return {
        value: sum(1 for row in rows if row.get(key) == value)
        for value in sorted({str(row.get(key)) for row in rows})
    }


def write_summary(payload: dict[str, Any]) -> Path:
    ROOT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = ROOT_OUTPUT_DIR / "school_presentation_utilization_seed_last_run.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def main() -> int:
    args = parse_args()
    source_file = Path(args.file)
    if not source_file.exists():
        raise SystemExit(f"Seed CSV does not exist: {source_file}")
    if args.dry_run and args.truncate_and_load:
        raise SystemExit("Choose either --dry-run or --truncate-and-load, not both.")
    if not args.dry_run and not args.truncate_and_load:
        raise SystemExit("Use --dry-run or --truncate-and-load explicitly.")

    engine: Engine | None = None
    references: dict[tuple[str, str], str] | None = None
    if args.truncate_and_load:
        engine = create_engine_from_env()
        execute_sql_file(engine)
        references = reference_lookup(engine)

    rows = read_seed_csv(source_file)
    standardized, issues = validate_seed_rows(
        rows,
        source_file=source_file,
        reference_lookup=references,
    )
    summary = summarize(standardized, issues)
    inserted_rows = 0
    qa_rows_written = 0

    if args.truncate_and_load:
        assert engine is not None
        if summary["error_count"] > 0:
            qa_rows_written = write_qa_rows(engine, issues, source_file=source_file)
            raise SystemExit(
                f"Validation failed with {summary['error_count']} error(s); QA rows written: {qa_rows_written}."
            )
        inserted_rows = load_seed_rows(engine, standardized)
        qa_rows_written = write_qa_rows(engine, issues, source_file=source_file)

    payload = {
        "generated_at": datetime.now().isoformat(),
        "dataset": DATASET_NAME,
        "source_file": str(source_file),
        "dry_run": bool(args.dry_run),
        "truncate_and_load": bool(args.truncate_and_load),
        "summary": summary,
        "inserted_rows": inserted_rows,
        "qa_rows_written": qa_rows_written,
        "no_fake_values_generated": True,
        "public_school_capacity_untouched": True,
        "warning": (
            "Presentation-derived utilization seed only; not official enrollment, "
            "functional capacity, available seats, or capacity score data."
        ),
        "no_fake_values_note": NO_FAKE_VALUES_NOTE,
    }
    output_path = write_summary(payload)
    print(json.dumps(payload, indent=2, default=str))
    print(f"Wrote summary: {output_path}")
    return 1 if summary["error_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
