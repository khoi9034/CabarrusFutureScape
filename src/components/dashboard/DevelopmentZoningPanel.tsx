"use client";

import { MapPinned } from "lucide-react";
import {
  formatDevelopmentCompact,
  formatDevelopmentCount,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDevelopmentZoningSummary } from "@/hooks/useDevelopmentZoningSummary";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function DevelopmentZoningPanel() {
  const { errorMessage, isLoading, records, source, totalCount } =
    useDevelopmentZoningSummary();
  const sourceDescription =
    source === "api"
      ? "Zoning development summaries are loaded from GET /development/zoning-summary."
      : source === "fallback"
        ? "FastAPI development zoning summary is unavailable, so this panel is using generated static zoning activity artifacts."
        : source === "loading"
          ? "Checking FastAPI development zoning summaries; static records remain visible while the request completes."
          : "Zoning development summaries use generated static permit activity outputs.";

  return (
    <section
      aria-label="Development activity by zoning jurisdiction and code"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Zoning Development
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Permit Density By Code
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
          <MapPinned className="h-4 w-4 text-[#55d38f]" />
        </div>
      </div>

      {records.length > 0 ? (
        <div className="mt-4 space-y-2">
          {records.map((record) => (
            <article
              className="rounded-md border border-white/10 bg-white/[0.035] p-3"
              key={`${record.zoning_jurisdiction_name}-${record.dominant_zoning_code_raw}-${record.permit_type}`}
              title={`${record.zoning_jurisdiction_name} / ${record.dominant_zoning_code_raw}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white">
                    {record.zoning_jurisdiction_name}
                  </h4>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {record.dominant_zoning_code_raw} /{" "}
                    {formatDevelopmentLabel(
                      record.dominant_zoning_general_normalized,
                    )}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-slate-400">
                    {formatDevelopmentLabel(record.permit_type)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#f0cd79]">
                    {formatDevelopmentCount(record.permit_count)}
                  </p>
                  <p className="text-[11px] text-slate-500">permits</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                  <span className="block text-slate-500">Parcels</span>
                  <span className="text-white">
                    {formatDevelopmentCount(record.active_parcel_count)}
                  </span>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                  <span className="block text-slate-500">Amount</span>
                  <span className="text-white">
                    ${formatDevelopmentCompact(record.total_permit_amount)}
                  </span>
                </div>
              </div>
              {record.ambiguous_permit_count > 0 ? (
                <p className="mt-2 text-[11px] text-amber-100/80">
                  {formatDevelopmentCount(record.ambiguous_permit_count)} permits
                  carry ambiguous parcel relationships.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          No zoning development summary records are available.
        </p>
      )}
      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription} Showing {formatDevelopmentCount(records.length)} of{" "}
        {formatDevelopmentCount(totalCount)} zoning activity rows.
      </p>
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving static zoning activity records during API handoff
        </p>
      ) : null}
    </section>
  );
}
