from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.product.audit import append_event
from app.product.models import artifacts, new_id, utc_now
from app.product.principal import (
    AuthorizationError,
    Permission,
    ProductPrincipal,
    Role,
    authorize,
    authorize_object,
)
from app.product.service import ProductConflict, ProductNotFound


class ArtifactPathError(ValueError):
    pass


ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/json",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg",
        "image/png",
        "text/csv",
        "text/plain",
    }
)
ALLOWED_SENSITIVITIES = frozenset({"Public", "Internal", "Confidential"})
ALLOWED_DOWNLOAD_POLICIES = frozenset({"authorized", "approved", "public"})


@dataclass(frozen=True)
class StoredArtifact:
    key: str
    size_bytes: int
    checksum: str
    provider: str


@dataclass
class StagedArtifact:
    stored: StoredArtifact
    target: Path
    temporary: Path
    finalized: bool = False


class ArtifactStore(Protocol):
    provider: str

    def stage(self, key: str, content: bytes) -> StagedArtifact: ...

    def finalize(self, staged: StagedArtifact) -> StoredArtifact: ...

    def abort(self, staged: StagedArtifact) -> None: ...

    def put(self, key: str, content: bytes) -> StoredArtifact: ...

    def get(self, key: str) -> bytes: ...


class LocalFileArtifactStore:
    provider = "local_file"

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, content: bytes) -> StoredArtifact:
        staged = self.stage(key, content)
        try:
            return self.finalize(staged)
        except Exception:
            self.abort(staged)
            raise

    def stage(self, key: str, content: bytes) -> StagedArtifact:
        target = self._resolve(key)
        if target.exists():
            raise FileExistsError(f"Artifact key already exists: {key}")
        target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".cfs-artifact-",
            suffix=".tmp",
            dir=target.parent,
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as artifact_file:
                artifact_file.write(content)
                artifact_file.flush()
                os.fsync(artifact_file.fileno())
        except Exception:
            try:
                os.close(descriptor)
            except OSError:
                pass
            temporary.unlink(missing_ok=True)
            raise
        return StagedArtifact(
            stored=_stored(key, content, self.provider),
            target=target,
            temporary=temporary,
        )

    def finalize(self, staged: StagedArtifact) -> StoredArtifact:
        os.link(staged.temporary, staged.target)
        staged.finalized = True
        staged.temporary.unlink(missing_ok=True)
        return staged.stored

    def abort(self, staged: StagedArtifact) -> None:
        if staged.finalized:
            staged.target.unlink(missing_ok=True)
        staged.temporary.unlink(missing_ok=True)

    def get(self, key: str) -> bytes:
        target = self._resolve(key)
        if not target.is_file():
            raise FileNotFoundError(key)
        return target.read_bytes()

    def _resolve(self, key: str) -> Path:
        if not key or Path(key).is_absolute():
            raise ArtifactPathError("Artifact key must be a non-empty relative path.")
        target = (self.root / key).resolve()
        if not target.is_relative_to(self.root):
            raise ArtifactPathError("Artifact key escapes the configured storage root.")
        return target


class PublicStaticArtifactStore(LocalFileArtifactStore):
    provider = "public_static"

    def stage(self, key: str, content: bytes) -> StagedArtifact:
        raise PermissionError("Public static artifacts are repository-managed and read-only at runtime.")

    def finalize(self, staged: StagedArtifact) -> StoredArtifact:
        raise PermissionError("Public static artifacts are repository-managed and read-only at runtime.")

    def abort(self, staged: StagedArtifact) -> None:
        raise PermissionError("Public static artifacts are repository-managed and read-only at runtime.")

    def put(self, key: str, content: bytes) -> StoredArtifact:
        raise PermissionError("Public static artifacts are repository-managed and read-only at runtime.")


class FutureObjectStorageArtifactStore:
    provider = "object_storage"

    def stage(self, key: str, content: bytes) -> StagedArtifact:
        raise NotImplementedError("Object storage requires a deployment-specific adapter.")

    def finalize(self, staged: StagedArtifact) -> StoredArtifact:
        raise NotImplementedError("Object storage requires a deployment-specific adapter.")

    def abort(self, staged: StagedArtifact) -> None:
        raise NotImplementedError("Object storage requires a deployment-specific adapter.")

    def put(self, key: str, content: bytes) -> StoredArtifact:
        raise NotImplementedError("Object storage requires a deployment-specific adapter.")

    def get(self, key: str) -> bytes:
        raise NotImplementedError("Object storage requires a deployment-specific adapter.")


