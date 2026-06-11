"use client";

import { Droplets, ShieldAlert } from "lucide-react";
import { useSelectedParcelFloodConstraint } from "@/hooks/useSelectedParcelFloodConstraint";
import type { FloodConstraintPanelSource } from "@/lib/adapters/selectedParcelFloodConstraintAdapter";
import { cn } from "@/lib/utils";

interface SelectedParcelFloodConstraintPanelProps {
  officialParcelId: string | null | undefined;
}

const sourceLabels: Record<FloodConstraintPanelSource, string> = {
  api: "Live",
  loading: "Loading",
  unavailable: "Unavailable",
  waiting: "Waiting",
};

const yesNoLabel = (value: boolean) => (value ? "Yes" : "No");
const reviewLabel = (value: boolean) =>
  value ? "Recommended" : "Not flagged";

function formatFloodPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatFloodNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
}

function formatFloodLabel(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function SelectedParcelFloodConstraintPanel({
  officialParcelId,
}: SelectedParcelFloodConstraintPanelProps) {
  const { constraint, errorMessage, isLoading, source } =
    useSelectedParcelFloodConstraint(officialParcelId);
  const hasSelectedParcel = Boolean(officialParcelId);
  const sourceDescription =
    source === "api"
      ? "Selected parcel flood status is based on the FEMA NFHL parcel overlay."
      : source === "loading"
        ? "Checking selected parcel FEMA flood status."
        : source === "waiting"
          ? "Waiting for parcel selection."
          : "FEMA flood constraint status is unavailable. No flood values are fabricated.";

  return (
    <section
      aria-label="Selected parcel flood constraints"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Flood Constraints
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
          <Droplets className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {!hasSelectedParcel ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Select a parcel to view FEMA flood constraint status.
        </p>
      ) : constraint ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <FloodMetric
              label="Dominant Zone"
              value={constraint.dominant_flood_zone ?? "Unavailable"}
            />
            <FloodMetric
              label="Flood-Constrained Area"
              value={formatFloodPercent(constraint.percent_parcel_constrained)}
            />
            <FloodMetric
              label="Located within FEMA Floodway"
              value={yesNoLabel(constraint.floodway_present)}
            />
            <FloodMetric
              label="Located within SFHA"
              value={yesNoLabel(constraint.sfha_present)}
            />
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-[#ff8d7a]" />
              <p className="text-[10px] font-medium uppercase text-slate-500">
                Review & Buildability
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <SummaryTerm
                label="Engineering Review"
                value={reviewLabel(constraint.flood_review_required)}
              />
              <SummaryTerm
                label="Buildability"
                value={formatFloodLabel(constraint.buildability_impact)}
              />
              <SummaryTerm
                label="Severity"
                value={formatFloodLabel(constraint.flood_severity_class)}
              />
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Flood constraint score:{" "}
              <span className="font-semibold text-slate-100">
                {formatFloodNumber(constraint.flood_constraint_score)}
              </span>
            </p>
          </div>

          <p className="mt-3 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.055] px-3 py-2 text-[11px] leading-5 text-slate-400">
            Zone codes:{" "}
            <span className="font-semibold text-slate-100">
              {constraint.flood_zone_codes.length
                ? constraint.flood_zone_codes.join(", ")
                : "Unavailable"}
            </span>
            . Overlay confidence:{" "}
            <span className="font-semibold text-slate-100">
              {formatFloodLabel(constraint.overlay_confidence)}
            </span>
            .
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Flood constraint status is not available for this parcel.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Loading FEMA flood constraint status
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function FloodMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
