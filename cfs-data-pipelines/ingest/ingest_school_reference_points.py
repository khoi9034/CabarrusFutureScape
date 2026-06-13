"""Ingest Cabarrus school reference points for Phase 8A school constraints.

The school point layer is used only as a reference/name dictionary. Parcel
assignment is handled by attendance-zone polygon overlap in the companion
attendance-zone ingest/transform path.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from geoalchemy2 import Geometry  # noqa: F401 - required by GeoDataFrame.to_postgis
from requests import Session
from requests.adapters import HTTPAdapter
from shapely.geometry import Point
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

SOURCE_URL = (
    "https://location.cabarruscounty.us/arcgisservices/rest/services/"
    "opendata/MapServer/144"
)
SOURCE_LAYER = "Cabarrus County Schools Reference Points"
RAW_TABLE = "public.school_reference_raw"
CLEAN_TABLE = "public.school_reference"
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DEFAULT_OUT_SR = 4326

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"

VALIDATION_FILENAME = "school_reference_validation.json"
INCLUDED_EXCLUDED_FILENAME = "school_reference_included_excluded_summary.csv"


class ArcGISSourceUnavailable(RuntimeError):
    """Raised when the ArcGIS service is not queryable."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Cabarrus school reference points.",
    )
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    return parser.parse_args()


