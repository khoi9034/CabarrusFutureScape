"""Persistent analyst workspace records for CFS Investment."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.investment_engagements import InvestmentEngagementPayload
from app.schemas.investment_workspace import (
    InvestmentRecentWorkPayload,
    InvestmentSavedItemPatch,
    InvestmentSavedItemPayload,
    InvestmentSavedItemReorderRequest,
    InvestmentSavedSearchPatch,
    InvestmentSavedSearchPayload,
)
from app.services.investment_area_radar_service import radar_search
from app.services.investment_engagement_service import create_engagement
from app.services.investment_screening_service import SAFE_CAVEAT

SAVED_ITEM_TABLE = "investment_saved_item"
RECENT_WORK_TABLE = "investment_recent_work"
SAVED_SEARCH_TABLE = "investment_saved_search"
RECENT_WORK_LIMIT = 50


def list_saved_items(
    db: Session,
    *,
    item_type: str | None = None,
    strategy: str | None = None,
    status: str | None = None,
    sort: str = "recent",
) -> dict[str, Any]:
    _ensure_tables(db)
    clauses: list[str] = []
    params: dict[str, Any] = {}
    if item_type:
        clauses.append("item_type = :item_type")
        params["item_type"] = item_type
    if strategy:
        clauses.append("strategy = :strategy")
        params["strategy"] = strategy
    if status:
        clauses.append("status = :status")
        params["status"] = status
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    order = "sort_order ASC NULLS LAST, updated_at DESC" if sort == "custom" else "updated_at DESC"
    rows = [_serialize_saved_item(row) for row in db.execute(text(f"SELECT * FROM {SAVED_ITEM_TABLE} {where} ORDER BY {order} LIMIT 250"), params).mappings()]
    return {"count": len(rows), "items": rows, "caveats": [SAFE_CAVEAT]}


def create_saved_item(db: Session, payload: InvestmentSavedItemPayload) -> dict[str, Any]:
    _ensure_tables(db)
    now = datetime.now(UTC)
    duplicate = _find_duplicate_saved_item(db, payload)
    if duplicate:
        values = _saved_item_values(duplicate, payload, now)
        db.execute(
            text(
                f"""
                UPDATE {SAVED_ITEM_TABLE}
                   SET label = :label,
                       status = :status,
                       private_notes = :private_notes,
                       summary = :summary,
                       updated_at = :updated_at,
                       last_opened_at = :last_opened_at
                 WHERE id = :id
                """
            ),
            values,
        )
        return get_saved_item(db, duplicate) or {}

    item_id = str(uuid4())
    db.execute(
        text(
            f"""
            INSERT INTO {SAVED_ITEM_TABLE} (
              id, item_type, item_reference_id, parcel_id, candidate_id, opportunity_id,
              area_id, scenario_id, engagement_id, label, strategy, status, private_notes,
              summary, sort_order, created_at, updated_at, last_opened_at
            ) VALUES (
              :id, :item_type, :item_reference_id, :parcel_id, :candidate_id, :opportunity_id,
              :area_id, :scenario_id, :engagement_id, :label, :strategy, :status, :private_notes,
              :summary, :sort_order, :created_at, :updated_at, :last_opened_at
            )
            """
        ),
        _saved_item_values(item_id, payload, now),
    )
    return get_saved_item(db, item_id) or {}


def get_saved_item(db: Session, item_id: str) -> dict[str, Any] | None:
    _ensure_tables(db)
    row = db.execute(text(f"SELECT * FROM {SAVED_ITEM_TABLE} WHERE id = :id"), {"id": item_id}).mappings().first()
    return _serialize_saved_item(row) if row else None


def update_saved_item(db: Session, item_id: str, patch: InvestmentSavedItemPatch) -> dict[str, Any] | None:
    current = get_saved_item(db, item_id)
    if not current:
        return None
    data = patch.model_dump(exclude_unset=True)
    merged = {**current, **data}
    db.execute(
        text(
            f"""
            UPDATE {SAVED_ITEM_TABLE}
               SET label = :label,
                   status = :status,
                   private_notes = :private_notes,
                   summary = :summary,
                   updated_at = :updated_at
             WHERE id = :id
            """
        ),
        {
            "id": item_id,
            "label": merged.get("label"),
            "private_notes": merged.get("private_notes"),
            "status": merged.get("status"),
            "summary": merged.get("summary"),
            "updated_at": datetime.now(UTC),
        },
    )
    return get_saved_item(db, item_id)


def delete_saved_item(db: Session, item_id: str) -> bool:
    _ensure_tables(db)
    result = db.execute(text(f"DELETE FROM {SAVED_ITEM_TABLE} WHERE id = :id"), {"id": item_id})
    return bool(result.rowcount)


def reorder_saved_items(db: Session, request: InvestmentSavedItemReorderRequest) -> dict[str, Any]:
    _ensure_tables(db)
    now = datetime.now(UTC)
    for index, item_id in enumerate(request.item_ids):
        db.execute(
            text(f"UPDATE {SAVED_ITEM_TABLE} SET sort_order = :sort_order, updated_at = :updated_at WHERE id = :id"),
            {"id": item_id, "sort_order": index, "updated_at": now},
        )
    return list_saved_items(db, sort="custom")


def list_recent_work(db: Session) -> dict[str, Any]:
    _ensure_tables(db)
    rows = [_serialize_recent_work(row) for row in db.execute(text(f"SELECT * FROM {RECENT_WORK_TABLE} ORDER BY last_opened_at DESC LIMIT {RECENT_WORK_LIMIT}")).mappings()]
    return {"count": len(rows), "items": rows, "max_items": RECENT_WORK_LIMIT, "caveats": [SAFE_CAVEAT]}


def record_recent_work(db: Session, payload: InvestmentRecentWorkPayload) -> dict[str, Any]:
    _ensure_tables(db)
    now = datetime.now(UTC)
    existing = db.execute(
        text(
            f"""
            SELECT id FROM {RECENT_WORK_TABLE}
             WHERE activity_type = :activity_type
               AND reference_type = :reference_type
               AND COALESCE(reference_id, '') = COALESCE(:reference_id, '')
             LIMIT 1
            """
        ),
        {
            "activity_type": payload.activity_type,
            "reference_id": payload.reference_id,
            "reference_type": payload.reference_type,
        },
    ).scalar()
    values = {
        **payload.model_dump(),
        "context_json": json.dumps(payload.context, default=str),
        "id": existing or str(uuid4()),
        "last_opened_at": now,
    }
    if existing:
        db.execute(
            text(
                f"""
                UPDATE {RECENT_WORK_TABLE}
                   SET label = :label,
                       page = :page,
                       parcel_id = :parcel_id,
                       strategy = :strategy,
                       summary = :summary,
                       context_json = CAST(:context_json AS jsonb),
                       last_opened_at = :last_opened_at
                 WHERE id = :id
                """
            ),
            values,
        )
    else:
        db.execute(
            text(
                f"""
                INSERT INTO {RECENT_WORK_TABLE} (
                  id, activity_type, reference_type, reference_id, parcel_id, label,
                  page, strategy, summary, context_json, last_opened_at
                ) VALUES (
                  :id, :activity_type, :reference_type, :reference_id, :parcel_id, :label,
                  :page, :strategy, :summary, CAST(:context_json AS jsonb), :last_opened_at
                )
                """
            ),
            values,
        )
    _trim_recent_work(db)
    return list_recent_work(db)


def delete_recent_work(db: Session, item_id: str) -> bool:
    _ensure_tables(db)
    result = db.execute(text(f"DELETE FROM {RECENT_WORK_TABLE} WHERE id = :id"), {"id": item_id})
    return bool(result.rowcount)


def list_saved_searches(db: Session) -> dict[str, Any]:
    _ensure_tables(db)
    rows = [_serialize_saved_search(row) for row in db.execute(text(f"SELECT * FROM {SAVED_SEARCH_TABLE} ORDER BY updated_at DESC LIMIT 100")).mappings()]
    return {"count": len(rows), "searches": rows, "caveats": [SAFE_CAVEAT]}


def create_saved_search(db: Session, payload: InvestmentSavedSearchPayload) -> dict[str, Any]:
    _ensure_tables(db)
    now = datetime.now(UTC)
    search_id = str(uuid4())
    db.execute(
        text(
            f"""
            INSERT INTO {SAVED_SEARCH_TABLE} (
              id, search_name, goal, location_type, location_value, essential_criteria_json,
              advanced_criteria_json, guided_or_advanced, result_summary_json,
              created_at, updated_at, last_run_at
            ) VALUES (
              :id, :search_name, :goal, :location_type, :location_value, CAST(:essential_criteria_json AS jsonb),
              CAST(:advanced_criteria_json AS jsonb), :guided_or_advanced, CAST(:result_summary_json AS jsonb),
              :created_at, :updated_at, :last_run_at
            )
            """
        ),
        _saved_search_values(search_id, payload.model_dump(), now),
    )
    return get_saved_search(db, search_id) or {}


def get_saved_search(db: Session, search_id: str) -> dict[str, Any] | None:
    _ensure_tables(db)
    row = db.execute(text(f"SELECT * FROM {SAVED_SEARCH_TABLE} WHERE id = :id"), {"id": search_id}).mappings().first()
    return _serialize_saved_search(row) if row else None


def update_saved_search(db: Session, search_id: str, patch: InvestmentSavedSearchPatch) -> dict[str, Any] | None:
    current = get_saved_search(db, search_id)
    if not current:
        return None
    merged = {**current, **patch.model_dump(exclude_unset=True)}
    db.execute(
        text(
            f"""
            UPDATE {SAVED_SEARCH_TABLE}
               SET search_name = :search_name,
                   goal = :goal,
                   location_type = :location_type,
                   location_value = :location_value,
                   essential_criteria_json = CAST(:essential_criteria_json AS jsonb),
                   advanced_criteria_json = CAST(:advanced_criteria_json AS jsonb),
                   guided_or_advanced = :guided_or_advanced,
                   result_summary_json = CAST(:result_summary_json AS jsonb),
                   updated_at = :updated_at
             WHERE id = :id
            """
        ),
        _saved_search_values(search_id, merged, datetime.now(UTC)),
    )
    return get_saved_search(db, search_id)


def delete_saved_search(db: Session, search_id: str) -> bool:
    _ensure_tables(db)
    result = db.execute(text(f"DELETE FROM {SAVED_SEARCH_TABLE} WHERE id = :id"), {"id": search_id})
    return bool(result.rowcount)


def duplicate_saved_search(db: Session, search_id: str) -> dict[str, Any] | None:
    search = get_saved_search(db, search_id)
    if not search:
        return None
    payload = InvestmentSavedSearchPayload(
        advanced_criteria=search.get("advanced_criteria") or {},
        essential_criteria=search.get("essential_criteria") or {},
        goal=search.get("goal") or "Custom",
        guided_or_advanced=search.get("guided_or_advanced") or "guided",
        location_type=search.get("location_type") or "All Cabarrus County",
        location_value=search.get("location_value"),
        result_summary=search.get("result_summary") or {},
        search_name=f"{search.get('search_name', 'Saved Search')} copy",
    )
    return create_saved_search(db, payload)


def rerun_saved_search(db: Session, search_id: str, investment_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    search = get_saved_search(db, search_id)
    if not search:
        return None
    strategy = _strategy_for_goal(str(search.get("goal") or ""))
    results = radar_search(investment_rows, strategy=strategy, limit=25)
    db.execute(
        text(f"UPDATE {SAVED_SEARCH_TABLE} SET last_run_at = :last_run_at, result_summary_json = CAST(:result_summary_json AS jsonb), updated_at = :updated_at WHERE id = :id"),
        {
            "id": search_id,
            "last_run_at": datetime.now(UTC),
            "result_summary_json": json.dumps({"count": results.get("count"), "strategy": results.get("strategy_label")}, default=str),
            "updated_at": datetime.now(UTC),
        },
    )
    return {"saved_search": get_saved_search(db, search_id), "results": results, "caveats": [SAFE_CAVEAT]}


def saved_search_to_engagement(db: Session, search_id: str) -> dict[str, Any] | None:
    search = get_saved_search(db, search_id)
    if not search:
        return None
    engagement = create_engagement(
        db,
        InvestmentEngagementPayload(
            engagement_name=f"Project: {search['search_name']}",
            engagement_type="Site-selection study",
            notes="Created from a saved CFS Investment guided search.",
            property_type=str((search.get("essential_criteria") or {}).get("property_type") or search.get("goal") or "Custom"),
            selected_strategy=_investment_strategy_for_goal(str(search.get("goal") or "")),
            target_geography=search.get("location_value") or search.get("location_type") or "Cabarrus County",
        ),
    )
    return {"engagement": engagement, "saved_search": search, "caveats": [SAFE_CAVEAT]}


def _ensure_tables(db: Session) -> None:
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {SAVED_ITEM_TABLE} (
              id text PRIMARY KEY,
              item_type text NOT NULL,
              item_reference_id text NOT NULL,
              parcel_id text,
              candidate_id text,
              opportunity_id text,
              area_id text,
              scenario_id text,
              engagement_id text,
              label text NOT NULL,
              strategy text,
              status text NOT NULL DEFAULT 'Shortlisted',
              private_notes text,
              summary text,
              sort_order integer,
              created_at timestamptz NOT NULL,
              updated_at timestamptz NOT NULL,
              last_opened_at timestamptz
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{SAVED_ITEM_TABLE}_lookup ON {SAVED_ITEM_TABLE} (item_type, item_reference_id, strategy, engagement_id)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {RECENT_WORK_TABLE} (
              id text PRIMARY KEY,
              activity_type text NOT NULL,
              reference_type text NOT NULL,
              reference_id text,
              parcel_id text,
              label text NOT NULL,
              page text NOT NULL,
              strategy text,
              summary text,
              context_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              last_opened_at timestamptz NOT NULL
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{RECENT_WORK_TABLE}_last_opened ON {RECENT_WORK_TABLE} (last_opened_at DESC)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {SAVED_SEARCH_TABLE} (
              id text PRIMARY KEY,
              search_name text NOT NULL,
              goal text NOT NULL,
              location_type text NOT NULL,
              location_value text,
              essential_criteria_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              advanced_criteria_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              guided_or_advanced text NOT NULL DEFAULT 'guided',
              result_summary_json jsonb NOT NULL DEFAULT '{{}}'::jsonb,
              created_at timestamptz NOT NULL,
              updated_at timestamptz NOT NULL,
              last_run_at timestamptz
            )
            """
        )
    )


