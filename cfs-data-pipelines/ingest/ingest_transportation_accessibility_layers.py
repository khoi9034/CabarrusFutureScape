"""Ingest Phase 12B transportation/accessibility road and rail geometries.

This script creates raw/clean transportation tables and loads only the
registered road and rail layers. It does not create model outputs, train a
model, or ingest planned transportation projects.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
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
CONFIG_PATH = REPO_ROOT / "config" / "transportation_accessibility_sources.json"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_transportation_accessibility_tables.sql"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = REPO_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "transportation_centerline_ingest_summary.json"

REST_RELOCATION_WARNING = (
    "Cabarrus REST services may move during ongoing layer organization. If a URL "
    "fails, inspect service roots and update registry/fallback URLs before marking unavailable."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--include-legacy-road-comparison", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_transportation_accessibility_layers_{timestamp}.log"
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


def create_requests_session() -> Session:
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
    session.headers.update({"User-Agent": "CabarrusFutureScape-TransportationIngest/0.1"})
    return session


def execute_sql_file(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(SQL_FILE.read_text(encoding="utf-8")))


def truncate_tables(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                TRUNCATE
                  public.transportation_centerlines_raw,
                  public.transportation_centerlines_clean,
                  public.transportation_rail_raw,
                  public.transportation_rail_clean,
                  public.parcel_transportation_accessibility_features
                RESTART IDENTITY
                """,
            ),
        )


