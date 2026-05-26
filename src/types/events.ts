import type { ScenarioId } from "@/types";

export type OperationalEventType =
  | "infrastructure_flag"
  | "parcel_alert"
  | "permit_activity"
  | "risk_notice"
  | "scenario_update"
  | "system_status"
  | "zoning_update";

export type OperationalEventSeverity =
  | "critical"
  | "info"
  | "success"
  | "warning";

export type OperationalEventSource =
  | "infrastructure_model"
  | "mock"
  | "parcel_watch"
  | "permit_feed"
  | "planning_review"
  | "risk_model"
  | "scenario_engine"
  | "system";

export type EventAction =
  | {
      label: string;
      parcelId: string;
      type: "focus-parcel";
    }
  | {
      label: string;
      layerId: string;
      type: "toggle-layer";
    }
  | {
      label: string;
      scenarioId: ScenarioId;
      type: "switch-scenario";
    };

export interface EventStreamFilter {
  includeRead?: boolean;
  layerId?: string;
  parcelId?: string;
  scenarioId?: ScenarioId;
  severities?: OperationalEventSeverity[];
  types?: OperationalEventType[];
}

export interface OperationalEvent {
  id: string;
  action?: EventAction;
  description: string;
  layerId?: string;
  parcelId?: string;
  scenarioId?: ScenarioId;
  severity: OperationalEventSeverity;
  source: OperationalEventSource;
  timestamp: string;
  title: string;
  type: OperationalEventType;
}
