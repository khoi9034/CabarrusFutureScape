import type { ReactNode } from "react";
import { AlertTriangle, Database, Layers3, ShieldCheck } from "lucide-react";
import {
  getDatasetReadinessSummary,
  getDatasetRegistryEntries,
  getDatasetRegistryReferenceStatus,
  getDatasetsBlockedByUnknowns,
  getHighPriorityDatasets,
} from "@/lib/data/dataRegistry";
import type { DatasetIntegrationStatus } from "@/types/dataRegistry";

const statusStyles: Record<DatasetIntegrationStatus, string> = {
  blocked: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  candidate: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#9eeeff]",
  "contract-draft": "border-slate-300/20 bg-slate-300/10 text-slate-300",
  mocked: "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
  "not-started": "border-slate-400/20 bg-slate-400/10 text-slate-400",
  "production-disabled": "border-rose-300/25 bg-rose-300/10 text-rose-100",
  "ready-for-staging": "border-[#55d38f]/30 bg-[#55d38f]/10 text-[#b9f5d0]",
  "schema-review": "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
};

export function DataRegistryPanel() {
  const entries = getDatasetRegistryEntries();
  const summary = getDatasetReadinessSummary();
  const highPriorityDatasets = getHighPriorityDatasets();
  const blockedByUnknowns = getDatasetsBlockedByUnknowns();

  return (
    <section
      aria-label="Initial dataset registry inventory"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            Data Registry
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Dataset Inventory
          </h3>
        </div>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]"
        >
          <Database className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <RegistryStat label="Datasets" value={summary.totalCount} />
        <RegistryStat label="Priority" value={summary.highPriorityCount} />
        <RegistryStat label="Staging" value={summary.readyForStagingCount} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatusSummary
          label="Blocked"
          tone="rose"
          value={summary.blockedCount}
        />
        <StatusSummary
          label="Unknowns"
          tone="amber"
          value={summary.unknownOwnershipOrSchemaCount}
        />
      </div>

      <div className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.055] p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-100" />
          <p className="text-xs leading-5 text-amber-100/75">
            Registry entries are mock planning records. They document future
            ownership, schema, refresh, and access questions before live services
            are connected.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-[11px] uppercase text-slate-500">
          <span>High-priority datasets</span>
          <span>{highPriorityDatasets.length}</span>
        </div>
        <div className="space-y-2">
          {highPriorityDatasets.slice(0, 4).map((dataset) => (
            <DatasetRow datasetId={dataset.id} key={dataset.id} />
          ))}
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#f0cd79]">
          Blocked or unknown ownership/schema ({blockedByUnknowns.length})
        </summary>
        <div className="mt-3 space-y-2">
          {blockedByUnknowns.slice(0, 5).map((dataset) => (
            <div
              className="rounded-md border border-white/10 bg-black/20 p-2"
              key={dataset.id}
            >
              <p className="text-xs font-semibold text-white">{dataset.name}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {dataset.unknowns[0] ?? dataset.risks[0] ?? "Unknown review item"}
              </p>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
        {entries.map((dataset) => (
          <DatasetRow datasetId={dataset.id} key={dataset.id} compact />
        ))}
      </div>
    </section>
  );
}

function DatasetRow({
  compact = false,
  datasetId,
}: {
  compact?: boolean;
  datasetId: string;
}) {
  const dataset = getDatasetRegistryEntries().find(
    (entry) => entry.id === datasetId,
  );

  if (!dataset) {
    return null;
  }

  const references = getDatasetRegistryReferenceStatus(dataset);

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-white">
            {dataset.name}
          </h4>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {dataset.category} / {dataset.expectedGeometryType}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[dataset.integrationStatus]}`}
        >
          {dataset.integrationStatus.replaceAll("-", " ")}
        </span>
      </div>

      {!compact ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {dataset.description}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
        <RegistryPill
          active={references.hasLayer}
          icon={<Layers3 className="h-3.5 w-3.5" />}
          label={references.hasLayer ? "Layer" : "No layer"}
        />
        <RegistryPill
          active={references.hasServiceCandidate}
          icon={<Database className="h-3.5 w-3.5" />}
          label={references.hasServiceCandidate ? "Service" : "No service"}
        />
        <RegistryPill
          active={references.hasLayerContract}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label={references.hasLayerContract ? "Contract" : "No contract"}
        />
      </div>
    </article>
  );
}

function RegistryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase text-slate-500">{label}</p>
    </div>
  );
}

function StatusSummary({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "rose";
  value: number;
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-300/15 bg-rose-300/[0.055] text-rose-100"
      : "border-amber-300/15 bg-amber-300/[0.055] text-amber-100";

  return (
    <div className={`rounded-md border p-2 ${toneClass}`}>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase opacity-75">{label}</p>
    </div>
  );
}

function RegistryPill({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 ${
        active
          ? "border-[#55d38f]/20 bg-[#55d38f]/10 text-[#b9f5d0]"
          : "border-white/10 bg-black/20 text-slate-500"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
