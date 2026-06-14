"""Inspect Phase 16A planning, pipeline, utility proxy, and parcel enrichment sources.

This is source inventory only. It does not ingest full geometries, train a
model, expose predictions, or treat document/PDF references as structured data.
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
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "planning_pipeline_utility_sources.json"
OUTPUT_DIR = PROJECT_ROOT / "outputs"
JSON_OUTPUT = OUTPUT_DIR / "planning_pipeline_utility_source_schema_inventory.json"
CSV_OUTPUT = OUTPUT_DIR / "planning_pipeline_utility_source_schema_inventory.csv"

REST_RELOCATION_WARNING = (
    "Cabarrus and municipal REST services may move during service reorganization. "
    "If a URL fails, inspect service roots, layer IDs, fallback URLs, and the source "
    "registry before marking unavailable."
)

LAND_USE_TOKENS = ("future", "land", "use", "flu", "flum", "place", "growth", "category")
PLAN_NODE_TOKENS = ("name", "label", "node", "area", "corridor", "district", "type", "category")
PARCEL_LINK_TOKENS = ("parcel", "pin", "account", "tax", "pid", "parcelid", "parno", "parcelnum")
STATUS_TOKENS = ("status", "stage", "phase", "review", "workflow", "open", "closed")
DATE_TOKENS = ("date", "file", "submit", "created", "updated", "open", "closed", "issued")
VALUE_TOKENS = ("value", "land", "impr", "building", "assess", "tax", "market", "defer")
UTILITY_TOKENS = ("sewer", "line", "pipe", "manhole", "district", "wsacc", "utility", "service")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--timeout", type=int, default=30)
    return parser.parse_args()


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
    session.headers.update({"User-Agent": "CFS-Phase16A-Source-Inventory/1.0"})
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
    except Exception as exc:  # noqa: BLE001 - inventory should continue.
        return None, str(exc)
    if isinstance(payload, dict) and "error" in payload:
        return None, json.dumps(payload["error"], sort_keys=True)
    if not isinstance(payload, dict):
        return None, "response was not a JSON object"
    return payload, None


def normalize_name(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in value).strip("_")


def field_names(fields: list[dict[str, Any]]) -> list[str]:
    return [str(field.get("name")) for field in fields if field.get("name")]


def find_candidate_fields(fields: list[dict[str, Any]], tokens: tuple[str, ...]) -> list[str]:
    candidates: list[str] = []
    for field in fields:
        name = str(field.get("name") or "")
        alias = str(field.get("alias") or "")
        haystack = f"{normalize_name(name)} {normalize_name(alias)}"
        if any(token in haystack for token in tokens):
            candidates.append(name)
    return candidates


def compact_spatial_reference(metadata: dict[str, Any]) -> dict[str, Any] | None:
    sr = metadata.get("spatialReference")
    if not isinstance(sr, dict):
        return None
    return {
        key: sr.get(key)
        for key in ("wkid", "latestWkid", "vcsWkid", "latestVcsWkid")
        if sr.get(key) is not None
    }


def supported_formats(metadata: dict[str, Any]) -> list[str]:
    formats = metadata.get("supportedQueryFormats")
    if not isinstance(formats, str):
        return []
    return [item.strip() for item in formats.split(",") if item.strip()]


def get_record_count(session: requests.Session, layer_url: str, timeout: int) -> tuple[int | None, str | None]:
    payload, error = get_json(
        session,
        f"{layer_url}/query",
        {"f": "json", "where": "1=1", "returnCountOnly": "true"},
        timeout,
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
        {
            "f": "json",
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "false",
            "resultRecordCount": 3,
        },
        timeout,
    )
    if error:
        return [], error
    features = payload.get("features") if payload else []
    if not isinstance(features, list):
        return [], "features was not a list"
    return [
        feature["attributes"]
        for feature in features
        if isinstance(feature, dict) and isinstance(feature.get("attributes"), dict)
    ], None


def classify_source(source: dict[str, Any], geometry_type: str | None, fields: list[dict[str, Any]]) -> str:
    if source.get("source_type") in {"pdf_reference", "pdf_or_table_reference", "web_reference"}:
        return "document_inventory_only"
    if not geometry_type:
        return "needs_review_metadata_unavailable"
    if source.get("source_group") == "central_area_plan":
        return "ready_for_concord_only_current_context_features"
    if source.get("source_group") == "accela_plan_reviews":
        return "ready_for_current_pipeline_signal_if_parcel_key_found"
    if source.get("source_group") == "utility_proxy":
        return "ready_for_current_utility_proxy_features_not_capacity"
    if source.get("source_group") == "tax_parcel_full":
        return "ready_for_gap_check_do_not_overwrite_base_parcels"
    if not fields:
        return "needs_schema_review"
    return "needs_review"


def inspect_source(session: requests.Session, source: dict[str, Any], timeout: int) -> dict[str, Any]:
    inspected_at = datetime.now(timezone.utc).isoformat()
    layer_url = source.get("full_layer_url")
    if not layer_url:
        return {
            **source,
            "inspected_at": inspected_at,
            "source_status": source.get("source_status", "inventory_only"),
            "metadata_error": None,
            "record_count": None,
            "fields": [],
            "readiness": "document_inventory_only",
            "relocation_warning": REST_RELOCATION_WARNING,
        }

    metadata, metadata_error = get_json(session, layer_url, {"f": "json"}, timeout)
    if metadata_error or metadata is None:
        return {
            **source,
            "inspected_at": inspected_at,
            "source_status": "unavailable_or_moved",
            "metadata_error": metadata_error,
            "record_count": None,
            "fields": [],
            "readiness": "needs_review_metadata_unavailable",
            "relocation_warning": REST_RELOCATION_WARNING,
        }

    fields = metadata.get("fields") if isinstance(metadata.get("fields"), list) else []
    record_count, count_error = get_record_count(session, layer_url, timeout)
    sample_features, sample_error = get_sample_features(session, layer_url, timeout)

    return {
        **source,
        "inspected_at": inspected_at,
        "source_status": "active",
        "layer_name": metadata.get("name"),
        "geometry_type": metadata.get("geometryType"),
        "spatial_reference": compact_spatial_reference(metadata),
        "record_count": record_count,
        "count_error": count_error,
        "query_supported": bool(metadata.get("capabilities") and "Query" in str(metadata.get("capabilities"))),
        "supported_query_formats": supported_formats(metadata),
        "fields": fields,
        "field_names": field_names(fields),
        "land_use_field_candidates": find_candidate_fields(fields, LAND_USE_TOKENS),
        "plan_node_field_candidates": find_candidate_fields(fields, PLAN_NODE_TOKENS),
        "parcel_link_field_candidates": find_candidate_fields(fields, PARCEL_LINK_TOKENS),
        "status_field_candidates": find_candidate_fields(fields, STATUS_TOKENS),
        "date_field_candidates": find_candidate_fields(fields, DATE_TOKENS),
        "value_field_candidates": find_candidate_fields(fields, VALUE_TOKENS),
        "utility_field_candidates": find_candidate_fields(fields, UTILITY_TOKENS),
        "sample_features": sample_features,
        "sample_error": sample_error,
        "readiness": classify_source(source, metadata.get("geometryType"), fields),
        "concord_only": source.get("source_group") == "central_area_plan",
        "utility_proxy_not_capacity": source.get("source_group") == "utility_proxy",
        "relocation_warning": REST_RELOCATION_WARNING,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "source_key",
        "source_name",
        "source_group",
        "source_type",
        "jurisdiction",
        "layer_id",
        "full_layer_url",
        "source_status",
        "layer_name",
        "geometry_type",
        "record_count",
        "field_names",
        "land_use_field_candidates",
        "parcel_link_field_candidates",
        "status_field_candidates",
        "date_field_candidates",
        "value_field_candidates",
        "utility_field_candidates",
        "readiness",
        "current_context_only",
        "time_safe_for_training",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: json.dumps(row.get(key), sort_keys=True)
                    if isinstance(row.get(key), (list, dict))
                    else row.get(key)
                    for key in fieldnames
                }
            )


def main() -> None:
    args = parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    session = make_session()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = [inspect_source(session, source, args.timeout) for source in config.get("sources", [])]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(rows),
        "active_rest_source_count": sum(1 for row in rows if row.get("source_status") == "active"),
        "document_inventory_source_count": sum(1 for row in rows if row.get("readiness") == "document_inventory_only"),
        "policy": config.get("policy", {}),
        "sources": rows,
    }
    JSON_OUTPUT.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    write_csv(CSV_OUTPUT, rows)
    print(f"Wrote {JSON_OUTPUT}")
    print(f"Wrote {CSV_OUTPUT}")


if __name__ == "__main__":
    main()
