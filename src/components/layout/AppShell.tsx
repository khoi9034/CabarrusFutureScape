"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowRight,
  BarChart3,
  Binoculars,
  Building2,
  Database,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  Layers3,
  MapPinned,
  Network,
  Printer,
  Route,
  School,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { DashboardUrlSync } from "@/components/dashboard/DashboardUrlSync";
import { DueDiligenceReview } from "@/components/dashboard/DueDiligenceReview";
import { IndicatorCenterWorkspace } from "@/components/dashboard/IndicatorCenterWorkspace";
import { IntelligencePanel } from "@/components/dashboard/IntelligencePanel";
import { MethodologyWorkspace } from "@/components/dashboard/MethodologyWorkspace";
import { OverviewCommandCenter } from "@/components/dashboard/OverviewCommandCenter";
import { SceneViewContainer } from "@/components/gis/SceneViewContainer";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { EnterpriseErrorBoundary } from "@/components/ui/EnterpriseErrorBoundary";
import { DashboardProvider, useDashboardState } from "@/hooks/useDashboardState";
import { USE_DEMO_DATA } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { OverviewPanelWidthPreset } from "@/types";

const LEFT_PANEL_WIDTHS: Record<OverviewPanelWidthPreset, number> = {
  compact: 320,
  standard: 372,
  wide: 456,
};
const LEFT_PANEL_COLLAPSED_WIDTH = 64;
const LEFT_PANEL_MIN_EXPANDED_WIDTH = 320;
const LEFT_PANEL_MAX_EXPANDED_WIDTH = 520;
const LEFT_PANEL_COLLAPSE_THRESHOLD = 210;

const RIGHT_PANEL_WIDTHS: Record<OverviewPanelWidthPreset, number> = {
  compact: 320,
  standard: 390,
  wide: 460,
};

function clampLeftPanelWidth(width: number) {
  return Math.min(
    LEFT_PANEL_MAX_EXPANDED_WIDTH,
    Math.max(LEFT_PANEL_MIN_EXPANDED_WIDTH, width),
  );
}

export function AppShell() {
  return (
    <DashboardProvider>
      <DashboardUrlSync />
      <ProductShell />
    </DashboardProvider>
  );
}

