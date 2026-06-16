export type RiskLevel = "Low" | "Moderate" | "Elevated" | "Severe";

export type LayerCategory =
  | "Base"
  | "Planning"
  | "Infrastructure"
  | "Risk"
  | "Schools"
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

export type ProductMode =
  | "due_diligence"
  | "executive_print"
  | "methodology"
  | "overview";

export type ParcelReviewView = "actions" | "report" | "review";

export type PlanningSnapshotView =
  | "actions"
  | "explain"
  | "overview"
  | "summary";

export type PlanningReviewFocusMode =
  | "constraints_risk"
  | "development_activity"
  | "infrastructure_readiness"
  | "parcel_lookup"
  | "planning_snapshot_report"
  | "school_community";

export type PlanningSnapshotSectionKey =
  | "data_needed_caveats"
  | "development_permits"
  | "fema_flood"
  | "map_view"
  | "model_governance"
  | "new_construction"
  | "parcel_facts"
  | "recommended_actions"
  | "schools"
  | "transportation"
  | "utility_proxy"
  | "zoning_planning";

export interface PlanningSnapshotMetric {
  caveat: string;
  label: string;
  meaning: string;
  method: string;
  recommendedAction?: string;
  source: string;
  value: string;
}

export interface PlanningSnapshotParcelSummary {
  acreageOrSize: string;
  address: string;
  assessedValue: string;
  marketValue: string;
  officialParcelId: string;
  ownerOrAccount: string;
  parcelQualityStatus: string;
  pin14: string;
  planningJurisdiction: string;
  zoning: string;
}

export interface PlanningSnapshot {
  activeLayers: string[];
  activeLayerIds?: string[];
  caveats: string[];
  createdAt: string;
  explainableMetrics: PlanningSnapshotMetric[];
  focusMode?: PlanningReviewFocusMode;
  focusModeLabel?: string;
  includedSections: Record<PlanningSnapshotSectionKey, boolean>;
  keyFacts: Array<{ label: string; value: string }>;
  knownReviewFlags: Array<{ label: string; reason: string; status: string }>;
  mapContext: {
    cameraSummary?: string;
    description: string;
    extentCaptured: boolean;
    extentSummary?: string;
  };
  mapScreenshotCapturedAt?: string | null;
  mapScreenshotDataUrl?: string | null;
  mapScreenshotFailureReason?: string | null;
  mapScreenshotStatus?: "captured" | "failed" | "unavailable";
  overviewKpis: Array<{ caveat?: string; label: string; value: string }>;
  selectedParcelId: string | null;
  selectedParcelSummary: PlanningSnapshotParcelSummary | null;
  snapshotId: string;
  snapshotVersion: "phase22a_v1" | "phase22b_v1" | "phase22e_v1";
}

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
