"""Create and validate the Phase 7B parcel flood constraint overlay.

This transform reads public.parcels_enriched and
public.fema_nfhl_flood_zones_clean, creates one flood constraint intelligence
row per parcel in public.parcel_flood_constraint_overlay, and writes QA
artifacts. It does not modify frontend code, SceneView, APIs, parcel base
tables, forecasting, or the Google Cloud TIFF reference.
"""

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

PARCEL_TABLE = "public.parcels_enriched"
FEMA_TABLE = "public.fema_nfhl_flood_zones_clean"
OVERLAY_TABLE = "public.parcel_flood_constraint_overlay"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_parcel_flood_constraint_overlay.sql"

VALIDATION_FILENAME = "parcel_flood_constraint_overlay_validation.json"
SUMMARY_FILENAME = "parcel_flood_constraint_summary.csv"
HIGH_REVIEW_FILENAME = "parcel_flood_constraint_high_review.csv"
PHASE_SUMMARY_FILENAME = "phase7b_parcel_flood_overlay_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create and validate public.parcel_flood_constraint_overlay.",
    )
    parser.add_argument(
        "--skip-overlay",
        action="store_true",
        help="Only run validation against an existing parcel flood overlay table.",
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
    log_path = LOG_DIR / f"create_parcel_flood_constraint_overlay_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before creating the "
            "parcel flood constraint overlay."
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


def verify_database(engine: Engine, skip_overlay: bool) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()

    for required_table in [PARCEL_TABLE, FEMA_TABLE]:
        if not table_exists(engine, required_table):
            raise RuntimeError(f"Required source table {required_table} does not exist.")

    if skip_overlay and not table_exists(engine, OVERLAY_TABLE):
        raise RuntimeError(
            f"--skip-overlay was supplied, but {OVERLAY_TABLE} does not exist."
        )


def execute_overlay_sql(engine: Engine) -> None:
    if not SQL_FILE.exists():
        raise FileNotFoundError(f"Overlay SQL file not found: {SQL_FILE}")

    logging.info("Executing parcel flood overlay SQL: %s", SQL_FILE)
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


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def get_row_count_validation(engine: Engine) -> dict[str, Any]:
    parcel_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {PARCEL_TABLE}"))
    overlay_count = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {OVERLAY_TABLE}"))
    null_official = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {OVERLAY_TABLE} WHERE official_parcel_id IS NULL",
        )
    )
    return {
        "parcel_table": PARCEL_TABLE,
        "overlay_table": OVERLAY_TABLE,
        "parcel_row_count": parcel_count,
        "overlay_row_count": overlay_count,
        "row_count_delta": overlay_count - parcel_count,
        "row_counts_match": overlay_count == parcel_count,
        "null_official_parcel_id_count": null_official,
    }


def get_geometry_validation(engine: Engine) -> dict[str, Any]:
    return {
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {OVERLAY_TABLE} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
            )
        ),
        "null_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {OVERLAY_TABLE} WHERE geometry IS NULL",
            )
        ),
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS parcel_count
            FROM {OVERLAY_TABLE}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY parcel_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS parcel_count
            FROM {OVERLAY_TABLE}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
    }


def get_core_counts(engine: Engine) -> dict[str, Any]:
    rows = fetch_rows(
        engine,
        f"""
        SELECT
          COUNT(*) AS total_parcels,
          COUNT(*) FILTER (WHERE floodplain_present) AS floodplain_parcel_count,
          COUNT(*) FILTER (WHERE floodway_present) AS floodway_parcel_count,
          COUNT(*) FILTER (WHERE sfha_present) AS sfha_parcel_count,
          COUNT(*) FILTER (WHERE moderate_flood_present) AS moderate_flood_parcel_count,
          COUNT(*) FILTER (WHERE minimal_flood_present) AS minimal_flood_parcel_count,
          COUNT(*) FILTER (WHERE flood_review_required) AS review_required_count,
          COUNT(*) FILTER (WHERE buildability_impact IN ('high', 'severe'))
            AS high_or_severe_buildability_count,
          COUNT(*) FILTER (WHERE flood_severity_class = 'none') AS no_flood_constraint_count,
          COUNT(*) FILTER (WHERE flood_severity_class = 'severe') AS severe_count,
          COUNT(*) FILTER (WHERE flood_severity_class = 'high') AS high_count,
          COUNT(*) FILTER (WHERE flood_severity_class = 'moderate') AS moderate_count,
          COUNT(*) FILTER (WHERE flood_severity_class = 'low') AS low_count
        FROM {OVERLAY_TABLE}
        """,
    )
    return dict(rows[0])


