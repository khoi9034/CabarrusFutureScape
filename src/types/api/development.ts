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
  dominant_permit_type: string | null;
  dominant_work_type: string | null;
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  has_unmatched_or_ambiguous_permit_flag: boolean;
  latest_permit_date: string | null;
  latest_permit_status: string | null;
  neighborhood: string | null;
  official_parcel_id: string;
  parcel_quality_status: string | null;
  pin14: string | null;
  recent_permit_count_1yr: number;
  recent_permit_count_3yr: number;
  subdivision: string | null;
  total_permit_amount: number | null;
  total_permit_count: number;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
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

