"use client";

import {
  BrainCircuit,
  ChevronDown,
  FileSearch,
  MapPin,
  Monitor,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { DevelopmentActivityPanel } from "@/components/dashboard/DevelopmentActivityPanel";
import { DevelopmentHotspotsPanel } from "@/components/dashboard/DevelopmentHotspotsPanel";
import { DevelopmentTrendPanel } from "@/components/dashboard/DevelopmentTrendPanel";
import { DevelopmentZoningPanel } from "@/components/dashboard/DevelopmentZoningPanel";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { FloodConstraintSummaryPanel } from "@/components/dashboard/FloodConstraintSummaryPanel";
import { GovernanceWarningsPanel } from "@/components/dashboard/GovernanceWarningsPanel";
import { ParcelIntelligencePanel } from "@/components/dashboard/ParcelIntelligencePanel";
import { ParcelQualityPanel } from "@/components/dashboard/ParcelQualityPanel";
import { ParcelSearchPanel } from "@/components/dashboard/ParcelSearchPanel";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PermitIntelligenceSegmentsPanel } from "@/components/dashboard/PermitIntelligenceSegmentsPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { SelectedParcelDevelopmentActivityPanel } from "@/components/dashboard/SelectedParcelDevelopmentActivityPanel";
import { SelectedParcelFloodConstraintPanel } from "@/components/dashboard/SelectedParcelFloodConstraintPanel";
import { SelectedParcelPermitEventsPanel } from "@/components/dashboard/SelectedParcelPermitEventsPanel";
import { TemporalAnalysisPanel } from "@/components/dashboard/TemporalAnalysisPanel";
import { ZoningDistributionPanel } from "@/components/dashboard/ZoningDistributionPanel";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import {
  formatIntelligenceCount,
  formatIntelligencePercentage,
} from "@/data/intelligence/parcelDashboardMetrics";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentStatistics } from "@/hooks/useDevelopmentStatistics";
import { useFloodConstraintSummary } from "@/hooks/useFloodConstraintSummary";
import { useParcelDashboardMetrics } from "@/hooks/useParcelDashboardMetrics";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ProductMode } from "@/types";

const showDeveloperSections =
  process.env.NEXT_PUBLIC_CFS_DEVELOPER_MODE === "true";

const modeMetadata: Record<
  ProductMode,
  {
    description: string;
    icon: LucideIcon;
    label: string;
  }
> = {
  due_diligence: {
    description: "Selected parcel assessment, constraints, permits, and map context.",
    icon: FileSearch,
    label: "Due Diligence",
  },
  executive_print: {
    description: "Report mode is displayed in the main workspace.",
    icon: Monitor,
    label: "Executive Print",
  },
  overview: {
    description: "Map exploration, parcel search, live layers, and headline intelligence.",
    icon: BrainCircuit,
    label: "Overview",
  },
};

