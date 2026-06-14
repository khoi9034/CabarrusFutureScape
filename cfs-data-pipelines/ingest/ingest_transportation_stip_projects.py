"""Ingest Phase 13B NCDOT STIP project context for Cabarrus parcels.

The STIP source is useful planning context, but it is not a strict historical
feature source for CFS model backtesting. This script loads Cabarrus-related
STIP records only and preserves unavailable status/funding fields as null.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
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
CONFIG_PATH = REPO_ROOT / "config" / "found_planning_transportation_sources.json"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_transportation_plan_traffic_feature_tables.sql"
OUTPUT_DIR = REPO_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "stip_project_ingest_summary.json"

SOURCE_KEY = "ncdot_stip_2026_2035"
DEFAULT_WHERE = "UPPER(Counties) LIKE '%CABARRUS%'"
REST_RELOCATION_WARNING = (
    "Source may have moved due to Cabarrus/NCDOT REST service reorganization; "
    "check registry/fallback URL before marking unavailable."
)

FIELD_MAPPING = {
    "source_objectid": ["OBJECTID"],
    "project_name": ["TIP"],
    "project_description": ["Description"],
    "project_type": ["Category", "Mode"],
    "route_name": ["Route"],
    "county": ["Counties"],
    "jurisdiction": ["MPOsRPOs", "Divisions"],
    "construction_year": ["ConstructionYear"],
    "start_year": ["RightOfWayYear", "ConstructionYear"],
    "end_year": ["ConstructionYear", "RightOfWayYear"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--where", default=DEFAULT_WHERE)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


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
    session.headers.update({"User-Agent": "CabarrusFutureScape-STIPIngest/0.1"})
    return session


def execute_sql_file(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text(SQL_FILE.read_text(encoding="utf-8")))


def load_source(config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    for source in config.get("sources", []):
        if source.get("source_key") == SOURCE_KEY:
            return source
    raise RuntimeError(f"{SOURCE_KEY} not found in {config_path}")


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


def download_features(
    session: Session,
    layer_url: str,
    metadata: dict[str, Any],
    where: str,
    timeout: int,
    page_size_override: int | None,
    limit: int | None,
) -> list[dict[str, Any]]:
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
        logging.info("Downloaded %s/%s STIP features", len(features), target_count)
        if len(page_features) < page_size:
            break
        offset += page_size
    return features


def first_present(properties: dict[str, Any], names: list[str]) -> Any:
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
    normalized = " ".join(str(value).strip().split())
    return normalized or None


def normalize_year(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        year = int(float(str(value)))
    except ValueError:
        return None
    return year if 1900 <= year <= 2200 else None


def load_rows(
    engine: Engine,
    source: dict[str, Any],
    metadata: dict[str, Any],
    features: list[dict[str, Any]],
) -> dict[str, Any]:
    source_url = source["source_url"]
    layer_id = int(source["layer_id"])
    source_sr = metadata.get("spatialReference") or {}
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []

    for feature in features:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        source_objectid = first_present(properties, FIELD_MAPPING["source_objectid"]) or feature.get("id")
        right_of_way_year = normalize_year(first_present(properties, ["RightOfWayYear"]))
        construction_year = normalize_year(first_present(properties, ["ConstructionYear"]))
        year_candidates = [year for year in (right_of_way_year, construction_year) if year is not None]
        common = {
            "source_key": SOURCE_KEY,
            "source_name": source["source_name"],
            "source_objectid": str(source_objectid) if source_objectid is not None else None,
            "layer_id": layer_id,
            "source_url": source_url,
            "source_spatial_reference": json.dumps(source_sr, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "project_name": normalize_text(first_present(properties, FIELD_MAPPING["project_name"])),
                "project_description": normalize_text(
                    first_present(properties, FIELD_MAPPING["project_description"]),
                ),
                "project_type": normalize_text(first_present(properties, FIELD_MAPPING["project_type"])),
                "route_name": normalize_text(first_present(properties, FIELD_MAPPING["route_name"])),
                "county": normalize_text(first_present(properties, FIELD_MAPPING["county"])),
                "jurisdiction": normalize_text(first_present(properties, FIELD_MAPPING["jurisdiction"])),
                "project_status": None,
                "funding_status": None,
                "start_year": min(year_candidates) if year_candidates else None,
                "end_year": max(year_candidates) if year_candidates else None,
                "fiscal_year": None,
                "construction_year": construction_year,
                "source_year_range": "2026-2035",
                "geometry_type": feature.get("geometry", {}).get("type"),
                "source_confidence": "source_reported_current_context",
            },
        )

    raw_insert = text(
        """
        INSERT INTO public.transportation_stip_projects_raw (
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
        INSERT INTO public.transportation_stip_projects_clean (
          source_key, source_name, source_objectid, project_name,
          project_description, project_type, route_name, county, jurisdiction,
          project_status, funding_status, start_year, end_year, fiscal_year,
          construction_year, source_year_range, geometry, geometry_ft,
          geometry_length_ft, geometry_type, source_url, source_confidence
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :project_name,
          :project_description, :project_type, :route_name, :county, :jurisdiction,
          :project_status, :funding_status, :start_year, :end_year, :fiscal_year,
          :construction_year, :source_year_range,
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
          ),
          :geometry_type, :source_url, :source_confidence
        )
        """,
    )
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM public.transportation_stip_projects_raw WHERE source_key = :source_key"), {"source_key": SOURCE_KEY})
        connection.execute(text("DELETE FROM public.transportation_stip_projects_clean WHERE source_key = :source_key"), {"source_key": SOURCE_KEY})
        if raw_rows:
            connection.execute(raw_insert, raw_rows)
        if clean_rows:
            connection.execute(clean_insert, clean_rows)

    return {"raw_rows": len(raw_rows), "clean_rows": len(clean_rows)}


def summarize_database(engine: Engine | None) -> dict[str, Any]:
    if engine is None:
        return {}
    with engine.connect() as connection:
        return dict(
            connection.execute(
                text(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_raw) AS raw_rows,
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_clean) AS clean_rows,
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_clean WHERE construction_year IS NULL)
                        AS missing_construction_year_count,
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_clean WHERE project_status IS NULL)
                        AS missing_project_status_count,
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_clean WHERE funding_status IS NULL)
                        AS missing_funding_status_count,
                      (SELECT COUNT(*) FROM public.transportation_stip_projects_clean WHERE NOT ST_IsValid(geometry))
                        AS invalid_geometry_count
                    """
                ),
            ).mappings().one(),
        )


