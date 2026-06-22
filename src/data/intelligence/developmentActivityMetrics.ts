import demoIndicatorSummaryJson from "../../../public/demo-data/indicator_summary.json";
import demoSampleParcelsJson from "../../../public/demo-data/sample_parcels.json";

export type DevelopmentMetricTone =
  | "critical"
  | "neutral"
  | "positive"
  | "review"
  | "watch";

type ParcelActivitySummary = {
  total_parcels: number;
  parcels_with_permits: number;
  parcels_without_permits: number;
  parcels_with_recent_1yr_activity: number;
  parcels_with_recent_3yr_activity: number;
  parcels_with_ambiguous_permit_flag: number;
};

type PermitRepresentationSummary = {
  source_permit_count: number;
  relationship_distinct_permit_count: number;
  matched_distinct_permit_count: number;
  unmatched_distinct_permit_count: number;
  ambiguous_distinct_permit_count: number;
  relationship_row_count: number;
};

type DateRangeSummary = {
  first_permit_date: string | null;
  latest_permit_date: string | null;
  activity_anchor_date: string | null;
};

type PermitAmountSummary = {
  parcel_summary_permit_amount_total: number | null;
  relationship_row_permit_amount_total: number | null;
  source_permit_amount_total: number | null;
};

type ActivityClassRecord = {
  development_activity_class: string;
  parcel_count: number;
  parcel_percentage: number;
  ambiguous_flag_parcel_count: number;
  avg_development_activity_score: number;
};

export type DevelopmentHotspotRecord = {
  official_parcel_id: string;
  objectid_1: number;
  pin14: string;
  subdiv_name: string | null;
  nbh_name: string | null;
  parcel_quality_status: string | null;
  valuation_band: string | null;
  parcel_size_category: string | null;
  zoning_jurisdiction_name: string | null;
  planning_jurisdiction_name: string | null;
  dominant_zoning_code_raw: string | null;
  dominant_zoning_general_normalized: string | null;
  zoning_assignment_confidence: string | null;
  primary_governance_warning: string | null;
  total_permit_count: number;
  first_permit_date: string | null;
  latest_permit_date: string | null;
  active_year_count: number;
  recent_permit_count_1yr: number;
  recent_permit_count_3yr: number;
  total_permit_amount: number | null;
  avg_permit_amount: number | null;
  dominant_permit_type: string | null;
  dominant_work_type: string | null;
  latest_permit_status: string | null;
  ambiguous_permit_count: number;
  has_unmatched_or_ambiguous_permit_flag: boolean;
  co_date_future_outlier_count: number;
  development_activity_score: number;
  development_activity_class: string;
  residential_growth_permits?: number;
  commercial_activity_permits?: number;
  industrial_activity_permits?: number;
  institutional_activity_permits?: number;
  redevelopment_signal_permits?: number;
  minor_maintenance_permits?: number;
  demolition_permits?: number;
  active_construction_permits?: number;
  completed_permits?: number;
  high_value_permits?: number;
  major_value_permits?: number;
  dominant_permit_segment?: string | null;
  dominant_growth_signal?: string | null;
  permit_signal_score_max?: number | null;
  permit_signal_score_avg?: number | null;
  current_activity_status?: string | null;
};

export type DevelopmentTrendRecord = {
  activity_year: number | null;
  activity_month?: number | null;
  permit_count: number;
  active_parcel_count: number;
  unmatched_permit_count: number;
  ambiguous_permit_count: number;
  active_zoning_jurisdiction_count?: number;
  source_permit_amount_total: number | null;
  relationship_permit_amount_total: number | null;
  first_permit_date: string | null;
  latest_permit_date: string | null;
};

export type DevelopmentZoningRecord = {
  zoning_jurisdiction_name: string;
  dominant_zoning_general_normalized: string;
  dominant_zoning_code_raw: string;
  permit_type: string | null;
  permit_count: number;
  relationship_row_count: number;
  active_parcel_count: number;
  unmatched_permit_count: number;
  ambiguous_permit_count: number;
  total_permit_amount: number | null;
  avg_permit_amount: number | null;
  first_permit_date: string | null;
  latest_permit_date: string | null;
};

