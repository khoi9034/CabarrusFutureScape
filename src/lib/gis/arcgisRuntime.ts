import type Graphic from "@arcgis/core/Graphic";
import type ArcGISMap from "@arcgis/core/Map";
import type Basemap from "@arcgis/core/Basemap";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Extent from "@arcgis/core/geometry/Extent";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import type OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer";
import type TileLayer from "@arcgis/core/layers/TileLayer";
import type WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import type TileInfo from "@arcgis/core/layers/support/TileInfo";
import type Point from "@arcgis/core/geometry/Point";
import type Polygon from "@arcgis/core/geometry/Polygon";
import type Polyline from "@arcgis/core/geometry/Polyline";
import type MapView from "@arcgis/core/views/MapView";
import type * as ArcGISReactiveUtils from "@arcgis/core/core/reactiveUtils";
import type * as ArcGISWebMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import arcgisPackage from "@arcgis/core/package.json";

export const ARCGIS_SDK_VERSION = arcgisPackage.version;
export const ARCGIS_ASSETS_PATH = `/arcgis-assets/${ARCGIS_SDK_VERSION}`;

export interface ArcGISRuntime {
  Basemap: typeof Basemap;
  Extent: typeof Extent;
  FeatureLayer: typeof FeatureLayer;
  Graphic: typeof Graphic;
  GraphicsLayer: typeof GraphicsLayer;
  Map: typeof ArcGISMap;
  MapImageLayer: typeof MapImageLayer;
  OpenStreetMapLayer: typeof OpenStreetMapLayer;
  TileLayer: typeof TileLayer;
  WebTileLayer: typeof WebTileLayer;
  Point: typeof Point;
  Polygon: typeof Polygon;
  Polyline: typeof Polyline;
  reactiveUtils: typeof ArcGISReactiveUtils;
  TileInfo: typeof TileInfo;
  MapView: typeof MapView;
  webMercatorUtils: typeof ArcGISWebMercatorUtils;
}

export async function loadArcGISRuntime(): Promise<ArcGISRuntime> {
  const { default: config } = await import("@arcgis/core/config.js");
  config.assetsPath = ARCGIS_ASSETS_PATH;
  const [
    { default: Basemap },
    { default: Map },
    { default: MapView },
    { default: FeatureLayer },
    { default: GraphicsLayer },
    { default: MapImageLayer },
    { default: OpenStreetMapLayer },
    { default: TileLayer },
    { default: WebTileLayer },
    { default: Graphic },
    { default: Point },
    { default: Polygon },
    { default: Polyline },
    { default: Extent },
    { default: TileInfo },
    reactiveUtils,
    webMercatorUtils,
  ] = await Promise.all([
    import("@arcgis/core/Basemap.js"),
    import("@arcgis/core/Map.js"),
    import("@arcgis/core/views/MapView.js"),
    import("@arcgis/core/layers/FeatureLayer.js"),
    import("@arcgis/core/layers/GraphicsLayer.js"),
    import("@arcgis/core/layers/MapImageLayer.js"),
    import("@arcgis/core/layers/OpenStreetMapLayer.js"),
    import("@arcgis/core/layers/TileLayer.js"),
    import("@arcgis/core/layers/WebTileLayer.js"),
    import("@arcgis/core/Graphic.js"),
    import("@arcgis/core/geometry/Point.js"),
    import("@arcgis/core/geometry/Polygon.js"),
    import("@arcgis/core/geometry/Polyline.js"),
    import("@arcgis/core/geometry/Extent.js"),
    import("@arcgis/core/layers/support/TileInfo.js"),
    import("@arcgis/core/core/reactiveUtils.js"),
    import("@arcgis/core/geometry/support/webMercatorUtils.js"),
  ]);

  return {
    Basemap,
    Extent,
    FeatureLayer,
    Graphic,
    GraphicsLayer,
    Map,
    MapImageLayer,
    OpenStreetMapLayer,
    TileLayer,
    WebTileLayer,
    Point,
    Polygon,
    Polyline,
    reactiveUtils,
    TileInfo,
    MapView,
    webMercatorUtils,
  };
}
