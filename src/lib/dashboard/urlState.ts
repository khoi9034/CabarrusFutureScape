import {
  scenarioPresets,
  timeHorizonRange,
} from "@/data/mock/dashboardMockData";
import { getParcelById } from "@/data/mock/parcelMockData";
import {
  isPrintableViewMode,
  isReportExportIntent,
  isReportPackageId,
} from "@/lib/dashboard/reportExportAdapter";
import { isDashboardRoleId } from "@/lib/dashboard/roleRegistry";
import { isScenarioComparisonPair } from "@/lib/dashboard/scenarioComparisonAdapter";
import { isDashboardViewMode } from "@/lib/dashboard/workspacePresets";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
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
import type { DashboardRoleId } from "@/types/userRoles";
import type { DashboardViewMode } from "@/types/workspace";

export interface DashboardUrlState {
  activeLayerIds: string[];
  activeReportPackageId: ReportPackageId;
  briefingMode: ExecutiveBriefingMode;
  comparisonPair: ScenarioComparisonPair;
  printableViewMode: PrintableViewMode;
  reportExportIntent: ReportExportIntent;
  roleId: DashboardRoleId;
  scenarioId: ScenarioId;
  selectedParcelId: string | null;
  simulationIntensity: number;
  simulationYear: number;
  viewMode: DashboardViewMode;
}

const validScenarioIds = new Set(scenarioPresets.map((scenario) => scenario.id));
const validLayerIds = new Set(operationalLayerRegistry.map((layer) => layer.id));
const dashboardUrlParamKeys = [
  "parcel",
  "scenario",
  "year",
  "intensity",
  "layers",
  "view",
  "role",
  "compare",
  "briefing",
  "report",
  "print",
  "export",
];

export function serializeDashboardUrlState(state: DashboardUrlState) {
  const params = new URLSearchParams();
  const activeLayerIds = normalizeLayerIds(state.activeLayerIds);

  if (state.selectedParcelId) {
    params.set("parcel", state.selectedParcelId);
  }

  params.set("role", state.roleId);
  params.set(
    "compare",
    `${state.comparisonPair.leftScenarioId},${state.comparisonPair.rightScenarioId}`,
  );
  params.set("briefing", state.briefingMode);
  params.set("report", state.activeReportPackageId);
  params.set("print", state.printableViewMode);
  params.set("export", state.reportExportIntent);
  params.set("scenario", state.scenarioId);
  params.set("view", state.viewMode);
  params.set("year", String(state.simulationYear));
  params.set("intensity", String(state.simulationIntensity));

  params.set("layers", activeLayerIds.length ? activeLayerIds.join(",") : "none");

  return params.toString();
}

export function mergeDashboardUrlState(
  currentSearch: string | URLSearchParams,
  state: DashboardUrlState,
) {
  const params = getSearchParams(currentSearch);
  const dashboardParams = new URLSearchParams(
    serializeDashboardUrlState(state),
  );

  dashboardUrlParamKeys.forEach((key) => params.delete(key));
  dashboardParams.forEach((value, key) => params.set(key, value));

  return params.toString();
}

export function deserializeDashboardUrlState(
  input: string | URLSearchParams,
): Partial<DashboardUrlState> {
  const params = getSearchParams(input);
  const briefingMode = normalizeBriefingMode(params.get("briefing"));
  const comparisonPair = normalizeComparisonPair(params.get("compare"));
  const activeReportPackageId = normalizeReportPackageId(params.get("report"));
  const printableViewMode = normalizePrintableViewMode(params.get("print"));
  const reportExportIntent = normalizeReportExportIntent(params.get("export"));
  const roleId = normalizeRoleId(params.get("role"));
  const scenarioId = params.get("scenario");
  const viewMode = normalizeViewMode(params.get("view"));
  const layers = params.get("layers");
  const selectedParcelId = normalizeParcelId(params.get("parcel"));
  const simulationYear = normalizeSimulationYear(params.get("year"));
  const simulationIntensity = normalizeSimulationIntensity(
    params.get("intensity"),
  );

  return {
    ...(briefingMode !== undefined ? { briefingMode } : {}),
    ...(comparisonPair !== undefined ? { comparisonPair } : {}),
    ...(activeReportPackageId !== undefined ? { activeReportPackageId } : {}),
    ...(printableViewMode !== undefined ? { printableViewMode } : {}),
    ...(reportExportIntent !== undefined ? { reportExportIntent } : {}),
    ...(roleId !== undefined ? { roleId } : {}),
    ...(selectedParcelId !== undefined ? { selectedParcelId } : {}),
    ...(viewMode !== undefined ? { viewMode } : {}),
    ...(isScenarioId(scenarioId) ? { scenarioId } : {}),
    ...(simulationYear !== undefined ? { simulationYear } : {}),
    ...(simulationIntensity !== undefined ? { simulationIntensity } : {}),
    ...(layers !== null ? { activeLayerIds: parseLayerIds(layers) } : {}),
  };
}

