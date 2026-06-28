"use client";

import type Graphic from "@arcgis/core/Graphic";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapView from "@arcgis/core/views/MapView";
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
import {
  formatDevelopmentCount,
} from "@/data/intelligence/developmentActivityMetrics";
import {
  formatModelResearchDriverLabel,
  formatRelativeDevelopmentSignalBand,
} from "@/data/intelligence/developmentModelLab";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useModelResearchPreviewLayer } from "@/hooks/useModelResearchPreviewLayer";
import { useSchoolPressureLayer } from "@/hooks/useSchoolPressureLayer";
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
import {
  getModeScopedActiveLayerIds,
  isExploreCountywideMode,
  isModelLabMode,
} from "@/lib/gis/layerModeOwnership";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import { createMapInteractionController } from "@/lib/gis/mapInteractionController";
import { createCabarrusSceneView } from "@/lib/gis/sceneViewFactory";
import {
  CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
  dispatchParcelMapFocusResult,
  resolveParcelMapFocus,
} from "@/lib/map/parcelMapFocus";
import { USE_DEMO_DATA } from "@/lib/api/client";
import {
  getDemoGeoJsonLayer,
  getDemoParcelFeatures,
  getDemoTransportationFeatures,
  type DemoGeoJsonFeature,
  type DemoGeoJsonGeometry,
} from "@/lib/demo-data/mapLayerClient";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import type {
  ParcelMapFocus,
  ParcelMapFocusRequestEventDetail,
} from "@/types/map/parcelFocus";
import type {
  DevelopmentHotspotMapDisplayMode,
  DevelopmentHotspotMapMarker,
  DevelopmentHotspotSegmentCounts,
  SelectedDevelopmentHotspotContext,
} from "@/types/map/developmentHotspots";
import type { FloodConstraintMapMarker } from "@/types/map/floodConstraints";
import type {
  FloodZoneExtent,
  FloodZoneMapPolygon,
} from "@/types/map/floodZones";
import type {
  SchoolUtilizationZoneMapPolygon,
  SelectedSchoolUtilizationZone,
} from "@/types/map/schoolUtilizationZones";
import type { SchoolPressureFeature } from "@/types/map/schoolPressure";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";
import type { MapOverlayViewMode } from "@/types/map/overlayViewModes";
import type {
  ModelResearchMapDisplayMode,
  ModelResearchMapSummary,
  OverviewCommandMode,
} from "@/types";

type ArcGISHandle = {
  remove: () => void;
};

type SceneView = MapView;

function allowsParcelSelectionGraphics(mode: OverviewCommandMode) {
  return (
    mode === "countywide" ||
    mode === "indicatorCenter" ||
    mode === "modelLab" ||
    mode === "parcel" ||
    mode === "snapshot"
  );
}

function getSelectedParcelGraphicsId(
  mode: OverviewCommandMode,
  selectedParcelId: string | null,
) {
  return allowsParcelSelectionGraphics(mode) ? selectedParcelId : null;
}

const MODEL_LAB_COUNTYWIDE_CLUSTER_SCALE = 78000;
const MODEL_LAB_INTERMEDIATE_CLUSTER_SCALE = 36000;
const MODEL_LAB_FINE_CLUSTER_SCALE = 9000;
const MODEL_LAB_INDIVIDUAL_SCALE = MODEL_LAB_FINE_CLUSTER_SCALE;
const MODEL_LAB_COUNTYWIDE_SCALE_THRESHOLD = MODEL_LAB_COUNTYWIDE_CLUSTER_SCALE;
const MODEL_LAB_CLUSTER_SCALE_THRESHOLD = MODEL_LAB_INTERMEDIATE_CLUSTER_SCALE;
const MODEL_LAB_DETAIL_SCALE_THRESHOLD = MODEL_LAB_INDIVIDUAL_SCALE;
const MODEL_LAB_COUNTYWIDE_MIN_SCALE = MODEL_LAB_COUNTYWIDE_SCALE_THRESHOLD;
const MODEL_LAB_CLUSTER_MIN_SCALE = MODEL_LAB_CLUSTER_SCALE_THRESHOLD;
const MODEL_LAB_COUNTYWIDE_CELL_SIZE_DEGREES = 0.08;
const MODEL_LAB_CLUSTER_CELL_SIZE_DEGREES = 0.038;
const MODEL_LAB_INTERMEDIATE_CELL_SIZE_DEGREES = MODEL_LAB_CLUSTER_CELL_SIZE_DEGREES;
const MODEL_LAB_FINE_CELL_SIZE_DEGREES = 0.014;
const MODEL_LAB_COUNTYWIDE_MAX_CELLS = 32;
const MODEL_LAB_CLUSTER_MAX_CELLS = 52;
const MODEL_LAB_INTERMEDIATE_MAX_CELLS = MODEL_LAB_CLUSTER_MAX_CELLS;
const MODEL_LAB_FINE_MAX_CELLS = 112;
const MODEL_LAB_PARCEL_DETAIL_MAX_MARKERS = 120;
const DEVELOPMENT_HOTSPOT_COUNTYWIDE_CLUSTER_SCALE = 78000;
const DEVELOPMENT_HOTSPOT_INTERMEDIATE_CLUSTER_SCALE = 36000;
const DEVELOPMENT_HOTSPOT_FINE_CLUSTER_SCALE = 9000;
const DEVELOPMENT_HOTSPOT_COUNTYWIDE_CELL_SIZE_DEGREES = 0.075;
const DEVELOPMENT_HOTSPOT_INTERMEDIATE_CELL_SIZE_DEGREES = 0.034;
const DEVELOPMENT_HOTSPOT_FINE_CELL_SIZE_DEGREES = 0.012;
const DEVELOPMENT_HOTSPOT_COUNTYWIDE_MAX_CELLS = 36;
const DEVELOPMENT_HOTSPOT_INTERMEDIATE_MAX_CELLS = 64;
const DEVELOPMENT_HOTSPOT_FINE_MAX_CELLS = 120;
const DEVELOPMENT_HOTSPOT_DETAIL_MAX_MARKERS = 160;

