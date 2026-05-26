import {
  AlertTriangle,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Satellite,
  Sparkles,
} from "lucide-react";
import type { DashboardStatus, ParcelSummary } from "@/types";

interface MapViewportPlaceholderProps {
  children: React.ReactNode;
  mapStatus: DashboardStatus;
  sceneError?: string | null;
  selectedParcel: ParcelSummary | null;
}

export function MapViewportPlaceholder({
  children,
  mapStatus,
  sceneError,
  selectedParcel,
}: MapViewportPlaceholderProps) {
  const isLoading = mapStatus === "idle" || mapStatus === "loading";
  const hasError = mapStatus === "degraded";

  return (
    <section className="relative h-full min-h-[58vh] overflow-hidden rounded-lg border border-white/10 bg-[#050911] shadow-[0_28px_120px_rgba(0,0,0,0.46)] lg:min-h-0">
      {children}
      <div className="scene-mask pointer-events-none absolute inset-0" />
      <div className="map-scanline pointer-events-none absolute inset-0 opacity-40" />

      {(isLoading || hasError) && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
          <div className="max-w-sm rounded-lg border border-white/10 bg-[#060b12]/82 p-4 text-center shadow-2xl backdrop-blur-xl">
            {hasError ? (
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-200" />
            ) : (
              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-[#d8b86a]" />
            )}
            <p className="mt-3 text-sm font-semibold text-white">
              {hasError ? "SceneView unavailable" : "Initializing SceneView"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {hasError
                ? sceneError ?? "ArcGIS scene initialization did not complete."
                : "Loading the Cabarrus County 3D operating scene."}
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg border border-white/10 bg-[#060b12]/72 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-[#d8b86a]" />
          <p className="text-xs font-medium uppercase text-slate-400">
            Cabarrus 3D Scene
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[#f0cd79]">
            {mapStatus === "online" ? "Live Scene" : "Scene Standby"}
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            Concord origin
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            Mock parcels
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="rounded-lg border border-white/10 bg-[#060b12]/74 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
            <MousePointer2 className="h-3.5 w-3.5 text-[#68d8ff]" />
            Active Selection
          </div>
          <p className="mt-1 text-lg font-semibold text-white">
            {selectedParcel?.parcelId ?? "No parcel selected"}
          </p>
          <p className="text-xs text-slate-400">
            {selectedParcel?.address ?? "Awaiting map or dashboard selection"}
          </p>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-[#060b12]/74 text-center backdrop-blur-xl">
          <SceneStat
            label="Opportunity"
            value={selectedParcel?.opportunityScore ?? null}
          />
          <SceneStat
            label="Pressure"
            value={selectedParcel?.developmentPressure ?? null}
          />
          <SceneStat
            label="Readiness"
            value={selectedParcel?.infrastructureReadiness ?? null}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 hidden items-center gap-2 rounded-lg border border-white/10 bg-[#060b12]/72 p-2 backdrop-blur-xl md:flex">
        <Sparkles className="h-4 w-4 text-[#8fe7ff]" />
        <div className="h-5 w-px bg-white/10" />
        <Maximize2 className="h-4 w-4 text-slate-300" />
      </div>
    </section>
  );
}

function SceneStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-[92px] border-r border-white/10 px-3 py-2 last:border-r-0">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value ?? "--"}</p>
    </div>
  );
}
