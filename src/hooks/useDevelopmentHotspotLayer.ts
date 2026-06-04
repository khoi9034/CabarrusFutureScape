"use client";

import { useEffect, useMemo, useState } from "react";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  getDevelopmentHotspots,
  type DevelopmentHotspotsParams,
} from "@/lib/api/development";
import { normalizeDevelopmentHotspotMapMarkers } from "@/lib/adapters/developmentHotspotMapAdapter";
import type {
  DevelopmentHotspotActivityClassFilter,
  DevelopmentHotspotLayerState,
  DevelopmentHotspotLimit,
  DevelopmentHotspotSortBy,
} from "@/types/map/developmentHotspots";

interface DevelopmentHotspotLayerOptions {
  activityClass?: DevelopmentHotspotActivityClassFilter;
  enabled: boolean;
  limit?: DevelopmentHotspotLimit;
  recentWindow?: 1 | 3;
  sortBy?: Extract<
    DevelopmentHotspotsParams["sort_by"],
    DevelopmentHotspotSortBy
  >;
  zoningJurisdiction?: string;
}

const offState: DevelopmentHotspotLayerState = {
  errorMessage: null,
  isLoading: false,
  markers: [],
  source: "none",
  status: "off",
  totalCount: 0,
};

interface InternalDevelopmentHotspotLayerState
  extends DevelopmentHotspotLayerState {
  requestKey: string | null;
}

const initialState: InternalDevelopmentHotspotLayerState = {
  ...offState,
  requestKey: null,
};

export function useDevelopmentHotspotLayer({
  activityClass = "very_high_activity",
  enabled,
  limit = 100,
  recentWindow,
  sortBy = "development_activity_score",
  zoningJurisdiction,
}: DevelopmentHotspotLayerOptions): DevelopmentHotspotLayerState {
  const [state, setState] =
    useState<InternalDevelopmentHotspotLayerState>(initialState);

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activityClass,
        limit,
        recentWindow,
        sortBy,
        zoningJurisdiction,
      }),
    [activityClass, limit, recentWindow, sortBy, zoningJurisdiction],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentHotspots(
      {
        activity_class: activityClass,
        limit,
        offset: 0,
        recent_window: recentWindow,
        sort_by: sortBy,
        zoning_jurisdiction: zoningJurisdiction,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        const { markers, totalCount } =
          normalizeDevelopmentHotspotMapMarkers(response);

        setState({
          errorMessage:
            markers.length === 0 && totalCount > 0
              ? "Hotspot records loaded, but none included map-safe centroid coordinates."
              : null,
          isLoading: false,
          markers,
          requestKey,
          source: "api",
          status:
            markers.length > 0
              ? "ready"
              : totalCount === 0
                ? "empty"
                : "unavailable",
          totalCount,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          errorMessage:
            error instanceof Error
              ? error.message
              : "Development hotspot map markers are unavailable.",
          isLoading: false,
          markers: [],
          requestKey,
          source: "none",
          status: "error",
          totalCount: 0,
        });
      });

    return () => controller.abort();
  }, [
    activityClass,
    enabled,
    limit,
    recentWindow,
    requestKey,
    sortBy,
    zoningJurisdiction,
  ]);

  if (!enabled) {
    return offState;
  }

  if (!USE_BACKEND_API) {
    return {
      ...offState,
      errorMessage:
        "Development hotspot map markers require backend API mode because generated static hotspot artifacts do not include coordinates.",
      status: "unavailable",
    };
  }

  if (state.requestKey !== requestKey) {
    return {
      ...offState,
      isLoading: true,
      status: "loading",
    };
  }

  return state;
}
