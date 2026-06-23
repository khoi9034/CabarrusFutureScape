import {
  createParcelMapFocus,
  type ParcelFocusRecordLike,
} from "@/lib/map/parcelMapFocus";
import type {
  DevelopmentHotspotMapMarker,
  DevelopmentHotspotPermitSegmentFilter,
} from "@/types/map/developmentHotspots";
import type { FloodConstraintMapMarker } from "@/types/map/floodConstraints";
import type {
  FloodZoneMapPolygon,
  FloodZoneSeverity,
} from "@/types/map/floodZones";
import type {
  SchoolUtilizationClass,
  SchoolUtilizationClassFilter,
  SchoolUtilizationLevel,
  SchoolUtilizationZoneLevel,
  SchoolUtilizationZoneMapPolygon,
} from "@/types/map/schoolUtilizationZones";
import type {
  ParcelFocusSource,
  ParcelHighlightGeometry,
} from "@/types/map/parcelFocus";

const DEMO_MAP_LAYER_BASE_URL = "/demo-data/map_layers";

const demoLayerFiles = {
  county_boundary: "demo_county_boundary.geojson",
  development_hotspots: "demo_development_hotspots.geojson",
  floodplain_review: "demo_floodplain_review.geojson",
  model_research: "demo_model_research.geojson",
  parcels: "demo_parcels.geojson",
  school_capacity: "demo_school_capacity.geojson",
  transportation_context: "demo_transportation_context.geojson",
} as const;

export type DemoMapLayerId = keyof typeof demoLayerFiles;

export interface DemoGeoJsonGeometry {
  coordinates?: unknown;
  type?: string;
}

export interface DemoGeoJsonFeature {
  geometry: DemoGeoJsonGeometry | null;
  properties?: Record<string, unknown> | null;
  type: "Feature";
}

export interface DemoGeoJsonLayer {
  features: DemoGeoJsonFeature[];
  metadata?: {
    generated_at?: string | null;
    layer_id?: string;
    layer_label?: string;
    message?: string;
    mode?: string;
    status?: "available" | "not_available" | string;
  };
  type: "FeatureCollection";
}

export interface DemoLayerManifest {
  generated_at?: string | null;
  layer_count?: number;
  layers?: Array<{
    feature_count: number;
    file: string;
    id: string;
    label: string;
    status: string;
  }>;
  mode?: string;
}

const emptyFeatureCollection: DemoGeoJsonLayer = {
  features: [],
  metadata: {
    message: "Demo layer not included.",
    status: "not_available",
  },
  type: "FeatureCollection",
};

const layerCache = new Map<string, Promise<DemoGeoJsonLayer | DemoLayerManifest>>();

export async function getDemoLayerManifest() {
  return loadDemoMapJson<DemoLayerManifest>(
    "demo_layer_manifest.json",
    {
      generated_at: null,
      layer_count: 0,
      layers: [],
      mode: "portfolio_demo",
    },
  );
}

export async function getDemoGeoJsonLayer(layerId: DemoMapLayerId | string) {
  const fileName =
    demoLayerFiles[layerId as DemoMapLayerId] ??
    (layerId.endsWith(".geojson") ? layerId : `${layerId}.geojson`);

  return loadDemoMapJson<DemoGeoJsonLayer>(fileName, emptyFeatureCollection);
}

export async function getDemoParcelFeatures() {
  const layer = await getDemoGeoJsonLayer("parcels");
  return layer.features.filter(hasGeometry);
}

export async function getDemoFloodFeatures() {
  const layer = await getDemoGeoJsonLayer("floodplain_review");
  return layer.features.filter(hasGeometry);
}

export async function getDemoSchoolCapacityFeatures() {
  const layer = await getDemoGeoJsonLayer("school_capacity");
  return layer.features.filter(hasGeometry);
}

export async function getDemoTransportationFeatures() {
  const layer = await getDemoGeoJsonLayer("transportation_context");
  return layer.features.filter(hasGeometry);
}

export async function getDemoDevelopmentHotspotSegments() {
  const layer = await getDemoGeoJsonLayer("development_hotspots");
  const segments = new Map<string, number>();

  layer.features.forEach((feature) => {
    const properties = getProperties(feature);
    const candidate =
      asString(properties.permit_segment) ??
      asString(properties.dominant_permit_segment);

    if (!candidate || candidate === "administrative_or_unknown") {
      return;
    }

    segments.set(candidate, (segments.get(candidate) ?? 0) + 1);
  });

  return Array.from(segments.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ count, value }));
}

