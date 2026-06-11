"use client";

import {
  BrainCircuit,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { DataRegistryPanel } from "@/components/dashboard/DataRegistryPanel";
import { GISIntegrationReadinessPanel } from "@/components/dashboard/GISIntegrationReadinessPanel";
import { LayerToggle } from "@/components/dashboard/LayerToggle";
import { ScenarioControls } from "@/components/dashboard/ScenarioControls";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { scoreSignals } from "@/data/mock/dashboardMockData";
import { useDashboardState } from "@/hooks/useDashboardState";

export function Sidebar() {
  const { selectedParcel } = useDashboardState();

  return (
    <aside
      aria-label="Explore and map layer control panel"
      className="app-chrome glass-panel no-scrollbar order-2 min-h-0 overflow-auto rounded-lg p-3 md:max-h-[72vh] lg:order-1 lg:max-h-none"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Explore
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-6 text-white">
            Map Layers
          </h2>
        </div>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-3">
        <LayerToggle />

        <details className="group rounded-lg border border-white/10 bg-black/20 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-white">
                Planning tools
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Scenario and data-readiness controls
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
            <ScenarioControls />
            <GISIntegrationReadinessPanel />
            <DataRegistryPanel />
          </div>
        </details>

        <details className="group rounded-lg border border-white/10 bg-black/20 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-white">
                Composite signals
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Legacy mock scoring context
              </span>
            </span>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-[#68d8ff]" />
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </div>
          </summary>

          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <ScoreCard
              accent="#d8b86a"
              caption="Weighted mock score across parcel potential, development pressure, and infrastructure fit."
              label="Opportunity Score"
              score={selectedParcel?.opportunityScore ?? 0}
            />

            <div className="grid grid-cols-2 gap-2">
              {scoreSignals.map((signal) => (
                <div
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                  key={signal.label}
                >
                  <p className="text-[11px] text-slate-500">{signal.label}</p>
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
          </div>
        </details>
      </div>
    </aside>
  );
}
