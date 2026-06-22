"use client";

import { useEffect, useState } from "react";
import {
  emptyPermitSegmentStatistics,
  normalizePermitSegmentStatistics,
  type PermitSegmentStatisticsViewModel,
} from "@/lib/adapters/permitSegmentsAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getPermitSegmentStatistics } from "@/lib/api/development";
import { getDemoPermitSegmentStatisticsResponse } from "@/lib/demo-data/client";

export function usePermitSegmentStatistics(): PermitSegmentStatisticsViewModel {
  const [statistics, setStatistics] = useState<PermitSegmentStatisticsViewModel>(
    () =>
      USE_BACKEND_API
        ? emptyPermitSegmentStatistics("loading")
        : emptyPermitSegmentStatistics("static"),
  );

  useEffect(() => {
    if (USE_DEMO_DATA) {
      getDemoPermitSegmentStatisticsResponse()
        .then((response) => {
          setStatistics({
            ...normalizePermitSegmentStatistics(response),
            errorMessage: null,
            isLoading: false,
            source: "static",
          });
        })
        .catch((error: unknown) => {
          setStatistics({
            ...emptyPermitSegmentStatistics("static"),
            errorMessage:
              error instanceof Error
                ? error.message
                : "CFS demo permit segment statistics are unavailable.",
          });
        });
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getPermitSegmentStatistics({ signal: controller.signal })
      .then((response) => {
        setStatistics({
          ...normalizePermitSegmentStatistics(response),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setStatistics({
          ...emptyPermitSegmentStatistics("fallback"),
          errorMessage:
            error instanceof Error
              ? error.message
              : "Permit segment statistics are unavailable.",
        });
      });

    return () => controller.abort();
  }, []);

  return statistics;
}
