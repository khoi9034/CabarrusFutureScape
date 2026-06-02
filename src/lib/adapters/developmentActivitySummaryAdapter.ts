import {
  developmentActivitySummary,
  formatDevelopmentCompact,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentActivitySummaryResponse } from "@/types/api";

export type DevelopmentPanelSource = "api" | "fallback" | "loading" | "static";

export interface DevelopmentActivitySummaryViewModel {
  activityDateMax: string | null;
  activityDateMin: string | null;
  avgPermitAmount: number | null;
  errorMessage: string | null;
  isLoading: boolean;
  recentActivityParcels1Yr: number;
  recentActivityParcels3Yr: number;
  source: DevelopmentPanelSource;
  totalPermitAmount: number | null;
  totalPermitAmountLabel: string;
  totalPermits: number;
}

export function getStaticDevelopmentActivitySummary(): DevelopmentActivitySummaryViewModel {
  const permitAmount =
    developmentActivitySummary.permitAmountSummary
      ?.relationship_row_permit_amount_total ?? null;

  return {
    activityDateMax: developmentActivitySummary.dateRange.latest_permit_date,
    activityDateMin: developmentActivitySummary.dateRange.first_permit_date,
    avgPermitAmount: null,
    errorMessage: null,
    isLoading: false,
    recentActivityParcels1Yr:
      developmentActivitySummary.parcelSummary.parcels_with_recent_1yr_activity,
    recentActivityParcels3Yr:
      developmentActivitySummary.parcelSummary.parcels_with_recent_3yr_activity,
    source: "static",
    totalPermitAmount: permitAmount,
    totalPermitAmountLabel: `$${formatDevelopmentCompact(permitAmount)}`,
    totalPermits: developmentActivitySummary.permitSummary.source_permit_count,
  };
}

export function normalizeDevelopmentActivitySummary(
  response: DevelopmentActivitySummaryResponse,
): Omit<DevelopmentActivitySummaryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || typeof response.total_permits !== "number") {
    throw new Error("Development activity summary API returned an invalid shape.");
  }

  return {
    activityDateMax: response.date_range.activity_date_max,
    activityDateMin: response.date_range.activity_date_min,
    avgPermitAmount: response.avg_permit_amount,
    recentActivityParcels1Yr: response.recent_activity.recent_1yr_parcels,
    recentActivityParcels3Yr: response.recent_activity.recent_3yr_parcels,
    totalPermitAmount: response.total_permit_amount,
    totalPermitAmountLabel: `$${formatDevelopmentCompact(
      response.total_permit_amount,
    )}`,
    totalPermits: response.total_permits,
  };
}
