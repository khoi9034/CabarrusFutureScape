"""Export a static parcel search index for the frontend dashboard.

This reads the existing Phase 2 parcel intelligence tables and writes a
geometry-free JSON artifact that the Next.js dashboard can fetch from
`public/intelligence`. It does not build APIs, modify the frontend at runtime,
ingest new datasets, or connect the browser directly to PostGIS.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PARCELS_TABLE = "public.parcels_enriched"
ZONING_TABLE = "public.parcel_zoning_overlay_v2"
QA_TABLE = "public.parcel_zoning_intelligence_qa"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
PUBLIC_INTELLIGENCE_DIR = PROJECT_ROOT / "public" / "intelligence"

SEARCH_INDEX_OUTPUT = PUBLIC_INTELLIGENCE_DIR / "parcel-search-index.json"
SEARCH_INDEX_SUMMARY_OUTPUT = OUTPUT_DIR / "parcel_search_index_summary.json"

SEARCH_INDEX_FIELDS = [
    "officialParcelId",
    "pin14",
    "ownerName",
    "ownerSecondaryName",
    "mailingAddress",
    "subdivision",
    "neighborhood",
    "zoningJurisdiction",
    "zoningCode",
    "zoningCategory",
    "zoningConfidence",
    "governanceWarnings",
    "governanceWarningCount",
    "primaryGovernanceWarning",
    "parcelQualityStatus",
    "valuationBand",
    "parcelSizeCategory",
    "planningJurisdiction",
    "planningBoundaryType",
    "safeForDashboard",
    "needsGovernanceReview",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export a static parcel search index JSON artifact.",
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
    log_path = LOG_DIR / f"export_parcel_search_index_{timestamp}.log"

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
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before generating "
            "the static parcel search index."
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


def table_exists(engine: Engine, table_name: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": table_name},
            ).scalar_one()
        )


def verify_database(engine: Engine) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    missing_tables = [
        table_name
        for table_name in [PARCELS_TABLE, ZONING_TABLE, QA_TABLE]
        if not table_exists(engine, table_name)
    ]
    if missing_tables:
        raise RuntimeError(
            "Required parcel intelligence tables are missing: "
            + ", ".join(missing_tables)
        )


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def fetch_rows(engine: Engine) -> list[list[Any]]:
    query = text(
        f"""
        SELECT
          p.official_parcel_id,
          p.pin14,
          p.acctname1,
          p.acctname2,
          NULLIF(
            TRIM(BOTH ', ' FROM CONCAT_WS(
              ', ',
              NULLIF(p.mailaddr1, ''),
              NULLIF(p.mailaddr2, ''),
              NULLIF(p.mailcity, ''),
              NULLIF(p.mailstate, ''),
              NULLIF(p.mailzipcode, '')
            )),
            ''
          ) AS mailing_address,
          p.subdiv_name,
          p.nbh_name,
          z.zoning_jurisdiction_name,
          z.dominant_zoning_code_raw,
          z.dominant_zoning_general_normalized,
          z.zoning_assignment_confidence,
          q.governance_warning_categories,
          COALESCE(q.governance_warning_count, 0) AS governance_warning_count,
          q.primary_governance_warning,
          p.parcel_quality_status,
          p.valuation_band,
          p.parcel_size_category,
          z.planning_jurisdiction_name,
          z.planning_boundary_type,
          COALESCE(q.safe_for_dashboard, FALSE) AS safe_for_dashboard,
          COALESCE(q.needs_governance_review, FALSE) AS needs_governance_review
        FROM {PARCELS_TABLE} p
        LEFT JOIN {ZONING_TABLE} z
          ON z.official_parcel_id = p.official_parcel_id
        LEFT JOIN {QA_TABLE} q
          ON q.official_parcel_id = p.official_parcel_id
        ORDER BY p.official_parcel_id
        """
    )

    rows: list[list[Any]] = []
    with engine.connect().execution_options(stream_results=True) as connection:
        result = connection.execute(query)
        for row in result:
            rows.append(
                [
                    clean_text(row.official_parcel_id),
                    clean_text(row.pin14),
                    clean_text(row.acctname1),
                    clean_text(row.acctname2),
                    clean_text(row.mailing_address),
                    clean_text(row.subdiv_name),
                    clean_text(row.nbh_name),
                    clean_text(row.zoning_jurisdiction_name),
                    clean_text(row.dominant_zoning_code_raw),
                    clean_text(row.dominant_zoning_general_normalized),
                    clean_text(row.zoning_assignment_confidence),
                    row.governance_warning_categories or [],
                    int(row.governance_warning_count or 0),
                    clean_text(row.primary_governance_warning),
                    clean_text(row.parcel_quality_status),
                    clean_text(row.valuation_band),
                    clean_text(row.parcel_size_category),
                    clean_text(row.planning_jurisdiction_name),
                    clean_text(row.planning_boundary_type),
                    bool(row.safe_for_dashboard),
                    bool(row.needs_governance_review),
                ]
            )

    return rows


def write_search_index(rows: list[list[Any]]) -> dict[str, Any]:
    PUBLIC_INTELLIGENCE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated_at = datetime.now().isoformat(timespec="seconds")
    payload = {
        "artifactType": "parcel_search_index",
        "generatedAt": generated_at,
        "sourceTables": [PARCELS_TABLE, ZONING_TABLE, QA_TABLE],
        "fields": SEARCH_INDEX_FIELDS,
        "recordCount": len(rows),
        "records": rows,
    }

    SEARCH_INDEX_OUTPUT.write_text(
        json.dumps(payload, default=json_default, separators=(",", ":")),
        encoding="utf-8",
    )

    summary = {
        "generated_at": generated_at,
        "artifact_type": "parcel_search_index",
        "status": "static_artifact_no_api_implemented",
        "source_tables": [PARCELS_TABLE, ZONING_TABLE, QA_TABLE],
        "output": str(SEARCH_INDEX_OUTPUT.relative_to(PROJECT_ROOT)),
        "record_count": len(rows),
        "fields": SEARCH_INDEX_FIELDS,
        "file_size_bytes": SEARCH_INDEX_OUTPUT.stat().st_size,
    }
    SEARCH_INDEX_SUMMARY_OUTPUT.write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


def main() -> None:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)

    engine = create_engine_from_env()
    verify_database(engine)

    logging.info("Exporting static parcel search index.")
    rows = fetch_rows(engine)
    summary = write_search_index(rows)

    duration = time.perf_counter() - started_at
    logging.info("Parcel search records exported: %s", summary["record_count"])
    logging.info("Output: %s", summary["output"])
    logging.info("File size: %s bytes", summary["file_size_bytes"])
    logging.info("Duration: %.2f seconds", duration)
    logging.info("Log written to: %s", log_path)


if __name__ == "__main__":
    main()
