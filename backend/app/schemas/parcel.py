from pydantic import BaseModel, ConfigDict, Field


class ParcelSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    official_parcel_id: str = Field(..., description="Stable CFS parcel ID.")
    pin14: str | None = Field(default=None, description="Business parcel PIN.")
    parcel_quality_status: str | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None


class ParcelDetail(ParcelSummary):
    owner_display: str | None = None
    subdivision: str | None = None
    neighborhood: str | None = None
    parcel_size_category: str | None = None
    valuation_band: str | None = None
    governance_warning_categories: list[str] = Field(default_factory=list)


class ParcelLocation(BaseModel):
    subdivision: str | None = None
    neighborhood: str | None = None


class ParcelValuation(BaseModel):
    marketvalue_numeric: float | None = None
    assessedvalue_numeric: float | None = None
    valuation_band: str | None = None


class ParcelContext(BaseModel):
    parcel_size_category: str | None = None
    parcel_quality_status: str | None = None


class ParcelZoning(BaseModel):
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    zoning_assignment_confidence: str | None = None


class ParcelGovernance(BaseModel):
    governance_warning_categories: list[str] = Field(default_factory=list)
    safe_for_dashboard: bool | None = None


class ParcelPlanning(BaseModel):
    planning_jurisdiction: str | None = None


class ParcelMetadata(BaseModel):
    transformed_at: str | None = None


class ParcelMapFocusCentroid(BaseModel):
    longitude: float
    latitude: float


class ParcelMapFocusExtent(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class ParcelMapFocusSpatialReference(BaseModel):
    wkid: int = 4326


class ParcelMapFocus(BaseModel):
    centroid: ParcelMapFocusCentroid | None = None
    extent: ParcelMapFocusExtent | None = None
    spatial_reference: ParcelMapFocusSpatialReference = Field(
        default_factory=ParcelMapFocusSpatialReference,
    )
    geometry_available: bool = False
    full_geometry_returned: bool = False


class ParcelDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    official_parcel_id: str
    pin14: str | None = None
    objectid_1: int | None = None
    location: ParcelLocation
    valuation: ParcelValuation
    parcel_context: ParcelContext
    zoning: ParcelZoning
    governance: ParcelGovernance
    planning: ParcelPlanning
    metadata: ParcelMetadata
    map_focus: ParcelMapFocus


class ParcelSearchResult(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    subdivision: str | None = None
    neighborhood: str | None = None
    owner_display: str | None = None
    mailing_city: str | None = None
    mailing_state: str | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    zoning_assignment_confidence: str | None = None
    parcel_quality_status: str | None = None
    valuation_band: str | None = None
    safe_for_dashboard: bool | None = None
    governance_warning_categories: list[str] = Field(default_factory=list)


class ParcelSearchResponse(BaseModel):
    query: str
    limit: int
    offset: int
    total_count: int
    results: list[ParcelSearchResult] = Field(default_factory=list)


class ParcelFilterResult(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    subdivision: str | None = None
    neighborhood: str | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    zoning_assignment_confidence: str | None = None
    parcel_quality_status: str | None = None
    valuation_band: str | None = None
    parcel_size_category: str | None = None
    safe_for_dashboard: bool | None = None
    governance_warning_categories: list[str] = Field(default_factory=list)


class ParcelFilterResponse(BaseModel):
    filters_applied: dict[str, str | bool] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    results: list[ParcelFilterResult] = Field(default_factory=list)


class ParcelStatisticsBucket(BaseModel):
    value: str
    count: int


class ParcelStatisticsResponse(BaseModel):
    total_parcels: int
    zoned_parcels: int
    no_match_parcels: int
    safe_for_dashboard_parcels: int
    review_parcels: int
    high_confidence_parcels: int
    low_confidence_parcels: int
    multi_jurisdiction_parcels: int
    by_zoning_jurisdiction: list[ParcelStatisticsBucket] = Field(default_factory=list)
    by_zoning_category: list[ParcelStatisticsBucket] = Field(default_factory=list)
    by_parcel_quality_status: list[ParcelStatisticsBucket] = Field(
        default_factory=list,
    )
    by_valuation_band: list[ParcelStatisticsBucket] = Field(default_factory=list)
    by_governance_warning: list[ParcelStatisticsBucket] = Field(default_factory=list)
    filters_applied: dict[str, str | bool] = Field(default_factory=dict)


class ParcelZoningJurisdictionSummary(BaseModel):
    zoning_jurisdiction_name: str
    parcel_count: int
    percentage: float
    high_confidence_count: int
    review_count: int
    safe_for_dashboard_count: int


class ParcelZoningCodeSummary(BaseModel):
    zoning_jurisdiction_name: str
    zoning_code: str
    zoning_category: str
    parcel_count: int
    percentage: float
    review_count: int


class ParcelZoningCategorySummary(BaseModel):
    zoning_category: str
    parcel_count: int
    percentage: float


class ParcelZoningConfidenceSummary(BaseModel):
    confidence: str
    parcel_count: int
    percentage: float


class ParcelZoningGovernanceWarningSummary(BaseModel):
    governance_warning: str
    parcel_count: int
    percentage: float


class ParcelZoningSummaryResponse(BaseModel):
    total_parcels: int
    zoned_parcels: int
    no_match_parcels: int
    jurisdiction_summary: list[ParcelZoningJurisdictionSummary] = Field(
        default_factory=list,
    )
    zoning_code_summary: list[ParcelZoningCodeSummary] = Field(default_factory=list)
    zoning_category_summary: list[ParcelZoningCategorySummary] = Field(
        default_factory=list,
    )
    confidence_summary: list[ParcelZoningConfidenceSummary] = Field(
        default_factory=list,
    )
    multi_jurisdiction_count: int
    governance_warning_summary: list[ParcelZoningGovernanceWarningSummary] = Field(
        default_factory=list,
    )
    filters_applied: dict[str, str | bool] = Field(default_factory=dict)


class ParcelGovernanceWarningResult(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    subdivision: str | None = None
    neighborhood: str | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    zoning_assignment_confidence: str | None = None
    parcel_quality_status: str | None = None
    valuation_band: str | None = None
    safe_for_dashboard: bool | None = None
    governance_warning_categories: list[str] = Field(default_factory=list)


class ParcelGovernanceWarningSummary(BaseModel):
    warning_category: str
    parcel_count: int
    percentage: float


class ParcelGovernanceWarningResponse(BaseModel):
    filters_applied: dict[str, str | bool] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    warning_summary: list[ParcelGovernanceWarningSummary] = Field(
        default_factory=list,
    )
    results: list[ParcelGovernanceWarningResult] = Field(default_factory=list)
