"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Gauge,
  GraduationCap,
  HelpCircle,
  ListChecks,
  Move,
  RotateCcw,
  Save,
  ShieldAlert,
  TrendingUp,
  Waves,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  CFS_PLANNING_SNAPSHOT_SAVED_EVENT,
} from "@/components/dashboard/OverviewCommandCenter";
import { AskCfsPanel } from "@/components/dashboard/AskCfsPanel";
import {
  buildIndicatorCenterReviewThemes,
  indicatorCenterDefinitions,
  indicatorCenterMissingDataItems,
} from "@/data/intelligence/indicatorCenter";
import { developmentModelLabSummary } from "@/data/intelligence/developmentModelLab";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { useDevelopmentTrends } from "@/hooks/useDevelopmentTrends";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { usePermitSegmentStatistics } from "@/hooks/usePermitSegmentStatistics";
import { useSchoolConstraintSummary } from "@/hooks/useSchoolConstraintSummary";
import { useSchoolPressureLayer } from "@/hooks/useSchoolPressureLayer";
import { USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import { getDemoManifest } from "@/lib/demo-data/client";
import { getIndicatorIntelligence } from "@/lib/indicatorIntelligenceService";
import { cn } from "@/lib/utils";
import type {
  IndicatorCenterContext,
  IndicatorCenterGroupId,
  IndicatorCenterPriorityLabel,
  PlanningSnapshot,
  PlanningSnapshotSectionKey,
} from "@/types";
import type { CfsAiDashboardActions, CfsAiSearchResponse } from "@/types/api";
import type {
  IndicatorDomainReadiness,
  IndicatorIntelligenceResponse,
  IndicatorSignal,
} from "@/types/api";
import type {
  SchoolPressureFeature,
  SchoolPressureLayerState,
  SchoolPressureSummary,
} from "@/types/map/schoolPressure";

export interface IndicatorCenterSummaryCard {
  caveat: string;
  indicator: IndicatorCenterContext;
  secondaryValue?: string;
  value: string;
}

interface ExecutiveSignalCardModel {
  caveat: string;
  confidence: string;
  groupId: IndicatorCenterGroupId;
  icon: ReactNode;
  label: string;
  sparkline?: ChartDatum[];
  status: string;
  subvalue: string;
  tone: "attention" | "data" | "internal" | "neutral" | "review";
  value: string;
}

interface IndicatorReadinessTab {
  description: string;
  groupIds: IndicatorCenterGroupId[];
  id: IndicatorReadinessTabId;
  label: string;
}

type IndicatorReadinessTabId =
  | "all"
  | "growth"
  | "constraints"
  | "infrastructure"
  | "schools"
  | "data"
  | "watchlist";

interface AttentionQueueRow {
  caveat: string;
  category: string;
  currentEvidence: string;
  dataBasis: string;
  indicator: IndicatorCenterContext;
  indicatorName: string;
  priorityLabel: string;
  recommendedFollowUp: string;
  whyItMatters: string;
}

interface ChartDatum {
  label: string;
  value: number;
}

interface DrawerGeometry {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface DrawerInteraction {
  resizeHandle?: DrawerResizeHandle;
  startHeight: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startX: number;
  startY: number;
  type: "drag" | "resize";
}

type DrawerResizeHandle =
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right";

interface DrilldownStat {
  caveat?: string;
  label: string;
  value: string;
}

interface DrilldownSectionModel {
  accent: "cyan" | "gold" | "green" | "purple" | "red" | "slate";
  additionalCharts?: Array<{
    caveat: string;
    data: ChartDatum[];
    emptyLabel: string;
    title: string;
  }>;
  caveat: string;
  chart?: {
    caveat: string;
    data: ChartDatum[];
    emptyLabel: string;
    title: string;
  };
  description: string;
  detailSummary: string;
  icon: ReactNode;
  id: IndicatorCenterGroupId;
  indicator: IndicatorCenterContext;
  stats: DrilldownStat[];
  title: string;
}

interface DomainReadinessRow {
  caveat: string;
  coverage: string;
  currentUse: string;
  dataStatus: string;
  domain: string;
  groupId: IndicatorCenterGroupId;
  updateCadence: string;
}

interface SchoolUtilizationCounts {
  approaching: number;
  available: boolean;
  over: number;
  severe: number;
  total: number;
  under: number;
  unmatched: number;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const DRAWER_MARGIN = 24;
const DRAWER_TOP_MARGIN = 72;
const DRAWER_DEFAULT_WIDTH = 640;
const DRAWER_DEFAULT_HEIGHT = 660;
const DRAWER_MIN_WIDTH = 420;
const DRAWER_MIN_HEIGHT = 360;
const INDICATOR_DASHBOARD_CAPTURE_SECTIONS = [
  "critical_signals",
  "monitoring_charts",
] as const;

const readinessTabs: IndicatorReadinessTab[] = [
  {
    description: "All dashboard signals.",
    groupIds: [],
    id: "all",
    label: "All Signals",
  },
  {
    description: "Observed development and permit activity.",
    groupIds: ["development-activity"],
    id: "growth",
    label: "Growth Activity",
  },
  {
    description: "Floodplain and constraint review.",
    groupIds: ["flood-review"],
    id: "constraints",
    label: "Constraints",
  },
  {
    description: "Utility and transportation readiness.",
    groupIds: ["utility-infrastructure"],
    id: "infrastructure",
    label: "Infrastructure",
  },
  {
    description: "Preliminary school capacity context.",
    groupIds: ["school-context"],
    id: "schools",
    label: "Schools",
  },
  {
    description: "Official data gaps and governance.",
    groupIds: ["data-gaps", "model-research"],
    id: "data",
    label: "Data Readiness",
  },
  {
    description: "Priority follow-up rows.",
    groupIds: [],
    id: "watchlist",
    label: "Watchlist",
  },
];

const defaultIndicatorSnapshotIncludedSections: Record<
  PlanningSnapshotSectionKey,
  boolean
> = {
  data_needed_caveats: true,
  development_permits: true,
  fema_flood: true,
  map_view: true,
  model_governance: true,
  new_construction: true,
  parcel_facts: false,
  recommended_actions: true,
  schools: true,
  transportation: true,
  utility_proxy: true,
  zoning_planning: false,
};

interface IndicatorDashboardSnapshotCapture {
  capturedAt: string | null;
  dataUrl: string | null;
  failureReason: string | null;
  status: "captured" | "failed" | "unavailable";
}

function createUnavailableDashboardCapture(
  failureReason: string,
  status: IndicatorDashboardSnapshotCapture["status"] = "unavailable",
): IndicatorDashboardSnapshotCapture {
  return {
    capturedAt: new Date().toISOString(),
    dataUrl: null,
    failureReason,
    status,
  };
}

async function captureIndicatorDashboardSnapshot(
  snapshotRegion: HTMLDivElement | null,
): Promise<IndicatorDashboardSnapshotCapture> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return createUnavailableDashboardCapture(
      "Dashboard capture is only available in the browser.",
    );
  }

  if (!snapshotRegion) {
    return createUnavailableDashboardCapture(
      "Indicator dashboard snapshot region was not available.",
    );
  }

  const rect = snapshotRegion.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  if (width <= 0 || height <= 0) {
    return createUnavailableDashboardCapture(
      "Indicator dashboard snapshot region had no visible size.",
      "failed",
    );
  }

  try {
    const clonedRegion = snapshotRegion.cloneNode(true) as HTMLElement;

    inlineSnapshotStyles(snapshotRegion, clonedRegion);
    clonedRegion.style.boxSizing = "border-box";
    clonedRegion.style.height = `${height}px`;
    clonedRegion.style.margin = "0";
    clonedRegion.style.overflow = "hidden";
    clonedRegion.style.width = `${width}px`;
    clonedRegion.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

    const serializedRegion = new XMLSerializer().serializeToString(
      clonedRegion,
    );
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<foreignObject width="100%" height="100%">${serializedRegion}</foreignObject>`,
      "</svg>",
    ].join("");
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = new window.Image();
    const imageLoaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Dashboard SVG image could not be loaded."));
    });

    image.src = svgUrl;
    await imageLoaded;

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      return createUnavailableDashboardCapture(
        "Dashboard image canvas was not available.",
        "failed",
      );
    }

    context.fillStyle = "#07111f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
      capturedAt: new Date().toISOString(),
      dataUrl: canvas.toDataURL("image/png"),
      failureReason: null,
      status: "captured",
    };
  } catch (error) {
    return createUnavailableDashboardCapture(
      error instanceof Error
        ? error.message
        : "Indicator dashboard image capture failed.",
      "failed",
    );
  }
}

function inlineSnapshotStyles(source: Element, target: Element) {
  if (source instanceof HTMLElement && target instanceof HTMLElement) {
    const computedStyle = window.getComputedStyle(source);
    const styleText = Array.from(computedStyle)
      .map(
        (property) =>
          `${property}:${computedStyle.getPropertyValue(property)};`,
      )
      .join("");

    target.setAttribute("style", styleText);
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);

  sourceChildren.forEach((sourceChild, index) => {
    const targetChild = targetChildren[index];

    if (targetChild) {
      inlineSnapshotStyles(sourceChild, targetChild);
    }
  });
}

export function IndicatorCenterWorkspace() {
  const {
    selectedIndicatorCenterContext,
    savePlanningSnapshot,
    setPlanningSnapshotView,
    setProductMode,
    setSelectedIndicatorCenterContext,
  } = useDashboardState();
  const indicatorDashboardSnapshotRef = useRef<HTMLDivElement | null>(null);
  const [activeReadinessTab, setActiveReadinessTab] =
    useState<IndicatorReadinessTabId>("all");
  const [askCfsActions, setAskCfsActions] =
    useState<CfsAiDashboardActions | null>(null);
  const [demoGeneratedAt, setDemoGeneratedAt] = useState<string | null>(null);
  const [indicatorIntelligence, setIndicatorIntelligence] =
    useState<IndicatorIntelligenceResponse | null>(null);
  const [indicatorIntelligenceError, setIndicatorIntelligenceError] =
    useState<string | null>(null);
  const [showHowIndicatorsWork, setShowHowIndicatorsWork] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);

  const developmentStatistics = useDevelopmentStatistics();
  const developmentTrends = useDevelopmentTrends();
  const floodSummary = useFloodConstraintSummary();
  const permitSegments = usePermitSegmentStatistics();
  const schoolSummary = useSchoolConstraintSummary();
  const schoolPressureLayer = useSchoolPressureLayer({ enabled: true });

  const schoolCounts = useMemo(
    () => getSchoolUtilizationCounts(schoolSummary),
    [schoolSummary],
  );

  useEffect(() => {
    if (!USE_DEMO_DATA) {
      return;
    }

    let mounted = true;
    getDemoManifest()
      .then((manifest) => {
        if (mounted) {
          setDemoGeneratedAt(manifest.generated_at);
        }
      })
      .catch(() => {
        if (mounted) {
          setDemoGeneratedAt(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getIndicatorIntelligence()
      .then((response) => {
        if (!mounted) return;
        setIndicatorIntelligence(response);
        setIndicatorIntelligenceError(null);
      })
      .catch((error) => {
        if (!mounted) return;
        setIndicatorIntelligence(null);
        setIndicatorIntelligenceError(
          error instanceof Error
            ? error.message
            : "Indicator intelligence is unavailable.",
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const cards = buildIndicatorCenterSummaryCards({
    developmentStatistics,
    floodSummary,
    schoolCounts,
    schoolSummary,
  });
  const visibleDefinitions = filterDefinitionsByReadinessTab(
    indicatorCenterDefinitions,
    activeReadinessTab,
  );
  const activeIndicatorGroupIds = visibleDefinitions.map(
    (indicator) => indicator.groupId,
  );
  const visibleDefinitionIds = new Set(
    visibleDefinitions.map((indicator) => indicator.indicatorId),
  );
  const visibleCards = cards.filter((card) =>
    visibleDefinitionIds.has(card.indicator.indicatorId),
  );
  const reviewThemes = buildIndicatorCenterReviewThemes(visibleDefinitions);
  const executiveSignals =
    indicatorIntelligence?.kpis.length
      ? buildExecutiveSignalCardsFromIntelligence(indicatorIntelligence.kpis)
      : buildExecutiveSignalCards({
          developmentStatistics,
          developmentTrends,
          floodSummary,
          schoolCounts,
          schoolSummary,
        });
  const attentionQueue =
    indicatorIntelligence?.watchlist.length
      ? buildAttentionQueueFromIntelligence(
          indicatorIntelligence.watchlist,
          visibleDefinitions,
        )
      : buildAttentionQueue({
          developmentStatistics,
          floodSummary,
          schoolCounts,
          visibleDefinitions,
        });
  const visibleAttentionQueue = applyAskCfsWatchlistActions(
    attentionQueue,
    askCfsActions,
  );
  const allDrilldownSections = buildDrilldownSections({
    developmentStatistics,
    developmentTrends,
    floodSummary,
    permitSegments,
    schoolCounts,
    schoolSummary,
  });
  const drilldownSections = allDrilldownSections.filter((section) =>
    visibleDefinitionIds.has(section.indicator.indicatorId),
  );
  const domainReadinessRows = indicatorIntelligence?.domain_readiness.length
    ? buildDomainReadinessRowsFromIntelligence(
        indicatorIntelligence.domain_readiness,
      )
    : buildDomainReadinessRows({
        developmentStatistics,
        floodSummary,
        schoolCounts,
        schoolSummary,
      });
  const visibleDomainReadinessRows = domainReadinessRows.filter((row) =>
    shouldShowGroupForReadinessTab(row.groupId, activeReadinessTab),
  );
  const visibleExecutiveSignals = executiveSignals.filter((signal) =>
    shouldShowGroupForReadinessTab(signal.groupId, activeReadinessTab),
  );
  const showSchoolPressureSection = shouldShowGroupForReadinessTab(
    "school-context",
    activeReadinessTab,
  );
  const schoolPressureIndicator = buildSchoolPressureIndicatorContext(
    schoolPressureLayer.summary,
  );
  const monitoringCharts = drilldownSections.filter((section) => section.chart);
  const permitSegmentChart = {
    caveat: "Observed permit segments only.",
    data: permitSegments.permitSegments.slice(0, 6).map((segment) => ({
      label: segment.label,
      value: segment.value,
    })),
    emptyLabel: "Data still needed.",
    key: "permit-segment-breakdown-chart",
    title: "Permit Activity by Type",
  };
  const monitoringChartCards = [
    ...(monitoringCharts[0]
      ? [
          {
            caveat: monitoringCharts[0].chart?.caveat ?? monitoringCharts[0].caveat,
            data: monitoringCharts[0].chart?.data ?? [],
            emptyLabel:
              monitoringCharts[0].chart?.emptyLabel ??
              "Data still needed.",
            key: `${monitoringCharts[0].id}-chart`,
            title: monitoringCharts[0].chart?.title ?? monitoringCharts[0].title,
          },
        ]
      : []),
    ...(visibleDefinitionIds.has("development-activity")
      ? [permitSegmentChart]
      : []),
    ...monitoringCharts.slice(1).map((section) => ({
      caveat: section.chart?.caveat ?? section.caveat,
      data: section.chart?.data ?? [],
      emptyLabel:
        section.chart?.emptyLabel ?? "Data still needed.",
      key: `${section.id}-chart`,
      title: section.chart?.title ?? section.title,
    })),
  ];
  const selectedIndicatorCard =
    selectedIndicatorCenterContext
      ? cards.find(
          (card) =>
            card.indicator.indicatorId ===
            selectedIndicatorCenterContext.indicatorId,
        ) ?? null
      : null;
  const selectedDrilldownSection = selectedIndicatorCenterContext
    ? getDrilldownById(
        allDrilldownSections,
        selectedIndicatorCenterContext.groupId,
      )
    : null;

  async function saveSnapshot() {
    if (snapshotSaving) {
      return;
    }

    setSnapshotSaving(true);
    try {
      const now = new Date().toISOString();
      const dashboardCapture = await captureIndicatorDashboardSnapshot(
        indicatorDashboardSnapshotRef.current,
      );
      const indicatorSummaries = toIndicatorCenterSnapshotSummaries(visibleCards);
      const indicatorCenterContext = {
        availableGroups: visibleDefinitions.map((indicator) => indicator.name),
        caveat:
          "Indicator Center snapshots summarize monitoring indicators and data gaps. They are not official determinations.",
        displayMode: "all",
        indicatorSummaries,
        recommendedFollowUp:
          selectedIndicatorCenterContext?.recommendedFollowUp ??
          reviewThemes[0]?.recommendedFollowUp ??
          "Use Indicator Center to choose the source records or official datasets that need follow-up.",
        selectedGroupIds: activeIndicatorGroupIds,
        selectedIndicator: selectedIndicatorCenterContext,
      } satisfies PlanningSnapshot["indicatorCenterContext"];

      const snapshot: PlanningSnapshot = {
        activeLayerIds: ["indicator-center-dashboard"],
        activeLayers: ["Indicator Center dashboard"],
        caveats: [
          "Indicator Center snapshots summarize monitoring indicators and data gaps; they are not official determinations.",
          dashboardCapture.status === "captured"
            ? "Dashboard visual captures Critical Signals and Monitoring Charts for report context."
            : "Dashboard snapshot image was unavailable; use indicator summaries and caveats as fallback context.",
          "Observed activity is context only, not prediction.",
          "Preliminary school utilization comes from planning materials and requires official enrollment/capacity verification.",
          "Utility readiness is proxy-only until true capacity data is received.",
          "Internal model research does not show exact probabilities or official parcel scores.",
        ],
        capturedSections: [...INDICATOR_DASHBOARD_CAPTURE_SECTIONS],
        createdAt: now,
        dashboardImageAlt: "Indicator Center dashboard snapshot",
        dashboardImageCapturedAt: dashboardCapture.capturedAt ?? now,
        dashboardImageDataUrl: dashboardCapture.dataUrl,
        dashboardImageFailureReason: dashboardCapture.failureReason,
        dashboardImageStatus: dashboardCapture.status,
        explainableMetrics: visibleCards.map((card) => ({
          caveat: card.caveat,
          label: card.indicator.title ?? card.indicator.name,
          meaning: card.indicator.whatItMeans,
          method:
            "Indicator Center records dashboard context from existing CFS data, endpoints, and data-gap definitions only.",
          recommendedAction: card.indicator.recommendedFollowUp,
          source: card.indicator.source,
          value: card.value,
        })),
        focusMode: "planning_snapshot_report",
        focusModeLabel: "Indicator Center Snapshot",
        includedSections: defaultIndicatorSnapshotIncludedSections,
        indicatorCenterContext,
        keyFacts: [
          { label: "Snapshot context", value: "Indicator Center" },
          { label: "Dashboard mode", value: "Enterprise monitoring cockpit" },
          {
            label: "Visual",
            value:
              dashboardCapture.status === "captured"
                ? "Dashboard captured"
                : "Dashboard unavailable",
          },
          {
            label: "Selected indicator",
            value: selectedIndicatorCenterContext
              ? selectedIndicatorCenterContext.name
              : "No selected indicator",
          },
          {
            label: "Enabled review groups",
            value: String(activeIndicatorGroupIds.length),
          },
          {
            label: "Priority queue rows",
            value: String(attentionQueue.length),
          },
          {
            label: "Critical data gaps",
            value: String(indicatorCenterMissingDataItems.length),
          },
        ],
        knownReviewFlags: attentionQueue.map((row) => ({
          label: row.indicatorName,
          reason: row.whyItMatters,
          status: row.priorityLabel,
        })),
        mapContext: {
          description:
            "Indicator Center is a map-free monitoring cockpit; dashboard visual is used instead of map context.",
          extentCaptured: false,
        },
        hasDashboardImage:
          dashboardCapture.status === "captured" &&
          Boolean(dashboardCapture.dataUrl),
        hasMapImage: false,
        mapScreenshotCapturedAt: null,
        mapScreenshotDataUrl: null,
        mapScreenshotFailureReason:
          "Indicator Center is map-free; dashboard visual is used instead.",
        mapScreenshotStatus: "unavailable",
        overviewCommandMode: "indicatorCenter",
        overviewKpis: executiveSignals.map((signal) => ({
          caveat: signal.caveat,
          label: signal.label,
          value: `${signal.value} / ${signal.status}`,
        })),
        selectedParcelId: null,
        selectedParcelSummary: null,
        snapshotId: `phase28k-indicator-center-${Date.now()}`,
        snapshotType: "indicator_center",
        snapshotTitle: "Indicator Center Snapshot",
        snapshotVersion: "phase28k_v1",
        visualType: "dashboard",
      };

      savePlanningSnapshot(snapshot);
      window.dispatchEvent(new CustomEvent(CFS_PLANNING_SNAPSHOT_SAVED_EVENT));
    } finally {
      setSnapshotSaving(false);
    }
  }

  function openPlanningSnapshot() {
    setPlanningSnapshotView("overview");
    setProductMode("due_diligence");
  }

  function openMethodology() {
    window.location.hash = "methodology-data-needed";
    setProductMode("methodology");
  }

  const handleAskCfsResponse = useCallback(
    (response: CfsAiSearchResponse) => {
      const actions = response.dashboard_actions ?? {};
      setAskCfsActions(actions);

      const nextTab = mapAskCfsFocusToTab(actions.focus_domain);
      if (nextTab) {
        setActiveReadinessTab(nextTab);
      }

      const detailIndicator = getAskCfsActionIndicator(actions.open_detail?.id);
      if (detailIndicator) {
        setSelectedIndicatorCenterContext(detailIndicator);
      }
    },
    [setSelectedIndicatorCenterContext],
  );

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden bg-[linear-gradient(90deg,rgba(104,216,255,0.045)_1px,transparent_1px),linear-gradient(rgba(104,216,255,0.035)_1px,transparent_1px),radial-gradient(circle_at_top_left,rgba(104,216,255,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(236,92,255,0.08),transparent_32%),#02050b] bg-[length:42px_42px,42px_42px,100%_100%,100%_100%,100%_100%] p-4"
      data-testid="indicator-center-dashboard"
      id="cfs-indicator-center-dashboard"
    >
      <MissionHeader
        activeTab={activeReadinessTab}
        demoGeneratedAt={demoGeneratedAt}
        onOpenPlanningSnapshot={openPlanningSnapshot}
        onSaveSnapshot={() => {
          void saveSnapshot();
        }}
        snapshotSaving={snapshotSaving}
      />

      <div className="mt-4">
        <AskCfsPanel onResponse={handleAskCfsResponse} />
      </div>

      {indicatorIntelligenceError ? (
        <div className="mt-3 rounded-lg border border-[#f6d98e]/25 bg-[#f6d98e]/10 px-3 py-2 text-xs leading-5 text-[#f6d98e]">
          Indicator intelligence endpoint unavailable in live mode:{" "}
          {indicatorIntelligenceError}
        </div>
      ) : null}

      {askCfsActions ? (
        <AskCfsActionStrip
          actions={askCfsActions}
          onReset={() => setAskCfsActions(null)}
        />
      ) : null}

      <IndicatorReadinessTabs
        activeTab={activeReadinessTab}
        onChange={setActiveReadinessTab}
      />

      <div
        className="mt-4 space-y-4"
        data-cfs-snapshot-region="indicator-dashboard"
        ref={indicatorDashboardSnapshotRef}
      >
        <section
          className="cfs-command-surface rounded-lg p-4 border-[#68d8ff]/18"
          data-cfs-snapshot-section="critical_signals"
        >
          <MissionSectionHeader
            eyebrow="Primary KPI Strip"
            icon={<Gauge className="h-4 w-4" />}
            title="Current Readiness Posture"
            value={`${visibleExecutiveSignals.length} signals`}
          />
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {visibleExecutiveSignals.map((signal) => (
              <ExecutiveSignalCard
                highlighted={isAskCfsKpiHighlighted(signal, askCfsActions)}
                key={signal.label}
                onInspect={() =>
                  setSelectedIndicatorCenterContext(
                    getIndicatorByGroup(signal.groupId),
                  )
                }
                signal={signal}
              />
            ))}
          </div>
        </section>

        <section data-cfs-snapshot-section="monitoring_charts">
          <MissionSectionHeader
            eyebrow="Trend Intelligence"
            icon={<BarChart3 className="h-4 w-4" />}
            title="Compact Monitoring Visuals"
            value="Labeled charts"
          />
          <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            {monitoringChartCards.map((chart) => (
              <MiniChartCard
                caveat={chart.caveat}
                data={chart.data}
                emptyLabel={chart.emptyLabel}
                key={chart.key}
                title={chart.title}
              />
            ))}
          </div>
        </section>
      </div>

      {showSchoolPressureSection ? (
        <section className="mt-4">
          <MissionSectionHeader
            eyebrow="School Utilization + Growth Pressure"
            icon={<GraduationCap className="h-4 w-4" />}
            title="Attendance-Area Development Pressure"
            value={
              schoolPressureLayer.status === "ready"
                ? `${schoolPressureLayer.summary.areas_analyzed} areas`
                : schoolPressureLayer.status === "loading"
                  ? "Loading"
                  : "Not available"
            }
          />
          <SchoolPressureMissionPanel
            features={schoolPressureLayer.features}
            onInspect={(feature) =>
              setSelectedIndicatorCenterContext(
                feature
                  ? buildSchoolPressureFeatureContext(feature)
                  : schoolPressureIndicator,
              )
            }
            state={schoolPressureLayer}
          />
        </section>
      ) : null}

      <section className="mt-4">
        <MissionSectionHeader
            eyebrow="Operational Watchlist"
            icon={<ListChecks className="h-4 w-4" />}
            title="Operational Watchlist Board"
          value={`${visibleAttentionQueue.length} rows`}
        />
        <div className="cfs-op-queue mt-3 overflow-hidden rounded-xl border border-white/10">
          <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid lg:grid-cols-[8.5rem_minmax(12rem,1fr)_12rem_7rem_minmax(10rem,1fr)_5rem] lg:items-center lg:gap-2">
            <span>Priority</span>
            <span>Signal</span>
            <span>Evidence</span>
            <span>Status</span>
            <span>Next Action</span>
            <span>Inspect</span>
          </div>
          {visibleAttentionQueue.map((row) => (
            <AttentionRow
              key={`${row.indicator.indicatorId}-${row.indicatorName}-${row.currentEvidence}`}
              onInspect={() => setSelectedIndicatorCenterContext(row.indicator)}
              row={row}
            />
          ))}
        </div>
      </section>

      <section className="mt-4">
        <MissionSectionHeader
          eyebrow="Domain Readiness Matrix"
          icon={<ClipboardList className="h-4 w-4" />}
          title="CFS Intelligence Domains"
          value={`${visibleDomainReadinessRows.length} domains`}
        />
        <DomainReadinessMatrix
          onInspect={(groupId) =>
            setSelectedIndicatorCenterContext(getIndicatorByGroup(groupId))
          }
          rows={visibleDomainReadinessRows}
        />
      </section>

      <section className="mt-4">
        <MissionSectionHeader
          eyebrow="Data Readiness"
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Official Data Still Needed"
          value={`${indicatorCenterMissingDataItems.length} requests`}
        />
        <DataStillNeededStrip
          onInspect={() =>
            setSelectedIndicatorCenterContext(getIndicatorByGroup("data-gaps"))
          }
        />
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/24 px-3 py-3">
        <div className="flex min-w-0 items-start gap-2 text-xs leading-5 text-slate-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f6d98e]" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-200">
              Monitoring dashboard only. No map or official scoring.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "Map-free Indicator Center",
                "No map required",
                "No exact probabilities",
                "No official determinations",
                "No official capacity claims",
                "Source caveats preserved",
              ].map((label) => (
                <span
                  className="rounded border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:border-[#68d8ff]/45 hover:bg-[#68d8ff]/15"
          onClick={() =>
            setShowHowIndicatorsWork((currentValue) => !currentValue)
          }
          type="button"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          How indicators work
        </button>
      </div>

      {showHowIndicatorsWork ? (
        <HowIndicatorsWorkPanel onOpenMethodology={openMethodology} />
      ) : null}

      {selectedIndicatorCenterContext ? (
        <IndicatorDetailDrawer
          currentValue={selectedIndicatorCard?.value ?? "Not available"}
          indicator={selectedIndicatorCenterContext}
          onClose={() => setSelectedIndicatorCenterContext(null)}
          onIncludeInSnapshot={saveSnapshot}
          onOpenMethodology={openMethodology}
          schoolCounts={schoolCounts}
          schoolSummary={schoolSummary}
          secondaryValue={selectedIndicatorCard?.secondaryValue}
          section={selectedDrilldownSection}
        />
      ) : null}
    </div>
  );
}

export function buildIndicatorCenterSummaryCards({
  developmentStatistics,
  floodSummary,
  schoolCounts,
  schoolSummary,
}: {
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  schoolCounts?: SchoolUtilizationCounts;
  schoolSummary?: ReturnType<typeof useSchoolConstraintSummary>;
}): IndicatorCenterSummaryCard[] {
  const totalPermits = getDevelopmentMetric(
    developmentStatistics,
    "total-permits",
    "Not available",
  );
  const activeParcels = getDevelopmentMetric(
    developmentStatistics,
    "parcels-with-activity",
    "Not available",
  );
  const floodReviewCount = getFloodMetric(
    floodSummary,
    "review-required-parcels",
    floodSummary.isLoading ? "Loading" : "Not available",
  );

  return indicatorCenterDefinitions.map((indicator) => {
    switch (indicator.groupId) {
      case "development-activity":
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: activeParcels
            ? `${activeParcels} development-active parcels`
            : "Observed permit/development context",
          value: `${totalPermits} permit records`,
        };
      case "flood-review":
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: "Special Flood Hazard Area / Floodway context",
          value: `${floodReviewCount} flood review parcels`,
        };
      case "school-context":
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: schoolCounts?.available
            ? `${formatCount(schoolCounts.over)} above capacity / ${formatCount(
                schoolCounts.severe,
              )} very high utilization`
            : "Official capacity/enrollment still needed",
          value: schoolCounts?.available
            ? `${formatCount(schoolCounts.over + schoolCounts.severe)} preliminary capacity flags`
            : (schoolSummary?.capacityStatusLabel ?? "Needs official data"),
        };
      case "utility-infrastructure":
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: "Transportation/STIP/AADT context available",
          value: "Proxy only",
        };
      case "model-research":
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: "Internal research preview only",
          value: developmentModelLabSummary.currentBestInternalVariant,
        };
      case "data-gaps":
      default:
        return {
          caveat: indicator.caveat,
          indicator,
          secondaryValue: "Official data needed before stronger claims",
          value: `${indicatorCenterMissingDataItems.length} priority datasets`,
        };
    }
  });
}

export function toIndicatorCenterSnapshotSummaries(
  cards: IndicatorCenterSummaryCard[],
) {
  return cards.map((card) => ({
    caveat: card.caveat,
    indicatorId: card.indicator.indicatorId,
    name: card.indicator.name,
    priorityLabel: card.indicator.priorityLabel,
    status: card.indicator.status,
    value: card.value,
  }));
}

function buildExecutiveSignalCards({
  developmentStatistics,
  developmentTrends,
  floodSummary,
  schoolCounts,
  schoolSummary,
}: {
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  developmentTrends: ReturnType<typeof useDevelopmentTrends>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  schoolCounts: SchoolUtilizationCounts;
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>;
}): ExecutiveSignalCardModel[] {
  const totalPermits = getDevelopmentMetric(
    developmentStatistics,
    "total-permits",
    "Not available",
  );
  const activeParcels = getDevelopmentMetric(
    developmentStatistics,
    "parcels-with-activity",
    "Not available",
  );
  const floodReview = getFloodMetric(
    floodSummary,
    "review-required-parcels",
    "Not available",
  );
  const recentDevelopment = getDevelopmentMetric(
    developmentStatistics,
    "recent-one-year",
    getDevelopmentMetric(developmentStatistics, "recent-three-year", ""),
  );

  return [
    {
      caveat: "Observed permit context, not prediction.",
      confidence: developmentStatistics.errorMessage
        ? "Coverage: fallback"
        : "Coverage: available",
      groupId: "development-activity",
      icon: <TrendingUp className="h-4 w-4" />,
      label: "Development Activity",
      sparkline: developmentTrends.annualTrend.slice(-5).map((point) => ({
        label: String(point.activity_year),
        value: point.permit_count,
      })),
      status: "Observed Activity",
      subvalue: recentDevelopment
        ? `${totalPermits} permits / ${recentDevelopment} recent parcels`
        : `${totalPermits} permit records`,
      tone: "attention",
      value: activeParcels,
    },
    {
      caveat: "Verify with official enrollment/capacity.",
      confidence: schoolCounts.available
        ? "Coverage: preliminary"
        : "Coverage: data needed",
      groupId: "school-context",
      icon: <GraduationCap className="h-4 w-4" />,
      label: "School Capacity Watch",
      status: "Preliminary Data",
      subvalue:
        getHighestUtilizationPctLabel(schoolSummary) ??
        "Official verification needed",
      tone: "data",
      value: schoolCounts.available
        ? formatCount(schoolCounts.over + schoolCounts.severe)
        : "Data still needed",
    },
    {
      caveat: "Based on FEMA floodplain data.",
      confidence: floodSummary.errorMessage
        ? "Coverage: not available"
        : "Coverage: available",
      groupId: "flood-review",
      icon: <Waves className="h-4 w-4" />,
      label: "Floodplain Review",
      status: "Review Needed",
      subvalue: `${getFloodMetric(
        floodSummary,
        "sfha-parcels",
        "Not available",
      )} Special Flood Hazard Area / ${getFloodMetric(
        floodSummary,
        "floodway-parcels",
        "Not available",
      )} floodway`,
      tone: "review",
      value: floodReview,
    },
    {
      caveat: "Does not confirm available capacity.",
      confidence: "Coverage: proxy only",
      groupId: "utility-infrastructure",
      icon: <Wrench className="h-4 w-4" />,
      label: "Utility Readiness",
      status: "Data Needed",
      subvalue: "True capacity missing",
      tone: "data",
      value: "Proxy Only",
    },
    {
      caveat: "Official data needed before stronger claims.",
      confidence: "Coverage: incomplete",
      groupId: "data-gaps",
      icon: <ClipboardList className="h-4 w-4" />,
      label: "Data Still Needed",
      status: "Action Needed",
      subvalue: "Official data needed",
      tone: "data",
      value: formatCount(indicatorCenterMissingDataItems.length),
    },
    {
      caveat: "Transportation context only; planned local projects still needed.",
      confidence: "Coverage: context available",
      groupId: "utility-infrastructure",
      icon: <Gauge className="h-4 w-4" />,
      label: "Transportation Project Context",
      status: "Context Available",
      subvalue: "STIP / AADT / accessibility context",
      tone: "neutral",
      value: "Available",
    },
  ];
}

function buildExecutiveSignalCardsFromIntelligence(
  signals: IndicatorSignal[],
): ExecutiveSignalCardModel[] {
  return signals.map((signal) => ({
    caveat: signal.caveats[0] ?? "Planning review signal only.",
    confidence: `Coverage: ${signal.confidence}`,
    groupId: groupIdForIndicatorDomain(signal.domain),
    icon: iconForIndicatorDomain(signal.domain),
    label: signal.title,
    status: statusBandLabel(signal.status_band),
    subvalue:
      signal.trend_label ??
      signal.evidence[0] ??
      "Evidence available in detail drawer",
    tone: toneForStatusBand(signal.status_band),
    value: formatSignalValue(signal),
  }));
}

function buildAttentionQueueFromIntelligence(
  signals: IndicatorSignal[],
  visibleDefinitions: IndicatorCenterContext[],
): AttentionQueueRow[] {
  const visibleGroups = new Set(
    visibleDefinitions.map((indicator) => indicator.groupId),
  );

  return signals
    .map((signal) => ({
      caveat: signal.caveats[0] ?? "Planning review signal only.",
      category: domainLabel(signal.domain),
      currentEvidence: signal.evidence[0] ?? "Evidence unavailable",
      dataBasis: [
        signal.source_mode === "demo"
          ? "Portfolio Demo cached extract"
          : "Local Live Data",
        signal.data_freshness,
      ]
        .filter(Boolean)
        .join(" / "),
      indicator: indicatorContextFromSignal(signal),
      indicatorName: signal.title,
      priorityLabel: statusBandLabel(signal.status_band),
      recommendedFollowUp: signal.recommended_followup,
      whyItMatters:
        signal.evidence[1] ??
        "This signal helps staff decide what to review first.",
    }))
    .filter((row) => visibleGroups.has(row.indicator.groupId));
}

function buildDomainReadinessRowsFromIntelligence(
  rows: IndicatorDomainReadiness[],
): DomainReadinessRow[] {
  return rows.map((row) => ({
    caveat: row.caveat,
    coverage: row.coverage,
    currentUse: row.current_use,
    dataStatus:
      row.data_available === "yes"
        ? "Available"
        : row.data_available === "partial"
          ? "Partial"
          : "Data needed",
    domain: row.domain,
    groupId: groupIdForReadinessDomain(row.domain),
    updateCadence: row.update_cadence_known ? "Known" : "Needs update cadence",
  }));
}

function indicatorContextFromSignal(signal: IndicatorSignal): IndicatorCenterContext {
  const groupId = groupIdForIndicatorDomain(signal.domain);
  return {
    caveat: signal.caveats.join(" "),
    category: domainLabel(signal.domain),
    dataUsed: signal.evidence,
    groupId,
    indicatorId: signal.id,
    mapSupported: signal.related_layers.length > 0,
    name: signal.title,
    officialDataNeeded: signal.status_band === "data_needed",
    priority: statusBandLabel(signal.status_band),
    priorityLabel: statusBandLabel(signal.status_band),
    recommendedFollowUp: signal.recommended_followup,
    snapshotIncluded: true,
    source:
      signal.source_mode === "demo"
        ? "Portfolio Demo cached extract"
        : "Local Live Data",
    status: statusBandLabel(signal.status_band),
    title: signal.title,
    whatItMeans: signal.evidence.join(" "),
  };
}

function groupIdForIndicatorDomain(domain: IndicatorSignal["domain"]): IndicatorCenterGroupId {
  switch (domain) {
    case "development_activity":
      return "development-activity";
    case "floodplain_review":
      return "flood-review";
    case "model_research":
      return "model-research";
    case "school_pressure":
      return "school-context";
    case "transportation_context":
    case "utility_readiness":
      return "utility-infrastructure";
    case "data_readiness":
    case "zoning_land_use":
      return "data-gaps";
  }
}

function groupIdForReadinessDomain(domain: string): IndicatorCenterGroupId {
  const normalized = domain.toLowerCase();
  if (normalized.includes("development")) return "development-activity";
  if (normalized.includes("school")) return "school-context";
  if (normalized.includes("flood")) return "flood-review";
  if (normalized.includes("model")) return "model-research";
  if (normalized.includes("transport") || normalized.includes("utilit")) {
    return "utility-infrastructure";
  }
  return "data-gaps";
}

function statusBandLabel(
  statusBand: IndicatorSignal["status_band"],
): IndicatorCenterPriorityLabel {
  switch (statusBand) {
    case "elevated_review":
      return "High Attention";
    case "review":
      return "Review Needed";
    case "data_needed":
      return "Data Needed";
    case "unavailable":
      return "Data needed";
    case "monitor":
    case "normal":
      return "Context Available";
  }
}

function toneForStatusBand(
  statusBand: IndicatorSignal["status_band"],
): ExecutiveSignalCardModel["tone"] {
  if (statusBand === "elevated_review") return "attention";
  if (statusBand === "review") return "review";
  if (statusBand === "data_needed" || statusBand === "unavailable") return "data";
  return "neutral";
}

function iconForIndicatorDomain(domain: IndicatorSignal["domain"]) {
  switch (domain) {
    case "development_activity":
      return <TrendingUp className="h-4 w-4" />;
    case "floodplain_review":
      return <Waves className="h-4 w-4" />;
    case "school_pressure":
      return <GraduationCap className="h-4 w-4" />;
    case "utility_readiness":
      return <Wrench className="h-4 w-4" />;
    case "transportation_context":
      return <Gauge className="h-4 w-4" />;
    case "model_research":
      return <FileSearch className="h-4 w-4" />;
    default:
      return <ClipboardList className="h-4 w-4" />;
  }
}

function domainLabel(domain: IndicatorSignal["domain"]) {
  return domain
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSignalValue(signal: IndicatorSignal) {
  if (typeof signal.value === "number") {
    return `${formatCount(signal.value)}${signal.unit ? ` ${signal.unit}` : ""}`;
  }
  return signal.value ?? "Not available";
}

function buildAttentionQueue({
  developmentStatistics,
  floodSummary,
  schoolCounts,
  visibleDefinitions,
}: {
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  schoolCounts: SchoolUtilizationCounts;
  visibleDefinitions: IndicatorCenterContext[];
}): AttentionQueueRow[] {
  const rows: AttentionQueueRow[] = [
    {
      caveat:
        "Preliminary utilization from planning materials. Official capacity/enrollment is needed.",
      category: "School / community",
      currentEvidence: schoolCounts.available
        ? `${formatCount(schoolCounts.over)} above capacity / ${formatCount(
            schoolCounts.severe,
          )} very high utilization`
        : "Needs official data",
      dataBasis: "School assignment / preliminary utilization / capacity data status",
      indicator: getIndicatorByGroup("school-context"),
      indicatorName: "School Capacity Watch",
      priorityLabel: schoolCounts.over + schoolCounts.severe > 0
        ? "High Attention"
        : "Data Needed",
      recommendedFollowUp:
        "Request official school capacity and enrollment by school before making capacity statements.",
      whyItMatters:
        "Preliminary utilization context helps staff know where school capacity questions need follow-up.",
    },
    {
      caveat: "Based on FEMA floodplain data.",
      category: "Flood / constraints",
      currentEvidence: `${getFloodMetric(
        floodSummary,
        "review-required-parcels",
        "Not available",
      )} flood review parcels`,
      dataBasis: "FEMA floodplain parcel overlay / flood summary",
      indicator: getIndicatorByGroup("flood-review"),
      indicatorName: "Floodplain Review",
      priorityLabel: "Review Needed",
      recommendedFollowUp:
        "Confirm Floodway, Special Flood Hazard Area, and local floodplain requirements during formal review.",
      whyItMatters:
        "FEMA floodplain context helps staff identify parcels and areas that need regulatory flood review.",
    },
    {
      caveat: "Observed permit/development context, not prediction.",
      category: "Development activity",
      currentEvidence: `${getDevelopmentMetric(
        developmentStatistics,
        "parcels-with-activity",
        "Not available",
      )} active parcels / ${getDevelopmentMetric(
        developmentStatistics,
        "total-permits",
        "Not available",
      )} permits`,
      dataBasis: "Permit records / development-active parcel summaries",
      indicator: getIndicatorByGroup("development-activity"),
      indicatorName: "Development-active parcels",
      priorityLabel: "High Attention",
      recommendedFollowUp:
        "Review underlying permit records and new construction context before formal planning decisions.",
      whyItMatters:
        "Observed activity shows where development review is already occurring.",
    },
    {
      caveat: "Utility proxy does not confirm available capacity.",
      category: "Infrastructure / utility",
      currentEvidence: "Proxy only / true capacity unavailable",
      dataBasis: "Utility proxy context / transportation / STIP / AADT context",
      indicator: getIndicatorByGroup("utility-infrastructure"),
      indicatorName: "Utility capacity missing",
      priorityLabel: "Data Needed",
      recommendedFollowUp:
        "Request WSACC capacity, service area, allocation, and service readiness data.",
      whyItMatters:
        "Capacity is an operational constraint; proximity alone cannot support readiness claims.",
    },
    {
      caveat: "Official data needed. Do not overclaim until received.",
      category: "Data gaps",
      currentEvidence: "Official case records needed",
      dataBasis: "CFS data request packet",
      indicator: getIndicatorByGroup("data-gaps"),
      indicatorName: "Official rezoning records missing",
      priorityLabel: "Data Needed",
      recommendedFollowUp:
        "Request official rezoning case records with case IDs, dates, statuses, and geometries.",
      whyItMatters:
        "Rezoning records help staff connect policy changes to parcel and development context.",
    },
    {
      caveat: "Official data needed. Do not overclaim until received.",
      category: "Data gaps",
      currentEvidence: "Pipeline source needed",
      dataBasis: "CFS data request packet",
      indicator: getIndicatorByGroup("data-gaps"),
      indicatorName: "Countywide development pipeline missing",
      priorityLabel: "Data Needed",
      recommendedFollowUp:
        "Request subdivision, site plan, pipeline, and project status data in GIS or table format.",
      whyItMatters:
        "Pipeline data helps staff separate observed permits from pending or planned activity.",
    },
    {
      caveat: "No exact probabilities. Not production-ready.",
      category: "Model research",
      currentEvidence: developmentModelLabSummary.currentBestInternalVariant,
      dataBasis: "Internal model governance / relative research signal",
      indicator: getIndicatorByGroup("model-research"),
      indicatorName: "Model research internal only",
      priorityLabel: "Internal Research Only",
      recommendedFollowUp:
        "Use model research to guide questions only; rely on source records and staff review for decisions.",
      whyItMatters:
        "Model readiness status prevents overclaiming and keeps research separate from official review.",
    },
  ];
  const visibleIds = new Set(
    visibleDefinitions.map((indicator) => indicator.indicatorId),
  );

  return rows
    .filter((row) => visibleIds.has(row.indicator.indicatorId))
    .sort(
      (left, right) =>
        getPrioritySort(left.priorityLabel) -
        getPrioritySort(right.priorityLabel),
    );
}

function buildDrilldownSections({
  developmentStatistics,
  developmentTrends,
  floodSummary,
  permitSegments,
  schoolCounts,
  schoolSummary,
}: {
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  developmentTrends: ReturnType<typeof useDevelopmentTrends>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  permitSegments: ReturnType<typeof usePermitSegmentStatistics>;
  schoolCounts: SchoolUtilizationCounts;
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>;
}): DrilldownSectionModel[] {
  return [
    {
      accent: "gold",
      additionalCharts: [
        {
          caveat: "Permit segments summarize existing records only.",
          data: permitSegments.permitSegments.slice(0, 6).map((segment) => ({
            label: segment.label,
            value: segment.value,
          })),
          emptyLabel: "Data still needed.",
          title: "Permit Activity by Type",
        },
      ],
      caveat: "Observed activity only. Not prediction.",
      chart: {
        caveat:
          "Observed permit activity only. Time filters depend on existing trend records.",
        data: developmentTrends.annualTrend.slice(-6).map((point) => ({
          label: String(point.activity_year),
          value: point.permit_count,
        })),
        emptyLabel: "Data still needed.",
        title: "Permit Activity by Year",
      },
      description:
        "Observed permits and active parcels.",
      detailSummary:
        "Permit records, development-active parcels, recent activity, top segment, and trend context.",
      icon: <TrendingUp className="h-4 w-4" />,
      id: "development-activity",
      indicator: getIndicatorByGroup("development-activity"),
      stats: [
        {
          label: "Permit records",
          value: getDevelopmentMetric(
            developmentStatistics,
            "total-permits",
            "Not available",
          ),
        },
        {
          label: "Development-active parcels",
          value: getDevelopmentMetric(
            developmentStatistics,
            "parcels-with-activity",
            "Not available",
          ),
        },
        {
          label: "Recent 1-year parcels",
          value: getDevelopmentMetric(
            developmentStatistics,
            "recent-one-year",
            "Not available",
          ),
        },
        {
          label: "Recent 3-year parcels",
          value: getDevelopmentMetric(
            developmentStatistics,
            "recent-three-year",
            "Not available",
          ),
        },
        {
          caveat: "Permit segments summarize existing records only.",
          label: "Top permit segment",
          value: permitSegments.permitSegments[0]?.label ?? "Not available",
        },
      ],
      title: "Development Activity",
    },
    {
      accent: "red",
      caveat: "Based on FEMA floodplain data.",
      chart: {
        caveat: "FEMA floodplain data remains authoritative for regulatory review.",
        data: floodSummary.metrics
          .slice(0, 5)
          .map((metric) => ({
            label: metric.label,
            value: parseMetricValue(metric.value),
          }))
          .filter((datum) => datum.value > 0),
        emptyLabel: "Data still needed.",
        title: "Floodplain Review Breakdown",
      },
      description:
        "Floodplain review and constraint context.",
      detailSummary:
        "Review parcels, Floodway, Special Flood Hazard Area, high/severe impact, and FEMA source caveat.",
      icon: <Waves className="h-4 w-4" />,
      id: "flood-review",
      indicator: getIndicatorByGroup("flood-review"),
      stats: [
        {
          label: "Flood review parcels",
          value: getFloodMetric(
            floodSummary,
            "review-required-parcels",
            "Not available",
          ),
        },
        {
          label: "Floodway parcels",
          value: getFloodMetric(
            floodSummary,
            "floodway-parcels",
            "Not available",
          ),
        },
        {
          label: "Special Flood Hazard Area parcels",
          value: getFloodMetric(floodSummary, "sfha-parcels", "Not available"),
        },
        {
          label: "High / severe impact",
          value: getFloodMetric(
            floodSummary,
            "high-severe-buildability",
            "Not available",
          ),
        },
      ],
      title: "Floodplain Review",
    },
    {
      accent: "cyan",
      caveat:
        "Preliminary utilization from planning materials. Confirm with official enrollment/capacity.",
      chart: {
        caveat:
          "Preliminary utilization from planning materials requires official verification.",
        data: schoolSummary.utilizationClassDistribution
          .slice(0, 6)
          .map((bucket) => ({
            label: bucket.label,
            value: parseMetricValue(bucket.value),
          }))
          .filter((datum) => datum.value > 0),
        emptyLabel:
          "Data still needed.",
        title: "School Capacity Categories",
      },
      description:
        "Preliminary capacity categories and verification status.",
      detailSummary:
        "Capacity category counts, unmatched references, verification checklist, and official fields needed.",
      icon: <GraduationCap className="h-4 w-4" />,
      id: "school-context",
      indicator: getIndicatorByGroup("school-context"),
      stats: [
        {
          label: "Preliminary records",
          value: schoolCounts.available
            ? formatCount(schoolCounts.total)
            : schoolSummary.presentationSeedCountLabel,
        },
        {
          label: "Under capacity",
          value: schoolCounts.available
            ? formatCount(schoolCounts.under)
            : "Needs official data",
        },
        {
          label: "Approaching capacity",
          value: schoolCounts.available
            ? formatCount(schoolCounts.approaching)
            : "Needs official data",
        },
        {
          label: "Above capacity",
          value: schoolCounts.available
            ? formatCount(schoolCounts.over)
            : "Needs official data",
        },
        {
          label: "Very high utilization",
          value: schoolCounts.available
            ? formatCount(schoolCounts.severe)
            : "Needs official data",
        },
        {
          label: "Official capacity status",
          value: schoolSummary.capacityStatusLabel || "Capacity Data Needed",
        },
      ],
      title: "School Capacity Watch",
    },
    {
      accent: "green",
      caveat: "Utility proxy does not confirm available capacity.",
      description:
        "Proxy status and capacity data gaps.",
      detailSummary:
        "Utility proxy status, true capacity status, transportation context, missing datasets, and WSACC request fields.",
      icon: <Wrench className="h-4 w-4" />,
      id: "utility-infrastructure",
      indicator: getIndicatorByGroup("utility-infrastructure"),
      stats: [
        { label: "Utility context", value: "Proxy only" },
        { label: "True utility capacity", value: "Needs official data" },
        {
          label: "Transportation/STIP/AADT context",
          value: "Context available",
        },
        { label: "Planned infrastructure data", value: "Needs official data" },
      ],
      title: "Infrastructure & Utility Readiness",
    },
    {
      accent: "purple",
      caveat: "No exact parcel probabilities. Not production-ready.",
      description:
        "Internal readiness and safe-use boundaries.",
      detailSummary:
        "Current best internal model, feature rows, helpful groups, excluded groups, and collapsed QA details.",
      icon: <Gauge className="h-4 w-4" />,
      id: "model-research",
      indicator: getIndicatorByGroup("model-research"),
      stats: [
        {
          label: "Current best internal model",
          value: developmentModelLabSummary.currentBestInternalVariant,
        },
        { label: "Status", value: "Internal only" },
        {
          label: "Helpful feature groups",
          value: "Zoning / transportation / tax-value",
        },
        {
          label: "Still not helpful enough",
          value: "Accela / Central Area / utility proxy",
        },
      ],
      title: "Model Status",
    },
    {
      accent: "slate",
      caveat: "Do not overclaim until official data is received.",
      chart: {
        caveat: "Counts reflect missing-data categories from CFS governance docs.",
        data: [
          {
            label: "Utility / infrastructure",
            value: 3,
          },
          { label: "Schools", value: 1 },
          { label: "Planning / pipeline", value: 3 },
        ],
        emptyLabel: "Data still needed.",
        title: "Data gap priority by category",
      },
      description:
        "Official source gaps and next requests.",
      detailSummary:
        "Priority missing dataset table with status, why it matters, best format, and what it unlocks.",
      icon: <ShieldAlert className="h-4 w-4" />,
      id: "data-gaps",
      indicator: getIndicatorByGroup("data-gaps"),
      stats: [
        {
          label: "Priority missing datasets",
          value: formatCount(indicatorCenterMissingDataItems.length),
        },
        { label: "WSACC true capacity", value: "Needs official data" },
        { label: "School capacity/enrollment", value: "Needs official data" },
        { label: "Rezoning/development pipeline", value: "Needs official data" },
        { label: "Preferred format", value: "REST / GIS / table" },
      ],
      title: "Data Still Needed",
    },
  ];
}

function filterDefinitionsByReadinessTab(
  definitions: IndicatorCenterContext[],
  tabId: IndicatorReadinessTabId,
) {
  if (tabId === "all" || tabId === "watchlist") {
    return definitions;
  }

  const activeTab = readinessTabs.find((tab) => tab.id === tabId);
  const groupSet = new Set(activeTab?.groupIds ?? []);

  return definitions.filter((definition) => groupSet.has(definition.groupId));
}

function shouldShowGroupForReadinessTab(
  groupId: IndicatorCenterGroupId,
  tabId: IndicatorReadinessTabId,
) {
  if (tabId === "all" || tabId === "watchlist") {
    return true;
  }

  return readinessTabs
    .find((tab) => tab.id === tabId)
    ?.groupIds.includes(groupId) ?? false;
}

function mapAskCfsFocusToTab(
  focusDomain: CfsAiDashboardActions["focus_domain"] | undefined | null,
): IndicatorReadinessTabId | null {
  switch (focusDomain) {
    case "data_readiness":
    case "model_lab":
    case "zoning":
      return "data";
    case "flood":
      return "constraints";
    case "permits":
      return "growth";
    case "schools":
      return "schools";
    case "transportation":
    case "utilities":
      return "infrastructure";
    case "general":
      return "all";
    default:
      return null;
  }
}

function getAskCfsActionIndicator(id: string | undefined) {
  const groupMap: Record<string, IndicatorCenterGroupId> = {
    data_readiness: "data-gaps",
    floodplain_review: "flood-review",
    model_lab: "model-research",
    model_research_status: "model-research",
    observed_development_activity: "development-activity",
    school_pressure: "school-context",
  };
  const groupId = id ? groupMap[id] : null;
  return groupId ? getIndicatorByGroup(groupId) : null;
}

function isAskCfsKpiHighlighted(
  signal: ExecutiveSignalCardModel,
  actions: CfsAiDashboardActions | null,
) {
  const highlights = new Set(actions?.highlight_kpis ?? []);
  if (!highlights.size) {
    return false;
  }
  const kpiIds: Record<IndicatorCenterGroupId, string[]> = {
    "data-gaps": ["data_readiness"],
    "development-activity": ["observed_development_activity"],
    "flood-review": ["floodplain_review"],
    "model-research": ["model_research_status"],
    "school-context": ["school_pressure"],
    "utility-infrastructure": ["transportation_context", "utility_readiness"],
  };
  return (kpiIds[signal.groupId] ?? []).some((id) => highlights.has(id));
}

function applyAskCfsWatchlistActions(
  rows: AttentionQueueRow[],
  actions: CfsAiDashboardActions | null,
) {
  const filter = actions?.filter_watchlist;
  const filteredRows = rows.filter((row) => {
    if (filter?.domain && !watchlistMatchesDomain(row, filter.domain)) {
      return false;
    }
    if (filter?.status && !watchlistMatchesStatus(row, filter.status)) {
      return false;
    }
    return true;
  });

  switch (actions?.sort_watchlist_by) {
    case "data_gap":
      return [...filteredRows].sort((left, right) =>
        Number(!watchlistMatchesDomain(left, "data_readiness")) -
        Number(!watchlistMatchesDomain(right, "data_readiness")),
      );
    case "recent_activity":
      return [...filteredRows].sort((left, right) =>
        Number(left.indicator.groupId !== "development-activity") -
        Number(right.indicator.groupId !== "development-activity"),
      );
    case "severity":
      return [...filteredRows].sort(
        (left, right) =>
          getPrioritySort(left.priorityLabel) -
          getPrioritySort(right.priorityLabel),
      );
    default:
      return filteredRows;
  }
}

function watchlistMatchesDomain(row: AttentionQueueRow, domain: string) {
  const normalized = domain.toLowerCase();
  const text = `${row.category} ${row.indicatorName} ${row.indicator.groupId}`.toLowerCase();
  if (normalized === "data_readiness") {
    return row.indicator.groupId === "data-gaps";
  }
  if (normalized === "schools") {
    return row.indicator.groupId === "school-context" || text.includes("school");
  }
  if (normalized === "permits") {
    return row.indicator.groupId === "development-activity" || text.includes("permit");
  }
  return text.includes(normalized.replace("_", " "));
}

function watchlistMatchesStatus(row: AttentionQueueRow, status: string) {
  const normalized = status.toLowerCase();
  const text = `${row.priorityLabel} ${row.currentEvidence} ${row.caveat}`.toLowerCase();
  if (normalized === "elevated review") {
    return text.includes("high attention") || text.includes("review");
  }
  if (normalized === "data needed") {
    return text.includes("data needed") || text.includes("needed");
  }
  return text.includes(normalized);
}

function formatAskCfsLabel(value: string) {
  return value.replaceAll("_", " ");
}

function buildDomainReadinessRows({
  developmentStatistics,
  floodSummary,
  schoolCounts,
  schoolSummary,
}: {
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>;
  floodSummary: ReturnType<typeof useFloodConstraintSummary>;
  schoolCounts: SchoolUtilizationCounts;
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>;
}): DomainReadinessRow[] {
  return [
    {
      caveat: "Observed permit activity only, not prediction.",
      coverage: developmentStatistics.errorMessage ? "Not available" : "Available",
      currentUse: "Permit activity, active parcels, and trend monitoring.",
      dataStatus: developmentStatistics.isLoading ? "Loading" : "Available",
      domain: "Development Activity",
      groupId: "development-activity",
      updateCadence: USE_DEMO_DATA ? "Cached extract" : "Backend refresh",
    },
    {
      caveat: "FEMA floodplain data remains authoritative.",
      coverage: floodSummary.errorMessage ? "Not available" : "Available",
      currentUse: "Floodplain review, Floodway, and review concentration.",
      dataStatus: floodSummary.isLoading ? "Loading" : "Available",
      domain: "Floodplain Review",
      groupId: "flood-review",
      updateCadence: USE_DEMO_DATA ? "Cached extract" : "Backend refresh",
    },
    {
      caveat: "Preliminary context requires official enrollment/capacity.",
      coverage: schoolCounts.available ? "Preliminary" : "Data needed",
      currentUse: "Capacity watch, category counts, and verification flags.",
      dataStatus:
        schoolSummary.isLoading
          ? "Loading"
          : schoolCounts.available
            ? "Preliminary"
            : "Data needed",
      domain: "Schools",
      groupId: "school-context",
      updateCadence: USE_DEMO_DATA ? "Cached extract" : "Backend refresh",
    },
    {
      caveat: "Utility proxy does not confirm true capacity.",
      coverage: "Proxy only",
      currentUse: "Readiness caveat and WSACC data request framing.",
      dataStatus: "Data needed",
      domain: "Utilities",
      groupId: "utility-infrastructure",
      updateCadence: "Official data needed",
    },
    {
      caveat: "Current-context transportation indicators only.",
      coverage: "Context available",
      currentUse: "Transportation/STIP/AADT context for readiness review.",
      dataStatus: "Context available",
      domain: "Transportation",
      groupId: "utility-infrastructure",
      updateCadence: USE_DEMO_DATA ? "Cached extract" : "Backend refresh",
    },
    {
      caveat: "Future land use and official rezoning records are needed.",
      coverage: "Incomplete",
      currentUse: "Data request tracking and planning context caveats.",
      dataStatus: "Data needed",
      domain: "Zoning / Land Use",
      groupId: "data-gaps",
      updateCadence: "Official data needed",
    },
    {
      caveat: "Internal research only. No exact probabilities.",
      coverage: "Governance only",
      currentUse: "Model readiness status and safe-use boundaries.",
      dataStatus: "Internal only",
      domain: "Model Research",
      groupId: "model-research",
      updateCadence: "Research governance",
    },
  ];
}

function getSchoolUtilizationCounts(
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>,
): SchoolUtilizationCounts {
  const counts = schoolSummary.utilizationClassDistribution.reduce(
    (accumulator, bucket) => {
      const label = bucket.label.toLowerCase();
      const value = parseMetricValue(bucket.value);

      if (label.includes("approach")) {
        accumulator.approaching += value;
      } else if (label.includes("very high") || label.includes("severe")) {
        accumulator.severe += value;
      } else if (label.includes("over")) {
        accumulator.over += value;
      } else if (label.includes("under") || label.includes("lower")) {
        accumulator.under += value;
      }

      accumulator.total += value;
      return accumulator;
    },
    {
      approaching: 0,
      available: schoolSummary.utilizationClassDistribution.length > 0,
      over: 0,
      severe: 0,
      total: 0,
      under: 0,
      unmatched: schoolSummary.unmatchedPresentationSeedRows.length,
    },
  );

  return counts;
}

function MissionHeader({
  activeTab,
  demoGeneratedAt,
  onOpenPlanningSnapshot,
  onSaveSnapshot,
  snapshotSaving,
}: {
  activeTab: IndicatorReadinessTabId;
  demoGeneratedAt: string | null;
  onOpenPlanningSnapshot: () => void;
  onSaveSnapshot: () => void;
  snapshotSaving: boolean;
}) {
  const statusPills = [
    "Permit Activity",
    "Floodplain Review",
    "School Capacity Watch",
    "Utility Readiness",
    "Transportation Context",
    "Data Readiness",
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#68d8ff]/20 bg-[linear-gradient(135deg,rgba(4,13,26,0.96),rgba(3,7,13,0.92)),radial-gradient(circle_at_top_right,rgba(104,216,255,0.16),transparent_34%)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(104,216,255,0.055)_1px,transparent_1px),linear-gradient(rgba(104,216,255,0.035)_1px,transparent_1px)] bg-[length:30px_30px]" />
      <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={USE_DEMO_DATA ? "Portfolio Demo" : "Local Live Data"}
              tone={USE_DEMO_DATA ? "gold" : "cyan"}
            />
            <StatusPill
              label={USE_DEMO_DATA ? "Cached demo extract" : "Backend intelligence"}
              tone="slate"
            />
            <StatusPill
              label={readinessTabs.find((tab) => tab.id === activeTab)?.label ?? "All Signals"}
              tone="cyan"
            />
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            CFS Mission Control
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
            County growth, constraint, and readiness monitoring.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Last updated: {formatFreshnessLabel(demoGeneratedAt)} / Data mode:{" "}
            {USE_DEMO_DATA
              ? "public portfolio demo"
              : USE_BACKEND_API
                ? "local/live backend"
                : "static fallback"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {statusPills.map((label) => (
              <span
                className="rounded border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-300"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-[#55d38f]/25 bg-[#55d38f]/10 px-3 py-2 text-xs font-semibold text-[#a8f3c4] transition hover:border-[#55d38f]/45 hover:bg-[#55d38f]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55d38f]/45"
            disabled={snapshotSaving}
            onClick={onSaveSnapshot}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {snapshotSaving ? "Capturing Dashboard..." : "Save Snapshot"}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/45"
            onClick={onOpenPlanningSnapshot}
            type="button"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Open Planning Snapshot
          </button>
        </div>
      </div>
    </section>
  );
}

function IndicatorReadinessTabs({
  activeTab,
  onChange,
}: {
  activeTab: IndicatorReadinessTabId;
  onChange: (tabId: IndicatorReadinessTabId) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/24 p-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {readinessTabs.map((tab) => {
          const selected = activeTab === tab.id;

          return (
            <button
              aria-pressed={selected}
              className={cn(
                "min-w-0 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/60",
                selected
                  ? "border-[#68d8ff]/45 bg-[#68d8ff]/14 text-[#dff9ff] shadow-[0_0_24px_rgba(104,216,255,0.14)]"
                  : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-white/20 hover:bg-white/[0.05]",
              )}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              type="button"
            >
              <span className="block truncate text-xs font-semibold">
                {tab.label}
              </span>
              <span className="mt-1 block truncate text-[10px] text-slate-500">
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AskCfsActionStrip({
  actions,
  onReset,
}: {
  actions: CfsAiDashboardActions;
  onReset: () => void;
}) {
  const recommendedLayers = actions.recommended_layers ?? [];
  const filter = actions.filter_watchlist;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] px-3 py-2 text-xs text-slate-300">
      {actions.focus_domain ? (
        <span className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 font-semibold text-[#b7f0ff]">
          Ask CFS focus: {formatAskCfsLabel(actions.focus_domain)}
        </span>
      ) : null}
      {filter?.domain || filter?.status ? (
        <span className="rounded border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 font-semibold text-[#f6d98e]">
          Ask CFS filter: {[filter.domain, filter.status].filter(Boolean).join(" / ")}
        </span>
      ) : null}
      {recommendedLayers.length ? (
        <span className="min-w-0 truncate">
          Recommended layers to inspect: {recommendedLayers.join(", ")}
        </span>
      ) : null}
      <button
        className="ml-auto inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold text-slate-200 hover:border-white/20"
        onClick={onReset}
        type="button"
      >
        <X className="h-3 w-3" />
        Reset Ask CFS focus
      </button>
    </div>
  );
}

function MissionSectionHeader({
  eyebrow,
  icon,
  title,
  value,
}: {
  eyebrow: string;
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/24 bg-[#68d8ff]/10 text-[#8fe7ff]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
        </div>
      </div>
      <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-300">
        {value}
      </span>
    </div>
  );
}

function DomainReadinessMatrix({
  onInspect,
  rows,
}: {
  onInspect: (groupId: IndicatorCenterGroupId) => void;
  rows: DomainReadinessRow[];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 xl:grid xl:grid-cols-[minmax(10rem,1fr)_8rem_8rem_9rem_minmax(12rem,1.2fr)_minmax(12rem,1.4fr)] xl:gap-3">
        <span>Domain</span>
        <span>Data Status</span>
        <span>Coverage</span>
        <span>Cadence</span>
        <span>Current Use</span>
        <span>Caveat</span>
      </div>
      {rows.map((row) => (
        <button
          className="grid w-full min-w-0 gap-2 border-b border-white/10 px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.045] xl:grid-cols-[minmax(10rem,1fr)_8rem_8rem_9rem_minmax(12rem,1.2fr)_minmax(12rem,1.4fr)] xl:items-center xl:gap-3"
          key={row.domain}
          onClick={() => onInspect(row.groupId)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {row.domain}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8fe7ff]">
              Inspect
            </span>
          </span>
          <span className="w-fit rounded border border-[#68d8ff]/18 bg-[#68d8ff]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#b7f0ff]">
            {row.dataStatus}
          </span>
          <span className="text-xs text-slate-300">{row.coverage}</span>
          <span className="text-xs text-slate-400">{row.updateCadence}</span>
          <span className="text-xs leading-5 text-slate-300">
            {row.currentUse}
          </span>
          <span className="text-xs leading-5 text-slate-500">
            {row.caveat}
          </span>
        </button>
      ))}
    </div>
  );
}

function HowIndicatorsWorkPanel({
  onOpenMethodology,
}: {
  onOpenMethodology: () => void;
}) {
  return (
    <div className="mt-4 rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/[0.055] p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            How indicators work
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Indicator Center is not an official scoring system. It summarizes
            existing CFS evidence, observed activity, review indicators, and
            data gaps so staff can choose what to review next.
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:border-[#68d8ff]/45 hover:bg-[#68d8ff]/15"
          onClick={onOpenMethodology}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Open Methodology
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "High Attention",
            "A category deserves staff review because observed activity or review context is available.",
          ],
          [
            "Data Needed",
            "An official source is missing, so CFS labels the gap instead of inventing a value.",
          ],
          [
            "Observed Activity",
            "Historical or operational activity already exists in CFS; it is not prediction.",
          ],
          [
            "Internal Research",
            "Model context is governance-only and does not publish exact probabilities or official determinations.",
          ],
        ].map(([label, description]) => (
          <div
            className="rounded border border-white/10 bg-black/18 px-3 py-2"
            key={label}
          >
            <p className="text-xs font-semibold text-white">{label}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IndicatorDetailDrawer({
  currentValue,
  indicator,
  onClose,
  onIncludeInSnapshot,
  onOpenMethodology,
  schoolCounts,
  schoolSummary,
  secondaryValue,
  section,
}: {
  currentValue: string;
  indicator: IndicatorCenterContext;
  onClose: () => void;
  onIncludeInSnapshot: () => void | Promise<void>;
  onOpenMethodology: () => void;
  schoolCounts: SchoolUtilizationCounts;
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>;
  secondaryValue?: string;
  section: DrilldownSectionModel | null;
}) {
  const [geometry, setGeometry] = useState<DrawerGeometry>(() =>
    getDefaultDrawerGeometry(),
  );
  const [interaction, setInteraction] = useState<DrawerInteraction | null>(
    null,
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleResize = () => {
      setGeometry((currentGeometry) =>
        clampDrawerGeometry(currentGeometry),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      event.preventDefault();
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      if (interaction.type === "drag") {
        setGeometry(
          clampDrawerGeometry({
            height: interaction.startHeight,
            left: interaction.startLeft + deltaX,
            top: interaction.startTop + deltaY,
            width: interaction.startWidth,
          }),
        );
        return;
      }

      setGeometry(resizeDrawerGeometry(interaction, deltaX, deltaY));
    };

    const handlePointerUp = () => setInteraction(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [interaction]);

  const startDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        target.closest("button,a,input,select,textarea")
      ) {
        return;
      }

      event.preventDefault();
      setInteraction({
        startHeight: geometry.height,
        startLeft: geometry.left,
        startTop: geometry.top,
        startWidth: geometry.width,
        startX: event.clientX,
        startY: event.clientY,
        type: "drag",
      });
    },
    [geometry],
  );

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>, resizeHandle: DrawerResizeHandle) => {
      event.preventDefault();
      event.stopPropagation();
      setInteraction({
        resizeHandle,
        startHeight: geometry.height,
        startLeft: geometry.left,
        startTop: geometry.top,
        startWidth: geometry.width,
        startX: event.clientX,
        startY: event.clientY,
        type: "resize",
      });
    },
    [geometry],
  );

  const resetDrawer = () => {
    setGeometry(getDefaultDrawerGeometry());
  };

  const drawerStyle: CSSProperties = {
    height: geometry.height,
    left: geometry.left,
    top: geometry.top,
    width: geometry.width,
  };

  return (
    <aside
      aria-label="Indicator Detail Drawer"
      className="cfs-drawer-command fixed z-50 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl backdrop-blur-xl"
      role="dialog"
      style={drawerStyle}
    >
      <div
        className={cn(
          "cursor-move select-none border-b border-white/10 p-4",
          interaction?.type === "drag" && "bg-white/[0.035]",
        )}
        onPointerDown={startDrag}
        title="Drag to move drawer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/10 text-[#8fe7ff]">
              <Move className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8fe7ff]">
              Indicator Detail Drawer
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {indicator.title ?? indicator.name}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {indicator.category}
            </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Reset drawer position"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            onClick={resetDrawer}
            title="Reset drawer position"
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            aria-label="Close details"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            onClick={onClose}
            title="Close details"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill label={indicator.status} tone="cyan" />
          <StatusPill
            label={indicator.officialDataNeeded ? "Official data needed" : "Existing CFS context"}
            tone={indicator.officialDataNeeded ? "gold" : "slate"}
          />
          <StatusPill
            label={indicator.snapshotIncluded ? "Snapshot-ready" : "Optional snapshot context"}
            tone="slate"
          />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="grid gap-3">
          <DetailFact label="Current value / count" value={currentValue} />
          {secondaryValue ? (
            <DetailFact label="Supporting evidence" value={secondaryValue} />
          ) : null}
          <IndicatorDeepDive
            indicator={indicator}
            schoolCounts={schoolCounts}
            schoolSummary={schoolSummary}
            section={section}
          />
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#55d38f]/25 bg-[#55d38f]/10 px-3 py-2 text-xs font-semibold text-[#a8f3c4] transition hover:border-[#55d38f]/45 hover:bg-[#55d38f]/15"
            onClick={() => {
              void onIncludeInSnapshot();
            }}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            Include in Snapshot
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:border-[#68d8ff]/45 hover:bg-[#68d8ff]/15"
            onClick={onOpenMethodology}
            type="button"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Open Methodology
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          Detail drawer content is dashboard context only. It is not an
          official scoring system.
        </p>
      </div>
      <DrawerResizeHandleElement
        className="left-0 top-3 h-[calc(100%-1.5rem)] w-2 cursor-ew-resize"
        label="Resize details drawer from left edge"
        onPointerDown={(event) => startResize(event, "left")}
      />
      <DrawerResizeHandleElement
        className="right-0 top-3 h-[calc(100%-1.5rem)] w-2 cursor-ew-resize"
        label="Resize details drawer from right edge"
        onPointerDown={(event) => startResize(event, "right")}
      />
      <DrawerResizeHandleElement
        className="bottom-0 left-5 h-2 w-[calc(100%-2.5rem)] cursor-ns-resize"
        label="Resize details drawer from bottom edge"
        onPointerDown={(event) => startResize(event, "bottom")}
      />
      <DrawerResizeHandleElement
        className="bottom-0 left-0 h-5 w-5 cursor-nesw-resize rounded-bl-lg border-b-2 border-l-2 border-[#68d8ff]/45"
        label="Resize details drawer from bottom left corner"
        onPointerDown={(event) => startResize(event, "bottom-left")}
      />
      <DrawerResizeHandleElement
        className="bottom-0 right-0 h-5 w-5 cursor-nwse-resize rounded-br-lg border-b-2 border-r-2 border-[#68d8ff]/45"
        label="Resize details drawer from bottom right corner"
        onPointerDown={(event) => startResize(event, "bottom-right")}
      />
    </aside>
  );
}

function DrawerResizeHandleElement({
  className,
  label,
  onPointerDown,
}: {
  className: string;
  label: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        "absolute opacity-70 transition hover:bg-[#68d8ff]/10 hover:opacity-100",
        className,
      )}
      onPointerDown={onPointerDown}
      role="separator"
      title={label}
    />
  );
}

function IndicatorDeepDive({
  indicator,
  schoolCounts,
  schoolSummary,
  section,
}: {
  indicator: IndicatorCenterContext;
  schoolCounts: SchoolUtilizationCounts;
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>;
  section: DrilldownSectionModel | null;
}) {
  const stats = section?.stats ?? [];

  switch (indicator.groupId) {
    case "school-context":
      const overVeryHighRows = sortSchoolSeedRows(
        schoolSummary.utilizationSeedRows.filter((row) =>
          ["over_capacity", "severely_over_capacity", "very_high"].some(
            (className) => row.utilizationClass.includes(className),
          ),
        ),
      );
      const approachingRows = sortSchoolSeedRows(
        schoolSummary.utilizationSeedRows.filter((row) =>
          row.utilizationClass.includes("approaching"),
        ),
      );

      return (
        <div className="grid gap-3">
          <DeepDiveBlock title="School capacity summary">
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailFact
                label="Total preliminary records"
                value={schoolCounts.available ? formatCount(schoolCounts.total) : "Needs official data"}
              />
              <DetailFact
                label="Above capacity / very high"
                value={
                  schoolCounts.available
                    ? `${formatCount(schoolCounts.over)} above capacity / ${formatCount(
                        schoolCounts.severe,
                      )} very high`
                    : "Needs official data"
                }
              />
              <DetailFact
                label="Under / approaching"
                value={
                  schoolCounts.available
                    ? `${formatCount(schoolCounts.under)} under / ${formatCount(
                        schoolCounts.approaching,
                      )} approaching`
                    : "Needs official data"
                }
              />
              <DetailFact
                label="Unmatched references"
                value={
                  schoolCounts.available
                    ? formatCount(schoolCounts.unmatched)
                    : "Not available"
                }
              />
            </div>
          </DeepDiveBlock>
          {section?.chart ? (
            <MiniChartCard
              caveat={section.chart.caveat}
              data={section.chart.data}
              emptyLabel={section.chart.emptyLabel}
              title={section.chart.title}
            />
          ) : null}
          <DeepDiveBlock title="Above capacity / very high list">
            {overVeryHighRows.length ? (
              <SchoolSeedTable rows={overVeryHighRows.slice(0, 12)} />
            ) : (
              <p className="rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
                School-level list is not available from the current source.
                Official school capacity/enrollment data is needed.
              </p>
            )}
          </DeepDiveBlock>
          <DeepDiveBlock title="Approaching capacity list">
            {approachingRows.length ? (
              <SchoolSeedTable rows={approachingRows.slice(0, 8)} />
            ) : (
              <p className="text-xs text-slate-400">
                Not available from current source.
              </p>
            )}
          </DeepDiveBlock>
          {schoolSummary.unmatchedPresentationSeedRows.length ? (
            <DeepDiveBlock title="Schools needing verification">
              <div className="grid gap-1.5">
                {schoolSummary.unmatchedPresentationSeedRows
                  .slice(0, 8)
                  .map((row) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.025] px-2 py-1.5 text-xs"
                      key={`${row.label}-${row.matchLabel}`}
                    >
                      <span className="min-w-0 text-slate-300">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-slate-500">
                        {row.matchLabel}
                      </span>
                    </div>
                  ))}
              </div>
            </DeepDiveBlock>
          ) : null}
          <ChecklistBlock
            title="Official fields needed"
            items={[
              "school name",
              "school id",
              "school level",
              "enrollment",
              "functional capacity",
              "utilization percent",
              "source year",
              "projection year if available",
              "attendance zone id if available",
            ]}
          />
          <DetailFact
            label="Recommended action"
            value="Request official enrollment and functional capacity by school."
          />
        </div>
      );
    case "development-activity":
      return (
        <div className="grid gap-3">
          <GenericDeepDive
            caveat="Observed activity only. Not prediction."
            chart={section?.chart}
            fields={[
              ...stats,
              {
                label: "Recommended action",
                value: "Review permit records and new construction context.",
              },
            ]}
            title="Development activity drilldown"
          />
          {section?.additionalCharts?.map((chart) => (
            <MiniChartCard
              caveat={chart.caveat}
              data={chart.data}
              emptyLabel={chart.emptyLabel}
              key={chart.title}
              title={chart.title}
            />
          ))}
        </div>
      );
    case "flood-review":
      return (
          <GenericDeepDive
            caveat="Based on FEMA floodplain data."
            chart={section?.chart}
            fields={[
              ...stats,
              {
                label: "Recommended action",
                value:
                "Confirm Floodway, Special Flood Hazard Area, and local floodplain requirements during formal review.",
              },
            ]}
          title="Floodplain Review details"
        />
      );
    case "utility-infrastructure":
      return (
        <div className="grid gap-3">
          <GenericDeepDive
            caveat="Utility proxy does not confirm available capacity."
            fields={stats}
            title="Utility / infrastructure drilldown"
          />
          <ChecklistBlock
            title="WSACC request fields"
            items={[
              "service area geometry",
              "available capacity",
              "committed capacity",
              "service / pressure zone",
              "sewer basin",
              "pump station capacity if available",
              "planned extensions",
              "update date",
            ]}
          />
        </div>
      );
    case "model-research":
      return (
        <div className="grid gap-3">
          <GenericDeepDive
            caveat="Internal only. No exact parcel probabilities."
            fields={[
              ...stats,
              { label: "Feature rows", value: developmentModelLabSummary.featureRows },
              { label: "Target", value: developmentModelLabSummary.target },
            ]}
            title="Model research drilldown"
          />
          <details className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-white">
              Model QA Details
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Aggregate QA metrics remain explanatory context only. They are
              not parcel-level scores and are available through Model Lab
              explanations when needed.
            </p>
          </details>
        </div>
      );
    case "data-gaps":
      return (
        <div className="grid gap-3">
          <DeepDiveBlock title="Priority missing dataset table">
            <div className="overflow-hidden rounded-md border border-white/10">
              {indicatorCenterMissingDataItems.map((item) => (
                <div
                  className="grid gap-1 border-b border-white/10 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"
                  key={item}
                >
                  <span className="text-xs font-semibold text-white">
                    {item}
                  </span>
                  <span className="text-[11px] text-[#f6d98e]">
                    Needs official data
                  </span>
                  <span className="text-[11px] text-slate-400">
                    REST/GIS/table
                  </span>
                </div>
              ))}
            </div>
          </DeepDiveBlock>
          <DetailFact
            label="What it unlocks"
            value="Stronger operational conclusions, better validation, and less manual caveat handling."
          />
          <DetailFact
            label="Suggested request action"
            value="Request authoritative source tables or GIS services; PDF-only files are useful for reference but weaker for automated integration."
          />
        </div>
      );
    default:
      return (
        <GenericDeepDive
          caveat={indicator.caveat}
          fields={[
            { label: "Why it matters", value: indicator.whatItMeans },
            { label: "Data source basis", value: indicator.source },
            { label: "Recommended follow-up", value: indicator.recommendedFollowUp },
          ]}
          title={indicator.title ?? indicator.name}
        />
      );
  }
}

function GenericDeepDive({
  caveat,
  chart,
  fields,
  title,
}: {
  caveat: string;
  chart?: DrilldownSectionModel["chart"];
  fields: DrilldownStat[];
  title: string;
}) {
  return (
    <div className="grid gap-3">
      <DeepDiveBlock title={title}>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <DetailFact
              key={`${title}-${field.label}`}
              label={field.label}
              value={field.value}
            />
          ))}
        </div>
      </DeepDiveBlock>
      {chart ? (
        <MiniChartCard
          caveat={chart.caveat}
          data={chart.data}
          emptyLabel={chart.emptyLabel}
          title={chart.title}
        />
      ) : null}
      <DetailFact label="Caveat" value={caveat} />
    </div>
  );
}

function SchoolSeedTable({
  rows,
}: {
  rows: ReturnType<typeof useSchoolConstraintSummary>["utilizationSeedRows"];
}) {
  return (
    <div className="grid min-w-0 gap-2">
      {rows.map((row) => (
        <article
          className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] p-2.5"
          key={`${row.schoolName}-${row.schoolLevel}-${row.utilizationPctLabel}`}
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white" title={row.schoolName}>
                {row.schoolName}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {row.schoolLevel}
              </p>
            </div>
            <span className="rounded border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-xs font-semibold text-[#f6d98e]">
              {row.utilizationPctLabel}
            </span>
          </div>
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <CompactField label="Class" value={row.utilizationClassLabel} />
            <CompactField label="Utilization %" value={row.utilizationPctLabel} />
            <CompactField
              label="Enrollment"
              value="Not available from current source"
            />
            <CompactField
              label="Capacity"
              value="Not available from current source"
            />
            <CompactField
              label="Verification"
              value={
                row.needsVerification
                  ? "Needs verification"
                  : "Context available"
              }
            />
            <CompactField label="Match status" value={row.matchStatus} />
          </div>
        </article>
      ))}
    </div>
  );
}

function CompactField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-white/10 bg-black/16 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-300" title={value}>
        {value}
      </p>
    </div>
  );
}

function DeepDiveBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.025] p-3">
      <p className="mb-2 text-xs font-semibold text-white">{title}</p>
      {children}
    </section>
  );
}

function ChecklistBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <DeepDiveBlock title={title}>
      <div className="grid gap-1.5">
        {items.map((item) => (
          <div
            className="flex items-center gap-2 text-xs text-slate-300"
            key={item}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#55d38f]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </DeepDiveBlock>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-xs leading-5 text-slate-200">
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "cyan" | "gold" | "slate";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em]",
        tone === "cyan" &&
          "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#b7f0ff]",
        tone === "gold" &&
          "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f6d98e]",
        tone === "slate" &&
          "border-white/10 bg-white/[0.04] text-slate-300",
      )}
    >
      {label}
    </span>
  );
}

function DataStillNeededStrip({ onInspect }: { onInspect: () => void }) {
  const rows = indicatorCenterMissingDataItems.map((item) => ({
    bestFormat: "REST/GIS/table",
    dataset: item,
    status: "Data still needed",
    unlocks:
      item.toLowerCase().includes("school")
        ? "Capacity review"
        : item.toLowerCase().includes("utility") ||
            item.toLowerCase().includes("wsacc")
          ? "Service readiness"
          : item.toLowerCase().includes("pipeline") ||
              item.toLowerCase().includes("rezoning")
            ? "Development pipeline review"
            : "Planning context",
    why:
      item.toLowerCase().includes("school")
        ? "Confirms enrollment/capacity"
        : item.toLowerCase().includes("utility") ||
            item.toLowerCase().includes("wsacc")
          ? "Confirms true capacity"
          : "Adds official source context",
  }));

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <button
          className="min-w-0 rounded-lg border border-white/10 bg-black/18 p-3 text-left transition hover:border-[#68d8ff]/24 hover:bg-white/[0.045]"
          key={row.dataset}
          onClick={onInspect}
          type="button"
        >
          <span className="block truncate text-sm font-semibold text-white" title={row.dataset}>
            {row.dataset}
          </span>
          <span className="mt-2 inline-flex rounded border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#f6d98e]">
            {row.status}
          </span>
          <span className="mt-2 block text-xs text-slate-400">
            {row.bestFormat}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Unlocks: {row.unlocks}
          </span>
        </button>
      ))}
    </div>
  );
}

function ExecutiveSignalCard({
  highlighted,
  onInspect,
  signal,
}: {
  highlighted?: boolean;
  onInspect: () => void;
  signal: ExecutiveSignalCardModel;
}) {
  return (
    <button
      className={cn(
        "cfs-command-card min-h-[10rem] rounded-lg p-3 text-left transition hover:-translate-y-0.5 hover:border-[#68d8ff]/30 hover:bg-white/[0.055] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/60",
        highlighted &&
          "border-[#f6d98e]/60 bg-[#f6d98e]/[0.08] shadow-[0_0_28px_rgba(246,217,142,0.18)]",
        getSignalToneClass(signal.tone),
      )}
      onClick={onInspect}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.055] text-slate-100">
            {signal.icon}
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
            {signal.label}
          </p>
        </div>
        <span className="rounded border border-white/14 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-slate-200">
          {signal.status}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
        {signal.value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-300">{signal.subvalue}</p>
      <div className="mt-3 grid gap-1.5">
        {signal.sparkline?.length ? (
          <TinySparkline data={signal.sparkline} />
        ) : null}
        <p className="rounded border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold text-slate-400">
          {signal.confidence}
        </p>
        <p className="text-[10px] leading-4 text-slate-500">
          {signal.caveat}
        </p>
      </div>
    </button>
  );
}

function TinySparkline({ data }: { data: ChartDatum[] }) {
  const maxValue = Math.max(...data.map((datum) => datum.value), 0);

  return (
    <div className="flex h-8 items-end gap-1 rounded border border-white/10 bg-black/18 px-2 py-1.5">
      {data.map((datum) => (
        <span
          className="min-h-1 flex-1 rounded-t bg-[#68d8ff]/70"
          key={`${datum.label}-${datum.value}`}
          style={{
            height:
              maxValue > 0
                ? `${Math.max(10, (datum.value / maxValue) * 100)}%`
                : "10%",
          }}
          title={`${datum.label}: ${formatCount(datum.value)}`}
        />
      ))}
    </div>
  );
}

function AttentionRow({
  onInspect,
  row,
}: {
  onInspect: () => void;
  row: AttentionQueueRow;
}) {
  return (
    <button
      className="grid w-full gap-2 border-b border-white/10 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.045] lg:grid-cols-[8.5rem_minmax(12rem,1fr)_12rem_7rem_minmax(10rem,1fr)_5rem] lg:items-center"
      onClick={onInspect}
      type="button"
    >
      <span className="w-fit rounded border border-[#68d8ff]/18 bg-[#68d8ff]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#b7f0ff]">
        {row.priorityLabel}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">
          {row.indicatorName}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {row.category}
        </span>
      </span>
      <span className="text-xs text-slate-300">{row.currentEvidence}</span>
      <span className="w-fit rounded border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
        {shortCaveat(row.caveat)}
      </span>
      <span className="text-xs text-slate-300">
        {shortAction(row.recommendedFollowUp)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff]">
          Inspect
          <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

function MiniChartCard({
  caveat,
  data,
  emptyLabel,
  title,
}: {
  caveat: string;
  data: ChartDatum[];
  emptyLabel: string;
  title: string;
}) {
  const maxValue = Math.max(...data.map((datum) => datum.value), 0);

  return (
    <div className="cfs-chart-panel rounded-md p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-white">{title}</p>
        <span className="rounded border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
          Monitoring visual
        </span>
      </div>
      {data.length ? (
        <div className="mt-3 grid gap-1.5">
          {data.map((datum) => (
            <div
              className="grid min-w-0 grid-cols-[minmax(5.5rem,8rem)_minmax(0,1fr)_4rem] items-center gap-2"
              key={`${title}-${datum.label}`}
            >
              <p
                className="truncate text-[10px] font-semibold text-slate-400"
                title={datum.label}
              >
                {formatChartLabel(datum.label)}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[#68d8ff]/70"
                  style={{
                    width:
                      maxValue > 0
                        ? `${Math.max(6, (datum.value / maxValue) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
              <p className="text-right text-[10px] font-semibold text-slate-300">
                {formatCount(datum.value)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-2 py-2 text-xs leading-5 text-[#f6d98e]">
          {emptyLabel || "Data still needed."}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{caveat}</p>
    </div>
  );
}

function SchoolPressureMissionPanel({
  features,
  onInspect,
  state,
}: {
  features: SchoolPressureFeature[];
  onInspect: (feature: SchoolPressureFeature | null) => void;
  state: SchoolPressureLayerState;
}) {
  const watchRows = features
    .filter((feature) =>
      ["elevated review", "review", "data needed"].includes(
        feature.properties.school_pressure_watch_band,
      ),
    )
    .slice(0, 5);

  return (
    <div className="cfs-command-surface mt-3 rounded-xl border-white/10 p-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <SchoolPressureKpi
          label="Attendance areas reviewed"
          value={
            state.status === "loading"
              ? "Loading"
              : formatCount(state.summary.areas_analyzed)
          }
        />
        <SchoolPressureKpi
          label="Elevated review signal"
          value={formatCount(state.summary.elevated_review_count)}
        />
        <SchoolPressureKpi
          label="Missing utilization data"
          value={formatCount(state.summary.data_needed_count)}
        />
        <SchoolPressureKpi
          label="Watched-area residential permits"
          value={formatCount(
            state.summary.recent_residential_permits_in_watched_areas,
          )}
        />
      </div>

      {state.errorMessage ? (
        <p className="mt-3 rounded border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs text-[#f6d98e]">
          {state.errorMessage}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
        <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid lg:grid-cols-[minmax(12rem,1fr)_6rem_8rem_8rem_5rem] lg:gap-2">
          <span>School / Area</span>
          <span>Level</span>
          <span>Watch Band</span>
          <span>Recent Permits</span>
          <span>Inspect</span>
        </div>
        {(watchRows.length ? watchRows : features.slice(0, 3)).map((feature) => (
          <button
            className="grid w-full min-w-0 gap-2 border-b border-white/10 px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.045] lg:grid-cols-[minmax(12rem,1fr)_6rem_8rem_8rem_5rem] lg:items-center lg:gap-2"
            key={`${feature.properties.attendance_area_id ?? feature.properties.school_name ?? "school-pressure"}-${feature.properties.school_level ?? "level"}`}
            onClick={() => onInspect(feature)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">
                {feature.properties.school_name ?? "Attendance area"}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Utilization + permit context
              </span>
            </span>
            <span className="text-xs text-slate-300">
              {formatSchoolPressureLevel(feature.properties.school_level)}
            </span>
            <span className="w-fit rounded border border-[#d8b86a]/20 bg-[#d8b86a]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#f6d98e]">
              {feature.properties.school_pressure_watch_band}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              {formatNullableCount(feature.properties.permit_count_recent)}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8fe7ff]">
              Inspect
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>
          Planning review signal only. Combines utilization context with observed
          permit activity.
        </p>
        <button
          className="rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:border-[#68d8ff]/45 hover:bg-[#68d8ff]/15"
          onClick={() => onInspect(null)}
          type="button"
        >
          Inspect method
        </button>
      </div>
    </div>
  );
}

function SchoolPressureKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function getIndicatorByGroup(groupId: IndicatorCenterGroupId) {
  return (
    indicatorCenterDefinitions.find((indicator) => indicator.groupId === groupId) ??
    indicatorCenterDefinitions[0]
  );
}

function buildSchoolPressureIndicatorContext(
  summary: SchoolPressureSummary,
): IndicatorCenterContext {
  return {
    caveat:
      "Planning review signal only; not an official enrollment forecast.",
    category: "Schools",
    chartSupported: true,
    dataUsed: [
      "School attendance areas",
      "Preliminary utilization context",
      "Observed permit activity by attendance area",
    ],
    groupId: "school-context",
    indicatorId: "school-pressure",
    name: "School Utilization + Permit Pressure",
    officialDataNeeded: summary.data_needed_count > 0,
    priority: summary.elevated_review_count > 0 ? "Review Needed" : "Context Available",
    priorityLabel:
      summary.elevated_review_count > 0 ? "Review Needed" : "Context Available",
    recommendedFollowUp:
      "Review enrollment trends, approved subdivisions, and school capacity assumptions.",
    snapshotIncluded: true,
    source: USE_DEMO_DATA
      ? "Cached demo extract"
      : "Local backend school pressure endpoint",
    status:
      summary.elevated_review_count > 0
        ? "Planning review signal"
        : "Context available",
    title: "School Utilization + Permit Pressure",
    whatItMeans:
      "Compares current school utilization context with observed permit activity inside attendance areas.",
  };
}

function buildSchoolPressureFeatureContext(
  feature: SchoolPressureFeature,
): IndicatorCenterContext {
  const properties = feature.properties;
  return {
    ...buildSchoolPressureIndicatorContext({
      areas_analyzed: 1,
      areas_with_recent_permits:
        (properties.permit_count_recent ?? 0) > 0 ? 1 : 0,
      areas_with_utilization:
        typeof properties.utilization_pct === "number" ? 1 : 0,
      data_needed_count:
        properties.school_pressure_watch_band === "data needed" ? 1 : 0,
      elevated_review_count:
        properties.school_pressure_watch_band === "elevated review" ? 1 : 0,
      recent_residential_permits_in_watched_areas:
        properties.residential_permit_count_recent ?? 0,
    }),
    indicatorId: `school-pressure-${properties.attendance_area_id ?? properties.school_name ?? "area"}`,
    name: properties.school_name ?? "Attendance-area development pressure",
    title: properties.school_name ?? "Attendance-Area Development Pressure",
    status: properties.school_pressure_watch_band,
    whatItMeans: [
      `Watch band: ${properties.school_pressure_watch_band}.`,
      `Recent permits: ${formatNullableCount(properties.permit_count_recent)}.`,
      properties.utilization_pct === null
        ? "Utilization percent is not available from current source."
        : `Utilization context: ${properties.utilization_pct.toFixed(1)}%.`,
    ].join(" "),
  };
}

function getDrilldownById(
  sections: DrilldownSectionModel[],
  id: IndicatorCenterGroupId,
) {
  return sections.find((section) => section.id === id) ?? null;
}

function getDevelopmentMetric(
  developmentStatistics: ReturnType<typeof useDevelopmentStatistics>,
  id: string,
  fallback: string,
) {
  return (
    developmentStatistics.coreMetrics.find((metric) => metric.id === id)
      ?.value ?? fallback
  );
}

function getFloodMetric(
  floodSummary: ReturnType<typeof useFloodConstraintSummary>,
  id: string,
  fallback: string,
) {
  return floodSummary.metrics.find((metric) => metric.id === id)?.value ?? fallback;
}

function getPrioritySort(priority: string) {
  switch (priority) {
    case "High Attention":
      return 0;
    case "Review Needed":
      return 1;
    case "Data Needed":
    case "Proxy Only":
    case "Preliminary Data":
      return 2;
    case "Internal Research Only":
      return 3;
    default:
      return 4;
  }
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatNullableCount(value: number | null | undefined) {
  return typeof value === "number" ? formatCount(value) : "Not available";
}

function formatSchoolPressureLevel(value: string | null | undefined) {
  if (!value) {
    return "Level not available";
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("elem")) {
    return "Elementary";
  }

  if (normalized.startsWith("mid")) {
    return "Middle";
  }

  if (normalized.startsWith("high")) {
    return "High";
  }

  return value;
}

function formatFreshnessLabel(value: string | null) {
  if (!value) {
    return USE_DEMO_DATA ? "cached demo extract" : "current session";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function shortCaveat(caveat: string) {
  const normalized = caveat.toLowerCase();

  if (normalized.includes("fema")) {
    return "FEMA source";
  }

  if (
    normalized.includes("presentation-derived") ||
    normalized.includes("seed") ||
    normalized.includes("preliminary")
  ) {
    return "Preliminary";
  }

  if (normalized.includes("proxy")) {
    return "Proxy only";
  }

  if (normalized.includes("exact") || normalized.includes("production")) {
    return "Internal only";
  }

  if (normalized.includes("official data")) {
    return "Data needed";
  }

  if (normalized.includes("prediction")) {
    return "Not prediction";
  }

  return caveat.length > 28 ? `${caveat.slice(0, 25)}...` : caveat;
}

function parseMetricValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getHighestUtilizationPctLabel(
  schoolSummary: ReturnType<typeof useSchoolConstraintSummary>,
) {
  const highestRow = sortSchoolSeedRows(schoolSummary.utilizationSeedRows).find(
    (row) => typeof row.utilizationPct === "number",
  );

  return highestRow
    ? `Highest ${highestRow.utilizationPctLabel}`
    : null;
}

function sortSchoolSeedRows(
  rows: ReturnType<typeof useSchoolConstraintSummary>["utilizationSeedRows"],
) {
  return [...rows].sort((left, right) => {
    const pctDelta =
      getSchoolSeedSortValue(right) - getSchoolSeedSortValue(left);

    if (pctDelta !== 0) {
      return pctDelta;
    }

    return left.schoolName.localeCompare(right.schoolName);
  });
}

function getSchoolSeedSortValue(
  row: ReturnType<typeof useSchoolConstraintSummary>["utilizationSeedRows"][number],
) {
  if (typeof row.utilizationPct === "number") {
    return row.utilizationPct;
  }

  if (
    row.utilizationClass.includes("severe") ||
    row.utilizationClass.includes("very_high")
  ) {
    return 400;
  }

  if (row.utilizationClass.includes("over")) {
    return 300;
  }

  if (row.utilizationClass.includes("approach")) {
    return 200;
  }

  if (row.utilizationClass.includes("under")) {
    return 100;
  }

  return 0;
}

function formatChartLabel(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("very high") || normalized.includes("severe")) {
    return "Very High";
  }

  if (normalized.includes("approach")) {
    return "Approaching";
  }

  if (normalized.includes("under")) {
    return "Under";
  }

  if (normalized.includes("over")) {
    return "Over";
  }

  if (normalized.includes("review")) {
    return "Review Required";
  }

  if (normalized.includes("floodway")) {
    return "Floodway";
  }

  if (normalized.includes("sfha")) {
    return "Special Flood Hazard Area";
  }

  if (normalized.includes("high") && normalized.includes("severe")) {
    return "High / Severe";
  }

  return label;
}

function shortAction(action: string) {
  const normalized = action.toLowerCase();

  if (normalized.includes("school")) {
    return "Verify capacity";
  }

  if (normalized.includes("flood")) {
    return "Confirm flood context";
  }

  if (normalized.includes("permit") || normalized.includes("construction")) {
    return "Review permit context";
  }

  if (normalized.includes("wsacc") || normalized.includes("capacity")) {
    return "Request capacity data";
  }

  if (normalized.includes("rezoning")) {
    return "Request case table";
  }

  if (normalized.includes("pipeline") || normalized.includes("site plan")) {
    return "Request pipeline data";
  }

  if (normalized.includes("model")) {
    return "Keep internal";
  }

  return action.length > 42 ? `${action.slice(0, 39)}...` : action;
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return {
      height: 900,
      width: 1440,
    };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function getDrawerAvailableSize() {
  const viewport = getViewportSize();
  const availableWidth = Math.max(320, viewport.width - DRAWER_MARGIN * 2);
  const availableHeight = Math.max(
    320,
    viewport.height - DRAWER_TOP_MARGIN - DRAWER_MARGIN,
  );

  return {
    availableHeight,
    availableWidth,
    minHeight: Math.min(DRAWER_MIN_HEIGHT, availableHeight),
    minWidth: Math.min(DRAWER_MIN_WIDTH, availableWidth),
    viewport,
  };
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampDrawerGeometry(geometry: DrawerGeometry): DrawerGeometry {
  const {
    availableHeight,
    availableWidth,
    minHeight,
    minWidth,
    viewport,
  } = getDrawerAvailableSize();
  const width = clampValue(geometry.width, minWidth, availableWidth);
  const height = clampValue(geometry.height, minHeight, availableHeight);

  return {
    height,
    left: clampValue(
      geometry.left,
      DRAWER_MARGIN,
      Math.max(DRAWER_MARGIN, viewport.width - width - DRAWER_MARGIN),
    ),
    top: clampValue(
      geometry.top,
      Math.min(DRAWER_TOP_MARGIN, viewport.height - height - DRAWER_MARGIN),
      Math.max(DRAWER_MARGIN, viewport.height - height - DRAWER_MARGIN),
    ),
    width,
  };
}

function resizeDrawerGeometry(
  interaction: DrawerInteraction,
  deltaX: number,
  deltaY: number,
): DrawerGeometry {
  const handle = interaction.resizeHandle ?? "bottom-right";
  const startRight = interaction.startLeft + interaction.startWidth;
  const next: DrawerGeometry = {
    height: interaction.startHeight,
    left: interaction.startLeft,
    top: interaction.startTop,
    width: interaction.startWidth,
  };

  if (handle.includes("left")) {
    const { availableWidth, minWidth } = getDrawerAvailableSize();
    const width = clampValue(
      interaction.startWidth - deltaX,
      minWidth,
      availableWidth,
    );
    next.width = width;
    next.left = startRight - width;
  } else if (handle.includes("right")) {
    next.width = interaction.startWidth + deltaX;
  }

  if (handle.includes("bottom")) {
    next.height = interaction.startHeight + deltaY;
  }

  return clampDrawerGeometry(next);
}

function getDefaultDrawerGeometry(): DrawerGeometry {
  const viewport = getViewportSize();
  const width = Math.min(
    DRAWER_DEFAULT_WIDTH,
    viewport.width - DRAWER_MARGIN * 2,
  );
  const height = Math.min(
    DRAWER_DEFAULT_HEIGHT,
    viewport.height - DRAWER_MARGIN * 2,
  );

  return clampDrawerGeometry({
    height,
    left: viewport.width - width - DRAWER_MARGIN,
    top: DRAWER_TOP_MARGIN,
    width,
  });
}

function getSignalToneClass(tone: ExecutiveSignalCardModel["tone"]) {
  switch (tone) {
    case "attention":
      return "border-[#d8b86a]/22 bg-[#d8b86a]/[0.08]";
    case "data":
      return "border-[#f0cd79]/18 bg-[#f0cd79]/[0.055]";
    case "internal":
      return "border-[#c8a4ff]/18 bg-[#c8a4ff]/[0.055]";
    case "review":
      return "border-[#ff8d7a]/18 bg-[#ff8d7a]/[0.055]";
    case "neutral":
    default:
      return "border-white/10 bg-black/18";
  }
}
