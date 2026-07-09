"""WSACC utility inventory helpers.

The current WSACC drop is sewer infrastructure/subbasin geometry. It is useful
planning context, but it does not prove parcel service availability or capacity.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WSACC_DIR = REPO_ROOT / "data" / "WSACC"

WSACC_LAYER_SPECS: dict[str, dict[str, str]] = {
    "WSACC_Manholes26": {
        "table_name": "wsacc_manholes",
        "layer_type": "utility_infrastructure",
        "service_type": "sewer",
        "status": "existing",
        "likely_use": "Sewer collection node proximity and data QA context.",
        "notes": "Manholes are infrastructure proxy points; they do not confirm parcel capacity.",
    },
    "WSACC_Pipes26": {
        "table_name": "wsacc_sewer_lines",
        "layer_type": "utility_infrastructure",
        "service_type": "sewer",
        "status": "existing",
        "likely_use": "Sewer line proximity, interceptor context, and utility-served growth screening.",
        "notes": "Pipes are proxy linework; capacity/allocation fields are not present.",
    },
    "WSACC_Subbasins_Cabarrus_Only": {
        "table_name": "wsacc_basins",
        "layer_type": "sewer_basin",
        "service_type": "sewer",
        "status": "existing",
        "likely_use": "Sewer basin context for planning review and basin-level summaries.",
        "notes": "Subbasins support geography context, not capacity conclusions.",
    },
}


def wsacc_data_dir() -> Path:
    return DEFAULT_WSACC_DIR


@lru_cache(maxsize=1)
def build_wsacc_inventory(input_dir: str | None = None) -> list[dict[str, Any]]:
    import geopandas as gpd

    root = Path(input_dir) if input_dir else DEFAULT_WSACC_DIR
    rows: list[dict[str, Any]] = []
    for shp in sorted(root.glob("*.shp")):
        gdf = gpd.read_file(shp)
        spec = WSACC_LAYER_SPECS.get(shp.stem, {})
        rows.append(
            {
                "file_name": shp.name,
                "source_file": str(shp.relative_to(REPO_ROOT)) if shp.is_relative_to(REPO_ROOT) else str(shp),
                "source_layer": shp.stem,
                "target_table": spec.get("table_name", f"wsacc_{shp.stem.lower()}"),
                "wsacc_layer_type": spec.get("layer_type", "unknown"),
                "service_type": spec.get("service_type", "unknown"),
                "status": spec.get("status", "unknown"),
                "geometry_type": ", ".join(sorted(set(gdf.geom_type.dropna().astype(str)))) or "unknown",
                "crs": str(gdf.crs) if gdf.crs else "unknown",
                "feature_count": int(len(gdf)),
                "attribute_fields": [column for column in gdf.columns if column != "geometry"],
                "source_date": _source_date(gdf),
                "likely_use_in_cfs": spec.get("likely_use", "Inventory and data-readiness review."),
                "data_quality_notes": spec.get("notes", "Review metadata before using in parcel-level logic."),
                "safe_for_public_demo": True,
            }
        )
    return rows


def build_wsacc_statistics() -> dict[str, Any]:
    inventory = build_wsacc_inventory()
    by_table = {row["target_table"]: row for row in inventory}
    sewer_lines = by_table.get("wsacc_sewer_lines", {})
    manholes = by_table.get("wsacc_manholes", {})
    basins = by_table.get("wsacc_basins", {})
    return {
        "source_mode": "local_file_inventory",
        "summary": {
            "sewer_pipe_segments": sewer_lines.get("feature_count", 0),
            "sewer_manhole_points": manholes.get("feature_count", 0),
            "sewer_subbasins": basins.get("feature_count", 0),
            "water_service_layers_available": False,
            "sewer_capacity_layers_available": False,
            "planned_extension_layers_available": False,
            "parcel_utility_features_available": False,
        },
        "parcel_statistics": {
            "parcels_inside_water_service_area": "Data needed",
            "parcels_inside_sewer_service_area": "Data needed",
            "parcels_inside_both": "Data needed",
            "parcels_outside_both": "Data needed",
            "parcels_within_250ft_of_water_line": "Data needed",
            "parcels_within_500ft_of_water_line": "Data needed",
            "parcels_within_1000ft_of_water_line": "Data needed",
            "parcels_within_250ft_of_sewer_line": "Data needed",
            "parcels_within_500ft_of_sewer_line": "Data needed",
            "parcels_within_1000ft_of_sewer_line": "Data needed",
            "parcels_near_planned_extension": "Data needed",
            "parcels_in_constrained_basin": "Data needed",
            "parcels_near_cip_project": "Data needed",
        },
        "inventory": inventory,
        "caveats": wsacc_caveats(),
    }


def parcel_utility_context(parcel_id: str) -> dict[str, Any]:
    return {
        "parcel_id": parcel_id,
        "water_service_status": "Data needed",
        "sewer_service_status": "Data needed",
        "distance_to_water_line_ft": None,
        "distance_to_sewer_line_ft": None,
        "sewer_basin": None,
        "capacity_constraint_flag": "Data needed",
        "planned_extension_nearby": "Data needed",
        "nearest_cip_project": None,
        "utility_readiness_class": "Data needed",
        "utility_confidence": "low",
        "utility_notes": [
            "WSACC sewer proxy linework/subbasins are inventoried.",
            "Parcel-level overlay table has not been created yet.",
        ],
        "caveats": wsacc_caveats(),
    }


def filter_utility_parcels(filters: dict[str, Any]) -> dict[str, Any]:
    return {
        "filters": filters,
        "count": 0,
        "parcels": [],
        "status": "data_needed",
        "message": "parcel_utility_features is not available yet; run WSACC ingestion and parcel overlay before parcel filtering.",
        "caveats": wsacc_caveats(),
    }


def summary_by_geography(geography_type: str) -> dict[str, Any]:
    inventory = build_wsacc_inventory()
    basins = next((row for row in inventory if row["target_table"] == "wsacc_basins"), None)
    return {
        "geography_type": geography_type,
        "summaries": [
            {
                "geography_label": "WSACC sewer subbasins",
                "sewer_subbasin_count": basins["feature_count"] if basins else 0,
                "parcel_counts": "Data needed",
            }
        ],
        "caveats": wsacc_caveats(),
    }


def wsacc_caveats() -> list[str]:
    return [
        "WSACC shapefiles currently provide sewer proxy infrastructure/subbasin context only.",
        "They do not confirm available water/sewer capacity, allocation, service commitment, or project approval.",
        "Use as screening-level planning context; verify service readiness with WSACC or the relevant utility provider.",
    ]


def _source_date(gdf: Any) -> str | None:
    for column in ("UPDTON", "source_date", "SourceDate", "DATE", "YR"):
        if column in gdf.columns:
            values = [str(value) for value in gdf[column].dropna().head(3).tolist() if str(value).strip()]
            if values:
                return ", ".join(values)
    return None
