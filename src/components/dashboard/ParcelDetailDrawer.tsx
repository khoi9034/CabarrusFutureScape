"use client";

import { Building2, Loader2, MapPinned, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import {
  normalizeBackendParcelDetailResponse,
  normalizeBackendParcelMapFocusResponse,
} from "@/lib/adapters/parcelDetailAdapter";
import { USE_BACKEND_API } from "@/lib/api/client";
import { getParcelDetail } from "@/lib/api/parcels";
import { getParcelMapFocusStatusLabel } from "@/lib/map/parcelMapFocus";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import type {
  ParcelMapFocus,
  ParcelMapFocusResult,
} from "@/types/map/parcelFocus";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";

interface ParcelDetailDrawerProps {
  mapFocus: ParcelMapFocus | null;
  mapFocusResult: ParcelMapFocusResult;
  onClose: () => void;
  onParcelDetailHydrated: (
    record: ParcelSearchRecord,
    source: SelectedParcelIntelligenceSource,
  ) => void;
  onMapFocusHydrated: (focus: ParcelMapFocus) => void;
  parcel: ParcelSearchRecord | null;
}

interface ParcelDetailHydrationState {
  error: string | null;
  parcelId: string | null;
  record: ParcelSearchRecord | null;
}

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

function formatOptionalCurrency(value: number | null) {
  return value === null ? null : compactCurrencyFormatter.format(value);
}

export function ParcelDetailDrawer({
  mapFocus,
  mapFocusResult,
  onClose,
  onMapFocusHydrated,
  onParcelDetailHydrated,
  parcel,
}: ParcelDetailDrawerProps) {
  const hydrationRequestRef = useRef(0);
  const [hydrationState, setHydrationState] =
    useState<ParcelDetailHydrationState>({
      error: null,
      parcelId: null,
      record: null,
    });

  useEffect(() => {
    if (!USE_BACKEND_API || !parcel) {
      hydrationRequestRef.current += 1;
      logParcelMapFocusDiagnostic("parcel detail hydration skipped", {
        hasParcel: Boolean(parcel),
        officialParcelId: parcel?.officialParcelId ?? null,
        useBackendApi: USE_BACKEND_API,
      });
      return;
    }

    const controller = new AbortController();
    const parcelId = parcel.officialParcelId;
    const requestId = hydrationRequestRef.current + 1;
    hydrationRequestRef.current = requestId;

    logParcelMapFocusDiagnostic("request parcel detail hydration", {
      officialParcelId: parcelId,
      requestId,
    });

    getParcelDetail(
      parcelId,
      { include_geometry: true },
      { signal: controller.signal },
    )
      .then((response) => {
        const responseParcelId = response.official_parcel_id;

        if (
          controller.signal.aborted ||
          requestId !== hydrationRequestRef.current
        ) {
          logParcelMapFocusDiagnostic("stale parcel detail hydration ignored", {
            latestRequestId: hydrationRequestRef.current,
            requestId,
            responseParcelId,
            selectedParcelId: parcelId,
          });
          return;
        }

        if (responseParcelId !== parcelId) {
          logParcelMapFocusDiagnostic("mismatched parcel detail response ignored", {
            requestId,
            responseParcelId,
            selectedParcelId: parcelId,
          });
          return;
        }

        logParcelMapFocusDiagnostic("received parcel detail response", {
          hasMapFocus: Boolean(response.map_focus),
          mapFocus: response.map_focus ?? null,
          requestId,
          responseParcelId,
          selectedParcelId: parcelId,
        });

        const hydratedRecord = normalizeBackendParcelDetailResponse(
          response,
          parcel,
        );
        const backendMapFocus = normalizeBackendParcelMapFocusResponse(
          response,
          hydratedRecord,
        );

        setHydrationState({
          error: null,
          parcelId,
          record: hydratedRecord,
        });
        onParcelDetailHydrated(hydratedRecord, "api");

        if (backendMapFocus) {
          onMapFocusHydrated(backendMapFocus);
        } else {
          logParcelMapFocusDiagnostic("no backend focus emitted", {
            officialParcelId: parcelId,
          });
        }
      })
      .catch((detailError: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== hydrationRequestRef.current
        ) {
          return;
        }

        logParcelMapFocusDiagnostic("parcel detail hydration failed", {
          error:
            detailError instanceof Error
              ? detailError.message
              : "Parcel detail API is unavailable.",
          officialParcelId: parcelId,
          requestId,
        });

        setHydrationState({
          error:
            detailError instanceof Error
              ? detailError.message
              : "Parcel detail API is unavailable.",
          parcelId,
          record: null,
        });
        onParcelDetailHydrated(parcel, "fallback");
      });

    return () => controller.abort();
  }, [onMapFocusHydrated, onParcelDetailHydrated, parcel]);

  if (!parcel) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-white">
            Parcel Detail Drawer
          </h4>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Select a parcel result to inspect identity, zoning, quality,
          valuation, and planning context.
        </p>
      </section>
    );
  }

  const activeHydration =
    hydrationState.parcelId === parcel.officialParcelId
      ? hydrationState
      : null;
  const hydratedParcel = activeHydration?.record ?? null;
  const displayParcel = hydratedParcel ?? parcel;
  const loadingBackendDetail =
    USE_BACKEND_API && hydrationState.parcelId !== parcel.officialParcelId;
  const detailSource = hydratedParcel
    ? "FastAPI"
    : activeHydration?.error
      ? "Static fallback"
      : loadingBackendDetail
        ? "Loading API"
        : "Static detail";
  const mapFocusLabel = getParcelMapFocusStatusLabel(mapFocusResult);

  return (
    <section
      aria-label={`Parcel detail for ${displayParcel.officialParcelId}`}
      className="rounded-lg border border-[#68d8ff]/25 bg-[#06111d]/95 p-4 shadow-[0_0_32px_rgba(104,216,255,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Parcel Detail
          </p>
          <h4 className="mt-1 text-base font-semibold text-white">
            {displayParcel.officialParcelId}
          </h4>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${
              mapFocusResult.canFocus
                ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                : mapFocusResult.focusStatus === "pending-geometry"
                  ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300"
            }`}
            title={mapFocusResult.message}
          >
            {mapFocusLabel}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${
              hydratedParcel
                ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                : activeHydration?.error
                  ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
                  : "border-[#68d8ff]/20 bg-[#68d8ff]/10 text-[#8fe7ff]"
            }`}
          >
            {loadingBackendDetail ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {detailSource}
          </span>
          <button
            aria-label="Close parcel detail"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-slate-400 transition hover:border-white/20 hover:text-white"
            onClick={onClose}
            title="Close parcel detail"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DetailSection
          items={[
            ["Official Parcel ID", displayParcel.officialParcelId],
            ["PIN14", displayParcel.pin14],
            ["Object ID", displayParcel.objectId1?.toLocaleString() ?? null],
            ["Owner / Account", displayParcel.ownerName],
            ["Mailing Address", displayParcel.mailingAddress],
            ["Mailing City", displayParcel.mailingCity],
            ["Mailing State", displayParcel.mailingState],
          ]}
          title="Identity"
        />
        <DetailSection
          icon={<MapPinned className="h-3.5 w-3.5 text-[#d8b86a]" />}
          items={[
            ["Focus Source", mapFocus?.focusSource ?? null],
            ["Focus Status", mapFocusLabel],
            [
              "Centroid",
              mapFocus?.centroid
                ? `${mapFocus.centroid.latitude}, ${mapFocus.centroid.longitude}`
                : null,
            ],
            ["SceneView Action", mapFocusResult.canFocus ? "Ready" : "No-op"],
          ]}
          title="Map Focus"
        />
        <DetailSection
          icon={<MapPinned className="h-3.5 w-3.5 text-[#68d8ff]" />}
          items={[
            ["Subdivision", displayParcel.subdivision],
            ["Neighborhood", displayParcel.neighborhood],
          ]}
          title="Location Context"
        />
        <DetailSection
          items={[
            ["Jurisdiction", displayParcel.zoningJurisdiction],
            ["Zoning Code", displayParcel.zoningCode],
            ["Zoning Category", displayParcel.zoningCategory],
            ["Confidence", displayParcel.zoningConfidence],
          ]}
          title="Zoning"
        />
        <DetailSection
          icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-200" />}
          items={[
            ["Parcel Quality", displayParcel.parcelQualityStatus],
            ["Safe For Dashboard", displayParcel.safeForDashboard ? "Yes" : "No"],
            ["Warning Count", String(displayParcel.governanceWarningCount)],
            ["Primary Warning", displayParcel.primaryGovernanceWarning],
          ]}
          title="Quality"
        />
        <DetailSection
          items={[
            ["Market Value", formatOptionalCurrency(displayParcel.marketValue)],
            [
              "Assessed Value",
              formatOptionalCurrency(displayParcel.assessedValue),
            ],
            ["Valuation Band", displayParcel.valuationBand],
            ["Parcel Size", displayParcel.parcelSizeCategory],
          ]}
          title="Valuation"
        />
        <DetailSection
          items={[
            ["Planning Jurisdiction", displayParcel.planningJurisdiction],
            ["Boundary Type", displayParcel.planningBoundaryType],
          ]}
          title="Planning Context"
        />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">
          Governance Warnings
        </p>
        {displayParcel.governanceWarnings.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {displayParcel.governanceWarnings.map((warning) => (
              <span
                className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1 text-[10px] font-medium text-amber-100"
                key={warning}
              >
                {warning.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            No governance warning categories are attached to this parcel.
          </p>
        )}
      </div>

      {activeHydration?.error ? (
        <p className="mt-3 rounded-md border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
          FastAPI parcel detail is unavailable for this selection, so the
          static search record is shown. {activeHydration.error}
        </p>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          {hydratedParcel
            ? "Parcel detail hydrated from GET /parcels/{official_parcel_id}; static owner and mailing context remains available as fallback."
            : loadingBackendDetail
              ? "Hydrating full parcel detail from FastAPI while preserving the selected static search result."
              : "Static search-result detail is shown. Enable the backend API flag to hydrate this drawer from FastAPI."}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        {mapFocusResult.message}
      </p>
    </section>
  );
}

interface DetailSectionProps {
  icon?: ReactNode;
  items: Array<[string, string | null]>;
  title: string;
}

function DetailSection({ icon, items, title }: DetailSectionProps) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h5 className="text-xs font-semibold uppercase text-slate-400">
          {title}
        </h5>
      </div>
      <div className="grid gap-2">
        {items.map(([label, value]) => (
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2" key={label}>
            <span className="text-[11px] text-slate-500">{label}</span>
            <span className="truncate text-[11px] font-medium text-white">
              {value || "Unavailable"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
