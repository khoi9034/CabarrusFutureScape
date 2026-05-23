"use client";

import {
  Activity,
  Bell,
  Command,
  Map,
  RadioTower,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardState } from "@/state/dashboard-store";

const mapStatusLabels = {
  idle: "Standby",
  loading: "Loading Scene",
  online: "Scene Online",
  degraded: "Scene Degraded",
};

export function TopNav() {
  const { mapStatus, scenarioName, selectedParcelId } = useDashboardState();

  return (
    <header className="relative z-20 flex h-auto shrink-0 flex-col gap-3 border-b border-white/10 bg-[#060b12]/88 px-3 py-3 backdrop-blur-2xl lg:h-[76px] lg:flex-row lg:items-center lg:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#d8b86a]/40 bg-[#d8b86a]/[0.12] shadow-[0_0_28px_rgba(216,184,106,0.22)]">
          <Map className="h-5 w-5 text-[#f0cd79]" />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[#060b12] bg-[#55d38f]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-[#d8b86a]">
            Cabarrus County Digital Twin
          </p>
          <h1 className="truncate text-xl font-semibold text-white">
            Cabarrus FutureScape
          </h1>
        </div>
      </div>

      <div className="hidden h-10 w-px bg-white/10 lg:block" />

      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
            placeholder="Search parcel, corridor, permit, scenario"
            type="search"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            icon={RadioTower}
            label={mapStatusLabels[mapStatus]}
            tone={mapStatus === "online" ? "green" : mapStatus === "degraded" ? "red" : "gold"}
          />
          <StatusPill icon={Activity} label={scenarioName} tone="blue" />
          <StatusPill icon={ShieldCheck} label={selectedParcelId} tone="gold" />
        </div>
      </div>

      <div className="hidden items-center gap-2 xl:flex">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
          title="Command palette"
          type="button"
        >
          <Command className="h-4 w-4" />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
          title="Notifications"
          type="button"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

interface StatusPillProps {
  icon: typeof Activity;
  label: string;
  tone: "gold" | "green" | "blue" | "red";
}

const toneStyles = {
  gold: "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  blue: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  red: "border-rose-300/25 bg-rose-400/10 text-rose-200",
};

function StatusPill({ icon: Icon, label, tone }: StatusPillProps) {
  return (
    <div
      className={cn(
        "flex h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-xs font-medium",
        toneStyles[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
