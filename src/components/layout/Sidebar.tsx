"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, Layers3, SlidersHorizontal } from "lucide-react";
import { LayerToggle } from "@/components/dashboard/LayerToggle";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  dragging?: boolean;
  onResizeStart?: (event: ReactPointerEvent) => void;
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  collapsed = false,
  dragging = false,
  onResizeStart,
  onToggleCollapsed,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside
        aria-label="Collapsed map layer controls"
        className={cn(
          "app-chrome glass-panel cfs-layer-rail cfs-layer-rail--collapsed relative order-2 flex min-h-0 flex-col items-center gap-3 overflow-visible rounded-lg p-2 md:max-h-[72vh] lg:order-1 lg:max-h-none",
          dragging && "cfs-layer-rail--dragging",
        )}
      >
        <LayerRailEdgeHandle
          collapsed
          onPointerDown={onResizeStart}
          onToggleCollapsed={onToggleCollapsed}
        />
        <div
          aria-hidden="true"
          className="mt-2 flex h-10 w-10 items-center justify-center rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#9eeeff]"
        >
          <Layers3 className="h-4 w-4" />
        </div>
        <p className="mt-1 [writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Layers
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Explore and map layer control panel"
      className={cn(
        "app-chrome glass-panel cfs-layer-rail relative order-2 flex min-h-0 flex-col overflow-visible rounded-lg md:max-h-[72vh] lg:order-1 lg:max-h-none",
        dragging && "cfs-layer-rail--dragging",
      )}
    >
      <LayerRailEdgeHandle
        onPointerDown={onResizeStart}
        onToggleCollapsed={onToggleCollapsed}
      />
      <div className="no-scrollbar min-h-0 flex-1 overflow-auto rounded-lg p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">
              Explore
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-6 text-white">
              Map Layers
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#d8b86a]"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="space-y-3 pr-0 lg:pr-2">
          <LayerToggle />
          <p
            className={cn(
              "rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-[11px] leading-5 text-slate-500",
            )}
          >
            Registry, onboarding, scenario, and methodology notes now live in the
            Methodology workspace so this rail stays focused on map operations.
          </p>
        </div>
      </div>
    </aside>
  );
}

function LayerRailEdgeHandle({
  collapsed = false,
  onPointerDown,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
  onToggleCollapsed?: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onToggleCollapsed?.();
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="cfs-layer-rail-resize-zone absolute -right-1.5 top-2 bottom-2 z-20 hidden touch-none cursor-col-resize lg:block"
        onPointerDown={onPointerDown}
        title={
          collapsed
            ? "Drag right to expand map layers"
            : "Drag to resize map layers"
        }
      />
      <button
        aria-label={
          collapsed
            ? "Expand map layers panel"
            : "Collapse map layers panel"
        }
        aria-pressed={collapsed}
        className={cn(
          "cfs-layer-rail-arrow group absolute right-[-0.85rem] top-[44%] z-30 hidden -translate-y-1/2 touch-none items-center justify-center lg:flex",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed?.();
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        title={
          collapsed
            ? "Expand map layers panel"
            : "Collapse map layers panel"
        }
        type="button"
      >
        {collapsed ? (
          <ChevronRight className="relative h-4 w-4 text-slate-200 transition group-hover:text-[#f0cd79] group-focus-visible:text-[#f0cd79]" />
        ) : (
          <ChevronLeft className="relative h-4 w-4 text-slate-200 transition group-hover:text-[#f0cd79] group-focus-visible:text-[#f0cd79]" />
        )}
      </button>
    </>
  );
}
