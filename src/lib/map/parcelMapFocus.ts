import type {
  ParcelFocusSource,
  ParcelMapCentroid,
  ParcelMapExtent,
  ParcelMapFocus,
  ParcelMapFocusResult,
} from "@/types/map/parcelFocus";

export interface ParcelFocusRecordLike {
  officialParcelId: string;
  pin14?: string | null;
}

const REQUIRED_BACKEND_FIELDS = [
  "centroid.longitude",
  "centroid.latitude",
  "extent or geometry",
];

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasUsableCentroid(centroid: ParcelMapCentroid | null | undefined) {
  return Boolean(
    centroid &&
      isFiniteNumber(centroid.longitude) &&
      isFiniteNumber(centroid.latitude),
  );
}

function hasUsableExtent(extent: ParcelMapExtent | null | undefined) {
  return Boolean(
    extent &&
      isFiniteNumber(extent.xmin) &&
      isFiniteNumber(extent.ymin) &&
      isFiniteNumber(extent.xmax) &&
      isFiniteNumber(extent.ymax) &&
      extent.xmin < extent.xmax &&
      extent.ymin < extent.ymax,
  );
}

function hasUsableGeometry(geometry: unknown) {
  return Boolean(geometry && typeof geometry === "object");
}

export function createParcelMapFocus(
  record: ParcelFocusRecordLike,
  focusSource: ParcelFocusSource,
  spatialTarget: Partial<
    Pick<ParcelMapFocus, "centroid" | "extent" | "geometry">
  > = {},
): ParcelMapFocus {
  const candidate: ParcelMapFocus = {
    centroid: spatialTarget.centroid ?? null,
    extent: spatialTarget.extent ?? null,
    focusSource,
    focusStatus: "pending-geometry",
    geometry: spatialTarget.geometry ?? null,
    officialParcelId: record.officialParcelId,
    pin14: record.pin14 ?? null,
  };

  return {
    ...candidate,
    focusStatus: resolveParcelMapFocus(candidate).focusStatus,
  };
}

export function resolveParcelMapFocus(
  focus: ParcelMapFocus | null,
): ParcelMapFocusResult {
  if (!focus) {
    return {
      canFocus: false,
      focusStatus: "idle",
      message:
        "Static map mode. Select a parcel to prepare future SceneView focus.",
      mode: "no-selection",
      requiredBackendFields: REQUIRED_BACKEND_FIELDS,
    };
  }

  if (!focus.officialParcelId) {
    return {
      canFocus: false,
      focusStatus: "unsupported",
      message:
        "Map focus cannot run because the selected parcel is missing an official parcel ID.",
      mode: "no-op",
      requiredBackendFields: REQUIRED_BACKEND_FIELDS,
    };
  }

  if (
    hasUsableCentroid(focus.centroid) ||
    hasUsableExtent(focus.extent) ||
    hasUsableGeometry(focus.geometry)
  ) {
    return {
      canFocus: true,
      focusStatus: focus.focusStatus === "focused" ? "focused" : "ready",
      message:
        "Map focus ready. A future SceneView bridge can zoom and highlight this parcel.",
      mode: "focus-ready",
      requiredBackendFields: [],
    };
  }

  // Current parcel search/detail API responses intentionally avoid geometry.
  // Keep this no-op boundary separate from ArcGIS runtime code so selecting a
  // real parcel never mutates or destabilizes the existing mock GraphicsLayers.
  return {
    canFocus: false,
    focusStatus: "pending-geometry",
    message:
      "Map focus pending geometry. The backend needs a parcel centroid, extent, or display geometry before SceneView can zoom or highlight this record.",
    mode: "no-op",
    requiredBackendFields: REQUIRED_BACKEND_FIELDS,
  };
}

export function getParcelMapFocusStatusLabel(
  focusResult: ParcelMapFocusResult,
) {
  switch (focusResult.focusStatus) {
    case "focused":
      return "Map focus active";
    case "ready":
      return "Map focus ready";
    case "pending-geometry":
      return "Map focus pending geometry";
    case "unsupported":
      return "Mock SceneView mode";
    case "idle":
    default:
      return "Static map mode";
  }
}
