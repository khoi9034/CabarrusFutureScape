"use client";

import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  BarChart3,
  ChevronDown,
  Copy,
  Crosshair,
  Database,
  FileSearch,
  FlaskConical,
  MapPin,
  Monitor,
  Save,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DataRegistryPanel } from "@/components/dashboard/DataRegistryPanel";
import { DueDiligenceReview } from "@/components/dashboard/DueDiligenceReview";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { GISIntegrationReadinessPanel } from "@/components/dashboard/GISIntegrationReadinessPanel";
import {
  buildIndicatorCenterSummaryCards,
  toIndicatorCenterSnapshotSummaries,
  type IndicatorCenterSummaryCard,
} from "@/components/dashboard/IndicatorCenterWorkspace";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioControls } from "@/components/dashboard/ScenarioControls";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { SchoolConstraintSummaryPanel } from "@/components/dashboard/SchoolConstraintSummaryPanel";
import { TemporalAnalysisPanel } from "@/components/dashboard/TemporalAnalysisPanel";
import {
  CFS_OPEN_LAYER_RAIL_EVENT,
  CFS_OPEN_MODEL_LAB_EVENT,
  CFS_PLANNING_SNAPSHOT_SAVED_EVENT,
  CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
} from "@/components/dashboard/OverviewCommandCenter";
import {
  developmentModelLabSummary,
  formatModelResearchDriverLabel,
  formatRelativeDevelopmentSignalBand,
  futureModelLabPlaceholders,
  getModelResearchDriverExplanation,
  modelResearchLegendLabels,
} from "@/data/intelligence/developmentModelLab";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import {
  buildIndicatorCenterHeadlineMetrics,
  buildIndicatorCenterReviewThemes,
  filterIndicatorCenterDefinitions,
  getIndicatorCenterDisplayModeLabel,
  indicatorCenterDefinitions,
} from "@/data/intelligence/indicatorCenter";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
} from "@/data/intelligence/parcelDashboardMetrics";
import { scoreSignals } from "@/data/mock/dashboardMockData";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useParcelDashboardMetrics } from "@/hooks/useParcelDashboardMetrics";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { useSelectedParcelSchoolConstraint } from "@/hooks/useSelectedParcelSchoolConstraint";
import { useTransportationContextSummary } from "@/hooks/useTransportationContextSummary";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import {
  getModeScopedActiveLayers,
  isExploreCountywideMode,
  isModelLabMode,
} from "@/lib/gis/layerModeOwnership";
import { cn, formatCurrency } from "@/lib/utils";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { formatMapOverlayViewMode } from "@/types/map/overlayViewModes";
import type {
  PlanningSnapshot,
  PlanningReviewFocusMode,
  PlanningSnapshotSectionKey,
  PlanningSnapshotDevelopmentActivityContext,
  IndicatorCenterDisplayMode,
  IndicatorCenterGroupId,
  IndicatorCenterContext,
  PlanningSnapshotIndicatorSummary,
  PlanningSnapshotIndicatorCenterContext,
  ProductMode,
  ModelResearchMapSummary,
  OverviewCommandMode,
} from "@/types";
import type { SelectedDevelopmentHotspotContext } from "@/types/map/developmentHotspots";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";
import type { SelectedSchoolUtilizationZone } from "@/types/map/schoolUtilizationZones";

const showDeveloperSections =
  process.env.NEXT_PUBLIC_CFS_DEVELOPER_MODE === "true";

const modeMetadata: Record<
  ProductMode,
  {
    description: string;
    icon: LucideIcon;
    label: string;
  }
> = {
  due_diligence: {
    description: "Saved planning context, explanations, and executive summary.",
    icon: FileSearch,
    label: "Planning Snapshot",
  },
  executive_print: {
    description: "Report preview is generated from the selected parcel review.",
    icon: Monitor,
    label: "Planning Snapshot",
  },
  methodology: {
    description: "Data sources, assumptions, limitations, and model foundation.",
    icon: BookOpen,
    label: "Methodology",
  },
  overview: {
    description: "Cabarrus FutureScape introduction and safe-use overview.",
    icon: BrainCircuit,
    label: "Overview",
  },
  workspace: {
    description: "Map exploration, global parcel search, live layers, and headline intelligence.",
    icon: BrainCircuit,
    label: "Workspace",
  },
};

export function IntelligencePanel() {
  const {
    activeLayers,
    developmentHotspotControls,
    developmentHotspotsEnabled,
    floodConstraintsEnabled,
    floodZonesEnabled,
    indicatorCenterDisplayMode,
    modelResearchOverlayEnabled,
    modelResearchViewMode,
    modelResearchMapSummary,
    overviewCommandMode,
    productMode,
    parcelReviewView,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectedDevelopmentHotspotContext,
    selectedIndicatorCenterGroupIds,
    selectedIndicatorCenterContext,
    selectedModelResearchContext,
    selectedSchoolUtilizationZone,
    planningSnapshot,
    savedPlanningSnapshots,
    clearSelectedSchoolUtilizationZone,
    savePlanningSnapshot,
    schoolUtilizationZonesEnabled,
    setSelectedIndicatorCenterContext,
    setMapFocusMode,
    setOverviewCommandMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
    temporalAnalysisState,
  } = useDashboardState();

  if (productMode === "executive_print") {
    return null;
  }

  const metadata = modeMetadata[productMode];
  const ModeIcon = metadata.icon;

  return (
    <aside
      aria-label={`${metadata.label} intelligence panel`}
      className="glass-panel no-scrollbar order-3 h-full min-h-0 max-h-full w-full overflow-x-hidden overflow-y-auto rounded-lg p-3 lg:order-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            {metadata.label}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-6 text-white">
            Intelligence
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {metadata.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IntelligenceModeBadge />
          <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]"
          >
            <ModeIcon className="h-4 w-4" />
          </div>
        </div>
      </div>

      {productMode === "workspace" ? (
        <OverviewModeContent
          selectedParcelId={selectedParcelId}
          selectedParcelIntelligence={selectedParcelIntelligence}
          selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
          selectedDevelopmentHotspotContext={selectedDevelopmentHotspotContext}
          selectedIndicatorCenterGroupIds={selectedIndicatorCenterGroupIds}
          selectedIndicatorCenterContext={selectedIndicatorCenterContext}
          selectedModelResearchContext={selectedModelResearchContext}
          selectedSchoolUtilizationZone={selectedSchoolUtilizationZone}
          clearSelectedSchoolUtilizationZone={clearSelectedSchoolUtilizationZone}
          activeLayers={activeLayers}
          developmentHotspotControls={developmentHotspotControls}
          developmentHotspotsEnabled={developmentHotspotsEnabled}
          floodConstraintsEnabled={floodConstraintsEnabled}
          floodZonesEnabled={floodZonesEnabled}
          indicatorCenterDisplayMode={indicatorCenterDisplayMode}
          modelResearchOverlayEnabled={modelResearchOverlayEnabled}
          modelResearchViewMode={modelResearchViewMode}
          modelResearchMapSummary={modelResearchMapSummary}
          overviewCommandMode={overviewCommandMode}
          schoolUtilizationZonesEnabled={schoolUtilizationZonesEnabled}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
          savePlanningSnapshot={savePlanningSnapshot}
          setMapFocusMode={setMapFocusMode}
          setSelectedIndicatorCenterContext={setSelectedIndicatorCenterContext}
          setOverviewCommandMode={setOverviewCommandMode}
          setProductMode={setProductMode}
          setPlanningSnapshotView={setPlanningSnapshotView}
        />
      ) : productMode === "methodology" ? (
        <MethodologyModeContent />
      ) : (
        <DueDiligenceReview
          developmentHotspotsEnabled={developmentHotspotsEnabled}
          floodConstraintsEnabled={floodConstraintsEnabled}
          floodZonesEnabled={floodZonesEnabled}
          selectedParcelId={selectedParcelId}
          selectedParcelIntelligence={selectedParcelIntelligence}
          selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
          setMapFocusMode={setMapFocusMode}
          parcelReviewView={parcelReviewView}
          setParcelReviewView={setParcelReviewView}
          setProductMode={setProductMode}
        />
      )}

      {showDeveloperSections ? (
        <DeveloperModeDetails temporalAnalysisState={temporalAnalysisState} />
      ) : null}
    </aside>
  );
}

function OverviewModeContent({
  activeLayers,
  clearSelectedSchoolUtilizationZone,
  developmentHotspotControls,
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  indicatorCenterDisplayMode,
  modelResearchOverlayEnabled,
  modelResearchViewMode,
  modelResearchMapSummary,
  overviewCommandMode,
  planningSnapshot,
  savedPlanningSnapshots,
  savePlanningSnapshot,
  schoolUtilizationZonesEnabled,
  selectedDevelopmentHotspotContext,
  selectedIndicatorCenterGroupIds,
  selectedIndicatorCenterContext,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  selectedModelResearchContext,
  selectedSchoolUtilizationZone,
  setMapFocusMode,
  setOverviewCommandMode,
  setSelectedIndicatorCenterContext,
  setProductMode,
  setPlanningSnapshotView,
}: {
  activeLayers: ReturnType<typeof useDashboardState>["activeLayers"];
  clearSelectedSchoolUtilizationZone: () => void;
  developmentHotspotControls: ReturnType<typeof useDashboardState>["developmentHotspotControls"];
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  indicatorCenterDisplayMode: IndicatorCenterDisplayMode;
  modelResearchOverlayEnabled: boolean;
  modelResearchViewMode: ReturnType<typeof useDashboardState>["modelResearchViewMode"];
  modelResearchMapSummary: ModelResearchMapSummary;
  overviewCommandMode: OverviewCommandMode;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  savePlanningSnapshot: (snapshot: PlanningSnapshot) => void;
  schoolUtilizationZonesEnabled: boolean;
  selectedDevelopmentHotspotContext: SelectedDevelopmentHotspotContext | null;
  selectedIndicatorCenterGroupIds: IndicatorCenterGroupId[];
  selectedIndicatorCenterContext: IndicatorCenterContext | null;
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  selectedModelResearchContext: ModelResearchPreviewMarker | null;
  selectedSchoolUtilizationZone: SelectedSchoolUtilizationZone | null;
  setMapFocusMode: ReturnType<typeof useDashboardState>["setMapFocusMode"];
  setOverviewCommandMode: ReturnType<typeof useDashboardState>["setOverviewCommandMode"];
  setSelectedIndicatorCenterContext: ReturnType<typeof useDashboardState>["setSelectedIndicatorCenterContext"];
  setProductMode: (mode: ProductMode) => void;
  setPlanningSnapshotView: ReturnType<typeof useDashboardState>["setPlanningSnapshotView"];
}) {
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [parcelIdCopied, setParcelIdCopied] = useState(false);
  const [countywideBriefOverride, setCountywideBriefOverride] = useState<{
    parcelId: string | null;
  } | null>(null);
  const parcelDashboardMetrics = useParcelDashboardMetrics();
  const developmentStatistics = useDevelopmentStatistics();
  const floodSummary = useFloodConstraintSummary();
  const indicatorCenterCards = useMemo(
    () =>
      buildIndicatorCenterSummaryCards({
        developmentStatistics,
        floodSummary,
      }),
    [developmentStatistics, floodSummary],
  );
  const selectedParcelForSnapshot = selectedParcelIntelligence ?? null;
  const selectedParcelOfficialId =
    selectedParcelForSnapshot?.officialParcelId ?? selectedParcelId;
  const developmentActivity = useSelectedParcelDevelopmentActivity(
    selectedParcelOfficialId,
  );
  const floodConstraint = useSelectedParcelFloodConstraint(
    selectedParcelOfficialId,
  );
  const schoolConstraint = useSelectedParcelSchoolConstraint(
    selectedParcelOfficialId,
  );
  const transportationContext = useTransportationContextSummary();
  const scopedActiveLayers = useMemo(
    () => getModeScopedActiveLayers(activeLayers, overviewCommandMode),
    [activeLayers, overviewCommandMode],
  );
  const scopedActiveLayerIds = useMemo(
    () => scopedActiveLayers.map((layer) => layer.id),
    [scopedActiveLayers],
  );
  const includeExploreMapContext = isExploreCountywideMode(overviewCommandMode);
  const includeModelLabMapContext = isModelLabMode(overviewCommandMode);
  const activeLayerLabels = Array.from(
    new Set(
      [
        ...scopedActiveLayers.map((layer) => layer.title),
        includeExploreMapContext && developmentHotspotsEnabled
          ? `Development Hotspots (${formatMapOverlayViewMode(
              developmentHotspotControls.viewMode,
            )})`
          : null,
        includeExploreMapContext && floodConstraintsEnabled
          ? "Flood Constraints"
          : null,
        includeExploreMapContext && floodZonesEnabled
          ? "FEMA Flood Zones"
          : null,
        includeExploreMapContext && schoolUtilizationZonesEnabled
          ? "School Utilization Seed"
          : null,
        includeModelLabMapContext && modelResearchOverlayEnabled
          ? `Model Lab Research Preview (${formatMapOverlayViewMode(
              modelResearchViewMode,
            )})`
          : null,
      ].filter((label): label is string => Boolean(label)),
    ),
  );

  const handleSaveOverviewSnapshot = useCallback(async () => {
    if (snapshotSaving) {
      return;
    }

    setSnapshotSaving(true);

    try {
      const mapSnapshot =
        overviewCommandMode === "indicatorCenter"
          ? createIndicatorCenterSnapshotCapture()
          : await captureMapSnapshotForPlanning();
      const snapshotFocusMode = getPlanningFocusModeForOverviewMode(
        overviewCommandMode,
        Boolean(selectedParcelForSnapshot),
      );
      const snapshotFocusLabel = getSnapshotFocusLabelForOverviewMode(
        overviewCommandMode,
        Boolean(selectedParcelForSnapshot),
      );
      const nextSnapshot = buildPlanningSnapshot({
        activeLayerIds: scopedActiveLayerIds,
        activeLayerLabels,
        developmentActivity,
        floodConstraint,
        focusMode: snapshotFocusMode,
        focusModeLabel: snapshotFocusLabel,
        mapSnapshot,
        modelResearchMapSummary,
        modelResearchOverlayEnabled,
        modelResearchViewMode,
        overviewCommandMode,
        parcel: selectedParcelForSnapshot,
        schoolConstraint,
        developmentHotspotControls,
        selectedDevelopmentHotspotContext,
        selectedIndicatorCenterContext,
        selectedIndicatorCenterDisplayMode: indicatorCenterDisplayMode,
        selectedIndicatorCenterGroupIds,
        selectedIndicatorCenterSummaries:
          toIndicatorCenterSnapshotSummaries(indicatorCenterCards),
        selectedModelResearchContext,
      });
      savePlanningSnapshot(nextSnapshot);
      setPlanningSnapshotView("overview");
      setSnapshotSaved(true);
      window.dispatchEvent(
        new CustomEvent(CFS_PLANNING_SNAPSHOT_SAVED_EVENT),
      );
      window.setTimeout(() => setSnapshotSaved(false), 3000);
    } finally {
      setSnapshotSaving(false);
    }
  }, [
    activeLayerLabels,
    developmentActivity,
    developmentHotspotControls,
    floodConstraint,
    indicatorCenterCards,
    indicatorCenterDisplayMode,
    modelResearchMapSummary,
    modelResearchOverlayEnabled,
    modelResearchViewMode,
    overviewCommandMode,
    savePlanningSnapshot,
    schoolConstraint,
    selectedDevelopmentHotspotContext,
    selectedIndicatorCenterGroupIds,
    selectedIndicatorCenterContext,
    selectedModelResearchContext,
    selectedParcelForSnapshot,
    setPlanningSnapshotView,
    snapshotSaving,
    scopedActiveLayerIds,
  ]);

  useEffect(() => {
    function handleCommandCenterSave() {
      void handleSaveOverviewSnapshot();
    }
    function handleCountywideIntelligence() {
      setOverviewCommandMode("countywide");
      setCountywideBriefOverride({
        parcelId: selectedParcelOfficialId ?? null,
      });
    }
    function handleModelLab() {
      setOverviewCommandMode("modelLab");
    }

    window.addEventListener(
      CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
      handleCommandCenterSave,
    );
    window.addEventListener(
      CFS_OPEN_LAYER_RAIL_EVENT,
      handleCountywideIntelligence,
    );
    window.addEventListener(CFS_OPEN_MODEL_LAB_EVENT, handleModelLab);

    return () => {
      window.removeEventListener(
        CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
        handleCommandCenterSave,
      );
      window.removeEventListener(
        CFS_OPEN_LAYER_RAIL_EVENT,
        handleCountywideIntelligence,
      );
      window.removeEventListener(CFS_OPEN_MODEL_LAB_EVENT, handleModelLab);
    };
  }, [
    handleSaveOverviewSnapshot,
    selectedParcelOfficialId,
    setOverviewCommandMode,
  ]);

  const countywideBriefVisible =
    overviewCommandMode === "countywide" &&
    (!selectedParcelOfficialId ||
      countywideBriefOverride?.parcelId === (selectedParcelOfficialId ?? null));

  async function handleCopyParcelId() {
    if (!selectedParcelOfficialId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedParcelOfficialId);
      setParcelIdCopied(true);
      window.setTimeout(() => setParcelIdCopied(false), 1800);
    } catch {
      setParcelIdCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      {overviewCommandMode === "modelLab" ? (
        <ModelLabPanel
          modelResearchOverlayEnabled={modelResearchOverlayEnabled}
          modelResearchViewMode={modelResearchViewMode}
          modelResearchMapSummary={modelResearchMapSummary}
          onOpenMethodology={() => {
            window.location.hash = "methodology-model-lab";
            setProductMode("methodology");
          }}
          onOpenPlanningSnapshot={() => {
            setPlanningSnapshotView("overview");
            setProductMode("due_diligence");
          }}
          onReturnToBrief={() => {
            setOverviewCommandMode("countywide");
            setCountywideBriefOverride({
              parcelId: selectedParcelOfficialId ?? null,
            });
          }}
          onSaveSnapshot={handleSaveOverviewSnapshot}
          selectedModelResearchContext={selectedModelResearchContext}
          selectedParcelId={selectedParcelOfficialId}
          snapshotSaving={snapshotSaving}
        />
      ) : overviewCommandMode === "indicatorCenter" ? (
        <IndicatorCenterPanel
          displayMode={indicatorCenterDisplayMode}
          indicatorCards={indicatorCenterCards}
          onOpenMethodology={() => {
            window.location.hash = "methodology-data-needed";
            setProductMode("methodology");
          }}
          onOpenPlanningSnapshot={() => {
            setPlanningSnapshotView("overview");
            setProductMode("due_diligence");
          }}
          onSaveSnapshot={handleSaveOverviewSnapshot}
          selectedGroupIds={selectedIndicatorCenterGroupIds}
          selectedIndicator={selectedIndicatorCenterContext}
          selectedParcelId={selectedParcelOfficialId}
          setSelectedIndicator={setSelectedIndicatorCenterContext}
          snapshotSaving={snapshotSaving}
        />
      ) : overviewCommandMode === "snapshot" ? (
        <SnapshotCapturePanel
          activeLayerLabels={activeLayerLabels}
          onOpenPlanningSnapshot={() => {
            setPlanningSnapshotView("overview");
            setProductMode("due_diligence");
          }}
          onSaveSnapshot={handleSaveOverviewSnapshot}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
          selectedParcelId={selectedParcelOfficialId}
          snapshotSaving={snapshotSaving}
        />
      ) : (
        <IntelligenceBriefPanel
          activeLayerLabels={activeLayerLabels}
          developmentActivity={developmentActivity}
          developmentStatistics={developmentStatistics}
          floodConstraint={floodConstraint}
          floodSummary={floodSummary}
          onOpenPlanningSnapshot={() => {
            setPlanningSnapshotView("overview");
            setProductMode("due_diligence");
          }}
          onCopyParcelId={handleCopyParcelId}
          onFocusMap={() => setMapFocusMode(true)}
          onSaveSnapshot={handleSaveOverviewSnapshot}
          onShowSelectedParcel={() => {
            setCountywideBriefOverride(null);
          }}
          overviewCommandMode={overviewCommandMode}
          parcel={selectedParcelIntelligence}
          parcelDashboardMetrics={parcelDashboardMetrics}
          parcelIdCopied={parcelIdCopied}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
          schoolConstraint={schoolConstraint}
          selectedDevelopmentHotspotContext={selectedDevelopmentHotspotContext}
          selectedParcelId={selectedParcelOfficialId}
          source={selectedParcelIntelligenceSource}
          snapshotSaved={snapshotSaved}
          snapshotSaving={snapshotSaving}
          showCountywideBrief={countywideBriefVisible}
          transportationContext={transportationContext}
        />
      )}

      <SelectedSchoolUtilizationZoneCard
        enabled={schoolUtilizationZonesEnabled}
        onClear={clearSelectedSchoolUtilizationZone}
        zone={selectedSchoolUtilizationZone}
      />
    </div>
  );
}

