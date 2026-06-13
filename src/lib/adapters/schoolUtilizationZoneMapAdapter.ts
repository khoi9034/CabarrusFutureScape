import type { SchoolUtilizationZoneResponse } from "@/types/api";
import type {
  SchoolUtilizationClass,
  SchoolUtilizationZoneLevel,
  SchoolUtilizationZoneMapPolygon,
} from "@/types/map/schoolUtilizationZones";

function getRenderableLevel(
  value: string | null,
): SchoolUtilizationZoneLevel | null {
  if (value === "elementary" || value === "middle" || value === "high") {
    return value;
  }

  return null;
}

function getRenderableClass(
  value: string | null,
): SchoolUtilizationClass | null {
  if (
    value === "under_capacity" ||
    value === "approaching_capacity" ||
    value === "near_capacity" ||
    value === "over_capacity" ||
    value === "severely_over_capacity"
  ) {
    return value;
  }

  return null;
}

function getRenderableGeometry(
  zone: SchoolUtilizationZoneResponse,
): SchoolUtilizationZoneMapPolygon["geometry"] | null {
  const geometry = zone.geometry;
  const type = geometry?.type;

  if (type !== "Polygon" && type !== "MultiPolygon") {
    return null;
  }

  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  return {
    coordinates: geometry.coordinates,
    spatialReference: {
      wkid: 4326,
    },
    type,
  };
}

export function mapSchoolUtilizationZoneToPolygon(
  zone: SchoolUtilizationZoneResponse,
): SchoolUtilizationZoneMapPolygon | null {
  const geometry = getRenderableGeometry(zone);

  if (!geometry) {
    return null;
  }

  return {
    geometry,
    matchConfidence: zone.match_confidence,
    matchedSchoolReferenceId: zone.matched_school_reference_id,
    needsVerification: zone.needs_verification,
    schoolLevel: getRenderableLevel(zone.school_level),
    schoolName: zone.school_name,
    schoolNameNormalized: zone.school_name_normalized,
    schoolSystem: zone.school_system,
    schoolYear: zone.school_year,
    sourceConfidence: zone.source_confidence,
    sourceLayer: zone.source_layer,
    sourceObjectid: zone.source_objectid,
    utilizationClass: getRenderableClass(zone.utilization_class),
    utilizationPct: zone.utilization_pct,
    zoneId: zone.zone_id,
    zoneMatchConfidence: zone.zone_match_confidence,
  };
}
