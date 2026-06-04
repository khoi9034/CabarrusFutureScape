import { apiGet, type ApiRequestOptions, type ApiQueryParams } from "@/lib/api/client";
import type {
  ParcelDetailResponse,
  ParcelFilterResponse,
  ParcelGovernanceWarningResponse,
  ParcelSearchResponse,
  ParcelStatisticsResponse,
  ParcelZoningSummaryResponse,
} from "@/types/api";

export interface ParcelSearchParams extends ApiQueryParams {
  limit?: number;
  offset?: number;
  parcel_quality_status?: string;
  q: string;
  safe_for_dashboard?: boolean;
  valuation_band?: string;
  zoning_category?: string;
  zoning_confidence?: string;
  zoning_jurisdiction?: string;
}

export interface ParcelFilterParams extends ApiQueryParams {
  governance_warning?: string;
  limit?: number;
  neighborhood?: string;
  offset?: number;
  parcel_quality_status?: string;
  parcel_size_category?: string;
  safe_for_dashboard?: boolean;
  subdivision?: string;
  valuation_band?: string;
  zoning_category?: string;
  zoning_code?: string;
  zoning_confidence?: string;
  zoning_jurisdiction?: string;
}

export interface ParcelStatisticsParams extends ApiQueryParams {
  parcel_quality_status?: string;
  safe_for_dashboard?: boolean;
  valuation_band?: string;
  zoning_category?: string;
  zoning_confidence?: string;
  zoning_jurisdiction?: string;
}

export interface ParcelZoningSummaryParams extends ParcelStatisticsParams {
  zoning_code?: string;
}

export interface ParcelGovernanceWarningsParams extends ParcelStatisticsParams {
  limit?: number;
  offset?: number;
  warning_category?: string;
}

export interface ParcelDetailParams extends ApiQueryParams {
  include_geometry?: boolean;
}

export function getParcelDetail(
  officialParcelId: string,
  params: ParcelDetailParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelDetailResponse>(
    `/parcels/${encodeURIComponent(officialParcelId)}`,
    params,
    options,
  );
}

export function searchParcels(
  params: ParcelSearchParams,
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelSearchResponse>("/parcels/search", params, options);
}

export function filterParcels(
  params: ParcelFilterParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelFilterResponse>("/parcels/filter", params, options);
}

export function getParcelStatistics(
  params: ParcelStatisticsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelStatisticsResponse>("/parcels/statistics", params, options);
}

export function getParcelZoningSummary(
  params: ParcelZoningSummaryParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelZoningSummaryResponse>(
    "/parcels/zoning-summary",
    params,
    options,
  );
}

export function getParcelGovernanceWarnings(
  params: ParcelGovernanceWarningsParams = {},
  options?: ApiRequestOptions,
) {
  return apiGet<ParcelGovernanceWarningResponse>(
    "/parcels/governance-warnings",
    params,
    options,
  );
}