function IntelligenceBriefPanel({
  activeLayerLabels,
  developmentActivity,
  developmentStatistics,
  floodConstraint,
  floodSummary,
  onCopyParcelId,
  onFocusMap,
  onOpenPlanningSnapshot,
  onSaveSnapshot,
  onShowSelectedParcel,
  overviewCommandMode,
  parcel,
  parcelDashboardMetrics,
  parcelIdCopied,
  planningSnapshot,
  savedPlanningSnapshots,
  schoolConstraint,
  selectedDevelopmentHotspotContext,
  selectedParcelId,
  snapshotSaved,
  snapshotSaving,
  showCountywideBrief,
  source,
  transportationContext,
}: {
  activeLayerLabels: string[];
  developmentActivity: SnapshotDevelopmentActivity;
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodConstraint: SnapshotFloodConstraint;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  onCopyParcelId: () => void | Promise<void>;
  onFocusMap: () => void;
  onOpenPlanningSnapshot: () => void;
  onSaveSnapshot: () => void | Promise<void>;
  onShowSelectedParcel: () => void;
  overviewCommandMode: OverviewCommandMode;
  parcel: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  parcelDashboardMetrics: ReturnType<typeof useParcelDashboardMetrics>;
  parcelIdCopied: boolean;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  schoolConstraint: SnapshotSchoolConstraint;
  selectedDevelopmentHotspotContext: SelectedDevelopmentHotspotContext | null;
  selectedParcelId: string | null;
  snapshotSaved: boolean;
  snapshotSaving: boolean;
  showCountywideBrief: boolean;
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  transportationContext: ReturnType<typeof useTransportationContextSummary>;
}) {
  const hasParcel = Boolean(parcel) && !showCountywideBrief;
  const showParcelHelper = !hasParcel && overviewCommandMode === "parcel";
  const selectedDevelopmentContext =
    !hasParcel &&
    !showParcelHelper &&
    overviewCommandMode === "countywide"
      ? selectedDevelopmentHotspotContext
      : null;
  const selectedDevelopmentTitle = selectedDevelopmentContext
    ? getDevelopmentHotspotContextTitle(selectedDevelopmentContext)
    : null;

  return (
    <section
      className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/78 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)]"
      id="cfs-intelligence-brief"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/24 bg-[#68d8ff]/10 text-[#8fe7ff]">
          {hasParcel ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <BrainCircuit className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            {selectedDevelopmentTitle
              ? "Development Activity Context"
              : hasParcel || showParcelHelper
                ? "Selected Parcel Intelligence"
                : "Countywide Intelligence"}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">
            {selectedDevelopmentTitle
              ? selectedDevelopmentTitle
              : hasParcel
              ? parcel?.officialParcelId
              : showParcelHelper
                ? "Search a parcel to begin"
              : "Countywide indicators"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {selectedDevelopmentTitle
              ? "Observed permit/development activity only. Not a prediction."
              : hasParcel
              ? "Snapshot-ready parcel facts, constraints, and observed activity."
              : showParcelHelper
                ? "Use the top search bar to add zoning, flood, school, activity, transportation, and utility context."
                : "Countywide indicators, active layers, and safe report actions."}
          </p>
        </div>
      </div>

      {hasParcel && parcel ? (
        <SelectedParcelBrief
          developmentActivity={developmentActivity}
          floodConstraint={floodConstraint}
          onCopyParcelId={onCopyParcelId}
          onFocusMap={onFocusMap}
          parcel={parcel}
          parcelIdCopied={parcelIdCopied}
          schoolConstraint={schoolConstraint}
          source={source}
          transportationContext={transportationContext}
        />
      ) : showParcelHelper ? (
        <ParcelSearchBrief />
      ) : (
        <CountywideBrief
          activeLayerLabels={activeLayerLabels}
          developmentStatistics={developmentStatistics}
          floodSummary={floodSummary}
          parcelDashboardMetrics={parcelDashboardMetrics}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
          selectedDevelopmentHotspotContext={selectedDevelopmentContext}
          selectedParcelId={selectedParcelId}
          onShowSelectedParcel={parcel ? onShowSelectedParcel : undefined}
        />
      )}

      <div className="mt-3 grid gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-3 py-2.5 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/18 disabled:cursor-not-allowed disabled:opacity-65"
          disabled={snapshotSaving}
          onClick={() => {
            void onSaveSnapshot();
          }}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          {snapshotSaving ? "Capturing Map..." : "Save Snapshot"}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
          onClick={onOpenPlanningSnapshot}
          type="button"
        >
          <FileSearch className="h-3.5 w-3.5" />
          Open Snapshots
        </button>
      </div>

      {snapshotSaved ? (
        <div className="mt-3 rounded-md border border-[#55d38f]/22 bg-[#55d38f]/[0.07] px-3 py-2 text-xs leading-5 text-[#9ff0bd]">
          <p className="font-semibold text-[#d7ffe4]">
            {planningSnapshot?.mapScreenshotStatus === "failed" ||
            planningSnapshot?.mapScreenshotStatus === "unavailable"
              ? "Planning snapshot saved, but map image was unavailable."
              : "Planning snapshot saved."}
          </p>
          <p className="mt-1 text-[#9ff0bd]/80">
            Captured map view, selected parcel if available, active layers,
            Intelligence Brief, key stats, caveats, and explanations.
          </p>
          {planningSnapshot?.mapScreenshotStatus === "failed" ||
          planningSnapshot?.mapScreenshotStatus === "unavailable" ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1.5 text-amber-100/85">
              Report will show a map-unavailable placeholder.
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="mt-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer font-semibold text-slate-200">
          More Details
        </summary>
        <div className="mt-2 space-y-2 leading-5">
          <p>
            Active map context:{" "}
            {activeLayerLabels.length ? activeLayerLabels.join(", ") : "none"}.
          </p>
          <p>
            Internal model research is aggregate governance only. CFS does not
            show parcel probabilities, ranking classes, or public prediction
            scores.
          </p>
        </div>
      </details>
    </section>
  );
}

function ParcelSearchBrief() {
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#d8b86a]" />
          <div>
            <p className="text-xs font-semibold text-slate-200">
              Parcel-first workflow
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Search parcel ID, PIN, owner, address, or subdivision. Once a
              parcel is selected, CFS will focus the map and show parcel facts,
              zoning, flood, school, development, transportation, utility proxy,
              and model-governance caveats.
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BriefStat
          caveat="Use the global search bar at the top of CFS."
          label="Step 1"
          value="Search"
        />
        <BriefStat
          caveat="The map focuses on selected parcel context."
          label="Step 2"
          value="Focus"
        />
        <BriefStat
          caveat="Right panel switches to parcel intelligence."
          label="Step 3"
          value="Review"
        />
        <BriefStat
          caveat="Save map and intelligence context for reporting."
          label="Step 4"
          value="Snapshot"
        />
      </div>
    </div>
  );
}

function SnapshotCapturePanel({
  activeLayerLabels,
  onOpenPlanningSnapshot,
  onSaveSnapshot,
  planningSnapshot,
  savedPlanningSnapshots,
  selectedParcelId,
  snapshotSaving,
}: {
  activeLayerLabels: string[];
  onOpenPlanningSnapshot: () => void;
  onSaveSnapshot: () => void | Promise<void>;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  selectedParcelId: string | null;
  snapshotSaving: boolean;
}) {
  const latestCapturedMode = planningSnapshot?.overviewCommandMode
    ? formatOverviewCommandModeLabel(planningSnapshot.overviewCommandMode)
    : "No snapshot captured yet";
  const mapStatus =
    planningSnapshot?.mapScreenshotStatus === "captured"
      ? "Map image captured"
      : planningSnapshot?.mapScreenshotStatus === "failed"
        ? "Map image unavailable"
        : planningSnapshot?.mapScreenshotStatus === "unavailable"
          ? "Map image unavailable"
          : "Awaiting capture";

  return (
    <section
      className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/82 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)]"
      id="cfs-intelligence-brief"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8b86a]/26 bg-[#d8b86a]/10 text-[#f0cd79]">
          <Save className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0cd79]">
            Snapshot Builder
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Snapshot Builder mode active
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Click Save Snapshot to capture the current map and intelligence
            context. A Planning Snapshot combines the map image with selected
            CFS intelligence so the executive summary can explain what the
            viewer is seeing.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BriefStat
          caveat="Snapshot records the Overview task mode that was active when saved."
          label="Last captured mode"
          value={latestCapturedMode}
        />
        <BriefStat
          caveat="SceneView provides the map image when browser/GPU support allows it."
          label="Map image"
          value={mapStatus}
        />
        <BriefStat
          caveat="Parcel-specific facts are included when a parcel is selected."
          label="Selected parcel"
          value={selectedParcelId ?? "No parcel selected"}
        />
        <BriefStat
          caveat="Active layer names are carried into the report context."
          label="Active layers"
          value={String(activeLayerLabels.length)}
        />
        <BriefStat
          caveat="Snapshots are stored locally for this prototype."
          label="Saved snapshots"
          value={String(savedPlanningSnapshots.length)}
        />
        <BriefStat
          caveat="Executive Summary is generated from the selected saved snapshot."
          label="Report builder"
          value={planningSnapshot ? "Ready" : "Not saved"}
        />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Captured evidence
        </p>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
          <li>- Map view and screenshot status</li>
          <li>- Selected parcel if available</li>
          <li>- Active layers and Intelligence summary</li>
          <li>- Headline indicators, caveats, and explainable metrics</li>
          <li>- Internal Model Lab context only when active</li>
        </ul>
      </div>

      <div className="mt-3 grid gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-3 py-2.5 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/18 disabled:cursor-not-allowed disabled:opacity-65"
          disabled={snapshotSaving}
          onClick={() => {
            void onSaveSnapshot();
          }}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          {snapshotSaving ? "Capturing Map..." : "Save Snapshot"}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
          onClick={onOpenPlanningSnapshot}
          type="button"
        >
          <FileSearch className="h-3.5 w-3.5" />
          Open Snapshot Library
        </button>
      </div>
    </section>
  );
}

