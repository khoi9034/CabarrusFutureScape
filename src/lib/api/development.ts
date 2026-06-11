import { apiGet, type ApiRequestOptions, type ApiQueryParams } from "@/lib/api/client";
import type {
  DevelopmentActivitySummaryResponse,
  DevelopmentHotspotsResponse,
  DevelopmentLookupResponse,
  ParcelPermitSegmentSummaryResponse,
  PermitSegmentOptionsResponse,
  PermitSegmentStatisticsResponse,
  DevelopmentParcelPermitEventsResponse,
  DevelopmentStatisticsResponse,
  DevelopmentTemporalQueryResponse,
  DevelopmentTrendsResponse,
  DevelopmentZoningSummaryResponse,
} from "@/types/api";

export interface DevelopmentStatisticsParams extends ApiQueryParams {
  activity_class?: string;
  month?: number;
  permit_type?: string;
  work_type?: string;
  year?: number;
  zoning_category?: string;
  zoning_jurisdiction?: string;
}

export interface DevelopmentTrendsParams extends DevelopmentStatisticsParams {
  end_year?: number;
  group_by?: string;
  permit_status?: string;
  rolling_window?: 12 | 36;
  start_year?: number;
}

export interface DevelopmentHotspotsParams extends DevelopmentStatisticsParams {
  date_end?: string;
  date_start?: string;
  development_domain?: string;
  growth_signal?: string;
  limit?: number;
  offset?: number;
  official_parcel_id?: string;
  permit_segment?: string;
  permit_status_stage?: string;
  permit_value_class?: string;
  recent_window?: 1 | 3;
  rolling_window?: 12 | 36;
  sort_by?:
    | "development_activity_score"
    | "recent_permit_count_1yr"
    | "recent_permit_count_3yr"
    | "total_permit_amount"
    | "total_permit_count";
}

export interface DevelopmentZoningSummaryParams extends ApiQueryParams {
  limit?: number;
  month?: number;
  offset?: number;
  permit_status?: string;
  permit_type?: string;
  work_type?: string;
  year?: number;
  zoning_category?: string;
  zoning_code?: string;
  zoning_jurisdiction?: string;
}

export interface DevelopmentActivitySummaryParams extends DevelopmentStatisticsParams {
  date_end?: string;
  date_start?: string;
  permit_status?: string;
}

export interface DevelopmentTemporalQueryParams
  extends DevelopmentActivitySummaryParams {
  bbox?: string;
  include_geometry?: boolean;
  limit?: number;
  offset?: number;
  rolling_window?: 12 | 36;
}

export interface DevelopmentParcelPermitEventsParams extends ApiQueryParams {
  limit?: number;
  offset?: number;
  sort?: "latest_first" | "oldest_first";
}

export function getDevelopmentStatistics(
  params: DevelopmentStatisticsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentStatisticsResponse>(
    "/development/statistics",
    params,
    options,
  );
}

export function getDevelopmentTrends(
  params: DevelopmentTrendsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentTrendsResponse>(
    "/development/trends",
    params,
    options,
  );
}

export function getDevelopmentHotspots(
  params: DevelopmentHotspotsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentHotspotsResponse>(
    "/development/hotspots",
    params,
    options,
  );
}

export function getDevelopmentZoningSummary(
  params: DevelopmentZoningSummaryParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentZoningSummaryResponse>(
    "/development/zoning-summary",
    params,
    options,
  );
}

export function getDevelopmentActivitySummary(
  params: DevelopmentActivitySummaryParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentActivitySummaryResponse>(
    "/development/activity-summary",
    params,
    options,
  );
}

export function getDevelopmentTemporalQuery(
  params: DevelopmentTemporalQueryParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentTemporalQueryResponse>(
    "/development/temporal-query",
    params,
    options,
  );
}

export function getDevelopmentParcelPermits(
  officialParcelId: string,
  params: DevelopmentParcelPermitEventsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<DevelopmentParcelPermitEventsResponse>(
    `/development/parcel/${encodeURIComponent(officialParcelId)}/permits`,
    params,
    options,
  );
}

export function getPermitSegmentStatistics(options?: ApiRequestOptions) {
  return apiGet<PermitSegmentStatisticsResponse>(
    "/development/permit-segments/statistics",
    undefined,
    options,
  );
}

export function getParcelPermitSegmentSummary(
  officialParcelId: string,
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelPermitSegmentSummaryResponse>(
    `/development/permit-segments/${encodeURIComponent(officialParcelId)}`,
    undefined,
    options,
  );
}

export function getPermitSegmentOptions(options?: ApiRequestOptions) {
  return apiGet<PermitSegmentOptionsResponse>(
    "/development/permit-segments/options",
    undefined,
    options,
  );
}

export function getPermitTypes(options?: ApiRequestOptions) {
  return apiGet<DevelopmentLookupResponse>(
    "/development/permit-types",
    undefined,
    options,
  );
}

export function getWorkTypes(options?: ApiRequestOptions) {
  return apiGet<DevelopmentLookupResponse>(
    "/development/work-types",
    undefined,
    options,
  );
}

export function getJurisdictions(options?: ApiRequestOptions) {
  return apiGet<DevelopmentLookupResponse>(
    "/development/jurisdictions",
    undefined,
    options,
  );
}

export function getActivityClasses(options?: ApiRequestOptions) {
  return apiGet<DevelopmentLookupResponse>(
    "/development/activity-classes",
    undefined,
    options,
  );
}