interface ParcelFocusBeacon {
  boundaryHighlighted: boolean;
  officialParcelId: string;
  pin14?: string | null;
  statusMessage: string;
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

interface CfsMapSnapshotCaptureResult {
  cameraSummary?: string;
  capturedAt?: string | null;
  dataUrl?: string | null;
  extentSummary?: string;
  failureReason?: string | null;
  status: "captured" | "failed" | "unavailable";
}

declare global {
  interface Window {
    __cfsCaptureMapSnapshot?: () => Promise<CfsMapSnapshotCaptureResult>;
  }
}

export function SceneViewContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parcelFocusCardRef = useRef<HTMLDivElement | null>(null);
  const floodInfoCardRef = useRef<HTMLDivElement | null>(null);
  const floodZoneInfoCardRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const layerRefs = useRef<OperationalLayerInstanceMap>({});
  const focusLayerRef = useRef<GraphicsLayer | null>(null);
  const hotspotLayerRef = useRef<GraphicsLayer | null>(null);
  const hotspotHeatmapLayerRef = useRef<FeatureLayer | null>(null);
  const floodConstraintLayerRef = useRef<GraphicsLayer | null>(null);
  const floodZoneLayerRef = useRef<GraphicsLayer | null>(null);
  const modelResearchPreviewLayerRef = useRef<GraphicsLayer | null>(null);
  const modelResearchHeatmapLayerRef = useRef<FeatureLayer | null>(null);
  const modelResearchGoToKeyRef = useRef<string | null>(null);
  const schoolPressureLayerRef = useRef<GraphicsLayer | null>(null);
  const schoolUtilizationZoneLayerRef = useRef<GraphicsLayer | null>(null);
  const lastFocusedParcelIdRef = useRef<string | null>(null);
  const latestFocusRequestParcelIdRef = useRef<string | null>(null);
  const overviewCommandModeRef = useRef<OverviewCommandMode>("countywide");
  const runtimeRef = useRef<ArcGISRuntime | null>(null);
  const activeLayerIdsRef = useRef<string[]>([]);
  const hoveredSchoolZoneIdRef = useRef<string | null>(null);
  const selectedSchoolZoneIdRef = useRef<string | null>(null);
  const parcelFocusCleanupFrameRef = useRef<number | null>(null);
  const schoolHoverFrameRef = useRef<number | null>(null);
  const schoolUtilizationHoverRef =
    useRef<SchoolUtilizationHoverCallout | null>(null);
  const focusBeaconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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
  const [modelResearchRenderTick, setModelResearchRenderTick] = useState(0);
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
    modelResearchOverlayEnabled,
    modelResearchViewMode,
    overviewCommandMode,
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
    setModelResearchMapSummary,
    setSelectedDevelopmentHotspotContext,
    setSelectedModelResearchContext,
    setSelectedSchoolUtilizationZone,
    toggleMapFocusMode,
  } = useDashboardState();
  const modelResearchPreviewLayer = useModelResearchPreviewLayer({
    enabled: overviewCommandMode === "modelLab" && modelResearchOverlayEnabled,
    limit: 720,
    signal: "all",
  });
  const exploreCountywideLayersActive =
    isExploreCountywideMode(overviewCommandMode);
  const schoolPressureLayerEnabled =
    exploreCountywideLayersActive && activeLayerIds.includes("school-pressure");
  const schoolPressureLayer = useSchoolPressureLayer({
    enabled: schoolPressureLayerEnabled,
  });
  const modelLabLayersActive = isModelLabMode(overviewCommandMode);
  const clearParcelSceneFocus = useCallback(() => {
    latestFocusRequestParcelIdRef.current = null;
    lastFocusedParcelIdRef.current = null;
    focusLayerRef.current?.removeAll();
    setFocusBeacon(null);
    setLastParcelFocusSummary(null);

    if (focusBeaconTimeoutRef.current) {
      clearTimeout(focusBeaconTimeoutRef.current);
      focusBeaconTimeoutRef.current = null;
    }
  }, []);
  const scheduleClearParcelSceneFocus = useCallback(() => {
    if (parcelFocusCleanupFrameRef.current !== null) {
      window.cancelAnimationFrame(parcelFocusCleanupFrameRef.current);
    }

    parcelFocusCleanupFrameRef.current = window.requestAnimationFrame(() => {
      parcelFocusCleanupFrameRef.current = null;
      clearParcelSceneFocus();
    });
  }, [clearParcelSceneFocus]);
  const selectedParcelIdRef = useRef(selectedParcelId);

  useEffect(() => {
    const scopedLayerIds = getModeScopedActiveLayerIds(
      activeLayerIds,
      overviewCommandMode,
    );
    activeLayerIdsRef.current = scopedLayerIds;
    applyOperationalLayerVisibility(layerRefs.current, scopedLayerIds);
  }, [activeLayerIds, overviewCommandMode]);

  useEffect(() => {
    selectedParcelIdRef.current = getSelectedParcelGraphicsId(
      overviewCommandModeRef.current,
      selectedParcelId,
    );
  }, [selectedParcelId]);

  useEffect(() => {
    overviewCommandModeRef.current = overviewCommandMode;
    let contextCleanupFrame: number | null = null;

    if (!isExploreCountywideMode(overviewCommandMode)) {
      const exploreLayers = [
        hotspotLayerRef.current,
        floodConstraintLayerRef.current,
        floodZoneLayerRef.current,
        schoolPressureLayerRef.current,
        schoolUtilizationZoneLayerRef.current,
      ];

      exploreLayers.forEach((layer) => {
        if (!layer) {
          return;
        }

        layer.removeAll();
        layer.visible = false;
      });
      removeFeatureLayerFromView(viewRef.current, hotspotHeatmapLayerRef.current);
      hotspotHeatmapLayerRef.current = null;
    }

    if (!isModelLabMode(overviewCommandMode)) {
      modelResearchPreviewLayerRef.current?.removeAll();
      removeFeatureLayerFromView(
        viewRef.current,
        modelResearchHeatmapLayerRef.current,
      );
      modelResearchHeatmapLayerRef.current = null;

      if (modelResearchPreviewLayerRef.current) {
        modelResearchPreviewLayerRef.current.visible = false;
      }

      modelResearchGoToKeyRef.current = null;
    }

    if (
      !isExploreCountywideMode(overviewCommandMode) ||
      !isModelLabMode(overviewCommandMode)
    ) {
      contextCleanupFrame = window.requestAnimationFrame(() => {
        contextCleanupFrame = null;

        if (!isExploreCountywideMode(overviewCommandMode)) {
          setSelectedDevelopmentHotspotContext(null);
          setFloodInfo(null);
          setFloodInfoPosition(null);
          setFloodZoneInfo(null);
          setFloodZoneInfoPosition(null);
          clearSelectedSchoolUtilizationZone();
          schoolUtilizationHoverRef.current = null;
          setSchoolUtilizationHover(null);
        }

        if (!isModelLabMode(overviewCommandMode)) {
          setSelectedModelResearchContext(null);
          setModelResearchMapSummary(createModelResearchMapSummary({
            displayMode: "off",
            overlayEnabled: false,
            totalFeatureCount: 0,
            visibleFeatureCount: 0,
          }));
        }
      });
    }

    if (!allowsParcelSelectionGraphics(overviewCommandMode)) {
      selectedParcelIdRef.current = null;
      latestFocusRequestParcelIdRef.current = null;
      lastFocusedParcelIdRef.current = null;
      focusLayerRef.current?.removeAll();
      scheduleClearParcelSceneFocus();
      updateSelectedParcelSymbols(
        getMockGraphicsLayerSubset(layerRefs.current, operationalLayerRegistry),
        null,
      );
    }

    return () => {
      if (contextCleanupFrame !== null) {
        window.cancelAnimationFrame(contextCleanupFrame);
      }
    };
  }, [
    clearSelectedSchoolUtilizationZone,
    overviewCommandMode,
    scheduleClearParcelSceneFocus,
    setModelResearchMapSummary,
    setSelectedDevelopmentHotspotContext,
    setSelectedModelResearchContext,
  ]);

  useEffect(() => {
    selectedSchoolZoneIdRef.current =
      selectedSchoolUtilizationZone?.zoneId ?? null;
    updateSchoolUtilizationZoneInteractionSymbols(
      schoolUtilizationZoneLayerRef.current,
      selectedSchoolZoneIdRef.current,
      hoveredSchoolZoneIdRef.current,
    );
    updateSchoolUtilizationZoneInteractionSymbols(
      schoolPressureLayerRef.current,
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
    setSelectedDevelopmentHotspotContext(null);
  }, [setSelectedDevelopmentHotspotContext]);

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

      if (!allowsParcelSelectionGraphics(overviewCommandModeRef.current)) {
        clearParcelSceneFocus();
        logParcelMapFocusDiagnostic(
          "SceneView parcel focus ignored outside parcel mode",
          {
            focusStatus: focusResult.focusStatus,
            officialParcelId: focus.officialParcelId,
            overviewCommandMode: overviewCommandModeRef.current,
          },
        );
        return;
      }

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

        if (!allowsParcelSelectionGraphics(overviewCommandModeRef.current)) {
          clearParcelSceneFocus();
          logParcelMapFocusDiagnostic(
            "SceneView parcel focus drawing skipped after mode change",
            {
              officialParcelId: focus.officialParcelId,
              overviewCommandMode: overviewCommandModeRef.current,
            },
          );
          return;
        }

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

        if (!allowsParcelSelectionGraphics(overviewCommandModeRef.current)) {
          clearParcelSceneFocus();
          logParcelMapFocusDiagnostic(
            "SceneView parcel focus result ignored after mode change",
            {
              officialParcelId: focus.officialParcelId,
              overviewCommandMode: overviewCommandModeRef.current,
            },
          );
          return;
        }

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
        registerSceneViewSnapshotCapture(runtime, view);

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
        modelResearchPreviewLayerRef.current =
          createModelResearchPreviewLayer(runtime);
        map.add(modelResearchPreviewLayerRef.current);
        schoolPressureLayerRef.current = createSchoolPressureLayer(runtime);
        map.add(schoolPressureLayerRef.current);
        schoolUtilizationZoneLayerRef.current =
          createSchoolUtilizationZoneLayer(runtime);
        map.add(schoolUtilizationZoneLayerRef.current);
        focusLayerRef.current = createParcelFocusLayer(runtime);
        map.add(focusLayerRef.current);
        layerRefs.current = layers;
        if (USE_DEMO_DATA) {
          void hydrateDemoReferenceLayers(runtime, layers);
        }
        applyOperationalLayerVisibility(layers, activeLayerIdsRef.current);
        updateSelectedParcelSymbols(
          getMockGraphicsLayerSubset(layers, operationalLayerRegistry),
          getSelectedParcelGraphicsId(
            overviewCommandModeRef.current,
            selectedParcelIdRef.current,
          ),
        );

        const interactionController = createMapInteractionController({
          emptyClickBehavior: "preserve-selection",
          getActiveLayerIds: () => activeLayerIdsRef.current,
          onError: (error) => {
            console.error("ArcGIS map interaction failed", error);
          },
          onSelection: (event) => {
            if (event.action === "select" && event.parcelId) {
              if (!allowsParcelSelectionGraphics(overviewCommandModeRef.current)) {
                updateSelectedParcelSymbols(
                  getMockGraphicsLayerSubset(
                    layerRefs.current,
                    operationalLayerRegistry,
                  ),
                  null,
                );
                return;
              }

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
          void (async () => {
            const handledHotspotClick = await handleDevelopmentHotspotClick(
              view,
              event,
              hotspotLayerRef.current,
              schoolPressureLayerRef.current,
              setSelectedDevelopmentHotspotContext,
              closeFloodInfo,
            );

            if (handledHotspotClick) {
              closeFloodZoneInfo();
              closeSchoolUtilizationInfo();
              return;
            }

            const handledModelResearchClick =
              await handleModelResearchPreviewClick(
                view,
                event,
                modelResearchPreviewLayerRef.current,
                setSelectedModelResearchContext,
              );

            if (handledModelResearchClick) {
              closeHotspotInfo();
              closeFloodInfo();
              closeFloodZoneInfo();
              closeSchoolUtilizationInfo();
              return;
            }

            const handledFloodClick = await handleFloodConstraintClick(
              view,
              event,
              floodConstraintLayerRef.current,
              setFloodInfo,
              closeHotspotInfo,
            );

            if (handledFloodClick) {
              closeFloodZoneInfo();
              closeSchoolUtilizationInfo();
              return;
            }

            const handledFloodZoneClick = await handleFemaFloodZoneClick(
              view,
              event,
              floodZoneLayerRef.current,
              setFloodZoneInfo,
              closeHotspotInfo,
              closeFloodInfo,
            );

            if (handledFloodZoneClick) {
              closeSchoolUtilizationInfo();
              return;
            }

            const handledSchoolPressureClick =
              await handleSchoolUtilizationZoneClick(
                view,
                event,
                schoolPressureLayerRef.current,
                setSelectedSchoolUtilizationZone,
                closeHotspotInfo,
                closeFloodInfo,
                closeFloodZoneInfo,
              );

            if (handledSchoolPressureClick) {
              return;
            }

            const handledSchoolClick = await handleSchoolUtilizationZoneClick(
              view,
              event,
              schoolUtilizationZoneLayerRef.current,
              setSelectedSchoolUtilizationZone,
              closeHotspotInfo,
              closeFloodInfo,
              closeFloodZoneInfo,
            );

            if (!handledSchoolClick) {
              void interactionController.handleClick(event);
            }
          })();
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

          if (detail?.focus && allowsParcelSelectionGraphics(overviewCommandModeRef.current)) {
            void applyParcelFocus(detail.focus);
            return;
          }

          clearParcelSceneFocus();
        };
        window.addEventListener(
          CFS_PARCEL_MAP_FOCUS_REQUEST_EVENT,
          focusEventHandler,
        );
        const queueModelResearchRender = () => {
          setModelResearchRenderTick((currentTick) =>
            currentTick >= 100000 ? 0 : currentTick + 1,
          );
        };
        zoomWatchHandle = runtime.reactiveUtils.watch(() => view.zoom, (zoom) => {
          if (focusLayerRef.current) {
            updateParcelFocusMarkerScale(focusLayerRef.current, zoom);
          }
          queueModelResearchRender();
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
              queueModelResearchRender();
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

        console.error("ArcGIS MapView failed to initialize", error);
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
      if (parcelFocusCleanupFrameRef.current !== null) {
        window.cancelAnimationFrame(parcelFocusCleanupFrameRef.current);
        parcelFocusCleanupFrameRef.current = null;
      }
      clearSchoolUtilizationHover();
      focusLayerRef.current?.removeAll();
      focusLayerRef.current = null;
      hotspotLayerRef.current?.removeAll();
      hotspotLayerRef.current = null;
      removeFeatureLayerFromView(localView, hotspotHeatmapLayerRef.current);
      hotspotHeatmapLayerRef.current = null;
      floodConstraintLayerRef.current?.removeAll();
      floodConstraintLayerRef.current = null;
      floodZoneLayerRef.current?.removeAll();
      floodZoneLayerRef.current = null;
      modelResearchPreviewLayerRef.current?.removeAll();
      modelResearchPreviewLayerRef.current = null;
      removeFeatureLayerFromView(localView, modelResearchHeatmapLayerRef.current);
      modelResearchHeatmapLayerRef.current = null;
      schoolUtilizationZoneLayerRef.current?.removeAll();
      schoolUtilizationZoneLayerRef.current = null;
      layerRefs.current = {};
      runtimeRef.current = null;
      viewRef.current = null;
      if (window.__cfsCaptureMapSnapshot) {
        delete window.__cfsCaptureMapSnapshot;
      }

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
    clearParcelSceneFocus,
    clearSelectedParcel,
    clearSchoolUtilizationHover,
    selectParcel,
    setFloodZoneViewExtent,
    setMapError,
    setMapStatus,
    setSelectedDevelopmentHotspotContext,
    setSelectedModelResearchContext,
    setSelectedSchoolUtilizationZone,
    updateSchoolUtilizationHover,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const hotspotLayer = ensureDevelopmentHotspotLayer(runtime, view);
    hotspotLayerRef.current = hotspotLayer;
    hotspotLayer.removeAll();
    removeFeatureLayerFromView(view, hotspotHeatmapLayerRef.current);
    hotspotHeatmapLayerRef.current = null;

    if (
      !exploreCountywideLayersActive ||
      !developmentHotspotsEnabled ||
      developmentHotspotLayer.status !== "ready" ||
      developmentHotspotControls.permitSegment === "all"
    ) {
      hotspotLayer.visible = false;
      setSelectedDevelopmentHotspotContext(null);
      return;
    }

    hotspotLayer.visible = true;
    const activePermitSegment = developmentHotspotControls.permitSegment;
    const displayMode = getDevelopmentHotspotDisplayModeForViewMode(
      developmentHotspotControls.viewMode,
      view.scale,
    );
    const currentExtent = getSceneViewWgs84Extent(runtime, view);
    if (displayMode === "heatmap") {
      hotspotLayer.visible = false;
      setSelectedDevelopmentHotspotContext(null);

      const heatmapResult = buildDevelopmentHotspotHeatmapFeatureGraphics({
        activePermitSegment,
        extent: currentExtent,
        markers: developmentHotspotLayer.markers,
        runtime,
      });

      if (heatmapResult.graphics.length) {
        const heatmapLayer = createDevelopmentHotspotHeatmapFeatureLayer(
          runtime,
          heatmapResult.graphics,
        );
        view.map?.add(heatmapLayer);
        hotspotHeatmapLayerRef.current = heatmapLayer;
      }

      console.debug("[CFS development hotspots]", "rendered heatmap display", {
        displayMode,
        featureCount: heatmapResult.graphics.length,
        parcelCount: heatmapResult.visibleParcelCount,
        recordCount: heatmapResult.visibleRecordCount,
        totalCount: developmentHotspotLayer.totalCount,
        viewScaleLabel: getDevelopmentHotspotViewScaleLabel(displayMode),
      });
      return;
    }

    const renderResult = buildDevelopmentHotspotDisplayGraphics({
      activePermitSegment,
      displayMode,
      extent: currentExtent,
      markers: developmentHotspotLayer.markers,
      runtime,
    });

    hotspotLayer.addMany(renderResult.graphics);

    console.debug("[CFS development hotspots]", "rendered grouped display", {
      displayMode,
      graphicCount: renderResult.graphics.length,
      parcelCount: renderResult.visibleParcelCount,
      recordCount: renderResult.visibleRecordCount,
      totalCount: developmentHotspotLayer.totalCount,
      viewScaleLabel: getDevelopmentHotspotViewScaleLabel(displayMode),
    });
  }, [
    developmentHotspotLayer.markers,
    developmentHotspotLayer.status,
    developmentHotspotLayer.totalCount,
    developmentHotspotControls.permitSegment,
    developmentHotspotControls.viewMode,
    developmentHotspotsEnabled,
    exploreCountywideLayersActive,
    mapStatus,
    modelResearchRenderTick,
    setSelectedDevelopmentHotspotContext,
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

    if (
      !exploreCountywideLayersActive ||
      !floodConstraintsEnabled ||
      floodConstraintLayer.status !== "ready"
    ) {
      floodLayer.visible = false;
      return;
    }

    floodLayer.visible = true;
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
    exploreCountywideLayersActive,
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

    if (
      !exploreCountywideLayersActive ||
      !floodZonesEnabled ||
      floodZoneLayer.status !== "ready"
    ) {
      femaFloodZoneGraphicsLayer.visible = false;
      return;
    }

    femaFloodZoneGraphicsLayer.visible = true;
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
    exploreCountywideLayersActive,
    floodZonesEnabled,
    mapStatus,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const researchLayer = ensureModelResearchPreviewLayer(runtime, view);
    modelResearchPreviewLayerRef.current = researchLayer;
    researchLayer.removeAll();
    removeFeatureLayerFromView(view, modelResearchHeatmapLayerRef.current);
    modelResearchHeatmapLayerRef.current = null;

    if (
      !modelLabLayersActive ||
      !modelResearchOverlayEnabled ||
      modelResearchPreviewLayer.status !== "ready"
    ) {
      researchLayer.visible = false;
      setSelectedModelResearchContext(null);
      modelResearchGoToKeyRef.current = null;
      setModelResearchMapSummary(createModelResearchMapSummary({
        displayMode: "off",
        overlayEnabled: false,
        totalFeatureCount: modelResearchPreviewLayer.totalCount,
        visibleFeatureCount: 0,
      }));
      return;
    }

    researchLayer.visible = true;
    const displayMode = getModelResearchDisplayModeForViewMode(
      modelResearchViewMode,
      view.scale,
    );
    if (modelResearchViewMode === "heatmap") {
      setSelectedModelResearchContext(null);
    }
    const currentExtent = getSceneViewWgs84Extent(runtime, view);
    if (displayMode === "countywide_heatmap") {
      researchLayer.visible = false;
      const heatmapResult = buildModelResearchHeatmapFeatureGraphics({
        displayMode,
        extent: currentExtent,
        markers: modelResearchPreviewLayer.markers,
        runtime,
      });

      if (heatmapResult.graphics.length) {
        const heatmapLayer = createModelResearchHeatmapFeatureLayer(
          runtime,
          heatmapResult.graphics,
        );
        view.map?.add(heatmapLayer);
        modelResearchHeatmapLayerRef.current = heatmapLayer;
      }

      setModelResearchMapSummary(createModelResearchMapSummary({
        displayMode,
        dominantSignalLabel: heatmapResult.dominantSignalLabel,
        overlayEnabled: true,
        totalFeatureCount: modelResearchPreviewLayer.totalCount,
        viewScaleLabel: getModelResearchViewScaleLabel(displayMode),
        visibleFeatureCount: heatmapResult.visibleFeatureCount,
      }));

      console.debug("[CFS model research preview]", "rendered heatmap display", {
        displayMode,
        featureCount: heatmapResult.graphics.length,
        totalCount: modelResearchPreviewLayer.totalCount,
        visibleFeatureCount: heatmapResult.visibleFeatureCount,
      });
      return;
    }

    const renderResult = buildModelResearchDisplayGraphics({
      displayMode,
      extent: currentExtent,
      markers: modelResearchPreviewLayer.markers,
      runtime,
    });

    researchLayer.addMany(renderResult.graphics);
    setModelResearchMapSummary(createModelResearchMapSummary({
      displayMode,
      dominantSignalLabel: renderResult.dominantSignalLabel,
      overlayEnabled: true,
      totalFeatureCount: modelResearchPreviewLayer.totalCount,
      viewScaleLabel: getModelResearchViewScaleLabel(displayMode),
      visibleFeatureCount: renderResult.visibleFeatureCount,
    }));

    const researchExtent = createModelResearchPreviewExtent(
      runtime,
      renderResult.extentMarkers,
    );

    const goToKey = `modelLab-${modelResearchPreviewLayer.totalCount}`;
    if (researchExtent && modelResearchGoToKeyRef.current !== goToKey) {
      modelResearchGoToKeyRef.current = goToKey;
      void view.goTo(researchExtent, {
        animate: true,
        duration: 900,
      }).catch((error: unknown) => {
        console.debug("[CFS model research preview]", "goTo skipped", error);
      });
    }

    console.debug("[CFS model research preview]", "rendered safe display", {
      displayMode,
      graphicCount: renderResult.graphics.length,
      markerCount: renderResult.visibleFeatureCount,
      totalCount: modelResearchPreviewLayer.totalCount,
    });
  }, [
    mapStatus,
    modelResearchRenderTick,
    modelResearchOverlayEnabled,
    modelResearchPreviewLayer.markers,
    modelResearchPreviewLayer.status,
    modelResearchPreviewLayer.totalCount,
    modelResearchViewMode,
    modelLabLayersActive,
    setModelResearchMapSummary,
    setSelectedModelResearchContext,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const view = viewRef.current;

    if (!runtime || !view || view.destroyed) {
      return;
    }

    const pressureLayer = ensureSchoolPressureLayer(runtime, view);
    schoolPressureLayerRef.current = pressureLayer;
    pressureLayer.removeAll();

    if (
      !exploreCountywideLayersActive ||
      !schoolPressureLayerEnabled ||
      schoolPressureLayer.status !== "ready"
    ) {
      pressureLayer.visible = false;
      return;
    }

    pressureLayer.visible = true;
    pressureLayer.addMany(
      schoolPressureLayer.features
        .map((feature) =>
          createSchoolPressureGraphic(
            runtime,
            feature,
            selectedSchoolUtilizationZone?.zoneId ?? null,
          ),
        )
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );
  }, [
    exploreCountywideLayersActive,
    mapStatus,
    schoolPressureLayer.features,
    schoolPressureLayer.status,
    schoolPressureLayerEnabled,
    selectedSchoolUtilizationZone?.zoneId,
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
      !exploreCountywideLayersActive ||
      !schoolUtilizationZonesEnabled ||
      schoolUtilizationZoneLayer.status !== "ready"
    ) {
      schoolLayer.visible = false;
      clearSchoolUtilizationHover();
      if (selectedSchoolUtilizationZone) {
        clearSelectedSchoolUtilizationZone();
      }
      return;
    }

    schoolLayer.visible = true;
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
    exploreCountywideLayersActive,
    schoolUtilizationZoneLayer.polygons,
    schoolUtilizationZoneLayer.status,
    schoolUtilizationZoneLayer.totalCount,
    schoolUtilizationZonesEnabled,
    selectedSchoolUtilizationZone,
  ]);

  useEffect(() => {
    updateSelectedParcelSymbols(
      getMockGraphicsLayerSubset(layerRefs.current, operationalLayerRegistry),
      getSelectedParcelGraphicsId(overviewCommandMode, selectedParcelId),
    );
  }, [overviewCommandMode, selectedParcelId]);

  const visibleFloodInfo =
    floodInfo &&
    exploreCountywideLayersActive &&
    floodConstraintsEnabled &&
    floodConstraintLayer.markers.some(
      (marker) => marker.officialParcelId === floodInfo.officialParcelId,
    )
      ? floodInfo
      : null;
  const visibleFloodZoneInfo =
    floodZoneInfo &&
    exploreCountywideLayersActive &&
    floodZonesEnabled &&
    floodZoneLayer.status === "ready"
      ? floodZoneInfo
      : null;
  const visibleSchoolUtilizationInfo =
    selectedSchoolUtilizationZone &&
    exploreCountywideLayersActive &&
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
    exploreCountywideLayersActive &&
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
        aria-label="Cabarrus County ArcGIS MapView"
        className="absolute inset-0"
        ref={containerRef}
        title="Interactive ArcGIS MapView with Cabarrus County operational layers"
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
                  Drag this card or collapse it to keep MapView controls
                  clear.
                </p>
              </div>
            </div>
          )}
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
              is not an official capacity determination.
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

function registerSceneViewSnapshotCapture(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.__cfsCaptureMapSnapshot = async () => {
    if (!view || view.destroyed) {
      return {
        failureReason: "MapView is not ready.",
        status: "unavailable",
      };
    }

    const capturedAt = new Date().toISOString();
    const extentSummary = formatSceneViewExtent(
      getSceneViewWgs84Extent(runtime, view),
    );
    const cameraSummary = formatSceneViewCamera(view);

    try {
      const screenshotView = view as SceneView & {
        takeScreenshot?: (options?: {
          format?: "jpg" | "png";
        }) => Promise<{ dataUrl?: string | null }>;
      };

      if (!screenshotView.takeScreenshot) {
        return {
          cameraSummary,
          capturedAt,
          extentSummary,
          failureReason: "MapView screenshot API is not available.",
          status: "unavailable",
        };
      }

      const screenshot = await screenshotView.takeScreenshot({ format: "png" });

      if (!screenshot?.dataUrl) {
        return {
          cameraSummary,
          capturedAt,
          extentSummary,
          failureReason: "MapView returned no screenshot image.",
          status: "failed",
        };
      }

      return {
        cameraSummary,
        capturedAt,
        dataUrl: screenshot.dataUrl,
        extentSummary,
        status: "captured",
      };
    } catch (error) {
      return {
        cameraSummary,
        capturedAt,
        extentSummary,
        failureReason:
          error instanceof Error
            ? error.message
            : "MapView screenshot capture failed.",
        status: "failed",
      };
    }
  };
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

function formatSceneViewExtent(extent: FloodZoneExtent | null) {
  if (!extent) {
    return undefined;
  }

  return `W ${extent.xmin.toFixed(5)}, S ${extent.ymin.toFixed(
    5,
  )}, E ${extent.xmax.toFixed(5)}, N ${extent.ymax.toFixed(5)}`;
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

async function hydrateDemoReferenceLayers(
  runtime: ArcGISRuntime,
  layers: OperationalLayerInstanceMap,
) {
  const parcelLayer = layers["parcel-intelligence"] as GraphicsLayer | undefined;
  const boundaryLayer = layers["county-boundary"] as GraphicsLayer | undefined;
  const transportationLayer = layers["transportation-context"] as
    | GraphicsLayer
    | undefined;

  const [parcelFeatures, countyBoundary, transportationFeatures] =
    await Promise.all([
      getDemoParcelFeatures(),
      getDemoGeoJsonLayer("county_boundary"),
      getDemoTransportationFeatures(),
    ]);

  if (boundaryLayer && countyBoundary.features.length) {
    boundaryLayer.removeAll();
    boundaryLayer.addMany(
      countyBoundary.features
        .map((feature) => createDemoBoundaryGraphic(runtime, feature))
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );
  }

  if (parcelLayer && parcelFeatures.length) {
    parcelLayer.removeAll();
    parcelLayer.addMany(
      parcelFeatures
        .map((feature) => createDemoParcelGraphic(runtime, feature))
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );
  }

  if (transportationLayer && transportationFeatures.length) {
    transportationLayer.removeAll();
    transportationLayer.addMany(
      transportationFeatures
        .map((feature) => createDemoTransportationGraphic(runtime, feature))
        .filter((graphic): graphic is Graphic => Boolean(graphic)),
    );
  }
}

function createDemoBoundaryGraphic(
  runtime: ArcGISRuntime,
  feature: DemoGeoJsonFeature,
) {
  const rings = convertGeoJsonPolygonCoordinatesToArcGisRings(feature.geometry);

  if (!rings.length) {
    return null;
  }

  return new runtime.Graphic({
    attributes: {
      graphicRole: "demo-county-boundary",
      label:
        stringAttribute(feature.properties?.label) ??
        "Cabarrus County operating extent",
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: { wkid: 4326 },
    }),
    symbol: {
      color: [13, 22, 34, 0.08],
      outline: {
        color: [216, 184, 106, 0.96],
        width: 2.1,
      },
      type: "simple-fill",
    } as unknown as Graphic["symbol"],
  });
}

function createDemoParcelGraphic(
  runtime: ArcGISRuntime,
  feature: DemoGeoJsonFeature,
) {
  const rings = convertGeoJsonPolygonCoordinatesToArcGisRings(feature.geometry);
  const properties = feature.properties ?? {};
  const parcelId = stringAttribute(properties.official_parcel_id);

  if (!rings.length || !parcelId) {
    return null;
  }

  return new runtime.Graphic({
    attributes: {
      acreage: numberAttribute(properties.acreage),
      developmentSummary: stringAttribute(properties.development_summary),
      floodSummary: stringAttribute(properties.flood_summary),
      graphicRole: "demo-parcel",
      municipality: stringAttribute(properties.municipality),
      parcelId,
      schoolSummary: stringAttribute(properties.school_summary),
      zoning: stringAttribute(properties.zoning),
      zoningCategory: stringAttribute(properties.zoning_category),
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: { wkid: 4326 },
    }),
    popupTemplate: {
      content:
        "Portfolio demo parcel sample. Full local mode uses the PostGIS-backed parcel fabric.",
      title: parcelId,
    },
    symbol: createDemoParcelSymbol(false),
  });
}

function createDemoParcelSymbol(selected: boolean) {
  return {
    color: selected ? [216, 184, 106, 0.3] : [104, 216, 255, 0.11],
    outline: {
      color: selected ? [255, 238, 178, 0.98] : [104, 216, 255, 0.56],
      width: selected ? 2.3 : 0.85,
    },
    type: "simple-fill",
  } as unknown as Graphic["symbol"];
}

function createDemoTransportationGraphic(
  runtime: ArcGISRuntime,
  feature: DemoGeoJsonFeature,
) {
  const paths = convertGeoJsonLineCoordinatesToArcGisPaths(feature.geometry);
  const properties = feature.properties ?? {};

  if (!paths.length) {
    return null;
  }

  return new runtime.Graphic({
    attributes: {
      contextStatus: stringAttribute(properties.context_status),
      graphicRole: "demo-transportation-context",
      isMajorRoad: Boolean(properties.is_major_road),
      roadClass: stringAttribute(properties.road_class),
      roadName: stringAttribute(properties.road_name),
      roadType: stringAttribute(properties.road_type),
      routeType: stringAttribute(properties.route_type),
    },
    geometry: new runtime.Polyline({
      paths,
      spatialReference: { wkid: 4326 },
    }),
    popupTemplate: {
      content:
        "Portfolio demo transportation context. Planned project and capacity data still require official feeds.",
      title: stringAttribute(properties.road_name) ?? "Transportation Context",
    },
    symbol: {
      color: [104, 216, 255, Boolean(properties.is_major_road) ? 0.88 : 0.58],
      style: "solid",
      type: "simple-line",
      width: Boolean(properties.is_major_road) ? 2.8 : 1.6,
    } as unknown as Graphic["symbol"],
  });
}

function createParcelFocusLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-parcel-focus-layer",
    listMode: "hide",
    title: "Selected Parcel Focus",
  });
}

function createDevelopmentHotspotLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-development-hotspots-layer",
    listMode: "hide",
    title: "Development Hotspots",
    visible: false,
  });
}

function createFloodConstraintLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-flood-constraints-layer",
    listMode: "hide",
    title: "Flood Constraints",
    visible: false,
  });
}

function createFemaFloodZoneLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-fema-flood-zones-layer",
    listMode: "hide",
    title: "FEMA Flood Zones",
    visible: false,
  });
}

function createModelResearchPreviewLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-model-research-preview-layer",
    listMode: "hide",
    title: "Development Model Research Preview",
    visible: false,
  });
}

function createSchoolUtilizationZoneLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-school-utilization-zones-layer",
    listMode: "hide",
    title: "School Utilization Seed Zones",
    visible: false,
  });
}

function createSchoolPressureLayer(runtime: ArcGISRuntime) {
  return new runtime.GraphicsLayer({
    id: "cfs-school-pressure-layer",
    listMode: "hide",
    title: "School Utilization + Permit Pressure",
    visible: false,
  });
}

function ensureParcelFocusLayer(runtime: ArcGISRuntime, view: SceneView) {
  const map = view.map;

  if (!map) {
    throw new Error("MapView map is unavailable for parcel focus.");
  }

  const existingLayer = map.findLayerById("cfs-parcel-focus-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const focusLayer = createParcelFocusLayer(runtime);
  map.add(focusLayer);
  return focusLayer;
}

function removeFeatureLayerFromView(
  view: SceneView | null,
  layer: FeatureLayer | null,
) {
  if (!layer) {
    return;
  }

  const map = view?.map;
  if (map && map.findLayerById(layer.id)) {
    map.remove(layer);
  }

  if (!layer.destroyed) {
    layer.destroy();
  }
}

function createDevelopmentHotspotHeatmapFeatureLayer(
  runtime: ArcGISRuntime,
  source: Graphic[],
) {
  return new runtime.FeatureLayer({
    fields: getHeatmapFeatureFields(),
    geometryType: "point",
    id: "cfs-development-hotspots-heatmap-layer",
    objectIdField: "objectId",
    opacity: 0.82,
    popupEnabled: false,
    renderer: createPermitActivityHeatmapRenderer(),
    source,
    spatialReference: { wkid: 4326 },
    title: "Permit Activity Heatmap",
  } as never) as FeatureLayer;
}

function createModelResearchHeatmapFeatureLayer(
  runtime: ArcGISRuntime,
  source: Graphic[],
) {
  return new runtime.FeatureLayer({
    fields: getHeatmapFeatureFields(),
    geometryType: "point",
    id: "cfs-model-research-heatmap-layer",
    objectIdField: "objectId",
    opacity: 0.78,
    popupEnabled: false,
    renderer: createResearchSignalHeatmapRenderer(),
    source,
    spatialReference: { wkid: 4326 },
    title: "Research Signal Heatmap",
  } as never) as FeatureLayer;
}

function getHeatmapFeatureFields() {
  return [
    { name: "objectId", type: "oid" },
    { name: "heatmapWeight", type: "double" },
    { length: 64, name: "graphicRole", type: "string" },
    { length: 64, name: "renderedViewMode", type: "string" },
  ];
}

function createPermitActivityHeatmapRenderer() {
  return {
    blurRadius: 34,
    colorStops: [
      { color: [2, 8, 18, 0], ratio: 0 },
      { color: [20, 83, 116, 0.12], ratio: 0.18 },
      { color: [41, 228, 197, 0.34], ratio: 0.38 },
      { color: [246, 211, 101, 0.58], ratio: 0.66 },
      { color: [249, 115, 22, 0.76], ratio: 0.84 },
      { color: [236, 92, 255, 0.86], ratio: 1 },
    ],
    field: "heatmapWeight",
    maxDensity: 0.03,
    minDensity: 0,
    radius: 48,
    type: "heatmap",
  };
}

function createResearchSignalHeatmapRenderer() {
  return {
    blurRadius: 36,
    colorStops: [
      { color: [2, 8, 18, 0], ratio: 0 },
      { color: [30, 41, 59, 0.14], ratio: 0.16 },
      { color: [56, 189, 248, 0.34], ratio: 0.36 },
      { color: [41, 228, 197, 0.52], ratio: 0.56 },
      { color: [250, 204, 21, 0.72], ratio: 0.78 },
      { color: [236, 92, 255, 0.88], ratio: 1 },
    ],
    field: "heatmapWeight",
    maxDensity: 0.026,
    minDensity: 0,
    radius: 52,
    type: "heatmap",
  };
}

function ensureDevelopmentHotspotLayer(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  const map = view.map;

  if (!map) {
    throw new Error("MapView map is unavailable for development hotspots.");
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
    throw new Error("MapView map is unavailable for flood constraints.");
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
    throw new Error("MapView map is unavailable for FEMA flood zones.");
  }

  const existingLayer = map.findLayerById("cfs-fema-flood-zones-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const floodZoneLayer = createFemaFloodZoneLayer(runtime);
  map.add(floodZoneLayer);
  return floodZoneLayer;
}

function ensureModelResearchPreviewLayer(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  const map = view.map;

  if (!map) {
    throw new Error("MapView map is unavailable for model research preview.");
  }

  const existingLayer = map.findLayerById("cfs-model-research-preview-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const previewLayer = createModelResearchPreviewLayer(runtime);
  map.add(previewLayer);
  return previewLayer;
}

function ensureSchoolUtilizationZoneLayer(
  runtime: ArcGISRuntime,
  view: SceneView,
) {
  const map = view.map;

  if (!map) {
    throw new Error("MapView map is unavailable for school utilization zones.");
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

function ensureSchoolPressureLayer(runtime: ArcGISRuntime, view: SceneView) {
  const map = view.map;

  if (!map) {
    throw new Error("MapView map is unavailable for school pressure areas.");
  }

  const existingLayer = map.findLayerById("cfs-school-pressure-layer");

  if (existingLayer) {
    return existingLayer as GraphicsLayer;
  }

  const pressureLayer = createSchoolPressureLayer(runtime);
  map.add(pressureLayer);
  return pressureLayer;
}

function markerPrimitiveToSimpleStyle(primitive: string | null | undefined) {
  switch (primitive) {
    case "diamond":
    case "square":
    case "triangle":
    case "x":
      return primitive;
    default:
      return "circle";
  }
}

function createDevelopmentHotspotGraphic(
  runtime: ArcGISRuntime,
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
  displayMode: DevelopmentHotspotMapDisplayMode = "individual_markers",
) {
  const profile = getDevelopmentHotspotMarkerProfile(
    marker,
    activePermitSegment,
  );
  const context = createDevelopmentHotspotContextFromMarker(
    marker,
    activePermitSegment,
    displayMode,
  );

  return new runtime.Graphic({
    attributes: {
      ...createDevelopmentHotspotContextAttributes(context),
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
      color: profile.color,
      outline: {
        color: profile.outlineColor,
        width: profile.outlineSize,
      },
      size: profile.size,
      style: markerPrimitiveToSimpleStyle(profile.primitive),
      type: "simple-marker",
    } as unknown as Graphic["symbol"],
  });
}

function createDevelopmentHotspotAggregateGraphic(
  runtime: ArcGISRuntime,
  cell: DevelopmentHotspotAggregateCell,
) {
  const profile = getDevelopmentHotspotAggregateProfile(cell);
  const context = createDevelopmentHotspotContextFromCell(cell);

  return new runtime.Graphic({
    attributes: createDevelopmentHotspotContextAttributes(context),
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: cell.longitude,
      y: cell.latitude,
    }),
    symbol: {
      color: profile.innerColor,
      outline: {
        color: profile.outlineColor,
        width: 1.4,
      },
      size: profile.outerSize,
      style: markerPrimitiveToSimpleStyle(profile.primitive),
      type: "simple-marker",
    } as unknown as Graphic["symbol"],
  });
}

function createDevelopmentHotspotAggregateLabelGraphic(
  runtime: ArcGISRuntime,
  cell: DevelopmentHotspotAggregateCell,
) {
  if (cell.recordsRepresented <= 1) {
    return null;
  }

  const profile = getDevelopmentHotspotAggregateProfile(cell);
  const context = createDevelopmentHotspotContextFromCell(cell);

  return new runtime.Graphic({
    attributes: createDevelopmentHotspotContextAttributes(context),
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: cell.longitude,
      y: cell.latitude,
    }),
    symbol: {
      color: [255, 255, 255, 0.96],
      font: {
        family: "Inter, Arial, sans-serif",
        size: profile.labelSize,
        weight: "bold",
      },
      haloColor: [7, 17, 31, 0.9],
      haloSize: 1.35,
      text: formatDevelopmentCount(cell.recordsRepresented),
      type: "text",
      yoffset: 0,
    } as unknown as Graphic["symbol"],
  });
}

function createDevelopmentHotspotHeatmapFeatureGraphic(
  runtime: ArcGISRuntime,
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
  objectId: number,
) {
  const context = createDevelopmentHotspotContextFromMarker(
    marker,
    activePermitSegment,
    "heatmap",
  );
  const recordCount = getDevelopmentHotspotRecordCount(
    marker,
    activePermitSegment,
  );

  return new runtime.Graphic({
    attributes: {
      ...createDevelopmentHotspotContextAttributes(context),
      heatmapWeight: Math.max(1, recordCount),
      objectId,
      renderedViewMode: "heatmap",
    },
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: marker.centroid.longitude,
      y: marker.centroid.latitude,
    }),
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
      color: profile.color,
      outline: {
        color: profile.outlineColor,
        width: profile.outlineSize,
      },
      size: profile.size,
      style: markerPrimitiveToSimpleStyle(profile.primitive),
      type: "simple-marker",
    } as unknown as Graphic["symbol"],
  });
}