type DevelopmentActivityValidation = {
  generated_at: string;
  parcel_activity_summary: ParcelActivitySummary;
  permit_representation_summary: PermitRepresentationSummary;
  permit_amount_summary?: PermitAmountSummary;
  date_range: DateRangeSummary;
  activity_class_distribution: ActivityClassRecord[];
  top_activity_parcels: DevelopmentHotspotRecord[];
  annual_trend_summary: DevelopmentTrendRecord[];
  recent_monthly_trend_summary: DevelopmentTrendRecord[];
  zoning_activity_summary: DevelopmentZoningRecord[];
  outputs: Record<string, string>;
};

type DemoBucketRecord = {
  active_parcel_count?: number | null;
  count?: number | null;
  parcel_count?: number | null;
  percentage?: number | null;
  permit_count?: number | null;
  total_permit_amount?: number | null;
  value?: string | null;
  year?: number | null;
  month?: number | null;
};

type DemoSampleParcel = {
  development_activity_summary?: string | null;
  flood_summary?: string | null;
  municipality?: string | null;
  neighborhood?: string | null;
  objectid_1?: number | null;
  official_parcel_id?: string | null;
  parcel_quality_status?: string | null;
  parcel_size_category?: string | null;
  pin14?: string | null;
  planning_jurisdiction?: string | null;
  safe_for_dashboard?: boolean | null;
  subdivision?: string | null;
  valuation_band?: string | null;
  zoning_assignment_confidence?: string | null;
  zoning_category?: string | null;
  zoning_code?: string | null;
  zoning_jurisdiction?: string | null;
};

export interface DevelopmentCoreMetric {
  accent: string;
  description: string;
  id: string;
  label: string;
  tone: DevelopmentMetricTone;
  value: string;
}

export interface DevelopmentActivityClassMetric {
  accent: string;
  ambiguousCount: number;
  className: string;
  count: number;
  id: string;
  label: string;
  percentage: number;
  score: number;
  tone: DevelopmentMetricTone;
}

const demoSummary = demoIndicatorSummaryJson as {
  development_activity?: {
    activity_summary?: {
      active_parcel_count?: number;
      by_activity_class?: DemoBucketRecord[];
      by_month?: DemoBucketRecord[];
      by_year?: DemoBucketRecord[];
      by_zoning_category?: DemoBucketRecord[];
      date_range?: {
        activity_date_max?: string | null;
        activity_date_min?: string | null;
      };
      recent_activity?: {
        recent_1yr_parcels?: number;
        recent_3yr_parcels?: number;
      };
      total_permit_amount?: number | null;
      total_permits?: number;
    };
    statistics?: {
      parcels_with_activity?: number;
      parcels_without_activity?: number;
      recent_activity_parcels_1yr?: number;
      recent_activity_parcels_3yr?: number;
      total_permits?: number;
    };
  };
  floodplain_review?: {
    total_parcels?: number;
  };
  generated_at?: string;
};

const demoParcels = demoSampleParcelsJson as {
  records?: DemoSampleParcel[];
};

const demoActivity =
  demoSummary.development_activity?.activity_summary ?? {};
const demoStatistics = demoSummary.development_activity?.statistics ?? {};
const demoDateRange = demoActivity.date_range ?? {};
const demoRecentActivity = demoActivity.recent_activity ?? {};
const totalDemoParcels =
  demoSummary.floodplain_review?.total_parcels ??
  (demoStatistics.parcels_with_activity ?? 0) +
    (demoStatistics.parcels_without_activity ?? 0);
const demoParcelsWithActivity =
  demoStatistics.parcels_with_activity ??
  demoActivity.active_parcel_count ??
  0;
const demoParcelsWithoutActivity =
  demoStatistics.parcels_without_activity ??
  Math.max(totalDemoParcels - demoParcelsWithActivity, 0);
const demoTotalPermits =
  demoActivity.total_permits ?? demoStatistics.total_permits ?? 0;

function demoNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function demoPercentage(count: number) {
  return totalDemoParcels > 0 ? (count / totalDemoParcels) * 100 : 0;
}

