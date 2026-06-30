import { apiGet, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDemoEconomicsIntelligence } from "@/lib/demo-data/client";
import type { EconomicsIntelligenceResponse } from "@/types/api";

export async function getEconomicsIntelligence() {
  if (USE_DEMO_DATA) {
    return getDemoEconomicsIntelligence();
  }

  if (!USE_BACKEND_API) {
    throw new Error("Economics intelligence requires the local FastAPI backend in live mode.");
  }

  return apiGet<EconomicsIntelligenceResponse>(
    "/economics/intelligence",
    undefined,
    { timeoutMs: 20000 },
  );
}
