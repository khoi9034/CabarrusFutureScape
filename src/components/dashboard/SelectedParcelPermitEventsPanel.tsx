"use client";

import { CalendarDays, FileText, ReceiptText } from "lucide-react";
import {
  formatDevelopmentCompact,
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useSelectedParcelPermitEvents } from "@/hooks/useSelectedParcelPermitEvents";
import type { SelectedParcelPanelSource } from "@/lib/adapters/selectedParcelDevelopmentActivityAdapter";
import { cn } from "@/lib/utils";
import type { DevelopmentParcelPermitEvent } from "@/types/api";

interface SelectedParcelPermitEventsPanelProps {
  officialParcelId: string | null | undefined;
}

const sourceLabels: Record<SelectedParcelPanelSource, string> = {
  api: "FastAPI",
  fallback: "Unavailable",
  loading: "Loading API",
  static: "API off",
  waiting: "Waiting",
};

function formatPermitAmount(value: number | null) {
  if (value === null) {
    return "Amount unavailable";
  }

  return `$${formatDevelopmentCompact(value)}`;
}

export function SelectedParcelPermitEventsPanel({
  officialParcelId,
}: SelectedParcelPermitEventsPanelProps) {
  const { errorMessage, isLoading, permits, source, totalCount } =
    useSelectedParcelPermitEvents(officialParcelId);
  const hasSelectedParcel = Boolean(officialParcelId);
  const sourceDescription =
    source === "api"
      ? "Permit events are loaded from GET /development/parcel/{official_parcel_id}/permits."
      : source === "fallback"
        ? "The permit event API is unavailable. No static permit-event records are shown."
        : source === "loading"
          ? "Loading selected parcel permit events from FastAPI."
          : source === "waiting"
            ? "Waiting for parcel selection."
            : "Permit event records require backend API mode; static fallback does not fabricate permit rows.";

  return (
    <section
      aria-label="Selected parcel permit event list"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Permit Events
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Selected Parcel Timeline
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase",
              source === "api"
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"
                : source === "fallback"
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-100"
                  : source === "waiting"
                    ? "border-white/10 bg-white/[0.04] text-slate-300"
                  : "border-sky-300/20 bg-sky-300/[0.055] text-sky-100",
            )}
          >
            {sourceLabels[source]}
          </span>
          <FileText className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {!hasSelectedParcel ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Waiting for parcel selection.
        </p>
      ) : permits.length > 0 ? (
        <div className="mt-4 space-y-2">
          {permits.map((permit, index) => (
            <PermitEventRow
              key={`${permit.permit_id ?? "permit"}-${permit.permit_number ?? index}`}
              permit={permit}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          No permit events found for this parcel.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
        {hasSelectedParcel
          ? ` Showing ${formatDevelopmentCount(
              permits.length,
            )} of ${formatDevelopmentCount(totalCount)} events.`
          : null}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Waiting for selected parcel permit records
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

function PermitEventRow({ permit }: { permit: DevelopmentParcelPermitEvent }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#d8b86a]" />
            <h4 className="truncate text-sm font-semibold text-white">
              {formatDevelopmentDate(permit.activity_date)}
            </h4>
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {permit.permit_number ?? permit.permit_id ?? "Permit ID unavailable"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-[#f0cd79]">
            {formatPermitAmount(permit.permit_amount)}
          </p>
          <p className="mt-0.5 text-[10px] uppercase text-slate-500">
            {permit.relationship_confidence ?? "confidence n/a"}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <MiniPermitField
          label="Type"
          value={formatDevelopmentLabel(permit.permit_type)}
        />
        <MiniPermitField
          label="Work"
          value={formatDevelopmentLabel(permit.work_type)}
        />
        <MiniPermitField
          label="Status"
          value={formatDevelopmentLabel(permit.permit_status)}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <PermitSegmentBadge value={permit.permit_segment} />
        <PermitSegmentBadge value={permit.permit_growth_signal} />
        <PermitSegmentBadge value={permit.permit_status_stage} />
        <PermitSegmentBadge value={permit.permit_value_class} />
      </div>
    </article>
  );
}

function PermitSegmentBadge({ value }: { value: string | null }) {
  if (!value || value === "unknown") {
    return null;
  }

  return (
    <span className="rounded border border-[#68d8ff]/20 bg-[#68d8ff]/[0.07] px-1.5 py-1 text-[10px] font-semibold uppercase text-[#a7efff]">
      {formatDevelopmentLabel(value)}
    </span>
  );
}

interface MiniPermitFieldProps {
  label: string;
  value: string;
}

function MiniPermitField({ label, value }: MiniPermitFieldProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <ReceiptText className="h-3 w-3 shrink-0 text-slate-500" />
        <p className="text-[10px] uppercase text-slate-500">{label}</p>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}
