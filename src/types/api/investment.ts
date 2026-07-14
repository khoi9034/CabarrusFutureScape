export type InvestmentStrategyId =
  | "development_land"
  | "entitlement_repositioning"
  | "existing_use"
  | "land_banking";

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
