"""Ingest FEMA NFHL Layer 28 flood hazard zones for the Cabarrus parcel extent.

The script reads the parcel footprint extent from public.parcels_enriched,
uses that envelope as an ArcGIS REST spatial filter, and downloads only FEMA
NFHL Flood Hazard Zone features intersecting the Cabarrus extent. It writes the
raw features to public.fema_nfhl_flood_zones_raw.
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
from decimal import Decimal
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

FEMA_LAYER_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28"
DEFAULT_SCHEMA = "public"
DEFAULT_TABLE = "fema_nfhl_flood_zones_raw"
DEFAULT_OUT_SR = 4326
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
PARCEL_TABLE = "public.parcels_enriched"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "fema_nfhl_flood_zone_ingest_summary.json"


class ArcGISRestError(RuntimeError):
    """Raised when an ArcGIS REST service returns an error payload."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest FEMA NFHL Layer 28 flood hazard zones for Cabarrus.",
    )
    parser.add_argument("--source-url", default=FEMA_LAYER_URL)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA)
    parser.add_argument("--table", default=DEFAULT_TABLE)
    parser.add_argument(
        "--if-exists",
        choices=["append", "fail", "replace"],
        default="replace",
    )
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Download and validate without writing to PostGIS.",
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
    log_path = LOG_DIR / f"ingest_fema_nfhl_flood_zones_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before ingesting FEMA NFHL."
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


def create_requests_session() -> Session:
    retry = Retry(
        total=2,
        backoff_factor=0.75,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "CabarrusFutureScape-FEMA-NFHL/0.1"})
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
    logging.info("Fetching FEMA layer metadata: %s", source_url)
    metadata = request_json(session, source_url, {"f": "pjson"}, timeout)
    logging.info(
        "FEMA metadata: name=%s geometryType=%s maxRecordCount=%s",
        metadata.get("name"),
        metadata.get("geometryType"),
        metadata.get("maxRecordCount"),
    )
    return metadata


def get_object_id_field(metadata: dict[str, Any]) -> str:
    object_id_field = metadata.get("objectIdField")
    if object_id_field:
        return str(object_id_field)

    for field in metadata.get("fields", []):
        if field.get("type") == "esriFieldTypeOID":
            return str(field["name"])

    raise ValueError("Could not determine FEMA object ID field from layer metadata.")


def get_page_size(metadata: dict[str, Any], requested_page_size: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)
    if requested_page_size is None:
        # FEMA NFHL can return 500s for large GeoJSON pages even when the
        # advertised maxRecordCount is higher. Keep the default conservative
        # while still honoring the service's maximum when callers override it.
        return min(max_record_count, 100)
    if requested_page_size < 1:
        raise ValueError("--page-size must be greater than zero.")
    return min(requested_page_size, max_record_count)


def supports_pagination(metadata: dict[str, Any]) -> bool:
    capabilities = metadata.get("advancedQueryCapabilities") or {}
    return bool(capabilities.get("supportsPagination"))


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(text(sql)).mappings()
        return [dict(row) for row in rows]


def get_cabarrus_extent(engine: Engine) -> dict[str, Any]:
    rows = fetch_rows(
        engine,
        f"""
        WITH parcel_extent AS (
          SELECT ST_SetSRID(ST_Extent(geometry)::geometry, 4326) AS extent
          FROM {PARCEL_TABLE}
          WHERE geometry IS NOT NULL
        ),
        parcel_counts AS (
          SELECT COUNT(*) AS parcel_count
          FROM {PARCEL_TABLE}
        )
        SELECT
          ST_XMin(parcel_extent.extent) AS xmin,
          ST_YMin(parcel_extent.extent) AS ymin,
          ST_XMax(parcel_extent.extent) AS xmax,
          ST_YMax(parcel_extent.extent) AS ymax,
          parcel_counts.parcel_count,
          4326 AS srid
        FROM parcel_extent, parcel_counts
        """,
    )
    if not rows:
        raise RuntimeError(f"Could not calculate extent from {PARCEL_TABLE}.")
    return rows[0]


def build_envelope(extent: dict[str, Any]) -> dict[str, Any]:
    return {
        "xmin": float(extent["xmin"]),
        "ymin": float(extent["ymin"]),
        "xmax": float(extent["xmax"]),
        "ymax": float(extent["ymax"]),
        "spatialReference": {"wkid": DEFAULT_OUT_SR},
    }


def geometry_filter_params(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        "geometry": json.dumps(envelope),
        "geometryType": "esriGeometryEnvelope",
        "inSR": DEFAULT_OUT_SR,
        "spatialRel": "esriSpatialRelIntersects",
    }


