"use client";

import type Graphic from "@arcgis/core/Graphic";
import type Layer from "@arcgis/core/layers/Layer";
import { AlertTriangle, Loader2, MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import {
  createCfsResultSceneView,
  destroyCfsResultSceneView,
  type CfsResultSceneView,
} from "@/lib/gis/sceneViewFactory";

export interface ManagementMapMarker {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  tone: "hotspot" | "signal";
}

export function ManagementMapPreview({
  ariaLabel,
  markers,
  onSelect,
  testId,
}: {
  ariaLabel: string;
  markers: readonly ManagementMapMarker[];
  onSelect: (marker: ManagementMapMarker) => void;
  testId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !markers.length) return;
    const controller = new AbortController();
    let cancelled = false;
    let clickHandle: { remove: () => void } | null = null;
    let scene: CfsResultSceneView | null = null;
    setState("loading");
    setError(null);

    void (async () => {
      try {
        const runtime = await loadArcGISRuntime();
        if (cancelled) return;
        const resultLayer = new runtime.GraphicsLayer({
          id: testId,
          title: ariaLabel,
        });
        const graphics = markers.map(
          (marker) =>
            new runtime.Graphic({
              attributes: { markerId: marker.id },
              geometry: new runtime.Point({
                latitude: marker.latitude,
                longitude: marker.longitude,
                spatialReference: { wkid: 4326 },
              }),
              symbol: markerSymbol(marker.tone) as never,
            }),
        );
        resultLayer.addMany(graphics);
        scene = createCfsResultSceneView(runtime, container, resultLayer);
        await scene.view.when();
        const basemap = scene.map.basemap;
        if (!basemap) throw new Error("Management basemap could not initialize.");
        const basemapSignal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]);
        try {
          await scene.visualBasemapLayer.load({ signal: basemapSignal });
          await scene.visualBasemapLayer.fetchTile(10, 404, 282, {
            signal: basemapSignal,
          });
          if (cancelled || basemapSignal.aborted) return;
          basemap.baseLayers.add(scene.visualBasemapLayer, 0);
          const layerView = await scene.view.whenLayerView(
            scene.visualBasemapLayer as Layer,
          );
          await runtime.reactiveUtils.whenOnce(
            () => !layerView.updating,
            basemapSignal,
          );
        } catch {
          basemap.baseLayers.remove(scene.visualBasemapLayer);
          if (!scene.visualBasemapLayer.destroyed) {
            scene.visualBasemapLayer.destroy();
          }
          if (cancelled || controller.signal.aborted) return;
        }
        clickHandle = scene.view.on("click", (event) => {
          void scene?.view
            .hitTest(event, { include: [resultLayer] })
            .then((response) => {
              if (!scene || cancelled || scene.view.destroyed) return;
              const selected = (
                response.results as Array<{ graphic?: Graphic }>
              ).find((result) => result.graphic?.layer?.id === resultLayer.id)
                ?.graphic;
              const marker = markers.find(
                (candidate) => candidate.id === selected?.attributes?.markerId,
              );
              scene.view.graphics.removeAll();
              if (!marker || !selected?.geometry) return;
              scene.view.graphics.add(
                new runtime.Graphic({
                  geometry: selected.geometry,
                  symbol: selectedSymbol() as never,
                }),
              );
              onSelectRef.current(marker);
            })
            .catch(() => undefined);
        });
        if (!cancelled) setState("ready");
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Management map could not start.",
        );
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clickHandle?.remove();
      destroyCfsResultSceneView(scene);
    };
  }, [ariaLabel, markers, testId]);

  if (!markers.length) {
    return (
      <MapMessage
        detail="Current records do not include map-safe locations."
        title="Geographic preview unavailable"
      />
    );
  }

  return (
    <div
      className="relative h-[21rem] overflow-hidden rounded-xl border border-white/10 bg-[#050911]"
      data-map-state={state}
      data-testid={testId}
    >
      <div aria-label={ariaLabel} className="absolute inset-0" ref={containerRef} />
      {state !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#050911]/72 p-6 text-center backdrop-blur-sm">
          <div className="max-w-sm rounded-lg border border-white/10 bg-[#07111f]/90 p-4">
            {state === "loading" ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#9bd1de]" />
            ) : (
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-200" />
            )}
            <p className="mt-2 text-sm font-semibold text-white">
              {state === "loading" ? "Loading county context…" : "Map unavailable"}
            </p>
            {error ? (
              <p className="mt-1 text-xs leading-5 text-slate-400">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MapMessage({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#07111f]/88 p-8 text-center">
      <MapPinned className="mx-auto h-5 w-5 text-slate-500" />
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function markerSymbol(tone: ManagementMapMarker["tone"]) {
  return {
    color: tone === "hotspot" ? [223, 207, 145, 0.88] : [130, 201, 216, 0.88],
    outline: { color: [255, 255, 255, 0.9], width: 1 },
    size: tone === "hotspot" ? 10 : 9,
    type: "simple-marker",
  };
}

function selectedSymbol() {
  return {
    color: [240, 205, 121, 1],
    outline: { color: [255, 255, 255, 1], width: 2 },
    size: 15,
    type: "simple-marker",
  };
}
