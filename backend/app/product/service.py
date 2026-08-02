from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Table, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.product.audit import append_event, redact
from app.product.models import (
    ask_cfs_conversations,
    ask_cfs_messages,
    economic_scenario_versions,
    economic_scenarios,
    new_id,
    planning_snapshot_versions,
    planning_snapshots,
    project_members,
    projects,
    property_reviews,
    report_bucket_items,
    reports,
    utc_now,
)
from app.product.principal import (
    AuthorizationError,
    Permission,
    ProductPrincipal,
    Role,
    authorize_object,
)


class ProductNotFound(LookupError):
    pass


class ProductConflict(RuntimeError):
    pass


class ProductValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ResourceDefinition:
    table: Table
    write_permission: Permission
    version_table: Table | None = None
    version_parent_column: str | None = None


RESOURCES = {
    "projects": ResourceDefinition(projects, Permission.PROJECT_WRITE),
    "planning_snapshots": ResourceDefinition(
        planning_snapshots,
        Permission.PLANNING_WRITE,
        planning_snapshot_versions,
        "snapshot_id",
    ),
    "economic_scenarios": ResourceDefinition(
        economic_scenarios,
        Permission.ECONOMICS_WRITE,
        economic_scenario_versions,
        "scenario_id",
    ),
    "property_reviews": ResourceDefinition(property_reviews, Permission.INVESTMENTS_WRITE),
    "reports": ResourceDefinition(reports, Permission.REPORT_WRITE),
    "report_bucket_items": ResourceDefinition(report_bucket_items, Permission.REPORT_WRITE),
    "ask_cfs_conversations": ResourceDefinition(
        ask_cfs_conversations, Permission.ASK_CFS
    ),
}
PROTECTED_COLUMNS = {
    "id",
    "organization_id",
    "created_by",
    "created_at",
    "updated_at",
    "archived_at",
    "current_version",
}


