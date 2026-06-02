"use client";

import { ShieldCheck } from "lucide-react";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
  type IntelligenceMetricTone,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useParcelQualityMetrics } from "@/hooks/useParcelQualityMetrics";
import { cn } from "@/lib/utils";

const qualityToneStyles: Record<IntelligenceMetricTone, string> = {
  critical: "border-rose-300/25 bg-rose-300/[0.06] text-rose-100",
  neutral: "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
  positive: "border-emerald-300/20 bg-emerald-300/[0.055] text-emerald-100",
  review: "border-amber-300/20 bg-amber-300/[0.055] text-amber-100",
  watch: "border-[#f0cd79]/25 bg-[#f0cd79]/[0.055] text-[#f0cd79]",
};

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function ParcelQualityPanel() {
  const { errorMessage, isLoading, metrics, source } = useParcelQualityMetrics();
  const sourceDescription =
    source === "api"
      ? "Parcel quality status is loaded from GET /parcels/statistics."
      : source === "fallback"
        ? "FastAPI parcel statistics are unavailable, so this panel is using generated static parcel quality artifacts."
        : source === "loading"
          ? "Checking FastAPI parcel statistics; static quality metrics remain visible while the request completes."
          : "Parcel quality uses generated static parcel enrichment outputs.";

  return (
    <section
      aria-label="Parcel quality status metrics"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Parcel Quality
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Enriched Layer Health
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
            {sourceLabels[source]}
          </span>
          <ShieldCheck className="h-4 w-4 text-[#55d38f]" />
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {metrics.map((quality) => (
          <article
            className={cn("rounded-md border p-3", qualityToneStyles[quality.tone])}
            key={quality.id}
            title={quality.description}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold">{quality.label}</h4>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {quality.description}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-white">
                  {formatIntelligenceCount(quality.count)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatIntelligencePercentage(quality.percentage)}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-black/30">
              <div
                className="h-full rounded-full"
                style={{
                  background: quality.accent,
                  width: `${Math.min(Math.max(quality.percentage, 0), 100)}%`,
                }}
              />
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving static quality metrics during API handoff
        </p>
      ) : null}
    </section>
  );
}