function ProductShell() {
  const {
    developmentHotspotsEnabled,
    floodConstraintsEnabled,
    floodZonesEnabled,
    isMapFocusMode,
    parcelReviewView,
    productMode,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    setMapFocusMode,
    setOverviewCommandMode,
    setOverviewLayoutCommandCenter,
    setOverviewLayoutPanel,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
  } = useDashboardState();
  const executivePrintMode = productMode === "executive_print";
  const parcelReviewMode =
    productMode === "due_diligence" || executivePrintMode;
  const effectiveParcelReviewView = executivePrintMode
    ? "report"
    : parcelReviewView;
  const methodologyMode = productMode === "methodology";
  const overviewLandingMode = productMode === "overview";

  useEffect(() => {
    if (productMode === "executive_print") {
      setParcelReviewView("report");
      setPlanningSnapshotView("summary");
      setProductMode("due_diligence");
    }
  }, [
    productMode,
    setParcelReviewView,
    setPlanningSnapshotView,
    setProductMode,
  ]);

  useEffect(() => {
    if (!isMapFocusMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMapFocusMode(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMapFocusMode, setMapFocusMode]);

  return (
    <div className="cfs-command-backdrop metric-grid relative flex min-h-screen flex-col overflow-x-hidden text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,13,0.08),rgba(3,7,13,0.88))]" />
      <div className="pointer-events-none absolute left-0 right-0 top-[4.5rem] z-10 h-px gold-line opacity-70" />

      <div className="app-chrome">
        <TopNav />
      </div>

      {parcelReviewMode ? (
        <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
          <EnterpriseErrorBoundary
            moduleName="Planning Snapshot"
            resetKey={`${productMode}-${selectedParcelId ?? "none"}`}
          >
            <DueDiligenceReview
              developmentHotspotsEnabled={developmentHotspotsEnabled}
              floodConstraintsEnabled={floodConstraintsEnabled}
              floodZonesEnabled={floodZonesEnabled}
              parcelReviewView={effectiveParcelReviewView}
              selectedParcelId={selectedParcelId}
              selectedParcelIntelligence={selectedParcelIntelligence}
              selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
              setMapFocusMode={setMapFocusMode}
              setParcelReviewView={setParcelReviewView}
              setProductMode={setProductMode}
            />
          </EnterpriseErrorBoundary>
        </main>
      ) : methodologyMode ? (
        <EnterpriseErrorBoundary moduleName="Methodology" resetKey={productMode}>
          <MethodologyWorkspace />
        </EnterpriseErrorBoundary>
      ) : overviewLandingMode ? (
        <OverviewLandingPage
          onGoWorkspace={() => {
            setOverviewCommandMode("countywide");
            setOverviewLayoutPanel("left", "collapsed");
            setOverviewLayoutPanel("right", "visible");
            setOverviewLayoutCommandCenter("visible");
            setProductMode("workspace");
          }}
          onOpenMethodology={() => setProductMode("methodology")}
          onOpenPlanningSnapshot={() => {
            setParcelReviewView("review");
            setPlanningSnapshotView("overview");
            setProductMode("due_diligence");
          }}
        />
      ) : (
        <StableOverviewWorkspace />
      )}
    </div>
  );
}

function OverviewLandingPage({
  onGoWorkspace,
  onOpenMethodology,
  onOpenPlanningSnapshot,
}: {
  onGoWorkspace: () => void;
  onOpenMethodology: () => void;
  onOpenPlanningSnapshot: () => void;
}) {
  const capabilityCards = [
    {
      icon: Search,
      purpose: "Search parcel, PIN, owner, address, subdivision.",
      status: "Live",
      title: "Parcel Intelligence",
    },
    {
      icon: Building2,
      purpose: "Observed permit and new-construction context.",
      status: "Observed",
      title: "Development Activity",
    },
    {
      icon: Waves,
      purpose: "FEMA-based floodplain review context.",
      status: "Available",
      title: "Floodplain Review",
    },
    {
      icon: School,
      purpose: "Preliminary capacity flags for verification.",
      status: "Preliminary",
      title: "School Capacity Watch",
    },
    {
      icon: Gauge,
      purpose: "Monitoring dashboard for attention items.",
      status: "Mission Control",
      title: "Indicator Center",
    },
    {
      icon: FlaskConical,
      purpose: "Internal relative research signal only.",
      status: "Internal",
      title: "Model Research",
    },
    {
      icon: FileCheck2,
      purpose: "Saved context for executive reports.",
      status: "Report-ready",
      title: "Planning Snapshot",
    },
  ];
  const operatingFlow = [
    { icon: Database, label: "Data Sources" },
    { icon: MapPinned, label: "Parcel Intelligence" },
    { icon: BarChart3, label: "Monitoring Indicators" },
    { icon: FlaskConical, label: "Model Research" },
    { icon: Printer, label: "Planning Snapshot" },
  ];
  const todayCards = [
    {
      icon: Search,
      text: "Search and select parcels",
    },
    {
      icon: Layers3,
      text: "Explore countywide layers",
    },
    {
      icon: Gauge,
      text: "Monitor key indicators",
    },
    {
      icon: Waves,
      text: "Review floodplain, school, and development context",
    },
    {
      icon: FlaskConical,
      text: "Open internal Model Lab",
    },
    {
      icon: FileText,
      text: "Save Planning Snapshots",
    },
    {
      icon: Printer,
      text: "Print executive summaries",
    },
  ];
  const officialDataNeeded = [
    "WSACC true utility capacity",
    "Official school enrollment/capacity",
    "Official rezoning records",
    "Countywide development pipeline",
    "Future land use / small-area plans",
    "Planned road projects",
    "Planned utility extensions",
  ];
  const trustCaveats = [
    "Monitoring indicators are not official determinations.",
    "Model Lab is internal research only.",
    "No exact parcel probabilities are shown.",
    "Utility proxy does not confirm capacity.",
    "Preliminary school capacity indicators need official verification.",
  ];

  return (
    <main
      className="cfs-overview-landing relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4"
      data-testid="cfs-overview-landing"
    >
      <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-5">
        <section className="cfs-command-surface cfs-overview-hero relative overflow-hidden rounded-2xl px-5 py-8 backdrop-blur-xl md:px-8 lg:min-h-[24rem] lg:px-10 lg:py-10">
          <div className="pointer-events-none absolute inset-0 cfs-overview-grid-bg" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.72fr)] lg:items-center">
            <div className="min-w-0">
              <div className="cfs-status-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                <Sparkles className="h-3.5 w-3.5" />
                Enterprise planning intelligence
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.03] text-white md:text-6xl">
                Cabarrus FutureScape
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                Parcel-centered planning intelligence for growth, constraints,
                infrastructure, and executive reporting.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d8b86a]/40 bg-[#d8b86a]/14 px-4 py-3 text-sm font-semibold text-[#f9dd91] shadow-[0_0_30px_rgba(216,184,106,0.12)] transition hover:border-[#d8b86a]/60 hover:bg-[#d8b86a]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/70"
                  onClick={onGoWorkspace}
                  type="button"
                >
                  Go to Workspace
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#68d8ff]/30 bg-[#68d8ff]/10 px-4 py-3 text-sm font-semibold text-[#d7f8ff] transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/70"
                  onClick={onOpenPlanningSnapshot}
                  type="button"
                >
                  Open Planning Snapshot
                  <FileCheck2 className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/22 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/70"
                  onClick={onOpenMethodology}
                  type="button"
                >
                  View Methodology
                  <ShieldCheck className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="cfs-command-card relative min-w-0 rounded-2xl p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                    Current posture
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Ready for guided review
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                    USE_DEMO_DATA
                      ? "cfs-status-chip"
                      : "cfs-status-chip cfs-status-chip--green",
                  )}
                >
                  {USE_DEMO_DATA ? "Portfolio Demo" : "API Live"}
                </span>
              </div>
              <div className="grid gap-2">
                {[
                  ["Workspace", "Explore layers, indicators, and Model Lab"],
                  ["Snapshot", "Capture report-ready context"],
                  ["Governance", "Keep caveats attached"],
                ].map(([label, value]) => (
                  <div
                    className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-[#68d8ff]/12 bg-white/[0.04] px-3 py-2.5"
                    key={label}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {label}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-200">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Live Capability Strip"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        >
          {capabilityCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                className="cfs-command-card group min-w-0 rounded-xl p-3 transition"
                key={card.title}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/18 bg-[#68d8ff]/10 text-[#8fe7ff]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="cfs-status-chip cfs-status-chip--amber rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                    {card.status}
                  </span>
                </div>
                <h2 className="mt-3 text-sm font-semibold text-white">
                  {card.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {card.purpose}
                </p>
              </article>
            );
          })}
        </section>

        <section className="cfs-command-surface rounded-2xl p-4 md:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                CFS Operating Model
              </p>
              <h2 className="text-xl font-semibold text-white">
                From source context to executive snapshot
              </h2>
            </div>
            <span className="text-xs font-medium text-slate-500">
              CSS-only visual flow
            </span>
          </div>
          <div className="cfs-overview-flow mt-5 grid gap-3 md:grid-cols-5">
            {operatingFlow.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  className="cfs-command-card relative flex min-w-0 items-center gap-3 rounded-xl p-3"
                  key={step.label}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#b7f0ff]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-slate-100">
                    {step.label}
                  </span>
                  {index < operatingFlow.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="cfs-overview-flow-link"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <section className="cfs-command-surface rounded-2xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <Binoculars className="h-5 w-5 text-[#d8b86a]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d8b86a]">
                  What CFS Can Do Today
                </p>
                <h2 className="text-xl font-semibold text-white">
                  Operational review workflows
                </h2>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {todayCards.map((card) => {
                const Icon = card.icon;

                return (
                  <article
                    className="cfs-command-card flex min-w-0 items-center gap-3 rounded-xl px-3 py-3"
                    key={card.text}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/18 bg-[#68d8ff]/10 text-[#8fe7ff]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-medium leading-5 text-slate-200">
                      {card.text}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="cfs-command-surface rounded-2xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-[#8fe7ff]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                  What Still Needs Official Data
                </p>
                <h2 className="text-xl font-semibold text-white">
                  Highest-value inputs
                </h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {officialDataNeeded.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#d8b86a]/12 bg-[#d8b86a]/[0.045] px-3 py-2"
                  key={item}
                >
                  <span className="min-w-0 truncate text-sm text-slate-200">
                    {item}
                  </span>
                  <span className="shrink-0 rounded-full border border-[#d8b86a]/18 bg-[#d8b86a]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#f0cd79]">
                    Needed
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="cfs-command-surface cfs-overview-trust rounded-2xl p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a8f3c4]">
                Safety / Trust Strip
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                Clear boundaries travel with every workflow
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {trustCaveats.map((caveat) => (
                <div
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-[#55d38f]/16 bg-[#55d38f]/[0.055] px-3 py-2 text-xs font-medium leading-5 text-[#d9ffe7]"
                  key={caveat}
                >
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#a8f3c4]" />
                  <span>{caveat}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="cfs-command-card mb-2 flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              Ready to work inside the live planning workspace?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Workspace opens Explore Countywide by default.
            </p>
          </div>
          <button
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#68d8ff]/30 bg-[#68d8ff]/10 px-4 py-2.5 text-sm font-semibold text-[#d7f8ff] transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/15"
            onClick={onGoWorkspace}
            type="button"
          >
            Enter Workspace
            <Route className="h-4 w-4" />
          </button>
        </section>
      </div>
    </main>
  );
}

function StableOverviewWorkspace() {
  const {
    isMapFocusMode,
    overviewCommandMode,
    overviewLayout,
    selectedParcelId,
    setOverviewLayoutCommandCenter,
    setOverviewLayoutPanel,
  } = useDashboardState();
  const [layerRailWidth, setLayerRailWidth] = useState(
    LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
  );
  const [lastExpandedLayerRailWidth, setLastExpandedLayerRailWidth] = useState(
    LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
  );
  const [draggingLayerRail, setDraggingLayerRail] = useState(false);
  const initialLeftRailCollapseAppliedRef = useRef(false);
  const commandCenterHidden = overviewLayout.commandCenter === "hidden";
  const leftPanelHidden = overviewLayout.leftPanel === "hidden";
  const leftPanelCollapsed = overviewLayout.leftPanel === "collapsed";
  const rightPanelHidden = overviewLayout.rightPanel === "hidden";
  const rightPanelWidth = RIGHT_PANEL_WIDTHS[overviewLayout.rightPanelWidth];
  const indicatorCenterDashboardMode = overviewCommandMode === "indicatorCenter";

  useEffect(() => {
    if (initialLeftRailCollapseAppliedRef.current) {
      return;
    }

    initialLeftRailCollapseAppliedRef.current = true;
    setOverviewLayoutPanel("left", "collapsed");
  }, [setOverviewLayoutPanel]);

  useEffect(() => {
    if (!draggingLayerRail) {
      const frameId = window.requestAnimationFrame(() => {
        const nextWidth = clampLeftPanelWidth(
          LEFT_PANEL_WIDTHS[overviewLayout.leftPanelWidth],
        );

        setLayerRailWidth(nextWidth);
        setLastExpandedLayerRailWidth(nextWidth);
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [draggingLayerRail, overviewLayout.leftPanelWidth]);

  function requestMapResize() {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function toggleLayerRailCollapsed() {
    if (leftPanelCollapsed) {
      const nextWidth = clampLeftPanelWidth(lastExpandedLayerRailWidth);

      setLayerRailWidth(nextWidth);
      setLastExpandedLayerRailWidth(nextWidth);
      setOverviewLayoutPanel("left", "visible");
      requestMapResize();
      return;
    }

    setLastExpandedLayerRailWidth(clampLeftPanelWidth(layerRailWidth));
    setOverviewLayoutPanel("left", "collapsed");
    requestMapResize();
  }

  function handleLayerRailResizeStart(event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingLayerRail(true);
    setOverviewLayoutPanel("left", "visible");
    document.body.classList.add("cfs-resizing");

    const startX = event.clientX;
    const startWidth = clampLeftPanelWidth(
      leftPanelCollapsed ? lastExpandedLayerRailWidth : layerRailWidth,
    );
    let latestWidth = startWidth;
    let latestCollapsed = false;

    setLayerRailWidth(startWidth);
    setLastExpandedLayerRailWidth(startWidth);

    function handlePointerMove(moveEvent: PointerEvent) {
      const rawWidth = startWidth + moveEvent.clientX - startX;

      if (rawWidth <= LEFT_PANEL_COLLAPSE_THRESHOLD) {
        latestCollapsed = true;
        setOverviewLayoutPanel("left", "collapsed");
        window.dispatchEvent(new Event("resize"));
        return;
      }

      if (latestCollapsed) {
        setOverviewLayoutPanel("left", "visible");
      }

      latestCollapsed = false;
      latestWidth = clampLeftPanelWidth(rawWidth);
      setLayerRailWidth(latestWidth);
      setLastExpandedLayerRailWidth(latestWidth);
      window.dispatchEvent(new Event("resize"));
    }

    function handlePointerUp() {
      setDraggingLayerRail(false);
      document.body.classList.remove("cfs-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (latestCollapsed) {
        setOverviewLayoutPanel("left", "collapsed");
      } else {
        setLayerRailWidth(latestWidth);
        setLastExpandedLayerRailWidth(latestWidth);
        setOverviewLayoutPanel("left", "visible");
      }

      requestMapResize();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <main
      className={cn(
        "relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:p-4",
        isMapFocusMode && "p-0 lg:p-0",
      )}
    >
      {!isMapFocusMode && !commandCenterHidden ? (
        <EnterpriseErrorBoundary moduleName="Command Center">
          <OverviewCommandCenter />
        </EnterpriseErrorBoundary>
      ) : null}

      <div
        className={cn(
          "relative flex min-h-0 flex-1 gap-3 overflow-hidden",
          isMapFocusMode &&
            "fixed inset-3 top-[4.75rem] z-50 rounded-xl bg-[#050911]/95 p-0",
        )}
      >
        {!isMapFocusMode && !leftPanelHidden && !indicatorCenterDashboardMode ? (
          <div
            className="relative z-30 flex h-full min-h-0 shrink-0 overflow-visible transition-[width] duration-150 ease-out"
            style={{
              width: leftPanelCollapsed
                ? LEFT_PANEL_COLLAPSED_WIDTH
                : layerRailWidth,
            }}
          >
            <Sidebar
              collapsed={leftPanelCollapsed}
              dragging={draggingLayerRail}
              onResizeStart={handleLayerRailResizeStart}
              onToggleCollapsed={toggleLayerRailCollapsed}
              overviewCommandMode={overviewCommandMode}
            />
          </div>
        ) : null}

        <section
          className={cn(
            "cfs-command-surface relative min-w-0 flex-1 overflow-hidden rounded-lg",
            indicatorCenterDashboardMode && !isMapFocusMode
              ? "bg-[#07111f]"
              : "bg-[#050911]",
          )}
        >
          {indicatorCenterDashboardMode && !isMapFocusMode ? (
            <EnterpriseErrorBoundary moduleName="Indicator Center Workspace">
              <IndicatorCenterWorkspace />
            </EnterpriseErrorBoundary>
          ) : (
            <EnterpriseErrorBoundary
              moduleName="3D SceneView"
              resetKey={selectedParcelId}
            >
              <SceneViewContainer />
            </EnterpriseErrorBoundary>
          )}
        </section>

        {!isMapFocusMode && !rightPanelHidden && !indicatorCenterDashboardMode ? (
          <aside
            className="flex h-full min-h-0 shrink-0 overflow-visible"
            style={{ width: rightPanelWidth }}
          >
            <EnterpriseErrorBoundary
              moduleName="Intelligence Panel"
              resetKey={`overview-stable-${selectedParcelId ?? "none"}`}
            >
              <IntelligencePanel />
            </EnterpriseErrorBoundary>
          </aside>
        ) : null}
      </div>

      {!isMapFocusMode ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex flex-wrap justify-end gap-2">
          {leftPanelHidden && !indicatorCenterDashboardMode ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutPanel("left", "collapsed")}
              type="button"
            >
              Show Layers
            </button>
          ) : null}
          {rightPanelHidden && !indicatorCenterDashboardMode ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutPanel("right", "visible")}
              type="button"
            >
              Show Intelligence
            </button>
          ) : null}
          {commandCenterHidden ? (
            <button
              className="pointer-events-auto rounded-full border border-[#68d8ff]/25 bg-[#07111f]/90 px-3 py-2 text-xs font-semibold text-[#d7f8ff] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:border-[#68d8ff]/50 hover:bg-[#68d8ff]/12"
              onClick={() => setOverviewLayoutCommandCenter("visible")}
              type="button"
            >
              Show Command Center
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