function IndicatorCenterPanel({
  displayMode,
  indicatorCards,
  onOpenMethodology,
  onOpenPlanningSnapshot,
  onSaveSnapshot,
  selectedGroupIds,
  selectedIndicator,
  selectedParcelId,
  setSelectedIndicator,
  snapshotSaving,
}: {
  displayMode: IndicatorCenterDisplayMode;
  indicatorCards: IndicatorCenterSummaryCard[];
  onOpenMethodology: () => void;
  onOpenPlanningSnapshot: () => void;
  onSaveSnapshot: () => void | Promise<void>;
  selectedGroupIds: IndicatorCenterGroupId[];
  selectedIndicator: IndicatorCenterContext | null;
  selectedParcelId: string | null;
  setSelectedIndicator: (indicator: IndicatorCenterContext | null) => void;
  snapshotSaving: boolean;
}) {
  const visibleDefinitions = filterIndicatorCenterDefinitions({
    definitions: indicatorCenterDefinitions,
    displayMode,
    selectedGroupIds,
    selectedIndicator,
  });
  const visibleCards = indicatorCards.filter((card) =>
    visibleDefinitions.some(
      (indicator) => indicator.indicatorId === card.indicator.indicatorId,
    ),
  );
  const selectedCard = selectedIndicator
    ? indicatorCards.find(
        (card) => card.indicator.indicatorId === selectedIndicator.indicatorId,
      )
    : null;
  const highAttentionCards = indicatorCards.filter((card) =>
    ["High Attention", "Review Needed"].includes(
      card.indicator.priorityLabel,
    ),
  );
  const dataNeededCards = indicatorCards.filter((card) =>
    ["Data Needed", "Proxy Only", "Preliminary Data"].includes(
      card.indicator.priorityLabel,
    ),
  );
  const headlineMetrics = buildIndicatorCenterHeadlineMetrics({
    selectedGroupCount: selectedGroupIds.length,
    snapshotReady: visibleCards.length > 0,
  });
  const reviewThemes = buildIndicatorCenterReviewThemes(visibleDefinitions);
  const selectedGroupNames = indicatorCenterDefinitions
    .filter((indicator) => selectedGroupIds.includes(indicator.groupId))
    .map((indicator) => indicator.name);

  return (
    <section
      className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/82 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)]"
      id="cfs-intelligence-brief"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/24 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Indicator Intelligence
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Indicator Intelligence
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Indicator Center answers what needs review, why it matters, and
            what staff should do next. These are monitoring indicators,
            not official determinations.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {headlineMetrics.map((metric) => (
          <BriefStat
            caveat={metric.caveat}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <BriefStat
          caveat="Current dashboard posture; it does not calculate a score."
          label="Dashboard"
          value={getIndicatorCenterDisplayModeLabel(displayMode)}
        />
        <BriefStat
          caveat="Missing values are labeled as data needed or proxy only."
          label="Data posture"
          value="No fake values"
        />
      </div>

      {selectedParcelId ? (
        <p className="mt-3 rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/[0.055] px-3 py-2 text-xs leading-5 text-[#b7f0ff]">
          Selected parcel context is active:{" "}
          <span className="font-mono font-semibold text-white">
            {selectedParcelId}
          </span>
          . Indicator Center can be saved with this parcel context, but it does
          not create a parcel score.
        </p>
      ) : null}

      {selectedIndicator ? (
        <div className="mt-3 rounded-md border border-[#68d8ff]/22 bg-[#68d8ff]/[0.055] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8fe7ff]">
                Selected indicator
              </p>
              <h4 className="mt-1 text-sm font-semibold text-white">
                {selectedIndicator.name}
              </h4>
            </div>
            <button
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.07]"
              onClick={() => setSelectedIndicator(null)}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
            <CompactParcelLine
              label="Value"
              value={selectedCard?.value ?? "Context available"}
            />
            <CompactParcelLine
              label="Snapshot"
              value={
                selectedIndicator.snapshotIncluded
                  ? "Included by default"
                  : "Optional"
              }
            />
            <CompactParcelLine
              label="Category"
              value={selectedIndicator.category}
            />
            <CompactParcelLine
              label="Priority"
              value={selectedIndicator.priorityLabel}
            />
            <CompactParcelLine
              label="Status"
              value={selectedIndicator.status}
            />
            <CompactTextBlock
              label="What it means"
              value={selectedIndicator.whatItMeans}
            />
            <CompactTextBlock
              label="Source"
              value={selectedIndicator.source}
            />
            <CompactTextBlock
              label="Data used"
              value={selectedIndicator.dataUsed.join(" / ")}
            />
            <CompactTextBlock
              label="Caveat"
              value={selectedIndicator.caveat}
            />
            <CompactTextBlock
              label="Recommended follow-up"
              value={selectedIndicator.recommendedFollowUp}
            />
            <CompactTextBlock
              label="Planning Snapshot"
              value="This indicator can be included with the saved dashboard context, caveats, and recommended follow-up."
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
          <p>
            {
              "Select an indicator card to inspect what it means, its source, the caveat, and recommended follow-up. No official risk scores, predictions, or made-up measures are generated."
            }
          </p>
          <p className="mt-2 text-[#f8e4ac]">
            Highest-priority attention categories:{" "}
            {highAttentionCards
              .map((card) => card.indicator.name)
              .join(" / ")}
            .
          </p>
          <p className="mt-1 text-[#f8e4ac]">
            Data-needed categories:{" "}
            {dataNeededCards
              .map((card) => card.indicator.name)
              .join(" / ")}
            .
          </p>
        </div>
      )}

      <div className="mt-3 rounded-md border border-white/10 bg-black/16 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Review themes
        </p>
        <div className="mt-2 grid gap-1.5">
          {reviewThemes.slice(0, 4).map((theme) => (
            <button
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.055]"
              key={theme.indicatorId}
              onClick={() => {
                const indicator = indicatorCenterDefinitions.find(
                  (candidate) => candidate.indicatorId === theme.indicatorId,
                );

                if (indicator) {
                  setSelectedIndicator(indicator);
                }
              }}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] leading-4 text-slate-300">
                  {theme.label}
                </p>
                <span className="shrink-0 rounded border border-white/10 bg-black/18 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300">
                  {theme.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Indicator summary cards
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Groups: {selectedGroupNames.join(" / ") || "None selected"}
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-black/18 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {visibleCards.length} shown
          </span>
        </div>
        <div className="mt-2 grid gap-2">
          {visibleCards.length ? (
            visibleCards.map((card) => {
              const selected =
                selectedIndicator?.indicatorId === card.indicator.indicatorId;

              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition",
                    selected
                      ? "border-[#68d8ff]/45 bg-[#68d8ff]/12"
                      : "border-white/10 bg-black/16 hover:border-white/20 hover:bg-white/[0.05]",
                  )}
                  key={card.indicator.indicatorId}
                  onClick={() => setSelectedIndicator(card.indicator)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-white">
                      {card.indicator.name}
                    </p>
                      <span className="rounded border border-[#d8b86a]/18 bg-[#d8b86a]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#f6d98e]">
                      {card.indicator.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#b7f0ff]">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    {card.secondaryValue ?? card.indicator.whatItMeans}
                  </p>
                </button>
              );
            })
          ) : (
            <p className="rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
              No enabled indicators match this display filter.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-3 py-2.5 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/18 disabled:cursor-not-allowed disabled:opacity-65"
          disabled={snapshotSaving}
          onClick={() => {
            void onSaveSnapshot();
          }}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          {snapshotSaving ? "Capturing Map..." : "Save Snapshot"}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onOpenMethodology}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Methodology
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
          onClick={onOpenPlanningSnapshot}
          type="button"
        >
          <FileSearch className="h-3.5 w-3.5" />
          Open Snapshots
        </button>
      </div>
    </section>
  );
}

function ModelLabPanel({
  modelResearchOverlayEnabled,
  modelResearchViewMode,
  modelResearchMapSummary,
  onOpenMethodology,
  onOpenPlanningSnapshot,
  onReturnToBrief,
  onSaveSnapshot,
  selectedModelResearchContext,
  selectedParcelId,
  snapshotSaving,
}: {
  modelResearchOverlayEnabled: boolean;
  modelResearchViewMode: ReturnType<typeof useDashboardState>["modelResearchViewMode"];
  modelResearchMapSummary: ModelResearchMapSummary;
  onOpenMethodology: () => void;
  onOpenPlanningSnapshot: () => void;
  onReturnToBrief: () => void;
  onSaveSnapshot: () => void | Promise<void>;
  selectedModelResearchContext: ModelResearchPreviewMarker | null;
  selectedParcelId: string | null;
  snapshotSaving: boolean;
}) {
  const overlayStatus = modelResearchOverlayEnabled
    ? "On"
    : "Off by default";
  const selectedResearchDrivers = selectedModelResearchContext?.topDrivers ?? [];
  const selectedIsCluster =
    selectedModelResearchContext?.contextKind === "cluster" ||
    selectedModelResearchContext?.contextKind === "heatmap_cell";
  const selectedRelativeBand = selectedModelResearchContext
    ? selectedModelResearchContext.dominantResearchBand ??
      formatRelativeDevelopmentSignalBand({
          rankBand: selectedModelResearchContext.researchRankBand,
          signalLabel: selectedModelResearchContext.researchSignalLabel,
        })
    : null;
  const selectedRepresentedCount =
    selectedModelResearchContext?.representedFeatureCount ?? 1;
  const dominantRelativeBand = formatRelativeDevelopmentSignalBand({
    signalLabel: modelResearchMapSummary.dominantSignalLabel,
  });
  const [explainNumbersOpen, setExplainNumbersOpen] = useState(false);
  const [modelQaOpen, setModelQaOpen] = useState(false);
  const [futureModelsOpen, setFutureModelsOpen] = useState(false);
  const visibleContextLabel = modelResearchMapSummary.overlayEnabled
    ? `${formatDevelopmentCount(
        modelResearchMapSummary.visibleFeatureCount,
      )} safe research ${
        modelResearchMapSummary.displayMode === "countywide_heatmap"
          ? "records represented"
          : modelResearchMapSummary.displayMode === "clustered_markers" ||
              modelResearchMapSummary.displayMode === "intermediate_subclusters"
            ? "records clustered"
            : modelResearchMapSummary.displayMode === "fine_local_clusters"
              ? "records locally clustered"
            : "markers visible"
      }`
    : "Overlay off";
  const legendModeHint = getModelResearchLegendModeHint(
    modelResearchOverlayEnabled,
    modelResearchMapSummary.displayMode,
  );

  return (
    <section
      className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/82 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.2)]"
      id="cfs-intelligence-brief"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8b86a]/26 bg-[#d8b86a]/10 text-[#f0cd79]">
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0cd79]">
            Model Lab
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Model Lab Intelligence
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Internal research preview for relative development signal bands.
            Exact parcel probabilities are not shown.
          </p>
        </div>
      </div>

      {selectedModelResearchContext ? (
        <div className="mt-3 rounded-lg border border-[#68d8ff]/24 bg-[#68d8ff]/[0.07] p-3 shadow-[0_14px_34px_rgba(104,216,255,0.09)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8fe7ff]">
                {getSelectedModelResearchContextTitle(
                  selectedModelResearchContext,
                )}
              </p>
              <h4 className="mt-1 text-sm font-semibold text-white">
                {getSelectedModelResearchContextHeading(
                  selectedModelResearchContext,
                )}
              </h4>
              <p className="mt-1 text-[11px] leading-4 text-slate-400">
                {selectedIsCluster
                  ? formatRepresentedResearchCount(selectedRepresentedCount)
                  : selectedModelResearchContext.officialParcelId ??
                    "Parcel-safe research feature"}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
              Research only
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {selectedIsCluster ? (
              <>
                <BriefStat
                  caveat="Label uses safe CFS context only; no area names are invented."
                  label="Area label"
                  value={getSelectedModelResearchContextHeading(
                    selectedModelResearchContext,
                  )}
                />
                <BriefStat
                  caveat="Safe research records represented by this selected map feature."
                  label="Parcels represented"
                  value={formatRepresentedResearchCount(
                    selectedRepresentedCount,
                  )}
                />
              </>
            ) : null}
            <BriefStat
              caveat="Relative band only. It is not an exact probability or official parcel class."
              label={selectedIsCluster ? "Dominant band" : "Research band"}
              value={selectedRelativeBand ?? "Relative Research Signal"}
            />
            {selectedIsCluster ? (
              <BriefStat
                caveat="Distribution of relative research bands inside the selected cluster."
                label="Band distribution"
                value={formatModelResearchBandDistribution(
                  selectedModelResearchContext.bandCounts,
                )}
              />
            ) : (
              <BriefStat
                caveat="Relative rank band only; not a numeric likelihood."
                label="Relative rank band"
                value={formatResearchBandLabel(
                  selectedModelResearchContext.researchRankBand,
                )}
              />
            )}
            <BriefStat
              caveat="Scale-dependent map mode used when this context was selected."
              label="Map display"
              value={formatSelectedModelResearchDisplayMode(
                selectedModelResearchContext.displayMode ??
                  modelResearchMapSummary.displayMode,
              )}
            />
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-black/18 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Top drivers
            </p>
            {selectedResearchDrivers.length ? (
              <ul className="mt-2 space-y-1.5">
                {selectedResearchDrivers.slice(0, 3).map((driver) => (
                  <li
                    className="text-[11px] leading-4 text-slate-300"
                    key={driver}
                  >
                    <span className="block font-semibold text-slate-200">
                      {formatModelResearchDriverLabel(driver)}
                    </span>
                    <span className="block text-slate-500">
                      {getModelResearchDriverExplanation(driver)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Driver context was not available for this marker.
              </p>
            )}
          </div>

          <div className="mt-3 grid gap-2">
            <ReviewMiniBlock
              label="Why highlighted"
              value={getModelResearchHighlightExplanation(
                selectedModelResearchContext,
              )}
            />
            <ReviewMiniBlock
              label="Recommended interpretation"
              value="Use this as internal research context to guide staff questions, not as a decision finding."
            />
          </div>

          <div className="mt-3 grid gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-3 py-2.5 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/18 disabled:cursor-not-allowed disabled:opacity-65"
              disabled={snapshotSaving}
              onClick={() => {
                void onSaveSnapshot();
              }}
              type="button"
            >
              <Save className="h-3.5 w-3.5" />
              {snapshotSaving ? "Capturing Map..." : "Save Snapshot"}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
              onClick={onOpenPlanningSnapshot}
              type="button"
            >
              <FileSearch className="h-3.5 w-3.5" />
              Open Snapshots
            </button>
          </div>

          <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.07] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
            Internal research only. Not an exact probability. Not an official parcel score.
          </p>
        </div>
      ) : null}

      {!selectedModelResearchContext ? (
        <div className="mt-3 rounded-lg border border-[#d8b86a]/22 bg-[#d8b86a]/[0.065] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f0cd79]">
          Development Research Signal
        </p>
        <h4 className="mt-1 text-sm font-semibold text-white">
          Current view: Relative research bands
        </h4>
        <p className="mt-2 text-[11px] leading-5 text-slate-300">
          Bands compare parcels and areas against each other. They are not
          probability percentages.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {modelResearchLegendLabels.map((label) => (
            <span
              className="rounded-full border border-white/10 bg-black/18 px-2 py-1 text-[10px] font-semibold text-slate-200"
              key={label}
            >
              {label.replace(" Research Signal", "")}
            </span>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-white/10 bg-black/18 px-3 py-2 text-[11px] leading-5 text-slate-300">
          {legendModeHint}
        </p>
      </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f0cd79]">
              Current Map View
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              {modelResearchMapSummary.overlayEnabled
                ? modelResearchMapSummary.displayModeLabel
                : "Development Research Signal off"}
            </h4>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
            {overlayStatus}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BriefStat
            caveat="Scale-dependent display: countywide surface, clusters, then parcel markers."
            label="Display"
            value={
              modelResearchMapSummary.overlayEnabled
                ? modelResearchMapSummary.viewScaleLabel
                : "Off"
            }
          />
          <BriefStat
            caveat="User-selected visualization for the research overlay."
            label="View"
            value={formatMapOverlayViewMode(modelResearchViewMode)}
          />
          <BriefStat
            caveat="Visible context is capped for performance and readability."
            label="Visible Context"
            value={visibleContextLabel}
          />
          <BriefStat
            caveat="Dominant relative band in the current rendered view."
            label="Dominant Signal"
            value={dominantRelativeBand}
          />
          <BriefStat
            caveat="Research rows available in the safe preview source."
            label="Preview Rows"
            value={formatDevelopmentCount(
              modelResearchMapSummary.totalFeatureCount,
            )}
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Key Model Status
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              {developmentModelLabSummary.currentBestInternalVariant}
            </h4>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Target: {developmentModelLabSummary.target}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#f0cd79]">
            Internal only
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <BriefStat
            caveat="Research status only; no operational deployment."
            label="Status"
            value="Internal only"
          />
          <BriefStat
            caveat="No public model activation."
            label="Production ready"
            value="No"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Explain / Details
        </p>
        <ModelLabDisclosureButton
          isOpen={explainNumbersOpen}
          label="Explain the Numbers"
          onClick={() => setExplainNumbersOpen((open) => !open)}
        />
        {explainNumbersOpen ? <ModelLabExplainNumbersPanel /> : null}
        <ModelLabDisclosureButton
          isOpen={modelQaOpen}
          label="Model QA Details"
          onClick={() => setModelQaOpen((open) => !open)}
        />
        {modelQaOpen ? <ModelLabQaDetailsPanel /> : null}
        <ModelLabDisclosureButton
          isOpen={futureModelsOpen}
          label="Future Model Ideas"
          onClick={() => setFutureModelsOpen((open) => !open)}
        />
        {futureModelsOpen ? <FutureModelIdeasPanel /> : null}
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onOpenMethodology}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Methodology Model Lab
        </button>
      </div>

      {selectedParcelId ? (
        <div className="mt-3 rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] px-3 py-2 text-xs leading-5 text-slate-300">
          Parcel context is selected for snapshots, but Model Lab does not show
          parcel-level model output.
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {!selectedModelResearchContext ? (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-3 py-2.5 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/18 disabled:cursor-not-allowed disabled:opacity-65"
            disabled={snapshotSaving}
            onClick={() => {
              void onSaveSnapshot();
            }}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {snapshotSaving ? "Capturing Map..." : "Save Snapshot"}
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {!selectedModelResearchContext ? (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
              onClick={onOpenPlanningSnapshot}
              type="button"
            >
              <FileSearch className="h-3.5 w-3.5" />
              Open Snapshots
            </button>
          ) : null}
          <button
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]",
              selectedModelResearchContext ? "col-span-2" : "",
            )}
            onClick={onReturnToBrief}
            type="button"
          >
            Intelligence Brief
          </button>
        </div>
      </div>
    </section>
  );
}

function ModelLabDisclosureButton({
  isOpen,
  label,
  onClick,
}: {
  isOpen: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={isOpen}
      className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 transition",
          isOpen ? "rotate-180" : "",
        )}
      />
    </button>
  );
}

function ModelLabExplainNumbersPanel() {
  return (
    <div className="mt-3 grid gap-2">
      <MetricExplanation
        label="Research bands"
        value="Research bands compare parcels or areas against each other. They are relative internal research groups, not probabilities."
      />
      <MetricExplanation
        label="Very Strong Research Signal"
        value="Highest-ranked internal research group. It means this area ranks near the top compared with other parcels or areas. It is not a probability."
      />
      <MetricExplanation
        label="Strong Research Signal"
        value="Above-average internal research signal based on similarity to historical new construction patterns."
      />
      <MetricExplanation
        label="Moderate Research Signal"
        value="Middle research band. It suggests some similarity to historical new construction context, but not enough to treat as a decision signal."
      />
      <MetricExplanation
        label="Lower Research Signal"
        value="Lower relative research band compared with areas that looked more similar to historic new construction cases."
      />
      <MetricExplanation
        label="Insufficient Data"
        value="Not enough safe model context to interpret confidently."
      />
      <MetricExplanation
        label="Relative development signal"
        value="A stronger signal means the parcel or area looks more similar to places where new construction occurred historically."
      />
      <MetricExplanation
        label="Clusters"
        value="When the map is zoomed out, CFS fuses nearby preview records into clusters. Cluster size represents how many parcels or features are included, and cluster color represents the dominant relative research band."
      />
      <MetricExplanation
        label="Why exact probabilities are hidden"
        value="The model is not calibrated enough for official parcel probabilities. CFS shows relative research signal only."
      />
      <MetricExplanation
        label="What the model uses"
        value="Historical new construction permits, historical/current zoning context, transportation accessibility / STIP / AADT context, tax/value enrichment, and a parcel-year feature matrix."
      />
      <div className="rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8fe7ff]">
          How this is calculated
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-5 text-slate-300">
          <li>
            CFS uses historical new construction permits to identify where
            development happened.
          </li>
          <li>
            CFS builds parcel-year records showing parcel conditions before
            future development.
          </li>
          <li>
            The model compares parcel context such as zoning, transportation
            access, and tax/value patterns.
          </li>
          <li>
            Parcels and areas are ranked by relative similarity to historical
            development patterns.
          </li>
          <li>
            The UI shows research bands instead of exact probabilities.
          </li>
        </ol>
      </div>
      <p className="rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
        These are aggregate test metrics and relative research bands, not
        parcel-level scores. This is internal research, not an official parcel
        score.
      </p>
    </div>
  );
}

function ModelLabQaDetailsPanel() {
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-black/18 p-3">
      {developmentModelLabSummary.aggregateMetrics.map((metric) => (
        <MetricExplanation
          key={metric.label}
          label={`${metric.label}: ${metric.value}`}
          value={
            metric.label === "PR-AUC"
              ? "Tests whether higher-ranked rows contain more true new construction cases."
              : metric.label === "Lift@top 5%"
                ? "Shows how much better the highest-ranked research group performed compared with random selection."
                : metric.label === "Precision@top 5%"
                  ? "Among the top-ranked 5% of test rows, this is the share that actually became new construction cases."
                  : "Aggregate model QA metric shown for internal research governance only."
          }
        />
      ))}
      <p className="rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
        These are aggregate model test metrics, not parcel-level scores.
      </p>
    </div>
  );
}

function FutureModelIdeasPanel() {
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-black/18 p-3">
      {futureModelLabPlaceholders.map((model) => (
        <MetricExplanation
          key={model.title}
          label={`${model.title}: ${model.status}`}
          value={model.caveat}
        />
      ))}
    </div>
  );
}

function MetricExplanation({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/18 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-300">{value}</p>
    </div>
  );
}

function CountywideBrief({
  activeLayerLabels,
  developmentStatistics,
  floodSummary,
  onShowSelectedParcel,
  parcelDashboardMetrics,
  planningSnapshot,
  savedPlanningSnapshots,
  selectedDevelopmentHotspotContext,
  selectedParcelId,
}: {
  activeLayerLabels: string[];
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  onShowSelectedParcel?: () => void;
  parcelDashboardMetrics: ReturnType<typeof useParcelDashboardMetrics>;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  selectedDevelopmentHotspotContext: SelectedDevelopmentHotspotContext | null;
  selectedParcelId: string | null;
}) {
  const totalPermits =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "total-permits",
    )?.value ?? formatDevelopmentCount(0);
  const activeParcels =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "parcels-with-activity",
    )?.value ?? formatDevelopmentCount(0);
  const floodReviewParcels =
    floodSummary.metrics.find(
      (metric) => metric.id === "review-required-parcels",
    )?.value ?? (floodSummary.isLoading ? "Loading" : "Pending");
  const totalParcels = formatIntelligenceCount(
    parcelDashboardMetrics.summary.totalParcels,
  );

  return (
    <div className="mt-3 space-y-3">
      {selectedDevelopmentHotspotContext ? (
        <SelectedDevelopmentHotspotCard context={selectedDevelopmentHotspotContext} />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <BriefStat
          caveat="Observed permit/development records, not prediction."
          label="Permit Records"
          value={totalPermits}
        />
        <BriefStat
          caveat="Parcels with observed permit/development activity."
          label="Active Parcels"
          value={activeParcels}
        />
        <BriefStat
          caveat="FEMA-related review context for county parcels."
          label="Flood Review"
          value={floodReviewParcels}
        />
        <BriefStat
          caveat={`${formatIntelligencePercentage(
            parcelDashboardMetrics.summary.zoningCoveragePercentage,
          )} zoning coverage.`}
          label="Parcel Coverage"
          value={totalParcels}
        />
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Model Status
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Internal only
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#f0cd79]">
            Not public-facing
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Current best internal model research remains aggregate-only. No
          parcel probability or ranking class is shown in Overview.
        </p>
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
        {selectedParcelId ? (
          <span>Parcel context is still selected and ready for snapshots.</span>
        ) : (
          <span>Search a parcel to add parcel-specific facts.</span>
        )}{" "}
        {activeLayerLabels.length ? (
          <span>{activeLayerLabels.length} active map context labels are available.</span>
        ) : (
          <span>Optional overlays are currently off.</span>
        )}{" "}
        {savedPlanningSnapshots.length ? (
          <span>
            {savedPlanningSnapshots.length} saved Planning Snapshot
            {savedPlanningSnapshots.length === 1 ? "" : "s"} available.
          </span>
        ) : planningSnapshot ? (
          <span>A saved Planning Snapshot is available.</span>
        ) : (
          <span>No snapshot has been saved yet.</span>
        )}
      </div>

      {selectedParcelId && onShowSelectedParcel ? (
        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
          onClick={onShowSelectedParcel}
          type="button"
        >
          <MapPin className="h-3.5 w-3.5" />
          Show Selected Parcel Intelligence
        </button>
      ) : null}
    </div>
  );
}

function SelectedDevelopmentHotspotCard({
  context,
}: {
  context: SelectedDevelopmentHotspotContext;
}) {
  const isCluster = context.contextKind === "cluster";
  const segmentMix = formatDevelopmentHotspotSegmentMix(context);
  const topDrivers = context.topDrivers.length
    ? context.topDrivers
    : ["Observed permit concentration"];

  return (
    <div className="rounded-md border border-[#d8b86a]/24 bg-[#d8b86a]/[0.065] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f6d98e]">
            {getDevelopmentHotspotContextTitle(context)}
          </p>
          <h4 className="mt-1 truncate text-sm font-semibold text-white">
            {context.areaLabel}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {formatDevelopmentHotspotRepresentedCount(context)}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#f0cd79]">
          Observed activity
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BriefStat
          caveat="Observed permit segment, not prediction."
          label={isCluster ? "Dominant Segment" : "Activity Segment"}
          value={formatDevelopmentLabel(
            context.dominantPermitSegment ?? context.selectedPermitSegment,
          )}
        />
        <BriefStat
          caveat="Development activity grouping from permit context."
          label="Activity Type"
          value={formatDevelopmentLabel(context.dominantActivityType)}
        />
        <BriefStat
          caveat="Filtered records represented by this map feature."
          label="Records"
          value={formatDevelopmentCount(context.recordsRepresented)}
        />
        <BriefStat
          caveat="Latest activity context from available permit counts."
          label="Recent Context"
          value={context.latestActivityLabel}
        />
      </div>

      {segmentMix ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-slate-300">
          <span className="font-semibold text-slate-200">Segment mix:</span>{" "}
          {segmentMix}
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-white/10 bg-black/18 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          Top drivers
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {topDrivers.join(" / ")}
        </p>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-400">
        <span className="font-semibold text-slate-200">Why highlighted:</span>{" "}
        {context.whyHighlighted}
      </p>
      <p className="mt-2 text-xs leading-5 text-[#f6d98e]">
        {context.caveat}
      </p>
    </div>
  );
}

function getDevelopmentHotspotContextTitle(
  context: Pick<SelectedDevelopmentHotspotContext, "contextKind" | "parcelsRepresented">,
) {
  if (context.contextKind === "cluster" && context.parcelsRepresented > 1) {
    return "Selected Development Activity Cluster";
  }

  return "Selected Development Activity";
}

function formatDevelopmentHotspotRepresentedCount(
  context: Pick<
    SelectedDevelopmentHotspotContext,
    "parcelsRepresented" | "recordsRepresented"
  >,
) {
  const parcelText =
    context.parcelsRepresented === 1
      ? "1 parcel represented"
      : `${formatDevelopmentCount(context.parcelsRepresented)} parcels represented`;
  const recordText =
    context.recordsRepresented === 1
      ? "1 record represented"
      : `${formatDevelopmentCount(context.recordsRepresented)} records represented`;

  return `${parcelText} / ${recordText}`;
}

function formatDevelopmentHotspotSegmentMix(
  context: SelectedDevelopmentHotspotContext,
) {
  return [
    ["Residential", context.segmentCounts.residentialGrowth],
    ["Commercial", context.segmentCounts.commercialActivity],
    ["Industrial", context.segmentCounts.industrialActivity],
    ["Institutional", context.segmentCounts.institutionalActivity],
    ["Redevelopment", context.segmentCounts.redevelopmentSignal],
    ["Minor", context.segmentCounts.minorMaintenance],
    ["Demolition", context.segmentCounts.demolition],
    ["Other", context.segmentCounts.administrativeOrUnknown],
  ]
    .filter(([, count]) => Number(count) > 0)
    .slice(0, 4)
    .map(([label, count]) => `${label}: ${formatDevelopmentCount(Number(count))}`)
    .join(" / ");
}

function SelectedParcelBrief({
  developmentActivity,
  floodConstraint,
  onCopyParcelId,
  onFocusMap,
  parcel,
  parcelIdCopied,
  schoolConstraint,
  source,
  transportationContext,
}: {
  developmentActivity: SnapshotDevelopmentActivity;
  floodConstraint: SnapshotFloodConstraint;
  onCopyParcelId: () => void | Promise<void>;
  onFocusMap: () => void;
  parcel: NonNullable<Parameters<typeof ParcelSummaryPanel>[0]["parcel"]>;
  parcelIdCopied: boolean;
  schoolConstraint: SnapshotSchoolConstraint;
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  transportationContext: ReturnType<typeof useTransportationContextSummary>;
}) {
  const zoning = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const floodReview =
    floodConstraint.constraint?.flood_review_required === true
      ? "Review Required"
      : floodConstraint.constraint?.flood_review_required === false
        ? "Not flagged"
        : floodConstraint.source === "loading"
          ? "Checking FEMA"
          : "Not available";
  const latestActivity = developmentActivity.activity
    ? `${formatDevelopmentCount(
        developmentActivity.activity.total_permit_count ?? 0,
      )} permits`
    : developmentActivity.source === "loading"
      ? "Checking permits"
      : "No matched summary";
  const schoolAssignmentCount = schoolConstraint.assignments.filter(
    (assignment) => assignment.hasAssignment,
  ).length;
  const schoolStatus =
    schoolConstraint.source === "loading"
      ? "Checking assignments"
      : schoolAssignmentCount > 0
        ? `${schoolAssignmentCount}/3 levels assigned`
        : "Assignment unavailable";
  const transportationStatus =
    transportationContext.source === "loading"
      ? "Checking context"
      : transportationContext.source === "api"
        ? "Context available"
        : "Not available";

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2">
        <CompactParcelLine label="Owner / Account" value={parcel.ownerName ?? "Unavailable"} />
        <CompactParcelLine label="Zoning" value={zoning || formatCompactLabel(parcel.zoningCategory)} />
        <CompactParcelLine
          label="Source"
          value={
            source === "api"
              ? "Live parcel intelligence"
              : source === "fallback"
                ? "Static fallback"
                : "Parcel intelligence"
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BriefStat
          caveat="FEMA NFHL remains authoritative."
          label="Flood"
          value={floodReview}
        />
        <BriefStat
          caveat="Official capacity/enrollment still needed."
          label="Schools"
          value={schoolStatus}
        />
        <BriefStat
          caveat="Observed permit context, not prediction."
          label="Activity"
          value={latestActivity}
        />
        <BriefStat
          caveat="Utility proxy does not confirm capacity."
          label="Utility"
          value="Proxy only"
        />
        <BriefStat
          caveat="Transportation/STIP/AADT context is current-context evidence."
          label="Transportation"
          value={transportationStatus}
        />
        <BriefStat
          caveat={`${developmentModelLabSummary.currentBestInternalVariant}; no parcel prediction is shown.`}
          label="Model"
          value="Internal only"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onFocusMap}
          type="button"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Focus Map
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={() => {
            void onCopyParcelId();
          }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          {parcelIdCopied ? "Copied" : "Copy Parcel ID"}
        </button>
      </div>
    </div>
  );
}

function BriefStat({
  caveat,
  label,
  value,
}: {
  caveat: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-white" title={value}>
        {value}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
        {caveat}
      </p>
    </div>
  );
}

function ReviewMiniBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/18 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-300">{value}</p>
    </div>
  );
}

const dataMethodologyGroups = [
  {
    accent: "#68d8ff",
    items: [
      "Parcels and enriched parcel attributes from PostGIS.",
      "Zoning overlay and zoning QA/intelligence tables.",
      "Permit and development activity summaries.",
      "FEMA NFHL Layer 28 flood zones and parcel flood overlay.",
      "CCS attendance-zone school assignment overlay.",
      "Presentation-derived SY 2024-2025 school utilization seed.",
    ],
    title: "Data Used",
  },
  {
    accent: "#55d38f",
    items: [
      "Parcel detail is descriptive and tied to selected parcel IDs.",
      "Flood constraints are regulatory FEMA polygon-to-parcel overlays.",
      "Permit hotspots summarize observed permit concentration and segmentation.",
      "School assignment uses attendance-zone polygon overlap, not school point distance.",
      "Current intelligence is descriptive; prediction is not active yet.",
    ],
    title: "Methodology",
  },
  {
    accent: "#d8b86a",
    items: [
      "FEMA NFHL is the primary regulatory flood source; older TIFF flood data is reference/future-model context.",
      "School utilization seed is presentation-derived and needs official verification.",
      "public.school_capacity is not populated, so school capacity scoring is disabled.",
      "Permit segmentation is a descriptive signal, not a causal model.",
      "Mock infrastructure/readiness signals remain placeholders until authoritative layers arrive.",
    ],
    title: "Assumptions",
  },
  {
    accent: "#ff8d7a",
    items: [
      "Not all constraint domains are implemented.",
      "Some layer controls are live API layers while others remain mock/readiness placeholders.",
      "No official school capacity, enrollment, or forecast scoring is active.",
      "Local runtime performance depends on browser GPU, ArcGIS assets, and FastAPI/PostGIS availability.",
      "Large polygon layers are capped or extent-filtered for prototype safety.",
    ],
    title: "Limitations",
  },
];

function MethodologyModeContent() {
  return (
    <div className="space-y-4">
      <PanelIntro
        description="What the prototype uses, how signals are derived, and where the current limits are."
        icon={<BookOpen className="h-4 w-4" />}
        title="Model Data & Assumptions"
      />

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-[#68d8ff]" />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Foundation
            </p>
            <h3 className="mt-1 text-base font-semibold text-white">
              Parcel-based planning intelligence
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              CFS treats each parcel as the common planning unit. Zoning,
              permits, FEMA constraints, and attendance-zone assignments are
              joined or overlaid to the parcel so planners can compare growth
              activity and constraint exposure without jumping across separate
              source systems.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {dataMethodologyGroups.map((group) => (
          <MethodologyCard
            accent={group.accent}
            items={group.items}
            key={group.title}
            title={group.title}
          />
        ))}
      </div>

      <CollapsedSection
        defaultOpen
        description="Read-only attendance-zone coverage, QA caveats, and preliminary utilization seed status."
        title="School Constraint Summary"
      >
        <SchoolConstraintSummaryPanel />
      </CollapsedSection>

      <CollapsedSection
        description="Dataset inventory, GIS service onboarding, scenario controls, and mock readiness notes moved out of the map layer rail."
        title="Model Data Registry"
      >
        <GISIntegrationReadinessPanel />
        <DataRegistryPanel />
        <ScenarioControls />
        <MethodologyCompositeSignals />
      </CollapsedSection>

      <section className="rounded-lg border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
          <div>
            <p className="text-xs font-medium uppercase text-[#f0cd79]">
              Current Decision Boundary
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              This prototype supports descriptive due diligence and map
              exploration. It should not be read as a final capacity forecast,
              fiscal impact model, or buildability determination until the
              remaining authoritative constraint and capacity datasets are
              loaded, reviewed, and scored.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Legacy selected-parcel card retained temporarily for rollback while the
// Overview rail uses the new Selected Parcel Brief.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OverviewSelectedParcelSummary({
  developmentActivity,
  floodConstraint,
  onOpenExecutiveSummary,
  onOpenPlanningSnapshot,
  parcel,
  planningSnapshot,
  schoolConstraint,
  source,
}: {
  developmentActivity: SnapshotDevelopmentActivity;
  floodConstraint: SnapshotFloodConstraint;
  onOpenExecutiveSummary: () => void;
  onOpenPlanningSnapshot: () => void;
  parcel: NonNullable<Parameters<typeof ParcelSummaryPanel>[0]["parcel"]>;
  planningSnapshot: PlanningSnapshot | null;
  schoolConstraint: SnapshotSchoolConstraint;
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
}) {
  const neighborhood = [parcel.neighborhood, parcel.subdivision]
    .filter(Boolean)
    .join(" / ");
  const zoning = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const floodReview =
    floodConstraint.constraint?.flood_review_required === true
      ? "Engineering review recommended"
      : floodConstraint.constraint?.flood_review_required === false
        ? "Not flagged"
        : floodConstraint.source === "loading"
          ? "Checking FEMA overlay"
          : "Flood status unavailable";
  const latestActivity = developmentActivity.activity
    ? `${formatDevelopmentDate(
        developmentActivity.activity.latest_permit_date,
      )} · ${formatDevelopmentLabel(
        developmentActivity.activity.latest_permit_status,
      )}`
    : developmentActivity.source === "loading"
      ? "Checking permit activity"
      : "No matched activity summary";
  const elementaryAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "Elementary",
    )?.schoolName ?? "Checking assignment";
  const middleAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "Middle",
    )?.schoolName ?? "Checking assignment";
  const highAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "High",
    )?.schoolName ?? "Checking assignment";
  const snapshotMatchesParcel =
    planningSnapshot?.selectedParcelId === parcel.officialParcelId;

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold text-white">
            {parcel.officialParcelId}
          </h3>
          <p className="mt-1 text-[11px] uppercase text-slate-500">
            {source === "api"
              ? "Live parcel intelligence"
              : source === "fallback"
                ? "Static fallback"
                : "Parcel intelligence"}
          </p>
        </div>
        <MapPin className="h-4 w-4 shrink-0 text-[#d8b86a]" />
      </div>

      <div className="mt-3 grid gap-2">
        <CompactParcelLine label="Owner / Account" value={parcel.ownerName ?? "Unavailable"} />
        <CompactParcelLine label="Neighborhood" value={neighborhood || "Unavailable"} />
        <CompactParcelLine label="Zoning" value={zoning || formatCompactLabel(parcel.zoningCategory)} />
        <CompactParcelLine label="Flood Review" value={floodReview} />
        <CompactParcelLine label="Latest Activity" value={latestActivity} />
      </div>

      <OverviewSchoolSnapshot
        elementaryAssignment={elementaryAssignment}
        highAssignment={highAssignment}
        middleAssignment={middleAssignment}
        scoreLabel={schoolConstraint.scoreLabel ?? "Not scored"}
        source={schoolConstraint.source}
      />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
          onClick={onOpenPlanningSnapshot}
          type="button"
        >
          Open Planning Snapshot
        </button>
        <button
          className="rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onOpenExecutiveSummary}
          type="button"
        >
          Executive Summary
        </button>
      </div>

      {snapshotMatchesParcel ? (
        <div className="mt-3 rounded-md border border-[#55d38f]/22 bg-[#55d38f]/[0.07] px-3 py-2 text-xs leading-5 text-[#9ff0bd]">
          Latest Planning Snapshot matches this parcel.
        </div>
      ) : null}
    </section>
  );
}

