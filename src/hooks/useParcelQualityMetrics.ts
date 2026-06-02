"use client";

import { useEffect, useState } from "react";
import {
  getStaticParcelQualityMetrics,
  normalizeParcelStatisticsForQuality,
  type ParcelQualityMetricsViewModel,
} from "@/lib/adapters/parcelStatisticsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelStatistics } from "@/lib/api/parcels";

export function useParcelQualityMetrics() {
  const [metrics, setMetrics] = useState<ParcelQualityMetricsViewModel>(() => {
    const staticMetrics = getStaticParcelQualityMetrics();

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
          ...normalizeParcelStatisticsForQuality(statistics),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackMetrics = getStaticParcelQualityMetrics();
        setMetrics({
          ...fallbackMetrics,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API parcel quality metrics are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return metrics;
}
