from __future__ import annotations

from fastapi import Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from app.main import app
from app.product.models import ask_cfs_messages, audit_events, planning_snapshots
from app.product.principal import (
    AuthorizationError,
    Permission,
    ProductPrincipal,
    ROLE_PERMISSIONS,
    Role,
    authorize_object,
)
from app.product.router import database_session, get_product_principal
from app.product.service import ProductConflict, ProductNotFound, ProductService


def test_role_permission_matrix_is_explicit() -> None:
    assert "investments:write" not in {permission.value for permission in Permission}
    assert Permission.PLANNING_WRITE in ROLE_PERMISSIONS[Role.PLANNER]
    assert Permission.ECONOMICS_WRITE in ROLE_PERMISSIONS[Role.ANALYST]
    assert Permission.MASTER_DATA_VIEW in ROLE_PERMISSIONS[Role.PLANNER]
    assert Permission.MASTER_DATA_EXPORT in ROLE_PERMISSIONS[Role.PLANNER]
    assert Permission.MASTER_DATA_VIEW in ROLE_PERMISSIONS[Role.ANALYST]
    assert Permission.MASTER_DATA_EXPORT in ROLE_PERMISSIONS[Role.ANALYST]
    assert Permission.REPORT_WRITE in ROLE_PERMISSIONS[Role.REPORT_AUTHOR]
    assert Permission.INGESTION_APPLY in ROLE_PERMISSIONS[Role.DATA_STEWARD]
    assert Permission.ADMINISTER in ROLE_PERMISSIONS[Role.ADMINISTRATOR]
    assert Permission.MASTER_DATA_VIEW in ROLE_PERMISSIONS[Role.ADMINISTRATOR]
    assert Permission.MASTER_DATA_EXPORT in ROLE_PERMISSIONS[Role.ADMINISTRATOR]
    assert Permission.PROJECT_WRITE not in ROLE_PERMISSIONS[Role.VIEWER]
    for role in (Role.VIEWER, Role.REPORT_AUTHOR, Role.DATA_STEWARD):
        assert Permission.MASTER_DATA_VIEW not in ROLE_PERMISSIONS[role]
        assert Permission.MASTER_DATA_EXPORT not in ROLE_PERMISSIONS[role]


@pytest.mark.parametrize(
    ("role", "allowed", "denied"),
    [
        (Role.VIEWER, Permission.READ_DATA, Permission.PROJECT_WRITE),
        (Role.PLANNER, Permission.PLANNING_WRITE, Permission.ECONOMICS_WRITE),
        (Role.ANALYST, Permission.ECONOMICS_WRITE, Permission.INGESTION_APPLY),
        (Role.REPORT_AUTHOR, Permission.REPORT_WRITE, Permission.PLANNING_WRITE),
        (Role.DATA_STEWARD, Permission.INGESTION_APPLY, Permission.REPORT_WRITE),
        (Role.ADMINISTRATOR, Permission.ADMINISTER, None),
    ],
)
def test_all_six_roles_allow_deny_and_cannot_cross_organizations(
    role,
    allowed,
    denied,
    identities,
) -> None:
    principal = ProductPrincipal(
        subject=role.value,
        roles=frozenset({role}),
        organization_id=identities["organization_id"],
        user_id=identities["user_id"],
        authenticated=True,
    )
    authorize_object(
        principal,
        allowed,
        organization_id=identities["organization_id"],
    )
    if denied is not None:
        with pytest.raises(AuthorizationError):
            authorize_object(
                principal,
                denied,
                organization_id=identities["organization_id"],
            )
    with pytest.raises(AuthorizationError, match="another organization"):
        authorize_object(
            principal,
            allowed,
            organization_id=identities["other_organization_id"],
        )


