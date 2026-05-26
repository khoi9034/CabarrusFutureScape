import {
  scenarioPresets,
  timeHorizonTicks,
} from "@/data/mock/dashboardMockData";
import { mockOperationalEvents } from "@/data/mock/eventsMockData";
import { mockParcels } from "@/data/mock/parcelMockData";
import {
  mockExecutiveBriefings,
  mockScenarioComparisons,
} from "@/data/mock/scenarioComparisonMockData";
import { mockReportPackages } from "@/data/mock/reportMockData";
import { dashboardRoleRegistry } from "@/lib/dashboard/roleRegistry";
import { workspaceLayoutPresets } from "@/lib/dashboard/workspacePresets";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import type { OperationalEvent } from "@/types/events";
import type { CommandAction, CommandCategory, CommandItem } from "@/types/search";

export const commandCategoryLabels: Record<CommandCategory, string> = {
  briefing: "Briefings",
  comparison: "Comparisons",
  event: "Events",
  layer: "Layers",
  parcel: "Parcels",
  place: "Places",
  report: "Reports",
  role: "Roles",
  scenario: "Scenarios",
  selection: "Selection",
  simulation: "Simulation",
  workspace: "View Modes",
};

export const commandCategoryOrder: CommandCategory[] = [
  "workspace",
  "role",
  "briefing",
  "comparison",
  "report",
  "event",
  "parcel",
  "layer",
  "scenario",
  "simulation",
  "selection",
  "place",
];

export function getCommandRegistry(): CommandItem[] {
  return [
    ...createRoleCommands(),
    ...createWorkspaceCommands(),
    ...createBriefingCommands(),
    ...createComparisonCommands(),
    ...createReportCommands(),
    ...createParcelCommands(),
    ...createLayerCommands(),
    ...createEventCommands(),
    ...createScenarioCommands(),
    ...createSimulationCommands(),
    createClearSelectionCommand(),
  ];
}

function createReportCommands(): CommandItem[] {
  const reportCommands = mockReportPackages.map((reportPackage) => ({
    accent: "#f0cd79",
    action: {
      packageId: reportPackage.id,
      type: "select-report-package" as const,
    },
    category: "report" as const,
    id: `report:${reportPackage.id}`,
    keywords: [
      reportPackage.id,
      reportPackage.title,
      reportPackage.subtitle,
      reportPackage.type,
      reportPackage.narrative,
      reportPackage.recommendations.join(" "),
      reportPackage.exportMetadata.department,
      reportPackage.exportMetadata.tags.join(" "),
      "report",
      "packet",
      "print",
      "export",
    ],
    meta: {
      badge: "Report",
      source: "mock" as const,
    },
    resultType: "report" as const,
    subtitle: reportPackage.subtitle,
    title: `Open ${reportPackage.title}`,
  }));

  const exportCommands: CommandItem[] = [
    {
      accent: "#d8b86a",
      action: {
        format: "pdf",
        type: "run-mock-export",
      },
      category: "report",
      id: "report:export-executive-packet",
      keywords: [
        "export",
        "executive",
        "packet",
        "pdf",
        "briefing",
        "report",
      ],
      meta: {
        badge: "Export",
        source: "mock",
      },
      resultType: "report",
      subtitle: "Run a mock PDF export for the active report package",
      title: "Export Executive Packet",
    },
    {
      accent: "#68d8ff",
      action: {
        printableViewMode: "briefing",
        type: "open-print-layout",
      },
      category: "report",
      id: "report:open-print-layout",
      keywords: [
        "open",
        "print",
        "layout",
        "briefing",
        "preview",
        "report",
      ],
      meta: {
        badge: "Print",
        source: "mock",
      },
      resultType: "report",
      subtitle: "Open the mock print-friendly briefing layout",
      title: "Open Print Layout",
    },
    {
      accent: "#f0cd79",
      action: {
        type: "generate-board-brief",
      },
      category: "report",
      id: "report:generate-board-brief",
      keywords: [
        "generate",
        "board",
        "brief",
        "packet",
        "report",
        "agenda",
      ],
      meta: {
        badge: "Board",
        source: "mock",
      },
      resultType: "report",
      subtitle: "Prepare a mock board-packet print view",
      title: "Generate Board Brief",
    },
    {
      accent: "#ffb454",
      action: {
        type: "export-scenario-comparison",
      },
      category: "report",
      id: "report:export-scenario-comparison",
      keywords: [
        "export",
        "scenario",
        "comparison",
        "report",
        "briefing",
        "deltas",
      ],
      meta: {
        badge: "Scenario",
        source: "mock",
      },
      resultType: "report",
      subtitle: "Focus the mock report package on scenario comparison export",
      title: "Export Scenario Comparison",
    },
  ];

  return [...reportCommands, ...exportCommands];
}

