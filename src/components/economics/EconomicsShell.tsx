"use client";

import {
  BarChart3,
  Calculator,
  Database,
  FileJson,
  Gauge,
  Layers3,
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
  const { economicsSection } = useDashboardState();
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [enterpriseExport, setEnterpriseExport] =
    useState<EconomicsEnterpriseExportResponse | null>(null);
  const [powerBiExport, setPowerBiExport] =
    useState<EconomicsPowerBiExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="econ-shell relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 lg:p-5">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
        {error ? (
          <div className="rounded-xl border border-[var(--econ-risk)]/30 bg-[var(--econ-risk)]/10 px-4 py-3 text-sm text-[#ffd1c2]">
            Economics data is unavailable in this mode: {error}
          </div>
        ) : null}
        {economicsSection === "executive" ? (
          <ExecutiveBriefPage intelligence={intelligence} />
        ) : null}
        {economicsSection === "dashboard" ? (
          <EconomicDashboardPage
            intelligence={intelligence}
            signals={signals}
            watchlist={watchlist}
          />
        ) : null}
        {economicsSection === "parcel_screen" ? (
          <ParcelScreenPage signals={signals} watchlist={watchlist} />
        ) : null}
        {economicsSection === "scenario_lab" ? (
          <ScenarioLabPage
            inputs={intelligence?.scenario_inputs ?? []}
            outputs={intelligence?.scenario_outputs ?? []}
            scenarios={intelligence?.scenario_templates ?? []}
          />
        ) : null}
        {economicsSection === "enterprise_tools" ? (
          <EnterpriseToolsPage
            exportPayload={enterpriseExport}
            powerBiPayload={powerBiExport}
          />
        ) : null}
        {economicsSection === "methodology" ? <EconomicsMethodologyPage /> : null}
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
  return (
    <>
      <section className="econ-hero rounded-2xl p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="econ-eyebrow">Executive Brief</p>
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
          <div className="flex flex-wrap gap-2">
            <EconChip>{USE_DEMO_DATA ? "Portfolio Demo / cached demo extract" : "Local Live Data"}</EconChip>
            <EconChip>{summary?.as_of ? `As of ${formatDate(summary.as_of)}` : "Freshness pending"}</EconChip>
          </div>
        </div>
      </section>

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
        <EconPanel title="Executive signal" kicker="County economics">
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
        <EconPanel title="Decision questions" kicker="Use this first">
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
  const kpis = intelligence?.kpis ?? [];
  const valueBars = topSignals(signals, "value_per_acre").map((signal) => ({
    label: signal.geography_label ?? signal.parcel_id,
    value: signal.value_per_acre ?? 0,
  }));
  const ratioBars = topSignals(signals, "improvement_to_land_ratio").map((signal) => ({
    label: signal.geography_label ?? signal.parcel_id,
    value: signal.improvement_to_land_ratio ?? 0,
  }));
  const classBars =
    intelligence?.opportunity_class_breakdown?.map((row) => ({
      label: row.opportunity_class,
      value: row.count,
    })) ?? [];
  const geographyBars =
    intelligence?.jurisdiction_value_summary?.map((row) => ({
      label: row.geography_label ?? "Parcel context",
      value: row.median_value_per_acre ?? 0,
    })) ?? [];
  const summary = intelligence?.summary;

  return (
    <>
      <PageHeader
        kicker="Economic Dashboard"
        title="Growth & Tax Base Intelligence"
        text="Executive KPIs, scorecards, watchlists, and data confidence for parcel-based fiscal screening."
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
            <MiniMetric label="Median value / acre" value={currency(summary?.median_value_per_acre)} />
            <MiniMetric label="Data-needed rows" value={formatNumber(summary?.data_needed_count)} />
          </div>
        </EconPanel>
        <EconPanel title="Value per acre distribution" kicker="Parcel baseline">
          <BarList rows={valueBars} formatValue={currency} />
        </EconPanel>
        <EconPanel title="Opportunity Class Breakdown" kicker="Scorecard">
          <BarList rows={classBars} />
        </EconPanel>
        <EconPanel title="Improvement-to-Land Ratio" kicker="Underbuilt screen">
          <BarList rows={ratioBars} formatValue={(value) => value.toFixed(2)} />
        </EconPanel>
        <EconPanel title="Jurisdiction / geography value summary" kicker="Market context">
          <BarList rows={geographyBars} formatValue={currency} />
        </EconPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <EconPanel title="Underbuilt Redevelopment Watchlist" kicker="Parcel screen">
          <SignalTable signals={watchlist.slice(0, 8)} />
        </EconPanel>
        <EconPanel title="Fiscal / Service Burden Panel" kicker="Constraint-adjusted opportunity">
          <BurdenRows />
        </EconPanel>
      </section>
      <EconPanel title="Data Confidence Register" kicker="Readiness">
        <ReadinessTable rows={intelligence?.data_readiness ?? []} />
      </EconPanel>
      <EconPanel title="Ask CFS Economics" kicker="Analyst assistant">
        <AskCfsPanel appMode="economics" />
      </EconPanel>
    </>
  );
}

function ParcelScreenPage({
  signals,
  watchlist,
}: {
  signals: EconomicsParcelSignal[];
  watchlist: EconomicsParcelSignal[];
}) {
  const featured = watchlist[0] ?? signals[0] ?? null;
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
        kicker="Parcel Screen"
        title="Parcel / Area Economic Profile"
        text="Consulting-style parcel screening for baseline value, improvement ratio, opportunity class, burden context, and next diligence."
      />
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <EconPanel title="Parcel Economic Baseline" kicker="Highest-priority signal">
          {featured ? (
            <div className="grid gap-3">
              <MiniMetric label="Area / parcel" value={featured.geography_label ?? featured.parcel_id} />
              <MiniMetric label="Value per acre" value={currency(featured.value_per_acre)} />
              <MiniMetric label="Assessed value" value={currency(featured.assessed_value)} />
              <MiniMetric label="Land value" value={currency(featured.land_value)} />
              <MiniMetric label="Improvement value" value={currency(featured.improvement_value)} />
              <MiniMetric label="Improvement-to-land ratio" value={featured.improvement_to_land_ratio?.toFixed(2) ?? "Not available"} />
              <MiniMetric label="Estimated county tax" value={currency(featured.estimated_county_tax_screening)} />
              <MiniMetric label="Opportunity class" value={featured.opportunity_class} />
              <MiniMetric label="Data confidence" value={featured.economic_data_confidence} />
              <EvidenceList items={featured.evidence} />
              <p className="text-sm leading-7 text-[var(--econ-muted)]">
                Recommended next diligence: {featured.recommended_followup}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--econ-muted)]">
              Select a watchlist row when parcel economics signals are available.
            </p>
          )}
        </EconPanel>
        <EconPanel title="Underbuilt candidates" kicker="Screening table">
          <SignalTable signals={watchlist.slice(0, 10)} />
        </EconPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <EconPanel title="Tax-base opportunity signals" kicker="Value screen">
          <SignalTable signals={taxBaseSignals} />
        </EconPanel>
        <EconPanel title="Data-needed parcel / area signals" kicker="Confidence blockers">
          <SignalTable signals={dataNeededSignals} />
        </EconPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <EconPanel title="Location Context" kicker="Supporting, not map-first">
          <div className="rounded-xl border border-[var(--econ-border)] bg-[linear-gradient(90deg,rgba(216,184,106,0.08)_1px,transparent_1px),linear-gradient(rgba(216,184,106,0.06)_1px,transparent_1px)] bg-[length:28px_28px] p-5 text-sm leading-7 text-[var(--econ-muted)]">
            Location context belongs here as a compact supporting view. The
            economics workflow starts from scorecards, tables, assumptions, and
            evidence rather than the planning layer stack.
          </div>
        </EconPanel>
        <EconPanel title="Public Cost Risk Flag" kicker="Service burden">
          <BurdenRows />
        </EconPanel>
        <EconPanel title="Recommended Next Diligence" kicker="Consulting checklist">
          <ul className="space-y-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Verify parcel value, land value, improvement value, and acreage.</li>
            <li>Compare permit activity with floodplain, school, utility, and transportation context.</li>
            <li>Document scenario assumptions before using tax-base lift bands.</li>
          </ul>
        </EconPanel>
      </section>
    </>
  );
}

