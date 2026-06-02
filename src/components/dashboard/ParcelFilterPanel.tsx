"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  emptyParcelSearchFilters,
  parcelSearchFilterLabels,
  type ParcelSearchFilters,
} from "@/components/dashboard/ParcelSearchState";
import type { ParcelSearchFilterOptions } from "@/data/intelligence/parcelSearchData";

interface ParcelFilterPanelProps {
  disabled?: boolean;
  filters: ParcelSearchFilters;
  onChange: (filters: ParcelSearchFilters) => void;
  options: ParcelSearchFilterOptions | null;
}

const filterConfig: Array<{
  key: keyof ParcelSearchFilters;
  optionKey: keyof ParcelSearchFilterOptions;
}> = [
  { key: "zoningJurisdiction", optionKey: "zoningJurisdictions" },
  { key: "zoningCode", optionKey: "zoningCodes" },
  { key: "zoningCategory", optionKey: "zoningCategories" },
  { key: "parcelQualityStatus", optionKey: "parcelQualityStatuses" },
  { key: "parcelSizeCategory", optionKey: "parcelSizeCategories" },
  { key: "zoningConfidence", optionKey: "zoningConfidences" },
  { key: "governanceWarningCategory", optionKey: "governanceWarningCategories" },
  { key: "valuationBand", optionKey: "valuationBands" },
  { key: "safeForDashboard", optionKey: "safeForDashboard" },
  { key: "subdivision", optionKey: "subdivisions" },
  { key: "neighborhood", optionKey: "neighborhoods" },
];

export function ParcelFilterPanel({
  disabled = false,
  filters,
  onChange,
  options,
}: ParcelFilterPanelProps) {
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  function updateFilter(key: keyof ParcelSearchFilters, value: string) {
    onChange({
      ...filters,
      [key]: value,
    });
  }

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#d8b86a]" />
          <h4 className="text-sm font-semibold text-white">Parcel Filters</h4>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || activeFilterCount === 0}
          onClick={() => onChange(emptyParcelSearchFilters)}
          title="Reset parcel filters"
          type="button"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {filterConfig.map(({ key, optionKey }) => {
          const filterOptions = options?.[optionKey] ?? [];

          return (
            <label className="grid gap-1" key={key}>
              <span className="text-[10px] font-medium uppercase text-slate-500">
                {parcelSearchFilterLabels[key]}
              </span>
              <select
                className="min-h-9 w-full rounded-md border border-white/10 bg-[#08111d] px-2 text-xs text-white outline-none transition focus:border-[#d8b86a]/50 focus:ring-2 focus:ring-[#d8b86a]/15 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled || filterOptions.length === 0}
                onChange={(event) => updateFilter(key, event.target.value)}
                value={filters[key]}
              >
                <option value="">All</option>
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        Subdivision, neighborhood, and zoning-code lists are capped to common
        values for compact controls; text search still scans loaded records or
        the active API result set.
      </p>
    </section>
  );
}