function createComparisonCommands(): CommandItem[] {
  return mockScenarioComparisons.map((comparison) => ({
    accent: "#d8b86a",
    action: {
      briefingMode: comparison.recommendedBriefingMode,
      comparisonPair: {
        leftScenarioId: comparison.leftScenarioId,
        rightScenarioId: comparison.rightScenarioId,
      },
      type: "set-scenario-comparison",
    },
    category: "comparison",
    id: `comparison:${comparison.id}`,
    keywords: [
      comparison.id,
      comparison.title,
      comparison.summary,
      comparison.fiscalOpportunityShift,
      comparison.infrastructureReadinessShift,
      comparison.parcelPressureShift,
      comparison.riskIndicators.join(" "),
      comparison.metrics.map((metric) => metric.label).join(" "),
      "compare",
      "comparison",
      "scenario",
      "executive",
    ],
    meta: {
      badge: "Compare",
      source: "mock",
    },
    resultType: "comparison",
    subtitle: comparison.summary,
    title: `Compare ${comparison.title}`,
  }));
}

function createBriefingCommands(): CommandItem[] {
  return mockExecutiveBriefings.map((briefing) => {
    const comparison = mockScenarioComparisons.find(
      (candidate) => candidate.id === briefing.comparisonId,
    );

    return {
      accent: "#68d8ff",
      action: {
        briefingMode: briefing.mode,
        comparisonPair: {
          leftScenarioId: comparison?.leftScenarioId ?? "baseline",
          rightScenarioId: comparison?.rightScenarioId ?? "accelerated-growth",
        },
        type: "set-scenario-comparison" as const,
      },
      category: "briefing" as const,
      id: `briefing:${briefing.id}`,
      keywords: [
        briefing.id,
        briefing.title,
        briefing.subtitle,
        briefing.mode,
        briefing.narrative.title,
        briefing.narrative.body,
        briefing.topOpportunities.join(" "),
        briefing.topRisks.join(" "),
        "brief",
        "briefing",
        "executive",
        "report",
      ],
      meta: {
        badge: briefing.mode,
        source: "mock" as const,
      },
      resultType: "briefing" as const,
      subtitle: briefing.subtitle,
      title: `Open ${briefing.title}`,
    };
  });
}

function createEventCommands(): CommandItem[] {
  return mockOperationalEvents.map((event) => ({
    accent: getEventAccent(event),
    action: createEventCommandAction(event),
    category: "event",
    id: `event:${event.id}`,
    keywords: [
      event.id,
      event.title,
      event.description,
      event.type,
      event.severity,
      event.source,
      event.parcelId ?? "",
      event.layerId ?? "",
      event.scenarioId ?? "",
      "alert",
      "event",
      "notification",
    ],
    meta: {
      badge: eventTypeLabel(event.type),
      source: "mock",
    },
    resultType: "event",
    subtitle: event.description,
    title: event.title,
  }));
}

function createRoleCommands(): CommandItem[] {
  return dashboardRoleRegistry.map((role) => ({
    accent: "#f0cd79",
    action: {
      roleId: role.id,
      type: "apply-role-preset",
    },
    category: "role",
    id: `role:${role.id}`,
    keywords: [
      role.id,
      role.displayName,
      role.description,
      role.defaultWorkspaceMode,
      role.defaultDashboardPanels.join(" "),
      role.allowedDashboardTools.join(" "),
      role.commandSuggestions.join(" "),
      "role",
      "stakeholder",
      "mode",
      "persona",
    ],
    meta: {
      badge: "Role",
      source: "mock",
    },
    resultType: "role",
    subtitle: role.description,
    title: `Switch to ${role.displayName}`,
  }));
}

function createParcelCommands(): CommandItem[] {
  return mockParcels.map((parcel) => ({
    accent: "#68d8ff",
    action: {
      parcelId: parcel.parcelId,
      type: "select-parcel",
    },
    category: "parcel",
    id: `parcel:${parcel.parcelId}`,
    keywords: [
      parcel.parcelId,
      parcel.address,
      parcel.zoning,
      parcel.ownerType,
      parcel.floodRisk,
      "parcel",
      "assessor",
      "opportunity",
      String(parcel.opportunityScore),
    ],
    meta: {
      badge: parcel.zoning,
      score: parcel.opportunityScore,
      source: "mock",
    },
    resultType: "parcel",
    subtitle: `${parcel.parcelId} / ${parcel.zoning}`,
    title: parcel.address,
  }));
}

