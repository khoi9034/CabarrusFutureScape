"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentZoningSummary,
  getUnavailableDevelopmentZoningSummary,
  normalizeDevelopmentZoningSummary,
  type DevelopmentZoningSummaryViewModel,
} from "@/lib/adapters/developmentZoningSummaryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDevelopmentZoningSummary } from "@/lib/api/development";

export function useDevelopmentZoningSummary() {
  const [summary, setSummary] = useState<DevelopmentZoningSummaryViewModel>(
    () => {
      const staticSummary = USE_DEMO_DATA
        ? getStaticDevelopmentZoningSummary()
        : getUnavailableDevelopmentZoningSummary();

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

    getDevelopmentZoningSummary({ limit: 12 }, { signal: controller.signal })
      .then((zoningSummary) => {
        setSummary({
          ...normalizeDevelopmentZoningSummary(zoningSummary),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackSummary = getUnavailableDevelopmentZoningSummary();
        setSummary({
          ...fallbackSummary,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API development zoning summary is unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return summary;
}
