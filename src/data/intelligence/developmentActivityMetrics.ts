import developmentActivityValidationJson from "../../../cfs-data-pipelines/outputs/development_activity_parcel_summary_validation.json";

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

const validation =
  developmentActivityValidationJson as DevelopmentActivityValidation;

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

export const developmentHotspotParcels =
  validation.top_activity_parcels.slice(0, 10);

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
