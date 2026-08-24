import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { validateStaticContract as validateMasterDataV1B } from "./check-master-data-v1b.mjs";

const root = process.cwd();

await validateMasterDataV1B();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(path, text, expected) {
  assert(text.includes(expected), `${path} missing ${expected}`);
}

function validateAsset(asset) {
  assert(asset.path, `required demo asset is missing path metadata`);
  assert(asset.schema, `${asset.path} is missing schema metadata`);
  assert(Number(asset.record_count) > 0, `${asset.path} is missing record_count metadata`);
  assert(asset.source_classification, `${asset.path} is missing source metadata`);
  assert(asset.sanitized === true, `${asset.path} is not marked sanitized`);
  const full = join(root, asset.path);
  assert(existsSync(full), `missing required demo asset: ${asset.path}`);
  assert(statSync(full).size > 0, `empty required demo asset: ${asset.path}`);
  if ([".json", ".geojson"].includes(extname(asset.path))) json(asset.path);
  if (extname(asset.path) === ".csv") {
    assert(read(asset.path).trim().split(/\r?\n/).length > 1, `empty csv data asset: ${asset.path}`);
  }
}

const CABARRUS_BOUNDS = {
  xmax: -80.26,
  xmin: -80.82,
  ymax: 35.54,
  ymin: 35.15,
};
const contextAssetRules = new Map([
  ["public/demo-data/map_layers/demo_county_boundary.geojson", ["Polygon", "MultiPolygon"]],
  ["public/demo-data/map_layers/demo_municipal_boundaries.geojson", ["Polygon", "MultiPolygon"]],
  ["public/demo-data/map_layers/demo_hydrography.geojson", ["Polygon", "MultiPolygon"]],
  ["public/demo-data/map_layers/demo_transportation_context.geojson", ["LineString", "MultiLineString"]],
  ["public/demo-data/map_layers/demo_place_labels.geojson", ["Point"]],
]);

function validateContextAsset(asset) {
  assert(asset.generated_at, `${asset.path} is missing generated_at metadata`);
  assert(!Number.isNaN(Date.parse(asset.generated_at)), `${asset.path} has invalid generated_at metadata`);
  const layer = json(asset.path);
  assert(layer.type === "FeatureCollection", `${asset.path} is not a GeoJSON FeatureCollection`);
  assert(Array.isArray(layer.features), `${asset.path} is missing GeoJSON features`);
  assert(layer.features.length === asset.record_count, `${asset.path} feature count drifted`);
  assert(layer.features.length > 0, `${asset.path} contains zero required context features`);
  assert(layer.metadata?.sanitized === true, `${asset.path} metadata is not marked sanitized`);
  const allowedTypes = contextAssetRules.get(asset.path);
  const bounds = emptyBounds();
  let coordinateCount = 0;

  layer.features.forEach((feature, index) => {
    assert(feature?.type === "Feature", `${asset.path} feature ${index} is malformed`);
    assert(allowedTypes?.includes(feature.geometry?.type), `${asset.path} feature ${index} has invalid geometry type`);
    const featureBounds = emptyBounds();
    const coordinates = collectCoordinates(feature.geometry?.coordinates);
    assert(coordinates.length > 0, `${asset.path} feature ${index} has no coordinates`);
    coordinates.forEach(([longitude, latitude]) => {
      assert(Number.isFinite(longitude) && Number.isFinite(latitude), `${asset.path} contains non-finite coordinates`);
      assert(longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90, `${asset.path} contains invalid WGS84 coordinates`);
      extendBounds(bounds, longitude, latitude);
      extendBounds(featureBounds, longitude, latitude);
    });
    assert(intersects(featureBounds, CABARRUS_BOUNDS), `${asset.path} feature ${index} is outside Cabarrus County`);
    coordinateCount += coordinates.length;
    const unsafeKeys = Object.keys(feature.properties ?? {}).filter((key) =>
      /owner|contact|email|phone|mailing|pin14/i.test(key),
    );
    assert(unsafeKeys.length === 0, `${asset.path} exposes restricted properties: ${unsafeKeys.join(", ")}`);
  });

  assert(intersects(bounds, CABARRUS_BOUNDS), `${asset.path} extent is outside Cabarrus County`);
  if (asset.path.endsWith("demo_county_boundary.geojson")) {
    assert(layer.features.length === 1, "county boundary must contain exactly one feature");
    assert(coordinateCount >= 100, "county boundary is an oversimplified or invented outline");
    assert(bounds.xmin > -80.82 && bounds.xmax < -80.26, "county boundary longitude extent drifted");
    assert(bounds.ymin > 35.15 && bounds.ymax < 35.54, "county boundary latitude extent drifted");
  }
}

