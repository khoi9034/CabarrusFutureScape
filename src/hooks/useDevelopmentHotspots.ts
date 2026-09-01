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

export function useDevelopmentHotspots() {
  const [hotspots, setHotspots] = useState<DevelopmentHotspotsViewModel>(() => {
    const staticHotspots = USE_DEMO_DATA
      ? getStaticDevelopmentHotspots()
      : getUnavailableDevelopmentHotspots();

    return USE_BACKEND_API
      ? {
          ...staticHotspots,
          isLoading: true,
          source: "loading",
        }
      : staticHotspots;
  });

  useEffect(() => {
    if (USE_DEMO_DATA) {
      let active = true;
      void getDemoManagementDevelopmentHotspots()
        .then((markers) => {
          if (!active) return;
          setHotspots((current) => ({ ...current, markers }));
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
        sort_by: "development_activity_score",
      },
      { signal: controller.signal },
    )
      .then((developmentHotspots) => {
        setHotspots({
          ...normalizeDevelopmentHotspots(developmentHotspots),
          errorMessage: null,
          isLoading: false,
          source: "api",
        });
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
              : "CFS API development hotspots are unavailable.",
          isLoading: false,
          source: "fallback",
        });
      });

    return () => controller.abort();
  }, []);

  return hotspots;
}
