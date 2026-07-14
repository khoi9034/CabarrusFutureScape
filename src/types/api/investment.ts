export type InvestmentStrategyId =
  | "development_land"
  | "entitlement_repositioning"
  | "existing_use"
  | "land_banking";

export type InvestmentUnderwritingScenarioType =
  | "development_land"
  | "entitlement_repositioning"
  | "existing_use_acquisition"
  | "land_banking";

export type InvestmentUnderwritingScenarioStatus =
  | "Archived"
  | "Draft"
  | "In Review"
  | "Needs Verification"
  | "Ready for Report";

export interface InvestmentScreenCandidate {
  basis_context_band?: string;
  basis_caution_reasons?: string[];
  basis_data_confidence?: string;
  basis_positive_reasons?: string[];
  basis_verification_required?: boolean;
  candidate_band: string;
  caution_reason_codes: string[];
  comparable_confidence_band?: string;
  comparable_context_summary?: string;
  comparable_count_band?: string;
  data_confidence_band: string;
  dimension_bands: {
    basis_context: string;
    constraint_burden: string;
    data_confidence: string;
    readiness_signal: string;
    strategy_fit: string;
  };
  factor_groups: Record<string, unknown>;
  freshness_context: string;
  parcel_id: string;
  positive_reason_codes: string[];
  safe_display_fields: Record<string, unknown>;
  sale_quality_band?: string;
  sale_recency_band?: string;
  sort_order: number;
  strategy: InvestmentStrategyId;
  strategy_label: string;
  verification_requirements: string[];
}

export interface InvestmentScreenResponse {
  as_of: string;
  candidate_count: number;
  candidates: InvestmentScreenCandidate[];
  caveats: string[];
  data_quality: Record<string, unknown>;
  strategy: InvestmentStrategyId;
  strategy_label: string;
}

export type InvestmentSourceType =
  | "Active Listing"
  | "Auction"
  | "Broker Lead"
  | "County Sale Record"
  | "Existing CFS Candidate"
  | "Manual Research"
  | "Off-Market Lead"
  | "Other";

export type InvestmentReviewStatus =
  | "Archived"
  | "Hold for Later"
  | "Needs Verification"
  | "New"
  | "Priority Review"
  | "Researching"
  | "Screening";

export interface InvestmentIntakeCandidate {
  acquisition_basis_band?: string;
  asking_price?: number | null;
  asking_price_date?: string | null;
  candidate_name: string;
  comparable_context?: string;
  constraint_burden?: string;
  data_confidence?: string;
  environmental_constraint_band?: string;
  environmental_data_confidence?: string;
  id: string;
  date_added?: string | null;
  last_verified?: string | null;
  listing_status?: string | null;
  mapped_wetland_context?: string;
  parcel_id?: string | null;
  parcel_match_status?: string;
  property_type?: string | null;
  readiness_signal?: string;
  review_status: InvestmentReviewStatus;
  source_name?: string | null;
  source_type: InvestmentSourceType;
  source_url?: string | null;
  strategy: InvestmentStrategyId;
  strategy_fit?: string;
  terrain_context?: string;
  user_notes?: string | null;
}

export interface InvestmentIntakeListResponse {
  candidates: InvestmentIntakeCandidate[];
  caveats: string[];
  count: number;
}

export interface InvestmentIntakePayload {
  asking_price?: number | null;
  asking_price_date?: string | null;
  candidate_name: string;
  parcel_id?: string | null;
  property_type?: string | null;
  review_status?: InvestmentReviewStatus;
  source_name?: string | null;
  source_type: InvestmentSourceType;
  source_url?: string | null;
  strategy?: InvestmentStrategyId;
  user_notes?: string | null;
}

export interface InvestmentIntakeAnalysisResponse {
  acquisition_basis: {
    asking_basis_band: string;
    asking_basis_summary: string;
    asking_price?: number | null;
    asking_price_date_age_days?: number | null;
    asking_price_per_acre?: number | null;
    basis_caution_reasons: string[];
    basis_positive_reasons: string[];
    evidence_type: string;
    parcel_acres?: number | null;
    usable_acreage_note: string;
  };
  candidate: InvestmentIntakeCandidate;
  caveats: string[];
  data_attribution: Record<string, string>;
  environmental_context?: InvestmentEnvironmentalContext;
  market_area_context?: InvestmentMarketContext;
  parcel_match_status: string;
  screening_context?: InvestmentScreenCandidate | null;
  source_note: string;
}

