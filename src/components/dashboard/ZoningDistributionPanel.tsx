"use client";

import { MapPinned } from "lucide-react";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useParcelZoningSummaryMetrics } from "@/hooks/useParcelZoningSummaryMetrics";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function ZoningDistributionPanel() {
  const { errorMessage, isLoading, metrics, source } =
    useParcelZoningSummaryMetrics();
  const sourceDescription =
    source === "api"
      ? "Jurisdiction coverage is loaded from GET /parcels/zoning-summary."
      : source === "fallback"
        ? "FastAPI zoning summary is unavailable, so this panel is using generated static artifacts."
        : source === "loading"
          ? "Checking FastAPI zoning summary; static distribution remains visible while the request completes."
          : "Jurisdiction coverage uses generated static parcel zoning outputs.";

  return (
    <section
      aria-label="Zoning jurisdiction parcel distribution"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Zoning Distribution
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Jurisdiction Coverage
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
          <MapPinned className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="mt-4 space-y-3">
          {metrics.map((jurisdiction) => (
            <article
              className="rounded-md border border-white/10 bg-white/[0.035] p-3"
              key={jurisdiction.id}
              title={`${jurisdiction.label}: ${formatIntelligenceCount(
                jurisdiction.parcelCount,
              )} parcels`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white">
                    {jurisdiction.label}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {formatIntelligenceCount(jurisdiction.safeCount)} safe /{" "}
                    {formatIntelligenceCount(jurisdiction.reviewCount)} review
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">
                    {formatIntelligenceCount(jurisdiction.parcelCount)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatIntelligencePercentage(
                      jurisdiction.percentageOfTotal,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: jurisdiction.accent,
                    width: `${Math.min(
                      Math.max(jurisdiction.percentageOfTotal, 0),
                      100,
                    )}%`,
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          No zoning jurisdiction metrics are available in the generated parcel
          intelligence artifacts.
        </p>
      )}

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
          Preserving static distribution during API handoff
        </p>
      ) : null}
    </section>
  );
}
