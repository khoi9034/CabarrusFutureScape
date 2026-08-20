"use client";

import { AlertTriangle, Loader2, Map as MapIcon } from "lucide-react";
import type Graphic from "@arcgis/core/Graphic";
import type Layer from "@arcgis/core/layers/Layer";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadArcGISRuntime, type ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import {
  createCfsResultSceneView,
  destroyCfsResultSceneView,
  type CfsResultSceneView,
} from "@/lib/gis/sceneViewFactory";
import type {
  MasterDataFeatureCollection,
  MasterDataGeoJsonGeometry,
} from "@/lib/master-data/types";

const MAX_MAP_FEATURES = 250;

export function MasterDataMapPreview({
  featureCollection,
  limited,
  total,
}: {
  featureCollection: MasterDataFeatureCollection;
  limited: boolean;
  total: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const features = useMemo(
    () => featureCollection.features
      .filter((feature): feature is typeof feature & { geometry: MasterDataGeoJsonGeometry } => feature.geometry !== null)
      .slice(0, MAX_MAP_FEATURES),
    [featureCollection],
  );
  const sampleLimited = limited || featureCollection.features.length > MAX_MAP_FEATURES;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !features.length) return;
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
          id: "master-data-query-result",
          title: "Master Data query result",
        });
        const graphics = features.flatMap((feature) =>
          graphicsForFeature(runtime, feature.geometry, feature.properties),
        );
        resultLayer.addMany(graphics);
        scene = createCfsResultSceneView(runtime, container, resultLayer);
        await scene.view.when();
        const visualLayer = scene.visualBasemapLayer;
        const basemap = scene.map.basemap;
        if (!basemap) throw new Error("Master Data basemap could not initialize.");
        const basemapSignal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]);
        try {
          await visualLayer.load({ signal: basemapSignal });
          await visualLayer.fetchTile(10, 404, 282, { signal: basemapSignal });
          if (cancelled || basemapSignal.aborted) return;
          basemap.baseLayers.add(visualLayer, 0);
          const layerView = await scene.view.whenLayerView(visualLayer as Layer);
          await runtime.reactiveUtils.whenOnce(
            () => !layerView.updating,
            basemapSignal,
          );
        } catch {
          basemap.baseLayers.remove(visualLayer);
          if (!visualLayer.destroyed) visualLayer.destroy();
          if (cancelled || controller.signal.aborted) return;
        }
        if (graphics.length) await scene.view.goTo(graphics, { animate: false });
        clickHandle = scene.view.on("click", (event) => {
          void scene?.view.hitTest(event, { include: [resultLayer] }).then((response) => {
            if (!scene || cancelled || scene.view.destroyed) return;
            const selected = (response.results as Array<{ graphic?: Graphic }>).find(
              (result) => result.graphic?.layer?.id === resultLayer.id,
            )?.graphic;
            scene.view.graphics.removeAll();
            if (!selected?.geometry) return;
            scene.view.graphics.add(new runtime.Graphic({
              attributes: selected.attributes,
              geometry: selected.geometry,
              symbol: selectionSymbol(selected.geometry.type) as never,
            }));
          }).catch(() => undefined);
        });
        if (!cancelled) setState("ready");
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Spatial preview could not start.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clickHandle?.remove();
      destroyCfsResultSceneView(scene);
    };
  }, [features]);

  if (!features.length) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#07111f]/88 p-8 text-center" data-testid="master-data-map-preview">
        <MapIcon className="mx-auto h-5 w-5 text-slate-500" />
        <p className="mt-2 text-sm font-semibold text-white">No matched geometry in this result</p>
        <p className="mt-1 text-xs text-slate-500">Rows remain available in the table and exports; there is no geometry to draw on this map preview.</p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-white/10 bg-[#07111f]/88"
      data-map-state={state}
      data-mapped-feature-count={features.length}
      data-testid="master-data-map-preview"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8fe7ff]"><MapIcon className="h-3.5 w-3.5" /> Spatial preview</p>
          <p className="mt-1 text-sm text-slate-400">
            {features.length.toLocaleString()} mapped feature{features.length === 1 ? "" : "s"}
            {sampleLimited ? ` from ${total.toLocaleString()} matching records` : ""}
          </p>
        </div>
        {sampleLimited ? <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100">Bounded sample</span> : null}
      </header>
      <div className="relative h-[24rem] bg-[#050911]">
        <div aria-label="Master Data ArcGIS MapView" className="absolute inset-0" ref={containerRef} />
        {state !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#050911]/72 p-6 text-center backdrop-blur-sm">
            <div className="max-w-sm rounded-lg border border-white/10 bg-[#07111f]/90 p-4">
              {state === "loading" ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#8fe7ff]" /> : <AlertTriangle className="mx-auto h-5 w-5 text-amber-200" />}
              <p className="mt-2 text-sm font-semibold text-white">{state === "loading" ? "Loading spatial preview…" : "Spatial preview unavailable"}</p>
              {error ? <p className="mt-1 text-xs leading-5 text-slate-400">{error}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function graphicsForFeature(
  runtime: ArcGISRuntime,
  geometry: MasterDataGeoJsonGeometry,
  properties: Record<string, unknown>,
) {
  const symbol = geometry.type === "Point"
    ? { color: [104, 216, 255, 0.9], outline: { color: [255, 255, 255, 0.9], width: 1 }, size: 8, type: "simple-marker" }
    : { color: [104, 216, 255, 0.2], outline: { color: [104, 216, 255, 0.9], width: 1.2 }, type: "simple-fill" };
  const arcgisGeometry = toArcGisGeometry(runtime, geometry);
  return arcgisGeometry
    ? [new runtime.Graphic({ attributes: properties, geometry: arcgisGeometry, symbol: symbol as never })]
    : [];
}

function selectionSymbol(geometryType: string) {
  return geometryType === "point"
    ? { color: [240, 205, 121, 1], outline: { color: [255, 255, 255, 1], width: 1.5 }, size: 12, type: "simple-marker" }
    : { color: [240, 205, 121, 0.32], outline: { color: [255, 238, 178, 1], width: 2.4 }, type: "simple-fill" };
}

function toArcGisGeometry(runtime: ArcGISRuntime, geometry: MasterDataGeoJsonGeometry) {
  if (geometry.type === "Point" && isPosition(geometry.coordinates)) {
    return new runtime.Point({
      latitude: geometry.coordinates[1],
      longitude: geometry.coordinates[0],
      spatialReference: { wkid: 4326 },
    });
  }
  if (geometry.type === "Polygon" && isPolygonCoordinates(geometry.coordinates)) {
    return new runtime.Polygon({ rings: geometry.coordinates, spatialReference: { wkid: 4326 } });
  }
  if (geometry.type === "MultiPolygon" && isMultiPolygonCoordinates(geometry.coordinates)) {
    return new runtime.Polygon({ rings: geometry.coordinates.flat(), spatialReference: { wkid: 4326 } });
  }
  return null;
}

function isPosition(value: unknown): value is [number, number, ...number[]] {
  return Array.isArray(value) && value.length >= 2 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isPolygonCoordinates(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.every((ring) => Array.isArray(ring) && ring.every(isPosition));
}

function isMultiPolygonCoordinates(value: unknown): value is number[][][][] {
  return Array.isArray(value) && value.every(isPolygonCoordinates);
}
