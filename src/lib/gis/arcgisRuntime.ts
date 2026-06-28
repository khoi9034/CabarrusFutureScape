import type Graphic from "@arcgis/core/Graphic";
import type ArcGISMap from "@arcgis/core/Map";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Extent from "@arcgis/core/geometry/Extent";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import type Point from "@arcgis/core/geometry/Point";
import type Polygon from "@arcgis/core/geometry/Polygon";
import type Polyline from "@arcgis/core/geometry/Polyline";
import type MapView from "@arcgis/core/views/MapView";
import type * as ArcGISReactiveUtils from "@arcgis/core/core/reactiveUtils";
import type * as ArcGISWebMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

export interface ArcGISRuntime {
  Extent: typeof Extent;
  FeatureLayer: typeof FeatureLayer;
  Graphic: typeof Graphic;
  GraphicsLayer: typeof GraphicsLayer;
  Map: typeof ArcGISMap;
  MapImageLayer: typeof MapImageLayer;
  Point: typeof Point;
  Polygon: typeof Polygon;
  Polyline: typeof Polyline;
  reactiveUtils: typeof ArcGISReactiveUtils;
  MapView: typeof MapView;
  webMercatorUtils: typeof ArcGISWebMercatorUtils;
}

export async function loadArcGISRuntime(): Promise<ArcGISRuntime> {
  const [
    { default: Map },
    { default: MapView },
    { default: FeatureLayer },
    { default: GraphicsLayer },
    { default: MapImageLayer },
    { default: Graphic },
    { default: Point },
    { default: Polygon },
    { default: Polyline },
    { default: Extent },
    reactiveUtils,
    webMercatorUtils,
  ] = await Promise.all([
    import("@arcgis/core/Map.js"),
    import("@arcgis/core/views/MapView.js"),
    import("@arcgis/core/layers/FeatureLayer.js"),
    import("@arcgis/core/layers/GraphicsLayer.js"),
    import("@arcgis/core/layers/MapImageLayer.js"),
    import("@arcgis/core/Graphic.js"),
    import("@arcgis/core/geometry/Point.js"),
    import("@arcgis/core/geometry/Polygon.js"),
    import("@arcgis/core/geometry/Polyline.js"),
    import("@arcgis/core/geometry/Extent.js"),
    import("@arcgis/core/core/reactiveUtils.js"),
    import("@arcgis/core/geometry/support/webMercatorUtils.js"),
  ]);

  return {
    Extent,
    FeatureLayer,
    Graphic,
    GraphicsLayer,
    Map,
    MapImageLayer,
    Point,
    Polygon,
    Polyline,
    reactiveUtils,
    MapView,
    webMercatorUtils,
  };
}
