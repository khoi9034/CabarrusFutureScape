"use client";

import { useEffect, useState } from "react";
import { USE_BACKEND_API } from "@/lib/api/client";
import {
  getDevelopmentPredictionFeaturesSummary,
  getDevelopmentPredictionRankingSummary,
} from "@/lib/api/development";
import type {
  DevelopmentPredictionFeaturesSummaryResponse,
  DevelopmentPredictionRankingClassBucket,
  DevelopmentPredictionRankingSummaryResponse,
} from "@/types/api";

const documentedDistribution: DevelopmentPredictionRankingClassBucket[] = [
  {
    development_signal_class: "very_high_development_signal",
    pct_of_rows: 1.0008,
    row_count: 1101,
  },
  {
    development_signal_class: "high_development_signal",
    pct_of_rows: 3.9994,
    row_count: 4400,
  },
  {
    development_signal_class: "moderate_development_signal",
    pct_of_rows: 10.0003,
    row_count: 11002,
  },
  {
    development_signal_class: "low_development_signal",
    pct_of_rows: 84.9996,
    row_count: 93514,
  },
];

const documentedRankingSummary: DevelopmentPredictionRankingSummaryResponse = {
  calibration_status: "weak_probability_calibration",
  caveat: "internal_ranking_research_not_for_public_decision",
  class_distribution: documentedDistribution,
  exact_probabilities_exposed: false,
  experiment_id: "phase10e_zoning_enhanced_v1",
  explanation_available: true,
  explanation_row_count: 110017,
  no_parcel_level_scores: true,
  prediction_probability_available: false,
  production_ready: false,
  public_exposure_allowed: false,
  ranking_available: true,
  ranking_row_count: 110017,
  unique_parcel_count: 110017,
};

export const standardizedDevelopmentPredictionMetrics = {
  baselineLiftAtTop5: 1.265508,
  baselinePrAuc: 0.054665,
  target: "new construction permit within next 3 years",
  zoningEnhancedLiftAtTop5: 1.774988,
  zoningEnhancedPrAuc: 0.071174,
};

export const developmentPredictionRoadmap = [
  "Add official rezoning case dates if available.",
  "Add adopted future land use context.",
  "Add road/accessibility and utility service features.",
  "Add verified school capacity and enrollment data.",
  "Improve calibration and temporal validation.",
  "Decide whether ranked classes can be shown as an experimental planning signal.",
];

export const developmentPredictionPublicBlockers = [
  "Weak probability calibration.",
  "Missing official rezoning case dates.",
  "Missing future land use, utility, and road accessibility features.",
  "Official school capacity has not been added.",
  "Economic and market controls are not yet included.",
  "Governance and validation review is still required.",
];

export interface DevelopmentPredictionResearchStatus {
  errorMessage: string | null;
  featuresSummary: DevelopmentPredictionFeaturesSummaryResponse | null;
  isLoading: boolean;
  rankingSummary: DevelopmentPredictionRankingSummaryResponse;
  source: "api" | "documented" | "loading";
}

export function useDevelopmentPredictionResearchStatus() {
  const [status, setStatus] = useState<DevelopmentPredictionResearchStatus>({
    errorMessage: null,
    featuresSummary: null,
    isLoading: USE_BACKEND_API,
    rankingSummary: documentedRankingSummary,
    source: USE_BACKEND_API ? "loading" : "documented",
  });

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      getDevelopmentPredictionFeaturesSummary({ signal: controller.signal }),
      getDevelopmentPredictionRankingSummary({ signal: controller.signal }),
    ])
      .then(([featuresSummary, rankingSummary]) => {
        setStatus({
          errorMessage: null,
          featuresSummary,
          isLoading: false,
          rankingSummary: {
            ...documentedRankingSummary,
            ...rankingSummary,
            class_distribution:
              rankingSummary.class_distribution.length > 0
                ? rankingSummary.class_distribution
                : documentedDistribution,
          },
          source: "api",
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setStatus({
          errorMessage:
            error instanceof Error
              ? error.message
              : "Development prediction research status is unavailable.",
          featuresSummary: null,
          isLoading: false,
          rankingSummary: documentedRankingSummary,
          source: "documented",
        });
      });

    return () => controller.abort();
  }, []);

  return status;
}
