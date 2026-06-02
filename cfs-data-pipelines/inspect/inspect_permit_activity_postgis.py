"""Profile public.permit_activity for Phase 3 permit intelligence readiness."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
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
DEFAULT_SCHEMA = "public"
DEFAULT_TABLE = "permit_activity"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "permit_activity_profile_summary.json"
COLUMN_PROFILE_OUTPUT = OUTPUT_DIR / "permit_activity_column_profile.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Profile public.permit_activity in local PostGIS.",
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
    log_path = LOG_DIR / f"inspect_permit_activity_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before profiling permits."
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


def table_ref(schema: str, table: str) -> str:
    return f"{quote_identifier(schema)}.{quote_identifier(table)}"


def table_exists(engine: Engine, schema: str, table: str) -> bool:
    with engine.connect() as connection:
        return bool(
            connection.execute(
                text("SELECT to_regclass(:table_name) IS NOT NULL"),
                {"table_name": f"{schema}.{table}"},
            ).scalar_one()
        )


def fetch_scalar(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params or {}).scalar_one()


def fetch_rows(
    engine: Engine,
    sql: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql), params or {}).mappings()
        return [dict(row) for row in rows]


def get_columns(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        """
        SELECT ordinal_position, column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :table
        ORDER BY ordinal_position
        """,
        {"schema": schema, "table": table},
    )


def classify_columns(columns: list[dict[str, Any]]) -> dict[str, list[str]]:
    names = [column["column_name"] for column in columns]

    def matching(*tokens: str) -> list[str]:
        return [
            name
            for name in names
            if any(token in name.lower() for token in tokens)
        ]

    return {
        "date_field_candidates": matching("date", "year", "month"),
        "permit_id_candidates": [
            name
            for name in names
            if ("permit" in name.lower() and ("number" in name.lower() or "id" in name.lower()))
            or name.lower() in {"permitnumber"}
        ],
        "parcel_pin_join_candidates": [
            name
            for name in names
            if name.lower() in {"pin14", "parcel_id", "parcelid", "parcel", "pin"}
            or "pin" in name.lower()
        ],
        "address_field_candidates": matching("address", "addr", "site", "location"),
        "permit_type_status_candidates": matching(
            "type",
            "category",
            "status",
            "subtype",
            "group",
        ),
    }


def get_column_profile(
    engine: Engine,
    schema: str,
    table: str,
    columns: list[dict[str, Any]],
    row_count: int,
    classified_columns: dict[str, list[str]],
) -> list[dict[str, Any]]:
    profile: list[dict[str, Any]] = []
    ref = table_ref(schema, table)
    role_map: dict[str, list[str]] = {}
    for role, names in classified_columns.items():
        for name in names:
            role_map.setdefault(name, []).append(role)

    for column in columns:
        column_name = column["column_name"]
        null_count = fetch_scalar(
            engine,
            f"SELECT COUNT(*) FROM {ref} WHERE {quote_identifier(column_name)} IS NULL",
        )
        profile.append(
            {
                **column,
                "null_count": int(null_count),
                "non_null_count": row_count - int(null_count),
                "null_percentage": round(
                    (int(null_count) * 100 / row_count) if row_count else 0,
                    4,
                ),
                "role_tags": "|".join(role_map.get(column_name, [])),
            }
        )

    return profile


def get_geometry_summary(engine: Engine, schema: str, table: str, has_geometry: bool) -> dict[str, Any]:
    if not has_geometry:
        return {
            "geometry_available": False,
            "geometry_type_counts": [],
            "srid_distribution": [],
            "invalid_geometry_count": None,
        }

    ref = table_ref(schema, table)
    return {
        "geometry_available": True,
        "geometry_type_counts": fetch_rows(
            engine,
            f"""
            SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS feature_count
            FROM {ref}
            GROUP BY ST_GeometryType(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "srid_distribution": fetch_rows(
            engine,
            f"""
            SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
            FROM {ref}
            GROUP BY ST_SRID(geometry)
            ORDER BY feature_count DESC
            """,
        ),
        "invalid_geometry_count": int(
            fetch_scalar(
                engine,
                f"SELECT COUNT(*) FROM {ref} WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
            )
        ),
    }


def get_date_range(
    engine: Engine,
    schema: str,
    table: str,
    date_candidates: list[str],
) -> list[dict[str, Any]]:
    ref = table_ref(schema, table)
    ranges = []

    for column_name in date_candidates:
        if column_name.lower() in {"cfs_source_year"}:
            continue

        quoted = quote_identifier(column_name)
        rows = fetch_rows(
            engine,
            f"""
            WITH parsed AS (
              SELECT
                CASE
                  WHEN {quoted} IS NULL THEN NULL
                  WHEN {quoted}::text ~ '^\\d{{4}}\\.\\d{{2}}\\.\\d{{2}}$'
                    THEN to_date({quoted}::text, 'YYYY.MM.DD')
                  WHEN {quoted}::text ~ '^\\d{{4}}-\\d{{2}}-\\d{{2}}'
                    THEN ({quoted}::text)::date
                  ELSE NULL
                END AS parsed_date
              FROM {ref}
            )
            SELECT
              :column_name AS column_name,
              MIN(parsed_date) AS min_date,
              MAX(parsed_date) AS max_date,
              COUNT(*) FILTER (WHERE parsed_date IS NOT NULL) AS parsed_count
            FROM parsed
            """,
            {"column_name": column_name},
        )
        ranges.extend(rows)

    return ranges


def write_csv(rows: list[dict[str, Any]], output_path: Path) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not rows:
        output_path.write_text("", encoding="utf-8")
        return

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting permit activity profile.")

    try:
        engine = create_engine_from_env()
        if not table_exists(engine, args.schema, args.table):
            raise RuntimeError(f"Table {args.schema}.{args.table} does not exist.")

        row_count = int(
            fetch_scalar(engine, f"SELECT COUNT(*) FROM {table_ref(args.schema, args.table)}")
        )
        columns = get_columns(engine, args.schema, args.table)
        classified_columns = classify_columns(columns)
        column_profile = get_column_profile(
            engine,
            args.schema,
            args.table,
            columns,
            row_count,
            classified_columns,
        )
        has_geometry = any(column["column_name"] == "geometry" for column in columns)
        geometry_summary = get_geometry_summary(engine, args.schema, args.table, has_geometry)
        date_ranges = get_date_range(
            engine,
            args.schema,
            args.table,
            classified_columns["date_field_candidates"],
        )

        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "table": f"{args.schema}.{args.table}",
            },
            "row_count": row_count,
            **geometry_summary,
            "field_inventory": columns,
            **classified_columns,
            "date_ranges": date_ranges,
            "duration_seconds": round(time.perf_counter() - started_at, 2),
            "log_path": str(log_path),
        }

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        SUMMARY_OUTPUT.write_text(
            json.dumps(summary, indent=2, default=json_default),
            encoding="utf-8",
        )
        write_csv(column_profile, COLUMN_PROFILE_OUTPUT)
        engine.dispose()

        logging.info("Permit activity row count: %s", row_count)
        logging.info("Date candidates: %s", classified_columns["date_field_candidates"])
        logging.info("Permit ID candidates: %s", classified_columns["permit_id_candidates"])
        logging.info("Parcel/PIN candidates: %s", classified_columns["parcel_pin_join_candidates"])
        logging.info("Wrote profile summary: %s", SUMMARY_OUTPUT)
        logging.info("Wrote column profile: %s", COLUMN_PROFILE_OUTPUT)
        return 0
    except Exception:
        logging.exception("Permit activity profile failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
