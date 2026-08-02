from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select

from app.auth import Principal
from app.config import Settings
from app.main import app
from app.product.admin import list_users, update_user_roles
from app.product.audit import list_events
from app.product.models import users
from app.product.principal import (
    AuthorizationError,
    Permission,
    ProductPrincipal,
    Role,
    authorize,
    current_principal,
)
from app.product.router import database_session, get_product_principal
from app.product.service import ProductConflict, ProductNotFound


def test_administrator_lists_only_sanitized_organization_users(
    product_session,
    identities,
    principal_factory,
) -> None:
    records = list_users(product_session, principal_factory(Role.ADMINISTRATOR))

    assert [record["id"] for record in records] == [identities["user_id"]]
    assert set(records[0]) == {
        "id",
        "email",
        "display_name",
        "roles",
        "status",
        "created_at",
        "updated_at",
    }
    assert "external_subject" not in records[0]


def test_administrator_changes_roles_and_audits_old_and_new_values(
    product_session,
    identities,
    principal_factory,
) -> None:
    managed_user_id = "00000000-0000-0000-0000-000000000011"
    product_session.execute(
        users.insert().values(
            id=managed_user_id,
            organization_id=identities["organization_id"],
            external_subject="managed-user",
            email="managed@example.test",
            display_name="Managed User",
            roles=[Role.VIEWER.value],
        )
    )
    administrator = principal_factory(Role.ADMINISTRATOR)

    result = update_user_roles(
        product_session,
        administrator,
        managed_user_id,
        [Role.PLANNER, Role.VIEWER],
        request_id="role-change-123",
    )

    assert result["roles"] == [Role.VIEWER.value, Role.PLANNER.value]
    assert product_session.scalar(
        select(users.c.roles).where(users.c.id == managed_user_id)
    ) == [Role.VIEWER.value, Role.PLANNER.value]
    events = list_events(
        product_session,
        organization_id=identities["organization_id"],
        action="role_change",
    )
    assert len(events) == 1
    assert events[0]["actor_user_id"] == identities["user_id"]
    assert events[0]["object_id"] == managed_user_id
    assert events[0]["request_id"] == "role-change-123"
    assert events[0]["details"] == {
        "old_roles": [Role.VIEWER.value],
        "new_roles": [Role.VIEWER.value, Role.PLANNER.value],
    }


def test_user_administration_denies_non_admin_and_hides_other_organizations(
    product_session,
    identities,
    principal_factory,
) -> None:
    viewer = principal_factory(Role.VIEWER)
    administrator = principal_factory(Role.ADMINISTRATOR)

    with pytest.raises(AuthorizationError):
        list_users(product_session, viewer)
    with pytest.raises(AuthorizationError):
        update_user_roles(
            product_session,
            viewer,
            identities["user_id"],
            [Role.VIEWER],
        )
    with pytest.raises(ProductNotFound):
        update_user_roles(
            product_session,
            administrator,
            identities["other_user_id"],
            [Role.ADMINISTRATOR],
        )


def test_last_active_organization_administrator_cannot_lose_role(
    product_session,
    identities,
    principal_factory,
) -> None:
    with pytest.raises(ProductConflict, match="last active Administrator"):
        update_user_roles(
            product_session,
            principal_factory(Role.ADMINISTRATOR),
            identities["user_id"],
            [Role.VIEWER],
        )

    assert product_session.scalar(
        select(users.c.roles).where(users.c.id == identities["user_id"])
    ) == [Role.ADMINISTRATOR.value]
    assert list_events(
        product_session,
        organization_id=identities["organization_id"],
        action="role_change",
    ) == []


def test_admin_user_routes_use_v1_envelopes_and_strict_role_values(
    session_factory,
    principal_factory,
) -> None:
    principal = principal_factory(Role.ADMINISTRATOR)

    def override_session() -> Generator:
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def override_principal(request: Request) -> ProductPrincipal:
        request.state.product_principal = principal
        return principal

    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            listing = client.get("/api/v1/admin/users")
            changed = client.patch(
                f"/api/v1/admin/users/{principal.user_id}/roles",
                json={"roles": [Role.ADMINISTRATOR.value, Role.VIEWER.value]},
            )
            invalid = client.patch(
                f"/api/v1/admin/users/{principal.user_id}/roles",
                json={"roles": ["Super Administrator"]},
            )
            extra = client.patch(
                f"/api/v1/admin/users/{principal.user_id}/roles",
                json={"roles": [Role.ADMINISTRATOR.value], "reason": "not accepted"},
            )
    finally:
        app.dependency_overrides.clear()

    assert listing.status_code == 200
    assert listing.json()["data"][0]["id"] == principal.user_id
    assert listing.json()["provenance"]["api_version"] == "v1"
    assert changed.status_code == 200
    assert changed.json()["data"]["roles"] == [Role.VIEWER.value, Role.ADMINISTRATOR.value]
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"
    assert extra.status_code == 422
    assert extra.json()["error"]["code"] == "validation_error"


