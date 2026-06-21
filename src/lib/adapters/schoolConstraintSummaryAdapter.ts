import type {
  SchoolConstraintStatisticsResponse,
  SchoolQaIssueResponse,
  SchoolQaSummaryResponse,
  SchoolUtilizationSeedPageResponse,
  SchoolUtilizationSeedResponse,
} from "@/types/api";
import {
  formatPreliminaryUtilizationClass,
  formatSchoolLabel,
} from "@/lib/adapters/selectedParcelSchoolConstraintAdapter";

export type SchoolConstraintSummarySource =
  | "api"
  | "loading"
  | "unavailable";

export interface SchoolConstraintSummaryMetric {
  accent: string;
  id: string;
  label: string;
  value: string;
}

export interface SchoolConfidenceBucketViewModel {
  label: string;
  value: string;
}

export interface SchoolUtilizationSeedBucketViewModel {
  label: string;
  value: string;
}

export interface SchoolUtilizationSeedReviewViewModel {
  label: string;
  matchLabel: string;
}

export interface SchoolUtilizationSeedDetailViewModel {
  matchStatus: string;
  matchedSchoolReferenceId: string | null;
  needsVerification: boolean;
  schoolLevel: string;
  schoolName: string;
  schoolYear: string;
  sourceConfidence: string;
  utilizationClass: string;
  utilizationClassLabel: string;
  utilizationPct: number | null;
  utilizationPctLabel: string;
}

export interface SchoolConstraintSummaryViewModel {
  capacityStatusLabel: string;
  confidenceDistribution: SchoolConfidenceBucketViewModel[];
  errorMessage: string | null;
  isLoading: boolean;
  knownReviewZones: string[];
  metrics: SchoolConstraintSummaryMetric[];
  presentationSeedCountLabel: string;
  source: SchoolConstraintSummarySource;
  totalParcels: number;
  utilizationSeedRows: SchoolUtilizationSeedDetailViewModel[];
  unmatchedPresentationSeedRows: SchoolUtilizationSeedReviewViewModel[];
  utilizationClassDistribution: SchoolUtilizationSeedBucketViewModel[];
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCount(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

export function getUnavailableSchoolConstraintSummary(
  errorMessage: string | null = null,
): SchoolConstraintSummaryViewModel {
  return {
    capacityStatusLabel: "Capacity Data Needed",
    confidenceDistribution: [],
    errorMessage,
    isLoading: false,
    knownReviewZones: [],
    metrics: [],
    presentationSeedCountLabel: "Unavailable",
    source: "unavailable",
    totalParcels: 0,
    utilizationSeedRows: [],
    unmatchedPresentationSeedRows: [],
    utilizationClassDistribution: [],
  };
}

export function getLoadingSchoolConstraintSummary(): SchoolConstraintSummaryViewModel {
  return {
    ...getUnavailableSchoolConstraintSummary(),
    errorMessage: null,
    isLoading: true,
    source: "loading",
  };
}

export function normalizeSchoolConstraintSummary(
  statistics: SchoolConstraintStatisticsResponse,
  qaSummary: SchoolQaSummaryResponse,
  utilizationSeed?: SchoolUtilizationSeedPageResponse | null,
): Omit<SchoolConstraintSummaryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!statistics || typeof statistics.total_parcels !== "number") {
    throw new Error("School statistics API returned an invalid shape.");
  }

  if (!qaSummary || typeof qaSummary.parcel_assignment_count !== "number") {
    throw new Error("School QA summary API returned an invalid shape.");
  }

