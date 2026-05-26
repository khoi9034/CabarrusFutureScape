import type { ParcelSelectionSource } from "@/types";

export type SelectionSource = ParcelSelectionSource;

export type EmptyMapClickBehavior = "clear-selection" | "preserve-selection";

export interface MapScreenPoint {
  x: number;
  y: number;
}

export interface MapPointSummary {
  latitude?: number;
  longitude?: number;
  spatialReferenceWkid?: number;
  z?: number;
}

export interface MapClickEvent {
  mapPoint?: MapPointSummary;
  screenPoint: MapScreenPoint;
  timestamp: number;
  type: "click";
}

export interface MapHoverEvent {
  mapPoint?: MapPointSummary;
  screenPoint: MapScreenPoint;
  timestamp: number;
  type: "hover";
}

export interface MapHitTestResult {
  attributes: Record<string, unknown>;
  graphicUid?: string;
  layerId: string | null;
  layerTitle?: string;
  mapPoint?: MapPointSummary;
  parcelId?: string;
  source: "mock-graphics" | "service-layer" | "unknown";
}

export interface MapSelectionEvent {
  action: "clear" | "preserve" | "select";
  click?: MapClickEvent;
  hit?: MapHitTestResult;
  parcelId?: string;
  reason?: string;
  source: SelectionSource;
  type: "selection";
}

export interface IdentifyQueryRequest {
  activeLayerIds: string[];
  candidateLayerIds?: string[];
  mapPoint?: MapPointSummary;
  parcelId?: string;
  screenPoint?: MapScreenPoint;
  source: "hover" | "manual" | "map-click";
  timestamp: number;
}

export interface IdentifyQueryResult {
  hits: MapHitTestResult[];
  primaryHit?: MapHitTestResult;
  primaryParcelId?: string;
  request: IdentifyQueryRequest;
  source: "mock-hit-test" | "none" | "service-identify";
}
