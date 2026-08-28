import type {
  JsonObject,
  PlanningSnapshotCreateInput,
  PlanningSnapshotRecord,
  PlanningSnapshotUpdateInput,
} from "@/lib/product/types";
import { toJsonObject } from "@/lib/product/json";
import type {
  PlanningSnapshot,
  PlanningSnapshotSectionKey,
} from "@/types";

export const PLANNING_SNAPSHOT_SECTION_KEYS: PlanningSnapshotSectionKey[] = [
  "data_needed_caveats",
  "development_permits",
  "fema_flood",
  "map_view",
  "model_governance",
  "new_construction",
  "parcel_facts",
  "recommended_actions",
  "schools",
  "transportation",
  "utility_proxy",
  "zoning_planning",
];

const SNAPSHOT_VERSIONS = new Set<string>([
  "phase22a_v1",
  "phase22b_v1",
  "phase22e_v1",
  "phase23b_v1",
  "phase23c_v1",
  "phase23d_v1",
  "phase23g_v1",
  "phase26a_v1",
  "phase27b_v1",
  "phase28a_v1",
  "phase28b_v1",
  "phase28c_v1",
  "phase28d_v1",
  "phase28e_v1",
  "phase28f_v1",
  "phase28g_v1",
  "phase28h_v1",
  "phase28i_v1",
  "phase28k_v1",
]);

export function planningSnapshotCreateInput(
  snapshot: PlanningSnapshot,
): PlanningSnapshotCreateInput {
  return {
    included_sections: includedSectionKeys(snapshot),
    map_state: planningMapState(snapshot),
    notes: snapshot.notes?.trim() || null,
    payload: planningPayload(snapshot),
    review_status: "Draft",
    title: planningSnapshotTitle(snapshot),
  };
}

export function planningSnapshotUpdateInput(
  snapshot: PlanningSnapshot,
): PlanningSnapshotUpdateInput {
  return {
    included_sections: includedSectionKeys(snapshot),
    map_state: planningMapState(snapshot),
    notes: snapshot.notes?.trim() || null,
    payload: planningPayload(snapshot),
    title: planningSnapshotTitle(snapshot),
  };
}

export function planningSnapshotFromRecord(
  record: PlanningSnapshotRecord,
  transientVisual?: PlanningSnapshot | null,
): PlanningSnapshot {
  const storedSnapshot = record.payload.snapshot;
  const snapshot = isPlanningSnapshot(storedSnapshot)
    ? storedSnapshot
    : fallbackPlanningSnapshot(record);
  const keepMapVisual = Boolean(transientVisual?.mapScreenshotDataUrl);
  const keepDashboardVisual = Boolean(transientVisual?.dashboardImageDataUrl);

  return {
    ...snapshot,
    ...(keepDashboardVisual
      ? {
          dashboardImageCapturedAt: transientVisual?.dashboardImageCapturedAt,
          dashboardImageDataUrl: transientVisual?.dashboardImageDataUrl,
          dashboardImageFailureReason:
            transientVisual?.dashboardImageFailureReason,
          dashboardImageStatus: transientVisual?.dashboardImageStatus,
          hasDashboardImage: transientVisual?.hasDashboardImage,
        }
      : {}),
    ...(keepMapVisual
      ? {
          hasMapImage: transientVisual?.hasMapImage,
          mapScreenshotCapturedAt: transientVisual?.mapScreenshotCapturedAt,
          mapScreenshotDataUrl: transientVisual?.mapScreenshotDataUrl,
          mapScreenshotFailureReason:
            transientVisual?.mapScreenshotFailureReason,
          mapScreenshotStatus: transientVisual?.mapScreenshotStatus,
        }
      : {}),
    createdAt: record.created_at,
    currentVersion: record.current_version,
    includedSections: includedSections(record.included_sections),
    mapRenderer:
      storedMapRenderer(record) ?? snapshot.mapRenderer ?? transientVisual?.mapRenderer,
    notes: record.notes ?? "",
    snapshotId: record.id,
    snapshotTitle: record.title,
    updatedAt: record.updated_at,
  };
}

