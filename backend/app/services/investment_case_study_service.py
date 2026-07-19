"""CFS Investment case-study workspace persistence and package sync."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.schemas.investment_case_studies import InvestmentCaseStudyPatch
from app.schemas.investment_engagements import (
    InvestmentEngagementPatch,
    InvestmentEngagementPayload,
    InvestmentEngagementShortlistRequest,
)
from app.schemas.investment_workspace import (
    InvestmentRecentWorkPayload,
    InvestmentSavedItemPayload,
    InvestmentSavedSearchPatch,
    InvestmentSavedSearchPayload,
)
from app.services.investment_engagement_service import (
    add_shortlist_item,
    create_engagement,
    get_engagement,
    list_engagements,
    update_engagement,
)
from app.services.investment_screening_service import SAFE_CAVEAT
from app.services.investment_workspace_service import (
    create_saved_item,
    create_saved_search,
    list_saved_searches,
    update_saved_search,
    record_recent_work,
)
from app.services.schema_guard import cloud_tables_exist

CASE_STUDY_TABLE = "investment_case_study"
REPO_ROOT = Path(__file__).resolve().parents[3]
CASE_STUDY_ROOT = REPO_ROOT / "case-studies"
MANIFEST_NAME = "case-study.json"


def list_case_studies(db: Session) -> dict[str, Any]:
    _ensure_table(db)
    rows = [_serialize(row) for row in db.execute(text(f"SELECT * FROM {CASE_STUDY_TABLE} ORDER BY updated_at DESC LIMIT 100")).mappings()]
    return {"case_studies": rows, "caveats": [SAFE_CAVEAT], "count": len(rows)}


def get_case_study(db: Session, slug: str) -> dict[str, Any] | None:
    _ensure_table(db)
    row = db.execute(text(f"SELECT * FROM {CASE_STUDY_TABLE} WHERE slug = :slug"), {"slug": slug}).mappings().first()
    return _serialize(row) if row else None


def update_case_study(db: Session, slug: str, patch: InvestmentCaseStudyPatch) -> dict[str, Any] | None:
    current = get_case_study(db, slug)
    if not current:
        return None
    data = patch.model_dump(exclude_unset=True)
    user_state = {**(current.get("user_state") or {})}
    if "analyst_note" in data:
        user_state["analyst_note"] = data["analyst_note"]
        user_state["source"] = "User Edited"
        user_state["updated_at"] = _now()
    package = {**(current.get("package") or {})}
    if data.get("active_parcel_id"):
        package["active_parcel_id"] = data["active_parcel_id"]
    status = data.get("status") or current["status"]
    current_stage = data.get("current_stage") or current["current_stage"]
    activity = _append_activity(
        current.get("activity") or [],
        "Case study updated",
        "Overview",
        "Analyst-edited case-study state was saved.",
        "User",
        current.get("source_package_version"),
    )
    db.execute(
        text(
            f"""
            UPDATE {CASE_STUDY_TABLE}
               SET status = :status,
                   current_stage = :current_stage,
                   active_parcel_id = :active_parcel_id,
                   priority_candidate_id = :priority_candidate_id,
                   package_json = CAST(:package_json AS jsonb),
                   user_state_json = CAST(:user_state_json AS jsonb),
                   activity_json = CAST(:activity_json AS jsonb),
                   updated_at = :updated_at
             WHERE slug = :slug
            """
        ),
        {
            "active_parcel_id": package.get("active_parcel_id"),
            "activity_json": json.dumps(activity, default=str),
            "current_stage": current_stage,
            "package_json": json.dumps(package, default=str),
            "priority_candidate_id": package.get("priority_candidate_id"),
            "slug": slug,
            "status": status,
            "updated_at": datetime.now(UTC),
            "user_state_json": json.dumps(user_state, default=str),
        },
    )
    return get_case_study(db, slug)


def duplicate_case_study(db: Session, slug: str) -> dict[str, Any] | None:
    current = get_case_study(db, slug)
    if not current:
        return None
    now = datetime.now(UTC)
    copy_slug = _unique_slug(db, f"{slug}-copy")
    package = deepcopy(current.get("package") or {})
    package["slug"] = copy_slug
    package["title"] = f"{current['title']} Copy"
    activity = _append_activity([], "Case study duplicated", "Overview", f"Copied from {slug}.", "User", current.get("source_package_version"))
    db.execute(
        text(
            f"""
            INSERT INTO {CASE_STUDY_TABLE} (
              id, engagement_id, slug, title, description, case_study_type, strategy, geography,
              status, current_stage, active_parcel_id, priority_candidate_id, manifest_path,
              source_package_version, package_json, user_state_json, activity_json,
              last_synced_at, created_at, updated_at
            ) VALUES (
              :id, :engagement_id, :slug, :title, :description, :case_study_type, :strategy, :geography,
              :status, :current_stage, :active_parcel_id, :priority_candidate_id, :manifest_path,
              :source_package_version, CAST(:package_json AS jsonb), '{{}}'::jsonb, CAST(:activity_json AS jsonb),
              :last_synced_at, :created_at, :updated_at
            )
            """
        ),
        {
            "active_parcel_id": package.get("active_parcel_id"),
            "activity_json": json.dumps(activity, default=str),
            "case_study_type": current.get("case_study_type"),
            "created_at": now,
            "current_stage": "Draft Copy",
            "description": current.get("description"),
            "engagement_id": current.get("engagement_id"),
            "geography": current.get("geography"),
            "id": str(uuid4()),
            "last_synced_at": None,
            "manifest_path": current.get("manifest_path"),
            "package_json": json.dumps(package, default=str),
            "priority_candidate_id": package.get("priority_candidate_id"),
            "slug": copy_slug,
            "source_package_version": current.get("source_package_version"),
            "status": "Draft",
            "strategy": current.get("strategy"),
            "title": package["title"],
            "updated_at": now,
        },
    )
    return get_case_study(db, copy_slug)


def archive_case_study(db: Session, slug: str) -> dict[str, Any] | None:
    return update_case_study(db, slug, InvestmentCaseStudyPatch(status="Archived", current_stage="Archived"))


def export_codex_brief(db: Session, slug: str) -> dict[str, Any] | None:
    case = get_case_study(db, slug)
    if not case:
        return None
    package = case.get("package") or {}
    artifacts = package.get("artifacts") or {}
    candidates = (artifacts.get("shortlisted_candidates") or {}).get("candidates") or []
    funnel = (artifacts.get("screening_funnel") or {}).get("counts") or {}
    deliverables = package.get("deliverables") or []
    brief = {
        "case_study_slug": slug,
        "current_stage": case.get("current_stage"),
        "current_status": case.get("status"),
        "strategy": case.get("strategy"),
        "funnel": funnel,
        "candidate_ids": [item.get("parcel_id") for item in candidates],
        "current_decisions": {item.get("parcel_id"): item.get("decision") for item in candidates},
        "current_assumptions": {
            "underwriting_status": package.get("underwriting_status"),
            "excel_workbook_status": package.get("excel_workbook_status"),
        },
        "missing_evidence": (artifacts.get("active_property_analysis") or {}).get("evidence_still_missing") or [],
        "open_tasks": package.get("next_action"),
        "deliverable_status": [{key: item.get(key) for key in ("title", "type", "status", "review_status", "path", "reference_id")} for item in deliverables],
        "package_paths": package.get("package_files") or {},
        "safety_rules": package.get("safety_rules") or [],
    }
    markdown = _brief_markdown(case, brief)
    return {"brief": brief, "markdown": markdown, "caveats": [SAFE_CAVEAT]}


def sync_case_study(db: Session, slug: str, *, dry_run: bool = False) -> dict[str, Any]:
    package = load_case_study_package(slug)
    if dry_run:
        existing = _get_case_row_if_table_exists(db, slug)
    else:
        _ensure_table(db)
        existing = _get_case_row_if_table_exists(db, slug)
    changes = ["validate package"]
    if existing:
        changes.append("update case-study metadata")
    else:
        changes.append("create case-study metadata")
    changes.extend(["upsert engagement criteria", "upsert shortlist references", "attach deliverable references", "record recent work"])
    conflicts = []
    if existing:
        existing_package = _json(existing.get("package_json"), {})
        existing_user_state = _json(existing.get("user_state_json"), {})
        if existing_user_state and existing_package != package:
            conflicts.append("user_state_preserved")
    if dry_run:
        return {"case_study": _summary_from_package(package), "changes": changes, "conflicts": conflicts, "dry_run": True}

    engagement = _upsert_engagement(db, package)
    case = _upsert_case_study(db, package, engagement["id"], conflicts)
    _upsert_shortlist_and_workspace(db, package, engagement["id"])
    record_recent_work(
        db,
        InvestmentRecentWorkPayload(
            activity_type="opened_case_study",
            context={"source": "Codex Sync", "stage": package["current_stage"]},
            label=package["title"],
            page="engagements",
            parcel_id=package.get("active_parcel_id"),
            reference_id=package["slug"],
            reference_type="case_study",
            strategy="development_land",
            summary=package["next_action"],
        ),
    )
    return {"case_study": case, "changes": changes, "conflicts": conflicts, "dry_run": False}


def load_case_study_package(slug: str) -> dict[str, Any]:
    manifest = _manifest_path(slug)
    package = json.loads(manifest.read_text(encoding="utf-8"))
    validate_case_study_package(package, manifest.parent)
    artifacts: dict[str, Any] = {}
    for key, relative_path in (package.get("package_files") or {}).items():
        path = _safe_package_path(manifest.parent, relative_path)
        if path.suffix.lower() == ".json":
            artifacts[key] = json.loads(path.read_text(encoding="utf-8"))
    return {**package, "artifacts": artifacts}


def validate_case_study_package(package: dict[str, Any], base_dir: Path | None = None) -> None:
    required = {
        "slug",
        "version",
        "title",
        "description",
        "status",
        "current_stage",
        "candidate_ids",
        "active_parcel_id",
        "priority_candidate_id",
        "package_files",
        "deliverables",
        "safety_rules",
    }
    missing = sorted(required - set(package))
    if missing:
        raise ValueError(f"Case-study package missing required fields: {', '.join(missing)}")
    _reject_sensitive_payload(package)
    if base_dir:
        for relative_path in (package.get("package_files") or {}).values():
            _safe_package_path(base_dir, relative_path)
        for deliverable in package.get("deliverables") or []:
            if deliverable.get("path"):
                _safe_package_path(base_dir, deliverable["path"])


def _ensure_table(db: Session) -> None:
    if cloud_tables_exist(db, [CASE_STUDY_TABLE]):
        return
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {CASE_STUDY_TABLE} (
              id text PRIMARY KEY,
              engagement_id text NOT NULL,
              slug text NOT NULL UNIQUE,
              title text NOT NULL,
              description text NOT NULL,
              case_study_type text NOT NULL,
              strategy text NOT NULL,
              geography text NOT NULL,
              status text NOT NULL,
              current_stage text NOT NULL,
              active_parcel_id text,
              priority_candidate_id text,
              manifest_path text NOT NULL,
              source_package_version text NOT NULL,
              package_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              user_state_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              activity_json jsonb NOT NULL DEFAULT '[]'::jsonb,
              last_synced_at timestamptz,
              created_at timestamptz NOT NULL,
              updated_at timestamptz NOT NULL
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{CASE_STUDY_TABLE}_updated ON {CASE_STUDY_TABLE} (updated_at DESC)"))


def _upsert_engagement(db: Session, package: dict[str, Any]) -> dict[str, Any]:
    engagement = package.get("engagement") or {}
    existing_id = _find_engagement_id(db, engagement)
    payload = InvestmentEngagementPayload(
        client_or_internal_label=package.get("client_label"),
        criteria=engagement.get("criteria") or [],
        engagement_name=engagement.get("engagement_name") or package["title"],
        engagement_status="In Review",
        engagement_type=engagement.get("engagement_type") or package.get("case_study_type") or "Case Study",
        minimum_acres=engagement.get("minimum_acres"),
        notes="Case-study parent engagement. Screening-level research only; not investment advice, appraisal, utility confirmation, entitlement advice, or environmental clearance.",
        property_type=engagement.get("property_type"),
        selected_strategy=engagement.get("selected_strategy") or "development_land",
        target_geography=engagement.get("target_geography") or package.get("geography"),
        timeline=engagement.get("timeline"),
    )
    if existing_id:
        return update_engagement(db, existing_id, InvestmentEngagementPatch(**payload.model_dump())) or get_engagement(db, existing_id) or {}
    return create_engagement(db, payload)


def _upsert_case_study(db: Session, package: dict[str, Any], engagement_id: str, conflicts: list[str]) -> dict[str, Any]:
    now = datetime.now(UTC)
    existing = _get_case_row_if_table_exists(db, package["slug"])
    user_state = _json(existing.get("user_state_json"), {}) if existing else {}
    activity = _json(existing.get("activity_json"), []) if existing else package.get("activity_seed") or []
    activity = _append_activity(activity, "Codex package synced", "Codex Sync", "Repository case-study package was synced into CFS Investment.", "Codex Sync", package["version"])
    if conflicts:
        activity = _append_activity(activity, "Sync Conflict", "Codex Sync", "User-edited state was preserved during package sync.", "Codex Sync", package["version"])
    params = {
        "active_parcel_id": package.get("active_parcel_id"),
        "activity_json": json.dumps(activity, default=str),
        "case_study_type": package.get("case_study_type"),
        "current_stage": package.get("current_stage"),
        "description": package.get("description"),
        "engagement_id": engagement_id,
        "geography": package.get("geography"),
        "last_synced_at": now,
        "manifest_path": str(_manifest_path(package["slug"]).relative_to(REPO_ROOT)),
        "package_json": json.dumps(package, default=str),
        "priority_candidate_id": package.get("priority_candidate_id"),
        "slug": package["slug"],
        "source_package_version": package.get("version"),
        "status": package.get("status"),
        "strategy": package.get("strategy"),
        "title": package.get("title"),
        "updated_at": now,
        "user_state_json": json.dumps(user_state, default=str),
    }
    if existing:
        db.execute(
            text(
                f"""
                UPDATE {CASE_STUDY_TABLE}
                   SET engagement_id = :engagement_id,
                       title = :title,
                       description = :description,
                       case_study_type = :case_study_type,
                       strategy = :strategy,
                       geography = :geography,
                       status = :status,
                       current_stage = :current_stage,
                       active_parcel_id = :active_parcel_id,
                       priority_candidate_id = :priority_candidate_id,
                       manifest_path = :manifest_path,
                       source_package_version = :source_package_version,
                       package_json = CAST(:package_json AS jsonb),
                       user_state_json = CAST(:user_state_json AS jsonb),
                       activity_json = CAST(:activity_json AS jsonb),
                       last_synced_at = :last_synced_at,
                       updated_at = :updated_at
                 WHERE slug = :slug
                """
            ),
            params,
        )
    else:
        db.execute(
            text(
                f"""
                INSERT INTO {CASE_STUDY_TABLE} (
                  id, engagement_id, slug, title, description, case_study_type, strategy, geography,
                  status, current_stage, active_parcel_id, priority_candidate_id, manifest_path,
                  source_package_version, package_json, user_state_json, activity_json,
                  last_synced_at, created_at, updated_at
                ) VALUES (
                  :id, :engagement_id, :slug, :title, :description, :case_study_type, :strategy, :geography,
                  :status, :current_stage, :active_parcel_id, :priority_candidate_id, :manifest_path,
                  :source_package_version, CAST(:package_json AS jsonb), CAST(:user_state_json AS jsonb), CAST(:activity_json AS jsonb),
                  :last_synced_at, :created_at, :updated_at
                )
                """
            ),
            {**params, "created_at": now, "id": str(uuid4())},
        )
    return get_case_study(db, package["slug"]) or {}


def _upsert_shortlist_and_workspace(db: Session, package: dict[str, Any], engagement_id: str) -> None:
    candidates = ((package.get("artifacts") or {}).get("shortlisted_candidates") or {}).get("candidates") or []
    for candidate in candidates:
        parcel_id = candidate["parcel_id"]
        status = "Finalist for Further Diligence" if parcel_id == package.get("priority_candidate_id") else "Needs Verification"
        add_shortlist_item(
            db,
            engagement_id,
            InvestmentEngagementShortlistRequest(
                item_id=parcel_id,
                item_type="parcel",
                notes=f"{candidate.get('review_band')}: {candidate.get('decision')}. Analyst score {candidate.get('screening_score')}.",
                status=status,
            ),
        )
        create_saved_item(
            db,
            InvestmentSavedItemPayload(
                engagement_id=engagement_id,
                item_reference_id=parcel_id,
                item_type="parcel",
                label=f"Case Study Candidate: {parcel_id}",
                parcel_id=parcel_id,
                status="Shortlisted" if parcel_id != package.get("candidate_ids", [])[-1] else "Needs Verification",
                strategy="development_land",
                summary=f"{candidate.get('decision')} - {candidate.get('review_band')}",
            ),
        )
    funnel = ((package.get("artifacts") or {}).get("screening_funnel") or {}).get("counts") or {}
    search_payload = InvestmentSavedSearchPayload(
        advanced_criteria={"case_study": package["slug"], "source": "Codex package"},
        essential_criteria={"minimum_acres": 100, "strategy": "development_land"},
        goal="Development land acquisition review",
        guided_or_advanced="advanced",
        location_type="Countywide",
        location_value=package.get("geography"),
        result_summary=funnel,
        search_name=f"{package['title']} Screening Funnel",
    )
    existing_search = next(
        (item.get("id") for item in list_saved_searches(db).get("searches", []) if item.get("search_name") == search_payload.search_name),
        None,
    )
    if existing_search:
        update_saved_search(db, existing_search, InvestmentSavedSearchPatch(**search_payload.model_dump()))
    else:
        create_saved_search(db, search_payload)
    for deliverable in package.get("deliverables") or []:
        if deliverable.get("reference_id"):
            create_saved_item(
                db,
                InvestmentSavedItemPayload(
                    engagement_id=engagement_id,
                    item_reference_id=deliverable["reference_id"],
                    item_type="report",
                    label=deliverable["title"],
                    parcel_id=package.get("active_parcel_id"),
                    status="Saved",
                    strategy="development_land",
                    summary=f"{deliverable.get('type')} - {deliverable.get('status')}",
                ),
            )


def _find_engagement_id(db: Session, engagement: dict[str, Any]) -> str | None:
    candidate_id = engagement.get("existing_engagement_id")
    engagement_rows = list_engagements(db).get("engagements") or []
    if candidate_id and any(item.get("id") == candidate_id for item in engagement_rows):
        return candidate_id
    match = next((item for item in engagement_rows if item.get("engagement_name") == engagement.get("engagement_name")), None)
    return match.get("id") if match else None


def _summary_from_package(package: dict[str, Any]) -> dict[str, Any]:
    return {
        "active_parcel_id": package.get("active_parcel_id"),
        "candidate_count": len(package.get("candidate_ids") or []),
        "current_stage": package.get("current_stage"),
        "priority_candidate_id": package.get("priority_candidate_id"),
        "slug": package.get("slug"),
        "status": package.get("status"),
        "title": package.get("title"),
    }


def _serialize(row: Any) -> dict[str, Any]:
    data = dict(row)
    package = _json(data.pop("package_json", {}), {})
    user_state = _json(data.pop("user_state_json", {}), {})
    activity = _json(data.pop("activity_json", []), [])
    artifacts = package.get("artifacts") or {}
    candidates = (artifacts.get("shortlisted_candidates") or {}).get("candidates") or []
    return {
        **data,
        "activity": activity,
        "candidate_count": len(candidates) or len(package.get("candidate_ids") or []),
        "deliverable_status": package.get("deliverable_status"),
        "package": package,
        "priority_candidate": next((item for item in candidates if item.get("parcel_id") == data.get("priority_candidate_id")), None),
        "research_completeness": package.get("research_completeness"),
        "underwriting_status": package.get("underwriting_status"),
        "user_state": user_state,
    }


def _get_case_row_if_table_exists(db: Session, slug: str) -> Any | None:
    try:
        return db.execute(text(f"SELECT * FROM {CASE_STUDY_TABLE} WHERE slug = :slug"), {"slug": slug}).mappings().first()
    except SQLAlchemyError:
        return None


def _manifest_path(slug: str) -> Path:
    if "/" in slug or "\\" in slug or ".." in slug:
        raise ValueError("Invalid case-study slug.")
    path = CASE_STUDY_ROOT / slug / MANIFEST_NAME
    if not path.exists():
        raise ValueError(f"Case-study manifest not found for {slug}.")
    return path


def _safe_package_path(base_dir: Path, relative_path: str) -> Path:
    path = (base_dir / relative_path).resolve()
    if not path.is_file():
        raise ValueError(f"Referenced case-study package file is missing: {relative_path}")
    if not (path == REPO_ROOT or REPO_ROOT in path.parents):
        raise ValueError("Case-study package references must remain inside the repository.")
    _scan_file_for_secrets(path)
    return path


def _scan_file_for_secrets(path: Path) -> None:
    text_value = path.read_text(encoding="utf-8").lower()
    blocked = ("database_url", "postgres://", "api_key", "access token", "password=", "x-vercel-protection-bypass")
    if any(term in text_value for term in blocked):
        raise ValueError(f"Referenced case-study package file contains restricted credential text: {path.name}")


def _reject_sensitive_payload(value: Any, key_path: str = "") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_lower = str(key).lower()
            if _unsafe_key(key_lower):
                raise ValueError(f"Restricted case-study field is not allowed: {key_path}{key}")
            _reject_sensitive_payload(item, f"{key_path}{key}.")
    elif isinstance(value, list):
        for item in value:
            _reject_sensitive_payload(item, key_path)
    elif isinstance(value, str):
        lower = value.lower()
        if "database_url" in lower or "postgres://" in lower or "access token" in lower or "api_key" in lower:
            raise ValueError("Restricted credential text is not allowed in case-study packages.")


def _unsafe_key(key: str) -> bool:
    if key in {"owner", "owners"} or key.startswith("owner_"):
        return True
    blocked = ("mailing", "grantor", "grantee", "email", "phone", "raw_wsacc", "wsacc_source", "raw_model", "raw_score", "exact_probability", "api_key", "token", "password", "database_url", "connection_string")
    return any(term in key for term in blocked)


def _append_activity(activity: list[dict[str, Any]], action: str, section: str, summary: str, source: str, revision_id: str | None) -> list[dict[str, Any]]:
    return [
        {
            "action": action,
            "revision_id": revision_id,
            "safe_summary": summary,
            "section": section,
            "source": source,
            "timestamp": _now(),
        },
        *activity,
    ][:100]


def _brief_markdown(case: dict[str, Any], brief: dict[str, Any]) -> str:
    candidates = ", ".join(item for item in brief["candidate_ids"] if item)
    deliverables = "\n".join(f"- {item.get('title')}: {item.get('status')} ({item.get('review_status') or 'Review status not set'})" for item in brief["deliverable_status"])
    safety = "\n".join(f"- {item}" for item in brief["safety_rules"])
    return "\n".join(
        [
            f"# {case['title']}",
            "",
            f"Slug: {brief['case_study_slug']}",
            f"Stage: {brief['current_stage']}",
            f"Status: {brief['current_status']}",
            f"Strategy: {brief['strategy']}",
            f"Candidates: {candidates}",
            f"Open task: {brief['open_tasks']}",
            "",
            "## Funnel",
            "\n".join(f"- {key}: {value}" for key, value in brief["funnel"].items()),
            "",
            "## Decisions",
            "\n".join(f"- {key}: {value}" for key, value in brief["current_decisions"].items()),
            "",
            "## Missing Evidence",
            "\n".join(f"- {item}" for item in brief["missing_evidence"]),
            "",
            "## Deliverables",
            deliverables,
            "",
            "## Safety Rules",
            safety,
        ]
    )


def _unique_slug(db: Session, desired: str) -> str:
    slug = desired
    counter = 2
    while _get_case_row_if_table_exists(db, slug):
        slug = f"{desired}-{counter}"
        counter += 1
    return slug


def _json(value: Any, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    return json.loads(value) if isinstance(value, str) else value


def _now() -> str:
    return datetime.now(UTC).isoformat()
