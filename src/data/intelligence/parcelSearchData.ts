import type { ParcelSearchFilters } from "@/components/dashboard/ParcelSearchState";

const PARCEL_SEARCH_INDEX_URL = "/intelligence/parcel-search-index.json";

interface ParcelSearchIndexPayload {
  artifactType: "parcel_search_index";
  fields: string[];
  generatedAt: string;
  recordCount: number;
  records: unknown[][];
  sourceTables: string[];
}

export interface ParcelSearchRecord {
  assessedValue: number | null;
  governanceWarningCount: number;
  governanceWarnings: string[];
  mailingCity: string | null;
  mailingAddress: string | null;
  mailingState: string | null;
  needsGovernanceReview: boolean;
  neighborhood: string | null;
  objectId1: number | null;
  officialParcelId: string;
  ownerName: string | null;
  ownerSecondaryName: string | null;
  parcelQualityStatus: string | null;
  parcelSizeCategory: string | null;
  pin14: string | null;
  planningBoundaryType: string | null;
  planningJurisdiction: string | null;
  primaryGovernanceWarning: string | null;
  safeForDashboard: boolean;
  searchText: string;
  subdivision: string | null;
  valuationBand: string | null;
  marketValue: number | null;
  zoningCategory: string | null;
  zoningCode: string | null;
  zoningConfidence: string | null;
  zoningJurisdiction: string | null;
}

export interface ParcelSearchIndexMetadata {
  generatedAt: string;
  recordCount: number;
  sourceTables: string[];
}

export interface ParcelSearchIndex {
  metadata: ParcelSearchIndexMetadata;
  records: ParcelSearchRecord[];
}

export interface ParcelFilterOption {
  count: number;
  label: string;
  value: string;
}

export interface ParcelSearchFilterOptions {
  governanceWarningCategories: ParcelFilterOption[];
  neighborhoods: ParcelFilterOption[];
  parcelQualityStatuses: ParcelFilterOption[];
  parcelSizeCategories: ParcelFilterOption[];
  safeForDashboard: ParcelFilterOption[];
  subdivisions: ParcelFilterOption[];
  valuationBands: ParcelFilterOption[];
  zoningCategories: ParcelFilterOption[];
  zoningCodes: ParcelFilterOption[];
  zoningConfidences: ParcelFilterOption[];
  zoningJurisdictions: ParcelFilterOption[];
}

export interface ParcelSearchRequest {
  filters?: ParcelSearchFilters;
  limit?: number;
  query?: string;
}

let parcelSearchIndexPromise: Promise<ParcelSearchIndex> | null = null;

