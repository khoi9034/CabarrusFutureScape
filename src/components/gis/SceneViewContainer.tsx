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
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
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
import type { FloodConstraintMapMarker } from "@/types/map/floodConstraints";
import type {
  FloodZoneExtent,
  FloodZoneMapPolygon,
} from "@/types/map/floodZones";
import type {
  SchoolUtilizationZoneMapPolygon,
  SelectedSchoolUtilizationZone,
} from "@/types/map/schoolUtilizationZones";

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
  dominantGrowthSignal: string | null;
  dominantPermitSegment: string | null;
  dominantZoningCodeRaw: string | null;
  highValuePermits: number;
  majorValuePermits: number;
  officialParcelId: string;
  permitSignalScoreMax: number | null;
  pin14: string | null;
  recentPermitCount1yr: number;
  recentPermitCount3yr: number;
  renderedPermitSegment: string | null;
  selectedSegmentCount: number | null;
  selectedSegmentIntensity: number | null;
  selectedSegmentScore: number | null;
  selectedSegmentSizeTier: string | null;
  totalPermitCount: number;
  zoningJurisdictionName: string | null;
}

interface FloodConstraintInfoCard {
  buildabilityImpact: string | null;
  dominantFloodZone: string | null;
  floodConstraintScore: number | null;
  floodSeverityClass: string | null;
  floodwayPresent: boolean;
  officialParcelId: string;
  percentParcelConstrained: number | null;
  pin14: string | null;
  sfhaPresent: boolean;
}

interface FloodZoneInfoCard {
  floodConstraintType: string | null;
  floodSeverityClass: string | null;
  floodZoneCode: string | null;
  fldArId: string | null;
  sourceLayer: string | null;
  sourceObjectid: number | null;
}

type SchoolUtilizationZoneInfoCard = SelectedSchoolUtilizationZone;

interface OverlayCardPosition {
  x: number;
  y: number;
}

interface SchoolUtilizationHoverCallout {
  info: SchoolUtilizationZoneInfoCard;
  position: OverlayCardPosition;
}