def fetch_filtered_feature_count(
    session: Session,
    source_url: str,
    timeout: int,
    envelope: dict[str, Any],
) -> int:
    payload = request_json(
        session,
        f"{source_url}/query",
        {
            "f": "pjson",
            "returnCountOnly": "true",
            "where": "1=1",
            **geometry_filter_params(envelope),
        },
        timeout,
    )
    count = int(payload.get("count", 0))
    logging.info("FEMA feature count intersecting Cabarrus extent: %s", count)
    return count


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
    envelope: dict[str, Any],
    limit: int | None,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    target_count = min(total_count, limit) if limit else total_count
    offset = 0

    logging.info(
        "Downloading FEMA features with pagination: pageSize=%s target=%s",
        page_size,
        target_count,
    )
    while len(features) < target_count:
        requested_count = min(page_size, target_count - len(features))
        payload = fetch_geojson_page(
            session,
            source_url,
            timeout,
            {
                "f": "geojson",
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": DEFAULT_OUT_SR,
                "orderByFields": object_id_field,
                "resultOffset": offset,
                "resultRecordCount": requested_count,
                **geometry_filter_params(envelope),
            },
        )
        page_features = payload.get("features", [])
        if not page_features:
            logging.warning("No FEMA features returned at offset=%s.", offset)
            break

        features.extend(page_features)
        offset += len(page_features)
        logging.info("Downloaded %s/%s FEMA features", len(features), target_count)

        if len(page_features) < requested_count:
            break

    return features[:target_count]


def fetch_object_ids(
    session: Session,
    source_url: str,
    timeout: int,
    object_id_field: str,
    envelope: dict[str, Any],
) -> list[int]:
    payload = request_json(
        session,
        f"{source_url}/query",
        {
            "f": "pjson",
            "returnIdsOnly": "true",
            "where": "1=1",
            **geometry_filter_params(envelope),
        },
        timeout,
    )
    object_ids = sorted(int(value) for value in payload.get("objectIds", []))
    logging.info("Fetched %s FEMA object IDs by Cabarrus extent", len(object_ids))
    if not object_ids:
        raise RuntimeError(f"No object IDs returned for {object_id_field}.")
    return object_ids


def download_features_by_object_ids(
    session: Session,
    source_url: str,
    timeout: int,
    object_ids: list[int],
    page_size: int,
    limit: int | None,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    target_ids = object_ids[:limit] if limit else object_ids

    for index in range(0, len(target_ids), page_size):
        chunk = target_ids[index : index + page_size]
        chunk_features = download_object_id_chunk(
            session,
            source_url,
            timeout,
            chunk,
        )
        features.extend(chunk_features)
        logging.info("Downloaded %s/%s FEMA features by object ID", len(features), len(target_ids))

    return features


def download_object_id_chunk(
    session: Session,
    source_url: str,
    timeout: int,
    object_ids: list[int],
) -> list[dict[str, Any]]:
    try:
        payload = fetch_geojson_page(
            session,
            source_url,
            timeout,
            {
                "f": "geojson",
                "objectIds": ",".join(str(value) for value in object_ids),
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": DEFAULT_OUT_SR,
            },
        )
        return payload.get("features", [])
    except (requests.RequestException, ArcGISRestError) as error:
        if len(object_ids) == 1:
            raise RuntimeError(
                f"FEMA object ID {object_ids[0]} failed even as a single-feature request."
            ) from error

        midpoint = len(object_ids) // 2
        logging.warning(
            "FEMA object ID chunk of %s failed; splitting into %s and %s. Error: %s",
            len(object_ids),
            midpoint,
            len(object_ids) - midpoint,
            error,
        )
        return download_object_id_chunk(
            session,
            source_url,
            timeout,
            object_ids[:midpoint],
        ) + download_object_id_chunk(
            session,
            source_url,
            timeout,
            object_ids[midpoint:],
        )


def normalize_column_name(column_name: str) -> str:
    normalized = column_name.strip().lower()
    normalized = normalized.replace(".", "_")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized)
    return normalized.strip("_")


