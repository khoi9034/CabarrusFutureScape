import type { ManagementSection, OverviewCommandMode } from "@/types";
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
  economicScenarioId?: string;
  planningMode?: OverviewCommandMode;
  selectedHotspotContext?: SelectedDevelopmentHotspotContext;
  selectedHotspotId?: string;
  selectedParcelId?: string;
  selectedSignalContext?: ModelResearchPreviewMarker;
  selectedSignalId?: string;
  sourceInsightType: ManagementHandoffInsight;
  sourceManagementPage: ManagementSection;
  targetWorkspace: "economics" | "planning";
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
