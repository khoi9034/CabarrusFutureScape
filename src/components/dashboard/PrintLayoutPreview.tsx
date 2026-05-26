"use client";

import { Clock3, FileText, Printer } from "lucide-react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { ComparisonSeverity } from "@/types/scenarioComparison";
import type { PrintableViewMode } from "@/types/reports";

const printableModeLabels: Record<PrintableViewMode, string> = {
  "board-packet": "Board Packet",
  briefing: "Briefing",
  "parcel-snapshot": "Parcel Snapshot",
  summary: "Summary",
};

const severityClass: Record<ComparisonSeverity, string> = {
  critical: "border-red-300/25 text-red-100",
  neutral: "border-white/10 text-slate-200",
  positive: "border-emerald-300/25 text-emerald-100",
  watch: "border-amber-300/25 text-amber-100",
};

export function PrintLayoutPreview() {
  const {
    activeBriefingPacket,
    activeReportPackage,
    exportHistory,
    lastExportResult,
    printableViewMode,
    setPrintableViewMode,
  } = useDashboardState();
  const previewSections = activeReportPackage.sections.slice(0, 2);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Print Preview
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {printableModeLabels[printableViewMode]}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]">
          <Printer className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(Object.keys(printableModeLabels) as PrintableViewMode[]).map(
          (mode) => {
            const active = mode === printableViewMode;

            return (
              <button
                className={cn(
                  "min-h-9 rounded-md border px-2 text-[11px] font-semibold transition",
                  active
                    ? "border-[#d8b86a]/40 bg-[#d8b86a]/10 text-[#f0cd79]"
                    : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-white/20 hover:text-slate-200",
                )}
                key={mode}
                onClick={() => setPrintableViewMode(mode)}
                type="button"
              >
                {printableModeLabels[mode]}
              </button>
            );
          },
        )}
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-[#f7f3ea] p-3 text-[#17202c] shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#17202c]/15 pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7a6330]">
              Cabarrus FutureScape
            </p>
            <h4 className="mt-1 text-sm font-bold leading-snug">
              {activeBriefingPacket.title}
            </h4>
          </div>
          <FileText className="h-4 w-4 shrink-0 text-[#7a6330]" />
        </div>

        <p className="mt-3 text-[11px] leading-5 text-[#394456]">
          {activeReportPackage.narrative}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {activeReportPackage.kpiSummaries.map((kpi) => (
            <div
              className="rounded border border-[#17202c]/10 bg-white/55 p-2"
              key={kpi.id}
            >
              <p className="truncate text-[8px] font-semibold uppercase text-[#6f7887]">
                {kpi.label}
              </p>
              <p className="mt-1 truncate text-xs font-bold">{kpi.value}</p>
              <p className="mt-0.5 truncate text-[9px] text-[#7a6330]">
                {kpi.delta}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {previewSections.map((section) => (
            <div
              className={cn(
                "rounded border bg-white/45 p-2",
                severityClass[section.severity],
              )}
              key={section.id}
            >
              <p className="text-[10px] font-bold text-[#17202c]">
                {section.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#465268]">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />
        <span className="truncate">
          {lastExportResult
            ? lastExportResult.message
            : exportHistory[0]?.title ?? "No mock export has run yet."}
        </span>
      </div>
    </section>
  );
}
