"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Command,
  FileSearch,
  LayoutDashboard,
  Loader2,
  Map,
  MoreHorizontal,
  RadioTower,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  appIdentity,
  dashboardStatusLabels,
} from "@/data/mock/dashboardMockData";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { searchParcelIndex, type ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import { useDashboardState } from "@/hooks/useDashboardState";
import {
  normalizeBackendParcelDetailResponse,
  normalizeBackendParcelMapFocusResponse,
} from "@/lib/adapters/parcelDetailAdapter";
import { normalizeBackendParcelSearchResponse } from "@/lib/adapters/parcelSearchAdapter";
import { dashboardRoleRegistry } from "@/lib/dashboard/roleRegistry";
import { workspaceLayoutPresets } from "@/lib/dashboard/workspacePresets";
import {
  getApiErrorDisplayMessage,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { getParcelDetail, searchParcels } from "@/lib/api/parcels";
import { searchDemoParcels } from "@/lib/demo-data/client";
import { getDemoParcelMapFocus } from "@/lib/demo-data/mapLayerClient";
import { dispatchParcelMapFocusRequest } from "@/lib/map/parcelMapFocus";
import { cn } from "@/lib/utils";
import type { ProductMode } from "@/types";
import type { DashboardRoleId } from "@/types/userRoles";
import type { DashboardViewMode } from "@/types/workspace";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";

const productModes: Array<{
  description: string;
  id: ProductMode;
  label: string;
  shortLabel: string;
  title: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    description: "Intro and safe-use posture",
    icon: LayoutDashboard,
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    title: "Cabarrus FutureScape introduction and safe-use overview",
  },
  {
    description: "Countywide work area",
    icon: Map,
    id: "workspace",
    label: "Workspace",
    shortLabel: "Work",
    title: "Live map workspace for countywide exploration and Model Lab",
  },
  {
    description: "Executive reports",
    icon: FileSearch,
    id: "due_diligence",
    label: "Planning Snapshot",
    shortLabel: "Snapshot",
    title: "Saved planning context, explanations, and executive summary",
  },
  {
    description: "Sources and caveats",
    icon: BookOpen,
    id: "methodology",
    label: "Methodology",
    shortLabel: "Method",
    title: "Data sources, assumptions, limitations, and model foundation",
  },
];

const QUICK_SEARCH_LIMIT = 8;
const QUICK_SEARCH_MIN_LENGTH = 3;

type QuickSearchStatus =
  | "empty"
  | "error"
  | "fallback"
  | "idle"
  | "loading"
  | "ready";

export function TopNav() {
  const {
    activeRole,
    activeWorkspacePreset,
    applyRolePreset,
    applyWorkspacePreset,
    mapStatus,
    roleId,
    scenarioName,
    productMode,
    setOverviewCommandMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
    setSelectedParcelIntelligence,
    viewMode,
  } = useDashboardState();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState<string | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [quickSearchResults, setQuickSearchResults] = useState<ParcelSearchRecord[]>([]);
  const [quickSearchStatus, setQuickSearchStatus] =
    useState<QuickSearchStatus>("idle");
  const quickSearchRef = useRef<HTMLDivElement | null>(null);
  const selectionRequestRef = useRef(0);
  const trimmedQuickSearchQuery = quickSearchQuery.trim();
  const quickSearchReady =
    trimmedQuickSearchQuery.length >= QUICK_SEARCH_MIN_LENGTH;
  const quickSearchDropdownVisible =
    quickSearchOpen && (quickSearchReady || quickSearchStatus === "loading");
  const runtimeStatusLabel = USE_DEMO_DATA
    ? "Portfolio Demo"
    : USE_BACKEND_API
      ? "API Live"
      : "Static";
  const runtimeStatusTone = USE_BACKEND_API ? "green" : "blue";
  const searchPlaceholder = USE_DEMO_DATA
    ? "Search demo parcel, PIN, zoning, subdivision"
    : "Search parcel, PIN, owner, address, subdivision";
  const searchTitle = USE_DEMO_DATA
    ? "Search demo parcels, PINs, zoning, subdivisions, or neighborhoods"
    : "Search parcels, PINs, owners, addresses, subdivisions, or neighborhoods";

  useEffect(() => {
    function handleOutsidePointerDown(event: MouseEvent) {
      if (
        quickSearchRef.current &&
        !quickSearchRef.current.contains(event.target as Node)
      ) {
        setQuickSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!quickSearchReady) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setQuickSearchStatus("loading");
      setQuickSearchError(null);

      const runStaticFallback = async (
        fallbackMessage: string | null,
      ) => {
        const staticResults = await (USE_DEMO_DATA
          ? searchDemoParcels({
              limit: QUICK_SEARCH_LIMIT,
              query: trimmedQuickSearchQuery,
            })
          : searchParcelIndex({
              limit: QUICK_SEARCH_LIMIT,
              query: trimmedQuickSearchQuery,
            }));

        if (controller.signal.aborted) {
          return;
        }

        setQuickSearchResults(staticResults);
        setQuickSearchError(fallbackMessage);
        setQuickSearchStatus(
          fallbackMessage
            ? "fallback"
            : staticResults.length
              ? "ready"
              : "empty",
        );
      };

      if (!USE_BACKEND_API) {
        runStaticFallback(null).catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setQuickSearchResults([]);
          setQuickSearchError(
            error instanceof Error
              ? error.message
              : "Parcel search index could not be loaded.",
          );
          setQuickSearchStatus("error");
        });
        return;
      }

      searchParcels(
        {
          limit: QUICK_SEARCH_LIMIT,
          offset: 0,
          q: trimmedQuickSearchQuery,
        },
        { signal: controller.signal },
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          const records = normalizeBackendParcelSearchResponse(response);
          setQuickSearchResults(records);
          setQuickSearchError(null);
          setQuickSearchStatus(records.length ? "ready" : "empty");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          const fallbackMessage =
            `${getApiErrorDisplayMessage(
              error,
              "Parcel search API is unavailable.",
            )} Showing static fallback results.`;

          runStaticFallback(fallbackMessage).catch((fallbackError: unknown) => {
            if (controller.signal.aborted) {
              return;
            }

            setQuickSearchResults([]);
            setQuickSearchError(
              fallbackError instanceof Error
                ? fallbackError.message
                : "Parcel search is unavailable.",
            );
            setQuickSearchStatus("error");
          });
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [quickSearchReady, trimmedQuickSearchQuery]);

  const hydrateSelectedParcel = useCallback(
    (
      record: ParcelSearchRecord,
      source: SelectedParcelIntelligenceSource,
    ) => {
      setSelectedParcelIntelligence(record, source);

      if (USE_DEMO_DATA) {
        void getDemoParcelMapFocus(record, "search").then((mapFocus) => {
          dispatchParcelMapFocusRequest(mapFocus);
        });
        return;
      }

      if (!USE_BACKEND_API) {
        return;
      }

      const requestId = selectionRequestRef.current + 1;
      selectionRequestRef.current = requestId;

      getParcelDetail(
        record.officialParcelId,
        { include_geometry: true },
      )
        .then((response) => {
          if (requestId !== selectionRequestRef.current) {
            return;
          }

          const hydratedRecord = normalizeBackendParcelDetailResponse(
            response,
            record,
          );
          const mapFocus = normalizeBackendParcelMapFocusResponse(
            response,
            hydratedRecord,
          );

          setSelectedParcelIntelligence(hydratedRecord, "api");

          if (mapFocus) {
            dispatchParcelMapFocusRequest(mapFocus);
          }
        })
        .catch((error: unknown) => {
          if (requestId !== selectionRequestRef.current) {
            return;
          }

          setSelectedParcelIntelligence(record, "fallback");
          setQuickSearchError(
            `${getApiErrorDisplayMessage(
              error,
              "Parcel detail API is unavailable.",
            )} Showing selected search result fallback.`,
          );
          setQuickSearchStatus("fallback");
        });
    },
    [
      setSelectedParcelIntelligence,
    ],
  );

  const handleQuickSearchSelect = useCallback(
    (record: ParcelSearchRecord) => {
      setQuickSearchOpen(false);
      setQuickSearchQuery(record.officialParcelId);
      setQuickSearchResults([record]);
      setQuickSearchStatus("ready");
      setQuickSearchError(null);

      if (productMode !== "workspace") {
        setOverviewCommandMode("countywide");
      }

      setProductMode("workspace");
      hydrateSelectedParcel(record, USE_BACKEND_API ? "fallback" : "static");
    },
    [hydrateSelectedParcel, productMode, setOverviewCommandMode, setProductMode],
  );

  const handleQuickSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setQuickSearchOpen(false);
        return;
      }

      if (event.key === "Enter" && quickSearchResults[0]) {
        event.preventDefault();
        handleQuickSearchSelect(quickSearchResults[0]);
      }
    },
    [handleQuickSearchSelect, quickSearchResults],
  );

  return (
    <>
      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={commandPaletteOpen}
      />

      <header className="cfs-command-bar relative z-30 flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-2 overflow-visible border-b border-[#68d8ff]/14 bg-[#03070d]/94 px-3 py-2 backdrop-blur-2xl lg:flex-nowrap lg:gap-3 lg:px-4">
        <div className="order-1 flex min-w-[12.5rem] max-w-[16rem] shrink-0 items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#68d8ff]/28 bg-[#68d8ff]/[0.1] shadow-[0_0_28px_rgba(104,216,255,0.18)]">
            <Map className="h-4 w-4 text-[#f0cd79]" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[#060b12] bg-[#55d38f]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#8fe7ff]">
              {appIdentity.eyebrow}
            </p>
            <h1 className="truncate text-lg font-semibold leading-5 text-white">
              {appIdentity.productName}
            </h1>
          </div>
        </div>

        <nav
          aria-label="CFS product mode"
          className="cfs-product-nav order-3 grid w-full min-w-0 grid-cols-4 gap-1 rounded-2xl border border-[#68d8ff]/16 bg-[#020812]/82 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_0_44px_rgba(104,216,255,0.09)] lg:order-2 lg:w-auto lg:shrink-0 lg:auto-cols-max lg:grid-flow-col lg:grid-cols-none"
        >
          {productModes.map((mode) => {
            const Icon = mode.icon;
            const active =
              mode.id === "due_diligence"
                ? productMode === "due_diligence" ||
                  productMode === "executive_print"
                : productMode === mode.id;

            return (
              <button
                aria-label={`${mode.label}: ${mode.title}`}
                aria-pressed={active}
                className={cn(
                  "group relative inline-flex h-10 min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border px-2.5 text-[11px] font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75 sm:px-3 lg:justify-start lg:px-3.5 lg:text-xs xl:text-[13px]",
                  active
                    ? "border-[#68d8ff]/54 bg-[#102235]/95 text-[#e7fbff] shadow-[0_0_34px_rgba(104,216,255,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "border-transparent bg-transparent text-slate-400 hover:border-[#68d8ff]/18 hover:bg-white/[0.055] hover:text-white",
                )}
                key={mode.id}
                onClick={() => {
                  if (mode.id === "due_diligence") {
                    setParcelReviewView("review");
                    setPlanningSnapshotView("overview");
                  }

                  if (mode.id === "workspace" && productMode !== "workspace") {
                    setOverviewCommandMode("countywide");
                  }

                  setProductMode(mode.id);
                }}
                title={mode.title}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-3 top-0 h-px bg-[#68d8ff] opacity-0 transition-opacity",
                    active && "opacity-90",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-1/2 h-px w-8 -translate-x-1/2 bg-[#d8b86a] opacity-0 transition-opacity",
                    active && "opacity-85",
                  )}
                />
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105",
                    active ? "text-[#8fe7ff]" : "text-slate-500 group-hover:text-[#b7f0ff]",
                  )}
                />
                <span className="min-w-0 truncate">
                  <span className="hidden xl:inline">{mode.label}</span>
                  <span className="inline xl:hidden">{mode.shortLabel}</span>
                </span>
                <span className="sr-only">{mode.description}</span>
              </button>
            );
          })}
        </nav>

        <div className="order-4 flex w-full min-w-0 items-center gap-2 md:order-2 md:w-auto md:flex-1 lg:order-3">
          <div
            className="relative block min-w-0 flex-1 md:min-w-[12rem]"
            ref={quickSearchRef}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-controls="top-parcel-search-results"
              aria-expanded={quickSearchDropdownVisible}
              aria-label="Search parcels"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-[#68d8ff]/14 bg-white/[0.045] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#68d8ff]/50 focus:bg-white/[0.07] focus:shadow-[0_0_24px_rgba(104,216,255,0.14)]"
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuickSearchQuery(nextQuery);
                setQuickSearchOpen(true);

                if (nextQuery.trim().length < QUICK_SEARCH_MIN_LENGTH) {
                  setQuickSearchResults([]);
                  setQuickSearchError(null);
                  setQuickSearchStatus("idle");
                }
              }}
              onFocus={() => setQuickSearchOpen(true)}
              onKeyDown={handleQuickSearchKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              title={searchTitle}
              type="search"
              value={quickSearchQuery}
            />
            {quickSearchQuery ? (
              <button
                aria-label="Clear parcel search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
                onClick={() => {
                  setQuickSearchQuery("");
                  setQuickSearchResults([]);
                  setQuickSearchError(null);
                  setQuickSearchStatus("idle");
                }}
                title="Clear parcel search"
                type="button"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {quickSearchDropdownVisible ? (
              <div
                className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-lg border border-white/10 bg-[#08111d]/98 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                id="top-parcel-search-results"
                role="listbox"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Parcel Search
                  </p>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
                      quickSearchStatus === "fallback"
                        ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                        : USE_DEMO_DATA
                          ? "border-sky-300/20 bg-sky-300/[0.08] text-sky-100"
                        : USE_BACKEND_API
                          ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                          : "border-sky-300/20 bg-sky-300/[0.08] text-sky-100",
                    )}
                  >
                    {quickSearchStatus === "fallback"
                      ? "Static fallback"
                      : USE_DEMO_DATA
                        ? "Demo Search"
                      : USE_BACKEND_API
                        ? "API Search"
                        : "Static Search"}
                  </span>
                </div>

                {quickSearchStatus === "loading" ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d8b86a]" />
                    Searching parcels...
                  </div>
                ) : null}

                {quickSearchStatus === "empty" ? (
                  <div className="px-3 py-4 text-xs text-slate-400">
                    No parcels found.
                  </div>
                ) : null}

                {quickSearchStatus === "error" ? (
                  <div className="px-3 py-4 text-xs leading-5 text-amber-100">
                    {quickSearchError ?? "Parcel search is unavailable."}
                  </div>
                ) : null}

                {(quickSearchStatus === "ready" ||
                  quickSearchStatus === "fallback") &&
                quickSearchResults.length ? (
                  <div className="max-h-[22rem] overflow-y-auto py-1">
                    {quickSearchResults.map((record) => (
                      <button
                        className="block w-full border-b border-white/[0.055] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.055] focus:bg-white/[0.07] focus:outline-none"
                        key={record.officialParcelId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleQuickSearchSelect(record)}
                        aria-selected={false}
                        role="option"
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {record.officialParcelId}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">
                              {record.pin14 ?? "PIN unavailable"}
                              {record.ownerName ? ` / ${record.ownerName}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold text-[#f0cd79]">
                            {record.zoningCode ?? "No zoning"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {[
                            record.mailingAddress,
                            record.neighborhood,
                            record.subdivision,
                          ]
                            .filter(Boolean)
                            .join(" / ") || "No address or neighborhood context"}
                        </p>
                        <p className="mt-1 truncate text-[10px] uppercase tracking-[0.08em] text-slate-600">
                          {[record.zoningJurisdiction, record.zoningCategory]
                            .filter(Boolean)
                            .join(" / ") || "Jurisdiction unavailable"}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : null}

                {quickSearchStatus === "fallback" && quickSearchError ? (
                  <p className="border-t border-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100/75">
                    {quickSearchError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="hidden shrink-0 items-center gap-2 2xl:flex">
            <CompactStatusChip
              icon={RadioTower}
              label={dashboardStatusLabels[mapStatus]}
              tone={mapStatus === "online" ? "green" : mapStatus === "degraded" ? "red" : "gold"}
            />
            <CompactStatusChip
              icon={Activity}
              label={runtimeStatusLabel}
              tone={runtimeStatusTone}
            />
          </div>
        </div>

        <div className="relative order-2 flex shrink-0 items-center gap-2 lg:order-4">
          <button
            aria-label="Open command palette"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white md:hidden xl:flex"
            onClick={() => setCommandPaletteOpen(true)}
            title="Command palette"
            type="button"
          >
            <Command className="h-4 w-4" />
          </button>
          <button
            aria-expanded={moreOpen}
            aria-label="Open dashboard controls"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            onClick={() => setMoreOpen((open) => !open)}
            title="Role, workspace, and scenario controls"
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">More</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition",
                moreOpen && "rotate-180",
              )}
            />
          </button>

          {moreOpen ? (
            <div className="absolute right-0 top-11 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border border-white/10 bg-[#08111d]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="grid gap-3">
                <label className="relative block min-w-0">
                  <UserRound className="pointer-events-none absolute left-3 top-[2.05rem] h-4 w-4 -translate-y-1/2 text-[#d8b86a]" />
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">
                    Role
                  </span>
                  <select
                    aria-label="Active stakeholder role"
                    className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-8 text-sm text-white outline-none transition focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
                    onChange={(event) =>
                      applyRolePreset(event.target.value as DashboardRoleId)
                    }
                    title={activeRole.description}
                    value={roleId}
                  >
                    {dashboardRoleRegistry.map((role) => (
                      <option
                        className="bg-[#08111d] text-white"
                        key={role.id}
                        value={role.id}
                      >
                        {role.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="relative block min-w-0">
                  <LayoutDashboard className="pointer-events-none absolute left-3 top-[2.05rem] h-4 w-4 -translate-y-1/2 text-[#d8b86a]" />
                  <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">
                    Workspace
                  </span>
                  <select
                    aria-label="Active workspace view mode"
                    className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-8 text-sm text-white outline-none transition focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
                    onChange={(event) =>
                      applyWorkspacePreset(event.target.value as DashboardViewMode)
                    }
                    title={activeWorkspacePreset.description}
                    value={viewMode}
                  >
                    {workspaceLayoutPresets.map((preset) => (
                      <option
                        className="bg-[#08111d] text-white"
                        key={preset.id}
                        value={preset.id}
                      >
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <CompactStatusChip
                    icon={RadioTower}
                    label={dashboardStatusLabels[mapStatus]}
                    tone={mapStatus === "online" ? "green" : mapStatus === "degraded" ? "red" : "gold"}
                  />
                  <CompactStatusChip
                    icon={Activity}
                    label={scenarioName}
                    tone="blue"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}

function CompactStatusChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof RadioTower;
  label: string;
  tone: "gold" | "green" | "blue" | "red";
}) {
  const toneStyles = {
    blue: "border-sky-300/20 bg-sky-300/[0.08] text-sky-100",
    gold: "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]",
    green: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-100",
    red: "border-rose-300/20 bg-rose-400/[0.08] text-rose-100",
  };

  return (
    <div
      className={cn(
        "flex h-8 min-w-0 max-w-[9.5rem] items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold",
        toneStyles[tone],
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
