from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import Connection, select
from sqlalchemy.orm import Session

from app.product.models import audit_events, new_id, utc_now
from app.product.principal import ProductPrincipal

SENSITIVE_KEY_TOKENS = {
    "authorization",
    "cookie",
    "credential",
    "credentials",
    "owner",
    "password",
    "secret",
    "token",
}
SENSITIVE_KEY_QUALIFIERS = {
    "access",
    "api",
    "client",
    "encryption",
    "license",
    "private",
    "public",
    "secret",
    "signing",
    "ssh",
    "subscription",
}
SENSITIVE_COMPOUND_KEYS = {
    "accesskey",
    "accesstoken",
    "apikey",
    "authtoken",
    "bearertoken",
    "clientkey",
    "clientsecret",
    "clienttoken",
    "connectionstring",
    "databaseurl",
    "encryptionkey",
    "hiddenprompt",
    "licensekey",
    "passwordhash",
    "privatekey",
    "publickey",
    "refreshtoken",
    "secretkey",
    "signingkey",
    "sshkey",
    "subscriptionkey",
}

SENSITIVE_TEXT_PATTERNS = (
    re.compile(
        r"(?i)\b(?:access[_ -]?token|api[_ -]?key|authorization|cookie|credentials?|database[_ -]?url|hidden[_ -]?prompt|password|secret|token)\b"
        r"\s*(?::|=|\bis\b)\s*(?:\"[^\"]*\"|'[^']*'|[^\r\n]+)"
    ),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
)


def redact_sensitive_text(value: str) -> str:
    for pattern in SENSITIVE_TEXT_PATTERNS:
        value = pattern.sub("<redacted>", value)
    return value


def redact(value: Any, *, key: str = "") -> Any:
    if _is_sensitive_key(key):
        return "<redacted>"
    if isinstance(value, Mapping):
        return {str(item_key): redact(item, key=str(item_key)) for item_key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return redact_sensitive_text(value)
    return value


def _is_sensitive_key(key: str) -> bool:
    camel_split = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    normalized = re.sub(r"[^a-z0-9]+", "_", camel_split.lower()).strip("_")
    if normalized == "owner_role":
        return False
    parts = set(normalized.split("_")) if normalized else set()
    return (
        normalized == "hidden_prompt"
        or normalized.replace("_", "") in SENSITIVE_COMPOUND_KEYS
        or bool(parts & SENSITIVE_KEY_TOKENS)
        or ("key" in parts and (parts == {"key"} or bool(parts & SENSITIVE_KEY_QUALIFIERS)))
    )


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
