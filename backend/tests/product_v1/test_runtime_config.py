from __future__ import annotations

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.auth import Principal
from app.config import Settings
from app.product.principal import Role, current_principal


def test_legacy_aliases_normalize_to_canonical_runtime_values() -> None:
    settings = Settings(
        CFS_RUNTIME_MODE="local",
        CFS_DATA_PROVIDER="local_postgis",
        CFS_API_AUTH_MODE="entra",
        CFS_ARTIFACT_PROVIDER="local_file",
        CFS_JOB_PROVIDER="inline",
    )
    assert settings.cfs_data_provider == "local_api"
    assert settings.cfs_auth_mode == "oidc"
    assert settings.cfs_api_auth_mode == "entra"


def test_invalid_enterprise_matrix_fails_early() -> None:
    with pytest.raises(ValidationError, match="Invalid enterprise runtime configuration"):
        Settings(
            CFS_RUNTIME_MODE="enterprise",
            CFS_DATA_PROVIDER="static",
            CFS_AUTH_MODE="off",
            CFS_ARTIFACT_PROVIDER="public_static",
            CFS_JOB_PROVIDER="inline",
        )


def test_enterprise_requires_complete_single_organization_oidc_config() -> None:
    with pytest.raises(
        ValidationError,
        match="CFS_ENTRA_TENANT_ID.*CFS_ENTRA_API_AUDIENCE.*CFS_ORGANIZATION_ID",
    ):
        Settings(
            CFS_RUNTIME_MODE="enterprise",
            CFS_DATA_PROVIDER="enterprise_api",
            CFS_AUTH_MODE="oidc",
            CFS_ARTIFACT_PROVIDER="object_storage",
            CFS_JOB_PROVIDER="external_worker",
            CFS_ENTRA_TENANT_ID="",
            CFS_ENTRA_API_AUDIENCE="",
            CFS_ORGANIZATION_ID="",
            CFS_CORS_ORIGINS="https://cfs.example.gov",
            _env_file=None,
        )


def test_enterprise_principal_derives_user_from_stable_subject() -> None:
    request = Request({"type": "http", "method": "GET", "path": "/api/v1/me", "headers": []})
    request.state.cfs_principal = Principal(
        object_id="entra-object-id",
        roles={"CFS.Read"},
        scopes={"CFS.Access"},
    )
    principal = current_principal(
        request,
        Settings(
            CFS_RUNTIME_MODE="enterprise",
            CFS_DATA_PROVIDER="enterprise_api",
            CFS_AUTH_MODE="oidc",
            CFS_ARTIFACT_PROVIDER="object_storage",
            CFS_JOB_PROVIDER="external_worker",
            CFS_ENTRA_TENANT_ID="tenant-id",
            CFS_ENTRA_API_AUDIENCE="api://cfs-api",
            CFS_ORGANIZATION_ID="organization-id",
            CFS_CORS_ORIGINS="https://cfs.example.gov",
            _env_file=None,
        ),
    )
    assert principal.subject == "entra-object-id"
    assert principal.user_id == "entra-object-id"
    assert principal.organization_id == "organization-id"
    assert principal.roles == frozenset({Role.VIEWER})


@pytest.mark.parametrize(
    "origins",
    [
        "",
        "*",
        "https://*.example.gov",
        "http://cfs.example.gov",
        "https://localhost",
        "https://localhost.",
        "https://127.0.0.1",
        "https://127.0.0.1.",
        "https://cfs.example.gov/path",
        "https://cfs.example.gov?preview=true",
    ],
)
def test_enterprise_rejects_unsafe_or_non_origin_cors_values(origins: str) -> None:
    with pytest.raises(ValidationError, match="explicit exact HTTPS CFS_CORS_ORIGINS"):
        Settings(
            CFS_RUNTIME_MODE="enterprise",
            CFS_DATA_PROVIDER="enterprise_api",
            CFS_AUTH_MODE="oidc",
            CFS_ARTIFACT_PROVIDER="object_storage",
            CFS_JOB_PROVIDER="external_worker",
            CFS_ENTRA_TENANT_ID="tenant-id",
            CFS_ENTRA_API_AUDIENCE="api://cfs-api",
            CFS_ORGANIZATION_ID="organization-id",
            CFS_CORS_ORIGINS=origins,
            _env_file=None,
        )


def test_enterprise_accepts_only_the_configured_exact_https_origins() -> None:
    settings = Settings(
        CFS_RUNTIME_MODE="enterprise",
        CFS_DATA_PROVIDER="enterprise_api",
        CFS_AUTH_MODE="oidc",
        CFS_ARTIFACT_PROVIDER="object_storage",
        CFS_JOB_PROVIDER="external_worker",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        CFS_ORGANIZATION_ID="organization-id",
        CFS_CORS_ORIGINS="https://cfs.example.gov,https://admin.example.gov:8443",
        _env_file=None,
    )
    assert settings.cors_origin_list == [
        "https://cfs.example.gov",
        "https://admin.example.gov:8443",
    ]


def test_local_auth_off_still_uses_trusted_local_principal(monkeypatch) -> None:
    monkeypatch.setenv("CFS_LOCAL_DEV_ROLES", Role.PLANNER.value)
    request = Request({"type": "http", "method": "GET", "path": "/api/v1/me", "headers": []})
    principal = current_principal(
        request,
        Settings(
            CFS_RUNTIME_MODE="local",
            CFS_DATA_PROVIDER="local_api",
            CFS_AUTH_MODE="off",
            CFS_ARTIFACT_PROVIDER="local_file",
            CFS_JOB_PROVIDER="inline",
        ),
    )
    assert principal.authenticated is True
    assert principal.roles == frozenset({Role.PLANNER})