export interface InvestmentIntakeCompareResponse {
  caveats: string[];
  comparison_summary: string[];
  intake_candidates: InvestmentIntakeAnalysisResponse[];
  screening_comparison: unknown;
}

export interface InvestmentCsvImportResponse {
  created: InvestmentIntakeCandidate[];
  created_count?: number;
  duplicates: string[];
  errors: string[];
  unmatched_parcel_ids: string[];
}

export interface InvestmentMarketContextItem {
  band: string;
  summary: string;
}

export interface InvestmentMarketHousingContext {
  occupancy_band: string;
  tenure_band: string;
  housing_unit_context_band: string;
  summary: string;
}

export interface InvestmentMarketContext {
  acs_year?: number | null;
  data_confidence: string;
  geoid?: string | null;
  geography_type: string;
  growth_context: InvestmentMarketContextItem;
  household_context: InvestmentMarketContextItem;
  housing_context: InvestmentMarketHousingContext;
  income_context: InvestmentMarketContextItem;
  last_refreshed?: string | null;
  limitations: string[];
  population_context: InvestmentMarketContextItem;
  source: string;
  source_attribution: string;
  uncertainty_note?: string;
}

export interface InvestmentEnvironmentalContext {
  dominant_soil_group?: string | null;
  elevation_range?: number | null;
  environmental_data_confidence: string;
  environmental_facility_context: string;
  flood_context: string;
  last_refreshed?: string | null;
  limitations: string[];
  mapped_wetland_context: string;
  maximum_elevation?: number | null;
  mean_slope_percent?: number | null;
  mean_elevation?: number | null;
  maximum_slope_percent?: number | null;
  minimum_elevation?: number | null;
  nearest_regulated_facility_distance_miles?: number | null;
  overall_environmental_constraint_band: string;
  parcel_id?: string | null;
  poor_drainage_percent?: number | null;
  prime_farmland_percent?: number | null;
  regulated_facility_count_1mi?: number | null;
  soil_context: string;
  source_attribution: Record<string, string>;
  source_version?: string | null;
  steep_slope_percent?: number | null;
  terrain_context: string;
  terrain_source_date?: string | null;
  terrain_source_resolution?: string | null;
  usable_area_screening_proxy: string;
  verification_requirements: string[];
  wetland_percent_of_parcel?: number | null;
}

export interface InvestmentResearchContext {
  brand: "CFS Investment";
  acquisition_basis: Record<string, unknown>;
  comparable_context: Record<string, unknown>;
  development_readiness: Record<string, unknown>;
  economic_context: Record<string, unknown>;
  environmental_context: InvestmentEnvironmentalContext | Record<string, unknown>;
  evidence_quality: Record<string, unknown>;
  identity: {
    approximate_acreage?: number | null;
    geography_label?: string | null;
    intake_candidate_id?: string | null;
    parcel_id: string;
    private_candidate_label?: string | null;
  };
  limitations: string[];
  market_area_context: InvestmentMarketContext | Record<string, unknown>;
  missing_evidence: string[];
  parcel_fundamentals: Record<string, unknown>;
  planning_context: Record<string, unknown>;
  safe_summary: string;
  selected_strategy: InvestmentStrategyId;
  source_registry: Array<Record<string, string>>;
  utility_context: Record<string, unknown>;
  verification_requirements: string[];
}

export interface InvestmentReportSection {
  body: string;
  id: string;
  limitations: string[];
  sources: Array<Record<string, string>>;
  title: string;
}

export interface InvestmentReportResponse {
  as_of: string;
  brand: "CFS Investment";
  candidate_id?: string | null;
  limitations: string[];
  parcel_id?: string | null;
  purpose: string;
  report_bucket_item: {
    caveats: string[];
    content: string;
    summary: string;
    title: string;
    type: string;
  };
  report_title: string;
  report_type: string;
  sections: InvestmentReportSection[];
  strategy: InvestmentStrategyId;
}

