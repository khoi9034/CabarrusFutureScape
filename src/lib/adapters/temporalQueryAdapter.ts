import {
  buildTemporalQueryPreview,
  getTemporalQueryResult,
  getTemporalTrendSummary,
  type DevelopmentTemporalFilters,
  type TemporalQueryResult,
  type TemporalTrendSummary,
} from "@/data/intelligence/developmentTemporalIndex";
import type { DevelopmentTemporalQueryResponse } from "@/types/api";

export type TemporalQuerySource = "api" | "fallback" | "loading" | "static";

export interface TemporalQueryViewModel {
  bboxNote: string | null;
  errorMessage: string | null;
  isLoading: boolean;
  queryPreview: string;
  queryResult: TemporalQueryResult;
  resultCount: number;
  source: TemporalQuerySource;
  temporalContextLabel: string;
  trendSummary: TemporalTrendSummary;
}

function hasTemporalFilter(filters: DevelopmentTemporalFilters) {
  return Boolean(
    filters.selectedYear ||
      filters.selectedMonth ||
      filters.selectedDateRange.start ||
      filters.selectedDateRange.end ||
      filters.selectedRollingWindow,
  );
}

function hasDimensionFilter(filters: DevelopmentTemporalFilters) {
  return Boolean(
    filters.selectedPermitType ||
      filters.selectedWorkType ||
      filters.selectedZoningJurisdiction ||
      filters.selectedZoningCategory ||
      filters.selectedActivityClass,
  );
}

function getQueryMode(filters: DevelopmentTemporalFilters) {
  const temporal = hasTemporalFilter(filters);
  const dimension = hasDimensionFilter(filters);

  if (temporal && dimension) {
    return "combined-preview";
  }

  if (dimension) {
    return "dimension-aggregate";
  }

  return "temporal-aggregate";
}

function compactParams(params: Record<string, number | string | null>) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
}

function buildTemporalContextLabel(
  response: DevelopmentTemporalQueryResponse | null,
  filters: DevelopmentTemporalFilters,
) {
  if (response?.temporal_context.mode) {
    return response.temporal_context.mode.replaceAll("_", " ");
  }

  if (filters.selectedRollingWindow) {
    return `rolling ${filters.selectedRollingWindow} months`;
  }

  if (filters.selectedYear && filters.selectedMonth) {
    return `${filters.selectedYear}-${String(filters.selectedMonth).padStart(
      2,
      "0",
    )}`;
  }

  if (filters.selectedYear) {
    return String(filters.selectedYear);
  }

  if (filters.selectedDateRange.start || filters.selectedDateRange.end) {
    return `${filters.selectedDateRange.start ?? "min"} to ${
      filters.selectedDateRange.end ?? "max"
    }`;
  }

  return "all activity dates";
}

function buildApiQueryPreview(
  response: DevelopmentTemporalQueryResponse,
  filters: DevelopmentTemporalFilters,
) {
  const params = compactParams({
    activity_class: filters.selectedActivityClass,
    date_end: filters.selectedDateRange.end,
    date_start: filters.selectedDateRange.start,
    month: filters.selectedMonth,
    permit_type: filters.selectedPermitType,
    rolling_window: filters.selectedRollingWindow,
    work_type: filters.selectedWorkType,
    year: filters.selectedYear,
    zoning_category: filters.selectedZoningCategory,
    zoning_jurisdiction: filters.selectedZoningJurisdiction,
  });
  const queryString = params.length ? `?${params.join("&")}` : "";

  return [
    `GET /development/temporal-query${queryString}`,
    "",
    "-- Backend source tables",
    "-- public.real_property_permit_clean",
    "-- public.real_property_permit_parcel_relationship",
    "-- public.development_activity_parcel_summary",
    "",
    `-- Returned records: ${response.total_count}`,
    `-- Permits in context: ${response.summary.total_permits}`,
    `-- Active parcels in context: ${response.summary.active_parcel_count}`,
    response.bbox_support.requested
      ? `-- BBOX requested but inactive: ${response.bbox_support.note}`
      : "-- BBOX not requested; SceneView filtering remains disconnected.",
  ].join("\n");
}

export function getStaticTemporalQueryView(
  filters: DevelopmentTemporalFilters,
): TemporalQueryViewModel {
  const queryResult = getTemporalQueryResult(filters);

  return {
    bboxNote: null,
    errorMessage: null,
    isLoading: false,
    queryPreview: buildTemporalQueryPreview(filters),
    queryResult,
    resultCount: queryResult.matchingPermitCount,
    source: "static",
    temporalContextLabel: buildTemporalContextLabel(null, filters),
    trendSummary: getTemporalTrendSummary(filters),
  };
}

export function normalizeDevelopmentTemporalQuery(
  response: DevelopmentTemporalQueryResponse,
  filters: DevelopmentTemporalFilters,
  fallback: TemporalQueryViewModel,
): Omit<TemporalQueryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !response.summary || !Array.isArray(response.results)) {
    throw new Error("Development temporal query API returned an invalid shape.");
  }

  const activePermitCategories = response.summary.permit_type_breakdown
    .map((bucket) => bucket.value)
    .filter(Boolean)
    .slice(0, 6);
  const activeZoningJurisdictions =
    response.summary.zoning_jurisdiction_breakdown
      .map((bucket) => bucket.value)
      .filter(Boolean)
      .slice(0, 6);
  const queryResult: TemporalQueryResult = {
    activePermitCategories,
    activeZoningJurisdictions,
    matchingParcelCount: response.summary.active_parcel_count,
    matchingPermitCount: response.summary.total_permits,
    matchingZoningActivityCount:
      response.summary.zoning_jurisdiction_breakdown.length,
    queryMode: getQueryMode(filters),
    summaryNote:
      "Counts are returned by GET /development/temporal-query. SceneView playback and map filtering remain disconnected.",
  };

  return {
    bboxNote: response.bbox_support.note,
    queryPreview: buildApiQueryPreview(response, filters),
    queryResult,
    resultCount: response.total_count,
    temporalContextLabel: buildTemporalContextLabel(response, filters),
    trendSummary: {
      ...fallback.trendSummary,
      activePermitCategories:
        activePermitCategories.length > 0
          ? activePermitCategories.slice(0, 4)
          : fallback.trendSummary.activePermitCategories,
      activeZoningJurisdictions:
        activeZoningJurisdictions.length > 0
          ? activeZoningJurisdictions.slice(0, 4)
          : fallback.trendSummary.activeZoningJurisdictions,
    },
  };
}
