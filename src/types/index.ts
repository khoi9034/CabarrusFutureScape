import type { MapOverlayViewMode } from "@/types/map/overlayViewModes";

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
  | "MapImageLayer";

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
  | "overview"
  | "workspace";

export type ParcelReviewView = "actions" | "report" | "review";

export type OverviewCommandMode =
  | "countywide"
  | "indicatorCenter"
  | "modelLab"
  | "parcel"
  | "snapshot";

export type OverviewPanelVisibility = "collapsed" | "hidden" | "visible";

export type OverviewCommandCenterState =
  | "compact"
  | "hidden"
  | "visible";

export type OverviewPanelWidthPreset = "compact" | "standard" | "wide";

export interface OverviewLayoutPreference {
  commandCenter: OverviewCommandCenterState;
  leftPanel: OverviewPanelVisibility;
  leftPanelWidth: OverviewPanelWidthPreset;
  rightPanel: Exclude<OverviewPanelVisibility, "collapsed">;
  rightPanelWidth: OverviewPanelWidthPreset;
}

export type ModelResearchOverlayDisplay =
  | "parcel_research_signal_preview"
  | "research_signal_hotspots"
  | "top_driver_context";

export type ModelResearchMapDisplayMode =
  | "clustered_markers"
  | "countywide_heatmap"
  | "fine_local_clusters"
  | "intermediate_subclusters"
  | "off"
  | "parcel_detail";

export interface ModelResearchMapSummary {
  displayMode: ModelResearchMapDisplayMode;
  displayModeLabel: string;
  dominantSignalLabel: string;
  overlayEnabled: boolean;
  totalFeatureCount: number;
  viewScaleLabel: string;
  visibleFeatureCount: number;
}

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

export type IndicatorCenterGroupId =
  | "data-gaps"
  | "development-activity"
  | "flood-review"
  | "model-research"
  | "school-context"
  | "utility-infrastructure";

export type IndicatorCenterDisplayMode =
  | "all"
  | "dataNeeded"
  | "highPriority"
  | "selectedGroup";

export type IndicatorCenterPriorityLabel =
  | "Context available"
  | "Data needed"
  | "High attention"
  | "Internal research only"
  | "Review needed"
  | "Context Available"
  | "Data Needed"
  | "High Attention"
  | "Internal Research Only"
  | "Not Scored"
  | "Preliminary Data"
  | "Proxy Only"
  | "Review Needed"
  | "Verified Source";

export interface PlanningSnapshotDevelopmentActivityContext {
  activityClass: string | null;
  areaLabel: string;
  caveat: string;
  contextKind: "cluster" | "heatmap_cell" | "individual";
  displayMode?: string;
  dominantActivityType: string | null;
  dominantPermitSegment: string | null;
  highValuePermits?: number;
  latestActivityLabel?: string;
  majorValuePermits?: number;
  officialParcelId?: string;
  parcelsRepresented: number;
  permitYearRange?: {
    end: number | null;
    label: string;
    start: number | null;
  };
  pin14?: string | null;
  recentPermitCount1yr?: number;
  recentPermitCount3yr?: number;
  recordsRepresented: number;
  selectedPermitSegment: string | null;
  segmentCounts?: {
    administrativeOrUnknown: number;
    commercialActivity: number;
    demolition: number;
    industrialActivity: number;
    institutionalActivity: number;
    minorMaintenance: number;
    redevelopmentSignal: number;
    residentialGrowth: number;
  };
  topDrivers: string[];
  totalPermitCount?: number;
  viewMode?: MapOverlayViewMode;
  viewModeLabel?: string;
  whyHighlighted: string;
  zoningJurisdictionName: string | null;
}

export interface IndicatorCenterContext {
  caveat: string;
  category: string;
  dataUsed: string[];
  groupId: IndicatorCenterGroupId;
  indicatorId: string;
  chartSupported?: boolean;
  metricKey?: string;
  name: string;
  officialDataNeeded?: boolean;
  priority?: IndicatorCenterPriorityLabel;
  priorityLabel: IndicatorCenterPriorityLabel;
  recommendedFollowUp: string;
  snapshotIncluded: boolean;
  source: string;
  status: string;
  title?: string;
  whatItMeans: string;
  mapSupported?: boolean;
}

