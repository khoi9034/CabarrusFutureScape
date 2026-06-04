export type ParcelFocusSource = "command" | "detail" | "mock" | "search";

export type ParcelMapFocusStatus =
  | "failed"
  | "focused"
  | "idle"
  | "pending-geometry"
  | "ready"
  | "unsupported";

export interface ParcelMapSpatialReference {
  latestWkid?: number;
  wkid?: number;
}

export interface ParcelMapCentroid {
  latitude: number;
  longitude: number;
  spatialReference?: ParcelMapSpatialReference | null;
}

export interface ParcelMapExtent {
  spatialReference?: ParcelMapSpatialReference | null;
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
}

export type ParcelHighlightGeometryType = "MultiPolygon" | "Polygon";

export interface ParcelHighlightGeometry {
  coordinates: unknown[];
  spatialReference?: ParcelMapSpatialReference | null;
  type: ParcelHighlightGeometryType;
}

export interface ParcelMapFocus {
  centroid?: ParcelMapCentroid | null;
  extent?: ParcelMapExtent | null;
  focusSource: ParcelFocusSource;
  focusStatus: ParcelMapFocusStatus;
  highlightGeometry?: ParcelHighlightGeometry | null;
  officialParcelId: string;
  pin14?: string | null;
}

export interface ParcelMapFocusResult {
  canFocus: boolean;
  focusStatus: ParcelMapFocusStatus;
  message: string;
  mode: "focus-failed" | "focus-ready" | "no-selection" | "no-op";
  requiredBackendFields: string[];
}

export interface ParcelMapFocusRequestEventDetail {
  focus: ParcelMapFocus;
}

export interface ParcelMapFocusResultEventDetail {
  focusStatus: ParcelMapFocusStatus;
  message: string;
  officialParcelId: string;
}
