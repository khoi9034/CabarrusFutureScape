"use client";

import { useEffect, useState } from "react";
import {
  getLoadingFloodConstraintSummary,
  getUnavailableFloodConstraintSummary,
  normalizeFloodConstraintSummary,
  type FloodConstraintSummaryViewModel,
} from "@/lib/adapters/floodConstraintSummaryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getFloodSummary } from "@/lib/api/constraints";
import { getDemoFloodSummaryResponse } from "@/lib/demo-data/client";

export function useFloodConstraintSummary(): FloodConstraintSummaryViewModel {
  const [summary, setSummary] = useState<FloodConstraintSummaryViewModel>(() =>
    USE_BACKEND_API
      ? getLoadingFloodConstraintSummary()
      : getUnavailableFloodConstraintSummary(
          "Flood constraint summary requires backend API mode.",
        ),
  );

  useEffect(() => {
    if (USE_DEMO_DATA) {
      getDemoFloodSummaryResponse()
        .then((response) => {
          setSummary({
            ...normalizeFloodConstraintSummary(response),
            errorMessage: null,
            isLoading: false,
            source: "demo",
          });
        })
        .catch((error: unknown) => {
          setSummary(
            getUnavailableFloodConstraintSummary(
              error instanceof Error
                ? error.message
                : "Demo floodplain summary is unavailable.",
            ),
          );
        });
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getFloodSummary({}, { signal: controller.signal })
      .then((response) => {
        setSummary({
          ...normalizeFloodConstraintSummary(response),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setSummary(
          getUnavailableFloodConstraintSummary(
            error instanceof Error
              ? error.message
              : "Flood constraint summary is unavailable.",
          ),
        );
      });

    return () => controller.abort();
  }, []);

  if (!USE_BACKEND_API && !USE_DEMO_DATA) {
    return getUnavailableFloodConstraintSummary(
      "Flood constraint summary requires backend API mode.",
    );
  }

  return summary;
}