export function planningSnapshotTitle(snapshot: PlanningSnapshot) {
  const explicit = snapshot.snapshotTitle?.trim();
  if (explicit) return explicit.slice(0, 240);
  if (snapshot.selectedParcelId) {
    return `Parcel ${snapshot.selectedParcelId}`.slice(0, 240);
  }
  return (snapshot.focusModeLabel ?? "Countywide Planning Snapshot").slice(
    0,
    240,
  );
}

function planningPayload(snapshot: PlanningSnapshot): JsonObject {
  const { dashboardImageDataUrl, mapScreenshotDataUrl } = snapshot;
  const domainSnapshot = { ...snapshot };
  delete domainSnapshot.currentVersion;
  delete domainSnapshot.dashboardImageDataUrl;
  delete domainSnapshot.mapScreenshotDataUrl;
  delete domainSnapshot.notes;
  delete domainSnapshot.updatedAt;
  const mapCaptured = Boolean(mapScreenshotDataUrl);
  const dashboardCaptured = Boolean(dashboardImageDataUrl);
  const durableSnapshot: PlanningSnapshot = {
    ...domainSnapshot,
    dashboardImageDataUrl: null,
    dashboardImageFailureReason: dashboardCaptured
      ? "Dashboard image is retained only in the current browser session until governed artifact storage is configured."
      : snapshot.dashboardImageFailureReason,
    dashboardImageStatus: dashboardCaptured
      ? "unavailable"
      : snapshot.dashboardImageStatus,
    hasDashboardImage: false,
    hasMapImage: false,
    mapScreenshotDataUrl: null,
    mapScreenshotFailureReason: mapCaptured
      ? "Map image is retained only in the current browser session until governed artifact storage is configured."
      : snapshot.mapScreenshotFailureReason,
    mapScreenshotStatus: mapCaptured
      ? "unavailable"
      : snapshot.mapScreenshotStatus,
  };

  return {
    client_snapshot_id: snapshot.snapshotId,
    schema_version: snapshot.snapshotVersion,
    snapshot: toJsonObject(durableSnapshot),
    visual_capture: {
      dashboard_image_captured_in_session: dashboardCaptured,
      durable_artifact_reference: null,
      map_image_captured_in_session: mapCaptured,
      persistence: "session_visual_only",
    },
  };
}

function planningMapState(snapshot: PlanningSnapshot): JsonObject {
  return toJsonObject({
    active_layer_ids: snapshot.activeLayerIds ?? [],
    active_layer_labels: snapshot.activeLayers,
    camera_summary: snapshot.mapContext.cameraSummary ?? null,
    description: snapshot.mapContext.description,
    extent: snapshot.mapContext.extent ?? null,
    extent_captured: snapshot.mapContext.extentCaptured,
    extent_summary: snapshot.mapContext.extentSummary ?? null,
    map_renderer: currentMapRenderer() ?? snapshot.mapRenderer ?? "unknown",
    overview_command_mode: snapshot.overviewCommandMode ?? null,
    selected_parcel_id: snapshot.selectedParcelId,
    snapshot_type: snapshot.snapshotType ?? "map",
    visual_type: snapshot.visualType ?? "map",
  });
}

function currentMapRenderer() {
  if (typeof document === "undefined") return null;
  return document
    .querySelector('[data-testid="cfs-arcgis-map"]')
    ?.getAttribute("data-map-renderer") ?? null;
}

function storedMapRenderer(record: PlanningSnapshotRecord) {
  const renderer = record.map_state.map_renderer;
  return typeof renderer === "string" && renderer ? renderer : undefined;
}

function includedSectionKeys(snapshot: PlanningSnapshot) {
  return PLANNING_SNAPSHOT_SECTION_KEYS.filter(
    (section) => snapshot.includedSections[section],
  );
}

