"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useExecutiveBriefing,
  type BriefingGenerationState,
} from "@/hooks/useExecutiveBriefing";
import { useDevelopmentHotspotLayer } from "@/hooks/useDevelopmentHotspotLayer";
import { useExecutiveReports } from "@/hooks/useExecutiveReports";
import { useFloodConstraintLayer } from "@/hooks/useFloodConstraintLayer";
import { useFloodZoneLayer } from "@/hooks/useFloodZoneLayer";
import { useLayerVisibility } from "@/hooks/useLayerVisibility";
import { useMapInteractionState } from "@/hooks/useMapInteractionState";
import { useRoleState } from "@/hooks/useRoleState";
import { useScenarioState } from "@/hooks/useScenarioState";
import { useSchoolUtilizationZoneLayer } from "@/hooks/useSchoolUtilizationZoneLayer";
import {
  useSelectedParcel,
  type SelectedParcelIntelligenceSource,
} from "@/hooks/useSelectedParcel";
import {
  useTemporalAnalysisState,
  type TemporalAnalysisState,
} from "@/hooks/useTemporalAnalysisState";
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
  ProductMode,
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
import {
  defaultDevelopmentHotspotControls,
  type DevelopmentHotspotControls,
  type DevelopmentHotspotLayerState,
} from "@/types/map/developmentHotspots";
import type { FloodConstraintLayerState } from "@/types/map/floodConstraints";
import {
  defaultFloodZoneControls,
  type FloodZoneControls,
  type FloodZoneExtent,
  type FloodZoneLayerState,
} from "@/types/map/floodZones";
import {
  defaultSchoolUtilizationZoneControls,
  type SelectedSchoolUtilizationZone,
  type SchoolUtilizationZoneControls,
  type SchoolUtilizationZoneLayerState,
} from "@/types/map/schoolUtilizationZones";

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
  developmentHotspotControls: DevelopmentHotspotControls;
  developmentHotspotLayer: DevelopmentHotspotLayerState;
  developmentHotspotsEnabled: boolean;
  floodConstraintLayer: FloodConstraintLayerState;
  floodConstraintsEnabled: boolean;
  floodZoneControls: FloodZoneControls;
  floodZoneLayer: FloodZoneLayerState;
  floodZonesEnabled: boolean;
  schoolUtilizationZoneControls: SchoolUtilizationZoneControls;
  schoolUtilizationZoneLayer: SchoolUtilizationZoneLayerState;
  schoolUtilizationZonesEnabled: boolean;
  selectedSchoolUtilizationZone: SelectedSchoolUtilizationZone | null;
  executiveBriefing: ExecutiveBriefing;
  exportHistory: MockExportHistoryItem[];
  exportJobState: ExportJobState;
  exportProgress: number;
  isMapFocusMode: boolean;
  lastExportResult: ReportExportResult | null;
  mapError: string | null;
  printableViewMode: PrintableViewMode;
  productMode: ProductMode;
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
  clearSelectedSchoolUtilizationZone: () => void;
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
  setProductMode: (mode: ProductMode) => void;
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
  setDevelopmentHotspotControls: (
    controls: DevelopmentHotspotControls,
  ) => void;
  setDevelopmentHotspotsEnabled: (enabled: boolean) => void;
  setFloodConstraintsEnabled: (enabled: boolean) => void;
  setFloodZoneControls: (controls: FloodZoneControls) => void;
  setFloodZonesEnabled: (enabled: boolean) => void;
  setFloodZoneViewExtent: (extent: FloodZoneExtent | null) => void;
  setSchoolUtilizationZoneControls: (
    controls: SchoolUtilizationZoneControls,
  ) => void;
  setSchoolUtilizationZonesEnabled: (enabled: boolean) => void;
  setSelectedSchoolUtilizationZone: (
    zone: SelectedSchoolUtilizationZone | null,
  ) => void;
  setMapFocusMode: (enabled: boolean) => void;
  setMapStatus: (status: DashboardStatus) => void;
  restoreDefaultWorkspace: () => void;
  temporalAnalysisState: TemporalAnalysisState;
  toggleMapFocusMode: () => void;
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
  const [developmentHotspotControls, setDevelopmentHotspotControls] =
    useState<DevelopmentHotspotControls>(defaultDevelopmentHotspotControls);
  const [developmentHotspotsEnabled, setDevelopmentHotspotsEnabled] =
    useState(false);
  const [floodConstraintsEnabled, setFloodConstraintsEnabled] = useState(false);
  const [floodZoneControls, setFloodZoneControls] =
    useState<FloodZoneControls>(defaultFloodZoneControls);
  const [floodZonesEnabled, setFloodZonesEnabled] = useState(false);
  const [floodZoneViewExtent, setFloodZoneViewExtent] =
    useState<FloodZoneExtent | null>(null);
  const [
    schoolUtilizationZoneControls,
    setSchoolUtilizationZoneControls,
  ] = useState<SchoolUtilizationZoneControls>(
    defaultSchoolUtilizationZoneControls,
  );
  const [
    schoolUtilizationZonesEnabled,
    setSchoolUtilizationZonesEnabled,
  ] = useState(false);
  const [
    selectedSchoolUtilizationZone,
    setSelectedSchoolUtilizationZone,
  ] = useState<SelectedSchoolUtilizationZone | null>(null);
  const [productMode, setProductMode] = useState<ProductMode>("overview");
  const [isMapFocusMode, setMapFocusMode] = useState(false);
  const temporalAnalysisState = useTemporalAnalysisState();
  const developmentHotspotLayer = useDevelopmentHotspotLayer({
    activityClass: developmentHotspotControls.activityClass,
    enabled: developmentHotspotsEnabled,
    growthSignal: developmentHotspotControls.growthSignal,
    limit: developmentHotspotControls.limit,
    permitSegment: developmentHotspotControls.permitSegment,
    recentWindow:
      developmentHotspotControls.recentWindow === "all"
        ? undefined
        : Number(developmentHotspotControls.recentWindow) === 1
          ? 1
          : 3,
    sortBy: developmentHotspotControls.sortBy,
    statusStage: developmentHotspotControls.statusStage,
    temporalFilters: temporalAnalysisState.temporalFilters,
    valueClass: developmentHotspotControls.valueClass,
    zoningJurisdiction: developmentHotspotControls.zoningJurisdiction || undefined,
  });
  const floodConstraintLayer = useFloodConstraintLayer({
    enabled: floodConstraintsEnabled,
    limit: 100,
  });
  const floodZoneLayer = useFloodZoneLayer({
    enabled: floodZonesEnabled,
    extent: floodZoneViewExtent,
    limitMode: floodZoneControls.limitMode,
    severity: floodZoneControls.severity,
  });
  const schoolUtilizationZoneLayer = useSchoolUtilizationZoneLayer({
    enabled: schoolUtilizationZonesEnabled,
    level: schoolUtilizationZoneControls.level,
    limit: schoolUtilizationZoneControls.limit,
    utilizationClass: schoolUtilizationZoneControls.utilizationClass,
  });
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

  const toggleMapFocusMode = useCallback(() => {
    setMapFocusMode((enabled) => !enabled);
  }, []);

  const clearSelectedSchoolUtilizationZone = useCallback(() => {
    setSelectedSchoolUtilizationZone(null);
  }, []);

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
      clearSelectedSchoolUtilizationZone,
      comparisonMetrics,
      comparisonPair,
      dashboardUrlState,
      developmentHotspotControls,
      developmentHotspotLayer,
      developmentHotspotsEnabled,
      executiveBriefing,
      floodConstraintLayer,
      floodConstraintsEnabled,
      floodZoneControls,
      floodZoneLayer,
      floodZonesEnabled,
      schoolUtilizationZoneControls,
      schoolUtilizationZoneLayer,
      schoolUtilizationZonesEnabled,
      selectedSchoolUtilizationZone,
      exportHistory,
      exportJobState,
      exportProgress,
      exportScenarioComparison,
      generateBoardBrief,
      isMapFocusMode,
      isLayerActive,
      lastExportResult,
      mapError,
      mapStatus,
      openPrintLayout,
      printableViewMode,
      productMode,
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
      setDevelopmentHotspotControls,
      setDevelopmentHotspotsEnabled,
      setFloodConstraintsEnabled,
      setFloodZoneControls,
      setFloodZonesEnabled,
      setFloodZoneViewExtent,
      setSchoolUtilizationZoneControls,
      setSchoolUtilizationZonesEnabled,
      setSelectedSchoolUtilizationZone,
      setLayerVisibility,
      setMapError,
      setMapFocusMode,
      setMapStatus,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setProductMode,
      setReportIntent,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      temporalAnalysisState,
      simulationIntensity,
      simulationYear,
      toggleLayer,
      toggleMapFocusMode,
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
      clearSelectedSchoolUtilizationZone,
      comparisonMetrics,
      comparisonPair,
      dashboardUrlState,
      developmentHotspotControls,
      developmentHotspotLayer,
      developmentHotspotsEnabled,
      executiveBriefing,
      floodConstraintLayer,
      floodConstraintsEnabled,
      floodZoneControls,
      floodZoneLayer,
      floodZonesEnabled,
      schoolUtilizationZoneControls,
      schoolUtilizationZoneLayer,
      schoolUtilizationZonesEnabled,
      selectedSchoolUtilizationZone,
      exportHistory,
      exportJobState,
      exportProgress,
      exportScenarioComparison,
      generateBoardBrief,
      isMapFocusMode,
      isLayerActive,
      lastExportResult,
      mapError,
      mapStatus,
      openPrintLayout,
      printableViewMode,
      productMode,
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
      setDevelopmentHotspotControls,
      setDevelopmentHotspotsEnabled,
      setFloodConstraintsEnabled,
      setFloodZoneControls,
      setFloodZonesEnabled,
      setFloodZoneViewExtent,
      setSchoolUtilizationZoneControls,
      setSchoolUtilizationZonesEnabled,
      setSelectedSchoolUtilizationZone,
      setLayerVisibility,
      setMapError,
      setMapFocusMode,
      setMapStatus,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setProductMode,
      setReportIntent,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      temporalAnalysisState,
      simulationIntensity,
      simulationYear,
      toggleLayer,
      toggleMapFocusMode,
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