function createModelResearchPreviewGraphic(
  runtime: ArcGISRuntime,
  marker: ModelResearchPreviewMarker,
) {
  const profile = getModelResearchPreviewMarkerProfile(marker);

  return new runtime.Graphic({
    attributes: {
      approximateAreaLabel:
        marker.approximateAreaLabel ?? marker.officialParcelId,
      bandCountInsufficient: marker.bandCounts?.insufficient ?? 0,
      bandCountLower: marker.bandCounts?.lower ?? 0,
      bandCountModerate: marker.bandCounts?.moderate ?? 0,
      bandCountStrong: marker.bandCounts?.strong ?? 0,
      bandCountVeryStrong: marker.bandCounts?.veryStrong ?? 0,
      caveat: marker.caveat,
      clusterId: marker.clusterId ?? null,
      contextKind: marker.contextKind ?? "parcel_marker",
      dataQualityFlag: marker.dataQualityFlag,
      displayMode: marker.displayMode ?? "parcel_detail",
      dominantResearchBand:
        marker.dominantResearchBand ??
        formatRelativeDevelopmentSignalBand({
          rankBand: marker.researchRankBand,
          signalLabel: marker.researchSignalLabel,
        }),
      exactProbabilityAvailable: false,
      graphicRole: "model-research-preview",
      modelVersion: marker.modelVersion,
      officialParcelId: marker.officialParcelId,
      productionReady: false,
      publicExposureAllowed: false,
      representativeSignalLabel:
        marker.representativeSignalLabel ?? marker.researchSignalLabel,
      representedFeatureCount: marker.representedFeatureCount ?? 1,
      researchRankBand: marker.researchRankBand,
      researchSignalLabel: marker.researchSignalLabel,
      selectedFeatureGroupSummary: marker.selectedFeatureGroupSummary ?? null,
      topDriver1: marker.topDrivers[0] ?? null,
      topDriver2: marker.topDrivers[1] ?? null,
      topDriver3: marker.topDrivers[2] ?? null,
      topDriverSummary:
        marker.topDriverSummary ??
        createModelResearchTopDriverSummary(marker.topDrivers),
    },
    geometry: new runtime.Point({
      spatialReference: {
        wkid: marker.centroid.spatialReference?.wkid ?? 4326,
      },
      x: marker.centroid.longitude,
      y: marker.centroid.latitude,
    }),
    symbol: {
      color: profile.color,
      outline: {
        color: profile.outlineColor,
        width: profile.outlineSize,
      },
      size: profile.size,
      style: "circle",
      type: "simple-marker",
    } as unknown as Graphic["symbol"],
  });
}

interface DevelopmentHotspotDisplayOptions {
  activePermitSegment: string | null;
  displayMode: DevelopmentHotspotMapDisplayMode;
  extent: FloodZoneExtent | null;
  markers: DevelopmentHotspotMapMarker[];
  runtime: ArcGISRuntime;
}

interface DevelopmentHotspotDisplayResult {
  extentMarkers: DevelopmentHotspotMapMarker[];
  graphics: Graphic[];
  visibleParcelCount: number;
  visibleRecordCount: number;
}

interface DevelopmentHotspotAggregateCell {
  activityClass: string | null;
  clusterId: string;
  developmentActivityScore: number | null;
  displayMode: DevelopmentHotspotMapDisplayMode;
  dominantPermitSegment: string | null;
  highValuePermits: number;
  latitude: number;
  longitude: number;
  majorValuePermits: number;
  markers: DevelopmentHotspotMapMarker[];
  parcelsRepresented: number;
  recentPermitCount1yr: number;
  recentPermitCount3yr: number;
  recordsRepresented: number;
  selectedPermitSegment: string | null;
  segmentCounts: DevelopmentHotspotSegmentCounts;
  totalPermitCount: number;
  weight: number;
  zoningJurisdictionName: string | null;
}

interface ModelResearchDisplayOptions {
  displayMode: ModelResearchMapDisplayMode;
  extent: FloodZoneExtent | null;
  markers: ModelResearchPreviewMarker[];
  runtime: ArcGISRuntime;
}

interface ModelResearchDisplayResult {
  dominantSignalLabel: string;
  extentMarkers: ModelResearchPreviewMarker[];
  graphics: Graphic[];
  visibleFeatureCount: number;
}

interface ModelResearchAggregateCell {
  bandCounts: NonNullable<ModelResearchPreviewMarker["bandCounts"]>;
  count: number;
  displayMode: ModelResearchMapDisplayMode;
  dominantSignalLabel: string;
  id: string;
  latitude: number;
  longitude: number;
  markers: ModelResearchPreviewMarker[];
  topDrivers: string[];
  weight: number;
}

function getDevelopmentHotspotMapDisplayMode(
  scale: number | null | undefined,
): DevelopmentHotspotMapDisplayMode {
  if (!scale || !Number.isFinite(scale)) {
    return "countywide_clusters";
  }

  if (scale >= DEVELOPMENT_HOTSPOT_COUNTYWIDE_CLUSTER_SCALE) {
    return "countywide_clusters";
  }

  if (scale >= DEVELOPMENT_HOTSPOT_INTERMEDIATE_CLUSTER_SCALE) {
    return "intermediate_clusters";
  }

  if (scale >= DEVELOPMENT_HOTSPOT_FINE_CLUSTER_SCALE) {
    return "fine_clusters";
  }

  return "individual_markers";
}

function getDevelopmentHotspotDisplayModeForViewMode(
  viewMode: MapOverlayViewMode,
  scale: number | null | undefined,
): DevelopmentHotspotMapDisplayMode {
  if (viewMode === "heatmap") {
    return "heatmap";
  }

  if (viewMode === "points") {
    return "individual_markers";
  }

  const displayMode = getDevelopmentHotspotMapDisplayMode(scale);
  return displayMode === "individual_markers" ? "fine_clusters" : displayMode;
}

function getDevelopmentHotspotViewScaleLabel(
  displayMode: DevelopmentHotspotMapDisplayMode,
) {
  switch (displayMode) {
    case "countywide_clusters":
      return "Countywide activity clusters";
    case "intermediate_clusters":
      return "Intermediate activity clusters";
    case "fine_clusters":
      return "Fine local activity clusters";
    case "heatmap":
      return "Permit activity heatmap";
    case "individual_markers":
      return "Individual activity markers";
    default:
      return "Development Hotspots off";
  }
}

function getDevelopmentHotspotClusterCellSize(
  displayMode: DevelopmentHotspotMapDisplayMode,
) {
  switch (displayMode) {
    case "countywide_clusters":
      return DEVELOPMENT_HOTSPOT_COUNTYWIDE_CELL_SIZE_DEGREES;
    case "fine_clusters":
      return DEVELOPMENT_HOTSPOT_FINE_CELL_SIZE_DEGREES;
    case "intermediate_clusters":
    default:
      return DEVELOPMENT_HOTSPOT_INTERMEDIATE_CELL_SIZE_DEGREES;
  }
}

function getDevelopmentHotspotClusterMaxCells(
  displayMode: DevelopmentHotspotMapDisplayMode,
) {
  switch (displayMode) {
    case "countywide_clusters":
      return DEVELOPMENT_HOTSPOT_COUNTYWIDE_MAX_CELLS;
    case "fine_clusters":
      return DEVELOPMENT_HOTSPOT_FINE_MAX_CELLS;
    case "intermediate_clusters":
    default:
      return DEVELOPMENT_HOTSPOT_INTERMEDIATE_MAX_CELLS;
  }
}

function buildDevelopmentHotspotDisplayGraphics({
  activePermitSegment,
  displayMode,
  extent,
  markers,
  runtime,
}: DevelopmentHotspotDisplayOptions): DevelopmentHotspotDisplayResult {
  const visibleMarkers = filterDevelopmentHotspotMarkersForExtent(
    markers,
    extent,
  );
  const sourceMarkers = visibleMarkers.length ? visibleMarkers : markers;

  if (!sourceMarkers.length) {
    return {
      extentMarkers: [],
      graphics: [],
      visibleParcelCount: 0,
      visibleRecordCount: 0,
    };
  }

  if (displayMode === "individual_markers") {
    const detailMarkers = prioritizeDevelopmentHotspotMarkers(
      sourceMarkers,
      activePermitSegment,
    ).slice(0, DEVELOPMENT_HOTSPOT_DETAIL_MAX_MARKERS);

    return {
      extentMarkers: detailMarkers,
      graphics: detailMarkers.map((marker) =>
        createDevelopmentHotspotGraphic(
          runtime,
          marker,
          activePermitSegment,
          displayMode,
        ),
      ),
      visibleParcelCount: detailMarkers.length,
      visibleRecordCount: detailMarkers.reduce(
        (sum, marker) =>
          sum + getDevelopmentHotspotRecordCount(marker, activePermitSegment),
        0,
      ),
    };
  }

  const cells = aggregateDevelopmentHotspotMarkers(
    sourceMarkers,
    activePermitSegment,
    getDevelopmentHotspotClusterCellSize(displayMode),
    displayMode,
  ).slice(0, getDevelopmentHotspotClusterMaxCells(displayMode));

  return {
    extentMarkers: cells.flatMap((cell) => cell.markers),
    graphics: cells.flatMap((cell) => {
      const graphic = createDevelopmentHotspotAggregateGraphic(runtime, cell);
      const labelGraphic = createDevelopmentHotspotAggregateLabelGraphic(
        runtime,
        cell,
      );

      return labelGraphic ? [graphic, labelGraphic] : [graphic];
    }),
    visibleParcelCount: cells.reduce(
      (sum, cell) => sum + cell.parcelsRepresented,
      0,
    ),
      visibleRecordCount: cells.reduce(
        (sum, cell) => sum + cell.recordsRepresented,
        0,
      ),
    };
}

function buildDevelopmentHotspotHeatmapFeatureGraphics({
  activePermitSegment,
  extent,
  markers,
  runtime,
}: Omit<DevelopmentHotspotDisplayOptions, "displayMode">): DevelopmentHotspotDisplayResult {
  const visibleMarkers = filterDevelopmentHotspotMarkersForExtent(
    markers,
    extent,
  );
  const sourceMarkers = visibleMarkers.length ? visibleMarkers : markers;
  const heatmapMarkers = prioritizeDevelopmentHotspotMarkers(
    sourceMarkers,
    activePermitSegment,
  ).filter(
    (marker) =>
      getDevelopmentHotspotRecordCount(marker, activePermitSegment) > 0 &&
      Number.isFinite(marker.centroid.longitude) &&
      Number.isFinite(marker.centroid.latitude),
  );

  return {
    extentMarkers: heatmapMarkers,
    graphics: heatmapMarkers.map((marker, index) =>
      createDevelopmentHotspotHeatmapFeatureGraphic(
        runtime,
        marker,
        activePermitSegment,
        index + 1,
      ),
    ),
    visibleParcelCount: new Set(
      heatmapMarkers.map((marker) => marker.officialParcelId),
    ).size,
    visibleRecordCount: heatmapMarkers.reduce(
      (sum, marker) =>
        sum + getDevelopmentHotspotRecordCount(marker, activePermitSegment),
      0,
    ),
  };
}

function filterDevelopmentHotspotMarkersForExtent(
  markers: DevelopmentHotspotMapMarker[],
  extent: FloodZoneExtent | null,
) {
  if (!extent) {
    return markers;
  }

  const longitudePadding = Math.max(0.015, (extent.xmax - extent.xmin) * 0.12);
  const latitudePadding = Math.max(0.015, (extent.ymax - extent.ymin) * 0.12);

  return markers.filter((marker) => {
    const { latitude, longitude } = marker.centroid;

    return (
      longitude >= extent.xmin - longitudePadding &&
      longitude <= extent.xmax + longitudePadding &&
      latitude >= extent.ymin - latitudePadding &&
      latitude <= extent.ymax + latitudePadding
    );
  });
}

function prioritizeDevelopmentHotspotMarkers(
  markers: DevelopmentHotspotMapMarker[],
  activePermitSegment: string | null,
) {
  return [...markers].sort((left, right) => {
    const recordDelta =
      getDevelopmentHotspotRecordCount(right, activePermitSegment) -
      getDevelopmentHotspotRecordCount(left, activePermitSegment);

    if (recordDelta !== 0) {
      return recordDelta;
    }

    return (
      getDevelopmentHotspotMarkerWeight(right, activePermitSegment) -
      getDevelopmentHotspotMarkerWeight(left, activePermitSegment)
    );
  });
}

function aggregateDevelopmentHotspotMarkers(
  markers: DevelopmentHotspotMapMarker[],
  activePermitSegment: string | null,
  cellSizeDegrees: number,
  displayMode: DevelopmentHotspotMapDisplayMode,
) {
  const cells = new Map<string, DevelopmentHotspotAggregateCell>();

  markers.forEach((marker) => {
    const longitudeKey =
      Math.floor(marker.centroid.longitude / cellSizeDegrees) * cellSizeDegrees;
    const latitudeKey =
      Math.floor(marker.centroid.latitude / cellSizeDegrees) * cellSizeDegrees;
    const key = `${longitudeKey.toFixed(5)}:${latitudeKey.toFixed(5)}`;
    const recordsRepresented = getDevelopmentHotspotRecordCount(
      marker,
      activePermitSegment,
    );
    const segmentCounts = getDevelopmentHotspotSegmentCounts(marker);
    const weight = getDevelopmentHotspotMarkerWeight(
      marker,
      activePermitSegment,
    );
    const existingCell = cells.get(key);

    if (!existingCell) {
      cells.set(key, {
        activityClass: marker.developmentActivityClass,
        clusterId: `${displayMode}:${key}`,
        developmentActivityScore: marker.developmentActivityScore,
        displayMode,
        dominantPermitSegment:
          activePermitSegment ??
          getDominantDevelopmentHotspotSegment(segmentCounts) ??
          marker.dominantPermitSegment,
        highValuePermits: marker.highValuePermits,
        latitude: marker.centroid.latitude,
        longitude: marker.centroid.longitude,
        majorValuePermits: marker.majorValuePermits,
        markers: [marker],
        parcelsRepresented: 1,
        recentPermitCount1yr: marker.recentPermitCount1yr,
        recentPermitCount3yr: marker.recentPermitCount3yr,
        recordsRepresented,
        selectedPermitSegment: activePermitSegment,
        segmentCounts,
        totalPermitCount: marker.totalPermitCount,
        weight,
        zoningJurisdictionName: marker.zoningJurisdictionName,
      });
      return;
    }

    const nextParcelCount = existingCell.parcelsRepresented + 1;
    existingCell.latitude =
      (existingCell.latitude * existingCell.parcelsRepresented +
        marker.centroid.latitude) /
      nextParcelCount;
    existingCell.longitude =
      (existingCell.longitude * existingCell.parcelsRepresented +
        marker.centroid.longitude) /
      nextParcelCount;
    existingCell.parcelsRepresented = nextParcelCount;
    existingCell.recordsRepresented += recordsRepresented;
    existingCell.highValuePermits += marker.highValuePermits;
    existingCell.majorValuePermits += marker.majorValuePermits;
    existingCell.recentPermitCount1yr += marker.recentPermitCount1yr;
    existingCell.recentPermitCount3yr += marker.recentPermitCount3yr;
    existingCell.totalPermitCount += marker.totalPermitCount;
    existingCell.weight += weight;
    existingCell.markers.push(marker);
    existingCell.segmentCounts = mergeDevelopmentHotspotSegmentCounts(
      existingCell.segmentCounts,
      segmentCounts,
    );
    existingCell.dominantPermitSegment =
      activePermitSegment ??
      getDominantDevelopmentHotspotSegment(existingCell.segmentCounts) ??
      existingCell.dominantPermitSegment;
    existingCell.activityClass = getDominantDevelopmentHotspotActivityClass(
      existingCell.markers,
    );
    existingCell.developmentActivityScore =
      getAverageDevelopmentActivityScore(existingCell.markers);
    existingCell.zoningJurisdictionName =
      getDominantDevelopmentHotspotJurisdiction(existingCell.markers);
  });

  return [...cells.values()].sort((left, right) => {
    const concentrationDelta =
      right.recordsRepresented * 2 +
      right.parcelsRepresented +
      right.weight -
      (left.recordsRepresented * 2 + left.parcelsRepresented + left.weight);

    if (concentrationDelta !== 0) {
      return concentrationDelta;
    }

    return right.parcelsRepresented - left.parcelsRepresented;
  });
}

