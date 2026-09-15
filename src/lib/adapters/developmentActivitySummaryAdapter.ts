import {
  developmentActivitySummary,
  formatDevelopmentCompact,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentActivitySummaryResponse } from "@/types/api";

export type DevelopmentPanelSource = "api" | "fallback" | "loading" | "static";
type DevelopmentActivitySummaryInput = Omit<DevelopmentActivitySummaryResponse, "active_parcel_count"> & { active_parcel_count: number | null };

export interface DevelopmentActivitySummaryViewModel {
  activeParcelCount: number | null;
  analysisPeriod: { endDate: string; startDate: string } | null;
  activityDateMax: string | null;
  activityDateMin: string | null;
  avgPermitAmount: number | null;
  byMonth: DevelopmentActivitySummaryResponse["by_month"];
  byYear: DevelopmentActivitySummaryResponse["by_year"];
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
    activeParcelCount: developmentActivitySummary.parcelSummary.parcels_with_permits,
    analysisPeriod: null,
    activityDateMax: developmentActivitySummary.dateRange.latest_permit_date,
    activityDateMin: developmentActivitySummary.dateRange.first_permit_date,
    avgPermitAmount: null,
    byMonth: [],
    byYear: [],
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

export function getUnavailableDevelopmentActivitySummary(): DevelopmentActivitySummaryViewModel {
  return {
    activeParcelCount: 0,
    analysisPeriod: null,
    activityDateMax: null,
    activityDateMin: null,
    avgPermitAmount: null,
    byMonth: [],
    byYear: [],
    errorMessage: null,
    isLoading: false,
    recentActivityParcels1Yr: 0,
    recentActivityParcels3Yr: 0,
    source: "fallback",
    totalPermitAmount: null,
    totalPermitAmountLabel: "--",
    totalPermits: 0,
  };
}

export function normalizeDevelopmentActivitySummary(
  response: DevelopmentActivitySummaryInput,
): Omit<DevelopmentActivitySummaryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || typeof response.total_permits !== "number") {
    throw new Error("Development activity summary API returned an invalid shape.");
  }

  return {
    activeParcelCount: response.active_parcel_count,
    analysisPeriod: response.analysis_period
      ? { endDate: response.analysis_period.end_date, startDate: response.analysis_period.start_date }
      : null,
    activityDateMax: response.date_range.activity_date_max,
    activityDateMin: response.date_range.activity_date_min,
    avgPermitAmount: response.avg_permit_amount,
    byMonth: response.by_month,
    byYear: response.by_year,
    recentActivityParcels1Yr: response.recent_activity.recent_1yr_parcels,
    recentActivityParcels3Yr: response.recent_activity.recent_3yr_parcels,
    totalPermitAmount: response.total_permit_amount,
    totalPermitAmountLabel: `$${formatDevelopmentCompact(
      response.total_permit_amount,
    )}`,
    totalPermits: response.total_permits,
  };
}
