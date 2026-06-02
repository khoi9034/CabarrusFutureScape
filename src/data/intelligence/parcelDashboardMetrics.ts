import type { MetricCard } from "@/types";
import parcelsEnrichedSummaryJson from "../../../cfs-data-pipelines/outputs/parcels_enriched_summary.json";
import zoningQaSummaryJson from "../../../cfs-data-pipelines/outputs/parcel_zoning_intelligence_qa_summary.json";

type CountSummary = {
  total_parcels: number;
  assigned_parcels: number;
  no_match_parcels: number;
  safe_for_dashboard_parcels: number;
  review_parcels: number;
  safe_for_dashboard_percentage: number;
  review_percentage: number;
  multi_jurisdiction_parcels: number;
  low_confidence_parcels: number;
  v1_assigned_parcels: number;
};

type ConfidenceRecord = {
  value: string;
  parcel_count: number;
  parcel_percentage: number;
};

type GovernanceWarningRecord = {
  warning_category: string;
  parcel_count: number;
  parcel_percentage: number;
};

type ZoningJurisdictionRecord = {
  zoning_jurisdiction_name: string;
  total_parcels: number;
  assigned_parcels: number;
  no_match_parcels: number;
  safe_for_dashboard_parcels: number;
  review_parcels: number;
  low_confidence_count: number;
  multi_jurisdiction_count: number;
};

type ParcelZoningQaSummary = {
  generated_at: string;
  count_summary: CountSummary;
  confidence_distribution: ConfidenceRecord[];
  governance_warning_category_distribution: GovernanceWarningRecord[];
  zoning_jurisdiction_distribution: ZoningJurisdictionRecord[];
};

type ParcelQualityRecord = {
  value: string;
  parcel_count: number;
  parcel_percentage: number;
};

type ParcelsEnrichedSummary = {
  generated_at: string;
  flagged_parcel_count: number;
  quality_distributions: {
    parcel_quality_status: ParcelQualityRecord[];
  };
  row_count_comparison: {
    enriched_row_count: number;
  };
};

export type IntelligenceMetricTone =
  | "critical"
  | "neutral"
  | "positive"
  | "review"
  | "watch";

export interface ParcelDashboardMetric {
  accent: string;
  description: string;
  id: string;
  label: string;
  percentage: number;
  tone: IntelligenceMetricTone;
  value: number;
}

export interface ZoningDistributionMetric {
  accent: string;
  id: string;
  jurisdictionName: string;
  label: string;
  parcelCount: number;
  percentageOfTotal: number;
  reviewCount: number;
  safeCount: number;
}

export interface GovernanceWarningMetric {
  accent: string;
  count: number;
  description: string;
  id: string;
  label: string;
  percentage: number;
  tone: IntelligenceMetricTone;
}

export interface ParcelQualityMetric {
  accent: string;
  count: number;
  description: string;
  id: string;
  label: string;
  percentage: number;
  tone: IntelligenceMetricTone;
}

const zoningQaSummary = zoningQaSummaryJson as ParcelZoningQaSummary;
const parcelsEnrichedSummary =
  parcelsEnrichedSummaryJson as ParcelsEnrichedSummary;

const countFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const countSummary = zoningQaSummary.count_summary;
const totalParcelCount =
  countSummary.total_parcels ||
  parcelsEnrichedSummary.row_count_comparison.enriched_row_count;

const confidenceByValue = new Map(
  zoningQaSummary.confidence_distribution.map((record) => [
    record.value,
    record,
  ]),
);

const warningByCategory = new Map(
  zoningQaSummary.governance_warning_category_distribution.map((record) => [
    record.warning_category,
    record,
  ]),
);

const parcelQualityByStatus = new Map(
  parcelsEnrichedSummary.quality_distributions.parcel_quality_status.map(
    (record) => [record.value, record],
  ),
);

const percentageOfTotal = (count: number) =>
  totalParcelCount > 0 ? (count / totalParcelCount) * 100 : 0;

export function formatIntelligenceCount(value: number) {
  return countFormatter.format(Math.round(value));
}

export function formatIntelligencePercentage(value: number) {
  return `${percentFormatter.format(value)}%`;
}

const interpolateTrend = (start: number, end: number, points = 7) =>
  Array.from({ length: points }, (_, index) =>
    Math.round(start + ((end - start) * index) / Math.max(points - 1, 1)),
  );

