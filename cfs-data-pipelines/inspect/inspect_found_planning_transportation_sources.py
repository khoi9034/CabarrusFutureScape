"""Inspect already-found planning and transportation sources for Phase 13A.

Inventory only: no full geometry ingestion, model training, prediction
exposure, or feature matrix changes.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "found_planning_transportation_sources.json"
OUTPUT_DIR = PROJECT_ROOT / "outputs"

RELOCATION_WARNING = (
    "Cabarrus and partner REST services may move during ongoing layer organization. "
    "If a URL fails, inspect service roots, layer IDs, and fallback notes before marking unavailable."
)

DATE_YEAR_TOKENS = (
    "date",
    "year",
    "fy",
    "fiscal",
    "let",
    "start",
    "end",
    "completion",
    "complete",
    "adopt",
    "approve",
    "approval",
    "updated",
    "edit",
    "horizon",
)
STATUS_TOKENS = ("status", "phase", "stage", "fund", "funded", "program", "schedule")
PROJECT_CASE_TYPE_TOKENS = (
    "project",
    "proj",
    "case",
    "petition",
    "type",
    "category",
    "activity",
    "work",
    "description",
    "route",
    "name",
)
LAND_USE_TOKENS = ("landuse", "land_use", "future", "use", "flum", "category", "place", "growth", "plan")
TRAFFIC_COUNT_TOKENS = ("aadt", "traffic", "volume", "vol", "station", "annual")
JURISDICTION_TOKENS = ("juris", "municip", "municipality", "city", "county", "town", "district", "division")


def make_session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.75,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.headers.update({"User-Agent": "CFS-Phase13A-FoundSourceInventory/1.0"})
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def get_json(
    session: requests.Session,
    url: str,
    params: dict[str, Any] | None = None,
    timeout: int = 30,
) -> tuple[dict[str, Any] | None, str | None]:
    try:
        response = session.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:  # noqa: BLE001 - inventory should keep going.
        return None, str(exc)
    if isinstance(payload, dict) and "error" in payload:
        return None, json.dumps(payload["error"], sort_keys=True)
    if not isinstance(payload, dict):
        return None, "response was not a JSON object"
    return payload, None


def normalize_name(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in value).strip("_")


def field_names(fields: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for field in fields:
        name = field.get("name")
        if isinstance(name, str) and name:
            names.append(name)
    return names


def find_candidate_fields(fields: list[dict[str, Any]], tokens: tuple[str, ...]) -> list[str]:
    candidates: list[str] = []
    for field in fields:
        name = str(field.get("name") or "")
        alias = str(field.get("alias") or "")
        haystack = f"{normalize_name(name)} {normalize_name(alias)}"
        if any(token in haystack for token in tokens):
            candidates.append(name)
    return candidates


def find_date_year_fields(fields: list[dict[str, Any]]) -> list[str]:
    candidates = set(find_candidate_fields(fields, DATE_YEAR_TOKENS))
    for field in fields:
        field_type = str(field.get("type") or "").lower()
        name = str(field.get("name") or "")
        if name and "date" in field_type:
            candidates.add(name)
    return sorted(candidates)


def get_record_count(session: requests.Session, layer_url: str, timeout: int) -> tuple[int | None, str | None]:
    payload, error = get_json(
        session,
        f"{layer_url}/query",
        params={"f": "json", "where": "1=1", "returnCountOnly": "true"},
        timeout=timeout,
    )
    if error:
        return None, error
    count = payload.get("count") if payload else None
    return count if isinstance(count, int) else None, None


def get_sample_features(
    session: requests.Session,
    layer_url: str,
    timeout: int,
) -> tuple[list[dict[str, Any]], str | None]:
    payload, error = get_json(
        session,
        f"{layer_url}/query",
        params={
            "f": "json",
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "false",
            "resultRecordCount": 3,
        },
        timeout=timeout,
    )
    if error:
        return [], error
    features = payload.get("features") if payload else []
    if not isinstance(features, list):
        return [], "features was not a list"
    rows: list[dict[str, Any]] = []
    for feature in features:
        if isinstance(feature, dict) and isinstance(feature.get("attributes"), dict):
            rows.append(feature["attributes"])
    return rows, None


def compact_spatial_reference(metadata: dict[str, Any]) -> dict[str, Any] | None:
    sr = metadata.get("spatialReference")
    if isinstance(sr, dict):
        return {
            key: sr.get(key)
            for key in ("wkid", "latestWkid", "vcsWkid", "latestVcsWkid")
            if sr.get(key) is not None
        }
    return None


def compact_extent(metadata: dict[str, Any]) -> dict[str, Any] | None:
    extent = metadata.get("extent")
    if not isinstance(extent, dict):
        return None
    return {
        key: extent.get(key)
        for key in ("xmin", "ymin", "xmax", "ymax", "spatialReference")
        if extent.get(key) is not None
    }


def supported_formats(metadata: dict[str, Any]) -> list[str]:
    formats = metadata.get("supportedQueryFormats")
    if not isinstance(formats, str):
        return []
    return [item.strip() for item in formats.split(",") if item.strip()]


def can_support_overlay(geometry_type: str | None) -> bool:
    return bool(geometry_type and "Polygon" in geometry_type)


def can_support_proximity(geometry_type: str | None) -> bool:
    return bool(geometry_type and any(token in geometry_type for token in ("Point", "Polyline", "Polygon")))


def readiness_for_source(
    source: dict[str, Any],
    geometry_type: str | None,
    record_count: int | None,
    date_fields: list[str],
    status_fields: list[str],
    type_fields: list[str],
    land_use_fields: list[str],
    traffic_fields: list[str],
) -> tuple[str, list[str], str]:
    missing: list[str] = []
    if not geometry_type:
        return "not_ready", ["geometry metadata unavailable"], "Phase 13A source repair"
    if record_count in (None, 0):
        return "not_ready", ["record count unavailable or zero"], "Phase 13A source repair"

    key = source["source_key"]
    if key == "concord_land_use_plan_2030":
        if not land_use_fields:
            missing.append("confirmed future land use category field")
        if not can_support_overlay(geometry_type):
            missing.append("polygon geometry for parcel overlay")
        phase = "Phase 13B Concord future land-use overlay prototype"
        return (
            "ready_but_current_context_only" if not missing else "partial_needs_field_mapping",
            missing,
            phase,
        )
    if key == "ncdot_stip_2026_2035":
        if not type_fields:
            missing.append("project type/name/category field")
        if not date_fields:
            missing.append("project year/date field for temporal alignment")
        if not status_fields:
            missing.append("status/funding/program field")
        phase = "Phase 13C STIP transportation-project proximity features"
        return (
            "ready_but_current_context_only" if len(missing) <= 1 else "partial_needs_field_mapping",
            missing,
            phase,
        )
    if key == "ncdot_aadt_traffic_counts":
        if not traffic_fields:
            missing.append("AADT or traffic count field")
        if not can_support_proximity(geometry_type):
            missing.append("point geometry for nearest-station proximity")
        phase = "Phase 13D AADT station proximity and traffic-intensity features"
        return (
            "ready_but_current_context_only" if not missing else "partial_needs_field_mapping",
            missing,
            phase,
        )
    if key == "concord_planning_cases":
        if not type_fields:
            missing.append("planning case type/name field")
        if not date_fields:
            missing.append("case date/year field for recent activity features")
        if not status_fields:
            missing.append("case status field for approval/review distinction")
        phase = "Phase 13E Concord planning-case proximity and activity features"
        return (
            "ready_but_current_context_only" if len(missing) <= 1 else "partial_needs_field_mapping",
            missing,
            phase,
        )
    return "inventory_only", missing, "Future source-specific ingestion phase"


def inspect_source(
    session: requests.Session,
    source: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    layer_url = source["source_url"]
    metadata, metadata_error = get_json(session, layer_url, params={"f": "json"}, timeout=timeout)
    inspected_at = datetime.now(timezone.utc).isoformat()
    if metadata_error or metadata is None:
        return {
            **source,
            "inspected_at": inspected_at,
            "source_status": "unavailable_or_moved",
            "metadata_error": metadata_error,
            "record_count": None,
            "fields": [],
            "field_names": [],
            "date_year_fields": [],
            "status_fields": [],
            "project_case_type_fields": [],
            "land_use_category_fields": [],
            "traffic_count_fields": [],
            "jurisdiction_municipality_fields": [],
            "query_supported": False,
            "geojson_pbf_support": [],
            "feature_readiness_classification": "not_ready",
            "fields_missing_for_modeling": [RELOCATION_WARNING],
            "recommended_ingestion_phase": "Phase 13A source repair",
            "source_relocation_warning": RELOCATION_WARNING,
        }

    fields = metadata.get("fields") if isinstance(metadata.get("fields"), list) else []
    date_fields = find_date_year_fields(fields)
    status_fields = find_candidate_fields(fields, STATUS_TOKENS)
    type_fields = find_candidate_fields(fields, PROJECT_CASE_TYPE_TOKENS)
    land_use_fields = find_candidate_fields(fields, LAND_USE_TOKENS)
    traffic_fields = find_candidate_fields(fields, TRAFFIC_COUNT_TOKENS)
    jurisdiction_fields = find_candidate_fields(fields, JURISDICTION_TOKENS)
    record_count, count_error = get_record_count(session, layer_url, timeout)
    sample_features, sample_error = get_sample_features(session, layer_url, timeout)
    geometry_type = metadata.get("geometryType")
    geometry_type_str = geometry_type if isinstance(geometry_type, str) else None
    classification, missing_fields, phase = readiness_for_source(
        source,
        geometry_type_str,
        record_count,
        date_fields,
        status_fields,
        type_fields,
        land_use_fields,
        traffic_fields,
    )
    limitations = list(source.get("caveats", []))
    if count_error:
        limitations.append(f"record count query issue: {count_error}")
    if sample_error:
        limitations.append(f"sample query issue: {sample_error}")
    if source.get("geography_scope") == "concord_only":
        limitations.append("Jurisdiction-limited: Concord only.")

    capabilities = metadata.get("capabilities")
    query_supported = isinstance(capabilities, str) and "Query" in capabilities
    formats = supported_formats(metadata)
    geojson_pbf = [fmt for fmt in formats if fmt.lower() in {"geojson", "pbf"}]
    current_context_only = True

    return {
        **source,
        "inspected_at": inspected_at,
        "source_status": "available",
        "layer_name": metadata.get("name"),
        "geometry_type": geometry_type,
        "spatial_reference": compact_spatial_reference(metadata),
        "record_count": record_count,
        "fields": [
            {
                "name": field.get("name"),
                "type": field.get("type"),
                "alias": field.get("alias"),
            }
            for field in fields
        ],
        "field_names": field_names(fields),
        "date_year_fields": date_fields,
        "status_fields": status_fields,
        "project_case_type_fields": type_fields,
        "land_use_category_fields": land_use_fields,
        "traffic_count_fields": traffic_fields,
        "jurisdiction_municipality_fields": jurisdiction_fields,
        "query_supported": query_supported,
        "supported_query_formats": formats,
        "geojson_pbf_support": geojson_pbf,
        "extent": compact_extent(metadata),
        "sample_features": sample_features,
        "can_support_parcel_overlay": can_support_overlay(geometry_type_str),
        "can_support_distance_proximity_features": can_support_proximity(geometry_type_str),
        "can_support_temporal_features": bool(date_fields),
        "time_safe_for_historical_model_training": False,
        "current_context_only": current_context_only,
        "jurisdiction_limited": source.get("geography_scope") == "concord_only",
        "feature_readiness_classification": classification,
        "fields_needed_for_modeling": modeling_field_needs(source["source_key"]),
        "fields_missing_for_modeling": missing_fields,
        "recommended_ingestion_phase": phase,
        "limitations": limitations,
        "source_relocation_warning": RELOCATION_WARNING,
    }


def modeling_field_needs(source_key: str) -> list[str]:
    needs = {
        "concord_land_use_plan_2030": [
            "land use category",
            "policy/growth category",
            "polygon geometry",
            "plan adoption/effective date if available",
        ],
        "ncdot_stip_2026_2035": [
            "project type",
            "project status",
            "funding/program year",
            "geometry",
            "route/project name",
        ],
        "ncdot_aadt_traffic_counts": [
            "AADT traffic count value",
            "traffic count year",
            "station geometry",
            "route/station identifier",
        ],
        "concord_planning_cases": [
            "case type",
            "case status",
            "case date/year",
            "geometry",
            "case identifier",
        ],
    }
    return needs.get(source_key, [])


def build_readiness_assessment(inventory: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    by_source = []
    for item in inventory:
        by_source.append(
            {
                "source_key": item.get("source_key"),
                "source_name": item.get("source_name"),
                "feature_readiness_classification": item.get("feature_readiness_classification"),
                "can_support_parcel_overlay": bool(item.get("can_support_parcel_overlay")),
                "can_support_distance_proximity_features": bool(
                    item.get("can_support_distance_proximity_features"),
                ),
                "can_support_temporal_features": bool(item.get("can_support_temporal_features")),
                "time_safe_for_historical_model_training": False,
                "current_context_only": bool(item.get("current_context_only", True)),
                "jurisdiction_limited": bool(item.get("jurisdiction_limited")),
                "fields_needed_for_modeling": item.get("fields_needed_for_modeling", []),
                "fields_missing_for_modeling": item.get("fields_missing_for_modeling", []),
                "recommended_ingestion_phase": item.get("recommended_ingestion_phase"),
                "caveats": item.get("limitations", []),
            }
        )
    return {
        "phase": "13A_found_source_feature_readiness",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "registry_version": config.get("registry_version"),
        "source_count": len(inventory),
        "sources": by_source,
        "overall_caveats": [
            "Concord-only sources must not be treated as countywide.",
            "No source is marked time-safe for historical training in Phase 13A.",
            "Countywide small-area plan/future land use GIS outside Concord is still missing.",
            "WSACC utility capacity/service-area GIS is still missing.",
            "Local planned road projects beyond STIP are still missing.",
        ],
        "recommended_next_ingestion_phase": (
            "Phase 13B should ingest one bounded source at a time, starting with "
            "Concord future land use overlay or STIP project proximity, while "
            "preserving jurisdiction/current-context caveats."
        ),
        "model_active": False,
        "prediction_probability_available": False,
    }


def write_inventory_csv(path: Path, inventory: list[dict[str, Any]]) -> None:
    columns = [
        "source_key",
        "source_name",
        "source_url",
        "jurisdiction",
        "geography_scope",
        "layer_name",
        "geometry_type",
        "spatial_reference",
        "record_count",
        "field_names",
        "date_year_fields",
        "status_fields",
        "project_case_type_fields",
        "land_use_category_fields",
        "traffic_count_fields",
        "jurisdiction_municipality_fields",
        "query_supported",
        "geojson_pbf_support",
        "feature_readiness_classification",
        "current_context_only",
        "jurisdiction_limited",
        "fields_missing_for_modeling",
        "recommended_ingestion_phase",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for item in inventory:
            row: dict[str, Any] = {}
            for column in columns:
                value = item.get(column)
                row[column] = json.dumps(value, sort_keys=True) if isinstance(value, (list, dict)) else value
            writer.writerow(row)


def write_summary(path: Path, inventory: list[dict[str, Any]], assessment: dict[str, Any]) -> None:
    summary = {
        "phase": "13A_found_planning_transportation_source_registration",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources_registered": [
            {
                "source_key": item.get("source_key"),
                "source_name": item.get("source_name"),
                "source_url": item.get("source_url"),
                "geography_scope": item.get("geography_scope"),
                "feature_group": item.get("feature_group"),
            }
            for item in inventory
        ],
        "schemas_inspected": [
            {
                "source_key": item.get("source_key"),
                "source_status": item.get("source_status"),
                "layer_name": item.get("layer_name"),
                "geometry_type": item.get("geometry_type"),
                "record_count": item.get("record_count"),
                "query_supported": item.get("query_supported"),
            }
            for item in inventory
        ],
        "record_counts": {
            item.get("source_key"): item.get("record_count") for item in inventory
        },
        "fields_found": {
            item.get("source_key"): item.get("field_names", []) for item in inventory
        },
        "feature_readiness_classifications": {
            item.get("source_key"): item.get("feature_readiness_classification")
            for item in inventory
        },
        "current_context_caveats": assessment.get("overall_caveats", []),
        "missing_data_tracker_created": "docs/data_requests/cfs_missing_data_tracker.md",
        "recommended_next_ingestion_phase": assessment.get("recommended_next_ingestion_phase"),
        "outputs": [
            "outputs/found_source_schema_inventory.json",
            "outputs/found_source_schema_inventory.csv",
            "outputs/found_source_feature_readiness_assessment.json",
            "outputs/phase13a_found_source_registration_summary.json",
        ],
        "guardrails": {
            "full_geometry_ingested": False,
            "feature_matrix_modified": False,
            "model_trained": False,
            "prediction_exposed": False,
            "frontend_modified": False,
        },
    }
    path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8"))
    sources = config.get("sources")
    if not isinstance(sources, list):
        raise ValueError("found source config must contain a sources list")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()
    inventory = [inspect_source(session, source, args.timeout) for source in sources]
    assessment = build_readiness_assessment(inventory, config)

    (OUTPUT_DIR / "found_source_schema_inventory.json").write_text(
        json.dumps(inventory, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    write_inventory_csv(OUTPUT_DIR / "found_source_schema_inventory.csv", inventory)
    (OUTPUT_DIR / "found_source_feature_readiness_assessment.json").write_text(
        json.dumps(assessment, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    write_summary(OUTPUT_DIR / "phase13a_found_source_registration_summary.json", inventory, assessment)

    print(
        json.dumps(
            {
                "sources_inspected": len(inventory),
                "available_sources": sum(1 for item in inventory if item.get("source_status") == "available"),
                "readiness": {
                    item.get("source_key"): item.get("feature_readiness_classification")
                    for item in inventory
                },
                "summary": "outputs/phase13a_found_source_registration_summary.json",
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