function ScenarioLabPage({
  inputs,
  outputs,
  scenarios,
}: {
  inputs: EconomicsScenarioInput[];
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
  const currentOutput = calculateScenarioOutput({
    ...initialScenarioAssumptions,
    scenarioId: "current_conditions",
  });
  const alternativeOutput = calculateScenarioOutput({
    ...assumptions,
    scenarioId:
      assumptions.scenarioId === "industrial_employment"
        ? "residential_growth"
        : "industrial_employment",
  });
  const memo = scenarioDecisionMemo(selectedScenario.title, assumptions, output);
  const evidencePack = scenarioEvidencePack(inputs, assumptions, output);
  const updateAssumption = (key: keyof ScenarioAssumptions, value: string) => {
    setAssumptions((current) => ({ ...current, [key]: value }));
  };
  return (
    <>
      <PageHeader
        kicker="Scenario Lab"
        title="Economic planning model"
        text="Select a scenario, adjust assumptions, review output bands, and generate a screening-level consulting memo."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scenarioRows.map((scenario) => (
          <button
            className={`econ-card rounded-2xl p-4 text-left transition ${
              assumptions.scenarioId === scenario.id
                ? "border-[var(--econ-gold)]/60 bg-[var(--econ-gold)]/10"
                : ""
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
            <Calculator className="h-5 w-5 text-[var(--econ-gold)]" />
            <h2 className="mt-3 text-base font-semibold text-[var(--econ-text)]">
              {scenario.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
              {scenario.what_it_tests}
            </p>
          </button>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <EconPanel title="Assumption Controls" kicker="Inputs">
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
        </EconPanel>
        <EconPanel title="Scenario Output" kicker="Output bands">
          <ScenarioBandGrid output={output} />
        </EconPanel>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <EconPanel title="Scenario Comparison Matrix" kicker="Comparison">
          <ScenarioComparisonMatrix
            rows={[
              { label: "Current Conditions", output: currentOutput },
              { label: selectedScenario.title, output },
              { label: "Alternative scenario", output: alternativeOutput },
            ]}
          />
        </EconPanel>
        <EconPanel title="Evidence Pack" kicker="Evidence">
          <Matrix rows={evidencePack} />
        </EconPanel>
      </section>
      <EconPanel title="Decision memo" kicker="Consulting output">
        <Matrix rows={memo} />
      </EconPanel>
      <EconPanel title="Reference scenario bands" kicker="Export baseline">
        <ScenarioOutputList rows={outputs.length ? outputs : fallbackScenarioOutputs} />
      </EconPanel>
    </>
  );
}

function EnterpriseToolsPage({
  exportPayload,
  powerBiPayload,
}: {
  exportPayload: EconomicsEnterpriseExportResponse | null;
  powerBiPayload: EconomicsPowerBiExportResponse | null;
}) {
  const [powerBiPreviewMode, setPowerBiPreviewMode] = useState<"summary" | "json">("summary");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const preview = JSON.stringify(
    exportPayload?.exports?.power_bi ?? { status: "Loading export preview" },
    null,
    2,
  );
  const powerBiPreview =
    powerBiPreviewMode === "json"
      ? JSON.stringify(powerBiPayload ?? { status: "Loading Power BI export pack" }, null, 2)
      : JSON.stringify(powerBiTableSummary(powerBiPayload), null, 2);
  const reportBuilderGuide = powerBiPayload?.report_builder_guide;
  const csvRows = powerBiCsvRows(powerBiPayload);
  const relationshipNotes = powerBiRelationshipNotes(powerBiPayload);
  const reportLayoutNotes = powerBiReportLayoutNotes(powerBiPayload);
  const importOrderNotes = powerBiCsvImportOrderNotes(csvRows);
  const qaChecklistNotes = powerBiImportQaChecklist.join("\n");
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
      <PageHeader
        kicker="Enterprise Tools"
        title="Consulting toolkit and export-ready analytics"
        text="Facts, dimensions, measures, scenarios, evidence packs, and connector-ready payloads without external credentials."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {enterpriseCards.map((card) => (
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
      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <EconPanel title="Planning Model Schema" kicker="Dimensions and measures">
          <Matrix rows={[...planningRows, ...measureRows]} />
        </EconPanel>
        <EconPanel title="Power BI-style Dataset Preview" kicker="Export-ready tables">
          <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
            {preview}
          </pre>
        </EconPanel>
      </section>
      <EconPanel title="Power BI Desktop Practice Pack" kicker="Manual BI workflow">
        <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-4 text-sm leading-6 text-[var(--econ-muted)]">
            <p>
              Export-ready tables for Power BI Desktop practice. This is not
              Power BI Embedded, does not require credentials, and can later
              become a semantic model.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              {powerBiWorkflowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="grid gap-2">
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                onClick={() => setPowerBiPreviewMode("summary")}
                type="button"
              >
                Preview Power BI tables
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={downloadPowerBiPack}
                type="button"
              >
                Download Power BI JSON Pack
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={() => void copyText("Relationship notes", relationshipNotes)}
                type="button"
              >
                Copy table relationship notes
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)] disabled:opacity-50"
                disabled={!powerBiPayload}
                onClick={() => void copyText("Suggested report layout", reportLayoutNotes)}
                type="button"
              >
                Copy suggested report layout
              </button>
              <button
                className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-left text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
                onClick={() => setPowerBiPreviewMode("json")}
                type="button"
              >
                Preview full JSON pack
              </button>
            </div>
            {copyStatus ? (
              <p className="rounded-lg border border-[var(--econ-green)]/30 bg-[var(--econ-green)]/10 px-3 py-2 text-xs text-[var(--econ-green)]">
                {copyStatus}
              </p>
            ) : null}
          </div>
          <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]">
            {powerBiPreview}
          </pre>
        </div>
      </EconPanel>
      <EconPanel title="Flat CSV Tables" kicker="Beginner Power BI path">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-[var(--econ-muted)]">
            CSV is easier for learning in Power BI Desktop: download each flat
            fact/dimension table, use Get Data -&gt; Text/CSV, then create the two
            starter relationships. The JSON pack remains better for app-to-app
            integration; embedded Power BI comes later.
          </p>
          <div className="flex flex-wrap gap-2">
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
              Copy relationship notes
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[var(--econ-muted)]">
                <tr>
                  <th className="px-3 py-2">Table name</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Suggested visual</th>
                  <th className="px-3 py-2">Download</th>
                </tr>
              </thead>
              <tbody>
                {csvRows.map((row) => (
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
                    <td className="border-y border-[var(--econ-border)] px-3 py-3 text-[var(--econ-muted)]">
                      {row.suggested_visual}
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
        </div>
      </EconPanel>
      <EconPanel title="Power BI Import QA Checklist" kicker="Final CSV check">
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[var(--econ-muted)]">
              Use this after importing the flat CSV tables into Power BI Desktop.
              It catches the common beginner mistakes: missing headers, missing
              join fields, unsafe fields, and slicers that filter to blanks.
            </p>
            <button
              className="rounded-xl border border-[var(--econ-border)] px-3 py-2 text-sm font-semibold text-[var(--econ-text)] transition hover:border-[var(--econ-gold)]"
              onClick={() => void copyText("QA checklist", qaChecklistNotes)}
              type="button"
            >
              Copy QA Checklist
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
      </EconPanel>
      <EconPanel title="Power BI Report Builder Guide" kicker="Desktop report recipe">
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Import steps
              </h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-[var(--econ-muted)]">
                {(reportBuilderGuide?.import_steps ?? powerBiWorkflowSteps).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Relationship model
              </h2>
              <div className="mt-2 grid gap-2">
                {(reportBuilderGuide?.relationships ?? powerBiPayload?.relationships ?? []).map((row) => (
                  <div
                    className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] p-3 text-sm text-[var(--econ-muted)]"
                    key={`${row.from_table}-${row.from_column}-${row.to_table}`}
                  >
                    <span className="font-semibold text-[var(--econ-text)]">
                      {row.from_table}.{row.from_column} -&gt; {row.to_table}.{row.to_column}
                    </span>
                    {"guidance" in row && row.guidance ? (
                      <p className="mt-1 text-xs leading-5">{String(row.guidance)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--econ-muted)]">
                {(reportBuilderGuide?.relationship_guidance ?? [
                  "Start with these two relationships.",
                  "Keep remaining tables disconnected at first if needed.",
                  "Do not force incorrect relationships just to connect everything.",
                ]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Power BI Concepts Used
              </h2>
              <div className="mt-2 grid gap-2">
                {(reportBuilderGuide?.concepts ?? []).map((concept) => (
                  <div
                    className="rounded-lg border border-[var(--econ-border)] bg-black/20 p-3 text-xs leading-5 text-[var(--econ-muted)]"
                    key={concept.term}
                  >
                    <span className="font-semibold text-[var(--econ-text)]">{concept.term}: </span>
                    {concept.description}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3">
              {(reportBuilderGuide?.pages ?? []).map((page) => (
                <div className="econ-card rounded-xl p-4" key={page.page}>
                  <h2 className="text-base font-semibold text-[var(--econ-text)]">
                    {page.page}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--econ-muted)]">{page.purpose}</p>
                  <div className="mt-3 grid gap-2">
                    {page.visuals.map((visual) => (
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
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Suggested DAX-style measures
              </h2>
              <div className="mt-2 grid gap-2">
                {(reportBuilderGuide?.suggested_measures ?? []).map((measure) => (
                  <pre
                    className="overflow-auto rounded-lg border border-[var(--econ-border)] bg-black/30 p-3 text-xs leading-5 text-[var(--econ-muted)]"
                    key={measure.name}
                  >
                    {measure.expression}
                  </pre>
                ))}
              </div>
              {reportBuilderGuide?.measure_caveat ? (
                <p className="mt-2 text-xs leading-5 text-[var(--econ-muted)]">
                  {reportBuilderGuide.measure_caveat}
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--econ-text)]">
                Quality checks
              </h2>
              <ul className="mt-2 grid gap-2 text-xs leading-5 text-[var(--econ-muted)] sm:grid-cols-2">
                {(reportBuilderGuide?.quality_checks ?? []).map((check) => (
                  <li
                    className="rounded-lg border border-[var(--econ-border)] bg-white/[0.025] px-3 py-2"
                    key={check}
                  >
                    {check}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </EconPanel>
      <EconPanel title="Ask CFS Economics" kicker="Enterprise workflow assistant">
        <AskCfsPanel appMode="economics" />
      </EconPanel>
    </>
  );
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

function EconomicsMethodologyPage() {
  return (
    <>
      <PageHeader
        kicker="Methodology"
        title="CFS Economics methodology"
        text="Screening-level calculations, confidence tiers, enterprise workflow translation, and limitations."
      />
      <section className="grid gap-4 xl:grid-cols-2">
        <EconPanel title="Economic model levels" kicker="Four-level engine">
          <Matrix rows={modelLevelRows} />
        </EconPanel>
        <EconPanel title="Confidence tiers" kicker="Uncertainty labels">
          <Matrix rows={confidenceRows} />
        </EconPanel>
        <EconPanel title="Calculation explanations" kicker="Transparent math">
          <Matrix rows={calculationRows} />
        </EconPanel>
        <EconPanel title="Limitations" kicker="Safe use">
          <ul className="space-y-2 text-sm leading-6 text-[var(--econ-muted)]">
            <li>Not a formal appraisal, tax bill, fiscal impact study, or project approval recommendation.</li>
            <li>Scenario values depend on assumptions and should be documented before use.</li>
            <li>Utility, school, transportation, and service-cost burden may be incomplete.</li>
          </ul>
        </EconPanel>
      </section>
    </>
  );
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

function EconPanel({
  children,
  kicker,
  title,
}: {
  children: ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <section className="econ-panel rounded-2xl p-4 md:p-5">
      <p className="econ-eyebrow">{kicker}</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--econ-text)]">
        {title}
      </h2>
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

function BarList({
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

function EvidenceList({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--econ-border)] bg-white/[0.025] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--econ-muted)]">
        Evidence pack
      </p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--econ-muted)]">
        {items.slice(0, 5).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
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

function ScenarioComparisonMatrix({
  rows,
}: {
  rows: Array<{ label: string; output: ScenarioModelOutput }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--econ-border)]">
      <div className="grid grid-cols-[minmax(9rem,1fr)_7rem_7rem_7rem_7rem_minmax(12rem,1.2fr)] gap-2 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--econ-muted)]">
        <span>Scenario</span>
        <span>Upside</span>
        <span>Service</span>
        <span>Infra</span>
        <span>Confidence</span>
        <span>Next diligence</span>
      </div>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(9rem,1fr)_7rem_7rem_7rem_7rem_minmax(12rem,1.2fr)] gap-2 border-t border-[var(--econ-border)] px-3 py-2 text-xs text-[var(--econ-muted)]"
          key={row.label}
        >
          <span className="font-semibold text-[var(--econ-text)]">{row.label}</span>
          <span>{row.output.fiscalAttractiveness}</span>
          <span>{row.output.serviceBurden}</span>
          <span>{row.output.infrastructureBurden}</span>
          <span>{row.output.dataConfidence}</span>
          <span>{row.output.recommendedNextDiligence}</span>
        </div>
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
        "Revenue per Acre Dashboard, Constraint-Adjusted Development Potential, Public Cost Risk Flag, Economic Scenario Lab.",
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

const enterpriseCards = [
  {
    icon: Calculator,
    text: "Dimensions, measures, assumptions, scenario cards, and output bands.",
    title: "Planning Model Workspace",
  },
  {
    icon: BarChart3,
    text: "KPI facts, signal facts, scenario facts, and dimensions for dashboard reporting.",
    title: "BI Dashboard Workspace",
  },
  {
    icon: Layers3,
    text: "Location context and spatial joins support the economics evidence pack.",
    title: "Location Intelligence Workspace",
  },
  {
    icon: FileJson,
    text: "Executive takeaway, evidence pack, assumptions, risk flags, caveats, and next diligence.",
    title: "Consulting Decision Pack",
  },
];

const modelLevelRows = [
  { label: "Level 1 - Raw Data", value: "Parcel geometry, ID, acreage, value, zoning, permits, flood, school, roads, utility proxy, growth pressure." },
  { label: "Level 2 - Derived Metrics", value: "Value per acre, land/improvement value per acre, improvement-to-land ratio, estimated tax, growth and burden bands." },
  { label: "Level 3 - Intelligence Bands", value: "Underbuilt watch, tax-base potential, constraint-adjusted opportunity, public cost risk." },
  { label: "Level 4 - Human Output", value: "High-value stable parcel, redevelopment candidate, employment candidate, data-needed recommendation." },
];

const confidenceRows = [
  { label: "Strong", value: "Parcel acreage, value, land value, improvement value, zoning, flood overlay, geography where available." },
  { label: "Medium", value: "Growth pressure, nearby permits, school burden proxy, transportation access, scenario assumptions." },
  { label: "Proxy / low", value: "Utility capacity, exact road capacity, exact service cost, exact school seat cost, long-term fiscal impact." },
];

const calculationRows = [
  { label: "Value per acre", value: "Assessed value divided by acreage." },
  { label: "Improvement-to-land ratio", value: "Improvement value divided by land value where both fields exist." },
  { label: "Estimated county tax", value: "Screening-level estimate from assessed value and configured rate; not a tax bill." },
  { label: "Constraint-adjusted opportunity", value: "Opportunity class reduced by flood, school, utility, transportation, and missing-data burden." },
];
