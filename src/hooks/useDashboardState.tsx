"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  usePlanningSnapshotLibrary,
  type PlanningSnapshotPersistenceState,
} from "@/hooks/usePlanningSnapshotLibrary";
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
import { USE_DEMO_DATA } from "@/lib/api/client";
import { isExploreCountywideMode } from "@/lib/gis/layerModeOwnership";
import { dispatchParcelMapRefocusRequest } from "@/lib/map/parcelMapFocus";
import { defaultIndicatorCenterGroupIds } from "@/data/intelligence/indicatorCenter";
import type {
  CfsAppMode,
  DashboardStatus,
  EconomicsSection,
  IndicatorCenterDisplayMode,
  IndicatorCenterGroupId,
  IndicatorCenterContext,
  ModelResearchMapSummary,
  ModelResearchOverlayDisplay,
  OperationalLayer,
  OverviewCommandMode,
  OverviewCommandCenterState,
  OverviewLayoutPreference,
  OverviewPanelVisibility,
  OverviewPanelWidthPreset,
  ParcelSelectionSource,
  ParcelSummary,
  ParcelReviewView,
  PlanningReviewFocusMode,
  PlanningSnapshot,
  PlanningSnapshotSectionKey,
  PlanningSnapshotView,
  ProductMode,
  ScenarioHorizon,
  ScenarioId,
} from "@/types";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";
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
import type { MapOverlayViewMode } from "@/types/map/overlayViewModes";
import {
  defaultDevelopmentHotspotControls,
  type DevelopmentHotspotControls,
  type DevelopmentHotspotLayerState,
  type SelectedDevelopmentHotspotContext,
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
  cfsAppMode: CfsAppMode | null;
  economicsSection: EconomicsSection;
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
  modelResearchOverlayDisplay: ModelResearchOverlayDisplay;
  modelResearchOverlayEnabled: boolean;
  modelResearchViewMode: MapOverlayViewMode;
  modelResearchMapSummary: ModelResearchMapSummary;
  overviewCommandMode: OverviewCommandMode;
  overviewLayout: OverviewLayoutPreference;
  indicatorCenterDisplayMode: IndicatorCenterDisplayMode;
  selectedIndicatorCenterGroupIds: IndicatorCenterGroupId[];
  selectedModelResearchContext: ModelResearchPreviewMarker | null;
  selectedDevelopmentHotspotContext: SelectedDevelopmentHotspotContext | null;
  selectedIndicatorCenterContext: IndicatorCenterContext | null;
  printableViewMode: PrintableViewMode;
  parcelReviewView: ParcelReviewView;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  activePlanningSnapshotId: string | null;
  planningSnapshotCanWrite: boolean;
  planningSnapshotHasUnsavedChanges: boolean;
  planningSnapshotLegacyNotice: string | null;
  planningSnapshotPersistence: PlanningSnapshotPersistenceState;
  planningSnapshotView: PlanningSnapshotView;
  planningReviewFocusMode: PlanningReviewFocusMode;
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
  clearParcelSelectionContext: () => void;
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
  setParcelReviewView: (view: ParcelReviewView) => void;
  setPlanningSnapshotView: (view: PlanningSnapshotView) => void;
  setPlanningReviewFocusMode: (mode: PlanningReviewFocusMode) => void;
  savePlanningSnapshot: (
    snapshot: PlanningSnapshot,
  ) => Promise<PlanningSnapshot | null>;
  setActivePlanningSnapshot: (snapshotId: string) => void;
  deletePlanningSnapshot: (snapshotId: string) => Promise<boolean>;
  renamePlanningSnapshot: (snapshotId: string, snapshotTitle: string) => void;
  clearPlanningSnapshot: () => Promise<void>;
  clearPlanningSnapshots: () => void;
  createPlanningSnapshotVersion: () => Promise<PlanningSnapshot | null>;
  reloadActivePlanningSnapshot: () => void;
  reloadPlanningSnapshots: () => void;
  retryPlanningSnapshotSave: () => Promise<PlanningSnapshot | null>;
  savePlanningSnapshotChanges: () => Promise<PlanningSnapshot | null>;
  setPlanningSnapshotNotes: (notes: string) => void;
  setPlanningSnapshotSectionIncluded: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
  setProductMode: (mode: ProductMode) => void;
  setCfsAppMode: (mode: CfsAppMode | null) => void;
  setEconomicsSection: (section: EconomicsSection) => void;
  setReportIntent: (intent: ReportExportIntent) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  toggleLayer: (layerId: string) => void;
  setModelResearchOverlayDisplay: (
    display: ModelResearchOverlayDisplay,
  ) => void;
  setModelResearchOverlayEnabled: (enabled: boolean) => void;
  setModelResearchViewMode: (mode: MapOverlayViewMode) => void;
  setModelResearchMapSummary: (summary: ModelResearchMapSummary) => void;
  setOverviewCommandMode: (mode: OverviewCommandMode) => void;
  setOverviewLayoutCommandCenter: (
    state: OverviewCommandCenterState,
  ) => void;
  setOverviewLayoutPanel: (
    panel: "left" | "right",
    visibility: OverviewPanelVisibility,
  ) => void;
  setSelectedModelResearchContext: (
    context: ModelResearchPreviewMarker | null,
  ) => void;
  setSelectedDevelopmentHotspotContext: (
    context: SelectedDevelopmentHotspotContext | null,
  ) => void;
  setSelectedIndicatorCenterContext: (
    context: IndicatorCenterContext | null,
  ) => void;
  setIndicatorCenterDisplayMode: (
    mode: IndicatorCenterDisplayMode,
  ) => void;
  setSelectedIndicatorCenterGroupIds: (
    groupIds: IndicatorCenterGroupId[],
  ) => void;
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
const CFS_APP_MODE_STORAGE_KEY = "cfs.appMode.v1";
const LEGACY_OVERVIEW_LAYOUT_STORAGE_KEYS = [
  "cfs.overview.layout.v2",
  "cfs.overview.layout.v1",
  "cfs.overview.customLayout.v2",
  "cfs.overview.customLayout.v1",
];

function isCfsAppMode(value: unknown): value is CfsAppMode {
  return (
    value === "planning" ||
    value === "economics" ||
    value === "master-data"
  );
}

function writeStoredCfsAppMode(mode: CfsAppMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CFS_APP_MODE_STORAGE_KEY, mode);
  } catch {
    // Local storage can be unavailable in hardened browser contexts.
  }
}

