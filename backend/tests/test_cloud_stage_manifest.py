from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pytest
from sqlalchemy import URL, create_engine, text

from app.config import Settings

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "config" / "cfs_cloud_table_manifest.json"
EXPORT_SCRIPT = ROOT / "scripts" / "azure" / "export_cfs_cloud_stage.ps1"
BUILD_SCRIPT = ROOT / "scripts" / "azure" / "build_cfs_cloud_stage.py"
VALIDATE_SCRIPT = ROOT / "scripts" / "azure" / "validate_cfs_cloud_stage.ps1"
STAGE_DB = "cfs_cloud_stage"

ALLOWED_ACTIONS = {
    "Include Entire Object",
    "Include Sanitized Columns",
    "Rebuild from Included Sources",
    "Exclude",
    "Manual Review Required",
}
REQUIRED_TABLES = {
    "public.parcels_enriched",
    "public.development_activity_parcel_summary",
    "public.permit_intelligence_segments",
    "public.fema_nfhl_flood_zones_clean",
    "public.parcel_school_summary",
    "public.parcel_transportation_accessibility_features",
    "public.parcel_wsacc_utility_features",
    "public.parcel_development_screening_output",
    "public.investment_acs_market_context",
    "public.investment_parcel_environmental_context",
    "public.investment_candidate_intake",
    "public.investment_saved_item",
    "public.investment_recent_work",
    "public.investment_saved_search",
    "public.investment_engagement",
    "public.investment_underwriting_scenario",
}
WRITABLE_TABLES = {
    "investment_assumption_template",
    "investment_candidate_intake",
    "investment_engagement",
    "investment_recent_work",
    "investment_saved_item",
    "investment_saved_search",
    "investment_underwriting_scenario",
}
RAW_OR_RESTRICTED_OBJECTS = {
    "public.wsacc_basins",
    "public.wsacc_manholes",
    "public.wsacc_sewer_lines",
    "public.tax_parcel_full_raw",
    "public.utility_proxy_wsacc_raw",
}


def _manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _objects() -> dict[str, dict]:
    return {f"{obj['schema']}.{obj['object_name']}": obj for obj in _manifest()["objects"]}


def _stage_engine():
    if os.environ.get("POSTGRES_DB") != STAGE_DB:
        pytest.skip("live cfs_cloud_stage checks require POSTGRES_DB=cfs_cloud_stage")
    settings = Settings()
    url = URL.create(
        drivername="postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=STAGE_DB,
    )
    return create_engine(url, connect_args={"connect_timeout": 5})


def test_cloud_manifest_validity() -> None:
    manifest = _manifest()
    assert manifest["source_database"] == "cfs_dev"
    assert manifest["stage_database"] == STAGE_DB
    for obj in manifest["objects"]:
        assert {
            "schema",
            "object_name",
            "object_type",
            "required_by",
            "cloud_required",
            "read_or_write",
            "contains_geometry",
            "approximate_size",
            "sensitive_columns",
            "restriction_status",
            "migration_action",
            "rebuildable",
            "dependency_notes",
        } <= obj.keys()
        assert obj["migration_action"] in ALLOWED_ACTIONS


def test_active_backend_dependencies_are_represented() -> None:
    objects = _objects()
    code = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in (ROOT / "backend" / "app").rglob("*.py"))
    referenced = {qualified for qualified, obj in objects.items() if obj["schema"] == "public" and (qualified in code or obj["object_name"] in code)}
    intentionally_excluded = {name for name in referenced if name.startswith("public.wsacc_") or name.endswith("_raw")}
    missing = [name for name in sorted(referenced - intentionally_excluded) if objects[name]["migration_action"] == "Exclude"]
    assert not missing


def test_restricted_fields_are_excluded_or_nulled() -> None:
    objects = _objects()
    for name, obj in objects.items():
        sensitive = {col["column"] for col in obj["sensitive_columns"] if col["classification"] in {"Sensitive", "Restricted"}}
        if obj["migration_action"].startswith("Include") and sensitive:
            assert obj["migration_action"] == "Include Sanitized Columns", name
    assert {"acctname1", "acctname2", "mailaddr1", "mailaddr2", "mailcity", "mailstate", "mailzipcode"} <= {
        col["column"] for col in objects["public.parcels_enriched"]["sensitive_columns"]
    }
    assert {"experimental_probability", "probability_rank", "probability_percentile"} <= {
        col["column"] for col in objects["public.development_prediction_model_experiment_scores"]["sensitive_columns"]
    }


def test_raw_wsacc_student_and_raw_score_sources_are_not_included() -> None:
    objects = _objects()
    for name in RAW_OR_RESTRICTED_OBJECTS & objects.keys():
        assert objects[name]["migration_action"] == "Exclude"
    included_names = {name for name, obj in objects.items() if obj["migration_action"].startswith("Include")}
    assert not [name for name in included_names if "student" in name.lower()]
    assert not [name for name in included_names if name.endswith("_raw")]


