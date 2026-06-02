"use client";

import { Activity } from "lucide-react";
import {
  timeHorizonRange,
  timeHorizonTicks,
} from "@/data/mock/dashboardMockData";

interface TimeSliderPanelProps {
  simulationYear: number;
  onSimulationYearChange: (year: number) => void;
}

export function TimeSliderPanel({
  simulationYear,
  onSimulationYearChange,
}: TimeSliderPanelProps) {
  return (
    <div className="min-w-full rounded-lg border border-white/10 bg-black/20 p-4 xl:min-w-[360px]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Time Slider
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">
            Forecast Horizon
          </h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <Activity className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          {timeHorizonTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <input
          aria-label="Bottom forecast horizon year"
          className="mt-3 h-1.5 w-full accent-[#d8b86a]"
          max={timeHorizonRange.max}
          min={timeHorizonRange.min}
          onChange={(event) =>
            onSimulationYearChange(Number(event.target.value))
          }
          step={timeHorizonRange.step}
          type="range"
          value={simulationYear}
        />
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">Active forecast year</span>
          <span className="font-mono text-[#f0cd79]">{simulationYear}</span>
        </div>
      </div>
    </div>
  );
}
