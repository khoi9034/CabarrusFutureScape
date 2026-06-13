import type {
  ParcelSchoolUtilizationSeedLevelResponse,
  ParcelSchoolUtilizationSeedResponse,
  SchoolConstraintDetailResponse,
  SchoolLevelAssignmentResponse,
  SchoolUtilizationSeedResponse,
} from "@/types/api";

export type SchoolConstraintPanelSource =
  | "api"
  | "loading"
  | "unavailable"
  | "waiting";

export interface SchoolLevelAssignmentViewModel {
  capacityLabel: string;
  confidenceLabel: string;
  hasAssignment: boolean;
  levelLabel: string;
  overlapLabel: string;
  schoolName: string;
  utilizationLabel: string;
  utilizationMetaLabel: string;
}

export interface SchoolUtilizationSeedViewModel {
  classLabel: string;
  matchLabel: string;
  percentLabel: string;
  schoolYearLabel: string;
  sourceLabel: string;
}

export interface SelectedParcelSchoolConstraintViewModel {
  assignments: SchoolLevelAssignmentViewModel[];
  capacityMessage: string;
  constraintClassLabel: string;
  detail: SchoolConstraintDetailResponse | null;
  errorMessage: string | null;
  isLoading: boolean;
  recommendedActionLabel: string;
  scoreLabel: string;
  source: SchoolConstraintPanelSource;
  utilizationCaveat: string;
  utilizationDetail: ParcelSchoolUtilizationSeedResponse | null;
  utilizationErrorMessage: string | null;
}

export const schoolCapacityMissingMessage =
  "Capacity/enrollment data has not been added yet. This parcel is not scored for school capacity pressure.";

export const schoolAssignmentMethodMessage =
  "School assignment is based on attendance-zone polygon overlap.";

export const schoolMissingAssignmentMessage =
  "Assignment unavailable for one or more levels due to CCS-only V1 scope or QA review.";

export const schoolPresentationUtilizationMessage =
  "Utilization values are presentation-derived from SY 2024-2025 planning maps and require verification.";

export function getWaitingSelectedParcelSchoolConstraint(): SelectedParcelSchoolConstraintViewModel {
  return {
    assignments: [],
    capacityMessage: schoolCapacityMissingMessage,
    constraintClassLabel: "Not scored",
    detail: null,
    errorMessage: null,
    isLoading: false,
    recommendedActionLabel: "Capacity Data Needed",
    scoreLabel: "Not scored",
    source: "waiting",
    utilizationCaveat: schoolPresentationUtilizationMessage,
    utilizationDetail: null,
    utilizationErrorMessage: null,
  };
}

export function getUnavailableSelectedParcelSchoolConstraint(
  errorMessage: string | null = null,
): SelectedParcelSchoolConstraintViewModel {
  return {
    ...getWaitingSelectedParcelSchoolConstraint(),
    errorMessage,
    source: "unavailable",
  };
}

export function getLoadingSelectedParcelSchoolConstraint(): SelectedParcelSchoolConstraintViewModel {
  return {
    ...getWaitingSelectedParcelSchoolConstraint(),
    isLoading: true,
    source: "loading",
  };
}

export function normalizeSelectedParcelSchoolConstraint(
  response: SchoolConstraintDetailResponse,
  utilizationSeed?: ParcelSchoolUtilizationSeedResponse | null,
): Omit<
  SelectedParcelSchoolConstraintViewModel,
  "errorMessage" | "isLoading" | "source"
