import type Graphic from "@arcgis/core/Graphic";
import type SceneView from "@arcgis/core/views/SceneView";
import { mockGisServiceAdapter } from "@/lib/gis/gisServiceAdapter";
import type { GisServiceAdapter } from "@/types/gisServices";
import type {
  EmptyMapClickBehavior,
  IdentifyQueryRequest,
  IdentifyQueryResult,
  MapClickEvent,
  MapHitTestResult,
  MapHoverEvent,
  MapPointSummary,
  MapScreenPoint,
  MapSelectionEvent,
} from "@/types/mapInteractions";

type SceneViewHitTestInput = Parameters<SceneView["hitTest"]>[0];
type SceneViewPointerLikeEvent = SceneViewHitTestInput & {
  mapPoint?: unknown;
  x?: number;
  y?: number;
};

interface MapInteractionControllerOptions {
  emptyClickBehavior?: EmptyMapClickBehavior;
  getActiveLayerIds?: () => string[];
  gisServiceAdapter?: GisServiceAdapter;
  onError?: (error: unknown) => void;
  onHover?: (event: MapHoverEvent) => void;
  onSelection?: (event: MapSelectionEvent) => void;
  view: SceneView;
}

export interface MapInteractionController {
  clearSelection: (reason?: string) => MapSelectionEvent;
  handleClick: (event: SceneViewPointerLikeEvent) => Promise<MapSelectionEvent>;
  handleHover: (event: SceneViewPointerLikeEvent) => MapHoverEvent | null;
  identify: (request: IdentifyQueryRequest) => Promise<IdentifyQueryResult>;
  runHitTest: (
    event: SceneViewPointerLikeEvent,
    clickEvent?: MapClickEvent,
  ) => Promise<IdentifyQueryResult>;
}

export function createMapInteractionController({
  emptyClickBehavior = "preserve-selection",
  getActiveLayerIds = () => [],
  gisServiceAdapter = mockGisServiceAdapter,
  onError,
  onHover,
  onSelection,
  view,
}: MapInteractionControllerOptions): MapInteractionController {
  async function handleClick(event: SceneViewPointerLikeEvent) {
    const clickEvent = createMapClickEvent(event, view);

    try {
      const identifyResult = await runHitTest(event, clickEvent);
      const selectionEvent = await resolveSelectionEvent(
        identifyResult,
        clickEvent,
        emptyClickBehavior,
        gisServiceAdapter,
      );

      onSelection?.(selectionEvent);
      return selectionEvent;
    } catch (error) {
      onError?.(error);
      throw error;
    }
  }

  function handleHover(event: SceneViewPointerLikeEvent) {
    if (!onHover) {
      return null;
    }

    const hoverEvent = createMapHoverEvent(event, view);
    onHover(hoverEvent);
    return hoverEvent;
  }

  async function runHitTest(
    event: SceneViewPointerLikeEvent,
    clickEvent = createMapClickEvent(event, view),
  ) {
    const response = await view.hitTest(event);
    const hits = response.results
      .map((result) => toMapHitTestResult(result))
      .filter((result): result is MapHitTestResult => Boolean(result));
    const primaryHit = hits.find((hit) => hit.parcelId) ?? hits[0];
    const request = createIdentifyQueryRequest({
      activeLayerIds: getActiveLayerIds(),
      clickEvent,
      primaryHit,
      source: "map-click",
    });

    if (primaryHit?.parcelId) {
      return {
        hits,
        primaryHit,
        primaryParcelId: primaryHit.parcelId,
        request,
        source: "mock-hit-test",
      } satisfies IdentifyQueryResult;
    }

    // Future live FeatureLayer/SceneLayer identify will plug in here through
    // the adapter. Phase 1 returns a mock-safe empty result because production
    // Cabarrus County services are intentionally disconnected.
    return identify(request);
  }

  async function identify(request: IdentifyQueryRequest) {
    return gisServiceAdapter.identifyFeatures(request);
  }

  function clearSelection(reason = "manual-clear") {
    const selectionEvent = {
      action: "clear",
      reason,
      source: "map",
      type: "selection",
    } satisfies MapSelectionEvent;

    onSelection?.(selectionEvent);
    return selectionEvent;
  }

  return {
    clearSelection,
    handleClick,
    handleHover,
    identify,
    runHitTest,
  };
}

