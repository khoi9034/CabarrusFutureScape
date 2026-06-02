import {
  parcelQualityMetrics,
  type IntelligenceMetricTone,
  type ParcelQualityMetric,
} from "@/data/intelligence/parcelDashboardMetrics";
import type { ParcelStatisticsResponse } from "@/types/api";

export type ParcelSummaryPanelSource = "api" | "fallback" | "loading" | "static";

export interface ParcelQualityMetricsViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  metrics: ParcelQualityMetric[];
  source: ParcelSummaryPanelSource;
}

const qualityFallbackById = new Map(
  parcelQualityMetrics.map((metric) => [metric.id, metric]),
);

const qualityOrder = ["trusted", "review", "critical"];

const qualityLabels: Record<string, string> = {
  critical: "Critical Parcels",
  review: "Review Parcels",
  trusted: "Trusted Parcels",
};

const qualityDescriptions: Record<string, string> = {
  critical: "Parcels with critical quality flags in the enriched layer.",
  review: "Parcels with enrichment flags that need review.",
  trusted: "Parcels passing the current enriched quality model.",
};

const qualityAccents: Record<string, string> = {
  critical: "#ff8d7a",
  review: "#ffb454",
  trusted: "#55d38f",
};

const qualityTones: Record<string, IntelligenceMetricTone> = {
  critical: "critical",
  review: "watch",
  trusted: "positive",
};

const percentageOfTotal = (count: number, total: number) =>
  total > 0 ? (count / total) * 100 : 0;

export function getStaticParcelQualityMetrics(): ParcelQualityMetricsViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    metrics: parcelQualityMetrics,
    source: "static",
  };
}

export function normalizeParcelStatisticsForQuality(
  statistics: ParcelStatisticsResponse,
): Omit<ParcelQualityMetricsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!statistics || !Array.isArray(statistics.by_parcel_quality_status)) {
    throw new Error("Parcel statistics API returned an invalid quality shape.");
  }

  const countByStatus = new Map(
    statistics.by_parcel_quality_status.map((bucket) => [
      bucket.value,
      bucket.count,
    ]),
  );

  const ids = [
    ...qualityOrder,
    ...statistics.by_parcel_quality_status
      .map((bucket) => bucket.value)
      .filter((value) => !qualityOrder.includes(value)),
  ];

  return {
    metrics: ids.map((id) => {
      const fallbackMetric = qualityFallbackById.get(id);
      const count = countByStatus.get(id) ?? 0;

      return {
        accent: fallbackMetric?.accent ?? qualityAccents[id] ?? "#68d8ff",
        count,
        description:
          fallbackMetric?.description ??
          qualityDescriptions[id] ??
          "Parcel quality status from GET /parcels/statistics.",
        id,
        label: fallbackMetric?.label ?? qualityLabels[id] ?? id,
        percentage: percentageOfTotal(count, statistics.total_parcels),
        tone: fallbackMetric?.tone ?? qualityTones[id] ?? "neutral",
      };
    }),
  };
}
