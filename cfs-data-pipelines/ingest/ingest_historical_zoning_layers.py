"""Ingest historical zoning ArcGIS REST layers into raw and clean PostGIS tables."""

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
DEFAULT_OUT_SR = 4326

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
CONFIG_PATH = REPO_ROOT / "config" / "historical_zoning_sources.json"
SQL_FILE = PIPELINE_ROOT / "sql" / "create_historical_zoning_tables.sql"
LOG_DIR = PIPELINE_ROOT / "logs"
OUTPUT_DIR = REPO_ROOT / "outputs"
SUMMARY_OUTPUT = OUTPUT_DIR / "historical_zoning_ingest_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest historical zoning layers.")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--year", type=int, action="append")
    parser.add_argument("--jurisdiction", action="append")
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
    log_path = LOG_DIR / f"ingest_historical_zoning_layers_{timestamp}.log"
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


def construct_layer_url(service_root_url: str, layer_id: int) -> str:
    return f"{service_root_url.rstrip('/')}/{int(layer_id)}"


def normalize_jurisdiction(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).lower()


def load_sources(
    config_path: Path,
    years: list[int] | None,
    jurisdictions: list[str] | None,
) -> list[dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    service_root_url = config["service_root_url"].rstrip("/")
    sources = []
    jurisdiction_filter = (
        {normalize_jurisdiction(jurisdiction) for jurisdiction in jurisdictions}
        if jurisdictions
        else None
    )
    year_filter = set(years) if years else None
    for source in config["sources"]:
        if year_filter and int(source["source_year"]) not in year_filter:
            continue
        if jurisdiction_filter and normalize_jurisdiction(source["jurisdiction"]) not in jurisdiction_filter:
            continue
        enriched = dict(source)
        enriched["service_root_url"] = service_root_url
        enriched["full_layer_url"] = construct_layer_url(service_root_url, source["layer_id"])
        enriched["source_type"] = config.get("source_type", "historical_zoning")
        enriched["current_context_only"] = False
        enriched["time_safe_candidate"] = True
        enriched["needs_schema_review"] = True
        sources.append(enriched)
    return sources


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
    session.headers.update({"User-Agent": "CabarrusFutureScape-HistoricalZoningIngest/0.1"})
    return session


def request_json(session: Session, url: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        error = payload["error"]
        details = "; ".join(error.get("details", []))
        raise RuntimeError(f"{url}: {error.get('message', 'ArcGIS REST error')} {details}")
    return payload


def field_names(fields: list[dict[str, Any]]) -> list[str]:
    return [str(field.get("name")) for field in fields if field.get("name")]


def find_candidates(fields: list[dict[str, Any]], tokens: tuple[str, ...]) -> list[str]:
    candidates: list[str] = []
    for field in fields:
        name = str(field.get("name", ""))
        alias = str(field.get("alias", ""))
        haystack = f"{name} {alias}".lower()
        if any(token in haystack for token in tokens):
            candidates.append(name)
    return candidates


def zoning_code_candidates(fields: list[dict[str, Any]]) -> list[str]:
    preferred = (
        "zoningcode",
        "base_distr",
        "zoning",
        "zoning_typ",
        "zone_id",
        "zoning_gen",
        "zoningdist",
        "oldzoning",
    )
    return [
        name
        for name in field_names(fields)
        if any(token in name.lower() for token in preferred)
    ]


def zoning_district_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(
        fields,
        ("zoningdist", "zoning_gen", "zoning_typ", "base_distr", "district", "zone_id"),
    )


def case_number_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(fields, ("case", "cu_case", "petition", "rezon", "ordinance"))


def date_candidates(fields: list[dict[str, Any]]) -> list[str]:
    names = set(
        find_candidates(
            fields,
            ("date", "year", "effective", "approved", "approval", "adopt", "decision", "edit"),
        )
    )
    for field in fields:
        if "date" in str(field.get("type", "")).lower():
            names.add(str(field["name"]))
    return sorted(names)


def first_present(properties: dict[str, Any], candidates: list[str]) -> Any:
    for candidate in candidates:
        value = properties.get(candidate)
        if value is not None and str(value).strip() != "":
            return value
    return None


def normalize_zoning_code(value: Any) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", str(value).strip().upper())
    return normalized or None


def classify_zoning_general(code: str | None, district: str | None = None) -> str | None:
    raw = " ".join(part for part in [code, district] if part).upper()
    if not raw:
        return None
    if any(token in raw for token in ("PUD", "MX", "MIX", "VILLAGE", "VC")):
        return "mixed_use_or_planned"
    if any(token in raw for token in ("IND", "LI", "HI", "I-", "M-")):
        return "industrial"
    if any(token in raw for token in ("COMM", "BUS", "B-", "C-", "O-I", "OFFICE", "NB", "CB")):
        return "commercial"
    if any(token in raw for token in ("AG", "AO", "CR", "COUNTRYSIDE", "RURAL")):
        return "agricultural_or_rural"
    if any(token in raw for token in ("RES", "R-", "RL", "RM", "RV", "LDR", "MDR", "HDR")):
        return "residential"
    if any(token in raw for token in ("INST", "INS", "CIVIC", "PUBLIC")):
        return "institutional"
    return "other_or_review"


def fetch_metadata(session: Session, layer_url: str, timeout: int) -> dict[str, Any]:
    return request_json(session, layer_url, {"f": "json"}, timeout)


def fetch_count(session: Session, layer_url: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": "1=1", "returnCountOnly": "true"},
        timeout,
    )
    return int(payload.get("count", 0))


def object_id_field(metadata: dict[str, Any]) -> str:
    if metadata.get("objectIdField"):
        return str(metadata["objectIdField"])
    for field in metadata.get("fields", []):
        if field.get("type") == "esriFieldTypeOID":
            return str(field["name"])
    return "OBJECTID"


def page_size(metadata: dict[str, Any], requested: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)
    return min(requested or max_record_count, max_record_count)


def supports_pagination(metadata: dict[str, Any]) -> bool:
    capabilities = metadata.get("advancedQueryCapabilities") or {}
    return bool(capabilities.get("supportsPagination"))


def fetch_object_ids(session: Session, layer_url: str, object_id: str, timeout: int) -> list[int]:
    payload = request_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": "1=1", "returnIdsOnly": "true", "orderByFields": object_id},
        timeout,
    )
    return [int(value) for value in payload.get("objectIds", [])]


def fetch_geojson(
    session: Session,
    layer_url: str,
    params: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    return request_json(session, f"{layer_url}/query", params, timeout)


def download_features(
    session: Session,
    layer_url: str,
    metadata: dict[str, Any],
    total_count: int,
    timeout: int,
    requested_page_size: int | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    target_count = min(total_count, limit) if limit else total_count
    size = page_size(metadata, requested_page_size)
    oid = object_id_field(metadata)
    features: list[dict[str, Any]] = []
    if supports_pagination(metadata):
        offset = 0
        while len(features) < target_count:
            requested = min(size, target_count - len(features))
            payload = fetch_geojson(
                session,
                layer_url,
                {
                    "f": "geojson",
                    "where": "1=1",
                    "outFields": "*",
                    "returnGeometry": "true",
                    "outSR": DEFAULT_OUT_SR,
                    "orderByFields": oid,
                    "resultOffset": offset,
                    "resultRecordCount": requested,
                },
                timeout,
            )
            page = payload.get("features", [])
            if not page:
                break
            features.extend(page)
            offset += len(page)
    else:
        object_ids = fetch_object_ids(session, layer_url, oid, timeout)[:target_count]
        for start in range(0, len(object_ids), size):
            chunk = object_ids[start : start + size]
            payload = fetch_geojson(
                session,
                layer_url,
                {
                    "f": "geojson",
                    "objectIds": ",".join(str(value) for value in chunk),
                    "outFields": "*",
                    "returnGeometry": "true",
                    "outSR": DEFAULT_OUT_SR,
                },
                timeout,
            )
            features.extend(payload.get("features", []))
    return features[:target_count]


def execute_sql_file(engine: Engine) -> None:
    raw_connection = engine.raw_connection()
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(SQL_FILE.read_text(encoding="utf-8"))
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def truncate_tables(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE public.historical_zoning_raw, public.historical_zoning_clean RESTART IDENTITY"))


def delete_source_rows(engine: Engine, source_key: str) -> None:
    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM public.historical_zoning_raw WHERE source_key = :source_key"),
            {"source_key": source_key},
        )
        connection.execute(
            text("DELETE FROM public.historical_zoning_clean WHERE source_key = :source_key"),
            {"source_key": source_key},
        )


def insert_features(
    engine: Engine,
    source: dict[str, Any],
    features: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> dict[str, int]:
    fields = metadata.get("fields", [])
    zoning_fields = zoning_code_candidates(fields)
    district_fields = zoning_district_candidates(fields)
    case_fields = case_number_candidates(fields)
    dates = date_candidates(fields)
    oid = object_id_field(metadata)
    raw_insert = text(
        """
        INSERT INTO public.historical_zoning_raw (
            source_key, source_name, jurisdiction, source_year, layer_id,
            source_objectid, source_url, attributes, geometry
        )
        VALUES (
            :source_key, :source_name, :jurisdiction, :source_year, :layer_id,
            :source_objectid, :source_url, CAST(:attributes AS jsonb),
            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)
        )
        """
    )
    clean_insert = text(
        """
        INSERT INTO public.historical_zoning_clean (
            source_key, source_name, jurisdiction, source_year, layer_id,
            source_objectid, zoning_code_raw, zoning_code_normalized,
            zoning_district_raw, zoning_general_category, case_number,
            date_field_value, geometry, geometry_area_acres, schema_quality
        )
        VALUES (
            :source_key, :source_name, :jurisdiction, :source_year, :layer_id,
            :source_objectid, :zoning_code_raw, :zoning_code_normalized,
            :zoning_district_raw, :zoning_general_category, :case_number,
            :date_field_value,
            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 3)),
            ST_Area(
                ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 3))::geography
            ) / 4046.8564224,
            :schema_quality
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
        source_objectid = properties.get(oid) or feature.get("id")
        zoning_code_raw = first_present(properties, zoning_fields)
        zoning_district_raw = first_present(properties, district_fields)
        case_number = first_present(properties, case_fields)
        date_value = first_present(properties, dates)
        zoning_code_normalized = normalize_zoning_code(zoning_code_raw)
        zoning_general = classify_zoning_general(zoning_code_normalized, zoning_district_raw)
        schema_quality = "usable" if zoning_code_normalized else "review_required"
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "jurisdiction": source["jurisdiction"],
            "source_year": int(source["source_year"]),
            "layer_id": int(source["layer_id"]),
            "source_objectid": str(source_objectid) if source_objectid is not None else None,
            "source_url": source["full_layer_url"],
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "zoning_code_raw": str(zoning_code_raw) if zoning_code_raw is not None else None,
                "zoning_code_normalized": zoning_code_normalized,
                "zoning_district_raw": str(zoning_district_raw) if zoning_district_raw is not None else None,
                "zoning_general_category": zoning_general,
                "case_number": str(case_number) if case_number is not None else None,
                "date_field_value": str(date_value) if date_value is not None else None,
                "schema_quality": schema_quality,
            }
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
) -> dict[str, Any]:
    layer_url = source["full_layer_url"]
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
            delete_source_rows(engine, source["source_key"])
            inserted = insert_features(engine, source, features, metadata)
        return {
            "source_key": source["source_key"],
            "source_year": source["source_year"],
            "jurisdiction": source["jurisdiction"],
            "layer_id": source["layer_id"],
            "status": "ok",
            "record_count": total_count,
            "downloaded_features": len(features),
            "inserted_raw_rows": inserted["raw_rows"],
            "inserted_clean_rows": inserted["clean_rows"],
            "zoning_code_field_candidates": zoning_code_candidates(metadata.get("fields", [])),
            "case_number_field_candidates": case_number_candidates(metadata.get("fields", [])),
            "date_field_candidates": date_candidates(metadata.get("fields", [])),
            "error": None,
        }
    except Exception as error:  # noqa: BLE001 - keep ingest moving by layer
        logging.exception("Failed historical zoning layer: %s", source["source_key"])
        return {
            "source_key": source["source_key"],
            "source_year": source["source_year"],
            "jurisdiction": source["jurisdiction"],
            "layer_id": source["layer_id"],
            "status": "failed",
            "record_count": None,
            "downloaded_features": 0,
            "inserted_raw_rows": 0,
            "inserted_clean_rows": 0,
            "zoning_code_field_candidates": [],
            "case_number_field_candidates": [],
            "date_field_candidates": [],
            "error": str(error),
        }


def summarize_database(engine: Engine | None) -> dict[str, Any]:
    if engine is None:
        return {}
    with engine.connect() as connection:
        rows_by_year = connection.execute(
            text(
                """
                SELECT source_year, jurisdiction, COUNT(*) AS clean_rows
                FROM public.historical_zoning_clean
                GROUP BY source_year, jurisdiction
                ORDER BY source_year, jurisdiction
                """
            )
        ).mappings().all()
        quality = connection.execute(
            text(
                """
                SELECT schema_quality, COUNT(*) AS clean_rows
                FROM public.historical_zoning_clean
                GROUP BY schema_quality
                ORDER BY clean_rows DESC
                """
            )
        ).mappings().all()
        invalid = connection.execute(
            text("SELECT COUNT(*) FROM public.historical_zoning_clean WHERE NOT ST_IsValid(geometry)")
        ).scalar_one()
    return {
        "clean_rows_by_year_jurisdiction": [dict(row) for row in rows_by_year],
        "schema_quality_distribution": [dict(row) for row in quality],
        "invalid_clean_geometry_count": int(invalid),
    }


def main() -> int:
    args = parse_args()
    log_path = configure_logging(args.log_level)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = load_sources(args.config, args.year, args.jurisdiction)
    session = create_requests_session()
    engine: Engine | None = None
    if not args.dry_run:
        engine = create_engine_from_env()
        execute_sql_file(engine)
        if args.truncate_and_load:
            truncate_tables(engine)

    layer_results = [ingest_source(engine, session, source, args) for source in sources]
    summary = {
        "phase": "10D-1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "truncate_and_load": args.truncate_and_load,
        "source_count_requested": len(sources),
        "source_layers_successful": sum(1 for result in layer_results if result["status"] == "ok"),
        "source_layers_failed": [result for result in layer_results if result["status"] != "ok"],
        "downloaded_feature_count": sum(result["downloaded_features"] for result in layer_results),
        "inserted_raw_rows": sum(result["inserted_raw_rows"] for result in layer_results),
        "inserted_clean_rows": sum(result["inserted_clean_rows"] for result in layer_results),
        "layer_results": layer_results,
        "database_summary": summarize_database(engine),
        "log_path": str(log_path),
    }
    SUMMARY_OUTPUT.write_text(json.dumps(summary, indent=2, ensure_ascii=True), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0 if not summary["source_layers_failed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
