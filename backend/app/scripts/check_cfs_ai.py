"""Run a safe Ask CFS provider/fallback diagnostic.

Run from backend import context:
python -m app.scripts.check_cfs_ai
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.config import get_settings
from app.schemas.ai_search import CfsAiSearchRequest
from app.services.ai_search_service import CfsAiSearchService, get_ai_provider_status


def main() -> int:
    settings = get_settings()
    context = {
        "as_of": datetime.now(UTC).isoformat(),
        "context_freshness": "diagnostic",
        "data_source": "local_diagnostic",
        "indicator_intelligence": {
            "development_activity_detail": {
                "active_parcels": 1,
                "recent_count": 1,
                "recent_window": 2026,
                "total_records": 1,
                "yearly_counts": [{"count": 1, "year": 2026}],
            },
            "watchlist": [{"status_band": "review", "title": "Diagnostic planning signal"}],
        },
        "methodology": {
            "diagnostic": "Safe local context only; no secrets or raw parcel records.",
        },
    }
    response = CfsAiSearchService(settings).search(
        CfsAiSearchRequest(query="Summarize this diagnostic CFS context."),
        context,
    )
    provider_status = get_ai_provider_status(settings)
    result = {
        "api_key_configured": provider_status["api_key_configured"],
        "configured_provider": provider_status["configured_provider"],
        "deterministic_fallback_available": provider_status["deterministic_fallback_available"],
        "model_configured": provider_status["model_configured"],
        "provider_status": response.provider_status,
        "provider_timeout_seconds": provider_status["provider_timeout_seconds"],
        "response_provider": response.provider,
        "structured_response_status": "ok" if response.answer and response.evidence else "invalid",
        "timings_ms": response.timings_ms,
    }
    print(json.dumps(result, indent=2))
    if not response.answer or not response.evidence:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
