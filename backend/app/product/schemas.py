from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.product.principal import Role


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AskMessageRequest(StrictRequest):
    role: str
    safe_question: str | None = Field(default=None, max_length=500)
    safe_answer_summary: str | None = Field(default=None, max_length=2000)
    entity_context: dict[str, Any] = Field(default_factory=dict)
    prompt_version: str | None = Field(default=None, max_length=100)
    provider_mode: str = Field(default="none", max_length=40)
    safety_status: str = Field(default="accepted", max_length=40)


class IngestionValidationOptions(StrictRequest):
    required_fields: tuple[str, ...] = ()
    unique_key: str | None = Field(default=None, max_length=120)
    expected_srid: int | None = Field(default=None, ge=1)
    expected_rows: int | None = Field(default=None, ge=0)
    max_null_rate: float = Field(default=1.0, ge=0, le=1)
    source_date: datetime | None = None
    freshness_days: int | None = Field(default=None, ge=0)


class IngestionRunRequest(StrictRequest):
    source_id: str = Field(max_length=36)
    domain: str = Field(max_length=80)
    schema_version: str = Field(max_length=80)
    staged_key: str | None = Field(default=None, max_length=500)
    rows: list[dict[str, Any]] = Field(max_length=10_000)
    apply: bool = False
    validation_options: IngestionValidationOptions = Field(default_factory=IngestionValidationOptions)


class ArtifactUploadRequest(StrictRequest):
    key: str = Field(max_length=500)
    filename: str = Field(max_length=255)
    content_type: str = Field(max_length=160)
    content_base64: str = Field(max_length=10_000_000)
    object_type: str = Field(max_length=80)
    object_id: str = Field(max_length=120)
    project_id: str | None = Field(default=None, max_length=36)
    report_id: str | None = Field(default=None, max_length=36)
    sensitivity: Literal["Public", "Internal", "Confidential"] = "Internal"
    download_policy: Literal["authorized", "approved", "public"] = "authorized"


class JobSubmitRequest(StrictRequest):
    job_type: str = Field(max_length=100)
    idempotency_key: str = Field(max_length=200)
    payload_reference: str | None = Field(default=None, max_length=600)
    max_attempts: int = Field(default=1, ge=1, le=10)


class UserRolesRequest(StrictRequest):
    roles: list[Role] = Field(min_length=1, max_length=len(Role))


SourceStatus = Literal[
    "Available",
    "Available with limitations",
    "Missing",
    "Stale",
    "Validation failed",
    "Disabled",
    "Not required",
]


class DataSourceCreateRequest(StrictRequest):
    domain: str = Field(min_length=1, max_length=80)
    source_name: str = Field(min_length=1, max_length=240)
    provider_system: str = Field(min_length=1, max_length=160)
    authority_level: str = Field(min_length=1, max_length=80)
    owner_role: str = Field(min_length=1, max_length=40)
    source_date: datetime | None = None
    ingestion_date: datetime | None = None
    validation_date: datetime | None = None
    expected_refresh: str | None = Field(default=None, max_length=80)
    schema_version: str = Field(min_length=1, max_length=80)
    sensitivity: str = Field(default="Public", min_length=1, max_length=80)
    licensing: str | None = Field(default=None, max_length=4000)
    status: SourceStatus
    limitations: str | None = Field(default=None, max_length=4000)
    ingestion_method: str = Field(min_length=1, max_length=120)


class DataSourceStatusRequest(StrictRequest):
    status: SourceStatus
    limitations: str | None = Field(default=None, max_length=4000)
