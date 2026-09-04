import re

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies.database import get_read_only_db
from app.repositories import ParcelRepository
from app.schemas.imagery import (
    ParcelImageryItem,
    ParcelImageryLocation,
    ParcelImageryResponse,
)
from app.services.eagleview_imagery_service import (
    EagleViewImageryProvider,
    ImageryDirection,
    ImageryNotConfigured,
    ImageryProviderUnavailable,
)

router = APIRouter(prefix="/imagery/eagleview", tags=["imagery"])
PARCEL_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,96}$")


def get_imagery_provider() -> EagleViewImageryProvider:
    settings = get_settings()
    return EagleViewImageryProvider(
        api_key=settings.cfs_eagleview_api_key,
        secret_key=settings.cfs_eagleview_secret_key,
        timeout_seconds=settings.cfs_eagleview_timeout_seconds,
    )


@router.get("/parcel/{parcel_id}", response_model=ParcelImageryResponse)
def get_parcel_imagery(
    parcel_id: str = Path(..., min_length=1, max_length=96),
    db: Session = Depends(get_read_only_db, scope="function"),
    provider: EagleViewImageryProvider = Depends(get_imagery_provider),
) -> ParcelImageryResponse:
    latitude, longitude = _parcel_location(db, parcel_id)
    try:
        images = provider.search(latitude, longitude)
    except ImageryNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ImageryProviderUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Imagery service is temporarily unavailable.",
        ) from exc
    return ParcelImageryResponse(
        parcel_id=parcel_id,
        location=ParcelImageryLocation(latitude=latitude, longitude=longitude),
        images=[
            ParcelImageryItem(direction=image.direction, capture_date=image.capture_date)
            for image in images
        ],
    )


@router.get("/parcel/{parcel_id}/image/{direction}")
def get_parcel_imagery_image(
    direction: ImageryDirection,
    parcel_id: str = Path(..., min_length=1, max_length=96),
    width: int = Query(800, ge=200, le=1600),
    height: int = Query(600, ge=150, le=1200),
    db: Session = Depends(get_read_only_db, scope="function"),
    provider: EagleViewImageryProvider = Depends(get_imagery_provider),
) -> Response:
    latitude, longitude = _parcel_location(db, parcel_id)
    try:
        record = next(
            (
                item
                for item in provider.search(latitude, longitude)
                if item.direction == direction
            ),
            None,
        )
        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Imagery not found for this direction.",
            )
        image = provider.fetch_image(record, width=width, height=height)
    except ImageryNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ImageryProviderUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Imagery service is temporarily unavailable.",
        ) from exc
    return Response(
        content=image.content,
        media_type=image.media_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


def _parcel_location(db: Session, parcel_id: str) -> tuple[float, float]:
    if not PARCEL_ID_PATTERN.fullmatch(parcel_id):
        raise HTTPException(status_code=422, detail="Invalid parcel ID.")
    record = ParcelRepository(db).get_by_official_parcel_id(parcel_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Parcel not found.")
    if record.centroid_latitude is None or record.centroid_longitude is None:
        raise HTTPException(status_code=404, detail="Parcel location is unavailable.")
    return float(record.centroid_latitude), float(record.centroid_longitude)
