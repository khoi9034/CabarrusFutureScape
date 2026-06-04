"use client";

import { Layers3 } from "lucide-react";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  isLayerPlaceholder,
  layerCategories,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";
import type {
  DevelopmentHotspotActivityClassFilter,
  DevelopmentHotspotControls,
  DevelopmentHotspotLimit,
  DevelopmentHotspotRecentWindowFilter,
  DevelopmentHotspotSortBy,
} from "@/types/map/developmentHotspots";

const DEVELOPMENT_HOTSPOT_LAYER_ID = "permit-activity";

const activityClassOptions: Array<{
  label: string;
  value: DevelopmentHotspotActivityClassFilter;
}> = [
  { label: "Very high", value: "very_high_activity" },
  { label: "High", value: "high_activity" },
  { label: "Moderate", value: "moderate_activity" },
];

const recentWindowOptions: Array<{
  label: string;
  value: DevelopmentHotspotRecentWindowFilter;
}> = [
  { label: "All", value: "all" },
  { label: "1 year", value: "1" },
  { label: "3 years", value: "3" },
];

const zoningJurisdictionOptions = [
  { label: "All", value: "" },
  { label: "Concord", value: "Concord" },
  { label: "Kannapolis", value: "Kannapolis" },
  { label: "Harrisburg", value: "Harrisburg" },
  { label: "Midland", value: "Midland" },
  { label: "Mt. Pleasant", value: "Mt. Pleasant" },
  { label: "Locust", value: "Locust" },
  {
    label: "Cabarrus County",
    value: "Cabarrus County / Unincorporated",
  },
];

const sortOptions: Array<{
  label: string;
  value: DevelopmentHotspotSortBy;
}> = [
  { label: "Activity score", value: "development_activity_score" },
  { label: "Permit count", value: "total_permit_count" },
  { label: "Recent 1 yr", value: "recent_permit_count_1yr" },
  { label: "Recent 3 yr", value: "recent_permit_count_3yr" },
];

const limitOptions: DevelopmentHotspotLimit[] = [25, 50, 100];

const hotspotLegendItems = [
  {
    color: "#ff7e4f",
    label: "Very high",
    size: "h-4 w-4",
    value: "very_high_activity",
  },
  {
    color: "#ffb454",
    label: "High",
    size: "h-3.5 w-3.5",
    value: "high_activity",
  },
  {
    color: "#68d8ff",
    label: "Moderate",
    size: "h-3 w-3",
    value: "moderate_activity",
  },
];

