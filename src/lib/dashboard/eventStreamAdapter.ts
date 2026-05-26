import { mockOperationalEvents } from "@/data/mock/eventsMockData";
import type {
  EventStreamFilter,
  OperationalEvent,
} from "@/types/events";

export interface EventStreamAdapter {
  dismissEvent: (eventId: string) => string;
  filterOperationalEvents: (
    events: OperationalEvent[],
    filter: EventStreamFilter,
  ) => OperationalEvent[];
  getEventsForLayer: (layerId: string) => OperationalEvent[];
  getEventsForParcel: (parcelId: string) => OperationalEvent[];
  getOperationalEvents: () => OperationalEvent[];
  markEventRead: (eventId: string) => string;
}

// Phase 1 event streaming is intentionally local and mock-backed. This boundary
// is where future permit feeds, infrastructure monitors, risk alerts, and
// system notifications can plug in without coupling UI components to services.
export const mockEventStreamAdapter: EventStreamAdapter = {
  dismissEvent: (eventId) => eventId,
  filterOperationalEvents,
  getEventsForLayer: (layerId) =>
    filterOperationalEvents(mockOperationalEvents, { layerId }),
  getEventsForParcel: (parcelId) =>
    filterOperationalEvents(mockOperationalEvents, { parcelId }),
  getOperationalEvents: () => [...mockOperationalEvents],
  markEventRead: (eventId) => eventId,
};

export function filterOperationalEvents(
  events: OperationalEvent[],
  filter: EventStreamFilter,
) {
  return events.filter((event) => {
    if (filter.parcelId && event.parcelId !== filter.parcelId) {
      return false;
    }

    if (filter.layerId && event.layerId !== filter.layerId) {
      return false;
    }

    if (filter.scenarioId && event.scenarioId !== filter.scenarioId) {
      return false;
    }

    if (filter.severities?.length && !filter.severities.includes(event.severity)) {
      return false;
    }

    if (filter.types?.length && !filter.types.includes(event.type)) {
      return false;
    }

    return true;
  });
}
