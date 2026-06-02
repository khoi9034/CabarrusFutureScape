"""Ingest Cabarrus County Tax Parcels from ArcGIS REST into local PostGIS.

This is a local development ingestion pilot for Cabarrus FutureScape (CFS).
It intentionally targets a local PostGIS database and does not connect the
frontend dashboard, production services, APIs, forecasting, or AI systems.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from geoalchemy2 import Geometry  # noqa: F401 - required by GeoDataFrame.to_postgis
from requests import Session
from requests.adapters import HTTPAdapter
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

ARCGIS_LAYER_URL = (
    "https://location.cabarruscounty.us/arcgisservices/rest/services/"
    "opendata/MapServer/46"
)
DEFAULT_TABLE_NAME = "parcels"
DEFAULT_SCHEMA = "public"
DEFAULT_OUT_SR = 4326
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"


class ArcGISRestError(RuntimeError):
    """Raised when the ArcGIS REST source returns an error payload."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Cabarrus County Tax Parcels into local PostGIS.",
    )
    parser.add_argument(
        "--source-url",
        default=ARCGIS_LAYER_URL,
        help="ArcGIS REST layer URL. Defaults to the Cabarrus Tax Parcels layer.",
    )
    parser.add_argument(
        "--table",
        default=DEFAULT_TABLE_NAME,
        help="Target PostGIS table name. Defaults to parcels.",
    )
    parser.add_argument(
        "--schema",
        default=DEFAULT_SCHEMA,
        help="Target PostGIS schema. Defaults to public.",
    )
    parser.add_argument(
        "--if-exists",
        choices=["append", "fail", "replace"],
        default="replace",
        help="GeoPandas to_postgis table behavior. Defaults to replace.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=None,
        help="Optional ArcGIS query page size. Defaults to layer maxRecordCount.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional feature limit for smoke tests. Omit to ingest all parcels.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=90,
        help="HTTP timeout in seconds. Defaults to 90.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity. Defaults to INFO.",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Download and validate the GeoDataFrame without writing to PostGIS.",
    )

    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_tax_parcels_{timestamp}.log"
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )

    return log_path


def create_requests_session() -> Session:
    retry = Retry(
        total=5,
        backoff_factor=1.25,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": "CabarrusFutureScape-LocalIngestion/0.1",
        },
    )

    return session


