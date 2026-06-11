"use client";

import { useEffect, useState } from "react";
import {
  getLoadingSelectedParcelFloodConstraint,
  getUnavailableSelectedParcelFloodConstraint,
  getWaitingSelectedParcelFloodConstraint,
  normalizeSelectedParcelFloodConstraint,
  type SelectedParcelFloodConstraintViewModel,
} from "@/lib/adapters/selectedParcelFloodConstraintAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelFloodConstraint } from "@/lib/api/constraints";

interface ApiSelectedParcelFloodConstraintState
  extends SelectedParcelFloodConstraintViewModel {
  parcelId: string | null;
}

export function useSelectedParcelFloodConstraint(
  officialParcelId: string | null | undefined,
): SelectedParcelFloodConstraintViewModel {
  const [apiState, setApiState] =
    useState<ApiSelectedParcelFloodConstraintState>({
      ...getWaitingSelectedParcelFloodConstraint(),
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

    getParcelFloodConstraint(officialParcelId, { signal: controller.signal })
      .then((response) => {
        setApiState({
          constraint: normalizeSelectedParcelFloodConstraint(response),
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
          ...getUnavailableSelectedParcelFloodConstraint(
            error instanceof Error
              ? error.message
              : "Selected parcel flood constraint status is unavailable.",
          ),
          parcelId: officialParcelId,
        });
      });

    return () => controller.abort();
  }, [officialParcelId]);

  if (!officialParcelId) {
    return getWaitingSelectedParcelFloodConstraint();
  }

  if (!USE_BACKEND_API) {
    return getUnavailableSelectedParcelFloodConstraint(
      "Flood constraints require backend API mode.",
    );
  }

  if (apiState.parcelId === officialParcelId) {
    return apiState;
  }

  return getLoadingSelectedParcelFloodConstraint();
}
