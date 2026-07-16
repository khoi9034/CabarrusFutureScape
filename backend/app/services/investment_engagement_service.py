"""Client/internal consulting engagement workspace for CFS Investment."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.investment_engagements import (
    InvestmentEngagementCriteriaRequest,
    InvestmentEngagementPatch,
    InvestmentEngagementPayload,
    InvestmentEngagementShortlistRequest,
)
from app.services.investment_screening_service import SAFE_CAVEAT
from app.services.schema_guard import cloud_tables_exist

ENGAGEMENT_TABLE = "investment_engagement"


def list_engagements(db: Session) -> dict[str, Any]:
    _ensure_table(db)
    rows = [_serialize(row) for row in db.execute(text(f"SELECT * FROM {ENGAGEMENT_TABLE} ORDER BY updated_at DESC LIMIT 250")).mappings()]
    return {"count": len(rows), "engagements": rows, "caveats": [SAFE_CAVEAT]}


def create_engagement(db: Session, payload: InvestmentEngagementPayload) -> dict[str, Any]:
    _ensure_table(db)
    now = datetime.now(UTC)
    engagement_id = str(uuid4())
    values = _values(engagement_id, payload.model_dump(), now)
    db.execute(
        text(
            f"""
            INSERT INTO {ENGAGEMENT_TABLE} (
              id, engagement_name, selected_strategy, engagement_status,
              brief_json, criteria_json, shortlist_json, created_at, updated_at
            ) VALUES (
              :id, :engagement_name, :selected_strategy, :engagement_status,
              CAST(:brief_json AS jsonb), CAST(:criteria_json AS jsonb), CAST(:shortlist_json AS jsonb),
              :created_at, :updated_at
            )
            """
        ),
        values,
    )
    return get_engagement(db, engagement_id) or {}


def get_engagement(db: Session, engagement_id: str) -> dict[str, Any] | None:
    _ensure_table(db)
    row = db.execute(text(f"SELECT * FROM {ENGAGEMENT_TABLE} WHERE id = :id"), {"id": engagement_id}).mappings().first()
    return _serialize(row) if row else None


def update_engagement(db: Session, engagement_id: str, patch: InvestmentEngagementPatch) -> dict[str, Any] | None:
    current = get_engagement(db, engagement_id)
    if not current:
        return None
    brief = {**current.get("brief", {}), **patch.model_dump(exclude_unset=True)}
    now = datetime.now(UTC)
    values = _values(engagement_id, brief, now)
    db.execute(
        text(
            f"""
            UPDATE {ENGAGEMENT_TABLE}
               SET engagement_name = :engagement_name,
                   selected_strategy = :selected_strategy,
                   engagement_status = :engagement_status,
                   brief_json = CAST(:brief_json AS jsonb),
                   criteria_json = CAST(:criteria_json AS jsonb),
                   shortlist_json = CAST(:shortlist_json AS jsonb),
                   updated_at = :updated_at
             WHERE id = :id
            """
        ),
        values,
    )
    return get_engagement(db, engagement_id)


def delete_engagement(db: Session, engagement_id: str) -> bool:
    _ensure_table(db)
    result = db.execute(text(f"DELETE FROM {ENGAGEMENT_TABLE} WHERE id = :id"), {"id": engagement_id})
    return bool(result.rowcount)


def set_criteria(db: Session, engagement_id: str, request: InvestmentEngagementCriteriaRequest) -> dict[str, Any] | None:
    engagement = get_engagement(db, engagement_id)
    if not engagement:
        return None
    brief = {**engagement["brief"], "criteria": request.criteria}
    return update_engagement(db, engagement_id, InvestmentEngagementPatch(**brief))


def add_shortlist_item(db: Session, engagement_id: str, request: InvestmentEngagementShortlistRequest) -> dict[str, Any] | None:
    engagement = get_engagement(db, engagement_id)
    if not engagement:
        return None
    shortlist = [item for item in engagement.get("shortlist", []) if item.get("item_id") != request.item_id]
    shortlist.insert(0, {**request.model_dump(), "updated_at": datetime.now(UTC).isoformat()})
    brief = {**engagement["brief"], "shortlist": shortlist}
    return update_engagement(db, engagement_id, InvestmentEngagementPatch(**brief))


def engagement_report(db: Session, engagement_id: str) -> dict[str, Any] | None:
    engagement = get_engagement(db, engagement_id)
    if not engagement:
        return None
    sections = [
        _report_section("engagement_brief", "Engagement Brief", _compact(engagement.get("brief", {}))),
        _report_section("criteria_matrix", "Criteria Matrix", _criteria_summary(engagement.get("criteria", []))),
        _report_section("shortlist", "Shortlist", _shortlist_summary(engagement.get("shortlist", []))),
        _report_section("limitations", "Limitations", SAFE_CAVEAT),
    ]
    title = f"{engagement['engagement_name']} - Site Selection Screening Report"
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "brand": "CFS Investment",
        "candidate_id": None,
        "engagement_id": engagement_id,
        "limitations": [SAFE_CAVEAT, "Recommended for additional diligence means further review, not a purchase recommendation."],
        "parcel_id": None,
        "purpose": "Screening-level consulting engagement summary for manual due diligence.",
        "report_bucket_item": {
            "caveats": [SAFE_CAVEAT],
            "content": "\n\n".join(f"{section['title']}\n{section['body']}" for section in sections),
            "summary": _shortlist_summary(engagement.get("shortlist", [])),
            "title": title,
            "type": "investment_engagement_report",
        },
        "report_title": title,
        "report_type": "site_selection_screening_report",
        "sections": sections,
        "strategy": engagement.get("selected_strategy") or "development_land",
    }


def _ensure_table(db: Session) -> None:
    if cloud_tables_exist(db, [ENGAGEMENT_TABLE]):
        return
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {ENGAGEMENT_TABLE} (
              id text PRIMARY KEY,
              engagement_name text NOT NULL,
              selected_strategy text NOT NULL,
              engagement_status text NOT NULL DEFAULT 'Draft',
              brief_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              criteria_json jsonb NOT NULL DEFAULT '[]'::jsonb,
              shortlist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
              created_at timestamptz NOT NULL,
              updated_at timestamptz NOT NULL
            )
            """
        )
    )


