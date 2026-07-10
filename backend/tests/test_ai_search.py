import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.dependencies.database import get_read_only_db
from app.main import app
from app.routers import ai_search_router
from app.schemas.ai_search import CfsAiSearchRequest
from app.services import ai_search_service
from app.services.ai_search_service import (
    CfsAiSearchService,
    classify_query_domains,
    sanitize_text,
)


def _settings(**overrides):
    values = {
        "cfs_ai_enabled": False,
        "cfs_ai_model": "",
        "cfs_ai_provider": "none",
        "openai_api_key": "",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.fixture(autouse=True)
def _clear_ai_caches():
    with ai_search_service._PROVIDER_COOLDOWN_LOCK:
        ai_search_service._PROVIDER_COOLDOWN_REASON = None
        ai_search_service._PROVIDER_COOLDOWN_UNTIL = None
    ai_search_router._ASK_CFS_CONTEXT_CACHE.clear()
    yield
    with ai_search_service._PROVIDER_COOLDOWN_LOCK:
        ai_search_service._PROVIDER_COOLDOWN_REASON = None
        ai_search_service._PROVIDER_COOLDOWN_UNTIL = None
    ai_search_router._ASK_CFS_CONTEXT_CACHE.clear()


def _context():
    return {
        "as_of": "2026-01-01T00:00:00+00:00",
        "indicator_summary": {
            "chart_data": {
                "development_permit_trend": [
                    {"label": "2023", "value": 12},
                    {"label": "2024", "value": 18},
                ],
            },
            "monitoring_cards": [
                {
                    "id": "growth_monitor",
                    "metrics": {
                        "active_parcels": 7,
                        "permit_records": 18,
                        "top_permit_segment": "Residential additions",
                    },
                },
                {
                    "id": "constraint_monitor",
                    "metrics": {
                        "floodway_parcels": 2,
                        "review_parcels": 9,
                        "special_flood_hazard_area_parcels": 4,
                    },
                },
            ],
            "data_readiness": [
                {"dataset": "WSACC true utility capacity"},
                {"dataset": "Official school enrollment/capacity"},
            ],
        },
        "school_pressure": {
            "features": [{"properties": {"school_name": "Demo ES"}}],
            "summary": {
                "areas_analyzed": 5,
                "areas_with_recent_permits": 3,
                "areas_with_utilization": 4,
                "elevated_review_count": 2,
                "recent_residential_permits_in_watched_areas": 11,
            },
        },
        "indicator_intelligence": {
            "data_readiness_detail": [
                {
                    "domain": "Utilities",
                    "next_data_need": "WSACC true utility capacity",
                },
                {
                    "domain": "Schools",
                    "next_data_need": "Official enrollment/capacity",
                },
            ],
            "development_activity_detail": {
                "active_parcels": 7,
                "delta": 6,
                "pct_change": 50.0,
                "previous_count": 12,
                "previous_window": 2023,
                "recent_count": 18,
                "recent_window": 2024,
                "strongest_year": {"count": 18, "year": 2024},
                "top_geographies": [{"count": 9, "label": "Concord"}],
                "top_geography_type": "zoning jurisdiction",
                "top_permit_types": [{"count": 10, "label": "Residential"}],
                "top_segments": [{"count": 8, "label": "Residential additions"}],
                "total_records": 18,
                "weakest_year": {"count": 12, "year": 2023},
                "years_available": [2023, 2024],
            },
            "domain_readiness": [
                {"data_available": "no", "domain": "Utilities"},
                {"data_available": "partial", "domain": "Schools"},
            ],
            "floodplain_detail": {
                "floodway_count": 2,
                "permit_overlap_count": None,
                "review_required_count": 9,
                "special_flood_hazard_area_count": 4,
            },
            "school_pressure_detail": {
                "areas_reviewed": 5,
                "elevated_review_count": 2,
                "permit_pressure_overlap": "3 areas include recent permit activity",
                "top_areas": [
                    {
                        "recent_permits": 11,
                        "school_name": "Demo ES",
                        "watch_band": "elevated review",
                    },
                ],
                "utilization_data_coverage": "4 of 5 areas",
            },
            "watchlist": [
                {"status_band": "elevated_review", "title": "Demo ES Capacity + Permit Context"},
                {"status_band": "data_needed", "title": "Utility Readiness Coverage"},
            ],
        },
        "economics_intelligence": {
            "as_of": "2026-01-01T00:00:00+00:00",
            "caveats": [
                "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
            ],
            "data_readiness": [
                {
                    "data_status": "data_needed",
                    "domain": "Service Burden",
                    "gap_or_next_need": "Add official utility, school, and transportation service assumptions.",
                },
            ],
            "summary": {
                "data_needed_count": 1,
                "high_opportunity_count": 3,
                "median_value_per_acre": 225000,
                "total_assessed_value": 12500000,
                "total_parcels_analyzed": 12,
                "underbuilt_candidate_count": 4,
            },
            "segment_summary": [
                {
                    "count": 5,
                    "median_value_per_acre": 250000,
                    "segment": "Residential",
                    "segment_caveat": "Compare value per acre within similar land-use or property segments.",
                    "underbuilt_candidate_count": 2,
                },
                {
                    "count": 1,
                    "median_value_per_acre": 900000,
                    "segment": "Institutional / Civic",
                    "segment_caveat": "Special asset / non-comparable context; compare cautiously outside peer facilities.",
                    "underbuilt_candidate_count": 0,
                },
            ],
            "watchlist": [
                {
                    "evidence": ["Value per acre: $125,000.", "Improvement-to-land ratio: 0.42"],
                    "geography_label": "Demo corridor",
                    "opportunity_class": "Underbuilt Redevelopment Candidate",
                    "parcel_id": "econ-1",
                },
            ],
        },
    }


def test_ai_search_sanitizer_rewrites_unsafe_language() -> None:
    unsafe_prediction = "will " + "develop"
    unsafe_status = "official " + "score"
    unsafe_model_value = "raw " + "score"
    text = sanitize_text(
        f"This parcel {unsafe_prediction} with an {unsafe_status} and {unsafe_model_value}.",
    ).lower()

    assert unsafe_prediction not in text
    assert unsafe_status not in text
    assert unsafe_model_value not in text
    assert "observed permit activity" in text


def test_ai_search_classifies_school_and_permit_queries() -> None:
    assert classify_query_domains("Which school areas have permit growth?")[:2] == [
        "schools",
        "permits",
    ]


def test_ai_search_deterministic_fallback_answers_without_provider() -> None:
    service = CfsAiSearchService(_settings())
    response = service.search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        _context(),
    )

    assert response.provider == "none"
    assert response.domains == ["permits"]
    assert response.evidence
    assert response.dashboard_actions.focus_domain == "permits"
    assert "observed_development_activity" in response.dashboard_actions.highlight_kpis
    assert "Residential additions" in response.answer
    assert "Key findings" in response.answer
    assert "What changed" in response.answer
    assert "What is driving activity" in response.answer
    assert "Why it matters" in response.answer
    assert "What to inspect next" in response.answer
    assert "Concord" in response.answer
    evidence_text = " ".join(item.detail for item in response.evidence)
    assert "18 permit records across 7 active parcels" in evidence_text
    assert "2023: 12; 2024: 18" in evidence_text
    assert "not available permit records" not in evidence_text


