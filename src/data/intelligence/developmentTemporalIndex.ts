import type {
  DevelopmentHotspotRecord,
  DevelopmentTrendRecord,
  DevelopmentZoningRecord,
} from "@/data/intelligence/developmentActivityMetrics";
import { developmentActivityStaticValidation } from "@/data/intelligence/developmentActivityMetrics";

export interface TemporalDateRange {
  end: string | null;
  start: string | null;
}

export interface DevelopmentTemporalFilters {
  selectedActivityClass: string | null;
  selectedDateRange: TemporalDateRange;
  selectedMonth: number | null;
  selectedPermitType: string | null;
  selectedRollingWindow: 12 | 36 | null;
  selectedWorkType: string | null;
  selectedZoningCategory: string | null;
  selectedYear: number | null;
  selectedZoningJurisdiction: string | null;
}

export interface DevelopmentTemporalMonth {
  label: string;
  month: number;
  year: number;
}

export interface PermitTotalsByYear {
  activeParcelCount: number;
  activeZoningJurisdictionCount: number;
  latestPermitDate: string | null;
  permitCount: number;
  year: number;
}

export interface PermitTotalsByMonth {
  activeParcelCount: number;
  latestPermitDate: string | null;
  month: number;
  permitCount: number;
  year: number;
}

export interface ZoningActivityByYear {
  activeZoningJurisdictionCount: number;
  permitCount: number;
  year: number;
}

export interface ActivityClassMetadata {
  averageScore: number;
  className: string;
  label: string;
  parcelCount: number;
  percentage: number;
}

export type TemporalQueryMode =
  | "combined-preview"
  | "dimension-aggregate"
  | "temporal-aggregate";

export interface TemporalQueryResult {
  activePermitCategories: string[];
  activeZoningJurisdictions: string[];
  matchingParcelCount: number;
  matchingPermitCount: number;
  matchingZoningActivityCount: number;
  queryMode: TemporalQueryMode;
  summaryNote: string;
}

export interface TemporalTrendSummary {
  activePermitCategories: string[];
  activeZoningJurisdictions: string[];
  latestYearPermitCount: number;
  previousYearPermitCount: number;
  trendDirection: "down" | "flat" | "up";
  trendLabel: string;
}

type ActivityClassRecord = {
  avg_development_activity_score: number;
  development_activity_class: string;
  parcel_count: number;
  parcel_percentage: number;
};

type DevelopmentActivityValidation = {
  activity_class_distribution: ActivityClassRecord[];
  annual_trend_summary: DevelopmentTrendRecord[];
  date_range: {
    activity_anchor_date: string | null;
    first_permit_date: string | null;
    latest_permit_date: string | null;
  };
  generated_at: string;
  outputs: Record<string, string>;
  recent_monthly_trend_summary: DevelopmentTrendRecord[];
  top_activity_parcels: DevelopmentHotspotRecord[];
  zoning_activity_summary: DevelopmentZoningRecord[];
};

const validation =
  developmentActivityStaticValidation as DevelopmentActivityValidation;

const annualTrend = validation.annual_trend_summary.filter(
  (record): record is DevelopmentTrendRecord & { activity_year: number } =>
    typeof record.activity_year === "number",
);

const monthlyTrend = validation.recent_monthly_trend_summary.filter(
  (
    record,
  ): record is DevelopmentTrendRecord & {
    activity_month: number;
    activity_year: number;
  } =>
    typeof record.activity_year === "number" &&
    typeof record.activity_month === "number",
);

const zoningSummary = validation.zoning_activity_summary;

const topActivityParcels = validation.top_activity_parcels;

const collator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .filter((value) => value !== "(unknown)")
    .sort((a, b) => collator.compare(a, b));
}

