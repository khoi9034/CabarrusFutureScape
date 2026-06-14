"""Inventory current zoning ArcGIS REST sources for Phase 10D-0 readiness.

This script inspects the current Cabarrus County and municipal zoning services
without ingesting zoning geometry or changing parcel zoning overlays. It writes
schema/readiness artifacts and can optionally refresh the lightweight
public.zoning_source_inventory metadata table when PostGIS credentials are
available.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from sqlalchemy import URL, create_engine, text
    from sqlalchemy.engine import Engine
except ImportError:  # pragma: no cover - optional local profile table support
    URL = None
    create_engine = None
    text = None
    Engine = Any


DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = 5433
DEFAULT_DB_NAME = "cfs_dev"
DEFAULT_DB_USER = "postgres"

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
OUTPUT_DIR = REPO_ROOT / "outputs"
INVENTORY_JSON = OUTPUT_DIR / "current_zoning_source_schema_inventory.json"
INVENTORY_CSV = OUTPUT_DIR / "current_zoning_source_schema_inventory.csv"
READINESS_JSON = OUTPUT_DIR / "zoning_change_readiness_assessment.json"
SUMMARY_JSON = OUTPUT_DIR / "phase10d0_current_zoning_source_inventory_summary.json"


@dataclass(frozen=True)
class ZoningSource:
    source_key: str
    source_name: str
    jurisdiction: str
    service_root_url: str
    layer_id: int
    layer_url: str


MUNICIPAL_ROOT = (
    "https://location.cabarruscounty.us/arcgisservices/rest/services/"
    "OpenData/Zoning_By_Municipalities/MapServer"
)

SOURCES = [
    ZoningSource(
        source_key="cabarrus_county_zoning_current",
        source_name="Cabarrus County Zoning",
        jurisdiction="Cabarrus County / Unincorporated",
        service_root_url=(
            "https://location.cabarruscounty.us/arcgisservices/rest/services/"
            "OpenData/Cabarrus_County_Zoning/MapServer"
        ),
        layer_id=0,
        layer_url=(
            "https://location.cabarruscounty.us/arcgisservices/rest/services/"
            "OpenData/Cabarrus_County_Zoning/MapServer/0"
        ),
    ),
    ZoningSource(
        source_key="concord_zoning_current",
        source_name="Concord Zoning",
        jurisdiction="Concord",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=0,
        layer_url=f"{MUNICIPAL_ROOT}/0",
    ),
    ZoningSource(
        source_key="harrisburg_zoning_current",
        source_name="Harrisburg Zoning",
        jurisdiction="Harrisburg",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=2,
        layer_url=f"{MUNICIPAL_ROOT}/2",
    ),
    ZoningSource(
        source_key="kannapolis_zoning_current",
        source_name="Kannapolis Zoning",
        jurisdiction="Kannapolis",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=3,
        layer_url=f"{MUNICIPAL_ROOT}/3",
    ),
    ZoningSource(
        source_key="locust_zoning_current",
        source_name="Locust Zoning",
        jurisdiction="Locust",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=4,
        layer_url=f"{MUNICIPAL_ROOT}/4",
    ),
    ZoningSource(
        source_key="midland_zoning_current",
        source_name="Midland Zoning",
        jurisdiction="Midland",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=5,
        layer_url=f"{MUNICIPAL_ROOT}/5",
    ),
    ZoningSource(
        source_key="mt_pleasant_zoning_current",
        source_name="MtPleasant Zoning",
        jurisdiction="Mt. Pleasant",
        service_root_url=MUNICIPAL_ROOT,
        layer_id=6,
        layer_url=f"{MUNICIPAL_ROOT}/6",
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect current zoning ArcGIS REST schemas and readiness.",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Do not refresh public.zoning_source_inventory.",
    )
    parser.add_argument("--timeout", type=int, default=45)
    return parser.parse_args()


def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def get_json(
    session: requests.Session,
    url: str,
    params: dict[str, Any] | None,
    timeout: int,
) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        message = payload["error"].get("message", "ArcGIS REST error")
        raise RuntimeError(f"{url} returned ArcGIS error: {message}")
    return payload


def field_names(fields: list[dict[str, Any]]) -> list[str]:
    return [str(field.get("name", "")) for field in fields if field.get("name")]


def find_candidates(
    fields: list[dict[str, Any]],
    tokens: tuple[str, ...],
    type_tokens: tuple[str, ...] = (),
) -> list[str]:
    candidates: list[str] = []
    for field in fields:
        name = str(field.get("name", ""))
        alias = str(field.get("alias", ""))
        field_type = str(field.get("type", ""))
        haystack = f"{name} {alias}".lower()
        if any(token in haystack for token in tokens) or any(
            token in field_type.lower() for token in type_tokens
        ):
            candidates.append(name)
    return candidates


def zoning_code_candidates(fields: list[dict[str, Any]]) -> list[str]:
    preferred = (
        "zoningcode",
        "zoning_code",
        "base_distr",
        "zoning",
        "zoning_typ",
        "zone",
        "district",
    )
    names = field_names(fields)
    ranked = [
        name
        for name in names
        if name.lower() in preferred
        or any(token in name.lower() for token in preferred)
    ]
    return ranked


def zoning_general_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(
        fields,
        ("zoning_gen", "zoningdist", "zoning_typ", "general", "district", "base_distr"),
    )


def case_number_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(fields, ("case", "petition", "rezon", "ordinance"))


def date_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(
        fields,
        ("date", "year", "approved", "approval", "adopt", "effective", "decision"),
        ("date",),
    )


def old_new_zoning_candidates(fields: list[dict[str, Any]]) -> dict[str, list[str]]:
    names = field_names(fields)
    old_tokens = ("old", "previous", "prior", "from")
    new_tokens = ("new", "proposed", "approved", "to")
    zoning_tokens = ("zone", "zoning", "district")
    old_fields = [
        name
        for name in names
        if any(token in name.lower() for token in old_tokens)
        and any(token in name.lower() for token in zoning_tokens)
    ]
    new_fields = [
        name
        for name in names
        if any(token in name.lower() for token in new_tokens)
        and any(token in name.lower() for token in zoning_tokens)
    ]
    return {"old_zoning_field_candidates": old_fields, "new_zoning_field_candidates": new_fields}


def safe_sample_attributes(
    session: requests.Session,
    layer_url: str,
    timeout: int,
) -> list[dict[str, Any]]:
    payload = get_json(
        session,
        f"{layer_url}/query",
        {
            "f": "json",
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "false",
            "resultRecordCount": 3,
        },
        timeout,
    )
    return [feature.get("attributes", {}) for feature in payload.get("features", [])]


def safe_record_count(session: requests.Session, layer_url: str, timeout: int) -> int | None:
    try:
        payload = get_json(
            session,
            f"{layer_url}/query",
            {"f": "json", "where": "1=1", "returnCountOnly": "true"},
            timeout,
        )
        count = payload.get("count")
        return int(count) if count is not None else None
    except Exception:
        return None


def inspect_source(
    session: requests.Session,
    source: ZoningSource,
    timeout: int,
) -> dict[str, Any]:
    metadata = get_json(session, source.layer_url, {"f": "json"}, timeout)
    fields = metadata.get("fields", [])
    code_candidates = zoning_code_candidates(fields)
    general_candidates = zoning_general_candidates(fields)
    case_candidates = case_number_candidates(fields)
    date_field_candidates = date_candidates(fields)
    old_new = old_new_zoning_candidates(fields)
    sample_attributes = safe_sample_attributes(session, source.layer_url, timeout)
    record_count = safe_record_count(session, source.layer_url, timeout)

    has_old_new = bool(
        old_new["old_zoning_field_candidates"] and old_new["new_zoning_field_candidates"]
    )
    has_date = bool(date_field_candidates)

    return {
        "source_key": source.source_key,
        "source_name": source.source_name,
        "jurisdiction": source.jurisdiction,
        "layer_name": metadata.get("name") or source.source_name,
        "layer_id": source.layer_id,
        "full_layer_url": source.layer_url,
        "service_root_url": source.service_root_url,
        "geometry_type": metadata.get("geometryType"),
        "record_count": record_count,
        "fields": fields,
        "field_names": field_names(fields),
        "zoning_code_field_candidates": code_candidates,
        "zoning_district_general_field_candidates": general_candidates,
        "case_number_field_candidates": case_candidates,
        "date_year_field_candidates": date_field_candidates,
        **old_new,
        "srid_spatial_reference": metadata.get("extent", {}).get("spatialReference")
        or metadata.get("sourceSpatialReference")
        or metadata.get("spatialReference"),
        "query_support": {
            "supports_query": bool(metadata.get("capabilities"))
            and "Query" in str(metadata.get("capabilities")),
            "capabilities": metadata.get("capabilities"),
            "supports_pagination": bool(metadata.get("supportsPagination")),
            "supports_statistics": bool(metadata.get("supportsStatistics")),
            "max_record_count": metadata.get("maxRecordCount"),
        },
        "sample_attributes": sample_attributes,
        "current_or_historical": "current_context",
        "appears_current_or_historical": (
            "current_context_only"
            if not has_date or not has_old_new
            else "possible_event_history_needs_manual_review"
        ),
        "time_safe_for_prediction": False,
        "current_context_usable": bool(code_candidates),
        "zoning_change_readiness": {
            "includes_zoning_history": False,
            "has_case_number": bool(case_candidates),
            "has_approval_or_effective_date": has_date,
            "has_old_and_new_zoning_fields": has_old_new,
            "safe_for_time_series_prediction": False,
            "readiness_status": "current_context_only",
            "notes": (
                "CASE fields can support future joins to planning records but are not "
                "zoning-change events without approval dates and old/new zoning fields."
                if case_candidates
                else "No dated old/new zoning event fields were found."
            ),
        },
        "profiled_at": datetime.now(timezone.utc).isoformat(),
    }


def write_inventory_csv(rows: list[dict[str, Any]]) -> None:
    columns = [
        "source_key",
        "source_name",
        "jurisdiction",
        "layer_name",
        "layer_id",
        "full_layer_url",
        "service_root_url",
        "geometry_type",
        "record_count",
        "field_names",
        "zoning_code_field_candidates",
        "zoning_district_general_field_candidates",
        "case_number_field_candidates",
        "date_year_field_candidates",
        "old_zoning_field_candidates",
        "new_zoning_field_candidates",
        "srid_spatial_reference",
        "current_or_historical",
        "appears_current_or_historical",
        "time_safe_for_prediction",
        "current_context_usable",
    ]
    with INVENTORY_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    column: (
                        json.dumps(row.get(column), ensure_ascii=True)
                        if isinstance(row.get(column), (list, dict))
                        else row.get(column)
                    )
                    for column in columns
                }
            )


def create_engine_from_env() -> Engine | None:
    if create_engine is None or URL is None:
        return None
    password = os.getenv("CFS_POSTGRES_PASSWORD")
    if not password:
        return None
    url = URL.create(
        drivername="postgresql+psycopg",
        username=DEFAULT_DB_USER,
        password=password,
        host=DEFAULT_DB_HOST,
        port=DEFAULT_DB_PORT,
        database=DEFAULT_DB_NAME,
    )
    return create_engine(url, pool_pre_ping=True)


def refresh_source_inventory_table(rows: list[dict[str, Any]]) -> dict[str, Any]:
    engine = create_engine_from_env()
    if engine is None or text is None:
        return {
            "loaded": False,
            "reason": "CFS_POSTGRES_PASSWORD or SQLAlchemy/psycopg is unavailable.",
        }

    ddl = """
    CREATE TABLE IF NOT EXISTS public.zoning_source_inventory (
        source_key text PRIMARY KEY,
        source_name text NOT NULL,
        jurisdiction text NOT NULL,
        service_url text NOT NULL,
        layer_id integer NOT NULL,
        geometry_type text,
        zoning_code_field text,
        case_number_field text,
        date_field text,
        current_or_historical text NOT NULL,
        time_safe_for_prediction boolean NOT NULL,
        current_context_usable boolean NOT NULL,
        notes text,
        profiled_at timestamptz NOT NULL DEFAULT now()
    )
    """
    upsert = """
    INSERT INTO public.zoning_source_inventory (
        source_key,
        source_name,
        jurisdiction,
        service_url,
        layer_id,
        geometry_type,
        zoning_code_field,
        case_number_field,
        date_field,
        current_or_historical,
        time_safe_for_prediction,
        current_context_usable,
        notes,
        profiled_at
    )
    VALUES (
        :source_key,
        :source_name,
        :jurisdiction,
        :service_url,
        :layer_id,
        :geometry_type,
        :zoning_code_field,
        :case_number_field,
        :date_field,
        :current_or_historical,
        :time_safe_for_prediction,
        :current_context_usable,
        :notes,
        now()
    )
    ON CONFLICT (source_key) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        jurisdiction = EXCLUDED.jurisdiction,
        service_url = EXCLUDED.service_url,
        layer_id = EXCLUDED.layer_id,
        geometry_type = EXCLUDED.geometry_type,
        zoning_code_field = EXCLUDED.zoning_code_field,
        case_number_field = EXCLUDED.case_number_field,
        date_field = EXCLUDED.date_field,
        current_or_historical = EXCLUDED.current_or_historical,
        time_safe_for_prediction = EXCLUDED.time_safe_for_prediction,
        current_context_usable = EXCLUDED.current_context_usable,
        notes = EXCLUDED.notes,
        profiled_at = now()
    """

    with engine.begin() as conn:
        conn.execute(text(ddl))
        for row in rows:
            conn.execute(
                text(upsert),
                {
                    "source_key": row["source_key"],
                    "source_name": row["source_name"],
                    "jurisdiction": row["jurisdiction"],
                    "service_url": row["full_layer_url"],
                    "layer_id": row["layer_id"],
                    "geometry_type": row.get("geometry_type"),
                    "zoning_code_field": (
                        row.get("zoning_code_field_candidates") or [None]
                    )[0],
                    "case_number_field": (
                        row.get("case_number_field_candidates") or [None]
                    )[0],
                    "date_field": (row.get("date_year_field_candidates") or [None])[0],
                    "current_or_historical": row["current_or_historical"],
                    "time_safe_for_prediction": row["time_safe_for_prediction"],
                    "current_context_usable": row["current_context_usable"],
                    "notes": row["zoning_change_readiness"]["notes"],
                },
            )
        count = conn.execute(
            text("SELECT COUNT(*) FROM public.zoning_source_inventory")
        ).scalar_one()

    return {"loaded": True, "row_count": int(count)}


def build_readiness(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sources_with_case = [
        row["source_key"] for row in rows if row["case_number_field_candidates"]
    ]
    sources_with_date = [
        row["source_key"] for row in rows if row["date_year_field_candidates"]
    ]
    sources_with_old_new = [
        row["source_key"]
        for row in rows
        if row["old_zoning_field_candidates"] and row["new_zoning_field_candidates"]
    ]
    return {
        "assessment": "current_context_only_not_ready_for_zoning_change_features",
        "do_sources_include_zoning_history": False,
        "sources_with_case_numbers": sources_with_case,
        "sources_with_approval_or_effective_dates": sources_with_date,
        "sources_with_old_and_new_zoning_fields": sources_with_old_new,
        "can_changes_be_derived_from_geometry_alone": False,
        "safe_for_time_series_prediction": False,
        "current_context_only": [row["source_key"] for row in rows],
        "current_context_usable_fields": {
            row["source_key"]: {
                "zoning_code_field_candidates": row["zoning_code_field_candidates"],
                "zoning_district_general_field_candidates": row[
                    "zoning_district_general_field_candidates"
                ],
                "case_number_field_candidates": row["case_number_field_candidates"],
            }
            for row in rows
        },
        "additional_data_needed": [
            "Dated rezoning or zoning map amendment case table",
            "Approval/effective date",
            "Old zoning classification",
            "New zoning classification",
            "Parcel or case geometry",
            "Jurisdiction and decision/status fields",
        ],
        "notes": [
            "Current zoning is valid for present-day due diligence and current-context exploration.",
            "CASE_NUMBE or similar fields are possible link keys only; they are not zoning-change events by themselves.",
            "Historical training must not treat current zoning as if it existed in prior snapshot years.",
        ],
    }


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()

    rows = [inspect_source(session, source, args.timeout) for source in SOURCES]
    readiness = build_readiness(rows)
    db_status = (
        {"loaded": False, "reason": "Skipped by --skip-db."}
        if args.skip_db
        else refresh_source_inventory_table(rows)
    )

    INVENTORY_JSON.write_text(
        json.dumps(rows, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    write_inventory_csv(rows)
    READINESS_JSON.write_text(
        json.dumps(readiness, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    summary = {
        "phase": "10D-0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "county_zoning_source_inspected": "cabarrus_county_zoning_current",
        "municipal_layers_inspected": [
            row["source_key"] for row in rows if row["source_key"] != "cabarrus_county_zoning_current"
        ],
        "exact_layer_urls_inspected": [row["full_layer_url"] for row in rows],
        "fields_found": {
            row["source_key"]: row["field_names"] for row in rows
        },
        "case_number_fields_found": {
            row["source_key"]: row["case_number_field_candidates"] for row in rows
        },
        "date_or_history_fields_found": {
            row["source_key"]: {
                "date_year_field_candidates": row["date_year_field_candidates"],
                "old_zoning_field_candidates": row["old_zoning_field_candidates"],
                "new_zoning_field_candidates": row["new_zoning_field_candidates"],
            }
            for row in rows
        },
        "current_context_usability": {
            row["source_key"]: row["current_context_usable"] for row in rows
        },
        "zoning_change_readiness_status": readiness["assessment"],
        "phase10d_zoning_change_feature_engineering_ready": False,
        "data_still_needed": readiness["additional_data_needed"],
        "postgis_source_profile_table": db_status,
        "outputs": {
            "schema_inventory_json": str(INVENTORY_JSON),
            "schema_inventory_csv": str(INVENTORY_CSV),
            "readiness_assessment_json": str(READINESS_JSON),
            "summary_json": str(SUMMARY_JSON),
        },
    }
    SUMMARY_JSON.write_text(
        json.dumps(summary, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
