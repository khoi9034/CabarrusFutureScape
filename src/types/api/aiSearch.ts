export type CfsAiDomain =
  | "data_readiness"
  | "economics"
  | "flood"
  | "general"
  | "methodology"
  | "model_lab"
  | "permits"
  | "schools"
  | "transportation"
  | "utilities"
  | "zoning";

export interface CfsAiSearchRequest {
  app_mode?: "economics" | "master-data" | "planning";
  conversation_context?: CfsAiConversationTurn[];
  filter_context?: Record<string, string | number | boolean | null | undefined>;
  filters?: {
    domains?: CfsAiDomain[];
    year_end?: number | null;
    year_start?: number | null;
  };
  mode?: "demo" | "live";
  query: string;
  request_type?: "powerbi_report_plan" | null;
  selected_signal?: CfsAiSelectedSignal | null;
}

export interface CfsAiSelectedSignal {
  domain: string;
  evidence?: string[];
  id: string;
  related_layers?: string[];
  status_band?: string | null;
  title: string;
}

export interface CfsAiConversationTurn {
  answer_summary?: string | null;
  dashboard_actions?: CfsAiDashboardActions;
  focused_domain?: string | null;
  query: string;
  related_layers?: string[];
}

export interface CfsAiEvidenceItem {
  as_of?: string | null;
  caveat?: string | null;
  confidence: "available" | "limited" | "not_available";
  detail: string;
  geography?: string | null;
  methodology?: string | null;
  source: string;
  source_type?: string | null;
  status?: string | null;
  title: string;
  unit?: string | null;
  value?: string | number | null;
}

export interface CfsAiDashboardActions {
  filter_watchlist?: {
    domain?: string | null;
    status?: string | null;
  } | null;
  focus_domain?:
    | "data_readiness"
    | "economics"
    | "flood"
    | "general"
    | "model_lab"
    | "permits"
    | "schools"
    | "transportation"
    | "utilities"
    | "zoning"
    | null;
  highlight_kpis?: string[];
  open_detail?: {
    type: "domain" | "kpi" | "watchlist";
    id: string;
  } | null;
  recommended_layers?: string[];
  sort_watchlist_by?: "data_gap" | "recent_activity" | "severity" | null;
  time_range?: {
    end_year?: number | null;
    start_year?: number | null;
  } | null;
}

export interface CfsAiPowerBiActions {
  action_type:
    | "add_to_canvas"
    | "build_chart"
    | "build_report"
    | "configure_builder"
    | "none"
    | "suggest_report";
  chart_builder_config?: {
    aggregation?: "average" | "count" | "sum";
    category_field?: string;
    caveat?: string;
    chart_type?: "bar" | "donut" | "line" | "matrix" | "pie" | "table";
    filter_field?: string;
    filter_value?: string;
    table_name: string;
    title?: string;
    value_field?: string;
  } | null;
  powerbi_build_steps?: string[];
  report_canvas_items?: Array<{
    aggregation?: string;
    category_field?: string;
    caveat?: string;
    filter_field?: string;
    filter_value?: string;
    page_name: string;
    powerbi_recipe: string;
    source_table: string;
    value_field?: string;
    visual_title: string;
    visual_type: "bar" | "donut" | "line" | "matrix" | "pie" | "table";
  }>;
  report_summary?: string;
  report_title?: string;
  selected_filters?: {
    data_confidence?: string;
    economic_segment?: string;
    geography_label?: string;
    opportunity_class?: string;
    scenario_name?: string;
    sewer_proxy_class?: string;
    utility_capacity_status?: string;
    utility_readiness_proxy_class?: string;
  };
  selected_tool?:
    | "chart_builder"
    | "decision_pack"
    | "planning_model"
    | "powerbi_export"
    | "report_canvas"
    | "scenario_model";
}

export interface CfsAiSearchResponse {
  answer: string;
  answer_mode?: "deterministic" | "provider_enhanced" | "safety";
  as_of: string | null;
  caveats: string[];
  context_freshness?: "cached_demo_extract" | "current_session" | "fallback_partial" | string | null;
  dashboard_actions: CfsAiDashboardActions;
  data_source?: "local_live_backend" | "portfolio_demo_extract" | string | null;
  data_mode: "demo" | "live";
  domains: CfsAiDomain[];
  evidence: CfsAiEvidenceItem[];
  executive_summary?: string | null;
  fallback_used?: boolean;
  filtered_context_summary?: string | null;
  interpretation?: string | null;
  key_findings?: string[];
  limitations?: string[];
  official_data_still_needed?: string[];
  prompt_version?: string;
  provider: "none" | "openai";
  provider_status?: string | null;
  provenance?: Record<string, unknown>;
  recommended_next_actions?: string[];
  request_id?: string;
  response_time_ms?: number;
  powerbi_actions?: CfsAiPowerBiActions | null;
  related_layers: string[];
  suggested_actions: string[];
  suggested_follow_up_questions?: string[];
  timings_ms?: Record<string, number>;
}
