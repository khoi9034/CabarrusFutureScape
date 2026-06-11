"""Pydantic schemas for constraint intelligence endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FloodConstraintBucket(BaseModel):
    """Distribution bucket for flood constraint rollups."""

    value: str
    parcel_count: int
    percentage: float | None = None


class FloodConstraintDetailResponse(BaseModel):
    """Parcel-level FEMA flood constraint intelligence."""

    official_parcel_id: str
    pin14: str | None = None
    dominant_flood_zone: str | None = None
    flood_zone_codes: list[str] = Field(default_factory=list)
    floodplain_present: bool
    floodway_present: bool
    sfha_present: bool
    moderate_flood_present: bool
    minimal_flood_present: bool
    parcel_area_acres: float | None = None
    flood_constrained_area_acres: float | None = None
    floodway_area_acres: float | None = None
    sfha_area_acres: float | None = None
    percent_parcel_constrained: float | None = None
    percent_parcel_floodway: float | None = None
    percent_parcel_sfha: float | None = None
    flood_review_required: bool
    buildability_impact: str | None = None
    flood_constraint_score: float | None = None
    flood_severity_class: str | None = None
    overlay_confidence: str | None = None


class FloodConstraintFilterResponse(BaseModel):
    """Paginated parcel flood constraint filter response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    results: list[FloodConstraintDetailResponse] = Field(default_factory=list)


class FloodConstraintStatisticsResponse(BaseModel):
    """High-level flood constraint statistics."""

    total_parcels: int
    floodplain_parcels: int
    floodway_parcels: int
    sfha_parcels: int
    review_required_parcels: int
    high_severe_buildability_parcels: int
    severity_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    buildability_impact_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    dominant_zone_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    filters_applied: dict[str, Any] = Field(default_factory=dict)


class FloodConstraintSummaryResponse(BaseModel):
    """Compact dashboard-safe flood constraint summary."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    total_parcels: int
    floodplain_parcels: int
    floodway_parcels: int
    sfha_parcels: int
    review_required_parcels: int
    high_severe_buildability_parcels: int
    average_percent_constrained: float | None = None
    max_percent_constrained: float | None = None
    severity_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    buildability_impact_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    dominant_zone_distribution: list[FloodConstraintBucket] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class SpatialReferenceResponse(BaseModel):
    """Spatial reference metadata for lightweight map geometry responses."""

    wkid: int = 4326


class FloodZoneGeometryResponse(BaseModel):
    """Lightweight GeoJSON-style FEMA flood zone polygon geometry."""

    coordinates: Any
    spatial_reference: SpatialReferenceResponse = Field(
        default_factory=SpatialReferenceResponse
    )
    type: str


class FloodZoneResponse(BaseModel):
    """Authoritative FEMA NFHL Layer 28 flood zone polygon."""

    flood_constraint_type: str | None = None
    flood_severity_class: str | None = None
    flood_zone_code: str | None = None
    flood_zone_internal_id: int
    fld_ar_id: str | None = None
    geometry: FloodZoneGeometryResponse
    gfid: str | None = None
    globalid: str | None = None
    source_layer: str | None = None
    source_objectid: int | None = None


class FloodZonePageResponse(BaseModel):
    """Paginated FEMA flood zone source geometry response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int | None
    offset: int
    total_count: int
    zones: list[FloodZoneResponse] = Field(default_factory=list)
