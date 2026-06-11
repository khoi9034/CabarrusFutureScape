"use client";

import { Search, XCircle } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { ParcelDetailDrawer } from "@/components/dashboard/ParcelDetailDrawer";
import { ParcelFilterPanel } from "@/components/dashboard/ParcelFilterPanel";
import { ParcelResultList } from "@/components/dashboard/ParcelResultList";
import {
  emptyParcelSearchFilters,
  PARCEL_SEARCH_INSPECT_EVENT,
  type ParcelSearchEventDetail,
  type ParcelSearchFilters,
} from "@/components/dashboard/ParcelSearchState";
import {
  buildParcelSearchFilterOptions,
  filterParcelSearchRecords,
  getParcelSearchRecordById,
  loadParcelSearchIndex,
  type ParcelSearchFilterOptions,
  type ParcelSearchIndexMetadata,
  type ParcelSearchRecord,
} from "@/data/intelligence/parcelSearchData";
import {
  normalizeBackendParcelDetailResponse,
  normalizeBackendParcelMapFocusResponse,
} from "@/lib/adapters/parcelDetailAdapter";
import { normalizeBackendParcelFilterResponse } from "@/lib/adapters/parcelFilterAdapter";
import {
  applyParcelSearchUiFilters,
  normalizeBackendParcelSearchResponse,
} from "@/lib/adapters/parcelSearchAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { filterParcels, getParcelDetail, searchParcels } from "@/lib/api/parcels";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useParcelMapFocus } from "@/hooks/useParcelMapFocus";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";
import type { ParcelFocusSource } from "@/types/map/parcelFocus";

const RESULT_LIMIT = 50;
const API_RESULT_LIMIT = 100;
const MIN_BACKEND_QUERY_LENGTH = 3;

function createParcelDetailFallbackRecord(
  officialParcelId: string,
): ParcelSearchRecord {
  return {
    assessedValue: null,
    governanceWarningCount: 0,
    governanceWarnings: [],
    mailingAddress: null,
    mailingCity: null,
    mailingState: null,
    marketValue: null,
    needsGovernanceReview: false,
    neighborhood: null,
    objectId1: null,
    officialParcelId,
    ownerName: null,
    ownerSecondaryName: null,
    parcelQualityStatus: null,
    parcelSizeCategory: null,
    pin14: null,
    planningBoundaryType: null,
    planningJurisdiction: null,
    primaryGovernanceWarning: null,
    safeForDashboard: false,
    searchText: officialParcelId.toLowerCase(),
    subdivision: null,
    valuationBand: null,
    zoningCategory: null,
    zoningCode: null,
    zoningConfidence: null,
    zoningJurisdiction: null,
  };
}

interface BackendSearchState {
  error: string | null;
  records: ParcelSearchRecord[] | null;
  requestKey: string | null;
}

interface BackendFilterState {
  error: string | null;
  records: ParcelSearchRecord[] | null;
  requestKey: string | null;
}

function buildBackendSearchKey(
  query: string,
  filters: ParcelSearchFilters,
) {
  return JSON.stringify({
    filters: {
      parcelQualityStatus: filters.parcelQualityStatus,
      safeForDashboard: filters.safeForDashboard,
      valuationBand: filters.valuationBand,
      zoningCategory: filters.zoningCategory,
      zoningConfidence: filters.zoningConfidence,
      zoningJurisdiction: filters.zoningJurisdiction,
    },
    query,
  });
}

function buildBackendFilterKey(filters: ParcelSearchFilters) {
  return JSON.stringify({
    filters: {
      governanceWarningCategory: filters.governanceWarningCategory,
      neighborhood: filters.neighborhood,
      parcelQualityStatus: filters.parcelQualityStatus,
      parcelSizeCategory: filters.parcelSizeCategory,
      safeForDashboard: filters.safeForDashboard,
      subdivision: filters.subdivision,
      valuationBand: filters.valuationBand,
      zoningCategory: filters.zoningCategory,
      zoningCode: filters.zoningCode,
      zoningConfidence: filters.zoningConfidence,
      zoningJurisdiction: filters.zoningJurisdiction,
    },
  });
}

