import { apiPost, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getDemoDevelopmentTrends,
  getDemoFloodSummary,
  getDemoIndicatorSummary,
  getDemoManifest,
  getDemoModelStatus,
  getDemoSchoolCapacityWatch,
} from "@/lib/demo-data/client";
import { getDemoSchoolPressureResponse } from "@/lib/demo-data/mapLayerClient";
import type {
  CfsAiDomain,
  CfsAiEvidenceItem,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
} from "@/types/api";

export const askCfsSuggestedPrompts = [
  "What are the main permit trends?",
  "Which school areas need review?",
  "Summarize floodplain review signals.",
  "What changed in observed development activity?",
  "Where is data coverage incomplete?",
  "Explain Model Lab in safe language.",
  "What should I inspect first?",
] as const;

export async function searchCfsAi(
  request: CfsAiSearchRequest,
  options: { signal?: AbortSignal } = {},
) {
  if (USE_DEMO_DATA) {
    return searchDemoCfsAi(request);
  }

  if (!USE_BACKEND_API) {
    throw new Error("CFS AI Search requires the local FastAPI backend in live mode.");
  }

  return apiPost<CfsAiSearchResponse>(
    "/ai/search",
    { ...request, mode: "live" },
    { signal: options.signal, timeoutMs: 30000 },
  );
}

async function searchDemoCfsAi(
  request: CfsAiSearchRequest,
): Promise<CfsAiSearchResponse> {
  const context = await buildDemoAiContext();
  const domains = request.filters?.domains?.length
    ? request.filters.domains
    : classifyDemoDomains(request.query);
  const primaryDomain = domains[0] ?? "general";
  const response =
    primaryDomain === "schools"
      ? demoSchoolAnswer(context, domains)
      : primaryDomain === "flood"
        ? demoFloodAnswer(context, domains)
        : primaryDomain === "model_lab"
          ? demoModelAnswer(context, domains)
          : primaryDomain === "data_readiness"
            ? demoDataReadinessAnswer(context, domains)
            : primaryDomain === "permits"
              ? demoPermitAnswer(context, domains)
              : primaryDomain === "transportation"
                ? demoSimpleAnswer(
                    "Transportation Context",
                    "Transportation Context is available where the cached demo extract includes corridor or project context. Use it with observed permit activity for planning review.",
                    "Open Explore Countywide - Transportation Context.",
                    context,
                    domains,
                  )
                : primaryDomain === "utilities"
                  ? demoSimpleAnswer(
                      "Utility Readiness",
                      "Utility readiness remains a data coverage item unless official utility capacity is available. Proxy context does not confirm capacity.",
                      "Review Data Still Needed and request official utility capacity fields.",
                      context,
                      domains,
                    )
                  : primaryDomain === "zoning"
                    ? demoSimpleAnswer(
                        "Zoning / Land Use",
                        "Zoning and land-use context should be reviewed with permit activity and data readiness caveats. Official rezoning records remain a data need where unavailable.",
                        "Review zoning context with Development Hotspots and Data Still Needed.",
                        context,
                        domains,
                      )
                    : primaryDomain === "methodology"
                      ? demoSimpleAnswer(
                          "Methodology",
                          "CFS answers from cached demo summaries and safe methodology caveats. Missing data is shown as unavailable instead of inferred.",
                          "Open Methodology for source notes and limitations.",
                          context,
                          domains,
                        )
              : demoGeneralAnswer(context, domains);

  return sanitizeDemoResponse(response);
}

function demoPermitAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const annual = context.trends.trends.annual_trends ?? [];
  const latest = annual.at(-1);
  const first = annual[0];
  const stats = context.indicator.development_activity.statistics;
  return baseDemoResponse(
    `Based on the cached demo extract, observed permit activity is the main growth signal. ${
      latest
        ? `The latest available year shows ${format(latest.permit_count)} permit records.`
        : "Yearly permit trend data is not available in this extract."
    }`,
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "Observed development activity",
        `${format(stats.total_permits)} permit records and ${format(stats.parcels_with_activity)} active parcels in the demo extract.`,
        "public/demo-data/indicator_summary.json",
      ),
      evidence(
        "Permit trend",
        first && latest
          ? `${first.year}: ${format(first.permit_count)} permits; ${latest.year}: ${format(latest.permit_count)} permits.`
          : "Permit trend chart is not available from the demo extract.",
        "public/demo-data/development_trends.json",
        annual.length ? "available" : "not_available",
      ),
    ],
    ["Open Explore Countywide â†’ Development Hotspots and choose a permit segment."],
  );
}

function demoSchoolAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const summary = context.schoolPressure.summary;
  return baseDemoResponse(
    `The strongest school review signal is where preliminary utilization context overlaps observed permit activity. The cached demo extract includes ${format(summary.areas_analyzed)} attendance areas and ${format(summary.elevated_review_count)} elevated review signals.`,
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "School Utilization + Permit Pressure",
        `${format(summary.areas_with_utilization)} areas include utilization context; ${format(summary.areas_with_recent_permits)} include recent permit activity.`,
        "public/demo-data/school_pressure_summary.json",
      ),
      evidence(
        "Preliminary school capacity watch",
        `${format(context.school.utilization_seed.total_count)} preliminary utilization records in the cached demo extract.`,
        "public/demo-data/school_capacity_watch.json",
      ),
    ],
    ["Open Explore Countywide â†’ School Utilization + Permit Pressure."],
  );
}

function demoFloodAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const summary = context.flood.summary;
  return baseDemoResponse(
    `Floodplain Review uses FEMA floodplain context from the cached demo extract. It shows ${format(summary.review_required_parcels)} review parcels where available.`,
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "Floodplain Review",
        `${format(summary.sfha_parcels)} Special Flood Hazard Area parcels and ${format(summary.floodway_parcels)} floodway parcels.`,
        "public/demo-data/flood_summary.json",
      ),
    ],
    ["Review Floodplain Review before planning around constrained parcels."],
  );
}

function demoModelAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  return baseDemoResponse(
    "Model Lab is internal research context only. The public demo shows relative research signals and hides exact probabilities, raw model values, and official classifications.",
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "Model Status",
        `${context.model.current_best_internal_model}; production ready: ${context.model.production_ready ? "yes" : "no"}.`,
        "public/demo-data/model_status.json",
      ),
    ],
    ["Use Model Lab for research context, then verify source records."],
  );
}

function demoDataReadinessAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const missing = context.indicator.data_still_needed ?? [];
  return baseDemoResponse(
    `Data coverage is incomplete where official datasets are still needed. The demo extract tracks ${missing.length} priority data requests.`,
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "Data Still Needed",
        missing
          .slice(0, 4)
          .map((item) => item.label)
          .join(", ") || "No data readiness rows are available.",
        "public/demo-data/indicator_summary.json",
        missing.length ? "available" : "not_available",
      ),
    ],
    ["Open the Data Still Needed board and request official source datasets."],
  );
}

function demoSimpleAnswer(
  title: string,
  answer: string,
  action: string,
  context: DemoAiContext,
  domains: CfsAiDomain[],
) {
  return baseDemoResponse(
    answer,
    domains,
    context.manifest.generated_at,
    [evidence(title, answer, "public/demo-data/indicator_summary.json")],
    [action],
  );
}

function demoGeneralAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  return baseDemoResponse(
    "Start with observed permit activity, School Utilization + Permit Pressure, Floodplain Review, and Data Still Needed. Those panels show growth, constraints, capacity context, and missing official data.",
    domains,
    context.manifest.generated_at,
    [
      evidence(
        "Portfolio Demo",
        context.manifest.caveat,
        "public/demo-data/demo_manifest.json",
      ),
    ],
    ["Inspect the Operational Watchlist, then open related Explore Countywide layers."],
  );
}

