"""Controlled, read-only GIS tools for Ask Insights."""

from __future__ import annotations

import re
import threading
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.ai_search import CfsAiAgentResult, CfsAiSearchRequest
from app.config import get_settings
from app.services.ai_search_service import _post_provider_json

AgentMode = Literal["explain", "assist", "agent"]


def _tool(
    source: str,
    allowed_inputs: list[str],
    allowed_outputs: list[str],
    spatial: bool,
    map_changing: bool,
    limitations: str,
) -> dict[str, Any]:
    return {
        "allowed_inputs": allowed_inputs,
        "allowed_outputs": allowed_outputs,
        "limitations": limitations,
        "map_changing": map_changing,
        "source": source,
        "spatial": spatial,
    }


TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    "search_parcels": _tool("Governed parcel index", ["query"], ["count", "result_id"], False, False, "Protected residential fields remain redacted."),
    "get_parcel_details": _tool("Governed parcel API", ["parcel_reference"], ["summary"], False, False, "Normal parcel authorization and privacy rules apply."),
    "filter_active_development_parcels": _tool("Observed permit-to-parcel relationships", [], ["count", "result_id"], False, False, "Observed permit activity is not a development forecast."),
    "filter_by_analysis_period": _tool("Observed permit activity dates", ["start_date", "end_date"], ["count", "result_id"], False, False, "Dates filter observed records only."),
    "filter_flood_review": _tool("FEMA-derived parcel flood review overlay", [], ["count", "result_id"], True, False, "Screening context, not a survey or regulatory determination."),
    "filter_high_severe_flood": _tool("FEMA-derived parcel flood review overlay", [], ["count", "result_id"], True, False, "Screening context, not a survey or regulatory determination."),
    "filter_school_context": _tool("Governed school assignment context", ["review_required"], ["count", "result_id"], True, False, "Not an official enrollment or future-capacity forecast."),
    "filter_sewer_proximity": _tool("WSACC sewer proximity proxy", ["within_feet"], ["count", "result_id"], True, False, "Proximity does not establish service or capacity."),
    "filter_economic_review": _tool("Cabarrus Insights economics screening", [], ["count", "result_id"], False, False, "Screening result, not an appraisal or recommendation."),
    "filter_development_signal_band": _tool("Versioned Development Signals ranking", ["band"], ["count", "result_id"], False, False, "Relative ranking, not probability or certainty."),
    "intersect_result_sets": _tool("Temporary Ask Insights results", ["result_ids"], ["count", "result_id"], True, False, "Only compatible current-session results can be combined."),
    "exclude_result_set": _tool("Temporary Ask Insights results", ["base_result_id", "excluded_result_id"], ["count", "result_id"], True, False, "Exclusion applies only to the temporary analysis."),
    "select_within_distance": _tool("PostGIS spatial relationship", ["result_id", "distance_feet"], ["count", "result_id"], True, False, "Distance is screening context."),
    "summarize_result": _tool("Temporary Ask Insights result", ["result_id"], ["count", "criteria", "warnings"], False, False, "Returns compact metadata only."),
    "highlight_result_on_map": _tool("Analyst temporary result layer", ["result_id"], ["map_action"], True, True, "Changes only the temporary Ask Insights layer."),
    "zoom_to_result": _tool("Analyst smart camera", ["result_id"], ["map_action"], True, True, "Respects the existing smart-camera limits."),
    "clear_agent_result": _tool("Analyst temporary result layer", [], ["status"], False, True, "Does not clear unrelated manual map work."),
    "save_snapshot": _tool("Existing Planning Snapshot repository", ["result_id"], ["snapshot_id"], False, True, "Uses existing authorization and privacy enforcement."),
    "save_to_planning_files": _tool("Existing Planning Files repositories", ["result_id"], ["file_id"], False, True, "Uses existing authorization and privacy enforcement."),
}

