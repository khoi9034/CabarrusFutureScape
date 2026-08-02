from __future__ import annotations

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.product.audit import append_event, list_events
from app.product.models import audit_events
from app.product.principal import Role


def test_audit_redacts_sensitive_values_and_is_append_only(
    session_factory,
    identities,
    principal_factory,
) -> None:
    principal = principal_factory(Role.ADMINISTRATOR)
    with session_factory() as session:
        event = append_event(
            session,
            principal=principal,
            action="configuration_review",
            object_type="runtime",
            object_id="runtime-config",
            details={
                "safe": "retained",
                "nested": {"authorization": "Bearer secret", "api_key": "secret-key"},
            },
            request_id="audit-1",
        )
        session.commit()
        stored = session.execute(
            select(audit_events).where(audit_events.c.id == event["id"])
        ).mappings().one()
        assert stored["details"] == {
            "safe": "retained",
            "nested": {"authorization": "<redacted>", "api_key": "<redacted>"},
        }
        append_event(
            session,
            principal=principal,
            action="other_action",
            object_type="runtime",
            object_id="other-object",
        )
        session.commit()
        filtered = list_events(
            session,
            organization_id=identities["organization_id"],
            object_id=event["object_id"],
            action="configuration_review",
        )
        assert [item["id"] for item in filtered] == [event["id"]]

        with pytest.raises(SQLAlchemyError, match="append-only"):
            session.execute(
                update(audit_events)
                .where(audit_events.c.id == event["id"])
                .values(outcome="changed")
            )
        session.rollback()

        with pytest.raises(SQLAlchemyError, match="append-only"):
            session.execute(delete(audit_events).where(audit_events.c.id == event["id"]))
        session.rollback()

        assert session.scalar(
            select(audit_events.c.outcome).where(audit_events.c.id == event["id"])
        ) == "success"
