import type { ScenarioId } from "@/types";

export type DashboardViewMode =
  | "executive"
  | "growth"
  | "infrastructure"
  | "parcel"
  | "planning"
  | "risk";

export interface WorkspacePanelState {
  bottomAnalyticsVisible: boolean;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  primaryPanel: "analytics" | "intelligence" | "layers" | "parcel";
}

export interface WorkspaceLayerPreset {
  emphasisLayerIds: string[];
  visibleLayerIds: string[];
}

export interface WorkspaceScenarioPreset {
  scenarioId: ScenarioId;
  simulationIntensity: number;
  simulationYear: number;
}

export interface WorkspaceLayoutPreset {
  description: string;
  id: DashboardViewMode;
  kpiFocus: string[];
  label: string;
  layerPreset: WorkspaceLayerPreset;
  mapEmphasis: "balanced" | "growth" | "infrastructure" | "parcel" | "risk";
  panelState: WorkspacePanelState;
  scenarioPreset: WorkspaceScenarioPreset;
  sectionOrder: string[];
}
