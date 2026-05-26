"use client";

import { BriefcaseBusiness, CheckCircle2, MapPinned } from "lucide-react";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { RoleOperationalInsight } from "@/types/userRoles";

const insightToneClass: Record<RoleOperationalInsight["severity"], string> = {
  critical: "border-red-300/25 bg-red-300/[0.08] text-red-100",
  info: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]",
  success: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
  warning: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
};

export function RoleIntelligencePanel() {
  const { activeDashboardPanelIds, activeRole } = useDashboardState();

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Role Intelligence
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {activeRole.displayName}
          </h3>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]">
          <BriefcaseBusiness className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {activeRole.description}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {activeRole.roleKpiSummaries.map((summary) => (
          <div
            className="rounded-md border border-white/10 bg-white/[0.035] p-2"
            key={summary.id}
          >
            <p className="truncate text-[10px] uppercase text-slate-500">
              {summary.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {summary.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {activeDashboardPanelIds.map((panelId) => (
          <span
            className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-medium uppercase text-slate-500"
            key={panelId}
          >
            {panelId.replaceAll("-", " ")}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-[#68d8ff]" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-200">
            {activeRole.defaultMapViewpoint.label}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Mock viewpoint / scale {activeRole.defaultMapViewpoint.scale}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {activeRole.operationalInsights.map((insight) => (
          <div
            className={cn(
              "rounded-md border p-3",
              insightToneClass[insight.severity],
            )}
            key={insight.id}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">{insight.title}</p>
                <p className="mt-1 text-[11px] leading-4 opacity-75">
                  {insight.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
