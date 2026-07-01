import {
  filterParcelSearchRecords,
  getParcelSearchRecordById,
  type ParcelSearchRecord,
  type ParcelSearchRequest,
} from "@/data/intelligence/parcelSearchData";
import type {
  DevelopmentActivitySummaryResponse,
  DevelopmentStatisticsResponse,
  DevelopmentTrendsResponse,
  FloodConstraintSummaryResponse,
  IndicatorIntelligenceResponse,
  PermitSegmentStatisticsResponse,
  SchoolConstraintStatisticsResponse,
  SchoolQaSummaryResponse,
  SchoolUtilizationSeedPageResponse,
  EconomicsIntelligenceResponse,
  EconomicsEnterpriseExportResponse,
  EconomicsPowerBiExportResponse,
} from "@/types/api";

const DEMO_DATA_BASE_URL = "/demo-data";

type DemoJsonLoader<T> = () => T;

interface DemoManifest {
  caveat: string;
  generated_at: string | null;
  mode: "portfolio_demo";
  record_counts: Record<string, number>;
  source_label: string;
}

interface DemoDataStillNeededItem {
  best_format: string;
  id: string;
  label: string;
  status: string;
  unlocks: string;
}

export interface DemoIndicatorSummary {
  available: boolean;
  caveats: string[];
  data_still_needed: DemoDataStillNeededItem[];
  development_activity: {
    activity_summary: DevelopmentActivitySummaryResponse;
    permit_segments: PermitSegmentStatisticsResponse;
    statistics: DevelopmentStatisticsResponse;
  };
  floodplain_review: FloodConstraintSummaryResponse;
  generated_at: string | null;
  model_status: DemoModelStatus;
  school_capacity_watch: {
    qa_summary: SchoolQaSummaryResponse;
    statistics: SchoolConstraintStatisticsResponse;
    utilization_seed: SchoolUtilizationSeedPageResponse;
  };
  utility_readiness: {
    caveat: string;
    status: "Data still needed" | "Proxy only" | "Not available";
    true_capacity_available: boolean;
  };
}

export interface DemoDevelopmentTrends {
  available: boolean;
  generated_at: string | null;
  trends: DevelopmentTrendsResponse;
}

export interface DemoFloodSummary {
  available: boolean;
  generated_at: string | null;
  summary: FloodConstraintSummaryResponse;
}

export interface DemoSchoolCapacityWatch {
  available: boolean;
  generated_at: string | null;
  qa_summary: SchoolQaSummaryResponse;
  statistics: SchoolConstraintStatisticsResponse;
  utilization_seed: SchoolUtilizationSeedPageResponse;
}

export interface DemoModelStatus {
  caveat: string;
  current_best_internal_model: string;
  exact_probabilities_shown: false;
  feature_rows: number | null;
  generated_at: string | null;
  model_status: "Internal only" | "Not available";
  production_ready: false;
  public_exposure_allowed: false;
  raw_model_values_visible: false;
}

interface DemoSampleParcel {
  assessed_value?: number | null;
  development_activity_summary?: string | null;
  flood_summary?: string | null;
  governance_warnings?: string[];
  market_value?: number | null;
  municipality?: string | null;
  neighborhood?: string | null;
  objectid_1?: number | null;
  official_parcel_id: string;
  parcel_quality_status?: string | null;
  parcel_size_category?: string | null;
  pin14?: string | null;
  planning_boundary_type?: string | null;
  planning_jurisdiction?: string | null;
  safe_for_dashboard?: boolean | null;
  school_assignment_summary?: string | null;
  search_text?: string | null;
  subdivision?: string | null;
  valuation_band?: string | null;
  zoning_assignment_confidence?: string | null;
  zoning_category?: string | null;
  zoning_code?: string | null;
  zoning_jurisdiction?: string | null;
}

interface DemoSampleParcelsPayload {
  available: boolean;
  generated_at: string | null;
  records: DemoSampleParcel[];
  safe_export_notes: string[];
  total_count: number;
}

const demoJsonCache = new Map<string, Promise<unknown>>();

export function getDemoManifest() {
  return loadDemoJson("demo_manifest.json", getUnavailableDemoManifest);
}

