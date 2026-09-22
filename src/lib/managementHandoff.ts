import type { ManagementSection, OverviewCommandMode } from "@/types";
import type { ManagementAnalysisPeriod } from "@/lib/managementAnalysis";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";
import type { SelectedDevelopmentHotspotContext } from "@/types/map/developmentHotspots";

export type ManagementHandoffInsight =
  | "development-signal"
  | "economic-insights"
  | "overview-constraints"
  | "overview-development-signals"
  | "overview-economics"
  | "overview-planning-attention"
  | "planning-constraints"
  | "planning-hotspot";

export interface ManagementHandoffContext {
  activeLayerIds?: string[];
  analysisPeriod?: ManagementAnalysisPeriod;
  economicScenarioId?: string;
  filter?: Record<string, string>;
  fitExtent?: "countywide" | "results" | "selection";
  planningMode?: OverviewCommandMode;
  primaryResult?: "features" | "records";
  resultLabel?: string;
  selectionType?: "area" | "parcel-population" | "signal-band" | "hotspot";
  selectionValue?: string;
  selectedHotspotContext?: SelectedDevelopmentHotspotContext;
  selectedHotspotId?: string;
  selectedParcelId?: string;
  selectedSignalContext?: ModelResearchPreviewMarker;
  selectedSignalId?: string;
  sourceInsightType: ManagementHandoffInsight;
  sourceManagementPage: ManagementSection;
  targetWorkspace: "economics" | "planning";
}

export type ManagementKpiHandoffId =
  | "activeDevelopmentParcels"
  | "economicReview"
  | "elevatedSignals"
  | "floodHighSevere"
  | "floodReview"
  | "highSignals"
  | "hotspot"
  | "permitActivity"
  | "veryHighSignals";

type ManagementKpiHandoffDefinition = Omit<
  ManagementHandoffContext,
  "analysisPeriod" | "sourceManagementPage"
> & {
  label: string;
  meaning: string;
};

export const managementKpiHandoffs = {
  permitActivity: {
    activeLayerIds: ["permit-activity"],
    filter: { population: "permit_activity" },
    label: "Permit Activity",
    meaning: "Observed permit records in the selected Management analysis period.",
    primaryResult: "records",
    resultLabel: "permit records",
    selectionType: "parcel-population",
    selectionValue: "permit_activity",
    sourceInsightType: "overview-planning-attention",
    targetWorkspace: "planning",
  },
  activeDevelopmentParcels: {
    activeLayerIds: ["permit-activity", "development-hotspots"],
    filter: { population: "active_development_parcels" },
    label: "Active Development Parcels",
    meaning: "Unique parcels matched to observed permit records in the selected Management analysis period.",
    primaryResult: "features",
    resultLabel: "active development parcels",
    selectionType: "parcel-population",
    selectionValue: "active_development_parcels",
    sourceInsightType: "overview-planning-attention",
    targetWorkspace: "planning",
  },
  hotspot: {
    planningMode: "countywide",
    label: "Development Area",
    meaning: "Observed permit records for the selected ranked development area.",
    primaryResult: "records",
    resultLabel: "permit records",
    selectionType: "hotspot",
    sourceInsightType: "planning-hotspot",
    targetWorkspace: "planning",
  },
  floodReview: {
    activeLayerIds: ["flood-risk", "fema-flood-zones"],
    filter: { population: "flood_review" },
    label: "Flood Review",
    meaning: "Parcels requiring FEMA floodplain review context.",
    primaryResult: "features",
    resultLabel: "flood-review parcels",
    selectionType: "parcel-population",
    selectionValue: "flood_review",
    sourceInsightType: "overview-constraints",
    targetWorkspace: "planning",
  },
  floodHighSevere: {
    activeLayerIds: ["flood-risk", "fema-flood-zones"],
    filter: { population: "flood_high_severe" },
    label: "High / Severe Flood Review",
    meaning: "Flood-review parcels with High or Severe buildability impact.",
    primaryResult: "features",
    resultLabel: "high/severe flood-review parcels",
    selectionType: "parcel-population",
    selectionValue: "flood_high_severe",
    sourceInsightType: "planning-constraints",
    targetWorkspace: "planning",
  },
  elevatedSignals: {
    activeLayerIds: ["development-signals"],
    filter: { signalBand: "high,very_high" },
    label: "Parcels With Elevated Historical Signals",
    meaning: "Parcels in the High and Very High Development Signals bands.",
    planningMode: "modelLab",
    primaryResult: "features",
    resultLabel: "parcels with elevated development signals",
    selectionType: "signal-band",
    selectionValue: "high,very_high",
    sourceInsightType: "overview-development-signals",
    targetWorkspace: "planning",
  },
  veryHighSignals: {
    activeLayerIds: ["development-signals"],
    filter: { signalBand: "very_high" },
    label: "Very High Development Signals",
    meaning: "Parcels in the Very High Development Signals band.",
    planningMode: "modelLab",
    primaryResult: "features",
    resultLabel: "Very High development-signal parcels",
    selectionType: "signal-band",
    selectionValue: "very_high",
    sourceInsightType: "overview-development-signals",
    targetWorkspace: "planning",
  },
  highSignals: {
    activeLayerIds: ["development-signals"],
    filter: { signalBand: "high" },
    label: "High Development Signals",
    meaning: "Parcels in the High Development Signals band.",
    planningMode: "modelLab",
    primaryResult: "features",
    resultLabel: "High development-signal parcels",
    selectionType: "signal-band",
    selectionValue: "high",
    sourceInsightType: "overview-development-signals",
    targetWorkspace: "planning",
  },
  economicReview: {
    filter: { economicStatus: "high_opportunity" },
    label: "Parcels Flagged for Economic Review",
    meaning: "Parcels meeting the current high-opportunity economic screening criteria.",
    primaryResult: "features",
    resultLabel: "parcels flagged for economic review",
    sourceInsightType: "economic-insights",
    targetWorkspace: "economics",
  },
} as const satisfies Record<ManagementKpiHandoffId, ManagementKpiHandoffDefinition>;

