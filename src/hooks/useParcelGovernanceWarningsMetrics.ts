"use client";

import { useEffect, useState } from "react";
import {
  getStaticParcelGovernanceWarnings,
  getUnavailableParcelGovernanceWarnings,
  normalizeParcelGovernanceWarnings,
  type ParcelGovernanceWarningsViewModel,
} from "@/lib/adapters/parcelGovernanceWarningsAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getParcelGovernanceWarnings } from "@/lib/api/parcels";

export function useParcelGovernanceWarningsMetrics() {
  const [metrics, setMetrics] = useState<ParcelGovernanceWarningsViewModel>(
    () => {
      const staticMetrics = USE_DEMO_DATA
        ? getStaticParcelGovernanceWarnings()
        : getUnavailableParcelGovernanceWarnings();

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

        const fallbackMetrics = getUnavailableParcelGovernanceWarnings();
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
