"""Pydantic schemas for school constraint endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SchoolConstraintBucket(BaseModel):
    """Distribution bucket for school assignment rollups."""

    value: str
    count: int
    percentage: float | None = None


class SchoolLevelAssignmentResponse(BaseModel):
    """Selected school assignment for a single school level."""

    zone_id: str | None = None
    school_name: str | None = None
    school_name_normalized: str | None = None
    has_assignment: bool
    overlap_area_acres: float | None = None
    overlap_percent: float | None = None
    match_confidence: str | None = None
    capacity_status: str = "not_available"
    utilization_percent: float | None = None
    available_seats: int | None = None


class SchoolConstraintDetailResponse(BaseModel):
    """Parcel-level school assignment and capacity-readiness response."""

    official_parcel_id: str
    pin14: str | None = None
    objectid_1: int | None = None
    elementary: SchoolLevelAssignmentResponse
    middle: SchoolLevelAssignmentResponse
    high: SchoolLevelAssignmentResponse
    school_assignment_confidence: str | None = None
    school_assignment_review_required: bool
    assignment_method: str | None = None
    school_capacity_data_available: bool
    school_capacity_review_required: bool
    school_capacity_score: float | None = None
    school_constraint_score: float | None = None
    school_constraint_class: str = "not_scored"
    school_summary_status: str | None = None
    recommended_action: str | None = None
    data_quality_flags: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class SchoolConstraintFilterResult(BaseModel):
    """Compact parcel result for school constraint filtering."""

    official_parcel_id: str
    pin14: str | None = None
    elementary_school_name: str | None = None
    middle_school_name: str | None = None
    high_school_name: str | None = None
    has_elementary_assignment: bool
    has_middle_assignment: bool
    has_high_assignment: bool
    school_assignment_confidence: str | None = None
    school_assignment_review_required: bool
    school_capacity_data_available: bool
    school_constraint_class: str = "not_scored"
    school_summary_status: str | None = None
    recommended_action: str | None = None
    data_quality_flags: list[str] = Field(default_factory=list)


class SchoolConstraintFilterResponse(BaseModel):
    """Paginated school constraint filter response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    results: list[SchoolConstraintFilterResult] = Field(default_factory=list)


class SchoolConstraintStatisticsResponse(BaseModel):
    """High-level school assignment and capacity-readiness statistics."""

    total_parcels: int
    elementary_assigned_parcels: int
    middle_assigned_parcels: int
    high_assigned_parcels: int
    missing_elementary_assignment_parcels: int
    missing_middle_assignment_parcels: int
    missing_high_assignment_parcels: int
    assignment_review_required_parcels: int
    capacity_data_available_parcels: int
    capacity_not_available_parcels: int
    school_constraint_score_non_null_parcels: int
    school_reference_count: int
    included_public_ccs_reference_count: int
    school_zone_count: int
    included_cfs_v1_zone_count: int
    safe_for_api_exposure: bool
    assignment_confidence_distribution: list[SchoolConstraintBucket] = Field(
        default_factory=list
    )
    summary_status_distribution: list[SchoolConstraintBucket] = Field(
        default_factory=list
    )
    constraint_class_distribution: list[SchoolConstraintBucket] = Field(
        default_factory=list
    )
    reference_exclusion_distribution: list[SchoolConstraintBucket] = Field(
        default_factory=list
    )
    zone_level_distribution: list[SchoolConstraintBucket] = Field(default_factory=list)
    filters_applied: dict[str, Any] = Field(default_factory=dict)
    caveats: list[str] = Field(default_factory=list)


class SchoolDistrictSummaryRow(BaseModel):
    """School attendance-zone parcel count summary row."""

    school_level: str
    zone_id: str | None = None
    school_name: str | None = None
    school_name_normalized: str | None = None
    match_confidence: str | None = None
    parcel_count: int
    review_required_count: int
    capacity_data_available_count: int
    capacity_status: str = "not_available"


class SchoolDistrictSummaryResponse(BaseModel):
    """Attendance-zone district summary response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    total_rows: int
    districts: list[SchoolDistrictSummaryRow] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class SchoolQaIssueResponse(BaseModel):
    """School constraint QA issue row."""

    issue_type: str
    severity: str
    school_level: str | None = None
    school_name: str | None = None
    detail: str
    parcel_count: int | None = None
    recommended_action: str | None = None


class SchoolQaSummaryResponse(BaseModel):
    """School constraint QA summary response."""

    school_reference_count: int
    included_public_ccs_count: int
    excluded_count_by_reason: list[SchoolConstraintBucket] = Field(default_factory=list)
    school_zones_count_by_level: list[SchoolConstraintBucket] = Field(
        default_factory=list
    )
    unmatched_zone_names: list[SchoolQaIssueResponse] = Field(default_factory=list)
    duplicate_normalized_names: list[SchoolQaIssueResponse] = Field(
        default_factory=list
    )
    parcel_assignment_count: int
    missing_elementary_assignment_count: int
    missing_middle_assignment_count: int
    missing_high_assignment_count: int
    multi_zone_overlap_counts: dict[str, int] = Field(default_factory=dict)
    parcels_assigned_to_unmatched_school_zones: int
    capacity_available: bool
    safe_for_api_exposure: bool
    caveats: list[str] = Field(default_factory=list)


class SchoolUtilizationSeedResponse(BaseModel):
    """Presentation-derived school utilization seed row."""

    school_name: str | None = None
    school_name_normalized: str | None = None
    school_level: str | None = None
    school_year: str | None = None
    utilization_pct: float | None = None
    utilization_class: str | None = None
    source_confidence: str = "presentation_derived"
    needs_verification: bool = True
    matched_school_reference_id: str | None = None
    match_confidence: str | None = None


class SchoolUtilizationSeedPageResponse(BaseModel):
    """Paginated presentation-derived school utilization seed response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    rows: list[SchoolUtilizationSeedResponse] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class SchoolUtilizationZoneResponse(SchoolUtilizationSeedResponse):
    """Presentation-derived utilization seed joined to attendance-zone geometry."""

    zone_id: str
    school_system: str | None = None
    zone_match_confidence: str | None = None
    source_layer: str | None = None
    source_objectid: str | None = None
    geometry: dict[str, Any] | None = None


