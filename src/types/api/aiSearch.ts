export type CfsAiDomain =
  | "data_readiness"
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
  filters?: {
    domains?: CfsAiDomain[];
    year_end?: number | null;
    year_start?: number | null;
  };
  mode?: "demo" | "live";
  query: string;
}

export interface CfsAiEvidenceItem {
  confidence: "available" | "limited" | "not_available";
  detail: string;
  source: string;
  title: string;
}

export interface CfsAiSearchResponse {
  answer: string;
  as_of: string | null;
  caveats: string[];
  data_mode: "demo" | "live";
  domains: CfsAiDomain[];
  evidence: CfsAiEvidenceItem[];
  provider: "anthropic" | "none" | "openai";
  related_layers: string[];
  suggested_actions: string[];
}
