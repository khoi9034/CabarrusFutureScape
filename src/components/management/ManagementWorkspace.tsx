"use client";

import { ArrowRight, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CfsRankedBarChart, CfsTrendChart, type CfsChartRow } from "@/components/management/CfsManagementCharts";
import { InsightInfoPopover, type InsightInfo } from "@/components/management/InsightInfoPopover";
import { ManagementMapPreview, type ManagementMapMarker } from "@/components/management/ManagementMapPreview";
import { BackendRecoveryPanel } from "@/components/layout/BackendRecoveryPanel";
import { PlanningSnapshotSaveController } from "@/components/dashboard/IntelligencePanel";
import { CFS_SAVE_PLANNING_SNAPSHOT_EVENT } from "@/components/dashboard/OverviewCommandCenter";
import { developmentModelLabSummary } from "@/data/intelligence/developmentModelLab";
import { indicatorCenterDefinitions } from "@/data/intelligence/indicatorCenter";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { BackendAvailabilityController } from "@/hooks/useBackendAvailability";
import { useDevelopmentActivitySummary } from "@/hooks/useDevelopmentActivitySummary";
import { useDevelopmentHotspots } from "@/hooks/useDevelopmentHotspots";
import { useDevelopmentPredictionResearchStatus } from "@/hooks/useDevelopmentPredictionResearchStatus";
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

export function ManagementWorkspace({ backend, section }: { backend: BackendAvailabilityController; section: ManagementSection }) {
  if (backend.status !== "healthy") {
    return (
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" data-management-section={section} data-testid="cfs-management-workspace">
        <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-5">
          <header className="cfs-command-surface rounded-2xl px-5 py-6 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9bd1de]">CFS Management</p>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{title(section)}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{description(section)}</p>
          </header>
          <BackendRecoveryPanel controller={backend} />
        </div>
      </main>
    );
  }
  return <ManagementDataWorkspace section={section} />;
}

function ManagementDataWorkspace({ section }: { section: ManagementSection }) {
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

        {section === "overview" ? <Overview development={development} economics={economics} flood={flood} hotspots={hotspots} hotspotRows={hotspotRows} model={model} schools={schools} trendRows={trendRows} trendSource={trends.source} openEconomicsBuilder={openEconomicsBuilder} /> : null}
        {section === "planning-insights" ? <Planning development={development} flood={flood} hotspots={hotspots} hotspotMarkers={hotspotMarkers} hotspotRows={hotspotRows} schools={schools} selected={selectedHotspot} setSelected={(marker: DevelopmentHotspotMapMarker | null) => { setSelectedHotspot(marker); dashboard.setSelectedDevelopmentHotspotContext(marker ? toHotspotContext(marker) : null); }} trendRows={trendRows} trendSource={trends.source} openBuilder={openPlanningBuilder} /> : null}
        {section === "economic-insights" ? <Economics development={development} economics={economics} openBuilder={openEconomicsBuilder} trendDirection={trends.trendDirection} trendRows={trendRows} /> : null}
        {section === "development-signals" ? <Signals model={model} preview={modelPreview} markers={signalMarkers} selected={selectedSignal} setSelected={(marker: ModelResearchPreviewMarker | null) => { setSelectedSignal(marker); dashboard.setSelectedModelResearchContext(marker); }} openBuilder={openPlanningBuilder} /> : null}

        <footer className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-[#77c99b]" /> Management uses approved CFS evidence. Detailed controls, sources, and methodology remain in Builder.</footer>
      </div>
    </main>
  );
}