function createLayerCommands(): CommandItem[] {
  return operationalLayerRegistry.map((layer) => ({
    accent: layer.accent,
    action: {
      layerId: layer.id,
      type: "toggle-layer",
    },
    category: "layer",
    id: `layer:${layer.id}:toggle`,
    keywords: [
      layer.id,
      layer.title,
      layer.category,
      layer.description,
      layer.kind,
      layer.futureSource ?? "",
      "layer",
      "toggle",
    ],
    meta: {
      badge: layer.category,
      layerCategory: layer.category,
      source: layer.sourceStatus === "mock" ? "mock" : "placeholder",
    },
    resultType: "layer",
    subtitle: `${layer.category} / ${layer.description}`,
    title: layer.title,
  }));
}

function createWorkspaceCommands(): CommandItem[] {
  return workspaceLayoutPresets.map((preset) => ({
    accent: "#d8b86a",
    action: {
      type: "apply-workspace-preset",
      viewMode: preset.id,
    },
    category: "workspace",
    id: `workspace:${preset.id}`,
    keywords: [
      preset.id,
      preset.label,
      preset.description,
      preset.mapEmphasis,
      preset.kpiFocus.join(" "),
      "workspace",
      "view",
      "mode",
      "layout",
    ],
    meta: {
      badge: "View",
      source: "mock",
    },
    resultType: "workspace",
    subtitle: preset.description,
    title: preset.label,
  }));
}

function createScenarioCommands(): CommandItem[] {
  return scenarioPresets.map((scenario) => ({
    accent: "#d8b86a",
    action: {
      scenarioId: scenario.id,
      type: "set-scenario",
    },
    category: "scenario",
    id: `scenario:${scenario.id}`,
    keywords: [
      scenario.id,
      scenario.name,
      scenario.label,
      scenario.description,
      "scenario",
      "horizon",
      "growth",
    ],
    meta: {
      badge: scenario.label,
      source: "mock",
    },
    resultType: "scenario",
    subtitle: scenario.description,
    title: scenario.name,
  }));
}

function createSimulationCommands(): CommandItem[] {
  const yearCommands = timeHorizonTicks.map((tick) => {
    const year = Number(tick);

    return {
      accent: "#f0cd79",
      action: {
        type: "set-simulation-year" as const,
        year,
      },
      category: "simulation" as const,
      id: `simulation:year:${year}`,
      keywords: [
        tick,
        "forecast",
        "horizon",
        "simulation",
        "year",
        "time",
      ],
      meta: {
        badge: tick,
        source: "mock" as const,
      },
      resultType: "simulation" as const,
      subtitle: "Set active forecast year",
      title: `Forecast ${year}`,
    };
  });

  const intensityCommands = [25, 50, 75, 100].map((intensity) => ({
    accent: "#68d8ff",
    action: {
      intensity,
      type: "set-simulation-intensity" as const,
    },
    category: "simulation" as const,
    id: `simulation:intensity:${intensity}`,
    keywords: [
      String(intensity),
      "intensity",
      "simulation",
      "pressure",
      "scenario",
    ],
    meta: {
      badge: String(intensity),
      source: "mock" as const,
    },
    resultType: "simulation" as const,
    subtitle: "Set scenario pressure intensity",
    title: `Intensity ${intensity}`,
  }));

  return [...yearCommands, ...intensityCommands];
}

function createClearSelectionCommand(): CommandItem {
  return {
    accent: "#ff8d7a",
    action: {
      type: "clear-selection",
    },
    category: "selection",
    id: "selection:clear",
    keywords: [
      "clear",
      "selection",
      "selected",
      "parcel",
      "reset",
      "active parcel",
    ],
    meta: {
      badge: "Selection",
      source: "mock",
    },
    resultType: "selection",
    subtitle: "Clear the active parcel",
    title: "Clear parcel selection",
  };
}

function createEventCommandAction(event: OperationalEvent): CommandAction {
  if (event.action?.type === "focus-parcel") {
    return {
      parcelId: event.action.parcelId,
      type: "select-parcel",
    };
  }

  if (event.action?.type === "toggle-layer") {
    return {
      layerId: event.action.layerId,
      type: "toggle-layer",
    };
  }

  if (event.action?.type === "switch-scenario") {
    return {
      scenarioId: event.action.scenarioId,
      type: "set-scenario",
    };
  }

  return {
    type: "noop",
  };
}

function getEventAccent(event: OperationalEvent) {
  switch (event.severity) {
    case "critical":
      return "#ff6b6b";
    case "success":
      return "#55d38f";
    case "warning":
      return "#ffb454";
    case "info":
    default:
      return "#68d8ff";
  }
}

function eventTypeLabel(type: OperationalEvent["type"]) {
  return type
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
