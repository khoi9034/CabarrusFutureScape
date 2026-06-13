"""Ingest Cabarrus school attendance-zone polygons for Phase 8A.

Elementary, middle, and high attendance-zone polygons are merged into
public.school_zones. Parcel assignment later uses polygon overlap only.
"""

from __future__ import annotations

import argparse
import csv
import difflib
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
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from urllib3.util.retry import Retry

DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"
DEFAULT_OUT_SR = 4326

SCHOOL_ZONE_SOURCES = {
    "elementary": {
        "layer_id": 140,
        "raw_table": "public.school_zones_elementary_raw",
        "source_layer": "Cabarrus Elementary School Attendance Zones",
        "source_url": "https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/140",
    },
    "middle": {
        "layer_id": 141,
        "raw_table": "public.school_zones_middle_raw",
        "source_layer": "Cabarrus Middle School Attendance Zones",
        "source_url": "https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/141",
    },
    "high": {
        "layer_id": 142,
        "raw_table": "public.school_zones_high_raw",
        "source_layer": "Cabarrus High School Attendance Zones",
        "source_url": "https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/142",
    },
}

CLEAN_TABLE = "public.school_zones"
REFERENCE_TABLE = "public.school_reference"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_ROOT.parent
LOG_DIR = PIPELINE_ROOT / "logs"
PIPELINE_OUTPUT_DIR = PIPELINE_ROOT / "outputs"
ROOT_OUTPUT_DIR = PROJECT_ROOT / "outputs"

VALIDATION_FILENAME = "school_zones_validation.json"
MATCH_QA_FILENAME = "school_zone_match_qa.csv"
UNMATCHED_FILENAME = "school_zone_unmatched_names.csv"

KCS_ZONE_NAMES = {
    "a_l_brown_high",
    "forest_park_elementary",
    "fred_l_wilson_elementary",
    "gw_carver_elementary",
    "jackson_park_elementary",
    "kannapolis_middle",
    "north_kannapolis_elementary",
    "shady_brook_elementary",
}

EXCLUDED_ZONE_NAME_REASONS = {
    "j_n_fries_middle": "magnet_not_v1",
}


class ArcGISSourceUnavailable(RuntimeError):
    """Raised when a school attendance-zone ArcGIS layer is not queryable."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest Cabarrus elementary, middle, and high school zones.",
    )
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
    log_path = LOG_DIR / f"ingest_school_attendance_zones_{timestamp}.log"
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
            "CFS_POSTGRES_PASSWORD is not set. Export it before ingesting school zones."
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
    session.headers.update({"User-Agent": "CabarrusFutureScape-SchoolZones/0.1"})
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


def strip_level_suffix(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"_(elementary|middle|high)$", "", value)


def safe_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text_value = str(value).strip()
    return text_value or None


def first_present(row: pd.Series, candidates: list[str]) -> Any:
    for candidate in candidates:
        if candidate in row and row[candidate] is not None and not pd.isna(row[candidate]):
            value = str(row[candidate]).strip()
            if value:
                return value
    return None


def text_blob(row: pd.Series) -> str:
    return " ".join(
        str(value).lower()
        for value in row.to_dict().values()
        if value is not None and not pd.isna(value)
    )


def build_raw_geodataframe(
    features: list[dict[str, Any]],
    school_level: str,
    source_url: str,
    source_layer: str,
) -> gpd.GeoDataFrame:
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
    gdf["school_level"] = school_level
    gdf["source_layer"] = source_layer
    gdf["source_url"] = source_url
    gdf["ingested_at"] = datetime.now()
    return gdf


def empty_raw_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "objectid": pd.Series(dtype="Int64"),
            "school_nam": pd.Series(dtype="object"),
            "school_level": pd.Series(dtype="object"),
            "source_layer": pd.Series(dtype="object"),
            "source_url": pd.Series(dtype="object"),
            "ingested_at": pd.Series(dtype="datetime64[ns]"),
            "geometry": gpd.GeoSeries([], crs=f"EPSG:{DEFAULT_OUT_SR}"),
        },
        geometry="geometry",
        crs=f"EPSG:{DEFAULT_OUT_SR}",
    )


def execute_sql(engine: Engine, sql: str) -> None:
    with engine.begin() as connection:
        connection.execute(text(sql))


def empty_raw_table_sql(table_name: str) -> str:
    return f"""
    DROP TABLE IF EXISTS {table_name};
    CREATE TABLE {table_name} (
      objectid text,
      school_nam text,
      school_level text,
      source_layer text,
      source_url text,
      ingested_at timestamptz,
      geometry geometry(MultiPolygon, 4326)
    );
    CREATE INDEX IF NOT EXISTS {table_name.replace('.', '_')}_geometry_gix
      ON {table_name} USING GIST (geometry);
    """


def ensure_empty_clean_table(engine: Engine) -> None:
    execute_sql(
        engine,
        """
        DROP TABLE IF EXISTS public.school_zones;
        CREATE TABLE public.school_zones (
          zone_id text PRIMARY KEY,
          school_name_raw text,
          school_name_normalized text,
          school_level text,
          school_system text,
          matched_school_reference_id text,
          match_confidence text,
          include_in_cfs_v1 boolean,
          exclusion_reason text,
          source_layer text,
          source_layer_id integer,
          source_objectid text,
          transformed_at timestamptz,
          geometry geometry(MultiPolygon, 4326)
        );
        CREATE INDEX IF NOT EXISTS school_zones_geometry_gix
          ON public.school_zones USING GIST (geometry);
        CREATE INDEX IF NOT EXISTS school_zones_level_name_idx
          ON public.school_zones (school_level, school_name_normalized);
        CREATE INDEX IF NOT EXISTS school_zones_include_idx
          ON public.school_zones (include_in_cfs_v1);
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


