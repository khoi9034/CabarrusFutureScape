"use client";

import { useEffect, useMemo, useState } from "react";
import { USE_BACKEND_API } from "@/lib/api/client";
import type { DevelopmentTemporalFilters } from "@/data/intelligence/developmentTemporalIndex";
import {
  getDevelopmentHotspots,
  type DevelopmentHotspotsParams,
} from "@/lib/api/development";
import { normalizeDevelopmentHotspotMapMarkers } from "@/lib/adapters/developmentHotspotMapAdapter";
import type {
  DevelopmentHotspotActivityClassFilter,
  DevelopmentHotspotGrowthSignalFilter,
  DevelopmentHotspotLayerState,
  DevelopmentHotspotLimit,
  DevelopmentHotspotPermitSegmentFilter,
  DevelopmentHotspotSortBy,
  DevelopmentHotspotStatusStageFilter,
  DevelopmentHotspotValueClassFilter,
} from "@/types/map/developmentHotspots";

interface DevelopmentHotspotLayerOptions {
  activityClass?: DevelopmentHotspotActivityClassFilter;
  enabled: boolean;
  growthSignal?: DevelopmentHotspotGrowthSignalFilter;
  limit?: DevelopmentHotspotLimit;
  permitSegment?: DevelopmentHotspotPermitSegmentFilter;
  recentWindow?: 1 | 3;
  sortBy?: Extract<
    DevelopmentHotspotsParams["sort_by"],
    DevelopmentHotspotSortBy
  >;
  temporalFilters?: DevelopmentTemporalFilters;
  statusStage?: DevelopmentHotspotStatusStageFilter;
  valueClass?: DevelopmentHotspotValueClassFilter;
  zoningJurisdiction?: string;
}

const offState: DevelopmentHotspotLayerState = {
  errorMessage: null,
  isLoading: false,
  markers: [],
  source: "none",
  status: "off",
  temporalContextLabel: null,
  totalCount: 0,
};

const needsSegmentState: DevelopmentHotspotLayerState = {
  errorMessage: null,
  isLoading: false,
  markers: [],
  source: "none",
  status: "needs_segment",
  temporalContextLabel: null,
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
  activityClass = "all",
  enabled,
  growthSignal = "all",
  limit = 100,
  permitSegment = "all",
  recentWindow,
  sortBy = "development_activity_score",
  statusStage = "all",
  temporalFilters,
  valueClass = "all",
  zoningJurisdiction,
}: DevelopmentHotspotLayerOptions): DevelopmentHotspotLayerState {
  const [state, setState] =
    useState<InternalDevelopmentHotspotLayerState>(initialState);
  const temporalParams = useMemo(
    () => buildTemporalHotspotParams(temporalFilters),
    [temporalFilters],
  );
  const temporalContextLabel = useMemo(
    () => buildTemporalHotspotContextLabel(temporalFilters),
    [temporalFilters],
  );

  const requestKey = useMemo(
    () =>
      JSON.stringify({
        activityClass,
        growthSignal,
        limit,
        permitSegment,
        recentWindow,
        sortBy,
        statusStage,
        temporalParams,
        valueClass,
        zoningJurisdiction,
      }),
    [
      activityClass,
      growthSignal,
      limit,
      permitSegment,
      recentWindow,
      sortBy,
      statusStage,
      temporalParams,
      valueClass,
      zoningJurisdiction,
    ],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API || permitSegment === "all") {
      return;
    }

    const controller = new AbortController();

    getDevelopmentHotspots(
      {
        activity_class: activityClass === "all" ? undefined : activityClass,
        growth_signal: growthSignal === "all" ? undefined : growthSignal,
        limit,
        offset: 0,
        permit_segment: permitSegment,
        permit_status_stage: statusStage === "all" ? undefined : statusStage,
        permit_value_class: valueClass === "all" ? undefined : valueClass,
        recent_window: recentWindow,
        sort_by: sortBy,
        ...temporalParams,
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
          status: getDevelopmentHotspotLayerStatus(
            markers.length,
            totalCount,
          ),
          temporalContextLabel,
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
          temporalContextLabel,
          totalCount: 0,
        });
      });

    return () => controller.abort();
  }, [
    activityClass,
    enabled,
    growthSignal,
    limit,
    permitSegment,
    recentWindow,
    requestKey,
    sortBy,
    statusStage,
    temporalContextLabel,
    temporalParams,
    valueClass,
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

  if (permitSegment === "all") {
    return {
      ...needsSegmentState,
      temporalContextLabel,
    };
  }

  if (state.requestKey !== requestKey) {
    return {
      ...offState,
      isLoading: true,
      status: "loading",
      temporalContextLabel,
    };
  }

  return state;
}

function getDevelopmentHotspotLayerStatus(
  markerCount: number,
  totalCount: number,
): DevelopmentHotspotLayerState["status"] {
  if (markerCount > 0) {
    return "ready";
  }

  return totalCount === 0 ? "empty" : "unavailable";
}

function buildTemporalHotspotParams(
  filters: DevelopmentTemporalFilters | undefined,
): Pick<
  DevelopmentHotspotsParams,
  "date_end" | "date_start" | "month" | "rolling_window" | "year"
> {
  if (!filters) {
    return {};
  }

  return {
    date_end: filters.selectedDateRange.end ?? undefined,
    date_start: filters.selectedDateRange.start ?? undefined,
    month: filters.selectedMonth ?? undefined,
    rolling_window: filters.selectedRollingWindow ?? undefined,
    year: filters.selectedYear ?? undefined,
  };
}

function buildTemporalHotspotContextLabel(
  filters: DevelopmentTemporalFilters | undefined,
) {
  if (!filters) {
    return null;
  }

  if (filters.selectedRollingWindow) {
    return `Rolling ${filters.selectedRollingWindow} month activity context`;
  }

  if (filters.selectedDateRange.start || filters.selectedDateRange.end) {
    if (filters.selectedDateRange.start && filters.selectedDateRange.end) {
      return `${filters.selectedDateRange.start} to ${filters.selectedDateRange.end} activity context`;
    }

    if (filters.selectedDateRange.start) {
      return `Since ${filters.selectedDateRange.start} activity context`;
    }

    return `Through ${filters.selectedDateRange.end} activity context`;
  }

  if (filters.selectedYear && filters.selectedMonth) {
    return `${filters.selectedYear}-${String(filters.selectedMonth).padStart(2, "0")} activity context`;
  }

  if (filters.selectedYear) {
    return `${filters.selectedYear} activity context`;
  }

  return null;
}
