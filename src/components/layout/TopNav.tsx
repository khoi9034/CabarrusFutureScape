"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Command,
  Database,
  FileSearch,
  Home,
  LayoutDashboard,
  Loader2,
  Map,
  MoreHorizontal,
  RadioTower,
  Search,
  BarChart3,
  BriefcaseBusiness,
  Calculator,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  appIdentity,
  dashboardStatusLabels,
} from "@/data/mock/dashboardMockData";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useProductPrincipal } from "@/hooks/useProductPrincipal";
import {
  normalizeBackendParcelDetailResponse,
  normalizeBackendParcelMapFocusResponse,
} from "@/lib/adapters/parcelDetailAdapter";
import { normalizeBackendParcelSearchResponse } from "@/lib/adapters/parcelSearchAdapter";
import { dashboardRoleRegistry } from "@/lib/dashboard/roleRegistry";
import { workspaceLayoutPresets } from "@/lib/dashboard/workspacePresets";
import {
  getApiErrorDisplayMessage,
  IS_ENTERPRISE_MODE,
  recordTechnicalEvent,
  USE_BACKEND_API,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { CFS_BASEMAP_PROVIDER_CONFIG } from "@/lib/gis/basemapProvider";
import {
  getApiAiStatus,
  getApiDatabaseHealth,
  getApiReady,
} from "@/lib/api/health";
import { getParcelDetail, searchParcels } from "@/lib/api/parcels";
import { searchDemoParcels } from "@/lib/demo-data/client";
import { getDemoParcelMapFocus } from "@/lib/demo-data/mapLayerClient";
import { dispatchParcelMapFocusRequest } from "@/lib/map/parcelMapFocus";
import { cn } from "@/lib/utils";
import type { EconomicsSection, ProductMode } from "@/types";
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

const economicsProductModes: Array<{
  description: string;
  id: EconomicsSection;
  label: string;
  shortLabel: string;
  title: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    description: "Power BI exports and enterprise tools",
    icon: Search,
    id: "tools",
    label: "Power BI & Tools",
    shortLabel: "Tools",
    title: "Power BI exports, selected rows, scenarios, and planning tools",
  },
  {
    description: "Growth and tax-base intelligence",
    icon: BarChart3,
    id: "dashboard",
    label: "Economic Dashboard",
    shortLabel: "Dashboard",
    title: "Economic KPI dashboard and scorecards",
  },
  {
    description: "Printable economic snapshot",
    icon: Calculator,
    id: "print",
    label: "Print",
    shortLabel: "Print",
    title: "Economic snapshot and print view",
  },
];

