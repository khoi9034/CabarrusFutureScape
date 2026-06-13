"use client";

import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Database,
  FileSearch,
  MapPin,
  Monitor,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { DataRegistryPanel } from "@/components/dashboard/DataRegistryPanel";
import { DevelopmentActivityPanel } from "@/components/dashboard/DevelopmentActivityPanel";
import { DevelopmentHotspotsPanel } from "@/components/dashboard/DevelopmentHotspotsPanel";
import { DevelopmentTrendPanel } from "@/components/dashboard/DevelopmentTrendPanel";
import { DevelopmentZoningPanel } from "@/components/dashboard/DevelopmentZoningPanel";
import { EventStreamPanel } from "@/components/dashboard/EventStreamPanel";
import { ExecutiveBriefingPanel } from "@/components/dashboard/ExecutiveBriefingPanel";
import { ExecutiveReportPanel } from "@/components/dashboard/ExecutiveReportPanel";
import { FloodConstraintSummaryPanel } from "@/components/dashboard/FloodConstraintSummaryPanel";
import { GISIntegrationReadinessPanel } from "@/components/dashboard/GISIntegrationReadinessPanel";
import { GovernanceWarningsPanel } from "@/components/dashboard/GovernanceWarningsPanel";
import { ParcelIntelligencePanel } from "@/components/dashboard/ParcelIntelligencePanel";
import { ParcelQualityPanel } from "@/components/dashboard/ParcelQualityPanel";
import { ParcelSearchPanel } from "@/components/dashboard/ParcelSearchPanel";
import { ParcelSummaryPanel } from "@/components/dashboard/ParcelSummaryPanel";
import { PermitIntelligenceSegmentsPanel } from "@/components/dashboard/PermitIntelligenceSegmentsPanel";
import { PrintLayoutPreview } from "@/components/dashboard/PrintLayoutPreview";
import { RoleIntelligencePanel } from "@/components/dashboard/RoleIntelligencePanel";
import { ScenarioControls } from "@/components/dashboard/ScenarioControls";
import { ScenarioComparisonPanel } from "@/components/dashboard/ScenarioComparisonPanel";
import { SelectedParcelDevelopmentActivityPanel } from "@/components/dashboard/SelectedParcelDevelopmentActivityPanel";
import { SelectedParcelFloodConstraintPanel } from "@/components/dashboard/SelectedParcelFloodConstraintPanel";
import { SelectedParcelPermitEventsPanel } from "@/components/dashboard/SelectedParcelPermitEventsPanel";
import { SelectedParcelSchoolAssignmentPanel } from "@/components/dashboard/SelectedParcelSchoolAssignmentPanel";
import { SchoolConstraintSummaryPanel } from "@/components/dashboard/SchoolConstraintSummaryPanel";
import { TemporalAnalysisPanel } from "@/components/dashboard/TemporalAnalysisPanel";
import { ZoningDistributionPanel } from "@/components/dashboard/ZoningDistributionPanel";
import {
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { scoreSignals } from "@/data/mock/dashboardMockData";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { useSelectedParcelSchoolConstraint } from "@/hooks/useSelectedParcelSchoolConstraint";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ScoreCard } from "@/components/ui/ScoreCard";
import type { ProductMode } from "@/types";
import type { SelectedSchoolUtilizationZone } from "@/types/map/schoolUtilizationZones";

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
  methodology: {
    description: "Data sources, assumptions, limitations, and model foundation.",
    icon: BookOpen,
    label: "Methodology",
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
    selectedSchoolUtilizationZone,
    clearSelectedSchoolUtilizationZone,
    schoolUtilizationZonesEnabled,
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
          selectedSchoolUtilizationZone={selectedSchoolUtilizationZone}
          clearSelectedSchoolUtilizationZone={clearSelectedSchoolUtilizationZone}
          schoolUtilizationZonesEnabled={schoolUtilizationZonesEnabled}
          setProductMode={setProductMode}
        />
      ) : productMode === "methodology" ? (
        <MethodologyModeContent />
      ) : (
        <DueDiligenceModeContent
          developmentHotspotsEnabled={developmentHotspotsEnabled}
          floodConstraintsEnabled={floodConstraintsEnabled}
          floodZonesEnabled={floodZonesEnabled}
          selectedSchoolUtilizationZone={selectedSchoolUtilizationZone}
          clearSelectedSchoolUtilizationZone={clearSelectedSchoolUtilizationZone}
          schoolUtilizationZonesEnabled={schoolUtilizationZonesEnabled}
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
  clearSelectedSchoolUtilizationZone,
  schoolUtilizationZonesEnabled,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  selectedSchoolUtilizationZone,
  setProductMode,
}: {
  clearSelectedSchoolUtilizationZone: () => void;
  schoolUtilizationZonesEnabled: boolean;
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  selectedSchoolUtilizationZone: SelectedSchoolUtilizationZone | null;
  setProductMode: (mode: ProductMode) => void;
}) {
  return (
    <div className="space-y-4">
      <OverviewSelectedParcelCard
        onOpenDueDiligence={() => setProductMode("due_diligence")}
        onOpenExecutivePrint={() => setProductMode("executive_print")}
        parcel={selectedParcelIntelligence}
        source={selectedParcelIntelligenceSource}
      />

      <SelectedSchoolUtilizationZoneCard
        enabled={schoolUtilizationZonesEnabled}
        onClear={clearSelectedSchoolUtilizationZone}
        zone={selectedSchoolUtilizationZone}
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
                : "Use the top parcel search or turn on a live map layer to begin."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const dataMethodologyGroups = [
  {
    accent: "#68d8ff",
    items: [
      "Parcels and enriched parcel attributes from PostGIS.",
      "Zoning overlay and zoning QA/intelligence tables.",
      "Permit and development activity summaries.",
      "FEMA NFHL Layer 28 flood zones and parcel flood overlay.",
      "CCS attendance-zone school assignment overlay.",
      "Presentation-derived SY 2024-2025 school utilization seed.",
    ],
    title: "Data Used",
  },
  {
    accent: "#55d38f",
    items: [
      "Parcel detail is descriptive and tied to selected parcel IDs.",
      "Flood constraints are regulatory FEMA polygon-to-parcel overlays.",
      "Permit hotspots summarize observed permit concentration and segmentation.",
      "School assignment uses attendance-zone polygon overlap, not school point distance.",
      "Current intelligence is descriptive; prediction is not active yet.",
    ],
    title: "Methodology",
  },
  {
    accent: "#d8b86a",
    items: [
      "FEMA NFHL is the primary regulatory flood source; older TIFF flood data is reference/future-model context.",
      "School utilization seed is presentation-derived and needs official verification.",
      "public.school_capacity is not populated, so school capacity scoring is disabled.",
      "Permit segmentation is a descriptive signal, not a causal model.",
      "Mock infrastructure/readiness signals remain placeholders until authoritative layers arrive.",
    ],
    title: "Assumptions",
  },
  {
    accent: "#ff8d7a",
    items: [
      "Not all constraint domains are implemented.",
      "Some layer controls are live API layers while others remain mock/readiness placeholders.",
      "No official school capacity, enrollment, or forecast scoring is active.",
      "Local runtime performance depends on browser GPU, ArcGIS assets, and FastAPI/PostGIS availability.",
      "Large polygon layers are capped or extent-filtered for prototype safety.",
    ],
    title: "Limitations",
  },
];

function MethodologyModeContent() {
  return (
    <div className="space-y-4">
      <PanelIntro
        description="What the prototype uses, how signals are derived, and where the current limits are."
        icon={<BookOpen className="h-4 w-4" />}
        title="Model Data & Assumptions"
      />

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-[#68d8ff]" />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Foundation
            </p>
            <h3 className="mt-1 text-base font-semibold text-white">
              Parcel-based planning intelligence
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              CFS treats each parcel as the common planning unit. Zoning,
              permits, FEMA constraints, and attendance-zone assignments are
              joined or overlaid to the parcel so planners can compare growth
              activity and constraint exposure without jumping across separate
              source systems.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {dataMethodologyGroups.map((group) => (
          <MethodologyCard
            accent={group.accent}
            items={group.items}
            key={group.title}
            title={group.title}
          />
        ))}
      </div>

      <CollapsedSection
        defaultOpen
        description="Read-only attendance-zone coverage, QA caveats, and preliminary utilization seed status."
        title="School Constraint Summary"
      >
        <SchoolConstraintSummaryPanel />
      </CollapsedSection>

      <CollapsedSection
        description="Dataset inventory, GIS service onboarding, scenario controls, and mock readiness notes moved out of the map layer rail."
        title="Model Data Registry"
      >
        <GISIntegrationReadinessPanel />
        <DataRegistryPanel />
        <ScenarioControls />
        <MethodologyCompositeSignals />
      </CollapsedSection>

      <section className="rounded-lg border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
          <div>
            <p className="text-xs font-medium uppercase text-[#f0cd79]">
              Current Decision Boundary
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              This prototype supports descriptive due diligence and map
              exploration. It should not be read as a final capacity forecast,
              fiscal impact model, or buildability determination until the
              remaining authoritative constraint and capacity datasets are
              loaded, reviewed, and scored.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DueDiligenceModeContent({
  clearSelectedSchoolUtilizationZone,
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  schoolUtilizationZonesEnabled,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  selectedSchoolUtilizationZone,
}: {
  clearSelectedSchoolUtilizationZone: () => void;
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  schoolUtilizationZonesEnabled: boolean;
  selectedParcelId: string | null;
  selectedParcelIntelligence: Parameters<typeof ParcelSummaryPanel>[0]["parcel"];
  selectedParcelIntelligenceSource: Parameters<typeof ParcelSummaryPanel>[0]["source"];
  selectedSchoolUtilizationZone: SelectedSchoolUtilizationZone | null;
}) {
  if (!selectedParcelIntelligence) {
    return (
      <div className="space-y-4">
        <SelectedSchoolUtilizationZoneCard
          enabled={schoolUtilizationZonesEnabled}
          onClear={clearSelectedSchoolUtilizationZone}
          zone={selectedSchoolUtilizationZone}
        />
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

      <SelectedSchoolUtilizationZoneCard
        enabled={schoolUtilizationZonesEnabled}
        onClear={clearSelectedSchoolUtilizationZone}
        zone={selectedSchoolUtilizationZone}
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

      <SelectedParcelSchoolAssignmentPanel
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
        <SchoolConstraintSummaryPanel />
      </CollapsedSection>
    </div>
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
  const schoolConstraint = useSelectedParcelSchoolConstraint(
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
  const elementaryAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "Elementary",
    )?.schoolName ?? "Checking assignment";
  const middleAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "Middle",
    )?.schoolName ?? "Checking assignment";
  const highAssignment =
    schoolConstraint.assignments.find(
      (assignment) => assignment.levelLabel === "High",
    )?.schoolName ?? "Checking assignment";

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

      <OverviewSchoolSnapshot
        elementaryAssignment={elementaryAssignment}
        highAssignment={highAssignment}
        middleAssignment={middleAssignment}
        scoreLabel={schoolConstraint.scoreLabel}
        source={schoolConstraint.source}
      />

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

function SelectedSchoolUtilizationZoneCard({
  enabled,
  onClear,
  zone,
}: {
  enabled: boolean;
  onClear: () => void;
  zone: SelectedSchoolUtilizationZone | null;
}) {
  if (!zone) {
    if (!enabled) {
      return null;
    }

    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#8fe7ff]" />
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Selected School Zone
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Hover school utilization zones for utilization. Click a zone for
              details without changing the selected parcel.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#8fe7ff]/20 bg-[#8fe7ff]/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-[#bfefff]">
            Selected School Zone
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-white">
            {zone.schoolName ?? "School utilization zone"}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Presentation-derived utilization
          </p>
        </div>
        <button
          aria-label="Clear selected school zone"
          className="rounded border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          onClick={onClear}
          title="Clear selected school zone"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <CompactParcelLine
          label="School Level"
          value={formatSchoolZonePanelLabel(zone.schoolLevel)}
        />
        <CompactParcelLine
          label="School Year"
          value={zone.schoolYear ? `SY ${zone.schoolYear}` : "Unavailable"}
        />
        <CompactParcelLine
          label="Utilization"
          value={formatSchoolZoneUtilization(zone.utilizationPct)}
        />
        <CompactParcelLine
          label="Class"
          value={formatSchoolZoneClassLabel(zone.utilizationClass)}
        />
        <CompactParcelLine
          label="Source"
          value={formatSchoolZoneSourceLabel(zone.sourceConfidence)}
        />
        <CompactParcelLine
          label="Verification"
          value={zone.needsVerification ? "Needs verification" : "Verified"}
        />
        <CompactParcelLine
          label="Reference Match"
          value={zone.matchedSchoolReferenceId ? "Matched" : "QA review"}
        />
        <CompactParcelLine
          label="Zone Match"
          value={formatSchoolZonePanelLabel(zone.zoneMatchConfidence)}
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        This is separate from Selected Parcel. Values are read from SY
        2024-2025 planning maps and require verification against official
        enrollment/capacity data. Official school capacity scoring remains
        disabled.
      </p>
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

function OverviewSchoolSnapshot({
  elementaryAssignment,
  highAssignment,
  middleAssignment,
  scoreLabel,
  source,
}: {
  elementaryAssignment: string;
  highAssignment: string;
  middleAssignment: string;
  scoreLabel: string;
  source: ReturnType<typeof useSelectedParcelSchoolConstraint>["source"];
}) {
  const sourceLabel =
    source === "api"
      ? "Live assignment"
      : source === "loading"
        ? "Loading assignment"
        : source === "waiting"
          ? "Waiting for parcel"
          : "Assignment unavailable";

  return (
    <div className="mt-3 rounded-md border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.045] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase text-slate-500">
            School Assignment
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Attendance-zone polygon overlap. Capacity Data Needed /{" "}
            {scoreLabel || "Not scored"}.
          </p>
        </div>
        <span className="shrink-0 rounded border border-[#8fe7ff]/20 bg-[#8fe7ff]/10 px-2 py-1 text-[10px] font-semibold text-[#bfefff]">
          {sourceLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-1.5">
        <CompactParcelLine label="Elementary" value={elementaryAssignment} />
        <CompactParcelLine label="Middle" value={middleAssignment} />
        <CompactParcelLine label="High" value={highAssignment} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        Utilization values are presentation-derived from SY 2024-2025 planning
        maps and require verification.
      </p>
    </div>
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
  defaultOpen = false,
  description,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-lg border border-white/10 bg-black/20 p-3"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
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
      {isOpen ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {children}
        </div>
      ) : null}
    </details>
  );
}

function MethodologyCard({
  accent,
  items,
  title,
}: {
  accent: string;
  items: string[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]"
          style={{ background: accent, color: accent }}
        />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <p
            className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-300"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function MethodologyCompositeSignals() {
  const { selectedParcel } = useDashboardState();

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Placeholder Readiness Signals
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Legacy mock scoring context
          </h3>
        </div>
        <BrainCircuit className="h-4 w-4 text-[#68d8ff]" />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        These signals remain documentation-only until authoritative
        infrastructure and readiness layers are connected. They were moved out
        of the map layer rail to keep map controls operational and compact.
      </p>
      <div className="mt-4">
        <ScoreCard
          accent="#d8b86a"
          caption="Weighted mock score across parcel potential, development pressure, and infrastructure fit."
          label="Opportunity Score"
          score={selectedParcel?.opportunityScore ?? 0}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {scoreSignals.map((signal) => (
          <div
            className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
            key={signal.label}
          >
            <p className="text-[11px] leading-4 text-slate-500">
              {signal.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-lg font-semibold text-white">
                {signal.value}
              </span>
              <span
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${signal.accent} ${signal.value}%, rgba(255,255,255,0.1) 0)`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactParcelLine({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-[10px] font-medium uppercase leading-5 text-slate-500">
        {label}
      </p>
      <p className="truncate text-xs font-semibold leading-5 text-slate-100">
        {value ?? "Unavailable"}
      </p>
    </div>
  );
}

function formatSchoolZoneUtilization(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not available";
  }

  return `${value.toFixed(1)}%`;
}

function formatSchoolZoneClassLabel(value: string | null | undefined) {
  switch (value) {
    case "under_capacity":
      return "Under capacity";
    case "approaching_capacity":
    case "near_capacity":
      return "Approaching capacity";
    case "over_capacity":
      return "Over capacity";
    case "severely_over_capacity":
      return "Severely over capacity";
    default:
      return "Review needed";
  }
}

function formatSchoolZoneSourceLabel(value: string | null | undefined) {
  return value === "presentation_derived"
    ? "Presentation-derived"
    : formatSchoolZonePanelLabel(value);
}

function formatSchoolZonePanelLabel(value: string | null | undefined) {
  return formatCompactLabel(value ?? null);
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
