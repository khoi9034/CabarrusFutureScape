"use client";

import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Database,
  GitBranch,
  Layers3,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  developmentPredictionPublicBlockers,
  developmentPredictionRoadmap,
  standardizedDevelopmentPredictionMetrics,
  useDevelopmentPredictionResearchStatus,
} from "@/hooks/useDevelopmentPredictionResearchStatus";
import {
  useEnterpriseDiagnostics,
  type EnterpriseDiagnosticCheck,
  type EnterpriseDiagnosticStatus,
} from "@/hooks/useEnterpriseDiagnostics";
import type { DevelopmentPredictionRankingClassBucket } from "@/types/api";

const currentBestModelFallback = {
  excludedGroups: [
    "Accela plan reviews",
    "Central Area Plan",
    "utility proxy",
    "metadata/current-context flags",
  ],
  variantLabel: "Zoning + Transportation + Tax/Value",
  variantValue: "transportation_plus_tax_value_only",
};

const dataInputs = [
  {
    label: "Parcels",
    status: "Active",
    text: "Assessor parcel identity, parcel quality, ownership display, valuation bands, zoning joins, and selected-parcel map focus.",
  },
  {
    label: "Zoning",
    status: "Active",
    text: "Overlay-derived jurisdiction, zoning code, generalized category, confidence, and governance warning context.",
  },
  {
    label: "Development Activity",
    status: "Active",
    text: "Permit-to-parcel relationships, parcel activity summaries, hotspot concentration, trends, zoning activity, and permit events.",
  },
  {
    label: "Permit Segmentation",
    status: "Descriptive",
    text: "Rule-based permit segment labels for residential growth, commercial activity, redevelopment, demolition, maintenance, institutional, and industrial activity.",
  },
  {
    label: "Development Ranking Research",
    status: "Internal only",
    text: "Current best internal variant is zoning plus transportation plus tax/value context. Parcel-level prediction outputs and parcel-level classes are not exposed.",
  },
  {
    label: "FEMA Flood Constraints",
    status: "Regulatory",
    text: "FEMA NFHL Layer 28 flood zone polygons and parcel-level flood overlay flags, scores, and high-review markers.",
  },
  {
    label: "School Assignment",
    status: "Read-only",
    text: "CCS attendance-zone polygon overlap for elementary, middle, and high assignments. School point distance is not used.",
  },
  {
    label: "School Utilization Seed",
    status: "Needs verification",
    text: "Presentation-derived SY 2024-2025 utilization percentages for preliminary visualization only. Not official capacity scoring.",
  },
  {
    label: "LEA Pupil Context",
    status: "Districtwide",
    text: "Uploaded 2025 CCS LEA-wide Enrollment, ADM, ADA, and MLD grade totals, including district Enrollment total 36,287. Not school-level capacity.",
  },
];

const logicItems = [
  "Parcel intelligence begins with a stable official parcel id and joins zoning, quality, valuation, governance, and map focus fields into one selected-parcel record.",
  "Development activity is descriptive: permits are related to parcels, summarized by activity class, segmented by permit signal, and rendered as optional concentration hotspots.",
  "Flood constraints use FEMA NFHL regulatory polygons, then parcel overlay metrics identify floodway, SFHA, constrained acres, percent constrained, and review recommendations.",
  "School assignment uses attendance-zone polygon overlap for CCS V1 elementary, middle, and high zones. It does not assign by nearest school point.",
  "Presentation-derived school utilization is a temporary seed for visualization and workflow testing until verified enrollment and capacity files arrive.",
  "LEA pupil totals provide districtwide grade context only and are not joined to parcels or used as school-level capacity.",
  "Development prediction work is internal ranking research only. Parcel-level probability values are unavailable because calibration remains weak.",
];

const assumptionItems = [
  "Parcels are the primary unit of analysis for CFS V1.",
  "Zoning and flood assignments are overlay-derived and retain confidence/QA signals where available.",
  "Permit segmentation is rule-based and descriptive, not predictive or causal.",
  "Ranking classes are percentile bands for internal model QA, not final parcel development forecasts.",
  "FEMA NFHL is treated as the authoritative regulatory flood source; modeled flood TIFFs remain reference/future modeling inputs.",
  "School capacity scoring waits for official enrollment, functional capacity, grade-level history, and vetted capacity-change records.",
  "Infrastructure readiness and opportunity extrusions remain mock/readiness candidates until authoritative layers are connected.",
];

