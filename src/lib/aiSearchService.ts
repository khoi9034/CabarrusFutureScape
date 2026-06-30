import { apiPost, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getDemoDevelopmentTrends,
  getDemoFloodSummary,
  getDemoIndicatorIntelligence,
  getDemoIndicatorSummary,
  getDemoManifest,
  getDemoModelStatus,
  getDemoSchoolCapacityWatch,
} from "@/lib/demo-data/client";
import { getDemoSchoolPressureResponse } from "@/lib/demo-data/mapLayerClient";
import type {
  CfsAiDashboardActions,
  CfsAiDomain,
  CfsAiEvidenceItem,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
  IndicatorDomain,
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
    { signal: options.signal, timeoutMs: 15000 },
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
  const permitSignal = firstDemoSignal(context, "development_activity");
  const annual = context.trends.trends.annual_trends ?? [];
  const latest = annual.at(-1);
  const first = annual[0];
  const stats = context.indicator.development_activity.statistics;
  const detail = context.intelligence.development_activity_detail;
  const topTypes = namedCounts(detail?.top_permit_types ?? []);
  const topSegments = namedCounts(detail?.top_segments ?? []);
  const topGeographies = namedCounts(detail?.top_geographies ?? []);
  return baseDemoResponse(
    briefing(
      [
        "Executive summary",
        `Based on the cached demo extract, CFS analyzed ${format(detail?.total_records ?? stats.total_permits)} observed permit records across ${format(detail?.active_parcels ?? stats.parcels_with_activity)} active parcels. ${recentChangeText(detail)} This is observed permit activity, not a prediction.`,
      ],
      [
        "Key findings",
        bullets([
          `Years available: ${rangeText(detail?.years_available ?? annual.map((row) => row.year))}.`,
          `Strongest year: ${yearPoint(detail?.strongest_year)}; weakest year: ${yearPoint(detail?.weakest_year)}.`,
          `Top permit types: ${topTypes || "not available from current fields"}.`,
          `Top permit segments: ${topSegments || permitSignal?.evidence[1] || "not available"}.`,
          `Top geography bucket: ${topGeographies || "not available from current fields"}.`,
        ]),
      ],
      [
        "Planning interpretation",
        "Use this as a review workload signal. Compare active permit areas with school pressure, floodplain review, utility readiness, transportation context, and zoning/land-use context.",
      ],
      [
        "Inspect next",
        bullets([
          "Development Hotspots by permit segment and year range.",
          "School Utilization + Permit Pressure for attendance-area overlap.",
          "Floodplain Review, Utility Readiness, and Transportation Context around active areas.",
        ]),
      ],
    ),
    domains,
    context.manifest.generated_at,
    [
      ...(permitSignal
        ? [
            evidence(
              permitSignal.title,
              permitSignal.evidence[0] ?? "Observed permit activity signal is available.",
              "public/demo-data/indicator_intelligence.json",
              permitSignal.confidence === "unknown" ? "not_available" : "available",
            ),
          ]
        : []),
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
      evidence(
        "Permit categories and geography",
        `Top types: ${topTypes || "not available"}; top geographies: ${topGeographies || "not available"}.`,
        "public/demo-data/indicator_intelligence.json",
        detail ? "available" : "limited",
      ),
    ],
    [
      "Open Explore Countywide -> Development Hotspots and choose a permit segment.",
      "Ask: Which school areas overlap recent permit activity?",
      "Ask: Where is data coverage incomplete for development review?",
    ],
  );
}

function demoSchoolAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const schoolSignals = context.intelligence.signals.filter(
    (signal) => signal.domain === "school_pressure",
  );
  const summary = context.schoolPressure.summary;
  const detail = context.intelligence.school_pressure_detail;
  return baseDemoResponse(
    briefing(
      [
        "Executive summary",
        `The strongest school review signal is where preliminary utilization context overlaps observed permit activity. The cached demo extract includes ${format(detail?.areas_reviewed ?? summary.areas_analyzed)} attendance areas and ${format(detail?.elevated_review_count ?? summary.elevated_review_count)} elevated review signals.`,
      ],
      [
        "Key findings",
        bullets([
          `Utilization coverage: ${detail?.utilization_data_coverage ?? `${format(summary.areas_with_utilization)} areas include utilization context`}.`,
          `Permit pressure overlap: ${detail?.permit_pressure_overlap ?? `${format(summary.areas_with_recent_permits)} areas include recent permit activity`}.`,
          `Top watch areas: ${schoolAreaList(detail?.top_areas ?? []) || "top attendance-area rows are not available in the compact demo context"}.`,
        ]),
      ],
      [
        "Planning interpretation",
        "This is a preliminary school capacity watch. It helps staff decide where to compare official enrollment/capacity, approved subdivisions, housing mix, and observed permits.",
      ],
      [
        "Inspect next",
        bullets([
          "School Utilization + Permit Pressure.",
          "Development Hotspots filtered to recent residential permit segments.",
          "Data Still Needed for official enrollment, capacity, and student-generation assumptions.",
        ]),
      ],
    ),
    domains,
    context.manifest.generated_at,
    [
      ...(schoolSignals[0]
        ? [
            evidence(
              schoolSignals[0].title,
              schoolSignals[0].evidence[0] ??
                "Preliminary school capacity watch signal is available.",
              "public/demo-data/indicator_intelligence.json",
              schoolSignals[0].confidence === "unknown" ? "not_available" : "available",
            ),
          ]
        : []),
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
    [
      "Open Explore Countywide -> School Utilization + Permit Pressure.",
      "Ask: What changed in observed development activity?",
      "Ask: Where is data coverage incomplete?",
    ],
  );
}

