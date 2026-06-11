"""Validate the Cabarrus parcel extent used for FEMA NFHL filtering.

This script reads public.parcels_enriched, calculates the parcel footprint
extent, and writes a JSON artifact that downstream FEMA ingestion uses as a
sanity check. It does not ingest FEMA data or modify any PostGIS tables.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
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
PARCEL_TABLE = "public.parcels_enriched"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
OUTPUT_PATH = OUTPUT_DIR / "cabarrus_extent_validation.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect the Cabarrus parcel extent for FEMA NFHL filtering.",
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
    log_path = LOG_DIR / f"inspect_cabarrus_extent_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before inspecting parcels."
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


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def fetch_one(engine: Engine, sql: str) -> dict[str, Any]:
    rows = fetch_rows(engine, sql)
    if not rows:
        raise RuntimeError("Query returned no rows.")
    return rows[0]


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def get_extent(engine: Engine) -> dict[str, Any]:
    return fetch_one(
        engine,
        f"""
        WITH parcel_extent AS (
          SELECT ST_SetSRID(ST_Extent(geometry)::geometry, 4326) AS extent
          FROM {PARCEL_TABLE}
          WHERE geometry IS NOT NULL
        ),
        parcel_area AS (
          SELECT
            COUNT(*) AS parcel_count,
            COUNT(*) FILTER (WHERE geometry IS NULL) AS null_geometry_count,
            SUM(ST_Area(geometry::geography)) AS parcel_area_sq_m
          FROM {PARCEL_TABLE}
        )
        SELECT
          ST_XMin(parcel_extent.extent) AS xmin,
          ST_YMin(parcel_extent.extent) AS ymin,
          ST_XMax(parcel_extent.extent) AS xmax,
          ST_YMax(parcel_extent.extent) AS ymax,
          parcel_area.parcel_count,
          parcel_area.null_geometry_count,
          ROUND(parcel_area.parcel_area_sq_m::numeric, 2) AS county_area_estimate_sq_m,
          ROUND((parcel_area.parcel_area_sq_m / 4046.8564224)::numeric, 2)
            AS county_area_estimate_acres,
          ROUND((parcel_area.parcel_area_sq_m / 1000000.0)::numeric, 2)
            AS county_area_estimate_sq_km
        FROM parcel_extent, parcel_area
        """,
    )


def get_srid_distribution(engine: Engine) -> list[dict[str, Any]]:
    return fetch_rows(
        engine,
        f"""
        SELECT ST_SRID(geometry) AS srid, COUNT(*) AS feature_count
        FROM {PARCEL_TABLE}
        GROUP BY ST_SRID(geometry)
        ORDER BY srid
        """,
    )


def main() -> int:
    args = parse_args()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logging.info("Inspecting parcel extent from %s", PARCEL_TABLE)
    engine = create_engine_from_env()
    extent = get_extent(engine)
    srid_distribution = get_srid_distribution(engine)

    primary_srid = None
    if srid_distribution:
        primary_srid = max(srid_distribution, key=lambda row: row["feature_count"])["srid"]

    payload = {
        "generated_at": datetime.now().isoformat(),
        "parcel_table": PARCEL_TABLE,
        "extent": {key: extent[key] for key in ("xmin", "ymin", "xmax", "ymax")},
        "arcgis_envelope": {
            "xmin": extent["xmin"],
            "ymin": extent["ymin"],
            "xmax": extent["xmax"],
            "ymax": extent["ymax"],
            "spatialReference": {"wkid": 4326},
        },
        "srid": primary_srid,
        "srid_distribution": srid_distribution,
        "parcel_count": extent["parcel_count"],
        "null_geometry_count": extent["null_geometry_count"],
        "county_area_estimate": {
            "method": "sum_of_parcel_geometry_area_geography",
            "note": (
                "This is a parcel-footprint aggregate used for source filtering, "
                "not an official county boundary area."
            ),
            "sq_m": extent["county_area_estimate_sq_m"],
            "acres": extent["county_area_estimate_acres"],
            "sq_km": extent["county_area_estimate_sq_km"],
        },
        "log_path": str(log_path),
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, default=to_jsonable)

    logging.info("Wrote Cabarrus extent validation: %s", OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