const limitationItems = [
  "No official school enrollment/capacity data has been added, and school capacity scores remain null/not scored.",
  "Presentation-derived school utilization must be verified against official CCS or county source files before use as decision evidence.",
  "Districtwide LEA pupil context does not replace school-level enrollment, functional capacity, available seats, or utilization.",
  "Transportation, water/sewer, fire/EMS, heat/runoff, and environmental sensitivity constraints are planned but not complete.",
  "Development ranking research is not production-ready and is not exposed as parcel-level predictions.",
  "Some operational map layers are mock placeholders used to demonstrate future integration paths.",
  "Local runtime performance depends on browser GPU, network latency to FastAPI, and selected map layer limits.",
];

const roadmapItems = [
  "Ingest verified school capacity, enrollment history, grade-level enrollment, projections, and planned capacity changes.",
  "Add school capacity/utilization scoring only after official data QA passes.",
  "Implement transportation access, water/sewer readiness, fire/EMS coverage, heat/runoff, and environmental sensitivity overlays.",
  "Introduce scenario testing and model calibration once descriptive intelligence is stable.",
  "Review internal ranking classes only after calibration, governance, and missing feature gaps are addressed.",
  "Package executive reporting around transparent inputs, caveats, and parcel-level due diligence evidence.",
];

export function MethodologyWorkspace() {
  return (
    <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
      <section className="methodology-workspace relative overflow-hidden rounded-xl border border-white/10 bg-[#07111d]/92 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.32)]">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(104,216,255,0.13),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(216,184,106,0.11),transparent_31%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent_36%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:42px_42px]" />
        </div>

        <div className="relative">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#68d8ff]">
                Methodology
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
                CFS Model Foundation and Data Transparency
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Cabarrus FutureScape is currently a parcel-centric descriptive
                intelligence prototype with internal model research. It explains
                what is known, how records are joined, where constraints are
                located, and why ranking experiments remain internal before any
                predictive signal is considered for public use.
              </p>
            </div>
            <div className="grid min-w-[15rem] grid-cols-2 gap-2 text-xs">
              <StatusPill label="Prediction" value="Internal only" tone="amber" />
              <StatusPill label="School score" value="Not scored" tone="cyan" />
              <StatusPill label="Flood source" value="FEMA NFHL" tone="green" />
              <StatusPill label="Utilization" value="Seed only" tone="rose" />
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.82fr]">
            <MethodCard
              icon={Sparkles}
              kicker="Model foundation"
              title="Parcel-Based Planning Intelligence"
            >
              <p>
                CFS uses parcels as the common planning object, then layers
                zoning, development activity, flood constraints, school
                assignment, and due-diligence context onto that parcel. The
                current platform is designed to be explainable before it becomes
                predictive or public-facing.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MethodMini label="Constraint overlay" value="Spatial joins" />
                <MethodMini label="Development signal" value="Permit history" />
                <MethodMini label="Readiness concept" value="Evidence-led" />
                <MethodMini label="Ranking research" value="Internal only" />
              </div>
            </MethodCard>

            <MethodCard icon={ShieldCheck} kicker="Decision boundary" title="What CFS Does Not Claim Yet">
              <ul className="space-y-2 text-sm leading-6 text-slate-400">
                <li>No official school capacity score is active.</li>
                <li>No development prediction output is active or public.</li>
                <li>No presentation-derived utilization value is treated as official.</li>
                <li>Mock infrastructure/readiness layers remain placeholders.</li>
              </ul>
            </MethodCard>
          </div>

          <div className="mt-4">
            <DevelopmentPredictionResearchStatusCard />
          </div>

          <div className="mt-4">
            <PlatformDiagnosticsCard />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <MethodCard icon={Database} kicker="Inputs" title="Active Data Inputs" className="xl:col-span-2">
              <div className="grid gap-2 md:grid-cols-2">
                {dataInputs.map((item) => (
                  <div
                    className="rounded-lg border border-white/10 bg-black/18 p-3"
                    key={item.label}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-100">
                        {item.label}
                      </h3>
                      <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </MethodCard>

            <MethodCard icon={GitBranch} kicker="Logic" title="Method Logic">
              <MethodList items={logicItems} />
            </MethodCard>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <MethodCard icon={Layers3} kicker="Assumptions" title="Current Assumptions">
              <MethodList items={assumptionItems} />
            </MethodCard>
            <MethodCard icon={AlertTriangle} kicker="Limitations" title="Known Drawbacks">
              <MethodList items={limitationItems} />
            </MethodCard>
            <MethodCard icon={Radar} kicker="Roadmap" title="Future Model Path">
              <MethodList items={roadmapItems} />
            </MethodCard>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlatformDiagnosticsCard() {
  const { checks, isLoading, lastCheckedAt } = useEnterpriseDiagnostics();

  return (
    <MethodCard
      className="border-[#5cd38f]/15 bg-[#071c18]/78"
      icon={ShieldCheck}
      kicker="Runtime diagnostics"
      title="Local Platform Readiness"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          A compact live check for local demo readiness. It verifies service
          health, database connectivity, core aggregate APIs, and model-safety
          flags without requesting parcel-level predictions or rendering the 3D
          map.
        </p>
        <span className="shrink-0 rounded border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase leading-4 text-slate-400">
          {isLoading
            ? "Checking"
            : lastCheckedAt
              ? `Checked ${formatDiagnosticsTime(lastCheckedAt)}`
              : "Not checked"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <DiagnosticCheckTile check={check} key={check.id} />
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">
        Prediction guardrail: CFS exposes aggregate model research status only.
        Parcel-level probabilities and ranking classes remain unavailable in the
        frontend and public API.
      </p>
    </MethodCard>
  );
}

function DiagnosticCheckTile({ check }: { check: EnterpriseDiagnosticCheck }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          {check.label}
        </p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-4 ${getDiagnosticStatusClass(
            check.status,
          )}`}
        >
          {formatDiagnosticStatus(check.status)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{check.detail}</p>
    </div>
  );
}

function DevelopmentPredictionResearchStatusCard() {
  const { errorMessage, featuresSummary, isLoading, rankingSummary, source } =
    useDevelopmentPredictionResearchStatus();
  const orderedDistribution = orderRankingDistribution(
    rankingSummary.class_distribution,
  );
  const totalRows =
    rankingSummary.ranking_row_count ||
    orderedDistribution.reduce((sum, item) => sum + item.row_count, 0);
  const currentBestVariant =
    featuresSummary?.current_best_internal_model_variant ??
    currentBestModelFallback.variantValue;
  const excludedGroups =
    featuresSummary?.excluded_feature_groups_current_best?.length
      ? featuresSummary.excluded_feature_groups_current_best
      : currentBestModelFallback.excludedGroups;

  return (
    <MethodCard
      className="border-[#68d8ff]/15 bg-[#071827]/86"
      icon={BrainCircuit}
      kicker="Model transparency"
      title="Development Prediction Research Status"
    >
      <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ResearchStatusItem
              label="Target"
              value={standardizedDevelopmentPredictionMetrics.target}
            />
            <ResearchStatusItem
              label="Model status"
              tone="amber"
              value="Internal research only"
            />
            <ResearchStatusItem label="Production ready" tone="rose" value="No" />
            <ResearchStatusItem
              label="Prediction probabilities"
              tone="rose"
              value="Not available"
            />
            <ResearchStatusItem
              label="Public exposure"
              tone="rose"
              value="Not allowed"
            />
            <ResearchStatusItem
              label="Best experiment"
              value={
                featuresSummary?.recommended_internal_model_experiment_id ??
                rankingSummary.experiment_id ??
                "phase16c ablation"
              }
            />
            <ResearchStatusItem
              label="Calibration"
              tone="amber"
              value={formatStatusLabel(
                rankingSummary.calibration_status ?? "weak_probability_calibration",
              )}
            />
            <ResearchStatusItem
              label="Recommended use"
              value="Internal ranking research and model QA"
            />
          </div>

          <section className="rounded-lg border border-[#f0cd79]/20 bg-[#1d1607]/36 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0cd79]">
              Current best internal model
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              {currentBestModelFallback.variantLabel}
            </h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ResearchStatusItem
                label="Variant"
                value={formatStatusLabel(currentBestVariant)}
              />
              <ResearchStatusItem
                label="Production ready"
                tone="rose"
                value={
                  featuresSummary?.current_best_internal_model_production_ready
                    ? "Yes"
                    : "No"
                }
              />
              <ResearchStatusItem
                label="Public exposure"
                tone="rose"
                value={
                  featuresSummary?.current_best_internal_model_public_exposure_allowed
                    ? "Allowed"
                    : "Not allowed"
                }
              />
              <ResearchStatusItem
                label="Model status"
                tone="amber"
                value="Internal research only"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Selected after Phase 16C ablation because it produced the strongest
              internal ranking performance while excluding noisy planning,
              pipeline, and proxy-only feature groups.
            </p>
          </section>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
              <p className="text-xs leading-5 text-slate-400">
                This section intentionally shows aggregate research status only.
                It does not display parcel IDs, parcel ranking classes, or
                model probability values.
              </p>
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
              Source: {source === "api" ? "Live FastAPI aggregate summaries" : "Documented Phase 10G aggregate summary"}
              {isLoading ? " (loading)" : ""}
            </p>
            <p className="mt-2 rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[11px] leading-5 text-slate-400">
              Current safety flags: model_active=false,
              prediction_probability_available=false, production_ready=false,
              public_exposure_allowed=false.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs leading-5 text-[#f0cd79]">
                API status unavailable; showing documented aggregate summary.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Aggregate ranking classes
                </p>
                <h4 className="mt-1 text-sm font-semibold text-white">
                  Distribution only
                </h4>
              </div>
              <BarChart3 className="h-4 w-4 text-[#68d8ff]" />
            </div>
            <div className="mt-3 space-y-2">
              {orderedDistribution.map((bucket) => (
                <RankingDistributionRow
                  bucket={bucket}
                  key={bucket.development_signal_class}
                  totalRows={totalRows}
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Internal model comparison
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ResearchMetric
                label="Baseline PR-AUC"
                value={standardizedDevelopmentPredictionMetrics.baselinePrAuc}
              />
              <ResearchMetric
                label="Zoning-enhanced PR-AUC"
                value={standardizedDevelopmentPredictionMetrics.zoningEnhancedPrAuc}
              />
              <ResearchMetric
                label="Baseline tie-aware lift@top 5%"
                value={standardizedDevelopmentPredictionMetrics.baselineLiftAtTop5}
              />
              <ResearchMetric
                label="Zoning-enhanced tie-aware lift@top 5%"
                value={
                  standardizedDevelopmentPredictionMetrics.zoningEnhancedLiftAtTop5
                }
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              The current best internal variant improved PR-AUC and top-5%
              lift in Phase 16C, but weak calibration means parcel-level
              probability values remain unavailable.
            </p>
          </section>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-black/20 p-3 lg:col-span-2">
          <h4 className="text-sm font-semibold text-white">
            Feature Group Governance
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <ResearchListCard
              accent="cyan"
              items={[
                "New construction labels and permit history.",
                "Historical zoning snapshots and map-change context.",
                "Transportation accessibility, STIP, and AADT context.",
                "Tax/value enrichment after Phase 16C ablation.",
              ]}
              title="Helped Current Variant"
            />
            <ResearchListCard
              accent="rose"
              items={excludedGroups.map((group) => formatStatusLabel(group))}
              title="Excluded For Now"
            />
            <ResearchListCard
              accent="rose"
              items={[
                "Current-context only or jurisdiction-limited coverage.",
                "Proxy-only utility context, not true capacity.",
                "Noisy top-k ranking behavior in ablation.",
                "Not time-safe enough for public model claims.",
              ]}
              title="Why Excluded"
            />
          </div>
        </section>
        <ResearchListCard
          accent="rose"
          items={developmentPredictionPublicBlockers}
          title="Why Not Public Yet?"
        />
        <ResearchListCard
          accent="cyan"
          items={developmentPredictionRoadmap}
          ordered
          title="Research Roadmap"
        />
      </div>
    </MethodCard>
  );
}

function getDiagnosticStatusClass(status: EnterpriseDiagnosticStatus) {
  switch (status) {
    case "ok":
      return "border-[#5cd38f]/25 bg-[#5cd38f]/10 text-[#c7ffd8]";
    case "checking":
      return "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bfefff]";
    case "degraded":
      return "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]";
    case "unavailable":
      return "border-[#ff8d7a]/25 bg-[#ff8d7a]/10 text-[#ffc2b6]";
  }
}

function formatDiagnosticStatus(status: EnterpriseDiagnosticStatus) {
  switch (status) {
    case "ok":
      return "OK";
    case "checking":
      return "Checking";
    case "degraded":
      return "Review";
    case "unavailable":
      return "Offline";
  }
}

function formatDiagnosticsTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MethodCard({
  children,
  className,
  icon: Icon,
  kicker,
  title,
}: {
  children: ReactNode;
  className?: string;
  icon: typeof Database;
  kicker: string;
  title: string;
}) {
  return (
    <article
      className={`rounded-xl border border-white/10 bg-[#081522]/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff] shadow-[0_0_28px_rgba(104,216,255,0.14)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {kicker}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-400">{children}</div>
    </article>
  );
}

function RankingDistributionRow({
  bucket,
  totalRows,
}: {
  bucket: DevelopmentPredictionRankingClassBucket;
  totalRows: number;
}) {
  const pct =
    bucket.pct_of_rows ||
    (totalRows > 0 ? Number(((bucket.row_count / totalRows) * 100).toFixed(4)) : 0);

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-200">
          {formatRankingClass(bucket.development_signal_class)}
        </span>
        <span className="text-xs font-semibold text-white">
          {formatInteger(bucket.row_count)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#68d8ff]"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {pct.toFixed(2)}% of internal research rows
      </p>
    </div>
  );
}

function ResearchListCard({
  accent,
  items,
  ordered = false,
  title,
}: {
  accent: "cyan" | "rose";
  items: string[];
  ordered?: boolean;
  title: string;
}) {
  const dotClass = accent === "cyan" ? "bg-[#68d8ff]" : "bg-[#ff8d7a]";
  const ListTag = ordered ? "ol" : "ul";

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ListTag className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li className="flex gap-2 text-xs leading-5 text-slate-400" key={item}>
            {ordered ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-slate-300">
                {index + 1}
              </span>
            ) : (
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ListTag>
    </section>
  );
}

function ResearchMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value.toFixed(6)}</p>
    </div>
  );
}

function ResearchStatusItem({
  label,
  tone = "cyan",
  value,
}: {
  label: string;
  tone?: "amber" | "cyan" | "rose";
  value: string;
}) {
  const toneClass = {
    amber: "border-[#d8b86a]/20 bg-[#d8b86a]/[0.06]",
    cyan: "border-[#68d8ff]/16 bg-[#68d8ff]/[0.055]",
    rose: "border-[#ff8d7a]/20 bg-[#ff8d7a]/[0.055]",
  };

  return (
    <div className={`rounded-lg border p-3 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-100">
        {value}
      </p>
    </div>
  );
}

function MethodList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li className="flex gap-2 text-sm leading-6 text-slate-400" key={item}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d8b86a]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MethodMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "cyan" | "green" | "rose";
  value: string;
}) {
  const toneClass = {
    amber: "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]",
    cyan: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bfefff]",
    green: "border-[#5cd38f]/25 bg-[#5cd38f]/10 text-[#c7ffd8]",
    rose: "border-[#ff8d7a]/25 bg-[#ff8d7a]/10 text-[#ffc2b6]",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-75">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  );
}

function orderRankingDistribution(
  distribution: DevelopmentPredictionRankingClassBucket[],
) {
  const order = [
    "very_high_development_signal",
    "high_development_signal",
    "moderate_development_signal",
    "low_development_signal",
  ];

  return [...distribution].sort((a, b) => {
    const aIndex = order.indexOf(a.development_signal_class);
    const bIndex = order.indexOf(b.development_signal_class);

    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatRankingClass(value: string) {
  const labels: Record<string, string> = {
    high_development_signal: "High development signal",
    low_development_signal: "Low development signal",
    moderate_development_signal: "Moderate development signal",
    very_high_development_signal: "Very high development signal",
  };

  return labels[value] ?? formatStatusLabel(value);
}

function formatStatusLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
