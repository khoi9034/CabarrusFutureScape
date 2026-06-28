import type ArcGISMap from "@arcgis/core/Map";
import type MapView from "@arcgis/core/views/MapView";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import { cabarrusSceneConfig } from "@/lib/gis/gisConfig";

export interface CabarrusSceneView {
  map: ArcGISMap;
  view: MapView;
}

export function createCabarrusSceneView(
  runtime: ArcGISRuntime,
  container: HTMLDivElement,
): CabarrusSceneView {
  const map = new runtime.Map({
    basemap: cabarrusSceneConfig.basemap,
  });
  const clippingArea = new runtime.Extent({
    spatialReference: {
      wkid: cabarrusSceneConfig.studyExtent.wkid,
    },
    xmax: cabarrusSceneConfig.studyExtent.xmax,
    xmin: cabarrusSceneConfig.studyExtent.xmin,
    ymax: cabarrusSceneConfig.studyExtent.ymax,
    ymin: cabarrusSceneConfig.studyExtent.ymin,
  });

  const view = new runtime.MapView({
    center: [
      cabarrusSceneConfig.center.longitude,
      cabarrusSceneConfig.center.latitude,
    ],
    container,
    constraints: {
      geometry: clippingArea,
      maxZoom: 20,
      minZoom: 9,
    },
    extent: clippingArea,
    map,
    ui: {
      components: [],
    },
    zoom: cabarrusSceneConfig.zoom,
  });

  return { map, view };
}
