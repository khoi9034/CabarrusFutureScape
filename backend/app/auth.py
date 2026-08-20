from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import jwt
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError

from app.config import Settings

RoutePolicy = Literal["public", "read", "write", "admin"]

PUBLIC_PATHS = {"/health", "/health/ready", "/health/database"}
ADMIN_PATHS = {"/economics/export-diagnostics"}


@dataclass(frozen=True)
class Principal:
    object_id: str
    roles: set[str]
    scopes: set[str]
    organization_id: str | None = None
    user_id: str | None = None
    project_ids: set[str] | None = None


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def classify_route(path: str, method: str) -> RoutePolicy:
    normalized = path.removeprefix("/api/v1") or "/"
    if normalized in PUBLIC_PATHS or method == "OPTIONS":
        return "public"
    if normalized in ADMIN_PATHS or normalized.startswith("/ops/"):
        return "admin"
    return "read"


def authenticate_bearer_token(token: str, settings: Settings, policy: RoutePolicy) -> Principal:
    if not token:
        raise AuthError(401, "Authentication required.")
    if not settings.cfs_entra_tenant_id or not settings.cfs_entra_api_audience:
        raise AuthError(503, "Authentication is not configured.")

    try:
        claims = jwt.decode(
            token,
            _jwks_client(settings).get_signing_key_from_jwt(token).key,
            algorithms=["RS256"],
            audience=settings.cfs_entra_api_audience,
            issuer=_entra_issuer(settings.cfs_entra_tenant_id),
            options={"require": ["aud", "exp", "iss"]},
        )
    except (InvalidTokenError, PyJWKClientError) as exc:
        raise AuthError(401, "Invalid authentication token.") from exc

    object_id = str(claims.get("oid") or claims.get("sub") or "").strip()
    if not object_id:
        raise AuthError(401, "Authentication token is missing a stable subject.")
    claimed_organization_id = str(claims.get("cfs_organization_id") or "").strip()
    if (
        settings.cfs_organization_id
        and claimed_organization_id
        and claimed_organization_id != settings.cfs_organization_id
    ):
        raise AuthError(403, "Authentication token belongs to another organization.")
    principal = Principal(
        object_id=object_id,
        roles=_claim_set(claims.get("roles")),
        scopes=set(str(claims.get("scp") or "").split()),
        organization_id=settings.cfs_organization_id or claimed_organization_id or None,
        user_id=str(claims.get("cfs_user_id") or "").strip() or object_id,
        project_ids=_claim_set(claims.get("cfs_project_ids")) or None,
    )
    _authorize_principal(principal, settings, policy)
    return principal


def _authorize_principal(principal: Principal, settings: Settings, policy: RoutePolicy) -> None:
    allowed_ids = settings.entra_allowed_object_id_set
    if allowed_ids and principal.object_id.lower() not in allowed_ids:
        raise AuthError(403, "Account is not authorized for CFS staging.")

    required_scope = settings.cfs_entra_required_scope
    if required_scope and required_scope not in principal.scopes and required_scope not in principal.roles:
        raise AuthError(403, "Required API scope is missing.")

    if policy == "write" and settings.cfs_entra_write_role and settings.cfs_entra_write_role not in principal.roles:
        raise AuthError(403, "Write access is required.")

    if policy == "admin" and settings.cfs_entra_admin_role and settings.cfs_entra_admin_role not in principal.roles:
        raise AuthError(403, "Administrator access is required.")


def _entra_issuer(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}/v2.0"


def _jwks_client(settings: Settings) -> PyJWKClient:
    return PyJWKClient(f"{_entra_issuer(settings.cfs_entra_tenant_id)}/discovery/v2.0/keys")


def _claim_set(value: object) -> set[str]:
    if isinstance(value, str):
        return {item for item in value.split() if item}
    if isinstance(value, (list, tuple, set)):
        return {str(item) for item in value if str(item)}
    return set()