function formatTemporalLabel(value: string | null | undefined) {
  if (!value) {
    return "Unclassified";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function monthLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function overlapsDateRange(
  firstPermitDate: string | null | undefined,
  latestPermitDate: string | null | undefined,
  selectedDateRange: TemporalDateRange,
) {
  if (!selectedDateRange.start && !selectedDateRange.end) {
    return true;
  }

  const first = parseDate(firstPermitDate);
  const latest = parseDate(latestPermitDate);
  const start = parseDate(selectedDateRange.start);
  const end = parseDate(selectedDateRange.end);

  if (!first || !latest) {
    return false;
  }

  if (start && latest < start) {
    return false;
  }

  if (end && first > end) {
    return false;
  }

  return true;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function getFilteredTemporalRecords(filters: DevelopmentTemporalFilters) {
  const monthFiltered = Boolean(filters.selectedMonth);
  const baseRecords = monthFiltered ? monthlyTrend : annualTrend;

  return baseRecords.filter((record) => {
    if (
      filters.selectedYear &&
      record.activity_year !== filters.selectedYear
    ) {
      return false;
    }

    if (
      monthFiltered &&
      "activity_month" in record &&
      record.activity_month !== filters.selectedMonth
    ) {
      return false;
    }

    return overlapsDateRange(
      record.first_permit_date,
      record.latest_permit_date,
      filters.selectedDateRange,
    );
  });
}

function getFilteredZoningRecords(filters: DevelopmentTemporalFilters) {
  return zoningSummary.filter((record) => {
    if (
      filters.selectedZoningJurisdiction &&
      record.zoning_jurisdiction_name !== filters.selectedZoningJurisdiction
    ) {
      return false;
    }

    if (
      filters.selectedZoningCategory &&
      record.dominant_zoning_general_normalized !== filters.selectedZoningCategory
    ) {
      return false;
    }

    if (
      filters.selectedPermitType &&
      record.permit_type !== filters.selectedPermitType
    ) {
      return false;
    }

    return overlapsDateRange(
      record.first_permit_date,
      record.latest_permit_date,
      filters.selectedDateRange,
    );
  });
}

function buildWhereClauses(filters: DevelopmentTemporalFilters) {
  const whereClauses = ["1 = 1"];
  const quote = (value: string) => value.replace(/'/g, "''");

  if (filters.selectedYear) {
    whereClauses.push(`activity_year = ${filters.selectedYear}`);
  }

  if (filters.selectedMonth) {
    whereClauses.push(`activity_month = ${filters.selectedMonth}`);
  }

  if (filters.selectedPermitType) {
    whereClauses.push(`permit_type = '${quote(filters.selectedPermitType)}'`);
  }

  if (filters.selectedWorkType) {
    whereClauses.push(`work_type = '${quote(filters.selectedWorkType)}'`);
  }

  if (filters.selectedZoningJurisdiction) {
    whereClauses.push(
      `zoning_jurisdiction_name = '${quote(filters.selectedZoningJurisdiction)}'`,
    );
  }

  if (filters.selectedZoningCategory) {
    whereClauses.push(
      `dominant_zoning_general_normalized = '${quote(
        filters.selectedZoningCategory,
      )}'`,
    );
  }

  if (filters.selectedRollingWindow) {
    whereClauses.push(
      `activity_date >= (SELECT MAX(activity_date) FROM public.development_activity_time_summary) - interval '${filters.selectedRollingWindow} months'`,
    );
  }

  if (filters.selectedDateRange.start) {
    whereClauses.push(`activity_date >= '${filters.selectedDateRange.start}'`);
  }

  if (filters.selectedDateRange.end) {
    whereClauses.push(`activity_date <= '${filters.selectedDateRange.end}'`);
  }

  return whereClauses;
}

export const developmentTemporalIndex = {
  activityAnchorDate: validation.date_range.activity_anchor_date,
  activityClassMetadata: validation.activity_class_distribution.map(
    (record) => ({
      averageScore: record.avg_development_activity_score,
      className: record.development_activity_class,
      label: formatTemporalLabel(record.development_activity_class),
      parcelCount: record.parcel_count,
      percentage: record.parcel_percentage,
    }),
  ) satisfies ActivityClassMetadata[],
  availableMonths: monthlyTrend.map((record) => ({
    label: monthLabel(record.activity_year, record.activity_month),
    month: record.activity_month,
    year: record.activity_year,
  })) satisfies DevelopmentTemporalMonth[],
  availableYears: annualTrend.map((record) => record.activity_year),
  generatedAt: validation.generated_at,
  maxDate: validation.date_range.latest_permit_date,
  minDate: validation.date_range.first_permit_date,
  permitTotalsByMonth: monthlyTrend.map((record) => ({
    activeParcelCount: record.active_parcel_count,
    latestPermitDate: record.latest_permit_date,
    month: record.activity_month,
    permitCount: record.permit_count,
    year: record.activity_year,
  })) satisfies PermitTotalsByMonth[],
  permitTotalsByYear: annualTrend.map((record) => ({
    activeParcelCount: record.active_parcel_count,
    activeZoningJurisdictionCount: record.active_zoning_jurisdiction_count ?? 0,
    latestPermitDate: record.latest_permit_date,
    permitCount: record.permit_count,
    year: record.activity_year,
  })) satisfies PermitTotalsByYear[],
  permitTypes: uniqueSorted(zoningSummary.map((record) => record.permit_type)),
  sourceArtifacts: {
    monthSummaryCsv:
      "cfs-data-pipelines/outputs/development_activity_month_summary.csv",
    validationJson:
      "cfs-data-pipelines/outputs/development_activity_parcel_summary_validation.json",
    yearSummaryCsv:
      "cfs-data-pipelines/outputs/development_activity_year_summary.csv",
    zoningSummaryCsv:
      "cfs-data-pipelines/outputs/development_activity_zoning_summary.csv",
  },
  workTypes: uniqueSorted(
    topActivityParcels.map((record) => record.dominant_work_type),
  ),
  zoningCategories: uniqueSorted(
    zoningSummary.map((record) => record.dominant_zoning_general_normalized),
  ),
  zoningActivityByYear: annualTrend.map((record) => ({
    activeZoningJurisdictionCount: record.active_zoning_jurisdiction_count ?? 0,
    permitCount: record.permit_count,
    year: record.activity_year,
  })) satisfies ZoningActivityByYear[],
  zoningJurisdictions: uniqueSorted(
    zoningSummary.map((record) => record.zoning_jurisdiction_name),
  ),
  zoningSummary,
};

export const defaultTemporalDateRange: TemporalDateRange = {
  end: null,
  start: null,
};

export function getTemporalQueryResult(
  filters: DevelopmentTemporalFilters,
): TemporalQueryResult {
  const temporalRecords = getFilteredTemporalRecords(filters);
  const zoningRecords = getFilteredZoningRecords(filters);
  const activityClass = developmentTemporalIndex.activityClassMetadata.find(
    (record) => record.className === filters.selectedActivityClass,
  );

  const hasTemporalFilter = Boolean(
    filters.selectedYear ||
      filters.selectedMonth ||
      filters.selectedDateRange.start ||
      filters.selectedDateRange.end ||
      filters.selectedRollingWindow,
  );
  const hasDimensionFilter = Boolean(
    filters.selectedPermitType ||
      filters.selectedZoningJurisdiction ||
      filters.selectedZoningCategory ||
      filters.selectedWorkType,
  );

  const temporalPermitCount = sum(
    temporalRecords.map((record) => record.permit_count),
  );
  const temporalParcelCount = sum(
    temporalRecords.map((record) => record.active_parcel_count),
  );
  const zoningPermitCount = sum(
    zoningRecords.map((record) => record.permit_count),
  );
  const zoningParcelCount = sum(
    zoningRecords.map((record) => record.active_parcel_count),
  );

  const queryMode: TemporalQueryMode =
    hasTemporalFilter && (hasDimensionFilter || filters.selectedWorkType)
      ? "combined-preview"
      : hasDimensionFilter || filters.selectedWorkType
        ? "dimension-aggregate"
        : "temporal-aggregate";

  const matchingPermitCount =
    queryMode === "temporal-aggregate"
      ? temporalPermitCount
      : queryMode === "dimension-aggregate"
        ? zoningPermitCount
        : Math.min(temporalPermitCount || zoningPermitCount, zoningPermitCount);

  const matchingParcelCount = activityClass
    ? activityClass.parcelCount
    : queryMode === "temporal-aggregate"
      ? temporalParcelCount
      : queryMode === "dimension-aggregate"
        ? zoningParcelCount
        : Math.min(temporalParcelCount || zoningParcelCount, zoningParcelCount);

  const activeZoningJurisdictions = uniqueSorted(
    zoningRecords.map((record) => record.zoning_jurisdiction_name),
  );
  const activePermitCategories = uniqueSorted(
    zoningRecords.map((record) => record.permit_type),
  ).slice(0, 6);

  return {
    activePermitCategories,
    activeZoningJurisdictions,
    matchingParcelCount,
    matchingPermitCount,
    matchingZoningActivityCount: zoningRecords.length,
    queryMode,
    summaryNote:
      queryMode === "combined-preview"
        ? "Combined temporal and dimensional counts are preview estimates until the future API queries the full time summary table."
        : "Counts are resolved from generated static development activity summary artifacts.",
  };
}

export function getTemporalTrendSummary(
  filters: DevelopmentTemporalFilters,
): TemporalTrendSummary {
  const queryResult = getTemporalQueryResult(filters);
  const selectedYear = filters.selectedYear;
  const visibleYears = selectedYear
    ? annualTrend.filter((record) => record.activity_year <= selectedYear)
    : annualTrend;
  const latest = visibleYears.at(-1);
  const previous = visibleYears.at(-2);
  const latestYearPermitCount = latest?.permit_count ?? 0;
  const previousYearPermitCount = previous?.permit_count ?? 0;
  const delta = latestYearPermitCount - previousYearPermitCount;
  const trendDirection =
    Math.abs(delta) < 25 ? "flat" : delta > 0 ? "up" : "down";

  return {
    activePermitCategories: queryResult.activePermitCategories.slice(0, 4),
    activeZoningJurisdictions: queryResult.activeZoningJurisdictions.slice(
      0,
      4,
    ),
    latestYearPermitCount,
    previousYearPermitCount,
    trendDirection,
    trendLabel:
      trendDirection === "flat"
        ? "Stable"
        : trendDirection === "up"
          ? "Increasing"
          : "Cooling",
  };
}

export function buildTemporalQueryPreview(filters: DevelopmentTemporalFilters) {
  const whereClauses = buildWhereClauses(filters);
  const classComment = filters.selectedActivityClass
    ? [
        "-- Activity class filter resolves through public.development_activity_parcel_summary.",
        `-- selected_activity_class = '${filters.selectedActivityClass.replace(/'/g, "''")}'`,
      ]
    : [];
  const sqlLines = [
    ...classComment,
    "SELECT *",
    "FROM public.development_activity_time_summary",
    "WHERE " + whereClauses.join("\n  AND "),
    "ORDER BY activity_year DESC, activity_month DESC",
    "LIMIT 250;",
  ];

  return sqlLines.join("\n");
}
