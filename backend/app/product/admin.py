from __future__ import annotations

from typing import Any

from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.product.models import (
    audit_events,
    background_jobs,
    data_quality_results,
    data_sources,
    ingestion_runs,
    users,
    utc_now,
)
from app.product.audit import append_event
from app.product.principal import Permission, ProductPrincipal, Role, authorize
from app.product.service import ProductConflict, ProductNotFound
from migrations.runner import status as migration_status


def administration_summary(
    session: Session,
    principal: ProductPrincipal,
    settings: Settings,
) -> dict[str, Any]:
    authorize(principal, Permission.ADMINISTER)
    organization_id = principal.organization_id
    migration = migration_status(session.get_bind())
    return {
        "runtime": {
            "runtime_mode": settings.cfs_runtime_mode,
            "data_provider": settings.cfs_data_provider,
            "auth_mode": settings.cfs_auth_mode,
            "ai_provider": settings.cfs_ai_provider,
            "artifact_provider": settings.cfs_artifact_provider,
            "job_provider": settings.cfs_job_provider,
        },
        "migration": {
            "status": "current" if not migration["pending"] else "pending",
            "current_revision": migration["current"],
            "pending_count": len(migration["pending"]),
        },
        "sources": _source_summaries(session, organization_id, 100),
        "ingestion_runs": _recent(session, ingestion_runs, organization_id, 50),
        "quality_results": _quality_results(session, organization_id),
        "jobs": _recent(session, background_jobs, organization_id, 50),
        "audit": _recent(session, audit_events, organization_id, 50),
    }


def list_users(session: Session, principal: ProductPrincipal) -> list[dict[str, Any]]:
    authorize(principal, Permission.ADMINISTER)
    statement = (
        select(users)
        .where(_organization_clause(users, principal.organization_id))
        .order_by(users.c.display_name, users.c.id)
    )
    return [_sanitized_user(row) for row in session.execute(statement).mappings()]