def _find_duplicate_saved_item(db: Session, payload: InvestmentSavedItemPayload) -> str | None:
    return db.execute(
        text(
            f"""
            SELECT id FROM {SAVED_ITEM_TABLE}
             WHERE item_type = :item_type
               AND item_reference_id = :item_reference_id
               AND COALESCE(strategy, '') = COALESCE(:strategy, '')
               AND COALESCE(engagement_id, '') = COALESCE(:engagement_id, '')
               AND status <> 'Archived'
             LIMIT 1
            """
        ),
        {
            "engagement_id": payload.engagement_id,
            "item_reference_id": payload.item_reference_id,
            "item_type": payload.item_type,
            "strategy": payload.strategy,
        },
    ).scalar()


def _saved_item_values(item_id: str, payload: InvestmentSavedItemPayload, now: datetime) -> dict[str, Any]:
    data = payload.model_dump()
    return {**data, "created_at": now, "id": item_id, "last_opened_at": now, "sort_order": None, "updated_at": now}


def _saved_search_values(search_id: str, data: dict[str, Any], now: datetime) -> dict[str, Any]:
    return {
        "advanced_criteria_json": json.dumps(data.get("advanced_criteria") or {}, default=str),
        "created_at": data.get("created_at") or now,
        "essential_criteria_json": json.dumps(data.get("essential_criteria") or {}, default=str),
        "goal": data.get("goal") or "Custom",
        "guided_or_advanced": data.get("guided_or_advanced") or "guided",
        "id": search_id,
        "last_run_at": data.get("last_run_at"),
        "location_type": data.get("location_type") or "All Cabarrus County",
        "location_value": data.get("location_value"),
        "result_summary_json": json.dumps(data.get("result_summary") or {}, default=str),
        "search_name": data.get("search_name") or "Saved Search",
        "updated_at": now,
    }