def coerce_zone_geometry(engine: Engine, table_name: str) -> None:
    execute_sql(
        engine,
        f"""
        ALTER TABLE {table_name}
          ALTER COLUMN geometry TYPE geometry(MultiPolygon, 4326)
          USING ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(
                CASE
                  WHEN geometry IS NULL THEN NULL
                  WHEN ST_SRID(geometry) = 0 THEN ST_SetSRID(geometry, 4326)
                  WHEN ST_SRID(geometry) <> 4326 THEN ST_Transform(geometry, 4326)
                  ELSE geometry
                END
              ),
              3
            )
          );
        CREATE INDEX IF NOT EXISTS {table_name.replace('.', '_')}_geometry_gix
          ON {table_name} USING GIST (geometry);
        ANALYZE {table_name};
        """,
    )


def fetch_rows(engine: Engine, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql), params or {}).mappings()]


def scalar(engine: Engine, sql: str) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql)).scalar_one()


def table_exists(engine: Engine, table_name: str) -> bool:
    return bool(scalar(engine, f"SELECT to_regclass('{table_name}') IS NOT NULL"))


def load_reference_names(engine: Engine) -> list[dict[str, str]]:
    if not table_exists(engine, REFERENCE_TABLE):
        return []
    return fetch_rows(
        engine,
        """
        SELECT
          school_reference_id,
          school_name_normalized,
          school_level,
          school_system,
          include_in_cfs_v1,
          exclusion_reason
        FROM public.school_reference
        WHERE school_name_normalized IS NOT NULL
          AND school_level IN ('elementary', 'middle', 'high')
        """,
    )


def match_reference(
    normalized_name: str | None,
    school_level: str,
    reference_rows: list[dict[str, str]],
) -> tuple[str | None, str, str | None, bool | None, str | None]:
    if not normalized_name:
        return None, "unmatched_missing_name", None, None, None
    same_level = [row for row in reference_rows if row["school_level"] == school_level]
    normalized_name_base = strip_level_suffix(normalized_name)
    for row in same_level:
        reference_name = row["school_name_normalized"]
        if reference_name == normalized_name:
            return (
                row["school_reference_id"],
                "normalized_exact",
                row.get("school_system"),
                bool(row.get("include_in_cfs_v1")),
                row.get("exclusion_reason"),
            )
        if strip_level_suffix(reference_name) == normalized_name_base:
            return (
                row["school_reference_id"],
                "normalized_exact",
                row.get("school_system"),
                bool(row.get("include_in_cfs_v1")),
                row.get("exclusion_reason"),
            )
    best_score = 0.0
    best_id: str | None = None
    best_row: dict[str, Any] | None = None
    for row in same_level:
        reference_name = row["school_name_normalized"] or ""
        score = difflib.SequenceMatcher(
            None,
            normalized_name,
            reference_name,
        ).ratio()
        base_score = difflib.SequenceMatcher(
            None,
            normalized_name_base or normalized_name,
            strip_level_suffix(reference_name) or reference_name,
        ).ratio()
        score = max(score, base_score)
        if score > best_score:
            best_score = score
            best_id = row["school_reference_id"]
            best_row = row
    if best_score >= 0.88:
        return (
            best_id,
            "fuzzy_review",
            best_row.get("school_system") if best_row else None,
            bool(best_row.get("include_in_cfs_v1")) if best_row else None,
            best_row.get("exclusion_reason") if best_row else None,
        )
    return None, "unmatched_reference_review", None, None, None


