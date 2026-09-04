"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Expand, Image as ImageIcon, LoaderCircle } from "lucide-react";
import {
  getParcelImageryMetadata,
  parcelImageryImageUrl,
  type ParcelImageryAskContext,
  type ParcelImageryDirection,
  type ParcelImageryMetadata,
} from "@/lib/api/imagery";
import { ApiClientError, IS_DEMO_MODE } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function ParcelImageryPanel({
  onContextChange,
  onOpenChange,
  open,
  parcelId,
}: {
  onContextChange?: (context: ParcelImageryAskContext | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parcelId: string | null;
}) {
  const [metadata, setMetadata] = useState<ParcelImageryMetadata | null>(null);
  const [selectedDirection, setSelectedDirection] =
    useState<ParcelImageryDirection | null>(null);
  const [metadataState, setMetadataState] = useState<
    "error" | "idle" | "loading" | "ready"
  >(open ? "loading" : "idle");
  const [message, setMessage] = useState("");
  const [large, setLarge] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const metadataController = useRef<AbortController | null>(null);
  const imageController = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);

  const loadImage = useCallback((direction: ParcelImageryDirection, nextLarge: boolean) => {
    if (!parcelId || IS_DEMO_MODE) return;
    imageController.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    const controller = new AbortController();
    imageController.current = controller;
    setImageLoading(true);
    setImageUrl(null);
    fetch(parcelImageryImageUrl(parcelId, direction, nextLarge), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Imagery response unavailable");
        objectUrl.current = URL.createObjectURL(await response.blob());
        setImageUrl(objectUrl.current);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("Imagery service is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setImageLoading(false);
      });
  }, [parcelId]);

  const requestMetadata = useCallback((requestedParcelId: string) => {
    metadataController.current?.abort();
    const controller = new AbortController();
    metadataController.current = controller;
    getParcelImageryMetadata(requestedParcelId, { signal: controller.signal })
      .then((result) => {
        const direction = result.images[0]?.direction ?? null;
        setMetadata(result);
        setSelectedDirection(direction);
        setMetadataState("ready");
        onContextChange?.({
          imagery_available: result.images.length > 0,
          imagery_capture_date: latestCaptureDate(result),
          imagery_directions:
            result.images.map((image) => image.direction).join(", ") || null,
        });
        if (direction && !IS_DEMO_MODE) loadImage(direction, false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMetadataState("error");
        setMessage(imageryErrorMessage(error));
      });
  }, [loadImage, onContextChange]);

  useEffect(() => {
    if (open && parcelId) requestMetadata(parcelId);
    return () => {
      metadataController.current?.abort();
      imageController.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      onContextChange?.(null);
    };
  }, [onContextChange, open, parcelId, requestMetadata]);

  function loadMetadata() {
    if (!parcelId) return;
    setMetadataState("loading");
    setMessage("");
    requestMetadata(parcelId);
  }

  const selectedImage = useMemo(
    () => metadata?.images.find((image) => image.direction === selectedDirection),
    [metadata, selectedDirection],
  );

  if (!parcelId) return null;

  return (
    <section className="shrink-0 rounded-lg border border-white/10 bg-[#07111f] p-3 shadow-xl">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => {
          const nextOpen = !open;
          onOpenChange(nextOpen);
        }}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-4 w-4 shrink-0 text-[#d8b86a]" />
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Selected parcel
            </span>
            <span className="block text-sm font-semibold text-white">Parcel imagery</span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          {metadataState === "loading" ? (
            <p className="flex items-center gap-2 text-xs text-slate-300">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#d8b86a]" />
              Loading parcel imagery...
            </p>
          ) : metadataState === "error" ? (
            <div className="rounded-md border border-amber-300/20 bg-amber-300/[0.06] p-3">
              <p className="text-xs leading-5 text-amber-100">{safeMessage(message)}</p>
              <button
                className="mt-2 text-xs font-semibold text-[#f0cd79]"
                onClick={loadMetadata}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : metadataState === "ready" && metadata?.images.length === 0 ? (
            <p className="text-xs leading-5 text-slate-400">
              No EagleView imagery was found for this parcel.
            </p>
          ) : metadataState === "ready" && selectedImage ? (
            <>
              <div className="flex flex-wrap gap-1.5" aria-label="Available imagery directions">
                {metadata?.images.map((image) => (
                  <button
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase",
                      image.direction === selectedDirection
                        ? "border-[#d8b86a]/50 bg-[#d8b86a]/15 text-[#f0cd79]"
                        : "border-white/10 bg-white/[0.04] text-slate-300",
                    )}
                    key={image.direction}
                    onClick={() => {
                      setLarge(false);
                      setMessage("");
                      setSelectedDirection(image.direction);
                      loadImage(image.direction, false);
                    }}
                    type="button"
                  >
                    {image.direction}
                  </button>
                ))}
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-white/10 bg-black/30">
                {IS_DEMO_MODE ? (
                  <div className="grid aspect-[4/3] place-items-center bg-[radial-gradient(circle_at_30%_25%,rgba(216,184,106,0.18),transparent_32%),linear-gradient(145deg,#142334,#07111f)] p-5 text-center">
                    <div>
                      <ImageIcon className="mx-auto h-7 w-7 text-[#d8b86a]" />
                      <p className="mt-3 text-xs font-semibold text-white">
                        EagleView imagery available in Enterprise/Local mode
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-400">
                        Public Demo uses a licensed-content-safe placeholder.
                      </p>
                    </div>
                  </div>
                ) : imageLoading ? (
                  <div className="grid aspect-[4/3] place-items-center text-xs text-slate-400">
                    Loading {selectedDirection} image...
                  </div>
                ) : imageUrl ? (
                  // Provider bytes arrive through an authenticated object URL, which next/image cannot optimize.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${selectedDirection} EagleView parcel imagery`}
                    className="aspect-[4/3] w-full object-contain"
                    src={imageUrl}
                  />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center px-5 text-center text-xs text-slate-400">
                    Imagery service is temporarily unavailable.
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0 text-[10px] leading-4 text-slate-400">
                  <p className="capitalize">Direction: {selectedImage.direction}</p>
                  <p>Captured: {formatCaptureDate(selectedImage.capture_date)}</p>
                </div>
                {!IS_DEMO_MODE ? (
                  <button
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-slate-200"
                    onClick={() => {
                      const nextLarge = !large;
                      setLarge(nextLarge);
                      loadImage(selectedImage.direction, nextLarge);
                    }}
                    type="button"
                  >
                    <Expand className="h-3 w-3" />
                    {large ? "Preview size" : "Open larger"}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function latestCaptureDate(metadata: ParcelImageryMetadata) {
  return metadata.images
    .map((image) => image.capture_date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null;
}

function formatCaptureDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function safeMessage(message: string) {
  if (message === "EagleView imagery is not configured.") return message;
  return "Imagery service is temporarily unavailable.";
}

function imageryErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && isRecord(error.payload)) {
    const detail = error.payload.detail;
    if (detail === "EagleView imagery is not configured.") return detail;
  }
  return "Imagery service is temporarily unavailable.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
