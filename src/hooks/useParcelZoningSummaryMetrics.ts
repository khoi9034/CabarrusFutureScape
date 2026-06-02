"use client";

import { useEffect, useState } from "react";
import {
  getStaticParcelZoningDistribution,
  normalizeParcelZoningSummaryForDistribution,
  type ParcelZoningDistributionViewModel,
} from "@/lib/adapters/parcelZoningSummaryAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelZoningSummary } from "@/lib/api/parcels";

export function useParcelZoningSummaryMetrics() {
  const [metrics, setMetrics] = useState<ParcelZoningDistributionViewModel>(
    () => {
      const staticMetrics = getStaticParcelZoningDistribution();

      return USE_BACKEND_API
        ? {
            ...staticMetrics,
            isLoading: true,
            source: "loading",
          }
        : staticMetrics;
    },
  );

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getParcelZoningSummary({}, { signal: controller.signal })
      .then((zoningSummary) => {
        setMetrics({
          ...normalizeParcelZoningSummaryForDistribution(zoningSummary),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackMetrics = getStaticParcelZoningDistribution();
        setMetrics({
          ...fallbackMetrics,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API zoning summary is unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return metrics;
}
