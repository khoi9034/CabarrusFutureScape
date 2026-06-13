import type ArcGISMap from "@arcgis/core/Map";
import type SceneView from "@arcgis/core/views/SceneView";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import { cabarrusSceneConfig } from "@/lib/gis/gisConfig";

export interface CabarrusSceneView {
  map: ArcGISMap;
  view: SceneView;
}

export function createCabarrusSceneView(
  runtime: ArcGISRuntime,
  container: HTMLDivElement,
): CabarrusSceneView {
  const map = new runtime.Map({
    basemap: cabarrusSceneConfig.basemap,
    ground: cabarrusSceneConfig.ground,
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

  const view = new runtime.SceneView({
    camera: {
      heading: cabarrusSceneConfig.camera.heading,
      position: {
        latitude: cabarrusSceneConfig.center.latitude,
        longitude: cabarrusSceneConfig.center.longitude,
        z: cabarrusSceneConfig.camera.altitudeMeters,
      },
      tilt: cabarrusSceneConfig.camera.tilt,
    },
    container,
    constraints: {
      altitude: {
        max: 30000,
        min: 250,
      },
      tilt: {
        max: 76,
      },
    },
    environment: {
      atmosphereEnabled: false,
      background: {
        color: [4, 8, 14, 1],
        type: "color",
      },
      lighting: {
        date: new Date(cabarrusSceneConfig.mockLightingDate),
        directShadowsEnabled: false,
      },
      starsEnabled: false,
    },
    map,
    qualityProfile: "medium",
    ui: {
      components: [],
    },
    viewingMode: "local",
  });
  view.clippingArea = clippingArea;

  return { map, view };
}
