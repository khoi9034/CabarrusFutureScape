import type WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";

export const CFS_PUBLIC_BASEMAP_LAYER_ID = "cfs-public-reference-basemap";
export const CFS_DARK_OSM_URL_TEMPLATE =
  "https://{subDomain}.basemaps.cartocdn.com/dark_all/{level}/{col}/{row}.png";
export const CFS_DEFAULT_OSM_URL_TEMPLATE =
  "https://{subDomain}.tile.openstreetmap.org/{level}/{col}/{row}.png";
export const CFS_DEFAULT_OSM_ATTRIBUTION =
  "© OpenStreetMap contributors © CARTO";

export interface CfsBasemapEnvironment {
  attribution?: string;
  urlTemplate?: string;
}

export interface CfsBasemapProviderConfig {
  attribution: string;
  kind: "openstreetmap" | "web-tile";
  urlTemplate: string;
}

const publicEnvironment: CfsBasemapEnvironment = {
  attribution: process.env.NEXT_PUBLIC_CFS_BASEMAP_ATTRIBUTION,
  urlTemplate: process.env.NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE,
};

export const CFS_BASEMAP_PROVIDER_CONFIG =
  resolveBasemapProviderConfig(publicEnvironment);

export function resolveBasemapProviderConfig(
  environment: CfsBasemapEnvironment,
): CfsBasemapProviderConfig {
  const attribution =
    environment.attribution?.trim() || CFS_DEFAULT_OSM_ATTRIBUTION;
  const urlTemplate = environment.urlTemplate?.trim();

  if (!urlTemplate) {
    return {
      attribution,
      kind: "web-tile",
      urlTemplate: CFS_DARK_OSM_URL_TEMPLATE,
    };
  }

  validateWebTileTemplate(urlTemplate);
  return { attribution, kind: "web-tile", urlTemplate };
}

export function createCfsVisualBasemapLayer(
  runtime: ArcGISRuntime,
  config = CFS_BASEMAP_PROVIDER_CONFIG,
): WebTileLayer {
  const properties = {
    copyright: config.attribution,
    id: CFS_PUBLIC_BASEMAP_LAYER_ID,
    listMode: "hide" as const,
    title: "OpenStreetMap visual basemap",
  };

  if (config.kind === "web-tile") {
    return new runtime.WebTileLayer({
      ...properties,
      subDomains: config.urlTemplate.includes("{subDomain}")
        ? ["a", "b", "c", "d"]
        : undefined,
      urlTemplate: config.urlTemplate,
    });
  }

  const layer = new runtime.OpenStreetMapLayer(properties);
  // OpenStreetMapLayer supplies its own default copyright after construction.
  layer.copyright = config.attribution;
  return layer;
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
