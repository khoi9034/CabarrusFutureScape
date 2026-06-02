import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type { ParcelDetailResponse } from "@/types/api";

const asString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue || null;
};

const asNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

function asWarningList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

export function normalizeBackendParcelDetailResponse(
  response: ParcelDetailResponse,
  fallbackRecord: ParcelSearchRecord,
): ParcelSearchRecord {
  const officialParcelId = asString(response?.official_parcel_id);

  if (!officialParcelId) {
    throw new Error("Parcel detail API returned an invalid response shape.");
  }

  const governanceWarnings = asWarningList(
    response.governance?.governance_warning_categories,
    fallbackRecord.governanceWarnings,
  );
  const safeForDashboard =
    typeof response.governance?.safe_for_dashboard === "boolean"
      ? response.governance.safe_for_dashboard
      : fallbackRecord.safeForDashboard;

  return {
    ...fallbackRecord,
    assessedValue:
      asNumber(response.valuation?.assessedvalue_numeric) ??
      fallbackRecord.assessedValue,
    governanceWarningCount: governanceWarnings.length,
    governanceWarnings,
    needsGovernanceReview: !safeForDashboard || governanceWarnings.length > 0,
    neighborhood:
      asString(response.location?.neighborhood) ?? fallbackRecord.neighborhood,
    objectId1: asNumber(response.objectid_1) ?? fallbackRecord.objectId1,
    officialParcelId,
    parcelQualityStatus:
      asString(response.parcel_context?.parcel_quality_status) ??
      fallbackRecord.parcelQualityStatus,
    parcelSizeCategory:
      asString(response.parcel_context?.parcel_size_category) ??
      fallbackRecord.parcelSizeCategory,
    pin14: asString(response.pin14) ?? fallbackRecord.pin14,
    planningJurisdiction:
      asString(response.planning?.planning_jurisdiction) ??
      fallbackRecord.planningJurisdiction,
    primaryGovernanceWarning: governanceWarnings[0] ?? null,
    safeForDashboard,
    subdivision:
      asString(response.location?.subdivision) ?? fallbackRecord.subdivision,
    valuationBand:
      asString(response.valuation?.valuation_band) ??
      fallbackRecord.valuationBand,
    marketValue:
      asNumber(response.valuation?.marketvalue_numeric) ??
      fallbackRecord.marketValue,
    zoningCategory:
      asString(response.zoning?.dominant_zoning_general_normalized) ??
      fallbackRecord.zoningCategory,
    zoningCode:
      asString(response.zoning?.dominant_zoning_code_raw) ??
      fallbackRecord.zoningCode,
    zoningConfidence:
      asString(response.zoning?.zoning_assignment_confidence) ??
      fallbackRecord.zoningConfidence,
    zoningJurisdiction:
      asString(response.zoning?.zoning_jurisdiction_name) ??
      fallbackRecord.zoningJurisdiction,
  };
}

