import {
  AlertTriangle,
  LoaderCircle,
  MousePointer2,
  RotateCcw,
  Satellite,
} from "lucide-react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";
import type { ParcelSummary } from "@/types";

interface ActiveParcelFocusSummary {
  boundaryHighlighted: boolean;
  officialParcelId: string;
  statusMessage: string;
}

type ActiveSelectionStat = {
  label: string;
  value: number | string | null;
};

export type MapRendererMode =
  | "fatal"
  | "interactive_loading"
  | "interactive_ready"
  | "static_degraded"
  | "static_loading"
  | "static_ready";

interface ActiveSelectionDisplay {
  focusStatus: string | null;
  stats: [ActiveSelectionStat, ActiveSelectionStat, ActiveSelectionStat];
  subtitle: string;
  title: string;
}

interface MapViewportPlaceholderProps {
  children: React.ReactNode;
  contextReady: boolean;
  interactiveEnabled: boolean;
  onRetryInteractiveMap: () => void;
  parcelFocusSummary?: ActiveParcelFocusSummary | null;
  sceneError?: string | null;
  selectedParcel: ParcelSummary | null;
  selectedParcelId?: string | null;
  selectedParcelIntelligence?: ParcelSearchRecord | null;
  selectedParcelIntelligenceSource?: SelectedParcelIntelligenceSource | null;
  rendererMode: MapRendererMode;
}

