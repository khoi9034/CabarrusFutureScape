from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import Connection, select
from sqlalchemy.orm import Session

from app.product.models import audit_events, new_id, utc_now
from app.product.principal import ProductPrincipal

SENSITIVE_TOKENS = (
    "authorization",
    "cookie",
    "credential",
    "hidden_prompt",
    "key",
    "owner",
    "password",
    "secret",
    "token",
)


def redact(value: Any, *, key: str = "") -> Any:
    normalized_key = key.lower()
    if normalized_key != "owner_role" and any(
        token in normalized_key for token in SENSITIVE_TOKENS
    ):
        return "<redacted>"
    if isinstance(value, Mapping):
        return {str(item_key): redact(item, key=str(item_key)) for item_key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact(item) for item in value]
    return value


def append_event(
    connection: Connection | Session,
    *,
    principal: ProductPrincipal,
    action: str,
    object_type: str,
    object_id: str | None = None,
    outcome: str = "success",
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    event = {
        "id": new_id(),
        "organization_id": principal.organization_id,
        "actor_user_id": principal.user_id,
        "request_id": request_id,
        "action": action,
        "object_type": object_type,
        "object_id": object_id,
        "outcome": outcome,
        "details": redact(details or {}),
        "created_at": utc_now(),
    }
    connection.execute(audit_events.insert().values(**event))
    return event


def list_events(
    connection: Connection | Session,
    *,
    organization_id: str | None,
    limit: int = 100,
    object_id: str | None = None,
    action: str | None = None,
) -> list[dict[str, Any]]:
    statement = select(audit_events).order_by(audit_events.c.created_at.desc()).limit(min(max(limit, 1), 250))
    if organization_id:
        statement = statement.where(audit_events.c.organization_id == organization_id)
    else:
        statement = statement.where(audit_events.c.organization_id.is_(None))
    if object_id:
        statement = statement.where(audit_events.c.object_id == object_id)
    if action:
        statement = statement.where(audit_events.c.action == action)
    return [dict(row) for row in connection.execute(statement).mappings()]
