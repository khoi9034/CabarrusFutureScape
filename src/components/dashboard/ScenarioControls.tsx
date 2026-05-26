"use client";

import { Gauge, GitBranch, TimerReset } from "lucide-react";
import {
  scenarioPresets,
  timeHorizonRange,
} from "@/data/mock/dashboardMockData";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";

export function ScenarioControls() {
  const {
    scenarioId,
    simulationIntensity,
    simulationYear,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
  } = useDashboardState();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Scenario Engine
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Growth Simulation
          </h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#68d8ff]">
          <GitBranch className="h-4 w-4" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {scenarioPresets.map((scenario) => {
          const active = scenario.id === scenarioId;

          return (
            <button
              className={cn(
                "rounded-lg border p-3 text-left transition",
                active
                  ? "border-[#d8b86a]/40 bg-[#d8b86a]/[0.12] text-white shadow-[0_0_22px_rgba(216,184,106,0.12)]"
                  : "border-white/10 bg-black/10 text-slate-400 hover:border-white/20 hover:text-slate-100",
              )}
              key={scenario.id}
              onClick={() => setScenarioId(scenario.id)}
              type="button"
            >
              <span className="block text-sm font-semibold">
                {scenario.label}
              </span>
              <span className="mt-1 block text-[11px] leading-4">
                {scenario.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 rounded-lg border border-white/10 bg-black/20 p-4">
        <label className="block">
          <span className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <TimerReset className="h-3.5 w-3.5 text-[#d8b86a]" />
              Time Horizon
            </span>
            <span className="font-mono text-slate-200">{simulationYear}</span>
          </span>
          <input
            className="h-1.5 w-full accent-[#d8b86a]"
            max={timeHorizonRange.max}
            min={timeHorizonRange.min}
            onChange={(event) => setSimulationYear(Number(event.target.value))}
            step={timeHorizonRange.step}
            type="range"
            value={simulationYear}
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-[#68d8ff]" />
              Simulation Intensity
            </span>
            <span className="font-mono text-slate-200">
              {simulationIntensity}
            </span>
          </span>
          <input
            className="h-1.5 w-full accent-[#68d8ff]"
            max="100"
            min="0"
            onChange={(event) =>
              setSimulationIntensity(Number(event.target.value))
            }
            step="1"
            type="range"
            value={simulationIntensity}
          />
        </label>
      </div>
    </section>
  );
}
