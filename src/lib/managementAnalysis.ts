import type { ManagementSection } from "@/types";

export type ManagementPeriodPreset = "past-3-months" | "past-12-months" | "past-3-years" | "past-5-years" | "all" | "custom";
export interface ManagementAnalysisPeriod {
  initialized: boolean;
  startDate: string | null;
  endDate: string | null;
  preset: ManagementPeriodPreset | null;
  label: string;
}
export interface ManagementDataCoverage { startDate: string; endDate: string }
export type ManagementFocus =
  | "permit-activity"
  | "active-development-parcels"
  | "flood-review"
  | "school-growth"
  | "economic-review"
  | "elevated-signals";

export const emptyManagementAnalysisPeriod: ManagementAnalysisPeriod = {
  endDate: null, initialized: false, label: "Choose an analysis period", preset: null, startDate: null,
};

export const managementKpis = {
  permitActivity: { focus: "permit-activity", label: "Permit Activity", periodSensitive: true, section: "planning-insights" },
  activeParcels: { focus: "active-development-parcels", label: "Active Development Parcels", periodSensitive: true, section: "planning-insights" },
  floodReview: { focus: "flood-review", label: "Flood Review", periodSensitive: false, section: "planning-insights" },
  schoolGrowth: { focus: "school-growth", label: "School Assignment & Growth Context", periodSensitive: false, section: "planning-insights" },
  economicReview: { focus: "economic-review", label: "Parcels Flagged for Economic Review", periodSensitive: false, section: "economic-insights" },
  elevatedSignals: { focus: "elevated-signals", label: "Parcels With Elevated Historical Signals", periodSensitive: false, section: "development-signals" },
} as const satisfies Record<string, { focus: ManagementFocus; label: string; periodSensitive: boolean; section: ManagementSection }>;

export function createManagementPeriod(preset: ManagementPeriodPreset, coverage: ManagementDataCoverage, custom?: { startYear: number; endYear: number }): ManagementAnalysisPeriod {
  const latest = parseDate(coverage.endDate);
  let startDate = coverage.startDate;
  let endDate = coverage.endDate;
  if (preset === "past-3-months" || preset === "past-12-months") {
    const months = preset === "past-3-months" ? 3 : 12;
    startDate = isoDate(new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - months + 1, 1)));
  } else if (preset === "past-3-years" || preset === "past-5-years") {
    const years = preset === "past-3-years" ? 3 : 5;
    startDate = `${latest.getUTCFullYear() - years + 1}-01-01`;
  } else if (preset === "custom" && custom) {
    startDate = custom.startYear === yearOf(coverage.startDate) ? coverage.startDate : `${custom.startYear}-01-01`;
    endDate = custom.endYear === yearOf(coverage.endDate) ? coverage.endDate : `${custom.endYear}-12-31`;
  }
  startDate = startDate < coverage.startDate ? coverage.startDate : startDate;
  endDate = endDate > coverage.endDate ? coverage.endDate : endDate;
  return { endDate, initialized: true, label: formatManagementPeriodLabel(startDate, endDate), preset, startDate };
}

export function isManagementPeriodWithinCoverage(period: ManagementAnalysisPeriod, coverage: ManagementDataCoverage) {
  return Boolean(period.initialized && period.startDate && period.endDate && period.startDate <= period.endDate && period.startDate >= coverage.startDate && period.endDate <= coverage.endDate);
}

export function readManagementPeriodFromSearch(search: string): ManagementAnalysisPeriod | null {
  const params = new URLSearchParams(search);
  const startDate = params.get("from");
  const endDate = params.get("to");
  const preset = params.get("range") as ManagementPeriodPreset | null;
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || !isPreset(preset) || startDate > endDate) return null;
  return { endDate, initialized: true, label: formatManagementPeriodLabel(startDate, endDate), preset, startDate };
}

export function managementPeriodQuery(period: ManagementAnalysisPeriod) {
  const params = new URLSearchParams();
  if (period.startDate) params.set("from", period.startDate);
  if (period.endDate) params.set("to", period.endDate);
  if (period.preset) params.set("range", period.preset);
  return params;
}

export function managementDetailUrl(section: ManagementSection, focus: ManagementFocus, period: ManagementAnalysisPeriod) {
  const params = managementPeriodQuery(period);
  params.set("app", "management"); params.set("section", section); params.set("focus", focus);
  return `/?${params.toString()}`;
}

export function formatManagementPeriodLabel(startDate: string, endDate: string) {
  const format = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC", year: "numeric" });
  return `${format.format(parseDate(startDate))}–${format.format(parseDate(endDate))}`;
}

function isPreset(value: string | null): value is ManagementPeriodPreset {
  return ["past-3-months", "past-12-months", "past-3-years", "past-5-years", "all", "custom"].includes(value ?? "");
}
function isIsoDate(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))); }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function yearOf(value: string) { return Number(value.slice(0, 4)); }
