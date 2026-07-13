import { apiGet, apiPost, buildApiUrl, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import type {
  InvestmentCsvImportResponse,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCompareResponse,
  InvestmentIntakeListResponse,
  InvestmentIntakePayload,
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

function assertLive() {
  if (USE_DEMO_DATA || !USE_BACKEND_API) {
    throw new Error("Investment intake uses local FastAPI in live mode.");
  }
}
