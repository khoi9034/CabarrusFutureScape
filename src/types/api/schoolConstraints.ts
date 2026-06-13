import type { ConstraintFilters } from "@/types/api/constraints";

export interface SchoolConstraintBucket {
  count: number;
  percentage: number | null;
  value: string;
}

export interface SchoolLevelAssignmentResponse {
  available_seats: number | null;
  capacity_status: string;
  has_assignment: boolean;
  match_confidence: string | null;
  overlap_area_acres: number | null;
  overlap_percent: number | null;
  school_name: string | null;
  school_name_normalized: string | null;
  utilization_percent: number | null;
  zone_id: string | null;
}

export interface SchoolConstraintDetailResponse {
  assignment_method: string | null;
  caveats: string[];
  data_quality_flags: string[];
  elementary: SchoolLevelAssignmentResponse;
  high: SchoolLevelAssignmentResponse;
  middle: SchoolLevelAssignmentResponse;
  objectid_1: number | null;
  official_parcel_id: string;
  pin14: string | null;
  recommended_action: string | null;
  school_assignment_confidence: string | null;
  school_assignment_review_required: boolean;
  school_capacity_data_available: boolean;
  school_capacity_review_required: boolean;
  school_capacity_score: number | null;
  school_constraint_class: string;
  school_constraint_score: number | null;
  school_summary_status: string | null;
}

export interface SchoolConstraintFilterResult {
  data_quality_flags: string[];
  elementary_school_name: string | null;
  has_elementary_assignment: boolean;
  has_high_assignment: boolean;
  has_middle_assignment: boolean;
  high_school_name: string | null;
  middle_school_name: string | null;
  official_parcel_id: string;
  pin14: string | null;
  recommended_action: string | null;
  school_assignment_confidence: string | null;
  school_assignment_review_required: boolean;
  school_capacity_data_available: boolean;
  school_constraint_class: string;
  school_summary_status: string | null;
}

export interface SchoolConstraintFilterResponse {
  filters_applied: ConstraintFilters;
  limit: number;
  offset: number;
  results: SchoolConstraintFilterResult[];
  total_count: number;
}

export interface SchoolConstraintStatisticsResponse {
  assignment_confidence_distribution: SchoolConstraintBucket[];
  assignment_review_required_parcels: number;
  capacity_data_available_parcels: number;
  capacity_not_available_parcels: number;
  caveats: string[];
  constraint_class_distribution: SchoolConstraintBucket[];
  elementary_assigned_parcels: number;
  filters_applied: ConstraintFilters;
  high_assigned_parcels: number;
  included_cfs_v1_zone_count: number;
  included_public_ccs_reference_count: number;
  middle_assigned_parcels: number;
  missing_elementary_assignment_parcels: number;
  missing_high_assignment_parcels: number;
  missing_middle_assignment_parcels: number;
  reference_exclusion_distribution: SchoolConstraintBucket[];
  safe_for_api_exposure: boolean;
  school_constraint_score_non_null_parcels: number;
  school_reference_count: number;
  school_zone_count: number;
  summary_status_distribution: SchoolConstraintBucket[];
  total_parcels: number;
  zone_level_distribution: SchoolConstraintBucket[];
}

export interface SchoolDistrictSummaryRow {
  capacity_data_available_count: number;
  capacity_status: string;
  match_confidence: string | null;
  parcel_count: number;
  review_required_count: number;
  school_level: string;
  school_name: string | null;
  school_name_normalized: string | null;
  zone_id: string | null;
}

export interface SchoolDistrictSummaryResponse {
  caveats: string[];
  districts: SchoolDistrictSummaryRow[];
  filters_applied: ConstraintFilters;
  total_rows: number;
}

export interface SchoolQaIssueResponse {
  detail: string;
  issue_type: string;
  parcel_count: number | null;
  recommended_action: string | null;
  school_level: string | null;
  school_name: string | null;
  severity: string;
}

