import {
  developmentHotspotParcels,
  type DevelopmentHotspotRecord,
} from "@/data/intelligence/developmentActivityMetrics";
import type {
  DevelopmentHotspotResult,
  DevelopmentHotspotsResponse,
} from "@/types/api";
import type { DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";

export interface DevelopmentHotspotsViewModel {
  errorMessage: string | null;
  hotspots: DevelopmentHotspotRecord[];
  isLoading: boolean;
  source: DevelopmentPanelSource;
  totalCount: number;
}

function mapHotspotResult(result: DevelopmentHotspotResult): DevelopmentHotspotRecord {
  return {
    active_year_count: result.active_year_count ?? 0,
    ambiguous_permit_count: result.ambiguous_permit_count ?? 0,
    avg_permit_amount: result.avg_permit_amount,
    co_date_future_outlier_count: result.co_date_future_outlier_count ?? 0,
    development_activity_class: result.development_activity_class ?? "unknown",
    development_activity_score: result.development_activity_score ?? 0,
    residential_growth_permits: result.residential_growth_permits ?? 0,
    commercial_activity_permits: result.commercial_activity_permits ?? 0,
    industrial_activity_permits: result.industrial_activity_permits ?? 0,
    institutional_activity_permits: result.institutional_activity_permits ?? 0,
    redevelopment_signal_permits: result.redevelopment_signal_permits ?? 0,
    minor_maintenance_permits: result.minor_maintenance_permits ?? 0,
    demolition_permits: result.demolition_permits ?? 0,
    active_construction_permits: result.active_construction_permits ?? 0,
    completed_permits: result.completed_permits ?? 0,
    high_value_permits: result.high_value_permits ?? 0,
    major_value_permits: result.major_value_permits ?? 0,
    dominant_permit_segment: result.dominant_permit_segment ?? null,
    dominant_growth_signal: result.dominant_growth_signal ?? null,
    permit_signal_score_max: result.permit_signal_score_max ?? null,
    permit_signal_score_avg: result.permit_signal_score_avg ?? null,
    current_activity_status: result.current_activity_status ?? null,
    dominant_permit_type: result.dominant_permit_type,
    dominant_work_type: result.dominant_work_type,
    dominant_zoning_code_raw: result.dominant_zoning_code_raw,
    dominant_zoning_general_normalized:
      result.dominant_zoning_general_normalized,
    first_permit_date: result.first_permit_date ?? null,
    has_unmatched_or_ambiguous_permit_flag:
      result.has_unmatched_or_ambiguous_permit_flag,
    latest_permit_date: result.latest_permit_date,
    latest_permit_status: result.latest_permit_status,
    nbh_name: result.neighborhood,
    objectid_1: 0,
    official_parcel_id: result.official_parcel_id,
    parcel_quality_status: result.parcel_quality_status,
    parcel_size_category: null,
    pin14: result.pin14 ?? "Unavailable",
    planning_jurisdiction_name: null,
    primary_governance_warning: null,
    recent_permit_count_1yr: result.recent_permit_count_1yr,
    recent_permit_count_3yr: result.recent_permit_count_3yr,
    subdiv_name: result.subdivision,
    total_permit_amount: result.total_permit_amount,
    total_permit_count: result.total_permit_count,
    valuation_band: null,
    zoning_assignment_confidence: result.zoning_assignment_confidence,
    zoning_jurisdiction_name: result.zoning_jurisdiction_name,
  };
}

export function getStaticDevelopmentHotspots(): DevelopmentHotspotsViewModel {
  return {
    errorMessage: null,
    hotspots: developmentHotspotParcels,
    isLoading: false,
    source: "static",
    totalCount: developmentHotspotParcels.length,
  };
}

export function normalizeDevelopmentHotspots(
  response: DevelopmentHotspotsResponse,
): Omit<DevelopmentHotspotsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !Array.isArray(response.results)) {
    throw new Error("Development hotspots API returned an invalid shape.");
  }

  return {
    hotspots: response.results.map(mapHotspotResult),
    totalCount: response.total_count,
  };
}
