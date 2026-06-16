"use client";

import Image from "next/image";
import {
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FileText,
  History,
  MapPinned,
  Printer,
  Route,
  School,
  TrafficCone,
  Trash2,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
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
  PlanningSnapshotView,
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

const planningSnapshotTabs: Array<{
  description: string;
  id: PlanningSnapshotView;
  label: string;
}> = [
  {
    description: "Captured parcel, layer, and caveat context.",
    id: "overview",
    label: "Snapshot Overview",
  },
  {
    description: "Plain-English source, method, and caveat cards.",
    id: "explain",
    label: "Explain the Numbers",
  },
  {
    description: "Snapshot-based stakeholder report preview.",
    id: "summary",
    label: "Executive Summary",
  },
  {
    description: "Planner follow-up guidance.",
    id: "actions",
    label: "Review Actions",
  },
];

export function DueDiligenceReview({
  developmentHotspotsEnabled,
  floodConstraintsEnabled,
  floodZonesEnabled,
  parcelReviewView,
  selectedParcelId,
  selectedParcelIntelligence,
  selectedParcelIntelligenceSource,
  setMapFocusMode,
  setParcelReviewView,
  setProductMode,
}: DueDiligenceReviewProps) {
  const {
    activePlanningSnapshotId,
    clearPlanningSnapshot,
    deletePlanningSnapshot,
    planningSnapshot,
    planningSnapshotView,
    savedPlanningSnapshots,
    setActivePlanningSnapshot,
    setPlanningSnapshotSectionIncluded,
    setPlanningSnapshotView,
  } = useDashboardState();

  const snapshotLibraryProps: PlanningSnapshotLibraryProps = {
    activeSnapshotId: activePlanningSnapshotId,
    onDelete: deletePlanningSnapshot,
    onUse: (snapshotId) => {
      setActivePlanningSnapshot(snapshotId);
      setPlanningSnapshotView("overview");
    },
    snapshots: savedPlanningSnapshots,
  };

  useEffect(() => {
    if (parcelReviewView === "report") {
      setPlanningSnapshotView("summary");
      return;
    }

    if (parcelReviewView === "actions") {
      setPlanningSnapshotView("actions");
    }
  }, [parcelReviewView, setPlanningSnapshotView]);

  if (!planningSnapshot) {
    return (
      <EmptyPlanningSnapshotState
        hasSelectedParcel={Boolean(selectedParcelIntelligence)}
        snapshotLibrary={snapshotLibraryProps}
        onGoOverview={() => setProductMode("overview")}
      />
    );
  }

  if (!selectedParcelIntelligence) {
    return (
      <SnapshotOnlyWorkspace
        clearPlanningSnapshot={clearPlanningSnapshot}
        onGoOverview={() => setProductMode("overview")}
        onPrint={() => window.print()}
        planningSnapshot={planningSnapshot}
        planningSnapshotView={planningSnapshotView}
        snapshotLibrary={snapshotLibraryProps}
        setPlanningSnapshotSectionIncluded={setPlanningSnapshotSectionIncluded}
        setPlanningSnapshotView={setPlanningSnapshotView}
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
      planningSnapshotView={planningSnapshotView}
      selectedParcelId={selectedParcelId}
      source={selectedParcelIntelligenceSource}
      clearPlanningSnapshot={clearPlanningSnapshot}
      snapshotLibrary={snapshotLibraryProps}
      setMapFocusMode={setMapFocusMode}
      setParcelReviewView={setParcelReviewView}
      setPlanningSnapshotSectionIncluded={setPlanningSnapshotSectionIncluded}
      setPlanningSnapshotView={setPlanningSnapshotView}
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
  planningSnapshotView,
  selectedParcelId,
  snapshotLibrary,
  source,
  setMapFocusMode,
  setParcelReviewView,
  setPlanningSnapshotSectionIncluded,
  setPlanningSnapshotView,
  setProductMode,
}: {
  clearPlanningSnapshot: () => void;
  developmentHotspotsEnabled: boolean;
  floodConstraintsEnabled: boolean;
  floodZonesEnabled: boolean;
  parcel: ParcelSearchRecord;
  planningSnapshot: PlanningSnapshot;
  planningSnapshotView: PlanningSnapshotView;
  selectedParcelId: string | null;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  source: SelectedParcelIntelligenceSource | null;
  setMapFocusMode: (enabled: boolean) => void;
  setParcelReviewView: (view: ParcelReviewView) => void;
  setPlanningSnapshotSectionIncluded: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
  setPlanningSnapshotView: (view: PlanningSnapshotView) => void;
  setProductMode: (mode: ProductMode) => void;
}) {
  const [copied, setCopied] = useState(false);
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
  const zoningSummary = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const addressSummary = [parcel.mailingAddress, parcel.mailingCity, parcel.mailingState]
    .filter(Boolean)
    .join(", ");
  const acreage =
    typeof flood?.parcel_area_acres === "number"
      ? `${formatNumber(flood.parcel_area_acres, 2)} acres`
      : formatLabel(parcel.parcelSizeCategory);
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

  async function copyParcelId() {
    try {
      await navigator.clipboard.writeText(parcel.officialParcelId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function openReportPreview() {
    setPlanningSnapshotView("summary");
    setParcelReviewView("report");
  }

  function openReview() {
    setPlanningSnapshotView("overview");
    setParcelReviewView("review");
  }

  function printReport() {
    setPlanningSnapshotView("summary");
    setParcelReviewView("report");
    window.setTimeout(() => window.print(), 120);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/88 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                Planning Snapshot
              </p>
              <h3 className="mt-2 break-words text-xl font-semibold leading-7 text-white">
                {parcel.officialParcelId}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                Save the current map view, selected parcel, active layers, and
                Intelligence Brief into a report-ready Planning Snapshot.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                Snapshot saved {formatDateTime(planningSnapshot.createdAt)} / {sourceLabel} / Selected ID {selectedParcelId ?? parcel.officialParcelId}
              </p>
            </div>
            <MapPinned className="h-5 w-5 shrink-0 text-[#d8b86a]" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <HeaderFact label="Owner / Account" value={parcel.ownerName ?? "Not Available"} />
            <HeaderFact label="PIN" value={parcel.pin14 ?? "Not Available"} />
            <HeaderFact label="Address" value={addressSummary || "Not Available"} />
            <HeaderFact
              label="Municipality / Jurisdiction"
              value={
                parcel.planningJurisdiction ??
                parcel.zoningJurisdiction ??
                "Not Available"
              }
            />
            <HeaderFact label="Zoning" value={zoningSummary || formatLabel(parcel.zoningCategory)} />
            <HeaderFact label="Acreage / Size" value={acreage} />
            <HeaderFact
              label="Parcel Quality"
              value={formatLabel(parcel.parcelQualityStatus)}
            />
            <HeaderFact label="Neighborhood" value={neighborhoodLabel(parcel)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <StatusBadge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <ActionButton
              active={planningSnapshotView === "overview"}
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Snapshot Overview"
              onClick={openReview}
            />
            <ActionButton
              active={planningSnapshotView === "summary"}
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Executive Summary"
              onClick={openReportPreview}
            />
            <ActionButton
              icon={<Printer className="h-3.5 w-3.5" />}
              label="Print Executive Summary"
              onClick={printReport}
              variant="gold"
            />
            <ActionButton
              icon={<MapPinned className="h-3.5 w-3.5" />}
              label="Focus Map"
              onClick={() => {
                setMapFocusMode(true);
                setProductMode("overview");
              }}
            />
            <ActionButton
              icon={
                copied ? (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )
              }
              label={copied ? "Copied Parcel ID" : "Copy Parcel ID"}
              onClick={copyParcelId}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8b86a]/20 bg-[#1d1607]/34 p-4">
        <p className="text-sm leading-6 text-slate-300">
          Executive Summary is generated from the saved Planning Snapshot: map
          image when available, selected parcel facts, active layers,
          Intelligence Brief, explainable metrics, caveats, and recommended
          staff review actions.
        </p>
      </section>

      <SnapshotInclusionControls
        includedSections={planningSnapshot.includedSections}
        onClear={clearPlanningSnapshot}
        onToggle={setPlanningSnapshotSectionIncluded}
      />

      <PlanningSnapshotLibraryPanel {...snapshotLibrary} />

      <PlanningSnapshotTabs
        activeView={planningSnapshotView}
        onChange={(view) => {
          setPlanningSnapshotView(view);
          if (view === "summary") {
            setParcelReviewView("report");
          } else if (view === "actions") {
            setParcelReviewView("actions");
          } else {
            setParcelReviewView("review");
          }
        }}
        onPrint={printReport}
      />

      {planningSnapshotView === "summary" ? (
        <SnapshotExecutiveSummary
          onPrint={printReport}
          planningSnapshot={planningSnapshot}
        />
      ) : planningSnapshotView === "actions" ? (
        <ReviewNotesActionsPanel
          flags={priorityFlags}
          reviewActions={reviewActions}
        />
      ) : planningSnapshotView === "explain" ? (
        <ExplainableMetricsPanel planningSnapshot={planningSnapshot} />
      ) : (
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
      )}
    </div>
  );
}

function SnapshotOnlyWorkspace({
  clearPlanningSnapshot,
  onGoOverview,
  onPrint,
  planningSnapshot,
  planningSnapshotView,
  snapshotLibrary,
  setPlanningSnapshotSectionIncluded,
  setPlanningSnapshotView,
}: {
  clearPlanningSnapshot: () => void;
  onGoOverview: () => void;
  onPrint: () => void;
  planningSnapshot: PlanningSnapshot;
  planningSnapshotView: PlanningSnapshotView;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  setPlanningSnapshotSectionIncluded: (
    sectionKey: PlanningSnapshotSectionKey,
    included: boolean,
  ) => void;
  setPlanningSnapshotView: (view: PlanningSnapshotView) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/88 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
              Planning Snapshot
            </p>
            <h3 className="mt-2 break-words text-xl font-semibold leading-7 text-white">
              {planningSnapshot.selectedParcelId ?? "Saved map context"}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Saved {formatDateTime(planningSnapshot.createdAt)}. Live parcel
              detail state is not loaded, so this view shows the captured
              snapshot summary and report-ready explanations.
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              A Planning Snapshot is not just a screenshot. It combines the
              current map image with selected parcel facts, active layers,
              headline indicators, caveats, and explanation cards so the report
              can explain what the viewer is seeing.
            </p>
          </div>
          <ActionButton
            icon={<MapPinned className="h-3.5 w-3.5" />}
            label="Go to Overview"
            onClick={onGoOverview}
          />
        </div>
      </section>

      <SnapshotInclusionControls
        includedSections={planningSnapshot.includedSections}
        onClear={clearPlanningSnapshot}
        onToggle={setPlanningSnapshotSectionIncluded}
      />

      <PlanningSnapshotLibraryPanel {...snapshotLibrary} />

      <PlanningSnapshotTabs
        activeView={planningSnapshotView}
        onChange={setPlanningSnapshotView}
        onPrint={onPrint}
      />

      {planningSnapshotView === "summary" ? (
        <SnapshotExecutiveSummary
          onPrint={onPrint}
          planningSnapshot={planningSnapshot}
        />
      ) : planningSnapshotView === "actions" ? (
        <SnapshotReviewActionsPanel planningSnapshot={planningSnapshot} />
      ) : planningSnapshotView === "explain" ? (
        <ExplainableMetricsPanel planningSnapshot={planningSnapshot} />
      ) : (
        <SnapshotOverviewPanel planningSnapshot={planningSnapshot} />
      )}
    </div>
  );
}

function EmptyPlanningSnapshotState({
  hasSelectedParcel,
  snapshotLibrary,
  onGoOverview,
}: {
  hasSelectedParcel: boolean;
  snapshotLibrary: PlanningSnapshotLibraryProps;
  onGoOverview: () => void;
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
            Use Overview to search a parcel, adjust the map, or review
            countywide intelligence, then save a snapshot for report generation.
            A Planning Snapshot is not just a screenshot; it combines the map
            image with context, active layers, explanations, caveats, and staff
            review actions.
          </p>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          <WorkflowStepCard
            description="Start in the Overview Command Center."
            step="1"
            title="Explore Overview"
          />
          <WorkflowStepCard
            description="Search for a parcel or activate the context layers needed for the memo."
            step="2"
            title="Select Context"
          />
          <WorkflowStepCard
            description="Use the Overview button to capture the current context."
            step="3"
            title="Save Snapshot"
          />
          <WorkflowStepCard
            description="Review the captured facts, caveats, sources, and plain-English explanations."
            step="4"
            title="Explain Numbers"
          />
          <WorkflowStepCard
            description="Generate and print a stakeholder-ready executive summary."
            step="5"
            title="Print Summary"
          />
        </div>

        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            className="rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-4 py-2 text-sm font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
            onClick={onGoOverview}
            type="button"
          >
            Go to Overview
          </button>
          {hasSelectedParcel ? (
            <p className="text-xs leading-5 text-slate-500">
              A parcel is selected. Use Overview&apos;s Save Snapshot for
              Report button to capture it.
            </p>
          ) : null}
        </div>

        <div className="mt-5 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-xs leading-5 text-slate-400">
          Demo parcel:{" "}
          <span className="font-semibold text-slate-200">
            CFS-PARCEL-0149726579
          </span>
        </div>
      </section>

      <PlanningSnapshotLibraryPanel {...snapshotLibrary} />
    </div>
  );
}

function WorkflowStepCard({
  description,
  step,
  title,
}: {
  description: string;
  step: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-sm font-semibold text-[#b7f0ff]">
          {step}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

interface PlanningSnapshotLibraryProps {
  activeSnapshotId: string | null;
  onDelete: (snapshotId: string) => void;
  onUse: (snapshotId: string) => void;
  snapshots: PlanningSnapshot[];
}

function PlanningSnapshotLibraryPanel({
  activeSnapshotId,
  onDelete,
  onUse,
  snapshots,
}: PlanningSnapshotLibraryProps) {
  return (
    <section className="app-chrome no-print rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/82 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Planning Snapshot Library
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Saved report snapshots
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            A Planning Snapshot combines the map image, selected parcel facts,
            active layers, headline indicators, caveats, and explanation cards
            so the report can explain what the viewer is seeing.
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
            const captured =
              snapshot.mapScreenshotStatus === "captured" &&
              Boolean(snapshot.mapScreenshotDataUrl);

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
                    {captured && snapshot.mapScreenshotDataUrl ? (
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
                        <MapPinned className="h-5 w-5 text-slate-500" />
                        <p className="text-[11px] font-semibold text-slate-300">
                          Map unavailable
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
                        label={
                          snapshot.mapScreenshotStatus === "captured"
                            ? "Map captured"
                            : "Map unavailable"
                        }
                        tone={
                          snapshot.mapScreenshotStatus === "captured"
                            ? "positive"
                            : "caution"
                        }
                      />
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      <CompactSnapshotFact
                        label="Parcel"
                        value={snapshot.selectedParcelId ?? "Map/context only"}
                      />
                      <CompactSnapshotFact
                        label="Context"
                        value={getSnapshotContextLabel(snapshot)}
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

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-3 py-2 text-xs font-semibold text-[#b7f0ff] transition hover:bg-[#68d8ff]/15"
                        onClick={() => onUse(snapshot.snapshotId)}
                        type="button"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Open
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
          No planning snapshots saved yet. Go to Overview, search/select a
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
  if (snapshot.selectedParcelId) {
    return `Parcel ${snapshot.selectedParcelId}`;
  }

  return snapshot.focusModeLabel ?? "Countywide Planning Snapshot";
}

function getSnapshotContextLabel(snapshot: PlanningSnapshot) {
  if (snapshot.selectedParcelId) {
    return "Parcel snapshot";
  }

  if (snapshot.activeLayers.length > 1) {
    return "Layer/context snapshot";
  }

  return "Countywide snapshot";
}

function getSnapshotIntelligenceBriefTitle(snapshot: PlanningSnapshot) {
  return snapshot.selectedParcelId
    ? "Selected Parcel Intelligence"
    : "Intelligence Brief";
}

function PlanningSnapshotTabs({
  activeView,
  onChange,
  onPrint,
}: {
  activeView: PlanningSnapshotView;
  onChange: (view: PlanningSnapshotView) => void;
  onPrint: () => void;
}) {
  return (
    <nav
      aria-label="Planning Snapshot workflow"
      className="grid gap-2 rounded-lg border border-white/10 bg-black/24 p-2 lg:grid-cols-4"
    >
      {planningSnapshotTabs.map((tab) => {
        const active = tab.id === activeView;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "rounded-md border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/70",
              active
                ? "border-[#68d8ff]/35 bg-[#68d8ff]/10 text-white shadow-[0_0_24px_rgba(104,216,255,0.12)]"
                : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {tab.description}
            </span>
          </button>
        );
      })}
      <button
        className="rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 px-3 py-3 text-left text-[#f6d98e] transition hover:border-[#d8b86a]/45 hover:bg-[#d8b86a]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8b86a]/70"
        onClick={onPrint}
        type="button"
      >
        <span className="block text-sm font-semibold">
          Print Executive Summary
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#f6d98e]/75">
          Open the executive summary print dialog.
        </span>
      </button>
    </nav>
  );
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
  "Flood Review Status": "fema_flood",
  "Internal Model Research Status": "model_governance",
  "Map Snapshot": "map_view",
  "Snapshot Context": "data_needed_caveats",
  "School Assignment": "schools",
  "Transportation Context": "transportation",
  "Utility Proxy": "utility_proxy",
};

function SnapshotInclusionControls({
  includedSections,
  onClear,
  onToggle,
}: {
  includedSections: PlanningSnapshot["includedSections"];
  onClear: () => void;
  onToggle: (sectionKey: PlanningSnapshotSectionKey, included: boolean) => void;
}) {
  return (
    <section className="app-chrome no-print rounded-lg border border-white/10 bg-black/22 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Included in Snapshot
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Report section controls
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Choose which saved evidence groups appear in the Executive Summary.
            These controls affect the report only; they do not change map
            rendering or source data.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          onClick={onClear}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Snapshot
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(snapshotSectionLabels) as PlanningSnapshotSectionKey[]).map(
          (sectionKey) => (
            <label
              className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200"
              key={sectionKey}
            >
              <input
                checked={includedSections[sectionKey] ?? true}
                className="h-3.5 w-3.5 accent-[#68d8ff]"
                onChange={(event) => onToggle(sectionKey, event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0 truncate">
                {snapshotSectionLabels[sectionKey]}
              </span>
            </label>
          ),
        )}
      </div>
    </section>
  );
}

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
            This snapshot preserves the saved command context, map image when
            available, active context labels, key facts, review flags, and
            caveats that should be explained in an executive-ready planning
            memo.
          </p>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">
            It is not just a screenshot. CFS combines the map image with the
            Intelligence Brief, active layers, headline indicators, caveats, and
            explanation cards so the report has meaning.
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

      <MapSnapshotPreview planningSnapshot={planningSnapshot} />

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

function MapSnapshotPreview({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  const captured =
    planningSnapshot.mapScreenshotStatus === "captured" &&
    Boolean(planningSnapshot.mapScreenshotDataUrl);
  const capturedAt =
    planningSnapshot.mapScreenshotCapturedAt ?? planningSnapshot.createdAt;

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
            Map Snapshot
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
      <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814]">
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
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <HeaderFact
          label="Snapshot context"
          value={planningSnapshot.focusModeLabel ?? "Planning Snapshot"}
        />
        <HeaderFact
          label="Camera"
          value={planningSnapshot.mapContext.cameraSummary ?? "Not captured"}
        />
        <HeaderFact
          label="Extent"
          value={planningSnapshot.mapContext.extentSummary ?? "Not captured"}
        />
      </div>
    </section>
  );
}

function ExplainableMetricsPanel({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  return (
    <div className="space-y-3">
      <ReviewGroupIntro
        eyebrow="Explain the Numbers"
        summary="Each metric names what it means, where it came from, how CFS interprets it, what caveat applies, and what staff should review next."
        title="Plain-English metric explanations"
      />
      {planningSnapshot.explainableMetrics.map((metric) => (
        <section
          className="rounded-lg border border-white/10 bg-[#07111f]/78 p-4"
          key={metric.label}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fe7ff]">
                {metric.label}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-white">
                {metric.value}
              </h3>
            </div>
            <StatusBadge label="Explainable" tone="info" />
          </div>
          <div className="mt-4 grid gap-2">
            <ReviewFactItem label="What it means" value={metric.meaning} />
            <ReviewFactItem label="Source" value={metric.source} />
            <ReviewFactItem label="Method / rationale" value={metric.method} />
            <ReviewFactItem label="Caveat" value={metric.caveat} />
            {metric.recommendedAction ? (
              <ReviewFactItem
                label="Recommended action"
                value={metric.recommendedAction}
              />
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function SnapshotExecutiveSummary({
  onPrint,
  planningSnapshot,
}: {
  onPrint: () => void;
  planningSnapshot: PlanningSnapshot;
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
    .map((sectionKey) => snapshotSectionLabels[sectionKey]);

  return (
    <div className="space-y-4">
      <section className="app-chrome no-print rounded-lg border border-[#68d8ff]/18 bg-[#07111f]/78 p-4">
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
            Planning Snapshot Executive Summary
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400 print:text-slate-700">
            Generated {formatDateTime(new Date().toISOString())}. Snapshot
            saved {formatDateTime(planningSnapshot.createdAt)}.
          </p>
        </header>

        {planningSnapshot.includedSections.map_view !== false ? (
          <ReportMapSnapshotSection planningSnapshot={planningSnapshot} />
        ) : null}

        <ReportIntelligenceBriefSection planningSnapshot={planningSnapshot} />

        <section className="mt-5 grid gap-3 md:grid-cols-2 print:grid-cols-2">
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

        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Key Findings
          </h3>
          <div className="mt-3 grid gap-2">
            {planningSnapshot.knownReviewFlags.map((flag) => (
              <ReportFact
                key={`${flag.label}-report`}
                label={`${flag.label}: ${flag.status}`}
                value={flag.reason}
              />
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Explainable Metrics
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
                  {metric.meaning}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#f6d98e] print:text-slate-700">
                  Caveat: {metric.caveat}
                </p>
              </div>
            ))}
          </div>
        </section>

        {planningSnapshot.includedSections.recommended_actions !== false ? (
          <section className="mt-6">
            <h3 className="text-lg font-semibold text-white print:text-slate-950">
              Recommended Actions
            </h3>
            <div className="mt-3 grid gap-2">
              {includedMetrics
                .filter((metric) => metric.recommendedAction)
                .map((metric) => (
                  <ReportFact
                    key={`${metric.label}-action`}
                    label={metric.label}
                    value={metric.recommendedAction ?? "Review source records"}
                  />
                ))}
            </div>
          </section>
        ) : null}

        {planningSnapshot.includedSections.data_needed_caveats !== false ? (
          <section className="mt-6 rounded-md border border-[#d8b86a]/24 bg-[#d8b86a]/[0.06] p-3 print:border-slate-300 print:bg-white">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f6d98e] print:text-slate-700">
              Limitations and caveats
            </h3>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-300 print:text-slate-700">
              {planningSnapshot.caveats.map((caveat) => (
                <li key={caveat}>- {caveat}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
}

function ReportIntelligenceBriefSection({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  const briefTitle = getSnapshotIntelligenceBriefTitle(planningSnapshot);
  const keyFacts = planningSnapshot.keyFacts.slice(0, 6);
  const headlineMetrics = planningSnapshot.overviewKpis.slice(0, 4);

  return (
    <section className="mt-5 rounded-md border border-white/10 bg-black/20 p-3 print:border-slate-300 print:bg-white">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white print:text-slate-950">
            Intelligence Brief
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-400 print:text-slate-700">
            {briefTitle} captured from Overview at snapshot time. This section
            summarizes the saved context; it does not include hidden model
            scores or parcel-level predictions.
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-md border border-[#d8b86a]/28 bg-[#d8b86a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f6d98e] print:border-slate-300 print:bg-white print:text-slate-700">
          {getSnapshotContextLabel(planningSnapshot)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
        {keyFacts.map((fact) => (
          <ReportFact
            key={`brief-${fact.label}`}
            label={fact.label}
            value={fact.value}
          />
        ))}
      </div>

      {headlineMetrics.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 print:grid-cols-2">
          {headlineMetrics.map((metric) => (
            <ReportFact
              key={`brief-kpi-${metric.label}`}
              label={metric.label}
              value={`${metric.value}${metric.caveat ? ` / ${metric.caveat}` : ""}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReportMapSnapshotSection({
  planningSnapshot,
}: {
  planningSnapshot: PlanningSnapshot;
}) {
  const captured =
    planningSnapshot.mapScreenshotStatus === "captured" &&
    Boolean(planningSnapshot.mapScreenshotDataUrl);
  const capturedAt =
    planningSnapshot.mapScreenshotCapturedAt ?? planningSnapshot.createdAt;

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
      <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-[#020814] print:border-slate-300 print:bg-white">
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

function ReviewNotesActionsPanel({
  flags,
  reviewActions,
}: {
  flags: PriorityFlag[];
  reviewActions: string[];
}) {
  return (
    <div className="space-y-4">
      <PriorityFlagsPanel flags={flags} />
      <ReviewSection
        caveat="Review notes are generated from visible parcel context and caveats. They are prompts for staff follow-up, not automated decisions."
        facts={reviewActions.map((action, index) => ({
          label: `Action ${index + 1}`,
          value: action,
        }))}
        icon={CheckCircle2}
        status={{ label: "Planner Review", tone: "info" }}
        summary="Recommended follow-up steps based on selected parcel evidence, constraints, and current data gaps."
        title="Recommended Review Actions"
      />
      <ReviewSection
        caveat="Missing official datasets should be named plainly. Missing data is not the same as confirmed risk."
        facts={[
          {
            label: "School capacity",
            value: "Official enrollment/capacity data needed",
          },
          {
            label: "Utility capacity",
            value: "Provider confirmation needed",
          },
          {
            label: "Rezoning case history",
            value: "Official dated case records needed",
          },
          {
            label: "Future land use",
            value: "Countywide GIS/table preferred",
          },
          {
            label: "Model output",
            value: "Internal research only; no parcel-level output",
          },
        ]}
        icon={FileText}
        status={{ label: "Official Data Needed", tone: "caution" }}
        summary="Follow-up data requests that would make parcel review stronger and reduce caveats."
        title="Data Gaps To Resolve"
      />
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

function neighborhoodLabel(parcel: ParcelSearchRecord) {
  return [parcel.neighborhood, parcel.subdivision].filter(Boolean).join(" / ") || "Not Available";
}

function formatOptionalCurrency(value: number | null | undefined) {
  return typeof value === "number" ? formatCurrency(value) : "Not Available";
}

function formatOptionalCount(value: number | null | undefined) {
  return typeof value === "number" ? formatDevelopmentCount(value) : "Not Available";
}

function formatNumber(value: number, digits = 1) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
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
