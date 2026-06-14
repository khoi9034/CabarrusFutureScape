"""Ingest current Cabarrus Accela plan reviews for Phase 16A.

Plan reviews are early pipeline/context signals only. They are not approvals,
completed development, model predictions, or production-ready forecast inputs.
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
    download_features_by_object_ids,
    execute_sql_file,
    fetch_metadata,
    first_field_like,
    first_present,
    geometry_sql,
    load_sources,
    normalize_date,
    normalize_int,
    normalize_text,
    source_objectid,
    write_json,
)


SUMMARY_OUTPUT = OUTPUT_DIR / "accela_plan_reviews_ingest_summary.json"


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


def normalize_parcel_identifier(value: Any) -> str | None:
    text_value = normalize_text(value)
    if not text_value:
        return None
    return text_value.replace(" ", "").replace("-", "").upper()


def official_parcel_id_from_raw(value: Any) -> str | None:
    normalized = normalize_parcel_identifier(value)
    if not normalized:
        return None
    if normalized.startswith("CFS-PARCEL-"):
        return normalized
    if normalized.startswith("CFS"):
        return normalized
    return f"CFS-PARCEL-{normalized}" if normalized.isdigit() and len(normalized) >= 8 else None


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
        INSERT INTO public.accela_plan_reviews_raw (
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
        INSERT INTO public.accela_plan_reviews_clean (
          source_key, source_name, source_objectid, plan_review_id,
          official_parcel_id, pin14, parcel_number_raw, project_name, address,
          review_type, review_status, file_date, days_open, source_url,
          attributes, geometry, geometry_ft
        )
        VALUES (
          :source_key, :source_name, :source_objectid, :plan_review_id,
          :official_parcel_id, :pin14, :parcel_number_raw, :project_name, :address,
          :review_type, :review_status, :file_date, :days_open, :source_url,
          CAST(:attributes AS jsonb), {geom_nullable},
          CASE WHEN :geometry IS NULL THEN NULL ELSE ST_Transform({geom}, 2264) END
        )
        """,
    )
    raw_rows: list[dict[str, Any]] = []
    clean_rows: list[dict[str, Any]] = []
    for feature in features:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry")
        parcel_number = normalize_text(
            first_present(properties, "Parcel", "PARCEL", "ParcelNumber", "Parcel_Number", "PIN", "PIN14")
            or first_field_like(properties, "parcel", "pin")
        )
        pin14 = normalize_parcel_identifier(
            first_present(properties, "PIN14", "PIN", "PARCELPIN", "PARCEL_PIN") or parcel_number
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
                "plan_review_id": normalize_text(
                    first_present(properties, "RecordID", "Record_ID", "PermitNum", "Permit", "PLAN_ID")
                    or first_field_like(properties, "record", "permit", "plan")
                ),
                "official_parcel_id": official_parcel_id_from_raw(parcel_number),
                "pin14": pin14,
                "parcel_number_raw": parcel_number,
                "project_name": normalize_text(
                    first_present(properties, "ProjectName", "Project_Name", "Name", "Description")
                    or first_field_like(properties, "project", "description", "name")
                ),
                "address": normalize_text(
                    first_present(properties, "Address", "SiteAddress", "SitusAddress", "LOCATION")
                    or first_field_like(properties, "address", "location")
                ),
                "review_type": normalize_text(
                    first_present(properties, "ReviewType", "Review_Type", "Type")
                    or first_field_like(properties, "review", "type")
                ),
                "review_status": normalize_text(
                    first_present(properties, "Status", "ReviewStatus", "Review_Status")
                    or first_field_like(properties, "status")
                ),
                "file_date": normalize_date(
                    first_present(properties, "FileDate", "File_Date", "SubmittedDate", "CreatedDate")
                    or first_field_like(properties, "date", "submitted", "created")
                ),
                "days_open": normalize_int(first_present(properties, "DaysOpen", "Days_Open") or first_field_like(properties, "days")),
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
    session = create_requests_session("CabarrusFutureScape-Phase16A-AccelaPlanReviews/0.1")
    sources = load_sources("accela_plan_reviews", args.config)
    summary: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "source_count": len(sources),
        "early_pipeline_signal_only": True,
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
                        TRUNCATE public.accela_plan_reviews_raw,
                                 public.accela_plan_reviews_clean,
                                 public.parcel_accela_plan_review_features,
                                 public.parcel_planning_pipeline_utility_features
                        RESTART IDENTITY
                        """,
                    ),
                )

    for source in sources:
        metadata = fetch_metadata(session, source["full_layer_url"], args.timeout)
        total_count, features = download_features_by_object_ids(
            session,
            source["full_layer_url"],
            "1=1",
            args.timeout,
            args.page_size or 500,
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
    write_json(SUMMARY_OUTPUT, summary)
    print(f"Wrote {SUMMARY_OUTPUT}")


if __name__ == "__main__":
    main()
