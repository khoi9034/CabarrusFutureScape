"use client";

import { useMemo } from "react";
import type {
  DemoGeoJsonFeature,
  DemoGeoJsonGeometry,
  DemoMapContext,
} from "@/lib/demo-data/mapLayerClient";
import { cabarrusSceneConfig } from "@/lib/gis/gisConfig";
import type { ModelResearchPreviewMarker } from "@/types/map/modelResearchPreview";
import type { MapOverlayViewMode } from "@/types/map/overlayViewModes";

interface LocalContextFallbackMapProps {
  context: DemoMapContext | null;
  developmentViewMode: MapOverlayViewMode;
  interactiveReady: boolean;
  modelResearchMarkers: ModelResearchPreviewMarker[];
  modelResearchViewMode: MapOverlayViewMode;
  selectedParcelId: string | null;
  showDevelopment: boolean;
  showFlood: boolean;
  showModelResearch: boolean;
  showSchools: boolean;
  zoomLevel: number;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 650;

export function LocalContextFallbackMap({
  context,
  developmentViewMode,
  interactiveReady,
  modelResearchMarkers,
  modelResearchViewMode,
  selectedParcelId,
  showDevelopment,
  showFlood,
  showModelResearch,
  showSchools,
  zoomLevel,
}: LocalContextFallbackMapProps) {
  const drawing = useMemo(() => buildDrawing(context), [context]);
  const developmentDisplayPoints = useMemo(
    () =>
      buildDisplayPoints(
        drawing.development,
        developmentViewMode,
        "development",
      ),
    [developmentViewMode, drawing.development],
  );
  const selectedParcel = selectedParcelId
    ? context?.parcels.features.find(
        (feature) =>
          feature.properties?.official_parcel_id === selectedParcelId,
      )
    : null;
  const selectedParcelPath = selectedParcel
    ? polygonPath(selectedParcel.geometry)
    : "";
  const selectedParcelPoint = selectedParcel
    ? pointCoordinates(selectedParcel.geometry) ?? featureCenter(selectedParcel)
    : null;
  const modelResearchPoints = useMemo(
    () =>
      modelResearchMarkers
        .filter(
          (marker) =>
            Number.isFinite(marker.centroid.longitude) &&
            Number.isFinite(marker.centroid.latitude),
        )
        .map((marker) => ({
          ...project(marker.centroid.longitude, marker.centroid.latitude),
          id: marker.officialParcelId,
        })),
    [modelResearchMarkers],
  );
  const modelResearchDisplayPoints = useMemo(
    () =>
      buildDisplayPoints(
        modelResearchPoints,
        modelResearchViewMode,
        "model-research",
      ),
    [modelResearchPoints, modelResearchViewMode],
  );
  const viewBox = getViewBox(zoomLevel, selectedParcelPoint);

  return (
    <svg
      aria-hidden={interactiveReady}
      aria-label="Cabarrus County same-origin context map"
      className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
        interactiveReady ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      data-county-path-ready={drawing.county ? "true" : "false"}
      data-context-ready={context?.requiredReady ? "true" : "false"}
      data-map-renderer="static"
      data-testid="cfs-local-context-map"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={viewBox}
    >
      <defs>
        <clipPath id="cfs-county-context-clip">
          <path d={drawing.county} fillRule="evenodd" />
        </clipPath>
      </defs>
      <rect fill="#050911" height={VIEW_HEIGHT} width={VIEW_WIDTH} />
      <path
        d={drawing.county}
        data-layer-id="county-boundary"
        fill="none"
        fillRule="evenodd"
        stroke="#d8b86a"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
      <g clipPath="url(#cfs-county-context-clip)">
        <g data-layer-id="hydrography">
          {drawing.hydrography.map((path, index) => (
            <path
              d={path}
              fill="#286985"
              fillOpacity="0.58"
              fillRule="evenodd"
              key={`hydro-${index}`}
              stroke="#68d8ff"
              strokeOpacity="0.42"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g data-layer-id="municipal-boundaries">
          {drawing.municipalities.map((path, index) => (
            <path
              d={path}
              fill="#7d91a3"
              fillOpacity="0"
              fillRule="evenodd"
              key={`municipality-${index}`}
              stroke="#a6b4c1"
              strokeDasharray="5 5"
              strokeOpacity="0.44"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g data-layer-id="major-roads" fill="none">
          {drawing.roads.map((path, index) => (
            <path
              d={path}
              key={`road-${index}`}
              stroke="#b6c3cf"
              strokeOpacity="0.72"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {showFlood ? (
          <g data-layer-id="floodplain-review">
            {drawing.floodplain.map((path, index) => (
              <path
                d={path}
                fill="#4ea6c8"
                fillOpacity="0.27"
                fillRule="evenodd"
                key={`flood-${index}`}
                stroke="#74d4ef"
                strokeOpacity="0.5"
                strokeWidth="1"
              />
            ))}
            {drawing.floodPoints.map((point, index) => (
              <circle
                cx={point.x}
                cy={point.y}
                fill="#4ea6c8"
                fillOpacity="0.72"
                key={`flood-point-${index}`}
                r="3.4"
                stroke="#9ce8ff"
                strokeWidth="0.8"
              />
            ))}
          </g>
        ) : null}
        {showSchools ? (
          <g data-layer-id="school-capacity">
            {drawing.schools.map((path, index) => (
              <path
                d={path}
                fill="#d8b86a"
                fillOpacity="0.12"
                fillRule="evenodd"
                key={`school-${index}`}
                stroke="#f0cd79"
                strokeOpacity="0.6"
                strokeWidth="1.2"
              />
            ))}
          </g>
        ) : null}
        {showDevelopment ? (
          <g
            data-development-view-mode={developmentViewMode}
            data-layer-id="development-hotspots"
          >
            {developmentDisplayPoints.map((point) => (
              <g key={point.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill="#ff9f43"
                  fillOpacity={developmentViewMode === "heatmap" ? "0.18" : "0.72"}
                  r={
                    developmentViewMode === "heatmap"
                      ? 14
                      : developmentViewMode === "clusters"
                        ? Math.min(13, 4.5 + Math.sqrt(point.count))
                        : 3.6
                  }
                  stroke="#ffe1ad"
                  strokeOpacity={developmentViewMode === "heatmap" ? "0.2" : "0.7"}
                  strokeWidth="0.8"
                />
                {developmentViewMode === "clusters" && point.count > 1 ? (
                  <text
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="700"
                    textAnchor="middle"
                    x={point.x}
                    y={point.y + 2.7}
                  >
                    {point.count}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        ) : null}
        {showModelResearch ? (
          <g
            data-layer-id="model-research"
            data-model-research-view-mode={modelResearchViewMode}
          >
            {modelResearchDisplayPoints.map((point) => (
              <g key={`model-research-${point.id}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill="#c084fc"
                  fillOpacity={modelResearchViewMode === "heatmap" ? "0.16" : "0.58"}
                  r={
                    modelResearchViewMode === "heatmap"
                      ? 12
                      : modelResearchViewMode === "clusters"
                        ? Math.min(12, 4 + Math.sqrt(point.count))
                        : 3.4
                  }
                  stroke="#ead7ff"
                  strokeOpacity={modelResearchViewMode === "heatmap" ? "0.2" : "0.82"}
                  strokeWidth="0.9"
                  vectorEffect="non-scaling-stroke"
                />
                {modelResearchViewMode === "clusters" && point.count > 1 ? (
                  <text
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="700"
                    textAnchor="middle"
                    x={point.x}
                    y={point.y + 2.7}
                  >
                    {point.count}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        ) : null}
        {selectedParcelPath ? (
          <path
            d={selectedParcelPath}
            data-layer-id="selected-parcel"
            fill="#d8b86a"
            fillOpacity="0.38"
            fillRule="evenodd"
            stroke="#fff0b8"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ) : selectedParcelPoint ? (
          <circle
            cx={selectedParcelPoint.x}
            cy={selectedParcelPoint.y}
            data-layer-id="selected-parcel"
            fill="#d8b86a"
            r="7"
            stroke="#fff0b8"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
      <g data-layer-id="place-labels">
        {drawing.labels.map((label) => (
          <g key={label.label}>
            <circle
              cx={label.x}
              cy={label.y}
              fill="#d8b86a"
              r="3.2"
              stroke="#07111f"
              strokeWidth="1.5"
            />
            <text
              fill="#eef4f8"
              fontFamily="Inter, Arial, sans-serif"
              fontSize="15"
              fontWeight="600"
              paintOrder="stroke"
              stroke="#07111f"
              strokeWidth="4"
              textAnchor="middle"
              x={label.x}
              y={label.y - 10}
            >
              {label.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function getViewBox(zoomLevel: number, center: SvgPoint | null) {
  const scale = 2 ** Math.max(0, Math.min(4, zoomLevel));
  const width = VIEW_WIDTH / scale;
  const height = VIEW_HEIGHT / scale;
  const x = Math.max(
    0,
    Math.min(VIEW_WIDTH - width, (center?.x ?? VIEW_WIDTH / 2) - width / 2),
  );
  const y = Math.max(
    0,
    Math.min(VIEW_HEIGHT - height, (center?.y ?? VIEW_HEIGHT / 2) - height / 2),
  );
  return `${x} ${y} ${width} ${height}`;
}

function buildDrawing(context: DemoMapContext | null) {
  return {
    county: context?.countyBoundary.features.map(featurePath).join(" ") ?? "",
    development:
      context?.developmentHotspots.features
        .map((feature) => pointCoordinates(feature.geometry))
        .filter((point): point is SvgPoint => Boolean(point)) ?? [],
    floodplain: context?.floodplain.features.map(featurePath).filter(Boolean) ?? [],
    floodPoints:
      context?.floodplain.features
        .map((feature) => pointCoordinates(feature.geometry))
        .filter((point): point is SvgPoint => Boolean(point)) ?? [],
    hydrography:
      context?.hydrography.features.map(featurePath).filter(Boolean) ?? [],
    labels:
      context?.placeLabels.features
        .map((feature) => {
          const point = pointCoordinates(feature.geometry);
          const label = stringProperty(feature, "label");
          return point && label ? { ...point, label } : null;
        })
        .filter((label): label is SvgLabel => Boolean(label)) ?? [],
    municipalities:
      context?.municipalities.features.map(featurePath).filter(Boolean) ?? [],
    roads:
      context?.transportation.features.map(linePath).filter(Boolean) ?? [],
    schools:
      context?.schoolCapacity.features.map(featurePath).filter(Boolean) ?? [],
  };
}

interface SvgPoint {
  x: number;
  y: number;
}

interface SvgLabel extends SvgPoint {
  label: string;
}

interface SvgDisplayPoint extends SvgPoint {
  count: number;
  id: string;
}

function buildDisplayPoints(
  points: Array<SvgPoint & { id?: string }>,
  viewMode: MapOverlayViewMode,
  idPrefix: string,
): SvgDisplayPoint[] {
  const displayPoints = points.map((point, index) => ({
    ...point,
    count: 1,
    id: point.id ?? `${idPrefix}-${index}`,
  }));
  if (viewMode !== "clusters") {
    return displayPoints;
  }

  const cells = new Map<string, SvgDisplayPoint>();
  displayPoints.forEach((point) => {
    const key = `${Math.round(point.x / 32)}:${Math.round(point.y / 32)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.x = (cell.x * cell.count + point.x) / (cell.count + 1);
      cell.y = (cell.y * cell.count + point.y) / (cell.count + 1);
      cell.count += 1;
    } else {
      cells.set(key, { ...point, id: `${idPrefix}-${key}` });
    }
  });
  return [...cells.values()];
}

function featurePath(feature: DemoGeoJsonFeature) {
  return polygonPath(feature.geometry);
}

function polygonPath(geometry: DemoGeoJsonGeometry | null) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return "";
  }
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  return polygons
    .flatMap((polygon) => (Array.isArray(polygon) ? polygon : []))
    .map((ring) => coordinatePath(ring, true))
    .filter(Boolean)
    .join(" ");
}

function linePath(feature: DemoGeoJsonFeature) {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return "";
  }
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];

  return lines.map((line) => coordinatePath(line, false)).filter(Boolean).join(" ");
}

function coordinatePath(coordinates: unknown, close: boolean) {
  if (!Array.isArray(coordinates)) {
    return "";
  }
  const points = coordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
      }
      const longitude = Number(coordinate[0]);
      const latitude = Number(coordinate[1]);
      return Number.isFinite(longitude) && Number.isFinite(latitude)
        ? project(longitude, latitude)
        : null;
    })
    .filter((point): point is SvgPoint => Boolean(point));

  if (points.length < (close ? 3 : 2)) {
    return "";
  }

  return `${points
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")}${close ? " Z" : ""}`;
}

function pointCoordinates(geometry: DemoGeoJsonGeometry | null) {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  const longitude = Number(geometry.coordinates[0]);
  const latitude = Number(geometry.coordinates[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? project(longitude, latitude)
    : null;
}

function featureCenter(feature: DemoGeoJsonFeature) {
  const longitude = numberProperty(feature, "centroid_longitude");
  const latitude = numberProperty(feature, "centroid_latitude");
  return longitude !== null && latitude !== null
    ? project(longitude, latitude)
    : null;
}

function project(longitude: number, latitude: number) {
  const extent = cabarrusSceneConfig.studyExtent;
  return {
    x: ((longitude - extent.xmin) / (extent.xmax - extent.xmin)) * VIEW_WIDTH,
    y: ((extent.ymax - latitude) / (extent.ymax - extent.ymin)) * VIEW_HEIGHT,
  };
}

function stringProperty(feature: DemoGeoJsonFeature, name: string) {
  const value = feature.properties?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberProperty(feature: DemoGeoJsonFeature, name: string) {
  const value = feature.properties?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
