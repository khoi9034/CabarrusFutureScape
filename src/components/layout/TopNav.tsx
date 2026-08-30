"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  Command,
  Database,
  FileSearch,
  Home,
  LayoutDashboard,
  Layers3,
  Loader2,
  Map,
  MoreHorizontal,
  RadioTower,
  Search,
  BarChart3,
  Calculator,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";
import { dashboardStatusLabels } from "@/data/mock/dashboardMockData";
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
import type {
  CfsAppMode,
  EconomicsSection,
  ManagementSection,
  ProductMode,
} from "@/types";
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
const builderModes = [
  {
    description: "Growth pressure, permits, constraints, schools, and Model Lab.",
    id: "planning",
    label: "Planning Intelligence",
    shortLabel: "Planning",
  },
  {
    description: "Parcel economics, tax-base opportunity, public cost risk, and scenarios.",
    id: "economics",
    label: "Economic Intelligence",
    shortLabel: "Economics",
  },
  {
    description: "Governed Parcel and Permit previews, filters, fields, and derived exports.",
    id: "master-data",
    label: "Master Data",
    shortLabel: "Master Data",
  },
] as const;

const managementSections: ReadonlyArray<{
  id: ManagementSection;
  label: string;
  shortLabel: string;
}> = [
  { id: "overview", label: "Overview", shortLabel: "Overview" },
  { id: "planning-insights", label: "Planning Insights", shortLabel: "Planning" },
  { id: "economic-insights", label: "Economic Insights", shortLabel: "Economic" },
  { id: "development-signals", label: "Development Signals", shortLabel: "Signals" },
];

type QuickSearchStatus =
  | "empty"
  | "error"
  | "fallback"
  | "idle"
  | "loading"
  | "ready";

