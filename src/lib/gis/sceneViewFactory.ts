import type ArcGISMap from "@arcgis/core/Map";
import type Basemap from "@arcgis/core/Basemap";
import type Extent from "@arcgis/core/geometry/Extent";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapView from "@arcgis/core/views/MapView";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import { createCfsVisualBasemapLayer } from "@/lib/gis/basemapProvider";
import { cabarrusSceneConfig } from "@/lib/gis/gisConfig";

export interface CabarrusSceneView {
  map: ArcGISMap;
  view: MapView;
}

export interface CfsResultSceneView extends CabarrusSceneView {
  resultLayer: GraphicsLayer;
  visualBasemapLayer: ReturnType<typeof createCfsVisualBasemapLayer>;
}

export interface CabarrusContextBasemapLayers {
  county: GraphicsLayer;
  hydrography: GraphicsLayer;
  labels: GraphicsLayer;
  municipalities: GraphicsLayer;
  roads: GraphicsLayer;
}

export function createCabarrusContextBasemap(
  runtime: ArcGISRuntime,
  layers: CabarrusContextBasemapLayers,
) {
  return new runtime.Basemap({
    baseLayers: [
      layers.hydrography,
      layers.municipalities,
      layers.roads,
    ],
    id: "cfs-same-origin-basemap",
    referenceLayers: [layers.county, layers.labels],
    title: "Cabarrus County same-origin basemap",
  });
}

export function createCabarrusSceneView(
  runtime: ArcGISRuntime,
  container: HTMLDivElement,
  basemap: Basemap,
  initialExtent?: Extent | null,
): CabarrusSceneView {
  const map = new runtime.Map({ basemap });
  const clippingArea = createCabarrusStudyExtent(runtime);
  const spatialReference = { wkid: 3857 };

  const view = new runtime.MapView({
    attributionVisible: true,
    background: { color: "#050911" },
    container,
    constraints: {
      geometry: clippingArea,
      lods: runtime.TileInfo.create().lods,
      maxZoom: 20,
      minZoom: 9,
    },
    extent: initialExtent ?? clippingArea,
    map,
    padding: {
      bottom: 96,
      left: 64,
      right: 24,
      top: 72,
    },
    spatialReference,
    ui: {
      components: [],
    },
  });

  return { map, view };
}

export function createCfsResultSceneView(
  runtime: ArcGISRuntime,
  container: HTMLDivElement,
  resultLayer: GraphicsLayer,
): CfsResultSceneView {
  const visualBasemapLayer = createCfsVisualBasemapLayer(runtime);
  const basemap = new runtime.Basemap({
    baseLayers: [],
    id: "cfs-master-data-osm-basemap",
    title: "OpenStreetMap visual basemap",
  });
  const scene = createCabarrusSceneView(runtime, container, basemap);
  scene.map.add(resultLayer);
  return { ...scene, resultLayer, visualBasemapLayer };
}

export function destroyCfsResultSceneView(scene: CfsResultSceneView | null) {
  if (!scene) return;
  if (!scene.view.destroyed) scene.view.destroy();
  if (!scene.resultLayer.destroyed) scene.resultLayer.destroy();
  if (!scene.visualBasemapLayer.destroyed) scene.visualBasemapLayer.destroy();
}

export function createCabarrusStudyExtent(runtime: ArcGISRuntime) {
  const geographicExtent = new runtime.Extent({
    spatialReference: {
      wkid: cabarrusSceneConfig.studyExtent.wkid,
    },
    xmax: cabarrusSceneConfig.studyExtent.xmax,
    xmin: cabarrusSceneConfig.studyExtent.xmin,
    ymax: cabarrusSceneConfig.studyExtent.ymax,
    ymin: cabarrusSceneConfig.studyExtent.ymin,
  });

  return runtime.webMercatorUtils.geographicToWebMercator(
    geographicExtent,
  ) as Extent;
}