_RESULT_TTL = timedelta(minutes=30)
_RESULTS: dict[str, dict[str, Any]] = {}
_RESULTS_LOCK = threading.Lock()


def tool_registry() -> list[dict[str, Any]]:
    return [{"name": name, **definition} for name, definition in TOOL_REGISTRY.items()]


def run_gis_agent(
    db: Session | None,
    request: CfsAiSearchRequest,
) -> CfsAiAgentResult | None:
    """Plan and execute only the approved V1 GIS intents."""

    if request.app_mode != "planning" or request.interaction_mode != "freeform":
        return None
    query = " ".join(request.query.lower().split())
    if _is_clear(query):
        return CfsAiAgentResult(
            count=0,
            criteria=[],
            execution_trace=["Cleared the Ask Insights result."],
            map_action="clear",
            mode=request.agent_mode,
            result_id=None,
            status="cleared",
            tool_plan=["clear_agent_result"],
        )

    previous = _get_result(request.agent_result_id)
    criteria = dict(previous["criteria"]) if previous and _is_follow_up(query) else {}
    plan = _plan_known_query(query, criteria) or _plan_provider_query(request, criteria)
    if not plan:
        return None
    criteria, tools = plan
    if request.agent_mode == "explain":
        return CfsAiAgentResult(
            count=previous["count"] if previous else 0,
            criteria=_criteria_labels(criteria),
            execution_trace=["Prepared a read-only analysis plan; no map changes were made."],
            map_action="none",
            mode="explain",
            result_id=request.agent_result_id,
            status="explained",
            tool_plan=tools,
        )
    if db is None:
        return CfsAiAgentResult(
            count=0,
            criteria=_criteria_labels(criteria),
            execution_trace=["The required Local PostGIS data is unavailable."],
            map_action="none",
            mode=request.agent_mode,
            result_id=None,
            status="unavailable",
            tool_plan=tools,
            warning="Live GIS analysis is unavailable. Existing factual Ask Insights answers remain available.",
        )

    db.execute(text("SET LOCAL statement_timeout = '8000ms'"))
    count = int(db.execute(text(_candidate_sql(criteria, count_only=True)), _params(criteria)).scalar_one())
    result_id = f"ask_{datetime.now(UTC):%Y%m%d}_{uuid4().hex[:10]}"
    _store_result(result_id, criteria, count)
    trace = _execution_trace(criteria, count)
    return CfsAiAgentResult(
        count=count,
        criteria=_criteria_labels(criteria),
        execution_trace=trace,
        map_action="highlight_and_zoom" if request.agent_mode == "agent" else "ready",
        mode=request.agent_mode,
        previous_result_id=request.agent_result_id if previous else None,
        result_id=result_id,
        status="executed",
        tool_plan=[*tools, "summarize_result", "highlight_result_on_map", "zoom_to_result"],
        warning=_warning(criteria),
    )


def result_map_payload(db: Session, result_id: str) -> dict[str, Any] | None:
    result = _get_result(result_id)
    if not result:
        return None
    rows = db.execute(
        text(_candidate_sql(result["criteria"], count_only=False)),
        _params(result["criteria"]),
    ).mappings().all()
    return {
        "feature_count": len(rows),
        "features": [
            {"geometry": row["geometry"], "weight": int(row["weight"] or 1)}
            for row in rows
            if row["geometry"]
        ],
        "geometry_kind": "polygon",
        "record_count": result["count"],
        "selection": "ask-agent-result",
        "source": "Approved Cabarrus Insights analysis tools",
        "title": "Ask Insights Result",
    }


