"""Profile the raw FEMA NFHL flood hazard zones table in PostGIS."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine

DEFAULT_SCHEMA = "public"
DEFAULT_TABLE = "fema_nfhl_flood_zones_raw"
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
PROFILE_OUTPUT = OUTPUT_DIR / "fema_nfhl_flood_zones_profile.json"
COLUMNS_OUTPUT = OUTPUT_DIR / "fema_nfhl_flood_zones_columns.csv"

FLOOD_ZONE_TOKENS = ("fld_zone", "zone", "sfha", "flood", "hazard")
FLOODWAY_TOKENS = ("floodway", "zone_subty", "fld_zone")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile public.fema_nfhl_flood_zones_raw.",
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
    log_path = LOG_DIR / f"inspect_fema_nfhl_flood_zones_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before profiling FEMA NFHL."
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


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def fetch_scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def fetch_columns(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    columns = fetch_rows(
        engine,
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
        """,
        {"schema": schema, "table": table},
    )
    if not columns:
        raise RuntimeError(f"No columns found for {schema}.{table}.")
    return columns


def classify_column(column_name: str) -> list[str]:
    name = column_name.lower()
    tags: list[str] = []
    if name == "geometry":
        tags.append("geometry")
    if name in {"objectid", "fid", "gfid", "globalid", "fld_ar_id"} or name.endswith("id"):
        tags.append("likely_identifier")
    if any(token in name for token in FLOOD_ZONE_TOKENS):
        tags.append("candidate_flood_zone_field")
    if any(token in name for token in FLOODWAY_TOKENS):
        tags.append("candidate_floodway_field")
    if name in {"shape_leng", "shape_area", "starea", "stlength"}:
        tags.append("source_shape_measure")
    return tags


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
        quoted = quote_identifier(column_name)
        null_count = int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {table_name} WHERE {quoted} IS NULL",
            )
        )
        non_null_count = total_rows - null_count
        null_percentage = round((null_count / total_rows) * 100, 4) if total_rows else 0
        distinct_count: int | None = None
        if column_name != "geometry":
            distinct_count = int(
                fetch_scalar(
                    engine,
                    f"SELECT COUNT(DISTINCT {quoted}) FROM {table_name}",
                )
            )

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
                "distinct_count": distinct_count,
                "role_tags": classify_column(column_name),
            }
        )

    return profiles


def get_geometry_profile(engine: Engine, schema: str, table: str) -> dict[str, Any]:
    table_name = qualified_table(schema, table)
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
                f"SELECT COUNT(*) FROM {table_name} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
            )
        ),
        "null_geometry_count": int(
            fetch_scalar(engine, f"SELECT COUNT(*) FROM {table_name} WHERE geometry IS NULL")
        ),
        "bounding_box": fetch_rows(
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
        )[0],
    }


def top_counts(engine: Engine, table_name: str, column_name: str, limit: int = 50) -> list[dict[str, Any]]:
    quoted = quote_identifier(column_name)
    return fetch_rows(
        engine,
        f"""
        SELECT
          COALESCE(NULLIF(BTRIM({quoted}::text), ''), 'UNKNOWN') AS value,
          COUNT(*) AS feature_count
        FROM {table_name}
        GROUP BY COALESCE(NULLIF(BTRIM({quoted}::text), ''), 'UNKNOWN')
        ORDER BY feature_count DESC, value
        LIMIT {int(limit)}
        """,
    )


def get_category_counts(
    engine: Engine,
    schema: str,
    table: str,
    column_names: set[str],
) -> dict[str, list[dict[str, Any]]]:
    table_name = qualified_table(schema, table)
    category_counts: dict[str, list[dict[str, Any]]] = {}
    for column in ("fld_zone", "zone_subty", "sfha_tf"):
        if column in column_names:
            category_counts[column] = top_counts(engine, table_name, column)
    return category_counts


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def main() -> int:
    args = parse_args()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    engine = create_engine_from_env()
    columns = fetch_columns(engine, args.schema, args.table)
    column_names = {column["column_name"] for column in columns}
    table_name = qualified_table(args.schema, args.table)
    total_rows = int(fetch_scalar(engine, f"SELECT COUNT(*) FROM {table_name}"))
    column_profile = profile_columns(engine, args.schema, args.table, columns, total_rows)

    candidate_flood_zone_fields = [
        profile["column_name"]
        for profile in column_profile
        if "candidate_flood_zone_field" in profile["role_tags"]
    ]
    candidate_floodway_fields = [
        profile["column_name"]
        for profile in column_profile
        if "candidate_floodway_field" in profile["role_tags"]
    ]

    profile = {
        "generated_at": datetime.now().isoformat(),
        "table": f"{args.schema}.{args.table}",
        "row_count": total_rows,
        "geometry_profile": get_geometry_profile(engine, args.schema, args.table),
        "field_inventory": columns,
        "column_profile": column_profile,
        "candidate_flood_zone_fields": candidate_flood_zone_fields,
        "candidate_floodway_fields": candidate_floodway_fields,
        "category_counts": get_category_counts(engine, args.schema, args.table, column_names),
        "log_path": str(log_path),
    }

    with PROFILE_OUTPUT.open("w", encoding="utf-8") as file:
        json.dump(profile, file, indent=2, default=to_jsonable)
    write_csv(COLUMNS_OUTPUT, column_profile)

    logging.info("Wrote FEMA profile: %s", PROFILE_OUTPUT)
    logging.info("Wrote FEMA column profile: %s", COLUMNS_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
