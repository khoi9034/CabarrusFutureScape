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
import { USE_DEMO_DATA } from "@/lib/api/client";
import {
  getEconomicsEnterpriseExport,
  getEconomicsIntelligence,
} from "@/lib/economicsIntelligenceService";
import type {
  EconomicsEnterpriseExportResponse,
  EconomicsIntelligenceResponse,
  EconomicsKpi,
  EconomicsParcelSignal,
  EconomicsScenarioTemplate,
} from "@/types/api";

export function EconomicsShell() {
  const { economicsSection } = useDashboardState();
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [enterpriseExport, setEnterpriseExport] =
    useState<EconomicsEnterpriseExportResponse | null>(null);
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
          <ScenarioLabPage scenarios={intelligence?.scenario_templates ?? []} />
        ) : null}
        {economicsSection === "enterprise_tools" ? (
          <EnterpriseToolsPage exportPayload={enterpriseExport} />
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
        <EconPanel title="Underbuilt Parcel Watchlist" kicker="Parcel screen">
          <SignalTable signals={watchlist.slice(0, 8)} />
        </EconPanel>
        <EconPanel title="Fiscal / Service Burden Panel" kicker="Constraint-adjusted opportunity">
          <BurdenRows />
        </EconPanel>
      </section>
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
  return (
    <>
      <PageHeader
        kicker="Parcel Screen"
        title="Parcel / Area Economic Profile"
        text="Consulting-style parcel screening for baseline value, improvement ratio, opportunity class, burden context, and next diligence."
      />
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <EconPanel title="Selected economic profile" kicker="Highest-priority signal">
          {featured ? (
            <div className="grid gap-3">
              <MiniMetric label="Area / parcel" value={featured.geography_label ?? featured.parcel_id} />
              <MiniMetric label="Value per acre" value={currency(featured.value_per_acre)} />
              <MiniMetric label="Improvement-to-land ratio" value={featured.improvement_to_land_ratio?.toFixed(2) ?? "Not available"} />
              <MiniMetric label="Opportunity class" value={featured.opportunity_class} />
              <MiniMetric label="Data confidence" value={featured.economic_data_confidence} />
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
  scenarios,
}: {
  scenarios: EconomicsScenarioTemplate[];
}) {
  const scenarioRows = scenarios.length ? scenarios : fallbackScenarios;
  return (
    <>
      <PageHeader
        kicker="Scenario Lab"
        title="Economic planning model"
        text="Scenario cards, assumptions, measures, output bands, and a decision memo in a planning-model style workflow."
      />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scenarioRows.map((scenario) => (
          <EconCard key={scenario.id}>
            <Calculator className="h-5 w-5 text-[var(--econ-gold)]" />
            <h2 className="mt-3 text-base font-semibold text-[var(--econ-text)]">
              {scenario.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--econ-muted)]">
              {scenario.what_it_tests}
            </p>
          </EconCard>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <EconPanel title="Assumption table" kicker="Inputs">
          <Matrix rows={assumptionRows} />
        </EconPanel>
        <EconPanel title="Measures table" kicker="Model measures">
          <Matrix rows={measureRows} />
        </EconPanel>
        <EconPanel title="Decision memo" kicker="Output">
          <p className="text-sm leading-7 text-[var(--econ-muted)]">
            Compare current value, scenario type, estimated tax-base lift band,
            and public burden flags before presenting a recommendation for
            deeper diligence.
          </p>
        </EconPanel>
      </section>
    </>
  );
}

function EnterpriseToolsPage({
  exportPayload,
}: {
  exportPayload: EconomicsEnterpriseExportResponse | null;
}) {
  const preview = JSON.stringify(
    exportPayload?.exports?.power_bi ?? { status: "Loading export preview" },
    null,
    2,
  );
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
      <EconPanel title="Ask CFS Economics" kicker="Enterprise workflow assistant">
        <AskCfsPanel appMode="economics" />
      </EconPanel>
    </>
  );
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

const fallbackScenarios: EconomicsScenarioTemplate[] = [
  {
    caveats: ["Scenario values depend on assumptions."],
    data_confidence: "screening",
    id: "current_conditions",
    required_assumptions: ["Current value baseline"],
    title: "Current Conditions",
    what_it_tests: "Current value, acreage, constraints, and confidence before assumptions.",
  },
  {
    caveats: ["Scenario values depend on assumptions."],
    data_confidence: "screening",
    id: "baseline_growth",
    required_assumptions: ["Growth intensity"],
    title: "Baseline Growth",
    what_it_tests: "Whether current growth patterns reinforce fiscal/service tradeoffs.",
  },
];

const assumptionRows = [
  { label: "Development type", value: "Residential, commercial, industrial, mixed-use, or conservation / low intensity." },
  { label: "Intensity band", value: "Screening-level density or value-per-acre assumption." },
  { label: "Burden bands", value: "Infrastructure, school, utility, transportation, and flood context." },
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