function emptyBounds() {
  return {
    xmax: Number.NEGATIVE_INFINITY,
    xmin: Number.POSITIVE_INFINITY,
    ymax: Number.NEGATIVE_INFINITY,
    ymin: Number.POSITIVE_INFINITY,
  };
}

function collectCoordinates(value, output = []) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    output.push([value[0], value[1]]);
    return output;
  }
  if (Array.isArray(value)) value.forEach((item) => collectCoordinates(item, output));
  return output;
}

function extendBounds(bounds, longitude, latitude) {
  bounds.xmin = Math.min(bounds.xmin, longitude);
  bounds.xmax = Math.max(bounds.xmax, longitude);
  bounds.ymin = Math.min(bounds.ymin, latitude);
  bounds.ymax = Math.max(bounds.ymax, latitude);
}

function intersects(left, right) {
  return (
    left.xmax >= right.xmin &&
    left.xmin <= right.xmax &&
    left.ymax >= right.ymin &&
    left.ymin <= right.ymax
  );
}

const manifest = json("public/demo-data/demo_manifest.json");
assert(manifest.mode === "portfolio_demo", "demo manifest mode drifted");
assert(Array.isArray(manifest.required_assets), "demo manifest missing required_assets");
manifest.required_assets.filter((asset) => asset.required).forEach(validateAsset);
const contextAssets = manifest.required_assets.filter((asset) =>
  contextAssetRules.has(asset.path),
);
assert(contextAssets.length === contextAssetRules.size, "demo manifest is missing required map context assets");
contextAssets.forEach(validateContextAsset);

const layerManifest = json("public/demo-data/map_layers/demo_layer_manifest.json");
assert(layerManifest.layer_count === layerManifest.layers.length, "demo layer manifest count drifted");
const layerEntries = new Map(layerManifest.layers.map((layer) => [`public/demo-data/${layer.file}`, layer]));
contextAssets.forEach((asset) => {
  const layer = layerEntries.get(asset.path);
  assert(layer, `${asset.path} is not registered in the demo layer manifest`);
  assert(layer.required === true, `${asset.path} is not marked required in the layer manifest`);
  assert(layer.sanitized === true, `${asset.path} is not marked sanitized in the layer manifest`);
  assert(layer.feature_count === asset.record_count, `${asset.path} manifest counts disagree`);
  assert(layer.schema && layer.feature && layer.generated_at && layer.source_classification, `${asset.path} layer metadata is incomplete`);
});

const shell = read("src/components/economics/EconomicsShell.tsx");
assertIncludes("src/components/economics/EconomicsShell.tsx", shell, "Land Due Diligence Screener");

const home = read("src/components/layout/CfsMasterHome.tsx");
const homeWorkspaceRoutes = [...home.matchAll(/href: "\/\?app=([^\"]+)"/g)].map((match) => match[1]);
assert(
  homeWorkspaceRoutes.join(",") === "planning,economics,master-data",
  "Demo Home must expose exactly three primary workspace cards",
);
assertIncludes("src/components/layout/CfsMasterHome.tsx", home, 'data-testid="cfs-home-shared-ask-cfs"');
assertIncludes("src/components/layout/CfsMasterHome.tsx", home, "lg:grid-cols-3");
assert(!home.includes("cfs-home-card-ask-cfs"), "Demo Home still exposes Ask CFS as a primary card");
assert(!home.includes("xl:grid-cols-4"), "Demo Home still reserves a fourth card column");