def test_ai_search_follow_up_combines_previous_permit_and_school_context() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            conversation_context=[
                {
                    "focused_domain": "permits",
                    "query": "What are the main permit trends?",
                    "related_layers": ["Development Hotspots"],
                },
            ],
            query="What about schools?",
        ),
        _context(),
    )

    assert response.domains[:2] == ["schools", "permits"]
    assert "School Utilization + Permit Pressure" in response.related_layers
    assert "Development Hotspots" in response.related_layers


def test_ai_search_follow_up_layers_use_previous_focus() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            conversation_context=[
                {
                    "focused_domain": "schools",
                    "query": "Which school areas need review?",
                    "related_layers": ["School Utilization + Permit Pressure"],
                },
            ],
            query="Which layers should I inspect?",
        ),
        _context(),
    )

    assert response.domains[0] == "schools"
    assert "School Utilization + Permit Pressure" in response.related_layers
    assert "Development Hotspots" in response.related_layers


def test_ai_search_selected_signal_returns_focused_explanation() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            query="Explain this signal.",
            selected_signal={
                "domain": "school_pressure",
                "evidence": [
                    "Watch band: elevated review",
                    "Recent permits: 11",
                ],
                "id": "school_pressure",
                "related_layers": [
                    "School Utilization + Permit Pressure",
                    "Development Hotspots",
                ],
                "status_band": "elevated review",
                "title": "Demo ES Capacity + Permit Context",
            },
        ),
        _context(),
    )

    assert response.domains == ["schools"]
    assert "What this signal means" in response.answer
    assert "Why it matters" in response.answer
    assert "What to inspect next" in response.answer
    assert response.dashboard_actions.focus_domain == "schools"
    assert response.dashboard_actions.open_detail is None
    assert "School Utilization + Permit Pressure" in response.related_layers


