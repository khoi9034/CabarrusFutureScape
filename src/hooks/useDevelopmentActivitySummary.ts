"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentActivitySummary,
  getUnavailableDevelopmentActivitySummary,
  normalizeDevelopmentActivitySummary,
  type DevelopmentActivitySummaryViewModel,
} from "@/lib/adapters/developmentActivitySummaryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDevelopmentActivitySummary } from "@/lib/api/development";
import { getDemoDevelopmentActivitySummaryResponse } from "@/lib/demo-data/client";

export function useDevelopmentActivitySummary({ yearEnd = null, yearStart = null }: { yearEnd?: number | null; yearStart?: number | null } = {}) {
  const [summary, setSummary] = useState<DevelopmentActivitySummaryViewModel>(
    () => {
      const staticSummary = USE_DEMO_DATA
        ? getStaticDevelopmentActivitySummary()
        : getUnavailableDevelopmentActivitySummary();

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
    if (USE_DEMO_DATA) {
      getDemoDevelopmentActivitySummaryResponse({ yearEnd, yearStart })
        .then((activitySummary) => {
          setSummary({
            ...normalizeDevelopmentActivitySummary(activitySummary),
            errorMessage: null,
            isLoading: false,
            source: "static",
          });
        })
        .catch((error: unknown) => {
          const fallbackSummary = getStaticDevelopmentActivitySummary();
          setSummary({
            ...fallbackSummary,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Demo development activity summary is unavailable.",
            isLoading: false,
            source: "static",
          });
        });
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentActivitySummary(
      {
        date_end: yearEnd ? `${yearEnd}-12-31` : undefined,
        date_start: yearStart ? `${yearStart}-01-01` : undefined,
      },
      { signal: controller.signal },
    )
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

        const fallbackSummary = getUnavailableDevelopmentActivitySummary();
        setSummary({
          ...fallbackSummary,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Live development activity summary is unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, [yearEnd, yearStart]);

  return summary;
}
