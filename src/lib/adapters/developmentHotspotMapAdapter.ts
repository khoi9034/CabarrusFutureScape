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
    activeConstructionPermits: result.active_construction_permits ?? 0,
    commercialActivityPermits: result.commercial_activity_permits ?? 0,
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
    demolitionPermits: result.demolition_permits ?? 0,
    dominantGrowthSignal: result.dominant_growth_signal ?? null,
    dominantPermitSegment: result.dominant_permit_segment ?? null,
    dominantZoningCodeRaw: result.dominant_zoning_code_raw,
    highValuePermits: result.high_value_permits ?? 0,
    industrialActivityPermits: result.industrial_activity_permits ?? 0,
    institutionalActivityPermits: result.institutional_activity_permits ?? 0,
    majorValuePermits: result.major_value_permits ?? 0,
    minorMaintenancePermits: result.minor_maintenance_permits ?? 0,
    officialParcelId: result.official_parcel_id,
    permitSignalScoreAvg: result.permit_signal_score_avg ?? null,
    permitSignalScoreMax: result.permit_signal_score_max ?? null,
    pin14: result.pin14,
    recentPermitCount1yr: result.recent_permit_count_1yr,
    recentPermitCount3yr: result.recent_permit_count_3yr,
    redevelopmentSignalPermits: result.redevelopment_signal_permits ?? 0,
    residentialGrowthPermits: result.residential_growth_permits ?? 0,
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
