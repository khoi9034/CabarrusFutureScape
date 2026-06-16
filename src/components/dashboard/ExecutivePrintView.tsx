"use client";

import {
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  MapPinned,
  Printer,
  Route,
  School,
  ShieldAlert,
  TrafficCone,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDevelopmentPredictionResearchStatus } from "@/hooks/useDevelopmentPredictionResearchStatus";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { useSelectedParcelNewConstruction } from "@/hooks/useSelectedParcelNewConstruction";
import { useSelectedParcelPermitEvents } from "@/hooks/useSelectedParcelPermitEvents";
import { useSelectedParcelSchoolConstraint } from "@/hooks/useSelectedParcelSchoolConstraint";
import { useTransportationContextSummary } from "@/hooks/useTransportationContextSummary";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { cn, formatCurrency } from "@/lib/utils";

type PrintBadgeTone = "caution" | "info" | "neutral" | "positive" | "review";

interface ReportFact {
  label: string;
  value: string;
}

interface ReportFlag {
  description: string;
  label: string;
  title: string;
  tone: PrintBadgeTone;
}

export function ExecutivePrintView() {
  const { selectedParcelIntelligence, selectedParcelIntelligenceSource } =
    useDashboardState();
  const officialParcelId = selectedParcelIntelligence?.officialParcelId;
  const developmentActivity =
    useSelectedParcelDevelopmentActivity(officialParcelId);
  const floodConstraint = useSelectedParcelFloodConstraint(officialParcelId);
  const newConstruction = useSelectedParcelNewConstruction(officialParcelId);
  const permitEvents = useSelectedParcelPermitEvents(officialParcelId);
  const schoolConstraint = useSelectedParcelSchoolConstraint(officialParcelId);
  const transportationContext = useTransportationContextSummary();
  const modelResearch = useDevelopmentPredictionResearchStatus();
  const generatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    [],
  );
  const dataMode = USE_BACKEND_API
    ? `FastAPI (${CFS_API_BASE_URL})`
    : "Static fallback";

  function printReport() {
    window.print();
  }

  if (!selectedParcelIntelligence) {
    return (
      <section className="print-report mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center rounded-lg border border-white/10 bg-[#0a111c]/92 p-8 shadow-[0_28px_100px_rgba(0,0,0,0.38)]">
        <div className="max-w-xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f0cd79]">
            <FileText className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#d8b86a]">
            Executive Summary
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            No parcel selected. Select a parcel before generating a report.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Use Overview search or map layers to select a parcel, then return to
            Planning Snapshot &gt; Executive Summary for a report-ready planning memo.
          </p>
        </div>
      </section>
    );
  }

  const parcel = selectedParcelIntelligence;
  const activity = developmentActivity.activity;
  const flood = floodConstraint.constraint;
  const newConstructionSummary = newConstruction.summary;
  const latestPermit = permitEvents.permits[0] ?? null;
  const zoning = [parcel.zoningJurisdiction, parcel.zoningCode]
    .filter(Boolean)
    .join(" / ");
  const address = [parcel.mailingAddress, parcel.mailingCity, parcel.mailingState]
    .filter(Boolean)
    .join(", ");
  const acreage =
    typeof flood?.parcel_area_acres === "number"
      ? `${formatNumber(flood.parcel_area_acres, 2)} acres`
      : formatLabel(parcel.parcelSizeCategory);
  const sourceLabel =
    selectedParcelIntelligenceSource === "api"
      ? "Live API"
      : selectedParcelIntelligenceSource === "fallback"
        ? "Static fallback"
        : selectedParcelIntelligenceSource === "static"
          ? "Static index"
          : "Parcel intelligence";
  const keyFindings = buildKeyFindings({
    activity,
    flood,
    newConstructionSummary,
    schoolConstraint,
  });
  const reviewActions = buildReviewActions({
    activity,
    flood,
    schoolConstraint,
  });
  const reportFlags = buildReportFlags({
    activity,
    flood,
    parcel,
    schoolConstraint,
  });

  return (
    <article className="print-report mx-auto max-w-6xl rounded-lg border border-white/10 bg-[#0a111c]/94 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.38)] lg:p-7">
      <header className="print-section flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d8b86a]">
            Cabarrus FutureScape
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
            Planning Snapshot Executive Summary
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Professional planning review memo for selected parcel context,
            constraints, permit history, and model governance.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ReportBadge label="Planning memo" tone="info" />
            <ReportBadge label="No public model score" tone="caution" />
            <ReportBadge label={sourceLabel} tone="neutral" />
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <button
            className="app-chrome inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-4 text-sm font-semibold text-[#f0cd79] transition hover:bg-[#d8b86a]/18"
            onClick={printReport}
            type="button"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <p className="text-xs leading-5 text-slate-500">
            Generated {generatedAt}
            <br />
            Parcel {parcel.officialParcelId}
            <br />
            Data mode: {dataMode}
          </p>
        </div>
      </header>

      <ReportSection
        icon={MapPinned}
        status={{ label: "Selected Parcel", tone: "positive" }}
        title="Parcel Snapshot"
      >
        <ReportGrid
          facts={[
            { label: "Parcel ID", value: parcel.officialParcelId },
            { label: "PIN", value: parcel.pin14 ?? "Not Available" },
            { label: "Owner / Account", value: parcel.ownerName ?? "Not Available" },
            { label: "Address", value: address || "Not Available" },
            {
              label: "Municipality / Jurisdiction",
              value:
                parcel.planningJurisdiction ??
                parcel.zoningJurisdiction ??
                "Not Available",
            },
            { label: "Acreage / Size", value: acreage },
            {
              label: "Assessed / market value",
              value: `${formatOptionalCurrency(
                parcel.assessedValue,
              )} / ${formatOptionalCurrency(parcel.marketValue)}`,
            },
            { label: "Zoning", value: zoning || formatLabel(parcel.zoningCategory) },
            {
              label: "Parcel Quality",
              value: formatLabel(parcel.parcelQualityStatus),
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        icon={CheckCircle2}
        status={{ label: "Executive Readout", tone: "info" }}
        title="Key Findings"
      >
        <ul className="space-y-2 text-sm leading-6 text-slate-300">
          {keyFindings.map((finding) => (
            <li className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2" key={finding}>
              {finding}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection
        icon={ShieldAlert}
        status={{ label: "Review Triage", tone: "caution" }}
        title="High-Priority Review Flags"
      >
        <div className="grid gap-2 md:grid-cols-2">
          {reportFlags.map((flag) => (
            <ReportFlagCard flag={flag} key={flag.title} />
          ))}
        </div>
      </ReportSection>

      <div className="print-page-break grid gap-4 lg:grid-cols-2">
        <ReportSection
          icon={Building2}
          status={{
            label: parcel.zoningCode ? "Zoning Available" : "Review Needed",
            tone: parcel.zoningCode ? "positive" : "review",
          }}
          title="Planning Context"
        >
          <ReportGrid
            facts={[
              { label: "Zoning code", value: parcel.zoningCode ?? "Not Available" },
              {
                label: "Zoning jurisdiction",
                value: parcel.zoningJurisdiction ?? "Not Available",
              },
              { label: "Zoning category", value: formatLabel(parcel.zoningCategory) },
              {
                label: "Assignment quality",
                value: formatLabel(parcel.zoningConfidence),
              },
              { label: "Official rezoning cases", value: "Not linked in this report" },
            ]}
          />
          <ReportCaveat>
            Historical zoning changes are map-change detections, not official
            rezoning approval records.
          </ReportCaveat>
        </ReportSection>

        <ReportSection
          icon={TrafficCone}
          status={{
            label: activity?.total_permit_count
              ? "Observed Activity"
              : "No Recent Activity",
            tone: activity?.total_permit_count ? "info" : "neutral",
          }}
          title="Development Activity"
        >
          <ReportGrid
            facts={[
              {
                label: "Total permits",
                value: activity
                  ? formatDevelopmentCount(activity.total_permit_count)
                  : loadingOrUnavailable(developmentActivity.source),
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
                label: "Permit segment",
                value: formatDevelopmentLabel(
                  activity?.dominant_permit_segment ?? activity?.dominant_permit_type,
                ),
              },
              {
                label: "Growth signal",
                value: formatDevelopmentLabel(activity?.dominant_growth_signal),
              },
              {
                label: "Latest permit",
                value: latestPermit
                  ? `${formatDevelopmentDate(latestPermit.activity_date)} / ${formatDevelopmentLabel(
                      latestPermit.permit_status,
                    )}`
                  : "Not Available",
              },
              {
                label: "Activity class",
                value: formatDevelopmentLabel(activity?.development_activity_class),
              },
            ]}
          />
          <ReportCaveat>
            Permit activity is observed historical/operational signal, not
            prediction.
          </ReportCaveat>
        </ReportSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection
          icon={CalendarClock}
          status={{
            label: newConstructionSummary?.total_new_construction_permits
              ? "History Available"
              : "No New Construction History",
            tone: newConstructionSummary?.total_new_construction_permits
              ? "info"
              : "neutral",
          }}
          title="New Construction / Permit History"
        >
          <ReportGrid
            facts={[
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
                  ? formatDevelopmentCount(
                      newConstructionSummary.completed_new_construction_count,
                    )
                  : loadingOrUnavailable(newConstruction.source),
              },
              {
                label: "Active / uncompleted",
                value: newConstructionSummary
                  ? formatDevelopmentCount(
                      newConstructionSummary
                        .active_uncompleted_new_construction_count,
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
          />
          <ReportCaveat>
            New construction permit history is used as historical outcome data
            for internal model research.
          </ReportCaveat>
        </ReportSection>

        <ReportSection
          icon={Waves}
          status={{
            label: flood?.flood_review_required
              ? "Review Required"
              : flood
                ? "Not Flagged"
                : "Checking FEMA Overlay",
            tone: flood?.flood_review_required ? "review" : flood ? "positive" : "neutral",
          }}
          title="Flood and Environmental Constraints"
        >
          <ReportGrid
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
          />
          <ReportCaveat>
            FEMA NFHL remains the authoritative regulatory flood source.
          </ReportCaveat>
        </ReportSection>
      </div>

      <div className="print-page-break grid gap-4 lg:grid-cols-2">
        <ReportSection
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
          title="School Assignment and Utilization"
        >
          <ReportGrid
            facts={[
              ...schoolConstraint.assignments.flatMap((assignment) => [
                {
                  label: `${assignment.levelLabel} school`,
                  value: assignment.schoolName,
                },
                {
                  label: `${assignment.levelLabel} utilization`,
                  value: assignment.utilizationLabel,
                },
              ]),
              {
                label: "Capacity status",
                value: "Capacity Data Needed",
              },
              {
                label: "School capacity score",
                value: schoolConstraint.scoreLabel || "Not scored",
              },
            ]}
          />
          <ReportCaveat>
            School assignment is based on attendance-zone polygon overlap.
            Presentation-derived utilization values require verification.
            Official school capacity/enrollment data has not been added yet.
            School capacity score is not active.
          </ReportCaveat>
        </ReportSection>

        <ReportSection
          icon={Route}
          status={{
            label:
              transportationContext.accessibility || transportationContext.planTraffic
                ? "Current Context"
                : "Summary Not Available",
            tone:
              transportationContext.accessibility || transportationContext.planTraffic
                ? "info"
                : "neutral",
          }}
          title="Transportation and Accessibility"
        >
          <ReportGrid
            facts={[
              {
                label: "Road accessibility features",
                value: transportationContext.accessibility
                  ? `${formatDevelopmentCount(
                      transportationContext.accessibility.row_count,
                    )} parcel rows`
                  : loadingOrUnavailable(transportationContext.source),
              },
              {
                label: "Distance to nearest road",
                value: "Available in backend feature table; current context only",
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
          />
          <ReportCaveat>
            Transportation accessibility features are current-context indicators
            unless dated historical transportation/project data is available.
          </ReportCaveat>
        </ReportSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection
          icon={Wrench}
          status={{ label: "Proxy Only", tone: "caution" }}
          title="Utility / Infrastructure Context"
        >
          <ReportGrid
            facts={[
              { label: "WSACC district / proxy", value: "Proxy context only" },
              {
                label: "Sewer line proximity",
                value: "Available only where utility proxy features exist",
              },
              {
                label: "Utility access proxy score",
                value: "Internal research context; not a capacity score",
              },
              { label: "True utility capacity", value: "Not available" },
            ]}
          />
          <ReportCaveat>
            Utility proxy layers indicate proximity/service context only. They
            do not confirm available capacity.
          </ReportCaveat>
        </ReportSection>

        <ReportSection
          icon={BrainCircuit}
          status={{ label: "Internal Research Only", tone: "caution" }}
          title="Model Transparency"
        >
          <ReportGrid
            facts={[
              {
                label: "Current best internal model variant",
                value: formatModelVariant(
                  modelResearch.featuresSummary?.recommended_internal_model_variant ??
                    modelResearch.featuresSummary
                      ?.current_best_internal_model_variant ??
                    "Zoning + Transportation + Tax/Value",
                ),
              },
              { label: "Model status", value: "Internal research only" },
              { label: "Production ready", value: "No" },
              { label: "Model probabilities", value: "Not available" },
              { label: "Public exposure", value: "Not allowed" },
              {
                label: "Calibration status",
                value: formatLabel(modelResearch.rankingSummary.calibration_status),
              },
            ]}
          />
          <ReportCaveat>
            Model research is shown for transparency only. Parcel-level model
            outputs are not exposed.
          </ReportCaveat>
        </ReportSection>
      </div>

      <ReportSection
        icon={ShieldAlert}
        status={{ label: "Known Limitations", tone: "review" }}
        title="Known Limitations"
      >
        <ul className="grid gap-2 text-sm leading-6 text-slate-300 md:grid-cols-2">
          {[
            "Official utility capacity is not available.",
            "Official school capacity and enrollment are pending.",
            "Official rezoning case records are not linked.",
            "Future land use is not countywide and dated consistently.",
            "Model research is not production-ready.",
            "Some planning, utility, and pipeline features remain current-context only.",
          ].map((item) => (
            <li className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection
        icon={CheckCircle2}
        status={{ label: "Planner Review", tone: "info" }}
        title="Recommended Review Actions"
      >
        <ol className="grid gap-2 text-sm leading-6 text-slate-300 md:grid-cols-2">
          {reviewActions.map((action) => (
            <li className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2" key={action}>
              {action}
            </li>
          ))}
        </ol>
      </ReportSection>
    </article>
  );
}

function ReportSection({
  children,
  icon: Icon,
  status,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  status: { label: string; tone: PrintBadgeTone };
  title: string;
}) {
  return (
    <section className="print-section mt-4 rounded-lg border border-white/10 bg-[#07111f]/78 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#b7f0ff]">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        <ReportBadge label={status.label} tone={status.tone} />
      </div>
      {children}
    </section>
  );
}

function ReportGrid({ facts }: { facts: ReportFact[] }) {
  const visibleFacts = facts.filter(
    (fact) => fact.value && !isNotAvailableValue(fact.value),
  );
  const displayedFacts = visibleFacts.length ? visibleFacts : facts;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {displayedFacts.map((fact) => (
        <ReportField key={`${fact.label}-${fact.value}`} {...fact} />
      ))}
    </div>
  );
}

function ReportFlagCard({ flag }: { flag: ReportFlag }) {
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
        <ReportBadge label={flag.label} tone={flag.tone} />
      </div>
    </div>
  );
}

function ReportField({ label, value }: ReportFact) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-100">
        {value || "Not Available"}
      </p>
    </div>
  );
}

function ReportBadge({ label, tone }: { label: string; tone: PrintBadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 rounded-md border px-2.5 py-1 text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.12em]",
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

function ReportCaveat({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-xs leading-5 text-[#f6d98e]">
      {children}
    </p>
  );
}

function buildKeyFindings({
  activity,
  flood,
  newConstructionSummary,
  schoolConstraint,
}: {
  activity: ReturnType<typeof useSelectedParcelDevelopmentActivity>["activity"];
  flood: ReturnType<typeof useSelectedParcelFloodConstraint>["constraint"];
  newConstructionSummary: ReturnType<typeof useSelectedParcelNewConstruction>["summary"];
  schoolConstraint: ReturnType<typeof useSelectedParcelSchoolConstraint>;
}) {
  const findings = [
    flood?.flood_review_required
      ? "FEMA flood overlay indicates engineering review is recommended."
      : flood
        ? "FEMA flood overlay does not currently flag this parcel for review."
        : "FEMA flood overlay status is not available in this report.",
    activity?.total_permit_count
      ? `${formatDevelopmentCount(activity.total_permit_count)} matched permit records are associated with this parcel.`
      : "No matched permit activity summary is available for this parcel.",
    schoolConstraint.assignments.some((assignment) => !assignment.hasAssignment)
      ? "One or more school assignments require CCS scope or QA review."
      : "CCS V1 attendance-zone assignments are available where matched.",
    "School utilization is presentation-derived and requires official verification.",
    "Utility context is proxy-only and does not confirm available capacity.",
    "Model research remains internal-only; no parcel-level model output is exposed.",
  ];

  if (newConstructionSummary?.total_new_construction_permits) {
    findings.splice(
      2,
      0,
      `${formatDevelopmentCount(
        newConstructionSummary.total_new_construction_permits,
      )} new construction permit records are matched to this parcel.`,
    );
  }

  return findings;
}

function buildReportFlags({
  activity,
  flood,
  parcel,
  schoolConstraint,
}: {
  activity: ReturnType<typeof useSelectedParcelDevelopmentActivity>["activity"];
  flood: ReturnType<typeof useSelectedParcelFloodConstraint>["constraint"];
  parcel: NonNullable<ReturnType<typeof useDashboardState>["selectedParcelIntelligence"]>;
  schoolConstraint: ReturnType<typeof useSelectedParcelSchoolConstraint>;
}): ReportFlag[] {
  return [
    {
      description: parcel.zoningCode
        ? `${parcel.zoningCode} is available from current zoning context.`
        : "Current zoning code is not available in the selected parcel record.",
      label: parcel.zoningCode ? "Data Available" : "Review Required",
      title: "Planning and zoning",
      tone: parcel.zoningCode ? "positive" : "review",
    },
    {
      description: flood?.flood_review_required
        ? "FEMA overlay recommends engineering review before buildability assumptions."
        : flood
          ? "FEMA overlay does not flag this parcel for flood review."
          : "FEMA flood overlay status is not available in this report.",
      label: flood?.flood_review_required ? "Review Required" : flood ? "Not Flagged" : "Not Available",
      title: "Flood constraints",
      tone: flood?.flood_review_required ? "review" : flood ? "positive" : "neutral",
    },
    {
      description: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "One or more school assignment levels need scope or QA review."
        : "Attendance-zone assignment is available; official capacity is still pending.",
      label: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "Review Required"
        : "Capacity Data Needed",
      title: "School context",
      tone: schoolConstraint.assignments.some(
        (assignment) => !assignment.hasAssignment,
      )
        ? "review"
        : "caution",
    },
    {
      description: activity?.total_permit_count
        ? "Observed permit activity is available for staff review."
        : "No matched permit activity summary is available for this parcel.",
      label: activity?.total_permit_count ? "Data Available" : "Not Available",
      title: "Development activity",
      tone: activity?.total_permit_count ? "info" : "neutral",
    },
    {
      description:
        "Utility layers are proximity/service-context proxies and do not confirm available capacity.",
      label: "Official Data Needed",
      title: "Utility capacity",
      tone: "caution",
    },
    {
      description:
        "Model research remains aggregate/internal only; no parcel-level model output is exposed.",
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
  }

  if (schoolConstraint.assignments.some((assignment) => !assignment.hasAssignment)) {
    actions.push("Resolve CCS-only assignment or QA review gaps if relevant.");
  }

  actions.push("Confirm school capacity data when verified enrollment/capacity is available.");
  actions.push("Confirm utility capacity/service readiness with WSACC or the appropriate provider.");
  actions.push("Review official rezoning records when available.");

  return actions;
}

function formatOptionalCurrency(value: number | null | undefined) {
  return typeof value === "number" ? formatCurrency(value) : "Not Available";
}

function formatNumber(value: number, digits = 1) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
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
