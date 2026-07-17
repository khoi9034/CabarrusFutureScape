from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.database import build_database_url
from app.services.schema_guard import cloud_tables_exist

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "backend" / "Dockerfile"
BACKEND_DOCKERIGNORE = ROOT / "backend" / ".dockerignore"
ROOT_DOCKERIGNORE = ROOT / ".dockerignore"
REQUIREMENTS = ROOT / "backend" / "requirements.txt"
DATABASE = ROOT / "backend" / "app" / "database.py"
MAIN = ROOT / "backend" / "app" / "main.py"
TELEMETRY = ROOT / "backend" / "app" / "telemetry.py"
DEPLOY_SCRIPT = ROOT / "scripts" / "azure" / "deploy_cfs_api_container_app.ps1"
ROLLBACK_SCRIPT = ROOT / "scripts" / "azure" / "rollback_cfs_api_container_app.ps1"
SMOKE_SCRIPT = ROOT / "scripts" / "azure" / "smoke_cfs_api.py"
PREWARM_SCRIPT = ROOT / "scripts" / "azure" / "prewarm_cfs_api.ps1"
ENTRA_SCRIPT = ROOT / "scripts" / "azure" / "configure_cfs_entra_apps.ps1"
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-cfs-api.yml"


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_dockerfile_is_production_safe() -> None:
    dockerfile = _text(DOCKERFILE)
    assert dockerfile.startswith("FROM python:3.14-slim")
    assert "PYTHONDONTWRITEBYTECODE=1" in dockerfile
    assert "PYTHONUNBUFFERED=1" in dockerfile
    assert "COPY requirements.txt ." in dockerfile
    assert "COPY app ./app" in dockerfile
    assert "USER cfsapi" in dockerfile
    assert "EXPOSE 8000" in dockerfile
    assert '"--host", "0.0.0.0"' in dockerfile
    assert '"--workers", "1"' in dockerfile
    assert "--reload" not in dockerfile
    assert "backend.env" not in dockerfile
    assert "outputs" not in dockerfile


def test_dockerignore_blocks_sensitive_and_large_context_paths() -> None:
    combined = _text(BACKEND_DOCKERIGNORE) + "\n" + _text(ROOT_DOCKERIGNORE)
    for required in [
        ".git",
        ".env",
        "backend.env",
        "outputs",
        "data/WSACC",
        "*.dump",
        "*.backup",
        "*.log",
        "__pycache__",
        ".pytest_cache",
    ]:
        assert required in combined


def test_managed_identity_database_url_and_pool_bounds() -> None:
    settings = Settings(
        CFS_DATABASE_AUTH_MODE="managed_identity",
        CFS_AZURE_POSTGRES_HOST="cfs.postgres.database.azure.com",
        CFS_AZURE_POSTGRES_DATABASE="cfs_cloud",
        CFS_AZURE_POSTGRES_USER="cfs-api-mi",
        _env_file=None,
    )
    url = build_database_url(settings)
    assert url.host == "cfs.postgres.database.azure.com"
    assert url.port == 5432
    assert url.database == "cfs_cloud"
    assert url.username == "cfs-api-mi"
    assert url.password is None
    assert url.query["sslmode"] == "require"
    assert settings.database_pool_size <= 5
    assert settings.database_max_overflow <= 3
    assert settings.database_pool_recycle_seconds < 3600


def test_managed_identity_token_is_added_per_physical_connect_without_logging() -> None:
    database = _text(DATABASE)
    assert "ManagedIdentityCredential" in database
    assert "do_connect" in database
    assert "get_token(POSTGRES_ENTRA_SCOPE)" in database
    assert "https://ossrdbms-aad.database.windows.net/.default" in database
    assert not re.search(r"print\(|logging\.", database)


def test_cloud_table_guard_checks_existing_tables_only_for_managed_identity(monkeypatch) -> None:
    class Scalar:
        def __init__(self, value: str | None) -> None:
            self.value = value

        def scalar(self) -> str | None:
            return self.value

    class FakeDb:
        def __init__(self) -> None:
            self.names: list[str] = []

        def execute(self, _statement, params):
            self.names.append(params["table_name"])
            return Scalar(params["table_name"])

    import app.config

    fake_db = FakeDb()
    monkeypatch.setenv("CFS_DATABASE_AUTH_MODE", "managed_identity")
    app.config.get_settings.cache_clear()
    assert cloud_tables_exist(fake_db, ["investment_candidate_intake", "investment_saved_item"])
    assert fake_db.names == ["investment_candidate_intake", "investment_saved_item"]

    fake_db = FakeDb()
    monkeypatch.setenv("CFS_DATABASE_AUTH_MODE", "password")
    app.config.get_settings.cache_clear()
    assert not cloud_tables_exist(fake_db, ["investment_candidate_intake"])
    assert fake_db.names == []


