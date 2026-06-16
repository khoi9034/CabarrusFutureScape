"use client";

import { useEffect, useState } from "react";
import { getApiErrorDisplayMessage, USE_BACKEND_API } from "@/lib/api/client";
import {
  getTransportationAccessibilitySummary,
  getTransportationPlanTrafficSummary,
} from "@/lib/api/development";
import type {
  DevelopmentPredictionTransportationAccessibilitySummaryResponse,
  DevelopmentPredictionTransportationPlanTrafficSummaryResponse,
} from "@/types/api";

export interface TransportationContextSummaryState {
  accessibility: DevelopmentPredictionTransportationAccessibilitySummaryResponse | null;
  errorMessage: string | null;
  isLoading: boolean;
  planTraffic: DevelopmentPredictionTransportationPlanTrafficSummaryResponse | null;
  source: "api" | "loading" | "unavailable";
}

export function useTransportationContextSummary(): TransportationContextSummaryState {
  const [state, setState] = useState<TransportationContextSummaryState>({
    accessibility: null,
    errorMessage: null,
    isLoading: USE_BACKEND_API,
    planTraffic: null,
    source: USE_BACKEND_API ? "loading" : "unavailable",
  });

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();
    const options = { signal: controller.signal, timeoutMs: 45000 };

    Promise.allSettled([
      getTransportationAccessibilitySummary(options),
      getTransportationPlanTrafficSummary(options),
    ]).then(([accessibilityResult, planTrafficResult]) => {
      if (controller.signal.aborted) {
        return;
      }

      const accessibility =
        accessibilityResult.status === "fulfilled"
          ? accessibilityResult.value
          : null;
      const planTraffic =
        planTrafficResult.status === "fulfilled"
          ? planTrafficResult.value
          : null;
      const firstError =
        accessibilityResult.status === "rejected"
          ? accessibilityResult.reason
          : planTrafficResult.status === "rejected"
            ? planTrafficResult.reason
            : null;

      setState({
        accessibility,
        errorMessage: firstError
          ? getApiErrorDisplayMessage(
              firstError,
              "Transportation context summaries are unavailable.",
            )
          : null,
        isLoading: false,
        planTraffic,
        source: accessibility || planTraffic ? "api" : "unavailable",
      });
    });

    return () => controller.abort();
  }, []);

  if (!USE_BACKEND_API) {
    return {
      accessibility: null,
      errorMessage: "Transportation summaries require backend API mode.",
      isLoading: false,
      planTraffic: null,
      source: "unavailable",
    };
  }

  return state;
}
