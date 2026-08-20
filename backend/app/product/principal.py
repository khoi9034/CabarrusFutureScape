from __future__ import annotations

import os
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any, Protocol

from fastapi import HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.product.models import users


class Role(StrEnum):
    VIEWER = "Viewer"
    PLANNER = "Planner"
    ANALYST = "Analyst"
    REPORT_AUTHOR = "Report Author"
    DATA_STEWARD = "Data Steward"
    ADMINISTRATOR = "Administrator"


class Permission(StrEnum):
    READ_DATA = "data:read"
    ASK_CFS = "ask_cfs:use"
    PLANNING_WRITE = "planning:write"
    ECONOMICS_WRITE = "economics:write"
    PROJECT_WRITE = "projects:write"
    REPORT_READ = "reports:read"
    REPORT_WRITE = "reports:write"
    SOURCE_READ = "sources:read"
    SOURCE_WRITE = "sources:write"
    INGESTION_DRY_RUN = "ingestion:dry_run"
    INGESTION_APPLY = "ingestion:apply"
    ARTIFACT_DOWNLOAD = "artifacts:download"
    AUDIT_READ = "audit:read"
    ADMINISTER = "administration:write"
    MASTER_DATA_VIEW = "master_data:view"
    MASTER_DATA_EXPORT = "master_data:export"


_VIEWER = {
    Permission.READ_DATA,
    Permission.ASK_CFS,
    Permission.REPORT_READ,
    Permission.SOURCE_READ,
}
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.VIEWER: frozenset(_VIEWER),
    Role.PLANNER: frozenset(
        _VIEWER
        | {
            Permission.MASTER_DATA_EXPORT,
            Permission.MASTER_DATA_VIEW,
            Permission.PROJECT_WRITE,
            Permission.PLANNING_WRITE,
            Permission.REPORT_WRITE,
        }
    ),
    Role.ANALYST: frozenset(
        _VIEWER
        | {
            Permission.ECONOMICS_WRITE,
            Permission.MASTER_DATA_EXPORT,
            Permission.MASTER_DATA_VIEW,
            Permission.PROJECT_WRITE,
            Permission.REPORT_WRITE,
        }
    ),
    Role.REPORT_AUTHOR: frozenset(
        _VIEWER | {Permission.REPORT_WRITE, Permission.ARTIFACT_DOWNLOAD}
    ),
    Role.DATA_STEWARD: frozenset(
        _VIEWER
        | {
            Permission.SOURCE_WRITE,
            Permission.INGESTION_DRY_RUN,
            Permission.INGESTION_APPLY,
        }
    ),
    Role.ADMINISTRATOR: frozenset(Permission),
}


@dataclass(frozen=True)
class ProductPrincipal:
    subject: str
    roles: frozenset[Role]
    organization_id: str | None = None
    user_id: str | None = None
    project_ids: frozenset[str] = frozenset()
    authenticated: bool = False

    @property
    def permissions(self) -> frozenset[Permission]:
        return frozenset().union(*(ROLE_PERMISSIONS[role] for role in self.roles))


class PrincipalAdapter(Protocol):
    def principal(self) -> ProductPrincipal: ...


class LocalDevelopmentPrincipalAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def principal(self) -> ProductPrincipal:
        raw_roles = os.getenv("CFS_LOCAL_DEV_ROLES", Role.ADMINISTRATOR.value).split(",")
        roles = _roles(raw_roles) or frozenset({Role.ADMINISTRATOR})
        return ProductPrincipal(
            subject=os.getenv("CFS_LOCAL_DEV_SUBJECT", "local-developer"),
            user_id=os.getenv("CFS_LOCAL_DEV_USER_ID") or None,
            organization_id=self.settings.cfs_organization_id or None,
            project_ids=frozenset(
                value.strip()
                for value in os.getenv("CFS_LOCAL_DEV_PROJECT_IDS", "").split(",")
                if value.strip()
            ),
            roles=roles,
            authenticated=True,
        )