interface SnapshotDevelopmentActivity {
  activity: {
    development_activity_class?: string | null;
    latest_permit_date?: string | null;
    latest_permit_status?: string | null;
    total_permit_count?: number | null;
  } | null;
  source: string;
}

interface SnapshotFloodConstraint {
  constraint: {
    buildability_impact?: string | null;
    dominant_flood_zone?: string | null;
    flood_review_required?: boolean | null;
    floodway_present?: boolean | null;
    percent_parcel_constrained?: number | null;
    sfha_present?: boolean | null;
  } | null;
  source: string;
}

interface SnapshotSchoolConstraint {
  assignments: Array<{
    confidenceLabel?: string | null;
    hasAssignment: boolean;
    levelLabel: string;
    schoolName: string;
    utilizationLabel: string;
  }>;
  scoreLabel?: string | null;
  source: ReturnType<typeof useSelectedParcelSchoolConstraint>["source"];
}

interface PlanningMapSnapshotCapture {
  cameraSummary?: string;
  capturedAt?: string | null;
  dataUrl?: string | null;
  extentSummary?: string;
  failureReason?: string | null;
  status: "captured" | "failed" | "unavailable";
}

const MAP_SNAPSHOT_CAPTURE_TIMEOUT_MS = 4500;

function createIndicatorCenterSnapshotCapture(): PlanningMapSnapshotCapture {
  return {
    capturedAt: new Date().toISOString(),
    failureReason: "Indicator Center snapshot - monitoring dashboard context, no map image required.",
    status: "unavailable",
  };
}

