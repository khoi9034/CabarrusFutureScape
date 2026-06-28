"use client";

import { Clock3, SlidersHorizontal } from "lucide-react";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
} from "@/data/intelligence/developmentActivityMetrics";
import { developmentTemporalIndex } from "@/data/intelligence/developmentTemporalIndex";
import type { TemporalAnalysisState } from "@/hooks/useTemporalAnalysisState";
import { useTemporalQuery } from "@/hooks/useTemporalQuery";
import { TemporalFilterControls } from "@/components/dashboard/TemporalFilterControls";
import { TemporalQueryPreview } from "@/components/dashboard/TemporalQueryPreview";
import { TemporalTrendSummary } from "@/components/dashboard/TemporalTrendSummary";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

interface TemporalAnalysisPanelProps {
  temporalState: TemporalAnalysisState;
}

export function TemporalAnalysisPanel({
  temporalState,
}: TemporalAnalysisPanelProps) {
  const temporalQuery = useTemporalQuery(temporalState.temporalFilters);
  const artifactsAvailable =
    developmentTemporalIndex.availableYears.length > 0 &&
    developmentTemporalIndex.permitTotalsByYear.length > 0;

  if (!artifactsAvailable) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-medium uppercase text-slate-500">
          Temporal Analysis
        </p>
        <p className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Development activity temporal artifacts are not available. Regenerate
          Phase 3 analytics outputs before enabling time-slice exploration.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Development activity temporal analysis framework"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Temporal Analysis
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Time-Slice Intelligence
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
              temporalQuery.source === "api"
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
                : temporalQuery.source === "fallback"
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                  : "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
            )}
          >
            {sourceLabels[temporalQuery.source]}
          </span>
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#68d8ff]"
          >
            <Clock3 className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[10px] uppercase text-slate-500">Years</p>
          <p className="mt-1 text-base font-semibold text-white">
            {formatDevelopmentCount(developmentTemporalIndex.availableYears.length)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[10px] uppercase text-slate-500">Recent Months</p>
          <p className="mt-1 text-base font-semibold text-white">
            {formatDevelopmentCount(
              developmentTemporalIndex.availableMonths.length,
            )}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[10px] uppercase text-slate-500">Anchor</p>
          <p className="mt-1 break-words text-sm font-semibold text-white">
            {formatDevelopmentDate(developmentTemporalIndex.activityAnchorDate)}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <TemporalFilterControls temporalState={temporalState} />
        <TemporalTrendSummary
          temporalQuery={temporalQuery}
          temporalState={temporalState}
        />
        <TemporalQueryPreview
          temporalQuery={temporalQuery}
          temporalState={temporalState}
        />
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-400">
        <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f0cd79]" />
        {temporalQuery.source === "api"
          ? "Temporal counts are loaded from GET /development/temporal-query."
          : temporalQuery.source === "fallback"
            ? "The temporal API is unavailable, so this panel is using generated static temporal artifacts."
            : temporalQuery.source === "loading"
              ? "Checking FastAPI temporal analysis; generated static temporal data remains visible while the request completes."
              : "Static time-slice controls prepare future permit queries and playback."}{" "}
        MapView playback and map filtering remain disconnected.
      </p>
      {temporalQuery.errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {temporalQuery.errorMessage}
        </p>
      ) : null}
      {temporalQuery.isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving static temporal counts during API handoff
        </p>
      ) : null}
    </section>
  );
}
