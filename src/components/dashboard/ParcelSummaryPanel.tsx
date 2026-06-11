import {
  BadgeCheck,
  CircleDollarSign,
  Database,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import type { SelectedParcelIntelligenceSource } from "@/hooks/useSelectedParcel";
import { formatCurrency } from "@/lib/utils";

interface ParcelSummaryPanelProps {
  parcel: ParcelSearchRecord | null;
  source: SelectedParcelIntelligenceSource | null;
}

const sourceLabel: Record<SelectedParcelIntelligenceSource, string> = {
  api: "Live API",
  fallback: "Static fallback",
  static: "Static index",
};

function formatOptionalCurrency(value: number | null) {
  return value === null ? "Unavailable" : formatCurrency(value);
}

function formatLabel(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBoolean(value: boolean | null) {
  if (value === null) {
    return "Unavailable";
  }

  return value ? "Yes" : "Needs review";
}

export function ParcelSummaryPanel({
  parcel,
  source,
}: ParcelSummaryPanelProps) {
  if (!parcel) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Selected Parcel
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              No parcel selected
            </h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]">
            <MapPin className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-sm leading-5 text-slate-400">
          Search and select a parcel to view live parcel intelligence.
        </p>
      </section>
    );
  }

  const displayName =
    parcel.ownerName ??
    parcel.subdivision ??
    parcel.neighborhood ??
    parcel.officialParcelId;
  const locationSummary = [parcel.subdivision, parcel.neighborhood]
    .filter(Boolean)
    .join(" / ");
  const primaryWarnings = parcel.governanceWarnings.slice(0, 3);
  const additionalWarningCount =
    parcel.governanceWarnings.length - primaryWarnings.length;

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-white">
            {parcel.officialParcelId}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {source ? sourceLabel[source] : "Parcel intelligence"}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]">
          <MapPin className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-5 text-slate-300">
        {displayName}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {locationSummary || "Subdivision and neighborhood unavailable"}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <SummaryCell label="PIN14" value={parcel.pin14 ?? "Unavailable"} />
        <SummaryCell
          label="Owner / Account"
          value={parcel.ownerName ?? "Unavailable"}
        />
        <SummaryCell
          label="Zoning Jurisdiction"
          value={parcel.zoningJurisdiction ?? "Unavailable"}
        />
        <SummaryCell
          label="Zoning Code"
          value={parcel.zoningCode ?? "Unavailable"}
        />
        <SummaryCell
          label="Zoning Category"
          value={formatLabel(parcel.zoningCategory)}
        />
        <SummaryCell
          label="Zoning Confidence"
          value={formatLabel(parcel.zoningConfidence)}
        />
      </dl>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <CircleDollarSign className="h-4 w-4 text-[#d8b86a]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Assessed</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {formatOptionalCurrency(parcel.assessedValue)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <CircleDollarSign className="h-4 w-4 text-[#d8b86a]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Market</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {formatOptionalCurrency(parcel.marketValue)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <Database className="h-4 w-4 text-[#68d8ff]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Valuation</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {formatLabel(parcel.valuationBand)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SummaryCell
          label="Parcel Size"
          value={formatLabel(parcel.parcelSizeCategory)}
        />
        <SummaryCell
          label="Parcel Quality"
          value={formatLabel(parcel.parcelQualityStatus)}
        />
        <SummaryCell
          label="Safe For Dashboard"
          value={formatBoolean(parcel.safeForDashboard)}
        />
        <SummaryCell
          label="Warning Count"
          value={parcel.governanceWarningCount.toLocaleString()}
        />
      </div>

      <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-center gap-2">
          {parcel.safeForDashboard ? (
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-200" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-amber-200" />
          )}
          <p className="text-[10px] font-medium uppercase text-slate-500">
            Governance Warnings
          </p>
        </div>
        {primaryWarnings.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {primaryWarnings.map((warning) => (
              <span
                className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1 text-[10px] font-medium text-amber-100"
                key={warning}
              >
                {formatLabel(warning)}
              </span>
            ))}
            {additionalWarningCount > 0 ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-slate-300">
                +{additionalWarningCount} more
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            No governance warning categories are attached to this parcel.
          </p>
        )}
      </div>

      <p className="mt-3 rounded-md border border-[#68d8ff]/15 bg-[#68d8ff]/[0.055] px-3 py-2 text-[11px] leading-5 text-slate-400">
        Permit activity is available in the Development Activity panel.
        Development pressure, infrastructure readiness, redevelopment
        potential, and tax opportunity are hidden until real parcel-level
        fields are connected.
      </p>
    </section>
  );
}

interface SummaryCellProps {
  label: string;
  value: string;
}

function SummaryCell({ label, value }: SummaryCellProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}
