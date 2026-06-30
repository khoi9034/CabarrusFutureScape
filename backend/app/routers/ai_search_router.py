"""Grounded CFS AI/search endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_read_only_db
from app.routers.indicators_router import get_indicator_intelligence
from app.schemas.ai_search import CfsAiContext, CfsAiSearchRequest, CfsAiSearchResponse
from app.services.ai_search_service import CfsAiSearchService

router = APIRouter(prefix="/ai", tags=["CFS AI Search"])


@router.post("/search", response_model=CfsAiSearchResponse)
def search_cfs(
    request: CfsAiSearchRequest,
    db: Session = Depends(get_read_only_db),
) -> CfsAiSearchResponse:
    """Answer CFS indicator questions from compact server-side context."""

    context = gather_cfs_ai_context(db)
    return CfsAiSearchService(get_settings()).search(request, context)


def gather_cfs_ai_context(db: Session) -> CfsAiContext:
    context: CfsAiContext = {
        "as_of": datetime.now(UTC).isoformat(),
        "caveats": [],
        "methodology": {
            "school_pressure": (
                "CFS combines preliminary school utilization context with observed permit activity "
                "inside attendance areas as a planning review signal, not an official enrollment forecast."
            ),
            "model_lab": "Model Lab is internal research only and does not expose exact probabilities.",
        },
    }

    indicator_intelligence = _safe_context(
        lambda: get_indicator_intelligence(db=db),
        "Indicator intelligence signals are not available from the current backend.",
        context,
    )
    context["indicator_intelligence"] = indicator_intelligence or {}
    context["indicator_summary"] = {}
    context["school_pressure"] = {"features": [], "summary": {}, "total_count": 0}

    return context


def _safe_context(
    loader: Callable[[], Any],
    caveat: str,
    context: CfsAiContext,
) -> Any:
    try:
        value = loader()
    except Exception:
        context.setdefault("caveats", []).append(caveat)
        return None

    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value
