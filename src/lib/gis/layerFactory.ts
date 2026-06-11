import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type { FeatureLayerProperties } from "@arcgis/core/layers/FeatureLayer";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Layer from "@arcgis/core/layers/Layer";
import type { LayerProperties } from "@arcgis/core/layers/Layer";
import type MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import type { MapImageLayerProperties } from "@arcgis/core/layers/MapImageLayer";
import type SceneLayer from "@arcgis/core/layers/SceneLayer";
import type { SceneLayerProperties } from "@arcgis/core/layers/SceneLayer";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import {
  hasValidServiceUrl,
  isLayerPlaceholder,
  isMockGraphicsLayerDefinition,
} from "@/lib/gis/layerRegistry";
import {
  createMockSceneLayers,
  type MockSceneLayerLookup,
  type MockSceneLayerMap,
} from "@/lib/gis/mockSceneLayers";
import type { OperationalLayer } from "@/types";

export type ArcGISOperationalLayer =
  | FeatureLayer
  | GraphicsLayer
  | MapImageLayer
  | SceneLayer;

export type OperationalLayerInstanceMap = Partial<
  Record<string, ArcGISOperationalLayer>
>;

export interface OperationalLayerCreationIssue {
  layerId: string;
  reason: string;
  sourceStatus: OperationalLayer["sourceStatus"];
}

export interface OperationalLayerCreationResult {
  issues: OperationalLayerCreationIssue[];
  layers: OperationalLayerInstanceMap;
}

interface CreateOperationalLayerOptions {
  mockLayers?: MockSceneLayerMap;
}

// Current Phase 1 workflow: mock registry definitions resolve to the existing
// GraphicsLayer scene graphics. Future live definitions will move through the
// service constructors below only after real URLs are explicitly enabled.
export function createOperationalLayers(
  runtime: ArcGISRuntime,
  definitions: OperationalLayer[],
): OperationalLayerCreationResult {
  const mockLayers = createMockSceneLayers(runtime);
  const issues: OperationalLayerCreationIssue[] = [];
  const layers: OperationalLayerInstanceMap = {};

  definitions.forEach((definition) => {
    const layer = createOperationalLayer(runtime, definition, { mockLayers });

    if (layer) {
      layers[definition.id] = layer;
      return;
    }

    if (isCustomGraphicsRuntimeLayer(definition)) {
      return;
    }

    const issue = {
      layerId: definition.id,
      reason: getSkippedLayerReason(definition),
      sourceStatus: definition.sourceStatus,
    };
    issues.push(issue);
    warnLayerReadiness(issue);
  });

  return { issues, layers };
}

export function createOperationalLayer(
  runtime: ArcGISRuntime,
  definition: OperationalLayer,
  options: CreateOperationalLayerOptions = {},
): ArcGISOperationalLayer | null {
  if (isMockGraphicsLayerDefinition(definition)) {
    return createMockGraphicsLayer(definition, options.mockLayers);
  }

  if (isLayerPlaceholder(definition)) {
    return null;
  }

  if (definition.sourceStatus !== "live" || !hasValidServiceUrl(definition)) {
    return null;
  }

  switch (definition.kind) {
    case "FeatureLayer":
      return new runtime.FeatureLayer(
        getFeatureLayerProperties(definition),
      ) as FeatureLayer;
    case "MapImageLayer":
      return new runtime.MapImageLayer(
        getMapImageLayerProperties(definition),
      ) as MapImageLayer;
    case "SceneLayer":
      return new runtime.SceneLayer(
        getSceneLayerProperties(definition),
      ) as SceneLayer;
    case "GraphicsLayer":
      return null;
    default:
      return null;
  }
}

export function applyOperationalLayerVisibility(
  layers: OperationalLayerInstanceMap,
  activeLayerIds: string[],
) {
  Object.entries(layers).forEach(([layerId, layer]) => {
    if (layer) {
      layer.visible = activeLayerIds.includes(layerId);
    }
  });
}

export function setOperationalLayerVisibility(
  layers: OperationalLayerInstanceMap,
  layerId: string,
  visible: boolean,
) {
  const layer = layers[layerId];

  if (!layer) {
    warnLayerReadiness({
      layerId,
      reason: "Layer visibility update skipped because the layer is not active in the SceneView runtime.",
      sourceStatus: "placeholder",
    });
    return;
  }

  layer.visible = visible;
}

export function updateOperationalLayerOpacity(
  layers: OperationalLayerInstanceMap,
  layerId: string,
  opacity: number,
) {
  const layer = layers[layerId];

  if (!layer) {
    warnLayerReadiness({
      layerId,
      reason: "Layer opacity update skipped because the layer is not active in the SceneView runtime.",
      sourceStatus: "placeholder",
    });
    return;
  }

  layer.opacity = clampOpacity(opacity);
}

