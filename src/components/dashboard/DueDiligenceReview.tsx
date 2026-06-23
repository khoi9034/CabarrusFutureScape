"use client";

import Image from "next/image";
import {
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  FileText,
  History,
  MapPinned,
  Printer,
  Route,
  Save,
  School,
  TrafficCone,
  Trash2,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import {
  developmentModelLabSummary,
  formatModelResearchDriverLabel,
  formatRelativeDevelopmentSignalBand,
  getModelResearchBandMeaning,
  getModelResearchDriverExplanation,
  modelResearchDriverSources,
} from "@/data/intelligence/developmentModelLab";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { getIndicatorCenterDisplayModeLabel } from "@/data/intelligence/indicatorCenter";
import { useDevelopmentPredictionResearchStatus } from "@/hooks/useDevelopmentPredictionResearchStatus";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { useSelectedParcelNewConstruction } from "@/hooks/useSelectedParcelNewConstruction";
import { useSelectedParcelPermitEvents } from "@/hooks/useSelectedParcelPermitEvents";
import { useSelectedParcelSchoolConstraint } from "@/hooks/useSelectedParcelSchoolConstraint";
import { useTransportationContextSummary } from "@/hooks/useTransportationContextSummary";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  ParcelReviewView,
  PlanningSnapshot,
  PlanningSnapshotSectionKey,
  ProductMode,
} from "@/types";

interface DueDiligenceReviewProps {
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  parcelReviewView: ParcelReviewView;
  selectedParcelId: string | null;
  selectedParcelIntelligence: ParcelSearchRecord | null;
  selectedParcelIntelligenceSource: SelectedParcelIntelligenceSource | null;
  setMapFocusMode: (enabled: boolean) => void;
  setParcelReviewView: (view: ParcelReviewView) => void;
  setProductMode: (mode: ProductMode) => void;
}

type BadgeTone = "caution" | "info" | "neutral" | "positive" | "review";

interface ReviewBadge {
  label: string;
  tone: BadgeTone;
}

interface ReviewFact {
  label: string;
  value: string;
}

interface PriorityFlag extends ReviewBadge {
  description: string;
  title: string;
}

export function DueDiligenceReview({
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  setProductMode,
}: DueDiligenceReviewProps) {
  const {
    activePlanningSnapshotId,
    clearPlanningSnapshot,
    deletePlanningSnapshot,
    planningSnapshot,
    renamePlanningSnapshot,
    savedPlanningSnapshots,
    setActivePlanningSnapshot,
    setPlanningSnapshotSectionIncluded,
    setPlanningSnapshotView,
  } = useDashboardState();

  const snapshotLibraryProps: PlanningSnapshotLibraryProps = {
    activeSnapshotId: activePlanningSnapshotId,
    onDelete: deletePlanningSnapshot,
    onRename: renamePlanningSnapshot,
    onUse: (snapshotId) => {
      setActivePlanningSnapshot(snapshotId);
      setPlanningSnapshotView("overview");
    },
    snapshots: savedPlanningSnapshots,
  };

  if (!planningSnapshot) {
    return (
      <EmptyPlanningSnapshotState
        hasSelectedParcel={Boolean(selectedParcelIntelligence)}
        snapshotLibrary={snapshotLibraryProps}
        onGoOverview={() => setProductMode("workspace")}
        onOpenMethodology={() => setProductMode("methodology")}
      />
    );
  }

  if (!selectedParcelIntelligence) {
    return (
      <SnapshotOnlyWorkspace
        clearPlanningSnapshot={clearPlanningSnapshot}
        onGoOverview={() => setProductMode("workspace")}
        onOpenMethodology={() => setProductMode("methodology")}
        onPrint={() => window.print()}
        planningSnapshot={planningSnapshot}
        snapshotLibrary={snapshotLibraryProps}
        setPlanningSnapshotSectionIncluded={setPlanningSnapshotSectionIncluded}
      />
    );
  }

  return (
    <SelectedParcelDueDiligence
      developmentHotspotsEnabled={developmentHotspotsEnabled}
      floodConstraintsEnabled={floodConstraintsEnabled}
      floodZonesEnabled={floodZonesEnabled}
      parcel={selectedParcelIntelligence}
      planningSnapshot={planningSnapshot}
      selectedParcelId={selectedParcelId}
      source={selectedParcelIntelligenceSource}
      clearPlanningSnapshot={clearPlanningSnapshot}
      snapshotLibrary={snapshotLibraryProps}
      setPlanningSnapshotSectionIncluded={setPlanningSnapshotSectionIncluded}
      setProductMode={setProductMode}
    />
  );
}

function SelectedParcelDueDiligence({
  clearPlanningSnapshot,
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  parcel,
  planningSnapshot,
  selectedParcelId,
  snapshotLibrary,
  source,
  setPlanningSnapshotSectionIncluded,
  setProductMode,
}: {
  clearPlanningSnapshot: () => void;
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  parcel: ParcelSearchRecord;
  planningSnapshot: PlanningSnapshot;
  selectedParcelId: string | null;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  source: SelectedParcelIntelligenceSource | null;
  setPlanningSnapshotSectionIncluded: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
  setProductMode: (mode: ProductMode) => void;
}) {
  const [showExplanationCards, setShowExplanationCards] = useState(false);
  const developmentActivity = useSelectedParcelDevelopmentActivity(
    parcel.officialParcelId,
  );
  const floodConstraint = useSelectedParcelFloodConstraint(
    parcel.officialParcelId,
  );
  const newConstruction = useSelectedParcelNewConstruction(
    parcel.officialParcelId,
  );
  const permitEvents = useSelectedParcelPermitEvents(parcel.officialParcelId);
  const schoolConstraint = useSelectedParcelSchoolConstraint(
    parcel.officialParcelId,
  );
  const transportationContext = useTransportationContextSummary();
  const modelResearch = useDevelopmentPredictionResearchStatus();

  const activity = developmentActivity.activity;
  const flood = floodConstraint.constraint;
  const newConstructionSummary = newConstruction.summary;
  const latestPermit = permitEvents.permits[0] ?? null;
  const addressSummary = [parcel.mailingAddress, parcel.mailingCity, parcel.mailingState]
    .filter(Boolean)
    .join(", ");
  const badges = buildHeaderBadges({
    activity,
    flood,
    parcel,
    schoolConstraint,
  });
  const reviewActions = buildReviewActions({
    activity,
    flood,
    schoolConstraint,
  });
  const priorityFlags = buildPriorityFlags({
    activity,
    flood,
    modelResearch,
    parcel,
    schoolConstraint,
  });
  const activeLayers = [
    developmentHotspotsEnabled ? "Development Hotspots" : null,
    floodConstraintsEnabled ? "Flood Constraints" : null,
    floodZonesEnabled ? "FEMA Flood Zones" : null,
  ].filter(Boolean);

  const sourceLabel =
    source === "api"
      ? "Live API"
      : source === "fallback"
        ? "Static fallback"
        : source === "static"
          ? "Static index"
          : "Parcel intelligence";

  function printReport() {
    window.setTimeout(() => window.print(), 120);
  }

  return (
    <PlanningSnapshotReportBuilder
      activeContextLabel={`${sourceLabel} / Selected ID ${
        selectedParcelId ?? parcel.officialParcelId
      }`}
      contextBadges={badges}
      onClearSnapshot={clearPlanningSnapshot}
      onGoOverview={() => setProductMode("workspace")}
      onOpenMethodology={() => setProductMode("methodology")}
      onPrint={printReport}
      onToggleSection={setPlanningSnapshotSectionIncluded}
      planningSnapshot={planningSnapshot}
      showExplanationCards={showExplanationCards}
      snapshotLibrary={snapshotLibrary}
      toggleExplanationCards={setShowExplanationCards}
      advancedDetails={
        <>
      <SnapshotOverviewPanel planningSnapshot={planningSnapshot} />

      <ReviewSection
        caveat="Parcel identity and valuation are descriptive source attributes; planning conclusions still require source document review."
        facts={[
          { label: "Official parcel ID", value: parcel.officialParcelId },
          { label: "Owner / account", value: parcel.ownerName ?? "Not Available" },
          { label: "PIN", value: parcel.pin14 ?? "Not Available" },
          { label: "Address", value: addressSummary || "Not Available" },
          { label: "Assessed value", value: formatOptionalCurrency(parcel.assessedValue) },
          { label: "Market value", value: formatOptionalCurrency(parcel.marketValue) },
          { label: "Quality status", value: formatLabel(parcel.parcelQualityStatus) },
        ]}
        icon={Building2}
        status={{ label: "Parcel Selected", tone: "positive" }}
        summary="Core parcel identifiers, ownership/account context, valuation, and quality flags."
        title="1. Parcel Snapshot"
      />

      <PriorityFlagsPanel flags={priorityFlags} />

      <ReviewSection
        caveat="Historical zoning changes are map-change detections, not official rezoning approval records."
        facts={[
          { label: "Zoning code", value: parcel.zoningCode ?? "Not Available" },
          {
            label: "Zoning jurisdiction",
            value: parcel.zoningJurisdiction ?? "Not Available",
          },
          {
            label: "Zoning category",
            value: formatLabel(parcel.zoningCategory),
          },
          {
            label: "Assignment quality",
            value: formatLabel(parcel.zoningConfidence),
          },
          {
            label: "Official rezoning cases",
            value: "Not linked in this UI",
          },
        ]}
        icon={History}
        status={{
          label: parcel.zoningCode ? "Zoning Available" : "Review Needed",
          tone: parcel.zoningCode ? "positive" : "review",
        }}
        summary="Current zoning context is available for parcel review; official dated rezoning case records are still a future data need."
        title="3. Planning & Zoning"
      />

      <ReviewSection
        caveat="Permit activity and new construction records are observed historical/operational context. They are also used as historical outcome data for internal model research, but no parcel-level probability is shown."
        detail={
          latestPermit ? (
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
              Latest permit displayed:{" "}
              <span className="font-semibold text-slate-200">
                {latestPermit.permit_number ?? latestPermit.permit_id ?? "Permit not available"}
              </span>{" "}
              on {formatDevelopmentDate(latestPermit.activity_date)} /{" "}
              {formatDevelopmentLabel(latestPermit.permit_status)}.
            </div>
          ) : null
        }
        facts={[
          {
            label: "Total permit activity",
            value: activity
              ? formatDevelopmentCount(activity.total_permit_count)
              : loadingOrUnavailable(developmentActivity.source),
          },
          {
            label: "Permit segment",
            value: formatDevelopmentLabel(
              activity?.dominant_permit_segment ?? activity?.dominant_permit_type,
            ),
          },
          {
            label: "Recent 1-year / 3-year",
            value: activity
              ? `${formatDevelopmentCount(
                  activity.recent_permit_count_1yr,
                )} / ${formatDevelopmentCount(activity.recent_permit_count_3yr)}`
              : loadingOrUnavailable(developmentActivity.source),
          },
          {
            label: "Major value permits",
            value: formatOptionalCount(activity?.major_value_permits),
          },
          {
            label: "Activity class",
            value: formatDevelopmentLabel(activity?.development_activity_class),
          },
          {
            label: "Latest permit status",
            value: formatDevelopmentLabel(activity?.latest_permit_status),
          },
          {
            label: "Total new construction",
            value: newConstructionSummary
              ? formatDevelopmentCount(
                  newConstructionSummary.total_new_construction_permits,
                )
              : loadingOrUnavailable(newConstruction.source),
          },
          {
            label: "Residential / commercial",
            value: newConstructionSummary
              ? `${formatDevelopmentCount(
                  newConstructionSummary.residential_new_construction_permits,
                )} / ${formatDevelopmentCount(
                  newConstructionSummary.commercial_new_construction_permits,
                )}`
              : loadingOrUnavailable(newConstruction.source),
          },
          {
            label: "CO issued",
            value: newConstructionSummary
              ? formatDevelopmentCount(newConstructionSummary.completed_new_construction_count)
              : loadingOrUnavailable(newConstruction.source),
          },
          {
            label: "Active / uncompleted",
            value: newConstructionSummary
              ? formatDevelopmentCount(
                  newConstructionSummary.active_uncompleted_new_construction_count,
                )
              : loadingOrUnavailable(newConstruction.source),
          },
          {
            label: "Latest permit date",
            value: formatDevelopmentDate(
              newConstructionSummary?.latest_new_construction_permit_date,
            ),
          },
          {
            label: "Latest CO date",
            value: formatDevelopmentDate(newConstructionSummary?.latest_co_date),
          },
        ]}
        icon={TrafficCone}
        status={{
          label:
            activity?.total_permit_count ||
            newConstructionSummary?.total_new_construction_permits
              ? "Development Activity"
              : "No Recent Activity",
          tone:
            activity?.total_permit_count ||
            newConstructionSummary?.total_new_construction_permits
              ? "info"
              : "neutral",
        }}
        summary="Observed permit and new construction records indicate historical activity level, activity type, and recent operational movement."
        title="4. Development & New Construction"
      />

      <ReviewGroupIntro
        eyebrow="Constraints & Services"
        summary="FEMA flood, schools, transportation, and utility proxy context are grouped here so staff can separate confirmed source facts from follow-up data needs."
        title="5. Constraints & Services"
      />

      <ReviewSection
        caveat="FEMA NFHL remains the authoritative regulatory flood source."
        facts={[
          {
            label: "FEMA zone",
            value: flood?.dominant_flood_zone ?? loadingOrUnavailable(floodConstraint.source),
          },
          { label: "Floodway", value: yesNo(flood?.floodway_present) },
          { label: "SFHA", value: yesNo(flood?.sfha_present) },
          {
            label: "Moderate flood context",
            value: yesNo(flood?.moderate_flood_present),
          },
          {
            label: "Flood-constrained area",
            value: formatPercent(flood?.percent_parcel_constrained),
          },
          {
            label: "Buildability impact",
            value: formatLabel(flood?.buildability_impact),
          },
        ]}
        icon={Waves}
        status={{
          label: flood?.flood_review_required
            ? "Review Required"
            : flood
              ? "Not Flagged"
              : "Checking FEMA Overlay",
          tone: flood?.flood_review_required ? "review" : flood ? "positive" : "neutral",
        }}
        summary="Regulatory flood overlay status, floodway/SFHA indicators, and constrained-area context."
        title="5A. FEMA Flood Review"
      />

      <ReviewSection
        caveat="School assignment is based on attendance-zone polygon overlap. Presentation-derived utilization values require verification. Official school capacity/enrollment data has not been added yet. School capacity score is not active."
        facts={[
          ...schoolConstraint.assignments.flatMap((assignment) => [
            {
              label: `${assignment.levelLabel} assignment`,
              value: assignment.schoolName,
            },
            {
              label: `${assignment.levelLabel} utilization`,
              value: assignment.utilizationLabel,
            },
          ]),
          {
            label: "Assignment confidence",
            value:
              schoolConstraint.assignments
                .map((assignment) => assignment.confidenceLabel)
                .filter(Boolean)
                .join(" / ") || loadingOrUnavailable(schoolConstraint.source),
          },
          {
            label: "Capacity status",
            value: "Capacity Data Needed",
          },
          {
            label: "School constraint score",
            value: schoolConstraint.scoreLabel || "Not scored",
          },
        ]}
        icon={School}
        status={{
          label: schoolConstraint.assignments.some(
            (assignment) => !assignment.hasAssignment,
          )
            ? "Assignment Review Needed"
            : schoolConstraint.source === "api"
              ? "Assignment Available"
              : "Checking Assignment",
          tone: schoolConstraint.assignments.some(
            (assignment) => !assignment.hasAssignment,
          )
            ? "review"
            : schoolConstraint.source === "api"
              ? "info"
              : "neutral",
        }}
        summary="Read-only CCS V1 attendance-zone assignments and preliminary utilization context."
        title="5B. School Assignment / Utilization Seed"
      />

      <ReviewSection
        caveat="Transportation accessibility features are current-context indicators unless dated historical transportation/project data is available."
        facts={[
          {
            label: "Accessibility table",
            value: transportationContext.accessibility?.feature_table_available
              ? "Available"
              : transportationContext.isLoading
                ? "Loading"
                : "Not Available",
          },
          {
            label: "Road feature coverage",
            value: transportationContext.accessibility
              ? `${formatDevelopmentCount(
                  transportationContext.accessibility.row_count,
                )} parcel rows`
              : loadingOrUnavailable(transportationContext.source),
          },
          {
            label: "Distance to nearest road",
            value: "Available in backend feature table; planning context only",
          },
          {
            label: "Road density context",
            value: "Available in backend feature table; current context only",
          },
          {
            label: "Rail proximity",
            value: transportationContext.accessibility
              ? `${formatDevelopmentCount(
                  transportationContext.accessibility
                    .rail_corridor_within_half_mile_count,
                )} parcels within half mile`
              : loadingOrUnavailable(transportationContext.source),
          },
          {
            label: "STIP proximity",
            value: transportationContext.planTraffic
              ? `${formatDevelopmentCount(
                  transportationContext.planTraffic
                    .stip_project_within_half_mile_count,
                )} parcels within half mile`
              : loadingOrUnavailable(transportationContext.source),
          },
          {
            label: "AADT context",
            value: transportationContext.planTraffic
              ? `${formatDevelopmentCount(
                  transportationContext.planTraffic.aadt_clean_rows,
                )} AADT records`
              : loadingOrUnavailable(transportationContext.source),
          },
        ]}
        icon={Route}
        status={{
          label: transportationContext.accessibility || transportationContext.planTraffic
            ? "Current Context"
            : "Summary Not Available",
          tone: transportationContext.accessibility || transportationContext.planTraffic
            ? "info"
            : "neutral",
        }}
        summary="Transportation and traffic signals are prepared as current-context model inputs and planning context, not final parcel conclusions."
        title="5C. Transportation Context"
      />

      <ReviewSection
        caveat="Utility proxy layers indicate proximity/service context only. They do not confirm available capacity."
        facts={[
          {
            label: "WSACC district / proxy",
            value: "Proxy context only",
          },
          {
            label: "Sewer line proximity",
            value: "Available only where utility proxy features exist",
          },
          {
            label: "Utility access proxy score",
            value: "Internal research context; not a capacity score",
          },
          {
            label: "True utility capacity",
            value: "Not available",
          },
          {
            label: "Recommended verification",
            value: "Confirm service readiness with utility providers",
          },
        ]}
        icon={Wrench}
        status={{ label: "Proxy Only", tone: "caution" }}
        summary="Utility indicators help frame service proximity but do not certify water/sewer capacity or allocation."
        title="5D. Utility Proxy"
      />

      <ReviewSection
        caveat="Model research is shown for transparency only. Parcel-level model outputs are not exposed."
        facts={[
          {
            label: "Current best internal model variant",
            value: formatModelVariant(
              modelResearch.featuresSummary?.recommended_internal_model_variant ??
                modelResearch.featuresSummary?.current_best_internal_model_variant ??
                "Zoning + Transportation + Tax/Value",
            ),
          },
          { label: "Model status", value: "Internal research only" },
          { label: "Production ready", value: "No" },
          { label: "Exact probabilities", value: "Not shown" },
          { label: "Public exposure", value: "Not allowed" },
          {
            label: "Calibration status",
            value: formatLabel(modelResearch.rankingSummary.calibration_status),
          },
        ]}
        icon={BrainCircuit}
        status={{ label: "Internal Research Only", tone: "caution" }}
        summary="Aggregate model governance status is visible for transparency; no parcel-level score or ranked class is displayed."
        title="6. Internal Model Research Status"
      />

      <ReviewSection
        facts={reviewActions.map((action, index) => ({
          label: `Action ${index + 1}`,
          value: action,
        }))}
        icon={CheckCircle2}
        status={{ label: "Planner Review", tone: "info" }}
        summary="Suggested follow-up items based on the visible parcel context and current data caveats."
        title="7. Recommended Review Actions"
      />

      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-medium uppercase text-slate-500">
          Active Map Context
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Parcel focus and the selected parcel cage remain controlled by the
          existing SceneView workflow. Active overlays:{" "}
          <span className="text-slate-200">
            {activeLayers.length ? activeLayers.join(", ") : "None"}
          </span>
          .
        </p>
      </section>
        </>
      }
    />
  );
}