def main() -> int:
    args = parse_args()
    configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = load_source(args.config)
    layer_url = source["source_url"]
    session = create_requests_session()

    try:
        metadata = fetch_metadata(session, layer_url, args.timeout)
        total_source_count = fetch_count(session, layer_url, "1=1", args.timeout)
        filtered_count = fetch_count(session, layer_url, args.where, args.timeout)
        features = download_features(
            session,
            layer_url,
            metadata,
            args.where,
            args.timeout,
            args.page_size,
            args.limit,
        )
        inserted = {"raw_rows": 0, "clean_rows": 0}
        engine: Engine | None = None
        if not args.dry_run:
            engine = create_engine_from_env()
            execute_sql_file(engine)
            if args.truncate_and_load:
                with engine.begin() as connection:
                    connection.execute(text("TRUNCATE public.transportation_stip_projects_raw, public.transportation_stip_projects_clean RESTART IDENTITY"))
            inserted = load_rows(engine, source, metadata, features)
        summary = {
            "phase": "13B_stip_project_ingest",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "dry_run": args.dry_run,
            "truncate_and_load": args.truncate_and_load,
            "source_key": SOURCE_KEY,
            "source_url": layer_url,
            "where": args.where,
            "total_source_record_count": total_source_count,
            "filtered_record_count": filtered_count,
            "downloaded_features": len(features),
            "inserted_raw_rows": inserted["raw_rows"],
            "inserted_clean_rows": inserted["clean_rows"],
            "field_mapping_used": FIELD_MAPPING,
            "missing_fields_kept_null": ["project_status", "funding_status", "fiscal_year"],
            "source_confidence": "source_reported_current_context",
            "current_context_only": True,
            "time_safe_for_training": False,
            "model_active": False,
            "prediction_probability_available": False,
            "database_summary": summarize_database(engine),
            "rest_source_relocation_warning": REST_RELOCATION_WARNING,
        }
        SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
        print(json.dumps(summary, indent=2, default=str))
        return 0
    except Exception as error:  # noqa: BLE001
        summary = {
            "phase": "13B_stip_project_ingest",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "source_key": SOURCE_KEY,
            "source_url": layer_url,
            "error": f"{error}; {REST_RELOCATION_WARNING}",
        }
        SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
        raise


if __name__ == "__main__":
    raise SystemExit(main())
