"""Ingest Tax Parcels Full as a separate enrichment/gap-check source.

This script does not overwrite public.parcels_enriched. Values loaded here are
current-context only and are intended for gap review or future feature planning.
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
    normalize_float,
    normalize_text,
    source_objectid,
    write_json,
)


SUMMARY_OUTPUT = OUTPUT_DIR / "tax_parcel_full_enrichment_gap_check.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--truncate-and-load", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--page-size", type=int, default=None)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser.parse_args()


def normalize_pin(value: Any) -> str | None:
    text_value = normalize_text(value)
    if not text_value:
        return None
    return text_value.replace(" ", "").replace("-", "").upper()


def official_parcel_id_from_raw(value: Any) -> str | None:
    normalized = normalize_pin(value)
    if not normalized:
        return None
    if normalized.startswith("CFS-PARCEL-"):
        return normalized
    if normalized.isdigit() and len(normalized) >= 8:
        return f"CFS-PARCEL-{normalized}"
    return None


def value_field(properties: dict[str, Any], *tokens: str) -> float | None:
    return normalize_float(first_field_like(properties, *tokens))


def insert_features(
    engine,
    source: dict[str, Any],
    metadata: dict[str, Any],
    features: list[dict[str, Any]],
) -> dict[str, int]:
    geom = geometry_sql(metadata)
    geom_nullable = f"CASE WHEN CAST(:geometry AS text) IS NULL THEN NULL ELSE {geom} END"
    raw_insert = text(
        f"""
        INSERT INTO public.tax_parcel_full_raw (
          source_key, source_name, source_objectid, layer_id, source_url,
          source_spatial_reference, attributes, geometry
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :layer_id, :source_url,
          CAST(:source_spatial_reference AS jsonb), CAST(:attributes AS jsonb), {geom_nullable}
        )
        """,
    )
    clean_insert = text(
        f"""
        INSERT INTO public.tax_parcel_value_enrichment (
          source_key, source_name, source_objectid, official_parcel_id, pin14,
          parcel_number_raw, owner_name, situs_address, land_value,
          improvement_value, total_value, assessed_value, tax_value, acreage,
          current_context_only, time_safe_for_training, base_table_overwrite_allowed,
          source_url, attributes, geometry, geometry_ft
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :official_parcel_id, :pin14,
          :parcel_number_raw, :owner_name, :situs_address, :land_value,
          :improvement_value, :total_value, :assessed_value, :tax_value, :acreage,
          true, false, false, :source_url, CAST(:attributes AS jsonb),
          {geom_nullable}, CASE WHEN :geometry IS NULL THEN NULL ELSE ST_Transform({geom}, 2264) END
        )
        """,
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    for feature in features:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry")
        parcel_number = normalize_text(
            first_present(
                properties,
                "PARCEL",
                "Parcel",
                "PIN",
                "PIN14",
                "PIN_NUM",
                "PARCELNUM",
                "ACCOUNT",
                "ACCOUNTNO",
            )
            or first_field_like(properties, "parcel", "pin", "account")
        )
        pin14 = normalize_pin(first_present(properties, "PIN14", "PIN", "PIN_NUM") or parcel_number)
        land_value = (
            normalize_float(first_present(properties, "LANDVALUE", "LAND_VALUE", "LAND_VAL"))
            or value_field(properties, "land")
        )
        improvement_value = (
            normalize_float(first_present(properties, "IMPVALUE", "IMPROVEMENT_VALUE", "BLDG_VALUE"))
            or value_field(properties, "impr", "building")
        )
        total_value = (
            normalize_float(first_present(properties, "TOTALVALUE", "TOTAL_VALUE", "TOT_VALUE"))
            or value_field(properties, "total")
        )
        assessed_value = (
            normalize_float(first_present(properties, "ASSESSEDVALUE", "ASSESSED_VALUE"))
            or value_field(properties, "assess")
        )
        common = {
            "source_key": source["source_key"],
            "source_name": source["source_name"],
            "source_objectid": source_objectid(properties, metadata, feature),
            "layer_id": int(source["layer_id"]),
            "source_url": source["full_layer_url"],
            "source_spatial_reference": json.dumps(metadata.get("spatialReference") or {}, ensure_ascii=True),
            "attributes": json.dumps(properties, ensure_ascii=True),
            "geometry": json.dumps(geometry, ensure_ascii=True) if geometry else None,
        }
        raw_rows.append(common)
        clean_rows.append(
            {
                **common,
                "official_parcel_id": official_parcel_id_from_raw(parcel_number),
                "pin14": pin14,
                "parcel_number_raw": parcel_number,
                "owner_name": normalize_text(
                    first_present(properties, "OWNER", "Owner", "OWNER_NAME", "OwnerName")
                    or first_field_like(properties, "owner")
                ),
                "situs_address": normalize_text(
                    first_present(properties, "SITUS", "SITUSADDR", "ADDRESS", "SiteAddress")
                    or first_field_like(properties, "address", "situs")
                ),
                "land_value": land_value,
                "improvement_value": improvement_value,
                "total_value": total_value,
                "assessed_value": assessed_value,
                "tax_value": normalize_float(first_present(properties, "TAXVALUE", "TAX_VALUE")) or total_value or assessed_value,
                "acreage": normalize_float(first_present(properties, "ACRES", "ACREAGE", "AREA_ACRES")) or value_field(properties, "acre"),
            },
        )
    with engine.begin() as connection:
        if raw_rows:
            connection.execute(raw_insert, raw_rows)
        if clean_rows:
            connection.execute(clean_insert, clean_rows)
    return {"raw_rows": len(raw_rows), "clean_rows": len(clean_rows)}


def summarize_gap_check(engine, source_summary: dict[str, Any]) -> dict[str, Any]:
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcels_enriched) AS parcels_enriched_count,
                  COUNT(*) AS tax_full_rows,
                  COUNT(*) FILTER (WHERE official_parcel_id IS NOT NULL OR pin14 IS NOT NULL)
                    AS rows_with_candidate_parcel_key,
                  COUNT(*) FILTER (WHERE land_value IS NOT NULL) AS rows_with_land_value,
                  COUNT(*) FILTER (WHERE improvement_value IS NOT NULL) AS rows_with_improvement_value,
                  COUNT(*) FILTER (WHERE total_value IS NOT NULL) AS rows_with_total_value,
                  COUNT(*) FILTER (WHERE assessed_value IS NOT NULL) AS rows_with_assessed_value,
                  COUNT(*) FILTER (WHERE base_table_overwrite_allowed IS TRUE)
                    AS overwrite_allowed_rows
                FROM public.tax_parcel_value_enrichment
                """,
            ),
        ).mappings().one()
    return {**source_summary, **dict(row)}


def main() -> None:
    args = parse_args()
    configure_logging(args.log_level)
    session = create_requests_session("CabarrusFutureScape-Phase16A-TaxParcelFull/0.1")
    sources = load_sources("tax_parcel_full", args.config)
    summary: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "source_count": len(sources),
        "base_parcels_overwrite_allowed": False,
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
                        TRUNCATE public.tax_parcel_full_raw,
                                 public.tax_parcel_value_enrichment,
                                 public.parcel_tax_value_enrichment_features,
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
                "total_count": total_count,
                "downloaded_count": len(features),
                **inserted,
            },
        )
    summary["raw_rows_loaded"] = sum(row["raw_rows"] for row in summary["sources"])
    summary["clean_rows_loaded"] = sum(row["clean_rows"] for row in summary["sources"])
    if engine is not None:
        summary = summarize_gap_check(engine, summary)
    write_json(SUMMARY_OUTPUT, summary)
    print(f"Wrote {SUMMARY_OUTPUT}")


if __name__ == "__main__":
    main()
