"use client";

import { useState } from "react";
import { ArrowUpRight, BrainCircuit, Layers3 } from "lucide-react";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  isLayerVisibilityControllable,
  isLayerPlaceholder,
  layerCategories,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";
import type {
  DevelopmentHotspotActivityClassFilter,
  DevelopmentHotspotControls,
  DevelopmentHotspotGrowthSignalFilter,
  DevelopmentHotspotLimit,
  DevelopmentHotspotPermitSegmentFilter,
  DevelopmentHotspotRecentWindowFilter,
  DevelopmentHotspotSortBy,
  DevelopmentHotspotStatusStageFilter,
  DevelopmentHotspotValueClassFilter,
} from "@/types/map/developmentHotspots";
import type {
  FloodZoneControls,
  FloodZoneLimitMode,
  FloodZoneSeverityFilter,
} from "@/types/map/floodZones";
import type {
  SchoolUtilizationClassFilter,
  SchoolUtilizationLevel,
  SchoolUtilizationZoneControls,
} from "@/types/map/schoolUtilizationZones";
import type { OperationalLayer } from "@/types";

const DEVELOPMENT_HOTSPOT_LAYER_ID = "permit-activity";
const FLOOD_CONSTRAINT_LAYER_ID = "flood-risk";
const FEMA_FLOOD_ZONE_LAYER_ID = "fema-flood-zones";
const SCHOOL_UTILIZATION_LAYER_ID = "school-utilization-seed";