function mapDemoTrend(record: DemoBucketRecord): DevelopmentTrendRecord {
  return {
    activity_year: typeof record.year === "number" ? record.year : null,
    activity_month: typeof record.month === "number" ? record.month : null,
    active_parcel_count: demoNumber(
      record.active_parcel_count ?? record.parcel_count,
    ),
    ambiguous_permit_count: 0,
    first_permit_date: demoDateRange.activity_date_min ?? null,
    latest_permit_date: demoDateRange.activity_date_max ?? null,
    permit_count: demoNumber(record.permit_count ?? record.count),
    relationship_permit_amount_total: record.total_permit_amount ?? null,
    source_permit_amount_total: record.total_permit_amount ?? null,
    unmatched_permit_count: 0,
  };
}

function mapDemoParcel(record: DemoSampleParcel): DevelopmentHotspotRecord {
  return {
    active_year_count: 0,
    ambiguous_permit_count: 0,
    avg_permit_amount: null,
    co_date_future_outlier_count: 0,
    current_activity_status: record.development_activity_summary ?? null,
    development_activity_class:
      record.development_activity_summary ?? "portfolio_demo_sample",
    development_activity_score: 0,
    dominant_growth_signal: null,
    dominant_permit_segment: null,
    dominant_permit_type: null,
    dominant_work_type: null,
    dominant_zoning_code_raw: record.zoning_code ?? null,
    dominant_zoning_general_normalized: record.zoning_category ?? null,
    first_permit_date: null,
    has_unmatched_or_ambiguous_permit_flag: false,
    latest_permit_date: null,
    latest_permit_status: null,
    nbh_name: record.neighborhood ?? null,
    objectid_1: record.objectid_1 ?? 0,
    official_parcel_id: record.official_parcel_id ?? "",
    parcel_quality_status: record.parcel_quality_status ?? null,
    parcel_size_category: record.parcel_size_category ?? null,
    pin14: record.pin14 ?? "",
    planning_jurisdiction_name: record.planning_jurisdiction ?? null,
    primary_governance_warning: record.safe_for_dashboard
      ? "safe_for_dashboard"
      : null,
    recent_permit_count_1yr: 0,
    recent_permit_count_3yr: 0,
    subdiv_name: record.subdivision ?? null,
    total_permit_amount: null,
    total_permit_count: 0,
    valuation_band: record.valuation_band ?? null,
    zoning_assignment_confidence:
      record.zoning_assignment_confidence ?? null,
    zoning_jurisdiction_name: record.zoning_jurisdiction ?? null,
  };
}

