"use client";

import type Graphic from "@arcgis/core/Graphic";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type SceneView from "@arcgis/core/views/SceneView";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";
import {
  PARCEL_SEARCH_INSPECT_EVENT,
  type ParcelSearchEventDetail,
} from "@/components/dashboard/ParcelSearchState";
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
import type { DevelopmentHotspotMapMarker } from "@/types/map/developmentHotspots";

type ArcGISHandle = {
  remove: () => void;
};

interface ParcelFocusBeacon {
  boundaryHighlighted: boolean;
  officialParcelId: string;
  pin14?: string | null;
  statusMessage: string;
}

interface DevelopmentHotspotInfoCard {
  developmentActivityClass: string | null;
  developmentActivityScore: number | null;
  dominantZoningCodeRaw: string | null;
  officialParcelId: string;
  pin14: string | null;
  recentPermitCount1yr: number;
  recentPermitCount3yr: number;
  totalPermitCount: number;
  zoningJurisdictionName: string | null;
}

interface OverlayCardPosition {
  x: number;
  y: number;
}

export function SceneViewContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parcelFocusCardRef = useRef<HTMLDivElement | null>(null);
  const hotspotInfoCardRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const layerRefs = useRef<OperationalLayerInstanceMap>({});
  const focusLayerRef = useRef<GraphicsLayer | null>(null);
  const hotspotLayerRef = useRef<GraphicsLayer | null>(null);
  const lastFocusedParcelIdRef = useRef<string | null>(null);
  const latestFocusRequestParcelIdRef = useRef<string | null>(null);
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const activeLayerIdsRef = useRef<string[]>([]);
  const focusBeaconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hotspotInfoDragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const parcelFocusDragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const [focusBeacon, setFocusBeacon] = useState<ParcelFocusBeacon | null>(
    null,
  );
  const [focusBeaconCollapsed, setFocusBeaconCollapsed] = useState(false);
  const [focusBeaconPosition, setFocusBeaconPosition] =
    useState<OverlayCardPosition | null>(null);
  const [hotspotInfo, setHotspotInfo] =
    useState<DevelopmentHotspotInfoCard | null>(null);
  const [hotspotInfoPosition, setHotspotInfoPosition] =
    useState<OverlayCardPosition | null>(null);
  const {
    activeLayerIds,
    clearMapError,
    clearSelectedParcel,
    developmentHotspotLayer,
    developmentHotspotsEnabled,
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

  const closeHotspotInfo = useCallback(() => {
    setHotspotInfo(null);
    setHotspotInfoPosition(null);
  }, []);

  const closeFocusBeacon = useCallback(() => {
    if (focusBeaconTimeoutRef.current) {
      clearTimeout(focusBeaconTimeoutRef.current);
      focusBeaconTimeoutRef.current = null;
    }

    setFocusBeacon(null);
  }, []);

  const handleFocusCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = parcelFocusCardRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      parcelFocusDragRef.current = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
      };
      setFocusBeaconPosition({
        x: rect.left,
        y: rect.top,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleFocusCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = parcelFocusDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const card = parcelFocusCardRef.current;
      const cardWidth = card?.offsetWidth ?? 320;
      const cardHeight = card?.offsetHeight ?? 160;
      const maxX = Math.max(12, window.innerWidth - cardWidth - 12);
      const maxY = Math.max(12, window.innerHeight - cardHeight - 12);
      const nextX = Math.min(
        Math.max(12, event.clientX - dragState.offsetX),
        maxX,
      );
      const nextY = Math.min(
        Math.max(12, event.clientY - dragState.offsetY),
        maxY,
      );

      setFocusBeaconPosition({
        x: nextX,
        y: nextY,
      });
    },
    [],
  );

  const handleFocusCardPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (parcelFocusDragRef.current?.pointerId === event.pointerId) {
        parcelFocusDragRef.current = null;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleHotspotCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = hotspotInfoCardRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      hotspotInfoDragRef.current = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
      };
      setHotspotInfoPosition({
        x: rect.left,
        y: rect.top,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleHotspotCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = hotspotInfoDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const card = hotspotInfoCardRef.current;
      const cardWidth = card?.offsetWidth ?? 300;
      const cardHeight = card?.offsetHeight ?? 220;
      const maxX = Math.max(12, window.innerWidth - cardWidth - 12);
      const maxY = Math.max(12, window.innerHeight - cardHeight - 12);
      const nextX = Math.min(
        Math.max(12, event.clientX - dragState.offsetX),
        maxX,
      );
      const nextY = Math.min(
        Math.max(12, event.clientY - dragState.offsetY),
        maxY,
      );

      setHotspotInfoPosition({
        x: nextX,
        y: nextY,
      });
    },
    [],
  );

  const handleHotspotCardPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (hotspotInfoDragRef.current?.pointerId === event.pointerId) {
        hotspotInfoDragRef.current = null;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

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

        const focusStatusMessage = boundaryGraphic
          ? "Parcel boundary highlighted."
          : "Focused on map - boundary unavailable.";
        setFocusBeacon({
          boundaryHighlighted: Boolean(boundaryGraphic),
          officialParcelId: focus.officialParcelId,
          pin14: focus.pin14,
          statusMessage: focusStatusMessage,
        });
        setFocusBeaconCollapsed(false);
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
        hotspotLayerRef.current = createDevelopmentHotspotLayer(runtime);
        map.add(hotspotLayerRef.current);
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
          void handleDevelopmentHotspotClick(
            view,
            event,
            hotspotLayerRef.current,
            setHotspotInfo,
          ).then((handledHotspotClick) => {
            if (!handledHotspotClick) {
              void interactionController.handleClick(event);
            }
          });
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
      hotspotLayerRef.current?.removeAll();
      hotspotLayerRef.current = null;
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
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const hotspotLayer = ensureDevelopmentHotspotLayer(runtime, view);
    hotspotLayerRef.current = hotspotLayer;
    hotspotLayer.removeAll();

    if (
      !developmentHotspotsEnabled ||
      developmentHotspotLayer.status !== "ready"
    ) {
      return;
    }

    developmentHotspotLayer.markers.forEach((marker) => {
      hotspotLayer.add(createDevelopmentHotspotGraphic(runtime, marker));
    });

    console.debug("[CFS development hotspots]", "rendered map markers", {
      markerCount: developmentHotspotLayer.markers.length,
      totalCount: developmentHotspotLayer.totalCount,
    });
  }, [
    developmentHotspotLayer.markers,
    developmentHotspotLayer.status,
    developmentHotspotLayer.totalCount,
    developmentHotspotsEnabled,
    mapStatus,
  ]);

  useEffect(() => {
    updateSelectedParcelSymbols(
      getMockGraphicsLayerSubset(layerRefs.current, operationalLayerRegistry),
      selectedParcelId,
    );
  }, [selectedParcelId]);

  const visibleHotspotInfo =
    hotspotInfo &&
    developmentHotspotsEnabled &&
    developmentHotspotLayer.markers.some(
      (marker) => marker.officialParcelId === hotspotInfo.officialParcelId,
    )
      ? hotspotInfo
      : null;

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
        <div
          aria-label="Selected parcel map focus information"
          className="fixed z-[80] w-[min(340px,calc(100vw-24px))] rounded-lg border border-[#68d8ff]/55 bg-[#06101a]/94 text-left shadow-[0_0_52px_rgba(104,216,255,0.34)] backdrop-blur-xl"
          ref={parcelFocusCardRef}
          style={
            focusBeaconPosition
              ? {
                  left: focusBeaconPosition.x,
                  top: focusBeaconPosition.y,
                }
              : {
                  bottom: "1rem",
                  left: "1rem",
                }
          }
        >
          <div
            className="flex cursor-move touch-none items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
            onPointerCancel={handleFocusCardPointerUp}
            onPointerDown={handleFocusCardPointerDown}
            onPointerMove={handleFocusCardPointerMove}
            onPointerUp={handleFocusCardPointerUp}
            title="Drag selected parcel focus card"
          >
            <div className="flex min-w-0 items-center gap-2">
              <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#8fe7ff]/70" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fe7ff]">
                  Parcel Focus
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-semibold text-white">
                  {focusBeacon.officialParcelId}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label={
                  focusBeaconCollapsed
                    ? "Expand selected parcel focus card"
                    : "Collapse selected parcel focus card"
                }
                className="rounded border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                onClick={() =>
                  setFocusBeaconCollapsed((collapsed) => !collapsed)
                }
                onPointerDown={(event) => event.stopPropagation()}
                title={
                  focusBeaconCollapsed
                    ? "Expand focus card"
                    : "Collapse focus card"
                }
                type="button"
              >
                {focusBeaconCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                aria-label="Close selected parcel focus card"
                className="rounded border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                onClick={closeFocusBeacon}
                onPointerDown={(event) => event.stopPropagation()}
                title="Close focus card"
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {!focusBeaconCollapsed && (
            <div className="flex items-start gap-3 px-3 py-3">
              <span className="relative mt-1 flex h-7 w-7 shrink-0 items-center justify-center">
                <span className="absolute h-7 w-7 animate-ping rounded-full bg-[#68d8ff]/35" />
                <span className="relative h-4 w-4 rounded-full border-2 border-white bg-[#d8b86a] shadow-[0_0_24px_rgba(216,184,106,0.85)]" />
              </span>
              <div className="min-w-0 space-y-2">
                {focusBeacon.pin14 && (
                  <p className="truncate text-[11px] text-slate-300">
                    PIN {focusBeacon.pin14}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#8fe7ff]">
                    {focusBeacon.statusMessage}
                  </span>
                  <span
                    className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase ${
                      focusBeacon.boundaryHighlighted
                        ? "border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f0cd79]"
                        : "border-white/10 bg-white/[0.04] text-slate-300"
                    }`}
                  >
                    {focusBeacon.boundaryHighlighted
                      ? "Boundary highlighted"
                      : "Boundary unavailable"}
                  </span>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                  Drag this card or collapse it to keep SceneView controls
                  clear.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {visibleHotspotInfo && (
        <div
          aria-label="Development hotspot information"
          className="fixed z-[85] w-[min(320px,calc(100vw-24px))] rounded-lg border border-[#ffb454]/35 bg-[#06101a]/95 text-left shadow-[0_0_42px_rgba(255,180,84,0.26)] backdrop-blur-xl"
          ref={hotspotInfoCardRef}
          style={
            hotspotInfoPosition
              ? {
                  left: hotspotInfoPosition.x,
                  top: hotspotInfoPosition.y,
                }
              : {
                  bottom: "1.5rem",
                  right: "1.5rem",
                }
          }
        >
          <div
            className="flex cursor-move touch-none items-start justify-between gap-3 border-b border-white/10 px-3 py-2"
            onPointerCancel={handleHotspotCardPointerUp}
            onPointerDown={handleHotspotCardPointerDown}
            onPointerMove={handleHotspotCardPointerMove}
            onPointerUp={handleHotspotCardPointerUp}
            title="Drag hotspot info card"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffcf92]">
                Development Hotspot
              </p>
              <p className="mt-1 truncate font-mono text-xs font-semibold text-white">
                {visibleHotspotInfo.officialParcelId}
              </p>
            </div>
            <button
              aria-label="Close development hotspot information"
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={closeHotspotInfo}
              title="Close hotspot info"
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 px-3 py-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <HotspotInfoMetric label="PIN" value={visibleHotspotInfo.pin14} />
              <HotspotInfoMetric
                label="Activity"
                value={formatHotspotPopupLabel(
                  visibleHotspotInfo.developmentActivityClass,
                )}
              />
              <HotspotInfoMetric
                label="Permits"
                value={visibleHotspotInfo.totalPermitCount}
              />
              <HotspotInfoMetric
                label="Score"
                value={formatHotspotScore(
                  visibleHotspotInfo.developmentActivityScore,
                )}
              />
              <HotspotInfoMetric
                label="Recent 1yr"
                value={visibleHotspotInfo.recentPermitCount1yr}
              />
              <HotspotInfoMetric
                label="Recent 3yr"
                value={visibleHotspotInfo.recentPermitCount3yr}
              />
            </div>
            <div className="rounded border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase text-slate-500">Zoning</p>
              <p className="mt-1 truncate text-slate-200">
                {visibleHotspotInfo.zoningJurisdictionName ?? "Unavailable"} /{" "}
                {visibleHotspotInfo.dominantZoningCodeRaw ?? "No code"}
              </p>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              This marker already selected the parcel. The selected parcel card,
              boundary highlight, and permit events use the standard parcel
              flow.
            </p>
          </div>
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

function HotspotInfoMetric({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value ?? "Unavailable"}
      </p>
    </div>
  );
}

function formatHotspotScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value.toFixed(1);
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

function createDevelopmentHotspotLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "relative-to-ground",
      offset: 70,
    },
    id: "cfs-development-hotspots-layer",
    listMode: "hide",
    title: "Development Hotspots",
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

function ensureDevelopmentHotspotLayer(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  const map = view.map;

  if (!map) {
    throw new Error("SceneView map is unavailable for development hotspots.");
  }

  const existingLayer = map.findLayerById("cfs-development-hotspots-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const hotspotLayer = createDevelopmentHotspotLayer(runtime);
  map.add(hotspotLayer);
  return hotspotLayer;
}

function createDevelopmentHotspotGraphic(
  runtime: ArcGISRuntime,
  marker: DevelopmentHotspotMapMarker,
) {
  const isVeryHigh =
    marker.developmentActivityClass === "very_high_activity";
  const isHigh = marker.developmentActivityClass === "high_activity";
  const size = isVeryHigh ? 24 : isHigh ? 19 : 15;
  const color = isVeryHigh
    ? [255, 126, 79, 0.94]
    : isHigh
      ? [255, 180, 84, 0.86]
      : [104, 216, 255, 0.78];

  return new runtime.Graphic({
    attributes: {
      developmentActivityClass: marker.developmentActivityClass,
      developmentActivityScore: marker.developmentActivityScore,
      dominantZoningCodeRaw: marker.dominantZoningCodeRaw,
      graphicRole: "development-hotspot",
      officialParcelId: marker.officialParcelId,
      pin14: marker.pin14,
      recentPermitCount1yr: marker.recentPermitCount1yr,
      recentPermitCount3yr: marker.recentPermitCount3yr,
      totalPermitCount: marker.totalPermitCount,
      zoningJurisdictionName: marker.zoningJurisdictionName,
    },
    geometry: new runtime.Point({
      spatialReference: {
        wkid: marker.centroid.spatialReference?.wkid ?? 4326,
      },
      x: marker.centroid.longitude,
      y: marker.centroid.latitude,
    }),
    symbol: {
      symbolLayers: [
        {
          material: {
            color,
          },
          outline: {
            color: [255, 255, 255, 0.92],
            size: 1.5,
          },
          resource: {
            primitive: "circle",
          },
          size,
          type: "icon",
        },
      ],
      type: "point-3d",
      verticalOffset: {
        maxWorldLength: 520,
        minWorldLength: 60,
        screenLength: isVeryHigh ? 42 : 32,
      },
    } as unknown as Graphic["symbol"],
  });
}

function formatHotspotPopupLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function handleDevelopmentHotspotClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  hotspotLayer: GraphicsLayer | null,
  onHotspotInfo: (hotspotInfo: DevelopmentHotspotInfoCard) => void,
) {
  if (!hotspotLayer || !hotspotLayer.visible) {
    return false;
  }

  try {
    const response = await view.hitTest(event, {
      include: [hotspotLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const hotspotGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "development-hotspot",
    )?.graphic;
    const officialParcelId =
      hotspotGraphic?.attributes?.officialParcelId as string | undefined;

    if (!hotspotGraphic || !officialParcelId) {
      return false;
    }

    closeSceneViewPopup(view);
    onHotspotInfo(createDevelopmentHotspotInfoCard(hotspotGraphic));

    console.debug("[CFS development hotspots]", "hotspot selected", {
      officialParcelId,
      pin14: hotspotGraphic?.attributes?.pin14,
    });

    window.dispatchEvent(
      new CustomEvent<ParcelSearchEventDetail>(PARCEL_SEARCH_INSPECT_EVENT, {
        detail: {
          officialParcelId,
        },
      }),
    );
    return true;
  } catch (error) {
    console.warn("Development hotspot hit test failed", error);
    return false;
  }
}

function createDevelopmentHotspotInfoCard(
  graphic: Graphic,
): DevelopmentHotspotInfoCard {
  const attributes = graphic.attributes ?? {};

  return {
    developmentActivityClass: stringAttribute(
      attributes.developmentActivityClass,
    ),
    developmentActivityScore: numberAttribute(
      attributes.developmentActivityScore,
    ),
    dominantZoningCodeRaw: stringAttribute(attributes.dominantZoningCodeRaw),
    officialParcelId:
      stringAttribute(attributes.officialParcelId) ?? "Unknown parcel",
    pin14: stringAttribute(attributes.pin14),
    recentPermitCount1yr: numberAttribute(attributes.recentPermitCount1yr) ?? 0,
    recentPermitCount3yr: numberAttribute(attributes.recentPermitCount3yr) ?? 0,
    totalPermitCount: numberAttribute(attributes.totalPermitCount) ?? 0,
    zoningJurisdictionName: stringAttribute(attributes.zoningJurisdictionName),
  };
}

function closeSceneViewPopup(view: SceneView) {
  const popupView = view as SceneView & {
    closePopup?: () => void;
    popup?: {
      close?: () => void;
    };
  };

  popupView.closePopup?.();
  popupView.popup?.close?.();
}

function stringAttribute(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberAttribute(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
