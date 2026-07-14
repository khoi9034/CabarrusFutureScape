"""Internal CFS Investment screening routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_db, get_optional_read_only_db
from app.routers.economics_router import get_cached_economics_intelligence
from app.schemas.investment import (
    InvestmentCompareRequest,
    InvestmentCsvImportRequest,
    InvestmentIntakeCompareRequest,
    InvestmentIntakePatch,
    InvestmentIntakePayload,
    InvestmentReportRequest,
    InvestmentScreenRequest,
    InvestmentStrategyId,
)
from app.schemas.investment_engagements import (
    InvestmentEngagementCriteriaRequest,
    InvestmentEngagementPatch,
    InvestmentEngagementPayload,
    InvestmentEngagementShortlistRequest,
)
from app.schemas.investment_opportunities import (
    InvestmentOpportunityIntakeRequest,
    InvestmentOpportunityMatchRequest,
    InvestmentOpportunityRefreshRequest,
    InvestmentUnderwritingPrefillRequest,
    InvestmentUnderwritingTemplatePayload,
)
from app.schemas.investment_underwriting import (
    InvestmentUnderwritingCalculateRequest,
    InvestmentUnderwritingCompareRequest,
    InvestmentUnderwritingScenarioPatch,
    InvestmentUnderwritingScenarioPayload,
)
from app.services.investment_area_radar_service import radar_area, radar_area_opportunities, radar_area_parcels, radar_search
from app.services.enterprise_export_service import build_powerbi_export_payload
from app.services.investment_engagement_service import (
    add_shortlist_item,
    create_engagement,
    delete_engagement,
    engagement_report,
    get_engagement,
    list_engagements,
    set_criteria,
    update_engagement,
)
from app.services.investment_comparable_service import enrich_basis_context
from app.services.investment_environmental_context_service import (
    candidate_environmental_context,
    environmental_status,
    environmental_context_by_parcel,
    refresh_environmental_context,
)
from app.services.investment_intake_service import (
    analyze_intake_candidate,
    compare_intake_candidates,
    create_intake_candidate,
    delete_intake_candidate,
    get_intake_candidate,
    import_intake_csv,
    list_intake_candidates,
    update_intake_candidate,
)
from app.services.investment_market_context_service import (
    acs_status,
    candidate_market_context,
    refresh_acs_market_context,
)
from app.services.investment_opportunity_feed_service import (
    list_opportunities,
    match_opportunity,
    opportunity_sources,
    opportunity_to_intake,
    refresh_opportunities,
)
from app.services.investment_research_context_service import (
    build_intake_research_context,
    build_parcel_research_context,
    generate_investment_report,
)
from app.services.investment_screening_service import (
    candidate_detail,
    compare_candidates,
    data_quality,
    screen_candidates,
    strategy_catalog,
)
from app.services.investment_underwriting_service import (
    calculate_saved_underwriting_scenario,
    calculate_underwriting,
    compare_underwriting_scenarios,
    create_underwriting_scenario,
    delete_underwriting_scenario,
    get_underwriting_scenario,
    create_underwriting_template,
    list_underwriting_templates,
    list_underwriting_scenarios,
    prefill_underwriting,
    update_underwriting_scenario,
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


@router.get("/environmental/status")
def get_investment_environmental_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return environmental_status(db)


@router.post("/environmental/refresh")
def post_investment_environmental_refresh(
    source: str = Query(default="all"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return refresh_environmental_context(db, source=source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Environmental refresh failed before replacing last-good data.") from exc


@router.get("/market-context/acs/status")
def get_investment_acs_status(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return acs_status(db)


@router.post("/market-context/acs/refresh")
def post_investment_acs_refresh(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return refresh_acs_market_context(db)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="ACS refresh failed before writing data. Check database connectivity and Census API key configuration.") from exc


@router.get("/candidates/{parcel_id}/market-context")
def get_investment_candidate_market_context(
    parcel_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return candidate_market_context(db, parcel_id)


@router.get("/candidates/{parcel_id}/environmental-context")
def get_investment_candidate_environmental_context(
    parcel_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return candidate_environmental_context(db, parcel_id)


@router.get("/research-context/{parcel_id}")
def get_investment_research_context(
    parcel_id: str,
    strategy: InvestmentStrategyId = Query(default="development_land"),
    candidate_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return build_parcel_research_context(db, _investment_rows(db), parcel_id, strategy=strategy, candidate_id=candidate_id)


@router.get("/intake")
def get_investment_intake(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return list_intake_candidates(db, _investment_rows(db))


@router.post("/intake")
def post_investment_intake(
    request: InvestmentIntakePayload,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return create_intake_candidate(db, request, _investment_rows(db))


@router.post("/intake/import")
def post_investment_intake_import(
    request: InvestmentCsvImportRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return import_intake_csv(db, request, _investment_rows(db))


@router.post("/intake/compare")
def post_investment_intake_compare(
    request: InvestmentIntakeCompareRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return compare_intake_candidates(db, request.candidate_ids, _investment_rows(db))


@router.get("/intake/{candidate_id}/market-context")
def get_investment_intake_market_context(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    candidate = get_intake_candidate(db, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return candidate_market_context(db, candidate.get("parcel_id"))


@router.get("/intake/{candidate_id}/environmental-context")
def get_investment_intake_environmental_context(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    candidate = get_intake_candidate(db, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return candidate_environmental_context(db, candidate.get("parcel_id"))


@router.get("/intake/{candidate_id}/research-context")
def get_investment_intake_research_context(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    context = build_intake_research_context(db, _investment_rows(db), candidate_id)
    if not context:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return context


@router.get("/intake/{candidate_id}")
def get_investment_intake_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    candidate = get_intake_candidate(db, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return candidate


@router.patch("/intake/{candidate_id}")
def patch_investment_intake_candidate(
    candidate_id: str,
    request: InvestmentIntakePatch,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    candidate = update_intake_candidate(db, candidate_id, request, _investment_rows(db))
    if not candidate:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return candidate


@router.delete("/intake/{candidate_id}")
def delete_investment_intake_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not delete_intake_candidate(db, candidate_id):
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return {"deleted": True}


@router.get("/intake/{candidate_id}/analysis")
def get_investment_intake_analysis(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    analysis = analyze_intake_candidate(db, candidate_id, _investment_rows(db))
    if not analysis:
        raise HTTPException(status_code=404, detail="Investment intake candidate not found.")
    return analysis


@router.post("/reports/generate")
def post_investment_report(
    request: InvestmentReportRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return generate_investment_report(db, _investment_rows(db), request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/opportunities/sources")
def get_investment_opportunity_sources() -> dict[str, Any]:
    return opportunity_sources()


@router.get("/opportunities")
def get_investment_opportunities(
    db: Session = Depends(get_db),
    source_id: str | None = Query(default=None),
    property_type: str | None = Query(default=None),
    listing_status: str | None = Query(default=None),
    parcel_match_status: str | None = Query(default=None),
    minimum_acres: float | None = Query(default=None),
    maximum_acres: float | None = Query(default=None),
) -> dict[str, Any]:
    return list_opportunities(
        db,
        _investment_rows(db),
        {
            "source_id": source_id,
            "property_type": property_type,
            "listing_status": listing_status,
            "parcel_match_status": parcel_match_status,
            "minimum_acres": minimum_acres,
            "maximum_acres": maximum_acres,
        },
    )


@router.post("/opportunities/refresh")
def post_investment_opportunities_refresh(request: InvestmentOpportunityRefreshRequest) -> dict[str, Any]:
    return refresh_opportunities(request.source_id)


@router.post("/opportunities/{opportunity_id}/match")
def post_investment_opportunity_match(
    opportunity_id: str,
    request: InvestmentOpportunityMatchRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return match_opportunity(db, opportunity_id, _investment_rows(db), request)


@router.post("/opportunities/{opportunity_id}/intake")
def post_investment_opportunity_intake(
    opportunity_id: str,
    request: InvestmentOpportunityIntakeRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return opportunity_to_intake(db, opportunity_id, _investment_rows(db), request)


@router.post("/radar/search")
def post_investment_radar_search(
    strategy: str = Query(default="industrial_site"),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return radar_search(_investment_rows(db), strategy=strategy, limit=limit)


@router.get("/radar/areas/{area_id}")
def get_investment_radar_area(
    area_id: str,
    strategy: str = Query(default="industrial_site"),
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return radar_area(_investment_rows(db), area_id, strategy=strategy)


@router.get("/radar/areas/{area_id}/parcels")
def get_investment_radar_area_parcels(
    area_id: str,
    limit: int = Query(default=80, ge=1, le=250),
    db: Session | None = Depends(get_optional_read_only_db),
) -> dict[str, Any]:
    return radar_area_parcels(_investment_rows(db), area_id, limit=limit)


@router.get("/radar/areas/{area_id}/opportunities")
def get_investment_radar_area_opportunities(
    area_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return radar_area_opportunities(db, _investment_rows(db), area_id)


@router.get("/engagements")
def get_investment_engagements(db: Session = Depends(get_db)) -> dict[str, Any]:
    return list_engagements(db)


@router.post("/engagements")
def post_investment_engagement(
    request: InvestmentEngagementPayload,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return create_engagement(db, request)


@router.get("/engagements/{engagement_id}")
def get_investment_engagement(
    engagement_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    engagement = get_engagement(db, engagement_id)
    if not engagement:
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return engagement


@router.patch("/engagements/{engagement_id}")
def patch_investment_engagement(
    engagement_id: str,
    request: InvestmentEngagementPatch,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    engagement = update_engagement(db, engagement_id, request)
    if not engagement:
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return engagement


@router.delete("/engagements/{engagement_id}")
def delete_investment_engagement(
    engagement_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not delete_engagement(db, engagement_id):
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return {"deleted": True}


@router.post("/engagements/{engagement_id}/criteria")
def post_investment_engagement_criteria(
    engagement_id: str,
    request: InvestmentEngagementCriteriaRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    engagement = set_criteria(db, engagement_id, request)
    if not engagement:
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return engagement


@router.post("/engagements/{engagement_id}/shortlist")
def post_investment_engagement_shortlist(
    engagement_id: str,
    request: InvestmentEngagementShortlistRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    engagement = add_shortlist_item(db, engagement_id, request)
    if not engagement:
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return engagement


@router.post("/engagements/{engagement_id}/report")
def post_investment_engagement_report(
    engagement_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    report = engagement_report(db, engagement_id)
    if not report:
        raise HTTPException(status_code=404, detail="Investment engagement not found.")
    return report


@router.get("/underwriting/templates")
def get_investment_underwriting_templates(db: Session = Depends(get_db)) -> dict[str, Any]:
    return list_underwriting_templates(db)


@router.post("/underwriting/templates")
def post_investment_underwriting_template(
    request: InvestmentUnderwritingTemplatePayload,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return create_underwriting_template(db, request)


@router.post("/underwriting/prefill")
def post_investment_underwriting_prefill(
    request: InvestmentUnderwritingPrefillRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return prefill_underwriting(db, request, _investment_rows(db))


@router.get("/underwriting/scenarios")
def get_investment_underwriting_scenarios(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return list_underwriting_scenarios(db)


@router.post("/underwriting/calculate")
def post_investment_underwriting_calculate(
    request: InvestmentUnderwritingCalculateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    context = None
    if request.candidate_id:
        context = build_intake_research_context(db, _investment_rows(db), request.candidate_id)
    elif request.parcel_id:
        context = build_parcel_research_context(db, _investment_rows(db), request.parcel_id, strategy=request.strategy)
    return calculate_underwriting(request, research_context=context)


@router.post("/underwriting/scenarios")
def post_investment_underwriting_scenario(
    request: InvestmentUnderwritingScenarioPayload,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return create_underwriting_scenario(db, request, _investment_rows(db))


@router.get("/underwriting/scenarios/{scenario_id}")
def get_investment_underwriting_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    scenario = get_underwriting_scenario(db, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Underwriting scenario not found.")
    return scenario


@router.patch("/underwriting/scenarios/{scenario_id}")
def patch_investment_underwriting_scenario(
    scenario_id: str,
    request: InvestmentUnderwritingScenarioPatch,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    scenario = update_underwriting_scenario(db, scenario_id, request, _investment_rows(db))
    if not scenario:
        raise HTTPException(status_code=404, detail="Underwriting scenario not found.")
    return scenario


@router.delete("/underwriting/scenarios/{scenario_id}")
def delete_investment_underwriting_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not delete_underwriting_scenario(db, scenario_id):
        raise HTTPException(status_code=404, detail="Underwriting scenario not found.")
    return {"deleted": True}


@router.post("/underwriting/scenarios/{scenario_id}/calculate")
def post_investment_underwriting_saved_calculate(
    scenario_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    scenario = calculate_saved_underwriting_scenario(db, scenario_id, _investment_rows(db))
    if not scenario:
        raise HTTPException(status_code=404, detail="Underwriting scenario not found.")
    return scenario


@router.post("/underwriting/compare")
def post_investment_underwriting_compare(
    request: InvestmentUnderwritingCompareRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return compare_underwriting_scenarios(db, request.scenario_ids)


def _investment_rows(db: Session | None) -> list[dict[str, Any]]:
    economics = get_cached_economics_intelligence(db)
    powerbi = build_powerbi_export_payload(economics, mode="live")
    tables = powerbi.get("tables") if isinstance(powerbi.get("tables"), dict) else {}
    rows = tables.get("parcel_economic_signal_fact") if isinstance(tables, dict) else []
    safe_rows = [row for row in rows if isinstance(row, dict)]
    enriched = enrich_basis_context(safe_rows, db)
    if db is None:
        return enriched
    parcel_ids = [str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id") or "") for row in enriched]
    environmental = environmental_context_by_parcel(db, parcel_ids)
    return [
        {**row, **environmental.get(str(row.get("parcel_id") or row.get("signal_id") or row.get("row_id") or ""), {})}
        for row in enriched
    ]
