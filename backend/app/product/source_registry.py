from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.product.audit import append_event
from app.product.models import data_sources, new_id, utc_now
from app.product.principal import Permission, ProductPrincipal, authorize, authorize_object
from app.product.service import ProductNotFound, ProductValidationError

SOURCE_STATUSES = frozenset(
    {
        "Available",
        "Available with limitations",
        "Missing",
        "Stale",
        "Validation failed",
        "Disabled",
        "Not required",
    }
)
REQUIRED_FIELDS = frozenset(
    {
        "domain",
        "source_name",
        "provider_system",
        "authority_level",
        "owner_role",
        "schema_version",
        "status",
        "ingestion_method",
    }
)
SOURCE_EVIDENCE_FIELDS = (
    "id",
    "domain",
    "source_name",
    "provider_system",
    "authority_level",
    "owner_role",
    "source_date",
    "ingestion_date",
    "validation_date",
    "expected_refresh",
    "schema_version",
    "sensitivity",
    "licensing",
    "status",
    "limitations",
    "ingestion_method",
)
SOURCE_EXPORT_LIMIT = 1000


def list_sources(
    session: Session,
    principal: ProductPrincipal,
    *,
    limit: int = SOURCE_EXPORT_LIMIT,
) -> list[dict[str, Any]]:
    authorize(principal, Permission.SOURCE_READ)
    statement = select(data_sources).order_by(data_sources.c.domain, data_sources.c.source_name)
    if principal.organization_id:
        statement = statement.where(data_sources.c.organization_id == principal.organization_id)
    else:
        statement = statement.where(data_sources.c.organization_id.is_(None))
    return [
        _source_evidence(dict(row))
        for row in session.execute(statement.limit(min(max(limit, 1), SOURCE_EXPORT_LIMIT + 1))).mappings()
    ]


def get_source(session: Session, principal: ProductPrincipal, source_id: str) -> dict[str, Any]:
    return _source_evidence(_source_record(session, principal, source_id))


def _source_record(session: Session, principal: ProductPrincipal, source_id: str) -> dict[str, Any]:
    row = session.execute(select(data_sources).where(data_sources.c.id == source_id)).mappings().first()
    if not row:
        raise ProductNotFound("Data source was not found.")
    result = dict(row)
    authorize_object(
        principal,
        Permission.SOURCE_READ,
        organization_id=result.get("organization_id"),
    )
    return result


def with_source_evidence(
    session: Session,
    principal: ProductPrincipal,
    context: Any,
) -> Any:
    """Replace claimed source evidence with organization-scoped registry facts."""

    if not isinstance(context, dict):
        return context
    result = dict(context)
    result.pop("source_evidence", None)
    if "source_ids" not in result:
        return result
    source_ids = result["source_ids"]
    if not isinstance(source_ids, list) or any(
        not isinstance(source_id, str) or not source_id.strip()
        for source_id in source_ids
    ):
        raise ProductValidationError("source_ids must be a list of non-empty source IDs.")
    normalized_ids = list(dict.fromkeys(source_id.strip() for source_id in source_ids))
    sources = [get_source(session, principal, source_id) for source_id in normalized_ids]
    result["source_ids"] = normalized_ids
    result["source_evidence"] = [_source_evidence(source) for source in sources]
    return result


def export_sources(
    session: Session,
    principal: ProductPrincipal,
) -> dict[str, Any]:
    sources = list_sources(session, principal, limit=SOURCE_EXPORT_LIMIT + 1)
    if len(sources) > SOURCE_EXPORT_LIMIT:
        raise ProductValidationError(
            f"Source registry export is limited to {SOURCE_EXPORT_LIMIT} records."
        )
    return {
        "schema_version": "1.0",
        "generated_at": utc_now().isoformat(),
        "source_count": len(sources),
        "sources": [_source_evidence(source) for source in sources],
    }


def create_source(
    session: Session,
    principal: ProductPrincipal,
    values: dict[str, Any],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    authorize(principal, Permission.SOURCE_WRITE)
    missing = sorted(field for field in REQUIRED_FIELDS if not values.get(field))
    if missing:
        raise ProductValidationError("Missing source fields: " + ", ".join(missing))
    if values["status"] not in SOURCE_STATUSES:
        raise ProductValidationError("Invalid data source status.")
    now = utc_now()
    allowed = {column.name for column in data_sources.c} - {
        "id",
        "organization_id",
        "created_by",
        "created_at",
        "updated_at",
    }
    source = {
        key: value for key, value in values.items() if key in allowed
    } | {
        "id": new_id(),
        "organization_id": principal.organization_id,
        "created_by": principal.user_id,
        "created_at": now,
        "updated_at": now,
    }
    session.execute(data_sources.insert().values(**source))
    append_event(
        session,
        principal=principal,
        action="source_create",
        object_type="data_sources",
        object_id=source["id"],
        details={"domain": source["domain"], "status": source["status"]},
        request_id=request_id,
    )
    return _source_evidence(source)


def update_source_status(
    session: Session,
    principal: ProductPrincipal,
    source_id: str,
    status: str,
    *,
    limitations: str | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    source = _source_record(session, principal, source_id)
    authorize_object(
        principal,
        Permission.SOURCE_WRITE,
        organization_id=source.get("organization_id"),
    )
    if status not in SOURCE_STATUSES:
        raise ProductValidationError("Invalid data source status.")
    session.execute(
        update(data_sources)
        .where(data_sources.c.id == source_id)
        .values(status=status, limitations=limitations, updated_at=utc_now())
    )
    append_event(
        session,
        principal=principal,
        action="source_status",
        object_type="data_sources",
        object_id=source_id,
        details={"status": status},
        request_id=request_id,
    )
    return get_source(session, principal, source_id)


def _source_evidence(source: dict[str, Any]) -> dict[str, Any]:
    return {
        field: value.isoformat() if isinstance(value, datetime) else value
        for field in SOURCE_EVIDENCE_FIELDS
        if (value := source.get(field)) is not None
    }