const defaultOverviewLayout: OverviewLayoutPreference = {
  commandCenter: "visible",
  leftPanel: "collapsed",
  leftPanelWidth: "standard",
  rightPanel: "visible",
  rightPanelWidth: "standard",
};

const defaultModelResearchMapSummary: ModelResearchMapSummary = {
  displayMode: "off",
  displayModeLabel: "Overlay off",
  dominantSignalLabel: "No overlay visible",
  overlayEnabled: false,
  totalFeatureCount: 0,
  viewScaleLabel: "Map view",
  visibleFeatureCount: 0,
};

function isOverviewPanelVisibility(
  value: unknown,
): value is OverviewPanelVisibility {
  return value === "collapsed" || value === "hidden" || value === "visible";
}

function isOverviewRightPanelVisibility(
  value: unknown,
): value is OverviewLayoutPreference["rightPanel"] {
  return value === "hidden" || value === "visible";
}

function isOverviewCommandCenterState(
  value: unknown,
): value is OverviewCommandCenterState {
  return value === "compact" || value === "hidden" || value === "visible";
}

function isOverviewPanelWidthPreset(
  value: unknown,
): value is OverviewPanelWidthPreset {
  return value === "compact" || value === "standard" || value === "wide";
}

function normalizeOverviewLayoutPreference(
  value: Partial<OverviewLayoutPreference> | null | undefined,
): OverviewLayoutPreference {
  return {
    commandCenter: isOverviewCommandCenterState(value?.commandCenter)
      ? value.commandCenter
      : defaultOverviewLayout.commandCenter,
    leftPanel: isOverviewPanelVisibility(value?.leftPanel)
      ? value.leftPanel
      : defaultOverviewLayout.leftPanel,
    leftPanelWidth: isOverviewPanelWidthPreset(value?.leftPanelWidth)
      ? value.leftPanelWidth
      : defaultOverviewLayout.leftPanelWidth,
    rightPanel: isOverviewRightPanelVisibility(value?.rightPanel)
      ? value.rightPanel
      : defaultOverviewLayout.rightPanel,
    rightPanelWidth: isOverviewPanelWidthPreset(value?.rightPanelWidth)
      ? value.rightPanelWidth
      : defaultOverviewLayout.rightPanelWidth,
  };
}