def _plan_known_query(query: str, criteria: dict[str, Any]) -> tuple[dict[str, Any], list[str]] | None:
    tools: list[str] = []
    recognized = False
    if "active development" in query:
        criteria["active_development"] = True
        tools.append("filter_active_development_parcels")
        recognized = True
    year = _year(query)
    if year:
        criteria["start_date"] = date(year, 1, 1)
        criteria["end_date"] = date(year, 12, 31)
        tools.append("filter_by_analysis_period")
        recognized = True
    elif match := re.search(r"last\s+(\d{1,2})\s+years?", query):
        years = min(int(match.group(1)), 20)
        today = date.today()
        criteria["start_date"] = date(today.year - years, today.month, min(today.day, 28))
        criteria["end_date"] = today
        tools.append("filter_by_analysis_period")
        recognized = True
    if "flood" in query and "review" in query and not any(word in query for word in ("outside", "exclude", "excluding")):
        criteria["flood_review"] = True
        tools.append("filter_flood_review")
        recognized = True
    if "flood" in query and any(word in query for word in ("outside", "exclude", "excluding")):
        criteria["exclude_high_severe_flood"] = True
        tools.extend(["filter_high_severe_flood", "exclude_result_set"])
        recognized = True
    if "economic" in query and "review" in query:
        criteria["economic_review"] = True
        tools.append("filter_economic_review")
        recognized = True
    if "very high" in query and ("signal" in query or "those" in query):
        criteria["signal_band"] = "very_high_development_signal"
        tools.append("filter_development_signal_band")
        recognized = True
    elif "high development signal" in query:
        criteria["signal_band"] = "high_development_signal"
        tools.append("filter_development_signal_band")
        recognized = True
    if "school" in query and ("review" in query or "context" in query):
        criteria["school_review"] = True
        tools.append("filter_school_context")
        recognized = True
    if "sewer" in query:
        distance = re.search(r"within\s+([\d,]+)\s*(?:feet|foot|ft)", query)
        criteria["sewer_within_feet"] = min(int(distance.group(1).replace(",", "")) if distance else 1000, 10000)
        tools.append("filter_sewer_proximity")
        recognized = True
    if not recognized or not criteria:
        return None
    return criteria, list(dict.fromkeys(tools))


def _plan_provider_query(
    request: CfsAiSearchRequest,
    inherited_criteria: dict[str, Any],
) -> tuple[dict[str, Any], list[str]] | None:
    """Let the configured model choose tools, then reduce its output to fixed filters."""

    settings = get_settings()
    if settings.cfs_ai_provider != "openai" or not settings.openai_api_key.strip():
        return None
    planning_tools = {
        name: TOOL_REGISTRY[name]
        for name in (
            "filter_active_development_parcels",
            "filter_by_analysis_period",
            "filter_flood_review",
            "filter_high_severe_flood",
            "filter_school_context",
            "filter_sewer_proximity",
            "filter_economic_review",
            "filter_development_signal_band",
            "exclude_result_set",
        )
    }
    payload = {
        "model": settings.cfs_ai_model.strip(),
        "messages": [
            {
                "role": "system",
                "content": (
                    "Choose only the supplied Cabarrus Insights tools needed to answer the request. "
                    "Return JSON with a tools array of {name, parameters}. Do not write SQL, invent "
                    "data, call URLs, or recommend approvals. Return an empty tools array when the "
                    "request cannot be answered by these tools."
                ),
            },
            {
                "role": "user",
                "content": str(
                    {
                        "current_map": request.map_context.model_dump(exclude_none=True)
                        if request.map_context else None,
                        "inherited_criteria": _criteria_labels(inherited_criteria),
                        "query": request.query,
                        "tools": planning_tools,
                    }
                ),
            },
        ],
        "response_format": {"type": "json_object"},
    }
    response = _post_provider_json(
        "https://api.openai.com/v1/chat/completions",
        payload,
        {
            "Authorization": f"Bearer {settings.openai_api_key.strip()}",
            "Content-Type": "application/json",
        },
        ["choices", 0, "message", "content"],
        timeout_seconds=min(float(settings.cfs_ai_provider_timeout_seconds), 6.0),
    )
    return _validated_provider_plan(response, inherited_criteria)