function getModelResearchMapDisplayMode(
  scale: number | null | undefined,
): ModelResearchMapDisplayMode {
  if (!scale || !Number.isFinite(scale)) {
    return "countywide_heatmap";
  }

  if (scale >= MODEL_LAB_COUNTYWIDE_MIN_SCALE) {
    return "countywide_heatmap";
  }

  if (scale >= MODEL_LAB_CLUSTER_MIN_SCALE) {
    return "intermediate_subclusters";
  }

  if (scale >= MODEL_LAB_DETAIL_SCALE_THRESHOLD) {
    return "fine_local_clusters";
  }

  return "parcel_detail";
}

function getModelResearchDisplayModeForViewMode(
  viewMode: MapOverlayViewMode,
  scale: number | null | undefined,
): ModelResearchMapDisplayMode {
  if (viewMode === "heatmap") {
    return "countywide_heatmap";
  }

  if (viewMode === "points") {
    return "parcel_detail";
  }

  const displayMode = getModelResearchMapDisplayMode(scale);
  return displayMode === "countywide_heatmap"
    ? "clustered_markers"
    : displayMode;
}

function getModelResearchViewScaleLabel(mode: ModelResearchMapDisplayMode) {
  switch (mode) {
    case "countywide_heatmap":
      return "Relative research heatmap";
    case "clustered_markers":
      return "Clustered research markers";
    case "intermediate_subclusters":
      return "Intermediate sub-clusters";
    case "fine_local_clusters":
      return "Fine local clusters";
    case "parcel_detail":
      return "Parcel-scale research markers";
    default:
      return "Overlay off";
  }
}

function getModelResearchClusterCellSize(
  displayMode: ModelResearchMapDisplayMode,
) {
  switch (displayMode) {
    case "countywide_heatmap":
      return MODEL_LAB_COUNTYWIDE_CELL_SIZE_DEGREES;
    case "fine_local_clusters":
      return MODEL_LAB_FINE_CELL_SIZE_DEGREES;
    case "clustered_markers":
    case "intermediate_subclusters":
    default:
      return MODEL_LAB_INTERMEDIATE_CELL_SIZE_DEGREES;
  }
}

function getModelResearchClusterMaxCells(
  displayMode: ModelResearchMapDisplayMode,
) {
  switch (displayMode) {
    case "countywide_heatmap":
      return MODEL_LAB_COUNTYWIDE_MAX_CELLS;
    case "fine_local_clusters":
      return MODEL_LAB_FINE_MAX_CELLS;
    case "clustered_markers":
    case "intermediate_subclusters":
    default:
      return MODEL_LAB_INTERMEDIATE_MAX_CELLS;
  }
}

function createModelResearchMapSummary({
  displayMode,
  dominantSignalLabel = "No visible research signal",
  overlayEnabled,
  totalFeatureCount,
  viewScaleLabel,
  visibleFeatureCount,
}: Partial<ModelResearchMapSummary> & {
  displayMode: ModelResearchMapDisplayMode;
  overlayEnabled: boolean;
  totalFeatureCount: number;
  visibleFeatureCount: number;
}): ModelResearchMapSummary {
  return {
    displayMode,
    displayModeLabel: getModelResearchViewScaleLabel(displayMode),
    dominantSignalLabel,
    overlayEnabled,
    totalFeatureCount,
    viewScaleLabel: viewScaleLabel ?? getModelResearchViewScaleLabel(displayMode),
    visibleFeatureCount,
  };
}

function buildModelResearchDisplayGraphics({
  displayMode,
  extent,
  markers,
  runtime,
}: ModelResearchDisplayOptions): ModelResearchDisplayResult {
  const visibleMarkers = filterModelResearchMarkersForExtent(markers, extent);
  const sourceMarkers = visibleMarkers.length ? visibleMarkers : markers;

  if (!sourceMarkers.length) {
    return {
      dominantSignalLabel: "No visible research signal",
      extentMarkers: [],
      graphics: [],
      visibleFeatureCount: 0,
    };
  }

  if (displayMode === "parcel_detail") {
    const detailMarkers = prioritizeModelResearchMarkers(sourceMarkers).slice(
      0,
      MODEL_LAB_PARCEL_DETAIL_MAX_MARKERS,
    );

    return {
      dominantSignalLabel: getDominantResearchSignalLabel(detailMarkers),
      extentMarkers: detailMarkers,
      graphics: detailMarkers.map((marker) =>
        createModelResearchPreviewGraphic(runtime, {
          ...marker,
          contextKind: "parcel_marker",
          representedFeatureCount: 1,
        }),
      ),
      visibleFeatureCount: detailMarkers.length,
    };
  }

  const cells = aggregateModelResearchMarkers(
    sourceMarkers,
    getModelResearchClusterCellSize(displayMode),
    displayMode,
  ).slice(0, getModelResearchClusterMaxCells(displayMode));

  return {
    dominantSignalLabel: getDominantResearchSignalLabel(sourceMarkers),
    extentMarkers: cells.map((cell) => aggregateCellToMarker(cell, displayMode)),
    graphics: cells.flatMap((cell) => {
      const graphic = createModelResearchAggregateGraphic(
        runtime,
        cell,
        displayMode,
      );
      const labelGraphic = createModelResearchAggregateLabelGraphic(
        runtime,
        cell,
        displayMode,
      );

      return labelGraphic ? [graphic, labelGraphic] : [graphic];
    }),
    visibleFeatureCount: cells.reduce((sum, cell) => sum + cell.count, 0),
  };
}

function buildModelResearchHeatmapFeatureGraphics({
  displayMode,
  extent,
  markers,
  runtime,
}: ModelResearchDisplayOptions): ModelResearchDisplayResult {
  const visibleMarkers = filterModelResearchMarkersForExtent(markers, extent);
  const sourceMarkers = visibleMarkers.length ? visibleMarkers : markers;
  const heatmapMarkers = prioritizeModelResearchMarkers(sourceMarkers).filter(
    (marker) =>
      Number.isFinite(marker.centroid.longitude) &&
      Number.isFinite(marker.centroid.latitude),
  );

  return {
    dominantSignalLabel: getDominantResearchSignalLabel(heatmapMarkers),
    extentMarkers: heatmapMarkers.map((marker) => ({
      ...marker,
      contextKind: "heatmap_cell",
      displayMode,
      representedFeatureCount: 1,
    })),
    graphics: heatmapMarkers.map((marker, index) =>
      createModelResearchHeatmapFeatureGraphic(
        runtime,
        marker,
        displayMode,
        index + 1,
      ),
    ),
    visibleFeatureCount: heatmapMarkers.length,
  };
}

function filterModelResearchMarkersForExtent(
  markers: ModelResearchPreviewMarker[],
  extent: FloodZoneExtent | null,
) {
  if (!extent) {
    return markers;
  }

  const longitudePadding = Math.max(0.015, (extent.xmax - extent.xmin) * 0.12);
  const latitudePadding = Math.max(0.015, (extent.ymax - extent.ymin) * 0.12);

  return markers.filter((marker) => {
    const { latitude, longitude } = marker.centroid;

    return (
      longitude >= extent.xmin - longitudePadding &&
      longitude <= extent.xmax + longitudePadding &&
      latitude >= extent.ymin - latitudePadding &&
      latitude <= extent.ymax + latitudePadding
    );
  });
}

function prioritizeModelResearchMarkers(markers: ModelResearchPreviewMarker[]) {
  return [...markers].sort((left, right) => {
    const signalDelta =
      getResearchSignalWeight(right.researchSignalLabel) -
      getResearchSignalWeight(left.researchSignalLabel);

    if (signalDelta !== 0) {
      return signalDelta;
    }

    return (
      getResearchBandWeight(right.researchRankBand) -
      getResearchBandWeight(left.researchRankBand)
    );
  });
}

function aggregateModelResearchMarkers(
  markers: ModelResearchPreviewMarker[],
  cellSizeDegrees: number,
  displayMode: ModelResearchMapDisplayMode,
) {
  const cells = new Map<string, ModelResearchAggregateCell>();

  markers.forEach((marker) => {
    const longitudeKey =
      Math.floor(marker.centroid.longitude / cellSizeDegrees) * cellSizeDegrees;
    const latitudeKey =
      Math.floor(marker.centroid.latitude / cellSizeDegrees) * cellSizeDegrees;
    const key = `${longitudeKey.toFixed(5)}:${latitudeKey.toFixed(5)}`;
    const weight = getResearchSignalWeight(marker.researchSignalLabel);
    const bandCounts = getInitialModelResearchBandCounts();
    incrementModelResearchBandCount(bandCounts, marker);
    const existingCell = cells.get(key);

    if (!existingCell) {
      cells.set(key, {
        bandCounts,
        count: 1,
        displayMode,
        dominantSignalLabel: marker.researchSignalLabel,
        id: `${displayMode}:${key}`,
        latitude: marker.centroid.latitude,
        longitude: marker.centroid.longitude,
        markers: [marker],
        topDrivers: marker.topDrivers,
        weight,
      });
      return;
    }

    const nextCount = existingCell.count + 1;
    existingCell.latitude =
      (existingCell.latitude * existingCell.count + marker.centroid.latitude) /
      nextCount;
    existingCell.longitude =
      (existingCell.longitude * existingCell.count + marker.centroid.longitude) /
      nextCount;
    existingCell.count = nextCount;
    existingCell.weight += weight;
    existingCell.markers.push(marker);
    incrementModelResearchBandCount(existingCell.bandCounts, marker);
    existingCell.dominantSignalLabel = getDominantResearchSignalLabel(
      existingCell.markers,
    );
    existingCell.topDrivers = getCommonTopDrivers(existingCell.markers);
  });

  return [...cells.values()].sort((left, right) => {
    const concentrationDelta =
      right.count * 2 + right.weight - (left.count * 2 + left.weight);

    if (concentrationDelta !== 0) {
      return concentrationDelta;
    }

    return (
      right.weight / Math.max(1, right.count) -
      left.weight / Math.max(1, left.count)
    );
  });
}

function aggregateCellToMarker(
  cell: ModelResearchAggregateCell,
  displayMode: ModelResearchMapDisplayMode,
): ModelResearchPreviewMarker {
  const dominantResearchBand = formatRelativeDevelopmentSignalBand({
    rankBand: getAggregateResearchBand(cell.dominantSignalLabel),
    signalLabel: cell.dominantSignalLabel,
  });
  const approximateAreaLabel = createModelResearchAreaLabel(cell, displayMode);
  const topDriverSummary = createModelResearchTopDriverSummary(cell.topDrivers);

  return {
    approximateAreaLabel,
    bandCounts: cell.bandCounts,
    caveat: "Internal research preview only. Not an official parcel score.",
    clusterId: cell.id,
    centroid: {
      latitude: cell.latitude,
      longitude: cell.longitude,
      spatialReference: { wkid: 4326 },
    },
    contextKind:
      displayMode === "countywide_heatmap" ? "heatmap_cell" : "cluster",
    dataQualityFlag: "research_preview_aggregate_context",
    displayMode,
    dominantResearchBand,
    exactProbabilityAvailable: false,
    modelVersion:
      cell.markers[0]?.modelVersion ?? "internal_model_research_preview",
    officialParcelId: approximateAreaLabel,
    productionReady: false,
    publicExposureAllowed: false,
    representativeSignalLabel: cell.dominantSignalLabel,
    representedFeatureCount: cell.count,
    researchRankBand: getAggregateResearchBand(cell.dominantSignalLabel),
    researchSignalLabel: cell.dominantSignalLabel,
    selectedFeatureGroupSummary: topDriverSummary,
    topDriverSummary,
    topDrivers: cell.topDrivers,
  };
}

function createModelResearchAggregateGraphic(
  runtime: ArcGISRuntime,
  cell: ModelResearchAggregateCell,
  displayMode: ModelResearchMapDisplayMode,
) {
  const aggregateMarker = aggregateCellToMarker(cell, displayMode);
  const profile = getModelResearchAggregateProfile(cell, displayMode);

  return new runtime.Graphic({
    attributes: createModelResearchAggregateAttributes(
      aggregateMarker,
      displayMode,
    ),
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: cell.longitude,
      y: cell.latitude,
    }),
    symbol: {
      color: profile.innerColor,
      outline: {
        color: profile.outlineColor,
        width: 1.4,
      },
      size: profile.outerSize,
      style: "circle",
      type: "simple-marker",
    } as unknown as Graphic["symbol"],
  });
}

function createModelResearchHeatmapFeatureGraphic(
  runtime: ArcGISRuntime,
  marker: ModelResearchPreviewMarker,
  displayMode: ModelResearchMapDisplayMode,
  objectId: number,
) {
  return new runtime.Graphic({
    attributes: {
      ...createModelResearchAggregateAttributes(
        {
          ...marker,
          contextKind: "heatmap_cell",
          displayMode,
          representedFeatureCount: 1,
        },
        displayMode,
      ),
      heatmapWeight: getResearchSignalWeight(marker.researchSignalLabel),
      objectId,
      renderedViewMode: "heatmap",
    },
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: marker.centroid.longitude,
      y: marker.centroid.latitude,
    }),
  });
}

function createModelResearchAggregateLabelGraphic(
  runtime: ArcGISRuntime,
  cell: ModelResearchAggregateCell,
  displayMode: ModelResearchMapDisplayMode,
) {
  if (cell.count <= 1) {
    return null;
  }

  const aggregateMarker = aggregateCellToMarker(cell, displayMode);
  const profile = getModelResearchAggregateProfile(cell, displayMode);

  return new runtime.Graphic({
    attributes: createModelResearchAggregateAttributes(
      aggregateMarker,
      displayMode,
    ),
    geometry: new runtime.Point({
      spatialReference: { wkid: 4326 },
      x: cell.longitude,
      y: cell.latitude,
    }),
    symbol: {
      color: [255, 255, 255, 0.96],
      font: {
        family: "Inter, Arial, sans-serif",
        size: profile.labelSize,
        weight: "bold",
      },
      haloColor: [7, 17, 31, 0.88],
      haloSize: 1.4,
      text: formatDevelopmentCount(cell.count),
      type: "text",
      yoffset: 0,
    } as unknown as Graphic["symbol"],
  });
}

