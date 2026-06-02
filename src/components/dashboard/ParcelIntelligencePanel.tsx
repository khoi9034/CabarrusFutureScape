"use client";

import { CheckCircle2, DatabaseZap, ShieldAlert } from "lucide-react";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
  type IntelligenceMetricTone,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useParcelDashboardMetrics } from "@/hooks/useParcelDashboardMetrics";
import { cn } from "@/lib/utils";

const toneStyles: Record<IntelligenceMetricTone, string> = {
  critical: "border-rose-300/20 bg-rose-300/[0.055] text-rose-100",
  neutral: "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
  positive: "border-emerald-300/20 bg-emerald-300/[0.055] text-emerald-100",
  review: "border-amber-300/20 bg-amber-300/[0.055] text-amber-100",
  watch: "border-[#f0cd79]/25 bg-[#f0cd79]/[0.055] text-[#f0cd79]",
};

export function ParcelIntelligencePanel() {
  const {
    coreMetrics,
    errorMessage,
    isLoading,
    source,
    summary: parcelIntelligenceSummary,
  } = useParcelDashboardMetrics();

  const summaryItems = [
    {
      label: "Zoning coverage",
      value: `${formatIntelligenceCount(
        parcelIntelligenceSummary.assignedParcels,
      )} parcels assigned`,
      detail: formatIntelligencePercentage(
        parcelIntelligenceSummary.zoningCoveragePercentage,
      ),
    },
    {
      label: "Dashboard ready",
      value: `${formatIntelligenceCount(
        parcelIntelligenceSummary.safeForDashboardParcels,
      )} safe parcels`,
      detail: formatIntelligencePercentage(
        (parcelIntelligenceSummary.safeForDashboardParcels /
          parcelIntelligenceSummary.totalParcels) *
          100,
      ),
    },
    {
      label: "Governance review",
      value: `${formatIntelligenceCount(
        parcelIntelligenceSummary.reviewParcels,
      )} parcels flagged`,
      detail: formatIntelligencePercentage(
        (parcelIntelligenceSummary.reviewParcels /
          parcelIntelligenceSummary.totalParcels) *
          100,
      ),
    },
    {
      label: "Unmatched",
      value: `${formatIntelligenceCount(
        parcelIntelligenceSummary.noMatchParcels,
      )} parcels remain`,
      detail: formatIntelligencePercentage(
        (parcelIntelligenceSummary.noMatchParcels /
          parcelIntelligenceSummary.totalParcels) *
          100,
      ),
    },
  ];
  const sourceLabel =
    source === "api"
      ? "FastAPI"
      : source === "fallback"
        ? "Static fallback"
        : source === "loading"
          ? "Loading API"
          : "Static";
  const sourceDescription =
    source === "api"
      ? "Metrics are loaded from GET /parcels/statistics. Static generated artifacts remain available as the fallback."
      : source === "fallback"
        ? "FastAPI metrics are unavailable, so the dashboard is showing generated static artifacts."
        : source === "loading"
          ? "Checking FastAPI parcel statistics; generated static metrics remain visible while the request completes."
          : "Metrics are static artifacts generated from PostGIS QA outputs, not a live frontend database connection.";

  return (
    <section
      aria-label="Parcel intelligence core metrics"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Phase 2 Parcel Intelligence
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Core Metrics
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
              source === "api"
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
                : source === "fallback"
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                  : "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
            )}
          >
            {sourceLabel}
          </span>
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]"
          >
            <DatabaseZap className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {coreMetrics.map((metric) => (
          <article
            className="rounded-md border border-white/10 bg-white/[0.035] p-3"
            key={metric.id}
            title={metric.description}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-medium uppercase leading-4 text-slate-500">
                {metric.label}
              </p>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                  toneStyles[metric.tone],
                )}
              >
                {formatIntelligencePercentage(metric.percentage)}
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold text-white">
              {formatIntelligenceCount(metric.value)}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  background: metric.accent,
                  width: `${Math.min(Math.max(metric.percentage, 0), 100)}%`,
                }}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#f0cd79]" />
          <h4 className="text-sm font-semibold text-[#f0cd79]">
            Intelligence Summary
          </h4>
        </div>
        <div className="mt-3 grid gap-2">
          {summaryItems.map((item) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2"
              key={item.label}
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-white">
                  {item.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                  {item.value}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[#f0cd79]">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-400">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />
          {sourceDescription}
        </p>
        {errorMessage ? (
          <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
            {errorMessage}
          </p>
        ) : null}
        {isLoading ? (
          <p className="mt-2 text-[11px] uppercase text-slate-500">
            Preserving static values during API handoff
          </p>
        ) : null}
      </div>
    </section>
  );
}
