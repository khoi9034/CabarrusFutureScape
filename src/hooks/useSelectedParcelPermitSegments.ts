"use client";

import { useEffect, useState } from "react";
import {
  normalizeSelectedParcelPermitSegment,
  unavailableSelectedParcelPermitSegment,
  waitingSelectedParcelPermitSegment,
  type SelectedParcelPermitSegmentViewModel,
} from "@/lib/adapters/permitSegmentsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelPermitSegmentSummary } from "@/lib/api/development";

interface ApiSelectedParcelPermitSegmentState
  extends SelectedParcelPermitSegmentViewModel {
  parcelId: string | null;
}

export function useSelectedParcelPermitSegments(
  officialParcelId: string | null | undefined,
): SelectedParcelPermitSegmentViewModel {
  const [apiState, setApiState] =
    useState<ApiSelectedParcelPermitSegmentState>({
      ...unavailableSelectedParcelPermitSegment(
        USE_BACKEND_API ? "loading" : "static",
      ),
      parcelId: null,
    });

  useEffect(() => {
    if (!officialParcelId || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getParcelPermitSegmentSummary(officialParcelId, {
      signal: controller.signal,
    })
      .then((response) => {
        setApiState({
          errorMessage: null,
          isLoading: false,
          parcelId: officialParcelId,
          source: "api",
          summary: normalizeSelectedParcelPermitSegment(response),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setApiState({
          ...unavailableSelectedParcelPermitSegment(
            "fallback",
            error instanceof Error
              ? error.message
              : "Selected parcel permit segment summary is unavailable.",
          ),
          parcelId: officialParcelId,
        });
      });

    return () => controller.abort();
  }, [officialParcelId]);

  if (!officialParcelId) {
    return waitingSelectedParcelPermitSegment();
  }

  if (!USE_BACKEND_API) {
    return unavailableSelectedParcelPermitSegment("static");
  }

  if (apiState.parcelId === officialParcelId) {
    return apiState;
  }

  return unavailableSelectedParcelPermitSegment("loading");
}
