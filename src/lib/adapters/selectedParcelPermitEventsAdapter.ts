import type { SelectedParcelPanelSource } from "@/lib/adapters/selectedParcelDevelopmentActivityAdapter";
import type {
  DevelopmentParcelPermitEvent,
  DevelopmentParcelPermitEventsResponse,
} from "@/types/api";

export interface SelectedParcelPermitEventsViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  officialParcelId: string | null;
  permits: DevelopmentParcelPermitEvent[];
  source: SelectedParcelPanelSource;
  totalCount: number;
}

export function getUnavailableSelectedParcelPermitEvents(
  officialParcelId: string | null | undefined,
  source: SelectedParcelPanelSource,
): SelectedParcelPermitEventsViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    officialParcelId: officialParcelId ?? null,
    permits: [],
    source,
    totalCount: 0,
  };
}

export function normalizeSelectedParcelPermitEvents(
  response: DevelopmentParcelPermitEventsResponse,
): Omit<SelectedParcelPermitEventsViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !Array.isArray(response.permits)) {
    throw new Error("Selected parcel permit event API returned an invalid shape.");
  }

  return {
    officialParcelId: response.official_parcel_id,
    permits: response.permits,
    totalCount: response.total_count,
  };
}
