"use client";

import { AlertTriangle } from "lucide-react";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useParcelGovernanceWarningsMetrics } from "@/hooks/useParcelGovernanceWarningsMetrics";
import { cn } from "@/lib/utils";

const warningToneStyles = {
  critical: "border-rose-300/25 bg-rose-300/[0.065] text-rose-100",
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

export function GovernanceWarningsPanel() {
  const { errorMessage, isLoading, metrics, source } =
    useParcelGovernanceWarningsMetrics();
  const sourceDescription =
    source === "api"
      ? "Warning categories are loaded from GET /parcels/governance-warnings."
      : source === "fallback"
        ? "FastAPI governance warnings are unavailable, so this panel is using generated static QA artifacts."
        : source === "loading"
          ? "Checking FastAPI governance warnings; static QA metrics remain visible while the request completes."
          : "Warning categories use generated static parcel zoning QA outputs.";

  return (
    <section
      aria-label="Parcel zoning governance warning metrics"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Governance Warnings
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Zoning QA Review
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
          <AlertTriangle className="h-4 w-4 text-amber-200" />
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="mt-4 space-y-2">
          {metrics.map((warning) => (
            <article
              className={cn(
                "rounded-md border p-3",
                warningToneStyles[warning.tone],
              )}
              key={warning.id}
              title={warning.description}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{warning.label}</h4>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300/80">
                    {warning.description}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">
                    {formatIntelligenceCount(warning.count)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatIntelligencePercentage(warning.percentage)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-black/30">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: warning.accent,
                    width: `${Math.min(
                      Math.max(warning.percentage, 0),
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
          No governance warning metrics are available in the generated QA
          artifact.
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
          Preserving static warning metrics during API handoff
        </p>
      ) : null}
    </section>
  );
}