const defaultPlanningSnapshotIncludedSections: Record<
  PlanningSnapshotSectionKey,
  boolean
> = {
  data_needed_caveats: true,
  development_permits: true,
  fema_flood: true,
  map_view: true,
  model_governance: true,
  new_construction: true,
  parcel_facts: true,
  recommended_actions: true,
  schools: true,
  transportation: true,
  utility_proxy: true,
  zoning_planning: true,
};

function formatResearchBandLabel(value: string | null | undefined) {
  switch (value) {
    case "top_1_percent_research_band":
    case "top_5_percent_research_band":
      return "Very Strong Research Signal";
    case "top_15_percent_research_band":
      return "Strong Research Signal";
    case "remaining_research_band":
      return "Lower Research Signal";
    case "insufficient_data":
      return "Insufficient Data";
    default:
      return "Relative Research Signal";
  }
}

function getModelResearchHighlightExplanation(
  context: ModelResearchPreviewMarker,
) {
  const driverFamilies = getModelResearchDriverFamilies(context.topDrivers);

  if (driverFamilies.length) {
    return `This area is highlighted because its ${formatDriverFamilyList(
      driverFamilies,
    )} context resembles places where new construction occurred historically.`;
  }

  return "This area is highlighted because it falls into a higher relative research band in the internal development model preview.";
}