def test_ai_search_selected_signal_templates_cover_major_domains() -> None:
    service = CfsAiSearchService(_settings())
    cases = [
        ("development_activity", "Observed permit activity"),
        ("school_pressure", "not an official enrollment forecast"),
        ("floodplain_review", "not a permitting determination"),
        ("utility_readiness", "Proxy proximity does not confirm"),
        ("transportation_context", "transportation follow-up"),
        ("model_research", "No exact probabilities"),
        ("data_readiness", "missing or incomplete source data"),
        ("economics", "screening-level parcel economic context"),
    ]

    for domain, expected in cases:
        response = service.search(
            CfsAiSearchRequest(
                query="Explain this signal.",
                selected_signal={
                    "domain": domain,
                    "evidence": ["Evidence row"],
                    "id": domain,
                    "title": f"{domain} signal",
                },
            ),
            _context(),
        )

        assert expected.lower() in response.answer.lower()
        assert response.dashboard_actions.focus_domain
        assert response.evidence


def test_ai_search_permit_answer_uses_legacy_summary_when_detail_is_missing() -> None:
    context = _context()
    context["indicator_intelligence"] = {}
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        context,
    )

    text = response.answer + " " + " ".join(item.detail for item in response.evidence)
    assert "18 observed permit records across 7 active parcels" in text
    assert "2023: 12; 2024: 18" in text
    assert "not available observed permit records" not in text
    assert response.dashboard_actions.focus_domain == "permits"


def test_ai_search_permit_answer_keeps_totals_when_type_fields_missing() -> None:
    context = _context()
    context["indicator_intelligence"]["development_activity_detail"] = {
        "active_parcels": 43474,
        "total_records": 64426,
        "yearly_counts": [
            {"count": 3821, "year": 2020},
            {"count": 3642, "year": 2025},
        ],
    }
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        context,
    )

    text = response.answer + " " + " ".join(item.detail for item in response.evidence)
    assert "64,426 observed permit records across 43,474 active parcels" in text
    assert "2020: 3,821; 2025: 3,642" in text
    assert "permit type fields are not currently exposed" in text
    assert "not available permit records" not in text


def test_ai_search_school_answer_includes_pressure_context() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="Which school areas need review?"),
        _context(),
    )

    assert "preliminary school capacity watch" in response.answer.lower()
    assert "permit pressure overlap" in response.answer.lower()
    assert "Demo ES" in response.answer


def test_ai_search_flood_answer_includes_review_caveat() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="Summarize floodplain review signals."),
        _context(),
    )

    assert "Floodway parcels" in response.answer
    assert "not a permitting determination" in response.answer


def test_ai_search_data_readiness_answer_includes_next_need() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="Where is data coverage incomplete?"),
        _context(),
    )

    assert "WSACC true utility capacity" in response.answer
    assert "Official enrollment/capacity" in response.answer


def test_ai_search_inspect_first_prioritizes_watchlist() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="What should I inspect first?"),
        _context(),
    )

    assert "Priority order" in response.answer
    assert "Demo ES Capacity + Permit Context" in response.answer


