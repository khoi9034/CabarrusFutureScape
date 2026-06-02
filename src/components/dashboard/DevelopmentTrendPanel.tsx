"use client";

import { BarChart3 } from "lucide-react";
import {
  formatDevelopmentCompact,
  formatDevelopmentCount,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDevelopmentTrends } from "@/hooks/useDevelopmentTrends";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function DevelopmentTrendPanel() {
  const { annualTrend, errorMessage, isLoading, monthlyTrend, source } =
    useDevelopmentTrends();
  const recentAnnualTrend = annualTrend.slice(-8);
  const peakAnnualPermitCount = Math.max(
    ...recentAnnualTrend.map((record) => record.permit_count),
    1,
  );
  const recentMonthlyTrend = monthlyTrend.slice(-6);
  const sourceDescription =
    source === "api"
      ? "Trend records are loaded from GET /development/trends."
      : source === "fallback"
        ? "FastAPI development trends are unavailable, so this panel is using generated static trend artifacts."
        : source === "loading"
          ? "Checking FastAPI development trends; static trend records remain visible while the request completes."
          : "Trend records use generated static development activity outputs.";

  return (
    <section
      aria-label="Development activity annual and monthly trend readiness"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Trend Readiness
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Permit Timeline
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
          <BarChart3 className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {recentAnnualTrend.length > 0 ? (
        <div className="mt-4 space-y-2">
          {recentAnnualTrend.map((record) => {
            const width = (record.permit_count / peakAnnualPermitCount) * 100;
            return (
              <article
                className="rounded-md border border-white/10 bg-white/[0.035] p-3"
                key={record.activity_year ?? "unknown-year"}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">
                    {record.activity_year ?? "Unknown"}
                  </span>
                  <span className="text-xs font-semibold text-[#f0cd79]">
                    {formatDevelopmentCount(record.permit_count)} permits
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#68d8ff]"
                    style={{ width: `${Math.min(Math.max(width, 0), 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span>
                    {formatDevelopmentCount(record.active_parcel_count)} parcels
                  </span>
                  <span>
                    ${formatDevelopmentCompact(record.source_permit_amount_total)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Annual development trend records are not available.
        </p>
      )}

      <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">
            Recent Monthly Signal
          </h4>
          <span className="text-[11px] uppercase text-slate-500">
            {source === "api" ? "API preview" : "Static preview"}
          </span>
        </div>
        {recentMonthlyTrend.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {recentMonthlyTrend.map((record) => (
              <div
                className="rounded-md border border-white/10 bg-black/20 px-2 py-2 text-center"
                key={`${record.activity_year}-${record.activity_month}`}
              >
                <p className="text-[10px] uppercase text-slate-500">
                  {record.activity_year}/{record.activity_month}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatDevelopmentCount(record.permit_count)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Monthly trend records are not available.
          </p>
        )}
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
          Preserving static trend records during API handoff
        </p>
      ) : null}
    </section>
  );
}
