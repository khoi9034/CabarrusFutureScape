"use client";

import { DashboardUrlSync } from "@/components/dashboard/DashboardUrlSync";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { MetricsBar } from "@/components/layout/MetricsBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { DashboardProvider } from "@/hooks/useDashboardState";

export function AppShell() {
  return (
    <DashboardProvider>
      <DashboardUrlSync />
      <div className="metric-grid relative flex min-h-screen flex-col overflow-x-hidden bg-[#060b12] text-slate-100 lg:h-screen lg:overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,11,18,0.14),rgba(6,11,18,0.86))]" />
        <div className="pointer-events-none absolute left-0 right-0 top-[76px] z-10 h-px gold-line opacity-70" />

        <TopNav />

        <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2 lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:p-4 lg:pb-3 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
          <Sidebar />
          <main className="order-1 min-h-[58vh] md:col-span-2 md:min-h-[62vh] lg:order-2 lg:col-span-1 lg:min-h-0">
            <SceneViewContainer />
          </main>
          <IntelligencePanel />
        </div>

        <MetricsBar />
      </div>
    </DashboardProvider>
  );
}
