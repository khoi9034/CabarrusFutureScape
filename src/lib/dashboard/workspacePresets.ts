import { initialDashboardState } from "@/data/mock/dashboardMockData";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import type {
  DashboardViewMode,
  WorkspaceLayoutPreset,
} from "@/types/workspace";

export const defaultDashboardViewMode: DashboardViewMode = "executive";

const visibleLayerIds = new Set(operationalLayerRegistry.map((layer) => layer.id));

const rawWorkspaceLayoutPresets: WorkspaceLayoutPreset[] = [
  {
    id: "executive",
    label: "Executive Summary",
    description: "Countywide growth, readiness, revenue, and constraint posture.",
    kpiFocus: ["growth-index", "readiness", "tax-lift", "risk-exposure"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "balanced",
    panelState: createPanelState("analytics"),
    scenarioPreset: {
      scenarioId: initialDashboardState.scenarioId,
      simulationIntensity: initialDashboardState.simulationIntensity,
      simulationYear: initialDashboardState.selectedSimulationYear,
    },
    sectionOrder: ["kpis", "map", "intelligence", "analytics"],
  },
  {
    id: "parcel",
    label: "Parcel Intelligence",
    description: "Selectable parcel command view with opportunity and permit context.",
    kpiFocus: ["parcel-watch", "growth-index", "tax-lift"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "parcel",
    panelState: createPanelState("parcel"),
    scenarioPreset: {
      scenarioId: "infill-priority",
      simulationIntensity: 58,
      simulationYear: 2030,
    },
    sectionOrder: ["parcel", "scores", "layers", "analytics"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure Readiness",
    description: "Capacity-first lens for service readiness and constraint timing.",
    kpiFocus: ["readiness", "growth-index", "risk-exposure"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "infrastructure",
    panelState: createPanelState("layers"),
    scenarioPreset: {
      scenarioId: "infrastructure-first",
      simulationIntensity: 50,
      simulationYear: 2032,
    },
    sectionOrder: ["layers", "readiness", "map", "analytics"],
  },
  {
    id: "growth",
    label: "Growth Pressure",
    description: "Active development pressure and near-term absorption signals.",
    kpiFocus: ["growth-index", "parcel-watch", "tax-lift"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "growth",
    panelState: createPanelState("analytics"),
    scenarioPreset: {
      scenarioId: "accelerated-growth",
      simulationIntensity: 75,
      simulationYear: 2030,
    },
    sectionOrder: ["growth", "permits", "scores", "analytics"],
  },
  {
    id: "risk",
    label: "Risk Review",
    description: "Constraint exposure, flood risk, and readiness balance review.",
    kpiFocus: ["risk-exposure", "readiness", "growth-index"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "risk",
    panelState: createPanelState("intelligence"),
    scenarioPreset: {
      scenarioId: "infrastructure-first",
      simulationIntensity: 44,
      simulationYear: 2032,
    },
    sectionOrder: ["risk", "parcel", "constraints", "analytics"],
  },
  {
    id: "planning",
    label: "Planning Operations",
    description: "Policy, permits, growth envelopes, and planning workflow signals.",
    kpiFocus: ["parcel-watch", "growth-index", "readiness"],
    layerPreset: {
      emphasisLayerIds: ["county-boundary"],
      visibleLayerIds: ["county-boundary"],
    },
    mapEmphasis: "balanced",
    panelState: createPanelState("layers"),
    scenarioPreset: {
      scenarioId: "baseline",
      simulationIntensity: 62,
      simulationYear: 2030,
    },
    sectionOrder: ["layers", "scenario", "parcel", "analytics"],
  },
];

export const workspaceLayoutPresets = rawWorkspaceLayoutPresets.map(
  normalizeWorkspacePreset,
);

export const workspaceViewModeIds = workspaceLayoutPresets.map(
  (preset) => preset.id,
);

export function getWorkspacePresetById(viewMode: DashboardViewMode) {
  return (
    workspaceLayoutPresets.find((preset) => preset.id === viewMode) ??
    getDefaultWorkspacePreset()
  );
}

export function getDefaultWorkspacePreset() {
  return workspaceLayoutPresets.find(
    (preset) => preset.id === defaultDashboardViewMode,
  ) as WorkspaceLayoutPreset;
}

export function isDashboardViewMode(
  value: string | null,
): value is DashboardViewMode {
  return Boolean(
    value &&
      workspaceViewModeIds.includes(value.trim() as DashboardViewMode),
  );
}

function normalizeWorkspacePreset(
  preset: WorkspaceLayoutPreset,
): WorkspaceLayoutPreset {
  return {
    ...preset,
    layerPreset: {
      emphasisLayerIds: normalizeLayerIds(preset.layerPreset.emphasisLayerIds),
      visibleLayerIds: normalizeLayerIds(preset.layerPreset.visibleLayerIds),
    },
  };
}

function normalizeLayerIds(layerIds: string[]) {
  const requestedLayerIds = new Set(
    layerIds.filter((layerId) => visibleLayerIds.has(layerId)),
  );

  return operationalLayerRegistry
    .map((layer) => layer.id)
    .filter((layerId) => requestedLayerIds.has(layerId));
}

function createPanelState(
  primaryPanel: WorkspaceLayoutPreset["panelState"]["primaryPanel"],
) {
  return {
    bottomAnalyticsVisible: true,
    leftPanelVisible: true,
    primaryPanel,
    rightPanelVisible: true,
  };
}
