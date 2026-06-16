"use client";

import {
  ArrowRight,
  BarChart3,
  FileSearch,
  Layers3,
  Save,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";

export const CFS_SAVE_PLANNING_SNAPSHOT_EVENT =
  "cfs:save-planning-snapshot";
export const CFS_OPEN_LAYER_RAIL_EVENT = "cfs:open-layer-rail";
export const CFS_PLANNING_SNAPSHOT_SAVED_EVENT =
  "cfs:planning-snapshot-saved";

const commandWorkflows = [
  {
    accent: "primary",
    actionLabel: "Search Parcel",
    icon: Search,
    id: "find-parcel",
    helper: "Focus the parcel search bar.",
  },
  {
    actionLabel: "Countywide Intelligence",
    icon: BarChart3,
    id: "explore-intelligence",
    helper: "Open advanced layers and indicators.",
  },
  {
    icon: Save,
    id: "build-snapshot",
    actionLabel: "Save Snapshot",
    helper: "Capture the current map context.",
  },
  {
    actionLabel: "Open Snapshots",
    icon: FileSearch,
    id: "open-snapshots",
    helper: "Review saved report snapshots.",
  },
];

export function OverviewCommandCenter() {
  const {
    planningSnapshot,
    savedPlanningSnapshots,
    selectedParcelId,
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

  function focusParcelSearch() {
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search parcels"]',
    );

    searchInput?.focus();
  }

  function showIntelligenceBrief() {
    window.dispatchEvent(new CustomEvent(CFS_OPEN_LAYER_RAIL_EVENT));
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
    if (workflowId === "find-parcel") {
      focusParcelSearch();
      return;
    }

    if (workflowId === "explore-intelligence") {
      showIntelligenceBrief();
      return;
    }

    if (workflowId === "open-snapshots") {
      openPlanningSnapshot();
      return;
    }

    saveSnapshotForReport();
  }

  return (
    <section
      className="app-chrome rounded-lg border border-white/10 bg-[#07111f]/90 px-3 py-2.5 shadow-[0_14px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl"
      data-testid="cfs-command-center"
    >
      <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="min-w-0 2xl:w-[22rem] 2xl:shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fe7ff]">
            CFS Command Center
          </p>
          <h1 className="mt-1 text-base font-semibold leading-6 text-white md:text-lg">
            Search, explore, and save report-ready context.
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            {selectedParcelId
              ? `Selected parcel: ${selectedParcelId}`
              : "Search a parcel, review countywide intelligence, or capture the current map into an executive-ready planning snapshot."}
          </p>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          {commandWorkflows.map((workflow) => {
            const Icon = workflow.icon;
            const primary = workflow.accent === "primary";

            return (
              <button
                className={cn(
                  "group inline-flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  primary
                    ? "border-[#d8b86a]/35 bg-[#d8b86a]/12 text-[#f8dc91] hover:bg-[#d8b86a]/18 focus-visible:outline-[#d8b86a]/70"
                    : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-[#68d8ff]/70",
                )}
                data-testid={`command-center-${workflow.id}`}
                key={workflow.id}
                onClick={() => handleWorkflowAction(workflow.id)}
                title={workflow.helper}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm font-semibold">
                    {workflow.actionLabel}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-400 2xl:max-w-[10rem]">
          <Layers3 className="h-3.5 w-3.5 text-[#8fe7ff]" />
          <span className="truncate">
            {savedPlanningSnapshots.length
              ? `${savedPlanningSnapshots.length} saved`
              : planningSnapshot
                ? "Snapshot ready"
                : "No snapshots"}
          </span>
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
                Captured map view, selected parcel if available, active layers,
                Intelligence Brief, key stats, and caveats.
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
          Layers stay collapsed by default. Use Countywide Intelligence when
          you need advanced overlays and indicators.
        </p>
      )}
    </section>
  );
}
