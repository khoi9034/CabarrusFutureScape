"use client";

import type Graphic from "@arcgis/core/Graphic";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type SceneView from "@arcgis/core/views/SceneView";
import { useEffect, useRef, useState } from "react";
import { MapViewportPlaceholder } from "@/components/gis/MapViewportPlaceholder";
import { useDashboardState } from "@/hooks/useDashboardState";
import {
  loadArcGISRuntime,
  type ArcGISRuntime,
} from "@/lib/gis/arcgisRuntime";
import {
  updateSelectedParcelSymbols,
} from "@/lib/gis/mockSceneLayers";
import {
  applyOperationalLayerVisibility,
  createOperationalLayers,
  getMockGraphicsLayerSubset,
  getRenderableOperationalLayers,
  type OperationalLayerInstanceMap,
} from "@/lib/gis/layerFactory";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import { createMapInteractionController } from "@/lib/gis/mapInteractionController";
import { createCabarrusSceneView } from "@/lib/gis/sceneViewFactory";
import {
  CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
  dispatchParcelMapFocusResult,
  resolveParcelMapFocus,
} from "@/lib/map/parcelMapFocus";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import type {
  ParcelMapFocus,
  ParcelMapFocusRequestEventDetail,
} from "@/types/map/parcelFocus";

type ArcGISHandle = {
  remove: () => void;
};

interface ParcelFocusBeacon {
  officialParcelId: string;
  pin14?: string | null;
}