class OidcPrincipalAdapter:
    def __init__(self, legacy_principal: Any, settings: Settings) -> None:
        self.legacy_principal = legacy_principal
        self.settings = settings

    def principal(self) -> ProductPrincipal:
        raw_roles = getattr(self.legacy_principal, "roles", set())
        aliases = {
            "CFS.Admin": Role.ADMINISTRATOR.value,
            "CFS.Write": Role.ANALYST.value,
            "CFS.Read": Role.VIEWER.value,
        }
        roles = _roles(aliases.get(str(role), str(role)) for role in raw_roles)
        subject = str(getattr(self.legacy_principal, "object_id", "")).strip()
        user_id = str(getattr(self.legacy_principal, "user_id", "") or subject).strip()
        organization_id = (
            self.settings.cfs_organization_id
            or getattr(self.legacy_principal, "organization_id", None)
        )
        if self.settings.cfs_runtime_mode == "enterprise" and not (
            subject and user_id and organization_id
        ):
            raise HTTPException(status_code=401, detail="Enterprise identity context is incomplete.")
        return ProductPrincipal(
            subject=subject,
            user_id=user_id or None,
            organization_id=organization_id,
            project_ids=frozenset(getattr(self.legacy_principal, "project_ids", None) or ()),
            roles=roles or frozenset({Role.VIEWER}),
            authenticated=True,
        )


class AuthorizationError(PermissionError):
    pass


def authorize(principal: ProductPrincipal, permission: Permission) -> None:
    if permission not in principal.permissions:
        raise AuthorizationError(f"{permission.value} permission is required.")


def authorize_object(
    principal: ProductPrincipal,
    permission: Permission,
    *,
    organization_id: str | None,
    project_id: str | None = None,
) -> None:
    authorize(principal, permission)
    if (
        organization_id
        and principal.organization_id != organization_id
    ):
        raise AuthorizationError("Object belongs to another organization.")
    if Role.ADMINISTRATOR in principal.roles:
        return
    if project_id and project_id not in principal.project_ids:
        raise AuthorizationError("Object belongs to an inaccessible project.")


def current_principal(
    request: Request,
    settings: Settings | None = None,
    session: Session | None = None,
) -> ProductPrincipal:
    settings = settings or get_settings()
    if settings.cfs_auth_mode == "oidc":
        legacy = getattr(request.state, "cfs_principal", None)
        if legacy is None:
            raise HTTPException(status_code=401, detail="Authentication required.")
        principal = OidcPrincipalAdapter(legacy, settings).principal()
    elif settings.cfs_auth_mode == "local_dev" or settings.cfs_runtime_mode == "local":
        principal = LocalDevelopmentPrincipalAdapter(settings).principal()
    else:
        principal = ProductPrincipal(subject="anonymous", roles=frozenset({Role.VIEWER}))
    if session is not None:
        principal = _persisted_principal(session, principal)
    request.state.product_principal = principal
    return principal


def require(permission: Permission):
    def dependency(request: Request) -> ProductPrincipal:
        principal = current_principal(request)
        try:
            authorize(principal, permission)
        except AuthorizationError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return principal

    return dependency


def _roles(values) -> frozenset[Role]:
    allowed = {role.value: role for role in Role}
    return frozenset(allowed[value.strip()] for value in values if value.strip() in allowed)


def _persisted_principal(session: Session, principal: ProductPrincipal) -> ProductPrincipal:
    if not principal.authenticated or not (principal.user_id or principal.subject):
        return principal
    matches = list(
        session.execute(
            select(
                users.c.id,
                users.c.organization_id,
                users.c.roles,
                users.c.status,
            ).where(
                or_(
                    users.c.id == principal.user_id,
                    users.c.external_subject == principal.subject,
                )
            )
        ).mappings()
    )
    if not matches:
        return principal
    if len(matches) != 1:
        raise AuthorizationError("Authenticated identity maps to multiple users.")
    user = matches[0]
    if user["organization_id"] != principal.organization_id:
        raise AuthorizationError("Mapped user belongs to another organization.")
    if user["status"] != "Active":
        raise AuthorizationError("Mapped user is not active.")
    return replace(
        principal,
        user_id=user["id"],
        roles=_roles(str(role) for role in (user["roles"] or [])),
    )