def _serialize_saved_item(row: Any) -> dict[str, Any]:
    data = dict(row)
    return {**data, "reference_status": "Reference unavailable" if not data.get("item_reference_id") else "Saved reference"}


def _serialize_recent_work(row: Any) -> dict[str, Any]:
    data = dict(row)
    context = data.pop("context_json", {}) or {}
    if isinstance(context, str):
        context = json.loads(context)
    return {**data, "context": context, "reference_status": "Reference unavailable" if not data.get("reference_id") else "Saved reference"}


def _serialize_saved_search(row: Any) -> dict[str, Any]:
    data = dict(row)
    for source, target in (
        ("advanced_criteria_json", "advanced_criteria"),
        ("essential_criteria_json", "essential_criteria"),
        ("result_summary_json", "result_summary"),
    ):
        value = data.pop(source, {}) or {}
        data[target] = json.loads(value) if isinstance(value, str) else value
    return data


def _trim_recent_work(db: Session) -> None:
    db.execute(
        text(
            f"""
            DELETE FROM {RECENT_WORK_TABLE}
             WHERE id IN (
               SELECT id FROM {RECENT_WORK_TABLE}
                ORDER BY last_opened_at DESC
                OFFSET {RECENT_WORK_LIMIT}
             )
            """
        )
    )


def _strategy_for_goal(goal: str) -> str:
    normalized = goal.lower()
    if "bank" in normalized:
        return "land_banking"
    if "entitlement" in normalized or "reposition" in normalized:
        return "entitlement_repositioning"
    if "existing" in normalized:
        return "existing_use_acquisition"
    return "industrial_site" if "industrial" in normalized else "development_land"


def _investment_strategy_for_goal(goal: str) -> str:
    strategy = _strategy_for_goal(goal)
    if strategy == "existing_use_acquisition":
        return "existing_use"
    return strategy if strategy in {"development_land", "land_banking", "entitlement_repositioning"} else "development_land"
