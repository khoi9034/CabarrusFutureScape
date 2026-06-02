import {
  zoningDistributionMetrics,
  type ZoningDistributionMetric,
} from "@/data/intelligence/parcelDashboardMetrics";
import type { ParcelZoningSummaryResponse } from "@/types/api";
import type { ParcelSummaryPanelSource } from "@/lib/adapters/parcelStatisticsAdapter";

export interface ParcelZoningDistributionViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  metrics: ZoningDistributionMetric[];
  source: ParcelSummaryPanelSource;
}

const zoningJurisdictionOrder = [
  "Concord",
  "Kannapolis",
  "Cabarrus County / Unincorporated",
  "Harrisburg",
  "Midland",
  "Mt. Pleasant",
  "Locust",
  "unknown",
];

const zoningJurisdictionLabels: Record<string, string> = {
  "Cabarrus County / Unincorporated": "Cabarrus County",
  unknown: "Unmatched",
};

const zoningJurisdictionAccents: Record<string, string> = {
  "Cabarrus County / Unincorporated": "#d8b86a",
  Concord: "#68d8ff",
  Harrisburg: "#55d38f",
  Kannapolis: "#f0cd79",
  Locust: "#c8a4ff",
  Midland: "#ffb454",
  "Mt. Pleasant": "#8fe7ff",
  unknown: "#ff8d7a",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sortJurisdictions(
  left: { zoning_jurisdiction_name: string },
  right: { zoning_jurisdiction_name: string },
) {
  const leftIndex = zoningJurisdictionOrder.indexOf(
    left.zoning_jurisdiction_name,
  );
  const rightIndex = zoningJurisdictionOrder.indexOf(
    right.zoning_jurisdiction_name,
  );

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  }

  return left.zoning_jurisdiction_name.localeCompare(
    right.zoning_jurisdiction_name,
  );
}

export function getStaticParcelZoningDistribution(): ParcelZoningDistributionViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    metrics: zoningDistributionMetrics,
    source: "static",
  };
}

export function normalizeParcelZoningSummaryForDistribution(
  summary: ParcelZoningSummaryResponse,
): Omit<ParcelZoningDistributionViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!summary || !Array.isArray(summary.jurisdiction_summary)) {
    throw new Error("Parcel zoning summary API returned an invalid shape.");
  }

  return {
    metrics: [...summary.jurisdiction_summary]
      .sort(sortJurisdictions)
      .map((record) => ({
        accent:
          zoningJurisdictionAccents[record.zoning_jurisdiction_name] ??
          "#68d8ff",
        id: slugify(record.zoning_jurisdiction_name),
        jurisdictionName: record.zoning_jurisdiction_name,
        label:
          zoningJurisdictionLabels[record.zoning_jurisdiction_name] ??
          record.zoning_jurisdiction_name,
        parcelCount: record.parcel_count,
        percentageOfTotal: record.percentage,
        reviewCount: record.review_count,
        safeCount: record.safe_for_dashboard_count,
      })),
  };
}