def _validated_provider_plan(
    response: dict[str, Any] | None,
    inherited_criteria: dict[str, Any],
) -> tuple[dict[str, Any], list[str]] | None:
    if not isinstance(response, dict) or not isinstance(response.get("tools"), list):
        return None
    criteria = dict(inherited_criteria)
    tools: list[str] = []
    for item in response["tools"][:10]:
        if not isinstance(item, dict):
            return None
        name = item.get("name")
        parameters = item.get("parameters") if isinstance(item.get("parameters"), dict) else {}
        if name not in TOOL_REGISTRY:
            return None
        if name == "filter_active_development_parcels":
            criteria["active_development"] = True
        elif name == "filter_by_analysis_period":
            try:
                criteria["start_date"] = date.fromisoformat(str(parameters["start_date"]))
                criteria["end_date"] = date.fromisoformat(str(parameters["end_date"]))
            except (KeyError, ValueError):
                return None
            if criteria["start_date"] > criteria["end_date"]:
                return None
        elif name == "filter_flood_review":
            criteria["flood_review"] = True
        elif name == "filter_high_severe_flood":
            criteria["exclude_high_severe_flood"] = True
        elif name == "filter_school_context":
            criteria["school_review"] = bool(parameters.get("review_required", True))
        elif name == "filter_sewer_proximity":
            try:
                criteria["sewer_within_feet"] = min(max(int(parameters["within_feet"]), 1), 10000)
            except (KeyError, TypeError, ValueError):
                return None
        elif name == "filter_economic_review":
            criteria["economic_review"] = True
        elif name == "filter_development_signal_band":
            band = str(parameters.get("band", "")).lower().replace(" ", "_")
            if band not in {"high", "very_high", "high_development_signal", "very_high_development_signal"}:
                return None
            criteria["signal_band"] = band if band.endswith("_development_signal") else f"{band}_development_signal"
        elif name != "exclude_result_set":
            return None
        tools.append(str(name))
    if not tools or not criteria:
        return None
    return criteria, list(dict.fromkeys(tools))


def _candidate_sql(criteria: dict[str, Any], *, count_only: bool) -> str:
    clauses = ["p.geometry IS NOT NULL", "NOT ST_IsEmpty(p.geometry)"]
    if criteria.get("active_development"):
        clauses.append("EXISTS (SELECT 1 FROM public.real_property_permit_parcel_relationship r WHERE r.official_parcel_id = p.official_parcel_id AND r.has_parcel_match IS TRUE AND (CAST(:start_date AS date) IS NULL OR r.activity_date >= CAST(:start_date AS date)) AND (CAST(:end_date AS date) IS NULL OR r.activity_date <= CAST(:end_date AS date)))")
    if criteria.get("flood_review"):
        clauses.append("EXISTS (SELECT 1 FROM public.parcel_flood_constraint_overlay f WHERE f.official_parcel_id = p.official_parcel_id AND f.flood_review_required IS TRUE)")
    if criteria.get("exclude_high_severe_flood"):
        clauses.append("NOT EXISTS (SELECT 1 FROM public.parcel_flood_constraint_overlay f WHERE f.official_parcel_id = p.official_parcel_id AND f.flood_review_required IS TRUE AND LOWER(COALESCE(f.buildability_impact, '')) IN ('high', 'severe'))")
    if criteria.get("school_review"):
        clauses.append("EXISTS (SELECT 1 FROM public.parcel_school_summary s WHERE s.official_parcel_id = p.official_parcel_id AND s.school_assignment_review_required IS TRUE)")
    if criteria.get("sewer_within_feet") is not None:
        clauses.append("EXISTS (SELECT 1 FROM public.parcel_wsacc_utility_features u WHERE u.parcel_id = p.official_parcel_id AND u.distance_to_nearest_sewer_pipe_ft <= :sewer_within_feet)")
    if criteria.get("economic_review"):
        clauses.append("p.parcel_area_acres_calc >= 1.0 AND p.assessedvalue_numeric IS NOT NULL AND p.assessedvalue_numeric / NULLIF(p.parcel_area_acres_calc, 0) < 150000")
    if criteria.get("signal_band"):
        clauses.append("EXISTS (SELECT 1 FROM public.development_prediction_ranking_classes d WHERE d.official_parcel_id = p.official_parcel_id AND d.development_signal_class = :signal_band AND d.model_experiment_id = (SELECT model_experiment_id FROM public.development_prediction_ranking_classes GROUP BY model_experiment_id ORDER BY MAX(created_at) DESC LIMIT 1))")
    where = " AND ".join(clauses)
    if count_only:
        return f"SELECT COUNT(*)::int FROM public.parcels_enriched p WHERE {where}"
    return f"SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geometry, 0.00002), 6)::json AS geometry, 1::int AS weight FROM public.parcels_enriched p WHERE {where} ORDER BY p.official_parcel_id LIMIT 2500"


