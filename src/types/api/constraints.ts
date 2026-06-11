export type ConstraintFilterValue = boolean | number | string;

export type ConstraintFilters = Record<string, ConstraintFilterValue>;

export interface FloodConstraintBucket {
  parcel_count: number;
  percentage: number | null;
  value: string;
}

export interface FloodConstraintDetailResponse {
  buildability_impact: string | null;
  dominant_flood_zone: string | null;
  flood_constraint_score: number | null;
  flood_constrained_area_acres: number | null;
  flood_review_required: boolean;
  flood_severity_class: string | null;
  flood_zone_codes: string[];
  floodplain_present: boolean;
  floodway_area_acres: number | null;
  floodway_present: boolean;
  minimal_flood_present: boolean;
  moderate_flood_present: boolean;
  official_parcel_id: string;
  overlay_confidence: string | null;
  parcel_area_acres: number | null;
  percent_parcel_constrained: number | null;
  percent_parcel_floodway: number | null;
  percent_parcel_sfha: number | null;
  pin14: string | null;
  sfha_area_acres: number | null;
  sfha_present: boolean;
}

export interface FloodConstraintFilterResponse {
  filters_applied: ConstraintFilters;
  limit: number;
  offset: number;
  results: FloodConstraintDetailResponse[];
  total_count: number;
}

export interface FloodConstraintStatisticsResponse {
  buildability_impact_distribution: FloodConstraintBucket[];
  dominant_zone_distribution: FloodConstraintBucket[];
  filters_applied: ConstraintFilters;
  floodplain_parcels: number;
  floodway_parcels: number;
  high_severe_buildability_parcels: number;
  review_required_parcels: number;
  severity_distribution: FloodConstraintBucket[];
  sfha_parcels: number;
  total_parcels: number;
}

export interface FloodConstraintSummaryResponse
  extends FloodConstraintStatisticsResponse {
  average_percent_constrained: number | null;
  caveats: string[];
  max_percent_constrained: number | null;
}

export interface FloodZoneGeometryResponse {
  coordinates: unknown;
  spatial_reference: {
    wkid: number;
  };
  type: "MultiPolygon" | "Polygon" | string;
}

export interface FloodZoneResponse {
  flood_constraint_type: string | null;
  flood_severity_class: string | null;
  flood_zone_code: string | null;
  flood_zone_internal_id: number;
  fld_ar_id: string | null;
  geometry: FloodZoneGeometryResponse;
  gfid: string | null;
  globalid: string | null;
  source_layer: string | null;
  source_objectid: number | null;
}

export interface FloodZonePageResponse {
  filters_applied: ConstraintFilters;
  limit: number | null;
  offset: number;
  total_count: number;
  zones: FloodZoneResponse[];
}
