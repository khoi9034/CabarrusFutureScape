import type Graphic from "@arcgis/core/Graphic";
import type ArcGISMap from "@arcgis/core/Map";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Extent from "@arcgis/core/geometry/Extent";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import type Point from "@arcgis/core/geometry/Point";
import type SceneLayer from "@arcgis/core/layers/SceneLayer";
import type SceneView from "@arcgis/core/views/SceneView";

export interface ArcGISRuntime {
  Extent: typeof Extent;
  FeatureLayer: typeof FeatureLayer;
  Graphic: typeof Graphic;
  GraphicsLayer: typeof GraphicsLayer;
  Map: typeof ArcGISMap;
  MapImageLayer: typeof MapImageLayer;
  Point: typeof Point;
  SceneLayer: typeof SceneLayer;
  SceneView: typeof SceneView;
}

export async function loadArcGISRuntime(): Promise<ArcGISRuntime> {
  const [
    { default: Map },
    { default: SceneView },
    { default: FeatureLayer },
    { default: GraphicsLayer },
    { default: MapImageLayer },
    { default: SceneLayer },
    { default: Graphic },
    { default: Point },
    { default: Extent },
  ] = await Promise.all([
    import("@arcgis/core/Map.js"),
    import("@arcgis/core/views/SceneView.js"),
    import("@arcgis/core/layers/FeatureLayer.js"),
    import("@arcgis/core/layers/GraphicsLayer.js"),
    import("@arcgis/core/layers/MapImageLayer.js"),
    import("@arcgis/core/layers/SceneLayer.js"),
    import("@arcgis/core/Graphic.js"),
    import("@arcgis/core/geometry/Point.js"),
    import("@arcgis/core/geometry/Extent.js"),
  ]);

  return {
    Extent,
    FeatureLayer,
    Graphic,
    GraphicsLayer,
    Map,
    MapImageLayer,
    Point,
    SceneLayer,
    SceneView,
  };
}