const activityClassOptions: Array<{
  label: string;
  value: DevelopmentHotspotActivityClassFilter;
}> = [
  { label: "All", value: "all" },
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

const permitSegmentOptions: Array<{
  label: string;
  value: DevelopmentHotspotPermitSegmentFilter;
}> = [
  { label: "Select segment...", value: "all" },
  { label: "Residential Growth", value: "residential_growth" },
  { label: "Commercial Activity", value: "commercial_activity" },
  { label: "Redevelopment Signal", value: "redevelopment_signal" },
  { label: "Minor Maintenance", value: "minor_maintenance" },
  { label: "Demolition", value: "demolition" },
  { label: "Industrial Activity", value: "industrial_activity" },
  { label: "Institutional Activity", value: "institutional_activity" },
];

const growthSignalOptions: Array<{
  label: string;
  value: DevelopmentHotspotGrowthSignalFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Major Growth", value: "major_growth" },
  { label: "Moderate Activity", value: "moderate_activity" },
  { label: "Redevelopment", value: "redevelopment_signal" },
  { label: "Minor Activity", value: "minor_activity" },
];

const statusStageOptions: Array<{
  label: string;
  value: DevelopmentHotspotStatusStageFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Active Construction", value: "active_construction" },
  { label: "Issued / Starting", value: "issued_or_starting" },
  { label: "Completed", value: "completed" },
];

const valueClassOptions: Array<{
  label: string;
  value: DevelopmentHotspotValueClassFilter;
}> = [
  { label: "All", value: "all" },
  { label: "High Value", value: "high_value" },
  { label: "Major Value", value: "major_value" },
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

const hotspotConcentrationLegendItems = [
  { label: "1-2", size: "h-2.5 w-2.5" },
  { label: "3-10", size: "h-3.5 w-3.5" },
  { label: "11-25", size: "h-5 w-5" },
  { label: "26+", size: "h-6 w-6" },
];

const floodLegendItems = [
  {
    color: "#ff5b5b",
    label: "Severe / floodway",
    shape: "triangle",
    size: "h-4 w-4",
  },
  {
    color: "#ffb454",
    label: "High / SFHA",
    shape: "kite",
    size: "h-3.5 w-3.5",
  },
  {
    color: "#f7d94c",
    label: "Moderate",
    shape: "circle",
    size: "h-3 w-3",
  },
];

const floodZoneSeverityOptions: Array<{
  label: string;
  value: FloodZoneSeverityFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Severe", value: "severe" },
  { label: "High", value: "high" },
  { label: "Moderate", value: "moderate" },
];

const floodZoneLimitOptions: Array<{
  label: string;
  value: FloodZoneLimitMode;
}> = [
  { label: "100", value: "100" },
  { label: "500", value: "500" },
  { label: "Visible extent", value: "visible_extent" },
];

const floodZoneLegendItems = [
  {
    color: "#ff5b5b",
    label: "Floodway",
  },
  {
    color: "#ffb454",
    label: "SFHA",
  },
  {
    color: "#f7d94c",
    label: "Moderate",
  },
  {
    color: "#9eb6c7",
    label: "Minimal",
  },
];

const schoolLevelOptions: Array<{
  label: string;
  value: SchoolUtilizationLevel;
}> = [
  { label: "All levels", value: "all" },
  { label: "Elementary", value: "elementary" },
  { label: "Middle", value: "middle" },
  { label: "High", value: "high" },
];

const schoolUtilizationClassOptions: Array<{
  label: string;
  value: SchoolUtilizationClassFilter;
}> = [
  { label: "All classes", value: "all" },
  { label: "Under capacity seed", value: "under_capacity" },
  { label: "Approaching capacity seed", value: "approaching_capacity" },
  { label: "Over capacity seed", value: "over_capacity" },
  {
    label: "Severely over capacity seed",
    value: "severely_over_capacity",
  },
];

const schoolUtilizationLegendItems = [
  {
    color: "#38bdf8",
    label: "Under capacity",
    range: "<80%",
  },
  {
    color: "#facc15",
    label: "Approaching capacity",
    range: "80-99%",
  },
  {
    color: "#f97316",
    label: "Over capacity",
    range: "100-110%",
  },
  {
    color: "#ec4899",
    label: "Severely over capacity",
    range: ">110%",
  },
];

export function LayerToggle() {
  const [isLayerRegistryOpen, setIsLayerRegistryOpen] = useState(false);
  const {
    developmentHotspotControls,
    developmentHotspotLayer,
    developmentHotspotsEnabled,
    floodConstraintLayer,
    floodConstraintsEnabled,
    floodZoneControls,
    floodZoneLayer,
    floodZonesEnabled,
    isLayerActive,
    schoolUtilizationZoneControls,
    schoolUtilizationZoneLayer,
    schoolUtilizationZonesEnabled,
    setDevelopmentHotspotControls,
    setDevelopmentHotspotsEnabled,
    setFloodConstraintsEnabled,
    setFloodZoneControls,
    setFloodZonesEnabled,
    setLayerVisibility,
    setProductMode,
    setSchoolUtilizationZoneControls,
    setSchoolUtilizationZonesEnabled,
  } = useDashboardState();

  const hotspotTemporalContext =
    developmentHotspotLayer.temporalContextLabel;
  const selectedHotspotSegment =
    developmentHotspotControls.permitSegment === "all"
      ? null
      : developmentHotspotControls.permitSegment;
  const selectedHotspotSegmentLabel = selectedHotspotSegment
    ? getPermitSegmentLabel(selectedHotspotSegment)
    : null;
  const selectedHotspotSegmentColor =
    getPermitSegmentLegendColor(selectedHotspotSegment);
  const noHotspotSegmentSelected =
    developmentHotspotsEnabled && !selectedHotspotSegment;
  const hotspotStatus =
    !developmentHotspotsEnabled
      ? "Hotspots off"
      : noHotspotSegmentSelected
        ? "Select a permit segment to view hotspot concentration"
      : developmentHotspotLayer.isLoading
        ? "Loading hotspots"
        : developmentHotspotLayer.status === "ready"
          ? `Showing ${developmentHotspotLayer.markers.length} ${selectedHotspotSegmentLabel ?? "permit"} hotspots`
          : developmentHotspotLayer.status === "empty"
            ? hotspotTemporalContext
              ? "No hotspots match temporal filters"
              : "No hotspots match filters"
            : "Hotspots unavailable";
  const hotspotSourceStatus = USE_BACKEND_API ? "API" : "Unavailable";
  const floodStatus =
    !floodConstraintsEnabled
      ? "Flood constraints off"
      : floodConstraintLayer.isLoading
        ? "Loading FEMA constraints"
        : floodConstraintLayer.status === "ready"
          ? `Showing ${floodConstraintLayer.markers.length} flood review parcels`
          : floodConstraintLayer.status === "empty"
            ? "No high-review parcels"
            : "Flood constraints unavailable";
  const floodSourceStatus = USE_BACKEND_API ? "API" : "Unavailable";
  const floodSeverityCounts = floodConstraintLayer.severityCounts;
  const showFloodSeverityCounts =
    floodConstraintsEnabled && floodConstraintLayer.status === "ready";
  const floodZoneStatus =
    !floodZonesEnabled
      ? "FEMA zones off"
      : floodZoneLayer.isLoading
        ? "Loading FEMA zones"
        : floodZoneLayer.status === "ready"
          ? floodZoneControls.limitMode === "visible_extent"
            ? `Showing ${floodZoneLayer.polygons.length} visible FEMA polygons`
            : `Showing ${floodZoneLayer.polygons.length} FEMA polygons`
          : floodZoneLayer.status === "empty"
            ? "No FEMA zones match filters"
            : "FEMA zones unavailable";
  const floodZoneSourceStatus = USE_BACKEND_API ? "API" : "Unavailable";
  const showFloodZoneSeverityCounts =
    floodZonesEnabled && floodZoneLayer.status === "ready";
  const schoolUtilizationStatus =
    !schoolUtilizationZonesEnabled
      ? "School utilization off"
      : schoolUtilizationZoneLayer.isLoading
        ? "Loading school zones"
        : schoolUtilizationZoneLayer.status === "ready"
          ? schoolUtilizationZoneControls.level === "all"
            ? `Showing ${schoolUtilizationZoneLayer.polygons.length} utilization zones`
            : `Showing ${schoolUtilizationZoneLayer.polygons.length} ${formatSchoolLevelLabel(
                schoolUtilizationZoneControls.level,
              )} zones`
          : schoolUtilizationZoneLayer.status === "empty"
            ? "No utilization zones match filters"
            : "School zones unavailable";
  const schoolUtilizationSourceStatus = USE_BACKEND_API ? "API" : "Unavailable";
  const showSchoolUtilizationCounts =
    schoolUtilizationZonesEnabled &&
    schoolUtilizationZoneLayer.status === "ready";

  function updateHotspotControls<K extends keyof DevelopmentHotspotControls>(
    key: K,
    value: DevelopmentHotspotControls[K],
  ) {
    setDevelopmentHotspotControls({
      ...developmentHotspotControls,
      [key]: value,
    });
  }

  function updateFloodZoneControls<K extends keyof FloodZoneControls>(
    key: K,
    value: FloodZoneControls[K],
  ) {
    setFloodZoneControls({
      ...floodZoneControls,
      [key]: value,
    });
  }

  function updateSchoolUtilizationControls<
    K extends keyof SchoolUtilizationZoneControls,
  >(key: K, value: SchoolUtilizationZoneControls[K]) {
    setSchoolUtilizationZoneControls({
      ...schoolUtilizationZoneControls,
      [key]: value,
    });
  }

  function toggleSchoolUtilizationZones() {
    if (!schoolUtilizationZonesEnabled) {
      setSchoolUtilizationZoneControls({
        ...schoolUtilizationZoneControls,
        limit: 500,
      });
    }

    setSchoolUtilizationZonesEnabled(!schoolUtilizationZonesEnabled);
  }

  return (
    <section>
      <details
        className="group rounded-lg border border-white/10 bg-black/20 p-3"
        onToggle={(event) => setIsLayerRegistryOpen(event.currentTarget.open)}
        open={isLayerRegistryOpen}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">
              Map Layers
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-white">
              Active Overlays
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 group-open:hidden">
              Closed
            </span>
            <span className="hidden rounded-full border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#f0cd79] group-open:inline-flex">
              Open
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]">
              <Layers3 className="h-4 w-4" />
            </div>
          </div>
        </summary>

      {isLayerRegistryOpen ? (
      <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
        {layerCategories.map((category) => {
          const showModelResearchStatus = category === "Intelligence";
          const layers = operationalLayerRegistry.filter(
            (layer) =>
              layer.category === category &&
              isLayerVisibilityControllable(layer),
          );

          if (!layers.length && !showModelResearchStatus) {
            return null;
          }

          return (
            <div key={category}>
              <p className="mb-2 text-[11px] font-medium uppercase text-slate-500">
                {category}
              </p>
              <div className="space-y-2">
                {showModelResearchStatus ? (
                  <ModelResearchStatusCard
                    onOpenMethodology={() => setProductMode("methodology")}
                  />
                ) : null}
                {layers.map((layer) => {
                  const isDevelopmentHotspotLayer =
                    layer.id === DEVELOPMENT_HOTSPOT_LAYER_ID;
                  const isFloodConstraintLayer =
                    layer.id === FLOOD_CONSTRAINT_LAYER_ID;
                  const isFemaFloodZoneLayer =
                    layer.id === FEMA_FLOOD_ZONE_LAYER_ID;
                  const isSchoolUtilizationLayer =
                    layer.id === SCHOOL_UTILIZATION_LAYER_ID;

                  if (isFloodConstraintLayer) {
                    const unavailable = !USE_BACKEND_API;

                    return (
                      <article
                        className={cn(
                          "rounded-lg border p-3 transition",
                          unavailable && "opacity-55",
                          floodConstraintsEnabled
                            ? "border-white/15 bg-white/[0.065]"
                            : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                        )}
                        key={layer.id}
                        title={
                          unavailable
                            ? "Flood constraint markers require NEXT_PUBLIC_USE_BACKEND_API=true."
                            : "FEMA NFHL Layer 28 high-review flood constraint markers from FastAPI."
                        }
                      >
                        <div className="flex items-center gap-3">
                          <button
                            aria-label={
                              floodConstraintsEnabled
                                ? "Hide flood constraints"
                                : "Show flood constraints"
                            }
                            aria-pressed={floodConstraintsEnabled}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                            disabled={unavailable}
                            onClick={() =>
                              setFloodConstraintsEnabled(
                                !floodConstraintsEnabled,
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
                              <span className="block text-sm font-medium leading-5 text-slate-100">
                                Flood Constraints
                              </span>
                              <span className="mt-1 block text-xs leading-4 text-slate-500">
                                FEMA NFHL high-review parcel constraints
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <LayerStatusBadge
                                  active={floodConstraintsEnabled}
                                  tone="red"
                                >
                                  {floodStatus}
                                </LayerStatusBadge>
                                <LayerStatusBadge>
                                  {floodSourceStatus}
                                </LayerStatusBadge>
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={
                              floodConstraintsEnabled
                                ? "Hide flood constraints"
                                : "Show flood constraints"
                            }
                            aria-pressed={floodConstraintsEnabled}
                            className={cn(
                              "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed",
                              floodConstraintsEnabled
                                ? "border-[#ff8d7a]/40 bg-[#ff8d7a]/25"
                                : "border-white/10 bg-white/5",
                            )}
                            disabled={unavailable}
                            onClick={() =>
                              setFloodConstraintsEnabled(
                                !floodConstraintsEnabled,
                              )
                            }
                            title={
                              floodConstraintsEnabled
                                ? "Hide flood constraints"
                                : "Show flood constraints"
                            }
                            type="button"
                          >
                            <span
                              className={cn(
                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                                floodConstraintsEnabled
                                  ? "left-[18px] bg-[#ffb4a8]"
                                  : "left-1 bg-slate-500",
                              )}
                            />
                          </button>
                        </div>

                        {showFloodSeverityCounts ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <FloodCountBadge
                              color="#ff5b5b"
                              label="Severe"
                              value={floodSeverityCounts.severe}
                            />
                            <FloodCountBadge
                              color="#ffb454"
                              label="High"
                              value={floodSeverityCounts.high}
                            />
                            <FloodCountBadge
                              color="#f7d94c"
                              label="Moderate"
                              value={floodSeverityCounts.moderate}
                            />
                          </div>
                        ) : null}

                        {USE_BACKEND_API ? (
                          <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-medium uppercase text-slate-500">
                                Legend
                              </p>
                              <p className="text-[10px] text-slate-500">
                                High-review only
                              </p>
                            </div>
                            <div className="mt-2 grid gap-1.5">
                              {floodLegendItems.map((item) => (
                                <div
                                  className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5"
                                  key={item.label}
                                >
                                  <LayerLegendMarker
                                    color={item.color}
                                    shape={item.shape}
                                    size={item.size}
                                  />
                                  <span className="text-[11px] leading-4 text-slate-300">
                                    {item.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-slate-500">
                              Markers come from FEMA NFHL Layer 28 parcel
                              overlay records where flood review is required.
                              Color and shape show severity. Marker size grows
                              with flood constraint score or percent
                              constrained. Click a marker to inspect parcel
                              flood constraints.
                            </p>
                          </div>
                        ) : null}

                        {floodConstraintsEnabled &&
                        floodConstraintLayer.errorMessage ? (
                          <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
                            {floodConstraintLayer.errorMessage}
                          </p>
                        ) : null}
                      </article>
                    );
                  }

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
                              <span className="block text-sm font-medium leading-5 text-slate-100">
                                Development Hotspots
                              </span>
                              <span className="mt-1 block text-xs leading-4 text-slate-500">
                                Real permit activity hotspot markers from
                                FastAPI
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <LayerStatusBadge
                                  active={developmentHotspotsEnabled}
                                  tone="gold"
                                >
                                  {hotspotStatus}
                                </LayerStatusBadge>
                                <LayerStatusBadge>
                                  {hotspotSourceStatus}
                                </LayerStatusBadge>
                                {developmentHotspotsEnabled &&
                                hotspotTemporalContext ? (
                                  <span className="max-w-full rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-medium leading-4 text-[#8fe7ff]">
                                    {hotspotTemporalContext}
                                  </span>
                                ) : null}
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
                            {developmentHotspotsEnabled &&
                            hotspotTemporalContext ? (
                              <p className="col-span-2 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.055] px-2 py-1.5 text-[11px] leading-5 text-[#bfefff]">
                                Synced to Temporal Analysis:{" "}
                                {hotspotTemporalContext}.
                              </p>
                            ) : null}
                            <HotspotSelect
                              className="col-span-2"
                              label="Show permit concentration by"
                              onChange={(value) =>
                                updateHotspotControls(
                                  "permitSegment",
                                  value as DevelopmentHotspotPermitSegmentFilter,
                                )
                              }
                              options={permitSegmentOptions}
                              value={developmentHotspotControls.permitSegment}
                            />
                            {!selectedHotspotSegment ? (
                              <div className="col-span-2 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.045] px-2 py-2 text-[11px] leading-5 text-[#bfefff]">
                                Select a permit segment to view hotspot
                                concentration. Generic all-permit markers stay
                                hidden to keep the map readable.
                              </div>
                            ) : (
                              <div className="col-span-2 rounded-md border border-white/10 bg-black/20 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-medium uppercase text-slate-500">
                                    {selectedHotspotSegmentLabel} Hotspots
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Size = concentration
                                  </p>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-1.5">
                                  {hotspotConcentrationLegendItems.map(
                                    (item) => (
                                      <div
                                        className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5"
                                        key={item.label}
                                      >
                                        <LayerLegendMarker
                                          color={selectedHotspotSegmentColor}
                                          shape={getPermitSegmentLegendShape(
                                            selectedHotspotSegment,
                                          )}
                                          size={item.size}
                                        />
                                        <span className="text-[10px] leading-4 text-slate-300">
                                          {item.label}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                                  Markers show parcels with{" "}
                                  {selectedHotspotSegmentLabel?.toLowerCase()}{" "}
                                  permits. Size = number/intensity of the
                                  selected permit segment. Click a marker to
                                  inspect that parcel.
                                </p>
                              </div>
                            )}
                            <HotspotAdvancedFilters
                              controls={developmentHotspotControls}
                              onChange={updateHotspotControls}
                            />
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

                  if (isFemaFloodZoneLayer) {
                    const unavailable = !USE_BACKEND_API;

                    return (
                      <article
                        className={cn(
                          "rounded-lg border p-3 transition",
                          unavailable && "opacity-55",
                          floodZonesEnabled
                            ? "border-white/15 bg-white/[0.065]"
                            : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                        )}
                        key={layer.id}
                        title={
                          unavailable
                            ? "FEMA flood zone polygons require NEXT_PUBLIC_USE_BACKEND_API=true."
                            : "Official FEMA NFHL Layer 28 source polygons from FastAPI."
                        }
                      >
                        <div className="flex items-center gap-3">
                          <button
                            aria-label={
                              floodZonesEnabled
                                ? "Hide FEMA flood zones"
                                : "Show FEMA flood zones"
                            }
                            aria-pressed={floodZonesEnabled}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                            disabled={unavailable}
                            onClick={() =>
                              setFloodZonesEnabled(!floodZonesEnabled)
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
                              <span className="block text-sm font-medium leading-5 text-slate-100">
                                FEMA Flood Zones
                              </span>
                              <span className="mt-1 block text-xs leading-4 text-slate-500">
                                Official FEMA NFHL Layer 28 polygons
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <LayerStatusBadge
                                  active={floodZonesEnabled}
                                  tone="orange"
                                >
                                  {floodZoneStatus}
                                </LayerStatusBadge>
                                <LayerStatusBadge>
                                  {floodZoneSourceStatus}
                                </LayerStatusBadge>
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={
                              floodZonesEnabled
                                ? "Hide FEMA flood zones"
                                : "Show FEMA flood zones"
                            }
                            aria-pressed={floodZonesEnabled}
                            className={cn(
                              "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed",
                              floodZonesEnabled
                                ? "border-[#ffb454]/40 bg-[#ffb454]/25"
                                : "border-white/10 bg-white/5",
                            )}
                            disabled={unavailable}
                            onClick={() =>
                              setFloodZonesEnabled(!floodZonesEnabled)
                            }
                            title={
                              floodZonesEnabled
                                ? "Hide FEMA flood zones"
                                : "Show FEMA flood zones"
                            }
                            type="button"
                          >
                            <span
                              className={cn(
                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                                floodZonesEnabled
                                  ? "left-[18px] bg-[#ffcf92]"
                                  : "left-1 bg-slate-500",
                              )}
                            />
                          </button>
                        </div>

                        {USE_BACKEND_API ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <FloodZoneSelect
                              label="Severity"
                              onChange={(value) =>
                                updateFloodZoneControls(
                                  "severity",
                                  value as FloodZoneSeverityFilter,
                                )
                              }
                              options={floodZoneSeverityOptions}
                              value={floodZoneControls.severity}
                            />
                            <FloodZoneSelect
                              label="Limit"
                              onChange={(value) =>
                                updateFloodZoneControls(
                                  "limitMode",
                                  value as FloodZoneLimitMode,
                                )
                              }
                              options={floodZoneLimitOptions}
                              value={floodZoneControls.limitMode}
                            />
                            {showFloodZoneSeverityCounts ? (
                              <div className="col-span-2 flex flex-wrap gap-1.5">
                                <FloodCountBadge
                                  color="#ff5b5b"
                                  label="Severe"
                                  value={floodZoneLayer.severityCounts.severe}
                                />
                                <FloodCountBadge
                                  color="#ffb454"
                                  label="High"
                                  value={floodZoneLayer.severityCounts.high}
                                />
                                <FloodCountBadge
                                  color="#f7d94c"
                                  label="Moderate"
                                  value={floodZoneLayer.severityCounts.moderate}
                                />
                                <FloodCountBadge
                                  color="#9eb6c7"
                                  label="Minimal"
                                  value={floodZoneLayer.severityCounts.low}
                                />
                              </div>
                            ) : null}
                            <div className="col-span-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-medium uppercase text-slate-500">
                                  Legend
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Source polygons
                                </p>
                              </div>
                              <div className="mt-2 grid gap-1.5">
                                {floodZoneLegendItems.map((item) => (
                                  <div
                                    className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5"
                                    key={item.label}
                                  >
                                    <span
                                      className="h-3 w-3 shrink-0 rounded-sm border border-white/50"
                                      style={{
                                        background: item.color,
                                        boxShadow: `0 0 12px ${item.color}`,
                                      }}
                                    />
                                    <span className="text-[11px] leading-4 text-slate-300">
                                      {item.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                                FEMA Flood Zones show the regulatory source
                                polygons with transparent fills. Parcel-based
                                review flags remain in the separate Flood
                                Constraints marker layer.
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {floodZonesEnabled && floodZoneLayer.errorMessage ? (
                          <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
                            {floodZoneLayer.errorMessage}
                          </p>
                        ) : null}
                      </article>
                    );
                  }

                  if (isSchoolUtilizationLayer) {
                    const unavailable = !USE_BACKEND_API;

                    return (
                      <article
                        className={cn(
                          "rounded-lg border p-3 transition",
                          unavailable && "opacity-55",
                          schoolUtilizationZonesEnabled
                            ? "border-white/15 bg-white/[0.065]"
                            : "border-white/[0.08] bg-black/10 hover:border-white/[0.12] hover:bg-white/[0.04]",
                        )}
                        key={layer.id}
                        title={
                          unavailable
                            ? "School utilization zones require NEXT_PUBLIC_USE_BACKEND_API=true."
                            : "Presentation-derived school utilization seed joined to attendance-zone polygons."
                        }
                      >
                        <div className="flex items-center gap-3">
                          <button
                            aria-label={
                              schoolUtilizationZonesEnabled
                                ? "Hide school utilization seed"
                                : "Show school utilization seed"
                            }
                            aria-pressed={schoolUtilizationZonesEnabled}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                            disabled={unavailable}
                            onClick={toggleSchoolUtilizationZones}
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
                              <span className="block text-sm font-medium leading-5 text-slate-100">
                                School Utilization Seed
                              </span>
                              <span className="mt-1 block text-xs leading-4 text-slate-500">
                                Preliminary utilization by attendance zone
                              </span>
                              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                                <LayerStatusBadge
                                  active={schoolUtilizationZonesEnabled}
                                  tone="green"
                                >
                                  {schoolUtilizationStatus}
                                </LayerStatusBadge>
                                <LayerStatusBadge>
                                  {schoolUtilizationSourceStatus}
                                </LayerStatusBadge>
                              </span>
                            </span>
                          </button>
                          <button
                            aria-label={
                              schoolUtilizationZonesEnabled
                                ? "Hide school utilization seed"
                                : "Show school utilization seed"
                            }
                            aria-pressed={schoolUtilizationZonesEnabled}
                            className={cn(
                              "relative h-5 w-9 shrink-0 rounded-full border transition disabled:cursor-not-allowed",
                              schoolUtilizationZonesEnabled
                                ? "border-[#5cd38f]/40 bg-[#5cd38f]/25"
                                : "border-white/10 bg-white/5",
                            )}
                            disabled={unavailable}
                            onClick={toggleSchoolUtilizationZones}
                            title={
                              schoolUtilizationZonesEnabled
                                ? "Hide school utilization seed"
                                : "Show school utilization seed"
                            }
                            type="button"
                          >
                            <span
                              className={cn(
                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition",
                                schoolUtilizationZonesEnabled
                                  ? "left-[18px] bg-[#9ff0bd]"
                                  : "left-1 bg-slate-500",
                              )}
                            />
                          </button>
                        </div>

                        {USE_BACKEND_API ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <SchoolUtilizationSelect
                              label="School level"
                              onChange={(value) =>
                                updateSchoolUtilizationControls(
                                  "level",
                                  value as SchoolUtilizationLevel,
                                )
                              }
                              options={schoolLevelOptions}
                              value={schoolUtilizationZoneControls.level}
                            />
                            <SchoolUtilizationSelect
                              label="Utilization class"
                              onChange={(value) =>
                                updateSchoolUtilizationControls(
                                  "utilizationClass",
                                  value as SchoolUtilizationClassFilter,
                                )
                              }
                              options={schoolUtilizationClassOptions}
                              value={
                                schoolUtilizationZoneControls.utilizationClass
                              }
                            />
                            {showSchoolUtilizationCounts ? (
                              <div className="col-span-2 rounded-md border border-[#5cd38f]/15 bg-[#5cd38f]/[0.045] px-2 py-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b9ffd1]">
                                  {schoolUtilizationZoneLayer.polygons.length} of{" "}
                                  {schoolUtilizationZoneLayer.totalCount} available
                                  utilization zones loaded
                                </p>
                                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                                  Displaying all renderable presentation-derived
                                  seed zones for the selected level and class.
                                </p>
                              </div>
                            ) : null}
                            {showSchoolUtilizationCounts ? (
                              <div className="col-span-2 flex flex-wrap gap-1.5">
                                <FloodCountBadge
                                  color="#38bdf8"
                                  label="Under"
                                  value={
                                    schoolUtilizationZoneLayer.classCounts
                                      .under_capacity
                                  }
                                />
                                <FloodCountBadge
                                  color="#facc15"
                                  label="Approaching"
                                  value={
                                    schoolUtilizationZoneLayer.classCounts
                                      .approaching_capacity +
                                    schoolUtilizationZoneLayer.classCounts.near_capacity
                                  }
                                />
                                <FloodCountBadge
                                  color="#f97316"
                                  label="Over"
                                  value={
                                    schoolUtilizationZoneLayer.classCounts
                                      .over_capacity
                                  }
                                />
                                <FloodCountBadge
                                  color="#ec4899"
                                  label="Severe"
                                  value={
                                    schoolUtilizationZoneLayer.classCounts
                                      .severely_over_capacity
                                  }
                                />
                              </div>
                            ) : null}
                            <div className="col-span-2 rounded-md border border-white/10 bg-black/20 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-medium uppercase text-slate-500">
                                  Legend
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Attendance zones
                                </p>
                              </div>
                              <div className="mt-2 grid gap-1.5">
                                {schoolUtilizationLegendItems.map((item) => (
                                  <div
                                    className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5"
                                    key={item.label}
                                  >
                                    <span
                                      className="h-3 w-3 shrink-0 rounded-sm border border-white/50"
                                      style={{
                                        background: item.color,
                                        boxShadow: `0 0 12px ${item.color}`,
                                      }}
                                    />
                                    <span className="min-w-0 flex-1 text-[11px] leading-4 text-slate-300">
                                      <span className="block font-semibold text-slate-200">
                                        {item.label}
                                      </span>
                                      <span className="block text-slate-500">
                                        {item.range}
                                      </span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
                                SY 2024-2025 utilization values are
                                presentation-derived from planning maps and
                                require verification against official
                                enrollment/capacity data.
                              </p>
                              <p className="mt-2 rounded border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.045] px-2 py-1.5 text-[11px] leading-5 text-[#bfefff]/80">
                                Hover zones for utilization. Click a zone for
                                details without changing the selected parcel.
                              </p>
                              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                                Attendance zones are polygon overlays, not
                                nearest-school distance. This layer is not
                                official capacity scoring.
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {schoolUtilizationZonesEnabled &&
                        schoolUtilizationZoneLayer.errorMessage ? (
                          <p className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/75">
                            {schoolUtilizationZoneLayer.errorMessage}
                          </p>
                        ) : null}
                      </article>
                    );
                  }

                  const active = isLayerActive(layer.id);
                  const unavailable =
                    isLayerPlaceholder(layer) || !layer.visibility;
                  const sourceStatusLabel = getLayerSourceStatusLabel(layer);

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
                        <span className="block text-sm font-medium leading-5 text-slate-100">
                          {layer.title}
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-slate-500">
                          {layer.description}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "max-w-full rounded border px-2 py-1 text-[10px] font-medium leading-4",
                              active
                                ? "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]"
                                : "border-white/10 bg-white/[0.025] text-slate-500",
                            )}
                          >
                            {active ? "Active" : "Hidden"}
                          </span>
                          <span className="max-w-full rounded border border-white/10 bg-white/[0.025] px-2 py-1 text-[10px] font-medium leading-4 text-slate-500">
                            {sourceStatusLabel}
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
      ) : null}
      </details>
    </section>
  );
}

function ModelResearchStatusCard({
  onOpenMethodology,
}: {
  onOpenMethodology: () => void;
}) {
  return (
    <article className="rounded-lg border border-[#68d8ff]/15 bg-[#071827]/70 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <BrainCircuit className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5 text-slate-100">
              Model Research Status
            </h3>
            <span className="rounded border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-amber-100">
              Internal Only
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Development ranking research is available in Methodology.
            Parcel-level predictions are not public or production-ready.
          </p>
        </div>
      </div>
      <button
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#bfefff] transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/15 focus:outline-none focus:ring-2 focus:ring-[#68d8ff]/25"
        onClick={onOpenMethodology}
        type="button"
      >
        Open Methodology
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}

function getLayerSourceStatusLabel(layer: OperationalLayer) {
  if (layer.sourceStatus === "live") {
    return "API";
  }

  if (layer.sourceStatus === "disabled") {
    return "Disabled";
  }

  if (layer.sourceStatus === "placeholder") {
    return "Placeholder";
  }

  if (layer.id === "county-boundary" || layer.id === "parcel-intelligence") {
    return "Reference";
  }

  return "Placeholder";
}

function LayerStatusBadge({
  active = false,
  children,
  tone = "neutral",
}: {
  active?: boolean;
  children: string;
  tone?: "gold" | "green" | "neutral" | "orange" | "red";
}) {
  const activeTone = {
    gold: "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
    green: "border-[#5cd38f]/30 bg-[#5cd38f]/10 text-[#b9ffd1]",
    neutral: "border-white/10 bg-white/[0.025] text-slate-500",
    orange: "border-[#ffb454]/30 bg-[#ffb454]/10 text-[#ffd49d]",
    red: "border-[#ff8d7a]/30 bg-[#ff8d7a]/10 text-[#ffc2b6]",
  };

  return (
    <span
      className={cn(
        "max-w-full rounded border px-2 py-1 text-[10px] font-medium leading-4",
        active ? activeTone[tone] : activeTone.neutral,
      )}
    >
      {children}
    </span>
  );
}

function HotspotAdvancedFilters({
  controls,
  onChange,
}: {
  controls: DevelopmentHotspotControls;
  onChange: <K extends keyof DevelopmentHotspotControls>(
    key: K,
    value: DevelopmentHotspotControls[K],
  ) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      className="col-span-2 rounded-md border border-white/10 bg-black/15 p-2"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Advanced filters
      </summary>
      {isOpen ? (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
          <HotspotSelect
            label="Activity"
            onChange={(value) =>
              onChange("activityClass", value as DevelopmentHotspotActivityClassFilter)
            }
            options={activityClassOptions}
            value={controls.activityClass}
          />
          <HotspotSelect
            label="Window"
            onChange={(value) =>
              onChange("recentWindow", value as DevelopmentHotspotRecentWindowFilter)
            }
            options={recentWindowOptions}
            value={controls.recentWindow}
          />
          <HotspotSelect
            label="Growth Signal"
            onChange={(value) =>
              onChange("growthSignal", value as DevelopmentHotspotGrowthSignalFilter)
            }
            options={growthSignalOptions}
            value={controls.growthSignal}
          />
          <HotspotSelect
            label="Status Stage"
            onChange={(value) =>
              onChange("statusStage", value as DevelopmentHotspotStatusStageFilter)
            }
            options={statusStageOptions}
            value={controls.statusStage}
          />
          <HotspotSelect
            label="Value Class"
            onChange={(value) =>
              onChange("valueClass", value as DevelopmentHotspotValueClassFilter)
            }
            options={valueClassOptions}
            value={controls.valueClass}
          />
          <HotspotSelect
            label="Jurisdiction"
            onChange={(value) => onChange("zoningJurisdiction", value)}
            options={zoningJurisdictionOptions}
            value={controls.zoningJurisdiction}
          />
          <HotspotSelect
            label="Sort"
            onChange={(value) =>
              onChange("sortBy", value as DevelopmentHotspotSortBy)
            }
            options={sortOptions}
            value={controls.sortBy}
          />
          <HotspotSelect
            label="Limit"
            onChange={(value) =>
              onChange("limit", Number(value) as DevelopmentHotspotLimit)
            }
            options={limitOptions.map((value) => ({
              label: String(value),
              value: String(value),
            }))}
            value={String(controls.limit)}
          />
        </div>
      ) : null}
    </details>
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

function FloodZoneSelect({
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
        aria-label={`FEMA flood zone ${label.toLowerCase()} filter`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#ffb454]/55 focus:ring-2 focus:ring-[#ffb454]/15"
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

function SchoolUtilizationSelect({
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
        aria-label={`School utilization ${label.toLowerCase()} control`}
        className="h-8 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-slate-100 outline-none transition hover:border-white/20 focus:border-[#5cd38f]/55 focus:ring-2 focus:ring-[#5cd38f]/15"
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

function formatSchoolLevelLabel(value: SchoolUtilizationLevel) {
  switch (value) {
    case "all":
      return "all-level";
    case "elementary":
      return "elementary";
    case "middle":
      return "middle";
    case "high":
      return "high";
  }
}

function getPermitSegmentLabel(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  return (
    permitSegmentOptions.find((option) => option.value === value)?.label ??
    "Permit Segment"
  );
}

function getPermitSegmentLegendColor(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  switch (value) {
    case "residential_growth":
      return "#68d8ff";
    case "commercial_activity":
      return "#ffb454";
    case "redevelopment_signal":
      return "#bc8bff";
    case "minor_maintenance":
      return "#94a3b8";
    case "demolition":
      return "#b91c1c";
    case "industrial_activity":
      return "#d6a146";
    case "institutional_activity":
      return "#5cd38f";
    default:
      return "#64748b";
  }
}

function getPermitSegmentLegendShape(
  value: DevelopmentHotspotPermitSegmentFilter | null,
) {
  switch (value) {
    case "commercial_activity":
    case "industrial_activity":
      return "square";
    case "redevelopment_signal":
      return "kite";
    case "demolition":
      return "x";
    case "institutional_activity":
      return "triangle";
    default:
      return "circle";
  }
}

function LayerLegendMarker({
  color,
  shape,
  size,
}: {
  color: string;
  shape: string;
  size: string;
}) {
  if (shape === "triangle") {
    return (
      <span
        aria-hidden="true"
        className="h-0 w-0 shrink-0 border-x-[6px] border-b-[11px] border-x-transparent drop-shadow-[0_0_9px_currentColor]"
        style={{
          borderBottomColor: color,
          color,
        }}
      />
    );
  }

  if (shape === "kite") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rotate-45 border border-white/70 shadow-[0_0_14px_currentColor]",
          size,
        )}
        style={{
          background: color,
          color,
        }}
      />
    );
  }

  if (shape === "square") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 border border-white/70 shadow-[0_0_14px_currentColor]",
          size,
        )}
        style={{
          background: color,
          color,
        }}
      />
    );
  }

  if (shape === "x") {
    return (
      <span
        aria-hidden="true"
        className="relative h-4 w-4 shrink-0 text-current"
        style={{ color }}
      >
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rotate-45 rounded-full bg-current shadow-[0_0_12px_currentColor]" />
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 -rotate-45 rounded-full bg-current shadow-[0_0_12px_currentColor]" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 rounded-full border border-white/70 shadow-[0_0_14px_currentColor]",
        size,
      )}
      style={{
        background: color,
        color,
      }}
    />
  );
}

function FloodCountBadge({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.025] px-1.5 py-1 text-[10px] font-medium uppercase text-slate-300">
      <span
        className="h-2 w-2 rounded-full shadow-[0_0_12px_currentColor]"
        style={{
          background: color,
          color,
        }}
      />
      {value} {label}
    </span>
  );
}