def _params(criteria: dict[str, Any]) -> dict[str, Any]:
    return {
        "end_date": criteria.get("end_date"),
        "sewer_within_feet": criteria.get("sewer_within_feet"),
        "signal_band": criteria.get("signal_band"),
        "start_date": criteria.get("start_date"),
    }


def _criteria_labels(criteria: dict[str, Any]) -> list[str]:
    labels: list[str] = []
    if criteria.get("active_development"): labels.append("Active development parcels")
    if criteria.get("start_date") and criteria.get("end_date"): labels.append(f"Observed activity: {criteria['start_date']:%b %Y}–{criteria['end_date']:%b %Y}")
    if criteria.get("flood_review"): labels.append("Flood review required")
    if criteria.get("exclude_high_severe_flood"): labels.append("High/severe flood review excluded")
    if criteria.get("school_review"): labels.append("School assignment review")
    if criteria.get("sewer_within_feet") is not None: labels.append(f"Sewer proximity: within {criteria['sewer_within_feet']:,} ft")
    if criteria.get("economic_review"): labels.append("Economic review screening")
    if criteria.get("signal_band"): labels.append(f"Development Signal: {criteria['signal_band'].replace('_development_signal', '').replace('_', ' ').title()}")
    return labels


def _execution_trace(criteria: dict[str, Any], count: int) -> list[str]:
    trace = [f"Applied {label.lower()}." for label in _criteria_labels(criteria)]
    trace.append(f"{count:,} parcels remain.")
    return trace


def _warning(criteria: dict[str, Any]) -> str | None:
    if criteria.get("sewer_within_feet") is not None:
        return "Sewer proximity is a screening proxy; utility service and capacity require provider verification."
    if criteria.get("signal_band"):
        return "Development Signals are relative screening ranks, not probabilities."
    return None


def _store_result(result_id: str, criteria: dict[str, Any], count: int) -> None:
    with _RESULTS_LOCK:
        _purge_expired()
        _RESULTS[result_id] = {
            "count": count,
            "criteria": dict(criteria),
            "expires_at": datetime.now(UTC) + _RESULT_TTL,
        }


def _get_result(result_id: str | None) -> dict[str, Any] | None:
    if not result_id:
        return None
    with _RESULTS_LOCK:
        _purge_expired()
        result = _RESULTS.get(result_id)
        return dict(result) if result else None


def _purge_expired() -> None:
    now = datetime.now(UTC)
    for result_id in [key for key, value in _RESULTS.items() if value["expires_at"] <= now]:
        _RESULTS.pop(result_id, None)


def _year(query: str) -> int | None:
    match = re.search(r"(?:from|in|during)\s+(20\d{2})\b", query)
    return int(match.group(1)) if match else None


def _is_follow_up(query: str) -> bool:
    return any(phrase in query for phrase in ("of those", "those parcels", "these parcels", "that result"))


def _is_clear(query: str) -> bool:
    return any(phrase in query for phrase in ("clear this analysis", "clear analysis", "clear the result", "reset analysis"))
