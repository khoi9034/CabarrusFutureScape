"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getStaticSelectedParcelDevelopmentActivity,
  normalizeSelectedParcelDevelopmentActivity,
  type SelectedParcelDevelopmentActivityViewModel,
} from "@/lib/adapters/selectedParcelDevelopmentActivityAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getDevelopmentHotspots } from "@/lib/api/development";

interface ApiSelectedParcelDevelopmentActivityState
  extends SelectedParcelDevelopmentActivityViewModel {
  parcelId: string | null;
}

function emptyState(): SelectedParcelDevelopmentActivityViewModel {
  return {
    activity: null,
    errorMessage: null,
    isLoading: false,
    source: USE_BACKEND_API ? "loading" : "static",
  };
}

export function useSelectedParcelDevelopmentActivity(
  officialParcelId: string | null | undefined,
): SelectedParcelDevelopmentActivityViewModel {
  const staticActivity = useMemo(
    () => getStaticSelectedParcelDevelopmentActivity(officialParcelId),
    [officialParcelId],
  );
  const [apiState, setApiState] =
    useState<ApiSelectedParcelDevelopmentActivityState>({
      ...emptyState(),
      parcelId: null,
    });

  useEffect(() => {
    if (!USE_BACKEND_API || !officialParcelId) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentHotspots(
      {
        limit: 1,
        official_parcel_id: officialParcelId,
        sort_by: "development_activity_score",
      },
      { signal: controller.signal },
    )
      .then((response) => {
        setApiState({
          activity: normalizeSelectedParcelDevelopmentActivity(response),
          errorMessage: null,
          isLoading: false,
          parcelId: officialParcelId,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setApiState({
          ...staticActivity,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Selected parcel development activity is unavailable.",
          isLoading: false,
          parcelId: officialParcelId,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, [officialParcelId, staticActivity]);

  if (!officialParcelId) {
    return emptyState();
  }

  if (!USE_BACKEND_API) {
    return staticActivity;
  }

  if (apiState.parcelId === officialParcelId) {
    return apiState;
  }

  return {
    ...staticActivity,
    isLoading: true,
    source: "loading",
  };
}
