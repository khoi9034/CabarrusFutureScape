from __future__ import annotations

import base64
from dataclasses import replace

from fastapi import Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings
from app.main import app
from app.product.artifacts import (
    ArtifactPathError,
    FutureObjectStorageArtifactStore,
    LocalFileArtifactStore,
    PublicStaticArtifactStore,
    download_artifact,
    register_artifact,
)
from app.product.jobs import ExternalWorkerJobProvider, InlineJobProvider
from app.product.models import artifacts, background_jobs, projects
from app.product.principal import AuthorizationError, ProductPrincipal, Role
from app.product.router import (
    _job_provider,
    database_session,
    get_product_principal,
)
from app.product.service import ProductConflict


def test_artifact_authorization_precedes_write_and_keys_do_not_overwrite(
    tmp_path,
    monkeypatch,
    session_factory,
    principal_factory,
    identities,
) -> None:
    monkeypatch.setenv("CFS_ARTIFACT_ROOT", str(tmp_path))
    current = {"principal": principal_factory(Role.VIEWER)}

    def override_session():
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

    payload = {
        "key": "reports/review.txt",
        "filename": "review.txt",
        "content_type": "text/plain",
        "content_base64": base64.b64encode(b"verified content").decode(),
        "object_type": "report",
        "object_id": "report-1",
    }
    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            denied = client.post("/api/v1/artifacts", json=payload)
            assert denied.status_code == 403
            assert not (tmp_path / "reports" / "review.txt").exists()

            current["principal"] = principal_factory(Role.ADMINISTRATOR)
            with session_factory.begin() as session:
                session.execute(
                    projects.insert().values(
                        id="00000000-0000-0000-0000-000000009998",
                        organization_id=identities["other_organization_id"],
                        name="Other organization project",
                        project_type="Test",
                        created_by=identities["other_user_id"],
                    )
                )
            bad_fk = client.post(
                "/api/v1/artifacts",
                json={
                    **payload,
                    "key": "reports/orphan.txt",
                    "filename": "orphan.txt",
                    "project_id": "00000000-0000-0000-0000-000000009999",
                },
            )
            cross_organization = client.post(
                "/api/v1/artifacts",
                json={
                    **payload,
                    "key": "reports/cross-org.txt",
                    "filename": "cross-org.txt",
                    "project_id": "00000000-0000-0000-0000-000000009998",
                },
            )
            created = client.post("/api/v1/artifacts", json=payload)
            duplicate = client.post("/api/v1/artifacts", json=payload)
            bad_filename = client.post(
                "/api/v1/artifacts", json={**payload, "key": "unused", "filename": "bad\rname.txt"}
            )
            downloaded = client.get(
                f"/api/v1/artifacts/{created.json()['data']['id']}/download"
            )
    finally:
        app.dependency_overrides.clear()

    assert created.status_code == 201
    assert bad_fk.status_code == 404
    assert cross_organization.status_code == 403
    assert not (tmp_path / "reports" / "orphan.txt").exists()
    assert not (tmp_path / "reports" / "cross-org.txt").exists()
    assert duplicate.status_code == 409
    assert bad_filename.status_code == 422
    assert not (tmp_path / "unused").exists()
    assert downloaded.content == b"verified content"
    assert downloaded.headers["content-disposition"] == "attachment; filename*=UTF-8''review.txt"
    assert downloaded.headers["x-content-type-options"] == "nosniff"


def test_job_provider_selection_idempotency_and_error_redaction(
    product_session,
    principal_factory,
) -> None:
    principal = principal_factory(Role.ADMINISTRATOR)

    def failing(_reference):
        raise RuntimeError("password=should-never-be-stored")

    provider = InlineJobProvider({"failing": failing})
    first = provider.submit(
        product_session,
        principal,
        job_type="failing",
        idempotency_key="job-1",
    )
    second = provider.submit(
        product_session,
        principal,
        job_type="failing",
        idempotency_key="job-1",
    )
    assert first["id"] == second["id"]
    assert first["status"] == "failed"
    assert first["error"] == "RuntimeError: handler failed"
    assert "password" not in first["error"]
    assert product_session.scalar(
        select(background_jobs.c.id).where(background_jobs.c.idempotency_key == "job-1")
    ) == first["id"]

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
    )
    assert isinstance(_job_provider(enterprise), ExternalWorkerJobProvider)


