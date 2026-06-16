"use client";

import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Copy,
  Crosshair,
  Database,
  FileSearch,
  MapPin,
  Monitor,
  Save,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { DataRegistryPanel } from "@/components/dashboard/DataRegistryPanel";
import { DueDiligenceReview } from "@/components/dashboard/DueDiligenceReview";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { GISIntegrationReadinessPanel } from "@/components/dashboard/GISIntegrationReadinessPanel";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioControls } from "@/components/dashboard/ScenarioControls";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { SchoolConstraintSummaryPanel } from "@/components/dashboard/SchoolConstraintSummaryPanel";
import { TemporalAnalysisPanel } from "@/components/dashboard/TemporalAnalysisPanel";
import {
  CFS_OPEN_LAYER_RAIL_EVENT,
  CFS_PLANNING_SNAPSHOT_SAVED_EVENT,
  CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
} from "@/components/dashboard/OverviewCommandCenter";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
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
import { cn, formatCurrency } from "@/lib/utils";
import { ScoreCard } from "@/components/ui/ScoreCard";
import type {
  PlanningSnapshot,
  PlanningReviewFocusMode,
  PlanningSnapshotSectionKey,
  ProductMode,
} from "@/types";
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
    description: "Map exploration, parcel search, live layers, and headline intelligence.",
    icon: BrainCircuit,
    label: "Overview",
  },
};