const QUICK_SEARCH_LIMIT = 8;
const QUICK_SEARCH_MIN_LENGTH = 3;
const DEMO_QUICK_SEARCH_SUGGESTION_LIMIT = 5;
const appModeOptions = [
  {
    description: "Growth pressure, permits, constraints, schools, and Model Lab.",
    id: "planning",
    label: "Planning Intelligence",
    shortLabel: "CFS Planning",
  },
  {
    description: "Parcel economics, tax-base opportunity, public cost risk, and scenarios.",
    id: "economics",
    label: "Economic Intelligence",
    shortLabel: "CFS Economics",
  },
  {
    description: "Site selection, acquisition screening, due diligence, underwriting, and case studies.",
    id: "consulting",
    label: "Investment Intelligence",
    shortLabel: "CFS Investments",
  },
  {
    description: "Governed Parcel and Permit previews, filters, fields, and derived exports.",
    id: "master-data",
    label: "Master Data",
    shortLabel: "CFS Master Data",
  },
] as const;

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
    cfsAppMode,
    economicsSection,
    mapStatus,
    roleId,
    scenarioName,
    productMode,
    setOverviewCommandMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
    setCfsAppMode,
    setEconomicsSection,
    setSelectedParcelIntelligence,
    viewMode,
  } = useDashboardState();
  const productPrincipal = useProductPrincipal();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState<string | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const activeEconomicsSection =
    economicsSection === "overview"
      ? "dashboard"
      : economicsSection === "workspace" || economicsSection === "enterprise"
      ? "tools"
      : economicsSection;
  const [quickSearchResults, setQuickSearchResults] = useState<ParcelSearchRecord[]>([]);
  const [quickSearchStatus, setQuickSearchStatus] =
    useState<QuickSearchStatus>("idle");
  const demoSuggestionRequestRef = useRef(0);
  const quickSearchQueryRef = useRef("");
  const quickSearchRef = useRef<HTMLDivElement | null>(null);
  const selectionRequestRef = useRef(0);
  const trimmedQuickSearchQuery = quickSearchQuery.trim();
  const quickSearchReady =
    trimmedQuickSearchQuery.length >= QUICK_SEARCH_MIN_LENGTH;
  const quickSearchShowingDemoSuggestions =
    USE_DEMO_DATA && !quickSearchReady && quickSearchResults.length > 0;
  const quickSearchDropdownVisible =
    quickSearchOpen &&
    (quickSearchReady ||
      quickSearchStatus === "loading" ||
      quickSearchShowingDemoSuggestions);
  const localRuntime = useLocalRuntimeStatus();
  const runtimeStatusLabel = USE_DEMO_DATA
    ? "Portfolio Demo"
    : IS_ENTERPRISE_MODE
      ? "Enterprise API"
      : USE_BACKEND_API
      ? "Live Local Data"
      : "Static";
  const runtimeStatusTone = USE_BACKEND_API ? localRuntime.tone : "blue";
  const consultingMode = cfsAppMode === "consulting";
  const masterDataMode = cfsAppMode === "master-data";
  const quickSearchEnabled = !masterDataMode;
  const searchPlaceholder = USE_DEMO_DATA
    ? "Search demo parcel, PIN, zoning, subdivision"
    : cfsAppMode === "economics" || consultingMode
      ? "Search parcel, PIN, zoning, subdivision"
      : "Search parcel, PIN, owner, address, subdivision";
  const searchTitle = USE_DEMO_DATA
    ? "Search demo parcels, PINs, zoning, subdivisions, or neighborhoods"
    : cfsAppMode === "economics" || consultingMode
      ? "Search parcels, PINs, zoning, subdivisions, or neighborhoods"
      : "Search parcels, PINs, owners, addresses, subdivisions, or neighborhoods";
  const currentAppMode =
    appModeOptions.find((option) => option.id === cfsAppMode) ??
    appModeOptions[0];
  const selectAppMode = useCallback((mode: typeof appModeOptions[number]["id"]) => {
    if (typeof window !== "undefined" && mode !== cfsAppMode) {
      window.history.pushState(
        null,
        "",
        mode === "consulting"
          ? "/?app=consulting&investmentPage=engagements"
          : `/?app=${mode}`,
      );
    }
    setCfsAppMode(mode);
    if (mode === "planning") {
      setOverviewCommandMode("countywide");
      setProductMode("workspace");
    } else if (mode === "economics") {
      setEconomicsSection("dashboard");
    }
    setModeMenuOpen(false);
  }, [
    cfsAppMode,
    setCfsAppMode,
    setEconomicsSection,
    setOverviewCommandMode,
    setProductMode,
  ]);
  const goHome = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "/");
    }
    setCfsAppMode(null);
    setModeMenuOpen(false);
    setMoreOpen(false);
  }, [setCfsAppMode]);

  useEffect(() => {
    quickSearchQueryRef.current = trimmedQuickSearchQuery;
  }, [trimmedQuickSearchQuery]);

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
    if (!quickSearchEnabled || !quickSearchReady) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setQuickSearchStatus("loading");
      setQuickSearchError(null);

      const runDemoSearch = async () => {
        const staticResults = await searchDemoParcels({
          limit: QUICK_SEARCH_LIMIT,
          query: trimmedQuickSearchQuery,
        });

        if (controller.signal.aborted) {
          return;
        }

        setQuickSearchResults(staticResults);
        setQuickSearchError(null);
        setQuickSearchStatus(staticResults.length ? "ready" : "empty");
      };

      if (USE_DEMO_DATA) {
        runDemoSearch().catch((error: unknown) => {
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

      if (!USE_BACKEND_API) {
        setQuickSearchResults([]);
        setQuickSearchError(
          "Parcel search requires the configured CFS API outside demo mode.",
        );
        setQuickSearchStatus("error");
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

          setQuickSearchResults([]);
          setQuickSearchError(
            getApiErrorDisplayMessage(
              error,
              "Parcel search API is unavailable.",
            ),
          );
          setQuickSearchStatus("error");
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [quickSearchEnabled, quickSearchReady, trimmedQuickSearchQuery]);

  const loadDemoQuickSearchSuggestions = useCallback(() => {
    if (!quickSearchEnabled || !USE_DEMO_DATA || quickSearchReady) {
      return;
    }

    const requestId = demoSuggestionRequestRef.current + 1;
    demoSuggestionRequestRef.current = requestId;

    setQuickSearchOpen(true);
    setQuickSearchStatus("loading");
    setQuickSearchError(null);

    void searchDemoParcels({
      limit: DEMO_QUICK_SEARCH_SUGGESTION_LIMIT,
      query: "",
    })
      .then((records) => {
        if (
          requestId !== demoSuggestionRequestRef.current ||
          quickSearchQueryRef.current.length >= QUICK_SEARCH_MIN_LENGTH
        ) {
          return;
        }

        setQuickSearchResults(records);
        setQuickSearchStatus(records.length ? "ready" : "empty");
        setQuickSearchError(null);
      })
      .catch((error: unknown) => {
        if (requestId !== demoSuggestionRequestRef.current) {
          return;
        }

        setQuickSearchResults([]);
        setQuickSearchError(
          error instanceof Error
            ? error.message
            : "Demo parcel examples could not be loaded.",
        );
        setQuickSearchStatus("error");
      });
  }, [quickSearchEnabled, quickSearchReady]);

  useEffect(() => {
    if (quickSearchEnabled) return;
    demoSuggestionRequestRef.current += 1;
    setQuickSearchOpen(false);
  }, [quickSearchEnabled]);

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

          setSelectedParcelIntelligence(record, "api");
          setQuickSearchError(
            `${getApiErrorDisplayMessage(
              error,
              "Parcel detail API is unavailable.",
            )} The API search summary remains selected.`,
          );
          setQuickSearchStatus("error");
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

      setOverviewCommandMode("countywide");
      setProductMode("workspace");
      hydrateSelectedParcel(record, USE_DEMO_DATA ? "static" : "api");
    },
    [hydrateSelectedParcel, setOverviewCommandMode, setProductMode],
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

      <header
        className={cn(
          "relative z-30 flex min-h-[var(--cfs-top-nav-height)] shrink-0 flex-wrap items-center gap-2 overflow-visible px-3 py-2 backdrop-blur-2xl lg:flex-nowrap lg:gap-3 lg:px-4",
          consultingMode
            ? "consult-command-bar"
            : cfsAppMode === "economics"
            ? "econ-command-bar"
            : "cfs-command-bar border-b border-[#68d8ff]/14 bg-[#03070d]/94",
        )}
      >
        <div className="order-1 relative flex min-w-[16rem] max-w-[24rem] shrink-0 items-center gap-3">
          <button
            aria-label="Return to CFS Home"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-slate-200 transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75"
            onClick={goHome}
            type="button"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <button
            aria-expanded={modeMenuOpen}
            aria-haspopup="menu"
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#68d8ff]/18 bg-[#07111f]/88 px-2.5 py-2 text-left shadow-[0_0_28px_rgba(104,216,255,0.12)] transition hover:border-[#68d8ff]/36 hover:bg-[#102235]/86 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75"
            onClick={() => setModeMenuOpen((open) => !open)}
            type="button"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#68d8ff]/28 bg-[#68d8ff]/[0.1]">
              {consultingMode ? (
                <BriefcaseBusiness className="h-4 w-4 text-[var(--consult-emerald)]" />
              ) : cfsAppMode === "economics" ? (
                <BarChart3 className="h-4 w-4 text-[#f0cd79]" />
              ) : masterDataMode ? (
                <Database className="h-4 w-4 text-[#8fe7ff]" />
              ) : (
                <Map className="h-4 w-4 text-[#f0cd79]" />
              )}
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[#060b12] bg-[#55d38f]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#8fe7ff]">
                {appIdentity.eyebrow}
              </span>
              <span className="block truncate text-base font-semibold leading-5 text-white">
                {currentAppMode.shortLabel}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-slate-500 transition",
                modeMenuOpen && "rotate-180 text-[#8fe7ff]",
              )}
            />
          </button>

          {modeMenuOpen ? (
            <div
              className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#68d8ff]/20 bg-[#06101c]/98 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              role="menu"
            >
              {appModeOptions.map((option) => {
                const active = option.id === cfsAppMode;
                return (
                  <button
                    aria-checked={active}
                    className={cn(
                      "flex w-full min-w-0 flex-col rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/70",
                      active
                        ? "border-[#68d8ff]/45 bg-[#68d8ff]/12 text-white"
                        : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.055] hover:text-white",
                    )}
                    key={option.id}
                    onClick={() => selectAppMode(option.id)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span className="text-sm font-semibold">
                      {option.label}
                    </span>
                    <span className="mt-1 text-xs leading-5 text-slate-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {cfsAppMode === "economics" ? (
          <nav
            aria-label="CFS Economics sections"
            className="econ-product-nav order-3 grid w-full min-w-0 grid-cols-2 gap-1 rounded-2xl p-1.5 lg:order-2 lg:w-auto lg:shrink-0 lg:auto-cols-max lg:grid-flow-col lg:grid-cols-none"
          >
            {economicsProductModes.map((mode) => {
              const Icon = mode.icon;
              const active = activeEconomicsSection === mode.id;

              return (
                <button
                  aria-label={`${mode.label}: ${mode.title}`}
                  aria-pressed={active}
                  className={cn(
                    "group relative inline-flex h-10 min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border px-2.5 text-[11px] font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/75 sm:px-3 lg:justify-start lg:px-3.5 lg:text-xs xl:text-[13px]",
                    active
                      ? "border-[#d8b86a]/58 bg-[#2b2315]/95 text-[#fff4d2] shadow-[0_0_26px_rgba(216,184,106,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-transparent bg-transparent text-[#b8b1a3] hover:border-[#d8b86a]/22 hover:bg-white/[0.045] hover:text-white",
                  )}
                  key={mode.id}
                  onClick={() => setEconomicsSection(mode.id)}
                  title={mode.title}
                  type="button"
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105",
                      active ? "text-[#d8b86a]" : "text-[#8fa4b8] group-hover:text-[#f0cd79]",
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
        ) : cfsAppMode === "planning" ? (
          <nav
            aria-label="CFS product mode"
            className="cfs-product-nav order-3 grid w-full min-w-0 grid-cols-3 gap-1 rounded-2xl border border-[#68d8ff]/16 bg-[#020812]/82 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_0_44px_rgba(104,216,255,0.09)] lg:order-2 lg:w-auto lg:shrink-0 lg:auto-cols-max lg:grid-flow-col lg:grid-cols-none"
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
        ) : null}

        {!masterDataMode ? (
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
                demoSuggestionRequestRef.current += 1;
                setQuickSearchQuery(nextQuery);
                setQuickSearchOpen(true);

                if (nextQuery.trim().length < QUICK_SEARCH_MIN_LENGTH) {
                  setQuickSearchResults([]);
                  setQuickSearchError(null);
                  setQuickSearchStatus("idle");
                }
              }}
              onClick={loadDemoQuickSearchSuggestions}
              onFocus={() => {
                setQuickSearchOpen(true);
                loadDemoQuickSearchSuggestions();
              }}
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
                  demoSuggestionRequestRef.current += 1;
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
                    {quickSearchShowingDemoSuggestions
                      ? "Demo Parcel Examples"
                      : "Parcel Search"}
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
                      : quickSearchShowingDemoSuggestions
                        ? "Demo Picks"
                      : USE_DEMO_DATA
                        ? "Demo Search"
                      : USE_BACKEND_API
                        ? "API Search"
                        : "Static Search"}
                  </span>
                </div>

                {quickSearchShowingDemoSuggestions ? (
                  <p className="border-b border-white/10 px-3 py-2 text-[11px] leading-5 text-slate-400">
                    Choose a sample parcel to zoom the demo map and open parcel
                    intelligence.
                  </p>
                ) : null}

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
                              {cfsAppMode === "planning" && record.ownerName
                                ? ` / ${record.ownerName}`
                                : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold text-[#f0cd79]">
                            {record.zoningCode ?? "No zoning"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {(cfsAppMode === "economics" || consultingMode
                            ? [record.neighborhood, record.subdivision]
                            : [
                                record.mailingAddress,
                                record.neighborhood,
                                record.subdivision,
                              ]
                          )
                            .filter(Boolean)
                            .join(" / ") || "No area context"}
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
        ) : <div className="order-4 hidden min-w-0 flex-1 lg:block" />}

        <div className="relative order-2 flex shrink-0 items-center gap-2 lg:order-4">
          {!masterDataMode ? <button
            aria-label="Open command palette"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white md:hidden xl:flex"
            onClick={() => setCommandPaletteOpen(true)}
            title="Command palette"
            type="button"
          >
            <Command className="h-4 w-4" />
          </button> : null}
          <button
            aria-expanded={moreOpen}
            aria-label={
              cfsAppMode === "economics"
                ? "Open economics controls"
                : consultingMode
                  ? "Open investment controls"
                  : masterDataMode
                    ? "Open Master Data controls"
                : "Open dashboard controls"
            }
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            onClick={() => setMoreOpen((open) => !open)}
            title={
              cfsAppMode === "economics"
                ? "Economics status and mode controls"
                : consultingMode
                  ? "Investments status and mode controls"
                  : masterDataMode
                    ? "Master Data status and access"
                : "Role, workspace, and scenario controls"
            }
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
              {consultingMode ? (
                <div className="grid gap-3">
                  <div className="rounded-lg border border-[var(--consult-border)] bg-[rgba(53,201,141,0.08)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--consult-emerald)]">
                      CFS Investments
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Site selection, due diligence, underwriting, reports, and case studies.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
              ) : cfsAppMode === "economics" ? (
                <div className="grid gap-3">
                  <div className="rounded-lg border border-[#d8b86a]/20 bg-[#d8b86a]/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0cd79]">
                      Economic Intelligence
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Use the top navigation for Power BI & Tools,
                      Economic Dashboard, and Print.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
              ) : masterDataMode ? (
                <div className="grid gap-3">
                  <div className="rounded-lg border border-[#68d8ff]/20 bg-[#68d8ff]/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fe7ff]">
                      CFS Master Data
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Governed Parcel and Permit previews and derived exports.
                    </p>
                  </div>
                  <CompactStatusChip
                    icon={Activity}
                    label={runtimeStatusLabel}
                    tone={runtimeStatusTone}
                  />
                </div>
              ) : (
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
              )}
              {USE_BACKEND_API && !USE_DEMO_DATA ? (
                <LocalRuntimeStatusPanel status={localRuntime} />
              ) : null}
              <ProductPrincipalStatusPanel value={productPrincipal} />
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}

function ProductPrincipalStatusPanel({
  value,
}: {
  value: ReturnType<typeof useProductPrincipal>;
}) {
  const identity = USE_DEMO_DATA
    ? "Session-only demo"
    : value.principal?.subject ?? "Principal unavailable";
  const roles = value.principal?.roles.join(", ") || "No role loaded";
  return (
    <section
      aria-live="polite"
      className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs"
      data-status={value.status}
      data-testid="product-principal-status"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-200">Product persistence</span>
        <span className="text-right text-[#9be9ff]">
          {value.status === "loading" ? "Checking…" : USE_DEMO_DATA ? "Browser session" : "Server-backed"}
        </span>
      </div>
      <p className="mt-2 text-slate-300">{identity}</p>
      <p className="mt-1 text-slate-500">{roles}</p>
      {value.error ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-rose-200">
          <span>{value.error}</span>
          <button
            className="rounded border border-rose-200/30 px-2 py-1 font-semibold"
            onClick={value.reload}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
    </section>
  );
}

type LocalRuntimeState = {
  api: string;
  ask: string;
  database: string;
  recovery: string | null;
  tone: "gold" | "green" | "red";
};

const CONNECTING_RUNTIME: LocalRuntimeState = {
  api: "Connecting",
  ask: "Checking grounded answers",
  database: "Connecting",
  recovery: null,
  tone: "gold",
};

function useLocalRuntimeStatus(): LocalRuntimeState {
  const [status, setStatus] = useState<LocalRuntimeState>(CONNECTING_RUNTIME);

  useEffect(() => {
    if (!USE_BACKEND_API || USE_DEMO_DATA) {
      return;
    }

    let active = true;
    let timer: number | undefined;
    async function refresh() {
      const options = { timeoutMs: 8000 };
      const [ready, database, ai] = await Promise.allSettled([
        getApiReady(options),
        getApiDatabaseHealth(options),
        getApiAiStatus(options),
      ]);
      if (!active) return;

      const apiReady = ready.status === "fulfilled" && ready.value.status === "ready";
      const databaseReady =
        database.status === "fulfilled" && database.value.database === "connected";
      const ask =
        ai.status === "fulfilled" &&
        ai.value.ai_enabled &&
        ai.value.configured_provider === "openai" &&
        ai.value.api_key_configured &&
        ai.value.model_configured
          ? "OpenAI with grounded fallback"
          : ai.status === "fulfilled" && ai.value.deterministic_fallback_available
            ? "Grounded local answers"
            : "Grounded answers unavailable";

      setStatus({
        api: apiReady ? "Ready" : "Unavailable",
        ask,
        database: databaseReady ? "Connected" : "Local database unavailable",
        recovery:
          !databaseReady
            ? "Start local PostgreSQL, then run npm run present:cfs."
            : !apiReady
              ? "Run npm run present:cfs to restart the local API."
              : null,
        tone: apiReady && databaseReady ? "green" : "red",
      });
      recordTechnicalEvent("api_readiness", {
        api_ready: apiReady,
        ask_mode: ask,
        database_ready: databaseReady,
      });
      timer = window.setTimeout(refresh, 10_000);
    }

    void refresh();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return status;
}

function LocalRuntimeStatusPanel({ status }: { status: LocalRuntimeState }) {
  return (
    <div
      className="mt-3 border-t border-white/10 pt-3"
      data-testid="local-runtime-status"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-white">Live Local Data</p>
        <span
          className={cn(
            "text-[10px] font-semibold uppercase",
            status.tone === "green"
              ? "text-emerald-200"
              : status.tone === "red"
                ? "text-rose-200"
                : "text-amber-100",
          )}
        >
          Frontend Ready
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-slate-500">API</dt>
        <dd className="text-right text-slate-200" data-testid="local-runtime-api">
          {status.api}
        </dd>
        <dt className="text-slate-500">Database</dt>
        <dd className="text-right text-slate-200" data-testid="local-runtime-database">
          {status.database}
        </dd>
        <dt className="text-slate-500">Ask CFS</dt>
        <dd className="text-right text-slate-200" data-testid="local-runtime-ask">
          {status.ask}
        </dd>
        <dt className="text-slate-500">Map</dt>
        <dd className="text-right text-slate-200">
          {CFS_BASEMAP_PROVIDER_CONFIG.kind === "openstreetmap"
            ? "OpenStreetMap"
            : "Configured tile basemap"}
        </dd>
      </dl>
      {status.recovery ? (
        <p className="mt-2 text-[11px] leading-5 text-amber-100">{status.recovery}</p>
      ) : null}
    </div>
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
