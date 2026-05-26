import { mockParcels } from "@/data/mock/parcelMockData";
import {
  createOperationalLayer as createRuntimeOperationalLayer,
  createOperationalLayers as createRuntimeOperationalLayers,
  setOperationalLayerVisibility as setRuntimeOperationalLayerVisibility,
  updateOperationalLayerOpacity as updateRuntimeOperationalLayerOpacity,
} from "@/lib/gis/layerFactory";
import {
  getOperationalLayerDefinitions as getRegistryOperationalLayerDefinitions,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";
import type { GisServiceAdapter } from "@/types/gisServices";

// Boundary for future live GIS services. Phase 1 keeps this adapter mock-only:
// definitions are local, parcel queries read mock data, and production service
// URLs stay disconnected until they are explicitly approved.
export const mockGisServiceAdapter: GisServiceAdapter = {
  async createOperationalLayer(runtime, definition) {
    return createRuntimeOperationalLayer(runtime, definition);
  },

  async createOperationalLayers(runtime, definitions = operationalLayerRegistry) {
    return createRuntimeOperationalLayers(runtime, definitions);
  },

  async getOperationalLayerDefinitions(options) {
    return getRegistryOperationalLayerDefinitions(options);
  },

  async identifyFeatures(request) {
    return {
      hits: [],
      request,
      source: "none",
    };
  },

  async loadOperationalLayers() {
    return operationalLayerRegistry;
  },

  async queryFeaturesByExtent() {
    return [];
  },

  async queryParcelById(parcelId) {
    return mockParcels.find((parcel) => parcel.parcelId === parcelId) ?? null;
  },

  async setOperationalLayerVisibility(layers, layerId, visible) {
    setRuntimeOperationalLayerVisibility(layers, layerId, visible);
  },

  async setLayerVisibility() {
    return undefined;
  },

  async updateOperationalLayerOpacity(layers, layerId, opacity) {
    updateRuntimeOperationalLayerOpacity(layers, layerId, opacity);
  },
};