function clearLegacyOverviewLayoutStorage() {
  if (typeof window === "undefined") {
    return;
  }

  for (const storageKey of LEGACY_OVERVIEW_LAYOUT_STORAGE_KEYS) {
    window.localStorage.removeItem(storageKey);
  }
}

export function DashboardProvider({ children, initialAppMode }: { children: ReactNode; initialAppMode?: CfsAppMode }) {
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
  const [productMode, setProductMode] = useState<ProductMode>("workspace");
  const [economicsSection, setEconomicsSection] =
    useState<EconomicsSection>("dashboard");
  const [overviewCommandMode, setOverviewCommandModeState] =
    useState<OverviewCommandMode>("countywide");
  const overviewCommandModeRef = useRef<OverviewCommandMode>("countywide");
  const [overviewLayout, setOverviewLayout] =
    useState<OverviewLayoutPreference>(defaultOverviewLayout);
  const [
    modelResearchOverlayDisplay,
    setModelResearchOverlayDisplay,
  ] = useState<ModelResearchOverlayDisplay>("research_signal_hotspots");
  const [
    modelResearchOverlayEnabled,
    setModelResearchOverlayEnabled,
  ] = useState(USE_DEMO_DATA);
  const [modelResearchViewMode, setModelResearchViewMode] =
    useState<MapOverlayViewMode>("clusters");
  const [
    modelResearchMapSummary,
    setModelResearchMapSummary,
  ] = useState<ModelResearchMapSummary>(defaultModelResearchMapSummary);
  const [
    selectedModelResearchContext,
    setSelectedModelResearchContext,
  ] = useState<ModelResearchPreviewMarker | null>(null);
  const [
    selectedDevelopmentHotspotContext,
    setSelectedDevelopmentHotspotContext,
  ] = useState<SelectedDevelopmentHotspotContext | null>(null);
  const [
    selectedIndicatorCenterContext,
    setSelectedIndicatorCenterContext,
  ] = useState<IndicatorCenterContext | null>(null);
  const [cfsAppMode, setCfsAppModeState] = useState<CfsAppMode | null>(
    initialAppMode ?? null,
  );
  const [
    indicatorCenterDisplayMode,
    setIndicatorCenterDisplayMode,
  ] = useState<IndicatorCenterDisplayMode>("all");
  const [
    selectedIndicatorCenterGroupIds,
    setSelectedIndicatorCenterGroupIds,
  ] = useState<IndicatorCenterGroupId[]>(defaultIndicatorCenterGroupIds);
  const [parcelReviewView, setParcelReviewView] =
    useState<ParcelReviewView>("review");
  const {
    activePlanningSnapshotId,
    clearPlanningSnapshot,
    clearPlanningSnapshots,
    createPlanningSnapshotVersion,
    deletePlanningSnapshot,
    planningSnapshot,
    planningSnapshotCanWrite,
    planningSnapshotHasUnsavedChanges,
    planningSnapshotLegacyNotice,
    planningSnapshotPersistence,
    reloadActivePlanningSnapshot,
    reloadPlanningSnapshots,
    renamePlanningSnapshot,
    retryPlanningSnapshotSave,
    savePlanningSnapshot,
    savePlanningSnapshotChanges,
    savedPlanningSnapshots,
    setActivePlanningSnapshot,
    setPlanningSnapshotNotes,
    setPlanningSnapshotSectionIncluded,
  } = usePlanningSnapshotLibrary();
  const [planningSnapshotView, setPlanningSnapshotView] =
    useState<PlanningSnapshotView>("overview");
  const [planningReviewFocusMode, setPlanningReviewFocusMode] =
    useState<PlanningReviewFocusMode>("development_activity");
  const [isMapFocusMode, setMapFocusModeState] = useState(false);
  const temporalAnalysisState = useTemporalAnalysisState();
  const exploreCountywideLayersActive =
    isExploreCountywideMode(overviewCommandMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncAppModeFromUrl = () => {
      try {
        const appMode = new URLSearchParams(window.location.search).get("app");
        const nextMode = isCfsAppMode(appMode) ? appMode : null;
        setCfsAppModeState(nextMode);
        if (nextMode === "planning") {
          setProductMode("workspace");
        } else if (nextMode === "economics") {
          setEconomicsSection("dashboard");
        }
      } catch {
        return;
      }
    };
    syncAppModeFromUrl();
    window.addEventListener("popstate", syncAppModeFromUrl);
    window.addEventListener("pageshow", syncAppModeFromUrl);
    return () => {
      window.removeEventListener("popstate", syncAppModeFromUrl);
      window.removeEventListener("pageshow", syncAppModeFromUrl);
    };
  }, []);
  const developmentHotspotLayer = useDevelopmentHotspotLayer({
    activityClass: developmentHotspotControls.activityClass,
    enabled: developmentHotspotsEnabled && exploreCountywideLayersActive,
    growthSignal: developmentHotspotControls.growthSignal,
    limit: developmentHotspotControls.limit,
    permitYearEnd: developmentHotspotControls.permitYearEnd,
    permitYearStart: developmentHotspotControls.permitYearStart,
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
    enabled: floodConstraintsEnabled && exploreCountywideLayersActive,
    limit: 100,
  });
  const floodZoneLayer = useFloodZoneLayer({
    enabled: floodZonesEnabled && exploreCountywideLayersActive,
    extent: floodZoneViewExtent,
    limitMode: floodZoneControls.limitMode,
    severity: floodZoneControls.severity,
  });
  const schoolUtilizationZoneLayer = useSchoolUtilizationZoneLayer({
    enabled: schoolUtilizationZonesEnabled && exploreCountywideLayersActive,
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
    selectParcel: selectParcelState,
    selectedParcel,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectedParcelSource,
    setSelectedParcelIntelligence: setSelectedParcelIntelligenceState,
  } = useSelectedParcel();

  const clearParcelSelectionContext = useCallback(() => {
    clearSelectedParcel();
  }, [clearSelectedParcel]);

  const selectParcel = useCallback(
    (
      parcelId: string,
      options?: { source?: ParcelSelectionSource },
    ) => {
      selectParcelState(parcelId, options);
    },
    [selectParcelState],
  );

  const setSelectedParcelIntelligence = useCallback(
    (
      parcel: ParcelSearchRecord,
      source: SelectedParcelIntelligenceSource,
    ) => {
      setSelectedParcelIntelligenceState(parcel, source);
    },
    [setSelectedParcelIntelligenceState],
  );

  const setMapFocusMode = useCallback(
    (enabled: boolean) => {
      setMapFocusModeState(enabled);
      if (enabled && selectedParcelId) {
        window.requestAnimationFrame(dispatchParcelMapRefocusRequest);
      }
    },
    [selectedParcelId],
  );

  const setOverviewCommandMode = useCallback(
    (mode: OverviewCommandMode) => {
      overviewCommandModeRef.current = mode;

      if (mode !== "countywide") {
        setSelectedDevelopmentHotspotContext(null);
        setSelectedSchoolUtilizationZone(null);
      }

      if (mode !== "modelLab") {
        setSelectedModelResearchContext(null);
      }

      if (mode !== "indicatorCenter") {
        setSelectedIndicatorCenterContext(null);
      }

      setOverviewCommandModeState(mode);
    },
    [],
  );

  const setCfsAppMode = useCallback((mode: CfsAppMode | null) => {
    setCfsAppModeState(mode);
    if (mode) {
      writeStoredCfsAppMode(mode);
    }
    setEconomicsSection("dashboard");
    setProductMode("workspace");
    setSelectedDevelopmentHotspotContext(null);
    setSelectedModelResearchContext(null);
    setSelectedIndicatorCenterContext(null);
  }, []);
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
    setMapFocusModeState((enabled) => !enabled);
  }, []);

  useEffect(() => {
    clearLegacyOverviewLayoutStorage();
  }, []);

  const updateOverviewLayoutPreference = useCallback(
    (
      updater: (
        currentLayout: OverviewLayoutPreference,
      ) => OverviewLayoutPreference,
    ) => {
      setOverviewLayout((currentLayout) => {
        const normalizedLayout = normalizeOverviewLayoutPreference(
          updater(currentLayout),
        );
        return normalizedLayout;
      });
    },
    [],
  );

  const setOverviewLayoutCommandCenter = useCallback(
    (state: OverviewCommandCenterState) => {
      updateOverviewLayoutPreference((currentLayout) => ({
        ...currentLayout,
        commandCenter: state,
      }));
    },
    [updateOverviewLayoutPreference],
  );

  const setOverviewLayoutPanel = useCallback(
    (panel: "left" | "right", visibility: OverviewPanelVisibility) => {
      updateOverviewLayoutPreference((currentLayout) => ({
        ...currentLayout,
        ...(panel === "left"
          ? { leftPanel: visibility }
          : {
              rightPanel:
                visibility === "collapsed" ? "hidden" : visibility,
            }),
      }));
    },
    [updateOverviewLayoutPreference],
  );

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
      cfsAppMode,
      economicsSection,
      clearMapError,
      clearParcelSelectionContext,
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
      indicatorCenterDisplayMode,
      modelResearchOverlayDisplay,
      modelResearchOverlayEnabled,
      modelResearchViewMode,
      modelResearchMapSummary,
      openPrintLayout,
      overviewCommandMode,
      overviewLayout,
      printableViewMode,
      parcelReviewView,
      planningSnapshot,
      savedPlanningSnapshots,
      activePlanningSnapshotId,
      planningSnapshotCanWrite,
      planningSnapshotHasUnsavedChanges,
      planningSnapshotLegacyNotice,
      planningSnapshotPersistence,
      planningSnapshotView,
      planningReviewFocusMode,
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
      selectedIndicatorCenterGroupIds,
      selectedModelResearchContext,
      selectedDevelopmentHotspotContext,
      selectedIndicatorCenterContext,
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
      setModelResearchOverlayDisplay,
      setModelResearchOverlayEnabled,
      setModelResearchViewMode,
      setModelResearchMapSummary,
      setOverviewCommandMode,
      setOverviewLayoutCommandCenter,
      setOverviewLayoutPanel,
      setIndicatorCenterDisplayMode,
      setSelectedModelResearchContext,
      setSelectedDevelopmentHotspotContext,
      setSelectedIndicatorCenterGroupIds,
      setSelectedIndicatorCenterContext,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setParcelReviewView,
      setPlanningSnapshotView,
      setPlanningReviewFocusMode,
      savePlanningSnapshot,
      setCfsAppMode,
      setEconomicsSection,
      setActivePlanningSnapshot,
      deletePlanningSnapshot,
      renamePlanningSnapshot,
      clearPlanningSnapshot,
      clearPlanningSnapshots,
      createPlanningSnapshotVersion,
      reloadActivePlanningSnapshot,
      reloadPlanningSnapshots,
      retryPlanningSnapshotSave,
      savePlanningSnapshotChanges,
      setPlanningSnapshotNotes,
      setPlanningSnapshotSectionIncluded,
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
      cfsAppMode,
      economicsSection,
      clearMapError,
      clearParcelSelectionContext,
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
      indicatorCenterDisplayMode,
      modelResearchOverlayDisplay,
      modelResearchOverlayEnabled,
      modelResearchViewMode,
      modelResearchMapSummary,
      openPrintLayout,
      overviewCommandMode,
      overviewLayout,
      printableViewMode,
      parcelReviewView,
      planningSnapshot,
      savedPlanningSnapshots,
      activePlanningSnapshotId,
      planningSnapshotCanWrite,
      planningSnapshotHasUnsavedChanges,
      planningSnapshotLegacyNotice,
      planningSnapshotPersistence,
      planningSnapshotView,
      planningReviewFocusMode,
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
      selectedIndicatorCenterGroupIds,
      selectedModelResearchContext,
      selectedDevelopmentHotspotContext,
      selectedIndicatorCenterContext,
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
      setModelResearchOverlayDisplay,
      setModelResearchOverlayEnabled,
      setModelResearchMapSummary,
      setOverviewCommandMode,
      setOverviewLayoutCommandCenter,
      setOverviewLayoutPanel,
      setIndicatorCenterDisplayMode,
      setSelectedModelResearchContext,
      setSelectedDevelopmentHotspotContext,
      setSelectedIndicatorCenterGroupIds,
      setSelectedIndicatorCenterContext,
      setSelectedParcelIntelligence,
      setPrintableViewMode,
      setParcelReviewView,
      setPlanningSnapshotView,
      setPlanningReviewFocusMode,
      savePlanningSnapshot,
      setCfsAppMode,
      setEconomicsSection,
      setActivePlanningSnapshot,
      deletePlanningSnapshot,
      renamePlanningSnapshot,
      clearPlanningSnapshot,
      clearPlanningSnapshots,
      createPlanningSnapshotVersion,
      reloadActivePlanningSnapshot,
      reloadPlanningSnapshots,
      retryPlanningSnapshotSave,
      savePlanningSnapshotChanges,
      setPlanningSnapshotNotes,
      setPlanningSnapshotSectionIncluded,
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
