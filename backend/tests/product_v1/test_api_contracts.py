from __future__ import annotations

from collections.abc import Generator

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine

from app.config import Settings
from app.main import app, health_ready
from app.product.principal import ProductPrincipal, Role
from app.product.router import database_session, get_product_principal


def test_v1_request_ids_errors_pagination_and_legacy_compatibility(
    session_factory,
    principal_factory,
) -> None:
    principal = principal_factory(Role.ADMINISTRATOR)
    current = {"principal": principal}

    def override_session() -> Generator:
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def override_principal(request: Request) -> ProductPrincipal:
        request.state.product_principal = current["principal"]
        return current["principal"]

    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            legacy_health = client.get("/health")
            v1_health = client.get(
                "/api/v1/health",
                headers={"X-Request-ID": "contract-123", "Origin": "http://localhost:3000"},
            )
            generated_id = client.get("/api/v1/health", headers={"X-Request-ID": "bad id"})
            invalid = client.post("/api/v1/projects", json=[])
            unknown_field = client.post(
                "/api/v1/projects",
                json={"name": "Invalid project", "unexpected": True},
            )
            read_only_field = client.post(
                "/api/v1/projects",
                json={"id": "client-selected", "name": "Invalid project"},
            )
            oversized_field = client.post(
                "/api/v1/projects",
                json={"name": "x" * 241},
            )
            oversized_request = client.post(
                "/api/v1/projects",
                content=b"{}",
                headers={"Content-Length": "12000001", "Content-Type": "application/json"},
            )
            created = client.post("/api/v1/projects", json={"name": "Contract project"})
            project = created.json()["data"]
            listing = client.get("/api/v1/projects?page=1&page_size=1&sort=name")
            conflict = client.patch(
                f"/api/v1/projects/{project['id']}?expected_updated_at=stale",
                json={"description": "stale update"},
            )
            filtered_audit = client.get(
                f"/api/v1/audit?object_id={project['id']}&action=create"
            )
            source = client.post(
                "/api/v1/data-sources",
                json={
                    "domain": "parcels",
                    "source_name": "Contract source",
                    "provider_system": "Contract fixture",
                    "authority_level": "Official",
                    "owner_role": "Data Steward",
                    "expected_refresh": "Monthly",
                    "schema_version": "1",
                    "status": "Available",
                    "ingestion_method": "approved_api",
                },
            )
            source_status = client.patch(
                f"/api/v1/data-sources/{source.json()['data']['id']}",
                json={"status": "Stale", "limitations": "Refresh due."},
            )
            source_item = client.get(
                f"/api/v1/data-sources/{source.json()['data']['id']}"
            )
            source_list = client.get("/api/v1/data-sources")
            invalid_source = client.post(
                "/api/v1/data-sources",
                json={"domain": "planning", "unexpected": True},
            )
            ingestion = client.post(
                "/api/v1/ingestion/runs",
                json={
                    "source_id": source.json()["data"]["id"],
                    "domain": "parcels",
                    "schema_version": "1",
                    "rows": [{"official_parcel_id": "P-1"}],
                    "validation_options": {
                        "required_fields": ["official_parcel_id"],
                        "expected_rows": 1,
                    },
                },
            )
            current["principal"] = principal_factory(
                Role.ADMINISTRATOR,
                other_organization=True,
            )
            other_source = client.post(
                "/api/v1/data-sources",
                json={
                    "domain": "parcels",
                    "source_name": "Other organization source",
                    "provider_system": "Contract fixture",
                    "authority_level": "Official",
                    "owner_role": "Data Steward",
                    "expected_refresh": "Weekly",
                    "schema_version": "1",
                    "status": "Available",
                    "ingestion_method": "approved_api",
                },
            )
            current["principal"] = principal
            source_export = client.get("/api/v1/data-sources/export")
            source_export_audit = client.get(
                "/api/v1/audit?action=source_registry_export"
            )
            admin = client.get("/api/v1/admin/summary")
    finally:
        app.dependency_overrides.clear()

    assert legacy_health.status_code == 200
    assert legacy_health.json() == {"status": "ok"}
    assert v1_health.status_code == 200
    assert v1_health.headers["X-Request-ID"] == "contract-123"
    assert v1_health.headers["X-CFS-Process-Time-Ms"]
    assert v1_health.headers["access-control-expose-headers"] == "X-CFS-Process-Time-Ms, X-Request-ID"
    assert v1_health.json()["request_id"] == "contract-123"
    assert v1_health.json()["provenance"]["api_version"] == "v1"
    assert generated_id.headers["X-Request-ID"]
    assert generated_id.headers["X-Request-ID"] != "bad id"

    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"
    assert invalid.json()["request_id"]
    assert unknown_field.status_code == 422
    assert read_only_field.status_code == 422
    assert oversized_field.status_code == 422
    assert oversized_request.status_code == 413
    assert oversized_request.json()["error"]["code"] == "request_too_large"
    assert created.status_code == 201
    assert listing.json()["pagination"] == {"page": 1, "page_size": 1, "total": 1}
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "conflict"
    assert [event["object_id"] for event in filtered_audit.json()["data"]] == [project["id"]]
    assert source.status_code == 201
    assert source_status.status_code == 200
    assert source_status.json()["data"]["status"] == "Stale"
    assert source_item.status_code == 200
    assert source_list.status_code == 200
    operational_fields = {
        "organization_id",
        "created_by",
        "created_at",
        "updated_at",
        "database_url",
        "connection_string",
        "table_name",
    }
    for source_record in (
        source.json()["data"],
        source_status.json()["data"],
        source_item.json()["data"],
        source_list.json()["data"][0],
    ):
        assert operational_fields.isdisjoint(source_record)
    assert invalid_source.status_code == 422
    assert ingestion.status_code == 201
    assert other_source.status_code == 201
    assert source_export.json()["data"]["source_count"] == 1
    assert source_export.json()["data"]["sources"][0]["id"] == source.json()["data"]["id"]
    assert source_export.json()["provenance"]["api_version"] == "v1"
    assert source_export_audit.json()["data"] == []
    admin_body = admin.json()
    assert set(admin_body) == {"data", "provenance", "request_id", "timestamp"}
    assert set(admin_body["data"]) == {
        "runtime",
        "migration",
        "sources",
        "ingestion_runs",
        "quality_results",
        "jobs",
        "audit",
    }
    assert admin_body["data"]["runtime"]["runtime_mode"] == "local"
    assert len(admin_body["data"]["sources"]) == 1
    source_summary = admin_body["data"]["sources"][0]
    assert source_summary["id"] == source.json()["data"]["id"]
    assert source_summary["freshness_status"] == "Stale"
    assert source_summary["refresh_cadence"] == "Monthly"
    assert source_summary["latest_ingestion_run_id"] == ingestion.json()["data"]["id"]
    assert source_summary["last_ingestion_at"]
    assert source_summary["row_count"] == 1
    assert source_summary["validation_status"] == "Passed"
    assert admin_body["provenance"]["api_version"] == "v1"


