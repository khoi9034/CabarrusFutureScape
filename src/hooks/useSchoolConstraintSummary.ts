"use client";

import { useEffect, useState } from "react";
import {
  getLoadingSchoolConstraintSummary,
  getUnavailableSchoolConstraintSummary,
  normalizeSchoolConstraintSummary,
  type SchoolConstraintSummaryViewModel,
} from "@/lib/adapters/schoolConstraintSummaryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getSchoolConstraintQaSummary,
  getSchoolConstraintStatistics,
  getSchoolUtilizationSeed,
} from "@/lib/api/constraints";
import {
  getDemoSchoolConstraintStatisticsResponse,
  getDemoSchoolQaSummaryResponse,
  getDemoSchoolUtilizationSeedResponse,
} from "@/lib/demo-data/client";

export function useSchoolConstraintSummary(): SchoolConstraintSummaryViewModel {
  const [summary, setSummary] = useState<SchoolConstraintSummaryViewModel>(() =>
    USE_BACKEND_API
      ? getLoadingSchoolConstraintSummary()
      : getUnavailableSchoolConstraintSummary(
          "School assignment summary requires backend API mode.",
        ),
  );

  useEffect(() => {
    if (USE_DEMO_DATA) {
      Promise.all([
        getDemoSchoolConstraintStatisticsResponse(),
        getDemoSchoolQaSummaryResponse(),
        getDemoSchoolUtilizationSeedResponse(),
      ])
        .then(([statistics, qaSummary, utilizationSeed]) => {
          setSummary({
            ...normalizeSchoolConstraintSummary(
              statistics,
              qaSummary,
              utilizationSeed,
            ),
            errorMessage: null,
            isLoading: false,
            source: "demo",
          });
        })
        .catch((error: unknown) => {
          setSummary(
            getUnavailableSchoolConstraintSummary(
              error instanceof Error
                ? error.message
                : "Demo school capacity watch is unavailable.",
            ),
          );
        });
      return;
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const requestOptions = {
      signal: controller.signal,
      timeoutMs: 45000,
    };

    Promise.all([
      getSchoolConstraintStatistics({}, requestOptions),
      getSchoolConstraintQaSummary(requestOptions),
      getSchoolUtilizationSeed({ limit: 500 }, requestOptions),
    ])
      .then(([statistics, qaSummary, utilizationSeed]) => {
        setSummary({
          ...normalizeSchoolConstraintSummary(
            statistics,
            qaSummary,
            utilizationSeed,
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

        setSummary(
          getUnavailableSchoolConstraintSummary(
            error instanceof Error
              ? error.message
              : "School assignment summary is unavailable.",
          ),
        );
      });

    return () => controller.abort();
  }, []);

  if (!USE_BACKEND_API && !USE_DEMO_DATA) {
    return getUnavailableSchoolConstraintSummary(
      "School assignment summary requires backend API mode.",
    );
  }

  return summary;
}
