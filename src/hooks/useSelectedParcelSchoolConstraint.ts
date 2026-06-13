"use client";

import { useEffect, useState } from "react";
import {
  getLoadingSelectedParcelSchoolConstraint,
  getUnavailableSelectedParcelSchoolConstraint,
  getWaitingSelectedParcelSchoolConstraint,
  normalizeSelectedParcelSchoolConstraint,
  type SelectedParcelSchoolConstraintViewModel,
} from "@/lib/adapters/selectedParcelSchoolConstraintAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  getSchoolConstraintForParcel,
  getSchoolUtilizationSeedForParcel,
} from "@/lib/api/constraints";

interface ApiSelectedParcelSchoolConstraintState
  extends SelectedParcelSchoolConstraintViewModel {
  parcelId: string | null;
}

export function useSelectedParcelSchoolConstraint(
  officialParcelId: string | null | undefined,
): SelectedParcelSchoolConstraintViewModel {
  const [apiState, setApiState] =
    useState<ApiSelectedParcelSchoolConstraintState>({
      ...getWaitingSelectedParcelSchoolConstraint(),
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

    Promise.allSettled([
      getSchoolConstraintForParcel(officialParcelId, {
        signal: controller.signal,
      }),
      getSchoolUtilizationSeedForParcel(officialParcelId, {
        signal: controller.signal,
      }),
    ])
      .then(([assignmentResult, utilizationResult]) => {
        if (assignmentResult.status === "rejected") {
          throw assignmentResult.reason;
        }

        const utilizationSeed =
          utilizationResult.status === "fulfilled"
            ? utilizationResult.value
            : null;
        const utilizationErrorMessage =
          utilizationResult.status === "rejected"
            ? utilizationResult.reason instanceof Error
              ? utilizationResult.reason.message
              : "Presentation-derived school utilization is unavailable."
            : null;

        setApiState({
          ...normalizeSelectedParcelSchoolConstraint(
            assignmentResult.value,
            utilizationSeed,
          ),
          errorMessage: null,
          isLoading: false,
          parcelId: officialParcelId,
          source: "api",
          utilizationErrorMessage,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setApiState({
          ...getUnavailableSelectedParcelSchoolConstraint(
            error instanceof Error
              ? error.message
              : "Selected parcel school assignment is unavailable.",
          ),
          parcelId: officialParcelId,
        });
      });

    return () => controller.abort();
  }, [officialParcelId]);

  if (!officialParcelId) {
    return getWaitingSelectedParcelSchoolConstraint();
  }

  if (!USE_BACKEND_API) {
    return getUnavailableSelectedParcelSchoolConstraint(
      "School assignments require backend API mode.",
    );
  }

  if (apiState.parcelId === officialParcelId) {
    return apiState;
  }

  return getLoadingSelectedParcelSchoolConstraint();
}
