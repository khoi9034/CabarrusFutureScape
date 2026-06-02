"""Create and validate the CFS multi-jurisdiction zoning foundation."""

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

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PIPELINE_ROOT / "config" / "zoning_sources.json"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_zoning_jurisdictional_clean.sql"

VALIDATION_OUTPUT = OUTPUT_DIR / "zoning_jurisdictional_clean_validation.json"
CLASS_SUMMARY_OUTPUT = OUTPUT_DIR / "zoning_jurisdictional_class_summary.csv"
SCHEMA_COMPARISON_OUTPUT = OUTPUT_DIR / "zoning_jurisdictional_schema_comparison.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create public.zoning_jurisdictional_clean.")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--skip-transform", action="store_true")
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"create_zoning_jurisdictional_clean_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def load_sources(config_path: Path) -> list[dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = config.get("sources", [])
    if not sources:
        raise ValueError(f"No zoning sources found in {config_path}")
    return sources


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError("CFS_POSTGRES_PASSWORD is not set.")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def fetch_scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def verify_database(engine: Engine, sources: list[dict[str, Any]]) -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.execute(text("SELECT postgis_full_version()")).scalar_one()
        missing = []
        for source in sources:
            table_name = f"{source['schema']}.{source['raw_table']}"
            exists = connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": table_name},
            ).scalar_one()
            if not exists:
                missing.append(table_name)
    if missing:
        raise RuntimeError(f"Missing raw zoning table(s): {', '.join(missing)}")


def execute_transform_sql(engine: Engine) -> None:
    logging.info("Executing transform SQL: %s", SQL_FILE)
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


def get_columns(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT column_name, data_type, udt_name, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :table
        ORDER BY ordinal_position
        """,
        {"schema": schema, "table": table},
    )


def get_raw_source_summary(engine: Engine, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries = []
    zoning_field_candidates = {
        "zoningcode",
        "zoning_gen",
        "zoning",
        "base_distr",
        "conditiona",
        "zoning_typ",
    }
    for source in sources:
        table_name = f"public.{source['raw_table']}"
        columns = get_columns(engine, source["schema"], source["raw_table"])
        column_names = {column["column_name"] for column in columns}
        summaries.append(
            {
                "id": source["id"],
                "jurisdiction_name": source["jurisdiction_name"],
                "raw_table": table_name,
                "source_url": source["url"],
                "feature_count": int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {table_name}")),
                "geometry_type_counts": fetch_rows(
                    engine,
                    f"""
                    SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
                    FROM {table_name}
                    GROUP BY ST_GeometryType(geometry)
                    ORDER BY feature_count DESC
                    """,
                ),
                "invalid_geometry_count": int(
                    fetch_scalar(
                        engine,
                        f"SELECT COUNT(*) FROM {table_name} WHERE NOT ST_IsValid(geometry)",
                    )
                ),
                "zoning_fields_found": sorted(column_names & zoning_field_candidates),
                "columns": columns,
            }
        )
    return summaries


def get_clean_summary(engine: Engine) -> dict[str, Any]:
    return {
        "total_normalized_zoning_polygon_count": int(
            fetch_scalar(engine, "SELECT COUNT(*) FROM public.zoning_jurisdictional_clean")
        ),
        "geometry_type_counts": fetch_rows(
            engine,
            """
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM public.zoning_jurisdictional_clean
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            """
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM public.zoning_jurisdictional_clean
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                "SELECT COUNT(*) FROM public.zoning_jurisdictional_clean WHERE NOT ST_IsValid(geometry)",
            )
        ),
        "feature_count_per_jurisdiction": fetch_rows(
            engine,
            """
            SELECT jurisdiction_name, COUNT(*) AS feature_count
            FROM public.zoning_jurisdictional_clean
            GROUP BY jurisdiction_name
            ORDER BY jurisdiction_name
            """,
        ),
        "zoning_class_count_per_jurisdiction": fetch_rows(
            engine,
            """
            SELECT
              jurisdiction_name,
              COUNT(*) AS feature_count,
              COUNT(DISTINCT (
                zoning_code_raw,
                zoning_general_raw,
                zoning_type_raw,
                base_district_raw,
                conditional_raw
              )) AS zoning_class_count
            FROM public.zoning_jurisdictional_clean
            GROUP BY jurisdiction_name
            ORDER BY jurisdiction_name
            """,
        ),
        "general_category_distribution": fetch_rows(
            engine,
            """
            SELECT jurisdiction_name, zoning_general_normalized, COUNT(*) AS feature_count
            FROM public.zoning_jurisdictional_clean
            GROUP BY jurisdiction_name, zoning_general_normalized
            ORDER BY jurisdiction_name, feature_count DESC
            """,
        ),
        "index_summary": fetch_rows(
            engine,
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'zoning_jurisdictional_clean'
            ORDER BY indexname
            """,
        ),
    }


