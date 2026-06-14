"""Ingest RevalMap WSACC utility proxy layers for Phase 16A.

These layers are proximity/service-context references only. They do not expose
true sewer capacity, allocation, remaining capacity, or development approval.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from planning_pipeline_utility_common import (
    CONFIG_PATH,
    OUTPUT_DIR,
    configure_logging,
    create_engine_from_env,
    create_requests_session,
    download_features,
    execute_sql_file,
    fetch_metadata,
    first_field_like,
    first_present,
    geometry_sql,
    load_sources,
    normalize_int,
    normalize_text,
    source_objectid,
    write_json,
)


SUMMARY_OUTPUT = OUTPUT_DIR / "utility_proxy_ingest_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser.parse_args()


def layer_role(source_type: str) -> str:
    if "manhole" in source_type:
        return "manhole"
    if "line" in source_type:
        return "sewer_line"
    if "district" in source_type:
        return "district"
    return "utility_proxy"


def insert_features(
    engine,
    source: dict[str, Any],
    metadata: dict[str, Any],
    features: list[dict[str, Any]],
) -> dict[str, int]:
    geom = geometry_sql(metadata)
    role = layer_role(str(source.get("source_type") or "utility_proxy"))
    raw_insert = text(
        f"""
        INSERT INTO public.utility_proxy_wsacc_raw (
          source_key, source_name, source_objectid, layer_id, utility_layer_role,
          source_url, source_spatial_reference, attributes, geometry
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :layer_id, :utility_layer_role,
          :source_url, CAST(:source_spatial_reference AS jsonb), CAST(:attributes AS jsonb), {geom}
        )
        """,
    )
    clean_insert = text(
        f"""
        INSERT INTO public.utility_proxy_wsacc_clean (
          source_key, source_name, source_objectid, layer_id, utility_layer_role,
          utility_label, district_name, pipe_size, pipe_material, install_year,
          utility_proxy_type, true_capacity_available, capacity_status,
          current_context_only, time_safe_for_training, source_url, attributes,
          geometry, geometry_ft, geometry_length_ft, geometry_area_acres
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :layer_id, :utility_layer_role,
          :utility_label, :district_name, :pipe_size, :pipe_material, :install_year,
          :utility_proxy_type, false, 'not_capacity_data',
          true, false, :source_url, CAST(:attributes AS jsonb),
          {geom}, ST_Transform({geom}, 2264),
          CASE
            WHEN GeometryType({geom}) IN ('LINESTRING','MULTILINESTRING') THEN ST_Length(ST_Transform({geom}, 2264))
            ELSE NULL
          END,
          CASE
            WHEN GeometryType({geom}) IN ('POLYGON','MULTIPOLYGON') THEN ST_Area(ST_Transform({geom}, 2264)) / 43560.0
            ELSE NULL
          END
        )
        """,
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    for feature in features:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_objectid": source_objectid(properties, metadata, feature),
            "layer_id": int(source["layer_id"]),
            "utility_layer_role": role,
            "source_url": source["full_layer_url"],
            "source_spatial_reference": json.dumps(metadata.get("spatialReference") or {}, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "utility_label": normalize_text(
                    first_present(properties, "NAME", "Name", "LABEL", "ID", "AssetID")
                    or first_field_like(properties, "name", "label", "id")
                ),
                "district_name": normalize_text(
                    first_present(properties, "DISTRICT", "District", "ServiceArea", "SERVICE_AREA")
                    or first_field_like(properties, "district", "service")
                ),
                "pipe_size": normalize_text(
                    first_present(properties, "SIZE", "PipeSize", "DIAMETER", "Diameter")
                    or first_field_like(properties, "size", "diameter")
                ),
                "pipe_material": normalize_text(
                    first_present(properties, "MATERIAL", "Material", "PipeMaterial")
                    or first_field_like(properties, "material")
                ),
                "install_year": normalize_int(
                    first_present(properties, "YEAR", "InstallYear", "INSTALL_YEAR", "YR_INST")
                    or first_field_like(properties, "year", "install")
                ),
                "utility_proxy_type": role,
            },
        )
    with engine.begin() as connection:
        if raw_rows:
            connection.execute(raw_insert, raw_rows)
        if clean_rows:
            connection.execute(clean_insert, clean_rows)
    return {"raw_rows": len(raw_rows), "clean_rows": len(clean_rows)}


def main() -> None:
    args = parse_args()
    configure_logging(args.log_level)
    session = create_requests_session("CabarrusFutureScape-Phase16A-UtilityProxy/0.1")
    sources = load_sources("utility_proxy", args.config)
    summary: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "source_count": len(sources),
        "utility_proxy_only": True,
        "true_capacity_available": False,
        "current_context_only": True,
        "time_safe_for_training": False,
        "sources": [],
    }
    engine = None if args.dry_run else create_engine_from_env()
    if engine is not None:
        execute_sql_file(engine)
        if args.truncate_and_load:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        TRUNCATE public.utility_proxy_wsacc_raw,
                                 public.utility_proxy_wsacc_clean,
                                 public.parcel_utility_proxy_features,
                                 public.parcel_planning_pipeline_utility_features
                        RESTART IDENTITY
                        """,
                    ),
                )

    for source in sources:
        metadata = fetch_metadata(session, source["full_layer_url"], args.timeout)
        total_count, features = download_features(
            session,
            source["full_layer_url"],
            metadata,
            "1=1",
            args.timeout,
            args.page_size,
            args.limit,
        )
        inserted = {"raw_rows": 0, "clean_rows": 0}
        if engine is not None:
            inserted = insert_features(engine, source, metadata, features)
        summary["sources"].append(
            {
                "source_key": source["source_key"],
                "utility_layer_role": layer_role(str(source.get("source_type") or "")),
                "total_count": total_count,
                "downloaded_count": len(features),
                **inserted,
            },
        )
    summary["raw_rows_loaded"] = sum(row["raw_rows"] for row in summary["sources"])
    summary["clean_rows_loaded"] = sum(row["clean_rows"] for row in summary["sources"])
    write_json(SUMMARY_OUTPUT, summary)
    print(f"Wrote {SUMMARY_OUTPUT}")


if __name__ == "__main__":
    main()