def infer_zone_school_system(
    row: pd.Series,
    normalized_name: str | None,
    matched_school_system: str | None,
) -> str:
    if matched_school_system:
        return matched_school_system.upper()
    blob = text_blob(row)
    if normalized_name in KCS_ZONE_NAMES or "kannapolis" in blob:
        return "KCS"
    return "CCS"


def get_zone_exclusion_reason(
    row: pd.Series,
    normalized_name: str | None,
    school_level: str,
    school_system: str,
    matched_reference_include: bool | None,
    matched_reference_exclusion_reason: str | None,
) -> str | None:
    blob = text_blob(row)
    if school_level not in {"elementary", "middle", "high"}:
        return "level_not_v1"
    if not normalized_name:
        return "missing_required_fields"
    if normalized_name in EXCLUDED_ZONE_NAME_REASONS:
        return EXCLUDED_ZONE_NAME_REASONS[normalized_name]
    if "private" in blob:
        return "private_not_v1"
    if "magnet" in blob:
        return "magnet_not_v1"
    if "other" in blob:
        return "other_not_v1"
    if matched_reference_include is False and matched_reference_exclusion_reason:
        return matched_reference_exclusion_reason
    if school_system.upper() != "CCS":
        return "non_ccs_not_v1"
    return None


def build_clean_geodataframe(
    raw_gdfs: dict[str, gpd.GeoDataFrame],
    reference_rows: list[dict[str, str]],
) -> gpd.GeoDataFrame:
    rows: list[dict[str, Any]] = []
    for school_level, raw_gdf in raw_gdfs.items():
        if raw_gdf.empty:
            continue
        source = SCHOOL_ZONE_SOURCES[school_level]
        for _, row in raw_gdf.iterrows():
            school_name_raw = safe_text(first_present(row, ["school_nam", "school_name", "name"]))
            normalized_name = normalize_school_name(school_name_raw)
            (
                matched_id,
                match_confidence,
                matched_school_system,
                matched_reference_include,
                matched_reference_exclusion_reason,
            ) = match_reference(
                normalized_name,
                school_level,
                reference_rows,
            )
            school_system = infer_zone_school_system(
                row,
                normalized_name,
                matched_school_system,
            )
            exclusion_reason = get_zone_exclusion_reason(
                row,
                normalized_name,
                school_level,
                school_system,
                matched_reference_include,
                matched_reference_exclusion_reason,
            )
            include_in_cfs_v1 = exclusion_reason is None
            source_objectid = safe_text(first_present(row, ["objectid", "fid", "source_objectid"]))
            zone_id = (
                f"SCHOOLZONE-{school_level.upper()}-"
                f"{(normalized_name or 'unnamed').upper()}-{source_objectid or 'unknown'}"
            )

            rows.append(
                {
                    "zone_id": zone_id[:180],
                    "school_name_raw": school_name_raw,
                    "school_name_normalized": normalized_name,
                    "school_level": school_level,
                    "school_system": school_system,
                    "matched_school_reference_id": matched_id,
                    "match_confidence": match_confidence,
                    "include_in_cfs_v1": include_in_cfs_v1,
                    "exclusion_reason": exclusion_reason,
                    "source_layer": source["source_layer"],
                    "source_layer_id": source["layer_id"],
                    "source_objectid": source_objectid,
                    "transformed_at": datetime.now(),
                    "geometry": row.geometry,
                }
            )

    if not rows:
        return empty_clean_gdf()
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=f"EPSG:{DEFAULT_OUT_SR}")


def empty_clean_gdf() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "zone_id": pd.Series(dtype="object"),
            "school_name_raw": pd.Series(dtype="object"),
            "school_name_normalized": pd.Series(dtype="object"),
            "school_level": pd.Series(dtype="object"),
            "school_system": pd.Series(dtype="object"),
            "matched_school_reference_id": pd.Series(dtype="object"),
            "match_confidence": pd.Series(dtype="object"),
            "include_in_cfs_v1": pd.Series(dtype="bool"),
            "exclusion_reason": pd.Series(dtype="object"),
            "source_layer": pd.Series(dtype="object"),
            "source_layer_id": pd.Series(dtype="Int64"),
            "source_objectid": pd.Series(dtype="object"),
            "transformed_at": pd.Series(dtype="datetime64[ns]"),
            "geometry": gpd.GeoSeries([], crs=f"EPSG:{DEFAULT_OUT_SR}"),
        },
        geometry="geometry",
        crs=f"EPSG:{DEFAULT_OUT_SR}",
    )