async function resolveSelectionEvent(
  identifyResult: IdentifyQueryResult,
  clickEvent: MapClickEvent,
  emptyClickBehavior: EmptyMapClickBehavior,
  gisServiceAdapter: GisServiceAdapter,
): Promise<MapSelectionEvent> {
  const parcelId = identifyResult.primaryParcelId;

  if (parcelId) {
    // Today this validates against mock parcel data. Future real parcel lookup
    // should stay behind the adapter so the dashboard state API does not care
    // whether the parcel came from mock graphics or a service-backed identify.
    const parcel = await gisServiceAdapter.queryParcelById(parcelId);

    if (parcel) {
      return {
        action: "select",
        click: clickEvent,
        hit: identifyResult.primaryHit,
        parcelId: parcel.parcelId,
        source: "map",
        type: "selection",
      };
    }

    return {
      action: "preserve",
      click: clickEvent,
      hit: identifyResult.primaryHit,
      parcelId,
      reason: "parcel-id-not-found",
      source: "map",
      type: "selection",
    };
  }

  if (emptyClickBehavior === "clear-selection") {
    return {
      action: "clear",
      click: clickEvent,
      reason: "empty-map-click",
      source: "map",
      type: "selection",
    };
  }

  return {
    action: "preserve",
    click: clickEvent,
    reason: "empty-map-click",
    source: "map",
    type: "selection",
  };
}

function createMapClickEvent(
  event: SceneViewPointerLikeEvent,
  view: SceneView,
): MapClickEvent {
  return {
    mapPoint: getMapPointSummary(event.mapPoint ?? view.toMap(event)),
    screenPoint: getScreenPoint(event),
    timestamp: Date.now(),
    type: "click",
  };
}

function createMapHoverEvent(
  event: SceneViewPointerLikeEvent,
  view: SceneView,
): MapHoverEvent {
  return {
    mapPoint: getMapPointSummary(event.mapPoint ?? view.toMap(event)),
    screenPoint: getScreenPoint(event),
    timestamp: Date.now(),
    type: "hover",
  };
}

function createIdentifyQueryRequest({
  activeLayerIds,
  clickEvent,
  primaryHit,
  source,
}: {
  activeLayerIds: string[];
  clickEvent: MapClickEvent;
  primaryHit?: MapHitTestResult;
  source: IdentifyQueryRequest["source"];
}): IdentifyQueryRequest {
  return {
    activeLayerIds,
    candidateLayerIds: primaryHit?.layerId ? [primaryHit.layerId] : undefined,
    mapPoint: clickEvent.mapPoint,
    parcelId: primaryHit?.parcelId,
    screenPoint: clickEvent.screenPoint,
    source,
    timestamp: clickEvent.timestamp,
  };
}

function toMapHitTestResult(result: unknown): MapHitTestResult | null {
  if (!isGraphicHit(result)) {
    return null;
  }

  const attributes = toRecord(result.graphic.attributes);
  const layer = getGraphicLayerInfo(result.graphic);
  const mapPoint = getMapPointSummary(getUnknownProperty(result, "mapPoint"));

  return {
    attributes,
    graphicUid: getGraphicUid(result.graphic),
    layerId: layer.id,
    layerTitle: layer.title,
    mapPoint,
    parcelId: getStringAttribute(attributes, "parcelId"),
    source: layer.id ? "mock-graphics" : "unknown",
  };
}

function isGraphicHit(result: unknown): result is { graphic: Graphic } {
  if (!result || typeof result !== "object" || !("graphic" in result)) {
    return false;
  }

  const graphic = (result as { graphic?: unknown }).graphic;
  return Boolean(graphic && typeof graphic === "object");
}

function getGraphicLayerInfo(graphic: Graphic) {
  const layer = getUnknownProperty(graphic, "layer");

  if (!layer || typeof layer !== "object") {
    return {
      id: null,
      title: undefined,
    };
  }

  return {
    id: getStringProperty(layer, "id") ?? null,
    title: getStringProperty(layer, "title"),
  };
}

function getScreenPoint(event: SceneViewPointerLikeEvent): MapScreenPoint {
  return {
    x: typeof event.x === "number" ? event.x : 0,
    y: typeof event.y === "number" ? event.y : 0,
  };
}

function getMapPointSummary(point: unknown): MapPointSummary | undefined {
  if (!point || typeof point !== "object") {
    return undefined;
  }

  const spatialReference = getUnknownProperty(point, "spatialReference");
  const spatialReferenceWkid =
    spatialReference && typeof spatialReference === "object"
      ? getNumberProperty(spatialReference, "wkid")
      : undefined;

  return {
    latitude: getNumberProperty(point, "latitude"),
    longitude: getNumberProperty(point, "longitude"),
    spatialReferenceWkid,
    z: getNumberProperty(point, "z"),
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function getStringAttribute(
  attributes: Record<string, unknown>,
  key: string,
) {
  const value = attributes[key];
  return typeof value === "string" ? value : undefined;
}

function getGraphicUid(graphic: Graphic) {
  return (
    getStringProperty(graphic, "uid") ??
    getStringProperty(graphic, "id") ??
    undefined
  );
}

function getStringProperty(value: object, key: string) {
  const property = getUnknownProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function getNumberProperty(value: object, key: string) {
  const property = getUnknownProperty(value, key);
  return typeof property === "number" ? property : undefined;
}

function getUnknownProperty(value: object, key: string) {
  return (value as Record<string, unknown>)[key];
}
