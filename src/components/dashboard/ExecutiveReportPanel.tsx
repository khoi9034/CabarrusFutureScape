"use client";

import { ClipboardList, Download, FileText, Printer } from "lucide-react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { ComparisonSeverity } from "@/types/scenarioComparison";
import type { ReportPackageId } from "@/types/reports";

const statusClass: Record<ComparisonSeverity, string> = {
  critical: "border-red-300/25 bg-red-300/[0.08] text-red-100",
  neutral: "border-white/10 bg-white/[0.035] text-slate-200",
  positive: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
  watch: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
};

export function ExecutiveReportPanel() {
  const {
    activeReportPackage,
    activeReportPackageId,
    exportJobState,
    exportProgress,
    generateBoardBrief,
    lastExportResult,
    openPrintLayout,
    reportPackages,
    runMockExport,
    selectReportPackage,
  } = useDashboardState();

  if (!reportPackages.length) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-medium uppercase text-slate-500">
          Report Package
        </p>
        <h3 className="mt-1 text-base font-semibold text-white">
          No report packages available
        </h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Phase 1 report packages are mock-local. No export service is connected.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Report Package
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {activeReportPackage.title}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]">
          <FileText className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {activeReportPackage.subtitle}
      </p>
      <div className="mt-3 inline-flex rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[10px] font-semibold uppercase text-[#f0cd79]">
        Mock export only
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
          Active Package
        </span>
        <select
          aria-label="Report package"
          className="h-9 w-full rounded-md border border-white/10 bg-white/[0.045] px-2 text-xs text-white outline-none transition focus:border-[#d8b86a]/50"
          onChange={(event) =>
            selectReportPackage(event.target.value as ReportPackageId)
          }
          value={activeReportPackageId}
        >
          {reportPackages.map((reportPackage) => (
            <option
              className="bg-[#08111d] text-white"
              key={reportPackage.id}
              value={reportPackage.id}
            >
              {reportPackage.title}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {activeReportPackage.kpiSummaries.map((kpi) => (
          <div
            className={cn("rounded-md border p-2", statusClass[kpi.status])}
            key={kpi.id}
          >
            <p className="truncate text-[10px] uppercase opacity-70">
              {kpi.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{kpi.value}</p>
            <p
              className="mt-0.5 truncate text-[10px]"
              style={{ color: kpi.accent }}
            >
              {kpi.delta}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-start gap-2">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#d8b86a]" />
          <div>
            <p className="text-xs font-semibold text-white">
              Mock Export State
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              {lastExportResult?.message ??
                "No real document is generated yet. Actions prepare local mock export state for future PDF and board-packet services."}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#d8b86a] transition-all"
            style={{ width: `${exportProgress}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] uppercase text-slate-500">
          {exportJobState}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          aria-label={`Prepare mock PDF export for ${activeReportPackage.title}`}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 text-[11px] font-semibold text-[#f0cd79] transition hover:border-[#d8b86a]/40 hover:bg-[#d8b86a]/15"
          onClick={() => runMockExport("pdf")}
          title="Prepare mock PDF export state"
          type="button"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
        <button
          aria-label={`Open print preview for ${activeReportPackage.title}`}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
          onClick={() => openPrintLayout("briefing")}
          title="Open mock print layout"
          type="button"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
        <button
          aria-label="Generate mock board brief"
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 px-2 text-[11px] font-semibold text-[#8fe7ff] transition hover:border-[#68d8ff]/40 hover:bg-[#68d8ff]/15"
          onClick={generateBoardBrief}
          title="Generate mock board brief"
          type="button"
        >
          <FileText className="h-3.5 w-3.5" />
          Board
        </button>
      </div>
    </section>
  );
}