const v1CoveragePercentage = percentageOfTotal(
  countSummary.v1_assigned_parcels,
);
const zoningCoveragePercentage = percentageOfTotal(
  countSummary.assigned_parcels,
);

export const parcelDashboardKpiMetric = {
  id: "parcel-watch",
  label: "Total Parcels",
  value: formatIntelligenceCount(totalParcelCount),
  delta: `${formatIntelligencePercentage(zoningCoveragePercentage)} zoned`,
  status: "positive",
  accent: "#68d8ff",
  icon: "parcels",
  trend: interpolateTrend(v1CoveragePercentage, zoningCoveragePercentage),
} satisfies MetricCard;

const highConfidenceRecord = confidenceByValue.get("high");
const lowConfidenceRecord = confidenceByValue.get("low");

export const parcelCoreMetrics: ParcelDashboardMetric[] = [
  {
    id: "total-parcels",
    label: "Total Parcels",
    value: totalParcelCount,
    percentage: 100,
    tone: "neutral",
    accent: "#68d8ff",
    description: "Total parcels in the enriched parcel intelligence layer.",
  },
  {
    id: "zoned-parcels",
    label: "Zoned Parcels",
    value: countSummary.assigned_parcels,
    percentage: zoningCoveragePercentage,
    tone: "positive",
    accent: "#55d38f",
    description: "Parcels assigned zoning by the multi-source overlay.",
  },
  {
    id: "safe-for-dashboard",
    label: "Safe For Dashboard",
    value: countSummary.safe_for_dashboard_parcels,
    percentage: countSummary.safe_for_dashboard_percentage,
    tone: "positive",
    accent: "#d8b86a",
    description: "Zoning records classified as ready for dashboard use.",
  },
  {
    id: "review-parcels",
    label: "Review Parcels",
    value: countSummary.review_parcels,
    percentage: countSummary.review_percentage,
    tone: "review",
    accent: "#ffb454",
    description: "Parcels carrying zoning governance review flags.",
  },
  {
    id: "no-match-parcels",
    label: "No Match Parcels",
    value: countSummary.no_match_parcels,
    percentage: percentageOfTotal(countSummary.no_match_parcels),
    tone: "critical",
    accent: "#ff8d7a",
    description: "Parcels still missing a zoning assignment.",
  },
  {
    id: "high-confidence",
    label: "High Confidence",
    value: highConfidenceRecord?.parcel_count ?? 0,
    percentage: highConfidenceRecord?.parcel_percentage ?? 0,
    tone: "positive",
    accent: "#55d38f",
    description: "Dominant zoning overlap at or above the high threshold.",
  },
  {
    id: "low-confidence",
    label: "Low Confidence",
    value: lowConfidenceRecord?.parcel_count ?? 0,
    percentage: lowConfidenceRecord?.parcel_percentage ?? 0,
    tone: "watch",
    accent: "#f0cd79",
    description: "Dominant zoning overlap below the review threshold.",
  },
  {
    id: "multi-jurisdiction",
    label: "Multi Jurisdiction",
    value: countSummary.multi_jurisdiction_parcels,
    percentage: percentageOfTotal(countSummary.multi_jurisdiction_parcels),
    tone: "review",
    accent: "#c8a4ff",
    description: "Parcels intersecting zoning from multiple jurisdictions.",
  },
];

const zoningJurisdictionOrder = [
  "Concord",
  "Kannapolis",
  "Cabarrus County / Unincorporated",
  "Harrisburg",
  "Midland",
  "Mt. Pleasant",
  "Locust",
];

const zoningJurisdictionLabels: Record<string, string> = {
  "Cabarrus County / Unincorporated": "Cabarrus County",
};

const zoningJurisdictionAccents: Record<string, string> = {
  "Cabarrus County / Unincorporated": "#d8b86a",
  Concord: "#68d8ff",
  Harrisburg: "#55d38f",
  Kannapolis: "#f0cd79",
  Locust: "#c8a4ff",
  Midland: "#ffb454",
  "Mt. Pleasant": "#8fe7ff",
};