def test_local_role_change_is_effective_on_the_next_request(
    monkeypatch,
    product_session,
    identities,
) -> None:
    _insert_backup_administrator(product_session, identities["organization_id"], "local")
    monkeypatch.setenv("CFS_LOCAL_DEV_SUBJECT", "test-user")
    monkeypatch.setenv("CFS_LOCAL_DEV_USER_ID", identities["user_id"])
    monkeypatch.setenv("CFS_LOCAL_DEV_ROLES", Role.ADMINISTRATOR.value)
    settings = Settings(
        CFS_RUNTIME_MODE="local",
        CFS_DATA_PROVIDER="local_api",
        CFS_AUTH_MODE="local_dev",
        CFS_ARTIFACT_PROVIDER="local_file",
        CFS_JOB_PROVIDER="inline",
        CFS_ORGANIZATION_ID=identities["organization_id"],
        _env_file=None,
    )

    before = current_principal(_request(), settings, product_session)
    authorize(before, Permission.ADMINISTER)
    update_user_roles(product_session, before, identities["user_id"], [Role.VIEWER])
    after = current_principal(_request(), settings, product_session)

    assert after.roles == frozenset({Role.VIEWER})
    authorize(after, Permission.READ_DATA)
    with pytest.raises(AuthorizationError):
        authorize(after, Permission.ADMINISTER)


def test_oidc_role_change_overrides_token_role_on_the_next_request(
    product_session,
    identities,
) -> None:
    _insert_backup_administrator(product_session, identities["organization_id"], "oidc")
    settings = _enterprise_settings(identities["organization_id"])

    before = current_principal(
        _oidc_request(identities["user_id"], "test-user", identities["organization_id"]),
        settings,
        product_session,
    )
    authorize(before, Permission.ADMINISTER)
    update_user_roles(product_session, before, identities["user_id"], [Role.VIEWER])
    after = current_principal(
        _oidc_request(identities["user_id"], "test-user", identities["organization_id"]),
        settings,
        product_session,
    )

    assert after.roles == frozenset({Role.VIEWER})
    with pytest.raises(AuthorizationError):
        authorize(after, Permission.ADMINISTER)


def test_oidc_never_loads_roles_from_another_organization(
    product_session,
    identities,
) -> None:
    product_session.execute(
        users.update()
        .where(users.c.id == identities["other_user_id"])
        .values(roles=[Role.ADMINISTRATOR.value])
    )

    with pytest.raises(AuthorizationError, match="another organization"):
        current_principal(
            _oidc_request(
                identities["other_user_id"],
                "other-user",
                identities["other_organization_id"],
            ),
            _enterprise_settings(identities["organization_id"]),
            product_session,
        )


def _insert_backup_administrator(product_session, organization_id: str, suffix: str) -> None:
    product_session.execute(
        users.insert().values(
            id=f"backup-{suffix}",
            organization_id=organization_id,
            external_subject=f"backup-{suffix}",
            display_name="Backup Administrator",
            roles=[Role.ADMINISTRATOR.value],
        )
    )


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/api/v1/me", "headers": []})


def _oidc_request(user_id: str, subject: str, organization_id: str) -> Request:
    request = _request()
    request.state.cfs_principal = Principal(
        object_id=subject,
        user_id=user_id,
        organization_id=organization_id,
        roles={"CFS.Admin"},
        scopes={"CFS.Access"},
    )
    return request


def _enterprise_settings(organization_id: str) -> Settings:
    return Settings(
        CFS_RUNTIME_MODE="enterprise",
        CFS_DATA_PROVIDER="enterprise_api",
        CFS_AUTH_MODE="oidc",
        CFS_ARTIFACT_PROVIDER="object_storage",
        CFS_JOB_PROVIDER="external_worker",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        CFS_ORGANIZATION_ID=organization_id,
        CFS_CORS_ORIGINS="https://cfs.example.gov",
        _env_file=None,
    )
