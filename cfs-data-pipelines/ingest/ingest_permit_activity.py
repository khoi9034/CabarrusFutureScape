"""Ingest the first CFS permit/development activity pilot source.

This local-development pilot reads the configured public Cabarrus OpenData
permit activity source, writes it to public.permit_activity, and creates basic
operational indexes. It does not modify the frontend dashboard, build APIs,
connect production permitting systems, connect permits to parcels, or add
forecasting/AI.
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
from sqlalchemy import URL, create_engine, inspect, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DEFAULT_OUT_SR = 4326

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PIPELINE_ROOT / "config" / "permit_activity_sources.json"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = PIPELINE_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "permit_activity_ingest_summary.json"


class ArcGISRestError(RuntimeError):
    """Raised when an ArcGIS REST request returns an error payload."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest configured permit activity source into local PostGIS.",
    )
    parser.add_argument("--config", default=str(CONFIG_PATH))
    parser.add_argument("--source-id", default=None)
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
    log_path = LOG_DIR / f"ingest_permit_activity_{timestamp}.log"
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )
    return log_path


def load_source_config(config_path: Path, source_id: str | None) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = config.get("sources", [])
    if source_id:
        matching = [source for source in sources if source.get("id") == source_id]
    else:
        matching = [source for source in sources if source.get("enabled")]

    if not matching:
        raise RuntimeError(
            "No enabled permit activity source is configured. Add an approved "
            "source URL to config/permit_activity_sources.json."
        )

    source = matching[0]
    if not source.get("enabled"):
        raise RuntimeError(f"Configured permit activity source is disabled: {source.get('id')}")
    if not str(source.get("url", "")).startswith("https://"):
        raise RuntimeError(f"Permit activity source URL is missing or unsafe: {source.get('url')}")

    return source


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
        {"User-Agent": "CabarrusFutureScape-PermitActivityIngestion/0.1"}
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


def fetch_layer_metadata(session: Session, source_url: str, timeout: int) -> dict[str, Any]:
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
        {"f": "pjson", "returnCountOnly": "true", "where": "1=1"},
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


def supports_pagination(metadata: dict[str, Any]) -> bool:
    capabilities = metadata.get("advancedQueryCapabilities") or {}
    return bool(capabilities.get("supportsPagination"))


def get_page_size(metadata: dict[str, Any], requested_page_size: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)
    if requested_page_size is None:
        return max_record_count
    if requested_page_size < 1:
        raise ValueError("--page-size must be greater than zero.")
    return min(requested_page_size, max_record_count)


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
    target_count = min(total_count, limit) if limit else total_count
    features: list[dict[str, Any]] = []
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
            logging.warning("No permit activity features returned at offset=%s.", offset)
            break

        features.extend(page_features)
        offset += len(page_features)
        logging.info("Downloaded %s/%s permit features", len(features), target_count)

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
            "returnGeometry": "false",
            "returnIdsOnly": "true",
            "where": "1=1",
        },
        timeout,
    )
    object_ids = payload.get("objectIds") or []
    if not object_ids:
        raise ArcGISRestError("ArcGIS REST source returned no permit object IDs.")
    return sorted(int(object_id) for object_id in object_ids)


def download_features_with_object_ids(
    session: Session,
    source_url: str,
    timeout: int,
    object_id_field: str,
    page_size: int,
    limit: int | None,
) -> list[dict[str, Any]]:
    logging.info("Downloading permit activity features with object ID fallback.")
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
        logging.info("Downloaded %s/%s permit features", len(features), len(object_ids))

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


def features_to_geodataframe(
    features: list[dict[str, Any]],
    source: dict[str, Any],
) -> gpd.GeoDataFrame:
    if not features:
        raise ValueError("No permit activity features were downloaded.")

    logging.info("Building GeoDataFrame from %s permit features.", len(features))
    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{DEFAULT_OUT_SR}")
    gdf = normalize_columns(gdf)
    gdf = gdf.set_geometry("geometry")

    gdf["cfs_source_id"] = source["id"]
    gdf["cfs_source_name"] = source["name"]
    gdf["cfs_source_url"] = source["url"]
    gdf["cfs_source_year"] = source.get("source_year")
    gdf["cfs_ingested_at"] = datetime.now().isoformat(timespec="seconds")

    null_geometry_count = int(gdf.geometry.isna().sum())
    if null_geometry_count:
        logging.warning(
            "%s permit activity features have null geometry and will be preserved.",
            null_geometry_count,
        )

    return gdf


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "CFS_POSTGRES_PASSWORD is not set. Export it before permit ingestion."
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
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        postgis_version = connection.execute(text("SELECT postgis_full_version()")).scalar_one()
        logging.info("PostGIS available: %s", postgis_version)


