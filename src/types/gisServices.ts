import type { OperationalLayer, ParcelSummary } from "@/types";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import type {
  ArcGISOperationalLayer,
  OperationalLayerCreationResult,
  OperationalLayerInstanceMap,
} from "@/lib/gis/layerFactory";
import type {
  IdentifyQueryRequest,
  IdentifyQueryResult,
} from "@/types/mapInteractions";

export interface GisExtentQuery {
  xmax: number;
  xmin: number;
  ymax: number;
  ymin: number;
  spatialReferenceWkid: number;
}

export interface GisFeature {
  attributes: Record<string, unknown>;
  geometry: unknown;
  layerId: string;
}

export interface GisServiceAdapter {
  createOperationalLayer: (
    runtime: ArcGISRuntime,
    definition: OperationalLayer,
  ) => Promise<ArcGISOperationalLayer | null>;
  createOperationalLayers: (
    runtime: ArcGISRuntime,
    definitions?: OperationalLayer[],
  ) => Promise<OperationalLayerCreationResult>;
  getOperationalLayerDefinitions: (options?: {
    includeFuture?: boolean;
  }) => Promise<OperationalLayer[]>;
  identifyFeatures: (
    request: IdentifyQueryRequest,
  ) => Promise<IdentifyQueryResult>;
  loadOperationalLayers: () => Promise<OperationalLayer[]>;
  queryFeaturesByExtent: (extent: GisExtentQuery) => Promise<GisFeature[]>;
  queryParcelById: (parcelId: string) => Promise<ParcelSummary | null>;
  setOperationalLayerVisibility: (
    layers: OperationalLayerInstanceMap,
    layerId: string,
    visible: boolean,
  ) => Promise<void>;
  setLayerVisibility: (layerId: string, visible: boolean) => Promise<void>;
  updateOperationalLayerOpacity: (
    layers: OperationalLayerInstanceMap,
    layerId: string,
    opacity: number,
  ) => Promise<void>;
}
