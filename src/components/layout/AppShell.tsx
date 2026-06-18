"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DashboardUrlSync } from "@/components/dashboard/DashboardUrlSync";
import { DueDiligenceReview } from "@/components/dashboard/DueDiligenceReview";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { MethodologyWorkspace } from "@/components/dashboard/MethodologyWorkspace";
import {
  CFS_TOGGLE_OVERVIEW_CUSTOM_LAYOUT_EVENT,
  OverviewCommandCenter,
} from "@/components/dashboard/OverviewCommandCenter";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { OverviewWorkspaceBuilder } from "@/components/dashboard/OverviewWorkspaceBuilder";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { EnterpriseErrorBoundary } from "@/components/ui/EnterpriseErrorBoundary";
import { DashboardProvider, useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { OverviewPanelWidthPreset } from "@/types";

const LEFT_PANEL_WIDTHS: Record<OverviewPanelWidthPreset, number> = {
  compact: 320,
  standard: 372,
  wide: 456,
};
const LEFT_PANEL_COLLAPSED_WIDTH = 64;
const LEFT_PANEL_MIN_EXPANDED_WIDTH = 320;
const LEFT_PANEL_MAX_EXPANDED_WIDTH = 520;
const LEFT_PANEL_COLLAPSE_THRESHOLD = 210;

const RIGHT_PANEL_WIDTHS: Record<OverviewPanelWidthPreset, number> = {
  compact: 320,
  standard: 390,
  wide: 460,
};

function clampLeftPanelWidth(width: number) {
  return Math.min(
    LEFT_PANEL_MAX_EXPANDED_WIDTH,
    Math.max(LEFT_PANEL_MIN_EXPANDED_WIDTH, width),
  );
}

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
    developmentHotspotsEnabled,
    floodConstraintsEnabled,
    floodZonesEnabled,
    isMapFocusMode,
    parcelReviewView,
    productMode,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    setMapFocusMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();
  const [customOverviewActive, setCustomOverviewActive] = useState(false);
  const executivePrintMode = productMode === "executive_print";
  const parcelReviewMode =
    productMode === "due_diligence" || executivePrintMode;
  const effectiveParcelReviewView = executivePrintMode
    ? "report"
    : parcelReviewView;
  const methodologyMode = productMode === "methodology";

  useEffect(() => {
    if (productMode === "executive_print") {
      setParcelReviewView("report");
      setPlanningSnapshotView("summary");
      setProductMode("due_diligence");
    }
  }, [
    productMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
  ]);

  useEffect(() => {
    function handleCustomizeLayout() {
      setCustomOverviewActive(true);
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
    if (productMode !== "overview") {
      const frameId = window.requestAnimationFrame(() =>
        setCustomOverviewActive(false),
      );

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [productMode]);

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

  return (
    <div className="metric-grid relative flex min-h-screen flex-col overflow-x-hidden bg-[#060b12] text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,11,18,0.14),rgba(6,11,18,0.86))]" />
      <div className="pointer-events-none absolute left-0 right-0 top-16 z-10 h-px gold-line opacity-70" />

      <div className="app-chrome">
        <TopNav />
      </div>

      {parcelReviewMode ? (
        <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
          <EnterpriseErrorBoundary
            moduleName="Planning Snapshot"
            resetKey={`${productMode}-${selectedParcelId ?? "none"}`}
          >
            <DueDiligenceReview
              developmentHotspotsEnabled={developmentHotspotsEnabled}
              floodConstraintsEnabled={floodConstraintsEnabled}
              floodZonesEnabled={floodZonesEnabled}
              parcelReviewView={effectiveParcelReviewView}
              selectedParcelId={selectedParcelId}
              selectedParcelIntelligence={selectedParcelIntelligence}
              selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
              setMapFocusMode={setMapFocusMode}
              setParcelReviewView={setParcelReviewView}
              setProductMode={setProductMode}
            />
          </EnterpriseErrorBoundary>
        </main>
      ) : methodologyMode ? (
        <EnterpriseErrorBoundary moduleName="Methodology" resetKey={productMode}>
          <MethodologyWorkspace />
        </EnterpriseErrorBoundary>
      ) : customOverviewActive ? (
        <OverviewWorkspaceBuilder
          initialEditMode
          onResetToDefault={() => setCustomOverviewActive(false)}
        />
      ) : (
        <StableOverviewWorkspace />
      )}
    </div>
  );
}

function StableOverviewWorkspace() {
  const {
    isMapFocusMode,
    overviewCommandMode,
    overviewLayout,
    selectedParcelId,
    setOverviewLayoutCommandCenter,
    setOverviewLayoutPanel,
  } = useDashboardState();
  const [layerRailWidth, setLayerRailWidth] = useState(
    LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
  );
  const [lastExpandedLayerRailWidth, setLastExpandedLayerRailWidth] = useState(
    LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
  );
  const [draggingLayerRail, setDraggingLayerRail] = useState(false);
  const commandCenterHidden = overviewLayout.commandCenter === "hidden";
  const leftPanelHidden = overviewLayout.leftPanel === "hidden";
  const leftPanelCollapsed = overviewLayout.leftPanel === "collapsed";
  const rightPanelHidden = overviewLayout.rightPanel === "hidden";
  const rightPanelWidth = RIGHT_PANEL_WIDTHS[overviewLayout.rightPanelWidth];

  useEffect(() => {
    if (!draggingLayerRail) {
      const frameId = window.requestAnimationFrame(() => {
        const nextWidth = clampLeftPanelWidth(
          LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
        );

        setLayerRailWidth(nextWidth);
        setLastExpandedLayerRailWidth(nextWidth);
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [draggingLayerRail, overviewLayout.leftPanelWidth]);

  function requestMapResize() {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function toggleLayerRailCollapsed() {
    if (leftPanelCollapsed) {
      const nextWidth = clampLeftPanelWidth(lastExpandedLayerRailWidth);

      setLayerRailWidth(nextWidth);
      setLastExpandedLayerRailWidth(nextWidth);
      setOverviewLayoutPanel("left", "visible");
      requestMapResize();
      return;
    }

    setLastExpandedLayerRailWidth(clampLeftPanelWidth(layerRailWidth));
    setOverviewLayoutPanel("left", "collapsed");
    requestMapResize();
  }

  function handleLayerRailResizeStart(event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingLayerRail(true);
    setOverviewLayoutPanel("left", "visible");
    document.body.classList.add("cfs-resizing");

    const startX = event.clientX;
    const startWidth = clampLeftPanelWidth(
      leftPanelCollapsed ? lastExpandedLayerRailWidth : layerRailWidth,
    );
    let latestWidth = startWidth;
    let latestCollapsed = false;

    setLayerRailWidth(startWidth);
    setLastExpandedLayerRailWidth(startWidth);

    function handlePointerMove(moveEvent: PointerEvent) {
      const rawWidth = startWidth + moveEvent.clientX - startX;

      if (rawWidth <= LEFT_PANEL_COLLAPSE_THRESHOLD) {
        latestCollapsed = true;
        setOverviewLayoutPanel("left", "collapsed");
        window.dispatchEvent(new Event("resize"));
        return;
      }

      if (latestCollapsed) {
        setOverviewLayoutPanel("left", "visible");
      }

      latestCollapsed = false;
      latestWidth = clampLeftPanelWidth(rawWidth);
      setLayerRailWidth(latestWidth);
      setLastExpandedLayerRailWidth(latestWidth);
      window.dispatchEvent(new Event("resize"));
    }

    function handlePointerUp() {
      setDraggingLayerRail(false);
      document.body.classList.remove("cfs-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (latestCollapsed) {
        setOverviewLayoutPanel("left", "collapsed");
      } else {
        setLayerRailWidth(latestWidth);
        setLastExpandedLayerRailWidth(latestWidth);
        setOverviewLayoutPanel("left", "visible");
      }

      requestMapResize();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <main
      className={cn(
        "relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:p-4",
        isMapFocusMode && "p-0 lg:p-0",
      )}
    >
      {!isMapFocusMode && !commandCenterHidden ? (
        <EnterpriseErrorBoundary moduleName="Command Center">
          <OverviewCommandCenter />
        </EnterpriseErrorBoundary>
      ) : null}

      <div
        className={cn(
          "relative flex min-h-0 flex-1 gap-3 overflow-hidden",
          isMapFocusMode &&
            "fixed inset-3 top-[4.75rem] z-50 rounded-xl bg-[#050911]/95 p-0",
        )}
      >
        {!isMapFocusMode && !leftPanelHidden ? (
          <div
            className="flex h-full min-h-0 shrink-0 transition-[width] duration-150 ease-out"
            style={{
              width: leftPanelCollapsed
                ? LEFT_PANEL_COLLAPSED_WIDTH
                : layerRailWidth,
            }}
          >
            <Sidebar
              collapsed={leftPanelCollapsed}
              dragging={draggingLayerRail}
              onResizeStart={handleLayerRailResizeStart}
              onToggleCollapsed={toggleLayerRailCollapsed}
              overviewCommandMode={overviewCommandMode}
            />
          </div>
        ) : null}

        <section className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-[#050911] shadow-[0_18px_54px_rgba(0,0,0,0.34)]">
          <EnterpriseErrorBoundary
            moduleName="3D SceneView"
            resetKey={selectedParcelId}
          >
            <SceneViewContainer />
          </EnterpriseErrorBoundary>
        </section>

        {!isMapFocusMode && !rightPanelHidden ? (
          <aside
            className="flex h-full min-h-0 shrink-0 overflow-visible"
            style={{ width: rightPanelWidth }}
          >
            <EnterpriseErrorBoundary
              moduleName="Intelligence Panel"
              resetKey={`overview-stable-${selectedParcelId ?? "none"}`}
            >
              <IntelligencePanel />
            </EnterpriseErrorBoundary>
          </aside>
        ) : null}
      </div>

      {!isMapFocusMode ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex flex-wrap justify-end gap-2">
          {leftPanelHidden ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutPanel("left", "collapsed")}
              type="button"
            >
              Show Layers
            </button>
          ) : null}
          {rightPanelHidden ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutPanel("right", "visible")}
              type="button"
            >
              Show Intelligence
            </button>
          ) : null}
          {commandCenterHidden ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutCommandCenter("visible")}
              type="button"
            >
              Show Command Center
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
