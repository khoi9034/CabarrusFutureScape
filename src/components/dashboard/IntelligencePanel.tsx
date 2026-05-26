"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  DatabaseZap,
  FileSearch,
} from "lucide-react";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { mockParcels } from "@/data/mock/parcelMockData";
import { formatCurrency } from "@/lib/utils";
import { useDashboardState } from "@/hooks/useDashboardState";

export function IntelligencePanel() {
  const { selectedParcel, selectParcel, scenarioName } = useDashboardState();
  const selectedParcelScore = selectedParcel?.opportunityScore ?? 0;
  const readinessScore = selectedParcel?.infrastructureReadiness ?? 0;
  const pressureScore = selectedParcel?.developmentPressure ?? 0;
  const taxOpportunity = selectedParcel?.taxOpportunity ?? 0;
  const nearbyPermits = selectedParcel?.nearbyPermits ?? 0;

  const rankedParcels = [...mockParcels].sort(
    (a, b) => b.opportunityScore - a.opportunityScore,
  );

  return (
    <aside className="glass-panel no-scrollbar order-3 min-h-0 overflow-auto rounded-lg p-4">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Intelligence Panel
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Parcel Command
          </h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <BrainCircuit className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-4">
        <ParcelSummaryPanel parcel={selectedParcel} />

        <div className="grid grid-cols-2 gap-3">
          <ScoreCard
            accent="#55d38f"
            caption="Service capacity and corridor proximity placeholder."
            label="Readiness"
            score={readinessScore}
          />
          <ScoreCard
            accent="#ffb454"
            caption="Growth pressure from nearby permits and demand."
            label="Pressure"
            score={pressureScore}
          />
        </div>

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
            <DatabaseZap className="h-4 w-4 text-[#d8b86a]" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[11px] uppercase text-slate-500">
                Tax Opportunity
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {formatCurrency(taxOpportunity * 125000)}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[11px] uppercase text-slate-500">
                Nearby Permits
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {nearbyPermits}
              </p>
            </div>
          </div>
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
