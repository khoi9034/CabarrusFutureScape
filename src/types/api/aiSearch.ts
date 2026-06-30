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
  app_mode?: "economics" | "planning";
  conversation_context?: CfsAiConversationTurn[];
  filters?: {
    domains?: CfsAiDomain[];
    year_end?: number | null;
    year_start?: number | null;
  };
  mode?: "demo" | "live";
  query: string;
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
  confidence: "available" | "limited" | "not_available";
  detail: string;
  source: string;
  title: string;
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

export interface CfsAiSearchResponse {
  answer: string;
  as_of: string | null;
  caveats: string[];
  dashboard_actions: CfsAiDashboardActions;
  data_mode: "demo" | "live";
  domains: CfsAiDomain[];
  evidence: CfsAiEvidenceItem[];
  provider: "none" | "openai";
  related_layers: string[];
  suggested_actions: string[];
}
