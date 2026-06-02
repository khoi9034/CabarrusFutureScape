import {
  developmentAnnualTrend,
  developmentRecentMonthlyTrend,
  type DevelopmentTrendRecord,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentTrendsResponse } from "@/types/api";
import type { DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";

export interface DevelopmentTrendsViewModel {
  annualTrend: DevelopmentTrendRecord[];
  errorMessage: string | null;
  isLoading: boolean;
  monthlyTrend: DevelopmentTrendRecord[];
  source: DevelopmentPanelSource;
  trendDirection: string | null;
}

function mapTrendPoint(
  point: DevelopmentTrendsResponse["annual_trends"][number],
): DevelopmentTrendRecord {
  return {
    activity_month: point.month,
    activity_year: point.year,
    active_parcel_count: point.parcel_count ?? 0,
    active_zoning_jurisdiction_count: point.zoning_jurisdiction_name ? 1 : undefined,
    ambiguous_permit_count: 0,
    first_permit_date: null,
    latest_permit_date: null,
    permit_count: point.permit_count,
    relationship_permit_amount_total: point.total_permit_amount,
    source_permit_amount_total: point.total_permit_amount,
    unmatched_permit_count: 0,
  };
}

export function getStaticDevelopmentTrends(): DevelopmentTrendsViewModel {
  return {
    annualTrend: developmentAnnualTrend,
    errorMessage: null,
    isLoading: false,
    monthlyTrend: developmentRecentMonthlyTrend,
    source: "static",
    trendDirection: null,
  };
}

export function normalizeDevelopmentTrends(
  response: DevelopmentTrendsResponse,
): Omit<DevelopmentTrendsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !Array.isArray(response.annual_trends)) {
    throw new Error("Development trends API returned an invalid shape.");
  }

  return {
    annualTrend: response.annual_trends.map(mapTrendPoint),
    monthlyTrend: response.monthly_trends.map(mapTrendPoint),
    trendDirection: response.trend_direction,
  };
}
