from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DevelopmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    permit_count: int = 0
    active_parcel_count: int = 0
    unmatched_permit_count: int = 0
    ambiguous_permit_count: int = 0
    activity_anchor_date: date | None = None


class DevelopmentActivityClassSummary(BaseModel):
    no_activity: int = 0
    low_activity: int = 0
    moderate_activity: int = 0
    high_activity: int = 0
    very_high_activity: int = 0


class DevelopmentStatisticsBucket(BaseModel):
    value: str
    count: int


class DevelopmentStatisticsResponse(BaseModel):
    total_permits: int
    parcels_with_activity: int
    parcels_without_activity: int
    recent_activity_parcels_1yr: int
    recent_activity_parcels_3yr: int
    activity_date_min: date | None = None
    activity_date_max: date | None = None
    activity_classes: DevelopmentActivityClassSummary
    by_permit_type: list[DevelopmentStatisticsBucket] = Field(default_factory=list)
    by_work_type: list[DevelopmentStatisticsBucket] = Field(default_factory=list)
    by_status: list[DevelopmentStatisticsBucket] = Field(default_factory=list)
    by_zoning_jurisdiction: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )
    by_zoning_category: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )
    filters_applied: dict[str, int | str] = Field(default_factory=dict)


class DevelopmentTrendPoint(BaseModel):
    year: int | None = None
    month: int | None = None
    permit_count: int
    parcel_count: int | None = None
    total_permit_amount: float | None = None
    zoning_jurisdiction_name: str | None = None
    zoning_category: str | None = None
    permit_type: str | None = None
    work_type: str | None = None


class DevelopmentRollingSummary(BaseModel):
    window_months: int
    start_date: date
    end_date: date
    permit_count: int
    parcel_count: int
    total_permit_amount: float | None = None


class DevelopmentTrendDateRange(BaseModel):
    start_year: int | None = None
    end_year: int | None = None
    activity_date_min: date | None = None
    activity_date_max: date | None = None


class DevelopmentTrendsResponse(BaseModel):
    filters_applied: dict[str, int | str] = Field(default_factory=dict)
    group_by: str | None = None
    rolling_window: int | None = None
    date_range: DevelopmentTrendDateRange
    annual_trends: list[DevelopmentTrendPoint] = Field(default_factory=list)
    monthly_trends: list[DevelopmentTrendPoint] = Field(default_factory=list)
    grouped_trends: list[DevelopmentTrendPoint] = Field(default_factory=list)
    rolling_summary: DevelopmentRollingSummary | None = None
    trend_direction: str
    peak_year: int | None = None
    peak_month: str | None = None
    total_permits: int


class DevelopmentHotspotMapCentroid(BaseModel):
    longitude: float
    latitude: float


class DevelopmentHotspotSpatialReference(BaseModel):
    wkid: int = 4326


class DevelopmentHotspotMapFocus(BaseModel):
    centroid: DevelopmentHotspotMapCentroid | None = None
    spatial_reference: DevelopmentHotspotSpatialReference = Field(
        default_factory=DevelopmentHotspotSpatialReference,
    )
    geometry_available: bool = False
    full_geometry_returned: bool = False


