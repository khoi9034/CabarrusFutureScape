import type OpenStreetMapLayer from "@arcgis/core/layers/OpenStreetMapLayer";
import type VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import type WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";

export const CFS_PUBLIC_BASEMAP_LAYER_ID = "cfs-public-reference-basemap";
export const CFS_OPENFREE_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/dark";
export const CFS_DEFAULT_OSM_URL_TEMPLATE =
  "https://{subDomain}.tile.openstreetmap.org/{level}/{col}/{row}.png";
export const CFS_DEFAULT_OSM_ATTRIBUTION =
  "© OpenStreetMap contributors";
export const CFS_OPENFREE_MAP_ATTRIBUTION =
  "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

export interface CfsBasemapEnvironment {
  attribution?: string;
  urlTemplate?: string;
}

export interface CfsBasemapProviderConfig {
  attribution: string;
  kind: "vector-tile" | "web-tile";
  urlTemplate: string;
}

export type CfsVisualBasemapLayer =
  | OpenStreetMapLayer
  | VectorTileLayer
  | WebTileLayer;

const publicEnvironment: CfsBasemapEnvironment = {
  attribution: process.env.NEXT_PUBLIC_CFS_BASEMAP_ATTRIBUTION,
  urlTemplate: process.env.NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE,
};

export const CFS_BASEMAP_PROVIDER_CONFIG =
  resolveBasemapProviderConfig(publicEnvironment);

export function resolveBasemapProviderConfig(
  environment: CfsBasemapEnvironment,
): CfsBasemapProviderConfig {
  const urlTemplate = environment.urlTemplate?.trim();

  if (!urlTemplate) {
    return {
      attribution: CFS_OPENFREE_MAP_ATTRIBUTION,
      kind: "vector-tile",
      urlTemplate: CFS_OPENFREE_MAP_STYLE_URL,
    };
  }

  validateWebTileTemplate(urlTemplate);
  return {
    attribution:
      environment.attribution?.trim() || CFS_DEFAULT_OSM_ATTRIBUTION,
    kind: "web-tile",
    urlTemplate,
  };
}

export function createCfsVisualBasemapLayer(
  runtime: ArcGISRuntime,
  config = CFS_BASEMAP_PROVIDER_CONFIG,
): CfsVisualBasemapLayer {
  const properties = {
    copyright: config.attribution,
    id: CFS_PUBLIC_BASEMAP_LAYER_ID,
    listMode: "hide" as const,
    title:
      config.kind === "vector-tile"
        ? "OpenFreeMap dark visual basemap"
        : "OpenStreetMap visual basemap",
  };

  if (config.kind === "vector-tile") {
    return new runtime.VectorTileLayer({
      ...properties,
      url: config.urlTemplate,
    });
  }

  return new runtime.WebTileLayer({
    ...properties,
    subDomains: config.urlTemplate.includes("{subDomain}")
      ? ["a", "b", "c", "d"]
      : undefined,
    urlTemplate: config.urlTemplate,
  });
}

export async function loadCfsVisualBasemapLayer(
  layer: CfsVisualBasemapLayer,
  signal: AbortSignal,
) {
  await layer.load({ signal });
  if (layer.type === "web-tile") {
    await layer.fetchTile(10, 404, 282, { signal });
  }
}

export function createCfsStandardOsmFallbackLayer(runtime: ArcGISRuntime) {
  const layer = new runtime.OpenStreetMapLayer({
    copyright: "© OpenStreetMap contributors",
    id: `${CFS_PUBLIC_BASEMAP_LAYER_ID}-fallback`,
    listMode: "hide",
    title: "OpenStreetMap fallback basemap",
  });
  layer.copyright = "© OpenStreetMap contributors";
  return layer;
}

function validateWebTileTemplate(value: string) {
  const xyzTokens = ["{z}", "{x}", "{y}"];
  const arcgisTokens = ["{level}", "{col}", "{row}"];
  const xyz = xyzTokens.every((token) => value.includes(token));
  const arcgis = arcgisTokens.every((token) =>
    value.includes(token),
  );
  if (
    !(
      (xyz && !arcgisTokens.some((token) => value.includes(token))) ||
      (arcgis && !xyzTokens.some((token) => value.includes(token)))
    )
  ) {
    throw new Error(
      "NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE must contain exactly one complete {z}/{x}/{y} or {level}/{col}/{row} placeholder set.",
    );
  }
  const remainingTemplate = [...xyzTokens, ...arcgisTokens].reduce(
    (result, token) => result.replaceAll(token, ""),
    value,
  );
  if (/[{}]/.test(remainingTemplate)) {
    throw new Error(
      "NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE contains an unsupported placeholder.",
    );
  }

  let url: URL;
  try {
    url = new URL(
      value
        .replaceAll("{z}", "0")
        .replaceAll("{x}", "0")
        .replaceAll("{y}", "0")
        .replaceAll("{level}", "0")
        .replaceAll("{col}", "0")
        .replaceAll("{row}", "0"),
    );
  } catch {
    throw new Error("NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE must be a valid URL.");
  }
  if (
    url.protocol !== "https:" ||
    !/^https:\/\/[^/{}]+\//i.test(value) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE must be a credential-free HTTPS URL without a query or fragment.",
    );
  }
}
