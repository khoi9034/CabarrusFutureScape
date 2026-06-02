import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type { ParcelFilterResponse, ParcelFilterResult } from "@/types/api";

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const asString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue || null;
};

function buildSearchText(record: ParcelSearchRecord) {
  return normalizeSearchText(
    [
      record.officialParcelId,
      record.pin14,
      record.ownerName,
      record.ownerSecondaryName,
      record.mailingAddress,
      record.mailingCity,
      record.mailingState,
      record.subdivision,
      record.neighborhood,
      record.zoningJurisdiction,
      record.zoningCode,
      record.zoningCategory,
      record.zoningConfidence,
      record.governanceWarnings.join(" "),
      record.parcelQualityStatus,
      record.valuationBand,
      record.parcelSizeCategory,
      record.planningJurisdiction,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeParcelFilterResult(
  result: ParcelFilterResult,
  fallbackRecord: ParcelSearchRecord | null,
) {
  const officialParcelId = asString(result.official_parcel_id);

  if (!officialParcelId) {
    return null;
  }

  const governanceWarnings = Array.isArray(result.governance_warning_categories)
    ? result.governance_warning_categories
        .map((warning) => asString(warning))
        .filter((warning): warning is string => Boolean(warning))
    : [];

  const record: ParcelSearchRecord = {
    assessedValue: fallbackRecord?.assessedValue ?? null,
    governanceWarningCount: governanceWarnings.length,
    governanceWarnings,
    mailingAddress: fallbackRecord?.mailingAddress ?? null,
    mailingCity: fallbackRecord?.mailingCity ?? null,
    mailingState: fallbackRecord?.mailingState ?? null,
    needsGovernanceReview:
      result.safe_for_dashboard === false || governanceWarnings.length > 0,
    neighborhood: asString(result.neighborhood),
    objectId1: fallbackRecord?.objectId1 ?? null,
    officialParcelId,
    ownerName: fallbackRecord?.ownerName ?? null,
    ownerSecondaryName: fallbackRecord?.ownerSecondaryName ?? null,
    parcelQualityStatus: asString(result.parcel_quality_status),
    parcelSizeCategory: asString(result.parcel_size_category),
    pin14: asString(result.pin14),
    planningBoundaryType: fallbackRecord?.planningBoundaryType ?? null,
    planningJurisdiction: fallbackRecord?.planningJurisdiction ?? null,
    primaryGovernanceWarning: governanceWarnings[0] ?? null,
    safeForDashboard: result.safe_for_dashboard === true,
    searchText: "",
    subdivision: asString(result.subdivision),
    valuationBand: asString(result.valuation_band),
    marketValue: fallbackRecord?.marketValue ?? null,
    zoningCategory: asString(result.dominant_zoning_general_normalized),
    zoningCode: asString(result.dominant_zoning_code_raw),
    zoningConfidence: asString(result.zoning_assignment_confidence),
    zoningJurisdiction: asString(result.zoning_jurisdiction_name),
  };

  record.searchText = buildSearchText(record);
  return record;
}

export function normalizeBackendParcelFilterResponse(
  response: ParcelFilterResponse,
  fallbackRecords: ParcelSearchRecord[] = [],
) {
  if (!response || !Array.isArray(response.results)) {
    throw new Error("Parcel filter API returned an invalid response shape.");
  }

  const fallbackByParcelId = new Map(
    fallbackRecords.map((record) => [record.officialParcelId, record]),
  );

  return response.results
    .map((result) =>
      normalizeParcelFilterResult(
        result,
        fallbackByParcelId.get(result.official_parcel_id) ?? null,
      ),
    )
    .filter((record): record is ParcelSearchRecord => Boolean(record));
}