def validate_artifact_filename(filename: str) -> str:
    safe_filename = Path(filename).name
    if (
        not safe_filename
        or safe_filename != filename
        or any(character in filename for character in ('"', "\r", "\n"))
    ):
        raise ArtifactPathError("Artifact filename must not contain a path or control characters.")
    return safe_filename


def register_artifact(
    session: Session,
    principal: ProductPrincipal,
    *,
    stored: StoredArtifact,
    object_type: str,
    object_id: str,
    filename: str,
    content_type: str,
    project_id: str | None = None,
    report_id: str | None = None,
    sensitivity: str = "Internal",
    download_policy: str = "authorized",
    request_id: str | None = None,
) -> dict[str, Any]:
    authorize(principal, Permission.REPORT_WRITE)
    safe_filename = validate_artifact_filename(filename)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ArtifactPathError("Artifact content type is not allowed.")
    if sensitivity not in ALLOWED_SENSITIVITIES:
        raise ArtifactPathError("Artifact sensitivity is invalid.")
    if download_policy not in ALLOWED_DOWNLOAD_POLICIES:
        raise ArtifactPathError("Artifact download policy is invalid.")
    if download_policy != "authorized" and Role.ADMINISTRATOR not in principal.roles:
        raise AuthorizationError("Administrator approval is required for public artifact access.")
    record = {
        "id": new_id(),
        "organization_id": principal.organization_id,
        "object_type": object_type,
        "object_id": object_id,
        "project_id": project_id,
        "report_id": report_id,
        "filename": safe_filename,
        "content_type": content_type,
        "size_bytes": stored.size_bytes,
        "checksum": stored.checksum,
        "provider": stored.provider,
        "storage_key": stored.key,
        "sensitivity": sensitivity,
        "download_policy": download_policy,
        "created_by": principal.user_id,
        "created_at": utc_now(),
    }
    try:
        session.execute(artifacts.insert().values(**record))
    except IntegrityError as exc:
        raise ProductConflict("Artifact metadata references an unavailable object.") from exc
    append_event(
        session,
        principal=principal,
        action="artifact_register",
        object_type="artifacts",
        object_id=record["id"],
        details={"provider": stored.provider, "content_type": content_type, "size_bytes": stored.size_bytes},
        request_id=request_id,
    )
    return record


def download_artifact(
    session: Session,
    principal: ProductPrincipal,
    store: ArtifactStore,
    artifact_id: str,
    *,
    request_id: str | None = None,
) -> tuple[dict[str, Any], bytes]:
    row = session.execute(select(artifacts).where(artifacts.c.id == artifact_id)).mappings().first()
    if not row:
        raise ProductNotFound("Artifact was not found.")
    record = dict(row)
    authorize_object(
        principal,
        Permission.READ_DATA,
        organization_id=record.get("organization_id"),
        project_id=record.get("project_id"),
    )
    if record["download_policy"] not in {"public", "approved"}:
        authorize(principal, Permission.ARTIFACT_DOWNLOAD)
    if store.provider != record["provider"]:
        raise ProductConflict("Artifact provider does not match the configured store.")
    try:
        content = store.get(record["storage_key"])
    except FileNotFoundError as exc:
        raise ProductNotFound("Artifact content was not found.") from exc
    if hashlib.sha256(content).hexdigest() != record["checksum"]:
        raise ProductConflict("Artifact checksum validation failed.")
    append_event(
        session,
        principal=principal,
        action="artifact_download",
        object_type="artifacts",
        object_id=artifact_id,
        details={"download_policy": record["download_policy"]},
        request_id=request_id,
    )
    return record, content


def _stored(key: str, content: bytes, provider: str) -> StoredArtifact:
    return StoredArtifact(
        key=key.replace("\\", "/"),
        size_bytes=len(content),
        checksum=hashlib.sha256(content).hexdigest(),
        provider=provider,
    )
