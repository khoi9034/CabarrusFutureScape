"""Ingest configured CFS planning/ETJ boundary sources into local PostGIS."""

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
CONFIG_PATH = PIPELINE_ROOT / "config" / "planning_boundary_sources.json"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "planning_boundaries_ingest_summary.json"


class ArcGISRestError(RuntimeError):
    """Raised when the ArcGIS REST source returns an error payload."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest CFS planning boundary sources.")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
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
    parser.add_argument("--skip-db", action="store_true")
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_planning_boundaries_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def load_source(config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = config.get("sources", [])
    if len(sources) != 1:
        raise ValueError("planning_boundary_sources.json must contain exactly one source for this pilot.")
    return sources[0]


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
    session.headers.update({"User-Agent": "CabarrusFutureScape-PlanningBoundaryIngest/0.1"})
    return session


def request_json(session: Session, url: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        error = payload["error"]
        raise ArcGISRestError(f"{error.get('message', 'ArcGIS REST error')}: {error.get('details', [])}")
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


def get_object_id_field(metadata: dict[str, Any]) -> str:
    if metadata.get("objectIdField"):
        return str(metadata["objectIdField"])
    for field in metadata.get("fields", []):
        if field.get("type") == "esriFieldTypeOID":
            oid_field = str(field["name"])
            logging.warning("Layer metadata has no objectIdField; using OID field %s.", oid_field)
            return oid_field
    raise ValueError("Could not determine object ID field.")


def get_page_size(metadata: dict[str, Any], requested_page_size: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)
    if requested_page_size is None:
        return max_record_count
    if requested_page_size < 1:
        raise ValueError("--page-size must be greater than zero.")
    return min(requested_page_size, max_record_count)


def supports_pagination(metadata: dict[str, Any]) -> bool:
    return bool((metadata.get("advancedQueryCapabilities") or {}).get("supportsPagination"))


def fetch_feature_count(session: Session, source_url: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{source_url}/query",
        {"f": "pjson", "returnCountOnly": "true", "where": "1=1"},
        timeout,
    )
    return int(payload.get("count", 0))


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
    target_count = min(total_count, limit) if limit else total_count
    logging.info("Source feature count: %s", total_count)
    features: list[dict[str, Any]] = []

    if supports_pagination(metadata):
        offset = 0
        while len(features) < target_count:
            requested_count = min(page_size, target_count - len(features))
            payload = request_json(
                session,
                f"{source_url}/query",
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
                timeout,
            )
            page_features = payload.get("features", [])
            if not page_features:
                break
            features.extend(page_features)
            offset += len(page_features)
            logging.info("Downloaded %s/%s boundary features", len(features), target_count)

    if not features:
        raise ArcGISRestError("No planning boundary features were downloaded.")
    return features[:target_count]


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
    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{DEFAULT_OUT_SR}")
    gdf = normalize_columns(gdf).set_geometry("geometry")
    null_geometry_count = int(gdf.geometry.isna().sum())
    if null_geometry_count:
        logging.warning("Dropping %s null planning boundary geometries.", null_geometry_count)
        gdf = gdf[gdf.geometry.notna()].copy()
    if gdf.empty:
        raise ValueError("All planning boundary features had null geometries.")
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


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def write_to_postgis(gdf: gpd.GeoDataFrame, engine: Engine, schema: str, table: str, if_exists: str) -> None:
    gdf.to_postgis(name=table, con=engine, schema=schema, if_exists=if_exists, index=False)


def create_spatial_index(engine: Engine, schema: str, table: str) -> None:
    index_name = f"{table}_geometry_gix"
    with engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {quote_identifier(index_name)} "
                f"ON {quote_identifier(schema)}.{quote_identifier(table)} USING GIST (geometry)"
            )
        )
        connection.execute(text(f"ANALYZE {quote_identifier(schema)}.{quote_identifier(table)}"))


def summarize_gdf(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    return {
        "feature_count": int(len(gdf)),
        "geometry_types": sorted(str(value) for value in gdf.geometry.geom_type.dropna().unique()),
        "crs": str(gdf.crs),
        "columns": list(gdf.columns),
        "sample_records": gdf.drop(columns="geometry").head(20).to_dict(orient="records"),
    }


def write_summary(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(
        json.dumps(normalize_json_value(summary), indent=2),
        encoding="utf-8",
    )


def normalize_json_value(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
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
    logging.info("Starting CFS planning boundary ingestion.")
    logging.info("Log file: %s", log_path)
    try:
        source = load_source(args.config)
        session = create_requests_session()
        metadata = fetch_layer_metadata(session, source["url"], args.timeout)
        page_size = get_page_size(metadata, args.page_size)
        features = download_features(session, source["url"], metadata, args.timeout, page_size, args.limit)
        gdf = features_to_geodataframe(features)
        gdf_summary = summarize_gdf(gdf)

        database_written = False
        if args.skip_db:
            logging.warning("Skipping database write because --skip-db was supplied.")
        else:
            engine = create_engine_from_env()
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                connection.execute(text("SELECT postgis_full_version()")).scalar_one()
            write_to_postgis(gdf, engine, source["schema"], source["raw_table"], args.if_exists)
            create_spatial_index(engine, source["schema"], source["raw_table"])
            engine.dispose()
            database_written = True

        duration_seconds = round(time.perf_counter() - start_time, 2)
        metadata_fields = [
            {
                "name": field.get("name"),
                "type": field.get("type"),
                "alias": field.get("alias"),
                "length": field.get("length"),
            }
            for field in metadata.get("fields", [])
        ]
        summary = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "config_path": str(args.config),
            "source": {
                **source,
                "arcgis_name": metadata.get("name"),
                "arcgis_geometry_type": metadata.get("geometryType"),
                "arcgis_object_id_field": metadata.get("objectIdField") or get_object_id_field(metadata),
                "arcgis_fields": metadata_fields,
            },
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "schema": source["schema"],
                "table": source["raw_table"],
                "written": database_written,
            },
            **gdf_summary,
            "duration_seconds": duration_seconds,
            "log_path": str(log_path),
            "outputs": {"summary_json": str(SUMMARY_OUTPUT)},
        }
        write_summary(summary)
        logging.info("Wrote planning boundary ingestion summary: %s", SUMMARY_OUTPUT)
        logging.info("Planning boundary feature count: %s", summary["feature_count"])
        return 0
    except Exception:
        logging.exception("CFS planning boundary ingestion failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
