"use client";

import { useState } from "react";
import {
  Activity,
  Bell,
  Command,
  LayoutDashboard,
  Map,
  RadioTower,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  appIdentity,
  dashboardStatusLabels,
} from "@/data/mock/dashboardMockData";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useDashboardState } from "@/hooks/useDashboardState";
import { dashboardRoleRegistry } from "@/lib/dashboard/roleRegistry";
import { workspaceLayoutPresets } from "@/lib/dashboard/workspacePresets";
import type { DashboardRoleId } from "@/types/userRoles";
import type { DashboardViewMode } from "@/types/workspace";

export function TopNav() {
  const {
    activeRole,
    activeWorkspacePreset,
    applyRolePreset,
    applyWorkspacePreset,
    mapStatus,
    roleId,
    scenarioName,
    selectedParcelId,
    viewMode,
  } = useDashboardState();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <>
      <CommandPalette
        onOpenChange={setCommandPaletteOpen}
        open={commandPaletteOpen}
      />

      <header className="relative z-20 flex h-auto shrink-0 flex-col gap-3 border-b border-white/10 bg-[#060b12]/88 px-3 py-3 backdrop-blur-2xl lg:h-[76px] lg:flex-row lg:items-center lg:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#d8b86a]/40 bg-[#d8b86a]/[0.12] shadow-[0_0_28px_rgba(216,184,106,0.22)]">
          <Map className="h-5 w-5 text-[#f0cd79]" />
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-[#060b12] bg-[#55d38f]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-[#d8b86a]">
            {appIdentity.eyebrow}
          </p>
          <h1 className="truncate text-xl font-semibold text-white">
            {appIdentity.productName}
          </h1>
        </div>
      </div>

      <div className="hidden h-10 w-px bg-white/10 lg:block" />

      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(170px,210px)_minmax(190px,230px)_auto] lg:items-center">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            aria-label="Open command search"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
            onClick={() => setCommandPaletteOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setCommandPaletteOpen(true);
              }
            }}
            placeholder={appIdentity.searchPlaceholder}
            readOnly
            type="search"
          />
        </label>

        <label className="relative block">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d8b86a]" />
          <select
            aria-label="Dashboard role"
            className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-8 text-sm text-white outline-none transition focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
            onChange={(event) =>
              applyRolePreset(event.target.value as DashboardRoleId)
            }
            title={activeRole.description}
            value={roleId}
          >
            {dashboardRoleRegistry.map((role) => (
              <option
                className="bg-[#08111d] text-white"
                key={role.id}
                value={role.id}
              >
                {role.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <LayoutDashboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d8b86a]" />
          <select
            aria-label="Workspace view mode"
            className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-white/[0.045] pl-9 pr-8 text-sm text-white outline-none transition focus:border-[#d8b86a]/50 focus:bg-white/[0.07]"
            onChange={(event) =>
              applyWorkspacePreset(event.target.value as DashboardViewMode)
            }
            title={activeWorkspacePreset.description}
            value={viewMode}
          >
            {workspaceLayoutPresets.map((preset) => (
              <option
                className="bg-[#08111d] text-white"
                key={preset.id}
                value={preset.id}
              >
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            icon={RadioTower}
            label={dashboardStatusLabels[mapStatus]}
            tone={
              mapStatus === "online"
                ? "green"
                : mapStatus === "degraded"
                  ? "red"
                  : "gold"
            }
          />
          <StatusBadge icon={Activity} label={scenarioName} tone="blue" />
          <StatusBadge
            icon={ShieldCheck}
            label={selectedParcelId ?? "No parcel"}
            tone="gold"
          />
        </div>
      </div>

      <div className="hidden items-center gap-2 xl:flex">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
          onClick={() => setCommandPaletteOpen(true)}
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
    </>
  );
}
