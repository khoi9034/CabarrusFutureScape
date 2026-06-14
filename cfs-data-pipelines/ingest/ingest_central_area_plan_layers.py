"""Ingest Concord Central Area Plan REST layers for Phase 16A.

These layers are Concord/Central Area current-context planning intent only.
They are not countywide future land-use data and are not time-safe training
features.
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
    normalize_text,
    source_objectid,
    write_json,
)


SUMMARY_OUTPUT = OUTPUT_DIR / "central_area_plan_ingest_summary.json"


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


def classify_growth_alignment(source_type: str, category: str | None, future_land_use: str | None) -> str | None:
    haystack = " ".join(value.lower() for value in (source_type, category, future_land_use) if value)
    if not haystack:
        return None
    if any(token in haystack for token in ("activity", "node", "center", "mixed", "downtown", "commercial")):
        return "growth_supportive_current_plan_context"
    if any(token in haystack for token in ("corridor", "special", "employment", "industrial")):
        return "context_sensitive_growth_area"
    if any(token in haystack for token in ("residential", "neighborhood")):
        return "residential_plan_context"
    return "plan_context_review"


def insert_features(
    engine,
    source: dict[str, Any],
    metadata: dict[str, Any],
    features: list[dict[str, Any]],
) -> dict[str, int]:
    geom = geometry_sql(metadata)
    raw_insert = text(
        f"""
        INSERT INTO public.central_area_plan_raw (
          source_key, source_name, source_objectid, layer_id, layer_role,
          source_url, source_spatial_reference, attributes, geometry
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :layer_id, :layer_role,
          :source_url, CAST(:source_spatial_reference AS jsonb), CAST(:attributes AS jsonb), {geom}
        )
        """,
    )
    clean_insert = text(
        f"""
        INSERT INTO public.central_area_plan_clean (
          source_key, source_name, source_objectid, layer_id, layer_role,
          plan_label, plan_category, future_land_use, growth_alignment_class,
          concord_only, current_context_only, time_safe_for_training, source_url,
          attributes, geometry, geometry_ft, geometry_area_acres
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :layer_id, :layer_role,
          :plan_label, :plan_category, :future_land_use, :growth_alignment_class,
          true, true, false, :source_url, CAST(:attributes AS jsonb),
          {geom},
          CASE WHEN :geometry IS NULL THEN NULL ELSE ST_Transform({geom}, 2264) END,
          CASE
            WHEN :geometry IS NULL THEN NULL
            WHEN GeometryType({geom}) IN ('POLYGON','MULTIPOLYGON') THEN ST_Area(ST_Transform({geom}, 2264)) / 43560.0
            ELSE NULL
          END
        )
        """,
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    source_type = str(source.get("source_type") or "planning_context")
    for feature in features:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        label = normalize_text(
            first_present(properties, "NAME", "Name", "LABEL", "Label", "PLAN_NAME", "AreaName")
            or first_field_like(properties, "name", "label", "area")
        )
        category = normalize_text(
            first_present(properties, "TYPE", "Type", "CATEGORY", "Category", "CLASS", "Class")
            or first_field_like(properties, "type", "category", "class")
        )
        future_land_use = None
        if source_type == "future_land_use":
            future_land_use = normalize_text(
                first_present(properties, "FLU", "FutureLandUse", "Future_Land_Use", "LANDUSE", "LandUse")
                or first_field_like(properties, "future", "landuse", "use")
                or category
                or label
            )
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_objectid": source_objectid(properties, metadata, feature),
            "layer_id": int(source["layer_id"]),
            "layer_role": source_type,
            "source_url": source["full_layer_url"],
            "source_spatial_reference": json.dumps(metadata.get("spatialReference") or {}, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True),
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "plan_label": label,
                "plan_category": category,
                "future_land_use": future_land_use,
                "growth_alignment_class": classify_growth_alignment(source_type, category, future_land_use),
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
    session = create_requests_session("CabarrusFutureScape-Phase16A-CentralAreaPlan/0.1")
    sources = load_sources("central_area_plan", args.config)
    summary: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "source_count": len(sources),
        "concord_only": True,
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
                        TRUNCATE public.central_area_plan_raw,
                                 public.central_area_plan_clean,
                                 public.parcel_central_area_plan_features,
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
                "source_name": source["source_name"],
                "layer_id": source["layer_id"],
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
