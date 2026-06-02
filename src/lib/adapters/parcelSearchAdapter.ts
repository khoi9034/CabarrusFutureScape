import type { ParcelSearchFilters } from "@/components/dashboard/ParcelSearchState";
import {
  filterParcelSearchRecords,
  type ParcelSearchRecord,
} from "@/data/intelligence/parcelSearchData";
import type { ParcelSearchResponse, ParcelSearchResult } from "@/types/api";

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

function normalizeParcelSearchResult(result: ParcelSearchResult) {
  const officialParcelId = asString(result.official_parcel_id);

  if (!officialParcelId) {
    return null;
  }

  const governanceWarnings = Array.isArray(result.governance_warning_categories)
    ? result.governance_warning_categories
        .map((warning) => asString(warning))
        .filter((warning): warning is string => Boolean(warning))
    : [];
  const mailingCity = asString(result.mailing_city);
  const mailingState = asString(result.mailing_state);

  const record: ParcelSearchRecord = {
    assessedValue: null,
    governanceWarningCount: governanceWarnings.length,
    governanceWarnings,
    mailingAddress:
      mailingCity || mailingState
        ? [mailingCity, mailingState].filter(Boolean).join(", ")
        : null,
    mailingCity,
    mailingState,
    needsGovernanceReview:
      result.safe_for_dashboard === false || governanceWarnings.length > 0,
    neighborhood: asString(result.neighborhood),
    objectId1: null,
    officialParcelId,
    ownerName: asString(result.owner_display),
    ownerSecondaryName: null,
    parcelQualityStatus: asString(result.parcel_quality_status),
    parcelSizeCategory: null,
    pin14: asString(result.pin14),
    planningBoundaryType: null,
    planningJurisdiction: null,
    primaryGovernanceWarning: governanceWarnings[0] ?? null,
    safeForDashboard: result.safe_for_dashboard === true,
    searchText: "",
    subdivision: asString(result.subdivision),
    valuationBand: asString(result.valuation_band),
    marketValue: null,
    zoningCategory: asString(result.dominant_zoning_general_normalized),
    zoningCode: asString(result.dominant_zoning_code_raw),
    zoningConfidence: asString(result.zoning_assignment_confidence),
    zoningJurisdiction: asString(result.zoning_jurisdiction_name),
  };

  record.searchText = buildSearchText(record);
  return record;
}

export function normalizeBackendParcelSearchResponse(
  response: ParcelSearchResponse,
) {
  if (!response || !Array.isArray(response.results)) {
    throw new Error("Parcel search API returned an invalid response shape.");
  }

  return response.results
    .map(normalizeParcelSearchResult)
    .filter((record): record is ParcelSearchRecord => Boolean(record));
}

export function applyParcelSearchUiFilters(
  records: ParcelSearchRecord[],
  request: {
    filters?: ParcelSearchFilters;
    limit?: number;
    query?: string;
  },
) {
  return filterParcelSearchRecords(records, request);
}
