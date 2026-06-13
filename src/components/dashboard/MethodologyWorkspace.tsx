import {
  AlertTriangle,
  Database,
  GitBranch,
  Layers3,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

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
];

const assumptionItems = [
  "Parcels are the primary unit of analysis for CFS V1.",
  "Zoning and flood assignments are overlay-derived and retain confidence/QA signals where available.",
  "Permit segmentation is rule-based and descriptive, not predictive or causal.",
  "FEMA NFHL is treated as the authoritative regulatory flood source; modeled flood TIFFs remain reference/future modeling inputs.",
  "School capacity scoring waits for official enrollment, functional capacity, grade-level history, and vetted capacity-change records.",
  "Infrastructure readiness and opportunity extrusions remain mock/readiness candidates until authoritative layers are connected.",
];

const limitationItems = [
  "No official school enrollment/capacity data has been added, and school capacity scores remain null/not scored.",
  "Presentation-derived school utilization must be verified against official CCS or county source files before use as decision evidence.",
  "Districtwide LEA pupil context does not replace school-level enrollment, functional capacity, available seats, or utilization.",
  "Transportation, water/sewer, fire/EMS, heat/runoff, and environmental sensitivity constraints are planned but not complete.",
  "Forecasting and development probability modeling are not implemented yet.",
  "Some operational map layers are mock placeholders used to demonstrate future integration paths.",
  "Local runtime performance depends on browser GPU, network latency to FastAPI, and selected map layer limits.",
];

const roadmapItems = [
  "Ingest verified school capacity, enrollment history, grade-level enrollment, projections, and planned capacity changes.",
  "Add school capacity/utilization scoring only after official data QA passes.",
  "Implement transportation access, water/sewer readiness, fire/EMS coverage, heat/runoff, and environmental sensitivity overlays.",
  "Introduce scenario testing and model calibration once descriptive intelligence is stable.",
  "Build predictive development probability only after enough validated historical features exist.",
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
                intelligence prototype. It explains what is known, how records
                are joined, where constraints are located, and which inputs
                remain preliminary before predictive modeling begins.
              </p>
            </div>
            <div className="grid min-w-[15rem] grid-cols-2 gap-2 text-xs">
              <StatusPill label="Prediction" value="Not built" tone="amber" />
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
                predictive.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MethodMini label="Constraint overlay" value="Spatial joins" />
                <MethodMini label="Development signal" value="Permit history" />
                <MethodMini label="Readiness concept" value="Evidence-led" />
                <MethodMini label="Predictive path" value="Future phase" />
              </div>
            </MethodCard>

            <MethodCard icon={ShieldCheck} kicker="Decision boundary" title="What CFS Does Not Claim Yet">
              <ul className="space-y-2 text-sm leading-6 text-slate-400">
                <li>No official school capacity score is active.</li>
                <li>No development probability model is active.</li>
                <li>No presentation-derived utilization value is treated as official.</li>
                <li>Mock infrastructure/readiness layers remain placeholders.</li>
              </ul>
            </MethodCard>
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
