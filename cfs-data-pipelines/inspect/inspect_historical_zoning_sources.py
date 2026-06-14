"""Inspect historical zoning ArcGIS REST layers for Phase 10D-1 readiness."""

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

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_ROOT.parent
CONFIG_PATH = REPO_ROOT / "config" / "historical_zoning_sources.json"
OUTPUT_DIR = REPO_ROOT / "outputs"
INVENTORY_JSON = OUTPUT_DIR / "historical_zoning_source_inventory.json"
INVENTORY_CSV = OUTPUT_DIR / "historical_zoning_source_inventory.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect historical zoning source schemas.")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--timeout", type=int, default=45)
    return parser.parse_args()


def load_config(config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    service_root = config["service_root_url"].rstrip("/")
    for source in config["sources"]:
        source["service_root_url"] = service_root
        source["full_layer_url"] = f"{service_root}/{source['layer_id']}"
    return config


def make_session() -> requests.Session:
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "CabarrusFutureScape-HistoricalZoningInventory/0.1"})
    return session


def request_json(
    session: requests.Session,
    url: str,
    params: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
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
    tokens = (
        "zoningcode",
        "zoning_code",
        "base_distr",
        "zone_id",
        "zoning",
        "zoning_typ",
        "zone",
        "district",
        "zoning_gen",
        "zoningdist",
    )
    names = field_names(fields)
    return [name for name in names if any(token in name.lower() for token in tokens)]


def zoning_district_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(
        fields,
        ("zoningdist", "zoning_gen", "zoning_typ", "base_distr", "district", "zone_id"),
    )


def case_number_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(fields, ("case", "cu_case", "petition", "rezon", "ordinance"))


def date_candidates(fields: list[dict[str, Any]]) -> list[str]:
    return find_candidates(
        fields,
        ("date", "year", "effective", "approved", "approval", "adopt", "decision", "edit"),
        ("date",),
    )


def classify_layer(
    metadata: dict[str, Any],
    record_count: int | None,
    code_fields: list[str],
    geometry_available: bool,
) -> tuple[str, str, bool, bool]:
    if metadata.get("type") != "Feature Layer":
        return "unusable", "Layer is not a feature layer.", False, False
    if metadata.get("geometryType") != "esriGeometryPolygon":
        return "unusable", "Layer is not polygon zoning geometry.", False, False
    if not geometry_available:
        return "needs_review", "Layer query did not confirm geometry availability.", False, False
    if record_count == 0:
        return "needs_review", "Layer has zero records.", False, False
    if not code_fields:
        return (
            "historical_but_schema_review_required",
            "Polygon layer has records but no clear zoning code field.",
            True,
            False,
        )
    return (
        "historical_time_safe_candidate",
        "Historical polygon layer with a zoning field candidate.",
        True,
        True,
    )


def inspect_source(
    session: requests.Session,
    source: dict[str, Any],
    timeout: int,
) -> dict[str, Any]:
    layer_url = source["full_layer_url"]
    try:
        metadata = request_json(session, layer_url, {"f": "json"}, timeout)
        fields = metadata.get("fields", [])
        count_payload = request_json(
            session,
            f"{layer_url}/query",
            {"f": "json", "where": "1=1", "returnCountOnly": "true"},
            timeout,
        )
        record_count = int(count_payload.get("count", 0))
        sample = request_json(
            session,
            f"{layer_url}/query",
            {
                "f": "geojson",
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "true",
                "resultRecordCount": 1,
                "outSR": 4326,
            },
            timeout,
        )
        geometry_available = bool(sample.get("features", []))
        code_fields = zoning_code_candidates(fields)
        district_fields = zoning_district_candidates(fields)
        case_fields = case_number_candidates(fields)
        date_fields = date_candidates(fields)
        classification, notes, overlay_usable, change_usable = classify_layer(
            metadata,
            record_count,
            code_fields,
            geometry_available,
        )
        query_supported = "Query" in str(metadata.get("capabilities", ""))
        return {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "jurisdiction": source["jurisdiction"],
            "source_year": source["source_year"],
            "layer_id": source["layer_id"],
            "full_layer_url": layer_url,
            "service_root_url": source["service_root_url"],
            "geometry_type": metadata.get("geometryType"),
            "spatial_reference": metadata.get("extent", {}).get("spatialReference")
            or metadata.get("sourceSpatialReference")
            or metadata.get("spatialReference"),
            "record_count": record_count,
            "fields": fields,
            "field_names": field_names(fields),
            "zoning_code_field_candidates": code_fields,
            "zoning_district_field_candidates": district_fields,
            "case_number_field_candidates": case_fields,
            "date_field_candidates": date_fields,
            "query_supported": query_supported,
            "geometry_available": geometry_available,
            "usable_for_historical_overlay": overlay_usable,
            "usable_for_change_detection": change_usable,
            "temporal_confidence": "source_year_layer_candidate",
            "classification": classification,
            "notes": notes,
            "error": None,
        }
    except Exception as error:  # noqa: BLE001 - inventory must continue per layer
        return {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "jurisdiction": source["jurisdiction"],
            "source_year": source["source_year"],
            "layer_id": source["layer_id"],
            "full_layer_url": layer_url,
            "service_root_url": source["service_root_url"],
            "geometry_type": None,
            "spatial_reference": None,
            "record_count": None,
            "fields": [],
            "field_names": [],
            "zoning_code_field_candidates": [],
            "zoning_district_field_candidates": [],
            "case_number_field_candidates": [],
            "date_field_candidates": [],
            "query_supported": False,
            "geometry_available": False,
            "usable_for_historical_overlay": False,
            "usable_for_change_detection": False,
            "temporal_confidence": "failed_metadata_query",
            "classification": "unusable",
            "notes": "Layer metadata or sample query failed.",
            "error": str(error),
        }


def write_csv(rows: list[dict[str, Any]]) -> None:
    columns = [
        "source_key",
        "source_name",
        "jurisdiction",
        "source_year",
        "layer_id",
        "full_layer_url",
        "service_root_url",
        "geometry_type",
        "spatial_reference",
        "record_count",
        "field_names",
        "zoning_code_field_candidates",
        "zoning_district_field_candidates",
        "case_number_field_candidates",
        "date_field_candidates",
        "query_supported",
        "geometry_available",
        "usable_for_historical_overlay",
        "usable_for_change_detection",
        "temporal_confidence",
        "classification",
        "notes",
        "error",
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


def main() -> int:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config(args.config)
    session = make_session()
    rows = [inspect_source(session, source, args.timeout) for source in config["sources"]]
    inventory = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "service_root_url": config["service_root_url"],
        "source_count": len(rows),
        "ignored_non_zoning_layers": [
            "Historical Data group headers",
            "ParcelAnno",
            "EasementAnno",
            "Streets",
            "Addresses",
            "Cities",
            "Parcels",
            "ParcelTaxView",
            "Permits",
            "School Districts",
            "Water Supply Watershed",
            "Schools",
            "Recreation Facilities",
        ],
        "layers": rows,
        "classification_counts": {
            key: sum(1 for row in rows if row["classification"] == key)
            for key in sorted({row["classification"] for row in rows})
        },
        "years_available": sorted({row["source_year"] for row in rows if row["usable_for_historical_overlay"]}),
        "jurisdictions_by_year": {
            str(year): sorted(
                {
                    row["jurisdiction"]
                    for row in rows
                    if row["source_year"] == year and row["usable_for_historical_overlay"]
                }
            )
            for year in sorted({row["source_year"] for row in rows})
        },
    }
    INVENTORY_JSON.write_text(json.dumps(inventory, indent=2, ensure_ascii=True), encoding="utf-8")
    write_csv(rows)
    print(json.dumps(inventory["classification_counts"], indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
