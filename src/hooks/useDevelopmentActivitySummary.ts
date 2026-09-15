"use client";

import { useEffect, useState } from "react";
import {
  getStaticDevelopmentActivitySummary,
  getUnavailableDevelopmentActivitySummary,
  normalizeDevelopmentActivitySummary,
  type DevelopmentActivitySummaryViewModel,
} from "@/lib/adapters/developmentActivitySummaryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDevelopmentActivitySummary } from "@/lib/api/development";
import { getDemoDevelopmentActivitySummaryResponse } from "@/lib/demo-data/client";

const summaryCache = new Map<string, DevelopmentActivitySummaryViewModel>();

export function useDevelopmentActivitySummary({ dateEnd = null, dateStart = null, enabled = true }: { dateEnd?: string | null; dateStart?: string | null; enabled?: boolean } = {}) {
  const queryKey = `${dateStart ?? ""}|${dateEnd ?? ""}`;
  const [summary, setSummary] = useState<DevelopmentActivitySummaryViewModel & { queryKey: string }>(
    () => {
      const cached = summaryCache.get(queryKey);
      if (cached) return { ...cached, queryKey };
      const staticSummary = USE_DEMO_DATA
        ? getStaticDevelopmentActivitySummary()
        : getUnavailableDevelopmentActivitySummary();

      return USE_BACKEND_API
        ? {
            ...staticSummary,
            isLoading: true,
            queryKey,
            source: "loading",
          }
        : { ...staticSummary, queryKey };
    },
  );

  useEffect(() => {
    if (!enabled) return;
    const cached = summaryCache.get(queryKey);
    if (cached) {
      setSummary({ ...cached, queryKey });
      return;
    }
    if (USE_DEMO_DATA) {
      let active = true;
      getDemoDevelopmentActivitySummaryResponse({ dateEnd, dateStart })
        .then((activitySummary) => {
          if (!active) return;
          const next = {
            ...normalizeDevelopmentActivitySummary(activitySummary),
            errorMessage: null,
            isLoading: false,
            source: "static",
          } as DevelopmentActivitySummaryViewModel;
          summaryCache.set(queryKey, next);
          setSummary({ ...next, queryKey });
        })
        .catch((error: unknown) => {
          if (!active) return;
          const fallbackSummary = getStaticDevelopmentActivitySummary();
          setSummary({
            ...fallbackSummary,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Demo development activity summary is unavailable.",
            isLoading: false,
            queryKey,
            source: "static",
          });
        });
      return () => { active = false; };
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    setSummary((current) => ({ ...current, isLoading: true, queryKey, source: "loading" }));

    getDevelopmentActivitySummary(
      {
        date_end: dateEnd ?? undefined,
        date_start: dateStart ?? undefined,
      },
      { signal: controller.signal },
    )
      .then((activitySummary) => {
        const next = {
          ...normalizeDevelopmentActivitySummary(activitySummary),
          errorMessage: null,
          isLoading: false,
          source: "api",
        } as DevelopmentActivitySummaryViewModel;
        summaryCache.set(queryKey, next);
        setSummary({ ...next, queryKey });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackSummary = getUnavailableDevelopmentActivitySummary();
        setSummary({
          ...fallbackSummary,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Live development activity summary is unavailable.",
          isLoading: false,
          queryKey,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, [dateEnd, dateStart, enabled, queryKey]);

  return summary;
}
