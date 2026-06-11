"use client";

import { useEffect, useMemo, useState } from "react";
import { mapFloodConstraintToMarker } from "@/lib/adapters/floodConstraintMapAdapter";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { getFloodHighReview } from "@/lib/api/constraints";
import { getParcelDetail } from "@/lib/api/parcels";
import type {
  FloodConstraintLayerState,
  FloodConstraintMapMarker,
  FloodConstraintSeverityCounts,
} from "@/types/map/floodConstraints";

interface FloodConstraintLayerOptions {
  enabled: boolean;
  limit?: number;
}

const offState: FloodConstraintLayerState = {
  errorMessage: null,
  isLoading: false,
  markers: [],
  severityCounts: {
    high: 0,
    moderate: 0,
    severe: 0,
  },
  source: "none",
  status: "off",
  totalCount: 0,
};

interface InternalFloodConstraintLayerState extends FloodConstraintLayerState {
  requestKey: string | null;
}

const initialState: InternalFloodConstraintLayerState = {
  ...offState,
  requestKey: null,
};

export function useFloodConstraintLayer({
  enabled,
  limit = 100,
}: FloodConstraintLayerOptions): FloodConstraintLayerState {
  const [state, setState] =
    useState<InternalFloodConstraintLayerState>(initialState);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        limit,
      }),
    [limit],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const params = {
      limit,
      offset: 0,
    };

    console.debug("[CFS flood constraints]", "loading layer", {
      endpoint: new URL("/constraints/flood/high-review", CFS_API_BASE_URL).toString(),
      params,
    });

    getFloodHighReview(
      params,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const detailResults = await Promise.allSettled(
          response.results.map((constraint) =>
            getParcelDetail(
              constraint.official_parcel_id,
              {},
              { signal: controller.signal },
            ).then((parcelDetail) => ({
              constraint,
              parcelDetail,
            })),
          ),
        );

        if (controller.signal.aborted) {
          return;
        }

        const markers = detailResults
          .map((result) => {
            if (result.status !== "fulfilled") {
              return null;
            }

            return mapFloodConstraintToMarker(
              result.value.constraint,
              result.value.parcelDetail,
            );
          })
          .filter((marker): marker is NonNullable<typeof marker> =>
            Boolean(marker),
          );

        setState({
          errorMessage:
            markers.length === 0 && response.total_count > 0
              ? "Flood review records loaded, but none included map-safe parcel centroids."
              : null,
          isLoading: false,
          markers,
          requestKey,
          severityCounts: countFloodConstraintSeverities(markers),
          source: "api",
          status: getFloodConstraintLayerStatus(
            markers.length,
            response.total_count,
          ),
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
              : "Flood constraint map markers are unavailable.",
          isLoading: false,
          markers: [],
          requestKey,
          severityCounts: offState.severityCounts,
          source: "none",
          status: "error",
          totalCount: 0,
        });
      });

    return () => controller.abort();
  }, [enabled, limit, requestKey]);

  if (!enabled) {
    return offState;
  }

  if (!USE_BACKEND_API) {
    return {
      ...offState,
      errorMessage:
        "Flood constraint map markers require backend API mode.",
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

function countFloodConstraintSeverities(
  markers: FloodConstraintMapMarker[],
): FloodConstraintSeverityCounts {
  return markers.reduce<FloodConstraintSeverityCounts>(
    (counts, marker) => {
      if (marker.floodSeverityClass) {
        counts[marker.floodSeverityClass] += 1;
      }
      return counts;
    },
    {
      high: 0,
      moderate: 0,
      severe: 0,
    },
  );
}

function getFloodConstraintLayerStatus(
  markerCount: number,
  totalCount: number,
): FloodConstraintLayerState["status"] {
  if (markerCount > 0) {
    return "ready";
  }

  return totalCount === 0 ? "empty" : "unavailable";
}