def write_clean_table(engine: Engine, clean_gdf: gpd.GeoDataFrame) -> None:
    if clean_gdf.empty:
        ensure_empty_clean_table(engine)
        return
    write_gdf(engine, clean_gdf, CLEAN_TABLE)
    coerce_zone_geometry(engine, CLEAN_TABLE)
    execute_sql(
        engine,
        """
        ALTER TABLE public.school_zones
          ADD CONSTRAINT school_zones_pkey PRIMARY KEY (zone_id);
        CREATE INDEX IF NOT EXISTS school_zones_level_name_idx
          ON public.school_zones (school_level, school_name_normalized);
        CREATE INDEX IF NOT EXISTS school_zones_include_idx
          ON public.school_zones (include_in_cfs_v1);
        CREATE INDEX IF NOT EXISTS school_zones_reference_idx
          ON public.school_zones (matched_school_reference_id);
        """,
    )


def write_csv_all(filename: str, rows: list[dict[str, Any]], headers: list[str]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)


def write_json_all(filename: str, payload: dict[str, Any]) -> None:
    for output_dir in (PIPELINE_OUTPUT_DIR, ROOT_OUTPUT_DIR):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / filename
        with path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, default=to_jsonable)


def to_jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def build_validation(
    engine: Engine,
    layer_statuses: dict[str, dict[str, Any]],
    elapsed_seconds: float,
    log_path: Path,
) -> dict[str, Any]:
    raw_counts = {
        school_level: int(scalar(engine, f"SELECT COUNT(*) FROM {source['raw_table']}"))
        for school_level, source in SCHOOL_ZONE_SOURCES.items()
    }
    clean_count = int(scalar(engine, "SELECT COUNT(*) FROM public.school_zones"))
    included_count = int(
        scalar(engine, "SELECT COUNT(*) FROM public.school_zones WHERE include_in_cfs_v1")
    )
    match_rows = fetch_rows(
        engine,
        """
        SELECT
          zone_id,
          school_level,
          school_name_raw,
          school_name_normalized,
          matched_school_reference_id,
          match_confidence,
          include_in_cfs_v1,
          exclusion_reason,
          source_layer_id,
          source_objectid
        FROM public.school_zones
        ORDER BY school_level, school_name_raw, zone_id
        """,
    )
    unmatched_rows = fetch_rows(
        engine,
        """
        SELECT
          school_level,
          school_name_raw,
          school_name_normalized,
          match_confidence,
          include_in_cfs_v1,
          exclusion_reason,
          source_layer_id,
          source_objectid
        FROM public.school_zones
        WHERE matched_school_reference_id IS NULL
        ORDER BY school_level, school_name_raw
        """,
    )
    write_csv_all(
        MATCH_QA_FILENAME,
        match_rows,
        [
            "zone_id",
            "school_level",
            "school_name_raw",
            "school_name_normalized",
            "matched_school_reference_id",
            "match_confidence",
            "include_in_cfs_v1",
            "exclusion_reason",
            "source_layer_id",
            "source_objectid",
        ],
    )
    write_csv_all(
        UNMATCHED_FILENAME,
        unmatched_rows,
        [
            "school_level",
            "school_name_raw",
            "school_name_normalized",
            "match_confidence",
            "include_in_cfs_v1",
            "exclusion_reason",
            "source_layer_id",
            "source_objectid",
        ],
    )

    return {
        "generated_at": datetime.now().isoformat(),
        "clean_table": CLEAN_TABLE,
        "raw_tables": {
            school_level: source["raw_table"]
            for school_level, source in SCHOOL_ZONE_SOURCES.items()
        },
        "layer_statuses": layer_statuses,
        "raw_counts_by_level": raw_counts,
        "clean_zone_count": clean_count,
        "included_cfs_v1_zone_count": included_count,
        "unmatched_zone_name_count": len(unmatched_rows),
        "match_confidence_distribution": fetch_rows(
            engine,
            """
            SELECT COALESCE(match_confidence, 'unknown') AS match_confidence,
                   COUNT(*) AS zone_count
            FROM public.school_zones
            GROUP BY COALESCE(match_confidence, 'unknown')
            ORDER BY zone_count DESC, match_confidence
            """,
        ),
        "zone_count_by_level": fetch_rows(
            engine,
            """
            SELECT COALESCE(school_level, 'unknown') AS school_level,
                   COUNT(*) AS zone_count
            FROM public.school_zones
            GROUP BY COALESCE(school_level, 'unknown')
            ORDER BY school_level
            """,
        ),
        "geometry_validation": {
            "invalid_geometry_count": int(
                scalar(
                    engine,
                    "SELECT COUNT(*) FROM public.school_zones WHERE geometry IS NOT NULL AND NOT ST_IsValid(geometry)",
                )
            ),
            "null_geometry_count": int(
                scalar(engine, "SELECT COUNT(*) FROM public.school_zones WHERE geometry IS NULL")
            ),
            "srid_counts": fetch_rows(
                engine,
                """
                SELECT ST_SRID(geometry) AS srid, COUNT(*) AS zone_count
                FROM public.school_zones
                WHERE geometry IS NOT NULL
                GROUP BY ST_SRID(geometry)
                ORDER BY srid
                """,
            ),
            "geometry_type_counts": fetch_rows(
                engine,
                """
                SELECT ST_GeometryType(geometry) AS geometry_type, COUNT(*) AS zone_count
                FROM public.school_zones
                WHERE geometry IS NOT NULL
                GROUP BY ST_GeometryType(geometry)
                ORDER BY zone_count DESC
                """,
            ),
        },
        "assignment_policy": (
            "Attendance-zone polygons will be used for parcel assignment. "
            "School reference points are used only for name matching and QA."
        ),
        "elapsed_seconds": elapsed_seconds,
        "log_path": str(log_path),
    }