class ProductService:
    def __init__(self, session: Session, principal: ProductPrincipal, request_id: str | None = None) -> None:
        self.session = session
        self.principal = principal
        self.request_id = request_id

    def create(self, resource: str, values: dict[str, Any]) -> dict[str, Any]:
        definition = self._definition(resource)
        values = self._with_valid_relationships(resource, values)
        project_id = _string(values.get("project_id"))
        self._authorize_project_reference(
            definition.write_permission,
            organization_id=self.principal.organization_id,
            project_id=project_id,
        )
        values = self._with_source_evidence(resource, values)
        now = utc_now()
        record = self._clean_values(definition.table, values)
        record.update(
            {
                "id": new_id(),
                "created_at": now,
                **({"updated_at": now} if "updated_at" in definition.table.c else {}),
                **(
                    {"organization_id": self.principal.organization_id}
                    if "organization_id" in definition.table.c
                    else {}
                ),
                **(
                    {"created_by": self.principal.user_id}
                    if "created_by" in definition.table.c
                    else {}
                ),
                **(
                    {"user_id": self.principal.user_id}
                    if resource == "ask_cfs_conversations" and self.principal.user_id
                    else {}
                ),
            }
        )
        try:
            self.session.execute(definition.table.insert().values(**record))
            if resource == "projects" and self.principal.user_id:
                self.session.execute(
                    project_members.insert().values(
                        id=new_id(),
                        project_id=record["id"],
                        user_id=self.principal.user_id,
                        role="Owner",
                        created_at=now,
                    )
                )
            if definition.version_table is not None:
                self._insert_version(definition, record, 1)
            append_event(
                self.session,
                principal=self.principal,
                action="create",
                object_type=resource,
                object_id=record["id"],
                details={"fields": sorted(values)},
                request_id=self.request_id,
            )
            self.session.flush()
        except IntegrityError as exc:
            raise ProductConflict(f"Unable to create {resource}; a required or unique value conflicts.") from exc
        return self.get(resource, record["id"])

    def get(self, resource: str, object_id: str) -> dict[str, Any]:
        definition = self._definition(resource)
        row = self.session.execute(
            select(definition.table).where(definition.table.c.id == object_id)
        ).mappings().first()
        if not row:
            raise ProductNotFound(f"{resource} record was not found.")
        record = dict(row)
        self._authorize_object(
            Permission.READ_DATA,
            organization_id=_string(record.get("organization_id")),
            project_id=object_id if resource == "projects" else _string(record.get("project_id")),
        )
        if (
            resource == "ask_cfs_conversations"
            and Role.ADMINISTRATOR not in self.principal.roles
            and record.get("user_id") != self.principal.user_id
        ):
            raise AuthorizationError("Conversation belongs to another user.")
        if self._viewer_only and not self._viewer_can_read(resource, record):
            raise ProductNotFound(f"{resource} record was not found.")
        return record

    def list(
        self,
        resource: str,
        *,
        page: int = 1,
        page_size: int = 50,
        project_id: str | None = None,
        status: str | None = None,
        sort: str = "-updated_at",
    ) -> tuple[list[dict[str, Any]], int]:
        definition = self._definition(resource)
        self._authorize_object(
            Permission.READ_DATA,
            organization_id=self.principal.organization_id,
            project_id=project_id,
        )
        table = definition.table
        statement = select(table)
        count_statement = select(func.count()).select_from(table)
        clauses = []
        if "organization_id" in table.c:
            if self.principal.organization_id:
                clauses.append(table.c.organization_id == self.principal.organization_id)
            else:
                clauses.append(table.c.organization_id.is_(None))
        allowed_projects = self._project_ids()
        if Role.ADMINISTRATOR not in self.principal.roles:
            if resource == "projects":
                clauses.append(table.c.id.in_(allowed_projects) if allowed_projects else table.c.id.is_(None))
            elif "project_id" in table.c and not project_id:
                project_scope = table.c.project_id.in_(allowed_projects) if allowed_projects else table.c.project_id.is_(None)
                clauses.append(or_(table.c.project_id.is_(None), project_scope))
            if resource == "ask_cfs_conversations" and "user_id" in table.c:
                clauses.append(table.c.user_id == self.principal.user_id)
        if self._viewer_only and resource != "ask_cfs_conversations":
            approval = self._viewer_approval_clause(resource, table)
            clauses.append(approval)
        if project_id and "project_id" in table.c:
            clauses.append(table.c.project_id == project_id)
        if "archived_at" in table.c:
            clauses.append(
                table.c.archived_at.is_not(None)
                if status == "Archived"
                else table.c.archived_at.is_(None)
            )
        if status and "status" in table.c:
            clauses.append(table.c.status == status)
        if clauses:
            statement = statement.where(*clauses)
            count_statement = count_statement.where(*clauses)
        sort_name = sort.removeprefix("-")
        if sort_name not in table.c or sort_name not in {
            "created_at",
            "updated_at",
            "name",
            "title",
            "status",
        }:
            sort_name = "updated_at" if "updated_at" in table.c else "created_at"
        order = table.c[sort_name].desc() if sort.startswith("-") else table.c[sort_name].asc()
        page = max(page, 1)
        page_size = min(max(page_size, 1), 100)
        rows = self.session.execute(
            statement.order_by(order).offset((page - 1) * page_size).limit(page_size)
        ).mappings()
        return [dict(row) for row in rows], int(self.session.execute(count_statement).scalar_one())

    def update(
        self,
        resource: str,
        object_id: str,
        values: dict[str, Any],
        *,
        expected_updated_at: str | None = None,
    ) -> dict[str, Any]:
        definition = self._definition(resource)
        current = self.get(resource, object_id)
        self._authorize_project_reference(
            definition.write_permission,
            organization_id=_string(current.get("organization_id")),
            project_id=_string(current.get("project_id")),
        )
        if expected_updated_at and _iso(current.get("updated_at")) != expected_updated_at:
            raise ProductConflict("The record changed after it was loaded.")
        values = self._with_valid_relationships(resource, values, current=current)
        if "project_id" in definition.table.c and "project_id" in values:
            self._authorize_project_reference(
                definition.write_permission,
                organization_id=_string(current.get("organization_id")),
                project_id=_string(values.get("project_id")),
            )
        values = self._with_source_evidence(resource, values)
        changes = self._clean_values(definition.table, values)
        if "updated_at" in definition.table.c:
            changes["updated_at"] = utc_now()
        if not changes:
            return current
        self.session.execute(
            update(definition.table).where(definition.table.c.id == object_id).values(**changes)
        )
        append_event(
            self.session,
            principal=self.principal,
            action="update",
            object_type=resource,
            object_id=object_id,
            details={"fields": sorted(changes)},
            request_id=self.request_id,
        )
        return self.get(resource, object_id)

    def version(self, resource: str, object_id: str, note: str | None = None) -> dict[str, Any]:
        definition = self._definition(resource)
        if definition.version_table is None:
            raise ProductConflict(f"{resource} does not support version records.")
        current = self.get(resource, object_id)
        self._authorize_object(
            definition.write_permission,
            organization_id=_string(current.get("organization_id")),
            project_id=_string(current.get("project_id")),
        )
        version_number = int(current.get("current_version") or 1) + 1
        current["version_note"] = note
        self._insert_version(definition, current, version_number)
        self.session.execute(
            update(definition.table)
            .where(definition.table.c.id == object_id)
            .values(current_version=version_number, updated_at=utc_now())
        )
        append_event(
            self.session,
            principal=self.principal,
            action="version",
            object_type=resource,
            object_id=object_id,
            details={"version": version_number},
            request_id=self.request_id,
        )
        return self.get(resource, object_id)

    def archive(self, resource: str, object_id: str) -> dict[str, Any]:
        definition = self._definition(resource)
        current = self.get(resource, object_id)
        self._authorize_object(
            definition.write_permission,
            organization_id=_string(current.get("organization_id")),
            project_id=_string(current.get("project_id")),
        )
        changes: dict[str, Any] = {}
        if "archived_at" in definition.table.c:
            changes["archived_at"] = utc_now()
        if "status" in definition.table.c:
            changes["status"] = "Archived"
        if "updated_at" in definition.table.c:
            changes["updated_at"] = utc_now()
        self.session.execute(
            update(definition.table).where(definition.table.c.id == object_id).values(**changes)
        )
        append_event(
            self.session,
            principal=self.principal,
            action="archive",
            object_type=resource,
            object_id=object_id,
            request_id=self.request_id,
        )
        return self.get(resource, object_id)

    def add_ask_message(
        self,
        conversation_id: str,
        *,
        role: str,
        safe_question: str | None = None,
        safe_answer_summary: str | None = None,
        entity_context: dict[str, Any] | None = None,
        prompt_version: str | None = None,
        provider_mode: str = "none",
        safety_status: str = "accepted",
    ) -> dict[str, Any]:
        conversation = self.get("ask_cfs_conversations", conversation_id)
        self._authorize_object(
            Permission.ASK_CFS,
            organization_id=_string(conversation.get("organization_id")),
            project_id=_string(conversation.get("project_id")),
        )
        if role not in {"user", "assistant"}:
            raise ProductConflict("Ask CFS message role must be user or assistant.")
        entity_context = self._source_context(entity_context or {})
        message = {
            "id": new_id(),
            "conversation_id": conversation_id,
            "role": role,
            "safe_question": (safe_question or "")[:500] or None,
            "safe_answer_summary": (safe_answer_summary or "")[:2000] or None,
            "entity_context": entity_context or {},
            "prompt_version": prompt_version,
            "provider_mode": provider_mode,
            "safety_status": safety_status,
            "created_at": utc_now(),
        }
        self.session.execute(ask_cfs_messages.insert().values(**message))
        append_event(
            self.session,
            principal=self.principal,
            action="ask_cfs_message",
            object_type="ask_cfs_conversations",
            object_id=conversation_id,
            details={"role": role, "provider_mode": provider_mode, "safety_status": safety_status},
            request_id=self.request_id,
        )
        return message

    def reset_ask_conversation(self, conversation_id: str) -> dict[str, Any]:
        conversation = self.get("ask_cfs_conversations", conversation_id)
        self._authorize_object(
            Permission.ASK_CFS,
            organization_id=_string(conversation.get("organization_id")),
            project_id=_string(conversation.get("project_id")),
        )
        self.session.execute(
            delete(ask_cfs_messages).where(ask_cfs_messages.c.conversation_id == conversation_id)
        )
        self.session.execute(
            update(ask_cfs_conversations)
            .where(ask_cfs_conversations.c.id == conversation_id)
            .values(reset_at=utc_now(), updated_at=utc_now())
        )
        append_event(
            self.session,
            principal=self.principal,
            action="ask_cfs_reset",
            object_type="ask_cfs_conversations",
            object_id=conversation_id,
            request_id=self.request_id,
        )
        return self.get("ask_cfs_conversations", conversation_id)

    def _definition(self, resource: str) -> ResourceDefinition:
        try:
            return RESOURCES[resource]
        except KeyError as exc:
            raise ProductNotFound("Unknown Product V1 resource.") from exc

    @property
    def _viewer_only(self) -> bool:
        return self.principal.roles == frozenset({Role.VIEWER})

    def _viewer_can_read(self, resource: str, record: dict[str, Any]) -> bool:
        if resource == "ask_cfs_conversations":
            return True
        if resource == "report_bucket_items":
            report_id = _string(record.get("report_id"))
            return bool(
                report_id
                and self.session.scalar(
                    select(func.count())
                    .select_from(reports)
                    .where(
                        reports.c.id == report_id,
                        reports.c.organization_id == self.principal.organization_id,
                        func.lower(reports.c.status) == "approved",
                    )
                )
            )
        status = record.get("review_status", record.get("status"))
        return isinstance(status, str) and status.strip().casefold() == "approved"

    def _viewer_approval_clause(self, resource: str, table: Table):
        if resource == "report_bucket_items":
            return table.c.report_id.in_(
                select(reports.c.id).where(
                    reports.c.organization_id == self.principal.organization_id,
                    func.lower(reports.c.status) == "approved",
                )
            )
        column = table.c.review_status if "review_status" in table.c else table.c.status
        return func.lower(column) == "approved"

    def _project_ids(self) -> frozenset[str]:
        project_ids = set(self.principal.project_ids)
        if self.principal.user_id:
            project_ids.update(
                str(project_id)
                for project_id in self.session.execute(
                    select(project_members.c.project_id).where(
                        project_members.c.user_id == self.principal.user_id
                    )
                ).scalars()
            )
        return frozenset(project_ids)

    def _require_project_in_organization(self, project_id: str | None) -> None:
        if not project_id:
            return
        project = self.session.execute(
            select(projects.c.organization_id).where(projects.c.id == project_id)
        ).mappings().first()
        if project is None:
            raise ProductNotFound("Referenced project was not found.")
        if project["organization_id"] != self.principal.organization_id:
            raise AuthorizationError("Referenced project belongs to another organization.")

    def _authorize_project_reference(
        self,
        permission: Permission,
        *,
        organization_id: str | None,
        project_id: str | None,
    ) -> None:
        self._authorize_object(
            permission,
            organization_id=organization_id,
            project_id=project_id,
        )
        self._require_project_in_organization(project_id)

    def _with_source_evidence(
        self,
        resource: str,
        values: dict[str, Any],
    ) -> dict[str, Any]:
        context_field = {
            "ask_cfs_conversations": "product_context",
            "report_bucket_items": "payload",
            "reports": "payload",
        }.get(resource)
        if not context_field or context_field not in values:
            return values
        return {
            **values,
            context_field: self._source_context(values[context_field]),
        }

    def _with_valid_relationships(
        self,
        resource: str,
        values: dict[str, Any],
        *,
        current: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if resource != "report_bucket_items":
            return values
        proposed = {**(current or {}), **values}
        report_id = _string(proposed.get("report_id"))
        if not report_id:
            return values
        report = self.session.execute(
            select(reports.c.organization_id, reports.c.project_id).where(reports.c.id == report_id)
        ).mappings().first()
        if report is None:
            raise ProductNotFound("Referenced report was not found.")
        if report["organization_id"] != self.principal.organization_id:
            raise AuthorizationError("Referenced report belongs to another organization.")
        project_id = _string(proposed.get("project_id"))
        report_project_id = _string(report["project_id"])
        if project_id and report_project_id and project_id != report_project_id:
            raise ProductConflict("Report bucket project does not match its report.")
        if current is None and report_project_id and not project_id:
            return {**values, "project_id": report_project_id}
        return values

    def _source_context(self, context: Any) -> Any:
        # Local import keeps the registry's existing service error imports acyclic.
        from app.product.source_registry import with_source_evidence

        return with_source_evidence(self.session, self.principal, redact(context))

    def _authorize_object(
        self,
        permission: Permission,
        *,
        organization_id: str | None,
        project_id: str | None = None,
    ) -> None:
        principal = self.principal
        if project_id and project_id not in principal.project_ids and self.principal.user_id:
            principal = replace(principal, project_ids=self._project_ids())
        authorize_object(
            principal,
            permission,
            organization_id=organization_id,
            project_id=project_id,
        )

    @staticmethod
    def _clean_values(table: Table, values: dict[str, Any]) -> dict[str, Any]:
        unknown = sorted(set(values) - set(table.c.keys()))
        protected = sorted(set(values) & PROTECTED_COLUMNS)
        if unknown:
            raise ProductValidationError("Unknown fields: " + ", ".join(unknown))
        if protected:
            raise ProductValidationError("Read-only fields: " + ", ".join(protected))
        for key, value in values.items():
            maximum = getattr(table.c[key].type, "length", None)
            if maximum and isinstance(value, str) and len(value) > maximum:
                raise ProductValidationError(f"{key} exceeds {maximum} characters.")
        return {
            key: redact(value) if isinstance(table.c[key].type, JSON) else value
            for key, value in values.items()
        }

    def _insert_version(
        self,
        definition: ResourceDefinition,
        record: dict[str, Any],
        version_number: int,
    ) -> None:
        assert definition.version_table is not None
        assert definition.version_parent_column is not None
        if definition.table is planning_snapshots:
            values = {
                "payload": {
                    "included_sections": record.get("included_sections") or [],
                    "map_state": record.get("map_state") or {},
                    "payload": record.get("payload") or {},
                    "review_status": record.get("review_status"),
                }
            }
        else:
            values = {
                "assumptions": record.get("assumptions") or {},
                "outputs": record.get("outputs") or {},
            }
        self.session.execute(
            definition.version_table.insert().values(
                id=new_id(),
                **{definition.version_parent_column: record["id"]},
                version_number=version_number,
                notes=record.get("version_note") or record.get("notes"),
                created_by=self.principal.user_id,
                created_at=utc_now(),
                **values,
            )
        )


def _string(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value is not None else None
