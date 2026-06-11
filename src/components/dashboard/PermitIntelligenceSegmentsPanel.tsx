"use client";

import { BadgeDollarSign, Hammer, Home, RefreshCcw, Store, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatDevelopmentCount,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { usePermitSegmentStatistics } from "@/hooks/usePermitSegmentStatistics";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Unavailable",
  loading: "Loading API",
  static: "API off",
} as const;

const segmentPriority = [
  "residential_growth",
  "commercial_activity",
  "redevelopment_signal",
  "minor_maintenance",
  "demolition",
];

export function PermitIntelligenceSegmentsPanel() {
  const statistics = usePermitSegmentStatistics();
  const segmentMetrics = segmentPriority.map((segment) => {
    const metric = statistics.permitSegments.find((item) => item.id === segment);

    return {
      id: segment,
      label: formatDevelopmentLabel(segment),
      value: metric?.value ?? 0,
    };
  });
  const activeConstruction =
    statistics.statusStages.find((item) => item.id === "active_construction")
      ?.value ?? 0;
  const highValue =
    statistics.valueClasses.find((item) => item.id === "high_value")?.value ?? 0;
  const majorValue =
    statistics.valueClasses.find((item) => item.id === "major_value")?.value ?? 0;

  return (
    <section
      aria-label="Permit intelligence segments"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Permit Intelligence
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Segment Signals
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
            statistics.source === "api"
              ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
              : statistics.source === "fallback"
                ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                : "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
          )}
        >
          {sourceLabels[statistics.source]}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-400">
        Raw permit count is no longer the only signal. CFS groups permits into
        planning-relevant segments like residential growth, commercial activity,
        redevelopment, and construction status.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SegmentMetric
          icon={<Home className="h-4 w-4 text-[#55d38f]" />}
          label="Residential Growth"
          value={segmentMetrics[0].value}
        />
        <SegmentMetric
          icon={<Store className="h-4 w-4 text-[#68d8ff]" />}
          label="Commercial Activity"
          value={segmentMetrics[1].value}
        />
        <SegmentMetric
          icon={<RefreshCcw className="h-4 w-4 text-[#f0cd79]" />}
          label="Redevelopment"
          value={segmentMetrics[2].value}
        />
        <SegmentMetric
          icon={<Wrench className="h-4 w-4 text-slate-300" />}
          label="Minor Maintenance"
          value={segmentMetrics[3].value}
        />
        <SegmentMetric
          icon={<Hammer className="h-4 w-4 text-[#ffb454]" />}
          label="Active Construction"
          value={activeConstruction}
        />
        <SegmentMetric
          icon={<BadgeDollarSign className="h-4 w-4 text-[#c8a4ff]" />}
          label="High / Major Value"
          value={highValue + majorValue}
        />
      </div>

      {statistics.errorMessage ? (
        <p className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {statistics.errorMessage}
        </p>
      ) : null}
      {statistics.isLoading ? (
        <p className="mt-3 text-[11px] uppercase text-slate-500">
          Loading permit segmentation from FastAPI
        </p>
      ) : null}
    </section>
  );
}

function SegmentMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      {icon}
      <p className="mt-2 text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">
        {formatDevelopmentCount(value)}
      </p>
    </article>
  );
}
