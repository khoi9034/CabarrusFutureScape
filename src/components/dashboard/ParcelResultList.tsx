"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import { cn } from "@/lib/utils";

interface ParcelResultListProps {
  error: string | null;
  loading: boolean;
  loadingLabel?: string;
  onSelect: (record: ParcelSearchRecord) => void;
  records: ParcelSearchRecord[];
  selectedParcelId: string | null;
}

export function ParcelResultList({
  error,
  loading,
  loadingLabel = "Loading parcel intelligence index",
  onSelect,
  records,
  selectedParcelId,
}: ParcelResultListProps) {
  if (loading) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#68d8ff]" />
        {loadingLabel}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-300/20 bg-rose-300/[0.055] p-4 text-sm text-rose-100">
        <p className="font-semibold">Parcel search unavailable</p>
        <p className="mt-1 text-xs leading-5 text-rose-100/75">{error}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-white/10 bg-black/20 px-4 text-center text-sm text-slate-500">
        <Search className="mb-3 h-5 w-5 text-slate-600" />
        <p className="font-medium text-slate-400">No parcels found</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Try a PIN, owner/account name, mailing address, subdivision,
          neighborhood, zoning code, or broader filter set.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
      {records.map((record) => {
        const active = record.officialParcelId === selectedParcelId;

        return (
          <button
            className={cn(
              "grid w-full gap-2 rounded-lg border p-3 text-left transition focus:outline-none focus-visible:border-[#d8b86a]/55 focus-visible:ring-2 focus-visible:ring-[#d8b86a]/20",
              active
                ? "border-[#d8b86a]/45 bg-[#d8b86a]/[0.1]"
                : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]",
            )}
            key={record.officialParcelId}
            onClick={() => onSelect(record)}
            type="button"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {record.officialParcelId}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                  PIN {record.pin14 ?? "Unavailable"} /{" "}
                  {record.ownerName ?? "Owner unavailable"}
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                {record.zoningConfidence ?? "unknown"}
              </span>
            </span>

            <span className="grid gap-1 text-[11px] text-slate-400">
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0 text-[#68d8ff]" />
                <span className="truncate">
                  {record.subdivision ?? "Subdivision unknown"} /{" "}
                  {record.neighborhood ?? "Neighborhood unknown"}
                </span>
              </span>
              <span className="truncate">
                {record.zoningJurisdiction ?? "No zoning jurisdiction"} /{" "}
                {record.zoningCode ?? "No zoning code"} /{" "}
                {record.parcelQualityStatus ?? "quality unknown"} / warnings{" "}
                {record.governanceWarningCount}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
