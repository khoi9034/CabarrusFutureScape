"use client";

import { useEffect, useState } from "react";
import {
  getStaticParcelDashboardMetrics,
  normalizeParcelStatisticsForDashboard,
  type ParcelDashboardMetricsViewModel,
} from "@/lib/adapters/parcelDashboardMetricsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelStatistics } from "@/lib/api/parcels";

export function useParcelDashboardMetrics() {
  const [metrics, setMetrics] = useState<ParcelDashboardMetricsViewModel>(() => {
    const staticMetrics = getStaticParcelDashboardMetrics();

    return USE_BACKEND_API
      ? {
          ...staticMetrics,
          isLoading: true,
          source: "loading",
        }
      : staticMetrics;
  });

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getParcelStatistics({}, { signal: controller.signal })
      .then((statistics) => {
        setMetrics({
          ...normalizeParcelStatisticsForDashboard(statistics),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackMetrics = getStaticParcelDashboardMetrics();
        setMetrics({
          ...fallbackMetrics,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API metrics are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return metrics;
}