def _values(engagement_id: str, brief: dict[str, Any], now: datetime) -> dict[str, Any]:
    criteria = brief.get("criteria") or _default_criteria(brief)
    shortlist = brief.get("shortlist") or []
    return {
        "brief_json": json.dumps(brief, default=str),
        "created_at": now,
        "criteria_json": json.dumps(criteria, default=str),
        "engagement_name": brief.get("engagement_name") or "CFS Investment Engagement",
        "engagement_status": brief.get("engagement_status") or "Draft",
        "id": engagement_id,
        "selected_strategy": brief.get("selected_strategy") or "development_land",
        "shortlist_json": json.dumps(shortlist, default=str),
        "updated_at": now,
    }


def _serialize(row: Any) -> dict[str, Any]:
    data = dict(row)
    brief = data.pop("brief_json", {}) or {}
    criteria = data.pop("criteria_json", []) or []
    shortlist = data.pop("shortlist_json", []) or []
    if isinstance(brief, str):
        brief = json.loads(brief)
    if isinstance(criteria, str):
        criteria = json.loads(criteria)
    if isinstance(shortlist, str):
        shortlist = json.loads(shortlist)
    return {
        **data,
        "brief": brief,
        "criteria": criteria,
        "shortlist": shortlist,
        "portfolio_summary": {
            "shortlist_count": len(shortlist),
            "criteria_count": len(criteria),
            "verification_burden": "Needs Verification" if shortlist or criteria else "Not Started",
        },
    }


def _default_criteria(brief: dict[str, Any]) -> list[dict[str, str]]:
    criteria = [{"type": "Needs Verification", "criterion": "Verify source availability and parcel match"}]
    if brief.get("minimum_acres"):
        criteria.append({"type": "Must Have", "criterion": f"Minimum acreage: {brief['minimum_acres']}"})
    if brief.get("property_type"):
        criteria.append({"type": "Preferred", "criterion": f"Property type: {brief['property_type']}"})
    return criteria


def _compact(value: Any) -> str:
    if isinstance(value, dict):
        return "; ".join(f"{key.replace('_', ' ').title()}: {item}" for key, item in value.items() if item not in (None, "", [], {}))[:1500]
    return str(value)


def _criteria_summary(criteria: list[dict[str, Any]]) -> str:
    return "; ".join(f"{item.get('type', 'Informational')}: {item.get('criterion') or item.get('label')}" for item in criteria) or "No criteria entered."


def _shortlist_summary(shortlist: list[dict[str, Any]]) -> str:
    return "; ".join(f"{item.get('item_type')}: {item.get('item_id')} ({item.get('status')})" for item in shortlist) or "No shortlist items yet."


def _report_section(section_id: str, title: str, body: str) -> dict[str, Any]:
    return {
        "body": body,
        "id": section_id,
        "limitations": [SAFE_CAVEAT],
        "sources": [{"name": "CFS Investment engagement workspace", "authority_level": "Internal analyst workspace"}],
        "title": title,
    }
