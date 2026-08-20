from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
)


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
product_metadata = MetaData(naming_convention=NAMING_CONVENTION)


organizations = Table(
    "organizations",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("name", String(200), nullable=False),
    Column("slug", String(100), nullable=False, unique=True),
    Column("status", String(40), nullable=False, default="Active"),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)

users = Table(
    "users",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("external_subject", String(200), nullable=False, unique=True),
    Column("email", String(320)),
    Column("display_name", String(200), nullable=False),
    Column("roles", JSON, nullable=False, default=list),
    Column("status", String(40), nullable=False, default="Active"),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_users_organization", users.c.organization_id)

user_preferences = Table(
    "user_preferences",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
    Column("preferences", JSON, nullable=False, default=dict),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)

projects = Table(
    "projects",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("name", String(240), nullable=False),
    Column("project_type", String(60), nullable=False, default="General"),
    Column("status", String(40), nullable=False, default="Draft"),
    Column("description", Text),
    Column("payload", JSON, nullable=False, default=dict),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_projects_organization_status", projects.c.organization_id, projects.c.status)

project_members = Table(
    "project_members",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("role", String(40), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    UniqueConstraint("project_id", "user_id"),
)

project_workflow_states = Table(
    "project_workflow_states",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    Column("stage", String(80), nullable=False),
    Column("status", String(40), nullable=False),
    Column("notes", Text),
    Column("changed_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_project_workflow_project_created", project_workflow_states.c.project_id, project_workflow_states.c.created_at)

planning_snapshots = Table(
    "planning_snapshots",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("title", String(240), nullable=False),
    Column("review_status", String(40), nullable=False, default="Draft"),
    Column("notes", Text),
    Column("included_sections", JSON, nullable=False, default=list),
    Column("map_state", JSON, nullable=False, default=dict),
    Column("payload", JSON, nullable=False, default=dict),
    Column("current_version", Integer, nullable=False, default=1),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_planning_snapshots_project", planning_snapshots.c.project_id, planning_snapshots.c.updated_at)

planning_snapshot_versions = Table(
    "planning_snapshot_versions",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("snapshot_id", ForeignKey("planning_snapshots.id", ondelete="CASCADE"), nullable=False),
    Column("version_number", Integer, nullable=False),
    Column("payload", JSON, nullable=False),
    Column("notes", Text),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    UniqueConstraint("snapshot_id", "version_number"),
)

economic_scenarios = Table(
    "economic_scenarios",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("name", String(240), nullable=False),
    Column("status", String(40), nullable=False, default="Draft"),
    Column("assumptions", JSON, nullable=False, default=dict),
    Column("outputs", JSON, nullable=False, default=dict),
    Column("comparison_set_id", String(36)),
    Column("notes", Text),
    Column("payload", JSON, nullable=False, default=dict),
    Column("current_version", Integer, nullable=False, default=1),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_economic_scenarios_project", economic_scenarios.c.project_id, economic_scenarios.c.updated_at)

economic_scenario_versions = Table(
    "economic_scenario_versions",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("scenario_id", ForeignKey("economic_scenarios.id", ondelete="CASCADE"), nullable=False),
    Column("version_number", Integer, nullable=False),
    Column("assumptions", JSON, nullable=False),
    Column("outputs", JSON, nullable=False),
    Column("notes", Text),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    UniqueConstraint("scenario_id", "version_number"),
)

property_reviews = Table(
    "property_reviews",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=False),
    # Legacy reference retained for schema and record compatibility.
    Column("opportunity_id", String(120), nullable=True),
    Column("parcel_id", String(120)),
    Column("review_status", String(40), nullable=False, default="Not Reviewed"),
    Column("findings", JSON, nullable=False, default=dict),
    Column("notes", Text),
    Column("reviewed_by", ForeignKey("users.id"), nullable=True),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_property_reviews_project", property_reviews.c.project_id, property_reviews.c.updated_at)

reports = Table(
    "reports",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("report_type", String(80), nullable=False),
    Column("title", String(240), nullable=False),
    Column("status", String(40), nullable=False, default="Draft"),
    Column("payload", JSON, nullable=False, default=dict),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_reports_project", reports.c.project_id, reports.c.updated_at)

report_bucket_items = Table(
    "report_bucket_items",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("report_id", ForeignKey("reports.id", ondelete="CASCADE"), nullable=True),
    Column("object_type", String(80), nullable=False),
    Column("object_id", String(120), nullable=False),
    Column("title", String(240), nullable=False),
    Column("payload", JSON, nullable=False, default=dict),
    Column("position", Integer),
    Column("include_in_print", Boolean, nullable=False, default=True),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("archived_at", DateTime(timezone=True)),
)
Index("ix_report_bucket_project_position", report_bucket_items.c.project_id, report_bucket_items.c.position)

ask_cfs_conversations = Table(
    "ask_cfs_conversations",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("user_id", ForeignKey("users.id"), nullable=True),
    Column("title", String(240), nullable=False),
    Column("product_context", JSON, nullable=False, default=dict),
    Column("retention_until", DateTime(timezone=True)),
    Column("reset_at", DateTime(timezone=True)),
    Column("archived_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_ask_conversations_user", ask_cfs_conversations.c.user_id, ask_cfs_conversations.c.updated_at)

ask_cfs_messages = Table(
    "ask_cfs_messages",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("conversation_id", ForeignKey("ask_cfs_conversations.id", ondelete="CASCADE"), nullable=False),
    Column("role", String(20), nullable=False),
    Column("safe_question", Text),
    Column("safe_answer_summary", Text),
    Column("entity_context", JSON, nullable=False, default=dict),
    Column("prompt_version", String(100)),
    Column("provider_mode", String(40), nullable=False, default="none"),
    Column("safety_status", String(40), nullable=False, default="accepted"),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_ask_messages_conversation", ask_cfs_messages.c.conversation_id, ask_cfs_messages.c.created_at)

data_sources = Table(
    "data_sources",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("domain", String(80), nullable=False),
    Column("source_name", String(240), nullable=False),
    Column("provider_system", String(160), nullable=False),
    Column("authority_level", String(80), nullable=False),
    Column("owner_role", String(40), nullable=False),
    Column("source_date", DateTime(timezone=True)),
    Column("ingestion_date", DateTime(timezone=True)),
    Column("validation_date", DateTime(timezone=True)),
    Column("expected_refresh", String(80)),
    Column("schema_version", String(80), nullable=False),
    Column("sensitivity", String(80), nullable=False, default="Public"),
    Column("licensing", Text),
    Column("status", String(80), nullable=False),
    Column("limitations", Text),
    Column("ingestion_method", String(120), nullable=False),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_data_sources_domain_status", data_sources.c.domain, data_sources.c.status)

ingestion_runs = Table(
    "ingestion_runs",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("source_id", ForeignKey("data_sources.id"), nullable=False),
    Column("mode", String(20), nullable=False),
    Column("status", String(40), nullable=False),
    Column("checksum", String(64), nullable=False),
    Column("schema_version", String(80), nullable=False),
    Column("staged_key", String(500)),
    Column("input_rows", Integer, nullable=False, default=0),
    Column("accepted_rows", Integer, nullable=False, default=0),
    Column("rejected_rows", Integer, nullable=False, default=0),
    Column("validation_summary", JSON, nullable=False, default=dict),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("started_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("completed_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_ingestion_runs_source_created", ingestion_runs.c.source_id, ingestion_runs.c.created_at)

data_quality_results = Table(
    "data_quality_results",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("ingestion_run_id", ForeignKey("ingestion_runs.id", ondelete="CASCADE"), nullable=True),
    Column("source_id", ForeignKey("data_sources.id"), nullable=True),
    Column("domain", String(80), nullable=False),
    Column("rule_id", String(120), nullable=False),
    Column("severity", String(20), nullable=False),
    Column("status", String(40), nullable=False),
    Column("metric_name", String(120)),
    Column("expected_value", String(240)),
    Column("actual_value", String(240)),
    Column("details", JSON, nullable=False, default=dict),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_quality_results_run", data_quality_results.c.ingestion_run_id, data_quality_results.c.status)

artifacts = Table(
    "artifacts",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("object_type", String(80), nullable=False),
    Column("object_id", String(120), nullable=False),
    Column("project_id", ForeignKey("projects.id"), nullable=True),
    Column("report_id", ForeignKey("reports.id"), nullable=True),
    Column("filename", String(255), nullable=False),
    Column("content_type", String(160), nullable=False),
    Column("size_bytes", Integer, nullable=False),
    Column("checksum", String(64), nullable=False),
    Column("provider", String(40), nullable=False),
    Column("storage_key", String(600), nullable=False),
    Column("sensitivity", String(80), nullable=False, default="Internal"),
    Column("download_policy", String(80), nullable=False, default="authorized"),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_artifacts_object", artifacts.c.object_type, artifacts.c.object_id)

audit_events = Table(
    "audit_events",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("actor_user_id", ForeignKey("users.id"), nullable=True),
    Column("request_id", String(100)),
    Column("action", String(80), nullable=False),
    Column("object_type", String(80), nullable=False),
    Column("object_id", String(120)),
    Column("outcome", String(40), nullable=False, default="success"),
    Column("details", JSON, nullable=False, default=dict),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
)
Index("ix_audit_events_object", audit_events.c.object_type, audit_events.c.object_id, audit_events.c.created_at)
Index("ix_audit_events_actor", audit_events.c.actor_user_id, audit_events.c.created_at)

background_jobs = Table(
    "background_jobs",
    product_metadata,
    Column("id", String(36), primary_key=True, default=new_id),
    Column("organization_id", ForeignKey("organizations.id"), nullable=True),
    Column("job_type", String(100), nullable=False),
    Column("status", String(40), nullable=False, default="queued"),
    Column("payload_reference", String(600)),
    Column("result_reference", String(600)),
    Column("idempotency_key", String(200), nullable=False, unique=True),
    Column("attempt", Integer, nullable=False, default=0),
    Column("max_attempts", Integer, nullable=False, default=1),
    Column("retry_policy", JSON, nullable=False, default=dict),
    Column("error", Text),
    Column("created_by", ForeignKey("users.id"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=utc_now),
    Column("started_at", DateTime(timezone=True)),
    Column("completed_at", DateTime(timezone=True)),
)
Index("ix_background_jobs_status", background_jobs.c.status, background_jobs.c.created_at)


PRODUCT_TABLES = {
    table.name: table
    for table in (
        organizations,
        users,
        user_preferences,
        projects,
        project_members,
        project_workflow_states,
        planning_snapshots,
        planning_snapshot_versions,
        economic_scenarios,
        economic_scenario_versions,
        property_reviews,
        reports,
        report_bucket_items,
        ask_cfs_conversations,
        ask_cfs_messages,
        data_sources,
        ingestion_runs,
        data_quality_results,
        artifacts,
        audit_events,
        background_jobs,
    )
}

# Legacy Investment mappings are retained for migration and schema compatibility.
# They are dormant and are not exposed as active Product V1 resources.
LEGACY_INVESTMENT_EQUIVALENTS = {
    "investment_projects": "investment_engagement",
    "saved_searches": "investment_saved_search",
    "opportunities": "investment_candidate_intake",
    "shortlist_items": "investment_saved_item / investment_engagement.shortlist_json",
    "underwriting_scenarios": "investment_underwriting_scenario",
}