def test_artifact_compensates_commit_store_and_metadata_failures(
    tmp_path,
    monkeypatch,
    session_factory,
    principal_factory,
) -> None:
    monkeypatch.setenv("CFS_ARTIFACT_ROOT", str(tmp_path))
    principal = principal_factory(Role.ADMINISTRATOR)
    fail_commit = {"enabled": False}

    def override_session():
        session = session_factory()
        if fail_commit["enabled"]:
            def reject_commit() -> None:
                raise SQLAlchemyError("forced commit failure")

            session.commit = reject_commit  # type: ignore[method-assign]
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def override_principal(request: Request) -> ProductPrincipal:
        request.state.product_principal = principal
        return principal

    def payload(key: str) -> dict[str, str]:
        return {
            "key": key,
            "filename": "proof.txt",
            "content_type": "text/plain",
            "content_base64": base64.b64encode(b"complete content").decode(),
            "object_type": "report",
            "object_id": "atomicity-proof",
        }

    def metadata_count(key: str) -> int:
        with session_factory() as session:
            return int(
                session.scalar(
                    select(func.count())
                    .select_from(artifacts)
                    .where(artifacts.c.storage_key == key)
                )
                or 0
            )

    app.dependency_overrides[database_session] = override_session
    app.dependency_overrides[get_product_principal] = override_principal
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            fail_commit["enabled"] = True
            commit_key = "atomic/commit.txt"
            commit_failure = client.post("/api/v1/artifacts", json=payload(commit_key))
            fail_commit["enabled"] = False

            partial_key = "atomic/partial.txt"
            with monkeypatch.context() as scoped:
                def fail_after_partial_write(self, staged):
                    staged.target.write_bytes(b"x")
                    staged.finalized = True
                    raise OSError("forced partial store failure")

                scoped.setattr(LocalFileArtifactStore, "finalize", fail_after_partial_write)
                partial_failure = client.post("/api/v1/artifacts", json=payload(partial_key))

            mismatch_key = "atomic/mismatch.txt"
            original_finalize = LocalFileArtifactStore.finalize
            with monkeypatch.context() as scoped:
                def mismatch_after_finalize(self, staged):
                    written = original_finalize(self, staged)
                    return replace(written, checksum="0" * 64)

                scoped.setattr(LocalFileArtifactStore, "finalize", mismatch_after_finalize)
                mismatch = client.post("/api/v1/artifacts", json=payload(mismatch_key))
    finally:
        app.dependency_overrides.clear()

    assert commit_failure.status_code == 500
    assert partial_failure.status_code == 500
    assert mismatch.status_code == 409
    for key in (commit_key, partial_key, mismatch_key):
        assert not (tmp_path / key).exists()
        assert metadata_count(key) == 0
    assert not list(tmp_path.rglob(".cfs-artifact-*.tmp"))


def test_artifact_path_and_checksum_are_enforced(
    tmp_path,
    product_session,
    principal_factory,
) -> None:
    store = LocalFileArtifactStore(tmp_path)
    with pytest.raises(ArtifactPathError, match="escapes"):
        store.put("../outside.txt", b"no")
    with pytest.raises(PermissionError, match="read-only"):
        PublicStaticArtifactStore(tmp_path / "public").stage("blocked.txt", b"no")
    with pytest.raises(NotImplementedError, match="deployment-specific"):
        FutureObjectStorageArtifactStore().stage("deferred.txt", b"no")

    stored = store.put("safe/report.txt", b"original")
    with pytest.raises(ArtifactPathError, match="content type"):
        register_artifact(
            product_session,
            principal_factory(Role.ADMINISTRATOR),
            stored=stored,
            object_type="report",
            object_id="unsafe-content",
            filename="report.html",
            content_type="text/html",
        )
    with pytest.raises(AuthorizationError, match="Administrator approval"):
        register_artifact(
            product_session,
            principal_factory(Role.REPORT_AUTHOR),
            stored=stored,
            object_type="report",
            object_id="unapproved-public",
            filename="report.txt",
            content_type="text/plain",
            download_policy="public",
        )
    artifact = register_artifact(
        product_session,
        principal_factory(Role.ADMINISTRATOR),
        stored=stored,
        object_type="report",
        object_id="report-checksum",
        filename="report.txt",
        content_type="text/plain",
    )
    with pytest.raises(AuthorizationError, match="artifacts:download"):
        download_artifact(
            product_session,
            principal_factory(Role.VIEWER),
            store,
            artifact["id"],
        )
    (tmp_path / "safe" / "report.txt").write_bytes(b"tampered")
    with pytest.raises(ProductConflict, match="checksum"):
        download_artifact(
            product_session,
            principal_factory(Role.ADMINISTRATOR),
            store,
            artifact["id"],
        )
