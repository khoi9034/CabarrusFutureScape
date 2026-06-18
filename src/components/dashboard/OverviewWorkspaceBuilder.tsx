"use client";

import {
  Check,
  Copy,
  Eye,
  EyeOff,
  GripHorizontal,
  Layers3,
  Lock,
  Map,
  Maximize2,
  Move,
  Plus,
  RotateCcw,
  Save,
  Unlock,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import {
  CFS_SAVE_PLANNING_SNAPSHOT_EVENT,
  CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT,
  OverviewCommandCenter,
} from "@/components/dashboard/OverviewCommandCenter";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { Sidebar } from "@/components/layout/Sidebar";
import { EnterpriseErrorBoundary } from "@/components/ui/EnterpriseErrorBoundary";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useParcelDashboardMetrics } from "@/hooks/useParcelDashboardMetrics";
import { cn } from "@/lib/utils";

const CUSTOM_LAYOUT_STORAGE_KEY = "cfs.overview.customLayout.v2";
const LEGACY_CUSTOM_LAYOUT_STORAGE_KEY = "cfs.overview.customLayout.v1";
const CUSTOM_LAYOUT_VERSION = "phase25b_v2";
const GRID_COLUMNS = 12;
const GRID_MAX_ROWS = 48;
const GRID_ROW_HEIGHT = 32;
const GRID_GAP = 12;

type WorkspaceTileId =
  | "active_selection"
  | "command_center"
  | "intelligence"
  | "kpi_summary"
  | "layers"
  | "map"
  | "model_lab_controls"
  | "snapshot_helper"
  | "snapshot_status";

interface WorkspaceTileLayout {
  h: number;
  visible: boolean;
  w: number;
  x: number;
  y: number;
}

interface OverviewCustomLayout {
  locked: boolean;
  tiles: Record<WorkspaceTileId, WorkspaceTileLayout>;
  updatedAt: string;
  version: typeof CUSTOM_LAYOUT_VERSION;
}

interface WorkspaceTileDefinition {
  canHide: boolean;
  description: string;
  id: WorkspaceTileId;
  maxH: number;
  maxW: number;
  minH: number;
  minW: number;
  title: string;
}

const workspaceTileDefinitions: Record<
  WorkspaceTileId,
  WorkspaceTileDefinition
> = {
  active_selection: {
    canHide: true,
    description: "Selected parcel and parcel-specific command context.",
    id: "active_selection",
    maxH: 10,
    maxW: 5,
    minH: 4,
    minW: 3,
    title: "Active Selection",
  },
  command_center: {
    canHide: true,
    description: "Primary Overview task commands.",
    id: "command_center",
    maxH: 8,
    maxW: 12,
    minH: 4,
    minW: 6,
    title: "CFS Command Center",
  },
  intelligence: {
    canHide: true,
    description: "Adaptive Intelligence panel for the active Overview mode.",
    id: "intelligence",
    maxH: 28,
    maxW: 5,
    minH: 10,
    minW: 3,
    title: "Intelligence Panel",
  },
  kpi_summary: {
    canHide: true,
    description: "Countywide headline indicators.",
    id: "kpi_summary",
    maxH: 10,
    maxW: 8,
    minH: 4,
    minW: 4,
    title: "Countywide Indicators",
  },
  layers: {
    canHide: true,
    description: "Map layer controls and advanced overlays.",
    id: "layers",
    maxH: 24,
    maxW: 5,
    minH: 8,
    minW: 3,
    title: "Map Layers",
  },
  map: {
    canHide: false,
    description: "Live ArcGIS SceneView workspace.",
    id: "map",
    maxH: 32,
    maxW: 12,
    minH: 12,
    minW: 5,
    title: "Map / SceneView",
  },
  model_lab_controls: {
    canHide: true,
    description: "Internal model research controls and safe overlay legend.",
    id: "model_lab_controls",
    maxH: 24,
    maxW: 5,
    minH: 8,
    minW: 3,
    title: "Model Lab Controls",
  },
  snapshot_helper: {
    canHide: true,
    description: "Planning Snapshot capture helper.",
    id: "snapshot_helper",
    maxH: 16,
    maxW: 5,
    minH: 7,
    minW: 3,
    title: "Snapshot Helper",
  },
  snapshot_status: {
    canHide: true,
    description: "Saved snapshot count and library shortcut.",
    id: "snapshot_status",
    maxH: 8,
    maxW: 4,
    minH: 4,
    minW: 3,
    title: "Snapshot Status",
  },
};

