from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.routers import ai_search_router
from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import classify_query_domains, deterministic_answer
from app.services.ask_gis_agent import run_gis_agent


# Fixed QA inventory: every prompt is reviewed as PASS, WEAK, or FAIL before a fix.
# WEAK means the wording asks for a capability that the governed V2 tools do not provide.
RED_TEAM_QA = [
    ("ambiguous", "What about these?", "FAIL"),
    ("ambiguous", "Why?", "FAIL"),
    ("ambiguous", "Which ones?", "FAIL"),
    ("ambiguous", "Show the worst ones.", "FAIL"),
    ("ambiguous", "How many are actually risky?", "FAIL"),
    ("ambiguous", "What's driving this?", "FAIL"),
    ("ambiguous", "Is this area good?", "FAIL"),
    ("ambiguous", "What's changed?", "PASS"),
    ("ambiguous", "Which are near sewer?", "FAIL"),
    ("ambiguous", "What should I care about?", "FAIL"),
    ("chain", "Show active development parcels in 2025.", "PASS"),
    ("chain", "Of those, remove high/severe flood.", "PASS"),
    ("chain", "Now keep only those near sewer.", "PASS"),
    ("chain", "How many are Very High signals?", "FAIL"),
    ("chain", "Break them down by jurisdiction.", "FAIL"),
    ("chain", "Why did the count drop so much?", "FAIL"),
    ("parcel", "What should I know?", "FAIL"),
    ("parcel", "What permits does it have?", "FAIL"),
    ("parcel", "Any flood issue?", "FAIL"),
    ("parcel", "What zoning applies?", "FAIL"),
    ("parcel", "What should I verify?", "FAIL"),
    ("parcel", "Why is it in this signal band?", "FAIL"),
    ("missing", "How much sewer capacity remains here?", "FAIL"),
    ("missing", "How crowded is the assigned school?", "FAIL"),
    ("missing", "Will this parcel definitely develop?", "FAIL"),
    ("missing", "Will this rezoning be approved?", "FAIL"),
    ("method", "How was this calculated?", "PASS"),
    ("method", "Why is this Very High?", "FAIL"),
    ("method", "What does 4.05x lift mean?", "FAIL"),
    ("method", "Why is sewer only a proxy?", "FAIL"),
    ("map", "What am I looking at?", "PASS"),
    ("map", "How many are on screen?", "PASS"),
    ("map", "Which highlighted parcels are in Concord?", "WEAK"),
    ("map", "Zoom to the strongest group.", "WEAK"),
    ("map", "Clear this.", "FAIL"),
    ("result", "How many parcels are in this result?", "PASS"),
    ("result", "Why are these parcels highlighted?", "PASS"),
    ("result", "What are the result limitations?", "PASS"),
    ("result", "Which criterion removed the most?", "PASS"),
    ("result", "What sources produced this result?", "FAIL"),
    ("save", "Save this analysis.", "PASS"),
    ("save", "Save this to Planning Files.", "FAIL"),
    ("provider", "Give me the result count.", "PASS"),
    ("provider", "Explain the current result.", "PASS"),
    ("provider", "Summarize this parcel.", "PASS"),
    ("provider", "What are the limitations?", "PASS"),
    ("repeat", "What is this result?", "PASS"),
    ("repeat", "Why were these selected?", "PASS"),
    ("repeat", "What should I inspect next?", "PASS"),
    ("repeat", "What method was used?", "PASS"),
    ("repeat", "What caveats apply?", "PASS"),
    ("repeat", "How does this compare with 2024?", "PASS"),
    ("repeat", "What does this Development Signal mean?", "PASS"),
    ("repeat", "What flood context applies here?", "PASS"),
    ("repeat", "What is the count?", "PASS"),
    ("repeat", "What should I check next?", "PASS"),
    ("empty", "Why are there no results?", "PASS"),
    ("stale", "Of those, which are near sewer?", "FAIL"),
    ("workspace", "Give me the numbers on this page.", "PASS"),
    ("workspace", "What should I care about on this page?", "PASS"),
    ("cache", "How many permits are in my current screen?", "FAIL"),
    ("cache", "Which three permits should I inspect?", "FAIL"),
]