def test_required_planning_economics_and_investment_tables_are_compatible() -> None:
    objects = _objects()
    missing = [name for name in sorted(REQUIRED_TABLES) if objects.get(name, {}).get("migration_action") not in {"Include Entire Object", "Include Sanitized Columns"}]
    assert not missing
    for table in WRITABLE_TABLES:
        obj = objects[f"public.{table}"]
        assert obj["read_or_write"] == "read_write"
        assert obj["migration_action"].startswith("Include")


def test_export_script_is_safe_static_contract() -> None:
    script = EXPORT_SCRIPT.read_text(encoding="utf-8")
    postgres_url_scheme = "postgres" + "ql://"
    assert r"C:\Program Files\PostgreSQL\18\bin" in script
    assert r"C:\CFS_Azure_Migration" in script
    assert "--format directory" in script
    assert "--jobs $Jobs" in script
    assert "--no-owner" in script
    assert "--no-acl" in script
    assert "Refusing to write migration artifacts outside C:\\CFS_Azure_Migration." in script
    assert "DATABASE_URL" not in script
    assert postgres_url_scheme not in script.lower()
    assert "password=" not in script.lower()


def test_azure_scripts_do_not_embed_credentials() -> None:
    postgres_url_scheme = "postgres" + "ql://"
    assignment_pattern = rf"(?i)({'|'.join(('password', 'token', 'secret'))})\s*=\s*['\"][^'\"]+['\"]"
    for path in (BUILD_SCRIPT, EXPORT_SCRIPT, VALIDATE_SCRIPT):
        script = path.read_text(encoding="utf-8")
        assert postgres_url_scheme not in script.lower()
        assert not re.search(assignment_pattern, script)


def test_live_stage_sensitive_values_are_unavailable() -> None:
    engine = _stage_engine()
    columns = [
        {
            "table_schema": obj["schema"],
            "table_name": obj["object_name"],
            "column_name": col["column"],
        }
        for obj in _manifest()["objects"]
        if obj["migration_action"].startswith("Include")
        for col in obj["sensitive_columns"]
        if col["classification"] in {"Sensitive", "Restricted"}
    ]
    with engine.connect() as conn:
        findings = []
        for column in columns:
            count = conn.execute(text(
                f"""SELECT COUNT(*) FROM "{column['table_schema']}"."{column['table_name']}" WHERE "{column['column_name']}" IS NOT NULL"""
            )).scalar_one()
            if count:
                findings.append(f"{column['table_schema']}.{column['table_name']}.{column['column_name']}")
    assert not findings


def test_live_stage_geometry_objects_exist() -> None:
    engine = _stage_engine()
    expected = {
        name
        for name, obj in _objects().items()
        if obj["contains_geometry"] and obj["migration_action"].startswith("Include")
    }
    with engine.connect() as conn:
        actual = {
            f"{row['f_table_schema']}.{row['f_table_name']}"
            for row in conn.execute(text("SELECT f_table_schema, f_table_name FROM geometry_columns")).mappings()
        }
    assert expected <= actual


def test_live_stage_writable_tables_accept_qa_rows() -> None:
    engine = _stage_engine()
    inserts = [
        "INSERT INTO investment_assumption_template (id, template_name, scenario_type, default_source, assumptions_json, values_requiring_confirmation_json, created_at, updated_at) VALUES ('qa-template', 'QA Template', 'development_land', 'QA', '{}', '[]', now(), now())",
        "INSERT INTO investment_candidate_intake (id, candidate_name, source_type, strategy, created_at, updated_at) VALUES ('qa-candidate', 'QA Candidate', 'Manual Research', 'development_land', now(), now())",
        "INSERT INTO investment_engagement (id, engagement_name, selected_strategy, engagement_status, brief_json, criteria_json, shortlist_json, created_at, updated_at) VALUES ('qa-engagement', 'QA Engagement', 'development_land', 'Draft', '{}', '[]', '[]', now(), now())",
        "INSERT INTO investment_recent_work (id, activity_type, reference_type, label, page, context_json, last_opened_at) VALUES ('qa-recent', 'open', 'parcel', 'QA Recent', 'investment', '{}', now())",
        "INSERT INTO investment_saved_item (id, item_type, item_reference_id, label, status, created_at, updated_at) VALUES ('qa-saved', 'parcel', 'qa-parcel', 'QA Saved', 'Saved', now(), now())",
        "INSERT INTO investment_saved_search (id, search_name, goal, location_type, essential_criteria_json, advanced_criteria_json, result_summary_json, created_at, updated_at) VALUES ('qa-search', 'QA Search', 'Custom', 'All Cabarrus County', '{}', '{}', '{}', now(), now())",
        "INSERT INTO investment_underwriting_scenario (id, scenario_name, scenario_type, strategy, assumptions_json, results_json, scenario_status, created_at, updated_at) VALUES ('qa-scenario', 'QA Scenario', 'development_land', 'development_land', '{}', '{}', 'Draft', now(), now())",
    ]
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            for statement in inserts:
                conn.execute(text(statement))
            for table in WRITABLE_TABLES:
                assert conn.execute(text(f"SELECT COUNT(*) FROM {table} WHERE id LIKE 'qa-%'")).scalar_one() >= 1
        finally:
            transaction.rollback()
