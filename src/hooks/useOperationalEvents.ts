"use client";

import { useCallback, useMemo, useState } from "react";
import { mockEventStreamAdapter } from "@/lib/dashboard/eventStreamAdapter";
import type {
  EventStreamFilter,
  OperationalEventSeverity,
} from "@/types/events";

interface UseOperationalEventsOptions {
  selectedParcelId?: string | null;
}

const severityOrder: OperationalEventSeverity[] = [
  "critical",
  "warning",
  "info",
  "success",
];

export function useOperationalEvents({
  selectedParcelId,
}: UseOperationalEventsOptions = {}) {
  const [readEventIds, setReadEventIds] = useState<Set<string>>(() => new Set());
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeFilter, setActiveFilter] = useState<EventStreamFilter>({
    includeRead: true,
  });

  const events = useMemo(
    () =>
      mockEventStreamAdapter
        .getOperationalEvents()
        .filter((event) => !dismissedEventIds.has(event.id)),
    [dismissedEventIds],
  );

  const filteredEvents = useMemo(() => {
    const visibleEvents = mockEventStreamAdapter.filterOperationalEvents(
      events,
      activeFilter,
    );

    return activeFilter.includeRead
      ? visibleEvents
      : visibleEvents.filter((event) => !readEventIds.has(event.id));
  }, [activeFilter, events, readEventIds]);

  const selectedParcelEvents = useMemo(
    () =>
      selectedParcelId
        ? events.filter((event) => event.parcelId === selectedParcelId)
        : [],
    [events, selectedParcelId],
  );

  const eventCountsBySeverity = useMemo(
    () =>
      severityOrder.reduce<Record<OperationalEventSeverity, number>>(
        (counts, severity) => ({
          ...counts,
          [severity]: events.filter((event) => event.severity === severity)
            .length,
        }),
        {
          critical: 0,
          info: 0,
          success: 0,
          warning: 0,
        },
      ),
    [events],
  );

  const unreadCount = useMemo(
    () => events.filter((event) => !readEventIds.has(event.id)).length,
    [events, readEventIds],
  );

  const markEventRead = useCallback((eventId: string) => {
    mockEventStreamAdapter.markEventRead(eventId);
    setReadEventIds((current) => new Set(current).add(eventId));
  }, []);

  const dismissEvent = useCallback((eventId: string) => {
    mockEventStreamAdapter.dismissEvent(eventId);
    setDismissedEventIds((current) => new Set(current).add(eventId));
  }, []);

  const resetEventState = useCallback(() => {
    setReadEventIds(new Set());
    setDismissedEventIds(new Set());
    setActiveFilter({ includeRead: true });
  }, []);

  return {
    activeFilter,
    dismissEvent,
    eventCountsBySeverity,
    events,
    filteredEvents,
    markEventRead,
    readEventIds,
    resetEventState,
    selectedParcelEvents,
    setActiveFilter,
    unreadCount,
  };
}