def load_sources(config_path: Path) -> list[dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    return list(config.get("sources", []))


def get_source(sources: list[dict[str, Any]], source_key: str) -> dict[str, Any] | None:
    for source in sources:
        if source.get("source_key") == source_key:
            return source
    return None


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


def fetch_count(session: Session, layer_url: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": "1=1", "returnCountOnly": "true"},
        timeout,
    )
    return int(payload.get("count") or 0)


def object_id_field(metadata: dict[str, Any]) -> str:
    explicit = metadata.get("objectIdField")
    if explicit:
        return str(explicit)
    for field in metadata.get("fields", []):
        if "oid" in str(field.get("type", "")).lower():
            return str(field.get("name"))
    return "OBJECTID"


def max_record_count(metadata: dict[str, Any], fallback: int | None) -> int:
    if fallback:
        return fallback
    value = metadata.get("maxRecordCount") or 2000
    return min(int(value), 5000)


def request_geojson_page(
    session: Session,
    layer_url: str,
    offset: int,
    page_size: int,
    timeout: int,
) -> dict[str, Any]:
    params = {
        "f": "geojson",
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": 4326,
        "resultOffset": offset,
        "resultRecordCount": page_size,
    }
    response = session.get(f"{layer_url}/query", params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict) and "error" in payload:
        error = payload["error"]
        details = "; ".join(error.get("details", []))
        raise RuntimeError(f"{layer_url}: {error.get('message', 'ArcGIS REST error')} {details}")
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise RuntimeError(f"{layer_url}: GeoJSON FeatureCollection was not returned")
    return payload


def download_features(
    session: Session,
    layer_url: str,
    metadata: dict[str, Any],
    total_count: int,
    timeout: int,
    page_size_override: int | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    page_size = max_record_count(metadata, page_size_override)
    target_count = min(total_count, limit) if limit else total_count
    features: list[dict[str, Any]] = []
    offset = 0
    while len(features) < target_count:
        payload = request_geojson_page(session, layer_url, offset, page_size, timeout)
        page_features = payload.get("features") or []
        if not page_features:
            break
        remaining = target_count - len(features)
        features.extend(page_features[:remaining])
        logging.info("Downloaded %s/%s from %s", len(features), target_count, layer_url)
        if len(page_features) < page_size:
            break
        offset += page_size
    return features


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


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", str(value).strip())
    return normalized or None


def normalize_int(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(float(str(value)))
    except ValueError:
        return None


def compact_jurisdiction(properties: dict[str, Any]) -> str | None:
    values = [
        normalize_text(first_present(properties, "CityLeft")),
        normalize_text(first_present(properties, "CityRight")),
        normalize_text(first_present(properties, "StateLeft")),
        normalize_text(first_present(properties, "StateRight")),
    ]
    unique = []
    for value in values:
        if value and value not in unique:
            unique.append(value)
    return " / ".join(unique) if unique else None


MAJOR_ROAD_TOKENS = (
    "interstate",
    "highway",
    "freeway",
    "expressway",
    "arterial",
    "principal",
    "primary",
    "major",
    "us route",
    "nc route",
)


def classify_major_road(road_class: str | None, route_type: str | None) -> tuple[bool | None, str | None]:
    haystack = " ".join(value.lower() for value in (road_class, route_type) if value)
    if not haystack:
        return None, None
    if any(token in haystack for token in MAJOR_ROAD_TOKENS):
        return True, "source_road_class_keyword"
    return None, None


def delete_source_rows(engine: Engine, source_key: str, source_type: str) -> None:
    with engine.begin() as connection:
        if source_type == "road_centerline":
            connection.execute(
                text("DELETE FROM public.transportation_centerlines_raw WHERE source_key = :source_key"),
                {"source_key": source_key},
            )
            connection.execute(
                text("DELETE FROM public.transportation_centerlines_clean WHERE source_key = :source_key"),
                {"source_key": source_key},
            )
        elif source_type in {"rail_centerline", "rail_corridor"}:
            connection.execute(
                text("DELETE FROM public.transportation_rail_raw WHERE source_key = :source_key"),
                {"source_key": source_key},
            )
            connection.execute(
                text("DELETE FROM public.transportation_rail_clean WHERE source_key = :source_key"),
                {"source_key": source_key},
            )


def insert_road_features(
    engine: Engine,
    source: dict[str, Any],
    features: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> dict[str, int]:
    oid = object_id_field(metadata)
    source_sr = metadata.get("spatialReference")
    raw_insert = text(
        """
        INSERT INTO public.transportation_centerlines_raw (
            source_key, source_name, source_objectid, layer_id, source_url,
            source_spatial_reference, attributes, geometry
        )
        VALUES (
            :source_key, :source_name, :source_objectid, :layer_id, :source_url,
            CAST(:source_spatial_reference AS jsonb), CAST(:attributes AS jsonb),
            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)
        )
        """,
    )
    clean_insert = text(
        """
        INSERT INTO public.transportation_centerlines_clean (
            source_key, source_name, source_objectid, road_name, road_type,
            road_class, route_type, jurisdiction_or_maintenance, speed_limit,
            one_way, is_major_road, major_road_classification_method,
            geometry, geometry_ft, geometry_length_ft
        )
        VALUES (
            :source_key, :source_name, :source_objectid, :road_name, :road_type,
            :road_class, :route_type, :jurisdiction_or_maintenance, :speed_limit,
            :one_way, :is_major_road, :major_road_classification_method,
            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 2)),
            ST_Transform(
                ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 2)),
                2264
            ),
            ST_Length(
                ST_Transform(
                    ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 2)),
                    2264
                )
            )
        )
        """
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    for feature in features:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        source_objectid = first_present(properties, oid, "OBJECTID", "OBJECTID_1") or feature.get("id")
        road_class = normalize_text(first_present(properties, "Category", "road_class", "class"))
        route_type = normalize_text(first_present(properties, "route_type", "RouteType"))
        is_major, major_method = classify_major_road(road_class, route_type)
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_objectid": str(source_objectid) if source_objectid is not None else None,
            "layer_id": int(source["layer_id"]),
            "source_url": source["full_layer_url"],
            "source_spatial_reference": json.dumps(source_sr or {}, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "road_name": normalize_text(first_present(properties, "street", "plainst", "Name")),
                "road_type": normalize_text(first_present(properties, "streettype", "road_type")),
                "road_class": road_class,
                "route_type": route_type,
                "jurisdiction_or_maintenance": compact_jurisdiction(properties),
                "speed_limit": normalize_int(first_present(properties, "Speed", "speed_limit")),
                "one_way": normalize_text(first_present(properties, "Oneway", "one_way")),
                "is_major_road": is_major,
                "major_road_classification_method": major_method,
            },
        )
    with engine.begin() as connection:
        if raw_rows:
            connection.execute(raw_insert, raw_rows)
        if clean_rows:
            connection.execute(clean_insert, clean_rows)
    return {"raw_rows": len(raw_rows), "clean_rows": len(clean_rows)}


def insert_rail_features(
    engine: Engine,
    source: dict[str, Any],
    features: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> dict[str, int]:
    oid = object_id_field(metadata)
    source_sr = metadata.get("spatialReference")
    is_corridor = source.get("source_type") == "rail_corridor"
    geometry_extract_type = 3 if is_corridor else 2
    geom_4326 = (
        "ST_Multi(ST_CollectionExtract("
        "ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), "
        f"{geometry_extract_type}))"
    )
    geom_ft = f"ST_Transform({geom_4326}, 2264)"
    length_expr = f"ST_Perimeter({geom_ft})" if is_corridor else f"ST_Length({geom_ft})"
    raw_insert = text(
        """
        INSERT INTO public.transportation_rail_raw (
            source_key, source_name, source_objectid, layer_id, source_url,
            source_spatial_reference, attributes, geometry
        )
        VALUES (
            :source_key, :source_name, :source_objectid, :layer_id, :source_url,
            CAST(:source_spatial_reference AS jsonb), CAST(:attributes AS jsonb),
            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)
        )
        """,
    )
    clean_insert = text(
        f"""
        INSERT INTO public.transportation_rail_clean (
            source_key, source_name, source_objectid, rail_name, rail_type,
            is_corridor, road_name, road_type, road_class, route_type,
            jurisdiction_or_maintenance, geometry, geometry_ft, geometry_length_ft
        )
        VALUES (
            :source_key, :source_name, :source_objectid, :rail_name, :rail_type,
            :is_corridor, NULL, NULL, NULL, :route_type,
            NULL,
            {geom_4326},
            {geom_ft},
            {length_expr}
        )
        """
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    for feature in features:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        source_objectid = first_present(properties, oid, "OBJECTID", "OBJECTID_1") or feature.get("id")
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_objectid": str(source_objectid) if source_objectid is not None else None,
            "layer_id": int(source["layer_id"]),
            "source_url": source["full_layer_url"],
            "source_spatial_reference": json.dumps(source_sr or {}, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "rail_name": normalize_text(first_present(properties, "Rail_Line", "Name")),
                "rail_type": normalize_text(first_present(properties, "Trk_Type", "Trk_SubTyp", "Name")),
                "is_corridor": is_corridor,
                "route_type": normalize_text(first_present(properties, "Trk_Type", "Trk_SubTyp")),
            },
        )
    with engine.begin() as connection:
        if raw_rows:
            connection.execute(raw_insert, raw_rows)
        if clean_rows:
            connection.execute(clean_insert, clean_rows)
    return {"raw_rows": len(raw_rows), "clean_rows": len(clean_rows)}


def ingest_source(
    engine: Engine | None,
    session: Session,
    source: dict[str, Any],
    args: argparse.Namespace,
    role: str,
) -> dict[str, Any]:
    layer_url = source["full_layer_url"]
    source_type = source["source_type"]
    try:
        metadata = fetch_metadata(session, layer_url, args.timeout)
        total_count = fetch_count(session, layer_url, args.timeout)
        features = download_features(
            session,
            layer_url,
            metadata,
            total_count,
            args.timeout,
            args.page_size,
            args.limit,
        )
        inserted = {"raw_rows": 0, "clean_rows": 0}
        if not args.dry_run and engine is not None:
            delete_source_rows(engine, source["source_key"], source_type)
            if source_type == "road_centerline":
                inserted = insert_road_features(engine, source, features, metadata)
            elif source_type in {"rail_centerline", "rail_corridor"}:
                inserted = insert_rail_features(engine, source, features, metadata)
        return {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_type": source_type,
            "role": role,
            "layer_id": source["layer_id"],
            "full_layer_url": layer_url,
            "status": "ok",
            "record_count": total_count,
            "downloaded_features": len(features),
            "inserted_raw_rows": inserted["raw_rows"],
            "inserted_clean_rows": inserted["clean_rows"],
            "geometry_type": metadata.get("geometryType"),
            "error": None,
        }
    except Exception as error:  # noqa: BLE001 - keep other layers moving.
        logging.exception("Failed transportation source: %s", source["source_key"])
        return {
            "source_key": source["source_key"],
            "source_name": source.get("source_name"),
            "source_type": source_type,
            "role": role,
            "layer_id": source.get("layer_id"),
            "full_layer_url": layer_url,
            "status": "failed",
            "record_count": None,
            "downloaded_features": 0,
            "inserted_raw_rows": 0,
            "inserted_clean_rows": 0,
            "geometry_type": None,
            "error": f"{error}; {REST_RELOCATION_WARNING}",
        }


def summarize_database(engine: Engine | None) -> dict[str, Any]:
    if engine is None:
        return {}
    with engine.connect() as connection:
        return {
            "road_raw_rows": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_centerlines_raw"),
                ).scalar_one(),
            ),
            "road_clean_rows": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_centerlines_clean"),
                ).scalar_one(),
            ),
            "rail_raw_rows": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_rail_raw"),
                ).scalar_one(),
            ),
            "rail_clean_rows": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_rail_clean"),
                ).scalar_one(),
            ),
            "invalid_road_geometry_count": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_centerlines_clean WHERE NOT ST_IsValid(geometry)"),
                ).scalar_one(),
            ),
            "invalid_rail_geometry_count": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_rail_clean WHERE NOT ST_IsValid(geometry)"),
                ).scalar_one(),
            ),
            "major_road_clean_rows": int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.transportation_centerlines_clean WHERE is_major_road IS TRUE"),
                ).scalar_one(),
            ),
        }


