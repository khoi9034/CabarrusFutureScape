import { apiGet, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDemoIndicatorIntelligence } from "@/lib/demo-data/client";
import type { IndicatorIntelligenceResponse } from "@/types/api";

export async function getIndicatorIntelligence() {
  if (USE_DEMO_DATA) {
    return getDemoIndicatorIntelligence();
  }

  if (!USE_BACKEND_API) {
    throw new Error("Indicator intelligence requires the local FastAPI backend in live mode.");
  }

  return apiGet<IndicatorIntelligenceResponse>("/indicators/intelligence", undefined, {
    timeoutMs: 45000,
  });
}