function Overview({ development, economics, flood, hotspots, hotspotRows, model, schools, trendRows, trendSource, openEconomicsBuilder }: any) {
  const strongest = model.rankingSummary.class_distribution.slice(0, 2).reduce((sum: number, row: any) => sum + row.row_count, 0);
  const permits = permitTrust(development);
  const hotspotData = hotspotTrust(hotspots);
  const floodData = floodTrust(flood);
  const schoolData = schoolTrust(schools);
  const economicData = economicsTrust(economics);
  const signalData = modelTrust(model);
  return <>
    <KpiGrid items={[
      { label: "Permit activity", value: countValue(development.source, development.isLoading, development.totalPermits), status: datedStatus(development.source, development.activityDateMax), info: insight("permitActivity", permits) },
      { label: "Active hotspots", value: countValue(hotspots.source, hotspots.isLoading, hotspots.totalCount), status: datedStatus(hotspots.source, latestHotspotDate(hotspots)), info: insight("activeHotspots", hotspotData) },
      { label: "Flood review", value: metric(flood.metrics, "review-required-parcels"), status: freshness(flood.source), info: insight("floodReview", floodData) },
      { label: "School posture", value: schools.isLoading ? "Loading" : sourceAvailable(schools.source) ? schools.capacityStatusLabel : "Unavailable", status: sourceAvailable(schools.source) ? "Limited" : "Unavailable", info: insight("schoolPosture", schoolData) },
      { label: "Elevated signals", value: countValue(model.source, model.isLoading, strongest), status: sourceAvailable(model.source) ? "Limited" : "Unavailable", info: insight("elevatedSignals", signalData) },
      { label: "Economic posture", value: economics.data ? number.format(economics.data.summary.high_opportunity_count) : economics.error ? "Unavailable" : "Loading", status: economics.data ? freshness(economics.data.context_freshness ?? "current") : freshness(economics.error ? "unavailable" : "loading"), info: insight("economicPosture", economicData) },
    ]} />
    <TwoColumns>
      <Panel eyebrow="Development activity" info={insight("permitTrend", permits)} title="Recent permit trend"><CfsTrendChart ariaLabel="Recent development permit activity" emptyMessage={unavailableMessage(trendSource, "No permit activity was recorded for this period.")} rows={trendRows} /></Panel>
      <Panel eyebrow="Planning attention" info={insight("planningAttention", hotspotData)} title="Highest-activity areas"><Watchlist emptyMessage={unavailableMessage(hotspots.source, "No high-activity areas were identified.")} rows={hotspotRows.slice(0, 5).map((item: CfsChartRow) => [item.label, `${number.format(item.value)} permits`])} /></Panel>
    </TwoColumns>
    <ThreeColumns>
      <Panel eyebrow="Constraint posture" info={insight("constraintPosture", combineTrust("Planning constraints", [floodData, schoolData]))} title="Review context"><StatusRows rows={[["Flood review", metric(flood.metrics, "review-required-parcels")], ["High/severe impact", metric(flood.metrics, "high-severe-buildability")], ["School assignment review", metric(schools.metrics, "assignment-review")]]} /></Panel>
      <Panel eyebrow="Economic snapshot" info={insight("economicSnapshot", economicData)} title="County portfolio"><StatusRows rows={economics.data ? [["Parcels analyzed", number.format(economics.data.summary.total_parcels_analyzed)], ["High opportunity", number.format(economics.data.summary.high_opportunity_count)], ["Assessed value", formatMoney(economics.data.summary.total_assessed_value)]] : []} /><Action onClick={openEconomicsBuilder}>Open in Builder Economics</Action></Panel>
      <Panel eyebrow="Development signals" info={insight("developmentSummary", signalData)} title="Decision-support posture"><StatusRows rows={sourceAvailable(model.source) ? [["Parcels evaluated", number.format(model.rankingSummary.unique_parcel_count)], ["Strongest bands", number.format(strongest)], ["Validation", "Limited — use as supporting evidence only"]] : []} /></Panel>
    </ThreeColumns>
    <DataTrust items={[permits, floodData, schoolData, economicData, signalData]} />
  </>;
}

function Planning({ development, flood, hotspots, hotspotMarkers, hotspotRows, schools, selected, setSelected, trendRows, trendSource, openBuilder }: any) {
  const permits = permitTrust(development);
  const hotspotData = hotspotTrust(hotspots);
  const floodData = floodTrust(flood);
  const schoolData = schoolTrust(schools);
  const constraintData = combineTrust("Planning constraints", [floodData, schoolData]);
  return <>
    <TwoColumns>
      <Panel eyebrow="Development activity" info={insight("permitTrend", permits)} title="Recent permit trend"><CfsTrendChart ariaLabel="Planning development activity trend" emptyMessage={unavailableMessage(trendSource, "No permit activity was recorded for this period.")} rows={trendRows} /></Panel>
      <Panel eyebrow="Development hotspots" info={insight("hotspotRanking", hotspotData)} title="Ranked permit activity"><CfsRankedBarChart ariaLabel="Ranked development hotspots" emptyMessage={unavailableMessage(hotspots.source, "No development hotspots were identified.")} rows={hotspotRows} /></Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Geographic context" info={insight("hotspotMap", hotspotData)} title="Development hotspots"><ManagementMapPreview ariaLabel="Development hotspot map" markers={hotspotMarkers} onSelect={(marker) => setSelected(hotspots.markers.find((item: DevelopmentHotspotMapMarker) => item.officialParcelId === marker.id) ?? null)} testId="management-hotspot-map" /></Panel>
      <Panel eyebrow="Selected hotspot" info={insight("selectedHotspot", hotspotData)} title={selected ? selected.managementLabel || selected.zoningJurisdictionName || "Selected development hotspot" : "Select a hotspot on the map"}>
        {selected ? <StatusRows rows={[["Permit activity", number.format(selected.totalPermitCount)], ["Recent 3 years", number.format(selected.recentPermitCount3yr)], ["Signal", clean(selected.developmentActivityClass)], ["Period", dateRange(selected.firstPermitDate, selected.latestPermitDate)]]} /> : <CompactEmpty>Click a hotspot to review its current observed evidence.</CompactEmpty>}
        <Action disabled={!selected} onClick={() => openBuilder(selected?.officialParcelId)}>Open in Builder</Action>
      </Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Constraints" info={insight("planningConstraints", constraintData)} title="Current review posture"><StatusRows rows={[["Flood review", metric(flood.metrics, "review-required-parcels")], ["High/severe flood impact", metric(flood.metrics, "high-severe-buildability")], ["School assignment review", metric(schools.metrics, "assignment-review")], ["School capacity", schools.capacityStatusLabel]]} /></Panel>
      <Panel eyebrow="Planning watchlist" info={insight("planningWatchlist", planningWatchlistTrust())} title="Highest-attention indicators"><Watchlist rows={indicatorCenterDefinitions.filter((item) => ["High Attention", "Review Needed"].includes(item.priorityLabel)).slice(0, 5).map((item) => [item.name, item.priorityLabel])} /></Panel>
    </TwoColumns>
    <DataTrust items={[hotspotData, floodData, schoolData]} />
  </>;
}

