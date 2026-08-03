"use client";

import {
  BriefcaseBusiness,
  Building2,
  Download,
  Gauge,
  MapPinned,
  Network,
  PanelLeft,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AskCfsPanel, type AskCfsExternalRequest } from "@/components/dashboard/AskCfsPanel";
import { InvestmentCaseStudies, type InitialCaseStudyUrlState } from "@/components/investment/InvestmentCaseStudies";
import { InvestmentShell, investmentPages, type InvestmentPageId } from "@/components/investment/InvestmentShell";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useProductPrincipal } from "@/hooks/useProductPrincipal";
import {
  askCfsEconomicsPowerBiToolPrompts,
  askCfsEconomicsPrintPrompts,
  askCfsEconomicsWorkspacePrompts,
} from "@/lib/aiSearchService";
import {
  buildApiUrl,
  CFS_AUTH_MODE,
  recordTechnicalEvent,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import { ProductApiError, toProductApiError } from "@/lib/product/apiClient";
import { toJsonObject } from "@/lib/product/json";
import {
  getEconomicScenarioRepository,
  getReportBucketRepository,
} from "@/lib/product/runtimeRepository";
import type {
  EconomicScenarioRecord,
  JsonValue,
  ReportBucketItemRecord,
} from "@/lib/product/types";
import { packageBackedConsultingCaseStudy } from "@/lib/consultingCaseStudyPackage";
import {
  getEconomicsEnterpriseExport,
  getEconomicsIntelligence,
  getEconomicsPowerBiExport,
} from "@/lib/economicsIntelligenceService";
import {
  compareInvestmentIntakeCandidates,
  compareInvestmentUnderwritingScenarios,
  addInvestmentEngagementShortlistItem,
  addInvestmentOpportunityToIntake,
  calculateInvestmentUnderwriting,
  archiveInvestmentCaseStudy,
  createInvestmentEngagement,
  createInvestmentIntakeCandidate,
  createInvestmentSavedItem,
  createInvestmentSavedSearch,
  createInvestmentUnderwritingScenario,
  deleteInvestmentIntakeCandidate,
  deleteInvestmentUnderwritingScenario,
  duplicateInvestmentCaseStudy,
  exportInvestmentCaseStudyCodexBrief,
  generateInvestmentReport,
  generateInvestmentEngagementReport,
  getInvestmentCaseStudies,
  getInvestmentEngagements,
  getInvestmentIntake,
  getInvestmentIntakeAnalysis,
  getInvestmentOpportunities,
  getInvestmentOpportunitySources,
  getInvestmentRecentWork,
  getInvestmentResearchContext,
  getInvestmentSavedItems,
  getInvestmentSavedSearches,
  getInvestmentScreen,
  getInvestmentUnderwritingScenarios,
  getInvestmentUnderwritingTemplates,
  importInvestmentIntakeCsv,
  matchInvestmentOpportunity,
  prefillInvestmentUnderwriting,
  recordInvestmentRecentWork,
  searchInvestmentRadar,
  updateInvestmentCaseStudy,
  updateInvestmentIntakeCandidate,
  updateInvestmentUnderwritingScenario,
} from "@/lib/investmentIntelligenceService";
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
  InvestmentCaseStudy,
  InvestmentScreenCandidate,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCandidate,
  InvestmentIntakeCompareResponse,
  InvestmentIntakePayload,
  InvestmentReportResponse,
  InvestmentResearchContext,
  InvestmentReviewStatus,
  InvestmentSavedItem,
  InvestmentSavedSearch,
  InvestmentRecentWorkItem,
  InvestmentSourceType,
  InvestmentScreenResponse,
  InvestmentStrategyId,
  InvestmentAreaRadarArea,
  InvestmentCaseStudyCandidate,
  InvestmentEngagement,
  InvestmentOpportunityReference,
  InvestmentOpportunitySource,
  InvestmentUnderwritingCalculation,
  InvestmentUnderwritingCompareResponse,
  InvestmentUnderwritingPrefillResponse,
  InvestmentUnderwritingScenario,
  InvestmentUnderwritingTemplate,
  InvestmentUnderwritingScenarioType,
} from "@/types/api";

type EconomicsShellProps = {
  initialCaseStudyUrlState?: InitialCaseStudyUrlState;
  initialInvestmentPage?: InvestmentPageId;
  mode?: "consulting" | "economics";
};

const defaultConsultingCaseStudy = packageBackedConsultingCaseStudy;
const economicScenarioRepository = getEconomicScenarioRepository();
const reportBucketRepository = getReportBucketRepository();