export function SceneViewContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const layerRefs = useRef<OperationalLayerInstanceMap>({});
  const focusLayerRef = useRef<GraphicsLayer | null>(null);
  const lastFocusedParcelIdRef = useRef<string | null>(null);
  const latestFocusRequestParcelIdRef = useRef<string | null>(null);
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const activeLayerIdsRef = useRef<string[]>([]);
  const focusBeaconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [focusBeacon, setFocusBeacon] = useState<ParcelFocusBeacon | null>(
    null,
  );
  const {
    activeLayerIds,
    clearMapError,
    clearSelectedParcel,
    mapStatus,
    mapError,
    selectedParcel,
    selectedParcelId,
    selectParcel,
    setMapError,
    setMapStatus,
  } = useDashboardState();
  const selectedParcelIdRef = useRef(selectedParcelId);

  useEffect(() => {
    activeLayerIdsRef.current = activeLayerIds;
  }, [activeLayerIds]);

  useEffect(() => {
    selectedParcelIdRef.current = selectedParcelId;
  }, [selectedParcelId]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    let clickHandle: ArcGISHandle | null = null;
    let focusEventHandler: ((event: Event) => void) | null = null;
    let hoverHandle: ArcGISHandle | null = null;
    let localView: SceneView | null = null;

    async function applyParcelFocus(focus: ParcelMapFocus) {
      const focusResult = resolveParcelMapFocus(focus);
      const previousFocusId = lastFocusedParcelIdRef.current;

      logParcelMapFocusDiagnostic("SceneView received focus request", {
        canFocus: focusResult.canFocus,
        centroid: focus.centroid,
        extent: focus.extent,
        focusStatus: focusResult.focusStatus,
        hasSceneView: Boolean(viewRef.current),
        hasRuntime: Boolean(runtimeRef.current),
        highlightGeometryType: focus.highlightGeometry?.type ?? null,
        officialParcelId: focus.officialParcelId,
        previousFocusId,
      });

      if (!focusResult.canFocus) {
        dispatchParcelMapFocusResult({
          focusStatus: focusResult.focusStatus,
          message: focusResult.message,
          officialParcelId: focus.officialParcelId,
        });
        return;
      }

      const view = viewRef.current;
      const runtime = runtimeRef.current;

      if (!focus.centroid && !focus.extent) {
        dispatchParcelMapFocusResult({
          focusStatus: "unsupported",
          message:
            "SceneView parcel focus currently supports centroid or extent targets only.",
          officialParcelId: focus.officialParcelId,
        });
        return;
      }

      if (!view || view.destroyed || !runtime) {
        dispatchParcelMapFocusResult({
          focusStatus: "failed",
          message:
            "SceneView is not ready, so parcel map focus could not run.",
          officialParcelId: focus.officialParcelId,
        });
        return;
      }

      try {
        latestFocusRequestParcelIdRef.current = focus.officialParcelId;
        const focusLayer = ensureParcelFocusLayer(runtime, view);
        const focusGraphics = createParcelFocusGraphics(runtime, focus);
        const boundaryGraphic = focusGraphics.find(
          (graphic) => graphic.attributes?.graphicRole === "parcel-boundary",
        );

        focusLayerRef.current = focusLayer;
        focusLayer.removeAll();

        if (focusGraphics.length) {
          focusGraphics.forEach((graphic) => focusLayer.add(graphic));
        }

        logParcelMapFocusDiagnostic("SceneView focus graphic prepared", {
          boundaryCreated: Boolean(boundaryGraphic),
          graphicCount: focusGraphics.length,
          layerId: focusLayer.id,
          layerVisible: focusLayer.visible,
          officialParcelId: focus.officialParcelId,
        });

        const goToTarget = buildParcelFocusGoToTarget(runtime, focus);
        const goToDiagnostic = {
          currentCenterBeforeGoTo: describeSceneViewCenter(view),
          currentZoomBeforeGoTo: view.zoom,
          goToCentroid: focus.centroid
            ? {
                latitude: focus.centroid.latitude,
                longitude: focus.centroid.longitude,
                wkid: focus.centroid.spatialReference?.wkid ?? 4326,
              }
            : null,
          goToExtent: focus.extent
            ? {
                xmax: focus.extent.xmax,
                xmin: focus.extent.xmin,
                ymax: focus.extent.ymax,
                ymin: focus.extent.ymin,
                wkid: focus.extent.spatialReference?.wkid ?? 4326,
              }
            : null,
          goToCalled: true,
          highlightGeometryType: focus.highlightGeometry?.type ?? null,
          officialParcelId: focus.officialParcelId,
          previousFocusId,
          target: describeParcelFocusGoToTarget(focus),
        };

        recordSceneViewFocusDebug("SceneView goTo start", goToDiagnostic);
        logParcelMapFocusDiagnostic("SceneView goTo start", goToDiagnostic);

        await view.goTo(goToTarget, {
          animate: true,
          duration: 900,
        });

        if (latestFocusRequestParcelIdRef.current !== focus.officialParcelId) {
          logParcelMapFocusDiagnostic("stale SceneView focus result ignored", {
            latestFocusRequestParcelId:
              latestFocusRequestParcelIdRef.current,
            officialParcelId: focus.officialParcelId,
          });
          return;
        }

        const goToSuccessDiagnostic = {
          currentCenterAfterGoTo: describeSceneViewCenter(view),
          currentZoomAfterGoTo: view.zoom,
          goToResolved: true,
          parcelBoundaryHighlighted: Boolean(boundaryGraphic),
          officialParcelId: focus.officialParcelId,
          previousFocusId,
        };

        recordSceneViewFocusDebug(
          "SceneView goTo success",
          goToSuccessDiagnostic,
        );
        logParcelMapFocusDiagnostic(
          "SceneView goTo success",
          goToSuccessDiagnostic,
        );
        lastFocusedParcelIdRef.current = focus.officialParcelId;

        setFocusBeacon({
          officialParcelId: focus.officialParcelId,
          pin14: focus.pin14,
        });
        if (focusBeaconTimeoutRef.current) {
          clearTimeout(focusBeaconTimeoutRef.current);
        }
        focusBeaconTimeoutRef.current = setTimeout(() => {
          setFocusBeacon(null);
          focusBeaconTimeoutRef.current = null;
        }, 12000);

        dispatchParcelMapFocusResult({
          focusStatus: "focused",
          message: boundaryGraphic
            ? "Parcel boundary highlighted."
            : "Focused on map — boundary unavailable.",
          officialParcelId: focus.officialParcelId,
        });
      } catch (focusError) {
        if (latestFocusRequestParcelIdRef.current !== focus.officialParcelId) {
          return;
        }

        console.error("Parcel SceneView focus failed", focusError);
        const goToFailureDiagnostic = {
          error:
            focusError instanceof Error
              ? focusError.message
              : "SceneView parcel focus failed.",
          goToRejected: true,
          officialParcelId: focus.officialParcelId,
          previousFocusId,
        };

        recordSceneViewFocusDebug("SceneView goTo failed", goToFailureDiagnostic);
        logParcelMapFocusDiagnostic(
          "SceneView goTo failed",
          goToFailureDiagnostic,
        );
        dispatchParcelMapFocusResult({
          focusStatus: "failed",
          message:
            focusError instanceof Error
              ? focusError.message
              : "SceneView parcel focus failed.",
          officialParcelId: focus.officialParcelId,
        });
      }
    }

    async function initializeScene(container: HTMLDivElement) {
      clearMapError();
      setMapStatus("loading");

      try {
        const runtime = await loadArcGISRuntime();
        runtimeRef.current = runtime;

        if (cancelled) {
          return;
        }

        const { map, view } = createCabarrusSceneView(runtime, container);
        localView = view;
        viewRef.current = view;

        await view.when();

        if (cancelled) {
          view.destroy();
          return;
        }

        const { layers } = createOperationalLayers(
          runtime,
          operationalLayerRegistry,
        );
        map.addMany(getRenderableOperationalLayers(layers));
        focusLayerRef.current = createParcelFocusLayer(runtime);
        map.add(focusLayerRef.current);
        layerRefs.current = layers;
        applyOperationalLayerVisibility(layers, activeLayerIdsRef.current);
        updateSelectedParcelSymbols(
          getMockGraphicsLayerSubset(layers, operationalLayerRegistry),
          selectedParcelIdRef.current,
        );

        const interactionController = createMapInteractionController({
          emptyClickBehavior: "preserve-selection",
          getActiveLayerIds: () => activeLayerIdsRef.current,
          onError: (error) => {
            console.error("ArcGIS map interaction failed", error);
          },
          onSelection: (event) => {
            if (event.action === "select" && event.parcelId) {
              selectParcel(event.parcelId, { source: event.source });
              return;
            }

            if (event.action === "clear") {
              clearSelectedParcel();
            }
          },
          view,
        });

        clickHandle = view.on("click", (event) => {
          void interactionController.handleClick(event);
        });
        hoverHandle = view.on("pointer-move", (event) => {
          interactionController.handleHover(event);
        });
        focusEventHandler = (event: Event) => {
          const detail = (
            event as CustomEvent<ParcelMapFocusRequestEventDetail>
          ).detail;

          if (detail?.focus) {
            void applyParcelFocus(detail.focus);
          }
        };
        window.addEventListener(
          CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
          focusEventHandler,
        );
        logParcelMapFocusDiagnostic("SceneView focus listener registered", {
          hasSceneView: Boolean(viewRef.current),
          mapStatus: "online",
        });

        setMapStatus("online");
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("ArcGIS SceneView failed to initialize", error);
        setMapError(getSceneErrorMessage(error));
        setMapStatus("degraded");
      }
    }

    initializeScene(containerRef.current);

    return () => {
      // Keep ArcGIS lifecycle cleanup isolated here so dashboard state can
      // remount the client-only SceneView without leaking handles or layers.
      cancelled = true;
      clickHandle?.remove();
      if (focusEventHandler) {
        window.removeEventListener(
          CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
          focusEventHandler,
        );
      }
      hoverHandle?.remove();
      if (focusBeaconTimeoutRef.current) {
        clearTimeout(focusBeaconTimeoutRef.current);
        focusBeaconTimeoutRef.current = null;
      }
      focusLayerRef.current?.removeAll();
      focusLayerRef.current = null;
      layerRefs.current = {};
      runtimeRef.current = null;
      viewRef.current = null;

      if (localView && !localView.destroyed) {
        localView.destroy();
      }
    };
  }, [
    clearMapError,
    clearSelectedParcel,
    selectParcel,
    setMapError,
    setMapStatus,
  ]);

  useEffect(() => {
    applyOperationalLayerVisibility(layerRefs.current, activeLayerIds);
  }, [activeLayerIds]);

  useEffect(() => {
    updateSelectedParcelSymbols(
      getMockGraphicsLayerSubset(layerRefs.current, operationalLayerRegistry),
      selectedParcelId,
    );
  }, [selectedParcelId]);

  return (
    <MapViewportPlaceholder
      mapStatus={mapStatus}
      sceneError={mapError}
      selectedParcel={selectedParcel}
    >
      <div
        aria-label="Cabarrus County ArcGIS SceneView"
        className="absolute inset-0"
        ref={containerRef}
        title="Interactive ArcGIS SceneView with mock Cabarrus County operational layers"
      />
      {focusBeacon && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[#68d8ff]/55 bg-[#06101a]/94 px-4 py-3 text-left shadow-[0_0_52px_rgba(104,216,255,0.48)] backdrop-blur-xl">
          <span className="relative flex h-7 w-7 items-center justify-center">
            <span className="absolute h-7 w-7 animate-ping rounded-full bg-[#68d8ff]/35" />
            <span className="relative h-4 w-4 rounded-full border-2 border-white bg-[#d8b86a] shadow-[0_0_24px_rgba(216,184,106,0.85)]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fe7ff]">
              Parcel Focus
            </span>
            <span className="block max-w-[220px] truncate font-mono text-xs font-semibold text-white">
              {focusBeacon.officialParcelId}
            </span>
            {focusBeacon.pin14 && (
              <span className="block truncate text-[10px] text-slate-300">
                PIN {focusBeacon.pin14}
              </span>
            )}
          </span>
        </div>
      )}
    </MapViewportPlaceholder>
  );
}

function getSceneErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "ArcGIS modules could not initialize in the browser.";
}

function createParcelFocusLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "relative-to-ground",
      offset: 45,
    },
    id: "cfs-parcel-focus-layer",
    listMode: "hide",
    title: "Selected Parcel Focus",
  });
}

function ensureParcelFocusLayer(runtime: ArcGISRuntime, view: SceneView) {
  const map = view.map;

  if (!map) {
    throw new Error("SceneView map is unavailable for parcel focus.");
  }

  const existingLayer = map.findLayerById("cfs-parcel-focus-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const focusLayer = createParcelFocusLayer(runtime);
  map.add(focusLayer);
  return focusLayer;
}

function createParcelFocusGraphics(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  const graphics: Graphic[] = [];
  const boundaryGraphic = createParcelBoundaryGraphic(runtime, focus);
  const markerGraphic = createParcelFocusMarkerGraphic(runtime, focus);

  if (boundaryGraphic) {
    graphics.push(boundaryGraphic);
  }

  if (markerGraphic) {
    graphics.push(markerGraphic);
  }

  return graphics;
}

function createParcelFocusMarkerGraphic(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  if (!focus.centroid) {
    return null;
  }

  const point = createParcelFocusPoint(runtime, focus);

  return new runtime.Graphic({
    attributes: {
      focusSource: focus.focusSource,
      graphicRole: "parcel-marker",
      officialParcelId: focus.officialParcelId,
      pin14: focus.pin14,
    },
    geometry: point,
    popupTemplate: {
      content:
        "Backend parcel centroid/extent focus marker for the selected parcel.",
      title: focus.officialParcelId,
    },
    symbol: {
      callout: {
        color: [104, 216, 255, 0.95],
        size: 2,
        type: "line",
      },
      symbolLayers: [
        {
          material: {
            color: [104, 216, 255, 0.95],
          },
          outline: {
            color: [255, 255, 255, 0.95],
            size: 2,
          },
          resource: {
            primitive: "circle",
          },
          size: 34,
          type: "icon",
        },
        {
          material: {
            color: [216, 184, 106, 0.95],
          },
          resource: {
            primitive: "sphere",
          },
          depth: 130,
          height: 130,
          type: "object",
          width: 130,
        },
      ],
      type: "point-3d",
      verticalOffset: {
        maxWorldLength: 700,
        minWorldLength: 60,
        screenLength: 50,
      },
    } as unknown as Graphic["symbol"],
  });
}

function createParcelBoundaryGraphic(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  const rings = convertGeoJsonToArcGisRings(focus.highlightGeometry);

  if (!rings.length) {
    if (focus.highlightGeometry) {
      console.warn("Selected parcel highlight geometry could not be converted", {
        officialParcelId: focus.officialParcelId,
        type: focus.highlightGeometry.type,
      });
      logParcelMapFocusDiagnostic("parcel boundary conversion failed", {
        officialParcelId: focus.officialParcelId,
        type: focus.highlightGeometry.type,
      });
    }

    return null;
  }

  return new runtime.Graphic({
    attributes: {
      focusSource: focus.focusSource,
      graphicRole: "parcel-boundary",
      officialParcelId: focus.officialParcelId,
      pin14: focus.pin14,
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: {
        wkid: focus.highlightGeometry?.spatialReference?.wkid ?? 4326,
      },
    }),
    popupTemplate: {
      content:
        "Selected parcel boundary from the opt-in parcel detail highlight geometry.",
      title: focus.officialParcelId,
    },
    symbol: {
      color: [104, 216, 255, 0.08],
      outline: {
        color: [255, 218, 120, 1],
        style: "solid",
        width: 3,
      },
      style: "solid",
      type: "simple-fill",
    } as unknown as Graphic["symbol"],
  });
}

