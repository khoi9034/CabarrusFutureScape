import {
  developmentActivityClassMetrics,
  developmentCoreMetrics,
  formatDevelopmentCompact,
  formatDevelopmentCount,
  formatDevelopmentDate,
  type DevelopmentActivityClassMetric,
  type DevelopmentCoreMetric,
  type DevelopmentMetricTone,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentStatisticsResponse } from "@/types/api";
import type { DevelopmentActivitySummaryViewModel, DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";

export interface DevelopmentStatisticsViewModel {
  activityClasses: DevelopmentActivityClassMetric[];
  coreMetrics: DevelopmentCoreMetric[];
  errorMessage: string | null;
  isLoading: boolean;
  source: DevelopmentPanelSource;
}

const classLabels: Record<string, string> = {
  high_activity: "High Activity",
  low_activity: "Low Activity",
  moderate_activity: "Moderate Activity",
  no_activity: "No Activity",
  very_high_activity: "Very High Activity",
};

const classAccents: Record<string, string> = {
  high_activity: "#f0cd79",
  low_activity: "#68d8ff",
  moderate_activity: "#55d38f",
  no_activity: "#64748b",
  very_high_activity: "#ffb454",
};

const classTones: Record<string, DevelopmentMetricTone> = {
  high_activity: "watch",
  low_activity: "neutral",
  moderate_activity: "positive",
  no_activity: "neutral",
  very_high_activity: "review",
};

const fallbackClassMetricsById = new Map(
  developmentActivityClassMetrics.map((metric) => [metric.id, metric]),
);

const activityClassOrder = [
  "very_high_activity",
  "high_activity",
  "moderate_activity",
  "low_activity",
  "no_activity",
] as const;

const percentageOfTotal = (count: number, total: number) =>
  total > 0 ? (count / total) * 100 : 0;

export function getStaticDevelopmentStatistics(): DevelopmentStatisticsViewModel {
  return {
    activityClasses: developmentActivityClassMetrics,
    coreMetrics: developmentCoreMetrics,
    errorMessage: null,
    isLoading: false,
    source: "static",
  };
}

export function normalizeDevelopmentStatistics(
  statistics: DevelopmentStatisticsResponse,
  activitySummary?: DevelopmentActivitySummaryViewModel,
): Omit<DevelopmentStatisticsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!statistics || typeof statistics.total_permits !== "number") {
    throw new Error("Development statistics API returned an invalid shape.");
  }

  const totalParcels =
    statistics.parcels_with_activity + statistics.parcels_without_activity;
  const amountLabel =
    activitySummary?.totalPermitAmountLabel ??
    `$${formatDevelopmentCompact(activitySummary?.totalPermitAmount)}`;

  return {
    activityClasses: activityClassOrder.map((className) => {
      const count = statistics.activity_classes[className] ?? 0;
      const fallback = fallbackClassMetricsById.get(className);

      return {
        accent: fallback?.accent ?? classAccents[className] ?? "#68d8ff",
        ambiguousCount: fallback?.ambiguousCount ?? 0,
        className,
        count,
        id: className,
        label: fallback?.label ?? classLabels[className] ?? className,
        percentage: percentageOfTotal(count, totalParcels),
        score: fallback?.score ?? 0,
        tone: fallback?.tone ?? classTones[className] ?? "neutral",
      };
    }),
    coreMetrics: [
      {
        accent: "#68d8ff",
        description:
          "Distinct Real Property Permit records returned by GET /development/statistics.",
        id: "total-permits",
        label: "Total Permit Records",
        tone: "positive",
        value: formatDevelopmentCount(statistics.total_permits),
      },
      {
        accent: "#55d38f",
        description: "Parcels with at least one matched permit activity record.",
        id: "parcels-with-activity",
        label: "Parcels With Activity",
        tone: "positive",
        value: formatDevelopmentCount(statistics.parcels_with_activity),
      },
      {
        accent: "#94a3b8",
        description: "Parcels with no matched permit activity records.",
        id: "parcels-without-activity",
        label: "Parcels Without Activity",
        tone: "neutral",
        value: formatDevelopmentCount(statistics.parcels_without_activity),
      },
      {
        accent: "#f0cd79",
        description:
          "Parcels with permit activity within one year of the activity anchor.",
        id: "recent-one-year",
        label: "Recent 1-Year Parcels",
        tone: "watch",
        value: formatDevelopmentCount(statistics.recent_activity_parcels_1yr),
      },
      {
        accent: "#ffb454",
        description:
          "Parcels with permit activity within three years of the activity anchor.",
        id: "recent-three-year",
        label: "Recent 3-Year Parcels",
        tone: "watch",
        value: formatDevelopmentCount(statistics.recent_activity_parcels_3yr),
      },
      {
        accent: "#c8a4ff",
        description: "Permit activity date range returned by the backend.",
        id: "date-range",
        label: "Activity Date Range",
        tone: "neutral",
        value: `${formatDevelopmentDate(
          statistics.activity_date_min,
        )} to ${formatDevelopmentDate(statistics.activity_date_max)}`,
      },
      {
        accent: "#d8b86a",
        description: "Latest permit activity date used as the activity anchor.",
        id: "anchor-date",
        label: "Activity Anchor Date",
        tone: "neutral",
        value: formatDevelopmentDate(statistics.activity_date_max),
      },
      {
        accent: "#55d38f",
        description:
          "Total permit amount returned by GET /development/activity-summary.",
        id: "permit-amount",
        label: "Permit Amount Rollup",
        tone: "positive",
        value: amountLabel,
      },
    ],
  };
}
