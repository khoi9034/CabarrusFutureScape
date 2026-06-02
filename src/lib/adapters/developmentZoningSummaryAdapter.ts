import {
  developmentZoningSummary,
  type DevelopmentZoningRecord,
} from "@/data/intelligence/developmentActivityMetrics";
import type {
  DevelopmentZoningSummaryResponse,
  DevelopmentZoningSummaryRow,
} from "@/types/api";
import type { DevelopmentPanelSource } from "@/lib/adapters/developmentActivitySummaryAdapter";

export interface DevelopmentZoningSummaryViewModel {
  errorMessage: string | null;
  isLoading: boolean;
  records: DevelopmentZoningRecord[];
  source: DevelopmentPanelSource;
  totalCount: number;
}

function mapZoningSummaryRow(
  row: DevelopmentZoningSummaryRow,
): DevelopmentZoningRecord {
  return {
    active_parcel_count: row.active_parcel_count,
    ambiguous_permit_count: 0,
    avg_permit_amount: row.avg_permit_amount,
    dominant_zoning_code_raw: row.dominant_zoning_code_raw,
    dominant_zoning_general_normalized:
      row.dominant_zoning_general_normalized,
    first_permit_date: null,
    latest_permit_date: null,
    permit_count: row.permit_count,
    permit_type: row.permit_type,
    relationship_row_count: row.permit_count,
    total_permit_amount: row.total_permit_amount,
    unmatched_permit_count: 0,
    zoning_jurisdiction_name: row.zoning_jurisdiction_name,
  };
}

export function getStaticDevelopmentZoningSummary(): DevelopmentZoningSummaryViewModel {
  return {
    errorMessage: null,
    isLoading: false,
    records: developmentZoningSummary,
    source: "static",
    totalCount: developmentZoningSummary.length,
  };
}

export function normalizeDevelopmentZoningSummary(
  response: DevelopmentZoningSummaryResponse,
): Omit<DevelopmentZoningSummaryViewModel, "errorMessage" | "isLoading" | "source"> {
  if (!response || !Array.isArray(response.summary)) {
    throw new Error(
      "Development zoning summary API returned an invalid shape.",
    );
  }

  return {
    records: response.summary.map(mapZoningSummaryRow),
    totalCount: response.total_count,
  };
}