function createParcelFocusPoint(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  return new runtime.Point({
    spatialReference: {
      wkid: focus.centroid?.spatialReference?.wkid ?? 4326,
    },
    x: focus.centroid?.longitude,
    y: focus.centroid?.latitude,
  });
}

function convertGeoJsonToArcGisRings(
  geometry: ParcelMapFocus["highlightGeometry"],
) {
  if (!geometry) {
    return [];
  }

  const polygonCoordinates =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.coordinates;

  if (!Array.isArray(polygonCoordinates)) {
    return [];
  }

  return polygonCoordinates.flatMap((polygon) => {
    if (!Array.isArray(polygon)) {
      return [];
    }

    return polygon
      .map(normalizeGeoJsonRing)
      .filter((ring): ring is number[][] => ring.length >= 4);
  });
}

function normalizeGeoJsonRing(ring: unknown) {
  if (!Array.isArray(ring)) {
    return [];
  }

  const normalizedRing = ring
    .map((position) => {
      if (!Array.isArray(position) || position.length < 2) {
        return null;
      }

      const x = Number(position[0]);
      const y = Number(position[1]);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return [x, y];
    })
    .filter((position): position is number[] => Boolean(position));

  if (normalizedRing.length < 3) {
    return [];
  }

  const first = normalizedRing[0];
  const last = normalizedRing[normalizedRing.length - 1];
  const closed =
    first &&
    last &&
    first[0] === last[0] &&
    first[1] === last[1];

  return closed ? normalizedRing : [...normalizedRing, [...first]];
}

