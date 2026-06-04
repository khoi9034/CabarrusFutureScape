export type DevelopmentHotspotLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

export type DevelopmentHotspotActivityClass =
  | "high_activity"
  | "moderate_activity"
  | "very_high_activity"
  | string;

export type DevelopmentHotspotActivityClassFilter =
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

export interface DevelopmentHotspotControls {
  activityClass: DevelopmentHotspotActivityClassFilter;
  limit: DevelopmentHotspotLimit;
  recentWindow: DevelopmentHotspotRecentWindowFilter;
  sortBy: DevelopmentHotspotSortBy;
  zoningJurisdiction: string;
}

export const defaultDevelopmentHotspotControls: DevelopmentHotspotControls = {
  activityClass: "very_high_activity",
  limit: 100,
  recentWindow: "all",
  sortBy: "development_activity_score",
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
  centroid: DevelopmentHotspotMapCentroid;
  developmentActivityClass: DevelopmentHotspotActivityClass;
  developmentActivityScore: number | null;
  dominantZoningCodeRaw: string | null;
  officialParcelId: string;
  pin14: string | null;
  recentPermitCount1yr: number;
  recentPermitCount3yr: number;
  totalPermitCount: number;
  zoningJurisdictionName: string | null;
}

export interface DevelopmentHotspotLayerState {
  errorMessage: string | null;
  isLoading: boolean;
  markers: DevelopmentHotspotMapMarker[];
  source: "api" | "none";
  status: DevelopmentHotspotLayerStatus;
  totalCount: number;
}
