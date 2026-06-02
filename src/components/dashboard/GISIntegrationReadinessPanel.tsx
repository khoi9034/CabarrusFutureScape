import type { ReactNode } from "react";
import {
  AlertTriangle,
  DatabaseZap,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { getGISServiceEnvironmentConfig } from "@/lib/gis/environmentConfig";
import {
  getCandidateServiceReadinessSummaries,
  prepareLayerMigration,
  summarizeIntegrationRisk,
} from "@/lib/gis/gisIntegrationPlanner";
import { layerContractTemplates } from "@/lib/gis/layerContractTemplates";
import { candidateArcGISServiceRegistry } from "@/lib/gis/serviceRegistry";
import type {
  GISIntegrationStage,
  ServiceConnectionStatus,
} from "@/types/gisContracts";

const statusStyles: Record<ServiceConnectionStatus, string> = {
  disconnected: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  planned: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#9eeeff]",
  "production-disabled": "border-rose-300/25 bg-rose-300/10 text-rose-100",
  "ready-for-testing": "border-[#55d38f]/30 bg-[#55d38f]/10 text-[#b9f5d0]",
  "schema-review": "border-[#d8b86a]/30 bg-[#d8b86a]/10 text-[#f0cd79]",
  staging: "border-violet-300/25 bg-violet-300/10 text-violet-100",
};

const stageLabels: Record<GISIntegrationStage, string> = {
  "contract-draft": "Contract draft",
  discovery: "Discovery",
  "production-disabled": "Production disabled",
  "schema-review": "Schema review",
  "staging-validation": "Staging validation",
  "testing-ready": "Testing ready",
};

export function GISIntegrationReadinessPanel() {
  const environment = getGISServiceEnvironmentConfig();
  const summaries = getCandidateServiceReadinessSummaries();
  const readyCount = summaries.filter(
    (summary) => summary.connectionStatus === "ready-for-testing",
  ).length;
  const highRiskCount = summaries.filter(
    (summary) => summary.riskLevel === "high",
  ).length;

  return (
    <section
      aria-label="GIS service integration readiness"
      className="rounded-lg border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">
            GIS Onboarding
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Service Contract Readiness
          </h3>
        </div>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff]"
        >
          <ServerCog className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <ReadinessStat label="Candidates" value={candidateArcGISServiceRegistry.length} />
        <ReadinessStat label="Contracts" value={layerContractTemplates.length} />
        <ReadinessStat label="Testing" value={readyCount} />
      </div>

      <div className="mt-3 rounded-lg border border-rose-300/15 bg-rose-300/[0.055] p-3">
        <div className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-rose-100" />
          <div>
            <p className="text-xs font-semibold uppercase text-rose-100">
              {environment.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-rose-100/70">
              Live service connections are disabled. Candidate URLs use safe
              placeholders until ownership, schema, and token reviews are complete.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {candidateArcGISServiceRegistry.map((service) => {
          const risk = summarizeIntegrationRisk(service);
          const migration = prepareLayerMigration(service.id);
          const requiredFieldCount = service.contract.requiredFields.length;
          const mappedFieldCount = service.contract.fieldMappings.length;

          return (
            <article
              className="rounded-lg border border-white/10 bg-white/[0.025] p-3"
              key={service.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white">
                    {service.title}
                  </h4>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {service.serviceType} / {service.expectedGeometryType}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[service.connectionStatus]}`}
                >
                  {formatStatusLabel(service.connectionStatus)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                <MetadataPill
                  icon={<DatabaseZap className="h-3.5 w-3.5" />}
                  label={`${mappedFieldCount}/${requiredFieldCount} fields`}
                />
                <MetadataPill
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label={stageLabels[service.onboardingStage]}
                />
                <MetadataPill
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  label={`${risk.readiness.riskLevel} risk`}
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-400">
                {service.description}
              </p>

              <details className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-[#f0cd79]">
                  Field mapping and migration notes
                </summary>
                <div className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
                  <p>
                    Mock replacement:{" "}
                    <span className="text-slate-200">
                      {migration.mockLayerId ?? "Not assigned"}
                    </span>
                  </p>
                  <p>
                    Required fields:{" "}
                    <span className="text-slate-200">
                      {service.contract.requiredFields.join(", ")}
                    </span>
                  </p>
                  <p>
                    First blocker:{" "}
                    <span className="text-slate-200">
                      {migration.blockedBy[0] ?? "No critical blocker recorded"}
                    </span>
                  </p>
                </div>
              </details>
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        {highRiskCount} candidate services remain high risk because Phase 1 keeps
        production systems disconnected.
      </p>
    </section>
  );
}

function ReadinessStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase text-slate-500">{label}</p>
    </div>
  );
}

function MetadataPill({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1">
      <span className="shrink-0 text-[#d8b86a]">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function formatStatusLabel(status: ServiceConnectionStatus) {
  return status.replaceAll("-", " ");
}
