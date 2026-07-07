export type EconomicsStatusBand =
  | "data_needed"
  | "industrial_employment_candidate"
  | "infrastructure_constrained"
  | "low_fiscal_high_burden"
  | "mixed_use_corridor_candidate"
  | "redevelopment_opportunity"
  | "residential_growth_pressure"
  | "special_asset"
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
  comparable_asset_flag?: boolean;
  comparison_group?: string | null;
  constraint_burden_band?: string | null;
  data_confidence?: string;
  display_label?: string | null;
  economic_data_confidence: "strong" | "medium" | "proxy" | "data_needed" | string;
  economic_segment?: string;
  economic_segment_order?: number | null;
  economic_status_band: EconomicsStatusBand;
  estimated_county_tax: number | null;
  estimated_county_tax_screening: number | null;
  evidence: string[];
  fiscal_attractiveness_band?: string | null;
  floodplain_context: string | null;
  geography_label: string | null;
  improvement_to_land_ratio: number | null;
  improvement_intensity_band?: string | null;
  improvement_value: number | null;
  improvement_value_per_acre: number | null;
  jurisdiction?: string | null;
  land_efficiency_band?: string | null;
  land_value: number | null;
  land_value_per_acre: number | null;
  opportunity_class: string;
  parcel_id: string;
  permit_activity_context: string | null;
  profile_id?: string;
  public_cost_risk_band?: string | null;
  recommended_followup: string;
  related_layers: string[];
  school_pressure_context: string | null;
  segment_caveat?: string | null;
  special_asset_flag?: boolean;
  tax_base_opportunity_band?: string | null;
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

export interface EconomicsScenarioInput {
  assumption: string;
  current_value: string;
  data_confidence: string;
  use: string;
}

export interface EconomicsScenarioOutput {
  constraint_adjusted_opportunity_band: string;
  data_confidence: string;
  estimated_tax_base_lift_band: string;
  infrastructure_burden_band: string;
  recommended_next_diligence: string;
  revenue_per_acre_band: string;
  scenario_id: string;
  service_burden_band: string;
  title: string;
}

export interface EconomicsOpportunityClassBreakdown {
  count: number;
  opportunity_class: string;
}

export interface EconomicsJurisdictionValueSummary {
  geography_label: string | null;
  median_value_per_acre: number | null;
  parcel_count: number;
  total_assessed_value: number | null;
  underbuilt_candidate_count: number;
}

export interface EconomicsSegmentSummary {
  caveat?: string;
  count: number;
  data_needed_count: number;
  dominant_opportunity_class?: string;
  median_improvement_to_land_ratio: number | null;
  median_value_per_acre: number | null;
  parcel_count?: number;
  segment: string;
  segment_caveat: string;
  special_asset_count: number;
  tax_base_opportunity_count: number;
  top_geographies: string[];
  underbuilt_candidate_count: number;
}

export interface EconomicsIntelligenceResponse {
  as_of: string | null;
  caveats: string[];
  context_freshness?: "cached_demo_extract" | "current_session" | "fallback_partial" | string | null;
  data_readiness: EconomicsReadinessRow[];
  enterprise_exports?: {
    csv_manifest: string;
    csv_tables: string;
    enterprise_export: string;
    power_bi_export: string;
  };
  jurisdiction_value_summary: EconomicsJurisdictionValueSummary[];
  kpis: EconomicsKpi[];
  mode: "demo" | "live";
  opportunity_class_breakdown: EconomicsOpportunityClassBreakdown[];
  parcel_economic_signals: EconomicsParcelSignal[];
  parcel_economic_profiles?: EconomicsParcelSignal[];
  fallback_reason?: string | null;
  record_counts?: {
    data_readiness?: number;
    parcel_economic_signals?: number;
    scenario_outputs?: number;
    total_parcels_analyzed?: number;
    underbuilt_watchlist?: number;
  };
  segment_data_confidence?: Array<Record<string, unknown>>;
  segment_improvement_ratio?: Array<Record<string, unknown>>;
  segment_opportunity_breakdown?: Array<Record<string, unknown>>;
  segment_summary?: EconomicsSegmentSummary[];
  segment_value_per_acre?: Array<Record<string, unknown>>;
  special_assets_watchlist?: EconomicsParcelSignal[];
  tax_base_opportunity_watchlist?: EconomicsParcelSignal[];
  top_rows_by_segment?: Array<Record<string, unknown>>;
  scenario_model?: {
    inputs: EconomicsScenarioInput[];
    outputs: EconomicsScenarioOutput[];
    templates: EconomicsScenarioTemplate[];
  };
  scenario_inputs: EconomicsScenarioInput[];
  scenario_outputs: EconomicsScenarioOutput[];
  scenario_templates: EconomicsScenarioTemplate[];
  signals: EconomicsParcelSignal[];
  source_mode?: "local_live_backend" | "portfolio_demo_extract" | string | null;
  summary: EconomicsSummary;
  tables?: {
    data_readiness: EconomicsReadinessRow[];
    parcel_economic_baseline: EconomicsParcelSignal[];
    scenario_candidates: EconomicsScenarioOutput[];
    tax_base_opportunity: EconomicsParcelSignal[];
    underbuilt_redevelopment: EconomicsParcelSignal[];
  };
  underbuilt_watchlist: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
  watchlists?: {
    data_needed: EconomicsParcelSignal[];
    tax_base_opportunity: EconomicsParcelSignal[];
    underbuilt_redevelopment: EconomicsParcelSignal[];
    workspace: EconomicsParcelSignal[];
  };
}

