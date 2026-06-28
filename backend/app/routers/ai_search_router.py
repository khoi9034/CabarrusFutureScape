"""Grounded CFS AI/search endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_read_only_db
from app.repositories.school_constraints_repository import SchoolConstraintsRepository
from app.routers.indicators_router import get_indicator_summary
from app.schemas.ai_search import CfsAiContext, CfsAiSearchRequest, CfsAiSearchResponse
from app.services.ai_search_service import CfsAiSearchService
from app.services.school_constraints_service import SchoolConstraintsService

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

    indicator_summary = _safe_context(
        lambda: get_indicator_summary(db=db),
        "Indicator Center summary is not available from the current backend.",
        context,
    )
    context["indicator_summary"] = indicator_summary or {}

    school_pressure = _safe_context(
        lambda: _school_pressure_context(db),
        "School utilization plus permit pressure context is not available.",
        context,
    )
    context["school_pressure"] = school_pressure or {
        "features": [],
        "summary": {},
        "total_count": 0,
    }

    return context


def _school_pressure_context(db: Session) -> dict[str, Any]:
    service = SchoolConstraintsService(SchoolConstraintsRepository(db))
    response = service.get_school_pressure(limit=8)
    payload = response.model_dump(mode="json")
    payload["features"] = [
        {
            "properties": feature["properties"],
            "type": feature["type"],
        }
        for feature in payload.get("features", [])
    ]
    return payload


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