def configure_logging(log_level: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"ingest_school_reference_points_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before ingesting school data."
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


def create_session() -> Session:
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
    session.headers.update({"User-Agent": "CabarrusFutureScape-SchoolConstraints/0.1"})
    return session


def request_json(session: Session, url: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") == "error":
        messages = "; ".join(payload.get("messages") or ["ArcGIS service error"])
        raise ArcGISSourceUnavailable(messages)
    if "error" in payload:
        error = payload["error"]
        message = error.get("message", "ArcGIS REST error")
        details = "; ".join(error.get("details", []))
        raise ArcGISSourceUnavailable(f"{message}. {details}".strip())
    return payload


def fetch_metadata(session: Session, source_url: str, timeout: int) -> dict[str, Any]:
    logging.info("Fetching school reference metadata: %s", source_url)
    return request_json(session, source_url, {"f": "pjson"}, timeout)


def get_page_size(metadata: dict[str, Any], requested: int | None) -> int:
    max_record_count = int(metadata.get("maxRecordCount") or 1000)
    if requested is None:
        return min(max_record_count, 1000)
    return max(1, min(requested, max_record_count))


def fetch_feature_count(session: Session, source_url: str, timeout: int) -> int:
    payload = request_json(
        session,
        f"{source_url}/query",
        {"f": "pjson", "where": "1=1", "returnCountOnly": "true"},
        timeout,
    )
    return int(payload.get("count") or 0)


def fetch_features(
    session: Session,
    source_url: str,
    timeout: int,
    page_size: int,
    total_count: int,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for offset in range(0, total_count, page_size):
        logging.info(
            "Downloading school reference features %s-%s of %s",
            offset + 1,
            min(offset + page_size, total_count),
            total_count,
        )
        payload = request_json(
            session,
            f"{source_url}/query",
            {
                "f": "geojson",
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": DEFAULT_OUT_SR,
                "resultOffset": offset,
                "resultRecordCount": page_size,
            },
            timeout,
        )
        features.extend(payload.get("features") or [])
    return features


def normalize_column_name(column_name: str) -> str:
    normalized = column_name.strip().lower().replace(".", "_")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized)
    return re.sub(r"_+", "_", normalized).strip("_")


def normalize_school_name(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    name = str(value).lower()
    name = name.replace("&", " and ")
    name = re.sub(r"\b(es|elem|elementary school|elementary)\b", "elementary", name)
    name = re.sub(r"\b(ms|middle school|middle)\b", "middle", name)
    name = re.sub(r"\b(hs|high school|high)\b", "high", name)
    name = re.sub(r"\bschool\b", " ", name)
    name = re.sub(r"[^a-z0-9]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name or None


def text_blob(row: pd.Series) -> str:
    return " ".join(
        str(value).lower()
        for value in row.to_dict().values()
        if value is not None and not pd.isna(value)
    )


def first_present(row: pd.Series, candidates: list[str]) -> Any:
    for candidate in candidates:
        if candidate in row and row[candidate] is not None and not pd.isna(row[candidate]):
            value = row[candidate]
            if str(value).strip():
                return value
    return None


def infer_school_level(row: pd.Series) -> str | None:
    value = first_present(row, ["level_", "level", "school_level"])
    blob = text_blob(row)
    candidate = str(value).strip().lower() if value is not None else blob
    if candidate in {"e", "es", "elem"} or "elementary" in candidate:
        return "elementary"
    if candidate in {"m", "ms"} or "middle" in candidate:
        return "middle"
    if candidate in {"h", "hs"} or "high" in candidate:
        return "high"
    return None


def infer_school_type(row: pd.Series) -> str:
    blob = text_blob(row)
    if any(token in blob for token in ["private", "charter", "magnet"]):
        return "non_cfs_v1"
    return "public"


def infer_school_system(row: pd.Series) -> str:
    blob = text_blob(row)
    if "kannapolis" in blob or "kcs" in blob:
        return "kcs"
    if "cabarrus" in blob or "ccs" in blob:
        return "ccs"
    # The Open Data layer is a public Cabarrus reference layer. In absence of an
    # explicit system field, keep the record usable but still QA-visible.
    return "ccs"


def get_exclusion_reason(level: str | None, school_type: str, school_system: str, row: pd.Series) -> str | None:
    blob = text_blob(row)
    if level not in {"elementary", "middle", "high"}:
        return "level_not_v1"
    if "other" in blob:
        return "other_not_v1"
    if school_system != "ccs":
        return "non_ccs_not_v1"
    if school_type != "public":
        if "magnet" in blob:
            return "magnet_not_v1"
        if "private" in blob:
            return "private_not_v1"
        if "charter" in blob:
            return "charter_not_v1"
        return "non_public_not_v1"
    return None


def safe_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text_value = str(value).strip()
    return text_value or None


def build_raw_geodataframe(features: list[dict[str, Any]], source_url: str) -> gpd.GeoDataFrame:
    if not features:
        return empty_raw_gdf()
    gdf = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{DEFAULT_OUT_SR}")
    gdf.columns = [normalize_column_name(column) for column in gdf.columns]
    if "geometry" not in gdf.columns:
        gdf["geometry"] = None
    gdf = gdf.set_geometry("geometry")
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=DEFAULT_OUT_SR)
    elif gdf.crs.to_epsg() != DEFAULT_OUT_SR:
        gdf = gdf.to_crs(epsg=DEFAULT_OUT_SR)
    gdf["source_layer"] = SOURCE_LAYER
    gdf["source_url"] = source_url
    gdf["ingested_at"] = datetime.now()
    return gdf


def empty_raw_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "source_objectid": pd.Series(dtype="Int64"),
            "level_": pd.Series(dtype="object"),
            "status": pd.Series(dtype="object"),
            "parktype": pd.Series(dtype="object"),
            "code": pd.Series(dtype="object"),
            "label": pd.Series(dtype="object"),
            "school": pd.Series(dtype="object"),
            "add_": pd.Series(dtype="object"),
            "source_layer": pd.Series(dtype="object"),
            "source_url": pd.Series(dtype="object"),
            "ingested_at": pd.Series(dtype="datetime64[ns]"),
            "geometry": gpd.GeoSeries([], crs=f"EPSG:{DEFAULT_OUT_SR}"),
        },
        geometry="geometry",
        crs=f"EPSG:{DEFAULT_OUT_SR}",
    )


def build_clean_geodataframe(raw_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if raw_gdf.empty:
        return empty_clean_gdf()

    rows: list[dict[str, Any]] = []
    for _, row in raw_gdf.iterrows():
        source_objectid = first_present(row, ["objectid", "source_objectid", "fid"])
        short_name = safe_text(first_present(row, ["label", "code", "school"]))
        full_name = safe_text(first_present(row, ["school", "label", "code"]))
        normalized = normalize_school_name(full_name or short_name)
        level = infer_school_level(row)
        school_type = infer_school_type(row)
        school_system = infer_school_system(row)
        exclusion_reason = get_exclusion_reason(level, school_type, school_system, row)
        include_in_cfs_v1 = exclusion_reason is None and normalized is not None
        if exclusion_reason is None and normalized is None:
            exclusion_reason = "missing_required_fields"
            include_in_cfs_v1 = False

        objectid_token = str(source_objectid).strip() if source_objectid is not None else "unknown"
        school_reference_id = (
            f"SCHOOLREF-{(level or 'unknown').upper()}-"
            f"{(normalized or 'unnamed').upper()}-{objectid_token}"
        )

        rows.append(
            {
                "school_reference_id": school_reference_id[:180],
                "school_name_short": short_name,
                "school_name_full": full_name,
                "school_name_normalized": normalized,
                "school_level": level,
                "school_type": school_type,
                "school_system": school_system.upper(),
                "address": safe_text(first_present(row, ["add_", "address"])),
                "include_in_cfs_v1": include_in_cfs_v1,
                "exclusion_reason": exclusion_reason,
                "source_layer": SOURCE_LAYER,
                "source_objectid": safe_text(source_objectid),
                "transformed_at": datetime.now(),
                "geometry": row.geometry if row.geometry is not None else Point(),
            }
        )

    clean_gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=f"EPSG:{DEFAULT_OUT_SR}")
    clean_gdf = clean_gdf[~clean_gdf.geometry.is_empty]
    return clean_gdf


def empty_clean_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "school_reference_id": pd.Series(dtype="object"),
            "school_name_short": pd.Series(dtype="object"),
            "school_name_full": pd.Series(dtype="object"),
            "school_name_normalized": pd.Series(dtype="object"),
            "school_level": pd.Series(dtype="object"),
            "school_type": pd.Series(dtype="object"),
            "school_system": pd.Series(dtype="object"),
            "address": pd.Series(dtype="object"),
            "include_in_cfs_v1": pd.Series(dtype="bool"),
            "exclusion_reason": pd.Series(dtype="object"),
            "source_layer": pd.Series(dtype="object"),
            "source_objectid": pd.Series(dtype="object"),
            "transformed_at": pd.Series(dtype="datetime64[ns]"),
            "geometry": gpd.GeoSeries([], crs=f"EPSG:{DEFAULT_OUT_SR}"),
        },
        geometry="geometry",
        crs=f"EPSG:{DEFAULT_OUT_SR}",
    )