export function TopNav({
  askCfsOpen,
  managementSection,
  onAskCfsOpenChange,
  onManagementSectionChange,
}: {
  askCfsOpen: boolean;
  managementSection: ManagementSection;
  onAskCfsOpenChange: (open: boolean) => void;
  onManagementSectionChange: (section: ManagementSection) => void;
}) {
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
  const masterDataMode = cfsAppMode === "master-data";
  const managementMode = cfsAppMode === "management";
  const builderMode = !managementMode;
  const quickSearchEnabled = !managementMode && !masterDataMode;
  const searchPlaceholder = USE_DEMO_DATA
    ? "Search demo parcel, PIN, zoning, subdivision"
    : cfsAppMode === "economics"
      ? "Search parcel, PIN, zoning, subdivision"
      : "Search parcel, PIN, owner, address, subdivision";
  const searchTitle = USE_DEMO_DATA
    ? "Search demo parcels, PINs, zoning, subdivisions, or neighborhoods"
    : cfsAppMode === "economics"
      ? "Search parcels, PINs, zoning, subdivisions, or neighborhoods"
      : "Search parcels, PINs, owners, addresses, subdivisions, or neighborhoods";
  const selectAppMode = useCallback((mode: CfsAppMode) => {
    if (typeof window !== "undefined" && mode !== cfsAppMode) {
      if (mode === "management") {
        onManagementSectionChange("overview");
      } else {
        window.history.pushState(null, "", `/?app=${mode}`);
      }
    }
    setCfsAppMode(mode);
    if (mode === "planning") {
      setOverviewCommandMode("countywide");
      setProductMode("workspace");
    } else if (mode === "economics") {
      setEconomicsSection("dashboard");
    }
  }, [
    cfsAppMode,
    onManagementSectionChange,
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
      {askCfsOpen ? null : (
        <CommandPalette
          onOpenChange={setCommandPaletteOpen}
          open={commandPaletteOpen}
        />
      )}

      <header
        className={cn(
          "relative z-30 flex min-h-[var(--cfs-top-nav-height)] shrink-0 flex-wrap items-center gap-2 overflow-visible px-3 py-2 backdrop-blur-2xl lg:gap-3 lg:px-4 xl:flex-nowrap",
          cfsAppMode === "economics"
            ? "econ-command-bar"
            : "cfs-command-bar border-b border-[#68d8ff]/14 bg-[#03070d]/94",
        )}
      >
        <div className="order-1 flex shrink-0 items-center gap-2">
          <button
            aria-label="Return to CFS Home"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-slate-200 transition hover:border-[#68d8ff]/35 hover:bg-[#68d8ff]/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75"
            onClick={goHome}
            type="button"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <nav
            aria-label="CFS experience"
            className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1"
          >
            {[
              { icon: BriefcaseBusiness, id: "management" as const, label: "Management" },
              { icon: Layers3, id: "builder" as const, label: "Builder" },
            ].map((experience) => {
              const Icon = experience.icon;
              const active = experience.id === "management" ? managementMode : builderMode;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition",
                    active
                      ? "border-[#78bfd2]/35 bg-[#78bfd2]/12 text-white"
                      : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white",
                  )}
                  data-testid={`cfs-experience-${experience.id}`}
                  key={experience.id}
                  onClick={() => selectAppMode(experience.id === "management" ? "management" : cfsAppMode === "economics" || cfsAppMode === "master-data" ? cfsAppMode : "planning")}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{experience.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {managementMode ? (
          <nav
            aria-label="CFS Management sections"
            className="cfs-product-nav order-3 grid w-full min-w-0 grid-cols-4 gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1 lg:order-2 lg:w-auto lg:shrink-0"
          >
            {managementSections.map((item) => {
              const active = managementSection === item.id;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-10 min-w-0 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold transition sm:px-3 lg:text-xs",
                    active
                      ? "border-[#78bfd2]/35 bg-[#78bfd2]/12 text-white"
                      : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white",
                  )}
                  data-testid={`management-nav-${item.id}`}
                  key={item.id}
                  onClick={() => onManagementSectionChange(item.id)}
                  type="button"
                >
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="xl:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        ) : (
          <nav
            aria-label="CFS Builder workspaces"
            className="cfs-product-nav order-3 grid w-full min-w-0 grid-cols-3 gap-1 rounded-2xl border border-[#68d8ff]/16 bg-[#020812]/82 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_0_44px_rgba(104,216,255,0.09)] lg:order-2 lg:w-auto lg:shrink-0 lg:auto-cols-max lg:grid-flow-col lg:grid-cols-none"
          >
            {builderModes.map((mode) => {
              const Icon = mode.id === "planning" ? Map : mode.id === "economics" ? BarChart3 : Database;
              const active = cfsAppMode === mode.id;
              return (
                <button
                  aria-label={`${mode.label}: ${mode.description}`}
                  aria-pressed={active}
                  className={cn(
                    "group relative inline-flex h-10 min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border px-2.5 text-[11px] font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/75 sm:px-3 lg:justify-start lg:px-3.5 lg:text-xs xl:text-[13px]",
                    active
                      ? "border-[#68d8ff]/54 bg-[#102235]/95 text-[#e7fbff] shadow-[0_0_34px_rgba(104,216,255,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "border-transparent bg-transparent text-slate-400 hover:border-[#68d8ff]/18 hover:bg-white/[0.055] hover:text-white",
                  )}
                  key={mode.id}
                  onClick={() => selectAppMode(mode.id)}
                  title={mode.description}
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
                    <span className="hidden 2xl:inline">{mode.label}</span>
                    <span className="inline 2xl:hidden">{mode.shortLabel}</span>
                  </span>
                  <span className="sr-only">{mode.description}</span>
                </button>
              );
            })}
          </nav>
        )}

        {quickSearchEnabled ? (
        <div className="order-4 flex w-full min-w-0 items-center gap-2 md:order-2 md:w-auto md:min-w-[12rem] md:flex-1 lg:order-3">
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
                          {(cfsAppMode === "economics"
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
          <button
            aria-expanded={askCfsOpen}
            aria-controls="shared-ask-cfs-panel"
            aria-label="Open Ask CFS"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#35c98d]/28 bg-[#35c98d]/10 px-2.5 text-xs font-semibold text-[#baf5dc] transition hover:border-[#35c98d]/50 hover:bg-[#35c98d]/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35c98d]/70"
            data-testid="shared-ask-cfs-toggle"
            onClick={() => {
              setCommandPaletteOpen(false);
              setMoreOpen(false);
              onAskCfsOpenChange(!askCfsOpen);
            }}
            title="Ask CFS without leaving this workspace"
            type="button"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Ask CFS</span>
          </button>
          {quickSearchEnabled ? <button
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
              managementMode
                ? "Open Management sources and methodology"
                : cfsAppMode === "economics"
                ? "Open economics controls"
                : masterDataMode
                    ? "Open Master Data controls"
                : "Open dashboard controls"
            }
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            onClick={() => setMoreOpen((open) => !open)}
            title={
              managementMode
                ? "Management sources and methodology"
                : cfsAppMode === "economics"
                ? "Economics status and mode controls"
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
              {managementMode ? (
                <div className="grid gap-3">
                  <div className="rounded-lg border border-[#78bfd2]/20 bg-[#78bfd2]/8 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9bd1de]">
                      CFS Management
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      Leadership views summarize existing CFS evidence. Detailed controls remain in Builder.
                    </p>
                  </div>
                  <button
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:border-[#78bfd2]/30 hover:bg-white/[0.06]"
                    onClick={() => {
                      selectAppMode("planning");
                      setProductMode("methodology");
                      setMoreOpen(false);
                    }}
                    type="button"
                  >
                    Sources &amp; methodology
                    <BookOpen className="h-4 w-4 text-[#9bd1de]" />
                  </button>
                  <CompactStatusChip
                    icon={Activity}
                    label={runtimeStatusLabel}
                    tone={runtimeStatusTone}
                  />
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
                  <div className="grid gap-2">
                    {economicsProductModes.map((mode) => (
                      <button
                        aria-pressed={activeEconomicsSection === mode.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-sm text-slate-200 transition hover:border-[#dfcf91]/30 hover:bg-white/[0.06]"
                        key={mode.id}
                        onClick={() => {
                          setEconomicsSection(mode.id);
                          setMoreOpen(false);
                        }}
                        type="button"
                      >
                        {mode.label}
                        <span className="text-xs text-slate-500">{mode.shortLabel}</span>
                      </button>
                    ))}
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
                  <div className="grid grid-cols-3 gap-2">
                    {productModes.map((mode) => (
                      <button
                        aria-pressed={
                          mode.id === "due_diligence"
                            ? productMode === "due_diligence" || productMode === "executive_print"
                            : productMode === mode.id
                        }
                        className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#78bfd2]/30 hover:bg-white/[0.06]"
                        key={mode.id}
                        onClick={() => {
                          if (mode.id === "due_diligence") {
                            setParcelReviewView("review");
                            setPlanningSnapshotView("overview");
                          }
                          setProductMode(mode.id);
                          setMoreOpen(false);
                        }}
                        title={mode.title}
                        type="button"
                      >
                        {mode.shortLabel}
                      </button>
                    ))}
                  </div>
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