class SchoolUtilizationZonePageResponse(BaseModel):
    """Paginated attendance-zone geometry for presentation-derived utilization."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    zones: list[SchoolUtilizationZoneResponse] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class SchoolPressurePropertiesResponse(BaseModel):
    """Safe school utilization plus observed permit activity context."""

    attendance_area_id: str | None = None
    caveats: list[str] = Field(default_factory=list)
    enrollment_year: str | None = None
    major_development_permit_count_recent: int | None = None
    multifamily_permit_count_recent: int | None = None
    observed_growth_pressure_band: str = "unknown"
    permit_count_previous: int | None = None
    permit_count_recent: int | None = None
    permit_growth_delta: int | None = None
    permit_growth_pct: float | None = None
    recommended_followup: str
    residential_permit_count_recent: int | None = None
    school_level: str | None = None
    school_name: str | None = None
    school_pressure_watch_band: str = "data needed"
    top_reasons: list[str] = Field(default_factory=list)
    utilization_pct: float | None = None
    utilization_status: str | None = None


class SchoolPressureFeatureResponse(BaseModel):
    """GeoJSON feature for school pressure review."""

    type: str = "Feature"
    geometry: dict[str, Any] | None = None
    properties: SchoolPressurePropertiesResponse


class SchoolPressureSummaryResponse(BaseModel):
    """Summary for school utilization and observed permit pressure review."""

    areas_analyzed: int
    areas_with_recent_permits: int
    areas_with_utilization: int
    data_needed_count: int
    elevated_review_count: int
    recent_residential_permits_in_watched_areas: int


class SchoolPressureResponse(BaseModel):
    """Attendance-area school utilization plus observed permit activity signal."""

    as_of: str | None = None
    caveats: list[str] = Field(default_factory=list)
    data_coverage_notes: list[str] = Field(default_factory=list)
    features: list[SchoolPressureFeatureResponse] = Field(default_factory=list)
    limit: int
    mode: str = "live"
    offset: int
    summary: SchoolPressureSummaryResponse
    total_count: int


class ParcelSchoolUtilizationSeedLevelResponse(BaseModel):
    """Assigned school level plus optional presentation-derived utilization seed."""

    school_name: str | None = None
    school_name_normalized: str | None = None
    has_assignment: bool
    utilization_seed: SchoolUtilizationSeedResponse | None = None


class ParcelSchoolUtilizationSeedResponse(BaseModel):
    """Parcel-level presentation-derived utilization seed lookup."""

    official_parcel_id: str
    pin14: str | None = None
    elementary: ParcelSchoolUtilizationSeedLevelResponse
    middle: ParcelSchoolUtilizationSeedLevelResponse
    high: ParcelSchoolUtilizationSeedLevelResponse
    source_confidence: str = "presentation_derived"
    needs_verification: bool = True
    school_constraint_score: float | None = None
    school_constraint_class: str = "not_scored"
    final_capacity_scoring_enabled: bool = False
    caveats: list[str] = Field(default_factory=list)


class SchoolLeaPupilContextRow(BaseModel):
    """District-level LEA pupil count row."""

    school_year: int
    lea: str
    lea_name: str | None = None
    month: str | None = None
    measure_type: str
    grade_level: str
    pupil_count: int | None = None
    source_file: str | None = None
    source_confidence: str = "uploaded_lea_pupil_file"
    notes: str | None = None


class SchoolLeaPupilContextResponse(BaseModel):
    """Paginated district-level LEA pupil context response."""

    filters_applied: dict[str, Any] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    rows: list[SchoolLeaPupilContextRow] = Field(default_factory=list)
    district_level_only: bool = True
    school_capacity_table_updated: bool = False
    school_capacity_scores_enabled: bool = False
    caveats: list[str] = Field(default_factory=list)


class SchoolLeaPupilMeasureTotal(BaseModel):
    """District-level total row for one LEA pupil measure."""

    measure_type: str
    pupil_count: int | None = None


class SchoolLeaPupilGradeValue(BaseModel):
    """District-level enrollment value for a single grade level."""

    grade_level: str
    pupil_count: int | None = None


class SchoolLeaPupilContextSummaryResponse(BaseModel):
    """Compact district-level LEA pupil context summary."""

    school_year: int | None = None
    lea: str | None = None
    lea_name: str | None = None
    source_confidence: str = "uploaded_lea_pupil_file"
    total_rows: int
    totals_by_measure: list[SchoolLeaPupilMeasureTotal] = Field(default_factory=list)
    enrollment_by_grade: list[SchoolLeaPupilGradeValue] = Field(default_factory=list)
    district_level_only: bool = True
    school_capacity_table_updated: bool = False
    school_capacity_scores_enabled: bool = False
    caveats: list[str] = Field(default_factory=list)
