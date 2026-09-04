import {
  apiGet,
  buildApiUrl,
  IS_DEMO_MODE,
  type ApiRequestOptions,
} from "@/lib/api/client";

export type ParcelImageryDirection = "north" | "south" | "east" | "west";

export interface ParcelImageryMetadata {
  parcel_id: string;
  location: { latitude: number; longitude: number };
  images: Array<{
    direction: ParcelImageryDirection;
    capture_date: string | null;
  }>;
  provider: string;
}

export interface ParcelImageryAskContext {
  imagery_available: boolean;
  imagery_capture_date: string | null;
  imagery_directions: string | null;
}

const DEMO_DIRECTIONS: ParcelImageryDirection[] = [
  "north",
  "south",
  "east",
  "west",
];

export function getParcelImageryMetadata(
  parcelId: string,
  options: ApiRequestOptions = {},
) {
  if (IS_DEMO_MODE) {
    return Promise.resolve<ParcelImageryMetadata>({
      parcel_id: parcelId,
      location: { latitude: 35.407, longitude: -80.579 },
      images: DEMO_DIRECTIONS.map((direction) => ({
        capture_date: "2026-05-14",
        direction,
      })),
      provider: "EagleView/Pictometry",
    });
  }
  return apiGet<ParcelImageryMetadata>(
    `/imagery/eagleview/parcel/${encodeURIComponent(parcelId)}`,
    undefined,
    options,
  );
}

export function parcelImageryImageUrl(
  parcelId: string,
  direction: ParcelImageryDirection,
  large = false,
) {
  return buildApiUrl(
    `/imagery/eagleview/parcel/${encodeURIComponent(parcelId)}/image/${direction}`,
    large ? { height: 1200, width: 1600 } : { height: 600, width: 800 },
  );
}
