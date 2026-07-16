from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "config" / "cfs_cloud_table_manifest.json"
DEFAULT_OUTPUT = Path(r"C:\CFS_Azure_Migration\cfs_cloud_azure_validation.json")


def connect_stage() -> psycopg.Connection:
    password = os.getenv("CFS_POSTGRES_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    return psycopg.connect(
        host=os.getenv("STAGE_PGHOST", "localhost"),
        port=int(os.getenv("STAGE_PGPORT", "5433")),
        dbname=os.getenv("STAGE_PGDATABASE", "cfs_cloud_stage"),
        user=os.getenv("STAGE_PGUSER", "postgres"),
        password=password,
        sslmode="disable",
        connect_timeout=10,
    )


def connect_azure() -> psycopg.Connection:
    return psycopg.connect(
        host=os.environ["PGHOST"],
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.environ["PGDATABASE"],
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        sslmode=os.getenv("PGSSLMODE", "require"),
        connect_timeout=20,
    )


def scalar(conn: psycopg.Connection, query: Any, params: tuple[Any, ...] = ()) -> Any:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()[0]


def count_table(conn: psycopg.Connection, schema: str, table: str) -> int:
    return int(scalar(conn, sql.SQL("SELECT COUNT(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(table))))


def database_summary(conn: psycopg.Connection) -> dict[str, Any]:
    return {
        "database": scalar(conn, "SELECT current_database()"),
        "server_version": scalar(conn, "SHOW server_version"),
        "postgis_version": scalar(conn, "SELECT postgis_lib_version()"),
        "size_bytes": int(scalar(conn, "SELECT pg_database_size(current_database())")),
        "size_pretty": scalar(conn, "SELECT pg_size_pretty(pg_database_size(current_database()))"),
        "public_tables": int(
            scalar(
                conn,
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
            )
        ),
        "public_views": int(scalar(conn, "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public'")),
        "public_sequences": int(scalar(conn, "SELECT COUNT(*) FROM information_schema.sequences WHERE sequence_schema='public'")),
    }


def included_tables(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        obj
        for obj in manifest["objects"]
        if obj["object_type"] == "Table" and obj["migration_action"].startswith("Include")
    ]


def row_counts(stage: psycopg.Connection, azure: psycopg.Connection, tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for obj in tables:
        stage_count = count_table(stage, obj["schema"], obj["object_name"])
        azure_count = count_table(azure, obj["schema"], obj["object_name"])
        rows.append(
            {
                "table": f"{obj['schema']}.{obj['object_name']}",
                "stage": stage_count,
                "azure": azure_count,
                "difference": azure_count - stage_count,
            }
        )
    return rows


def geometry_rows(conn: psycopg.Connection, tables: set[str]) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            """
            SELECT f_table_schema, f_table_name, f_geometry_column, type, srid
            FROM geometry_columns
            WHERE f_table_schema = 'public'
            ORDER BY f_table_schema, f_table_name, f_geometry_column
            """
        )
        candidates = [dict(row) for row in cur.fetchall() if f"{row['f_table_schema']}.{row['f_table_name']}" in tables]

    checked = []
    for row in candidates:
        schema, table, column = row["f_table_schema"], row["f_table_name"], row["f_geometry_column"]
        stats_query = sql.SQL(
            """
            SELECT
              COUNT(*)::bigint,
              COUNT({column})::bigint,
              COUNT(*) FILTER (WHERE {column} IS NULL)::bigint,
              COUNT(*) FILTER (WHERE {column} IS NOT NULL AND NOT ST_IsValid({column}))::bigint
            FROM {schema}.{table}
            """
        ).format(column=sql.Identifier(column), schema=sql.Identifier(schema), table=sql.Identifier(table))
        with conn.cursor() as cur:
            cur.execute(stats_query)
            total, non_null, nulls, invalid = cur.fetchone()
            cur.execute(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM pg_index i
                  JOIN pg_class tbl ON tbl.oid = i.indrelid
                  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
                  JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = ANY(i.indkey)
                  WHERE ns.nspname = %s AND tbl.relname = %s AND att.attname = %s AND i.indisvalid
                )
                """,
                (schema, table, column),
            )
            has_index = bool(cur.fetchone()[0])
        checked.append(
            {
                **row,
                "row_count": int(total),
                "non_null_geometry_count": int(non_null),
                "null_geometry_count": int(nulls),
                "invalid_geometry_count": int(invalid),
                "spatial_index_present": has_index,
            }
        )
    return checked


def sensitive_checks(conn: psycopg.Connection, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    checks = []
    for obj in included_tables(manifest):
        for column in obj["sensitive_columns"]:
            if column["classification"] not in {"Sensitive", "Restricted"}:
                continue
            count_query = sql.SQL("SELECT COUNT(*) FROM {}.{} WHERE {} IS NOT NULL").format(
                sql.Identifier(obj["schema"]),
                sql.Identifier(obj["object_name"]),
                sql.Identifier(column["column"]),
            )
            checks.append(
                {
                    "table": f"{obj['schema']}.{obj['object_name']}",
                    "column": column["column"],
                    "non_null_rows": int(scalar(conn, count_query)),
                }
            )
    return checks


def forbidden_objects(conn: psycopg.Connection) -> list[str]:
    forbidden = ["wsacc_basins", "wsacc_manholes", "wsacc_sewer_lines", "student", "raw_score", "exact_probability"]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_schema || '.' || table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            UNION
            SELECT table_schema || '.' || table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
            """
        )
        names = [row[0] for row in cur.fetchall()]
    return sorted(name for name in names if any(term in name.lower() for term in forbidden))


def view_checks(conn: psycopg.Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute("SELECT table_schema, table_name FROM information_schema.views WHERE table_schema='public'")
        views = cur.fetchall()
    results = []
    for schema, view in views:
        scalar(conn, sql.SQL("SELECT COUNT(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(view)))
        results.append({"view": f"{schema}.{view}", "resolves": True})
    return results


def writable_rollback(conn: psycopg.Connection) -> list[str]:
    statements = [
        "INSERT INTO investment_candidate_intake (id, candidate_name, source_type, strategy, created_at, updated_at) VALUES ('az1b-validation-candidate', 'AZ1B Validation', 'Manual Research', 'development_land', now(), now())",
        "INSERT INTO investment_saved_item (id, item_type, item_reference_id, label, status, created_at, updated_at) VALUES ('az1b-validation-item', 'parcel', 'AZ1B', 'AZ1B Validation', 'Shortlisted', now(), now())",
        "INSERT INTO investment_recent_work (id, activity_type, reference_type, label, page, last_opened_at) VALUES ('az1b-validation-recent', 'opened', 'parcel', 'AZ1B Validation', 'research', now())",
        "INSERT INTO investment_saved_search (id, search_name, goal, location_type, guided_or_advanced, created_at, updated_at) VALUES ('az1b-validation-search', 'AZ1B Validation', 'Custom', 'All Cabarrus County', 'guided', now(), now())",
        "INSERT INTO investment_engagement (id, engagement_name, selected_strategy, engagement_status, created_at, updated_at) VALUES ('az1b-validation-engagement', 'AZ1B Validation', 'development_land', 'Draft', now(), now())",
        "INSERT INTO investment_underwriting_scenario (id, scenario_name, scenario_type, strategy, assumptions_json, results_json, scenario_status, created_at, updated_at) VALUES ('az1b-validation-scenario', 'AZ1B Validation', 'development_land', 'development_land', '{}', '{}', 'Draft', now(), now())",
    ]
    with conn.cursor() as cur:
        cur.execute("BEGIN")
        for statement in statements:
            cur.execute(statement)
        cur.execute("ROLLBACK")
    return [
        "investment_candidate_intake",
        "investment_saved_item",
        "investment_recent_work",
        "investment_saved_search",
        "investment_engagement",
        "investment_underwriting_scenario",
    ]


def geometry_mismatches(stage_geometry: list[dict[str, Any]], azure_geometry: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keys = (
        "f_table_schema",
        "f_table_name",
        "f_geometry_column",
        "type",
        "srid",
        "row_count",
        "non_null_geometry_count",
        "null_geometry_count",
        "invalid_geometry_count",
        "spatial_index_present",
    )
    mismatches: list[dict[str, Any]] = []
    if len(stage_geometry) != len(azure_geometry):
        mismatches.append({"stage_geometry_count": len(stage_geometry), "azure_geometry_count": len(azure_geometry)})
    for left, right in zip(stage_geometry, azure_geometry, strict=False):
        if {key: left[key] for key in keys} != {key: right[key] for key in keys}:
            mismatches.append({"stage": left, "azure": right})
    return mismatches


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    tables = included_tables(manifest)
    table_names = {f"{obj['schema']}.{obj['object_name']}" for obj in tables}

    with connect_stage() as stage, connect_azure() as azure:
        rows = row_counts(stage, azure, tables)
        stage_geometry = geometry_rows(stage, table_names)
        azure_geometry = geometry_rows(azure, table_names)
        geometry_diffs = geometry_mismatches(stage_geometry, azure_geometry)
        report = {
            "stage": database_summary(stage),
            "azure": database_summary(azure),
            "row_counts": rows,
            "row_count_mismatches": [row for row in rows if row["difference"] != 0],
            "geometry": {
                "stage": stage_geometry,
                "azure": azure_geometry,
                "mismatches": geometry_diffs,
            },
            "sensitive_column_checks": sensitive_checks(azure, manifest),
            "forbidden_objects": forbidden_objects(azure),
            "views": view_checks(azure),
            "invalid_public_indexes": int(
                scalar(
                    azure,
                    """
                    SELECT COUNT(*)
                    FROM pg_index i
                    JOIN pg_class c ON c.oid = i.indrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND NOT i.indisvalid
                    """,
                )
            ),
            "writable_rollback_tables": writable_rollback(azure),
        }

    report["ok"] = not report["row_count_mismatches"] and not report["geometry"]["mismatches"] and not [
        item for item in report["sensitive_column_checks"] if item["non_null_rows"]
    ] and not report["forbidden_objects"] and report["invalid_public_indexes"] == 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "row_mismatches": len(report["row_count_mismatches"]), "geometry_mismatches": len(report["geometry"]["mismatches"]), "sensitive_findings": sum(1 for item in report["sensitive_column_checks"] if item["non_null_rows"])}))
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
