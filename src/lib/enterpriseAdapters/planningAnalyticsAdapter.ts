import type { EnterpriseExportPayload } from "@/lib/enterpriseAdapters/enterpriseExportTypes";

export function buildPlanningModelCubePayload(exportPayload: EnterpriseExportPayload) {
  return exportPayload.exports.planning_model;
}

export function buildScenarioExport(exportPayload: EnterpriseExportPayload) {
  return exportPayload.exports.power_bi.scenario_fact;
}

export function buildDecisionPackExport(exportPayload: EnterpriseExportPayload) {
  return exportPayload.exports.decision_pack;
}
