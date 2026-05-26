import type { LayerCategory, ScenarioId } from "@/types";
import type {
  ExecutiveBriefingMode,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";
import type {
  ExportFormat,
  PrintableViewMode,
  ReportExportIntent,
  ReportPackageId,
} from "@/types/reports";
import type { DashboardRoleId } from "@/types/userRoles";
import type { DashboardViewMode } from "@/types/workspace";

export type CommandCategory =
  | "briefing"
  | "comparison"
  | "event"
  | "layer"
  | "parcel"
  | "place"
  | "report"
  | "role"
  | "scenario"
  | "selection"
  | "simulation"
  | "workspace";

export type SearchResultType = CommandCategory;

export type CommandAction =
  | {
      type: "apply-workspace-preset";
      viewMode: DashboardViewMode;
    }
  | {
      roleId: DashboardRoleId;
      type: "apply-role-preset";
    }
  | {
      type: "clear-selection";
    }
  | {
      briefingMode: ExecutiveBriefingMode;
      comparisonPair: ScenarioComparisonPair;
      type: "set-scenario-comparison";
    }
  | {
      briefingMode: ExecutiveBriefingMode;
      type: "set-briefing-mode";
    }
  | {
      packageId: ReportPackageId;
      type: "select-report-package";
    }
  | {
      format: ExportFormat;
      type: "run-mock-export";
    }
  | {
      printableViewMode: PrintableViewMode;
      type: "open-print-layout";
    }
  | {
      type: "generate-board-brief";
    }
  | {
      intent: ReportExportIntent;
      type: "set-report-intent";
    }
  | {
      type: "export-scenario-comparison";
    }
  | {
      layerId: string;
      type: "set-layer-visibility";
      visible: boolean;
    }
  | {
      parcelId: string;
      type: "select-parcel";
    }
  | {
      type: "noop";
    }
  | {
      scenarioId: ScenarioId;
      type: "set-scenario";
    }
  | {
      intensity: number;
      type: "set-simulation-intensity";
    }
  | {
      type: "set-simulation-year";
      year: number;
    }
  | {
      layerId: string;
      type: "toggle-layer";
    };

export interface CommandItem {
  accent?: string;
  action: CommandAction;
  category: CommandCategory;
  disabled?: boolean;
  id: string;
  keywords: string[];
  resultType: SearchResultType;
  subtitle: string;
  title: string;
  meta?: {
    badge?: string;
    layerCategory?: LayerCategory;
    score?: number;
    source?: "mock" | "placeholder";
  };
}

export interface SearchResult extends CommandItem {
  matchedFields: string[];
  matchScore: number;
}
