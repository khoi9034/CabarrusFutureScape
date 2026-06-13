"use client";

import { useEffect, useMemo, useState } from "react";
import { mapFloodZoneToPolygon } from "@/lib/adapters/floodZoneMapAdapter";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { getFloodZones } from "@/lib/api/constraints";
import type {
  FloodZoneControls,
  FloodZoneExtent,
  FloodZoneLayerState,
  FloodZoneMapPolygon,
  FloodZoneSeverityCounts,
} from "@/types/map/floodZones";

interface FloodZoneLayerOptions extends FloodZoneControls {
  enabled: boolean;
  extent?: FloodZoneExtent | null;
}

const emptySeverityCounts: FloodZoneSeverityCounts = {
  high: 0,
  low: 0,
  moderate: 0,
  severe: 0,
};

const offState: FloodZoneLayerState = {
  errorMessage: null,
  isLoading: false,
  polygons: [],
  severityCounts: emptySeverityCounts,
  source: "none",
  status: "off",
  totalCount: 0,
};

interface InternalFloodZoneLayerState extends FloodZoneLayerState {
  requestKey: string | null;
}

const initialState: InternalFloodZoneLayerState = {
  ...offState,
  requestKey: null,
};

export function useFloodZoneLayer({
  enabled,
  extent,
  limitMode,
  severity,
}: FloodZoneLayerOptions): FloodZoneLayerState {
  const [state, setState] =
    useState<InternalFloodZoneLayerState>(initialState);
  const extentParam =
    limitMode === "visible_extent" && extent ? formatExtent(extent) : undefined;
  const requestLimit =
    limitMode === "visible_extent" ? (extentParam ? 0 : 100) : Number(limitMode);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        extent: extentParam ?? null,
        limit: requestLimit,
        severity,
      }),
    [extentParam, requestLimit, severity],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const params = {
      extent: extentParam,
      flood_severity_class: severity === "all" ? undefined : severity,
      limit: requestLimit,
      offset: 0,
    };

    console.debug("[CFS FEMA flood zones]", "loading layer", {
      endpoint: new URL("/constraints/flood/zones", CFS_API_BASE_URL).toString(),
      params,
    });

    getFloodZones(params, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const polygons = response.zones
          .map(mapFloodZoneToPolygon)
          .filter((polygon): polygon is FloodZoneMapPolygon => Boolean(polygon));

        setState({
          errorMessage:
            polygons.length === 0 && response.total_count > 0
              ? "FEMA flood zones loaded, but no renderable polygon geometry was returned."
              : null,
          isLoading: false,
          polygons,
          requestKey,
          severityCounts: countFloodZoneSeverities(polygons),
          source: "api",
          status: getFloodZoneLayerStatus(polygons.length, response.total_count),
          totalCount: response.total_count,
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
              : "FEMA flood zone polygons are unavailable.",
          isLoading: false,
          polygons: [],
          requestKey,
          severityCounts: emptySeverityCounts,
          source: "none",
          status: "error",
          totalCount: 0,
        });
      });

    return () => controller.abort();
  }, [enabled, extentParam, requestKey, requestLimit, severity]);

  if (!enabled) {
    return offState;
  }

  if (!USE_BACKEND_API) {
    return {
      ...offState,
      errorMessage: "FEMA flood zone polygons require backend API mode.",
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

function countFloodZoneSeverities(
  polygons: FloodZoneMapPolygon[],
): FloodZoneSeverityCounts {
  return polygons.reduce<FloodZoneSeverityCounts>(
    (counts, polygon) => {
      if (polygon.floodSeverityClass) {
        counts[polygon.floodSeverityClass] += 1;
      }
      return counts;
    },
    { ...emptySeverityCounts },
  );
}

function formatExtent(extent: FloodZoneExtent) {
  return [
    extent.xmin,
    extent.ymin,
    extent.xmax,
    extent.ymax,
  ]
    .map((value) => value.toFixed(6))
    .join(",");
}

function getFloodZoneLayerStatus(
  polygonCount: number,
  totalCount: number,
): FloodZoneLayerState["status"] {
  if (polygonCount > 0) {
    return "ready";
  }

  return totalCount === 0 ? "empty" : "unavailable";
}
