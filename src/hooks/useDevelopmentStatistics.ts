"use client";

import { useEffect, useState } from "react";
import type { DevelopmentActivitySummaryViewModel } from "@/lib/adapters/developmentActivitySummaryAdapter";
import {
  getStaticDevelopmentStatistics,
  normalizeDevelopmentStatistics,
  type DevelopmentStatisticsViewModel,
} from "@/lib/adapters/developmentStatisticsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getDevelopmentStatistics } from "@/lib/api/development";

export function useDevelopmentStatistics(
  activitySummary?: DevelopmentActivitySummaryViewModel,
) {
  const [statistics, setStatistics] = useState<DevelopmentStatisticsViewModel>(
    () => {
      const staticStatistics = getStaticDevelopmentStatistics();

      return USE_BACKEND_API
        ? {
            ...staticStatistics,
            isLoading: true,
            source: "loading",
          }
        : staticStatistics;
    },
  );

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentStatistics({}, { signal: controller.signal })
      .then((developmentStatistics) => {
        setStatistics({
          ...normalizeDevelopmentStatistics(
            developmentStatistics,
            activitySummary,
          ),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackStatistics = getStaticDevelopmentStatistics();
        setStatistics({
          ...fallbackStatistics,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API development statistics are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, [activitySummary]);

  return statistics;
}