function createParcelFocusExtent(runtime: ArcGISRuntime, focus: ParcelMapFocus) {
  if (!focus.extent) {
    return null;
  }

  return new runtime.Extent({
    spatialReference: {
      wkid: focus.extent.spatialReference?.wkid ?? 4326,
    },
    xmax: focus.extent.xmax,
    xmin: focus.extent.xmin,
    ymax: focus.extent.ymax,
    ymin: focus.extent.ymin,
  });
}

function buildParcelFocusGoToTarget(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  if (focus.centroid) {
    return {
      center: createParcelFocusPoint(runtime, focus),
      zoom: 18,
    } as Parameters<SceneView["goTo"]>[0];
  }

  return {
    target: createParcelFocusExtent(runtime, focus),
    zoom: 17,
  } as Parameters<SceneView["goTo"]>[0];
}

function describeSceneViewCenter(view: SceneView) {
  const center = view.center;

  if (!center) {
    return null;
  }

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    wkid: center.spatialReference?.wkid,
    x: center.x,
    y: center.y,
  };
}

function recordSceneViewFocusDebug(
  stage: string,
  detail: Record<string, unknown>,
) {
  if (typeof window === "undefined") {
    return;
  }

  const debugEntry = {
    detail,
    stage,
    timestamp: new Date().toISOString(),
  };
  const debugWindow = window as Window & {
    __cfsLastSceneViewFocusDebug?: typeof debugEntry;
    __cfsSceneViewFocusDebugLog?: typeof debugEntry[];
  };
  const debugLog = debugWindow.__cfsSceneViewFocusDebugLog ?? [];

  debugWindow.__cfsLastSceneViewFocusDebug = debugEntry;
  debugWindow.__cfsSceneViewFocusDebugLog = [...debugLog, debugEntry].slice(
    -80,
  );
  console.debug("[CFS parcel map focus camera]", stage, detail);
}

function describeParcelFocusGoToTarget(focus: ParcelMapFocus) {
  if (focus.centroid) {
    return {
      latitude: focus.centroid.latitude,
      longitude: focus.centroid.longitude,
      spatialReference: {
        wkid: focus.centroid.spatialReference?.wkid ?? 4326,
      },
      type: "point",
    };
  }

  if (focus.extent) {
    return {
      spatialReference: {
        wkid: focus.extent.spatialReference?.wkid ?? 4326,
      },
      type: "extent",
      xmax: focus.extent.xmax,
      xmin: focus.extent.xmin,
      ymax: focus.extent.ymax,
      ymin: focus.extent.ymin,
    };
  }

  return null;
}
