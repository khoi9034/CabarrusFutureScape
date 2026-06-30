from types import SimpleNamespace

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
    }


def test_ai_search_sanitizer_rewrites_unsafe_language() -> None:
    text = sanitize_text(
        "This parcel will develop with an official score and raw score.",
    ).lower()

    assert "will develop" not in text
    assert "official score" not in text
    assert "raw score" not in text
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
    assert "Planning interpretation" in response.answer
    assert "Concord" in response.answer


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
    assert response.dashboard_actions.open_detail
    assert response.dashboard_actions.open_detail.id == "school_pressure"
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
    monkeypatch.setattr(
        ai_search_service,
        "_post_provider_json",
        lambda *_args, **_kwargs: {"_provider_unavailable_reason": "rate_limit_quota"},
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
    def fake_context(_db):
        return _context()

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
    assert body["domains"] == ["schools"]
    assert body["dashboard_actions"]["focus_domain"] == "schools"
    text = str(body).lower()
    assert "prediction_probability" not in text
    assert "raw_score" not in text
    assert "will develop" not in text
