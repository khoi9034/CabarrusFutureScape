import type { ScenarioId } from "@/types";
import type {
  ExecutiveBriefingMode,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";
import type {
  PrintableViewMode,
  ReportExportIntent,
  ReportPackageId,
} from "@/types/reports";
import type { DashboardViewMode } from "@/types/workspace";

export type DashboardRoleId =
  | "county-executive"
  | "infrastructure-reviewer"
  | "parcel-analyst"
  | "planning-staff";

export type DashboardPanelId =
  | "analytics-bar"
  | "command-palette"
  | "event-stream"
  | "intelligence-panel"
  | "layer-registry"
  | "map-scene"
  | "parcel-command"
  | "print-preview"
  | "report-package"
  | "scenario-controls";

export type DashboardToolId =
  | "command_palette"
  | "event_stream"
  | "identify_query"
  | "layer_registry"
  | "parcel_watchlist"
  | "report_exports"
  | "scenario_controls"
  | "time_slider"
  | "workspace_modes";

export interface RoleMapViewpoint {
  center: [number, number];
  heading: number;
  label: string;
  scale: number;
  tilt: number;
}

export interface RoleKpiSummary {
  id: string;
  label: string;
  status: "critical" | "neutral" | "positive" | "watch";
  value: string;
}

export interface RoleOperationalInsight {
  description: string;
  id: string;
  severity: "critical" | "info" | "success" | "warning";
  title: string;
}

export interface DashboardRoleDefinition {
  allowedDashboardTools: DashboardToolId[];
  commandSuggestions: string[];
  defaultDashboardPanels: DashboardPanelId[];
  defaultMapViewpoint: RoleMapViewpoint;
  defaultOperationalLayerIds: string[];
  defaultBriefingMode: ExecutiveBriefingMode;
  defaultPrintableViewMode: PrintableViewMode;
  defaultReportExportIntent: ReportExportIntent;
  defaultReportPackageId: ReportPackageId;
  defaultScenarioComparisonPair: ScenarioComparisonPair;
  defaultWorkspaceMode: DashboardViewMode;
  description: string;
  displayName: string;
  id: DashboardRoleId;
  operationalInsights: RoleOperationalInsight[];
  preferredKpiCardIds: string[];
  preferredScenarioPresets: ScenarioId[];
  roleKpiSummaries: RoleKpiSummary[];
}
