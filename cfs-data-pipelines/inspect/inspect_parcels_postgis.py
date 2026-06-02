"""Profile the ingested CFS parcels table in local PostGIS.

This script reads the already-ingested public.parcels table and writes static
profiling artifacts for Phase 2 Parcel Intelligence planning. It does not
ingest new data, modify the frontend dashboard, or connect any APIs.
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
DEFAULT_TABLE = "parcels"
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"

SUMMARY_OUTPUT = OUTPUT_DIR / "parcels_profile_summary.json"
COLUMN_PROFILE_OUTPUT = OUTPUT_DIR / "parcels_column_profile.csv"

LIKELY_ID_EXACT_NAMES = {
    "id",
    "objectid",
    "objectid_1",
    "oldpin",
    "parcel_id",
    "parcelid",
    "pin",
    "pin14",
    "propertyreal_id",
}
ECONOMIC_TOKENS = (
    "assess",
    "buildingvalue",
    "deferredvalue",
    "landvalue",
    "market",
    "obxfvalue",
    "tax",
    "value",
)
SUBDIVISION_TOKENS = ("subdiv", "subdivision", "nbh", "neighborhood")
ADDRESS_TOKENS = ("address", "addr", "city", "location", "situs", "street", "zip")
ZONING_LAND_USE_TOKENS = ("land_use", "landuse", "luc", "usecode", "zone", "zoning")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile the local PostGIS public.parcels table.",
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
    log_path = LOG_DIR / f"inspect_parcels_postgis_{timestamp}.log"

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
            "CFS_POSTGRES_PASSWORD is not set. Export it before profiling parcels."
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
    column_profiles: list[dict[str, Any]] = []

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
        duplicate_profile = (
            get_duplicate_profile(engine, table_name, quoted_column)
            if "likely_identifier" in role_tags
            else None
        )

        column_profiles.append(
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
                "duplicate_value_count": duplicate_profile["duplicate_value_count"]
                if duplicate_profile
                else "",
                "duplicate_excess_rows": duplicate_profile["duplicate_excess_rows"]
                if duplicate_profile
                else "",
                "distinct_non_null_count": duplicate_profile["distinct_non_null_count"]
                if duplicate_profile
                else "",
            }
        )

    return column_profiles


def classify_column(column_name: str) -> list[str]:
    name = column_name.lower()
    role_tags: list[str] = []

    if is_likely_identifier(name):
        role_tags.append("likely_identifier")
    if contains_any(name, ECONOMIC_TOKENS):
        role_tags.append("economic_value")
    if contains_any(name, SUBDIVISION_TOKENS):
        role_tags.append("subdivision_neighborhood")
    if contains_any(name, ADDRESS_TOKENS):
        role_tags.append("address_location")
    if contains_any(name, ZONING_LAND_USE_TOKENS):
        role_tags.append("zoning_land_use")
    if name == "geometry":
        role_tags.append("geometry")

    return role_tags


def is_likely_identifier(name: str) -> bool:
    if name in LIKELY_ID_EXACT_NAMES:
        return True

    return (
        "parcel" in name
        or "pin" in name
        or name.endswith("_id")
        or name.endswith("id")
        or name.startswith("objectid")
    )


def contains_any(value: str, tokens: tuple[str, ...]) -> bool:
    return any(token in value for token in tokens)


def get_duplicate_profile(
    engine: Engine,
    table_name: str,
    quoted_column: str,
) -> dict[str, int]:
    sql = f"""
        WITH grouped_values AS (
          SELECT {quoted_column} AS value, COUNT(*) AS row_count
          FROM {table_name}
          WHERE {quoted_column} IS NOT NULL
          GROUP BY {quoted_column}
        )
        SELECT
          COUNT(*) AS distinct_non_null_count,
          COUNT(*) FILTER (WHERE row_count > 1) AS duplicate_value_count,
          COALESCE(SUM(row_count - 1) FILTER (WHERE row_count > 1), 0) AS duplicate_excess_rows
        FROM grouped_values
    """
    row = fetch_rows(engine, sql)[0]
    return {key: int(value or 0) for key, value in row.items()}


def get_geometry_profile(engine: Engine, schema: str, table: str) -> dict[str, Any]:
    table_name = qualified_table(schema, table)
    geometry_type_counts = fetch_rows(
        engine,
        f"""
        SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
        FROM {table_name}
        GROUP BY ST_GeometryType(geometry)
        ORDER BY feature_count DESC
        """,
    )
    srid_counts = fetch_rows(
        engine,
        f"""
        SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
        FROM {table_name}
        GROUP BY ST_SRID(geometry)
        ORDER BY srid
        """,
    )
    invalid_geometry_count = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {table_name} WHERE NOT ST_IsValid(geometry)",
        )
    )
    null_geometry_count = int(
        fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {table_name} WHERE geometry IS NULL",
        )
    )
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
        "geometry_type_counts": normalize_json_value(geometry_type_counts),
        "srid_counts": normalize_json_value(srid_counts),
        "invalid_geometry_count": invalid_geometry_count,
        "null_geometry_count": null_geometry_count,
        "bounding_box": normalize_json_value(bbox_rows[0] if bbox_rows else {}),
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


def get_economic_field_stats(
    engine: Engine,
    schema: str,
    table: str,
    column_profiles: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    table_name = qualified_table(schema, table)
    numeric_types = {
        "bigint",
        "double precision",
        "integer",
        "numeric",
        "real",
        "smallint",
    }
    text_types = {"character varying", "text"}
    stats: dict[str, dict[str, Any]] = {}

    for profile in column_profiles:
        if "economic_value" not in profile["role_tags"]:
            continue
        column_name = profile["column_name"]
        quoted_column = quote_identifier(column_name)
        if profile["data_type"] in numeric_types:
            stats[column_name] = get_numeric_column_stats(
                engine,
                table_name,
                quoted_column,
            )
            continue

        if profile["data_type"] in text_types:
            stats[column_name] = get_numeric_text_column_stats(
                engine,
                table_name,
                quoted_column,
            )

    return stats


def get_numeric_column_stats(
    engine: Engine,
    table_name: str,
    quoted_column: str,
) -> dict[str, Any]:
    row = fetch_rows(
        engine,
        f"""
        SELECT
          COUNT({quoted_column}) AS numeric_value_count,
          MIN({quoted_column}) AS min_value,
          MAX({quoted_column}) AS max_value,
          AVG({quoted_column}) AS avg_value
        FROM {table_name}
        WHERE {quoted_column} IS NOT NULL
        """,
    )[0]
    return normalize_json_value(row)


def get_numeric_text_column_stats(
    engine: Engine,
    table_name: str,
    quoted_column: str,
) -> dict[str, Any]:
    # ArcGIS REST GeoJSON can coerce numeric parcel values to text. Keep the raw
    # table intact, but profile whether these fields can be safely cast later.
    row = fetch_rows(
        engine,
        f"""
        WITH parsed_values AS (
          SELECT
            CASE
              WHEN trim({quoted_column}) ~ '^[-+]?[0-9,]+(\\.[0-9]+)?$'
              THEN replace(trim({quoted_column}), ',', '')::numeric
              ELSE NULL
            END AS numeric_value,
            {quoted_column} AS raw_value
          FROM {table_name}
          WHERE {quoted_column} IS NOT NULL
        )
        SELECT
          COUNT(*) AS non_null_text_count,
          COUNT(numeric_value) AS parseable_numeric_count,
          COUNT(*) - COUNT(numeric_value) AS non_parseable_count,
          MIN(numeric_value) AS min_value,
          MAX(numeric_value) AS max_value,
          AVG(numeric_value) AS avg_value
        FROM parsed_values
        """,
    )[0]
    return normalize_json_value(row)


def group_columns_by_role(
    column_profiles: list[dict[str, Any]],
) -> dict[str, list[str]]:
    grouped = {
        "likely_identifier_fields": [],
        "economic_value_fields": [],
        "subdivision_neighborhood_fields": [],
        "address_location_fields": [],
        "zoning_land_use_fields": [],
    }
    role_to_group = {
        "likely_identifier": "likely_identifier_fields",
        "economic_value": "economic_value_fields",
        "subdivision_neighborhood": "subdivision_neighborhood_fields",
        "address_location": "address_location_fields",
        "zoning_land_use": "zoning_land_use_fields",
    }

    for profile in column_profiles:
        for role, group_name in role_to_group.items():
            if role in profile["role_tags"]:
                grouped[group_name].append(profile["column_name"])

    return grouped


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
        "distinct_non_null_count",
        "duplicate_value_count",
        "duplicate_excess_rows",
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
    logging.info("Starting CFS parcels PostGIS profile.")
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
        role_groups = group_columns_by_role(column_profiles)
        economic_field_stats = get_economic_field_stats(
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
            "spatial_indexes": spatial_indexes,
            "spatial_index_exists": bool(spatial_indexes),
            **role_groups,
            "identifier_duplicate_profiles": {
                profile["column_name"]: {
                    "distinct_non_null_count": profile["distinct_non_null_count"],
                    "duplicate_value_count": profile["duplicate_value_count"],
                    "duplicate_excess_rows": profile["duplicate_excess_rows"],
                    "null_percentage": profile["null_percentage"],
                }
                for profile in column_profiles
                if "likely_identifier" in profile["role_tags"]
            },
            "economic_field_stats": economic_field_stats,
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

        logging.info("Total rows: %s", total_rows)
        logging.info(
            "Geometry types: %s",
            geometry_profile["geometry_type_counts"],
        )
        logging.info("SRID distribution: %s", geometry_profile["srid_counts"])
        logging.info(
            "Invalid geometry count: %s",
            geometry_profile["invalid_geometry_count"],
        )
        logging.info("Spatial index exists: %s", bool(spatial_indexes))
        logging.info("Wrote summary JSON: %s", SUMMARY_OUTPUT)
        logging.info("Wrote column profile CSV: %s", COLUMN_PROFILE_OUTPUT)
        logging.info("Profile duration: %s seconds", duration_seconds)
        return 0
    except Exception:
        logging.exception("CFS parcels PostGIS profile failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
