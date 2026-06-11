export type DevelopmentHotspotLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "needs_segment"
  | "off"
  | "ready"
  | "unavailable";

export type DevelopmentHotspotActivityClass =
  | "high_activity"
  | "moderate_activity"
  | "very_high_activity"
  | string;

export type DevelopmentHotspotActivityClassFilter =
  | "all"
  | "high_activity"
  | "moderate_activity"
  | "very_high_activity";

export type DevelopmentHotspotRecentWindowFilter = "1" | "3" | "all";

export type DevelopmentHotspotSortBy =
  | "development_activity_score"
  | "recent_permit_count_1yr"
  | "recent_permit_count_3yr"
  | "total_permit_count";

export type DevelopmentHotspotLimit = 25 | 50 | 100;

export type DevelopmentHotspotPermitSegmentFilter =
  | "administrative_or_unknown"
  | "all"
  | "commercial_activity"
  | "demolition"
  | "industrial_activity"
  | "institutional_activity"
  | "minor_maintenance"
  | "redevelopment_signal"
  | "residential_growth";

export type DevelopmentHotspotGrowthSignalFilter =
  | "all"
  | "major_growth"
  | "minor_activity"
  | "moderate_activity"
  | "redevelopment_signal";

export type DevelopmentHotspotStatusStageFilter =
  | "active_construction"
  | "all"
  | "completed"
  | "issued_or_starting";

export type DevelopmentHotspotValueClassFilter =
  | "all"
  | "high_value"
  | "major_value";

export interface DevelopmentHotspotControls {
  activityClass: DevelopmentHotspotActivityClassFilter;
  growthSignal: DevelopmentHotspotGrowthSignalFilter;
  limit: DevelopmentHotspotLimit;
  permitSegment: DevelopmentHotspotPermitSegmentFilter;
  recentWindow: DevelopmentHotspotRecentWindowFilter;
  sortBy: DevelopmentHotspotSortBy;
  statusStage: DevelopmentHotspotStatusStageFilter;
  valueClass: DevelopmentHotspotValueClassFilter;
  zoningJurisdiction: string;
}

export const defaultDevelopmentHotspotControls: DevelopmentHotspotControls = {
  activityClass: "all",
  growthSignal: "all",
  limit: 100,
  permitSegment: "all",
  recentWindow: "all",
  sortBy: "development_activity_score",
  statusStage: "all",
  valueClass: "all",
  zoningJurisdiction: "",
};

export interface DevelopmentHotspotMapCentroid {
  latitude: number;
  longitude: number;
  spatialReference?: {
    wkid?: number;
  } | null;
}

export interface DevelopmentHotspotMapMarker {
  activeConstructionPermits: number;
  commercialActivityPermits: number;
  centroid: DevelopmentHotspotMapCentroid;
  developmentActivityClass: DevelopmentHotspotActivityClass;
  developmentActivityScore: number | null;
  demolitionPermits: number;
  dominantZoningCodeRaw: string | null;
  dominantGrowthSignal: string | null;
  dominantPermitSegment: string | null;
  highValuePermits: number;
  industrialActivityPermits: number;
  institutionalActivityPermits: number;
  majorValuePermits: number;
  minorMaintenancePermits: number;
  officialParcelId: string;
  permitSignalScoreAvg: number | null;
  permitSignalScoreMax: number | null;
  pin14: string | null;
  recentPermitCount1yr: number;
  recentPermitCount3yr: number;
  redevelopmentSignalPermits: number;
  residentialGrowthPermits: number;
  totalPermitCount: number;
  zoningJurisdictionName: string | null;
}

export interface DevelopmentHotspotLayerState {
  errorMessage: string | null;
  isLoading: boolean;
  markers: DevelopmentHotspotMapMarker[];
  source: "api" | "none";
  status: DevelopmentHotspotLayerStatus;
  temporalContextLabel: string | null;
  totalCount: number;
}