const defaultCustomLayout: OverviewCustomLayout = {
  locked: false,
  tiles: {
    active_selection: { h: 5, visible: true, w: 3, x: 0, y: 22 },
    command_center: { h: 5, visible: true, w: 12, x: 0, y: 0 },
    intelligence: { h: 18, visible: true, w: 3, x: 9, y: 5 },
    kpi_summary: { h: 5, visible: true, w: 6, x: 3, y: 23 },
    layers: { h: 18, visible: true, w: 3, x: 0, y: 5 },
    map: { h: 18, visible: true, w: 6, x: 3, y: 5 },
    model_lab_controls: { h: 18, visible: false, w: 3, x: 0, y: 5 },
    snapshot_helper: { h: 12, visible: false, w: 3, x: 0, y: 5 },
    snapshot_status: { h: 5, visible: true, w: 3, x: 9, y: 23 },
  },
  updatedAt: "",
  version: CUSTOM_LAYOUT_VERSION,
};

const tileRenderOrder: WorkspaceTileId[] = [
  "command_center",
  "layers",
  "model_lab_controls",
  "snapshot_helper",
  "map",
  "intelligence",
  "active_selection",
  "kpi_summary",
  "snapshot_status",
];

export function OverviewWorkspaceBuilder({
  initialEditMode = false,
  onResetToDefault,
}: {
  initialEditMode?: boolean;
  onResetToDefault?: () => void;
}) {
  const {
    activeLayerIds,
    overviewCommandMode,
    planningSnapshot,
    savedPlanningSnapshots,
    selectedParcelId,
    selectedParcelIntelligence,
    setMapFocusMode,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const [customLayout, setCustomLayout] =
    useState<OverviewCustomLayout>(defaultCustomLayout);
  const [editMode, setEditMode] = useState(initialEditMode);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [selectedTileId, setSelectedTileId] =
    useState<WorkspaceTileId | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setCustomLayout(readStoredCustomLayout());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    function handleCustomizeLayout() {
      setEditMode(true);
      setCustomLayout((currentLayout) => ({
        ...currentLayout,
        locked: false,
      }));
    }

    window.addEventListener(
      CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT,
      handleCustomizeLayout,
    );
    return () =>
      window.removeEventListener(
        CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT,
        handleCustomizeLayout,
      );
  }, []);

  useEffect(() => {
    if (overviewCommandMode === "countywide") {
      showTile("layers");
    } else if (overviewCommandMode === "modelLab") {
      showTile("model_lab_controls");
    } else if (overviewCommandMode === "snapshot") {
      showTile("snapshot_helper");
    } else if (overviewCommandMode === "parcel") {
      showTile("active_selection");
    }
  }, [overviewCommandMode]);

  const hiddenTiles = useMemo(
    () =>
      tileRenderOrder.filter(
        (tileId) =>
          workspaceTileDefinitions[tileId].canHide &&
          !customLayout.tiles[tileId].visible,
      ),
    [customLayout.tiles],
  );

  function showTile(tileId: WorkspaceTileId) {
    setCustomLayout((currentLayout) =>
      normalizeCustomLayout({
        ...currentLayout,
        tiles: {
          ...currentLayout.tiles,
          [tileId]: {
            ...currentLayout.tiles[tileId],
            visible: true,
          },
        },
      }),
    );
  }

  function hideTile(tileId: WorkspaceTileId) {
    if (tileId === "map") {
      return;
    }

    setCustomLayout((currentLayout) =>
      normalizeCustomLayout({
        ...currentLayout,
        tiles: {
          ...currentLayout.tiles,
          [tileId]: {
            ...currentLayout.tiles[tileId],
            visible: false,
          },
        },
      }),
    );
  }

  function resetLayout() {
    const nextLayout = {
      ...defaultCustomLayout,
      updatedAt: new Date().toISOString(),
    };
    setCustomLayout(nextLayout);
    clearStoredCustomLayout();
    setSelectedTileId(null);
    workspaceScrollRef.current?.scrollTo({ left: 0, top: 0 });
    window.dispatchEvent(new Event("resize"));
    onResetToDefault?.();
  }

  function saveLayout() {
    const nextLayout = {
      ...normalizeCustomLayout(customLayout),
      updatedAt: new Date().toISOString(),
    };
    setCustomLayout(nextLayout);
    writeStoredCustomLayout(nextLayout);
    setLayoutSaved(true);
    window.setTimeout(() => setLayoutSaved(false), 2000);
  }

  function lockLayout() {
    const nextLayout = {
      ...normalizeCustomLayout(customLayout),
      locked: true,
      updatedAt: new Date().toISOString(),
    };
    setCustomLayout(nextLayout);
    writeStoredCustomLayout(nextLayout);
    setEditMode(false);
    setSelectedTileId(null);
  }

  function unlockLayout() {
    setCustomLayout((currentLayout) => ({
      ...currentLayout,
      locked: false,
    }));
    setEditMode(true);
  }

  function beginTileInteraction(
    event: ReactPointerEvent,
    tileId: WorkspaceTileId,
    interaction: "drag" | "resize",
  ) {
    if (!editMode || customLayout.locked) {
      return;
    }

    const gridElement = gridRef.current;
    const originalTile = customLayout.tiles[tileId];

    if (!gridElement || !originalTile) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedTileId(tileId);

    const gridRect = gridElement.getBoundingClientRect();
    const gridUnitX =
      (gridRect.width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS +
      GRID_GAP;
    const gridUnitY = GRID_ROW_HEIGHT + GRID_GAP;
    const startX = event.clientX;
    const startY = event.clientY;

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaColumns = Math.round((moveEvent.clientX - startX) / gridUnitX);
      const deltaRows = Math.round((moveEvent.clientY - startY) / gridUnitY);

      setCustomLayout((currentLayout) => {
        const currentTile = currentLayout.tiles[tileId];
        const nextTile =
          interaction === "drag"
            ? {
                ...currentTile,
                x: originalTile.x + deltaColumns,
                y: originalTile.y + deltaRows,
              }
            : {
                ...currentTile,
                h: originalTile.h + deltaRows,
                w: originalTile.w + deltaColumns,
              };

        const normalizedTile = clampTileLayout(
          tileId,
          nextTile,
          interaction === "resize",
        );

        return normalizeCustomLayout({
          ...currentLayout,
          tiles: resolveTileOverlaps(
            {
              ...currentLayout.tiles,
              [tileId]: normalizedTile,
            },
            tileId,
          ),
        });
      });
      window.dispatchEvent(new Event("resize"));
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.dispatchEvent(new Event("resize"));
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      {editMode ? (
        <LayoutEditorToolbar
          addPanelOpen={addPanelOpen}
          hiddenTiles={hiddenTiles}
          layoutLocked={customLayout.locked}
          layoutSaved={layoutSaved}
          onAddPanel={() => setAddPanelOpen((open) => !open)}
          onDone={() => {
            setEditMode(false);
            setAddPanelOpen(false);
            setSelectedTileId(null);
          }}
          onLockLayout={lockLayout}
          onResetLayout={resetLayout}
          onSaveLayout={saveLayout}
          onShowTile={showTile}
        />
      ) : null}

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-auto rounded-xl border border-white/8 bg-[#050b13]/65 p-3",
          editMode && "border-[#68d8ff]/20 bg-[#06111d]/78",
        )}
        ref={workspaceScrollRef}
      >
        <div
          className="grid min-h-full grid-cols-1 gap-3 lg:grid-cols-12"
          ref={gridRef}
          style={
            {
              "--cfs-workspace-grid-row": `${GRID_ROW_HEIGHT}px`,
              "--cfs-workspace-grid-gap": `${GRID_GAP}px`,
              gridAutoRows: `var(--cfs-workspace-grid-row)`,
            } as CSSProperties
          }
        >
          {tileRenderOrder.map((tileId) => {
            const tile = customLayout.tiles[tileId];

            if (!tile.visible) {
              return null;
            }

            return (
              <WorkspaceTile
                editMode={editMode}
                key={tileId}
                layout={tile}
                locked={customLayout.locked}
                onBeginInteraction={beginTileInteraction}
                onHideTile={hideTile}
                selected={selectedTileId === tileId}
                tileId={tileId}
              >
                <WorkspaceTileContent
                  activeLayerCount={activeLayerIds.length}
                  onFocusMap={() => setMapFocusMode(true)}
                  onOpenSnapshots={() => {
                    setPlanningSnapshotView("overview");
                    setProductMode("due_diligence");
                  }}
                  planningSnapshot={planningSnapshot}
                  savedSnapshotCount={savedPlanningSnapshots.length}
                  selectedParcelId={selectedParcelId}
                  selectedParcelIntelligence={selectedParcelIntelligence}
                  tileId={tileId}
                />
              </WorkspaceTile>
            );
          })}
        </div>
      </div>

      {!editMode ? (
        <button
          aria-label="Customize Overview layout"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-[#68d8ff]/30 bg-[#07111f]/92 px-4 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-[#68d8ff]/55 hover:bg-[#68d8ff]/12"
          onClick={customLayout.locked ? unlockLayout : () => setEditMode(true)}
          type="button"
        >
          {customLayout.locked ? (
            <Unlock className="h-3.5 w-3.5" />
          ) : (
            <Move className="h-3.5 w-3.5" />
          )}
          Customize Layout
        </button>
      ) : null}
    </main>
  );
}

