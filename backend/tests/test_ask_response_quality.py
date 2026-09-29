from __future__ import annotations

import pytest

from app.routers import ai_search_router
from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import _active_result_answer, _context_question_intent, _selected_parcel_answer


EVALUATION_SET = [
    ("What am I looking at?", "current_view"),
    ("What is this result?", "current_view"),
    ("Summarize this result.", "current_view"),
    ("Why are these parcels highlighted?", "why"),
    ("Why were these selected?", "why"),
    ("How many parcels are there?", "count"),
    ("What is the count?", "count"),
    ("How many permits are associated with these?", "count"),
    ("What should I verify next?", "next"),
    ("What should I check next?", "next"),
    ("What should I inspect next?", "next"),
    ("How was this calculated?", "method"),
    ("What method was used?", "method"),
    ("Explain the methodology.", "method"),
    ("What are the limitations?", "limitation"),
    ("What caveats apply?", "limitation"),
    ("How does this compare with 2024?", "comparison"),
    ("What changed from 2024?", "comparison"),
    ("How is this different from last year?", "comparison"),
    ("What does this Development Signal mean?", "signal"),
    ("Explain the signal meaning.", "signal"),
    ("What flood context applies here?", "flood"),
    ("Does this include flood review?", "flood"),
    ("Which criteria removed the most parcels?", "largest_reduction"),
    ("Which criteria reduced the population most?", "largest_reduction"),
]


def _context() -> dict:
    return {
        "active_agent_result": {
            "count": 89,
            "criteria": ["Active development parcels", "Development Signal: Very High"],
            "intermediate_results": [
                {"label": "active development parcels", "count": 412},
                {"label": "Very High Development Signals", "count": 89},
            ],
            "limitations": ["Development Signals are relative screening ranks, not probabilities."],
            "source_datasets": ["permit_activity", "development_signals"],
            "title": "Active development parcels · Development Signal: Very High",
            "tools": ["filter_active_development_parcels", "filter_development_signal_band"],
        },
        "as_of": "2026-09-29T12:00:00Z",
        "caveats": [],
        "context_freshness": "current_session",
        "data_source": "local_live_backend",
    }


@pytest.mark.parametrize(("question", "intent"), EVALUATION_SET)
def test_question_intent_evaluation_set(question: str, intent: str) -> None:
    assert _context_question_intent(question.lower()) == intent


def test_active_result_answers_are_question_specific() -> None:
    questions = [item[0] for item in EVALUATION_SET[::3]]
    answers = {
        _active_result_answer(CfsAiSearchRequest(query=question), _context(), ["general"]).answer
        for question in questions
    }
    assert len(answers) == len(questions)
    assert any("89 parcels" in answer for answer in answers)
    assert any("323" in answer for answer in answers)


def test_active_result_metadata_is_added_after_context_cache(monkeypatch) -> None:
    monkeypatch.setattr(ai_search_router, "result_metadata", lambda result_id: {"count": 89, "result_id": result_id})
    request = CfsAiSearchRequest(query="What am I looking at?", agent_result_id="ask_20260929_1234567890")
    context = ai_search_router._with_request_context({"caveats": []}, request)
    assert context["active_agent_result"] == {"count": 89, "result_id": request.agent_result_id}


def test_selected_parcel_summary_uses_current_selection() -> None:
    request = CfsAiSearchRequest(
        query="Summarize this parcel.",
        filter_context={"selected_parcel_id": "opaque-parcel", "selected_parcel_zoning": "Residential"},
    )
    response = _selected_parcel_answer(request, {"caveats": []}, ["general"])
    assert response and "selected parcel" in response.answer.lower() and "Residential" in response.answer
