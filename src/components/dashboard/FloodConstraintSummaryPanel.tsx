"use client";

import { Droplets } from "lucide-react";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import type { FloodConstraintSummarySource } from "@/lib/adapters/floodConstraintSummaryAdapter";
import { cn } from "@/lib/utils";

const sourceLabels: Record<FloodConstraintSummarySource, string> = {
  api: "FastAPI",
  demo: "Demo Extract",
  loading: "Loading API",
  unavailable: "Unavailable",
};

export function FloodConstraintSummaryPanel() {
  const { errorMessage, isLoading, metrics, source } =
    useFloodConstraintSummary();
  const sourceDescription =
    source === "api"
      ? "Flood constraints are loaded from GET /constraints/flood/summary using FEMA NFHL Layer 28 parcel overlay results."
      : source === "demo"
        ? "Floodplain review uses the cached portfolio demo extract."
      : source === "loading"
        ? "Checking FastAPI flood constraint summary."
        : "Flood summary is unavailable. No flood values are fabricated from mock data or the old TIFF reference.";

  return (
    <section
      aria-label="Flood constraint summary"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Constraints
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Flood Constraint Summary
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
          <Droplets className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {metrics.length > 0 ? (
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
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Flood constraint summary is not available.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Loading FEMA flood summary
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
