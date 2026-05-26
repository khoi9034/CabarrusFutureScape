"use client";

import {
  BarChart3,
  Bell,
  Command,
  CornerDownLeft,
  FileText,
  GitBranch,
  Layers3,
  LayoutDashboard,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
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
import { mockDashboardSearchServiceAdapter } from "@/lib/dashboard/searchServiceAdapter";
import { useDashboardState } from "@/hooks/useDashboardState";
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
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = "command-palette-results";
  const {
    applyRolePreset,
    applyWorkspacePreset,
    clearSelectedParcel,
    exportScenarioComparison,
    roleId,
    selectParcel,
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

  const results = useMemo(
    () =>
      mockDashboardSearchServiceAdapter.searchCommands({
        limit: 18,
        query,
        activeRoleId: roleId,
      }),
    [query, roleId],
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
      selectParcel,
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

  if (!open) {
    return null;
  }

  const selectedIndex = results.length
    ? Math.min(activeIndex, results.length - 1)
    : 0;

  function closePalette() {
    setActiveIndex(0);
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
      executeResult(results[selectedIndex]);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#02050a]/70 px-3 pt-24 backdrop-blur-md sm:px-6"
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
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
          <Search className="h-4 w-4 text-[#d8b86a]" />
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
            onChange={(event) => {
              setActiveIndex(0);
              setQuery(event.target.value);
            }}
            placeholder="Search command"
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          <Command className="h-4 w-4 text-slate-500" />
        </div>

        <div
          className="max-h-[62vh] overflow-y-auto p-3"
          id={listboxId}
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sm text-slate-500">
              No results
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
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                active
                  ? "border-[#d8b86a]/35 bg-[#d8b86a]/[0.1] text-white shadow-[0_0_24px_rgba(216,184,106,0.1)]"
                  : "border-transparent bg-white/[0.025] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]",
              )}
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
