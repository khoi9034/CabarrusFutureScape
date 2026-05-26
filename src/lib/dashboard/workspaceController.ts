import {
  getDefaultWorkspacePreset,
  getWorkspacePresetById,
} from "@/lib/dashboard/workspacePresets";
import type { ScenarioId } from "@/types";
import type {
  DashboardViewMode,
  WorkspaceLayoutPreset,
} from "@/types/workspace";

export interface WorkspaceControllerActions {
  setActiveLayerIds: (layerIds: string[]) => void;
  setScenarioId: (scenarioId: ScenarioId) => void;
  setSimulationIntensity: (intensity: number) => void;
  setSimulationYear: (year: number) => void;
  setViewMode: (viewMode: DashboardViewMode) => void;
}

export interface AppliedWorkspacePreset {
  preset: WorkspaceLayoutPreset;
  viewMode: DashboardViewMode;
}

export function applyWorkspacePreset(
  viewMode: DashboardViewMode,
  actions: WorkspaceControllerActions,
): AppliedWorkspacePreset {
  const preset = getWorkspacePresetById(viewMode);

  actions.setViewMode(preset.id);
  actions.setActiveLayerIds(preset.layerPreset.visibleLayerIds);
  actions.setScenarioId(preset.scenarioPreset.scenarioId);
  actions.setSimulationYear(preset.scenarioPreset.simulationYear);
  actions.setSimulationIntensity(preset.scenarioPreset.simulationIntensity);

  return {
    preset,
    viewMode: preset.id,
  };
}

export function restoreDefaultWorkspace(actions: WorkspaceControllerActions) {
  return applyWorkspacePreset(getDefaultWorkspacePreset().id, actions);
}