export async function getDemoDevelopmentHotspotsBySegment(
  segment: DevelopmentHotspotPermitSegmentFilter,
) {
  if (segment === "all") {
    return [];
  }

  const layer = await getDemoGeoJsonLayer("development_hotspots");
  return layer.features
    .map((feature) => toDemoDevelopmentHotspotMarker(feature, segment))
    .filter((marker): marker is DevelopmentHotspotMapMarker => Boolean(marker));
}

export async function getDemoFloodConstraintMarkers(limit = 100) {
  const features = await getDemoFloodFeatures();
  return features
    .map(toDemoFloodConstraintMarker)
    .filter((marker): marker is FloodConstraintMapMarker => Boolean(marker))
    .slice(0, limit);
}

export async function getDemoFloodZonePolygons({
  limit,
  severity,
}: {
  limit: number;
  severity: "all" | FloodZoneSeverity;
}) {
  const features = await getDemoFloodFeatures();
  return features
    .map(toDemoFloodZonePolygon)
    .filter((polygon): polygon is FloodZoneMapPolygon => Boolean(polygon))
    .filter((polygon) =>
      severity === "all" ? true : polygon.floodSeverityClass === severity,
    )
    .slice(0, limit);
}

export async function getDemoSchoolUtilizationPolygons({
  level,
  limit,
  utilizationClass,
}: {
  level: SchoolUtilizationLevel;
  limit: number;
  utilizationClass: SchoolUtilizationClassFilter;
}) {
  const features = await getDemoSchoolCapacityFeatures();
  return features
    .map(toDemoSchoolUtilizationPolygon)
    .filter(
      (polygon): polygon is SchoolUtilizationZoneMapPolygon => Boolean(polygon),
    )
    .filter((polygon) =>
      level === "all" ? true : polygon.schoolLevel === level,
    )
    .filter((polygon) =>
      utilizationClass === "all"
        ? true
        : polygon.utilizationClass === utilizationClass,
    )
    .slice(0, limit);
}

export async function getDemoParcelMapFocus(
  record: ParcelFocusRecordLike,
  focusSource: ParcelFocusSource,
) {
  const features = await getDemoParcelFeatures();
  const feature = features.find(
    (candidate) =>
      asString(getProperties(candidate).official_parcel_id) ===
      record.officialParcelId,
  );

  if (!feature) {
    return createParcelMapFocus(record, focusSource);
  }

  const properties = getProperties(feature);
  const centroidLongitude = asNumber(properties.centroid_longitude);
  const centroidLatitude = asNumber(properties.centroid_latitude);
  const extent = normalizeExtent(properties.extent);
  const highlightGeometry = getParcelHighlightGeometry(feature.geometry);

  return createParcelMapFocus(record, focusSource, {
    centroid:
      centroidLongitude !== null && centroidLatitude !== null
        ? {
            latitude: centroidLatitude,
            longitude: centroidLongitude,
            spatialReference: { wkid: 4326 },
          }
        : null,
    extent,
    highlightGeometry,
  });
}

async function loadDemoMapJson<T>(
  fileName: string,
  fallback: T,
): Promise<T> {
  const cacheKey = `${DEMO_MAP_LAYER_BASE_URL}/${fileName}`;
  const cached = layerCache.get(cacheKey);

  if (cached) {
    return cached as Promise<T>;
  }

  const promise = fetch(cacheKey, {
    cache: "force-cache",
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return fallback;
      }

      return (await response.json()) as T;
    })
    .catch(() => fallback);

  layerCache.set(cacheKey, promise as Promise<DemoGeoJsonLayer>);
  return promise;
}