export function IntelligencePanel() {
  const {
    activeLayerIds,
    activeLayers,
    developmentHotspotsEnabled,
    floodConstraintsEnabled,
    floodZonesEnabled,
    productMode,
    parcelReviewView,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectedSchoolUtilizationZone,
    planningSnapshot,
    savedPlanningSnapshots,
    clearSelectedSchoolUtilizationZone,
    savePlanningSnapshot,
    schoolUtilizationZonesEnabled,
    setMapFocusMode,
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
      className="glass-panel no-scrollbar order-3 min-h-0 overflow-auto rounded-lg p-3 md:max-h-[72vh] lg:order-3 lg:max-h-none"
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

      {productMode === "overview" ? (
        <OverviewModeContent
          selectedParcelId={selectedParcelId}
          selectedParcelIntelligence={selectedParcelIntelligence}
          selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
          selectedSchoolUtilizationZone={selectedSchoolUtilizationZone}
          clearSelectedSchoolUtilizationZone={clearSelectedSchoolUtilizationZone}
          activeLayerIds={activeLayerIds}
          activeLayers={activeLayers}
          developmentHotspotsEnabled={developmentHotspotsEnabled}
          floodConstraintsEnabled={floodConstraintsEnabled}
          floodZonesEnabled={floodZonesEnabled}
          schoolUtilizationZonesEnabled={schoolUtilizationZonesEnabled}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
          savePlanningSnapshot={savePlanningSnapshot}
          setMapFocusMode={setMapFocusMode}
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
  activeLayerIds,
  activeLayers,
  clearSelectedSchoolUtilizationZone,
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  planningSnapshot,
  savedPlanningSnapshots,
  savePlanningSnapshot,
  schoolUtilizationZonesEnabled,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  selectedSchoolUtilizationZone,
  setMapFocusMode,
  setProductMode,
  setPlanningSnapshotView,
}: {
  activeLayerIds: string[];
  activeLayers: ReturnType<typeof useDashboardState>["activeLayers"];
  clearSelectedSchoolUtilizationZone: () => void;
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  savePlanningSnapshot: (snapshot: PlanningSnapshot) => void;
  schoolUtilizationZonesEnabled: boolean;
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  selectedSchoolUtilizationZone: SelectedSchoolUtilizationZone | null;
  setMapFocusMode: ReturnType<typeof useDashboardState>["setMapFocusMode"];
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
  const activeLayerLabels = Array.from(
    new Set(
      [
        ...activeLayers.map((layer) => layer.title),
        developmentHotspotsEnabled ? "Development Hotspots" : null,
        floodConstraintsEnabled ? "Flood Constraints" : null,
        floodZonesEnabled ? "FEMA Flood Zones" : null,
        schoolUtilizationZonesEnabled ? "School Utilization Seed" : null,
      ].filter((label): label is string => Boolean(label)),
    ),
  );

  const handleSaveOverviewSnapshot = useCallback(async () => {
    if (snapshotSaving) {
      return;
    }

    setSnapshotSaving(true);

    try {
      const mapSnapshot = await captureMapSnapshotForPlanning();
      const snapshotFocusMode: PlanningReviewFocusMode =
        selectedParcelForSnapshot ? "parcel_lookup" : "planning_snapshot_report";
      const snapshotFocusLabel = selectedParcelForSnapshot
        ? "Selected Parcel Snapshot"
        : "Overview Command Center";
      const nextSnapshot = buildPlanningSnapshot({
        activeLayerIds,
        activeLayerLabels,
        developmentActivity,
        floodConstraint,
        focusMode: snapshotFocusMode,
        focusModeLabel: snapshotFocusLabel,
        mapSnapshot,
        parcel: selectedParcelForSnapshot,
        schoolConstraint,
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
    activeLayerIds,
    activeLayerLabels,
    developmentActivity,
    floodConstraint,
    savePlanningSnapshot,
    schoolConstraint,
    selectedParcelForSnapshot,
    setPlanningSnapshotView,
    snapshotSaving,
  ]);

  useEffect(() => {
    function handleCommandCenterSave() {
      void handleSaveOverviewSnapshot();
    }
    function handleCountywideIntelligence() {
      setCountywideBriefOverride({
        parcelId: selectedParcelOfficialId ?? null,
      });
    }

    window.addEventListener(
      CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
      handleCommandCenterSave,
    );
    window.addEventListener(
      CFS_OPEN_LAYER_RAIL_EVENT,
      handleCountywideIntelligence,
    );

    return () => {
      window.removeEventListener(
        CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
        handleCommandCenterSave,
      );
      window.removeEventListener(
        CFS_OPEN_LAYER_RAIL_EVENT,
        handleCountywideIntelligence,
      );
    };
  }, [handleSaveOverviewSnapshot, selectedParcelOfficialId]);

  const countywideBriefVisible =
    countywideBriefOverride?.parcelId === (selectedParcelOfficialId ?? null);

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
        onShowSelectedParcel={() => setCountywideBriefOverride(null)}
        parcel={selectedParcelIntelligence}
        parcelDashboardMetrics={parcelDashboardMetrics}
        parcelIdCopied={parcelIdCopied}
        planningSnapshot={planningSnapshot}
        savedPlanningSnapshots={savedPlanningSnapshots}
        schoolConstraint={schoolConstraint}
        selectedParcelId={selectedParcelOfficialId}
        source={selectedParcelIntelligenceSource}
        snapshotSaved={snapshotSaved}
        snapshotSaving={snapshotSaving}
        showCountywideBrief={countywideBriefVisible}
        transportationContext={transportationContext}
      />

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
  parcel,
  parcelDashboardMetrics,
  parcelIdCopied,
  planningSnapshot,
  savedPlanningSnapshots,
  schoolConstraint,
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
  parcel: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  parcelDashboardMetrics: ReturnType<typeof useParcelDashboardMetrics>;
  parcelIdCopied: boolean;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
  schoolConstraint: SnapshotSchoolConstraint;
  selectedParcelId: string | null;
  snapshotSaved: boolean;
  snapshotSaving: boolean;
  showCountywideBrief: boolean;
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  transportationContext: ReturnType<typeof useTransportationContextSummary>;
}) {
  const hasParcel = Boolean(parcel) && !showCountywideBrief;

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
            {hasParcel ? "Selected Parcel Intelligence" : "Intelligence Brief"}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">
            {hasParcel
              ? parcel?.officialParcelId
              : "Countywide planning context"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {hasParcel
              ? "Snapshot-ready parcel facts, constraints, and observed activity."
              : "Headline indicators, active map context, and safe report actions."}
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
      ) : (
        <CountywideBrief
          activeLayerLabels={activeLayerLabels}
          developmentStatistics={developmentStatistics}
          floodSummary={floodSummary}
          parcelDashboardMetrics={parcelDashboardMetrics}
          planningSnapshot={planningSnapshot}
          savedPlanningSnapshots={savedPlanningSnapshots}
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

function CountywideBrief({
  activeLayerLabels,
  developmentStatistics,
  floodSummary,
  onShowSelectedParcel,
  parcelDashboardMetrics,
  planningSnapshot,
  savedPlanningSnapshots,
  selectedParcelId,
}: {
  activeLayerLabels: string[];
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  onShowSelectedParcel?: () => void;
  parcelDashboardMetrics: ReturnType<typeof useParcelDashboardMetrics>;
  planningSnapshot: PlanningSnapshot | null;
  savedPlanningSnapshots: PlanningSnapshot[];
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
          caveat="Aggregate governance only; no parcel prediction is shown."
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
  developmentActivity,
  focusMode,
  focusModeLabel,
  floodConstraint,
  mapSnapshot,
  parcel,
  schoolConstraint,
}: {
  activeLayerIds: string[];
  activeLayerLabels: string[];
  developmentActivity: SnapshotDevelopmentActivity;
  focusMode: PlanningReviewFocusMode;
  focusModeLabel: string;
  floodConstraint: SnapshotFloodConstraint;
  mapSnapshot: PlanningMapSnapshotCapture;
  parcel: Parameters<typeof ParcelSummaryPanel>[0]["parcel"] | null;
  schoolConstraint: SnapshotSchoolConstraint;
}): PlanningSnapshot {
  const createdAt = new Date().toISOString();

  if (!parcel) {
    return buildContextOnlyPlanningSnapshot({
      activeLayerIds,
      activeLayerLabels,
      createdAt,
      focusMode,
      focusModeLabel,
      mapSnapshot,
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
      "Overview command context organizes report evidence; it does not create a public model layer.",
      "FEMA NFHL remains authoritative for regulatory flood review.",
      "School utilization is presentation-derived and requires official verification.",
      "Utility proxy context does not confirm available service capacity.",
      "Internal model research is aggregate-only; no parcel-level predictions are stored or shown.",
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
          "CFS records the active Overview command context with the saved report evidence.",
        recommendedAction:
          "Use this label to frame the executive summary and staff follow-up discussion.",
        source: "CFS Overview command state",
        value: focusModeLabel,
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
          "No exact parcel probability or parcel-level ranking class is exposed.",
        label: "Internal Model Research Status",
        meaning:
          "Shows aggregate model governance only so staff understand model readiness boundaries.",
        method:
          "CFS compares internal feature groups against historical new construction outcomes for research QA.",
        recommendedAction:
          "Use model notes as governance context only; do not use as parcel-level decision output.",
        source: "CFS internal model QA outputs",
        value: "Internal Research Only",
      },
    ],
    includedSections: { ...defaultPlanningSnapshotIncludedSections },
    focusMode,
    focusModeLabel,
    keyFacts: [
      { label: "Snapshot context", value: focusModeLabel },
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
          "Internal model research remains aggregate-only with no parcel-level output.",
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
        value: "Internal research only",
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
    snapshotId: `phase22e-${parcel.officialParcelId}-${Date.now()}`,
    snapshotVersion: "phase22e_v1",
  };
}

function buildContextOnlyPlanningSnapshot({
  activeLayerIds,
  activeLayerLabels,
  createdAt,
  focusMode,
  focusModeLabel,
  mapSnapshot,
  schoolConstraint,
}: {
  activeLayerIds: string[];
  activeLayerLabels: string[];
  createdAt: string;
  focusMode: PlanningReviewFocusMode;
  focusModeLabel: string;
  mapSnapshot: PlanningMapSnapshotCapture;
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
      "No selected parcel was captured; parcel-specific facts require selecting a parcel in Overview.",
      "Overview command context organizes report evidence; it does not create a public model layer.",
      "FEMA NFHL remains authoritative for regulatory flood review.",
      "School utilization is presentation-derived and requires official verification.",
      "Utility proxy context does not confirm available service capacity.",
      "Internal model research is aggregate-only; no parcel-level predictions are stored or shown.",
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
          "Shows whether the snapshot was saved from a selected parcel or broader map context.",
        method:
          "CFS records the active Overview command context with the saved report evidence.",
        recommendedAction:
          "Use this label to frame the executive summary and staff follow-up discussion.",
        source: "CFS Overview command state",
        value: focusModeLabel,
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
          "No exact parcel probability or parcel-level ranking class is exposed.",
        label: "Internal Model Research Status",
        meaning:
          "Shows aggregate model governance only so staff understand model readiness boundaries.",
        method:
          "CFS compares internal feature groups against historical new construction outcomes for research QA.",
        recommendedAction:
          "Use model notes as governance context only; do not use as parcel-level decision output.",
        source: "CFS internal model QA outputs",
        value: "Internal Research Only",
      },
    ],
    focusMode,
    focusModeLabel,
    includedSections: { ...defaultPlanningSnapshotIncludedSections },
    keyFacts: [
      { label: "Snapshot context", value: focusModeLabel },
      { label: "Intelligence Brief", value: "Countywide Intelligence Brief" },
      { label: "Selected parcel", value: "No selected parcel captured" },
      { label: "Active overlays", value: activeLayerSummary },
      { label: "Map image", value: mapStatusLabel },
      { label: "Model governance", value: "Internal research only" },
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
          "Internal model research remains aggregate-only with no parcel-level output.",
        status: "Not Public-Facing",
      },
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
        value: "Internal research only",
      },
    ],
    selectedParcelId: null,
    selectedParcelSummary: null,
    snapshotId: `phase22e-map-context-${Date.now()}`,
    snapshotVersion: "phase22e_v1",
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
