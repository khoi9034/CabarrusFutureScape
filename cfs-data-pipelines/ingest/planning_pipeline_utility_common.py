"""Shared helpers for Phase 16A planning/pipeline/utility source ingestion."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import requests
from requests import Session
from requests.adapters import HTTPAdapter
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry


DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
CONFIG_PATH = REPO_ROOT / "config" / "planning_pipeline_utility_sources.json"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_planning_pipeline_utility_feature_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"


def create_engine_from_env() -> Engine:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError("CFS_POSTGRES_PASSWORD or POSTGRES_PASSWORD is not set.")
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def create_requests_session(user_agent: str) -> Session:
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": user_agent})
    return session


def execute_sql_file(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(SQL_FILE.read_text(encoding="utf-8")))


def load_sources(source_group: str | None = None, config_path: Path = CONFIG_PATH) -> list[dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sources = list(config.get("sources", []))
    if source_group:
        sources = [source for source in sources if source.get("source_group") == source_group]
    return sources


def request_json(session: Session, url: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and "error" in payload:
        error = payload["error"]
        details = "; ".join(error.get("details", []))
        raise RuntimeError(f"{url}: {error.get('message', 'ArcGIS REST error')} {details}")
    if not isinstance(payload, dict):
        raise RuntimeError(f"{url}: response was not a JSON object")
    return payload


def fetch_metadata(session: Session, layer_url: str, timeout: int) -> dict[str, Any]:
    return request_json(session, layer_url, {"f": "json"}, timeout)


def fetch_count(session: Session, layer_url: str, where: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": where, "returnCountOnly": "true"},
        timeout,
    )
    return int(payload.get("count") or 0)


def max_record_count(metadata: dict[str, Any], override: int | None) -> int:
    if override:
        return override
    return min(int(metadata.get("maxRecordCount") or 1000), 5000)


def object_id_field(metadata: dict[str, Any]) -> str:
    explicit = metadata.get("objectIdField")
    if explicit:
        return str(explicit)
    for field in metadata.get("fields", []):
        if "oid" in str(field.get("type", "")).lower():
            return str(field.get("name"))
    return "OBJECTID"


def request_geojson_page(
    session: Session,
    layer_url: str,
    where: str,
    offset: int,
    page_size: int,
    timeout: int,
) -> dict[str, Any]:
    response = session.get(
        f"{layer_url}/query",
        params={
            "f": "geojson",
            "where": where,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
            "resultOffset": offset,
            "resultRecordCount": page_size,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and "error" in payload:
        error = payload["error"]
        details = "; ".join(error.get("details", []))
        raise RuntimeError(f"{layer_url}: {error.get('message', 'ArcGIS REST error')} {details}")
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise RuntimeError(f"{layer_url}: GeoJSON FeatureCollection was not returned")
    return payload


def fetch_object_ids(session: Session, layer_url: str, where: str, timeout: int) -> list[int]:
    payload = request_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": where, "returnIdsOnly": "true"},
        timeout,
    )
    object_ids = payload.get("objectIds") or []
    return sorted({int(object_id) for object_id in object_ids if object_id is not None})


def request_geojson_object_ids(
    session: Session,
    layer_url: str,
    object_ids: list[int],
    timeout: int,
) -> dict[str, Any]:
    response = session.get(
        f"{layer_url}/query",
        params={
            "f": "geojson",
            "objectIds": ",".join(str(object_id) for object_id in object_ids),
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and "error" in payload:
        error = payload["error"]
        details = "; ".join(error.get("details", []))
        raise RuntimeError(f"{layer_url}: {error.get('message', 'ArcGIS REST error')} {details}")
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise RuntimeError(f"{layer_url}: GeoJSON FeatureCollection was not returned")
    return payload


def download_features_by_object_ids(
    session: Session,
    layer_url: str,
    where: str,
    timeout: int,
    chunk_size: int,
    limit: int | None,
) -> tuple[int, list[dict[str, Any]]]:
    object_ids = fetch_object_ids(session, layer_url, where, timeout)
    selected_ids = object_ids[:limit] if limit else object_ids
    features: list[dict[str, Any]] = []
    for start in range(0, len(selected_ids), chunk_size):
        chunk = selected_ids[start : start + chunk_size]
        payload = request_geojson_object_ids(session, layer_url, chunk, timeout)
        page_features = payload.get("features") or []
        features.extend(page_features)
        logging.info("Downloaded %s/%s by object ID from %s", len(features), len(selected_ids), layer_url)
    return len(object_ids), features


def download_features(
    session: Session,
    layer_url: str,
    metadata: dict[str, Any],
    where: str,
    timeout: int,
    page_size_override: int | None,
    limit: int | None,
) -> tuple[int, list[dict[str, Any]]]:
    total_count = fetch_count(session, layer_url, where, timeout)
    page_size = max_record_count(metadata, page_size_override)
    target_count = min(total_count, limit) if limit else total_count
    features: list[dict[str, Any]] = []
    offset = 0
    while len(features) < target_count:
        payload = request_geojson_page(session, layer_url, where, offset, page_size, timeout)
        page_features = payload.get("features") or []
        if not page_features:
            break
        remaining = target_count - len(features)
        features.extend(page_features[:remaining])
        logging.info("Downloaded %s/%s from %s", len(features), target_count, layer_url)
        if len(page_features) < page_size:
            break
        offset += page_size
    return total_count, features


def first_present(properties: dict[str, Any], *names: str) -> Any:
    lowered = {str(key).lower(): key for key in properties}
    for name in names:
        actual = lowered.get(name.lower())
        if actual is None:
            continue
        value = properties.get(actual)
        if value is not None and str(value).strip() != "":
            return value
    return None


def first_field_like(properties: dict[str, Any], *tokens: str) -> Any:
    normalized_tokens = [token.lower() for token in tokens]
    for key, value in properties.items():
        key_text = str(key).lower()
        if value is not None and str(value).strip() != "" and any(token in key_text for token in normalized_tokens):
            return value
    return None


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", str(value).strip())
    return normalized or None


def normalize_int(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return None


def normalize_float(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def normalize_date(value: Any) -> date | None:
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, (int, float)) and value > 1000000000:
        try:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            return None
    text_value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text_value[:10], fmt).date()
        except ValueError:
            continue
    return None


def geometry_type_extract(metadata: dict[str, Any]) -> int:
    geometry_type = str(metadata.get("geometryType") or "").lower()
    if "polygon" in geometry_type:
        return 3
    if "polyline" in geometry_type or "line" in geometry_type:
        return 2
    if "point" in geometry_type:
        return 1
    return 0


def geometry_sql(metadata: dict[str, Any]) -> str:
    extract_type = geometry_type_extract(metadata)
    base = "ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geometry AS text)), 4326))"
    if extract_type == 0:
        return f"ST_MakeValid({base})"
    if extract_type == 1:
        return base
    return f"ST_Multi(ST_CollectionExtract(ST_MakeValid({base}), {extract_type}))"


def source_objectid(properties: dict[str, Any], metadata: dict[str, Any], feature: dict[str, Any]) -> str | None:
    oid = object_id_field(metadata)
    value = first_present(properties, oid, "OBJECTID", "OBJECTID_1", "FID") or feature.get("id")
    return str(value) if value is not None else None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