export function MapViewportPlaceholder({
  children,
  contextReady,
  interactiveEnabled,
  onRetryInteractiveMap,
  parcelFocusSummary,
  sceneError,
  selectedParcel,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  rendererMode,
}: MapViewportPlaceholderProps) {
  const isLoading = rendererMode === "static_loading";
  const isFatal = rendererMode === "fatal";
  const isEnhancing = rendererMode === "interactive_loading";
  const enhancementFailed = rendererMode === "static_degraded";
  const activeSelection = getActiveSelectionDisplay({
    parcelFocusSummary,
    selectedParcel,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
  });

  return (
    <section
      aria-label="Cabarrus County 2D map viewport"
      className="relative h-full min-h-[58vh] overflow-hidden rounded-lg border border-white/10 bg-[#050911] shadow-[0_28px_120px_rgba(0,0,0,0.46)] md:min-h-[62vh] lg:min-h-0"
    >
      {children}
      <div className="scene-mask pointer-events-none absolute inset-0 z-20" />
      <div className="map-scanline pointer-events-none absolute inset-0 z-20 opacity-40" />

      {(isLoading || isFatal) && !contextReady && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-40 grid place-items-center px-6"
          role={isFatal ? "alert" : "status"}
        >
          <div className="max-w-sm rounded-lg border border-white/10 bg-[#060b12]/82 p-4 text-center shadow-2xl backdrop-blur-xl">
            {isFatal ? (
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-200" />
            ) : (
              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-[#d8b86a]" />
            )}
            <p className="mt-3 text-sm font-semibold text-white">
              {isFatal
                ? "Cabarrus County map unavailable"
                : "Loading Cabarrus County map\u2026"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {isFatal
                ? sceneError ?? "Required county map context could not be rendered."
                : "Preparing same-origin county, road, water, and place context."}
            </p>
            <p className="mt-2 text-[10px] uppercase text-slate-500">
              Same-origin Cabarrus County geography
            </p>
            {isFatal ? (
              <button
                className="pointer-events-auto mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#f0cd79] transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/70"
                onClick={onRetryInteractiveMap}
                title="Retry Cabarrus County map"
                type="button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry county map
              </button>
            ) : null}
          </div>
        </div>
      )}

      {contextReady && interactiveEnabled && (isEnhancing || enhancementFailed) ? (
        <div
          aria-live="polite"
          className="pointer-events-auto absolute right-3 top-16 z-50 max-w-[min(19rem,calc(100%-1.5rem))] rounded-md border border-white/15 bg-[#06101a]/92 p-3 shadow-2xl backdrop-blur-xl sm:right-4"
          role="status"
        >
          <div className="flex items-start gap-2">
            {enhancementFailed ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            ) : (
              <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#d8b86a]" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">
                {enhancementFailed
                  ? "Interactive enhancement unavailable"
                  : "Enhancing interactive map\u2026"}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-300">
                {enhancementFailed
                  ? "The CFS map and analytical overlays remain available."
                  : "The Cabarrus County map remains fully visible while enhancement loads."}
              </p>
              {enhancementFailed ? (
                <button
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#f0cd79] transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/70"
                  onClick={onRetryInteractiveMap}
                  title="Retry interactive map"
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry interactive map
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 z-40 max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-[#060b12]/72 p-3 shadow-2xl backdrop-blur-xl sm:left-4 sm:top-4 sm:max-w-[calc(100%-2rem)]">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-[#d8b86a]" />
          <p className="text-xs font-medium uppercase text-slate-400">
            Cabarrus 2D Map
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[#f0cd79]">
            {rendererMode === "interactive_ready"
              ? "Interactive Map Ready"
              : contextReady
                ? "Cabarrus County Map"
                : "Map Standby"}
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            County extent
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            Live overlays
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-40 flex flex-col gap-3 sm:bottom-4 sm:left-4 sm:right-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 rounded-lg border border-white/10 bg-[#060b12]/74 p-3 backdrop-blur-xl md:max-w-[58%]">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
            <MousePointer2 className="h-3.5 w-3.5 text-[#68d8ff]" />
            Active Selection
          </div>
          <p className="mt-1 truncate text-lg font-semibold text-white">
            {activeSelection.title}
          </p>
          <p className="truncate text-xs text-slate-400">
            {activeSelection.subtitle}
          </p>
          {activeSelection.focusStatus ? (
            <p className="mt-2 inline-flex max-w-full truncate rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9ee8ff]">
              {activeSelection.focusStatus}
            </p>
          ) : null}
        </div>

        <div className="grid w-full grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-[#060b12]/74 text-center backdrop-blur-xl md:w-auto">
          <SceneStat
            label={activeSelection.stats[0].label}
            value={activeSelection.stats[0].value}
          />
          <SceneStat
            label={activeSelection.stats[1].label}
            value={activeSelection.stats[1].value}
          />
          <SceneStat
            label={activeSelection.stats[2].label}
            value={activeSelection.stats[2].value}
          />
        </div>
      </div>

    </section>
  );
}

function SceneStat({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div className="min-w-0 border-r border-white/10 px-2 py-2 last:border-r-0 sm:min-w-[92px] sm:px-3">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-lg text-white">
        {value ?? "--"}
      </p>
    </div>
  );
}

function getActiveSelectionDisplay({
  parcelFocusSummary,
  selectedParcel,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
}: {
  parcelFocusSummary?: ActiveParcelFocusSummary | null;
  selectedParcel: ParcelSummary | null;
  selectedParcelId?: string | null;
  selectedParcelIntelligence?: ParcelSearchRecord | null;
  selectedParcelIntelligenceSource?: SelectedParcelIntelligenceSource | null;
}): ActiveSelectionDisplay {
  if (selectedParcelIntelligence) {
    const location = [
      selectedParcelIntelligence.neighborhood,
      selectedParcelIntelligence.subdivision,
    ]
      .filter(Boolean)
      .join(" / ");
    const focusStatus =
      parcelFocusSummary?.officialParcelId ===
      selectedParcelIntelligence.officialParcelId
        ? normalizeStatusMessage(parcelFocusSummary.statusMessage)
        : "Selected parcel loaded";

    return {
      focusStatus,
      stats: [
        {
          label: "Zoning",
          value:
            selectedParcelIntelligence.zoningCode ??
            formatLabel(selectedParcelIntelligence.zoningCategory),
        },
        {
          label: "Quality",
          value: formatLabel(selectedParcelIntelligence.parcelQualityStatus),
        },
        {
          label: "Source",
          value: formatSource(selectedParcelIntelligenceSource),
        },
      ],
      subtitle:
        selectedParcelIntelligence.ownerName ??
        (location || "Live parcel intelligence selected"),
      title: selectedParcelIntelligence.officialParcelId,
    };
  }

  if (selectedParcel) {
    return {
      focusStatus: selectedParcelId ? "Mock parcel selected" : null,
      stats: [
        { label: "Opportunity", value: selectedParcel.opportunityScore },
        { label: "Pressure", value: selectedParcel.developmentPressure },
        { label: "Readiness", value: selectedParcel.infrastructureReadiness },
      ],
      subtitle: selectedParcel.address,
      title: selectedParcel.parcelId,
    };
  }

  if (selectedParcelId) {
    const focusStatus =
      parcelFocusSummary?.officialParcelId === selectedParcelId
        ? normalizeStatusMessage(parcelFocusSummary.statusMessage)
        : "Selection pending detail";

    return {
      focusStatus,
      stats: [
        { label: "Zoning", value: null },
        { label: "Quality", value: null },
        { label: "Source", value: "Pending" },
      ],
      subtitle: "Loading parcel intelligence",
      title: selectedParcelId,
    };
  }

  return {
    focusStatus: null,
    stats: [
      { label: "Zoning", value: null },
      { label: "Quality", value: null },
      { label: "Source", value: null },
    ],
    subtitle: "Awaiting map or dashboard selection",
    title: "No parcel selected",
  };
}

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatSource(
  source: SelectedParcelIntelligenceSource | null | undefined,
) {
  if (source === "api") {
    return "API";
  }

  if (source === "fallback") {
    return "Fallback";
  }

  if (source === "static") {
    return "Static";
  }

  return "Selected";
}

function normalizeStatusMessage(message: string) {
  return message.replace(/[.]+$/, "");
}
