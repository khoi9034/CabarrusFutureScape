"use client";

import { useEffect, useState } from "react";
import {
  getApiErrorDisplayMessage,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { getSchoolPressure } from "@/lib/api/constraints";
import { getDemoSchoolPressureResponse } from "@/lib/demo-data/mapLayerClient";
import type {
  SchoolPressureLayerState,
  SchoolPressureResponse,
  SchoolPressureSummary,
} from "@/types/map/schoolPressure";

const emptySummary: SchoolPressureSummary = {
  areas_analyzed: 0,
  areas_with_recent_permits: 0,
  areas_with_utilization: 0,
  data_needed_count: 0,
  elevated_review_count: 0,
  recent_residential_permits_in_watched_areas: 0,
};

const offState: SchoolPressureLayerState = {
  caveats: [],
  errorMessage: null,
  features: [],
  isLoading: false,
  source: "none",
  status: "off",
  summary: emptySummary,
  totalCount: 0,
};

const loadingState: SchoolPressureLayerState = {
  ...offState,
  isLoading: true,
  status: "loading",
};

export function useSchoolPressureLayer({
  enabled,
}: {
  enabled: boolean;
}): SchoolPressureLayerState {
  const [state, setState] = useState<SchoolPressureLayerState>(() =>
    enabled ? loadingState : offState,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const request: Promise<SchoolPressureResponse> = USE_DEMO_DATA
      ? getDemoSchoolPressureResponse()
      : USE_BACKEND_API
        ? getSchoolPressure({ limit: 500 }, { signal: controller.signal })
        : Promise.reject(new Error("School pressure layer requires data mode."));

    request
      .then((response) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setState({
          caveats: response.caveats,
          errorMessage:
            response.features.length === 0
              ? "School utilization + permit pressure data is not available."
              : null,
          features: response.features,
          isLoading: false,
          source: USE_DEMO_DATA ? "demo" : "api",
          status: response.features.length > 0 ? "ready" : "empty",
          summary: response.summary,
          totalCount: response.total_count,
        });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setState({
          ...offState,
          errorMessage: getApiErrorDisplayMessage(
            error,
            "School utilization + permit pressure is unavailable.",
          ),
          status: "error",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled]);

  if (!enabled) {
    return offState;
  }

  return state;
}
