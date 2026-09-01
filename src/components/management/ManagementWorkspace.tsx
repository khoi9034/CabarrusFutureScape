"use client";

import { ArrowRight, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CfsRankedBarChart, CfsTrendChart, type CfsChartRow } from "@/components/management/CfsManagementCharts";
import { ManagementMapPreview, type ManagementMapMarker } from "@/components/management/ManagementMapPreview";
import { PlanningSnapshotSaveController } from "@/components/dashboard/IntelligencePanel";
import { CFS_SAVE_PLANNING_SNAPSHOT_EVENT } from "@/components/dashboard/OverviewCommandCenter";
import { developmentModelLabSummary } from "@/data/intelligence/developmentModelLab";
import { indicatorCenterDefinitions } from "@/data/intelligence/indicatorCenter";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentActivitySummary } from "@/hooks/useDevelopmentActivitySummary";
import { useDevelopmentHotspots } from "@/hooks/useDevelopmentHotspots";
import { useDevelopmentPredictionResearchStatus, standardizedDevelopmentPredictionMetrics } from "@/hooks/useDevelopmentPredictionResearchStatus";
import { useDevelopmentTrends } from "@/hooks/useDevelopmentTrends";
import { useEconomicsIntelligence } from "@/hooks/useEconomicsIntelligence";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useModelResearchPreviewLayer } from "@/hooks/useModelResearchPreviewLayer";
import { useSchoolConstraintSummary } from "@/hooks/useSchoolConstraintSummary";
import type { ManagementSection } from "@/types";
import type { DevelopmentHotspotMapMarker, SelectedDevelopmentHotspotContext } from "@/types/map/developmentHotspots";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";

const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 });