def test_ai_search_dashboard_action_mappings() -> None:
    service = CfsAiSearchService(_settings())
    cases = [
        ("Which school areas need review?", "schools", "school_pressure"),
        ("Summarize floodplain review signals.", "flood", "floodplain_review"),
        ("Explain Model Lab in safe language.", "model_lab", "model_research_status"),
        ("Where is data coverage incomplete?", "data_readiness", "data_readiness"),
    ]

    for query, focus, highlight in cases:
        response = service.search(CfsAiSearchRequest(query=query), _context())
        assert response.dashboard_actions.focus_domain == focus
        assert highlight in response.dashboard_actions.highlight_kpis


def test_ai_search_provider_missing_model_falls_back() -> None:
    service = CfsAiSearchService(
        _settings(cfs_ai_enabled=True, cfs_ai_provider="openai"),
    )
    response = service.search(
        CfsAiSearchRequest(query="Explain Model Lab in safe language."),
        _context(),
    )

    assert response.provider == "none"
    assert "exact probabilities" in " ".join(response.caveats).lower()


def test_ai_search_provider_failure_falls_back(monkeypatch) -> None:
    monkeypatch.setattr(
        ai_search_service,
        "_post_provider_json",
        lambda *_args, **_kwargs: None,
    )
    service = CfsAiSearchService(
        _settings(
            cfs_ai_enabled=True,
            cfs_ai_model="gpt-5.1-mini",
            cfs_ai_provider="openai",
            openai_api_key="test-key",
        ),
    )
    response = service.search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        _context(),
    )

    assert response.provider == "none"
    assert response.dashboard_actions.focus_domain == "permits"
    assert "deterministic CFS answer returned" in " ".join(response.caveats)


def test_ai_search_openai_429_falls_back_with_safe_caveat(monkeypatch) -> None:
    calls = {"count": 0}

    def rate_limited_provider(*_args, **_kwargs):
        calls["count"] += 1
        return {"_provider_unavailable_reason": "rate_limit_quota"}

    monkeypatch.setattr(
        ai_search_service,
        "_post_provider_json",
        rate_limited_provider,
    )
    service = CfsAiSearchService(
        _settings(
            cfs_ai_enabled=True,
            cfs_ai_model="gpt-4o-mini",
            cfs_ai_provider="openai",
            openai_api_key="test-key",
        ),
    )
    response = service.search(
        CfsAiSearchRequest(query="Which school areas need review?"),
        _context(),
    )

    text = " ".join(response.caveats).lower()
    assert response.provider == "none"
    assert "rate limit or quota" in text
    assert "raw" not in text
    assert response.dashboard_actions.focus_domain == "schools"

    second = service.search(
        CfsAiSearchRequest(query="Which school areas need review?"),
        _context(),
    )

    assert calls["count"] == 1
    assert second.provider == "none"
    assert "temporarily unavailable" in " ".join(second.caveats)


def test_ai_search_provider_timeout_returns_detailed_fallback(monkeypatch) -> None:
    calls = {"count": 0}

    def slow_provider(*_args, **_kwargs):
        calls["count"] += 1
        time.sleep(0.2)
        return {"answer": "late provider answer"}

    monkeypatch.setattr(ai_search_service, "_PROVIDER_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(ai_search_service, "_post_provider_json", slow_provider)
    service = CfsAiSearchService(
        _settings(
            cfs_ai_enabled=True,
            cfs_ai_model="gpt-4o-mini",
            cfs_ai_provider="openai",
            openai_api_key="test-key",
        ),
    )
    response = service.search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        _context(),
    )

    assert response.provider == "none"
    assert "Key findings" in response.answer
    assert "presentation timeout" in " ".join(response.caveats)
    assert response.dashboard_actions.focus_domain == "permits"

    second = service.search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        _context(),
    )

    assert calls["count"] == 1
    assert second.provider == "none"
    assert "temporarily unavailable" in " ".join(second.caveats)


def test_ai_search_sparse_provider_answer_keeps_detailed_fallback(monkeypatch) -> None:
    monkeypatch.setattr(
        ai_search_service,
        "_post_provider_json",
        lambda *_args, **_kwargs: {"answer": "Too short."},
    )
    service = CfsAiSearchService(
        _settings(
            cfs_ai_enabled=True,
            cfs_ai_model="gpt-4o-mini",
            cfs_ai_provider="openai",
            openai_api_key="test-key",
        ),
    )
    response = service.search(
        CfsAiSearchRequest(query="What are the main permit trends?"),
        _context(),
    )

    assert response.provider == "none"
    assert "Key findings" in response.answer
    assert "too sparse" in " ".join(response.caveats)


