"use client";

import {
  AlertTriangle,
  BarChart3,
  Building2,
  Database,
  MapPinned,
  Save,
  School,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { PlanningSnapshotSaveController } from "@/components/dashboard/IntelligencePanel";
import { CFS_SAVE_PLANNING_SNAPSHOT_EVENT } from "@/components/dashboard/OverviewCommandCenter";
import { EconomicsShell } from "@/components/economics/EconomicsShell";
import {
  indicatorCenterDefinitions,
  indicatorCenterMissingDataItems,
} from "@/data/intelligence/indicatorCenter";
import { developmentModelLabSummary } from "@/data/intelligence/developmentModelLab";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentActivitySummary } from "@/hooks/useDevelopmentActivitySummary";
import { useDevelopmentHotspots } from "@/hooks/useDevelopmentHotspots";
import { useDevelopmentPredictionResearchStatus } from "@/hooks/useDevelopmentPredictionResearchStatus";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useSchoolConstraintSummary } from "@/hooks/useSchoolConstraintSummary";
import type { ManagementSection } from "@/types";

const numberFormatter = new Intl.NumberFormat("en-US");

export function ManagementWorkspace({
  section,
}: {
  section: ManagementSection;
}) {
  const {
    planningSnapshotCanWrite,
    planningSnapshotPersistence,
    setEconomicsSection,
  } = useDashboardState();
  const development = useDevelopmentActivitySummary();
  const hotspots = useDevelopmentHotspots();
  const flood = useFloodConstraintSummary();
  const schools = useSchoolConstraintSummary();
  const model = useDevelopmentPredictionResearchStatus();

  useEffect(() => {
    if (section === "economic-insights") setEconomicsSection("dashboard");
  }, [section, setEconomicsSection]);

  const saveSnapshot = () =>
    window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT));

  return (
    <main
      className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8"
      data-management-section={section}
      data-testid="cfs-management-workspace"
    >
      <PlanningSnapshotSaveController />

      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-5">
        <header className="cfs-command-surface rounded-2xl px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9bd1de]">
                CFS Management
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                {managementSectionTitle(section)}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {managementSectionDescription(section)}
              </p>
            </div>
            <button
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#55d38f]/30 bg-[#55d38f]/10 px-4 py-2.5 text-sm font-semibold text-[#c9ead0] transition hover:border-[#55d38f]/50 hover:bg-[#55d38f]/15 disabled:cursor-not-allowed disabled:opacity-55"
              data-testid="management-save-snapshot"
              disabled={
                !planningSnapshotCanWrite ||
                planningSnapshotPersistence.status === "saving"
              }
              onClick={saveSnapshot}
              title={planningSnapshotPersistence.message}
              type="button"
            >
              <Save className="h-4 w-4" />
              Save Snapshot
            </button>
          </div>
        </header>

        {section === "overview" ? (
          <ManagementOverview
            development={development}
            flood={flood}
            hotspotCount={hotspots.totalCount}
            schools={schools}
          />
        ) : null}
        {section === "planning-insights" ? (
          <PlanningInsights
            development={development}
            flood={flood}
            hotspots={hotspots.hotspots}
            schools={schools}
          />
        ) : null}
        {section === "economic-insights" ? (
          <section data-testid="management-economic-insights">
            <EconomicsShell />
          </section>
        ) : null}
        {section === "development-signals" ? (
          <DevelopmentSignals
            hotspots={hotspots.hotspots}
            model={model}
          />
        ) : null}
      </div>
    </main>
  );
}

