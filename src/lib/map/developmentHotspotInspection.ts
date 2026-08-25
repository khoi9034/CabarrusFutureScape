import { getParcelDetail } from "@/lib/api/parcels";
import { USE_DEMO_DATA } from "@/lib/api/client";
import { getDemoParcelMapFocus } from "@/lib/demo-data/mapLayerClient";
import { createParcelMapFocus } from "@/lib/map/parcelMapFocus";
import type { SelectedDevelopmentHotspotContext } from "@/types/map/developmentHotspots";
import type {
  ParcelHighlightGeometry,
  ParcelMapExtent,
  ParcelMapFocus,
} from "@/types/map/parcelFocus";

export const HOTSPOT_PARCEL_HIGHLIGHT_LIMIT = 20;

export interface DevelopmentHotspotInspectionFocus {
  focus: ParcelMapFocus;
  highlightedParcelCount: number;
  requestedParcelCount: number;
}

export async function resolveDevelopmentHotspotInspectionFocus(
  context: SelectedDevelopmentHotspotContext,
  signal: AbortSignal,
): Promise<DevelopmentHotspotInspectionFocus> {
  const parcelIds = [...new Set(context.representedParcelIds)]
    .filter(Boolean)
    .slice(0, HOTSPOT_PARCEL_HIGHLIGHT_LIMIT);
  if (!parcelIds.length) throw new Error("No related parcel identifiers are available.");

  const settled = await Promise.allSettled(
    parcelIds.map((officialParcelId) =>
      resolveParcelFocus(officialParcelId, signal),
    ),
  );
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const focuses = settled
    .filter(
      (result): result is PromiseFulfilledResult<ParcelMapFocus | null> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value)
    .filter((focus): focus is ParcelMapFocus => Boolean(focus));
  const extent = combineExtents(focuses);
  const highlightGeometry = combineHighlightGeometry(focuses);
  if (!extent && !highlightGeometry) {
    throw new Error("Related parcel geometry is unavailable.");
  }

  return {
    focus: createParcelMapFocus(
      { officialParcelId: `development-hotspot:${context.clusterId ?? context.officialParcelId ?? "selection"}` },
      "command",
      {
        centroid: extent
          ? {
              latitude: (extent.ymin + extent.ymax) / 2,
              longitude: (extent.xmin + extent.xmax) / 2,
              spatialReference: extent.spatialReference,
            }
          : null,
        extent,
        highlightGeometry,
      },
    ),
    highlightedParcelCount: focuses.filter(
      (focus) => Boolean(focus.highlightGeometry),
    ).length,
    requestedParcelCount: parcelIds.length,
  };
}

async function resolveParcelFocus(
  officialParcelId: string,
  signal: AbortSignal,
) {
  if (USE_DEMO_DATA) {
    return getDemoParcelMapFocus(
      { officialParcelId },
      "command",
    );
  }
  const response = await getParcelDetail(
    officialParcelId,
    { include_geometry: true },
    { signal, timeoutMs: 30_000 },
  );
  const mapFocus = response.map_focus;
  if (!mapFocus) return null;
  const wkid = mapFocus.spatial_reference?.wkid ?? 4326;
  const centroid = mapFocus.centroid;
  const extent = mapFocus.extent;
  const hasCentroid =
    typeof centroid?.latitude === "number" &&
    typeof centroid.longitude === "number";
  const hasExtent =
    typeof extent?.xmin === "number" &&
    typeof extent.ymin === "number" &&
    typeof extent.xmax === "number" &&
    typeof extent.ymax === "number";
  return createParcelMapFocus(
    { officialParcelId, pin14: response.pin14 },
    "command",
    {
      centroid: hasCentroid
        ? {
            latitude: centroid.latitude as number,
            longitude: centroid.longitude as number,
            spatialReference: { wkid },
          }
        : null,
      extent: hasExtent
        ? {
            xmin: extent.xmin as number,
            ymin: extent.ymin as number,
            xmax: extent.xmax as number,
            ymax: extent.ymax as number,
            spatialReference: { wkid },
          }
        : null,
      highlightGeometry: response.highlight_geometry
        ? {
            coordinates: response.highlight_geometry.coordinates,
            spatialReference: {
              wkid: response.highlight_geometry.spatial_reference?.wkid ?? wkid,
            },
            type: response.highlight_geometry.type,
          }
        : null,
    },
  );
}

function combineExtents(focuses: ParcelMapFocus[]): ParcelMapExtent | null {
  const extents = focuses
    .map((focus) => focus.extent)
    .filter((extent): extent is ParcelMapExtent => Boolean(extent));
  if (!extents.length) return null;
  return {
    spatialReference: { wkid: 4326 },
    xmax: Math.max(...extents.map((extent) => extent.xmax)),
    xmin: Math.min(...extents.map((extent) => extent.xmin)),
    ymax: Math.max(...extents.map((extent) => extent.ymax)),
    ymin: Math.min(...extents.map((extent) => extent.ymin)),
  };
}

function combineHighlightGeometry(
  focuses: ParcelMapFocus[],
): ParcelHighlightGeometry | null {
  const polygons: unknown[] = [];
  focuses.forEach((focus) => {
    const geometry = focus.highlightGeometry;
    if (!geometry) return;
    if (geometry.type === "Polygon") polygons.push(geometry.coordinates);
    else polygons.push(...geometry.coordinates);
  });
  return polygons.length
    ? {
        coordinates: polygons,
        spatialReference: { wkid: 4326 },
        type: "MultiPolygon",
      }
    : null;
}
