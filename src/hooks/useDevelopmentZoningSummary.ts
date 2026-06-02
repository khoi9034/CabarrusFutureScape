"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentZoningSummary,
  normalizeDevelopmentZoningSummary,
  type DevelopmentZoningSummaryViewModel,
} from "@/lib/adapters/developmentZoningSummaryAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getDevelopmentZoningSummary } from "@/lib/api/development";

export function useDevelopmentZoningSummary() {
  const [summary, setSummary] = useState<DevelopmentZoningSummaryViewModel>(
    () => {
      const staticSummary = getStaticDevelopmentZoningSummary();

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

        const fallbackSummary = getStaticDevelopmentZoningSummary();
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
