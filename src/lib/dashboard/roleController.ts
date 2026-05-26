import { getDashboardRoleById } from "@/lib/dashboard/roleRegistry";
import { getWorkspacePresetById } from "@/lib/dashboard/workspacePresets";
import type { ScenarioId } from "@/types";
import type {
  ExecutiveBriefingMode,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";
import type {
  PrintableViewMode,
  ReportExportIntent,
  ReportPackageId,
} from "@/types/reports";
import type { DashboardRoleDefinition, DashboardRoleId } from "@/types/userRoles";
import type { DashboardViewMode } from "@/types/workspace";

export interface RoleControllerActions {
  setActiveLayerIds: (layerIds: string[]) => void;
  setBriefingMode: (mode: ExecutiveBriefingMode) => void;
  setComparisonPair: (pair: ScenarioComparisonPair) => void;
  setPrintableViewMode: (mode: PrintableViewMode) => void;
  setReportIntent: (intent: ReportExportIntent) => void;
  selectReportPackage: (packageId: ReportPackageId) => void;
  setRoleId: (roleId: DashboardRoleId) => void;
  setScenarioId: (scenarioId: ScenarioId) => void;
  setSimulationIntensity: (intensity: number) => void;
  setSimulationYear: (year: number) => void;
  setViewMode: (viewMode: DashboardViewMode) => void;
}

export interface AppliedRolePreset {
  role: DashboardRoleDefinition;
  roleId: DashboardRoleId;
}

export function applyRolePreset(
  roleId: DashboardRoleId,
  actions: RoleControllerActions,
): AppliedRolePreset {
  const role = getDashboardRoleById(roleId);
  const workspacePreset = getWorkspacePresetById(role.defaultWorkspaceMode);
  const scenarioId =
    role.preferredScenarioPresets[0] ??
    workspacePreset.scenarioPreset.scenarioId;

  actions.setRoleId(role.id);
  actions.setViewMode(role.defaultWorkspaceMode);
  actions.setActiveLayerIds(role.defaultOperationalLayerIds);
  actions.setComparisonPair(role.defaultScenarioComparisonPair);
  actions.setBriefingMode(role.defaultBriefingMode);
  actions.setPrintableViewMode(role.defaultPrintableViewMode);
  actions.setReportIntent(role.defaultReportExportIntent);
  actions.selectReportPackage(role.defaultReportPackageId);
  actions.setScenarioId(scenarioId);
  actions.setSimulationYear(workspacePreset.scenarioPreset.simulationYear);
  actions.setSimulationIntensity(
    workspacePreset.scenarioPreset.simulationIntensity,
  );

  return {
    role,
    roleId: role.id,
  };
}
