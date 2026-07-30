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
  useOnlineBasemap = true,
): CabarrusSceneView {
  const map = new runtime.Map(
    useOnlineBasemap ? { basemap: cabarrusSceneConfig.basemap } : {},
  );
  const clippingArea = createCabarrusStudyExtent(runtime);

  const view = new runtime.MapView({
    background: { color: "#050911" },
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

export function createCabarrusStudyExtent(runtime: ArcGISRuntime) {
  return new runtime.Extent({
    spatialReference: {
      wkid: cabarrusSceneConfig.studyExtent.wkid,
    },
    xmax: cabarrusSceneConfig.studyExtent.xmax,
    xmin: cabarrusSceneConfig.studyExtent.xmin,
    ymax: cabarrusSceneConfig.studyExtent.ymax,
    ymin: cabarrusSceneConfig.studyExtent.ymin,
  });
}
