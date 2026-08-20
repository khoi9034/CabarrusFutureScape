from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.product.models import (
    ask_cfs_messages,
    audit_events,
    economic_scenario_versions,
    planning_snapshot_versions,
    project_members,
)
from app.product.principal import Role
from app.product.service import ProductConflict, ProductService


def test_project_snapshot_version_archive_and_restart_persist(
    product_engine,
    product_session,
    identities,
    principal_factory,
) -> None:
    planner = principal_factory(Role.PLANNER)
    service = ProductService(product_session, planner, "persist-request")
    project = service.create("projects", {"name": "North Growth", "project_type": "Planning"})
    assert product_session.scalar(
        select(func.count()).select_from(project_members).where(
            project_members.c.project_id == project["id"],
            project_members.c.user_id == identities["user_id"],
        )
    ) == 1

    snapshot = service.create(
        "planning_snapshots",
        {
            "project_id": project["id"],
            "title": "Planning Snapshot",
            "included_sections": ["map", "schools"],
            "map_state": {
                "extent": [-80.8, 35.1, -80.4, 35.5],
                "key_findings": ["Preserve legitimate planning data"],
            },
            "payload": {
                "snapshot": {
                    "keyFacts": [{"label": "County", "value": "Cabarrus"}],
                }
            },
            "review_status": "Draft",
        },
    )
    assert snapshot["current_version"] == 1
    assert product_session.scalar(
        select(func.count()).select_from(planning_snapshot_versions).where(
            planning_snapshot_versions.c.snapshot_id == snapshot["id"]
        )
    ) == 1

    versioned = service.version("planning_snapshots", snapshot["id"], "Reviewed map extent")
    assert versioned["current_version"] == 2
    report_draft = service.create(
        "reports",
        {
            "project_id": project["id"],
            "report_type": "planning_snapshot_draft",
            "title": "Planning Snapshot report",
            "status": "Draft",
            "payload": {
                "source_snapshot_id": snapshot["id"],
                "selected_sections": {
                    "key_findings": True,
                    "map_view": True,
                    "schools": False,
                },
                "schema_version": "planning_snapshot_draft_v1",
            },
        },
    )
    report_draft = service.update(
        "reports",
        report_draft["id"],
        {"payload": {**report_draft["payload"], "report_notes": "Persisted report note"}},
        expected_updated_at=report_draft["updated_at"].isoformat(),
    )
    with pytest.raises(ProductConflict, match="changed after"):
        service.update(
            "planning_snapshots",
            snapshot["id"],
            {"notes": "stale write"},
            expected_updated_at="2000-01-01T00:00:00+00:00",
        )

    archived = service.archive("planning_snapshots", snapshot["id"])
    assert archived["archived_at"] is not None
    visible, _ = service.list("planning_snapshots", project_id=project["id"])
    archived_rows, _ = service.list(
        "planning_snapshots", project_id=project["id"], status="Archived"
    )
    assert visible == []
    assert [row["id"] for row in archived_rows] == [snapshot["id"]]
    product_session.commit()

    with Session(product_engine) as reopened:
        assert ProductService(reopened, planner).get("planning_snapshots", snapshot["id"])[
            "current_version"
        ] == 2
        reopened_report = ProductService(reopened, planner).get("reports", report_draft["id"])
        assert reopened_report["report_type"] == "planning_snapshot_draft"
        assert reopened_report["payload"]["source_snapshot_id"] == snapshot["id"]
        assert reopened_report["payload"]["selected_sections"] == {
            "key_findings": True,
            "map_view": True,
            "schools": False,
        }
        reopened_snapshot = ProductService(reopened, planner).get(
            "planning_snapshots", snapshot["id"]
        )
        assert reopened_snapshot["map_state"]["key_findings"] == [
            "Preserve legitimate planning data"
        ]
        assert reopened_snapshot["payload"]["snapshot"]["keyFacts"] == [
            {"label": "County", "value": "Cabarrus"}
        ]
        assert reopened_report["payload"]["report_notes"] == "Persisted report note"
        assert reopened.scalar(
            select(func.count()).select_from(audit_events).where(
                audit_events.c.object_id == snapshot["id"]
            )
        ) >= 3


