"""Controlled, read-only GIS tools for Ask Insights."""

from __future__ import annotations

import re
import json
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

V2_TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    "list_available_datasets": _tool("Approved CFS dataset catalog", [], ["datasets"], False, False, "Metadata only."),
    "describe_dataset": _tool("Approved CFS dataset catalog", ["dataset"], ["description", "freshness"], False, False, "Metadata only."),
    "list_dataset_fields": _tool("Approved CFS dataset catalog", ["dataset"], ["fields"], False, False, "Metadata only."),
    "describe_field": _tool("Approved CFS dataset catalog", ["dataset", "field"], ["description"], False, False, "Metadata only."),
    "get_dataset_freshness": _tool("Approved CFS dataset catalog", ["dataset"], ["last_updated", "source_dates"], False, False, "Metadata only."),
    "buffer_result": _tool("PostGIS temporary result sets", ["result_id", "distance_feet"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "union_results": _tool("PostGIS temporary result sets", ["result_ids"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "select_intersecting": _tool("PostGIS temporary result sets", ["result_ids"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "select_containing": _tool("PostGIS temporary result sets", ["result_id", "geometry"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "aggregate_by_area": _tool("Governed CFS geography layers", ["area_dataset", "result_id"], ["categories", "counts"], True, False, "Aggregation is screening context."),
    "group_by_field": _tool("Governed CFS fields", ["result_id", "field"], ["categories", "counts"], False, False, "Only approved fields are available."),
    "rank_results": _tool("Temporary Ask Insights results", ["result_id", "field"], ["ranked_results"], False, False, "Ranking is descriptive, not a recommendation."),
    "count_by_category": _tool("Temporary Ask Insights results", ["result_id", "field"], ["categories", "counts"], False, False, "Only approved fields are available."),
    "summarize_numeric_field": _tool("Temporary Ask Insights results", ["result_id", "field"], ["summary"], False, False, "Summary is descriptive."),
    "nearest_features": _tool("PostGIS temporary result sets", ["result_id", "dataset"], ["count", "result_id"], True, False, "Proximity is screening context."),
    "calculate_distance": _tool("PostGIS temporary result sets", ["result_id", "dataset"], ["summary"], True, False, "Distance is screening context."),
    "clip_result": _tool("PostGIS temporary result sets", ["result_id", "geometry"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "dissolve_result": _tool("PostGIS temporary result sets", ["result_id", "field"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "centroid_result": _tool("PostGIS temporary result sets", ["result_id"], ["count", "result_id"], True, False, "Temporary screening geometry only."),
    "calculate_density": _tool("PostGIS temporary result sets", ["result_id", "area_dataset"], ["summary", "result_id"], True, False, "Density method is explicitly labeled."),
    "compare_periods": _tool("Observed permit activity dates", ["result_id", "baseline_start", "baseline_end"], ["summary", "percent_change"], False, False, "Comparison uses observed records only."),
}

DATASET_CATALOG: tuple[dict[str, Any], ...] = (
    {"id": "parcels", "name": "Parcel geometry and planning attributes", "fields": ("official_parcel_id", "geometry", "parcel_area_acres_calc"), "source_dates": (), "status": "available"},
    {"id": "permit_activity", "name": "Observed permit-to-parcel activity", "fields": ("permit_id", "official_parcel_id", "activity_date", "zoning_jurisdiction_name"), "source_dates": ("through current local source coverage",), "status": "available"},
    {"id": "flood_review", "name": "FEMA-derived parcel flood review context", "fields": ("official_parcel_id", "flood_review_required", "buildability_impact"), "source_dates": (), "status": "available"},
    {"id": "school_context", "name": "Governed school assignment context", "fields": ("official_parcel_id", "elementary_school_name", "school_assignment_review_required"), "source_dates": (), "status": "available_with_limitations"},
    {"id": "sewer_proximity", "name": "WSACC sewer proximity proxy", "fields": ("parcel_id", "distance_to_nearest_sewer_pipe_ft"), "source_dates": (), "status": "available_with_limitations"},
    {"id": "development_signals", "name": "Versioned Development Signals ranking", "fields": ("official_parcel_id", "development_signal_class", "model_experiment_id"), "source_dates": (), "status": "available_with_limitations"},
)

TOOL_REGISTRY.update(V2_TOOL_REGISTRY)

_RESULT_TTL = timedelta(minutes=30)
MAX_TOOL_CALLS = 10
_RESULTS: dict[str, dict[str, Any]] = {}
_RESULTS_LOCK = threading.Lock()


def tool_registry() -> list[dict[str, Any]]:
    return [{"name": name, **definition} for name, definition in TOOL_REGISTRY.items()]


def available_datasets() -> list[dict[str, Any]]:
    return [{**dataset, "fields": list(dataset["fields"]), "source_dates": list(dataset["source_dates"])} for dataset in DATASET_CATALOG]


def describe_dataset(dataset_id: str) -> dict[str, Any] | None:
    for dataset in available_datasets():
        if dataset["id"] == dataset_id:
            return dataset
    return None


def run_gis_agent(
    db: Session | None,
    request: CfsAiSearchRequest,
) -> CfsAiAgentResult | None:
    """Run a bounded PLAN -> EXECUTE -> VERIFY cycle over approved tools."""

    if request.app_mode != "planning" or request.interaction_mode != "freeform":
        return None
    query = " ".join(request.query.lower().split())
    if _is_non_spatial_evidence_question(query):
        return None
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
    if request.agent_result_id and not previous and _is_follow_up(query):
        return CfsAiAgentResult(
            count=0,
            criteria=[],
            execution_trace=["The prior Ask Insights result is no longer available."],
            map_action="none",
            mode=request.agent_mode,
            result_id=None,
            status="unavailable",
            tool_plan=[],
            warning="The prior Ask Insights result expired. Run the analysis again before refining it.",
        )
    if previous and _is_save(query):
        return CfsAiAgentResult(
            count=previous["count"],
            criteria=_criteria_labels(previous["criteria"]),
            execution_trace=["Prepared the current verified result for the existing Planning Files save flow."],
            map_action="none",
            mode=request.agent_mode,
            result_id=request.agent_result_id,
            status="executed",
            tool_plan=["summarize_result", "save_snapshot", "save_to_planning_files"],
            verification_status="verified",
            original_question=previous.get("original_question"),
            source_datasets=previous.get("source_datasets", []),
            parent_result_ids=[request.agent_result_id],
            method_summary=["Reuse the existing Planning Snapshot and Planning Files authorization flow."],
            limitations=_limitations(previous["criteria"]),
        )
    if previous and _is_empty_explanation(query):
        return CfsAiAgentResult(
            count=previous["count"],
            criteria=_criteria_labels(previous["criteria"]),
            execution_trace=[
                *[f"{item.get('label', 'Step')}: {item.get('count', 0):,} parcels." for item in previous.get("intermediate_results", [])],
                f"Verified final result: {previous['count']:,} parcels remain.",
            ],
            map_action="none",
            mode=request.agent_mode,
            result_id=request.agent_result_id,
            status="executed",
            tool_plan=["summarize_result"],
            verification_status="verified",
            original_question=previous.get("original_question"),
            source_datasets=previous.get("source_datasets", []),
            parent_result_ids=[request.agent_result_id],
            intermediate_results=previous.get("intermediate_results", []),
            method_summary=["The result was checked step by step; the reductions above show which criterion narrowed the population."],
            limitations=_limitations(previous["criteria"]),
            warning=(
                "No parcels remain after the requested criteria were applied. "
                "Review the step-by-step reductions to see which criterion removed the remaining parcels."
                if previous["count"] == 0
                else f"This result currently contains {previous['count']:,} parcels; no empty result was recorded."
            ),
        )
    criteria = dict(previous["criteria"]) if previous and _is_follow_up(query) else {}
    plan = _plan_known_query(query, criteria) or _plan_provider_query(request, criteria)
    if not plan:
        return None
    criteria, tools = plan
    if criteria.get("extent") and request.map_context:
        criteria["extent_bounds"] = request.map_context.extent.model_dump()
    elif criteria.get("extent"):
        criteria.pop("extent", None)
    if request.agent_mode == "explain":
        return CfsAiAgentResult(
            count=previous["count"] if previous else 0,
            criteria=_criteria_labels(criteria),
            execution_trace=[f"Prepared {len(tools)} approved tool steps; no map changes were made."],
            map_action="none",
            mode="explain",
            result_id=request.agent_result_id,
            status="explained",
            tool_plan=tools,
            verification_status="partial",
            original_question=request.query,
            source_datasets=_source_datasets(criteria),
            method_summary=_criteria_labels(criteria),
            limitations=_limitations(criteria),
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
    count, trace, intermediates, breakdown, comparison, verification_status = _execute_pipeline(
        db,
        criteria,
        tools,
    )
    result_id = f"ask_{datetime.now(UTC):%Y%m%d}_{uuid4().hex[:10]}"
    parent_ids = [request.agent_result_id] if request.agent_result_id else []
    _store_result(
        result_id,
        criteria,
        count,
        original_question=request.query,
        parent_result_ids=parent_ids,
        intermediate_results=intermediates,
        source_datasets=_source_datasets(criteria),
        source_dates=_source_dates(criteria),
        tools=tools,
        verification_status=verification_status,
        limitations=_limitations(criteria),
        breakdown=breakdown,
        comparison=comparison,
    )
    warning = _warning(criteria)
    if count == 0:
        warning = _empty_warning(trace)
    return CfsAiAgentResult(
        count=count,
        criteria=_criteria_labels(criteria),
        execution_trace=trace,
        map_action="highlight_and_zoom" if request.agent_mode == "agent" else "ready",
        mode=request.agent_mode,
        previous_result_id=request.agent_result_id if previous else None,
        result_id=result_id,
        status="executed",
        tool_plan=[*tools, "summarize_result", "highlight_result_on_map", "zoom_to_result"][:MAX_TOOL_CALLS],
        warning=warning,
        verification_status=verification_status,
        original_question=request.query,
        source_datasets=_source_datasets(criteria),
        source_dates=_source_dates(criteria),
        parent_result_ids=parent_ids,
        intermediate_results=intermediates,
        method_summary=trace,
        limitations=_limitations(criteria),
        breakdown=breakdown,
        comparison=comparison,
    )


def _execute_pipeline(
    db: Session,
    criteria: dict[str, Any],
    tools: list[str],
) -> tuple[int, list[str], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None, Literal["verified", "partial", "insufficient_data"]]:
    """Execute each approved filter against PostGIS and retain compact observations."""

    trace: list[str] = []
    intermediates: list[dict[str, Any]] = []
    previous_count: int | None = None
    working: dict[str, Any] = {}
    for key in _pipeline_keys(criteria)[:MAX_TOOL_CALLS]:
        working[key] = criteria[key]
        count = int(db.execute(text(_candidate_sql(working, count_only=True)), _params(working)).scalar_one())
        label = _pipeline_label(key, criteria[key])
        if previous_count is None:
            trace.append(f"Loaded {label}: {count:,} parcels.")
        else:
            trace.append(f"Applied {label}: {previous_count:,} → {count:,} parcels.")
        intermediate_id = f"ask_{datetime.now(UTC):%Y%m%d}_{uuid4().hex[:10]}"
        _store_result(intermediate_id, working, count)
        intermediates.append({"result_id": intermediate_id, "label": label, "count": count})
        previous_count = count

    count = previous_count if previous_count is not None else int(
        db.execute(text(_candidate_sql(criteria, count_only=True)), _params(criteria)).scalar_one()
    )
    if previous_count is None:
        trace.append(f"Loaded the approved CFS population: {count:,} parcels.")
    trace.append(f"Verified final result: {count:,} parcels remain.")
    verification: Literal["verified", "partial", "insufficient_data"] = "verified"
    if any(
        isinstance(item.get("count"), int)
        and isinstance(intermediates[index - 1].get("count"), int)
        and item["count"] > intermediates[index - 1]["count"]
        for index, item in enumerate(intermediates)
        if index > 0
    ):
        verification = "partial"
        trace.append("Verification noted a non-monotonic intermediate count; review the source scope.")
    breakdown = _breakdown_by_jurisdiction(db, working) if criteria.get("group_by") == "jurisdiction" else _breakdown_by_school(db, working) if criteria.get("school_group") else []
    comparison = _compare_period(db, working, criteria.get("comparison_year")) if criteria.get("comparison_year") else None
    return count, trace, intermediates, breakdown, comparison, verification


def _pipeline_keys(criteria: dict[str, Any]) -> list[str]:
    return [
        key for key in (
            "extent_bounds",
            "active_development",
            "start_date",
            "end_date",
            "flood_review",
            "exclude_high_severe_flood",
            "school_review",
            "sewer_within_feet",
            "economic_review",
            "signal_band",
            "signal_bands",
        )
        if key in criteria and criteria[key] is not None
    ]


def _pipeline_label(key: str, value: Any) -> str:
    if key == "extent_bounds": return "the current map view"
    if key == "active_development": return "active development parcels"
    if key == "start_date": return f"activity from {value:%b %Y}"
    if key == "end_date": return f"activity through {value:%b %Y}"
    if key == "flood_review": return "flood-review context"
    if key == "exclude_high_severe_flood": return "high/severe flood exclusion"
    if key == "school_review": return "school assignment review"
    if key == "sewer_within_feet": return f"sewer proximity within {value:,} feet"
    if key == "economic_review": return "economic review screening"
    if key == "signal_band": return str(value).replace("_development_signal", "").replace("_", " ").title() + " Development Signals"
    if key == "signal_bands": return "High or Very High Development Signals"
    return key.replace("_", " ")


def _breakdown_by_jurisdiction(db: Session, criteria: dict[str, Any]) -> list[dict[str, Any]]:
    result = db.execute(
        text(_candidate_sql(criteria, count_only=False, grouped=True)),
        _params(criteria),
    )
    if not hasattr(result, "mappings"):
        return []
    rows = result.mappings().all()
    return [{"label": row["label"] or "Unknown", "count": int(row["count"])} for row in rows]


def _breakdown_by_school(db: Session, criteria: dict[str, Any]) -> list[dict[str, Any]]:
    result = db.execute(
        text(_candidate_sql(criteria, count_only=False, grouped="school")),
        _params(criteria),
    )
    if not hasattr(result, "mappings"):
        return []
    rows = result.mappings().all()
    return [{"label": row["label"] or "Unknown", "count": int(row["count"])} for row in rows]


def _compare_period(db: Session, criteria: dict[str, Any], comparison_year: int | None) -> dict[str, Any] | None:
    if not comparison_year or not criteria.get("start_date") or not criteria.get("end_date"):
        return None
    baseline = dict(criteria)
    baseline["start_date"] = date(comparison_year, 1, 1)
    baseline["end_date"] = date(comparison_year, 12, 31)
    baseline_count = int(db.execute(text(_candidate_sql(baseline, count_only=True)), _params(baseline)).scalar_one())
    current_count = int(db.execute(text(_candidate_sql(criteria, count_only=True)), _params(criteria)).scalar_one())
    percent = None if baseline_count == 0 else round((current_count - baseline_count) * 100 / baseline_count, 1)
    return {"baseline_count": baseline_count, "current_count": current_count, "percent_change": percent, "label": f"Compared with {comparison_year}"}


def _source_datasets(criteria: dict[str, Any]) -> list[str]:
    datasets = ["parcels"]
    if criteria.get("active_development") or criteria.get("start_date"): datasets.append("permit_activity")
    if criteria.get("flood_review") or criteria.get("exclude_high_severe_flood"): datasets.append("flood_review")
    if criteria.get("school_review") or criteria.get("school_group"): datasets.append("school_context")
    if criteria.get("sewer_within_feet") is not None: datasets.append("sewer_proximity")
    if criteria.get("economic_review"): datasets.append("economics")
    if criteria.get("signal_band") or criteria.get("signal_bands"): datasets.append("development_signals")
    return list(dict.fromkeys(datasets))


def _source_dates(criteria: dict[str, Any]) -> list[str]:
    if criteria.get("start_date") and criteria.get("end_date"):
        return [f"{criteria['start_date'].isoformat()} to {criteria['end_date'].isoformat()} for observed activity"]
    return []


def _limitations(criteria: dict[str, Any]) -> list[str]:
    limitations: list[str] = []
    if criteria.get("sewer_within_feet") is not None:
        limitations.append("Sewer proximity is a screening proxy; it does not confirm capacity or service availability.")
    if criteria.get("signal_band"):
        limitations.append("Development Signals are relative screening ranks, not probabilities or approvals.")
    if criteria.get("school_review") or criteria.get("school_group"):
        limitations.append("School context is planning context, not an enrollment or capacity forecast.")
    if criteria.get("flood_review") or criteria.get("exclude_high_severe_flood"):
        limitations.append("Flood context is screening-level and does not replace regulatory or engineering review.")
    return limitations


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
        "title": _result_title(result["criteria"]),
    }


def result_metadata(result_id: str) -> dict[str, Any] | None:
    result = _get_result(result_id)
    if not result:
        return None
    return {
        "count": result["count"],
        "criteria": _criteria_labels(result["criteria"]),
        "intermediate_results": result.get("intermediate_results", []),
        "limitations": result.get("limitations", []),
        "breakdown": result.get("breakdown", []),
        "comparison": result.get("comparison"),
        "original_question": result.get("original_question"),
        "parent_result_ids": result.get("parent_result_ids", []),
        "source_datasets": result.get("source_datasets", []),
        "source_dates": result.get("source_dates", []),
        "tools": result.get("tools", []),
        "verification_status": result.get("verification_status", "verified"),
        "title": _result_title(result["criteria"]),
        "expires_at": result["expires_at"].isoformat(),
    }


def analyze_highlighted_result(
    db: Session | None,
    request: CfsAiSearchRequest,
) -> dict[str, Any] | None:
    """Analyze only the active temporary/Management result for spatial questions."""

    query = " ".join(request.query.lower().split())
    if not any(
        phrase in query
        for phrase in (
            "what patterns",
            "where is activity concentrated",
            "where are the strongest",
            "which areas stand out",
            "which parcels should i inspect",
            "why those parcels",
            "why did you recommend this parcel",
            "constraints overlap the strongest",
            "strongest recent activity",
            "most interesting one",
        )
    ):
        return None
    if db is None:
        return {"unavailable": "Live spatial analysis is unavailable while the local data service is offline."}

    parent_id = request.agent_result_id
    parent = _get_result(parent_id)
    if parent is None:
        criteria = _management_handoff_criteria(request.filter_context)
        if not criteria:
            return None
        parent_id = str(uuid4())
        count = int(db.execute(text(_candidate_sql(criteria, count_only=True)), _params(criteria)).scalar_one())
        _store_result(
            parent_id,
            criteria,
            count,
            original_question=str(request.filter_context.get("management_handoff_title") or "Management highlighted result"),
            tools=["summarize_result"],
        )
        parent = _get_result(parent_id)
    if not parent_id or not parent:
        return None

    criteria = dict(parent["criteria"])
    count = int(parent["count"])
    selected_parcel = str(request.filter_context.get("selected_parcel_id") or "").strip() or None
    areas = _spatial_area_recommendations(db, criteria, parent_id, count)
    parcels = _spatial_parcel_recommendations(db, criteria, parent_id, selected_parcel)
    if selected_parcel and "why did you recommend" in query:
        selected = next((item for item in parcels if item["parcel_reference"] == selected_parcel), None)
        if selected:
            answer = f"I recommended parcel {selected_parcel} because {selected['reason'][0].lower() + selected['reason'][1:]}"
        else:
            answer = "That parcel is part of the highlighted result, but it is not among the current evidence-based recommendations."
    else:
        answer = _spatial_analysis_answer(count, areas, parcels)
    return {
        "agent_result": CfsAiAgentResult(
            count=count,
            criteria=_criteria_labels(criteria),
            execution_trace=[
                "Kept the current highlighted result as the analysis universe.",
                "Grouped the result by governed parcel area.",
                "Compared recent activity, total activity, and material planning overlaps.",
            ],
            map_action="highlight_and_zoom",
            mode="agent",
            result_id=parent_id,
            status="executed",
            tool_plan=["aggregate_by_area", "rank_results", "intersect_result_sets", "summarize_numeric_field"],
            verification_status="verified",
            original_question=parent.get("original_question"),
            source_datasets=_source_datasets(criteria),
            source_dates=_source_dates(criteria),
            method_summary=["Recommendations rank evidence inside the active result; they do not recommend approval or predict development."],
            limitations=_limitations(criteria),
        ),
        "answer": answer,
        "areas": areas,
        "parcels": parcels,
    }


def _management_handoff_criteria(filter_context: dict[str, Any]) -> dict[str, Any] | None:
    selection = str(filter_context.get("management_handoff_selection") or "").strip().lower()
    selection_type = str(filter_context.get("management_handoff_selection_type") or "").strip().lower()
    criteria: dict[str, Any] = {}
    if selection in {"permit_activity", "active_development_parcels"}:
        criteria["active_development"] = True
    elif selection == "flood_review":
        criteria["flood_review"] = True
    elif selection == "flood_high_severe":
        criteria["flood_review"] = True
    elif selection_type == "signal-band" or selection in {"high", "very_high", "high,very_high"}:
        if selection == "very_high":
            criteria["signal_band"] = "very_high_development_signal"
        elif selection == "high":
            criteria["signal_band"] = "high_development_signal"
        else:
            criteria["signal_bands"] = ["high_development_signal", "very_high_development_signal"]
    else:
        return None
    for source, target in (("management_handoff_period_start", "start_date"), ("management_handoff_period_end", "end_date")):
        if filter_context.get(source):
            try:
                criteria[target] = date.fromisoformat(str(filter_context[source]))
            except ValueError:
                pass
    raw_filter = filter_context.get("management_handoff_filter")
    try:
        parsed = json.loads(raw_filter) if isinstance(raw_filter, str) else {}
    except json.JSONDecodeError:
        parsed = {}
    for source, target in (("start_date", "start_date"), ("end_date", "end_date"), ("startDate", "start_date"), ("endDate", "end_date")):
        if parsed.get(source):
            try:
                criteria[target] = date.fromisoformat(str(parsed[source]))
            except ValueError:
                pass
    return criteria


def _spatial_area_recommendations(
    db: Session,
    criteria: dict[str, Any],
    parent_id: str,
    parent_count: int,
) -> list[dict[str, Any]]:
    sql = f"""
        WITH parent AS ({_candidate_sql(criteria, count_only=False, identifiers_only=True)}),
        grouped AS (
          SELECT
            COALESCE(NULLIF(TRIM(d.nbh_name), ''), NULLIF(TRIM(d.planning_jurisdiction_name), ''),
              NULLIF(TRIM(d.zoning_jurisdiction_name), ''), 'Other governed area') AS label,
            COUNT(*)::int AS count,
            COALESCE(SUM(d.recent_permit_count_1yr), 0)::int AS recent_permits,
            COALESCE(SUM(d.total_permit_count), 0)::int AS total_permits,
            ST_XMin(ST_Extent(p.geometry)) AS xmin,
            ST_YMin(ST_Extent(p.geometry)) AS ymin,
            ST_XMax(ST_Extent(p.geometry)) AS xmax,
            ST_YMax(ST_Extent(p.geometry)) AS ymax
          FROM parent x
          JOIN public.parcels_enriched p ON p.official_parcel_id = x.official_parcel_id
          LEFT JOIN public.development_activity_parcel_summary d ON d.official_parcel_id = x.official_parcel_id
          GROUP BY 1
        )
        SELECT * FROM grouped WHERE count >= 2
        ORDER BY count DESC, recent_permits DESC, label
        LIMIT 5
    """
    rows = db.execute(text(sql), _params(criteria)).mappings().all()
    recommendations: list[dict[str, Any]] = []
    for row in rows:
        label = str(row["label"])
        subset_criteria = {**criteria, "area_label": label}
        subset_id = str(uuid4())
        subset_count = int(row["count"])
        _store_result(
            subset_id,
            subset_criteria,
            subset_count,
            original_question=f"Subset of highlighted result: {label}",
            parent_result_ids=[parent_id],
            tools=["aggregate_by_area"],
        )
        share = round(subset_count * 100 / parent_count, 1) if parent_count else 0.0
        recent = int(row["recent_permits"] or 0)
        recommendations.append({
            "count": subset_count,
            "extent": {key: float(row[key]) for key in ("xmin", "ymin", "xmax", "ymax")},
            "label": label,
            "parent_result_id": parent_id,
            "reason": f"{subset_count:,} highlighted parcels ({share:.1f}% of the result) with {recent:,} permits in the recent one-year window.",
            "recent_permit_count": recent,
            "share_percent": share,
            "subset_result_id": subset_id,
        })
    return recommendations


def _spatial_parcel_recommendations(
    db: Session,
    criteria: dict[str, Any],
    parent_id: str,
    selected_parcel: str | None,
) -> list[dict[str, Any]]:
    sql = f"""
        WITH parent AS ({_candidate_sql(criteria, count_only=False, identifiers_only=True)}),
        candidates AS (
          SELECT p.official_parcel_id, p.pin14, p.geometry,
            COALESCE(NULLIF(TRIM(d.nbh_name), ''), NULLIF(TRIM(d.planning_jurisdiction_name), ''),
              NULLIF(TRIM(d.zoning_jurisdiction_name), ''), 'Other governed area') AS area_label,
            COALESCE(d.recent_permit_count_1yr, 0)::int AS recent_permits,
            COALESCE(d.total_permit_count, 0)::int AS total_permits,
            d.latest_permit_date,
            COALESCE(f.flood_review_required, false) AS flood_review,
            COALESCE(u.distance_to_nearest_sewer_pipe_ft <= 1000, false) AS sewer_nearby,
            COALESCE(s.development_signal_class IN ('high_development_signal', 'very_high_development_signal'), false) AS elevated_signal,
            (p.parcel_area_acres_calc >= 1 AND p.assessedvalue_numeric / NULLIF(p.parcel_area_acres_calc, 0) < 150000) AS economic_review
          FROM parent x
          JOIN public.parcels_enriched p ON p.official_parcel_id = x.official_parcel_id
          LEFT JOIN public.development_activity_parcel_summary d ON d.official_parcel_id = x.official_parcel_id
          LEFT JOIN public.parcel_flood_constraint_overlay f ON f.official_parcel_id = x.official_parcel_id
          LEFT JOIN public.parcel_wsacc_utility_features u ON u.parcel_id = x.official_parcel_id
          LEFT JOIN LATERAL (
            SELECT development_signal_class
            FROM public.development_prediction_ranking_classes r
            WHERE r.official_parcel_id = x.official_parcel_id
            ORDER BY r.created_at DESC LIMIT 1
          ) s ON true
        )
        SELECT *,
          ST_X(ST_PointOnSurface(geometry)) AS longitude,
          ST_Y(ST_PointOnSurface(geometry)) AS latitude,
          ST_XMin(ST_Extent(geometry) OVER (PARTITION BY official_parcel_id)) AS xmin,
          ST_YMin(ST_Extent(geometry) OVER (PARTITION BY official_parcel_id)) AS ymin,
          ST_XMax(ST_Extent(geometry) OVER (PARTITION BY official_parcel_id)) AS xmax,
          ST_YMax(ST_Extent(geometry) OVER (PARTITION BY official_parcel_id)) AS ymax,
          ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.000002), 6)::json AS highlight_geometry
        FROM candidates
        ORDER BY
          CASE WHEN official_parcel_id = :selected_parcel THEN 1 ELSE 0 END DESC,
          ((CASE WHEN recent_permits > 0 THEN 4 ELSE 0 END) + LN(1 + recent_permits) * 3 + LN(1 + total_permits)
            + flood_review::int + sewer_nearby::int + elevated_signal::int + economic_review::int) DESC,
          latest_permit_date DESC NULLS LAST, official_parcel_id
        LIMIT 5
    """
    rows = db.execute(text(sql), {**_params(criteria), "selected_parcel": selected_parcel}).mappings().all()
    recommendations: list[dict[str, Any]] = []
    for row in rows:
        recent = int(row["recent_permits"] or 0)
        total = int(row["total_permits"] or 0)
        evidence = []
        if recent: evidence.append(f"{recent:,} permits in the recent one-year window")
        if total: evidence.append(f"{total:,} permits overall")
        if row["flood_review"]: evidence.append("flood-review overlap")
        if row["sewer_nearby"]: evidence.append("sewer proximity within 1,000 feet")
        if row["elevated_signal"]: evidence.append("an elevated Development Signal")
        if row["economic_review"]: evidence.append("economic-review overlap")
        reason = ", ".join(evidence[:4]) or "it is a representative parcel in a leading governed area"
        recommendations.append({
            "area_label": str(row["area_label"]),
            "centroid": {"latitude": float(row["latitude"]), "longitude": float(row["longitude"])},
            "extent": {key: float(row[key]) for key in ("xmin", "ymin", "xmax", "ymax")},
            "highlight_geometry": row["highlight_geometry"],
            "latest_permit_date": row["latest_permit_date"].isoformat() if row["latest_permit_date"] else None,
            "parcel_reference": str(row["official_parcel_id"]),
            "parent_result_id": parent_id,
            "reason": f"It stands out within {row['area_label']} because it has {reason}.",
            "recent_permit_count": recent,
            "total_permit_count": total,
        })
    return recommendations


def _spatial_analysis_answer(
    count: int,
    areas: list[dict[str, Any]],
    parcels: list[dict[str, Any]],
) -> str:
    if not areas:
        return f"The {count:,} highlighted parcels do not form a supported governed-area concentration in the available evidence."
    lead = areas[0]
    answer = (
        f"The {count:,} highlighted parcels are not evenly distributed. The strongest governed-area concentration is {lead['label']}, "
        f"with {lead['count']:,} parcels ({lead['share_percent']:.1f}% of the result) and {lead['recent_permit_count']:,} recent permits."
    )
    if len(areas) > 1:
        second = areas[1]
        answer += f" {second['label']} is the next largest concentration at {second['count']:,} parcels ({second['share_percent']:.1f}%)."
    if parcels:
        answer += " The parcel recommendations below combine recent and historical activity with material constraint, utility, signal, and economic overlaps inside this result."
    return answer


def _result_title(criteria: dict[str, Any]) -> str:
    labels = _criteria_labels(criteria)
    if not labels:
        return "Ask Insights Result"
    return " · ".join(labels[:3])


def _plan_known_query(query: str, criteria: dict[str, Any]) -> tuple[dict[str, Any], list[str]] | None:
    tools: list[str] = []
    recognized = False
    if "active development" in query or "development activity" in query or "development pressure" in query:
        criteria["active_development"] = True
        tools.append("filter_active_development_parcels")
        recognized = True
    range_match = re.search(r"(20\d{2})\s*(?:-|to|through)\s*(20\d{2})", query)
    year = None if range_match else _year(query)
    if range_match:
        criteria["start_date"] = date(int(range_match.group(1)), 1, 1)
        criteria["end_date"] = date(int(range_match.group(2)), 12, 31)
        tools.append("filter_by_analysis_period")
        recognized = True
    elif match := re.search(r"(?:since|after)\s+(20\d{2})\b", query):
        criteria["start_date"] = date(int(match.group(1)), 1, 1)
        criteria["end_date"] = date.today()
        tools.append("filter_by_analysis_period")
        recognized = True
    elif match := re.search(r"before\s+(20\d{2})\b", query):
        criteria["start_date"] = None
        criteria["end_date"] = date(int(match.group(1)) - 1, 12, 31)
        tools.append("filter_by_analysis_period")
        recognized = True
    elif year:
        criteria["start_date"] = date(year, 1, 1)
        criteria["end_date"] = date(year, 12, 31)
        tools.append("filter_by_analysis_period")
        recognized = True
    elif match := re.search(r"(?:last|past)\s+(\d{1,2})\s+months?", query):
        months = min(int(match.group(1)), 120)
        criteria["start_date"] = date.today() - timedelta(days=months * 30)
        criteria["end_date"] = date.today()
        tools.append("filter_by_analysis_period")
        recognized = True
    elif match := re.search(r"(?:last|past)\s+(\d{1,2})\s+years?", query):
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
    if "flood" in query and any(word in query for word in ("outside", "exclude", "excluding", "remove")):
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
        criteria["signal_bands"] = ["high_development_signal", "very_high_development_signal"]
        tools.append("filter_development_signal_band")
        recognized = True
    school_action = any(word in query for word in ("show", "find", "filter", "highlight", "map", "select", "keep", "remove"))
    if "school" in query and school_action and ("review" in query or "context" in query):
        criteria["school_review"] = True
        tools.append("filter_school_context")
        recognized = True
    if "sewer" in query:
        distance = re.search(r"within\s+([\d,]+)\s*(?:feet|foot|ft)", query)
        criteria["sewer_within_feet"] = min(int(distance.group(1).replace(",", "")) if distance else 1000, 10000)
        tools.append("filter_sewer_proximity")
        recognized = True
    if any(phrase in query for phrase in ("this map view", "on my screen", "in this view", "these highlighted parcels")):
        criteria["extent"] = True
        tools.append("clip_result")
        recognized = True
        if "permit" in query and "active_development" not in criteria:
            criteria["active_development"] = True
            tools.insert(0, "filter_active_development_parcels")
    if "jurisdiction" in query or "break these down" in query or "breakdown" in query:
        criteria["group_by"] = "jurisdiction"
        tools.append("group_by_field")
        recognized = True
    if "compare" in query and (match := re.search(r"(?:with|to)\s+(20\d{2})", query)):
        criteria["comparison_year"] = int(match.group(1))
        tools.append("compare_periods")
        recognized = True
    if "school" in query and school_action and any(word in query for word in ("areas", "most development", "development pressure")):
        criteria["school_group"] = True
        criteria["active_development"] = True
        tools.extend(["aggregate_by_area", "rank_results"])
        recognized = True
    if (criteria.get("start_date") or criteria.get("end_date")) and not criteria.get("active_development") and any(
        term in query for term in ("permit", "activity", "development")
    ):
        criteria["active_development"] = True
        tools.insert(0, "filter_active_development_parcels")
    if not recognized or not criteria:
        return None
    return criteria, list(dict.fromkeys(tools))[:MAX_TOOL_CALLS]


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
                "content": json.dumps(
                    {
                        "current_map": request.map_context.model_dump(exclude_none=True)
                        if request.map_context else None,
                        "inherited_criteria": _criteria_labels(inherited_criteria),
                        "query": request.query,
                        "tools": planning_tools,
                    },
                    default=str,
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
            normalized_band = band if band.endswith("_development_signal") else f"{band}_development_signal"
            if normalized_band == "high_development_signal":
                criteria["signal_bands"] = ["high_development_signal", "very_high_development_signal"]
            else:
                criteria["signal_band"] = normalized_band
        elif name != "exclude_result_set":
            return None
        tools.append(str(name))
    if not tools or not criteria:
        return None
    return criteria, list(dict.fromkeys(tools))


def _candidate_sql(
    criteria: dict[str, Any],
    *,
    count_only: bool,
    grouped: str | bool = False,
    identifiers_only: bool = False,
) -> str:
    clauses = ["p.geometry IS NOT NULL", "NOT ST_IsEmpty(p.geometry)"]
    if criteria.get("extent_bounds"):
        clauses.append("p.geometry && ST_MakeEnvelope(:xmin, :ymin, :xmax, :ymax, 4326)")
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
    if criteria.get("signal_bands"):
        clauses.append("EXISTS (SELECT 1 FROM public.development_prediction_ranking_classes d WHERE d.official_parcel_id = p.official_parcel_id AND d.development_signal_class = ANY(:signal_bands) AND d.model_experiment_id = (SELECT model_experiment_id FROM public.development_prediction_ranking_classes GROUP BY model_experiment_id ORDER BY MAX(created_at) DESC LIMIT 1))")
    if criteria.get("area_label"):
        clauses.append("EXISTS (SELECT 1 FROM public.development_activity_parcel_summary a WHERE a.official_parcel_id = p.official_parcel_id AND COALESCE(NULLIF(TRIM(a.nbh_name), ''), NULLIF(TRIM(a.planning_jurisdiction_name), ''), NULLIF(TRIM(a.zoning_jurisdiction_name), ''), 'Other governed area') = :area_label)")
    where = " AND ".join(clauses)
    if grouped == "school":
        return f"SELECT COALESCE(s.elementary_school_name, 'Unknown') AS label, COUNT(DISTINCT r.official_parcel_id)::int AS count FROM public.real_property_permit_parcel_relationship r JOIN public.parcels_enriched p ON p.official_parcel_id = r.official_parcel_id LEFT JOIN public.parcel_school_summary s ON s.official_parcel_id = p.official_parcel_id WHERE {where} GROUP BY COALESCE(s.elementary_school_name, 'Unknown') ORDER BY count DESC, label LIMIT 24"
    if grouped:
        return f"SELECT COALESCE(r.zoning_jurisdiction_name, 'Unknown') AS label, COUNT(DISTINCT r.official_parcel_id)::int AS count FROM public.real_property_permit_parcel_relationship r JOIN public.parcels_enriched p ON p.official_parcel_id = r.official_parcel_id WHERE {where} GROUP BY COALESCE(r.zoning_jurisdiction_name, 'Unknown') ORDER BY count DESC, label LIMIT 24"
    if count_only:
        return f"SELECT COUNT(*)::int FROM public.parcels_enriched p WHERE {where}"
    if identifiers_only:
        return f"SELECT p.official_parcel_id FROM public.parcels_enriched p WHERE {where}"
    return f"SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geometry, 0.00002), 6)::json AS geometry, 1::int AS weight FROM public.parcels_enriched p WHERE {where} ORDER BY p.official_parcel_id LIMIT 2500"


def _params(criteria: dict[str, Any]) -> dict[str, Any]:
    bounds = criteria.get("extent_bounds") or {}
    return {
        "end_date": criteria.get("end_date"),
        "area_label": criteria.get("area_label"),
        "xmax": bounds.get("xmax"),
        "xmin": bounds.get("xmin"),
        "sewer_within_feet": criteria.get("sewer_within_feet"),
        "signal_band": criteria.get("signal_band"),
        "signal_bands": criteria.get("signal_bands"),
        "start_date": criteria.get("start_date"),
        "ymax": bounds.get("ymax"),
        "ymin": bounds.get("ymin"),
    }


def _criteria_labels(criteria: dict[str, Any]) -> list[str]:
    labels: list[str] = []
    if criteria.get("extent_bounds"): labels.append("Current map view")
    if criteria.get("active_development"): labels.append("Active development parcels")
    if criteria.get("start_date") and criteria.get("end_date"): labels.append(f"Observed activity: {criteria['start_date']:%b %Y}–{criteria['end_date']:%b %Y}")
    if criteria.get("flood_review"): labels.append("Flood review required")
    if criteria.get("exclude_high_severe_flood"): labels.append("High/severe flood review excluded")
    if criteria.get("school_review"): labels.append("School assignment review")
    if criteria.get("sewer_within_feet") is not None: labels.append(f"Sewer proximity: within {criteria['sewer_within_feet']:,} ft")
    if criteria.get("economic_review"): labels.append("Economic review screening")
    if criteria.get("signal_band"): labels.append(f"Development Signal: {criteria['signal_band'].replace('_development_signal', '').replace('_', ' ').title()}")
    if criteria.get("signal_bands"): labels.append("Development Signals: High or Very High")
    if criteria.get("group_by") == "jurisdiction": labels.append("Breakdown by jurisdiction")
    if criteria.get("school_group"): labels.append("Development pressure by school assignment area")
    if criteria.get("comparison_year"): labels.append(f"Compared with {criteria['comparison_year']}")
    return labels


def _execution_trace(criteria: dict[str, Any], count: int) -> list[str]:
    trace = [f"Applied {label.lower()}." for label in _criteria_labels(criteria)]
    trace.append(f"{count:,} parcels remain.")
    return trace


def _warning(criteria: dict[str, Any]) -> str | None:
    if criteria.get("sewer_within_feet") is not None:
        return "Sewer proximity is a screening proxy; utility service and capacity require provider verification."
    if criteria.get("signal_band") or criteria.get("signal_bands"):
        return "Development Signals are relative screening ranks, not probabilities."
    return None


def _store_result(
    result_id: str,
    criteria: dict[str, Any],
    count: int,
    *,
    original_question: str | None = None,
    parent_result_ids: list[str] | None = None,
    intermediate_results: list[dict[str, Any]] | None = None,
    source_datasets: list[str] | None = None,
    source_dates: list[str] | None = None,
    tools: list[str] | None = None,
    verification_status: str = "verified",
    limitations: list[str] | None = None,
    breakdown: list[dict[str, Any]] | None = None,
    comparison: dict[str, Any] | None = None,
) -> None:
    with _RESULTS_LOCK:
        _purge_expired()
        _RESULTS[result_id] = {
            "count": count,
            "criteria": dict(criteria),
            "expires_at": datetime.now(UTC) + _RESULT_TTL,
            "original_question": original_question,
            "parent_result_ids": list(parent_result_ids or []),
            "intermediate_results": list(intermediate_results or []),
            "source_datasets": list(source_datasets or _source_datasets(criteria)),
            "source_dates": list(source_dates or _source_dates(criteria)),
            "tools": list(tools or []),
            "verification_status": verification_status,
            "limitations": list(limitations or _limitations(criteria)),
            "breakdown": list(breakdown or []),
            "comparison": dict(comparison) if comparison else None,
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
    return any(phrase in query for phrase in (
        "of those", "those parcels", "these parcels", "that result", "this result",
        "these results", "those results", "break these", "break them", "keep only",
        "only those", "those within", "remove the parcels", "remove parcels",
        "how many are", "which are",
    ))


def _is_non_spatial_evidence_question(query: str) -> bool:
    return "sewer" in query and (
        "capacity" in query
        or "why" in query and "proxy" in query
    )


def _is_clear(query: str) -> bool:
    return any(phrase in query for phrase in ("clear this", "clear analysis", "clear the result", "reset analysis"))


def _is_save(query: str) -> bool:
    return any(phrase in query for phrase in (
        "save this analysis", "save analysis", "save this result",
        "save this to planning files", "save to planning files",
    ))


def _is_empty_explanation(query: str) -> bool:
    return ("why" in query or "what happened" in query) and any(
        phrase in query for phrase in ("no results", "no parcels", "zero results", "empty result")
    )


def _empty_warning(trace: list[str]) -> str:
    for step in reversed(trace):
        if "→ 0 parcels" in step:
            return f"No parcels remain after {step.split(':', 1)[0].strip().lower()}. Review the preceding reductions to see why."
    return "No parcels remain after the requested criteria were applied. Review the step-by-step reductions."
