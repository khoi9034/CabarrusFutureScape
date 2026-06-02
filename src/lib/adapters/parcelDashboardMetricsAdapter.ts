import type { MetricCard } from "@/types";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
  parcelCoreMetrics,
  parcelDashboardKpiMetric,
  parcelIntelligenceSummary,
  type IntelligenceMetricTone,
  type ParcelDashboardMetric,
} from "@/data/intelligence/parcelDashboardMetrics";
import type { ParcelStatisticsResponse } from "@/types/api";

export type ParcelDashboardMetricsSource = "api" | "fallback" | "loading" | "static";

export interface ParcelDashboardSummary {
  assignedParcels: number;
  generatedAt: string;
  noMatchParcels: number;
  reviewParcels: number;
  safeForDashboardParcels: number;
  sourceArtifacts: string[];
  totalParcels: number;
  zoningCoveragePercentage: number;
}

export interface ParcelDashboardMetricsViewModel {
  coreMetrics: ParcelDashboardMetric[];
  errorMessage: string | null;
  isLoading: boolean;
  kpiMetric: MetricCard;
  source: ParcelDashboardMetricsSource;
  summary: ParcelDashboardSummary;
}

const percentageOfTotal = (count: number, total: number) =>
  total > 0 ? (count / total) * 100 : 0;

const getMetricTone = (id: string): IntelligenceMetricTone => {
  switch (id) {
    case "high-confidence":
    case "safe-for-dashboard":
    case "zoned-parcels":
      return "positive";
    case "low-confidence":
      return "watch";
    case "multi-jurisdiction":
    case "review-parcels":
      return "review";
    case "no-match-parcels":
      return "critical";
    default:
      return "neutral";
  }
};

const metricAccents: Record<string, string> = {
  "high-confidence": "#55d38f",
  "low-confidence": "#f0cd79",
  "multi-jurisdiction": "#c8a4ff",
  "no-match-parcels": "#ff8d7a",
  "review-parcels": "#ffb454",
  "safe-for-dashboard": "#d8b86a",
  "total-parcels": "#68d8ff",
  "zoned-parcels": "#55d38f",
};

const metricDescriptions: Record<string, string> = {
  "high-confidence": "Dominant zoning overlap at or above the high threshold.",
  "low-confidence": "Dominant zoning overlap below the review threshold.",
  "multi-jurisdiction": "Parcels intersecting zoning from multiple jurisdictions.",
  "no-match-parcels": "Parcels still missing a zoning assignment.",
  "review-parcels": "Parcels carrying zoning governance review flags.",
  "safe-for-dashboard": "Zoning records classified as ready for dashboard use.",
  "total-parcels": "Total parcels in the enriched parcel intelligence layer.",
  "zoned-parcels": "Parcels assigned zoning by the multi-source overlay.",
};

const metricLabels: Record<string, string> = {
  "high-confidence": "High Confidence",
  "low-confidence": "Low Confidence",
  "multi-jurisdiction": "Multi Jurisdiction",
  "no-match-parcels": "No Match Parcels",
  "review-parcels": "Review Parcels",
  "safe-for-dashboard": "Safe For Dashboard",
  "total-parcels": "Total Parcels",
  "zoned-parcels": "Zoned Parcels",
};

function createCoreMetric(
  id: string,
  value: number,
  totalParcels: number,
): ParcelDashboardMetric {
  return {
    accent: metricAccents[id] ?? "#68d8ff",
    description:
      metricDescriptions[id] ??
      "Parcel intelligence metric from the CFS backend API.",
    id,
    label: metricLabels[id] ?? id,
    percentage: id === "total-parcels" ? 100 : percentageOfTotal(value, totalParcels),
    tone: getMetricTone(id),
    value,
  };
}

function createKpiMetric(summary: ParcelDashboardSummary) {
  return {
    ...parcelDashboardKpiMetric,
    delta: `${formatIntelligencePercentage(
      summary.zoningCoveragePercentage,
    )} zoned`,
    value: formatIntelligenceCount(summary.totalParcels),
  } satisfies MetricCard;
}

export function getStaticParcelDashboardMetrics(): ParcelDashboardMetricsViewModel {
  return {
    coreMetrics: parcelCoreMetrics,
    errorMessage: null,
    isLoading: false,
    kpiMetric: parcelDashboardKpiMetric,
    source: "static",
    summary: parcelIntelligenceSummary,
  };
}

export function normalizeParcelStatisticsForDashboard(
  statistics: ParcelStatisticsResponse,
): Omit<ParcelDashboardMetricsViewModel, "errorMessage" | "isLoading" | "source"> {
  const summary: ParcelDashboardSummary = {
    assignedParcels: statistics.zoned_parcels,
    generatedAt: new Date().toISOString(),
    noMatchParcels: statistics.no_match_parcels,
    reviewParcels: statistics.review_parcels,
    safeForDashboardParcels: statistics.safe_for_dashboard_parcels,
    sourceArtifacts: ["GET /parcels/statistics"],
    totalParcels: statistics.total_parcels,
    zoningCoveragePercentage: percentageOfTotal(
      statistics.zoned_parcels,
      statistics.total_parcels,
    ),
  };

  return {
    coreMetrics: [
      createCoreMetric("total-parcels", statistics.total_parcels, statistics.total_parcels),
      createCoreMetric("zoned-parcels", statistics.zoned_parcels, statistics.total_parcels),
      createCoreMetric(
        "safe-for-dashboard",
        statistics.safe_for_dashboard_parcels,
        statistics.total_parcels,
      ),
      createCoreMetric("review-parcels", statistics.review_parcels, statistics.total_parcels),
      createCoreMetric("no-match-parcels", statistics.no_match_parcels, statistics.total_parcels),
      createCoreMetric(
        "high-confidence",
        statistics.high_confidence_parcels,
        statistics.total_parcels,
      ),
      createCoreMetric(
        "low-confidence",
        statistics.low_confidence_parcels,
        statistics.total_parcels,
      ),
      createCoreMetric(
        "multi-jurisdiction",
        statistics.multi_jurisdiction_parcels,
        statistics.total_parcels,
      ),
    ],
    kpiMetric: createKpiMetric(summary),
    summary,
  };
}

