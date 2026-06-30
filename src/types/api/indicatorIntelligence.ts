export type IndicatorDomain =
  | "data_readiness"
  | "development_activity"
  | "floodplain_review"
  | "model_research"
  | "school_pressure"
  | "transportation_context"
  | "utility_readiness"
  | "zoning_land_use";

export type IndicatorStatusBand =
  | "data_needed"
  | "elevated_review"
  | "monitor"
  | "normal"
  | "review"
  | "unavailable";

export type IndicatorConfidence = "high" | "low" | "medium" | "unknown";

export interface IndicatorSignal {
  caveats: string[];
  confidence: IndicatorConfidence;
  data_freshness: string | null;
  domain: IndicatorDomain;
  evidence: string[];
  geography_label: string | null;
  id: string;
  recommended_followup: string;
  related_layers: string[];
  severity: number;
  source_mode: "demo" | "live";
  status_band: IndicatorStatusBand;
  title: string;
  trend_direction: "down" | "flat" | "not_available" | "up";
  trend_label: string | null;
  unit: string | null;
  value: number | string | null;
}

export interface IndicatorDomainReadiness {
  caveat: string;
  coverage: string;
  current_use: string;
  data_available: "no" | "partial" | "yes";
  demo_extract_status: string;
  domain: string;
  geometry_available: boolean;
  local_live_status: string;
  next_data_need: string;
  source_freshness: string | null;
  temporal_fields_available: boolean;
  update_cadence_known: boolean;
}

export interface IndicatorIntelligenceResponse {
  as_of: string | null;
  caveats: string[];
  data_readiness_detail?: Array<{
    available_fields: string[];
    current_use: string;
    domain: string;
    limitation: string;
    missing_fields: string[];
    next_data_need: string;
  }>;
  development_activity_detail?: {
    active_parcels: number;
    caveats: string[];
    delta: number | null;
    pct_change: number | null;
    previous_count: number;
    previous_window: number | null;
    recent_count: number;
    recent_window: number | null;
    strongest_year: { count?: number; year?: number };
    top_geographies: Array<{ count: number; label: string }>;
    top_geography_type: string;
    top_increasing_permit_types: Array<{ count: number; label: string }>;
    top_permit_types: Array<{ count: number; label: string }>;
    top_segments: Array<{ count: number; label: string }>;
    top_work_types: Array<{ count: number; label: string }>;
    total_records: number;
    weakest_year: { count?: number; year?: number };
    yearly_counts: Array<{ count: number; year: number }>;
    years_available: number[];
  };
  domain_readiness: IndicatorDomainReadiness[];
  floodplain_detail?: {
    caveats: string[];
    five_hundred_year_count: number | null;
    floodway_count: number;
    permit_overlap_count: number | null;
    review_required_count: number;
    special_flood_hazard_area_count: number;
  };
  kpis: IndicatorSignal[];
  mode: "demo" | "live";
  school_pressure_detail?: {
    areas_reviewed: number;
    data_needed_count?: number;
    elevated_review_count: number;
    permit_pressure_overlap: string;
    top_areas: Array<{
      recent_permits: number | null;
      school_level: string | null;
      school_name: string | null;
      top_reasons: string[];
      utilization_pct: number | null;
      watch_band: string | null;
    }>;
    utilization_data_coverage: string;
  };
  signals: IndicatorSignal[];
  summary: {
    data_needed_count: number;
    elevated_review_count: number;
    review_count: number;
    total_signals: number;
    unavailable_count: number;
  };
  watchlist: IndicatorSignal[];
}