export function createDashboardUrlState(state: DashboardUrlState) {
  return {
    activeLayerIds: normalizeLayerIds(state.activeLayerIds),
    activeReportPackageId: state.activeReportPackageId,
    briefingMode: state.briefingMode,
    comparisonPair: state.comparisonPair,
    printableViewMode: state.printableViewMode,
    reportExportIntent: state.reportExportIntent,
    roleId: state.roleId,
    scenarioId: state.scenarioId,
    selectedParcelId: state.selectedParcelId,
    simulationIntensity: state.simulationIntensity,
    simulationYear: state.simulationYear,
    viewMode: state.viewMode,
  };
}

function normalizeReportPackageId(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const reportPackageId = value.trim();

  return isReportPackageId(reportPackageId) ? reportPackageId : undefined;
}

function normalizePrintableViewMode(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const printableViewMode = value.trim();

  return isPrintableViewMode(printableViewMode)
    ? printableViewMode
    : undefined;
}

function normalizeReportExportIntent(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const reportExportIntent = value.trim();

  return isReportExportIntent(reportExportIntent)
    ? reportExportIntent
    : undefined;
}

function normalizeBriefingMode(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const briefingMode = value.trim();
  const validBriefingModes: ExecutiveBriefingMode[] = [
    "executive",
    "infrastructure",
    "planning",
    "risk",
  ];

  return validBriefingModes.includes(briefingMode as ExecutiveBriefingMode)
    ? (briefingMode as ExecutiveBriefingMode)
    : undefined;
}

function normalizeComparisonPair(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const [leftValue, rightValue] = value
    .split(",")
    .map((scenarioId) => normalizeScenarioId(scenarioId));

  if (!leftValue || !rightValue || leftValue === rightValue) {
    return undefined;
  }

  if (!isScenarioComparisonPair(leftValue, rightValue)) {
    return undefined;
  }

  return {
    leftScenarioId: leftValue,
    rightScenarioId: rightValue,
  };
}

function normalizeRoleId(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const roleId = value.trim();

  return isDashboardRoleId(roleId) ? roleId : undefined;
}

function normalizeViewMode(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const viewMode = value.trim();

  return isDashboardViewMode(viewMode) ? viewMode : undefined;
}

function parseLayerIds(value: string) {
  if (value.trim().toLowerCase() === "none") {
    return [];
  }

  return normalizeLayerIds(
    value
      .split(",")
      .map((layerId) => layerId.trim())
      .filter(Boolean),
  );
}

function normalizeLayerIds(layerIds: string[]) {
  const requestedLayerIds = new Set(
    layerIds.filter((layerId) => validLayerIds.has(layerId)),
  );

  return operationalLayerRegistry
    .map((layer) => layer.id)
    .filter((layerId) => requestedLayerIds.has(layerId));
}

function getSearchParams(input: string | URLSearchParams) {
  return typeof input === "string"
    ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
    : new URLSearchParams(input.toString());
}

function normalizeSimulationYear(value: string | null) {
  return normalizeIntegerInRange(value, timeHorizonRange.min, timeHorizonRange.max);
}

function normalizeSimulationIntensity(value: string | null) {
  return normalizeIntegerInRange(value, 0, 100);
}

function normalizeIntegerInRange(
  value: string | null,
  min: number,
  max: number,
) {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    return undefined;
  }

  if (parsedValue < min || parsedValue > max) {
    return undefined;
  }

  return parsedValue;
}

function isScenarioId(value: string | null): value is ScenarioId {
  return Boolean(value && validScenarioIds.has(value as ScenarioId));
}

function normalizeScenarioId(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const scenarioId = value.trim();
  const scenarioAliases: Record<string, ScenarioId> = {
    accelerated: "accelerated-growth",
    baseline: "baseline",
    capacity: "infrastructure-first",
    infill: "infill-priority",
    infrastructure: "infrastructure-first",
  };

  return scenarioAliases[scenarioId] ?? (isScenarioId(scenarioId) ? scenarioId : undefined);
}

function normalizeParcelId(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const parcelId = value.trim();

  if (!parcelId) {
    return null;
  }

  return getParcelById(parcelId)?.parcelId;
}
