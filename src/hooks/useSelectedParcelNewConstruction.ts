"use client";

import { useEffect, useState } from "react";
import { getApiErrorDisplayMessage, USE_BACKEND_API } from "@/lib/api/client";
import { getParcelNewConstructionSummary } from "@/lib/api/development";
import type { ParcelNewConstructionSummaryResponse } from "@/types/api";

export type SelectedParcelNewConstructionSource =
  | "api"
  | "loading"
  | "unavailable"
  | "waiting";

export interface SelectedParcelNewConstructionState {
  errorMessage: string | null;
  isLoading: boolean;
  parcelId: string | null;
  source: SelectedParcelNewConstructionSource;
  summary: ParcelNewConstructionSummaryResponse | null;
}

function waitingState(): SelectedParcelNewConstructionState {
  return {
    errorMessage: null,
    isLoading: false,
    parcelId: null,
    source: "waiting",
    summary: null,
  };
}

export function useSelectedParcelNewConstruction(
  officialParcelId: string | null | undefined,
): SelectedParcelNewConstructionState {
  const [state, setState] =
    useState<SelectedParcelNewConstructionState>(waitingState);

  useEffect(() => {
    if (!officialParcelId) {
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    getParcelNewConstructionSummary(officialParcelId, {
      signal: controller.signal,
    })
      .then((summary) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          errorMessage: null,
          isLoading: false,
          parcelId: officialParcelId,
          source: "api",
          summary,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          errorMessage: getApiErrorDisplayMessage(
            error,
            "Selected parcel new construction summary is unavailable.",
          ),
          isLoading: false,
          parcelId: officialParcelId,
          source: "unavailable",
          summary: null,
        });
      });

    return () => controller.abort();
  }, [officialParcelId]);

  if (!officialParcelId) {
    return waitingState();
  }

  if (!USE_BACKEND_API) {
    return {
      errorMessage: "New construction summaries require backend API mode.",
      isLoading: false,
      parcelId: officialParcelId,
      source: "unavailable",
      summary: null,
    };
  }

  if (state.parcelId === officialParcelId) {
    return state;
  }

  return {
    errorMessage: null,
    isLoading: USE_BACKEND_API,
    parcelId: officialParcelId,
    source: USE_BACKEND_API ? "loading" : "unavailable",
    summary: null,
  };
}
