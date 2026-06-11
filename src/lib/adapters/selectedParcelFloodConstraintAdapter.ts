import type { FloodConstraintDetailResponse } from "@/types/api";

export type FloodConstraintPanelSource =
  | "api"
  | "loading"
  | "unavailable"
  | "waiting";

export interface SelectedParcelFloodConstraintViewModel {
  constraint: FloodConstraintDetailResponse | null;
  errorMessage: string | null;
  isLoading: boolean;
  source: FloodConstraintPanelSource;
}

export function getWaitingSelectedParcelFloodConstraint(): SelectedParcelFloodConstraintViewModel {
  return {
    constraint: null,
    errorMessage: null,
    isLoading: false,
    source: "waiting",
  };
}

export function getUnavailableSelectedParcelFloodConstraint(
  errorMessage: string | null = null,
): SelectedParcelFloodConstraintViewModel {
  return {
    constraint: null,
    errorMessage,
    isLoading: false,
    source: "unavailable",
  };
}

export function getLoadingSelectedParcelFloodConstraint(): SelectedParcelFloodConstraintViewModel {
  return {
    constraint: null,
    errorMessage: null,
    isLoading: true,
    source: "loading",
  };
}

export function normalizeSelectedParcelFloodConstraint(
  response: FloodConstraintDetailResponse,
): FloodConstraintDetailResponse {
  if (!response?.official_parcel_id) {
    throw new Error("Flood constraint API returned an invalid shape.");
  }

  return {
    ...response,
    flood_zone_codes: Array.isArray(response.flood_zone_codes)
      ? response.flood_zone_codes
      : [],
  };
}