function formatModelResearchBandDistribution(
  counts: ModelResearchPreviewMarker["bandCounts"],
) {
  if (!counts) {
    return "Band distribution unavailable";
  }

  const parts = [
    ["Very Strong", counts.veryStrong],
    ["Strong", counts.strong],
    ["Moderate", counts.moderate],
    ["Lower", counts.lower],
    ["Insufficient", counts.insufficient],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label}: ${formatDevelopmentCount(Number(count))}`);

  return parts.length ? parts.join(" / ") : "Band distribution unavailable";
}

function formatSelectedModelResearchDisplayMode(
  mode: ModelResearchMapSummary["displayMode"],
) {
  switch (mode) {
    case "countywide_heatmap":
      return "Relative research heatmap";
    case "clustered_markers":
      return "Count-scaled clusters";
    case "intermediate_subclusters":
      return "Intermediate sub-clusters";
    case "fine_local_clusters":
      return "Fine local clusters";
    case "parcel_detail":
      return "Parcel detail markers";
    default:
      return "Overlay off";
  }
}

function getSelectedModelResearchContextTitle(
  context: ModelResearchPreviewMarker,
) {
  const representedCount = context.representedFeatureCount ?? 1;

  if (
    representedCount === 1 ||
    (context.contextKind !== "cluster" &&
      context.contextKind !== "heatmap_cell")
  ) {
    return "Selected Research Feature";
  }

  return "Selected Research Cluster";
}

function getSelectedModelResearchContextHeading(
  context: ModelResearchPreviewMarker,
) {
  const representedCount = context.representedFeatureCount ?? 1;

  if (
    context.approximateAreaLabel &&
    !context.approximateAreaLabel.includes(["1", "parcels"].join(" "))
  ) {
    return context.approximateAreaLabel;
  }

  if (
    representedCount === 1 &&
    context.officialParcelId &&
    context.officialParcelId !== "research_cluster"
  ) {
    return context.officialParcelId;
  }

  if (representedCount === 1) {
    return "Single research feature";
  }

  return `Research cluster of ${formatDevelopmentCount(representedCount)} parcels`;
}

function formatRepresentedResearchCount(count: number) {
  return count === 1
    ? "1 parcel represented"
    : `${formatDevelopmentCount(count)} parcels represented`;
}

function getModelResearchDriverFamilies(drivers: string[]) {
  const families: string[] = [];

  drivers.forEach((driver) => {
    const normalized = driver.toLowerCase();
    if (normalized.includes("zoning") && !families.includes("zoning")) {
      families.push("zoning");
    } else if (
      (normalized.includes("transportation") ||
        normalized.includes("road") ||
        normalized.includes("aadt") ||
        normalized.includes("stip")) &&
      !families.includes("transportation")
    ) {
      families.push("transportation");
    } else if (
      (normalized.includes("tax") ||
        normalized.includes("value") ||
        normalized.includes("valuation")) &&
      !families.includes("tax/value")
    ) {
      families.push("tax/value");
    } else if (
      (normalized.includes("permit") ||
        normalized.includes("construction")) &&
      !families.includes("new construction")
    ) {
      families.push("new construction");
    }
  });

  return families.slice(0, 3);
}

function formatDriverFamilyList(families: string[]) {
  if (families.length === 1) {
    return families[0];
  }

  if (families.length === 2) {
    return `${families[0]} and ${families[1]}`;
  }

  return `${families.slice(0, -1).join(", ")}, and ${
    families[families.length - 1]
  }`;
}

function getModelResearchLegendModeHint(
  overlayEnabled: boolean,
  mode: ModelResearchMapSummary["displayMode"],
) {
  if (!overlayEnabled || mode === "off") {
    return "Turn on Development Research Signal to show relative research context. Relative research signal only. Not exact probability.";
  }

  if (mode === "countywide_heatmap") {
    return "Warmer areas show stronger relative research signal concentration. Relative research signal only. Not exact probability.";
  }

  if (mode === "clustered_markers") {
    return "Marker size represents the number of parcels or features in the cluster. Marker color represents the dominant research band. Relative research signal only.";
  }

  if (mode === "intermediate_subclusters") {
    return "Large concentrations split into count-labeled sub-clusters. Marker size shows represented research records; color shows the dominant research band.";
  }

  if (mode === "fine_local_clusters") {
    return "Fine local clusters group only nearby overlapping records before parcel detail appears. Counts are relative research records, not probabilities.";
  }

  return "Marker color represents the parcel-safe research band. Relative research signal only. Not exact probability.";
}

function formatOverviewCommandModeLabel(mode: OverviewCommandMode) {
  if (mode === "modelLab") {
    return "Model Lab";
  }

  if (mode === "countywide") {
    return "Explore Countywide";
  }

  if (mode === "indicatorCenter") {
    return "Indicator Center";
  }

  if (mode === "snapshot") {
    return "Planning Snapshot";
  }

  return "Parcel Search";
}

function getPlanningFocusModeForOverviewMode(
  mode: OverviewCommandMode,
  hasSelectedParcel: boolean,
): PlanningReviewFocusMode {
  if (hasSelectedParcel) {
    return "parcel_lookup";
  }

  if (mode === "countywide") {
    return "development_activity";
  }

  if (mode === "indicatorCenter") {
    return "development_activity";
  }

  return "planning_snapshot_report";
}

function getSnapshotFocusLabelForOverviewMode(
  mode: OverviewCommandMode,
  hasSelectedParcel: boolean,
) {
  if (hasSelectedParcel && mode === "modelLab") {
    return "Model Lab Parcel Context Snapshot";
  }

  if (hasSelectedParcel) {
    return "Selected Parcel Snapshot";
  }

  if (mode === "modelLab") {
    return "Model Lab Research Snapshot";
  }

  if (mode === "countywide") {
    return "Countywide Intelligence Snapshot";
  }

  if (mode === "indicatorCenter") {
    return "Indicator Center Snapshot";
  }

  if (mode === "snapshot") {
    return "Planning Snapshot Context";
  }

  return "Workspace Context Snapshot";
}

async function captureMapSnapshotForPlanning(): Promise<PlanningMapSnapshotCapture> {
  if (typeof window === "undefined") {
    return {
      failureReason: "Map screenshot capture is only available in the browser.",
      status: "unavailable",
    };
  }

  const cfsWindow = window as Window & {
    __cfsCaptureMapSnapshot?: () => Promise<PlanningMapSnapshotCapture>;
  };

  if (!cfsWindow.__cfsCaptureMapSnapshot) {
    return {
      failureReason: "SceneView screenshot helper is not available.",
      status: "unavailable",
    };
  }

  try {
    const timeoutCapture = new Promise<PlanningMapSnapshotCapture>((resolve) => {
      window.setTimeout(() => {
        resolve({
          capturedAt: new Date().toISOString(),
          failureReason:
            "SceneView screenshot capture timed out; snapshot was saved without a map image.",
          status: "failed",
        });
      }, MAP_SNAPSHOT_CAPTURE_TIMEOUT_MS);
    });

    return await Promise.race([
      cfsWindow.__cfsCaptureMapSnapshot(),
      timeoutCapture,
    ]);
  } catch (error) {
    return {
      capturedAt: new Date().toISOString(),
      failureReason:
        error instanceof Error
          ? error.message
          : "Map screenshot capture failed.",
      status: "failed",
    };
  }
}

function buildPlanningSnapshot({
  activeLayerIds,
  activeLayerLabels,
  developmentHotspotControls,
  developmentActivity,
  focusMode,
  focusModeLabel,
  floodConstraint,
  mapSnapshot,
  modelResearchOverlayEnabled,
  modelResearchViewMode,
  modelResearchMapSummary,
  overviewCommandMode,
  parcel,
  schoolConstraint,
  selectedDevelopmentHotspotContext,
  selectedIndicatorCenterDisplayMode,
  selectedIndicatorCenterGroupIds,
  selectedIndicatorCenterContext,
  selectedIndicatorCenterSummaries,
  selectedModelResearchContext,
}: {
  activeLayerIds: string[];
  activeLayerLabels: string[];
  developmentHotspotControls: ReturnType<typeof useDashboardState>["developmentHotspotControls"];
  developmentActivity: SnapshotDevelopmentActivity;
  focusMode: PlanningReviewFocusMode;
  focusModeLabel: string;
  floodConstraint: SnapshotFloodConstraint;
  mapSnapshot: PlanningMapSnapshotCapture;
  modelResearchOverlayEnabled: boolean;
  modelResearchViewMode: ReturnType<typeof useDashboardState>["modelResearchViewMode"];
  modelResearchMapSummary: ModelResearchMapSummary;
  overviewCommandMode: OverviewCommandMode;
  parcel: Parameters<typeof ParcelSummaryPanel>[0]["parcel"] | null;
  schoolConstraint: SnapshotSchoolConstraint;
  selectedDevelopmentHotspotContext: SelectedDevelopmentHotspotContext | null;
  selectedIndicatorCenterDisplayMode: IndicatorCenterDisplayMode;
  selectedIndicatorCenterGroupIds: IndicatorCenterGroupId[];
  selectedIndicatorCenterContext: IndicatorCenterContext | null;
  selectedIndicatorCenterSummaries: PlanningSnapshotIndicatorSummary[];
  selectedModelResearchContext: ModelResearchPreviewMarker | null;
}): PlanningSnapshot {
  const createdAt = new Date().toISOString();
  const overviewModeLabel = formatOverviewCommandModeLabel(overviewCommandMode);
  const developmentActivityContext =
    overviewCommandMode === "countywide"
      ? serializeDevelopmentActivitySnapshotContext(
          selectedDevelopmentHotspotContext,
          developmentHotspotControls,
        )
      : null;
  const modelLabContext =
    overviewCommandMode === "modelLab"
      ? {
          displayMode: modelResearchMapSummary.displayMode,
          displayModeLabel: modelResearchMapSummary.displayModeLabel,
          dominantSignalLabel: modelResearchMapSummary.dominantSignalLabel,
          overlayEnabled: modelResearchOverlayEnabled,
          selectedResearchContext: serializeModelResearchSnapshotContext(
            selectedModelResearchContext,
          ),
          status: modelResearchOverlayEnabled
            ? "safe_research_overlay_enabled_without_exact_probabilities"
            : "research_overlay_off_by_default",
          viewMode: modelResearchViewMode,
          viewModeLabel: formatMapOverlayViewMode(modelResearchViewMode),
          visibleFeatureCount: modelResearchMapSummary.visibleFeatureCount,
        }
      : undefined;
  const indicatorCenterContext =
    overviewCommandMode === "indicatorCenter"
      ? serializeIndicatorCenterSnapshotContext({
          displayMode: selectedIndicatorCenterDisplayMode,
          indicatorSummaries: selectedIndicatorCenterSummaries,
          selectedGroupIds: selectedIndicatorCenterGroupIds,
          selectedIndicator: selectedIndicatorCenterContext,
        })
      : undefined;

  if (!parcel) {
    return buildContextOnlyPlanningSnapshot({
      activeLayerIds,
      activeLayerLabels,
      createdAt,
      focusMode,
      focusModeLabel,
      mapSnapshot,
      developmentActivityContext,
      indicatorCenterContext,
      modelLabContext,
      modelResearchMapSummary,
      overviewCommandMode,
      overviewModeLabel,
      schoolConstraint,
    });
  }

  const zoning = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const address = [parcel.mailingAddress, parcel.mailingCity, parcel.mailingState]
    .filter(Boolean)
    .join(", ");
  const flood = floodConstraint.constraint;
  const activity = developmentActivity.activity;
  const assignments = schoolConstraint.assignments;
  const schoolSummary =
    assignments
      .map((assignment) => `${assignment.levelLabel}: ${assignment.schoolName}`)
      .join(" / ") || "School assignment not available";
  const floodValue = flood?.flood_review_required
    ? "Review Required"
    : flood
      ? "Not Flagged"
      : floodConstraint.source === "loading"
        ? "Checking FEMA overlay"
        : "Not Available";

  return {
    activeLayerIds,
    activeLayers: activeLayerLabels.length
      ? activeLayerLabels
      : ["No optional overlays active at capture time"],
    caveats: [
      "Snapshot is a saved front-end review context, not a new official record.",
      "Workspace context organizes report evidence; it does not create a public model layer.",
      "FEMA NFHL remains authoritative for regulatory flood review.",
      "School utilization is presentation-derived and requires official verification.",
      "Utility proxy context does not confirm available service capacity.",
      `Internal model research is aggregate-only; current best variant is ${developmentModelLabSummary.currentBestInternalVariant}, and no parcel-level predictions are stored or shown.`,
      ...(overviewCommandMode === "modelLab"
        ? [
            "Model Lab research preview is internal-only and does not show exact probabilities or official parcel classes.",
          ]
        : []),
      ...(developmentActivityContext
        ? [
            "Development Hotspots summarize observed permit/development activity only. They are not predictions.",
          ]
        : []),
      ...(indicatorCenterContext
        ? [
            "Indicator Center snapshots summarize monitoring indicators, attention flags, and data gaps. They are not official determinations.",
          ]
        : []),
      ...(mapSnapshot.status === "captured"
        ? []
        : [
            `Map screenshot unavailable: ${
              mapSnapshot.failureReason ??
              "SceneView did not provide a map image."
            }`,
          ]),
    ],
    createdAt,
    explainableMetrics: [
      {
        caveat:
          "The saved command context frames the report; it does not alter source records.",
        label: "Snapshot Context",
        meaning:
          "Shows whether the snapshot was saved from a selected parcel or the broader map context.",
        method:
          "CFS records the active Workspace context with the saved report evidence.",
        recommendedAction:
          "Use this label to frame the executive summary and staff follow-up discussion.",
        source: "CFS Workspace mode state",
        value: focusModeLabel,
      },
      {
        caveat:
          "Workspace mode records the product workspace used at capture time; it is not a prediction feature.",
        label: "Workspace Mode",
        meaning:
          "Shows whether the snapshot came from parcel search, countywide intelligence, Model Lab, or snapshot workflow context.",
        method:
          "CFS stores the active Workspace mode alongside map and intelligence context.",
        recommendedAction:
          "Use the mode label to explain why the report emphasizes parcel facts, countywide indicators, or model governance.",
        source: "CFS Workspace mode state",
        value: overviewModeLabel,
      },
      ...(indicatorCenterContext
        ? [createIndicatorCenterSnapshotMetric(indicatorCenterContext)]
        : []),
      {
        caveat:
          mapSnapshot.status === "captured"
            ? "The image reflects the browser SceneView at capture time."
            : "The snapshot was saved without a map image because capture was unavailable.",
        label: "Map Snapshot",
        meaning:
          "Shows whether the report includes a captured image of the current CFS map view.",
        method:
            "CFS saves the current map view, selected parcel if available, active layers, and Intelligence Brief into a report-ready Planning Snapshot.",
        recommendedAction:
          mapSnapshot.status === "captured"
            ? "Use the image as visual context, not as an official GIS export."
            : "Reopen Overview and save another snapshot if a map image is needed.",
        source: "ArcGIS SceneView browser screenshot",
        value:
          mapSnapshot.status === "captured"
            ? "Captured"
            : mapSnapshot.status === "failed"
              ? "Capture Failed"
              : "Unavailable",
      },
      {
        caveat:
          "FEMA NFHL remains the authoritative regulatory flood source.",
        label: "Flood Review Status",
        meaning:
          "Indicates whether the selected parcel intersects FEMA flood hazard context requiring review.",
        method:
          "Parcel geometry is compared against FEMA flood hazard polygons and summarized as review context.",
        recommendedAction: flood?.flood_review_required
          ? "Confirm floodplain requirements during formal review."
          : "Keep FEMA review available for due diligence records.",
        source: "FEMA NFHL parcel flood overlay",
        value: floodValue,
      },
      {
        caveat:
          "Official school capacity/enrollment is not fully integrated yet.",
        label: "School Assignment",
        meaning:
          "Shows CCS V1 attendance-zone assignments generated by polygon overlap.",
        method:
          "Parcel geometry is joined to elementary, middle, and high school attendance zones.",
        recommendedAction:
          "Verify capacity/enrollment when official school data is received.",
        source: "School attendance zone GIS layers",
        value: schoolSummary,
      },
      {
        caveat:
          "Permit activity is observed context and does not prove future development.",
        label: "Development Activity",
        meaning:
          "Summarizes historical permit activity associated with the selected parcel.",
        method:
          "CFS matches permit activity records to the selected parcel and summarizes counts and latest status.",
        recommendedAction:
          "Review source permit records when recent or high-value activity appears.",
        source: "Permit and development activity tables",
        value: activity
          ? `${formatDevelopmentCount(activity.total_permit_count ?? 0)} permits / ${formatDevelopmentLabel(
              activity.development_activity_class,
            )}`
          : "Not Available",
      },
      ...(developmentActivityContext
        ? [
            createDevelopmentActivitySnapshotMetric(
              developmentActivityContext,
            ),
          ]
        : []),
      {
        caveat:
          "Utility proxy context does not confirm available sewer or water capacity.",
        label: "Utility Proxy",
        meaning:
          "Shows proximity/service context only; it is not a confirmed capacity finding.",
        method:
          "CFS displays available utility proxy context and names provider verification as the next step.",
        recommendedAction:
          "Confirm service readiness and capacity with WSACC or the relevant utility provider.",
        source: "Utility proxy and planning context layers",
        value: "Proxy Only",
      },
      {
        caveat:
          "Transportation features are current-context unless dated historical transportation/project data is available.",
        label: "Transportation Context",
        meaning:
          "Shows road, rail, STIP, and traffic context as planning evidence, not as a parcel decision score.",
        method:
          "CFS summarizes transportation accessibility and project/traffic context from prepared transportation feature tables.",
        recommendedAction:
          "Confirm dated local transportation projects and access constraints for formal review.",
        source: "Transportation accessibility, STIP, and AADT context",
        value: "Current Context Only",
      },
      {
        caveat:
          `Current best internal variant is ${developmentModelLabSummary.currentBestInternalVariant}. No exact parcel probability or parcel-level ranking class is exposed.`,
        label: "Internal Model Research Status",
        meaning:
          "Shows aggregate model governance only so staff understand model readiness boundaries.",
        method:
          "CFS compares internal feature groups against historical new construction outcomes for research QA.",
        recommendedAction:
          "Use model notes as governance context only; do not use as parcel-level decision output.",
        source: "CFS internal model QA outputs",
        value: developmentModelLabSummary.currentBestInternalVariant,
      },
      ...(overviewCommandMode === "modelLab"
        ? [
            {
              caveat:
                modelLabContext?.selectedResearchContext
                  ? `${modelLabContext.selectedResearchContext.caveat} No exact probabilities, hidden model outputs, or official parcel classes are stored.`
                  : "Model Lab snapshots include research governance context only. No exact probabilities, hidden model outputs, or official parcel classes are stored.",
              label: "Model Lab Context",
              meaning:
                "Shows that the snapshot was captured from internal development model research mode.",
              method:
                "CFS records the relative research signal band, selected safe context if available, and safety status without storing hidden model scores.",
              recommendedAction:
                "Use as internal research context to guide questions; do not treat it as an official parcel output.",
              source: "CFS internal model QA outputs",
              value: modelLabContext?.selectedResearchContext
                ? formatRelativeDevelopmentSignalBand({
                    rankBand:
                      modelLabContext.selectedResearchContext.researchRankBand,
                    signalLabel:
                      modelLabContext.selectedResearchContext.researchSignalLabel,
                  })
                : modelResearchOverlayEnabled
                  ? "Development Research Signal active"
                  : "Research overlay off by default",
            },
            ...(modelLabContext?.selectedResearchContext
              ? [
                  {
                    caveat:
                      "This is an internal research preview. It does not show exact parcel development probability and is not an official parcel score.",
                    label: "Model Signal Rationale",
                    meaning:
                      "Explains why the selected marker was highlighted in the research overlay.",
                    method:
                      "CFS summarizes top contextual drivers from the safe research-preview record.",
                    recommendedAction:
                      "Review zoning, transportation access, valuation context, and historical new construction patterns before using this as staff discussion context.",
                    source: "CFS internal model QA outputs",
                    value: getModelResearchHighlightExplanation({
                      caveat: modelLabContext.selectedResearchContext.caveat,
                      centroid: {
                        latitude: 0,
                        longitude: 0,
                      },
                      dataQualityFlag:
                        modelLabContext.selectedResearchContext.dataQualityFlag,
                      exactProbabilityAvailable: false,
                      modelVersion:
                        modelLabContext.selectedResearchContext.modelVersion,
                      officialParcelId:
                        modelLabContext.selectedResearchContext.officialParcelId,
                      productionReady: false,
                      publicExposureAllowed: false,
                      researchRankBand:
                        modelLabContext.selectedResearchContext.researchRankBand,
                      researchSignalLabel:
                        modelLabContext.selectedResearchContext.researchSignalLabel,
                      topDrivers:
                        modelLabContext.selectedResearchContext.topDrivers,
                    }),
                  },
                ]
              : []),
          ]
        : []),
    ],
    includedSections: { ...defaultPlanningSnapshotIncludedSections },
    focusMode,
    focusModeLabel,
    keyFacts: [
      { label: "Snapshot context", value: focusModeLabel },
      { label: "Workspace mode", value: overviewModeLabel },
      { label: "Intelligence Brief", value: "Selected Parcel Intelligence" },
      { label: "Selected parcel", value: parcel.officialParcelId },
      { label: "Owner / account", value: parcel.ownerName ?? "Not Available" },
      { label: "Zoning", value: zoning || formatCompactLabel(parcel.zoningCategory) },
      {
        label: "Planning jurisdiction",
        value:
          parcel.planningJurisdiction ??
          parcel.zoningJurisdiction ??
          "Not Available",
      },
      {
        label: "Active overlays",
        value: activeLayerLabels.length ? activeLayerLabels.join(", ") : "None",
      },
      {
        label: "Development model",
        value: `${developmentModelLabSummary.currentBestInternalVariant} / Internal research only`,
      },
      ...(modelLabContext
        ? [
            {
              label: "Model map display",
              value: modelLabContext.overlayEnabled
                ? modelLabContext.displayModeLabel ?? "Development Research Signal active"
                : "Development Research Signal off",
            },
          ]
        : []),
      ...(modelLabContext?.selectedResearchContext
        ? [
            {
              label: "Selected research context",
              value: formatRelativeDevelopmentSignalBand({
                rankBand: modelLabContext.selectedResearchContext.researchRankBand,
                signalLabel:
                  modelLabContext.selectedResearchContext.researchSignalLabel,
              }),
            },
          ]
        : []),
      ...(developmentActivityContext
        ? [
            {
              label: "Selected development activity",
              value: `${developmentActivityContext.areaLabel} / ${formatDevelopmentCount(
                developmentActivityContext.recordsRepresented,
              )} records`,
            },
          ]
        : []),
      ...(indicatorCenterContext
        ? [
            {
              label: "Indicator Center context",
              value: indicatorCenterContext.selectedIndicator
                ? `${indicatorCenterContext.selectedIndicator.name} / ${indicatorCenterContext.selectedIndicator.status}`
                : `${indicatorCenterContext.selectedGroupIds.length} review groups enabled`,
            },
            {
              label: "Indicator display",
              value: getIndicatorCenterDisplayModeLabel(
                indicatorCenterContext.displayMode,
              ),
            },
            {
              label: "Indicator summaries",
              value: `${indicatorCenterContext.indicatorSummaries.length} cards captured`,
            },
          ]
        : []),
      {
        label: "Map image",
        value:
          mapSnapshot.status === "captured"
            ? "Captured"
            : mapSnapshot.status === "failed"
              ? "Capture Failed"
              : "Unavailable",
      },
    ],
    knownReviewFlags: [
      {
        label: "Snapshot context",
        reason: `Snapshot was saved from ${focusModeLabel.toLowerCase()} context.`,
        status: "Saved Context",
      },
      {
        label: "Flood review",
        reason:
          flood?.flood_review_required === true
            ? "FEMA flood context is flagged for staff review."
            : "No FEMA flood review flag was returned at capture time.",
        status: floodValue,
      },
      {
        label: "School capacity",
        reason:
          "Official enrollment/capacity data is not loaded, so school capacity scoring is disabled.",
        status: "Capacity Data Needed",
      },
      {
        label: "Utility capacity",
        reason:
          "Utility proxy context is available, but true available capacity is not confirmed.",
        status: "Proxy Only",
      },
      {
        label: "Model output",
        reason:
          `Internal model research remains aggregate-only. ${developmentModelLabSummary.currentBestInternalVariant} is not exposed as a parcel-level output.`,
        status: "Not Public-Facing",
      },
      {
        label: "Map snapshot",
        reason:
          mapSnapshot.status === "captured"
            ? "SceneView image was captured for the report."
            : mapSnapshot.failureReason ??
              "SceneView image was not available when the snapshot was saved.",
        status:
          mapSnapshot.status === "captured"
            ? "Captured"
            : mapSnapshot.status === "failed"
              ? "Capture Failed"
              : "Unavailable",
      },
      ...(developmentActivityContext
        ? [
            {
              label: "Development activity context",
              reason:
                "A Development Hotspots cluster or feature was selected when the snapshot was saved.",
              status:
                developmentActivityContext.contextKind === "cluster"
                  ? "Cluster selected"
                  : "Feature selected",
            },
          ]
        : []),
      ...(indicatorCenterContext
        ? [
            {
              label: "Indicator Center context",
              reason: indicatorCenterContext.selectedIndicator
                ? `${indicatorCenterContext.selectedIndicator.name} was selected as a review indicator when the snapshot was saved.`
                : `${indicatorCenterContext.indicatorSummaries.length} Indicator Center summary cards were captured.`,
              status: indicatorCenterContext.selectedIndicator
                ? indicatorCenterContext.selectedIndicator.status
                : getIndicatorCenterDisplayModeLabel(
                    indicatorCenterContext.displayMode,
                  ),
            },
          ]
        : []),
    ],
    mapContext: {
      cameraSummary: mapSnapshot.cameraSummary,
      description:
        activeLayerLabels.length > 0
          ? `Snapshot captured from ${focusModeLabel} with ${activeLayerLabels.join(", ")} active.`
          : `Snapshot captured from ${focusModeLabel} with no optional overlays active.`,
      extentCaptured: Boolean(mapSnapshot.extentSummary),
      extentSummary: mapSnapshot.extentSummary,
    },
    mapScreenshotCapturedAt: mapSnapshot.capturedAt ?? null,
    mapScreenshotDataUrl: mapSnapshot.dataUrl ?? null,
    mapScreenshotFailureReason: mapSnapshot.failureReason ?? null,
    mapScreenshotStatus: mapSnapshot.status,
    developmentActivityContext,
    indicatorCenterContext,
    modelLabContext,
    overviewCommandMode,
    overviewKpis: [
      {
        caveat: "Snapshot context is a workflow label, not a data source.",
        label: "Snapshot Context",
        value: focusModeLabel,
      },
      {
        caveat: "Descriptive source context only.",
        label: "Selected Parcel",
        value: parcel.officialParcelId,
      },
      {
        caveat: "Zoning context is not a development entitlement decision.",
        label: "Zoning Context",
        value: zoning || formatCompactLabel(parcel.zoningCategory),
      },
      {
        caveat: "Missing capacity is not confirmed school impact.",
        label: "School Score",
        value: schoolConstraint.scoreLabel || "Not scored",
      },
      {
        caveat: "Model outputs remain hidden and internal-only.",
        label: "Model Governance",
        value: `${developmentModelLabSummary.currentBestInternalVariant} / Internal research only`,
      },
    ],
    selectedParcelId: parcel.officialParcelId,
    selectedParcelSummary: {
      acreageOrSize: formatCompactLabel(parcel.parcelSizeCategory),
      address: address || "Not Available",
      assessedValue:
        typeof parcel.assessedValue === "number"
          ? formatCurrency(parcel.assessedValue)
          : "Not Available",
      marketValue:
        typeof parcel.marketValue === "number"
          ? formatCurrency(parcel.marketValue)
          : "Not Available",
      officialParcelId: parcel.officialParcelId,
      ownerOrAccount: parcel.ownerName ?? "Not Available",
      parcelQualityStatus: formatCompactLabel(parcel.parcelQualityStatus),
      pin14: parcel.pin14 ?? "Not Available",
      planningJurisdiction:
        parcel.planningJurisdiction ??
        parcel.zoningJurisdiction ??
        "Not Available",
      zoning: zoning || formatCompactLabel(parcel.zoningCategory),
    },
    snapshotId: `${
      indicatorCenterContext ? "phase28i" : "phase26a"
    }-${parcel.officialParcelId}-${Date.now()}`,
    snapshotVersion: indicatorCenterContext ? "phase28i_v1" : "phase26a_v1",
  };
}

function serializeModelResearchSnapshotContext(
  context: ModelResearchPreviewMarker | null,
):
  | NonNullable<
      NonNullable<PlanningSnapshot["modelLabContext"]>["selectedResearchContext"]
    >
  | null {
  if (!context) {
    return null;
  }

  return {
    approximateAreaLabel: context.approximateAreaLabel,
    bandCounts: context.bandCounts,
    caveat: context.caveat,
    clusterId: context.clusterId,
    contextKind: context.contextKind,
    dataQualityFlag: context.dataQualityFlag,
    displayMode: context.displayMode,
    dominantResearchBand: context.dominantResearchBand,
    modelVersion: context.modelVersion,
    officialParcelId: context.officialParcelId,
    representativeSignalLabel: context.representativeSignalLabel,
    representedFeatureCount: context.representedFeatureCount,
    researchRankBand: context.researchRankBand,
    researchSignalLabel: context.researchSignalLabel,
    selectedFeatureGroupSummary: context.selectedFeatureGroupSummary,
    topDriverSummary: context.topDriverSummary,
    topDrivers: context.topDrivers,
  };
}

function serializeDevelopmentActivitySnapshotContext(
  context: SelectedDevelopmentHotspotContext | null,
  controls: ReturnType<typeof useDashboardState>["developmentHotspotControls"],
): PlanningSnapshotDevelopmentActivityContext | null {
  if (!context) {
    return null;
  }

  const yearStart = controls.permitYearStart;
  const yearEnd = controls.permitYearEnd;

  return {
    activityClass: context.activityClass,
    areaLabel: context.areaLabel,
    caveat: context.caveat,
    contextKind: context.contextKind,
    displayMode: context.displayMode,
    dominantActivityType: context.dominantActivityType,
    dominantPermitSegment: context.dominantPermitSegment,
    highValuePermits: context.highValuePermits,
    latestActivityLabel: context.latestActivityLabel,
    majorValuePermits: context.majorValuePermits,
    officialParcelId: context.officialParcelId,
    parcelsRepresented: context.parcelsRepresented,
    permitYearRange:
      yearStart || yearEnd
        ? {
            end: yearEnd,
            label:
              yearStart && yearEnd
                ? `${yearStart}-${yearEnd}`
                : yearStart
                  ? `Since ${yearStart}`
                  : `Through ${yearEnd}`,
            start: yearStart,
          }
        : undefined,
    pin14: context.pin14,
    recentPermitCount1yr: context.recentPermitCount1yr,
    recentPermitCount3yr: context.recentPermitCount3yr,
    recordsRepresented: context.recordsRepresented,
    selectedPermitSegment: context.selectedPermitSegment,
    segmentCounts: context.segmentCounts,
    topDrivers: context.topDrivers,
    totalPermitCount: context.totalPermitCount,
    viewMode: controls.viewMode,
    viewModeLabel: formatMapOverlayViewMode(controls.viewMode),
    whyHighlighted: context.whyHighlighted,
    zoningJurisdictionName: context.zoningJurisdictionName,
  };
}

function serializeIndicatorCenterSnapshotContext(
  {
    displayMode,
    indicatorSummaries,
    selectedGroupIds,
    selectedIndicator,
  }: {
    displayMode: IndicatorCenterDisplayMode;
    indicatorSummaries: PlanningSnapshotIndicatorSummary[];
    selectedGroupIds: IndicatorCenterGroupId[];
    selectedIndicator: IndicatorCenterContext | null;
  },
): PlanningSnapshotIndicatorCenterContext {
  return {
    availableGroups: indicatorCenterDefinitions.map(
      (indicator) => indicator.name,
    ),
    caveat:
      "Indicator Center summarizes existing CFS attention flags, observed activity, data gaps, and review indicators. These are monitoring indicators, not official determinations.",
    displayMode,
    indicatorSummaries,
    recommendedFollowUp:
      selectedIndicator?.recommendedFollowUp ??
      "Use Indicator Center to choose the source records or official datasets that need follow-up.",
    selectedIndicator,
    selectedGroupIds,
  };
}

function createIndicatorCenterSnapshotMetric(
  context: PlanningSnapshotIndicatorCenterContext,
): PlanningSnapshot["explainableMetrics"][number] {
  const selected = context.selectedIndicator;

  return {
    caveat: selected?.caveat ?? context.caveat,
    label: "Indicator Center Context",
    meaning:
      selected?.whatItMeans ??
      "Shows that the snapshot was saved from Indicator Center attention flags and data gaps.",
    method:
      "CFS records the active Indicator Center display filter, enabled review groups, card summaries, selected indicator, and follow-up caveats using existing CFS data only.",
    recommendedAction: context.recommendedFollowUp,
    source: selected?.source ?? "CFS Indicator Center definitions",
    value: selected
      ? `${selected.name} / ${selected.status}`
      : `${context.selectedGroupIds.length} review groups enabled`,
  };
}

function createDevelopmentActivitySnapshotMetric(
  context: PlanningSnapshotDevelopmentActivityContext,
): PlanningSnapshot["explainableMetrics"][number] {
  return {
    caveat: "Observed permit/development activity only. Not a prediction.",
    label: "Development Activity Context",
    meaning:
      "Summarizes the selected Development Hotspots cluster or feature from the countywide map layer.",
    method:
      "CFS groups observed permit/development activity by map scale and records the selected safe cluster or marker context.",
    recommendedAction:
      "Review underlying permit records before formal planning decisions.",
    source: "Permit and development activity tables",
    value: `${context.areaLabel} / ${formatDevelopmentCount(
      context.recordsRepresented,
    )} observed records`,
  };
}

function buildContextOnlyPlanningSnapshot({
  activeLayerIds,
  activeLayerLabels,
  createdAt,
  developmentActivityContext,
  focusMode,
  focusModeLabel,
  indicatorCenterContext,
  mapSnapshot,
  modelLabContext,
  modelResearchMapSummary,
  overviewCommandMode,
  overviewModeLabel,
  schoolConstraint,
}: {
  activeLayerIds: string[];
  activeLayerLabels: string[];
  createdAt: string;
  developmentActivityContext: PlanningSnapshotDevelopmentActivityContext | null;
  focusMode: PlanningReviewFocusMode;
  focusModeLabel: string;
  indicatorCenterContext?: PlanningSnapshot["indicatorCenterContext"];
  mapSnapshot: PlanningMapSnapshotCapture;
  modelLabContext?: PlanningSnapshot["modelLabContext"];
  modelResearchMapSummary: ModelResearchMapSummary;
  overviewCommandMode: OverviewCommandMode;
  overviewModeLabel: string;
  schoolConstraint: SnapshotSchoolConstraint;
}): PlanningSnapshot {
  const activeLayerSummary = activeLayerLabels.length
    ? activeLayerLabels.join(", ")
    : "No optional overlays active at capture time";
  const mapStatusLabel =
    mapSnapshot.status === "captured"
      ? "Captured"
      : mapSnapshot.status === "failed"
        ? "Capture Failed"
        : "Unavailable";

  return {
    activeLayerIds,
    activeLayers: activeLayerLabels.length
      ? activeLayerLabels
      : ["No optional overlays active at capture time"],
    caveats: [
      "Snapshot is a saved front-end review context, not a new official record.",
      "No selected parcel was captured; parcel-specific facts require selecting a parcel in Workspace.",
      "Workspace context organizes report evidence; it does not create a public model layer.",
      "FEMA NFHL remains authoritative for regulatory flood review.",
      "School utilization is presentation-derived and requires official verification.",
      "Utility proxy context does not confirm available service capacity.",
      `Internal model research is aggregate-only; current best variant is ${developmentModelLabSummary.currentBestInternalVariant}, and no parcel-level predictions are stored or shown.`,
      ...(overviewCommandMode === "modelLab"
        ? [
            "Model Lab research preview is internal-only and does not show exact probabilities or official parcel classes.",
          ]
        : []),
      ...(mapSnapshot.status === "captured"
        ? []
        : [
            `Map screenshot unavailable: ${
              mapSnapshot.failureReason ??
              "SceneView did not provide a map image."
            }`,
          ]),
      ...(indicatorCenterContext
        ? [
            "Indicator Center snapshots summarize existing CFS attention flags and data gaps. These are monitoring indicators, not official determinations.",
          ]
        : []),
    ],
    createdAt,
    explainableMetrics: [
      {
        caveat:
          "The saved command context frames the report; it does not alter source records.",
        label: "Snapshot Context",
        meaning:
          "Shows whether the snapshot was saved from a selected parcel or broader map context.",
        method:
          "CFS records the active Workspace context with the saved report evidence.",
        recommendedAction:
          "Use this label to frame the executive summary and staff follow-up discussion.",
        source: "CFS Workspace mode state",
        value: focusModeLabel,
      },
      {
        caveat:
          "Workspace mode records the product workspace used at capture time; it is not a prediction feature.",
        label: "Workspace Mode",
        meaning:
          "Shows whether the snapshot came from parcel search, countywide intelligence, Model Lab, or snapshot workflow context.",
        method:
          "CFS stores the active Workspace mode alongside map and intelligence context.",
        recommendedAction:
          "Use the mode label to explain why the report emphasizes parcel facts, countywide indicators, or model governance.",
        source: "CFS Workspace mode state",
        value: overviewModeLabel,
      },
      {
        caveat:
          mapSnapshot.status === "captured"
            ? "The image reflects the browser SceneView at capture time."
            : "The snapshot was saved without a map image because capture was unavailable.",
        label: "Map Snapshot",
        meaning:
          "Shows whether the report includes a captured image of the current CFS map view.",
        method:
            "CFS saves the current map view, active layers, and Intelligence Brief into a report-ready Planning Snapshot.",
        recommendedAction:
          mapSnapshot.status === "captured"
            ? "Use the image as visual context, not as an official GIS export."
            : "Reopen Overview and save another snapshot if a map image is needed.",
        source: "ArcGIS SceneView browser screenshot",
        value: mapStatusLabel,
      },
      {
        caveat:
          "Permit activity is observed context and does not prove future development.",
        label: "Development Activity",
        meaning:
          "Captures development activity as map/layer context because no parcel was selected.",
        method:
          "CFS records active development layers without creating a parcel-level permit summary.",
        recommendedAction:
          "Select a parcel before using permit records in formal parcel review.",
        source: "Permit and development activity tables",
        value: "Map/layer context only",
      },
      ...(developmentActivityContext
        ? [
            createDevelopmentActivitySnapshotMetric(
              developmentActivityContext,
            ),
          ]
        : []),
      ...(indicatorCenterContext
        ? [createIndicatorCenterSnapshotMetric(indicatorCenterContext)]
        : []),
      {
        caveat:
          "FEMA NFHL remains the authoritative regulatory flood source.",
        label: "Flood Review Status",
        meaning:
          "Indicates that flood context was captured as map/layer context because no parcel was selected.",
        method:
          "The snapshot records active flood layers and caveats without assigning parcel-specific flood status.",
        recommendedAction:
          "Select a parcel before making parcel-specific flood review statements.",
        source: "FEMA NFHL parcel flood overlay",
        value: "Map/layer context only",
      },
      {
        caveat:
          "Official school capacity/enrollment is not fully integrated yet.",
        label: "School Assignment",
        meaning:
          "School context remains layer/scope context until a parcel is selected.",
        method:
          "CFS records active school context and caveats without assigning schools to a map-only snapshot.",
        recommendedAction:
          "Select a parcel and verify capacity/enrollment when official school data is received.",
        source: "School attendance zone GIS layers",
        value:
          schoolConstraint.scoreLabel && schoolConstraint.source !== "waiting"
            ? schoolConstraint.scoreLabel
            : "No selected parcel",
      },
      {
        caveat:
          "Utility proxy context does not confirm available sewer or water capacity.",
        label: "Utility Proxy",
        meaning:
          "Shows proximity/service context only; it is not a confirmed capacity finding.",
        method:
          "CFS displays available utility proxy context and names provider verification as the next step.",
        recommendedAction:
          "Confirm service readiness and capacity with WSACC or the relevant utility provider.",
        source: "Utility proxy and planning context layers",
        value: "Proxy Only",
      },
      {
        caveat:
          "Transportation features are current-context unless dated historical transportation/project data is available.",
        label: "Transportation Context",
        meaning:
          "Shows road, rail, STIP, and traffic context as planning evidence, not as a parcel decision score.",
        method:
          "CFS summarizes transportation accessibility and project/traffic context from prepared transportation feature tables.",
        recommendedAction:
          "Confirm dated local transportation projects and access constraints for formal review.",
        source: "Transportation accessibility, STIP, and AADT context",
        value: "Current Context Only",
      },
      {
        caveat:
          `Current best internal variant is ${developmentModelLabSummary.currentBestInternalVariant}. No exact parcel probability or parcel-level ranking class is exposed.`,
        label: "Internal Model Research Status",
        meaning:
          "Shows aggregate model governance only so staff understand model readiness boundaries.",
        method:
          "CFS compares internal feature groups against historical new construction outcomes for research QA.",
        recommendedAction:
          "Use model notes as governance context only; do not use as parcel-level decision output.",
        source: "CFS internal model QA outputs",
        value: developmentModelLabSummary.currentBestInternalVariant,
      },
      ...(overviewCommandMode === "modelLab"
        ? [
            {
              caveat:
                "Display mode is based on map scale and is saved for report context.",
              label: "Model Map Display",
              meaning:
                "Shows whether the snapshot captured a countywide surface, clusters, or parcel-scale research markers.",
              method:
                "CFS switches the Development Research Signal display by map scale to avoid clutter and improve performance.",
              recommendedAction:
                "Use the display label to explain whether the report is strategic countywide context or parcel-scale research context.",
              source: "CFS Model Lab map display state",
              value: modelResearchMapSummary.overlayEnabled
                ? modelResearchMapSummary.displayModeLabel
                : "Development Research Signal off",
            },
          ]
        : []),
      ...(overviewCommandMode === "modelLab"
        ? [
            {
              caveat:
                modelLabContext?.selectedResearchContext
                  ? `${modelLabContext.selectedResearchContext.caveat} No exact probabilities, hidden model outputs, or official parcel classes are stored.`
                  : "Model Lab snapshots include research governance context only. No exact probabilities, hidden model outputs, or official parcel classes are stored.",
              label: "Model Lab Context",
              meaning:
                "Shows that the snapshot was captured from internal development model research mode.",
              method:
                "CFS records the relative research signal band, selected safe context if available, and safety status without storing hidden model scores.",
              recommendedAction:
                "Use as internal research context to guide questions; do not treat it as an official parcel output.",
              source: "CFS internal model QA outputs",
              value: modelLabContext?.selectedResearchContext
                ? formatRelativeDevelopmentSignalBand({
                    rankBand:
                      modelLabContext.selectedResearchContext.researchRankBand,
                    signalLabel:
                      modelLabContext.selectedResearchContext.researchSignalLabel,
                  })
                : modelLabContext?.overlayEnabled
                  ? "Development Research Signal active"
                  : "Research overlay off by default",
            },
            ...(modelLabContext?.selectedResearchContext
              ? [
                  {
                    caveat:
                      "This is an internal research preview. It does not show exact parcel development probability and is not an official parcel score.",
                    label: "Model Signal Rationale",
                    meaning:
                      "Explains why the selected marker was highlighted in the research overlay.",
                    method:
                      "CFS summarizes top contextual drivers from the safe research-preview record.",
                    recommendedAction:
                      "Review zoning, transportation access, valuation context, and historical new construction patterns before using this as staff discussion context.",
                    source: "CFS internal model QA outputs",
                    value: getModelResearchHighlightExplanation({
                      caveat: modelLabContext.selectedResearchContext.caveat,
                      centroid: {
                        latitude: 0,
                        longitude: 0,
                      },
                      dataQualityFlag:
                        modelLabContext.selectedResearchContext.dataQualityFlag,
                      exactProbabilityAvailable: false,
                      modelVersion:
                        modelLabContext.selectedResearchContext.modelVersion,
                      officialParcelId:
                        modelLabContext.selectedResearchContext.officialParcelId,
                      productionReady: false,
                      publicExposureAllowed: false,
                      researchRankBand:
                        modelLabContext.selectedResearchContext.researchRankBand,
                      researchSignalLabel:
                        modelLabContext.selectedResearchContext.researchSignalLabel,
                      topDrivers:
                        modelLabContext.selectedResearchContext.topDrivers,
                    }),
                  },
                ]
              : []),
          ]
        : []),
    ],
    focusMode,
    focusModeLabel,
    includedSections: { ...defaultPlanningSnapshotIncludedSections },
    keyFacts: [
      { label: "Snapshot context", value: focusModeLabel },
      { label: "Workspace mode", value: overviewModeLabel },
      { label: "Intelligence Brief", value: "Countywide Intelligence Brief" },
      { label: "Selected parcel", value: "No selected parcel captured" },
      { label: "Active overlays", value: activeLayerSummary },
      { label: "Map image", value: mapStatusLabel },
      {
        label: "Model governance",
        value: `${developmentModelLabSummary.currentBestInternalVariant} / Internal research only`,
      },
      ...(modelLabContext
        ? [
            {
              label: "Model map display",
              value: modelLabContext.overlayEnabled
                ? modelLabContext.displayModeLabel ?? "Development Research Signal active"
                : "Development Research Signal off",
            },
          ]
        : []),
      ...(modelLabContext?.selectedResearchContext
        ? [
            {
              label: "Selected research context",
              value: formatRelativeDevelopmentSignalBand({
                rankBand: modelLabContext.selectedResearchContext.researchRankBand,
                signalLabel:
                  modelLabContext.selectedResearchContext.researchSignalLabel,
              }),
            },
          ]
        : []),
      ...(developmentActivityContext
        ? [
            {
              label: "Selected development activity",
              value: `${developmentActivityContext.areaLabel} / ${formatDevelopmentCount(
                developmentActivityContext.recordsRepresented,
              )} records`,
            },
          ]
        : []),
      ...(indicatorCenterContext
        ? [
            {
              label: "Indicator Center context",
              value: indicatorCenterContext.selectedIndicator
                ? `${indicatorCenterContext.selectedIndicator.name} / ${indicatorCenterContext.selectedIndicator.status}`
                : `${indicatorCenterContext.selectedGroupIds.length} review groups enabled`,
            },
            {
              label: "Indicator display",
              value: getIndicatorCenterDisplayModeLabel(
                indicatorCenterContext.displayMode,
              ),
            },
            {
              label: "Indicator summaries",
              value: `${indicatorCenterContext.indicatorSummaries.length} cards captured`,
            },
          ]
        : []),
    ],
    knownReviewFlags: [
      {
        label: "Snapshot context",
        reason: `Snapshot was saved from ${focusModeLabel.toLowerCase()} context.`,
        status: "Saved Context",
      },
      {
        label: "Parcel context",
        reason:
          "No parcel was selected, so the snapshot contains map/layer context instead of parcel-specific findings.",
        status: "Parcel Recommended",
      },
      {
        label: "Map snapshot",
        reason:
          mapSnapshot.status === "captured"
            ? "SceneView image was captured for the report."
            : mapSnapshot.failureReason ??
              "SceneView image was not available when the snapshot was saved.",
        status: mapStatusLabel,
      },
      {
        label: "Model output",
        reason:
          `Internal model research remains aggregate-only. ${developmentModelLabSummary.currentBestInternalVariant} is not exposed as a parcel-level output.`,
        status: "Not Public-Facing",
      },
      ...(developmentActivityContext
        ? [
            {
              label: "Development activity context",
              reason:
                "A Development Hotspots cluster or feature was selected when the snapshot was saved.",
              status:
                developmentActivityContext.contextKind === "cluster"
                  ? "Cluster selected"
                  : "Feature selected",
            },
          ]
        : []),
      ...(indicatorCenterContext
        ? [
            {
              label: "Indicator Center context",
              reason: indicatorCenterContext.selectedIndicator
                ? `${indicatorCenterContext.selectedIndicator.name} was selected as a review indicator when the snapshot was saved.`
                : `${indicatorCenterContext.indicatorSummaries.length} Indicator Center summary cards were captured.`,
              status: indicatorCenterContext.selectedIndicator
                ? indicatorCenterContext.selectedIndicator.status
                : getIndicatorCenterDisplayModeLabel(
                    indicatorCenterContext.displayMode,
                  ),
            },
          ]
        : []),
    ],
    mapContext: {
      cameraSummary: mapSnapshot.cameraSummary,
      description:
        activeLayerLabels.length > 0
          ? `Snapshot captured from ${focusModeLabel} with ${activeLayerSummary} active.`
          : `Snapshot captured from ${focusModeLabel} with no optional overlays active.`,
      extentCaptured: Boolean(mapSnapshot.extentSummary),
      extentSummary: mapSnapshot.extentSummary,
    },
    mapScreenshotCapturedAt: mapSnapshot.capturedAt ?? null,
    mapScreenshotDataUrl: mapSnapshot.dataUrl ?? null,
    mapScreenshotFailureReason: mapSnapshot.failureReason ?? null,
    mapScreenshotStatus: mapSnapshot.status,
    developmentActivityContext,
    indicatorCenterContext,
    modelLabContext,
    overviewCommandMode,
    overviewKpis: [
      {
        caveat: "Snapshot context is a workflow label, not a data source.",
        label: "Snapshot Context",
        value: focusModeLabel,
      },
      {
        caveat: "Select a parcel for parcel-specific due diligence.",
        label: "Selected Parcel",
        value: "No selected parcel",
      },
      {
        caveat: "Active layers are visual/report context only.",
        label: "Active Context",
        value: activeLayerSummary,
      },
      {
        caveat: "Model outputs remain hidden and internal-only.",
        label: "Model Governance",
        value: `${developmentModelLabSummary.currentBestInternalVariant} / Internal research only`,
      },
    ],
    selectedParcelId: null,
    selectedParcelSummary: null,
    snapshotId: `${indicatorCenterContext ? "phase28i" : "phase26a"}-map-context-${Date.now()}`,
    snapshotVersion: indicatorCenterContext ? "phase28i_v1" : "phase26a_v1",
  };
}

function SelectedSchoolUtilizationZoneCard({
  enabled,
  onClear,
  zone,
}: {
  enabled: boolean;
  onClear: () => void;
  zone: SelectedSchoolUtilizationZone | null;
}) {
  if (!zone) {
    if (!enabled) {
      return null;
    }

    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#8fe7ff]" />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Selected School Zone
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Hover school utilization zones for utilization. Click a zone for
              details without changing the selected parcel.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#8fe7ff]/20 bg-[#8fe7ff]/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-[#bfefff]">
            Selected School Zone
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">
            {zone.schoolName ?? "School utilization zone"}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Presentation-derived utilization
          </p>
        </div>
        <button
          aria-label="Clear selected school zone"
          className="rounded border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          onClick={onClear}
          title="Clear selected school zone"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <CompactParcelLine
          label="School Level"
          value={formatSchoolZonePanelLabel(zone.schoolLevel)}
        />
        <CompactParcelLine
          label="School Year"
          value={zone.schoolYear ? `SY ${zone.schoolYear}` : "Unavailable"}
        />
        <CompactParcelLine
          label="Utilization"
          value={formatSchoolZoneUtilization(zone.utilizationPct)}
        />
        <CompactParcelLine
          label="Class"
          value={formatSchoolZoneClassLabel(zone.utilizationClass)}
        />
        <CompactParcelLine
          label="Source"
          value={formatSchoolZoneSourceLabel(zone.sourceConfidence)}
        />
        <CompactParcelLine
          label="Verification"
          value={zone.needsVerification ? "Needs verification" : "Verified"}
        />
        <CompactParcelLine
          label="Reference Match"
          value={zone.matchedSchoolReferenceId ? "Matched" : "QA review"}
        />
        <CompactParcelLine
          label="Zone Match"
          value={formatSchoolZonePanelLabel(zone.zoneMatchConfidence)}
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        This is separate from Selected Parcel. Values are read from SY
        2024-2025 planning maps and require verification against official
        enrollment/capacity data. Official school capacity scoring remains
        disabled.
      </p>
    </section>
  );
}

function OverviewSchoolSnapshot({
  elementaryAssignment,
  highAssignment,
  middleAssignment,
  scoreLabel,
  source,
}: {
  elementaryAssignment: string;
  highAssignment: string;
  middleAssignment: string;
  scoreLabel: string;
  source: ReturnType<typeof useSelectedParcelSchoolConstraint>["source"];
}) {
  const sourceLabel =
    source === "api"
      ? "Live assignment"
      : source === "loading"
        ? "Loading assignment"
        : source === "waiting"
          ? "Waiting for parcel"
          : "Assignment unavailable";

  return (
    <div className="mt-3 rounded-md border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.045] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase text-slate-500">
            School Assignment
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Attendance-zone polygon overlap. Capacity Data Needed /{" "}
            {scoreLabel || "Not scored"}.
          </p>
        </div>
        <span className="shrink-0 rounded border border-[#8fe7ff]/20 bg-[#8fe7ff]/10 px-2 py-1 text-[10px] font-semibold text-[#bfefff]">
          {sourceLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-1.5">
        <CompactParcelLine label="Elementary" value={elementaryAssignment} />
        <CompactParcelLine label="Middle" value={middleAssignment} />
        <CompactParcelLine label="High" value={highAssignment} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        Utilization values are presentation-derived from SY 2024-2025 planning
        maps and require verification.
      </p>
    </div>
  );
}

function DeveloperModeDetails({
  temporalAnalysisState,
}: {
  temporalAnalysisState: ReturnType<typeof useDashboardState>["temporalAnalysisState"];
}) {
  return (
    <CollapsedSection
      description="Developer-only temporal, diagnostics, reporting previews, and role/scenario tooling."
      title="Developer surfaces"
    >
      <TemporalAnalysisPanel temporalState={temporalAnalysisState} />
      <SystemStatusCard />
      <ExecutiveBriefingPanel />
      <ScenarioComparisonPanel />
      <ExecutiveReportPanel />
      <PrintLayoutPreview />
      <RoleIntelligencePanel />
      <EventStreamPanel />
    </CollapsedSection>
  );
}

function SystemStatusCard() {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Data Source Mode
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">
            {USE_BACKEND_API ? "FastAPI enabled" : "Static fallback mode"}
          </h3>
        </div>
        <IntelligenceModeBadge />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        {USE_BACKEND_API
          ? "Migrated parcel, development, flood, and temporal panels call the local FastAPI backend and retain independent static fallback behavior."
          : "The dashboard is using generated static artifacts and mock readiness data until backend API mode is enabled."}
      </p>
    </section>
  );
}

function IntelligenceModeBadge() {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1 text-right",
        USE_BACKEND_API
          ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
          : "border-white/10 bg-white/[0.035] text-slate-300",
      )}
      title={
        USE_BACKEND_API
          ? `FastAPI mode enabled: ${CFS_API_BASE_URL}`
          : "Static/generated-output fallback mode"
      }
    >
      <p className="text-[10px] font-semibold uppercase leading-none">
        {USE_BACKEND_API ? "Live" : "Static"}
      </p>
    </div>
  );
}

function PanelIntro({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}

function CollapsedSection({
  children,
  defaultOpen = false,
  description,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-lg border border-white/10 bg-black/20 p-3"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {description}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      {isOpen ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {children}
        </div>
      ) : null}
    </details>
  );
}

function MethodologyCard({
  accent,
  items,
  title,
}: {
  accent: string;
  items: string[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]"
          style={{ background: accent, color: accent }}
        />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <p
            className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-300"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function MethodologyCompositeSignals() {
  const { selectedParcel } = useDashboardState();

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Placeholder Readiness Signals
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Legacy mock scoring context
          </h3>
        </div>
        <BrainCircuit className="h-4 w-4 text-[#68d8ff]" />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        These signals remain documentation-only until authoritative
        infrastructure and readiness layers are connected. They were moved out
        of the map layer rail to keep map controls operational and compact.
      </p>
      <div className="mt-4">
        <ScoreCard
          accent="#d8b86a"
          caption="Weighted mock score across parcel potential, development pressure, and infrastructure fit."
          label="Opportunity Score"
          score={selectedParcel?.opportunityScore ?? 0}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {scoreSignals.map((signal) => (
          <div
            className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
            key={signal.label}
          >
            <p className="text-[11px] leading-4 text-slate-500">
              {signal.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-lg font-semibold text-white">
                {signal.value}
              </span>
              <span
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${signal.accent} ${signal.value}%, rgba(255,255,255,0.1) 0)`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactParcelLine({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-medium uppercase leading-5 text-slate-500">
        {label}
      </p>
      <p className="truncate text-xs font-semibold leading-5 text-slate-100">
        {value ?? "Unavailable"}
      </p>
    </div>
  );
}

function CompactTextBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-medium uppercase leading-5 text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-200">{value}</p>
    </div>
  );
}

function formatSchoolZoneUtilization(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not available";
  }

  return `${value.toFixed(1)}%`;
}

function formatSchoolZoneClassLabel(value: string | null | undefined) {
  switch (value) {
    case "under_capacity":
      return "Under capacity";
    case "approaching_capacity":
    case "near_capacity":
      return "Approaching capacity";
    case "over_capacity":
      return "Over capacity";
    case "severely_over_capacity":
      return "Severely over capacity";
    default:
      return "Review needed";
  }
}

function formatSchoolZoneSourceLabel(value: string | null | undefined) {
  return value === "presentation_derived"
    ? "Presentation-derived"
    : formatSchoolZonePanelLabel(value);
}

function formatSchoolZonePanelLabel(value: string | null | undefined) {
  return formatCompactLabel(value ?? null);
}

function formatCompactLabel(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}