function Economics({ development, economics, openBuilder, trendDirection, trendRows }: any) {
  const data = economics.data;
  const currentScenario = data?.scenario_outputs?.[0];
  const economicData = economicsTrust(economics);
  const permits = permitTrust(development);
  return <>
    <KpiGrid items={data ? [
      { label: "Parcels analyzed", value: number.format(data.summary.total_parcels_analyzed), status: freshness(data.context_freshness ?? "current"), info: insight("parcelsAnalyzed", economicData) },
      { label: "High opportunity", value: number.format(data.summary.high_opportunity_count), status: "Current", info: insight("highOpportunity", economicData) },
      { label: "Underbuilt watch", value: number.format(data.summary.underbuilt_candidate_count), status: "Limited", info: insight("underbuiltWatch", economicData) },
      { label: "Median value / acre", value: formatMoney(data.summary.median_value_per_acre), status: "Current", info: insight("medianValue", economicData) },
      { label: "Total assessed value", value: formatMoney(data.summary.total_assessed_value), status: "Current", info: insight("totalAssessedValue", economicData) },
    ] : []} />
    <TwoColumns>
      <Panel eyebrow="Economic trend" info={insight("economicTrend", permits)} title="Development-linked activity"><CfsTrendChart ariaLabel="Development-linked economic activity trend" emptyMessage="Development activity is unavailable for this comparison." rows={trendRows} /></Panel>
      <Panel eyebrow="Current economic posture" info={insight("currentEconomicPosture", economicData)} title="What the portfolio indicates now"><StatusRows rows={data ? [["Development activity", clean(trendDirection || "Current trend available")], ["Fiscal / service balance", currentScenario ? clean(currentScenario.constraint_adjusted_opportunity_band) : "Unavailable"], ["Land-value signal", formatMoney(data.summary.median_value_per_acre)], ["Planning implication", data.summary.high_opportunity_count ? `${number.format(data.summary.high_opportunity_count)} parcels warrant deeper economic screening in Builder.` : "Continue portfolio screening as current evidence changes."]] : []} /></Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Opportunity mix" info={insight("opportunityMix", economicData)} title="Portfolio classification"><CfsRankedBarChart ariaLabel="Economic opportunity classes" rows={(data?.opportunity_class_breakdown ?? []).map((row: any) => ({ label: clean(row.opportunity_class), value: row.count }))} /></Panel>
      <Panel eyebrow="Geographic comparison" info={insight("geographicComparison", economicData)} title="Assessed-value coverage"><CfsRankedBarChart ariaLabel="Economic parcels by geography" rows={(data?.jurisdiction_value_summary ?? []).slice(0, 8).map((row: any) => ({ label: areaLabel(row.geography_label), value: row.parcel_count }))} /></Panel>
    </TwoColumns>
    <Panel eyebrow="Scenario results" info={insight("scenarioResults", economicData)} title="Comparison without Builder controls">
      {data?.scenario_outputs?.length ? <div className="grid gap-3 md:grid-cols-2">{data.scenario_outputs.slice(0, 4).map((scenario: any) => <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4" key={scenario.scenario_id}><p className="font-semibold text-white">{scenario.title}</p><StatusRows rows={[["Revenue / acre", clean(scenario.revenue_per_acre_band)], ["Service burden", clean(scenario.service_burden_band)], ["Infrastructure burden", clean(scenario.infrastructure_burden_band)], ["Net condition", clean(scenario.constraint_adjusted_opportunity_band)]]} /></article>)}</div> : <CompactEmpty>Economic intelligence is temporarily unavailable.</CompactEmpty>}
      <Action onClick={openBuilder}>Open in Builder Economics</Action>
    </Panel>
    <DataTrust items={[economicData]} />
  </>;
}

function Signals({ model, preview, markers, selected, setSelected, openBuilder }: any) {
  const strongest = model.rankingSummary.class_distribution.slice(0, 2).reduce((sum: number, row: any) => sum + row.row_count, 0);
  const modelIsAvailable = sourceAvailable(model.source);
  const previewIsAvailable = preview.status === "ready" && ["api", "demo"].includes(preview.source);
  const elevatedCount = modelIsAvailable ? strongest : previewIsAvailable ? preview.totalCount : null;
  const signalData = modelTrust(model, preview);
  return <>
    <Panel eyebrow="Development signals" info={insight("developmentSignals", signalData)} title="Observed patterns associated with later activity"><p className="max-w-4xl text-sm leading-6 text-slate-300">Identifies parcels or areas exhibiting patterns historically associated with later development activity. This is a decision-support signal—not an approval forecast or certainty.</p></Panel>
    <KpiGrid items={[
      { label: "Parcels evaluated", value: countValue(model.source, model.isLoading, model.rankingSummary.unique_parcel_count), status: modelIsAvailable ? "Limited" : "Unavailable", info: insight("parcelsEvaluated", signalData) },
      { label: "Elevated-signal parcels", value: elevatedCount === null ? "Unavailable" : number.format(elevatedCount), status: elevatedCount === null ? "Unavailable" : "Limited", info: insight("elevatedCount", signalData) },
      { label: "Evidence period", value: modelIsAvailable || previewIsAvailable ? "2014–2022" : "Unavailable", status: modelIsAvailable || previewIsAvailable ? "Limited" : "Unavailable", info: insight("evidencePeriod", signalData) },
      { label: "Validation", value: modelIsAvailable ? "Useful for ranking; not forecasting" : "Unavailable", status: modelIsAvailable ? "Limited" : "Unavailable", info: insight("validationStatus", signalData) },
    ]} />
    <Panel eyebrow="Model trust" info={insight("modelTrust", signalData)} title="How to use these signals"><StatusRows rows={modelIsAvailable || previewIsAvailable ? [["Training period", "2014–2019"], ["Validation period", "2020–2021"], ["Test period", "2022"], ["Last trained", "Not published"], ["Primary drivers", "Historical zoning, transportation access, and tax/value context"]] : []} /><p className="mt-4 text-sm leading-6 text-slate-300">Use these patterns as supporting evidence only. They are not an approval forecast or certainty, and observed relationships can change.</p></Panel>
    <TwoColumns>
      <Panel eyebrow="Signal distribution" info={insight("signalDistribution", signalData)} title="Relative signal bands"><CfsRankedBarChart ariaLabel="Development signal distribution" emptyMessage={unavailableMessage(model.source, "No elevated development signals were identified.")} rows={model.rankingSummary.class_distribution.map((row: any) => ({ label: signalLabel(row.development_signal_class), value: row.row_count }))} /></Panel>
      <Panel eyebrow="Validation" info={insight("historicalValidation", signalData)} title="Historical ranking check"><CfsRankedBarChart ariaLabel="Development signal historical validation comparison" emptyMessage="Historical validation is unavailable." rows={modelIsAvailable ? developmentModelLabSummary.evaluationRows.map((row) => ({ label: row.variant, value: Number(row.liftTop5) })) : []} />{modelIsAvailable ? <p className="mt-3 text-xs leading-5 text-slate-400">The current research version identifies more later activity in its highest-ranked group than the earlier baseline, but it is not reliable enough for forecasts.</p> : null}</Panel>
    </TwoColumns>
    <TwoColumns>
      <Panel eyebrow="Geographic context" info={insight("signalMap", signalData)} title="Strongest development signals"><ManagementMapPreview ariaLabel="Development signal map" markers={markers} onSelect={(marker) => setSelected(preview.markers.find((item: ModelResearchPreviewMarker) => item.officialParcelId === marker.id) ?? null)} testId="management-signal-map" /></Panel>
      <Panel eyebrow="Signal watchlist" info={insight("signalWatchlist", signalData)} title={selected ? selected.approximateAreaLabel || "Selected development signal" : "Highest-signal areas"}>
        {selected ? <><StatusRows rows={[["Signal band", signalLabel(selected.researchRankBand)], ["Pattern", signalLabel(selected.researchSignalLabel)]]} /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Major contributing context</p><ul className="mt-2 space-y-2 text-sm text-slate-300">{selected.topDrivers.map((driver: string) => <li key={driver}>• {clean(driver)}</li>)}</ul><p className="mt-4 text-xs leading-5 text-amber-100/80">Decision support only. Review the underlying evidence in Builder before drawing conclusions.</p></> : <><Watchlist emptyMessage={preview.status === "empty" ? "No elevated signals were identified." : "Development signal geography is unavailable."} rows={preview.markers.slice(0, 5).map((marker: ModelResearchPreviewMarker) => [marker.approximateAreaLabel || "County parcel area", signalLabel(marker.researchRankBand)])} /><p className="mt-3 text-xs leading-5 text-slate-400">Select a map signal for its supporting evidence and limitations.</p></>}
        <Action disabled={!selected} onClick={() => openBuilder(selected?.officialParcelId, selected ?? undefined)}>Investigate in Builder</Action>
      </Panel>
    </TwoColumns>
    <DataTrust items={[signalData]} />
  </>;
}

function Panel({ children, eyebrow, info, title }: { children: ReactNode; eyebrow: string; info?: InsightInfo; title: string }) { return <section className="cfs-command-surface relative rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9bd1de]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2></div>{info ? <InsightInfoPopover info={info} /> : null}</div><div className="mt-5">{children}</div></section>; }
function TwoColumns({ children }: { children: ReactNode }) { return <div className="grid gap-5 xl:grid-cols-2">{children}</div>; }
function ThreeColumns({ children }: { children: ReactNode }) { return <div className="grid gap-5 lg:grid-cols-3">{children}</div>; }
type KpiItem = { info: InsightInfo; label: string; status: string; value: string };
function KpiGrid({ items }: { items: KpiItem[] }) { return items.length ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(({ info, label, status, value }) => <article className="cfs-command-surface relative rounded-xl p-4 pr-12" key={label}><div className="absolute right-3 top-3"><InsightInfoPopover info={info} /></div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 break-words text-2xl font-semibold text-white">{value}</p><p className="mt-2 text-xs text-[#9bd1de]">{status}</p></article>)}</section> : <CompactEmpty>Current summary data is unavailable.</CompactEmpty>; }
function StatusRows({ rows }: { rows: string[][] }) { return rows.length ? <dl className="space-y-3">{rows.map(([label, value]) => <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-3 last:border-0" key={label}><dt className="text-sm text-slate-400">{label}</dt><dd className="max-w-[60%] text-right text-sm font-semibold text-white">{value}</dd></div>)}</dl> : <CompactEmpty>This information is currently unavailable.</CompactEmpty>; }
function Watchlist({ emptyMessage = "No high-attention records are present in the current data.", rows }: { emptyMessage?: string; rows: string[][] }) { return rows.length ? <ol className="space-y-3">{rows.map(([label, value], index) => <li className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3" key={`${label}-${index}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#82c9d8]/12 text-xs font-bold text-[#9bd1de]">{index + 1}</span><span className="min-w-0 flex-1 text-sm font-medium text-white">{label}</span><span className="text-xs text-slate-400">{value}</span></li>)}</ol> : <CompactEmpty>{emptyMessage}</CompactEmpty>; }
function Action({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) { return <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#82c9d8]/30 bg-[#82c9d8]/10 px-3.5 py-2 text-sm font-semibold text-[#bce3eb] transition hover:bg-[#82c9d8]/15 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick}>{children}<ArrowRight className="h-4 w-4" /></button>; }
function CompactEmpty({ children }: { children: ReactNode }) { return <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">{children}</p>; }

type TrustStatus = "Current" | "Limited" | "Stale" | "Unavailable";
type TrustItem = { coverage: string; currentThrough: string; label: string; note?: string; source: string | string[]; status: TrustStatus };
function DataTrust({ items }: { items: TrustItem[] }) { return <section aria-label="Data status" className="cfs-command-surface rounded-2xl p-5 sm:p-6" data-testid="management-data-trust"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9bd1de]">Data status</p><div className="mt-4 divide-y divide-white/8">{items.map((item) => <div className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(10rem,1.1fr)_minmax(12rem,1.5fr)_minmax(8rem,1fr)_auto] md:items-center" key={item.label}><div><p className="text-sm font-semibold text-white">{item.label}</p>{item.note ? <p className="mt-1 text-xs leading-5 text-slate-400">{item.note}</p> : null}</div><p className="text-xs text-slate-400"><span className="text-slate-500">Source:</span> {sourceText(item.source)}<br /><span className="text-slate-500">Current through:</span> {item.currentThrough}</p><p className="text-xs text-slate-400"><span className="text-slate-500">Coverage:</span> {item.coverage}</p><StatusBadge status={item.status} /></div>)}</div></section>; }
function StatusBadge({ status }: { status: TrustStatus }) { const tone = status === "Current" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : status === "Unavailable" ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : status === "Stale" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-sky-300/25 bg-sky-300/10 text-sky-100"; return <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>; }

const insightCopy = {
  permitActivity: ["Permit activity", "Total permit records represented in the current Management summary.", "Observed permits describe recorded activity; they do not predict future approvals or construction."],
  activeHotspots: ["Active hotspots", "Areas with concentrated observed permit activity during the available record period.", "Hotspots are descriptive planning signals, not predictions."],
  floodReview: ["Flood review", "Parcels flagged for added flood-context review during planning screening.", "Mapped context supports screening; verify current site conditions and official sources during review."],
  schoolPosture: ["School posture", "The current availability and planning usefulness of school assignment and capacity context.", "Official school capacity information is incomplete."],
  elevatedSignals: ["Elevated signals", "Parcels in the strongest historical development-signal bands.", "This is decision-support analysis, not a forecast that a parcel will develop."],
  economicPosture: ["Economic posture", "Parcels meeting the current CFS economic opportunity criteria.", "Opportunity classifications support screening and require deeper review in Builder."],
  permitTrend: ["Development activity trend", "How recorded permit activity changes across the most recent available periods.", "Observed activity is descriptive planning context, not a development forecast."],
  planningAttention: ["Planning attention", "The highest-activity areas in the current permit evidence.", "Ranking reflects observed records and should be reviewed with constraints and local context."],
  constraintPosture: ["Constraint posture", "A concise screening view of flood and school considerations that may require attention.", "These indicators support early review and do not replace official determinations."],
  economicSnapshot: ["Economic snapshot", "A countywide summary of assessed value and parcels meeting current opportunity criteria.", "Use Builder for parcel-level assumptions and scenario analysis."],
  developmentSummary: ["Development Signals summary", "Historical patterns that help prioritize areas for further planning review.", "Signals are decision support only—not approval forecasts or certainty."],
  hotspotRanking: ["Development hotspots", "Areas ranked by concentrated observed permit activity.", "A hotspot indicates recorded activity, not future development certainty."],
  hotspotMap: ["Development hotspot map", "Countywide locations of concentrated observed development and permit activity.", "Hotspots are descriptive planning signals, not predictions; map locations are provided for screening context."],
  selectedHotspot: ["Selected hotspot", "The observed permit evidence associated with the hotspot selected on the map.", "Open Builder before using this evidence for parcel-level decisions."],
  planningConstraints: ["Planning constraints", "Flood and school context that may warrant additional planning review.", "Screening indicators do not replace official flood, school, or site determinations."],
  planningWatchlist: ["Planning watchlist", "County indicators currently marked for attention or review.", "Watchlist priority is a screening aid and should be considered with underlying evidence."],
  parcelsAnalyzed: ["Parcels analyzed", "Parcels included in the current economic portfolio analysis.", "Coverage reflects records with enough information for the current analysis."],
  highOpportunity: ["High opportunity", "Parcels meeting the current CFS economic opportunity criteria.", "This classification is a screening result, not an investment or development recommendation."],
  underbuiltWatch: ["Underbuilt watch", "Parcels whose current improvement and land-value pattern warrants additional screening.", "The classification is based on available parcel context and may be incomplete."],
  medianValue: ["Median value per acre", "The middle assessed-value-per-acre result across analyzed parcels.", "Assessed value is planning context and may differ from market value."],
  totalAssessedValue: ["Total assessed value", "Combined assessed value represented by the analyzed parcel portfolio.", "This is an aggregate planning measure, not a market valuation."],
  economicTrend: ["Economic trend", "Recent development-linked activity shown alongside the economic portfolio.", "Observed activity is descriptive and should not be treated as a forecast."],
  currentEconomicPosture: ["Current economic posture", "A concise reading of activity, land value, and the available scenario context.", "Open Builder to review assumptions before drawing parcel-level conclusions."],
  opportunityMix: ["Opportunity mix", "How analyzed parcels are distributed across the current economic opportunity classifications.", "Classifications prioritize review; they are not recommendations."],
  geographicComparison: ["Geographic comparison", "Analyzed parcel coverage grouped by available planning geography.", "Differences may reflect source coverage as well as real geographic patterns."],
  scenarioResults: ["Scenario results", "Saved or current economic comparisons produced with the assumptions shown in Builder.", "Scenario outputs depend on their assumptions and are not forecasts."],
  developmentSignals: ["Development Signals", "Parcels or areas showing patterns historically associated with later development activity.", "This is decision-support analysis, not a forecast that a parcel will be developed."],
  parcelsEvaluated: ["Parcels evaluated", "Parcels included in the historical development-signal analysis.", "Inclusion means the parcel had sufficient research context; it does not imply development potential."],
  elevatedCount: ["Elevated-signal parcels", "Parcels in the strongest relative signal bands in the current research output.", "Elevated signals support prioritization only and do not predict parcel development."],
  evidencePeriod: ["Evidence period", "The historical period used to evaluate development-signal performance.", "Observed relationships can change after the evidence period."],
  validationStatus: ["Validation status", "Whether historical testing supports using signals to rank areas for further review.", "The analysis is useful for ranking, not reliable forecasting."],
  modelTrust: ["Model trust", "Uses 2014–2019 training, 2020–2021 validation, and 2022 testing. Primary drivers include historical zoning, transportation access, and tax/value context; the last model update is not published.", "Use as supporting evidence only. It is not an approval forecast or certainty, and observed relationships can change."],
  signalDistribution: ["Signal distribution", "How evaluated parcels are distributed across relative development-signal bands.", "Bands compare historical patterns; they are not development probabilities."],
  historicalValidation: ["Historical ranking check", "Compares how well research versions ranked parcels associated with later observed activity.", "Historical performance does not guarantee future results."],
  signalMap: ["Development signal map", "Countywide locations of the strongest available historical development signals.", "Map signals are decision-support context, not parcel development forecasts."],
  signalWatchlist: ["Signal watchlist", "The strongest mapped signals and, when selected, their main contributing context.", "Review underlying evidence in Builder before drawing conclusions."],
} as const;

type InsightKey = keyof typeof insightCopy;
function insight(key: InsightKey, trust: TrustItem): InsightInfo { const [title, meaning, limitations] = insightCopy[key]; return { coverage: known(trust.coverage), currentThrough: known(trust.currentThrough), limitations, meaning, sources: trust.source, status: trust.status, title }; }
function known(value: string) { return value === "Unavailable" ? undefined : value; }
function sourceText(source: string | string[]) { return Array.isArray(source) ? source.join("; ") : source; }
function combineTrust(label: string, items: TrustItem[]): TrustItem { const available = items.filter((item) => item.status !== "Unavailable"); const sources = [...new Set(items.flatMap((item) => Array.isArray(item.source) ? item.source : [item.source]))]; return { coverage: available.length ? "Countywide screening context" : "Unavailable", currentThrough: available.length ? "Varies by source" : "Unavailable", label, source: sources, status: !available.length ? "Unavailable" : available.some((item) => item.status === "Stale") ? "Stale" : available.some((item) => item.status !== "Current") || available.length !== items.length ? "Limited" : "Current" }; }
function planningWatchlistTrust(): TrustItem { return { coverage: "Countywide high-attention indicators", currentThrough: "Current planning configuration", label: "Planning watchlist", source: "CFS Indicator Center planning definitions", status: "Current" }; }

function toHotspotMapMarker(marker: DevelopmentHotspotMapMarker): ManagementMapMarker { return { id: marker.officialParcelId, label: marker.managementLabel || marker.zoningJurisdictionName || "Development hotspot", latitude: marker.centroid.latitude, longitude: marker.centroid.longitude, tone: "hotspot" }; }
function toSignalMapMarker(marker: ModelResearchPreviewMarker): ManagementMapMarker { return { id: marker.officialParcelId, label: marker.approximateAreaLabel || "County parcel area", latitude: marker.centroid.latitude, longitude: marker.centroid.longitude, tone: "signal" }; }
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
function freshness(source: string) { return source === "api" || source === "current" || source === "current_session" || source === "static" || source === "demo" ? "Current" : source === "documented" || source === "fallback_partial" ? "Limited" : "Unavailable"; }
function sourceAvailable(source: string) { return !["fallback", "loading", "none", "unavailable"].includes(source); }
function countValue(source: string, isLoading: boolean, value: number) { return isLoading ? "Loading" : sourceAvailable(source) ? number.format(value) : "Unavailable"; }
function unavailableMessage(source: string, emptyMessage: string) { return sourceAvailable(source) ? emptyMessage : "This information is currently unavailable."; }
function permitTrust(development: any): TrustItem { const available = sourceAvailable(development.source); return { coverage: available ? `${number.format(development.totalPermits)} permit records` : "Unavailable", currentThrough: available && development.activityDateMax ? formatDate(development.activityDateMax) : "Unavailable", label: "Permit activity", source: development.source === "static" ? "Sanitized CFS demo extract" : "Cabarrus County permit records", status: datedStatus(development.source, development.activityDateMax) }; }
function hotspotTrust(hotspots: any): TrustItem { const available = sourceAvailable(hotspots.source); const latest = latestHotspotDate(hotspots); return { coverage: available ? `${number.format(hotspots.totalCount)} ranked areas` : "Unavailable", currentThrough: latest ? formatDate(latest) : available ? "Permit record period" : "Unavailable", label: "Development hotspots", source: hotspots.source === "static" ? "Sanitized CFS demo extract" : "Cabarrus County permit records", status: datedStatus(hotspots.source, latest) }; }
function floodTrust(flood: any): TrustItem { const available = sourceAvailable(flood.source); return { coverage: available ? `${number.format(flood.totalParcels)} parcels` : "Unavailable", currentThrough: available ? "Source date not published" : "Unavailable", label: "Flood review", note: available ? "Mapped flood context supports screening; verify site conditions during review." : undefined, source: flood.source === "demo" ? ["Sanitized FEMA floodplain context", "Sanitized CFS parcel context"] : ["FEMA floodplain context", "Cabarrus County parcel data"], status: available ? "Limited" : "Unavailable" }; }
function schoolTrust(schools: any): TrustItem { const available = sourceAvailable(schools.source); const schoolYear = schools.utilizationSeedRows.map((row: any) => row.schoolYear).filter(Boolean).sort().at(-1); return { coverage: available ? `${number.format(schools.totalParcels)} parcel assignments` : "Unavailable", currentThrough: schoolYear || (available ? "Source date not published" : "Unavailable"), label: "School capacity", note: available ? "Official capacity information is incomplete." : undefined, source: schools.source === "demo" ? ["Sanitized school planning context", "Sanitized CFS parcel assignments"] : ["Cabarrus County Schools planning context", "CFS parcel assignments"], status: available ? "Limited" : "Unavailable" }; }
function economicsTrust(economics: any): TrustItem { const data = economics.data; const limited = data?.context_freshness === "fallback_partial"; return { coverage: data ? `${number.format(data.summary.total_parcels_analyzed)} parcels` : "Unavailable", currentThrough: data?.as_of ? formatDate(data.as_of) : "Unavailable", label: "Economic intelligence", note: limited ? "Some supporting context is incomplete." : undefined, source: data?.mode === "demo" ? ["Sanitized parcel portfolio", "Sanitized assessed-value context"] : ["Cabarrus County parcel data", "Cabarrus County assessed-value context"], status: data ? limited ? "Limited" : "Current" : "Unavailable" }; }
function modelTrust(model: any, preview?: any): TrustItem { const summaryAvailable = sourceAvailable(model.source); const previewAvailable = preview?.status === "ready" && ["api", "demo"].includes(preview.source); const available = summaryAvailable || previewAvailable; const coverage = summaryAvailable ? `${number.format(model.rankingSummary.unique_parcel_count)} parcels` : previewAvailable ? `${number.format(preview.totalCount)} elevated-signal records` : "Unavailable"; return { coverage, currentThrough: available ? "2022" : "Unavailable", label: "Development signals", note: available ? "Decision support only; not an approval forecast or certainty." : undefined, source: model.source === "demo" || preview?.source === "demo" ? ["Sanitized historical permit activity", "Sanitized parcel planning context"] : ["Cabarrus County permit activity", "Cabarrus County parcel planning context"], status: available ? "Limited" : "Unavailable" }; }
function signalLabel(value: string) { return clean(value).replace("Development Signal", "Signal").replace("Research ", ""); }
function areaLabel(value?: string | null) { return !value || /^parcel context\b/i.test(value) ? "Other parcel area" : value; }
function latestHotspotDate(hotspots: any) { return hotspots.hotspots.map((row: any) => row.latest_permit_date).filter(Boolean).sort().at(-1) ?? null; }
function datedStatus(source: string, date?: string | null): TrustStatus { if (!sourceAvailable(source)) return "Unavailable"; if (!date) return "Limited"; const parsed = new Date(date); return Number.isNaN(parsed.getTime()) || Date.now() - parsed.getTime() > 180 * 24 * 60 * 60 * 1000 ? "Stale" : "Current"; }
function formatMoney(value: number | null) { return typeof value === "number" ? money.format(value) : "Unavailable"; }
function formatDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" }); }
function dateRange(start?: string | null, end?: string | null) { return start || end ? `${start ? formatDate(start) : "Earlier"}–${end ? formatDate(end) : "Current"}` : "Current record"; }
function title(section: ManagementSection) { return ({ overview: "Executive Overview", "planning-insights": "Planning Insights", "economic-insights": "Economic Insights", "development-signals": "Development Signals" })[section]; }
function description(section: ManagementSection) { return ({ overview: "What the Planning Director should know now, grounded in current CFS evidence.", "planning-insights": "Observed activity, geographic concentration, and constraints that need attention.", "economic-insights": "Portfolio posture and scenario results without the detailed Builder controls.", "development-signals": "Patterns historically associated with later development activity—not a forecast or approval decision." })[section]; }
