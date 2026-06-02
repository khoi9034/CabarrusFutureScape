"""Profile the ingested CFS zoning table in local PostGIS.

This script reads public.zoning and writes static profiling artifacts for the
Phase 2 zoning overlay pilot. It does not modify the frontend dashboard, build
APIs, ingest additional layers, or perform parcel-zoning joins.
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
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_SCHEMA = "public"
DEFAULT_TABLE = "zoning"
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"

SUMMARY_OUTPUT = OUTPUT_DIR / "zoning_profile_summary.json"
COLUMN_PROFILE_OUTPUT = OUTPUT_DIR / "zoning_column_profile.csv"

ZONING_FIELD_TOKENS = (
    "category",
    "class",
    "code",
    "district",
    "general",
    "gen",
    "name",
    "type",
    "zone",
    "zoning",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile the local PostGIS public.zoning table.",
    )
    parser.add_argument("--schema", default=DEFAULT_SCHEMA)
    parser.add_argument("--table", default=DEFAULT_TABLE)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"inspect_zoning_postgis_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before profiling zoning."
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


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def qualified_table(schema: str, table: str) -> str:
    return f"{quote_identifier(schema)}.{quote_identifier(table)}"


def fetch_columns(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT
          ordinal_position,
          column_name,
          data_type,
          udt_name,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :table
        ORDER BY ordinal_position
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(sql, {"schema": schema, "table": table}).mappings()
        columns = [dict(row) for row in rows]

    if not columns:
        raise RuntimeError(f"No columns found for {schema}.{table}.")
    return columns


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def profile_columns(
    engine: Engine,
    schema: str,
    table: str,
    columns: list[dict[str, Any]],
    total_rows: int,
) -> list[dict[str, Any]]:
    table_name = qualified_table(schema, table)
    profiles: list[dict[str, Any]] = []

    for column in columns:
        column_name = column["column_name"]
        quoted_column = quote_identifier(column_name)
        null_count = int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {table_name} WHERE {quoted_column} IS NULL",
            )
        )
        non_null_count = total_rows - null_count
        null_percentage = round((null_count / total_rows) * 100, 4) if total_rows else 0
        role_tags = classify_column(column_name)

        profiles.append(
            {
                "ordinal_position": int(column["ordinal_position"]),
                "column_name": column_name,
                "data_type": column["data_type"],
                "udt_name": column["udt_name"],
                "is_nullable": column["is_nullable"],
                "null_count": null_count,
                "non_null_count": non_null_count,
                "null_percentage": null_percentage,
                "role_tags": role_tags,
            }
        )

    return profiles


def classify_column(column_name: str) -> list[str]:
    name = column_name.lower()
    role_tags: list[str] = []

    if name == "geometry":
        role_tags.append("geometry")
    if name == "objectid" or name.endswith("_id") or name.endswith("id"):
        role_tags.append("likely_identifier")
    if any(token in name for token in ZONING_FIELD_TOKENS):
        role_tags.append("likely_zoning_field")
    if "shape" in name or name in {"starea", "stlength"}:
        role_tags.append("source_shape_measure")

    return role_tags


def get_geometry_profile(engine: Engine, schema: str, table: str) -> dict[str, Any]:
    table_name = qualified_table(schema, table)
    bbox_rows = fetch_rows(
        engine,
        f"""
        SELECT
          ST_XMin(extent) AS xmin,
          ST_YMin(extent) AS ymin,
          ST_XMax(extent) AS xmax,
          ST_YMax(extent) AS ymax
        FROM (
          SELECT ST_Extent(geometry)::box2d AS extent
          FROM {table_name}
          WHERE geometry IS NOT NULL
        ) AS bounds
        """,
    )

    return {
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {table_name}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {table_name}
            GROUP BY ST_SRID(geometry)
            ORDER BY srid
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {table_name} WHERE NOT ST_IsValid(geometry)",
            )
        ),
        "null_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {table_name} WHERE geometry IS NULL",
            )
        ),
        "bounding_box": bbox_rows[0] if bbox_rows else {},
    }


def get_spatial_indexes(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = :schema
          AND tablename = :table
          AND indexdef ILIKE '%gist%'
        ORDER BY indexname
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(sql, {"schema": schema, "table": table}).mappings()
        return [dict(row) for row in rows]


def get_zoning_class_summary(
    engine: Engine,
    schema: str,
    table: str,
    column_profiles: list[dict[str, Any]],
) -> dict[str, Any]:
    table_name = qualified_table(schema, table)
    column_names = {profile["column_name"] for profile in column_profiles}
    zoning_code_column = "zoningcode" if "zoningcode" in column_names else None
    zoning_general_column = "zoning_gen" if "zoning_gen" in column_names else None

    if not zoning_code_column and not zoning_general_column:
        return {
            "likely_zoning_code_column": None,
            "likely_zoning_general_column": None,
            "unique_zoning_class_count": 0,
            "zoning_classes": [],
        }

    code_expr = (
        f"NULLIF(btrim({quote_identifier(zoning_code_column)}), '')"
        if zoning_code_column
        else "NULL::text"
    )
    general_expr = (
        f"NULLIF(btrim({quote_identifier(zoning_general_column)}), '')"
        if zoning_general_column
        else "NULL::text"
    )

    zoning_classes = fetch_rows(
        engine,
        f"""
        SELECT
          {code_expr} AS zoning_code,
          {general_expr} AS zoning_general,
          COUNT(*) AS feature_count
        FROM {table_name}
        GROUP BY {code_expr}, {general_expr}
        ORDER BY feature_count DESC, zoning_code, zoning_general
        """,
    )

    return {
        "likely_zoning_code_column": zoning_code_column,
        "likely_zoning_general_column": zoning_general_column,
        "unique_zoning_class_count": len(zoning_classes),
        "zoning_classes": zoning_classes,
    }


def write_column_profile_csv(column_profiles: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "ordinal_position",
        "column_name",
        "data_type",
        "udt_name",
        "is_nullable",
        "null_count",
        "non_null_count",
        "null_percentage",
        "role_tags",
    ]

    with COLUMN_PROFILE_OUTPUT.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for profile in column_profiles:
            row = profile.copy()
            row["role_tags"] = "|".join(profile["role_tags"])
            writer.writerow(row)


def write_summary_json(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
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
    logging.info("Starting CFS zoning PostGIS profile.")
    logging.info("Log file: %s", log_path)

    try:
        engine = create_engine_from_env()
        table_name = qualified_table(args.schema, args.table)
        total_rows = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {table_name}"))
        columns = fetch_columns(engine, args.schema, args.table)
        column_profiles = profile_columns(
            engine,
            args.schema,
            args.table,
            columns,
            total_rows,
        )
        geometry_profile = get_geometry_profile(engine, args.schema, args.table)
        zoning_class_summary = get_zoning_class_summary(
            engine,
            args.schema,
            args.table,
            column_profiles,
        )
        spatial_indexes = get_spatial_indexes(engine, args.schema, args.table)
        duration_seconds = round(time.perf_counter() - start_time, 2)

        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "schema": args.schema,
                "table": args.table,
            },
            "total_row_count": total_rows,
            "column_count": len(columns),
            "columns": columns,
            **geometry_profile,
            "likely_zoning_fields": [
                profile["column_name"]
                for profile in column_profiles
                if "likely_zoning_field" in profile["role_tags"]
            ],
            "zoning_class_summary": zoning_class_summary,
            "spatial_indexes": spatial_indexes,
            "spatial_index_exists": bool(spatial_indexes),
            "high_null_columns": [
                {
                    "column_name": profile["column_name"],
                    "null_percentage": profile["null_percentage"],
                    "role_tags": profile["role_tags"],
                }
                for profile in column_profiles
                if profile["null_percentage"] >= 50
            ],
            "duration_seconds": duration_seconds,
            "log_path": str(log_path),
            "outputs": {
                "summary_json": str(SUMMARY_OUTPUT),
                "column_profile_csv": str(COLUMN_PROFILE_OUTPUT),
            },
        }

        write_column_profile_csv(column_profiles)
        write_summary_json(summary)
        engine.dispose()

        logging.info("Total zoning rows: %s", total_rows)
        logging.info("Geometry types: %s", geometry_profile["geometry_type_counts"])
        logging.info("SRID distribution: %s", geometry_profile["srid_counts"])
        logging.info(
            "Invalid geometry count: %s",
            geometry_profile["invalid_geometry_count"],
        )
        logging.info(
            "Unique zoning classes: %s",
            zoning_class_summary["unique_zoning_class_count"],
        )
        logging.info("Wrote summary JSON: %s", SUMMARY_OUTPUT)
        logging.info("Wrote column profile CSV: %s", COLUMN_PROFILE_OUTPUT)
        logging.info("Profile duration: %s seconds", duration_seconds)
        return 0
    except Exception:
        logging.exception("CFS zoning PostGIS profile failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