function SnapshotOnlyWorkspace({
  clearPlanningSnapshot,
  onGoOverview,
  onOpenMethodology,
  onPrint,
  planningSnapshot,
  snapshotLibrary,
  setPlanningSnapshotSectionIncluded,
}: {
  clearPlanningSnapshot: () => void;
  onGoOverview: () => void;
  onOpenMethodology: () => void;
  onPrint: () => void;
  planningSnapshot: PlanningSnapshot;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  setPlanningSnapshotSectionIncluded: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
}) {
  const [showExplanationCards, setShowExplanationCards] = useState(false);

  return (
    <PlanningSnapshotReportBuilder
      activeContextLabel={getSnapshotContextLabel(planningSnapshot)}
      onClearSnapshot={clearPlanningSnapshot}
      onGoOverview={onGoOverview}
      onOpenMethodology={onOpenMethodology}
      onPrint={onPrint}
      onToggleSection={setPlanningSnapshotSectionIncluded}
      planningSnapshot={planningSnapshot}
      showExplanationCards={showExplanationCards}
      snapshotLibrary={snapshotLibrary}
      toggleExplanationCards={setShowExplanationCards}
      advancedDetails={<SnapshotReviewActionsPanel planningSnapshot={planningSnapshot} />}
    />
  );
}

function EmptyPlanningSnapshotState({
  hasSelectedParcel,
  snapshotLibrary,
  onGoOverview,
  onOpenMethodology,
}: {
  hasSelectedParcel: boolean;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  onGoOverview: () => void;
  onOpenMethodology: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/88 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f0cd79]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="mx-auto mt-4 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Planning Snapshot
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            No planning snapshots saved yet
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use Workspace to search a parcel, inspect the map, or open Model
            Lab, then save a Planning Snapshot.
          </p>
        </div>

        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            className="rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-4 py-2 text-sm font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
            onClick={onGoOverview}
            type="button"
          >
            Go to Workspace
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
            onClick={onOpenMethodology}
            type="button"
          >
            Open Methodology
          </button>
          {hasSelectedParcel ? (
            <p className="text-xs leading-5 text-slate-500">
              A parcel is selected. Use Workspace&apos;s Save Snapshot for
              Report button to capture it.
            </p>
          ) : null}
        </div>
      </section>

      <PlanningSnapshotLibraryPanel {...snapshotLibrary} />
    </div>
  );
}

type ExtraReportSectionKey =
  | "countywide_indicators"
  | "key_findings"
  | "legend_map_notes";

type ReportBuilderSectionKey =
  | ExtraReportSectionKey
  | PlanningSnapshotSectionKey;

interface ReportSectionVisibility {
  countywide_indicators: boolean;
  key_findings: boolean;
  legend_map_notes: boolean;
}

const reportBuilderSections: Array<{
  key: ReportBuilderSectionKey;
  label: string;
}> = [
  { key: "map_view", label: "Map Snapshot" },
  { key: "countywide_indicators", label: "Key Statistics" },
  { key: "parcel_facts", label: "Parcel Facts" },
  { key: "development_permits", label: "Development / Permits" },
  { key: "new_construction", label: "New Construction" },
  { key: "fema_flood", label: "FEMA Flood" },
  { key: "schools", label: "Schools" },
  { key: "transportation", label: "Transportation" },
  { key: "utility_proxy", label: "Utility Proxy" },
  { key: "model_governance", label: "Model Research Context" },
  { key: "data_needed_caveats", label: "Data Needed / Caveats" },
  { key: "recommended_actions", label: "Recommended Actions" },
];

const defaultExtraReportSections: ReportSectionVisibility = {
  countywide_indicators: true,
  key_findings: false,
  legend_map_notes: true,
};

const REPORT_DRAFTS_STORAGE_KEY = "cfs.planningSnapshot.reportDrafts.v1";
const DEFAULT_EXECUTIVE_REPORT_TITLE = "Planning Snapshot Executive Summary";

interface PlanningSnapshotReportDraft {
  createdAt: string;
  draftId: string;
  draftName: string;
  explainNumbers: boolean;
  reportNotes?: string;
  reportTitle: string;
  selectedSections: Record<ReportBuilderSectionKey, boolean>;
  sourceSnapshotId: string;
  updatedAt: string;
}

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createReportDraftName(snapshot: PlanningSnapshot) {
  return `${getSnapshotLibraryTitle(snapshot)} report draft`;
}

function getReportSectionSelectionSnapshot(
  snapshot: PlanningSnapshot,
  extraSections: ReportSectionVisibility,
) {
  return reportBuilderSections.reduce(
    (sections, section) => ({
      ...sections,
      [section.key]:
        section.key === "countywide_indicators" ||
        section.key === "key_findings" ||
        section.key === "legend_map_notes"
          ? extraSections[section.key]
          : (snapshot.includedSections[section.key] ?? true),
    }),
    {} as Record<ReportBuilderSectionKey, boolean>,
  );
}

function readStoredReportDrafts() {
  if (typeof window === "undefined") {
    return [] as PlanningSnapshotReportDraft[];
  }

  try {
    const storedDrafts = window.localStorage.getItem(REPORT_DRAFTS_STORAGE_KEY);

    if (!storedDrafts) {
      return [] as PlanningSnapshotReportDraft[];
    }

    const parsedDrafts = JSON.parse(storedDrafts);

    if (!Array.isArray(parsedDrafts)) {
      return [] as PlanningSnapshotReportDraft[];
    }

    return parsedDrafts.filter(
      (draft): draft is PlanningSnapshotReportDraft =>
        Boolean(
          draft &&
            typeof draft === "object" &&
            typeof draft.draftId === "string" &&
            typeof draft.sourceSnapshotId === "string" &&
            typeof draft.draftName === "string" &&
            draft.selectedSections &&
            typeof draft.selectedSections === "object",
        ),
    );
  } catch {
    return [] as PlanningSnapshotReportDraft[];
  }
}

function writeStoredReportDrafts(drafts: PlanningSnapshotReportDraft[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!drafts.length) {
      window.localStorage.removeItem(REPORT_DRAFTS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      REPORT_DRAFTS_STORAGE_KEY,
      JSON.stringify(drafts),
    );
  } catch {
    // Local storage can be unavailable or full. Keep the in-memory draft library.
  }
}

const snapshotSectionKeys = new Set<PlanningSnapshotSectionKey>([
  "data_needed_caveats",
  "development_permits",
  "fema_flood",
  "map_view",
  "model_governance",
  "new_construction",
  "parcel_facts",
  "recommended_actions",
  "schools",
  "transportation",
  "utility_proxy",
  "zoning_planning",
]);

