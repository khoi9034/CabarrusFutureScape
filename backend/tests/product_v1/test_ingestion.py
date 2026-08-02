from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import SQLAlchemyError

from app.product.ingestion import RowsAdapter, run_ingestion, stage, validate
from app.product.models import data_quality_results, ingestion_runs
from app.product.principal import AuthorizationError, Role
from app.product.quality import DOMAIN_RULES, evaluate_domain_rows
from app.product.service import ProductNotFound, ProductService, ProductValidationError
from app.product.source_registry import (
    SOURCE_STATUSES,
    create_source,
    export_sources,
    get_source,
    list_sources,
    update_source_status,
)


def test_all_source_statuses_and_quality_domains_are_registered() -> None:
    assert SOURCE_STATUSES == {
        "Available",
        "Available with limitations",
        "Missing",
        "Stale",
        "Validation failed",
        "Disabled",
        "Not required",
    }
    assert set(DOMAIN_RULES) == {
        "parcels",
        "permits",
        "development",
        "flood",
        "schools",
        "economics",
        "wsacc",
        "investments",
    }
    assert all(
        evaluate_domain_rows(domain, [])[0]["status"] != "not_configured"
        for domain in DOMAIN_RULES
    )


def test_registry_evidence_connects_ask_cfs_reports_and_exports(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    source = create_source(
        product_session,
        administrator,
        {
            "domain": "planning",
            "source_name": "Governed planning source",
            "provider_system": "Test registry",
            "authority_level": "Official",
            "owner_role": "Data Steward",
            "schema_version": "1",
            "status": "Available with limitations",
            "limitations": "Current context only.",
            "ingestion_method": "approved_api",
        },
    )
    service = ProductService(product_session, administrator)
    project = service.create("projects", {"name": "Registry connections"})
    report = service.create(
        "reports",
        {
            "project_id": project["id"],
            "report_type": "Planning review",
            "title": "Source-backed report",
            "payload": {
                "source_ids": [source["id"], source["id"]],
                "source_evidence": [{"status": "fabricated"}],
            },
        },
    )
    conversation = service.create(
        "ask_cfs_conversations",
        {
            "project_id": project["id"],
            "title": "Source-backed conversation",
            "product_context": {"source_ids": [source["id"]]},
        },
    )
    message = service.add_ask_message(
        conversation["id"],
        role="assistant",
        safe_answer_summary="Grounded in the governed planning source.",
        entity_context={"source_ids": [source["id"]]},
    )
    exported = export_sources(product_session, administrator)

    for context in (
        report["payload"],
        conversation["product_context"],
        message["entity_context"],
    ):
        assert context["source_ids"] == [source["id"]]
        assert context["source_evidence"] == [
            {
                "id": source["id"],
                "domain": "planning",
                "source_name": "Governed planning source",
                "provider_system": "Test registry",
                "authority_level": "Official",
                "owner_role": "Data Steward",
                "schema_version": "1",
                "sensitivity": "Public",
                "status": "Available with limitations",
                "limitations": "Current context only.",
                "ingestion_method": "approved_api",
            }
        ]
    assert exported["source_count"] == 1
    assert exported["sources"] == report["payload"]["source_evidence"]

    updated = update_source_status(
        product_session,
        administrator,
        source["id"],
        "Stale",
        limitations="Refresh review is due.",
    )
    assert updated["status"] == "Stale"
    assert updated["limitations"] == "Refresh review is due."


def test_registry_references_reject_missing_and_cross_organization_sources(
    product_session,
    principal_factory,
) -> None:
    administrator = principal_factory(Role.ADMINISTRATOR)
    other_administrator = principal_factory(
        Role.ADMINISTRATOR,
        other_organization=True,
    )
    other_source = create_source(
        product_session,
        other_administrator,
        {
            "domain": "planning",
            "source_name": "Other organization source",
            "provider_system": "Test registry",
            "authority_level": "Official",
            "owner_role": "Data Steward",
            "schema_version": "1",
            "status": "Available",
            "ingestion_method": "approved_api",
        },
    )
    assert list_sources(product_session, administrator) == []
    with pytest.raises(AuthorizationError, match="another organization"):
        get_source(product_session, administrator, other_source["id"])
    assert {
        "organization_id",
        "created_by",
        "created_at",
        "updated_at",
    }.isdisjoint(other_source)
    service = ProductService(product_session, administrator)
    report = {
        "report_type": "Planning review",
        "title": "Invalid source report",
    }

    with pytest.raises(ProductNotFound, match="Data source"):
        service.create(
            "reports",
            {**report, "payload": {"source_ids": ["missing-source"]}},
        )
    with pytest.raises(AuthorizationError, match="another organization"):
        service.create(
            "reports",
            {**report, "payload": {"source_ids": [other_source["id"]]}},
        )
    valid_report = service.create("reports", report)
    with pytest.raises(AuthorizationError, match="another organization"):
        service.update(
            "reports",
            valid_report["id"],
            {"payload": {"source_ids": [other_source["id"]]}},
        )
    assert service.get("reports", valid_report["id"])["payload"] == {}


def test_checksum_and_explicit_validation_branches_are_deterministic() -> None:
    rows = [
        {
            "official_parcel_id": "P-1",
            "required": None,
            "geometry": {"type": "Polygon", "coordinates": []},
            "srid": 3857,
        },
        {"official_parcel_id": "P-1", "required": "ok", "geometry": {"type": "Bad"}},
    ]
    staged = stage(RowsAdapter(rows), schema_version="1")
    assert staged.checksum == stage(RowsAdapter(rows), schema_version="1").checksum
    results = validate(
        staged,
        domain="parcels",
        required_fields=("required",),
        unique_key="official_parcel_id",
        expected_srid=4326,
        expected_rows=3,
        max_null_rate=0,
        source_date=datetime.now(UTC) - timedelta(days=10),
        freshness_days=1,
    )
    by_rule = {result["rule_id"]: result for result in results}
    explicit_rules = {
        "schema.required_fields",
        "schema.duplicates",
        "geometry.srid",
        "geometry.validity",
        "schema.null_rate",
        "rows.reconciliation",
        "source.freshness",
    }
    assert explicit_rules <= set(by_rule)
    assert all(by_rule[rule]["status"] == "failed" for rule in explicit_rules)


@pytest.mark.parametrize(
    ("domain", "schema_version", "message"),
    [
        ("schools", "1", "domain"),
        ("parcels", "2", "schema version"),
    ],
)
def test_ingestion_requires_registered_domain_and_schema_version(
    domain,
    schema_version,
    message,
    product_session,
    principal_factory,
) -> None:
    steward = principal_factory(Role.DATA_STEWARD)
    source = create_source(
        product_session,
        steward,
        {
            "domain": "parcels",
            "source_name": "Registered parcel source",
            "provider_system": "isolated fixture",
            "authority_level": "Test only",
            "owner_role": "Data Steward",
            "schema_version": "1",
            "status": "Available",
            "ingestion_method": "isolated_rows",
        },
    )

    with pytest.raises(ProductValidationError, match=message):
        run_ingestion(
            product_session,
            steward,
            source_id=source["id"],
            domain=domain,
            staged=stage(RowsAdapter([]), schema_version=schema_version),
            apply=False,
        )


def test_dry_run_and_unconfigured_apply_are_immutable_and_do_not_touch_canonical_data(
    product_session,
    principal_factory,
) -> None:
    steward = principal_factory(Role.DATA_STEWARD)
    source = create_source(
        product_session,
        steward,
        {
            "domain": "parcels",
            "source_name": "Sanitized parcel test",
            "provider_system": "isolated fixture",
            "authority_level": "Test only",
            "owner_role": "Data Steward",
            "schema_version": "1",
            "status": "Available",
            "ingestion_method": "isolated_rows",
        },
    )
    product_session.execute(text("CREATE TABLE canonical_sentinel (id text primary key, value text)"))
    product_session.execute(
        text("INSERT INTO canonical_sentinel (id, value) VALUES ('keep', 'unchanged')")
    )
    staged = stage(
        RowsAdapter(
            [
                {"official_parcel_id": "P-1", "geometry": None},
                {"official_parcel_id": "P-2", "geometry": None},
            ]
        ),
        schema_version="1",
        staged_key="tests/parcels.json",
    )

    dry_run = run_ingestion(
        product_session,
        steward,
        source_id=source["id"],
        domain="parcels",
        staged=staged,
        apply=False,
        validation_options={
            "required_fields": ("official_parcel_id",),
            "unique_key": "official_parcel_id",
            "expected_rows": 2,
        },
    )
    apply_attempt = run_ingestion(
        product_session,
        steward,
        source_id=source["id"],
        domain="parcels",
        staged=staged,
        apply=True,
    )
    product_session.commit()

    assert dry_run["status"] == "Validated"
    assert dry_run["accepted_rows"] == 2
    assert apply_attempt["status"] == "Apply unavailable"
    assert apply_attempt["accepted_rows"] == 0
    assert apply_attempt["validation_summary"]["canonical_tables_mutated"] is False
    assert product_session.scalar(text("SELECT value FROM canonical_sentinel WHERE id='keep'")) == "unchanged"
    assert product_session.scalar(
        select(data_quality_results.c.status).where(
            data_quality_results.c.ingestion_run_id == dry_run["id"]
        ).limit(1)
    ) == "passed"

    with pytest.raises(SQLAlchemyError, match="immutable"):
        product_session.execute(
            update(ingestion_runs)
            .where(ingestion_runs.c.id == dry_run["id"])
            .values(status="tampered")
        )
    product_session.rollback()
    assert product_session.scalar(
        select(ingestion_runs.c.status).where(ingestion_runs.c.id == dry_run["id"])
    ) == "Validated"


def test_validation_failure_is_stored_without_fake_replacement(
    product_session,
    principal_factory,
) -> None:
    steward = principal_factory(Role.DATA_STEWARD)
    source = create_source(
        product_session,
        steward,
        {
            "domain": "schools",
            "source_name": "School fixture",
            "provider_system": "isolated fixture",
            "authority_level": "Test only",
            "owner_role": "Data Steward",
            "schema_version": "1",
            "status": "Available with limitations",
            "ingestion_method": "isolated_rows",
        },
    )
    run = run_ingestion(
        product_session,
        steward,
        source_id=source["id"],
        domain="schools",
        staged=stage(RowsAdapter([{"school_name": None}]), schema_version="1"),
        apply=False,
    )
    assert run["status"] == "Validation failed"
    results = product_session.execute(
        select(data_quality_results).where(
            data_quality_results.c.ingestion_run_id == run["id"]
        )
    ).mappings().all()
    assert results
    assert all(result["details"]["fake_values_created"] is False for result in results)
