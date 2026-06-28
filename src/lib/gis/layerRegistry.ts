import {
  futureOperationalLayerPlaceholders,
  layerCategories,
  mockOperationalLayers,
} from "@/data/mock/layersMockData";
import type {
  ArcGISLayerType,
  LayerSourceStatus,
  OperationalLayer,
} from "@/types";

export const supportedArcGISLayerTypes: ArcGISLayerType[] = [
  "FeatureLayer",
  "GraphicsLayer",
  "MapImageLayer",
];

export const supportedLayerSourceStatuses: LayerSourceStatus[] = [
  "mock",
  "placeholder",
  "disabled",
  "live",
];

// Phase 1 dashboard layers remain mock GraphicsLayers. Future service-backed
// definitions live beside them so the integration path is ready without
// exposing disabled production services in the visible dashboard controls.
export const operationalLayerRegistry = mockOperationalLayers;

export const futureServiceLayerRegistry = futureOperationalLayerPlaceholders;

const legacyIntelligencePlaceholderLayerIds = new Set([
  "opportunity-extrusions",
  "development-pressure",
  "scenario-envelope",
]);

export const completeOperationalLayerRegistry = [
  ...operationalLayerRegistry,
  ...futureServiceLayerRegistry,
];

export { layerCategories };

interface OperationalLayerDefinitionOptions {
  includeFuture?: boolean;
}

export function getOperationalLayerDefinitions(
  options: OperationalLayerDefinitionOptions = {},
) {
  return options.includeFuture
    ? completeOperationalLayerRegistry
    : operationalLayerRegistry;
}

export function getDefaultLayerIds() {
  return operationalLayerRegistry
    .filter(
      (layer) =>
        layer.defaultVisible &&
        layer.visibility &&
        isLayerVisibilityControllable(layer),
    )
    .map((layer) => layer.id);
}

export function getLayerById(
  layerId: string,
  options: OperationalLayerDefinitionOptions = {},
) {
  return getOperationalLayerDefinitions(options).find(
    (layer) => layer.id === layerId,
  );
}

export function getMockLayerDefinitions() {
  return operationalLayerRegistry.filter(isMockGraphicsLayerDefinition);
}

export function getServiceLayerDefinitions() {
  return completeOperationalLayerRegistry.filter(isServiceBackedLayer);
}

export function isMockGraphicsLayerDefinition(layer: OperationalLayer) {
  return layer.sourceStatus === "mock" && layer.kind === "GraphicsLayer";
}

export function isServiceBackedLayer(
  layer: OperationalLayer,
): layer is OperationalLayer & { serviceUrl: string } {
  return layer.sourceStatus === "live" && hasValidServiceUrl(layer);
}

export function isLayerPlaceholder(layer: OperationalLayer) {
  return layer.sourceStatus === "placeholder" || layer.sourceStatus === "disabled";
}

export function isLayerVisibilityControllable(layer: OperationalLayer) {
  return !legacyIntelligencePlaceholderLayerIds.has(layer.id);
}

export function hasValidServiceUrl(
  layer: OperationalLayer,
): layer is OperationalLayer & { serviceUrl: string } {
  return Boolean(
    layer.serviceUrl &&
      /^https:\/\/.+\/(FeatureServer|MapServer|SceneServer)(\/\d+)?$/i.test(
        layer.serviceUrl,
      ),
  );
}
