export type SchoolPressureWatchBand =
  | "data needed"
  | "elevated review"
  | "monitor"
  | "review";

export type ObservedGrowthPressureBand =
  | "elevated"
  | "high"
  | "low"
  | "moderate"
  | "unknown";

export interface SchoolPressureGeometry {
  coordinates: unknown;
  spatialReference?: {
    wkid: number;
  };
  type: "MultiPolygon" | "Polygon";
}

export interface SchoolPressureProperties {
  attendance_area_id: string | null;
  caveats: string[];
  enrollment_year: string | null;
  major_development_permit_count_recent: number | null;
  multifamily_permit_count_recent: number | null;
  observed_growth_pressure_band: ObservedGrowthPressureBand;
  permit_count_previous: number | null;
  permit_count_recent: number | null;
  permit_growth_delta: number | null;
  permit_growth_pct: number | null;
  recommended_followup: string;
  residential_permit_count_recent: number | null;
  school_level: string | null;
  school_name: string | null;
  school_pressure_watch_band: SchoolPressureWatchBand;
  top_reasons: string[];
  utilization_pct: number | null;
  utilization_status: string | null;
}

export interface SchoolPressureFeature {
  geometry: SchoolPressureGeometry | null;
  properties: SchoolPressureProperties;
  type: "Feature";
}

export interface SchoolPressureSummary {
  areas_analyzed: number;
  areas_with_recent_permits: number;
  areas_with_utilization: number;
  data_needed_count: number;
  elevated_review_count: number;
  recent_residential_permits_in_watched_areas: number;
}

export interface SchoolPressureResponse {
  as_of: string | null;
  caveats: string[];
  data_coverage_notes: string[];
  features: SchoolPressureFeature[];
  limit: number;
  mode: "demo" | "live" | string;
  offset: number;
  summary: SchoolPressureSummary;
  total_count: number;
}

export interface SchoolPressureLayerState {
  caveats: string[];
  errorMessage: string | null;
  features: SchoolPressureFeature[];
  isLoading: boolean;
  source: "api" | "demo" | "none";
  status: "empty" | "error" | "loading" | "off" | "ready" | "unavailable";
  summary: SchoolPressureSummary;
  totalCount: number;
}
