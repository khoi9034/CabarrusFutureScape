"use client";

import { BrainCircuit, SlidersHorizontal } from "lucide-react";
import { ScoreCard } from "@/components/cards/ScoreCard";
import { LayerToggleGroup } from "@/components/layers/LayerToggleGroup";
import { ScenarioControls } from "@/components/scenarios/ScenarioControls";
import { scoreSignals } from "@/data/mockMetrics";
import { useDashboardState } from "@/state/dashboard-store";

export function LeftPanel() {
  const { selectedParcel } = useDashboardState();

  return (
    <aside className="glass-panel no-scrollbar order-2 min-h-0 overflow-auto rounded-lg p-4 lg:order-1">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Control Plane
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Growth Operations
          </h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-6">
        <LayerToggleGroup />

        <div className="h-px bg-white/10" />

        <ScenarioControls />

        <div className="h-px bg-white/10" />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Scoring System
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Composite Signals
              </h2>
            </div>
            <BrainCircuit className="h-4 w-4 text-[#68d8ff]" />
          </div>

          <ScoreCard
            accent="#d8b86a"
            caption="Weighted mock score across parcel potential, development pressure, and infrastructure fit."
            label="Opportunity Score"
            score={selectedParcel.opportunityScore}
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
        </section>
      </div>
    </aside>
  );
}