export interface PlanningSnapshotIndicatorSummary {
  caveat: string;
  indicatorId: string;
  name: string;
  priorityLabel: IndicatorCenterPriorityLabel;
  status: string;
  value: string;
}

export interface PlanningSnapshotIndicatorCenterContext {
  availableGroups: string[];
  caveat: string;
  displayMode: IndicatorCenterDisplayMode;
  indicatorSummaries: PlanningSnapshotIndicatorSummary[];
  recommendedFollowUp: string;
  selectedIndicator: IndicatorCenterContext | null;
  selectedGroupIds: IndicatorCenterGroupId[];
}

export interface PlanningSnapshot {
  activeLayers: string[];
  activeLayerIds?: string[];
  caveats: string[];
  capturedSections?: string[];
  createdAt: string;
  dashboardImageAlt?: string;
  dashboardImageCapturedAt?: string | null;
  dashboardImageDataUrl?: string | null;
  dashboardImageFailureReason?: string | null;
  dashboardImageStatus?: "captured" | "failed" | "unavailable";
  explainableMetrics: PlanningSnapshotMetric[];
  focusMode?: PlanningReviewFocusMode;
  focusModeLabel?: string;
  hasDashboardImage?: boolean;
  hasMapImage?: boolean;
  includedSections: Record<PlanningSnapshotSectionKey, boolean>;
  keyFacts: Array<{ label: string; value: string }>;
  knownReviewFlags: Array<{ label: string; reason: string; status: string }>;
  mapContext: {
    cameraSummary?: string;
    description: string;
    extentCaptured: boolean;
    extentSummary?: string;
  };
  developmentActivityContext?: PlanningSnapshotDevelopmentActivityContext | null;
  indicatorCenterContext?: PlanningSnapshotIndicatorCenterContext | null;
  mapScreenshotCapturedAt?: string | null;
  mapScreenshotDataUrl?: string | null;
  mapScreenshotFailureReason?: string | null;
  mapScreenshotStatus?: "captured" | "failed" | "unavailable";
  modelLabContext?: {
    displayType?: ModelResearchOverlayDisplay;
    displayMode?: ModelResearchMapDisplayMode;
    displayModeLabel?: string;
    dominantSignalLabel?: string;
    overlayEnabled: boolean;
    viewMode?: MapOverlayViewMode;
    viewModeLabel?: string;
    visibleFeatureCount?: number;
    selectedResearchContext?: {
      approximateAreaLabel?: string;
      bandCounts?: {
        insufficient: number;
        lower: number;
        moderate: number;
        strong: number;
        veryStrong: number;
      };
      caveat: string;
      clusterId?: string;
      contextKind?: "cluster" | "heatmap_cell" | "parcel_marker";
      dataQualityFlag: string;
      displayMode?: ModelResearchMapDisplayMode;
      dominantResearchBand?: string;
      modelVersion: string;
      officialParcelId: string;
      representativeSignalLabel?: string;
      researchRankBand: string;
      researchSignalLabel: string;
      representedFeatureCount?: number;
      selectedFeatureGroupSummary?: string;
      topDriverSummary?: string;
      topDrivers: string[];
    } | null;
    status: string;
  };
  overviewCommandMode?: OverviewCommandMode;
  overviewKpis: Array<{ caveat?: string; label: string; value: string }>;
  selectedParcelId: string | null;
  selectedParcelSummary: PlanningSnapshotParcelSummary | null;
  snapshotId: string;
  snapshotTitle?: string;
  snapshotType?: "indicator_center" | "map";
  snapshotVersion:
    | "phase22a_v1"
    | "phase22b_v1"
    | "phase22e_v1"
    | "phase23b_v1"
    | "phase23c_v1"
    | "phase23d_v1"
    | "phase23g_v1"
    | "phase26a_v1"
    | "phase27b_v1"
    | "phase28a_v1"
    | "phase28b_v1"
    | "phase28c_v1"
    | "phase28d_v1"
    | "phase28e_v1"
    | "phase28f_v1"
    | "phase28g_v1"
    | "phase28h_v1"
    | "phase28i_v1"
    | "phase28k_v1";
  visualType?: "dashboard" | "map";
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
