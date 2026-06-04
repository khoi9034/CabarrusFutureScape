"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  Clock3,
  FileSearch,
  Info,
  MapPin,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
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
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";

type IntelligenceSectionId =
  | "overview"
  | "parcel"
  | "development"
  | "temporal"
  | "system";

const intelligenceSections: Array<{
  description: string;
  icon: LucideIcon;
  id: IntelligenceSectionId;
  label: string;
}> = [
  {
    description: "Selected parcel, permit timeline, and headline metrics.",
    icon: BrainCircuit,
    id: "overview",
    label: "Overview",
  },
  {
    description: "Search, filters, zoning, quality, and governance warnings.",
    icon: MapPin,
    id: "parcel",
    label: "Parcel Intelligence",
  },
  {
    description: "Permit activity, trends, hotspots, and zoning rollups.",
    icon: Activity,
    id: "development",
    label: "Development Activity",
  },
  {
    description: "Time windows, trend context, and query preview.",
    icon: Clock3,
    id: "temporal",
    label: "Temporal Analysis",
  },
  {
    description: "API mode, events, reports, briefing, and diagnostics.",
    icon: Monitor,
    id: "system",
    label: "System Status",
  },
];

function IntelligenceModeBadge() {
  return (
    <div
      className={`rounded-md border px-2 py-1 text-right ${
        USE_BACKEND_API
          ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
          : "border-white/10 bg-white/[0.035] text-slate-300"
      }`}
      title={
        USE_BACKEND_API
          ? `FastAPI mode enabled: ${CFS_API_BASE_URL}`
          : "Static/generated-output fallback mode"
      }
    >
      <p className="text-[10px] font-semibold uppercase leading-none">
        {USE_BACKEND_API ? "API Live" : "Static Mode"}
      </p>
      <p className="mt-1 max-w-28 truncate text-[10px] leading-none opacity-75">
        {USE_BACKEND_API ? CFS_API_BASE_URL : "Generated fallback"}
      </p>
    </div>
  );
}

function TabSectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="pb-1">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

export function IntelligencePanel() {
  const [activeSection, setActiveSection] =
    useState<IntelligenceSectionId>("overview");
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
  const activeSectionMetadata =
    intelligenceSections.find((section) => section.id === activeSection) ??
    intelligenceSections[0]!;
  const ActiveSectionIcon = activeSectionMetadata.icon;

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
        <div className="flex items-center gap-2">
          <IntelligenceModeBadge />
          <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]"
          >
            <BrainCircuit className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3">
        <label
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
          htmlFor="intelligence-section-selector"
        >
          Section
        </label>
        <div className="relative mt-2 rounded-lg border border-[#68d8ff]/20 bg-[#06101a]/80 shadow-[0_0_24px_rgba(104,216,255,0.08)] transition focus-within:border-[#68d8ff]/55 focus-within:ring-2 focus-within:ring-[#68d8ff]/35">
          <div className="pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#8fe7ff]">
            <ActiveSectionIcon className="h-4 w-4" />
          </div>
          <select
            aria-describedby="intelligence-section-description"
            className="h-12 w-full appearance-none rounded-lg bg-transparent py-2 pl-14 pr-10 text-sm font-semibold text-white outline-none"
            id="intelligence-section-selector"
            onChange={(event) =>
              setActiveSection(event.target.value as IntelligenceSectionId)
            }
            value={activeSection}
          >
            {intelligenceSections.map((section) => (
              <option
                className="bg-[#06101a] text-white"
                key={section.id}
                value={section.id}
              >
                {section.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        </div>
        <p
          className="mt-2 text-xs leading-5 text-slate-400"
          id="intelligence-section-description"
        >
          {activeSectionMetadata.description}
        </p>
      </div>

      <div
        aria-label="Overview intelligence section"
        className="space-y-4"
        hidden={activeSection !== "overview"}
      >
        <TabSectionHeading
          description="Selected parcel intelligence, development activity, permit events, and countywide headline metrics."
          title="Overview"
        />
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
      </div>

      <div
        aria-label="Parcel intelligence section"
        className="space-y-4"
        hidden={activeSection !== "parcel"}
      >
        <TabSectionHeading
          description="Parcel discovery, structured filters, zoning distribution, governance warnings, and quality posture."
          title="Parcel"
        />
        <ParcelSearchPanel />

        <ZoningDistributionPanel />

        <GovernanceWarningsPanel />

        <ParcelQualityPanel />
      </div>

      <div
        aria-label="Development activity section"
        className="space-y-4"
        hidden={activeSection !== "development"}
      >
        <TabSectionHeading
          description="Development activity trends, hotspot summaries, and zoning-related permit rollups."
          title="Development"
        />

        <DevelopmentTrendPanel />

        <DevelopmentHotspotsPanel />

        <DevelopmentZoningPanel />
      </div>

      <div
        aria-label="Temporal analysis section"
        className="space-y-4"
        hidden={activeSection !== "temporal"}
      >
        <TabSectionHeading
          description="Time-window controls, temporal query preview, trend context, and future map playback readiness."
          title="Temporal"
        />
        <TemporalAnalysisPanel />
      </div>

      <div
        aria-label="System status section"
        className="space-y-4"
        hidden={activeSection !== "system"}
      >
        <TabSectionHeading
          description="API mode, executive briefing/report surfaces, operational events, mock watchlists, and system caveats."
          title="System"
        />

        <section className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Data Source Mode
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">
                {USE_BACKEND_API ? "FastAPI enabled" : "Static fallback mode"}
              </h3>
            </div>
            <IntelligenceModeBadge />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            {USE_BACKEND_API
              ? "Migrated parcel, development, and temporal panels can call the local FastAPI backend. Each panel still falls back independently to generated static artifacts if a request fails."
              : "The dashboard is using generated static artifacts and mock readiness data. API-backed panels stay fallback-safe until NEXT_PUBLIC_USE_BACKEND_API is enabled."}
          </p>
        </section>

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
