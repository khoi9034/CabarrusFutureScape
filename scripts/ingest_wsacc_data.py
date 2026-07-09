"""Inventory or ingest WSACC utility shapefiles.

Dry run is the default. Use --apply to write normalized PostGIS tables.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.database import get_engine  # noqa: E402
from app.services.wsacc_service import WSACC_LAYER_SPECS, build_wsacc_inventory  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Inventory or ingest WSACC shapefiles.")
    parser.add_argument("--input", default=str(REPO_ROOT / "data" / "WSACC"))
    parser.add_argument("--apply", action="store_true", help="Write normalized layers to PostGIS.")
    parser.add_argument("--dry-run", action="store_true", help="Inventory only; default behavior.")
    args = parser.parse_args()

    root = Path(args.input)
    inventory = build_wsacc_inventory(str(root))
    if not args.apply:
        print(json.dumps({"mode": "dry_run", "layers": inventory}, indent=2))
        return 0

    engine = get_engine()
    for row in inventory:
        source = root / row["file_name"]
        table_name = row["target_table"]
        gdf = _normalized_layer(source, row)
        gdf.to_postgis(table_name, engine, schema="public", if_exists="replace", index=False)
        with engine.begin() as connection:
            connection.execute(
                text(f'CREATE INDEX IF NOT EXISTS idx_{table_name}_geometry ON public.{table_name} USING GIST ("geometry")')
            )

    _write_inventory_table(engine, inventory)
    print(json.dumps({"mode": "apply", "layers_written": len(inventory)}, indent=2))
    return 0


def _normalized_layer(source: Path, row: dict[str, Any]) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(source)
    spec = WSACC_LAYER_SPECS.get(source.stem, {})
    original_columns = [column for column in gdf.columns if column != "geometry"]
    out = gpd.GeoDataFrame(geometry=gdf.geometry, crs=gdf.crs)
    out["wsacc_layer_type"] = spec.get("layer_type", "unknown")
    out["source_file"] = str(source.relative_to(REPO_ROOT)) if source.is_relative_to(REPO_ROOT) else str(source)
    out["source_layer"] = source.stem
    out["source_date"] = row.get("source_date")
    out["service_type"] = spec.get("service_type", "unknown")
    out["status"] = spec.get("status", "unknown")
    out["project_name"] = _first_present(gdf, ["project_name", "PROJECT", "SI_NAME", "Basin", "SubBasin"])
    out["project_status"] = None
    out["fiscal_year"] = _first_present(gdf, ["fiscal_year", "FY", "YR"])
    out["completion_year"] = None
    out["capacity_status"] = None
    # ponytail: keep source fields as JSON text; promote to JSONB later if analysts need SQL querying.
    out["source_properties"] = [
        json.dumps({column: _json_value(record.get(column)) for column in original_columns}, default=str)
        for record in gdf[original_columns].to_dict("records")
    ]
    return out


def _write_inventory_table(engine: Any, inventory: list[dict[str, Any]]) -> None:
    rows = [
        {
            key: json.dumps(value) if isinstance(value, list) else value
            for key, value in item.items()
            if key != "attribute_fields"
        }
        | {"attribute_fields": json.dumps(item["attribute_fields"])}
        for item in inventory
    ]
    pd.DataFrame(rows).to_sql("wsacc_data_inventory", engine, schema="public", if_exists="replace", index=False)


def _first_present(gdf: gpd.GeoDataFrame, fields: list[str]) -> Any:
    for field in fields:
        if field in gdf.columns:
            return gdf[field]
    return None


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    return value


if __name__ == "__main__":
    raise SystemExit(main())