export async function loadParcelSearchIndex() {
  if (!parcelSearchIndexPromise) {
    parcelSearchIndexPromise = fetch(PARCEL_SEARCH_INDEX_URL, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Parcel search index failed to load (${response.status})`,
          );
        }

        return (await response.json()) as ParcelSearchIndexPayload;
      })
      .then(normalizeParcelSearchIndex);
  }

  return parcelSearchIndexPromise;
}

export async function searchParcelIndex(request: ParcelSearchRequest) {
  const index = await loadParcelSearchIndex();
  return filterParcelSearchRecords(index.records, request);
}

export function filterParcelSearchRecords(
  records: ParcelSearchRecord[],
  request: ParcelSearchRequest,
) {
  const query = normalizeSearchText(request.query ?? "");
  const queryTokens = query.split(" ").filter(Boolean);
  const limit = request.limit ?? 50;

  return records
    .filter((record) => matchesParcelFilters(record, request.filters))
    .filter((record) =>
      queryTokens.length
        ? queryTokens.every((token) => record.searchText.includes(token))
        : true,
    )
    .map((record) => ({
      record,
      score: scoreParcelSearchRecord(record, query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.record.officialParcelId.localeCompare(
        right.record.officialParcelId,
      );
    })
    .slice(0, limit)
    .map(({ record }) => record);
}

export function getParcelSearchRecordById(
  records: ParcelSearchRecord[],
  officialParcelId: string,
) {
  return records.find((record) => record.officialParcelId === officialParcelId);
}

export function buildParcelSearchFilterOptions(
  records: ParcelSearchRecord[],
): ParcelSearchFilterOptions {
  return {
    governanceWarningCategories: buildOptions(
      records.flatMap((record) => record.governanceWarnings),
    ),
    neighborhoods: buildOptions(
      records.map((record) => record.neighborhood),
      80,
    ),
    parcelQualityStatuses: buildOptions(
      records.map((record) => record.parcelQualityStatus),
    ),
    parcelSizeCategories: buildOptions(
      records.map((record) => record.parcelSizeCategory),
    ),
    safeForDashboard: buildBooleanOptions(records),
    subdivisions: buildOptions(
      records.map((record) => record.subdivision),
      80,
    ),
    valuationBands: buildOptions(records.map((record) => record.valuationBand)),
    zoningCategories: buildOptions(
      records.map((record) => record.zoningCategory),
    ),
    zoningCodes: buildOptions(records.map((record) => record.zoningCode), 120),
    zoningConfidences: buildOptions(
      records.map((record) => record.zoningConfidence),
    ),
    zoningJurisdictions: buildOptions(
      records.map((record) => record.zoningJurisdiction),
    ),
  };
}

function normalizeParcelSearchIndex(
  payload: ParcelSearchIndexPayload,
): ParcelSearchIndex {
  const fieldIndex = new Map(
    payload.fields.map((fieldName, index) => [fieldName, index]),
  );

  const records = payload.records
    .map((row) => normalizeParcelSearchRecord(row, fieldIndex))
    .filter((record): record is ParcelSearchRecord => Boolean(record));

  return {
    metadata: {
      generatedAt: payload.generatedAt,
      recordCount: payload.recordCount,
      sourceTables: payload.sourceTables,
    },
    records,
  };
}

function normalizeParcelSearchRecord(
  row: unknown[],
  fieldIndex: Map<string, number>,
) {
  const get = (fieldName: string) => row[fieldIndex.get(fieldName) ?? -1];
  const officialParcelId = asString(get("officialParcelId"));

  if (!officialParcelId) {
    return null;
  }

  const governanceWarnings = asStringArray(get("governanceWarnings"));
  const record: ParcelSearchRecord = {
    officialParcelId,
    assessedValue: null,
    governanceWarnings,
    governanceWarningCount: asNumber(get("governanceWarningCount")),
    mailingAddress: asString(get("mailingAddress")),
    mailingCity: asString(get("mailingCity")),
    mailingState: asString(get("mailingState")),
    needsGovernanceReview: asBoolean(get("needsGovernanceReview")),
    neighborhood: asString(get("neighborhood")),
    objectId1: null,
    ownerName: asString(get("ownerName")),
    ownerSecondaryName: asString(get("ownerSecondaryName")),
    parcelQualityStatus: asString(get("parcelQualityStatus")),
    parcelSizeCategory: asString(get("parcelSizeCategory")),
    pin14: asString(get("pin14")),
    planningBoundaryType: asString(get("planningBoundaryType")),
    planningJurisdiction: asString(get("planningJurisdiction")),
    primaryGovernanceWarning: asString(get("primaryGovernanceWarning")),
    safeForDashboard: asBoolean(get("safeForDashboard")),
    searchText: "",
    subdivision: asString(get("subdivision")),
    valuationBand: asString(get("valuationBand")),
    marketValue: null,
    zoningCategory: asString(get("zoningCategory")),
    zoningCode: asString(get("zoningCode")),
    zoningConfidence: asString(get("zoningConfidence")),
    zoningJurisdiction: asString(get("zoningJurisdiction")),
  };

  record.searchText = normalizeSearchText(
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

  return record;
}

function matchesParcelFilters(
  record: ParcelSearchRecord,
  filters: ParcelSearchFilters | undefined,
) {
  if (!filters) {
    return true;
  }

  return (
    matchesValue(record.zoningJurisdiction, filters.zoningJurisdiction) &&
    matchesValue(record.zoningCode, filters.zoningCode) &&
    matchesValue(record.zoningCategory, filters.zoningCategory) &&
    matchesValue(record.parcelQualityStatus, filters.parcelQualityStatus) &&
    matchesValue(record.parcelSizeCategory, filters.parcelSizeCategory) &&
    matchesValue(record.zoningConfidence, filters.zoningConfidence) &&
    matchesValue(record.valuationBand, filters.valuationBand) &&
    matchesValue(record.subdivision, filters.subdivision) &&
    matchesValue(record.neighborhood, filters.neighborhood) &&
    matchesSafeForDashboard(record.safeForDashboard, filters.safeForDashboard) &&
    (!filters.governanceWarningCategory ||
      record.governanceWarnings.includes(filters.governanceWarningCategory))
  );
}

function scoreParcelSearchRecord(record: ParcelSearchRecord, query: string) {
  if (!query) {
    return record.safeForDashboard ? 10 : 0;
  }

  let score = 0;
  const pin = normalizeSearchText(record.pin14 ?? "");
  const officialId = normalizeSearchText(record.officialParcelId);
  const owner = normalizeSearchText(
    [record.ownerName, record.ownerSecondaryName].filter(Boolean).join(" "),
  );
  const address = normalizeSearchText(record.mailingAddress ?? "");

  if (officialId === query) score += 500;
  if (pin === query) score += 450;
  if (officialId.startsWith(query)) score += 260;
  if (pin.startsWith(query)) score += 240;
  if (owner.includes(query)) score += 130;
  if (address.includes(query)) score += 110;
  if (record.safeForDashboard) score += 10;
  if (record.needsGovernanceReview) score -= 4;

  return score;
}

function buildOptions(
  values: Array<string | null | undefined>,
  limit = 120,
): ParcelFilterOption[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (!value) {
      return;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([value, count]) => ({
      count,
      label: toTitleLabel(value),
      value,
    }));
}

function buildBooleanOptions(records: ParcelSearchRecord[]): ParcelFilterOption[] {
  const safeCount = records.filter((record) => record.safeForDashboard).length;
  const reviewCount = records.length - safeCount;

  return [
    {
      count: safeCount,
      label: "Safe For Dashboard",
      value: "true",
    },
    {
      count: reviewCount,
      label: "Needs Review",
      value: "false",
    },
  ].filter((option) => option.count > 0);
}

function matchesValue(value: string | null, filterValue: string) {
  return !filterValue || value === filterValue;
}

function matchesSafeForDashboard(value: boolean, filterValue: string) {
  if (!filterValue) {
    return true;
  }

  return String(value) === filterValue;
}

function asString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue || null;
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asBoolean(value: unknown) {
  return value === true || value === "true";
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === "string") {
    return value
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) =>
      word.length <= 3
        ? word.toUpperCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    );
}
