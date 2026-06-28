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
  SchoolPressureFeature,
  SchoolPressureResponse,
} from "@/types/map/schoolPressure";
import type {
  ParcelFocusSource,
  ParcelHighlightGeometry,
} from "@/types/map/parcelFocus";
import type {
  ModelResearchPreviewMarker,
} from "@/types/map/modelResearchPreview";

const DEMO_DATA_BASE_URL = "/demo-data";
const DEMO_MAP_LAYER_BASE_URL = "/demo-data/map_layers";

const demoLayerFiles = {
  county_boundary: "demo_county_boundary.geojson",
  development_hotspots: "demo_development_hotspots.geojson",
  floodplain_review: "demo_floodplain_review.geojson",
  model_research: "demo_model_research.geojson",
  parcels: "demo_parcels.geojson",
  school_capacity: "demo_school_capacity.geojson",
  school_pressure: "demo_school_pressure_areas.geojson",
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

export interface DemoDevelopmentYears {
  available_years: number[];
  default_year_end: number | null;
  default_year_start: number | null;
  generated_at?: string | null;
  max_year: number | null;
  min_year: number | null;
  mode?: string;
  segment_year_counts: Record<string, Record<string, number>>;
  yearly_counts: Record<string, number>;
}

interface DemoModelLabClusters {
  available?: boolean;
  caveat?: string;
  generated_at?: string | null;
  markers?: DemoModelLabMarker[];
  mode?: string;
  total_count?: number;
}

interface DemoModelLabMarker {
  caveat?: string | null;
  confidence_label?: string | null;
  count?: number | null;
  id?: string | null;
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  model_version?: string | null;
  official_parcel_id?: string | null;
  recommended_follow_up?: string | null;
  research_band?: string | null;
  research_rank_band?: string | null;
  top_drivers?: string[] | null;
  type?: "cluster" | "parcel" | string | null;
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
const dataCache = new Map<string, Promise<unknown>>();

const emptyDevelopmentYears: DemoDevelopmentYears = {
  available_years: [],
  default_year_end: null,
  default_year_start: null,
  max_year: null,
  min_year: null,
  mode: "portfolio_demo",
  segment_year_counts: {},
  yearly_counts: {},
};

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

export async function getDemoDevelopmentYears() {
  return loadDemoDataJson<DemoDevelopmentYears>(
    "development_years.json",
    emptyDevelopmentYears,
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

export async function getDemoSchoolPressureResponse() {
  const fallback: SchoolPressureResponse = {
    as_of: null,
    caveats: [
      "Portfolio demo school pressure extract is not available.",
    ],
    data_coverage_notes: ["Demo data not available."],
    features: [],
    limit: 0,
    mode: "demo",
    offset: 0,
    summary: {
      areas_analyzed: 0,
      areas_with_recent_permits: 0,
      areas_with_utilization: 0,
      data_needed_count: 0,
      elevated_review_count: 0,
      recent_residential_permits_in_watched_areas: 0,
    },
    total_count: 0,
  };
  const [summary, layer] = await Promise.all([
    loadDemoDataJson<Partial<SchoolPressureResponse> & { available?: boolean }>(
      "school_pressure_summary.json",
      fallback,
    ),
    getDemoGeoJsonLayer("school_pressure"),
  ]);
  const features = layer.features.filter(
    hasGeometry,
  ) as unknown as SchoolPressureFeature[];

  return {
    ...fallback,
    ...summary,
    as_of: summary.as_of ?? layer.metadata?.generated_at ?? null,
    features,
    limit: summary.limit ?? features.length,
    mode: summary.mode ?? "demo",
    total_count: summary.total_count ?? features.length,
  };
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
  options: { yearEnd?: number | null; yearStart?: number | null } = {},
) {
  if (segment === "all") {
    return [];
  }

  const layer = await getDemoGeoJsonLayer("development_hotspots");
  return layer.features
    .map((feature) => toDemoDevelopmentHotspotMarker(feature, segment, options))
    .filter((marker): marker is DevelopmentHotspotMapMarker => Boolean(marker));
}

export async function getDemoModelLabMarkers({
  limit = 500,
  signal = "higher",
}: {
  limit?: number;
  signal?: "all" | "higher" | "lower" | "moderate";
} = {}) {
  const payload = await loadDemoDataJson<DemoModelLabClusters>(
    "model_lab_demo_clusters.json",
    {
      available: false,
      caveat: "Portfolio demo does not include model research markers.",
      markers: [],
      mode: "portfolio_demo",
      total_count: 0,
    },
  );

  const markers = (payload.markers ?? [])
    .map(toDemoModelLabMarker)
    .filter((marker): marker is ModelResearchPreviewMarker => Boolean(marker))
    .filter((marker) => matchesDemoModelSignal(marker, signal))
    .slice(0, limit);

  return {
    caveat:
      payload.caveat ??
      "Relative research signal only. No exact probability shown.",
    markers,
    totalCount: payload.total_count ?? markers.length,
  };
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

async function loadDemoDataJson<T>(
  fileName: string,
  fallback: T,
): Promise<T> {
  const cacheKey = `${DEMO_DATA_BASE_URL}/${fileName}`;
  const cached = dataCache.get(cacheKey);

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

  dataCache.set(cacheKey, promise);
  return promise;
}

function toDemoDevelopmentHotspotMarker(
  feature: DemoGeoJsonFeature,
  segment: DevelopmentHotspotPermitSegmentFilter,
  options: { yearEnd?: number | null; yearStart?: number | null },
): DevelopmentHotspotMapMarker | null {
  const properties = getProperties(feature);
  const coordinates = getPointCoordinates(feature.geometry);
  if (!doesFeatureOverlapYearRange(properties, options)) {
    return null;
  }

  const selectedSegmentCount = getSegmentPermitCount(
    properties,
    segment,
    options,
  );
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
    totalPermitCount: selectedSegmentCount,
    zoningJurisdictionName: asString(properties.zoning_jurisdiction_name),
  };
}

function toDemoModelLabMarker(
  marker: DemoModelLabMarker,
): ModelResearchPreviewMarker | null {
  const latitude = asNumber(marker.latitude);
  const longitude = asNumber(marker.longitude);
  const researchSignalLabel =
    normalizeDemoResearchBand(marker.research_band) ??
    "Moderate Research Signal";

  if (latitude === null || longitude === null) {
    return null;
  }

  const contextKind =
    marker.type === "cluster" ? "cluster" : "parcel_marker";
  const representedFeatureCount =
    contextKind === "cluster" ? Math.max(1, asNumber(marker.count) ?? 1) : 1;

  return {
    approximateAreaLabel: asString(marker.label) ?? undefined,
    bandCounts:
      contextKind === "cluster"
        ? getSingleBandCounts(researchSignalLabel, representedFeatureCount)
        : undefined,
    caveat:
      asString(marker.caveat) ??
      "Relative research signal only. No exact probability shown.",
    clusterId: contextKind === "cluster" ? asString(marker.id) ?? undefined : undefined,
    centroid: {
      latitude,
      longitude,
      spatialReference: { wkid: 4326 },
    },
    contextKind,
    dataQualityFlag:
      asString(marker.confidence_label) ?? "Demo context",
    displayMode:
      contextKind === "cluster" ? "clustered_markers" : "parcel_detail",
    dominantResearchBand:
      contextKind === "cluster" ? researchSignalLabel : undefined,
    exactProbabilityAvailable: false,
    modelVersion:
      asString(marker.model_version) ?? "portfolio_demo_model_research",
    officialParcelId:
      asString(marker.official_parcel_id) ??
      asString(marker.label) ??
      "Demo research context",
    productionReady: false,
    publicExposureAllowed: false,
    representativeSignalLabel:
      contextKind === "cluster" ? researchSignalLabel : undefined,
    representedFeatureCount,
    researchRankBand:
      asString(marker.research_rank_band) ??
      getResearchRankBandForSignal(researchSignalLabel),
    researchSignalLabel,
    selectedFeatureGroupSummary: (marker.top_drivers ?? []).join(", "),
    topDriverSummary: (marker.top_drivers ?? []).join(", "),
    topDrivers: (marker.top_drivers ?? []).filter(
      (driver): driver is string => typeof driver === "string" && driver.length > 0,
    ),
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
  options: { yearEnd?: number | null; yearStart?: number | null } = {},
) {
  const rangeCount = getSegmentPermitCountForYearRange(
    properties,
    segment,
    options,
  );
  if (rangeCount !== null) {
    return rangeCount;
  }

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

function getSegmentPermitCountForYearRange(
  properties: Record<string, unknown>,
  segment: DevelopmentHotspotPermitSegmentFilter,
  options: { yearEnd?: number | null; yearStart?: number | null },
) {
  const yearStart = options.yearStart;
  const yearEnd = options.yearEnd;

  if (!yearStart && !yearEnd) {
    return null;
  }

  const counts =
    segment === "all"
      ? asRecord(properties.yearly_counts)
      : asRecord(asRecord(properties.segment_year_counts)?.[segment]);

  if (!counts) {
    return null;
  }

  return Object.entries(counts).reduce((sum, [yearKey, value]) => {
    const year = Number(yearKey);
    const count = Number(value);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(count) ||
      (yearStart && year < yearStart) ||
      (yearEnd && year > yearEnd)
    ) {
      return sum;
    }

    return sum + count;
  }, 0);
}

function doesFeatureOverlapYearRange(
  properties: Record<string, unknown>,
  options: { yearEnd?: number | null; yearStart?: number | null },
) {
  const yearStart = options.yearStart;
  const yearEnd = options.yearEnd;

  if (!yearStart && !yearEnd) {
    return true;
  }

  const featureStart = asNumber(properties.year_start) ?? asNumber(properties.year);
  const featureEnd = asNumber(properties.year_end) ?? asNumber(properties.year);

  if (featureStart === null || featureEnd === null) {
    return true;
  }

  if (yearStart && featureEnd < yearStart) {
    return false;
  }

  if (yearEnd && featureStart > yearEnd) {
    return false;
  }

  return true;
}

function matchesDemoModelSignal(
  marker: ModelResearchPreviewMarker,
  signal: "all" | "higher" | "lower" | "moderate",
) {
  if (signal === "all") {
    return true;
  }

  if (signal === "higher") {
    return (
      marker.researchSignalLabel === "Very Strong Research Signal" ||
      marker.researchSignalLabel === "Strong Research Signal"
    );
  }

  if (signal === "moderate") {
    return marker.researchSignalLabel === "Moderate Research Signal";
  }

  return (
    marker.researchSignalLabel === "Lower Research Signal" ||
    marker.researchSignalLabel === "Insufficient Data"
  );
}

function normalizeDemoResearchBand(value: string | null | undefined) {
  switch (value) {
    case "Very Strong Research Signal":
    case "Strong Research Signal":
    case "Moderate Research Signal":
    case "Lower Research Signal":
    case "Insufficient Data":
      return value;
    case "Higher research signal":
      return "Strong Research Signal";
    case "Moderate research signal":
      return "Moderate Research Signal";
    case "Lower research signal":
      return "Lower Research Signal";
    default:
      return null;
  }
}

function getResearchRankBandForSignal(value: string) {
  switch (value) {
    case "Very Strong Research Signal":
      return "top_5_percent_research_band";
    case "Strong Research Signal":
    case "Moderate Research Signal":
      return "top_15_percent_research_band";
    case "Insufficient Data":
      return "insufficient_data";
    default:
      return "remaining_research_band";
  }
}

function getSingleBandCounts(signalLabel: string, count: number) {
  return {
    insufficient: signalLabel === "Insufficient Data" ? count : 0,
    lower: signalLabel === "Lower Research Signal" ? count : 0,
    moderate: signalLabel === "Moderate Research Signal" ? count : 0,
    strong: signalLabel === "Strong Research Signal" ? count : 0,
    veryStrong: signalLabel === "Very Strong Research Signal" ? count : 0,
  };
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
