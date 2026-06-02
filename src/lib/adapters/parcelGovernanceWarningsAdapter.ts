import {
  governanceWarningMetrics,
  type GovernanceWarningMetric,
  type IntelligenceMetricTone,
} from "@/data/intelligence/parcelDashboardMetrics";
import type { ParcelGovernanceWarningResponse } from "@/types/api";
import type { ParcelSummaryPanelSource } from "@/lib/adapters/parcelStatisticsAdapter";

export interface ParcelGovernanceWarningsViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  metrics: GovernanceWarningMetric[];
  source: ParcelSummaryPanelSource;
}

const warningFallbackById = new Map(
  governanceWarningMetrics.map((metric) => [metric.id, metric]),
);

const warningOrder = [
  "jurisdiction_code_semantics_review",
  "review_sliver_overlap",
  "review_multi_jurisdiction",
  "review_low_confidence",
  "review_near_tie",
  "no_zoning_match",
];

const warningLabels: Record<string, string> = {
  jurisdiction_code_semantics_review: "Jurisdiction Code Semantics",
  no_zoning_match: "No Zoning Match",
  review_low_confidence: "Low Confidence Review",
  review_multi_jurisdiction: "Multi Jurisdiction Review",
  review_near_tie: "Near Tie Review",
  review_sliver_overlap: "Sliver Overlap Review",
};

const warningDescriptions: Record<string, string> = {
  jurisdiction_code_semantics_review:
    "Municipal zoning codes need local semantic review before equivalency.",
  no_zoning_match:
    "No zoning polygon intersected the parcel in the current overlay.",
  review_low_confidence:
    "Dominant zoning coverage is below the confidence threshold.",
  review_multi_jurisdiction:
    "Parcel intersects zoning from more than one jurisdiction.",
  review_near_tie:
    "Two zoning candidates have nearly equal overlap shares.",
  review_sliver_overlap:
    "Small edge overlaps need review before operational decisions.",
};

const warningAccents: Record<string, string> = {
  jurisdiction_code_semantics_review: "#c8a4ff",
  no_zoning_match: "#ff8d7a",
  review_low_confidence: "#f0cd79",
  review_multi_jurisdiction: "#ffb454",
  review_near_tie: "#68d8ff",
  review_sliver_overlap: "#d8b86a",
};

function getWarningTone(warningCategory: string): IntelligenceMetricTone {
  return warningCategory === "no_zoning_match" ? "critical" : "review";
}

function sortWarnings(
  left: { warning_category: string },
  right: { warning_category: string },
) {
  const leftIndex = warningOrder.indexOf(left.warning_category);
  const rightIndex = warningOrder.indexOf(right.warning_category);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  }

  return left.warning_category.localeCompare(right.warning_category);
}

export function getStaticParcelGovernanceWarnings(): ParcelGovernanceWarningsViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    metrics: governanceWarningMetrics,
    source: "static",
  };
}

export function normalizeParcelGovernanceWarnings(
  response: ParcelGovernanceWarningResponse,
): Omit<ParcelGovernanceWarningsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !Array.isArray(response.warning_summary)) {
    throw new Error("Parcel governance warnings API returned an invalid shape.");
  }

  return {
    metrics: [...response.warning_summary].sort(sortWarnings).map((warning) => {
      const fallbackMetric = warningFallbackById.get(warning.warning_category);

      return {
        accent:
          fallbackMetric?.accent ??
          warningAccents[warning.warning_category] ??
          "#ffb454",
        count: warning.parcel_count,
        description:
          fallbackMetric?.description ??
          warningDescriptions[warning.warning_category] ??
          "Parcel requires governance review before production use.",
        id: warning.warning_category,
        label:
          fallbackMetric?.label ??
          warningLabels[warning.warning_category] ??
          warning.warning_category,
        percentage: warning.percentage,
        tone: fallbackMetric?.tone ?? getWarningTone(warning.warning_category),
      };
    }),
  };
}