def _result_context() -> dict:
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


def _answer(query: str, *, filters: dict | None = None, context: dict | None = None) -> str:
    request = CfsAiSearchRequest(query=query, filter_context=filters or {})
    domains = classify_query_domains(query)
    return deterministic_answer(request, context or _result_context(), domains).answer


def test_red_team_inventory_has_required_coverage_and_initial_ratings() -> None:
    assert len(RED_TEAM_QA) >= 50
    assert {category for category, _, _ in RED_TEAM_QA} >= {
        "ambiguous", "cache", "chain", "empty", "map", "method", "missing",
        "parcel", "provider", "repeat", "result", "save", "stale", "workspace",
    }
    counts = {rating: sum(item[2] == rating for item in RED_TEAM_QA) for rating in ("PASS", "WEAK", "FAIL")}
    assert counts == {"PASS": 29, "WEAK": 2, "FAIL": 31}


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("What about these?", "Do you want"),
        ("Which ones?", "Do you want"),
        ("Show the worst ones.", "What should"),
        ("How many are actually risky?", "Which planning measure"),
        ("Is this area good?", "Which planning measure"),
        ("Why?", "because they match"),
        ("What's driving this?", "because they match"),
        ("What should I care about?", "Verify next"),
    ],
)
def test_ambiguous_result_questions_use_context_or_clarify(query: str, expected: str) -> None:
    assert expected.lower() in _answer(query).lower()


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("What should I know?", "zoning AO"),
        ("What permits does it have?", "does not include verified parcel-specific permit"),
        ("Any flood issue?", "does not include a verified parcel-level flood"),
        ("What zoning applies?", "shows zoning AO"),
        ("What should I verify?", "official zoning record"),
        ("Why is it in this signal band?", "Very High band"),
    ],
)
def test_selected_parcel_answers_only_from_current_evidence(query: str, expected: str) -> None:
    filters = {
        "selected_parcel_id": "opaque-parcel",
        "selected_parcel_zoning": "AO",
        "selected_parcel_quality": "governed",
        "selected_feature_signal_band": "Very High",
        "selected_feature_top_drivers": "transportation, tax value",
    }
    assert expected.lower() in _answer(query, filters=filters, context={"caveats": []}).lower()


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("How much sewer capacity remains here?", "does not have verified remaining sewer capacity"),
        ("How crowded is the assigned school?", "does not contain verified enrollment and capacity"),
        ("Will this parcel definitely develop?", "cannot determine whether development will occur"),
        ("Will this rezoning be approved?", "cannot determine whether a rezoning will be approved"),
    ],
)
def test_missing_or_unsupported_evidence_is_explicit(query: str, expected: str) -> None:
    assert expected in _answer(query, context={"caveats": []}).lower()


def test_model_lift_explanation_is_specific_and_not_a_probability() -> None:
    answer = _answer("What does 4.05x lift mean?", context={"caveats": []})
    assert "highest-ranked 5%" in answer and "not a 405% chance" in answer


@pytest.mark.parametrize("query", [
    "How much sewer capacity remains here?",
    "Why is sewer only a proxy?",
])
def test_sewer_evidence_questions_do_not_run_a_spatial_filter(query: str) -> None:
    assert run_gis_agent(_Db(), _gis_request(query)) is None


class _ScalarResult:
    def scalar_one(self) -> int:
        return 238


class _Db:
    def execute(self, _statement, _params=None) -> _ScalarResult:
        return _ScalarResult()


def _gis_request(query: str, result_id: str | None = None) -> CfsAiSearchRequest:
    return CfsAiSearchRequest(
        query=query,
        agent_result_id=result_id,
        map_context={
            "center": {"latitude": 35.4, "longitude": -80.6},
            "extent": {"xmin": -80.8, "ymin": 35.1, "xmax": -80.3, "ymax": 35.6},
            "view_signature": "county",
            "visible_layers": [],
            "zoom": 10,
        },
    )