function asOptionalBoolean(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function ParcelSearchPanel() {
  const {
    clearSelectedParcel,
    setSelectedParcelIntelligence,
  } = useDashboardState();
  const [backendFilterState, setBackendFilterState] =
    useState<BackendFilterState>({
      error: null,
      records: null,
      requestKey: null,
    });
  const [backendSearchState, setBackendSearchState] =
    useState<BackendSearchState>({
      error: null,
      records: null,
      requestKey: null,
    });
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ParcelSearchFilters>(
    emptyParcelSearchFilters,
  );
  const [indexMetadata, setIndexMetadata] =
    useState<ParcelSearchIndexMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<ParcelSearchFilterOptions | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<ParcelSearchRecord[]>([]);
  const [selectedRecord, setSelectedRecord] =
    useState<ParcelSearchRecord | null>(null);
  const {
    clearParcelFocus,
    focusMessage,
    focusResult,
    selectedParcelFocus,
    setParcelFocus,
    setParcelFocusFromRecord,
  } = useParcelMapFocus();
  const deferredQuery = useDeferredValue(query);
  const normalizedDeferredQuery = deferredQuery.trim();
  const backendSearchEnabled =
    USE_BACKEND_API &&
    normalizedDeferredQuery.length >= MIN_BACKEND_QUERY_LENGTH;
  const backendSearchKey = backendSearchEnabled
    ? buildBackendSearchKey(normalizedDeferredQuery, filters)
    : null;
  const backendFilterEnabled =
    USE_BACKEND_API && !loading && normalizedDeferredQuery.length === 0;
  const backendFilterKey = backendFilterEnabled
    ? buildBackendFilterKey(filters)
    : null;

  useEffect(() => {
    let cancelled = false;

    loadParcelSearchIndex()
      .then((index) => {
        if (cancelled) {
          return;
        }

        setRecords(index.records);
        setIndexMetadata(index.metadata);
        setOptions(buildParcelSearchFilterOptions(index.records));
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Parcel search index could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!backendSearchEnabled || !backendSearchKey) {
      return;
    }

    const controller = new AbortController();

    searchParcels(
      {
        limit: API_RESULT_LIMIT,
        offset: 0,
        parcel_quality_status: filters.parcelQualityStatus,
        q: normalizedDeferredQuery,
        safe_for_dashboard: asOptionalBoolean(filters.safeForDashboard),
        valuation_band: filters.valuationBand,
        zoning_category: filters.zoningCategory,
        zoning_confidence: filters.zoningConfidence,
        zoning_jurisdiction: filters.zoningJurisdiction,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        const backendRecords = normalizeBackendParcelSearchResponse(response);
        const filteredRecords = applyParcelSearchUiFilters(backendRecords, {
          filters,
          limit: RESULT_LIMIT,
          query: normalizedDeferredQuery,
        });

        setBackendSearchState({
          error: null,
          records: filteredRecords,
          requestKey: backendSearchKey,
        });
      })
      .catch((searchError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setBackendSearchState({
          error:
            searchError instanceof Error
              ? searchError.message
              : "Parcel search API is unavailable.",
          records: null,
          requestKey: backendSearchKey,
        });
      });

    return () => controller.abort();
  }, [
    backendSearchEnabled,
    backendSearchKey,
    filters,
    normalizedDeferredQuery,
  ]);

  useEffect(() => {
    if (!backendFilterEnabled || !backendFilterKey) {
      return;
    }

    const controller = new AbortController();

    filterParcels(
      {
        governance_warning: filters.governanceWarningCategory,
        limit: API_RESULT_LIMIT,
        neighborhood: filters.neighborhood,
        offset: 0,
        parcel_quality_status: filters.parcelQualityStatus,
        parcel_size_category: filters.parcelSizeCategory,
        safe_for_dashboard: asOptionalBoolean(filters.safeForDashboard),
        subdivision: filters.subdivision,
        valuation_band: filters.valuationBand,
        zoning_category: filters.zoningCategory,
        zoning_code: filters.zoningCode,
        zoning_confidence: filters.zoningConfidence,
        zoning_jurisdiction: filters.zoningJurisdiction,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        const backendRecords = normalizeBackendParcelFilterResponse(
          response,
          records,
        );
        const filteredRecords = applyParcelSearchUiFilters(backendRecords, {
          filters,
          limit: RESULT_LIMIT,
          query: normalizedDeferredQuery,
        });

        setBackendFilterState({
          error: null,
          records: filteredRecords,
          requestKey: backendFilterKey,
        });
      })
      .catch((filterError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setBackendFilterState({
          error:
            filterError instanceof Error
              ? filterError.message
              : "Parcel filter API is unavailable.",
          records: null,
          requestKey: backendFilterKey,
        });
      });

    return () => controller.abort();
  }, [
    backendFilterEnabled,
    backendFilterKey,
    filters,
    normalizedDeferredQuery,
    records,
  ]);

  const handleSelectRecord = useCallback(
    (
      record: ParcelSearchRecord,
      focusSource: ParcelFocusSource = "search",
    ) => {
      logParcelMapFocusDiagnostic("parcel search result selected", {
        focusSource,
        officialParcelId: record.officialParcelId,
        pin14: record.pin14,
      });

      setSelectedRecord(record);
      setSelectedParcelIntelligence(
        record,
        USE_BACKEND_API ? "fallback" : "static",
      );
      setParcelFocusFromRecord(
        {
          officialParcelId: record.officialParcelId,
          pin14: record.pin14,
        },
        focusSource,
      );
    },
    [setParcelFocusFromRecord, setSelectedParcelIntelligence],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedRecord(null);
    clearParcelFocus();
    clearSelectedParcel();
  }, [clearParcelFocus, clearSelectedParcel]);

  const handleParcelDetailHydrated = useCallback(
    (
      record: ParcelSearchRecord,
      source: SelectedParcelIntelligenceSource,
    ) => {
      setSelectedParcelIntelligence(record, source);
    },
    [setSelectedParcelIntelligence],
  );

  useEffect(() => {
    function handleInspectParcel(event: Event) {
      const detail = (event as CustomEvent<ParcelSearchEventDetail>).detail;
      if (!detail?.officialParcelId) {
        return;
      }

      setQuery(detail.officialParcelId);
      loadParcelSearchIndex().then((index) => {
        const nextRecord = getParcelSearchRecordById(
          index.records,
          detail.officialParcelId,
        );

        if (nextRecord) {
          handleSelectRecord(nextRecord, "command");
          return;
        }

        if (!USE_BACKEND_API) {
          return;
        }

        getParcelDetail(detail.officialParcelId)
          .then((response) => {
            const fallbackRecord = createParcelDetailFallbackRecord(
              detail.officialParcelId,
            );
            const hydratedRecord = normalizeBackendParcelDetailResponse(
              response,
              fallbackRecord,
            );
            const backendMapFocus = normalizeBackendParcelMapFocusResponse(
              response,
              hydratedRecord,
            );

            setSelectedRecord(hydratedRecord);
            setSelectedParcelIntelligence(hydratedRecord, "api");

            if (backendMapFocus) {
              setParcelFocus(backendMapFocus);
              return;
            }

            setParcelFocusFromRecord(
              {
                officialParcelId: hydratedRecord.officialParcelId,
                pin14: hydratedRecord.pin14,
              },
              "command",
            );
          })
          .catch((apiError: unknown) => {
            setError(
              apiError instanceof Error
                ? apiError.message
                : "Parcel detail API is unavailable.",
            );
          });
      });
    }

    window.addEventListener(PARCEL_SEARCH_INSPECT_EVENT, handleInspectParcel);

    return () => {
      window.removeEventListener(
        PARCEL_SEARCH_INSPECT_EVENT,
        handleInspectParcel,
      );
    };
  }, [
    handleSelectRecord,
    setParcelFocus,
    setParcelFocusFromRecord,
    setSelectedParcelIntelligence,
  ]);

  const results = useMemo(
    () => {
      const staticResults = filterParcelSearchRecords(records, {
        filters,
        limit: RESULT_LIMIT,
        query: deferredQuery,
      });
      const backendResultsReady =
        backendSearchEnabled &&
        backendSearchState.requestKey === backendSearchKey &&
        !backendSearchState.error &&
        backendSearchState.records;
      const backendFilterResultsReady =
        backendFilterEnabled &&
        backendFilterState.requestKey === backendFilterKey &&
        !backendFilterState.error &&
        backendFilterState.records;

      if (backendResultsReady) {
        return backendSearchState.records ?? [];
      }

      if (backendFilterResultsReady) {
        return backendFilterState.records ?? [];
      }

      return staticResults;
    },
    [
      backendFilterEnabled,
      backendFilterKey,
      backendFilterState.error,
      backendFilterState.records,
      backendFilterState.requestKey,
      backendSearchEnabled,
      backendSearchKey,
      backendSearchState.error,
      backendSearchState.records,
      backendSearchState.requestKey,
      deferredQuery,
      filters,
      records,
    ],
  );
  const backendSearchLoading =
    backendSearchEnabled && backendSearchState.requestKey !== backendSearchKey;
  const backendFilterLoading =
    backendFilterEnabled && backendFilterState.requestKey !== backendFilterKey;
  const usingBackendResults =
    backendSearchEnabled &&
    backendSearchState.requestKey === backendSearchKey &&
    !backendSearchState.error &&
    Boolean(backendSearchState.records);
  const usingBackendFilterResults =
    backendFilterEnabled &&
    backendFilterState.requestKey === backendFilterKey &&
    !backendFilterState.error &&
    Boolean(backendFilterState.records);
  const usingBackendFallback =
    (backendSearchEnabled &&
      backendSearchState.requestKey === backendSearchKey &&
      Boolean(backendSearchState.error)) ||
    (backendFilterEnabled &&
      backendFilterState.requestKey === backendFilterKey &&
      Boolean(backendFilterState.error));
  const searchInputDisabled = loading && !USE_BACKEND_API;
  const resultListLoading =
    (loading && !USE_BACKEND_API) ||
    backendSearchLoading ||
    backendFilterLoading;
  const resultListLoadingLabel = backendSearchLoading
    ? "Searching FastAPI parcel intelligence"
    : backendFilterLoading
      ? "Filtering FastAPI parcel intelligence"
      : "Loading parcel intelligence index";
  const sourceLabel = usingBackendResults
    ? "FastAPI Search"
    : usingBackendFilterResults
      ? "FastAPI Filter"
    : usingBackendFallback
      ? "Static fallback"
      : backendSearchLoading
        ? "API Search"
        : backendFilterLoading
          ? "API Filter"
        : "Static Index";
  const sourceDescription = usingBackendResults
    ? "Search results are loaded from GET /parcels/search."
    : usingBackendFilterResults
      ? "Structured filters are loaded from GET /parcels/filter."
    : usingBackendFallback
      ? "FastAPI parcel discovery is unavailable, so results are using the generated static index."
    : backendSearchLoading
      ? "Searching FastAPI parcel intelligence; static results are preserved during the request."
      : backendFilterLoading
        ? "Filtering FastAPI parcel intelligence; static results are preserved during the request."
        : USE_BACKEND_API
          ? "Blank searches use FastAPI filters when available. Queries of three or more characters use FastAPI search."
          : "Search uses a generated static parcel intelligence artifact.";

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  return (
    <section
      aria-label="Parcel search and filter panel"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Parcel Discovery
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Search & Filter
          </h3>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${
            usingBackendResults || usingBackendFilterResults
              ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
              : usingBackendFallback
                ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                : "border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#8fe7ff]"
          }`}
        >
          {sourceLabel}
        </span>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Search parcels</span>
        <span className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-[#08111d] px-3 transition focus-within:border-[#d8b86a]/50 focus-within:ring-2 focus-within:ring-[#d8b86a]/15">
          <Search className="h-4 w-4 shrink-0 text-[#d8b86a]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
            disabled={searchInputDisabled}
            onChange={handleQueryChange}
            placeholder="PIN, owner, address, subdivision, zoning"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear parcel search"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => setQuery("")}
              title="Clear parcel search"
              type="button"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
          <span className="block uppercase">Indexed Parcels</span>
          <span className="mt-1 block text-sm font-semibold text-white">
            {indexMetadata?.recordCount.toLocaleString() ?? "--"}
          </span>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
          <span className="block uppercase">Visible Results</span>
          <span className="mt-1 block text-sm font-semibold text-white">
            {loading ? "--" : results.length.toLocaleString()}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>

      <div className="mt-4 space-y-3">
        <ParcelFilterPanel
          disabled={loading}
          filters={filters}
          onChange={setFilters}
          options={options}
        />

        <ParcelResultList
          error={error}
          loadingLabel={resultListLoadingLabel}
          loading={resultListLoading}
          onSelect={handleSelectRecord}
          records={results}
          selectedParcelId={selectedRecord?.officialParcelId ?? null}
        />

        <ParcelDetailDrawer
          mapFocus={selectedParcelFocus}
          mapFocusResult={focusResult}
          onClose={handleCloseDetail}
          onMapFocusHydrated={setParcelFocus}
          onParcelDetailHydrated={handleParcelDetailHydrated}
          parcel={selectedRecord}
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {usingBackendFallback
          ? `API fallback detail: ${
              backendSearchState.error ??
              backendFilterState.error ??
              "Static parcel discovery is active."
            }`
          : `${focusMessage} Direct PostGIS access, authentication, and permit map workflows remain disconnected.`}
      </p>
    </section>
  );
}