export function LayerToggle() {
  const {
    developmentHotspotControls,
    developmentHotspotLayer,
    developmentHotspotsEnabled,
    isLayerActive,
    setDevelopmentHotspotControls,
    setDevelopmentHotspotsEnabled,
    setLayerVisibility,
  } = useDashboardState();

  const hotspotStatus =
    !developmentHotspotsEnabled
      ? "Hotspots off"
      : developmentHotspotLayer.isLoading
        ? "Loading hotspots"
        : developmentHotspotLayer.status === "ready"
          ? `Showing ${developmentHotspotLayer.markers.length} hotspots`
          : developmentHotspotLayer.status === "empty"
            ? "No hotspots match filters"
            : "Hotspots unavailable";
  const hotspotSourceStatus = USE_BACKEND_API ? "api" : "unavailable";

  function updateHotspotControls<K extends keyof DevelopmentHotspotControls>(
    key: K,
    value: DevelopmentHotspotControls[K],
  ) {
    setDevelopmentHotspotControls({
      ...developmentHotspotControls,
      [key]: value,
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Layer Registry
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Operational Layers
          </h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]">
          <Layers3 className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-4">
        {layerCategories.map((category) => {
          const layers = operationalLayerRegistry.filter(
            (layer) => layer.category === category,
          );

          if (!layers.length) {
            return null;
          }

          return (
            <div key={category}>
              <p className="mb-2 text-[11px] font-medium uppercase text-slate-500">
                {category}
              </p>
              <div className="space-y-2">
                {layers.map((layer) => {
                  const isDevelopmentHotspotLayer =
                    layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID;

                  if (isDevelopmentHotspotLayer) {
                    const unavailable = !USE_BACKEND_API;

                    return (
                      <article
                        className={cn(
                          "rounded-lg border p-3 transition",
                          unavailable && "opacity-55",
                          developmentHotspotsEnabled
                            ? "border-white/15 bg-white/[0.065]"
                            : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                        )}
                        key={layer.id}
                        title={
                          unavailable
                            ? "Development hotspot markers require NEXT_PUBLIC_USE_BACKEND_API=true."
                            : "Real permit activity hotspot markers from FastAPI."
                        }
                      >
                        <div className="flex items-center gap-3">
                          <button
                            aria-label={
                              developmentHotspotsEnabled
                                ? "Hide development hotspots"
                                : "Show development hotspots"
                            }
                            aria-pressed={developmentHotspotsEnabled}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                            disabled={unavailable}
                            onClick={() =>
                              setDevelopmentHotspotsEnabled(
                                !developmentHotspotsEnabled,
                              )
                            }
                            type="button"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_18px_currentColor]"
                              style={{
                                background: layer.accent,
                                color: layer.accent,
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-100">
                                Development Hotspots
                              </span>
                              <span className="mt-1 block truncate text-xs text-slate-500">
                                Real permit activity hotspot markers from
                                FastAPI
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                    developmentHotspotsEnabled
                                      ? "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]"
                                      : "border-white/10 bg-white/[0.025] text-slate-500",
                                  )}
                                >
                                  {hotspotStatus}
                                </span>
                                <span className="rounded border border-white/10 bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                                  {hotspotSourceStatus}
                                </span>
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={
                              developmentHotspotsEnabled
                                ? "Hide development hotspots"
                                : "Show development hotspots"
                            }
                            aria-pressed={developmentHotspotsEnabled}
                            className={cn(
                              "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed",
                              developmentHotspotsEnabled
                                ? "border-[#d8b86a]/40 bg-[#d8b86a]/25"
                                : "border-white/10 bg-white/5",
                            )}
                            disabled={unavailable}
                            onClick={() =>
                              setDevelopmentHotspotsEnabled(
                                !developmentHotspotsEnabled,
                              )
                            }
                            title={
                              developmentHotspotsEnabled
                                ? "Hide development hotspots"
                                : "Show development hotspots"
                            }
                            type="button"
                          >
                            <span
                              className={cn(
                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                                developmentHotspotsEnabled
                                  ? "left-[18px] bg-[#f0cd79]"
                                  : "left-1 bg-slate-500",
                              )}
                            />
                          </button>
                        </div>

                        {USE_BACKEND_API ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <HotspotSelect
                              label="Activity"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "activityClass",
                                  value as DevelopmentHotspotActivityClassFilter,
                                )
                              }
                              options={activityClassOptions}
                              value={developmentHotspotControls.activityClass}
                            />
                            <HotspotSelect
                              label="Window"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "recentWindow",
                                  value as DevelopmentHotspotRecentWindowFilter,
                                )
                              }
                              options={recentWindowOptions}
                              value={developmentHotspotControls.recentWindow}
                            />
                            <HotspotSelect
                              className="col-span-2"
                              label="Jurisdiction"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "zoningJurisdiction",
                                  value,
                                )
                              }
                              options={zoningJurisdictionOptions}
                              value={
                                developmentHotspotControls.zoningJurisdiction
                              }
                            />
                            <HotspotSelect
                              label="Sort"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "sortBy",
                                  value as DevelopmentHotspotSortBy,
                                )
                              }
                              options={sortOptions}
                              value={developmentHotspotControls.sortBy}
                            />
                            <HotspotSelect
                              label="Limit"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "limit",
                                  Number(value) as DevelopmentHotspotLimit,
                                )
                              }
                              options={limitOptions.map((value) => ({
                                label: String(value),
                                value: String(value),
                              }))}
                              value={String(developmentHotspotControls.limit)}
                            />
                            <div className="col-span-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-medium uppercase text-slate-500">
                                  Legend
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Bigger / warmer = more activity
                                </p>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-1.5">
                                {hotspotLegendItems.map((item) => (
                                  <div
                                    className="flex min-w-0 items-center gap-1.5 rounded border border-white/10 bg-white/[0.025] px-1.5 py-1"
                                    key={item.value}
                                    title={`${item.value} hotspot marker`}
                                  >
                                    <span
                                      className={cn(
                                        "shrink-0 rounded-full border border-white/70 shadow-[0_0_14px_currentColor]",
                                        item.size,
                                      )}
                                      style={{
                                        background: item.color,
                                        color: item.color,
                                      }}
                                    />
                                    <span className="truncate text-[10px] text-slate-300">
                                      {item.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                                Hotspots rank parcels by permit count, recent
                                1-year and 3-year activity, and the parcel
                                development activity score/class. Click a dot
                                to inspect that parcel.
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {developmentHotspotsEnabled &&
                        developmentHotspotLayer.errorMessage ? (
                          <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
                            {developmentHotspotLayer.errorMessage}
                          </p>
                        ) : null}
                      </article>
                    );
                  }

                  const active = isLayerActive(layer.id);
                  const unavailable =
                    isLayerPlaceholder(layer) || !layer.visibility;

                  return (
                    <label
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border p-3 transition focus-within:border-[#d8b86a]/45 focus-within:ring-2 focus-within:ring-[#d8b86a]/15",
                        unavailable && "cursor-not-allowed opacity-55",
                        active
                          ? "border-white/15 bg-white/[0.065]"
                          : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                      )}
                      key={layer.id}
                      title={
                        unavailable
                          ? `${layer.title} is a disabled placeholder service.`
                          : layer.description
                      }
                    >
                      <input
                        aria-label={`${active ? "Hide" : "Show"} ${layer.title}`}
                        checked={active}
                        className="sr-only"
                        disabled={unavailable}
                        onChange={(event) =>
                          setLayerVisibility(layer.id, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full shadow-[0_0_18px_currentColor]"
                        style={{ color: layer.accent, background: layer.accent }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-100">
                          {layer.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {layer.description}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                              active
                                ? "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]"
                                : "border-white/10 bg-white/[0.025] text-slate-500",
                            )}
                          >
                            {active ? "Active" : "Hidden"}
                          </span>
                          <span className="rounded border border-white/10 bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                            {layer.sourceStatus}
                          </span>
                        </span>
                      </span>
                      <span
                        className={cn(
                          "relative h-5 w-9 rounded-full border transition",
                          active
                            ? "border-[#d8b86a]/40 bg-[#d8b86a]/25"
                            : "border-white/10 bg-white/5",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                            active
                              ? "left-[18px] bg-[#f0cd79]"
                              : "left-1 bg-slate-500",
                          )}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HotspotSelect({
  className,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
        {label}
      </span>
      <select
        aria-label={`Development hotspot ${label.toLowerCase()} filter`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#d8b86a]/55 focus:ring-2 focus:ring-[#d8b86a]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