def test_exact_result_chain_preserves_every_prior_criterion() -> None:
    result = run_gis_agent(_Db(), _gis_request("Show active development parcels in 2025."))
    assert result and result.result_id
    for question in (
        "Of those, remove high/severe flood.",
        "Now keep only those near sewer.",
        "How many are Very High signals?",
        "Break them down by jurisdiction.",
    ):
        result = run_gis_agent(_Db(), _gis_request(question, result.result_id))
        assert result and result.result_id
    criteria = " | ".join(result.criteria)
    assert all(value in criteria for value in (
        "Active development parcels", "Jan 2025", "High/severe flood review excluded",
        "Sewer proximity", "Development Signal: Very High", "Breakdown by jurisdiction",
    ))


def test_stale_result_follow_up_fails_closed() -> None:
    result = run_gis_agent(_Db(), _gis_request("Of those, which are near sewer?", "ask_expired"))
    assert result and result.status == "unavailable"
    assert "expired" in (result.warning or "").lower()


def test_clear_and_planning_files_language_reuse_existing_actions() -> None:
    cleared = run_gis_agent(_Db(), _gis_request("Clear this."))
    assert cleared and cleared.status == "cleared"
    first = run_gis_agent(_Db(), _gis_request("Show active development parcels in 2025."))
    saved = run_gis_agent(_Db(), _gis_request("Save this to Planning Files.", first.result_id))
    assert saved and "save_to_planning_files" in saved.tool_plan


def test_result_drop_and_signal_explanations_are_specific() -> None:
    assert "323" in _answer("Why did the count drop so much?")
    assert "relative screening rank" in _answer("Why is this Very High?")
    assert "permit activity and development signals" in _answer("What sources produced this result?")


def test_management_page_cache_is_section_scoped(monkeypatch) -> None:
    expires = datetime.now(UTC) + timedelta(minutes=1)
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, "payload_management_overview", {"data_source": "overview", "caveats": []})
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, "expires_at_management_overview", expires)
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, "payload_management_economic-insights", {"data_source": "economics", "caveats": []})
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, "expires_at_management_economic-insights", expires)
    overview = ai_search_router.gather_cfs_ai_context(object(), CfsAiSearchRequest(
        query="Give me the numbers", filter_context={"experience": "management", "management_section": "overview"},
    ))
    economics = ai_search_router.gather_cfs_ai_context(object(), CfsAiSearchRequest(
        query="Give me the numbers", filter_context={"experience": "management", "management_section": "economic-insights"},
    ))
    assert overview["data_source"] == "overview"
    assert economics["data_source"] == "economics"


def test_map_cache_isolated_by_question_shape(monkeypatch) -> None:
    expires = datetime.now(UTC) + timedelta(minutes=1)
    prefix = "map_same_None_None_None"
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, f"{prefix}_0_0", {"permit_count": 4})
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, f"expires_at_{prefix}_0_0", expires)
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, f"{prefix}_1_1", {"top_permits": [{"permit_number": "P-1"}]})
    monkeypatch.setitem(ai_search_router._ASK_CFS_CONTEXT_CACHE, f"expires_at_{prefix}_1_1", expires)
    map_context = {
        "center": {"latitude": 35.4, "longitude": -80.6},
        "extent": {"xmin": -80.8, "ymin": 35.1, "xmax": -80.3, "ymax": 35.6},
        "view_signature": "same", "visible_layers": [], "zoom": 10,
    }
    count_context = ai_search_router._with_request_context(
        {"caveats": []}, CfsAiSearchRequest(query="How many permits are in my current screen?", map_context=map_context), object(),
    )
    detail_context = ai_search_router._with_request_context(
        {"caveats": []}, CfsAiSearchRequest(query="Which three permits in this view should I inspect?", map_context=map_context), object(),
    )
    assert count_context["map_extent_summary"] == {"permit_count": 4}
    assert detail_context["map_extent_summary"]["top_permits"][0]["permit_number"] == "P-1"
