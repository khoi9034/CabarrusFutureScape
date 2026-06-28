export type SchoolUtilizationLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

export type SchoolUtilizationLevel = "all" | "elementary" | "high" | "middle";
export type SchoolUtilizationZoneLevel = Exclude<SchoolUtilizationLevel, "all">;

export type SchoolUtilizationClass =
  | "approaching_capacity"
  | "near_capacity"
  | "over_capacity"
  | "severely_over_capacity"
  | "under_capacity";

export type SchoolUtilizationClassFilter =
  | "all"
  | SchoolUtilizationClass;

export interface SchoolUtilizationZoneControls {
  level: SchoolUtilizationLevel;
  limit: 25 | 50 | 100 | 500;
  utilizationClass: SchoolUtilizationClassFilter;
}

export const defaultSchoolUtilizationZoneControls: SchoolUtilizationZoneControls =
  {
    level: "all",
    limit: 500,
    utilizationClass: "all",
  };

export interface SchoolUtilizationZoneGeometry {
  coordinates: unknown;
  spatialReference: {
    wkid: number;
  };
  type: "MultiPolygon" | "Polygon";
}

export interface SchoolUtilizationZoneMapPolygon {
  geometry: SchoolUtilizationZoneGeometry;
  matchConfidence: string | null;
  matchedSchoolReferenceId: string | null;
  needsVerification: boolean;
  schoolLevel: SchoolUtilizationZoneLevel | null;
  schoolName: string | null;
  schoolNameNormalized: string | null;
  schoolSystem: string | null;
  schoolYear: string | null;
  sourceConfidence: string;
  sourceLayer: string | null;
  sourceObjectid: string | null;
  utilizationClass: SchoolUtilizationClass | null;
  utilizationPct: number | null;
  zoneId: string;
  zoneMatchConfidence: string | null;
}

export interface SelectedSchoolUtilizationZone {
  matchConfidence: string | null;
  matchedSchoolReferenceId: string | null;
  needsVerification: boolean;
  observedGrowthPressureBand?: string | null;
  permitCountPrevious?: number | null;
  permitCountRecent?: number | null;
  permitGrowthDelta?: number | null;
  pressureCaveats?: string[];
  pressureReasons?: string[];
  recommendedFollowup?: string | null;
  residentialPermitCountRecent?: number | null;
  schoolLevel: string | null;
  schoolName: string | null;
  schoolPressureWatchBand?: string | null;
  schoolYear: string | null;
  sourceConfidence: string | null;
  utilizationClass: string | null;
  utilizationPct: number | null;
  zoneId: string | null;
  zoneMatchConfidence: string | null;
}

export interface SchoolUtilizationClassCounts {
  approaching_capacity: number;
  near_capacity: number;
  over_capacity: number;
  severely_over_capacity: number;
  under_capacity: number;
}

export interface SchoolUtilizationZoneLayerState {
  caveats: string[];
  classCounts: SchoolUtilizationClassCounts;
  errorMessage: string | null;
  isLoading: boolean;
  polygons: SchoolUtilizationZoneMapPolygon[];
  source: "api" | "demo" | "none";
  status: SchoolUtilizationLayerStatus;
  totalCount: number;
}
