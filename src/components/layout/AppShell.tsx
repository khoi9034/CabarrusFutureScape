"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { DashboardUrlSync } from "@/components/dashboard/DashboardUrlSync";
import { ExecutivePrintView } from "@/components/dashboard/ExecutivePrintView";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { MethodologyWorkspace } from "@/components/dashboard/MethodologyWorkspace";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { MetricsBar } from "@/components/layout/MetricsBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { EnterpriseErrorBoundary } from "@/components/ui/EnterpriseErrorBoundary";
import { DashboardProvider, useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";

const LAYER_RAIL_DEFAULT_WIDTH = 360;
const LAYER_RAIL_MIN_WIDTH = 300;
const LAYER_RAIL_COLLAPSE_INTENT_DISTANCE = 14;
const LAYER_RAIL_COLLAPSED_WIDTH = 64;
const LAYER_RAIL_STORAGE_KEY = "cfs.layerRailWidth";
type LayerRailDragPreview = "collapsed" | "expanded" | null;

export function AppShell() {
  return (
    <DashboardProvider>
      <DashboardUrlSync />
      <ProductShell />
    </DashboardProvider>
  );
}

function ProductShell() {
  const {
    isMapFocusMode,
    productMode,
    selectedParcelId,
    setMapFocusMode,
  } = useDashboardState();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const layerRailWidthRef = useRef(LAYER_RAIL_DEFAULT_WIDTH);
  const layerRailDragPreviewRef = useRef<LayerRailDragPreview>(null);
  const layerRailPreviewWidthRef = useRef<number | null>(null);
  const [layerRailWidth, setLayerRailWidth] = useState(
    LAYER_RAIL_DEFAULT_WIDTH,
  );
  const [layerRailCollapsed, setLayerRailCollapsed] = useState(false);
  const [layerRailDragPreview, setLayerRailDragPreview] =
    useState<LayerRailDragPreview>(null);
  const [layerRailPreviewWidth, setLayerRailPreviewWidth] = useState<
    number | null
  >(null);
  const [layerRailDragging, setLayerRailDragging] = useState(false);
  const executivePrintMode = productMode === "executive_print";
  const methodologyMode = productMode === "methodology";
  const showLayerRail = productMode === "overview" || isMapFocusMode;
  const showIntelligencePanel = !isMapFocusMode && !methodologyMode;
  const previewLayerRailCollapsed =
    layerRailDragPreview === null
      ? layerRailCollapsed
      : layerRailDragPreview === "collapsed";
  const effectiveLayerRailWidth = previewLayerRailCollapsed
    ? LAYER_RAIL_COLLAPSED_WIDTH
    : (layerRailPreviewWidth ?? layerRailWidth);
  const shellGridStyle = {
    "--cfs-layer-rail-width": `${effectiveLayerRailWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    layerRailWidthRef.current = layerRailWidth;
  }, [layerRailWidth]);

  useEffect(() => {
    const storedWidth = getStoredLayerRailWidth();
    layerRailWidthRef.current = storedWidth;

    const frameId = window.requestAnimationFrame(() => {
      setLayerRailWidth(storedWidth);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!isMapFocusMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMapFocusMode(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMapFocusMode, setMapFocusMode]);

  const beginLayerRailResize = useCallback(
    (event: ReactPointerEvent) => {
      if (!showLayerRail) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const wasCollapsed = layerRailCollapsed;
      const startWidth = layerRailWidthRef.current;
      let latestClientX = startX;
      let frameId: number | null = null;
      let moved = false;
      let shouldCollapse = wasCollapsed;
      let nextCommittedWidth = startWidth;
      let lastPointerX = startX;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.classList.add("cfs-resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      layerRailDragPreviewRef.current = wasCollapsed
        ? "collapsed"
        : "expanded";
      layerRailPreviewWidthRef.current = wasCollapsed ? null : startWidth;
      setLayerRailDragging(true);
      setLayerRailDragPreview(layerRailDragPreviewRef.current);
      setLayerRailPreviewWidth(layerRailPreviewWidthRef.current);

      function applyVisualWidth(nextWidth: number) {
        gridRef.current?.style.setProperty(
          "--cfs-layer-rail-width",
          `${nextWidth}px`,
        );
      }

      function applyPreview(
        nextPreview: Exclude<LayerRailDragPreview, null>,
        previewWidth: number | null,
      ) {
        const previewChanged = layerRailDragPreviewRef.current !== nextPreview;
        const widthChanged = layerRailPreviewWidthRef.current !== previewWidth;

        if (previewChanged) {
          layerRailDragPreviewRef.current = nextPreview;
        }

        if (widthChanged) {
          layerRailPreviewWidthRef.current = previewWidth;
        }

        if (previewChanged) {
          // Flush only when crossing collapsed/expanded states so the expanded
          // rail content is removed before the CSS width snaps to the slim rail.
          flushSync(() => {
            setLayerRailDragPreview(nextPreview);
            if (widthChanged) {
              setLayerRailPreviewWidth(previewWidth);
            }
          });
        } else if (widthChanged && nextPreview === "expanded") {
          setLayerRailPreviewWidth(previewWidth);
        }
      }

      function applyPendingMove() {
        frameId = null;
        const delta = latestClientX - startX;
        const proposedWidth = startWidth + delta;
        const movingLeft = latestClientX < lastPointerX;
        const collapseTriggerWidth =
          LAYER_RAIL_MIN_WIDTH - LAYER_RAIL_COLLAPSE_INTENT_DISTANCE;
        moved = moved || Math.abs(delta) > 4;
        const maxWidth = getLayerRailMaxWidth();

        if (wasCollapsed) {
          if (delta > 8) {
            shouldCollapse = false;
            nextCommittedWidth = clampLayerRailWidth(
              startWidth + delta,
              maxWidth,
            );
            applyPreview("expanded", nextCommittedWidth);
            applyVisualWidth(nextCommittedWidth);
          } else {
            shouldCollapse = true;
            applyPreview("collapsed", null);
            applyVisualWidth(LAYER_RAIL_COLLAPSED_WIDTH);
          }
          lastPointerX = latestClientX;
          return;
        }

        if (proposedWidth <= collapseTriggerWidth && movingLeft) {
          shouldCollapse = true;
          applyPreview("collapsed", null);
          applyVisualWidth(LAYER_RAIL_COLLAPSED_WIDTH);
          lastPointerX = latestClientX;
          return;
        }

        if (
          layerRailDragPreviewRef.current === "collapsed" &&
          proposedWidth < LAYER_RAIL_MIN_WIDTH
        ) {
          shouldCollapse = true;
          applyPreview("collapsed", null);
          applyVisualWidth(LAYER_RAIL_COLLAPSED_WIDTH);
          lastPointerX = latestClientX;
          return;
        }

        if (proposedWidth <= LAYER_RAIL_MIN_WIDTH) {
          shouldCollapse = false;
          nextCommittedWidth = LAYER_RAIL_MIN_WIDTH;
          applyPreview("expanded", LAYER_RAIL_MIN_WIDTH);
          applyVisualWidth(LAYER_RAIL_MIN_WIDTH);
          lastPointerX = latestClientX;
          return;
        }

        shouldCollapse = false;
        nextCommittedWidth = clampLayerRailWidth(proposedWidth, maxWidth);
        applyPreview("expanded", nextCommittedWidth);
        applyVisualWidth(nextCommittedWidth);
        lastPointerX = latestClientX;
      }

      function queueMove(moveEvent: PointerEvent) {
        latestClientX = moveEvent.clientX;

        if (frameId !== null) {
          return;
        }

        frameId = window.requestAnimationFrame(applyPendingMove);
      }

      function handlePointerUp() {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          applyPendingMove();
        }

        document.body.classList.remove("cfs-resizing");
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", queueMove);
        window.removeEventListener("pointerup", handlePointerUp);
        layerRailDragPreviewRef.current = null;
        layerRailPreviewWidthRef.current = null;
        setLayerRailDragging(false);
        setLayerRailDragPreview(null);
        setLayerRailPreviewWidth(null);

        if (!moved) {
          const nextCollapsed = !wasCollapsed;
          setLayerRailCollapsed(nextCollapsed);
          applyVisualWidth(
            nextCollapsed ? LAYER_RAIL_COLLAPSED_WIDTH : layerRailWidthRef.current,
          );
          return;
        }

        if (shouldCollapse) {
          setLayerRailCollapsed(true);
          applyVisualWidth(LAYER_RAIL_COLLAPSED_WIDTH);
          return;
        }

        setLayerRailCollapsed(false);
        setLayerRailWidth(nextCommittedWidth);
        storeLayerRailWidth(nextCommittedWidth);
        applyVisualWidth(nextCommittedWidth);
      }

      window.addEventListener("pointermove", queueMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [layerRailCollapsed, showLayerRail],
  );

  const toggleLayerRailCollapsed = useCallback(() => {
    setLayerRailCollapsed((collapsed) => !collapsed);
  }, []);

  return (
    <div className="metric-grid relative flex min-h-screen flex-col overflow-x-hidden bg-[#060b12] text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,11,18,0.14),rgba(6,11,18,0.86))]" />
      <div className="pointer-events-none absolute left-0 right-0 top-16 z-10 h-px gold-line opacity-70" />

      <div className="app-chrome">
        <TopNav />
      </div>

      {executivePrintMode ? (
        <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
          <EnterpriseErrorBoundary
            moduleName="Executive Print"
            resetKey={productMode}
          >
            <ExecutivePrintView />
          </EnterpriseErrorBoundary>
        </main>
      ) : methodologyMode ? (
        <EnterpriseErrorBoundary moduleName="Methodology" resetKey={productMode}>
          <MethodologyWorkspace />
        </EnterpriseErrorBoundary>
      ) : (
        <div
          ref={gridRef}
          className={cn(
            "relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2 lg:p-3",
            isMapFocusMode
              ? "lg:grid-cols-[var(--cfs-layer-rail-width)_minmax(0,1fr)]"
              : productMode === "overview"
                ? "lg:grid-cols-[var(--cfs-layer-rail-width)_minmax(0,1fr)_332px] xl:grid-cols-[var(--cfs-layer-rail-width)_minmax(0,1fr)_352px]"
                : "lg:grid-cols-[minmax(0,1fr)_386px] xl:grid-cols-[minmax(0,1fr)_412px]",
          )}
          style={showLayerRail ? shellGridStyle : undefined}
        >
          {showLayerRail ? (
            <EnterpriseErrorBoundary
              moduleName="Map Layers"
              resetKey={`${productMode}-${previewLayerRailCollapsed}`}
            >
              <Sidebar
                collapsed={previewLayerRailCollapsed}
                dragging={layerRailDragging}
                onResizeStart={beginLayerRailResize}
                onToggleCollapsed={toggleLayerRailCollapsed}
              />
            </EnterpriseErrorBoundary>
          ) : null}
          <main
            className={cn(
              "order-1 min-h-[58vh] md:col-span-2 md:min-h-[62vh] lg:col-span-1 lg:min-h-0",
              showLayerRail ? "lg:order-2" : "lg:order-1",
              isMapFocusMode && "min-h-[calc(100vh-7.25rem)] md:min-h-[calc(100vh-7.25rem)]",
            )}
          >
            <EnterpriseErrorBoundary
              moduleName="3D SceneView"
              resetKey={selectedParcelId}
            >
              <SceneViewContainer />
            </EnterpriseErrorBoundary>
          </main>
          {showIntelligencePanel ? (
            <EnterpriseErrorBoundary
              moduleName="Intelligence Panel"
              resetKey={`${productMode}-${selectedParcelId ?? "none"}`}
            >
              <IntelligencePanel />
            </EnterpriseErrorBoundary>
          ) : null}
        </div>
      )}

      {!executivePrintMode && !isMapFocusMode && !methodologyMode ? (
        <div className="app-chrome">
          <EnterpriseErrorBoundary moduleName="County Metrics">
            <MetricsBar />
          </EnterpriseErrorBoundary>
        </div>
      ) : null}
    </div>
  );
}

function getLayerRailMaxWidth() {
  if (typeof window === "undefined") {
    return 520;
  }

  return Math.min(640, Math.max(LAYER_RAIL_MIN_WIDTH, window.innerWidth * 0.4));
}

function clampLayerRailWidth(width: number, maxWidth = getLayerRailMaxWidth()) {
  return Math.round(
    Math.min(Math.max(width, LAYER_RAIL_MIN_WIDTH), maxWidth),
  );
}

function getStoredLayerRailWidth() {
  if (typeof window === "undefined") {
    return LAYER_RAIL_DEFAULT_WIDTH;
  }

  const stored = Number(window.localStorage.getItem(LAYER_RAIL_STORAGE_KEY));

  if (!Number.isFinite(stored)) {
    return LAYER_RAIL_DEFAULT_WIDTH;
  }

  return clampLayerRailWidth(stored);
}

function storeLayerRailWidth(width: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LAYER_RAIL_STORAGE_KEY,
    String(clampLayerRailWidth(width)),
  );
}
