"use client";

import { useEffect, useState } from "react";
import {
  getUnavailableSelectedParcelPermitEvents,
  normalizeSelectedParcelPermitEvents,
  type SelectedParcelPermitEventsViewModel,
} from "@/lib/adapters/selectedParcelPermitEventsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getDevelopmentParcelPermits } from "@/lib/api/development";

interface ApiSelectedParcelPermitEventsState
  extends SelectedParcelPermitEventsViewModel {
  parcelId: string | null;
}

function emptyState(
  officialParcelId: string | null | undefined,
): SelectedParcelPermitEventsViewModel {
  return getUnavailableSelectedParcelPermitEvents(
    officialParcelId,
    USE_BACKEND_API ? "loading" : "static",
  );
}

function waitingState(): SelectedParcelPermitEventsViewModel {
  return getUnavailableSelectedParcelPermitEvents(null, "waiting");
}

export function useSelectedParcelPermitEvents(
  officialParcelId: string | null | undefined,
): SelectedParcelPermitEventsViewModel {
  const [apiState, setApiState] =
    useState<ApiSelectedParcelPermitEventsState>({
      ...emptyState(null),
      parcelId: null,
    });

  useEffect(() => {
    if (!officialParcelId) {
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentParcelPermits(
      officialParcelId,
      {
        limit: 10,
        sort: "latest_first",
      },
      { signal: controller.signal },
    )
      .then((response) => {
        setApiState({
          ...normalizeSelectedParcelPermitEvents(response),
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
          ...getUnavailableSelectedParcelPermitEvents(
            officialParcelId,
            "fallback",
          ),
          errorMessage:
            error instanceof Error
              ? error.message
              : "Selected parcel permit events are unavailable.",
          parcelId: officialParcelId,
        });
      });

    return () => controller.abort();
  }, [officialParcelId]);

  if (!officialParcelId) {
    return waitingState();
  }

  if (!USE_BACKEND_API) {
    return getUnavailableSelectedParcelPermitEvents(officialParcelId, "static");
  }

  if (apiState.parcelId === officialParcelId) {
    return apiState;
  }

  return {
    ...getUnavailableSelectedParcelPermitEvents(officialParcelId, "loading"),
    isLoading: true,
  };
}