def test_ai_search_endpoint_uses_grounded_context(monkeypatch) -> None:
    def fake_context(_db, _request=None):
        context = _context()
        context["context_freshness"] = "current_session"
        context["data_source"] = "local_live_backend"
        return context

    app.dependency_overrides[get_read_only_db] = lambda: object()
    monkeypatch.setattr(ai_search_router, "gather_cfs_ai_context", fake_context)
    try:
        response = TestClient(app).post(
            "/ai/search",
            json={"query": "Which school areas need review?", "mode": "live"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "none"
    assert body["data_source"] == "local_live_backend"
    assert body["context_freshness"] == "current_session"
    assert body["domains"] == ["schools"]
    assert body["dashboard_actions"]["focus_domain"] == "schools"
    text = str(body).lower()
    assert "prediction_probability" not in text
    assert "raw" + "_score" not in text
    assert "will " + "develop" not in text


def test_ai_search_endpoint_returns_fast_fallback_when_intelligence_cache_empty(monkeypatch) -> None:
    app.dependency_overrides[get_read_only_db] = lambda: object()
    monkeypatch.setattr(ai_search_router, "get_cached_indicator_intelligence", lambda: None)
    monkeypatch.setattr(
        ai_search_router,
        "get_indicator_intelligence",
        lambda _db: (_ for _ in ()).throw(RuntimeError("cold db")),
    )
    try:
        response = TestClient(app).post(
            "/ai/search",
            json={"query": "What are the main permit trends?", "mode": "live"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["dashboard_actions"]["focus_domain"] == "permits"
    assert body["data_source"] == "local_live_backend"
    assert body["context_freshness"] == "fallback_partial"
    assert "still warming" in " ".join(body["caveats"]).lower()


def test_ai_search_context_cache_reuses_full_live_indicator_context(monkeypatch) -> None:
    calls = {"count": 0}

    def fake_indicator_context(_db):
        calls["count"] += 1
        return {"signals": [{"title": "Live indicator"}]}

    monkeypatch.setattr(ai_search_router, "get_cached_indicator_intelligence", lambda: None)
    monkeypatch.setattr(ai_search_router, "get_indicator_intelligence", fake_indicator_context)

    first = ai_search_router.gather_cfs_ai_context(object())
    second = ai_search_router.gather_cfs_ai_context(object())

    assert calls["count"] == 1
    assert first["indicator_intelligence"] == second["indicator_intelligence"]
    assert first["context_freshness"] == "current_session"


def test_ai_search_partial_indicator_context_is_not_cached(monkeypatch) -> None:
    calls = {"count": 0}

    def fake_fast_context(_db, _context):
        calls["count"] += 1
        return {"development_activity_detail": {"total_records": 18, "active_parcels": 7}}

    monkeypatch.setattr(ai_search_router, "get_cached_indicator_intelligence", lambda: None)
    monkeypatch.setattr(
        ai_search_router,
        "get_indicator_intelligence",
        lambda _db: (_ for _ in ()).throw(RuntimeError("cold db")),
    )
    monkeypatch.setattr(ai_search_router, "_fast_development_context", fake_fast_context)

    first = ai_search_router.gather_cfs_ai_context(object())
    second = ai_search_router.gather_cfs_ai_context(object())

    assert calls["count"] == 2
    assert first["context_freshness"] == second["context_freshness"] == "fallback_partial"


def test_ai_search_filter_context_metadata_is_returned() -> None:
    context = ai_search_router._with_request_context(
        {
            **_context(),
            "context_freshness": "current_session",
            "data_source": "local_live_backend",
        },
        CfsAiSearchRequest(
            filter_context={
                "active_tab": "Schools",
                "selected_domain": "school-context",
            },
            query="Which school areas need review?",
        ),
    )
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(query="Which school areas need review?"),
        context,
    )

    assert response.data_source == "local_live_backend"
    assert response.context_freshness == "current_session"
    assert "active tab=Schools" in response.filtered_context_summary
    assert "Active dashboard context" in response.answer


def test_ai_search_economics_mode_returns_economic_answer() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Where are the strongest underbuilt parcel signals?",
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert response.dashboard_actions.focus_domain == "economics"
    assert "CFS Economics reviewed 12 parcels" in response.answer
    assert "Consulting takeaway" in response.answer
    assert "Enterprise tool alignment" in response.answer
    assert "Underbuilt / redevelopment logic" in response.answer
    assert "improvement-to-land ratio" in response.answer
    assert "Needs More Data Before Recommendation" in response.answer
    assert "Traditional GIS can show where things are" in response.answer
    assert "dimensions include Geography" in response.answer
    assert "Underbuilt Redevelopment Candidate" in response.answer
    assert "Revenue per Acre Dashboard" in response.related_layers


def test_ai_search_economics_product_guidance_prompt_returns_walkthrough() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="How should I use CFS Economics?",
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert "Overview, Power BI & Tools, Economic Dashboard, then Print" in response.answer
    assert "Recommended sequence" in response.answer
    assert any("Power BI & Tools" in action for action in response.suggested_actions)


def test_ai_search_economics_guidance_skips_provider(monkeypatch) -> None:
    calls = {"count": 0}

    def provider_call(*_args, **_kwargs):
        calls["count"] += 1
        return {"answer": "Provider should not be needed."}

    monkeypatch.setattr(ai_search_service, "_post_provider_json", provider_call)
    response = CfsAiSearchService(
        _settings(
            cfs_ai_enabled=True,
            cfs_ai_model="gpt-4o-mini",
            cfs_ai_provider="openai",
            openai_api_key="test-key",
        ),
    ).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="How should I use CFS Economics?",
        ),
        _context(),
    )

    assert calls["count"] == 0
    assert response.provider == "none"
    assert "Overview, Power BI & Tools, Economic Dashboard, then Print" in response.answer


def test_ai_search_economics_scenario_prompt_returns_model_answer() -> None:
    context = _context()
    context["economics_intelligence"]["scenario_inputs"] = [
        {
            "assumption": "Intensity band",
            "current_value": "Medium",
            "data_confidence": "screening",
        }
    ]
    context["economics_intelligence"]["scenario_outputs"] = [
        {
            "data_confidence": "screening",
            "estimated_tax_base_lift_band": "strong",
            "infrastructure_burden_band": "medium",
            "revenue_per_acre_band": "strong",
            "scenario_id": "industrial_employment",
            "service_burden_band": "low",
            "title": "Industrial / Employment",
        }
    ]

    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Compare residential and industrial scenarios.",
        ),
        context,
    )

    assert response.domains == ["economics"]
    assert response.dashboard_actions.focus_domain == "economics"
    assert "Scenario interpretation" in response.answer
    assert "Fiscal / service burden tradeoff" in response.answer
    assert "Assumption sensitivity" in response.answer
    assert "Industrial / Employment" in response.answer
    assert "formal fiscal impact study" in response.answer
    assert response.evidence[0].source == "economics_intelligence.scenario_outputs"


