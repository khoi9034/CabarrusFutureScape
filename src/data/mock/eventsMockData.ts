import type { OperationalEvent } from "@/types/events";

export const mockOperationalEvents: OperationalEvent[] = [
  {
    id: "evt-permit-midland-industrial",
    action: {
      label: "Focus Parcel",
      parcelId: "CAB-712-2042",
      type: "focus-parcel",
    },
    description:
      "Three nearby industrial permit records were added to the mock activity feed within the Midland growth reserve.",
    parcelId: "CAB-712-2042",
    severity: "info",
    source: "permit_feed",
    timestamp: "2026-05-24T19:42:00-04:00",
    title: "New permit activity near Midland Industrial Reserve",
    type: "permit_activity",
  },
  {
    id: "evt-risk-mount-pleasant",
    action: {
      label: "Review Flood Layer",
      layerId: "flood-risk",
      type: "toggle-layer",
    },
    description:
      "Mock flood constraint scoring elevated the Mount Pleasant town center parcel to severe review status.",
    layerId: "flood-risk",
    parcelId: "CAB-448-6670",
    severity: "critical",
    source: "risk_model",
    timestamp: "2026-05-24T18:20:00-04:00",
    title: "Flood risk notice requires review",
    type: "risk_notice",
  },
  {
    id: "evt-infrastructure-harrisburg",
    action: {
      label: "Focus Parcel",
      parcelId: "CAB-033-9185",
      type: "focus-parcel",
    },
    description:
      "Infrastructure readiness remains strong, but utility sequencing should be reviewed before accelerated absorption.",
    layerId: "infrastructure-readiness",
    parcelId: "CAB-033-9185",
    severity: "warning",
    source: "infrastructure_model",
    timestamp: "2026-05-24T16:05:00-04:00",
    title: "Readiness flag on legacy mock infrastructure layer",
    type: "infrastructure_flag",
  },
  {
    id: "evt-zoning-concord-node",
    action: {
      label: "Focus Parcel",
      parcelId: "CAB-151-4823",
      type: "focus-parcel",
    },
    description:
      "Planning review queue marked the mixed-use growth node as ready for policy consistency screening.",
    parcelId: "CAB-151-4823",
    severity: "success",
    source: "planning_review",
    timestamp: "2026-05-24T14:30:00-04:00",
    title: "Zoning review update cleared initial screen",
    type: "zoning_update",
  },
  {
    id: "evt-pressure-kannapolis",
    action: {
      label: "Open Growth View",
      scenarioId: "accelerated-growth",
      type: "switch-scenario",
    },
    description:
      "Mock development pressure trend increased along the Kannapolis mobility corridor during the latest scenario pass.",
    layerId: "development-pressure",
    parcelId: "CAB-209-7741",
    scenarioId: "accelerated-growth",
    severity: "warning",
    source: "parcel_watch",
    timestamp: "2026-05-24T12:10:00-04:00",
    title: "High development pressure alert",
    type: "parcel_alert",
  },
  {
    id: "evt-scenario-capacity-refresh",
    action: {
      label: "Switch Scenario",
      scenarioId: "infrastructure-first",
      type: "switch-scenario",
    },
    description:
      "Scenario controls refreshed the mock capacity-weighted horizon for infrastructure-first review.",
    scenarioId: "infrastructure-first",
    severity: "info",
    source: "scenario_engine",
    timestamp: "2026-05-24T10:45:00-04:00",
    title: "Scenario update available",
    type: "scenario_update",
  },
  {
    id: "evt-system-scene-online",
    description:
      "ArcGIS MapView runtime, mock GraphicsLayers, and dashboard URL state are reporting normal status.",
    severity: "success",
    source: "system",
    timestamp: "2026-05-24T09:15:00-04:00",
    title: "Digital twin shell online",
    type: "system_status",
  },
];
