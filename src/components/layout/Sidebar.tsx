"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FlaskConical,
  Gauge,
  Layers3,
  MapPin,
  Save,
} from "lucide-react";
import { LayerToggle } from "@/components/dashboard/LayerToggle";
import {
  CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
} from "@/components/dashboard/OverviewCommandCenter";
import {
  developmentModelLabSummary,
  formatModelResearchDriverLabel,
  getModelResearchDriverExplanation,
  modelResearchDriverSources,
  modelResearchSignalLegend,
} from "@/data/intelligence/developmentModelLab";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { OverviewCommandMode } from "@/types";
import {
  formatMapOverlayViewMode,
  mapOverlayViewModes,
  type MapOverlayViewMode,
} from "@/types/map/overlayViewModes";

interface SidebarProps {
  collapsed?: boolean;
  dragging?: boolean;
  embedded?: boolean;
  onResizeStart?: (event: ReactPointerEvent) => void;
  onToggleCollapsed?: () => void;
  overviewCommandMode?: OverviewCommandMode;
}

export function Sidebar({
  collapsed = false,
  dragging = false,
  embedded = false,
  onResizeStart,
  onToggleCollapsed,
  overviewCommandMode = "parcel",
}: SidebarProps) {
  const collapsedLabel = getCollapsedRailLabel(overviewCommandMode);

  if (collapsed) {
    return (
      <aside
        aria-label={`Collapsed ${collapsedLabel} controls`}
        className={cn(
          "app-chrome glass-panel cfs-layer-rail cfs-layer-rail--collapsed relative order-2 grid h-full min-h-[22rem] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] place-items-center overflow-visible rounded-lg p-2 md:max-h-none lg:order-1",
          embedded && "h-full order-none md:max-h-none lg:order-none",
          dragging && "cfs-layer-rail--dragging",
        )}
      >
        {!embedded ? (
          <LayerRailEdgeHandle
            collapsed
            onPointerDown={onResizeStart}
            onToggleCollapsed={onToggleCollapsed}
          />
        ) : null}
        <button
          aria-label={`Expand ${collapsedLabel} panel`}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#9eeeff]"
          onClick={onToggleCollapsed}
          title={`Expand ${collapsedLabel} panel`}
          type="button"
        >
          <CollapsedRailGlyph mode={overviewCommandMode} />
        </button>
        <button
          aria-label={`Expand ${collapsedLabel} panel`}
          className="flex h-full min-h-0 w-full items-center justify-center py-3"
          onClick={onToggleCollapsed}
          title={`Expand ${collapsedLabel} panel`}
          type="button"
        >
          <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {collapsedLabel}
          </span>
        </button>
        <div
          aria-hidden="true"
          className="h-10 w-10 rounded-md border border-white/0"
        />
      </aside>
    );
  }

  return (
    <aside
      aria-label="Advanced map layer control panel"
      className={cn(
        "app-chrome glass-panel cfs-layer-rail relative z-20 order-2 flex h-full min-h-0 w-full min-w-0 flex-col overflow-visible rounded-lg lg:order-1",
        embedded &&
          "h-full order-none overflow-hidden border-white/10 bg-[#07111f]/90 md:max-h-none lg:order-none",
        dragging && "cfs-layer-rail--dragging",
      )}
    >
      {!embedded ? (
        <LayerRailEdgeHandle
          onPointerDown={onResizeStart}
          onToggleCollapsed={onToggleCollapsed}
        />
      ) : null}
      <div className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg p-3 pr-3 lg:pr-4">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">
              Advanced
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-6 text-white">
              {getExpandedRailTitle(overviewCommandMode)}
            </h2>
          </div>
          <button
            aria-label={
              overviewCommandMode === "countywide"
                ? "Collapse map controls"
                : `Collapse ${getExpandedRailTitle(overviewCommandMode)}`
            }
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-[#d8b86a]/35 hover:bg-[#d8b86a]/10 hover:text-[#f0cd79] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/60"
            onClick={onToggleCollapsed}
            title={
              overviewCommandMode === "countywide"
                ? "Collapse map controls"
                : `Collapse ${getExpandedRailTitle(overviewCommandMode)}`
            }
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 space-y-3 pr-1">
          <ModeSpecificRailContent
            mode={overviewCommandMode}
            onCollapseDrawer={onToggleCollapsed}
          />
        </div>
      </div>
    </aside>
  );
}

function ModeSpecificRailContent({
  mode,
  onCollapseDrawer,
}: {
  mode: OverviewCommandMode;
  onCollapseDrawer?: () => void;
}) {
  if (mode === "modelLab") {
    return <ModelLabControlsPanel onCollapseDrawer={onCollapseDrawer} />;
  }

  if (mode === "indicatorCenter") {
    return null;
  }

  if (mode === "parcel") {
    return <ParcelModeControlsPanel onCollapseDrawer={onCollapseDrawer} />;
  }

  if (mode === "snapshot") {
    return <SnapshotModeControlsPanel onCollapseDrawer={onCollapseDrawer} />;
  }

  return <LayerToggle />;
}

function CollapsedRailGlyph({ mode }: { mode: OverviewCommandMode }) {
  if (mode === "modelLab") {
    return <FlaskConical className="h-4 w-4" />;
  }

  if (mode === "indicatorCenter") {
    return <Gauge className="h-4 w-4" />;
  }

  if (mode === "snapshot") {
    return <Save className="h-4 w-4" />;
  }

  if (mode === "parcel") {
    return <MapPin className="h-4 w-4" />;
  }

  return <Layers3 className="h-4 w-4" />;
}

function ParcelModeControlsPanel({
  onCollapseDrawer,
}: {
  onCollapseDrawer?: () => void;
}) {
  const {
    planningSnapshot,
    selectedParcelId,
    selectedParcelIntelligence,
    setMapFocusMode,
    setOverviewCommandMode,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();

  function saveSnapshot() {
    window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT));
  }

  function openSnapshots() {
    setPlanningSnapshotView("overview");
    setProductMode("due_diligence");
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#d8b86a]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Parcel mode
            </p>
            <h3 className="mt-1 text-sm font-semibold text-white">
              Search and review a parcel
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Use the top search bar to add zoning, flood, school,
              development, transportation, utility proxy, and model-governance
              context.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Selected parcel
        </p>
        <h4 className="mt-1 truncate text-sm font-semibold text-white">
          {selectedParcelId ?? "No parcel selected"}
        </h4>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {selectedParcelIntelligence
            ? `${selectedParcelIntelligence.ownerName ?? "Owner unavailable"} / ${
                selectedParcelIntelligence.zoningCode ??
                selectedParcelIntelligence.zoningCategory ??
                "zoning pending"
              }`
            : "Search parcel ID, PIN, owner, address, or subdivision."}
        </p>
      </section>

      <div className="grid gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/15"
          onClick={saveSnapshot}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          Save Snapshot
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={openSnapshots}
          type="button"
        >
          Open Planning Snapshot
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedParcelId}
          onClick={() => setMapFocusMode(true)}
          type="button"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Focus Map
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={() => {
            setOverviewCommandMode("countywide");
          }}
          type="button"
        >
          <Layers3 className="h-3.5 w-3.5" />
          Open Layers
        </button>
      </div>

      {planningSnapshot ? (
        <p className="rounded-md border border-[#55d38f]/20 bg-[#55d38f]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#a8f3c4]">
          Latest snapshot is ready in the Planning Snapshot library.
        </p>
      ) : null}

      <button
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
        onClick={onCollapseDrawer}
        type="button"
      >
        Collapse parcel helper
      </button>
    </div>
  );
}