export const zoningDistributionMetrics: ZoningDistributionMetric[] =
  zoningJurisdictionOrder
    .map((jurisdictionName) =>
      zoningQaSummary.zoning_jurisdiction_distribution.find(
        (record) => record.zoning_jurisdiction_name === jurisdictionName,
      ),
    )
    .filter((record): record is ZoningJurisdictionRecord => Boolean(record))
    .map((record) => ({
      id: record.zoning_jurisdiction_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      jurisdictionName: record.zoning_jurisdiction_name,
      label:
        zoningJurisdictionLabels[record.zoning_jurisdiction_name] ??
        record.zoning_jurisdiction_name,
      parcelCount: record.total_parcels,
      percentageOfTotal: percentageOfTotal(record.total_parcels),
      safeCount: record.safe_for_dashboard_parcels,
      reviewCount: record.review_parcels,
      accent:
        zoningJurisdictionAccents[record.zoning_jurisdiction_name] ??
        "#68d8ff",
    }));

const governanceWarningLabels: Record<string, string> = {
  jurisdiction_code_semantics_review: "Jurisdiction Code Semantics",
  no_zoning_match: "No Zoning Match",
  review_low_confidence: "Low Confidence Review",
  review_multi_jurisdiction: "Multi Jurisdiction Review",
  review_near_tie: "Near Tie Review",
  review_sliver_overlap: "Sliver Overlap Review",
};

const governanceWarningDescriptions: Record<string, string> = {
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

const governanceWarningAccents: Record<string, string> = {
  jurisdiction_code_semantics_review: "#c8a4ff",
  no_zoning_match: "#ff8d7a",
  review_low_confidence: "#f0cd79",
  review_multi_jurisdiction: "#ffb454",
  review_near_tie: "#68d8ff",
  review_sliver_overlap: "#d8b86a",
};

const governanceWarningOrder = [
  "jurisdiction_code_semantics_review",
  "review_sliver_overlap",
  "review_multi_jurisdiction",
  "review_low_confidence",
  "review_near_tie",
  "no_zoning_match",
];

export const governanceWarningMetrics: GovernanceWarningMetric[] =
  governanceWarningOrder.map((warningCategory) => {
    const record = warningByCategory.get(warningCategory);
    return {
      id: warningCategory,
      label: governanceWarningLabels[warningCategory] ?? warningCategory,
      count: record?.parcel_count ?? 0,
      percentage: record?.parcel_percentage ?? 0,
      tone: warningCategory === "no_zoning_match" ? "critical" : "review",
      accent: governanceWarningAccents[warningCategory] ?? "#ffb454",
      description:
        governanceWarningDescriptions[warningCategory] ??
        "Parcel requires governance review before production use.",
    };
  });

const trustedQualityRecord = parcelQualityByStatus.get("trusted");
const reviewQualityRecord = parcelQualityByStatus.get("review");
const criticalQualityRecord = parcelQualityByStatus.get("critical");

export const parcelQualityMetrics: ParcelQualityMetric[] = [
  {
    id: "trusted",
    label: "Trusted Parcels",
    count: trustedQualityRecord?.parcel_count ?? 0,
    percentage: trustedQualityRecord?.parcel_percentage ?? 0,
    tone: "positive",
    accent: "#55d38f",
    description: "Parcels passing the current enriched quality model.",
  },
  {
    id: "review",
    label: "Review Parcels",
    count: reviewQualityRecord?.parcel_count ?? 0,
    percentage: reviewQualityRecord?.parcel_percentage ?? 0,
    tone: "watch",
    accent: "#ffb454",
    description: "Parcels with enrichment flags that need review.",
  },
  {
    id: "critical",
    label: "Critical Parcels",
    count: criticalQualityRecord?.parcel_count ?? 0,
    percentage: criticalQualityRecord?.parcel_percentage ?? 0,
    tone: "critical",
    accent: "#ff8d7a",
    description: "Critical parcel quality class is not emitted yet.",
  },
];

export const parcelIntelligenceSummary = {
  assignedParcels: countSummary.assigned_parcels,
  generatedAt: zoningQaSummary.generated_at,
  noMatchParcels: countSummary.no_match_parcels,
  reviewParcels: countSummary.review_parcels,
  safeForDashboardParcels: countSummary.safe_for_dashboard_parcels,
  sourceArtifacts: [
    "cfs-data-pipelines/outputs/parcel_zoning_intelligence_qa_summary.json",
    "cfs-data-pipelines/outputs/parcels_enriched_summary.json",
  ],
  totalParcels: totalParcelCount,
  zoningCoveragePercentage,
};
