import type {
  DevelopmentHotspotResult,
  DevelopmentHotspotsResponse,
} from "@/types/api";
import type { DevelopmentHotspotMapMarker } from "@/types/map/developmentHotspots";

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function mapDevelopmentHotspotToMarker(
  result: DevelopmentHotspotResult,
): DevelopmentHotspotMapMarker | null {
  const centroid = result.map_focus?.centroid;
  const wkid = result.map_focus?.spatial_reference?.wkid ?? 4326;

  if (
    !result.map_focus?.geometry_available ||
    !centroid ||
    !isFiniteCoordinate(centroid.longitude) ||
    !isFiniteCoordinate(centroid.latitude)
  ) {
    return null;
  }

  return {
    centroid: {
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      spatialReference: {
        wkid,
      },
    },
    developmentActivityClass:
      result.development_activity_class ?? "unknown_activity",
    developmentActivityScore: result.development_activity_score,
    dominantZoningCodeRaw: result.dominant_zoning_code_raw,
    officialParcelId: result.official_parcel_id,
    pin14: result.pin14,
    recentPermitCount1yr: result.recent_permit_count_1yr,
    recentPermitCount3yr: result.recent_permit_count_3yr,
    totalPermitCount: result.total_permit_count,
    zoningJurisdictionName: result.zoning_jurisdiction_name,
  };
}

export function normalizeDevelopmentHotspotMapMarkers(
  response: DevelopmentHotspotsResponse,
) {
  if (!response || !Array.isArray(response.results)) {
    throw new Error("Development hotspot map API returned an invalid shape.");
  }

  const markers = response.results
    .map(mapDevelopmentHotspotToMarker)
    .filter((marker): marker is DevelopmentHotspotMapMarker => Boolean(marker));

  return {
    markers,
    totalCount: response.total_count,
  };
}
