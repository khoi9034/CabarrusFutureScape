import type { FloodConstraintSummaryResponse } from "@/types/api";

export type FloodConstraintSummarySource =
  | "api"
  | "loading"
  | "unavailable";

export interface FloodConstraintSummaryMetric {
  accent: string;
  id: string;
  label: string;
  value: string;
}

export interface FloodConstraintSummaryViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  metrics: FloodConstraintSummaryMetric[];
  source: FloodConstraintSummarySource;
  totalParcels: number;
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCount(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

export function getUnavailableFloodConstraintSummary(
  errorMessage: string | null = null,
): FloodConstraintSummaryViewModel {
  return {
    errorMessage,
    isLoading: false,
    metrics: [],
    source: "unavailable",
    totalParcels: 0,
  };
}

export function getLoadingFloodConstraintSummary(): FloodConstraintSummaryViewModel {
  return {
    errorMessage: null,
    isLoading: true,
    metrics: [],
    source: "loading",
    totalParcels: 0,
  };
}

export function normalizeFloodConstraintSummary(
  response: FloodConstraintSummaryResponse,
): Omit<FloodConstraintSummaryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || typeof response.total_parcels !== "number") {
    throw new Error("Flood constraint summary API returned an invalid shape.");
  }

  return {
    metrics: [
      {
        accent: "#68d8ff",
        id: "total-parcels",
        label: "Total Parcels",
        value: formatCount(response.total_parcels),
      },
      {
        accent: "#ff8d7a",
        id: "floodway-parcels",
        label: "Floodway Parcels",
        value: formatCount(response.floodway_parcels),
      },
      {
        accent: "#ffb454",
        id: "sfha-parcels",
        label: "SFHA Parcels",
        value: formatCount(response.sfha_parcels),
      },
      {
        accent: "#f0cd79",
        id: "review-required-parcels",
        label: "Review Required",
        value: formatCount(response.review_required_parcels),
      },
      {
        accent: "#c8a4ff",
        id: "high-severe-buildability",
        label: "High / Severe Impact",
        value: formatCount(response.high_severe_buildability_parcels),
      },
    ],
    totalParcels: response.total_parcels,
  };
}
