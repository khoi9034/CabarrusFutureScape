from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.dependencies.database import get_read_only_db
from app.main import app
from app.routers import ai_search_router
from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import (
    CfsAiSearchService,
    classify_query_domains,
    sanitize_text,
)


def _settings(**overrides):
    values = {
        "anthropic_api_key": "",
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
    assert "Residential additions" in response.answer


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
    text = str(body).lower()
    assert "prediction_probability" not in text
    assert "raw_score" not in text
    assert "will develop" not in text
