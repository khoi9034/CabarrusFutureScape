import { apiGet, apiPost, buildApiUrl, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import type {
  InvestmentCsvImportResponse,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCompareResponse,
  InvestmentIntakeListResponse,
  InvestmentIntakePayload,
  InvestmentReportResponse,
  InvestmentResearchContext,
  InvestmentScreenResponse,
  InvestmentStrategyId,
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

function assertLive() {
  if (USE_DEMO_DATA || !USE_BACKEND_API) {
    throw new Error("Investment intake uses local FastAPI in live mode.");
  }
}
