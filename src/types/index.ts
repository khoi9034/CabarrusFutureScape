export type RiskLevel = "Low" | "Moderate" | "Elevated" | "Severe";

export type LayerCategory =
  | "Base"
  | "Planning"
  | "Infrastructure"
  | "Risk"
  | "Intelligence";

export type OperationalLayerKind =
  | "FeatureLayer"
  | "GraphicsLayer"
  | "MapImageLayer"
  | "SceneLayer";

export type LayerKind = OperationalLayerKind;

export type ArcGISLayerType = OperationalLayerKind;

export type LayerSourceStatus = "disabled" | "live" | "mock" | "placeholder";

export type LayerSourceMode = LayerSourceStatus;

export type LayerRuntimeSource = "arcgis-service" | "custom-graphics";

export interface OperationalLayerFieldMetadata {
  alias?: string;
  display?: boolean;
  name: string;
  searchable?: boolean;
  type?: string;
}

export interface OperationalLayerPopupMetadata {
  description?: string;
  enabled: boolean;
  fieldNames?: string[];
  title?: string;
}

export interface OperationalLayerRendererMetadata {
  description?: string;
  field?: string;
  type:
    | "3d-object"
    | "class-breaks"
    | "custom"
    | "heatmap"
    | "simple"
    | "unique-value";
  visualVariables?: string[];
}

export type ScenarioId =
  | "baseline"
  | "accelerated-growth"
  | "infill-priority"
  | "infrastructure-first";

export type DashboardStatus = "idle" | "loading" | "online" | "degraded";

export type MapStatus = DashboardStatus;

export type ProductMode = "overview" | "due_diligence" | "executive_print";

export type ParcelSelectionSource = "dashboard" | "map" | "url";

export interface OperationalLayer {
  id: string;
  title: string;
  category: LayerCategory;
  description: string;
  kind: LayerKind;
  defaultVisible: boolean;
  visibility: boolean;
  sourceStatus: LayerSourceStatus;
  accent: string;
  opacity: number;
  fields?: OperationalLayerFieldMetadata[];
  serviceUrl?: string;
  popup?: OperationalLayerPopupMetadata;
  renderer?: OperationalLayerRendererMetadata;
  layerType?: ArcGISLayerType;
  futureSource?: string;
  runtimeSource?: LayerRuntimeSource;
}

export type LayerDefinition = OperationalLayer;

export interface ParcelGeometry {
  rings: number[][][];
  spatialReference: {
    wkid: number;
  };
  centroid: [number, number];
}

export interface ParcelSummary {
  parcelId: string;
  address: string;
  ownerType: "Private" | "Municipal" | "Institutional" | "Commercial";
  zoning: string;
  acreage: number;
  assessedValue: number;
  floodRisk: RiskLevel;
  opportunityScore: number;
  developmentPressure: number;
  infrastructureReadiness: number;
  taxOpportunity: number;
  nearbyPermits: number;
  redevelopmentPotential: number;
  geometry: ParcelGeometry;
}

export type ParcelIntelligence = ParcelSummary;

export interface MetricCard {
  id: string;
  label: string;
  value: string;
  delta: string;
  status: "positive" | "watch" | "critical" | "neutral";
  accent: string;
  icon: "growth" | "parcels" | "infrastructure" | "revenue" | "risk";
  trend: number[];
}

export type KPIMetric = MetricCard;

export interface ScenarioHorizon {
  id: ScenarioId;
  name: string;
  label: string;
  description: string;
  pressureMultiplier: number;
  infrastructureWeight: number;
}

export type ScenarioPreset = ScenarioHorizon;
