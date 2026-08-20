"""Build the local cloud-safe staging database for CFS.

This script reads from the configured local CFS source database and writes a
sanitized local PostgreSQL database named cfs_cloud_stage. It never connects to
Azure and never writes dump files inside the repository.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

WORKDIR = Path(os.getenv("CFS_AZURE_ARTIFACT_ROOT", ROOT / "local-data" / "azure-migration"))
STAGE_DB = "cfs_cloud_stage"
SOURCE_DB = "cfs_dev"
PG_BIN = Path(r"C:\Program Files\PostgreSQL\18\bin")

os.environ["DATABASE_URL"] = ""
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_PORT", "5433")
os.environ["POSTGRES_DB"] = SOURCE_DB

from app.database import build_database_url  # noqa: E402
from app.config import get_settings  # noqa: E402

SENSITIVE_PATTERNS = (
    "owner",
    "acctname",
    "mail",
    "grantor",
    "grantee",
    "account",
    "phone",
    "email",
    "student_address",
    "contact",
    "api_key",
    "secret",
    "password",
    "token",
    "raw_score",
    "probability",
    "exact_probability",
)

FALSE_POSITIVE_SAFE_COLUMNS = {
    "per_capita_income": "Safe Derived Field",
    "owner_occupied_units": "Safe Derived Field",
    "school_capacity_score": "Safe Derived Field",
    "school_constraint_score": "Safe Derived Field",
    "flood_constraint_score": "Safe Derived Field",
    "development_activity_score": "Safe Derived Field",
    "development_activity_score_current_context": "Safe Derived Field",
    "permit_signal_score": "Safe Derived Field",
    "permit_signal_score_max": "Safe Derived Field",
    "permit_signal_score_avg": "Safe Derived Field",
}

FORCE_INCLUDE = {
    "public.development_activity_parcel_summary",
    "public.development_activity_time_summary",
    "public.development_activity_zoning_summary",
    "public.development_prediction_model_experiment_scores",
    "public.development_prediction_ranking_classes",
    "public.development_prediction_ranking_explanations",
    "public.fema_nfhl_flood_zones_clean",
    "public.investment_acs_market_context",
    "public.investment_acs_tract_geometry",
    "public.investment_assumption_template",
    "public.investment_candidate_intake",
    "public.investment_engagement",
    "public.investment_environmental_facilities",
    "public.investment_nwi_wetlands",
    "public.investment_parcel_acs_geography",
    "public.investment_parcel_environmental_context",
    "public.investment_recent_work",
    "public.investment_saved_item",
    "public.investment_saved_search",
    "public.investment_soil_units",
    "public.investment_terrain_context",
    "public.investment_underwriting_scenario",
    "public.new_construction_permit_parcel_relationship",
    "public.new_construction_permits_clean",
    "public.parcel_development_model_features",
    "public.parcel_development_prediction_features",
    "public.parcel_development_prediction_features_planning_pipeline_utilit",
    "public.parcel_development_prediction_features_transportation_enhanced",
    "public.parcel_development_prediction_features_zoning_enhanced",
    "public.parcel_development_prediction_labels",
    "public.parcel_development_screening_output",
    "public.parcel_flood_constraint_overlay",
    "public.parcel_jurisdiction_overlay",
    "public.parcel_new_construction_summary",
    "public.parcel_permit_segment_summary",
    "public.parcel_planning_pipeline_utility_features",
    "public.parcel_school_assignment",
    "public.parcel_school_summary",
    "public.parcel_tax_value_enrichment_features",
    "public.parcel_transportation_accessibility_features",
    "public.parcel_transportation_plan_traffic_features",
    "public.parcel_utility_proxy_features",
    "public.parcel_wsacc_utility_features",
    "public.parcel_zoning_change_events",
    "public.parcel_zoning_intelligence_qa",
    "public.parcel_zoning_overlay",
    "public.parcel_zoning_overlay_v2",
    "public.parcel_zoning_snapshot_year",
    "public.parcels_enriched",
    "public.permit_intelligence_segments",
    "public.real_property_permit",
    "public.real_property_permit_clean",
    "public.real_property_permit_parcel_relationship",
    "public.school_capacity",
    "public.school_capacity_history",
    "public.school_capacity_ingestion_qa",
    "public.school_capacity_projection",
    "public.school_enrollment_history",
    "public.school_grade_enrollment_history",
    "public.school_lea_pupil_context",
    "public.school_planned_capacity_changes",
    "public.school_presentation_utilization_seed",
    "public.school_reference",
    "public.school_zones",
    "public.tax_parcel_value_enrichment",
    "public.transportation_aadt_stations_clean",
    "public.transportation_centerlines_clean",
    "public.transportation_rail_clean",
    "public.transportation_stip_projects_clean",
    "public.zoning",
    "public.zoning_clean",
    "public.zoning_jurisdictional_clean",
    "public.zoning_source_inventory",
}

EXCLUDE_PREFIXES = (
    "tiger.",
    "topology.",
)

EXCLUDE_TABLE_PATTERNS = (
    "_raw",
    "tax_parcel_full_raw",
    "utility_proxy_wsacc_raw",
    "wsacc_basins",
    "wsacc_manholes",
    "wsacc_sewer_lines",
    "wsacc_data_inventory",
    "mobilitydb_opcache",
    "pointcloud_formats",
    "spatial_ref_sys",
    "us_gaz",
    "us_lex",
    "us_rules",
)

WRITABLE_TABLES: set[str] = set()


def main() -> int:
    os.environ["DATABASE_URL"] = ""
    os.environ.setdefault("POSTGRES_HOST", "localhost")
    os.environ.setdefault("POSTGRES_PORT", "5433")
    os.environ.setdefault("POSTGRES_DB", SOURCE_DB)
    WORKDIR.mkdir(parents=True, exist_ok=True)
    log_path = WORKDIR / "cfs_cloud_stage_build.log"
    log_event(log_path, event="start", stage_database=STAGE_DB, source_database=SOURCE_DB)
    settings = get_settings()
    source_url = build_database_url(settings)
    source_engine = create_engine(
        source_url,
        connect_args={"connect_timeout": 5},
    )
    maintenance_url = source_url.set(database="postgres")
    admin_engine = create_engine(
        maintenance_url,
        isolation_level="AUTOCOMMIT",
        connect_args={"connect_timeout": 5},
    )

    try:
        with admin_engine.connect() as admin:
            if admin.execute(text("select exists(select 1 from pg_database where datname=:db)"), {"db": STAGE_DB}).scalar():
                existing_stage = create_engine(source_url.set(database=STAGE_DB), connect_args={"connect_timeout": 5})
                try:
                    if not stage_is_extension_stub(existing_stage):
                        print(json.dumps({"status": "blocked", "reason": f"{STAGE_DB} already contains application tables"}))
                        log_event(log_path, event="blocked", reason="stage_contains_application_tables")
                        return 2
                finally:
                    existing_stage.dispose()
                terminate_database_connections(admin, STAGE_DB)
                admin.execute(text(f'DROP DATABASE "{STAGE_DB}"'))
                log_event(log_path, event="dropped_extension_stub", stage_database=STAGE_DB)
            admin.execute(text(f'CREATE DATABASE "{STAGE_DB}" TEMPLATE template0'))
            log_event(log_path, event="created_database", stage_database=STAGE_DB)

        stage_engine = create_engine(
            source_url.set(database=STAGE_DB),
            connect_args={"connect_timeout": 5},
        )
        started = time.perf_counter()
        with stage_engine.begin() as stage:
            stage.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            stage.execute(text("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch"))
            stage.execute(text("CREATE EXTENSION IF NOT EXISTS address_standardizer"))
            stage.execute(text("CREATE EXTENSION IF NOT EXISTS address_standardizer_data_us"))

        with source_engine.connect() as source:
            set_source_read_only(source)
            inventory = collect_inventory(source)
            code_refs = collect_code_references(inventory)
            manifest = build_manifest(source, inventory, code_refs)
            write_json(ROOT / "config" / "cfs_cloud_table_manifest.json", manifest)
            write_inventory_doc(source, inventory, manifest)

        included = [item for item in manifest["objects"] if item["migration_action"] in {"Include Entire Object", "Include Sanitized Columns"}]
        with source_engine.connect() as source, stage_engine.begin() as stage:
            set_source_read_only(source)
            stage.execute(text("SET statement_timeout = 0"))
            for index, item in enumerate(included, start=1):
                log_event(log_path, event="copy_start", table=f"{item['schema']}.{item['object_name']}", index=index, total=len(included))
                copy_table(source, stage, item)
                log_event(log_path, event="copy_done", table=f"{item['schema']}.{item['object_name']}", index=index, total=len(included))
            create_views(source, stage, manifest)
            create_indexes(stage, included)

        with stage_engine.connect() as stage:
            safety = build_safety_report(stage, manifest, time.perf_counter() - started)
            write_json(WORKDIR / "cfs_cloud_stage_build_summary.json", safety)
            write_safety_doc(safety)
        log_event(log_path, event="complete", **safety["summary"])
        print(json.dumps({"status": "ok", **safety["summary"]}, indent=2))
        return 0
    except Exception as exc:
        log_event(log_path, event="failed", error_type=exc.__class__.__name__, error=str(exc)[:500])
        raise


def set_source_read_only(conn) -> None:
    conn.execute(text("SET TRANSACTION READ ONLY"))


def stage_is_extension_stub(engine) -> bool:
    with engine.connect() as conn:
        count = conn.execute(text(
            """
            SELECT COUNT(*)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema')
              AND c.relkind IN ('r','p','v','m')
              AND NOT EXISTS (
                SELECT 1
                FROM pg_depend d
                JOIN pg_extension e ON e.oid = d.refobjid
                WHERE d.objid = c.oid
                  AND d.deptype = 'e'
              )
            """,
        )).scalar_one()
    return int(count or 0) == 0


def terminate_database_connections(conn, database_name: str) -> None:
    conn.execute(text(
        """
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = :database_name
          AND pid <> pg_backend_pid()
        """,
    ), {"database_name": database_name})


def log_event(path: Path, **payload: Any) -> None:
    payload = {"at": datetime.now(UTC).isoformat(), **payload}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, default=str) + "\n")


def collect_inventory(conn) -> list[dict[str, Any]]:
    rows = conn.execute(text(
        """
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY table_schema, table_name
        """,
    )).mappings().all()
    columns = conn.execute(text(
        """
        SELECT table_schema, table_name, column_name, data_type, udt_name, ordinal_position
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY table_schema, table_name, ordinal_position
        """,
    )).mappings().all()
    by_table: dict[str, list[dict[str, Any]]] = {}
    for column in columns:
        by_table.setdefault(f"{column['table_schema']}.{column['table_name']}", []).append(dict(column))
    size_rows = {
        f"{row['schemaname']}.{row['relname']}": row
        for row in conn.execute(text(
            """
            SELECT schemaname, relname,
                   pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) AS total_bytes,
                   pg_relation_size(format('%I.%I', schemaname, relname)::regclass) AS table_bytes,
                   pg_indexes_size(format('%I.%I', schemaname, relname)::regclass) AS index_bytes
            FROM pg_stat_user_tables
            """,
        )).mappings()
    }
    geom_rows = {
        f"{row['f_table_schema']}.{row['f_table_name']}": row
        for row in conn.execute(text(
            "SELECT f_table_schema, f_table_name, f_geometry_column, type, srid FROM geometry_columns",
        )).mappings()
    }
    return [
        {
            "schema": row["table_schema"],
            "object_name": row["table_name"],
            "object_type": "View" if row["table_type"] == "VIEW" else "Table",
            "columns": by_table.get(f"{row['table_schema']}.{row['table_name']}", []),
            "size": dict(size_rows.get(f"{row['table_schema']}.{row['table_name']}", {})),
            "geometry": dict(geom_rows.get(f"{row['table_schema']}.{row['table_name']}", {})),
        }
        for row in rows
    ]


def collect_code_references(inventory: list[dict[str, Any]]) -> set[str]:
    code = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (ROOT / "backend" / "app").rglob("*.py")
    )
    refs = set()
    for item in inventory:
        qualified = f"{item['schema']}.{item['object_name']}"
        if item["object_name"] in code or qualified in code:
            refs.add(qualified)
    return refs


def build_manifest(conn, inventory: list[dict[str, Any]], code_refs: set[str]) -> dict[str, Any]:
    objects: list[dict[str, Any]] = []
    for item in inventory:
        qualified = f"{item['schema']}.{item['object_name']}"
        sensitive = [
            {
                "column": col["column_name"],
                "classification": classify_column(col["column_name"]),
            }
            for col in item["columns"]
            if classify_column(col["column_name"]) not in {"Safe Derived Field", "Public Operational Field"}
        ]
        cloud_required = (
            not item["object_name"].startswith("investment_")
            and (qualified in FORCE_INCLUDE or qualified in code_refs)
        )
        action = migration_action(qualified, item, sensitive, cloud_required)
        required_by = required_features(qualified, code_refs)
        objects.append(
            {
                "schema": item["schema"],
                "object_name": item["object_name"],
                "object_type": item["object_type"],
                "required_by": required_by,
                "cloud_required": cloud_required and action != "Exclude",
                "read_or_write": "read_write" if item["object_name"] in WRITABLE_TABLES else "read_only",
                "contains_geometry": bool(item["geometry"]),
                "approximate_size": pretty_bytes(int(item["size"].get("total_bytes") or 0)),
                "sensitive_columns": sensitive,
                "restriction_status": restriction_status(qualified, sensitive),
                "migration_action": action,
                "rebuildable": action in {"Rebuild from Included Sources", "Exclude"},
                "dependency_notes": dependency_notes(qualified, action, required_by),
                "included_columns": [
                    col["column_name"]
                    for col in item["columns"]
                    if item["object_type"] == "Table"
                ],
            },
        )
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_database": SOURCE_DB,
        "stage_database": STAGE_DB,
        "objects": objects,
        "summary": {
            "total_objects_reviewed": len(objects),
            "included_objects": sum(1 for obj in objects if obj["migration_action"].startswith("Include")),
            "excluded_objects": sum(1 for obj in objects if obj["migration_action"] == "Exclude"),
            "manual_review_objects": sum(1 for obj in objects if obj["migration_action"] == "Manual Review Required"),
        },
    }


def classify_column(name: str) -> str:
    lowered = name.lower()
    if lowered in FALSE_POSITIVE_SAFE_COLUMNS:
        return FALSE_POSITIVE_SAFE_COLUMNS[lowered]
    if any(pattern in lowered for pattern in ("owner", "acctname", "account_name", "mail", "grantor", "grantee", "phone", "email", "contact")):
        return "Sensitive"
    if any(pattern in lowered for pattern in ("api_key", "secret", "password", "token")):
        return "Sensitive"
    if any(pattern in lowered for pattern in ("probability", "raw_score", "exact_probability")):
        return "Restricted"
    if "student_address" in lowered:
        return "Sensitive"
    return "Public Operational Field"


def migration_action(qualified: str, item: dict[str, Any], sensitive: list[dict[str, str]], cloud_required: bool) -> str:
    lowered = qualified.lower()
    if lowered.startswith("public.investment_"):
        return "Include Entire Object"
    if any(lowered.startswith(prefix) for prefix in EXCLUDE_PREFIXES):
        return "Exclude"
    if any(pattern in lowered for pattern in EXCLUDE_TABLE_PATTERNS):
        return "Exclude"
    if item["object_type"] == "View":
        return "Rebuild from Included Sources" if qualified == "public.school_utilization_seed_current" else "Exclude"
    if not cloud_required:
        return "Exclude"
    return "Include Sanitized Columns" if sensitive else "Include Entire Object"


def required_features(qualified: str, code_refs: set[str]) -> list[str]:
    name = qualified.split(".", 1)[1]
    if name.startswith("investment_"):
        return ["Legacy Investments (retired)"]
    features = []
    if qualified in code_refs:
        features.append("active_backend_reference")
    if name.startswith("parcel_school") or name.startswith("school_"):
        features.append("CFS Planning Schools")
    if "transportation" in name:
        features.append("CFS Planning Transportation")
    if "flood" in name or name.startswith("fema"):
        features.append("CFS Planning Environmental")
    if "development_prediction" in name or name == "parcel_development_model_features":
        features.append("Model Lab")
    if name in {"parcels_enriched", "development_activity_parcel_summary", "permit_intelligence_segments"}:
        features.append("CFS Planning / Economics")
    if name in WRITABLE_TABLES:
        features.append("writable_saved_workflow")
    return sorted(set(features)) or ["not_required"]


def restriction_status(qualified: str, sensitive: list[dict[str, str]]) -> str:
    lowered = qualified.lower()
    if any(pattern in lowered for pattern in EXCLUDE_TABLE_PATTERNS):
        return "Restricted source/raw object excluded"
    if any(col["classification"] in {"Sensitive", "Restricted"} for col in sensitive):
        return "Sanitized before cloud staging"
    return "Cloud safe"


def dependency_notes(qualified: str, action: str, required_by: list[str]) -> str:
    if qualified.lower().startswith("public.investment_"):
        return "Retained as dormant legacy Investments inventory; not exposed by the active cloud runtime."
    if action == "Exclude":
        return "Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed."
    if action == "Rebuild from Included Sources":
        return "Recreated from included source tables in the staging database."
    if "writable_saved_workflow" in required_by:
        return "Writable workflow table preserved for local staging validation."
    return "Included for active CFS runtime compatibility."


def copy_table(source, stage, item: dict[str, Any]) -> None:
    schema = quote_ident(item["schema"])
    table = quote_ident(item["object_name"])
    qualified = f"{schema}.{table}"
    stage.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
    column_rows = table_columns(source, item["schema"], item["object_name"])
    column_defs = []
    for row in column_rows:
        default = ""
        if row["column_default"] and "nextval(" not in row["column_default"].lower():
            default = f" DEFAULT {row['column_default']}"
        classification = classify_column(row["column_name"])
        nullable = "" if classification in {"Sensitive", "Restricted"} else " NOT NULL" if row["not_null"] else ""
        column_defs.append(f"{quote_ident(row['column_name'])} {row['data_type']}{default}{nullable}")
    stage.execute(text(f"CREATE TABLE {qualified} ({', '.join(column_defs)})"))
    names = [row["column_name"] for row in column_rows]
    select_parts = []
    for name in names:
        classification = classify_column(name)
        if classification in {"Sensitive", "Restricted"}:
            select_parts.append(f"NULL::{column_type(source, item['schema'], item['object_name'], name)} AS {quote_ident(name)}")
        else:
            select_parts.append(quote_ident(name))
    copy_sql = f"COPY (SELECT {', '.join(select_parts)} FROM {qualified}) TO STDOUT WITH (FORMAT BINARY)"
    paste_sql = f"COPY {qualified} ({', '.join(quote_ident(name) for name in names)}) FROM STDIN WITH (FORMAT BINARY)"
    source_driver = source.connection.driver_connection
    stage_driver = stage.connection.driver_connection
    with source_driver.cursor() as src_cursor, stage_driver.cursor() as dst_cursor:
        with src_cursor.copy(copy_sql) as src_copy:
            with dst_cursor.copy(paste_sql) as dst_copy:
                for chunk in src_copy:
                    dst_copy.write(chunk)
    create_primary_key(source, stage, item)


def table_columns(conn, schema: str, table: str) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(text(
        """
        SELECT
            a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS column_default
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE n.nspname=:schema
          AND c.relname=:table
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
        """,
    ), {"schema": schema, "table": table}).mappings()]


def create_primary_key(source, stage, item: dict[str, Any]) -> None:
    pk = source.execute(text(
        """
        SELECT con.conname,
               array_agg(att.attname ORDER BY cols.ordinality) AS columns
        FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON true
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = cols.attnum
        WHERE con.contype='p'
          AND ns.nspname=:schema
          AND cls.relname=:table
        GROUP BY con.conname
        """,
    ), {"schema": item["schema"], "table": item["object_name"]}).mappings().first()
    if not pk:
        return
    qualified = f"{quote_ident(item['schema'])}.{quote_ident(item['object_name'])}"
    columns = ", ".join(quote_ident(column) for column in pk["columns"])
    try:
        with stage.begin_nested():
            stage.execute(text(f"ALTER TABLE {qualified} ADD CONSTRAINT {quote_ident(pk['conname'])} PRIMARY KEY ({columns})"))
    except SQLAlchemyError as exc:
        print(json.dumps({"status": "warning", "table": f"{item['schema']}.{item['object_name']}", "primary_key": "skipped", "reason": exc.__class__.__name__}))


def column_type(conn, schema: str, table: str, column: str) -> str:
    return conn.execute(text(
        """
        SELECT format_type(a.atttypid, a.atttypmod)
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname=:schema AND c.relname=:table AND a.attname=:column
        """,
    ), {"schema": schema, "table": table, "column": column}).scalar_one()


def create_views(source, stage, manifest: dict[str, Any]) -> None:
    for item in manifest["objects"]:
        if item["migration_action"] != "Rebuild from Included Sources":
            continue
        definition = source.execute(text("SELECT pg_get_viewdef(CAST(:view AS regclass), true)"), {"view": f"{item['schema']}.{item['object_name']}"}).scalar_one()
        stage.execute(text(f"CREATE VIEW {quote_ident(item['schema'])}.{quote_ident(item['object_name'])} AS {definition}"))


def create_indexes(stage, included: list[dict[str, Any]]) -> None:
    for item in included:
        qualified = f"{quote_ident(item['schema'])}.{quote_ident(item['object_name'])}"
        columns = item["included_columns"]
        if "official_parcel_id" in columns:
            stage.execute(text(f"CREATE INDEX IF NOT EXISTS {quote_ident(item['object_name'] + '_official_parcel_id_idx')} ON {qualified} (official_parcel_id)"))
        if "parcel_id" in columns:
            stage.execute(text(f"CREATE INDEX IF NOT EXISTS {quote_ident(item['object_name'] + '_parcel_id_idx')} ON {qualified} (parcel_id)"))
        if item["contains_geometry"]:
            geom_col = "geometry" if "geometry" in columns else "geom" if "geom" in columns else None
            if geom_col:
                stage.execute(text(f"CREATE INDEX IF NOT EXISTS {quote_ident(item['object_name'] + '_' + geom_col + '_gist')} ON {qualified} USING GIST ({quote_ident(geom_col)})"))


def build_safety_report(conn, manifest: dict[str, Any], duration_seconds: float) -> dict[str, Any]:
    size = conn.execute(text(
        """
        SELECT pg_database_size(current_database()) AS total_bytes,
               pg_size_pretty(pg_database_size(current_database())) AS total_pretty
        """,
    )).mappings().one()
    tables = conn.execute(text(
        """
        SELECT schemaname, relname,
               pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) AS total_bytes,
               pg_relation_size(format('%I.%I', schemaname, relname)::regclass) AS table_bytes,
               pg_indexes_size(format('%I.%I', schemaname, relname)::regclass) AS index_bytes
        FROM pg_stat_user_tables
        ORDER BY total_bytes DESC
        """,
    )).mappings().all()
    sensitive_columns = [
        {
            "table_schema": obj["schema"],
            "table_name": obj["object_name"],
            "column_name": col["column"],
        }
        for obj in manifest["objects"]
        if obj["migration_action"].startswith("Include")
        for col in obj["sensitive_columns"]
        if col["classification"] in {"Sensitive", "Restricted"}
    ]
    null_checks = []
    for row in sensitive_columns:
        count = conn.execute(text(
            f"SELECT COUNT(*) FROM {quote_ident(row['table_schema'])}.{quote_ident(row['table_name'])} WHERE {quote_ident(row['column_name'])} IS NOT NULL",
        )).scalar()
        null_checks.append({**dict(row), "non_null_count": int(count or 0)})
    geometry = conn.execute(text(
        """
        SELECT f_table_schema, f_table_name, f_geometry_column, type, srid
        FROM geometry_columns
        ORDER BY 1,2,3
        """,
    )).mappings().all()
    geometry_checks = []
    for row in geometry:
        q = f"{quote_ident(row['f_table_schema'])}.{quote_ident(row['f_table_name'])}"
        col = quote_ident(row["f_geometry_column"])
        stats = conn.execute(text(
            f"SELECT COUNT(*) row_count, COUNT(*) FILTER (WHERE {col} IS NULL) null_geometry_count, COUNT(*) FILTER (WHERE {col} IS NOT NULL AND NOT ST_IsValid({col})) invalid_geometry_count FROM {q}",
        )).mappings().one()
        idx = conn.execute(text(
            """
            SELECT EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE schemaname=:schema AND tablename=:table AND indexdef ILIKE '%USING gist%'
            )
            """,
        ), {"schema": row["f_table_schema"], "table": row["f_table_name"]}).scalar()
        geometry_checks.append({**dict(row), **dict(stats), "spatial_index_present": bool(idx)})
    included = [obj for obj in manifest["objects"] if obj["migration_action"].startswith("Include")]
    excluded = [obj for obj in manifest["objects"] if obj["migration_action"] == "Exclude"]
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "summary": {
            "stage_database": STAGE_DB,
            "stage_total_size": size["total_pretty"],
            "stage_total_bytes": int(size["total_bytes"]),
            "duration_seconds": round(duration_seconds, 1),
            "object_count": len(tables),
            "included_table_count": len(included),
            "excluded_object_count": len(excluded),
            "sensitive_non_null_findings": sum(1 for item in null_checks if item["non_null_count"]),
        },
        "largest_staged_objects": [
            {**dict(row), "total_size": pretty_bytes(int(row["total_bytes"]))}
            for row in tables[:25]
        ],
        "sensitive_column_null_checks": null_checks,
        "geometry_checks": geometry_checks,
    }


def write_inventory_doc(conn, inventory: list[dict[str, Any]], manifest: dict[str, Any]) -> None:
    docs = ROOT / "docs" / "azure"
    docs.mkdir(parents=True, exist_ok=True)
    db = conn.execute(text(
        """
        SELECT current_database() database_name, current_user app_user,
               version() postgres_version,
               pg_size_pretty(pg_database_size(current_database())) database_size,
               pg_size_pretty(sum(pg_relation_size(format('%I.%I', schemaname, relname)::regclass))) table_data_size,
               pg_size_pretty(sum(pg_indexes_size(format('%I.%I', schemaname, relname)::regclass))) index_size
        FROM pg_stat_user_tables
        """
    )).mappings().one()
    postgis = conn.execute(text("SELECT extversion FROM pg_extension WHERE extname='postgis'")).scalar()
    extensions = [row["extname"] for row in conn.execute(text("SELECT extname FROM pg_extension ORDER BY extname")).mappings()]
    largest = conn.execute(text(
        """
        SELECT schemaname, relname, pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC
        LIMIT 50
        """
    )).mappings().all()
    lines = [
        "# CFS Local Database Inventory",
        "",
        f"Generated: {manifest['generated_at']}",
        "",
        "## Source Environment",
        "",
        f"- Source database: `{db['database_name']}`",
        f"- Application database user: `{db['app_user']}`",
        f"- PostgreSQL: `{db['postgres_version']}`",
        f"- PostGIS: `{postgis}`",
        f"- Total database size: `{db['database_size']}`",
        f"- Table-data size: `{db['table_data_size']}`",
        f"- Index size: `{db['index_size']}`",
        f"- Schemas: `public`, `tiger`, `topology`",
        f"- Extensions: {', '.join(f'`{ext}`' for ext in extensions)}",
        "",
        "## Object Counts",
        "",
        f"- Reviewed objects: {manifest['summary']['total_objects_reviewed']}",
        f"- Included objects: {manifest['summary']['included_objects']}",
        f"- Excluded objects: {manifest['summary']['excluded_objects']}",
        f"- Manual-review objects: {manifest['summary']['manual_review_objects']}",
        "",
        "## Migration Actions",
        "",
        "| Action | Count |",
        "| --- | ---: |",
    ]
    for action in ("Include Entire Object", "Include Sanitized Columns", "Rebuild from Included Sources", "Exclude", "Manual Review Required"):
        lines.append(f"| {action} | {sum(1 for obj in manifest['objects'] if obj['migration_action'] == action)} |")
    lines.extend([
        "",
        "## Included And Rebuilt Objects",
        "",
        "| Object | Action | Required By | Read/Write |",
        "| --- | --- | --- | --- |",
    ])
    lines.extend(
        f"| `{obj['schema']}.{obj['object_name']}` | {obj['migration_action']} | {', '.join(obj['required_by'])} | {obj['read_or_write']} |"
        for obj in manifest["objects"]
        if obj["migration_action"] != "Exclude"
    )
    sanitized = [obj for obj in manifest["objects"] if obj["migration_action"] == "Include Sanitized Columns"]
    lines.extend([
        "",
        "## Sanitized Compatibility Columns",
        "",
        "| Object | Columns nulled in staging |",
        "| --- | --- |",
    ])
    for obj in sanitized:
        columns = ", ".join(f"`{col['column']}`" for col in obj["sensitive_columns"])
        lines.append(f"| `{obj['schema']}.{obj['object_name']}` | {columns} |")
    excluded = [obj for obj in manifest["objects"] if obj["migration_action"] == "Exclude"]
    lines.extend([
        "",
        "## Excluded Objects",
        "",
        "| Object | Restriction status | Dependency notes |",
        "| --- | --- | --- |",
    ])
    lines.extend(
        f"| `{obj['schema']}.{obj['object_name']}` | {obj['restriction_status']} | {obj['dependency_notes']} |"
        for obj in excluded
    )
    lines.extend([
        "",
        "## Largest 50 Tables",
        "",
        "| Schema | Table | Size |",
        "| --- | --- | --- |",
    ])
    lines.extend(f"| {row['schemaname']} | `{row['relname']}` | {row['size']} |" for row in largest)
    lines.extend([
        "",
        "## Notes",
        "",
        "- No row-level sensitive values are printed in this inventory.",
        "- Raw import tables, raw WSACC source linework, extension-managed support tables, and exact model-score fields are excluded or sanitized in the cloud manifest.",
        "- `cfs_cloud_stage` is built locally only; Azure restore is not part of AZ-1A.",
    ])
    (docs / "cfs-local-database-inventory.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_safety_doc(safety: dict[str, Any]) -> None:
    docs = ROOT / "docs" / "azure"
    docs.mkdir(parents=True, exist_ok=True)
    null_findings = [item for item in safety["sensitive_column_null_checks"] if item["non_null_count"]]
    lines = [
        "# CFS Cloud Stage Safety Report",
        "",
        f"Generated: {safety['generated_at']}",
        "",
        "## Summary",
        "",
        f"- Stage database: `{safety['summary']['stage_database']}`",
        f"- Stage size: `{safety['summary']['stage_total_size']}`",
        f"- Included tables: {safety['summary']['included_table_count']}",
        f"- Excluded objects: {safety['summary']['excluded_object_count']}",
        f"- Sensitive non-null findings: {safety['summary']['sensitive_non_null_findings']}",
        "",
        "## Sensitive Column Check",
        "",
    ]
    if null_findings:
        lines.extend(["| Table | Column | Non-null rows |", "| --- | --- | --- |"])
        lines.extend(
            f"| `{item['table_schema']}.{item['table_name']}` | `{item['column_name']}` | {item['non_null_count']} |"
            for item in null_findings
        )
    else:
        lines.append("All detected sensitive/restricted compatibility columns are NULL in staging.")
    if safety["sensitive_column_null_checks"]:
        lines.extend([
            "",
            "## Nulled Compatibility Columns",
            "",
            "| Table | Column | Non-null rows |",
            "| --- | --- | ---: |",
        ])
        lines.extend(
            f"| `{item['table_schema']}.{item['table_name']}` | `{item['column_name']}` | {item['non_null_count']} |"
            for item in safety["sensitive_column_null_checks"]
        )
    lines.extend([
        "",
        "## Geometry Validation",
        "",
        "| Table | Column | Type | SRID | Rows | Null geometries | Invalid geometries | Spatial index |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ])
    lines.extend(
        f"| `{row['f_table_schema']}.{row['f_table_name']}` | `{row['f_geometry_column']}` | {row['type']} | {row['srid']} | {row['row_count']} | {row['null_geometry_count']} | {row['invalid_geometry_count']} | {row['spatial_index_present']} |"
        for row in safety["geometry_checks"]
    )
    invalid_geometry = [row for row in safety["geometry_checks"] if row["invalid_geometry_count"]]
    if invalid_geometry:
        lines.extend([
            "",
            "## Geometry Notes",
            "",
        ])
        lines.extend(
            f"- `{row['f_table_schema']}.{row['f_table_name']}` retains {row['invalid_geometry_count']} invalid source geometries for schema compatibility; no geometry was transformed or simplified during staging."
            for row in invalid_geometry
        )
    lines.extend([
        "",
        "## Safety Notes",
        "",
        "- Raw WSACC source tables are excluded; derived parcel utility proxy tables are included.",
        "- Owner, mailing, grantor/grantee, raw-score, and exact-probability compatibility columns are set to NULL when a table is required.",
        "- No Azure restore was executed.",
    ])
    (docs / "cfs-cloud-stage-safety-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def pretty_bytes(value: int) -> str:
    units = ["bytes", "KB", "MB", "GB", "TB"]
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            return f"{amount:.0f} {unit}" if unit == "bytes" else f"{amount:.1f} {unit}"
        amount /= 1024
    return f"{value} bytes"


if __name__ == "__main__":
    raise SystemExit(main())
