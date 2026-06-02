"""Ingest all configured CFS zoning sources into separate local PostGIS tables.

This Phase 2 foundation step reads config/zoning_sources.json and writes each
jurisdiction's raw zoning layer independently. It does not modify parcel tables,
connect the frontend, run parcel-zoning overlays, create APIs, or force zoning
class equivalency across jurisdictions.
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

DEFAULT_OUT_SR = 4326
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PIPELINE_ROOT / "config" / "zoning_sources.json"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "zoning_sources_ingest_summary.json"


class ArcGISRestError(RuntimeError):
    """Raised when the ArcGIS REST source returns an error payload."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest configured multi-jurisdiction zoning sources.",
    )
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument(
        "--source-id",
        action="append",
        help="Optional source id to ingest. Can be passed multiple times.",
    )
    parser.add_argument(
        "--if-exists",
        choices=["append", "fail", "replace"],
        default="replace",
    )
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Download and validate without writing to PostGIS.",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_zoning_sources_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def load_sources(config_path: Path, source_ids: list[str] | None) -> list[dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = config.get("sources", [])
    if not sources:
        raise ValueError(f"No zoning sources found in {config_path}")

    if source_ids:
        wanted = set(source_ids)
        sources = [source for source in sources if source["id"] in wanted]
        missing = wanted - {source["id"] for source in sources}
        if missing:
            raise ValueError(f"Unknown zoning source id(s): {', '.join(sorted(missing))}")

    return sources


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
    session.headers.update({"User-Agent": "CabarrusFutureScape-MultiZoningIngest/0.1"})
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


def fetch_layer_metadata(session: Session, source_url: str, timeout: int) -> dict[str, Any]:
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
    return int(payload.get("count", 0))


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
            logging.warning("No features returned at offset=%s.", offset)
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
    logging.info("Source feature count: %s", total_count)

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
            logging.warning("Pagination failed; using object ID fallback: %s", error)

    return download_features_with_object_ids(
        session,
        source_url,
        timeout,
        object_id_field,
        page_size,
        limit,
    )


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


def features_to_geodataframe(features: list[dict[str, Any]]) -> gpd.GeoDataFrame:
    if not features:
        raise ValueError("No features were downloaded.")
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


def verify_database(engine: Engine) -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        postgis_version = connection.execute(text("SELECT postgis_full_version()")).scalar_one()
        logging.info("PostGIS available: %s", postgis_version)


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def write_to_postgis(
    gdf: gpd.GeoDataFrame,
    engine: Engine,
    schema: str,
    table: str,
    if_exists: str,
) -> None:
    logging.info("Writing %s features to %s.%s", len(gdf), schema, table)
    gdf.to_postgis(
        name=table,
        con=engine,
        schema=schema,
        if_exists=if_exists,
        index=False,
    )


def create_spatial_index(engine: Engine, schema: str, table: str) -> None:
    index_name = f"{table}_geometry_gix"
    with engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {quote_identifier(index_name)} "
                f"ON {quote_identifier(schema)}.{quote_identifier(table)} "
                "USING GIST (geometry)"
            )
        )
        connection.execute(text(f"ANALYZE {quote_identifier(schema)}.{quote_identifier(table)}"))


def get_table_indexes(engine: Engine, schema: str, table: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = :schema
                  AND tablename = :table
                ORDER BY indexname
                """
            ),
            {"schema": schema, "table": table},
        ).mappings()
        return [dict(row) for row in rows]


def summarize_gdf(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    return {
        "feature_count": int(len(gdf)),
        "geometry_types": sorted(str(value) for value in gdf.geometry.geom_type.dropna().unique()),
        "crs": str(gdf.crs),
        "columns": list(gdf.columns),
        "sample_columns": list(gdf.columns[:15]),
    }


def ingest_source(
    source: dict[str, Any],
    session: Session,
    engine: Engine | None,
    args: argparse.Namespace,
) -> dict[str, Any]:
    logging.info("Ingesting zoning source %s -> %s.%s", source["id"], source["schema"], source["raw_table"])
    metadata = fetch_layer_metadata(session, source["url"], args.timeout)
    page_size = get_page_size(metadata, args.page_size)
    features = download_features(
        session=session,
        source_url=source["url"],
        metadata=metadata,
        timeout=args.timeout,
        page_size=page_size,
        limit=args.limit,
    )
    gdf = features_to_geodataframe(features)
    gdf_summary = summarize_gdf(gdf)

    database_written = False
    indexes: list[dict[str, Any]] = []
    if args.skip_db:
        logging.warning("Skipping database write for %s because --skip-db was supplied.", source["id"])
    else:
        if engine is None:
            raise RuntimeError("Database engine is required unless --skip-db is supplied.")
        write_to_postgis(gdf, engine, source["schema"], source["raw_table"], args.if_exists)
        create_spatial_index(engine, source["schema"], source["raw_table"])
        indexes = get_table_indexes(engine, source["schema"], source["raw_table"])
        database_written = True

    metadata_fields = [
        {
            "name": field.get("name"),
            "type": field.get("type"),
            "alias": field.get("alias"),
            "length": field.get("length"),
        }
        for field in metadata.get("fields", [])
    ]
    return {
        "id": source["id"],
        "jurisdiction_name": source["jurisdiction_name"],
        "source_url": source["url"],
        "raw_table": f"{source['schema']}.{source['raw_table']}",
        "arcgis_name": metadata.get("name"),
        "arcgis_geometry_type": metadata.get("geometryType"),
        "arcgis_object_id_field": metadata.get("objectIdField") or get_object_id_field(metadata),
        "arcgis_fields": metadata_fields,
        "expected_fields": source.get("expected_fields", []),
        **gdf_summary,
        "database_written": database_written,
        "indexes": indexes,
    }


def write_summary(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    start_time = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS multi-jurisdiction zoning ingestion.")
    logging.info("Log file: %s", log_path)
    try:
        sources = load_sources(args.config, args.source_id)
        session = create_requests_session()
        engine = None
        if not args.skip_db:
            engine = create_engine_from_env()
            verify_database(engine)

        source_summaries = [
            ingest_source(source, session, engine, args)
            for source in sources
        ]
        if engine:
            engine.dispose()

        duration_seconds = round(time.perf_counter() - start_time, 2)
        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "config_path": str(args.config),
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
            },
            "source_count": len(source_summaries),
            "total_feature_count": sum(item["feature_count"] for item in source_summaries),
            "sources": source_summaries,
            "duration_seconds": duration_seconds,
            "log_path": str(log_path),
            "outputs": {"summary_json": str(SUMMARY_OUTPUT)},
        }
        write_summary(summary)
        logging.info("Wrote zoning sources ingestion summary: %s", SUMMARY_OUTPUT)
        logging.info("Total zoning feature count: %s", summary["total_feature_count"])
        logging.info("Ingestion duration: %s seconds", duration_seconds)
        return 0
    except Exception:
        logging.exception("CFS multi-jurisdiction zoning ingestion failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