def test_ai_search_economics_powerbi_prompt_returns_workflow_answer() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="What chart should I use for opportunity class?",
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert response.dashboard_actions.focus_domain == "economics"
    assert "Tables to load" in response.answer
    assert "CSV or JSON" in response.answer
    assert "Relationships to build" in response.answer
    assert "Report pages to create" in response.answer
    assert "Build Your Own Chart" in response.answer
    assert "Opportunity class: use parcel_economic_signal_fact" in response.answer
    assert "Crowded pie charts" in response.answer
    assert "Report canvas" in response.answer
    assert "Copy the report canvas recipe" in response.answer
    assert "Report Bucket" in response.answer
    assert "Suggested measures" in response.answer
    assert "Quality checks" in response.answer
    assert "scenario_id exists in scenario_output_fact" in response.answer
    assert "Slicers are checked for blank or missing values" in response.answer
    assert "Do not connect every table" in response.answer
    assert "Power BI Embedded" in response.answer
    assert response.evidence[0].source == "economics_powerbi_export"


def test_ai_search_economics_powerbi_report_plan_request_is_deterministic() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Build me a Power BI dashboard for underbuilt parcels.",
            request_type="powerbi_report_plan",
        ),
        _context(),
    )

    assert response.provider == "none"
    assert "Generated report preview" in response.answer
    assert "save it to the Report Bucket" in response.answer
    assert "Send Report to Print" in response.answer
    assert response.evidence[0].source == "economics_powerbi_export"
    assert response.powerbi_actions is not None
    assert response.powerbi_actions["action_type"] == "build_report"
    assert response.powerbi_actions["chart_builder_config"]["table_name"] == "parcel_economic_signal_fact"
    assert response.powerbi_actions["chart_builder_config"]["filter_field"] == "opportunity_class"
    assert response.powerbi_actions["selected_filters"]["opportunity_class"] == "Underbuilt Redevelopment Candidate"
    assert response.powerbi_actions["report_canvas_items"]
    unsafe_fields = {"owner", "mailing", "raw_score", "prediction_probability", "exact_probability"}
    action_text = str(response.powerbi_actions).lower()
    assert not any(field in action_text for field in unsafe_fields)


