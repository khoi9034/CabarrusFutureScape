import type {
  ParcelFocusSource,
  ParcelMapCentroid,
  ParcelMapExtent,
  ParcelMapFocus,
  ParcelMapFocusRequestEventDetail,
  ParcelMapFocusResult,
  ParcelMapFocusResultEventDetail,
} from "@/types/map/parcelFocus";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";

export interface ParcelFocusRecordLike {
  officialParcelId: string;
  pin14?: string | null;
}

const REQUIRED_BACKEND_FIELDS = [
  "centroid.longitude",
  "centroid.latitude",
  "extent or geometry",
];

export const CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT =
  "cfs:parcel-map-focus-request";

export const CFS_PARCEL_MAP_FOCUS_RESULT_EVENT =
  "cfs:parcel-map-focus-result";

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

  if (focus.focusStatus === "failed") {
    return {
      canFocus: false,
      focusStatus: "failed",
      message:
        "Map focus failed. The selected parcel remains available in the detail drawer.",
      mode: "focus-failed",
      requiredBackendFields: REQUIRED_BACKEND_FIELDS,
    };
  }

  if (focus.focusStatus === "unsupported") {
    return {
      canFocus: false,
      focusStatus: "unsupported",
      message:
        "SceneView focus is unavailable, so the selected parcel remains in static detail mode.",
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
        focus.focusStatus === "focused"
          ? "Focused on map with backend parcel centroid and extent."
          : "Map focus ready. SceneView can zoom and show a lightweight focus marker for this parcel.",
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
    case "failed":
      return "Map focus failed";
    case "focused":
      return "Focused on map";
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

export function dispatchParcelMapFocusRequest(focus: ParcelMapFocus) {
  if (typeof window === "undefined") {
    return;
  }

  logParcelMapFocusDiagnostic("dispatch focus request", {
    centroid: focus.centroid,
    extent: focus.extent,
    focusSource: focus.focusSource,
    focusStatus: focus.focusStatus,
    officialParcelId: focus.officialParcelId,
    pin14: focus.pin14,
  });

  window.dispatchEvent(
    new CustomEvent<ParcelMapFocusRequestEventDetail>(
      CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
      {
        detail: { focus },
      },
    ),
  );
}

export function dispatchParcelMapFocusResult(
  detail: ParcelMapFocusResultEventDetail,
) {
  if (typeof window === "undefined") {
    return;
  }

  logParcelMapFocusDiagnostic("dispatch focus result", {
    focusStatus: detail.focusStatus,
    message: detail.message,
    officialParcelId: detail.officialParcelId,
  });

  window.dispatchEvent(
    new CustomEvent<ParcelMapFocusResultEventDetail>(
      CFS_PARCEL_MAP_FOCUS_RESULT_EVENT,
      {
        detail,
      },
    ),
  );
}
