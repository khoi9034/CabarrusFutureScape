import { apiGet, apiPost, buildApiUrl, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  addDemoInvestmentEngagementShortlistItem,
  addDemoInvestmentOpportunityToIntake,
  archiveDemoInvestmentCaseStudy,
  calculateDemoInvestmentUnderwriting,
  compareDemoInvestmentIntakeCandidates,
  compareDemoInvestmentUnderwritingScenarios,
  createDemoInvestmentEngagement,
  createDemoInvestmentIntakeCandidate,
  createDemoInvestmentSavedItem,
  createDemoInvestmentSavedSearch,
  createDemoInvestmentUnderwritingScenario,
  deleteDemoInvestmentIntakeCandidate,
  deleteDemoInvestmentSavedItem,
  deleteDemoInvestmentUnderwritingScenario,
  duplicateDemoInvestmentCaseStudy,
  exportDemoInvestmentCaseStudyCodexBrief,
  generateDemoInvestmentReport,
  getDemoInvestmentAreaRadar,
  getDemoInvestmentCaseStudies,
  getDemoInvestmentEngagements,
  getDemoInvestmentIntake,
  getDemoInvestmentIntakeAnalysis,
  getDemoInvestmentOpportunities,
  getDemoInvestmentOpportunitySources,
  getDemoInvestmentRecentWork,
  getDemoInvestmentResearchContext,
  getDemoInvestmentSavedItems,
  getDemoInvestmentSavedSearches,
  getDemoInvestmentScreen,
  getDemoInvestmentUnderwritingScenarios,
  getDemoInvestmentUnderwritingTemplates,
  importDemoInvestmentIntakeCsv,
  prefillDemoInvestmentUnderwriting,
  recordDemoInvestmentRecentWork,
  updateDemoInvestmentCaseStudy,
  updateDemoInvestmentIntakeCandidate,
  updateDemoInvestmentSavedItem,
  updateDemoInvestmentUnderwritingScenario,
} from "@/lib/demo-data/investment";
import type {
  InvestmentCsvImportResponse,
  InvestmentAreaRadarResponse,
  InvestmentCaseStudy,
  InvestmentCaseStudyBriefResponse,
  InvestmentCaseStudyListResponse,
  InvestmentEngagement,
  InvestmentEngagementListResponse,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCompareResponse,
  InvestmentIntakeListResponse,
  InvestmentIntakePayload,
  InvestmentOpportunityListResponse,
  InvestmentOpportunitySource,
  InvestmentRecentWorkResponse,
  InvestmentReportResponse,
  InvestmentResearchContext,
  InvestmentSavedItem,
  InvestmentSavedItemListResponse,
  InvestmentSavedItemStatus,
  InvestmentSavedItemType,
  InvestmentSavedSearch,
  InvestmentSavedSearchListResponse,
  InvestmentScreenResponse,
  InvestmentStrategyId,
  InvestmentUnderwritingCalculation,
  InvestmentUnderwritingCompareResponse,
  InvestmentUnderwritingListResponse,
  InvestmentUnderwritingPrefillResponse,
  InvestmentUnderwritingScenario,
  InvestmentUnderwritingScenarioStatus,
  InvestmentUnderwritingTemplate,
  InvestmentUnderwritingScenarioType,
} from "@/types/api";

export async function getInvestmentScreen(strategy: InvestmentStrategyId) {
  if (USE_DEMO_DATA) {
    return getDemoInvestmentScreen(strategy);
  }

  assertLive();
  return apiPost<InvestmentScreenResponse>(
    "/investment/screen",
    { limit: 120, strategy },
    { timeoutMs: 20000 },
  );
}