def ingest_one_layer(
    engine: Engine,
    session: Session,
    school_level: str,
    source: dict[str, Any],
    timeout: int,
    page_size_arg: int | None,
    skip_download: bool,
) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    try:
        if skip_download:
            raise ArcGISSourceUnavailable("Download skipped by caller.")
        logging.info("Fetching %s school zone metadata: %s", school_level, source["source_url"])
        metadata = fetch_metadata(session, source["source_url"], timeout)
        page_size = get_page_size(metadata, page_size_arg)
        total_count = fetch_feature_count(session, source["source_url"], timeout)
        features = fetch_features(session, source["source_url"], timeout, page_size, total_count)
        raw_gdf = build_raw_geodataframe(
            features,
            school_level,
            source["source_url"],
            source["source_layer"],
        )
        if raw_gdf.empty:
            execute_sql(engine, empty_raw_table_sql(source["raw_table"]))
        else:
            write_gdf(engine, raw_gdf, source["raw_table"])
            coerce_zone_geometry(engine, source["raw_table"])
        return raw_gdf, {
            "source_status": "downloaded",
            "source_error": None,
            "feature_count": int(len(raw_gdf)),
            "metadata": {
                "name": metadata.get("name"),
                "geometry_type": metadata.get("geometryType"),
                "max_record_count": metadata.get("maxRecordCount"),
            },
        }
    except (requests.RequestException, ArcGISSourceUnavailable, ValueError) as error:
        logging.warning(
            "%s school zone source unavailable; creating empty raw table. Error: %s",
            school_level,
            error,
        )
        execute_sql(engine, empty_raw_table_sql(source["raw_table"]))
        return empty_raw_gdf(), {
            "source_status": "source_unavailable",
            "source_error": str(error),
            "feature_count": 0,
            "metadata": None,
        }


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()
    log_path = configure_logging(args.log_level)
    engine = create_engine_from_env()
    session = create_session()

    raw_gdfs: dict[str, gpd.GeoDataFrame] = {}
    layer_statuses: dict[str, dict[str, Any]] = {}
    for school_level, source in SCHOOL_ZONE_SOURCES.items():
        raw_gdf, status = ingest_one_layer(
            engine=engine,
            session=session,
            school_level=school_level,
            source=source,
            timeout=args.timeout,
            page_size_arg=args.page_size,
            skip_download=args.skip_download,
        )
        raw_gdfs[school_level] = raw_gdf
        layer_statuses[school_level] = status

    reference_rows = load_reference_names(engine)
    clean_gdf = build_clean_geodataframe(raw_gdfs, reference_rows)
    write_clean_table(engine, clean_gdf)

    validation = build_validation(
        engine=engine,
        layer_statuses=layer_statuses,
        elapsed_seconds=round(time.perf_counter() - started_at, 2),
        log_path=log_path,
    )
    write_json_all(VALIDATION_FILENAME, validation)
    logging.info("Wrote school zone validation: %s", ROOT_OUTPUT_DIR / VALIDATION_FILENAME)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
