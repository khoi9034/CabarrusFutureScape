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