export function IntelligencePanel() {
  const {
    developmentHotspotsEnabled,
    floodConstraintsEnabled,
    floodZonesEnabled,
    productMode,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    setProductMode,
    temporalAnalysisState,
  } = useDashboardState();

  if (productMode === "executive_print") {
    return null;
  }

  const metadata = modeMetadata[productMode];
  const ModeIcon = metadata.icon;

  return (
    <aside
      aria-label={`${metadata.label} intelligence panel`}
      className="glass-panel no-scrollbar order-3 min-h-0 overflow-auto rounded-lg p-3 md:max-h-[72vh] lg:order-3 lg:max-h-none"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            {metadata.label}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-6 text-white">
            Intelligence
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {metadata.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IntelligenceModeBadge />
          <div
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/30 bg-[#68d8ff]/10 text-[#8fe7ff]"
          >
            <ModeIcon className="h-4 w-4" />
          </div>
        </div>
      </div>

      {productMode === "overview" ? (
        <OverviewModeContent
          selectedParcelId={selectedParcelId}
          selectedParcelIntelligence={selectedParcelIntelligence}
          selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
          setProductMode={setProductMode}
        />
      ) : (
        <DueDiligenceModeContent
          developmentHotspotsEnabled={developmentHotspotsEnabled}
          floodConstraintsEnabled={floodConstraintsEnabled}
          floodZonesEnabled={floodZonesEnabled}
          selectedParcelId={selectedParcelId}
          selectedParcelIntelligence={selectedParcelIntelligence}
          selectedParcelIntelligenceSource={selectedParcelIntelligenceSource}
        />
      )}

      {showDeveloperSections ? (
        <DeveloperModeDetails temporalAnalysisState={temporalAnalysisState} />
      ) : null}
    </aside>
  );
}

function OverviewModeContent({
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  setProductMode,
}: {
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  setProductMode: (mode: ProductMode) => void;
}) {
  return (
    <div className="space-y-4">
      <CountyPulseInsights />

      <OverviewSelectedParcelCard
        onOpenDueDiligence={() => setProductMode("due_diligence")}
        onOpenExecutivePrint={() => setProductMode("executive_print")}
        parcel={selectedParcelIntelligence}
        source={selectedParcelIntelligenceSource}
      />

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#55d38f]" />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Next Action
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {selectedParcelId
                ? "Switch to Due Diligence for flood constraints, development activity, permit timeline, and map context."
                : "Use the top search bar or click a map marker to begin."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DueDiligenceModeContent({
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
}: {
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
}) {
  if (!selectedParcelIntelligence) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-white/10 bg-black/20 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f0cd79]">
            <FileSearch className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">
            Select a parcel from the map or search results to begin due diligence.
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Due Diligence stays quiet until a real parcel is selected. No
            selected-parcel API calls are shown as loading before selection.
          </p>
        </section>
        <PanelIntro
          description="Use the top search bar, map markers, or the Parcel Intelligence tools below."
          icon={<MapPin className="h-4 w-4" />}
          title="How to start"
        />
        <CollapsedSection
          description="Full parcel search, filtering, zoning, quality, and governance tools."
          title="Parcel Intelligence"
        >
          <ParcelSearchPanel />
          <ParcelIntelligencePanel />
          <ZoningDistributionPanel />
          <ParcelQualityPanel />
          <GovernanceWarningsPanel />
        </CollapsedSection>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PanelIntro
        description="Selected parcel, permits, FEMA constraints, and map context."
        icon={<FileSearch className="h-4 w-4" />}
        title="Selected Parcel Deep Dive"
      />

      <ParcelSummaryPanel
        parcel={selectedParcelIntelligence}
        source={selectedParcelIntelligenceSource}
      />

      <SelectedParcelDevelopmentActivityPanel
        officialParcelId={selectedParcelIntelligence.officialParcelId}
      />

      <SelectedParcelPermitEventsPanel
        officialParcelId={selectedParcelIntelligence.officialParcelId}
      />

      <SelectedParcelFloodConstraintPanel
        officialParcelId={selectedParcelIntelligence.officialParcelId}
      />

      <MapContextCard
        developmentHotspotsEnabled={developmentHotspotsEnabled}
        floodConstraintsEnabled={floodConstraintsEnabled}
        floodZonesEnabled={floodZonesEnabled}
        selectedParcelId={selectedParcelId}
      />

      <CollapsedSection
        description="Search, filters, zoning distribution, parcel quality, and governance warnings."
        title="Parcel Intelligence"
      >
        <ParcelSearchPanel />
        <ParcelIntelligencePanel />
        <ZoningDistributionPanel />
        <GovernanceWarningsPanel />
        <ParcelQualityPanel />
      </CollapsedSection>

      <CollapsedSection
        description="Countywide development, hotspot, zoning, and FEMA constraint context."
        title="Supporting Context"
      >
        <PermitIntelligenceSegmentsPanel />
        <DevelopmentActivityPanel />
        <DevelopmentTrendPanel />
        <DevelopmentHotspotsPanel />
        <DevelopmentZoningPanel />
        <FloodConstraintSummaryPanel />
      </CollapsedSection>
    </div>
  );
}

function CountyPulseInsights() {
  const parcelMetrics = useParcelDashboardMetrics();
  const developmentStatistics = useDevelopmentStatistics();
  const floodSummary = useFloodConstraintSummary();
  const parcelsWithActivity =
    developmentStatistics.coreMetrics.find(
      (metric) => metric.id === "parcels-with-activity",
    )?.value ?? formatDevelopmentCount(0);
  const floodReviewParcels =
    floodSummary.metrics.find(
      (metric) => metric.id === "review-required-parcels",
    )?.value ?? "Unavailable";
  const floodReviewCount = parseFormattedCount(floodReviewParcels);
  const floodReviewShare =
    floodSummary.totalParcels > 0 && floodReviewCount !== null
      ? formatIntelligencePercentage(
          (floodReviewCount / floodSummary.totalParcels) * 100,
        )
      : "Unavailable";
  const zoningAssigned = formatIntelligenceCount(
    parcelMetrics.summary.assignedParcels,
  );
  const zoningCoverage = formatIntelligencePercentage(
    parcelMetrics.summary.zoningCoveragePercentage,
  );

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-medium uppercase text-slate-500">
        County Pulse
      </p>
      <h3 className="mt-1 text-base font-semibold text-white">
        Executive readout
      </h3>

      <div className="mt-3 grid gap-2">
        <ExecutiveInsight>
          {floodReviewParcels === "Unavailable"
            ? "FEMA flood review summary is loading or unavailable."
            : `${floodReviewParcels} parcels are recommended for FEMA flood review.`}
        </ExecutiveInsight>
        <ExecutiveInsight>
          Development activity is concentrated across {parcelsWithActivity} parcels.
        </ExecutiveInsight>
        <ExecutiveInsight>
          {zoningAssigned} parcels have zoning assignment ({zoningCoverage} coverage).
        </ExecutiveInsight>
        {floodReviewParcels !== "Unavailable" ? (
          <ExecutiveInsight>
            Flood review parcels represent {floodReviewShare} of the county parcel inventory.
          </ExecutiveInsight>
        ) : null}
      </div>
    </section>
  );
}

function OverviewSelectedParcelCard({
  onOpenDueDiligence,
  onOpenExecutivePrint,
  parcel,
  source,
}: {
  onOpenDueDiligence: () => void;
  onOpenExecutivePrint: () => void;
  parcel: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
}) {
  if (!parcel) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-medium uppercase text-slate-500">
          Selected Parcel
        </p>
        <h3 className="mt-1 text-lg font-semibold text-white">
          No parcel selected
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Search from the top bar or click a map marker to begin.
        </p>
      </section>
    );
  }

  return (
    <OverviewSelectedParcelSummary
      onOpenDueDiligence={onOpenDueDiligence}
      onOpenExecutivePrint={onOpenExecutivePrint}
      parcel={parcel}
      source={source}
    />
  );
}

