export type DevelopmentFilterValue = boolean | number | string;

export type DevelopmentFilters = Record<string, DevelopmentFilterValue>;

export interface DevelopmentStatisticsBucket {
  count: number;
  value: string;
}

export interface DevelopmentActivityClassSummary {
  high_activity: number;
  low_activity: number;
  moderate_activity: number;
  no_activity: number;
  very_high_activity: number;
}

export interface DevelopmentStatisticsResponse {
  activity_classes: DevelopmentActivityClassSummary;
  activity_date_max: string | null;
  activity_date_min: string | null;
  by_permit_type: DevelopmentStatisticsBucket[];
  by_status: DevelopmentStatisticsBucket[];
  by_work_type: DevelopmentStatisticsBucket[];
  by_zoning_category: DevelopmentStatisticsBucket[];
  by_zoning_jurisdiction: DevelopmentStatisticsBucket[];
  filters_applied: DevelopmentFilters;
  parcels_with_activity: number;
  parcels_without_activity: number;
  recent_activity_parcels_1yr: number;
  recent_activity_parcels_3yr: number;
  total_permits: number;
}

export interface DevelopmentTrendPoint {
  month: number | null;
  parcel_count: number | null;
  permit_count: number;
  permit_type: string | null;
  total_permit_amount: number | null;
  work_type: string | null;
  year: number | null;
  zoning_category: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface DevelopmentRollingSummary {
  end_date: string;
  parcel_count: number;
  permit_count: number;
  start_date: string;
  total_permit_amount: number | null;
  window_months: number;
}

export interface DevelopmentTrendDateRange {
  activity_date_max: string | null;
  activity_date_min: string | null;
  end_year: number | null;
  start_year: number | null;
}

export interface DevelopmentTrendsResponse {
  annual_trends: DevelopmentTrendPoint[];
  date_range: DevelopmentTrendDateRange;
  filters_applied: DevelopmentFilters;
  group_by: string | null;
  grouped_trends: DevelopmentTrendPoint[];
  monthly_trends: DevelopmentTrendPoint[];
  peak_month: string | null;
  peak_year: number | null;
  rolling_summary: DevelopmentRollingSummary | null;
  rolling_window: number | null;
  total_permits: number;
  trend_direction: string;
}

export interface DevelopmentHotspotResult {
  avg_permit_amount: number | null;
  development_activity_class: string | null;
  development_activity_score: number | null;
  active_construction_permits?: number;
  commercial_activity_permits?: number;
  completed_permits?: number;
  current_activity_status?: string | null;
  demolition_permits?: number;
  dominant_growth_signal?: string | null;
  dominant_permit_segment?: string | null;
  dominant_permit_type: string | null;
  dominant_work_type: string | null;
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  high_value_permits?: number;
  industrial_activity_permits?: number;
  institutional_activity_permits?: number;
  major_value_permits?: number;
  minor_maintenance_permits?: number;
  permit_signal_score_avg?: number | null;
  permit_signal_score_max?: number | null;
  has_unmatched_or_ambiguous_permit_flag: boolean;
  latest_permit_date: string | null;
  latest_permit_status: string | null;
  map_focus?: {
    centroid: {
      latitude: number;
      longitude: number;
    } | null;
    full_geometry_returned: boolean;
    geometry_available: boolean;
    spatial_reference: {
      wkid: number;
    };
  } | null;
  neighborhood: string | null;
  official_parcel_id: string;
  parcel_quality_status: string | null;
  pin14: string | null;
  first_permit_date?: string | null;
  recent_permit_count_1yr: number;
  recent_permit_count_3yr: number;
  redevelopment_signal_permits?: number;
  residential_growth_permits?: number;
  subdivision: string | null;
  total_permit_amount: number | null;
  total_permit_count: number;
  active_year_count?: number;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
  ambiguous_permit_count?: number;
  co_date_future_outlier_count?: number;
}

export interface DevelopmentHotspotsResponse {
  filters_applied: DevelopmentFilters;
  limit: number;
  offset: number;
  results: DevelopmentHotspotResult[];
  sort_by: string;
  total_count: number;
}

export interface DevelopmentZoningSummaryRow {
  active_parcel_count: number;
  activity_month: number | null;
  activity_year: number | null;
  avg_permit_amount: number | null;
  dominant_zoning_code_raw: string;
  dominant_zoning_general_normalized: string;
  high_activity_parcel_count: number;
  low_activity_parcel_count: number;
  moderate_activity_parcel_count: number;
  permit_count: number;
  permit_status: string;
  permit_type: string;
  total_permit_amount: number | null;
  very_high_activity_parcel_count: number;
  work_type: string;
  zoning_jurisdiction_name: string;
}

export interface DevelopmentZoningSummaryResponse {
  filters_applied: DevelopmentFilters;
  limit: number;
  offset: number;
  summary: DevelopmentZoningSummaryRow[];
  total_count: number;
}

export interface DevelopmentActivitySummaryBucket {
  active_parcel_count: number;
  permit_count: number;
  total_permit_amount: number | null;
  value: string;
}

export interface DevelopmentActivitySummaryYearBucket {
  active_parcel_count: number;
  permit_count: number;
  total_permit_amount: number | null;
  year: number;
}

export interface DevelopmentActivitySummaryMonthBucket {
  active_parcel_count: number;
  month: number;
  permit_count: number;
  total_permit_amount: number | null;
  year: number;
}

export interface DevelopmentActivitySummaryResponse {
  active_parcel_count: number;
  avg_permit_amount: number | null;
  by_activity_class: DevelopmentActivitySummaryBucket[];
  by_month: DevelopmentActivitySummaryMonthBucket[];
  by_permit_type: DevelopmentActivitySummaryBucket[];
  by_status: DevelopmentActivitySummaryBucket[];
  by_work_type: DevelopmentActivitySummaryBucket[];
  by_year: DevelopmentActivitySummaryYearBucket[];
  by_zoning_category: DevelopmentActivitySummaryBucket[];
  by_zoning_jurisdiction: DevelopmentActivitySummaryBucket[];
  date_range: {
    activity_date_max: string | null;
    activity_date_min: string | null;
  };
  filters_applied: DevelopmentFilters;
  recent_activity: {
    recent_1yr_parcels: number;
    recent_3yr_parcels: number;
  };
  total_permit_amount: number | null;
  total_permits: number;
}

export interface DevelopmentTemporalQueryResult {
  activity_date: string | null;
  activity_month: number | null;
  activity_year: number | null;
  development_activity_class: string | null;
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  official_parcel_id: string | null;
  permit_amount: number | null;
  permit_id: string | null;
  permit_number: string | null;
  permit_status: string | null;
  permit_type: string | null;
  pin14: string | null;
  relationship_confidence: string | null;
  work_type: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface DevelopmentTemporalQueryResponse {
  bbox_support: {
    active: boolean;
    note: string;
    requested: boolean;
  };
  filters_applied: DevelopmentFilters;
  limit: number;
  offset: number;
  results: DevelopmentTemporalQueryResult[];
  summary: {
    active_parcel_count: number;
    date_end: string | null;
    date_start: string | null;
    permit_type_breakdown: DevelopmentActivitySummaryBucket[];
    total_permits: number;
    work_type_breakdown: DevelopmentActivitySummaryBucket[];
    zoning_jurisdiction_breakdown: DevelopmentActivitySummaryBucket[];
  };
  temporal_context: {
    date_end: string | null;
    date_start: string | null;
    defaulted_to_recent_window: boolean;
    mode: string;
    month: number | null;
    rolling_window: number | null;
    year: number | null;
  };
  total_count: number;
}

export interface DevelopmentParcelPermitEvent {
  activity_date: string | null;
  activity_year: number | null;
  permit_amount: number | null;
  permit_id: string | null;
  permit_number: string | null;
  permit_status: string | null;
  permit_type: string | null;
  permit_segment: string | null;
  permit_growth_signal: string | null;
  development_domain: string | null;
  permit_status_stage: string | null;
  permit_value_class: string | null;
  permit_signal_score: number | null;
  relationship_confidence: string | null;
  work_type: string | null;
}

export interface DevelopmentParcelPermitEventsResponse {
  official_parcel_id: string;
  limit: number;
  offset: number;
  permits: DevelopmentParcelPermitEvent[];
  sort: string;
  total_count: number;
}

export interface NewConstructionDateRange {
  co_date_max: string | null;
  co_date_min: string | null;
  permit_date_max: string | null;
  permit_date_min: string | null;
}

export interface NewConstructionBucket {
  count: number;
  value: string;
}

export interface NewConstructionStatisticsResponse {
  ambiguous_permit_count: number;
  by_construction_status: NewConstructionBucket[];
  by_match_confidence: NewConstructionBucket[];
  by_permit_type_class: NewConstructionBucket[];
  co_issued_count: number;
  co_not_issued_count: number;
  date_range: NewConstructionDateRange;
  invalid_placeholder_count: number;
  matched_permit_count: number;
  prediction_model_active: boolean;
  prediction_probability_available: boolean;
  total_permits: number;
  unique_matched_parcel_count: number;
  unmatched_permit_count: number;
}

export interface ParcelNewConstructionSummaryResponse {
  active_uncompleted_new_construction_count: number;
  average_days_to_co: number | null;
  commercial_new_construction_permits: number;
  completed_new_construction_count: number;
  development_stage: string;
  first_new_construction_permit_date: string | null;
  latest_co_date: string | null;
  latest_new_construction_permit_date: string | null;
  new_construction_years_active: number;
  official_parcel_id: string;
  pin14: string | null;
  prediction_model_active: boolean;
  prediction_probability_available: boolean;
  recent_1yr_new_construction_count: number;
  recent_3yr_new_construction_count: number;
  recent_5yr_new_construction_count: number;
  residential_new_construction_permits: number;
  source: string;
  total_new_construction_permits: number;
}

export interface TransportationAccessibilityMissingness {
  feature_name: string;
  missing_count: number;
  missing_pct: number;
}

export interface TransportationAccessibilityDistanceSummary {
  avg_ft: number | null;
  max_ft: number | null;
  median_ft: number | null;
  metric_name: string;
  min_ft: number | null;
  non_null_count: number;
  p25_ft: number | null;
  p75_ft: number | null;
  p90_ft: number | null;
}

export interface TransportationAccessibilityQualityBucket {
  row_count: number;
  transportation_accessibility_data_quality: string;
}

export interface DevelopmentPredictionTransportationAccessibilitySummaryResponse {
  current_context_only: boolean;
  data_quality_distribution: TransportationAccessibilityQualityBucket[];
  distance_summary: TransportationAccessibilityDistanceSummary[];
  expected_parcel_count: number;
  feature_table: string;
  feature_table_available: boolean;
  missing_major_road_classification_count: number;
  missingness_summary: TransportationAccessibilityMissingness[];
  model_active: boolean;
  prediction_probability_available: boolean;
  rail_clean_rows: number;
  rail_corridor_within_half_mile_count: number;
  road_clean_rows: number;
  row_count: number;
  row_count_matches_parcels: boolean;
  unique_parcel_count: number;
}

export interface TransportationPlanTrafficDistributionMetric {
  avg_value: number | null;
  max_value: number | null;
  median_value: number | null;
  metric_name: string;
  metric_unit: string;
  min_value: number | null;
  non_null_count: number;
  p25_value: number | null;
  p75_value: number | null;
  p90_value: number | null;
}

export interface TransportationPlanTrafficQualityBucket {
  quality: string;
  quality_type: string;
  row_count: number;
}

export interface DevelopmentPredictionTransportationPlanTrafficSummaryResponse {
  aadt_clean_rows: number;
  current_context_only: boolean;
  current_context_only_count: number;
  distribution_summary: TransportationPlanTrafficDistributionMetric[];
  expected_parcel_count: number;
  feature_table: string;
  feature_table_available: boolean;
  missingness_summary: TransportationAccessibilityMissingness[];
  model_active: boolean;
  planned_transportation_investment_count: number;
  prediction_probability_available: boolean;
  quality_distribution: TransportationPlanTrafficQualityBucket[];
  row_count: number;
  row_count_matches_parcels: boolean;
  stip_clean_rows: number;
  stip_project_within_1_mile_count: number;
  stip_project_within_half_mile_count: number;
  time_safe_for_training: boolean;
  time_safe_for_training_count: number;
  unique_parcel_count: number;
}

export interface DevelopmentLookupItem {
  count: number;
  label: string;
  value: string;
}

export interface DevelopmentLookupResponse {
  lookup_type: string;
  options: DevelopmentLookupItem[];
  total_options: number;
}

export interface PermitSegmentStatisticsResponse {
  total_permits: number;
  by_permit_segment: DevelopmentStatisticsBucket[];
  by_permit_growth_signal: DevelopmentStatisticsBucket[];
  by_permit_status_stage: DevelopmentStatisticsBucket[];
  by_permit_value_class: DevelopmentStatisticsBucket[];
  by_development_domain: DevelopmentStatisticsBucket[];
}

export interface ParcelPermitSegmentSummaryResponse {
  official_parcel_id: string;
  pin14: string | null;
  total_permits: number;
  residential_growth_permits: number;
  commercial_activity_permits: number;
  industrial_activity_permits: number;
  institutional_activity_permits: number;
  redevelopment_signal_permits: number;
  minor_maintenance_permits: number;
  demolition_permits: number;
  active_construction_permits: number;
  completed_permits: number;
  high_value_permits: number;
  major_value_permits: number;
  total_permit_amount: number | null;
  latest_permit_date: string | null;
  first_permit_date: string | null;
  active_year_count: number;
  dominant_permit_segment: string | null;
  dominant_growth_signal: string | null;
  permit_signal_score_max: number | null;
  permit_signal_score_avg: number | null;
  current_activity_status: string | null;
}

export interface PermitSegmentOptionsResponse {
  permit_segments: DevelopmentLookupItem[];
  growth_signals: DevelopmentLookupItem[];
  status_stages: DevelopmentLookupItem[];
  value_classes: DevelopmentLookupItem[];
  development_domains: DevelopmentLookupItem[];
}

export interface DevelopmentPredictionFeatureMissingness {
  feature_name: string;
  missing_count: number;
  missing_pct: number;
}

export interface DevelopmentPredictionFeatureLabelRate {
  label_name: string;
  positive_count: number;
  positive_rate_pct: number;
  row_count: number;
}

export interface DevelopmentPredictionMetricComparison {
  absolute_improvement: number;
  baseline: number;
  percent_improvement: number;
  zoning_enhanced: number;
}

export interface DevelopmentPredictionFeaturesSummaryResponse {
  baseline_model_experiment_available: boolean;
  baseline_vs_zoning_metrics_summary?: {
    comparison_on_selected_best_models?: Record<
      string,
      DevelopmentPredictionMetricComparison
    >;
    experiment_id?: string;
    internal_only?: boolean;
    model_active?: boolean;
    prediction_probability_available?: boolean;
    production_ready?: boolean;
    target?: string;
    zoning_features_appear_important?: boolean;
  };
  calibration_review_available: boolean;
  current_best_internal_model_available?: boolean;
  current_best_internal_model_production_ready?: boolean;
  current_best_internal_model_public_exposure_allowed?: boolean;
  current_best_internal_model_variant?: string | null;
  excluded_feature_groups_current_best?: string[];
  feature_groups: string[];
  feature_matrix_available: boolean;
  feature_set_version: string | null;
  feature_table: string;
  label_positive_rates: DevelopmentPredictionFeatureLabelRate[];
  latest_experiment_id: string | null;
  latest_model_qa_available: boolean;
  latest_model_qa_id: string | null;
  latest_zoning_enhanced_experiment_id: string | null;
  leakage_caveats: string[];
  max_snapshot_year: number | null;
  metrics_summary: Record<string, unknown>;
  min_snapshot_year: number | null;
  missingness_highlights: DevelopmentPredictionFeatureMissingness[];
  model_active: boolean;
  prediction_probability_available: boolean;
  production_ready: boolean;
  recommended_internal_model_experiment_id?: string | null;
  recommended_internal_model_variant?: string | null;
  row_count: number;
  snapshot_year_count: number;
  standardized_metrics_available: boolean;
  unique_parcel_count: number;
  zoning_enhanced_feature_matrix_available: boolean;
  zoning_enhanced_model_experiment_available: boolean;
  zoning_enhanced_row_count: number;
}

export interface DevelopmentPredictionRankingClassBucket {
  development_signal_class: string;
  pct_of_rows: number;
  row_count: number;
}

export interface DevelopmentPredictionRankingSummaryResponse {
  calibration_status: string | null;
  caveat: string;
  class_distribution: DevelopmentPredictionRankingClassBucket[];
  exact_probabilities_exposed: boolean;
  experiment_id: string | null;
  explanation_available: boolean;
  explanation_row_count: number;
  no_parcel_level_scores: boolean;
  prediction_probability_available: boolean;
  production_ready: boolean;
  public_exposure_allowed: boolean;
  ranking_available: boolean;
  ranking_row_count: number;
  unique_parcel_count: number;
}