export function ManagementWorkspace({ section }: { section: ManagementSection }) {
  const dashboard = useDashboardState();
  const development = useDevelopmentActivitySummary();
  const trends = useDevelopmentTrends();
  const hotspots = useDevelopmentHotspots();
  const flood = useFloodConstraintSummary();
  const schools = useSchoolConstraintSummary();
  const model = useDevelopmentPredictionResearchStatus();
  const modelPreview = useModelResearchPreviewLayer({ enabled: section === "development-signals", limit: 120, signal: "higher" });
  const economics = useEconomicsIntelligence();
  const [selectedHotspot, setSelectedHotspot] = useState<DevelopmentHotspotMapMarker | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<ModelResearchPreviewMarker | null>(null);

  useEffect(() => {
    if (section === "economic-insights") dashboard.setEconomicsSection("dashboard");
  }, [dashboard, section]);

  const trendRows = useMemo<CfsChartRow[]>(() =>
    (trends.monthlyTrend.length ? trends.monthlyTrend : trends.annualTrend).slice(-12).map((row) => ({
      label: row.activity_month ? `${String(row.activity_month).padStart(2, "0")}/${String(row.activity_year).slice(-2)}` : String(row.activity_year),
      value: row.permit_count,
    })), [trends]);
  const hotspotRows = useMemo<CfsChartRow[]>(() => hotspots.markers.slice(0, 8).map((marker) => {
    const record = hotspots.hotspots.find((item) => item.official_parcel_id === marker.officialParcelId);
    return {
      label: record?.nbh_name || record?.subdiv_name || marker.managementLabel || marker.pin14 || "Parcel area",
      value: marker.totalPermitCount,
    };
  }), [hotspots.hotspots, hotspots.markers]);
  const hotspotMarkers = useMemo(() => hotspots.markers.map(toHotspotMapMarker), [hotspots.markers]);
  const signalMarkers = useMemo(() => modelPreview.markers.map(toSignalMapMarker), [modelPreview.markers]);

  const openPlanningBuilder = (parcelId?: string, signal?: ModelResearchPreviewMarker) => {
    window.history.pushState(null, "", "/?app=planning");
    dashboard.setCfsAppMode("planning");
    dashboard.setOverviewCommandMode(signal ? "modelLab" : "countywide");
    if (parcelId) dashboard.selectParcel(parcelId, { source: "dashboard" });
    if (signal) dashboard.setSelectedModelResearchContext(signal);
  };
  const openEconomicsBuilder = () => {
    window.history.pushState(null, "", "/?app=economics");
    dashboard.setCfsAppMode("economics");
    dashboard.setEconomicsSection("dashboard");
  };

  return (
    <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" data-management-section={section} data-testid="cfs-management-workspace">
      <PlanningSnapshotSaveController />
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-5">
        <header className="cfs-command-surface rounded-2xl px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9bd1de]">CFS Management</p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{title(section)}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{description(section)}</p>
            </div>
            <button className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#55d38f]/30 bg-[#55d38f]/10 px-4 py-2.5 text-sm font-semibold text-[#c9ead0] disabled:opacity-50" disabled={!dashboard.planningSnapshotCanWrite} onClick={() => window.dispatchEvent(new CustomEvent(CFS_SAVE_PLANNING_SNAPSHOT_EVENT))}>
              <Save className="h-4 w-4" /> Save snapshot
            </button>
          </div>
        </header>

        {section === "overview" ? <Overview development={development} economics={economics} flood={flood} hotspots={hotspots} hotspotRows={hotspotRows} model={model} schools={schools} trendRows={trendRows} openEconomicsBuilder={openEconomicsBuilder} /> : null}
        {section === "planning-insights" ? <Planning flood={flood} hotspots={hotspots} hotspotMarkers={hotspotMarkers} hotspotRows={hotspotRows} schools={schools} selected={selectedHotspot} setSelected={(marker: DevelopmentHotspotMapMarker | null) => { setSelectedHotspot(marker); dashboard.setSelectedDevelopmentHotspotContext(marker ? toHotspotContext(marker) : null); }} trendRows={trendRows} openBuilder={openPlanningBuilder} /> : null}
        {section === "economic-insights" ? <Economics economics={economics} openBuilder={openEconomicsBuilder} trendDirection={trends.trendDirection} trendRows={trendRows} /> : null}
        {section === "development-signals" ? <Signals model={model} preview={modelPreview} markers={signalMarkers} selected={selectedSignal} setSelected={(marker: ModelResearchPreviewMarker | null) => { setSelectedSignal(marker); dashboard.setSelectedModelResearchContext(marker); }} openBuilder={openPlanningBuilder} /> : null}

        <footer className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-[#77c99b]" /> Management uses approved CFS evidence. Detailed controls, sources, and methodology remain in Builder.</footer>
      </div>
    </main>
  );
}

function Overview({ development, economics, flood, hotspots, hotspotRows, model, schools, trendRows, openEconomicsBuilder }: any) {
  const strongest = model.rankingSummary.class_distribution.slice(0, 2).reduce((sum: number, row: any) => sum + row.row_count, 0);
  return <>
    <KpiGrid items={[
      ["Permit activity", development.isLoading ? "Loading" : number.format(development.totalPermits), freshness(development.source)],
      ["Active hotspots", hotspots.isLoading ? "Loading" : number.format(hotspots.totalCount), freshness(hotspots.source)],
      ["Flood review", metric(flood.metrics, "review-required-parcels"), freshness(flood.source)],
      ["School posture", schools.capacityStatusLabel, schools.source === "unavailable" ? "Unavailable" : "Limited"],
      ["Elevated signals", number.format(strongest), freshness(model.source)],
      ["Economic posture", economics.data ? number.format(economics.data.summary.high_opportunity_count) : economics.error ? "Unavailable" : "Loading", economics.data?.as_of ? `Updated ${formatDate(economics.data.as_of)}` : freshness(economics.error ? "unavailable" : "loading")],
    ]} />
    <TwoColumns>
      <Panel eyebrow="Development activity" title="Recent permit trend"><CfsTrendChart ariaLabel="Recent development permit activity" rows={trendRows} /></Panel>
      <Panel eyebrow="Planning attention" title="Highest-activity areas"><Watchlist rows={hotspotRows.slice(0, 5).map((item: CfsChartRow) => [item.label, `${number.format(item.value)} permits`])} /></Panel>
    </TwoColumns>
    <ThreeColumns>
      <Panel eyebrow="Constraint posture" title="Review context"><StatusRows rows={[["Flood review", metric(flood.metrics, "review-required-parcels")], ["High/severe impact", metric(flood.metrics, "high-severe-buildability")], ["School assignment review", metric(schools.metrics, "assignment-review")]]} /></Panel>
      <Panel eyebrow="Economic snapshot" title="County portfolio"><StatusRows rows={economics.data ? [["Parcels analyzed", number.format(economics.data.summary.total_parcels_analyzed)], ["High opportunity", number.format(economics.data.summary.high_opportunity_count)], ["Assessed value", formatMoney(economics.data.summary.total_assessed_value)]] : []} /><Action onClick={openEconomicsBuilder}>Open in Builder Economics</Action></Panel>
      <Panel eyebrow="Development signals" title="Research posture"><StatusRows rows={[["Parcels evaluated", number.format(model.rankingSummary.unique_parcel_count)], ["Strongest bands", number.format(strongest)], ["Validation", clean(model.rankingSummary.calibration_status)]]} /></Panel>
    </ThreeColumns>
  </>;
}

function Planning({ flood, hotspots, hotspotMarkers, hotspotRows, schools, selected, setSelected, trendRows, openBuilder }: any) {
  return <>
    <TwoColumns>
      <Panel eyebrow="Development activity" title="Recent permit trend"><CfsTrendChart ariaLabel="Planning development activity trend" rows={trendRows} /></Panel>
      <Panel eyebrow="Development hotspots" title="Ranked permit activity"><CfsRankedBarChart ariaLabel="Ranked development hotspots" rows={hotspotRows} /></Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Geographic context" title="Development hotspots"><ManagementMapPreview ariaLabel="Development hotspot map" markers={hotspotMarkers} onSelect={(marker) => setSelected(hotspots.markers.find((item: DevelopmentHotspotMapMarker) => item.officialParcelId === marker.id) ?? null)} testId="management-hotspot-map" /></Panel>
      <Panel eyebrow="Selected hotspot" title={selected ? selected.pin14 || "Development hotspot" : "Select a hotspot on the map"}>
        {selected ? <StatusRows rows={[["Permit activity", number.format(selected.totalPermitCount)], ["Recent 3 years", number.format(selected.recentPermitCount3yr)], ["Signal", clean(selected.developmentActivityClass)], ["Period", dateRange(selected.firstPermitDate, selected.latestPermitDate)]]} /> : <CompactEmpty>Click a hotspot to review its current observed evidence.</CompactEmpty>}
        <Action disabled={!selected} onClick={() => openBuilder(selected?.officialParcelId)}>Open in Builder</Action>
      </Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Constraints" title="Current review posture"><StatusRows rows={[["Flood review", metric(flood.metrics, "review-required-parcels")], ["High/severe flood impact", metric(flood.metrics, "high-severe-buildability")], ["School assignment review", metric(schools.metrics, "assignment-review")], ["School capacity", schools.capacityStatusLabel]]} /></Panel>
      <Panel eyebrow="Planning watchlist" title="Highest-attention indicators"><Watchlist rows={indicatorCenterDefinitions.filter((item) => ["High Attention", "Review Needed"].includes(item.priorityLabel)).slice(0, 5).map((item) => [item.name, item.priorityLabel])} /></Panel>
    </TwoColumns>
  </>;
}

function Economics({ economics, openBuilder, trendDirection, trendRows }: any) {
  const data = economics.data;
  const currentScenario = data?.scenario_outputs[0];
  return <>
    <KpiGrid items={data ? [["Parcels analyzed", number.format(data.summary.total_parcels_analyzed), freshness(data.context_freshness ?? "current")], ["High opportunity", number.format(data.summary.high_opportunity_count), "Current"], ["Underbuilt watch", number.format(data.summary.underbuilt_candidate_count), "Decision support"], ["Median value / acre", formatMoney(data.summary.median_value_per_acre), "Current"], ["Total assessed value", formatMoney(data.summary.total_assessed_value), "Current"]] : []} />
    <TwoColumns>
      <Panel eyebrow="Economic trend" title="Development-linked activity"><CfsTrendChart ariaLabel="Development-linked economic activity trend" rows={trendRows} /></Panel>
      <Panel eyebrow="Current economic posture" title="What the portfolio indicates now"><StatusRows rows={data ? [["Development activity", clean(trendDirection || "Current trend available")], ["Fiscal / service balance", currentScenario ? clean(currentScenario.constraint_adjusted_opportunity_band) : "Unavailable"], ["Land-value signal", formatMoney(data.summary.median_value_per_acre)], ["Planning implication", data.summary.high_opportunity_count ? `${number.format(data.summary.high_opportunity_count)} parcels warrant deeper economic screening in Builder.` : "Continue portfolio screening as current evidence changes."]] : []} /></Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Opportunity mix" title="Portfolio classification"><CfsRankedBarChart ariaLabel="Economic opportunity classes" rows={(data?.opportunity_class_breakdown ?? []).map((row: any) => ({ label: clean(row.opportunity_class), value: row.count }))} /></Panel>
      <Panel eyebrow="Geographic comparison" title="Assessed-value coverage"><CfsRankedBarChart ariaLabel="Economic parcels by geography" rows={(data?.jurisdiction_value_summary ?? []).slice(0, 8).map((row: any) => ({ label: row.geography_label || "Unspecified", value: row.parcel_count }))} /></Panel>
    </TwoColumns>
    <Panel eyebrow="Scenario results" title="Comparison without Builder controls">
      {data?.scenario_outputs.length ? <div className="grid gap-3 md:grid-cols-2">{data.scenario_outputs.slice(0, 4).map((scenario: any) => <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4" key={scenario.scenario_id}><p className="font-semibold text-white">{scenario.title}</p><StatusRows rows={[["Revenue / acre", clean(scenario.revenue_per_acre_band)], ["Service burden", clean(scenario.service_burden_band)], ["Infrastructure burden", clean(scenario.infrastructure_burden_band)], ["Net condition", clean(scenario.constraint_adjusted_opportunity_band)]]} /></article>)}</div> : <CompactEmpty>{economics.error ?? "Current scenario outputs are unavailable."}</CompactEmpty>}
      <Action onClick={openBuilder}>Open in Builder Economics</Action>
    </Panel>
  </>;
}

function Signals({ model, preview, markers, selected, setSelected, openBuilder }: any) {
  const strongest = model.rankingSummary.class_distribution.slice(0, 2).reduce((sum: number, row: any) => sum + row.row_count, 0);
  return <>
    <Panel eyebrow="Development signals" title="Observed patterns associated with later activity"><p className="max-w-4xl text-sm leading-6 text-slate-300">Identifies parcels or areas exhibiting patterns historically associated with later development activity. This is a decision-support signal—not an approval forecast or certainty.</p></Panel>
    <KpiGrid items={[["Parcels evaluated", model.rankingSummary.unique_parcel_count ? number.format(model.rankingSummary.unique_parcel_count) : "Unavailable", freshness(model.source)], ["Elevated-signal parcels", number.format(strongest || preview.totalCount), "Research only"], ["Model period", model.rankingSummary.experiment_id, "Internal research"], ["Validation", clean(model.rankingSummary.calibration_status), "Limited"]]} />
    <TwoColumns>
      <Panel eyebrow="Signal distribution" title="Relative research bands"><CfsRankedBarChart ariaLabel="Development signal distribution" rows={model.rankingSummary.class_distribution.map((row: any) => ({ label: clean(row.development_signal_class), value: row.row_count }))} /></Panel>
      <Panel eyebrow="Model validation" title="Aggregate performance"><CfsRankedBarChart ariaLabel="Development model validation comparison" rows={developmentModelLabSummary.evaluationRows.map((row) => ({ label: row.variant, value: Number(row.liftTop5) }))} /><p className="mt-3 text-xs leading-5 text-slate-400">Lift at the top 5% improved from {standardizedDevelopmentPredictionMetrics.baselineLiftAtTop5.toFixed(2)}× to {standardizedDevelopmentPredictionMetrics.currentBestLiftAtTop5.toFixed(2)}×. Probability calibration remains weak.</p></Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Geographic context" title="Strongest development signals"><ManagementMapPreview ariaLabel="Development signal map" markers={markers} onSelect={(marker) => setSelected(preview.markers.find((item: ModelResearchPreviewMarker) => item.officialParcelId === marker.id) ?? null)} testId="management-signal-map" /></Panel>
      <Panel eyebrow="Signal watchlist" title={selected ? selected.approximateAreaLabel || "Selected development signal" : "Highest-signal areas"}>
        {selected ? <><StatusRows rows={[["Signal band", clean(selected.researchRankBand)], ["Label", clean(selected.researchSignalLabel)], ["Model", clean(selected.modelVersion)]]} /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Major contributing context</p><ul className="mt-2 space-y-2 text-sm text-slate-300">{selected.topDrivers.map((driver: string) => <li key={driver}>• {clean(driver)}</li>)}</ul><p className="mt-4 text-xs leading-5 text-amber-100/80">{selected.caveat}</p></> : <><Watchlist rows={preview.markers.slice(0, 5).map((marker: ModelResearchPreviewMarker) => [marker.approximateAreaLabel || marker.officialParcelId, clean(marker.researchRankBand)])} /><p className="mt-3 text-xs leading-5 text-slate-400">Select a map signal for parcel-level evidence and research caveats.</p></>}
        <Action disabled={!selected} onClick={() => openBuilder(selected?.officialParcelId, selected ?? undefined)}>Investigate in Builder</Action>
      </Panel>
    </TwoColumns>
  </>;
}

function Panel({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) { return <section className="cfs-command-surface rounded-2xl p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9bd1de]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2><div className="mt-5">{children}</div></section>; }
function TwoColumns({ children }: { children: ReactNode }) { return <div className="grid gap-5 xl:grid-cols-2">{children}</div>; }
function ThreeColumns({ children }: { children: ReactNode }) { return <div className="grid gap-5 lg:grid-cols-3">{children}</div>; }
function KpiGrid({ items }: { items: string[][] }) { return items.length ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(([label, value, status]) => <article className="cfs-command-surface rounded-xl p-4" key={label}><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 break-words text-2xl font-semibold text-white">{value}</p><p className="mt-2 text-xs text-[#9bd1de]">{status}</p></article>)}</section> : <CompactEmpty>Current summary data is unavailable.</CompactEmpty>; }
function StatusRows({ rows }: { rows: string[][] }) { return rows.length ? <dl className="space-y-3">{rows.map(([label, value]) => <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-3 last:border-0" key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="max-w-[60%] text-right text-sm font-semibold capitalize text-white">{value}</dd></div>)}</dl> : <CompactEmpty>Current source data is unavailable.</CompactEmpty>; }
function Watchlist({ rows }: { rows: string[][] }) { return rows.length ? <ol className="space-y-3">{rows.map(([label, value], index) => <li className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3" key={`${label}-${index}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#82c9d8]/12 text-xs font-bold text-[#9bd1de]">{index + 1}</span><span className="min-w-0 flex-1 text-sm font-medium text-white">{label}</span><span className="text-xs text-slate-400">{value}</span></li>)}</ol> : <CompactEmpty>No current high-attention records.</CompactEmpty>; }
function Action({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) { return <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#82c9d8]/30 bg-[#82c9d8]/10 px-3.5 py-2 text-sm font-semibold text-[#bce3eb] transition hover:bg-[#82c9d8]/15 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick}>{children}<ArrowRight className="h-4 w-4" /></button>; }
function CompactEmpty({ children }: { children: ReactNode }) { return <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">{children}</p>; }

function toHotspotMapMarker(marker: DevelopmentHotspotMapMarker): ManagementMapMarker { return { id: marker.officialParcelId, label: marker.pin14 || marker.officialParcelId, latitude: marker.centroid.latitude, longitude: marker.centroid.longitude, tone: "hotspot" }; }
function toSignalMapMarker(marker: ModelResearchPreviewMarker): ManagementMapMarker { return { id: marker.officialParcelId, label: marker.approximateAreaLabel || marker.officialParcelId, latitude: marker.centroid.latitude, longitude: marker.centroid.longitude, tone: "signal" }; }
function toHotspotContext(marker: DevelopmentHotspotMapMarker): SelectedDevelopmentHotspotContext {
  return {
    analysisPeriod: dateRange(marker.firstPermitDate, marker.latestPermitDate),
    activityClass: marker.developmentActivityClass,
    areaLabel: marker.pin14 || marker.officialParcelId,
    caveat: "Observed permit activity supports planning review; it is not an approval decision.",
    contextKind: "individual",
    developmentActivityScore: marker.developmentActivityScore,
    displayMode: "individual_markers",
    dominantActivityType: marker.dominantGrowthSignal,
    dominantPermitSegment: marker.dominantPermitSegment,
    highValuePermits: marker.highValuePermits,
    latestActivityLabel: marker.latestPermitDate ?? "Current record",
    majorValuePermits: marker.majorValuePermits,
    officialParcelId: marker.officialParcelId,
    parcelsRepresented: 1,
    pin14: marker.pin14,
    recentPermitCount1yr: marker.recentPermitCount1yr,
    recentPermitCount3yr: marker.recentPermitCount3yr,
    recordsRepresented: marker.totalPermitCount,
    representedParcelIds: [marker.officialParcelId],
    selectedPermitSegment: marker.dominantPermitSegment,
    segmentCounts: {
      administrativeOrUnknown: 0,
      commercialActivity: marker.commercialActivityPermits,
      demolition: marker.demolitionPermits,
      industrialActivity: marker.industrialActivityPermits,
      institutionalActivity: marker.institutionalActivityPermits,
      minorMaintenance: marker.minorMaintenancePermits,
      redevelopmentSignal: marker.redevelopmentSignalPermits,
      residentialGrowth: marker.residentialGrowthPermits,
    },
    topDrivers: [marker.dominantPermitSegment, marker.dominantGrowthSignal].filter((value): value is string => Boolean(value)),
    totalPermitCount: marker.totalPermitCount,
    whyHighlighted: "Ranked among the current observed development-activity hotspots.",
    zoningJurisdictionName: marker.zoningJurisdictionName,
  };
}
function metric(items: { id: string; value: string }[], id: string) { return items.find((item) => item.id === id)?.value ?? "Unavailable"; }
function clean(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function freshness(source: string) { return source === "api" || source === "current" || source === "current_session" ? "Current" : source === "loading" ? "Loading" : source === "unavailable" || source === "fallback" ? "Unavailable" : "Demo extract"; }
function formatMoney(value: number | null) { return typeof value === "number" ? money.format(value) : "Unavailable"; }
function formatDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" }); }
function dateRange(start?: string | null, end?: string | null) { return start || end ? `${start ? formatDate(start) : "Earlier"}–${end ? formatDate(end) : "Current"}` : "Current record"; }
function title(section: ManagementSection) { return ({ overview: "Executive Overview", "planning-insights": "Planning Insights", "economic-insights": "Economic Insights", "development-signals": "Development Signals" })[section]; }
function description(section: ManagementSection) { return ({ overview: "What the Planning Director should know now, grounded in current CFS evidence.", "planning-insights": "Observed activity, geographic concentration, and constraints that need attention.", "economic-insights": "Portfolio posture and scenario results without the detailed Builder controls.", "development-signals": "Patterns historically associated with later development activity—not a forecast or approval decision." })[section]; }
