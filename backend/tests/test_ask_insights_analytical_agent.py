from __future__ import annotations

import json
from uuid import uuid4

import pytest

from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import classify_query_domains, deterministic_answer
from app.services.ask_gis_agent import _store_result, result_metadata


SCHOOL_ROWS = [
    {"name": "Coltrane Webb ES", "level": "elementary", "permits": 278, "utilization": 152, "watch": "elevated review"},
    {"name": "Weddington Hills ES", "level": "elementary", "permits": 937, "utilization": 125, "watch": "elevated review"},
    {"name": "Cox Mill ES", "level": "elementary", "permits": 404, "utilization": 125, "watch": "elevated review"},
    {"name": "W R Odell ES", "level": "elementary", "permits": 1381, "utilization": 120, "watch": "elevated review"},
    {"name": "Cox Mill HS", "level": "high", "permits": 792, "utilization": 119, "watch": "elevated review"},
]

RESULT_CONTEXT = {
    "active_agent_result": {
        "count": 408,
        "criteria": ["Active development parcels", "Development Signal: Very High", "Flood review excluded"],
        "intermediate_results": [
            {"label": "active development parcels", "count": 3074},
            {"label": "Very High Development Signals", "count": 2894},
            {"label": "flood review excluded", "count": 408},
        ],
        "breakdown": [
            {"label": "Concord", "count": 220},
            {"label": "Kannapolis", "count": 118},
            {"label": "Harrisburg", "count": 70},
        ],
        "limitations": ["Development Signals are relative screening ranks, not probabilities."],
        "title": "Active development · Very High signal",
    }
}


ANALYTICAL_EVALS = [
    *(("school", question) for question in (
        "Analyze the visible school pressure rows.",
        "Compare these school areas.",
        "What stands out on this school screen?",
        "What is important about the visible school pressure?",
        "Which school area should we investigate first?",
        "Which visible school has the strongest pressure?",
        "Give me a detailed analysis of school pressure.",
        "What relationships matter in these school rows?",
        "What should leadership care about in this school view?",
        "Which school signal is most significant?",
        "Compare permit pressure and utilization.",
        "Analyze what these school values do and do not prove.",
    )),
    *(("result", question) for question in (
        "Analyze this result.",
        "Give me a detailed analysis of this result.",
        "What stands out in the active result?",
        "What is the most important relationship in this result?",
        "Prioritize this result.",
        "Analyze this result and tell me what to check next.",
        "What stands out after these filters?",
        "Give me a detailed analysis of the selected parcels.",
        "What is the most important relationship among these criteria?",
        "How should I prioritize this result?",
        "Analyze this result without claiming causation.",
        "What stands out numerically in this result?",
    )),
    *(("parcel", question) for question in (
        "Give me a planning analysis of this site.",
        "Analyze this site.",
        "What is important about this parcel?",
        "What is important about this site?",
        "Give me a deep analysis of this parcel.",
        "Give me a planning analysis of this parcel.",
        "Analyze this site and identify missing evidence.",
        "What is important about this parcel for planning?",
        "Give me a deep analysis of this site.",
        "Analyze this site before we investigate it.",
    )),
    *(("external", question) for question in (
        "Search the web for current flood evidence.",
        "Look this up online using official sources.",
        "Do external research on this site.",
        "Check evidence outside CFS.",
        "Find the latest official FEMA information.",
        "Find the latest official NCDOT information.",
    )),
]


def _answer(kind: str, query: str) -> str:
    filters: dict[str, object] = {}
    context: dict[str, object] = {}
    if kind == "school":
        filters["visible_school_signals"] = json.dumps(SCHOOL_ROWS)
    elif kind == "result":
        context = RESULT_CONTEXT
    elif kind == "parcel":
        filters = {
            "selected_parcel_id": "opaque-parcel-ref",
            "selected_parcel_zoning": "LDR",
            "selected_parcel_quality": "governed",
        }
    request = CfsAiSearchRequest(query=query, filter_context=filters)
    return deterministic_answer(request, context, classify_query_domains(query)).answer


@pytest.mark.parametrize(("kind", "query"), ANALYTICAL_EVALS)
def test_analytical_question_inventory_returns_governed_analysis(kind: str, query: str) -> None:
    answer = _answer(kind, query)
    expected = {
        "school": "observed comparison",
        "result": "retaining",
        "parcel": "current context",
        "external": "approved external-research connector",
    }[kind]
    assert expected in answer.lower()
    assert "indicator_summary" not in answer
    assert "SELECT " not in answer


def test_analytical_eval_inventory_has_at_least_40_questions() -> None:
    assert len(ANALYTICAL_EVALS) >= 40
    assert {kind for kind, _ in ANALYTICAL_EVALS} == {"school", "result", "parcel", "external"}


def test_school_screen_answer_analyzes_instead_of_transcribing() -> None:
    answer = _answer("school", "Compare the visible school areas and tell me what matters most.")
    assert "W R Odell ES: 1,381" in answer
    assert "Cox Mill HS: 792" in answer
    assert "Cox Mill ES: 404" in answer
    assert "3.4 times" in answer
    assert "Coltrane Webb ES has the highest reported utilization at 152%" in answer
    assert "does not show that permits caused enrollment pressure" in answer
    assert "Investigate official enrollment and capacity" in answer


def test_active_result_analysis_quantifies_retention_reduction_and_concentration() -> None:
    answer = _answer("result", "Analyze this result.")
    assert "408 parcels" in answer
    assert "retaining 13.3%" in answer
    assert "removed 2,486 parcels" in answer
    assert "Concord is the largest recorded group at 220 parcels (53.9%" in answer
    assert "not causation" in answer


def test_result_metadata_preserves_breakdown_and_comparison_for_followups() -> None:
    result_id = f"test_{uuid4().hex}"
    _store_result(
        result_id,
        {"active_development": True},
        12,
        breakdown=[{"label": "Concord", "count": 8}],
        comparison={"baseline_count": 10, "current_count": 12, "percent_change": 20.0},
    )
    metadata = result_metadata(result_id)
    assert metadata is not None
    assert metadata["breakdown"] == [{"label": "Concord", "count": 8}]
    assert metadata["comparison"]["percent_change"] == 20.0


def test_normal_cfs_question_does_not_trigger_external_research_gate() -> None:
    answer = _answer("parcel", "Give me a planning analysis of this site.")
    assert "external-research connector" not in answer


def test_unified_panel_has_no_visible_mode_selector() -> None:
    source = open("src/components/dashboard/AskCfsPanel.tsx", encoding="utf-8").read()
    assert 'agent_mode: "agent"' in source
    assert "Ask Insights analysis mode" not in source
    assert "ask-cfs-agent-mode" not in source
    assert ">Plan</summary>" not in source
