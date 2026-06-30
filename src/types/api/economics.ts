export type EconomicsStatusBand =
  | "data_needed"
  | "infrastructure_constrained"
  | "redevelopment_opportunity"
  | "stable_high_value"
  | "tax_base_opportunity"
  | "underbuilt_watch"
  | "unavailable";

export interface EconomicsSummary {
  as_of: string | null;
  data_needed_count: number;
  high_opportunity_count: number;
  median_value_per_acre: number | null;
  source_mode: "demo" | "live";
  total_assessed_value: number | null;
  total_improvement_value: number | null;
  total_land_value: number | null;
  total_parcels_analyzed: number;
  underbuilt_candidate_count: number;
}

export interface EconomicsParcelSignal {
  acreage: number | null;
  assessed_value: number | null;
  caveats: string[];
  economic_status_band: EconomicsStatusBand;
  estimated_county_tax: number | null;
  evidence: string[];
  floodplain_context: string | null;
  geography_label: string | null;
  improvement_to_land_ratio: number | null;
  improvement_value: number | null;
  improvement_value_per_acre: number | null;
  land_value: number | null;
  land_value_per_acre: number | null;
  opportunity_class: string;
  parcel_id: string;
  permit_activity_context: string | null;
  recommended_followup: string;
  related_layers: string[];
  school_pressure_context: string | null;
  transportation_context: string | null;
  utility_readiness_context: string | null;
  value_per_acre: number | null;
}

export interface EconomicsKpi {
  caveat: string;
  id: string;
  label: string;
  status_band: EconomicsStatusBand;
  unit: string | null;
  value: number | string | null;
}

export interface EconomicsReadinessRow {
  caveat: string;
  current_use: string;
  data_status: "available" | "data_needed" | "partial" | "unavailable";
  domain: string;
  gap_or_next_need: string;
}

export interface EconomicsScenarioTemplate {
  caveats: string[];
  data_confidence: string;
  id: string;
  required_assumptions: string[];
  title: string;
  what_it_tests: string;
}

export interface EconomicsIntelligenceResponse {
  as_of: string | null;
  caveats: string[];
  data_readiness: EconomicsReadinessRow[];
  kpis: EconomicsKpi[];
  mode: "demo" | "live";
  scenario_templates: EconomicsScenarioTemplate[];
  signals: EconomicsParcelSignal[];
  summary: EconomicsSummary;
  watchlist: EconomicsParcelSignal[];
}
