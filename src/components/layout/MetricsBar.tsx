"use client";

import {
  Building2,
  ShieldAlert,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { formatDevelopmentCount } from "@/data/intelligence/developmentActivityMetrics";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useParcelDashboardMetrics } from "@/hooks/useParcelDashboardMetrics";
import { cn } from "@/lib/utils";

interface CompactMetric {
  accent: string;
  context: string;
  icon: LucideIcon;
  id: string;
  label: string;
  tone: "gold" | "green" | "blue" | "red";
  value: string;
}

const toneStyles = {
  blue: "border-[#68d8ff]/18 bg-[#68d8ff]/[0.055]",
  gold: "border-[#d8b86a]/20 bg-[#d8b86a]/[0.06]",
  green: "border-[#55d38f]/18 bg-[#55d38f]/[0.055]",
  red: "border-[#ff8d7a]/18 bg-[#ff8d7a]/[0.055]",
};

export function MetricsBar() {
  const parcelMetrics = useParcelDashboardMetrics();
  const developmentStatistics = useDevelopmentStatistics();
  const floodSummary = useFloodConstraintSummary();
  const totalPermits =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "total-permits",
    )?.value ?? formatDevelopmentCount(0);
  const parcelsWithActivity =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "parcels-with-activity",
    )?.value ?? formatDevelopmentCount(0);
  const floodReviewParcels =
    floodSummary.metrics.find(
      (metric) => metric.id === "review-required-parcels",
    )?.value ?? null;
  const floodReviewCount = floodReviewParcels
    ? parseFormattedCount(floodReviewParcels)
    : null;
  const floodReviewPercent =
    floodReviewCount !== null && floodSummary.totalParcels > 0
      ? formatIntelligencePercentage(
          (floodReviewCount / floodSummary.totalParcels) * 100,
        )
      : "FEMA review";

  const metrics: CompactMetric[] = [
    {
      accent: "#d8b86a",
      context: "Permit records",
      icon: TrendingUp,
      id: "growth-activity",
      label: "Growth Activity",
      tone: "gold",
      value: totalPermits,
    },
    {
      accent: "#ff8d7a",
      context: floodReviewPercent,
      icon: ShieldAlert,
      id: "flood-review",
      label: "Flood Review",
      tone: "red",
      value: floodReviewParcels ?? (floodSummary.isLoading ? "Loading" : "Pending"),
    },
    {
      accent: "#55d38f",
      context: "Parcels active",
      icon: Wrench,
      id: "development-activity",
      label: "Development Activity",
      tone: "green",
      value: parcelsWithActivity,
    },
    {
      accent: "#68d8ff",
      context: `${formatIntelligencePercentage(
        parcelMetrics.summary.zoningCoveragePercentage,
      )} zoned`,
      icon: Building2,
      id: "total-parcels",
      label: "Total Parcels",
      tone: "blue",
      value: formatIntelligenceCount(parcelMetrics.summary.totalParcels),
    },
  ];

  return (
    <footer className="glass-panel z-20 mx-3 mb-3 rounded-lg px-2.5 py-1.5 lg:mx-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <CompactMetricCell metric={metric} key={metric.id} />
        ))}
      </div>
    </footer>
  );
}

function CompactMetricCell({ metric }: { metric: CompactMetric }) {
  const Icon = metric.icon;

  return (
    <article
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5",
        toneStyles[metric.tone],
      )}
      title={`${metric.label}: ${metric.value}, ${metric.context}`}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20">
        <Icon className="h-3.5 w-3.5" style={{ color: metric.accent }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase text-slate-500">
          {metric.label}
        </p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-semibold leading-5 text-white">
            {metric.value}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {metric.context}
          </p>
        </div>
      </div>
    </article>
  );
}

function parseFormattedCount(value: string) {
  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}
