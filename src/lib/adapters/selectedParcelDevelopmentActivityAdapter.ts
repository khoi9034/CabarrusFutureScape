import {
  getStaticDevelopmentActivityForParcel,
  type DevelopmentHotspotRecord,
} from "@/data/intelligence/developmentActivityMetrics";
import type { DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";
import { normalizeDevelopmentHotspots } from "@/lib/adapters/developmentHotspotsAdapter";
import type { DevelopmentHotspotsResponse } from "@/types/api";

export type SelectedParcelPanelSource = DevelopmentPanelSource | "waiting";

export interface SelectedParcelDevelopmentActivityViewModel {
  activity: DevelopmentHotspotRecord | null;
  errorMessage: string | null;
  isLoading: boolean;
  source: SelectedParcelPanelSource;
}

export function getStaticSelectedParcelDevelopmentActivity(
  officialParcelId: string | null | undefined,
): SelectedParcelDevelopmentActivityViewModel {
  return {
    activity: getStaticDevelopmentActivityForParcel(officialParcelId),
    errorMessage: null,
    isLoading: false,
    source: "static",
  };
}

export function normalizeSelectedParcelDevelopmentActivity(
  response: DevelopmentHotspotsResponse,
) {
  const normalized = normalizeDevelopmentHotspots(response);

  return normalized.hotspots[0] ?? null;
}