function demoFloodAnswer(context: DemoAiContext, domains: CfsAiDomain[]) {
  const summary = context.flood.summary;
  const detail = context.intelligence.floodplain_detail;
  return baseDemoResponse(
    briefing(
      [
        "Executive summary",
        `Floodplain Review uses floodplain context from the cached demo extract. It shows ${format(detail?.review_required_count ?? summary.review_required_parcels)} review parcels where available.`,
      ],
      [
        "Key findings",
        bullets([
          `Special Flood Hazard Area parcels: ${format(detail?.special_flood_hazard_area_count ?? summary.sfha_parcels)}.`,
          `Floodway parcels: ${format(detail?.floodway_count ?? summary.floodway_parcels)}.`,
          `Permit overlap count: ${format(detail?.permit_overlap_count)}.`,
        ]),
      ],
      [
        "Planning interpretation",
        "Use floodplain review before evaluating active development areas. This is a planning screen, not a permitting determination.",
      ],
      [
        "Inspect next",
        bullets(["Floodplain Review.", "Development Hotspots near constrained parcels.", "Methodology for floodplain caveats."]),
      ],
    ),
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
    briefing(
      [
        "Executive summary",
        "Model Lab is internal research context. The public demo shows relative research signals and hides exact probabilities, raw model values, and official classifications.",
      ],
      [
        "Key findings",
        bullets([
          "Use research bands as review prompts, not decisions.",
          "Factors can include zoning context, transportation access, observed permit activity, parcel context, and data readiness.",
          "Production ready remains false in the cached demo extract.",
        ]),
      ],
      [
        "Planning interpretation",
        "Use Model Lab to prioritize questions, then verify source records before drawing conclusions.",
      ],
      ["Inspect next", bullets(["Model Lab Research Signals.", "Methodology.", "Related parcel and permit layers."])],
    ),
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
  const readinessRows = context.intelligence.domain_readiness ?? [];
  const readinessDetail = context.intelligence.data_readiness_detail ?? [];
  const missing = context.indicator.data_still_needed ?? [];
  return baseDemoResponse(
    briefing(
      [
        "Executive summary",
        `Data coverage is incomplete where official datasets are still needed. The demo extract tracks ${readinessRows.length || missing.length} readiness items.`,
      ],
      [
        "Key findings",
        bullets(
          readinessDetail.length
            ? readinessDetail
                .slice(0, 5)
                .map((row) => `${row.domain}: needs ${row.next_data_need}`)
            : missing.slice(0, 5).map((item) => item.label),
        ),
      ],
      [
        "Planning interpretation",
        "Use data readiness to decide what to request before moving from exploratory monitoring to official review support.",
      ],
      ["Inspect next", bullets(["Data Still Needed.", "Methodology.", "Utility Readiness, Schools, Zoning / Land Use, and Transportation Context."])],
    ),
    domains,
    context.manifest.generated_at,
    [
      ...(readinessRows.length
        ? [
            evidence(
              "Domain readiness",
              readinessRows
                .filter((row) => row.data_available !== "yes")
                .slice(0, 4)
                .map((row) => `${row.domain}: ${row.next_data_need}`)
                .join("; ") || "Domain readiness rows are available.",
              "public/demo-data/indicator_intelligence.json",
            ),
          ]
        : []),
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
  const watchlist = context.intelligence.watchlist ?? [];
  return baseDemoResponse(
    briefing(
      [
        "Executive summary",
        "Inspect the highest-priority watchlist items first, then move to data-needed blockers that limit confidence.",
      ],
      [
        "Priority order",
        bullets(
          watchlist.length
            ? watchlist
                .slice(0, 5)
                .map((signal) => `${signal.title} (${signal.status_band.replaceAll("_", " ")})`)
            : [
                "Development Activity.",
                "School Utilization + Permit Pressure.",
                "Floodplain Review.",
                "Data Still Needed.",
              ],
        ),
      ],
      [
        "Planning interpretation",
        "This order puts elevated review and review signals ahead of lower-intensity monitoring, while keeping missing official data visible.",
      ],
      ["Inspect next", bullets(["Operational Watchlist.", "Development Hotspots.", "School Utilization + Permit Pressure.", "Floodplain Review.", "Data Still Needed."])],
    ),
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
    dashboard_actions: dashboardActionsForDomains(domains),
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

function dashboardActionsForDomains(domains: CfsAiDomain[]): CfsAiDashboardActions {
  const primaryDomain = domains[0] ?? "general";
  const actions: Partial<Record<CfsAiDomain, CfsAiDashboardActions>> = {
    data_readiness: {
      filter_watchlist: { domain: "data_readiness", status: "data needed" },
      focus_domain: "data_readiness",
      highlight_kpis: ["data_readiness"],
      open_detail: { type: "domain", id: "data_readiness" },
      sort_watchlist_by: "data_gap",
    },
    flood: {
      focus_domain: "flood",
      highlight_kpis: ["floodplain_review"],
      open_detail: { type: "kpi", id: "floodplain_review" },
      recommended_layers: ["Floodplain Review"],
    },
    general: {
      focus_domain: "general",
      highlight_kpis: ["observed_development_activity", "school_pressure"],
      recommended_layers: [
        "Development Hotspots",
        "School Utilization + Permit Pressure",
        "Floodplain Review",
      ],
    },
    model_lab: {
      focus_domain: "model_lab",
      highlight_kpis: ["model_research_status"],
      open_detail: { type: "domain", id: "model_lab" },
      recommended_layers: ["Model Lab Research Signals"],
    },
    permits: {
      focus_domain: "permits",
      highlight_kpis: ["observed_development_activity"],
      open_detail: { type: "kpi", id: "observed_development_activity" },
      recommended_layers: ["Development Hotspots"],
      sort_watchlist_by: "recent_activity",
    },
    schools: {
      filter_watchlist: { domain: "schools", status: "elevated review" },
      focus_domain: "schools",
      highlight_kpis: ["school_pressure"],
      open_detail: { type: "kpi", id: "school_pressure" },
      recommended_layers: [
        "School Utilization + Permit Pressure",
        "Development Hotspots",
      ],
      sort_watchlist_by: "severity",
    },
    transportation: {
      focus_domain: "transportation",
      highlight_kpis: ["transportation_context"],
      recommended_layers: ["Transportation Context"],
    },
    utilities: {
      focus_domain: "utilities",
      highlight_kpis: ["utility_readiness"],
      recommended_layers: ["Utility Readiness"],
    },
    zoning: {
      focus_domain: "zoning",
      highlight_kpis: ["data_readiness"],
      recommended_layers: ["Zoning / Land Use"],
    },
  };

  return actions[primaryDomain] ?? actions.general ?? {};
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

function briefing(...sections: Array<[string, string]>) {
  return sections
    .filter(([, body]) => body)
    .map(([title, body]) => `${title}\n${body}`)
    .join("\n\n");
}

function bullets(items: string[]) {
  return items.filter(Boolean).map((item) => `- ${item}`).join("\n");
}

function namedCounts(rows: Array<{ count: number; label: string }>) {
  return rows
    .slice(0, 4)
    .map((row) => `${row.label} (${format(row.count)})`)
    .join(", ");
}

function recentChangeText(
  detail: DemoAiContext["intelligence"]["development_activity_detail"],
) {
  if (detail?.recent_window && detail.previous_window && detail.delta !== null) {
    const pct =
      typeof detail.pct_change === "number"
        ? ` (${detail.pct_change >= 0 ? "+" : ""}${detail.pct_change.toFixed(1)}%)`
        : "";
    const delta = detail.delta >= 0 ? `+${format(detail.delta)}` : format(detail.delta);
    return `The latest comparison is ${detail.previous_window} to ${detail.recent_window}: ${format(detail.previous_count)} to ${format(detail.recent_count)} permits, a ${delta} permit change${pct}.`;
  }
  return "Recent year comparison is not available from the current context.";
}

function rangeText(values: Array<number | string | null | undefined>) {
  const clean = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (!clean.length) return "not available";
  return clean.length > 1 ? `${clean[0]}-${clean[clean.length - 1]}` : String(clean[0]);
}

function yearPoint(value?: { count?: number; year?: number }) {
  if (!value?.year) return "not available";
  return `${value.year} (${format(value.count)} permits)`;
}

function schoolAreaList(
  rows: NonNullable<DemoAiContext["intelligence"]["school_pressure_detail"]>["top_areas"],
) {
  return rows
    .slice(0, 4)
    .map(
      (row) =>
        `${row.school_name ?? "Attendance area"} - ${row.watch_band ?? "review"} with ${format(row.recent_permits)} recent permits`,
    )
    .join("; ");
}

function firstDemoSignal(
  context: DemoAiContext,
  domain: IndicatorDomain,
) {
  return context.intelligence.signals.find((signal) => signal.domain === domain);
}

type DemoAiContext = Awaited<ReturnType<typeof buildDemoAiContext>>;

async function buildDemoAiContext() {
  const [
    manifest,
    indicator,
    intelligence,
    trends,
    flood,
    school,
    model,
    schoolPressure,
  ] =
    await Promise.all([
      getDemoManifest(),
      getDemoIndicatorSummary(),
      getDemoIndicatorIntelligence(),
      getDemoDevelopmentTrends(),
      getDemoFloodSummary(),
      getDemoSchoolCapacityWatch(),
      getDemoModelStatus(),
      getDemoSchoolPressureResponse(),
    ]);
  return {
    flood,
    indicator,
    intelligence,
    manifest,
    model,
    school,
    schoolPressure,
    trends,
  };
}