export function getDemoIndicatorSummary() {
  return loadDemoJson("indicator_summary.json", getUnavailableIndicatorSummary);
}

export function getDemoIndicatorIntelligence() {
  return loadDemoJson(
    "indicator_intelligence.json",
    getUnavailableIndicatorIntelligence,
  );
}

export function getDemoEconomicsIntelligence() {
  return loadDemoJson(
    "economics_intelligence.json",
    getUnavailableEconomicsIntelligence,
  );
}

export function getDemoEconomicsEnterpriseExport() {
  return loadDemoJson(
    "economics_enterprise_export.json",
    getUnavailableEconomicsEnterpriseExport,
  );
}

export function getDemoEconomicsPowerBiExport() {
  return loadDemoJson(
    "economics_powerbi_export.json",
    getUnavailableEconomicsPowerBiExport,
  );
}

export function getDemoDevelopmentTrends() {
  return loadDemoJson(
    "development_trends.json",
    getUnavailableDevelopmentTrends,
  );
}

export function getDemoFloodSummary() {
  return loadDemoJson("flood_summary.json", getUnavailableFloodSummary);
}

export function getDemoSchoolCapacityWatch() {
  return loadDemoJson(
    "school_capacity_watch.json",
    getUnavailableSchoolCapacityWatch,
  );
}

export function getDemoModelStatus() {
  return loadDemoJson("model_status.json", getUnavailableModelStatus);
}

export async function getDemoSampleParcels() {
  const payload = await loadDemoJson(
    "sample_parcels.json",
    getUnavailableSampleParcels,
  );

  return payload.records.map(toParcelSearchRecord);
}

export async function searchDemoParcels(request: ParcelSearchRequest) {
  const records = await getDemoSampleParcels();
  return filterParcelSearchRecords(records, request);
}

export async function getDemoParcelById(officialParcelId: string) {
  const records = await getDemoSampleParcels();
  return getParcelSearchRecordById(records, officialParcelId) ?? null;
}

export async function getDemoDevelopmentStatisticsResponse() {
  const summary = await getDemoIndicatorSummary();
  return summary.development_activity.statistics;
}

export async function getDemoDevelopmentActivitySummaryResponse() {
  const summary = await getDemoIndicatorSummary();
  return summary.development_activity.activity_summary;
}

export async function getDemoPermitSegmentStatisticsResponse() {
  const summary = await getDemoIndicatorSummary();
  return summary.development_activity.permit_segments;
}

export async function getDemoDevelopmentTrendsResponse() {
  const trends = await getDemoDevelopmentTrends();
  return trends.trends;
}

export async function getDemoFloodSummaryResponse() {
  const flood = await getDemoFloodSummary();
  return flood.summary;
}

export async function getDemoSchoolConstraintStatisticsResponse() {
  const schools = await getDemoSchoolCapacityWatch();
  return schools.statistics;
}

export async function getDemoSchoolQaSummaryResponse() {
  const schools = await getDemoSchoolCapacityWatch();
  return schools.qa_summary;
}

export async function getDemoSchoolUtilizationSeedResponse() {
  const schools = await getDemoSchoolCapacityWatch();
  return schools.utilization_seed;
}

async function loadDemoJson<T>(
  fileName: string,
  fallback: DemoJsonLoader<T>,
): Promise<T> {
  const cacheKey = `${DEMO_DATA_BASE_URL}/${fileName}`;
  const cached = demoJsonCache.get(cacheKey);

  if (cached) {
    return cached as Promise<T>;
  }

  const promise = fetch(cacheKey, {
    cache: "force-cache",
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return fallback();
      }

      return (await response.json()) as T;
    })
    .catch(() => fallback());

  demoJsonCache.set(cacheKey, promise);
  return promise;
}

