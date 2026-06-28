import type { OperationalLayer, OverviewCommandMode } from "@/types";

export type MapLayerOwnerScope =
  | "exploreCountywide"
  | "globalSelection"
  | "modelLab"
  | "sharedBase"
  | "snapshotOnly";

const layerOwnerScopeById: Record<string, MapLayerOwnerScope> = {
  "county-boundary": "sharedBase",
  "development-pressure": "modelLab",
  "fema-flood-zones": "exploreCountywide",
  "flood-risk": "exploreCountywide",
  "infrastructure-readiness": "exploreCountywide",
  "opportunity-extrusions": "modelLab",
  "parcel-intelligence": "exploreCountywide",
  "permit-activity": "exploreCountywide",
  "school-pressure": "exploreCountywide",
  "school-utilization-seed": "exploreCountywide",
  "scenario-envelope": "snapshotOnly",
  "transportation-context": "exploreCountywide",
};

export function getMapLayerOwnerScope(layerId: string): MapLayerOwnerScope {
  return layerOwnerScopeById[layerId] ?? "exploreCountywide";
}

export function isExploreCountywideMode(mode: OverviewCommandMode) {
  return mode === "countywide";
}

export function isModelLabMode(mode: OverviewCommandMode) {
  return mode === "modelLab";
}

export function isMapLayerVisibleInMode(
  layerId: string,
  mode: OverviewCommandMode,
) {
  const ownerScope = getMapLayerOwnerScope(layerId);

  if (ownerScope === "sharedBase") {
    return mode === "countywide" || mode === "modelLab";
  }

  if (ownerScope === "globalSelection") {
    return mode === "countywide" || mode === "modelLab";
  }

  if (ownerScope === "exploreCountywide") {
    return isExploreCountywideMode(mode);
  }

  if (ownerScope === "modelLab") {
    return isModelLabMode(mode);
  }

  return false;
}

export function getModeScopedActiveLayerIds(
  activeLayerIds: string[],
  mode: OverviewCommandMode,
) {
  return activeLayerIds.filter((layerId) =>
    isMapLayerVisibleInMode(layerId, mode),
  );
}

export function getModeScopedActiveLayers<TLayer extends OperationalLayer>(
  activeLayers: TLayer[],
  mode: OverviewCommandMode,
) {
  return activeLayers.filter((layer) =>
    isMapLayerVisibleInMode(layer.id, mode),
  );
}