function ModelLabControlsPanel({
  onCollapseDrawer,
}: {
  onCollapseDrawer?: () => void;
}) {
  const {
    modelResearchMapSummary,
    modelResearchOverlayEnabled,
    modelResearchViewMode,
    setModelResearchOverlayEnabled,
    setModelResearchViewMode,
    setProductMode,
  } = useDashboardState();

  function openMethodologyModelLab() {
    window.location.hash = "methodology-model-lab";
    setProductMode("methodology");
  }

  function saveSnapshot() {
    window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT));
  }

  return (
    <div className="space-y-3" data-testid="model-lab-controls">
      <section className="cfs-command-card rounded-lg border-[#d8b86a]/20 bg-[#1b1506]/40 p-3">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0cd79]">
              Model Lab
            </p>
            <h3 className="mt-1 text-sm font-semibold text-white">
              Development Model
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Relative development signal based on historical new construction
              patterns. Not an exact probability.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <RailFact
            label="Current best internal variant"
            value={developmentModelLabSummary.currentBestInternalVariant}
          />
          <RailFact label="Target" value={developmentModelLabSummary.target} />
          <RailFact label="Status" value="Internal research only" />
          <RailFact label="Public exposure" value="Not allowed" />
        </div>
      </section>

      <section className="cfs-command-card rounded-lg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Overlay
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              Development Research Signal
            </h4>
          </div>
          <button
            aria-pressed={modelResearchOverlayEnabled}
            className={cn(
              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase transition",
              modelResearchOverlayEnabled
                ? "border-[#55d38f]/35 bg-[#55d38f]/12 text-[#a8f3c4]"
                : "border-white/10 bg-white/[0.04] text-slate-400",
            )}
            onClick={() =>
              setModelResearchOverlayEnabled(!modelResearchOverlayEnabled)
            }
            type="button"
          >
            {modelResearchOverlayEnabled ? "On" : "Off"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Relative bands compare parcels against other parcels in the county.
          They are not exact probabilities or official parcel classes.
        </p>
        <div className="mt-3 grid gap-2">
          <ModelLabViewModeControl
            onChange={setModelResearchViewMode}
            selectedViewMode={modelResearchViewMode}
          />
          <RailFact
            label="Current map mode"
            value={
              modelResearchMapSummary.overlayEnabled
                ? modelResearchMapSummary.displayModeLabel
                : "Overlay off"
            }
          />
        </div>
        {modelResearchViewMode === "heatmap" ? (
          <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
            Heatmap shows relative research concentration only. No exact
            probabilities are shown.
          </p>
        ) : null}
      </section>

      <section className="cfs-command-card rounded-lg p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Legend
        </p>
        <div className="mt-2 grid gap-2">
          {modelResearchSignalLegend.map((item) => (
            <div
              className="flex items-center gap-2 text-xs text-slate-300"
              key={item.label}
            >
              <span
                aria-hidden="true"
                className={cn("mt-0.5 h-3 w-3 shrink-0 rounded-full border", item.dotClassName)}
              />
              <span className="block font-semibold text-slate-200">
                {item.label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.06] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
          Countywide view uses fused, count-scaled clusters. Medium zooms split
          into intermediate sub-clusters, closer zooms use fine local clusters,
          and closest zooms reveal parcel-safe detail markers.
        </p>
      </section>

      <section className="cfs-command-card rounded-lg p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Driver sources
        </p>
        <ul className="mt-2 space-y-2">
          {modelResearchDriverSources.map((source) => (
            <li className="text-xs leading-5 text-slate-300" key={source}>
              <span className="block font-semibold text-slate-200">
                {formatModelResearchDriverLabel(source)}
              </span>
              <span className="block text-[11px] leading-4 text-slate-500">
                {getModelResearchDriverExplanation(source)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cfs-command-card grid gap-2 rounded-lg p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Feature Groups
        </p>
        <RailMiniList
          items={developmentModelLabSummary.helpedFeatureGroups}
          title="Included"
        />
        <RailMiniList
          items={developmentModelLabSummary.excludedFeatureGroups}
          title="Excluded for now"
        />
      </section>

      <div className="grid gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/15"
          onClick={saveSnapshot}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          Save Snapshot
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
          onClick={openMethodologyModelLab}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Methodology Model Lab
        </button>
        <button
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
          onClick={onCollapseDrawer}
          type="button"
        >
          Collapse controls
        </button>
      </div>

      <details className="cfs-command-card rounded-lg p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-200">
          Advanced map layers
        </summary>
        <div className="mt-3">
          <LayerToggle />
        </div>
      </details>
    </div>
  );
}

function SnapshotModeControlsPanel({
  onCollapseDrawer,
}: {
  onCollapseDrawer?: () => void;
}) {
  const {
    activeLayerIds,
    overviewCommandMode,
    planningSnapshot,
    savedPlanningSnapshots,
    selectedParcelId,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();
  const latestCapturedMode = planningSnapshot?.overviewCommandMode
    ? formatRailModeLabel(planningSnapshot.overviewCommandMode)
    : formatRailModeLabel(overviewCommandMode);
  const mapImageStatus =
    planningSnapshot?.mapScreenshotStatus === "captured"
      ? "Captured"
      : planningSnapshot?.mapScreenshotStatus === "failed" ||
          planningSnapshot?.mapScreenshotStatus === "unavailable"
        ? "Unavailable"
        : "Pending";

  function saveSnapshot() {
    window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT));
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Snapshot Builder
        </p>
        <h3 className="mt-1 text-sm font-semibold text-white">
          Choose what to capture
        </h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {selectedParcelId
            ? "Snapshot will include selected parcel facts, map view, active layers, Intelligence Brief, and caveats."
            : "Snapshot will capture the current map, active layers, countywide intelligence, and caveats. Select a parcel first if you want parcel-specific facts included."}
        </p>
      </section>
      <RailFact
        label="Saved snapshots"
        value={String(savedPlanningSnapshots.length)}
      />
      <RailFact label="Current mode" value={latestCapturedMode} />
      <RailFact
        label="Selected parcel"
        value={selectedParcelId ?? "No parcel selected"}
      />
      <RailFact label="Active layers" value={String(activeLayerIds.length)} />
      <RailFact label="Map image" value={mapImageStatus} />
      <RailFact
        label="Latest snapshot"
        value={planningSnapshot ? "Available" : "Not saved"}
      />
      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/15"
        onClick={saveSnapshot}
        type="button"
      >
        <Save className="h-3.5 w-3.5" />
        Save Snapshot
      </button>
      <button
        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
        onClick={() => {
          setPlanningSnapshotView("overview");
          setProductMode("due_diligence");
        }}
        type="button"
      >
        Open Snapshot Library
      </button>
      <button
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
        onClick={onCollapseDrawer}
        type="button"
      >
        Collapse helper
      </button>
    </div>
  );
}

function ModelLabViewModeControl({
  onChange,
  selectedViewMode,
}: {
  onChange: (mode: MapOverlayViewMode) => void;
  selectedViewMode: MapOverlayViewMode;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/18 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          View
        </p>
        <div
          aria-label="Model Lab research overlay view mode"
          className="grid grid-cols-3 overflow-hidden rounded-md border border-white/10 bg-white/[0.035]"
          role="group"
        >
          {mapOverlayViewModes.map((mode) => {
            const selected = selectedViewMode === mode;

            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "min-w-[64px] border-r border-white/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition last:border-r-0",
                  selected
                    ? "bg-[#d8b86a]/18 text-[#f6d98e] shadow-[inset_0_-2px_0_rgba(216,184,106,0.45)]"
                    : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
                )}
                key={mode}
                onClick={() => onChange(mode)}
                title={`${formatMapOverlayViewMode(mode)} view`}
                type="button"
              >
                {formatMapOverlayViewMode(mode)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-100">
        {value}
      </p>
    </div>
  );
}

function RailMiniList({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-400">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatRailModeLabel(mode: OverviewCommandMode) {
  if (mode === "countywide") {
    return "Explore Countywide";
  }

  if (mode === "modelLab") {
    return "Model Lab";
  }

  if (mode === "snapshot") {
    return "Snapshot Builder";
  }

  if (mode === "indicatorCenter") {
    return "Indicator Center";
  }

  return "Search Parcel";
}

function getCollapsedRailLabel(mode: OverviewCommandMode) {
  if (mode === "modelLab") {
    return "Model Lab";
  }

  if (mode === "parcel") {
    return "Parcel";
  }

  if (mode === "snapshot") {
    return "Snapshot";
  }

  if (mode === "indicatorCenter") {
    return "Indicators";
  }

  return "Layers";
}

function getExpandedRailTitle(mode: OverviewCommandMode) {
  if (mode === "modelLab") {
    return "Model Lab";
  }

  if (mode === "parcel") {
    return "Parcel Helper";
  }

  if (mode === "snapshot") {
    return "Snapshot Builder";
  }

  if (mode === "indicatorCenter") {
    return "Indicator Center";
  }

  return "Map Controls";
}

function LayerRailEdgeHandle({
  collapsed = false,
  onPointerDown,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
  onToggleCollapsed?: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onToggleCollapsed?.();
  }

  if (!collapsed) {
    return (
      <>
        <div
          aria-hidden="true"
          className="cfs-layer-rail-resize-zone absolute -right-1.5 top-2 bottom-2 z-20 hidden touch-none cursor-ew-resize lg:block"
          onPointerDown={onPointerDown}
          title="Drag to resize panel"
        />
        <div
          aria-label="Drag to resize panel"
          aria-orientation="vertical"
          className={cn(
            "cfs-layer-rail-arrow group absolute right-[-0.85rem] top-[44%] z-30 hidden -translate-y-1/2 touch-none cursor-ew-resize items-center justify-center lg:flex",
          )}
          onPointerDown={onPointerDown}
          role="separator"
          tabIndex={0}
          title="Drag to resize panel"
        >
          <ArrowLeftRight className="relative h-4 w-4 text-slate-200 transition group-hover:text-[#f0cd79] group-focus-visible:text-[#f0cd79]" />
        </div>
      </>
    );
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="cfs-layer-rail-resize-zone absolute -right-1.5 top-2 bottom-2 z-20 hidden touch-none cursor-col-resize lg:block"
        onPointerDown={onPointerDown}
        title={
          collapsed
            ? "Drag right to expand map layers"
            : "Drag to resize map layers"
        }
      />
      <button
        aria-label="Expand map layers panel"
        aria-pressed={collapsed}
        className={cn(
          "cfs-layer-rail-arrow group absolute right-[-0.85rem] top-1/2 z-30 hidden -translate-y-1/2 touch-none items-center justify-center lg:flex",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed?.();
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        title="Expand map layers panel"
        type="button"
      >
        <ChevronRight className="relative h-4 w-4 text-slate-200 transition group-hover:text-[#f0cd79] group-focus-visible:text-[#f0cd79]" />
      </button>
    </>
  );
}
