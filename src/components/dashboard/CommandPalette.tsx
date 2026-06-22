"use client";

import {
  BarChart3,
  Bell,
  Command,
  CornerDownLeft,
  Database,
  FileText,
  GitBranch,
  Layers3,
  LayoutDashboard,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  commandCategoryLabels,
  commandCategoryOrder,
} from "@/lib/dashboard/commandRegistry";
import { PARCEL_SEARCH_INSPECT_EVENT } from "@/components/dashboard/ParcelSearchState";
import {
  searchParcelIndex,
  type ParcelSearchRecord,
} from "@/data/intelligence/parcelSearchData";
import {
  normalizeBackendParcelDetailResponse,
  normalizeBackendParcelMapFocusResponse,
} from "@/lib/adapters/parcelDetailAdapter";
import { normalizeBackendParcelSearchResponse } from "@/lib/adapters/parcelSearchAdapter";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getParcelDetail, searchParcels } from "@/lib/api/parcels";
import { searchDemoParcels } from "@/lib/demo-data/client";
import { mockDashboardSearchServiceAdapter } from "@/lib/dashboard/searchServiceAdapter";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useParcelMapFocus } from "@/hooks/useParcelMapFocus";
import { cn } from "@/lib/utils";
import type { CommandAction, CommandCategory, SearchResult } from "@/types/search";

interface CommandPaletteProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const categoryIcons: Record<
  CommandCategory,
  ComponentType<{ className?: string }>
> = {
  briefing: FileText,
  comparison: BarChart3,
  dataset: Database,
  event: Bell,
  layer: Layers3,
  parcel: MapPin,
  place: Map,
  report: FileText,
  role: UserRound,
  scenario: GitBranch,
  selection: XCircle,
  simulation: SlidersHorizontal,
  workspace: LayoutDashboard,
};