class DevelopmentHotspotResult(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    subdivision: str | None = None
    neighborhood: str | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    parcel_quality_status: str | None = None
    zoning_assignment_confidence: str | None = None
    total_permit_count: int
    first_permit_date: date | None = None
    recent_permit_count_1yr: int
    recent_permit_count_3yr: int
    total_permit_amount: float | None = None
    avg_permit_amount: float | None = None
    latest_permit_date: date | None = None
    active_year_count: int = 0
    dominant_permit_type: str | None = None
    dominant_work_type: str | None = None
    latest_permit_status: str | None = None
    ambiguous_permit_count: int = 0
    co_date_future_outlier_count: int = 0
    development_activity_score: float | None = None
    development_activity_class: str | None = None
    has_unmatched_or_ambiguous_permit_flag: bool
    residential_growth_permits: int = 0
    commercial_activity_permits: int = 0
    industrial_activity_permits: int = 0
    institutional_activity_permits: int = 0
    redevelopment_signal_permits: int = 0
    minor_maintenance_permits: int = 0
    demolition_permits: int = 0
    active_construction_permits: int = 0
    completed_permits: int = 0
    high_value_permits: int = 0
    major_value_permits: int = 0
    dominant_permit_segment: str | None = None
    dominant_growth_signal: str | None = None
    permit_signal_score_max: float | None = None
    permit_signal_score_avg: float | None = None
    current_activity_status: str | None = None
    map_focus: DevelopmentHotspotMapFocus | None = None


class DevelopmentHotspotsResponse(BaseModel):
    filters_applied: dict[str, int | str] = Field(default_factory=dict)
    sort_by: str
    limit: int
    offset: int
    total_count: int
    results: list[DevelopmentHotspotResult] = Field(default_factory=list)


class DevelopmentZoningSummaryRow(BaseModel):
    zoning_jurisdiction_name: str
    dominant_zoning_code_raw: str
    dominant_zoning_general_normalized: str
    permit_type: str
    work_type: str
    permit_status: str
    activity_year: int | None = None
    activity_month: int | None = None
    permit_count: int
    active_parcel_count: int
    total_permit_amount: float | None = None
    avg_permit_amount: float | None = None
    very_high_activity_parcel_count: int = 0
    high_activity_parcel_count: int = 0
    moderate_activity_parcel_count: int = 0
    low_activity_parcel_count: int = 0


class DevelopmentZoningSummaryResponse(BaseModel):
    filters_applied: dict[str, int | str] = Field(default_factory=dict)
    limit: int
    offset: int
    total_count: int
    summary: list[DevelopmentZoningSummaryRow] = Field(default_factory=list)


class DevelopmentActivitySummaryBucket(BaseModel):
    value: str
    permit_count: int
    active_parcel_count: int
    total_permit_amount: float | None = None


class DevelopmentActivitySummaryYearBucket(BaseModel):
    year: int
    permit_count: int
    active_parcel_count: int
    total_permit_amount: float | None = None


class DevelopmentActivitySummaryMonthBucket(BaseModel):
    year: int
    month: int
    permit_count: int
    active_parcel_count: int
    total_permit_amount: float | None = None


class DevelopmentActivitySummaryDateRange(BaseModel):
    activity_date_min: date | None = None
    activity_date_max: date | None = None


class DevelopmentActivityRecentSummary(BaseModel):
    recent_1yr_parcels: int
    recent_3yr_parcels: int


class DevelopmentActivitySummaryResponse(BaseModel):
    filters_applied: dict[str, int | str] = Field(default_factory=dict)
    total_permits: int
    active_parcel_count: int
    total_permit_amount: float | None = None
    avg_permit_amount: float | None = None
    date_range: DevelopmentActivitySummaryDateRange
    by_permit_type: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    by_work_type: list[DevelopmentActivitySummaryBucket] = Field(default_factory=list)
    by_status: list[DevelopmentActivitySummaryBucket] = Field(default_factory=list)
    by_activity_class: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    by_year: list[DevelopmentActivitySummaryYearBucket] = Field(default_factory=list)
    by_month: list[DevelopmentActivitySummaryMonthBucket] = Field(default_factory=list)
    by_zoning_jurisdiction: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    by_zoning_category: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    recent_activity: DevelopmentActivityRecentSummary


class NewConstructionBucket(BaseModel):
    value: str
    count: int


class NewConstructionDateRange(BaseModel):
    permit_date_min: date | None = None
    permit_date_max: date | None = None
    co_date_min: date | None = None
    co_date_max: date | None = None


class NewConstructionStatisticsResponse(BaseModel):
    total_permits: int
    matched_permit_count: int
    unmatched_permit_count: int
    ambiguous_permit_count: int
    invalid_placeholder_count: int
    unique_matched_parcel_count: int
    co_issued_count: int
    co_not_issued_count: int
    date_range: NewConstructionDateRange
    by_permit_type_class: list[NewConstructionBucket] = Field(default_factory=list)
    by_construction_status: list[NewConstructionBucket] = Field(default_factory=list)
    by_match_confidence: list[NewConstructionBucket] = Field(default_factory=list)
    prediction_model_active: bool = False
    prediction_probability_available: bool = False


class NewConstructionTrendPoint(BaseModel):
    year: int | None = None
    month: int | None = None
    permit_count: int
    residential_count: int
    commercial_count: int
    completed_count: int
    active_uncompleted_count: int


class NewConstructionTrendsResponse(BaseModel):
    annual_trends: list[NewConstructionTrendPoint] = Field(default_factory=list)
    monthly_trends: list[NewConstructionTrendPoint] = Field(default_factory=list)
    prediction_model_active: bool = False


class ParcelNewConstructionSummaryResponse(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    total_new_construction_permits: int = 0
    residential_new_construction_permits: int = 0
    commercial_new_construction_permits: int = 0
    first_new_construction_permit_date: date | None = None
    latest_new_construction_permit_date: date | None = None
    latest_co_date: date | None = None
    completed_new_construction_count: int = 0
    active_uncompleted_new_construction_count: int = 0
    average_days_to_co: float | None = None
    new_construction_years_active: int = 0
    recent_1yr_new_construction_count: int = 0
    recent_3yr_new_construction_count: int = 0
    recent_5yr_new_construction_count: int = 0
    development_stage: str = "no_matched_new_construction_activity"
    source: str = "staff_provided_new_construction_extract"
    prediction_model_active: bool = False
    prediction_probability_available: bool = False


class NewConstructionLabelPositiveRate(BaseModel):
    snapshot_year: int
    parcel_count: int
    positive_next_1yr_count: int
    positive_next_1yr_pct: float
    positive_next_3yr_count: int
    positive_next_3yr_pct: float


class NewConstructionLabelsSummaryResponse(BaseModel):
    label_table_row_count: int
    min_snapshot_year: int | None = None
    max_snapshot_year: int | None = None
    snapshot_year_count: int
    positive_rate_by_snapshot_year: list[NewConstructionLabelPositiveRate] = Field(
        default_factory=list,
    )
    label_source: str = "staff_provided_new_construction_extract"
    labels_are_targets_only: bool = True
    prediction_model_active: bool = False
    prediction_probability_available: bool = False


class DevelopmentPredictionFeatureMissingness(BaseModel):
    feature_name: str
    missing_count: int
    missing_pct: float


class DevelopmentPredictionFeatureLabelRate(BaseModel):
    label_name: str
    row_count: int
    positive_count: int
    positive_rate_pct: float


class DevelopmentPredictionFeaturesSummaryResponse(BaseModel):
    feature_matrix_available: bool
    feature_table: str = "public.parcel_development_prediction_features"
    row_count: int = 0
    unique_parcel_count: int = 0
    min_snapshot_year: int | None = None
    max_snapshot_year: int | None = None
    snapshot_year_count: int = 0
    feature_set_version: str | None = None
    feature_groups: list[str] = Field(default_factory=list)
    missingness_highlights: list[DevelopmentPredictionFeatureMissingness] = Field(
        default_factory=list,
    )
    label_positive_rates: list[DevelopmentPredictionFeatureLabelRate] = Field(
        default_factory=list,
    )
    leakage_caveats: list[str] = Field(default_factory=list)
    baseline_model_experiment_available: bool = False
    latest_experiment_id: str | None = None
    metrics_summary: dict[str, Any] = Field(default_factory=dict)
    zoning_enhanced_feature_matrix_available: bool = False
    zoning_enhanced_row_count: int = 0
    zoning_enhanced_model_experiment_available: bool = False
    latest_zoning_enhanced_experiment_id: str | None = None
    baseline_vs_zoning_metrics_summary: dict[str, Any] = Field(default_factory=dict)
    transportation_enhanced_feature_matrix_available: bool = False
    transportation_enhanced_row_count: int = 0
    transportation_enhanced_model_experiment_available: bool = False
    latest_transportation_experiment_id: str | None = None
    transportation_experiment_current_context_only: bool = True
    latest_model_qa_available: bool = False
    latest_model_qa_id: str | None = None
    standardized_metrics_available: bool = False
    calibration_review_available: bool = False
    production_ready: bool = False
    model_active: bool = False
    prediction_probability_available: bool = False


class DevelopmentPredictionRankingClassBucket(BaseModel):
    development_signal_class: str
    row_count: int
    pct_of_rows: float


class DevelopmentPredictionRankingSummaryResponse(BaseModel):
    ranking_available: bool
    experiment_id: str | None = None
    ranking_row_count: int = 0
    unique_parcel_count: int = 0
    class_distribution: list[DevelopmentPredictionRankingClassBucket] = Field(
        default_factory=list,
    )
    explanation_available: bool = False
    explanation_row_count: int = 0
    calibration_status: str | None = None
    production_ready: bool = False
    public_exposure_allowed: bool = False
    prediction_probability_available: bool = False
    exact_probabilities_exposed: bool = False
    caveat: str = "internal_ranking_research_not_for_public_decision"
    no_parcel_level_scores: bool = True


class TransportationAccessibilityMissingness(BaseModel):
    feature_name: str
    missing_count: int
    missing_pct: float


class TransportationAccessibilityDistanceSummary(BaseModel):
    metric_name: str
    non_null_count: int
    min_ft: float | None = None
    p25_ft: float | None = None
    median_ft: float | None = None
    p75_ft: float | None = None
    p90_ft: float | None = None
    max_ft: float | None = None
    avg_ft: float | None = None


class TransportationAccessibilityQualityBucket(BaseModel):
    transportation_accessibility_data_quality: str
    row_count: int


class DevelopmentPredictionTransportationAccessibilitySummaryResponse(BaseModel):
    feature_table_available: bool
    feature_table: str = "public.parcel_transportation_accessibility_features"
    row_count: int = 0
    unique_parcel_count: int = 0
    expected_parcel_count: int = 0
    row_count_matches_parcels: bool = False
    road_clean_rows: int = 0
    rail_clean_rows: int = 0
    rail_corridor_within_half_mile_count: int = 0
    missing_major_road_classification_count: int = 0
    distance_summary: list[TransportationAccessibilityDistanceSummary] = Field(
        default_factory=list,
    )
    missingness_summary: list[TransportationAccessibilityMissingness] = Field(
        default_factory=list,
    )
    data_quality_distribution: list[TransportationAccessibilityQualityBucket] = Field(
        default_factory=list,
    )
    current_context_only: bool = True
    model_active: bool = False
    prediction_probability_available: bool = False


class TransportationPlanTrafficDistributionMetric(BaseModel):
    metric_name: str
    metric_unit: str
    non_null_count: int
    min_value: float | None = None
    p25_value: float | None = None
    median_value: float | None = None
    p75_value: float | None = None
    p90_value: float | None = None
    max_value: float | None = None
    avg_value: float | None = None


class TransportationPlanTrafficQualityBucket(BaseModel):
    quality_type: str
    quality: str
    row_count: int


class DevelopmentPredictionTransportationPlanTrafficSummaryResponse(BaseModel):
    feature_table_available: bool
    feature_table: str = "public.parcel_transportation_plan_traffic_features"
    row_count: int = 0
    unique_parcel_count: int = 0
    expected_parcel_count: int = 0
    row_count_matches_parcels: bool = False
    stip_clean_rows: int = 0
    aadt_clean_rows: int = 0
    stip_project_within_half_mile_count: int = 0
    stip_project_within_1_mile_count: int = 0
    planned_transportation_investment_count: int = 0
    current_context_only_count: int = 0
    time_safe_for_training_count: int = 0
    distribution_summary: list[TransportationPlanTrafficDistributionMetric] = Field(
        default_factory=list,
    )
    missingness_summary: list[TransportationAccessibilityMissingness] = Field(
        default_factory=list,
    )
    quality_distribution: list[TransportationPlanTrafficQualityBucket] = Field(
        default_factory=list,
    )
    current_context_only: bool = True
    time_safe_for_training: bool = False
    model_active: bool = False
    prediction_probability_available: bool = False


class DevelopmentTemporalQueryResult(BaseModel):
    permit_id: str | None = None
    permit_number: str | None = None
    official_parcel_id: str | None = None
    pin14: str | None = None
    activity_date: date | None = None
    activity_year: int | None = None
    activity_month: int | None = None
    permit_type: str | None = None
    work_type: str | None = None
    permit_status: str | None = None
    permit_amount: float | None = None
    zoning_jurisdiction_name: str | None = None
    dominant_zoning_code_raw: str | None = None
    dominant_zoning_general_normalized: str | None = None
    development_activity_class: str | None = None
    relationship_confidence: str | None = None


class DevelopmentTemporalContext(BaseModel):
    mode: str
    year: int | None = None
    month: int | None = None
    date_start: date | None = None
    date_end: date | None = None
    rolling_window: int | None = None
    defaulted_to_recent_window: bool = False


class DevelopmentTemporalQuerySummary(BaseModel):
    total_permits: int
    active_parcel_count: int
    date_start: date | None = None
    date_end: date | None = None
    permit_type_breakdown: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    work_type_breakdown: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )
    zoning_jurisdiction_breakdown: list[DevelopmentActivitySummaryBucket] = Field(
        default_factory=list,
    )


class DevelopmentTemporalBBoxSupport(BaseModel):
    requested: bool
    active: bool
    note: str


class DevelopmentTemporalQueryResponse(BaseModel):
    filters_applied: dict[str, int | str | bool] = Field(default_factory=dict)
    temporal_context: DevelopmentTemporalContext
    limit: int
    offset: int
    total_count: int
    summary: DevelopmentTemporalQuerySummary
    results: list[DevelopmentTemporalQueryResult] = Field(default_factory=list)
    bbox_support: DevelopmentTemporalBBoxSupport


class DevelopmentParcelPermitEvent(BaseModel):
    permit_id: str | None = None
    permit_number: str | None = None
    activity_date: date | None = None
    activity_year: int | None = None
    permit_type: str | None = None
    work_type: str | None = None
    permit_status: str | None = None
    permit_amount: float | None = None
    permit_segment: str | None = None
    permit_growth_signal: str | None = None
    development_domain: str | None = None
    permit_status_stage: str | None = None
    permit_value_class: str | None = None
    permit_signal_score: float | None = None
    relationship_confidence: str | None = None


class DevelopmentParcelPermitEventsResponse(BaseModel):
    official_parcel_id: str
    total_count: int
    limit: int
    offset: int
    sort: str
    permits: list[DevelopmentParcelPermitEvent] = Field(default_factory=list)


class DevelopmentLookupItem(BaseModel):
    value: str
    label: str
    count: int


class DevelopmentLookupResponse(BaseModel):
    lookup_type: str
    total_options: int
    options: list[DevelopmentLookupItem] = Field(default_factory=list)


class PermitSegmentStatisticsResponse(BaseModel):
    total_permits: int
    by_permit_segment: list[DevelopmentStatisticsBucket] = Field(default_factory=list)
    by_permit_growth_signal: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )
    by_permit_status_stage: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )
    by_permit_value_class: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )
    by_development_domain: list[DevelopmentStatisticsBucket] = Field(
        default_factory=list,
    )


