import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  formatDevelopmentCount,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { developmentTemporalIndex } from "@/data/intelligence/developmentTemporalIndex";
import type { TemporalAnalysisState } from "@/hooks/useTemporalAnalysisState";
import type { TemporalQueryViewModel } from "@/lib/adapters/temporalQueryAdapter";
import { cn } from "@/lib/utils";

interface TemporalTrendSummaryProps {
  temporalQuery: TemporalQueryViewModel;
  temporalState: TemporalAnalysisState;
}

const trendIcon = {
  down: ArrowDownRight,
  flat: ArrowRight,
  up: ArrowUpRight,
} as const;

const trendTone = {
  down: "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
  flat: "border-white/10 bg-white/[0.035] text-slate-200",
  up: "border-[#f0cd79]/25 bg-[#f0cd79]/[0.055] text-[#f0cd79]",
} as const;

function selectedContextLabel(
  temporalState: TemporalAnalysisState,
  temporalQuery: TemporalQueryViewModel,
) {
  if (temporalQuery.source === "api" || temporalQuery.source === "fallback") {
    return temporalQuery.temporalContextLabel;
  }

  if (temporalState.selectedYear && temporalState.selectedMonth) {
    return `${temporalState.selectedYear}-${String(
      temporalState.selectedMonth,
    ).padStart(2, "0")}`;
  }

  if (temporalState.selectedYear) {
    return `${temporalState.selectedYear}`;
  }

  if (
    temporalState.selectedDateRange.start ||
    temporalState.selectedDateRange.end
  ) {
    return `${temporalState.selectedDateRange.start ?? developmentTemporalIndex.minDate} to ${
      temporalState.selectedDateRange.end ?? developmentTemporalIndex.maxDate
    }`;
  }

  return `${developmentTemporalIndex.minDate} to ${developmentTemporalIndex.maxDate}`;
}

export function TemporalTrendSummary({
  temporalQuery,
  temporalState,
}: TemporalTrendSummaryProps) {
  const trendSummary = temporalQuery.trendSummary;
  const TrendIcon = trendIcon[trendSummary.trendDirection];

  return (
    <section
      aria-label="Temporal development activity summary"
      className="rounded-md border border-white/10 bg-white/[0.035] p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase text-slate-500">
            Selected Time Context
          </p>
          <h4 className="mt-1 text-sm font-semibold text-white">
            {selectedContextLabel(temporalState, temporalQuery)}
          </h4>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold",
            trendTone[trendSummary.trendDirection],
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {trendSummary.trendLabel}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase text-slate-500">
            Latest Year Permits
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            {formatDevelopmentCount(trendSummary.latestYearPermitCount)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase text-slate-500">
            Prior Year Permits
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            {formatDevelopmentCount(trendSummary.previousYearPermitCount)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <span className="block uppercase text-slate-500">
            Active Jurisdictions
          </span>
          <span className="mt-1 block leading-5 text-slate-200">
            {trendSummary.activeZoningJurisdictions.length > 0
              ? trendSummary.activeZoningJurisdictions.join(", ")
              : "All jurisdictions"}
          </span>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <span className="block uppercase text-slate-500">
            Permit Categories
          </span>
          <span className="mt-1 block leading-5 text-slate-200">
            {trendSummary.activePermitCategories.length > 0
              ? trendSummary.activePermitCategories
                  .map(formatDevelopmentLabel)
                  .join(", ")
              : "All categories"}
          </span>
        </div>
      </div>
    </section>
  );
}