function WorkspaceTile({
  children,
  editMode,
  layout,
  locked,
  onBeginInteraction,
  onHideTile,
  selected,
  tileId,
}: {
  children: ReactNode;
  editMode: boolean;
  layout: WorkspaceTileLayout;
  locked: boolean;
  onBeginInteraction: (
    event: ReactPointerEvent,
    tileId: WorkspaceTileId,
    interaction: "drag" | "resize",
  ) => void;
  onHideTile: (tileId: WorkspaceTileId) => void;
  selected: boolean;
  tileId: WorkspaceTileId;
}) {
  const definition = workspaceTileDefinitions[tileId];
  const tileStyle = {
    "--workspace-tile-column": `${layout.x + 1} / span ${layout.w}`,
    "--workspace-tile-row": `${layout.y + 1} / span ${layout.h}`,
  } as CSSProperties;
  const canEdit = editMode && !locked;

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-col rounded-lg",
        tileId === "command_center" ? "overflow-visible" : "overflow-hidden",
        "lg:[grid-column:var(--workspace-tile-column)] lg:[grid-row:var(--workspace-tile-row)]",
        editMode
          ? "border border-[#68d8ff]/20 bg-white/[0.025] shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
          : "border border-transparent",
        selected && "border-[#68d8ff]/60 shadow-[0_0_0_1px_rgba(104,216,255,0.28),0_18px_45px_rgba(0,0,0,0.35)]",
      )}
      data-workspace-tile={tileId}
      style={tileStyle}
    >
      {editMode ? (
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex items-center justify-between gap-2">
          <button
            aria-label={`Drag ${definition.title}`}
            className={cn(
              "pointer-events-auto inline-flex max-w-[70%] cursor-grab items-center gap-2 rounded-full border border-white/12 bg-[#07111f]/92 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-xl",
              canEdit && "active:cursor-grabbing",
            )}
            disabled={!canEdit}
            onPointerDown={(event) =>
              onBeginInteraction(event, tileId, "drag")
            }
            title={`Drag ${definition.title}`}
            type="button"
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#8fe7ff]" />
            <span className="truncate">{definition.title}</span>
          </button>
          <div className="pointer-events-auto flex items-center gap-1">
            {definition.canHide ? (
              <button
                aria-label={`Hide ${definition.title}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#07111f]/92 text-slate-300 shadow-[0_8px_20px_rgba(0,0,0,0.24)] backdrop-blur-xl transition hover:border-white/25 hover:text-white"
                onClick={() => onHideTile(tileId)}
                title={`Hide ${definition.title}`}
                type="button"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-flex h-7 items-center rounded-full border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#f8dc91]">
                Required
              </span>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1",
          editMode && "pt-11",
          tileId !== "command_center" && "overflow-auto",
        )}
      >
        {children}
      </div>

      {canEdit ? (
        <button
          aria-label={`Resize ${definition.title}`}
          className="absolute bottom-2 right-2 z-30 inline-flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-md border border-white/12 bg-[#07111f]/92 text-slate-200 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:border-[#68d8ff]/45 hover:text-white"
          onPointerDown={(event) =>
            onBeginInteraction(event, tileId, "resize")
          }
          title={`Resize ${definition.title}`}
          type="button"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </section>
  );
}

function WorkspaceTileContent({
  activeLayerCount,
  onFocusMap,
  onOpenSnapshots,
  planningSnapshot,
  savedSnapshotCount,
  selectedParcelId,
  selectedParcelIntelligence,
  tileId,
}: {
  activeLayerCount: number;
  onFocusMap: () => void;
  onOpenSnapshots: () => void;
  planningSnapshot: ReturnType<typeof useDashboardState>["planningSnapshot"];
  savedSnapshotCount: number;
  selectedParcelId: string | null;
  selectedParcelIntelligence: ReturnType<
    typeof useDashboardState
  >["selectedParcelIntelligence"];
  tileId: WorkspaceTileId;
}) {
  if (tileId === "command_center") {
    return (
      <EnterpriseErrorBoundary moduleName="Command Center">
        <OverviewCommandCenter />
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "map") {
    return (
      <EnterpriseErrorBoundary
        moduleName="3D SceneView"
        resetKey={selectedParcelId}
      >
        <div className="h-full min-h-[20rem] overflow-hidden rounded-lg">
          <SceneViewContainer />
        </div>
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "intelligence") {
    return (
      <EnterpriseErrorBoundary
        moduleName="Intelligence Panel"
        resetKey={`overview-workspace-${selectedParcelId ?? "none"}`}
      >
        <IntelligencePanel />
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "layers") {
    return (
      <EnterpriseErrorBoundary moduleName="Map Layers">
        <Sidebar embedded overviewCommandMode="countywide" />
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "model_lab_controls") {
    return (
      <EnterpriseErrorBoundary moduleName="Model Lab Controls">
        <Sidebar embedded overviewCommandMode="modelLab" />
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "snapshot_helper") {
    return (
      <EnterpriseErrorBoundary moduleName="Snapshot Helper">
        <Sidebar embedded overviewCommandMode="snapshot" />
      </EnterpriseErrorBoundary>
    );
  }

  if (tileId === "active_selection") {
    return (
      <ActiveSelectionTile
        onFocusMap={onFocusMap}
        selectedParcelId={selectedParcelId}
        selectedParcelIntelligence={selectedParcelIntelligence}
      />
    );
  }

  if (tileId === "kpi_summary") {
    return <KpiSummaryTile activeLayerCount={activeLayerCount} />;
  }

  return (
    <SnapshotStatusTile
      onOpenSnapshots={onOpenSnapshots}
      planningSnapshot={planningSnapshot}
      savedSnapshotCount={savedSnapshotCount}
    />
  );
}

function ActiveSelectionTile({
  onFocusMap,
  selectedParcelId,
  selectedParcelIntelligence,
}: {
  onFocusMap: () => void;
  selectedParcelId: string | null;
  selectedParcelIntelligence: ReturnType<
    typeof useDashboardState
  >["selectedParcelIntelligence"];
}) {
  const [copied, setCopied] = useState(false);
  const parcelLabel =
    selectedParcelIntelligence?.officialParcelId ??
    selectedParcelId ??
    "No parcel selected";

  async function copyParcelId() {
    if (!selectedParcelId) {
      return;
    }

    await navigator.clipboard.writeText(selectedParcelId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="h-full rounded-lg border border-white/10 bg-[#07111f]/90 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
        Active Selection
      </p>
      <h3 className="mt-1 truncate text-sm font-semibold text-white">
        {parcelLabel}
      </h3>
      <div className="mt-3 grid gap-2 text-xs">
        <TileFact
          label="Owner / Account"
          value={selectedParcelIntelligence?.ownerName ?? "Select parcel"}
        />
        <TileFact
          label="Zoning"
          value={
            selectedParcelIntelligence?.zoningCode ??
            selectedParcelIntelligence?.zoningCategory ??
            "Unavailable"
          }
        />
        <TileFact
          label="Address"
          value={selectedParcelIntelligence?.mailingAddress ?? "Unavailable"}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onFocusMap}
          type="button"
        >
          <Map className="h-3.5 w-3.5 text-[#8fe7ff]" />
          Focus Map
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          disabled={!selectedParcelId}
          onClick={copyParcelId}
          type="button"
        >
          <Copy className="h-3.5 w-3.5 text-[#8fe7ff]" />
          {copied ? "Copied" : "Copy ID"}
        </button>
      </div>
    </section>
  );
}

function KpiSummaryTile({ activeLayerCount }: { activeLayerCount: number }) {
  const parcelMetrics = useParcelDashboardMetrics();
  const developmentStatistics = useDevelopmentStatistics();
  const floodSummary = useFloodConstraintSummary();
  const permitRecords =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "total-permits",
    )?.value ?? null;
  const activeParcels =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "parcels-with-activity",
    )?.value ?? null;
  const floodReview =
    floodSummary.metrics.find((metric) => metric.id === "review-required")
      ?.value ?? (floodSummary.isLoading ? "Loading" : "Pending");

  return (
    <section className="h-full rounded-lg border border-white/10 bg-[#07111f]/90 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            KPI Summary
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">
            Countywide Indicators
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-400">
          {activeLayerCount} active layers
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TileFact
          label="Permit Records"
          value={permitRecords ?? "Pending"}
        />
        <TileFact
          label="Active Parcels"
          value={activeParcels ?? "Pending"}
        />
        <TileFact label="Flood Review" value={String(floodReview)} />
        <TileFact
          label="Parcel Coverage"
          value={formatCompactNumber(parcelMetrics.summary.totalParcels)}
        />
      </div>
      <p className="mt-3 text-[11px] leading-4 text-slate-500">
        Indicators are planning context and observed activity, not model
        predictions.
      </p>
    </section>
  );
}

function SnapshotStatusTile({
  onOpenSnapshots,
  planningSnapshot,
  savedSnapshotCount,
}: {
  onOpenSnapshots: () => void;
  planningSnapshot: ReturnType<typeof useDashboardState>["planningSnapshot"];
  savedSnapshotCount: number;
}) {
  return (
    <section className="h-full rounded-lg border border-white/10 bg-[#07111f]/90 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
        Snapshot Status
      </p>
      <h3 className="mt-1 text-sm font-semibold text-white">
        {savedSnapshotCount
          ? `${savedSnapshotCount} saved`
          : "No snapshots saved"}
      </h3>
      <div className="mt-3 grid gap-2">
        <TileFact
          label="Latest map image"
          value={
            planningSnapshot?.mapScreenshotStatus === "captured"
              ? "Captured"
              : planningSnapshot
                ? "Unavailable"
                : "Not saved"
          }
        />
        <TileFact
          label="Latest context"
          value={planningSnapshot?.focusModeLabel ?? "Not saved"}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-2 py-2 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/15"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT),
            )
          }
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onOpenSnapshots}
          type="button"
        >
          <Layers3 className="h-3.5 w-3.5 text-[#8fe7ff]" />
          Library
        </button>
      </div>
    </section>
  );
}

function TileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function LayoutEditorToolbar({
  addPanelOpen,
  hiddenTiles,
  layoutLocked,
  layoutSaved,
  onAddPanel,
  onDone,
  onLockLayout,
  onResetLayout,
  onSaveLayout,
  onShowTile,
}: {
  addPanelOpen: boolean;
  hiddenTiles: WorkspaceTileId[];
  layoutLocked: boolean;
  layoutSaved: boolean;
  onAddPanel: () => void;
  onDone: () => void;
  onLockLayout: () => void;
  onResetLayout: () => void;
  onSaveLayout: () => void;
  onShowTile: (tileId: WorkspaceTileId) => void;
}) {
  return (
    <div className="app-chrome mb-3 rounded-lg border border-[#68d8ff]/20 bg-[#07111f]/94 px-3 py-2 shadow-[0_14px_38px_rgba(0,0,0,0.32)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Customize Layout
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Drag or resize panels. This only changes your local workspace
            layout.
          </p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-[#55d38f]/30 bg-[#55d38f]/10 px-3 py-2 text-xs font-semibold text-[#bdf7d0] transition hover:bg-[#55d38f]/15"
            onClick={onDone}
            type="button"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f8dc91] transition hover:bg-[#d8b86a]/15"
            onClick={onSaveLayout}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {layoutSaved ? "Layout Saved" : "Save Layout"}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            onClick={onResetLayout}
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#8fe7ff]" />
            Reset Layout
          </button>
          <button
            aria-expanded={addPanelOpen}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            onClick={onAddPanel}
            type="button"
          >
            <Plus className="h-3.5 w-3.5 text-[#8fe7ff]" />
            Add Panel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            onClick={onLockLayout}
            type="button"
          >
            {layoutLocked ? (
              <Unlock className="h-3.5 w-3.5 text-[#8fe7ff]" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-[#8fe7ff]" />
            )}
            Lock Layout
          </button>

          {addPanelOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(23rem,calc(100vw-2rem))] rounded-lg border border-white/12 bg-[#07111f]/98 p-3 shadow-[0_22px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                Add Panel
              </p>
              <div className="mt-2 grid gap-2">
                {tileRenderOrder.map((tileId) => {
                  const definition = workspaceTileDefinitions[tileId];
                  const available = hiddenTiles.includes(tileId);
                  const isMap = tileId === "map";

                  return (
                    <button
                      className={cn(
                        "flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition",
                        available
                          ? "border-white/10 bg-white/[0.04] text-slate-200 hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/10"
                          : "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-500",
                      )}
                      disabled={!available}
                      key={tileId}
                      onClick={() => onShowTile(tileId)}
                      type="button"
                    >
                      {available ? (
                        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8fe7ff]" />
                      ) : (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                      )}
                      <span>
                        <span className="block text-xs font-semibold">
                          {definition.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                          {isMap
                            ? "Map is required and stays available."
                            : definition.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function clampTileLayout(
  tileId: WorkspaceTileId,
  tile: WorkspaceTileLayout,
  resizing = false,
): WorkspaceTileLayout {
  const definition = workspaceTileDefinitions[tileId];
  const width = clampNumber(tile.w, definition.minW, definition.maxW);
  const height = clampNumber(tile.h, definition.minH, definition.maxH);
  const x = clampNumber(tile.x, 0, GRID_COLUMNS - width);
  const y = clampNumber(tile.y, 0, GRID_MAX_ROWS - height);

  return {
    h: height,
    visible: tileId === "map" ? true : tile.visible,
    w: resizing ? clampNumber(width, definition.minW, GRID_COLUMNS - x) : width,
    x,
    y,
  };
}

function normalizeCustomLayout(
  layout: Partial<OverviewCustomLayout> | null | undefined,
): OverviewCustomLayout {
  const tiles = { ...defaultCustomLayout.tiles };

  for (const tileId of tileRenderOrder) {
    const incomingTile = layout?.tiles?.[tileId];
    tiles[tileId] = clampTileLayout(tileId, {
      ...defaultCustomLayout.tiles[tileId],
      ...incomingTile,
      visible:
        tileId === "map"
          ? true
          : (incomingTile?.visible ?? defaultCustomLayout.tiles[tileId].visible),
    });
  }

  return {
    locked: Boolean(layout?.locked),
    tiles: resolveTileOverlaps(tiles, "map"),
    updatedAt:
      typeof layout?.updatedAt === "string" ? layout.updatedAt : "",
    version: CUSTOM_LAYOUT_VERSION,
  };
}

function readStoredCustomLayout() {
  if (typeof window === "undefined") {
    return defaultCustomLayout;
  }

  try {
    const storedLayout = window.localStorage.getItem(CUSTOM_LAYOUT_STORAGE_KEY);

    if (!storedLayout) {
      return defaultCustomLayout;
    }

    const parsedLayout = JSON.parse(storedLayout) as Partial<OverviewCustomLayout>;
    if (parsedLayout.version !== CUSTOM_LAYOUT_VERSION) {
      return defaultCustomLayout;
    }

    return normalizeCustomLayout(parsedLayout);
  } catch {
    return defaultCustomLayout;
  }
}

function writeStoredCustomLayout(layout: OverviewCustomLayout) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CUSTOM_LAYOUT_STORAGE_KEY,
    JSON.stringify(layout),
  );
}

function clearStoredCustomLayout() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CUSTOM_LAYOUT_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_CUSTOM_LAYOUT_STORAGE_KEY);
}

function resolveTileOverlaps(
  tiles: Record<WorkspaceTileId, WorkspaceTileLayout>,
  priorityTileId: WorkspaceTileId,
) {
  const nextTiles = { ...tiles };
  const visibleTileIds = tileRenderOrder.filter(
    (tileId) => nextTiles[tileId].visible,
  );
  const orderedTileIds = visibleTileIds.sort((leftId, rightId) => {
    if (leftId === priorityTileId) {
      return -1;
    }

    if (rightId === priorityTileId) {
      return 1;
    }

    return (
      nextTiles[leftId].y - nextTiles[rightId].y ||
      nextTiles[leftId].x - nextTiles[rightId].x
    );
  });

  for (let pass = 0; pass < orderedTileIds.length * 2; pass += 1) {
    let changed = false;

    for (let index = 0; index < orderedTileIds.length; index += 1) {
      const currentId = orderedTileIds[index];
      const currentTile = nextTiles[currentId];

      for (let compareIndex = index + 1; compareIndex < orderedTileIds.length; compareIndex += 1) {
        const comparedId = orderedTileIds[compareIndex];
        const comparedTile = nextTiles[comparedId];

        if (!tilesOverlap(currentTile, comparedTile)) {
          continue;
        }

        nextTiles[comparedId] = clampTileLayout(comparedId, {
          ...comparedTile,
          y: currentTile.y + currentTile.h,
        });
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return nextTiles;
}

function tilesOverlap(left: WorkspaceTileLayout, right: WorkspaceTileLayout) {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max);
}

function formatCompactNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US").format(value);
}
