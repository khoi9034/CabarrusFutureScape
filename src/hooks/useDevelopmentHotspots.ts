"use client";

import { useEffect, useState } from "react";
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
    if (hotspotCache.has(queryKey)) return;
    if (USE_DEMO_DATA) {
      let active = true;
      const wholeYears = Boolean(dateStart?.endsWith("-01-01") && dateEnd?.endsWith("-12-31"));
      void (wholeYears
        ? getDemoManagementDevelopmentHotspots(40, { yearEnd: Number(dateEnd?.slice(0, 4)), yearStart: Number(dateStart?.slice(0, 4)) })
        : Promise.resolve([]))
        .then((markers) => {
          if (!active) return;
          setHotspots((current) => {
            const next = { ...current, markers, queryKey, totalCount: markers.length };
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

    getDevelopmentHotspots(
      {
        limit: 10,
        date_end: dateEnd ?? undefined,
        sort_by: "development_activity_score",
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
