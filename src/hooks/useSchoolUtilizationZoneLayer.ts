"use client";

import { useEffect, useMemo, useState } from "react";
import { mapSchoolUtilizationZoneToPolygon } from "@/lib/adapters/schoolUtilizationZoneMapAdapter";
import {
  CFS_API_BASE_URL,
  getApiErrorDisplayMessage,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { getSchoolUtilizationZones } from "@/lib/api/constraints";
import { getDemoSchoolUtilizationPolygons } from "@/lib/demo-data/mapLayerClient";
import type {
  SchoolUtilizationClassCounts,
  SchoolUtilizationZoneControls,
  SchoolUtilizationZoneLayerState,
  SchoolUtilizationZoneMapPolygon,
} from "@/types/map/schoolUtilizationZones";

interface SchoolUtilizationZoneLayerOptions
  extends SchoolUtilizationZoneControls {
  enabled: boolean;
}

const emptyClassCounts: SchoolUtilizationClassCounts = {
  approaching_capacity: 0,
  near_capacity: 0,
  over_capacity: 0,
  severely_over_capacity: 0,
  under_capacity: 0,
};

const offState: SchoolUtilizationZoneLayerState = {
  caveats: [],
  classCounts: emptyClassCounts,
  errorMessage: null,
  isLoading: false,
  polygons: [],
  source: "none",
  status: "off",
  totalCount: 0,
};

interface InternalSchoolUtilizationZoneLayerState
  extends SchoolUtilizationZoneLayerState {
  requestKey: string | null;
}

const initialState: InternalSchoolUtilizationZoneLayerState = {
  ...offState,
  requestKey: null,
};

export function useSchoolUtilizationZoneLayer({
  enabled,
  level,
  limit,
  utilizationClass,
}: SchoolUtilizationZoneLayerOptions): SchoolUtilizationZoneLayerState {
  const [state, setState] =
    useState<InternalSchoolUtilizationZoneLayerState>(initialState);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        level,
        limit,
        utilizationClass,
      }),
    [level, limit, utilizationClass],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const params = {
      level,
      limit,
      offset: 0,
      utilization_class:
        utilizationClass === "all" ? undefined : utilizationClass,
    };

    console.debug("[CFS school utilization zones]", "loading layer", {
      endpoint: new URL(
        "/constraints/schools/utilization-zones",
        CFS_API_BASE_URL,
      ).toString(),
      params,
    });

    getSchoolUtilizationZones(params, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const polygons = response.zones
          .map(mapSchoolUtilizationZoneToPolygon)
          .filter(
            (
              polygon,
            ): polygon is SchoolUtilizationZoneMapPolygon =>
              Boolean(polygon),
          );

        setState({
          caveats: response.caveats,
          classCounts: countUtilizationClasses(polygons),
          errorMessage:
            polygons.length === 0 && response.total_count > 0
              ? "School utilization zones loaded, but no renderable zone geometry was returned."
              : null,
          isLoading: false,
          polygons,
          requestKey,
          source: "api",
          status: getLayerStatus(polygons.length, response.total_count),
          totalCount: response.total_count,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          caveats: [],
          classCounts: emptyClassCounts,
          errorMessage: getApiErrorDisplayMessage(
            error,
            "School utilization zones are unavailable.",
          ),
          isLoading: false,
          polygons: [],
          requestKey,
          source: "none",
          status: "error",
          totalCount: 0,
        });
      });

    return () => controller.abort();
  }, [enabled, level, limit, requestKey, utilizationClass]);

  useEffect(() => {
    if (!enabled || !USE_DEMO_DATA) {
      return;
    }

    let cancelled = false;

    getDemoSchoolUtilizationPolygons({
      level,
      limit,
      utilizationClass,
    })
      .then((polygons) => {
        if (cancelled) {
          return;
        }

        setState({
          caveats: [
            "Preliminary utilization from planning materials. Confirm with official enrollment and capacity.",
          ],
          classCounts: countUtilizationClasses(polygons),
          errorMessage:
            polygons.length === 0
              ? "Demo school capacity watch layer is not included in this sample."
              : null,
          isLoading: false,
          polygons,
          requestKey,
          source: "demo",
          status: polygons.length > 0 ? "ready" : "empty",
          totalCount: polygons.length,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({
          caveats: [],
          classCounts: emptyClassCounts,
          errorMessage: "Demo school capacity watch layer is unavailable.",
          isLoading: false,
          polygons: [],
          requestKey,
          source: "none",
          status: "error",
          totalCount: 0,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, level, limit, requestKey, utilizationClass]);

  if (!enabled) {
    return offState;
  }

  if (!USE_BACKEND_API && !USE_DEMO_DATA) {
    return {
      ...offState,
      errorMessage: "School utilization zones require backend API mode.",
      status: "unavailable",
    };
  }

  if (USE_DEMO_DATA && state.requestKey !== requestKey) {
    return {
      ...offState,
      isLoading: true,
      status: "loading",
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

function countUtilizationClasses(
  polygons: SchoolUtilizationZoneMapPolygon[],
): SchoolUtilizationClassCounts {
  return polygons.reduce<SchoolUtilizationClassCounts>(
    (counts, polygon) => {
      if (polygon.utilizationClass) {
        counts[polygon.utilizationClass] += 1;
      }
      return counts;
    },
    { ...emptyClassCounts },
  );
}

function getLayerStatus(
  polygonCount: number,
  totalCount: number,
): SchoolUtilizationZoneLayerState["status"] {
  if (polygonCount > 0) {
    return "ready";
  }

  return totalCount === 0 ? "empty" : "unavailable";
}
