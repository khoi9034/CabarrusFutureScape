import { apiGet, type ApiRequestOptions } from "@/lib/api/client";

import type { CfsAskAgentResult } from "@/types/api";

export type ManagementMapSelection =
  | "active-development-parcels"
  | "permit-activity"
  | "hotspot"
  | "flood-review"
  | "flood-high-severe"
  | "development-signals"
  | "development-signals-high"
  | "development-signals-very-high"
  | "ask-agent-result";

export interface ManagementMapResult {
  feature_count: number;
  features: Array<{
    geometry: {
      coordinates: unknown;
      type: "Point" | "Polygon" | "MultiPolygon";
    };
    weight: number;
  }>;
  geometry_kind: "point" | "polygon";
  record_count: number;
  selection: ManagementMapSelection;
  source: string;
  title: string;
}

export function getAskAgentMapResult(
  result: Pick<CfsAskAgentResult, "result_id">,
  options?: ApiRequestOptions,
) {
  if (!result.result_id) throw new Error("Ask Insights result ID is required.");
  return apiGet<ManagementMapResult>(`/ai/results/${encodeURIComponent(result.result_id)}/map`, undefined, {
    ...options,
    timeoutMs: options?.timeoutMs ?? 60_000,
  });
}

export function getManagementMapResult(
  params: {
    end_date?: string;
    selected_parcel?: string;
    selection: ManagementMapSelection;
    start_date?: string;
  },
  options?: ApiRequestOptions,
) {
  return apiGet<ManagementMapResult>("/development/management-map", params, {
    ...options,
    timeoutMs: options?.timeoutMs ?? 60_000,
  });
}
