"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useExecutiveBriefing,
  type BriefingGenerationState,
} from "@/hooks/useExecutiveBriefing";
import { useExecutiveReports } from "@/hooks/useExecutiveReports";
import { useLayerVisibility } from "@/hooks/useLayerVisibility";
import { useMapInteractionState } from "@/hooks/useMapInteractionState";
import { useRoleState } from "@/hooks/useRoleState";
import { useScenarioState } from "@/hooks/useScenarioState";
import {
  useSelectedParcel,
  type SelectedParcelIntelligenceSource,
} from "@/hooks/useSelectedParcel";
import { useWorkspaceState } from "@/hooks/useWorkspaceState";
import {
  applyRolePreset as applyRolePresetToDashboard,
} from "@/lib/dashboard/roleController";
import {
  applyWorkspacePreset as applyWorkspacePresetToDashboard,
  restoreDefaultWorkspace as restoreDefaultWorkspacePreset,
} from "@/lib/dashboard/workspaceController";
import {
  createDashboardUrlState,
  type DashboardUrlState,
} from "@/lib/dashboard/urlState";
import type {
  DashboardStatus,
  OperationalLayer,
  ParcelSelectionSource,
  ParcelSummary,
  ScenarioHorizon,
  ScenarioId,
} from "@/types";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type {
  DashboardRoleDefinition,
  DashboardPanelId,
  DashboardRoleId,
} from "@/types/userRoles";
import type {
  DashboardViewMode,
  WorkspaceLayoutPreset,
} from "@/types/workspace";
import type {
  ExecutiveBriefing,
  ExecutiveBriefingMode,
  ExecutiveBriefingSection,
  ExecutiveNarrative,
  ScenarioComparison,
  ScenarioComparisonMetric,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";
import type {
  BriefingPacket,
  ExecutiveReportPackage,
  ExportFormat,
  ExportJobState,
  MockExportHistoryItem,
  PrintableViewMode,
  ReportExportIntent,
  ReportExportResult,
  ReportPackageId,
} from "@/types/reports";

interface DashboardContextValue {
  activeLayerIds: string[];
  activeLayers: OperationalLayer[];
  activeComparison: ScenarioComparison;
  activeDashboardPanelIds: DashboardPanelId[];
  activeBriefingPacket: BriefingPacket;
  activeReportPackage: ExecutiveReportPackage;
  activeReportPackageId: ReportPackageId;
  activeRole: DashboardRoleDefinition;
  activeScenario: ScenarioHorizon;
  activeWorkspacePreset: WorkspaceLayoutPreset;
  briefingGenerationState: BriefingGenerationState;
  briefingMode: ExecutiveBriefingMode;
  briefingSections: ExecutiveBriefingSection[];
  comparisonMetrics: ScenarioComparisonMetric[];
  comparisonPair: ScenarioComparisonPair;
  dashboardUrlState: DashboardUrlState;
  executiveBriefing: ExecutiveBriefing;
  exportHistory: MockExportHistoryItem[];
  exportJobState: ExportJobState;
  exportProgress: number;
  lastExportResult: ReportExportResult | null;
  mapError: string | null;
  printableViewMode: PrintableViewMode;
  reportExportIntent: ReportExportIntent;
  reportPackages: ExecutiveReportPackage[];
  selectedParcelId: string | null;
  selectedParcel: ParcelSummary | null;
  selectedParcelIntelligence: ParcelSearchRecord | null;
  selectedParcelIntelligenceSource: SelectedParcelIntelligenceSource | null;
  selectedParcelSource: ParcelSelectionSource | null;
  selectedExecutiveNarrative: ExecutiveNarrative;
  selectedNarrativeId: string | null;
  roleId: DashboardRoleId;
  scenarioId: ScenarioId;
  scenarioName: string;
  simulationYear: number;
  simulationIntensity: number;
  mapStatus: DashboardStatus;
  viewMode: DashboardViewMode;
  applyRolePreset: (roleId: DashboardRoleId) => void;
  applyWorkspacePreset: (viewMode: DashboardViewMode) => void;
  clearMapError: () => void;
  clearSelectedParcel: () => void;
  isLayerActive: (layerId: string) => boolean;
  selectExecutiveNarrative: (narrativeId: string | null) => void;
  setActiveLayerIds: (layerIds: string[]) => void;
  setBriefingMode: (mode: ExecutiveBriefingMode) => void;
  setComparisonPair: (pair: ScenarioComparisonPair) => void;
  setComparisonScenarioIds: (
    leftScenarioId: ScenarioId,
    rightScenarioId: ScenarioId,
  ) => void;
  generateBoardBrief: () => ExecutiveReportPackage;
  openPrintLayout: (mode: PrintableViewMode) => void;
  runMockExport: (format: ExportFormat) => ReportExportResult;
  exportScenarioComparison: () => ReportExportResult;
  selectReportPackage: (packageId: ReportPackageId) => void;
  setPrintableViewMode: (mode: PrintableViewMode) => void;
  setReportIntent: (intent: ReportExportIntent) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  toggleLayer: (layerId: string) => void;
  selectParcel: (
    parcelId: string,
    options?: { source?: ParcelSelectionSource },
  ) => void;
  setSelectedParcelIntelligence: (
    parcel: ParcelSearchRecord,
    source: SelectedParcelIntelligenceSource,
  ) => void;
  setMapError: (error: string | null) => void;
  setScenarioId: (scenarioId: ScenarioId) => void;
  setSimulationYear: (year: number) => void;
  setSimulationIntensity: (intensity: number) => void;
  setDashboardRoleId: (roleId: DashboardRoleId) => void;
  setDashboardViewMode: (viewMode: DashboardViewMode) => void;
  setMapStatus: (status: DashboardStatus) => void;
  restoreDefaultWorkspace: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const {
    activeLayerIds,
    activeLayers,
    isLayerActive,
    setActiveLayerIds,
    setLayerVisibility,
    toggleLayer,
  } = useLayerVisibility();
  const {
    clearMapError,
    mapError,
    mapStatus,
    setMapError,
    setMapStatus,
  } = useMapInteractionState();
  const {
    activeScenario,
    scenarioId,
    scenarioName,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
    simulationIntensity,
    simulationYear,
  } = useScenarioState();
  const {
    clearSelectedParcel,
    selectParcel,
    selectedParcel,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectedParcelSource,
    setSelectedParcelIntelligence,
  } = useSelectedParcel();
  const {
    activeWorkspacePreset,
    setDashboardViewMode,
    viewMode,
  } = useWorkspaceState();
  const {
    activeRole,
    roleId,
    setDashboardRoleId,
  } = useRoleState();
  const {
    activeComparison,
    briefingGenerationState,
    briefingMode,
    briefingSections,
    comparisonMetrics,
    comparisonPair,
    executiveBriefing,
    selectExecutiveNarrative,
    selectedExecutiveNarrative,
    selectedNarrativeId,
    setBriefingMode,
    setComparisonPair,
    setComparisonScenarioIds,
  } = useExecutiveBriefing();
  const {
    activeBriefingPacket,
    activeReportPackage,
    activeReportPackageId,
    exportHistory,
    exportJobState,
    exportProgress,
    exportScenarioComparison,
    generateBoardBrief,
    lastExportResult,
    openPrintLayout,
    printableViewMode,
    reportExportIntent,
    reportPackages,
    runMockExport,
    selectReportPackage,
    setPrintableViewMode,
    setReportIntent,
  } = useExecutiveReports();

  const workspaceControllerActions = useMemo(
    () => ({
      setActiveLayerIds,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      setViewMode: setDashboardViewMode,
    }),
    [
      setActiveLayerIds,
      setDashboardViewMode,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
    ],
  );

  const applyWorkspacePreset = useCallback(
    (nextViewMode: DashboardViewMode) => {
      applyWorkspacePresetToDashboard(nextViewMode, workspaceControllerActions);
    },
    [workspaceControllerActions],
  );

  const roleControllerActions = useMemo(
    () => ({
      setActiveLayerIds,
      setBriefingMode,
      setComparisonPair,
      selectReportPackage,
      setPrintableViewMode,
      setReportIntent,
      setRoleId: setDashboardRoleId,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      setViewMode: setDashboardViewMode,
    }),
    [
      setActiveLayerIds,
      setBriefingMode,
      setComparisonPair,
      selectReportPackage,
      setDashboardRoleId,
      setDashboardViewMode,
      setPrintableViewMode,
      setReportIntent,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
    ],
  );

  const applyRolePreset = useCallback(
    (nextRoleId: DashboardRoleId) => {
      applyRolePresetToDashboard(nextRoleId, roleControllerActions);
    },
    [roleControllerActions],
  );

  const restoreDefaultWorkspace = useCallback(
    () => {
      restoreDefaultWorkspacePreset(workspaceControllerActions);
    },
    [workspaceControllerActions],
  );

  const dashboardUrlState = useMemo(
    () =>
      createDashboardUrlState({
        activeLayerIds,
        activeReportPackageId,
        briefingMode,
        comparisonPair,
        printableViewMode,
        reportExportIntent,
        roleId,
        scenarioId,
        selectedParcelId,
        simulationIntensity,
        simulationYear,
        viewMode,
      }),
    [
      activeLayerIds,
      activeReportPackageId,
      briefingMode,
      comparisonPair,
      printableViewMode,
      reportExportIntent,
      roleId,
      scenarioId,
      selectedParcelId,
      simulationIntensity,
      simulationYear,
      viewMode,
    ],
  );
  const activeDashboardPanelIds = activeRole.defaultDashboardPanels;

  const value = useMemo(
    () => ({
      activeLayerIds,
      activeLayers,
      activeBriefingPacket,
      activeComparison,
      activeDashboardPanelIds,
      activeReportPackage,
      activeReportPackageId,
      activeRole,
      activeScenario,
      activeWorkspacePreset,
      applyRolePreset,
      applyWorkspacePreset,
      briefingGenerationState,
      briefingMode,
      briefingSections,
      clearMapError,
      clearSelectedParcel,
      comparisonMetrics,
      comparisonPair,
      dashboardUrlState,
      executiveBriefing,
      exportHistory,
      exportJobState,
      exportProgress,
      exportScenarioComparison,
      generateBoardBrief,
      isLayerActive,
      lastExportResult,
      mapError,
      mapStatus,
      openPrintLayout,
      printableViewMode,
      reportExportIntent,
      reportPackages,
      restoreDefaultWorkspace,
      roleId,
      runMockExport,
      scenarioId,
      scenarioName,
      selectExecutiveNarrative,
      selectParcel,
      selectReportPackage,
      selectedExecutiveNarrative,
      selectedNarrativeId,
      selectedParcel,
      selectedParcelId,
      selectedParcelIntelligence,
      selectedParcelIntelligenceSource,
      selectedParcelSource,
      setActiveLayerIds,
      setBriefingMode,
      setComparisonPair,
      setComparisonScenarioIds,
      setDashboardRoleId,
      setDashboardViewMode,
      setLayerVisibility,
      setMapError,
      setMapStatus,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setReportIntent,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      simulationIntensity,
      simulationYear,
      toggleLayer,
      viewMode,
    }),
    [
      activeLayerIds,
      activeLayers,
      activeBriefingPacket,
      activeComparison,
      activeDashboardPanelIds,
      activeReportPackage,
      activeReportPackageId,
      activeRole,
      activeScenario,
      activeWorkspacePreset,
      applyRolePreset,
      applyWorkspacePreset,
      briefingGenerationState,
      briefingMode,
      briefingSections,
      clearMapError,
      clearSelectedParcel,
      comparisonMetrics,
      comparisonPair,
      dashboardUrlState,
      executiveBriefing,
      exportHistory,
      exportJobState,
      exportProgress,
      exportScenarioComparison,
      generateBoardBrief,
      isLayerActive,
      lastExportResult,
      mapError,
      mapStatus,
      openPrintLayout,
      printableViewMode,
      reportExportIntent,
      reportPackages,
      restoreDefaultWorkspace,
      roleId,
      runMockExport,
      scenarioId,
      scenarioName,
      selectExecutiveNarrative,
      selectParcel,
      selectReportPackage,
      selectedExecutiveNarrative,
      selectedNarrativeId,
      selectedParcel,
      selectedParcelId,
      selectedParcelIntelligence,
      selectedParcelIntelligenceSource,
      selectedParcelSource,
      setActiveLayerIds,
      setBriefingMode,
      setComparisonPair,
      setComparisonScenarioIds,
      setDashboardRoleId,
      setDashboardViewMode,
      setLayerVisibility,
      setMapError,
      setMapStatus,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setReportIntent,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      simulationIntensity,
      simulationYear,
      toggleLayer,
      viewMode,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardState() {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error("useDashboardState must be used within DashboardProvider");
  }

  return context;
}
