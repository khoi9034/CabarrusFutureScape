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
ACTIVE_REQUIRED_TABLES = {
    "public.parcels_enriched",
    "public.development_activity_parcel_summary",
    "public.permit_intelligence_segments",
    "public.fema_nfhl_flood_zones_clean",
    "public.parcel_school_summary",
    "public.parcel_transportation_accessibility_features",
    "public.parcel_wsacc_utility_features",
    "public.parcel_development_screening_output",
}
LEGACY_INVESTMENT_TABLES = {
    "public.investment_acs_market_context",
    "public.investment_acs_tract_geometry",
    "public.investment_assumption_template",
    "public.investment_environmental_facilities",
    "public.investment_nwi_wetlands",
    "public.investment_parcel_acs_geography",
    "public.investment_parcel_environmental_context",
    "public.investment_candidate_intake",
    "public.investment_saved_item",
    "public.investment_recent_work",
    "public.investment_saved_search",
    "public.investment_soil_units",
    "public.investment_terrain_context",
    "public.investment_engagement",
    "public.investment_underwriting_scenario",
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


def test_active_tables_and_retained_legacy_investment_tables_are_compatible() -> None:
    objects = _objects()
    missing = [name for name in sorted(ACTIVE_REQUIRED_TABLES) if objects.get(name, {}).get("migration_action") not in {"Include Entire Object", "Include Sanitized Columns"}]
    assert not missing
    for table in LEGACY_INVESTMENT_TABLES:
        obj = objects[table]
        assert obj["cloud_required"] is False
        assert obj["read_or_write"] == "read_only"
        assert obj["migration_action"].startswith("Include")
        assert obj["required_by"] == ["Legacy Investments (retired)"]


def test_export_script_is_safe_static_contract() -> None:
    script = EXPORT_SCRIPT.read_text(encoding="utf-8")
    postgres_url_scheme = "postgres" + "ql://"
    assert r"C:\Program Files\PostgreSQL\18\bin" in script
    assert r"local-data\azure-migration" in script
    assert ('"--format", "directory"' in script) or ("--format directory" in script)
    assert ('"--jobs", "$Jobs"' in script) or ("--jobs $Jobs" in script)
    assert "--no-owner" in script
    assert "--no-acl" in script
    assert "Refusing to write migration artifacts outside local-data\\azure-migration." in script
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