function includedSections(
  sections: string[],
): Record<PlanningSnapshotSectionKey, boolean> {
  const selected = new Set(sections);
  return {
    data_needed_caveats: selected.has("data_needed_caveats"),
    development_permits: selected.has("development_permits"),
    fema_flood: selected.has("fema_flood"),
    map_view: selected.has("map_view"),
    model_governance: selected.has("model_governance"),
    new_construction: selected.has("new_construction"),
    parcel_facts: selected.has("parcel_facts"),
    recommended_actions: selected.has("recommended_actions"),
    schools: selected.has("schools"),
    transportation: selected.has("transportation"),
    utility_proxy: selected.has("utility_proxy"),
    zoning_planning: selected.has("zoning_planning"),
  };
}

function isPlanningSnapshot(value: unknown): value is PlanningSnapshot {
  if (!isObject(value)) return false;
  return (
    isStringArray(value.activeLayers) &&
    isStringArray(value.caveats) &&
    isTimestamp(value.createdAt) &&
    isStringRecordArray(
      value.explainableMetrics,
      ["caveat", "label", "meaning", "method", "source", "value"],
      ["recommendedAction"],
    ) &&
    isBooleanRecord(value.includedSections) &&
    isStringRecordArray(value.keyFacts, ["label", "value"]) &&
    isStringRecordArray(value.knownReviewFlags, ["label", "reason", "status"]) &&
    isObject(value.mapContext) &&
    typeof value.mapContext.description === "string" &&
    typeof value.mapContext.extentCaptured === "boolean" &&
    isStringRecordArray(value.overviewKpis, ["label", "value"], ["caveat"]) &&
    (value.selectedParcelId === null ||
      typeof value.selectedParcelId === "string") &&
    (value.selectedParcelSummary === null ||
      isObject(value.selectedParcelSummary)) &&
    typeof value.snapshotId === "string" &&
    typeof value.snapshotVersion === "string" &&
    SNAPSHOT_VERSIONS.has(value.snapshotVersion)
  );
}

function fallbackPlanningSnapshot(
  record: PlanningSnapshotRecord,
): PlanningSnapshot {
  const activeLayerLabels = stringArray(record.map_state.active_layer_labels);
  const selectedParcelId = nullableString(record.map_state.selected_parcel_id);
  return {
    activeLayerIds: stringArray(record.map_state.active_layer_ids),
    activeLayers: activeLayerLabels,
    caveats: [
      "This server record predates the full browser Planning Snapshot payload. Review the source record before reuse.",
    ],
    createdAt: record.created_at,
    explainableMetrics: [],
    includedSections: includedSections(record.included_sections),
    keyFacts: [],
    knownReviewFlags: [],
    mapContext: {
      cameraSummary: nullableString(record.map_state.camera_summary) ?? undefined,
      description:
        nullableString(record.map_state.description) ??
        "Legacy server Planning Snapshot",
      extentCaptured: record.map_state.extent_captured === true,
      extentSummary: nullableString(record.map_state.extent_summary) ?? undefined,
    },
    mapScreenshotFailureReason:
      "This server record does not include a durable map artifact reference.",
    mapScreenshotStatus: "unavailable",
    overviewKpis: [],
    selectedParcelId,
    selectedParcelSummary: null,
    snapshotId: record.id,
    snapshotTitle: record.title,
    snapshotVersion: "phase28k_v1",
    visualType: "map",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecordArray(
  value: unknown,
  required: string[],
  optional: string[] = [],
) {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObject(item) &&
        required.every((key) => typeof item[key] === "string") &&
        optional.every(
          (key) => item[key] === undefined || typeof item[key] === "string",
        ),
    )
  );
}

function stringArray(value: unknown) {
  return isStringArray(value) ? value : [];
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isBooleanRecord(value: unknown) {
  return (
    isObject(value) &&
    PLANNING_SNAPSHOT_SECTION_KEYS.every(
      (section) => typeof value[section] === "boolean",
    )
  );
}