class ParcelPermitSegmentSummaryResponse(BaseModel):
    official_parcel_id: str
    pin14: str | None = None
    total_permits: int = 0
    residential_growth_permits: int = 0
    commercial_activity_permits: int = 0
    industrial_activity_permits: int = 0
    institutional_activity_permits: int = 0
    redevelopment_signal_permits: int = 0
    minor_maintenance_permits: int = 0
    demolition_permits: int = 0
    active_construction_permits: int = 0
    completed_permits: int = 0
    high_value_permits: int = 0
    major_value_permits: int = 0
    total_permit_amount: float | None = None
    latest_permit_date: date | None = None
    first_permit_date: date | None = None
    active_year_count: int = 0
    dominant_permit_segment: str | None = None
    dominant_growth_signal: str | None = None
    permit_signal_score_max: float | None = None
    permit_signal_score_avg: float | None = None
    current_activity_status: str | None = None


class PermitSegmentOptionsResponse(BaseModel):
    permit_segments: list[DevelopmentLookupItem] = Field(default_factory=list)
    growth_signals: list[DevelopmentLookupItem] = Field(default_factory=list)
    status_stages: list[DevelopmentLookupItem] = Field(default_factory=list)
    value_classes: list[DevelopmentLookupItem] = Field(default_factory=list)
    development_domains: list[DevelopmentLookupItem] = Field(default_factory=list)
