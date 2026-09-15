"use client";

import { useEffect, useState } from "react";
import { getStaticDevelopmentActivitySummary } from "@/lib/adapters/developmentActivitySummaryAdapter";
import {
  getStaticDevelopmentHotspots,
  getUnavailableDevelopmentHotspots,
  normalizeDevelopmentHotspots,
  type DevelopmentHotspotsViewModel,
} from "@/lib/adapters/developmentHotspotsAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDevelopmentHotspots } from "@/lib/api/development";
import { getDemoManagementDevelopmentHotspots } from "@/lib/demo-data/mapLayerClient";

const hotspotCache = new Map<string, DevelopmentHotspotsViewModel>();

export function useDevelopmentHotspots({ dateEnd = null, dateStart = null, enabled = true }: { dateEnd?: string | null; dateStart?: string | null; enabled?: boolean } = {}) {
  const queryKey = `${dateStart ?? ""}|${dateEnd ?? ""}`;
  const [hotspots, setHotspots] = useState<DevelopmentHotspotsViewModel & { queryKey: string }>(() => {
    const cached = hotspotCache.get(queryKey);
    if (cached) return { ...cached, queryKey };
    const staticHotspots = USE_DEMO_DATA
      ? getStaticDevelopmentHotspots()
      : getUnavailableDevelopmentHotspots();

    return USE_BACKEND_API
      ? {
          ...staticHotspots,
          isLoading: true,
          queryKey,
          source: "loading",
        }
      : { ...staticHotspots, queryKey };
  });

  useEffect(() => {
    if (!enabled) return;
    const cached = hotspotCache.get(queryKey);
    if (cached) {
      setHotspots({ ...cached, queryKey });
      return;
    }
    if (USE_DEMO_DATA) {
      let active = true;
      const coverage = getStaticDevelopmentActivitySummary();
      const wholeYears = Boolean(
        dateStart && dateEnd && dateEnd.endsWith("-12-31")
        && (dateStart.endsWith("-01-01") || dateStart === coverage.activityDateMin),
      );
      void (wholeYears
        ? getDemoManagementDevelopmentHotspots(40, { yearEnd: Number(dateEnd?.slice(0, 4)), yearStart: Number(dateStart?.slice(0, 4)) })
        : Promise.resolve([]))
        .then((markers) => {
          if (!active) return;
          setHotspots((current) => {
            const next = {
              ...current,
              analysisPeriod: dateStart && dateEnd ? { endDate: dateEnd, startDate: dateStart } : null,
              markers,
              queryKey,
              totalCount: markers.length,
            };
            hotspotCache.set(queryKey, next);
            return next;
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }

    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    setHotspots((current) => ({ ...current, isLoading: true, queryKey, source: "loading" }));

    getDevelopmentHotspots(
      {
        limit: 10,
        date_end: dateEnd ?? undefined,
        sort_by: "total_permit_count",
        date_start: dateStart ?? undefined,
      },
      { signal: controller.signal },
    )
      .then((developmentHotspots) => {
        const next = {
          ...normalizeDevelopmentHotspots(developmentHotspots),
          errorMessage: null,
          isLoading: false,
          source: "api",
        } as DevelopmentHotspotsViewModel;
        hotspotCache.set(queryKey, next);
        setHotspots({ ...next, queryKey });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackHotspots = getUnavailableDevelopmentHotspots();
        setHotspots({
          ...fallbackHotspots,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Live development hotspots are unavailable.",
          isLoading: false,
          queryKey,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, [dateEnd, dateStart, enabled, queryKey]);

  return hotspots;
}