  return {
    capacityStatusLabel: qaSummary.capacity_available
      ? "Capacity Data Available"
      : "Capacity Data Needed",
    confidenceDistribution: statistics.assignment_confidence_distribution.map(
      (bucket) => ({
        label: formatSchoolLabel(bucket.value),
        value: `${formatCount(bucket.count)}${
          typeof bucket.percentage === "number"
            ? ` (${bucket.percentage.toFixed(1)}%)`
            : ""
        }`,
      }),
    ),
    knownReviewZones: qaSummary.unmatched_zone_names
      .map(formatQaZoneName)
      .filter((value): value is string => Boolean(value)),
    metrics: [
      {
        accent: "#68d8ff",
        id: "total-parcels",
        label: "Total Parcels",
        value: formatCount(statistics.total_parcels),
      },
      {
        accent: "#55d38f",
        id: "elementary-assigned",
        label: "Elementary Assigned",
        value: formatCount(statistics.elementary_assigned_parcels),
      },
      {
        accent: "#d8b86a",
        id: "middle-assigned",
        label: "Middle Assigned",
        value: formatCount(statistics.middle_assigned_parcels),
      },
      {
        accent: "#c8a4ff",
        id: "high-assigned",
        label: "High Assigned",
        value: formatCount(statistics.high_assigned_parcels),
      },
      {
        accent: "#f0cd79",
        id: "assignment-review",
        label: "Assignment Review",
        value: formatCount(statistics.assignment_review_required_parcels),
      },
      {
        accent: "#8fe7ff",
        id: "capacity-status",
        label: "Capacity Status",
        value: qaSummary.capacity_available
          ? "Available"
          : "Capacity Data Needed",
      },
    ],
    presentationSeedCountLabel:
      utilizationSeed && typeof utilizationSeed.total_count === "number"
        ? formatCount(utilizationSeed.total_count)
        : "Unavailable",
    totalParcels: statistics.total_parcels,
    utilizationSeedRows: (utilizationSeed?.rows ?? []).map(
      toUtilizationSeedDetailViewModel,
    ),
    unmatchedPresentationSeedRows: (utilizationSeed?.rows ?? [])
      .filter((row) => row.match_confidence === "unmatched_reference_review")
      .map(toPresentationSeedReviewViewModel),
    utilizationClassDistribution: toUtilizationSeedDistribution(
      utilizationSeed?.rows ?? [],
    ),
  };
}

function formatQaZoneName(issue: SchoolQaIssueResponse) {
  if (!issue.school_name) {
    return null;
  }

  const level = issue.school_level ? formatSchoolLabel(issue.school_level) : null;
  return level ? `${issue.school_name} (${level})` : issue.school_name;
}

function toUtilizationSeedDistribution(
  rows: SchoolUtilizationSeedResponse[],
): SchoolUtilizationSeedBucketViewModel[] {
  const buckets = rows.reduce<Record<string, number>>((accumulator, row) => {
    const key = row.utilization_class ?? "review_required";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(buckets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({
      label: formatPreliminaryUtilizationClass(value),
      value: formatCount(count),
    }));
}

function toPresentationSeedReviewViewModel(
  row: SchoolUtilizationSeedResponse,
): SchoolUtilizationSeedReviewViewModel {
  const level = row.school_level ? formatSchoolLabel(row.school_level) : "Level unavailable";
  return {
    label: `${row.school_name ?? "Unnamed school"} (${level})`,
    matchLabel: row.match_confidence
      ? formatSchoolLabel(row.match_confidence)
      : "Reference review needed",
  };
}

function toUtilizationSeedDetailViewModel(
  row: SchoolUtilizationSeedResponse,
): SchoolUtilizationSeedDetailViewModel {
  const utilizationClass = row.utilization_class ?? "not_available";
  return {
    matchStatus: row.match_confidence
      ? formatSchoolLabel(row.match_confidence)
      : "Not available from current source",
    matchedSchoolReferenceId: row.matched_school_reference_id,
    needsVerification: row.needs_verification,
    schoolLevel: row.school_level
      ? formatSchoolLabel(row.school_level)
      : "Not available from current source",
    schoolName: row.school_name ?? "Unnamed school",
    schoolYear: row.school_year ?? "Not available from current source",
    sourceConfidence: row.source_confidence
      ? formatSchoolLabel(row.source_confidence)
      : "Not available from current source",
    utilizationClass,
    utilizationClassLabel: formatPreliminaryUtilizationClass(utilizationClass),
    utilizationPct: row.utilization_pct,
    utilizationPctLabel:
      typeof row.utilization_pct === "number"
        ? `${row.utilization_pct.toFixed(row.utilization_pct % 1 === 0 ? 0 : 1)}%`
        : "Utilization percent not available from current source",
  };
}