def test_staging_access_protects_non_health_routes(monkeypatch) -> None:
    monkeypatch.setenv("CFS_STAGING_PROTECT_API", "true")
    monkeypatch.setenv("CFS_STAGING_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("CFS_ENABLE_DOCS", "false")
    import app.config

    app.config.get_settings.cache_clear()
    sys.modules.pop("app.main", None)
    app_main = importlib.import_module("app.main")
    client = TestClient(app_main.app)
    assert client.get("/health").status_code == 200
    assert client.get("/").status_code == 401
    assert client.get("/", headers={"X-CFS-Staging-Token": "test-token"}).status_code == 200


def test_readiness_route_uses_bounded_database_check(monkeypatch) -> None:
    monkeypatch.delenv("CFS_STAGING_PROTECT_API", raising=False)
    monkeypatch.delenv("CFS_STAGING_ACCESS_TOKEN", raising=False)
    import app.config

    app.config.get_settings.cache_clear()
    sys.modules.pop("app.main", None)
    app_main = importlib.import_module("app.main")
    monkeypatch.setattr(app_main, "verify_database_connection", lambda: None)
    assert TestClient(app_main.app).get("/health/ready").json()["status"] == "ready"


def test_cors_production_drops_wildcard() -> None:
    settings = Settings(APP_ENV="prod", CORS_ALLOWED_ORIGINS="*,https://example.com", _env_file=None)
    assert settings.cors_origin_list == ["https://example.com"]


def test_requirements_include_runtime_imports_and_azure_telemetry() -> None:
    reqs = _text(REQUIREMENTS)
    for package in ["azure-identity", "azure-monitor-opentelemetry", "numpy", "Pillow", "requests", "shapely"]:
        assert package in reqs


def test_telemetry_is_opt_in_and_uses_connection_string_only_when_enabled() -> None:
    telemetry = _text(TELEMETRY)
    assert "cfs_telemetry_enabled" in telemetry
    assert "applicationinsights_connection_string" in telemetry
    assert "configure_azure_monitor" in telemetry


def test_deployment_script_uses_managed_identity_key_vault_and_conservative_networking() -> None:
    script = _text(DEPLOY_SCRIPT)
    assert "--admin-enabled false" in script
    assert "--anonymous-pull-enabled" in script
    assert "AcrPull" in script
    assert "--registry-identity" in script
    assert "keyvaultref:" in script
    assert "CFS_DATABASE_AUTH_MODE=managed_identity" in script
    assert "CFS_API_AUTH_MODE=$(if ($EntraTenantId -and $EntraApiAudience)" in script
    assert "CFS_MODEL_LAB_SUMMARY_CACHE_TTL_SECONDS=21600" in script
    assert "CFS_STAGING_ACCESS_TOKEN=secretref:staging-token" in script
    assert "AllowAzureServicesForCfsApi" in script
    assert '"0.0.0.0"' in script
    assert "--min-replicas\", \"1\"" in script
    assert "--max-replicas\", \"1\"" in script


def test_smoke_runner_has_bounded_configurable_timeout() -> None:
    smoke = _text(SMOKE_SCRIPT)
    assert "--timeout-seconds" in smoke
    assert "timeout=self.timeout_seconds" in smoke


def test_prewarm_script_warms_model_lab_without_printing_token() -> None:
    prewarm = _text(PREWARM_SCRIPT)
    assert "/development/prediction/features/summary" in prewarm
    assert "cfs-staging-access-token" in prewarm
    assert "X-CFS-Staging-Token" in prewarm
    assert "Refusing to write prewarm output inside the repository" in prewarm
    assert "Write-Output $Token" not in prewarm


def test_entra_script_uses_scope_roles_and_safe_output() -> None:
    entra = _text(ENTRA_SCRIPT)
    assert "CFS.Access" in entra
    assert "CFS.Write" in entra
    assert "CFS.Admin" in entra
    assert "requiredResourceAccess" in entra
    assert "admin-consent" in entra
    assert "Refusing to write Entra output inside the repository" in entra
    assert "clientSecret" not in entra


def test_github_actions_deploy_uses_oidc_sha_tags_and_api_only() -> None:
    workflow = _text(WORKFLOW)
    assert "id-token: write" in workflow
    assert "azure/login@v2" in workflow
    assert "client-id: ${{ vars.AZURE_CLIENT_ID }}" in workflow
    assert ":$GITHUB_SHA" in workflow
    assert "--revision-suffix" in workflow
    assert "/health/ready" in workflow
    assert ":latest" not in workflow
    assert "vercel" not in workflow.lower()


def test_rollback_script_can_shift_traffic_and_verify_health() -> None:
    rollback = _text(ROLLBACK_SCRIPT)
    assert "containerapp revision list" in rollback
    assert '"containerapp", "revision", "activate"' in rollback
    assert '"containerapp", "ingress", "traffic", "set"' in rollback
    assert '"containerapp", "update"' in rollback
    assert "--image" in rollback
    assert "/health" in rollback


def test_no_embedded_secret_values_in_deployment_sources() -> None:
    joined = "\n".join(
        _text(path)
        for path in [
            DOCKERFILE,
            BACKEND_DOCKERIGNORE,
            ROOT_DOCKERIGNORE,
            MAIN,
            DATABASE,
            TELEMETRY,
            DEPLOY_SCRIPT,
            ROLLBACK_SCRIPT,
            SMOKE_SCRIPT,
            WORKFLOW,
        ]
    )
    assert not re.search(r"(?i)\\b[a-z][a-z0-9+.-]*://[^\\s/@:]+:[^\\s/@]+@", joined)
    assert not re.search(r"(?i)(password|token|secret|api[_-]?key)\\s*=\\s*['\"][^'\"]+['\"]", joined)
