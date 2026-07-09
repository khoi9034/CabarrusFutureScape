"use client";

import {
  Calculator,
  Database,
  Gauge,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AskCfsPanel } from "@/components/dashboard/AskCfsPanel";
import { useDashboardState } from "@/hooks/useDashboardState";
import {
  askCfsEconomicsPowerBiToolPrompts,
  askCfsEconomicsPrintPrompts,
  askCfsEconomicsWorkspacePrompts,
} from "@/lib/aiSearchService";
import { buildApiUrl, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getEconomicsEnterpriseExport,
  getEconomicsIntelligence,
  getEconomicsPowerBiExport,
} from "@/lib/economicsIntelligenceService";
import type {
  CfsAiPowerBiActions,
  CfsAiSearchResponse,
  EconomicsEnterpriseExportResponse,
  EconomicsIntelligenceResponse,
  EconomicsKpi,
  EconomicsParcelSignal,
  EconomicsPowerBiExportResponse,
  EconomicsReadinessRow,
  EconomicsScenarioInput,
  EconomicsScenarioOutput,
  EconomicsSegmentSummary,
  EconomicsScenarioTemplate,
} from "@/types/api";

export function EconomicsShell() {
  const { economicsSection, setEconomicsSection } = useDashboardState();
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [enterpriseExport, setEnterpriseExport] =
    useState<EconomicsEnterpriseExportResponse | null>(null);
  const [powerBiExport, setPowerBiExport] =
    useState<EconomicsPowerBiExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [reportBucketItems, setReportBucketItems] = useState<ReportBucketItem[]>([]);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (economicsSection === "workspace" || economicsSection === "enterprise") {
      setEconomicsSection("tools");
    }
  }, [economicsSection, setEconomicsSection]);

  useEffect(() => {
    let mounted = true;
    void getEconomicsIntelligence()
      .then((response) => {
        if (!mounted) return;
        setIntelligence(response);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Economics intelligence is unavailable.",
        );
      });
    void getEconomicsEnterpriseExport()
      .then((response) => {
        if (mounted) setEnterpriseExport(response);
      })
      .catch(() => {
        if (mounted) setEnterpriseExport(null);
      });
    void getEconomicsPowerBiExport()
      .then((response) => {
        if (mounted) setPowerBiExport(response);
      })
      .catch(() => {
        if (mounted) setPowerBiExport(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const intelligenceSignals = intelligence?.parcel_economic_signals ?? intelligence?.signals ?? [];
  const exportSignals = useMemo(
    () => economicsSignalsFromPowerBiExport(powerBiExport),
    [powerBiExport],
  );
  const signals = intelligenceSignals.length ? intelligenceSignals : exportSignals;
  const watchlist =
    intelligence?.underbuilt_watchlist?.length
      ? intelligence.underbuilt_watchlist
      : intelligence?.watchlist?.length
        ? intelligence.watchlist
        : signals.filter((signal) =>
            [
              "Underbuilt Redevelopment Candidate",
              "Tax-Base Opportunity",
              "High Value but Infrastructure-Constrained",
              "Needs More Data Before Recommendation",
            ].includes(signal.opportunity_class),
          ).slice(0, 25);
  const selectedSignals = signals.filter((signal) =>
    selectedSignalIds.includes(signal.parcel_id),
  );
  const toggleSelectedSignal = (signal: EconomicsParcelSignal) => {
    setSelectedSignalIds((current) =>
      current.includes(signal.parcel_id)
        ? current.filter((id) => id !== signal.parcel_id)
        : [...current, signal.parcel_id],
    );
  };
  const addReportBucketItem = (item: ReportBucketItemInput) => {
    const bucketItem: ReportBucketItem = {
      ...item,
      created_at: item.created_at ?? new Date().toISOString(),
      selected_for_print: item.selected_for_print ?? true,
    };
    setReportBucketItems((current) =>
      current.some(
        (existing) =>
          existing.id === bucketItem.id ||
          (existing.title === bucketItem.title &&
            existing.type === bucketItem.type &&
            existing.content === bucketItem.content),
      )
        ? current
        : [bucketItem, ...current],
    );
  };
  const removeReportBucketItem = (id: string) => {
    setReportBucketItems((current) => current.filter((item) => item.id !== id));
  };
  const toggleReportBucketPrint = (id: string) => {
    setReportBucketItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, selected_for_print: !item.selected_for_print }
          : item,
      ),
    );
  };
  const setAllReportBucketPrint = (selected: boolean) => {
    setReportBucketItems((current) =>
      current.map((item) => ({ ...item, selected_for_print: selected })),
    );
  };
  const activeEconomicsSection =
    economicsSection === "workspace" || economicsSection === "enterprise"
      ? "tools"
      : economicsSection;

  return (
    <main className="econ-shell relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 lg:p-5">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
        <div className="no-print flex justify-end">
          <EconomicsTutorialButton onClick={() => setTutorialOpen(true)} />
        </div>
        {error ? (
          <div className="rounded-xl border border-[var(--econ-risk)]/30 bg-[var(--econ-risk)]/10 px-4 py-3 text-sm text-[#ffd1c2]">
            Local economics data is unavailable. Confirm FastAPI is running at
            http://127.0.0.1:8000 and /economics/intelligence is returning.
            {" "}
            <button
              className="font-semibold underline underline-offset-4"
              onClick={() => window.location.reload()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
        {activeEconomicsSection === "overview" ? (
          <ExecutiveBriefPage intelligence={intelligence} />
        ) : null}
        {activeEconomicsSection === "tools" ? (
          <PowerBiToolsPage
            dataReadiness={intelligence?.data_readiness ?? []}
            exportPayload={enterpriseExport}
            inputs={intelligence?.scenario_inputs ?? []}
            onClearSelection={() => setSelectedSignalIds([])}
            onAddReportBucketItem={addReportBucketItem}
            onClearReportBucket={() => setReportBucketItems([])}
            onNavigate={setEconomicsSection}
            onRemoveReportBucketItem={removeReportBucketItem}
            onStartTutorial={() => setTutorialOpen(true)}
            onToggleReportBucketPrint={toggleReportBucketPrint}
            onToggleSignal={toggleSelectedSignal}
            outputs={intelligence?.scenario_outputs ?? []}
            powerBiPayload={powerBiExport}
            reportBucketItems={reportBucketItems}
            scenarioOutputs={intelligence?.scenario_outputs ?? []}
            scenarios={intelligence?.scenario_templates ?? []}
            selectedSignalIds={selectedSignalIds}
            selectedSignals={selectedSignals}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {activeEconomicsSection === "dashboard" ? (
          <EconomicDashboardPage
            intelligence={intelligence}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {activeEconomicsSection === "print" ? (
          <EconomicsPrintPage
            intelligence={intelligence}
            onClearReportBucket={() => setReportBucketItems([])}
            onNavigate={setEconomicsSection}
            onRemoveReportBucketItem={removeReportBucketItem}
            onSetAllReportBucketPrint={setAllReportBucketPrint}
            onToggleReportBucketPrint={toggleReportBucketPrint}
            reportBucketItems={reportBucketItems}
            selectedSignals={selectedSignals}
          />
        ) : null}
        {tutorialOpen ? (
          <EconomicsTutorialOverlay
            key={activeEconomicsSection}
            onClose={() => setTutorialOpen(false)}
            onNavigate={setEconomicsSection}
            page={activeEconomicsSection}
          />
        ) : null}
      </div>
    </main>
  );
}

type EconomicsTutorialPage = "overview" | "tools" | "dashboard" | "print";

type EconomicsTutorialStep = {
  actionSection?: EconomicsTutorialPage;
  body: string;
  id: string;
  keepTutorialOpenOnAction?: boolean;
  optionalActionLabel?: string;
  optionalActionTargetSelector?: string;
  targetSelector: string;
  title: string;
  why?: string;
};

function EconomicsTutorialButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="rounded-full border border-[var(--econ-border)] bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] hover:text-[#ffe6a6]"
      onClick={onClick}
      type="button"
    >
      Tutorial
    </button>
  );
}

type TutorialBox = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type TutorialPlacement = {
  cardStyle: CSSProperties;
  highlightRect: TutorialBox | null;
};

const TUTORIAL_VIEWPORT_MARGIN = 20;
const TUTORIAL_TARGET_GAP = 16;
const TUTORIAL_HEADER_FALLBACK = 96;
const TUTORIAL_CARD_FALLBACK = { height: 280, width: 360 };

function clampTutorialValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getTutorialHeaderOffset() {
  const header = document.querySelector("header");
  const rect = header?.getBoundingClientRect();
  if (rect && rect.bottom > 0 && rect.top <= TUTORIAL_VIEWPORT_MARGIN) {
    return Math.min(140, Math.max(TUTORIAL_HEADER_FALLBACK, rect.bottom));
  }
  return TUTORIAL_HEADER_FALLBACK;
}

function boxesOverlap(a: TutorialBox, b: TutorialBox) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function computeTutorialPlacement(targetRect: DOMRect | null, cardRect: DOMRect | null): TutorialPlacement {
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const margin = TUTORIAL_VIEWPORT_MARGIN;
  const safeTop = getTutorialHeaderOffset() + margin;
  const safeArea = {
    bottom: viewportHeight - margin,
    left: margin,
    right: viewportWidth - margin,
    top: safeTop,
  };
  const maxWidth = Math.max(240, Math.min(460, viewportWidth - margin * 2));
  const maxHeight = Math.max(180, viewportHeight - safeTop - margin);
  const cardWidth = Math.min(cardRect?.width || TUTORIAL_CARD_FALLBACK.width, maxWidth);
  const cardHeight = Math.min(cardRect?.height || TUTORIAL_CARD_FALLBACK.height, maxHeight);

  const centered = {
    left: clampTutorialValue((viewportWidth - cardWidth) / 2, safeArea.left, safeArea.right - cardWidth),
    top: clampTutorialValue(safeArea.top + (safeArea.bottom - safeArea.top - cardHeight) / 2, safeArea.top, safeArea.bottom - cardHeight),
  };

  if (!targetRect) {
    return {
      cardStyle: { left: centered.left, maxHeight, maxWidth, top: centered.top },
      highlightRect: null,
    };
  }

  const targetBox = {
    height: targetRect.height + 16,
    left: targetRect.left - 8,
    top: targetRect.top - 8,
    width: targetRect.width + 16,
  };
  const candidates = [
    { left: targetRect.right + TUTORIAL_TARGET_GAP, top: targetRect.top + targetRect.height / 2 - cardHeight / 2 },
    { left: targetRect.left - cardWidth - TUTORIAL_TARGET_GAP, top: targetRect.top + targetRect.height / 2 - cardHeight / 2 },
    { left: targetRect.left + targetRect.width / 2 - cardWidth / 2, top: targetRect.bottom + TUTORIAL_TARGET_GAP },
    { left: targetRect.left + targetRect.width / 2 - cardWidth / 2, top: targetRect.top - cardHeight - TUTORIAL_TARGET_GAP },
    centered,
  ];
  const chosen =
    candidates.find((candidate) => {
      const cardBox = { height: cardHeight, left: candidate.left, top: candidate.top, width: cardWidth };
      return (
        candidate.left >= safeArea.left &&
        candidate.left + cardWidth <= safeArea.right &&
        candidate.top >= safeArea.top &&
        candidate.top + cardHeight <= safeArea.bottom &&
        !boxesOverlap(cardBox, targetBox)
      );
    }) ?? centered;

  const highlightLeft = clampTutorialValue(targetBox.left, 8, viewportWidth - 8);
  const highlightTop = clampTutorialValue(targetBox.top, 8, viewportHeight - 8);
  const highlightRight = clampTutorialValue(targetBox.left + targetBox.width, 8, viewportWidth - 8);
  const highlightBottom = clampTutorialValue(targetBox.top + targetBox.height, 8, viewportHeight - 8);

  return {
    cardStyle: {
      left: clampTutorialValue(chosen.left, safeArea.left, safeArea.right - cardWidth),
      maxHeight,
      maxWidth,
      top: clampTutorialValue(chosen.top, safeArea.top, safeArea.bottom - cardHeight),
    },
    highlightRect:
      highlightRight > highlightLeft && highlightBottom > highlightTop
        ? {
            height: highlightBottom - highlightTop,
            left: highlightLeft,
            top: highlightTop,
            width: highlightRight - highlightLeft,
          }
        : null,
  };
}

function EconomicsTutorialOverlay({
  onClose,
  onNavigate,
  page,
}: {
  onClose: () => void;
  onNavigate: (section: EconomicsTutorialPage) => void;
  page: EconomicsTutorialPage;
}) {
  const steps = economicsTutorialSteps[page];
  const [stepIndex, setStepIndex] = useState(0);
  const [placement, setPlacement] = useState<TutorialPlacement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex === steps.length - 1;
  const toolsPhaseIndex = Math.min(4, Math.floor(stepIndex / 2));

  useEffect(() => {
    let frame = 0;
    let secondFrame = 0;
    const measureTarget = () => {
      const target = document.querySelector(step.targetSelector);
      setPlacement(
        computeTutorialPlacement(
          target ? target.getBoundingClientRect() : null,
          cardRef.current?.getBoundingClientRect() ?? null,
        ),
      );
    };
    const queueMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureTarget);
    };
    const scrollThenMeasure = () => {
      const target = document.querySelector(step.targetSelector);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      frame = window.requestAnimationFrame(() => {
        measureTarget();
        secondFrame = window.requestAnimationFrame(measureTarget);
      });
    };
    scrollThenMeasure();
    cardRef.current?.focus();
    window.addEventListener("resize", queueMeasure);
    window.addEventListener("scroll", queueMeasure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", queueMeasure);
      window.removeEventListener("scroll", queueMeasure, true);
    };
  }, [step.targetSelector]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const cardStyle = placement?.cardStyle ?? {
    left: "50%",
    maxHeight: "calc(100vh - 7rem)",
    maxWidth: "calc(100vw - 2rem)",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };

  return (
    <div className="no-print fixed inset-0 z-[80]" role="presentation">
      <button
        aria-label="Close tutorial backdrop"
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
        type="button"
      />
      {placement?.highlightRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-2xl border-2 border-[var(--econ-gold)] shadow-[0_0_0_9999px_rgba(0,0,0,0.18),0_0_36px_rgba(216,184,106,0.5)]"
          style={{
            height: placement.highlightRect.height,
            left: placement.highlightRect.left,
            top: placement.highlightRect.top,
            width: placement.highlightRect.width,
          }}
        />
      ) : null}
      <div
        aria-label="CFS Economics tutorial"
        aria-modal="true"
        className="fixed w-[min(28.75rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[var(--econ-gold)]/45 bg-[#111722] p-4 text-[var(--econ-text)] shadow-2xl"
        ref={cardRef}
        role="dialog"
        style={cardStyle}
        tabIndex={-1}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--econ-muted)]">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h2 className="mt-2 text-base font-semibold">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">{step.body}</p>
        {step.why ? (
          <p className="mt-2 text-xs leading-5 text-[#f7dc93]">
            <span className="font-semibold text-[#ffe6a6]">Why it matters: </span>
            {step.why}
          </p>
        ) : null}
        {page === "tools" ? (
          <div className="mt-3 grid grid-cols-5 gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--econ-muted)]">
            {["Select rows", "Download CSVs", "Build chart", "Add canvas", "Print"].map((phase, index) => (
              <span
                className={`rounded-full px-2 py-1 text-center ${
                  index === toolsPhaseIndex
                    ? "bg-[var(--econ-gold)]/20 text-[#ffe6a6]"
                    : "bg-white/[0.04]"
                }`}
                key={phase}
              >
                {phase}
              </span>
            ))}
          </div>
        ) : null}
        {step.optionalActionLabel && (step.actionSection || step.optionalActionTargetSelector) ? (
          <button
            className="mt-3 rounded-xl border border-[var(--econ-gold)]/45 bg-[var(--econ-gold)]/12 px-3 py-2 text-sm font-semibold text-[#ffe6a6]"
            onClick={() => {
              if (step.actionSection) {
                onNavigate(step.actionSection);
                if (!step.keepTutorialOpenOnAction) onClose();
                return;
              }
              document
                .querySelector(step.optionalActionTargetSelector ?? step.targetSelector)
                ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }}
            type="button"
          >
            {step.optionalActionLabel}
          </button>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold disabled:opacity-45"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            type="button"
          >
            Back
          </button>
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold"
            onClick={() => (isLast ? onClose() : setStepIndex((index) => Math.min(steps.length - 1, index + 1)))}
            type="button"
          >
            {isLast ? "Finish" : "Next"}
          </button>
          <button
            className="rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-[var(--econ-muted)]"
            onClick={onClose}
            type="button"
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

function PowerBiToolsPage({
  dataReadiness,
  exportPayload,
  inputs,
  onAddReportBucketItem,
  onClearSelection,
  onClearReportBucket,
  onNavigate,
  onRemoveReportBucketItem,
  onStartTutorial,
  onToggleReportBucketPrint,
  onToggleSignal,
  outputs,
  powerBiPayload,
  reportBucketItems,
  scenarioOutputs,
  scenarios,
  selectedSignalIds,
  selectedSignals,
  signals,
  watchlist,
}: {
  dataReadiness: EconomicsReadinessRow[];
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => void;
  onClearSelection: () => void;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onStartTutorial: () => void;
  onToggleReportBucketPrint: (id: string) => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  reportBucketItems: ReportBucketItem[];
  scenarioOutputs: EconomicsScenarioOutput[];
  scenarios: EconomicsScenarioTemplate[];
  selectedSignalIds: string[];
  selectedSignals: EconomicsParcelSignal[];
  signals: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
}) {
  const focusTools = () =>
    document
      .getElementById("economics-tool-workspace")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [askPowerBiAction, setAskPowerBiAction] = useState<PowerBiAskActionRequest | null>(null);
  const [lastAskResponse, setLastAskResponse] = useState<CfsAiSearchResponse | null>(null);
  const askPowerBiActionId = useRef(0);
  const reportAvailability = useMemo(
    () =>
      buildReportDataAvailability(
        powerBiPayload,
        signals,
        dataReadiness,
        outputs,
      ),
    [dataReadiness, outputs, powerBiPayload, signals],
  );
  const handleAskCfsResponse = (response: CfsAiSearchResponse) => {
    setLastAskResponse(response);
    const actions = response.powerbi_actions;
    if (!actions || actions.action_type === "none") return;
    askPowerBiActionId.current += 1;
    setAskPowerBiAction({ actions, id: askPowerBiActionId.current });
    requestAnimationFrame(() =>
      document
        .querySelector('[data-econ-tour="generated-report-preview"], [data-econ-tour="powerbi-practice-pack"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  return (
    <>
      <PageHeader
        kicker="Power BI & Tools"
        title="Power BI & Tools"
        text="Generate a Power BI-style report preview, save it to the bucket, then send it to Print."
        tourId="powerbi-tools-header"
      >
        <button
          className="mt-4 rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/15 px-4 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
          onClick={onStartTutorial}
          type="button"
        >
          Start Tutorial
        </button>
      </PageHeader>
      <EconPanel title="Ask CFS Economics" kicker="Ask first" tourId="tools-ask-cfs">
        <p className="mb-3 text-sm leading-6 text-[var(--econ-muted)]">
          Ask what to build, which rows to select, or how to turn CFS Economics into a Power BI report.
        </p>
        <AskCfsPanel
          appMode="economics"
          onResponse={handleAskCfsResponse}
          suggestedPromptsOverride={askCfsEconomicsPowerBiToolPrompts}
          visiblePromptCount={6}
        />
        {lastAskResponse ? (
          <button
            className="mt-3 rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
            onClick={() =>
              onAddReportBucketItem(bucketItemFromAskResponse(lastAskResponse))
            }
            type="button"
          >
            Add Ask CFS answer to Report Bucket
          </button>
        ) : null}
      </EconPanel>
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/[0.07] px-4 py-3 text-sm leading-6 text-[#f7dc93]">
        <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
        <span>Screening-level economics: not an official appraisal, tax bill, fiscal impact study, or project approval recommendation.</span>
      </section>
      <PowerBiReportGenerator
        askPowerBiAction={askPowerBiAction}
        availability={reportAvailability}
        dataReadiness={dataReadiness}
        onAddReportBucketItem={onAddReportBucketItem}
        onNavigate={onNavigate}
        outputs={outputs}
        payload={powerBiPayload}
        signals={signals}
      />
      <ReportBucketPanel
        items={reportBucketItems}
        onClear={onClearReportBucket}
        onOpenPrint={() => onNavigate("print")}
        onRemove={onRemoveReportBucketItem}
        onTogglePrint={onToggleReportBucketPrint}
        title="Report Bucket"
      />
      <details className="rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] p-4" data-econ-tour="advanced-tools">
        <summary className="cursor-pointer text-base font-semibold text-[var(--econ-text)]">
          Advanced Manual Tools
          <span className="ml-2 text-sm font-normal text-[var(--econ-muted)]">
            CSV exports, row selection, manual chart builder, report canvas, scenario tools.
          </span>
        </summary>
        <div className="mt-4 grid gap-4">
          <EconPanel title="Three-step Power BI workflow" kicker="Manual path">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricPill label="CSV tables" value="7" />
              <MetricPill label="Starter relationships" value="2" />
              <MetricPill label="Report pages" value="4" />
              <MetricPill label="Suggested measures" value="5" />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {["1. Select rows", "2. Download CSV tables", "3. Build chart + canvas"].map((step) => (
                <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 px-3 py-2 text-xs font-semibold text-[var(--econ-muted)]" key={step}>
                  {step}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/15 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]" onClick={focusTools} type="button">
                Download CSV Tables
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={focusTools} type="button">
                Preview table schema
              </button>
            </div>
          </EconPanel>
          <EconomicsWorkspacePage
            dataReadiness={dataReadiness}
            embedded
            onClearSelection={onClearSelection}
            onUseSelectedInTools={focusTools}
            onSendSelectedToPrint={() => onNavigate("print")}
            onToggleSignal={onToggleSignal}
            scenarioOutputs={scenarioOutputs}
            selectedSignalIds={selectedSignalIds}
            selectedSignals={selectedSignals}
            signals={signals}
            tourRowSelectionId="economics-row-selection"
            tourSelectedTrayId="selected-rows-tray"
            watchlist={watchlist}
          />
          <section id="economics-tool-workspace">
            <EnterpriseWorkspacePage
              askPowerBiAction={askPowerBiAction}
              embedded
              exportPayload={exportPayload}
              reportAvailability={reportAvailability}
              inputs={inputs}
              onAddReportBucketItem={onAddReportBucketItem}
              onClearReportBucket={onClearReportBucket}
              onNavigate={onNavigate}
              onRemoveReportBucketItem={onRemoveReportBucketItem}
              onToggleReportBucketPrint={onToggleReportBucketPrint}
              outputs={outputs}
              powerBiPayload={powerBiPayload}
              reportBucketItems={reportBucketItems}
              scenarios={scenarios}
              selectedSignals={selectedSignals}
              showSelectedRowsStep={false}
            />
          </section>
        </div>
      </details>
    </>
  );
}

function ExecutiveBriefPage({
  intelligence,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
}) {
  const summary = intelligence?.summary;
  return (
    <>
      <section className="econ-hero rounded-2xl p-6 md:p-8" data-econ-tour="overview-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="econ-eyebrow">Overview</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--econ-text)] md:text-5xl">
              CFS Economics
            </h1>
            <p className="mt-4 max-w-4xl text-base leading-8 text-[var(--econ-muted)]">
              Parcel-based economic intelligence for growth, tax-base
              opportunity, infrastructure burden, and fiscal/service tradeoffs.
            </p>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--econ-muted)]">
              Traditional GIS can show where things are. CFS Economics helps
              explain what those places mean economically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" data-econ-tour="data-mode">
            <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
            <EconChip>{summary?.as_of ? `As of ${formatDate(summary.as_of)}` : "Freshness pending"}</EconChip>
          </div>
        </div>
      </section>

      <PageHelper text="Understand the workflow." />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {executiveCards.map((card) => (
          <EconCard key={card.title}>
            <card.icon className="h-5 w-5 text-[var(--econ-gold)]" />
            <h2 className="mt-3 text-base font-semibold text-[var(--econ-text)]">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
              {card.text}
            </p>
          </EconCard>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <EconPanel title="What CFS Economics does" kicker="Plain-language purpose">
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            CFS Economics provides screening-level economic intelligence. It
            turns parcel value, acreage, permit context, constraints, and data
            confidence into a parcel economic baseline, underbuilt
            redevelopment watchlist, tax-base opportunity view, and
            fiscal/service burden context.
          </p>
        </EconPanel>
        <EconPanel title="What data it uses" kicker="Source context">
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            The workflow uses parcel/tax fields, acreage, jurisdiction or
            geography labels, permit activity where available, constraint
            context, scenario assumptions, and enterprise export-ready tables.
          </p>
        </EconPanel>
        <EconPanel title="Local live data vs portfolio demo" kicker="Data mode">
          <div className="space-y-3 text-sm leading-7 text-[var(--econ-muted)]">
            <p>
              <span className="font-semibold text-[var(--econ-text)]">Local mode:</span>{" "}
              Uses the local FastAPI backend and local PostGIS economics data.
            </p>
            <p>
              <span className="font-semibold text-[var(--econ-text)]">Demo mode:</span>{" "}
              Uses a sanitized cached demo extract for portfolio review.
            </p>
          </div>
        </EconPanel>
        <EconPanel title="How to use CFS Economics" kicker="Simple workflow" tourId="workflow">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Start in Power BI & Tools.</li>
            <li>Review tables, select rows, and export CSVs.</li>
            <li>Open Economic Dashboard for KPIs and charts.</li>
            <li>Use Power BI & Tools for planning-model exports and decision packs.</li>
            <li>Print an economic snapshot.</li>
          </ol>
        </EconPanel>
        <EconPanel title="County economics signal" kicker="Current baseline">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Parcels analyzed" value={formatNumber(summary?.total_parcels_analyzed)} />
            <MiniMetric label="Assessed value" value={currency(summary?.total_assessed_value)} />
            <MiniMetric label="Underbuilt watch" value={formatNumber(summary?.underbuilt_candidate_count)} />
          </div>
          <p className="mt-4 text-sm leading-7 text-[var(--econ-muted)]">
            CFS Economics turns parcel, tax, permit, infrastructure, and
            constraint context into screening-level scorecards for consulting
            review. It is not an approval recommendation, formal appraisal, tax
            bill, or full fiscal impact study.
          </p>
        </EconPanel>
        <EconPanel title="What outputs it creates" kicker="Presentation outputs">
          <ul className="space-y-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Power BI & Tools tables for parcel economics and watchlists.</li>
            <li>Economic Dashboard indicators and Ask CFS briefings.</li>
            <li>Power BI-ready JSON and CSV table exports.</li>
            <li>Planning-model dimensions, measures, scenarios, and decision-pack payloads.</li>
            <li>Printable economic snapshot for presentation or review.</li>
          </ul>
        </EconPanel>
        <EconPanel title="What it is not" kicker="Safe-use caveat">
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            CFS Economics is not an official appraisal, tax bill, fiscal impact
            study, or approval recommendation. It is a decision-support workflow
            for identifying where deeper diligence is needed.
          </p>
        </EconPanel>
        <EconPanel title="Why this matters" kicker="Portfolio reviewer note">
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            CFS Economics connects parcel economics, permit activity,
            constraints, scenario logic, data confidence, a Power BI Desktop
            export pack, planning model schema, and decision-pack outputs into a
            screening-level decision-support platform.
          </p>
        </EconPanel>
        <EconPanel title="Decision questions" kicker="What it helps answer">
          <div className="grid gap-2">
            {decisionQuestions.map((question) => (
              <div
                className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2 text-sm text-[var(--econ-text)]"
                key={question}
              >
                {question}
              </div>
            ))}
          </div>
        </EconPanel>
      </section>
    </>
  );
}

function EconomicDashboardPage({
  intelligence,
  signals,
  watchlist,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
  signals: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
}) {
  const [selectedSegment, setSelectedSegment] = useState("All");
  const [selectedGeography, setSelectedGeography] = useState("All");
  const [selectedOpportunityClass, setSelectedOpportunityClass] = useState("All");
  const [selectedDataConfidence, setSelectedDataConfidence] = useState("All");
  const kpis = intelligence?.kpis ?? [];
  const filteredSignals = filterEconomicSignals(signals, {
    dataConfidence: selectedDataConfidence,
    economicSegment: selectedSegment,
    geography: selectedGeography,
    opportunityClass: selectedOpportunityClass,
  });
  const filteredWatchlist = filterEconomicSignals(watchlist, {
    dataConfidence: selectedDataConfidence,
    economicSegment: selectedSegment,
    geography: selectedGeography,
    opportunityClass: selectedOpportunityClass,
  });
  const filteredScenarios = intelligence?.scenario_outputs ?? [];
  const segmentRows = buildSegmentSummaryRows(intelligence, signals);
  const selectedSegmentRows =
    selectedSegment === "All"
      ? segmentRows
      : segmentRows.filter((row) => row.segment === selectedSegment);
  const valueBars =
    selectedSegment === "All"
      ? segmentRows.map((row) => ({
          label: row.segment,
          value: row.median_value_per_acre ?? 0,
        }))
      : topSignals(filteredSignals, "value_per_acre").map((signal) => ({
          label: signal.geography_label ?? signal.parcel_id,
          value: signal.value_per_acre ?? 0,
        }));
  const ratioBars =
    selectedSegment === "All"
      ? segmentRows.map((row) => ({
          label: row.segment,
          value: row.median_improvement_to_land_ratio ?? 0,
        }))
      : topSignals(filteredSignals, "improvement_to_land_ratio").map((signal) => ({
          label: signal.geography_label ?? signal.parcel_id,
          value: signal.improvement_to_land_ratio ?? 0,
        }));
  const classBars = filteredSignals.length
    ? countRowsBy(filteredSignals, (signal) => signal.opportunity_class)
    : (intelligence?.opportunity_class_breakdown?.map((row) => ({
        label: row.opportunity_class,
        value: row.count,
      })) ?? []);
  const confidenceBars = countRowsBy(filteredSignals, (signal) => signal.economic_data_confidence);
  const scenarioRows = scenarioMatrixRows(filteredScenarios);
  const burdenRows = fiscalBurdenRows(filteredSignals, filteredScenarios);
  const segmentOptions = ["All", ...uniqueValues([...segmentRows.map((row) => row.segment), ...signals.map((signal) => signalSegment(signal))])];
  const geographyOptions = ["All", ...uniqueValues(signals.map((signal) => signal.geography_label).filter(Boolean))];
  const opportunityOptions = ["All", ...uniqueValues(signals.map((signal) => signal.opportunity_class))];
  const confidenceOptions = ["All", ...uniqueValues(signals.map((signal) => signal.economic_data_confidence))];
  const summary = intelligence?.summary;
  const resetFilters = () => {
    setSelectedSegment("All");
    setSelectedGeography("All");
    setSelectedOpportunityClass("All");
    setSelectedDataConfidence("All");
  };
  const askCfsFilterContext = useMemo(
    () => ({
      economic_segment: selectedSegment,
      geography: selectedGeography,
      opportunity_class: selectedOpportunityClass,
      data_confidence: selectedDataConfidence,
      filtered_signal_count: filteredSignals.length,
      filtered_watchlist_rows: filteredWatchlist.length,
    }),
    [
      filteredSignals.length,
      filteredWatchlist.length,
      selectedDataConfidence,
      selectedGeography,
      selectedOpportunityClass,
      selectedSegment,
    ],
  );

  return (
    <>
      <PageHeader
        kicker="Economic Dashboard"
        title="Economic Dashboard"
        text="Growth and tax-base intelligence with segment-aware visuals and slicers."
      />
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] px-4 py-3">
        <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
        {intelligence?.context_freshness ? (
          <EconChip>{intelligence.context_freshness.replaceAll("_", " ")}</EconChip>
        ) : null}
        <EconChip>Updated {formatDate(intelligence?.as_of ?? summary?.as_of)}</EconChip>
        <span className="text-xs leading-5 text-[var(--econ-muted)]">
          Screening-level economics: not an official appraisal, tax bill, fiscal impact study, or project approval recommendation.
        </span>
      </section>
      {intelligence?.context_freshness === "fallback_partial" ? (
        <EconPanel title="Economics data is currently using a partial fallback" kicker="Live data diagnostic">
          <div className="grid gap-2 text-sm leading-6 text-[var(--econ-muted)] md:grid-cols-2">
            <MiniMetric label="Source mode" value={intelligence.source_mode ?? intelligence.mode} />
            <MiniMetric label="Context freshness" value={intelligence.context_freshness} />
            <MiniMetric label="Endpoint checked" value="/economics/intelligence" />
            <MiniMetric label="Fallback reason" value={intelligence.fallback_reason ?? "Local economics context unavailable"} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--econ-muted)]">
            Confirm FastAPI is running and /economics/intelligence returns parcel_economic_signals. CFS will not silently swap in demo data while local live mode is selected.
          </p>
        </EconPanel>
      ) : null}
      <EconPanel title="Ask CFS Economics" kicker="Ask first" tourId="ask-cfs">
        <AskCfsPanel
          appMode="economics"
          filterContext={askCfsFilterContext}
          visiblePromptCount={6}
        />
      </EconPanel>
      <section className="grid gap-4">
        <EconPanel title="Executive Economic Signals" kicker="KPIs" tourId="kpi-strip">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--econ-muted)]">
            Compare value per acre within similar economic segments.
          </p>
        </EconPanel>
        <div data-econ-tour="slicers">
          <EconomicsSlicerBar
            filters={[
              { label: "Economic Segment", onChange: setSelectedSegment, options: segmentOptions, value: selectedSegment },
              { label: "Geography / Jurisdiction", onChange: setSelectedGeography, options: geographyOptions, value: selectedGeography },
              { label: "Opportunity Class", onChange: setSelectedOpportunityClass, options: opportunityOptions, value: selectedOpportunityClass },
              { label: "Data Confidence", onChange: setSelectedDataConfidence, options: confidenceOptions, value: selectedDataConfidence },
            ]}
            onReset={resetFilters}
            selected={[selectedSegment, selectedGeography, selectedOpportunityClass, selectedDataConfidence]}
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr_1fr]">
          <EconomicsVisualPanel
            description="Shows how screened parcels/areas are distributed across economic opportunity classes."
            recipe="Table: parcel_economic_signal_fact | Visual: Donut chart | Legend: opportunity_class | Values: Count of signal_id"
            title="Opportunity Class Breakdown"
          >
            <EconomicsDonutChart rows={classBars} />
          </EconomicsVisualPanel>
          <EconomicsVisualPanel
            description="Shows confidence distribution for the currently filtered parcel signals."
            recipe="Table: parcel_economic_signal_fact | Visual: Donut chart | Legend: data_confidence | Values: Count of signal_id"
            title="Data Confidence Visual"
          >
            <EconomicsDonutChart rows={confidenceBars} />
          </EconomicsVisualPanel>
          <EconPanel title="Underbuilt Redevelopment Watchlist" kicker="Watchlist">
            <SignalTable signals={filteredWatchlist.slice(0, 5)} />
            <DetailsBlock summary="Show full watchlist" hint={`${filteredWatchlist.length} filtered rows`}>
              <SignalTable signals={filteredWatchlist} />
            </DetailsBlock>
          </EconPanel>
        </div>
      </section>
      <section className="grid gap-4" data-econ-tour="segment-visuals">
        <EconPanel title="Segment-Aware Land Economics" kicker="Land economics">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniMetric label="Selected segment" value={selectedSegment} />
            <MiniMetric label="Segment rows" value={formatNumber(filteredSignals.length)} />
            <MiniMetric label="Underbuilt in segment" value={formatNumber(filteredSignals.filter((signal) => signal.economic_status_band === "underbuilt_watch").length)} />
            <MiniMetric label="Tax-base signals" value={formatNumber(filteredSignals.filter((signal) => signal.economic_status_band === "tax_base_opportunity").length)} />
            <MiniMetric label="Data-needed rows" value={formatNumber(filteredSignals.filter((signal) => signal.economic_data_confidence === "data_needed").length)} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--econ-muted)]">
            Compare value per acre within similar economic segments; special assets can skew countywide views.
          </p>
        </EconPanel>
        <div className="grid gap-4 xl:grid-cols-2">
          <EconomicsVisualPanel
            description="Compares median value per acre by economic segment, or top rows within the selected segment."
            recipe="Table: parcel_economic_signal_fact | Visual: Bar chart | Axis: economic_segment or geography_label | Values: value_per_acre_band / median value per acre | Slicer: economic_segment"
            title="Value per Acre / Land Efficiency"
          >
            <EconomicsBarChart formatValue={currency} rows={valueBars} />
          </EconomicsVisualPanel>
          <EconomicsVisualPanel
            description="Compares improvement-to-land ratio by segment to help spot underbuilt review candidates."
            recipe="Table: parcel_economic_signal_fact | Visual: Horizontal bar chart | Axis: economic_segment or geography_label | Values: improvement_to_land_ratio_band"
            title="Improvement-to-Land Ratio by Segment"
          >
            <EconomicsBarChart formatValue={(value) => value.toFixed(2)} rows={ratioBars} />
          </EconomicsVisualPanel>
        </div>
        <EconPanel title="Top Opportunity Rows" kicker="Comparable rows">
          <SignalTable signals={filteredSignals.slice(0, 8)} />
          <DetailsBlock summary="Segment summary" hint="Counts, medians, and caveats by segment.">
            <SegmentSummaryTable rows={selectedSegmentRows} />
          </DetailsBlock>
        </EconPanel>
      </section>
      <section className="grid gap-4" data-econ-tour="scenario-visuals">
        <EconPanel title="Scenario + Power BI Readiness" kicker="Scenario readiness">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="Parcels analyzed" value={formatNumber(summary?.total_parcels_analyzed)} />
            <MiniMetric label="Assessed value coverage" value={currency(summary?.total_assessed_value)} />
            <MiniMetric label="Median value / acre" value={currency(summary?.median_value_per_acre)} />
            <MiniMetric label="Scenario outputs" value={formatNumber(filteredScenarios.length)} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--econ-muted)]">
            Power BI: start with the economic segment slicer, then compare opportunity and confidence bands.
          </p>
        </EconPanel>
        <div className="grid gap-4 xl:grid-cols-2">
          <EconomicsVisualPanel
            description="Compares scenario output bands using bands only."
            recipe="Table: scenario_output_fact | Visual: Matrix | Rows: scenario_name | Values: lift, revenue, burden, confidence bands"
            title="Scenario Output Comparison"
          >
            <EconomicsTrendChart rows={filteredScenarios} />
            <div className="mt-4" />
            <EconomicsMatrixChart rows={scenarioRows} />
          </EconomicsVisualPanel>
          <EconomicsVisualPanel
            description="Flags where fiscal upside intersects service, infrastructure, and constraint burden."
            recipe="Table: parcel_economic_signal_fact + scenario_output_fact | Visual: Matrix heatmap | Rows: opportunity_class/scenario | Columns: burden bands"
            title="Fiscal / Service Burden Matrix"
          >
            <EconomicsMatrixChart rows={burdenRows} />
          </EconomicsVisualPanel>
        </div>
        <DetailsBlock summary="Full Data Confidence Register" hint="Domain readiness, current use, and next data need.">
          <EconomicsReadinessMatrix rows={intelligence?.data_readiness ?? []} />
        </DetailsBlock>
        <DetailsBlock summary="Power BI recipe details" hint="Use economic_segment before value-per-acre comparisons.">
          <ul className="grid gap-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Source table: parcel_economic_signal_fact.</li>
            <li>Slicer: economic_segment, then geography_label, opportunity_class, and data_confidence.</li>
            <li>Value-per-acre visual: compare rows within the selected segment, not across all assets.</li>
            <li>Special asset flag: use it to separate civic, institutional, infrastructure, or utility rows from ordinary parcel peers.</li>
          </ul>
        </DetailsBlock>
      </section>
    </>
  );
}

function EconomicsWorkspacePage({
  dataReadiness,
  embedded = false,
  onClearSelection,
  onUseSelectedInTools,
  onSendSelectedToPrint,
  onToggleSignal,
  scenarioOutputs,
  selectedSignalIds,
  selectedSignals,
  signals,
  tourRowSelectionId = "row-selection",
  tourSelectedTrayId = "selected-rows-tray",
  watchlist,
}: {
  dataReadiness: EconomicsReadinessRow[];
  embedded?: boolean;
  onClearSelection: () => void;
  onUseSelectedInTools: () => void;
  onSendSelectedToPrint: () => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  scenarioOutputs: EconomicsScenarioOutput[];
  selectedSignalIds: string[];
  selectedSignals: EconomicsParcelSignal[];
  signals: EconomicsParcelSignal[];
  tourRowSelectionId?: string;
  tourSelectedTrayId?: string;
  watchlist: EconomicsParcelSignal[];
}) {
  const [activeTable, setActiveTable] = useState<WorkspaceTableKey>("baseline");
  const [selectedOpportunityClass, setSelectedOpportunityClass] = useState("All");
  const [selectedDataConfidence, setSelectedDataConfidence] = useState("All");
  const [selectedGeography, setSelectedGeography] = useState("All");
  const [selectedBurdenBand, setSelectedBurdenBand] = useState("All");
  const taxBaseSignals = signals
    .filter(
      (signal) =>
        signal.economic_status_band === "tax_base_opportunity" ||
        signal.opportunity_class === "Tax-Base Opportunity",
    )
    .slice(0, 16);
  const activeMeta = workspaceTableOptions.find((option) => option.key === activeTable) ?? workspaceTableOptions[0];
  const signalRowsByTable: Record<WorkspaceSignalTableKey, EconomicsParcelSignal[]> = {
    baseline: signals,
    taxBase: taxBaseSignals,
    underbuilt: watchlist,
  };
  const activeSignalRows =
    activeTable === "baseline" || activeTable === "taxBase" || activeTable === "underbuilt"
      ? filterWorkspaceSignals(signalRowsByTable[activeTable], {
          burdenBand: selectedBurdenBand,
          dataConfidence: selectedDataConfidence,
          geography: selectedGeography,
          opportunityClass: selectedOpportunityClass,
        }).slice(0, 18)
      : [];
  const geographyOptions = ["All", ...uniqueValues(signals.map((signal) => signal.geography_label).filter(Boolean))];
  const opportunityOptions = ["All", ...uniqueValues(signals.map((signal) => signal.opportunity_class))];
  const confidenceOptions = ["All", ...uniqueValues(signals.map((signal) => signal.economic_data_confidence))];
  const burdenOptions = ["All", ...uniqueValues(signals.map(workspaceBurdenBand))];
  const resetFilters = () => {
    setSelectedOpportunityClass("All");
    setSelectedDataConfidence("All");
    setSelectedGeography("All");
    setSelectedBurdenBand("All");
  };
  return (
    <>
      {embedded ? null : (
        <>
          <PageHeader
            kicker="Power BI & Tools"
            title="Power BI & Tools"
            text="Table-first parcel economics, Power BI exports, and opportunity screening."
          />
          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/[0.07] px-4 py-3 text-sm leading-6 text-[#f7dc93]">
            <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
            <span>Screening-level economic context, not official appraisal, tax bill, or fiscal impact study.</span>
          </section>
        </>
      )}
      <div data-econ-tour="economics-filters">
        <EconomicsSlicerBar
          filters={[
            {
              label: "Table type",
              onChange: (value) =>
                setActiveTable(
                  workspaceTableOptions.find((option) => option.label === value)?.key ?? "baseline",
                ),
              options: workspaceTableOptions.map((option) => option.label),
              value: activeMeta.label,
            },
            { label: "Opportunity Class", onChange: setSelectedOpportunityClass, options: opportunityOptions, value: selectedOpportunityClass },
            { label: "Data Confidence", onChange: setSelectedDataConfidence, options: confidenceOptions, value: selectedDataConfidence },
            { label: "Geography / Jurisdiction", onChange: setSelectedGeography, options: geographyOptions, value: selectedGeography },
            { label: "Burden Band", onChange: setSelectedBurdenBand, options: burdenOptions, value: selectedBurdenBand },
          ]}
          onReset={resetFilters}
          selected={[activeMeta.label, selectedOpportunityClass, selectedDataConfidence, selectedGeography, selectedBurdenBand]}
        />
      </div>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <EconPanel
          description={activeMeta.description}
          kicker="Select rows"
          title={activeMeta.label}
          tourId={tourRowSelectionId}
        >
          <WorkspaceTableTabs activeTable={activeTable} onChange={setActiveTable} />
          <div className="mt-4">
            {activeTable === "scenario" ? (
              <ScenarioCandidateTable rows={scenarioOutputs} />
            ) : activeTable === "readiness" ? (
              <ReadinessTable rows={dataReadiness} />
            ) : (
              <SelectableSignalTable
                onToggle={onToggleSignal}
                selectedIds={selectedSignalIds}
                signals={activeSignalRows}
                tableKind={activeTable}
              />
            )}
          </div>
        </EconPanel>
        <SelectedRowsTray
          onClear={onClearSelection}
          onUseSelectedInTools={onUseSelectedInTools}
          onSendPrint={onSendSelectedToPrint}
          selectedSignals={selectedSignals}
          tourId={tourSelectedTrayId}
        />
      </section>
      {embedded ? null : (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <EconPanel title="Ask CFS Economics" kicker="Analyst prompts">
            <AskCfsPanel
              appMode="economics"
              suggestedPromptsOverride={askCfsEconomicsWorkspacePrompts}
              visiblePromptCount={6}
            />
          </EconPanel>
          <EconPanel title="Power BI / model handoff" kicker="Selection note">
            <p className="text-sm leading-6 text-[var(--econ-muted)]">
              Selected rows can become Power BI table filters, scenario model context, or decision-pack evidence.
            </p>
          </EconPanel>
        </section>
      )}
    </>
  );
}

function EnterpriseWorkspacePage({
  askPowerBiAction,
  embedded = false,
  exportPayload,
  inputs,
  onAddReportBucketItem,
  onClearReportBucket,
  onNavigate,
  onRemoveReportBucketItem,
  onToggleReportBucketPrint,
  outputs,
  powerBiPayload,
  reportAvailability,
  reportBucketItems,
  scenarios,
  selectedSignals,
  showSelectedRowsStep = true,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  embedded?: boolean;
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => void;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onToggleReportBucketPrint: (id: string) => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  reportAvailability: PowerBiReportDataAvailability;
  reportBucketItems: ReportBucketItem[];
  scenarios: EconomicsScenarioTemplate[];
  selectedSignals: EconomicsParcelSignal[];
  showSelectedRowsStep?: boolean;
}) {
  const [selectedOutput, setSelectedOutput] =
    useState<EnterpriseOutputKind>("powerbi");
  return (
    <>
      {embedded ? null : (
        <>
          <PageHeader
            kicker="Power BI & Tools"
            title="Power BI & Tools"
            text="Turn selected economics rows into scenario outputs, BI exports, planning-model structures, and decision packs."
          />
          <PageHelper text="Follow the four steps: select data, choose an output, configure it, then export or print." />
          <section className="rounded-2xl border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/[0.07] px-4 py-3 text-sm leading-6 text-[#f7dc93]">
            Screening-level economics: not an official appraisal, tax bill, fiscal impact study, or project approval recommendation.
          </section>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {enterpriseGuidedSteps.map((step) => (
              <EconCard key={step.title}>
                <p className="econ-eyebrow">{step.kicker}</p>
                <h2 className="mt-2 text-base font-semibold text-[var(--econ-text)]">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
                  {step.text}
                </p>
              </EconCard>
            ))}
          </section>
        </>
      )}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4">
          {showSelectedRowsStep ? (
            <EnterpriseSelectedRowsPanel
              onGoToTools={() => onNavigate("tools")}
              selectedSignals={selectedSignals}
            />
          ) : null}
          <EconPanel title="Choose Tool" kicker="Advanced tools" tourId="advanced-tools">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {enterpriseOutputCards.map((card) => (
                <button
                  className={`econ-card rounded-2xl p-4 text-left transition ${
                    selectedOutput === card.kind
                      ? "border-[var(--econ-gold)]/60 bg-[var(--econ-gold)]/10"
                      : ""
                  }`}
                  key={card.kind}
                  onClick={() => setSelectedOutput(card.kind)}
                  type="button"
                >
                  <h2 className="text-base font-semibold text-[var(--econ-text)]">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
                    {card.text}
                  </p>
                  <span className="mt-3 inline-flex rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)]">
                    Open
                  </span>
                </button>
              ))}
            </div>
          </EconPanel>
          <EnterpriseToolsPage
            askPowerBiAction={askPowerBiAction}
            exportPayload={exportPayload}
            inputs={inputs}
            onAddReportBucketItem={onAddReportBucketItem}
            onClearReportBucket={onClearReportBucket}
            onNavigate={onNavigate}
            onRemoveReportBucketItem={onRemoveReportBucketItem}
            onToggleReportBucketPrint={onToggleReportBucketPrint}
            outputs={outputs}
            powerBiPayload={powerBiPayload}
            reportAvailability={reportAvailability}
            reportBucketItems={reportBucketItems}
            scenarios={scenarios}
            selectedOutput={selectedOutput}
            selectedSignals={selectedSignals}
          />
        </div>
        {embedded ? null : (
          <EconPanel title="Ask CFS Economics" kicker="Assistant">
            <AskCfsPanel
              appMode="economics"
              suggestedPromptsOverride={askCfsEconomicsPowerBiToolPrompts}
              visiblePromptCount={6}
            />
          </EconPanel>
        )}
      </section>
    </>
  );
}

function EnterpriseSelectedRowsPanel({
  onGoToTools,
  selectedSignals,
}: {
  onGoToTools: () => void;
  selectedSignals: EconomicsParcelSignal[];
}) {
  return (
    <EconPanel title="Step 1 - Select Data" kicker={`${selectedSignals.length} selected rows`}>
      {selectedSignals.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-[var(--econ-muted)]">
              <tr>
                <th className="px-3 py-2">Area / parcel</th>
                <th className="px-3 py-2">Opportunity</th>
                <th className="px-3 py-2">Value / acre</th>
                <th className="px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {selectedSignals.slice(0, 6).map((signal) => (
                <tr className="bg-white/[0.025]" key={signal.parcel_id}>
                  <td className="rounded-l-xl border-y border-l border-[var(--econ-border)] px-3 py-3 font-semibold text-[var(--econ-text)]">
                    {signal.geography_label ?? signal.parcel_id}
                  </td>
                  <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                    {signal.opportunity_class}
                  </td>
                  <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                    {currency(signal.value_per_acre)}
                  </td>
                  <td className="rounded-r-xl border-y border-r border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                    {signal.economic_data_confidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[var(--econ-muted)]">
            No rows selected yet. Use the table section on this page to pick useful rows, then open a tool.
          </p>
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
            onClick={onGoToTools}
            type="button"
          >
            Select rows on Power BI & Tools
          </button>
        </div>
      )}
    </EconPanel>
  );
}

function EconomicsPrintPage({
  intelligence,
  onClearReportBucket,
  onNavigate,
  onRemoveReportBucketItem,
  onSetAllReportBucketPrint,
  onToggleReportBucketPrint,
  reportBucketItems,
  selectedSignals,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "dashboard") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onSetAllReportBucketPrint: (selected: boolean) => void;
  onToggleReportBucketPrint: (id: string) => void;
  reportBucketItems: ReportBucketItem[];
  selectedSignals: EconomicsParcelSignal[];
}) {
  const summary = intelligence?.summary;
  const snapshotRows = selectedSignals;
  const [generatedAt] = useState(() => new Date().toLocaleString());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<{ label: string; text: string } | null>(null);
  const reportRows = snapshotRows.length
    ? snapshotRows
    : (intelligence?.parcel_economic_signals ?? []).slice(0, 8);
  const classRows = snapshotRows.length
    ? countRowsBy(snapshotRows, (signal) => signal.opportunity_class)
    : (intelligence?.opportunity_class_breakdown ?? []).map((row) => ({
        label: row.opportunity_class,
        value: row.count,
      }));
  const confidenceRows = countRowsBy(reportRows, (signal) => signal.economic_data_confidence);
  const segmentRows = countRowsBy(reportRows, (signal) => signal.economic_segment ?? "Unknown / Needs Classification");
  const hasSpecialAssets = reportRows.some((signal) => signal.special_asset_flag);
  const specialAssetCount = reportRows.filter((signal) => signal.special_asset_flag).length;
  const scenario = intelligence?.scenario_outputs?.[0] ?? fallbackScenarioOutputs[0];
  const snapshotSummary = economicSnapshotSummary(summary, snapshotRows);
  const followUps = nextDiligenceItems(snapshotRows);
  const caveats = [
    "Screening-level economic context only.",
    "Not an official appraisal, tax bill, fiscal impact study, or project approval recommendation.",
    "Scenario bands depend on assumptions and available source fields.",
    ...(intelligence?.caveats ?? []).slice(0, 3),
  ];
  const decisionMemo = economicDecisionMemo({
    caveats,
    classRows,
    followUps,
    hasSpecialAssets,
    scenario,
    segmentRows,
    snapshotRows,
  });
  const evidencePackRows = printEvidencePackRows({
    hasSelectedRows: Boolean(snapshotRows.length),
    readinessRows: intelligence?.data_readiness ?? [],
    reportRows,
    scenario,
  });
  const sourceNotes = [
    `Data mode: ${USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}.`,
    `Generated: ${generatedAt}.`,
    "Selected rows come from Power BI & Tools; if no rows are selected, this snapshot uses the current economics summary.",
    "Export sources: economics_powerbi_export.json and flat Power BI-ready CSV tables.",
    "No embedded BI connection, external credential, contact field, or model internal is included in this snapshot.",
  ];
  const selectedBucketItems = reportBucketItems.filter((item) => item.selected_for_print);
  const selectedBucketText = selectedBucketItems.length
    ? selectedBucketItems.map(bucketItemText).join("\n\n---\n\n")
    : "No report bucket items selected for print.";
  const evidencePackText = [
    "CFS Economics Evidence Pack",
    ...evidencePackRows.map((row) => `${row.label}: ${row.value}`),
  ].join("\n");
  const powerBiNotesText = [
    "CFS Economics Power BI / Export Notes",
    ...sourceNotes.map((item) => `- ${item}`),
    "- Use economic_segment as the first slicer.",
    "- Sort opportunity_class by opportunity_class_order and bands by band_order.",
    "- Filter or isolate special_asset_flag records before value-per-acre comparisons.",
  ].join("\n");
  const executiveSummaryText = [
    "CFS Economics Snapshot",
    snapshotSummary,
    `Selected rows: ${snapshotRows.length || "none - using current economics summary"}`,
    `Segment mix: ${segmentRows.map((row) => `${row.label}: ${row.value}`).join("; ") || "not available"}`,
    hasSpecialAssets ? "Special asset caution: selected rows include non-comparable assets." : "Special asset caution: none in selected/report rows.",
    "Recommended next diligence:",
    ...followUps.map((item) => `- ${item}`),
    "Caveats:",
    ...caveats.map((item) => `- ${item}`),
  ].join("\n");
  const copyText = async (label: string, text: string) => {
    setCopyFallback(null);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else if (!fallbackCopyText(text)) {
        setCopyFallback({ label, text });
        setCopyStatus(`${label} ready to copy manually`);
        return;
      }
      setCopyStatus(`${label} copied`);
    } catch {
      if (!fallbackCopyText(text)) {
        setCopyFallback({ label, text });
        setCopyStatus(`${label} ready to copy manually`);
        return;
      }
      setCopyStatus(`${label} copied`);
    }
  };
  return (
    <>
      <section className="no-print flex flex-wrap gap-2 rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] p-4" data-econ-tour="print-actions">
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => window.print()} type="button">
          Print / Save as PDF
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copyText("Executive summary", executiveSummaryText)} type="button">
          Copy Executive Summary
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copyText("Decision memo", decisionMemo)} type="button">
          Copy Decision Memo
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copyText("Evidence pack", evidencePackText)} type="button">
          Copy Evidence Pack
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copyText("Power BI notes", powerBiNotesText)} type="button">
          Copy Power BI follow-up notes
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copyText("Selected report items", selectedBucketText)} type="button">
          Copy selected report items
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => onSetAllReportBucketPrint(true)} type="button">
          Select all bucket items
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => onSetAllReportBucketPrint(false)} type="button">
          Deselect all
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => onNavigate("tools")} type="button">
          Go to Power BI & Tools
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => onNavigate("dashboard")} type="button">
          Go to Economic Dashboard
        </button>
        {copyStatus ? <span className="self-center text-xs text-[var(--econ-green)]">{copyStatus}</span> : null}
        {copyFallback ? (
          <div className="basis-full rounded-xl border border-[var(--econ-border)] bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--econ-muted)]">
              {copyFallback.label} text ready to copy manually.
            </p>
            <textarea
              className="h-28 w-full rounded-lg border border-[var(--econ-border)] bg-[#080d14] p-2 text-xs text-[var(--econ-text)]"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={copyFallback.text}
            />
          </div>
        ) : null}
      </section>
      <section className="no-print" data-econ-tour="print-report-bucket">
        <ReportBucketPanel
          items={reportBucketItems}
          onClear={onClearReportBucket}
          onRemove={onRemoveReportBucketItem}
          onTogglePrint={onToggleReportBucketPrint}
          title="Report Bucket"
        />
      </section>
      <article className="print-report rounded-2xl border border-[var(--econ-border)] bg-[#fbfaf6] p-5 text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:p-7">
        <header className="print-section border-b border-slate-300 pb-5" data-econ-tour="print-header">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Print</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">CFS Economics Snapshot</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">
                Screening-level economic context for selected rows or current economics summary.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
                {USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}
              </span>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
                Generated {generatedAt}
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
            Screening-level economic context, not official appraisal, tax bill, fiscal impact study, or project approval recommendation.
          </p>
        </header>

        <PrintSection title="1. Executive Takeaway" tourId="print-takeaway">
          <p className="text-sm leading-7 text-slate-700">{snapshotSummary}</p>
        </PrintSection>

        <PrintSection title="2. Selected Rows / Scope" tourId="print-scope">
          {snapshotRows.length ? (
            <>
              <p className="text-sm text-slate-700">
                Based on selected Power BI & Tools rows: {snapshotRows.length} selected.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4 print:grid-cols-4">
                <PrintMetric label="Selected rows" value={formatNumber(snapshotRows.length)} />
                <PrintMetric label="Top segment" value={segmentRows[0]?.label ?? "Data Needed"} />
                <PrintMetric label="Top opportunity class" value={classRows[0]?.label ?? "Data Needed"} />
                <PrintMetric label="Special assets" value={formatNumber(specialAssetCount)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {snapshotRows.slice(0, 10).map((signal) => (
                  <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700" key={signal.parcel_id}>
                    {signal.geography_label ?? signal.parcel_id}
                  </span>
                ))}
              </div>
              <SelectedRowsPrintTable signals={snapshotRows} />
            </>
          ) : (
            <p className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              No rows selected. This snapshot is using the current economics summary. Select rows in Power BI & Tools to create a focused parcel/area snapshot.
            </p>
          )}
        </PrintSection>

        <PrintSection title="3. Economic Baseline">
          <div className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
            <PrintMetric label="Parcels / areas analyzed" value={formatNumber(summary?.total_parcels_analyzed)} />
            <PrintMetric label="Assessed value coverage" value={currency(summary?.total_assessed_value)} />
            <PrintMetric label="Median value per acre" value={currency(summary?.median_value_per_acre)} />
            <PrintMetric label="Underbuilt candidates" value={formatNumber(summary?.underbuilt_candidate_count)} />
            <PrintMetric label="Tax-base opportunity signals" value={formatNumber(summary?.high_opportunity_count)} />
            <PrintMetric label="Data-needed count" value={formatNumber(summary?.data_needed_count)} />
          </div>
        </PrintSection>

        <PrintSection title="4. Opportunity & Segment Summary">
          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Opportunity Class
              </p>
              <EconomicsBarChart rows={classRows} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Economic Segment
              </p>
              <EconomicsBarChart rows={segmentRows} />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <p>
              {snapshotRows.length
                ? "Selected rows show the opportunity classes and economic segments currently queued for review."
                : "Countywide/demo summary classes are shown because no rows are selected."}
            </p>
            <p className="mt-2">Value per acre is most meaningful when compared within similar land-use or property segments.</p>
            {hasSpecialAssets ? (
              <p className="mt-2 font-semibold text-amber-900">
                Special asset / compare with caution: selected rows include civic, institutional, infrastructure, or utility-style records.
              </p>
            ) : null}
            {!snapshotRows.length ? (
              <p className="mt-2">No rows are selected, so this summary should be filtered by segment before using it in a decision memo.</p>
            ) : null}
          </div>
        </PrintSection>

        <PrintSection title="5. Fiscal / Service Burden Context">
          <BurdenPrintTable rows={burdenContextRows(reportRows, scenario)} />
        </PrintSection>

        <PrintSection title="6. Scenario Summary">
          <div className="grid gap-2 md:grid-cols-2 print:grid-cols-2">
            <PrintKeyValue label="Selected/default scenario" value={scenario.title} />
            <PrintKeyValue label="Tax-base lift band" value={scenario.estimated_tax_base_lift_band} />
            <PrintKeyValue label="Revenue per acre band" value={scenario.revenue_per_acre_band} />
            <PrintKeyValue label="Service burden band" value={scenario.service_burden_band} />
            <PrintKeyValue label="Infrastructure burden band" value={scenario.infrastructure_burden_band} />
            <PrintKeyValue label="Fiscal attractiveness band" value={scenario.constraint_adjusted_opportunity_band} />
            <PrintKeyValue label="Data confidence" value={scenario.data_confidence} />
            <PrintKeyValue label="Recommended next diligence" value={scenario.recommended_next_diligence} />
          </div>
        </PrintSection>

        <PrintSection title="7. Data Confidence">
          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] print:grid-cols-[18rem_minmax(0,1fr)]">
            <EconomicsBarChart rows={confidenceRows} />
            <ReadinessPrintTable rows={intelligence?.data_readiness ?? []} />
          </div>
        </PrintSection>

        <PrintSection title="8. Evidence Pack">
          <EvidencePackTable rows={evidencePackRows} />
        </PrintSection>

        <PrintSection title="9. Selected Report Items">
          {selectedBucketItems.length ? (
            <div className="grid gap-3">
              {selectedBucketItems.map((item) => (
                <div className="rounded-lg border border-slate-300 bg-slate-50 p-3" key={item.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {bucketTypeLabel(item.type)}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{item.summary}</p>
                  {item.generated_report ? (
                    <GeneratedReportPrintDetails report={item.generated_report} />
                  ) : (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-300 bg-white p-3 text-xs leading-5 text-slate-700">
                      {bucketItemText(item)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              No report bucket items yet. Add charts, Power BI recipes, or decision-pack notes from Power BI & Tools.
            </p>
          )}
        </PrintSection>

        <PrintSection title="10. Recommended Next Diligence">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
            {followUps.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </PrintSection>

        <PrintSection title="11. Caveats & Assumptions" tourId="print-caveats">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
            {caveats.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </PrintSection>

        <PrintSection title="12. Power BI / Export Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
            {sourceNotes.map((item) => <li key={item}>{item}</li>)}
            <li>Use economic_segment as the first Power BI slicer for segment-aware interpretation.</li>
            <li>Use opportunity_class_order and band_order to sort report visuals.</li>
            <li>Filter or isolate special_asset_flag records before comparing value per acre.</li>
          </ul>
        </PrintSection>
      </article>
      <section className="no-print">
        <EconPanel title="Ask CFS Economics" kicker="Snapshot support">
          <AskCfsPanel
            appMode="economics"
            suggestedPromptsOverride={askCfsEconomicsPrintPrompts}
            visiblePromptCount={6}
          />
        </EconPanel>
      </section>
    </>
  );
}

function PrintSection({
  children,
  title,
  tourId,
}: {
  children: ReactNode;
  title: string;
  tourId?: string;
}) {
  return (
    <section className="print-section mt-6" data-econ-tour={tourId}>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GeneratedReportPrintDetails({ report }: { report: GeneratedPowerBiReportSnapshot }) {
  return (
    <div className="mt-3 grid gap-3">
      {report.include_sections.kpis ? (
        <div className="grid gap-2 md:grid-cols-4 print:grid-cols-4">
          {report.kpis.map((kpi) => (
            <PrintMetric key={kpi.label} label={kpi.label} value={kpi.value} />
          ))}
        </div>
      ) : null}
      {report.include_sections.visuals ? (
        <div className="rounded border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Visuals</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
            {report.visuals.map((visual) => (
              <li key={visual.visual_id}>
                {visual.title}: {chartVisualLabel(visual.visual_type)} using {visual.source_table}
                {visual.rows.length ? ` (${visual.rows.length} rows)` : " (unavailable: 0 rows)"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.include_sections.tables ? (
        <div className="rounded border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tables</p>
          {report.tables.map((table) => (
            <div className="mt-2" key={table.title}>
              <p className="text-sm font-semibold text-slate-950">{table.title}</p>
              <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-xs leading-5 text-slate-700">
                {generatedTableText(table)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
      {report.include_sections.caveats ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
          {report.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
        </ul>
      ) : null}
      {report.include_sections.powerbi_details ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-300 bg-white p-3 text-xs leading-5 text-slate-700">
          {report.powerbi_details}
        </pre>
      ) : null}
    </div>
  );
}

function PrintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PrintKeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">
        {value}
      </p>
    </div>
  );
}

function SelectedRowsPrintTable({ signals }: { signals: EconomicsParcelSignal[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300">
      <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Area / parcel</th>
            <th className="px-3 py-2">Opportunity class</th>
            <th className="px-3 py-2">Value / acre</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Recommended follow-up</th>
          </tr>
        </thead>
        <tbody>
          {signals.slice(0, 12).map((signal) => (
            <tr key={signal.parcel_id}>
              <td className="border-t border-slate-300 px-3 py-2 font-semibold text-slate-950">
                {signal.geography_label ?? signal.parcel_id}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {signal.opportunity_class}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {currency(signal.value_per_acre)}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {signal.economic_data_confidence}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {signal.recommended_followup}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessPrintTable({ rows }: { rows: EconomicsReadinessRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-700">Data readiness is not available.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Next data need</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row) => (
            <tr key={row.domain}>
              <td className="border-t border-slate-300 px-3 py-2 font-semibold text-slate-950">
                {row.domain}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {row.data_status.replaceAll("_", " ")}
              </td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">
                {row.gap_or_next_need}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function BurdenPrintTable({
  rows,
}: {
  rows: Array<{ evidence: string; label: string; next: string; value: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300">
      <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Context</th>
            <th className="px-3 py-2">Band</th>
            <th className="px-3 py-2">Evidence</th>
            <th className="px-3 py-2">Next diligence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="border-t border-slate-300 px-3 py-2 font-semibold text-slate-950">{row.label}</td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">{row.value}</td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">{row.evidence}</td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">{row.next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvidencePackTable({
  rows,
}: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300">
      <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Evidence</th>
            <th className="px-3 py-2">Snapshot value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="border-t border-slate-300 px-3 py-2 font-semibold text-slate-950">{row.label}</td>
              <td className="border-t border-slate-300 px-3 py-2 text-slate-700">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnterpriseToolsPage({
  askPowerBiAction,
  exportPayload,
  inputs,
  onAddReportBucketItem,
  onClearReportBucket,
  onNavigate,
  onRemoveReportBucketItem,
  onToggleReportBucketPrint,
  outputs,
  powerBiPayload,
  reportAvailability,
  reportBucketItems,
  scenarios,
  selectedOutput,
  selectedSignals,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => void;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onToggleReportBucketPrint: (id: string) => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  reportAvailability: PowerBiReportDataAvailability;
  reportBucketItems: ReportBucketItem[];
  scenarios: EconomicsScenarioTemplate[];
  selectedOutput: EnterpriseOutputKind;
  selectedSignals: EconomicsParcelSignal[];
}) {
  const [powerBiPreviewMode, setPowerBiPreviewMode] = useState<"summary" | "json">("summary");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [scenarioMemoText, setScenarioMemoText] = useState("");
  const powerBiPreview =
    powerBiPreviewMode === "json"
      ? JSON.stringify(powerBiPayload ?? { status: "Loading Power BI export pack" }, null, 2)
      : JSON.stringify(powerBiTableSummary(powerBiPayload), null, 2);
  const planningPayload = exportPayload?.exports.planning_model ?? null;
  const decisionPack = exportPayload?.exports.decision_pack ?? null;
  const planningPreview = JSON.stringify(planningPayload ?? { status: "Loading planning model payload" }, null, 2);
  const decisionPackPreview = JSON.stringify(decisionPack ?? { status: "Loading decision pack" }, null, 2);
  const reportBuilderGuide = powerBiPayload?.report_builder_guide;
  const csvRows = powerBiCsvRows(powerBiPayload);
  const relationshipNotes = powerBiRelationshipNotes(powerBiPayload);
  const reportLayoutNotes = powerBiReportLayoutNotes(powerBiPayload);
  const importOrderNotes = powerBiCsvImportOrderNotes(csvRows);
  const qaChecklistNotes = powerBiImportQaChecklist.join("\n");
  const planningStructureNotes = [
    "Dimensions",
    ...(planningPayload?.dimensions.map((row) => `- ${row.name}`) ?? []),
    "Measures",
    ...(planningPayload?.measures.map((measure) => `- ${measure}`) ?? []),
    "Scenarios",
    ...(planningPayload?.scenarios.map((scenario) => `- ${scenario}`) ?? []),
  ].join("\n");
  const decisionSummaryNotes = [
    decisionPack?.executive_takeaway ?? "Decision pack is loading.",
    ...(decisionPack?.recommended_next_diligence.map((item) => `- ${item}`) ?? []),
  ].join("\n");
  const copyText = async (label: string, text: string) => {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable in this browser");
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopyStatus(`${label} copied`);
  };
  const downloadPowerBiPack = () => {
    if (!powerBiPayload) return;
    const blob = new Blob([JSON.stringify(powerBiPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "economics_powerbi_export.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <EconPanel title="Tool Workspace" kicker={enterpriseOutputLabel(selectedOutput)}>
        {selectedOutput === "scenario" ? (
          <EnterpriseScenarioConfigurePanel
            inputs={inputs}
            onMemoChange={setScenarioMemoText}
            outputs={outputs}
            scenarios={scenarios}
          />
        ) : null}
        {selectedOutput === "powerbi" ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                onClick={() => setPowerBiPreviewMode("summary")}
                type="button"
              >
                Preview tables
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={downloadPowerBiPack}
                type="button"
              >
                Download Power BI JSON Pack
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={() => void copyText("CSV import order", importOrderNotes)}
                type="button"
              >
                Copy import order
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={() => void copyText("Relationship notes", relationshipNotes)}
                type="button"
              >
                Copy relationships
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={() => void copyText("Report layout", reportLayoutNotes)}
                type="button"
              >
                Copy report layout
              </button>
            </div>
            <div data-econ-tour="powerbi-csv-export">
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Flat CSV Tables
              </h2>
            </div>
            <CsvDownloadTable rows={csvRows} />
            <PowerBiChartBuilder
              aiAction={askPowerBiAction}
              availability={reportAvailability}
              key={askPowerBiAction?.id ?? "manual-chart-builder"}
              onAddReportBucketItem={onAddReportBucketItem}
              payload={powerBiPayload}
            />
            <ReportBucketPanel
              items={reportBucketItems}
              onClear={onClearReportBucket}
              onOpenPrint={() => onNavigate("print")}
              onRemove={onRemoveReportBucketItem}
              onTogglePrint={onToggleReportBucketPrint}
              title="Report Bucket"
            />
            <DetailsBlock summary="Show guide" hint="Power BI Report Builder Guide: 4 recommended report pages.">
              <ReportBuilderGuide guide={reportBuilderGuide} payload={powerBiPayload} />
            </DetailsBlock>
            <DetailsBlock summary="Show measures" hint="Suggested DAX-style measures for Power BI Desktop.">
              <DaxMeasureList guide={reportBuilderGuide} />
            </DetailsBlock>
            <DetailsBlock summary="Show concepts" hint="Power BI Concepts Used: fact tables, dimensions, slicers, measures, and semantic model basics.">
              <ConceptList guide={reportBuilderGuide} />
            </DetailsBlock>
            <DetailsBlock summary="Show payload" hint="Full JSON preview for the Power BI export pack.">
              <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
                {powerBiPreview}
              </pre>
            </DetailsBlock>
          </div>
        ) : null}
        {selectedOutput === "planning" ? (
          <div className="grid gap-4">
            <Matrix rows={[...planningRows, ...measureRows]} />
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!planningPayload}
                onClick={() => void copyText("Planning model structure", planningStructureNotes)}
                type="button"
              >
                Copy planning model structure
              </button>
            </div>
            <DetailsBlock summary="Planning Model Schema" hint="Dimensions, measures, scenarios, assumptions, and outputs.">
              <Matrix rows={[...planningRows, ...measureRows]} />
            </DetailsBlock>
            <DetailsBlock summary="Show payload" hint="Preview planning-model export JSON.">
              <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
                {planningPreview}
              </pre>
            </DetailsBlock>
          </div>
        ) : null}
        {selectedOutput === "decision" ? (
          <div className="grid gap-4">
            <Matrix
              rows={[
                {
                  label: "Executive takeaway",
                  value: decisionPack?.executive_takeaway ?? "Decision pack is loading.",
                },
                {
                  label: "Recommended next diligence",
                  value: decisionPack?.recommended_next_diligence.join("; ") ?? "Loading follow-up.",
                },
                {
                  label: "Selected rows",
                  value: selectedSignals.length
                    ? selectedSignals.map((signal) => signal.geography_label ?? signal.parcel_id).join(", ")
                    : "No rows selected.",
                },
              ]}
            />
            <button
              className="w-fit rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
              disabled={!decisionPack}
              onClick={() => void copyText("Decision pack", decisionSummaryNotes)}
              type="button"
            >
              Copy decision pack
            </button>
            <button
              className="w-fit rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
              disabled={!decisionPack}
              onClick={() =>
                onAddReportBucketItem({
                  content: decisionSummaryNotes,
                  id: "decision-pack-summary",
                  source_page: "Power BI & Tools",
                  summary: decisionPack?.executive_takeaway ?? "Decision pack summary.",
                  title: "Decision Pack Summary",
                  type: "decision_memo",
                })
              }
              type="button"
            >
              Add Decision Pack to Report Bucket
            </button>
            <DetailsBlock summary="Evidence Pack details" hint="Evidence sections, risk flags, assumptions, and caveats.">
              <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
                {decisionPackPreview}
              </pre>
            </DetailsBlock>
          </div>
        ) : null}
      </EconPanel>
      <EconPanel title="Next Actions" kicker={enterpriseOutputLabel(selectedOutput)} tourId="tools-final-actions">
        <div className="grid gap-3 sm:grid-cols-2">
          {selectedOutput === "scenario" ? (
            <>
              <ActionButton label="Copy decision memo" onClick={() => void copyText("Decision memo", scenarioMemoText)} />
              <ActionButton
                label="Add memo to Report Bucket"
                onClick={() =>
                  onAddReportBucketItem({
                    content: scenarioMemoText || "Scenario decision memo is not ready yet.",
                    id: "scenario-decision-memo",
                    source_page: "Power BI & Tools",
                    summary: "Scenario decision memo from the current scenario controls.",
                    title: "Scenario Decision Memo",
                    type: "decision_memo",
                  })
                }
              />
              <ActionButton label="Send to Print" onClick={() => onNavigate("print")} />
            </>
          ) : null}
          {selectedOutput === "powerbi" ? (
            <>
              <ActionButton label="Copy CSV Import Order" onClick={() => void copyText("CSV import order", importOrderNotes)} />
              <ActionButton label="Open Power BI Desktop" onClick={() => void copyText("Power BI reminder", "Open Power BI Desktop, then Get Data -> Text/CSV.")} />
              <ActionButton label="Copy import checklist" onClick={() => void copyText("QA checklist", qaChecklistNotes)} />
              <ActionButton
                label="Add QA checklist to Report Bucket"
                onClick={() =>
                  onAddReportBucketItem({
                    content: qaChecklistNotes,
                    id: "powerbi-qa-checklist",
                    source_page: "Power BI & Tools",
                    summary: "Power BI import QA checklist.",
                    title: "Power BI Import QA Checklist",
                    type: "qa_checklist",
                  })
                }
              />
              <ActionButton label="Send Bucket to Print" onClick={() => onNavigate("print")} />
            </>
          ) : null}
          {selectedOutput === "planning" ? (
            <>
              <ActionButton label="Copy planning model structure" onClick={() => void copyText("Planning model structure", planningStructureNotes)} />
              <ActionButton label="Preview export payload" onClick={() => void copyText("Planning model payload", planningPreview)} />
            </>
          ) : null}
          {selectedOutput === "decision" ? (
            <>
              <ActionButton label="Copy decision pack" onClick={() => void copyText("Decision pack", decisionSummaryNotes)} />
              <ActionButton label="Open Print" onClick={() => onNavigate("print")} />
            </>
          ) : null}
        </div>
        <DetailsBlock summary="Power BI Import QA Checklist" hint="Quality checks before import and report build.">
          <QaChecklist
            onAddBucket={() =>
              onAddReportBucketItem({
                content: qaChecklistNotes,
                id: "powerbi-qa-checklist",
                source_page: "Power BI & Tools",
                summary: "Power BI import QA checklist.",
                title: "Power BI Import QA Checklist",
                type: "qa_checklist",
              })
            }
            onCopy={() => void copyText("QA checklist", qaChecklistNotes)}
          />
        </DetailsBlock>
      </EconPanel>
      {copyStatus ? (
        <p className="rounded-lg border border-[var(--econ-green)]/30 bg-[var(--econ-green)]/10 px-3 py-2 text-xs text-[var(--econ-green)]">
          {copyStatus}
        </p>
      ) : null}
    </>
  );
}

function EnterpriseScenarioConfigurePanel({
  inputs,
  onMemoChange,
  outputs,
  scenarios,
}: {
  inputs: EconomicsScenarioInput[];
  onMemoChange: (memo: string) => void;
  outputs: EconomicsScenarioOutput[];
  scenarios: EconomicsScenarioTemplate[];
}) {
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    initialScenarioAssumptions,
  );
  const scenarioRows = scenarioCatalog.map((scenario) => ({
    ...scenario,
    what_it_tests:
      scenarios.find((row) => row.id === scenario.id)?.what_it_tests ??
      scenario.what_it_tests,
  }));
  const selectedScenario =
    scenarioRows.find((scenario) => scenario.id === assumptions.scenarioId) ??
    scenarioRows[0];
  const output = calculateScenarioOutput(assumptions);
  const memo = scenarioDecisionMemo(selectedScenario.title, assumptions, output);
  const memoText = matrixRowsToText(memo);
  const evidencePack = scenarioEvidencePack(inputs, assumptions, output);
  const updateAssumption = (key: keyof ScenarioAssumptions, value: string) => {
    setAssumptions((current) => ({ ...current, [key]: value }));
  };
  useEffect(() => {
    onMemoChange(memoText);
  }, [memoText, onMemoChange]);
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {scenarioRows.map((scenario) => (
          <button
            className={`rounded-xl border p-3 text-left text-sm transition ${
              assumptions.scenarioId === scenario.id
                ? "border-[var(--econ-gold)] bg-[var(--econ-gold)]/10 text-[#ffe6a6]"
                : "border-[var(--econ-border)] bg-white/[0.025] text-[var(--econ-muted)] hover:border-[var(--econ-gold)]"
            }`}
            key={scenario.id}
            onClick={() =>
              setAssumptions({
                ...initialScenarioAssumptions,
                ...scenarioDefaults[scenario.id],
                scenarioId: scenario.id,
              })
            }
            type="button"
          >
            <span className="font-semibold">{scenario.title}</span>
          </button>
        ))}
      </div>
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <ScenarioSelect
            label="Development type"
            onChange={(value) => updateAssumption("developmentType", value)}
            options={developmentTypeOptions}
            value={assumptions.developmentType}
          />
          <ScenarioSelect
            label="Intensity band"
            onChange={(value) => updateAssumption("intensityBand", value)}
            options={basicBandOptions}
            value={assumptions.intensityBand}
          />
          <ScenarioSelect
            label="Value-per-acre assumption"
            onChange={(value) => updateAssumption("valuePerAcreBand", value)}
            options={basicBandOptions}
            value={assumptions.valuePerAcreBand}
          />
          <ScenarioSelect
            label="School / service burden"
            onChange={(value) => updateAssumption("schoolServiceBurden", value)}
            options={burdenBandOptions}
            value={assumptions.schoolServiceBurden}
          />
          <ScenarioSelect
            label="Utility readiness confidence"
            onChange={(value) => updateAssumption("utilityReadiness", value)}
            options={confidenceBandOptions}
            value={assumptions.utilityReadiness}
          />
          <ScenarioSelect
            label="Transportation access confidence"
            onChange={(value) => updateAssumption("transportationAccess", value)}
            options={confidenceBandOptions}
            value={assumptions.transportationAccess}
          />
          <ScenarioSelect
            label="Flood / environmental constraint"
            onChange={(value) => updateAssumption("floodConstraint", value)}
            options={burdenBandOptions}
            value={assumptions.floodConstraint}
          />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--econ-text)]">
            Scenario Output
          </h2>
          <ScenarioBandGrid output={output} />
        </div>
      </section>
      <DetailsBlock summary="Decision memo preview" hint="Executive takeaway, burden tradeoff, confidence, and next diligence.">
        <Matrix rows={memo} />
      </DetailsBlock>
      <DetailsBlock summary="Evidence Pack details" hint="Source layers, metrics, assumptions, missing data, and next diligence.">
        <Matrix rows={evidencePack} />
      </DetailsBlock>
      <DetailsBlock summary="Reference scenario bands" hint="Baseline export scenario output bands.">
        <ScenarioOutputList rows={outputs.length ? outputs : fallbackScenarioOutputs} />
      </DetailsBlock>
    </div>
  );
}

function CsvDownloadTable({ rows }: { rows: ReturnType<typeof powerBiCsvRows> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.14em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Table name</th>
            <th className="px-3 py-2">Purpose</th>
            <th className="px-3 py-2">Rows</th>
            <th className="px-3 py-2">Download</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="rounded-xl bg-white/[0.025]" key={row.table_name}>
              <td className="rounded-l-xl border-y border-l border-[var(--econ-border)] px-3 py-3 font-mono text-xs text-[var(--econ-text)]">
                {row.table_name}
              </td>
              <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                {row.primary_use}
              </td>
              <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-text)]">
                {row.row_count}
              </td>
              <td className="rounded-r-xl border-y border-r border-[var(--econ-border)] px-3 py-3">
                <a
                  className="inline-flex rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                  download={`${row.table_name}.csv`}
                  href={row.download_url}
                >
                  Download CSV
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PowerBiReportGenerator({
  askPowerBiAction,
  availability,
  dataReadiness,
  onAddReportBucketItem,
  onNavigate,
  outputs,
  payload,
  signals,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  availability: PowerBiReportDataAvailability;
  dataReadiness: EconomicsReadinessRow[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => void;
  onNavigate: (section: "print") => void;
  outputs: EconomicsScenarioOutput[];
  payload: EconomicsPowerBiExportResponse | null;
  signals: EconomicsParcelSignal[];
}) {
  const [prompt, setPrompt] = useState("Build me a Power BI report.");
  const [includeSections, setIncludeSections] = useState(defaultGeneratedReportIncludes);
  const [plan, setPlan] = useState<PowerBiGeneratedReportPlan | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!askPowerBiAction?.actions || askPowerBiAction.actions.action_type === "none") return;
    const generated = powerBiActionsToGeneratedPlan(askPowerBiAction.actions, payload, availability);
    const frame = requestAnimationFrame(() => {
      setPrompt(generated.generated_from_prompt);
      setPlan(generated);
      setStatus("Ask CFS generated a report preview below.");
    });
    return () => cancelAnimationFrame(frame);
  }, [askPowerBiAction, availability, payload]);
  const report = plan
    ? buildGeneratedReportSnapshot(plan, payload, signals, outputs, dataReadiness, includeSections)
    : null;
  const generateReport = () => {
    setPlan(buildPowerBiReportPlan(prompt, payload, availability));
    setStatus("Report preview generated");
  };
  const saveReport = () => {
    if (!report) return;
    onAddReportBucketItem(generatedReportBucketItem(report));
    setStatus("Generated report saved to Report Bucket");
  };
  const sendReportToPrint = () => {
    saveReport();
    onNavigate("print");
  };
  const copySummary = async () => {
    if (!report) return;
    await navigator.clipboard?.writeText(generatedReportText(report));
    setStatus("Report summary copied");
  };
  const downloadReport = () => {
    if (!report) return;
    downloadJson(report, `${slugifyReportTitle(report.title)}_generated_report.json`);
    setStatus("Report JSON downloaded");
  };
  return (
    <EconPanel
      description="Describe what you want. CFS will build a ready-to-use report preview with visuals, tables, summary text, and print-ready items."
      kicker="One-click report"
      title="Generate Power BI Report"
      tourId="powerbi-practice-pack"
    >
      <div className="grid gap-3">
        <textarea
          className="min-h-24 w-full resize-y rounded-xl border border-[var(--econ-border)] bg-black/30 px-3 py-3 text-sm text-[var(--econ-text)] outline-none transition placeholder:text-[var(--econ-muted)] focus:border-[var(--econ-gold)]"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: Build me a Power BI report."
          value={prompt}
        />
        <div className="flex flex-wrap gap-2">
          {quickPowerBiReportTypes.map((item) => {
            const state = availability.report_types.find((report) => report.type === item.type);
            const disabled = !state?.available;
            return (
            <button
              className="rounded-full border border-[var(--econ-border)] px-3 py-1.5 text-xs font-semibold text-[var(--econ-muted)] transition hover:border-[var(--econ-gold)] hover:text-[var(--econ-text)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={disabled}
              key={item.type}
              onClick={() => setPrompt(item.prompt)}
              title={disabled ? state?.reason : item.label}
              type="button"
            >
              {item.label}
            </button>
            );
          })}
        </div>
        <div className="grid gap-3 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-green)]">Available now</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {availability.available_report_types.map((type) => (
                <button
                  className="rounded-full border border-[var(--econ-green)]/40 bg-[var(--econ-green)]/10 px-2.5 py-1 text-xs text-[var(--econ-text)]"
                  key={type}
                  onClick={() => setPrompt(quickPowerBiReportTypes.find((item) => item.type === type)?.prompt ?? `Build a ${reportTypeLabel(type)}.`)}
                  type="button"
                >
                  {reportTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Unavailable until data refresh</p>
            <div className="mt-2 space-y-1 text-xs text-[var(--econ-muted)]">
              {availability.unavailable_report_types.length ? availability.unavailable_report_types.map((item) => (
                <p key={item.type}>{reportTypeLabel(item.type)} - {item.reason}</p>
              )) : <p>All configured quick reports have supporting rows.</p>}
            </div>
          </div>
        </div>
        {availability.mismatch_warning ? (
          <div className="rounded-xl border border-[var(--econ-risk)]/40 bg-[var(--econ-risk)]/10 p-3 text-sm leading-6 text-[#ffc7a6]">
            <p>{availability.mismatch_warning}</p>
            <p>Checked table: parcel_economic_signal_fact; current rows: {availability.parcel_economic_signal_fact_rows}. Likely fixes: check /economics/powerbi-export, rebuild economics export/demo data, and confirm economics intelligence is not fallback_partial.</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/15 px-4 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
            onClick={generateReport}
            type="button"
          >
            Generate Power BI Report
          </button>
          {status ? <span className="self-center text-xs text-[var(--econ-green)]">{status}</span> : null}
        </div>
      </div>
      {report ? (
        <section className="mt-5 grid gap-4 rounded-2xl border border-[var(--econ-border)] bg-black/20 p-4" data-econ-tour="generated-report-preview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-gold)]">
                Generated Report Preview
              </p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--econ-text)]">{report.title}</h3>
              {includeSections.summary ? (
                <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--econ-muted)]">{report.summary}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]" onClick={saveReport} type="button">
                Save Report to Bucket
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={sendReportToPrint} type="button">
                Send Report to Print
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => void copySummary()} type="button">
                Copy Summary
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={downloadReport} type="button">
                Download Report JSON
              </button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {Object.entries(includeSections).map(([key, checked]) => (
              <label className="flex items-center gap-2 rounded-lg border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2 text-xs text-[var(--econ-muted)]" key={key}>
                <input
                  checked={checked}
                  onChange={() =>
                    setIncludeSections((current) => ({
                      ...current,
                      [key]: !current[key as GeneratedReportSectionKey],
                    }))
                  }
                  type="checkbox"
                />
                {generatedReportSectionLabel(key as GeneratedReportSectionKey)}
              </label>
            ))}
          </div>
          {report.diagnostics.length ? (
            <div className="rounded-xl border border-[var(--econ-risk)]/40 bg-[var(--econ-risk)]/10 p-3 text-sm leading-6 text-[#ffc7a6]">
              {report.diagnostics.map((item) => <p key={item}>{item}</p>)}
              <p>Refresh data / inspect export: check /economics/powerbi-export if export tables look empty.</p>
            </div>
          ) : null}
          {includeSections.kpis ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {report.kpis.map((kpi) => <MetricPill key={kpi.label} label={kpi.label} value={kpi.value} />)}
            </div>
          ) : null}
          {includeSections.visuals ? (
            report.visuals.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {report.visuals.map((visual) => (
                <GeneratedReportVisualCard
                  key={visual.visual_id}
                  onSave={() =>
                    onAddReportBucketItem({
                      caveats: [visual.caveat],
                      chart_config: generatedVisualToRecipeConfig(visual),
                      content: visual.powerbi_recipe,
                      id: `visual-${visual.visual_id}`,
                      powerbi_recipe: visual.powerbi_recipe,
                      related_tables: [visual.source_table],
                      source_page: "Power BI & Tools",
                      summary: `${chartVisualLabel(visual.visual_type)} on ${visual.source_table}.`,
                      title: visual.title,
                      type: "chart",
                    })
                  }
                  visual={visual}
                />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--econ-border)] px-3 py-4 text-sm text-[var(--econ-muted)]">
                No chart visuals can render from the currently available rows. Use the tables below or refresh the Power BI export.
              </p>
            )
          ) : null}
          {report.unavailable_visuals.length ? (
            <details className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--econ-text)]">
                Unavailable visuals
              </summary>
              <div className="mt-3 space-y-2 text-sm text-[var(--econ-muted)]">
                {report.unavailable_visuals.map((item) => (
                  <p key={`${item.visual.visual_id}-${item.reason}`}>
                    {item.title} - {item.reason}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
          {includeSections.tables ? (
            <div className="grid gap-3">
              {report.tables.map((table) => (
                <GeneratedReportTableCard
                  key={table.title}
                  onSave={() =>
                    onAddReportBucketItem({
                      content: generatedTableText(table),
                      id: `table-${slugifyReportTitle(table.title)}`,
                      source_page: "Power BI & Tools",
                      summary: `${table.rows.length} preview rows.`,
                      title: table.title,
                      type: "evidence_pack",
                    })
                  }
                  table={table}
                />
              ))}
            </div>
          ) : null}
          {includeSections.caveats ? (
            <p className="rounded-xl border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/[0.07] px-3 py-2 text-sm leading-6 text-[#f7dc93]">
              {report.caveats[0]}
            </p>
          ) : null}
          <details className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--econ-text)]">
              Show Power BI Details
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
              {report.powerbi_details}
            </pre>
          </details>
        </section>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--econ-border)] px-3 py-4 text-sm leading-6 text-[var(--econ-muted)]">
          Choose a report type or describe the report you want, then generate a preview.
        </p>
      )}
    </EconPanel>
  );
}

function PowerBiChartBuilder({
  aiAction,
  availability,
  onAddReportBucketItem,
  payload,
}: {
  aiAction?: PowerBiAskActionRequest | null;
  availability: PowerBiReportDataAvailability;
  onAddReportBucketItem: (item: ReportBucketItemInput) => void;
  payload: EconomicsPowerBiExportResponse | null;
}) {
  const aiGeneratedPlan =
    aiAction?.actions && aiAction.actions.action_type !== "none"
      ? powerBiActionsToGeneratedPlan(aiAction.actions, payload, availability)
      : null;
  const aiInitialVisual = aiGeneratedPlan?.pages.flatMap((page) => page.visuals)[0];
  const aiInitialConfig = aiInitialVisual ? generatedVisualToRecipeConfig(aiInitialVisual) : null;
  const aiShouldFillCanvas =
    aiAction?.actions.action_type === "build_report" ||
    aiAction?.actions.action_type === "add_to_canvas";
  const [reportPrompt, setReportPrompt] = useState(
    aiGeneratedPlan?.generated_from_prompt ?? "Build me a Power BI report.",
  );
  const [generatedPlan, setGeneratedPlan] = useState<PowerBiGeneratedReportPlan | null>(aiGeneratedPlan);
  const [tableName, setTableName] = useState<PowerBiTableName>(
    aiInitialConfig?.tableName ?? "parcel_economic_signal_fact",
  );
  const [visualType, setVisualType] = useState<UserChartVisualType>(aiInitialConfig?.visualType ?? "bar");
  const [categoryField, setCategoryField] = useState(aiInitialConfig?.categoryField ?? "opportunity_class");
  const [valueField, setValueField] = useState(aiInitialConfig?.valueField ?? "signal_id");
  const [aggregation, setAggregation] = useState<UserChartAggregation>(aiInitialConfig?.aggregation ?? "count");
  const [filterField, setFilterField] = useState(aiInitialConfig?.filterField ?? "economic_segment");
  const [filterValue, setFilterValue] = useState(aiInitialConfig?.filterValue ?? "All");
  const [copyStatus, setCopyStatus] = useState<string | null>(
    aiGeneratedPlan ? "Ask CFS configured this report from your prompt." : null,
  );
  const [canvasItems, setCanvasItems] = useState<UserReportCanvasItem[]>(
    aiGeneratedPlan && aiShouldFillCanvas ? generatedPlanToCanvasItems(aiGeneratedPlan).slice(-8) : [],
  );
  const tableRows = payload?.tables[tableName] ?? [];
  const fields = powerBiChartFieldMetadata[tableName];
  const categoryOptions = fields.filter((field) =>
    ["category", "filter", "label", "date"].includes(field.role),
  );
  const valueOptions = fields.filter((field) =>
    ["value", "id", "filter", "category"].includes(field.role),
  );
  const filterOptions = fields.filter((field) =>
    field.role === "filter" || field.role === "category",
  );
  const selectedFilterValues = filterField
    ? ["All", ...uniqueFieldValues(tableRows, filterField).slice(0, 40)]
    : ["All"];
  const filteredRows =
    filterField && filterValue !== "All"
      ? tableRows.filter((row) => valueText(row[filterField]) === filterValue)
      : tableRows;
  const valueMeta = fields.find((field) => field.key === valueField);
  const activeAggregation = valueMeta?.type === "number" ? aggregation : "count";
  const chartRows = aggregateChartRows(
    filteredRows,
    categoryField,
    valueField,
    activeAggregation,
  );
  const currentChartConfig: UserChartRecipeConfig = {
    aggregation: activeAggregation,
    categoryField,
    filterField,
    filterValue,
    tableName,
    valueField,
    visualType,
  };
  const recipe = chartRecipe(currentChartConfig);
  const chartTitle = `${chartFieldLabel(tableName, categoryField)} by ${
    activeAggregation === "count" ? "row count" : chartFieldLabel(tableName, valueField)
  }`;
  const canvasRecipe = canvasItems
    .map((item, index) => `Visual ${index + 1}${item.pageName ? ` (${item.pageName})` : ""}: ${item.title}\n${chartRecipe(item)}`)
    .join("\n\n");
  const changeTable = (nextTable: PowerBiTableName) => {
    const nextFields = powerBiChartFieldMetadata[nextTable];
    setTableName(nextTable);
    setCategoryField(nextFields.find((field) => field.role !== "value")?.key ?? nextFields[0]?.key ?? "");
    setValueField(nextFields.find((field) => field.role === "id" || field.role === "value")?.key ?? nextFields[0]?.key ?? "");
    setAggregation("count");
    setFilterField(nextFields.find((field) => field.role === "filter")?.key ?? "");
    setFilterValue("All");
  };
  const applyTemplate = (template: UserChartTemplate) => {
    setTableName(template.table);
    setVisualType(template.visual);
    setCategoryField(template.category);
    setValueField(template.value);
    setAggregation(template.aggregation);
    setFilterField(template.filterField ?? "");
    setFilterValue("All");
  };
  const applyChartConfig = (config: NonNullable<CfsAiPowerBiActions["chart_builder_config"]>) => {
    const nextTable = toPowerBiTableName(config.table_name);
    const nextVisual = normalizeActionVisualType(config.chart_type);
    const nextFields = powerBiChartFieldMetadata[nextTable];
    setTableName(nextTable);
    setVisualType(nextVisual);
    setCategoryField(safePowerBiField(nextTable, config.category_field ?? "", "category"));
    setValueField(safePowerBiField(nextTable, config.value_field ?? "", "value"));
    setAggregation(normalizeActionAggregation(config.aggregation));
    setFilterField(config.filter_field ? safePowerBiField(nextTable, config.filter_field, "filter") : "");
    setFilterValue(config.filter_value || "All");
    if (!config.category_field) {
      setCategoryField(nextFields.find((field) => field.role === "category")?.key ?? nextFields[0]?.key ?? "");
    }
  };
  const applyGeneratedPlanToBuilder = (plan: PowerBiGeneratedReportPlan) => {
    const firstVisual = plan.pages.flatMap((page) => page.visuals)[0];
    if (!firstVisual) return;
    applyChartConfig({
      aggregation: firstVisual.aggregation,
      category_field: firstVisual.axis,
      chart_type: firstVisual.visual_type,
      filter_field: firstVisual.filterField,
      filter_value: firstVisual.filterValue,
      table_name: firstVisual.source_table,
      title: firstVisual.title,
      value_field: firstVisual.value,
    });
  };
  const copyRecipe = async () => {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    await navigator.clipboard.writeText(recipe);
    setCopyStatus("Power BI recipe copied");
  };
  const addChartToCanvas = () => {
    setCanvasItems((items) =>
      [
        ...items,
        {
          ...currentChartConfig,
          id: `${tableName}-${visualType}-${categoryField}-${valueField}-${items.length + 1}`,
          title: chartTitle,
        },
      ].slice(-6),
    );
    setCopyStatus("Chart added to Power BI Report Canvas");
  };
  const addChartToBucket = () => {
    onAddReportBucketItem({
      chart_config: currentChartConfig,
      content: recipe,
      id: `chart-${slugifyReportTitle(chartTitle)}-${slugifyReportTitle(recipe)}`,
      powerbi_recipe: recipe,
      related_tables: [tableName],
      source_page: "Power BI & Tools",
      summary: `${chartVisualLabel(visualType)} using ${tableName}.`,
      title: chartTitle,
      type: "chart",
    });
    setCopyStatus("Added to Report Bucket");
  };
  const copyCanvasRecipe = async () => {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    await navigator.clipboard.writeText(
      canvasRecipe || "Power BI Report Canvas is empty. Build a chart, then add it to the canvas before copying.",
    );
    setCopyStatus("Report recipe copied");
  };
  const generateReportPlan = () => {
    const plan = buildPowerBiReportPlan(reportPrompt, payload, availability);
    setGeneratedPlan(plan);
    setCopyStatus("Report plan generated");
  };
  const addPlanVisualsToCanvas = (plan: PowerBiGeneratedReportPlan) => {
    const generatedItems = generatedPlanToCanvasItems(plan);
    setCanvasItems((items) => [...items, ...generatedItems].slice(-8));
    setCopyStatus("Recommended visuals added to Power BI Report Canvas");
  };
  const addGeneratedPlanToBucket = (plan: PowerBiGeneratedReportPlan) => {
    onAddReportBucketItem(bucketItemFromGeneratedPlan(plan));
    setCopyStatus("Added to Report Bucket");
  };
  const addGeneratedVisualToBucket = (visual: PowerBiGeneratedVisual) => {
    onAddReportBucketItem({
      caveats: [visual.caveat],
      chart_config: generatedVisualToRecipeConfig(visual),
      content: visual.powerbi_recipe,
      id: `visual-${visual.visual_id}`,
      powerbi_recipe: visual.powerbi_recipe,
      related_tables: [visual.source_table],
      source_page: "Power BI & Tools",
      summary: `${chartVisualLabel(visual.visual_type)} on ${visual.source_table}.`,
      title: visual.title,
      type: "chart",
    });
    setCopyStatus("Added to Report Bucket");
  };
  const addGeneratedVisualsToCanvas = () => {
    if (!generatedPlan) return;
    addPlanVisualsToCanvas(generatedPlan);
  };
  const copyGeneratedInstructions = async () => {
    if (!navigator.clipboard || !generatedPlan) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    await navigator.clipboard.writeText(generatedReportPlanInstructions(generatedPlan));
    setCopyStatus("Power BI build recipe copied");
  };
  const downloadGeneratedPlan = () => {
    if (!generatedPlan) return;
    downloadJson(
      generatedPlan,
      `${slugifyReportTitle(generatedPlan.title)}_powerbi_report_plan.json`,
    );
    setCopyStatus("Report plan JSON downloaded");
  };
  const generatedVisualCount =
    generatedPlan?.pages.reduce((total, page) => total + page.visuals.length, 0) ?? 0;
  const generatedFilters = generatedPlan
    ? uniqueStrings(
        generatedPlan.pages.flatMap((page) =>
          page.visuals
            .map((visual) =>
              visual.filterField && visual.filterValue !== "All"
                ? `${visual.filterField} = ${visual.filterValue}`
                : "",
            )
            .filter(Boolean),
        ),
      )
    : [];
  return (
    <EconPanel
      description="Choose a CFS Economics table, fields, and visual type to preview a Power BI-style chart."
      kicker="Power BI visual builder"
      title="Build Your Own Chart"
      tourId="chart-builder"
    >
      <section className="mb-4 rounded-xl border border-[var(--econ-border)] bg-black/20 p-4" data-econ-tour="ai-report-builder">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--econ-gold)]">
              AI Power BI Report Builder
            </p>
            <h3 className="mt-1 text-base font-semibold text-[var(--econ-text)]">
              Generate dataset, visuals, and build steps
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--econ-muted)]">
              Describe the report you want. CFS will generate safe table choices, relationships, visuals, canvas recipes, and build steps.
            </p>
          </div>
          <button
            className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
            onClick={generateReportPlan}
            type="button"
          >
            Generate Report Plan
          </button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <textarea
              className="min-h-24 w-full resize-y rounded-xl border border-[var(--econ-border)] bg-black/30 px-3 py-3 text-sm text-[var(--econ-text)] outline-none transition placeholder:text-[var(--econ-muted)] focus:border-[var(--econ-gold)]"
              onChange={(event) => setReportPrompt(event.target.value)}
              value={reportPrompt}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {powerBiReportPromptExamples.map((example) => (
                <button
                  className="rounded-full border border-[var(--econ-border)] px-3 py-1.5 text-xs text-[var(--econ-muted)] transition hover:border-[var(--econ-gold)] hover:text-[var(--econ-text)]"
                  key={example}
                  onClick={() => setReportPrompt(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3 text-xs leading-5 text-[var(--econ-muted)]">
            <p className="font-semibold text-[var(--econ-text)]">What CFS generates</p>
            <ul className="mt-2 space-y-1">
              <li>Dataset tables and starter relationships.</li>
              <li>Visual cards ready for the Report Canvas.</li>
              <li>CSV/JSON export package instructions.</li>
              <li>Copyable Power BI Desktop build recipe.</li>
            </ul>
          </div>
        </div>
        {generatedPlan ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
                AI Generated Report Plan
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--econ-text)]">
                {generatedPlan.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
                {generatedPlan.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetricPill label="Visuals generated" value={String(generatedVisualCount)} />
                <MetricPill label="Pages generated" value={String(generatedPlan.pages.length)} />
                {generatedPlan.recommended_tables.map((table) => (
                  <span className="rounded-full border border-[var(--econ-border)] px-2.5 py-1 text-xs text-[var(--econ-muted)]" key={table}>
                    {table}
                  </span>
                ))}
                {generatedFilters.map((filter) => (
                  <span className="rounded-full border border-[var(--econ-gold)]/40 bg-[var(--econ-gold)]/10 px-2.5 py-1 text-xs text-[#ffe6a6]" key={filter}>
                    {filter}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {generatedPlan.pages.flatMap((page) =>
                  page.visuals.map((visual) => (
                    <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-3" key={visual.visual_id}>
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--econ-muted)]">
                        {page.page_name} · {chartVisualLabel(visual.visual_type)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--econ-text)]">
                        {visual.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--econ-muted)]">
                        {visual.source_table}: {visual.axis} · {visual.value}
                      </p>
                      <button
                        className="mt-3 rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                        onClick={() => addGeneratedVisualToBucket(visual)}
                        type="button"
                      >
                        Add to Report Bucket
                      </button>
                    </div>
                  )),
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-[var(--econ-text)]">
                Power BI build recipe
              </h3>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
                {generatedReportPlanInstructions(generatedPlan)}
              </pre>
              <div className="mt-3 grid gap-2">
                <button
                  className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                  onClick={() => applyGeneratedPlanToBuilder(generatedPlan)}
                  type="button"
                >
                  Apply to Chart Builder
                </button>
                <button
                  className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                  onClick={() => addGeneratedPlanToBucket(generatedPlan)}
                  type="button"
                >
                  Add Report Plan to Report Bucket
                </button>
                <button
                  className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
                  onClick={addGeneratedVisualsToCanvas}
                  type="button"
                >
                  Add Visuals to Report Canvas
                </button>
                <button
                  className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                  onClick={() => void copyGeneratedInstructions()}
                  type="button"
                >
                  Copy Power BI Build Steps
                </button>
                <button
                  className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                  onClick={downloadGeneratedPlan}
                  type="button"
                >
                  Download Report Plan JSON
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--econ-border)] bg-white/[0.025] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
              AI Generated Report Plan
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
              Ask CFS to build a report, then CFS will configure the chart builder and report canvas for you.
            </p>
          </div>
        )}
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-econ-tour="chart-templates">
        {userChartTemplates.map((template) => (
          <button
            className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3 text-left transition hover:border-[var(--econ-gold)]"
            key={template.name}
            onClick={() => applyTemplate(template)}
            type="button"
          >
            <span className="text-sm font-semibold text-[var(--econ-text)]">
              {template.name}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--econ-muted)]">
              {template.description}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ScenarioSelect
          label="Step 1 - Table"
          onChange={(value) => changeTable(value as PowerBiTableName)}
          options={Object.keys(powerBiChartFieldMetadata)}
          value={tableName}
        />
        <ScenarioSelect
          label="Step 2 - Visual"
          onChange={(value) => setVisualType(value as UserChartVisualType)}
          options={["bar", "donut", "line", "matrix"]}
          value={visualType}
        />
        <ScenarioSelect
          label="Step 3 - Category / axis"
          onChange={setCategoryField}
          options={categoryOptions.map((field) => field.key)}
          value={categoryField}
        />
        <ScenarioSelect
          label="Value / measure"
          onChange={setValueField}
          options={valueOptions.map((field) => field.key)}
          value={valueField}
        />
        <ScenarioSelect
          label="Aggregation"
          onChange={(value) => setAggregation(value as UserChartAggregation)}
          options={valueMeta?.type === "number" ? ["count", "sum", "average"] : ["count"]}
          value={activeAggregation}
        />
        <ScenarioSelect
          label="Optional filter"
          onChange={(value) => {
            setFilterField(value === "None" ? "" : value);
            setFilterValue("All");
          }}
          options={["None", ...filterOptions.map((field) => field.key)]}
          value={filterField || "None"}
        />
        {filterField ? (
          <ScenarioSelect
            label="Filter value"
            onChange={setFilterValue}
            options={selectedFilterValues}
            value={filterValue}
          />
        ) : null}
      </div>
      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--econ-text)]">Step 5 - Preview</h3>
            <span className="text-xs text-[var(--econ-muted)]">{filteredRows.length} rows</span>
          </div>
          {visualType === "bar" ? <UserChartBar rows={chartRows} /> : null}
          {visualType === "donut" ? <UserChartDonut rows={chartRows} /> : null}
          {visualType === "line" ? <UserChartLine rows={chartRows} /> : null}
          {visualType === "matrix" ? (
            <UserChartMatrix
              rowField={categoryField}
              rows={filteredRows}
              valueFields={[valueField, filterField].filter(Boolean)}
            />
          ) : null}
          {visualType === "donut" && chartRows.length > 6 ? (
            <p className="mt-3 rounded-lg border border-[var(--econ-gold)]/30 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs text-[#ffe6a6]">
              Pie charts work best with fewer categories. Consider a bar chart for long category lists.
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
          <h3 className="text-sm font-semibold text-[var(--econ-text)]">Step 6 - Power BI recipe</h3>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
            {recipe}
          </pre>
          <button
            className="mt-3 rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
            onClick={() => void copyRecipe()}
            type="button"
          >
            Copy Power BI recipe
          </button>
	          <button
	            className="ml-2 mt-3 rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
	            onClick={addChartToCanvas}
	            type="button"
	          >
	            Add to Report Canvas
	          </button>
	          <button
	            className="ml-2 mt-3 rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
	            onClick={addChartToBucket}
	            type="button"
	          >
	            Add to Report Bucket
	          </button>
          {copyStatus ? (
            <p className="mt-2 text-xs text-[var(--econ-green)]">{copyStatus}</p>
          ) : null}
        </div>
      </section>
      <section className="mt-4 rounded-xl border border-[var(--econ-border)] bg-black/20 p-4" data-econ-tour="report-canvas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--econ-text)]">Power BI Report Canvas</h3>
            <p className="mt-1 text-xs text-[var(--econ-muted)]">
              Collect chart recipes before copying a Power BI page plan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
	            <button
	              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
	              disabled={!canvasItems.length}
	              onClick={() => void copyCanvasRecipe()}
	              type="button"
	            >
	              Copy Report Recipe
	            </button>
	            <button
	              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
	              disabled={!canvasItems.length}
	              onClick={() => {
	                onAddReportBucketItem({
	                  content: canvasRecipe,
	                  id: `report-canvas-${slugifyReportTitle(canvasRecipe)}`,
	                  powerbi_recipe: canvasRecipe,
	                  related_tables: uniquePowerBiTables(canvasItems.map((item) => item.tableName)),
	                  source_page: "Power BI & Tools",
	                  summary: `${canvasItems.length} report canvas visual recipes.`,
	                  title: "Power BI Report Canvas Recipe",
	                  type: "powerbi_recipe",
	                });
	                setCopyStatus("Added to Report Bucket");
	              }}
	              type="button"
	            >
	              Add Canvas to Bucket
	            </button>
            <button
              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
              disabled={!canvasItems.length}
              onClick={() => setCanvasItems([])}
              type="button"
            >
              Clear canvas
            </button>
          </div>
        </div>
        {canvasItems.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {canvasItems.map((item, index) => (
              <div
                className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3"
                key={item.id}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
                  Visual {index + 1}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--econ-text)]">
                  {item.title}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--econ-muted)]">
                  {chartVisualLabel(item.visualType)} | {item.tableName}
                </p>
                {item.pageName ? (
                  <p className="mt-1 truncate text-xs text-[var(--econ-muted)]">
                    {item.pageName}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--econ-border)] px-3 py-4 text-sm text-[var(--econ-muted)]">
            Build a chart, then choose Add to Report Canvas to start a simple Power BI report outline.
          </p>
        )}
      </section>
      <DetailsBlock summary="Advanced field details" hint="Safe table fields available to the chart builder.">
        <div className="grid gap-2 md:grid-cols-2">
          {fields.map((field) => (
            <div
              className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-3 text-xs text-[var(--econ-muted)]"
              key={field.key}
            >
              <span className="font-semibold text-[var(--econ-text)]">{field.label}</span>
              <span className="block">Key: {field.key}</span>
              <span className="block">Type: {field.type}; role: {field.role}</span>
            </div>
          ))}
        </div>
      </DetailsBlock>
    </EconPanel>
  );
}

function UserChartBar({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return <EconomicsBarChart rows={rows.slice(0, 8)} />;
}

function UserChartDonut({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return <EconomicsDonutChart rows={rows.slice(0, 6)} />;
}

function UserChartLine({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data not available.</p>;
  }
  const chartRows = rows.slice(0, 8);
  const max = Math.max(...chartRows.map((row) => row.value), 1);
  const points = chartRows
    .map((row, index) => {
      const x = chartRows.length === 1 ? 50 : (index / (chartRows.length - 1)) * 100;
      const y = 100 - (row.value / max) * 84 - 8;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="grid gap-3">
      <svg aria-label="Line / trend chart" className="h-44 w-full" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
        <polyline fill="none" points={points} stroke="var(--econ-gold)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <EconomicsLegend rows={chartRows} />
    </div>
  );
}

function UserChartMatrix({
  rowField,
  rows,
  valueFields,
}: {
  rowField: string;
  rows: Array<Record<string, unknown>>;
  valueFields: string[];
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data not available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-left text-xs">
        <thead className="uppercase tracking-[0.14em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">{rowField}</th>
            {valueFields.map((field) => (
              <th className="px-3 py-2" key={field}>{field}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr className="bg-white/[0.025]" key={`${valueText(row[rowField])}-${index}`}>
              <td className="rounded-l-xl border-y border-l border-[var(--econ-border)] px-3 py-3 font-semibold text-[var(--econ-text)]">
                {valueText(row[rowField])}
              </td>
              {valueFields.map((field, fieldIndex) => (
                <td
                  className={`border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)] ${fieldIndex === valueFields.length - 1 ? "rounded-r-xl border-r" : ""}`}
                  key={field}
                >
                  {valueText(row[field])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneratedReportVisualCard({
  onSave,
  visual,
}: {
  onSave: () => void;
  visual: GeneratedReportVisualPreview;
}) {
  const chartRows = aggregateChartRows(visual.rows, visual.axis, visual.value, visual.aggregation);
  const valueFields = uniqueStrings([visual.value, visual.filterField, "data_confidence"].filter(Boolean));
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--econ-muted)]">
            {chartVisualLabel(visual.visual_type)} | {visual.source_table}
          </p>
          <h4 className="mt-1 text-sm font-semibold text-[var(--econ-text)]">{visual.title}</h4>
        </div>
        <button
          className="rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={onSave}
          type="button"
        >
          Save this visual
        </button>
      </div>
      <div className="mt-3">
        {!visual.rows.length ? (
          <p className="rounded-lg border border-[var(--econ-risk)]/40 bg-[var(--econ-risk)]/10 px-3 py-2 text-sm text-[#ffc7a6]">
            This visual needs {visual.source_table} rows, but that table currently has 0 matching rows.
          </p>
        ) : visual.visual_type === "donut" || visual.visual_type === "pie" ? (
          <UserChartDonut rows={chartRows} />
        ) : visual.visual_type === "matrix" || visual.visual_type === "table" ? (
          <UserChartMatrix rowField={visual.axis} rows={visual.rows} valueFields={valueFields} />
        ) : (
          <UserChartBar rows={chartRows} />
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--econ-muted)]">{visual.caveat}</p>
    </div>
  );
}

function GeneratedReportTableCard({
  onSave,
  table,
}: {
  onSave: () => void;
  table: GeneratedReportTablePreview;
}) {
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--econ-text)]">{table.title}</h4>
        <button
          className="rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={onSave}
          type="button"
        >
          Save this table
        </button>
      </div>
      {table.rows.length ? (
        <UserChartMatrix rowField={table.columns[0] ?? "display_label"} rows={table.rows} valueFields={table.columns.slice(1, 5)} />
      ) : (
        <p className="rounded-lg border border-[var(--econ-risk)]/40 bg-[var(--econ-risk)]/10 px-3 py-2 text-sm text-[#ffc7a6]">
          This table needs row-level export data, but no matching rows are available.
        </p>
      )}
    </div>
  );
}

function ReportBuilderGuide({
  guide,
  payload,
}: {
  guide: EconomicsPowerBiExportResponse["report_builder_guide"] | undefined;
  payload: EconomicsPowerBiExportResponse | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--econ-text)]">Import steps</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[var(--econ-muted)]">
            {(guide?.import_steps ?? powerBiWorkflowSteps).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--econ-text)]">Relationship model</h2>
          <div className="mt-2 grid gap-2">
            {(guide?.relationships ?? payload?.relationships ?? []).map((row) => (
              <div
                className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-3 text-sm text-[var(--econ-muted)]"
                key={`${row.from_table}-${row.from_column}-${row.to_table}`}
              >
                <span className="font-semibold text-[var(--econ-text)]">
                  {row.from_table}.{row.from_column} -&gt; {row.to_table}.{row.to_column}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        {(guide?.pages ?? []).map((page) => (
          <div className="econ-card rounded-xl p-4" key={page.page}>
            <h2 className="text-base font-semibold text-[var(--econ-text)]">
              {page.page}
            </h2>
            <p className="mt-1 text-sm text-[var(--econ-muted)]">{page.purpose}</p>
            <div className="mt-3 grid gap-2">
              {page.visuals.slice(0, 2).map((visual) => (
                <div
                  className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-3 text-xs leading-5 text-[var(--econ-muted)]"
                  key={String(visual.title)}
                >
                  <p className="font-semibold text-[var(--econ-text)]">
                    {String(visual.title)}
                  </p>
                  <p>{guideVisualDetails(visual)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DaxMeasureList({
  guide,
}: {
  guide: EconomicsPowerBiExportResponse["report_builder_guide"] | undefined;
}) {
  return (
    <div className="grid gap-2">
      {(guide?.suggested_measures ?? []).map((measure) => (
        <pre
          className="overflow-auto rounded-lg border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]"
          key={measure.name}
        >
          {measure.expression}
        </pre>
      ))}
      {guide?.measure_caveat ? (
        <p className="text-xs leading-5 text-[var(--econ-muted)]">
          {guide.measure_caveat}
        </p>
      ) : null}
    </div>
  );
}

function ConceptList({
  guide,
}: {
  guide: EconomicsPowerBiExportResponse["report_builder_guide"] | undefined;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {(guide?.concepts ?? []).map((concept) => (
        <div
          className="rounded-lg border border-[var(--econ-border)] bg-black/20 p-3 text-xs leading-5 text-[var(--econ-muted)]"
          key={concept.term}
        >
          <span className="font-semibold text-[var(--econ-text)]">{concept.term}: </span>
          {concept.description}
        </div>
      ))}
    </div>
  );
}

function QaChecklist({
  onAddBucket,
  onCopy,
}: {
  onAddBucket: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={onCopy}
          type="button"
        >
          Copy QA Checklist
        </button>
        <button
          className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={onAddBucket}
          type="button"
        >
          Add QA Checklist to Report Bucket
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {powerBiImportQaChecklist.map((item) => (
          <div
            className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2 text-sm text-[var(--econ-muted)]"
            key={item}
          >
            <span className="mr-2 text-[var(--econ-green)]">OK</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportBucketPanel({
  items,
  onClear,
  onOpenPrint,
  onRemove,
  onTogglePrint,
  title,
}: {
  items: ReportBucketItem[];
  onClear: () => void;
  onOpenPrint?: () => void;
  onRemove: (id: string) => void;
  onTogglePrint: (id: string) => void;
  title: string;
}) {
  return (
    <EconPanel
      description="Save charts, report plans, recipes, or decision notes, then choose what appears in Print."
      kicker={`${items.length} items`}
      title={title}
      tourId="report-bucket"
    >
      {items.length ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {onOpenPrint ? (
              <button
                className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
                onClick={onOpenPrint}
                type="button"
              >
                Send Bucket to Print
              </button>
            ) : null}
            <button
              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
              onClick={onClear}
              type="button"
            >
              Clear bucket
            </button>
          </div>
          <div className="grid gap-2">
            {items.map((item) => (
              <div
                className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-full border border-[var(--econ-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--econ-muted)]">
                      {bucketTypeLabel(item.type)}
                    </span>
                    <h3 className="mt-2 truncate text-sm font-semibold text-[var(--econ-text)]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">
                      {item.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs text-[var(--econ-muted)]">
                      <input
                        checked={item.selected_for_print}
                        onChange={() => onTogglePrint(item.id)}
                        type="checkbox"
                      />
                      Include in Print
                    </label>
                    <button
                      className="rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-risk)]"
                      onClick={() => onRemove(item.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <details className="mt-2 text-xs text-[var(--econ-muted)]">
                  <summary className="cursor-pointer font-semibold text-[var(--econ-text)]">
                    Preview content
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--econ-border)] bg-black/20 p-3">
                    {bucketItemText(item)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--econ-border)] px-3 py-4 text-sm leading-6 text-[var(--econ-muted)]">
          Add charts, report plans, recipes, or decision memos to the bucket, then choose what to include in Print.
        </p>
      )}
    </EconPanel>
  );
}

function DetailsBlock({
  children,
  hint,
  summary,
}: {
  children: ReactNode;
  hint: string;
  summary: string;
}) {
  return (
    <details className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--econ-text)]">
        {summary}
        <span className="ml-2 font-normal text-[var(--econ-muted)]">{hint}</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function enterpriseOutputLabel(kind: EnterpriseOutputKind) {
  return enterpriseOutputCards.find((card) => card.kind === kind)?.title ?? "Output";
}

function powerBiTableSummary(payload: EconomicsPowerBiExportResponse | null) {
  if (!payload) return { status: "Loading Power BI export pack" };
  return {
    as_of: payload.as_of,
    mode: payload.mode,
    relationships: payload.relationships,
    suggested_report_pages: payload.suggested_visuals.map((page) => page.page),
    tables: Object.fromEntries(
      Object.entries(payload.tables).map(([name, rows]) => [name, rows.length]),
    ),
  };
}

function powerBiRelationshipNotes(payload: EconomicsPowerBiExportResponse | null) {
  return (payload?.relationships ?? [])
    .map(
      (row) =>
        `${row.from_table}.${row.from_column} -> ${row.to_table}.${row.to_column}`,
    )
    .join("\n");
}

function powerBiReportLayoutNotes(payload: EconomicsPowerBiExportResponse | null) {
  return (payload?.suggested_visuals ?? [])
    .map((page) => `${page.page}\n${page.visuals.map((visual) => `- ${visual}`).join("\n")}`)
    .join("\n\n");
}

function powerBiCsvRows(payload: EconomicsPowerBiExportResponse | null) {
  return powerBiCsvTableMetadata.map((row) => ({
    ...row,
    download_url: USE_DEMO_DATA
      ? `/demo-data/powerbi/${row.table_name}.csv`
      : buildApiUrl(`/economics/powerbi-export/csv/${row.table_name}`),
    row_count: payload?.tables[row.table_name]?.length ?? 0,
  }));
}

function powerBiCsvImportOrderNotes(rows: ReturnType<typeof powerBiCsvRows>) {
  return rows.map((row, index) => `${index + 1}. ${row.table_name} - ${row.primary_use}`).join("\n");
}

function guideVisualDetails(visual: Record<string, unknown>) {
  return Object.entries(visual)
    .filter(([key]) => key !== "title")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" | ");
}

function PageHeader({
  children,
  kicker,
  text,
  title,
  tourId,
}: {
  children?: ReactNode;
  kicker: string;
  text: string;
  title: string;
  tourId?: string;
}) {
  return (
    <section className="econ-panel rounded-2xl p-5 md:p-6" data-econ-tour={tourId}>
      <p className="econ-eyebrow">{kicker}</p>
      <h1 className="mt-2 text-3xl font-semibold text-[var(--econ-text)]">
        {title}
      </h1>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--econ-muted)]">
        {text}
      </p>
      {children}
    </section>
  );
}

function PageHelper({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/[0.07] px-4 py-3 text-sm leading-6 text-[#f7dc93]">
      <span className="font-semibold text-[#ffe6a6]">You are here: </span>
      {text}
    </section>
  );
}

function EconPanel({
  children,
  description,
  kicker,
  title,
  tourId,
}: {
  children: ReactNode;
  description?: string;
  kicker?: string;
  title: string;
  tourId?: string;
}) {
  return (
    <section className="econ-panel rounded-2xl p-4 md:p-5" data-econ-tour={tourId}>
      {kicker ? <p className="econ-eyebrow">{kicker}</p> : null}
      <h2 className={`${kicker ? "mt-2 " : ""}text-lg font-semibold text-[var(--econ-text)]`}>
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
          {description}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EconCard({ children }: { children: ReactNode }) {
  return <article className="econ-card rounded-2xl p-4">{children}</article>;
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2">
      <p className="text-lg font-semibold text-[var(--econ-text)]">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
        {label}
      </p>
    </div>
  );
}

function EconChip({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-full truncate rounded-full border border-[var(--econ-gold)]/30 bg-[var(--econ-gold)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f7dc93]">
      {children}
    </span>
  );
}

function KpiCard({ kpi }: { kpi: EconomicsKpi }) {
  return (
    <EconCard>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
        {kpi.status_band.replaceAll("_", " ")}
      </p>
      <h2 className="mt-2 text-sm font-semibold text-[var(--econ-text)]">
        {kpi.label}
      </h2>
      <p className="mt-3 text-2xl font-semibold text-[#f6e7bd]">
        {formatKpi(kpi)}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--econ-muted)]">
        {kpi.caveat}
      </p>
    </EconCard>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--econ-text)]">
        {value}
      </p>
    </div>
  );
}

function EconomicsBarChart({
  formatValue = formatNumber,
  rows,
}: {
  formatValue?: (value: number) => string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data not available.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => (
        <div key={row.label}>
          <div className="flex justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-[var(--econ-text)]">
              {row.label}
            </span>
            <span className="shrink-0 text-[var(--econ-muted)]">
              {formatValue(row.value)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--econ-green)] via-[var(--econ-gold)] to-[var(--econ-risk)]"
              style={{ width: `${max ? Math.max(5, (row.value / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EconomicsDonutChart({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!rows.length || !total) {
    return <p className="text-sm text-[var(--econ-muted)]">Data not available.</p>;
  }
  const chartRows = rows.slice(0, 6);
  const segments = chartRows.map((row, index) => ({
    offset: chartRows.slice(0, index).reduce((sum, item) => sum + (item.value / total) * 100, 0),
    percent: (row.value / total) * 100,
    row,
  }));
  return (
    <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
      <svg aria-label="Donut chart" className="h-40 w-40" viewBox="0 0 42 42" role="img">
        <circle cx="21" cy="21" fill="transparent" r="15.9" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        {segments.map(({ offset, percent, row }, index) => (
          <circle
            cx="21"
            cy="21"
            fill="transparent"
            key={row.label}
            r="15.9"
            stroke={econChartColors[index % econChartColors.length]}
            strokeDasharray={`${percent} ${100 - percent}`}
            strokeDashoffset={-offset}
            strokeWidth="7"
            transform="rotate(-90 21 21)"
          />
        ))}
        <text className="fill-[var(--econ-text)] text-[0.25rem] font-semibold" textAnchor="middle" x="21" y="20">
          {formatNumber(total)}
        </text>
        <text className="fill-[var(--econ-muted)] text-[0.16rem]" textAnchor="middle" x="21" y="23">
          signals
        </text>
      </svg>
      <EconomicsLegend rows={chartRows} />
    </div>
  );
}

function EconomicsLegend({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return (
    <div className="grid content-center gap-2">
      {rows.map((row, index) => (
        <div className="flex items-center justify-between gap-3 text-xs" key={row.label}>
          <span className="flex min-w-0 items-center gap-2 text-[var(--econ-text)]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: econChartColors[index % econChartColors.length] }}
            />
            <span className="truncate">{row.label}</span>
          </span>
          <span className="text-[var(--econ-muted)]">{formatNumber(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function EconomicsMatrixChart({
  rows,
}: {
  rows: Array<{ cells: Array<{ label: string; value: string }>; label: string }>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data not available.</p>;
  }
  return (
    <div className="grid gap-2">
      {rows.slice(0, 8).map((row) => (
        <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3" key={row.label}>
          <p className="text-sm font-semibold text-[var(--econ-text)]">{row.label}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {row.cells.map((cell) => (
              <div
                className={`rounded-lg border px-2 py-1.5 text-xs ${bandClass(cell.value)}`}
                key={`${row.label}-${cell.label}`}
              >
                <span className="block text-[10px] uppercase tracking-[0.12em] opacity-70">{cell.label}</span>
                <span className="font-semibold">{cell.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EconomicsTrendChart({ rows }: { rows: EconomicsScenarioOutput[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Scenario data not available.</p>;
  }
  return (
    <div className="grid gap-2">
      {rows.slice(0, 6).map((row, index) => (
        <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_8rem] items-center gap-2 text-xs" key={row.scenario_id}>
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: econChartColors[index % econChartColors.length] }} />
          <span className="min-w-0 truncate text-[var(--econ-text)]">{row.title}</span>
          <span className={`rounded-lg border px-2 py-1 text-center ${bandClass(row.constraint_adjusted_opportunity_band)}`}>
            {row.constraint_adjusted_opportunity_band}
          </span>
        </div>
      ))}
    </div>
  );
}

function EconomicsReadinessMatrix({ rows }: { rows: EconomicsReadinessRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data readiness is not available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left text-xs">
        <thead className="uppercase tracking-[0.14em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">Data status</th>
            <th className="px-3 py-2">Current use</th>
            <th className="px-3 py-2">Next data need</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="bg-white/[0.025]" key={row.domain}>
              <td className="rounded-l-xl border-y border-l border-[var(--econ-border)] px-3 py-3 font-semibold text-[var(--econ-text)]">
                {row.domain}
              </td>
              <td className="border-y border-[var(--econ-border)] px-3 py-3">
                <span className={`rounded-lg border px-2 py-1 ${bandClass(row.data_status)}`}>
                  {row.data_status.replaceAll("_", " ")}
                </span>
              </td>
              <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                {row.current_use}
              </td>
              <td className="rounded-r-xl border-y border-r border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                {row.gap_or_next_need}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EconomicsSlicerBar({
  filters,
  onReset,
  selected,
}: {
  filters: Array<{ label: string; onChange: (value: string) => void; options: string[]; value: string }>;
  onReset: () => void;
  selected: string[];
}) {
  const active = selected.filter((value) => value !== "All");
  return (
    <section className="rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {filters.map((filter) => (
          <label className="grid min-w-0 gap-1 text-xs text-[var(--econ-muted)]" key={filter.label}>
            <span className="truncate font-semibold uppercase tracking-[0.12em]">{filter.label}</span>
            <select
              className="w-full min-w-0 truncate rounded-xl border border-[var(--econ-border)] bg-[#11151b] px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)] focus:ring-2 focus:ring-inset focus:ring-[var(--econ-gold)]"
              onChange={(event) => filter.onChange(event.target.value)}
              value={filter.value}
            >
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          className="w-full min-w-0 self-end rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--econ-gold)]"
          onClick={onReset}
          type="button"
        >
          Reset filters
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--econ-border)] pt-3">
        {active.length ? active.map((value) => <EconChip key={value}>{value}</EconChip>) : <span className="text-xs text-[var(--econ-muted)]">No slicers applied.</span>}
      </div>
    </section>
  );
}

function EconomicsVisualPanel({
  children,
  description,
  recipe,
  title,
}: {
  children: ReactNode;
  description: string;
  recipe: string;
  title: string;
}) {
  return (
    <EconPanel title={title}>
      <p className="sr-only">{description}</p>
      {children}
      <DetailsBlock summary="Power BI recipe" hint="Table, fields, and slicer.">
        <p className="text-sm leading-6 text-[var(--econ-muted)]">{recipe}</p>
      </DetailsBlock>
    </EconPanel>
  );
}

function SignalTable({ signals }: { signals: EconomicsParcelSignal[] }) {
  if (!signals.length) {
    return <p className="text-sm text-[var(--econ-muted)]">No parcel signals available.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--econ-border)]">
      <div className="grid grid-cols-[minmax(8rem,1fr)_8rem_10rem] gap-2 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--econ-muted)]">
        <span>Area / parcel</span>
        <span>Value / acre</span>
        <span>Class</span>
      </div>
      {signals.map((signal) => (
        <div
          className="grid grid-cols-[minmax(8rem,1fr)_8rem_10rem] gap-2 border-t border-[var(--econ-border)] px-3 py-2 text-xs text-[var(--econ-muted)]"
          key={signal.parcel_id}
        >
          <span className="min-w-0 truncate text-[var(--econ-text)]">
            {signal.geography_label ?? signal.parcel_id}
          </span>
          <span>{currency(signal.value_per_acre)}</span>
          <span className="truncate">{signal.opportunity_class}</span>
        </div>
      ))}
    </div>
  );
}

function SegmentSummaryTable({ rows }: { rows: EconomicsSegmentSummary[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Segment summary is not available for the current filter.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--econ-border)]">
      <div className="grid grid-cols-[minmax(10rem,1fr)_5rem_8rem_8rem_minmax(12rem,1.3fr)] gap-2 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--econ-muted)]">
        <span>Segment</span>
        <span>Rows</span>
        <span>Median / acre</span>
        <span>Underbuilt</span>
        <span>Caveat</span>
      </div>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(10rem,1fr)_5rem_8rem_8rem_minmax(12rem,1.3fr)] gap-2 border-t border-[var(--econ-border)] px-3 py-2 text-xs text-[var(--econ-muted)]"
          key={row.segment}
        >
          <span className="min-w-0 truncate text-[var(--econ-text)]">{row.segment}</span>
          <span>{formatNumber(row.count)}</span>
          <span>{currency(row.median_value_per_acre)}</span>
          <span>{formatNumber(row.underbuilt_candidate_count)}</span>
          <span className="min-w-0 truncate">{row.segment_caveat}</span>
        </div>
      ))}
    </div>
  );
}

function WorkspaceTableTabs({
  activeTable,
  onChange,
}: {
  activeTable: WorkspaceTableKey;
  onChange: (table: WorkspaceTableKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {workspaceTableOptions.map((option) => (
        <button
          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            activeTable === option.key
              ? "border-[var(--econ-gold)]/60 bg-[var(--econ-gold)]/10 text-[#ffe6a6]"
              : "border-[var(--econ-border)] text-[var(--econ-muted)] hover:border-[var(--econ-gold)] hover:text-[var(--econ-text)]"
          }`}
          key={option.key}
          onClick={() => onChange(option.key)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SelectableSignalTable({
  onToggle,
  selectedIds,
  signals,
  tableKind,
}: {
  onToggle: (signal: EconomicsParcelSignal) => void;
  selectedIds: string[];
  signals: EconomicsParcelSignal[];
  tableKind: WorkspaceSignalTableKey;
}) {
  if (!signals.length) {
    return <p className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4 text-sm text-[var(--econ-muted)]">No rows match the current filters.</p>;
  }
  const columns: Array<[string, (signal: EconomicsParcelSignal) => ReactNode]> =
    tableKind === "underbuilt"
      ? [
          ["Area / parcel label", (signal: EconomicsParcelSignal) => signal.geography_label ?? signal.parcel_id],
          ["Underbuilt signal", (signal: EconomicsParcelSignal) => signal.economic_status_band.replaceAll("_", " ")],
          ["Opportunity class", (signal: EconomicsParcelSignal) => signal.opportunity_class],
          ["Constraint burden", workspaceBurdenBand],
          ["Recommended follow-up", (signal: EconomicsParcelSignal) => signal.recommended_followup],
        ]
      : tableKind === "taxBase"
        ? [
            ["Area / geography", (signal: EconomicsParcelSignal) => signal.geography_label ?? signal.parcel_id],
            ["Tax-base band", taxBaseBand],
            ["Fiscal attractiveness", fiscalAttractivenessBand],
            ["Public burden / constraint risk", workspaceBurdenBand],
            ["Data confidence", (signal: EconomicsParcelSignal) => signal.economic_data_confidence],
          ]
        : [
            ["Area / parcel label", (signal: EconomicsParcelSignal) => signal.geography_label ?? signal.parcel_id],
            ["Geography", (signal: EconomicsParcelSignal) => signal.geography_label ?? "Parcel context"],
            ["Value / acre band", (signal: EconomicsParcelSignal) => currency(signal.value_per_acre)],
            ["Improvement ratio band", (signal: EconomicsParcelSignal) => signal.improvement_to_land_ratio?.toFixed(2) ?? "Not available"],
            ["Opportunity class", (signal: EconomicsParcelSignal) => signal.opportunity_class],
            ["Data confidence", (signal: EconomicsParcelSignal) => signal.economic_data_confidence],
          ];
  return (
    <div className="max-h-[36rem] overflow-auto rounded-xl border border-[var(--econ-border)]">
      <table className="w-full min-w-[780px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#171a20] text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="w-24 px-3 py-2">Select</th>
            {columns.map(([header]) => (
              <th className="px-3 py-2" key={String(header)}>
                {String(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => {
            const selected = selectedIds.includes(signal.parcel_id);
            return (
              <tr
                className={`transition hover:bg-white/[0.045] ${
                  selected ? "bg-[var(--econ-gold)]/10" : "bg-transparent"
                }`}
                key={signal.parcel_id}
              >
                <td className="border-t border-[var(--econ-border)] px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--econ-text)]">
                    <input
                      checked={selected}
                      className="h-4 w-4 accent-[var(--econ-gold)]"
                      onChange={() => onToggle(signal)}
                      type="checkbox"
                    />
                    {selected ? "Selected" : "Select"}
                  </label>
                </td>
                {columns.map(([header, getValue], index) => (
                  <td
                    className={`border-t border-[var(--econ-border)] px-3 py-2 ${
                      index === 0
                        ? "font-semibold text-[var(--econ-text)]"
                        : "text-[var(--econ-muted)]"
                    }`}
                    key={`${signal.parcel_id}-${String(header)}`}
                  >
                    {getValue(signal)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectedRowsTray({
  actions = true,
  onClear,
  onUseSelectedInTools,
  onSendPrint,
  selectedSignals,
  tourId,
}: {
  actions?: boolean;
  onClear: () => void;
  onUseSelectedInTools: () => void;
  onSendPrint: () => void;
  selectedSignals: EconomicsParcelSignal[];
  tourId?: string;
}) {
  return (
    <EconPanel title="Selected for Power BI & Tools / Print" kicker={`${selectedSignals.length} selected`} tourId={tourId}>
      <div className="flex flex-col gap-4">
        <div className="flex max-h-64 flex-wrap gap-2 overflow-auto">
          {selectedSignals.length ? (
            selectedSignals.slice(0, 8).map((signal) => (
              <EconChip key={signal.parcel_id}>
                {signal.geography_label ?? signal.parcel_id}
              </EconChip>
            ))
          ) : (
            <p className="text-sm text-[var(--econ-muted)]">
              Select rows from the economics tables to move them into model, export, or print work.
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-[var(--econ-muted)]">
          Selected rows can become Power BI table filters, scenario model context, or decision-pack evidence.
        </p>
        {actions ? (
        <div className="grid gap-2">
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            disabled={!selectedSignals.length}
            onClick={onUseSelectedInTools}
            type="button"
          >
            Use selected rows in tools
          </button>
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            disabled={!selectedSignals.length}
            onClick={onSendPrint}
            type="button"
          >
            Send selected to Print
          </button>
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            disabled={!selectedSignals.length}
            onClick={onClear}
            type="button"
          >
            Clear selection
          </button>
        </div>
        ) : null}
      </div>
    </EconPanel>
  );
}

function ReadinessTable({ rows }: { rows: EconomicsReadinessRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--econ-muted)]">Data readiness is not available.</p>;
  }
  return (
    <div className="max-h-[34rem] overflow-auto rounded-xl border border-[var(--econ-border)]">
      <table className="w-full min-w-[740px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#171a20] text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Current use</th>
            <th className="px-3 py-2">Missing field / next need</th>
            <th className="px-3 py-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="transition hover:bg-white/[0.045]" key={row.domain}>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-text)]">
                {row.domain}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.data_status.replaceAll("_", " ")}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.current_use}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.gap_or_next_need}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.data_status === "available" ? "Strong" : row.data_status === "partial" ? "Medium" : "Data Needed"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenarioCandidateTable({ rows }: { rows: EconomicsScenarioOutput[] }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4 text-sm text-[var(--econ-muted)]">Scenario rows are not available.</p>;
  }
  return (
    <div className="max-h-[34rem] overflow-auto rounded-xl border border-[var(--econ-border)]">
      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#171a20] text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Suggested scenario</th>
            <th className="px-3 py-2">Upside band</th>
            <th className="px-3 py-2">Service burden</th>
            <th className="px-3 py-2">Infrastructure burden</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Next diligence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="transition hover:bg-white/[0.045]" key={row.scenario_id}>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-text)]">
                {row.title}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.title}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.estimated_tax_base_lift_band}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.service_burden_band}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.infrastructure_burden_band}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.data_confidence}
              </td>
              <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                {row.recommended_next_diligence}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenarioOutputList({ rows }: { rows: EconomicsScenarioOutput[] }) {
  return (
    <div className="grid gap-2">
      {rows.slice(0, 7).map((row) => (
        <div
          className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3"
          key={row.scenario_id}
        >
          <p className="text-sm font-semibold text-[var(--econ-text)]">{row.title}</p>
          <div className="mt-2 grid gap-2 text-xs text-[var(--econ-muted)] sm:grid-cols-2">
            <span>Tax-base lift: {row.estimated_tax_base_lift_band}</span>
            <span>Revenue / acre: {row.revenue_per_acre_band}</span>
            <span>Service burden: {row.service_burden_band}</span>
            <span>Infrastructure burden: {row.infrastructure_burden_band}</span>
            <span>Opportunity: {row.constraint_adjusted_opportunity_band}</span>
            <span>Confidence: {row.data_confidence}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--econ-muted)]">
            {row.recommended_next_diligence}
          </p>
        </div>
      ))}
    </div>
  );
}

function ScenarioSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      <select
        className="rounded-xl border border-[var(--econ-border)] bg-[#11151b] px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScenarioBandGrid({ output }: { output: ScenarioModelOutput }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        ["Estimated tax-base lift", output.taxBaseLift],
        ["Revenue per acre", output.revenuePerAcre],
        ["Service burden", output.serviceBurden],
        ["Infrastructure burden", output.infrastructureBurden],
        ["Constraint-adjusted opportunity", output.constraintOpportunity],
        ["Fiscal attractiveness", output.fiscalAttractiveness],
        ["Data confidence", output.dataConfidence],
      ].map(([label, value]) => (
        <MiniMetric key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function Matrix({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--econ-border)]">
      {rows.map((row) => (
        <div
          className="grid gap-2 border-t border-[var(--econ-border)] px-3 py-2 text-sm first:border-t-0 md:grid-cols-[12rem_minmax(0,1fr)]"
          key={row.label}
        >
          <span className="font-semibold text-[var(--econ-text)]">{row.label}</span>
          <span className="text-[var(--econ-muted)]">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function matrixRowsToText(rows: Array<{ label: string; value: string }>) {
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

type WorkspaceSignalTableKey = "baseline" | "taxBase" | "underbuilt";
type WorkspaceTableKey = WorkspaceSignalTableKey | "readiness" | "scenario";
type EconomicSegment =
  | "Residential"
  | "Commercial"
  | "Industrial / Employment"
  | "Mixed-Use / Corridor"
  | "Institutional / Civic"
  | "Agricultural / Rural"
  | "Vacant / Underbuilt"
  | "Infrastructure / Utility"
  | "Unknown / Needs Classification";

const economicSegmentOrder: EconomicSegment[] = [
  "Residential",
  "Commercial",
  "Industrial / Employment",
  "Mixed-Use / Corridor",
  "Institutional / Civic",
  "Agricultural / Rural",
  "Vacant / Underbuilt",
  "Infrastructure / Utility",
  "Unknown / Needs Classification",
];

const workspaceTableOptions: Array<{
  description: string;
  key: WorkspaceTableKey;
  label: string;
}> = [
  {
    description: "Parcel and area baseline rows for value-per-acre, improvement ratio, opportunity class, and confidence scanning.",
    key: "baseline",
    label: "Parcel Economic Baseline",
  },
  {
    description: "Rows where land, improvement, and constraint context suggest a redevelopment review queue.",
    key: "underbuilt",
    label: "Underbuilt / Redevelopment",
  },
  {
    description: "Rows where tax-base opportunity, fiscal attractiveness, burden, and confidence need comparison.",
    key: "taxBase",
    label: "Tax-Base Opportunity",
  },
  {
    description: "Scenario output bands that can be used as starting assumptions in Power BI & Tools.",
    key: "scenario",
    label: "Scenario Candidates",
  },
  {
    description: "Economic input domains, current use, missing fields, and next data needs.",
    key: "readiness",
    label: "Data Readiness",
  },
];

function filterEconomicSignals(
  signals: EconomicsParcelSignal[],
  filters: {
    dataConfidence: string;
    economicSegment?: string;
    geography: string;
    opportunityClass: string;
  },
) {
  return signals.filter((signal) => {
    const geography = signal.geography_label ?? "Parcel context";
    const economicSegment = signalSegment(signal);
    return (
      (!filters.economicSegment || filters.economicSegment === "All" || economicSegment === filters.economicSegment) &&
      (filters.geography === "All" || geography === filters.geography) &&
      (filters.opportunityClass === "All" || signal.opportunity_class === filters.opportunityClass) &&
      (filters.dataConfidence === "All" || signal.economic_data_confidence === filters.dataConfidence)
    );
  });
}

function signalSegment(signal: EconomicsParcelSignal): EconomicSegment {
  if (economicSegmentOrder.includes(signal.economic_segment as EconomicSegment)) {
    return signal.economic_segment as EconomicSegment;
  }
  const text = [
    signal.economic_status_band,
    signal.opportunity_class,
    signal.geography_label,
    signal.permit_activity_context,
    signal.floodplain_context,
    signal.school_pressure_context,
    signal.utility_readiness_context,
    signal.transportation_context,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/(airport|utility|infrastructure|rail|water|sewer|power)/.test(text)) return "Infrastructure / Utility";
  if (/(school|hospital|medical|convention|government|county|municipal|civic|institution)/.test(text)) return "Institutional / Civic";
  if (/(industrial|employment|business park|warehouse|manufacturing)/.test(text)) return "Industrial / Employment";
  if (/(mixed|corridor|downtown|center|village)/.test(text)) return "Mixed-Use / Corridor";
  if (/(commercial|retail|office)/.test(text)) return "Commercial";
  if (/(residential|subdivision|housing|single|multi)/.test(text)) return "Residential";
  if (/(agricultural|farm|rural)/.test(text)) return "Agricultural / Rural";
  if (signal.economic_status_band === "underbuilt_watch" || text.includes("underbuilt")) return "Vacant / Underbuilt";
  return "Unknown / Needs Classification";
}

function buildSegmentSummaryRows(
  intelligence: EconomicsIntelligenceResponse | null,
  signals: EconomicsParcelSignal[],
): EconomicsSegmentSummary[] {
  if (intelligence?.segment_summary?.length) {
    return [...intelligence.segment_summary].sort(
      (left, right) => economicSegmentIndex(left.segment) - economicSegmentIndex(right.segment),
    );
  }
  return economicSegmentOrder
    .flatMap((segment): EconomicsSegmentSummary[] => {
      const group = signals.filter((signal) => signalSegment(signal) === segment);
      if (!group.length) return [];
      return [{
        count: group.length,
        data_needed_count: group.filter((signal) => signal.economic_data_confidence === "data_needed").length,
        median_improvement_to_land_ratio: medianNumber(group.map((signal) => signal.improvement_to_land_ratio)),
        median_value_per_acre: medianNumber(group.map((signal) => signal.value_per_acre)),
        segment,
        segment_caveat: segmentCaveatText(segment),
        special_asset_count: group.filter((signal) => signal.special_asset_flag).length,
        tax_base_opportunity_count: group.filter((signal) => signal.economic_status_band === "tax_base_opportunity").length,
        top_geographies: uniqueValues(group.map((signal) => signal.geography_label)).slice(0, 3),
        underbuilt_candidate_count: group.filter((signal) => signal.economic_status_band === "underbuilt_watch").length,
      }];
    });
}

function segmentCaveatText(segment: string) {
  if (segment === "Institutional / Civic" || segment === "Infrastructure / Utility") {
    return "Special asset / non-comparable context; compare cautiously outside peer facilities.";
  }
  if (segment === "Unknown / Needs Classification") {
    return "Land-use or property segment is not exposed in the current normalized fields.";
  }
  return "Compare value per acre within similar land-use or property segments.";
}

function economicSegmentIndex(segment: string) {
  const index = economicSegmentOrder.indexOf(segment as EconomicSegment);
  return index === -1 ? economicSegmentOrder.length : index;
}

function medianNumber(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function filterWorkspaceSignals(
  signals: EconomicsParcelSignal[],
  filters: {
    burdenBand: string;
    dataConfidence: string;
    geography: string;
    opportunityClass: string;
  },
) {
  return filterEconomicSignals(signals, filters).filter(
    (signal) =>
      filters.burdenBand === "All" ||
      workspaceBurdenBand(signal) === filters.burdenBand,
  );
}

function workspaceBurdenBand(signal: EconomicsParcelSignal) {
  return inferConstraintBand(
    [
      signal.economic_status_band,
      signal.opportunity_class,
      signal.floodplain_context,
      signal.school_pressure_context,
      signal.utility_readiness_context,
      signal.transportation_context,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function taxBaseBand(signal: EconomicsParcelSignal) {
  if (signal.economic_status_band === "tax_base_opportunity") return "Strong";
  if (signal.opportunity_class.toLowerCase().includes("opportunity")) return "Review";
  if (signal.economic_status_band === "data_needed") return "Data Needed";
  return "Monitor";
}

function fiscalAttractivenessBand(signal: EconomicsParcelSignal) {
  if (signal.opportunity_class.toLowerCase().includes("stable")) return "Stable";
  if (signal.opportunity_class.toLowerCase().includes("opportunity")) return "Strong";
  if (signal.economic_data_confidence === "data_needed") return "Data Needed";
  return "Moderate";
}

function economicSnapshotSummary(
  summary: EconomicsIntelligenceResponse["summary"] | undefined,
  selectedSignals: EconomicsParcelSignal[],
) {
  if (selectedSignals.length) {
    return "This snapshot summarizes screening-level economic signals for selected CFS Economics records. The current evidence highlights selected opportunity classes, service burden context, data confidence, and recommended next diligence for deeper review.";
  }
  return `This snapshot summarizes the current CFS Economics context across ${formatNumber(summary?.total_parcels_analyzed)} parcels or areas. It highlights underbuilt/redevelopment candidates, tax-base opportunity bands, service burden context, and data confidence gaps for deeper review.`;
}

function economicDecisionMemo({
  caveats,
  classRows,
  followUps,
  hasSpecialAssets,
  scenario,
  segmentRows,
  snapshotRows,
}: {
  caveats: string[];
  classRows: Array<{ label: string; value: number }>;
  followUps: string[];
  hasSpecialAssets: boolean;
  scenario: EconomicsScenarioOutput;
  segmentRows: Array<{ label: string; value: number }>;
  snapshotRows: EconomicsParcelSignal[];
}) {
  const topClass = classRows[0]?.label ?? "No dominant opportunity class";
  const topSegment = segmentRows[0]?.label ?? "Unknown / Needs Classification";
  const confidenceRows = countRowsBy(snapshotRows, (signal) => signal.economic_data_confidence);
  const confidence = confidenceRows[0]?.label ?? scenario.data_confidence ?? "Data Needed";
  return [
    "CFS Economics Decision Memo",
    `Selected economics records show a screening-level mix of ${topClass}, ${topSegment}, and ${confidence} data confidence.`,
    `Economic upside: tax-base lift is ${scenario.estimated_tax_base_lift_band}; revenue per acre is ${scenario.revenue_per_acre_band}.`,
    `Public burden risk: service burden is ${scenario.service_burden_band}; infrastructure burden is ${scenario.infrastructure_burden_band}.`,
    hasSpecialAssets
      ? "Comparison caution: selected/report rows include special assets that should be reviewed separately."
      : "Comparison caution: compare value per acre within similar economic segments.",
    "Recommended next diligence:",
    ...followUps.slice(0, 4).map((item) => `- ${item}`),
    "Caveats:",
    ...caveats.slice(0, 3).map((item) => `- ${item}`),
  ].join("\n");
}

function nextDiligenceItems(selectedSignals: EconomicsParcelSignal[]) {
  const selectedFollowUps = selectedSignals
    .map((signal) => signal.recommended_followup)
    .filter(Boolean)
    .slice(0, 3);
  return [
    "Verify missing parcel, tax, acreage, land value, and improvement value fields.",
    "Compare selected rows with observed permit activity before presentation.",
    "Review floodplain and service burden context for selected areas.",
    "Check utility readiness and transportation context where confidence is partial.",
    "Compare scenario assumptions before using tax-base lift bands.",
    "Export CSVs to Power BI if preparing an external report.",
    ...selectedFollowUps,
  ].slice(0, 6);
}

function burdenContextRows(
  signals: EconomicsParcelSignal[],
  scenario: EconomicsScenarioOutput,
) {
  const first = signals[0];
  return [
    {
      evidence: first?.opportunity_class ?? "Scenario baseline",
      label: "Tax-base opportunity",
      next: "Compare opportunity band with segment and constraint context.",
      value: first ? taxBaseBand(first) : scenario.estimated_tax_base_lift_band,
    },
    {
      evidence: first?.school_pressure_context ?? "Scenario service-burden band",
      label: "Service / school burden",
      next: "Review school and service assumptions before presentation.",
      value: scenario.service_burden_band,
    },
    {
      evidence: first?.utility_readiness_context ?? "Official utility capacity remains a data need.",
      label: "Infrastructure burden",
      next: "Verify utility readiness and infrastructure assumptions.",
      value: scenario.infrastructure_burden_band,
    },
    {
      evidence: first?.floodplain_context ?? "Flood or constraint overlay should be checked for selected geography.",
      label: "Constraint burden",
      next: "Check floodplain and environmental constraint layers.",
      value: first?.constraint_burden_band ?? "Data Needed",
    },
    {
      evidence: first?.public_cost_risk_band ?? "Public cost risk is shown as a screening band.",
      label: "Public cost risk",
      next: "Compare fiscal upside with service burden before next-stage review.",
      value: first?.public_cost_risk_band ?? "Data Needed",
    },
    {
      evidence: first?.segment_caveat ?? "Value per acre is segment-sensitive.",
      label: "Data confidence",
      next: "Resolve data-needed fields before treating the snapshot as decision-ready.",
      value: first?.economic_data_confidence ?? scenario.data_confidence,
    },
  ];
}

function printEvidencePackRows({
  hasSelectedRows,
  readinessRows,
  reportRows,
  scenario,
}: {
  hasSelectedRows: boolean;
  readinessRows: EconomicsReadinessRow[];
  reportRows: EconomicsParcelSignal[];
  scenario: EconomicsScenarioOutput;
}) {
  const missingData = readinessRows
    .filter((row) => row.data_status !== "available")
    .map((row) => `${row.domain}: ${row.gap_or_next_need}`)
    .slice(0, 3);
  return [
    {
      label: "Source tables / layers",
      value: "CFS Economics intelligence, parcel economic signals, scenario outputs, and data readiness.",
    },
    {
      label: "Rows used",
      value: hasSelectedRows
        ? `${reportRows.length} selected Power BI & Tools rows.`
        : "Current economics summary; select rows for a focused parcel/area report.",
    },
    {
      label: "Key metrics",
      value: "Median value per acre, opportunity class, economic segment, burden bands, and data confidence.",
    },
    {
      label: "Scenario assumption",
      value: `${scenario.title}: tax-base lift ${scenario.estimated_tax_base_lift_band}; service burden ${scenario.service_burden_band}.`,
    },
    {
      label: "Missing data",
      value: missingData.join("; ") || "No elevated missing-data item in the current readiness summary.",
    },
    {
      label: "Related CFS pages",
      value: "Power BI & Tools, Economic Dashboard, Print.",
    },
  ];
}

function economicsSignalsFromPowerBiExport(
  payload: EconomicsPowerBiExportResponse | null,
): EconomicsParcelSignal[] {
  const rows = payload?.tables.parcel_economic_signal_fact ?? [];
  return rows.map((row, index) => {
    const parcelId =
      rowText(row.parcel_id) || rowText(row.signal_id) || `powerbi-signal-${index + 1}`;
    const opportunityClass =
      rowText(row.opportunity_class) || "Needs More Data Before Recommendation";
    const dataConfidence = normalizeEconomicConfidence(rowText(row.data_confidence));
    const segment =
      rowText(row.economic_segment) || "Unknown / Needs Classification";

    return {
      acreage: null,
      assessed_value: null,
      caveats: [
        "Derived from sanitized Power BI export fact rows.",
        "Value fields are banded; use source intelligence for raw parcel economics.",
      ],
      comparable_asset_flag: !rowBool(row.special_asset_flag),
      comparison_group: rowText(row.comparison_group) || segment,
      constraint_burden_band: rowText(row.constraint_burden_band),
      data_confidence: dataConfidence,
      display_label: rowText(row.display_label) || rowText(row.geography_label) || parcelId,
      economic_data_confidence: dataConfidence,
      economic_segment: segment,
      economic_segment_order: rowNumber(row.economic_segment_order) ?? rowNumber(row.segment_order),
      economic_status_band: statusBandFromOpportunity(opportunityClass),
      estimated_county_tax: null,
      estimated_county_tax_screening: null,
      evidence: [
        `Opportunity class: ${opportunityClass}.`,
        `Economic segment: ${segment}.`,
        `Data confidence: ${dataConfidence}.`,
      ],
      fiscal_attractiveness_band: rowText(row.fiscal_attractiveness_band),
      floodplain_context: null,
      geography_label: rowText(row.geography_label) || rowText(row.display_label) || parcelId,
      improvement_intensity_band: rowText(row.improvement_to_land_ratio_band),
      improvement_to_land_ratio: null,
      improvement_value: null,
      improvement_value_per_acre: null,
      jurisdiction: rowText(row.geography_label),
      land_efficiency_band: rowText(row.land_efficiency_band) || rowText(row.value_per_acre_band),
      land_value: null,
      land_value_per_acre: null,
      opportunity_class: opportunityClass,
      parcel_id: parcelId,
      permit_activity_context: null,
      profile_id: rowText(row.row_id) || parcelId,
      public_cost_risk_band: rowText(row.public_cost_risk_band),
      recommended_followup:
        rowText(row.recommended_followup) || "Review source economics intelligence before drawing conclusions.",
      related_layers: ["Power BI & Tools", "Economic Dashboard"],
      school_pressure_context: null,
      segment_caveat:
        rowText(row.segment_caveat) || "Compare value per acre within similar land-use or property segments.",
      special_asset_flag: rowBool(row.special_asset_flag),
      tax_base_opportunity_band: rowText(row.tax_base_opportunity_band),
      transportation_context: null,
      utility_readiness_context: null,
      value_per_acre: null,
    };
  });
}

function rowText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function rowNumber(value: unknown) {
  return typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : null;
}

function rowBool(value: unknown) {
  return value === true || value === "true";
}

function normalizeEconomicConfidence(value: string | null) {
  const normalized = (value ?? "").toLowerCase().replaceAll(" ", "_");
  return normalized || "data_needed";
}

function statusBandFromOpportunity(
  opportunityClass: string,
): EconomicsParcelSignal["economic_status_band"] {
  const normalized = opportunityClass.toLowerCase();
  if (normalized.includes("underbuilt")) return "underbuilt_watch";
  if (normalized.includes("tax-base") || normalized.includes("tax base")) return "tax_base_opportunity";
  if (normalized.includes("constrained")) return "infrastructure_constrained";
  if (normalized.includes("special asset")) return "special_asset";
  if (normalized.includes("industrial")) return "industrial_employment_candidate";
  if (normalized.includes("mixed-use") || normalized.includes("corridor")) return "mixed_use_corridor_candidate";
  if (normalized.includes("residential")) return "residential_growth_pressure";
  if (normalized.includes("stable")) return "stable_high_value";
  if (normalized.includes("burden")) return "low_fiscal_high_burden";
  if (normalized.includes("data")) return "data_needed";
  return "redevelopment_opportunity";
}

function countRowsBy<T>(rows: T[], getLabel: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const label = getLabel(row) || "Not available";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value);
}

function uniqueFieldValues(rows: Array<Record<string, unknown>>, field: string) {
  return uniqueValues(rows.map((row) => valueText(row[field]))).filter(
    (value) => value !== "Not available",
  );
}

function aggregateChartRows(
  rows: Array<Record<string, unknown>>,
  categoryField: string,
  valueField: string,
  aggregation: UserChartAggregation,
) {
  const buckets = new Map<string, { count: number; sum: number }>();
  rows.forEach((row) => {
    const label = valueText(row[categoryField]);
    const bucket = buckets.get(label) ?? { count: 0, sum: 0 };
    bucket.count += 1;
    bucket.sum += Number(row[valueField]) || 0;
    buckets.set(label, bucket);
  });
  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      value:
        aggregation === "sum"
          ? bucket.sum
          : aggregation === "average"
            ? bucket.sum / Math.max(bucket.count, 1)
            : bucket.count,
    }))
    .sort((left, right) => right.value - left.value);
}

function chartRecipe({
  aggregation,
  categoryField,
  filterField,
  filterValue,
  tableName,
  valueField,
  visualType,
}: UserChartRecipeConfig) {
  return [
    `Use table: ${tableName}`,
    `Visual: ${chartVisualLabel(visualType)}`,
    `Axis/category: ${chartFieldLabel(tableName, categoryField)}`,
    `Values: ${aggregation} ${chartFieldLabel(tableName, valueField)}`,
    `Filter/slicer: ${filterField ? `${chartFieldLabel(tableName, filterField)}${filterValue !== "All" ? ` = ${filterValue}` : ""}` : "None"}`,
    `Recommended page: ${chartRecommendedPage(tableName)}`,
    "Caveat: Use economic_segment first for parcel economics and keep special assets separate when comparing value per acre.",
  ].join("\n");
}

function chartFieldLabel(tableName: PowerBiTableName, field: string) {
  return powerBiChartFieldMetadata[tableName].find((row) => row.key === field)?.label ?? field;
}

function chartVisualLabel(visualType: UserChartVisualType) {
  return visualType === "donut" || visualType === "pie"
    ? "Pie / donut chart"
    : visualType === "line"
      ? "Line / trend chart"
      : visualType === "matrix" || visualType === "table"
        ? "Matrix / table"
        : "Bar chart";
}

function chartRecommendedPage(tableName: PowerBiTableName) {
  if (tableName === "scenario_output_fact" || tableName === "scenario_dim") return "Scenario Planning";
  if (tableName === "domain_readiness_dim") return "Data Confidence";
  return "Executive Dashboard";
}

function scenarioMatrixRows(rows: EconomicsScenarioOutput[]) {
  return rows.map((row) => ({
    cells: [
      { label: "Tax-base lift", value: row.estimated_tax_base_lift_band },
      { label: "Revenue / acre", value: row.revenue_per_acre_band },
      { label: "Service burden", value: row.service_burden_band },
      { label: "Infrastructure burden", value: row.infrastructure_burden_band },
      { label: "Confidence", value: row.data_confidence },
    ],
    label: row.title,
  }));
}

function fiscalBurdenRows(
  signals: EconomicsParcelSignal[],
  scenarios: EconomicsScenarioOutput[],
) {
  const classRows = countRowsBy(signals, (signal) => signal.opportunity_class)
    .slice(0, 4)
    .map((row) => ({
      cells: [
        { label: "Signals", value: formatNumber(row.value) },
        { label: "Service burden", value: inferBurdenBand(row.label) },
        { label: "Constraint risk", value: inferConstraintBand(row.label) },
      ],
      label: row.label,
    }));
  const scenarioRows = scenarios.slice(0, 4).map((row) => ({
    cells: [
      { label: "Service burden", value: row.service_burden_band },
      { label: "Infrastructure burden", value: row.infrastructure_burden_band },
      { label: "Constraint risk", value: row.constraint_adjusted_opportunity_band },
    ],
    label: row.title,
  }));
  return classRows.length ? classRows : scenarioRows;
}

function inferBurdenBand(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("burden") || normalized.includes("constrained")) return "Elevated Review";
  if (normalized.includes("data")) return "Data Needed";
  return "Moderate";
}

function inferConstraintBand(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("constrained") || normalized.includes("risk")) return "Elevated Review";
  if (normalized.includes("data")) return "Data Needed";
  return "Review";
}

function bandClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("strong") || normalized.includes("available") || normalized.includes("stable")) {
    return "border-[var(--econ-green)]/35 bg-[var(--econ-green)]/10 text-[#bff8d1]";
  }
  if (normalized.includes("elevated") || normalized.includes("high") || normalized.includes("constrained")) {
    return "border-[var(--econ-risk)]/35 bg-[var(--econ-risk)]/10 text-[#ffd1c2]";
  }
  if (normalized.includes("data") || normalized.includes("unavailable")) {
    return "border-[var(--econ-gold)]/35 bg-[var(--econ-gold)]/10 text-[#ffe6a6]";
  }
  return "border-[var(--econ-blue)]/35 bg-[var(--econ-blue)]/10 text-[#cfe5ff]";
}

function topSignals(
  signals: EconomicsParcelSignal[],
  key: "improvement_to_land_ratio" | "value_per_acre",
) {
  return [...signals]
    .filter((signal) => typeof signal[key] === "number")
    .sort((left, right) => (right[key] ?? 0) - (left[key] ?? 0))
    .slice(0, 8);
}

function formatKpi(kpi: EconomicsKpi) {
  if (kpi.unit === "dollars" || kpi.unit === "dollars_per_acre") {
    return currency(typeof kpi.value === "number" ? kpi.value : null);
  }
  return typeof kpi.value === "number" ? formatNumber(kpi.value) : (kpi.value ?? "Not available");
}

function currency(value: number | null | undefined) {
  return typeof value === "number"
    ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "Not available";
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Not available";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Freshness pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
}

type ScenarioAssumptions = {
  developmentType: string;
  floodConstraint: string;
  intensityBand: string;
  scenarioId: string;
  schoolServiceBurden: string;
  transportationAccess: string;
  utilityReadiness: string;
  valuePerAcreBand: string;
};

type ScenarioModelOutput = {
  constraintOpportunity: string;
  dataConfidence: string;
  fiscalAttractiveness: string;
  infrastructureBurden: string;
  recommendedNextDiligence: string;
  revenuePerAcre: string;
  serviceBurden: string;
  taxBaseLift: string;
};

function calculateScenarioOutput(assumptions: ScenarioAssumptions): ScenarioModelOutput {
  const upside =
    bandValue(assumptions.intensityBand) +
    bandValue(assumptions.valuePerAcreBand) +
    scenarioUpsideModifier(assumptions.scenarioId);
  const publicBurden =
    bandValue(assumptions.schoolServiceBurden) +
    bandValue(assumptions.floodConstraint) +
    scenarioBurdenModifier(assumptions.scenarioId);
  const readiness =
    confidenceValue(assumptions.utilityReadiness) +
    confidenceValue(assumptions.transportationAccess);
  const hasDataGap = [
    assumptions.schoolServiceBurden,
    assumptions.utilityReadiness,
    assumptions.transportationAccess,
    assumptions.floodConstraint,
  ].includes("Data Needed");
  const constraintRisk =
    assumptions.floodConstraint === "High" ||
    assumptions.scenarioId === "infrastructure_constrained_growth";
  const confidence =
    hasDataGap || readiness <= 2
      ? "Data Needed"
      : readiness >= 5
        ? "Strong"
        : "Moderate";

  return {
    constraintOpportunity: constraintRisk
      ? "Elevated Review"
      : bandFromScore(upside + readiness - publicBurden),
    dataConfidence: confidence,
    fiscalAttractiveness: hasDataGap
      ? "Data Needed"
      : bandFromScore(upside + readiness - publicBurden),
    infrastructureBurden:
      assumptions.utilityReadiness === "Low" ||
      assumptions.utilityReadiness === "Data Needed" ||
      assumptions.scenarioId === "infrastructure_constrained_growth"
        ? "Elevated Review"
        : bandFromScore(publicBurden - readiness + 3),
    recommendedNextDiligence: nextDiligence(assumptions, confidence),
    revenuePerAcre: bandFromScore(bandValue(assumptions.valuePerAcreBand) + scenarioRevenueModifier(assumptions.scenarioId)),
    serviceBurden: bandFromScore(publicBurden),
    taxBaseLift: hasDataGap && assumptions.valuePerAcreBand === "Low" ? "Data Needed" : bandFromScore(upside),
  };
}

function bandValue(value: string) {
  return value === "High" ? 3 : value === "Medium" ? 2 : value === "Low" ? 1 : 0;
}

function confidenceValue(value: string) {
  return value === "High" ? 3 : value === "Medium" ? 2 : value === "Low" ? 1 : 0;
}

function bandFromScore(score: number) {
  if (score <= 0) return "Data Needed";
  if (score <= 2) return "Low";
  if (score <= 4) return "Moderate";
  if (score <= 6) return "Strong";
  return "Elevated Review";
}

function scenarioUpsideModifier(id: string) {
  if (id === "targeted_investment" || id === "higher_density_redevelopment") return 2;
  if (id === "industrial_employment" || id === "mixed_use_corridor") return 1;
  if (id === "current_conditions") return -1;
  return 0;
}

function scenarioBurdenModifier(id: string) {
  if (id === "residential_growth" || id === "higher_density_redevelopment") return 2;
  if (id === "infrastructure_constrained_growth") return 3;
  if (id === "industrial_employment") return -1;
  return 0;
}

function scenarioRevenueModifier(id: string) {
  if (id === "industrial_employment" || id === "commercial_corridor" || id === "mixed_use_corridor") return 2;
  if (id === "targeted_investment" || id === "higher_density_redevelopment") return 1;
  return 0;
}

function nextDiligence(assumptions: ScenarioAssumptions, confidence: string) {
  if (confidence === "Data Needed") {
    return "Fill utility, transportation, school/service, or flood constraint gaps before using this scenario.";
  }
  if (assumptions.scenarioId === "industrial_employment") {
    return "Verify road access, utility readiness, flood exposure, and employment-site assumptions.";
  }
  if (assumptions.scenarioId === "residential_growth") {
    return "Compare housing assumptions with school/service burden and observed permit activity.";
  }
  if (assumptions.scenarioId === "targeted_investment") {
    return "Document public cost assumptions and test whether investment unlocks value.";
  }
  return "Document assumptions and compare output bands with parcel evidence before deeper review.";
}

function scenarioDecisionMemo(
  title: string,
  assumptions: ScenarioAssumptions,
  output: ScenarioModelOutput,
) {
  return [
    {
      label: "Executive takeaway",
      value: `${title} shows ${output.fiscalAttractiveness.toLowerCase()} fiscal attractiveness with ${output.infrastructureBurden.toLowerCase()} infrastructure burden.`,
    },
    {
      label: "Economic upside",
      value: `Tax-base lift is ${output.taxBaseLift.toLowerCase()} and revenue per acre is ${output.revenuePerAcre.toLowerCase()} under the selected assumptions.`,
    },
    {
      label: "Public burden / constraint risk",
      value: `Service burden is ${output.serviceBurden.toLowerCase()}; constraint-adjusted opportunity is ${output.constraintOpportunity.toLowerCase()}.`,
    },
    {
      label: "Data confidence",
      value: `${output.dataConfidence}. Scenario output depends on ${assumptions.utilityReadiness.toLowerCase()} utility readiness and ${assumptions.transportationAccess.toLowerCase()} transportation confidence.`,
    },
    { label: "Recommended next step", value: output.recommendedNextDiligence },
    {
      label: "Caveats",
      value:
        "Screening-level scenario only; not a formal appraisal, tax bill, fiscal impact study, or project approval recommendation.",
    },
  ];
}

function scenarioEvidencePack(
  inputs: EconomicsScenarioInput[],
  assumptions: ScenarioAssumptions,
  output: ScenarioModelOutput,
) {
  const missing = [
    assumptions.schoolServiceBurden === "Data Needed" ? "school/service burden" : null,
    assumptions.utilityReadiness === "Data Needed" ? "utility readiness" : null,
    assumptions.transportationAccess === "Data Needed" ? "transportation access" : null,
    assumptions.floodConstraint === "Data Needed" ? "flood/environmental constraint" : null,
  ].filter(Boolean);
  return [
    {
      label: "Source layers used",
      value:
        "Parcel Economic Baseline, Underbuilt Redevelopment Watchlist, Development Pressure Monitor, Floodplain Review, School Utilization + Permit Pressure, Utility Readiness, Transportation Context.",
    },
    {
      label: "Metrics used",
      value:
        inputs.map((input) => input.assumption).join(", ") ||
        "Value per acre, improvement-to-land ratio, estimated county tax, service burden, infrastructure confidence.",
    },
    {
      label: "Assumptions used",
      value: `${assumptions.developmentType}; intensity ${assumptions.intensityBand}; value-per-acre ${assumptions.valuePerAcreBand}; utility ${assumptions.utilityReadiness}; transportation ${assumptions.transportationAccess}; flood constraint ${assumptions.floodConstraint}.`,
    },
    {
      label: "Missing data",
      value: missing.length ? missing.join(", ") : "No selected assumptions are marked Data Needed.",
    },
    {
      label: "Related CFS layers",
      value:
        "Revenue per Acre Dashboard, Constraint-Adjusted Development Potential, Public Cost Risk Flag, Economic Scenario Model.",
    },
    { label: "Recommended next diligence", value: output.recommendedNextDiligence },
  ];
}

const developmentTypeOptions = [
  "Current Conditions",
  "Baseline Growth",
  "Residential Growth",
  "Commercial Corridor",
  "Industrial / Employment",
  "Mixed-Use Redevelopment",
  "Targeted Infrastructure Investment",
  "Infrastructure-Constrained Growth",
];

const basicBandOptions = ["Low", "Medium", "High"];
const burdenBandOptions = ["Low", "Medium", "High", "Data Needed"];
const confidenceBandOptions = ["High", "Medium", "Low", "Data Needed"];

const powerBiWorkflowSteps = [
  "Export CFS Economics tables.",
  "Open Power BI Desktop.",
  "Import JSON or CSV tables.",
  "Build relationships.",
  "Create KPI cards and charts.",
  "Build an executive report page.",
  "Optionally publish or embed later.",
];

type PowerBiTableName = keyof EconomicsPowerBiExportResponse["tables"];
type UserChartVisualType = "bar" | "donut" | "line" | "matrix" | "pie" | "table";
type UserChartAggregation = "count" | "sum" | "average";
type PowerBiAskActionRequest = {
  actions: CfsAiPowerBiActions;
  id: number;
};
type UserChartField = {
  key: string;
  label: string;
  role: "category" | "value" | "filter" | "label" | "date" | "id";
  type: "text" | "number" | "band" | "date" | "id";
};
type UserChartTemplate = {
  aggregation: UserChartAggregation;
  category: string;
  description: string;
  filterField?: string;
  name: string;
  table: PowerBiTableName;
  value: string;
  visual: UserChartVisualType;
};
type UserChartRecipeConfig = {
  aggregation: UserChartAggregation;
  categoryField: string;
  filterField: string;
  filterValue: string;
  tableName: PowerBiTableName;
  valueField: string;
  visualType: UserChartVisualType;
};
type UserReportCanvasItem = UserChartRecipeConfig & {
  id: string;
  pageName?: string;
  title: string;
};
type GeneratedReportSectionKey =
  | "caveats"
  | "kpis"
  | "powerbi_details"
  | "summary"
  | "tables"
  | "visuals";
type GeneratedReportIncludeState = Record<GeneratedReportSectionKey, boolean>;
type GeneratedReportVisualPreview = PowerBiGeneratedVisual & {
  rows: Array<Record<string, unknown>>;
};
type UnavailableGeneratedVisual = {
  reason: string;
  title: string;
  visual: PowerBiGeneratedVisual;
};
type GeneratedReportTablePreview = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  title: string;
};
type GeneratedPowerBiReportSnapshot = {
  caveats: string[];
  diagnostics: string[];
  generated_from_prompt: string;
  include_sections: GeneratedReportIncludeState;
  kpis: Array<{ label: string; value: string }>;
  powerbi_details: string;
  report_type: string;
  summary: string;
  tables: GeneratedReportTablePreview[];
  title: string;
  unavailable_visuals: UnavailableGeneratedVisual[];
  visuals: GeneratedReportVisualPreview[];
};
type PowerBiReportType =
  | "data_confidence"
  | "executive"
  | "scenario"
  | "scenario_data_confidence"
  | "special_assets"
  | "tax_base"
  | "underbuilt"
  | "utility";
type PowerBiReportAvailabilityItem = {
  available: boolean;
  reason: string;
  type: PowerBiReportType;
};
type PowerBiReportDataAvailability = {
  available_report_types: PowerBiReportType[];
  best_default_report_type: PowerBiReportType;
  domain_readiness_dim_rows: number;
  economics_intelligence_summary_available: boolean;
  economics_kpi_fact_rows: number;
  geography_dim_rows: number;
  mismatch_warning: string | null;
  parcel_economic_signal_fact_rows: number;
  report_types: PowerBiReportAvailabilityItem[];
  scenario_output_fact_rows: number;
  special_asset_rows: number;
  tax_base_opportunity_rows: number;
  underbuilt_rows: number;
  unavailable_report_types: PowerBiReportAvailabilityItem[];
  utility_summary_available: boolean;
  wsacc_summary_available: boolean;
};
type ReportBucketItemType =
  | "chart"
  | "decision_memo"
  | "evidence_pack"
  | "generated_report"
  | "powerbi_recipe"
  | "qa_checklist"
  | "report_plan"
  | "scenario_output";
type ReportBucketItem = {
  caveats?: string[];
  chart_config?: UserChartRecipeConfig;
  content: string;
  created_at: string;
  id: string;
  generated_report?: GeneratedPowerBiReportSnapshot;
  powerbi_recipe?: string;
  related_tables?: PowerBiTableName[];
  report_plan?: PowerBiGeneratedReportPlan;
  selected_for_print: boolean;
  source_page: "Ask CFS" | "Economic Dashboard" | "Power BI & Tools" | "Print";
  summary: string;
  title: string;
  type: ReportBucketItemType;
};
type ReportBucketItemInput = Omit<ReportBucketItem, "created_at" | "selected_for_print"> &
  Partial<Pick<ReportBucketItem, "created_at" | "selected_for_print">>;
type PowerBiGeneratedVisual = {
  aggregation: UserChartAggregation;
  axis: string;
  caveat: string;
  filterField: string;
  filterValue: string;
  page_name: string;
  powerbi_recipe: string;
  slicers: string[];
  source_table: PowerBiTableName;
  title: string;
  value: string;
  visual_id: string;
  visual_type: UserChartVisualType;
};
type PowerBiGeneratedReportPlan = {
  caveats: string[];
  dataset_plan: {
    dimensions: PowerBiTableName[];
    facts: PowerBiTableName[];
    measures: string[];
    slicers: string[];
    sort_fields: string[];
  };
  generated_from_prompt: string;
  next_steps: string[];
  pages: Array<{
    page_name: string;
    purpose: string;
    visuals: PowerBiGeneratedVisual[];
  }>;
  recommended_tables: PowerBiTableName[];
  relationships: EconomicsPowerBiExportResponse["relationships"];
  summary: string;
  title: string;
};

const powerBiChartFieldMetadata: Record<PowerBiTableName, UserChartField[]> = {
  domain_readiness_dim: [
    { key: "domain_id", label: "Domain ID", role: "id", type: "id" },
    { key: "domain_name", label: "Domain", role: "label", type: "text" },
    { key: "data_status", label: "Data status", role: "filter", type: "band" },
    { key: "geometry_status", label: "Geometry status", role: "filter", type: "band" },
    { key: "temporal_status", label: "Temporal status", role: "filter", type: "band" },
    { key: "current_use", label: "Current use", role: "label", type: "text" },
    { key: "next_data_need", label: "Next data need", role: "label", type: "text" },
  ],
  economics_kpi_fact: [
    { key: "kpi_id", label: "KPI ID", role: "id", type: "id" },
    { key: "kpi_name", label: "KPI", role: "category", type: "text" },
    { key: "value", label: "Value", role: "value", type: "number" },
    { key: "unit", label: "Unit", role: "filter", type: "text" },
    { key: "status_band", label: "Status band", role: "filter", type: "band" },
    { key: "source_mode", label: "Source mode", role: "filter", type: "text" },
    { key: "as_of", label: "As of", role: "date", type: "date" },
  ],
  geography_dim: [
    { key: "geography_id", label: "Geography ID", role: "id", type: "id" },
    { key: "geography_label", label: "Geography", role: "category", type: "text" },
    { key: "geography_type", label: "Geography type", role: "filter", type: "text" },
    { key: "jurisdiction", label: "Jurisdiction", role: "filter", type: "text" },
  ],
  parcel_economic_signal_fact: [
    { key: "signal_id", label: "Signal ID", role: "id", type: "id" },
    { key: "parcel_id", label: "Parcel ID", role: "id", type: "id" },
    { key: "geography_label", label: "Geography", role: "category", type: "text" },
    { key: "economic_segment", label: "Economic segment", role: "filter", type: "text" },
    { key: "economic_segment_order", label: "Segment sort order", role: "value", type: "number" },
    { key: "special_asset_flag", label: "Special asset flag", role: "filter", type: "text" },
    { key: "comparable_asset_flag", label: "Comparable asset flag", role: "filter", type: "text" },
    { key: "comparison_group", label: "Comparison group", role: "filter", type: "text" },
    { key: "segment_caveat", label: "Segment caveat", role: "label", type: "text" },
    { key: "opportunity_class", label: "Opportunity class", role: "category", type: "text" },
    { key: "opportunity_class_order", label: "Opportunity sort order", role: "value", type: "number" },
    { key: "value_per_acre_band", label: "Value per acre band", role: "filter", type: "band" },
    { key: "improvement_to_land_ratio_band", label: "Improvement-to-land band", role: "filter", type: "band" },
    { key: "tax_base_opportunity_band", label: "Tax-base opportunity", role: "filter", type: "band" },
    { key: "constraint_burden_band", label: "Constraint burden", role: "filter", type: "band" },
    { key: "fiscal_attractiveness_band", label: "Fiscal attractiveness", role: "filter", type: "band" },
    { key: "public_cost_risk_band", label: "Public cost risk", role: "filter", type: "band" },
    { key: "sewer_proxy_class", label: "Sewer proxy class", role: "category", type: "band" },
    { key: "utility_readiness_proxy_class", label: "Utility readiness proxy", role: "filter", type: "band" },
    { key: "sewer_proxy_confidence", label: "Sewer proxy confidence", role: "filter", type: "band" },
    { key: "sewer_basin_label", label: "Sewer basin", role: "category", type: "text" },
    { key: "utility_capacity_status", label: "Utility capacity status", role: "filter", type: "text" },
    { key: "planned_extension_status", label: "Planned extension status", role: "filter", type: "text" },
    { key: "band_order", label: "Band sort order", role: "value", type: "number" },
    { key: "data_confidence", label: "Data confidence", role: "filter", type: "band" },
    { key: "recommended_followup", label: "Recommended follow-up", role: "label", type: "text" },
  ],
  scenario_dim: [
    { key: "scenario_id", label: "Scenario ID", role: "id", type: "id" },
    { key: "scenario_name", label: "Scenario", role: "category", type: "text" },
    { key: "scenario_family", label: "Scenario family", role: "filter", type: "text" },
    { key: "description", label: "Description", role: "label", type: "text" },
    { key: "caveat", label: "Caveat", role: "label", type: "text" },
  ],
  scenario_output_fact: [
    { key: "scenario_id", label: "Scenario ID", role: "id", type: "id" },
    { key: "scenario_name", label: "Scenario", role: "category", type: "text" },
    { key: "intensity_band", label: "Intensity", role: "filter", type: "band" },
    { key: "value_assumption_band", label: "Value assumption", role: "filter", type: "band" },
    { key: "tax_base_lift_band", label: "Tax-base lift", role: "filter", type: "band" },
    { key: "revenue_per_acre_band", label: "Revenue per acre", role: "filter", type: "band" },
    { key: "service_burden_band", label: "Service burden", role: "filter", type: "band" },
    { key: "infrastructure_burden_band", label: "Infrastructure burden", role: "filter", type: "band" },
    { key: "fiscal_attractiveness_band", label: "Fiscal attractiveness", role: "filter", type: "band" },
    { key: "data_confidence", label: "Data confidence", role: "filter", type: "band" },
  ],
  time_dim: [
    { key: "year", label: "Year", role: "date", type: "date" },
    { key: "period_label", label: "Period", role: "category", type: "text" },
    { key: "data_available", label: "Data available", role: "filter", type: "band" },
  ],
};

const userChartTemplates: UserChartTemplate[] = [
  {
    aggregation: "count",
    category: "opportunity_class",
    description: "Count economics rows by opportunity class.",
    filterField: "economic_segment",
    name: "Opportunity Class Breakdown",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "bar",
  },
  {
    aggregation: "count",
    category: "economic_segment",
    description: "Show land-use/property segment mix.",
    filterField: "data_confidence",
    name: "Economic Segment Mix",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "donut",
  },
  {
    aggregation: "count",
    category: "domain_name",
    description: "Matrix-style data confidence register.",
    filterField: "data_status",
    name: "Data Confidence Register",
    table: "domain_readiness_dim",
    value: "current_use",
    visual: "matrix",
  },
  {
    aggregation: "count",
    category: "scenario_name",
    description: "Compare fiscal attractiveness by scenario.",
    filterField: "data_confidence",
    name: "Scenario Fiscal Attractiveness",
    table: "scenario_output_fact",
    value: "fiscal_attractiveness_band",
    visual: "bar",
  },
  {
    aggregation: "count",
    category: "scenario_name",
    description: "Review service and infrastructure burden bands.",
    filterField: "service_burden_band",
    name: "Service Burden by Scenario",
    table: "scenario_output_fact",
    value: "infrastructure_burden_band",
    visual: "matrix",
  },
  {
    aggregation: "count",
    category: "geography_label",
    description: "Count economics signals by geography.",
    filterField: "opportunity_class",
    name: "Geography Opportunity Count",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "bar",
  },
];

const powerBiReportPromptExamples = [
  "Build a report for underbuilt redevelopment candidates.",
  "Create visuals for economic segment comparison.",
  "Make a fiscal burden dashboard.",
  "Build a scenario comparison dashboard.",
  "Build a Utility Readiness + Growth Report.",
  "Create a Power BI page for special assets.",
  "Show value per acre by economic segment with caveats.",
];

const defaultGeneratedReportIncludes: GeneratedReportIncludeState = {
  caveats: true,
  kpis: true,
  powerbi_details: false,
  summary: true,
  tables: true,
  visuals: true,
};

const quickPowerBiReportTypes: Array<{ label: string; prompt: string; type: PowerBiReportType }> = [
  { label: "Executive Dashboard", prompt: "Build an executive dashboard.", type: "executive" },
  { label: "Scenario Comparison", prompt: "Build a scenario comparison dashboard.", type: "scenario" },
  { label: "Data Confidence Report", prompt: "Build a data confidence report.", type: "data_confidence" },
  { label: "Utility Readiness + Growth Report", prompt: "Build a Utility Readiness + Growth Report.", type: "utility" },
  { label: "Underbuilt Parcel Report", prompt: "Build an underbuilt parcel report.", type: "underbuilt" },
  { label: "Tax-Base Opportunity Report", prompt: "Build a tax-base opportunity report.", type: "tax_base" },
  { label: "Special Assets Review", prompt: "Build a special assets review.", type: "special_assets" },
];

function buildReportDataAvailability(
  payload: EconomicsPowerBiExportResponse | null,
  signals: EconomicsParcelSignal[] = [],
  dataReadiness: EconomicsReadinessRow[] = [],
  outputs: EconomicsScenarioOutput[] = [],
): PowerBiReportDataAvailability {
  const parcelRows = payload?.tables.parcel_economic_signal_fact ?? [];
  const kpiRows = payload?.tables.economics_kpi_fact?.length ?? 0;
  const scenarioRows = (payload?.tables.scenario_output_fact?.length ?? 0) || outputs.length;
  const readinessRows = (payload?.tables.domain_readiness_dim?.length ?? 0) || dataReadiness.length;
  const underbuiltRows = parcelRows.filter((row) =>
    valueText(row.opportunity_class).toLowerCase().includes("underbuilt"),
  ).length;
  const taxBaseRows = parcelRows.filter((row) =>
    `${valueText(row.opportunity_class)} ${valueText(row.tax_base_opportunity_band)}`
      .toLowerCase()
      .includes("opportunity"),
  ).length;
  const specialRows = parcelRows.filter((row) =>
    valueText(row.special_asset_flag).toLowerCase() === "true" ||
    valueText(row.opportunity_class).toLowerCase().includes("special asset"),
  ).length;
  const hasUtilityFields = parcelRows.some((row) =>
    ["sewer_proxy_class", "utility_readiness_proxy_class", "sewer_basin_label"].some((field) =>
      Boolean(valueText(row[field])),
    ),
  );
  const hasSummary = Boolean(kpiRows || signals.length);
  const states: PowerBiReportAvailabilityItem[] = [
    {
      available: Boolean(kpiRows || hasSummary),
      reason: "Needs KPI rows or economics summary context.",
      type: "executive",
    },
    {
      available: Boolean(parcelRows.length && underbuiltRows),
      reason: parcelRows.length ? "Needs underbuilt candidate rows." : "Needs parcel economic signal rows.",
      type: "underbuilt",
    },
    {
      available: Boolean(parcelRows.length && taxBaseRows),
      reason: parcelRows.length ? "Needs tax-base opportunity rows." : "Needs parcel economic signal rows.",
      type: "tax_base",
    },
    {
      available: Boolean(parcelRows.length && specialRows),
      reason: parcelRows.length ? "Needs special asset rows." : "Needs parcel economic signal rows.",
      type: "special_assets",
    },
    {
      available: Boolean(scenarioRows),
      reason: "Needs scenario_output_fact rows.",
      type: "scenario",
    },
    {
      available: Boolean(readinessRows),
      reason: "Needs domain_readiness_dim rows.",
      type: "data_confidence",
    },
    {
      available: Boolean(hasUtilityFields),
      reason: "Needs WSACC/utility proxy fields in the economics export.",
      type: "utility",
    },
  ];
  if (scenarioRows || readinessRows) {
    states.push({
      available: Boolean(scenarioRows || readinessRows),
      reason: "Needs scenario or domain readiness rows.",
      type: "scenario_data_confidence",
    });
  }
  const available = states.filter((item) => item.available).map((item) => item.type);
  const bestDefault =
    scenarioRows && readinessRows && !parcelRows.length
      ? "scenario_data_confidence"
      : (["executive", "scenario", "data_confidence", "utility", "underbuilt"] as PowerBiReportType[])
          .find((type) => available.includes(type)) ?? "executive";
  return {
    available_report_types: available,
    best_default_report_type: bestDefault,
    domain_readiness_dim_rows: readinessRows,
    economics_intelligence_summary_available: hasSummary,
    economics_kpi_fact_rows: kpiRows,
    geography_dim_rows: payload?.tables.geography_dim?.length ?? 0,
    mismatch_warning:
      hasSummary && !parcelRows.length
        ? "Economics intelligence has summary context, but parcel_economic_signal_fact has 0 rows. Rebuild or refresh the Power BI export before using parcel-level reports."
        : null,
    parcel_economic_signal_fact_rows: parcelRows.length,
    report_types: states,
    scenario_output_fact_rows: scenarioRows,
    special_asset_rows: specialRows,
    tax_base_opportunity_rows: taxBaseRows,
    underbuilt_rows: underbuiltRows,
    unavailable_report_types: states.filter((item) => !item.available),
    utility_summary_available: hasUtilityFields,
    wsacc_summary_available: hasUtilityFields,
  };
}

function reportTypeLabel(type: PowerBiReportType) {
  return quickPowerBiReportTypes.find((item) => item.type === type)?.label
    ?? (type === "scenario_data_confidence" ? "Scenario + Data Confidence Report" : type.replaceAll("_", " "));
}

function reportTypeFromPrompt(prompt: string): PowerBiReportType | null {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("utility") || normalized.includes("sewer") || normalized.includes("wsacc")) return "utility";
  if (normalized.includes("scenario + data") || (normalized.includes("scenario") && normalized.includes("confidence"))) return "scenario_data_confidence";
  if (normalized.includes("scenario") || normalized.includes("burden") || normalized.includes("fiscal")) return "scenario";
  if (normalized.includes("confidence") || normalized.includes("data readiness") || normalized.includes("data confidence")) return "data_confidence";
  if (normalized.includes("special asset")) return "special_assets";
  if (normalized.includes("tax-base") || normalized.includes("tax base")) return "tax_base";
  if (normalized.includes("underbuilt") || normalized.includes("redevelopment")) return "underbuilt";
  if (normalized.includes("segment") || normalized.includes("value per acre")) return "executive";
  return null;
}

function selectAvailableReportType(prompt: string, availability: PowerBiReportDataAvailability) {
  const requested = reportTypeFromPrompt(prompt);
  if (requested && availability.available_report_types.includes(requested)) return requested;
  return availability.best_default_report_type;
}

function reportSelectionNote(
  requested: PowerBiReportType | null,
  selected: PowerBiReportType,
  availability: PowerBiReportDataAvailability,
) {
  if (!requested || requested === selected) return "";
  return `CFS selected ${reportTypeLabel(selected)} because ${reportTypeLabel(requested)} is unavailable: ${availability.report_types.find((item) => item.type === requested)?.reason ?? "required rows are unavailable"}`;
}

function buildPowerBiReportPlan(
  prompt: string,
  payload: EconomicsPowerBiExportResponse | null,
  availability = buildReportDataAvailability(payload),
): PowerBiGeneratedReportPlan {
  const normalized = prompt.toLowerCase();
  const relationships = payload?.relationships?.length
    ? payload.relationships
    : defaultPowerBiRelationships;
  const requestedReportType = reportTypeFromPrompt(prompt);
  const selectedReportType = selectAvailableReportType(prompt, availability);
  const selectionNote = reportSelectionNote(requestedReportType, selectedReportType, availability);
  if (hasUnsafePowerBiReportRequest(normalized)) {
    const safeVisuals = [
      availability.domain_readiness_dim_rows
        ? generatedPowerBiVisual({
            axis: "domain_name",
            source_table: "domain_readiness_dim",
            title: "Data confidence register",
            value: "data_status",
            visual_type: "matrix",
          })
        : null,
      availability.scenario_output_fact_rows
        ? generatedPowerBiVisual({
            axis: "scenario_name",
            source_table: "scenario_output_fact",
            title: "Scenario output comparison",
            value: "fiscal_attractiveness_band",
            visual_type: "matrix",
          })
        : null,
      availability.parcel_economic_signal_fact_rows
        ? generatedPowerBiVisual({
            axis: "opportunity_class",
            source_table: "parcel_economic_signal_fact",
            title: "Opportunity class breakdown",
            value: "signal_id",
            visual_type: "bar",
          })
        : null,
    ].filter((visual): visual is PowerBiGeneratedVisual => Boolean(visual));
    return finalizedPowerBiReportPlan(
      prompt,
      "Safe CFS Economics Report Plan",
      "CFS cannot build report visuals from private contact fields, credential fields, internal model values, or probability-style outputs. This safe alternative uses sanitized economics facts and dimensions.",
      [
        reportPage("Safe Economics Review", "Use sanitized screening fields only.", safeVisuals),
      ],
      relationships,
      ["Use only the exported Power BI fact and dimension tables.", ...powerBiReportCaveats],
    );
  }

  if (selectedReportType === "scenario_data_confidence") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Scenario + Data Confidence Report",
      `${selectionNote ? `${selectionNote}. ` : ""}The preview uses the scenario model and data readiness matrix because those tables are available now.`,
      [
        reportPage("Scenario + Data Confidence", "Use available scenario and readiness context.", [
          availability.scenario_output_fact_rows
            ? generatedPowerBiVisual({
                axis: "scenario_name",
                source_table: "scenario_output_fact",
                title: "Scenario output comparison",
                value: "fiscal_attractiveness_band",
                visual_type: "matrix",
              })
            : null,
          availability.scenario_output_fact_rows
            ? generatedPowerBiVisual({
                axis: "scenario_name",
                source_table: "scenario_output_fact",
                title: "Service and infrastructure burden",
                value: "service_burden_band",
                visual_type: "matrix",
              })
            : null,
          availability.domain_readiness_dim_rows
            ? generatedPowerBiVisual({
                axis: "domain_name",
                source_table: "domain_readiness_dim",
                title: "Data confidence matrix",
                value: "data_status",
                visual_type: "matrix",
              })
            : null,
        ].filter((visual): visual is PowerBiGeneratedVisual => Boolean(visual))),
      ],
      relationships,
      uniqueStrings([
        selectionNote,
        "Parcel-level candidate charts are hidden until parcel_economic_signal_fact has rows.",
        ...powerBiReportCaveats,
      ]),
    );
  }

  if (selectedReportType === "utility") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Utility Readiness + Growth Report",
      `${selectionNote ? `${selectionNote}. ` : ""}Compare economic opportunity against WSACC sewer-proximity proxy context, subbasin labels, and utility data gaps.`,
      [
        reportPage("Utility Readiness + Growth", "Screen opportunity against sewer-proximity proxy context.", [
          generatedPowerBiVisual({
            axis: "sewer_proxy_class",
            caveat: "Sewer proximity is a proxy; capacity and planned extensions are data needed.",
            source_table: "parcel_economic_signal_fact",
            title: "Sewer proxy class breakdown",
            value: "signal_id",
            visual_type: "bar",
          }),
          availability.underbuilt_rows
            ? generatedPowerBiVisual({
                axis: "sewer_proxy_class",
                caveat: "Use this as screening context before utility due diligence.",
                filterField: "opportunity_class",
                filterValue: "Underbuilt Redevelopment Candidate",
                source_table: "parcel_economic_signal_fact",
                title: "Underbuilt candidates by sewer proxy",
                value: "signal_id",
                visual_type: "bar",
              })
            : null,
          generatedPowerBiVisual({
            axis: "sewer_basin_label",
            caveat: "Subbasins provide context, not a capacity confirmation.",
            source_table: "parcel_economic_signal_fact",
            title: "Subbasin review table",
            value: "utility_readiness_proxy_class",
            visual_type: "matrix",
          }),
        ].filter((visual): visual is PowerBiGeneratedVisual => Boolean(visual))),
      ],
      relationships,
      [
        "Use sewer_proxy_class and utility_readiness_proxy_class as proxy slicers only.",
        "Capacity and planned extension statuses remain data-needed until WSACC provides those layers.",
        ...powerBiReportCaveats,
      ],
    );
  }

  if (selectedReportType === "scenario") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Scenario Comparison Dashboard",
      `${selectionNote ? `${selectionNote}. ` : ""}Compare scenario output bands, fiscal attractiveness, service burden, infrastructure burden, and data confidence.`,
      [
        reportPage("Scenario Planning Model", "Compare scenario outputs and assumptions.", [
          generatedPowerBiVisual({
            axis: "scenario_name",
            source_table: "scenario_output_fact",
            title: "Scenario fiscal attractiveness",
            value: "fiscal_attractiveness_band",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "scenario_name",
            source_table: "scenario_output_fact",
            title: "Service and infrastructure burden matrix",
            value: "service_burden_band",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
    );
  }

  if (selectedReportType === "tax_base") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Tax-Base Opportunity Dashboard",
      `${selectionNote ? `${selectionNote}. ` : ""}Focus on tax-base opportunity bands, geography context, economic segment, constraint burden, and recommended follow-up.`,
      [
        reportPage("Tax-Base Opportunity", "Screen where economics rows show stronger fiscal upside.", [
          generatedPowerBiVisual({
            axis: "tax_base_opportunity_band",
            source_table: "parcel_economic_signal_fact",
            title: "Tax-base opportunity bands",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "economic_segment",
            source_table: "parcel_economic_signal_fact",
            title: "Opportunity by economic segment",
            value: "signal_id",
            visual_type: "donut",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            source_table: "parcel_economic_signal_fact",
            title: "Tax-base opportunity rows",
            value: "recommended_followup",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
    );
  }

  if (selectedReportType === "special_assets") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Special Assets Review Page",
      `${selectionNote ? `${selectionNote}. ` : ""}Isolate special or non-comparable assets before interpreting value-per-acre and fiscal opportunity bands.`,
      [
        reportPage("Special Assets", "Review special assets separately from ordinary parcel comparisons.", [
          generatedPowerBiVisual({
            axis: "special_asset_flag",
            source_table: "parcel_economic_signal_fact",
            title: "Special asset flag mix",
            value: "signal_id",
            visual_type: "donut",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            filterField: "special_asset_flag",
            filterValue: "true",
            source_table: "parcel_economic_signal_fact",
            title: "Special asset review table",
            value: "segment_caveat",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      ["Use special_asset_flag as a slicer or page filter before comparing value per acre.", ...powerBiReportCaveats],
    );
  }

  if (availability.parcel_economic_signal_fact_rows && (normalized.includes("segment") || normalized.includes("value per acre"))) {
    return finalizedPowerBiReportPlan(
      prompt,
      "Economic Segment Comparison Report",
      "Compare value-per-acre bands, opportunity classes, and data confidence within similar land-use or property segments.",
      [
        reportPage("Segment-Aware Economics", "Use economic segment as the first slicer.", [
          generatedPowerBiVisual({
            axis: "economic_segment",
            source_table: "parcel_economic_signal_fact",
            title: "Economic segment mix",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "value_per_acre_band",
            filterField: "economic_segment",
            source_table: "parcel_economic_signal_fact",
            title: "Value per acre bands within segment",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            source_table: "parcel_economic_signal_fact",
            title: "Top segment rows",
            value: "opportunity_class",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      ["Value per acre is most meaningful within similar land-use/property segments.", ...powerBiReportCaveats],
    );
  }

  if (selectedReportType === "underbuilt") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Underbuilt Redevelopment Candidate Dashboard",
      `${selectionNote ? `${selectionNote}. ` : ""}Focus on underbuilt candidate rows, segment context, opportunity class, recommended follow-up, and data confidence.`,
      [
        reportPage("Executive Economic Dashboard", "Summarize underbuilt candidate signals.", [
          generatedPowerBiVisual({
            axis: "opportunity_class",
            filterField: "opportunity_class",
            filterValue: "Underbuilt Redevelopment Candidate",
            source_table: "parcel_economic_signal_fact",
            title: "Underbuilt candidate count",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "economic_segment",
            filterField: "opportunity_class",
            filterValue: "Underbuilt Redevelopment Candidate",
            source_table: "parcel_economic_signal_fact",
            title: "Underbuilt candidates by economic segment",
            value: "signal_id",
            visual_type: "donut",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            filterField: "opportunity_class",
            filterValue: "Underbuilt Redevelopment Candidate",
            source_table: "parcel_economic_signal_fact",
            title: "Top underbuilt rows",
            value: "recommended_followup",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
    );
  }

  if (selectedReportType === "data_confidence") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Data Confidence Register",
      `${selectionNote ? `${selectionNote}. ` : ""}Show which economics domains are strong, partial, or still data-needed before report interpretation.`,
      [
        reportPage("Data Confidence Register", "Review data status and next data needs.", [
          generatedPowerBiVisual({
            axis: "domain_name",
            source_table: "domain_readiness_dim",
            title: "Domain readiness matrix",
            value: "data_status",
            visual_type: "matrix",
          }),
          availability.parcel_economic_signal_fact_rows
            ? generatedPowerBiVisual({
                axis: "data_confidence",
                source_table: "parcel_economic_signal_fact",
                title: "Parcel signal confidence",
                value: "signal_id",
                visual_type: "donut",
              })
            : null,
        ].filter((visual): visual is PowerBiGeneratedVisual => Boolean(visual))),
      ],
      relationships,
    );
  }

  const executiveVisuals = [
    availability.economics_kpi_fact_rows
      ? generatedPowerBiVisual({
          axis: "kpi_name",
          source_table: "economics_kpi_fact",
          title: "Executive KPI cards",
          value: "value",
          visual_type: "bar",
          aggregation: "sum",
        })
      : null,
    availability.parcel_economic_signal_fact_rows
      ? generatedPowerBiVisual({
          axis: "opportunity_class",
          source_table: "parcel_economic_signal_fact",
          title: "Opportunity class breakdown",
          value: "signal_id",
          visual_type: "bar",
        })
      : null,
    availability.parcel_economic_signal_fact_rows
      ? generatedPowerBiVisual({
          axis: "economic_segment",
          source_table: "parcel_economic_signal_fact",
          title: "Economic segment mix",
          value: "signal_id",
          visual_type: "donut",
        })
      : null,
    availability.scenario_output_fact_rows
      ? generatedPowerBiVisual({
          axis: "scenario_name",
          source_table: "scenario_output_fact",
          title: "Scenario output comparison",
          value: "fiscal_attractiveness_band",
          visual_type: "matrix",
        })
      : null,
    availability.domain_readiness_dim_rows
      ? generatedPowerBiVisual({
          axis: "domain_name",
          source_table: "domain_readiness_dim",
          title: "Data readiness matrix",
          value: "data_status",
          visual_type: "matrix",
        })
      : null,
  ].filter((visual): visual is PowerBiGeneratedVisual => Boolean(visual));

  return finalizedPowerBiReportPlan(
    prompt,
    "Executive Economic Dashboard",
    `${selectionNote ? `${selectionNote}. ` : ""}Build a leadership-ready Power BI page from the tables that are available now.`,
    [
      reportPage("Executive Economic Dashboard", "Summarize the economics signal first.", executiveVisuals),
    ],
    relationships,
    uniqueStrings([selectionNote, ...powerBiReportCaveats]),
  );
}

function powerBiActionsToGeneratedPlan(
  actions: CfsAiPowerBiActions,
  payload: EconomicsPowerBiExportResponse | null,
  availability = buildReportDataAvailability(payload),
): PowerBiGeneratedReportPlan {
  const relationships = payload?.relationships?.length
    ? payload.relationships
    : defaultPowerBiRelationships;
  const actionVisuals = actions.report_canvas_items?.length
    ? actions.report_canvas_items
    : actions.chart_builder_config
      ? [
          {
            aggregation: actions.chart_builder_config.aggregation,
            category_field: actions.chart_builder_config.category_field,
            caveat: actions.chart_builder_config.caveat,
            filter_field: actions.chart_builder_config.filter_field,
            filter_value: actions.chart_builder_config.filter_value,
            page_name: chartRecommendedPage(toPowerBiTableName(actions.chart_builder_config.table_name)),
            powerbi_recipe: "",
            source_table: actions.chart_builder_config.table_name,
            value_field: actions.chart_builder_config.value_field,
            visual_title: actions.chart_builder_config.title ?? actions.report_title ?? "Ask CFS chart",
            visual_type: actions.chart_builder_config.chart_type,
          },
        ]
      : [];
  if (!actionVisuals.length) {
    return buildPowerBiReportPlan(actions.report_title ?? "Build me a Power BI report.", payload, availability);
  }
  const pages = new Map<string, { page_name: string; purpose: string; visuals: PowerBiGeneratedVisual[] }>();
  actionVisuals.forEach((item) => {
    const tableName = toPowerBiTableName(item.source_table);
    const visual = generatedPowerBiVisual({
      aggregation: normalizeActionAggregation(item.aggregation),
      axis: item.category_field ?? "",
      caveat: item.caveat,
      filterField: item.filter_field ?? "",
      filterValue: item.filter_value ?? "All",
      source_table: tableName,
      title: item.visual_title,
      value: item.value_field ?? "",
      visual_type: normalizeActionVisualType(item.visual_type),
    });
    const pageName = item.page_name || chartRecommendedPage(tableName);
    const existing = pages.get(pageName) ?? {
      page_name: pageName,
      purpose: "Generated from Ask CFS report automation.",
      visuals: [],
    };
    existing.visuals.push(visual);
    pages.set(pageName, existing);
  });
  return sanitizePowerBiReportPlan(
    finalizedPowerBiReportPlan(
    actions.report_title ?? "AI Generated Power BI Report",
    actions.report_title ?? "AI Generated Power BI Report",
    actions.report_summary ?? "Ask CFS generated a Power BI-style dataset, visual, and report-canvas plan.",
    [...pages.values()],
    relationships,
    uniqueStrings([
      actions.chart_builder_config?.caveat ?? "",
      "CFS generated this as a Power BI Desktop build plan only.",
      ...powerBiReportCaveats,
    ]),
    ),
    payload,
    availability,
  );
}

function sanitizePowerBiReportPlan(
  plan: PowerBiGeneratedReportPlan,
  payload: EconomicsPowerBiExportResponse | null,
  availability: PowerBiReportDataAvailability,
) {
  const hidden: string[] = [];
  const pages = plan.pages
    .map((page) => ({
      ...page,
      visuals: page.visuals.filter((visual) => {
        const reason = generatedVisualUnavailableReason(visual, availability);
        if (reason) hidden.push(`${visual.title} - ${reason}`);
        return !reason;
      }),
    }))
    .filter((page) => page.visuals.length);
  if (!hidden.length) return plan;
  if (!pages.length) {
    return buildPowerBiReportPlan(plan.generated_from_prompt, payload, availability);
  }
  return finalizedPowerBiReportPlan(
    plan.generated_from_prompt,
    plan.title,
    `${plan.summary} CFS hid unavailable visuals from the main preview.`,
    pages,
    plan.relationships,
    uniqueStrings([
      ...plan.caveats,
      ...hidden.map((item) => `Unavailable visual hidden: ${item}`),
    ]),
  );
}

function generatedVisualUnavailableReason(
  visual: Pick<PowerBiGeneratedVisual, "filterField" | "filterValue" | "source_table">,
  availability: PowerBiReportDataAvailability,
) {
  const tableRows: Record<PowerBiTableName, number> = {
    domain_readiness_dim: availability.domain_readiness_dim_rows,
    economics_kpi_fact: availability.economics_kpi_fact_rows,
    geography_dim: availability.geography_dim_rows,
    parcel_economic_signal_fact: availability.parcel_economic_signal_fact_rows,
    scenario_dim: 0,
    scenario_output_fact: availability.scenario_output_fact_rows,
    time_dim: 0,
  };
  if (!tableRows[visual.source_table]) return `${visual.source_table} has 0 rows`;
  const filterText = `${visual.filterField} ${visual.filterValue}`.toLowerCase();
  if (filterText.includes("underbuilt") && !availability.underbuilt_rows) {
    return "underbuilt candidate rows unavailable";
  }
  if (filterText.includes("special_asset") && !availability.special_asset_rows) {
    return "special asset rows unavailable";
  }
  if (filterText.includes("tax") && !availability.tax_base_opportunity_rows) {
    return "tax-base opportunity rows unavailable";
  }
  return null;
}

function reportPage(
  page_name: string,
  purpose: string,
  visuals: PowerBiGeneratedVisual[],
) {
  return { page_name, purpose, visuals };
}

function generatedPowerBiVisual({
  aggregation = "count",
  axis,
  caveat,
  filterField = "",
  filterValue = "All",
  source_table,
  title,
  value,
  visual_type,
}: {
  aggregation?: UserChartAggregation;
  axis: string;
  caveat?: string;
  filterField?: string;
  filterValue?: string;
  source_table: PowerBiTableName;
  title: string;
  value: string;
  visual_type: UserChartVisualType;
}): PowerBiGeneratedVisual {
  const safeAxis = safePowerBiField(source_table, axis, "category");
  const safeValue = safePowerBiField(source_table, value, "value");
  const safeFilter = filterField ? safePowerBiField(source_table, filterField, "filter") : "";
  const visual = {
    aggregation,
    axis: safeAxis,
    caveat:
      caveat ??
      "Screening-level economics; compare value per acre within segment and keep caveats visible.",
    filterField: safeFilter,
    filterValue,
    page_name: "",
    powerbi_recipe: "",
    slicers: ["economic_segment", "geography_label", "data_confidence"].filter((field) =>
      powerBiChartFieldMetadata[source_table].some((meta) => meta.key === field),
    ),
    source_table,
    title,
    value: safeValue,
    visual_id: `${source_table}-${visual_type}-${safeAxis}-${safeValue}`.replaceAll("_", "-"),
    visual_type,
  };
  return { ...visual, powerbi_recipe: generatedVisualRecipe(visual) };
}

function finalizedPowerBiReportPlan(
  prompt: string,
  title: string,
  summary: string,
  pages: PowerBiGeneratedReportPlan["pages"],
  relationships: EconomicsPowerBiExportResponse["relationships"],
  caveats = powerBiReportCaveats,
): PowerBiGeneratedReportPlan {
  const visuals = pages.flatMap((page) =>
    page.visuals.map((visual) => ({ ...visual, page_name: page.page_name })),
  );
  const recommendedTables = uniquePowerBiTables([
    ...visuals.map((visual) => visual.source_table),
    "geography_dim",
    "scenario_dim",
  ]);
  return {
    caveats,
    dataset_plan: {
      dimensions: uniquePowerBiTables(["geography_dim", "scenario_dim", "domain_readiness_dim"]),
      facts: uniquePowerBiTables(
        recommendedTables.filter((table) => table.endsWith("_fact")),
      ),
      measures: [
        "Total Signals = COUNTROWS(parcel_economic_signal_fact)",
        "Underbuilt Candidates = COUNTROWS(FILTER(parcel_economic_signal_fact, parcel_economic_signal_fact[opportunity_class] = \"Underbuilt Redevelopment Candidate\"))",
        "Scenario Count = COUNTROWS(scenario_output_fact)",
        "Data Needed Signals = COUNTROWS(FILTER(parcel_economic_signal_fact, parcel_economic_signal_fact[data_confidence] = \"Data Needed\"))",
      ],
      slicers: uniqueStrings(visuals.flatMap((visual) => visual.slicers)),
      sort_fields: ["economic_segment_order", "opportunity_class_order", "band_order"],
    },
    generated_from_prompt: prompt,
    next_steps: [
      "Download the CSV tables or JSON pack from Power BI & Tools.",
      "Import the recommended tables into Power BI Desktop.",
      "Create the starter relationships.",
      "Build the generated visuals and add a caveat text box.",
      "Use the CFS Report Canvas recipe as the page outline.",
    ],
    pages: pages.map((page) => ({
      ...page,
      visuals: page.visuals.map((visual) => ({ ...visual, page_name: page.page_name })),
    })),
    recommended_tables: recommendedTables,
    relationships,
    summary,
    title,
  };
}

function generatedVisualToCanvasItem(
  visual: PowerBiGeneratedVisual,
  pageName: string,
  index: number,
): UserReportCanvasItem {
  return {
    aggregation: visual.aggregation,
    categoryField: visual.axis,
    filterField: visual.filterField,
    filterValue: visual.filterValue,
    id: `${visual.visual_id}-${index + 1}`,
    pageName,
    tableName: visual.source_table,
    title: visual.title,
    valueField: visual.value,
    visualType: visual.visual_type,
  };
}

function generatedVisualToRecipeConfig(visual: PowerBiGeneratedVisual): UserChartRecipeConfig {
  return {
    aggregation: visual.aggregation,
    categoryField: visual.axis,
    filterField: visual.filterField,
    filterValue: visual.filterValue,
    tableName: visual.source_table,
    valueField: visual.value,
    visualType: visual.visual_type,
  };
}

function generatedPlanToCanvasItems(plan: PowerBiGeneratedReportPlan) {
  return plan.pages.flatMap((page) =>
    page.visuals.map((visual, index) => generatedVisualToCanvasItem(visual, page.page_name, index)),
  );
}

function bucketItemFromGeneratedPlan(plan: PowerBiGeneratedReportPlan): ReportBucketItemInput {
  return {
    caveats: plan.caveats,
    content: generatedReportPlanInstructions(plan),
    id: `report-plan-${slugifyReportTitle(plan.title)}-${slugifyReportTitle(plan.generated_from_prompt)}`,
    powerbi_recipe: generatedReportPlanInstructions(plan),
    related_tables: plan.recommended_tables,
    report_plan: plan,
    source_page: "Power BI & Tools",
    summary: plan.summary,
    title: plan.title,
    type: "report_plan",
  };
}

function bucketItemFromAskResponse(response: CfsAiSearchResponse): ReportBucketItemInput {
  const title = response.powerbi_actions?.report_title ?? "Ask CFS Economics Answer";
  const suggestedActions = response.suggested_actions.map((action) => `- ${action}`).join("\n");
  return {
    caveats: response.caveats,
    content: [response.answer, suggestedActions ? `Suggested actions:\n${suggestedActions}` : ""].filter(Boolean).join("\n\n"),
    id: `ask-cfs-${slugifyReportTitle(title)}-${slugifyReportTitle(response.as_of ?? "session")}`,
    source_page: "Ask CFS",
    summary: response.powerbi_actions?.report_summary ?? response.answer.split("\n").find(Boolean) ?? "Ask CFS response.",
    title,
    type: response.powerbi_actions ? "report_plan" : "evidence_pack",
  };
}

function bucketItemText(item: ReportBucketItem) {
  const lines = [
    item.title,
    `Type: ${bucketTypeLabel(item.type)}`,
    `Source: ${item.source_page}`,
    `Summary: ${item.summary}`,
    item.related_tables?.length ? `Related tables: ${item.related_tables.join(", ")}` : "",
    item.powerbi_recipe ? `Power BI recipe:\n${item.powerbi_recipe}` : "",
    item.content ? `Content:\n${item.content}` : "",
    item.caveats?.length ? `Caveats:\n${item.caveats.map((caveat) => `- ${caveat}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

function bucketTypeLabel(type: ReportBucketItemType) {
  return type.replaceAll("_", " ");
}

function generatedReportSectionLabel(section: GeneratedReportSectionKey) {
  const labels: Record<GeneratedReportSectionKey, string> = {
    caveats: "Caveats",
    kpis: "KPI cards",
    powerbi_details: "Power BI details",
    summary: "Executive summary",
    tables: "Tables / rows",
    visuals: "Visuals",
  };
  return labels[section];
}

function powerBiTableRows(
  payload: EconomicsPowerBiExportResponse | null,
  tableName: PowerBiTableName,
): Array<Record<string, unknown>> {
  return (payload?.tables[tableName] ?? []) as Array<Record<string, unknown>>;
}

function reportRowsForTable(
  payload: EconomicsPowerBiExportResponse | null,
  tableName: PowerBiTableName,
  outputs: EconomicsScenarioOutput[],
  dataReadiness: EconomicsReadinessRow[],
) {
  const rows = powerBiTableRows(payload, tableName);
  if (rows.length) return rows;
  if (tableName === "scenario_output_fact") {
    return outputs.map((output) => ({
      data_confidence: output.data_confidence,
      fiscal_attractiveness_band: output.constraint_adjusted_opportunity_band,
      infrastructure_burden_band: output.infrastructure_burden_band,
      revenue_per_acre_band: output.revenue_per_acre_band,
      scenario_id: output.scenario_id,
      scenario_name: output.title,
      service_burden_band: output.service_burden_band,
      tax_base_lift_band: output.estimated_tax_base_lift_band,
    }));
  }
  if (tableName === "domain_readiness_dim") {
    return dataReadiness.map((row) => ({
      current_use: row.current_use,
      data_status: row.data_status,
      domain_name: row.domain,
      next_data_need: row.gap_or_next_need,
    }));
  }
  return rows;
}

function filteredPowerBiRows(
  rows: Array<Record<string, unknown>>,
  visual: PowerBiGeneratedVisual,
) {
  return visual.filterField && visual.filterValue !== "All"
    ? rows.filter((row) => valueText(row[visual.filterField]) === visual.filterValue)
    : rows;
}

function buildGeneratedReportSnapshot(
  plan: PowerBiGeneratedReportPlan,
  payload: EconomicsPowerBiExportResponse | null,
  signals: EconomicsParcelSignal[],
  outputs: EconomicsScenarioOutput[],
  dataReadiness: EconomicsReadinessRow[],
  includeSections: GeneratedReportIncludeState,
): GeneratedPowerBiReportSnapshot {
  const allVisuals = plan.pages.flatMap((page) => page.visuals);
  const visualPreviews = allVisuals.map((visual) => ({
    ...visual,
    rows: filteredPowerBiRows(reportRowsForTable(payload, visual.source_table, outputs, dataReadiness), visual),
  }));
  const visuals = visualPreviews.filter((visual) => visual.rows.length);
  const unavailableVisuals = visualPreviews
    .filter((visual) => !visual.rows.length)
    .map((visual) => ({
      reason: visual.filterField && visual.filterValue !== "All"
        ? `${visual.source_table} has 0 rows matching ${visual.filterField} = ${visual.filterValue}`
        : `${visual.source_table} has 0 rows`,
      title: visual.title,
      visual,
    }));
  const parcelRows = powerBiTableRows(payload, "parcel_economic_signal_fact");
  const scenarioRows = reportRowsForTable(payload, "scenario_output_fact", outputs, dataReadiness);
  const readinessRows = reportRowsForTable(payload, "domain_readiness_dim", outputs, dataReadiness);
  const needsParcelRows = allVisuals.some((visual) => visual.source_table === "parcel_economic_signal_fact");
  const diagnostics = [
    needsParcelRows && !parcelRows.length
      ? "This report needs parcel economic signal rows, but parcel_economic_signal_fact currently has 0 rows."
      : "",
    needsParcelRows && !parcelRows.length && signals.length
      ? "Ask CFS summary has live economics context, but the Power BI export table is empty."
      : "",
    unavailableVisuals.length
      ? "Unavailable visuals were hidden from the main preview."
      : "",
  ].filter(Boolean);
  const underbuiltRows = parcelRows.length
    ? parcelRows.filter((row) => valueText(row.opportunity_class).includes("Underbuilt"))
    : signals.filter((signal) => signal.opportunity_class.includes("Underbuilt"));
  const kpis = [
    { label: "Parcel signal rows", value: formatNumber(parcelRows.length || signals.length) },
    { label: "Underbuilt candidates", value: formatNumber(underbuiltRows.length) },
    { label: "Scenario rows", value: formatNumber(scenarioRows.length || outputs.length) },
    { label: "Readiness domains", value: formatNumber(readinessRows.length || dataReadiness.length) },
  ];
  const parcelTableRows = parcelRows.slice(0, 8);
  const tables: GeneratedReportTablePreview[] = [
    parcelTableRows.length
      ? {
          columns: ["display_label", "economic_segment", "opportunity_class", "data_confidence", "recommended_followup"],
          rows: parcelTableRows,
          title: "Candidate rows",
        }
      : null,
    scenarioRows.length
      ? {
          columns: ["scenario_name", "tax_base_lift_band", "service_burden_band", "infrastructure_burden_band", "fiscal_attractiveness_band"],
          rows: scenarioRows.slice(0, 8),
          title: "Scenario matrix",
        }
      : null,
    readinessRows.length
      ? {
          columns: ["domain_name", "data_status", "current_use", "next_data_need"],
          rows: readinessRows.slice(0, 8),
          title: "Data confidence matrix",
        }
      : null,
  ].filter((row): row is GeneratedReportTablePreview => Boolean(row));
  return {
    caveats: plan.caveats,
    diagnostics,
    generated_from_prompt: plan.generated_from_prompt,
    include_sections: includeSections,
    kpis,
    powerbi_details: generatedReportPlanInstructions(plan),
    report_type: plan.title,
    summary: plan.summary,
    tables,
    title: plan.title,
    unavailable_visuals: unavailableVisuals,
    visuals,
  };
}

function generatedTableText(table: GeneratedReportTablePreview) {
  return [
    table.title,
    table.columns.join(" | "),
    ...table.rows.map((row) => table.columns.map((column) => valueText(row[column])).join(" | ")),
  ].join("\n");
}

function generatedReportText(report: GeneratedPowerBiReportSnapshot) {
  const lines = [
    report.title,
    report.include_sections.summary ? `Summary: ${report.summary}` : "",
    report.include_sections.kpis
      ? `KPI cards:\n${report.kpis.map((kpi) => `- ${kpi.label}: ${kpi.value}`).join("\n")}`
      : "",
    report.include_sections.visuals
      ? `Visuals:\n${report.visuals.map((visual) => `- ${visual.title}: ${chartVisualLabel(visual.visual_type)} using ${visual.source_table}`).join("\n")}`
      : "",
    report.include_sections.tables
      ? `Tables:\n${report.tables.map((table) => `- ${table.title}: ${table.rows.length} rows`).join("\n")}`
      : "",
    report.include_sections.caveats ? `Caveats:\n${report.caveats.map((item) => `- ${item}`).join("\n")}` : "",
    report.include_sections.powerbi_details ? `Power BI details:\n${report.powerbi_details}` : "",
    report.diagnostics.length ? `Diagnostics:\n${report.diagnostics.map((item) => `- ${item}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

function generatedReportBucketItem(report: GeneratedPowerBiReportSnapshot): ReportBucketItemInput {
  return {
    caveats: report.caveats,
    content: generatedReportText(report),
    generated_report: report,
    id: `generated-report-${slugifyReportTitle(report.title)}-${slugifyReportTitle(report.generated_from_prompt)}`,
    powerbi_recipe: report.powerbi_details,
    related_tables: uniquePowerBiTables(report.visuals.map((visual) => visual.source_table)),
    report_plan: undefined,
    source_page: "Power BI & Tools",
    summary: report.summary,
    title: report.title,
    type: "generated_report",
  };
}

function generatedReportPlanInstructions(plan: PowerBiGeneratedReportPlan) {
  const relationships = plan.relationships.map(
    (row) => `${row.from_table}.${row.from_column} -> ${row.to_table}.${row.to_column}`,
  );
  const visuals = plan.pages.flatMap((page) =>
    page.visuals.map(
      (visual) =>
        `${page.page_name}: ${visual.title} - ${chartVisualLabel(visual.visual_type)}; table ${visual.source_table}; axis ${visual.axis}; values ${visual.aggregation} ${visual.value}${visual.filterField ? `; filter ${visual.filterField}${visual.filterValue !== "All" ? ` = ${visual.filterValue}` : ""}` : ""}.`,
    ),
  );
  return [
    `Power BI build recipe: ${plan.title}`,
    "",
    "1. Import tables:",
    ...plan.recommended_tables.map((table) => `- ${table}.csv`),
    "2. Create relationships:",
    ...(relationships.length ? relationships.map((relationship) => `- ${relationship}`) : ["- Use the starter relationship notes from the CFS export pack."]),
    "3. Add slicers:",
    ...plan.dataset_plan.slicers.map((slicer) => `- ${slicer}`),
    "4. Build visuals:",
    ...visuals.map((visual) => `- ${visual}`),
    "5. Add measures:",
    ...plan.dataset_plan.measures.map((measure) => `- ${measure}`),
    "6. Add caveat text box:",
    ...plan.caveats.map((caveat) => `- ${caveat}`),
  ].join("\n");
}

function generatedVisualRecipe(visual: Omit<PowerBiGeneratedVisual, "powerbi_recipe">) {
  return [
    `Use table: ${visual.source_table}`,
    `Visual: ${chartVisualLabel(visual.visual_type)}`,
    `Axis/category: ${chartFieldLabel(visual.source_table, visual.axis)}`,
    `Values: ${visual.aggregation} ${chartFieldLabel(visual.source_table, visual.value)}`,
    `Filter/slicer: ${visual.filterField ? `${chartFieldLabel(visual.source_table, visual.filterField)}${visual.filterValue !== "All" ? ` = ${visual.filterValue}` : ""}` : "None"}`,
    `Recommended page: ${visual.page_name || chartRecommendedPage(visual.source_table)}`,
    `Caveat: ${visual.caveat}`,
  ].join("\n");
}

function safePowerBiField(tableName: PowerBiTableName, field: string, fallbackRole: UserChartField["role"]) {
  const fields = powerBiChartFieldMetadata[tableName];
  if (fields.some((row) => row.key === field)) return field;
  return fields.find((row) => row.role === fallbackRole)?.key ?? fields[0]?.key ?? "";
}

function toPowerBiTableName(value: string | undefined): PowerBiTableName {
  return value && Object.prototype.hasOwnProperty.call(powerBiChartFieldMetadata, value)
    ? (value as PowerBiTableName)
    : "parcel_economic_signal_fact";
}

function normalizeActionVisualType(value: string | undefined): UserChartVisualType {
  if (value === "line" || value === "matrix" || value === "bar") return value;
  if (value === "table") return "matrix";
  return value === "pie" || value === "donut" ? "donut" : "bar";
}

function normalizeActionAggregation(value: string | undefined): UserChartAggregation {
  return value === "sum" || value === "average" ? value : "count";
}

function hasUnsafePowerBiReportRequest(normalizedPrompt: string) {
  const terms = [
    "own" + "er",
    "mail" + "ing",
    "raw" + "_score",
    "prediction" + "_probability",
    "exact probability",
    "database" + "_url",
    "openai" + "_api_key",
  ];
  return terms.some((term) => normalizedPrompt.includes(term));
}

function uniquePowerBiTables(tables: PowerBiTableName[]) {
  return [...new Set(tables)].filter((table): table is PowerBiTableName => Boolean(table));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slugifyReportTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "cfs_economics";
}

const defaultPowerBiRelationships: EconomicsPowerBiExportResponse["relationships"] = [
  {
    from_column: "scenario_id",
    from_table: "scenario_output_fact",
    to_column: "scenario_id",
    to_table: "scenario_dim",
  },
  {
    from_column: "geography_label",
    from_table: "parcel_economic_signal_fact",
    to_column: "geography_label",
    to_table: "geography_dim",
  },
];

const powerBiReportCaveats = [
  "CFS generates a Power BI Desktop build plan only; it does not connect to Power BI Service or embedded APIs.",
  "CFS Economics is screening-level context, not a formal appraisal, tax bill, fiscal impact study, or approval recommendation.",
  "Value per acre should be compared within economic segment, and special assets should be reviewed separately.",
];

const powerBiCsvTableMetadata = [
  {
    primary_use: "KPI cards",
    suggested_visual: "Executive Economic Dashboard KPI cards",
    table_name: "economics_kpi_fact",
  },
  {
    primary_use: "Parcel/site screening",
    suggested_visual: "Opportunity class bars and underbuilt watchlist",
    table_name: "parcel_economic_signal_fact",
  },
  {
    primary_use: "Scenario planning model",
    suggested_visual: "Scenario comparison matrix",
    table_name: "scenario_output_fact",
  },
  {
    primary_use: "Data confidence register",
    suggested_visual: "Domain readiness matrix",
    table_name: "domain_readiness_dim",
  },
  {
    primary_use: "Geography slicers",
    suggested_visual: "Geography slicer",
    table_name: "geography_dim",
  },
  {
    primary_use: "Extract freshness context",
    suggested_visual: "Data availability label",
    table_name: "time_dim",
  },
  {
    primary_use: "Scenario slicers",
    suggested_visual: "Scenario slicer",
    table_name: "scenario_dim",
  },
] as const satisfies ReadonlyArray<{
  primary_use: string;
  suggested_visual: string;
  table_name: keyof EconomicsPowerBiExportResponse["tables"];
}>;

const econChartColors = ["#f0cd79", "#55d38f", "#6d9de8", "#f47f5f", "#9b8cff", "#d9e2ef"];

type EnterpriseOutputKind = "scenario" | "powerbi" | "planning" | "decision";

const enterpriseGuidedSteps = [
  {
    kicker: "Step 1",
    text: "Review selected rows from the Power BI & Tools tables.",
    title: "Select Data",
  },
  {
    kicker: "Step 2",
    text: "Pick one output path: scenario, BI export, planning model, or decision pack.",
    title: "Choose Output",
  },
  {
    kicker: "Step 3",
    text: "Configure only the selected output instead of scanning every tool at once.",
    title: "Configure",
  },
  {
    kicker: "Step 4",
    text: "Copy, download, or send the result to Print.",
    title: "Export / Next Step",
  },
] as const;

const enterpriseOutputCards: ReadonlyArray<{
  kind: EnterpriseOutputKind;
  text: string;
  title: string;
}> = [
  {
    kind: "powerbi",
    text: "Download CSV Tables or preview the JSON pack.",
    title: "Power BI Export",
  },
  {
    kind: "scenario",
    text: "Adjust assumptions and review output bands.",
    title: "Scenario Model",
  },
  {
    kind: "planning",
    text: "Review dimensions, measures, scenarios, and payload structure.",
    title: "Planning Model",
  },
  {
    kind: "decision",
    text: "Create a concise memo, evidence pack, and caveats.",
    title: "Decision Pack",
  },
] as const;

const initialScenarioAssumptions: ScenarioAssumptions = {
  developmentType: "Current Conditions",
  floodConstraint: "Medium",
  intensityBand: "Low",
  scenarioId: "current_conditions",
  schoolServiceBurden: "Medium",
  transportationAccess: "Medium",
  utilityReadiness: "Medium",
  valuePerAcreBand: "Medium",
};

const scenarioDefaults: Record<string, Partial<ScenarioAssumptions>> = {
  baseline_growth: {
    developmentType: "Baseline Growth",
    intensityBand: "Medium",
    valuePerAcreBand: "Medium",
  },
  commercial_corridor: {
    developmentType: "Commercial Corridor",
    floodConstraint: "Low",
    intensityBand: "Medium",
    schoolServiceBurden: "Low",
    transportationAccess: "High",
    valuePerAcreBand: "High",
  },
  current_conditions: initialScenarioAssumptions,
  industrial_employment: {
    developmentType: "Industrial / Employment",
    floodConstraint: "Low",
    intensityBand: "Medium",
    schoolServiceBurden: "Low",
    transportationAccess: "High",
    valuePerAcreBand: "High",
  },
  infrastructure_constrained_growth: {
    developmentType: "Infrastructure-Constrained Growth",
    floodConstraint: "High",
    intensityBand: "Medium",
    schoolServiceBurden: "High",
    transportationAccess: "Low",
    utilityReadiness: "Low",
    valuePerAcreBand: "High",
  },
  mixed_use_corridor: {
    developmentType: "Mixed-Use Redevelopment",
    intensityBand: "High",
    schoolServiceBurden: "Medium",
    transportationAccess: "High",
    valuePerAcreBand: "High",
  },
  residential_growth: {
    developmentType: "Residential Growth",
    intensityBand: "High",
    schoolServiceBurden: "High",
    valuePerAcreBand: "Medium",
  },
  targeted_investment: {
    developmentType: "Targeted Infrastructure Investment",
    floodConstraint: "Low",
    intensityBand: "Medium",
    utilityReadiness: "High",
    valuePerAcreBand: "High",
  },
};

const scenarioCatalog: EconomicsScenarioTemplate[] = [
  {
    caveats: ["Baseline only; deeper fiscal review is required before decisions."],
    data_confidence: "screening",
    id: "current_conditions",
    required_assumptions: ["parcel value", "acreage", "current service context"],
    title: "Current Conditions",
    what_it_tests: "Current tax-base and burden context without a new scenario assumption.",
  },
  {
    caveats: ["Assumes growth continues without a major intervention."],
    data_confidence: "screening",
    id: "baseline_growth",
    required_assumptions: ["observed permit activity", "current value per acre"],
    title: "Baseline Growth",
    what_it_tests: "How current development pressure carries through existing parcel economics.",
  },
  {
    caveats: ["Residential growth should be compared with school and service burden."],
    data_confidence: "screening",
    id: "residential_growth",
    required_assumptions: ["housing intensity", "school/service burden", "utility readiness"],
    title: "Residential Growth",
    what_it_tests: "Housing-oriented value lift against school and service burden.",
  },
  {
    caveats: ["Corridor economics depend on access, parcel assembly, and market fit."],
    data_confidence: "screening",
    id: "commercial_corridor",
    required_assumptions: ["corridor access", "commercial value band", "constraint burden"],
    title: "Commercial Corridor",
    what_it_tests: "Tax-base opportunity along access-oriented commercial corridors.",
  },
  {
    caveats: ["Employment-site readiness depends on transportation and utility capacity."],
    data_confidence: "screening",
    id: "industrial_employment",
    required_assumptions: ["site size", "road access", "utility readiness", "flood exposure"],
    title: "Industrial / Employment",
    what_it_tests: "Non-residential tax-base opportunity with lower school-burden emphasis.",
  },
  {
    caveats: ["Mixed-use assumptions should be tested with land-use and service capacity."],
    data_confidence: "screening",
    id: "mixed_use_corridor",
    required_assumptions: ["redevelopment intensity", "corridor access", "service burden"],
    title: "Mixed-Use Redevelopment",
    what_it_tests: "Higher-intensity redevelopment with both value upside and service needs.",
  },
  {
    caveats: ["Public investment costs must be estimated outside this screening model."],
    data_confidence: "screening",
    id: "targeted_investment",
    required_assumptions: ["public cost", "utility readiness", "tax-base lift band"],
    title: "Targeted Infrastructure Investment",
    what_it_tests: "Whether targeted infrastructure could unlock tax-base opportunity.",
  },
  {
    caveats: ["Incomplete infrastructure data limits confidence."],
    data_confidence: "proxy",
    id: "infrastructure_constrained_growth",
    required_assumptions: ["utility readiness", "transportation access", "constraint burden"],
    title: "Infrastructure-Constrained Growth",
    what_it_tests: "How opportunity is limited when infrastructure readiness is weak.",
  },
];

const powerBiImportQaChecklist = [
  "All 7 CSV tables downloaded.",
  "Headers are present in each CSV.",
  "No contact fields imported.",
  "No internal model values imported.",
  "No tax bill fields imported.",
  "scenario_id exists in scenario_output_fact.",
  "scenario_id exists in scenario_dim.",
  "geography_label exists in parcel_economic_signal_fact.",
  "geography_label exists in geography_dim.",
  "Relationships are created in Power BI.",
  "Report caveats are visible.",
  "Slicers are checked for blank or missing values.",
];

const economicsTutorialSteps: Record<EconomicsTutorialPage, EconomicsTutorialStep[]> = {
  dashboard: [
    {
      body: "These cards summarize the current economics signal.",
      id: "dashboard-kpi",
      targetSelector: '[data-econ-tour="kpi-strip"]',
      title: "KPI strip",
    },
    {
      body: "Use slicers to compare similar economics segments instead of mixing all parcel types.",
      id: "dashboard-slicers",
      targetSelector: '[data-econ-tour="slicers"]',
      title: "Slicers",
    },
    {
      body: "Value per acre is most useful when compared within similar property or land-use segments.",
      id: "dashboard-segments",
      targetSelector: '[data-econ-tour="segment-visuals"]',
      title: "Segment visuals",
    },
    {
      body: "Use these visuals to compare opportunity against service and infrastructure burden.",
      id: "dashboard-scenarios",
      targetSelector: '[data-econ-tour="scenario-visuals"]',
      title: "Scenario visuals",
    },
    {
      body: "Ask CFS can explain charts, filters, Power BI fields, and caveats.",
      id: "dashboard-ask",
      targetSelector: '[data-econ-tour="ask-cfs"]',
      title: "Ask CFS",
    },
  ],
  overview: [
    {
      body: "This mode turns parcel, tax-base, and constraint data into screening-level economic intelligence.",
      id: "overview-hero",
      targetSelector: '[data-econ-tour="overview-hero"]',
      title: "What it is",
    },
    {
      body: "Use Overview, Power BI & Tools, Economic Dashboard, and Print as one workflow.",
      id: "overview-workflow",
      targetSelector: '[data-econ-tour="workflow"]',
      title: "Four-page workflow",
    },
    {
      body: "Local mode uses FastAPI and PostGIS. Portfolio demo uses a cached demo extract.",
      id: "overview-data",
      targetSelector: '[data-econ-tour="data-mode"]',
      title: "Data mode",
    },
    {
      actionSection: "tools",
      body: "Start by selecting rows or building a Power BI-ready output.",
      id: "overview-next",
      keepTutorialOpenOnAction: true,
      optionalActionLabel: "Open Power BI & Tools tutorial",
      targetSelector: '[data-econ-tour="workflow"]',
      title: "Next step",
    },
  ],
  print: [
    {
      body: "This page creates a screening-level economics snapshot.",
      id: "print-header",
      targetSelector: '[data-econ-tour="print-header"]',
      title: "Snapshot header",
    },
    {
      body: "Selected rows from Power BI & Tools become the focus of the snapshot.",
      id: "print-scope",
      targetSelector: '[data-econ-tour="print-scope"]',
      title: "Selected rows",
    },
    {
      body: "Use this as the short presentation-ready summary.",
      id: "print-takeaway",
      targetSelector: '[data-econ-tour="print-takeaway"]',
      title: "Executive takeaway",
    },
    {
      body: "Select which saved bucket items should appear in the printed snapshot.",
      id: "print-report-bucket",
      targetSelector: '[data-econ-tour="print-report-bucket"]',
      title: "Report Bucket",
    },
    {
      body: "Keep caveats visible so the report is not mistaken for an official appraisal or fiscal impact study.",
      id: "print-caveats",
      targetSelector: '[data-econ-tour="print-caveats"]',
      title: "Caveats",
    },
    {
      body: "Print, save as PDF, or copy the memo for a presentation.",
      id: "print-actions",
      targetSelector: '[data-econ-tour="print-actions"]',
      title: "Print actions",
    },
  ],
  tools: [
    {
      body: "Ask CFS or choose a quick report type to start.",
      id: "tools-purpose",
      targetSelector: '[data-econ-tour="powerbi-tools-header"]',
      title: "Choose report",
      why: "Start with the report you want.",
    },
    {
      body: "Generate a ready-to-use preview with charts, tables, summary text, and caveats.",
      id: "tools-ask-cfs",
      targetSelector: '[data-econ-tour="powerbi-practice-pack"]',
      title: "Generate report",
      why: "This is the main path.",
    },
    {
      body: "Review generated visuals and tables before saving anything.",
      id: "tools-chart-builder",
      targetSelector: '[data-econ-tour="generated-report-preview"]',
      title: "Review preview",
      why: "No table-name knowledge required.",
    },
    {
      body: "Toggle summary, KPI cards, visuals, tables, caveats, and Power BI details.",
      id: "tools-chart-templates",
      targetSelector: '[data-econ-tour="generated-report-preview"]',
      title: "Choose sections",
      why: "Print only what matters.",
    },
    {
      body: "Save the generated report as one bucket item when the preview looks right.",
      id: "tools-report-canvas",
      targetSelector: '[data-econ-tour="generated-report-preview"]',
      title: "Save report",
      why: "The bucket connects tools to Print.",
    },
    {
      body: "Saved reports, visuals, and notes live here until you send them to Print.",
      id: "tools-report-bucket",
      targetSelector: '[data-econ-tour="report-bucket"]',
      title: "Report Bucket",
      why: "This connects Power BI work to the final snapshot.",
    },
    {
      body: "CSV exports, manual chart builder, report canvas, and scenario tools are optional.",
      id: "tools-advanced",
      targetSelector: '[data-econ-tour="advanced-tools"]',
      title: "Advanced Manual Tools",
      why: "Open only when you need the manual path.",
    },
    {
      actionSection: "print",
      body: "Send the saved report to Print for the final snapshot.",
      id: "tools-final-output",
      optionalActionLabel: "Go to Print",
      targetSelector: '[data-econ-tour="report-bucket"]',
      title: "Send to Print",
      why: "Print is the presentation-ready deliverable.",
    },
  ],
};

const executiveCards = [
  {
    icon: Gauge,
    text: "Value, acreage, permit activity, and confidence summarized for executive review.",
    title: "Growth & Tax Base Intelligence",
  },
  {
    icon: Search,
    text: "Underbuilt, constrained, and data-needed parcel signals in a consulting screen.",
    title: "Parcel Investment Screen",
  },
  {
    icon: ShieldAlert,
    text: "Fiscal upside reviewed against service burden, infrastructure uncertainty, and constraints.",
    title: "Fiscal Impact Lens",
  },
  {
    icon: Calculator,
    text: "Scenario assumptions, measures, and output bands in a planning-model workflow.",
    title: "Scenario Planning Model",
  },
  {
    icon: Database,
    text: "Facts, dimensions, and decision-pack exports for future BI and planning tools.",
    title: "Enterprise Export / BI Readiness",
  },
];

const decisionQuestions = [
  "Where is economic opportunity strongest?",
  "Which parcels appear underbuilt?",
  "Where does growth create service burden?",
  "Which corridors deserve deeper investment review?",
  "What data gaps limit confidence?",
];

const fallbackScenarioOutputs: EconomicsScenarioOutput[] = [
  {
    constraint_adjusted_opportunity_band: "current context",
    data_confidence: "data_needed",
    estimated_tax_base_lift_band: "baseline",
    infrastructure_burden_band: "data needed",
    recommended_next_diligence: "Load economics intelligence to compare scenario output bands.",
    revenue_per_acre_band: "data needed",
    scenario_id: "current_conditions",
    service_burden_band: "data needed",
    title: "Current Conditions",
  },
];

const measureRows = [
  { label: "Assessed Value", value: "Current parcel/tax value baseline." },
  { label: "Value per Acre", value: "Assessed value divided by acreage." },
  { label: "Tax-Base Lift Band", value: "Modeled lift category under assumptions, not a formal forecast." },
  { label: "Public Cost Risk Band", value: "Service burden and constraint context." },
];

const planningRows = [
  { label: "Dimensions", value: "Geography, Parcel, Jurisdiction, Land Use / Zoning, Time, Scenario, Constraint Domain." },
  { label: "Measures", value: "Assessed value, land value, improvement value, value per acre, estimated tax, data confidence." },
  { label: "Outputs", value: "Opportunity class, constraint-adjusted opportunity band, recommended next diligence, executive memo." },
];
