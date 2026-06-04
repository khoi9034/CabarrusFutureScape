"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  FileSearch,
  Info,
} from "lucide-react";
import { DevelopmentActivityPanel } from "@/components/dashboard/DevelopmentActivityPanel";
import { DevelopmentHotspotsPanel } from "@/components/dashboard/DevelopmentHotspotsPanel";
import { DevelopmentTrendPanel } from "@/components/dashboard/DevelopmentTrendPanel";
import { DevelopmentZoningPanel } from "@/components/dashboard/DevelopmentZoningPanel";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { GovernanceWarningsPanel } from "@/components/dashboard/GovernanceWarningsPanel";
import { ParcelIntelligencePanel } from "@/components/dashboard/ParcelIntelligencePanel";
import { ParcelQualityPanel } from "@/components/dashboard/ParcelQualityPanel";
import { ParcelSearchPanel } from "@/components/dashboard/ParcelSearchPanel";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { SelectedParcelDevelopmentActivityPanel } from "@/components/dashboard/SelectedParcelDevelopmentActivityPanel";
import { SelectedParcelPermitEventsPanel } from "@/components/dashboard/SelectedParcelPermitEventsPanel";
import { TemporalAnalysisPanel } from "@/components/dashboard/TemporalAnalysisPanel";
import { ZoningDistributionPanel } from "@/components/dashboard/ZoningDistributionPanel";
import { mockParcels } from "@/data/mock/parcelMockData";
import { useDashboardState } from "@/hooks/useDashboardState";

export function IntelligencePanel() {
  const {
    selectedParcel,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectParcel,
    scenarioName,
  } = useDashboardState();
  const selectedParcelScore = selectedParcel?.opportunityScore ?? 0;

  const rankedParcels = [...mockParcels].sort(
    (a, b) => b.opportunityScore - a.opportunityScore,
  );

  return (
    <aside
      aria-label="Parcel intelligence and executive briefing panel"
      className="glass-panel no-scrollbar order-3 min-h-0 overflow-auto rounded-lg p-4 md:max-h-[72vh] lg:max-h-none"
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Intelligence Panel
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Parcel Command
          </h2>
        </div>
        <div
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]"
        >
          <BrainCircuit className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-4">
        <ParcelSummaryPanel
          parcel={selectedParcelIntelligence}
          source={selectedParcelIntelligenceSource}
        />

        <SelectedParcelDevelopmentActivityPanel
          officialParcelId={selectedParcelIntelligence?.officialParcelId}
        />

        <SelectedParcelPermitEventsPanel
          officialParcelId={selectedParcelIntelligence?.officialParcelId}
        />

        <ParcelIntelligencePanel />

        <DevelopmentActivityPanel />

        <DevelopmentTrendPanel />

        <DevelopmentHotspotsPanel />

        <DevelopmentZoningPanel />

        <TemporalAnalysisPanel />

        <ParcelSearchPanel />

        <ZoningDistributionPanel />

        <GovernanceWarningsPanel />

        <ParcelQualityPanel />

        <section className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Scenario Snapshot
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {scenarioName}
              </h3>
            </div>
            <Info className="h-4 w-4 text-[#d8b86a]" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[11px] uppercase text-slate-500">
                Permit Activity
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                Development panel
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[11px] uppercase text-slate-500">
                Fiscal Detail
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                Not connected
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Parcel-level development pressure, infrastructure readiness,
            redevelopment potential, and tax opportunity are not shown here
            until real backend fields are connected.
          </p>
        </section>

        <ExecutiveBriefingPanel />

        <ScenarioComparisonPanel />

        <ExecutiveReportPanel />

        <PrintLayoutPreview />

        <RoleIntelligencePanel />

        <EventStreamPanel />

        <section className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-[#68d8ff]" />
            <h3 className="text-sm font-semibold text-white">
              Parcel Watchlist
            </h3>
          </div>

          <div className="mt-3 space-y-2">
            {rankedParcels.map((parcel) => {
              const active = parcel.parcelId === selectedParcel?.parcelId;

              return (
                <button
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-[#d8b86a]/40 bg-[#d8b86a]/10"
                      : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"
                  }`}
                  key={parcel.parcelId}
                  onClick={() =>
                    selectParcel(parcel.parcelId, { source: "dashboard" })
                  }
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {parcel.address}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {parcel.parcelId} / {parcel.zoning}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#f0cd79]">
                    {active ? selectedParcelScore : parcel.opportunityScore}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.055] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div>
              <h3 className="text-sm font-semibold text-amber-100">
                Constraint Monitor
              </h3>
              <p className="mt-1 text-xs leading-5 text-amber-100/70">
                Flood risk, utility constraints, and policy conflicts are
                elevated near the selected growth corridor.
              </p>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