def get_class_summary(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT
          jurisdiction_name,
          zoning_code_raw,
          zoning_general_raw,
          zoning_type_raw,
          base_district_raw,
          conditional_raw,
          zoning_label_normalized,
          zoning_general_normalized,
          COUNT(*) AS feature_count,
          ROUND(SUM(ST_Area(geometry::geography) / 4046.8564224)::numeric, 2)
            AS total_area_acres
        FROM public.zoning_jurisdictional_clean
        GROUP BY
          jurisdiction_name,
          zoning_code_raw,
          zoning_general_raw,
          zoning_type_raw,
          base_district_raw,
          conditional_raw,
          zoning_label_normalized,
          zoning_general_normalized
        ORDER BY jurisdiction_name, feature_count DESC, zoning_label_normalized
        """,
    )


def build_schema_comparison(
    raw_summaries: list[dict[str, Any]],
    sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_source = {
        summary["id"]: {
            column["column_name"]: column["data_type"]
            for column in summary["columns"]
        }
        for summary in raw_summaries
    }
    all_columns = sorted(
        {
            column_name
            for columns in by_source.values()
            for column_name in columns
        }
    )
    rows: list[dict[str, Any]] = []
    for column_name in all_columns:
        row: dict[str, Any] = {"column_name": column_name}
        for source in sources:
            row[source["id"]] = by_source[source["id"]].get(column_name, "")
        rows.append(row)
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames or list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(normalize_json_value(row))


def write_summary(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    VALIDATION_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


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


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS zoning_jurisdictional_clean transform.")
    logging.info("Log file: %s", log_path)
    try:
        sources = load_sources(args.config)
        engine = create_engine_from_env()
        verify_database(engine, sources)
        if args.skip_transform:
            logging.warning("Skipping transform SQL because --skip-transform was supplied.")
        else:
            execute_transform_sql(engine)

        raw_summaries = get_raw_source_summary(engine, sources)
        clean_summary = get_clean_summary(engine)
        class_summary = get_class_summary(engine)
        schema_comparison = build_schema_comparison(raw_summaries, sources)
        duration_seconds = round(time.perf_counter() - start_time, 2)
        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "config_path": str(args.config),
            "raw_source_summary": raw_summaries,
            "clean_summary": clean_summary,
            "schema_comparison_columns": schema_comparison,
            "duration_seconds": duration_seconds,
            "log_path": str(log_path),
            "outputs": {
                "validation_json": str(VALIDATION_OUTPUT),
                "class_summary_csv": str(CLASS_SUMMARY_OUTPUT),
                "schema_comparison_csv": str(SCHEMA_COMPARISON_OUTPUT),
            },
        }
        write_summary(summary)
        write_csv(CLASS_SUMMARY_OUTPUT, class_summary)
        write_csv(
            SCHEMA_COMPARISON_OUTPUT,
            schema_comparison,
            ["column_name", *[source["id"] for source in sources]],
        )
        engine.dispose()
        logging.info(
            "Normalized zoning polygon count: %s",
            clean_summary["total_normalized_zoning_polygon_count"],
        )
        logging.info("Wrote validation JSON: %s", VALIDATION_OUTPUT)
        logging.info("Wrote class summary CSV: %s", CLASS_SUMMARY_OUTPUT)
        logging.info("Wrote schema comparison CSV: %s", SCHEMA_COMPARISON_OUTPUT)
        logging.info("Transform duration: %s seconds", duration_seconds)
        return 0
    except Exception:
        logging.exception("CFS zoning_jurisdictional_clean transform failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