function ManagementOverview({
  development,
  flood,
  hotspotCount,
  schools,
}: {
  development: ReturnType<typeof useDevelopmentActivitySummary>;
  flood: ReturnType<typeof useFloodConstraintSummary>;
  hotspotCount: number;
  schools: ReturnType<typeof useSchoolConstraintSummary>;
}) {
  const attentionItems = indicatorCenterDefinitions.filter((indicator) =>
    ["High Attention", "Review Needed", "Data Needed", "Proxy Only", "Preliminary Data"].includes(
      indicator.priorityLabel,
    ),
  );
  const signals = [
    {
      icon: Building2,
      label: "Recent development activity",
      value: development.isLoading
        ? "Loading"
        : development.source === "fallback"
          ? "Data unavailable"
          : `${numberFormatter.format(development.recentActivityParcels1Yr)} parcels in the latest year`,
    },
    {
      icon: MapPinned,
      label: "Development attention areas",
      value: hotspotCount ? `${numberFormatter.format(hotspotCount)} current hotspots` : "No current hotspot result",
    },
    {
      icon: Waves,
      label: "Flood constraint posture",
      value: flood.isLoading
        ? "Loading"
        : flood.metrics.find((metric) => metric.id === "review-required-parcels")?.value
          ? `${flood.metrics.find((metric) => metric.id === "review-required-parcels")?.value} parcels require review`
          : "Source review needed",
    },
    {
      icon: School,
      label: "School pressure readiness",
      value: schools.isLoading ? "Loading" : schools.capacityStatusLabel,
    },
    {
      icon: Database,
      label: "Data readiness",
      value: `${indicatorCenterMissingDataItems.length} authoritative inputs still needed`,
    },
    {
      icon: BarChart3,
      label: "Economic posture",
      value: "Current dashboard and scenario results available",
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]" data-testid="management-overview">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Current county signals">
        {signals.map(({ icon: Icon, label, value }) => (
          <article className="cfs-command-card rounded-xl p-4" key={label}>
            <Icon className="h-5 w-5 text-[#9bd1de]" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-2 text-lg font-semibold leading-6 text-white">{value}</p>
          </article>
        ))}
      </section>
      <section className="cfs-command-surface rounded-xl p-5">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-[#dfcf91]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#dfcf91]">Leadership watchlist</p>
            <h2 className="mt-1 text-xl font-semibold text-white">What staff should review</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {attentionItems.slice(0, 5).map((item) => (
            <article className="rounded-lg border border-white/10 bg-white/[0.035] p-3" key={item.indicatorId}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-100">{item.name}</p>
                <span className="shrink-0 rounded-full border border-[#dfcf91]/25 bg-[#dfcf91]/8 px-2 py-1 text-[10px] font-semibold text-[#dfcf91]">{item.priorityLabel}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{item.recommendedFollowUp}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanningInsights({
  development,
  flood,
  hotspots,
  schools,
}: {
  development: ReturnType<typeof useDevelopmentActivitySummary>;
  flood: ReturnType<typeof useFloodConstraintSummary>;
  hotspots: ReturnType<typeof useDevelopmentHotspots>["hotspots"];
  schools: ReturnType<typeof useSchoolConstraintSummary>;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2" data-testid="management-planning-insights">
      <ManagementPanel eyebrow="Observed activity" title="Development activity trend">
        <SignalRows rows={[
          ["Permit records", development.source === "fallback" ? "Unavailable" : numberFormatter.format(development.totalPermits)],
          ["Parcels active in latest year", development.source === "fallback" ? "Unavailable" : numberFormatter.format(development.recentActivityParcels1Yr)],
          ["Parcels active in latest three years", development.source === "fallback" ? "Unavailable" : numberFormatter.format(development.recentActivityParcels3Yr)],
          ["Observed period", development.activityDateMin && development.activityDateMax ? `${development.activityDateMin} to ${development.activityDateMax}` : "Source dates unavailable"],
        ]} />
      </ManagementPanel>
      <ManagementPanel eyebrow="Geographic attention" title="Development hotspot summary">
        <div className="grid gap-2">
          {hotspots.slice(0, 5).map((hotspot) => (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3" key={hotspot.official_parcel_id}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-100">{hotspot.nbh_name || hotspot.subdiv_name || `Parcel ${hotspot.official_parcel_id}`}</p>
                <span className="text-xs text-[#9bd1de]">{hotspot.total_permit_count} permits</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{humanize(hotspot.development_activity_class)} · {hotspot.dominant_permit_type || "Mixed activity"}</p>
            </div>
          ))}
          {!hotspots.length ? <EmptySignal /> : null}
        </div>
      </ManagementPanel>
      <ManagementPanel eyebrow="Constraints" title="Flood and school posture">
        <SignalRows rows={[
          ...flood.metrics.slice(1).map((metric) => [metric.label, metric.value] as const),
          ["School capacity", schools.capacityStatusLabel],
          ["School assignment review", schools.metrics.find((metric) => metric.id === "assignment-review")?.value ?? "Unavailable"],
        ]} />
      </ManagementPanel>
      <ManagementPanel eyebrow="Planning watchlist" title="Signals requiring follow-up">
        <div className="grid gap-2">
          {indicatorCenterDefinitions.slice(0, 7).map((indicator) => (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3" key={indicator.indicatorId}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-100">{indicator.name}</p>
                <span className="text-xs text-[#dfcf91]">{indicator.priorityLabel}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{indicator.whatItMeans}</p>
            </div>
          ))}
        </div>
      </ManagementPanel>
    </div>
  );
}

function DevelopmentSignals({
  hotspots,
  model,
}: {
  hotspots: ReturnType<typeof useDevelopmentHotspots>["hotspots"];
  model: ReturnType<typeof useDevelopmentPredictionResearchStatus>;
}) {
  const ranking = model.rankingSummary;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]" data-testid="management-development-signals">
      <ManagementPanel eyebrow="Development signals" title="Areas with elevated observed activity">
        <div className="grid gap-3 sm:grid-cols-2">
          {hotspots.slice(0, 6).map((hotspot) => (
            <article className="rounded-lg border border-white/10 bg-white/[0.035] p-4" key={hotspot.official_parcel_id}>
              <p className="text-sm font-semibold text-white">{hotspot.nbh_name || hotspot.subdiv_name || `Parcel ${hotspot.official_parcel_id}`}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">Observed {humanize(hotspot.development_activity_class)} based on {hotspot.total_permit_count} permit records. Review the parcel and source records before drawing conclusions.</p>
            </article>
          ))}
          {!hotspots.length ? <EmptySignal /> : null}
        </div>
      </ManagementPanel>
      <div className="grid gap-5">
        <ManagementPanel eyebrow="Confidence and validation" title="Research status">
          <SignalRows rows={[
            ["Status", model.isLoading ? "Loading" : developmentModelLabSummary.status],
            ["Model purpose", "Relative development signals"],
            ["Calibration", humanize(ranking.calibration_status)],
            ["Exact parcel probabilities", ranking.exact_probabilities_exposed ? "Exposed" : "Not exposed"],
            ["Public decision use", ranking.public_exposure_allowed ? "Allowed" : "Not allowed"],
          ]} />
        </ManagementPanel>
        <ManagementPanel eyebrow="Major drivers" title="What the research uses">
          <ul className="grid gap-2 text-sm text-slate-300">
            {developmentModelLabSummary.helpedFeatureGroups.map((driver) => (
              <li className="flex gap-2" key={driver}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9bd1de]" />{driver}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg border border-[#dfcf91]/20 bg-[#dfcf91]/7 p-3 text-xs leading-5 text-slate-300">
            These are research signals, not predictions that a parcel will develop. Observed permit activity and modeled context should be reviewed together.
          </p>
        </ManagementPanel>
      </div>
    </div>
  );
}

function ManagementPanel({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
  return (
    <section className="cfs-command-surface rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9bd1de]">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignalRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="grid gap-2">
      {rows.map(([label, value]) => (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5" key={label}>
          <dt className="text-sm text-slate-400">{label}</dt>
          <dd className="text-right text-sm font-semibold text-slate-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptySignal() {
  return <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">Current source data is unavailable. No substitute metric is shown.</p>;
}

function managementSectionTitle(section: ManagementSection) {
  if (section === "planning-insights") return "Planning Insights";
  if (section === "economic-insights") return "Economic Insights";
  if (section === "development-signals") return "Development Signals";
  return "Executive Overview";
}

function managementSectionDescription(section: ManagementSection) {
  if (section === "planning-insights") return "A concise view of observed development activity, planning constraints, school readiness, and areas requiring staff follow-up.";
  if (section === "economic-insights") return "Current economic indicators, trends, fiscal and service-burden context, and scenario result summaries without scenario-building controls.";
  if (section === "development-signals") return "Observed activity and internal research signals presented with drivers, validation posture, and limitations—not predictions of certain development.";
  return "What county leadership should know today: current activity, attention areas, constraints, economic posture, and data readiness.";
}

function humanize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable";
}
