"use client";

import { SceneViewMap } from "@/components/map/SceneViewMap";
import { BottomAnalyticsBar } from "@/components/shell/BottomAnalyticsBar";
import { IntelligencePanel } from "@/components/shell/IntelligencePanel";
import { LeftPanel } from "@/components/shell/LeftPanel";
import { TopNav } from "@/components/shell/TopNav";
import { DashboardProvider } from "@/state/dashboard-store";

export function AppShell() {
  return (
    <DashboardProvider>
      <div className="metric-grid relative flex min-h-screen flex-col overflow-x-hidden bg-[#060b12] text-slate-100 lg:h-screen lg:overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,11,18,0.14),rgba(6,11,18,0.86))]" />
        <div className="pointer-events-none absolute left-0 right-0 top-[76px] z-10 h-px gold-line opacity-70" />

        <TopNav />

        <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:p-4 lg:pb-3 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
          <LeftPanel />
          <main className="order-1 min-h-[58vh] lg:order-2 lg:min-h-0">
            <SceneViewMap />
          </main>
          <IntelligencePanel />
        </div>

        <BottomAnalyticsBar />
      </div>
    </DashboardProvider>
  );
}
