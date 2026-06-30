"use client";

import {
  BarChart3,
  Building2,
  Calculator,
  FileSearch,
  Gauge,
  LineChart,
  PlayCircle,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AskCfsPanel } from "@/components/dashboard/AskCfsPanel";
import { USE_DEMO_DATA } from "@/lib/api/client";
import { getEconomicsIntelligence } from "@/lib/economicsIntelligenceService";
import { cn } from "@/lib/utils";
import type {
  CfsAiDashboardActions,
  CfsAiSearchRequest,
  CfsAiSelectedSignal,
  EconomicsIntelligenceResponse,
  EconomicsKpi,
  EconomicsReadinessRow,
  EconomicsScenarioTemplate,
} from "@/types/api";

export function EconomicMissionControl() {
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askActions, setAskActions] = useState<CfsAiDashboardActions | null>(null);
  const [askRequest, setAskRequest] =
    useState<{ request: CfsAiSearchRequest; requestId: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    getEconomicsIntelligence()
      .then((response) => {
        if (!mounted) return;
        setIntelligence(response);
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setIntelligence(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Economics intelligence is unavailable.",
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const summary = intelligence?.summary;
  const watchlist = useMemo(() => intelligence?.watchlist ?? [], [intelligence]);
  const valueBars = useMemo(
    () =>
      watchlist.slice(0, 8).map((signal) => ({
        label: signal.geography_label ?? signal.parcel_id,
        value: signal.value_per_acre ?? 0,
      })),
    [watchlist],
  );
  const classBars = useMemo(() => {
    const counts = new Map<string, number>();
    watchlist.forEach((signal) => {
      counts.set(signal.opportunity_class, (counts.get(signal.opportunity_class) ?? 0) + 1);
    });
    return Array.from(counts, ([label, value]) => ({ label, value })).slice(0, 6);
  }, [watchlist]);

  const explainSignal = useCallback((signal: CfsAiSelectedSignal) => {
    setAskRequest({
      request: {
        app_mode: "economics",
        query: `Explain the ${signal.title} signal. Include evidence, fiscal/service interpretation, caveats, and what to inspect next.`,
        selected_signal: signal,
      },
      requestId: Date.now(),
    });
  }, []);

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden bg-[linear-gradient(90deg,rgba(104,216,255,0.045)_1px,transparent_1px),linear-gradient(rgba(104,216,255,0.035)_1px,transparent_1px),radial-gradient(circle_at_top_left,rgba(216,184,106,0.13),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(236,92,255,0.08),transparent_32%),#02050b] bg-[length:42px_42px,42px_42px,100%_100%,100%_100%,100%_100%] p-4"
      data-testid="economic-mission-control"
      id="cfs-economic-mission-control"
    >
      <section className="cfs-command-surface rounded-xl border-[#d8b86a]/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0cd79]">
              Economic Mission Control
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              CFS Economics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Parcel-level economic intelligence for value efficiency, tax-base
              opportunity, redevelopment screening, and service-burden context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={USE_DEMO_DATA ? "Portfolio Demo" : "Local Live Data"} />
            <StatusPill label={summary?.as_of ? `As of ${formatDate(summary.as_of)}` : "Freshness pending"} />
            <StatusPill label="Screening-level" tone="amber" />
          </div>
        </div>
      </section>

      <div className="mt-4">
        <AskCfsPanel
          appMode="economics"
          externalRequest={askRequest}
          onResponse={(response) => setAskActions(response.dashboard_actions)}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-[#f6d98e]/25 bg-[#f6d98e]/10 px-3 py-2 text-xs leading-5 text-[#f6d98e]">
          Economics endpoint unavailable in live mode: {error}
        </div>
      ) : null}

      <section className="mt-4 cfs-command-surface rounded-xl border-[#68d8ff]/18 p-4">
        <SectionHeader
          icon={<Gauge className="h-4 w-4" />}
          kicker="Economic KPI Strip"
          title="Screening-Level Economic Posture"
        />
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {(intelligence?.kpis ?? fallbackEconomicsKpis()).map((kpi) => (
            <EconomicsKpiCard
              highlighted={askActions?.highlight_kpis?.includes(kpi.id)}
              key={kpi.id}
              kpi={kpi}
              onExplain={() =>
                explainSignal({
                  domain: "economics",
                  evidence: [kpi.caveat],
                  id: kpi.id,
                  related_layers: askActions?.recommended_layers ?? ["Value per Acre"],
                  status_band: kpi.status_band,
                  title: kpi.label,
                })
              }
            />
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
        <section className="cfs-command-surface rounded-xl p-4">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            kicker="Parcel Value Intelligence"
            title="Value Efficiency + Opportunity Classes"
          />
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <HorizontalBarPanel
              empty="Value per acre rows are not available."
              formatValue={currency}
              rows={valueBars}
              title="Value per acre watchlist"
            />
            <HorizontalBarPanel
              empty="Opportunity classes are not available."
              rows={classBars}
              title="Opportunity class mix"
            />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <MicroMetric label="Total assessed value" value={currency(summary?.total_assessed_value)} />
            <MicroMetric label="Land value" value={currency(summary?.total_land_value)} />
            <MicroMetric label="Improvement value" value={currency(summary?.total_improvement_value)} />
          </div>
        </section>

        <section className="cfs-command-surface rounded-xl p-4">
          <SectionHeader
            icon={<FileSearch className="h-4 w-4" />}
            kicker="Underbuilt Watchlist"
            title="Parcel Signals Requiring Source Review"
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <div className="grid grid-cols-[minmax(8rem,1fr)_8rem_8rem] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Area / parcel</span>
              <span>Value / acre</span>
              <span>Class</span>
            </div>
            {(watchlist.length ? watchlist : []).slice(0, 8).map((signal) => (
              <button
                className="grid w-full grid-cols-[minmax(8rem,1fr)_8rem_8rem] gap-2 border-b border-white/5 px-3 py-2 text-left text-xs text-slate-300 last:border-b-0 hover:bg-white/[0.045]"
                key={signal.parcel_id}
                onClick={() =>
                  explainSignal({
                    domain: "economics",
                    evidence: signal.evidence,
                    id: signal.parcel_id,
                    related_layers: signal.related_layers,
                    status_band: signal.economic_status_band,
                    title: signal.opportunity_class,
                  })
                }
                type="button"
              >
                <span className="min-w-0 truncate text-slate-100">
                  {signal.geography_label ?? signal.parcel_id}
                </span>
                <span>{currency(signal.value_per_acre)}</span>
                <span className="truncate">{signal.opportunity_class}</span>
              </button>
            ))}
            {!watchlist.length ? (
              <p className="px-3 py-4 text-xs text-slate-500">
                Economics watchlist rows are not available from current context.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="cfs-command-surface rounded-xl p-4">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            kicker="Fiscal / Service Burden"
            title="Constraint-Adjusted Opportunity"
          />
          <div className="mt-3 grid gap-2">
            {constraintRows.map((row) => (
              <div
                className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[10rem_minmax(0,1fr)]"
                key={row.label}
              >
                <span className="text-xs font-semibold text-white">{row.label}</span>
                <span className="text-xs leading-5 text-slate-400">{row.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="cfs-command-surface rounded-xl p-4">
          <SectionHeader
            icon={<PlayCircle className="h-4 w-4" />}
            kicker="Scenario Templates"
            title="Screening Questions to Test"
          />
          <div className="mt-3 grid gap-2">
            {(intelligence?.scenario_templates ?? []).slice(0, 5).map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 cfs-command-surface rounded-xl p-4">
        <SectionHeader
          icon={<LineChart className="h-4 w-4" />}
          kicker="Economic Data Readiness"
          title="Fields Needed Before Stronger Fiscal Claims"
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          <div className="grid grid-cols-[10rem_8rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span>Domain</span>
            <span>Status</span>
            <span>Current use</span>
            <span>Gap / next need</span>
          </div>
          {(intelligence?.data_readiness ?? []).map((row) => (
            <ReadinessRow key={row.domain} row={row} />
          ))}
        </div>
      </section>
    </div>
  );
}

const constraintRows = [
  {
    label: "Growth pressure",
    text: "Observed permit activity helps separate stable value from places where review workload or growth context is rising.",
  },
  {
    label: "School pressure",
    text: "Preliminary school capacity watch can reduce confidence in near-term scenario screening until official assumptions are checked.",
  },
  {
    label: "Floodplain review",
    text: "Floodplain context can turn a high-value opportunity into an infrastructure-constrained review item.",
  },
  {
    label: "Utility readiness",
    text: "Official service and capacity fields are needed before CFS can treat value opportunity as service-ready.",
  },
  {
    label: "Transportation",
    text: "Corridor and project context helps identify where coordination is needed before scenario assumptions are useful.",
  },
];

function StatusPill({ label, tone = "cyan" }: { label: string; tone?: "amber" | "cyan" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone === "amber"
          ? "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f6d98e]"
          : "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bff3ff]",
      )}
    >
      {label}
    </span>
  );
}

function SectionHeader({
  icon,
  kicker,
  title,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#68d8ff]/18 bg-[#68d8ff]/10 text-[#9be9ff]">
        {icon}
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
          {kicker}
        </p>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
    </div>
  );
}

function EconomicsKpiCard({
  highlighted,
  kpi,
  onExplain,
}: {
  highlighted?: boolean;
  kpi: EconomicsKpi;
  onExplain: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-white/[0.035] p-3 transition",
        highlighted
          ? "border-[#68d8ff]/60 shadow-[0_0_28px_rgba(104,216,255,0.18)]"
          : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {kpi.status_band.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">{kpi.label}</h3>
        </div>
        <Calculator className="h-4 w-4 text-[#f0cd79]" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">
        {formatKpiValue(kpi)}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{kpi.caveat}</p>
      <button
        className="mt-3 text-xs font-semibold text-[#9be9ff] underline-offset-4 hover:underline"
        onClick={onExplain}
        type="button"
      >
        Explain signal
      </button>
    </article>
  );
}

function HorizontalBarPanel({
  empty,
  formatValue = formatNumber,
  rows,
  title,
}: {
  empty: string;
  formatValue?: (value: number | null | undefined) => string;
  rows: Array<{ label: string; value: number }>;
  title: string;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-slate-300">{row.label}</span>
                <span className="shrink-0 text-slate-500">{formatValue(row.value)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#68d8ff] via-[#55d38f] to-[#f0cd79]"
                  style={{ width: `${maxValue ? Math.max(6, (row.value / maxValue) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">{empty}</p>
        )}
      </div>
    </div>
  );
}

function MicroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: EconomicsScenarioTemplate }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
        <div>
          <h3 className="text-sm font-semibold text-white">{scenario.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">{scenario.what_it_tests}</p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Confidence: {scenario.data_confidence}
          </p>
        </div>
      </div>
    </article>
  );
}

function ReadinessRow({ row }: { row: EconomicsReadinessRow }) {
  return (
    <div className="grid grid-cols-[10rem_8rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-white/5 px-3 py-2 text-xs text-slate-300 last:border-b-0">
      <span className="font-semibold text-white">{row.domain}</span>
      <span>{row.data_status.replaceAll("_", " ")}</span>
      <span>{row.current_use}</span>
      <span>{row.gap_or_next_need}</span>
    </div>
  );
}

function fallbackEconomicsKpis(): EconomicsKpi[] {
  return [
    {
      caveat: "Economics context is loading or unavailable.",
      id: "data_needed",
      label: "Economic data needed",
      status_band: "data_needed",
      unit: "signals",
      value: "Loading",
    },
  ];
}

function formatKpiValue(kpi: EconomicsKpi) {
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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
}
