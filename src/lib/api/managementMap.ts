import { apiGet, type ApiRequestOptions } from "@/lib/api/client";

export type ManagementMapSelection =
  | "active-development-parcels"
  | "permit-activity"
  | "hotspot"
  | "flood-review"
  | "flood-high-severe"
  | "development-signals"
  | "development-signals-very-high";

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
