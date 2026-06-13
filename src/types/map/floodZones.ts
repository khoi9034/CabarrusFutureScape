export type FloodZoneLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

export type FloodZoneSeverity = "high" | "low" | "moderate" | "severe";

export type FloodZoneSeverityFilter =
  | "all"
  | "high"
  | "moderate"
  | "severe";

export type FloodZoneLimitMode = "100" | "500" | "visible_extent";

export interface FloodZoneExtent {
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
}

export interface FloodZoneControls {
  limitMode: FloodZoneLimitMode;
  severity: FloodZoneSeverityFilter;
}

export const defaultFloodZoneControls: FloodZoneControls = {
  limitMode: "100",
  severity: "all",
};

export interface FloodZoneMapGeometry {
  coordinates: unknown;
  spatialReference: {
    wkid: number;
  };
  type: "MultiPolygon" | "Polygon";
}

export interface FloodZoneMapPolygon {
  floodConstraintType: string | null;
  floodSeverityClass: FloodZoneSeverity | null;
  floodZoneCode: string | null;
  floodZoneInternalId: number;
  fldArId: string | null;
  geometry: FloodZoneMapGeometry;
  gfid: string | null;
  globalid: string | null;
  sourceLayer: string | null;
  sourceObjectid: number | null;
}

export interface FloodZoneSeverityCounts {
  high: number;
  low: number;
  moderate: number;
  severe: number;
}

export interface FloodZoneLayerState {
  errorMessage: string | null;
  isLoading: boolean;
  polygons: FloodZoneMapPolygon[];
  severityCounts: FloodZoneSeverityCounts;
  source: "api" | "none";
  status: FloodZoneLayerStatus;
  totalCount: number;
}