def execute_sql(engine: Engine, sql: str) -> None:
    with engine.begin() as connection:
        connection.execute(text(sql))


def ensure_empty_tables(engine: Engine) -> None:
    execute_sql(
        engine,
        """
        DROP TABLE IF EXISTS public.school_reference_raw;
        CREATE TABLE public.school_reference_raw (
          source_objectid text,
          level_ text,
          status text,
          parktype text,
          code text,
          label text,
          school text,
          add_ text,
          source_layer text,
          source_url text,
          ingested_at timestamptz,
          geometry geometry(Point, 4326)
        );
        CREATE INDEX IF NOT EXISTS school_reference_raw_geometry_gix
          ON public.school_reference_raw USING GIST (geometry);

        DROP TABLE IF EXISTS public.school_reference;
        CREATE TABLE public.school_reference (
          school_reference_id text PRIMARY KEY,
          school_name_short text,
          school_name_full text,
          school_name_normalized text,
          school_level text,
          school_type text,
          school_system text,
          address text,
          include_in_cfs_v1 boolean,
          exclusion_reason text,
          source_layer text,
          source_objectid text,
          transformed_at timestamptz,
          geometry geometry(Point, 4326)
        );
        CREATE INDEX IF NOT EXISTS school_reference_geometry_gix
          ON public.school_reference USING GIST (geometry);
        CREATE INDEX IF NOT EXISTS school_reference_name_level_idx
          ON public.school_reference (school_name_normalized, school_level);
        CREATE INDEX IF NOT EXISTS school_reference_include_idx
          ON public.school_reference (include_in_cfs_v1);
        """,
    )


def write_gdf(engine: Engine, gdf: gpd.GeoDataFrame, table_name: str) -> None:
    schema, table = table_name.split(".")
    gdf.to_postgis(
        name=table,
        con=engine,
        schema=schema,
        if_exists="replace",
        index=False,
    )


def add_indexes(engine: Engine) -> None:
    execute_sql(
        engine,
        """
        CREATE INDEX IF NOT EXISTS school_reference_raw_geometry_gix
          ON public.school_reference_raw USING GIST (geometry);
        CREATE INDEX IF NOT EXISTS school_reference_geometry_gix
          ON public.school_reference USING GIST (geometry);
        CREATE INDEX IF NOT EXISTS school_reference_name_level_idx
          ON public.school_reference (school_name_normalized, school_level);
        CREATE INDEX IF NOT EXISTS school_reference_include_idx
          ON public.school_reference (include_in_cfs_v1);
        ANALYZE public.school_reference_raw;
        ANALYZE public.school_reference;
        """,
    )


def fetch_rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql)).mappings()]


def scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        with path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def write_csv_all(filename: str, rows: list[dict[str, Any]], headers: list[str]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)


