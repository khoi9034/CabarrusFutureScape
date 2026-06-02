"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentActivitySummary,
  normalizeDevelopmentActivitySummary,
  type DevelopmentActivitySummaryViewModel,
} from "@/lib/adapters/developmentActivitySummaryAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getDevelopmentActivitySummary } from "@/lib/api/development";

export function useDevelopmentActivitySummary() {
  const [summary, setSummary] = useState<DevelopmentActivitySummaryViewModel>(
    () => {
      const staticSummary = getStaticDevelopmentActivitySummary();

      return USE_BACKEND_API
        ? {
            ...staticSummary,
            isLoading: true,
            source: "loading",
          }
        : staticSummary;
    },
  );

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentActivitySummary({}, { signal: controller.signal })
      .then((activitySummary) => {
        setSummary({
          ...normalizeDevelopmentActivitySummary(activitySummary),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackSummary = getStaticDevelopmentActivitySummary();
        setSummary({
          ...fallbackSummary,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API development activity summary is unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return summary;
}
