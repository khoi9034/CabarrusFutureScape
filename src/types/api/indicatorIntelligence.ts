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
  domain_readiness: IndicatorDomainReadiness[];
  kpis: IndicatorSignal[];
  mode: "demo" | "live";
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
