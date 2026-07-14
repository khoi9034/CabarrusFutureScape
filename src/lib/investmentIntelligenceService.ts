import { apiGet, apiPost, buildApiUrl, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import type {
  InvestmentCsvImportResponse,
  InvestmentAreaRadarResponse,
  InvestmentEngagement,
  InvestmentEngagementListResponse,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCompareResponse,
  InvestmentIntakeListResponse,
  InvestmentIntakePayload,
  InvestmentOpportunityListResponse,
  InvestmentOpportunitySource,
  InvestmentReportResponse,
  InvestmentResearchContext,
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
  if (USE_DEMO_DATA || !USE_BACKEND_API) {
    throw new Error("Investment screening uses local FastAPI in live mode.");
  }

  return apiPost<InvestmentScreenResponse>(
    "/investment/screen",
    { limit: 120, strategy },
    { timeoutMs: 20000 },
  );
}

export async function getInvestmentIntake() {
  assertLive();
  return apiGet<InvestmentIntakeListResponse>("/investment/intake", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentIntakeCandidate(payload: InvestmentIntakePayload) {
  assertLive();
  return apiPost<InvestmentIntakeAnalysisResponse>("/investment/intake", payload, { timeoutMs: 20000 });
}

export async function importInvestmentIntakeCsv(csvText: string) {
  assertLive();
  return apiPost<InvestmentCsvImportResponse>("/investment/intake/import", { csv_text: csvText }, { timeoutMs: 20000 });
}

export async function getInvestmentIntakeAnalysis(candidateId: string) {
  assertLive();
  return apiGet<InvestmentIntakeAnalysisResponse>(`/investment/intake/${candidateId}/analysis`, undefined, { timeoutMs: 20000 });
}

export async function updateInvestmentIntakeCandidate(candidateId: string, payload: Partial<InvestmentIntakePayload>) {
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
  assertLive();
  return apiPost<InvestmentIntakeCompareResponse>("/investment/intake/compare", { candidate_ids: candidateIds }, { timeoutMs: 20000 });
}

export async function deleteInvestmentIntakeCandidate(candidateId: string) {
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/intake/${candidateId}`), {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to delete investment intake candidate.");
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function getInvestmentResearchContext(parcelId: string, strategy: InvestmentStrategyId) {
  assertLive();
  return apiGet<InvestmentResearchContext>(`/investment/research-context/${encodeURIComponent(parcelId)}?strategy=${strategy}`, undefined, { timeoutMs: 20000 });
}

export async function getInvestmentIntakeResearchContext(candidateId: string) {
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
  assertLive();
  return apiPost<InvestmentReportResponse>("/investment/reports/generate", payload, { timeoutMs: 20000 });
}

export async function getInvestmentUnderwritingScenarios() {
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
  assertLive();
  const response = await fetch(buildApiUrl(`/investment/underwriting/scenarios/${scenarioId}`), {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to delete underwriting scenario.");
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function compareInvestmentUnderwritingScenarios(scenarioIds: string[]) {
  assertLive();
  return apiPost<InvestmentUnderwritingCompareResponse>("/investment/underwriting/compare", { scenario_ids: scenarioIds }, { timeoutMs: 20000 });
}

export async function getInvestmentOpportunitySources() {
  assertLive();
  return apiGet<{ sources: InvestmentOpportunitySource[] }>("/investment/opportunities/sources", undefined, { timeoutMs: 20000 });
}

export async function getInvestmentOpportunities() {
  assertLive();
  return apiGet<InvestmentOpportunityListResponse>("/investment/opportunities", undefined, { timeoutMs: 30000 });
}

export async function matchInvestmentOpportunity(opportunityId: string, parcelId?: string | null) {
  assertLive();
  return apiPost<Record<string, unknown>>(`/investment/opportunities/${encodeURIComponent(opportunityId)}/match`, { parcel_id: parcelId ?? null }, { timeoutMs: 20000 });
}

export async function addInvestmentOpportunityToIntake(opportunityId: string, strategy: InvestmentStrategyId) {
  assertLive();
  return apiPost<InvestmentIntakeAnalysisResponse>(`/investment/opportunities/${encodeURIComponent(opportunityId)}/intake`, { strategy }, { timeoutMs: 30000 });
}

export async function searchInvestmentRadar(strategy = "industrial_site") {
  assertLive();
  return apiPost<InvestmentAreaRadarResponse>(`/investment/radar/search?strategy=${encodeURIComponent(strategy)}`, {}, { timeoutMs: 30000 });
}

export async function getInvestmentEngagements() {
  assertLive();
  return apiGet<InvestmentEngagementListResponse>("/investment/engagements", undefined, { timeoutMs: 20000 });
}

export async function createInvestmentEngagement(payload: Record<string, unknown>) {
  assertLive();
  return apiPost<InvestmentEngagement>("/investment/engagements", payload, { timeoutMs: 20000 });
}

export async function addInvestmentEngagementShortlistItem(engagementId: string, payload: Record<string, unknown>) {
  assertLive();
  return apiPost<InvestmentEngagement>(`/investment/engagements/${encodeURIComponent(engagementId)}/shortlist`, payload, { timeoutMs: 20000 });
}

export async function generateInvestmentEngagementReport(engagementId: string) {
  assertLive();
  return apiPost<InvestmentReportResponse>(`/investment/engagements/${encodeURIComponent(engagementId)}/report`, {}, { timeoutMs: 20000 });
}

export async function getInvestmentUnderwritingTemplates() {
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
  assertLive();
  return apiPost<InvestmentUnderwritingPrefillResponse>("/investment/underwriting/prefill", payload, { timeoutMs: 30000 });
}

function assertLive() {
  if (USE_DEMO_DATA || !USE_BACKEND_API) {
    throw new Error("Investment intake uses local FastAPI in live mode.");
  }
}
