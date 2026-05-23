import { Building2, CircleDollarSign, FileStack, MapPin } from "lucide-react";
import type { ParcelIntelligence } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface ParcelSummaryPanelProps {
  parcel: ParcelIntelligence;
}

const summaryRows = [
  { key: "zoning", label: "Zoning" },
  { key: "floodRisk", label: "Flood Risk" },
  { key: "ownerType", label: "Owner Type" },
] as const;

export function ParcelSummaryPanel({ parcel }: ParcelSummaryPanelProps) {
  const signalRows = [
    {
      label: "Development Pressure",
      value: parcel.developmentPressure,
      color: "#ffb454",
    },
    {
      label: "Infrastructure Readiness",
      value: parcel.infrastructureReadiness,
      color: "#55d38f",
    },
    {
      label: "Redevelopment Potential",
      value: parcel.redevelopmentPotential,
      color: "#68d8ff",
    },
    {
      label: "Tax Opportunity",
      value: parcel.taxOpportunity,
      color: "#d8b86a",
    },
  ];

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Selected Parcel
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            {parcel.parcelId}
          </h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]">
          <MapPin className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-5 text-slate-300">{parcel.address}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {summaryRows.map((row) => (
          <div
            className="rounded-md border border-white/10 bg-white/[0.035] p-2"
            key={row.key}
          >
            <dt className="text-[10px] uppercase text-slate-500">{row.label}</dt>
            <dd className="mt-1 truncate text-xs font-semibold text-slate-100">
              {parcel[row.key]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <Building2 className="h-4 w-4 text-[#68d8ff]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Acreage</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {parcel.acreage.toFixed(1)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <CircleDollarSign className="h-4 w-4 text-[#d8b86a]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Assessed</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {formatCurrency(parcel.assessedValue)}
          </p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
          <FileStack className="h-4 w-4 text-[#b597ff]" />
          <p className="mt-2 text-[10px] uppercase text-slate-500">Permits</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {parcel.nearbyPermits}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {signalRows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-400">{row.label}</span>
              <span className="font-mono text-slate-200">
                {formatPercent(row.value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${row.value}%`, background: row.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
