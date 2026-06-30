"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileSearch,
  Gauge,
  GraduationCap,
  HelpCircle,
  ListChecks,
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
import type {
  CfsAiDashboardActions,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
  CfsAiSelectedSignal,
} from "@/types/api";
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

interface IndicatorExplainSignal {
  domain: string;
  evidence?: string[];
  id: string;
  relatedLayers?: string[];
  statusBand?: string | null;
  title: string;
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
  const [askCfsExternalRequest, setAskCfsExternalRequest] =
    useState<{ request: CfsAiSearchRequest; requestId: number } | null>(null);
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
    },
    [],
  );

  const focusIndicator = useCallback(
    (groupId: IndicatorCenterGroupId, label = "") => {
      setSelectedIndicatorCenterContext(getIndicatorByGroup(groupId));
      const actions: CfsAiDashboardActions = {
        focus_domain: focusDomainForGroup(groupId, label),
        highlight_kpis: [kpiIdForGroup(groupId, label)],
        recommended_layers: relatedLayersForGroup(groupId, label),
      };
      setAskCfsActions(actions);
      const nextTab = mapAskCfsFocusToTab(actions.focus_domain);
      if (nextTab) {
        setActiveReadinessTab(nextTab);
      }
    },
    [setSelectedIndicatorCenterContext],
  );

  const explainSignal = useCallback(
    (signal: IndicatorExplainSignal) => {
      const selectedSignal: CfsAiSelectedSignal = {
        domain: signal.domain,
        evidence: signal.evidence?.filter(Boolean).slice(0, 6) ?? [],
        id: signal.id,
        related_layers: signal.relatedLayers?.filter(Boolean).slice(0, 6) ?? [],
        status_band: signal.statusBand ?? null,
        title: signal.title,
      };

      focusIndicator(groupIdForExplainSignal(signal), signal.title);
      setAskCfsExternalRequest({
        request: {
          query: `Explain the ${signal.title} signal. Include evidence, why it matters, caveats, and what to inspect next.`,
          selected_signal: selectedSignal,
        },
        requestId: Date.now(),
      });
    },
    [focusIndicator],
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
        <AskCfsPanel
          externalRequest={askCfsExternalRequest}
          onResponse={handleAskCfsResponse}
        />
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
                onExplain={() => explainSignal(explainSignalFromExecutiveSignal(signal))}
                onInspect={() => focusIndicator(signal.groupId, signal.label)}
                signal={signal}
              />
            ))}
          </div>
        </section>

        {shouldShowGroupForReadinessTab("development-activity", activeReadinessTab) ? (
          <PermitIntelligencePanel
            detail={indicatorIntelligence?.development_activity_detail ?? null}
            onExplain={() =>
              explainSignal({
                domain: "development_activity",
                evidence: permitEvidenceForDetail(
                  indicatorIntelligence?.development_activity_detail,
                ),
                id: "observed_development_activity",
                relatedLayers: ["Development Hotspots"],
                statusBand: "monitor",
                title: "Observed Development Activity",
              })
            }
            onInspect={() => focusIndicator("development-activity")}
          />
        ) : null}

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
            onExplain={(feature) =>
              explainSignal(
                feature
                  ? explainSignalFromSchoolPressureFeature(feature)
                  : explainSignalFromIndicatorContext(schoolPressureIndicator),
              )
            }
            onInspect={(feature) =>
              focusIndicator(
                "school-context",
                feature?.properties.school_name ?? schoolPressureIndicator.name,
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
          <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid lg:grid-cols-[8.5rem_minmax(12rem,1fr)_12rem_7rem_minmax(10rem,1fr)_8rem] lg:items-center lg:gap-2">
            <span>Priority</span>
            <span>Signal</span>
            <span>Evidence</span>
            <span>Status</span>
            <span>Next Action</span>
            <span>Actions</span>
          </div>
          {visibleAttentionQueue.map((row) => (
            <AttentionRow
              key={`${row.indicator.indicatorId}-${row.indicatorName}-${row.currentEvidence}`}
              onExplain={() => explainSignal(explainSignalFromAttentionRow(row))}
              onInspect={() => focusIndicator(row.indicator.groupId, row.indicatorName)}
              row={row}
            />
          ))}
        </div>
      </section>

      <ConstraintReviewPanel
        onExplain={(row) => explainSignal(explainSignalFromDomainReadinessRow(row))}
        onInspect={(row) => focusIndicator(row.groupId, row.domain)}
        rows={visibleDomainReadinessRows}
      />

      <section className="mt-4">
        <MissionSectionHeader
          eyebrow="Domain Readiness Matrix"
          icon={<ClipboardList className="h-4 w-4" />}
          title="CFS Intelligence Domains"
          value={`${visibleDomainReadinessRows.length} domains`}
        />
        <DomainReadinessMatrix
          onExplain={(row) =>
            explainSignal(
              explainSignalFromDomainReadinessRow(row),
            )
          }
          onInspect={(groupId) => focusIndicator(groupId)}
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
          onInspect={() => focusIndicator("data-gaps")}
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
      "Evidence available in Indicator Center",
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

function explainSignalFromExecutiveSignal(
  signal: ExecutiveSignalCardModel,
): IndicatorExplainSignal {
  return {
    domain: domainForGroupId(signal.groupId, signal.label),
    evidence: [signal.value, signal.subvalue, signal.confidence, signal.caveat],
    id: kpiIdForGroup(signal.groupId, signal.label),
    relatedLayers: relatedLayersForGroup(signal.groupId, signal.label),
    statusBand: signal.status,
    title: signal.label,
  };
}

function explainSignalFromAttentionRow(row: AttentionQueueRow): IndicatorExplainSignal {
  return {
    domain: domainForGroupId(row.indicator.groupId, row.category),
    evidence: [
      row.currentEvidence,
      row.whyItMatters,
      row.recommendedFollowUp,
      row.caveat,
    ],
    id: row.indicator.indicatorId,
    relatedLayers: relatedLayersForGroup(row.indicator.groupId, row.indicatorName),
    statusBand: row.priorityLabel,
    title: row.indicatorName,
  };
}

function explainSignalFromDomainReadinessRow(
  row: DomainReadinessRow,
): IndicatorExplainSignal {
  return {
    domain: domainForGroupId(row.groupId, row.domain),
    evidence: [
      `Data status: ${row.dataStatus}`,
      `Coverage: ${row.coverage}`,
      row.currentUse,
      row.caveat,
    ],
    id: `domain-${slugify(row.domain)}`,
    relatedLayers: relatedLayersForGroup(row.groupId, row.domain),
    statusBand: row.dataStatus,
    title: row.domain,
  };
}

function explainSignalFromIndicatorContext(
  indicator: IndicatorCenterContext,
): IndicatorExplainSignal {
  return {
    domain: domainForGroupId(indicator.groupId, indicator.name),
    evidence: [
      indicator.whatItMeans,
      indicator.recommendedFollowUp,
      indicator.caveat,
      indicator.source,
    ],
    id: indicator.indicatorId,
    relatedLayers: relatedLayersForGroup(indicator.groupId, indicator.name),
    statusBand: indicator.status,
    title: indicator.title ?? indicator.name,
  };
}

function explainSignalFromSchoolPressureFeature(
  feature: SchoolPressureFeature,
): IndicatorExplainSignal {
  const properties = feature.properties;
  return {
    domain: "school_pressure",
    evidence: [
      `Watch band: ${properties.school_pressure_watch_band}`,
      `Recent permits: ${formatNullableCount(properties.permit_count_recent)}`,
      properties.utilization_pct === null
        ? "Utilization percent is not available."
        : `Utilization context: ${properties.utilization_pct.toFixed(1)}%`,
      ...(properties.top_reasons ?? []),
    ],
    id: `school-pressure-${slugify(
      String(properties.attendance_area_id ?? properties.school_name ?? "area"),
    )}`,
    relatedLayers: ["School Utilization + Permit Pressure", "Development Hotspots"],
    statusBand: properties.school_pressure_watch_band,
    title: properties.school_name ?? "Attendance-Area Development Pressure",
  };
}

function groupIdForExplainSignal(signal: IndicatorExplainSignal): IndicatorCenterGroupId {
  const domain = signal.domain.toLowerCase();
  if (domain.includes("school")) return "school-context";
  if (domain.includes("flood")) return "flood-review";
  if (domain.includes("model")) return "model-research";
  if (domain.includes("permit") || domain.includes("development")) return "development-activity";
  if (domain.includes("transport") || domain.includes("utilit")) return "utility-infrastructure";
  return "data-gaps";
}

function domainForGroupId(groupId: IndicatorCenterGroupId, label = "") {
  const normalized = label.toLowerCase();
  if (normalized.includes("transport")) return "transportation_context";
  if (normalized.includes("utilit")) return "utility_readiness";
  if (normalized.includes("zoning") || normalized.includes("data")) return "data_readiness";
  switch (groupId) {
    case "development-activity":
      return "development_activity";
    case "flood-review":
      return "floodplain_review";
    case "model-research":
      return "model_research";
    case "school-context":
      return "school_pressure";
    case "utility-infrastructure":
      return "utility_readiness";
    case "data-gaps":
      return "data_readiness";
  }
}

function kpiIdForGroup(groupId: IndicatorCenterGroupId, label = "") {
  const normalized = label.toLowerCase();
  if (normalized.includes("transport")) return "transportation_context";
  if (normalized.includes("utilit")) return "utility_readiness";
  const ids: Record<IndicatorCenterGroupId, string> = {
    "data-gaps": "data_readiness",
    "development-activity": "observed_development_activity",
    "flood-review": "floodplain_review",
    "model-research": "model_research_status",
    "school-context": "school_pressure",
    "utility-infrastructure": "utility_readiness",
  };
  return ids[groupId];
}

function relatedLayersForGroup(groupId: IndicatorCenterGroupId, label = "") {
  const normalized = label.toLowerCase();
  if (normalized.includes("transport")) return ["Transportation Context"];
  if (normalized.includes("utilit")) return ["Utility Readiness"];
  const layers: Record<IndicatorCenterGroupId, string[]> = {
    "data-gaps": ["Data Still Needed", "Methodology"],
    "development-activity": ["Development Hotspots"],
    "flood-review": ["Floodplain Review"],
    "model-research": ["Model Lab Research Signals"],
    "school-context": ["School Utilization + Permit Pressure", "Development Hotspots"],
    "utility-infrastructure": ["Utility Readiness", "Transportation Context"],
  };
  return layers[groupId] ?? ["Methodology"];
}

function focusDomainForGroup(
  groupId: IndicatorCenterGroupId,
  label = "",
): CfsAiDashboardActions["focus_domain"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("transport")) return "transportation";
  if (normalized.includes("utilit")) return "utilities";
  if (normalized.includes("zoning")) return "zoning";
  const domains: Record<
    IndicatorCenterGroupId,
    NonNullable<CfsAiDashboardActions["focus_domain"]>
  > = {
    "data-gaps": "data_readiness",
    "development-activity": "permits",
    "flood-review": "flood",
    "model-research": "model_lab",
    "school-context": "schools",
    "utility-infrastructure": "utilities",
  };
  return domains[groupId];
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

function PermitIntelligencePanel({
  detail,
  onExplain,
  onInspect,
}: {
  detail: IndicatorIntelligenceResponse["development_activity_detail"] | null;
  onExplain: () => void;
  onInspect: () => void;
}) {
  const yearly = (detail?.yearly_counts ?? []).slice(-8);
  const latestChange =
    detail?.delta === null || detail?.delta === undefined
      ? "Trend change unavailable"
      : `${detail.delta >= 0 ? "+" : ""}${formatCount(detail.delta)} permits`;

  return (
    <section className="rounded-xl border border-[#68d8ff]/18 bg-black/24 p-4">
      <MissionSectionHeader
        eyebrow="Permit Intelligence Panel"
        icon={<TrendingUp className="h-4 w-4" />}
        title="Observed Development Activity"
        value={detail ? `${formatCount(detail.total_records)} permits` : "Loading"}
      />
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <PermitMetric label="Observed permit records" value={formatNullableCount(detail?.total_records)} />
        <PermitMetric label="Development-active parcels" value={formatNullableCount(detail?.active_parcels)} />
        <PermitMetric label="Latest year change" value={latestChange} />
        <PermitMetric label="Strongest year" value={formatYearPoint(detail?.strongest_year)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        <MiniChartCard
          caveat="Observed permit records by year; not a forecast."
          data={yearly.map((row) => ({ label: String(row.year), value: row.count }))}
          emptyLabel="Yearly permit trend is unavailable."
          title="Yearly Permit Trend"
        />
        <MiniChartCard
          caveat="Permit categories can include administrative or noisy source records."
          data={bucketRowsToChartData(detail?.top_permit_types)}
          emptyLabel="Permit type breakdown is unavailable."
          title="Permit Type Breakdown"
        />
        <MiniChartCard
          caveat="Segments are observed permit activity categories."
          data={bucketRowsToChartData(detail?.top_segments)}
          emptyLabel="Permit segment breakdown is unavailable."
          title="Permit Segment Breakdown"
        />
        <MiniChartCard
          caveat={`${detail?.top_geography_type ?? "Geography"} bucket from normalized CFS context.`}
          data={bucketRowsToChartData(detail?.top_geographies)}
          emptyLabel="Top geography breakdown is unavailable."
          title="Top Jurisdictions / Geographies"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300">
        <span>
          Review workload signal. Compare active permit areas with schools,
          floodplain review, utility readiness, transportation, and zoning context.
        </span>
        <span className="flex flex-wrap gap-1.5">
          <button
            className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff] transition hover:border-[#68d8ff]/40"
            onClick={onInspect}
            type="button"
          >
            Focus permits
          </button>
          <button
            className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200 transition hover:border-[#68d8ff]/35"
            onClick={onExplain}
            type="button"
          >
            Explain signal
          </button>
        </span>
      </div>
    </section>
  );
}

function PermitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ConstraintReviewPanel({
  onExplain,
  onInspect,
  rows,
}: {
  onExplain: (row: DomainReadinessRow) => void;
  onInspect: (row: DomainReadinessRow) => void;
  rows: DomainReadinessRow[];
}) {
  const reviewRows = rows.filter(
    (row) => !["development-activity", "school-context"].includes(row.groupId),
  );

  return (
    <section className="mt-4">
      <MissionSectionHeader
        eyebrow="Constraint Review Panel"
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Constraints, Infrastructure, and Governance"
        value={`${reviewRows.length} domains`}
      />
      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {reviewRows.map((row) => (
          <article
            className="rounded-xl border border-white/10 bg-black/24 p-3"
            key={`${row.domain}-${row.groupId}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{row.domain}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                  {row.coverage}
                </p>
              </div>
              <span className="rounded border border-[#f6d98e]/20 bg-[#f6d98e]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#f6d98e]">
                {row.dataStatus}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-300">
              {row.currentUse}
            </p>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              {row.caveat}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff]"
                onClick={() => onInspect(row)}
                type="button"
              >
                Focus
              </button>
              <button
                className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200"
                onClick={() => onExplain(row)}
                type="button"
              >
                Explain signal
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DomainReadinessMatrix({
  onExplain,
  onInspect,
  rows,
}: {
  onExplain: (row: DomainReadinessRow) => void;
  onInspect: (groupId: IndicatorCenterGroupId) => void;
  rows: DomainReadinessRow[];
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 xl:grid xl:grid-cols-[minmax(10rem,1fr)_8rem_8rem_9rem_minmax(12rem,1.2fr)_minmax(12rem,1.4fr)_8rem] xl:gap-3">
        <span>Domain</span>
        <span>Data Status</span>
        <span>Coverage</span>
        <span>Cadence</span>
        <span>Current Use</span>
        <span>Caveat</span>
        <span>Actions</span>
      </div>
      {rows.map((row) => (
        <div
          className="grid w-full min-w-0 gap-2 border-b border-white/10 px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.045] xl:grid-cols-[minmax(10rem,1fr)_8rem_8rem_9rem_minmax(12rem,1.2fr)_minmax(12rem,1.4fr)_8rem] xl:items-center xl:gap-3"
          key={row.domain}
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
          <span className="flex flex-wrap items-center gap-1.5">
            <button
              className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff] transition hover:border-[#68d8ff]/40 hover:bg-[#68d8ff]/15"
              onClick={() => onInspect(row.groupId)}
              type="button"
            >
              Inspect
            </button>
            <button
              className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
              onClick={() => onExplain(row)}
              type="button"
            >
              Explain signal
            </button>
          </span>
        </div>
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
  onExplain,
  onInspect,
  signal,
}: {
  highlighted?: boolean;
  onExplain: () => void;
  onInspect: () => void;
  signal: ExecutiveSignalCardModel;
}) {
  return (
    <article
      className={cn(
        "cfs-command-card min-h-[10rem] rounded-lg p-3 text-left transition hover:-translate-y-0.5 hover:border-[#68d8ff]/30 hover:bg-white/[0.055] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/60",
        highlighted &&
          "border-[#f6d98e]/60 bg-[#f6d98e]/[0.08] shadow-[0_0_28px_rgba(246,217,142,0.18)]",
        getSignalToneClass(signal.tone),
      )}
    >
      <button
        className="block w-full text-left"
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
      <button
        className="mt-3 inline-flex rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#b7f0ff] transition hover:border-[#68d8ff]/45 hover:bg-[#68d8ff]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/60"
        onClick={onExplain}
        type="button"
      >
        Explain signal
      </button>
    </article>
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
  onExplain,
  onInspect,
  row,
}: {
  onExplain: () => void;
  onInspect: () => void;
  row: AttentionQueueRow;
}) {
  return (
    <div className="grid w-full gap-2 border-b border-white/10 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.045] lg:grid-cols-[8.5rem_minmax(12rem,1fr)_12rem_7rem_minmax(10rem,1fr)_8rem] lg:items-center">
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
      <span className="flex flex-wrap items-center gap-1.5">
        <button
          className="inline-flex shrink-0 items-center gap-1 rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff] transition hover:border-[#68d8ff]/40 hover:bg-[#68d8ff]/15"
          onClick={onInspect}
          type="button"
        >
          Inspect
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
          onClick={onExplain}
          type="button"
        >
          Explain signal
        </button>
      </span>
    </div>
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
  onExplain,
  onInspect,
  state,
}: {
  features: SchoolPressureFeature[];
  onExplain: (feature: SchoolPressureFeature | null) => void;
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
          onExplain={() => onExplain(null)}
          value={
            state.status === "loading"
              ? "Loading"
              : formatCount(state.summary.areas_analyzed)
          }
        />
        <SchoolPressureKpi
          label="Elevated review signal"
          onExplain={() => onExplain(null)}
          value={formatCount(state.summary.elevated_review_count)}
        />
        <SchoolPressureKpi
          label="Missing utilization data"
          onExplain={() => onExplain(null)}
          value={formatCount(state.summary.data_needed_count)}
        />
        <SchoolPressureKpi
          label="Watched-area residential permits"
          onExplain={() => onExplain(null)}
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
        <div className="hidden border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid lg:grid-cols-[minmax(12rem,1fr)_6rem_8rem_8rem_8rem] lg:gap-2">
          <span>School / Area</span>
          <span>Level</span>
          <span>Watch Band</span>
          <span>Recent Permits</span>
          <span>Actions</span>
        </div>
        {(watchRows.length ? watchRows : features.slice(0, 3)).map((feature) => (
          <div
            className="grid w-full min-w-0 gap-2 border-b border-white/10 px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.045] lg:grid-cols-[minmax(12rem,1fr)_6rem_8rem_8rem_8rem] lg:items-center lg:gap-2"
            key={`${feature.properties.attendance_area_id ?? feature.properties.school_name ?? "school-pressure"}-${feature.properties.school_level ?? "level"}`}
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
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#8fe7ff] transition hover:border-[#68d8ff]/40 hover:bg-[#68d8ff]/15"
                onClick={() => onInspect(feature)}
                type="button"
              >
                Inspect
              </button>
              <button
                className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
                onClick={() => onExplain(feature)}
                type="button"
              >
                Explain signal
              </button>
            </span>
          </div>
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

function SchoolPressureKpi({
  label,
  onExplain,
  value,
}: {
  label: string;
  onExplain: () => void;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <button
        className="mt-3 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-200 transition hover:border-[#68d8ff]/35 hover:text-[#b7f0ff]"
        onClick={onExplain}
        type="button"
      >
        Explain signal
      </button>
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

function formatYearPoint(value?: { count?: number; year?: number } | null) {
  return value?.year
    ? `${value.year} / ${formatNullableCount(value.count)}`
    : "Not available";
}

function bucketRowsToChartData(
  rows?: Array<{ count: number; label: string }> | null,
): ChartDatum[] {
  return (rows ?? []).map((row) => ({ label: row.label, value: row.count }));
}

function permitEvidenceForDetail(
  detail?: IndicatorIntelligenceResponse["development_activity_detail"] | null,
) {
  if (!detail) return ["Permit intelligence detail is loading or unavailable."];
  return [
    `${formatCount(detail.total_records)} permit records across ${formatCount(detail.active_parcels)} active parcels.`,
    detail.delta === null || detail.delta === undefined
      ? "Recent year change is unavailable."
      : `Latest change: ${detail.delta >= 0 ? "+" : ""}${formatCount(detail.delta)} permits.`,
    `Top permit types: ${detail.top_permit_types
      .slice(0, 3)
      .map((row) => `${row.label} (${formatCount(row.count)})`)
      .join(", ") || "not available"}.`,
  ];
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