def test_ai_search_economics_powerbi_prompt_configures_chart_builder() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Create a pie chart of opportunity classes.",
        ),
        _context(),
    )

    assert response.powerbi_actions is not None
    assert response.powerbi_actions["action_type"] == "build_chart"
    assert response.powerbi_actions["chart_builder_config"] == {
        "aggregation": "count",
        "category_field": "opportunity_class",
        "chart_type": "donut",
        "filter_field": "",
        "filter_value": "All",
        "table_name": "parcel_economic_signal_fact",
        "title": "Opportunity class breakdown",
        "value_field": "signal_id",
    }


def test_ai_search_economics_powerbi_actions_cover_scenario_and_special_assets() -> None:
    scenario = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Make a scenario comparison page.",
        ),
        _context(),
    )
    special = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Show special assets as a report.",
        ),
        _context(),
    )

    assert scenario.powerbi_actions is not None
    assert scenario.powerbi_actions["report_canvas_items"][0]["source_table"] == "scenario_output_fact"
    assert scenario.powerbi_actions["report_canvas_items"][1]["visual_type"] == "matrix"
    assert special.powerbi_actions is not None
    assert special.powerbi_actions["report_canvas_items"][1]["filter_field"] == "special_asset_flag"
    assert special.powerbi_actions["report_canvas_items"][1]["filter_value"] == "true"
    assert "compared separately" in special.powerbi_actions["report_canvas_items"][1]["caveat"].lower()


def test_ai_search_economics_powerbi_actions_cover_utility_report() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Build a Utility Readiness + Growth Report.",
            request_type="powerbi_report_plan",
        ),
        _context(),
    )

    assert response.powerbi_actions is not None
    assert response.powerbi_actions["report_title"] == "Utility Readiness + Growth Report"
    assert response.powerbi_actions["chart_builder_config"]["category_field"] == "sewer_proxy_class"
    assert response.powerbi_actions["report_canvas_items"][0]["source_table"] == "parcel_economic_signal_fact"
    assert response.powerbi_actions["report_canvas_items"][1]["filter_field"] == "opportunity_class"
    assert "proxy" in response.powerbi_actions["report_canvas_items"][0]["caveat"].lower()
    unsafe_fields = {"owner", "mailing", "raw_score", "prediction_probability", "exact_probability"}
    assert not any(field in str(response.powerbi_actions).lower() for field in unsafe_fields)


def test_ai_search_economics_powerbi_actions_cover_land_opportunity_report() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Build a Land Opportunity Screener report.",
            request_type="powerbi_report_plan",
        ),
        _context(),
    )

    assert response.powerbi_actions is not None
    assert response.powerbi_actions["report_title"] == "Land Opportunity Screener Report"
    assert response.powerbi_actions["chart_builder_config"]["category_field"] == "development_readiness_band"
    assert response.powerbi_actions["report_canvas_items"][0]["source_table"] == "parcel_economic_signal_fact"
    assert response.powerbi_actions["report_canvas_items"][1]["category_field"] == "sewer_proxy_class"
    assert "does not confirm capacity" in response.powerbi_actions["report_canvas_items"][1]["caveat"].lower()
    unsafe_fields = {"owner", "mailing", "raw_score", "prediction_probability", "exact_probability"}
    assert not any(field in str(response.powerbi_actions).lower() for field in unsafe_fields)