def request_json(
    session: Session,
    url: str,
    params: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()

    if "error" in payload:
        error = payload["error"]
        message = error.get("message", "ArcGIS REST error")
        details = "; ".join(error.get("details", []))
        raise ArcGISRestError(f"{message}. {details}".strip())

    return payload


def fetch_layer_metadata(
    session: Session,
    source_url: str,
    timeout: int,
) -> dict[str, Any]:
    logging.info("Fetching layer metadata: %s", source_url)
    metadata = request_json(session, source_url, {"f": "pjson"}, timeout)
    logging.info(
        "Layer metadata: name=%s geometryType=%s maxRecordCount=%s",
        metadata.get("name"),
        metadata.get("geometryType"),
        metadata.get("maxRecordCount"),
    )
    return metadata


def fetch_feature_count(session: Session, source_url: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{source_url}/query",
        {
            "f": "pjson",
            "returnCountOnly": "true",
            "where": "1=1",
        },
        timeout,
    )
    count = int(payload.get("count", 0))
    logging.info("Source feature count: %s", count)
    return count


def get_object_id_field(metadata: dict[str, Any]) -> str:
    object_id_field = metadata.get("objectIdField")

    if object_id_field:
        return str(object_id_field)

    for field in metadata.get("fields", []):
        if field.get("type") == "esriFieldTypeOID":
            oid_field = str(field["name"])
            logging.warning(
                "Layer metadata has no objectIdField; using OID field %s.",
                oid_field,
            )
            return oid_field

    raise ValueError("Could not determine ArcGIS object ID field from metadata.")


def get_page_size(metadata: dict[str, Any], requested_page_size: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)

    if requested_page_size is None:
        return max_record_count

    if requested_page_size < 1:
        raise ValueError("--page-size must be greater than zero.")

    return min(requested_page_size, max_record_count)


def supports_pagination(metadata: dict[str, Any]) -> bool:
    capabilities = metadata.get("advancedQueryCapabilities") or {}
    return bool(capabilities.get("supportsPagination"))


def fetch_geojson_page(
    session: Session,
    source_url: str,
    timeout: int,
    params: dict[str, Any],
) -> dict[str, Any]:
    return request_json(session, f"{source_url}/query", params, timeout)


def download_features_with_pagination(
    session: Session,
    source_url: str,
    timeout: int,
    total_count: int,
    object_id_field: str,
    page_size: int,
    limit: int | None,
) -> list[dict[str, Any]]:
    logging.info(
        "Downloading features with resultOffset pagination: pageSize=%s limit=%s",
        page_size,
        limit or "all",
    )
    features: list[dict[str, Any]] = []
    target_count = min(total_count, limit) if limit else total_count
    offset = 0

    while len(features) < target_count:
        requested_count = min(page_size, target_count - len(features))
        payload = fetch_geojson_page(
            session,
            source_url,
            timeout,
            {
                "f": "geojson",
                "orderByFields": object_id_field,
                "outFields": "*",
                "outSR": DEFAULT_OUT_SR,
                "resultOffset": offset,
                "resultRecordCount": requested_count,
                "returnGeometry": "true",
                "where": "1=1",
            },
        )
        page_features = payload.get("features", [])

        if not page_features:
            logging.warning(
                "No features returned at resultOffset=%s; stopping pagination.",
                offset,
            )
            break

        features.extend(page_features)
        offset += len(page_features)
        logging.info("Downloaded %s/%s features", len(features), target_count)

    return features[:target_count]


def fetch_object_ids(
    session: Session,
    source_url: str,
    timeout: int,
    object_id_field: str,
) -> list[int]:
    payload = request_json(
        session,
        f"{source_url}/query",
        {
            "f": "pjson",
            "orderByFields": object_id_field,
            "returnIdsOnly": "true",
            "returnGeometry": "false",
            "where": "1=1",
        },
        timeout,
    )
    object_ids = payload.get("objectIds") or []

    if not object_ids:
        raise ArcGISRestError("ArcGIS REST source returned no object IDs.")

    return sorted(int(object_id) for object_id in object_ids)


def download_features_with_object_ids(
    session: Session,
    source_url: str,
    timeout: int,
    object_id_field: str,
    page_size: int,
    limit: int | None,
) -> list[dict[str, Any]]:
    logging.info("Downloading features with object ID chunk fallback.")
    object_ids = fetch_object_ids(session, source_url, timeout, object_id_field)

    if limit:
        object_ids = object_ids[:limit]

    features: list[dict[str, Any]] = []

    for start in range(0, len(object_ids), page_size):
        chunk = object_ids[start : start + page_size]
        payload = fetch_geojson_page(
            session,
            source_url,
            timeout,
            {
                "f": "geojson",
                "objectIds": ",".join(str(object_id) for object_id in chunk),
                "outFields": "*",
                "outSR": DEFAULT_OUT_SR,
                "returnGeometry": "true",
            },
        )
        features.extend(payload.get("features", []))
        logging.info("Downloaded %s/%s features", len(features), len(object_ids))

    return features


def download_features(
    session: Session,
    source_url: str,
    metadata: dict[str, Any],
    timeout: int,
    page_size: int,
    limit: int | None,
) -> list[dict[str, Any]]:
    total_count = fetch_feature_count(session, source_url, timeout)
    object_id_field = get_object_id_field(metadata)

    if supports_pagination(metadata):
        try:
            features = download_features_with_pagination(
                session,
                source_url,
                timeout,
                total_count,
                object_id_field,
                page_size,
                limit,
            )

            if features:
                return features
        except (ArcGISRestError, requests.RequestException) as error:
            logging.warning(
                "Offset pagination failed; falling back to object ID chunks: %s",
                error,
            )

    return download_features_with_object_ids(
        session,
        source_url,
        timeout,
        object_id_field,
        page_size,
        limit,
    )


def features_to_geodataframe(features: list[dict[str, Any]]) -> gpd.GeoDataFrame:
    if not features:
        raise ValueError("No ArcGIS features were downloaded.")

    logging.info("Building GeoDataFrame from %s downloaded features.", len(features))
    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{DEFAULT_OUT_SR}")
    gdf = normalize_columns(gdf)
    gdf = gdf.set_geometry("geometry")

    null_geometry_count = int(gdf.geometry.isna().sum())
    if null_geometry_count:
        logging.warning("Dropping %s features with null geometries.", null_geometry_count)
        gdf = gdf[gdf.geometry.notna()].copy()

    if gdf.empty:
        raise ValueError("All downloaded features had null geometries.")

    return gdf


def normalize_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    normalized_names: list[str] = []
    used_names: set[str] = set()

    for column in gdf.columns:
        if column == gdf.geometry.name:
            normalized = "geometry"
        else:
            normalized = re.sub(r"[^0-9a-zA-Z]+", "_", str(column)).strip("_").lower()
            normalized = normalized or "field"

        base_name = normalized
        suffix = 2
        while normalized in used_names:
            normalized = f"{base_name}_{suffix}"
            suffix += 1

        used_names.add(normalized)
        normalized_names.append(normalized)

    gdf = gdf.copy()
    gdf.columns = normalized_names
    return gdf


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")

    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before running ingestion."
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


def verify_database(engine: Engine) -> None:
    logging.info(
        "Verifying database connection: host=%s port=%s database=%s user=%s",
        DEFAULT_DB_HOST,
        DEFAULT_DB_PORT,
        DEFAULT_DB_NAME,
        DEFAULT_DB_USER,
    )

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            postgis_version = connection.execute(
                text("SELECT postgis_full_version()")
            ).scalar_one()
            logging.info("PostGIS available: %s", postgis_version)
    except Exception as error:
        raise RuntimeError(
            "Database connection or PostGIS verification failed. "
            "Confirm PostgreSQL is listening on localhost:5433, database cfs_dev "
            "exists, PostGIS is enabled, and CFS_POSTGRES_PASSWORD is correct."
        ) from error


def write_to_postgis(
    gdf: gpd.GeoDataFrame,
    engine: Engine,
    schema: str,
    table: str,
    if_exists: str,
) -> None:
    logging.info(
        "Writing %s features to PostGIS table %s.%s with if_exists=%s.",
        len(gdf),
        schema,
        table,
        if_exists,
    )
    gdf.to_postgis(
        name=table,
        con=engine,
        schema=schema,
        if_exists=if_exists,
        index=False,
    )


def create_spatial_index(engine: Engine, schema: str, table: str) -> None:
    index_name = f"{table}_geometry_gix"
    quoted_schema = quote_identifier(schema)
    quoted_table = quote_identifier(table)
    quoted_index = quote_identifier(index_name)

    logging.info("Creating spatial index %s on %s.%s.", index_name, schema, table)
    with engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {quoted_index} "
                f"ON {quoted_schema}.{quoted_table} USING GIST (geometry)"
            )
        )
        connection.execute(
            text(f"ANALYZE {quoted_schema}.{quoted_table}")
        )


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def log_geodataframe_summary(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    geometry_types = sorted(str(value) for value in gdf.geometry.geom_type.dropna().unique())
    summary = {
        "feature_count": int(len(gdf)),
        "geometry_types": geometry_types,
        "crs": str(gdf.crs),
        "sample_columns": list(gdf.columns[:15]),
    }
    logging.info("GeoDataFrame feature count: %s", summary["feature_count"])
    logging.info("Geometry type(s): %s", ", ".join(geometry_types))
    logging.info("CRS: %s", summary["crs"])
    logging.info("Sample columns: %s", ", ".join(summary["sample_columns"]))
    return summary


def write_summary_file(summary: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "ingest_tax_parcels_summary.json"
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logging.info("Wrote ingestion summary: %s", output_path)
    return output_path


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS Tax Parcels ingestion pilot.")
    logging.info("Log file: %s", log_path)

    try:
        session = create_requests_session()
        metadata = fetch_layer_metadata(session, args.source_url, args.timeout)
        page_size = get_page_size(metadata, args.page_size)
        features = download_features(
            session=session,
            source_url=args.source_url,
            metadata=metadata,
            timeout=args.timeout,
            page_size=page_size,
            limit=args.limit,
        )
        gdf = features_to_geodataframe(features)
        gdf_summary = log_geodataframe_summary(gdf)

        database_written = False
        if args.skip_db:
            logging.warning("Skipping PostGIS write because --skip-db was supplied.")
        else:
            engine = create_engine_from_env()
            verify_database(engine)
            write_to_postgis(gdf, engine, args.schema, args.table, args.if_exists)
            create_spatial_index(engine, args.schema, args.table)
            engine.dispose()
            database_written = True

        duration_seconds = round(time.perf_counter() - start_time, 2)
        logging.info("Ingestion duration: %s seconds", duration_seconds)
        summary = {
            **gdf_summary,
            "arcgis_layer_url": args.source_url,
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "schema": args.schema,
                "table": args.table,
                "written": database_written,
                "if_exists": args.if_exists,
            },
            "duration_seconds": duration_seconds,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "log_path": str(log_path),
        }
        write_summary_file(summary)
        logging.info("CFS Tax Parcels ingestion pilot complete.")
        return 0
    except Exception:
        logging.exception("CFS Tax Parcels ingestion failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
