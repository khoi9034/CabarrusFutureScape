export type FloodConstraintLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

export type FloodConstraintSeverity = "high" | "moderate" | "severe";

export interface FloodConstraintSeverityCounts {
  high: number;
  moderate: number;
  severe: number;
}

export interface FloodConstraintMapCentroid {
  latitude: number;
  longitude: number;
  spatialReference?: {
    wkid?: number;
  } | null;
}

export interface FloodConstraintMapMarker {
  buildabilityImpact: string | null;
  centroid: FloodConstraintMapCentroid;
  dominantFloodZone: string | null;
  floodConstraintScore: number | null;
  floodReviewRequired: boolean;
  floodSeverityClass: FloodConstraintSeverity | null;
  floodwayPresent: boolean;
  officialParcelId: string;
  percentParcelConstrained: number | null;
  pin14: string | null;
  sfhaPresent: boolean;
}

export interface FloodConstraintLayerState {
  errorMessage: string | null;
  isLoading: boolean;
  markers: FloodConstraintMapMarker[];
  severityCounts: FloodConstraintSeverityCounts;
  source: "api" | "none";
  status: FloodConstraintLayerStatus;
  totalCount: number;
}