def get_distribution(engine: Engine, column_name: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          {column_name} AS value,
          COUNT(*) AS parcel_count,
          ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM {OVERLAY_TABLE}), 0), 4)
            AS parcel_percentage,
          COUNT(*) FILTER (WHERE flood_review_required) AS review_required_count,
          ROUND(AVG(percent_parcel_constrained)::numeric, 4) AS avg_percent_constrained,
          ROUND(MAX(percent_parcel_constrained)::numeric, 4) AS max_percent_constrained
        FROM {OVERLAY_TABLE}
        GROUP BY {column_name}
        ORDER BY parcel_count DESC, value
        """,
    )


def get_percent_sanity(engine: Engine) -> dict[str, Any]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          ROUND(MIN(percent_parcel_constrained)::numeric, 6) AS min_percent_constrained,
          ROUND(MAX(percent_parcel_constrained)::numeric, 6) AS max_percent_constrained,
          ROUND(AVG(percent_parcel_constrained)::numeric, 6) AS avg_percent_constrained,
          ROUND(MIN(percent_parcel_floodway)::numeric, 6) AS min_percent_floodway,
          ROUND(MAX(percent_parcel_floodway)::numeric, 6) AS max_percent_floodway,
          ROUND(MIN(percent_parcel_sfha)::numeric, 6) AS min_percent_sfha,
          ROUND(MAX(percent_parcel_sfha)::numeric, 6) AS max_percent_sfha,
          COUNT(*) FILTER (
            WHERE percent_parcel_constrained < 0
               OR percent_parcel_constrained > 100
               OR percent_parcel_floodway < 0
               OR percent_parcel_floodway > 100
               OR percent_parcel_sfha < 0
               OR percent_parcel_sfha > 100
          ) AS out_of_range_percent_count
        FROM {OVERLAY_TABLE}
        """,
    )[0]


def get_summary_rows(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          flood_severity_class,
          buildability_impact,
          dominant_flood_zone,
          dominant_flood_constraint_type,
          COUNT(*) AS parcel_count,
          COUNT(*) FILTER (WHERE flood_review_required) AS review_required_count,
          COUNT(*) FILTER (WHERE floodway_present) AS floodway_parcel_count,
          COUNT(*) FILTER (WHERE sfha_present) AS sfha_parcel_count,
          ROUND(AVG(percent_parcel_constrained)::numeric, 4) AS avg_percent_constrained,
          ROUND(MAX(percent_parcel_constrained)::numeric, 4) AS max_percent_constrained,
          ROUND(AVG(flood_constraint_score)::numeric, 2) AS avg_constraint_score,
          ROUND(MAX(flood_constraint_score)::numeric, 2) AS max_constraint_score
        FROM {OVERLAY_TABLE}
        GROUP BY
          flood_severity_class,
          buildability_impact,
          dominant_flood_zone,
          dominant_flood_constraint_type
        ORDER BY
          CASE flood_severity_class
            WHEN 'severe' THEN 1
            WHEN 'high' THEN 2
            WHEN 'moderate' THEN 3
            WHEN 'low' THEN 4
            WHEN 'none' THEN 5
            ELSE 6
          END,
          parcel_count DESC,
          dominant_flood_zone
        """,
    )


def get_high_review_rows(engine: Engine, limit: int = 1000) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT
          official_parcel_id,
          objectid_1,
          pin14,
          flood_severity_class,
          buildability_impact,
          dominant_flood_zone,
          flood_zone_codes,
          floodway_present,
          sfha_present,
          moderate_flood_present,
          parcel_area_acres,
          flood_constrained_area_acres,
          floodway_area_acres,
          sfha_area_acres,
          percent_parcel_constrained,
          percent_parcel_floodway,
          percent_parcel_sfha,
          flood_review_required,
          flood_constraint_score,
          overlay_confidence
        FROM {OVERLAY_TABLE}
        WHERE flood_review_required
           OR buildability_impact IN ('high', 'severe')
        ORDER BY
          CASE buildability_impact
            WHEN 'severe' THEN 1
            WHEN 'high' THEN 2
            WHEN 'moderate' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          flood_constraint_score DESC,
          percent_parcel_constrained DESC NULLS LAST,
          official_parcel_id
        LIMIT {limit}
        """,
    )