function OverviewSelectedParcelSummary({
  onOpenDueDiligence,
  onOpenExecutivePrint,
  parcel,
  source,
}: {
  onOpenDueDiligence: () => void;
  onOpenExecutivePrint: () => void;
  parcel: NonNullable<Parameters<typeof ParcelSummaryPanel>[0]["parcel"]>;
  source: Parameters<typeof ParcelSummaryPanel>[0]["source"];
}) {
  const developmentActivity = useSelectedParcelDevelopmentActivity(
    parcel.officialParcelId,
  );
  const floodConstraint = useSelectedParcelFloodConstraint(
    parcel.officialParcelId,
  );
  const neighborhood = [parcel.neighborhood, parcel.subdivision]
    .filter(Boolean)
    .join(" / ");
  const zoning = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const floodReview =
    floodConstraint.constraint?.flood_review_required === true
      ? "Engineering review recommended"
      : floodConstraint.constraint?.flood_review_required === false
        ? "Not flagged"
        : floodConstraint.source === "loading"
          ? "Checking FEMA overlay"
          : "Flood status unavailable";
  const latestActivity = developmentActivity.activity
    ? `${formatDevelopmentDate(
        developmentActivity.activity.latest_permit_date,
      )} · ${formatDevelopmentLabel(
        developmentActivity.activity.latest_permit_status,
      )}`
    : developmentActivity.source === "loading"
      ? "Checking permit activity"
      : "No matched activity summary";

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h3 className="mt-1 truncate text-lg font-semibold text-white">
            {parcel.officialParcelId}
          </h3>
          <p className="mt-1 text-[11px] uppercase text-slate-500">
            {source === "api"
              ? "Live parcel intelligence"
              : source === "fallback"
                ? "Static fallback"
                : "Parcel intelligence"}
          </p>
        </div>
        <MapPin className="h-4 w-4 shrink-0 text-[#d8b86a]" />
      </div>

      <div className="mt-3 grid gap-2">
        <CompactParcelLine label="Owner / Account" value={parcel.ownerName ?? "Unavailable"} />
        <CompactParcelLine label="Neighborhood" value={neighborhood || "Unavailable"} />
        <CompactParcelLine label="Zoning" value={zoning || formatCompactLabel(parcel.zoningCategory)} />
        <CompactParcelLine label="Flood Review" value={floodReview} />
        <CompactParcelLine label="Latest Activity" value={latestActivity} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f0cd79] transition hover:bg-[#d8b86a]/15"
          onClick={onOpenDueDiligence}
          type="button"
        >
          Open Due Diligence
        </button>
        <button
          className="rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={onOpenExecutivePrint}
          type="button"
        >
          Executive Print
        </button>
      </div>
    </section>
  );
}