export interface SchoolQaSummaryResponse {
  capacity_available: boolean;
  caveats: string[];
  duplicate_normalized_names: SchoolQaIssueResponse[];
  excluded_count_by_reason: SchoolConstraintBucket[];
  included_public_ccs_count: number;
  missing_elementary_assignment_count: number;
  missing_high_assignment_count: number;
  missing_middle_assignment_count: number;
  multi_zone_overlap_counts: Record<string, number>;
  parcel_assignment_count: number;
  parcels_assigned_to_unmatched_school_zones: number;
  safe_for_api_exposure: boolean;
  school_reference_count: number;
  school_zones_count_by_level: SchoolConstraintBucket[];
  unmatched_zone_names: SchoolQaIssueResponse[];
}

export interface SchoolUtilizationSeedResponse {
  match_confidence: string | null;
  matched_school_reference_id: string | null;
  needs_verification: boolean;
  school_level: string | null;
  school_name: string | null;
  school_name_normalized: string | null;
  school_year: string | null;
  source_confidence: string;
  utilization_class: string | null;
  utilization_pct: number | null;
}

export interface SchoolUtilizationSeedPageResponse {
  caveats: string[];
  filters_applied: ConstraintFilters;
  limit: number;
  offset: number;
  rows: SchoolUtilizationSeedResponse[];
  total_count: number;
}

export interface SchoolUtilizationZoneResponse
  extends SchoolUtilizationSeedResponse {
  geometry: {
    coordinates: unknown;
    type: "MultiPolygon" | "Polygon";
  } | null;
  school_system: string | null;
  source_layer: string | null;
  source_objectid: string | null;
  zone_id: string;
  zone_match_confidence: string | null;
}

export interface SchoolUtilizationZonePageResponse {
  caveats: string[];
  filters_applied: ConstraintFilters;
  limit: number;
  offset: number;
  total_count: number;
  zones: SchoolUtilizationZoneResponse[];
}

export interface ParcelSchoolUtilizationSeedLevelResponse {
  has_assignment: boolean;
  school_name: string | null;
  school_name_normalized: string | null;
  utilization_seed: SchoolUtilizationSeedResponse | null;
}

export interface ParcelSchoolUtilizationSeedResponse {
  caveats: string[];
  elementary: ParcelSchoolUtilizationSeedLevelResponse;
  final_capacity_scoring_enabled: boolean;
  high: ParcelSchoolUtilizationSeedLevelResponse;
  middle: ParcelSchoolUtilizationSeedLevelResponse;
  needs_verification: boolean;
  official_parcel_id: string;
  pin14: string | null;
  school_constraint_class: string;
  school_constraint_score: number | null;
  source_confidence: string;
}

export interface SchoolLeaPupilContextRow {
  grade_level: string;
  lea: string;
  lea_name: string | null;
  measure_type: string;
  month: string | null;
  notes: string | null;
  pupil_count: number | null;
  school_year: number;
  source_confidence: string;
  source_file: string | null;
}

export interface SchoolLeaPupilContextResponse {
  caveats: string[];
  district_level_only: boolean;
  filters_applied: ConstraintFilters;
  limit: number;
  offset: number;
  rows: SchoolLeaPupilContextRow[];
  school_capacity_scores_enabled: boolean;
  school_capacity_table_updated: boolean;
  total_count: number;
}

export interface SchoolLeaPupilMeasureTotal {
  measure_type: string;
  pupil_count: number | null;
}

export interface SchoolLeaPupilGradeValue {
  grade_level: string;
  pupil_count: number | null;
}

export interface SchoolLeaPupilContextSummaryResponse {
  caveats: string[];
  district_level_only: boolean;
  enrollment_by_grade: SchoolLeaPupilGradeValue[];
  lea: string | null;
  lea_name: string | null;
  school_capacity_scores_enabled: boolean;
  school_capacity_table_updated: boolean;
  school_year: number | null;
  source_confidence: string;
  total_rows: number;
  totals_by_measure: SchoolLeaPupilMeasureTotal[];
}
