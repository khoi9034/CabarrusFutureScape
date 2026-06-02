"use client";

import { useEffect, useState } from "react";
import {
  getStaticParcelGovernanceWarnings,
  normalizeParcelGovernanceWarnings,
  type ParcelGovernanceWarningsViewModel,
} from "@/lib/adapters/parcelGovernanceWarningsAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelGovernanceWarnings } from "@/lib/api/parcels";

export function useParcelGovernanceWarningsMetrics() {
  const [metrics, setMetrics] = useState<ParcelGovernanceWarningsViewModel>(
    () => {
      const staticMetrics = getStaticParcelGovernanceWarnings();

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

    getParcelGovernanceWarnings({ limit: 100 }, { signal: controller.signal })
      .then((governanceWarnings) => {
        setMetrics({
          ...normalizeParcelGovernanceWarnings(governanceWarnings),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackMetrics = getStaticParcelGovernanceWarnings();
        setMetrics({
          ...fallbackMetrics,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API governance warnings are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return metrics;
}