def write_to_postgis(
    gdf: gpd.GeoDataFrame,
    engine: Engine,
    schema: str,
    table: str,
    if_exists: str,
) -> None:
    logging.info(
        "Writing %s permit activity features to %s.%s with if_exists=%s.",
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


def quote_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def create_indexes(engine: Engine, schema: str, table: str) -> list[str]:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns(table, schema=schema)}
    index_specs = [
        ("geometry", "gist"),
        ("permitnumber", "btree"),
        ("pin14", "btree"),
        ("status", "btree"),
        ("permittype", "btree"),
        ("permitcategory", "btree"),
        ("filedate", "btree"),
    ]

    created_indexes: list[str] = []
    with engine.begin() as connection:
        for column_name, index_type in index_specs:
            if column_name not in columns:
                continue
            index_name = f"{table}_{column_name}_{'gix' if index_type == 'gist' else 'idx'}"
            logging.info("Creating %s index %s on %s.%s(%s).", index_type, index_name, schema, table, column_name)
            using_clause = " USING GIST" if index_type == "gist" else ""
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS {quote_identifier(index_name)} "
                    f"ON {quote_identifier(schema)}.{quote_identifier(table)}"
                    f"{using_clause} ({quote_identifier(column_name)})"
                )
            )
            created_indexes.append(index_name)
        connection.execute(text(f"ANALYZE {quote_identifier(schema)}.{quote_identifier(table)}"))

    return created_indexes


def log_geodataframe_summary(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    geometry_types = sorted(str(value) for value in gdf.geometry.geom_type.dropna().unique())
    summary = {
        "feature_count": int(len(gdf)),
        "geometry_types": geometry_types,
        "null_geometry_count": int(gdf.geometry.isna().sum()),
        "crs": str(gdf.crs),
        "sample_columns": list(gdf.columns[:20]),
        "permit_id_candidates": [
            column for column in gdf.columns if "permit" in column and "number" in column
        ],
        "parcel_pin_candidates": [
            column for column in gdf.columns if column in {"pin14", "parcel_id", "parcelid"}
        ],
        "date_candidates": [
            column for column in gdf.columns if "date" in column or column.endswith("_dt")
        ],
    }
    logging.info("GeoDataFrame feature count: %s", summary["feature_count"])
    logging.info("Geometry type(s): %s", ", ".join(geometry_types) or "none")
    logging.info("CRS: %s", summary["crs"])
    logging.info("Sample columns: %s", ", ".join(summary["sample_columns"]))
    return summary


def write_summary_file(summary: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logging.info("Wrote permit activity ingestion summary: %s", SUMMARY_OUTPUT)


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    logging.info("Starting CFS permit activity ingestion pilot.")

    try:
        source = load_source_config(Path(args.config), args.source_id)
        session = create_requests_session()
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
        gdf = features_to_geodataframe(features, source)
        gdf_summary = log_geodataframe_summary(gdf)

        database_written = False
        created_indexes: list[str] = []
        schema = source.get("target_schema", "public")
        table = source.get("target_table", "permit_activity")
        if args.skip_db:
            logging.warning("Skipping PostGIS write because --skip-db was supplied.")
        else:
            engine = create_engine_from_env()
            verify_database(engine)
            write_to_postgis(gdf, engine, schema, table, args.if_exists)
            created_indexes = create_indexes(engine, schema, table)
            engine.dispose()
            database_written = True

        summary = {
            **gdf_summary,
            "arcgis_layer_url": source["url"],
            "source": {
                "id": source["id"],
                "name": source["name"],
                "source_status": source.get("source_status"),
                "source_year": source.get("source_year"),
            },
            "database": {
                "host": DEFAULT_DB_HOST,
                "port": DEFAULT_DB_PORT,
                "database": DEFAULT_DB_NAME,
                "schema": schema,
                "table": table,
                "written": database_written,
                "if_exists": args.if_exists,
                "indexes": created_indexes,
            },
            "duration_seconds": round(time.perf_counter() - started_at, 2),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "log_path": str(log_path),
        }
        write_summary_file(summary)
        logging.info("CFS permit activity ingestion pilot complete.")
        return 0
    except Exception:
        logging.exception("CFS permit activity ingestion failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
