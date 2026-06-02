export type ApiFilterValue = boolean | number | string;

export type ApiFilters = Record<string, ApiFilterValue>;

export interface ParcelStatisticsBucket {
  count: number;
  value: string;
}

export interface ParcelLocation {
  neighborhood: string | null;
  subdivision: string | null;
}

export interface ParcelValuation {
  assessedvalue_numeric: number | null;
  marketvalue_numeric: number | null;
  valuation_band: string | null;
}

export interface ParcelContext {
  parcel_quality_status: string | null;
  parcel_size_category: string | null;
}

export interface ParcelZoning {
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface ParcelGovernance {
  governance_warning_categories: string[];
  safe_for_dashboard: boolean | null;
}

export interface ParcelPlanning {
  planning_jurisdiction: string | null;
}

export interface ParcelMetadata {
  transformed_at: string | null;
}

export interface ParcelDetailResponse {
  governance: ParcelGovernance;
  location: ParcelLocation;
  metadata: ParcelMetadata;
  objectid_1: number | null;
  official_parcel_id: string;
  parcel_context: ParcelContext;
  pin14: string | null;
  planning: ParcelPlanning;
  valuation: ParcelValuation;
  zoning: ParcelZoning;
}

export interface ParcelSearchResult {
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  governance_warning_categories: string[];
  mailing_city: string | null;
  mailing_state: string | null;
  neighborhood: string | null;
  official_parcel_id: string;
  owner_display: string | null;
  parcel_quality_status: string | null;
  pin14: string | null;
  safe_for_dashboard: boolean | null;
  subdivision: string | null;
  valuation_band: string | null;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface ParcelSearchResponse {
  limit: number;
  offset: number;
  query: string;
  results: ParcelSearchResult[];
  total_count: number;
}

export interface ParcelFilterResult {
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  governance_warning_categories: string[];
  neighborhood: string | null;
  official_parcel_id: string;
  parcel_quality_status: string | null;
  parcel_size_category: string | null;
  pin14: string | null;
  safe_for_dashboard: boolean | null;
  subdivision: string | null;
  valuation_band: string | null;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface ParcelFilterResponse {
  filters_applied: ApiFilters;
  limit: number;
  offset: number;
  results: ParcelFilterResult[];
  total_count: number;
}

export interface ParcelStatisticsResponse {
  by_governance_warning: ParcelStatisticsBucket[];
  by_parcel_quality_status: ParcelStatisticsBucket[];
  by_valuation_band: ParcelStatisticsBucket[];
  by_zoning_category: ParcelStatisticsBucket[];
  by_zoning_jurisdiction: ParcelStatisticsBucket[];
  filters_applied: ApiFilters;
  high_confidence_parcels: number;
  low_confidence_parcels: number;
  multi_jurisdiction_parcels: number;
  no_match_parcels: number;
  review_parcels: number;
  safe_for_dashboard_parcels: number;
  total_parcels: number;
  zoned_parcels: number;
}

export interface ParcelZoningJurisdictionSummary {
  high_confidence_count: number;
  parcel_count: number;
  percentage: number;
  review_count: number;
  safe_for_dashboard_count: number;
  zoning_jurisdiction_name: string;
}

export interface ParcelZoningCodeSummary {
  parcel_count: number;
  percentage: number;
  review_count: number;
  zoning_category: string;
  zoning_code: string;
  zoning_jurisdiction_name: string;
}

export interface ParcelZoningCategorySummary {
  parcel_count: number;
  percentage: number;
  zoning_category: string;
}

export interface ParcelZoningConfidenceSummary {
  confidence: string;
  parcel_count: number;
  percentage: number;
}

export interface ParcelZoningGovernanceWarningSummary {
  governance_warning: string;
  parcel_count: number;
  percentage: number;
}

export interface ParcelZoningSummaryResponse {
  confidence_summary: ParcelZoningConfidenceSummary[];
  filters_applied: ApiFilters;
  governance_warning_summary: ParcelZoningGovernanceWarningSummary[];
  jurisdiction_summary: ParcelZoningJurisdictionSummary[];
  multi_jurisdiction_count: number;
  no_match_parcels: number;
  total_parcels: number;
  zoned_parcels: number;
  zoning_category_summary: ParcelZoningCategorySummary[];
  zoning_code_summary: ParcelZoningCodeSummary[];
}

export interface ParcelGovernanceWarningResult {
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  governance_warning_categories: string[];
  neighborhood: string | null;
  official_parcel_id: string;
  parcel_quality_status: string | null;
  pin14: string | null;
  safe_for_dashboard: boolean | null;
  subdivision: string | null;
  valuation_band: string | null;
  zoning_assignment_confidence: string | null;
  zoning_jurisdiction_name: string | null;
}

export interface ParcelGovernanceWarningSummary {
  parcel_count: number;
  percentage: number;
  warning_category: string;
}

export interface ParcelGovernanceWarningResponse {
  filters_applied: ApiFilters;
  limit: number;
  offset: number;
  results: ParcelGovernanceWarningResult[];
  total_count: number;
  warning_summary: ParcelGovernanceWarningSummary[];
}