def test_empty_project_membership_is_not_all_access(identities) -> None:
    viewer = ProductPrincipal(
        subject="viewer",
        roles=frozenset({Role.VIEWER}),
        organization_id=identities["organization_id"],
        user_id=identities["user_id"],
        authenticated=True,
    )
    try:
        authorize_object(
            viewer,
            Permission.READ_DATA,
            organization_id=identities["organization_id"],
            project_id="not-a-member",
        )
    except AuthorizationError as exc:
        assert "inaccessible project" in str(exc)
    else:
        raise AssertionError("Empty project membership must not grant all-project access.")


def test_viewer_reads_only_approved_work_and_own_ask_conversations(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    admin_service = ProductService(product_session, administrator)
    project = admin_service.create("projects", {"name": "Approved project", "status": "Approved"})
    draft = admin_service.create(
        "reports",
        {"project_id": project["id"], "report_type": "Planning", "title": "Draft", "status": "Draft"},
    )
    approved = admin_service.create(
        "reports",
        {"project_id": project["id"], "report_type": "Planning", "title": "Approved", "status": "Approved"},
    )
    draft_bucket = admin_service.create(
        "report_bucket_items",
        {
            "project_id": project["id"],
            "report_id": draft["id"],
            "object_type": "planning_snapshot",
            "object_id": "draft-item",
            "title": "Draft report item",
        },
    )
    approved_bucket = admin_service.create(
        "report_bucket_items",
        {
            "project_id": project["id"],
            "report_id": approved["id"],
            "object_type": "planning_snapshot",
            "object_id": "approved-item",
            "title": "Approved report item",
        },
    )
    viewer = principal_factory(Role.VIEWER, project_ids=frozenset({project["id"]}))
    viewer_service = ProductService(product_session, viewer)

    with pytest.raises(ProductNotFound):
        viewer_service.get("reports", draft["id"])
    assert viewer_service.get("reports", approved["id"])["id"] == approved["id"]
    rows, total = viewer_service.list("reports", project_id=project["id"])
    assert [row["id"] for row in rows] == [approved["id"]]
    assert total == 1
    with pytest.raises(ProductNotFound):
        viewer_service.get("report_bucket_items", draft_bucket["id"])
    assert viewer_service.get("report_bucket_items", approved_bucket["id"])["id"] == approved_bucket["id"]
    bucket, total = viewer_service.list("report_bucket_items", project_id=project["id"])
    assert [row["id"] for row in bucket] == [approved_bucket["id"]]
    assert total == 1

    conversation = viewer_service.create(
        "ask_cfs_conversations",
        {"title": "Viewer's own question"},
    )
    assert viewer_service.get("ask_cfs_conversations", conversation["id"])["id"] == conversation["id"]
    conversations, total = viewer_service.list("ask_cfs_conversations")
    assert [row["id"] for row in conversations] == [conversation["id"]]
    assert total == 1


def test_create_rejects_missing_and_cross_organization_projects_for_administrator(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    other_administrator = principal_factory(
        Role.ADMINISTRATOR,
        other_organization=True,
    )
    other_project = ProductService(product_session, other_administrator).create(
        "projects",
        {"name": "Other organization project"},
    )
    service = ProductService(product_session, administrator)

    with pytest.raises(ProductNotFound, match="Referenced project"):
        service.create(
            "planning_snapshots",
            {"project_id": "missing-project", "title": "Missing project"},
        )
    with pytest.raises(AuthorizationError, match="another organization"):
        service.create(
            "planning_snapshots",
            {"project_id": other_project["id"], "title": "Cross-org snapshot"},
        )

    assert product_session.scalar(select(planning_snapshots.c.id)) is None


def test_update_rejects_cross_organization_project_for_administrator(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    other_administrator = principal_factory(
        Role.ADMINISTRATOR,
        other_organization=True,
    )
    service = ProductService(product_session, administrator)
    project = service.create("projects", {"name": "Current organization project"})
    other_project = ProductService(product_session, other_administrator).create(
        "projects",
        {"name": "Other organization project"},
    )
    snapshot = service.create(
        "planning_snapshots",
        {"project_id": project["id"], "title": "Scoped snapshot"},
    )

    with pytest.raises(AuthorizationError, match="another organization"):
        service.update(
            "planning_snapshots",
            snapshot["id"],
            {"project_id": other_project["id"]},
        )

    assert service.get("planning_snapshots", snapshot["id"])["project_id"] == project["id"]


def test_report_bucket_references_remain_in_the_report_organization_and_project(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    service = ProductService(product_session, administrator)
    project = service.create("projects", {"name": "Report project"})
    other_project = service.create("projects", {"name": "Other project"})
    report = service.create(
        "reports",
        {"project_id": project["id"], "report_type": "Planning", "title": "Scoped report"},
    )
    bucket = service.create(
        "report_bucket_items",
        {
            "report_id": report["id"],
            "object_type": "planning_snapshot",
            "object_id": "snapshot-1",
            "title": "Derived project scope",
        },
    )
    assert bucket["project_id"] == project["id"]

    with pytest.raises(ProductConflict, match="does not match"):
        service.create(
            "report_bucket_items",
            {
                "project_id": other_project["id"],
                "report_id": report["id"],
                "object_type": "planning_snapshot",
                "object_id": "snapshot-2",
                "title": "Mismatched scope",
            },
        )

    other_administrator = principal_factory(Role.ADMINISTRATOR, other_organization=True)
    other_report = ProductService(product_session, other_administrator).create(
        "reports",
        {"report_type": "Planning", "title": "Other organization report"},
    )
    with pytest.raises(AuthorizationError, match="another organization"):
        service.create(
            "report_bucket_items",
            {
                "report_id": other_report["id"],
                "object_type": "planning_snapshot",
                "object_id": "snapshot-3",
                "title": "Cross-organization scope",
            },
        )


def test_denied_api_write_has_standard_error_and_append_only_audit(
    session_factory,
    identities,
    principal_factory,
) -> None:
    viewer = principal_factory(Role.VIEWER)

    def override_session():
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def override_principal(request: Request):
        request.state.product_principal = viewer
        return viewer

    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/v1/projects",
                json={"name": "Denied project"},
                headers={"X-Request-ID": "denial-123"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.headers["X-Request-ID"] == "denial-123"
    assert response.json()["error"]["code"] == "forbidden"
    assert response.json()["request_id"] == "denial-123"
    with session_factory() as session:
        event = session.execute(
            select(audit_events).where(audit_events.c.action == "authorization_denial")
        ).mappings().one()
    assert event["outcome"] == "denied"
    assert event["actor_user_id"] == identities["user_id"]
    assert event["details"] == {
        "method": "POST",
        "reason": "projects:write permission is required.",
    }


def test_ask_cfs_message_api_denies_principal_without_permission(
    session_factory,
    identities,
    monkeypatch,
    principal_factory,
) -> None:
    with session_factory.begin() as session:
        conversation = ProductService(
            session,
            principal_factory(Role.ADMINISTRATOR),
        ).create("ask_cfs_conversations", {"title": "Denied message target"})

    viewer = principal_factory(Role.VIEWER)
    monkeypatch.setitem(
        ROLE_PERMISSIONS,
        Role.VIEWER,
        ROLE_PERMISSIONS[Role.VIEWER] - {Permission.ASK_CFS},
    )

    def override_session():
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def override_principal(request: Request):
        request.state.product_principal = viewer
        return viewer

    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                f"/api/v1/ask-cfs/conversations/{conversation['id']}/messages",
                json={"role": "user", "safe_question": "This must be denied."},
                headers={"X-Request-ID": "ask-denial-123"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert response.json()["request_id"] == "ask-denial-123"
    with session_factory() as session:
        assert session.scalar(
            select(func.count()).select_from(ask_cfs_messages).where(
                ask_cfs_messages.c.conversation_id == conversation["id"]
            )
        ) == 0