def test_ai_search_economics_land_opportunity_prompt_routes_to_builder() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Which land opportunity classes should I inspect first?",
        ),
        _context(),
    )

    assert response.powerbi_actions is not None
    assert response.powerbi_actions["report_title"] == "Land Opportunity Screener Report"
    assert response.powerbi_actions["chart_builder_config"]["category_field"] == "development_readiness_band"


def test_ai_search_economics_powerbi_sort_prompt_mentions_export_order_fields() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="How do I sort opportunity classes in Power BI and filter special assets?",
        ),
        _context(),
    )

    assert "opportunity_class_order" in response.answer
    assert "band_order" in response.answer
    assert "special_asset_flag" in response.answer
    assert "economic_segment as the first slicer" in response.answer


def test_ai_search_economics_report_canvas_prompt_routes_to_powerbi_answer() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="How do I use the report canvas?",
        ),
        _context(),
    )

    assert "Report canvas" in response.answer
    assert "Copy the report canvas recipe" in response.answer
    assert response.evidence[0].source == "economics_powerbi_export"


def test_ai_search_economics_report_bucket_prompt_routes_to_powerbi_answer() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="How do I use the report bucket?",
        ),
        _context(),
    )

    assert "Report Bucket" in response.answer
    assert "Toggle which bucket items should appear in Print" in response.answer
    assert response.evidence[0].source == "economics_powerbi_export"


def test_ai_search_economics_context_uses_cached_economics(monkeypatch) -> None:
    calls = {"count": 0}

    def fake_cached_economics(_db):
        calls["count"] += 1
        return {"summary": {"source_mode": "live"}}

    monkeypatch.setattr(ai_search_router, "get_cached_economics_intelligence", fake_cached_economics)

    request = CfsAiSearchRequest(app_mode="economics", query="How should I use CFS Economics?")
    first = ai_search_router.gather_cfs_ai_context(object(), request)
    second = ai_search_router.gather_cfs_ai_context(object(), request)

    assert calls["count"] == 1
    assert first["economics_intelligence"] == second["economics_intelligence"]


def test_ai_search_economics_segment_prompt_explains_value_per_acre_caveat() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Why is value per acre misleading countywide?",
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert response.dashboard_actions.focus_domain == "economics"
    assert "Economic Segment slicer" in response.answer
    assert "special/non-comparable" in response.answer
    assert "Residential" in response.answer
    assert response.evidence[0].source == "economics_intelligence.segment_summary"


def test_ai_search_economics_print_prompt_returns_snapshot_answer() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Build a snapshot summary.",
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert response.dashboard_actions.focus_domain == "economics"
    assert "Snapshot sections" in response.answer
    assert "Selected Rows / Scope" in response.answer
    assert "Opportunity & Segment Summary" in response.answer
    assert "Evidence Pack" in response.answer
    assert "Power BI / Export Notes" in response.answer
    assert "Decision memo" in response.answer
    assert "Recommended Next Diligence" in response.answer
    assert "Caveats" in response.answer
    assert any("Print / Save as PDF" in action for action in response.suggested_actions)
    assert any("Decision Memo" in action for action in response.suggested_actions)


def test_ai_search_selected_economics_signal_returns_focused_explanation() -> None:
    response = CfsAiSearchService(_settings()).search(
        CfsAiSearchRequest(
            app_mode="economics",
            query="Explain this signal.",
            selected_signal={
                "domain": "economics",
                "evidence": ["Value per acre: $125,000."],
                "id": "underbuilt_watch",
                "related_layers": ["Revenue per Acre Dashboard", "Underbuilt Redevelopment Watchlist"],
                "status_band": "underbuilt_watch",
                "title": "Underbuilt Redevelopment Watchlist",
            },
        ),
        _context(),
    )

    assert response.domains == ["economics"]
    assert "screening-level parcel economic context" in response.answer
    assert response.dashboard_actions.focus_domain == "economics"