def get_index_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'parcel_flood_constraint_overlay'
        ORDER BY indexname
        """,
    )


def get_sample_rows(engine: Engine) -> dict[str, list[dict[str, Any]]]:
    severe = fetch_rows(
        engine,
        f"""
        SELECT official_parcel_id, pin14, dominant_flood_zone, flood_severity_class,
               buildability_impact, percent_parcel_constrained, flood_constraint_score
        FROM {OVERLAY_TABLE}
        WHERE flood_severity_class = 'severe'
        ORDER BY flood_constraint_score DESC, percent_parcel_floodway DESC NULLS LAST
        LIMIT 10
        """,
    )
    no_constraint = fetch_rows(
        engine,
        f"""
        SELECT official_parcel_id, pin14, dominant_flood_zone, flood_severity_class,
               buildability_impact, percent_parcel_constrained, flood_constraint_score
        FROM {OVERLAY_TABLE}
        WHERE flood_severity_class = 'none'
        ORDER BY official_parcel_id
        LIMIT 10
        """,
    )
    return {"severe_examples": severe, "no_constraint_examples": no_constraint}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        with path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def write_csv_all(filename: str, rows: list[dict[str, Any]]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        if not rows:
            path.write_text("", encoding="utf-8")
            continue
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)

    engine = create_engine_from_env()
    verify_database(engine, args.skip_overlay)
    if not args.skip_overlay:
        execute_overlay_sql(engine)

    row_count_validation = get_row_count_validation(engine)
    geometry_validation = get_geometry_validation(engine)
    core_counts = get_core_counts(engine)
    summary_rows = get_summary_rows(engine)
    high_review_rows = get_high_review_rows(engine)
    percent_sanity = get_percent_sanity(engine)

    validation = {
        "generated_at": datetime.now().isoformat(),
        "source_tables": {
            "parcels": PARCEL_TABLE,
            "fema_flood_zones": FEMA_TABLE,
        },
        "overlay_table": OVERLAY_TABLE,
        "row_count_validation": row_count_validation,
        "geometry_validation": geometry_validation,
        "core_counts": core_counts,
        "severity_distribution": get_distribution(engine, "flood_severity_class"),
        "buildability_impact_distribution": get_distribution(engine, "buildability_impact"),
        "dominant_flood_zone_distribution": get_distribution(engine, "dominant_flood_zone"),
        "overlay_confidence_distribution": get_distribution(engine, "overlay_confidence"),
        "percent_constrained_sanity_check": percent_sanity,
        "indexes": get_index_summary(engine),
        "sample_rows": get_sample_rows(engine),
        "qa_pass": {
            "row_count_equals_parcels": row_count_validation["row_counts_match"],
            "no_null_official_parcel_id": (
                row_count_validation["null_official_parcel_id_count"] == 0
            ),
            "srid_4326_only": geometry_validation["srid_counts"]
            == [
                {
                    "srid": 4326,
                    "parcel_count": row_count_validation["overlay_row_count"],
                }
            ],
            "no_invalid_geometries": geometry_validation["invalid_geometry_count"] == 0,
            "percentages_in_range": percent_sanity["out_of_range_percent_count"] == 0,
        },
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "log_path": str(log_path),
    }

    phase_summary = {
        "generated_at": datetime.now().isoformat(),
        "phase": "Phase 7B Parcel Flood Constraint Overlay",
        "overlay_table": OVERLAY_TABLE,
        "source_tables": validation["source_tables"],
        "row_count_validation": row_count_validation,
        "core_counts": core_counts,
        "severity_distribution": validation["severity_distribution"],
        "buildability_impact_distribution": validation["buildability_impact_distribution"],
        "dominant_flood_zone_distribution": validation["dominant_flood_zone_distribution"],
        "percent_constrained_sanity_check": percent_sanity,
        "qa_pass": validation["qa_pass"],
        "readiness": {
            "ready_for_flood_constraint_api_planning": all(validation["qa_pass"].values()),
            "next_phase": "Flood constraint API contract and frontend planning",
            "not_included": [
                "frontend flood panels",
                "SceneView flood layer",
                "FastAPI flood endpoints",
                "forecasting or prediction",
                "Google Cloud TIFF comparison",
            ],
        },
        "artifact_paths": {
            "validation_json": [
                str(PIPELINE_OUTPUT_DIR / VALIDATION_FILENAME),
                str(ROOT_OUTPUT_DIR / VALIDATION_FILENAME),
            ],
            "summary_csv": [
                str(PIPELINE_OUTPUT_DIR / SUMMARY_FILENAME),
                str(ROOT_OUTPUT_DIR / SUMMARY_FILENAME),
            ],
            "high_review_csv": [
                str(PIPELINE_OUTPUT_DIR / HIGH_REVIEW_FILENAME),
                str(ROOT_OUTPUT_DIR / HIGH_REVIEW_FILENAME),
            ],
            "phase_summary_json": [
                str(PIPELINE_OUTPUT_DIR / PHASE_SUMMARY_FILENAME),
                str(ROOT_OUTPUT_DIR / PHASE_SUMMARY_FILENAME),
            ],
        },
    }

    write_json_all(VALIDATION_FILENAME, validation)
    write_json_all(PHASE_SUMMARY_FILENAME, phase_summary)
    write_csv_all(SUMMARY_FILENAME, summary_rows)
    write_csv_all(HIGH_REVIEW_FILENAME, high_review_rows)

    logging.info(
        "Wrote parcel flood overlay validation to %s and %s",
        PIPELINE_OUTPUT_DIR / VALIDATION_FILENAME,
        ROOT_OUTPUT_DIR / VALIDATION_FILENAME,
    )
    logging.info("Parcel flood overlay row count: %s", row_count_validation["overlay_row_count"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
