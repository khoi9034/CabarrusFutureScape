"use client";

import {
  Activity,
  CalendarDays,
  FileClock,
  Hammer,
  ReceiptText,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  formatDevelopmentCompact,
  formatDevelopmentCount,
  formatDevelopmentDate,
  formatDevelopmentLabel,
} from "@/data/intelligence/developmentActivityMetrics";
import { useSelectedParcelDevelopmentActivity } from "@/hooks/useSelectedParcelDevelopmentActivity";
import { useSelectedParcelPermitSegments } from "@/hooks/useSelectedParcelPermitSegments";
import type { SelectedParcelPanelSource } from "@/lib/adapters/selectedParcelDevelopmentActivityAdapter";
import { cn } from "@/lib/utils";

interface SelectedParcelDevelopmentActivityPanelProps {
  officialParcelId: string | null | undefined;
}

const sourceLabels: Record<SelectedParcelPanelSource, string> = {
  api: "FastAPI",
  fallback: "Static fallback",
  loading: "Loading API",
  static: "Static",
  waiting: "Waiting",
};

function yearFromDate(value: string | null | undefined) {
  if (!value) {
    return "Unavailable";
  }

  return value.slice(0, 4);
}

export function SelectedParcelDevelopmentActivityPanel({
  officialParcelId,
}: SelectedParcelDevelopmentActivityPanelProps) {
  const { activity, errorMessage, isLoading, source } =
    useSelectedParcelDevelopmentActivity(officialParcelId);
  const permitSegments = useSelectedParcelPermitSegments(officialParcelId);
  const segmentSummary = permitSegments.summary;
  const hasSelectedParcel = Boolean(officialParcelId);
  const sourceDescription =
    source === "api"
      ? "Selected parcel activity is loaded from GET /development/hotspots filtered by official parcel ID."
      : source === "fallback"
        ? "FastAPI selected parcel activity is unavailable, so this panel is using generated static activity artifacts when the selected parcel appears there."
        : source === "loading"
          ? "Checking FastAPI for selected parcel development activity."
          : source === "waiting"
            ? "Waiting for parcel selection."
            : "Selected parcel development activity uses generated static artifacts.";

  return (
    <section
      aria-label="Selected parcel development activity"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Development Activity
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
          <Activity className="h-4 w-4 text-[#68d8ff]" />
        </div>
      </div>

      {!hasSelectedParcel ? (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Waiting for parcel selection.
        </p>
      ) : activity ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ActivityMetric
              icon={<ReceiptText className="h-4 w-4 text-[#f0cd79]" />}
              label="Total Permits"
              value={formatDevelopmentCount(activity.total_permit_count)}
            />
            <ActivityMetric
              icon={<FileClock className="h-4 w-4 text-[#68d8ff]" />}
              label="Latest Status"
              value={formatDevelopmentLabel(activity.latest_permit_status)}
            />
            <ActivityMetric
              icon={<Hammer className="h-4 w-4 text-[#55d38f]" />}
              label="Dominant Type"
              value={formatDevelopmentLabel(activity.dominant_permit_type)}
            />
            <ActivityMetric
              icon={<Hammer className="h-4 w-4 text-[#c8a4ff]" />}
              label="Dominant Work"
              value={formatDevelopmentLabel(activity.dominant_work_type)}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <TinyMetric
              label="Recent 1Y"
              value={formatDevelopmentCount(activity.recent_permit_count_1yr)}
            />
            <TinyMetric
              label="Recent 3Y"
              value={formatDevelopmentCount(activity.recent_permit_count_3yr)}
            />
            <TinyMetric
              label="Amount"
              value={`$${formatDevelopmentCompact(activity.total_permit_amount)}`}
            />
          </div>

          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-[#d8b86a]" />
              <p className="text-[10px] font-medium uppercase text-slate-500">
                Timeline Summary
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <SummaryTerm
                label="First Year"
                value={yearFromDate(activity.first_permit_date)}
              />
              <SummaryTerm
                label="Latest Year"
                value={yearFromDate(activity.latest_permit_date)}
              />
              <SummaryTerm
                label="Active Years"
                value={formatDevelopmentCount(activity.active_year_count)}
              />
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Latest permit date:{" "}
              <span className="text-slate-300">
                {formatDevelopmentDate(activity.latest_permit_date)}
              </span>
            </p>
          </div>

          <p className="mt-3 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.055] px-3 py-2 text-[11px] leading-5 text-slate-400">
            Activity class:{" "}
            <span className="font-semibold text-slate-100">
              {formatDevelopmentLabel(activity.development_activity_class)}
            </span>
            {activity.has_unmatched_or_ambiguous_permit_flag
              ? " with relationship QA flags present."
              : " with no unmatched or ambiguous permit relationship flag."}
          </p>

          <div className="mt-3 rounded-md border border-[#55d38f]/15 bg-[#55d38f]/[0.045] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase text-slate-500">
                Segment Intelligence
              </p>
              <span className="rounded border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                {permitSegments.source === "api"
                  ? "FastAPI"
                  : permitSegments.source === "loading"
                    ? "Loading"
                    : permitSegments.source === "waiting"
                      ? "Waiting"
                      : "Unavailable"}
              </span>
            </div>
            {segmentSummary ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <TinyMetric
                    label="Dominant Segment"
                    value={formatDevelopmentLabel(
                      segmentSummary.dominant_permit_segment,
                    )}
                  />
                  <TinyMetric
                    label="Growth Signal"
                    value={formatDevelopmentLabel(
                      segmentSummary.dominant_growth_signal,
                    )}
                  />
                  <TinyMetric
                    label="Active Construction"
                    value={formatDevelopmentCount(
                      segmentSummary.active_construction_permits,
                    )}
                  />
                  <TinyMetric
                    label="Redevelopment"
                    value={formatDevelopmentCount(
                      segmentSummary.redevelopment_signal_permits,
                    )}
                  />
                  <TinyMetric
                    label="High / Major Value"
                    value={formatDevelopmentCount(
                      segmentSummary.high_value_permits +
                        segmentSummary.major_value_permits,
                    )}
                  />
                  <TinyMetric
                    label="Avg / Max Score"
                    value={[
                      segmentSummary.permit_signal_score_avg?.toFixed(1),
                      segmentSummary.permit_signal_score_max?.toFixed(1),
                    ]
                      .filter(Boolean)
                      .join(" / ") || "Unavailable"}
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-400">
                {permitSegments.source === "loading"
                  ? "Loading parcel permit segment summary."
                  : "Permit segment summary is not available for this parcel."}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-400">
          Development activity not yet available for this parcel.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        {sourceDescription}
      </p>
      {isLoading ? (
        <p className="mt-2 text-[11px] uppercase text-slate-500">
          Preserving available static activity while FastAPI responds
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

interface ActivityMetricProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function ActivityMetric({ icon, label, value }: ActivityMetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      {icon}
      <p className="mt-2 text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

interface TinyMetricProps {
  label: string;
  value: string;
}

function TinyMetric({ label, value }: TinyMetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 px-2 py-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function SummaryTerm({ label, value }: TinyMetricProps) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-slate-100">{value}</dd>
    </div>
  );
}
