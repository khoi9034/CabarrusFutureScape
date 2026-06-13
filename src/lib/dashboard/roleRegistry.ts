import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import type {
  DashboardRoleDefinition,
  DashboardRoleId,
} from "@/types/userRoles";

export const defaultDashboardRoleId: DashboardRoleId = "county-executive";

const validLayerIds = new Set(operationalLayerRegistry.map((layer) => layer.id));

const rawDashboardRoleDefinitions: DashboardRoleDefinition[] = [
  {
    id: "county-executive",
    displayName: "County Executive",
    description:
      "Countywide command posture focused on growth, readiness, risk, and revenue signals.",
    defaultWorkspaceMode: "executive",
    defaultDashboardPanels: [
      "map-scene",
      "analytics-bar",
      "intelligence-panel",
      "report-package",
      "print-preview",
      "event-stream",
    ],
    defaultOperationalLayerIds: ["county-boundary"],
    defaultBriefingMode: "executive",
    defaultPrintableViewMode: "briefing",
    defaultReportExportIntent: "executive",
    defaultReportPackageId: "executive-growth",
    defaultScenarioComparisonPair: {
      leftScenarioId: "baseline",
      rightScenarioId: "accelerated-growth",
    },
    preferredScenarioPresets: ["baseline", "infrastructure-first"],
    preferredKpiCardIds: [
      "growth-index",
      "readiness",
      "tax-lift",
      "risk-exposure",
    ],
    allowedDashboardTools: [
      "command_palette",
      "event_stream",
      "layer_registry",
      "report_exports",
      "scenario_controls",
      "time_slider",
      "workspace_modes",
    ],
    commandSuggestions: [
      "Switch to Executive Summary",
      "Open executive briefing",
      "Export Executive Packet",
      "Open Print Layout",
      "Compare baseline vs accelerated growth",
      "Open Risk Review",
      "Show infrastructure readiness",
    ],
    defaultMapViewpoint: {
      center: [-80.5806, 35.389],
      heading: 18,
      label: "Countywide overview",
      scale: 240000,
      tilt: 58,
    },
    roleKpiSummaries: [
      {
        id: "executive-growth-pressure",
        label: "County Growth Pressure",
        status: "watch",
        value: "High",
      },
      {
        id: "executive-risk-summary",
        label: "Infrastructure Risk",
        status: "neutral",
        value: "Moderate",
      },
      {
        id: "executive-critical-notices",
        label: "Critical Notices",
        status: "critical",
        value: "1",
      },
    ],
    operationalInsights: [
      {
        id: "executive-corridor-balance",
        severity: "info",
        title: "Growth remains corridor-led",
        description:
          "Mock pressure is concentrated around Concord Parkway, Midland, and Kannapolis mobility nodes.",
      },
      {
        id: "executive-capacity-watch",
        severity: "warning",
        title: "Capacity review advised",
        description:
          "Infrastructure-first review remains the safest executive lens for near-term capital sequencing.",
      },
    ],
  },
  {
    id: "planning-staff",
    displayName: "Planning Staff",
    description:
      "Planning operations view for zoning reviews, permit activity, and development pressure.",
    defaultWorkspaceMode: "planning",
    defaultDashboardPanels: [
      "map-scene",
      "layer-registry",
      "scenario-controls",
      "parcel-command",
      "report-package",
      "event-stream",
    ],
    defaultOperationalLayerIds: ["county-boundary"],
    defaultBriefingMode: "planning",
    defaultPrintableViewMode: "summary",
    defaultReportExportIntent: "scenario",
    defaultReportPackageId: "scenario-comparison",
    defaultScenarioComparisonPair: {
      leftScenarioId: "infill-priority",
      rightScenarioId: "accelerated-growth",
    },
    preferredScenarioPresets: ["baseline", "infill-priority"],
    preferredKpiCardIds: [
      "parcel-watch",
      "growth-index",
      "risk-exposure",
      "readiness",
    ],
    allowedDashboardTools: [
      "command_palette",
      "event_stream",
      "identify_query",
      "layer_registry",
      "parcel_watchlist",
      "report_exports",
      "scenario_controls",
      "workspace_modes",
    ],
    commandSuggestions: [
      "Search parcel by zoning",
      "Compare infill priority vs accelerated growth",
      "Export Scenario Comparison",
      "Toggle permit activity",
      "Switch to Planning Operations",
    ],
    defaultMapViewpoint: {
      center: [-80.5742, 35.414],
      heading: 24,
      label: "Planning review corridor",
      scale: 145000,
      tilt: 62,
    },
    roleKpiSummaries: [
      {
        id: "planning-permit-volume",
        label: "Permit Volume",
        status: "watch",
        value: "+12%",
      },
      {
        id: "planning-zoning-activity",
        label: "Zoning Reviews",
        status: "neutral",
        value: "18",
      },
      {
        id: "planning-hotspots",
        label: "Development Hotspots",
        status: "watch",
        value: "4",
      },
    ],
    operationalInsights: [
      {
        id: "planning-permit-heat",
        severity: "warning",
        title: "Permit heat rising",
        description:
          "Mock permit activity is elevated near Midland and Kannapolis review areas.",
      },
      {
        id: "planning-infill-screen",
        severity: "success",
        title: "Infill screen ready",
        description:
          "Parcel intelligence and scenario envelopes are aligned for compact growth review.",
      },
    ],
  },
  {
    id: "infrastructure-reviewer",
    displayName: "Infrastructure Reviewer",
    description:
      "Infrastructure readiness view for utilities, transportation flags, and constraint overlays.",
    defaultWorkspaceMode: "infrastructure",
    defaultDashboardPanels: [
      "map-scene",
      "layer-registry",
      "event-stream",
      "report-package",
      "print-preview",
      "analytics-bar",
    ],
    defaultOperationalLayerIds: ["county-boundary"],
    defaultBriefingMode: "infrastructure",
    defaultPrintableViewMode: "board-packet",
    defaultReportExportIntent: "infrastructure",
    defaultReportPackageId: "infrastructure-readiness",
    defaultScenarioComparisonPair: {
      leftScenarioId: "baseline",
      rightScenarioId: "infrastructure-first",
    },
    preferredScenarioPresets: ["infrastructure-first", "baseline"],
    preferredKpiCardIds: [
      "readiness",
      "risk-exposure",
      "growth-index",
      "parcel-watch",
    ],
    allowedDashboardTools: [
      "command_palette",
      "event_stream",
      "identify_query",
      "layer_registry",
      "report_exports",
      "scenario_controls",
      "time_slider",
      "workspace_modes",
    ],
    commandSuggestions: [
      "Switch to Infrastructure Readiness",
      "Compare baseline vs infrastructure first",
      "Generate Board Brief",
      "Toggle flood risk",
      "Review infrastructure alerts",
    ],
    defaultMapViewpoint: {
      center: [-80.604, 35.36],
      heading: 12,
      label: "Infrastructure capacity review",
      scale: 175000,
      tilt: 64,
    },
    roleKpiSummaries: [
      {
        id: "infra-utility-strain",
        label: "Utility Strain",
        status: "watch",
        value: "Medium",
      },
      {
        id: "infra-transport-flags",
        label: "Transport Flags",
        status: "watch",
        value: "3",
      },
      {
        id: "infra-corridor-readiness",
        label: "Corridor Readiness",
        status: "positive",
        value: "73%",
      },
    ],
    operationalInsights: [
      {
        id: "infra-harrisburg-capacity",
        severity: "warning",
        title: "Utility sequencing review",
        description:
          "Legacy mock sequencing flags remain informational until authoritative infrastructure layers are connected.",
      },
      {
        id: "infra-flood-overlay",
        severity: "critical",
        title: "Risk overlay active",
        description:
          "Flood risk and readiness overlays should stay paired during capacity review.",
      },
    ],
  },
  {
    id: "parcel-analyst",
    displayName: "Parcel Analyst",
    description:
      "Parcel-first workflow for boundaries, ownership review, nearby permits, and identify/query readiness.",
    defaultWorkspaceMode: "parcel",
    defaultDashboardPanels: [
      "map-scene",
      "parcel-command",
      "layer-registry",
      "report-package",
      "event-stream",
    ],
    defaultOperationalLayerIds: ["county-boundary"],
    defaultBriefingMode: "planning",
    defaultPrintableViewMode: "parcel-snapshot",
    defaultReportExportIntent: "parcel",
    defaultReportPackageId: "parcel-opportunity",
    defaultScenarioComparisonPair: {
      leftScenarioId: "infill-priority",
      rightScenarioId: "accelerated-growth",
    },
    preferredScenarioPresets: ["infill-priority", "baseline"],
    preferredKpiCardIds: [
      "parcel-watch",
      "tax-lift",
      "growth-index",
      "risk-exposure",
    ],
    allowedDashboardTools: [
      "command_palette",
      "event_stream",
      "identify_query",
      "layer_registry",
      "parcel_watchlist",
      "report_exports",
      "workspace_modes",
    ],
    commandSuggestions: [
      "Switch to Parcel Analyst Mode",
      "Open planning comparison brief",
      "Export Parcel Opportunity Summary",
      "Search parcel CAB-151-4823",
      "Toggle parcel intelligence",
    ],
    defaultMapViewpoint: {
      center: [-80.5947, 35.4212],
      heading: 30,
      label: "Parcel identify focus",
      scale: 52000,
      tilt: 68,
    },
    roleKpiSummaries: [
      {
        id: "parcel-selected-metrics",
        label: "Selected Parcel Metrics",
        status: "positive",
        value: "Ready",
      },
      {
        id: "parcel-ownership-review",
        label: "Ownership Review",
        status: "neutral",
        value: "Mock",
      },
      {
        id: "parcel-nearby-permits",
        label: "Nearby Permit Activity",
        status: "watch",
        value: "14",
      },
    ],
    operationalInsights: [
      {
        id: "parcel-opportunity-focus",
        severity: "info",
        title: "Parcel scoring focus",
        description:
          "Opportunity extrusions and parcel boundaries are prioritized for identify/query workflows.",
      },
      {
        id: "parcel-permit-context",
        severity: "warning",
        title: "Permit context recommended",
        description:
          "Permit activity should remain visible while reviewing ownership and redevelopment potential.",
      },
    ],
  },
];