const topNav = read("src/components/layout/TopNav.tsx");
assertIncludes("src/components/layout/TopNav.tsx", topNav, 'data-testid="shared-ask-cfs-toggle"');
const appShell = read("src/components/layout/AppShell.tsx");
assertIncludes("src/components/layout/AppShell.tsx", appShell, "<SharedAskCfsDrawer");
const sharedAsk = read("src/components/dashboard/SharedAskCfsDrawer.tsx");
assertIncludes("src/components/dashboard/SharedAskCfsDrawer.tsx", sharedAsk, "<AskCfsPanel");
assertIncludes("src/components/dashboard/SharedAskCfsDrawer.tsx", sharedAsk, "appMode={appMode}");

const homeRoute = read("src/app/page.tsx");
assert(
  /appMode === "ask-cfs"[\s\S]*?redirect\("\/"\);/.test(homeRoute),
  "Legacy Ask CFS URL does not redirect safely to Home",
);
const demoRoute = read("src/app/demo/page.tsx");
assertIncludes("src/app/demo/page.tsx", demoRoute, 'redirect("/")');

const scene = read("src/components/gis/SceneViewContainer.tsx");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "await getDemoMapContext(false)");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "hydrateLocalContextLayers");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "createCabarrusContextBasemap");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "createCfsVisualBasemapLayer");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "await waitForUsableArcGisView");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "data-arcgis-assets-path={ARCGIS_ASSETS_PATH}");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, 'aria-label="Zoom in"');
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, 'aria-label="Reset to Cabarrus County"');
assert(!scene.includes("if (!USE_INTERACTIVE_MAP)"), "demo still bypasses ArcGIS MapView");
assert(!scene.includes("void hydrateDemoReferenceLayers"), "required map context hydration is still fire-and-forget");

const apiClient = read("src/lib/api/client.ts");
assertIncludes("src/lib/api/client.ts", apiClient, "export const USE_INTERACTIVE_MAP = true;");

const runtime = read("src/lib/gis/arcgisRuntime.ts");
assertIncludes("src/lib/gis/arcgisRuntime.ts", runtime, "`/arcgis-assets/${ARCGIS_SDK_VERSION}`");
assertIncludes("src/lib/gis/arcgisRuntime.ts", runtime, "config.assetsPath = ARCGIS_ASSETS_PATH");
assertIncludes("src/lib/gis/arcgisRuntime.ts", runtime, "OpenStreetMapLayer");
assertIncludes("src/lib/gis/arcgisRuntime.ts", runtime, "WebTileLayer");

const basemapProvider = read("src/lib/gis/basemapProvider.ts");
assertIncludes("src/lib/gis/basemapProvider.ts", basemapProvider, "NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE");
assertIncludes("src/lib/gis/basemapProvider.ts", basemapProvider, "© OpenStreetMap contributors");
assertIncludes("src/lib/gis/basemapProvider.ts", basemapProvider, "new runtime.OpenStreetMapLayer");
assertIncludes("src/lib/gis/basemapProvider.ts", basemapProvider, "new runtime.WebTileLayer");

const sceneFactory = read("src/lib/gis/sceneViewFactory.ts");
assertIncludes("src/lib/gis/sceneViewFactory.ts", sceneFactory, "baseLayers:");
assertIncludes("src/lib/gis/sceneViewFactory.ts", sceneFactory, "referenceLayers: [layers.county, layers.labels]");
assertIncludes("src/lib/gis/sceneViewFactory.ts", sceneFactory, 'id: "cfs-same-origin-basemap"');

const fallbackMap = read("src/components/gis/LocalContextFallbackMap.tsx");
assertIncludes("src/components/gis/LocalContextFallbackMap.tsx", fallbackMap, 'fill="none"');
const mockSceneLayers = read("src/lib/gis/mockSceneLayers.ts");
assertIncludes("src/lib/gis/mockSceneLayers.ts", mockSceneLayers, "color: [13, 22, 34, 0]");
assertIncludes("src/components/gis/SceneViewContainer.tsx", scene, "color: [24, 31, 38, 0]");

console.log(`PASS demo functionality contracts (${contextAssets.length} required map context assets)`);