export interface InvestmentUnderwritingCalculation {
  as_of: string;
  assumption_evidence: Record<string, string>;
  assumptions: Record<string, number>;
  brand: "CFS Investment";
  candidate_id?: string | null;
  limitations: string[];
  missing_inputs: string[];
  parcel_id?: string | null;
  research_context_summary: Record<string, unknown>;
  results: Record<string, unknown>;
  scenario_name: string;
  scenario_type: InvestmentUnderwritingScenarioType;
  scenario_type_label: string;
  sensitivity: {
    matrix: Array<{ outcomes: Array<string | number | null>; variable_value: number | null }>;
    status: string;
    variables: string[];
  };
  strategy: InvestmentStrategyId;
  warnings: string[];
}

export interface InvestmentUnderwritingScenario {
  assumptions: Record<string, number>;
  calculation: InvestmentUnderwritingCalculation;
  candidate_id?: string | null;
  created_at: string;
  id: string;
  last_calculated_at?: string | null;
  limitations: string[];
  parcel_id?: string | null;
  private_notes?: string | null;
  results: Record<string, unknown>;
  scenario_name: string;
  scenario_status: InvestmentUnderwritingScenarioStatus;
  scenario_type: InvestmentUnderwritingScenarioType;
  scenario_type_label: string;
  strategy: InvestmentStrategyId;
  updated_at: string;
}

export interface InvestmentUnderwritingListResponse {
  caveats: string[];
  count: number;
  scenarios: InvestmentUnderwritingScenario[];
}

export interface InvestmentUnderwritingCompareResponse {
  caveats: string[];
  count: number;
  scenarios: InvestmentUnderwritingScenario[];
  summary: string[];
}

export interface InvestmentOpportunitySource {
  access_mode: string;
  attribution_required: string;
  coverage: string;
  data_confidence: string;
  enabled: boolean;
  last_checked?: string | null;
  last_refreshed?: string | null;
  license_status: string;
  source_id: string;
  source_name: string;
  source_type: string;
  source_url?: string | null;
  storage_allowed: string;
}

export interface InvestmentOpportunityReference {
  acreage?: number | null;
  asking_price?: number | null;
  attribution?: string | null;
  building_area?: number | null;
  cfs_review_signal?: string | null;
  data_freshness_band: string;
  external_opportunity_id: string;
  external_search_links?: Array<{ source_name: string; url: string }>;
  general_location?: string | null;
  listing_status: string;
  parcel_id?: string | null;
  parcel_match_status: string;
  price_per_acre?: number | null;
  property_type: string;
  source_caveat?: string;
  source_id: string;
  source_name: string;
  source_type: string;
  source_url?: string | null;
  storage_policy: string;
  title: string;
}

export interface InvestmentOpportunityListResponse {
  as_of: string;
  caveats: string[];
  count: number;
  opportunities: InvestmentOpportunityReference[];
  source_modes: string[];
}

export interface InvestmentAreaRadarArea {
  area_classification: string;
  area_id: string;
  area_name: string;
  candidate_count: number;
  data_confidence: string;
  external_search_links: Array<{ source_name: string; url: string }>;
  major_cautions: string[];
  missing_evidence: string[];
  recommended_next_search_action: string;
  strategy_label: string;
  why_it_surfaced: string[];
}

export interface InvestmentAreaRadarResponse {
  areas: InvestmentAreaRadarArea[];
  caveats: string[];
  count: number;
  strategy: string;
  strategy_label: string;
}

export interface InvestmentEngagement {
  brief: Record<string, unknown>;
  criteria: Array<Record<string, unknown>>;
  engagement_name: string;
  engagement_status: string;
  id: string;
  portfolio_summary: Record<string, unknown>;
  selected_strategy: InvestmentStrategyId;
  shortlist: Array<Record<string, unknown>>;
}

export interface InvestmentEngagementListResponse {
  caveats: string[];
  count: number;
  engagements: InvestmentEngagement[];
}

export interface InvestmentUnderwritingTemplate {
  assumptions: Record<string, number | string | null>;
  default_source: string;
  id: string;
  scenario_type: InvestmentUnderwritingScenarioType;
  template_name: string;
  values_requiring_confirmation: string[];
}

export interface InvestmentUnderwritingPrefillResponse {
  assumptions: Record<string, number | string | null>;
  caveats: string[];
  field_sources: Record<string, string>;
  prefill_summary: Record<string, string[]>;
  scenario_type: InvestmentUnderwritingScenarioType;
  template: InvestmentUnderwritingTemplate;
}