def update_user_roles(
    session: Session,
    principal: ProductPrincipal,
    user_id: str,
    roles: list[Role],
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    authorize(principal, Permission.ADMINISTER)
    organization_users = list(
        session.execute(
            select(users)
            .where(_organization_clause(users, principal.organization_id))
            .order_by(users.c.id)
            .with_for_update()
        ).mappings()
    )
    target = next((row for row in organization_users if row["id"] == user_id), None)
    if target is None:
        raise ProductNotFound("User was not found.")

    old_roles = sorted({str(role) for role in (target["roles"] or [])})
    requested = set(roles)
    new_roles = [role.value for role in Role if role in requested]
    if (
        target["status"] == "Active"
        and Role.ADMINISTRATOR.value in old_roles
        and Role.ADMINISTRATOR.value not in new_roles
        and sum(
            row["status"] == "Active"
            and Role.ADMINISTRATOR.value in (row["roles"] or [])
            for row in organization_users
        )
        == 1
    ):
        raise ProductConflict("The last active Administrator cannot lose that role.")

    updated_at = utc_now()
    session.execute(
        update(users)
        .where(users.c.id == user_id)
        .values(roles=new_roles, updated_at=updated_at)
    )
    if old_roles != sorted(new_roles):
        append_event(
            session,
            principal=principal,
            action="role_change",
            object_type="users",
            object_id=user_id,
            details={"old_roles": old_roles, "new_roles": new_roles},
            request_id=request_id,
        )
    return _sanitized_user({**dict(target), "roles": new_roles, "updated_at": updated_at})


def _organization_clause(table, organization_id: str | None):
    return (
        table.c.organization_id == organization_id
        if organization_id is not None
        else table.c.organization_id.is_(None)
    )


def _sanitized_user(row) -> dict[str, Any]:
    return {
        key: row[key]
        for key in ("id", "email", "display_name", "roles", "status", "created_at", "updated_at")
    }


def _recent(session: Session, table, organization_id: str | None, limit: int) -> list[dict[str, Any]]:
    clauses = []
    if "organization_id" in table.c:
        clauses.append(
            table.c.organization_id == organization_id
            if organization_id
            else table.c.organization_id.is_(None)
        )
    statement = select(table)
    if clauses:
        statement = statement.where(*clauses)
    timestamp = "created_at" if "created_at" in table.c else tuple(table.primary_key.columns)[0].name
    rows = session.execute(statement.order_by(table.c[timestamp].desc()).limit(limit)).mappings()
    return [dict(row) for row in rows]


def _quality_results(session: Session, organization_id: str | None) -> list[dict[str, Any]]:
    rows = _recent(session, data_quality_results, organization_id, 100)
    return [
        {
            **row,
            "rule_name": row.get("rule_id"),
            "failed_count": 1 if row.get("status") == "failed" else 0,
        }
        for row in rows
    ]


def _source_summaries(
    session: Session,
    organization_id: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    sources = _recent(session, data_sources, organization_id, limit)
    if not sources:
        return []

    source_ids = [source["id"] for source in sources]
    ranked_runs = (
        select(
            ingestion_runs.c.id,
            ingestion_runs.c.source_id,
            ingestion_runs.c.status,
            ingestion_runs.c.input_rows,
            ingestion_runs.c.started_at,
            ingestion_runs.c.completed_at,
            ingestion_runs.c.created_at,
            func.row_number()
            .over(
                partition_by=ingestion_runs.c.source_id,
                order_by=(ingestion_runs.c.created_at.desc(), ingestion_runs.c.id.desc()),
            )
            .label("rank"),
        )
        .where(
            ingestion_runs.c.source_id.in_(source_ids),
            _organization_clause(ingestion_runs, organization_id),
        )
        .subquery()
    )
    latest_runs = {
        row["source_id"]: dict(row)
        for row in session.execute(
            select(ranked_runs).where(ranked_runs.c.rank == 1)
        ).mappings()
    }
    run_ids = [run["id"] for run in latest_runs.values()]
    quality_by_run: dict[str, dict[str, Any]] = {}
    if run_ids:
        quality_by_run = {
            row["ingestion_run_id"]: dict(row)
            for row in session.execute(
                select(
                    data_quality_results.c.ingestion_run_id,
                    func.count().label("check_count"),
                    func.sum(
                        case(
                            (func.lower(data_quality_results.c.status) == "failed", 1),
                            else_=0,
                        )
                    ).label("failed_count"),
                    func.sum(
                        case(
                            (
                                func.lower(data_quality_results.c.status).notin_(
                                    ("passed", "failed")
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ).label("review_count"),
                )
                .where(
                    data_quality_results.c.ingestion_run_id.in_(run_ids),
                    _organization_clause(data_quality_results, organization_id),
                )
                .group_by(data_quality_results.c.ingestion_run_id)
            ).mappings()
        }

    enriched = []
    for source in sources:
        latest_run = latest_runs.get(source["id"])
        quality = quality_by_run.get(latest_run["id"]) if latest_run else None
        enriched.append(
            {
                **source,
                "freshness_status": source.get("status"),
                "refresh_cadence": source.get("expected_refresh"),
                "latest_ingestion_run_id": latest_run["id"] if latest_run else None,
                "last_ingestion_at": (
                    latest_run["completed_at"]
                    or latest_run["started_at"]
                    or latest_run["created_at"]
                    if latest_run
                    else None
                ),
                "row_count": latest_run["input_rows"] if latest_run else None,
                "validation_status": _validation_status(latest_run, quality),
            }
        )
    return enriched


def _validation_status(
    latest_run: dict[str, Any] | None,
    quality: dict[str, Any] | None,
) -> str:
    if latest_run is None:
        return "Not checked"
    if str(latest_run["status"]).casefold() in {"failed", "validation failed"}:
        return "Failed"
    if quality:
        if int(quality["failed_count"] or 0):
            return "Failed"
        if int(quality["review_count"] or 0):
            return "Review required"
        if int(quality["check_count"] or 0):
            return "Passed"
    return str(latest_run["status"])