export function SceneViewContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parcelFocusCardRef = useRef<HTMLDivElement | null>(null);
  const hotspotInfoCardRef = useRef<HTMLDivElement | null>(null);
  const floodInfoCardRef = useRef<HTMLDivElement | null>(null);
  const floodZoneInfoCardRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const layerRefs = useRef<OperationalLayerInstanceMap>({});
  const focusLayerRef = useRef<GraphicsLayer | null>(null);
  const hotspotLayerRef = useRef<GraphicsLayer | null>(null);
  const floodConstraintLayerRef = useRef<GraphicsLayer | null>(null);
  const floodZoneLayerRef = useRef<GraphicsLayer | null>(null);
  const schoolUtilizationZoneLayerRef = useRef<GraphicsLayer | null>(null);
  const lastFocusedParcelIdRef = useRef<string | null>(null);
  const latestFocusRequestParcelIdRef = useRef<string | null>(null);
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const activeLayerIdsRef = useRef<string[]>([]);
  const hoveredSchoolZoneIdRef = useRef<string | null>(null);
  const selectedSchoolZoneIdRef = useRef<string | null>(null);
  const schoolHoverFrameRef = useRef<number | null>(null);
  const schoolUtilizationHoverRef =
    useRef<SchoolUtilizationHoverCallout | null>(null);
  const focusBeaconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hotspotInfoDragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const floodInfoDragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const floodZoneInfoDragRef = useRef<{
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
  const [lastParcelFocusSummary, setLastParcelFocusSummary] =
    useState<ParcelFocusBeacon | null>(null);
  const [focusBeaconCollapsed, setFocusBeaconCollapsed] = useState(false);
  const [focusBeaconPosition, setFocusBeaconPosition] =
    useState<OverlayCardPosition | null>(null);
  const [hotspotInfo, setHotspotInfo] =
    useState<DevelopmentHotspotInfoCard | null>(null);
  const [hotspotInfoPosition, setHotspotInfoPosition] =
    useState<OverlayCardPosition | null>(null);
  const [floodInfo, setFloodInfo] =
    useState<FloodConstraintInfoCard | null>(null);
  const [floodInfoPosition, setFloodInfoPosition] =
    useState<OverlayCardPosition | null>(null);
  const [floodZoneInfo, setFloodZoneInfo] =
    useState<FloodZoneInfoCard | null>(null);
  const [floodZoneInfoPosition, setFloodZoneInfoPosition] =
    useState<OverlayCardPosition | null>(null);
  const [schoolUtilizationHover, setSchoolUtilizationHover] =
    useState<SchoolUtilizationHoverCallout | null>(null);
  const {
    activeLayerIds,
    clearSelectedSchoolUtilizationZone,
    clearMapError,
    clearSelectedParcel,
    developmentHotspotControls,
    developmentHotspotLayer,
    developmentHotspotsEnabled,
    floodConstraintLayer,
    floodConstraintsEnabled,
    floodZoneLayer,
    floodZonesEnabled,
    isMapFocusMode,
    mapStatus,
    mapError,
    selectedParcel,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectParcel,
    schoolUtilizationZoneLayer,
    schoolUtilizationZonesEnabled,
    selectedSchoolUtilizationZone,
    setFloodZoneViewExtent,
    setMapFocusMode,
    setMapError,
    setMapStatus,
    setSelectedSchoolUtilizationZone,
    toggleMapFocusMode,
  } = useDashboardState();
  const selectedParcelIdRef = useRef(selectedParcelId);

  useEffect(() => {
    activeLayerIdsRef.current = activeLayerIds;
  }, [activeLayerIds]);

  useEffect(() => {
    selectedParcelIdRef.current = selectedParcelId;
  }, [selectedParcelId]);

  useEffect(() => {
    selectedSchoolZoneIdRef.current =
      selectedSchoolUtilizationZone?.zoneId ?? null;
    updateSchoolUtilizationZoneInteractionSymbols(
      schoolUtilizationZoneLayerRef.current,
      selectedSchoolZoneIdRef.current,
      hoveredSchoolZoneIdRef.current,
    );
  }, [selectedSchoolUtilizationZone?.zoneId]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || view.destroyed) {
      return;
    }

    const resizeFrame = window.requestAnimationFrame(() => {
      resizeSceneView(view);
    });

    return () => window.cancelAnimationFrame(resizeFrame);
  }, [isMapFocusMode]);

  const closeHotspotInfo = useCallback(() => {
    setHotspotInfo(null);
    setHotspotInfoPosition(null);
  }, []);

  const closeFloodInfo = useCallback(() => {
    setFloodInfo(null);
    setFloodInfoPosition(null);
  }, []);

  const closeFloodZoneInfo = useCallback(() => {
    setFloodZoneInfo(null);
    setFloodZoneInfoPosition(null);
  }, []);

  const closeSchoolUtilizationInfo = useCallback(() => {
    clearSelectedSchoolUtilizationZone();
  }, [clearSelectedSchoolUtilizationZone]);

  const updateSchoolUtilizationHover = useCallback(
    (
      info: SchoolUtilizationZoneInfoCard,
      position: OverlayCardPosition,
    ) => {
      const current = schoolUtilizationHoverRef.current;
      const nextHoveredZoneId = info.zoneId;

      if (
        current?.info.zoneId === nextHoveredZoneId &&
        Math.abs(current.position.x - position.x) < 10 &&
        Math.abs(current.position.y - position.y) < 10
      ) {
        return;
      }

      const nextHover = {
        info,
        position,
      };

      schoolUtilizationHoverRef.current = nextHover;
      setSchoolUtilizationHover(nextHover);

      if (hoveredSchoolZoneIdRef.current !== nextHoveredZoneId) {
        hoveredSchoolZoneIdRef.current = nextHoveredZoneId;
        updateSchoolUtilizationZoneInteractionSymbols(
          schoolUtilizationZoneLayerRef.current,
          selectedSchoolZoneIdRef.current,
          nextHoveredZoneId,
        );
      }
    },
    [],
  );

  const clearSchoolUtilizationHover = useCallback(() => {
    if (!schoolUtilizationHoverRef.current) {
      return;
    }

    schoolUtilizationHoverRef.current = null;
    setSchoolUtilizationHover(null);

    if (hoveredSchoolZoneIdRef.current) {
      hoveredSchoolZoneIdRef.current = null;
      updateSchoolUtilizationZoneInteractionSymbols(
        schoolUtilizationZoneLayerRef.current,
        selectedSchoolZoneIdRef.current,
        null,
      );
    }
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

  const handleFloodCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = floodInfoCardRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      floodInfoDragRef.current = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
      };
      setFloodInfoPosition({
        x: rect.left,
        y: rect.top,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleFloodCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = floodInfoDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const card = floodInfoCardRef.current;
      const cardWidth = card?.offsetWidth ?? 320;
      const cardHeight = card?.offsetHeight ?? 250;
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

      setFloodInfoPosition({
        x: nextX,
        y: nextY,
      });
    },
    [],
  );

  const handleFloodCardPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (floodInfoDragRef.current?.pointerId === event.pointerId) {
        floodInfoDragRef.current = null;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleFloodZoneCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = floodZoneInfoCardRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      floodZoneInfoDragRef.current = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
      };
      setFloodZoneInfoPosition({
        x: rect.left,
        y: rect.top,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleFloodZoneCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = floodZoneInfoDragRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const card = floodZoneInfoCardRef.current;
      const cardWidth = card?.offsetWidth ?? 320;
      const cardHeight = card?.offsetHeight ?? 230;
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

      setFloodZoneInfoPosition({
        x: nextX,
        y: nextY,
      });
    },
    [],
  );

  const handleFloodZoneCardPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (floodZoneInfoDragRef.current?.pointerId === event.pointerId) {
        floodZoneInfoDragRef.current = null;
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
    let extentWatchHandle: ArcGISHandle | null = null;
    let focusEventHandler: ((event: Event) => void) | null = null;
    let hoverHandle: ArcGISHandle | null = null;
    let localView: SceneView | null = null;
    let zoomWatchHandle: ArcGISHandle | null = null;

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
        const focusTargetZoom = getParcelFocusTargetZoom(focus);
        const focusGraphics = createParcelFocusGraphics(
          runtime,
          focus,
          focusTargetZoom,
        );
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
        updateParcelFocusMarkerScale(
          focusLayer,
          Number.isFinite(view.zoom) ? view.zoom : focusTargetZoom,
        );

        const focusStatusMessage = boundaryGraphic
          ? "Parcel boundary highlighted."
          : "Focused on map - boundary unavailable.";
        const nextFocusSummary = {
          boundaryHighlighted: Boolean(boundaryGraphic),
          officialParcelId: focus.officialParcelId,
          pin14: focus.pin14,
          statusMessage: focusStatusMessage,
        };
        setLastParcelFocusSummary(nextFocusSummary);
        setFocusBeacon(nextFocusSummary);
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
            : "Focused on map - boundary unavailable.",
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
        setLastParcelFocusSummary({
          boundaryHighlighted: false,
          officialParcelId: focus.officialParcelId,
          pin14: focus.pin14,
          statusMessage: "Map focus failed.",
        });
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
        floodConstraintLayerRef.current = createFloodConstraintLayer(runtime);
        map.add(floodConstraintLayerRef.current);
        floodZoneLayerRef.current = createFemaFloodZoneLayer(runtime);
        map.add(floodZoneLayerRef.current);
        schoolUtilizationZoneLayerRef.current =
          createSchoolUtilizationZoneLayer(runtime);
        map.add(schoolUtilizationZoneLayerRef.current);
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
            closeFloodInfo,
          ).then((handledHotspotClick) => {
            if (handledHotspotClick) {
              closeFloodZoneInfo();
              closeSchoolUtilizationInfo();
              return;
            }

            void handleFloodConstraintClick(
              view,
              event,
              floodConstraintLayerRef.current,
              setFloodInfo,
              closeHotspotInfo,
            ).then((handledFloodClick) => {
              if (handledFloodClick) {
                closeFloodZoneInfo();
                closeSchoolUtilizationInfo();
                return;
              }

              void handleFemaFloodZoneClick(
                view,
                event,
                floodZoneLayerRef.current,
                setFloodZoneInfo,
                closeHotspotInfo,
                closeFloodInfo,
              ).then((handledFloodZoneClick) => {
                if (handledFloodZoneClick) {
                  closeSchoolUtilizationInfo();
                  return;
                }

                void handleSchoolUtilizationZoneClick(
                  view,
                  event,
                  schoolUtilizationZoneLayerRef.current,
                  setSelectedSchoolUtilizationZone,
                  closeHotspotInfo,
                  closeFloodInfo,
                  closeFloodZoneInfo,
                ).then((handledSchoolClick) => {
                  if (!handledSchoolClick) {
                    void interactionController.handleClick(event);
                  }
                });
              });
            });
          });
        });
        hoverHandle = view.on("pointer-move", (event) => {
          if (schoolHoverFrameRef.current !== null) {
            return;
          }

          schoolHoverFrameRef.current = window.requestAnimationFrame(() => {
            schoolHoverFrameRef.current = null;
            void handleSchoolUtilizationZoneHover(
              view,
              event,
              schoolUtilizationZoneLayerRef.current,
              containerRef.current,
              updateSchoolUtilizationHover,
              clearSchoolUtilizationHover,
            );
          });
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
        zoomWatchHandle = runtime.reactiveUtils.watch(() => view.zoom, (zoom) => {
          if (focusLayerRef.current) {
            updateParcelFocusMarkerScale(focusLayerRef.current, zoom);
          }
        }) as ArcGISHandle;
        const publishFloodZoneExtent = () => {
          const extent = getSceneViewWgs84Extent(runtime, view);

          if (extent) {
            setFloodZoneViewExtent(extent);
          }
        };
        publishFloodZoneExtent();
        extentWatchHandle = runtime.reactiveUtils.watch(
          () => view.stationary,
          (stationary) => {
            if (stationary) {
              publishFloodZoneExtent();
            }
          },
        ) as ArcGISHandle;
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
      extentWatchHandle?.remove();
      zoomWatchHandle?.remove();
      if (focusBeaconTimeoutRef.current) {
        clearTimeout(focusBeaconTimeoutRef.current);
        focusBeaconTimeoutRef.current = null;
      }
      if (schoolHoverFrameRef.current !== null) {
        window.cancelAnimationFrame(schoolHoverFrameRef.current);
        schoolHoverFrameRef.current = null;
      }
      clearSchoolUtilizationHover();
      focusLayerRef.current?.removeAll();
      focusLayerRef.current = null;
      hotspotLayerRef.current?.removeAll();
      hotspotLayerRef.current = null;
      floodConstraintLayerRef.current?.removeAll();
      floodConstraintLayerRef.current = null;
      floodZoneLayerRef.current?.removeAll();
      floodZoneLayerRef.current = null;
      schoolUtilizationZoneLayerRef.current?.removeAll();
      schoolUtilizationZoneLayerRef.current = null;
      layerRefs.current = {};
      runtimeRef.current = null;
      viewRef.current = null;

      if (localView && !localView.destroyed) {
        localView.destroy();
      }
    };
  }, [
    clearMapError,
    closeFloodInfo,
    closeFloodZoneInfo,
    closeHotspotInfo,
    closeSchoolUtilizationInfo,
    clearSelectedParcel,
    clearSchoolUtilizationHover,
    selectParcel,
    setFloodZoneViewExtent,
    setMapError,
    setMapStatus,
    setSelectedSchoolUtilizationZone,
    updateSchoolUtilizationHover,
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

    const activePermitSegment =
      developmentHotspotControls.permitSegment === "all"
        ? null
        : developmentHotspotControls.permitSegment;

    developmentHotspotLayer.markers.forEach((marker) => {
      hotspotLayer.add(
        createDevelopmentHotspotGraphic(runtime, marker, activePermitSegment),
      );
    });

    console.debug("[CFS development hotspots]", "rendered map markers", {
      markerCount: developmentHotspotLayer.markers.length,
      totalCount: developmentHotspotLayer.totalCount,
    });
  }, [
    developmentHotspotLayer.markers,
    developmentHotspotLayer.status,
    developmentHotspotLayer.totalCount,
    developmentHotspotControls.permitSegment,
    developmentHotspotsEnabled,
    mapStatus,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const floodLayer = ensureFloodConstraintLayer(runtime, view);
    floodConstraintLayerRef.current = floodLayer;
    floodLayer.removeAll();

    if (!floodConstraintsEnabled || floodConstraintLayer.status !== "ready") {
      return;
    }

    floodConstraintLayer.markers.forEach((marker) => {
      floodLayer.add(createFloodConstraintGraphic(runtime, marker));
    });

    console.debug("[CFS flood constraints]", "rendered map markers", {
      markerCount: floodConstraintLayer.markers.length,
      totalCount: floodConstraintLayer.totalCount,
    });
  }, [
    floodConstraintLayer.markers,
    floodConstraintLayer.status,
    floodConstraintLayer.totalCount,
    floodConstraintsEnabled,
    mapStatus,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const femaFloodZoneGraphicsLayer = ensureFemaFloodZoneLayer(runtime, view);
    floodZoneLayerRef.current = femaFloodZoneGraphicsLayer;
    femaFloodZoneGraphicsLayer.removeAll();

    if (!floodZonesEnabled || floodZoneLayer.status !== "ready") {
      return;
    }

    femaFloodZoneGraphicsLayer.addMany(
      floodZoneLayer.polygons
        .map((polygon) => createFemaFloodZoneGraphic(runtime, polygon))
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );

    console.debug("[CFS FEMA flood zones]", "rendered source polygons", {
      polygonCount: floodZoneLayer.polygons.length,
      totalCount: floodZoneLayer.totalCount,
    });
  }, [
    floodZoneLayer.polygons,
    floodZoneLayer.status,
    floodZoneLayer.totalCount,
    floodZonesEnabled,
    mapStatus,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const schoolLayer = ensureSchoolUtilizationZoneLayer(runtime, view);
    schoolUtilizationZoneLayerRef.current = schoolLayer;
    schoolLayer.removeAll();

    if (
      !schoolUtilizationZonesEnabled ||
      schoolUtilizationZoneLayer.status !== "ready"
    ) {
      clearSchoolUtilizationHover();
      if (selectedSchoolUtilizationZone) {
        clearSelectedSchoolUtilizationZone();
      }
      return;
    }

    schoolLayer.addMany(
      schoolUtilizationZoneLayer.polygons
        .map((polygon) =>
          createSchoolUtilizationZoneGraphic(
            runtime,
            polygon,
            selectedSchoolUtilizationZone?.zoneId ?? null,
          ),
        )
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );

    console.debug(
      "[CFS school utilization zones]",
      "rendered presentation-derived zones",
      {
        polygonCount: schoolUtilizationZoneLayer.polygons.length,
        totalCount: schoolUtilizationZoneLayer.totalCount,
      },
    );
  }, [
    mapStatus,
    clearSchoolUtilizationHover,
    clearSelectedSchoolUtilizationZone,
    schoolUtilizationZoneLayer.polygons,
    schoolUtilizationZoneLayer.status,
    schoolUtilizationZoneLayer.totalCount,
    schoolUtilizationZonesEnabled,
    selectedSchoolUtilizationZone,
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

  const visibleFloodInfo =
    floodInfo &&
    floodConstraintsEnabled &&
    floodConstraintLayer.markers.some(
      (marker) => marker.officialParcelId === floodInfo.officialParcelId,
    )
      ? floodInfo
      : null;
  const visibleFloodZoneInfo =
    floodZoneInfo && floodZonesEnabled && floodZoneLayer.status === "ready"
      ? floodZoneInfo
      : null;
  const visibleSchoolUtilizationInfo =
    selectedSchoolUtilizationZone &&
    schoolUtilizationZonesEnabled &&
    schoolUtilizationZoneLayer.status === "ready"
      ? selectedSchoolUtilizationZone
      : null;
  const visibleSchoolUtilizationOverlay =
    visibleSchoolUtilizationInfo && isMapFocusMode
      ? visibleSchoolUtilizationInfo
      : null;
  const visibleSchoolUtilizationHover =
    schoolUtilizationHover &&
    schoolUtilizationZonesEnabled &&
    schoolUtilizationZoneLayer.status === "ready"
      ? schoolUtilizationHover
      : null;

  return (
    <MapViewportPlaceholder
      mapStatus={mapStatus}
      parcelFocusSummary={lastParcelFocusSummary}
      sceneError={mapError}
      selectedParcel={selectedParcel}
      selectedParcelId={selectedParcelId}
      selectedParcelIntelligence={selectedParcelIntelligence}
      selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
    >
      <div
        aria-label="Cabarrus County ArcGIS SceneView"
        className="absolute inset-0"
        ref={containerRef}
        title="Interactive ArcGIS SceneView with Cabarrus County operational layers"
      />
      <button
        aria-label={isMapFocusMode ? "Exit map focus" : "Expand map"}
        aria-pressed={isMapFocusMode}
        className="app-chrome absolute right-4 top-4 z-[55] inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#06101a]/88 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-100 shadow-[0_14px_42px_rgba(0,0,0,0.34)] backdrop-blur-xl transition hover:border-[#d8b86a]/45 hover:bg-[#111b29]/92 hover:text-[#f0cd79] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/70"
        onClick={toggleMapFocusMode}
        title={isMapFocusMode ? "Exit map focus" : "Expand map"}
        type="button"
      >
        {isMapFocusMode ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">
          {isMapFocusMode ? "Exit Map Focus" : "Expand Map"}
        </span>
      </button>
      {isMapFocusMode ? (
        <button
          className="app-chrome absolute right-4 top-16 z-[55] rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-300 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
          onClick={() => setMapFocusMode(false)}
          title="Exit map focus with Escape or this button"
          type="button"
        >
          Esc exits
        </button>
      ) : null}
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
                label="Selected Segment"
                value={formatHotspotPopupLabel(
                  visibleHotspotInfo.renderedPermitSegment ??
                    visibleHotspotInfo.dominantPermitSegment,
                )}
              />
              <HotspotInfoMetric
                label="Segment Count"
                value={visibleHotspotInfo.selectedSegmentCount}
              />
              <HotspotInfoMetric
                label="Concentration"
                value={formatHotspotPopupLabel(
                  visibleHotspotInfo.selectedSegmentSizeTier,
                )}
              />
              {visibleHotspotInfo.selectedSegmentScore !== null ? (
                <HotspotInfoMetric
                  label="Segment Score"
                  value={formatHotspotScore(
                    visibleHotspotInfo.selectedSegmentScore,
                  )}
                />
              ) : null}
              <HotspotInfoMetric
                label="Growth Signal"
                value={formatHotspotPopupLabel(
                  visibleHotspotInfo.dominantGrowthSignal,
                )}
              />
              <HotspotInfoMetric
                label="Domain"
                value={formatDevelopmentDomainLabel(
                  visibleHotspotInfo.renderedPermitSegment ??
                    visibleHotspotInfo.dominantPermitSegment,
                )}
              />
              <HotspotInfoMetric
                label="Permits"
                value={visibleHotspotInfo.totalPermitCount}
              />
              <HotspotInfoMetric
                label="Recent 1yr"
                value={visibleHotspotInfo.recentPermitCount1yr}
              />
              <HotspotInfoMetric
                label="Recent 3yr"
                value={visibleHotspotInfo.recentPermitCount3yr}
              />
              <HotspotInfoMetric
                label="High Value"
                value={visibleHotspotInfo.highValuePermits}
              />
              <HotspotInfoMetric
                label="Major Value"
                value={visibleHotspotInfo.majorValuePermits}
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
      {visibleFloodInfo && (
        <div
          aria-label="Flood constraint information"
          className="fixed z-[84] w-[min(330px,calc(100vw-24px))] rounded-lg border border-[#ff8d7a]/35 bg-[#06101a]/95 text-left shadow-[0_0_42px_rgba(255,91,91,0.24)] backdrop-blur-xl"
          ref={floodInfoCardRef}
          style={
            floodInfoPosition
              ? {
                  left: floodInfoPosition.x,
                  top: floodInfoPosition.y,
                }
              : {
                  bottom: "1.5rem",
                  right: "1.5rem",
                }
          }
        >
          <div
            className="flex cursor-move touch-none items-start justify-between gap-3 border-b border-white/10 px-3 py-2"
            onPointerCancel={handleFloodCardPointerUp}
            onPointerDown={handleFloodCardPointerDown}
            onPointerMove={handleFloodCardPointerMove}
            onPointerUp={handleFloodCardPointerUp}
            title="Drag flood constraint info card"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffb4a8]">
                Flood Constraint
              </p>
              <p className="mt-1 truncate font-mono text-xs font-semibold text-white">
                {visibleFloodInfo.officialParcelId}
              </p>
            </div>
            <button
              aria-label="Close flood constraint information"
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={closeFloodInfo}
              title="Close flood constraint info"
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 px-3 py-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <FloodInfoMetric label="PIN" value={visibleFloodInfo.pin14} />
              <FloodInfoMetric
                label="Zone"
                value={visibleFloodInfo.dominantFloodZone}
              />
              <FloodInfoMetric
                label="Floodway"
                value={formatFloodBoolean(visibleFloodInfo.floodwayPresent)}
              />
              <FloodInfoMetric
                label="SFHA"
                value={formatFloodBoolean(visibleFloodInfo.sfhaPresent)}
              />
              <FloodInfoMetric
                label="Constrained"
                value={formatFloodPercent(
                  visibleFloodInfo.percentParcelConstrained,
                )}
              />
              <FloodInfoMetric
                label="Score"
                value={formatFloodScore(visibleFloodInfo.floodConstraintScore)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FloodInfoMetric
                label="Impact"
                value={formatFloodPopupLabel(visibleFloodInfo.buildabilityImpact)}
              />
              <FloodInfoMetric
                label="Severity"
                value={formatFloodPopupLabel(visibleFloodInfo.floodSeverityClass)}
              />
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              This marker selected the parcel. The selected parcel card, FEMA
              flood panel, and boundary highlight use the standard parcel flow.
            </p>
          </div>
        </div>
      )}
      {visibleFloodZoneInfo && (
        <div
          aria-label="FEMA flood zone information"
          className="fixed z-[83] w-[min(330px,calc(100vw-24px))] rounded-lg border border-[#ffb454]/35 bg-[#06101a]/95 text-left shadow-[0_0_42px_rgba(255,180,84,0.22)] backdrop-blur-xl"
          ref={floodZoneInfoCardRef}
          style={
            floodZoneInfoPosition
              ? {
                  left: floodZoneInfoPosition.x,
                  top: floodZoneInfoPosition.y,
                }
              : {
                  bottom: "1.5rem",
                  right: "1.5rem",
                }
          }
        >
          <div
            className="flex cursor-move touch-none items-start justify-between gap-3 border-b border-white/10 px-3 py-2"
            onPointerCancel={handleFloodZoneCardPointerUp}
            onPointerDown={handleFloodZoneCardPointerDown}
            onPointerMove={handleFloodZoneCardPointerMove}
            onPointerUp={handleFloodZoneCardPointerUp}
            title="Drag FEMA flood zone info card"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffcf92]">
                FEMA Flood Zone
              </p>
              <p className="mt-1 truncate font-mono text-xs font-semibold text-white">
                {visibleFloodZoneInfo.floodZoneCode ?? "Uncoded zone"}
              </p>
            </div>
            <button
              aria-label="Close FEMA flood zone information"
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={closeFloodZoneInfo}
              title="Close FEMA flood zone info"
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 px-3 py-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <FloodInfoMetric
                label="Severity"
                value={formatFloodPopupLabel(
                  visibleFloodZoneInfo.floodSeverityClass,
                )}
              />
              <FloodInfoMetric
                label="Type"
                value={formatFloodPopupLabel(
                  visibleFloodZoneInfo.floodConstraintType,
                )}
              />
              <FloodInfoMetric
                label="FEMA Area ID"
                value={visibleFloodZoneInfo.fldArId}
              />
              <FloodInfoMetric
                label="Object ID"
                value={visibleFloodZoneInfo.sourceObjectid}
              />
            </div>
            <div className="rounded border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase text-slate-500">Source</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-100">
                {visibleFloodZoneInfo.sourceLayer ??
                  "FEMA NFHL Layer 28 Flood Hazard Zones"}
              </p>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              This is the authoritative FEMA source polygon. Use the separate
              Flood Constraints marker layer to inspect parcel-based flood
              review and buildability flags.
            </p>
          </div>
        </div>
      )}
      {visibleSchoolUtilizationHover && (
        <div
          aria-label="School utilization hover details"
          className="pointer-events-none fixed z-[81] w-[min(280px,calc(100vw-24px))] rounded-lg border border-[#9ff0bd]/30 bg-[#06101a]/94 px-3 py-3 text-left shadow-[0_16px_42px_rgba(0,0,0,0.34)] backdrop-blur-xl"
          style={{
            left: visibleSchoolUtilizationHover.position.x,
            top: visibleSchoolUtilizationHover.position.y,
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b9ffd1]">
            School Utilization Zone
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {visibleSchoolUtilizationHover.info.schoolName ?? "School zone"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <FloodInfoMetric
              label="Level"
              value={formatFloodPopupLabel(
                visibleSchoolUtilizationHover.info.schoolLevel,
              )}
            />
            <FloodInfoMetric
              label="Utilization"
              value={formatFloodPercent(
                visibleSchoolUtilizationHover.info.utilizationPct,
              )}
            />
            <FloodInfoMetric
              label="Class"
              value={formatSchoolUtilizationClassLabel(
                visibleSchoolUtilizationHover.info.utilizationClass,
              )}
            />
            <FloodInfoMetric
              label="Year"
              value={
                visibleSchoolUtilizationHover.info.schoolYear
                  ? `SY ${visibleSchoolUtilizationHover.info.schoolYear}`
                  : null
              }
            />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            Presentation-derived · Needs verification
          </p>
        </div>
      )}
      {visibleSchoolUtilizationOverlay && (
        <div
          aria-label="School utilization seed information"
          className="fixed bottom-6 right-6 z-[82] w-[min(330px,calc(100vw-24px))] rounded-lg border border-[#5cd38f]/35 bg-[#06101a]/95 text-left shadow-[0_0_42px_rgba(92,211,143,0.2)] backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b9ffd1]">
                Preliminary Utilization Snapshot
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-white">
                {formatSchoolUtilizationTitle(visibleSchoolUtilizationOverlay)}
              </p>
            </div>
            <button
              aria-label="Close school utilization seed information"
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              onClick={closeSchoolUtilizationInfo}
              title="Close school utilization info"
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 px-3 py-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <FloodInfoMetric
                label="Level"
                value={formatFloodPopupLabel(
                  visibleSchoolUtilizationOverlay.schoolLevel,
                )}
              />
              <FloodInfoMetric
                label="Utilization"
                value={formatFloodPercent(
                  visibleSchoolUtilizationOverlay.utilizationPct,
                )}
              />
              <FloodInfoMetric
                label="Class"
                value={formatSchoolUtilizationClassLabel(
                  visibleSchoolUtilizationOverlay.utilizationClass,
                )}
              />
              <FloodInfoMetric
                label="Year"
                value={
                  visibleSchoolUtilizationOverlay.schoolYear
                    ? `SY ${visibleSchoolUtilizationOverlay.schoolYear}`
                    : null
                }
              />
              <FloodInfoMetric
                label="Source confidence"
                value={formatSchoolUtilizationSourceLabel(
                  visibleSchoolUtilizationOverlay.sourceConfidence,
                )}
              />
              <FloodInfoMetric
                label="Reference"
                value={
                  visibleSchoolUtilizationOverlay.matchedSchoolReferenceId
                    ? "Matched"
                    : "Review needed"
                }
              />
              <FloodInfoMetric
                label="Seed match"
                value={formatFloodPopupLabel(
                  visibleSchoolUtilizationOverlay.matchConfidence,
                )}
              />
              <FloodInfoMetric
                label="Zone match"
                value={formatFloodPopupLabel(
                  visibleSchoolUtilizationOverlay.zoneMatchConfidence,
                )}
              />
              <FloodInfoMetric
                label="Verification"
                value={
                  visibleSchoolUtilizationOverlay.needsVerification
                    ? "Needs verification"
                    : "Verified"
                }
              />
            </div>
            <div className="rounded border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase text-slate-500">Zone</p>
              <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-100">
                {visibleSchoolUtilizationOverlay.zoneId ?? "Zone unavailable"}
              </p>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Presentation-derived SY 2024-2025 utilization seed. Needs
              verification against official enrollment and capacity data. This
              is not official capacity scoring and is not a final school
              capacity score.
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

function getSceneViewWgs84Extent(
  runtime: ArcGISRuntime,
  view: SceneView,
): FloodZoneExtent | null {
  const rawExtent = view.extent;

  if (!rawExtent) {
    return null;
  }

  const rawWkid = rawExtent.spatialReference?.wkid;
  const geographicExtent =
    rawWkid === 4326
      ? rawExtent
      : (runtime.webMercatorUtils.webMercatorToGeographic(
          rawExtent,
        ) as typeof rawExtent | null);

  if (!geographicExtent) {
    return null;
  }

  const { xmax, xmin, ymax, ymin } = geographicExtent;
  const values = [xmax, xmin, ymax, ymin];

  if (!values.every((value) => Number.isFinite(value))) {
    return null;
  }

  return {
    xmax,
    xmin,
    ymax,
    ymin,
  };
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

function FloodInfoMetric({
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

function formatFloodBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatFloodPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value.toFixed(1)}%`;
}

function formatFloodScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value.toFixed(1);
}

function createParcelFocusLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "on-the-ground",
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

function createFloodConstraintLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "relative-to-ground",
      offset: 58,
    },
    id: "cfs-flood-constraints-layer",
    listMode: "hide",
    title: "Flood Constraints",
  });
}

function createFemaFloodZoneLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "on-the-ground",
    },
    id: "cfs-fema-flood-zones-layer",
    listMode: "hide",
    title: "FEMA Flood Zones",
  });
}

function createSchoolUtilizationZoneLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    elevationInfo: {
      mode: "on-the-ground",
    },
    id: "cfs-school-utilization-zones-layer",
    listMode: "hide",
    title: "School Utilization Seed Zones",
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

function ensureFloodConstraintLayer(runtime: ArcGISRuntime, view: SceneView) {
  const map = view.map;

  if (!map) {
    throw new Error("SceneView map is unavailable for flood constraints.");
  }

  const existingLayer = map.findLayerById("cfs-flood-constraints-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const floodLayer = createFloodConstraintLayer(runtime);
  map.add(floodLayer);
  return floodLayer;
}

function ensureFemaFloodZoneLayer(runtime: ArcGISRuntime, view: SceneView) {
  const map = view.map;

  if (!map) {
    throw new Error("SceneView map is unavailable for FEMA flood zones.");
  }

  const existingLayer = map.findLayerById("cfs-fema-flood-zones-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const floodZoneLayer = createFemaFloodZoneLayer(runtime);
  map.add(floodZoneLayer);
  return floodZoneLayer;
}

function ensureSchoolUtilizationZoneLayer(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  const map = view.map;

  if (!map) {
    throw new Error("SceneView map is unavailable for school utilization zones.");
  }

  const existingLayer = map.findLayerById(
    "cfs-school-utilization-zones-layer",
  );

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const schoolLayer = createSchoolUtilizationZoneLayer(runtime);
  map.add(schoolLayer);
  return schoolLayer;
}

function createDevelopmentHotspotGraphic(
  runtime: ArcGISRuntime,
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
) {
  const profile = getDevelopmentHotspotMarkerProfile(
    marker,
    activePermitSegment,
  );

  return new runtime.Graphic({
    attributes: {
      developmentActivityClass: marker.developmentActivityClass,
      developmentActivityScore: marker.developmentActivityScore,
      dominantGrowthSignal: marker.dominantGrowthSignal,
      dominantPermitSegment: marker.dominantPermitSegment,
      dominantZoningCodeRaw: marker.dominantZoningCodeRaw,
      graphicRole: "development-hotspot",
      highValuePermits: marker.highValuePermits,
      majorValuePermits: marker.majorValuePermits,
      officialParcelId: marker.officialParcelId,
      permitSignalScoreMax: marker.permitSignalScoreMax,
      renderedPermitSegment: profile.segment,
      selectedSegmentCount: profile.selectedSegmentCount,
      selectedSegmentIntensity: profile.selectedSegmentIntensity,
      selectedSegmentScore: profile.selectedSegmentScore,
      selectedSegmentSizeTier: profile.tier,
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
            color: profile.haloColor,
          },
          outline: {
            color: profile.haloOutlineColor,
            size: 1,
          },
          resource: {
            primitive: profile.primitive,
          },
          size: profile.haloSize,
          type: "icon",
        },
        {
          material: {
            color: profile.color,
          },
          outline: {
            color: profile.outlineColor,
            size: profile.outlineSize,
          },
          resource: {
            primitive: profile.primitive,
          },
          size: profile.size,
          type: "icon",
        },
      ],
      type: "point-3d",
      verticalOffset: {
        maxWorldLength: profile.maxWorldLength,
        minWorldLength: 60,
        screenLength: profile.screenLength,
      },
    } as unknown as Graphic["symbol"],
  });
}

function createFloodConstraintGraphic(
  runtime: ArcGISRuntime,
  marker: FloodConstraintMapMarker,
) {
  const profile = getFloodConstraintMarkerProfile(marker);

  return new runtime.Graphic({
    attributes: {
      buildabilityImpact: marker.buildabilityImpact,
      dominantFloodZone: marker.dominantFloodZone,
      floodConstraintScore: marker.floodConstraintScore,
      floodReviewRequired: marker.floodReviewRequired,
      floodSeverityClass: marker.floodSeverityClass,
      floodwayPresent: marker.floodwayPresent,
      graphicRole: "flood-constraint",
      officialParcelId: marker.officialParcelId,
      percentParcelConstrained: marker.percentParcelConstrained,
      pin14: marker.pin14,
      sfhaPresent: marker.sfhaPresent,
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
            color: profile.color,
          },
          outline: {
            color: profile.outlineColor,
            size: profile.outlineSize,
          },
          resource: {
            primitive: profile.primitive,
          },
          size: profile.size,
          type: "icon",
        },
      ],
      type: "point-3d",
      verticalOffset: {
        maxWorldLength: profile.maxWorldLength,
        minWorldLength: 45,
        screenLength: profile.screenLength,
      },
    } as unknown as Graphic["symbol"],
  });
}

function createFemaFloodZoneGraphic(
  runtime: ArcGISRuntime,
  polygon: FloodZoneMapPolygon,
) {
  const rings = convertGeoJsonPolygonCoordinatesToArcGisRings(
    polygon.geometry,
  );

  if (!rings.length) {
    console.warn("FEMA flood zone geometry could not be converted", {
      floodZoneInternalId: polygon.floodZoneInternalId,
      type: polygon.geometry.type,
    });
    return null;
  }

  const profile = getFemaFloodZoneSymbolProfile(polygon);

  return new runtime.Graphic({
    attributes: {
      fldArId: polygon.fldArId,
      floodConstraintType: polygon.floodConstraintType,
      floodSeverityClass: polygon.floodSeverityClass,
      floodZoneCode: polygon.floodZoneCode,
      floodZoneInternalId: polygon.floodZoneInternalId,
      gfid: polygon.gfid,
      globalid: polygon.globalid,
      graphicRole: "fema-flood-zone",
      sourceLayer: polygon.sourceLayer,
      sourceObjectid: polygon.sourceObjectid,
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: {
        wkid: polygon.geometry.spatialReference.wkid,
      },
    }),
    popupTemplate: {
      content:
        "Official FEMA NFHL Layer 28 source polygon. Parcel-based review status is available through the Flood Constraints layer.",
      title: `FEMA Flood Zone ${polygon.floodZoneCode ?? ""}`.trim(),
    },
    symbol: {
      symbolLayers: [
        {
          material: {
            color: profile.fillColor,
          },
          outline: {
            color: profile.outlineColor,
            size: profile.outlineSize,
          },
          type: "fill",
        },
      ],
      type: "polygon-3d",
    } as unknown as Graphic["symbol"],
  });
}

function createSchoolUtilizationZoneGraphic(
  runtime: ArcGISRuntime,
  polygon: SchoolUtilizationZoneMapPolygon,
  selectedZoneId: string | null = null,
) {
  const rings = convertGeoJsonPolygonCoordinatesToArcGisRings(
    polygon.geometry,
  );

  if (!rings.length) {
    console.warn("School utilization zone geometry could not be converted", {
      schoolName: polygon.schoolName,
      type: polygon.geometry.type,
      zoneId: polygon.zoneId,
    });
    return null;
  }

  const profile = getSchoolUtilizationZoneSymbolProfile(
    polygon,
    polygon.zoneId === selectedZoneId ? "selected" : "default",
  );

  return new runtime.Graphic({
    attributes: {
      graphicRole: "school-utilization-zone",
      matchConfidence: polygon.matchConfidence,
      matchedSchoolReferenceId: polygon.matchedSchoolReferenceId,
      needsVerification: polygon.needsVerification,
      schoolLevel: polygon.schoolLevel,
      schoolName: polygon.schoolName,
      schoolYear: polygon.schoolYear,
      sourceConfidence: polygon.sourceConfidence,
      utilizationClass: polygon.utilizationClass,
      utilizationPct: polygon.utilizationPct,
      zoneId: polygon.zoneId,
      zoneMatchConfidence: polygon.zoneMatchConfidence,
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: {
        wkid: polygon.geometry.spatialReference.wkid,
      },
    }),
    popupTemplate: {
      content:
        "Presentation-derived SY 2024-2025 utilization seed. Needs verification against official enrollment and capacity data. Not official capacity scoring.",
      title: getSchoolUtilizationPopupTitle(polygon),
    },
    symbol: createSchoolUtilizationZoneSymbol(profile),
  });
}

function getFemaFloodZoneSymbolProfile(polygon: FloodZoneMapPolygon) {
  if (
    polygon.floodSeverityClass === "severe" ||
    polygon.floodConstraintType === "floodway"
  ) {
    return {
      fillColor: [255, 91, 91, 0.18],
      outlineColor: [255, 91, 91, 0.95],
      outlineSize: 2,
    };
  }

  if (
    polygon.floodSeverityClass === "high" ||
    polygon.floodConstraintType === "special_flood_hazard_area"
  ) {
    return {
      fillColor: [255, 180, 84, 0.15],
      outlineColor: [255, 180, 84, 0.88],
      outlineSize: 1.6,
    };
  }

  if (polygon.floodSeverityClass === "moderate") {
    return {
      fillColor: [247, 217, 76, 0.12],
      outlineColor: [247, 217, 76, 0.78],
      outlineSize: 1.2,
    };
  }

  return {
    fillColor: [158, 182, 199, 0.08],
    outlineColor: [158, 182, 199, 0.42],
    outlineSize: 0.8,
  };
}

type SchoolUtilizationZoneInteractionState = "default" | "hover" | "selected";

function createSchoolUtilizationZoneSymbol(profile: {
  fillColor: number[];
  outlineColor: number[];
  outlineSize: number;
}): Graphic["symbol"] {
  return {
    symbolLayers: [
      {
        material: {
          color: profile.fillColor,
        },
        outline: {
          color: profile.outlineColor,
          size: profile.outlineSize,
        },
        type: "fill",
      },
    ],
    type: "polygon-3d",
  } as unknown as Graphic["symbol"];
}

function getSchoolUtilizationZoneSymbolProfile(
  polygon: SchoolUtilizationZoneMapPolygon,
  state: SchoolUtilizationZoneInteractionState = "default",
) {
  return getSchoolUtilizationZoneSymbolProfileForValues(
    {
      matchedSchoolReferenceId: polygon.matchedSchoolReferenceId,
      utilizationClass: polygon.utilizationClass,
      utilizationPct: polygon.utilizationPct,
    },
    state,
  );
}

function getSchoolUtilizationZoneSymbolProfileForValues(
  values: {
    matchedSchoolReferenceId: string | null;
    utilizationClass: string | null;
    utilizationPct: number | null;
  },
  state: SchoolUtilizationZoneInteractionState = "default",
) {
  let profile: {
    fillColor: number[];
    outlineColor: number[];
    outlineSize: number;
  };

  if (
    !values.matchedSchoolReferenceId ||
    values.utilizationPct === null ||
    values.utilizationClass === null
  ) {
    profile = {
      fillColor: [148, 163, 184, 0.09],
      outlineColor: [168, 85, 247, 0.72],
      outlineSize: 1.35,
    };
  } else {
    switch (values.utilizationClass) {
      case "under_capacity":
        profile = {
          fillColor: [56, 189, 248, 0.12],
          outlineColor: [125, 211, 252, 0.92],
          outlineSize: 1.4,
        };
        break;
      case "approaching_capacity":
      case "near_capacity":
        profile = {
          fillColor: [250, 204, 21, 0.15],
          outlineColor: [250, 204, 21, 0.96],
          outlineSize: 1.7,
        };
        break;
      case "over_capacity":
        profile = {
          fillColor: [249, 115, 22, 0.18],
          outlineColor: [251, 146, 60, 0.98],
          outlineSize: 2,
        };
        break;
      case "severely_over_capacity":
        profile = {
          fillColor: [236, 72, 153, 0.2],
          outlineColor: [244, 63, 94, 1],
          outlineSize: 2.35,
        };
        break;
      default:
        profile = {
          fillColor: [148, 163, 184, 0.08],
          outlineColor: [148, 163, 184, 0.58],
          outlineSize: 1,
        };
    }
  }

  return enhanceSchoolUtilizationZoneSymbolProfile(profile, state);
}

function enhanceSchoolUtilizationZoneSymbolProfile(
  profile: {
    fillColor: number[];
    outlineColor: number[];
    outlineSize: number;
  },
  state: SchoolUtilizationZoneInteractionState,
) {
  if (state === "selected") {
    return {
      fillColor: [
        profile.fillColor[0] ?? 148,
        profile.fillColor[1] ?? 163,
        profile.fillColor[2] ?? 184,
        Math.min((profile.fillColor[3] ?? 0.12) + 0.08, 0.32),
      ],
      outlineColor: [
        profile.outlineColor[0] ?? 255,
        profile.outlineColor[1] ?? 255,
        profile.outlineColor[2] ?? 255,
        1,
      ],
      outlineSize: profile.outlineSize + 1.25,
    };
  }

  if (state === "hover") {
    return {
      fillColor: [
        profile.fillColor[0] ?? 148,
        profile.fillColor[1] ?? 163,
        profile.fillColor[2] ?? 184,
        Math.min((profile.fillColor[3] ?? 0.12) + 0.04, 0.26),
      ],
      outlineColor: [
        profile.outlineColor[0] ?? 255,
        profile.outlineColor[1] ?? 255,
        profile.outlineColor[2] ?? 255,
        Math.min((profile.outlineColor[3] ?? 0.85) + 0.12, 1),
      ],
      outlineSize: profile.outlineSize + 0.65,
    };
  }

  return profile;
}

function updateSchoolUtilizationZoneInteractionSymbols(
  schoolLayer: GraphicsLayer | null,
  selectedZoneId: string | null,
  hoveredZoneId: string | null,
) {
  if (!schoolLayer) {
    return;
  }

  schoolLayer.graphics.toArray().forEach((graphic) => {
    const attributes = graphic.attributes ?? {};

    if (attributes.graphicRole !== "school-utilization-zone") {
      return;
    }

    const zoneId = stringAttribute(attributes.zoneId);
    const state: SchoolUtilizationZoneInteractionState =
      selectedZoneId && zoneId === selectedZoneId
        ? "selected"
        : hoveredZoneId && zoneId === hoveredZoneId
          ? "hover"
          : "default";

    graphic.symbol = createSchoolUtilizationZoneSymbol(
      getSchoolUtilizationZoneSymbolProfileForValues(
        {
          matchedSchoolReferenceId: stringAttribute(
            attributes.matchedSchoolReferenceId,
          ),
          utilizationClass: stringAttribute(attributes.utilizationClass),
          utilizationPct: numberAttribute(attributes.utilizationPct),
        },
        state,
      ),
    );
  });
}

function getDevelopmentHotspotMarkerProfile(
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
) {
  const segment =
    activePermitSegment ??
    marker.dominantPermitSegment ??
    "administrative_or_unknown";
  const selectedSegmentCount = getSelectedSegmentPermitCount(marker, segment);
  const intensity = getDevelopmentHotspotMarkerIntensity(selectedSegmentCount);
  const segmentProfile = getPermitSegmentVisualProfile(segment);
  const sizeProfile = getDevelopmentHotspotSizeProfile(
    selectedSegmentCount,
    intensity,
  );

  return {
    ...segmentProfile,
    ...sizeProfile,
    segment,
    selectedSegmentCount,
    selectedSegmentIntensity: intensity,
    selectedSegmentScore: null,
  };
}

function getDevelopmentHotspotMarkerIntensity(selectedSegmentCount: number) {
  return Math.min(Math.max(selectedSegmentCount / 40, 0), 1);
}

function getDevelopmentHotspotSizeProfile(
  selectedSegmentCount: number,
  intensity: number,
) {
  const tier = getDevelopmentHotspotMarkerTier(selectedSegmentCount);
  const size = getDevelopmentHotspotMarkerSize(selectedSegmentCount, intensity);
  const haloSize = Math.round(size * 1.72);

  return {
    haloOutlineColor: [255, 255, 255, 0.1],
    haloSize,
    maxWorldLength: Math.round(size * 18),
    outlineSize:
      tier === "very_high"
        ? 2.8
        : tier === "high"
          ? 2.3
          : tier === "moderate"
            ? 1.8
            : 1.4,
    screenLength: Math.round(size * 1.55),
    size,
    tier,
  };
}

function getDevelopmentHotspotMarkerSize(
  selectedSegmentCount: number,
  intensity: number,
) {
  if (selectedSegmentCount >= 26) {
    return Math.min(46, 36 + Math.log10(selectedSegmentCount - 24) * 7);
  }

  if (selectedSegmentCount >= 11) {
    return 27 + Math.min(8, (selectedSegmentCount - 11) * 0.55);
  }

  if (selectedSegmentCount >= 3) {
    return 18 + Math.min(8, (selectedSegmentCount - 3) * 0.9);
  }

  return 12 + Math.max(selectedSegmentCount, intensity * 2) * 2.5;
}

function getDevelopmentHotspotMarkerTier(selectedSegmentCount: number) {
  if (selectedSegmentCount >= 26) {
    return "very_high";
  }

  if (selectedSegmentCount >= 11) {
    return "high";
  }

  if (selectedSegmentCount >= 3) {
    return "moderate";
  }

  return "low";
}

function getSelectedSegmentPermitCount(
  marker: DevelopmentHotspotMapMarker,
  segment: string | null | undefined,
) {
  switch (segment) {
    case "residential_growth":
      return marker.residentialGrowthPermits;
    case "commercial_activity":
      return marker.commercialActivityPermits;
    case "redevelopment_signal":
      return marker.redevelopmentSignalPermits;
    case "minor_maintenance":
      return marker.minorMaintenancePermits;
    case "demolition":
      return marker.demolitionPermits;
    case "industrial_activity":
      return marker.industrialActivityPermits;
    case "institutional_activity":
      return marker.institutionalActivityPermits;
    default:
      return 0;
  }
}

function getPermitSegmentVisualProfile(segment: string | null | undefined) {
  switch (segment) {
    case "residential_growth":
      return {
        color: [104, 216, 255, 0.9],
        haloColor: [104, 216, 255, 0.18],
        outlineColor: [223, 248, 255, 0.95],
        primitive: "circle",
      };
    case "commercial_activity":
      return {
        color: [255, 180, 84, 0.94],
        haloColor: [255, 180, 84, 0.18],
        outlineColor: [255, 238, 203, 0.96],
        primitive: "square",
      };
    case "redevelopment_signal":
      return {
        color: [188, 139, 255, 0.92],
        haloColor: [188, 139, 255, 0.18],
        outlineColor: [239, 224, 255, 0.95],
        primitive: "kite",
      };
    case "minor_maintenance":
      return {
        color: [148, 163, 184, 0.74],
        haloColor: [148, 163, 184, 0.14],
        outlineColor: [226, 232, 240, 0.82],
        primitive: "circle",
      };
    case "demolition":
      return {
        color: [185, 28, 28, 0.95],
        haloColor: [185, 28, 28, 0.2],
        outlineColor: [255, 226, 226, 0.94],
        primitive: "x",
      };
    case "industrial_activity":
      return {
        color: [214, 161, 70, 0.94],
        haloColor: [214, 161, 70, 0.18],
        outlineColor: [255, 238, 196, 0.92],
        primitive: "square",
      };
    case "institutional_activity":
      return {
        color: [92, 211, 143, 0.9],
        haloColor: [92, 211, 143, 0.18],
        outlineColor: [210, 255, 228, 0.92],
        primitive: "triangle",
      };
    default:
      return {
        color: [100, 116, 139, 0.68],
        haloColor: [100, 116, 139, 0.12],
        outlineColor: [226, 232, 240, 0.72],
        primitive: "circle",
      };
  }
}

function getFloodConstraintMarkerProfile(marker: FloodConstraintMapMarker) {
  const strength = getFloodConstraintMarkerStrength(marker);

  if (marker.floodSeverityClass === "severe" || marker.floodwayPresent) {
    return {
      color: [255, 91, 91, 0.96],
      maxWorldLength: 480,
      outlineColor: [255, 255, 255, 0.96],
      outlineSize: 2,
      primitive: "triangle",
      screenLength: 34 + strength * 14,
      size: 19 + strength * 10,
    };
  }

  if (marker.floodSeverityClass === "high" || marker.sfhaPresent) {
    return {
      color: [255, 180, 84, 0.92],
      maxWorldLength: 420,
      outlineColor: [255, 255, 255, 0.92],
      outlineSize: 1.7,
      primitive: "kite",
      screenLength: 28 + strength * 11,
      size: 16 + strength * 8,
    };
  }

  return {
    color: [247, 217, 76, 0.9],
    maxWorldLength: 360,
    outlineColor: [35, 31, 12, 0.72],
    outlineSize: 1.5,
    primitive: "circle",
    screenLength: 24 + strength * 8,
    size: 13 + strength * 6,
  };
}

function getFloodConstraintMarkerStrength(marker: FloodConstraintMapMarker) {
  const score =
    typeof marker.floodConstraintScore === "number" &&
    Number.isFinite(marker.floodConstraintScore)
      ? marker.floodConstraintScore / 100
      : null;
  const constrainedPercent =
    typeof marker.percentParcelConstrained === "number" &&
    Number.isFinite(marker.percentParcelConstrained)
      ? marker.percentParcelConstrained / 100
      : null;
  const rawStrength = Math.max(score ?? 0, constrainedPercent ?? 0);

  return Math.min(Math.max(rawStrength, 0), 1);
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

function formatDevelopmentDomainLabel(segment: string | null | undefined) {
  switch (segment) {
    case "residential_growth":
      return "Residential";
    case "commercial_activity":
      return "Commercial";
    case "industrial_activity":
      return "Industrial";
    case "institutional_activity":
      return "Institutional";
    case "redevelopment_signal":
      return "Redevelopment";
    case "minor_maintenance":
      return "Maintenance";
    case "demolition":
      return "Demolition";
    default:
      return "Unknown";
  }
}

function formatFloodPopupLabel(value: string | null | undefined) {
  return formatHotspotPopupLabel(value);
}

function formatSchoolUtilizationClassLabel(value: string | null | undefined) {
  switch (value) {
    case "under_capacity":
      return "Under capacity";
    case "approaching_capacity":
    case "near_capacity":
      return "Approaching capacity";
    case "over_capacity":
      return "Over capacity";
    case "severely_over_capacity":
      return "Severely over capacity";
    default:
      return "Review needed";
  }
}

function formatSchoolUtilizationSourceLabel(
  value: string | null | undefined,
) {
  return value === "presentation_derived"
    ? "Presentation-derived"
    : formatFloodPopupLabel(value);
}

function formatSchoolUtilizationTitle(
  info: SchoolUtilizationZoneInfoCard,
) {
  const schoolName = info.schoolName ?? "School zone";
  const utilization = formatFloodPercent(info.utilizationPct);

  return utilization ? `${schoolName} · ${utilization}` : schoolName;
}

function getSchoolUtilizationPopupTitle(
  polygon: SchoolUtilizationZoneMapPolygon,
) {
  const schoolName = polygon.schoolName ?? "School utilization zone";

  if (typeof polygon.utilizationPct === "number") {
    return `${schoolName} · ${polygon.utilizationPct.toFixed(0)}%`;
  }

  return schoolName;
}

async function handleDevelopmentHotspotClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  hotspotLayer: GraphicsLayer | null,
  onHotspotInfo: (hotspotInfo: DevelopmentHotspotInfoCard) => void,
  onFloodInfoClose: () => void,
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
    onFloodInfoClose();
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

async function handleFloodConstraintClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  floodLayer: GraphicsLayer | null,
  onFloodInfo: (floodInfo: FloodConstraintInfoCard) => void,
  onHotspotInfoClose: () => void,
) {
  if (!floodLayer || !floodLayer.visible) {
    return false;
  }

  try {
    const response = await view.hitTest(event, {
      include: [floodLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const floodGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "flood-constraint",
    )?.graphic;
    const officialParcelId =
      floodGraphic?.attributes?.officialParcelId as string | undefined;

    if (!floodGraphic || !officialParcelId) {
      return false;
    }

    closeSceneViewPopup(view);
    onHotspotInfoClose();
    onFloodInfo(createFloodConstraintInfoCard(floodGraphic));

    console.debug("[CFS flood constraints]", "flood marker selected", {
      buildabilityImpact: floodGraphic?.attributes?.buildabilityImpact,
      dominantFloodZone: floodGraphic?.attributes?.dominantFloodZone,
      floodSeverityClass: floodGraphic?.attributes?.floodSeverityClass,
      officialParcelId,
      percentParcelConstrained:
        floodGraphic?.attributes?.percentParcelConstrained,
      pin14: floodGraphic?.attributes?.pin14,
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
    console.warn("Flood constraint hit test failed", error);
    return false;
  }
}

async function handleFemaFloodZoneClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  floodZoneLayer: GraphicsLayer | null,
  onFloodZoneInfo: (floodZoneInfo: FloodZoneInfoCard) => void,
  onHotspotInfoClose: () => void,
  onFloodInfoClose: () => void,
) {
  if (!floodZoneLayer || !floodZoneLayer.visible) {
    return false;
  }

  try {
    const response = await view.hitTest(event, {
      include: [floodZoneLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const floodZoneGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "fema-flood-zone",
    )?.graphic;

    if (!floodZoneGraphic) {
      return false;
    }

    closeSceneViewPopup(view);
    onHotspotInfoClose();
    onFloodInfoClose();
    onFloodZoneInfo(createFloodZoneInfoCard(floodZoneGraphic));

    console.debug("[CFS FEMA flood zones]", "source polygon selected", {
      floodConstraintType:
        floodZoneGraphic?.attributes?.floodConstraintType,
      floodSeverityClass: floodZoneGraphic?.attributes?.floodSeverityClass,
      floodZoneCode: floodZoneGraphic?.attributes?.floodZoneCode,
      sourceObjectid: floodZoneGraphic?.attributes?.sourceObjectid,
    });

    return true;
  } catch (error) {
    console.warn("FEMA flood zone hit test failed", error);
    return false;
  }
}

async function handleSchoolUtilizationZoneClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  schoolLayer: GraphicsLayer | null,
  onSchoolInfo: (schoolInfo: SchoolUtilizationZoneInfoCard) => void,
  onHotspotInfoClose: () => void,
  onFloodInfoClose: () => void,
  onFloodZoneInfoClose: () => void,
) {
  if (!schoolLayer || !schoolLayer.visible) {
    return false;
  }

  try {
    const response = await view.hitTest(event, {
      include: [schoolLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const schoolGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "school-utilization-zone",
    )?.graphic;

    if (!schoolGraphic) {
      return false;
    }

    closeSceneViewPopup(view);
    onHotspotInfoClose();
    onFloodInfoClose();
    onFloodZoneInfoClose();
    onSchoolInfo(createSchoolUtilizationZoneInfoCard(schoolGraphic));

    console.debug("[CFS school utilization zones]", "zone selected", {
      schoolName: schoolGraphic?.attributes?.schoolName,
      utilizationClass: schoolGraphic?.attributes?.utilizationClass,
      utilizationPct: schoolGraphic?.attributes?.utilizationPct,
      zoneId: schoolGraphic?.attributes?.zoneId,
    });

    return true;
  } catch (error) {
    console.warn("School utilization zone hit test failed", error);
    return false;
  }
}

async function handleSchoolUtilizationZoneHover(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  schoolLayer: GraphicsLayer | null,
  container: HTMLDivElement | null,
  onSchoolHover: (
    schoolInfo: SchoolUtilizationZoneInfoCard,
    position: OverlayCardPosition,
  ) => void,
  onSchoolHoverClear: () => void,
) {
  if (!schoolLayer || !schoolLayer.visible) {
    onSchoolHoverClear();
    return;
  }

  try {
    const response = await view.hitTest(event, {
      include: [schoolLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const schoolGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "school-utilization-zone",
    )?.graphic;

    if (!schoolGraphic) {
      onSchoolHoverClear();
      return;
    }

    onSchoolHover(
      createSchoolUtilizationZoneInfoCard(schoolGraphic),
      getSchoolUtilizationHoverPosition(container, event),
    );
  } catch (error) {
    onSchoolHoverClear();
    console.warn("School utilization hover hit test failed", error);
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
    dominantGrowthSignal: stringAttribute(attributes.dominantGrowthSignal),
    dominantPermitSegment: stringAttribute(attributes.dominantPermitSegment),
    dominantZoningCodeRaw: stringAttribute(attributes.dominantZoningCodeRaw),
    highValuePermits: numberAttribute(attributes.highValuePermits) ?? 0,
    majorValuePermits: numberAttribute(attributes.majorValuePermits) ?? 0,
    officialParcelId:
      stringAttribute(attributes.officialParcelId) ?? "Unknown parcel",
    permitSignalScoreMax: numberAttribute(attributes.permitSignalScoreMax),
    pin14: stringAttribute(attributes.pin14),
    recentPermitCount1yr: numberAttribute(attributes.recentPermitCount1yr) ?? 0,
    recentPermitCount3yr: numberAttribute(attributes.recentPermitCount3yr) ?? 0,
    renderedPermitSegment: stringAttribute(attributes.renderedPermitSegment),
    selectedSegmentCount: numberAttribute(attributes.selectedSegmentCount),
    selectedSegmentIntensity: numberAttribute(
      attributes.selectedSegmentIntensity,
    ),
    selectedSegmentScore: numberAttribute(attributes.selectedSegmentScore),
    selectedSegmentSizeTier: stringAttribute(
      attributes.selectedSegmentSizeTier,
    ),
    totalPermitCount: numberAttribute(attributes.totalPermitCount) ?? 0,
    zoningJurisdictionName: stringAttribute(attributes.zoningJurisdictionName),
  };
}

function createFloodZoneInfoCard(graphic: Graphic): FloodZoneInfoCard {
  const attributes = graphic.attributes ?? {};

  return {
    floodConstraintType: stringAttribute(attributes.floodConstraintType),
    floodSeverityClass: stringAttribute(attributes.floodSeverityClass),
    floodZoneCode: stringAttribute(attributes.floodZoneCode),
    fldArId: stringAttribute(attributes.fldArId),
    sourceLayer: stringAttribute(attributes.sourceLayer),
    sourceObjectid: numberAttribute(attributes.sourceObjectid),
  };
}

function createSchoolUtilizationZoneInfoCard(
  graphic: Graphic,
): SchoolUtilizationZoneInfoCard {
  const attributes = graphic.attributes ?? {};

  return {
    matchConfidence: stringAttribute(attributes.matchConfidence),
    matchedSchoolReferenceId: stringAttribute(
      attributes.matchedSchoolReferenceId,
    ),
    needsVerification: Boolean(attributes.needsVerification),
    schoolLevel: stringAttribute(attributes.schoolLevel),
    schoolName: stringAttribute(attributes.schoolName),
    schoolYear: stringAttribute(attributes.schoolYear),
    sourceConfidence: stringAttribute(attributes.sourceConfidence),
    utilizationClass: stringAttribute(attributes.utilizationClass),
    utilizationPct: numberAttribute(attributes.utilizationPct),
    zoneId: stringAttribute(attributes.zoneId),
    zoneMatchConfidence: stringAttribute(attributes.zoneMatchConfidence),
  };
}

function createFloodConstraintInfoCard(graphic: Graphic): FloodConstraintInfoCard {
  const attributes = graphic.attributes ?? {};

  return {
    buildabilityImpact: stringAttribute(attributes.buildabilityImpact),
    dominantFloodZone: stringAttribute(attributes.dominantFloodZone),
    floodConstraintScore: numberAttribute(attributes.floodConstraintScore),
    floodSeverityClass: stringAttribute(attributes.floodSeverityClass),
    floodwayPresent: Boolean(attributes.floodwayPresent),
    officialParcelId:
      stringAttribute(attributes.officialParcelId) ?? "Unknown parcel",
    percentParcelConstrained: numberAttribute(
      attributes.percentParcelConstrained,
    ),
    pin14: stringAttribute(attributes.pin14),
    sfhaPresent: Boolean(attributes.sfhaPresent),
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

function resizeSceneView(view: SceneView) {
  const resizableView = view as SceneView & {
    resize?: () => void;
  };

  resizableView.resize?.();
}

function stringAttribute(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberAttribute(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSchoolUtilizationHoverPosition(
  container: HTMLDivElement | null,
  event: Parameters<SceneView["hitTest"]>[0],
): OverlayCardPosition {
  const pointerEvent = event as { x?: number; y?: number };
  const rect = container?.getBoundingClientRect();
  const rawX =
    (rect?.left ?? 0) +
    (typeof pointerEvent.x === "number" ? pointerEvent.x : 0) +
    16;
  const rawY =
    (rect?.top ?? 0) +
    (typeof pointerEvent.y === "number" ? pointerEvent.y : 0) +
    16;
  const cardWidth = 280;
  const cardHeight = 150;
  const maxX = Math.max(12, window.innerWidth - cardWidth - 12);
  const maxY = Math.max(12, window.innerHeight - cardHeight - 12);

  return {
    x: Math.min(Math.max(12, rawX), maxX),
    y: Math.min(Math.max(12, rawY), maxY),
  };
}

function createParcelFocusGraphics(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
  zoom: number,
) {
  const graphics: Graphic[] = [];
  const boundaryGraphic = createParcelBoundaryGraphic(runtime, focus);
  const markerGraphic = createParcelFocusMarkerGraphic(runtime, focus, zoom);

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
  zoom: number,
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
    symbol: createParcelFocusMarkerSymbol(zoom),
  });
}

function updateParcelFocusMarkerScale(
  focusLayer: GraphicsLayer,
  zoom: number,
) {
  const markerGraphic = focusLayer.graphics
    .toArray()
    .find((graphic) => graphic.attributes?.graphicRole === "parcel-marker");

  if (!markerGraphic) {
    return;
  }

  markerGraphic.symbol = createParcelFocusMarkerSymbol(zoom);
}

function createParcelFocusMarkerSymbol(zoom: number) {
  const profile = getParcelFocusMarkerProfile(zoom);
  const symbolLayers: Array<Record<string, unknown>> = [
    {
      material: {
        color: [104, 216, 255, profile.iconOpacity],
      },
      outline: {
        color: [255, 255, 255, profile.outlineOpacity],
        size: profile.outlineSize,
      },
      resource: {
        primitive: "circle",
      },
      size: profile.iconSize,
      type: "icon",
    },
  ];

  if (profile.objectSize > 0) {
    symbolLayers.push({
      material: {
        color: [216, 184, 106, profile.objectOpacity],
      },
      resource: {
        primitive: "sphere",
      },
      depth: profile.objectSize,
      height: profile.objectSize,
      type: "object",
      width: profile.objectSize,
    });
  }

  return {
    callout: {
      color: [104, 216, 255, profile.calloutOpacity],
      size: profile.calloutSize,
      type: "line",
    },
    symbolLayers,
    type: "point-3d",
    verticalOffset: {
      maxWorldLength: profile.maxWorldLength,
      minWorldLength: 45,
      screenLength: profile.screenOffset,
    },
  } as unknown as Graphic["symbol"];
}

function getParcelFocusMarkerProfile(zoom: number) {
  if (zoom >= 17) {
    return {
      calloutOpacity: 0.55,
      calloutSize: 1,
      iconOpacity: 0.22,
      iconSize: 16,
      maxWorldLength: 220,
      objectOpacity: 0,
      objectSize: 0,
      outlineOpacity: 0.9,
      outlineSize: 2,
      screenOffset: 24,
    };
  }

  if (zoom >= 16) {
    return {
      calloutOpacity: 0.65,
      calloutSize: 1,
      iconOpacity: 0.32,
      iconSize: 20,
      maxWorldLength: 320,
      objectOpacity: 0.35,
      objectSize: 34,
      outlineOpacity: 0.92,
      outlineSize: 2,
      screenOffset: 30,
    };
  }

  if (zoom >= 14) {
    return {
      calloutOpacity: 0.78,
      calloutSize: 1.5,
      iconOpacity: 0.58,
      iconSize: 26,
      maxWorldLength: 480,
      objectOpacity: 0.55,
      objectSize: 64,
      outlineOpacity: 0.95,
      outlineSize: 2,
      screenOffset: 38,
    };
  }

  return {
    calloutOpacity: 0.9,
    calloutSize: 2,
    iconOpacity: 0.86,
    iconSize: 34,
    maxWorldLength: 700,
    objectOpacity: 0.82,
    objectSize: 110,
    outlineOpacity: 0.95,
    outlineSize: 2,
    screenOffset: 50,
  };
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
    symbol: createParcelCageHighlightSymbol(),
  });
}

function createParcelCageHighlightSymbol() {
  // SceneView reads flat fills as hovering sheets, so the selected parcel uses
  // a low translucent extrusion with visible edges to read as a ground-tied cage.
  return {
    symbolLayers: [
      {
        edges: {
          color: [255, 218, 120, 0.98],
          size: 2.6,
          type: "solid",
        },
        material: {
          color: [104, 216, 255, 0.18],
        },
        size: 10,
        type: "extrude",
      },
    ],
    type: "polygon-3d",
  } as unknown as Graphic["symbol"];
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
  return convertGeoJsonPolygonCoordinatesToArcGisRings(geometry);
}

function convertGeoJsonPolygonCoordinatesToArcGisRings(
  geometry:
    | {
        coordinates: unknown;
        type: "MultiPolygon" | "Polygon" | string;
      }
    | null
    | undefined,
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

function getParcelFocusTargetZoom(focus: ParcelMapFocus) {
  return focus.centroid ? 18 : 17;
}

function buildParcelFocusGoToTarget(
  runtime: ArcGISRuntime,
  focus: ParcelMapFocus,
) {
  if (focus.centroid) {
    return {
      center: createParcelFocusPoint(runtime, focus),
      zoom: getParcelFocusTargetZoom(focus),
    } as Parameters<SceneView["goTo"]>[0];
  }

  return {
    target: createParcelFocusExtent(runtime, focus),
    zoom: getParcelFocusTargetZoom(focus),
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