export function CommandPalette({
  onOpenChange,
  open,
}: CommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [generatedParcelRecordsById, setGeneratedParcelRecordsById] = useState<
    Record<string, ParcelSearchRecord>
  >({});
  const [generatedParcelResults, setGeneratedParcelResults] = useState<
    SearchResult[]
  >([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputId = "command-palette-search";
  const titleId = "command-palette-title";
  const listboxId = "command-palette-results";
  const {
    applyRolePreset,
    applyWorkspacePreset,
    clearSelectedParcel,
    exportScenarioComparison,
    roleId,
    selectParcel,
    setSelectedParcelIntelligence,
    setLayerVisibility,
    setBriefingMode,
    setComparisonPair,
    generateBoardBrief,
    openPrintLayout,
    runMockExport,
    selectReportPackage,
    setReportIntent,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
    toggleLayer,
  } = useDashboardState();
  const { setParcelFocus, setParcelFocusFromRecord } = useParcelMapFocus();

  const commandResults = useMemo(
    () =>
      mockDashboardSearchServiceAdapter.searchCommands({
        limit: 18,
        query,
        activeRoleId: roleId,
      }),
    [query, roleId],
  );

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!open || trimmedQuery.length < 3) {
      return;
    }

    let cancelled = false;

    const searchPromise = USE_BACKEND_API
      ? searchParcels({
          limit: 6,
          offset: 0,
          q: trimmedQuery,
        }).then(normalizeBackendParcelSearchResponse)
      : USE_DEMO_DATA
        ? searchDemoParcels({
            limit: 6,
            query: trimmedQuery,
          })
        : searchParcelIndex({
            limit: 6,
            query: trimmedQuery,
          });

    searchPromise
      .then((parcelResults) => {
        if (cancelled) {
          return;
        }

        setGeneratedParcelRecordsById(
          Object.fromEntries(
            parcelResults.map((parcel) => [parcel.officialParcelId, parcel]),
          ),
        );
        setGeneratedParcelResults(
          parcelResults.map((parcel, index) => ({
            accent: "#68d8ff",
            action: {
              officialParcelId: parcel.officialParcelId,
              type: "inspect-intelligence-parcel",
            },
            category: "parcel",
            id: `parcel-intelligence:${parcel.officialParcelId}`,
            keywords: [
              parcel.officialParcelId,
              parcel.pin14 ?? "",
              parcel.ownerName ?? "",
              parcel.ownerSecondaryName ?? "",
              parcel.mailingAddress ?? "",
              parcel.subdivision ?? "",
              parcel.neighborhood ?? "",
              parcel.zoningJurisdiction ?? "",
              parcel.zoningCode ?? "",
              parcel.zoningCategory ?? "",
              parcel.parcelQualityStatus ?? "",
              parcel.valuationBand ?? "",
              parcel.governanceWarnings.join(" "),
            ],
            matchedFields: ["parcel intelligence index"],
            matchScore: 1000 - index,
            meta: {
              badge: parcel.zoningCode ?? parcel.zoningConfidence ?? "Parcel",
              source: "generated",
            },
            resultType: "parcel",
            subtitle: `${parcel.pin14 ?? "No PIN"} / ${
              parcel.zoningJurisdiction ?? "No zoning jurisdiction"
            } / ${parcel.subdivision ?? parcel.neighborhood ?? "No location context"}`,
            title: parcel.ownerName
              ? `${parcel.ownerName} / ${parcel.officialParcelId}`
              : parcel.officialParcelId,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setGeneratedParcelRecordsById({});
          setGeneratedParcelResults([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const results = useMemo(
    () => [...generatedParcelResults, ...commandResults].slice(0, 24),
    [commandResults, generatedParcelResults],
  );

  const groupedResults = useMemo(
    () =>
      commandCategoryOrder
        .map((category) => ({
          category,
          items: results
            .map((result, index) => ({ index, result }))
            .filter((entry) => entry.result.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [results],
  );

  const executeAction = useCallback(
    (action: CommandAction) => {
      switch (action.type) {
        case "apply-role-preset":
          applyRolePreset(action.roleId);
          break;
        case "apply-workspace-preset":
          applyWorkspacePreset(action.viewMode);
          break;
        case "noop":
          break;
        case "clear-selection":
          clearSelectedParcel();
          break;
        case "set-briefing-mode":
          setBriefingMode(action.briefingMode);
          break;
        case "generate-board-brief":
          generateBoardBrief();
          break;
        case "export-scenario-comparison":
          exportScenarioComparison();
          break;
        case "open-print-layout":
          openPrintLayout(action.printableViewMode);
          break;
        case "run-mock-export":
          runMockExport(action.format);
          break;
        case "select-report-package":
          selectReportPackage(action.packageId);
          break;
        case "set-report-intent":
          setReportIntent(action.intent);
          break;
        case "set-scenario-comparison":
          setComparisonPair(action.comparisonPair);
          setBriefingMode(action.briefingMode);
          break;
        case "select-parcel":
          selectParcel(action.parcelId, { source: "dashboard" });
          break;
        case "inspect-intelligence-parcel":
          {
            const parcelRecord =
              generatedParcelRecordsById[action.officialParcelId];

            if (parcelRecord) {
              setSelectedParcelIntelligence(
                parcelRecord,
                USE_BACKEND_API ? "api" : "static",
              );
              setParcelFocusFromRecord(
                {
                  officialParcelId: parcelRecord.officialParcelId,
                  pin14: parcelRecord.pin14,
                },
                "command",
              );
            } else {
              selectParcel(action.officialParcelId, { source: "dashboard" });
            }

            if (USE_BACKEND_API) {
              void getParcelDetail(action.officialParcelId, {
                include_geometry: true,
              })
                .then((response) => {
                  const fallbackRecord =
                    parcelRecord ??
                    ({
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
                      officialParcelId: action.officialParcelId,
                      ownerName: null,
                      ownerSecondaryName: null,
                      parcelQualityStatus: null,
                      parcelSizeCategory: null,
                      pin14: null,
                      planningBoundaryType: null,
                      planningJurisdiction: null,
                      primaryGovernanceWarning: null,
                      safeForDashboard: false,
                      searchText: action.officialParcelId.toLowerCase(),
                      subdivision: null,
                      valuationBand: null,
                      zoningCategory: null,
                      zoningCode: null,
                      zoningConfidence: null,
                      zoningJurisdiction: null,
                    } satisfies ParcelSearchRecord);
                  const hydratedRecord = normalizeBackendParcelDetailResponse(
                    response,
                    fallbackRecord,
                  );
                  const backendMapFocus =
                    normalizeBackendParcelMapFocusResponse(
                      response,
                      hydratedRecord,
                    );

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
                .catch(() => {
                  // Keep the search-result selection visible if detail hydration
                  // fails; existing API diagnostics surface failures elsewhere.
                });
            }
          }
          window.dispatchEvent(
            new CustomEvent(PARCEL_SEARCH_INSPECT_EVENT, {
              detail: {
                officialParcelId: action.officialParcelId,
              },
            }),
          );
          break;
        case "set-layer-visibility":
          setLayerVisibility(action.layerId, action.visible);
          break;
        case "set-scenario":
          setScenarioId(action.scenarioId);
          break;
        case "set-simulation-intensity":
          setSimulationIntensity(action.intensity);
          break;
        case "set-simulation-year":
          setSimulationYear(action.year);
          break;
        case "toggle-layer":
          toggleLayer(action.layerId);
          break;
      }
    },
    [
      applyRolePreset,
      applyWorkspacePreset,
      clearSelectedParcel,
      exportScenarioComparison,
      generatedParcelRecordsById,
      selectParcel,
      setParcelFocus,
      setParcelFocusFromRecord,
      setSelectedParcelIntelligence,
      setBriefingMode,
      setComparisonPair,
      generateBoardBrief,
      openPrintLayout,
      runMockExport,
      selectReportPackage,
      setReportIntent,
      setLayerVisibility,
      setScenarioId,
      setSimulationIntensity,
      setSimulationYear,
      toggleLayer,
    ],
  );

  const executeResult = useCallback(
    (result: SearchResult) => {
      if (result.disabled) {
        return;
      }

      executeAction(result.action);
      setQuery("");
      onOpenChange(false);
    },
    [executeAction, onOpenChange],
  );

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const selectedIndex = results.length
    ? Math.min(activeIndex, results.length - 1)
    : 0;

  function closePalette() {
    setActiveIndex(0);
    setGeneratedParcelRecordsById({});
    setGeneratedParcelResults([]);
    setQuery("");
    onOpenChange(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length ? (current + 1) % results.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
      return;
    }

    if (event.key === "Enter" && results[selectedIndex]) {
      event.preventDefault();
      const selectedResult = results[selectedIndex];

      if (!selectedResult.disabled) {
        executeResult(selectedResult);
      }
    }
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#02050a]/72 px-3 py-5 backdrop-blur-md sm:px-6 sm:py-10 lg:pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePalette();
        }
      }}
      role="dialog"
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-white/12 bg-[#08111d]/95 shadow-[0_28px_120px_rgba(0,0,0,0.58),0_0_60px_rgba(216,184,106,0.12)]"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="sr-only" id={titleId}>
          Command palette
        </h2>
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <Search className="h-4 w-4 text-[#d8b86a]" />
          <label className="sr-only" htmlFor={searchInputId}>
            Search dashboard commands
          </label>
          <input
            aria-activedescendant={
              results[selectedIndex]
                ? `command-result-${selectedIndex}`
                : undefined
            }
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label="Search command"
            className="h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
            id={searchInputId}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setActiveIndex(0);
              setQuery(nextQuery);
              if (nextQuery.trim().length < 3) {
                setGeneratedParcelRecordsById({});
                setGeneratedParcelResults([]);
              }
            }}
            placeholder="Search command"
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          <Command className="h-4 w-4 text-slate-500" />
          <button
            aria-label="Close command palette"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-white/20 hover:text-white"
            onClick={closePalette}
            title="Close command palette"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className="max-h-[min(680px,calc(100dvh-9.5rem))] overflow-y-auto overscroll-contain p-3"
          id={listboxId}
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-white/10 bg-black/20 px-4 text-center text-sm text-slate-500">
              <Search className="mb-3 h-5 w-5 text-slate-600" />
              <p className="font-medium text-slate-400">No commands found</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Try a parcel ID, layer name, role, report, event, or scenario.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedResults.map((group) => (
                <CommandResultGroup
                  activeIndex={selectedIndex}
                  group={group}
                  key={group.category}
                  onExecute={executeResult}
                  onHover={setActiveIndex}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CommandResultGroupProps {
  activeIndex: number;
  group: {
    category: CommandCategory;
    items: {
      index: number;
      result: SearchResult;
    }[];
  };
  onExecute: (result: SearchResult) => void;
  onHover: (index: number) => void;
}

function CommandResultGroup({
  activeIndex,
  group,
  onExecute,
  onHover,
}: CommandResultGroupProps) {
  const Icon = categoryIcons[group.category];

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {commandCategoryLabels[group.category]}
      </div>

      <div className="space-y-1">
        {group.items.map(({ index, result }) => {
          const active = index === activeIndex;

          return (
            <button
              aria-selected={active}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition focus:outline-none focus-visible:border-[#d8b86a]/55 focus-visible:ring-2 focus-visible:ring-[#d8b86a]/20",
                active
                  ? "border-[#d8b86a]/35 bg-[#d8b86a]/[0.1] text-white shadow-[0_0_24px_rgba(216,184,106,0.1)]"
                  : "border-transparent bg-white/[0.025] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]",
              )}
              disabled={result.disabled}
              id={`command-result-${index}`}
              key={result.id}
              onClick={() => onExecute(result)}
              onMouseEnter={() => onHover(index)}
              role="option"
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {result.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {result.subtitle}
                </span>
              </span>

              <span className="flex items-center gap-2">
                {result.meta?.badge ? (
                  <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-slate-400">
                    {result.meta.badge}
                  </span>
                ) : null}
                <CornerDownLeft
                  className={cn(
                    "h-3.5 w-3.5",
                    active ? "text-[#d8b86a]" : "text-slate-600",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
