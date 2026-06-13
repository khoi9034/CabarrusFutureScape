"use client";

import { AlertTriangle, GraduationCap, School } from "lucide-react";
import {
  schoolAssignmentMethodMessage,
  schoolCapacityMissingMessage,
  schoolMissingAssignmentMessage,
  schoolPresentationUtilizationMessage,
  type SchoolConstraintPanelSource,
} from "@/lib/adapters/selectedParcelSchoolConstraintAdapter";
import { useSelectedParcelSchoolConstraint } from "@/hooks/useSelectedParcelSchoolConstraint";
import { cn } from "@/lib/utils";

interface SelectedParcelSchoolAssignmentPanelProps {
  officialParcelId: string | null | undefined;
}

const sourceLabels: Record<SchoolConstraintPanelSource, string> = {
  api: "Live",
  loading: "Loading",
  unavailable: "Unavailable",
  waiting: "Waiting",
};

export function SelectedParcelSchoolAssignmentPanel({
  officialParcelId,
}: SelectedParcelSchoolAssignmentPanelProps) {
  const {
    assignments,
    capacityMessage,
    constraintClassLabel,
    detail,
    errorMessage,
    isLoading,
    recommendedActionLabel,
    scoreLabel,
    source,
    utilizationCaveat,
    utilizationErrorMessage,
  } = useSelectedParcelSchoolConstraint(officialParcelId);
  const hasSelectedParcel = Boolean(officialParcelId);
  const hasMissingAssignment =
    detail?.elementary.has_assignment === false ||
    detail?.middle.has_assignment === false ||
    detail?.high.has_assignment === false;
  const sourceDescription =
    source === "api"
      ? "School assignment uses GET /constraints/schools/{official_parcel_id}."
      : source === "loading"
        ? "Checking selected parcel attendance-zone assignment."
        : source === "waiting"
          ? "Waiting for parcel selection."
          : "School assignment status is unavailable. No enrollment or capacity values are fabricated.";

  return (
    <section
      aria-label="Selected parcel school assignment"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            School Assignment
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
              source === "api"
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
                : source === "unavailable"
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300",
            )}
          >
            {sourceLabels[source]}
          </span>
          <GraduationCap className="h-4 w-4 text-[#8fe7ff]" />
        </div>
      </div>

      {!hasSelectedParcel ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Select a parcel to view attendance-zone school assignment.
        </p>
      ) : detail ? (
        <>
          <div className="mt-4 grid gap-2">
            {assignments.map((assignment) => (
              <SchoolAssignmentRow
                capacityLabel={assignment.capacityLabel}
                confidenceLabel={assignment.confidenceLabel}
                key={assignment.levelLabel}
                levelLabel={assignment.levelLabel}
                overlapLabel={assignment.overlapLabel}
                schoolName={assignment.schoolName}
                utilizationLabel={assignment.utilizationLabel}
                utilizationMetaLabel={assignment.utilizationMetaLabel}
              />
            ))}
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-[#f0cd79]" />
              <p className="text-[10px] font-medium uppercase text-slate-500">
                Assignment Readiness
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <SchoolSummaryTerm
                label="Confidence"
                value={formatSchoolPanelLabel(
                  detail.school_assignment_confidence,
                )}
              />
              <SchoolSummaryTerm
                label="Capacity"
                value={
                  detail.school_capacity_data_available
                    ? "Available"
                    : "Capacity Data Needed"
                }
              />
              <SchoolSummaryTerm label="Score" value={scoreLabel} />
              <SchoolSummaryTerm
                label="Class"
                value={constraintClassLabel}
              />
              <SchoolSummaryTerm
                label="Action"
                value={recommendedActionLabel}
              />
              <SchoolSummaryTerm
                label="Review"
                value={
                  detail.school_assignment_review_required
                    ? "Assignment Review Needed"
                    : "Not flagged"
                }
              />
            </dl>
          </div>

          <p className="mt-3 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.055] px-3 py-2 text-[11px] leading-5 text-slate-400">
            {schoolAssignmentMethodMessage}
          </p>

          {!detail.school_capacity_data_available ? (
            <p className="mt-2 rounded-md border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] px-3 py-2 text-[11px] leading-5 text-[#f0cd79]">
              {capacityMessage || schoolCapacityMissingMessage}
            </p>
          ) : null}

          <p className="mt-2 rounded-md border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.045] px-3 py-2 text-[11px] leading-5 text-slate-300">
            {utilizationCaveat || schoolPresentationUtilizationMessage}
          </p>

          {hasMissingAssignment ? (
            <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
              {schoolMissingAssignmentMessage}
            </p>
          ) : null}

          {detail.data_quality_flags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {detail.data_quality_flags.map((flag) => (
                <span
                  className="rounded border border-white/10 bg-white/[0.035] px-1.5 py-1 text-[10px] font-semibold uppercase text-slate-300"
                  key={flag}
                >
                  {formatSchoolPanelLabel(flag)}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          School assignment is unavailable for this parcel.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Loading attendance-zone assignment
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
      {utilizationErrorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {utilizationErrorMessage}
        </p>
      ) : null}
    </section>
  );
}

function SchoolAssignmentRow({
  capacityLabel,
  confidenceLabel,
  levelLabel,
  overlapLabel,
  schoolName,
  utilizationLabel,
  utilizationMetaLabel,
}: {
  capacityLabel: string;
  confidenceLabel: string;
  levelLabel: string;
  overlapLabel: string;
  schoolName: string;
  utilizationLabel: string;
  utilizationMetaLabel: string;
}) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start gap-3">
        <School className="mt-0.5 h-4 w-4 shrink-0 text-[#68d8ff]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase text-slate-500">
            {levelLabel}
          </p>
          <h4 className="mt-1 break-words text-sm font-semibold leading-5 text-white">
            {schoolName}
          </h4>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {overlapLabel} / {confidenceLabel} / {capacityLabel}
          </p>
          <div className="mt-2 rounded border border-[#8fe7ff]/15 bg-[#8fe7ff]/[0.04] px-2 py-1.5">
            <p className="text-[11px] font-semibold leading-4 text-slate-100">
              {utilizationLabel}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {utilizationMetaLabel}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function SchoolSummaryTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function formatSchoolPanelLabel(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  if (value === "not_available") {
    return "Capacity Data Needed";
  }

  if (value === "not_scored") {
    return "Not Scored";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