def test_economics_and_ask_cfs_persist_with_safe_fields(
    product_session,
    principal_factory,
) -> None:
    admin = principal_factory(Role.ADMINISTRATOR)
    project = ProductService(product_session, admin).create("projects", {"name": "Enterprise V1"})

    analyst = principal_factory(Role.ANALYST, project_ids=frozenset({project["id"]}))
    scenario = ProductService(product_session, analyst).create(
        "economic_scenarios",
        {
            "project_id": project["id"],
            "name": "Infrastructure timing",
            "assumptions": {"horizon_years": 10},
            "outputs": {"status": "analytical only"},
            "comparison_set_id": "comparison-1",
        },
    )
    assert scenario["organization_id"] == analyst.organization_id
    economic_service = ProductService(product_session, analyst, "economics-1")
    economic_service.version("economic_scenarios", scenario["id"], "Analyst checkpoint")
    comparison = economic_service.create(
        "economic_scenarios",
        {
            "project_id": project["id"],
            "name": "Alternative timing",
            "assumptions": {"horizon_years": 15},
            "outputs": {"status": "analytical only"},
            "comparison_set_id": "comparison-1",
        },
    )
    report = economic_service.create(
        "reports",
        {
            "project_id": project["id"],
            "report_type": "Economics comparison",
            "title": "Infrastructure timing comparison",
            "payload": {
                "scenario_ids": [scenario["id"], comparison["id"]],
                "private": {"api_key": "do-not-store"},
            },
        },
    )
    bucket = economic_service.create(
        "report_bucket_items",
        {
            "project_id": project["id"],
            "report_id": report["id"],
            "object_type": "economic_scenario",
            "object_id": scenario["id"],
            "title": "Primary scenario",
        },
    )
    assert economic_service.archive("report_bucket_items", bucket["id"])["archived_at"]

    viewer = principal_factory(Role.VIEWER, project_ids=frozenset({project["id"]}))
    ask = ProductService(product_session, viewer)
    secret_marker = "cfs-redaction-marker"
    secret_phrase = f"{secret_marker} correct horse, battery staple"
    conversation = ask.create(
        "ask_cfs_conversations",
        {
            "project_id": project["id"],
            "title": f"Review password={secret_phrase}; ordinary key constraints",
            "product_context": {
                "context_scope": "planning|||||||",
                "parcel_id": "p-1",
                "private": {
                    "apikey": "unseparated-api-key",
                    "clientsecret": "unseparated-client-secret",
                    "hidden_prompt": "do not persist",
                    "token": "secret-token",
                },
            },
            "retention_until": datetime.now(UTC) + timedelta(days=30),
        },
    )
    message = ask.add_ask_message(
        conversation["id"],
        role="user",
        safe_question=f"api_key={secret_phrase}; what verified constraints are present?",
        entity_context={
            "parcel_id": "p-1",
            "credentials": {"password": "secret-password"},
        },
        provider_mode="none",
    )
    assert conversation["product_context"]["private"] == {
        "apikey": "<redacted>",
        "clientsecret": "<redacted>",
        "hidden_prompt": "<redacted>",
        "token": "<redacted>",
    }
    assert conversation["product_context"]["context_scope"] == "planning|||||||"
    assert conversation["title"] == "Review <redacted>"
    assert message["safe_question"] == "<redacted>"
    assert secret_marker not in str(conversation) + str(message)
    assert message["entity_context"]["credentials"] == "<redacted>"
    assert report["payload"]["private"] == {"api_key": "<redacted>"}
    assistant = ask.add_ask_message(
        conversation["id"],
        role="assistant",
        safe_answer_summary=f"Bearer {secret_marker}; verified constraint summary only.",
        prompt_version="ask-cfs-v1",
        provider_mode="none",
        safety_status="accepted",
    )
    assert assistant["prompt_version"] == "ask-cfs-v1"
    assert assistant["safe_answer_summary"] == "<redacted>; verified constraint summary only."
    assert secret_marker not in str(assistant)
    messages, total_messages = ask.list_ask_messages(conversation["id"])
    assert total_messages == 2
    assert [row["id"] for row in messages] == [
        message["id"],
        assistant["id"],
    ]
    assert product_session.scalar(
        select(func.count()).select_from(ask_cfs_messages).where(
            ask_cfs_messages.c.conversation_id == conversation["id"]
        )
    ) == 2
    reset = ask.reset_ask_conversation(conversation["id"])
    assert reset["reset_at"] is not None
    assert product_session.scalar(
        select(func.count()).select_from(ask_cfs_messages).where(
            ask_cfs_messages.c.conversation_id == conversation["id"]
        )
    ) == 0
    product_session.commit()

    with Session(product_session.get_bind()) as reopened:
        reopened_service = ProductService(reopened, analyst)
        reopened_scenario = reopened_service.get("economic_scenarios", scenario["id"])
        assert reopened_scenario["current_version"] == 2
        assert reopened_scenario["assumptions"] == {"horizon_years": 10}
        assert reopened_scenario["outputs"] == {"status": "analytical only"}
        scenarios, total = reopened_service.list("economic_scenarios", project_id=project["id"])
        assert total == 2
        assert {row["comparison_set_id"] for row in scenarios} == {"comparison-1"}
        assert reopened_service.get("reports", report["id"])["payload"]["scenario_ids"] == [
            scenario["id"],
            comparison["id"],
        ]
        assert reopened_service.get("report_bucket_items", bucket["id"])["archived_at"] is not None
        reopened_ask = ProductService(reopened, viewer)
        assert reopened_ask.get("ask_cfs_conversations", conversation["id"])["reset_at"] is not None
        assert reopened_ask.list_ask_messages(conversation["id"])[1] == 0
        assert reopened.scalar(
            select(func.count()).select_from(economic_scenario_versions).where(
                economic_scenario_versions.c.scenario_id == scenario["id"]
            )
        ) == 2
        assert reopened.scalar(
            select(func.count()).select_from(audit_events).where(
                audit_events.c.request_id == "economics-1"
            )
        ) >= 5
