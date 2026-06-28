import { apiGet, type ApiRequestOptions, type ApiQueryParams } from "@/lib/api/client";
import type {
  FloodConstraintDetailResponse,
  FloodConstraintFilterResponse,
  FloodConstraintStatisticsResponse,
  FloodConstraintSummaryResponse,
  FloodZonePageResponse,
  SchoolConstraintDetailResponse,
  SchoolConstraintFilterResponse,
  SchoolConstraintStatisticsResponse,
  SchoolDistrictSummaryResponse,
  SchoolLeaPupilContextResponse,
  SchoolLeaPupilContextSummaryResponse,
  SchoolQaSummaryResponse,
  SchoolUtilizationSeedPageResponse,
  SchoolUtilizationZonePageResponse,
  ParcelSchoolUtilizationSeedResponse,
} from "@/types/api";
import type { SchoolPressureResponse } from "@/types/map/schoolPressure";

export interface FloodConstraintFilterParams extends ApiQueryParams {
  buildability_impact?: string;
  dominant_flood_zone?: string;
  flood_review_required?: boolean;
  flood_severity_class?: string;
  floodplain_present?: boolean;
  floodway_present?: boolean;
  limit?: number;
  moderate_flood_present?: boolean;
  offset?: number;
  percent_constrained_max?: number;
  percent_constrained_min?: number;
  sfha_present?: boolean;
}

export type FloodConstraintStatisticsParams = Omit<
  FloodConstraintFilterParams,
  "limit" | "offset"
>;

export interface FloodZoneParams extends ApiQueryParams {
  extent?: string;
  flood_constraint_type?: string;
  flood_severity_class?: string;
  limit?: number;
  offset?: number;
}

export interface SchoolConstraintFilterParams extends ApiQueryParams {
  capacity_data_available?: boolean;
  elementary_school_name?: string;
  has_elementary_assignment?: boolean;
  has_high_assignment?: boolean;
  has_middle_assignment?: boolean;
  high_school_name?: string;
  limit?: number;
  middle_school_name?: string;
  offset?: number;
  recommended_action?: string;
  school_assignment_confidence?: string;
  school_assignment_review_required?: boolean;
  school_summary_status?: string;
}

export type SchoolConstraintStatisticsParams = Omit<
  SchoolConstraintFilterParams,
  "limit" | "offset"
>;

export interface SchoolDistrictSummaryParams extends ApiQueryParams {
  school_level?: "elementary" | "high" | "middle";
  school_name?: string;
}

export interface SchoolUtilizationSeedParams extends ApiQueryParams {
  limit?: number;
  offset?: number;
  school_level?: "elementary" | "high" | "middle";
  utilization_class?:
    | "approaching_capacity"
    | "near_capacity"
    | "over_capacity"
    | "severely_over_capacity"
    | "under_capacity";
}

export interface SchoolUtilizationZoneParams extends ApiQueryParams {
  level?: "all" | "elementary" | "high" | "middle";
  limit?: number;
  offset?: number;
  utilization_class?:
    | "approaching_capacity"
    | "near_capacity"
    | "over_capacity"
    | "severely_over_capacity"
    | "under_capacity";
}

export interface SchoolPressureParams extends ApiQueryParams {
  level?: "all" | "elementary" | "high" | "middle";
  limit?: number;
  offset?: number;
}

export interface SchoolLeaPupilContextParams extends ApiQueryParams {
  limit?: number;
  measure_type?: "ADA" | "ADM" | "Enrollment" | "MLD";
  offset?: number;
  school_year?: number;
}

export function getFloodStatistics(
  params: FloodConstraintStatisticsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<FloodConstraintStatisticsResponse>(
    "/constraints/flood/statistics",
    params,
    options,
  );
}

export function getParcelFloodConstraint(
  officialParcelId: string,
  options?: ApiRequestOptions,
) {
  return apiGet<FloodConstraintDetailResponse>(
    `/constraints/flood/${encodeURIComponent(officialParcelId)}`,
    undefined,
    options,
  );
}

export function filterFloodConstraints(
  params: FloodConstraintFilterParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<FloodConstraintFilterResponse>(
    "/constraints/flood/filter",
    params,
    options,
  );
}

export function getFloodHighReview(
  params: FloodConstraintFilterParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<FloodConstraintFilterResponse>(
    "/constraints/flood/high-review",
    params,
    options,
  );
}

export function getFloodSummary(
  params: FloodConstraintStatisticsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<FloodConstraintSummaryResponse>(
    "/constraints/flood/summary",
    params,
    options,
  );
}

export function getFloodZones(
  params: FloodZoneParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<FloodZonePageResponse>(
    "/constraints/flood/zones",
    params,
    options,
  );
}

export function getSchoolConstraintStatistics(
  params: SchoolConstraintStatisticsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolConstraintStatisticsResponse>(
    "/constraints/schools/statistics",
    params,
    options,
  );
}

export function getSchoolConstraintForParcel(
  officialParcelId: string,
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolConstraintDetailResponse>(
    `/constraints/schools/${encodeURIComponent(officialParcelId)}`,
    undefined,
    options,
  );
}

export function filterSchoolConstraints(
  params: SchoolConstraintFilterParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolConstraintFilterResponse>(
    "/constraints/schools/filter",
    params,
    options,
  );
}

export function getSchoolDistrictSummary(
  params: SchoolDistrictSummaryParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolDistrictSummaryResponse>(
    "/constraints/schools/district-summary",
    params,
    options,
  );
}

export function getSchoolConstraintQaSummary(options?: ApiRequestOptions) {
  return apiGet<SchoolQaSummaryResponse>(
    "/constraints/schools/qa-summary",
    undefined,
    options,
  );
}

export function getSchoolLeaPupilContext(
  params: SchoolLeaPupilContextParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolLeaPupilContextResponse>(
    "/constraints/schools/lea-pupil-context",
    params,
    options,
  );
}

export function getSchoolLeaPupilContextSummary(
  params: Pick<SchoolLeaPupilContextParams, "school_year"> = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolLeaPupilContextSummaryResponse>(
    "/constraints/schools/lea-pupil-context/summary",
    params,
    options,
  );
}

export function getSchoolUtilizationSeed(
  params: SchoolUtilizationSeedParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolUtilizationSeedPageResponse>(
    "/constraints/schools/utilization-seed",
    params,
    options,
  );
}

export function getSchoolUtilizationSeedForParcel(
  officialParcelId: string,
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelSchoolUtilizationSeedResponse>(
    `/constraints/schools/utilization-seed/${encodeURIComponent(officialParcelId)}`,
    undefined,
    options,
  );
}

export function getSchoolUtilizationZones(
  params: SchoolUtilizationZoneParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolUtilizationZonePageResponse>(
    "/constraints/schools/utilization-zones",
    params,
    options,
  );
}

export function getSchoolPressure(
  params: SchoolPressureParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<SchoolPressureResponse>(
    "/constraints/schools/pressure",
    params,
    options,
  );
}
