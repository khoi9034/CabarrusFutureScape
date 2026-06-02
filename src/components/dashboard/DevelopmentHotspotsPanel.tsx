"use client";

import { Flame } from "lucide-react";
import {
  formatDevelopmentCompact,
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDevelopmentHotspots } from "@/hooks/useDevelopmentHotspots";
import { cn } from "@/lib/utils";

const sourceLabels = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
} as const;

export function DevelopmentHotspotsPanel() {
  const { errorMessage, hotspots, isLoading, source, totalCount } =
    useDevelopmentHotspots();
  const sourceDescription =
    source === "api"
      ? "Hotspots are loaded from GET /development/hotspots."
      : source === "fallback"
        ? "FastAPI development hotspots are unavailable, so this panel is using generated static hotspot artifacts."
        : source === "loading"
          ? "Checking FastAPI development hotspots; static hotspots remain visible while the request completes."
          : "Hotspots use generated static development activity outputs.";

  return (
    <section
      aria-label="Top development activity parcel hotspots"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Development Hotspots
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Top Active Parcels
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
          <Flame className="h-4 w-4 text-[#ffb454]" />
        </div>
      </div>

      {hotspots.length > 0 ? (
        <div className="mt-4 space-y-2">
          {hotspots.map((parcel) => (
            <article
              className="rounded-md border border-white/10 bg-white/[0.035] p-3"
              key={parcel.official_parcel_id}
              title={`${parcel.official_parcel_id} / ${parcel.pin14}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white">
                    {parcel.official_parcel_id}
                  </h4>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    PIN {parcel.pin14}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-slate-400">
                    {parcel.zoning_jurisdiction_name ?? "No jurisdiction"} /{" "}
                    {parcel.dominant_zoning_code_raw ?? "No zoning code"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#f0cd79]">
                    {formatDevelopmentCount(parcel.total_permit_count)}
                  </p>
                  <p className="text-[11px] text-slate-500">permits</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                  <span className="block text-slate-500">Latest</span>
                  <span className="text-white">
                    {formatDevelopmentDate(parcel.latest_permit_date)}
                  </span>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                  <span className="block text-slate-500">Amount</span>
                  <span className="text-white">
                    ${formatDevelopmentCompact(parcel.total_permit_amount)}
                  </span>
                </div>
              </div>
              <p className="mt-2 truncate text-[11px] text-slate-500">
                {formatDevelopmentLabel(parcel.dominant_permit_type)} /{" "}
                {formatDevelopmentLabel(parcel.dominant_work_type)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          No top parcel hotspot records are available in the generated
          development activity artifact.
        </p>
      )}
      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription} Showing {formatDevelopmentCount(hotspots.length)} of{" "}
        {formatDevelopmentCount(totalCount)} hotspot parcels.
      </p>
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving static hotspot records during API handoff
        </p>
      ) : null}
    </section>
  );
}
