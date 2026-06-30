import type { EnterpriseExportPayload } from "@/lib/enterpriseAdapters/enterpriseExportTypes";

export function buildPowerBiDatasetPayload(exportPayload: EnterpriseExportPayload) {
  return exportPayload.exports.power_bi;
}
