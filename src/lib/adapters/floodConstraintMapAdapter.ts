import type {
  FloodConstraintDetailResponse,
  ParcelDetailResponse,
} from "@/types/api";
import type { FloodConstraintMapMarker } from "@/types/map/floodConstraints";

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getRenderableFloodSeverity(
  constraint: FloodConstraintDetailResponse,
): FloodConstraintMapMarker["floodSeverityClass"] | null {
  if (constraint.floodway_present || constraint.flood_severity_class === "severe") {
    return "severe";
  }

  if (constraint.sfha_present || constraint.flood_severity_class === "high") {
    return "high";
  }

  if (
    constraint.moderate_flood_present ||
    constraint.flood_severity_class === "moderate"
  ) {
    return "moderate";
  }

  return null;
}

export function mapFloodConstraintToMarker(
  constraint: FloodConstraintDetailResponse,
  parcelDetail: ParcelDetailResponse | null,
): FloodConstraintMapMarker | null {
  const centroid = parcelDetail?.map_focus?.centroid;
  const wkid = parcelDetail?.map_focus?.spatial_reference?.wkid ?? 4326;
  const severity = getRenderableFloodSeverity(constraint);

  if (!severity) {
    return null;
  }

  if (
    !parcelDetail?.map_focus?.geometry_available ||
    !centroid ||
    !isFiniteCoordinate(centroid.longitude) ||
    !isFiniteCoordinate(centroid.latitude)
  ) {
    return null;
  }

  return {
    buildabilityImpact: constraint.buildability_impact,
    centroid: {
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      spatialReference: {
        wkid,
      },
    },
    dominantFloodZone: constraint.dominant_flood_zone,
    floodConstraintScore: constraint.flood_constraint_score,
    floodReviewRequired: constraint.flood_review_required,
    floodSeverityClass: severity,
    floodwayPresent: constraint.floodway_present,
    officialParcelId: constraint.official_parcel_id,
    percentParcelConstrained: constraint.percent_parcel_constrained,
    pin14: constraint.pin14 ?? parcelDetail?.pin14 ?? null,
    sfhaPresent: constraint.sfha_present,
  };
}