def build_validation(
    engine: Engine,
    source_status: str,
    source_error: str | None,
    metadata: dict[str, Any] | None,
    elapsed_seconds: float,
    log_path: Path,
) -> dict[str, Any]:
    raw_count = int(scalar(engine, "SELECT COUNT(*) FROM public.school_reference_raw"))
    clean_count = int(scalar(engine, "SELECT COUNT(*) FROM public.school_reference"))
    included_count = int(
        scalar(
            engine,
            "SELECT COUNT(*) FROM public.school_reference WHERE include_in_cfs_v1",
        )
    )
    excluded_count = int(
        scalar(
            engine,
            "SELECT COUNT(*) FROM public.school_reference WHERE NOT include_in_cfs_v1",
        )
    )
    summary_rows = fetch_rows(
        engine,
        """
        SELECT
          COALESCE(school_level, 'unknown') AS school_level,
          COALESCE(school_system, 'unknown') AS school_system,
          COALESCE(school_type, 'unknown') AS school_type,
          include_in_cfs_v1,
          COALESCE(exclusion_reason, 'included') AS exclusion_reason,
          COUNT(*) AS school_count
        FROM public.school_reference
        GROUP BY
          COALESCE(school_level, 'unknown'),
          COALESCE(school_system, 'unknown'),
          COALESCE(school_type, 'unknown'),
          include_in_cfs_v1,
          COALESCE(exclusion_reason, 'included')
        ORDER BY include_in_cfs_v1 DESC, school_level, exclusion_reason
        """,
    )
    write_csv_all(
        INCLUDED_EXCLUDED_FILENAME,
        summary_rows,
        [
            "school_level",
            "school_system",
            "school_type",
            "include_in_cfs_v1",
            "exclusion_reason",
            "school_count",
        ],
    )

    return {
        "generated_at": datetime.now().isoformat(),
        "source_url": SOURCE_URL,
        "source_status": source_status,
        "source_error": source_error,
        "raw_table": RAW_TABLE,
        "clean_table": CLEAN_TABLE,
        "raw_row_count": raw_count,
        "clean_row_count": clean_count,
        "included_cfs_v1_count": included_count,
        "excluded_or_preserved_qa_count": excluded_count,
        "level_distribution": fetch_rows(
            engine,
            """
            SELECT COALESCE(school_level, 'unknown') AS school_level,
                   COUNT(*) AS school_count
            FROM public.school_reference
            GROUP BY COALESCE(school_level, 'unknown')
            ORDER BY school_level
            """,
        ),
        "included_excluded_summary": summary_rows,
        "geometry_validation": {
            "invalid_geometry_count": int(
                scalar(
                    engine,
                    "SELECT COUNT(*) FROM public.school_reference WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            ),
            "srid_counts": fetch_rows(
                engine,
                """
                SELECT ST_SRID(geometry) AS srid, COUNT(*) AS school_count
                FROM public.school_reference
                WHERE geometry IS NOT NULL
                GROUP BY ST_SRID(geometry)
                ORDER BY srid
                """,
            ),
        },
        "service_metadata": {
            "name": metadata.get("name") if metadata else None,
            "geometry_type": metadata.get("geometryType") if metadata else None,
            "max_record_count": metadata.get("maxRecordCount") if metadata else None,
            "fields": [
                {"name": field.get("name"), "alias": field.get("alias"), "type": field.get("type")}
                for field in (metadata or {}).get("fields", [])
            ],
        },
        "cfs_v1_policy": {
            "included": "Public CCS elementary, middle, and high schools only.",
            "excluded_preserved_for_qa": [
                "non-CCS systems",
                "private",
                "magnet",
                "Other / non elementary-middle-high",
            ],
            "parcel_assignment_policy": "Do not use school point distance for parcel assignment.",
        },
        "elapsed_seconds": elapsed_seconds,
        "log_path": str(log_path),
    }


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    engine = create_engine_from_env()

    source_status = "downloaded"
    source_error: str | None = None
    metadata: dict[str, Any] | None = None

    try:
        if args.skip_download:
            raise ArcGISSourceUnavailable("Download skipped by caller.")

        session = create_session()
        metadata = fetch_metadata(session, args.source_url, args.timeout)
        page_size = get_page_size(metadata, args.page_size)
        total_count = fetch_feature_count(session, args.source_url, args.timeout)
        features = fetch_features(session, args.source_url, args.timeout, page_size, total_count)
        raw_gdf = build_raw_geodataframe(features, args.source_url)
        clean_gdf = build_clean_geodataframe(raw_gdf)

        write_gdf(engine, raw_gdf, RAW_TABLE)
        write_gdf(engine, clean_gdf, CLEAN_TABLE)
        add_indexes(engine)
    except (requests.RequestException, ArcGISSourceUnavailable, ValueError) as error:
        source_status = "source_unavailable"
        source_error = str(error)
        logging.warning(
            "School reference source unavailable; creating schema-safe empty tables. Error: %s",
            source_error,
        )
        ensure_empty_tables(engine)

    validation = build_validation(
        engine=engine,
        source_status=source_status,
        source_error=source_error,
        metadata=metadata,
        elapsed_seconds=round(time.perf_counter() - started_at, 2),
        log_path=log_path,
    )
    write_json_all(VALIDATION_FILENAME, validation)
    logging.info("Wrote school reference validation: %s", ROOT_OUTPUT_DIR / VALIDATION_FILENAME)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