function baseDemoResponse(
  answer: string,
  domains: CfsAiDomain[],
  asOf: string | null,
  evidenceItems: CfsAiEvidenceItem[],
  actions: string[],
): CfsAiSearchResponse {
  return {
    answer,
    as_of: asOf,
    caveats: [
      "Portfolio Demo uses a cached demo extract.",
      "Observed permit activity is a planning signal, not a prediction.",
      "Preliminary school capacity watch is not an official enrollment forecast.",
      "Model Lab is internal research only; no exact probabilities are shown.",
    ],
    data_mode: "demo",
    domains,
    evidence: evidenceItems,
    provider: "none",
    related_layers: relatedLayers(domains),
    suggested_actions: actions,
  };
}

function classifyDemoDomains(query: string): CfsAiDomain[] {
  const normalized = query.toLowerCase();
  const domains: CfsAiDomain[] = [];
  const add = (domain: CfsAiDomain, terms: string[]) => {
    if (terms.some((term) => normalized.includes(term))) domains.push(domain);
  };
  add("schools", ["school", "attendance", "capacity", "utilization"]);
  add("flood", ["flood", "fema", "floodplain", "floodway"]);
  add("permits", ["permit", "development", "growth", "trend", "activity"]);
  add("transportation", ["transportation", "traffic", "road", "stip", "aadt"]);
  add("utilities", ["utility", "utilities", "wsacc", "water", "sewer"]);
  add("zoning", ["zoning", "land use", "rezoning", "planning"]);
  add("model_lab", ["model", "research", "signal", "lab"]);
  add("data_readiness", ["missing", "coverage", "data", "readiness"]);
  add("methodology", ["method", "explain", "caveat", "limitation"]);
  return domains.slice(0, 3).length ? domains.slice(0, 3) : ["general"];
}

function relatedLayers(domains: CfsAiDomain[]) {
  const layerMap: Record<CfsAiDomain, string[]> = {
    data_readiness: ["Data Still Needed"],
    flood: ["Floodplain Review"],
    general: ["Development Hotspots", "Floodplain Review", "School Utilization + Permit Pressure"],
    methodology: ["Methodology"],
    model_lab: ["Model Lab Research"],
    permits: ["Development Hotspots"],
    schools: ["School Utilization + Permit Pressure", "School Capacity Watch"],
    transportation: ["Transportation Context"],
    utilities: ["Utility Readiness"],
    zoning: ["Zoning / Land Use"],
  };
  return Array.from(new Set(domains.flatMap((domain) => layerMap[domain]))).slice(
    0,
    6,
  );
}

function evidence(
  title: string,
  detail: string,
  source: string,
  confidence: CfsAiEvidenceItem["confidence"] = "available",
): CfsAiEvidenceItem {
  return { confidence, detail, source, title };
}

function sanitizeDemoResponse(response: CfsAiSearchResponse) {
  const serialized = JSON.stringify(response)
    .replace(/will develop/gi, "shows observed permit activity")
    .replace(/raw score/gi, "relative research signal")
    .replace(/official prediction/gi, "planning review signal");
  return JSON.parse(serialized) as CfsAiSearchResponse;
}

function format(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "not available";
}

type DemoAiContext = Awaited<ReturnType<typeof buildDemoAiContext>>;

async function buildDemoAiContext() {
  const [manifest, indicator, trends, flood, school, model, schoolPressure] =
    await Promise.all([
      getDemoManifest(),
      getDemoIndicatorSummary(),
      getDemoDevelopmentTrends(),
      getDemoFloodSummary(),
      getDemoSchoolCapacityWatch(),
      getDemoModelStatus(),
      getDemoSchoolPressureResponse(),
    ]);
  return { flood, indicator, manifest, model, school, schoolPressure, trends };
}