function toDemoDevelopmentHotspotMarker(
  feature: DemoGeoJsonFeature,
  segment: DevelopmentHotspotPermitSegmentFilter,
): DevelopmentHotspotMapMarker | null {
  const properties = getProperties(feature);
  const coordinates = getPointCoordinates(feature.geometry);
  const selectedSegmentCount = getSegmentPermitCount(properties, segment);
  const officialParcelId = asString(properties.official_parcel_id);

  if (!coordinates || !officialParcelId || selectedSegmentCount <= 0) {
    return null;
  }

  return {
    activeConstructionPermits:
      asNumber(properties.active_construction_permits) ?? 0,
    commercialActivityPermits:
      asNumber(properties.commercial_activity_permits) ?? 0,
    centroid: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      spatialReference: { wkid: 4326 },
    },
    demolitionPermits: asNumber(properties.demolition_permits) ?? 0,
    developmentActivityClass:
      asString(properties.development_activity_class) ?? "context_available",
    developmentActivityScore: null,
    dominantGrowthSignal: asString(properties.dominant_growth_signal),
    dominantPermitSegment:
      asString(properties.dominant_permit_segment) ??
      asString(properties.permit_segment),
    dominantZoningCodeRaw: asString(properties.dominant_zoning_code_raw),
    highValuePermits: asNumber(properties.high_value_permits) ?? 0,
    industrialActivityPermits:
      asNumber(properties.industrial_activity_permits) ?? 0,
    institutionalActivityPermits:
      asNumber(properties.institutional_activity_permits) ?? 0,
    majorValuePermits: asNumber(properties.major_value_permits) ?? 0,
    minorMaintenancePermits:
      asNumber(properties.minor_maintenance_permits) ?? 0,
    officialParcelId,
    permitSignalScoreAvg: null,
    permitSignalScoreMax: null,
    pin14: null,
    recentPermitCount1yr: asNumber(properties.recent_permit_count_1yr) ?? 0,
    recentPermitCount3yr: asNumber(properties.recent_permit_count_3yr) ?? 0,
    redevelopmentSignalPermits:
      asNumber(properties.redevelopment_signal_permits) ?? 0,
    residentialGrowthPermits:
      asNumber(properties.residential_growth_permits) ?? 0,
    totalPermitCount: asNumber(properties.total_permit_count) ?? 0,
    zoningJurisdictionName: asString(properties.zoning_jurisdiction_name),
  };
}

function toDemoFloodConstraintMarker(
  feature: DemoGeoJsonFeature,
): FloodConstraintMapMarker | null {
  const properties = getProperties(feature);
  const longitude = asNumber(properties.centroid_longitude);
  const latitude = asNumber(properties.centroid_latitude);
  const officialParcelId = asString(properties.official_parcel_id);
  const severity = getFloodConstraintSeverity(properties);

  if (
    longitude === null ||
    latitude === null ||
    !officialParcelId ||
    !severity
  ) {
    return null;
  }

  return {
    buildabilityImpact: asString(properties.buildability_impact),
    centroid: {
      latitude,
      longitude,
      spatialReference: { wkid: 4326 },
    },
    dominantFloodZone: asString(properties.dominant_flood_zone),
    floodConstraintScore: null,
    floodReviewRequired: asBoolean(properties.flood_review_required),
    floodSeverityClass: severity,
    floodwayPresent: asBoolean(properties.floodway_present),
    officialParcelId,
    percentParcelConstrained: asNumber(properties.percent_parcel_constrained),
    pin14: null,
    sfhaPresent: asBoolean(properties.sfha_present),
  };
}

function toDemoFloodZonePolygon(
  feature: DemoGeoJsonFeature,
): FloodZoneMapPolygon | null {
  const properties = getProperties(feature);
  const geometry = getPolygonGeometry(feature.geometry);

  if (!geometry) {
    return null;
  }

  return {
    fldArId: null,
    floodConstraintType: asString(properties.flood_constraint_type),
    floodSeverityClass: normalizeFloodZoneSeverity(
      asString(properties.flood_severity_class),
    ),
    floodZoneCode: asString(properties.dominant_flood_zone),
    floodZoneInternalId: stableNumericId(
      asString(properties.official_parcel_id) ?? JSON.stringify(properties),
    ),
    geometry,
    gfid: null,
    globalid: null,
    sourceLayer: "Portfolio demo floodplain review",
    sourceObjectid: null,
  };
}

function toDemoSchoolUtilizationPolygon(
  feature: DemoGeoJsonFeature,
): SchoolUtilizationZoneMapPolygon | null {
  const properties = getProperties(feature);
  const geometry = getPolygonGeometry(feature.geometry);
  const zoneId = asString(properties.zone_id);

  if (!geometry || !zoneId) {
    return null;
  }

  return {
    geometry,
    matchConfidence: asString(properties.match_confidence),
    matchedSchoolReferenceId: asString(properties.matched_school_reference_id),
    needsVerification: asBoolean(properties.needs_verification),
    schoolLevel: normalizeSchoolLevel(asString(properties.school_level)),
    schoolName: asString(properties.school_name),
    schoolNameNormalized: asString(properties.school_name_normalized),
    schoolSystem: asString(properties.school_system),
    schoolYear: asString(properties.school_year),
    sourceConfidence: asString(properties.source_confidence) ?? "not_available",
    sourceLayer: asString(properties.source_layer),
    sourceObjectid: asString(properties.source_objectid),
    utilizationClass: normalizeSchoolUtilizationClass(
      asString(properties.utilization_class),
    ),
    utilizationPct: asNumber(properties.utilization_pct),
    zoneId,
    zoneMatchConfidence: asString(properties.zone_match_confidence),
  };
}