export async function getInvestmentIntake() {
  if (isDemoInvestmentMode()) return getDemoInvestmentIntake();
  assertLive();
  return apiGet<InvestmentIntakeListResponse>("/investment/intake", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentIntakeCandidate(payload: InvestmentIntakePayload) {
  if (isDemoInvestmentMode()) return createDemoInvestmentIntakeCandidate(payload);
  assertLive();
  return apiPost<InvestmentIntakeAnalysisResponse>("/investment/intake", payload, { timeoutMs: 20000 });
}

export async function importInvestmentIntakeCsv(csvText: string) {
  if (isDemoInvestmentMode()) return importDemoInvestmentIntakeCsv(csvText);
  assertLive();
  return apiPost<InvestmentCsvImportResponse>("/investment/intake/import", { csv_text: csvText }, { timeoutMs: 20000 });
}

export async function getInvestmentIntakeAnalysis(candidateId: string) {
  if (isDemoInvestmentMode()) return getDemoInvestmentIntakeAnalysis(candidateId);
  assertLive();
  return apiGet<InvestmentIntakeAnalysisResponse>(`/investment/intake/${candidateId}/analysis`, undefined, { timeoutMs: 20000 });
}

export async function updateInvestmentIntakeCandidate(candidateId: string, payload: Partial<InvestmentIntakePayload>) {
  if (isDemoInvestmentMode()) return updateDemoInvestmentIntakeCandidate(candidateId, payload);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/intake/${candidateId}`), {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  if (!response.ok) throw new Error("Unable to update investment intake candidate.");
  return response.json() as Promise<InvestmentIntakeAnalysisResponse>;
}

export async function compareInvestmentIntakeCandidates(candidateIds: string[]) {
  if (isDemoInvestmentMode()) return compareDemoInvestmentIntakeCandidates(candidateIds);
  assertLive();
  return apiPost<InvestmentIntakeCompareResponse>("/investment/intake/compare", { candidate_ids: candidateIds }, { timeoutMs: 20000 });
}

export async function deleteInvestmentIntakeCandidate(candidateId: string) {
  if (isDemoInvestmentMode()) return deleteDemoInvestmentIntakeCandidate(candidateId);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/intake/${candidateId}`), {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to delete investment intake candidate.");
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function getInvestmentResearchContext(parcelId: string, strategy: InvestmentStrategyId) {
  if (isDemoInvestmentMode()) return getDemoInvestmentResearchContext(parcelId, strategy);
  assertLive();
  return apiGet<InvestmentResearchContext>(`/investment/research-context/${encodeURIComponent(parcelId)}?strategy=${strategy}`, undefined, { timeoutMs: 20000 });
}

export async function getInvestmentIntakeResearchContext(candidateId: string) {
  if (isDemoInvestmentMode()) return getDemoInvestmentIntakeAnalysis(candidateId) as unknown as InvestmentResearchContext;
  assertLive();
  return apiGet<InvestmentResearchContext>(`/investment/intake/${encodeURIComponent(candidateId)}/research-context`, undefined, { timeoutMs: 20000 });
}

export async function generateInvestmentReport(payload: {
  candidate_id?: string | null;
  parcel_id?: string | null;
  report_type: string;
  selected_sections?: string[];
  strategy?: InvestmentStrategyId;
  user_notes?: string | null;
}) {
  if (isDemoInvestmentMode()) return generateDemoInvestmentReport(payload);
  assertLive();
  return apiPost<InvestmentReportResponse>("/investment/reports/generate", payload, { timeoutMs: 20000 });
}

export async function getInvestmentUnderwritingScenarios() {
  if (isDemoInvestmentMode()) return getDemoInvestmentUnderwritingScenarios();
  assertLive();
  return apiGet<InvestmentUnderwritingListResponse>("/investment/underwriting/scenarios", undefined, { timeoutMs: 20000 });
}

export async function calculateInvestmentUnderwriting(payload: {
  assumptions: Record<string, number | string | null>;
  candidate_id?: string | null;
  parcel_id?: string | null;
  scenario_name: string;
  scenario_type: InvestmentUnderwritingScenarioType;
  strategy?: InvestmentStrategyId;
}) {
  if (isDemoInvestmentMode()) return calculateDemoInvestmentUnderwriting(payload);
  assertLive();
  return apiPost<InvestmentUnderwritingCalculation>("/investment/underwriting/calculate", payload, { timeoutMs: 20000 });
}

export async function createInvestmentUnderwritingScenario(payload: {
  assumptions: Record<string, number | string | null>;
  candidate_id?: string | null;
  parcel_id?: string | null;
  private_notes?: string | null;
  scenario_name: string;
  scenario_status?: InvestmentUnderwritingScenarioStatus;
  scenario_type: InvestmentUnderwritingScenarioType;
  strategy?: InvestmentStrategyId;
}) {
  if (isDemoInvestmentMode()) return createDemoInvestmentUnderwritingScenario(payload);
  assertLive();
  return apiPost<InvestmentUnderwritingScenario>("/investment/underwriting/scenarios", payload, { timeoutMs: 20000 });
}

export async function updateInvestmentUnderwritingScenario(scenarioId: string, payload: Partial<{
  assumptions: Record<string, number | string | null>;
  candidate_id: string | null;
  parcel_id: string | null;
  private_notes: string | null;
  scenario_name: string;
  scenario_status: InvestmentUnderwritingScenarioStatus;
  scenario_type: InvestmentUnderwritingScenarioType;
  strategy: InvestmentStrategyId;
}>) {
  if (isDemoInvestmentMode()) return updateDemoInvestmentUnderwritingScenario(scenarioId, payload as Partial<InvestmentUnderwritingScenario>);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/underwriting/scenarios/${scenarioId}`), {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  if (!response.ok) throw new Error("Unable to update underwriting scenario.");
  return response.json() as Promise<InvestmentUnderwritingScenario>;
}

export async function deleteInvestmentUnderwritingScenario(scenarioId: string) {
  if (isDemoInvestmentMode()) return deleteDemoInvestmentUnderwritingScenario(scenarioId);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/underwriting/scenarios/${scenarioId}`), {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to delete underwriting scenario.");
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function compareInvestmentUnderwritingScenarios(scenarioIds: string[]) {
  if (isDemoInvestmentMode()) return compareDemoInvestmentUnderwritingScenarios(scenarioIds);
  assertLive();
  return apiPost<InvestmentUnderwritingCompareResponse>("/investment/underwriting/compare", { scenario_ids: scenarioIds }, { timeoutMs: 20000 });
}

export async function getInvestmentOpportunitySources() {
  if (isDemoInvestmentMode()) return getDemoInvestmentOpportunitySources();
  assertLive();
  return apiGet<{ sources: InvestmentOpportunitySource[] }>("/investment/opportunities/sources", undefined, { timeoutMs: 20000 });
}

export async function getInvestmentOpportunities() {
  if (isDemoInvestmentMode()) return getDemoInvestmentOpportunities();
  assertLive();
  return apiGet<InvestmentOpportunityListResponse>("/investment/opportunities", undefined, { timeoutMs: 30000 });
}

export async function matchInvestmentOpportunity(opportunityId: string, parcelId?: string | null) {
  if (isDemoInvestmentMode()) return { opportunity_id: opportunityId, parcel_id: parcelId ?? null, parcel_match_status: parcelId ? "Parcel supplied in session demo" : "Manual Verification Required" };
  assertLive();
  return apiPost<Record<string, unknown>>(`/investment/opportunities/${encodeURIComponent(opportunityId)}/match`, { parcel_id: parcelId ?? null }, { timeoutMs: 20000 });
}

export async function addInvestmentOpportunityToIntake(opportunityId: string, strategy: InvestmentStrategyId) {
  if (isDemoInvestmentMode()) return addDemoInvestmentOpportunityToIntake(opportunityId, strategy);
  assertLive();
  return apiPost<InvestmentIntakeAnalysisResponse>(`/investment/opportunities/${encodeURIComponent(opportunityId)}/intake`, { strategy }, { timeoutMs: 30000 });
}

export async function searchInvestmentRadar(strategy = "industrial_site") {
  if (isDemoInvestmentMode()) return getDemoInvestmentAreaRadar(strategy as InvestmentStrategyId);
  assertLive();
  return apiPost<InvestmentAreaRadarResponse>(`/investment/radar/search?strategy=${encodeURIComponent(strategy)}`, {}, { timeoutMs: 30000 });
}

export async function getInvestmentEngagements() {
  if (isDemoInvestmentMode()) return getDemoInvestmentEngagements();
  assertLive();
  return apiGet<InvestmentEngagementListResponse>("/investment/engagements", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentEngagement(payload: Record<string, unknown>) {
  if (isDemoInvestmentMode()) return createDemoInvestmentEngagement(payload);
  assertLive();
  return apiPost<InvestmentEngagement>("/investment/engagements", payload, { timeoutMs: 20000 });
}

export async function addInvestmentEngagementShortlistItem(engagementId: string, payload: Record<string, unknown>) {
  if (isDemoInvestmentMode()) return addDemoInvestmentEngagementShortlistItem();
  assertLive();
  return apiPost<InvestmentEngagement>(`/investment/engagements/${encodeURIComponent(engagementId)}/shortlist`, payload, { timeoutMs: 20000 });
}

export async function generateInvestmentEngagementReport(engagementId: string) {
  if (isDemoInvestmentMode()) return generateDemoInvestmentReport({ report_type: "engagement_summary", strategy: "development_land" });
  assertLive();
  return apiPost<InvestmentReportResponse>(`/investment/engagements/${encodeURIComponent(engagementId)}/report`, {}, { timeoutMs: 20000 });
}

export async function getInvestmentUnderwritingTemplates() {
  if (isDemoInvestmentMode()) return getDemoInvestmentUnderwritingTemplates();
  assertLive();
  return apiGet<{ templates: InvestmentUnderwritingTemplate[] }>("/investment/underwriting/templates", undefined, { timeoutMs: 20000 });
}

export async function prefillInvestmentUnderwriting(payload: {
  candidate_id?: string | null;
  existing_assumptions?: Record<string, number | string | null>;
  opportunity_id?: string | null;
  parcel_id?: string | null;
  scenario_type: InvestmentUnderwritingScenarioType;
  strategy?: InvestmentStrategyId;
  template_id?: string | null;
}) {
  if (isDemoInvestmentMode()) return prefillDemoInvestmentUnderwriting(payload);
  assertLive();
  return apiPost<InvestmentUnderwritingPrefillResponse>("/investment/underwriting/prefill", payload, { timeoutMs: 30000 });
}

export async function getInvestmentSavedItems() {
  if (isDemoInvestmentMode()) return getDemoInvestmentSavedItems();
  assertLive();
  return apiGet<InvestmentSavedItemListResponse>("/investment/saved-items", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentSavedItem(payload: {
  area_id?: string | null;
  candidate_id?: string | null;
  engagement_id?: string | null;
  item_reference_id: string;
  item_type: InvestmentSavedItemType;
  label: string;
  opportunity_id?: string | null;
  parcel_id?: string | null;
  private_notes?: string | null;
  scenario_id?: string | null;
  status?: InvestmentSavedItemStatus;
  strategy?: InvestmentStrategyId | null;
  summary?: string | null;
}) {
  if (isDemoInvestmentMode()) return createDemoInvestmentSavedItem(payload);
  assertLive();
  return apiPost<InvestmentSavedItem>("/investment/saved-items", payload, { timeoutMs: 20000 });
}

export async function updateInvestmentSavedItem(itemId: string, payload: Partial<Pick<InvestmentSavedItem, "label" | "private_notes" | "status" | "summary">>) {
  if (isDemoInvestmentMode()) return updateDemoInvestmentSavedItem(itemId, payload);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/saved-items/${encodeURIComponent(itemId)}`), {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  if (!response.ok) throw new Error("Unable to update saved CFS Investment item.");
  return response.json() as Promise<InvestmentSavedItem>;
}

export async function deleteInvestmentSavedItem(itemId: string) {
  if (isDemoInvestmentMode()) return deleteDemoInvestmentSavedItem(itemId);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/saved-items/${encodeURIComponent(itemId)}`), {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to remove saved CFS Investment item.");
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function getInvestmentRecentWork() {
  if (isDemoInvestmentMode()) return getDemoInvestmentRecentWork();
  assertLive();
  return apiGet<InvestmentRecentWorkResponse>("/investment/recent-work", undefined, { timeoutMs: 20000 });
}

export async function recordInvestmentRecentWork(payload: {
  activity_type: string;
  context?: Record<string, unknown>;
  label: string;
  page: string;
  parcel_id?: string | null;
  reference_id?: string | null;
  reference_type: string;
  strategy?: InvestmentStrategyId | null;
  summary?: string | null;
}) {
  if (isDemoInvestmentMode()) return recordDemoInvestmentRecentWork(payload);
  assertLive();
  return apiPost<InvestmentRecentWorkResponse>("/investment/recent-work", payload, {
    keepalive: true,
    timeoutMs: 20000,
  });
}

export async function getInvestmentSavedSearches() {
  if (isDemoInvestmentMode()) return getDemoInvestmentSavedSearches();
  assertLive();
  return apiGet<InvestmentSavedSearchListResponse>("/investment/saved-searches", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentSavedSearch(payload: {
  advanced_criteria?: Record<string, unknown>;
  essential_criteria?: Record<string, unknown>;
  goal: string;
  guided_or_advanced?: "advanced" | "guided";
  location_type?: string;
  location_value?: string | null;
  result_summary?: Record<string, unknown>;
  search_name: string;
}) {
  if (isDemoInvestmentMode()) return createDemoInvestmentSavedSearch(payload);
  assertLive();
  return apiPost<InvestmentSavedSearch>("/investment/saved-searches", payload, { timeoutMs: 20000 });
}

export async function rerunInvestmentSavedSearch(searchId: string) {
  if (isDemoInvestmentMode()) return { search_id: searchId, rerun: true, mode: "portfolio_demo" };
  assertLive();
  return apiPost<Record<string, unknown>>(`/investment/saved-searches/${encodeURIComponent(searchId)}/rerun`, {}, { timeoutMs: 30000 });
}

export async function convertInvestmentSavedSearchToEngagement(searchId: string) {
  if (isDemoInvestmentMode()) return { engagement: createDemoInvestmentEngagement({ engagement_name: "Session demo engagement", selected_strategy: "development_land" }), saved_search: getDemoInvestmentSavedSearches().searches.find((item) => item.id === searchId) ?? getDemoInvestmentSavedSearches().searches[0] };
  assertLive();
  return apiPost<{ engagement: InvestmentEngagement; saved_search: InvestmentSavedSearch }>(`/investment/saved-searches/${encodeURIComponent(searchId)}/engagement`, {}, { timeoutMs: 20000 });
}

export async function getInvestmentCaseStudies() {
  if (isDemoInvestmentMode()) return getDemoInvestmentCaseStudies();
  assertLive();
  return apiGet<InvestmentCaseStudyListResponse>("/investment/case-studies", undefined, { timeoutMs: 20000 });
}

export async function updateInvestmentCaseStudy(slug: string, payload: {
  active_parcel_id?: string | null;
  analyst_note?: string | null;
  current_stage?: string | null;
  status?: string | null;
}) {
  if (isDemoInvestmentMode()) return updateDemoInvestmentCaseStudy(slug, payload);
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/case-studies/${encodeURIComponent(slug)}`), {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  if (!response.ok) throw new Error("Unable to update investment case study.");
  return response.json() as Promise<InvestmentCaseStudy>;
}

export async function duplicateInvestmentCaseStudy(slug: string) {
  if (isDemoInvestmentMode()) return duplicateDemoInvestmentCaseStudy(slug);
  assertLive();
  return apiPost<InvestmentCaseStudy>(`/investment/case-studies/${encodeURIComponent(slug)}/duplicate`, {}, { timeoutMs: 20000 });
}

export async function archiveInvestmentCaseStudy(slug: string) {
  if (isDemoInvestmentMode()) return archiveDemoInvestmentCaseStudy(slug);
  assertLive();
  return apiPost<InvestmentCaseStudy>(`/investment/case-studies/${encodeURIComponent(slug)}/archive`, {}, { timeoutMs: 20000 });
}

export async function exportInvestmentCaseStudyCodexBrief(slug: string) {
  if (isDemoInvestmentMode()) return exportDemoInvestmentCaseStudyCodexBrief(slug);
  assertLive();
  return apiPost<InvestmentCaseStudyBriefResponse>(`/investment/case-studies/${encodeURIComponent(slug)}/codex-brief`, {}, { timeoutMs: 20000 });
}

function assertLive() {
  if (!USE_BACKEND_API) {
    throw new Error(
      "Investment intelligence requires the configured CFS API outside demo mode.",
    );
  }
}

function isDemoInvestmentMode() {
  return USE_DEMO_DATA;
}