> {
  if (!response?.official_parcel_id || !response.elementary || !response.middle || !response.high) {
    throw new Error("School constraint API returned an invalid shape.");
  }

  return {
    assignments: [
      toLevelAssignmentViewModel(
        "Elementary",
        response.elementary,
        utilizationSeed?.elementary,
      ),
      toLevelAssignmentViewModel(
        "Middle",
        response.middle,
        utilizationSeed?.middle,
      ),
      toLevelAssignmentViewModel("High", response.high, utilizationSeed?.high),
    ],
    capacityMessage: response.school_capacity_data_available
      ? "Capacity data is available for this parcel assignment."
      : schoolCapacityMissingMessage,
    constraintClassLabel: formatSchoolLabel(response.school_constraint_class),
    detail: {
      ...response,
      caveats: Array.isArray(response.caveats) ? response.caveats : [],
      data_quality_flags: Array.isArray(response.data_quality_flags)
        ? response.data_quality_flags
        : [],
      school_constraint_score:
        typeof response.school_constraint_score === "number"
          ? response.school_constraint_score
          : null,
    },
    recommendedActionLabel: formatRecommendedAction(response.recommended_action),
    scoreLabel:
      typeof response.school_constraint_score === "number"
        ? response.school_constraint_score.toLocaleString("en-US", {
            maximumFractionDigits: 1,
          })
        : "Not scored",
    utilizationCaveat: schoolPresentationUtilizationMessage,
    utilizationDetail: utilizationSeed ?? null,
    utilizationErrorMessage: null,
  };
}

export function formatSchoolLabel(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  if (value === "not_available") {
    return "Capacity Data Needed";
  }

  if (value === "not_scored") {
    return "Not Scored";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatRecommendedAction(value: string | null | undefined) {
  if (!value || value === "capacity_data_needed") {
    return "Capacity Data Needed";
  }

  return formatSchoolLabel(value);
}

function toLevelAssignmentViewModel(
  levelLabel: string,
  assignment: SchoolLevelAssignmentResponse,
  utilizationLevel?: ParcelSchoolUtilizationSeedLevelResponse | null,
): SchoolLevelAssignmentViewModel {
  const utilization = utilizationLevel?.utilization_seed
    ? toUtilizationSeedViewModel(utilizationLevel.utilization_seed)
    : null;
  return {
    capacityLabel: formatSchoolLabel(assignment.capacity_status),
    confidenceLabel: formatSchoolLabel(assignment.match_confidence),
    hasAssignment: assignment.has_assignment,
    levelLabel,
    overlapLabel: formatOverlap(assignment.overlap_percent),
    schoolName: assignment.has_assignment
      ? (assignment.school_name ?? "Assigned school unavailable")
      : "Outside CCS V1 scope or assignment review needed",
    utilizationLabel: utilization
      ? `${utilization.percentLabel} (${utilization.classLabel})`
      : assignment.has_assignment
        ? "Presentation utilization not matched"
        : "No assignment for utilization lookup",
    utilizationMetaLabel: utilization
      ? `${utilization.sourceLabel} | ${utilization.schoolYearLabel} | ${utilization.matchLabel}`
      : "Capacity Data Needed / Not Scored",
  };
}

export function toUtilizationSeedViewModel(
  seed: SchoolUtilizationSeedResponse,
): SchoolUtilizationSeedViewModel {
  return {
    classLabel: formatPreliminaryUtilizationClass(seed.utilization_class),
    matchLabel: seed.match_confidence
      ? formatSchoolLabel(seed.match_confidence)
      : "Match review needed",
    percentLabel:
      typeof seed.utilization_pct === "number"
        ? `${seed.utilization_pct.toFixed(seed.utilization_pct % 1 === 0 ? 0 : 1)}% utilization`
        : "Utilization unavailable",
    schoolYearLabel: seed.school_year ? `SY ${seed.school_year}` : "School year unavailable",
    sourceLabel:
      seed.source_confidence === "presentation_derived" && seed.needs_verification
        ? "Presentation-derived, needs verification"
        : formatSchoolLabel(seed.source_confidence),
  };
}

export function formatPreliminaryUtilizationClass(value: string | null | undefined) {
  if (!value) {
    return "Preliminary utilization unavailable";
  }

  if (value === "under_capacity") {
    return "Preliminary lower utilization";
  }

  if (value === "approaching_capacity" || value === "near_capacity") {
    return "Preliminary approaching-capacity utilization";
  }

  if (value === "over_capacity") {
    return "Preliminary over-capacity utilization";
  }

  if (value === "severely_over_capacity") {
    return "Preliminary very high utilization";
  }

  return `Preliminary ${formatSchoolLabel(value)}`;
}

function formatOverlap(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Overlap unavailable";
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)}% overlap`;
}
