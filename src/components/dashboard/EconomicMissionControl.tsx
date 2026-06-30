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
import {
  getEconomicsEnterpriseExport,
  getEconomicsIntelligence,
} from "@/lib/economicsIntelligenceService";
import type { EnterpriseExportPreviewKind } from "@/lib/enterpriseAdapters/enterpriseExportTypes";
import { buildPowerBiDatasetPayload } from "@/lib/enterpriseAdapters/powerBiAdapter";
import {
  buildDecisionPackExport,
  buildPlanningModelCubePayload,
} from "@/lib/enterpriseAdapters/planningAnalyticsAdapter";
import { cn } from "@/lib/utils";
import type {
  CfsAiDashboardActions,
  CfsAiSearchRequest,
  CfsAiSelectedSignal,
  EconomicsEnterpriseExportResponse,
  EconomicsParcelSignal,
  EconomicsIntelligenceResponse,
  EconomicsKpi,
  EconomicsReadinessRow,
  EconomicsScenarioTemplate,
} from "@/types/api";

export function EconomicMissionControl() {
  const [intelligence, setIntelligence] =
    useState<EconomicsIntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enterpriseExport, setEnterpriseExport] =
    useState<EconomicsEnterpriseExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewKind, setPreviewKind] =
    useState<EnterpriseExportPreviewKind>("power_bi");
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

    getEconomicsEnterpriseExport()
      .then((response) => {
        if (!mounted) return;
        setEnterpriseExport(response);
        setExportError(null);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setEnterpriseExport(null);
        setExportError(
          requestError instanceof Error
            ? requestError.message
            : "Enterprise export preview is unavailable.",
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  const summary = intelligence?.summary;
  const signals = useMemo(
    () => intelligence?.parcel_economic_signals ?? intelligence?.signals ?? [],
    [intelligence],
  );
  const watchlist = useMemo(
    () =>
      intelligence?.underbuilt_watchlist?.length
        ? intelligence.underbuilt_watchlist
        : (intelligence?.watchlist ?? []),
    [intelligence],
  );
  const valueBars = useMemo(
    () =>
      topNumericSignals(signals, "value_per_acre").map((signal) => ({
        label: signal.geography_label ?? signal.parcel_id,
        value: signal.value_per_acre ?? 0,
      })),
    [signals],
  );
  const classBars = useMemo(() => {
    if (intelligence?.opportunity_class_breakdown?.length) {
      return intelligence.opportunity_class_breakdown
        .map((row) => ({ label: row.opportunity_class, value: row.count }))
        .slice(0, 6);
    }
    const counts = new Map<string, number>();
    signals.forEach((signal) => {
      counts.set(signal.opportunity_class, (counts.get(signal.opportunity_class) ?? 0) + 1);
    });
    return Array.from(counts, ([label, value]) => ({ label, value })).slice(0, 6);
  }, [intelligence, signals]);
  const ratioBars = useMemo(
    () =>
      topNumericSignals(signals, "improvement_to_land_ratio").map((signal) => ({
        label: signal.geography_label ?? signal.parcel_id,
        value: signal.improvement_to_land_ratio ?? 0,
      })),
    [signals],
  );
  const jurisdictionBars = useMemo(
    () =>
      (intelligence?.jurisdiction_value_summary ?? [])
        .filter((row) => typeof row.median_value_per_acre === "number")
        .slice(0, 8)
        .map((row) => ({
          label: row.geography_label ?? "Parcel context",
          value: row.median_value_per_acre ?? 0,
        })),
    [intelligence],
  );

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
              Economic Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              CFS Economics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              CFS Economics turns parcel, tax, zoning, permit, infrastructure,
              and constraint data into screening-level economic intelligence
              for growth value, public cost risk, investment readiness, and
              deeper review.
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

      <section className="mt-4 grid gap-3 lg:grid-cols-4">
        {consultingPanels.map((panel) => (
          <article
            className="cfs-command-card rounded-xl border-[#d8b86a]/18 p-4"
            key={panel.title}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0cd79]">
              {panel.kicker}
            </p>
            <h2 className="mt-2 text-base font-semibold text-white">
              {panel.title}
            </h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {panel.text}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-4 cfs-command-surface rounded-xl border-[#a8f3c4]/18 p-4">
        <SectionHeader
          icon={<FileSearch className="h-4 w-4" />}
          kicker="Enterprise Consulting Toolkit"
          title="Planning model, BI dashboard, location intelligence, and decision pack"
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {enterpriseToolkit.map((tool) => (
            <article
              className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
              key={tool.title}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#a8f3c4]">
                {tool.kicker}
              </p>
              <h3 className="mt-2 text-sm font-semibold text-white">
                {tool.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {tool.text}
              </p>
              <ul className="mt-3 space-y-1 text-[11px] leading-5 text-slate-500">
                {tool.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PlanningModelSchemaPanel />
        <EnterpriseExportPanel
          exportPayload={enterpriseExport}
          error={exportError}
          previewKind={previewKind}
          setPreviewKind={setPreviewKind}
        />
      </div>

      <section className="mt-4 cfs-command-surface rounded-xl border-[#68d8ff]/18 p-4">
        <SectionHeader
          icon={<Gauge className="h-4 w-4" />}
          kicker="Economic Snapshot"
          title="Growth & Tax Base Intelligence"
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
                  related_layers: askActions?.recommended_layers ?? ["Revenue per Acre Dashboard"],
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
            kicker="Parcel Economic Baseline"
            title="Value Per Acre + Opportunity Classes"
          />
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <HorizontalBarPanel
              empty="Value per acre rows are not available."
              formatValue={currency}
              rows={valueBars}
              title="Value per acre distribution"
            />
            <HorizontalBarPanel
              empty="Opportunity classes are not available."
              rows={classBars}
              title="Opportunity Class Breakdown"
            />
            <HorizontalBarPanel
              empty="Improvement-to-land ratio rows are not available."
              formatValue={(value) =>
                typeof value === "number" ? value.toFixed(2) : "Not available"
              }
              rows={ratioBars}
              title="Improvement-to-Land Ratio"
            />
            <HorizontalBarPanel
              empty="Jurisdiction value summary is not available."
              formatValue={currency}
              rows={jurisdictionBars}
              title="Jurisdiction / geography value summary"
            />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <MicroMetric label="Total assessed value" value={currency(summary?.total_assessed_value)} />
            <MicroMetric label="Land value" value={currency(summary?.total_land_value)} />
            <MicroMetric label="Improvement value" value={currency(summary?.total_improvement_value)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Improvement-to-land ratio compares improvement value to land value.
            Low ratios can indicate underbuilt review candidates when acreage,
            land value, and constraint context support deeper diligence.
          </p>
        </section>

        <section className="cfs-command-surface rounded-xl p-4">
          <SectionHeader
            icon={<FileSearch className="h-4 w-4" />}
            kicker="Underbuilt Redevelopment Watchlist"
            title="Site Readiness / Investment Candidates"
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <div className="grid grid-cols-[minmax(8rem,1fr)_8rem_8rem] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>Area / parcel</span>
                <span>Value / acre</span>
                <span>Opportunity</span>
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
            kicker="Fiscal Impact / Tax Lift"
            title="Fiscal Opportunity Score + Public Cost Risk Flag"
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
            kicker="Scenario Comparison"
            title="Growth, Investment, and Redevelopment Scenarios"
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
          title="Confidence Tiers Before Stronger Fiscal Claims"
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          <div className="hidden gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 md:grid md:grid-cols-[9rem_8rem_8rem_minmax(0,1fr)_minmax(0,1fr)]">
            <span>Domain</span>
            <span>Status</span>
            <span>Confidence</span>
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
    text: "Development Pressure Monitor compares observed permit activity with economic baseline to show where growth may affect review workload and tax-base opportunity.",
  },
  {
    label: "School pressure",
    text: "Preliminary school capacity watch informs the fiscal/service tradeoff before a parcel or corridor is treated as investment-ready.",
  },
  {
    label: "Floodplain review",
    text: "Floodplain context can turn a high-value opportunity into a high-value / high-risk parcel requiring deeper review.",
  },
  {
    label: "Utility readiness",
    text: "Utility readiness remains a proxy until official capacity and service-extension data are available.",
  },
  {
    label: "Transportation",
    text: "Corridor context supports market + planning alignment review before scenario assumptions are useful.",
  },
];

const consultingPanels = [
  {
    kicker: "Panel 1",
    title: "Economic Snapshot",
    text: "Countywide or selected-area view of assessed value coverage, tax-base concentration, growth pressure, high-value parcels, redevelopment candidates, and data readiness.",
  },
  {
    kicker: "Panel 2",
    title: "Parcel Economic Profile",
    text: "Parcel/area profile for value per acre, land vs improvement value, zoning context, permits, road access, constraints, opportunity class, and recommended follow-up.",
  },
  {
    kicker: "Panel 3",
    title: "Fiscal Impact / Tax Lift",
    text: "Transparent proxy path from current tax value to scenario development type, modeled tax-base lift, and public constraint burden.",
  },
  {
    kicker: "Panel 4",
    title: "Scenario Comparison",
    text: "Screen Current Conditions, Growth Continues As-Is, Infrastructure-Constrained Growth, Targeted Investment, Higher-Density Redevelopment, Employment, and Mixed-Use Corridor scenarios.",
  },
];

const enterpriseToolkit = [
  {
    items: [
      "Dimensions: Geography, Parcel, Jurisdiction, Land Use, Scenario, Time",
      "Measures: assessed value, revenue per acre band, service burden band",
      "Outputs: opportunity class, next diligence, executive memo",
    ],
    kicker: "Planning model",
    text: "Multidimensional planning model pattern for assumptions, scenarios, measures, and outputs.",
    title: "Planning Model Workspace",
  },
  {
    items: [
      "KPI cards and slicer-ready facts",
      "Value distribution and opportunity breakdowns",
      "Watchlists, drilldowns, and executive summary",
    ],
    kicker: "BI dashboard",
    text: "Embedded analytics pattern for KPI facts, signal facts, scenario facts, and dimensions.",
    title: "BI Dashboard Workspace",
  },
  {
    items: [
      "Parcel selection and spatial joins",
      "Constraint overlays and scenario geography",
      "Related layers for diligence review",
    ],
    kicker: "Location intelligence",
    text: "Map-driven workflow for connecting economics with parcels, constraints, and service context.",
    title: "Location Intelligence Workspace",
  },
  {
    items: [
      "Executive takeaway",
      "Evidence pack and assumptions",
      "Risk flags, caveats, and next diligence",
    ],
    kicker: "Consulting deliverable",
    text: "Decision-pack pattern for turning indicators into a presentation-ready consulting artifact.",
    title: "Consulting Decision Pack",
  },
];

const planningModelSchema = {
  dimensions: [
    "Geography",
    "Parcel",
    "Jurisdiction",
    "Land Use / Zoning",
    "Time",
    "Scenario",
    "Constraint Domain",
  ],
  measures: [
    "Assessed Value",
    "Land Value",
    "Improvement Value",
    "Value per Acre",
    "Estimated County Tax",
    "Tax-Base Lift Band",
    "Revenue per Acre Band",
    "Public Cost Risk Band",
    "Data Confidence",
  ],
  outputs: [
    "Opportunity class",
    "Constraint-adjusted opportunity band",
    "Fiscal attractiveness band",
    "Recommended next diligence",
    "Executive memo",
  ],
};

const analyticsReadiness = [
  "export-ready economics_enterprise_export.json",
  "normalized KPI table",
  "normalized signal table",
  "normalized scenario table",
  "normalized watchlist table",
  "map layer GeoJSON",
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

function PlanningModelSchemaPanel() {
  return (
    <section className="cfs-command-surface rounded-xl border-[#68d8ff]/18 p-4">
      <SectionHeader
        icon={<Calculator className="h-4 w-4" />}
        kicker="Planning Model Schema"
        title="Dimensions, measures, assumptions, and outputs"
      />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SchemaColumn title="Dimensions" values={planningModelSchema.dimensions} />
        <SchemaColumn title="Measures" values={planningModelSchema.measures} />
        <SchemaColumn title="Outputs" values={planningModelSchema.outputs} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Scenario assumptions include development type, intensity band,
        value-per-acre assumption, infrastructure burden, school burden,
        utility readiness confidence, and transportation access confidence.
      </p>
    </section>
  );
}

function EnterpriseExportPanel({
  error,
  exportPayload,
  previewKind,
  setPreviewKind,
}: {
  error: string | null;
  exportPayload: EconomicsEnterpriseExportResponse | null;
  previewKind: EnterpriseExportPreviewKind;
  setPreviewKind: (kind: EnterpriseExportPreviewKind) => void;
}) {
  const preview =
    exportPayload && previewKind === "power_bi"
      ? buildPowerBiDatasetPayload(exportPayload)
      : exportPayload && previewKind === "planning_model"
        ? buildPlanningModelCubePayload(exportPayload)
        : exportPayload
          ? buildDecisionPackExport(exportPayload)
          : null;
  const prettyPreview = JSON.stringify(preview ?? { status: "Loading enterprise export preview" }, null, 2);

  return (
    <section className="cfs-command-surface rounded-xl border-[#d8b86a]/18 p-4">
      <SectionHeader
        icon={<BarChart3 className="h-4 w-4" />}
        kicker="BI / Embedded Analytics Readiness"
        title="Enterprise Export"
      />
      <p className="mt-3 text-xs leading-5 text-slate-400">
        CFS exports connector-ready facts, dimensions, planning-model cells,
        and a decision pack. No external account or embedded report is connected
        in this phase.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <PreviewButton
          active={previewKind === "power_bi"}
          label="Preview Power BI-style dataset"
          onClick={() => setPreviewKind("power_bi")}
        />
        <PreviewButton
          active={previewKind === "planning_model"}
          label="Preview Planning Model payload"
          onClick={() => setPreviewKind("planning_model")}
        />
        <PreviewButton
          active={previewKind === "decision_pack"}
          label="Preview Decision Pack JSON"
          onClick={() => setPreviewKind("decision_pack")}
        />
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-[#f6d98e]/25 bg-[#f6d98e]/10 px-3 py-2 text-xs text-[#f6d98e]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <h3 className="text-sm font-semibold text-white">
            Export-ready datasets
          </h3>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
            {analyticsReadiness.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
          {prettyPreview}
        </pre>
      </div>
    </section>
  );
}

function SchemaColumn({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function PreviewButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-xs font-semibold transition",
        active
          ? "border-[#68d8ff]/60 bg-[#68d8ff]/12 text-[#c8f6ff]"
          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-[#68d8ff]/30",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
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

function topNumericSignals(
  signals: EconomicsParcelSignal[],
  key: "improvement_to_land_ratio" | "value_per_acre",
) {
  return [...signals]
    .filter((signal) => typeof signal[key] === "number")
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, 8);
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
    <div className="grid gap-1 border-b border-white/5 px-3 py-2 text-xs text-slate-300 last:border-b-0 md:grid-cols-[9rem_8rem_8rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-2">
      <span className="font-semibold text-white">{row.domain}</span>
      <span>{row.data_status.replaceAll("_", " ")}</span>
      <span>{confidenceTier(row.data_status)}</span>
      <span>{row.current_use}</span>
      <span>{row.gap_or_next_need}</span>
    </div>
  );
}

function confidenceTier(status: string) {
  if (status === "available") return "Strong";
  if (status === "partial") return "Medium";
  return "Proxy / low";
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