def build_geodataframe(features: list[dict[str, Any]]) -> gpd.GeoDataFrame:
    if not features:
        raise RuntimeError("No FEMA features were downloaded.")

    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{DEFAULT_OUT_SR}")
    gdf.columns = [normalize_column_name(column) for column in gdf.columns]

    if "geometry" not in gdf.columns:
        raise RuntimeError("Downloaded FEMA features did not include geometry.")

    gdf = gdf.set_geometry("geometry")
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=DEFAULT_OUT_SR)
    elif gdf.crs.to_epsg() != DEFAULT_OUT_SR:
        gdf = gdf.to_crs(epsg=DEFAULT_OUT_SR)

    gdf["source_layer"] = "FEMA NFHL Layer 28 Flood Hazard Zones"
    gdf["source_url"] = FEMA_LAYER_URL
    gdf["ingested_at"] = datetime.now()
    return gdf


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def write_to_postgis(
    engine: Engine,
    gdf: gpd.GeoDataFrame,
    schema: str,
    table: str,
    if_exists: str,
) -> None:
    logging.info("Writing %s FEMA features to %s.%s", len(gdf), schema, table)
    gdf.to_postgis(
        name=table,
        con=engine,
        schema=schema,
        if_exists=if_exists,
        index=False,
    )

    table_name = f"{quote_identifier(schema)}.{quote_identifier(table)}"
    index_prefix = f"{schema}_{table}"
    with engine.begin() as connection:
        connection.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS {quote_identifier(index_prefix + '_geometry_gix')}
                ON {table_name}
                USING GIST (geometry)
                """
            )
        )
        for column in ("fld_ar_id", "fld_zone", "zone_subty", "sfha_tf", "globalid"):
            if column in gdf.columns:
                connection.execute(
                    text(
                        f"""
                        CREATE INDEX IF NOT EXISTS {quote_identifier(index_prefix + '_' + column + '_idx')}
                        ON {table_name} ({quote_identifier(column)})
                        """
                    )
                )
        connection.execute(text(f"ANALYZE {table_name}"))


def summarize_gdf(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    return {
        "row_count": int(len(gdf)),
        "columns": list(gdf.columns),
        "crs": str(gdf.crs),
        "geometry_type_counts": {
            str(key): int(value)
            for key, value in gdf.geometry.geom_type.value_counts(dropna=False).to_dict().items()
        },
        "null_geometry_count": int(gdf.geometry.isna().sum()),
        "candidate_flood_zone_fields": [
            column
            for column in gdf.columns
            if column in {"fld_zone", "zone_subty", "sfha_tf"}
            or "flood" in column
            or "zone" in column
        ],
        "candidate_floodway_fields": [
            column
            for column in gdf.columns
            if column in {"zone_subty", "fld_zone"} or "floodway" in column
        ],
    }


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    engine = create_engine_from_env()
    extent = get_cabarrus_extent(engine)
    envelope = build_envelope(extent)

    session = create_requests_session()
    metadata = fetch_layer_metadata(session, args.source_url, args.timeout)
    object_id_field = get_object_id_field(metadata)
    page_size = get_page_size(metadata, args.page_size)
    total_count = fetch_filtered_feature_count(
        session,
        args.source_url,
        args.timeout,
        envelope,
    )

    if total_count == 0:
        raise RuntimeError("FEMA NFHL returned zero features for the Cabarrus extent.")

    if supports_pagination(metadata):
        try:
            features = download_features_with_pagination(
                session,
                args.source_url,
                args.timeout,
                total_count,
                object_id_field,
                page_size,
                envelope,
                args.limit,
            )
            download_method = "pagination_with_cabarrus_envelope_filter"
        except requests.RequestException as error:
            logging.warning(
                "FEMA pagination failed; falling back to object ID download. Error: %s",
                error,
            )
            object_ids = fetch_object_ids(
                session,
                args.source_url,
                args.timeout,
                object_id_field,
                envelope,
            )
            features = download_features_by_object_ids(
                session,
                args.source_url,
                args.timeout,
                object_ids,
                min(page_size, 25),
                args.limit,
            )
            download_method = "object_id_fallback_after_pagination_failure"
    else:
        object_ids = fetch_object_ids(
            session,
            args.source_url,
            args.timeout,
            object_id_field,
            envelope,
        )
        features = download_features_by_object_ids(
            session,
            args.source_url,
            args.timeout,
            object_ids,
            min(page_size, 25),
            args.limit,
        )
        download_method = "object_id_fallback_with_cabarrus_envelope_filter"

    gdf = build_geodataframe(features)
    if not args.skip_db:
        write_to_postgis(engine, gdf, args.schema, args.table, args.if_exists)

    elapsed_seconds = round(time.perf_counter() - started_at, 2)
    summary = {
        "generated_at": datetime.now().isoformat(),
        "source_url": args.source_url,
        "source_layer": "FEMA NFHL Layer 28 Flood Hazard Zones",
        "source_authority": "authoritative_regulatory_constraint",
        "raw_table": f"{args.schema}.{args.table}",
        "parcel_table": PARCEL_TABLE,
        "cabarrus_extent": envelope,
        "parcel_count_used_for_extent": extent["parcel_count"],
        "service_feature_count_for_extent": total_count,
        "downloaded_feature_count": int(len(gdf)),
        "download_method": download_method,
        "page_size": page_size,
        "object_id_field": object_id_field,
        "service_metadata": {
            "name": metadata.get("name"),
            "geometry_type": metadata.get("geometryType"),
            "max_record_count": metadata.get("maxRecordCount"),
            "supports_pagination": supports_pagination(metadata),
        },
        "geodataframe_summary": summarize_gdf(gdf),
        "wrote_to_postgis": not args.skip_db,
        "elapsed_seconds": elapsed_seconds,
        "log_path": str(log_path),
    }

    with SUMMARY_OUTPUT.open("w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2, default=to_jsonable)

    logging.info("Wrote FEMA ingest summary: %s", SUMMARY_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
