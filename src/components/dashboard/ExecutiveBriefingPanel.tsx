"use client";

import { AlertTriangle, CheckCircle2, FileText, Landmark } from "lucide-react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { ComparisonSeverity } from "@/types/scenarioComparison";

const severityClass: Record<ComparisonSeverity, string> = {
  critical: "border-red-300/25 bg-red-300/[0.08] text-red-100",
  neutral: "border-white/10 bg-white/[0.035] text-slate-200",
  positive: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
  watch: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
};

export function ExecutiveBriefingPanel() {
  const {
    briefingGenerationState,
    briefingSections,
    executiveBriefing,
    selectedExecutiveNarrative,
  } = useDashboardState();

  return (
    <section className="rounded-lg border border-[#d8b86a]/20 bg-[#d8b86a]/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-[#d8b86a]">
            Executive Briefing
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {executiveBriefing.title}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8b86a]/25 bg-black/20 text-[#f0cd79]">
          <FileText className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-[#f6e3aa]/75">
        {executiveBriefing.subtitle}
      </p>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
          <div>
            <p className="text-xs font-semibold text-white">
              {selectedExecutiveNarrative.title}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              {selectedExecutiveNarrative.body}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BriefingList
          icon="opportunity"
          items={executiveBriefing.topOpportunities}
          title="Top Opportunities"
        />
        <BriefingList
          icon="risk"
          items={executiveBriefing.topRisks}
          title="Top Risks"
        />
      </div>

      <div className="mt-3 space-y-2">
        <BriefingSummary
          label="Infrastructure Outlook"
          value={executiveBriefing.infrastructureOutlook}
        />
        <BriefingSummary
          label="Growth Pressure"
          value={executiveBriefing.growthPressureSummary}
        />
        <BriefingSummary
          label="Mock Recommendation"
          value={executiveBriefing.recommendation}
        />
      </div>

      <div className="mt-3 space-y-2">
        {briefingSections.map((section) => (
          <div
            className={cn(
              "rounded-md border p-3",
              severityClass[section.severity],
            )}
            key={section.id}
          >
            <p className="text-xs font-semibold">{section.title}</p>
            <p className="mt-1 text-[11px] leading-4 opacity-75">
              {section.body}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] uppercase text-[#f6e3aa]/45">
        {executiveBriefing.generatedAtLabel} / {briefingGenerationState}
      </p>
    </section>
  );
}

function BriefingList({
  icon,
  items,
  title,
}: {
  icon: "opportunity" | "risk";
  items: string[];
  title: string;
}) {
  const Icon = icon === "opportunity" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-400">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            icon === "opportunity" ? "text-emerald-200" : "text-amber-200",
          )}
        />
        {title}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <p className="text-[11px] leading-4 text-slate-400" key={item}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function BriefingSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-medium uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{value}</p>
    </div>
  );
}
