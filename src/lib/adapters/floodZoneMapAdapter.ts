import type { FloodZoneResponse } from "@/types/api";
import type {
  FloodZoneMapPolygon,
  FloodZoneSeverity,
} from "@/types/map/floodZones";

function getRenderableSeverity(value: string | null): FloodZoneSeverity | null {
  if (
    value === "high" ||
    value === "low" ||
    value === "moderate" ||
    value === "severe"
  ) {
    return value;
  }

  return null;
}

function getRenderableGeometry(
  zone: FloodZoneResponse,
): FloodZoneMapPolygon["geometry"] | null {
  const type = zone.geometry?.type;

  if (type !== "Polygon" && type !== "MultiPolygon") {
    return null;
  }

  if (!Array.isArray(zone.geometry.coordinates)) {
    return null;
  }

  return {
    coordinates: zone.geometry.coordinates,
    spatialReference: {
      wkid: zone.geometry.spatial_reference?.wkid ?? 4326,
    },
    type,
  };
}

export function mapFloodZoneToPolygon(
  zone: FloodZoneResponse,
): FloodZoneMapPolygon | null {
  const geometry = getRenderableGeometry(zone);

  if (!geometry) {
    return null;
  }

  return {
    floodConstraintType: zone.flood_constraint_type,
    floodSeverityClass: getRenderableSeverity(zone.flood_severity_class),
    floodZoneCode: zone.flood_zone_code,
    floodZoneInternalId: zone.flood_zone_internal_id,
    fldArId: zone.fld_ar_id,
    geometry,
    gfid: zone.gfid,
    globalid: zone.globalid,
    sourceLayer: zone.source_layer,
    sourceObjectid: zone.source_objectid,
  };
}
