"use client";

import { Activity, DatabaseZap, ShieldAlert } from "lucide-react";
import {
  formatDevelopmentCount,
  formatDevelopmentPercent,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDevelopmentActivitySummary } from "@/hooks/useDevelopmentActivitySummary";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { cn } from "@/lib/utils";

const toneStyles = {
  critical: "border-rose-300/20 bg-rose-300/[0.055] text-rose-100",
  neutral: "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
  positive: "border-emerald-300/20 bg-emerald-300/[0.055] text-emerald-100",
  review: "border-amber-300/20 bg-amber-300/[0.055] text-amber-100",
  watch: "border-[#f0cd79]/25 bg-[#f0cd79]/[0.055] text-[#f0cd79]",
} as const;

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function DevelopmentActivityPanel() {
  const activitySummary = useDevelopmentActivitySummary();
  const statistics = useDevelopmentStatistics(activitySummary);
  const source =
    statistics.source === "api" || activitySummary.source === "api"
      ? "api"
      : statistics.source === "fallback" || activitySummary.source === "fallback"
        ? "fallback"
        : statistics.source === "loading" || activitySummary.source === "loading"
          ? "loading"
          : "static";
  const errorMessage =
    statistics.errorMessage ?? activitySummary.errorMessage ?? null;
  const sourceDescription =
    source === "api"
      ? "Metrics are loaded from GET /development/statistics and broad rollups from GET /development/activity-summary."
      : source === "fallback"
        ? "One or more FastAPI development endpoints are unavailable, so this panel is using generated static artifacts."
        : source === "loading"
          ? "Checking FastAPI development metrics; generated static values remain visible while requests complete."
          : "Static metrics from generated pipeline artifacts. No live API or direct PostGIS connection is used.";

  return (
    <section
      aria-label="Development activity core metrics"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Phase 3 Development Activity
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Permit Intelligence
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
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#f0cd79]/30 bg-[#f0cd79]/10 text-[#f0cd79]"
          >
            <Activity className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {statistics.coreMetrics.map((metric) => (
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
                  "h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor]",
                  metric.tone === "positive" && "text-emerald-300",
                  metric.tone === "watch" && "text-[#f0cd79]",
                  metric.tone === "neutral" && "text-sky-300",
                  metric.tone === "review" && "text-amber-300",
                  metric.tone === "critical" && "text-rose-300",
                )}
                style={{ background: metric.accent }}
              />
            </div>
            <p className="mt-2 break-words text-lg font-semibold leading-6 text-white">
              {metric.value}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] p-3">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-[#f0cd79]" />
          <h4 className="text-sm font-semibold text-[#f0cd79]">
            Activity Class Distribution
          </h4>
        </div>
        <div className="mt-3 space-y-2">
          {statistics.activityClasses.map((activityClass) => (
            <article
              className={cn(
                "rounded-md border p-3",
                toneStyles[activityClass.tone],
              )}
              key={activityClass.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="text-sm font-semibold">
                    {activityClass.label}
                  </h5>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Avg score {activityClass.score.toFixed(1)} / ambiguous{" "}
                    {formatDevelopmentCount(activityClass.ambiguousCount)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">
                    {formatDevelopmentCount(activityClass.count)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatDevelopmentPercent(activityClass.percentage)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-black/30">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: activityClass.accent,
                    width: `${Math.min(
                      Math.max(activityClass.percentage, 0),
                      100,
                    )}%`,
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-400">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />
        {sourceDescription} Anchor date: {activitySummary.activityDateMax}.
      </p>
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
      {statistics.isLoading || activitySummary.isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving static development metrics during API handoff
        </p>
      ) : null}
    </section>
  );
}
