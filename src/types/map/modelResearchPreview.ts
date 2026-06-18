export type ModelResearchPreviewLayerStatus =
  | "empty"
  | "error"
  | "loading"
  | "off"
  | "ready"
  | "unavailable";

export interface ModelResearchPreviewCentroid {
  latitude: number;
  longitude: number;
  spatialReference?: {
    wkid?: number;
  } | null;
}

export interface ModelResearchPreviewMarker {
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
  centroid: ModelResearchPreviewCentroid;
  contextKind?: "cluster" | "heatmap_cell" | "parcel_marker";
  dataQualityFlag: string;
  displayMode?:
    | "clustered_markers"
    | "countywide_heatmap"
    | "fine_local_clusters"
    | "intermediate_subclusters"
    | "off"
    | "parcel_detail";
  dominantResearchBand?: string;
  exactProbabilityAvailable: false;
  modelVersion: string;
  officialParcelId: string;
  productionReady: false;
  publicExposureAllowed: false;
  representativeSignalLabel?: string;
  representedFeatureCount?: number;
  researchRankBand: string;
  researchSignalLabel: string;
  selectedFeatureGroupSummary?: string;
  topDriverSummary?: string;
  topDrivers: string[];
}

export interface ModelResearchPreviewLayerState {
  caveat: string;
  errorMessage: string | null;
  isLoading: boolean;
  markers: ModelResearchPreviewMarker[];
  source: "api" | "none";
  status: ModelResearchPreviewLayerStatus;
  totalCount: number;
}