def test_openapi_covers_v1_product_and_legacy_compatibility_paths() -> None:
    paths = app.openapi()["paths"]
    required = {
        "/api/v1/health",
        "/api/v1/parcels/search",
        "/api/v1/planning/snapshots",
        "/api/v1/economics/intelligence",
        "/api/v1/economics/scenarios",
        "/api/v1/investment/saved-searches",
        "/api/v1/projects",
        "/api/v1/reports",
        "/api/v1/ask-cfs/conversations",
        "/api/v1/ai/search",
        "/api/v1/data-sources",
        "/api/v1/data-sources/{source_id}",
        "/api/v1/data-sources/export",
        "/api/v1/ingestion/runs",
        "/api/v1/artifacts",
        "/api/v1/audit",
    }
    assert required <= set(paths)


def test_readiness_requires_current_product_migration(monkeypatch, product_engine) -> None:
    monkeypatch.setattr("app.main.verify_database_connection", lambda: None)
    pending_engine = create_engine("sqlite+pysqlite:///:memory:")
    monkeypatch.setattr("app.main.get_engine", lambda: pending_engine)
    with pytest.raises(HTTPException) as exc_info:
        health_ready()
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["pending"] == ["0001_product_v1"]

    monkeypatch.setattr("app.main.get_engine", lambda: product_engine)
    assert health_ready()["migration"] == "0001_product_v1"


def test_demo_has_no_persistent_writes_and_versioned_legacy_investment_is_read_only(
    monkeypatch,
) -> None:
    demo = Settings(
        CFS_RUNTIME_MODE="demo",
        CFS_DATA_PROVIDER="static",
        CFS_AUTH_MODE="off",
        CFS_AI_PROVIDER="none",
        CFS_AI_ENABLED=False,
        CFS_ARTIFACT_PROVIDER="public_static",
        CFS_JOB_PROVIDER="inline",
        _env_file=None,
    )
    monkeypatch.setattr("app.main.settings", demo)
    with TestClient(app, raise_server_exceptions=False) as client:
        ask_write = client.post(
            "/api/v1/ask-cfs/conversations",
            json={"title": "Must stay in sessionStorage"},
        )
        legacy_write = client.post("/api/v1/investment/saved-searches", json={})
        unversioned_write = client.post("/investment/saved-searches", json={})
        unversioned_read = client.get("/investment/strategies")

    assert ask_write.status_code == 405
    assert ask_write.json()["error"]["code"] == "demo_write_disabled"
    assert ask_write.json()["request_id"]
    assert legacy_write.status_code == 405
    assert legacy_write.json()["error"]["code"] == "read_only_compatibility"
    assert unversioned_write.status_code == 405
    assert unversioned_read.status_code == 200
    assert "post" in app.openapi()["paths"]["/investment/saved-searches"]


def test_enterprise_blocks_unversioned_investment_mutations_but_local_does_not(
    monkeypatch,
) -> None:
    enterprise = Settings(
        CFS_RUNTIME_MODE="enterprise",
        CFS_DATA_PROVIDER="enterprise_api",
        CFS_AUTH_MODE="oidc",
        CFS_ARTIFACT_PROVIDER="object_storage",
        CFS_JOB_PROVIDER="external_worker",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        CFS_ORGANIZATION_ID="organization-id",
        CFS_CORS_ORIGINS="https://cfs.example.gov",
        _env_file=None,
    )
    monkeypatch.setattr("app.main.settings", enterprise)
    with TestClient(app, raise_server_exceptions=False) as client:
        enterprise_write = client.post("/investment/saved-searches", json={})
        versioned_write = client.post("/api/v1/investment/saved-searches", json={})

    local = Settings(
        CFS_RUNTIME_MODE="local",
        CFS_DATA_PROVIDER="local_api",
        CFS_AUTH_MODE="off",
        CFS_ARTIFACT_PROVIDER="local_file",
        CFS_JOB_PROVIDER="inline",
        _env_file=None,
    )
    monkeypatch.setattr("app.main.settings", local)
    with TestClient(app, raise_server_exceptions=False) as client:
        local_write = client.post("/investment/saved-searches", json={})

    assert enterprise_write.status_code == 405
    assert versioned_write.status_code == 405
    assert local_write.status_code != 405