export const developmentActivityStaticValidation: DevelopmentActivityValidation =
  {
    activity_class_distribution: (
      demoActivity.by_activity_class ?? []
    ).map((record) => {
      const parcelCount = demoNumber(
        record.active_parcel_count ?? record.parcel_count ?? record.count,
      );
      return {
        ambiguous_flag_parcel_count: 0,
        avg_development_activity_score: 0,
        development_activity_class: record.value ?? "unclassified",
        parcel_count: parcelCount,
        parcel_percentage: record.percentage ?? demoPercentage(parcelCount),
      };
    }),
    annual_trend_summary: (demoActivity.by_year ?? []).map(mapDemoTrend),
    date_range: {
      activity_anchor_date: demoDateRange.activity_date_max ?? null,
      first_permit_date: demoDateRange.activity_date_min ?? null,
      latest_permit_date: demoDateRange.activity_date_max ?? null,
    },
    generated_at: demoSummary.generated_at ?? "Not available",
    outputs: {
      source: "public/demo-data/indicator_summary.json",
    },
    parcel_activity_summary: {
      parcels_with_ambiguous_permit_flag: 0,
      parcels_with_permits: demoParcelsWithActivity,
      parcels_with_recent_1yr_activity:
        demoRecentActivity.recent_1yr_parcels ??
        demoStatistics.recent_activity_parcels_1yr ??
        0,
      parcels_with_recent_3yr_activity:
        demoRecentActivity.recent_3yr_parcels ??
        demoStatistics.recent_activity_parcels_3yr ??
        0,
      parcels_without_permits: demoParcelsWithoutActivity,
      total_parcels: totalDemoParcels,
    },
    permit_amount_summary: {
      parcel_summary_permit_amount_total:
        demoActivity.total_permit_amount ?? null,
      relationship_row_permit_amount_total:
        demoActivity.total_permit_amount ?? null,
      source_permit_amount_total: demoActivity.total_permit_amount ?? null,
    },
    permit_representation_summary: {
      ambiguous_distinct_permit_count: 0,
      matched_distinct_permit_count: demoTotalPermits,
      relationship_distinct_permit_count: demoTotalPermits,
      relationship_row_count: demoTotalPermits,
      source_permit_count: demoTotalPermits,
      unmatched_distinct_permit_count: 0,
    },
    recent_monthly_trend_summary: (demoActivity.by_month ?? []).map(
      mapDemoTrend,
    ),
    top_activity_parcels: (demoParcels.records ?? [])
      .filter((record) => record.official_parcel_id)
      .slice(0, 25)
      .map(mapDemoParcel),
    zoning_activity_summary: (demoActivity.by_zoning_category ?? []).map(
      (record) => ({
        active_parcel_count: demoNumber(
          record.active_parcel_count ?? record.parcel_count,
        ),
        ambiguous_permit_count: 0,
        avg_permit_amount: null,
        dominant_zoning_code_raw: "Mixed",
        dominant_zoning_general_normalized:
          record.value ?? "unclassified",
        first_permit_date: demoDateRange.activity_date_min ?? null,
        latest_permit_date: demoDateRange.activity_date_max ?? null,
        permit_count: demoNumber(record.permit_count ?? record.count),
        permit_type: null,
        relationship_row_count: demoNumber(record.permit_count ?? record.count),
        total_permit_amount: record.total_permit_amount ?? null,
        unmatched_permit_count: 0,
        zoning_jurisdiction_name: "Countywide",
      }),
    ),
  };

const validation = developmentActivityStaticValidation;

const numberFormatter = new Intl.NumberFormat("en-US");
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const classLabels: Record<string, string> = {
  high_activity: "High Activity",
  low_activity: "Low Activity",
  moderate_activity: "Moderate Activity",
  no_activity: "No Activity",
  very_high_activity: "Very High Activity",
};

const classAccents: Record<string, string> = {
  high_activity: "#f0cd79",
  low_activity: "#68d8ff",
  moderate_activity: "#55d38f",
  no_activity: "#64748b",
  very_high_activity: "#ffb454",
};

const classTones: Record<string, DevelopmentMetricTone> = {
  high_activity: "watch",
  low_activity: "neutral",
  moderate_activity: "positive",
  no_activity: "neutral",
  very_high_activity: "review",
};

const activitySummary = validation.parcel_activity_summary;
const permitSummary = validation.permit_representation_summary;
const permitAmountSummary = validation.permit_amount_summary;
const dateRange = validation.date_range;

export function formatDevelopmentCount(value: number) {
  return numberFormatter.format(Math.round(value));
}

export function formatDevelopmentCompact(value: number | null | undefined) {
  return compactNumberFormatter.format(value ?? 0);
}

export function formatDevelopmentPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

export function formatDevelopmentDate(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return value;
}

