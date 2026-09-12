import type { ManagementSection } from "@/types";

export type ManagementPeriodId = "all" | "2023-2025";
export type ManagementFocus =
  | "permit-activity"
  | "active-development-parcels"
  | "flood-review"
  | "school-growth"
  | "economic-review"
  | "elevated-signals";

export const managementPeriods = [
  { endYear: null, id: "all", label: "All available (1986–2025)", startYear: null },
  { endYear: 2025, id: "2023-2025", label: "Last 3 years (2023–2025)", startYear: 2023 },
] as const;

export const managementKpis = {
  permitActivity: { focus: "permit-activity", label: "Permit Activity", periodSensitive: true, section: "planning-insights" },
  activeParcels: { focus: "active-development-parcels", label: "Active Development Parcels", periodSensitive: true, section: "planning-insights" },
  floodReview: { focus: "flood-review", label: "Flood Review", periodSensitive: false, section: "planning-insights" },
  schoolGrowth: { focus: "school-growth", label: "School Assignment & Growth Context", periodSensitive: false, section: "planning-insights" },
  economicReview: { focus: "economic-review", label: "Parcels Flagged for Economic Review", periodSensitive: false, section: "economic-insights" },
  elevatedSignals: { focus: "elevated-signals", label: "Parcels With Elevated Historical Signals", periodSensitive: false, section: "development-signals" },
} as const satisfies Record<string, { focus: ManagementFocus; label: string; periodSensitive: boolean; section: ManagementSection }>;

export function getManagementPeriod(id: string | null | undefined) {
  return managementPeriods.find((period) => period.id === id) ?? managementPeriods[0];
}

export function managementPeriodId(startYear: number | null, endYear: number | null): ManagementPeriodId {
  return startYear === 2023 && endYear === 2025 ? "2023-2025" : "all";
}

export function managementDetailUrl(section: ManagementSection, focus: ManagementFocus, period: ManagementPeriodId) {
  return `/?app=management&section=${section}&focus=${focus}&period=${period}`;
}
