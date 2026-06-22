"use client";

import { GraduationCap } from "lucide-react";
import { useSchoolConstraintSummary } from "@/hooks/useSchoolConstraintSummary";
import type { SchoolConstraintSummarySource } from "@/lib/adapters/schoolConstraintSummaryAdapter";
import { cn } from "@/lib/utils";

const sourceLabels: Record<SchoolConstraintSummarySource, string> = {
  api: "FastAPI",
  demo: "Demo Extract",
  loading: "Loading API",
  unavailable: "Unavailable",
};

export function SchoolConstraintSummaryPanel() {
  const {
    capacityStatusLabel,
    confidenceDistribution,
    errorMessage,
    isLoading,
    knownReviewZones,
    metrics,
    presentationSeedCountLabel,
    source,
    unmatchedPresentationSeedRows,
    utilizationClassDistribution,
  } = useSchoolConstraintSummary();
  const sourceDescription =
    source === "api"
      ? "School constraints are loaded from the read-only attendance-zone assignment APIs."
      : source === "demo"
        ? "School Capacity Watch uses the cached portfolio demo extract."
      : source === "loading"
        ? "Checking FastAPI school assignment summary and QA readiness."
        : "School assignment summary is unavailable. No capacity or enrollment values are fabricated.";

  return (
    <section
      aria-label="School constraint summary"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Constraints
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            School Assignment Summary
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
              source === "api"
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
                : source === "demo"
                  ? "border-sky-300/25 bg-sky-300/[0.08] text-sky-100"
                : source === "unavailable"
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300",
            )}
          >
            {sourceLabels[source]}
          </span>
          <GraduationCap className="h-4 w-4 text-[#8fe7ff]" />
        </div>
      </div>

      {metrics.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {metrics.map((metric) => (
              <article
                className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3"
                key={metric.id}
              >
                <span
                  aria-hidden="true"
                  className="block h-2 w-2 rounded-full shadow-[0_0_12px_currentColor]"
                  style={{ background: metric.accent, color: metric.accent }}
                />
                <p className="mt-2 text-[10px] font-medium uppercase leading-4 text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-2 break-words text-lg font-semibold leading-6 text-white">
                  {metric.value}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[10px] font-medium uppercase text-slate-500">
              Assignment Confidence
            </p>
            <div className="mt-2 grid gap-1.5">
              {confidenceDistribution.slice(0, 4).map((bucket) => (
                <div
                  className="flex items-center justify-between gap-3 text-xs"
                  key={bucket.label}
                >
                  <span className="text-slate-400">{bucket.label}</span>
                  <span className="font-semibold text-slate-100">
                    {bucket.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
            School capacity scoring is not active because enrollment/capacity
            data has not been added. Current capacity status:{" "}
            <span className="font-semibold">{capacityStatusLabel}</span>.
          </p>

          <div className="mt-3 rounded-md border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.045] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase text-slate-500">
                  Preliminary Utilization Snapshot
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Presentation-derived utilization, needs verification.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-white">
                {presentationSeedCountLabel}
              </span>
            </div>
            {utilizationClassDistribution.length > 0 ? (
              <div className="mt-3 grid gap-1.5">
                {utilizationClassDistribution.map((bucket) => (
                  <div
                    className="flex items-center justify-between gap-3 text-xs"
                    key={bucket.label}
                  >
                    <span className="text-slate-400">{bucket.label}</span>
                    <span className="font-semibold text-slate-100">
                      {bucket.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {knownReviewZones.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.045] p-3">
              <p className="text-[10px] font-medium uppercase text-amber-100/70">
                Known QA Review Zones
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/75">
                {knownReviewZones.join(", ")}
              </p>
            </div>
          ) : null}

          {unmatchedPresentationSeedRows.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.045] p-3">
              <p className="text-[10px] font-medium uppercase text-amber-100/70">
                Presentation Seed Reference Review
              </p>
              <div className="mt-2 grid gap-1.5">
                {unmatchedPresentationSeedRows.slice(0, 6).map((row) => (
                  <div
                    className="flex items-center justify-between gap-3 text-xs"
                    key={row.label}
                  >
                    <span className="min-w-0 break-words text-amber-100/75">
                      {row.label}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-amber-100/60">
                      {row.matchLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          School assignment summary is not available.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Loading school assignment summary
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