export interface EconomicsEnterpriseExportResponse {
  as_of: string | null;
  caveats: string[];
  decision_pack_template?: {
    required_caveats: string[];
    sections: string[];
  };
  exports: {
    decision_pack: {
      assumptions: string[];
      caveats: string[];
      evidence_pack: Array<{ items: unknown[]; section: string }>;
      executive_takeaway: string;
      recommended_next_diligence: string[];
      risk_flags: string[];
    };
    planning_model: {
      cells: Array<Record<string, unknown>>;
      dimensions: Array<{ members: unknown[]; name: string }>;
      measures: string[];
      scenarios: string[];
    };
    power_bi: {
      dimensions: Record<string, unknown[]>;
      kpi_fact: Array<Record<string, unknown>>;
      scenario_fact: Array<Record<string, unknown>>;
      signal_fact: Array<Record<string, unknown>>;
      watchlist_fact: Array<Record<string, unknown>>;
    };
  };
  mode: "demo" | "live";
  planning_model_dimensions?: string[];
  planning_model_measures?: string[];
  scenario_assumptions?: EconomicsScenarioInput[];
  scenario_output_bands?: Array<Record<string, unknown>>;
  scenario_templates?: EconomicsScenarioTemplate[];
}

export interface EconomicsPowerBiExportResponse {
  as_of: string | null;
  caveats: string[];
  mode: "demo" | "live";
  relationships: Array<{
    from_column: string;
    from_table: string;
    to_column: string;
    to_table: string;
  }>;
  report_builder_guide?: {
    concepts: Array<{ description: string; term: string }>;
    import_steps: string[];
    measure_caveat?: string;
    pages: Array<{
      page: string;
      purpose: string;
      visuals: Array<Record<string, unknown>>;
    }>;
    quality_checks: string[];
    relationship_guidance: string[];
    relationships: Array<{
      from_column: string;
      from_table: string;
      guidance?: string;
      to_column: string;
      to_table: string;
    }>;
    suggested_measures: Array<{ expression: string; name: string }>;
  };
  suggested_visuals: Array<{
    page: string;
    visuals: string[];
  }>;
  tables: {
    domain_readiness_dim: Array<Record<string, unknown>>;
    economics_kpi_fact: Array<Record<string, unknown>>;
    geography_dim: Array<Record<string, unknown>>;
    parcel_economic_signal_fact: Array<Record<string, unknown>>;
    scenario_dim: Array<Record<string, unknown>>;
    scenario_output_fact: Array<Record<string, unknown>>;
    time_dim: Array<Record<string, unknown>>;
  };
}

export interface EconomicsPowerBiCsvManifest {
  recommended_import_order: string[];
  relationships: Array<{
    from_column: string;
    from_table: string;
    to_column: string;
    to_table: string;
  }>;
  tables: Array<{
    description: string;
    download_url: string;
    primary_use: string;
    row_count: number;
    suggested_visual: string;
    table_name: keyof EconomicsPowerBiExportResponse["tables"];
  }>;
}