export function EconomicsShell({
  initialCaseStudyUrlState,
  initialInvestmentPage,
  mode = "economics",
}: EconomicsShellProps = {}) {
  const {
    clearSelectedParcel,
    economicsSection,
    selectedParcelId,
    setCfsAppMode,
    setEconomicsSection,
  } = useDashboardState();
  const {
    can,
    error: principalError,
    reload: reloadPrincipal,
    requestId: principalRequestId,
    status: principalStatus,
  } = useProductPrincipal();
  const consultingMode = mode === "consulting";
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [enterpriseExport, setEnterpriseExport] =
    useState<EconomicsEnterpriseExportResponse | null>(null);
  const [powerBiExport, setPowerBiExport] =
    useState<EconomicsPowerBiExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [reportBucketItems, setReportBucketItems] = useState<ReportBucketItem[]>([]);
  const [reportBucketAttempt, setReportBucketAttempt] = useState(0);
  const [reportBucketBusy, setReportBucketBusy] = useState(false);
  const [reportBucketError, setReportBucketError] = useState<string | null>(null);
  const [reportBucketRequestId, setReportBucketRequestId] = useState<string | null>(null);
  const [reportBucketStatus, setReportBucketStatus] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const canWriteReportBucket =
    reportBucketRepository.provider === "demo" || can("reports:write");
  const reportBucketMutationsDisabled =
    !canWriteReportBucket || reportBucketBusy;

  useEffect(() => {
    if (reportBucketRepository.provider === "api" && principalStatus === "loading") {
      const timeout = window.setTimeout(
        () => setReportBucketStatus("Loading Report Bucket access..."),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
    if (reportBucketRepository.provider === "api" && principalStatus === "error") {
      const timeout = window.setTimeout(() => {
        setReportBucketError(principalError ?? "Product access could not be verified.");
        setReportBucketStatus(null);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setReportBucketBusy(true);
      setReportBucketError(null);
      setReportBucketStatus("Loading Report Bucket...");
    });
    void reportBucketRepository
      .list({ pageSize: 100, signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setReportBucketRequestId(result.requestId);
        const records = [...result.data];
        const total = result.pagination?.total ?? records.length;
        const pageSize = result.pagination?.pageSize ?? 100;
        for (let page = 2; records.length < total; page += 1) {
          const next = await reportBucketRepository.list({
            page,
            pageSize,
            signal: controller.signal,
          });
          records.push(...next.data);
          setReportBucketRequestId(next.requestId);
          if (!next.data.length) break;
        }
        if (controller.signal.aborted) return;
        setReportBucketItems(
          records.map((record) => reportBucketItemFromRecord(record)),
        );
        setReportBucketStatus(
          reportBucketRepository.provider === "demo"
            ? "Report Bucket is saved only for this demo session."
            : canWriteReportBucket
              ? "Report Bucket loaded from CFS."
              : "Report Bucket is read-only for your role.",
        );
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const failure = productErrorDetails(caught);
        setReportBucketError(failure.message);
        setReportBucketRequestId(failure.requestId);
        setReportBucketStatus(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportBucketBusy(false);
      });
    return () => controller.abort();
  }, [
    canWriteReportBucket,
    principalError,
    principalStatus,
    reportBucketAttempt,
  ]);

  useEffect(() => {
    if (consultingMode) {
      return;
    }
    if (economicsSection === "overview") {
      setEconomicsSection("dashboard");
      return;
    }
    if (economicsSection === "workspace" || economicsSection === "enterprise") {
      setEconomicsSection("tools");
    }
  }, [consultingMode, economicsSection, setEconomicsSection]);

  useEffect(() => {
    if (consultingMode) {
      return;
    }
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
  }, [consultingMode]);

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
  const addReportBucketItem = async (item: ReportBucketItemInput): Promise<boolean> => {
    const bucketItem: ReportBucketItem = {
      ...item,
      created_at: item.created_at ?? new Date().toISOString(),
      selected_for_print: item.selected_for_print ?? true,
    };
    if (
      reportBucketItems.some(
        (existing) =>
          existing.id === bucketItem.id ||
          (existing.title === bucketItem.title &&
            existing.type === bucketItem.type &&
            existing.content === bucketItem.content),
      )
    ) {
      setReportBucketStatus("That item is already in the Report Bucket.");
      return true;
    }
    if (!canWriteReportBucket || reportBucketBusy) {
      setReportBucketError(
        reportBucketBusy
          ? "Another Report Bucket change is still saving."
          : "Your role cannot add Report Bucket items.",
      );
      return false;
    }
    setReportBucketBusy(true);
    setReportBucketError(null);
    setReportBucketStatus("Saving Report Bucket item...");
    try {
      const result = await reportBucketRepository.create(
        reportBucketCreateInput(bucketItem, reportBucketItems.length),
      );
      setReportBucketRequestId(result.requestId);
      setReportBucketItems((current) => [
        reportBucketItemFromRecord(result.data, bucketItem),
        ...current,
      ]);
      setReportBucketStatus(
        reportBucketRepository.provider === "demo"
          ? "Saved in this demo session."
          : "Saved to CFS Report Bucket.",
      );
      return true;
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setReportBucketError(failure.message);
      setReportBucketRequestId(failure.requestId);
      setReportBucketStatus(null);
      return false;
    } finally {
      setReportBucketBusy(false);
    }
  };
  const removeReportBucketItem = async (id: string) => {
    const item = reportBucketItems.find((candidate) => candidate.id === id);
    if (!item?.server_id || !canWriteReportBucket || reportBucketBusy) return;
    setReportBucketBusy(true);
    setReportBucketError(null);
    setReportBucketStatus("Removing Report Bucket item...");
    try {
      const result = await reportBucketRepository.archive(item.server_id);
      setReportBucketRequestId(result.requestId);
      setReportBucketItems((current) => current.filter((candidate) => candidate.id !== id));
      setReportBucketStatus("Report Bucket item removed.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setReportBucketError(failure.message);
      setReportBucketRequestId(failure.requestId);
      setReportBucketStatus(null);
    } finally {
      setReportBucketBusy(false);
    }
  };
  const toggleReportBucketPrint = async (id: string) => {
    const item = reportBucketItems.find((candidate) => candidate.id === id);
    if (!item?.server_id || !canWriteReportBucket || reportBucketBusy) return;
    setReportBucketBusy(true);
    setReportBucketError(null);
    setReportBucketStatus("Updating Print selection...");
    try {
      const result = await reportBucketRepository.update(
        item.server_id,
        { include_in_print: !item.selected_for_print },
        { expectedUpdatedAt: item.updated_at },
      );
      setReportBucketRequestId(result.requestId);
      const updated = reportBucketItemFromRecord(result.data, item);
      setReportBucketItems((current) =>
        current.map((candidate) => (candidate.id === id ? updated : candidate)),
      );
      setReportBucketStatus("Print selection saved.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setReportBucketError(failure.message);
      setReportBucketRequestId(failure.requestId);
      setReportBucketStatus(null);
    } finally {
      setReportBucketBusy(false);
    }
  };
  const setAllReportBucketPrint = async (selected: boolean) => {
    if (!canWriteReportBucket || reportBucketBusy) return;
    setReportBucketBusy(true);
    setReportBucketError(null);
    setReportBucketStatus("Updating Print selections...");
    try {
      const results = await Promise.all(
        reportBucketItems.map((item) =>
          item.server_id
            ? reportBucketRepository.update(
                item.server_id,
                { include_in_print: selected },
                { expectedUpdatedAt: item.updated_at },
              )
            : Promise.resolve(null),
        ),
      );
      const records = new Map(
        results
          .filter((result): result is NonNullable<typeof result> => Boolean(result))
          .map((result) => [
            result.data.object_id,
            reportBucketItemFromRecord(
              result.data,
              reportBucketItems.find((item) => item.id === result.data.object_id),
            ),
          ]),
      );
      setReportBucketRequestId(
        results.find((result): result is NonNullable<typeof result> => Boolean(result))?.requestId ?? null,
      );
      setReportBucketItems((current) =>
        current.map((item) => records.get(item.id) ?? item),
      );
      setReportBucketStatus("Print selections saved.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setReportBucketError(failure.message);
      setReportBucketRequestId(failure.requestId);
      setReportBucketStatus(null);
      setReportBucketAttempt((current) => current + 1);
    } finally {
      setReportBucketBusy(false);
    }
  };
  const clearReportBucket = async () => {
    if (!canWriteReportBucket || reportBucketBusy) return;
    setReportBucketBusy(true);
    setReportBucketError(null);
    setReportBucketStatus("Clearing Report Bucket...");
    try {
      const results = await Promise.all(
        reportBucketItems.map((item) =>
          item.server_id
            ? reportBucketRepository.archive(item.server_id)
            : Promise.resolve(null),
        ),
      );
      setReportBucketRequestId(
        results.find((result): result is NonNullable<typeof result> => Boolean(result))?.requestId ?? null,
      );
      setReportBucketItems([]);
      setReportBucketStatus("Report Bucket cleared.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setReportBucketError(failure.message);
      setReportBucketRequestId(failure.requestId);
      setReportBucketStatus(null);
      setReportBucketAttempt((current) => current + 1);
    } finally {
      setReportBucketBusy(false);
    }
  };
  const retryReportBucket = () => {
    if (principalStatus === "error") reloadPrincipal();
    setReportBucketAttempt((current) => current + 1);
  };
  const activeEconomicsSection =
    economicsSection === "overview"
      ? "dashboard"
      : economicsSection === "workspace" || economicsSection === "enterprise"
      ? "tools"
      : economicsSection;
  const consultingAuthStatus = USE_DEMO_DATA
    ? "Portfolio demonstration mode"
    : CFS_AUTH_MODE === "oidc"
      ? "Secured with Microsoft Entra"
      : "Local development session";
  const openEconomicsFromConsulting = (section: "print") => {
    setCfsAppMode("economics");
    setEconomicsSection(section);
  };

  if (consultingMode) {
    return (
      <main className="consult-shell relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <InvestmentPanelPage
          onAddReportBucketItem={addReportBucketItem}
          onClearReportBucket={clearReportBucket}
          onClearSelection={() => setSelectedSignalIds([])}
          onNavigate={openEconomicsFromConsulting}
          onRemoveReportBucketItem={removeReportBucketItem}
          onToggleReportBucketPrint={toggleReportBucketPrint}
          onToggleSignal={toggleSelectedSignal}
          initialCaseStudyUrlState={initialCaseStudyUrlState}
          initialInvestmentPage={initialInvestmentPage}
          reportBucketItems={reportBucketItems}
          reportBucketMutationsDisabled={reportBucketMutationsDisabled}
          selectedSignalIds={selectedSignalIds}
          signals={signals}
          statusLabel={consultingAuthStatus}
        />
        <div className="pointer-events-none absolute bottom-4 right-4 z-50 max-w-md [&_button]:pointer-events-auto">
          <ProductPersistenceNotice
            error={reportBucketError}
            requestId={reportBucketRequestId ?? principalRequestId}
            status={reportBucketStatus}
            testId="report-bucket-status"
            onRetry={retryReportBucket}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="econ-shell relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 lg:p-5">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
        <div className="no-print flex justify-end">
          <EconomicsTutorialButton onClick={() => setTutorialOpen(true)} />
        </div>
        <ProductPersistenceNotice
          error={reportBucketError}
          requestId={reportBucketRequestId ?? principalRequestId}
          status={reportBucketStatus}
          testId="report-bucket-status"
          onRetry={retryReportBucket}
        />
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
        {activeEconomicsSection === "tools" ? (
          <PowerBiToolsPage
            dataReadiness={intelligence?.data_readiness ?? []}
            exportPayload={enterpriseExport}
            inputs={intelligence?.scenario_inputs ?? []}
            onClearSelection={() => setSelectedSignalIds([])}
            onAddReportBucketItem={addReportBucketItem}
            onClearReportBucket={clearReportBucket}
            onNavigate={setEconomicsSection}
            onRemoveReportBucketItem={removeReportBucketItem}
            onStartTutorial={() => setTutorialOpen(true)}
            onToggleReportBucketPrint={toggleReportBucketPrint}
            onToggleSignal={toggleSelectedSignal}
            outputs={intelligence?.scenario_outputs ?? []}
            powerBiPayload={powerBiExport}
            reportBucketItems={reportBucketItems}
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
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
            onClearParcel={clearSelectedParcel}
            selectedParcelId={selectedParcelId}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {activeEconomicsSection === "print" ? (
          <EconomicsPrintPage
            intelligence={intelligence}
            onClearReportBucket={clearReportBucket}
            onNavigate={setEconomicsSection}
            onRemoveReportBucketItem={removeReportBucketItem}
            onSetAllReportBucketPrint={setAllReportBucketPrint}
            onToggleReportBucketPrint={toggleReportBucketPrint}
            reportBucketItems={reportBucketItems}
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
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

function ProductPersistenceNotice({
  error,
  onRetry,
  requestId,
  status,
  testId,
}: {
  error: string | null;
  onRetry: () => void;
  requestId: string | null;
  status: string | null;
  testId: string;
}) {
  if (!error && !status) return null;
  return (
    <div
      aria-live="polite"
      className={`no-print rounded-xl border px-3 py-2 text-xs ${
        error
          ? "border-[var(--econ-risk)]/30 bg-[var(--econ-risk)]/10 text-[#ffd1c2]"
          : "border-[var(--econ-green)]/30 bg-[var(--econ-green)]/10 text-[var(--econ-green)]"
      }`}
      data-request-id={requestId ?? undefined}
      data-testid={testId}
      role="status"
    >
      <span>{error ?? status}</span>
      {error ? (
        <button
          className="ml-2 font-semibold underline underline-offset-4"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

type EconomicsTutorialPage = "tools" | "dashboard" | "print";

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
  reportBucketMutationsDisabled,
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
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
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
  reportBucketMutationsDisabled: boolean;
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
  const [activeToolsTab, setActiveToolsTab] =
    useState<"builder" | "tables" | "screener" | "bucket">("builder");
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
            disabled={reportBucketMutationsDisabled}
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
      <section className="rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
          Power BI workflow
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Power BI and tools workflow tabs">
          {[
            ["builder", "Report Builder"],
            ["tables", "Data Tables"],
            ["screener", "Land Screener"],
            ["bucket", "Report Bucket"],
          ].map(([key, label]) => (
            <button
              aria-selected={activeToolsTab === key}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                activeToolsTab === key
                  ? "border-[var(--econ-gold)]/60 bg-[var(--econ-gold)]/15 text-[#ffe6a6]"
                  : "border-[var(--econ-border)] text-[var(--econ-muted)] hover:border-[var(--econ-gold)]/45 hover:text-[var(--econ-text)]"
              }`}
              key={key}
              onClick={() => setActiveToolsTab(key as typeof activeToolsTab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      {activeToolsTab === "builder" ? (
      <PowerBiReportGenerator
        askPowerBiAction={askPowerBiAction}
        availability={reportAvailability}
        dataReadiness={dataReadiness}
        onAddReportBucketItem={onAddReportBucketItem}
        onNavigate={onNavigate}
        outputs={outputs}
        payload={powerBiPayload}
        reportBucketMutationsDisabled={reportBucketMutationsDisabled}
        signals={signals}
      />
      ) : null}
      {activeToolsTab === "screener" ? (
      <LandDueDiligenceScreener
        onAddReportBucketItem={onAddReportBucketItem}
        onClearSelection={onClearSelection}
        onNavigate={onNavigate}
        onToggleSignal={onToggleSignal}
        selectedSignalIds={selectedSignalIds}
        signals={signals}
        reportBucketMutationsDisabled={reportBucketMutationsDisabled}
      />
      ) : null}
      {activeToolsTab === "bucket" ? (
      <ReportBucketPanel
        items={reportBucketItems}
        onClear={onClearReportBucket}
        onOpenPrint={() => onNavigate("print")}
        onRemove={onRemoveReportBucketItem}
        onTogglePrint={onToggleReportBucketPrint}
        reportBucketMutationsDisabled={reportBucketMutationsDisabled}
        title="Report Bucket"
      />
      ) : null}
      {activeToolsTab === "tables" ? (
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
              reportBucketMutationsDisabled={reportBucketMutationsDisabled}
              scenarios={scenarios}
              selectedSignals={selectedSignals}
              showSelectedRowsStep={false}
            />
          </section>
        </div>
      </details>
      ) : null}
    </>
  );
}

function InvestmentPanelPage({
  initialCaseStudyUrlState,
  initialInvestmentPage,
  onAddReportBucketItem,
  onClearReportBucket,
  onClearSelection,
  onNavigate,
  onRemoveReportBucketItem,
  onToggleReportBucketPrint,
  onToggleSignal,
  reportBucketItems,
  reportBucketMutationsDisabled,
  selectedSignalIds,
  signals,
  statusLabel,
}: {
  initialCaseStudyUrlState?: InitialCaseStudyUrlState;
  initialInvestmentPage?: InvestmentPageId;
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  onClearReportBucket: () => void;
  onClearSelection: () => void;
  onNavigate: (section: "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onToggleReportBucketPrint: (id: string) => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  reportBucketItems: ReportBucketItem[];
  reportBucketMutationsDisabled: boolean;
  selectedSignalIds: string[];
  signals: EconomicsParcelSignal[];
  statusLabel?: string;
}) {
  const [activeStrategy, setActiveStrategy] = useState<InvestmentStrategyId>("development_land");
  const [investmentScreen, setInvestmentScreen] = useState<InvestmentScreenResponse | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [activeResearchContext, setActiveResearchContext] = useState<InvestmentResearchContext | null>(null);
  const [activeResearchStatus, setActiveResearchStatus] = useState<"Idle" | "Loading" | "Ready" | "Error">("Idle");
  const [comparisonRows, setComparisonRows] = useState<RankedLandReviewCandidate[]>([]);
  const [guide, setGuide] = useState<DueDiligencePacket | null>(null);
  const [intakeAnalysis, setIntakeAnalysis] = useState<InvestmentIntakeAnalysisResponse | null>(null);
  const [intakeCandidates, setIntakeCandidates] = useState<InvestmentIntakeCandidate[]>([]);
  const [intakeCompareIds, setIntakeCompareIds] = useState<string[]>([]);
  const [intakeComparison, setIntakeComparison] = useState<InvestmentIntakeCompareResponse | null>(null);
  const [intakeCsv, setIntakeCsv] = useState("");
  const [editingIntakeId, setEditingIntakeId] = useState<string | null>(null);
  const [intakeForm, setIntakeForm] = useState<InvestmentIntakePayload>(defaultInvestmentIntakeForm(activeStrategy));
  const [investmentReport, setInvestmentReport] = useState<InvestmentReportResponse | null>(null);
  const [investmentReportType, setInvestmentReportType] = useState("development_site_review");
  const [activeInvestmentPage, setActiveInvestmentPage] = useState<InvestmentPageId>(initialInvestmentPage ?? "overview");
  const [caseStudies, setCaseStudies] = useState<InvestmentCaseStudy[]>([]);
  const [activeCaseStudySlug, setActiveCaseStudySlug] = useState<string | null>(() => readCaseStudyWorkflowUrl().slug);
  const [caseStudyBriefMarkdown, setCaseStudyBriefMarkdown] = useState<string | null>(null);
  const [myShortlist, setMyShortlist] = useState<InvestmentSavedItem[]>([]);
  const [recentWork, setRecentWork] = useState<InvestmentRecentWorkItem[]>([]);
  const [savedSearches, setSavedSearches] = useState<InvestmentSavedSearch[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [underwritingAssumptions, setUnderwritingAssumptions] = useState<Record<string, number | string | null>>(defaultUnderwritingAssumptions("development_land"));
  const [underwritingCompareIds, setUnderwritingCompareIds] = useState<string[]>([]);
  const [underwritingComparison, setUnderwritingComparison] = useState<InvestmentUnderwritingCompareResponse | null>(null);
  const [underwritingResult, setUnderwritingResult] = useState<InvestmentUnderwritingCalculation | null>(null);
  const [underwritingScenarios, setUnderwritingScenarios] = useState<InvestmentUnderwritingScenario[]>([]);
  const [underwritingScenarioName, setUnderwritingScenarioName] = useState("Development Feasibility Scenario");
  const [underwritingScenarioType, setUnderwritingScenarioType] = useState<InvestmentUnderwritingScenarioType>("development_land");
  const [underwritingStatus, setUnderwritingStatus] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<InvestmentEngagement[]>([]);
  const [opportunities, setOpportunities] = useState<InvestmentOpportunityReference[]>([]);
  const [opportunitySources, setOpportunitySources] = useState<InvestmentOpportunitySource[]>([]);
  const [radarAreas, setRadarAreas] = useState<InvestmentAreaRadarArea[]>([]);
  const [underwritingPrefill, setUnderwritingPrefill] = useState<InvestmentUnderwritingPrefillResponse | null>(null);
  const [underwritingTemplates, setUnderwritingTemplates] = useState<InvestmentUnderwritingTemplate[]>([]);
  const [intakeLoading, setIntakeLoading] = useState(!USE_DEMO_DATA);
  const [intakeUnavailable, setIntakeUnavailable] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const investmentViewMode = "advanced" as const;

  useEffect(() => {
    const syncInvestmentUrlState = () => {
      const nextPage = readInvestmentDisplayPreference().lastPage;
      if (nextPage) setActiveInvestmentPage((current) => current === nextPage ? current : nextPage);
      const nextCaseStudySlug = readCaseStudyWorkflowUrl().slug;
      setActiveCaseStudySlug((current) => current === nextCaseStudySlug ? current : nextCaseStudySlug);
      const nextParcelId = readInvestmentParcelPreference();
      setActiveCandidateId((current) => current === nextParcelId ? current : nextParcelId);
    };
    const timeoutId = window.setTimeout(syncInvestmentUrlState, 0);
    window.addEventListener("popstate", syncInvestmentUrlState);
    window.addEventListener("pageshow", syncInvestmentUrlState);
    window.addEventListener("cfs:case-study-url", syncInvestmentUrlState);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("popstate", syncInvestmentUrlState);
      window.removeEventListener("pageshow", syncInvestmentUrlState);
      window.removeEventListener("cfs:case-study-url", syncInvestmentUrlState);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const pageFromUrl = new URLSearchParams(window.location.search).get("investmentPage");
      if (isInvestmentPageId(pageFromUrl) && pageFromUrl !== activeInvestmentPage) return;
    }
    writeInvestmentDisplayPreference({ lastPage: activeInvestmentPage, viewMode: investmentViewMode });
  }, [activeInvestmentPage, investmentViewMode]);

  useEffect(() => {
    let mounted = true;
    void getInvestmentScreen(activeStrategy)
      .then((response) => {
        if (mounted) setInvestmentScreen(response);
      })
      .catch(() => {
        if (mounted) setInvestmentScreen(null);
      });
    return () => {
      mounted = false;
    };
  }, [activeStrategy]);
  useEffect(() => {
    let mounted = true;
    void getInvestmentIntake()
      .then((response) => {
        if (mounted) setIntakeCandidates(response.candidates);
        if (mounted) setIntakeUnavailable(false);
      })
      .catch(() => {
        if (mounted) setIntakeCandidates([]);
        if (mounted) setIntakeUnavailable(true);
      })
      .finally(() => {
        if (mounted) setIntakeLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    void getInvestmentCaseStudies()
      .then((response) => {
        if (!mounted) return;
        setCaseStudies(response.case_studies);
        setActiveCaseStudySlug((current) => current ?? response.case_studies[0]?.slug ?? null);
      })
      .catch(() => {
        if (mounted) setCaseStudies([]);
      });
    void Promise.allSettled([
      getInvestmentOpportunitySources(),
      getInvestmentOpportunities(),
      searchInvestmentRadar(),
      getInvestmentEngagements(),
      getInvestmentUnderwritingTemplates(),
      getInvestmentSavedItems(),
      getInvestmentRecentWork(),
      getInvestmentSavedSearches(),
    ]).then(([sources, feed, radar, engagementList, templates, savedItems, recentItems, searches]) => {
      if (!mounted) return;
      if (sources.status === "fulfilled") setOpportunitySources(sources.value.sources);
      if (feed.status === "fulfilled") setOpportunities(feed.value.opportunities);
      if (radar.status === "fulfilled") setRadarAreas(radar.value.areas);
      if (engagementList.status === "fulfilled") setEngagements(engagementList.value.engagements);
      if (templates.status === "fulfilled") setUnderwritingTemplates(templates.value.templates);
      if (savedItems.status === "fulfilled") setMyShortlist(savedItems.value.items);
      if (recentItems.status === "fulfilled") setRecentWork(recentItems.value.items);
      if (searches.status === "fulfilled") setSavedSearches(searches.value.searches);
    });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    void getInvestmentUnderwritingScenarios()
      .then((response) => {
        if (mounted) setUnderwritingScenarios(response.scenarios);
      })
      .catch(() => {
        if (mounted) setUnderwritingScenarios([]);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    let mounted = true;
    if (!activeCandidateId || activeResearchContext?.identity.parcel_id === activeCandidateId) {
      return () => {
        mounted = false;
      };
    }
    void getInvestmentResearchContext(activeCandidateId, activeStrategy)
      .then((context) => {
        if (!mounted) return;
        setActiveResearchContext(context);
        setActiveResearchStatus("Ready");
        setStatus(`Loaded research context for ${activeCandidateId}.`);
      })
      .catch(() => {
        if (!mounted) return;
        setActiveResearchStatus("Error");
        setStatus("Research context failed. Retry or search another parcel.");
      });
    return () => {
      mounted = false;
    };
  }, [activeCandidateId, activeResearchContext?.identity.parcel_id, activeStrategy]);
  const activeInvestmentScreen = investmentScreen?.strategy === activeStrategy ? investmentScreen : null;
  const engineCandidatesByParcel = useMemo(
    () =>
      new Map(
        (activeInvestmentScreen?.candidates ?? []).map((candidate) => [
          candidate.parcel_id,
          candidate,
        ]),
      ),
    [activeInvestmentScreen],
  );
  const rows = useMemo(
    () =>
      landDueDiligenceRows(signals)
        .map((signal) => {
          const investmentCandidate = engineCandidatesByParcel.get(signal.parcel_id);
          return {
            investment_candidate: investmentCandidate,
            ranking: investmentCandidate ? investmentCandidateRanking(investmentCandidate) : landReviewRanking(signal),
            signal,
          };
        })
        .sort((left, right) => {
          if (left.investment_candidate && right.investment_candidate) {
            return left.investment_candidate.sort_order - right.investment_candidate.sort_order;
          }
          return right.ranking.sort_value - left.ranking.sort_value;
        }),
    [engineCandidatesByParcel, signals],
  );
  const visibleRows = rows
    .filter((row) => (activeInvestmentScreen ? Boolean(row.investment_candidate) : matchesInvestmentStrategy(row.signal, activeStrategy)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const selectedRows = rows.filter((row) => selectedSignalIds.includes(row.signal.parcel_id)).slice(0, 5);
  const visibleCaseStudies = caseStudies.length ? caseStudies : [defaultConsultingCaseStudy];
  const activeCaseStudy = visibleCaseStudies.find((item) => item.slug === activeCaseStudySlug) ?? visibleCaseStudies[0] ?? null;
  const activeCaseStudyPackage = activeCaseStudy?.package as {
    artifacts?: { shortlisted_candidates?: { candidates?: Array<{ parcel_id?: string }> } };
    deliverable_status?: unknown;
    excel_workbook_status?: unknown;
    next_action?: unknown;
    recommendation_status?: unknown;
  } | undefined;
  const activeCaseStudyCandidate = activeCandidateId ? activeCaseStudy?.candidates?.find((candidate) => candidate.parcel_id === activeCandidateId) : null;
  const activeRow = activeCandidateId
    ? rows.find((row) => row.signal.parcel_id === activeCandidateId) ?? (activeCaseStudyCandidate ? caseStudyCandidateComparisonRow(activeCaseStudyCandidate) : null)
    : selectedRows[0] ?? visibleRows[0] ?? rows[0] ?? null;
  const activeSignal = activeRow?.signal ?? null;
  const activeInvestmentCandidate = activeRow?.investment_candidate ?? null;
  const activeParcelId = activeResearchContext?.identity.parcel_id ?? intakeAnalysis?.candidate.parcel_id ?? activeSignal?.parcel_id ?? null;
  const activePropertySummary = activeParcelId
    ? {
        acreage: activeResearchContext?.identity.approximate_acreage ?? intakeAnalysis?.acquisition_basis.parcel_acres ?? activeSignal?.acreage ?? null,
        dataConfidence: String(activeResearchContext?.evidence_quality.overall_data_confidence_band ?? activeSignal?.data_confidence ?? activeSignal?.economic_data_confidence ?? "Needs Verification"),
        label: activeResearchContext?.identity.private_candidate_label ?? intakeAnalysis?.candidate.candidate_name ?? activeParcelId,
        parcelId: activeParcelId,
        researchStatus: activeResearchStatus,
        strategy: investmentStrategyLabel(activeStrategy),
      }
    : null;
  const activeCaseStudyCandidateIds =
    activeCaseStudy?.candidates?.map((candidate) => candidate.parcel_id).filter(Boolean) ??
    activeCaseStudyPackage?.artifacts?.shortlisted_candidates?.candidates?.map((candidate) => candidate.parcel_id).filter((parcelId): parcelId is string => Boolean(parcelId)) ??
    [];
  const tier1 = rows.filter((row) => row.ranking.review_priority_band.startsWith("Tier 1")).length;
  const tier2 = rows.filter((row) => row.ranking.review_priority_band.startsWith("Tier 2")).length;
  const sewerSupported = rows.filter((row) => hasSewerSupport(row.signal)).length;
  const [askRequest, setAskRequest] = useState<AskCfsExternalRequest | null>(null);
  const askAboutSignal = (signal: EconomicsParcelSignal) => {
    setAskRequest({
      request: {
        app_mode: "consulting",
        filter_context: {
          mode: "investment_panel",
          selected_candidate: signal.parcel_id,
        },
        query: `Why is ${signalLabel(signal)} ranked high for manual review?`,
      },
      requestId: Date.now(),
    });
    setAssistantOpen(true);
  };
  const createGuide = () => {
    const nextGuide = selectedRows.length
      ? watchlistDueDiligencePacket(selectedRows.map((row) => row.signal))
      : activeSignal
        ? singleParcelDueDiligencePacket(activeSignal)
        : null;
    if (!nextGuide) return;
    setGuide(nextGuide);
    setStatus("Review guide generated");
  };
  const addGuideToBucket = async () => {
    if (!guide) return;
    if (await onAddReportBucketItem(dueDiligencePacketBucketItem(guide))) {
      setStatus("Review guide saved to Report Bucket");
    }
  };
  const sendGuideToPrint = async () => {
    if (guide && !(await onAddReportBucketItem(dueDiligencePacketBucketItem(guide)))) return;
    onNavigate("print");
  };
  const generateReport = () => {
    const parcelId = activeParcelId;
    if (!parcelId && !intakeAnalysis?.candidate.id) {
      setStatus("Choose a parcel or intake candidate before generating a report.");
      return;
    }
    void generateInvestmentReport({
      candidate_id: intakeAnalysis?.candidate.id ?? null,
      parcel_id: parcelId ?? null,
      report_type: investmentReportType,
      strategy: activeStrategy,
    })
      .then((report) => {
        setInvestmentReport(report);
        recordInvestmentEvent("report_generated", { report_type: investmentReportType });
        setStatus("CFS Investments report generated");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Report generation failed."));
  };
  const addReportToBucket = async () => {
    if (!investmentReport) return;
    if (await onAddReportBucketItem(investmentReportBucketItem(investmentReport))) {
      setStatus("CFS Investments report saved to Report Bucket");
    }
  };
  const refreshIntake = () => {
    setIntakeLoading(true);
    return getInvestmentIntake()
      .then((response) => {
        setIntakeCandidates(response.candidates);
        setIntakeUnavailable(false);
      })
      .catch(() => {
        setIntakeUnavailable(true);
        setStatus("Candidate Intake is available only when the local backend and database are running.");
      })
      .finally(() => setIntakeLoading(false));
  };
  const createIntakeFromForm = () => {
    const payload = { ...intakeForm, strategy: activeStrategy };
    const request = editingIntakeId
      ? updateInvestmentIntakeCandidate(editingIntakeId, payload)
      : createInvestmentIntakeCandidate(payload);
    void request
      .then((analysis) => {
        setIntakeAnalysis(analysis);
        if (analysis.candidate.parcel_id && analysis.screening_context) {
          analyzeParcel(analysis.candidate.parcel_id, analysis.candidate.candidate_name);
        }
        setEditingIntakeId(null);
        setIntakeForm(defaultInvestmentIntakeForm(activeStrategy));
        setStatus(editingIntakeId ? "Candidate intake updated" : "Candidate added to Opportunity Review Queue");
        return refreshIntake();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Candidate intake failed."));
  };
  const createIntakeFromSignal = (signal: EconomicsParcelSignal) => {
    void createInvestmentIntakeCandidate({
      candidate_name: signalLabel(signal),
      parcel_id: signal.parcel_id,
      source_type: "Existing CFS Candidate",
      strategy: activeStrategy,
    })
      .then((analysis) => {
        setIntakeAnalysis(analysis);
        analyzeParcel(signal.parcel_id, signalLabel(signal));
        setStatus("Existing CFS candidate added to intake.");
        return refreshIntake();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Candidate intake failed."));
  };
  const importCsv = () => {
    void importInvestmentIntakeCsv(intakeCsv)
      .then((result) => {
        const notes = [
          `Imported ${result.created_count ?? result.created.length} candidate(s).`,
          result.duplicates.length ? `Duplicates skipped: ${result.duplicates.join(", ")}` : "",
          result.unmatched_parcel_ids.length ? `Unmatched parcel IDs: ${result.unmatched_parcel_ids.join(", ")}` : "",
          result.errors.length ? `Errors: ${result.errors.join(" | ")}` : "",
        ].filter(Boolean);
        setStatus(notes.join(" | "));
        setIntakeCsv("");
        return refreshIntake();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "CSV import failed."));
  };
  const openIntakeAnalysis = (candidateId: string) => {
    void getInvestmentIntakeAnalysis(candidateId)
      .then((analysis) => {
        setIntakeAnalysis(analysis);
        if (analysis.candidate.parcel_id && analysis.screening_context) {
          analyzeParcel(analysis.candidate.parcel_id, analysis.candidate.candidate_name);
        }
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Candidate analysis failed."));
  };
  const editIntakeCandidate = (candidate: InvestmentIntakeCandidate) => {
    setEditingIntakeId(candidate.id);
    setActiveStrategy(candidate.strategy);
    setIntakeForm({
      asking_price: candidate.asking_price ?? null,
      asking_price_date: candidate.asking_price_date ?? null,
      candidate_name: candidate.candidate_name,
      parcel_id: candidate.parcel_id ?? null,
      property_type: candidate.property_type ?? null,
      review_status: candidate.review_status,
      source_name: candidate.source_name ?? null,
      source_type: candidate.source_type,
      source_url: candidate.source_url ?? null,
      strategy: candidate.strategy,
      user_notes: candidate.user_notes ?? null,
    });
    setStatus("Editing intake candidate");
  };
  const toggleIntakeCompare = (candidateId: string) => {
    setIntakeCompareIds((current) => {
      if (current.includes(candidateId)) return current.filter((id) => id !== candidateId);
      return current.length < 4 ? [...current, candidateId] : current;
    });
  };
  const compareIntakeSelected = () => {
    if (intakeCompareIds.length < 2 || intakeCompareIds.length > 4) {
      setStatus("Select two to four intake candidates to compare.");
      return;
    }
    void compareInvestmentIntakeCandidates(intakeCompareIds)
      .then((response) => {
        setIntakeComparison(response);
        setStatus("Intake candidates compared");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Candidate comparison failed."));
  };
  const removeIntakeCandidate = (candidateId: string) => {
    void deleteInvestmentIntakeCandidate(candidateId)
      .then(() => {
        if (intakeAnalysis?.candidate.id === candidateId) setIntakeAnalysis(null);
        setIntakeCompareIds((current) => current.filter((id) => id !== candidateId));
        setIntakeComparison(null);
        setStatus("Candidate removed from intake.");
        return refreshIntake();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Candidate delete failed."));
  };
  const refreshUnderwriting = () =>
    getInvestmentUnderwritingScenarios()
      .then((response) => setUnderwritingScenarios(response.scenarios))
      .catch(() => setUnderwritingStatus("Underwriting scenarios are available only when the local backend and database are running."));
  const refreshEngagements = () =>
    getInvestmentEngagements()
      .then((response) => setEngagements(response.engagements))
      .catch(() => setStatus("Engagements are available only when the local backend and database are running."));
  const openCaseStudy = (slug: string) => {
    const selected = visibleCaseStudies.find((item) => item.slug === slug);
    setActiveCaseStudySlug(slug);
    setActiveInvestmentPage("engagements");
    writeCaseStudyWorkflowUrl(slug, readCaseStudyWorkflowUrl().step ?? "analyze", "push");
    if (!selected) return;
    void recordInvestmentRecentWork({
      activity_type: "opened_case_study",
      context: { source: "case_studies_library", stage: selected.current_stage },
      label: selected.title,
      page: "engagements",
      parcel_id: selected.active_parcel_id ?? null,
      reference_id: selected.slug,
      reference_type: "case_study",
      strategy: "development_land",
      summary: selected.package?.next_action ? String(selected.package.next_action) : "Continue Case Study",
    })
      .then((response) => setRecentWork(response.items))
      .catch(() => undefined);
  };
  const openCaseStudyStep = (step: CaseStudyWorkflowStep) => {
    const slug = activeCaseStudy?.slug ?? activeCaseStudySlug;
    if (!slug) {
      openInvestmentPage("engagements", "Projects");
      return;
    }
    setActiveCaseStudySlug(slug);
    setActiveInvestmentPage("engagements");
    writeCaseStudyWorkflowUrl(slug, step, "push");
  };
  const compareCaseStudyCandidates = (parcelIds: string[]) => {
    const ids = new Set(parcelIds);
    const liveRows = rows.filter((row) => ids.has(row.signal.parcel_id));
    const liveIds = new Set(liveRows.map((row) => row.signal.parcel_id));
    const packageRows = (activeCaseStudy?.candidates ?? [])
      .filter((candidate) => ids.has(candidate.parcel_id) && !liveIds.has(candidate.parcel_id))
      .map(caseStudyCandidateComparisonRow);
    const nextRows = [...liveRows, ...packageRows].slice(0, 5).map((row, index) => ({ ...row, rank: index + 1 }));
    setComparisonRows(nextRows);
    openInvestmentPage("compare", "Compare case-study candidates");
  };
  function caseStudyCandidateComparisonRow(candidate: InvestmentCaseStudyCandidate): RankedLandReviewCandidate {
    const cautions = candidate.negative_evidence ?? candidate.major_cautions ?? [];
    const missing = candidate.missing_evidence ?? candidate.missing_information ?? [];
    const positives = candidate.positive_evidence ?? [];
    return {
      rank: 0,
      ranking: {
        caution_flags: cautions,
        recommended_next_checks: missing.length ? missing : ["Verify planning, utility, access, title, and field conditions."],
        review_priority_band: caseStudyReviewBand(candidate.screening_score ?? undefined),
        review_reason_summary: candidate.why_it_surfaced ?? positives[0] ?? candidate.decision ?? "Case-study candidate",
        sort_value: candidate.screening_score ?? 0,
        supporting_signals: positives,
      },
      signal: {
        acreage: candidate.gross_acres ?? null,
        assessed_value: null,
        caveats: ["Case-study package comparison row; open Analyze Property for live CFS evidence."],
        constraint_burden_band: cautions[0] ?? null,
        data_confidence: candidate.data_confidence ?? undefined,
        development_readiness_band: candidate.review_band ?? null,
        display_label: candidate.parcel_id,
        due_diligence_flags: cautions,
        economic_data_confidence: candidate.data_confidence ?? "proxy",
        economic_status_band: "data_needed",
        estimated_county_tax: null,
        estimated_county_tax_screening: null,
        evidence: positives,
        floodplain_context: null,
        geography_label: activeCaseStudy?.geography ?? "Cabarrus County, North Carolina",
        growth_pressure_band: null,
        improvement_to_land_ratio: null,
        improvement_value: null,
        improvement_value_per_acre: null,
        land_value: null,
        land_value_per_acre: null,
        opportunity_class: candidate.decision ?? "Case-study candidate",
        parcel_id: candidate.parcel_id,
        permit_activity_context: null,
        recommended_followup: missing[0] ?? "Open Analyze Property for live CFS evidence.",
        related_layers: [],
        school_pressure_context: null,
        sewer_proxy_class: null,
        transportation_context: null,
        utility_readiness_context: null,
        value_per_acre: null,
      },
    };
  }
  const makeCaseStudyCandidateActive = (slug: string, parcelId: string) => {
    void updateInvestmentCaseStudy(slug, { active_parcel_id: parcelId })
      .then((caseStudy) => {
        setCaseStudies((current) => [caseStudy, ...current.filter((item) => item.slug !== caseStudy.slug)]);
        analyzeParcel(parcelId, caseStudy.title);
        setStatus("Active case-study candidate updated.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to update active case-study candidate."));
  };
  const exportCaseStudyBrief = (slug: string) => {
    void exportInvestmentCaseStudyCodexBrief(slug)
      .then((response) => {
        setCaseStudyBriefMarkdown(response.markdown);
        downloadText(response.markdown, `${slugifyReportTitle(slug)}_codex_brief.md`);
        setStatus("Codex brief exported.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to export Codex brief."));
  };
  const saveCaseStudyNote = (slug: string, analystNote: string) => {
    void updateInvestmentCaseStudy(slug, { analyst_note: analystNote })
      .then((caseStudy) => {
        setCaseStudies((current) => [caseStudy, ...current.filter((item) => item.slug !== caseStudy.slug)]);
        setStatus("Analyst note saved and will be preserved during Codex sync.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to save analyst note."));
  };
  const duplicateCaseStudy = (slug: string) => {
    void duplicateInvestmentCaseStudy(slug)
      .then((caseStudy) => {
        setCaseStudies((current) => [caseStudy, ...current]);
        setActiveCaseStudySlug(caseStudy.slug);
        setStatus("Case study duplicated.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to duplicate case study."));
  };
  const archiveCaseStudy = (slug: string) => {
    void archiveInvestmentCaseStudy(slug)
      .then((caseStudy) => {
        setCaseStudies((current) => current.map((item) => item.slug === caseStudy.slug ? caseStudy : item));
        setStatus("Case study archived.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to archive case study."));
  };
  const underwritingPayload = () => {
    const intakeAskingPrice = intakeAnalysis?.acquisition_basis.asking_price;
    const assumptions = intakeAskingPrice && !underwritingAssumptions.asking_price && !underwritingAssumptions.purchase_price && !underwritingAssumptions.acquisition_basis
      ? { ...underwritingAssumptions, asking_price: intakeAskingPrice }
      : underwritingAssumptions;
    return {
      assumptions,
      candidate_id: intakeAnalysis?.candidate.id ?? null,
      parcel_id: activeParcelId,
      scenario_name: underwritingScenarioName,
      scenario_type: underwritingScenarioType,
      strategy: activeStrategy,
    };
  };
  const calculateUnderwriting = () => {
    recordInvestmentEvent("underwriting_started", { scenario_type: underwritingScenarioType });
    void calculateInvestmentUnderwriting(underwritingPayload())
      .then((result) => {
        setUnderwritingResult(result);
        setUnderwritingStatus("Scenario calculated from user-entered assumptions.");
      })
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Underwriting calculation failed."));
  };
  const saveUnderwriting = () => {
    void createInvestmentUnderwritingScenario({
      ...underwritingPayload(),
      private_notes: "Created from CFS Investments Underwriting Lab.",
      scenario_status: "Draft",
    })
      .then((scenario) => {
        setUnderwritingResult(scenario.calculation);
        setUnderwritingStatus("Underwriting scenario saved.");
        return refreshUnderwriting();
      })
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Unable to save underwriting scenario."));
  };
  const openUnderwritingScenario = (scenario: InvestmentUnderwritingScenario) => {
    setUnderwritingScenarioName(scenario.scenario_name);
    setUnderwritingScenarioType(scenario.scenario_type);
    setUnderwritingAssumptions(scenario.assumptions);
    setUnderwritingResult(scenario.calculation);
    setUnderwritingStatus("Saved scenario opened for review.");
  };
  const archiveUnderwritingScenario = (scenarioId: string) => {
    void updateInvestmentUnderwritingScenario(scenarioId, { scenario_status: "Archived" })
      .then(() => refreshUnderwriting())
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Unable to archive scenario."));
  };
  const deleteUnderwritingScenario = (scenarioId: string) => {
    void deleteInvestmentUnderwritingScenario(scenarioId)
      .then(() => {
        setUnderwritingCompareIds((current) => current.filter((id) => id !== scenarioId));
        return refreshUnderwriting();
      })
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Unable to delete scenario."));
  };
  const toggleUnderwritingCompare = (scenarioId: string) => {
    setUnderwritingCompareIds((current) => {
      if (current.includes(scenarioId)) return current.filter((id) => id !== scenarioId);
      return current.length < 4 ? [...current, scenarioId] : current;
    });
  };
  const compareUnderwriting = () => {
    if (underwritingCompareIds.length < 2) {
      setUnderwritingStatus("Select two to four saved scenarios to compare.");
      return;
    }
    void compareInvestmentUnderwritingScenarios(underwritingCompareIds)
      .then(setUnderwritingComparison)
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Unable to compare scenarios."));
  };
  const addUnderwritingToBucket = async () => {
    if (!underwritingResult) return;
    if (await onAddReportBucketItem(underwritingBucketItem(underwritingResult))) {
      setUnderwritingStatus("Underwriting summary saved to Report Bucket.");
    }
  };
  const exportUnderwriting = () => {
    if (!underwritingResult) return;
    downloadJson(underwritingResult, `${slugifyReportTitle(underwritingResult.scenario_name)}_underwriting.json`);
    setUnderwritingStatus("Underwriting JSON exported.");
  };
  const applyUnderwritingPrefill = (opportunityId?: string | null, templateId?: string | null) => {
    void prefillInvestmentUnderwriting({
      candidate_id: intakeAnalysis?.candidate.id ?? null,
      existing_assumptions: underwritingAssumptions,
      opportunity_id: opportunityId ?? null,
      parcel_id: activeParcelId,
      scenario_type: underwritingScenarioType,
      strategy: activeStrategy,
      template_id: templateId ?? null,
    })
      .then((response) => {
        setUnderwritingPrefill(response);
        setUnderwritingAssumptions(response.assumptions);
        setUnderwritingScenarioType(response.scenario_type);
        setUnderwritingStatus("Smart prefill applied. Review assumptions before recalculating.");
      })
      .catch((error) => setUnderwritingStatus(error instanceof Error ? error.message : "Underwriting prefill failed."));
  };
  const addOpportunityToIntake = (opportunity: InvestmentOpportunityReference) => {
    void addInvestmentOpportunityToIntake(opportunity.external_opportunity_id, activeStrategy)
      .then((analysis) => {
        setIntakeAnalysis(analysis);
        setActiveInvestmentPage("intake");
        setStatus("Opportunity reference added to Candidate Intake.");
        return refreshIntake();
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to add opportunity to intake."));
  };
  const matchOpportunity = (opportunity: InvestmentOpportunityReference) => {
    void matchInvestmentOpportunity(opportunity.external_opportunity_id, opportunity.parcel_id)
      .then((result) => setStatus(`Parcel match: ${String(result.parcel_match_status ?? "Manual Verification Required")}`))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Opportunity match failed."));
  };
  const createDefaultEngagement = (items: InvestmentSavedItem[] = []) => {
    void createInvestmentEngagement({
      engagement_name: "New site-selection engagement",
      engagement_type: "Site-selection study",
      minimum_acres: 10,
      property_type: "Industrial / commercial land",
      selected_strategy: activeStrategy,
      target_geography: "Cabarrus County",
    })
      .then((engagement) => {
        setStatus("Engagement created.");
        setEngagements((current) => [engagement, ...current.filter((item) => item.id !== engagement.id)]);
        const engagementItems = items
          .map((item) => ({ item_id: item.item_reference_id, item_type: engagementShortlistType(item.item_type) }))
          .filter((item): item is { item_id: string; item_type: "search_area" | "parcel" | "opportunity" | "intake_candidate" | "underwriting_scenario" } => Boolean(item.item_type));
        if (engagementItems.length) {
          void Promise.allSettled(
            engagementItems.map((item) => addInvestmentEngagementShortlistItem(engagement.id, { ...item, status: "Shortlist" })),
          ).then(() => refreshEngagements());
        }
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to create engagement."));
  };
  const addToFirstEngagement = (itemId: string, itemType: string) => {
    const engagement = engagements[0];
    if (!engagement) {
      setStatus("Create an engagement before adding shortlist items.");
      return;
    }
    void addInvestmentEngagementShortlistItem(engagement.id, { item_id: itemId, item_type: itemType, status: "Shortlist" })
      .then(() => refreshEngagements())
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to update shortlist."));
  };
  const generateFirstEngagementReport = () => {
    const engagement = engagements[0];
    if (!engagement) {
      setStatus("Create an engagement before generating an investment report.");
      return;
    }
    void generateInvestmentEngagementReport(engagement.id)
      .then(async (report) => {
        if (await onAddReportBucketItem(investmentReportBucketItem(report))) {
          setStatus("Engagement report saved to Report Bucket.");
        }
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to generate engagement report."));
  };
  const openInvestmentPage = (page: InvestmentPageId, label?: string) => {
    setActiveInvestmentPage(page);
    writeInvestmentDisplayPreference({ lastPage: page, viewMode: investmentViewMode }, "push");
    if (label) {
      void recordInvestmentRecentWork({
        activity_type: "opened_workspace",
        context: { source: "guided_navigation" },
        label,
        page,
        reference_id: page,
        reference_type: "page",
        strategy: activeStrategy,
        summary: "Continue",
      })
        .then((response) => setRecentWork(response.items))
        .catch(() => setStatus("Recent Work could not be saved because the local backend is unavailable."));
    }
  };
  const analyzeParcel = (parcelId: string, label?: string) => {
    const safeParcelId = parcelId.trim();
    if (!safeParcelId) return;
    setActiveCandidateId(safeParcelId);
    setActiveResearchContext(null);
    setActiveInvestmentPage("research");
    writeInvestmentDisplayPreference({ lastPage: "research", viewMode: investmentViewMode }, "push");
    writeInvestmentParcelPreference(safeParcelId);
    setActiveResearchStatus("Loading");
    const safeLabel = label || safeParcelId;
    void recordInvestmentRecentWork({
      activity_type: "viewed_property",
      context: { source: "universal_search" },
      label: safeLabel,
      page: "research",
      parcel_id: safeParcelId,
      reference_id: safeParcelId,
      reference_type: "parcel",
      strategy: activeStrategy,
      summary: "Property Analysis",
    })
      .then((response) => setRecentWork(response.items))
      .catch(() => undefined);
  };
  const addShortlistItem = (item: Parameters<typeof createInvestmentSavedItem>[0]) => {
    void createInvestmentSavedItem(item)
      .then((savedItem) => {
        setMyShortlist((current) => [savedItem, ...current.filter((existing) => existing.id !== savedItem.id && existing.item_reference_id !== savedItem.item_reference_id)].slice(0, 24));
        recordInvestmentEvent("candidate_shortlisted", { type: item.item_type });
        setStatus(`${savedItem.label} added to My Shortlist.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to save My Shortlist item."));
  };
  const addSignalToShortlist = (signal: EconomicsParcelSignal) => addShortlistItem({
    item_reference_id: signal.parcel_id,
    item_type: "parcel",
    label: signalLabel(signal),
    parcel_id: signal.parcel_id,
    status: "Shortlisted",
    strategy: activeStrategy,
    summary: signal.development_readiness_band ?? signal.opportunity_class ?? "Screening-level review candidate",
  });
  const addActivePropertyToShortlist = () => {
    if (activeSignal) {
      addSignalToShortlist(activeSignal);
      return;
    }
    if (!activePropertySummary) {
      setStatus("Search for a parcel before adding it to My Shortlist.");
      return;
    }
    addShortlistItem({
      item_reference_id: activePropertySummary.parcelId,
      item_type: "parcel",
      label: activePropertySummary.label,
      parcel_id: activePropertySummary.parcelId,
      status: "Shortlisted",
      strategy: activeStrategy,
      summary: activeResearchContext?.safe_summary ?? "Screening-level property analysis.",
    });
  };
  const addActivePropertyToCompare = () => {
    if (!activeSignal) {
      setStatus("Compare requires a CFS candidate signal. Use Opportunity Engine or add another signaled parcel.");
      return;
    }
    onToggleSignal(activeSignal);
    openInvestmentPage("compare", "Compare active property");
  };
  const clearActiveProperty = () => {
    setActiveCandidateId(null);
    setActiveResearchContext(null);
    setActiveResearchStatus("Idle");
    writeInvestmentParcelPreference(null);
    setStatus("Active property cleared.");
  };
  const addOpportunityToShortlist = (opportunity: InvestmentOpportunityReference) => addShortlistItem({
    item_reference_id: opportunity.external_opportunity_id,
    item_type: "opportunity",
    label: opportunity.title,
    opportunity_id: opportunity.external_opportunity_id,
    parcel_id: opportunity.parcel_id ?? null,
    status: "Shortlisted",
    strategy: activeStrategy,
    summary: `${opportunity.source_name}; ${opportunity.parcel_match_status}`,
  });
  const saveConsultingSearch = (name?: string) => {
    const goal =
      activeCaseStudy?.slug === "large-development-land"
        ? "Large Development Land"
        : investmentStrategyLabel(activeStrategy);
    const searchName = (name || `${goal} saved search`).trim();
    void createInvestmentSavedSearch({
      essential_criteria: { strategy: activeStrategy },
      goal,
      guided_or_advanced: investmentViewMode,
      location_type: "All Cabarrus County",
      result_summary: { active_page: activeInvestmentPage, result_count: visibleRows.length },
      search_name: searchName,
    })
      .then((search) => {
        setSavedSearches((current) => [search, ...current.filter((item) => item.id !== search.id)].slice(0, 12));
        setStatus("Saved search saved.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to save search."));
  };
  const askFilterContext = {
    active_page: activeInvestmentPage,
    active_parcel_id: activeParcelId,
    active_research_context_status: activeResearchStatus,
    active_research_summary: activeResearchContext?.safe_summary,
    active_missing_evidence: activeResearchContext?.missing_evidence?.join("; "),
    active_strategy: investmentStrategyLabel(activeStrategy),
    engine_candidates: activeInvestmentScreen?.candidate_count,
    candidate_rows: rows.length,
    active_intake_candidate: intakeAnalysis?.candidate.candidate_name,
    active_market_context: intakeAnalysis?.market_area_context?.household_context?.band,
    active_market_geography: intakeAnalysis?.market_area_context?.geoid,
    active_market_geography_type: intakeAnalysis?.market_area_context?.geography_type,
    active_market_year: intakeAnalysis?.market_area_context?.acs_year,
    active_environmental_constraint: intakeAnalysis?.environmental_context?.overall_environmental_constraint_band,
    active_environmental_confidence: intakeAnalysis?.environmental_context?.environmental_data_confidence,
    active_facility_context: intakeAnalysis?.environmental_context?.environmental_facility_context,
    active_soil_context: intakeAnalysis?.environmental_context?.soil_context,
    active_terrain_context: intakeAnalysis?.environmental_context?.terrain_context,
    active_usable_area_proxy: intakeAnalysis?.environmental_context?.usable_area_screening_proxy,
    active_wetland_context: intakeAnalysis?.environmental_context?.mapped_wetland_context,
    mode: "cfs_investment",
    active_engagement: engagements[0]?.engagement_name,
    active_opportunity_count: opportunities.length,
    active_priority_search_area: radarAreas[0]?.area_name,
    persisted_shortlist_count: myShortlist.length,
    persisted_shortlist_preview: myShortlist.slice(0, 5).map((item) => `${item.label} (${titleText(item.item_type)})`).join("; "),
    recent_work_preview: recentWork.slice(0, 5).map((item) => `${item.label} (${titleText(item.page)})`).join("; "),
    saved_search_preview: savedSearches.slice(0, 5).map((item) => item.search_name).join("; "),
    active_underwriting_summary: underwritingResult
      ? `${underwritingResult.scenario_type_label}; missing inputs: ${underwritingResult.missing_inputs.join(", ") || "none"}; total project/basis: ${underwritingResult.results.total_project_cost ?? underwritingResult.results.total_basis_at_exit ?? underwritingResult.results.total_basis_after_entitlement ?? "not available"}`
      : undefined,
    active_case_study: activeCaseStudy?.title,
    active_case_study_slug: activeCaseStudy?.slug,
    active_case_study_stage: activeCaseStudy?.current_stage,
    active_case_study_status: activeCaseStudy?.status,
    active_case_study_priority_candidate: activeCaseStudy?.priority_candidate_id,
    active_case_study_candidate_count: activeCaseStudy?.candidate_count,
    active_case_study_underwriting_status: activeCaseStudy?.underwriting_status,
    active_case_study_next_action: activeCaseStudy?.package?.next_action ? String(activeCaseStudy.package.next_action) : undefined,
    strategy_screening_source: activeInvestmentScreen ? "CFS Investments Research Engine" : "local product fallback",
    sewer_proxy_supported_candidates: sewerSupported,
    tier_1_candidates: tier1,
    tier_2_candidates: tier2,
  };
  const strategySelector = (
    <section className="investment-card">
      <div className="investment-section-heading">
        <div>
          <p>Strategy Presets</p>
          <h2>Choose a private research lens.</h2>
        </div>
      </div>
      <div className="investment-strategy-grid">
        {investmentStrategies.map(({ description, icon: Icon, id, label }) => (
          <button
            aria-pressed={activeStrategy === id}
            className="investment-strategy-card"
            key={id}
            onClick={() => setActiveStrategy(id)}
            type="button"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
            <small>{description}</small>
          </button>
        ))}
      </div>
    </section>
  );
  const candidateTable = (
    <section className="investment-card">
      <div className="investment-section-heading">
        <div>
          <p>Ranked Candidate Table</p>
          <h2>{investmentStrategyLabel(activeStrategy)} pipeline</h2>
        </div>
        <span className="investment-pill">{formatNumber(visibleRows.length)} visible</span>
      </div>
      <InvestmentCandidateTable
        activeCandidateId={activeSignal?.parcel_id ?? null}
        onAddCandidate={(signal) => {
          addSignalToShortlist(signal);
        }}
        onOpenCandidate={(signal) => analyzeParcel(signal.parcel_id, signalLabel(signal))}
        onToggleSignal={onToggleSignal}
        rows={visibleRows}
        selectedSignalIds={selectedSignalIds}
        strategy={activeStrategy}
      />
    </section>
  );
  const compareActions = (
    <section className="investment-card investment-action-card">
      <div>
        <p>Compare Selected</p>
        <span>{selectedRows.length} selected / 5 maximum</span>
      </div>
      <button className="investment-primary-button" disabled={selectedRows.length < 2 || selectedRows.length > 5} onClick={() => {
        setComparisonRows(selectedRows.map((row, index) => ({ ...row, rank: index + 1 })));
        setActiveInvestmentPage("compare");
      }} type="button">
        Compare Selected
      </button>
      <button className="investment-ghost-button" disabled={!selectedRows.length} onClick={onClearSelection} type="button">
        Clear Selection
      </button>
    </section>
  );
  const dueDiligenceActions = (
    <section className="investment-card investment-action-card">
      <div>
        <p>Generate Review Guide</p>
        <span>Live on-screen summary for manual due diligence.</span>
      </div>
      <button className="investment-primary-button" disabled={!activeSignal && !selectedRows.length} onClick={createGuide} type="button">
        Generate Review Guide
      </button>
      <button className="investment-ghost-button" disabled={!guide || reportBucketMutationsDisabled} onClick={addGuideToBucket} type="button">
        Save guide to Report Bucket
      </button>
      <button className="investment-ghost-button" disabled={!guide || reportBucketMutationsDisabled} onClick={sendGuideToPrint} type="button">
        Send to Print
      </button>
      {status ? <span className="investment-status">{status}</span> : null}
    </section>
  );
  const reportStudio = (
    <section className="investment-card investment-action-card">
      <div>
        <p>Investment Report Studio</p>
        <span>Configure, preview, then save or print a structured CFS Investments report.</span>
      </div>
      <div className="investment-step-strip" aria-label="Report Studio steps">
        <span>1. Configure</span><span>2. Preview</span><span>3. Save / Print</span>
      </div>
      <select className="investment-select" value={investmentReportType} onChange={(event) => setInvestmentReportType(event.target.value)}>
        {investmentReportTypeOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      <button className="investment-primary-button" disabled={!activeParcelId && !intakeAnalysis} onClick={generateReport} type="button">
        Generate Report
      </button>
      <button className="investment-ghost-button" disabled={!investmentReport || reportBucketMutationsDisabled} onClick={addReportToBucket} type="button">
        Add report to Report Bucket
      </button>
      {investmentReport ? (
        <div className="investment-report-preview">
          <strong>{investmentReport.report_title}</strong>
          <span>{investmentReport.sections.length} sections ready for Report Bucket or Print.</span>
          <ul>{investmentReport.sections.slice(0, 4).map((section) => <li key={section.id}>{section.title}</li>)}</ul>
        </div>
      ) : <p className="investment-empty">No report generated yet.</p>}
    </section>
  );
  const intakeWorkspace = (
    <InvestmentIntakeWorkspace
      analysis={intakeAnalysis}
      candidates={intakeCandidates}
      compareIds={intakeCompareIds}
      comparison={intakeComparison}
      csvText={intakeCsv}
      editingId={editingIntakeId}
      form={intakeForm}
      intakeLoading={intakeLoading}
      intakeUnavailable={intakeUnavailable}
      reportBucketMutationsDisabled={reportBucketMutationsDisabled}
      onAddAnalysisToBucket={async () => {
        if (!intakeAnalysis) return;
        if (await onAddReportBucketItem(intakeAnalysisBucketItem(intakeAnalysis))) {
          setStatus("Intake analysis saved to Report Bucket");
        }
      }}
      onArchive={(candidate) => {
        void updateInvestmentIntakeCandidate(candidate.id, { review_status: "Archived" })
          .then((analysis) => {
            setIntakeAnalysis(analysis);
            setStatus("Candidate archived");
            return refreshIntake();
          })
          .catch((error) => setStatus(error instanceof Error ? error.message : "Archive failed."));
      }}
      onClearEdit={() => {
        setEditingIntakeId(null);
        setIntakeForm(defaultInvestmentIntakeForm(activeStrategy));
      }}
      onCompare={compareIntakeSelected}
      onCreate={createIntakeFromForm}
      onCreateFromActive={() => activeSignal && createIntakeFromSignal(activeSignal)}
      onDelete={removeIntakeCandidate}
      onEdit={editIntakeCandidate}
      onImportCsv={importCsv}
      onOpen={(candidateId) => {
        openIntakeAnalysis(candidateId);
      }}
      onSetCsvText={setIntakeCsv}
      onSetForm={setIntakeForm}
      onToggleCompare={toggleIntakeCompare}
    />
  );
  const activePageContent = (() => {
    switch (activeInvestmentPage) {
      case "overview":
        return (
          <>
            {activeCaseStudy ? (
              <section className="investment-card investment-current-case-study">
                <div className="investment-section-heading">
                  <div>
                    <p>Continue Work</p>
                    <h2>{activeCaseStudy.title}</h2>
                  </div>
                </div>
                <Matrix rows={[
                  { label: "Workflow stage", value: activeCaseStudy.current_stage },
                  { label: "Active property", value: activeCaseStudy.active_parcel_id ?? activeCaseStudy.priority_candidate_id ?? "Not set" },
                  { label: "Candidate count", value: formatNumber(activeCaseStudy.candidate_count) },
                  { label: "Next action", value: String(activeCaseStudyPackage?.next_action ?? "Continue Case Study") },
                  { label: "Last updated", value: formatDate(activeCaseStudy.updated_at) },
                ]} />
                <div className="investment-row-actions mt-4">
                  <button className="investment-primary-button" onClick={() => openCaseStudy(activeCaseStudy.slug)} type="button">Continue Project</button>
                  <details className="investment-active-overflow">
                    <summary>More</summary>
                    <button onClick={() => activeCaseStudy.active_parcel_id ? analyzeParcel(activeCaseStudy.active_parcel_id, activeCaseStudy.title) : undefined} type="button">Review Property</button>
                    <button onClick={() => compareCaseStudyCandidates(activeCaseStudyCandidateIds)} type="button">Compare Candidates</button>
                    <button onClick={() => openCaseStudyStep("underwrite")} type="button">Review Assumptions</button>
                  </details>
                </div>
              </section>
            ) : null}
            <section className="investment-card">
              <div className="investment-section-heading"><div><p>Start New Work</p><h2>Choose the next investment task</h2></div></div>
              <div className="investment-action-grid">
                <button className="investment-primary-button" onClick={() => openInvestmentPage("engagements", "Projects")} type="button">Start a Project</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("area-radar", "Find Sites")} type="button">Find Sites</button>
                <button className="investment-ghost-button" onClick={() => activeParcelId ? analyzeParcel(activeParcelId, activePropertySummary?.label) : openInvestmentPage("research", "Property Review")} type="button">Review a Property</button>
              </div>
            </section>
            <section className="investment-two-column">
              <InvestmentRecentWorkPanel items={recentWork.slice(0, 5)} onOpen={(item) => item.reference_type === "case_study" && item.reference_id ? openCaseStudy(item.reference_id) : openInvestmentPage(item.page as InvestmentPageId, item.label)} />
              <section className="investment-card">
                <div className="investment-section-heading"><div><p>System Status</p><h2>Local data service connected</h2></div></div>
                <Matrix rows={[
                  { label: "Data mode", value: statusLabel ?? (USE_DEMO_DATA ? "Portfolio demonstration mode" : "Local development session") },
                  { label: "Data vintage", value: "Current session" },
                  { label: "Source coverage", value: signals.length ? `${formatNumber(signals.length)} parcel signals` : "Loading" },
                ]} />
              </section>
            </section>
          </>
        );
      case "opportunity-feed":
        return (
          <InvestmentOpportunityFeedPage
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
            onAddToBucket={(opportunity) => onAddReportBucketItem(opportunityBucketItem(opportunity))}
            onAddToEngagement={(opportunity) => addToFirstEngagement(opportunity.external_opportunity_id, "opportunity")}
            onAddToIntake={addOpportunityToIntake}
            onAddToShortlist={addOpportunityToShortlist}
            onMatch={matchOpportunity}
            onStartUnderwriting={(opportunity) => {
              if (opportunity.parcel_id) analyzeParcel(opportunity.parcel_id, opportunity.title);
              applyUnderwritingPrefill(opportunity.external_opportunity_id);
              openInvestmentPage("underwriting", opportunity.title);
            }}
            opportunities={opportunities}
            sources={opportunitySources}
          />
        );
      case "area-radar":
        return (
          <InvestmentAreaRadarPage
            areas={radarAreas}
            candidates={activeCaseStudy?.candidates ?? []}
            defaultGoal={activeCaseStudy?.slug === "large-development-land" ? "Large Development Land" : investmentStrategyLabel(activeStrategy)}
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
            onAddToBucket={(area) => onAddReportBucketItem(areaRadarBucketItem(area))}
            onAddToEngagement={(area) => addToFirstEngagement(area.area_id, "search_area")}
            onAddToShortlist={(area) => addShortlistItem({
              area_id: area.area_id,
              item_reference_id: area.area_id,
              item_type: "area",
              label: area.area_name,
              status: "Shortlisted",
              summary: area.area_classification,
            })}
            onAddExternalOpportunity={() => openInvestmentPage("intake", "Add External Opportunity")}
            onOpenCandidate={(candidate) => analyzeParcel(candidate.parcel_id, candidate.label ?? candidate.parcel_id)}
            onOpenOpportunityFeed={() => openInvestmentPage("opportunity-feed", "Opportunity Feed")}
            onRunScreening={() => searchInvestmentRadar(activeStrategy).then((response) => {
              setRadarAreas(response.areas);
              setStatus(`Run Screening completed: ${response.count} cached search area(s), ${activeCaseStudy?.candidate_count ?? 0} canonical candidate(s).`);
            })}
            onSaveSearch={() => saveConsultingSearch("Find Sites: Large Development Land")}
            savedSearches={savedSearches}
            status={status}
          />
        );
      case "opportunity":
        return (
          <section className="investment-work-grid">
            <div className="investment-primary-column">{strategySelector}{candidateTable}</div>
            <aside className="investment-rail"><InvestmentCandidateRail onAskCfs={askAboutSignal} onGenerateGuide={createGuide} signal={activeSignal} investmentCandidate={activeInvestmentCandidate} strategy={activeStrategy} />{compareActions}</aside>
          </section>
        );
      case "intake":
        return intakeWorkspace;
      case "research":
        return (
          <section className="investment-work-grid">
            <div className="investment-primary-column">
              <InvestmentResearchTabs activeSignal={activeSignal} analysis={intakeAnalysis} context={activeResearchContext} status={activeResearchStatus} strategy={activeStrategy} />
            </div>
            <aside className="investment-rail">
              <InvestmentCandidateRail onAskCfs={askAboutSignal} onGenerateGuide={createGuide} signal={activeSignal} investmentCandidate={activeInvestmentCandidate} strategy={activeStrategy} />
              <InvestmentResearchCompletenessPanel
                activeSignal={activeSignal}
                context={activeResearchContext}
                intakeAnalysis={intakeAnalysis}
                reportReady={Boolean(investmentReport)}
                underwritingReady={Boolean(underwritingResult)}
              />
              <section className="investment-card investment-action-card">
                <div><p>Underwriting Lab</p><span>Open deterministic financial scenarios for this candidate.</span></div>
                <button className="investment-primary-button" onClick={() => openInvestmentPage("underwriting", activePropertySummary?.label ?? "Underwriting Lab")} type="button">Open Underwriting Lab</button>
              </section>
              {dueDiligenceActions}
            </aside>
          </section>
        );
      case "compare":
        return (
          <section className="investment-card">
            <div className="investment-section-heading"><div><p>Compare</p><h2>Side-by-side tradeoffs</h2></div></div>
            {compareActions}
            {comparisonRows.length >= 2 ? <InvestmentComparisonTable rows={comparisonRows} /> : <p className="investment-empty">Select two to five Opportunity Engine candidates to compare.</p>}
            {intakeComparison ? <InvestmentIntakeComparison comparison={intakeComparison} /> : null}
          </section>
        );
      case "market":
        return (
          <section className="investment-two-column">
            <div className="investment-card"><MarketAreaContextPanel context={intakeAnalysis?.market_area_context} /></div>
            <div className="investment-card">
              <div className="investment-section-heading"><div><p>CFS Economics Context</p><h2>Land and real-estate signals</h2></div></div>
              <Matrix rows={[
                { label: "Active parcel", value: activeSignal ? signalLabel(activeSignal) : "Select a candidate" },
                { label: "Economic segment", value: activeSignal?.economic_segment ?? "Not available" },
                { label: "Opportunity class", value: activeSignal?.opportunity_class ?? activeSignal?.land_opportunity_class ?? "Not available" },
                { label: "Data confidence", value: activeSignal?.data_confidence ?? "Data Needed" },
              ]} />
            </div>
          </section>
        );
      case "underwriting":
        return (
          <InvestmentUnderwritingLab
            activeSignal={activeSignal}
            assumptions={underwritingAssumptions}
            compareIds={underwritingCompareIds}
            comparison={underwritingComparison}
            intakeAnalysis={intakeAnalysis}
            onAddToBucket={addUnderwritingToBucket}
            onArchiveScenario={archiveUnderwritingScenario}
            onApplyPrefill={applyUnderwritingPrefill}
            onCalculate={calculateUnderwriting}
            onCompare={compareUnderwriting}
            onDeleteScenario={deleteUnderwritingScenario}
            onExport={exportUnderwriting}
            onOpenScenario={openUnderwritingScenario}
            onSave={saveUnderwriting}
            onSetAssumptions={setUnderwritingAssumptions}
            onSetScenarioName={setUnderwritingScenarioName}
            onSetScenarioType={(type) => {
              setUnderwritingScenarioType(type);
              setUnderwritingAssumptions(defaultUnderwritingAssumptions(type));
              setUnderwritingResult(null);
            }}
            onToggleCompare={toggleUnderwritingCompare}
            result={underwritingResult}
            scenarioName={underwritingScenarioName}
            scenarios={underwritingScenarios}
            scenarioType={underwritingScenarioType}
            status={underwritingStatus}
            strategy={activeStrategy}
            templates={underwritingTemplates}
            prefill={underwritingPrefill}
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
          />
        );
      case "due-diligence":
        return <section className="investment-two-column"><div>{dueDiligenceActions}{guide ? <InvestmentGuidePreview guide={guide} /> : null}</div><InvestmentChecklistLibrary /></section>;
      case "report-studio":
        return <section className="investment-two-column"><div>{reportStudio}</div><InvestmentBucketPanel items={reportBucketItems} onClear={onClearReportBucket} onOpenPrint={() => onNavigate("print")} onRemove={onRemoveReportBucketItem} onTogglePrint={onToggleReportBucketPrint} reportBucketMutationsDisabled={reportBucketMutationsDisabled} /></section>;
      case "engagements":
        return (
            <InvestmentEngagementsPage
              activeCaseStudy={activeCaseStudy}
              caseStudies={visibleCaseStudies}
            caseStudyBriefMarkdown={caseStudyBriefMarkdown}
            engagements={engagements}
            initialCaseStudyUrlState={initialCaseStudyUrlState}
            onAddArea={(areaId) => addToFirstEngagement(areaId, "search_area")}
            onAnalyzeCaseStudyParcel={analyzeParcel}
            onArchiveCaseStudy={archiveCaseStudy}
            onCreate={createDefaultEngagement}
            onDuplicateCaseStudy={duplicateCaseStudy}
            onExportCaseStudyBrief={exportCaseStudyBrief}
            onGenerateReport={generateFirstEngagementReport}
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
            onMakeCaseStudyCandidateActive={makeCaseStudyCandidateActive}
            onOpenCaseStudy={openCaseStudy}
            onOpenFindSites={() => openInvestmentPage("area-radar", "Find Sites")}
            onOpenIntake={() => openInvestmentPage("intake", "Add External Opportunity")}
            onSaveCaseStudyNote={saveCaseStudyNote}
          />
        );
      case "report-bucket":
        return <InvestmentBucketPanel items={reportBucketItems} onClear={onClearReportBucket} onOpenPrint={() => onNavigate("print")} onRemove={onRemoveReportBucketItem} onTogglePrint={onToggleReportBucketPrint} reportBucketMutationsDisabled={reportBucketMutationsDisabled} />;
      case "methodology":
        return (
          <section className="investment-two-column">
            <InvestmentMethodologyPage />
            <section className="investment-card">
              <div className="investment-section-heading"><div><p>More</p><h2>Advanced tools</h2></div></div>
              <div className="investment-action-grid">
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("opportunity", "Countywide Opportunity Engine")} type="button">Countywide Opportunity Engine</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("intake", "Candidate Intake")} type="button">Candidate Intake</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("market", "Market Research")} type="button">Market Research</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("underwriting", "Underwriting Lab")} type="button">Underwriting Lab</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("due-diligence", "Due Diligence")} type="button">Due Diligence</button>
                <button className="investment-ghost-button" onClick={() => openInvestmentPage("report-bucket", "Report Bucket")} type="button">Report Bucket</button>
              </div>
            </section>
          </section>
        );
      default:
        return null;
    }
  })();
  return (
    <InvestmentShell
      activePage={activeInvestmentPage}
      activeProperty={activePropertySummary}
      activeProject={activeCaseStudy ? {
        candidateCount: activeCaseStudy.candidate_count,
        propertyRole: activeCaseStudy.active_parcel_id === activePropertySummary?.parcelId ? "Priority Candidate" : null,
        stage: activeCaseStudy.case_study?.workflow_step ?? activeCaseStudy.current_stage,
        title: activeCaseStudy.title,
      } : null}
      dataMode={statusLabel ?? (USE_DEMO_DATA ? "Portfolio demonstration mode" : "Local development session")}
      onActiveAnalyze={() => activeParcelId ? analyzeParcel(activeParcelId, activePropertySummary?.label) : setStatus("Search for a parcel before opening Property Analysis.")}
      onActiveClear={clearActiveProperty}
      onActiveCompare={addActivePropertyToCompare}
      onActiveReport={() => openInvestmentPage("report-studio", activePropertySummary?.label ?? "Create Report")}
      onActiveShortlist={addActivePropertyToShortlist}
      onActiveUnderwrite={() => {
        if (activeParcelId) void applyUnderwritingPrefill();
        if (activeCaseStudy) {
          openCaseStudyStep("underwrite");
        } else {
          openInvestmentPage("underwriting", activePropertySummary?.label ?? "Underwriting");
        }
      }}
      onAskCfs={() => setAssistantOpen(true)}
      onPageChange={(page) => openInvestmentPage(page, investmentPages.find((item) => item.id === page)?.label ?? titleText(page))}
    >
      {activePageContent}
      {assistantOpen ? (
        <div className="investment-assistant-drawer" role="dialog" aria-label="Ask CFS Investments">
          <div className="investment-assistant-panel">
            <div className="investment-section-heading">
              <div><p>Ask CFS Investments</p><h2>Context-aware assistant</h2></div>
              <button className="investment-ghost-button" onClick={() => setAssistantOpen(false)} type="button">Close</button>
            </div>
            <AskCfsPanel
              appMode="consulting"
              externalRequest={askRequest}
              filterContext={askFilterContext}
              suggestedPromptsOverride={askCfsInvestmentResearchPrompts}
              visiblePromptCount={5}
            />
          </div>
        </div>
      ) : null}
    </InvestmentShell>
  );
}

const investmentStrategies: Array<{
  description: string;
  icon: typeof Gauge;
  id: InvestmentStrategyId;
  label: string;
}> = [
  {
    description: "Near-to-mid-term development-readiness signals.",
    icon: Building2,
    id: "development_land",
    label: "Development Land",
  },
  {
    description: "Land assembly, growth context, and future optionality.",
    icon: Network,
    id: "land_banking",
    label: "Long-Term Land Banking",
  },
  {
    description: "Planning alignment and repositioning pathway.",
    icon: BriefcaseBusiness,
    id: "entitlement_repositioning",
    label: "Entitlement / Repositioning",
  },
  {
    description: "Current use, operational context, and optionality.",
    icon: PanelLeft,
    id: "existing_use",
    label: "Existing-Use Land",
  },
];

const investmentReportTypeOptions = [
  { id: "land_investment_review", label: "Land Investment Review" },
  { id: "development_site_review", label: "Development Site Review" },
  { id: "long_term_land_banking_memorandum", label: "Long-Term Land Banking Memorandum" },
  { id: "entitlement_repositioning_review", label: "Entitlement and Repositioning Review" },
  { id: "existing_use_property_review", label: "Existing-Use Property Review" },
  { id: "market_area_report", label: "Market Area Report" },
  { id: "candidate_comparison_report", label: "Candidate Comparison Report" },
  { id: "due_diligence_brief", label: "Due-Diligence Brief" },
  { id: "planning_utility_question_guide", label: "Planning and Utility Question Guide" },
  { id: "acquisition_underwriting_summary", label: "Acquisition Underwriting Summary" },
  { id: "development_feasibility_review", label: "Development Feasibility Review" },
  { id: "land_banking_scenario_memorandum", label: "Land Banking Scenario Memorandum" },
  { id: "entitlement_scenario_analysis", label: "Entitlement Scenario Analysis" },
  { id: "existing_use_underwriting_summary", label: "Existing-Use Underwriting Summary" },
  { id: "scenario_comparison", label: "Scenario Comparison" },
  { id: "sources_and_uses", label: "Sources and Uses" },
  { id: "sensitivity_analysis", label: "Sensitivity Analysis" },
  { id: "site_selection_screening_report", label: "Site Selection Screening Report" },
  { id: "acquisition_opportunity_review", label: "Acquisition Opportunity Review" },
  { id: "market_entry_location_report", label: "Market Entry Location Report" },
  { id: "portfolio_screening_report", label: "Portfolio Screening Report" },
  { id: "area_opportunity_report", label: "Area Opportunity Report" },
  { id: "shortlist_comparison", label: "Shortlist Comparison" },
  { id: "site_due_diligence_matrix", label: "Site Due-Diligence Matrix" },
  { id: "financial_feasibility_summary", label: "Financial Feasibility Summary" },
  { id: "environmental_technical_screening", label: "Environmental and Technical Screening" },
  { id: "executive_recommendation_brief", label: "Executive Recommendation Brief" },
] as const;

function investmentStrategyLabel(strategy: InvestmentStrategyId) {
  return investmentStrategies.find((item) => item.id === strategy)?.label ?? "Development Land";
}

function stringList(value: string | string[] | null | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function matchesInvestmentStrategy(signal: EconomicsParcelSignal, strategy: InvestmentStrategyId) {
  if (strategy === "development_land") return matchesLandReviewPreset(signal, "Growth pressure + sewer proximity") || valueText(signal.development_readiness_band).toLowerCase().includes("strong");
  if (strategy === "land_banking") return hasGrowthPressure(signal) || matchesLandReviewPreset(signal, "More data needed but interesting");
  if (strategy === "entitlement_repositioning") return matchesLandReviewPreset(signal, "Underbuilt + utility proxy") || valueText(signal.zoning_support_band).toLowerCase().includes("support");
  return isSpecialReviewCandidate(signal) || valueText(signal.opportunity_class).toLowerCase().includes("stable") || valueText(signal.economic_segment).toLowerCase().includes("commercial");
}

function InvestmentResearchTabs({
  activeSignal,
  analysis,
  context,
  status,
  strategy,
}: {
  activeSignal: EconomicsParcelSignal | null;
  analysis: InvestmentIntakeAnalysisResponse | null;
  context: InvestmentResearchContext | null;
  status: "Error" | "Idle" | "Loading" | "Ready";
  strategy: InvestmentStrategyId;
}) {
  const [tab, setTab] = useState<"summary" | "property" | "market" | "constraints" | "financial" | "diligence" | "sources">("summary");
  const identity = context?.identity;
  const signalRows = activeSignal || context
    ? [
        { label: "Parcel ID", value: identity?.parcel_id ?? activeSignal?.parcel_id ?? "Not available" },
        { label: "Parcel / area label", value: identity?.private_candidate_label ?? (activeSignal ? signalLabel(activeSignal) : "Private candidate") },
        { label: "Selected strategy", value: investmentStrategyLabel(strategy) },
        { label: "Research-context status", value: status },
        { label: "Development-readiness band", value: String(context?.development_readiness.strategy_fit ?? activeSignal?.development_readiness_band ?? "Data Needed") },
        { label: "Land opportunity", value: activeSignal?.land_opportunity_class ?? activeSignal?.opportunity_class ?? "Data Needed" },
        { label: "Data confidence", value: String(context?.evidence_quality.overall_data_confidence_band ?? activeSignal?.data_confidence ?? "Data Needed") },
      ]
    : [{ label: "Candidate", value: "Select a parcel or intake candidate to begin property research." }];
  const tabs = [
    ["summary", "Summary"],
    ["property", "Property"],
    ["market", "Market"],
    ["constraints", "Constraints"],
    ["financial", "Financial"],
    ["diligence", "Due Diligence"],
    ["sources", "Sources"],
  ] as const;
  return (
    <section className="investment-card">
      <div className="investment-section-heading">
        <div>
          <p>Property Research</p>
          <h2>{activeSignal ? signalLabel(activeSignal) : analysis?.candidate.candidate_name ?? "No candidate selected"}</h2>
        </div>
        <span className="investment-pill">{investmentStrategyLabel(strategy)}</span>
      </div>
      <div className="investment-tabs" role="tablist" aria-label="Property Research tabs">
        {tabs.map(([id, label]) => (
          <button aria-selected={tab === id} key={id} onClick={() => setTab(id)} role="tab" type="button">
            {label}
          </button>
        ))}
      </div>
      {tab === "summary" ? (
        <>
          <Matrix rows={signalRows} />
          <InvestmentSignalList title="Why this candidate surfaced" values={[
            context?.safe_summary,
            activeSignal?.development_readiness_band,
            activeSignal?.economic_opportunity_band,
            activeSignal?.sewer_proxy_class,
          ].filter(Boolean).map(String)} />
          <InvestmentSignalList title="Strongest evidence" values={[
            context?.development_readiness.strategy_fit ? String(context.development_readiness.strategy_fit) : "",
            context?.utility_context.utility_readiness_proxy_class || activeSignal?.utility_readiness_proxy_class ? String(context?.utility_context.utility_readiness_proxy_class ?? activeSignal?.utility_readiness_proxy_class) : "",
            context?.market_area_context ? "Market-area context available" : "",
            context?.environmental_context ? "Environmental context available" : "",
          ].filter(Boolean)} />
          <InvestmentSignalList title="Main cautions" values={(context?.limitations ?? analysis?.caveats ?? [activeSignal?.segment_caveat ?? "Verify all source evidence before relying on this review."]).filter(Boolean).map(String).slice(0, 5)} />
          <InvestmentSignalList title="Missing evidence" values={(context?.missing_evidence ?? ["Review asking basis, utility capacity, entitlement path, and parcel-specific due diligence."]).slice(0, 6)} />
          <InvestmentSignalList title="Recommended verification sequence" values={(stringList(activeSignal?.due_diligence_flags).length ? stringList(activeSignal?.due_diligence_flags) : landDueDiligenceChecklist).slice(0, 6)} />
        </>
      ) : null}
      {tab === "property" ? <Matrix rows={[
        { label: "Acreage", value: displayValue(identity?.approximate_acreage ?? activeSignal?.acreage) },
        { label: "Land-use context", value: String(context?.parcel_fundamentals.existing_land_use_context ?? activeSignal?.economic_segment ?? "Not available") },
        { label: "Zoning", value: String(context?.planning_context.current_zoning ?? activeSignal?.zoning_support_band ?? "Verify") },
        { label: "Future-use context", value: String(context?.planning_context.future_use_context ?? "Verify with planning staff") },
        { label: "Planning jurisdiction", value: identity?.geography_label ?? activeSignal?.geography_label ?? "Not available" },
        { label: "Permit and development activity", value: activeSignal?.permit_activity_context ?? activeSignal?.growth_pressure_band ?? "Data Needed" },
        { label: "Transportation context", value: String(context?.development_readiness.transportation_access ?? activeSignal?.transportation_access_band ?? "Verify") },
        { label: "Sewer-proximity proxy", value: String(context?.utility_context.sewer_proxy_class ?? activeSignal?.sewer_proxy_class ?? "Data Needed") },
        { label: "Utility-readiness proxy", value: String(context?.utility_context.utility_readiness_proxy_class ?? activeSignal?.utility_readiness_proxy_class ?? "Data Needed") },
      ]} /> : null}
      {tab === "financial" ? <Matrix rows={[
        { label: "User-entered asking basis", value: analysis?.acquisition_basis.asking_basis_band ?? "Missing asking price" },
        { label: "Asking price per acre", value: moneyText(analysis?.acquisition_basis.asking_price_per_acre) },
        { label: "Historical transfer context", value: String(context?.acquisition_basis.sale_quality_band ?? analysis?.screening_context?.sale_quality_band ?? "Not Available") },
        { label: "Comparable context", value: String(context?.comparable_context.basis_context_band ?? analysis?.screening_context?.basis_context_band ?? "Insufficient Basis Information") },
        { label: "Assessor context", value: "Assessed values are context only, not market value or an appraisal." },
        { label: "Saved underwriting scenarios", value: "Open Underwriting Lab to review saved scenarios for this parcel." },
        { label: "Start Underwriting", value: "Use active-property header or Underwriting Lab action." },
      ]} /> : null}
      {tab === "market" ? <MarketAreaContextPanel context={analysis?.market_area_context ?? (context?.market_area_context as InvestmentIntakeAnalysisResponse["market_area_context"] | undefined)} /> : null}
      {tab === "constraints" ? <EnvironmentalPhysicalContextPanel context={analysis?.environmental_context ?? (context?.environmental_context as InvestmentIntakeAnalysisResponse["environmental_context"] | undefined)} /> : null}
      {tab === "diligence" ? <InvestmentSignalList title="Verification checklist" values={(context?.verification_requirements ?? landDueDiligenceChecklist.concat(environmentalDueDiligenceChecklist)).slice(0, 10)} /> : null}
      {tab === "sources" ? (
        <>
          <Matrix rows={(context?.source_registry ?? []).slice(0, 12).map((source) => ({
            label: source.name ?? source.source ?? "Source",
            value: [source.category, source.authority_level, source.vintage ?? source.source_date, source.limitation].filter(Boolean).join(" · ") || "Source details available",
          }))} />
          <InvestmentMethodologyPage compact />
        </>
      ) : null}
    </section>
  );
}

function InvestmentChecklistLibrary() {
  const groups: Array<{ group: string; items: string[] }> = [
    { group: "Title and Legal", items: ["Check title/easements", "Confirm legal access", "Review deed restrictions"] },
    { group: "Planning and Entitlement", items: ["Verify zoning", "Confirm future land-use context", "Review planning cases"] },
    { group: "Utilities", items: ["Verify service and capacity with utility provider", "Review sewer-proximity proxy", "Confirm extension requirements"] },
    { group: "Access and Transportation", items: ["Check road frontage/legal access", "Review transportation projects", "Confirm driveway/access permits"] },
    { group: "Environmental", items: environmentalDueDiligenceChecklist.slice(0, 4) },
    { group: "Survey and Engineering", items: ["Obtain survey", "Review topography", "Evaluate stormwater implications"] },
    { group: "Market and Financial", items: ["Check recent sale comps", "Verify asking basis", "Review assessor context as context only"] },
  ];
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Due Diligence</p><h2>Verification task library</h2></div></div>
      <div className="investment-checklist-grid">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <strong>{group}</strong>
            <ul>{items.map((item) => <li key={item}><span>Not Started</span>{item}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function InvestmentMethodologyPage({ compact = false }: { compact?: boolean }) {
  const rows = [
    { label: "ACS coverage", value: "2024 ACS 5-year tract context where parcel-to-tract assignment is available" },
    { label: "Utility proxy", value: "WSACC sewer proximity and basin context only; capacity and service are not confirmed" },
    { label: "Environmental context", value: "FEMA, NWI, NRCS, EPA, and terrain summaries are screening evidence requiring verification" },
    { label: "Comparable context", value: "Historical sale and assessed context are due-diligence inputs, not appraisal conclusions" },
    { label: "Underwriting formulas", value: "Deterministic scenario calculations use user-entered assumptions, not AI arithmetic or CFS forecasts" },
    { label: "Safety interpretation", value: "CFS Investments does not recommend purchases or guarantee future value" },
  ];
  const workflow = [
    "Open or create a Case Study",
    "Define the acquisition strategy",
    "Run Find Sites to create a candidate pool",
    "Add the strongest candidates to the shortlist",
    "Analyze each candidate",
    "Compare their tradeoffs",
    "Enter underwriting assumptions",
    "Draft a conditional recommendation",
    "Create the due-diligence plan",
    "Generate the final deliverables",
  ];
  const demoDatasets = [
    { href: "/demo-data/demo_manifest.json", label: "Demo asset manifest", records: "8 required assets" },
    { href: "/demo-data/sample_parcels.json", label: "Planning parcel sample", records: "300 parcels" },
    { href: "/demo-data/map_layers/demo_layer_manifest.json", label: "Planning map layers", records: "8 layers" },
    { href: "/demo-data/economics_intelligence.json", label: "Economics intelligence", records: "120 parcel signals" },
    { href: "/demo-data/economics_powerbi_export.json", label: "Economics Power BI export", records: "120 parcel signals" },
  ];
  return (
    <section className={compact ? "investment-signal-list" : "investment-card"}>
      <div className="investment-section-heading"><div><p>Data & Methodology</p><h2>Source inventory, proxies, and limits</h2></div></div>
      <Matrix rows={rows} />
      {!compact ? (
        <section className="mt-4" id="investment-source-status" aria-label="Demo dataset status">
          <div className="investment-section-heading">
            <div><p>Dataset Status</p><h2>Sanitized static sources</h2></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--econ-muted)]">
                <tr>
                  <th className="px-3 py-2">Dataset</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Records</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {demoDatasets.map((dataset) => (
                  <tr className="border-t border-[var(--econ-border)]" key={dataset.href}>
                    <td className="px-3 py-3 font-semibold text-[var(--econ-text)]">{dataset.label}</td>
                    <td className="px-3 py-3">
                      <button className="cursor-not-allowed text-xs text-[var(--econ-muted)]" disabled type="button">
                        Static in portfolio demo
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[var(--econ-muted)]">{dataset.records}</td>
                    <td className="px-3 py-3">
                      <a className="font-semibold text-[var(--econ-gold)]" href={dataset.href} rel="noreferrer" target="_blank">
                        Open demo asset
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {!compact ? (
        <section className="investment-card mt-4">
          <div className="investment-section-heading"><div><p>How to Use CFS Investments</p><h2>Case-study workflow</h2></div></div>
          <ol className="investment-numbered-list">
            {workflow.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <Matrix rows={[
            { label: "CFS Planning", value: "What is happening and what planning conditions matter?" },
            { label: "CFS Economics", value: "What do the land and development patterns mean economically?" },
            { label: "CFS Investments", value: "Which sites should receive deeper analysis, underwriting, and professional due diligence?" },
          ]} />
        </section>
      ) : null}
      {!compact ? (
        <div className="investment-disclaimer">
          Do not expose owner names, mailing addresses, grantor/grantee names, raw scores, exact probabilities, internal weights, secrets, or raw source records.
        </div>
      ) : null}
    </section>
  );
}

function InvestmentResearchCompletenessPanel({
  activeSignal,
  context,
  intakeAnalysis,
  reportReady,
  underwritingReady,
}: {
  activeSignal: EconomicsParcelSignal | null;
  context: InvestmentResearchContext | null;
  intakeAnalysis: InvestmentIntakeAnalysisResponse | null;
  reportReady: boolean;
  underwritingReady: boolean;
}) {
  const status = (available: unknown, partial?: unknown): string => available ? "Available" : partial ? "Partial" : "Needs Verification";
  const rows = [
    { label: "Parcel", value: status(context?.parcel_fundamentals, activeSignal) },
    { label: "Planning", value: status(context?.planning_context, activeSignal?.zoning_support_band) },
    { label: "Market", value: status(intakeAnalysis?.market_area_context ?? context?.market_area_context, activeSignal?.economic_segment) },
    { label: "Transportation", value: status(context?.development_readiness, activeSignal?.transportation_access_band) },
    { label: "Utilities", value: status(context?.utility_context, activeSignal?.utility_readiness_proxy_class) },
    { label: "Historical sales", value: status(context?.acquisition_basis, intakeAnalysis?.screening_context?.sale_quality_band) },
    { label: "Comparables", value: status(context?.comparable_context, intakeAnalysis?.screening_context?.basis_context_band) },
    { label: "Asking basis", value: intakeAnalysis?.acquisition_basis.asking_price ? "Available" : "Needs Input" },
    { label: "Environmental", value: status(intakeAnalysis?.environmental_context ?? context?.environmental_context, activeSignal?.flood_constraint_band) },
    { label: "Underwriting", value: underwritingReady ? "Available" : "Needs Input" },
    { label: "Due diligence", value: activeSignal?.due_diligence_flags || context?.verification_requirements?.length ? "Needs Verification" : "Partial" },
    { label: "Report", value: reportReady ? "Available" : "Needs Input" },
  ];
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Research Completeness</p><h2>What remains before review is ready</h2></div></div>
      <Matrix rows={rows} />
    </section>
  );
}

function InvestmentRecentWorkPanel({
  items,
  onOpen,
}: {
  items: InvestmentRecentWorkItem[];
  onOpen: (item: InvestmentRecentWorkItem) => void;
}) {
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Recent Work</p><h2>Continue where you left off</h2></div></div>
      {items.length ? (
        <div className="investment-bucket-list">
          {items.map((item) => (
            <div key={item.id}>
              <span>{titleText(item.page)}</span>
              <strong>{item.label}</strong>
              <small>{item.summary ?? item.reference_status ?? "Continue"}</small>
              <button className="investment-ghost-button" onClick={() => onOpen(item)} type="button">Continue</button>
            </div>
          ))}
        </div>
      ) : <p className="investment-empty">Recent searches, analyses, projects, underwriting scenarios, and reports appear here after you start.</p>}
    </section>
  );
}

function InvestmentOpportunityFeedPage({
  onAddToBucket,
  onAddToEngagement,
  onAddToIntake,
  onAddToShortlist,
  onMatch,
  onStartUnderwriting,
  opportunities,
  reportBucketMutationsDisabled,
  sources,
}: {
  onAddToBucket: (opportunity: InvestmentOpportunityReference) => void;
  onAddToEngagement: (opportunity: InvestmentOpportunityReference) => void;
  onAddToIntake: (opportunity: InvestmentOpportunityReference) => void;
  onAddToShortlist: (opportunity: InvestmentOpportunityReference) => void;
  onMatch: (opportunity: InvestmentOpportunityReference) => void;
  onStartUnderwriting: (opportunity: InvestmentOpportunityReference) => void;
  opportunities: InvestmentOpportunityReference[];
  reportBucketMutationsDisabled: boolean;
  sources: InvestmentOpportunitySource[];
}) {
  return (
    <section className="investment-work-grid">
      <div className="investment-primary-column">
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Opportunity Feed</p><h2>Available sites, listing references, public opportunities, and broker feeds</h2></div><span className="investment-pill">{opportunities.length}</span></div>
          <div className="investment-disclaimer">Available opportunity references from enabled sources. External search references are not synchronized listings; verify availability and content on the source platform.</div>
          <div className="investment-table-wrap">
            <table className="investment-table">
              <thead><tr><th>Opportunity</th><th>Source</th><th>Area</th><th>Acreage</th><th>Asking Basis</th><th>Match</th><th>Action</th></tr></thead>
              <tbody>
                {opportunities.slice(0, 35).map((opportunity) => (
                  <tr key={opportunity.external_opportunity_id}>
                    <td><strong>{opportunity.title}</strong><br /><span className="investment-muted">{opportunity.property_type}</span></td>
                    <td>{opportunity.source_name}<br /><span className="investment-muted">{opportunity.listing_status}</span></td>
                    <td>{opportunity.general_location ?? "Verify"}</td>
                    <td>{displayValue(opportunity.acreage)}</td>
                    <td>{moneyText(opportunity.asking_price)}<br /><span className="investment-muted">{opportunity.data_freshness_band}</span></td>
                    <td>{opportunity.parcel_match_status}</td>
                    <td>
                      <div className="investment-row-actions">
                        {opportunity.source_url ? <a className="investment-ghost-button" href={opportunity.source_url} rel="noreferrer" target="_blank">Open Source</a> : null}
                        <button onClick={() => onMatch(opportunity)} type="button">Match Parcel</button>
                        <button onClick={() => onAddToIntake(opportunity)} type="button">Add to Intake</button>
                        <button onClick={() => onStartUnderwriting(opportunity)} type="button">Start Underwriting</button>
                        <button onClick={() => onAddToShortlist(opportunity)} type="button">Add to Shortlist</button>
                        <button onClick={() => onAddToEngagement(opportunity)} type="button">Add to Project</button>
                        <button disabled={reportBucketMutationsDisabled} onClick={() => onAddToBucket(opportunity)} type="button">Create Report Note</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <aside className="investment-rail">
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Source Governance</p><h2>Enabled and restricted sources</h2></div></div>
          <div className="investment-bucket-list">
            {sources.map((source) => (
              <div key={source.source_id}>
                <span>{source.source_type}</span>
                <strong>{source.source_name}</strong>
                <small>{source.access_mode} · {source.license_status}</small>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function InvestmentAreaRadarPage({
  areas,
  candidates,
  defaultGoal,
  onAddToBucket,
  onAddToEngagement,
  onAddExternalOpportunity,
  onAddToShortlist,
  onOpenCandidate,
  onOpenOpportunityFeed,
  onRunScreening,
  onSaveSearch,
  reportBucketMutationsDisabled,
  savedSearches,
  status,
}: {
  areas: InvestmentAreaRadarArea[];
  candidates: InvestmentCaseStudyCandidate[];
  defaultGoal: string;
  onAddToBucket: (area: InvestmentAreaRadarArea) => void;
  onAddToEngagement: (area: InvestmentAreaRadarArea) => void;
  onAddExternalOpportunity: () => void;
  onAddToShortlist: (area: InvestmentAreaRadarArea) => void;
  onOpenCandidate: (candidate: InvestmentCaseStudyCandidate) => void;
  onOpenOpportunityFeed: () => void;
  onRunScreening: () => Promise<void>;
  onSaveSearch: () => void;
  reportBucketMutationsDisabled: boolean;
  savedSearches: InvestmentSavedSearch[];
  status?: string | null;
}) {
  const [hasRun, setHasRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [searchGoal, setSearchGoal] = useState("development_land");
  const [minimumAcreage, setMinimumAcreage] = useState("100");
  const [maxConstraint, setMaxConstraint] = useState("material");
  const minimum = Number(minimumAcreage);
  const candidateConstraint = (candidate: InvestmentCaseStudyCandidate) =>
    String((candidate as unknown as Record<string, unknown>).environmental_constraint_band ?? "");
  const visibleCandidates = hasRun
    ? candidates.filter(() => searchGoal === "development_land")
      .filter((candidate) => !Number.isFinite(minimum) || minimum <= 0 || (candidate.gross_acres ?? 0) >= minimum)
      .filter((candidate) => maxConstraint === "material" || candidateConstraint(candidate) !== "Material Mapped Constraint")
    : [];
  const run = () => {
    setIsRunning(true);
    void onRunScreening()
      .then(() => setHasRun(true))
      .finally(() => setIsRunning(false));
  };
  return (
    <section className="investment-primary-column">
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Find Sites</p><h2>Screen parcels and opportunities for the current case study.</h2></div>{hasRun ? <span className="investment-pill">{visibleCandidates.length} candidates</span> : null}</div>
        <div className="investment-guided-form">
          <label>Case Study or Project<input className="investment-input" readOnly value="CFS Large Development-Land Acquisition Case Study" /></label>
          <label>Search Goal<select className="investment-select" value={searchGoal} onChange={(event) => setSearchGoal(event.target.value)}><option value="development_land">{defaultGoal}</option><option value="land_banking">Long-Term Land Banking</option><option value="entitlement_repositioning">Entitlement / Repositioning</option><option value="existing_use">Existing-Use Acquisition</option></select></label>
          <label>Geography<select className="investment-select" defaultValue="countywide"><option value="countywide">All Cabarrus County</option><option value="municipality">Municipality</option><option value="planning_area">Planning area</option><option value="corridor">Corridor</option></select></label>
          <label>Minimum Acreage<input className="investment-input" inputMode="decimal" onChange={(event) => setMinimumAcreage(event.target.value)} placeholder="Example: 100" value={minimumAcreage} /></label>
          <label>Maximum environmental constraint<select className="investment-select" onChange={(event) => setMaxConstraint(event.target.value)} value={maxConstraint}><option value="limited">Limited</option><option value="moderate">Moderate</option><option value="material">Material allowed with verification</option></select></label>
        </div>
        <details className="investment-disclosure">
          <summary>Advanced Criteria</summary>
          <p>Minimum acreage and maximum mapped environmental constraint update the visible cached demo candidates. Zoning, traffic, ACS, soils, wetlands, slope, comparable confidence, and permit momentum are already reflected in the CASE-1 cached screening scores.</p>
        </details>
        <details className="investment-disclosure">
          <summary>How this screening works</summary>
          <p>The public demo loads a sanitized cached screening extract for CASE-1. The validated funnel is 110,017 countywide parcel records to 241 acreage-qualified records, 241 evidence-ready records, 62 initial screen passes, 10 manual-review candidates, and 3 final shortlist candidates. It is not processing raw private records in the browser.</p>
        </details>
        <div className="investment-row-actions">
          <button className="investment-primary-button" disabled={isRunning} onClick={run} type="button">{isRunning ? "Running..." : "Run Screening"}</button>
          <button className="investment-ghost-button" onClick={onSaveSearch} type="button">Save Search</button>
          <button className="investment-ghost-button" onClick={onAddExternalOpportunity} type="button">Add External Opportunity</button>
        </div>
        {status ? <p className="investment-status">{status}</p> : null}
      </section>
      <section className="investment-card" aria-label="Saved searches">
        <div className="investment-section-heading">
          <div><p>Saved Searches</p><h2>Session searches</h2></div>
          <span className="investment-pill">{savedSearches.length} saved</span>
        </div>
        {savedSearches.length ? (
          <div className="investment-bucket-list">
            {savedSearches.map((search) => (
              <div key={search.id}>
                <strong>{search.search_name}</strong>
                <small>{search.goal} · {search.location_type}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="investment-empty">No saved searches in this browser session.</p>
        )}
      </section>
      <section className="investment-result-grid" aria-label="Find results">
        {hasRun && searchGoal === "development_land" && areas.length ? areas.slice(0, 12).map((area) => (
          <article className="investment-result-card" key={area.area_id}>
            <span>{area.area_classification}</span>
            <h3>{area.area_name}</h3>
            <p>{area.candidate_count} CFS candidates · {area.data_confidence} confidence</p>
            <InvestmentSignalList title="Why it surfaced" values={area.why_it_surfaced.slice(0, 3)} />
            <InvestmentSignalList title="Main caution" values={area.major_cautions.slice(0, 2)} />
            <small>Next: {area.recommended_next_search_action}</small>
            <div className="investment-row-actions">
              <button className="investment-primary-button" onClick={onOpenOpportunityFeed} type="button">Find Properties</button>
              <button onClick={() => onAddToShortlist(area)} type="button">Add to Shortlist</button>
              <button onClick={() => onAddToEngagement(area)} type="button">Add to Project</button>
              <button disabled={reportBucketMutationsDisabled} onClick={() => onAddToBucket(area)} type="button">Create Report</button>
            </div>
          </article>
        )) : null}
        {visibleCandidates.map((candidate) => (
          <article className="investment-result-card" key={candidate.parcel_id}>
            <span>{candidate.review_band ?? "Case-study candidate"}</span>
            <h3>{candidate.parcel_id}</h3>
            <p>{candidate.gross_acres?.toLocaleString("en-US")} gross acres | score {candidate.screening_score ?? "N/A"}</p>
            <InvestmentSignalList title="Why it surfaced" values={[candidate.why_it_surfaced ?? "Large acreage plus usable CFS screening evidence."]} />
            <InvestmentSignalList title="Main cautions" values={(candidate.major_cautions ?? candidate.missing_information ?? []).slice(0, 2)} />
            <small>{candidate.decision ?? "Review before advancing."}</small>
            <div className="investment-row-actions">
              <button className="investment-primary-button" onClick={() => onOpenCandidate(candidate)} type="button">Open Property Review</button>
            </div>
          </article>
        ))}
        {!hasRun ? <p className="investment-empty">No search results yet. Run Screening to load the cached CASE-1 demo shortlist.</p> : null}
        {hasRun && !visibleCandidates.length ? <p className="investment-empty">No candidates match these demo criteria. Lower minimum acreage or allow material mapped constraints.</p> : null}
      </section>
    </section>
  );
}

function InvestmentEngagementsPage({
  activeCaseStudy,
  caseStudies,
  caseStudyBriefMarkdown,
  engagements,
  initialCaseStudyUrlState,
  onAddArea,
  onAnalyzeCaseStudyParcel,
  onArchiveCaseStudy,
  onCreate,
  onDuplicateCaseStudy,
  onExportCaseStudyBrief,
  onGenerateReport,
  onMakeCaseStudyCandidateActive,
  onOpenCaseStudy,
  onOpenFindSites,
  onOpenIntake,
  onSaveCaseStudyNote,
  reportBucketMutationsDisabled,
}: {
  activeCaseStudy: InvestmentCaseStudy | null;
  caseStudies: InvestmentCaseStudy[];
  caseStudyBriefMarkdown?: string | null;
  engagements: InvestmentEngagement[];
  initialCaseStudyUrlState?: InitialCaseStudyUrlState;
  onAddArea: (areaId: string) => void;
  onAnalyzeCaseStudyParcel: (parcelId: string, label?: string) => void;
  onArchiveCaseStudy: (slug: string) => void;
  onCreate: () => void;
  onDuplicateCaseStudy: (slug: string) => void;
  onExportCaseStudyBrief: (slug: string) => void;
  onGenerateReport: () => void;
  onMakeCaseStudyCandidateActive: (slug: string, parcelId: string) => void;
  onOpenCaseStudy: (slug: string) => void;
  onOpenFindSites: () => void;
  onOpenIntake: () => void;
  onSaveCaseStudyNote: (slug: string, note: string) => void;
  reportBucketMutationsDisabled: boolean;
}) {
  const [projectView, setProjectView] = useState<"active" | "case-studies">("case-studies");
  const active = engagements[0];
  const projectTabs = [
    ["active", "Active Projects"],
    ["case-studies", "Case Studies"],
  ] as const;
  return (
    <>
      <section className="investment-card">
        <div className="investment-section-heading">
          <div><p>Projects</p><h2>Active projects and case studies</h2></div>
          <button className="investment-primary-button" onClick={onCreate} type="button">New Project</button>
        </div>
        <div className="investment-tabs" role="tablist" aria-label="Project sections">
          {projectTabs.map(([id, label]) => (
            <button aria-selected={projectView === id} key={id} onClick={() => setProjectView(id)} role="tab" type="button">{label}</button>
          ))}
        </div>
      </section>
      {projectView === "case-studies" ? (
        <InvestmentCaseStudies
          activeCaseStudy={activeCaseStudy}
          caseStudies={caseStudies}
          codexBriefMarkdown={caseStudyBriefMarkdown}
          initialUrlState={initialCaseStudyUrlState}
          onAnalyzeParcel={onAnalyzeCaseStudyParcel}
          onArchive={onArchiveCaseStudy}
          onDuplicate={onDuplicateCaseStudy}
          onExportBrief={onExportCaseStudyBrief}
          onMakeActive={onMakeCaseStudyCandidateActive}
          onOpen={onOpenCaseStudy}
          onOpenFindSites={onOpenFindSites}
          onOpenIntake={onOpenIntake}
          onSaveNote={onSaveCaseStudyNote}
        />
      ) : null}
      {projectView === "active" ? (
        <section className="investment-work-grid">
      <div className="investment-primary-column">
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Active Projects</p><h2>Client criteria, site screening, shortlists, and deliverables</h2></div><button className="investment-primary-button" onClick={onCreate} type="button">New Project</button></div>
          <div className="investment-row-actions mb-4">
            <button className="investment-ghost-button" onClick={onOpenIntake} type="button">Add External Opportunity</button>
          </div>
          {active ? (
            <>
              <Matrix rows={[
                { label: "Engagement", value: active.engagement_name },
                { label: "Strategy", value: investmentStrategyLabel(active.selected_strategy) },
                { label: "Status", value: active.engagement_status },
                { label: "Shortlist items", value: String(active.shortlist.length) },
                { label: "Criteria", value: String(active.criteria.length) },
              ]} />
              <InvestmentSignalList title="Criteria matrix" values={active.criteria.map((item) => `${String(item.type ?? "Informational")}: ${String(item.criterion ?? item.label ?? "Criteria")}`)} />
              <InvestmentSignalList title="Consultant shortlist" values={active.shortlist.map((item) => `${String(item.item_type)} ${String(item.item_id)} · ${String(item.status)}`)} />
              <div className="investment-row-actions mt-4">
                <button className="investment-primary-button" disabled={reportBucketMutationsDisabled} onClick={onGenerateReport} type="button">Generate Client-Ready Summary</button>
                <button className="investment-ghost-button" onClick={() => onAddArea("countywide")} type="button">Add Countywide Search Area</button>
              </div>
            </>
          ) : <p className="investment-empty">No engagements yet. Create one to manage client criteria, shortlist sites, portfolio screening, and deliverables.</p>}
        </section>
      </div>
      <aside className="investment-rail">
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Investment Workflow</p><h2>Safe deliverable language</h2></div></div>
          <InvestmentSignalList title="Use" values={["Recommended for additional diligence", "Priority Search Area", "Screening-level review", "Verify source availability"]} />
          <InvestmentSignalList title="Avoid" values={["Purchase directives", "Complete listing inventory claims", "Return assurances", "Valuation conclusions"]} />
        </section>
      </aside>
        </section>
      ) : null}
    </>
  );
}

const underwritingScenarioTypeOptions: Array<{ id: InvestmentUnderwritingScenarioType; label: string; fields: string[] }> = [
  { id: "development_land", label: "Development Land", fields: ["purchase_price", "scenario_unit_count", "scenario_building_area", "site_preparation_cost", "grading_cost", "utility_extension_cost", "stormwater_cost", "vertical_construction_cost", "professional_fees", "permit_and_impact_fees", "financing_cost", "contingency_percent", "sale_price_per_unit", "sale_price_per_square_foot", "rent_per_unit", "exit_cap_rate", "entitlement_period_months", "construction_period_months", "absorption_period_months"] },
  { id: "land_banking", label: "Long-Term Land Banking", fields: ["acquisition_basis", "closing_cost_percent", "scenario_site_area", "annual_property_tax_assumption", "annual_insurance_assumption", "annual_land_management_cost", "annual_legal_or_compliance_cost", "annual_other_holding_cost", "annual_cost_growth_rate", "holding_period_years", "exit_price_scenario", "exit_price_per_acre_scenario", "selling_cost_percent"] },
  { id: "entitlement_repositioning", label: "Entitlement / Repositioning", fields: ["acquisition_basis", "entitlement_cost", "planning_consultant_cost", "legal_cost", "engineering_cost", "application_and_review_fees", "environmental_review_cost", "contingency_percent", "holding_period", "post_entitlement_exit_basis", "development_partner_sale_basis"] },
  { id: "existing_use_acquisition", label: "Existing-Use Acquisition", fields: ["purchase_price", "gross_potential_income", "vacancy_and_credit_loss", "other_income", "effective_gross_income", "operating_expenses", "capital_reserves", "net_operating_income", "loan_amount", "loan_to_value", "interest_rate", "amortization_years", "interest_only_period", "origination_fee", "exit_cap_rate", "annual_income_growth", "annual_expense_growth", "capital_improvement_plan", "holding_period", "sale_cost"] },
];

const essentialUnderwritingFields: Record<InvestmentUnderwritingScenarioType, string[]> = {
  development_land: ["purchase_price", "scenario_unit_count", "scenario_building_area", "site_preparation_cost", "vertical_construction_cost", "sale_price_per_unit", "rent_per_unit", "construction_period_months"],
  entitlement_repositioning: ["acquisition_basis", "entitlement_cost", "legal_cost", "engineering_cost", "holding_period", "post_entitlement_exit_basis"],
  existing_use_acquisition: ["purchase_price", "gross_potential_income", "vacancy_and_credit_loss", "operating_expenses", "loan_amount", "loan_to_value", "interest_rate", "holding_period", "exit_cap_rate"],
  land_banking: ["acquisition_basis", "holding_period_years", "annual_property_tax_assumption", "annual_insurance_assumption", "exit_price_scenario", "selling_cost_percent"],
};

function UnderwritingAssumptionFields({
  assumptions,
  fieldSources,
  fields,
  onUpdate,
}: {
  assumptions: Record<string, number | string | null>;
  fieldSources?: Record<string, string>;
  fields: string[];
  onUpdate: (key: string, value: string) => void;
}) {
  return (
    <div className="investment-assumption-grid">
      {fields.map((key) => (
        <label key={key}>
          <span>{underwritingFieldLabels[key] ?? key}</span>
          <input inputMode="decimal" type="number" value={assumptions[key] ?? ""} onChange={(event) => onUpdate(key, event.target.value)} />
          <small>{fieldSources?.[key] ?? "User-entered assumption"}</small>
        </label>
      ))}
    </div>
  );
}

const underwritingFieldLabels: Record<string, string> = {
  absorption_period_months: "Absorption period (months)",
  acquisition_basis: "Acquisition basis",
  amortization_years: "Amortization years",
  annual_cost_growth_rate: "Annual cost growth rate",
  annual_expense_growth: "Annual expense growth",
  annual_income_growth: "Annual income growth",
  annual_insurance_assumption: "Annual insurance",
  annual_land_management_cost: "Annual land management",
  annual_legal_or_compliance_cost: "Annual legal/compliance",
  annual_other_holding_cost: "Annual other holding cost",
  annual_property_tax_assumption: "Annual property tax assumption",
  application_and_review_fees: "Application and review fees",
  capital_improvement_plan: "Capital improvement plan",
  capital_reserves: "Capital reserves",
  closing_cost_percent: "Closing cost percent",
  construction_period_months: "Construction period (months)",
  contingency_percent: "Contingency percent",
  development_partner_sale_basis: "Development partner sale basis",
  engineering_cost: "Engineering cost",
  entitlement_cost: "Entitlement cost",
  entitlement_period_months: "Entitlement period (months)",
  environmental_review_cost: "Environmental review cost",
  exit_cap_rate: "Exit cap rate",
  exit_price_per_acre_scenario: "Exit price per acre scenario",
  exit_price_scenario: "Exit price scenario",
  financing_cost: "Financing cost",
  grading_cost: "Grading cost",
  gross_potential_income: "Gross potential income",
  holding_period: "Holding period",
  holding_period_years: "Holding period (years)",
  interest_only_period: "Interest-only period",
  interest_rate: "Interest rate",
  legal_cost: "Legal cost",
  loan_amount: "Loan amount",
  loan_to_value: "Loan to value",
  net_operating_income: "Net operating income",
  operating_expenses: "Operating expenses",
  origination_fee: "Origination fee",
  other_income: "Other income",
  permit_and_impact_fees: "Permit and impact fees",
  planning_consultant_cost: "Planning consultant cost",
  post_entitlement_exit_basis: "Post-entitlement exit basis",
  professional_fees: "Professional fees",
  purchase_price: "Purchase price",
  rent_per_unit: "Rent per unit",
  sale_cost: "Sale cost",
  sale_price_per_square_foot: "Sale price per square foot",
  sale_price_per_unit: "Sale price per unit",
  scenario_building_area: "Scenario building area",
  scenario_site_area: "Scenario site area",
  scenario_unit_count: "Scenario unit count",
  selling_cost_percent: "Selling cost percent",
  site_preparation_cost: "Site preparation cost",
  stormwater_cost: "Stormwater cost",
  utility_extension_cost: "Utility extension cost",
  vacancy_and_credit_loss: "Vacancy / credit loss",
  vertical_construction_cost: "Vertical construction cost",
};

function defaultUnderwritingAssumptions(type: InvestmentUnderwritingScenarioType): Record<string, number | string | null> {
  if (type === "development_land") {
    return { construction_period_months: 18, contingency_percent: 10, entitlement_period_months: 12, exit_cap_rate: 6, scenario_unit_count: 100 };
  }
  if (type === "land_banking") {
    return { annual_cost_growth_rate: 3, closing_cost_percent: 2, holding_period_years: 5, selling_cost_percent: 3 };
  }
  if (type === "entitlement_repositioning") {
    return { contingency_percent: 10, holding_period: 2 };
  }
  return { amortization_years: 25, exit_cap_rate: 7, holding_period: 5, interest_rate: 7, loan_to_value: 65, vacancy_and_credit_loss: 5 };
}

function InvestmentUnderwritingLab({
  activeSignal,
  assumptions,
  compareIds,
  comparison,
  intakeAnalysis,
  onAddToBucket,
  onArchiveScenario,
  onApplyPrefill,
  onCalculate,
  onCompare,
  onDeleteScenario,
  onExport,
  onOpenScenario,
  onSave,
  onSetAssumptions,
  onSetScenarioName,
  onSetScenarioType,
  onToggleCompare,
  result,
  scenarioName,
  scenarios,
  scenarioType,
  status,
  strategy,
  templates,
  prefill,
  reportBucketMutationsDisabled,
}: {
  activeSignal: EconomicsParcelSignal | null;
  assumptions: Record<string, number | string | null>;
  compareIds: string[];
  comparison: InvestmentUnderwritingCompareResponse | null;
  intakeAnalysis: InvestmentIntakeAnalysisResponse | null;
  onAddToBucket: () => void;
  onArchiveScenario: (scenarioId: string) => void;
  onApplyPrefill: (opportunityId?: string | null, templateId?: string | null) => void;
  onCalculate: () => void;
  onCompare: () => void;
  onDeleteScenario: (scenarioId: string) => void;
  onExport: () => void;
  onOpenScenario: (scenario: InvestmentUnderwritingScenario) => void;
  onSave: () => void;
  onSetAssumptions: (value: Record<string, number | string | null> | ((current: Record<string, number | string | null>) => Record<string, number | string | null>)) => void;
  onSetScenarioName: (value: string) => void;
  onSetScenarioType: (value: InvestmentUnderwritingScenarioType) => void;
  onToggleCompare: (scenarioId: string) => void;
  reportBucketMutationsDisabled: boolean;
  result: InvestmentUnderwritingCalculation | null;
  scenarioName: string;
  scenarios: InvestmentUnderwritingScenario[];
  scenarioType: InvestmentUnderwritingScenarioType;
  status: string | null;
  strategy: InvestmentStrategyId;
  templates: InvestmentUnderwritingTemplate[];
  prefill: InvestmentUnderwritingPrefillResponse | null;
}) {
  const scenarioOption = underwritingScenarioTypeOptions.find((option) => option.id === scenarioType) ?? underwritingScenarioTypeOptions[0];
  const updateAssumption = (key: string, value: string) => onSetAssumptions((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
  const selectedLabel = intakeAnalysis?.candidate.candidate_name ?? (activeSignal ? signalLabel(activeSignal) : "No active opportunity");
  const essentialFields = essentialUnderwritingFields[scenarioType];
  const advancedFields = scenarioOption.fields.filter((field) => !essentialFields.includes(field));
  return (
    <section className="investment-work-grid">
      <div className="investment-primary-column">
        <section className="investment-card">
          <div className="investment-section-heading">
            <div>
              <p>Underwriting Lab</p>
              <h2>Deal scenarios, feasibility, and sensitivity analysis</h2>
            </div>
            <span className="investment-pill">{investmentStrategyLabel(strategy)}</span>
          </div>
          <div className="investment-step-strip" aria-label="Underwriting workflow steps">
            <span>1. Select Opportunity</span><span>2. Choose Scenario Type</span><span>3. Enter Assumptions</span><span>4. Review Results</span><span>5. Test Sensitivities</span><span>6. Save / Report</span>
          </div>
          <div className="investment-disclaimer">
            Underwriting uses user-entered assumptions and deterministic calculations. It is not investment advice, not an appraisal, not a financing commitment, and not a guarantee of future value.
          </div>
          <div className="investment-two-column mt-4">
            <label className="grid gap-1 text-xs text-[var(--investment-text-muted)]">
              Scenario name
              <input className="investment-input" value={scenarioName} onChange={(event) => onSetScenarioName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-[var(--investment-text-muted)]">
              Scenario type
              <select className="investment-select" value={scenarioType} onChange={(event) => onSetScenarioType(event.target.value as InvestmentUnderwritingScenarioType)}>
                {underwritingScenarioTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[var(--investment-text-muted)]">
              Assumption template
              <select className="investment-select" onChange={(event) => event.target.value && onApplyPrefill(null, event.target.value)} defaultValue="">
                <option value="">Choose template</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.template_name}</option>)}
              </select>
            </label>
            <div className="investment-row-actions self-end">
              <button className="investment-ghost-button" onClick={() => onApplyPrefill()} type="button">Smart Prefill</button>
            </div>
          </div>
          <Matrix rows={[
            { label: "Active opportunity", value: selectedLabel },
            { label: "Parcel", value: intakeAnalysis?.candidate.parcel_id ?? activeSignal?.parcel_id ?? "Select an opportunity" },
            { label: "Parcel acreage", value: String(intakeAnalysis?.acquisition_basis.parcel_acres ?? activeSignal?.acreage ?? "CFS evidence unavailable") },
            { label: "Current Asking Basis", value: intakeAnalysis?.acquisition_basis.asking_basis_band ?? "Missing or unverified" },
            { label: "Scenario Acquisition Basis", value: "User-entered assumption" },
            { label: "Utility evidence", value: activeSignal?.utility_readiness_proxy_class ?? "CFS-derived proxy; capacity not confirmed" },
          ]} />
          {prefill ? (
            <InvestmentSignalList title="Prefill summary" values={[
              `CFS fields: ${prefill.prefill_summary.fields_populated_from_cfs?.join(", ") || "none"}`,
              `Opportunity fields: ${prefill.prefill_summary.fields_populated_from_opportunity_source?.join(", ") || "none"}`,
              `Template fields: ${prefill.prefill_summary.fields_populated_from_template?.join(", ") || "none"}`,
              `Analyst input needed: ${prefill.prefill_summary.fields_requiring_analyst_input?.join(", ") || "review remaining blanks"}`,
            ]} />
          ) : null}
        </section>
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Essential Inputs</p><h2>{scenarioOption.label}</h2></div></div>
          <InvestmentSignalList title="CFS will use" values={["Parcel and zoning data", "Permit and development activity", "Market area context", "Environmental constraints", "Transportation and utility proximity", "Asking-price and comparable evidence"]} />
          <InvestmentSignalList title="You still need to provide" values={["Acquisition price", "Project type", "Financing assumptions", "Development or operating costs", "Exit assumptions", "Professional utility and entitlement confirmation"]} />
          <UnderwritingAssumptionFields assumptions={assumptions} fieldSources={prefill?.field_sources} fields={essentialFields} onUpdate={updateAssumption} />
          <details className="investment-disclosure">
            <summary>Advanced Assumptions</summary>
            <UnderwritingAssumptionFields assumptions={assumptions} fieldSources={prefill?.field_sources} fields={advancedFields} onUpdate={updateAssumption} />
          </details>
          <div className="investment-row-actions mt-4">
            <button className="investment-primary-button" onClick={onCalculate} type="button">Calculate Scenario</button>
            <button className="investment-ghost-button" disabled={!result} onClick={onSave} type="button">Save Scenario</button>
            <button className="investment-ghost-button" disabled={!result} onClick={onExport} type="button">Export JSON</button>
            <button className="investment-ghost-button" disabled={!result || reportBucketMutationsDisabled} onClick={onAddToBucket} type="button">Add to Report Bucket</button>
          </div>
          {status ? <p className="investment-status mt-3">{status}</p> : null}
        </section>
        <InvestmentUnderwritingResults result={result} />
      </div>
      <aside className="investment-rail">
        <InvestmentUnderwritingScenarioList
          compareIds={compareIds}
          onArchive={onArchiveScenario}
          onCompare={onCompare}
          onDelete={onDeleteScenario}
          onOpen={onOpenScenario}
          onToggleCompare={onToggleCompare}
          scenarios={scenarios}
        />
        {comparison ? <InvestmentUnderwritingComparison comparison={comparison} /> : null}
      </aside>
    </section>
  );
}

function InvestmentUnderwritingResults({ result }: { result: InvestmentUnderwritingCalculation | null }) {
  if (!result) return <section className="investment-card"><p className="investment-empty">No underwriting result yet. Enter assumptions and calculate a scenario.</p></section>;
  const resultRows = Object.entries(result.results)
    .filter(([key]) => !["missing_inputs", "warnings", "evidence_label", "scenario_interpretation"].includes(key))
    .map(([key, value]) => ({ label: underwritingFieldLabels[key] ?? titleText(key), value: displayValue(value) }));
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Review Results</p><h2>{result.scenario_type_label}</h2></div></div>
      <Matrix rows={resultRows} />
      <InvestmentSignalList title="Missing inputs" values={result.missing_inputs.length ? result.missing_inputs : ["No required-input warnings from the current calculation."]} />
      <InvestmentSignalList title="Major risks and warnings" values={result.warnings.length ? result.warnings : ["Verify all assumptions with financial, legal, planning, utility, engineering, and tax professionals."]} />
      <InvestmentSensitivityTable sensitivity={result.sensitivity} />
    </section>
  );
}

function InvestmentSensitivityTable({ sensitivity }: { sensitivity: InvestmentUnderwritingCalculation["sensitivity"] }) {
  return (
    <div className="investment-signal-list">
      <p>Sensitivity Analysis</p>
      <span className="investment-muted">{sensitivity.status}: {sensitivity.variables.join(" vs ") || "inputs unavailable"}</span>
      {sensitivity.matrix.length ? (
        <div className="investment-table-wrap">
          <table className="investment-table investment-table--compact">
            <tbody>
              {sensitivity.matrix.map((row) => (
                <tr key={String(row.variable_value)}>
                  <td>{displayValue(row.variable_value)}</td>
                  {row.outcomes.map((value, index) => <td key={`${row.variable_value}-${index}`}>{displayValue(value)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function InvestmentUnderwritingScenarioList({
  compareIds,
  onArchive,
  onCompare,
  onDelete,
  onOpen,
  onToggleCompare,
  scenarios,
}: {
  compareIds: string[];
  onArchive: (scenarioId: string) => void;
  onCompare: () => void;
  onDelete: (scenarioId: string) => void;
  onOpen: (scenario: InvestmentUnderwritingScenario) => void;
  onToggleCompare: (scenarioId: string) => void;
  scenarios: InvestmentUnderwritingScenario[];
}) {
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Saved Scenarios</p><h2>Private underwriting library</h2></div><span className="investment-pill">{scenarios.length}</span></div>
      {scenarios.length ? (
        <div className="investment-bucket-list">
          {scenarios.slice(0, 8).map((scenario) => (
            <div key={scenario.id}>
              <span>{scenario.scenario_type_label}</span>
              <strong>{scenario.scenario_name}</strong>
              <small>{scenario.scenario_status} · {formatDate(scenario.updated_at)}</small>
              <div className="investment-row-actions">
                <label><input checked={compareIds.includes(scenario.id)} onChange={() => onToggleCompare(scenario.id)} type="checkbox" /> Compare</label>
                <button onClick={() => onOpen(scenario)} type="button">Open</button>
                <button onClick={() => onArchive(scenario.id)} type="button">Archive</button>
                <button onClick={() => onDelete(scenario.id)} type="button">Delete</button>
              </div>
            </div>
          ))}
          <button className="investment-primary-button" disabled={compareIds.length < 2} onClick={onCompare} type="button">Compare Scenarios</button>
        </div>
      ) : <p className="investment-empty">No saved underwriting scenarios yet.</p>}
    </section>
  );
}

function InvestmentUnderwritingComparison({ comparison }: { comparison: InvestmentUnderwritingCompareResponse }) {
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Scenario Comparison</p><h2>Modeled tradeoffs only</h2></div></div>
      <InvestmentSignalList title="Comparison summary" values={comparison.summary} />
      <div className="investment-table-wrap">
        <table className="investment-table investment-table--compact">
          <thead><tr><th>Scenario</th><th>Type</th><th>Status</th><th>Return Context</th><th>Missing Evidence</th></tr></thead>
          <tbody>
            {comparison.scenarios.map((scenario) => (
              <tr key={scenario.id}>
                <td>{scenario.scenario_name}</td>
                <td>{scenario.scenario_type_label}</td>
                <td>{scenario.scenario_status}</td>
                <td>{displayValue(scenario.results.scenario_irr ?? scenario.results.scenario_return ?? scenario.results.unlevered_return_context)}</td>
                <td>{Array.isArray(scenario.results.missing_inputs) ? scenario.results.missing_inputs.join("; ") : "Review assumptions"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function underwritingBucketItem(result: InvestmentUnderwritingCalculation): ReportBucketItemInput {
  return {
    caveats: result.limitations,
    content: JSON.stringify({ assumptions: result.assumptions, results: result.results, sensitivity: result.sensitivity }, null, 2),
    id: `underwriting-${slugifyReportTitle(result.scenario_name)}-${Date.now()}`,
    selected_for_print: true,
    source_page: "CFS Investments",
    summary: `${result.scenario_type_label} with ${result.missing_inputs.length} missing-input warning(s).`,
    title: result.scenario_name,
    type: "scenario_output",
  };
}

function opportunityBucketItem(opportunity: InvestmentOpportunityReference): ReportBucketItemInput {
  return {
    caveats: [opportunity.source_caveat ?? "Verify opportunity availability and source terms before relying on this reference."],
    content: [
      `Opportunity: ${opportunity.title}`,
      `Source: ${opportunity.source_name}`,
      `Property type: ${opportunity.property_type}`,
      `General area: ${opportunity.general_location ?? "Verify"}`,
      `Parcel match: ${opportunity.parcel_match_status}`,
      `Asking basis: ${moneyText(opportunity.asking_price)}`,
      `Storage policy: ${opportunity.storage_policy}`,
    ].join("\n"),
    id: `opportunity-${slugifyReportTitle(opportunity.external_opportunity_id)}-${Date.now()}`,
    selected_for_print: true,
    source_page: "CFS Investments",
    summary: `${opportunity.source_name} reference requiring source verification.`,
    title: `Opportunity reference: ${opportunity.title}`,
    type: "evidence_pack",
  };
}

function areaRadarBucketItem(area: InvestmentAreaRadarArea): ReportBucketItemInput {
  return {
    caveats: ["Area Radar is a CFS-derived search aid, not a complete property inventory."],
    content: [
      `Area: ${area.area_name}`,
      `Classification: ${area.area_classification}`,
      `Why it surfaced: ${area.why_it_surfaced.join("; ")}`,
      `Major cautions: ${area.major_cautions.join("; ")}`,
      `Missing evidence: ${area.missing_evidence.join("; ")}`,
      `Next action: ${area.recommended_next_search_action}`,
    ].join("\n"),
    id: `area-radar-${slugifyReportTitle(area.area_id)}-${Date.now()}`,
    selected_for_print: true,
    source_page: "CFS Investments",
    summary: `${area.area_classification} with ${area.candidate_count} CFS candidate records.`,
    title: `Area Opportunity Radar: ${area.area_name}`,
    type: "evidence_pack",
  };
}

function titleText(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function engagementShortlistType(itemType: InvestmentSavedItem["item_type"]) {
  if (itemType === "area") return "search_area";
  if (["parcel", "opportunity", "intake_candidate", "underwriting_scenario"].includes(itemType)) return itemType;
  return null;
}

function recordInvestmentEvent(eventName: string, detail: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cfs-investment-event", { detail: { eventName, ...detail } }));
  if (eventName === "report_generated") {
    recordTechnicalEvent("report_generation", detail);
  }
}

function readInvestmentDisplayPreference(): {
  lastPage?: InvestmentPageId;
  viewMode?: "guided" | "advanced";
} {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const pageFromUrl = params.get("investmentPage");
    const caseStudyFromUrl = params.get("caseStudy");
    const stored = JSON.parse(localStorage.getItem("cfs-investment-display-preferences") ?? "{}");
    return {
      ...stored,
      lastPage: isInvestmentPageId(pageFromUrl) ? pageFromUrl : caseStudyFromUrl ? "engagements" : stored.lastPage,
    };
  } catch {
    return {};
  }
}

function writeInvestmentDisplayPreference(preference: { lastPage: InvestmentPageId; viewMode: "guided" | "advanced" }, mode: "push" | "replace" = "replace") {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("cfs-investment-display-preferences", JSON.stringify(preference));
    const url = new URL(window.location.href);
    url.searchParams.set("investmentPage", preference.lastPage);
    if (url.href !== window.location.href) window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  } catch {
    // Low-risk display preference only; ignore private-mode or quota failures.
  }
}

type CaseStudyWorkflowStep = "define" | "screen" | "shortlist" | "analyze" | "underwrite" | "decide" | "deliver";

function readCaseStudyWorkflowUrl(): { slug: string | null; step: CaseStudyWorkflowStep | null } {
  if (typeof window === "undefined") return { slug: null, step: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const step = params.get("caseStep");
    return {
      slug: params.get("caseStudy"),
      step: isCaseStudyWorkflowStep(step) ? step : null,
    };
  } catch {
    return { slug: null, step: null };
  }
}

function writeCaseStudyWorkflowUrl(slug: string, step: CaseStudyWorkflowStep, mode: "push" | "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("app", "consulting");
  url.searchParams.set("consultingPage", "case-studies");
  url.searchParams.set("investmentPage", "engagements");
  url.searchParams.set("caseStudy", slug);
  url.searchParams.set("caseStep", step);
  url.searchParams.delete("casePanel");
  url.searchParams.delete("caseItem");
  if (url.href !== window.location.href) {
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
    window.dispatchEvent(new Event("cfs:case-study-url"));
  }
}

function isCaseStudyWorkflowStep(value: string | null): value is CaseStudyWorkflowStep {
  return Boolean(value && ["define", "screen", "shortlist", "analyze", "underwrite", "decide", "deliver"].includes(value));
}

function readInvestmentParcelPreference() {
  if (typeof window === "undefined") return null;
  try {
    const value = new URLSearchParams(window.location.search).get("parcelId");
    return value && /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeInvestmentParcelPreference(parcelId: string | null) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (parcelId) url.searchParams.set("parcelId", parcelId);
    else url.searchParams.delete("parcelId");
    window.history.replaceState(null, "", url);
  } catch {
    // URL restoration is best-effort display state only.
  }
}

function isInvestmentPageId(value: string | null): value is InvestmentPageId {
  return Boolean(value && investmentPageIds.has(value as InvestmentPageId));
}

const investmentPageIds = new Set<InvestmentPageId>([
  "overview",
  "opportunity-feed",
  "area-radar",
  "opportunity",
  "intake",
  "research",
  "compare",
  "market",
  "underwriting",
  "due-diligence",
  "report-studio",
  "engagements",
  "report-bucket",
  "methodology",
]);

function displayValue(value: unknown): string {
  if (value == null || value === "") return "Not available";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

const investmentSourceTypes: InvestmentSourceType[] = [
  "Active Listing",
  "Off-Market Lead",
  "Broker Lead",
  "Auction",
  "County Sale Record",
  "Existing CFS Candidate",
  "Manual Research",
  "Other",
];

const investmentReviewStatuses: InvestmentReviewStatus[] = [
  "New",
  "Screening",
  "Researching",
  "Needs Verification",
  "Priority Review",
  "Hold for Later",
  "Archived",
];

function defaultInvestmentIntakeForm(strategy: InvestmentStrategyId): InvestmentIntakePayload {
  return {
    candidate_name: "",
    source_type: "Manual Research",
    strategy,
  };
}

function InvestmentIntakeWorkspace({
  analysis,
  candidates,
  compareIds,
  comparison,
  csvText,
  editingId,
  form,
  intakeLoading,
  intakeUnavailable,
  onAddAnalysisToBucket,
  onArchive,
  onClearEdit,
  onCompare,
  onCreate,
  onCreateFromActive,
  onDelete,
  onEdit,
  onImportCsv,
  onOpen,
  onSetCsvText,
  onSetForm,
  onToggleCompare,
  reportBucketMutationsDisabled,
}: {
  analysis: InvestmentIntakeAnalysisResponse | null;
  candidates: InvestmentIntakeCandidate[];
  compareIds: string[];
  comparison: InvestmentIntakeCompareResponse | null;
  csvText: string;
  editingId: string | null;
  form: InvestmentIntakePayload;
  intakeLoading: boolean;
  intakeUnavailable: boolean;
  onAddAnalysisToBucket: () => void;
  onArchive: (candidate: InvestmentIntakeCandidate) => void;
  onClearEdit: () => void;
  onCompare: () => void;
  onCreate: () => void;
  onCreateFromActive: () => void;
  onDelete: (candidateId: string) => void;
  onEdit: (candidate: InvestmentIntakeCandidate) => void;
  onImportCsv: () => void;
  onOpen: (candidateId: string) => void;
  onSetCsvText: (value: string) => void;
  onSetForm: (value: InvestmentIntakePayload | ((current: InvestmentIntakePayload) => InvestmentIntakePayload)) => void;
  onToggleCompare: (candidateId: string) => void;
  reportBucketMutationsDisabled: boolean;
}) {
  const [strategyFilter, setStrategyFilter] = useState<InvestmentStrategyId | "All">("All");
  const [reviewFilter, setReviewFilter] = useState<InvestmentReviewStatus | "All">("All");
  const [listingFilter, setListingFilter] = useState("All");
  const [environmentalFilter, setEnvironmentalFilter] = useState("All");
  const [wetlandFilter, setWetlandFilter] = useState("All");
  const [terrainFilter, setTerrainFilter] = useState("All");
  const [environmentalConfidenceFilter, setEnvironmentalConfidenceFilter] = useState("All");
  const [sortMode, setSortMode] = useState<"date_added" | "last_verified">("date_added");
  const update = (patch: Partial<InvestmentIntakePayload>) => onSetForm((current) => ({ ...current, ...patch }));
  const listingOptions = uniqueValues(candidates.map((candidate) => candidate.listing_status ?? "")).filter(Boolean);
  const environmentalOptions = uniqueValues(candidates.map((candidate) => candidate.environmental_constraint_band ?? "")).filter(Boolean);
  const wetlandOptions = uniqueValues(candidates.map((candidate) => candidate.mapped_wetland_context ?? "")).filter(Boolean);
  const terrainOptions = uniqueValues(candidates.map((candidate) => candidate.terrain_context ?? "")).filter(Boolean);
  const environmentalConfidenceOptions = uniqueValues(candidates.map((candidate) => candidate.environmental_data_confidence ?? "")).filter(Boolean);
  const filteredCandidates = candidates
    .filter((candidate) => strategyFilter === "All" || candidate.strategy === strategyFilter)
    .filter((candidate) => reviewFilter === "All" || candidate.review_status === reviewFilter)
    .filter((candidate) => listingFilter === "All" || (candidate.listing_status ?? "Unspecified") === listingFilter)
    .filter((candidate) => environmentalFilter === "All" || (candidate.environmental_constraint_band ?? "Insufficient Information") === environmentalFilter)
    .filter((candidate) => wetlandFilter === "All" || (candidate.mapped_wetland_context ?? "Data Unavailable") === wetlandFilter)
    .filter((candidate) => terrainFilter === "All" || (candidate.terrain_context ?? "Data Unavailable") === terrainFilter)
    .filter((candidate) => environmentalConfidenceFilter === "All" || (candidate.environmental_data_confidence ?? "Data Needed") === environmentalConfidenceFilter)
    .sort((left, right) => Date.parse(right[sortMode] ?? "") - Date.parse(left[sortMode] ?? ""));
  return (
    <section className="investment-card" id="candidate-intake">
      <div className="investment-section-heading">
        <div>
          <p>Candidate Intake</p>
          <h2>Add a listing, off-market lead, or parcel for private review.</h2>
        </div>
        <button className="investment-ghost-button" onClick={onCreateFromActive} type="button">Use active CFS candidate</button>
      </div>
      <div className="investment-disclaimer">
        Source reference only. CFS does not automatically reproduce or verify third-party listing content.
      </div>
      {editingId ? (
        <div className="investment-disclaimer">
          Editing an intake candidate. Save updates or clear the edit form before adding a new lead.
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Candidate label
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.candidate_name} onChange={(event) => update({ candidate_name: event.target.value })} placeholder="Highway 49 Land Lead" />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Parcel ID
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.parcel_id ?? ""} onChange={(event) => update({ parcel_id: event.target.value })} placeholder="CFS-PARCEL-..." />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Source type
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.source_type} onChange={(event) => update({ source_type: event.target.value as InvestmentSourceType })}>
            {investmentSourceTypes.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Asking price
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" min={0} type="number" value={form.asking_price ?? ""} onChange={(event) => update({ asking_price: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Asking price date
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" type="date" value={form.asking_price_date ?? ""} onChange={(event) => update({ asking_price_date: event.target.value || null })} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Review status
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.review_status ?? "New"} onChange={(event) => update({ review_status: event.target.value as InvestmentReviewStatus })}>
            {investmentReviewStatuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)] md:col-span-2">
          Source URL
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.source_url ?? ""} onChange={(event) => update({ source_url: event.target.value || null })} placeholder="Reference link only" />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Source name
          <input className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.source_name ?? ""} onChange={(event) => update({ source_name: event.target.value || null })} />
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)] md:col-span-3">
          Notes
          <textarea className="min-h-20 rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={form.user_notes ?? ""} onChange={(event) => update({ user_notes: event.target.value || null })} placeholder="No owner names, mailing addresses, phone numbers, emails, grantor or grantee names." />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="investment-primary-button" disabled={!form.candidate_name.trim()} onClick={onCreate} type="button">
          {editingId ? "Save Candidate" : "Add Candidate"}
        </button>
        {editingId ? <button className="investment-ghost-button" onClick={onClearEdit} type="button">Cancel Edit</button> : null}
        <details className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs text-[var(--econ-muted)]">
          <summary>CSV import template</summary>
          <p className="mt-2">Headers: parcel_id,candidate_name,source_type,source_name,source_url,asking_price,asking_price_date,listing_status,property_type,strategy,notes</p>
          <textarea className="mt-2 min-h-24 w-full rounded-lg border border-[var(--econ-border)] bg-black/30 p-2 text-[var(--econ-text)]" value={csvText} onChange={(event) => onSetCsvText(event.target.value)} placeholder="Paste up to 50 CSV rows here" />
          <button className="investment-ghost-button mt-2" disabled={!csvText.trim()} onClick={onImportCsv} type="button">Import CSV</button>
        </details>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Strategy
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={strategyFilter} onChange={(event) => setStrategyFilter(event.target.value as InvestmentStrategyId | "All")}>
            <option>All</option>
            {investmentStrategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Review status
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as InvestmentReviewStatus | "All")}>
            <option>All</option>
            {investmentReviewStatuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Listing status
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={listingFilter} onChange={(event) => setListingFilter(event.target.value)}>
            <option>All</option>
            {listingOptions.map((value) => <option key={value}>{value}</option>)}
            {!listingOptions.length ? <option>Unspecified</option> : null}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
          Sort
          <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={sortMode} onChange={(event) => setSortMode(event.target.value as "date_added" | "last_verified")}>
            <option value="date_added">Date added</option>
            <option value="last_verified">Last verified</option>
          </select>
        </label>
        <button className="investment-primary-button" disabled={compareIds.length < 2 || compareIds.length > 4} onClick={onCompare} type="button">
          Compare Selected
        </button>
        <span className="investment-muted">{compareIds.length} selected / 4 maximum</span>
      </div>
      <details className="mt-3 rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs text-[var(--econ-muted)]">
        <summary>Environmental filters</summary>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            Environmental constraint
            <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={environmentalFilter} onChange={(event) => setEnvironmentalFilter(event.target.value)}>
              <option>All</option>
              {environmentalOptions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            Mapped wetland context
            <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={wetlandFilter} onChange={(event) => setWetlandFilter(event.target.value)}>
              <option>All</option>
              {wetlandOptions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            Terrain context
            <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={terrainFilter} onChange={(event) => setTerrainFilter(event.target.value)}>
              <option>All</option>
              {terrainOptions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            Environmental confidence
            <select className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-[var(--econ-text)]" value={environmentalConfidenceFilter} onChange={(event) => setEnvironmentalConfidenceFilter(event.target.value)}>
              <option>All</option>
              {environmentalConfidenceOptions.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <button className="investment-ghost-button" onClick={() => {
            setEnvironmentalFilter("All");
            setWetlandFilter("All");
            setTerrainFilter("All");
            setEnvironmentalConfidenceFilter("All");
          }} type="button">
            Reset environmental filters
          </button>
        </div>
      </details>
      <h3 className="mt-5 text-sm font-semibold text-[var(--econ-text)]">Opportunity Review Queue</h3>
      {intakeLoading ? <p className="investment-empty">Loading private intake candidates...</p> : null}
      {intakeUnavailable ? <p className="investment-empty">Candidate Intake is unavailable. Confirm FastAPI and the local database are running.</p> : null}
      <InvestmentIntakeQueue
        candidates={filteredCandidates}
        compareIds={compareIds}
        onArchive={onArchive}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpen={onOpen}
        onToggleCompare={onToggleCompare}
      />
      {analysis ? <InvestmentIntakeAnalysisCard analysis={analysis} onAddToBucket={onAddAnalysisToBucket} reportBucketMutationsDisabled={reportBucketMutationsDisabled} /> : null}
      {comparison ? <InvestmentIntakeComparison comparison={comparison} /> : null}
    </section>
  );
}

function InvestmentIntakeQueue({
  candidates,
  compareIds,
  onArchive,
  onDelete,
  onEdit,
  onOpen,
  onToggleCompare,
}: {
  candidates: InvestmentIntakeCandidate[];
  compareIds: string[];
  onArchive: (candidate: InvestmentIntakeCandidate) => void;
  onDelete: (candidateId: string) => void;
  onEdit: (candidate: InvestmentIntakeCandidate) => void;
  onOpen: (candidateId: string) => void;
  onToggleCompare: (candidateId: string) => void;
}) {
  if (!candidates.length) return <p className="investment-empty">No private intake candidates yet.</p>;
  return (
    <div className="investment-table-wrap mt-3">
      <table className="investment-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Candidate</th>
            <th>Parcel ID</th>
            <th>Source Type</th>
            <th>Listing</th>
            <th>Strategy</th>
            <th>Current Asking Basis</th>
            <th>Price Recency</th>
            <th>Comparable Context</th>
            <th>Readiness Signal</th>
            <th>Environmental Context</th>
            <th>Mapped Wetland Context</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.id}>
              <td>
                <button aria-pressed={compareIds.includes(candidate.id)} className="investment-select-button" onClick={() => onToggleCompare(candidate.id)} type="button">
                  {compareIds.includes(candidate.id) ? "Selected" : "Select"}
                </button>
              </td>
              <td>{candidate.candidate_name}</td>
              <td>{candidate.parcel_id || "Manual opportunity"}</td>
              <td>{candidate.source_type}</td>
              <td>{candidate.listing_status || "Unverified"}</td>
              <td>{investmentStrategyLabel(candidate.strategy)}</td>
              <td>{candidate.acquisition_basis_band || "Acquisition basis unavailable"}</td>
              <td>{candidate.asking_price_date ? formatDate(candidate.asking_price_date) : "Missing asking price date"}</td>
              <td>{candidate.comparable_context || "Verify"}</td>
              <td>{candidate.readiness_signal || "Verify"}</td>
              <td>{candidate.environmental_constraint_band || "Insufficient Information"}</td>
              <td>{candidate.mapped_wetland_context || "Data Unavailable"}</td>
              <td>{candidate.review_status}</td>
              <td>
                <div className="investment-row-actions">
                  <button onClick={() => onOpen(candidate.id)} type="button">Open</button>
                  <button onClick={() => onEdit(candidate)} type="button">Edit</button>
                  <button onClick={() => onArchive(candidate)} type="button">Archive</button>
                  <button onClick={() => onDelete(candidate.id)} type="button">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestmentIntakeAnalysisCard({
  analysis,
  onAddToBucket,
  reportBucketMutationsDisabled,
}: {
  analysis: InvestmentIntakeAnalysisResponse;
  onAddToBucket: () => void;
  reportBucketMutationsDisabled: boolean;
}) {
  const candidate = analysis.candidate;
  return (
    <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="investment-rail-label">Candidate Intake Analysis</p>
          <h3 className="text-lg font-semibold text-[var(--econ-text)]">{candidate.candidate_name}</h3>
          <p className="investment-muted">{analysis.parcel_match_status}</p>
        </div>
        <button className="investment-ghost-button" disabled={reportBucketMutationsDisabled} onClick={onAddToBucket} type="button">Add to Report Bucket</button>
      </div>
      <Matrix
        rows={[
          { label: "Current Asking Basis", value: analysis.acquisition_basis.asking_basis_band },
          { label: "Asking Price Entered", value: moneyText(analysis.acquisition_basis.asking_price) },
          { label: "Asking Price Date", value: formatDate(candidate.asking_price_date) },
          { label: "Asking Price Recency", value: analysis.acquisition_basis.asking_price_date_age_days == null ? "Missing or unverified" : `${analysis.acquisition_basis.asking_price_date_age_days} days old` },
          { label: "Approximate Acreage", value: analysis.acquisition_basis.parcel_acres == null ? "Not available" : `${analysis.acquisition_basis.parcel_acres.toLocaleString("en-US")} acres` },
          { label: "Asking Price / Acre", value: moneyText(analysis.acquisition_basis.asking_price_per_acre) },
          { label: "Historical Sale Quality", value: analysis.screening_context?.sale_quality_band || "Not Available" },
          { label: "Historical Sale Recency", value: analysis.screening_context?.sale_recency_band || "No sale information available" },
          { label: "Comparable Depth", value: analysis.screening_context?.comparable_count_band || "No comparable evidence" },
          { label: "Comparable Confidence", value: analysis.screening_context?.comparable_confidence_band || analysis.screening_context?.basis_data_confidence || "Low" },
          { label: "Comparable Land Context", value: analysis.screening_context?.basis_context_band || "Insufficient Basis Information" },
          { label: "Constraint Burden", value: analysis.screening_context?.dimension_bands.constraint_burden || "Verify" },
          { label: "Data Confidence", value: analysis.screening_context?.data_confidence_band || "Data Needed" },
        ]}
      />
      <MarketAreaContextPanel context={analysis.market_area_context} />
      <EnvironmentalPhysicalContextPanel context={analysis.environmental_context} />
      <Matrix
        rows={[
          { label: "Asking price evidence", value: analysis.data_attribution.asking_basis || "User-entered information" },
          { label: "Listing/source evidence", value: candidate.source_url ? "Third-party source reference" : "Missing or unverified" },
          { label: "Historical sale evidence", value: analysis.data_attribution.historical_sale_context || "Assessor context requiring verification" },
          { label: "Environmental evidence", value: analysis.data_attribution.environmental_context || "Screening context requiring professional verification" },
          { label: "Utility evidence", value: "CFS-derived sewer/utility proxy" },
        ]}
      />
      <p className="investment-muted">{analysis.acquisition_basis.asking_basis_summary}</p>
      <InvestmentSignalList title="Basis positives" values={analysis.acquisition_basis.basis_positive_reasons.slice(0, 4)} />
      <InvestmentSignalList title="Basis cautions" values={analysis.acquisition_basis.basis_caution_reasons.slice(0, 4)} />
      <InvestmentSignalList title="Verification requirements" values={(analysis.screening_context?.verification_requirements || ["Verify asking basis, deed/sale context, utility capacity, access, title, and site constraints."]).slice(0, 5)} />
      <InvestmentSignalList title="Due diligence checklist" values={landDueDiligenceChecklist.slice(0, 8)} />
    </div>
  );
}

function InvestmentIntakeComparison({ comparison }: { comparison: InvestmentIntakeCompareResponse }) {
  const rows = [
    ["Candidate label", (analysis: InvestmentIntakeAnalysisResponse) => analysis.candidate.candidate_name],
    ["Parcel ID", (analysis: InvestmentIntakeAnalysisResponse) => analysis.candidate.parcel_id || "Manual opportunity"],
    ["Source type", (analysis: InvestmentIntakeAnalysisResponse) => analysis.candidate.source_type],
    ["Listing status", (analysis: InvestmentIntakeAnalysisResponse) => analysis.candidate.listing_status || "Unverified"],
    ["Selected strategy", (analysis: InvestmentIntakeAnalysisResponse) => investmentStrategyLabel(analysis.candidate.strategy)],
    ["Approximate acreage", (analysis: InvestmentIntakeAnalysisResponse) => analysis.acquisition_basis.parcel_acres == null ? "Not available" : `${analysis.acquisition_basis.parcel_acres.toLocaleString("en-US")} acres`],
    ["Current asking basis", (analysis: InvestmentIntakeAnalysisResponse) => analysis.acquisition_basis.asking_basis_band],
    ["Asking-price recency", (analysis: InvestmentIntakeAnalysisResponse) => analysis.acquisition_basis.asking_price_date_age_days == null ? "Missing or unverified" : `${analysis.acquisition_basis.asking_price_date_age_days} days old`],
    ["Historical sale context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.sale_quality_band || "Not Available"],
    ["Comparable context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.basis_context_band || analysis.candidate.comparable_context || "Insufficient Basis Information"],
    ["Development-readiness signal", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.dimension_bands.readiness_signal || analysis.candidate.readiness_signal || "Verify"],
    ["Planning alignment", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.dimension_bands.strategy_fit || analysis.candidate.strategy_fit || "Verify"],
    ["Utility-readiness proxy", (analysis: InvestmentIntakeAnalysisResponse) => String(analysis.screening_context?.safe_display_fields?.utility_readiness_proxy_class || analysis.screening_context?.safe_display_fields?.sewer_proxy_class || "Verify")],
    ["Constraint burden", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.dimension_bands.constraint_burden || analysis.candidate.constraint_burden || "Verify"],
    ["Mapped Wetland Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.mapped_wetland_context || "Data Unavailable"],
    ["Terrain Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.terrain_context || "Data Unavailable"],
    ["Soil Limitation Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.soil_context || "Data Unavailable"],
    ["Environmental Facility Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.environmental_facility_context || "Data Unavailable"],
    ["Usable-Area Screening Proxy", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.usable_area_screening_proxy || "Insufficient Environmental Information"],
    ["Environmental Constraint Band", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.overall_environmental_constraint_band || "Insufficient Information"],
    ["Environmental Data Confidence", (analysis: InvestmentIntakeAnalysisResponse) => analysis.environmental_context?.environmental_data_confidence || "Data Needed"],
    ["Population Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.population_context?.band || "Market geography unavailable"],
    ["Household Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.household_context?.band || "Market geography unavailable"],
    ["Income Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.income_context?.band || "Market geography unavailable"],
    ["Housing Occupancy", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.housing_context?.occupancy_band || "Insufficient Information"],
    ["Growth Context", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.growth_context?.band || "Insufficient Information"],
    ["ACS Data Confidence", (analysis: InvestmentIntakeAnalysisResponse) => analysis.market_area_context?.data_confidence || "Data Needed"],
    ["Data confidence", (analysis: InvestmentIntakeAnalysisResponse) => analysis.screening_context?.data_confidence_band || analysis.candidate.data_confidence || "Data Needed"],
    ["Verification requirements", (analysis: InvestmentIntakeAnalysisResponse) => (analysis.screening_context?.verification_requirements || analysis.acquisition_basis.basis_caution_reasons).slice(0, 2).join(" | ") || "Manual verification required"],
    ["Review status", (analysis: InvestmentIntakeAnalysisResponse) => analysis.candidate.review_status],
  ] as const;
  return (
    <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
      <p className="investment-rail-label">Intake Candidate Comparison</p>
      <h3 className="text-lg font-semibold text-[var(--econ-text)]">Compare selected leads</h3>
      <InvestmentSignalList title="Comparison summary" values={comparison.comparison_summary} />
      <div className="investment-table-wrap mt-3">
        <table className="investment-table">
          <thead>
            <tr>
              <th>Dimension</th>
              {comparison.intake_candidates.map((analysis) => <th key={analysis.candidate.id}>{analysis.candidate.candidate_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, getValue]) => (
              <tr key={label}>
                <td><strong>{label}</strong></td>
                {comparison.intake_candidates.map((analysis) => <td key={`${analysis.candidate.id}-${label}`}>{getValue(analysis)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="investment-disclaimer mt-3">
        Comparison shows tradeoffs only. CFS does not identify a winning parcel or recommend a purchase.
      </div>
    </div>
  );
}

function MarketAreaContextPanel({ context }: { context?: InvestmentIntakeAnalysisResponse["market_area_context"] }) {
  const rows = [
    { label: "Census Geography", value: context?.geography_type && context?.geoid ? `${context.geography_type} ${context.geoid}` : "Market geography unavailable" },
    { label: "ACS Year", value: context?.acs_year ? String(context.acs_year) : "Not loaded" },
    { label: "Population Context", value: context?.population_context?.band || "Insufficient Information" },
    { label: "Household Context", value: context?.household_context?.band || "Insufficient Information" },
    { label: "Household-Income Context", value: context?.income_context?.band || "Insufficient Information" },
    { label: "Housing Occupancy", value: context?.housing_context?.occupancy_band || "Insufficient Information" },
    { label: "Owner/Renter Context", value: context?.housing_context?.tenure_band || "Insufficient Information" },
    { label: "Housing-Unit Context", value: context?.housing_context?.housing_unit_context_band || "Insufficient Information" },
    { label: "Growth Context", value: context?.growth_context?.band || "Insufficient Information" },
    { label: "ACS Data Confidence", value: context?.data_confidence || "Data Needed" },
    { label: "Source / Last Refresh", value: `${context?.source_attribution || "U.S. Census Bureau ACS 5-year estimates."}${context?.last_refreshed ? ` · ${formatDate(context.last_refreshed)}` : ""}` },
  ];
  return (
    <div className="investment-signal-list" id="market-research">
      <p>Market Area Context</p>
      <Matrix rows={rows} />
      <p className="investment-muted">
        {context?.uncertainty_note || "ACS values are area-level estimates and may include sampling uncertainty. They do not represent parcel-level demand, value, or future performance."}
      </p>
    </div>
  );
}

function EnvironmentalPhysicalContextPanel({ context }: { context?: InvestmentIntakeAnalysisResponse["environmental_context"] }) {
  const rows = [
    { label: "Flood Context", value: context?.flood_context || "Data Unavailable" },
    { label: "Mapped Wetland Context", value: context?.mapped_wetland_context || "Data Unavailable" },
    { label: "Terrain / Slope Context", value: context?.terrain_context || "Data Unavailable" },
    { label: "Soil Context", value: context?.soil_context || "Data Unavailable" },
    { label: "EPA Facility Proximity", value: context?.environmental_facility_context || "Data Unavailable" },
    { label: "Usable-Area Screening Proxy", value: context?.usable_area_screening_proxy || "Insufficient Environmental Information" },
    { label: "Environmental Constraint Band", value: context?.overall_environmental_constraint_band || "Insufficient Information" },
    { label: "Environmental Data Confidence", value: context?.environmental_data_confidence || "Data Needed" },
    { label: "Source / Last Refresh", value: `${context?.source_version || "Environmental source extracts pending"}${context?.last_refreshed ? ` - ${formatDate(context.last_refreshed)}` : ""}` },
  ];
  return (
    <div className="investment-signal-list">
      <p>Environmental & Physical Context</p>
      <Matrix rows={rows} />
      <p className="investment-muted">
        Environmental context is screening-level only. It does not replace survey, wetland delineation, engineering, geotechnical, zoning, utility, or environmental review.
      </p>
      <InvestmentSignalList title="Environmental verification requirements" values={(context?.verification_requirements || environmentalDueDiligenceChecklist).slice(0, 6)} />
    </div>
  );
}


function InvestmentCandidateTable({
  activeCandidateId,
  onAddCandidate,
  onOpenCandidate,
  onToggleSignal,
  rows,
  selectedSignalIds,
  strategy,
}: {
  activeCandidateId: string | null;
  onAddCandidate: (signal: EconomicsParcelSignal) => void;
  onOpenCandidate: (signal: EconomicsParcelSignal) => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  rows: RankedLandReviewCandidate[];
  selectedSignalIds: string[];
  strategy: InvestmentStrategyId;
}) {
  if (!rows.length) {
    return <p className="investment-empty">No candidates match this strategy. Choose another strategy or refresh economics data.</p>;
  }
  return (
    <div className="investment-table-wrap">
      <table className="investment-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Parcel ID</th>
            <th>Area</th>
            <th>Strategy Fit</th>
            <th>Readiness Signal</th>
            <th>Basis Context</th>
            <th>Constraint Burden</th>
            <th>Data Confidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 80).map((row) => {
            const selected = selectedSignalIds.includes(row.signal.parcel_id);
            const active = activeCandidateId === row.signal.parcel_id;
            return (
              <tr className={active ? "is-active" : ""} key={row.signal.parcel_id}>
                <td>
                  <button aria-pressed={selected} className="investment-select-button" onClick={() => onToggleSignal(row.signal)} type="button">
                    {selected ? "Selected" : "Select"}
                  </button>
                </td>
                <td><strong>{row.signal.parcel_id}</strong></td>
                <td>{valueText(row.signal.geography_label) || signalLabel(row.signal)}</td>
                <td><span className="investment-chip investment-chip--teal">{row.investment_candidate?.dimension_bands.strategy_fit ?? investmentStrategyLabel(strategy)}</span></td>
                <td><span className="investment-chip">{row.investment_candidate?.candidate_band ?? row.ranking.review_priority_band.replace(" - ", ": ")}</span></td>
                <td>{row.investment_candidate?.dimension_bands.basis_context ?? (row.ranking.supporting_signals.slice(0, 2).join(" | ") || "Screening context needed")}</td>
                <td>{row.investment_candidate?.dimension_bands.constraint_burden ?? (valueText(row.signal.flood_constraint_band) || valueText(row.signal.constraint_burden_band) || "Verify")}</td>
                <td>{row.investment_candidate?.dimension_bands.data_confidence ?? (valueText(row.signal.data_confidence ?? row.signal.economic_data_confidence) || "Verify")}</td>
                <td>
                  <div className="investment-row-actions">
                    <button onClick={() => onOpenCandidate(row.signal)} type="button">Analyze</button>
                    <button onClick={() => onAddCandidate(row.signal)} type="button">Add to Shortlist</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvestmentCandidateRail({
  investmentCandidate,
  onAskCfs,
  onGenerateGuide,
  signal,
  strategy,
}: {
  investmentCandidate?: InvestmentScreenCandidate | null;
  onAskCfs: (signal: EconomicsParcelSignal) => void;
  onGenerateGuide: () => void;
  signal: EconomicsParcelSignal | null;
  strategy: InvestmentStrategyId;
}) {
  if (!signal) {
    return <section className="investment-card investment-rail-card"><p className="investment-empty">Open a candidate to review its screening context.</p></section>;
  }
  const ranking = investmentCandidate ? investmentCandidateRanking(investmentCandidate) : landReviewRanking(signal);
  return (
    <section className="investment-card investment-rail-card">
      <div className="investment-parcel-preview" aria-hidden="true">
        <MapPinned className="h-8 w-8" />
      </div>
      <p className="investment-rail-label">Candidate Review</p>
      <h2>{signal.parcel_id}</h2>
      <p className="investment-muted">{signalLabel(signal)} | {valueText(signal.geography_label) || "Area data needed"}</p>
      <div className="investment-chip-row">
        {["screening-level review", "sewer proximity proxy", "utility-readiness proxy", "due diligence required"].map((chip) => (
          <span className="investment-chip" key={chip}>{chip}</span>
        ))}
      </div>
      <div className="investment-disclaimer">
        Screening-level review only - not investment advice, not an appraisal, and not a guarantee of future value.
      </div>
      <p className="investment-summary">{ranking.review_reason_summary}</p>
      <InvestmentSignalList title="Major positive signals" values={ranking.supporting_signals.slice(0, 4)} />
      <InvestmentSignalList title="Major caution signals" values={ranking.caution_flags.slice(0, 4)} />
      {investmentCandidate ? <InvestmentBasisContextPanel candidate={investmentCandidate} /> : null}
      {investmentCandidate ? <InvestmentCandidateEnvironmentalPanel candidate={investmentCandidate} /> : null}
      <ComparableContextPanel signal={signal} />
      <div className="investment-rail-actions">
        <button className="investment-primary-button" onClick={onGenerateGuide} type="button">Generate Review Guide</button>
        <button className="investment-ghost-button" onClick={() => onAskCfs(signal)} type="button">Ask CFS about this candidate</button>
      </div>
      <p className="investment-muted">Strategy: {investmentStrategyLabel(strategy)}</p>
    </section>
  );
}

function InvestmentSignalList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="investment-signal-list">
      <p>{title}</p>
      <ul>
        {(values.length ? values : ["Verify with planning, utilities, access, title, and site review."]).map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function InvestmentBasisContextPanel({ candidate }: { candidate: InvestmentScreenCandidate }) {
  return (
    <div className="investment-signal-list">
      <p>Basis & Comparable Context</p>
      <Matrix
        rows={[
          { label: "Basis Context", value: candidate.basis_context_band || candidate.dimension_bands.basis_context },
          { label: "Sale Evidence", value: candidate.sale_quality_band || "Not Available" },
          { label: "Sale Recency", value: candidate.sale_recency_band || "No sale information available" },
          { label: "Comparable Depth", value: candidate.comparable_count_band || "No comparable evidence" },
          { label: "Confidence", value: candidate.basis_data_confidence || candidate.comparable_confidence_band || "Low" },
        ]}
      />
      <p className="investment-muted">{candidate.comparable_context_summary || "Basis evaluation requires manual due diligence."}</p>
      <InvestmentSignalList title="Basis positives" values={(candidate.basis_positive_reasons || []).slice(0, 3)} />
      <InvestmentSignalList title="Basis cautions" values={(candidate.basis_caution_reasons || []).slice(0, 3)} />
    </div>
  );
}

function InvestmentCandidateEnvironmentalPanel({ candidate }: { candidate: InvestmentScreenCandidate }) {
  const fields = candidate.safe_display_fields ?? {};
  return (
    <div className="investment-signal-list">
      <p>Environmental Screening Context</p>
      <Matrix
        rows={[
          { label: "Environmental Constraint", value: valueText(fields.environmental_constraint_band) },
          { label: "Mapped Wetland Context", value: valueText(fields.mapped_wetland_context) },
          { label: "Terrain Context", value: valueText(fields.terrain_context) },
          { label: "Soil Context", value: valueText(fields.soil_limitation_band) },
          { label: "Usable-Area Screening Proxy", value: valueText(fields.usable_area_screening_proxy) },
        ]}
      />
      <p className="investment-muted">
        Screening proxy only; verify wetlands, terrain, soils, floodplain, and environmental history with qualified professionals.
      </p>
    </div>
  );
}

function InvestmentComparisonTable({ rows }: { rows: RankedLandReviewCandidate[] }) {
  return (
    <div className="investment-table-wrap">
      <table className="investment-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Review priority</th>
            <th>Basis context</th>
            <th>Sale evidence</th>
            <th>Comparable depth</th>
            <th>Sewer proxy</th>
            <th>Growth pressure</th>
            <th>Comparable context</th>
            <th>Basis cautions</th>
            <th>Constraint flags</th>
            <th>Environmental context</th>
            <th>Usable-area proxy</th>
            <th>Data confidence</th>
            <th>Next checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const context = valuationContext(row.signal);
            const candidate = row.investment_candidate;
            const fields = candidate?.safe_display_fields ?? {};
            return (
              <tr key={row.signal.parcel_id}>
                <td>{signalLabel(row.signal)}</td>
                <td>{row.ranking.review_priority_band}</td>
                <td>{candidate?.basis_context_band || candidate?.dimension_bands.basis_context || context.comparable_context_status}</td>
                <td>{candidate?.sale_quality_band || context.sale_recency_band}</td>
                <td>{candidate?.comparable_count_band || "Manual review"}</td>
                <td>{valueText(row.signal.sewer_proxy_class) || "Verify"}</td>
                <td>{valueText(row.signal.growth_pressure_band) || "Verify"}</td>
                <td>{candidate?.comparable_context_summary || context.comparable_context_status}</td>
                <td>{(candidate?.basis_caution_reasons || context.valuation_due_diligence_flags).slice(0, 2).join(" | ") || "Monitor"}</td>
                <td>{row.ranking.caution_flags.slice(0, 2).join(" | ") || "Monitor"}</td>
                <td>{valueText(fields.environmental_constraint_band)}</td>
                <td>{valueText(fields.usable_area_screening_proxy)}</td>
                <td>{valueText(row.signal.data_confidence ?? row.signal.economic_data_confidence) || "Verify"}</td>
                <td>{row.ranking.recommended_next_checks.slice(0, 2).join(" | ") || "Manual review required"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvestmentGuidePreview({ guide }: { guide: DueDiligencePacket }) {
  return (
    <section className="investment-card">
      <p className="investment-rail-label">Review Guide</p>
      <h2>{guide.title}</h2>
      <p className="investment-muted">{guide.summary}</p>
      <details>
        <summary>Open guide contents</summary>
        <div className="investment-guide-sections">
          {guide.sections.slice(0, 5).map((section) => (
            <div key={section.title}>
              <strong>{section.title}</strong>
              <ul>{section.lines.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function InvestmentBucketPanel({
  items,
  onClear,
  onOpenPrint,
  onRemove,
  onTogglePrint,
  reportBucketMutationsDisabled,
}: {
  items: ReportBucketItem[];
  onClear: () => void;
  onOpenPrint: () => void;
  onRemove: (id: string) => void;
  onTogglePrint: (id: string) => void;
  reportBucketMutationsDisabled: boolean;
}) {
  return (
    <section className="investment-card" id="report-bucket">
      <div className="investment-section-heading">
        <div>
          <p>Report Bucket</p>
          <h2>Saved for reporting</h2>
        </div>
        <span className="investment-pill">{items.length} items</span>
      </div>
      {items.length ? (
        <div className="investment-bucket-list">
          {items.slice(0, 6).map((item) => (
            <div
              data-object-id={item.id}
              data-record-id={item.server_id}
              data-testid="report-bucket-item"
              key={item.id}
            >
              <span>{bucketTypeLabel(item.type)}</span>
              <strong>{item.title}</strong>
              <small>{new Date(item.created_at).toLocaleDateString()}</small>
              <div>
                <label><input checked={item.selected_for_print} disabled={reportBucketMutationsDisabled} onChange={() => onTogglePrint(item.id)} type="checkbox" /> Print</label>
                <button disabled={reportBucketMutationsDisabled} onClick={() => onRemove(item.id)} type="button">Remove</button>
              </div>
            </div>
          ))}
          <button className="investment-primary-button" onClick={onOpenPrint} type="button">View all in Report Bucket</button>
          <button className="investment-ghost-button" disabled={reportBucketMutationsDisabled} onClick={onClear} type="button">Clear bucket</button>
        </div>
      ) : (
        <p className="investment-empty">Save review guides, candidate notes, or chart plans here before printing.</p>
      )}
    </section>
  );
}

function ParcelEconomicContext({
  onClear,
  parcelId,
  signal,
}: {
  onClear: () => void;
  parcelId: string | null;
  signal: EconomicsParcelSignal | null;
}) {
  const estimatedCountyTax =
    signal?.estimated_county_tax_screening ?? signal?.estimated_county_tax;
  const countyRevenuePerAcre =
    signal?.acreage &&
    signal.acreage > 0 &&
    typeof estimatedCountyTax === "number"
      ? estimatedCountyTax / signal.acreage
      : null;

  return (
    <div data-testid="parcel-economic-context">
      <EconPanel
        kicker="Selected parcel"
        title={parcelId ? `Parcel Economic Context: ${parcelId}` : "Parcel Economic Context"}
      >
        {!parcelId ? (
          <p className="text-sm leading-6 text-[var(--econ-muted)]">
            Search for a supported demo parcel to review its screening-level economic context.
          </p>
        ) : signal ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniMetric label="Assessed value context" value={currency(signal.assessed_value)} />
              <MiniMetric label="County revenue per acre" value={currency(countyRevenuePerAcre)} />
              <MiniMetric label="Value per acre" value={currency(signal.value_per_acre)} />
              <MiniMetric
                label="Improvement-to-land"
                value={
                  typeof signal.improvement_to_land_ratio === "number"
                    ? `${signal.improvement_to_land_ratio.toFixed(2)}x`
                    : "Data needed"
                }
              />
              <MiniMetric label="Underbuilt signal" value={titleText(signal.economic_status_band)} />
              <MiniMetric
                label="Constraint-adjusted opportunity"
                value={
                  signal.economic_opportunity_band ??
                  signal.constraint_burden_band ??
                  signal.opportunity_class
                }
              />
              <MiniMetric
                label="Utility confidence"
                value={signal.utility_confidence ? titleText(signal.utility_confidence) : "Data needed"}
              />
              <MiniMetric
                label="Transportation confidence"
                value={signal.transportation_access_band ?? signal.transportation_context ?? "Data needed"}
              />
              <MiniMetric
                label="Flood confidence"
                value={signal.flood_constraint_band ?? signal.floodplain_context ?? "Data needed"}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--econ-muted)]">
              Screening context only. Assessed value is not an appraisal, and estimated county
              revenue is not an official tax bill or fiscal forecast.
            </p>
            <button className="mt-3 text-sm font-semibold text-[var(--econ-gold)]" onClick={onClear} type="button">
              Clear parcel
            </button>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-[var(--econ-muted)]">
              Economic context for {parcelId} is not included in the cached demo extract. Choose
              another supported demo parcel or clear the selection.
            </p>
            <button className="mt-3 text-sm font-semibold text-[var(--econ-gold)]" onClick={onClear} type="button">
              Clear parcel
            </button>
          </>
        )}
      </EconPanel>
    </div>
  );
}

function EconomicDashboardPage({
  intelligence,
  onClearParcel,
  selectedParcelId,
  signals,
  watchlist,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
  onClearParcel: () => void;
  selectedParcelId: string | null;
  signals: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
}) {
  const [selectedSegment, setSelectedSegment] = useState("All");
  const [selectedGeography, setSelectedGeography] = useState("All");
  const [selectedOpportunityClass, setSelectedOpportunityClass] = useState("All");
  const [selectedDataConfidence, setSelectedDataConfidence] = useState("All");
  const [activeDashboardSegment, setActiveDashboardSegment] =
    useState<"pulse" | "land" | "burden" | "confidence">("pulse");
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
  const landOpportunityRows = filteredSignals.filter((signal) =>
    Boolean(signal.development_readiness_band || signal.land_opportunity_class || signal.sewer_proxy_class),
  );
  const readinessBars = countRowsBy(
    landOpportunityRows,
    (signal) => signal.development_readiness_band ?? signal.land_opportunity_class ?? "Data Needed",
  );
  const sewerProxyBars = countRowsBy(
    landOpportunityRows,
    (signal) => signal.sewer_proxy_class ?? "Data Needed",
  );
  const segmentOptions = ["All", ...uniqueValues([...segmentRows.map((row) => row.segment), ...signals.map((signal) => signalSegment(signal))])];
  const geographyOptions = ["All", ...uniqueValues(signals.map((signal) => signal.geography_label).filter(Boolean))];
  const opportunityOptions = ["All", ...uniqueValues(signals.map((signal) => signal.opportunity_class))];
  const confidenceOptions = ["All", ...uniqueValues(signals.map((signal) => signal.economic_data_confidence))];
  const summary = intelligence?.summary;
  const selectedParcelSignal = selectedParcelId
    ? signals.find((signal) => signal.parcel_id === selectedParcelId) ?? null
    : null;
  const resetFilters = () => {
    setSelectedSegment("All");
    setSelectedGeography("All");
    setSelectedOpportunityClass("All");
    setSelectedDataConfidence("All");
  };
  const askCfsFilterContext = {
    economic_segment: selectedSegment,
    geography: selectedGeography,
    opportunity_class: selectedOpportunityClass,
    data_confidence: selectedDataConfidence,
    filtered_signal_count: filteredSignals.length,
    filtered_watchlist_rows: filteredWatchlist.length,
    selected_parcel_id: selectedParcelId,
  };

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
      <ParcelEconomicContext
        onClear={onClearParcel}
        parcelId={selectedParcelId}
        signal={selectedParcelSignal}
      />
      <EconPanel title="Ask CFS Economics" kicker="Ask first" tourId="ask-cfs">
        <AskCfsPanel
          appMode="economics"
          filterContext={askCfsFilterContext}
          visiblePromptCount={6}
        />
      </EconPanel>
      <section className="rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
          Presentation view
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Economic dashboard presentation segments">
          {[
            ["pulse", "Executive Pulse"],
            ["land", "Land Economics"],
            ["burden", "Scenario Burden"],
            ["confidence", "Data Confidence"],
          ].map(([key, label]) => (
            <button
              aria-selected={activeDashboardSegment === key}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                activeDashboardSegment === key
                  ? "border-[var(--econ-gold)]/60 bg-[var(--econ-gold)]/15 text-[#ffe6a6]"
                  : "border-[var(--econ-border)] text-[var(--econ-muted)] hover:border-[var(--econ-gold)]/45 hover:text-[var(--econ-text)]"
              }`}
              key={key}
              onClick={() => setActiveDashboardSegment(key as typeof activeDashboardSegment)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      {activeDashboardSegment === "pulse" ? (
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
          <EconPanel title="Underbuilt Redevelopment Watchlist" kicker="Watchlist">
            <SignalTable signals={filteredWatchlist.slice(0, 5)} />
            <DetailsBlock summary="Show full watchlist" hint={`${filteredWatchlist.length} filtered rows`}>
              <SignalTable signals={filteredWatchlist} />
            </DetailsBlock>
          </EconPanel>
        </div>
      </section>
      ) : null}
      {activeDashboardSegment === "land" ? (
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
      ) : null}
      {activeDashboardSegment === "land" ? (
      <section className="grid gap-4">
        <EconPanel title="Land Opportunity Screener" kicker="Utility + model-ready context">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="Screener rows" value={formatNumber(landOpportunityRows.length)} />
            <MiniMetric label="Sewer proxy classes" value={formatNumber(sewerProxyBars.length)} />
            <MiniMetric label="Capacity status" value="Data needed" />
            <MiniMetric label="Planned extension status" value="Data needed" />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--econ-muted)]">
            Sewer proximity is a screening proxy only; it does not confirm capacity, water service, approval, or future development.
          </p>
        </EconPanel>
        <div className="grid gap-4 xl:grid-cols-2">
          <EconomicsVisualPanel
            description="Counts model-ready parcel rows by screening-level development readiness band."
            recipe="Table: parcel_economic_signal_fact | Visual: Bar chart | Axis: development_readiness_band | Values: Count of signal_id | Slicer: sewer_proxy_class"
            title="Development Readiness Bands"
          >
            <EconomicsBarChart rows={readinessBars} />
          </EconomicsVisualPanel>
          <EconomicsVisualPanel
            description="Shows where opportunity rows align with WSACC sewer-proximity proxy classes."
            recipe="Table: parcel_economic_signal_fact | Visual: Bar chart | Axis: sewer_proxy_class | Values: Count of signal_id | Slicer: development_readiness_band"
            title="Sewer Proxy Context"
          >
            <EconomicsBarChart rows={sewerProxyBars} />
          </EconomicsVisualPanel>
        </div>
        <EconPanel title="Land Opportunity Rows" kicker="Next diligence">
          <SignalTable signals={landOpportunityRows.slice(0, 8)} />
        </EconPanel>
      </section>
      ) : null}
      {activeDashboardSegment === "burden" ? (
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
      </section>
      ) : null}
      {activeDashboardSegment === "confidence" ? (
      <section className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <EconomicsVisualPanel
            description="Shows confidence distribution for the currently filtered parcel signals."
            recipe="Table: parcel_economic_signal_fact | Visual: Donut chart | Legend: data_confidence | Values: Count of signal_id"
            title="Data Confidence Visual"
          >
            <EconomicsDonutChart rows={confidenceBars} />
          </EconomicsVisualPanel>
          <EconPanel title="Data Confidence Summary" kicker="Presentation guardrails">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Filtered rows" value={formatNumber(filteredSignals.length)} />
              <MiniMetric label="Data-needed rows" value={formatNumber(filteredSignals.filter((signal) => signal.economic_data_confidence === "data_needed").length)} />
              <MiniMetric label="Readiness domains" value={formatNumber(intelligence?.data_readiness?.length ?? 0)} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--econ-muted)]">
              Keep this segment visible when discussing gaps: CFS Economics is a screening tool, not an appraisal, tax bill, or approval recommendation.
            </p>
          </EconPanel>
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
      ) : null}
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
  reportBucketMutationsDisabled,
  scenarios,
  selectedSignals,
  showSelectedRowsStep = true,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  embedded?: boolean;
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onToggleReportBucketPrint: (id: string) => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  reportAvailability: PowerBiReportDataAvailability;
  reportBucketItems: ReportBucketItem[];
  reportBucketMutationsDisabled: boolean;
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
            reportBucketMutationsDisabled={reportBucketMutationsDisabled}
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
  reportBucketMutationsDisabled,
  selectedSignals,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "dashboard") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onSetAllReportBucketPrint: (selected: boolean) => void;
  onToggleReportBucketPrint: (id: string) => void;
  reportBucketItems: ReportBucketItem[];
  reportBucketMutationsDisabled: boolean;
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
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" disabled={reportBucketMutationsDisabled} onClick={() => onSetAllReportBucketPrint(true)} type="button">
          Select all bucket items
        </button>
        <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" disabled={reportBucketMutationsDisabled} onClick={() => onSetAllReportBucketPrint(false)} type="button">
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
          reportBucketMutationsDisabled={reportBucketMutationsDisabled}
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
                  {item.due_diligence_packet ? (
                    <DueDiligencePacketPrintDetails packet={item.due_diligence_packet} />
                  ) : item.generated_report ? (
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

function DueDiligencePacketPrintDetails({ packet }: { packet: DueDiligencePacket }) {
  const printSections = [
    "Parcel / Area Summary",
    "Why This Surfaced",
    "Infrastructure / WSACC Context",
    "Economic Context",
    "Constraint Context",
    "Red Flags / Missing Data",
    "Questions to Ask",
    "Recommended Next Checks",
    "Caveats",
  ];
  return (
    <div className="mt-3 grid gap-3">
      {packet.sections
        .filter((section) => printSections.includes(section.title))
        .map((section) => (
          <div className="rounded border border-slate-300 bg-white p-3" key={section.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {section.title}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
              {section.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        ))}
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
  reportBucketMutationsDisabled,
  scenarios,
  selectedOutput,
  selectedSignals,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  onClearReportBucket: () => void;
  onNavigate: (section: "tools" | "print") => void;
  onRemoveReportBucketItem: (id: string) => void;
  onToggleReportBucketPrint: (id: string) => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  reportAvailability: PowerBiReportDataAvailability;
  reportBucketItems: ReportBucketItem[];
  reportBucketMutationsDisabled: boolean;
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
  const starterPackUrl = USE_DEMO_DATA
    ? "/demo-data/powerbi/cfs-powerbi-starter-pack.zip"
    : buildApiUrl("/economics/powerbi-export/starter-pack.zip");
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
              <a
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
                download
                href={starterPackUrl}
                onClick={() =>
                  recordTechnicalEvent("powerbi_export", {
                    format: "starter_pack_zip",
                    runtime_mode: USE_DEMO_DATA ? "demo" : "local",
                  })
                }
              >
                <Download className="h-4 w-4" />
                Download Starter Pack
              </a>
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
              reportBucketMutationsDisabled={reportBucketMutationsDisabled}
            />
            <ReportBucketPanel
              items={reportBucketItems}
              onClear={onClearReportBucket}
              onOpenPrint={() => onNavigate("print")}
              onRemove={onRemoveReportBucketItem}
              onTogglePrint={onToggleReportBucketPrint}
              reportBucketMutationsDisabled={reportBucketMutationsDisabled}
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
              disabled={!decisionPack || reportBucketMutationsDisabled}
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
                disabled={reportBucketMutationsDisabled}
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
                disabled={reportBucketMutationsDisabled}
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
            disabled={reportBucketMutationsDisabled}
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
  const {
    can,
    error: principalError,
    reload: reloadPrincipal,
    requestId: principalRequestId,
    status: principalStatus,
  } = useProductPrincipal();
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
    initialScenarioAssumptions,
  );
  const [activeScenario, setActiveScenario] = useState<EconomicScenarioRecord | null>(null);
  const [analystNotes, setAnalystNotes] = useState("");
  const [compareScenarioId, setCompareScenarioId] = useState("");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [persistenceRequestId, setPersistenceRequestId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<EconomicScenarioRecord[]>([]);
  const [scenarioName, setScenarioName] = useState("Current Conditions");
  const [scenarioDirty, setScenarioDirty] = useState(false);
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const canWriteScenario =
    economicScenarioRepository.provider === "demo" || can("economics:write");
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
  const comparedScenario = savedScenarios.find(
    (scenario) => scenario.id === compareScenarioId,
  );
  const markScenarioDirty = () => {
    setScenarioDirty(true);
    setPersistenceStatus(activeScenario ? "Unsaved changes." : "Unsaved draft.");
  };
  const updateAssumption = (key: keyof ScenarioAssumptions, value: string) => {
    setAssumptions((current) => ({ ...current, [key]: value }));
    markScenarioDirty();
  };
  useEffect(() => {
    onMemoChange(memoText);
  }, [memoText, onMemoChange]);
  useEffect(() => {
    if (economicScenarioRepository.provider === "api" && principalStatus === "loading") {
      const timeout = window.setTimeout(
        () => setPersistenceStatus("Loading saved scenario access..."),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
    if (economicScenarioRepository.provider === "api" && principalStatus === "error") {
      const timeout = window.setTimeout(() => {
        setPersistenceError(principalError ?? "Saved scenario access could not be verified.");
        setPersistenceRequestId(principalRequestId);
        setPersistenceStatus(null);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setPersistenceBusy(true);
      setPersistenceError(null);
      setPersistenceStatus("Loading saved scenarios...");
    });
    void economicScenarioRepository
      .list({ pageSize: 100, signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setPersistenceRequestId(result.requestId);
        const records = [...result.data];
        const total = result.pagination?.total ?? records.length;
        const pageSize = result.pagination?.pageSize ?? 100;
        for (let page = 2; records.length < total; page += 1) {
          const next = await economicScenarioRepository.list({
            page,
            pageSize,
            signal: controller.signal,
          });
          records.push(...next.data);
          setPersistenceRequestId(next.requestId);
          if (!next.data.length) break;
        }
        if (controller.signal.aborted) return;
        records.forEach(scenarioAssumptionsFromRecord);
        setSavedScenarios(records);
        setPersistenceStatus(
          economicScenarioRepository.provider === "demo"
            ? "Saved scenarios remain in this demo session."
            : canWriteScenario
              ? "Saved scenarios loaded from CFS."
              : "Saved scenarios are read-only for your role.",
        );
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const failure = productErrorDetails(caught);
        setPersistenceError(failure.message);
        setPersistenceRequestId(failure.requestId);
        setPersistenceStatus(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPersistenceBusy(false);
      });
    return () => controller.abort();
  }, [
    canWriteScenario,
    libraryAttempt,
    principalError,
    principalRequestId,
    principalStatus,
  ]);

  const openSavedScenario = (record: EconomicScenarioRecord) => {
    let restoredAssumptions: ScenarioAssumptions;
    try {
      restoredAssumptions = scenarioAssumptionsFromRecord(record);
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
      return;
    }
    setActiveScenario(record);
    setAssumptions(restoredAssumptions);
    setAnalystNotes(record.notes ?? "");
    setCompareScenarioId("");
    setComparisonOpen(false);
    setScenarioName(record.name);
    setSelectedSavedId(record.id);
    setScenarioDirty(false);
    setPersistenceError(null);
    setPersistenceStatus(`Opened ${record.name}.`);
  };
  const loadSelectedScenario = () => {
    if (scenarioDirty) {
      setPersistenceError("Save the current changes or start a new draft before opening another scenario.");
      return;
    }
    const record = savedScenarios.find((scenario) => scenario.id === selectedSavedId);
    if (record) openSavedScenario(record);
  };
  const saveScenario = async (asNew: boolean) => {
    if (!canWriteScenario || persistenceBusy) {
      if (!canWriteScenario) setPersistenceError("Your role cannot save Economics scenarios.");
      return;
    }
    const name = scenarioName.trim() || selectedScenario.title;
    const input = {
      assumptions: toJsonObject(assumptions),
      name,
      notes: analystNotes.trim() || null,
      outputs: toJsonObject({
        ...output,
        calculation_schema_version: ECONOMIC_SCENARIO_SCHEMA_VERSION,
      }),
      payload: toJsonObject({
        decision_memo: memo,
        evidence_pack: evidencePack,
        calculation_schema_version: ECONOMIC_SCENARIO_SCHEMA_VERSION,
        scenario_template_id: assumptions.scenarioId,
      }),
      status: "Draft",
    };
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus(asNew || !activeScenario ? "Saving scenario..." : "Saving scenario changes...");
    try {
      let saved: EconomicScenarioRecord;
      if (activeScenario && !asNew) {
        const updated = await economicScenarioRepository.update(
          activeScenario.id,
          input,
          { expectedUpdatedAt: activeScenario.updated_at },
        );
        setPersistenceRequestId(updated.requestId);
        saved = updated.data;
      } else {
        const created = await economicScenarioRepository.create(input);
        saved = created.data;
        setPersistenceRequestId(created.requestId);
      }
      scenarioAssumptionsFromRecord(saved);
      setActiveScenario(saved);
      setSavedScenarios((current) => [
        saved,
        ...current.filter((scenario) => scenario.id !== saved.id),
      ]);
      setScenarioName(saved.name);
      setSelectedSavedId(saved.id);
      setScenarioDirty(false);
      setPersistenceStatus(
        economicScenarioRepository.provider === "demo"
          ? `Saved changes to version ${saved.current_version} in this demo session.`
          : `Saved changes to version ${saved.current_version} in CFS.`,
      );
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };
  const createScenarioVersion = async () => {
    if (!activeScenario || scenarioDirty || !canWriteScenario || persistenceBusy) return;
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus("Creating scenario version...");
    try {
      const result = await economicScenarioRepository.version(
        activeScenario.id,
        "Version created from the CFS Economics scenario workspace.",
      );
      scenarioAssumptionsFromRecord(result.data);
      setActiveScenario(result.data);
      setSavedScenarios((current) => [
        result.data,
        ...current.filter((scenario) => scenario.id !== result.data.id),
      ]);
      setPersistenceRequestId(result.requestId);
      setPersistenceStatus(`Created version ${result.data.current_version}.`);
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };
  const archiveScenario = async () => {
    if (!activeScenario || !canWriteScenario || persistenceBusy || scenarioDirty) {
      if (scenarioDirty) {
        setPersistenceError("Save or reset the current changes before archiving this scenario.");
      }
      return;
    }
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus("Archiving scenario...");
    try {
      const result = await economicScenarioRepository.archive(activeScenario.id);
      setPersistenceRequestId(result.requestId);
      setSavedScenarios((current) =>
        current.filter((scenario) => scenario.id !== activeScenario.id),
      );
      setActiveScenario(null);
      setAnalystNotes("");
      setCompareScenarioId("");
      setComparisonOpen(false);
      setSelectedSavedId("");
      setPersistenceStatus("Scenario archived.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };
  const resetScenario = () => {
    if (persistenceBusy) return;
    setActiveScenario(null);
    setAnalystNotes("");
    setCompareScenarioId("");
    setComparisonOpen(false);
    setAssumptions({ ...initialScenarioAssumptions });
    setScenarioName("Current Conditions");
    setSelectedSavedId("");
    setScenarioDirty(false);
    setPersistenceStatus("Started a new scenario draft.");
  };
  const retryScenarioPersistence = async () => {
    if (principalStatus === "error") {
      reloadPrincipal();
      setLibraryAttempt((current) => current + 1);
      return;
    }
    if (!activeScenario || !scenarioDirty) {
      setLibraryAttempt((current) => current + 1);
      return;
    }
    setPersistenceBusy(true);
    setPersistenceError(null);
    setPersistenceStatus("Loading the latest saved scenario metadata...");
    try {
      const result = await economicScenarioRepository.get(activeScenario.id);
      scenarioAssumptionsFromRecord(result.data);
      setActiveScenario(result.data);
      setSavedScenarios((current) => [
        result.data,
        ...current.filter((scenario) => scenario.id !== result.data.id),
      ]);
      setPersistenceRequestId(result.requestId);
      setPersistenceStatus("Latest record loaded. Review retained edits, then Save changes.");
    } catch (caught) {
      const failure = productErrorDetails(caught);
      setPersistenceError(failure.message);
      setPersistenceRequestId(failure.requestId);
      setPersistenceStatus(null);
    } finally {
      setPersistenceBusy(false);
    }
  };
  return (
    <div className="grid gap-4">
      <section
        className="grid gap-3 rounded-xl border border-[var(--econ-border)] bg-black/20 p-4"
        data-provider={economicScenarioRepository.provider}
        data-testid="economic-scenario-persistence"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--econ-text)]">Saved scenario library</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">
              Save a durable scenario, reopen it, and create an explicit version after later edits.
            </p>
          </div>
          <span
            className="rounded-full border border-[var(--econ-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--econ-muted)]"
            data-scenario-id={activeScenario?.id}
            data-testid="economic-scenario-version"
          >
            {activeScenario ? `Version ${activeScenario.current_version}` : "Unsaved draft"}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--econ-muted)]">
            Scenario name
            <input
              className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
              data-testid="economic-scenario-name"
              disabled={persistenceBusy}
              onChange={(event) => {
                setScenarioName(event.target.value);
                markScenarioDirty();
              }}
              value={scenarioName}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--econ-muted)]">
            Saved scenarios
            <select
              className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
              data-testid="economic-scenario-library"
              disabled={persistenceBusy}
              onChange={(event) => setSelectedSavedId(event.target.value)}
              value={selectedSavedId}
            >
              <option value="">Choose a saved scenario</option>
              {savedScenarios.map((scenario) => (
                <option data-scenario-id={scenario.id} key={scenario.id} value={scenario.id}>
                  {scenario.name} (v{scenario.current_version})
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-[var(--econ-muted)]">
          Analyst notes
          <textarea
            className="min-h-20 rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
            data-testid="economic-scenario-notes"
            disabled={persistenceBusy}
            onChange={(event) => {
              setAnalystNotes(event.target.value);
              markScenarioDirty();
            }}
            placeholder="Document analyst judgment, review context, or next diligence."
            value={analystNotes}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            data-scenario-id={selectedSavedId || undefined}
            data-testid="economic-scenario-load"
            disabled={!selectedSavedId || persistenceBusy || scenarioDirty}
            onClick={loadSelectedScenario}
            title={scenarioDirty ? "Save the current changes or start a new draft first." : undefined}
            type="button"
          >
            Open saved scenario
          </button>
          <button
            className="rounded-lg border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            data-scenario-id={activeScenario?.id}
            data-testid="economic-scenario-save"
            disabled={!canWriteScenario || persistenceBusy}
            onClick={() => void saveScenario(false)}
            type="button"
          >
            {activeScenario ? "Save changes" : "Save scenario"}
          </button>
          <button
            className="rounded-lg border border-[var(--econ-gold)]/50 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            data-scenario-id={activeScenario?.id}
            data-testid="economic-scenario-create-version"
            disabled={
              !activeScenario ||
              scenarioDirty ||
              !canWriteScenario ||
              persistenceBusy
            }
            onClick={() => void createScenarioVersion()}
            type="button"
          >
            Create Version
          </button>
          <button
            className="rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            data-testid="economic-scenario-save-new"
            disabled={!canWriteScenario || persistenceBusy}
            onClick={() => void saveScenario(true)}
            type="button"
          >
            Save as new
          </button>
          <button
            className="rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-risk)] disabled:opacity-50"
            data-scenario-id={activeScenario?.id}
            data-testid="economic-scenario-archive"
            disabled={!activeScenario || !canWriteScenario || persistenceBusy || scenarioDirty}
            onClick={() => void archiveScenario()}
            type="button"
          >
            Archive
          </button>
        </div>
        <div className="grid gap-2 rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-1 text-xs font-semibold text-[var(--econ-muted)]">
            Compare opened scenario with
            <select
              className="rounded-lg border border-[var(--econ-border)] bg-black/30 px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
              data-testid="economic-scenario-compare-library"
              disabled={persistenceBusy}
              onChange={(event) => {
                setCompareScenarioId(event.target.value);
                setComparisonOpen(false);
              }}
              value={compareScenarioId}
            >
              <option value="">Choose a second saved scenario</option>
              {savedScenarios
                .filter((scenario) => scenario.id !== activeScenario?.id)
                .map((scenario) => (
                  <option data-scenario-id={scenario.id} key={scenario.id} value={scenario.id}>
                    {scenario.name} (v{scenario.current_version})
                  </option>
                ))}
            </select>
          </label>
          <button
            className="rounded-lg border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            data-left-scenario-id={activeScenario?.id}
            data-right-scenario-id={comparedScenario?.id}
            data-testid="economic-scenario-compare"
            disabled={!activeScenario || !comparedScenario || persistenceBusy}
            onClick={() => setComparisonOpen(true)}
            type="button"
          >
            Compare
          </button>
        </div>
        {comparisonOpen && activeScenario && comparedScenario ? (
          <ScenarioPersistenceComparison
            left={activeScenario}
            right={comparedScenario}
          />
        ) : null}
        <ProductPersistenceNotice
          error={persistenceError}
          requestId={persistenceRequestId ?? principalRequestId}
          status={persistenceStatus}
          testId="economic-scenario-status"
          onRetry={() => void retryScenarioPersistence()}
        />
      </section>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {scenarioRows.map((scenario) => (
          <button
            className={`rounded-xl border p-3 text-left text-sm transition ${
              assumptions.scenarioId === scenario.id
                ? "border-[var(--econ-gold)] bg-[var(--econ-gold)]/10 text-[#ffe6a6]"
                : "border-[var(--econ-border)] bg-white/[0.025] text-[var(--econ-muted)] hover:border-[var(--econ-gold)]"
            }`}
            disabled={persistenceBusy}
            key={scenario.id}
            onClick={() => {
              setActiveScenario(null);
              setAnalystNotes("");
              setCompareScenarioId("");
              setComparisonOpen(false);
              setSelectedSavedId("");
              setScenarioName(scenario.title);
              setScenarioDirty(true);
              setPersistenceStatus("Unsaved draft.");
              setAssumptions({
                ...initialScenarioAssumptions,
                ...scenarioDefaults[scenario.id],
                scenarioId: scenario.id,
              });
            }}
            type="button"
          >
            <span className="font-semibold">{scenario.title}</span>
          </button>
        ))}
      </div>
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Development type"
            onChange={(value) =>
              {
                setAssumptions((current) => ({
                  ...current,
                  developmentType: value,
                  scenarioId:
                    scenarioRows.find((scenario) => scenario.title === value)?.id ??
                    current.scenarioId,
                }));
                markScenarioDirty();
              }
            }
            options={developmentTypeOptions}
            value={assumptions.developmentType}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Intensity band"
            onChange={(value) => updateAssumption("intensityBand", value)}
            options={basicBandOptions}
            value={assumptions.intensityBand}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Value-per-acre assumption"
            onChange={(value) => updateAssumption("valuePerAcreBand", value)}
            options={basicBandOptions}
            value={assumptions.valuePerAcreBand}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="School / service burden"
            onChange={(value) => updateAssumption("schoolServiceBurden", value)}
            options={burdenBandOptions}
            value={assumptions.schoolServiceBurden}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Utility readiness confidence"
            onChange={(value) => updateAssumption("utilityReadiness", value)}
            options={confidenceBandOptions}
            value={assumptions.utilityReadiness}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Transportation access confidence"
            onChange={(value) => updateAssumption("transportationAccess", value)}
            options={confidenceBandOptions}
            value={assumptions.transportationAccess}
          />
          <ScenarioSelect
            disabled={persistenceBusy}
            label="Flood / environmental constraint"
            onChange={(value) => updateAssumption("floodConstraint", value)}
            options={burdenBandOptions}
            value={assumptions.floodConstraint}
          />
          <button
            className="rounded-lg border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50 sm:col-span-2"
            disabled={persistenceBusy}
            onClick={resetScenario}
            type="button"
          >
            Reset scenario
          </button>
        </div>
        <div data-testid="scenario-output">
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

const savedScenarioComparisonFields = [
  ["assumptions", "developmentType", "Development type"],
  ["assumptions", "intensityBand", "Intensity band"],
  ["assumptions", "valuePerAcreBand", "Value per acre"],
  ["assumptions", "schoolServiceBurden", "School / service burden"],
  ["assumptions", "utilityReadiness", "Utility readiness"],
  ["assumptions", "transportationAccess", "Transportation access"],
  ["assumptions", "floodConstraint", "Flood constraint"],
  ["outputs", "fiscalAttractiveness", "Fiscal attractiveness"],
  ["outputs", "taxBaseLift", "Tax-base lift"],
  ["outputs", "infrastructureBurden", "Infrastructure burden"],
  ["outputs", "dataConfidence", "Data confidence"],
] as const;

function ScenarioPersistenceComparison({
  left,
  right,
}: {
  left: EconomicScenarioRecord;
  right: EconomicScenarioRecord;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-[var(--econ-border)] bg-black/20 p-3"
      data-left-scenario-id={left.id}
      data-right-scenario-id={right.id}
      data-testid="economic-scenario-comparison"
    >
      <table className="w-full min-w-[640px] text-left text-xs">
        <caption className="mb-2 text-left font-semibold text-[var(--econ-text)]">
          {left.name} (v{left.current_version}) compared with {right.name} (v{right.current_version})
        </caption>
        <thead className="uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-2 py-2">Measure</th>
            <th className="px-2 py-2">{left.name}</th>
            <th className="px-2 py-2">{right.name}</th>
            <th className="px-2 py-2">Delta summary</th>
          </tr>
        </thead>
        <tbody>
          {savedScenarioComparisonFields.map(([group, key, label]) => {
            const leftValue = scenarioRecordValue(left, group, key);
            const rightValue = scenarioRecordValue(right, group, key);
            return (
              <tr key={`${group}-${key}`}>
                <th className="border-t border-[var(--econ-border)] px-2 py-2 font-semibold text-[var(--econ-text)]">
                  {label}
                </th>
                <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{leftValue}</td>
                <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{rightValue}</td>
                <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">
                  {leftValue === rightValue ? "Same" : `${leftValue} -> ${rightValue}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function scenarioRecordValue(
  record: EconomicScenarioRecord,
  group: "assumptions" | "outputs",
  key: string,
) {
  const value = record[group][key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "Not recorded";
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
  reportBucketMutationsDisabled,
  signals,
}: {
  askPowerBiAction?: PowerBiAskActionRequest | null;
  availability: PowerBiReportDataAvailability;
  dataReadiness: EconomicsReadinessRow[];
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  onNavigate: (section: "print") => void;
  outputs: EconomicsScenarioOutput[];
  payload: EconomicsPowerBiExportResponse | null;
  reportBucketMutationsDisabled: boolean;
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
  const applyAskPlan = () => {
    if (!askPowerBiAction?.actions || askPowerBiAction.actions.action_type === "none") return;
    const generated = powerBiActionsToGeneratedPlan(askPowerBiAction.actions, payload, availability);
    setPrompt(generated.generated_from_prompt);
    setPlan(generated);
    setStatus("AI plan applied to the report builder");
  };
  const generateReport = () => {
    setPlan(buildPowerBiReportPlan(prompt, payload, availability));
    setStatus("Report preview generated");
  };
  const saveReport = async () => {
    if (!report) return;
    if (await onAddReportBucketItem(generatedReportBucketItem(report))) {
      setStatus("Generated report saved to Report Bucket");
    }
  };
  const sendReportToPrint = async () => {
    await saveReport();
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
              key={item.label}
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
          {askPowerBiAction?.actions && askPowerBiAction.actions.action_type !== "none" ? (
            <button
              className="rounded-xl border border-[var(--econ-green)]/45 bg-[var(--econ-green)]/10 px-4 py-2 text-sm font-semibold text-[var(--econ-green)] transition hover:border-[var(--econ-green)]"
              onClick={applyAskPlan}
              type="button"
            >
              Apply AI Plan
            </button>
          ) : null}
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
              <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]" disabled={reportBucketMutationsDisabled} onClick={saveReport} type="button">
                Save Report to Bucket
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" disabled={reportBucketMutationsDisabled} onClick={sendReportToPrint} type="button">
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
                  disabled={reportBucketMutationsDisabled}
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
                  disabled={reportBucketMutationsDisabled}
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

function LandDueDiligenceScreener({
  mode = "tools",
  onAddReportBucketItem,
  onAskCfs,
  onClearSelection,
  onNavigate,
  onToggleSignal,
  selectedSignalIds,
  signals,
  reportBucketMutationsDisabled,
}: {
  mode?: "investment" | "tools";
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  onAskCfs?: (signal: EconomicsParcelSignal) => void;
  onClearSelection: () => void;
  onNavigate: (section: "print") => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  selectedSignalIds: string[];
  signals: EconomicsParcelSignal[];
  reportBucketMutationsDisabled: boolean;
}) {
  const investmentMode = mode === "investment";
  const guideNoun = investmentMode ? "Guide" : "Packet";
  const rows = useMemo(() => landDueDiligenceRows(signals), [signals]);
  const [readiness, setReadiness] = useState("Priority candidates");
  const [landClass, setLandClass] = useState("All");
  const [sewerClass, setSewerClass] = useState("All");
  const [utilityClass, setUtilityClass] = useState("All");
  const [growthBand, setGrowthBand] = useState("All");
  const [acreageBand, setAcreageBand] = useState("All");
  const [floodBand, setFloodBand] = useState("All");
  const [economicBand, setEconomicBand] = useState("All");
  const [confidence, setConfidence] = useState("All");
  const [flag, setFlag] = useState("All");
  const [geography, setGeography] = useState("All");
  const [preset, setPreset] = useState("All");
  const [packet, setPacket] = useState<DueDiligencePacket | null>(null);
  const [packetStatus, setPacketStatus] = useState<string | null>(null);
  const [comparisonRows, setComparisonRows] = useState<RankedLandReviewCandidate[]>([]);
  const resetFilters = () => {
    setReadiness("Priority candidates");
    setLandClass("All");
    setSewerClass("All");
    setUtilityClass("All");
    setGrowthBand("All");
    setAcreageBand("All");
    setFloodBand("All");
    setEconomicBand("All");
    setConfidence("All");
    setFlag("All");
    setGeography("All");
    setPreset("All");
  };
  const filteredRows = rows.filter((signal) => {
    const matchesReadiness =
      readiness === "All" ||
      (readiness === "Priority candidates"
        ? landDueDiligencePriorityBands.includes(valueText(signal.development_readiness_band))
        : valueText(signal.development_readiness_band) === readiness);
    return (
      matchesReadiness &&
      matchesFilter(signal.land_opportunity_class, landClass) &&
      matchesFilter(signal.sewer_proxy_class, sewerClass) &&
      matchesFilter(signal.utility_readiness_proxy_class, utilityClass) &&
      matchesFilter(signal.growth_pressure_band, growthBand) &&
      matchesFilter(acreageBandForSignal(signal), acreageBand) &&
      matchesFilter(signal.flood_constraint_band, floodBand) &&
      matchesFilter(signal.economic_opportunity_band, economicBand) &&
      matchesFilter(signal.data_confidence ?? signal.economic_data_confidence, confidence) &&
      matchesArrayFilter(signal.due_diligence_flags, flag) &&
      matchesFilter(signal.sewer_basin_label ?? signal.geography_label, geography) &&
      matchesLandReviewPreset(signal, preset)
    );
  });
  const rankedRows = filteredRows
    .map((signal) => ({ ranking: landReviewRanking(signal), signal }))
    .sort((left, right) => right.ranking.sort_value - left.ranking.sort_value || signalLabel(left.signal).localeCompare(signalLabel(right.signal)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const selectedRankedRows = rankedRows.filter((row) => selectedSignalIds.includes(row.signal.parcel_id));
  const selectedRows = selectedRankedRows.map((row) => row.signal);
  const activeReviewSignal = selectedRows[0] ?? rankedRows[0]?.signal ?? rows[0] ?? null;
  const addPacketToBucket = async (nextPacket = packet) => {
    if (!nextPacket) return false;
    const saved = await onAddReportBucketItem(dueDiligencePacketBucketItem(nextPacket));
    if (saved) setPacketStatus("Added packet to Report Bucket");
    return saved;
  };
  const generateSinglePacket = () => {
    if (!activeReviewSignal) return;
    const nextPacket = singleParcelDueDiligencePacket(activeReviewSignal);
    setPacket(nextPacket);
    setPacketStatus(investmentMode ? "Parcel review guide generated" : "Parcel due diligence packet generated");
  };
  const generateWatchlistPacket = () => {
    if (!selectedRows.length) return;
    const nextPacket = watchlistDueDiligencePacket(selectedRows);
    setPacket(nextPacket);
    setPacketStatus(investmentMode ? "Watchlist review guide generated" : "Watchlist due diligence packet generated");
  };
  const createTop25Packet = async () => {
    const topRows = rankedRows.slice(0, 25);
    if (!topRows.length) return;
    const nextPacket = topLandReviewWatchlistPacket(topRows);
    setPacket(nextPacket);
    if (await addPacketToBucket(nextPacket)) {
      setPacketStatus(investmentMode ? "Top 25 review guide created and added to Report Bucket" : "Top 25 review watchlist created and added to Report Bucket");
    }
  };
  const compareSelectedCandidates = () => {
    if (selectedRankedRows.length < 2 || selectedRankedRows.length > 5) return;
    setComparisonRows(selectedRankedRows.slice(0, 5));
    setPacket(candidateComparisonPacket(selectedRankedRows.slice(0, 5)));
    setPacketStatus("Selected candidate comparison generated");
  };
  const sendPacketToPrint = async () => {
    if (packet && !(await addPacketToBucket(packet))) return;
    onNavigate("print");
  };
  const copyPacket = (label: string, text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(
        () => setPacketStatus(`${label} copied`),
        () => {
          if (fallbackCopyText(text)) setPacketStatus(`${label} copied`);
        },
      );
    } else if (fallbackCopyText(text)) {
      setPacketStatus(`${label} copied`);
    }
  };

  return (
    <EconPanel
      description={investmentMode ? "Live candidate table for private manual review, comparison, and due diligence guide creation." : "Build a parcel watchlist for manual planning, utility, site, and economics review."}
      kicker={investmentMode ? "CFS Investments research" : "Internal screening"}
      title={investmentMode ? "Ranked Candidate Table" : "Land Due Diligence Screener"}
      tourId="land-due-diligence-screener"
    >
      <div className="rounded-xl border border-[var(--econ-gold)]/30 bg-[var(--econ-gold)]/[0.08] px-3 py-2 text-sm leading-6 text-[#f7dc93]">
        {landDueDiligenceSafeUseText}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5" data-econ-tour="land-due-diligence-steps">
        {(investmentMode ? ["Filter", "Select", "Review", "Generate Guide", "Optional Print"] : ["Filter", "Select", "Review", "Generate Packet", "Print"]).map((step, index) => (
          <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2 text-xs font-semibold text-[var(--econ-text)]" key={step}>
            <span className="mr-2 text-[var(--econ-gold)]">{index + 1}</span>{step}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-black/20 p-4">
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
            Model status
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <MiniMetric label="Current-best predictive variant" value="transportation_plus_tax_value_only" />
            <MiniMetric label="Utility proxy status" value="Due diligence layer" />
            <MiniMetric label="Use" value="Review candidate screening" />
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--econ-muted)]">
            WSACC utility proxy was not selected in the current-best predictive
            model. It remains useful for sewer-proximity review, capacity
            follow-up, and development-readiness screening.
          </p>
        </details>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Candidate rows" value={formatNumber(filteredRows.length)} />
        <MiniMetric label="Selected for review" value={formatNumber(selectedRows.length)} />
        <MiniMetric label="Sewer proxy classes" value={formatNumber(uniqueValues(filteredRows.map((row) => row.sewer_proxy_class)).length)} />
        <MiniMetric label="Data confidence bands" value={formatNumber(uniqueValues(filteredRows.map((row) => row.data_confidence ?? row.economic_data_confidence)).length)} />
      </div>
      <TopLandReviewCandidatesPanel
        comparisonRows={comparisonRows}
        onCompareSelected={compareSelectedCandidates}
        onCreateTop25={createTop25Packet}
        onSetPreset={setPreset}
        preset={preset}
        rankedRows={rankedRows}
        selectedCount={selectedRankedRows.length}
        reportBucketMutationsDisabled={reportBucketMutationsDisabled}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-econ-tour="land-due-diligence-primary-filters">
        <ScenarioSelect label="Development-readiness" onChange={setReadiness} options={["Priority candidates", "All", ...uniqueValues(rows.map((row) => row.development_readiness_band))]} value={readiness} />
        <ScenarioSelect label="Land opportunity class" onChange={setLandClass} options={["All", ...uniqueValues(rows.map((row) => row.land_opportunity_class))]} value={landClass} />
        <ScenarioSelect label="Sewer proxy class" onChange={setSewerClass} options={["All", ...uniqueValues(rows.map((row) => row.sewer_proxy_class))]} value={sewerClass} />
        <ScenarioSelect label="Growth pressure" onChange={setGrowthBand} options={["All", ...uniqueValues(rows.map((row) => row.growth_pressure_band))]} value={growthBand} />
        <ScenarioSelect label="Data confidence" onChange={setConfidence} options={["All", ...uniqueValues(rows.map((row) => row.data_confidence ?? row.economic_data_confidence))]} value={confidence} />
        <button
          className="self-end rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={resetFilters}
          type="button"
        >
          Reset filters
        </button>
      </div>
      <details className="mt-3 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3" data-econ-tour="land-due-diligence-advanced-filters">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--econ-text)]">Show advanced filters</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ScenarioSelect label="Utility proxy class" onChange={setUtilityClass} options={["All", ...uniqueValues(rows.map((row) => row.utility_readiness_proxy_class))]} value={utilityClass} />
          <ScenarioSelect label="Acreage band" onChange={setAcreageBand} options={["All", ...uniqueValues(rows.map(acreageBandForSignal))]} value={acreageBand} />
          <ScenarioSelect label="Flood constraint" onChange={setFloodBand} options={["All", ...uniqueValues(rows.map((row) => row.flood_constraint_band))]} value={floodBand} />
          <ScenarioSelect label="Economic opportunity" onChange={setEconomicBand} options={["All", ...uniqueValues(rows.map((row) => row.economic_opportunity_band))]} value={economicBand} />
          <ScenarioSelect label="Due diligence flag" onChange={setFlag} options={["All", ...uniqueValues(rows.flatMap((row) => signalListValues(row.due_diligence_flags)))]} value={flag} />
          <ScenarioSelect label="Geography / subbasin" onChange={setGeography} options={["All", ...uniqueValues(rows.map((row) => row.sewer_basin_label ?? row.geography_label))]} value={geography} />
        </div>
      </details>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[var(--econ-text)]">Land Review Watchlist</h3>
              <p className="mt-1 text-xs text-[var(--econ-muted)]">Select rows to save to the Report Bucket or Print snapshot.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!selectedRows.length} onClick={generateWatchlistPacket} type="button">
                {investmentMode ? "Generate Review Guide" : "Generate Watchlist Packet"}
              </button>
              <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!selectedRows.length} onClick={onClearSelection} type="button">
                Clear selection
              </button>
            </div>
          </div>
          <LandDueDiligenceTable
            onToggleSignal={onToggleSignal}
            rows={rankedRows}
            selectedSignalIds={selectedSignalIds}
          />
      </div>
      <ParcelDueDiligenceCard
          onAskCfs={onAskCfs}
          onGeneratePacket={generateSinglePacket}
          primaryActionLabel={investmentMode ? "Generate Review Guide" : "Generate Due Diligence Packet"}
          signal={activeReviewSignal}
        />
      </div>
      <DueDiligencePacketPreview
        noun={guideNoun}
        onAddToBucket={() => addPacketToBucket()}
        onCopyQuestions={() => packet ? copyPacket("Questions to ask", packet.questions_to_ask.map((item) => `- ${item}`).join("\n")) : undefined}
        onCopySummary={() => packet ? copyPacket(`${guideNoun} summary`, dueDiligencePacketSummaryText(packet)) : undefined}
        onDownload={() => packet ? downloadJson(packet, `${slugifyReportTitle(packet.title)}.json`) : undefined}
        onSendToPrint={sendPacketToPrint}
        packet={packet}
        reportBucketMutationsDisabled={reportBucketMutationsDisabled}
        status={packetStatus}
      />
    </EconPanel>
  );
}

function LandDueDiligenceTable({
  onToggleSignal,
  rows,
  selectedSignalIds,
}: {
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  rows: RankedLandReviewCandidate[];
  selectedSignalIds: string[];
}) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-[var(--econ-border)] px-3 py-4 text-sm text-[var(--econ-muted)]">No rows match the current due diligence filters.</p>;
  }
  return (
    <div className="max-h-[34rem] overflow-auto rounded-xl border border-[var(--econ-border)]">
      <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#171a20] text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">Select</th>
            <th className="px-3 py-2">Parcel / area label</th>
            <th className="px-3 py-2">Review priority</th>
            <th className="px-3 py-2">Why surfaced</th>
            <th className="px-3 py-2">Land opportunity</th>
            <th className="px-3 py-2">Sewer proxy</th>
            <th className="px-3 py-2">Growth pressure</th>
            <th className="px-3 py-2">Caution flags</th>
            <th className="px-3 py-2">Next checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 80).map((row) => {
            const { signal, ranking } = row;
            const selected = selectedSignalIds.includes(signal.parcel_id);
            return (
              <tr className={`transition hover:bg-white/[0.045] ${selected ? "bg-[var(--econ-gold)]/10" : ""}`} key={signal.parcel_id}>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-gold)]">{row.rank}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2">
                  <input
                    aria-label={`Select ${signalLabel(signal)}`}
                    checked={selected}
                    onChange={() => onToggleSignal(signal)}
                    type="checkbox"
                  />
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-text)]">
                  {signalLabel(signal)}
                  <details className="mt-1 text-[11px] font-normal text-[var(--econ-muted)]">
                    <summary className="cursor-pointer">Details</summary>
                    <div className="mt-1 grid gap-1">
                      <span>Geography: {signal.geography_label ?? "Data Needed"}</span>
                      <span>Acreage: {acreageBandForSignal(signal)}</span>
                      <span>Flood: {valueText(signal.flood_constraint_band) || "Data Needed"}</span>
                      <span>Economic opportunity: {valueText(signal.economic_opportunity_band) || "Data Needed"}</span>
                      <span>Confidence: {valueText(signal.data_confidence ?? signal.economic_data_confidence) || "Data Needed"}</span>
                    </div>
                  </details>
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-text)]">{ranking.review_priority_band}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{ranking.review_reason_summary}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{valueText(signal.land_opportunity_class) || "Data Needed"}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{valueText(signal.sewer_proxy_class) || "Data Needed"}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{valueText(signal.growth_pressure_band) || "Data Needed"}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{ranking.caution_flags.slice(0, 3).join("; ") || "Monitor"}</td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">{ranking.recommended_next_checks.slice(0, 3).join("; ") || signal.recommended_followup}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopLandReviewCandidatesPanel({
  comparisonRows,
  onCompareSelected,
  onCreateTop25,
  onSetPreset,
  preset,
  rankedRows,
  selectedCount,
  reportBucketMutationsDisabled,
}: {
  comparisonRows: RankedLandReviewCandidate[];
  onCompareSelected: () => void;
  onCreateTop25: () => void;
  onSetPreset: (preset: string) => void;
  preset: string;
  rankedRows: RankedLandReviewCandidate[];
  selectedCount: number;
  reportBucketMutationsDisabled: boolean;
}) {
  const tierCounts = countRowsBy(rankedRows, (row) => row.ranking.review_priority_band).slice(0, 6);
  const topRows = rankedRows.slice(0, 5);
  return (
    <div className="mt-5 rounded-2xl border border-[var(--econ-gold)]/35 bg-[var(--econ-gold)]/5 p-4" data-econ-tour="land-top-candidates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-gold)]">Top Land Review Candidates</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--econ-text)]">Screening-level candidate ranking</h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--econ-muted)]">
            Ranks parcels for manual review using growth pressure, sewer-proximity proxy, economics, constraints, and due diligence flags.
          </p>
          <p className="mt-2 text-xs text-[#ffe6a6]">
            CFS ranks candidates for manual review only. It does not provide financial or buy/sell guidance or future-value assurances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!rankedRows.length || reportBucketMutationsDisabled} onClick={onCreateTop25} type="button">
            Create Top 25 Review Watchlist
          </button>
          <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={selectedCount < 2 || selectedCount > 5} onClick={onCompareSelected} type="button">
            Compare Selected Candidates
          </button>
        </div>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Strategy Presets</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {landReviewPresetLabels.map((label) => (
          <button
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${preset === label ? "border-[var(--econ-gold)] bg-[var(--econ-gold)]/15 text-[#ffe6a6]" : "border-[var(--econ-border)] text-[var(--econ-muted)] hover:border-[var(--econ-gold)] hover:text-[var(--econ-text)]"}`}
            key={label}
            onClick={() => onSetPreset(label)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Visible candidates" value={formatNumber(rankedRows.length)} />
        <MiniMetric label="Tier 1 / Tier 2" value={formatNumber(rankedRows.filter((row) => row.ranking.review_priority_band.startsWith("Tier 1") || row.ranking.review_priority_band.startsWith("Tier 2")).length)} />
        <MiniMetric label="Data / constraint-limited" value={formatNumber(rankedRows.filter((row) => row.ranking.review_priority_band.includes("Data") || row.ranking.review_priority_band.includes("Constraint")).length)} />
        <MiniMetric label="Special review" value={formatNumber(rankedRows.filter((row) => row.ranking.review_priority_band.startsWith("Special")).length)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Priority mix</p>
          <div className="mt-2 grid gap-2">
            {tierCounts.map((row) => (
              <div className="flex items-center justify-between gap-3 text-xs" key={row.label}>
                <span className="text-[var(--econ-muted)]">{row.label}</span>
                <span className="font-semibold text-[var(--econ-text)]">{formatNumber(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Top visible rows</p>
          <div className="mt-2 grid gap-2">
            {topRows.map((row) => (
              <div className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-2 text-xs" key={row.signal.parcel_id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-[var(--econ-text)]">#{row.rank} {signalLabel(row.signal)}</span>
                  <span className="text-[var(--econ-gold)]">{row.ranking.review_priority_band.replace(" - ", ": ")}</span>
                </div>
                <p className="mt-1 text-[var(--econ-muted)]">{row.ranking.review_reason_summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {comparisonRows.length >= 2 ? (
        <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Comparison for manual due diligence prioritization</p>
          <div className="mt-2 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
                <tr>
                  <th className="px-2 py-2">Candidate</th>
                  <th className="px-2 py-2">Priority</th>
                  <th className="px-2 py-2">Sewer proxy</th>
                  <th className="px-2 py-2">Growth</th>
                  <th className="px-2 py-2">Value / acre</th>
                  <th className="px-2 py-2">Improvement ratio</th>
                  <th className="px-2 py-2">Assessed value</th>
                  <th className="px-2 py-2">Comparison group</th>
                  <th className="px-2 py-2">Comparable status</th>
                  <th className="px-2 py-2">Valuation flags</th>
                  <th className="px-2 py-2">Cautions</th>
                  <th className="px-2 py-2">Next checks</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => {
                  const context = valuationContext(row.signal);
                  return (
                    <tr key={row.signal.parcel_id}>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 font-semibold text-[var(--econ-text)]">{signalLabel(row.signal)}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{row.ranking.review_priority_band}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{valueText(row.signal.sewer_proxy_class) || "Data Needed"}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{valueText(row.signal.growth_pressure_band) || "Data Needed"}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.value_per_acre_band}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.improvement_to_land_ratio_band}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.assessed_value_band}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.comparison_group}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.comparable_context_status}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{context.valuation_due_diligence_flags.slice(0, 3).join("; ")}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{row.ranking.caution_flags.slice(0, 3).join("; ") || "Monitor"}</td>
                      <td className="border-t border-[var(--econ-border)] px-2 py-2 text-[var(--econ-muted)]">{row.ranking.recommended_next_checks.slice(0, 3).join("; ") || "Verify planning and utility context."}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParcelDueDiligenceCard({
  onAskCfs,
  onGeneratePacket,
  primaryActionLabel = "Generate Due Diligence Packet",
  signal,
}: {
  onAskCfs?: (signal: EconomicsParcelSignal) => void;
  onGeneratePacket: () => void;
  primaryActionLabel?: string;
  signal: EconomicsParcelSignal | null;
}) {
  if (!signal) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--econ-border)] p-4 text-sm text-[var(--econ-muted)]">
        Select a watchlist row to open a parcel due diligence card.
      </div>
    );
  }
  const flags = dueDiligenceRedFlags(signal);
  const nextChecks = dueDiligenceNextChecks(signal);
  const ranking = landReviewRanking(signal);
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-gold)]">Parcel Due Diligence Card</p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--econ-text)]">{signalLabel(signal)}</h3>
          <p className="mt-1 text-xs text-[var(--econ-muted)]">{signal.geography_label ?? "Geography data needed"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onAskCfs ? (
            <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]" onClick={() => onAskCfs(signal)} type="button">
              Ask CFS about this candidate
            </button>
          ) : null}
          <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]" onClick={onGeneratePacket} type="button">
            {primaryActionLabel}
          </button>
        </div>
      </div>
      <Matrix
        rows={[
          { label: "Review priority", value: ranking.review_priority_band },
          { label: "Why this candidate ranked here", value: ranking.review_reason_summary },
          { label: "Supporting signals / What supports the signal", value: ranking.supporting_signals.slice(0, 5).join("; ") || "Data needed" },
          { label: "Caution flags / What could be a problem", value: flags.slice(0, 4).join("; ") || "Monitor" },
          { label: "What to verify next", value: nextChecks.slice(0, 4).join("; ") || "Verify planning, utilities, access, and constraints." },
          { label: "Why CFS is not making a buy recommendation", value: "CFS is ranking records for manual review only. Verify planning, utility, legal, access, and site facts before any outside decision." },
        ]}
      />
      <ComparableContextPanel signal={signal} />
      <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Due diligence checklist</p>
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--econ-muted)] sm:grid-cols-2">
          {landDueDiligenceChecklist.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      </div>
    </div>
  );
}

function ComparableContextPanel({ signal }: { signal: EconomicsParcelSignal }) {
  const context = valuationContext(signal);
  return (
    <div className="mt-4 rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">Comparable Context</p>
      <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">
        CFS provides assessed-value and value-per-acre screening context. CFS is not an appraisal; confirm market value with comparable sales, broker/appraiser review, and public records.
      </p>
      <Matrix
        rows={[
          { label: "Value-per-acre band", value: context.value_per_acre_band },
          { label: "Comparison group", value: context.comparison_group },
          { label: "Group context", value: context.comparable_context_status },
          { label: "Assessed value context", value: context.assessed_value_band },
          { label: "Land value context", value: context.land_value_band },
          { label: "Improvement value context", value: context.improvement_value_band },
          { label: "Land/improvement ratio", value: context.improvement_to_land_ratio_band },
          { label: "Sale recency", value: context.sale_recency_band },
          { label: "Sale price", value: context.sale_price_band },
          { label: "Valuation due diligence flags", value: context.valuation_due_diligence_flags.join("; ") },
        ]}
      />
    </div>
  );
}

function DueDiligencePacketPreview({
  noun = "Packet",
  onAddToBucket,
  onCopyQuestions,
  onCopySummary,
  onDownload,
  onSendToPrint,
  packet,
  reportBucketMutationsDisabled,
  status,
}: {
  noun?: "Guide" | "Packet";
  onAddToBucket: () => void;
  onCopyQuestions: () => void;
  onCopySummary: () => void;
  onDownload: () => void;
  onSendToPrint: () => void;
  packet: DueDiligencePacket | null;
  reportBucketMutationsDisabled: boolean;
  status: string | null;
}) {
  return (
    <section className="mt-5 rounded-xl border border-[var(--econ-border)] bg-black/20 p-4" data-econ-tour="due-diligence-packet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--econ-gold)]">Due Diligence {noun} Preview</p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--econ-text)]">{packet?.title ?? `Generate a ${noun.toLowerCase()} from selected rows`}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--econ-muted)]">
            {packet?.summary ?? `Select a watchlist row for a parcel ${noun.toLowerCase()}, or select multiple rows for a watchlist ${noun.toLowerCase()}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!packet || reportBucketMutationsDisabled} onClick={onAddToBucket} type="button">
            Add {noun} to Report Bucket
          </button>
          <button className="rounded-xl border border-[var(--econ-gold)]/50 bg-[var(--econ-gold)]/10 px-3 py-2 text-xs font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!packet || reportBucketMutationsDisabled} onClick={onSendToPrint} type="button">
            Send {noun} to Print
          </button>
          <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!packet} onClick={onCopySummary} type="button">
            Copy {noun} Summary
          </button>
          <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!packet} onClick={onCopyQuestions} type="button">
            Copy Questions to Ask
          </button>
          <button className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50" disabled={!packet} onClick={onDownload} type="button">
            Download JSON
          </button>
        </div>
      </div>
      {status ? <p className="mt-3 text-xs font-semibold text-[var(--econ-green)]">{status}</p> : null}
      {packet ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {packet.sections.map((section) => (
            <details className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3" key={section.title} open={section.title === "Why This Surfaced"}>
              <summary className="cursor-pointer text-sm font-semibold text-[var(--econ-text)]">{section.title}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--econ-muted)]">
                {section.lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PowerBiChartBuilder({
  aiAction,
  availability,
  onAddReportBucketItem,
  payload,
  reportBucketMutationsDisabled,
}: {
  aiAction?: PowerBiAskActionRequest | null;
  availability: PowerBiReportDataAvailability;
  onAddReportBucketItem: (item: ReportBucketItemInput) => Promise<boolean>;
  payload: EconomicsPowerBiExportResponse | null;
  reportBucketMutationsDisabled: boolean;
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
  const addChartToBucket = async () => {
    const saved = await onAddReportBucketItem({
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
    if (saved) setCopyStatus("Added to Report Bucket");
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
  const addGeneratedPlanToBucket = async (plan: PowerBiGeneratedReportPlan) => {
    if (await onAddReportBucketItem(bucketItemFromGeneratedPlan(plan))) {
      setCopyStatus("Added to Report Bucket");
    }
  };
  const addGeneratedVisualToBucket = async (visual: PowerBiGeneratedVisual) => {
    const saved = await onAddReportBucketItem({
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
    if (saved) setCopyStatus("Added to Report Bucket");
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
                        disabled={reportBucketMutationsDisabled}
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
                  disabled={reportBucketMutationsDisabled}
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
	            disabled={reportBucketMutationsDisabled}
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
	              disabled={!canvasItems.length || reportBucketMutationsDisabled}
	              onClick={async () => {
	                const saved = await onAddReportBucketItem({
	                  content: canvasRecipe,
	                  id: `report-canvas-${slugifyReportTitle(canvasRecipe)}`,
	                  powerbi_recipe: canvasRecipe,
	                  related_tables: uniquePowerBiTables(canvasItems.map((item) => item.tableName)),
	                  source_page: "Power BI & Tools",
	                  summary: `${canvasItems.length} report canvas visual recipes.`,
	                  title: "Power BI Report Canvas Recipe",
	                  type: "powerbi_recipe",
	                });
	                if (saved) setCopyStatus("Added to Report Bucket");
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
  disabled,
  onSave,
  visual,
}: {
  disabled: boolean;
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
          disabled={disabled}
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
  disabled,
  onSave,
  table,
}: {
  disabled: boolean;
  onSave: () => void;
  table: GeneratedReportTablePreview;
}) {
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--econ-text)]">{table.title}</h4>
        <button
          className="rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          disabled={disabled}
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
  disabled,
  onAddBucket,
  onCopy,
}: {
  disabled: boolean;
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
          disabled={disabled}
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
  reportBucketMutationsDisabled,
  title,
}: {
  items: ReportBucketItem[];
  onClear: () => void;
  onOpenPrint?: () => void;
  onRemove: (id: string) => void;
  onTogglePrint: (id: string) => void;
  reportBucketMutationsDisabled: boolean;
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
              disabled={reportBucketMutationsDisabled}
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
                data-object-id={item.id}
                data-record-id={item.server_id}
                data-testid="report-bucket-item"
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
                        disabled={reportBucketMutationsDisabled}
                        onChange={() => onTogglePrint(item.id)}
                        type="checkbox"
                      />
                      Include in Print
                    </label>
                    <button
                      className="rounded-lg border border-[var(--econ-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-risk)]"
                      disabled={reportBucketMutationsDisabled}
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
          Generate a due diligence packet or report, then save it here before printing.
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
  disabled = false,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
      disabled={disabled}
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
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-[var(--econ-muted)]">
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      <select
        className="rounded-xl border border-[var(--econ-border)] bg-[#11151b] px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)] disabled:opacity-50"
        disabled={disabled}
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

function landDueDiligenceRows(signals: EconomicsParcelSignal[]) {
  return signals
    .filter((signal) =>
      Boolean(
        signal.development_readiness_band ||
          signal.land_opportunity_class ||
          signal.sewer_proxy_class ||
          signal.utility_readiness_proxy_class,
      ),
    )
    .sort((a, b) => landDueDiligenceRank(a) - landDueDiligenceRank(b));
}

function landDueDiligenceRank(signal: EconomicsParcelSignal) {
  const readiness = valueText(signal.development_readiness_band);
  const index = landDueDiligencePriorityBands.indexOf(readiness);
  return index >= 0 ? index : 99;
}

function matchesLandReviewPreset(signal: EconomicsParcelSignal, preset: string) {
  if (preset === "All") return true;
  const text = landReviewSearchText(signal);
  if (preset === "Infrastructure-supported candidates") {
    return hasSewerSupport(signal) && textIncludesAny(text, ["strong infrastructure", "good candidate", "strong sewer", "moderate sewer"]);
  }
  if (preset === "Growth pressure + sewer proximity") {
    return hasGrowthPressure(signal) && hasSewerSupport(signal);
  }
  if (preset === "Underbuilt + utility proxy") {
    return hasSewerSupport(signal) && textIncludesAny(text, ["underbuilt", "redevelopment", "vacant"]);
  }
  if (preset === "More data needed but interesting") {
    return hasOpportunitySignal(signal) && textIncludesAny(text, ["data needed", "not provided", "verify", "capacity"]);
  }
  if (preset === "Special assets / compare separately") {
    return isSpecialReviewCandidate(signal);
  }
  return true;
}

function investmentCandidateRanking(candidate: InvestmentScreenCandidate): LandReviewRanking {
  const reviewBand = investmentCandidateReviewBand(candidate.candidate_band);
  return {
    caution_flags: candidate.caution_reason_codes,
    recommended_next_checks: candidate.verification_requirements,
    review_priority_band: reviewBand,
    review_reason_summary:
      candidate.positive_reason_codes.slice(0, 3).join("; ") ||
      `${candidate.candidate_band}; manual verification required.`,
    sort_value: landReviewSortValue(reviewBand) + Math.max(0, 100 - candidate.sort_order),
    supporting_signals: candidate.positive_reason_codes,
  };
}

function investmentCandidateReviewBand(candidateBand: string): LandReviewPriorityBand {
  if (candidateBand === "Priority Review" || candidateBand === "Strong Review Candidate") {
    return "Tier 1 - Strong Review Candidate";
  }
  if (candidateBand === "Moderate Review Candidate") return "Tier 2 - Good Review Candidate";
  if (candidateBand === "Limited Current Signal") return "Tier 3 - Watchlist / More Data Needed";
  return "Tier 4 - Constraint or Data-Limited";
}

function landReviewRanking(signal: EconomicsParcelSignal): LandReviewRanking {
  const text = landReviewSearchText(signal);
  const special = isSpecialReviewCandidate(signal);
  const valuation = valuationContext(signal);
  const supportingSignals = uniqueStrings([
    valueText(signal.development_readiness_band) ? `Development readiness: ${valueText(signal.development_readiness_band)}` : "",
    valueText(signal.land_opportunity_class) ? `Land opportunity: ${valueText(signal.land_opportunity_class)}` : "",
    hasSewerSupport(signal) ? `Sewer proxy: ${valueText(signal.sewer_proxy_class) || valueText(signal.utility_readiness_proxy_class)}` : "",
    hasGrowthPressure(signal) ? `Growth pressure: ${valueText(signal.growth_pressure_band)}` : "",
    hasOpportunitySignal(signal) ? `Economic opportunity: ${valueText(signal.economic_opportunity_band) || valueText(signal.opportunity_class) || valueText(signal.tax_base_opportunity_band)}` : "",
    valueText(signal.zoning_support_band) ? `Zoning support: ${valueText(signal.zoning_support_band)}` : "",
  ]);
  const cautionFlags = uniqueStrings([
    ...dueDiligenceRedFlags(signal),
    ...valuation.valuation_due_diligence_flags.slice(0, 3),
    special ? "Special asset / compare separately" : "",
    textIncludesAny(text, ["flood", "constraint"]) ? `Constraint context: ${valueText(signal.flood_constraint_band) || valueText(signal.constraint_burden_band) || "review needed"}` : "",
    textIncludesAny(text, ["data needed", "not provided"]) ? "Missing or proxy-only data needs verification" : "",
  ]);
  const nextChecks = dueDiligenceNextChecks(signal);
  const score =
    (textIncludesAny(text, ["strong infrastructure-supported", "strong sewer", "adjacent to sewer"]) ? 4 : 0) +
    (textIncludesAny(text, ["good candidate", "near sewer", "moderate sewer"]) ? 3 : 0) +
    (hasGrowthPressure(signal) ? 2 : 0) +
    (hasOpportunitySignal(signal) ? 2 : 0) +
    (textIncludesAny(text, ["zoning support", "supportive"]) ? 1 : 0) -
    (textIncludesAny(text, ["data needed", "not provided"]) ? 1 : 0) -
    (textIncludesAny(text, ["flood", "limited utility", "constraint"]) ? 1 : 0);
  const reviewPriorityBand = landReviewPriorityBand(signal, score, special);
  return {
    caution_flags: cautionFlags,
    recommended_next_checks: nextChecks,
    review_priority_band: reviewPriorityBand,
    review_reason_summary: landReviewReasonSummary(signal, reviewPriorityBand, supportingSignals, cautionFlags),
    sort_value: landReviewSortValue(reviewPriorityBand) + score,
    supporting_signals: supportingSignals,
  };
}

function landReviewPriorityBand(signal: EconomicsParcelSignal, score: number, special: boolean): LandReviewPriorityBand {
  const readiness = valueText(signal.development_readiness_band).toLowerCase();
  if (special) return "Special Review - Compare Separately";
  if (readiness.includes("strong infrastructure-supported") || score >= 8) return "Tier 1 - Strong Review Candidate";
  if (readiness.includes("good candidate") || score >= 5) return "Tier 2 - Good Review Candidate";
  if (readiness.includes("opportunity signal") || score >= 2) return "Tier 3 - Watchlist / More Data Needed";
  return "Tier 4 - Constraint or Data-Limited";
}

function landReviewSortValue(band: LandReviewPriorityBand) {
  if (band.startsWith("Tier 1")) return 500;
  if (band.startsWith("Tier 2")) return 400;
  if (band.startsWith("Tier 3")) return 300;
  if (band.startsWith("Special")) return 200;
  return 100;
}

function caseStudyReviewBand(score: number | undefined): LandReviewPriorityBand {
  if (score == null) return "Tier 3 - Watchlist / More Data Needed";
  if (score >= 85) return "Tier 1 - Strong Review Candidate";
  if (score >= 70) return "Tier 2 - Good Review Candidate";
  if (score >= 40) return "Tier 3 - Watchlist / More Data Needed";
  return "Tier 4 - Constraint or Data-Limited";
}

function landReviewReasonSummary(
  signal: EconomicsParcelSignal,
  band: LandReviewPriorityBand,
  supportingSignals: string[],
  cautionFlags: string[],
) {
  if (band.startsWith("Special")) {
    return "Special or non-comparable asset context; review separately from ordinary parcels.";
  }
  if (supportingSignals.length) {
    return `${supportingSignals.slice(0, 3).join("; ")}.${cautionFlags.length ? ` Verify ${cautionFlags[0].toLowerCase()}.` : ""}`;
  }
  return valueText(signal.development_readiness_band) || valueText(signal.land_opportunity_class) || "Data needed before ranking interpretation.";
}

function landReviewSearchText(signal: EconomicsParcelSignal) {
  return [
    signal.development_readiness_band,
    signal.land_opportunity_class,
    signal.sewer_proxy_class,
    signal.utility_readiness_proxy_class,
    signal.sewer_proxy_confidence,
    signal.economic_segment,
    signal.growth_pressure_band,
    signal.economic_opportunity_band,
    signal.opportunity_class,
    signal.tax_base_opportunity_band,
    signal.flood_constraint_band,
    signal.constraint_burden_band,
    signal.zoning_support_band,
    signal.utility_capacity_status,
    signal.planned_extension_status,
    signal.data_confidence,
    signal.economic_data_confidence,
    signal.recommended_followup,
    signalListValues(signal.due_diligence_flags).join(" "),
    signalListValues(signal.suggested_next_checks).join(" "),
  ]
    .map(valueText)
    .join(" ")
    .toLowerCase();
}

function textIncludesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function hasSewerSupport(signal: EconomicsParcelSignal) {
  const text = landReviewSearchText(signal);
  return textIncludesAny(text, ["adjacent to sewer", "near sewer", "within 1000", "strong sewer", "moderate sewer", "sewer basin", "sewer-proximity"]);
}

function hasGrowthPressure(signal: EconomicsParcelSignal) {
  return textIncludesAny(valueText(signal.growth_pressure_band).toLowerCase(), ["growth pressure", "strong", "high", "elevated", "permit pressure"]);
}

function hasOpportunitySignal(signal: EconomicsParcelSignal) {
  return textIncludesAny(landReviewSearchText(signal), ["opportunity", "underbuilt", "redevelopment", "candidate", "tax-base", "tax base", "economic"]);
}

function isSpecialReviewCandidate(signal: EconomicsParcelSignal) {
  if (signal.special_asset_flag) return true;
  return textIncludesAny(landReviewSearchText(signal), ["special asset", "compare separately", "institutional", "civic", "infrastructure / utility"]);
}

function topLandReviewWatchlistPacket(rows: RankedLandReviewCandidate[]): DueDiligencePacket {
  const signals = rows.map((row) => row.signal);
  const topLines = rows.slice(0, 25).map((row) =>
    `${row.rank}. ${signalLabel(row.signal)} - ${row.ranking.review_priority_band}; ${row.ranking.review_reason_summary}`,
  );
  const flags = topTextCounts(rows.flatMap((row) => row.ranking.caution_flags)).slice(0, 8);
  const valuationFlags = topTextCounts(signals.flatMap((signal) => valuationContext(signal).valuation_due_diligence_flags)).slice(0, 8);
  return {
    caveats: landDueDiligencePacketCaveats,
    id: `top-land-review-watchlist-${rows.length}-${signals.slice(0, 8).map((row) => row.parcel_id).join("-")}`,
    packet_type: "watchlist",
    questions_to_ask: defaultDueDiligenceQuestions,
    sections: [
      packetSection("Top 25 Review Watchlist", topLines),
      packetSection("Review Priority Mix", countRowsBy(rows, (row) => row.ranking.review_priority_band).map((row) => `${row.label}: ${row.value}`)),
      packetSection("Why These Candidates Surfaced", [
        "CFS combined development-readiness bands, sewer-proximity proxy, growth pressure, economic opportunity, constraints, and due diligence flags.",
        "The list is for manual review sequencing only and should be verified with planning, utilities, access, legal/title, and site checks.",
      ]),
      packetSection("Sewer / Utility Proxy Context", [
        `Sewer proxy mix: ${countRowsBy(signals, (row) => row.sewer_proxy_class ?? "Data Needed").slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Utility proxy mix: ${countRowsBy(signals, (row) => row.utility_readiness_proxy_class ?? "Data Needed").slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        landDueDiligenceWsaccCaveat,
      ]),
      packetSection("Valuation / Comparable Context", [
        `Value-per-acre context: ${countRowsBy(signals, (row) => valuationContext(row).value_per_acre_band).slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Comparison groups: ${countRowsBy(signals, (row) => valuationContext(row).comparison_group).slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Special asset rows: ${formatNumber(signals.filter((row) => row.special_asset_flag).length)}`,
        ...valuationFlags.map((row) => `${row.label}: ${row.value}`),
      ]),
      packetSection("Caution Flags", flags.length ? flags.map((row) => `${row.label}: ${row.value}`) : ["Monitor; no common caution flag surfaced in the selected rows."]),
      packetSection("Recommended Next Checks", defaultDueDiligenceQuestions),
      packetSection("Caveats", landDueDiligencePacketCaveats),
    ],
    summary: `Top ${Math.min(rows.length, 25)} land review candidates prepared for screening-level manual review. Use priority bands and reasons, not raw scores, to sequence due diligence.`,
    title: "Top 25 Land Review Watchlist",
  };
}

function candidateComparisonPacket(rows: RankedLandReviewCandidate[]): DueDiligencePacket {
  return {
    caveats: landDueDiligencePacketCaveats,
    id: `land-review-comparison-${rows.map((row) => row.signal.parcel_id).join("-")}`,
    packet_type: "watchlist",
    questions_to_ask: defaultDueDiligenceQuestions,
    sections: [
      packetSection("Candidate Comparison", rows.map((row) =>
        `${signalLabel(row.signal)} - ${row.ranking.review_priority_band}; sewer proxy: ${valueText(row.signal.sewer_proxy_class) || "Data Needed"}; growth: ${valueText(row.signal.growth_pressure_band) || "Data Needed"}; caution: ${row.ranking.caution_flags[0] ?? "Monitor"}`,
      )),
      packetSection("Valuation / Comparable Context", rows.map((row) => {
        const context = valuationContext(row.signal);
        return `${signalLabel(row.signal)} - value/acre: ${context.value_per_acre_band}; assessed value: ${context.assessed_value_band}; comparison group: ${context.comparison_group}; status: ${context.comparable_context_status}`;
      })),
      packetSection("Supporting Signals", rows.map((row) => `${signalLabel(row.signal)}: ${row.ranking.supporting_signals.slice(0, 4).join("; ") || "Data Needed"}`)),
      packetSection("Caution Flags", rows.map((row) => `${signalLabel(row.signal)}: ${row.ranking.caution_flags.slice(0, 4).join("; ") || "Monitor"}`)),
      packetSection("What To Verify Next", rows.map((row) => `${signalLabel(row.signal)}: ${row.ranking.recommended_next_checks.slice(0, 4).join("; ") || "Verify planning and utility context."}`)),
      packetSection("Caveats", landDueDiligencePacketCaveats),
    ],
    summary: `${rows.length} selected candidates compared for manual due diligence prioritization.`,
    title: "Selected Land Review Candidate Comparison",
  };
}

function matchesFilter(value: unknown, selected: string) {
  return selected === "All" || valueText(value) === selected;
}

function matchesArrayFilter(value: unknown, selected: string) {
  return selected === "All" || signalListValues(value).includes(selected);
}

function signalListValues(value: unknown) {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean);
  const text = valueText(value);
  if (!text) return [];
  // ponytail: export lists are semicolon/pipe/comma strings; upgrade if rows become nested checklist objects.
  return text.split(/[;|,]/).map((item) => item.trim()).filter(Boolean);
}

function signalLabel(signal: EconomicsParcelSignal) {
  return signal.display_label ?? signal.geography_label ?? signal.parcel_id;
}

function acreageBandForSignal(signal: EconomicsParcelSignal) {
  const explicitBand = valueText((signal as EconomicsParcelSignal & { acreage_band?: unknown }).acreage_band);
  if (explicitBand) return explicitBand;
  const acreage = signal.acreage;
  if (acreage == null) return "Data Needed";
  if (acreage < 1) return "Under 1 acre";
  if (acreage < 5) return "1-5 acres";
  if (acreage < 25) return "5-25 acres";
  return "25+ acres";
}

function valuationContext(signal: EconomicsParcelSignal): ValuationContext {
  const saleDate = valueText(signalExtraField(signal, "sale_date") ?? signalExtraField(signal, "last_sale_date"));
  const salePrice = numericExtraField(signal, "sale_price") ?? numericExtraField(signal, "last_sale_price");
  const recentSaleAvailable = Boolean(saleDate || salePrice != null);
  const comparisonGroup = valueText(signal.comparison_group)
    || uniqueStrings([
      valueText(signal.economic_segment),
      valueText(signal.jurisdiction ?? signal.geography_label),
      acreageBandForSignal(signal),
      valueText(signal.sewer_proxy_class),
      valueText(signal.land_opportunity_class),
    ]).slice(0, 4).join(" / ")
    || "Data Needed";
  const flags = uniqueStrings([
    !recentSaleAvailable ? "Recent sale fields are not available in the current CFS Economics export" : "",
    !valueText(signalExtraField(signal, "value_per_acre_band")) && signal.value_per_acre == null ? "Value-per-acre context needs review" : "",
    signal.assessed_value == null ? "Assessed-value field needs review" : "",
    signal.special_asset_flag ? "Special asset / compare separately" : "",
    "Manual comps review required",
    "Verify with public records, broker, or appraiser as needed",
  ]);
  return {
    assessed_value_band: valueText(signalExtraField(signal, "assessed_value_band")) || moneyBand(signal.assessed_value),
    comparable_context_status: signal.special_asset_flag
      ? "Special asset / compare separately"
      : recentSaleAvailable
        ? "Sale indicator available; verify manually"
        : "Assessed-value and value-per-acre context only",
    comparison_group: comparisonGroup,
    improvement_to_land_ratio_band: valueText(signalExtraField(signal, "improvement_to_land_ratio_band")) || ratioBand(signal.improvement_to_land_ratio),
    improvement_value_band: valueText(signalExtraField(signal, "improvement_value_band")) || moneyBand(signal.improvement_value),
    land_value_band: valueText(signalExtraField(signal, "land_value_band")) || moneyBand(signal.land_value),
    recent_sale_available_flag: recentSaleAvailable,
    sale_price_band: salePrice == null ? "Sale price not available" : moneyBand(salePrice),
    sale_recency_band: saleDate ? saleRecencyBand(saleDate) : "Sale date not available",
    valuation_due_diligence_flags: flags,
    value_per_acre_band: valueText(signalExtraField(signal, "value_per_acre_band")) || moneyBand(signal.value_per_acre),
  };
}

function moneyBand(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Data Needed";
  if (value < 100_000) return "Under $100K";
  if (value < 250_000) return "$100K-$250K";
  if (value < 500_000) return "$250K-$500K";
  if (value < 1_000_000) return "$500K-$1M";
  return "$1M+";
}

function ratioBand(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Data Needed";
  if (value < 0.5) return "Low";
  if (value < 1.5) return "Moderate";
  return "High";
}

function saleRecencyBand(value: string) {
  const year = new Date(value).getFullYear();
  if (!Number.isFinite(year)) return "Sale date needs review";
  const age = new Date().getFullYear() - year;
  if (age <= 2) return "Recent sale indicator";
  if (age <= 5) return "Moderate recency sale indicator";
  return "Older sale indicator";
}

function numericExtraField(signal: EconomicsParcelSignal, field: string) {
  const value = signalExtraField(signal, field);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function packetSection(title: string, lines: string[]): DueDiligencePacketSection {
  return { lines: uniqueStrings(lines.filter(Boolean)), title };
}

function packetLine(label: string, value: unknown) {
  return `${label}: ${valueText(value) || "Data Needed"}`;
}

function singleParcelDueDiligencePacket(signal: EconomicsParcelSignal): DueDiligencePacket {
  const flags = dueDiligenceRedFlags(signal);
  const nextChecks = dueDiligenceNextChecks(signal);
  const questions = dueDiligenceQuestions(signal);
  const valuation = valuationContext(signal);
  return {
    caveats: landDueDiligencePacketCaveats,
    id: `due-diligence-packet-${signal.parcel_id}`,
    packet_type: "single_parcel",
    questions_to_ask: questions,
    sections: [
      packetSection("Parcel / Area Summary", [
        packetLine("Label", signalLabel(signal)),
        packetLine("Geography", signal.geography_label),
        packetLine("Acreage band", acreageBandForSignal(signal)),
        packetLine("Development-readiness", signal.development_readiness_band),
        packetLine("Land opportunity", signal.land_opportunity_class),
        packetLine("Data confidence", signal.data_confidence ?? signal.economic_data_confidence),
      ]),
      packetSection("Why This Surfaced", [
        `Review signal: ${valueText(signal.development_readiness_band) || valueText(signal.land_opportunity_class) || "screening row"}.`,
        `Growth pressure: ${valueText(signal.growth_pressure_band) || "Data Needed"}.`,
        `Utility proxy: ${valueText(signal.sewer_proxy_class) || "Data Needed"}; ${valueText(signal.utility_readiness_proxy_class) || "Data Needed"}.`,
        `Economic opportunity: ${valueText(signal.economic_opportunity_band) || valueText(signal.opportunity_class) || "Data Needed"}.`,
        flags.length ? `Primary flags: ${flags.slice(0, 4).join("; ")}.` : "Primary flags: Data Needed.",
      ]),
      packetSection("Infrastructure / WSACC Context", [
        packetLine("Sewer proxy class", signal.sewer_proxy_class),
        packetLine("Utility-readiness proxy", signal.utility_readiness_proxy_class),
        packetLine("Sewer proxy confidence", signal.sewer_proxy_confidence),
        packetLine("Sewer basin", signal.sewer_basin_label),
        packetLine("Utility capacity status", signal.utility_capacity_status),
        packetLine("Planned extension status", signal.planned_extension_status),
        landDueDiligenceWsaccCaveat,
      ]),
      packetSection("Economic Context", [
        packetLine("Economic opportunity", signal.economic_opportunity_band),
        packetLine("Opportunity class", signal.opportunity_class),
        packetLine("Tax-base opportunity", signal.tax_base_opportunity_band),
        packetLine("Value-per-acre band", valuation.value_per_acre_band),
        packetLine("Improvement ratio band", valuation.improvement_to_land_ratio_band),
        signal.special_asset_flag ? "Special asset / compare with caution." : "",
      ]),
      packetSection("Valuation / Comparable Context", [
        packetLine("Comparison group", valuation.comparison_group),
        packetLine("Comparable context status", valuation.comparable_context_status),
        packetLine("Assessed value context", valuation.assessed_value_band),
        packetLine("Land value context", valuation.land_value_band),
        packetLine("Improvement value context", valuation.improvement_value_band),
        packetLine("Sale recency", valuation.sale_recency_band),
        packetLine("Sale price", valuation.sale_price_band),
        ...valuation.valuation_due_diligence_flags,
      ]),
      packetSection("Constraint Context", [
        packetLine("Flood constraint", signal.flood_constraint_band),
        packetLine("School/service pressure", signal.school_service_pressure_band),
        packetLine("Public cost risk", signal.public_cost_risk_band ?? signal.constraint_burden_band),
        packetLine("Zoning support", signal.zoning_support_band),
      ]),
      packetSection("Red Flags / Missing Data", flags.length ? flags : ["Data Needed"]),
      packetSection("Questions to Ask", questions),
      packetSection("Recommended Next Checks", nextChecks),
      packetSection("Caveats", landDueDiligencePacketCaveats),
    ],
    summary: `${signalLabel(signal)} surfaced as ${valueText(signal.development_readiness_band) || valueText(signal.land_opportunity_class) || "a screening-level review candidate"}; verify planning, utilities, access, constraints, and site feasibility before any decision.`,
    title: `Parcel Due Diligence Packet - ${signalLabel(signal)}`,
  };
}

function watchlistDueDiligencePacket(rows: EconomicsParcelSignal[]): DueDiligencePacket {
  const flags = topTextCounts(rows.flatMap((signal) => dueDiligenceRedFlags(signal))).slice(0, 8);
  const valuationFlags = topTextCounts(rows.flatMap((signal) => valuationContext(signal).valuation_due_diligence_flags)).slice(0, 8);
  const candidates = rows.slice(0, 12).map((signal, index) =>
    `${index + 1}. ${signalLabel(signal)} - review priority: ${valueText(signal.development_readiness_band) || valueText(signal.land_opportunity_class) || "Data Needed"}; sewer proxy: ${valueText(signal.sewer_proxy_class) || "Data Needed"}`,
  );
  return {
    caveats: landDueDiligencePacketCaveats,
    id: `due-diligence-watchlist-packet-${rows.length}-${rows.slice(0, 8).map((row) => row.parcel_id).join("-")}`,
    packet_type: "watchlist",
    questions_to_ask: defaultDueDiligenceQuestions,
    sections: [
      packetSection("Parcel / Area Summary", [
        `Selected row count: ${formatNumber(rows.length)}`,
        `Segment mix: ${countRowsBy(rows, (row) => row.economic_segment ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Opportunity mix: ${countRowsBy(rows, (row) => row.land_opportunity_class ?? row.opportunity_class).slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Sewer proxy mix: ${countRowsBy(rows, (row) => row.sewer_proxy_class ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
      ]),
      packetSection("Why This Surfaced", [
        "Selected rows combine development-readiness, sewer-proximity proxy, economic opportunity, constraints, and due diligence flags.",
        "Use review priority bands to order manual checks; do not treat the list as a financial ranking.",
      ]),
      packetSection("Infrastructure / WSACC Context", [
        `Utility proxy mix: ${countRowsBy(rows, (row) => row.utility_readiness_proxy_class ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Top basins/geographies: ${countRowsBy(rows, (row) => row.sewer_basin_label ?? row.geography_label ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        landDueDiligenceWsaccCaveat,
      ]),
      packetSection("Economic Context", [
        `Economic opportunity mix: ${countRowsBy(rows, (row) => row.economic_opportunity_band ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Special asset rows: ${formatNumber(rows.filter((row) => row.special_asset_flag).length)}`,
      ]),
      packetSection("Valuation / Comparable Context", [
        `Value-per-acre context: ${countRowsBy(rows, (row) => valuationContext(row).value_per_acre_band).slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Comparison groups: ${countRowsBy(rows, (row) => valuationContext(row).comparison_group).slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `Comparable context status: ${countRowsBy(rows, (row) => valuationContext(row).comparable_context_status).slice(0, 6).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        ...valuationFlags.map((row) => `${row.label}: ${row.value}`),
      ]),
      packetSection("Constraint Context", [
        `Flood constraint mix: ${countRowsBy(rows, (row) => row.flood_constraint_band ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
        `School/service pressure mix: ${countRowsBy(rows, (row) => row.school_service_pressure_band ?? "Data Needed").slice(0, 5).map((row) => `${row.label}: ${row.value}`).join("; ") || "Data Needed"}`,
      ]),
      packetSection("Red Flags / Missing Data", flags.length ? flags.map((row) => `${row.label}: ${row.value}`) : ["Data Needed"]),
      packetSection("Questions to Ask", defaultDueDiligenceQuestions),
      packetSection("Recommended Next Checks", candidates),
      packetSection("Caveats", landDueDiligencePacketCaveats),
    ],
    summary: `${rows.length} selected land screening rows prepared for manual due diligence review. Use review priority, not financial ranking, and verify utilities/planning before decisions.`,
    title: "Watchlist Due Diligence Packet",
  };
}

function dueDiligenceRedFlags(signal: EconomicsParcelSignal) {
  return uniqueStrings([
    ...signalListValues(signal.due_diligence_flags),
    ...[
      valueText(signal.utility_capacity_status).toLowerCase().includes("data") ? "Utility capacity status needs verification" : "",
      valueText(signal.planned_extension_status).toLowerCase().includes("data") ? "Planned extension status needs verification" : "",
      !valueText(signal.zoning_support_band) ? "Zoning support data needed" : "",
      !valueText(signal.flood_constraint_band) ? "Floodplain/wetlands review needed" : "",
      signal.special_asset_flag ? "Special asset / compare separately" : "",
      valueText(signal.data_confidence ?? signal.economic_data_confidence).toLowerCase().includes("data") ? "Data confidence needs review" : "",
    ],
  ]);
}

function dueDiligenceNextChecks(signal: EconomicsParcelSignal) {
  return uniqueStrings([
    ...signalListValues(signal.suggested_next_checks),
    signal.recommended_followup ?? "",
    ...landDueDiligenceChecklist,
  ]).slice(0, 12);
}

function dueDiligenceQuestions(signal: EconomicsParcelSignal) {
  return uniqueStrings([
    `Is sewer service available for ${signalLabel(signal)} under current utility rules?`,
    "Is system capacity available for the intended review scenario?",
    "Is water service available, and what provider confirmation is required?",
    "Does zoning support the intended use, or is a rezoning/special use path needed?",
    "Are there known floodplain, wetlands, access, easement, or site-dimension constraints?",
    "Are road frontage, access, or off-site improvements required?",
    "Are there active or recent planning cases, permits, or subdivision actions nearby?",
  ]);
}

function signalExtraField(signal: EconomicsParcelSignal, field: string) {
  return (signal as EconomicsParcelSignal & Record<string, unknown>)[field];
}

function dueDiligencePacketSummaryText(packet: DueDiligencePacket) {
  return [packet.title, packet.summary, "", ...packet.caveats.map((caveat) => `- ${caveat}`)].join("\n");
}

function dueDiligencePacketText(packet: DueDiligencePacket) {
  return [
    packet.title,
    packet.summary,
    ...packet.sections.map((section) => [
      "",
      section.title,
      ...section.lines.map((line) => `- ${line}`),
    ].join("\n")),
  ].join("\n");
}

function dueDiligencePacketBucketItem(packet: DueDiligencePacket): ReportBucketItemInput {
  return {
    caveats: packet.caveats,
    content: dueDiligencePacketText(packet),
    due_diligence_packet: packet,
    id: packet.id,
    related_tables: ["parcel_economic_signal_fact"],
    source_page: "Power BI & Tools",
    summary: packet.summary,
    title: packet.title,
    type: "due_diligence_packet",
  };
}

function investmentReportBucketItem(report: InvestmentReportResponse): ReportBucketItemInput {
  return {
    caveats: report.limitations,
    content: report.sections.map((section) => `${section.title}\n${section.body}`).join("\n\n"),
    id: `investment-report-${report.report_type}-${Date.now()}`,
    source_page: "CFS Investments",
    summary: report.report_bucket_item.summary,
    title: report.report_title,
    type: "generated_report",
  };
}

function intakeAnalysisBucketItem(analysis: InvestmentIntakeAnalysisResponse): ReportBucketItemInput {
  return {
    caveats: analysis.caveats,
    content: [
      `Candidate: ${analysis.candidate.candidate_name}`,
      `Parcel ID: ${analysis.candidate.parcel_id || "Manual opportunity"}`,
      `Current Asking Basis: ${analysis.acquisition_basis.asking_basis_band}`,
      `Comparable Context: ${analysis.screening_context?.basis_context_band || "Insufficient Basis Information"}`,
      `Readiness Signal: ${analysis.screening_context?.dimension_bands.readiness_signal || "Verify"}`,
      `Cautions: ${analysis.acquisition_basis.basis_caution_reasons.join("; ")}`,
      "Source reference only. CFS does not automatically reproduce or verify third-party listing content.",
    ].join("\n"),
    id: `intake-${analysis.candidate.id}`,
    related_tables: ["parcel_economic_signal_fact"],
    source_page: "Power BI & Tools",
    summary: analysis.acquisition_basis.asking_basis_summary,
    title: `Candidate intake: ${analysis.candidate.candidate_name}`,
    type: "evidence_pack",
  };
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

function topTextCounts(values: string[]) {
  return countRowsBy(values.filter(Boolean), (value) => value);
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

function moneyText(value: number | null | undefined) {
  return typeof value === "number" ? `$${Math.round(value).toLocaleString("en-US")}` : "Not available";
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

const ECONOMIC_SCENARIO_SCHEMA_VERSION = "cfs-economics-scenario-v1";

function scenarioAssumptionsFromRecord(
  record: EconomicScenarioRecord,
): ScenarioAssumptions {
  if (
    record.payload.calculation_schema_version !== ECONOMIC_SCENARIO_SCHEMA_VERSION ||
    record.outputs.calculation_schema_version !== ECONOMIC_SCENARIO_SCHEMA_VERSION
  ) {
    throw malformedEconomicScenario("Saved Economics scenario uses an unsupported calculation schema.");
  }
  const assumptions = {
    developmentType: scenarioAssumption(record, "developmentType", developmentTypeOptions),
    floodConstraint: scenarioAssumption(record, "floodConstraint", burdenBandOptions),
    intensityBand: scenarioAssumption(record, "intensityBand", basicBandOptions),
    scenarioId: scenarioAssumption(record, "scenarioId", Object.keys(scenarioDefaults)),
    schoolServiceBurden: scenarioAssumption(record, "schoolServiceBurden", burdenBandOptions),
    transportationAccess: scenarioAssumption(record, "transportationAccess", confidenceBandOptions),
    utilityReadiness: scenarioAssumption(record, "utilityReadiness", confidenceBandOptions),
    valuePerAcreBand: scenarioAssumption(record, "valuePerAcreBand", basicBandOptions),
  };
  if (record.payload.scenario_template_id !== assumptions.scenarioId) {
    throw malformedEconomicScenario("Saved Economics scenario template metadata is inconsistent.");
  }
  const expectedOutput = calculateScenarioOutput(assumptions);
  if (
    Object.entries(expectedOutput).some(
      ([key, value]) => record.outputs[key] !== value,
    )
  ) {
    throw malformedEconomicScenario(
      "Saved Economics scenario outputs do not match its deterministic assumptions.",
    );
  }
  return assumptions;
}

function scenarioAssumption(
  record: EconomicScenarioRecord,
  key: keyof ScenarioAssumptions,
  allowed: string[],
) {
  const value = record.assumptions[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw malformedEconomicScenario(`Saved Economics scenario has an unsupported ${key} value.`);
  }
  return value;
}

function malformedEconomicScenario(displayMessage: string) {
  return new ProductApiError({
    code: "malformed_economic_scenario",
    displayMessage,
    kind: "malformed",
  });
}

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
  | "comparable_context"
  | "data_confidence"
  | "due_diligence"
  | "executive"
  | "land_opportunity"
  | "scenario"
  | "scenario_data_confidence"
  | "special_assets"
  | "tax_base"
  | "top_candidates"
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
  land_opportunity_rows: number;
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
  | "due_diligence_packet"
  | "evidence_pack"
  | "generated_report"
  | "powerbi_recipe"
  | "qa_checklist"
  | "report_plan"
  | "scenario_output";
type DueDiligencePacketSection = {
  lines: string[];
  title: string;
};
type DueDiligencePacket = {
  caveats: string[];
  id: string;
  packet_type: "single_parcel" | "watchlist";
  questions_to_ask: string[];
  sections: DueDiligencePacketSection[];
  summary: string;
  title: string;
};
type LandReviewPriorityBand =
  | "Tier 1 - Strong Review Candidate"
  | "Tier 2 - Good Review Candidate"
  | "Tier 3 - Watchlist / More Data Needed"
  | "Tier 4 - Constraint or Data-Limited"
  | "Special Review - Compare Separately";
type LandReviewRanking = {
  caution_flags: string[];
  recommended_next_checks: string[];
  review_priority_band: LandReviewPriorityBand;
  review_reason_summary: string;
  sort_value: number;
  supporting_signals: string[];
};
type ValuationContext = {
  assessed_value_band: string;
  comparable_context_status: string;
  comparison_group: string;
  improvement_to_land_ratio_band: string;
  improvement_value_band: string;
  land_value_band: string;
  recent_sale_available_flag: boolean;
  sale_price_band: string;
  sale_recency_band: string;
  valuation_due_diligence_flags: string[];
  value_per_acre_band: string;
};
type RankedLandReviewCandidate = {
  investment_candidate?: InvestmentScreenCandidate | null;
  rank: number;
  ranking: LandReviewRanking;
  signal: EconomicsParcelSignal;
};
type ReportBucketItem = {
  caveats?: string[];
  chart_config?: UserChartRecipeConfig;
  content: string;
  created_at: string;
  due_diligence_packet?: DueDiligencePacket;
  id: string;
  generated_report?: GeneratedPowerBiReportSnapshot;
  powerbi_recipe?: string;
  related_tables?: PowerBiTableName[];
  report_plan?: PowerBiGeneratedReportPlan;
  selected_for_print: boolean;
  server_id?: string;
  source_page: "Ask CFS" | "CFS Investments" | "Economic Dashboard" | "Power BI & Tools" | "Print";
  summary: string;
  title: string;
  type: ReportBucketItemType;
  updated_at?: string;
};
type ReportBucketItemInput = Omit<ReportBucketItem, "created_at" | "selected_for_print"> &
  Partial<Pick<ReportBucketItem, "created_at" | "selected_for_print">>;

function reportBucketCreateInput(item: ReportBucketItem, position: number) {
  const { selected_for_print, server_id: _serverId, updated_at: _updatedAt, ...payload } = item;
  void _serverId;
  void _updatedAt;
  return {
    include_in_print: selected_for_print,
    object_id: item.id,
    object_type: item.type,
    payload: toJsonObject(payload),
    position,
    title: item.title,
  };
}

function reportBucketItemFromRecord(
  record: ReportBucketItemRecord,
  fallback?: ReportBucketItem,
): ReportBucketItem {
  const payload = record.payload;
  const type = reportBucketItemType(record.object_type);
  const sourcePage = reportBucketSourcePage(payload.source_page);
  return {
    ...fallback,
    caveats: stringArray(payload.caveats) ?? fallback?.caveats,
    chart_config: isUserChartRecipeConfig(payload.chart_config)
      ? payload.chart_config
      : fallback?.chart_config,
    content: typeof payload.content === "string" ? payload.content : fallback?.content ?? "",
    created_at: typeof payload.created_at === "string" ? payload.created_at : record.created_at,
    due_diligence_packet: isDueDiligencePacket(payload.due_diligence_packet)
      ? payload.due_diligence_packet
      : fallback?.due_diligence_packet,
    generated_report: isGeneratedPowerBiReportSnapshot(payload.generated_report)
      ? payload.generated_report
      : fallback?.generated_report,
    id: record.object_id,
    powerbi_recipe:
      typeof payload.powerbi_recipe === "string"
        ? payload.powerbi_recipe
        : fallback?.powerbi_recipe,
    related_tables: isPowerBiTableNameArray(payload.related_tables)
      ? payload.related_tables
      : fallback?.related_tables,
    report_plan: isPowerBiGeneratedReportPlan(payload.report_plan)
      ? payload.report_plan
      : fallback?.report_plan,
    selected_for_print: record.include_in_print,
    server_id: record.id,
    source_page: sourcePage,
    summary:
      typeof payload.summary === "string"
        ? payload.summary
        : fallback?.summary ?? record.title,
    title: record.title,
    type,
    updated_at: record.updated_at,
  };
}

function productErrorDetails(caught: unknown) {
  const error = toProductApiError(caught);
  return {
    message: error.displayMessage,
    requestId: error.requestId,
  };
}

function reportBucketItemType(value: string): ReportBucketItemType {
  switch (value) {
    case "chart":
    case "decision_memo":
    case "due_diligence_packet":
    case "evidence_pack":
    case "generated_report":
    case "powerbi_recipe":
    case "qa_checklist":
    case "report_plan":
    case "scenario_output":
      return value;
    default:
      throw new ProductApiError({
        code: "malformed_report_bucket_item_type",
        displayMessage: "Report Bucket data contains an unsupported item type.",
        kind: "malformed",
      });
  }
}

function reportBucketSourcePage(value: JsonValue | undefined): ReportBucketItem["source_page"] {
  switch (value) {
    case "Ask CFS":
    case "CFS Investments":
    case "Economic Dashboard":
    case "Power BI & Tools":
    case "Print":
      return value;
    default:
      throw new ProductApiError({
        code: "malformed_report_bucket_source_page",
        displayMessage: "Report Bucket data contains an unsupported source page.",
        kind: "malformed",
      });
  }
}

function stringArray(value: JsonValue | undefined) {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPowerBiTableName(value: unknown): value is PowerBiTableName {
  switch (value) {
    case "domain_readiness_dim":
    case "economics_kpi_fact":
    case "geography_dim":
    case "parcel_economic_signal_fact":
    case "scenario_dim":
    case "scenario_output_fact":
    case "time_dim":
      return true;
    default:
      return false;
  }
}

function isPowerBiTableNameArray(value: unknown): value is PowerBiTableName[] {
  return Array.isArray(value) && value.every(isPowerBiTableName);
}

function isChartAggregation(value: unknown): value is UserChartAggregation {
  return value === "average" || value === "count" || value === "sum";
}

function isChartVisualType(value: unknown): value is UserChartVisualType {
  return ["bar", "donut", "line", "matrix", "pie", "table"].includes(
    typeof value === "string" ? value : "",
  );
}

function isUserChartRecipeConfig(value: unknown): value is UserChartRecipeConfig {
  return (
    isRecord(value) &&
    isChartAggregation(value.aggregation) &&
    typeof value.categoryField === "string" &&
    typeof value.filterField === "string" &&
    typeof value.filterValue === "string" &&
    isPowerBiTableName(value.tableName) &&
    typeof value.valueField === "string" &&
    isChartVisualType(value.visualType)
  );
}

function isDueDiligencePacket(value: unknown): value is DueDiligencePacket {
  return (
    isRecord(value) &&
    isStringArray(value.caveats) &&
    typeof value.id === "string" &&
    (value.packet_type === "single_parcel" || value.packet_type === "watchlist") &&
    isStringArray(value.questions_to_ask) &&
    Array.isArray(value.sections) &&
    value.sections.every(
      (section) =>
        isRecord(section) &&
        isStringArray(section.lines) &&
        typeof section.title === "string",
    ) &&
    typeof value.summary === "string" &&
    typeof value.title === "string"
  );
}

function isPowerBiGeneratedVisual(value: unknown): value is PowerBiGeneratedVisual {
  return (
    isRecord(value) &&
    isChartAggregation(value.aggregation) &&
    typeof value.axis === "string" &&
    typeof value.caveat === "string" &&
    typeof value.filterField === "string" &&
    typeof value.filterValue === "string" &&
    typeof value.page_name === "string" &&
    typeof value.powerbi_recipe === "string" &&
    isStringArray(value.slicers) &&
    isPowerBiTableName(value.source_table) &&
    typeof value.title === "string" &&
    typeof value.value === "string" &&
    typeof value.visual_id === "string" &&
    isChartVisualType(value.visual_type)
  );
}

function isPowerBiRelationship(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.from_column === "string" &&
    typeof value.from_table === "string" &&
    typeof value.to_column === "string" &&
    typeof value.to_table === "string" &&
    (value.active === undefined || typeof value.active === "boolean") &&
    (value.cardinality === undefined || typeof value.cardinality === "string") &&
    (value.cross_filter_direction === undefined ||
      typeof value.cross_filter_direction === "string")
  );
}

function isPowerBiGeneratedReportPlan(
  value: unknown,
): value is PowerBiGeneratedReportPlan {
  return (
    isRecord(value) &&
    isStringArray(value.caveats) &&
    isRecord(value.dataset_plan) &&
    isPowerBiTableNameArray(value.dataset_plan.dimensions) &&
    isPowerBiTableNameArray(value.dataset_plan.facts) &&
    isStringArray(value.dataset_plan.measures) &&
    isStringArray(value.dataset_plan.slicers) &&
    isStringArray(value.dataset_plan.sort_fields) &&
    typeof value.generated_from_prompt === "string" &&
    isStringArray(value.next_steps) &&
    Array.isArray(value.pages) &&
    value.pages.every(
      (page) =>
        isRecord(page) &&
        typeof page.page_name === "string" &&
        typeof page.purpose === "string" &&
        Array.isArray(page.visuals) &&
        page.visuals.every(isPowerBiGeneratedVisual),
    ) &&
    isPowerBiTableNameArray(value.recommended_tables) &&
    Array.isArray(value.relationships) &&
    value.relationships.every(isPowerBiRelationship) &&
    typeof value.summary === "string" &&
    typeof value.title === "string"
  );
}

function isGeneratedReportIncludes(
  value: unknown,
): value is GeneratedReportIncludeState {
  return (
    isRecord(value) &&
    ["caveats", "kpis", "powerbi_details", "summary", "tables", "visuals"].every(
      (key) => typeof value[key] === "boolean",
    )
  );
}

function isGeneratedReportVisualPreview(
  value: unknown,
): value is GeneratedReportVisualPreview {
  return (
    isRecord(value) &&
    Array.isArray(value.rows) &&
    value.rows.every(isRecord) &&
    isPowerBiGeneratedVisual(value)
  );
}

function isGeneratedPowerBiReportSnapshot(
  value: unknown,
): value is GeneratedPowerBiReportSnapshot {
  return (
    isRecord(value) &&
    isStringArray(value.caveats) &&
    isStringArray(value.diagnostics) &&
    typeof value.generated_from_prompt === "string" &&
    isGeneratedReportIncludes(value.include_sections) &&
    Array.isArray(value.kpis) &&
    value.kpis.every(
      (kpi) =>
        isRecord(kpi) &&
        typeof kpi.label === "string" &&
        typeof kpi.value === "string",
    ) &&
    typeof value.powerbi_details === "string" &&
    typeof value.report_type === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.tables) &&
    value.tables.every(
      (table) =>
        isRecord(table) &&
        isStringArray(table.columns) &&
        Array.isArray(table.rows) &&
        table.rows.every(isRecord) &&
        typeof table.title === "string",
    ) &&
    typeof value.title === "string" &&
    Array.isArray(value.unavailable_visuals) &&
    value.unavailable_visuals.every(
      (visual) =>
        isRecord(visual) &&
        typeof visual.reason === "string" &&
        typeof visual.title === "string" &&
        isPowerBiGeneratedVisual(visual.visual),
    ) &&
    Array.isArray(value.visuals) &&
    value.visuals.every(isGeneratedReportVisualPreview)
  );
}
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
    { key: "land_opportunity_class", label: "Land opportunity class", role: "category", type: "band" },
    { key: "development_readiness_band", label: "Development readiness", role: "category", type: "band" },
    { key: "growth_pressure_band", label: "Growth pressure", role: "filter", type: "band" },
    { key: "zoning_support_band", label: "Zoning support", role: "filter", type: "band" },
    { key: "flood_constraint_band", label: "Flood constraint", role: "filter", type: "band" },
    { key: "school_service_pressure_band", label: "School/service pressure", role: "filter", type: "band" },
    { key: "economic_opportunity_band", label: "Economic opportunity", role: "filter", type: "band" },
    { key: "sewer_proxy_class", label: "Sewer proxy class", role: "category", type: "band" },
    { key: "utility_readiness_proxy_class", label: "Utility readiness proxy", role: "filter", type: "band" },
    { key: "sewer_proxy_confidence", label: "Sewer proxy confidence", role: "filter", type: "band" },
    { key: "sewer_basin_label", label: "Sewer basin", role: "category", type: "text" },
    { key: "utility_capacity_status", label: "Utility capacity status", role: "filter", type: "text" },
    { key: "planned_extension_status", label: "Planned extension status", role: "filter", type: "text" },
    { key: "acreage_band", label: "Acreage band", role: "filter", type: "band" },
    { key: "due_diligence_flags", label: "Due diligence flags", role: "filter", type: "text" },
    { key: "suggested_next_checks", label: "Suggested next checks", role: "label", type: "text" },
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
    category: "development_readiness_band",
    description: "Screen model-ready land opportunity classes.",
    filterField: "sewer_proxy_class",
    name: "Land Opportunity Screener",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "bar",
  },
  {
    aggregation: "count",
    category: "development_readiness_band",
    description: "Rank candidate rows for screening-level manual review.",
    filterField: "sewer_proxy_class",
    name: "Top Land Review Candidates",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "bar",
  },
  {
    aggregation: "count",
    category: "value_per_acre_band",
    description: "Compare candidate valuation context by safe bands.",
    filterField: "comparison_group",
    name: "Comparable Context",
    table: "parcel_economic_signal_fact",
    value: "signal_id",
    visual: "bar",
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
  "Build a Comparable Context Report.",
  "Build a Top Land Review Candidates Report.",
  "Build a Land Due Diligence Report.",
  "Build a report for underbuilt redevelopment candidates.",
  "Create visuals for economic segment comparison.",
  "Make a fiscal burden dashboard.",
  "Build a scenario comparison dashboard.",
  "Build a Land Opportunity Screener report.",
  "Build a Utility Readiness + Growth Report.",
  "Create a Power BI page for special assets.",
  "Show value per acre by economic segment with caveats.",
];

const askCfsInvestmentResearchPrompts = [
  "Help me find industrial land.",
  "Start an analysis for this property.",
  "What information do I still need?",
  "Explain why this candidate surfaced.",
  "Add this property to my shortlist.",
  "Start a land-banking scenario.",
  "Create a client report from my shortlist.",
  "Review this parcel as a long-term land-banking candidate.",
  "Summarize the market-area context around this candidate.",
  "Summarize the major physical constraints for this candidate.",
  "What environmental due diligence should come next?",
  "How does this tract compare with Cabarrus County?",
  "Summarize development-readiness signals.",
  "Generate a screening-level review guide.",
  "Compare the selected land review candidates.",
  "Explain the major constraint indicators.",
  "Which candidates need utility due diligence?",
  "Which candidates have growth pressure and sewer proximity?",
  "Summarize this case study.",
  "What stage is this project in?",
  "Why did the priority candidate rank first?",
  "Compare the three case-study candidates.",
  "What underwriting assumptions still need review?",
  "Draft a Codex update brief.",
  "Which deliverables are incomplete?",
  "What must be verified before this recommendation is final?",
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
  { label: "Top Land Review Candidates", prompt: "Build a Top Land Review Candidates Report.", type: "top_candidates" },
  { label: "Comparable Context Report", prompt: "Build a Comparable Context Report.", type: "comparable_context" },
  { label: "Parcel Due Diligence Packet", prompt: "Build a Parcel Due Diligence Packet.", type: "due_diligence" },
  { label: "Land Due Diligence Report", prompt: "Build a Land Due Diligence Report.", type: "due_diligence" },
  { label: "Land Opportunity Screener", prompt: "Build a Land Opportunity Screener report.", type: "land_opportunity" },
  { label: "Scenario Comparison", prompt: "Build a scenario comparison dashboard.", type: "scenario" },
  { label: "Data Confidence Report", prompt: "Build a data confidence report.", type: "data_confidence" },
  { label: "Utility Readiness + Growth Report", prompt: "Build a Utility Readiness + Growth Report.", type: "utility" },
  { label: "Underbuilt Parcel Report", prompt: "Build an underbuilt parcel report.", type: "underbuilt" },
  { label: "Tax-Base Opportunity Report", prompt: "Build a tax-base opportunity report.", type: "tax_base" },
  { label: "Special Assets Review", prompt: "Build a special assets review.", type: "special_assets" },
];

const landDueDiligencePriorityBands = [
  "Strong infrastructure-supported review candidate",
  "Good candidate, verify zoning and utilities",
  "Opportunity signal, capacity data needed",
];
const landReviewPresetLabels = [
  "All",
  "Infrastructure-supported candidates",
  "Growth pressure + sewer proximity",
  "Underbuilt + utility proxy",
  "More data needed but interesting",
  "Special assets / compare separately",
];

const landDueDiligenceChecklist = [
  "Verify zoning",
  "Verify recent arms-length sales",
  "Check deed/sale history",
  "Compare similar acreage and zoning",
  "Compare within same economic segment",
  "Confirm usable-area screening limitations",
  "Confirm frontage/access",
  "Review floodplain and mapped wetland context",
  "Verify utility service/capacity with utility provider",
  "Check road frontage/legal access",
  "Check title/easements",
  "Check recent comparable sales",
  "Check site dimensions and physical constraints",
  "Obtain professional wetland delineation if mapped wetland context warrants it",
  "Obtain topographic survey and slope/grading review",
  "Review NRCS soil mapping and geotechnical needs",
  "Review nearby regulated facilities and Phase I environmental due diligence need",
  "Speak with broker/appraiser/planning as needed",
  "Confirm planning cases/permits nearby",
];
const environmentalDueDiligenceChecklist = [
  "Review NWI mapping and local stream or buffer requirements.",
  "Obtain professional wetland delineation if needed.",
  "Obtain topographic survey and review slope/grading feasibility.",
  "Evaluate stormwater and earthwork implications.",
  "Review NRCS soil mapping and obtain geotechnical investigation where appropriate.",
  "Review nearby regulated facilities and consider Phase I environmental site assessment where appropriate.",
  "Verify parcel-specific environmental history before any site conclusion.",
];
const defaultDueDiligenceQuestions = [
  "Is sewer service available under current utility rules?",
  "Is system capacity available for the review scenario?",
  "Is water service available, and which provider should confirm it?",
  "Does zoning support the intended use?",
  "Are there mapped floodplain, wetland, access, easement, or site constraints?",
  "Are road frontage, access, or off-site improvements required?",
  "Are there active or recent planning cases, permits, or subdivision actions nearby?",
];

const landDueDiligenceSafeUseText =
  "CFS provides screening-level planning and infrastructure intelligence. It does not provide buy/sell guidance, appraisal conclusions, utility service verification, or future-value assurances.";
const landDueDiligenceWsaccCaveat =
  "WSACC data supports sewer proximity and subbasin context only. Capacity, water service, and planned extensions were not provided.";
const landDueDiligencePacketCaveats = [
  "Screening-level review only.",
  "Not financial or buy/sell guidance.",
  "Not an appraisal.",
  "Not official utility confirmation.",
  "Not a project approval recommendation.",
  landDueDiligenceWsaccCaveat,
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
  const landOpportunityRows = parcelRows.filter((row) =>
    Boolean(valueText(row.development_readiness_band) || valueText(row.land_opportunity_class)),
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
      available: Boolean(parcelRows.length && landOpportunityRows),
      reason: parcelRows.length ? "Needs development readiness or land opportunity fields." : "Needs parcel economic signal rows.",
      type: "due_diligence",
    },
    {
      available: Boolean(parcelRows.length && landOpportunityRows),
      reason: parcelRows.length ? "Needs development readiness or land opportunity fields." : "Needs parcel economic signal rows.",
      type: "top_candidates",
    },
    {
      available: Boolean(parcelRows.length),
      reason: "Needs parcel economic signal rows.",
      type: "comparable_context",
    },
    {
      available: Boolean(parcelRows.length && landOpportunityRows),
      reason: parcelRows.length ? "Needs development readiness or land opportunity fields." : "Needs parcel economic signal rows.",
      type: "land_opportunity",
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
      : (["executive", "top_candidates", "due_diligence", "land_opportunity", "scenario", "data_confidence", "utility", "underbuilt"] as PowerBiReportType[])
          .find((type) => available.includes(type)) ?? "executive";
  return {
    available_report_types: available,
    best_default_report_type: bestDefault,
    domain_readiness_dim_rows: readinessRows,
    economics_intelligence_summary_available: hasSummary,
    economics_kpi_fact_rows: kpiRows,
    geography_dim_rows: payload?.tables.geography_dim?.length ?? 0,
    land_opportunity_rows: landOpportunityRows,
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
  if (normalized.includes("comparable") || normalized.includes("valuation") || normalized.includes("comps") || normalized.includes("price makes sense") || (normalized.includes("value per acre") && (normalized.includes("candidate") || normalized.includes("compare")))) return "comparable_context";
  if (normalized.includes("top land") || normalized.includes("top candidate") || normalized.includes("top 25") || normalized.includes("review candidate")) return "top_candidates";
  if (normalized.includes("due diligence") || normalized.includes("manual review") || normalized.includes("parcel review") || normalized.includes("parcel packet")) return "due_diligence";
  if (normalized.includes("land opportunity") || normalized.includes("land screener") || normalized.includes("development readiness")) return "land_opportunity";
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

  if (selectedReportType === "comparable_context") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Comparable Context Report",
      `${selectionNote ? `${selectionNote}. ` : ""}Compare land review candidates with assessed-value context, value-per-acre bands, comparison groups, special asset flags, and valuation due diligence notes.`,
      [
        reportPage("Comparable Context", "Use safe bands and groups for manual comps review.", [
          generatedPowerBiVisual({
            axis: "value_per_acre_band",
            caveat: "Value per acre should be compared within similar segment, acreage, geography, and constraint context.",
            source_table: "parcel_economic_signal_fact",
            title: "Value-per-acre band comparison",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "comparison_group",
            caveat: "Comparison groups are screening context; verify with public records and professional review.",
            source_table: "parcel_economic_signal_fact",
            title: "Comparison group summary",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "special_asset_flag",
            caveat: "Special assets should be reviewed separately from ordinary parcel candidates.",
            source_table: "parcel_economic_signal_fact",
            title: "Special asset flags",
            value: "signal_id",
            visual_type: "donut",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            caveat: "Use this table for manual comps review, not a price conclusion.",
            source_table: "parcel_economic_signal_fact",
            title: "Candidate comparable context table",
            value: "recommended_followup",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      [
        "Use comparison_group, economic_segment, acreage_band, geography_label, value_per_acre_band, improvement_to_land_ratio_band, and special_asset_flag.",
        "Verify recent arms-length sales, deed history, public records, constraints, usable acreage, frontage/access, and broker/appraiser context.",
        "CFS provides screening-level valuation context only; it is not an appraisal or price conclusion.",
        ...powerBiReportCaveats,
      ],
    );
  }

  if (selectedReportType === "top_candidates") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Top Land Review Candidates Report",
      `${selectionNote ? `${selectionNote}. ` : ""}Create a screening-level ranked watchlist using development-readiness, sewer-proximity proxy, growth pressure, land opportunity, constraints, and due diligence flags.`,
      [
        reportPage("Top Land Review Candidates", "Rank and explain candidates for manual review sequencing.", [
          generatedPowerBiVisual({
            axis: "development_readiness_band",
            caveat: "Use bands for manual review order; do not treat them as financial guidance.",
            source_table: "parcel_economic_signal_fact",
            title: "Review priority breakdown",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "sewer_proxy_class",
            caveat: "Sewer proximity is a proxy and does not verify utility capacity or water service.",
            source_table: "parcel_economic_signal_fact",
            title: "Sewer proxy x growth pressure",
            value: "growth_pressure_band",
            visual_type: "matrix",
          }),
          generatedPowerBiVisual({
            axis: "land_opportunity_class",
            caveat: "Land opportunity classes are screening labels only.",
            source_table: "parcel_economic_signal_fact",
            title: "Land opportunity class mix",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            caveat: "Use this table to choose rows for manual due diligence and Print.",
            source_table: "parcel_economic_signal_fact",
            title: "Top candidate watchlist table",
            value: "suggested_next_checks",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      [
        "Use development_readiness_band, land_opportunity_class, sewer_proxy_class, growth_pressure_band, due_diligence_flags, and suggested_next_checks as the first fields.",
        "Create a candidate table, then use slicers for sewer_proxy_class, growth_pressure_band, and data_confidence.",
        "Verify planning, utilities, access, title/easements, site dimensions, and constraints before any outside decision.",
        ...powerBiReportCaveats,
      ],
    );
  }

  if (selectedReportType === "due_diligence") {
    const dueDiligenceTitle = normalized.includes("packet")
      ? "Parcel Due Diligence Packet"
      : "Land Due Diligence Report";
    return finalizedPowerBiReportPlan(
      prompt,
      dueDiligenceTitle,
      `${selectionNote ? `${selectionNote}. ` : ""}Create a manual parcel review watchlist using development-readiness, sewer-proximity proxy, growth pressure, constraints, and next-check fields.`,
      [
        reportPage("Land Due Diligence Screener", "Prioritize rows for manual planning, utility, site, and economics review.", [
          generatedPowerBiVisual({
            axis: "land_opportunity_class",
            caveat: "Land opportunity classes are screening labels, not buy/sell guidance.",
            source_table: "parcel_economic_signal_fact",
            title: "Land opportunity class breakdown",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "development_readiness_band",
            caveat: "Readiness bands are screening outputs, not approval or service commitments.",
            source_table: "parcel_economic_signal_fact",
            title: "Development-readiness bands",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "sewer_proxy_class",
            caveat: "Sewer proximity does not verify utility capacity or water service.",
            source_table: "parcel_economic_signal_fact",
            title: "Sewer proxy x growth pressure",
            value: "growth_pressure_band",
            visual_type: "matrix",
          }),
          generatedPowerBiVisual({
            axis: "geography_label",
            caveat: "Use as a watchlist for manual due diligence only.",
            source_table: "parcel_economic_signal_fact",
            title: "Candidate watchlist table",
            value: "suggested_next_checks",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      [
        "Use development_readiness_band, land_opportunity_class, sewer_proxy_class, due_diligence_flags, and suggested_next_checks as first review fields.",
        "Verify zoning, utility service/capacity, access, title/easements, floodplain/wetlands, planning cases, and site constraints before any decision.",
        ...powerBiReportCaveats,
      ],
    );
  }

  if (selectedReportType === "land_opportunity") {
    return finalizedPowerBiReportPlan(
      prompt,
      "Land Opportunity Screener Report",
      `${selectionNote ? `${selectionNote}. ` : ""}Screen model-ready parcel rows by development readiness, sewer-proximity proxy context, and next diligence needs.`,
      [
        reportPage("Land Opportunity Screener", "Prioritize rows for screening-level review.", [
          generatedPowerBiVisual({
            axis: "development_readiness_band",
            caveat: "Readiness bands are screening outputs, not approval or service commitments.",
            source_table: "parcel_economic_signal_fact",
            title: "Development readiness bands",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "sewer_proxy_class",
            caveat: "Sewer proximity does not confirm capacity or water service.",
            source_table: "parcel_economic_signal_fact",
            title: "Land opportunity by sewer proxy",
            value: "signal_id",
            visual_type: "bar",
          }),
          generatedPowerBiVisual({
            axis: "sewer_basin_label",
            caveat: "Subbasin labels provide context for review only.",
            source_table: "parcel_economic_signal_fact",
            title: "Subbasin diligence table",
            value: "suggested_next_checks",
            visual_type: "matrix",
          }),
        ]),
      ],
      relationships,
      [
        "Use development_readiness_band, sewer_proxy_class, and due_diligence_flags as the first slicers.",
        "Capacity, water service, and planned extension data are still needed before site-level conclusions.",
        ...powerBiReportCaveats,
      ],
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
  if (item.due_diligence_packet) return dueDiligencePacketText(item.due_diligence_packet);
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
  if (type === "due_diligence_packet") return "due diligence packet";
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

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown" });
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
      body: "Use ranked bands, presets, Top 25, and comparison tools to sequence manual parcel review.",
      id: "tools-due-diligence",
      targetSelector: '[data-econ-tour="land-top-candidates"]',
      title: "Top candidates",
      why: "This is the parcel review path.",
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
