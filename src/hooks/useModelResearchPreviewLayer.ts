"use client";

import { useEffect, useMemo, useState } from "react";
import { getDevelopmentModelResearchPreview } from "@/lib/api/development";
import {
  getApiErrorDisplayMessage,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { getDemoModelLabMarkers } from "@/lib/demo-data/mapLayerClient";
import type {
  ModelResearchPreviewLayerState,
  ModelResearchPreviewMarker,
} from "@/types/map/modelResearchPreview";
import type {
  DevelopmentModelResearchPreviewFeatureResponse,
  DevelopmentModelResearchPreviewResponse,
} from "@/types/api";

interface ModelResearchPreviewLayerOptions {
  enabled: boolean;
  limit?: number;
  signal?: "all" | "higher" | "lower" | "moderate";
}

const offState: ModelResearchPreviewLayerState = {
  caveat: "Internal model research preview only. No exact probabilities are shown.",
  errorMessage: null,
  isLoading: false,
  markers: [],
  source: "none",
  status: "off",
  totalCount: 0,
};

interface InternalModelResearchPreviewLayerState
  extends ModelResearchPreviewLayerState {
  requestKey: string | null;
}

const initialState: InternalModelResearchPreviewLayerState = {
  ...offState,
  requestKey: null,
};

export function useModelResearchPreviewLayer({
  enabled,
  limit = 500,
  signal = "higher",
}: ModelResearchPreviewLayerOptions): ModelResearchPreviewLayerState {
  const [state, setState] =
    useState<InternalModelResearchPreviewLayerState>(initialState);
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        limit,
        signal,
      }),
    [limit, signal],
  );

  useEffect(() => {
    if (!enabled || !USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getModelResearchPreviewResponse({
      limit,
      signal,
      signalController: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const markers = response.features
          .map(mapPreviewFeatureToMarker)
          .filter((marker): marker is ModelResearchPreviewMarker =>
            Boolean(marker),
          );

        setState({
          caveat: response.caveat,
          errorMessage:
            markers.length === 0 && response.total_count > 0
              ? "Research preview records loaded, but none included map-safe centroids."
              : null,
          isLoading: false,
          markers,
          requestKey,
          source: "api",
          status:
            markers.length > 0
              ? "ready"
              : response.preview_available
                ? "empty"
                : "unavailable",
          totalCount: response.total_count,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          ...offState,
          errorMessage: getApiErrorDisplayMessage(
            error,
            "Model research preview markers are unavailable.",
          ),
          isLoading: false,
          requestKey,
          status: "error",
        });
      });

    return () => controller.abort();
  }, [enabled, limit, requestKey, signal]);

  useEffect(() => {
    if (!enabled || !USE_DEMO_DATA) {
      return;
    }

    let cancelled = false;

    getDemoModelLabMarkers({ limit, signal })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setState({
          caveat: response.caveat,
          errorMessage:
            response.markers.length === 0
              ? "Portfolio demo model research markers are not available."
              : null,
          isLoading: false,
          markers: response.markers,
          requestKey,
          source: "demo",
          status: response.markers.length > 0 ? "ready" : "unavailable",
          totalCount: response.totalCount,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({
          ...offState,
          errorMessage: "Portfolio demo model research markers are unavailable.",
          isLoading: false,
          requestKey,
          status: "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, limit, requestKey, signal]);

  if (!enabled) {
    return offState;
  }

  if (!USE_BACKEND_API && !USE_DEMO_DATA) {
    return {
      ...offState,
      errorMessage: "Model research preview markers require backend API mode.",
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

async function getModelResearchPreviewResponse({
  limit,
  signal,
  signalController,
}: {
  limit: number;
  signal: "all" | "higher" | "lower" | "moderate";
  signalController: AbortSignal;
}): Promise<DevelopmentModelResearchPreviewResponse> {
  if (signal !== "all") {
    return getDevelopmentModelResearchPreview(
      {
        include_geometry: false,
        limit,
        signal,
      },
      { signal: signalController },
    );
  }

  const higherLimit = Math.max(1, Math.round(limit * 0.42));
  const moderateLimit = Math.max(1, Math.round(limit * 0.33));
  const lowerLimit = Math.max(1, limit - higherLimit - moderateLimit);
  const [higher, moderate, lower] = await Promise.all([
    getDevelopmentModelResearchPreview(
      {
        include_geometry: false,
        limit: higherLimit,
        signal: "higher",
      },
      { signal: signalController },
    ),
    getDevelopmentModelResearchPreview(
      {
        include_geometry: false,
        limit: moderateLimit,
        signal: "moderate",
      },
      { signal: signalController },
    ),
    getDevelopmentModelResearchPreview(
      {
        include_geometry: false,
        limit: lowerLimit,
        signal: "lower",
      },
      { signal: signalController },
    ),
  ]);

  return {
    ...higher,
    caveat: "internal_model_research_preview_not_for_public_decision",
    features: [...higher.features, ...moderate.features, ...lower.features],
    limit,
    no_exact_probabilities:
      higher.no_exact_probabilities &&
      moderate.no_exact_probabilities &&
      lower.no_exact_probabilities,
    no_official_prediction_classes:
      higher.no_official_prediction_classes &&
      moderate.no_official_prediction_classes &&
      lower.no_official_prediction_classes,
    no_raw_model_scores:
      higher.no_raw_model_scores &&
      moderate.no_raw_model_scores &&
      lower.no_raw_model_scores,
    preview_available:
      higher.preview_available ||
      moderate.preview_available ||
      lower.preview_available,
    returned_count:
      higher.returned_count + moderate.returned_count + lower.returned_count,
    signal_filter: "all",
    total_count: higher.total_count + moderate.total_count + lower.total_count,
  };
}

function mapPreviewFeatureToMarker(
  feature: DevelopmentModelResearchPreviewFeatureResponse,
): ModelResearchPreviewMarker | null {
  const latitude = feature.centroid?.latitude;
  const longitude = feature.centroid?.longitude;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    feature.exact_probability_available ||
    feature.production_ready ||
    feature.public_exposure_allowed
  ) {
    return null;
  }

  return {
    caveat:
      feature.caveat ||
      "Internal research preview only. Not an official parcel score.",
    centroid: {
      latitude,
      longitude,
      spatialReference: feature.centroid?.spatial_reference ?? { wkid: 4326 },
    },
    dataQualityFlag:
      feature.data_quality_flag || "research_preview_context_only",
    exactProbabilityAvailable: false,
    modelVersion: feature.model_version,
    officialParcelId: feature.official_parcel_id,
    productionReady: false,
    publicExposureAllowed: false,
    researchRankBand: feature.research_rank_band,
    researchSignalLabel: feature.research_signal_label,
    topDrivers: [
      feature.top_driver_1,
      feature.top_driver_2,
      feature.top_driver_3,
    ].filter((driver): driver is string => Boolean(driver)),
  };
}