function createModelResearchAggregateAttributes(
  aggregateMarker: ModelResearchPreviewMarker,
  displayMode: ModelResearchMapDisplayMode,
) {
  return {
    approximateAreaLabel: aggregateMarker.approximateAreaLabel,
    bandCountInsufficient: aggregateMarker.bandCounts?.insufficient ?? 0,
    bandCountLower: aggregateMarker.bandCounts?.lower ?? 0,
    bandCountModerate: aggregateMarker.bandCounts?.moderate ?? 0,
    bandCountStrong: aggregateMarker.bandCounts?.strong ?? 0,
    bandCountVeryStrong: aggregateMarker.bandCounts?.veryStrong ?? 0,
    caveat: aggregateMarker.caveat,
    clusterId: aggregateMarker.clusterId,
    contextKind: aggregateMarker.contextKind,
    dataQualityFlag: aggregateMarker.dataQualityFlag,
    displayMode,
    dominantResearchBand: aggregateMarker.dominantResearchBand,
    exactProbabilityAvailable: false,
    graphicRole: "model-research-preview",
    modelVersion: aggregateMarker.modelVersion,
    officialParcelId: aggregateMarker.officialParcelId,
    productionReady: false,
    publicExposureAllowed: false,
    representativeSignalLabel: aggregateMarker.representativeSignalLabel,
    representedFeatureCount: aggregateMarker.representedFeatureCount,
    researchRankBand: aggregateMarker.researchRankBand,
    researchSignalLabel: aggregateMarker.researchSignalLabel,
    selectedFeatureGroupSummary: aggregateMarker.selectedFeatureGroupSummary,
    topDriver1: aggregateMarker.topDrivers[0] ?? null,
    topDriver2: aggregateMarker.topDrivers[1] ?? null,
    topDriver3: aggregateMarker.topDrivers[2] ?? null,
    topDriverSummary: aggregateMarker.topDriverSummary,
  };
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
      color: profile.fillColor,
      outline: {
        color: profile.outlineColor,
        width: profile.outlineSize,
      },
      type: "simple-fill",
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

function createSchoolPressureGraphic(
  runtime: ArcGISRuntime,
  feature: SchoolPressureFeature,
  selectedZoneId: string | null = null,
) {
  if (!feature.geometry) {
    return null;
  }

  const rings = convertGeoJsonPolygonCoordinatesToArcGisRings(
    feature.geometry,
  );

  if (!rings.length) {
    return null;
  }

  const properties = feature.properties;
  const profile = getSchoolPressureSymbolProfile(
    properties.school_pressure_watch_band,
    properties.attendance_area_id === selectedZoneId ? "selected" : "default",
  );

  return new runtime.Graphic({
    attributes: {
      attendanceAreaId: properties.attendance_area_id,
      caveats: properties.caveats,
      graphicRole: "school-pressure-area",
      observedGrowthPressureBand: properties.observed_growth_pressure_band,
      permitCountPrevious: properties.permit_count_previous,
      permitCountRecent: properties.permit_count_recent,
      permitGrowthDelta: properties.permit_growth_delta,
      pressureReasons: properties.top_reasons,
      recommendedFollowup: properties.recommended_followup,
      residentialPermitCountRecent: properties.residential_permit_count_recent,
      schoolLevel: properties.school_level,
      schoolName: properties.school_name,
      schoolPressureWatchBand: properties.school_pressure_watch_band,
      schoolYear: properties.enrollment_year,
      utilizationClass: properties.utilization_status,
      utilizationPct: properties.utilization_pct,
      zoneId: properties.attendance_area_id,
    },
    geometry: new runtime.Polygon({
      rings,
      spatialReference: {
        wkid: feature.geometry.spatialReference?.wkid ?? 4326,
      },
    }),
    popupTemplate: {
      content:
        "Preliminary school capacity watch based on utilization context and observed permit activity. Not an official enrollment forecast.",
      title: properties.school_name ?? "School pressure area",
    },
    symbol: {
      color: profile.fillColor,
      outline: {
        color: profile.outlineColor,
        width: profile.outlineSize,
      },
      type: "simple-fill",
    } as unknown as Graphic["symbol"],
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
    color: profile.fillColor,
    outline: {
      color: profile.outlineColor,
      width: profile.outlineSize,
    },
    type: "simple-fill",
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

function getSchoolPressureSymbolProfile(
  band: string | null | undefined,
  state: SchoolUtilizationZoneInteractionState = "default",
) {
  const profile =
    band === "elevated review"
      ? {
          fillColor: [236, 72, 153, 0.26],
          outlineColor: [236, 72, 153, 0.94],
          outlineSize: 1.8,
        }
      : band === "review"
        ? {
            fillColor: [249, 115, 22, 0.22],
            outlineColor: [249, 115, 22, 0.88],
            outlineSize: 1.4,
          }
        : band === "monitor"
          ? {
              fillColor: [56, 189, 248, 0.16],
              outlineColor: [56, 189, 248, 0.72],
              outlineSize: 1,
            }
          : {
              fillColor: [148, 163, 184, 0.1],
              outlineColor: [148, 163, 184, 0.46],
              outlineSize: 0.9,
            };

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

    if (
      attributes.graphicRole !== "school-utilization-zone" &&
      attributes.graphicRole !== "school-pressure-area"
    ) {
      return;
    }

    const zoneId = stringAttribute(attributes.zoneId);
    const state: SchoolUtilizationZoneInteractionState =
      selectedZoneId && zoneId === selectedZoneId
        ? "selected"
        : hoveredZoneId && zoneId === hoveredZoneId
          ? "hover"
          : "default";

    graphic.symbol =
      attributes.graphicRole === "school-pressure-area"
        ? ({
            color: getSchoolPressureSymbolProfile(
              stringAttribute(attributes.schoolPressureWatchBand),
              state,
            ).fillColor,
            outline: {
              color: getSchoolPressureSymbolProfile(
                stringAttribute(attributes.schoolPressureWatchBand),
                state,
              ).outlineColor,
              width: getSchoolPressureSymbolProfile(
                stringAttribute(attributes.schoolPressureWatchBand),
                state,
              ).outlineSize,
            },
            type: "simple-fill",
          } as unknown as Graphic["symbol"])
        : createSchoolUtilizationZoneSymbol(
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

function getDevelopmentHotspotRecordCount(
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
) {
  if (activePermitSegment) {
    return Math.max(1, getSelectedSegmentPermitCount(marker, activePermitSegment));
  }

  return Math.max(1, marker.totalPermitCount);
}

function getDevelopmentHotspotMarkerWeight(
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
) {
  return (
    getDevelopmentHotspotRecordCount(marker, activePermitSegment) +
    marker.recentPermitCount3yr * 0.35 +
    marker.highValuePermits * 1.5 +
    marker.majorValuePermits * 2.25
  );
}

function getDevelopmentHotspotSegmentCounts(
  marker: DevelopmentHotspotMapMarker,
): DevelopmentHotspotSegmentCounts {
  return {
    administrativeOrUnknown: Math.max(
      0,
      marker.totalPermitCount -
        marker.commercialActivityPermits -
        marker.demolitionPermits -
        marker.industrialActivityPermits -
        marker.institutionalActivityPermits -
        marker.minorMaintenancePermits -
        marker.redevelopmentSignalPermits -
        marker.residentialGrowthPermits,
    ),
    commercialActivity: marker.commercialActivityPermits,
    demolition: marker.demolitionPermits,
    industrialActivity: marker.industrialActivityPermits,
    institutionalActivity: marker.institutionalActivityPermits,
    minorMaintenance: marker.minorMaintenancePermits,
    redevelopmentSignal: marker.redevelopmentSignalPermits,
    residentialGrowth: marker.residentialGrowthPermits,
  };
}

function mergeDevelopmentHotspotSegmentCounts(
  left: DevelopmentHotspotSegmentCounts,
  right: DevelopmentHotspotSegmentCounts,
): DevelopmentHotspotSegmentCounts {
  return {
    administrativeOrUnknown:
      left.administrativeOrUnknown + right.administrativeOrUnknown,
    commercialActivity: left.commercialActivity + right.commercialActivity,
    demolition: left.demolition + right.demolition,
    industrialActivity: left.industrialActivity + right.industrialActivity,
    institutionalActivity: left.institutionalActivity + right.institutionalActivity,
    minorMaintenance: left.minorMaintenance + right.minorMaintenance,
    redevelopmentSignal: left.redevelopmentSignal + right.redevelopmentSignal,
    residentialGrowth: left.residentialGrowth + right.residentialGrowth,
  };
}

function getDominantDevelopmentHotspotSegment(
  counts: DevelopmentHotspotSegmentCounts,
) {
  const entries: Array<[string, number]> = [
    ["residential_growth", counts.residentialGrowth],
    ["commercial_activity", counts.commercialActivity],
    ["industrial_activity", counts.industrialActivity],
    ["redevelopment_signal", counts.redevelopmentSignal],
    ["institutional_activity", counts.institutionalActivity],
    ["minor_maintenance", counts.minorMaintenance],
    ["demolition", counts.demolition],
    ["administrative_or_unknown", counts.administrativeOrUnknown],
  ];
  const [segment, count] = entries.sort((left, right) => right[1] - left[1])[0] ?? [];

  return count && count > 0 ? segment : null;
}

function getDominantDevelopmentHotspotActivityClass(
  markers: DevelopmentHotspotMapMarker[],
) {
  const counts = new Map<string, number>();

  markers.forEach((marker) => {
    const activityClass = marker.developmentActivityClass;
    counts.set(activityClass, (counts.get(activityClass) ?? 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
    ?? null;
}

function getAverageDevelopmentActivityScore(
  markers: DevelopmentHotspotMapMarker[],
) {
  const scores = markers
    .map((marker) => marker.developmentActivityScore)
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) {
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function getDominantDevelopmentHotspotJurisdiction(
  markers: DevelopmentHotspotMapMarker[],
) {
  const counts = new Map<string, number>();

  markers.forEach((marker) => {
    const jurisdiction = marker.zoningJurisdictionName?.trim();

    if (!jurisdiction) {
      return;
    }

    counts.set(jurisdiction, (counts.get(jurisdiction) ?? 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
    ?? null;
}

function createDevelopmentHotspotContextFromMarker(
  marker: DevelopmentHotspotMapMarker,
  activePermitSegment: string | null,
  displayMode: DevelopmentHotspotMapDisplayMode,
): SelectedDevelopmentHotspotContext {
  const segmentCounts = getDevelopmentHotspotSegmentCounts(marker);
  const dominantPermitSegment =
    activePermitSegment ??
    getDominantDevelopmentHotspotSegment(segmentCounts) ??
    marker.dominantPermitSegment;
  const recordsRepresented = getDevelopmentHotspotRecordCount(
    marker,
    activePermitSegment,
  );
  const topDrivers = getDevelopmentHotspotTopDrivers({
    dominantPermitSegment,
    highValuePermits: marker.highValuePermits,
    recentPermitCount3yr: marker.recentPermitCount3yr,
    totalPermitCount: marker.totalPermitCount,
  });

  return {
    activityClass: marker.developmentActivityClass,
    areaLabel: marker.officialParcelId,
    caveat: "Observed permit context, not a prediction.",
    contextKind: "individual",
    developmentActivityScore: marker.developmentActivityScore,
    displayMode,
    dominantActivityType: marker.developmentActivityClass,
    dominantPermitSegment,
    highValuePermits: marker.highValuePermits,
    latestActivityLabel: formatDevelopmentHotspotRecentActivityLabel(
      marker.recentPermitCount1yr,
      marker.recentPermitCount3yr,
    ),
    majorValuePermits: marker.majorValuePermits,
    officialParcelId: marker.officialParcelId,
    parcelsRepresented: 1,
    pin14: marker.pin14,
    recentPermitCount1yr: marker.recentPermitCount1yr,
    recentPermitCount3yr: marker.recentPermitCount3yr,
    recordsRepresented,
    representedParcelIds: [marker.officialParcelId],
    selectedPermitSegment: activePermitSegment,
    segmentCounts,
    topDrivers,
    totalPermitCount: marker.totalPermitCount,
    whyHighlighted:
      "This parcel is highlighted because observed permit/development activity is concentrated in the selected countywide layer filters.",
    zoningJurisdictionName: marker.zoningJurisdictionName,
  };
}

function createDevelopmentHotspotContextFromCell(
  cell: DevelopmentHotspotAggregateCell,
): SelectedDevelopmentHotspotContext {
  const areaLabel = createDevelopmentHotspotAreaLabel(cell);
  const topDrivers = getDevelopmentHotspotTopDrivers({
    dominantPermitSegment: cell.dominantPermitSegment,
    highValuePermits: cell.highValuePermits,
    recentPermitCount3yr: cell.recentPermitCount3yr,
    totalPermitCount: cell.totalPermitCount,
  });

  return {
    activityClass: cell.activityClass,
    areaLabel,
    caveat: "Observed permit/development activity only. Not a prediction.",
    clusterId: cell.clusterId,
    contextKind: cell.displayMode === "heatmap" ? "heatmap_cell" : "cluster",
    developmentActivityScore: cell.developmentActivityScore,
    displayMode: cell.displayMode,
    dominantActivityType: cell.activityClass,
    dominantPermitSegment: cell.dominantPermitSegment,
    highValuePermits: cell.highValuePermits,
    latestActivityLabel: formatDevelopmentHotspotRecentActivityLabel(
      cell.recentPermitCount1yr,
      cell.recentPermitCount3yr,
    ),
    majorValuePermits: cell.majorValuePermits,
    parcelsRepresented: cell.parcelsRepresented,
    recentPermitCount1yr: cell.recentPermitCount1yr,
    recentPermitCount3yr: cell.recentPermitCount3yr,
    recordsRepresented: cell.recordsRepresented,
    representedParcelIds: cell.markers
      .map((marker) => marker.officialParcelId)
      .slice(0, 20),
    selectedPermitSegment: cell.selectedPermitSegment,
    segmentCounts: cell.segmentCounts,
    topDrivers,
    totalPermitCount: cell.totalPermitCount,
    whyHighlighted:
      "This cluster contains parcels with observed permit/development activity concentrated in the current map view and layer filters.",
    zoningJurisdictionName: cell.zoningJurisdictionName,
  };
}

function createDevelopmentHotspotContextAttributes(
  context: SelectedDevelopmentHotspotContext,
) {
  return {
    activityClass: context.activityClass,
    areaLabel: context.areaLabel,
    caveat: context.caveat,
    clusterId: context.clusterId ?? null,
    contextKind: context.contextKind,
    developmentActivityScore: context.developmentActivityScore,
    displayMode: context.displayMode,
    dominantActivityType: context.dominantActivityType,
    dominantPermitSegment: context.dominantPermitSegment,
    graphicRole: "development-hotspot",
    highValuePermits: context.highValuePermits,
    latestActivityLabel: context.latestActivityLabel,
    majorValuePermits: context.majorValuePermits,
    officialParcelId: context.officialParcelId ?? null,
    parcelsRepresented: context.parcelsRepresented,
    pin14: context.pin14 ?? null,
    recentPermitCount1yr: context.recentPermitCount1yr,
    recentPermitCount3yr: context.recentPermitCount3yr,
    recordsRepresented: context.recordsRepresented,
    representedParcelIds: context.representedParcelIds.join(","),
    selectedPermitSegment: context.selectedPermitSegment,
    segmentCountAdministrativeOrUnknown:
      context.segmentCounts.administrativeOrUnknown,
    segmentCountCommercialActivity: context.segmentCounts.commercialActivity,
    segmentCountDemolition: context.segmentCounts.demolition,
    segmentCountIndustrialActivity: context.segmentCounts.industrialActivity,
    segmentCountInstitutionalActivity:
      context.segmentCounts.institutionalActivity,
    segmentCountMinorMaintenance: context.segmentCounts.minorMaintenance,
    segmentCountRedevelopmentSignal: context.segmentCounts.redevelopmentSignal,
    segmentCountResidentialGrowth: context.segmentCounts.residentialGrowth,
    topDriver1: context.topDrivers[0] ?? null,
    topDriver2: context.topDrivers[1] ?? null,
    topDriver3: context.topDrivers[2] ?? null,
    totalPermitCount: context.totalPermitCount,
    whyHighlighted: context.whyHighlighted,
    zoningJurisdictionName: context.zoningJurisdictionName,
  };
}

function createDevelopmentHotspotAreaLabel(
  cell: DevelopmentHotspotAggregateCell,
) {
  const jurisdiction = cell.zoningJurisdictionName?.trim();

  if (jurisdiction) {
    return `Cluster near ${jurisdiction}`;
  }

  return `Development activity cluster of ${formatDevelopmentCount(
    cell.recordsRepresented,
  )} records`;
}

function formatDevelopmentHotspotRecentActivityLabel(
  recentPermitCount1yr: number,
  recentPermitCount3yr: number,
) {
  if (recentPermitCount1yr > 0) {
    return `${formatDevelopmentCount(recentPermitCount1yr)} records in the last year`;
  }

  if (recentPermitCount3yr > 0) {
    return `${formatDevelopmentCount(recentPermitCount3yr)} records in the last 3 years`;
  }

  return "No recent activity in the selected recent-window filters";
}

function getDevelopmentHotspotTopDrivers({
  dominantPermitSegment,
  highValuePermits,
  recentPermitCount3yr,
  totalPermitCount,
}: {
  dominantPermitSegment: string | null;
  highValuePermits: number;
  recentPermitCount3yr: number;
  totalPermitCount: number;
}) {
  const drivers: string[] = [];

  if (dominantPermitSegment) {
    drivers.push(formatDevelopmentDomainLabel(dominantPermitSegment));
  }

  if (recentPermitCount3yr > 0) {
    drivers.push("Recent permit activity");
  }

  if (highValuePermits > 0) {
    drivers.push("High-value permits");
  }

  if (totalPermitCount > 0) {
    drivers.push("Observed permit concentration");
  }

  return [...new Set(drivers)].slice(0, 3);
}

function getDevelopmentHotspotAggregateProfile(
  cell: DevelopmentHotspotAggregateCell,
) {
  const segmentProfile = getPermitSegmentVisualProfile(
    cell.dominantPermitSegment,
  );
  const sizeProfile = getDevelopmentHotspotCountSizeProfile(
    cell.recordsRepresented,
    cell.displayMode,
  );

  return {
    innerColor: segmentProfile.color,
    innerOutlineColor: segmentProfile.outlineColor,
    innerSize: sizeProfile.innerSize,
    labelSize: sizeProfile.labelSize,
    maxWorldLength: sizeProfile.maxWorldLength,
    outerColor: segmentProfile.haloColor,
    outerSize: sizeProfile.outerSize,
    outlineColor: segmentProfile.outlineColor,
    primitive: segmentProfile.primitive,
    screenLength: sizeProfile.screenLength,
  };
}

function getDevelopmentHotspotCountSizeProfile(
  count: number,
  displayMode: DevelopmentHotspotMapDisplayMode,
) {
  const normalizedCount = Math.max(1, Math.round(count));
  const modeScale =
    displayMode === "countywide_clusters"
      ? 1.04
      : displayMode === "fine_clusters"
        ? 0.92
        : 1;
  const bucket =
    normalizedCount <= 1
      ? {
          innerSize: 9,
          labelSize: 0,
          maxWorldLength: 520,
          outerSize: 14,
          screenLength: 34,
        }
      : normalizedCount <= 5
        ? {
            innerSize: 18,
            labelSize: 10,
            maxWorldLength: 980,
            outerSize: 25,
            screenLength: 42,
          }
        : normalizedCount <= 15
          ? {
              innerSize: 27,
              labelSize: 11,
              maxWorldLength: 1350,
              outerSize: 35,
              screenLength: 52,
            }
          : normalizedCount <= 35
            ? {
                innerSize: 37,
                labelSize: 12,
                maxWorldLength: 1750,
                outerSize: 47,
                screenLength: 62,
              }
            : normalizedCount <= 75
              ? {
                  innerSize: 50,
                  labelSize: 13,
                  maxWorldLength: 2200,
                  outerSize: 61,
                  screenLength: 72,
                }
              : {
                  innerSize: 62,
                  labelSize: 14,
                  maxWorldLength: 2600,
                  outerSize: 74,
                  screenLength: 80,
                };

  return {
    innerSize: Math.round(bucket.innerSize * modeScale),
    labelSize: bucket.labelSize,
    maxWorldLength: Math.round(bucket.maxWorldLength * modeScale),
    outerSize: Math.round(bucket.outerSize * modeScale),
    screenLength: Math.round(bucket.screenLength * modeScale),
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
  const haloSize = Math.round(size * 1.48);

  return {
    haloOutlineColor: [255, 255, 255, 0.1],
    haloSize,
    maxWorldLength: Math.round(size * 42),
    outlineSize:
      tier === "very_high"
        ? 1.2
        : tier === "high"
          ? 1.05
          : tier === "moderate"
            ? 0.9
            : 0.75,
    screenLength: Math.round(size * 3.6),
    size,
    tier,
  };
}

function getDevelopmentHotspotMarkerSize(
  selectedSegmentCount: number,
  intensity: number,
) {
  if (selectedSegmentCount >= 26) {
    return 10;
  }

  if (selectedSegmentCount >= 11) {
    return 9;
  }

  if (selectedSegmentCount >= 3) {
    return 8;
  }

  return 7 + Math.min(1, Math.max(selectedSegmentCount, intensity * 2) * 0.25);
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

function getModelResearchPreviewMarkerProfile(
  marker: ModelResearchPreviewMarker,
) {
  const relativeBand = formatRelativeDevelopmentSignalBand({
    rankBand: marker.researchRankBand,
    signalLabel: marker.researchSignalLabel,
  });

  if (relativeBand === "Very Strong Research Signal") {
    return {
      color: [249, 115, 22, 0.9],
      haloColor: [249, 115, 22, 0.07],
      haloOutlineColor: [254, 215, 170, 0.18],
      haloSize: 16,
      maxWorldLength: 520,
      outlineColor: [255, 247, 237, 0.86],
      outlineSize: 1,
      screenLength: 42,
      size: 9,
    };
  }

  if (relativeBand === "Strong Research Signal") {
    return {
      color: [250, 204, 21, 0.78],
      haloColor: [250, 204, 21, 0.06],
      haloOutlineColor: [253, 230, 138, 0.16],
      haloSize: 14,
      maxWorldLength: 460,
      outlineColor: [254, 249, 195, 0.78],
      outlineSize: 0.8,
      screenLength: 36,
      size: 8,
    };
  }

  if (relativeBand === "Moderate Research Signal") {
    return {
      color: [56, 189, 248, 0.72],
      haloColor: [56, 189, 248, 0.05],
      haloOutlineColor: [191, 219, 254, 0.14],
      haloSize: 12,
      maxWorldLength: 420,
      outlineColor: [224, 242, 254, 0.78],
      outlineSize: 0.7,
      screenLength: 32,
      size: 7,
    };
  }

  if (relativeBand === "Insufficient Data") {
    return {
      color: [30, 41, 59, 0.42],
      haloColor: [15, 23, 42, 0.08],
      haloOutlineColor: [100, 116, 139, 0.16],
      haloSize: 12,
      maxWorldLength: 380,
      outlineColor: [100, 116, 139, 0.45],
      outlineSize: 0.8,
      screenLength: 32,
      size: 5,
    };
  }

  return {
    color: [100, 116, 139, 0.58],
    haloColor: [100, 116, 139, 0.1],
    haloOutlineColor: [203, 213, 225, 0.18],
    haloSize: 11,
    maxWorldLength: 380,
    outlineColor: [203, 213, 225, 0.62],
    outlineSize: 0.7,
    screenLength: 30,
    size: 5,
  };
}

function getModelResearchAggregateProfile(
  cell: ModelResearchAggregateCell,
  displayMode: ModelResearchMapDisplayMode,
) {
  const relativeBand = formatRelativeDevelopmentSignalBand({
    rankBand: getAggregateResearchBand(cell.dominantSignalLabel),
    signalLabel: cell.dominantSignalLabel,
  });
  const averageWeight = cell.weight / Math.max(1, cell.count);
  const countProfile = getModelResearchCountSizeProfile(
    cell.count,
    displayMode,
  );
  const baseOuterSize = countProfile.outerSize;
  const baseInnerSize = countProfile.innerSize;
  const opacityBoost = Math.min(0.16, averageWeight * 0.025);

  if (relativeBand === "Very Strong Research Signal") {
    return {
      innerColor: [249, 115, 22, 0.62 + opacityBoost],
      innerOutlineColor: [255, 237, 213, 0.7],
      innerSize: baseInnerSize,
      maxWorldLength: getModelResearchAggregateWorldLength(
        displayMode,
        3900,
        1650,
      ),
      outerColor: [249, 115, 22, 0.1 + opacityBoost],
      outerSize: baseOuterSize,
      outlineColor: [254, 215, 170, 0.14],
      labelSize: countProfile.labelSize,
      screenLength: countProfile.screenLength,
    };
  }

  if (relativeBand === "Strong Research Signal") {
    return {
      innerColor: [250, 204, 21, 0.48 + opacityBoost],
      innerOutlineColor: [254, 249, 195, 0.58],
      innerSize: baseInnerSize,
      maxWorldLength: getModelResearchAggregateWorldLength(
        displayMode,
        3300,
        1400,
      ),
      outerColor: [250, 204, 21, 0.08 + opacityBoost],
      outerSize: baseOuterSize,
      outlineColor: [253, 230, 138, 0.16],
      labelSize: countProfile.labelSize,
      screenLength: countProfile.screenLength,
    };
  }

  if (relativeBand === "Moderate Research Signal") {
    return {
      innerColor: [56, 189, 248, 0.38 + opacityBoost],
      innerOutlineColor: [191, 219, 254, 0.46],
      innerSize: baseInnerSize,
      maxWorldLength: getModelResearchAggregateWorldLength(
        displayMode,
        2700,
        1150,
      ),
      outerColor: [56, 189, 248, 0.07 + opacityBoost],
      outerSize: baseOuterSize,
      outlineColor: [125, 211, 252, 0.14],
      labelSize: countProfile.labelSize,
      screenLength: countProfile.screenLength,
    };
  }

  if (relativeBand === "Insufficient Data") {
    return {
      innerColor: [30, 41, 59, 0.34],
      innerOutlineColor: [100, 116, 139, 0.34],
      innerSize: baseInnerSize,
      maxWorldLength: getModelResearchAggregateWorldLength(
        displayMode,
        2100,
        900,
      ),
      outerColor: [15, 23, 42, 0.07],
      outerSize: baseOuterSize,
      outlineColor: [71, 85, 105, 0.16],
      labelSize: countProfile.labelSize,
      screenLength: countProfile.screenLength,
    };
  }

  return {
    innerColor: [100, 116, 139, 0.44],
    innerOutlineColor: [203, 213, 225, 0.42],
    innerSize: baseInnerSize,
    maxWorldLength: getModelResearchAggregateWorldLength(
      displayMode,
      2400,
      1000,
    ),
    outerColor: [100, 116, 139, 0.08],
    outerSize: baseOuterSize,
    outlineColor: [148, 163, 184, 0.15],
    labelSize: countProfile.labelSize,
    screenLength: countProfile.screenLength,
  };
}

function getModelResearchCountSizeProfile(
  count: number,
  displayMode: ModelResearchMapDisplayMode,
) {
  const normalizedCount = Math.max(1, Math.round(count));
  const modeScale =
    displayMode === "countywide_heatmap"
      ? 1.04
      : displayMode === "fine_local_clusters"
        ? 0.9
        : 1;
  const bucket =
    normalizedCount <= 1
      ? { innerSize: 9, labelSize: 0, outerSize: 15, screenLength: 32 }
      : normalizedCount <= 5
        ? { innerSize: 18, labelSize: 10, outerSize: 24, screenLength: 42 }
        : normalizedCount <= 15
          ? { innerSize: 26, labelSize: 11, outerSize: 33, screenLength: 50 }
          : normalizedCount <= 35
            ? { innerSize: 36, labelSize: 12, outerSize: 45, screenLength: 60 }
            : normalizedCount <= 75
              ? { innerSize: 48, labelSize: 13, outerSize: 59, screenLength: 70 }
              : { innerSize: 60, labelSize: 14, outerSize: 70, screenLength: 78 };

  return {
    innerSize: Math.round(bucket.innerSize * modeScale),
    labelSize: bucket.labelSize,
    outerSize: Math.round(bucket.outerSize * modeScale),
    screenLength: Math.round(bucket.screenLength * modeScale),
  };
}

function getModelResearchAggregateWorldLength(
  displayMode: ModelResearchMapDisplayMode,
  countywideLength: number,
  groupedLength: number,
) {
  if (displayMode === "countywide_heatmap") {
    return countywideLength;
  }

  if (displayMode === "fine_local_clusters") {
    return Math.round(groupedLength * 0.78);
  }

  return groupedLength;
}

function getResearchSignalWeight(label: string) {
  switch (label) {
    case "Very Strong Research Signal":
      return 5;
    case "Higher research signal":
      return 4;
    case "Strong Research Signal":
      return 4;
    case "Moderate Research Signal":
    case "Moderate research signal":
      return 3;
    case "Lower Research Signal":
    case "Lower research signal":
      return 2;
    case "Insufficient Data":
    case "Insufficient data":
      return 1;
    default:
      return 1;
  }
}

function getResearchBandWeight(band: string) {
  switch (band) {
    case "top_1_percent_research_band":
      return 4;
    case "top_5_percent_research_band":
      return 3;
    case "top_15_percent_research_band":
      return 2;
    default:
      return 1;
  }
}

function getDominantResearchSignalLabel(
  markers: ModelResearchPreviewMarker[],
) {
  if (!markers.length) {
    return "No visible research signal";
  }

  const totals = new Map<string, number>();

  markers.forEach((marker) => {
    totals.set(
      marker.researchSignalLabel,
      (totals.get(marker.researchSignalLabel) ?? 0) +
        getResearchSignalWeight(marker.researchSignalLabel),
    );
  });

  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
    ?? "No visible research signal";
}

function getAggregateResearchBand(signalLabel: string) {
  if (signalLabel === "Very Strong Research Signal") {
    return "top_5_percent_research_band";
  }

  if (signalLabel === "Strong Research Signal") {
    return "top_15_percent_research_band";
  }

  if (signalLabel === "Higher research signal") {
    return "top_5_percent_research_band";
  }

  if (signalLabel === "Moderate Research Signal") {
    return "top_15_percent_research_band";
  }

  if (signalLabel === "Moderate research signal") {
    return "top_15_percent_research_band";
  }

  if (signalLabel === "Insufficient Data") {
    return "insufficient_data";
  }

  return "remaining_research_band";
}

function getCommonTopDrivers(markers: ModelResearchPreviewMarker[]) {
  const driverCounts = new Map<string, number>();

  markers.forEach((marker) => {
    marker.topDrivers.forEach((driver) => {
      driverCounts.set(driver, (driverCounts.get(driver) ?? 0) + 1);
    });
  });

  return [...driverCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([driver]) => driver);
}

function getInitialModelResearchBandCounts(): NonNullable<
  ModelResearchPreviewMarker["bandCounts"]
> {
  return {
    insufficient: 0,
    lower: 0,
    moderate: 0,
    strong: 0,
    veryStrong: 0,
  };
}

function incrementModelResearchBandCount(
  counts: NonNullable<ModelResearchPreviewMarker["bandCounts"]>,
  marker: ModelResearchPreviewMarker,
) {
  const relativeBand = formatRelativeDevelopmentSignalBand({
    rankBand: marker.researchRankBand,
    signalLabel: marker.researchSignalLabel,
  });

  switch (relativeBand) {
    case "Very Strong Research Signal":
      counts.veryStrong += 1;
      break;
    case "Strong Research Signal":
      counts.strong += 1;
      break;
    case "Moderate Research Signal":
      counts.moderate += 1;
      break;
    case "Lower Research Signal":
      counts.lower += 1;
      break;
    case "Insufficient Data":
      counts.insufficient += 1;
      break;
    default:
      counts.insufficient += 1;
      break;
  }
}

function createModelResearchAreaLabel(
  cell: ModelResearchAggregateCell,
  displayMode: ModelResearchMapDisplayMode,
) {
  const contextualLabel = getContextualModelResearchAreaLabel(
    cell.markers,
    cell.count,
  );

  if (displayMode === "countywide_heatmap") {
    return (
      contextualLabel ??
      `Research surface cell of ${formatModelResearchParcelCountLabel(cell.count)}`
    );
  }

  if (cell.count === 1) {
    return contextualLabel ?? "Single research feature";
  }

  return (
    contextualLabel ??
    `Research cluster of ${formatModelResearchParcelCountLabel(cell.count)}`
  );
}

function getContextualModelResearchAreaLabel(
  markers: ModelResearchPreviewMarker[],
  count: number,
) {
  const labelCounts = new Map<string, number>();

  markers.forEach((marker) => {
    const label = marker.approximateAreaLabel?.trim();

    if (!label || !isUsableModelResearchAreaLabel(label)) {
      return;
    }

    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });

  const [dominantLabel] =
    [...labelCounts.entries()].sort((left, right) => right[1] - left[1])[0] ??
    [];

  if (!dominantLabel) {
    return null;
  }

  if (/^(cluster|research|single)/i.test(dominantLabel)) {
    return dominantLabel;
  }

  return count === 1 ? dominantLabel : `Cluster near ${dominantLabel}`;
}

function isUsableModelResearchAreaLabel(label: string) {
  const normalized = label.toLowerCase();

  return (
    !normalized.includes("unknown") &&
    !normalized.includes("research cluster of") &&
    !normalized.includes("research surface cell of") &&
    !normalized.includes("single research feature")
  );
}

function createModelResearchTopDriverSummary(drivers: string[]) {
  if (!drivers.length) {
    return "Driver summary unavailable";
  }

  return drivers
    .map((driver) => formatModelResearchDriverLabel(driver))
    .join(", ");
}

function formatModelResearchParcelCountLabel(count: number) {
  return count === 1
    ? "1 parcel"
    : `${formatDevelopmentCount(count)} parcels`;
}

function createModelResearchPreviewExtent(
  runtime: ArcGISRuntime,
  markers: ModelResearchPreviewMarker[],
) {
  const validMarkers = markers.filter(
    (marker) =>
      Number.isFinite(marker.centroid.longitude) &&
      Number.isFinite(marker.centroid.latitude),
  );

  if (!validMarkers.length) {
    return null;
  }

  const longitudes = validMarkers.map((marker) => marker.centroid.longitude);
  const latitudes = validMarkers.map((marker) => marker.centroid.latitude);
  const xmin = Math.min(...longitudes);
  const xmax = Math.max(...longitudes);
  const ymin = Math.min(...latitudes);
  const ymax = Math.max(...latitudes);
  const xPadding = Math.max((xmax - xmin) * 0.24, 0.012);
  const yPadding = Math.max((ymax - ymin) * 0.24, 0.012);

  return new runtime.Extent({
    spatialReference: {
      wkid: 4326,
    },
    xmax: xmax + xPadding,
    xmin: xmin - xPadding,
    ymax: ymax + yPadding,
    ymin: ymin - yPadding,
  });
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
  schoolPressureLayer: GraphicsLayer | null,
  onHotspotContext: (
    hotspotContext: SelectedDevelopmentHotspotContext | null,
  ) => void,
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

    if (!hotspotGraphic) {
      return false;
    }

    closeSceneViewPopup(view);
    onFloodInfoClose();
    onHotspotContext(
      createDevelopmentHotspotSelectionContext(
        hotspotGraphic,
        getRelatedSchoolPressureNote(hotspotGraphic, schoolPressureLayer),
      ),
    );

    console.debug("[CFS development hotspots]", "hotspot selected", {
      areaLabel: hotspotGraphic?.attributes?.areaLabel,
      contextKind: hotspotGraphic?.attributes?.contextKind,
      recordsRepresented: hotspotGraphic?.attributes?.recordsRepresented,
    });

    return true;
  } catch (error) {
    console.warn("Development hotspot hit test failed", error);
    return false;
  }
}

async function handleModelResearchPreviewClick(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  previewLayer: GraphicsLayer | null,
  onModelResearchContext: (context: ModelResearchPreviewMarker | null) => void,
) {
  if (!previewLayer || !previewLayer.visible || previewLayer.graphics.length === 0) {
    return false;
  }

  try {
    const response = await view.hitTest(event, {
      include: [previewLayer],
    });
    const results = response.results as Array<{ graphic?: Graphic }>;
    const researchGraphic = results.find(
      (result) =>
        result.graphic?.attributes?.graphicRole === "model-research-preview",
    )?.graphic ?? findNearestModelResearchGraphic(view, event, previewLayer);

    if (!researchGraphic) {
      return false;
    }

    closeSceneViewPopup(view);
    onModelResearchContext(createModelResearchPreviewContext(researchGraphic));

    console.debug("[CFS model research preview]", "safe marker selected", {
      modelVersion: researchGraphic?.attributes?.modelVersion,
      officialParcelId: researchGraphic?.attributes?.officialParcelId,
      researchRankBand: researchGraphic?.attributes?.researchRankBand,
      researchSignalLabel: researchGraphic?.attributes?.researchSignalLabel,
    });

    return true;
  } catch (error) {
    console.warn("Model research preview hit test failed", error);
    return false;
  }
}

function findNearestModelResearchGraphic(
  view: SceneView,
  event: Parameters<SceneView["hitTest"]>[0],
  previewLayer: GraphicsLayer,
) {
  const eventX = numberAttribute((event as { x?: unknown }).x);
  const eventY = numberAttribute((event as { y?: unknown }).y);

  if (eventX === null || eventY === null) {
    return null;
  }

  let nearestGraphic: Graphic | null = null;
  let nearestDistance = 38;

  previewLayer.graphics.forEach((graphic) => {
    if (graphic.attributes?.graphicRole !== "model-research-preview") {
      return;
    }

    const screenPoint = view.toScreen(graphic.geometry as never);

    if (
      !screenPoint ||
      typeof screenPoint.x !== "number" ||
      typeof screenPoint.y !== "number"
    ) {
      return;
    }

    const distance = Math.hypot(screenPoint.x - eventX, screenPoint.y - eventY);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestGraphic = graphic;
    }
  });

  return nearestGraphic;
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

function createDevelopmentHotspotSelectionContext(
  graphic: Graphic,
  relatedSchoolPressureNote: string | null = null,
): SelectedDevelopmentHotspotContext {
  const attributes = graphic.attributes ?? {};
  const contextKind =
    stringAttribute(attributes.contextKind) === "heatmap_cell"
      ? "heatmap_cell"
      : stringAttribute(attributes.contextKind) === "cluster"
      ? "cluster"
      : "individual";
  const representedParcelIds =
    stringAttribute(attributes.representedParcelIds)
      ?.split(",")
      .map((parcelId) => parcelId.trim())
      .filter(Boolean) ?? [];
  const segmentCounts: DevelopmentHotspotSegmentCounts = {
    administrativeOrUnknown:
      numberAttribute(attributes.segmentCountAdministrativeOrUnknown) ?? 0,
    commercialActivity:
      numberAttribute(attributes.segmentCountCommercialActivity) ?? 0,
    demolition: numberAttribute(attributes.segmentCountDemolition) ?? 0,
    industrialActivity:
      numberAttribute(attributes.segmentCountIndustrialActivity) ?? 0,
    institutionalActivity:
      numberAttribute(attributes.segmentCountInstitutionalActivity) ?? 0,
    minorMaintenance:
      numberAttribute(attributes.segmentCountMinorMaintenance) ?? 0,
    redevelopmentSignal:
      numberAttribute(attributes.segmentCountRedevelopmentSignal) ?? 0,
    residentialGrowth:
      numberAttribute(attributes.segmentCountResidentialGrowth) ?? 0,
  };
  const topDrivers = [
    stringAttribute(attributes.topDriver1),
    stringAttribute(attributes.topDriver2),
    stringAttribute(attributes.topDriver3),
  ].filter((driver): driver is string => Boolean(driver));

  return {
    activityClass: stringAttribute(attributes.activityClass),
    areaLabel:
      stringAttribute(attributes.areaLabel) ??
      stringAttribute(attributes.officialParcelId) ??
      "Selected development activity",
    caveat:
      stringAttribute(attributes.caveat) ??
      "Observed permit/development activity only. Not a prediction.",
    clusterId: stringAttribute(attributes.clusterId) ?? undefined,
    contextKind,
    developmentActivityScore: numberAttribute(
      attributes.developmentActivityScore,
    ),
    displayMode: getSafeDevelopmentHotspotDisplayMode(
      stringAttribute(attributes.displayMode),
      contextKind,
    ),
    dominantActivityType: stringAttribute(attributes.dominantActivityType),
    dominantPermitSegment: stringAttribute(attributes.dominantPermitSegment),
    highValuePermits: numberAttribute(attributes.highValuePermits) ?? 0,
    latestActivityLabel:
      stringAttribute(attributes.latestActivityLabel) ??
      "Recent activity context unavailable",
    majorValuePermits: numberAttribute(attributes.majorValuePermits) ?? 0,
    officialParcelId:
      stringAttribute(attributes.officialParcelId) ?? undefined,
    parcelsRepresented: numberAttribute(attributes.parcelsRepresented) ?? 1,
    pin14: stringAttribute(attributes.pin14),
    recentPermitCount1yr: numberAttribute(attributes.recentPermitCount1yr) ?? 0,
    recentPermitCount3yr: numberAttribute(attributes.recentPermitCount3yr) ?? 0,
    recordsRepresented: numberAttribute(attributes.recordsRepresented) ?? 1,
    relatedSchoolPressureNote,
    representedParcelIds,
    selectedPermitSegment: stringAttribute(attributes.selectedPermitSegment),
    segmentCounts,
    topDrivers,
    totalPermitCount: numberAttribute(attributes.totalPermitCount) ?? 0,
    whyHighlighted:
      stringAttribute(attributes.whyHighlighted) ??
      "This area is highlighted because observed permit/development activity is concentrated in the selected layer filters.",
    zoningJurisdictionName: stringAttribute(attributes.zoningJurisdictionName),
  };
}

function getRelatedSchoolPressureNote(
  hotspotGraphic: Graphic,
  schoolPressureLayer: GraphicsLayer | null,
) {
  if (!schoolPressureLayer?.visible || schoolPressureLayer.graphics.length === 0) {
    return null;
  }

  const point = pointCoordinatesFromGraphic(hotspotGraphic);

  if (!point) {
    return null;
  }

  const relatedGraphic = schoolPressureLayer.graphics
    .toArray()
    .find((graphic) => polygonGraphicContainsPoint(graphic, point));

  if (!relatedGraphic) {
    return null;
  }

  const attributes = relatedGraphic.attributes ?? {};
  const schoolName =
    stringAttribute(attributes.schoolName) ?? "a school attendance area";
  const level = stringAttribute(attributes.schoolLevel);
  const watchBand = stringAttribute(attributes.schoolPressureWatchBand);
  const utilizationPct = numberAttribute(attributes.utilizationPct);
  const utilizationLabel =
    typeof utilizationPct === "number"
      ? `${utilizationPct.toFixed(1)}% utilization context`
      : "utilization context not available";

  return `This permit activity is inside ${schoolName}${
    level ? ` (${formatSchoolLevelForMap(level)})` : ""
  } attendance area. Current context: ${
    watchBand ?? "review context available"
  }; ${utilizationLabel}.`;
}

function pointCoordinatesFromGraphic(graphic: Graphic) {
  const geometry = graphic.geometry as
    | {
        latitude?: number;
        longitude?: number;
        x?: number;
        y?: number;
      }
    | null;
  const longitude = geometry?.longitude ?? geometry?.x;
  const latitude = geometry?.latitude ?? geometry?.y;

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    return null;
  }

  return { latitude, longitude };
}

function polygonGraphicContainsPoint(
  graphic: Graphic,
  point: { latitude: number; longitude: number },
) {
  const geometry = graphic.geometry as { rings?: number[][][] } | null;
  return Boolean(
    geometry?.rings?.some((ring) =>
      pointInRing(point.longitude, point.latitude, ring),
    ),
  );
}

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const currentX = currentPoint?.[0];
    const currentY = currentPoint?.[1];
    const previousX = previousPoint?.[0];
    const previousY = previousPoint?.[1];

    if (
      typeof currentX !== "number" ||
      typeof currentY !== "number" ||
      typeof previousX !== "number" ||
      typeof previousY !== "number"
    ) {
      continue;
    }

    const intersects =
      currentY > latitude !== previousY > latitude &&
      longitude <
        ((previousX - currentX) * (latitude - currentY)) /
          (previousY - currentY || Number.EPSILON) +
          currentX;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function formatSchoolLevelForMap(level: string) {
  const normalized = level.toLowerCase();

  if (normalized.startsWith("elem")) {
    return "Elementary";
  }

  if (normalized.startsWith("mid")) {
    return "Middle";
  }

  if (normalized.startsWith("high")) {
    return "High";
  }

  return level;
}

function createModelResearchPreviewContext(
  graphic: Graphic,
): ModelResearchPreviewMarker {
  const attributes = graphic.attributes ?? {};
  const pointGeometry = graphic.geometry as {
    latitude?: number;
    longitude?: number;
    spatialReference?: { wkid?: number };
  } | null;
  const latitude =
    typeof pointGeometry?.latitude === "number"
      ? pointGeometry.latitude
      : numberAttribute(attributes.latitude) ?? 0;
  const longitude =
    typeof pointGeometry?.longitude === "number"
      ? pointGeometry.longitude
      : numberAttribute(attributes.longitude) ?? 0;
  const topDrivers = [
    stringAttribute(attributes.topDriver1),
    stringAttribute(attributes.topDriver2),
    stringAttribute(attributes.topDriver3),
  ].filter((driver): driver is string => Boolean(driver));
  const contextKind =
    stringAttribute(attributes.contextKind) === "heatmap_cell"
      ? "heatmap_cell"
      : stringAttribute(attributes.contextKind) === "cluster"
        ? "cluster"
        : "parcel_marker";

  return {
    approximateAreaLabel:
      stringAttribute(attributes.approximateAreaLabel) ?? undefined,
    bandCounts: {
      insufficient: numberAttribute(attributes.bandCountInsufficient) ?? 0,
      lower: numberAttribute(attributes.bandCountLower) ?? 0,
      moderate: numberAttribute(attributes.bandCountModerate) ?? 0,
      strong: numberAttribute(attributes.bandCountStrong) ?? 0,
      veryStrong: numberAttribute(attributes.bandCountVeryStrong) ?? 0,
    },
    caveat:
      stringAttribute(attributes.caveat) ??
      "Internal research preview only. Not an official parcel score.",
    clusterId: stringAttribute(attributes.clusterId) ?? undefined,
    centroid: {
      latitude,
      longitude,
      spatialReference: {
        wkid: pointGeometry?.spatialReference?.wkid ?? 4326,
      },
    },
    contextKind,
    dataQualityFlag:
      stringAttribute(attributes.dataQualityFlag) ??
      "research_preview_context_only",
    displayMode: getSafeModelResearchDisplayMode(
      stringAttribute(attributes.displayMode),
      contextKind,
    ),
    dominantResearchBand:
      stringAttribute(attributes.dominantResearchBand) ?? undefined,
    exactProbabilityAvailable: false,
    modelVersion:
      stringAttribute(attributes.modelVersion) ??
      "internal_model_research_preview",
    officialParcelId:
      stringAttribute(attributes.officialParcelId) ?? "Unknown parcel",
    productionReady: false,
    publicExposureAllowed: false,
    representativeSignalLabel:
      stringAttribute(attributes.representativeSignalLabel) ?? undefined,
    representedFeatureCount:
      numberAttribute(attributes.representedFeatureCount) ?? 1,
    researchRankBand:
      stringAttribute(attributes.researchRankBand) ?? "research_preview_band",
    researchSignalLabel:
      stringAttribute(attributes.researchSignalLabel) ?? "Research signal",
    selectedFeatureGroupSummary:
      stringAttribute(attributes.selectedFeatureGroupSummary) ?? undefined,
    topDriverSummary: stringAttribute(attributes.topDriverSummary) ?? undefined,
    topDrivers,
  };
}

function getSafeModelResearchDisplayMode(
  value: string | null,
  contextKind: ModelResearchPreviewMarker["contextKind"],
): ModelResearchMapDisplayMode {
  switch (value) {
    case "clustered_markers":
    case "countywide_heatmap":
    case "fine_local_clusters":
    case "intermediate_subclusters":
    case "off":
    case "parcel_detail":
      return value;
    default:
      if (contextKind === "heatmap_cell") {
        return "countywide_heatmap";
      }

      if (contextKind === "cluster") {
        return "intermediate_subclusters";
      }

      return "parcel_detail";
  }
}

function getSafeDevelopmentHotspotDisplayMode(
  value: string | null,
  contextKind: SelectedDevelopmentHotspotContext["contextKind"],
): DevelopmentHotspotMapDisplayMode {
  switch (value) {
    case "countywide_clusters":
    case "intermediate_clusters":
    case "fine_clusters":
    case "heatmap":
    case "individual_markers":
    case "off":
      return value;
    default:
      return contextKind === "heatmap_cell"
        ? "heatmap"
        : contextKind === "cluster"
        ? "intermediate_clusters"
        : "individual_markers";
  }
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
    observedGrowthPressureBand: stringAttribute(
      attributes.observedGrowthPressureBand,
    ),
    permitCountPrevious: numberAttribute(attributes.permitCountPrevious),
    permitCountRecent: numberAttribute(attributes.permitCountRecent),
    permitGrowthDelta: numberAttribute(attributes.permitGrowthDelta),
    pressureCaveats: arrayStringAttribute(attributes.caveats),
    pressureReasons: arrayStringAttribute(attributes.pressureReasons),
    recommendedFollowup: stringAttribute(attributes.recommendedFollowup),
    residentialPermitCountRecent: numberAttribute(
      attributes.residentialPermitCountRecent,
    ),
    schoolLevel: stringAttribute(attributes.schoolLevel),
    schoolName: stringAttribute(attributes.schoolName),
    schoolPressureWatchBand: stringAttribute(
      attributes.schoolPressureWatchBand,
    ),
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

function arrayStringAttribute(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
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

  return {
    color: [104, 216, 255, profile.iconOpacity],
    outline: {
      color: [255, 255, 255, profile.outlineOpacity],
      width: profile.outlineSize,
    },
    size: profile.iconSize,
    style: "circle",
    type: "simple-marker",
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
  return {
    color: [104, 216, 255, 0.18],
    outline: {
      color: [255, 218, 120, 0.98],
      width: 2.6,
    },
    type: "simple-fill",
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
    | DemoGeoJsonGeometry
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

function convertGeoJsonLineCoordinatesToArcGisPaths(
  geometry: DemoGeoJsonGeometry | null | undefined,
) {
  if (!geometry) {
    return [];
  }

  const lineCoordinates =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : null;

  if (!Array.isArray(lineCoordinates)) {
    return [];
  }

  return lineCoordinates
    .map(normalizeGeoJsonLine)
    .filter((line): line is number[][] => line.length >= 2);
}

function normalizeGeoJsonLine(line: unknown) {
  if (!Array.isArray(line)) {
    return [];
  }

  return line
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

function formatSceneViewCamera(view: SceneView) {
  const center = describeSceneViewCenter(view);
  const zoom =
    typeof view.zoom === "number" && Number.isFinite(view.zoom)
      ? view.zoom.toFixed(1)
      : "unknown";

  if (!center) {
    return `Scene camera center unavailable; zoom ${zoom}`;
  }

  const latitude =
    typeof center.latitude === "number" && Number.isFinite(center.latitude)
      ? center.latitude.toFixed(5)
      : "unknown";
  const longitude =
    typeof center.longitude === "number" && Number.isFinite(center.longitude)
      ? center.longitude.toFixed(5)
      : "unknown";

  return `Center ${latitude}, ${longitude}; zoom ${zoom}`;
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
