"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentTrends,
  normalizeDevelopmentTrends,
  type DevelopmentTrendsViewModel,
} from "@/lib/adapters/developmentTrendsAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDevelopmentTrends } from "@/lib/api/development";
import { getDemoDevelopmentTrendsResponse } from "@/lib/demo-data/client";

export function useDevelopmentTrends() {
  const [trends, setTrends] = useState<DevelopmentTrendsViewModel>(() => {
    const staticTrends = getStaticDevelopmentTrends();

    return USE_BACKEND_API
      ? {
          ...staticTrends,
          isLoading: true,
          source: "loading",
        }
      : staticTrends;
  });

  useEffect(() => {
    if (USE_DEMO_DATA) {
      getDemoDevelopmentTrendsResponse()
        .then((developmentTrends) => {
          setTrends({
            ...normalizeDevelopmentTrends(developmentTrends),
            errorMessage: null,
            isLoading: false,
            source: "static",
          });
        })
        .catch((error: unknown) => {
          const fallbackTrends = getStaticDevelopmentTrends();
          setTrends({
            ...fallbackTrends,
            errorMessage:
              error instanceof Error
                ? error.message
                : "CFS demo development trends are unavailable.",
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

    getDevelopmentTrends({}, { signal: controller.signal })
      .then((developmentTrends) => {
        setTrends({
          ...normalizeDevelopmentTrends(developmentTrends),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackTrends = getStaticDevelopmentTrends();
        setTrends({
          ...fallbackTrends,
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API development trends are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return trends;
}
