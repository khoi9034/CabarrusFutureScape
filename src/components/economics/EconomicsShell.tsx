"use client";

import {
  Calculator,
  Database,
  Gauge,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AskCfsPanel } from "@/components/dashboard/AskCfsPanel";
import { useDashboardState } from "@/hooks/useDashboardState";
import { buildApiUrl, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getEconomicsEnterpriseExport,
  getEconomicsIntelligence,
  getEconomicsPowerBiExport,
} from "@/lib/economicsIntelligenceService";
import type {
  EconomicsEnterpriseExportResponse,
  EconomicsIntelligenceResponse,
  EconomicsKpi,
  EconomicsParcelSignal,
  EconomicsPowerBiExportResponse,
  EconomicsReadinessRow,
  EconomicsScenarioInput,
  EconomicsScenarioOutput,
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

  const signals = intelligence?.parcel_economic_signals ?? intelligence?.signals ?? [];
  const watchlist =
    intelligence?.underbuilt_watchlist?.length
      ? intelligence.underbuilt_watchlist
      : (intelligence?.watchlist ?? []);
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

  return (
    <main className="econ-shell relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 lg:p-5">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
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
        {economicsSection === "overview" ? (
          <ExecutiveBriefPage intelligence={intelligence} />
        ) : null}
        {economicsSection === "workspace" ? (
          <EconomicsWorkspacePage
            dataReadiness={intelligence?.data_readiness ?? []}
            onClearSelection={() => setSelectedSignalIds([])}
            onSendSelected={() => setEconomicsSection("enterprise")}
            onToggleSignal={toggleSelectedSignal}
            scenarioOutputs={intelligence?.scenario_outputs ?? []}
            selectedSignalIds={selectedSignalIds}
            selectedSignals={selectedSignals}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {economicsSection === "dashboard" ? (
          <EconomicDashboardPage
            intelligence={intelligence}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {economicsSection === "enterprise" ? (
          <EnterpriseWorkspacePage
            exportPayload={enterpriseExport}
            inputs={intelligence?.scenario_inputs ?? []}
            onNavigate={setEconomicsSection}
            outputs={intelligence?.scenario_outputs ?? []}
            powerBiPayload={powerBiExport}
            scenarios={intelligence?.scenario_templates ?? []}
            selectedSignals={selectedSignals}
          />
        ) : null}
        {economicsSection === "print" ? (
          <EconomicsPrintPage
            intelligence={intelligence}
            selectedSignals={selectedSignals}
          />
        ) : null}
      </div>
    </main>
  );
}

function ExecutiveBriefPage({
  intelligence,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
}) {
  const summary = intelligence?.summary;
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const tourStep = economicsTourSteps[tourStepIndex] ?? economicsTourSteps[0];
  return (
    <>
      <section className="econ-hero rounded-2xl p-6 md:p-8">
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
            <button
              className="mt-5 rounded-xl border border-[var(--econ-gold)]/40 bg-[var(--econ-gold)]/15 px-4 py-2 text-sm font-semibold text-[#ffe6a6] transition hover:border-[var(--econ-gold)]"
              onClick={() => {
                setTourOpen(true);
                setTourStepIndex(0);
              }}
              type="button"
            >
              Start Economics Tour
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
            <EconChip>{summary?.as_of ? `As of ${formatDate(summary.as_of)}` : "Freshness pending"}</EconChip>
          </div>
        </div>
      </section>

      <PageHelper text="Understand the workflow." />

      {tourOpen ? (
        <EconPanel title="CFS Economics guided tour" kicker={`Step ${tourStepIndex + 1} of ${economicsTourSteps.length}`}>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-xl font-semibold text-[var(--econ-text)]">
                {tourStep.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[var(--econ-muted)]">
                {tourStep.text}
              </p>
              <div className="mt-4 grid gap-2 text-sm leading-6 text-[var(--econ-muted)]">
                <p>
                  <span className="font-semibold text-[var(--econ-text)]">Local live data:</span>{" "}
                  Uses the local FastAPI backend and local PostGIS economics data.
                </p>
                <p>
                  <span className="font-semibold text-[var(--econ-text)]">Portfolio demo:</span>{" "}
                  Uses a sanitized cached demo extract for portfolio review.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {economicsTourSteps.map((step, index) => (
                <button
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    index === tourStepIndex
                      ? "border-[var(--econ-gold)] bg-[var(--econ-gold)]/12 text-[#ffe6a6]"
                      : "border-[var(--econ-border)] bg-white/[0.025] text-[var(--econ-muted)] hover:border-[var(--econ-gold)]"
                  }`}
                  key={step.title}
                  onClick={() => setTourStepIndex(index)}
                  type="button"
                >
                  <span className="font-semibold">{index + 1}. {step.title}</span>
                  <span className="mt-1 block text-xs leading-5">{step.short}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
              disabled={tourStepIndex === 0}
              onClick={() => setTourStepIndex((index) => Math.max(0, index - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
              disabled={tourStepIndex === economicsTourSteps.length - 1}
              onClick={() =>
                setTourStepIndex((index) => Math.min(economicsTourSteps.length - 1, index + 1))
              }
              type="button"
            >
              Next
            </button>
            <button
              className="rounded-xl border border-[var(--econ-risk)]/40 px-3 py-2 text-sm font-semibold text-[#ffd1c2] transition hover:border-[var(--econ-risk)]"
              onClick={() => setTourOpen(false)}
              type="button"
            >
              Close tour
            </button>
          </div>
        </EconPanel>
      ) : null}

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
        <EconPanel title="How to use CFS Economics" kicker="Simple workflow">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Start in Workspace.</li>
            <li>Review tables and watchlists.</li>
            <li>Open Economic Dashboard for KPIs and charts.</li>
            <li>Use Enterprise Workspace for Power BI and planning-model exports.</li>
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
            <li>Workspace tables for parcel economics and watchlists.</li>
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
  const [selectedGeography, setSelectedGeography] = useState("All");
  const [selectedOpportunityClass, setSelectedOpportunityClass] = useState("All");
  const [selectedDataConfidence, setSelectedDataConfidence] = useState("All");
  const [selectedScenario, setSelectedScenario] = useState("All");
  const kpis = intelligence?.kpis ?? [];
  const filteredSignals = filterEconomicSignals(signals, {
    dataConfidence: selectedDataConfidence,
    geography: selectedGeography,
    opportunityClass: selectedOpportunityClass,
  });
  const filteredWatchlist = filterEconomicSignals(watchlist, {
    dataConfidence: selectedDataConfidence,
    geography: selectedGeography,
    opportunityClass: selectedOpportunityClass,
  });
  const filteredScenarios =
    selectedScenario === "All"
      ? (intelligence?.scenario_outputs ?? [])
      : (intelligence?.scenario_outputs ?? []).filter(
          (scenario) => scenario.title === selectedScenario,
        );
  const valueBars = topSignals(filteredSignals, "value_per_acre").map((signal) => ({
    label: signal.geography_label ?? signal.parcel_id,
    value: signal.value_per_acre ?? 0,
  }));
  const ratioBars = topSignals(filteredSignals, "improvement_to_land_ratio").map((signal) => ({
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
  const geographyBars =
    selectedGeography === "All"
      ? (intelligence?.jurisdiction_value_summary?.map((row) => ({
          label: row.geography_label ?? "Parcel context",
          value: row.median_value_per_acre ?? 0,
        })) ?? [])
      : valueBars;
  const scenarioRows = scenarioMatrixRows(filteredScenarios);
  const burdenRows = fiscalBurdenRows(filteredSignals, filteredScenarios);
  const geographyOptions = ["All", ...uniqueValues(signals.map((signal) => signal.geography_label).filter(Boolean))];
  const opportunityOptions = ["All", ...uniqueValues(signals.map((signal) => signal.opportunity_class))];
  const confidenceOptions = ["All", ...uniqueValues(signals.map((signal) => signal.economic_data_confidence))];
  const scenarioOptions = ["All", ...uniqueValues((intelligence?.scenario_outputs ?? []).map((scenario) => scenario.title))];
  const summary = intelligence?.summary;
  const resetFilters = () => {
    setSelectedGeography("All");
    setSelectedOpportunityClass("All");
    setSelectedDataConfidence("All");
    setSelectedScenario("All");
  };

  return (
    <>
      <PageHeader
        kicker="Economic Dashboard"
        title="Economic Dashboard"
        text="Growth and tax-base intelligence with Power BI-style visuals, slicers, and explainable screening context."
      />
      <PageHelper text="Review indicators and ask CFS." />
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--econ-border)] bg-white/[0.025] px-4 py-3">
        <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
        <EconChip>Updated {formatDate(intelligence?.as_of ?? summary?.as_of)}</EconChip>
        <span className="text-xs leading-5 text-[var(--econ-muted)]">
          Screening-level economics: not an official appraisal, tax bill, fiscal impact study, or project approval recommendation.
        </span>
      </section>
      <EconomicsSlicerBar
        filters={[
          { label: "Geography / Jurisdiction", onChange: setSelectedGeography, options: geographyOptions, value: selectedGeography },
          { label: "Opportunity Class", onChange: setSelectedOpportunityClass, options: opportunityOptions, value: selectedOpportunityClass },
          { label: "Data Confidence", onChange: setSelectedDataConfidence, options: confidenceOptions, value: selectedDataConfidence },
          { label: "Scenario", onChange: setSelectedScenario, options: scenarioOptions, value: selectedScenario },
        ]}
        onReset={resetFilters}
        selected={[selectedGeography, selectedOpportunityClass, selectedDataConfidence, selectedScenario]}
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <EconPanel title="Parcel Economic Baseline" kicker="Current tax/value context">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Parcels analyzed" value={formatNumber(summary?.total_parcels_analyzed)} />
            <MiniMetric label="Assessed value coverage" value={currency(summary?.total_assessed_value)} />
            <MiniMetric label="Land value" value={currency(summary?.total_land_value)} />
            <MiniMetric label="Improvement value" value={currency(summary?.total_improvement_value)} />
            <MiniMetric label="Typical value / acre" value={currency(summary?.median_value_per_acre)} />
            <MiniMetric label="Data-needed rows" value={formatNumber(summary?.data_needed_count)} />
          </div>
        </EconPanel>
        <EconomicsVisualPanel
          description="Shows how screened parcels/areas are distributed across economic opportunity classes."
          recipe="Table: parcel_economic_signal_fact | Visual: Donut chart | Legend: opportunity_class | Values: Count of signal_id"
          title="Opportunity Class Breakdown"
        >
          <EconomicsDonutChart rows={classBars} />
        </EconomicsVisualPanel>
        <EconomicsVisualPanel
          description="Ranks filtered parcels/areas by value per acre for land-efficiency review."
          recipe="Table: parcel_economic_signal_fact | Visual: Clustered bar chart | Axis: geography_label | Values: value_per_acre_band or value_per_acre"
          title="Value per Acre / Land Efficiency"
        >
          <EconomicsBarChart formatValue={currency} rows={valueBars} />
        </EconomicsVisualPanel>
        <EconomicsVisualPanel
          description="Compares improvement-to-land ratio bands to highlight underbuilt review candidates."
          recipe="Table: parcel_economic_signal_fact | Visual: Horizontal bar chart | Axis: geography_label | Values: improvement_to_land_ratio_band"
          title="Improvement-to-Land Ratio"
        >
          <EconomicsBarChart formatValue={(value) => value.toFixed(2)} rows={ratioBars} />
        </EconomicsVisualPanel>
        <EconomicsVisualPanel
          description="Shows median value-per-acre by available jurisdiction or geography label."
          recipe="Table: geography_dim + parcel_economic_signal_fact | Visual: Bar chart | Axis: geography_label | Values: median value per acre"
          title="Jurisdiction / Geography Summary"
        >
          <EconomicsBarChart formatValue={currency} rows={geographyBars} />
        </EconomicsVisualPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <EconomicsVisualPanel
          description="Compares scenario output bands without exposing raw scores."
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
        <EconomicsVisualPanel
          description="Shows confidence distribution for the currently filtered parcel signals."
          recipe="Table: parcel_economic_signal_fact | Visual: Donut chart | Legend: data_confidence | Values: Count of signal_id"
          title="Data Confidence Visual"
        >
          <EconomicsDonutChart rows={confidenceBars} />
        </EconomicsVisualPanel>
        <EconomicsVisualPanel
          description="Shows domain readiness, current use, and next data need."
          recipe="Table: domain_readiness_dim | Visual: Matrix | Rows: domain_name | Columns: data_status, current_use, next_data_need"
          title="Data Confidence Register"
        >
          <EconomicsReadinessMatrix rows={intelligence?.data_readiness ?? []} />
        </EconomicsVisualPanel>
      </section>
      <EconPanel title="Underbuilt Redevelopment Watchlist" kicker="Filtered table">
        <SignalTable signals={filteredWatchlist.slice(0, 8)} />
      </EconPanel>
      <EconPanel title="Ask CFS Economics" kicker="Analyst assistant">
        <AskCfsPanel appMode="economics" visiblePromptCount={6} />
      </EconPanel>
    </>
  );
}

function EconomicsWorkspacePage({
  dataReadiness,
  onClearSelection,
  onSendSelected,
  onToggleSignal,
  scenarioOutputs,
  selectedSignalIds,
  selectedSignals,
  signals,
  watchlist,
}: {
  dataReadiness: EconomicsReadinessRow[];
  onClearSelection: () => void;
  onSendSelected: () => void;
  onToggleSignal: (signal: EconomicsParcelSignal) => void;
  scenarioOutputs: EconomicsScenarioOutput[];
  selectedSignalIds: string[];
  selectedSignals: EconomicsParcelSignal[];
  signals: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
}) {
  const taxBaseSignals = signals
    .filter(
      (signal) =>
        signal.economic_status_band === "tax_base_opportunity" ||
        signal.opportunity_class === "Tax-Base Opportunity",
    )
    .slice(0, 8);
  const dataNeededSignals = signals
    .filter((signal) => signal.economic_status_band === "data_needed")
    .slice(0, 8);
  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Economic tables and watchlists"
        text="Select parcel and area economics rows, review opportunity signals, and send the useful set into the Enterprise Workspace for model/export work."
      />
      <PageHelper text="Select rows from economic tables." />
      <SelectedRowsTray
        onClear={onClearSelection}
        onSend={onSendSelected}
        selectedSignals={selectedSignals}
      />
      <section className="grid gap-4">
        <EconPanel
          description="Starting table for parcel value, acreage, value-per-acre context, improvement ratio, geography, and confidence."
          kicker="Baseline"
          title="Parcel Economic Baseline"
        >
          <SelectableSignalTable
            onToggle={onToggleSignal}
            selectedIds={selectedSignalIds}
            signals={signals.slice(0, 12)}
          />
        </EconPanel>
        <EconPanel
          description="Rows where land value, acreage, and improvement context suggest a screening-level redevelopment review."
          kicker="Redevelopment"
          title="Underbuilt / Redevelopment Watchlist"
        >
          <SelectableSignalTable
            onToggle={onToggleSignal}
            selectedIds={selectedSignalIds}
            signals={watchlist.slice(0, 12)}
          />
        </EconPanel>
        <EconPanel
          description="Areas where current value context and development pressure may justify deeper tax-base diligence."
          kicker="Value screen"
          title="Tax-Base Opportunity"
        >
          <SelectableSignalTable
            onToggle={onToggleSignal}
            selectedIds={selectedSignalIds}
            signals={taxBaseSignals}
          />
        </EconPanel>
        <EconPanel
          description="Scenario output bands that can be used as starting assumptions in the Enterprise Workspace."
          kicker="Scenario fit"
          title="Scenario Candidates"
        >
          <ScenarioOutputList rows={scenarioOutputs} />
        </EconPanel>
        <EconPanel
          description="Shows which economic inputs are strong, partial, or still data-needed before a recommendation."
          kicker="Confidence"
          title="Data Readiness"
        >
          <ReadinessTable rows={dataReadiness} />
        </EconPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <EconPanel title="Recommended Next Diligence" kicker="Consulting checklist">
          <ul className="space-y-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Verify parcel value, land value, improvement value, and acreage.</li>
            <li>Compare permit activity with floodplain, school, utility, and transportation context.</li>
            <li>Document scenario assumptions before using tax-base lift bands.</li>
          </ul>
        </EconPanel>
        <EconPanel title="Data-needed rows" kicker="Confidence blockers">
          <SignalTable signals={dataNeededSignals} />
        </EconPanel>
        <EconPanel title="Public Cost Risk Flag" kicker="Service burden">
          <BurdenRows />
        </EconPanel>
      </section>
    </>
  );
}

function EnterpriseWorkspacePage({
  exportPayload,
  inputs,
  onNavigate,
  outputs,
  powerBiPayload,
  scenarios,
  selectedSignals,
}: {
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onNavigate: (section: "workspace" | "print") => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
  scenarios: EconomicsScenarioTemplate[];
  selectedSignals: EconomicsParcelSignal[];
}) {
  const [selectedOutput, setSelectedOutput] =
    useState<EnterpriseOutputKind>("scenario");
  return (
    <>
      <PageHeader
        kicker="Enterprise Workspace"
        title="Enterprise Workspace"
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
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4">
          <EnterpriseSelectedRowsPanel
            onGoToWorkspace={() => onNavigate("workspace")}
            selectedSignals={selectedSignals}
          />
          <EconPanel title="Step 2 - Choose Output" kicker="Output type">
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
            exportPayload={exportPayload}
            inputs={inputs}
            onNavigate={onNavigate}
            outputs={outputs}
            powerBiPayload={powerBiPayload}
            scenarios={scenarios}
            selectedOutput={selectedOutput}
            selectedSignals={selectedSignals}
          />
        </div>
        <EconPanel title="Ask CFS Economics" kicker="Assistant">
          <AskCfsPanel appMode="economics" visiblePromptCount={6} />
        </EconPanel>
      </section>
    </>
  );
}

function EnterpriseSelectedRowsPanel({
  onGoToWorkspace,
  selectedSignals,
}: {
  onGoToWorkspace: () => void;
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
            No rows selected yet. Start in Workspace, pick the useful rows, then return here.
          </p>
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
            onClick={onGoToWorkspace}
            type="button"
          >
            Go to Workspace to select rows
          </button>
        </div>
      )}
    </EconPanel>
  );
}

function EconomicsPrintPage({
  intelligence,
  selectedSignals,
}: {
  intelligence: EconomicsIntelligenceResponse | null;
  selectedSignals: EconomicsParcelSignal[];
}) {
  const summary = intelligence?.summary;
  const snapshotRows = selectedSignals;
  return (
    <>
      <PageHeader
        kicker="Print"
        title="Economic snapshot"
        text="Printable screening-level summary for selected rows, economic baseline, opportunity class, service burden, scenario context, confidence, caveats, and next diligence."
      />
      <PageHelper text="Prepare a simple snapshot for review." />
      <section className="grid gap-4 xl:grid-cols-3">
        <EconPanel title="Economic baseline" kicker="Snapshot">
          <div className="grid gap-3">
            <MiniMetric label="Parcels analyzed" value={formatNumber(summary?.total_parcels_analyzed)} />
            <MiniMetric label="Assessed value coverage" value={currency(summary?.total_assessed_value)} />
            <MiniMetric label="Typical value per acre" value={currency(summary?.median_value_per_acre)} />
          </div>
        </EconPanel>
        <EconPanel title="Fiscal / service burden" kicker="Risk context">
          <BurdenRows />
        </EconPanel>
        <EconPanel title="Data confidence" kicker="Caveats">
          <ReadinessTable rows={intelligence?.data_readiness ?? []} />
        </EconPanel>
      </section>
      <EconPanel title="Selected rows / selected area" kicker="Print queue">
        {snapshotRows.length ? (
          <SignalTable signals={snapshotRows} />
        ) : (
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            Select rows in Workspace and send them to Enterprise Workspace or
            Print to build an economic snapshot.
          </p>
        )}
      </EconPanel>
      <section className="grid gap-4 xl:grid-cols-2">
        <EconPanel title="Scenario summary" kicker="Output bands">
          <ScenarioOutputList rows={intelligence?.scenario_outputs ?? []} />
        </EconPanel>
        <EconPanel title="Recommended next diligence" kicker="Follow-up">
          <ul className="space-y-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Verify source value, acreage, and land/improvement fields.</li>
            <li>Compare opportunity class with service burden and data confidence.</li>
            <li>Document assumptions before using scenario output bands.</li>
            <li>Keep caveats visible on any printed stakeholder summary.</li>
          </ul>
        </EconPanel>
      </section>
    </>
  );
}

function EnterpriseToolsPage({
  exportPayload,
  inputs,
  onNavigate,
  outputs,
  powerBiPayload,
  scenarios,
  selectedOutput,
  selectedSignals,
}: {
  exportPayload: EconomicsEnterpriseExportResponse | null;
  inputs: EconomicsScenarioInput[];
  onNavigate: (section: "workspace" | "print") => void;
  outputs: EconomicsScenarioOutput[];
  powerBiPayload: EconomicsPowerBiExportResponse | null;
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
      <EconPanel title="Step 3 - Configure" kicker={enterpriseOutputLabel(selectedOutput)}>
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
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Flat CSV Tables
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">
                Download each flat fact/dimension table for the beginner Power BI Desktop path.
              </p>
            </div>
            <CsvDownloadTable rows={csvRows} />
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
            <DetailsBlock summary="Evidence Pack details" hint="Evidence sections, risk flags, assumptions, and caveats.">
              <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
                {decisionPackPreview}
              </pre>
            </DetailsBlock>
          </div>
        ) : null}
      </EconPanel>
      <EconPanel title="Step 4 - Export / Next Step" kicker={enterpriseOutputLabel(selectedOutput)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {selectedOutput === "scenario" ? (
            <>
              <ActionButton label="Copy decision memo" onClick={() => void copyText("Decision memo", scenarioMemoText)} />
              <ActionButton label="Send to Print" onClick={() => onNavigate("print")} />
            </>
          ) : null}
          {selectedOutput === "powerbi" ? (
            <>
              <ActionButton label="Download CSV tables" onClick={() => void copyText("CSV import order", importOrderNotes)} />
              <ActionButton label="Open Power BI Desktop" onClick={() => void copyText("Power BI reminder", "Open Power BI Desktop, then Get Data -> Text/CSV.")} />
              <ActionButton label="Copy import checklist" onClick={() => void copyText("QA checklist", qaChecklistNotes)} />
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
          <QaChecklist onCopy={() => void copyText("QA checklist", qaChecklistNotes)} />
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

function QaChecklist({ onCopy }: { onCopy: () => void }) {
  return (
    <div className="grid gap-3">
      <button
        className="w-fit rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
        onClick={onCopy}
        type="button"
      >
        Copy QA Checklist
      </button>
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
  kicker,
  text,
  title,
}: {
  kicker: string;
  text: string;
  title: string;
}) {
  return (
    <section className="econ-panel rounded-2xl p-5 md:p-6">
      <p className="econ-eyebrow">{kicker}</p>
      <h1 className="mt-2 text-3xl font-semibold text-[var(--econ-text)]">
        {title}
      </h1>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--econ-muted)]">
        {text}
      </p>
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
}: {
  children: ReactNode;
  description?: string;
  kicker: string;
  title: string;
}) {
  return (
    <section className="econ-panel rounded-2xl p-4 md:p-5">
      <p className="econ-eyebrow">{kicker}</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--econ-text)]">
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

function EconChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--econ-gold)]/30 bg-[var(--econ-gold)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f7dc93]">
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {filters.map((filter) => (
          <label className="grid gap-1 text-xs text-[var(--econ-muted)]" key={filter.label}>
            <span className="font-semibold uppercase tracking-[0.12em]">{filter.label}</span>
            <select
              className="rounded-xl border border-[var(--econ-border)] bg-[#11151b] px-3 py-2 text-sm text-[var(--econ-text)] outline-none focus:border-[var(--econ-gold)]"
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
          className="self-end rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
          onClick={onReset}
          type="button"
        >
          Reset filters
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
    <EconPanel description={description} kicker="Visual analytics" title={title}>
      {children}
      <DetailsBlock summary="Power BI recipe" hint="Source table, visual type, and fields.">
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

function SelectableSignalTable({
  onToggle,
  selectedIds,
  signals,
}: {
  onToggle: (signal: EconomicsParcelSignal) => void;
  selectedIds: string[];
  signals: EconomicsParcelSignal[];
}) {
  if (!signals.length) {
    return <p className="text-sm text-[var(--econ-muted)]">No rows available.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--econ-border)]">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-white/[0.035] text-[10px] uppercase tracking-[0.12em] text-[var(--econ-muted)]">
          <tr>
            <th className="px-3 py-2">Select</th>
            <th className="px-3 py-2">Area / parcel label</th>
            <th className="px-3 py-2">Acreage</th>
            <th className="px-3 py-2">Value / acre band</th>
            <th className="px-3 py-2">Improvement ratio</th>
            <th className="px-3 py-2">Jurisdiction / geography</th>
            <th className="px-3 py-2">Opportunity class</th>
            <th className="px-3 py-2">Data confidence</th>
            <th className="px-3 py-2">Recommended follow-up</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => {
            const selected = selectedIds.includes(signal.parcel_id);
            return (
              <tr
                className={selected ? "bg-[var(--econ-gold)]/10" : "bg-transparent"}
                key={signal.parcel_id}
              >
                <td className="border-t border-[var(--econ-border)] px-3 py-2">
                  <button
                    className="rounded-lg border border-[var(--econ-border)] px-2 py-1 text-xs font-semibold text-[var(--econ-text)] hover:border-[var(--econ-gold)]"
                    onClick={() => onToggle(signal)}
                    type="button"
                  >
                    {selected ? "Selected" : "Select"}
                  </button>
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 font-semibold text-[var(--econ-text)]">
                  {signal.geography_label ?? signal.parcel_id}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.acreage?.toFixed(2) ?? "Not available"}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {currency(signal.value_per_acre)}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.improvement_to_land_ratio?.toFixed(2) ?? "Not available"}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.geography_label ?? "Parcel context"}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.opportunity_class}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.economic_data_confidence}
                </td>
                <td className="border-t border-[var(--econ-border)] px-3 py-2 text-[var(--econ-muted)]">
                  {signal.recommended_followup}
                </td>
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
  onSend,
  selectedSignals,
}: {
  actions?: boolean;
  onClear: () => void;
  onSend: () => void;
  selectedSignals: EconomicsParcelSignal[];
}) {
  return (
    <EconPanel title="Selected for Enterprise Workspace" kicker="Row tray">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {selectedSignals.length ? (
            selectedSignals.slice(0, 8).map((signal) => (
              <EconChip key={signal.parcel_id}>
                {signal.geography_label ?? signal.parcel_id}
              </EconChip>
            ))
          ) : (
            <p className="text-sm text-[var(--econ-muted)]">
              Select rows from the workspace tables to move them into model and export work.
            </p>
          )}
        </div>
        {actions ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
            disabled={!selectedSignals.length}
            onClick={onSend}
            type="button"
          >
            Send selected to Enterprise Workspace
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
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div
          className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3"
          key={row.domain}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--econ-text)]">{row.domain}</p>
            <span className="rounded border border-[var(--econ-gold)]/25 bg-[var(--econ-gold)]/10 px-2 py-0.5 text-[10px] uppercase text-[#f7dc93]">
              {row.data_status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--econ-muted)]">{row.current_use}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">{row.gap_or_next_need}</p>
        </div>
      ))}
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

function BurdenRows() {
  return (
    <div className="grid gap-2">
      {burdenRows.map((row) => (
        <div
          className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2"
          key={row.label}
        >
          <p className="text-sm font-semibold text-[var(--econ-text)]">
            {row.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--econ-muted)]">
            {row.text}
          </p>
        </div>
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

function filterEconomicSignals(
  signals: EconomicsParcelSignal[],
  filters: { dataConfidence: string; geography: string; opportunityClass: string },
) {
  return signals.filter((signal) => {
    const geography = signal.geography_label ?? "Parcel context";
    return (
      (filters.geography === "All" || geography === filters.geography) &&
      (filters.opportunityClass === "All" || signal.opportunity_class === filters.opportunityClass) &&
      (filters.dataConfidence === "All" || signal.economic_data_confidence === filters.dataConfidence)
    );
  });
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
    text: "Review the rows selected from Economics Workspace.",
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
    kind: "scenario",
    text: "Adjust assumptions and review output bands.",
    title: "Scenario Model",
  },
  {
    kind: "powerbi",
    text: "Download CSV tables or preview the JSON pack.",
    title: "Power BI Export",
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
  "No owner/mailing fields imported.",
  "No raw scores imported.",
  "No tax bill fields imported.",
  "scenario_id exists in scenario_output_fact.",
  "scenario_id exists in scenario_dim.",
  "geography_label exists in parcel_economic_signal_fact.",
  "geography_label exists in geography_dim.",
  "Relationships are created in Power BI.",
  "Report caveats are visible.",
  "Slicers are checked for blank or missing values.",
];

const economicsTourSteps = [
  {
    short: "What CFS Economics does.",
    text: "Start here to understand the workflow: parcel economic baseline, underbuilt redevelopment watchlist, tax-base opportunity, fiscal/service burden context, and enterprise export-ready tables.",
    title: "Overview",
  },
  {
    short: "Review and select economic rows.",
    text: "Use Workspace tables to compare parcel economics, data confidence, watchlists, tax-base opportunity, and scenario candidates. Select useful rows before moving into enterprise outputs.",
    title: "Workspace",
  },
  {
    short: "Monitor indicators and Ask CFS.",
    text: "Use Economic Dashboard for KPIs, charts, watchlist summaries, data confidence, and Ask CFS Economics questions.",
    title: "Economic Dashboard",
  },
  {
    short: "Send rows into scenario, BI, and model workflows.",
    text: "Use Enterprise Workspace to turn selected rows into scenario outputs, Power BI Desktop tables, planning model schemas, and decision-pack previews.",
    title: "Enterprise Workspace",
  },
  {
    short: "Create a simple economic snapshot.",
    text: "Use Print to assemble a presentation-ready economic snapshot with selected rows, baseline context, scenario summary, caveats, and next diligence.",
    title: "Print",
  },
];

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

const burdenRows = [
  {
    label: "Growth pressure",
    text: "Observed permit activity can indicate review workload and investment demand.",
  },
  {
    label: "School pressure",
    text: "Preliminary school capacity watch informs fiscal/service tradeoff review.",
  },
  {
    label: "Floodplain review",
    text: "Flood context can reduce confidence in otherwise high-value opportunities.",
  },
  {
    label: "Utility readiness",
    text: "Utility capacity remains a proxy until official capacity data is available.",
  },
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