export function getRenderableOperationalLayers(
  layers: OperationalLayerInstanceMap,
) {
  return Object.values(layers).filter(Boolean) as Layer[];
}

export function getMockGraphicsLayerSubset(
  layers: OperationalLayerInstanceMap,
  definitions: OperationalLayer[],
): MockSceneLayerLookup {
  return definitions.reduce<MockSceneLayerLookup>((mockLayerMap, definition) => {
    const layer = layers[definition.id];

    if (isMockGraphicsLayerDefinition(definition) && isGraphicsLayer(layer)) {
      mockLayerMap[definition.id] = layer;
    }

    return mockLayerMap;
  }, {});
}

function createMockGraphicsLayer(
  definition: OperationalLayer,
  mockLayers?: MockSceneLayerMap,
) {
  const layer = mockLayers?.[definition.id] ?? null;

  if (!layer) {
    return null;
  }

  applyCommonLayerProperties(layer, definition);
  return layer;
}

function getFeatureLayerProperties(
  definition: OperationalLayer & { serviceUrl: string },
): FeatureLayerProperties {
  return {
    ...getCommonLayerPropertiesObject(definition),
    outFields: definition.fields?.map((field) => field.name) ?? ["*"],
    popupEnabled: definition.popup?.enabled ?? false,
    popupTemplate: getPopupTemplate(definition),
    url: definition.serviceUrl,
  };
}

function getMapImageLayerProperties(
  definition: OperationalLayer & { serviceUrl: string },
): MapImageLayerProperties {
  return {
    ...getCommonLayerPropertiesObject(definition),
    url: definition.serviceUrl,
  };
}

function getSceneLayerProperties(
  definition: OperationalLayer & { serviceUrl: string },
): SceneLayerProperties {
  return {
    ...getCommonLayerPropertiesObject(definition),
    outFields: definition.fields?.map((field) => field.name) ?? ["*"],
    popupEnabled: definition.popup?.enabled ?? false,
    popupTemplate: getPopupTemplate(definition),
    url: definition.serviceUrl,
  };
}

function getCommonLayerPropertiesObject(
  definition: OperationalLayer,
): LayerProperties {
  return {
    id: definition.id,
    opacity: clampOpacity(definition.opacity),
    title: definition.title,
    visible: definition.visibility,
  };
}

function applyCommonLayerProperties(
  layer: ArcGISOperationalLayer,
  definition: OperationalLayer,
) {
  layer.id = definition.id;
  layer.opacity = clampOpacity(definition.opacity);
  layer.title = definition.title;
  layer.visible = definition.visibility;
}

function getPopupTemplate(definition: OperationalLayer) {
  if (!definition.popup?.enabled) {
    return undefined;
  }

  const fieldInfos = definition.popup.fieldNames?.map((fieldName) => ({
    fieldName,
    label:
      definition.fields?.find((field) => field.name === fieldName)?.alias ??
      fieldName,
  }));

  return {
    content: fieldInfos?.length
      ? [
          {
            fieldInfos,
            type: "fields",
          },
        ]
      : definition.popup.description ?? definition.description,
    title: definition.popup.title ?? definition.title,
  };
}

function isGraphicsLayer(
  layer: ArcGISOperationalLayer | undefined,
): layer is GraphicsLayer {
  return Boolean(layer && "graphics" in layer);
}

function isCustomGraphicsRuntimeLayer(definition: OperationalLayer) {
  return (
    definition.kind === "GraphicsLayer" &&
    definition.runtimeSource === "custom-graphics"
  );
}

function getSkippedLayerReason(definition: OperationalLayer) {
  if (isCustomGraphicsRuntimeLayer(definition)) {
    return "Custom graphics layer is managed directly by the SceneView integration.";
  }

  if (isLayerPlaceholder(definition)) {
    return "Layer definition is placeholder or disabled until an approved service URL is configured.";
  }

  if (definition.sourceStatus !== "live") {
    return "Layer definition is not marked live.";
  }

  if (!hasValidServiceUrl(definition)) {
    return "Layer definition is missing a valid HTTPS ArcGIS service URL.";
  }

  return "Layer type is not creatable in the current Phase 1 factory.";
}

function warnLayerReadiness(issue: OperationalLayerCreationIssue) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(`[CFS GIS] ${issue.layerId}: ${issue.reason}`);
}

function clampOpacity(opacity: number) {
  return Math.min(1, Math.max(0, opacity));
}
