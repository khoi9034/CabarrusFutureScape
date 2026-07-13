import { apiPost, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import type { InvestmentScreenResponse, InvestmentStrategyId } from "@/types/api";

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
