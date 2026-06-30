import type { EconomicsEnterpriseExportResponse } from "@/types/api";

export type EnterpriseExportPayload = EconomicsEnterpriseExportResponse;

export type EnterpriseExportPreviewKind =
  | "decision_pack"
  | "planning_model"
  | "power_bi";
