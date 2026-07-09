"""WSACC utility inventory helpers.

The current WSACC drop is sewer infrastructure/subbasin geometry. It is useful
planning context, but it does not prove parcel service availability or capacity.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

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


def build_wsacc_statistics(db: Session | None = None) -> dict[str, Any]:
    inventory = build_wsacc_inventory()
    by_table = {row["target_table"]: row for row in inventory}
    sewer_lines = by_table.get("wsacc_sewer_lines", {})
    manholes = by_table.get("wsacc_manholes", {})
    basins = by_table.get("wsacc_basins", {})
    overlay = _overlay_statistics(db) if db is not None else None
    return {
        "source_mode": "local_file_inventory",
        "summary": {
            "sewer_pipe_segments": sewer_lines.get("feature_count", 0),
            "sewer_manhole_points": manholes.get("feature_count", 0),
            "sewer_subbasins": basins.get("feature_count", 0),
            "water_service_layers_available": False,
            "sewer_capacity_layers_available": False,
            "planned_extension_layers_available": False,
            "parcel_utility_features_available": bool(overlay),
            **(_dict(overlay.get("summary")) if overlay else {}),
        },
        "parcel_statistics": overlay.get("parcel_statistics") if overlay else {
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


def parcel_utility_context(parcel_id: str, db: Session | None = None) -> dict[str, Any]:
    if db is not None and _table_exists(db, "parcel_wsacc_utility_features"):
        row = db.execute(
            text(
                """
                SELECT * FROM public.parcel_wsacc_utility_features
                WHERE parcel_id = :parcel_id
                LIMIT 1
                """
            ),
            {"parcel_id": parcel_id},
        ).mappings().first()
        if row:
            data = dict(row)
            return {
                "parcel_id": data.get("parcel_id"),
                "water_service_status": "Data needed",
                "sewer_service_status": data.get("sewer_proxy_class"),
                "distance_to_water_line_ft": None,
                "distance_to_sewer_line_ft": _float(data.get("distance_to_nearest_sewer_pipe_ft")),
                "distance_to_manhole_ft": _float(data.get("distance_to_nearest_manhole_ft")),
                "nearest_sewer_pipe_id": data.get("nearest_sewer_pipe_id"),
                "nearest_manhole_id": data.get("nearest_manhole_id"),
                "sewer_basin": data.get("wsacc_subbasin_name"),
                "inside_wsacc_subbasin_flag": bool(data.get("inside_wsacc_subbasin_flag")),
                "capacity_constraint_flag": "Capacity data not provided",
                "planned_extension_nearby": "Planned extension data not provided",
                "nearest_cip_project": None,
                "utility_readiness_class": data.get("utility_readiness_proxy_class"),
                "utility_readiness_proxy_class": data.get("utility_readiness_proxy_class"),
                "sewer_proxy_class": data.get("sewer_proxy_class"),
                "sewer_proxy_confidence": data.get("sewer_proxy_confidence"),
                "utility_capacity_status": data.get("utility_capacity_status"),
                "planned_extension_status": data.get("planned_extension_status"),
                "utility_confidence": data.get("sewer_proxy_confidence"),
                "utility_notes": list(data.get("wsacc_notes") or []),
                "caveats": wsacc_caveats(),
            }
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


def filter_utility_parcels(filters: dict[str, Any], db: Session | None = None) -> dict[str, Any]:
    if db is not None and _table_exists(db, "parcel_wsacc_utility_features"):
        clauses: list[str] = []
        params: dict[str, Any] = {}
        if filters.get("sewer_proxy_class"):
            clauses.append("sewer_proxy_class = :sewer_proxy_class")
            params["sewer_proxy_class"] = filters["sewer_proxy_class"]
        if filters.get("utility_readiness_proxy_class"):
            clauses.append("utility_readiness_proxy_class = :utility_readiness_proxy_class")
            params["utility_readiness_proxy_class"] = filters["utility_readiness_proxy_class"]
        if filters.get("subbasin"):
            clauses.append("wsacc_subbasin_name = :subbasin")
            params["subbasin"] = filters["subbasin"]
        if filters.get("within_pipe_distance") is not None:
            clauses.append("distance_to_nearest_sewer_pipe_ft <= :within_pipe_distance")
            params["within_pipe_distance"] = filters["within_pipe_distance"]
        if filters.get("within_manhole_distance") is not None:
            clauses.append("distance_to_nearest_manhole_ft <= :within_manhole_distance")
            params["within_manhole_distance"] = filters["within_manhole_distance"]
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.execute(
            text(
                f"""
                SELECT parcel_id, sewer_proxy_class, utility_readiness_proxy_class,
                       distance_to_nearest_sewer_pipe_ft, distance_to_nearest_manhole_ft,
                       wsacc_subbasin_name, sewer_proxy_confidence
                FROM public.parcel_wsacc_utility_features
                {where_sql}
                ORDER BY distance_to_nearest_sewer_pipe_ft NULLS LAST
                LIMIT 250
                """
            ),
            params,
        ).mappings().all()
        return {
            "filters": filters,
            "count": len(rows),
            "parcels": [dict(row) for row in rows],
            "status": "ok",
            "caveats": wsacc_caveats(),
        }
    return {
        "filters": filters,
        "count": 0,
        "parcels": [],
        "status": "data_needed",
        "message": "parcel_utility_features is not available yet; run WSACC ingestion and parcel overlay before parcel filtering.",
        "caveats": wsacc_caveats(),
    }


def summary_by_geography(geography_type: str, db: Session | None = None) -> dict[str, Any]:
    if db is not None and _table_exists(db, "parcel_wsacc_utility_features"):
        group_field = "wsacc_subbasin_name" if geography_type in {"sewer_basin", "subbasin"} else "wsacc_subbasin_name"
        rows = db.execute(
            text(
                f"""
                SELECT COALESCE({group_field}, 'Outside WSACC subbasin') AS geography_label,
                       COUNT(*) AS parcel_count,
                       COUNT(*) FILTER (WHERE sewer_proxy_class = 'Adjacent to sewer infrastructure') AS adjacent_count,
                       COUNT(*) FILTER (WHERE sewer_proxy_class IN ('Adjacent to sewer infrastructure', 'Near sewer infrastructure')) AS near_count,
                       COUNT(*) FILTER (WHERE utility_readiness_proxy_class = 'Limited utility-readiness evidence') AS limited_evidence_count
                FROM public.parcel_wsacc_utility_features
                GROUP BY 1
                ORDER BY parcel_count DESC
                LIMIT 50
                """
            )
        ).mappings().all()
        return {"geography_type": geography_type, "summaries": [dict(row) for row in rows], "caveats": wsacc_caveats()}
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


def _overlay_statistics(db: Session | None) -> dict[str, Any] | None:
    if db is None or not _table_exists(db, "parcel_wsacc_utility_features"):
        return None
    row = db.execute(
        text(
            """
            SELECT
              COUNT(*) AS total_parcels_evaluated,
              COUNT(*) FILTER (WHERE sewer_proxy_class = 'Adjacent to sewer infrastructure') AS parcels_adjacent_to_sewer_infrastructure,
              COUNT(*) FILTER (WHERE sewer_proxy_class IN ('Adjacent to sewer infrastructure', 'Near sewer infrastructure')) AS parcels_near_sewer_infrastructure,
              COUNT(*) FILTER (WHERE sewer_pipe_within_1000ft_flag OR manhole_within_1000ft_flag) AS parcels_within_1000ft_sewer_proxy,
              COUNT(*) FILTER (WHERE inside_wsacc_subbasin_flag) AS parcels_inside_wsacc_subbasins,
              COUNT(*) FILTER (WHERE utility_readiness_proxy_class IN ('Limited utility-readiness evidence', 'Data needed')) AS parcels_with_limited_utility_evidence,
              COUNT(DISTINCT wsacc_subbasin_name) FILTER (WHERE wsacc_subbasin_name IS NOT NULL) AS subbasin_count
            FROM public.parcel_wsacc_utility_features
            """
        )
    ).mappings().one()
    class_counts = db.execute(
        text(
            """
            SELECT sewer_proxy_class AS label, COUNT(*) AS value
            FROM public.parcel_wsacc_utility_features
            GROUP BY 1 ORDER BY 2 DESC
            """
        )
    ).mappings().all()
    readiness_counts = db.execute(
        text(
            """
            SELECT utility_readiness_proxy_class AS label, COUNT(*) AS value
            FROM public.parcel_wsacc_utility_features
            GROUP BY 1 ORDER BY 2 DESC
            """
        )
    ).mappings().all()
    data = dict(row)
    return {
        "summary": {key: int(value or 0) for key, value in data.items()},
        "parcel_statistics": {
            **{key: int(value or 0) for key, value in data.items()},
            "parcels_inside_water_service_area": "Data needed",
            "parcels_inside_sewer_service_area": "Proxy only",
            "parcels_inside_both": "Data needed",
            "parcels_outside_both": "Data needed",
            "parcels_within_250ft_of_water_line": "Data needed",
            "parcels_within_500ft_of_water_line": "Data needed",
            "parcels_within_1000ft_of_water_line": "Data needed",
            "parcels_within_250ft_of_sewer_line": data["parcels_adjacent_to_sewer_infrastructure"],
            "parcels_within_500ft_of_sewer_line": data["parcels_near_sewer_infrastructure"],
            "parcels_within_1000ft_of_sewer_line": data["parcels_within_1000ft_sewer_proxy"],
            "parcels_near_planned_extension": "Data needed",
            "parcels_in_constrained_basin": "Capacity data not provided",
            "parcels_near_cip_project": "Data needed",
            "sewer_proxy_class_breakdown": [dict(row) for row in class_counts],
            "utility_readiness_proxy_class_breakdown": [dict(row) for row in readiness_counts],
        },
    }


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(db.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table_name}"}).scalar_one())


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _source_date(gdf: Any) -> str | None:
    for column in ("UPDTON", "source_date", "SourceDate", "DATE", "YR"):
        if column in gdf.columns:
            values = [str(value) for value in gdf[column].dropna().head(3).tolist() if str(value).strip()]
            if values:
                return ", ".join(values)
    return None
