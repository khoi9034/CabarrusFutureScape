import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import { createParcelMapFocus } from "@/lib/map/parcelMapFocus";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import type { ParcelDetailResponse } from "@/types/api";
import type { ParcelMapFocus } from "@/types/map/parcelFocus";

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

export function normalizeBackendParcelMapFocusResponse(
  response: ParcelDetailResponse,
  fallbackRecord: ParcelSearchRecord,
): ParcelMapFocus | null {
  const officialParcelId = asString(response?.official_parcel_id);
  const mapFocus = response?.map_focus;

  if (!officialParcelId || !mapFocus) {
    logParcelMapFocusDiagnostic("backend detail missing map_focus", {
      hasMapFocus: Boolean(mapFocus),
      officialParcelId,
    });
    return null;
  }

  const wkid = asNumber(mapFocus.spatial_reference?.wkid) ?? 4326;
  const centroidLongitude = asNumber(mapFocus.centroid?.longitude);
  const centroidLatitude = asNumber(mapFocus.centroid?.latitude);
  const xmin = asNumber(mapFocus.extent?.xmin);
  const ymin = asNumber(mapFocus.extent?.ymin);
  const xmax = asNumber(mapFocus.extent?.xmax);
  const ymax = asNumber(mapFocus.extent?.ymax);

  const centroid =
    centroidLongitude !== null && centroidLatitude !== null
      ? {
          latitude: centroidLatitude,
          longitude: centroidLongitude,
          spatialReference: { wkid },
        }
      : null;
  const extent =
    xmin !== null && ymin !== null && xmax !== null && ymax !== null
      ? {
          spatialReference: { wkid },
          xmax,
          xmin,
          ymax,
          ymin,
        }
      : null;

  if (!centroid && !extent) {
    logParcelMapFocusDiagnostic("backend map_focus has no usable target", {
      centroid: mapFocus.centroid,
      extent: mapFocus.extent,
      officialParcelId,
      wkid,
    });
    return null;
  }

  logParcelMapFocusDiagnostic("normalized backend map_focus", {
    centroid,
    extent,
    geometryAvailable: mapFocus.geometry_available,
    officialParcelId,
    pin14: asString(response.pin14) ?? fallbackRecord.pin14,
    wkid,
  });

  return createParcelMapFocus(
    {
      officialParcelId,
      pin14: asString(response.pin14) ?? fallbackRecord.pin14,
    },
    "detail",
    {
      centroid,
      extent,
    },
  );
}
