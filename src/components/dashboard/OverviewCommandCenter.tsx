"use client";

import {
  ArrowRight,
  FlaskConical,
  Gauge,
  Layers3,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { USE_DEMO_DATA } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const CFS_SAVE_PLANNING_SNAPSHOT_EVENT =
  "cfs:save-planning-snapshot";
export const CFS_OPEN_LAYER_RAIL_EVENT = "cfs:open-layer-rail";
export const CFS_OPEN_MODEL_LAB_EVENT = "cfs:open-model-lab";
export const CFS_PLANNING_SNAPSHOT_SAVED_EVENT =
  "cfs:planning-snapshot-saved";

const commandWorkflows = [
  {
    accent: "primary",
    actionLabel: "Explore Countywide",
    icon: Layers3,
    id: "explore-intelligence",
    helper:
      "Explore live map layers, activity, constraints, schools, transportation, and infrastructure.",
  },
  {
    actionLabel: "Indicator Center",
    icon: Gauge,
    id: "indicator-center",
    helper:
      "Review attention flags and countywide signals that show where staff may need follow-up.",
  },
  {
    actionLabel: "Model Lab",
    icon: FlaskConical,
    id: "model-lab",
    helper:
      "Explore internal development model research and relative research signals.",
  },
];

const economicsWorkflows = [
  {
    accent: "primary",
    actionLabel: "Economic Workspace",
    icon: Layers3,
    id: "explore-intelligence",
    helper:
      "Review revenue per acre, underbuilt watch, public cost risk, investment readiness, and constraint-adjusted parcels.",
  },
  {
    accent: "secondary",
    actionLabel: "Economic Mission Control",
    icon: Gauge,
    id: "indicator-center",
    helper:
      "Monitor growth and tax-base intelligence, opportunity classes, confidence tiers, and fiscal/service burden context.",
  },
  {
    accent: "secondary",
    actionLabel: "Economic Scenario Lab",
    icon: FlaskConical,
    id: "model-lab",
    helper:
      "Compare current conditions, targeted investment, higher-density redevelopment, employment, and mixed-use corridor scenarios.",
  },
] as const;

export function OverviewCommandCenter() {
  const {
    overviewCommandMode,
    overviewLayout,
    cfsAppMode,
    planningSnapshot,
    savedPlanningSnapshots,
    selectedParcelId,
    setOverviewCommandMode,
    setOverviewLayoutCommandCenter,
    setOverviewLayoutPanel,
    setMapFocusMode,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  useEffect(() => {
    function handleSnapshotSaved() {
      setSnapshotSaved(true);
      window.setTimeout(() => setSnapshotSaved(false), 3000);
    }

    window.addEventListener(
      CFS_PLANNING_SNAPSHOT_SAVED_EVENT,
      handleSnapshotSaved,
    );

    return () => {
      window.removeEventListener(
        CFS_PLANNING_SNAPSHOT_SAVED_EVENT,
        handleSnapshotSaved,
      );
    };
  }, []);

  function showIntelligenceBrief() {
    setOverviewCommandMode("countywide");
    setOverviewLayoutPanel("left", "collapsed");
    setOverviewLayoutPanel("right", "visible");
    setOverviewLayoutCommandCenter("compact");
    window.dispatchEvent(new CustomEvent(CFS_OPEN_LAYER_RAIL_EVENT));
    document
      .getElementById("cfs-intelligence-brief")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function showIndicatorCenter() {
    setOverviewCommandMode("indicatorCenter");
    setMapFocusMode(false);
    setOverviewLayoutPanel("left", "hidden");
    setOverviewLayoutPanel("right", "hidden");
    setOverviewLayoutCommandCenter("compact");
    document
      .getElementById("cfs-indicator-center-dashboard")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function showModelLab() {
    setOverviewCommandMode("modelLab");
    setOverviewLayoutPanel("left", "collapsed");
    setOverviewLayoutPanel("right", "visible");
    setOverviewLayoutCommandCenter("compact");
    window.dispatchEvent(new CustomEvent(CFS_OPEN_MODEL_LAB_EVENT));
    document
      .getElementById("cfs-intelligence-brief")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function saveSnapshotForReport() {
    window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT));
  }

  function openPlanningSnapshot() {
    setPlanningSnapshotView("overview");
    setProductMode("due_diligence");
  }

  function handleWorkflowAction(workflowId: string) {
    if (workflowId === "explore-intelligence") {
      showIntelligenceBrief();
      return;
    }

    if (workflowId === "indicator-center") {
      showIndicatorCenter();
      return;
    }

    if (workflowId === "model-lab") {
      showModelLab();
    }
  }

  const snapshotStatusText = savedPlanningSnapshots.length
    ? `${savedPlanningSnapshots.length} saved`
    : planningSnapshot
      ? "Snapshot ready"
      : "No snapshots";
  const commandCenterCompact = overviewLayout.commandCenter === "compact";
  const economicsMode = cfsAppMode === "economics";
  const workflows = economicsMode ? economicsWorkflows : commandWorkflows;

  return (
    <section
      className={cn(
        "app-chrome rounded-lg border border-white/10 bg-[#07111f]/90 px-3 shadow-[0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-xl",
        commandCenterCompact ? "py-1.5" : "py-2",
      )}
      data-testid="cfs-command-center"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fe7ff]">
              {economicsMode ? "CFS Economics Center" : "CFS Workspace Center"}
            </p>
            <h1 className="mt-0.5 text-sm font-semibold leading-5 text-white md:text-base">
              {economicsMode
                ? "Review economic layers, monitor fiscal opportunity, or compare scenario tradeoffs."
                : "Explore countywide, review indicators, or open internal research."}
            </h1>
            {selectedParcelId ? (
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                Selected parcel: {selectedParcelId}
              </p>
            ) : null}
          </div>

          <div className="flex w-fit max-w-full shrink-0 flex-wrap items-center gap-2">
            <button
              aria-label="Save Planning Snapshot"
              className="inline-flex items-center gap-2 rounded-md border border-[#55d38f]/25 bg-[#55d38f]/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#a8f3c4] transition hover:border-[#55d38f]/45 hover:bg-[#55d38f]/15"
              onClick={saveSnapshotForReport}
              type="button"
            >
              <Save className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">Save Snapshot</span>
            </button>

            <div className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400">
              <Layers3 className="h-3.5 w-3.5 shrink-0 text-[#8fe7ff]" />
              <span className="whitespace-nowrap">{snapshotStatusText}</span>
            </div>

            {USE_DEMO_DATA ? (
              <div
                className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#bff3ff]"
                title="Uses cached CFS demo data. Full local version runs with PostGIS-backed county data."
              >
                <Gauge className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap">Portfolio Demo</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-1.5 md:grid-cols-3">
          {workflows.map((workflow) => {
            const Icon = workflow.icon;
            const primary = workflow.accent === "primary";
            const active =
              (workflow.id === "explore-intelligence" &&
                overviewCommandMode === "countywide") ||
              (workflow.id === "indicator-center" &&
                overviewCommandMode === "indicatorCenter") ||
              (workflow.id === "model-lab" &&
                overviewCommandMode === "modelLab");

            return (
              <button
                aria-pressed={active}
                className={cn(
                  "group relative flex min-h-[68px] min-w-0 overflow-hidden rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  active
                    ? "border-[#68d8ff]/65 bg-[#68d8ff]/16 text-white shadow-[0_0_30px_rgba(104,216,255,0.2)] focus-visible:outline-[#68d8ff]/70"
                    : primary
                      ? "border-[#d8b86a]/28 bg-[#d8b86a]/10 text-[#f8dc91] hover:border-[#d8b86a]/48 hover:bg-[#d8b86a]/15 focus-visible:outline-[#d8b86a]/70"
                      : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-[#68d8ff]/70",
                )}
                data-testid={`command-center-${workflow.id}`}
                key={workflow.id}
                onClick={() => handleWorkflowAction(workflow.id)}
                title={workflow.helper}
                type="button"
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#68d8ff] shadow-[0_0_14px_rgba(104,216,255,0.85)]" />
                ) : null}
                {active ? (
                  <span className="absolute right-2 top-1.5 rounded-full border border-[#68d8ff]/35 bg-[#68d8ff]/13 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#bff3ff]">
                    Active
                  </span>
                ) : (
                  <ArrowRight className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                )}
                <span className="flex min-w-0 flex-1 items-center gap-2.5 pr-7">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                      active
                        ? "border-[#68d8ff]/45 bg-[#68d8ff]/18 text-[#d7f8ff] shadow-[0_0_16px_rgba(104,216,255,0.22)]"
                        : primary
                          ? "border-[#d8b86a]/25 bg-[#d8b86a]/12 text-[#f8dc91]"
                          : "border-white/10 bg-white/[0.06] text-[#8fe7ff]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-semibold leading-4",
                        active ? "text-[#e7fbff]" : "text-white",
                      )}
                    >
                      {workflow.actionLabel}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                      {workflow.helper}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {snapshotSaved ? (
        <div className="mt-2 rounded-md border border-[#55d38f]/22 bg-[#55d38f]/[0.07] px-3 py-2 text-xs leading-5 text-[#9ff0bd]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-[#d7ffe4]">
                {planningSnapshot?.mapScreenshotStatus === "failed" ||
                planningSnapshot?.mapScreenshotStatus === "unavailable"
                  ? "Planning snapshot saved, but map image was unavailable."
                  : "Planning snapshot saved."}
              </p>
              <p className="mt-1 text-[#9ff0bd]/80">
                {overviewCommandMode === "indicatorCenter" ||
                planningSnapshot?.indicatorCenterContext
                  ? "Captured dashboard signals, selected indicator if available, Intelligence Brief, key stats, and caveats."
                  : "Captured map view, selected parcel if available, active layers, Intelligence Brief, key stats, and caveats."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 font-semibold text-[#d7ffe4] underline-offset-4 hover:underline"
                onClick={openPlanningSnapshot}
                type="button"
              >
                Open Snapshot
                <ArrowRight className="h-3 w-3" />
              </button>
              <button
                className="inline-flex items-center gap-1.5 font-semibold text-[#d7ffe4] underline-offset-4 hover:underline"
                onClick={saveSnapshotForReport}
                type="button"
              >
                Save Another Snapshot
              </button>
            </div>
          </div>
          {planningSnapshot?.mapScreenshotStatus === "failed" ||
          planningSnapshot?.mapScreenshotStatus === "unavailable" ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1.5 text-amber-100/85">
              Report will show a map-unavailable placeholder.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-5 text-slate-600">
          {economicsMode
            ? "Use the global search bar for parcel lookup. Planning Snapshot can capture screening-level economic, fiscal/service, and scenario context."
            : "Use the global search bar for parcel search. Planning Snapshot remains the top-level report builder."}
        </p>
      )}
    </section>
  );
}
