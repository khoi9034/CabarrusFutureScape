"use client";

import { useEffect } from "react";
import { DashboardUrlSync } from "@/components/dashboard/DashboardUrlSync";
import { ExecutivePrintView } from "@/components/dashboard/ExecutivePrintView";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { MetricsBar } from "@/components/layout/MetricsBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { DashboardProvider, useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";

export function AppShell() {
  return (
    <DashboardProvider>
      <DashboardUrlSync />
      <ProductShell />
    </DashboardProvider>
  );
}

function ProductShell() {
  const { isMapFocusMode, productMode, setMapFocusMode } = useDashboardState();
  const executivePrintMode = productMode === "executive_print";
  const showLayerRail = productMode === "overview" || isMapFocusMode;
  const showIntelligencePanel = !isMapFocusMode;

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

      {executivePrintMode ? (
        <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
          <ExecutivePrintView />
        </main>
      ) : (
        <div
          className={cn(
            "relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 transition-[grid-template-columns] duration-200 md:grid-cols-2 lg:p-3",
            isMapFocusMode
              ? "lg:grid-cols-[286px_minmax(0,1fr)] xl:grid-cols-[304px_minmax(0,1fr)]"
              : productMode === "overview"
                ? "lg:grid-cols-[286px_minmax(0,1fr)_338px] xl:grid-cols-[304px_minmax(0,1fr)_356px]"
                : "lg:grid-cols-[minmax(0,1fr)_386px] xl:grid-cols-[minmax(0,1fr)_412px]",
          )}
        >
          {showLayerRail ? <Sidebar /> : null}
          <main
            className={cn(
              "order-1 min-h-[58vh] md:col-span-2 md:min-h-[62vh] lg:col-span-1 lg:min-h-0",
              showLayerRail ? "lg:order-2" : "lg:order-1",
              isMapFocusMode && "min-h-[calc(100vh-7.25rem)] md:min-h-[calc(100vh-7.25rem)]",
            )}
          >
            <SceneViewContainer />
          </main>
          {showIntelligencePanel ? <IntelligencePanel /> : null}
        </div>
      )}

      {!executivePrintMode && !isMapFocusMode ? (
        <div className="app-chrome">
          <MetricsBar />
        </div>
      ) : null}
    </div>
  );
}
