from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies.database import get_read_only_db
from app.repositories import DevelopmentRepository
from app.repositories.development_repository import (
    DevelopmentActivitySummaryFilters,
    DevelopmentHotspotsFilters,
    DevelopmentStatisticsFilters,
    DevelopmentTemporalQueryFilters,
    DevelopmentTrendsFilters,
    DevelopmentZoningSummaryFilters,
)
from app.schemas import (
    DevelopmentActivitySummaryResponse,
    DevelopmentHotspotsResponse,
    DevelopmentLookupResponse,
    DevelopmentStatisticsResponse,
    DevelopmentTemporalQueryResponse,
    DevelopmentTrendsResponse,
    DevelopmentZoningSummaryResponse,
)
from app.services import DevelopmentService

router = APIRouter(prefix="/development", tags=["Development Activity"])

# TODO: Implement read-only development activity endpoints from:
# - docs/backend/development_activity_api_contract.md


@router.get("/statistics", response_model=DevelopmentStatisticsResponse)
def get_development_statistics(
    year: int | None = Query(default=None, ge=1900, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    activity_class: str | None = Query(default=None),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentStatisticsResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_statistics(
        filters=DevelopmentStatisticsFilters(
            activity_class=activity_class,
            month=month,
            permit_type=permit_type,
            work_type=work_type,
            year=year,
            zoning_category=zoning_category,
            zoning_jurisdiction=zoning_jurisdiction,
        ),
    )


@router.get("/trends", response_model=DevelopmentTrendsResponse)
def get_development_trends(
    start_year: int | None = Query(default=None, ge=1900, le=2100),
    end_year: int | None = Query(default=None, ge=1900, le=2100),
    year: int | None = Query(default=None, ge=1900, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    permit_status: str | None = Query(default=None),
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    rolling_window: int | None = Query(default=None),
    group_by: str | None = Query(default=None),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentTrendsResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    try:
        return service.get_trends(
            filters=DevelopmentTrendsFilters(
                end_year=end_year,
                group_by=group_by,
                month=month,
                permit_status=permit_status,
                permit_type=permit_type,
                rolling_window=rolling_window,
                start_year=start_year,
                work_type=work_type,
                year=year,
                zoning_category=zoning_category,
                zoning_jurisdiction=zoning_jurisdiction,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/hotspots", response_model=DevelopmentHotspotsResponse)
def get_development_hotspots(
    activity_class: str | None = Query(default=None),
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=1900, le=2100),
    recent_window: int | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentHotspotsResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    try:
        return service.get_hotspots(
            filters=DevelopmentHotspotsFilters(
                activity_class=activity_class,
                permit_type=permit_type,
                recent_window=recent_window,
                work_type=work_type,
                year=year,
                zoning_category=zoning_category,
                zoning_jurisdiction=zoning_jurisdiction,
            ),
            limit=limit,
            offset=offset,
            sort_by=sort_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/zoning-summary", response_model=DevelopmentZoningSummaryResponse)
def get_development_zoning_summary(
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    zoning_code: str | None = Query(default=None),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    permit_status: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=1900, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    limit: int = Query(default=50, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentZoningSummaryResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_zoning_summary(
        filters=DevelopmentZoningSummaryFilters(
            month=month,
            permit_status=permit_status,
            permit_type=permit_type,
            work_type=work_type,
            year=year,
            zoning_category=zoning_category,
            zoning_code=zoning_code,
            zoning_jurisdiction=zoning_jurisdiction,
        ),
        limit=limit,
        offset=offset,
    )


@router.get("/activity-summary", response_model=DevelopmentActivitySummaryResponse)
def get_development_activity_summary(
    year: int | None = Query(default=None, ge=1900, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    date_start: date | None = Query(default=None),
    date_end: date | None = Query(default=None),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    permit_status: str | None = Query(default=None),
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    activity_class: str | None = Query(default=None),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentActivitySummaryResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    try:
        return service.get_activity_summary(
            filters=DevelopmentActivitySummaryFilters(
                activity_class=activity_class,
                date_end=date_end,
                date_start=date_start,
                month=month,
                permit_status=permit_status,
                permit_type=permit_type,
                work_type=work_type,
                year=year,
                zoning_category=zoning_category,
                zoning_jurisdiction=zoning_jurisdiction,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/temporal-query", response_model=DevelopmentTemporalQueryResponse)
def get_development_temporal_query(
    year: int | None = Query(default=None, ge=1900, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    date_start: date | None = Query(default=None),
    date_end: date | None = Query(default=None),
    rolling_window: int | None = Query(default=None),
    permit_type: str | None = Query(default=None),
    work_type: str | None = Query(default=None),
    permit_status: str | None = Query(default=None),
    zoning_jurisdiction: str | None = Query(default=None),
    zoning_category: str | None = Query(default=None),
    activity_class: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1),
    offset: int = Query(default=0, ge=0),
    bbox: str | None = Query(default=None),
    include_geometry: bool = Query(default=False),
    db: Session = Depends(get_read_only_db),
) -> DevelopmentTemporalQueryResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    try:
        return service.temporal_query(
            bbox=bbox,
            filters=DevelopmentTemporalQueryFilters(
                activity_class=activity_class,
                date_end=date_end,
                date_start=date_start,
                month=month,
                permit_status=permit_status,
                permit_type=permit_type,
                rolling_window=rolling_window,
                work_type=work_type,
                year=year,
                zoning_category=zoning_category,
                zoning_jurisdiction=zoning_jurisdiction,
            ),
            include_geometry=include_geometry,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/permit-types", response_model=DevelopmentLookupResponse)
def get_development_permit_types(
    db: Session = Depends(get_read_only_db),
) -> DevelopmentLookupResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_permit_types()


@router.get("/work-types", response_model=DevelopmentLookupResponse)
def get_development_work_types(
    db: Session = Depends(get_read_only_db),
) -> DevelopmentLookupResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_work_types()


@router.get("/jurisdictions", response_model=DevelopmentLookupResponse)
def get_development_jurisdictions(
    db: Session = Depends(get_read_only_db),
) -> DevelopmentLookupResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_jurisdictions()


@router.get("/activity-classes", response_model=DevelopmentLookupResponse)
def get_development_activity_classes(
    db: Session = Depends(get_read_only_db),
) -> DevelopmentLookupResponse:
    service = DevelopmentService(DevelopmentRepository(db))
    return service.get_activity_classes()