def main() -> int:
    args = parse_args()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = load_sources(args.config)
    session = create_requests_session()
    engine: Engine | None = None
    if not args.dry_run:
        engine = create_engine_from_env()
        execute_sql_file(engine)
        if args.truncate_and_load:
            truncate_tables(engine)

    primary_road = get_source(sources, "cabarrus_county_centerlines_dedicated")
    legacy_road = get_source(sources, "opendata_streets_centerline_legacy")
    rail_sources = [
        source
        for source in sources
        if source.get("source_type") in {"rail_centerline", "rail_corridor"}
    ]

    layer_results: list[dict[str, Any]] = []
    primary_result: dict[str, Any] | None = None
    if primary_road:
        primary_result = ingest_source(engine, session, primary_road, args, "primary_road_source")
        layer_results.append(primary_result)

    if (
        legacy_road
        and (
            args.include_legacy_road_comparison
            or not primary_result
            or primary_result.get("status") != "ok"
        )
    ):
        role = (
            "legacy_comparison_road_source"
            if args.include_legacy_road_comparison and primary_result and primary_result.get("status") == "ok"
            else "fallback_road_source"
        )
        layer_results.append(ingest_source(engine, session, legacy_road, args, role))
    elif legacy_road:
        layer_results.append(
            {
                "source_key": legacy_road["source_key"],
                "source_name": legacy_road["source_name"],
                "source_type": legacy_road["source_type"],
                "role": "fallback_not_needed",
                "layer_id": legacy_road["layer_id"],
                "full_layer_url": legacy_road["full_layer_url"],
                "status": "skipped",
                "record_count": None,
                "downloaded_features": 0,
                "inserted_raw_rows": 0,
                "inserted_clean_rows": 0,
                "geometry_type": None,
                "error": None,
            },
        )

    for source in rail_sources:
        layer_results.append(ingest_source(engine, session, source, args, "rail_source"))

    summary = {
        "phase": "12B_transportation_accessibility_geometry_ingest",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "truncate_and_load": args.truncate_and_load,
        "include_legacy_road_comparison": args.include_legacy_road_comparison,
        "rest_source_relocation_warning": REST_RELOCATION_WARNING,
        "sources_requested": len(layer_results),
        "sources_ingested": [
            result for result in layer_results if result.get("status") == "ok"
        ],
        "sources_failed": [
            result for result in layer_results if result.get("status") == "failed"
        ],
        "sources_skipped": [
            result for result in layer_results if result.get("status") == "skipped"
        ],
        "road_records_ingested": sum(
            int(result.get("inserted_clean_rows") or 0)
            for result in layer_results
            if result.get("source_type") == "road_centerline"
        ),
        "rail_records_ingested": sum(
            int(result.get("inserted_clean_rows") or 0)
            for result in layer_results
            if result.get("source_type") in {"rail_centerline", "rail_corridor"}
        ),
        "layer_results": layer_results,
        "database_summary": summarize_database(engine),
        "log_path": str(log_path),
        "current_context_only": True,
        "model_active": False,
        "prediction_probability_available": False,
    }
    SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2, ensure_ascii=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0 if not summary["sources_failed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
