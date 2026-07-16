from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORT_SCRIPT = ROOT / "scripts" / "azure" / "export_cfs_cloud_stage.ps1"
RESTORE_SCRIPT = ROOT / "scripts" / "azure" / "restore_cfs_cloud_to_azure.ps1"
RESTORE_RUNNER = ROOT / "scripts" / "azure" / "run_azure_restore_with_metrics.ps1"
AZURE_VALIDATOR = ROOT / "scripts" / "azure" / "validate_cfs_cloud_azure.py"
ROLE_GRANTS = ROOT / "scripts" / "azure" / "cfs_app_role_grants.sql"
MIGRATION_DOC = ROOT / "docs" / "azure" / "cfs-azure-postgis-migration.md"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_export_records_manifest_and_checksums_without_repo_output() -> None:
    script = _text(EXPORT_SCRIPT)
    assert "C:\\CFS_Azure_Migration" in script
    assert "Refusing to write migration artifacts inside the repository." in script
    assert "Get-FileHash -Algorithm SHA256" in script
    assert "started_at" in script
    assert "completed_at" in script
    assert "duration_seconds" in script
    assert "dump_bytes" in script
    assert "Start-Process" in script
    assert "--no-owner" in script
    assert "--no-acl" in script


def test_restore_script_requires_tls_no_owner_no_acl_and_conservative_jobs() -> None:
    script = _text(RESTORE_SCRIPT)
    assert "PGSSLMODE=require is required" in script
    assert "--no-owner" in script
    assert "--no-acl" in script
    assert "--exit-on-error" in script
    assert "Azure restore parallelism is capped at 2 jobs" in script
    assert "[int]$Jobs = 1" in script
    assert "C:\\CFS_Azure_Migration" in script


def test_restore_runner_uses_entra_token_process_only_and_metrics() -> None:
    script = _text(RESTORE_RUNNER)
    assert "get-access-token" in script
    assert "https://ossrdbms-aad.database.windows.net" in script
    assert "PGPASSWORD" in script
    assert "az monitor metrics list" in script
    assert "restore_exit_code" in script
    assert "ConvertFrom-Json).exit_code" in script
    assert "cpu_percent" in script
    assert "cpu_credits_remaining" in script
    assert "WindowStyle Hidden" in script


def test_azure_validator_compares_counts_geometry_sensitive_columns_and_writes() -> None:
    script = _text(AZURE_VALIDATOR)
    assert "row_count_mismatches" in script
    assert "geometry" in script
    assert "non_null_geometry_count" in script
    assert "invalid_geometry_count" in script
    assert "spatial_index_present" in script
    assert "sensitive_column_checks" in script
    assert "forbidden_objects" in script
    assert "writable_rollback" in script
    assert "sslmode=\"disable\"" in script
    assert "sslmode=os.getenv(\"PGSSLMODE\", \"require\")" in script


def test_role_grants_keep_readonly_readonly_and_app_writes_narrow() -> None:
    sql = _text(ROLE_GRANTS)
    assert "CREATE ROLE cfs_readonly" in sql
    assert "CREATE ROLE cfs_app" in sql
    assert "pg_depend" in sql
    assert "d.deptype = 'e'" in sql
    assert "GRANT SELECT ON TABLE %I.%I TO cfs_readonly, cfs_app" in sql
    assert "REVOKE INSERT, UPDATE, DELETE" in sql
    assert "TO cfs_app" in sql
    assert "public.investment_candidate_intake" in sql
    assert "public.investment_underwriting_scenario" in sql
    assert "ALTER ROLE" not in sql
    assert not re.search(r"(?i)\b(WITH\s+)?PASSWORD\b", sql)


def test_migration_assets_do_not_embed_connection_strings_or_secret_values() -> None:
    files = [EXPORT_SCRIPT, RESTORE_SCRIPT, RESTORE_RUNNER, AZURE_VALIDATOR, ROLE_GRANTS, MIGRATION_DOC]
    joined = "\n".join(_text(path) for path in files)
    assert not re.search(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@", joined)
    assert not re.search(r"(?i)(password|token|secret|api[_-]?key)\s*=\s*['\"][^'\"]+['\"]", joined)
