"use client";

import {
  Bell,
  CheckCircle2,
  Eye,
  Layers3,
  MapPin,
  RadioTower,
  X,
} from "lucide-react";
import { useMemo, type ComponentType } from "react";
import { useOperationalEvents } from "@/hooks/useOperationalEvents";
import { useDashboardState } from "@/hooks/useDashboardState";
import { cn } from "@/lib/utils";
import type { OperationalEvent, OperationalEventSeverity } from "@/types/events";

const severityStyles: Record<
  OperationalEventSeverity,
  {
    className: string;
    label: string;
  }
> = {
  critical: {
    className: "border-red-300/25 bg-red-300/[0.08] text-red-100",
    label: "Critical",
  },
  info: {
    className: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]",
    label: "Info",
  },
  success: {
    className: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100",
    label: "Success",
  },
  warning: {
    className: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
    label: "Warning",
  },
};

const eventTypeLabels: Record<OperationalEvent["type"], string> = {
  infrastructure_flag: "Infrastructure",
  parcel_alert: "Parcel Alert",
  permit_activity: "Permit Activity",
  risk_notice: "Risk Notice",
  scenario_update: "Scenario",
  system_status: "System",
  zoning_update: "Zoning",
};

const eventIcons: Record<
  OperationalEvent["type"],
  ComponentType<{ className?: string }>
> = {
  infrastructure_flag: Layers3,
  parcel_alert: MapPin,
  permit_activity: MapPin,
  risk_notice: Layers3,
  scenario_update: Eye,
  system_status: RadioTower,
  zoning_update: CheckCircle2,
};

export function EventStreamPanel() {
  const {
    selectParcel,
    selectedParcelId,
    setScenarioId,
    toggleLayer,
  } = useDashboardState();
  const {
    activeFilter,
    dismissEvent,
    eventCountsBySeverity,
    filteredEvents,
    markEventRead,
    readEventIds,
    selectedParcelEvents,
    setActiveFilter,
    unreadCount,
  } = useOperationalEvents({ selectedParcelId });
  const visibleEvents = useMemo(() => filteredEvents.slice(0, 5), [
    filteredEvents,
  ]);
  const selectedParcelFilterActive = Boolean(activeFilter.parcelId);

  function executeEventAction(event: OperationalEvent) {
    const action = event.action;

    if (!action) {
      markEventRead(event.id);
      return;
    }

    switch (action.type) {
      case "focus-parcel":
        selectParcel(action.parcelId, { source: "dashboard" });
        break;
      case "switch-scenario":
        setScenarioId(action.scenarioId);
        break;
      case "toggle-layer":
        toggleLayer(action.layerId);
        break;
    }

    markEventRead(event.id);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Event Stream
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Operational Events
          </h3>
        </div>
        <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]">
          <Bell className="h-4 w-4" />
          {unreadCount ? (
            <span className="absolute -right-1 -top-1 rounded-full border border-[#08111d] bg-[#ff8d7a] px-1 text-[9px] font-semibold text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {Object.entries(eventCountsBySeverity).map(([severity, count]) => (
          <div
            className="rounded-md border border-white/10 bg-white/[0.035] p-2"
            key={severity}
          >
            <p className="text-[10px] uppercase text-slate-500">
              {severityStyles[severity as OperationalEventSeverity].label}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {count}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={filterButtonClass(
            !selectedParcelFilterActive && Boolean(activeFilter.includeRead),
          )}
          onClick={() => setActiveFilter({ includeRead: true })}
          type="button"
        >
          All
        </button>
        <button
          className={filterButtonClass(activeFilter.includeRead === false)}
          onClick={() => setActiveFilter({ includeRead: false })}
          type="button"
        >
          Unread
        </button>
        <button
          className={filterButtonClass(selectedParcelFilterActive)}
          disabled={!selectedParcelId}
          onClick={() =>
            setActiveFilter({
              includeRead: true,
              parcelId: selectedParcelId ?? undefined,
            })
          }
          type="button"
        >
          Parcel {selectedParcelEvents.length}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {visibleEvents.length ? (
          visibleEvents.map((event) => (
            <EventStreamItem
              event={event}
              key={event.id}
              onDismiss={() => dismissEvent(event.id)}
              onExecute={() => executeEventAction(event)}
              onMarkRead={() => markEventRead(event.id)}
              read={readEventIds.has(event.id)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">
            No operational events match the active filter.
          </div>
        )}
      </div>
    </section>
  );
}

interface EventStreamItemProps {
  event: OperationalEvent;
  onDismiss: () => void;
  onExecute: () => void;
  onMarkRead: () => void;
  read: boolean;
}

function EventStreamItem({
  event,
  onDismiss,
  onExecute,
  onMarkRead,
  read,
}: EventStreamItemProps) {
  const Icon = eventIcons[event.type];

  return (
    <article
      className={cn(
        "rounded-lg border p-3 transition",
        read
          ? "border-white/10 bg-white/[0.025] opacity-75"
          : "border-white/12 bg-white/[0.045]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
            severityStyles[event.severity].className,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">
              {event.title}
            </p>
            {!read ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d8b86a]" />
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
            {event.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase text-slate-500">
            <span>{eventTypeLabels[event.type]}</span>
            <span>{formatEventTimestamp(event.timestamp)}</span>
            {event.parcelId ? <span>{event.parcelId}</span> : null}
            {event.layerId ? <span>{event.layerId}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {event.action ? (
          <button
            className="rounded-md border border-[#68d8ff]/20 bg-[#68d8ff]/10 px-2.5 py-1.5 text-xs font-medium text-[#8fe7ff] transition hover:border-[#68d8ff]/40 hover:bg-[#68d8ff]/15"
            onClick={onExecute}
            type="button"
          >
            {event.action.label}
          </button>
        ) : null}
        <button
          className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
          onClick={onMarkRead}
          type="button"
        >
          Mark read
        </button>
        <button
          aria-label={`Dismiss ${event.title}`}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-slate-500 transition hover:border-white/20 hover:text-white"
          onClick={onDismiss}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function filterButtonClass(active: boolean) {
  return cn(
    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border-[#d8b86a]/35 bg-[#d8b86a]/10 text-[#f0cd79]"
      : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-white/20 hover:text-white",
  );
}

function formatEventTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}