function PlanningSnapshotReportBuilder({
  activeContextLabel,
  advancedDetails,
  contextBadges = [],
  onClearSnapshot,
  onGoOverview,
  onOpenMethodology,
  onPrint,
  onToggleSection,
  planningSnapshot,
  showExplanationCards,
  snapshotLibrary,
  toggleExplanationCards,
}: {
  activeContextLabel?: string;
  advancedDetails?: ReactNode;
  contextBadges?: ReviewBadge[];
  onClearSnapshot: () => void;
  onGoOverview: () => void;
  onOpenMethodology: () => void;
  onPrint: () => void;
  onToggleSection: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
  planningSnapshot: PlanningSnapshot;
  showExplanationCards: boolean;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  toggleExplanationCards: (show: boolean) => void;
}) {
  const [extraSections, setExtraSections] = useState<ReportSectionVisibility>({
    ...defaultExtraReportSections,
  });
  const [reportDrafts, setReportDrafts] = useState<
    PlanningSnapshotReportDraft[]
  >(() => readStoredReportDrafts());
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState(
    DEFAULT_EXECUTIVE_REPORT_TITLE,
  );
  const [reportNotes, setReportNotes] = useState("");

  function persistDrafts(nextDrafts: PlanningSnapshotReportDraft[]) {
    setReportDrafts(nextDrafts);
    writeStoredReportDrafts(nextDrafts);
  }

  function isSectionChecked(sectionKey: ReportBuilderSectionKey) {
    if (sectionKey === "countywide_indicators") {
      return extraSections.countywide_indicators;
    }

    if (sectionKey === "key_findings") {
      return extraSections.key_findings;
    }

    if (sectionKey === "legend_map_notes") {
      return extraSections.legend_map_notes;
    }

    return planningSnapshot.includedSections[sectionKey] ?? true;
  }

  function toggleReportSection(
    sectionKey: ReportBuilderSectionKey,
    included: boolean,
  ) {
    if (
      sectionKey === "countywide_indicators" ||
      sectionKey === "key_findings" ||
      sectionKey === "legend_map_notes"
    ) {
      setExtraSections((current) => ({
        ...current,
        [sectionKey]: included,
      }));
      return;
    }

    if (snapshotSectionKeys.has(sectionKey)) {
      onToggleSection(sectionKey, included);
    }
  }

  function buildDraftPayload(
    draftId: string,
    draftName: string,
    createdAt: string,
  ): PlanningSnapshotReportDraft {
    const now = new Date().toISOString();

    return {
      createdAt,
      draftId,
      draftName,
      explainNumbers: showExplanationCards,
      reportNotes: reportNotes.trim(),
      reportTitle: reportTitle.trim() || DEFAULT_EXECUTIVE_REPORT_TITLE,
      selectedSections: getReportSectionSelectionSnapshot(
        planningSnapshot,
        extraSections,
      ),
      sourceSnapshotId: planningSnapshot.snapshotId,
      updatedAt: now,
    };
  }

  function createDraftFromSnapshot() {
    const draftId = createDraftId();
    const draft = buildDraftPayload(
      draftId,
      createReportDraftName(planningSnapshot),
      new Date().toISOString(),
    );
    const nextDrafts = [draft, ...reportDrafts].slice(0, 12);

    persistDrafts(nextDrafts);
    setActiveDraftId(draftId);
    setDraftWarning(null);
    setDraftMessage("New report draft created from the selected snapshot.");
  }

  function saveCurrentDraft() {
    if (activeDraftId) {
      const existingDraft = reportDrafts.find(
        (draft) => draft.draftId === activeDraftId,
      );
      const nextDraft = buildDraftPayload(
        activeDraftId,
        existingDraft?.draftName ?? createReportDraftName(planningSnapshot),
        existingDraft?.createdAt ?? new Date().toISOString(),
      );
      const nextDrafts = [
        nextDraft,
        ...reportDrafts.filter((draft) => draft.draftId !== activeDraftId),
      ];

      persistDrafts(nextDrafts);
      setDraftWarning(null);
      setDraftMessage("Current report draft saved.");
      return;
    }

    createDraftFromSnapshot();
  }

  function applyDraft(draft: PlanningSnapshotReportDraft) {
    const sourceSnapshotExists = snapshotLibrary.snapshots.some(
      (snapshot) => snapshot.snapshotId === draft.sourceSnapshotId,
    );

    setActiveDraftId(draft.draftId);
    setDraftMessage(`Loaded ${draft.draftName}.`);
    setDraftWarning(
      sourceSnapshotExists
        ? null
        : "The source snapshot for this draft is no longer in the library. Section selections were restored, but the current snapshot remains active.",
    );
    setReportTitle(draft.reportTitle || DEFAULT_EXECUTIVE_REPORT_TITLE);
    setReportNotes(draft.reportNotes ?? "");

    function restoreDraftSelections() {
      setExtraSections({
        countywide_indicators:
          draft.selectedSections.countywide_indicators ?? true,
        key_findings: draft.selectedSections.key_findings ?? true,
        legend_map_notes: draft.selectedSections.legend_map_notes ?? true,
      });

      snapshotSectionKeys.forEach((sectionKey) => {
        const included = draft.selectedSections[sectionKey];

        if (typeof included === "boolean") {
          onToggleSection(sectionKey, included);
        }
      });
      toggleExplanationCards(draft.explainNumbers);
    }

    if (sourceSnapshotExists) {
      snapshotLibrary.onUse(draft.sourceSnapshotId);
      window.setTimeout(restoreDraftSelections, 0);
      return;
    }

    restoreDraftSelections();
  }

  function renameDraft(draft: PlanningSnapshotReportDraft) {
    const nextName = window.prompt("Rename report draft", draft.draftName);

    if (!nextName?.trim()) {
      return;
    }

    const safeName = nextName.trim().slice(0, 80);
    const nextDrafts = reportDrafts.map((candidate) =>
      candidate.draftId === draft.draftId
        ? {
            ...candidate,
            draftName: safeName,
            updatedAt: new Date().toISOString(),
          }
        : candidate,
    );

    persistDrafts(nextDrafts);
    setDraftMessage("Report draft renamed.");
  }

  function deleteDraft(draftId: string) {
    const shouldDelete = window.confirm(
      "Delete this report draft? The source planning snapshot will not be deleted.",
    );

    if (!shouldDelete) {
      return;
    }

    const nextDrafts = reportDrafts.filter((draft) => draft.draftId !== draftId);

    persistDrafts(nextDrafts);
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
    }
    setDraftWarning(null);
    setDraftMessage("Report draft deleted.");
  }

  return (
    <div className="space-y-4">
      <section className="cfs-command-surface app-chrome no-print rounded-lg p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
              Planning Snapshot
            </p>
            <h3 className="mt-2 break-words text-xl font-semibold leading-7 text-white">
              Planning Snapshot
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Choose a saved snapshot, select what to include, and print an
              executive summary.
            </p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {isIndicatorDashboardSnapshot(planningSnapshot)
                ? "A Planning Snapshot can capture an Indicator Center dashboard visual, key monitoring signals, data gaps, and caveats for report-ready review."
                : "A Planning Snapshot captures the map image, active layers, selected parcel if available, and Intelligence Brief for report-ready review."}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
              Snapshot saved {formatDateTime(planningSnapshot.createdAt)}
              {activeContextLabel ? ` / ${activeContextLabel}` : ""}
            </p>
            {contextBadges.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {contextBadges.map((badge) => (
                  <StatusBadge
                    key={badge.label}
                    label={badge.label}
                    tone={badge.tone}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <ActionButton
              icon={<Printer className="h-3.5 w-3.5" />}
              label="Print Report"
              onClick={onPrint}
              variant="gold"
            />
            <ActionButton
              icon={<MapPinned className="h-3.5 w-3.5" />}
              label="Go to Workspace"
              onClick={onGoOverview}
            />
            <ActionButton
              icon={<FileText className="h-3.5 w-3.5" />}
              label="New Draft from Snapshot"
              onClick={createDraftFromSnapshot}
            />
            <ActionButton
              icon={<Save className="h-3.5 w-3.5" />}
              label="Save Draft"
              onClick={saveCurrentDraft}
            />
            <ActionButton
              icon={<History className="h-3.5 w-3.5" />}
              label="Load Draft"
              onClick={() =>
                document
                  .getElementById("cfs-report-drafts")
                  ?.scrollIntoView({ block: "nearest" })
              }
            />
          </div>
        </div>
      </section>

      <PlanningSnapshotLibraryPanel {...snapshotLibrary} />

      <ReportDraftsPanel
        activeDraftId={activeDraftId}
        draftMessage={draftMessage}
        draftWarning={draftWarning}
        drafts={reportDrafts}
        onDelete={deleteDraft}
        onLoad={applyDraft}
        onRename={renameDraft}
        onSaveCurrent={saveCurrentDraft}
        onCreate={createDraftFromSnapshot}
        snapshots={snapshotLibrary.snapshots}
      />

      <SnapshotVisualPreview planningSnapshot={planningSnapshot} />

      <ReportBuilderControls
        onClear={onClearSnapshot}
        onToggle={toggleReportSection}
        planningSnapshot={planningSnapshot}
        reportNotes={reportNotes}
        reportTitle={reportTitle}
        sectionChecked={isSectionChecked}
        setReportNotes={setReportNotes}
        setReportTitle={setReportTitle}
        showExplanationCards={showExplanationCards}
        toggleExplanationCards={toggleExplanationCards}
      />

      <SnapshotExecutiveSummary
        extraSections={extraSections}
        onPrint={onPrint}
        planningSnapshot={planningSnapshot}
        reportNotes={reportNotes}
        reportTitle={reportTitle}
        showExplanationCards={showExplanationCards}
      />

      {advancedDetails ? (
        <details className="cfs-command-card no-print rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Advanced saved evidence
          </summary>
          <div className="mt-4 space-y-4">{advancedDetails}</div>
        </details>
      ) : null}

      <div className="cfs-command-card no-print flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
        <p className="text-xs leading-5 text-slate-500">
          Need the full methodology behind a caveat or data source?
        </p>
        <button
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
          onClick={onOpenMethodology}
          type="button"
        >
          Open Methodology
        </button>
      </div>
    </div>
  );
}

function ReportBuilderControls({
  onClear,
  onToggle,
  planningSnapshot,
  reportNotes,
  reportTitle,
  sectionChecked,
  setReportNotes,
  setReportTitle,
  showExplanationCards,
  toggleExplanationCards,
}: {
  onClear: () => void;
  onToggle: (sectionKey: ReportBuilderSectionKey, included: boolean) => void;
  planningSnapshot: PlanningSnapshot;
  reportNotes: string;
  reportTitle: string;
  sectionChecked: (sectionKey: ReportBuilderSectionKey) => boolean;
  setReportNotes: (value: string) => void;
  setReportTitle: (value: string) => void;
  showExplanationCards: boolean;
  toggleExplanationCards: (show: boolean) => void;
}) {
  return (
    <section className="cfs-command-card app-chrome no-print rounded-lg p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Customize Report
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Report title, notes, and sections
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff]">
            <input
              checked={showExplanationCards}
              className="h-3.5 w-3.5 accent-[#68d8ff]"
              onChange={(event) =>
                toggleExplanationCards(event.target.checked)
              }
              type="checkbox"
            />
            Explain the Numbers Appendix
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            onClick={onClear}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Snapshot
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Report title
          <input
            className="min-h-10 rounded-md border border-white/10 bg-black/24 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-[#68d8ff]/45"
            onChange={(event) => setReportTitle(event.target.value)}
            placeholder={DEFAULT_EXECUTIVE_REPORT_TITLE}
            type="text"
            value={reportTitle}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Report notes
          <input
            className="min-h-10 rounded-md border border-white/10 bg-black/24 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-[#68d8ff]/45"
            onChange={(event) => setReportNotes(event.target.value)}
            placeholder="Optional staff note for the report"
            type="text"
            value={reportNotes}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {reportBuilderSections.map((section) => (
          <label
            className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200"
            key={section.key}
          >
            <input
              checked={sectionChecked(section.key)}
              className="h-3.5 w-3.5 accent-[#68d8ff]"
              onChange={(event) => onToggle(section.key, event.target.checked)}
              type="checkbox"
            />
            <span className="min-w-0 truncate">
              {section.key === "map_view"
                ? getVisualSnapshotSectionLabel(planningSnapshot)
                : section.label}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ReportDraftsPanel({
  activeDraftId,
  draftMessage,
  draftWarning,
  drafts,
  onCreate,
  onDelete,
  onLoad,
  onRename,
  onSaveCurrent,
  snapshots,
}: {
  activeDraftId: string | null;
  draftMessage: string | null;
  draftWarning: string | null;
  drafts: PlanningSnapshotReportDraft[];
  onCreate: () => void;
  onDelete: (draftId: string) => void;
  onLoad: (draft: PlanningSnapshotReportDraft) => void;
  onRename: (draft: PlanningSnapshotReportDraft) => void;
  onSaveCurrent: () => void;
  snapshots: PlanningSnapshot[];
}) {
  return (
    <section
      className="cfs-command-card app-chrome no-print rounded-lg p-3"
      id="cfs-report-drafts"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Report Drafts
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Save and reload report section selections
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Drafts save the chosen snapshot, checked report sections, and
            Explain the Numbers setting in local storage.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
            onClick={onCreate}
            type="button"
          >
            <FileText className="h-3.5 w-3.5" />
            New Draft from Snapshot
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-2 text-xs font-semibold text-[#f6d98e] transition hover:bg-[#d8b86a]/15"
            onClick={onSaveCurrent}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            Save Current Draft
          </button>
        </div>
      </div>

      {draftMessage ? (
        <p className="mt-3 rounded-md border border-[#55d38f]/20 bg-[#55d38f]/[0.06] px-3 py-2 text-xs leading-5 text-[#a8f3c4]">
          {draftMessage}
        </p>
      ) : null}
      {draftWarning ? (
        <p className="mt-3 rounded-md border border-[#d8b86a]/24 bg-[#d8b86a]/[0.07] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
          {draftWarning}
        </p>
      ) : null}

      {drafts.length ? (
        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {drafts.map((draft) => {
            const sourceSnapshot = snapshots.find(
              (snapshot) => snapshot.snapshotId === draft.sourceSnapshotId,
            );
            const active = activeDraftId === draft.draftId;

            return (
              <article
                className={cn(
                  "rounded-md border bg-white/[0.035] p-3",
                  active ? "border-[#68d8ff]/35" : "border-white/10",
                )}
                key={draft.draftId}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {draft.draftName}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Updated {formatDateTime(draft.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge
                    label={sourceSnapshot ? "Snapshot linked" : "Missing snapshot"}
                    tone={sourceSnapshot ? "positive" : "caution"}
                  />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                  <CompactSnapshotFact
                    label="Source"
                    value={
                      sourceSnapshot
                        ? getSnapshotLibraryTitle(sourceSnapshot)
                        : draft.sourceSnapshotId
                    }
                  />
                  <CompactSnapshotFact
                    label="Title"
                    value={draft.reportTitle || DEFAULT_EXECUTIVE_REPORT_TITLE}
                  />
                  <CompactSnapshotFact
                    label="Explain"
                    value={draft.explainNumbers ? "On" : "Off"}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    className="rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
                    onClick={() => onLoad(draft)}
                    type="button"
                  >
                    Load
                  </button>
                  <button
                    className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                    onClick={() => onRename(draft)}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-md border border-rose-300/18 bg-rose-400/[0.07] px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/[0.12]"
                    onClick={() => onDelete(draft.draftId)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-400">
          No report drafts saved yet. Choose report sections, then click Save
          Current Draft.
        </div>
      )}
    </section>
  );
}

interface PlanningSnapshotLibraryProps {
  activeSnapshotId: string | null;
  onDelete: (snapshotId: string) => void;
  onRename: (snapshotId: string, snapshotTitle: string) => void;
  onUse: (snapshotId: string) => void;
  snapshots: PlanningSnapshot[];
}

function PlanningSnapshotLibraryPanel({
  activeSnapshotId,
  onDelete,
  onRename,
  onUse,
  snapshots,
}: PlanningSnapshotLibraryProps) {
  return (
    <section className="cfs-command-surface app-chrome no-print rounded-lg p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Planning Snapshot Library
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Saved report snapshots
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Compact saved views from Overview. Open one to build or print the
            executive summary.
          </p>
        </div>
        <StatusBadge
          label={`${snapshots.length} saved`}
          tone={snapshots.length ? "info" : "neutral"}
        />
      </div>

      {snapshots.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {snapshots.map((snapshot) => {
            const active = snapshot.snapshotId === activeSnapshotId;
            const dashboardSnapshot = isIndicatorDashboardSnapshot(snapshot);
            const dashboardCaptured = hasCapturedDashboardImage(snapshot);
            const mapCaptured =
              snapshot.mapScreenshotStatus === "captured" &&
              Boolean(snapshot.mapScreenshotDataUrl);
            const captured = dashboardSnapshot
              ? dashboardCaptured
              : mapCaptured;

            return (
              <article
                className={cn(
                  "overflow-hidden rounded-lg border bg-white/[0.035]",
                  active
                    ? "border-[#68d8ff]/35 shadow-[0_0_24px_rgba(104,216,255,0.12)]"
                    : "border-white/10",
                )}
                key={snapshot.snapshotId}
              >
                <div className="grid gap-0 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                  <div className="relative min-h-28 overflow-hidden border-b border-white/10 bg-[#020814] sm:border-b-0 sm:border-r">
                    {dashboardSnapshot && dashboardCaptured && snapshot.dashboardImageDataUrl ? (
                      <Image
                        alt={
                          snapshot.dashboardImageAlt ??
                          "Indicator Center dashboard snapshot thumbnail"
                        }
                        className="h-full w-full object-cover"
                        height={180}
                        src={snapshot.dashboardImageDataUrl}
                        unoptimized
                        width={260}
                      />
                    ) : !dashboardSnapshot && captured && snapshot.mapScreenshotDataUrl ? (
                      <Image
                        alt="Planning snapshot map thumbnail"
                        className="h-full w-full object-cover"
                        height={180}
                        src={snapshot.mapScreenshotDataUrl}
                        unoptimized
                        width={260}
                      />
                    ) : (
                      <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1.5 p-3 text-center">
                        {dashboardSnapshot ? (
                          <BarChart3 className="h-5 w-5 text-slate-500" />
                        ) : (
                          <MapPinned className="h-5 w-5 text-slate-500" />
                        )}
                        <p className="text-[11px] font-semibold text-slate-300">
                          {dashboardSnapshot
                            ? "Dashboard unavailable"
                            : "Map unavailable"}
                        </p>
                      </div>
                    )}
                    {active ? (
                      <span className="absolute left-2 top-2 rounded-full border border-[#55d38f]/25 bg-[#55d38f]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ff0bd]">
                        Active
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {getSnapshotLibraryTitle(snapshot)}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {formatDateTime(snapshot.createdAt)}
                        </p>
                      </div>
                      <StatusBadge
                        label={getSnapshotVisualStatusLabel(snapshot)}
                        tone={captured ? "positive" : "caution"}
                      />
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      <CompactSnapshotFact
                        label="Parcel"
                        value={snapshot.selectedParcelId ?? "Map/context only"}
                      />
                      <CompactSnapshotFact
                        label="Type"
                        value={getSnapshotContextLabel(snapshot)}
                      />
                      <CompactSnapshotFact
                        label="Visual"
                        value={
                          dashboardSnapshot
                            ? captured
                              ? "Dashboard captured"
                              : "Dashboard unavailable"
                            : captured
                              ? "Map captured"
                              : "Map unavailable"
                        }
                      />
                      <CompactSnapshotFact
                        label="Layers"
                        value={`${snapshot.activeLayers.length} included`}
                      />
                      <CompactSnapshotFact
                        label="Brief"
                        value={getSnapshotIntelligenceBriefTitle(snapshot)}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
                        onClick={() => onUse(snapshot.snapshotId)}
                        type="button"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Use
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                        onClick={() => {
                          const nextTitle = window.prompt(
                            "Rename this planning snapshot",
                            getSnapshotLibraryTitle(snapshot),
                          );
                          if (nextTitle) {
                            onRename(snapshot.snapshotId, nextTitle);
                          }
                        }}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-300/18 bg-rose-400/[0.07] px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/[0.12]"
                        onClick={() => {
                          const shouldDelete = window.confirm(
                            "Delete this planning snapshot? This only removes the saved local report snapshot.",
                          );
                          if (shouldDelete) {
                            onDelete(snapshot.snapshotId);
                          }
                        }}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-400">
          No planning snapshots saved yet. Go to Workspace, search/select a
          parcel or adjust the map, then click Save Snapshot.
        </div>
      )}
    </section>
  );
}

function CompactSnapshotFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-white/10 bg-black/18 px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-200">
        {value}
      </span>
    </div>
  );
}

function getSnapshotLibraryTitle(snapshot: PlanningSnapshot) {
  if (snapshot.snapshotTitle) {
    return snapshot.snapshotTitle;
  }

  if (snapshot.selectedParcelId) {
    return `Parcel ${snapshot.selectedParcelId}`;
  }

  return snapshot.focusModeLabel ?? "Countywide Planning Snapshot";
}

function getSnapshotContextLabel(snapshot: PlanningSnapshot) {
  if (snapshot.overviewCommandMode === "indicatorCenter") {
    return snapshot.selectedParcelId
      ? "Indicator Center parcel-context snapshot"
      : "Indicator Center snapshot";
  }

  if (snapshot.overviewCommandMode === "modelLab") {
    return snapshot.selectedParcelId
      ? "Model Lab parcel-context snapshot"
      : "Model Lab research snapshot";
  }

  if (snapshot.overviewCommandMode === "countywide") {
    return "Countywide intelligence snapshot";
  }

  if (snapshot.selectedParcelId) {
    return "Parcel snapshot";
  }

  if (snapshot.activeLayers.length > 1) {
    return "Layer/context snapshot";
  }

  return "Countywide snapshot";
}

function getSnapshotIntelligenceBriefTitle(snapshot: PlanningSnapshot) {
  if (snapshot.overviewCommandMode === "indicatorCenter") {
    return "Indicator Intelligence";
  }

  if (snapshot.overviewCommandMode === "modelLab") {
    return "Model Lab Intelligence";
  }

  if (snapshot.overviewCommandMode === "countywide") {
    return "Countywide Intelligence Brief";
  }

  return snapshot.selectedParcelId
    ? "Selected Parcel Intelligence"
    : "Intelligence Brief";
}

function getSnapshotVisualType(snapshot: PlanningSnapshot): "dashboard" | "map" {
  if (
    snapshot.visualType === "dashboard" ||
    snapshot.snapshotType === "indicator_center" ||
    snapshot.overviewCommandMode === "indicatorCenter" ||
    Boolean(snapshot.indicatorCenterContext)
  ) {
    return "dashboard";
  }

  return "map";
}

function isIndicatorDashboardSnapshot(snapshot: PlanningSnapshot) {
  return getSnapshotVisualType(snapshot) === "dashboard";
}

function hasCapturedDashboardImage(snapshot: PlanningSnapshot) {
  return (
    isIndicatorDashboardSnapshot(snapshot) &&
    snapshot.dashboardImageStatus === "captured" &&
    Boolean(snapshot.dashboardImageDataUrl)
  );
}

function getSnapshotVisualStatusLabel(snapshot: PlanningSnapshot) {
  if (isIndicatorDashboardSnapshot(snapshot)) {
    return hasCapturedDashboardImage(snapshot)
      ? "Dashboard captured"
      : "Dashboard unavailable";
  }

  return snapshot.mapScreenshotStatus === "captured"
    ? "Map captured"
    : "Map unavailable";
}

function getVisualSnapshotSectionLabel(snapshot: PlanningSnapshot) {
  return isIndicatorDashboardSnapshot(snapshot)
    ? "Dashboard Snapshot"
    : "Map Snapshot";
}

function formatDashboardCapturedSection(section: string) {
  switch (section) {
    case "critical_signals":
      return "Critical Signals";
    case "monitoring_charts":
      return "Monitoring Charts";
    case "priority_issues":
      return "Priority Issues";
    default:
      return section
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
  }
}

const snapshotSectionLabels: Record<PlanningSnapshotSectionKey, string> = {
  data_needed_caveats: "Data Needed / Caveats",
  development_permits: "Development / Permits",
  fema_flood: "FEMA Flood",
  map_view: "Map View",
  model_governance: "Model Governance",
  new_construction: "New Construction",
  parcel_facts: "Parcel Facts",
  recommended_actions: "Recommended Actions",
  schools: "Schools",
  transportation: "Transportation",
  utility_proxy: "Utility Proxy",
  zoning_planning: "Zoning / Planning",
};

const metricSectionMap: Record<string, PlanningSnapshotSectionKey> = {
  "Development Activity": "development_permits",
  "Development Activity Context": "development_permits",
  "Flood Review Status": "fema_flood",
  "Internal Model Research Status": "model_governance",
  "Indicator Center Context": "data_needed_caveats",
  "Map Snapshot": "map_view",
  "Model Map Display": "model_governance",
  "Model Lab Context": "model_governance",
  "Model Signal Rationale": "model_governance",
  "Overview Mode": "data_needed_caveats",
  "Snapshot Context": "data_needed_caveats",
  "Workspace Mode": "data_needed_caveats",
  "School Assignment": "schools",
  "Transportation Context": "transportation",
  "Utility Proxy": "utility_proxy",
};

function SnapshotOverviewPanel({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  return (
    <section className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/78 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Snapshot Overview
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            What was captured
          </h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            {isIndicatorDashboardSnapshot(planningSnapshot)
              ? "This snapshot preserves dashboard visual context, key facts, review flags, and caveats for an executive-ready planning memo."
              : "This snapshot preserves the saved command context, map image when available, active context labels, key facts, review flags, and caveats that should be explained in an executive-ready planning memo."}
          </p>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
            {isIndicatorDashboardSnapshot(planningSnapshot)
              ? "CFS combines the dashboard capture with monitoring summaries, caveats, and explanation cards so the report has meaning."
              : "It is not just a screenshot. CFS combines the map image with the Intelligence Brief, active layers, headline indicators, caveats, and explanation cards so the report has meaning."}
          </p>
        </div>
        <StatusBadge label="Saved Context" tone="info" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderFact
          label="Snapshot context"
          value={planningSnapshot.focusModeLabel ?? "Planning Snapshot"}
        />
        <HeaderFact
          label="Snapshot time"
          value={formatDateTime(planningSnapshot.createdAt)}
        />
        <HeaderFact
          label="Selected parcel"
          value={planningSnapshot.selectedParcelId ?? "No parcel captured"}
        />
        <HeaderFact
          label="Active layers"
          value={planningSnapshot.activeLayers.join(", ")}
        />
        <HeaderFact
          label="Version"
          value={planningSnapshot.snapshotVersion}
        />
      </div>

      <SnapshotVisualPreview planningSnapshot={planningSnapshot} />

      <div className="mt-4 grid gap-2">
        {planningSnapshot.knownReviewFlags.map((flag) => (
          <div
            className="rounded-md border border-white/10 bg-white/[0.035] p-3"
            key={`${flag.label}-${flag.status}`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {flag.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {flag.reason}
                </p>
              </div>
              <StatusBadge label={flag.status} tone="caution" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SnapshotVisualPreview({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  if (isIndicatorDashboardSnapshot(planningSnapshot)) {
    const captured = hasCapturedDashboardImage(planningSnapshot);
    const capturedAt =
      planningSnapshot.dashboardImageCapturedAt ?? planningSnapshot.createdAt;

    return (
      <section className="cfs-command-card app-chrome no-print rounded-lg p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
              Selected Dashboard Snapshot
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {captured
                ? `Indicator Center dashboard snapshot captured at ${formatDateTime(
                    capturedAt,
                  )}.`
                : "Dashboard snapshot unavailable for this saved Indicator Center context."}
            </p>
          </div>
          <StatusBadge
            label={captured ? "Dashboard captured" : "Dashboard unavailable"}
            tone={captured ? "positive" : "caution"}
          />
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814]">
          {captured && planningSnapshot.dashboardImageDataUrl ? (
            <Image
              alt={
                planningSnapshot.dashboardImageAlt ??
                "Indicator Center dashboard snapshot"
              }
              className="h-auto max-h-[36rem] w-full object-contain"
              height={720}
              src={planningSnapshot.dashboardImageDataUrl}
              unoptimized
              width={1280}
            />
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
              <BarChart3 className="h-6 w-6 text-slate-500" />
              <p className="text-sm font-semibold text-slate-200">
                Dashboard snapshot unavailable
              </p>
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                {planningSnapshot.dashboardImageFailureReason ??
                  "Indicator Center is map-free. Dashboard image capture failed or was not available."}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
            Indicator Dashboard
          </span>
          {(planningSnapshot.capturedSections?.length
            ? planningSnapshot.capturedSections
            : ["critical_signals", "monitoring_charts"]
          ).map((section) => (
            <span
              className="rounded-full border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2.5 py-1 text-[11px] font-semibold text-[#b7f0ff]"
              key={section}
            >
              {formatDashboardCapturedSection(section)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Captures Critical Signals and Monitoring Charts. No map legend,
          north arrow, scale note, camera, or map context is required.
        </p>
      </section>
    );
  }

  const captured =
    planningSnapshot.mapScreenshotStatus === "captured" &&
    Boolean(planningSnapshot.mapScreenshotDataUrl);
  const capturedAt =
    planningSnapshot.mapScreenshotCapturedAt ?? planningSnapshot.createdAt;
  const legend = getSnapshotMapLegend(planningSnapshot);

  return (
    <section className="cfs-command-card app-chrome no-print rounded-lg p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Selected Snapshot Map
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {captured
              ? `Map snapshot captured from CFS Overview at ${formatDateTime(
                  capturedAt,
                )}.`
              : "Map snapshot unavailable for this saved context."}
          </p>
        </div>
        <StatusBadge
          label={
            captured
              ? "Captured"
              : planningSnapshot.mapScreenshotStatus === "failed"
                ? "Capture Failed"
                : "Unavailable"
          }
          tone={captured ? "positive" : "caution"}
        />
      </div>
      <div className="relative mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814]">
        {captured && planningSnapshot.mapScreenshotDataUrl ? (
          <Image
            alt="Captured CFS map snapshot"
            className="h-auto w-full"
            height={540}
            src={planningSnapshot.mapScreenshotDataUrl}
            unoptimized
            width={960}
          />
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
            <MapPinned className="h-6 w-6 text-slate-500" />
            <p className="text-sm font-semibold text-slate-200">
              Map snapshot unavailable
            </p>
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              {planningSnapshot.mapScreenshotFailureReason ??
                "SceneView did not provide an image when this snapshot was saved."}
            </p>
          </div>
        )}
        <NorthArrow />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          {planningSnapshot.focusModeLabel ?? "Planning Snapshot"}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          {planningSnapshot.selectedParcelId ?? "No parcel captured"}
        </span>
        {planningSnapshot.activeLayers.map((layer) => (
          <span
            className="rounded-full border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2.5 py-1 text-[11px] font-semibold text-[#b7f0ff]"
            key={layer}
          >
            {layer}
          </span>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <MapLegendPanel legend={legend} />
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
            Scale note
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Scale is approximate; 3D scene perspective affects distance.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Camera: {planningSnapshot.mapContext.cameraSummary ?? "Not captured"}
          </p>
        </div>
      </div>
    </section>
  );
}

interface SnapshotLegend {
  caveat?: string;
  items: Array<{ colorClassName: string; label: string }>;
  message?: string;
  title: string;
}

function MapLegendPanel({ legend }: { legend: SnapshotLegend }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
        Legend
      </p>
      <h4 className="mt-1 text-sm font-semibold text-white">{legend.title}</h4>
      {legend.items.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {legend.items.map((item) => (
            <div
              className="flex items-center gap-2 text-xs text-slate-300"
              key={item.label}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border",
                  item.colorClassName,
                )}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {legend.message ??
            "Active layers are listed below. No specialized legend was available for this snapshot."}
        </p>
      )}
      {legend.caveat ? (
        <p className="mt-2 text-xs leading-5 text-[#f6d98e]">{legend.caveat}</p>
      ) : null}
    </div>
  );
}

function NorthArrow() {
  return (
    <div className="absolute right-3 top-3 flex h-12 w-10 flex-col items-center justify-center rounded-md border border-white/20 bg-black/55 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] print:border-slate-300 print:bg-white print:text-slate-900">
      <span className="text-[10px] font-bold leading-none">N</span>
      <span className="mt-0.5 text-lg leading-none">^</span>
    </div>
  );
}

function getSnapshotMapLegend(planningSnapshot: PlanningSnapshot): SnapshotLegend {
  const layerText = [
    ...planningSnapshot.activeLayers,
    ...(planningSnapshot.activeLayerIds ?? []),
    planningSnapshot.focusModeLabel ?? "",
    planningSnapshot.overviewCommandMode ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (planningSnapshot.overviewCommandMode === "modelLab") {
    return withSelectedParcelLegend(planningSnapshot, {
      caveat: "Relative research signal only. Not exact probability.",
      items: [
        {
          colorClassName: "border-orange-200/70 bg-orange-400",
          label: "Very Strong Research Signal",
        },
        {
          colorClassName: "border-amber-200/70 bg-amber-300",
          label: "Strong Research Signal",
        },
        {
          colorClassName: "border-cyan-100/70 bg-cyan-400",
          label: "Moderate Research Signal",
        },
        {
          colorClassName: "border-slate-300/50 bg-slate-500",
          label: "Lower Research Signal",
        },
        {
          colorClassName: "border-slate-400/40 bg-slate-700/60",
          label: "Insufficient Data",
        },
      ],
      title: "Development Research Signal",
    });
  }

  if (planningSnapshot.overviewCommandMode === "indicatorCenter") {
    return withSelectedParcelLegend(planningSnapshot, {
      caveat: "Attention flags and data-needed markers are planning review context only.",
      items: [
        {
          colorClassName: "border-[#d8b86a]/70 bg-[#d8b86a]",
          label: "Development activity attention flag",
        },
        {
          colorClassName: "border-[#68d8ff]/70 bg-[#68d8ff]",
          label: "Flood or infrastructure review flag",
        },
        {
          colorClassName: "border-amber-200/70 bg-amber-300",
          label: "Official data needed",
        },
        {
          colorClassName: "border-slate-300/50 bg-slate-500",
          label: "Internal research context",
        },
      ],
      title: "Indicator Center Flags",
    });
  }

  if (layerText.includes("fema") || layerText.includes("flood")) {
    return withSelectedParcelLegend(planningSnapshot, {
      items: [
        { colorClassName: "border-red-200/70 bg-red-500", label: "Floodway" },
        { colorClassName: "border-orange-200/70 bg-orange-400", label: "SFHA" },
        { colorClassName: "border-sky-100/70 bg-sky-400", label: "Moderate" },
        { colorClassName: "border-slate-300/50 bg-slate-500", label: "Minimal" },
      ],
      title: "FEMA Flood Context",
    });
  }

  if (layerText.includes("school")) {
    return withSelectedParcelLegend(planningSnapshot, {
      caveat: "School utilization values are seed/context data until official capacity is integrated.",
      items: [
        { colorClassName: "border-emerald-100/70 bg-emerald-400", label: "Under capacity" },
        { colorClassName: "border-amber-100/70 bg-amber-300", label: "Approaching capacity" },
        { colorClassName: "border-orange-100/70 bg-orange-400", label: "Over capacity" },
        { colorClassName: "border-red-100/70 bg-red-500", label: "Severely over capacity" },
      ],
      title: "School Utilization Seed",
    });
  }

  if (
    layerText.includes("development") ||
    layerText.includes("permit") ||
    layerText.includes("hotspot") ||
    layerText.includes("construction")
  ) {
    return withSelectedParcelLegend(planningSnapshot, {
      caveat: "Observed permit/development activity only. Not prediction.",
      items: [
        {
          colorClassName: "border-[#d8b86a]/70 bg-[#d8b86a]",
          label: "Development activity cluster",
        },
        {
          colorClassName: "border-[#68d8ff]/70 bg-[#68d8ff]",
          label: "Permit/development activity marker",
        },
        {
          colorClassName: "border-white/60 bg-white/60",
          label: "Marker count = records/parcels represented",
        },
      ],
      title: "Development Activity",
    });
  }

  return withSelectedParcelLegend(planningSnapshot, {
    items: [],
    message:
      "Active layers are listed below. No specialized legend was available for this snapshot.",
    title: "Active Layer Context",
  });
}

function withSelectedParcelLegend(
  planningSnapshot: PlanningSnapshot,
  legend: SnapshotLegend,
): SnapshotLegend {
  if (!planningSnapshot.selectedParcelId) {
    return legend;
  }

  return {
    ...legend,
    items: [
      ...legend.items,
      {
        colorClassName: "border-[#f6d98e] bg-transparent",
        label: "Selected parcel outline",
      },
    ],
  };
}

function SnapshotExecutiveSummary({
  extraSections = defaultExtraReportSections,
  onPrint,
  planningSnapshot,
  reportNotes = "",
  reportTitle = DEFAULT_EXECUTIVE_REPORT_TITLE,
  showExplanationCards = false,
}: {
  extraSections?: ReportSectionVisibility;
  onPrint: () => void;
  planningSnapshot: PlanningSnapshot;
  reportNotes?: string;
  reportTitle?: string;
  showExplanationCards?: boolean;
}) {
  const includedMetrics = planningSnapshot.explainableMetrics.filter(
    (metric) =>
      planningSnapshot.includedSections[
        metricSectionMap[metric.label] ?? "data_needed_caveats"
      ] ?? true,
  );
  const includedSectionLabels = (
    Object.keys(snapshotSectionLabels) as PlanningSnapshotSectionKey[]
  )
    .filter((sectionKey) => planningSnapshot.includedSections[sectionKey] ?? true)
    .map((sectionKey) =>
      sectionKey === "map_view"
        ? getVisualSnapshotSectionLabel(planningSnapshot)
        : snapshotSectionLabels[sectionKey],
    );
  const keyStatistics = buildExecutiveKeyStatistics(
    planningSnapshot,
    includedMetrics,
  );
  const recommendedActions = buildExecutiveRecommendedActions(planningSnapshot);
  const importantCaveats = buildExecutiveCaveats(planningSnapshot);
  const safeReportTitle =
    reportTitle.trim() || DEFAULT_EXECUTIVE_REPORT_TITLE;

  return (
    <div className="space-y-4">
      <section className="cfs-command-surface app-chrome no-print rounded-lg p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
              Executive Summary Preview
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              Executive Summary generated from Planning Snapshot
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              This report is generated from the saved snapshot and formatted
              for stakeholder discussion or printing. Printing hides
              interactive controls and app chrome.
            </p>
          </div>
          <ActionButton
            icon={<Printer className="h-3.5 w-3.5" />}
            label="Print Executive Summary"
            onClick={onPrint}
            variant="gold"
          />
        </div>
      </section>

      <article className="print-report rounded-lg border border-white/10 bg-white/[0.035] p-5 text-slate-100 print:border-0 print:bg-white print:p-0 print:text-slate-950">
        <header className="border-b border-white/10 pb-4 print:border-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff] print:text-slate-600">
            Cabarrus FutureScape
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white print:text-slate-950">
            {safeReportTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400 print:text-slate-700">
            Generated {formatDateTime(new Date().toISOString())}. Snapshot
            saved {formatDateTime(planningSnapshot.createdAt)}.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
            {getSnapshotContextLabel(planningSnapshot)}
            {planningSnapshot.selectedParcelId
              ? ` / Selected parcel ${planningSnapshot.selectedParcelId}`
              : " / No selected parcel captured"}
          </p>
          {reportNotes.trim() ? (
            <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-slate-300 print:border-slate-300 print:bg-white print:text-slate-700">
              {reportNotes.trim()}
            </p>
          ) : null}
        </header>

        {planningSnapshot.includedSections.map_view !== false ? (
          <ReportMapSnapshotSection
            planningSnapshot={planningSnapshot}
            showLegendAndNotes={extraSections.legend_map_notes}
          />
        ) : null}

        {extraSections.countywide_indicators ? (
          <ReportKeyStatisticsSection statistics={keyStatistics} />
        ) : null}

        {planningSnapshot.indicatorCenterContext &&
        planningSnapshot.includedSections.data_needed_caveats !== false ? (
          <ReportIndicatorCenterContextSection
            planningSnapshot={planningSnapshot}
            showExplanationCards={showExplanationCards}
          />
        ) : null}

        {planningSnapshot.developmentActivityContext &&
        planningSnapshot.includedSections.development_permits !== false ? (
          <ReportDevelopmentActivityContextSection
            planningSnapshot={planningSnapshot}
            showExplanationCards={showExplanationCards}
          />
        ) : null}

        {planningSnapshot.modelLabContext &&
        planningSnapshot.includedSections.model_governance !== false ? (
          <ReportModelResearchSection
            planningSnapshot={planningSnapshot}
            showExplanationCards={showExplanationCards}
          />
        ) : null}

        {planningSnapshot.includedSections.parcel_facts !== false ? (
          <section className="mt-5 grid gap-2 md:grid-cols-2 print:grid-cols-2">
            {planningSnapshot.selectedParcelSummary ? (
            <>
              <ReportFact
                label="Selected parcel"
                value={planningSnapshot.selectedParcelSummary.officialParcelId}
              />
              <ReportFact
                label="Owner / account"
                value={planningSnapshot.selectedParcelSummary.ownerOrAccount}
              />
              <ReportFact
                label="Address"
                value={planningSnapshot.selectedParcelSummary.address}
              />
              <ReportFact
                label="Zoning / jurisdiction"
                value={`${planningSnapshot.selectedParcelSummary.zoning} / ${planningSnapshot.selectedParcelSummary.planningJurisdiction}`}
              />
            </>
          ) : (
            <ReportFact
              label="Selected parcel"
              value="No parcel captured in this snapshot"
            />
          )}
            <ReportFact
              label="Active context"
              value={planningSnapshot.activeLayers.join(", ")}
            />
            <ReportFact
              label="Included sections"
              value={includedSectionLabels.join(", ")}
            />
          </section>
        ) : null}

        {showExplanationCards ? (
        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Explain the Numbers Appendix
          </h3>
          <div className="mt-3 grid gap-3">
            {includedMetrics.map((metric) => (
              <div
                className="rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white"
                key={`${metric.label}-summary`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-1 text-base font-semibold text-white print:text-slate-950">
                  {metric.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400 print:text-slate-700">
                  What it means: {metric.meaning}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
                  Source: {metric.source}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#f6d98e] print:text-slate-700">
                  Caveat: {metric.caveat}
                </p>
              </div>
            ))}
          </div>
        </section>
        ) : null}

        {planningSnapshot.includedSections.data_needed_caveats !== false ? (
          <section className="mt-6 rounded-md border border-[#d8b86a]/24 bg-[#d8b86a]/[0.06] p-3 print:border-slate-300 print:bg-white">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f6d98e] print:text-slate-700">
              Important caveats
            </h3>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300 print:text-slate-700">
              {importantCaveats.map((caveat) => (
                <li key={caveat}>- {caveat}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {planningSnapshot.includedSections.recommended_actions !== false ? (
          <section className="mt-6">
            <h3 className="text-lg font-semibold text-white print:text-slate-950">
              Recommended Actions
            </h3>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300 print:text-slate-700">
              {recommendedActions.map((action) => (
                <li key={action}>- {action}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <div className="no-print flex justify-end">
        <ActionButton
          icon={<Printer className="h-3.5 w-3.5" />}
          label="Print Report"
          onClick={onPrint}
          variant="gold"
        />
      </div>
    </div>
  );
}

function ReportIndicatorCenterContextSection({
  planningSnapshot,
  showExplanationCards,
}: {
  planningSnapshot: PlanningSnapshot;
  showExplanationCards: boolean;
}) {
  const context = planningSnapshot.indicatorCenterContext;

  if (!context) {
    return null;
  }

  const selected = context.selectedIndicator;
  const selectedGroupCount =
    context.selectedGroupIds?.length ?? context.availableGroups.length;
  const indicatorSummaries = context.indicatorSummaries ?? [];
  const displayModeLabel = context.displayMode
    ? getIndicatorCenterDisplayModeLabel(context.displayMode)
    : "All indicators";
  const summaryValue = indicatorSummaries.length
    ? indicatorSummaries
        .slice(0, 4)
        .map((summary) => `${summary.name}: ${summary.value}`)
        .join(" / ")
    : context.availableGroups.slice(0, 4).join(" / ");

  return (
    <section className="mt-5 rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] p-3 print:border-slate-300 print:bg-white">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Indicator Center Context
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-300 print:text-slate-700">
            Monitoring dashboard context from existing CFS signals. Not an
            official determination.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-md border border-[#68d8ff]/24 bg-[#68d8ff]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b7f0ff] print:border-slate-300 print:bg-white print:text-slate-700">
          Review indicators
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        <ReportFact
          label="Selected indicator"
          value={selected ? selected.name : "No specific indicator selected"}
        />
        <ReportFact
          label="Status"
          value={selected ? selected.status : "Review groups available"}
        />
        <ReportFact
          label="Dashboard posture"
          value={`${selectedGroupCount} groups / ${displayModeLabel}`}
        />
        <ReportFact
          label="Captured summaries"
          value={summaryValue}
        />
        <ReportFact
          label="Recommended follow-up"
          value={context.recommendedFollowUp}
        />
      </div>

      {selected && showExplanationCards ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
          <ReportFact label="Category" value={selected.category} />
          <ReportFact label="What it means" value={selected.whatItMeans} />
          <ReportFact label="Source" value={selected.source} />
          <ReportFact
            label="Data used"
            value={selected.dataUsed?.join(" / ") ?? selected.source}
          />
          <ReportFact label="Caveat" value={selected.caveat} />
        </div>
      ) : null}

      {showExplanationCards ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
          <ReportFact
            label="How to use"
            value="Use Indicator Center to choose which existing CFS evidence or missing official datasets need follow-up review."
          />
          <ReportFact
            label="What it is not"
            value="It is not an official risk score, prediction, or parcel development probability."
          />
        </div>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-[#f6d98e] print:text-slate-700">
        {context.caveat}
      </p>
    </section>
  );
}

function ReportDevelopmentActivityContextSection({
  planningSnapshot,
  showExplanationCards,
}: {
  planningSnapshot: PlanningSnapshot;
  showExplanationCards: boolean;
}) {
  const context = planningSnapshot.developmentActivityContext;

  if (!context) {
    return null;
  }

  const topDrivers = context.topDrivers?.length
    ? context.topDrivers
    : ["Observed permit/development activity"];
  const segmentMix = formatDevelopmentActivityContextSegmentMix(context);

  return (
    <section className="mt-5 rounded-md border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] p-3 print:border-slate-300 print:bg-white">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Development Activity Context
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-300 print:text-slate-700">
            Development Hotspots context is included because a countywide
            activity cluster or feature was selected when this snapshot was
            saved.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-md border border-[#68d8ff]/24 bg-[#68d8ff]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b7f0ff] print:border-slate-300 print:bg-white print:text-slate-700">
          Observed activity only
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        <ReportFact
          label={getDevelopmentActivityContextReportTitle(context)}
          value={context.areaLabel}
        />
        <ReportFact
          label="Records represented"
          value={formatDevelopmentCount(context.recordsRepresented)}
        />
        <ReportFact
          label="Parcels represented"
          value={
            context.parcelsRepresented === 1
              ? "1 parcel represented"
              : `${formatDevelopmentCount(context.parcelsRepresented)} parcels represented`
          }
        />
        <ReportFact
          label="Dominant segment"
          value={formatDevelopmentLabel(
            context.dominantPermitSegment ?? context.selectedPermitSegment,
          )}
        />
        <ReportFact
          label="Activity type"
          value={formatDevelopmentLabel(context.dominantActivityType)}
        />
        <ReportFact
          label="Recent context"
          value={context.latestActivityLabel ?? "Recent activity unavailable"}
        />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        <ReportFact
          label="Top drivers"
          value={topDrivers.join(" / ")}
        />
        <ReportFact label="Why highlighted" value={context.whyHighlighted} />
        {segmentMix ? (
          <ReportFact label="Segment mix" value={segmentMix} />
        ) : null}
        <ReportFact
          label="Staff follow-up"
          value="Review underlying permit records before formal planning decisions."
        />
      </div>

      {showExplanationCards ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
          <ReportFact
            label="What it means"
            value="This section summarizes observed permit/development activity concentration from the selected Development Hotspots map feature."
          />
          <ReportFact
            label="Source"
            value="Permit and development activity tables joined to map-safe countywide layer records."
          />
          <ReportFact
            label="Map display"
            value={formatDevelopmentLabel(context.displayMode)}
          />
          <ReportFact
            label="Caveat"
            value="Observed permit/development activity only. Not a prediction."
          />
        </div>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-[#f6d98e] print:text-slate-700">
        {context.caveat} Review underlying permit records before formal
        planning decisions.
      </p>
    </section>
  );
}

function ReportModelResearchSection({
  planningSnapshot,
  showExplanationCards,
}: {
  planningSnapshot: PlanningSnapshot;
  showExplanationCards: boolean;
}) {
  const context = planningSnapshot.modelLabContext?.selectedResearchContext;
  const topDrivers = context?.topDrivers?.length
    ? context.topDrivers
    : modelResearchDriverSources;
  const signalBand = context
    ? context.dominantResearchBand ??
      formatRelativeDevelopmentSignalBand({
          rankBand: context.researchRankBand,
          signalLabel: context.researchSignalLabel,
        })
    : "No marker selected";
  const rankBand = context
    ? formatModelResearchBandLabel(context.researchRankBand)
    : "No relative rank band selected";
  const contextLabel = context
    ? getModelResearchReportContextLabel(context)
    : "Aggregate model context only";
  const contextIsCluster =
    context?.contextKind === "cluster" || context?.contextKind === "heatmap_cell";
  const bandDistribution = context?.bandCounts
    ? formatModelResearchReportBandDistribution(context.bandCounts)
    : null;
  const whyHighlighted = context
    ? `This area is highlighted because its parcel context resembles places where new construction occurred historically, using ${topDrivers
        .slice(0, 3)
        .map((driver) => formatModelResearchDriverLabel(driver).toLowerCase())
        .join(", ")}.`
    : "No individual research marker was selected when the snapshot was saved; the section documents aggregate Model Lab context only.";

  return (
    <section className="mt-5 rounded-md border border-[#d8b86a]/24 bg-[#d8b86a]/[0.06] p-3 print:border-slate-300 print:bg-white">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Development Model Research Context
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-300 print:text-slate-700">
            Model Lab context is included because this snapshot was saved from
            internal model research mode.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-md border border-[#d8b86a]/28 bg-[#d8b86a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6d98e] print:border-slate-300 print:bg-white print:text-slate-700">
          Internal research only
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        <ReportFact
          label="Current best internal model"
          value={developmentModelLabSummary.currentBestInternalVariant}
        />
        <ReportFact label="Relative signal band" value={signalBand} />
        <ReportFact
          label="What the band means"
          value={getModelResearchBandMeaning(signalBand)}
        />
        <ReportFact
          label={context ? getModelResearchReportContextTitle(context) : "Selected context"}
          value={contextLabel}
        />
        {contextIsCluster ? (
          <>
            <ReportFact
              label="Parcels represented"
              value={formatModelResearchReportRepresentedCount(
                context.representedFeatureCount ?? 1,
              )}
            />
            {bandDistribution ? (
              <ReportFact
                label="Band distribution"
                value={bandDistribution}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        <ReportFact label="Why highlighted" value={whyHighlighted} />
        <ReportFact
          label="What it does not mean"
          value="This is not an exact parcel development probability, official parcel score, entitlement decision, or statement that development will occur."
        />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Top drivers / source context
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300 print:text-slate-700">
          {topDrivers.map((driver) => (
            <li key={driver}>
              - {formatModelResearchDriverLabel(driver)}:{" "}
              {getModelResearchDriverExplanation(driver)}
            </li>
          ))}
        </ul>
      </div>

      {showExplanationCards ? (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
            <ReportFact label="Source rank band" value={rankBand} />
            <ReportFact
              label="Overlay status"
              value={
                planningSnapshot.modelLabContext?.overlayEnabled
                  ? "Development Research Signal active"
                  : "Development Research Signal off"
              }
            />
            <ReportFact
              label="Map display"
              value={
                planningSnapshot.modelLabContext?.displayModeLabel ??
                "Model Lab display not captured"
              }
            />
            <ReportFact
              label="How signal is calculated"
              value="CFS compares parcel-year context such as zoning, transportation access, and tax/value patterns against historical new construction permit outcomes, then shows relative research bands instead of exact probabilities."
            />
          </div>
          <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Missing data needed
            </p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300 print:text-slate-700">
              {developmentModelLabSummary.whyNotPublicFacing.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-[#f6d98e] print:text-slate-700">
        {contextIsCluster
          ? "This Model Lab snapshot summarizes a relative research cluster. It does not show exact parcel development probability and is not an official parcel score."
          : "This is an internal research preview. It does not show exact parcel development probability and is not an official parcel score."}
      </p>
    </section>
  );
}

function getDevelopmentActivityContextReportTitle(
  context: NonNullable<PlanningSnapshot["developmentActivityContext"]>,
) {
  if (context.contextKind === "cluster" && context.parcelsRepresented > 1) {
    return "Selected activity cluster";
  }

  return "Selected activity feature";
}

function formatDevelopmentActivityContextSegmentMix(
  context: NonNullable<PlanningSnapshot["developmentActivityContext"]>,
) {
  const counts = context.segmentCounts;

  if (!counts) {
    return null;
  }

  return [
    ["Residential", counts.residentialGrowth],
    ["Commercial", counts.commercialActivity],
    ["Industrial", counts.industrialActivity],
    ["Institutional", counts.institutionalActivity],
    ["Redevelopment", counts.redevelopmentSignal],
    ["Minor", counts.minorMaintenance],
    ["Demolition", counts.demolition],
    ["Other", counts.administrativeOrUnknown],
  ]
    .filter(([, count]) => Number(count) > 0)
    .slice(0, 5)
    .map(([label, count]) => `${label}: ${formatDevelopmentCount(Number(count))}`)
    .join(" / ");
}

function getModelResearchReportContextLabel(
  context: NonNullable<
    NonNullable<PlanningSnapshot["modelLabContext"]>["selectedResearchContext"]
  >,
) {
  const representedCount = context.representedFeatureCount ?? 1;
  const safeAreaLabel =
    context.approximateAreaLabel &&
    !context.approximateAreaLabel.includes(["1", "parcels"].join(" "))
      ? context.approximateAreaLabel
      : null;

  if (context.contextKind === "heatmap_cell") {
    return (
      safeAreaLabel ??
      (representedCount === 1
        ? "Single research feature in countywide heatmap cell"
        : `${formatDevelopmentCount(
            representedCount,
          )} research records in a countywide heatmap cell`)
    );
  }

  if (context.contextKind === "cluster") {
    return (
      safeAreaLabel ??
      (representedCount === 1
        ? "Single research feature"
        : `${formatDevelopmentCount(representedCount)} research records in a cluster`)
    );
  }

  return context.officialParcelId;
}

function getModelResearchReportContextTitle(
  context: NonNullable<
    NonNullable<PlanningSnapshot["modelLabContext"]>["selectedResearchContext"]
  >,
) {
  const representedCount = context.representedFeatureCount ?? 1;

  if (
    representedCount === 1 ||
    (context.contextKind !== "cluster" &&
      context.contextKind !== "heatmap_cell")
  ) {
    return "Selected research feature";
  }

  return "Selected research cluster";
}

function formatModelResearchReportRepresentedCount(count: number) {
  return count === 1
    ? "1 parcel represented"
    : `${formatDevelopmentCount(count)} parcels represented`;
}

function formatModelResearchReportBandDistribution(
  counts: NonNullable<
    NonNullable<
      NonNullable<PlanningSnapshot["modelLabContext"]>["selectedResearchContext"]
    >["bandCounts"]
  >,
) {
  return [
    ["Very Strong", counts.veryStrong],
    ["Strong", counts.strong],
    ["Moderate", counts.moderate],
    ["Lower", counts.lower],
    ["Insufficient", counts.insufficient],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label}: ${formatDevelopmentCount(Number(count))}`)
    .join(" / ");
}

interface ExecutiveReportStat {
  caveat?: string;
  label: string;
  value: string;
}

function ReportKeyStatisticsSection({
  statistics,
}: {
  statistics: ExecutiveReportStat[];
}) {
  return (
    <section className="mt-5 rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Key Statistics
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
            Concise snapshot indicators selected for executive review.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-md border border-[#d8b86a]/28 bg-[#d8b86a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6d98e] print:border-slate-300 print:bg-white print:text-slate-700">
          Report-ready
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        {statistics.map((stat) => (
          <ReportFact
            key={`stat-${stat.label}`}
            label={stat.label}
            value={`${stat.value}${stat.caveat ? ` / ${stat.caveat}` : ""}`}
          />
        ))}
      </div>
    </section>
  );
}

function buildExecutiveKeyStatistics(
  planningSnapshot: PlanningSnapshot,
  includedMetrics: PlanningSnapshot["explainableMetrics"],
): ExecutiveReportStat[] {
  if (planningSnapshot.overviewCommandMode === "modelLab") {
    const researchContext =
      planningSnapshot.modelLabContext?.selectedResearchContext;

    return trimReportStats([
      {
        label: "Snapshot type",
        value: "Model Lab Research Snapshot",
      },
      {
        caveat: "Relative research context only.",
        label: "Map display",
        value: planningSnapshot.modelLabContext?.displayModeLabel ??
          "Model Lab context",
      },
      {
        caveat: "Not an official parcel score.",
        label: "Selected research band",
        value: researchContext
          ? researchContext.dominantResearchBand ??
            formatRelativeDevelopmentSignalBand({
              rankBand: researchContext.researchRankBand,
              signalLabel: researchContext.researchSignalLabel,
            })
          : "No selected research feature",
      },
      {
        label: "Parcels represented",
        value: researchContext?.representedFeatureCount
          ? formatDevelopmentCount(researchContext.representedFeatureCount)
          : "Not selected",
      },
      {
        caveat: "Internal research only.",
        label: "Current best internal model",
        value: developmentModelLabSummary.currentBestInternalVariant,
      },
      {
        caveat: "Exact probabilities are not shown.",
        label: "Model status",
        value: "Internal research only",
      },
    ]);
  }

  if (planningSnapshot.overviewCommandMode === "indicatorCenter") {
    const indicatorContext = planningSnapshot.indicatorCenterContext;
    const selected = indicatorContext?.selectedIndicator;
    const displayModeLabel = indicatorContext?.displayMode
      ? getIndicatorCenterDisplayModeLabel(indicatorContext.displayMode)
      : "All indicators";

    return trimReportStats([
      {
        label: "Snapshot type",
        value: "Indicator Center Snapshot",
      },
      {
        caveat: "Planning review indicators only.",
        label: "Selected indicator",
        value: selected ? selected.name : "No specific indicator selected",
      },
      {
        label: "Indicator status",
        value: selected
          ? selected.status
          : `${indicatorContext?.selectedGroupIds?.length ?? indicatorContext?.availableGroups.length ?? 0} groups enabled`,
      },
      {
        label: "Dashboard posture",
        value: displayModeLabel,
      },
      {
        label: "Captured summaries",
        value: `${indicatorContext?.indicatorSummaries?.length ?? 0} cards`,
      },
      {
        caveat: "Not an official determination.",
        label: "Indicator caveat",
        value:
          selected?.caveat ??
          "Attention flags and data gaps use existing CFS context only.",
      },
      {
        caveat: "No fake values shown.",
        label: "Data posture",
        value: "Existing CFS data only",
      },
    ]);
  }

  if (planningSnapshot.selectedParcelSummary) {
    return trimReportStats([
      {
        label: "Parcel ID",
        value: planningSnapshot.selectedParcelSummary.officialParcelId,
      },
      {
        caveat: "Zoning is planning context, not entitlement.",
        label: "Zoning",
        value: planningSnapshot.selectedParcelSummary.zoning,
      },
      findMetricStat(includedMetrics, "Flood Review Status", "Flood status"),
      findMetricStat(includedMetrics, "School Assignment", "Schools"),
      findMetricStat(
        includedMetrics,
        "Development Activity",
        "Development activity",
      ),
      findMetricStat(includedMetrics, "Utility Proxy", "Utility proxy"),
      findMetricStat(
        includedMetrics,
        "Transportation Context",
        "Transportation",
      ),
      {
        caveat: "No parcel probability is shown.",
        label: "Model status",
        value: "Internal only",
      },
    ]);
  }

  return trimReportStats([
    {
      label: "Snapshot type",
      value: getSnapshotContextLabel(planningSnapshot),
    },
    getOverviewKpiStat(planningSnapshot, "Selected Parcel") ?? {
      label: "Selected parcel",
      value: "No parcel captured",
    },
    getOverviewKpiStat(planningSnapshot, "Active Context") ?? {
      label: "Active layers",
      value: planningSnapshot.activeLayers.join(", "),
      caveat: "Active layers are report context only.",
    },
    findMetricStat(includedMetrics, "Development Activity", "Development activity"),
    findMetricStat(includedMetrics, "Flood Review Status", "Flood review"),
    findMetricStat(includedMetrics, "School Assignment", "Schools"),
    {
      caveat: "No public parcel prediction output.",
      label: "Model status",
      value: "Internal only",
    },
  ]);
}

function trimReportStats(stats: Array<ExecutiveReportStat | null | undefined>) {
  return stats
    .filter((stat): stat is ExecutiveReportStat => Boolean(stat))
    .slice(0, 8);
}

function findMetricStat(
  metrics: PlanningSnapshot["explainableMetrics"],
  metricLabel: string,
  label: string,
): ExecutiveReportStat | null {
  const metric = metrics.find((candidate) => candidate.label === metricLabel);

  if (!metric) {
    return null;
  }

  return {
    caveat: metric.caveat,
    label,
    value: metric.value,
  };
}

function getOverviewKpiStat(
  planningSnapshot: PlanningSnapshot,
  label: string,
): ExecutiveReportStat | null {
  const metric = planningSnapshot.overviewKpis.find(
    (candidate) => candidate.label === label,
  );

  if (!metric) {
    return null;
  }

  return {
    caveat: metric.caveat,
    label: metric.label,
    value: metric.value,
  };
}

function buildExecutiveRecommendedActions(
  planningSnapshot: PlanningSnapshot,
): string[] {
  const actions = [
    "Use this snapshot as visual planning context, not an official record.",
  ];

  if (!planningSnapshot.selectedParcelId) {
    actions.push("Select a parcel before using parcel-specific findings.");
  }

  if (
    planningSnapshot.activeLayers.some((layer) =>
      layer.toLowerCase().includes("flood"),
    )
  ) {
    actions.push(
      "Confirm FEMA flood requirements if parcel flood review is needed.",
    );
  }

  actions.push("Request official school capacity/enrollment data.");
  actions.push(
    "Confirm utility capacity with WSACC before relying on utility readiness.",
  );

  if (planningSnapshot.modelLabContext) {
    actions.push(
      "Treat model research signal as internal research only.",
    );
  }

  if (planningSnapshot.developmentActivityContext) {
    actions.push(
      "Review underlying permit records before formal planning decisions.",
    );
  }

  if (planningSnapshot.indicatorCenterContext) {
    actions.push(
      planningSnapshot.indicatorCenterContext.recommendedFollowUp,
    );
  }

  return [...new Set(actions)].slice(0, 6);
}

function buildExecutiveCaveats(planningSnapshot: PlanningSnapshot): string[] {
  return [
    "Snapshot is a saved review context, not a new official record.",
    "FEMA NFHL remains authoritative for regulatory flood context.",
    "Utility proxy does not confirm capacity.",
    "Preliminary school utilization requires official enrollment/capacity verification.",
    "Internal model research does not show exact probabilities or official parcel scores.",
    ...(planningSnapshot.developmentActivityContext
      ? ["Development Hotspots show observed permit/development activity only, not prediction."]
      : []),
    ...(planningSnapshot.indicatorCenterContext
      ? ["Indicator Center flags are monitoring indicators, not official determinations."]
      : []),
  ].slice(0, 6);
}

function ReportMapSnapshotSection({
  planningSnapshot,
  showLegendAndNotes = true,
}: {
  planningSnapshot: PlanningSnapshot;
  showLegendAndNotes?: boolean;
}) {
  if (isIndicatorDashboardSnapshot(planningSnapshot)) {
    const captured = hasCapturedDashboardImage(planningSnapshot);
    const capturedAt =
      planningSnapshot.dashboardImageCapturedAt ?? planningSnapshot.createdAt;

    return (
      <section className="mt-5 break-inside-avoid rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
        <h3 className="text-lg font-semibold text-white print:text-slate-950">
          Indicator Center Dashboard Snapshot
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
          {captured
            ? `Critical Signals and Monitoring Charts captured from Indicator Center at ${formatDateTime(
                capturedAt,
              )}.`
            : "Dashboard snapshot unavailable for this Indicator Center report."}
        </p>
        <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814] print:border-slate-300 print:bg-white">
          {captured && planningSnapshot.dashboardImageDataUrl ? (
            <Image
              alt={
                planningSnapshot.dashboardImageAlt ??
                "Indicator Center dashboard snapshot"
              }
              className="h-auto max-h-[46rem] w-full object-contain print:max-h-[8.2in]"
              height={720}
              src={planningSnapshot.dashboardImageDataUrl}
              unoptimized
              width={1280}
            />
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-5 text-center print:min-h-24">
              <BarChart3 className="h-5 w-5 text-slate-500" />
              <p className="text-sm font-semibold text-slate-200 print:text-slate-800">
                Dashboard snapshot unavailable
              </p>
              <p className="max-w-xl text-xs leading-5 text-slate-500 print:text-slate-700">
                {planningSnapshot.dashboardImageFailureReason ??
                  "Indicator Center is map-free. Dashboard image capture failed or was not available."}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3 print:grid-cols-3">
          <ReportFact label="Visual type" value="Dashboard" />
          <ReportFact
            label="Captured sections"
            value={(planningSnapshot.capturedSections?.length
              ? planningSnapshot.capturedSections
              : ["critical_signals", "monitoring_charts"]
            )
              .map(formatDashboardCapturedSection)
              .join(", ")}
          />
          <ReportFact
            label="Snapshot context"
            value={planningSnapshot.focusModeLabel ?? "Indicator Center"}
          />
        </div>
      </section>
    );
  }

  const captured =
    planningSnapshot.mapScreenshotStatus === "captured" &&
    Boolean(planningSnapshot.mapScreenshotDataUrl);
  const capturedAt =
    planningSnapshot.mapScreenshotCapturedAt ?? planningSnapshot.createdAt;
  const legend = getSnapshotMapLegend(planningSnapshot);

  return (
    <section className="mt-5 rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
      <h3 className="text-lg font-semibold text-white print:text-slate-950">
        Map View
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
        {captured
          ? `Map snapshot captured from CFS Overview at ${formatDateTime(
              capturedAt,
            )}.`
          : "Map snapshot unavailable for this report."}
      </p>
      <div className="relative mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814] print:border-slate-300 print:bg-white">
        {captured && planningSnapshot.mapScreenshotDataUrl ? (
          <Image
            alt="Captured CFS map snapshot for executive summary"
            className="h-auto w-full"
            height={540}
            src={planningSnapshot.mapScreenshotDataUrl}
            unoptimized
            width={960}
          />
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-5 text-center print:min-h-24">
            <MapPinned className="h-5 w-5 text-slate-500" />
            <p className="text-sm font-semibold text-slate-200 print:text-slate-800">
              Map snapshot unavailable
            </p>
            <p className="max-w-xl text-xs leading-5 text-slate-500 print:text-slate-700">
              {planningSnapshot.mapScreenshotFailureReason ??
                "SceneView did not provide an image when this snapshot was saved."}
            </p>
          </div>
        )}
        <NorthArrow />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 print:grid-cols-3">
        <ReportFact
          label="Snapshot context"
          value={planningSnapshot.focusModeLabel ?? "Planning Snapshot"}
        />
        <ReportFact
          label="Active layers"
          value={planningSnapshot.activeLayers.join(", ")}
        />
        <ReportFact
          label="Selected parcel"
          value={planningSnapshot.selectedParcelId ?? "No parcel captured"}
        />
      </div>
      {showLegendAndNotes ? (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] print:grid-cols-[minmax(0,1fr)_14rem]">
          <MapLegendPanel legend={legend} />
          <div className="rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
              Scale note
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400 print:text-slate-700">
              Scale is approximate; 3D scene perspective affects distance.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReportFact({ label, value }: ReviewFact) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-200 print:text-slate-900">
        {value || "Not Available"}
      </p>
    </div>
  );
}

function SnapshotReviewActionsPanel({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  const actions = [
    "Confirm zoning and jurisdiction context against official source records.",
    "Review FEMA flood constraints during formal review if the snapshot is flagged.",
    "Confirm school enrollment and capacity when official data is received.",
    "Confirm utility capacity and service readiness with WSACC or the relevant provider.",
    "Review official rezoning records and development pipeline/subdivision approvals when available.",
    "Keep internal model research as aggregate governance context only; do not use it as a parcel-level prediction.",
  ];

  return (
    <div className="space-y-4">
      <SnapshotOverviewPanel planningSnapshot={planningSnapshot} />
      <ReviewSection
        caveat="These are staff review prompts from saved snapshot context. They are not automated entitlement or development decisions."
        facts={actions.map((action, index) => ({
          label: `Action ${index + 1}`,
          value: action,
        }))}
        icon={CheckCircle2}
        status={{ label: "Planner Follow-Up", tone: "info" }}
        summary="Recommended follow-up steps for turning the saved snapshot into a stronger staff review package."
        title="Review Actions"
      />
    </div>
  );
}

function ReviewSection({
  caveat,
  detail,
  facts,
  icon: Icon,
  status,
  summary,
  title,
}: {
  caveat?: string;
  detail?: ReactNode;
  facts: ReviewFact[];
  icon: LucideIcon;
  status: ReviewBadge;
  summary: string;
  title: string;
}) {
  const visibleFacts = facts.filter(
    (fact) => fact.value && !isNotAvailableValue(fact.value),
  );
  const displayedFacts = visibleFacts.length ? visibleFacts : facts;

  return (
    <section className="rounded-lg border border-white/10 bg-[#07111f]/78 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/20 bg-[#68d8ff]/[0.08] text-[#8fe7ff]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 text-white">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">{summary}</p>
          </div>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>

      <div className="mt-4 grid gap-2">
        {displayedFacts.map((fact) => (
          <ReviewFactItem key={`${title}-${fact.label}`} {...fact} />
        ))}
      </div>

      {caveat ? (
        <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
          {caveat}
        </p>
      ) : null}

      {detail ? (
        <details className="mt-3 rounded-md border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Expand details
          </summary>
          <div className="mt-3">{detail}</div>
        </details>
      ) : null}
    </section>
  );
}

function ReviewGroupIntro({
  eyebrow,
  summary,
  title,
}: {
  eyebrow: string;
  summary: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[#68d8ff]/16 bg-black/18 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
        {summary}
      </p>
    </section>
  );
}

function HeaderFact({ label, value }: ReviewFact) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-100">
        {value || "Not Available"}
      </p>
    </div>
  );
}

function ReviewFactItem({ label, value }: ReviewFact) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-slate-200">
        {value || "Not Available"}
      </p>
    </div>
  );
}

function StatusBadge({ label, tone }: ReviewBadge) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-md border px-2.5 py-1 text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.12em]",
        tone === "positive" &&
          "border-[#55d38f]/25 bg-[#55d38f]/10 text-[#9ff0bd]",
        tone === "info" &&
          "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#b7f0ff]",
        tone === "review" &&
          "border-[#ff8d7a]/28 bg-[#ff8d7a]/10 text-[#ffc1b6]",
        tone === "caution" &&
          "border-[#d8b86a]/28 bg-[#d8b86a]/10 text-[#f6d98e]",
        tone === "neutral" &&
          "border-white/10 bg-white/[0.04] text-slate-300",
      )}
    >
      {label}
    </span>
  );
}

function PriorityFlagsPanel({ flags }: { flags: PriorityFlag[] }) {
  return (
    <section className="rounded-lg border border-[#d8b86a]/22 bg-[#0d1320]/90 p-4 shadow-[0_16px_54px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f6d98e]">
            <ShieldIcon />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 text-white">
              2. High-Priority Review Flags
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Fast readout of the items staff should notice before reading the
              detailed domain cards.
            </p>
          </div>
        </div>
        <StatusBadge label="Review Triage" tone="caution" />
      </div>

      <div className="mt-4 grid gap-2">
        {flags.map((flag) => (
          <PriorityFlagCard flag={flag} key={flag.title} />
        ))}
      </div>
    </section>
  );
}

function PriorityFlagCard({ flag }: { flag: PriorityFlag }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-slate-100">
            {flag.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {flag.description}
          </p>
        </div>
        <StatusBadge label={flag.label} tone={flag.tone} />
      </div>
    </div>
  );
}

function ShieldIcon() {
  return <CheckCircle2 className="h-4 w-4" />;
}

function ActionButton({
  active = false,
  icon,
  label,
  onClick,
  variant = "default",
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "gold";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition",
        variant === "gold"
          ? "border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f6d98e] hover:border-[#d8b86a]/55 hover:bg-[#d8b86a]/15"
          : active
            ? "border-[#68d8ff]/35 bg-[#68d8ff]/10 text-[#dff8ff] shadow-[0_0_22px_rgba(104,216,255,0.12)]"
            : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-[#d8b86a]/35 hover:bg-[#d8b86a]/10 hover:text-[#f0cd79]",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function buildHeaderBadges({
  activity,
  flood,
  parcel,
  schoolConstraint,
}: {
  activity: ReturnType<typeof useSelectedParcelDevelopmentActivity>["activity"];
  flood: ReturnType<typeof useSelectedParcelFloodConstraint>["constraint"];
  parcel: ParcelSearchRecord;
  schoolConstraint: ReturnType<typeof useSelectedParcelSchoolConstraint>;
}): ReviewBadge[] {
  return [
    {
      label: parcel.zoningCode ? "Zoning Available" : "Zoning Review Needed",
      tone: parcel.zoningCode ? "positive" : "review",
    },
    {
      label: flood?.flood_review_required ? "Flood Review" : "Flood Not Flagged",
      tone: flood?.flood_review_required ? "review" : "positive",
    },
    {
      label: schoolConstraint.assignments.some((assignment) => !assignment.hasAssignment)
        ? "School Review Needed"
        : "School Assignment",
      tone: schoolConstraint.assignments.some((assignment) => !assignment.hasAssignment)
        ? "review"
        : "info",
    },
    {
      label: activity?.total_permit_count
        ? "Development Activity"
        : "No Recent Activity",
      tone: activity?.total_permit_count ? "info" : "neutral",
    },
    {
      label: "Capacity Data Needed",
      tone: "caution",
    },
  ];
}

function buildPriorityFlags({
  activity,
  flood,
  modelResearch,
  parcel,
  schoolConstraint,
}: {
  activity: ReturnType<typeof useSelectedParcelDevelopmentActivity>["activity"];
  flood: ReturnType<typeof useSelectedParcelFloodConstraint>["constraint"];
  modelResearch: ReturnType<typeof useDevelopmentPredictionResearchStatus>;
  parcel: ParcelSearchRecord;
  schoolConstraint: ReturnType<typeof useSelectedParcelSchoolConstraint>;
}): PriorityFlag[] {
  return [
    {
      description: parcel.zoningCode
        ? `${parcel.zoningCode} is available from the current zoning context. Confirm official case history separately when needed.`
        : "Current zoning code is not available in the selected parcel record.",
      label: parcel.zoningCode ? "Data Available" : "Review Required",
      title: "Planning and zoning",
      tone: parcel.zoningCode ? "positive" : "review",
    },
    {
      description: flood?.flood_review_required
        ? "FEMA flood overlay flags this parcel for engineering review."
        : flood
          ? "FEMA flood overlay does not flag this parcel for review."
          : "FEMA flood overlay is still loading or not available.",
      label: flood?.flood_review_required ? "Review Required" : flood ? "Not Flagged" : "Not Available",
      title: "Flood review",
      tone: flood?.flood_review_required ? "review" : flood ? "positive" : "neutral",
    },
    {
      description: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "One or more school levels need assignment QA or are outside CCS V1 scope."
        : "Attendance-zone assignments are available; official capacity data is still needed.",
      label: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "Review Required"
        : "Capacity Data Needed",
      title: "School assignment and capacity",
      tone: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "review"
        : "caution",
    },
    {
      description: activity?.total_permit_count
        ? "Observed permit activity exists for this parcel. Review permit timeline before drawing planning conclusions."
        : "No matched activity summary is available in the current selected-parcel context.",
      label: activity?.total_permit_count ? "Data Available" : "Not Available",
      title: "Development activity",
      tone: activity?.total_permit_count ? "info" : "neutral",
    },
    {
      description:
        "Utility layers are proximity/service-context proxies only and do not confirm available capacity.",
      label: "Official Data Needed",
      title: "Utility capacity",
      tone: "caution",
    },
    {
      description: modelResearch.rankingSummary.production_ready
        ? "Unexpected model readiness state. Review governance outputs before demo."
        : "Model research remains aggregate/internal only; no parcel-level model output is exposed.",
      label: "Internal Research Only",
      title: "Model research",
      tone: "caution",
    },
  ];
}

function buildReviewActions({
  activity,
  flood,
  schoolConstraint,
}: {
  activity: ReturnType<typeof useSelectedParcelDevelopmentActivity>["activity"];
  flood: ReturnType<typeof useSelectedParcelFloodConstraint>["constraint"];
  schoolConstraint: ReturnType<typeof useSelectedParcelSchoolConstraint>;
}) {
  const actions = ["Review zoning and jurisdiction context."];

  if (flood?.flood_review_required) {
    actions.push("Confirm FEMA flood constraints and engineering review path.");
  }

  if (activity?.total_permit_count) {
    actions.push("Review recent development and permit activity.");
  } else {
    actions.push("Confirm whether recent permit activity is expected to be absent.");
  }

  if (schoolConstraint.assignments.some((assignment) => !assignment.hasAssignment)) {
    actions.push("Review school assignment gaps caused by CCS-only V1 scope or QA flags.");
  }

  actions.push("Confirm school capacity data when official enrollment/capacity is available.");
  actions.push("Confirm utility capacity/service readiness with WSACC if development potential is being evaluated.");
  actions.push("Review official rezoning records when available.");

  return actions;
}

function formatOptionalCurrency(value: number | null | undefined) {
  return typeof value === "number" ? formatCurrency(value) : "Not Available";
}

function formatOptionalCount(value: number | null | undefined) {
  return typeof value === "number" ? formatDevelopmentCount(value) : "Not Available";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not Available";
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Not Available";
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function yesNo(value: boolean | null | undefined) {
  if (typeof value !== "boolean") {
    return "Not Available";
  }

  return value ? "Yes" : "No";
}

function loadingOrUnavailable(source: string) {
  return source === "loading" ? "Loading" : "Not Available";
}

function formatModelVariant(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return "Zoning + Transportation + Tax/Value";
  }

  if (
    normalized === "zoning_transportation_tax_value" ||
    normalized === "Zoning + Transportation + Tax/Value"
  ) {
    return "Zoning + Transportation + Tax/Value";
  }

  return formatLabel(normalized);
}

function formatModelResearchBandLabel(value: string | null | undefined) {
  switch (value) {
    case "top_1_percent_research_band":
    case "top_5_percent_research_band":
      return "Very Strong Research Signal";
    case "top_15_percent_research_band":
      return "Strong Research Signal";
    case "remaining_research_band":
      return "Lower Research Signal";
    case "insufficient_data":
      return "Insufficient Data";
    default:
      return "No relative rank band selected";
  }
}

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "Not Available";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isNotAvailableValue(value: string) {
  return value === "Unavailable" || value === "Not Available";
}