export function createManagementKpiHandoff(
  id: ManagementKpiHandoffId,
  analysisPeriod: ManagementAnalysisPeriod,
  sourceManagementPage: ManagementSection,
  overrides: Partial<ManagementHandoffContext> = {},
): ManagementHandoffContext {
  const { label: _label, meaning: _meaning, ...definition } = managementKpiHandoffs[id];
  return { ...definition, ...overrides, analysisPeriod, sourceManagementPage };
}

const stateKey = "cfsManagementHandoff";
const managementSections = new Set<ManagementSection>([
  "development-signals",
  "economic-insights",
  "overview",
  "planning-insights",
]);
const insightTypes = new Set<ManagementHandoffInsight>([
  "development-signal",
  "economic-insights",
  "overview-constraints",
  "overview-development-signals",
  "overview-economics",
  "overview-planning-attention",
  "planning-constraints",
  "planning-hotspot",
]);

export function createManagementHandoffUrl(context: ManagementHandoffContext) {
  const params = new URLSearchParams({
    app: context.targetWorkspace,
    from: "management",
    insight: context.sourceInsightType,
    managementPage: context.sourceManagementPage,
  });
  if (context.selectedParcelId) params.set("parcel", context.selectedParcelId);
  if (context.selectedHotspotId) params.set("hotspot", context.selectedHotspotId);
  if (context.selectedSignalId) params.set("signal", context.selectedSignalId);
  if (context.economicScenarioId) params.set("economicScenario", context.economicScenarioId);
  if (context.activeLayerIds?.length) params.set("layers", context.activeLayerIds.join(","));
  if (context.analysisPeriod?.startDate) params.set("periodFrom", context.analysisPeriod.startDate);
  if (context.analysisPeriod?.endDate) params.set("periodTo", context.analysisPeriod.endDate);
  if (context.analysisPeriod?.preset) params.set("periodRange", context.analysisPeriod.preset);
  if (context.selectionType) params.set("selection", context.selectionType);
  if (context.selectionValue) params.set("selectionValue", context.selectionValue);
  if (context.fitExtent) params.set("fit", context.fitExtent);
  if (context.filter && Object.keys(context.filter).length) params.set("filter", JSON.stringify(context.filter));
  return `/?${params.toString()}`;
}

export function navigateManagementHandoff(context: ManagementHandoffContext) {
  const previousState = isRecord(window.history.state) ? window.history.state : {};
  window.history.pushState(
    { ...previousState, [stateKey]: context },
    "",
    createManagementHandoffUrl(context),
  );
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

export function readManagementHandoff(
  state: unknown,
  search: string | URLSearchParams,
): ManagementHandoffContext | null {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  if (params.get("from") !== "management" || !isRecord(state)) return null;
  const candidate = state[stateKey];
  if (!isRecord(candidate)) return null;
  const targetWorkspace = candidate.targetWorkspace;
  const sourceManagementPage = candidate.sourceManagementPage;
  const sourceInsightType = candidate.sourceInsightType;
  if (
    (targetWorkspace !== "planning" && targetWorkspace !== "economics") ||
    !managementSections.has(sourceManagementPage as ManagementSection) ||
    !insightTypes.has(sourceInsightType as ManagementHandoffInsight) ||
    params.get("app") !== targetWorkspace ||
    params.get("managementPage") !== sourceManagementPage ||
    params.get("insight") !== sourceInsightType
  ) return null;
  if (!matchingOptionalId(params, "parcel", candidate.selectedParcelId)) return null;
  if (!matchingOptionalId(params, "hotspot", candidate.selectedHotspotId)) return null;
  if (!matchingOptionalId(params, "signal", candidate.selectedSignalId)) return null;
  if (
    candidate.selectedHotspotId &&
    (!isRecord(candidate.selectedHotspotContext) ||
      candidate.selectedHotspotContext.officialParcelId !== candidate.selectedHotspotId)
  ) return null;
  if (
    candidate.selectedSignalId &&
    (!isRecord(candidate.selectedSignalContext) ||
      candidate.selectedSignalContext.officialParcelId !== candidate.selectedSignalId)
  ) return null;
  return candidate as unknown as ManagementHandoffContext;
}

export function hasUnresolvedManagementTarget(search: string | URLSearchParams) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return params.get("from") === "management" && Boolean(params.get("hotspot") || params.get("signal"));
}

function matchingOptionalId(params: URLSearchParams, key: string, value: unknown) {
  const urlValue = params.get(key);
  return urlValue === null ? value === undefined : typeof value === "string" && value === urlValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