export const dashboardRoleRegistry = rawDashboardRoleDefinitions.map(
  normalizeRoleDefinition,
);

export const dashboardRoleIds = dashboardRoleRegistry.map((role) => role.id);

export function getDashboardRoleById(roleId: DashboardRoleId) {
  return (
    dashboardRoleRegistry.find((role) => role.id === roleId) ??
    getDefaultDashboardRole()
  );
}

export function getDefaultDashboardRole() {
  return dashboardRoleRegistry.find(
    (role) => role.id === defaultDashboardRoleId,
  ) as DashboardRoleDefinition;
}

export function isDashboardRoleId(
  value: string | null,
): value is DashboardRoleId {
  return Boolean(
    value && dashboardRoleIds.includes(value.trim() as DashboardRoleId),
  );
}

function normalizeRoleDefinition(
  role: DashboardRoleDefinition,
): DashboardRoleDefinition {
  return {
    ...role,
    defaultOperationalLayerIds: normalizeLayerIds(
      role.defaultOperationalLayerIds,
    ),
  };
}

function normalizeLayerIds(layerIds: string[]) {
  const requestedLayerIds = new Set(
    layerIds.filter((layerId) => validLayerIds.has(layerId)),
  );

  return operationalLayerRegistry
    .map((layer) => layer.id)
    .filter((layerId) => requestedLayerIds.has(layerId));
}