export function formatDevelopmentLabel(value: string | null | undefined) {
  if (!value) {
    return "Unclassified";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export const developmentActivityArtifactsAvailable = Boolean(
  validation?.parcel_activity_summary && validation?.permit_representation_summary,
);

export const developmentActivitySummary = {
  activityAnchorDate: dateRange.activity_anchor_date,
  dateRange,
  generatedAt: validation.generated_at,
  outputs: validation.outputs,
  parcelSummary: activitySummary,
  permitAmountSummary,
  permitSummary,
  sourceArtifacts: [
    "cfs-data-pipelines/outputs/development_activity_parcel_summary_validation.json",
    "cfs-data-pipelines/outputs/development_activity_top_parcels.csv",
    "cfs-data-pipelines/outputs/development_activity_year_summary.csv",
    "cfs-data-pipelines/outputs/development_activity_month_summary.csv",
    "cfs-data-pipelines/outputs/development_activity_zoning_summary.csv",
  ],
};

export const developmentCoreMetrics: DevelopmentCoreMetric[] = [
  {
    id: "total-permits",
    label: "Total Permit Records",
    value: formatDevelopmentCount(permitSummary.source_permit_count),
    tone: "positive",
    accent: "#68d8ff",
    description: "Distinct Real Property Permit records represented in the static analytics artifact.",
  },
  {
    id: "parcels-with-activity",
    label: "Parcels With Activity",
    value: formatDevelopmentCount(activitySummary.parcels_with_permits),
    tone: "positive",
    accent: "#55d38f",
    description: "Trusted parcels with at least one matched Real Property Permit record.",
  },
  {
    id: "parcels-without-activity",
    label: "Parcels Without Activity",
    value: formatDevelopmentCount(activitySummary.parcels_without_permits),
    tone: "neutral",
    accent: "#94a3b8",
    description: "Trusted parcels with no matched Real Property Permit activity in the generated layer.",
  },
  {
    id: "recent-one-year",
    label: "Recent 1-Year Parcels",
    value: formatDevelopmentCount(activitySummary.parcels_with_recent_1yr_activity),
    tone: "watch",
    accent: "#f0cd79",
    description: "Parcels with permit activity within one year of the artifact anchor date.",
  },
  {
    id: "recent-three-year",
    label: "Recent 3-Year Parcels",
    value: formatDevelopmentCount(activitySummary.parcels_with_recent_3yr_activity),
    tone: "watch",
    accent: "#ffb454",
    description: "Parcels with permit activity within three years of the artifact anchor date.",
  },
  {
    id: "date-range",
    label: "Activity Date Range",
    value: `${formatDevelopmentDate(dateRange.first_permit_date)} to ${formatDevelopmentDate(
      dateRange.latest_permit_date,
    )}`,
    tone: "neutral",
    accent: "#c8a4ff",
    description: "Permit date range represented in the generated development activity summaries.",
  },
  {
    id: "anchor-date",
    label: "Activity Anchor Date",
    value: formatDevelopmentDate(dateRange.activity_anchor_date),
    tone: "neutral",
    accent: "#d8b86a",
    description: "Dataset max activity date used for trailing recent activity windows.",
  },
  {
    id: "permit-amount",
    label: "Permit Amount Rollup",
    value: `$${formatDevelopmentCompact(
      permitAmountSummary?.relationship_row_permit_amount_total,
    )}`,
    tone: "positive",
    accent: "#55d38f",
    description:
      "Total permit amount represented in the permit-to-parcel relationship summary.",
  },
];

export const developmentActivityClassMetrics: DevelopmentActivityClassMetric[] =
  validation.activity_class_distribution.map((record) => ({
    id: record.development_activity_class,
    className: record.development_activity_class,
    label:
      classLabels[record.development_activity_class] ??
      formatDevelopmentLabel(record.development_activity_class),
    count: record.parcel_count,
    percentage: record.parcel_percentage,
    ambiguousCount: record.ambiguous_flag_parcel_count,
    score: record.avg_development_activity_score,
    accent: classAccents[record.development_activity_class] ?? "#68d8ff",
    tone: classTones[record.development_activity_class] ?? "neutral",
  }));

export const developmentTopActivityParcels = validation.top_activity_parcels;

export const developmentHotspotParcels =
  developmentTopActivityParcels.slice(0, 10);

export function getStaticDevelopmentActivityForParcel(
  officialParcelId: string | null | undefined,
) {
  if (!officialParcelId) {
    return null;
  }

  return (
    developmentTopActivityParcels.find(
      (parcel) => parcel.official_parcel_id === officialParcelId,
    ) ?? null
  );
}

export const developmentAnnualTrend = validation.annual_trend_summary.filter(
  (record) => typeof record.activity_year === "number",
);

export const developmentRecentMonthlyTrend =
  validation.recent_monthly_trend_summary.filter(
    (record) =>
      typeof record.activity_year === "number" &&
      typeof record.activity_month === "number",
  );

export const developmentZoningSummary =
  validation.zoning_activity_summary.slice(0, 12);
