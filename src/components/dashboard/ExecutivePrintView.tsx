"use client";

import {
  CalendarClock,
  FileText,
  MapPinned,
  Printer,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import { useSelectedParcelPermitEvents } from "@/hooks/useSelectedParcelPermitEvents";
import { CFS_API_BASE_URL, USE_BACKEND_API } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatOptionalCurrency(value: number | null | undefined) {
  return typeof value === "number" ? formatCurrency(value) : "Unavailable";
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function yesNo(value: boolean | null | undefined) {
  if (typeof value !== "boolean") {
    return "Unavailable";
  }

  return value ? "Yes" : "No";
}

export function ExecutivePrintView() {
  const { selectedParcelIntelligence, selectedParcelIntelligenceSource } =
    useDashboardState();
  const officialParcelId = selectedParcelIntelligence?.officialParcelId;
  const developmentActivity =
    useSelectedParcelDevelopmentActivity(officialParcelId);
  const floodConstraint = useSelectedParcelFloodConstraint(officialParcelId);
  const permitEvents = useSelectedParcelPermitEvents(officialParcelId);
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
            Executive Print
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            Select a parcel before generating an executive print summary.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Use Overview search or map layers to select a parcel, then return to
            Executive Print for a report-ready site intelligence summary.
          </p>
          <button
            className="app-chrome mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8b86a]/35 bg-[#d8b86a]/12 px-4 text-sm font-semibold text-[#f0cd79] transition hover:bg-[#d8b86a]/18"
            onClick={printReport}
            type="button"
          >
            <Printer className="h-4 w-4" />
            Print preview
          </button>
        </div>
      </section>
    );
  }

  const activity = developmentActivity.activity;
  const flood = floodConstraint.constraint;
  const latestPermit = permitEvents.permits[0];
  const sourceLabel =
    selectedParcelIntelligenceSource === "api"
      ? "Live API"
      : selectedParcelIntelligenceSource === "fallback"
        ? "Static fallback"
        : selectedParcelIntelligenceSource === "static"
          ? "Static index"
          : "Parcel intelligence";
  const executiveNote = buildExecutiveNote({
    activityClass: activity?.development_activity_class ?? null,
    buildabilityImpact: flood?.buildability_impact ?? null,
    floodReviewRequired: flood?.flood_review_required ?? null,
    floodSeverity: flood?.flood_severity_class ?? null,
    permitCount: activity?.total_permit_count ?? null,
  });

  return (
    <article className="print-report mx-auto max-w-6xl rounded-lg border border-white/10 bg-[#0a111c]/94 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.38)] lg:p-7">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d8b86a]">
            Cabarrus FutureScape
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
            Executive Site Intelligence Report
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Planning intelligence summary for selected parcel due diligence.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
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
            Data mode: {dataMode}
          </p>
        </div>
      </header>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <ReportCard
          eyebrow="A"
          icon={<MapPinned className="h-4 w-4" />}
          title="Selected Parcel Summary"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <ReportField
              label="Parcel ID"
              value={selectedParcelIntelligence.officialParcelId}
            />
            <ReportField
              label="PIN"
              value={selectedParcelIntelligence.pin14 ?? "Unavailable"}
            />
            <ReportField
              label="Owner / Account"
              value={selectedParcelIntelligence.ownerName ?? "Unavailable"}
            />
            <ReportField
              label="Neighborhood / Subdivision"
              value={
                [
                  selectedParcelIntelligence.neighborhood,
                  selectedParcelIntelligence.subdivision,
                ]
                  .filter(Boolean)
                  .join(" / ") || "Unavailable"
              }
            />
            <ReportField
              label="Zoning"
              value={
                [
                  selectedParcelIntelligence.zoningJurisdiction,
                  selectedParcelIntelligence.zoningCode,
                  formatLabel(selectedParcelIntelligence.zoningCategory),
                ]
                  .filter((value) => value && value !== "Unavailable")
                  .join(" / ") || "Unavailable"
              }
            />
            <ReportField
              label="Valuation"
              value={`Assessed ${formatOptionalCurrency(
                selectedParcelIntelligence.assessedValue,
              )} / Market ${formatOptionalCurrency(
                selectedParcelIntelligence.marketValue,
              )}`}
            />
            <ReportField
              label="Parcel Quality"
              value={formatLabel(selectedParcelIntelligence.parcelQualityStatus)}
            />
            <ReportField label="Source" value={sourceLabel} />
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="B"
          icon={<CalendarClock className="h-4 w-4" />}
          title="Development Summary"
        >
          <div className="grid gap-2">
            <ReportField
              label="Total Permits"
              value={
                activity
                  ? formatDevelopmentCount(activity.total_permit_count)
                  : "Unavailable"
              }
            />
            <ReportField
              label="Latest Activity"
              value={
                activity
                  ? formatDevelopmentDate(activity.latest_permit_date)
                  : "Unavailable"
              }
            />
            <ReportField
              label="Dominant Permit Segment"
              value={formatDevelopmentLabel(activity?.dominant_permit_type)}
            />
            <ReportField
              label="Recent Activity"
              value={
                activity
                  ? `${formatDevelopmentCount(
                      activity.recent_permit_count_1yr,
                    )} in 1 year / ${formatDevelopmentCount(
                      activity.recent_permit_count_3yr,
                    )} in 3 years`
                  : "Unavailable"
              }
            />
            <ReportField
              label="Activity Class"
              value={formatDevelopmentLabel(activity?.development_activity_class)}
            />
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="C"
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Constraint Summary"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <ReportField
              label="FEMA Zone"
              value={flood?.dominant_flood_zone ?? "Unavailable"}
            />
            <ReportField
              label="Located within FEMA Floodway"
              value={yesNo(flood?.floodway_present)}
            />
            <ReportField
              label="Located within SFHA"
              value={yesNo(flood?.sfha_present)}
            />
            <ReportField
              label="Flood-Constrained Area"
              value={formatPercent(flood?.percent_parcel_constrained)}
            />
            <ReportField
              label="Buildability Impact"
              value={formatLabel(flood?.buildability_impact)}
            />
            <ReportField
              label="Recommended Review Action"
              value={
                flood?.flood_review_required
                  ? "Engineering review recommended"
                  : flood
                    ? "No FEMA flood review flag"
                    : "Unavailable"
              }
            />
          </div>
        </ReportCard>

        <ReportCard
          eyebrow="D"
          icon={<FileText className="h-4 w-4" />}
          title="Latest Permit Events"
        >
          {permitEvents.permits.length > 0 ? (
            <div className="space-y-2">
              {permitEvents.permits.slice(0, 4).map((permit) => (
                <div
                  className="rounded-md border border-white/10 bg-white/[0.035] p-3"
                  key={permit.permit_id ?? permit.permit_number}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {formatDevelopmentDate(permit.activity_date)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {permit.permit_number ??
                          permit.permit_id ??
                          "Permit unavailable"}
                      </p>
                    </div>
                    <p className="text-right text-xs text-[#f0cd79]">
                      {permit.permit_amount !== null
                        ? formatCurrency(permit.permit_amount)
                        : "Amount n/a"}
                    </p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {formatDevelopmentLabel(permit.permit_type)} /{" "}
                    {formatDevelopmentLabel(permit.work_type)} /{" "}
                    {formatDevelopmentLabel(permit.permit_status)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-400">
              No permit events are available for this parcel.
            </p>
          )}
        </ReportCard>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <ReportCard eyebrow="E" title="Map Snapshot Placeholder">
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-6 text-center">
            <p className="max-w-sm text-sm leading-6 text-slate-400">
              Map snapshot export coming in future phase.
            </p>
          </div>
        </ReportCard>

        <ReportCard eyebrow="F" title="Executive Notes">
          <p className="text-sm leading-7 text-slate-300">{executiveNote}</p>
          {latestPermit ? (
            <p className="mt-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-500">
              Latest displayed permit:{" "}
              <span className="text-slate-200">
                {latestPermit.permit_number ??
                  latestPermit.permit_id ??
                  "Permit unavailable"}
              </span>
              .
            </p>
          ) : null}
        </ReportCard>
      </section>
    </article>
  );
}

function buildExecutiveNote({
  activityClass,
  buildabilityImpact,
  floodReviewRequired,
  floodSeverity,
  permitCount,
}: {
  activityClass: string | null;
  buildabilityImpact: string | null;
  floodReviewRequired: boolean | null;
  floodSeverity: string | null;
  permitCount: number | null;
}) {
  const statements: string[] = [];

  if (permitCount !== null) {
    statements.push(
      `This parcel has ${formatDevelopmentCount(
        permitCount,
      )} matched permit record${permitCount === 1 ? "" : "s"}.`,
    );
  }

  if (activityClass) {
    statements.push(
      `The current development activity class is ${formatLabel(activityClass).toLowerCase()}.`,
    );
  }

  if (floodReviewRequired === true) {
    statements.push(
      `FEMA flood constraint exposure indicates engineering review is recommended before development suitability is assumed.`,
    );
  } else if (floodReviewRequired === false) {
    statements.push(
      `The FEMA parcel overlay does not currently flag this parcel for flood engineering review.`,
    );
  }

  if (buildabilityImpact || floodSeverity) {
    statements.push(
      `Reported flood buildability impact is ${formatLabel(
        buildabilityImpact,
      ).toLowerCase()}, with ${formatLabel(
        floodSeverity,
      ).toLowerCase()} flood severity.`,
    );
  }

  return statements.length
    ? statements.join(" ")
    : "Select and hydrate a parcel with live intelligence to generate executive notes.";
}

function ReportCard({
  children,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[11px] font-semibold text-[#f0cd79]">
          {eyebrow}
        </span>
        {icon ? <span className="text-[#68d8ff]">{icon}</span> : null}
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-100">
        {value || "Unavailable"}
      </p>
    </div>
  );
}
