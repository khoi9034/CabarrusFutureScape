import {
  formatDevelopmentCount,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";
import type {
  ParcelPermitSegmentSummaryResponse,
  PermitSegmentStatisticsResponse,
} from "@/types/api";

export interface PermitSegmentSummaryMetric {
  id: string;
  label: string;
  value: number;
}

export interface PermitSegmentStatisticsViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  source: DevelopmentPanelSource;
  totalPermits: number;
  totalPermitsLabel: string;
  permitSegments: PermitSegmentSummaryMetric[];
  growthSignals: PermitSegmentSummaryMetric[];
  statusStages: PermitSegmentSummaryMetric[];
  valueClasses: PermitSegmentSummaryMetric[];
  developmentDomains: PermitSegmentSummaryMetric[];
}

export interface SelectedParcelPermitSegmentViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  source: DevelopmentPanelSource | "waiting";
  summary: ParcelPermitSegmentSummaryResponse | null;
}

export function emptyPermitSegmentStatistics(
  source: DevelopmentPanelSource,
): PermitSegmentStatisticsViewModel {
  return {
    developmentDomains: [],
    errorMessage: null,
    growthSignals: [],
    isLoading: source === "loading",
    permitSegments: [],
    source,
    statusStages: [],
    totalPermits: 0,
    totalPermitsLabel: "0",
    valueClasses: [],
  };
}

export function normalizePermitSegmentStatistics(
  response: PermitSegmentStatisticsResponse,
): Omit<PermitSegmentStatisticsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || typeof response.total_permits !== "number") {
    throw new Error("Permit segment statistics API returned an invalid shape.");
  }

  return {
    developmentDomains: response.by_development_domain.map(bucketToMetric),
    growthSignals: response.by_permit_growth_signal.map(bucketToMetric),
    permitSegments: response.by_permit_segment.map(bucketToMetric),
    statusStages: response.by_permit_status_stage.map(bucketToMetric),
    totalPermits: response.total_permits,
    totalPermitsLabel: formatDevelopmentCount(response.total_permits),
    valueClasses: response.by_permit_value_class.map(bucketToMetric),
  };
}

export function waitingSelectedParcelPermitSegment(): SelectedParcelPermitSegmentViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    source: "waiting",
    summary: null,
  };
}

export function unavailableSelectedParcelPermitSegment(
  source: DevelopmentPanelSource,
  errorMessage: string | null = null,
): SelectedParcelPermitSegmentViewModel {
  return {
    errorMessage,
    isLoading: source === "loading",
    source,
    summary: null,
  };
}

export function normalizeSelectedParcelPermitSegment(
  response: ParcelPermitSegmentSummaryResponse,
): ParcelPermitSegmentSummaryResponse {
  if (!response || typeof response.official_parcel_id !== "string") {
    throw new Error("Selected parcel permit segment API returned an invalid shape.");
  }

  return response;
}

export function segmentLabel(value: string | null | undefined) {
  return formatDevelopmentLabel(value);
}

function bucketToMetric(bucket: { count: number; value: string }) {
  return {
    id: bucket.value,
    label: formatDevelopmentLabel(bucket.value),
    value: bucket.count,
  };
}