function toParcelSearchRecord(parcel: DemoSampleParcel): ParcelSearchRecord {
  const governanceWarnings = parcel.governance_warnings ?? [];
  const record: ParcelSearchRecord = {
    assessedValue: parcel.assessed_value ?? null,
    governanceWarningCount: governanceWarnings.length,
    governanceWarnings,
    mailingAddress: null,
    mailingCity: null,
    mailingState: null,
    marketValue: parcel.market_value ?? null,
    needsGovernanceReview: governanceWarnings.length > 0,
    neighborhood: parcel.neighborhood ?? null,
    objectId1: parcel.objectid_1 ?? null,
    officialParcelId: parcel.official_parcel_id,
    ownerName: null,
    ownerSecondaryName: null,
    parcelQualityStatus: parcel.parcel_quality_status ?? null,
    parcelSizeCategory: parcel.parcel_size_category ?? null,
    pin14: parcel.pin14 ?? null,
    planningBoundaryType: parcel.planning_boundary_type ?? null,
    planningJurisdiction:
      parcel.planning_jurisdiction ?? parcel.municipality ?? null,
    primaryGovernanceWarning: governanceWarnings[0] ?? null,
    safeForDashboard: parcel.safe_for_dashboard ?? true,
    searchText: "",
    subdivision: parcel.subdivision ?? null,
    valuationBand: parcel.valuation_band ?? null,
    zoningCategory: parcel.zoning_category ?? null,
    zoningCode: parcel.zoning_code ?? null,
    zoningConfidence: parcel.zoning_assignment_confidence ?? null,
    zoningJurisdiction: parcel.zoning_jurisdiction ?? null,
  };

  record.searchText = normalizeSearchText(
    [
      record.officialParcelId,
      record.pin14,
      record.subdivision,
      record.neighborhood,
      record.zoningJurisdiction,
      record.zoningCode,
      record.zoningCategory,
      record.zoningConfidence,
      record.governanceWarnings.join(" "),
      record.parcelQualityStatus,
      record.valuationBand,
      record.parcelSizeCategory,
      record.planningJurisdiction,
      parcel.development_activity_summary,
      parcel.flood_summary,
      parcel.school_assignment_summary,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return record;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getUnavailableDemoManifest(): DemoManifest {
  return {
    caveat: "Demo data not available.",
    generated_at: null,
    mode: "portfolio_demo",
    record_counts: {},
    source_label: "Static CFS demo extract",
  };
}

function getUnavailableDevelopmentStatistics(): DevelopmentStatisticsResponse {
  return {
    activity_classes: {
      high_activity: 0,
      low_activity: 0,
      moderate_activity: 0,
      no_activity: 0,
      very_high_activity: 0,
    },
    activity_date_max: null,
    activity_date_min: null,
    by_permit_type: [],
    by_status: [],
    by_work_type: [],
    by_zoning_category: [],
    by_zoning_jurisdiction: [],
    filters_applied: {},
    parcels_with_activity: 0,
    parcels_without_activity: 0,
    recent_activity_parcels_1yr: 0,
    recent_activity_parcels_3yr: 0,
    total_permits: 0,
  };
}

function getUnavailableDevelopmentActivitySummary(): DevelopmentActivitySummaryResponse {
  return {
    active_parcel_count: 0,
    avg_permit_amount: null,
    by_activity_class: [],
    by_month: [],
    by_permit_type: [],
    by_status: [],
    by_work_type: [],
    by_year: [],
    by_zoning_category: [],
    by_zoning_jurisdiction: [],
    date_range: {
      activity_date_max: null,
      activity_date_min: null,
    },
    filters_applied: {},
    recent_activity: {
      recent_1yr_parcels: 0,
      recent_3yr_parcels: 0,
    },
    total_permit_amount: null,
    total_permits: 0,
  };
}

function getUnavailablePermitSegments(): PermitSegmentStatisticsResponse {
  return {
    by_development_domain: [],
    by_permit_growth_signal: [],
    by_permit_segment: [],
    by_permit_status_stage: [],
    by_permit_value_class: [],
    total_permits: 0,
  };
}

function getUnavailableDevelopmentTrends(): DemoDevelopmentTrends {
  return {
    available: false,
    generated_at: null,
    trends: {
      annual_trends: [],
      date_range: {
        activity_date_max: null,
        activity_date_min: null,
        end_year: null,
        start_year: null,
      },
      filters_applied: {},
      group_by: null,
      grouped_trends: [],
      monthly_trends: [],
      peak_month: null,
      peak_year: null,
      rolling_summary: null,
      rolling_window: null,
      total_permits: 0,
      trend_direction: "Data still needed",
    },
  };
}

function getUnavailableFloodResponse(): FloodConstraintSummaryResponse {
  return {
    average_percent_constrained: null,
    buildability_impact_distribution: [],
    caveats: ["Demo floodplain summary is not available."],
    dominant_zone_distribution: [],
    filters_applied: {},
    floodplain_parcels: 0,
    floodway_parcels: 0,
    high_severe_buildability_parcels: 0,
    max_percent_constrained: null,
    review_required_parcels: 0,
    severity_distribution: [],
    sfha_parcels: 0,
    total_parcels: 0,
  };
}

function getUnavailableFloodSummary(): DemoFloodSummary {
  return {
    available: false,
    generated_at: null,
    summary: getUnavailableFloodResponse(),
  };
}

function getUnavailableSchoolStatistics(): SchoolConstraintStatisticsResponse {
  return {
    assignment_confidence_distribution: [],
    assignment_review_required_parcels: 0,
    capacity_data_available_parcels: 0,
    capacity_not_available_parcels: 0,
    caveats: ["Demo school assignment summary is not available."],
    constraint_class_distribution: [],
    elementary_assigned_parcels: 0,
    filters_applied: {},
    high_assigned_parcels: 0,
    included_cfs_v1_zone_count: 0,
    included_public_ccs_reference_count: 0,
    middle_assigned_parcels: 0,
    missing_elementary_assignment_parcels: 0,
    missing_high_assignment_parcels: 0,
    missing_middle_assignment_parcels: 0,
    reference_exclusion_distribution: [],
    safe_for_api_exposure: true,
    school_constraint_score_non_null_parcels: 0,
    school_reference_count: 0,
    school_zone_count: 0,
    summary_status_distribution: [],
    total_parcels: 0,
    zone_level_distribution: [],
  };
}

function getUnavailableSchoolQaSummary(): SchoolQaSummaryResponse {
  return {
    capacity_available: false,
    caveats: ["Official capacity/enrollment data is still needed."],
    duplicate_normalized_names: [],
    excluded_count_by_reason: [],
    included_public_ccs_count: 0,
    missing_elementary_assignment_count: 0,
    missing_high_assignment_count: 0,
    missing_middle_assignment_count: 0,
    multi_zone_overlap_counts: {},
    parcel_assignment_count: 0,
    parcels_assigned_to_unmatched_school_zones: 0,
    safe_for_api_exposure: true,
    school_reference_count: 0,
    school_zones_count_by_level: [],
    unmatched_zone_names: [],
  };
}

function getUnavailableUtilizationSeed(): SchoolUtilizationSeedPageResponse {
  return {
    caveats: ["Preliminary school capacity data is not available."],
    filters_applied: {},
    limit: 0,
    offset: 0,
    rows: [],
    total_count: 0,
  };
}

function getUnavailableSchoolCapacityWatch(): DemoSchoolCapacityWatch {
  return {
    available: false,
    generated_at: null,
    qa_summary: getUnavailableSchoolQaSummary(),
    statistics: getUnavailableSchoolStatistics(),
    utilization_seed: getUnavailableUtilizationSeed(),
  };
}

function getUnavailableModelStatus(): DemoModelStatus {
  return {
    caveat: "Model Lab is internal research only.",
    current_best_internal_model: "Zoning + Transportation + Tax/Value",
    exact_probabilities_shown: false,
    feature_rows: null,
    generated_at: null,
    model_status: "Internal only",
    production_ready: false,
    public_exposure_allowed: false,
    raw_model_values_visible: false,
  };
}

function getUnavailableIndicatorSummary(): DemoIndicatorSummary {
  return {
    available: false,
    caveats: ["Demo indicator summary is not available."],
    data_still_needed: [],
    development_activity: {
      activity_summary: getUnavailableDevelopmentActivitySummary(),
      permit_segments: getUnavailablePermitSegments(),
      statistics: getUnavailableDevelopmentStatistics(),
    },
    floodplain_review: getUnavailableFloodResponse(),
    generated_at: null,
    model_status: getUnavailableModelStatus(),
    school_capacity_watch: {
      qa_summary: getUnavailableSchoolQaSummary(),
      statistics: getUnavailableSchoolStatistics(),
      utilization_seed: getUnavailableUtilizationSeed(),
    },
    utility_readiness: {
      caveat: "Utility proxy does not confirm available capacity.",
      status: "Data still needed",
      true_capacity_available: false,
    },
  };
}

function getUnavailableIndicatorIntelligence(): IndicatorIntelligenceResponse {
  return {
    as_of: null,
    caveats: ["Demo indicator intelligence is not available."],
    domain_readiness: [],
    kpis: [],
    mode: "demo",
    signals: [],
    summary: {
      data_needed_count: 0,
      elevated_review_count: 0,
      review_count: 0,
      total_signals: 0,
      unavailable_count: 0,
    },
    watchlist: [],
  };
}

function getUnavailableEconomicsIntelligence(): EconomicsIntelligenceResponse {
  return {
    as_of: null,
    caveats: [
      "Portfolio Demo economics extract is not available.",
      "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
    ],
    data_readiness: [
      {
        caveat: "Parcel value fields were not available in the demo extract.",
        current_use: "Show economics mode unavailable state.",
        data_status: "unavailable",
        domain: "Parcel Economics",
        gap_or_next_need: "Export sanitized assessed value, acreage, land value, and improvement value fields.",
      },
    ],
    jurisdiction_value_summary: [],
    kpis: [],
    mode: "demo",
    opportunity_class_breakdown: [],
    parcel_economic_signals: [],
    scenario_inputs: [],
    scenario_outputs: [],
    scenario_templates: [],
    signals: [],
    summary: {
      as_of: null,
      data_needed_count: 1,
      high_opportunity_count: 0,
      median_value_per_acre: null,
      source_mode: "demo",
      total_assessed_value: null,
      total_improvement_value: null,
      total_land_value: null,
      total_parcels_analyzed: 0,
      underbuilt_candidate_count: 0,
    },
    underbuilt_watchlist: [],
    watchlist: [],
  };
}

function getUnavailableEconomicsEnterpriseExport(): EconomicsEnterpriseExportResponse {
  return {
    as_of: null,
    caveats: [
      "Portfolio Demo economics enterprise export is not available.",
      "Connector-ready export only; no external platform account is connected.",
    ],
    decision_pack_template: {
      required_caveats: [],
      sections: [],
    },
    exports: {
      decision_pack: {
        assumptions: [],
        caveats: [],
        evidence_pack: [],
        executive_takeaway: "Economics enterprise export is unavailable.",
        recommended_next_diligence: [],
        risk_flags: ["Demo export file is missing."],
      },
      planning_model: {
        cells: [],
        dimensions: [],
        measures: [],
        scenarios: [],
      },
      power_bi: {
        dimensions: {},
        kpi_fact: [],
        scenario_fact: [],
        signal_fact: [],
        watchlist_fact: [],
      },
    },
    mode: "demo",
    planning_model_dimensions: [],
    planning_model_measures: [],
    scenario_assumptions: [],
    scenario_output_bands: [],
    scenario_templates: [],
  };
}

function getUnavailableEconomicsPowerBiExport(): EconomicsPowerBiExportResponse {
  return {
    as_of: null,
    caveats: [
      "Portfolio Demo Power BI practice export is not available.",
      "No external BI account or embedded report is connected.",
    ],
    mode: "demo",
    relationships: [],
    suggested_visuals: [],
    tables: {
      domain_readiness_dim: [],
      economics_kpi_fact: [],
      geography_dim: [],
      parcel_economic_signal_fact: [],
      scenario_dim: [],
      scenario_output_fact: [],
      time_dim: [],
    },
  };
}

function getUnavailableSampleParcels(): DemoSampleParcelsPayload {
  return {
    available: false,
    generated_at: null,
    records: [],
    safe_export_notes: [
      "Demo sample parcel data is unavailable.",
      "Sensitive contact fields are not exported in portfolio demo mode.",
    ],
    total_count: 0,
  };
}
