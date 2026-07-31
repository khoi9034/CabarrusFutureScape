"use client";

import { useEffect, useMemo, useState } from "react";
import type { DevelopmentTemporalFilters } from "@/data/intelligence/developmentTemporalIndex";
import {
  getStaticTemporalQueryView,
  getUnavailableTemporalQueryView,
  normalizeDevelopmentTemporalQuery,
  type TemporalQueryViewModel,
} from "@/lib/adapters/temporalQueryAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getDevelopmentTemporalQuery,
  type DevelopmentTemporalQueryParams,
} from "@/lib/api/development";

interface TemporalApiState {
  errorMessage: string | null;
  requestKey: string;
  view: Omit<TemporalQueryViewModel, "errorMessage" | "isLoading" | "source"> | null;
}

function buildTemporalQueryParams(
  filters: DevelopmentTemporalFilters,
): DevelopmentTemporalQueryParams {
  return {
    activity_class: filters.selectedActivityClass ?? undefined,
    date_end: filters.selectedDateRange.end ?? undefined,
    date_start: filters.selectedDateRange.start ?? undefined,
    limit: 50,
    month: filters.selectedMonth ?? undefined,
    permit_type: filters.selectedPermitType ?? undefined,
    rolling_window: filters.selectedRollingWindow ?? undefined,
    work_type: filters.selectedWorkType ?? undefined,
    year: filters.selectedYear ?? undefined,
    zoning_category: filters.selectedZoningCategory ?? undefined,
    zoning_jurisdiction: filters.selectedZoningJurisdiction ?? undefined,
  };
}

export function useTemporalQuery(filters: DevelopmentTemporalFilters) {
  const staticView = useMemo(() => getStaticTemporalQueryView(filters), [filters]);
  const queryParams = useMemo(() => buildTemporalQueryParams(filters), [filters]);
  const requestKey = useMemo(() => JSON.stringify(queryParams), [queryParams]);
  const [apiState, setApiState] = useState<TemporalApiState | null>(null);

  useEffect(() => {
    if (!USE_BACKEND_API) {
      return;
    }

    const controller = new AbortController();

    getDevelopmentTemporalQuery(queryParams, { signal: controller.signal })
      .then((response) => {
        setApiState({
          errorMessage: null,
          requestKey,
          view: normalizeDevelopmentTemporalQuery(response, filters),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setApiState({
          errorMessage:
            error instanceof Error
              ? error.message
              : "CFS API temporal query is unavailable.",
          requestKey,
          view: null,
        });
      });

    return () => controller.abort();
  }, [filters, queryParams, requestKey]);

  if (!USE_BACKEND_API) {
    return USE_DEMO_DATA
      ? staticView
      : {
          ...getUnavailableTemporalQueryView(filters),
          errorMessage:
            "Temporal analysis requires the configured CFS API outside demo mode.",
        };
  }

  if (apiState?.requestKey === requestKey && apiState.view) {
    return {
      ...apiState.view,
      errorMessage: null,
      isLoading: false,
      source: "api",
    } satisfies TemporalQueryViewModel;
  }

  if (apiState?.requestKey === requestKey && apiState.errorMessage) {
    return {
      ...getUnavailableTemporalQueryView(filters),
      errorMessage: apiState.errorMessage,
      isLoading: false,
      source: "fallback",
    } satisfies TemporalQueryViewModel;
  }

  return {
    ...getUnavailableTemporalQueryView(filters),
    isLoading: true,
    source: "loading",
  } satisfies TemporalQueryViewModel;
}
