"""Inspect Cabarrus transportation/accessibility REST sources for Phase 12A.

This is inventory-only. It does not ingest full geometries, create prediction
features, or change existing parcel/development workflows.
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
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "transportation_accessibility_sources.json"
OUTPUT_DIR = PROJECT_ROOT / "outputs"

RELOCATION_WARNING = (
    "Cabarrus REST services may move during ongoing layer organization. If a URL "
    "fails, inspect service roots and update registry before marking unavailable."
)

ROAD_NAME_TOKENS = (
    "name",
    "street",
    "stname",
    "road",
    "rdname",
    "route",
    "fullname",
    "full_name",
    "label",
)
ROAD_CLASS_TOKENS = (
    "class",
    "func",
    "type",
    "roadtyp",
    "category",
    "arterial",
    "collector",
    "local",
    "fclass",
    "route",
)
JURISDICTION_TOKENS = (
    "juris",
    "maint",
    "owner",
    "muni",
    "state",
    "ncdot",
    "county",
    "agency",
)
SPEED_ROUTE_TOKENS = (
    "speed",
    "spd",
    "limit",
    "route",
    "hwy",
    "highway",
    "interstate",
    "us",
    "nc",
    "type",
)
HIGHWAY_INDICATOR_TOKENS = ("hwy", "highway", "interstate", "interchange", "route")


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
    session.headers.update({"User-Agent": "CFS-Phase12A-Source-Inventory/1.0"})
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
    for name in field_names(fields):
        normalized = normalize_name(name)
        if any(token in normalized for token in tokens):
            candidates.append(name)
    return candidates


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


def classify_source(
    source: dict[str, Any],
    geometry_type: str | None,
    record_count: int | None,
    road_name_fields: list[str],
    road_class_fields: list[str],
) -> tuple[str, bool, list[str]]:
    source_type = source.get("source_type")
    limitations: list[str] = []
    if not geometry_type:
        return "inventory_only_not_ready", False, ["metadata geometry type unavailable"]
    if record_count in (None, 0):
        return "inventory_only_not_ready", False, ["record count unavailable or zero"]

    if source_type == "road_centerline":
        if "Polyline" not in geometry_type and "Line" not in geometry_type:
            limitations.append("road accessibility features require line geometry")
            return "inventory_only_not_ready", False, limitations
        if not road_name_fields:
            limitations.append("road name field needs manual mapping")
        if not road_class_fields:
            limitations.append("road class/function field not obvious")
        if limitations:
            return "partially_ready_needs_field_mapping", True, limitations
        return "ready_for_basic_accessibility_features", True, []

    if source_type in {"rail_centerline", "rail_corridor"}:
        if source_type == "rail_centerline" and "Polyline" not in geometry_type and "Line" not in geometry_type:
            limitations.append("rail centerline proximity requires line geometry")
        if source_type == "rail_corridor" and "Polygon" not in geometry_type and "Polyline" not in geometry_type:
            limitations.append("rail corridor proximity requires polygon or line geometry")
        if limitations:
            return "partially_ready_needs_field_mapping", True, limitations
        return "ready_for_basic_accessibility_features", True, []

    return "inventory_only_not_ready", False, ["context layer only; not a transportation feature source"]


def inspect_source(
    session: requests.Session,
    source: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    layer_url = source["full_layer_url"]
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
            "road_name_field_candidates": [],
            "route_or_road_class_field_candidates": [],
            "jurisdiction_or_maintenance_field_candidates": [],
            "speed_or_route_type_field_candidates": [],
            "query_supported": False,
            "geojson_pbf_support": [],
            "useful_for_accessibility_modeling": False,
            "readiness_classification": "needs_review",
            "limitations": [RELOCATION_WARNING],
            "source_relocation_warning": RELOCATION_WARNING,
        }

    fields = metadata.get("fields") if isinstance(metadata.get("fields"), list) else []
    road_name_fields = find_candidate_fields(fields, ROAD_NAME_TOKENS)
    road_class_fields = find_candidate_fields(fields, ROAD_CLASS_TOKENS)
    jurisdiction_fields = find_candidate_fields(fields, JURISDICTION_TOKENS)
    speed_route_fields = find_candidate_fields(fields, SPEED_ROUTE_TOKENS)
    record_count, count_error = get_record_count(session, layer_url, timeout)
    sample_features, sample_error = get_sample_features(session, layer_url, timeout)

    geometry_type = metadata.get("geometryType")
    classification, useful, limitations = classify_source(
        source,
        geometry_type if isinstance(geometry_type, str) else None,
        record_count,
        road_name_fields,
        road_class_fields,
    )
    if count_error:
        limitations.append(f"record count query issue: {count_error}")
    if sample_error:
        limitations.append(f"sample query issue: {sample_error}")

    capabilities = metadata.get("capabilities")
    query_supported = isinstance(capabilities, str) and "Query" in capabilities
    formats = supported_formats(metadata)
    geojson_pbf = [fmt for fmt in formats if fmt.lower() in {"geojson", "pbf"}]

    return {
        **source,
        "inspected_at": inspected_at,
        "source_status": "available",
        "layer_name": metadata.get("name"),
        "layer_id": metadata.get("id", source.get("layer_id")),
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
        "road_name_field_candidates": road_name_fields,
        "route_or_road_class_field_candidates": road_class_fields,
        "jurisdiction_or_maintenance_field_candidates": jurisdiction_fields,
        "speed_or_route_type_field_candidates": speed_route_fields,
        "query_supported": query_supported,
        "supported_query_formats": formats,
        "geojson_pbf_support": geojson_pbf,
        "extent": compact_extent(metadata),
        "sample_features": sample_features,
        "useful_for_accessibility_modeling": useful,
        "readiness_classification": classification,
        "limitations": limitations,
        "source_relocation_warning": RELOCATION_WARNING,
    }


def choose_best_road_source(inventory: list[dict[str, Any]]) -> dict[str, Any] | None:
    road_sources = [
        item
        for item in inventory
        if item.get("source_type") == "road_centerline" and item.get("source_status") == "available"
    ]
    if not road_sources:
        return None
    preferred_order = {
        "cabarrus_county_centerlines_dedicated": 0,
        "opendata_streets_centerline_legacy": 1,
    }
    road_sources.sort(
        key=lambda item: (
            preferred_order.get(str(item.get("source_key")), 99),
            0 if item.get("readiness_classification") == "ready_for_basic_accessibility_features" else 1,
        )
    )
    return road_sources[0]


def build_readiness_assessment(
    inventory: list[dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    best_road = choose_best_road_source(inventory)
    road_layers = [item for item in inventory if item.get("source_type") == "road_centerline"]
    rail_layers = [
        item
        for item in inventory
        if item.get("source_type") in {"rail_centerline", "rail_corridor"}
    ]

    missing_fields: list[str] = [
        "historical or dated road/project records for time-safe prediction",
        "planned transportation project status, expected year, funding status, and geometry",
    ]
    if best_road:
        if not best_road.get("route_or_road_class_field_candidates"):
            missing_fields.append("confirmed road class/function field")
        highway_indicator_fields = [
            field
            for field in best_road.get("speed_or_route_type_field_candidates", [])
            if any(token in normalize_name(str(field)) for token in HIGHWAY_INDICATOR_TOKENS)
        ]
        if not best_road.get("speed_or_route_type_field_candidates"):
            missing_fields.append("speed or route type fields")
        if not highway_indicator_fields:
            missing_fields.append("confirmed highway/interchange indicator field")
        if not best_road.get("jurisdiction_or_maintenance_field_candidates"):
            missing_fields.append("confirmed jurisdiction/maintenance owner field")
    else:
        missing_fields.append("available authoritative road centerline layer")
        highway_indicator_fields = []

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "registry_version": config.get("registry_version"),
        "rest_source_relocation_warning": config.get("policy", {}).get(
            "rest_source_relocation_warning",
            RELOCATION_WARNING,
        ),
        "best_candidate_road_centerline_source": best_road.get("source_key") if best_road else None,
        "best_candidate_road_centerline_url": best_road.get("full_layer_url") if best_road else None,
        "road_centerline_layers_reviewed": [
            {
                "source_key": item.get("source_key"),
                "source_name": item.get("source_name"),
                "record_count": item.get("record_count"),
                "readiness_classification": item.get("readiness_classification"),
                "road_name_field_candidates": item.get("road_name_field_candidates"),
                "route_or_road_class_field_candidates": item.get("route_or_road_class_field_candidates"),
                "limitations": item.get("limitations"),
            }
            for item in road_layers
        ],
        "rail_layers_reviewed": [
            {
                "source_key": item.get("source_key"),
                "source_name": item.get("source_name"),
                "record_count": item.get("record_count"),
                "readiness_classification": item.get("readiness_classification"),
                "limitations": item.get("limitations"),
            }
            for item in rail_layers
        ],
        "readiness_answers": {
            "which_road_centerline_layer_is_most_authoritative": (
                "Dedicated Cabarrus County Centerlines layer if available; legacy opendata Streets Centerline remains fallback/comparison."
                if best_road
                else "No available road centerline layer confirmed during inventory."
            ),
            "does_layer_include_road_class_function_type": bool(
                best_road and best_road.get("route_or_road_class_field_candidates")
            ),
            "does_layer_include_road_name": bool(best_road and best_road.get("road_name_field_candidates")),
            "does_layer_include_highway_or_interchange_indicators": bool(
                best_road and highway_indicator_fields
            ),
            "geometry_good_enough_for_distance_calculations": bool(
                best_road and str(best_road.get("geometry_type", "")).lower().endswith("polyline")
            ),
            "supports_parcel_to_road_distance_features": bool(best_road),
            "supports_corridor_proximity_features": bool(
                best_road or any(item.get("source_type") == "rail_corridor" for item in rail_layers)
            ),
            "supports_rail_proximity_features": any(
                item.get("source_status") == "available" for item in rail_layers
            ),
            "fields_missing_or_needing_mapping": missing_fields,
            "internal_or_organizational_data_to_request_later": [
                "adopted transportation plan project list",
                "roadway widening project geometries and expected year",
                "planned road extension geometries and expected year",
                "intersection improvement project geometries and status",
                "funding status and project phase",
                "future land use and utility/service expansion plans where transportation-related",
            ],
        },
        "overall_readiness_classification": (
            "ready_for_basic_accessibility_features"
            if best_road and best_road.get("readiness_classification") == "ready_for_basic_accessibility_features"
            else "partially_ready_needs_field_mapping"
            if best_road
            else "needs_internal_transportation_plan_data"
        ),
        "current_context_usability": "usable for current-context distance/proximity features after field mapping and geometry QA",
        "time_safe_for_prediction": False,
        "time_safe_caveat": "Road and rail layers are current-context unless historical centerlines or dated transportation project records are available.",
        "recommended_next_phase": "Phase 12B should ingest the selected road/rail geometries into staging tables and create parcel distance/proximity features with explicit current-context and time-safety flags.",
    }


def write_inventory_csv(path: Path, inventory: list[dict[str, Any]]) -> None:
    columns = [
        "source_key",
        "source_name",
        "source_type",
        "layer_id",
        "full_layer_url",
        "geometry_type",
        "spatial_reference",
        "record_count",
        "field_names",
        "road_name_field_candidates",
        "route_or_road_class_field_candidates",
        "jurisdiction_or_maintenance_field_candidates",
        "speed_or_route_type_field_candidates",
        "query_supported",
        "geojson_pbf_support",
        "useful_for_accessibility_modeling",
        "readiness_classification",
        "limitations",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for item in inventory:
            row: dict[str, Any] = {}
            for column in columns:
                value = item.get(column)
                if isinstance(value, (list, dict)):
                    row[column] = json.dumps(value, sort_keys=True)
                else:
                    row[column] = value
            writer.writerow(row)


def write_summary(
    path: Path,
    inventory: list[dict[str, Any]],
    assessment: dict[str, Any],
) -> None:
    summary = {
        "phase": "12A_transportation_accessibility_source_inventory",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources_inspected": [
            {
                "source_key": item.get("source_key"),
                "source_name": item.get("source_name"),
                "full_layer_url": item.get("full_layer_url"),
                "source_status": item.get("source_status"),
                "record_count": item.get("record_count"),
                "readiness_classification": item.get("readiness_classification"),
            }
            for item in inventory
        ],
        "exact_layer_urls_inspected": [item.get("full_layer_url") for item in inventory],
        "fields_found": {
            item.get("source_key"): item.get("field_names", []) for item in inventory
        },
        "best_candidate_source": assessment.get("best_candidate_road_centerline_source"),
        "best_candidate_source_url": assessment.get("best_candidate_road_centerline_url"),
        "fallback_source_urls": {
            item.get("source_key"): item.get("fallback_urls", []) for item in inventory
        },
        "current_context_usability": assessment.get("current_context_usability"),
        "prediction_feature_readiness": assessment.get("overall_readiness_classification"),
        "missing_fields": assessment.get("readiness_answers", {}).get("fields_missing_or_needing_mapping"),
        "recommended_next_phase": assessment.get("recommended_next_phase"),
        "rest_source_relocation_warning": assessment.get("rest_source_relocation_warning"),
        "validation_scope": "inventory-only; no full geometry ingestion, no feature matrix alteration, no model training",
        "outputs": [
            "outputs/transportation_source_schema_inventory.json",
            "outputs/transportation_source_schema_inventory.csv",
            "outputs/transportation_accessibility_readiness_assessment.json",
            "outputs/phase12a_transportation_accessibility_source_inventory_summary.json",
        ],
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
        raise ValueError("transportation source config must contain a sources list")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()
    inventory = [inspect_source(session, source, args.timeout) for source in sources]
    assessment = build_readiness_assessment(inventory, config)

    (OUTPUT_DIR / "transportation_source_schema_inventory.json").write_text(
        json.dumps(inventory, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    write_inventory_csv(OUTPUT_DIR / "transportation_source_schema_inventory.csv", inventory)
    (OUTPUT_DIR / "transportation_accessibility_readiness_assessment.json").write_text(
        json.dumps(assessment, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    write_summary(
        OUTPUT_DIR / "phase12a_transportation_accessibility_source_inventory_summary.json",
        inventory,
        assessment,
    )

    print(
        json.dumps(
            {
                "sources_inspected": len(inventory),
                "available_sources": sum(1 for item in inventory if item.get("source_status") == "available"),
                "best_candidate_road_source": assessment.get("best_candidate_road_centerline_source"),
                "readiness": assessment.get("overall_readiness_classification"),
                "summary": "outputs/phase12a_transportation_accessibility_source_inventory_summary.json",
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
