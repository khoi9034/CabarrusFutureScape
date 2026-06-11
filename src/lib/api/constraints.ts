import { apiGet, type ApiRequestOptions, type ApiQueryParams } from "@/lib/api/client";
import type {
  FloodConstraintDetailResponse,
  FloodConstraintFilterResponse,
  FloodConstraintStatisticsResponse,
  FloodConstraintSummaryResponse,
  FloodZonePageResponse,
} from "@/types/api";

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