function getProperties(feature: DemoGeoJsonFeature) {
  return feature.properties ?? {};
}

function getParcelHighlightGeometry(
  geometry: DemoGeoJsonGeometry | null,
): ParcelHighlightGeometry | null {
  if (!geometry) {
    return null;
  }

  const geometryType = geometry?.type;

  if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
    return null;
  }

  if (!Array.isArray(geometry.coordinates)) {
    return null;
  }

  return {
    coordinates: geometry.coordinates,
    spatialReference: { wkid: 4326 },
    type: geometryType,
  };
}

function hasGeometry(feature: DemoGeoJsonFeature) {
  return Boolean(feature.geometry?.type && feature.geometry.coordinates);
}

function getPointCoordinates(geometry: DemoGeoJsonGeometry | null) {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const longitude = Number(geometry.coordinates[0]);
  const latitude = Number(geometry.coordinates[1]);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return { latitude, longitude };
}

function getPolygonGeometry(geometry: DemoGeoJsonGeometry | null) {
  if (
    geometry?.type !== "Polygon" &&
    geometry?.type !== "MultiPolygon"
  ) {
    return null;
  }

  if (!Array.isArray(geometry.coordinates)) {
    return null;
  }

  return {
    coordinates: geometry.coordinates,
    spatialReference: { wkid: 4326 },
    type: geometry.type,
  } as FloodZoneMapPolygon["geometry"];
}

function getSegmentPermitCount(
  properties: Record<string, unknown>,
  segment: DevelopmentHotspotPermitSegmentFilter,
) {
  switch (segment) {
    case "commercial_activity":
      return asNumber(properties.commercial_activity_permits) ?? 0;
    case "demolition":
      return asNumber(properties.demolition_permits) ?? 0;
    case "industrial_activity":
      return asNumber(properties.industrial_activity_permits) ?? 0;
    case "institutional_activity":
      return asNumber(properties.institutional_activity_permits) ?? 0;
    case "minor_maintenance":
      return asNumber(properties.minor_maintenance_permits) ?? 0;
    case "redevelopment_signal":
      return asNumber(properties.redevelopment_signal_permits) ?? 0;
    case "residential_growth":
      return asNumber(properties.residential_growth_permits) ?? 0;
    case "administrative_or_unknown":
      return Math.max(
        0,
        (asNumber(properties.total_permit_count) ?? 0) -
          (asNumber(properties.commercial_activity_permits) ?? 0) -
          (asNumber(properties.demolition_permits) ?? 0) -
          (asNumber(properties.industrial_activity_permits) ?? 0) -
          (asNumber(properties.institutional_activity_permits) ?? 0) -
          (asNumber(properties.minor_maintenance_permits) ?? 0) -
          (asNumber(properties.redevelopment_signal_permits) ?? 0) -
          (asNumber(properties.residential_growth_permits) ?? 0),
      );
    case "all":
    default:
      return asNumber(properties.total_permit_count) ?? 0;
  }
}

function getFloodConstraintSeverity(
  properties: Record<string, unknown>,
): FloodConstraintMapMarker["floodSeverityClass"] {
  if (asBoolean(properties.floodway_present)) {
    return "severe";
  }

  const severity = asString(properties.flood_severity_class);
  if (severity === "severe" || severity === "high" || severity === "moderate") {
    return severity;
  }

  if (asBoolean(properties.sfha_present)) {
    return "high";
  }

  return null;
}

function normalizeFloodZoneSeverity(value: string | null): FloodZoneSeverity | null {
  if (
    value === "severe" ||
    value === "high" ||
    value === "moderate" ||
    value === "low"
  ) {
    return value;
  }

  return null;
}

function normalizeSchoolLevel(value: string | null): SchoolUtilizationZoneLevel | null {
  const normalized = value?.toLowerCase();

  if (normalized === "elementary" || normalized === "middle" || normalized === "high") {
    return normalized;
  }

  return null;
}

function normalizeSchoolUtilizationClass(
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

function normalizeExtent(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const extent = value as Record<string, unknown>;
  const xmin = asNumber(extent.xmin);
  const ymin = asNumber(extent.ymin);
  const xmax = asNumber(extent.xmax);
  const ymax = asNumber(extent.ymax);

  if (xmin === null || ymin === null || xmax === null || ymax === null) {
    return null;
  }

  return {
    spatialReference: { wkid: 4326 },
    xmax,
    xmin,
    ymax,
    ymin,
  };
}

function stableNumericId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function asString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return value === true;
}