function MapContextCard({
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  selectedParcelId,
}: {
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  selectedParcelId: string | null;
}) {
  const activeLayers = [
    developmentHotspotsEnabled ? "Development Hotspots" : null,
    floodConstraintsEnabled ? "Flood Constraints" : null,
    floodZonesEnabled ? "FEMA Flood Zones" : null,
  ].filter(Boolean);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#68d8ff]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase text-slate-500">
            Map Context
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Focus, boundary, and active overlays
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MapContextMetric
              label="Selected Parcel"
              value={selectedParcelId ?? "Unavailable"}
            />
            <MapContextMetric label="Scene Focus" value="Centroid / extent" />
            <MapContextMetric label="Parcel Cage" value="Active on selection" />
            <MapContextMetric
              label="Active Overlays"
              value={activeLayers.length ? activeLayers.join(", ") : "None"}
            />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Parcel focus and boundary cage are controlled by the existing
            SceneView workflow. Layer toggles remain in Overview Map Layers.
          </p>
        </div>
      </div>
    </section>
  );
}

function DeveloperModeDetails({
  temporalAnalysisState,
}: {
  temporalAnalysisState: ReturnType<typeof useDashboardState>["temporalAnalysisState"];
}) {
  return (
    <CollapsedSection
      description="Developer-only temporal, diagnostics, reporting previews, and role/scenario tooling."
      title="Developer surfaces"
    >
      <TemporalAnalysisPanel temporalState={temporalAnalysisState} />
      <SystemStatusCard />
      <ExecutiveBriefingPanel />
      <ScenarioComparisonPanel />
      <ExecutiveReportPanel />
      <PrintLayoutPreview />
      <RoleIntelligencePanel />
      <EventStreamPanel />
    </CollapsedSection>
  );
}

function SystemStatusCard() {
  return (
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
          ? "Migrated parcel, development, flood, and temporal panels call the local FastAPI backend and retain independent static fallback behavior."
          : "The dashboard is using generated static artifacts and mock readiness data until backend API mode is enabled."}
      </p>
    </section>
  );
}

function IntelligenceModeBadge() {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1 text-right",
        USE_BACKEND_API
          ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
          : "border-white/10 bg-white/[0.035] text-slate-300",
      )}
      title={
        USE_BACKEND_API
          ? `FastAPI mode enabled: ${CFS_API_BASE_URL}`
          : "Static/generated-output fallback mode"
      }
    >
      <p className="text-[10px] font-semibold uppercase leading-none">
        {USE_BACKEND_API ? "Live" : "Static"}
      </p>
    </div>
  );
}

function PanelIntro({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}

function CollapsedSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <details className="group rounded-lg border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {description}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
        {children}
      </div>
    </details>
  );
}

function ExecutiveInsight({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-300">
      {children}
    </p>
  );
}

function CompactParcelLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-medium uppercase leading-5 text-slate-500">
        {label}
      </p>
      <p className="truncate text-xs font-semibold leading-5 text-slate-100">
        {value}
      </p>
    </div>
  );
}

function formatCompactLabel(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MapContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function parseFormattedCount(value: string) {
  const normalized = Number(value.replace(/,/g, ""));

  return Number.isFinite(normalized) ? normalized : null;
}
