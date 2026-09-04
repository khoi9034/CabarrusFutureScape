from typing import Literal

from pydantic import BaseModel, Field

ImageryDirection = Literal["north", "south", "east", "west"]


class ParcelImageryLocation(BaseModel):
    latitude: float
    longitude: float


class ParcelImageryItem(BaseModel):
    direction: ImageryDirection
    capture_date: str | None = None


class ParcelImageryResponse(BaseModel):
    parcel_id: str
    location: ParcelImageryLocation
    images: list[ParcelImageryItem] = Field(default_factory=list)
    provider: str = "EagleView/Pictometry"
