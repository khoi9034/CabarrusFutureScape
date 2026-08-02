from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.product.audit import append_event
from app.product.models import background_jobs, new_id, utc_now
from app.product.principal import Permission, ProductPrincipal, authorize
from app.product.service import ProductValidationError

JobHandler = Callable[[str | None], str | None]


class JobProvider(Protocol):
    provider: str

    def submit(
        self,
        session: Session,
        principal: ProductPrincipal,
        *,
        job_type: str,
        idempotency_key: str,
        payload_reference: str | None = None,
        max_attempts: int = 1,
        request_id: str | None = None,
    ) -> dict[str, Any]: ...


class InlineJobProvider:
    provider = "inline"

    def __init__(self, handlers: dict[str, JobHandler] | None = None) -> None:
        self.handlers = handlers or {}

    def submit(
        self,
        session: Session,
        principal: ProductPrincipal,
        *,
        job_type: str,
        idempotency_key: str,
        payload_reference: str | None = None,
        max_attempts: int = 1,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        authorize(principal, Permission.ADMINISTER)
        existing = session.execute(
            select(background_jobs).where(background_jobs.c.idempotency_key == idempotency_key)
        ).mappings().first()
        if existing:
            return dict(existing)
        handler = self.handlers.get(job_type)
        if handler is None:
            raise ProductValidationError(f"No inline handler is registered for {job_type}.")
        now = utc_now()
        job_id = new_id()
        record = {
            "id": job_id,
            "organization_id": principal.organization_id,
            "job_type": job_type,
            "status": "running",
            "payload_reference": payload_reference,
            "result_reference": None,
            "idempotency_key": idempotency_key,
            "attempt": 1,
            "max_attempts": max(1, max_attempts),
            "retry_policy": {"mode": "manual", "automatic": False},
            "error": None,
            "created_by": principal.user_id,
            "created_at": now,
            "started_at": now,
            "completed_at": None,
        }
        session.execute(background_jobs.insert().values(**record))
        try:
            result_reference = handler(payload_reference)
            status, error = "completed", None
        except Exception as exc:
            # Persist the failure class, never handler text that may contain credentials.
            result_reference, status, error = None, "failed", f"{type(exc).__name__}: handler failed"
        completed = utc_now()
        session.execute(
            update(background_jobs)
            .where(background_jobs.c.id == job_id)
            .values(
                status=status,
                result_reference=result_reference,
                error=error,
                completed_at=completed,
            )
        )
        append_event(
            session,
            principal=principal,
            action="job_complete" if status == "completed" else "job_failed",
            object_type="background_jobs",
            object_id=job_id,
            outcome="success" if status == "completed" else "failed",
            details={"job_type": job_type, "attempt": 1},
            request_id=request_id,
        )
        return dict(
            session.execute(select(background_jobs).where(background_jobs.c.id == job_id)).mappings().one()
        )


class ExternalWorkerJobProvider:
    provider = "external_worker"

    def submit(self, *args, **kwargs):
        raise NotImplementedError("External worker submission requires a deployment-specific adapter.")
