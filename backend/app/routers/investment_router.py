"""Internal Investment Panel screening routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_optional_read_only_db
from app.routers.economics_router import get_cached_economics_intelligence
from app.schemas.investment import InvestmentCompareRequest, InvestmentScreenRequest, InvestmentStrategyId
from app.services.enterprise_export_service import build_powerbi_export_payload
from app.services.investment_comparable_service import enrich_basis_context
from app.services.investment_screening_service import (
    candidate_detail,
    compare_candidates,
    data_quality,
    screen_candidates,
    strategy_catalog,
)

router = APIRouter(prefix="/investment", tags=["Investment Intelligence"])


@router.get("/strategies")
def get_investment_strategies() -> dict[str, Any]:
    return strategy_catalog()


@router.post("/screen")
def post_investment_screen(
    request: InvestmentScreenRequest,
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return screen_candidates(
        _investment_rows(db),
        filters=request.filters,
        limit=request.limit,
        strategy=request.strategy,
    )


@router.get("/candidates/{parcel_id}")
def get_investment_candidate(
    parcel_id: str,
    strategy: InvestmentStrategyId = Query(default="development_land"),
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return candidate_detail(_investment_rows(db), parcel_id, strategy=strategy)


@router.post("/compare")
def post_investment_compare(
    request: InvestmentCompareRequest,
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return compare_candidates(
        _investment_rows(db),
        request.parcel_ids,
        strategy=request.strategy,
    )


@router.get("/data-quality")
def get_investment_data_quality(
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return data_quality(_investment_rows(db))


def _investment_rows(db: Session | None) -> list[dict[str, Any]]:
    economics = get_cached_economics_intelligence(db)
    powerbi = build_powerbi_export_payload(economics, mode="live")
    tables = powerbi.get("tables") if isinstance(powerbi.get("tables"), dict) else {}
    rows = tables.get("parcel_economic_signal_fact") if isinstance(tables, dict) else []
    safe_rows = [row for row in rows if isinstance(row, dict)]
    return enrich_basis_context(safe_rows, db)
