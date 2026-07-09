import { apiPost, USE_BACKEND_API, USE_DEMO_DATA } from "@/lib/api/client";
import {
  getDemoDevelopmentTrends,
  getDemoEconomicsIntelligence,
  getDemoFloodSummary,
  getDemoIndicatorIntelligence,
  getDemoIndicatorSummary,
  getDemoManifest,
  getDemoModelStatus,
  getDemoEconomicsPowerBiExport,
  getDemoSchoolCapacityWatch,
} from "@/lib/demo-data/client";
import { getDemoSchoolPressureResponse } from "@/lib/demo-data/mapLayerClient";
import type {
  CfsAiDashboardActions,
  CfsAiConversationTurn,
  CfsAiDomain,
  CfsAiEvidenceItem,
  CfsAiPowerBiActions,
  CfsAiSearchRequest,
  CfsAiSearchResponse,
  CfsAiSelectedSignal,
  EconomicsIntelligenceResponse,
  EconomicsPowerBiExportResponse,
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

export const askCfsEconomicsSuggestedPrompts = [
  "What should I inspect first?",
  "Why is value per acre misleading countywide?",
  "Which segment should I compare first?",
  "What does this chart mean?",
  "Which visual should I build in Power BI?",
  "What does the opportunity class chart mean?",
  "How should I use the economic segment slicer?",
  "How do I recreate this dashboard in Power BI?",
  "Explain the scenario comparison matrix.",
  "What does the data confidence register show?",
  "Which chart shows fiscal burden?",
  "Which rows should I send?",
  "How do I build this in Power BI?",
  "What CSV tables should I import first?",
  "Build a decision-pack summary.",
  "How do I QA the Power BI export?",
  "Build a snapshot summary.",
  "What should go into the economic snapshot?",
  "What caveats should I include?",
  "What next diligence should I list?",
  "How should I present selected rows?",
  "How should I walk through CFS Economics?",
  "Where did Workspace go?",
  "What is Power BI & Tools?",
  "How do I use selected rows in Power BI?",
  "How do I send rows to Print?",
  "Which areas show underbuilt opportunity?",
  "Where is data confidence weak?",
  "Which parcels look underbuilt?",
  "Where is tax-base opportunity high?",
  "Explain value per acre.",
  "How should I interpret improvement-to-land ratio?",
  "What scenario should I inspect first?",
  "What is the difference between fact and dimension tables?",
  "What relationships should I build?",
  "Should I use JSON or CSV for Power BI?",
  "Which segment should I compare first?",
  "Show commercial tax-base opportunity.",
] as const;

export const askCfsEconomicsWorkspacePrompts = [
  "Which rows should I select first?",
  "What does this table mean?",
  "Which underbuilt candidates need review?",
  "What should I do with selected rows?",
  "What should I send to Print?",
  "Where is data confidence weak?",
] as const;

export const askCfsEconomicsPowerBiToolPrompts = [
  "Build me a Power BI report.",
  "Create a chart of opportunity classes.",
  "Build a report for underbuilt parcels.",
  "Make a scenario comparison page.",
  "Show special assets as a report.",
  "Build a data confidence matrix.",
  "What should I do first?",
  "What rows should I select?",
  "What CSV tables should I import?",
  "What chart should I build?",
  "How do I use the report canvas?",
  "How do I build this in Power BI?",
  "What CSV tables should I import first?",
  "Build me a Power BI dashboard.",
  "What charts should Power BI generate?",
  "How do I build a chart?",
  "What should I add to the Power BI Report Canvas?",
  "What should I add to the report bucket?",
  "How do I use the report bucket?",
  "What bucket items should go in the print snapshot?",
  "Build a report plan and add it to the bucket.",
  "How do I QA the export?",
] as const;

export const askCfsEconomicsPrintPrompts = [
  "What should go in the print snapshot?",
  "Write an executive takeaway.",
  "What caveats should I include?",
  "What next diligence should I list?",
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
    { signal: options.signal, timeoutMs: 20000 },
  );
}

async function searchDemoCfsAi(
  request: CfsAiSearchRequest,
): Promise<CfsAiSearchResponse> {
  if (request.app_mode === "economics") {
    return sanitizeDemoResponse(await demoEconomicsAnswer(request));
  }

  const context = await buildDemoAiContext();
  const domains = request.filters?.domains?.length
    ? request.filters.domains
    : resolveDemoDomains(request);
  const primaryDomain = domains[0] ?? "general";
  const response = request.selected_signal
    ? demoSelectedSignalAnswer(context, domains, request.selected_signal)
    :
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

async function demoEconomicsAnswer(
  request?: CfsAiSearchRequest,
): Promise<CfsAiSearchResponse> {
  const economics = await getDemoEconomicsIntelligence();
  if (request?.request_type === "powerbi_report_plan") {
    return demoEconomicsPowerBiAnswer(await getDemoEconomicsPowerBiExport(), request.query);
  }
  if (isEconomicsWalkthroughQuery(request?.query ?? "")) {
    return demoEconomicsWalkthroughAnswer(economics.as_of);
  }
  if (isEconomicsWorkspaceQuery(request?.query ?? "")) {
    return demoEconomicsWorkspaceAnswer(economics);
  }
  if (isEconomicsPrintQuery(request?.query ?? "")) {
    return demoEconomicsPrintAnswer(economics);
  }
  if (isEconomicsPowerBiQuery(request?.query ?? "")) {
    return demoEconomicsPowerBiAnswer(await getDemoEconomicsPowerBiExport(), request?.query ?? "");
  }
  if (isEconomicsSegmentQuery(request?.query ?? "")) {
    return demoEconomicsSegmentAnswer(economics);
  }
  if (isEconomicsDashboardQuery(request?.query ?? "")) {
    return demoEconomicsDashboardAnswer(economics);
  }
  if (isEconomicsScenarioQuery(request?.query ?? "")) {
    return demoEconomicsScenarioAnswer(economics);
  }
  const summary = economics.summary;
  const watchlist = economics.watchlist.slice(0, 4);
  const missing = economics.data_readiness
    .filter((row) => row.data_status !== "available")
    .slice(0, 4)
    .map((row) => `${row.domain}: ${row.gap_or_next_need}`);
  const topSignals = watchlist.map(
    (row) =>
      `${row.geography_label ?? row.parcel_id}: ${row.opportunity_class} (${row.economic_status_band.replaceAll("_", " ")})`,
  );
  return {
    answer: briefing(
      [
        "Executive summary",
        `Based on the cached demo extract, CFS Economics reviewed ${format(summary.total_parcels_analyzed)} parcels as a parcel-based economic intelligence system. It connects value, acreage, growth pressure, infrastructure burden, and constraint context so counties can screen where growth creates value, where it creates public cost risk, and where deeper review is needed. The extract shows ${format(summary.underbuilt_candidate_count)} underbuilt watch candidates and ${format(summary.high_opportunity_count)} tax-base opportunity signals.`,
      ],
      [
        "Economic signal",
        bullets([
          `Total assessed value coverage: ${currency(summary.total_assessed_value)}.`,
          `Typical value per acre: ${currency(summary.median_value_per_acre)}.`,
          `Underbuilt watch candidates: ${format(summary.underbuilt_candidate_count)}.`,
          "Revenue per acre, fiscal opportunity, and infrastructure readiness are shown as screening bands rather than numeric scores.",
          `Data-needed records: ${format(summary.data_needed_count)}.`,
        ]),
      ],
      [
        "Underbuilt / redevelopment logic",
        bullets([
          "Low improvement-to-land ratio plus meaningful acreage can indicate an underbuilt redevelopment candidate.",
          "Low value per acre with observed growth context can indicate tax-base opportunity, subject to constraints.",
          "Missing acreage, assessed value, land value, or improvement value is labeled Needs More Data Before Recommendation.",
          "Estimated tax context is screening-level only and should be verified before fiscal analysis.",
        ]),
      ],
      [
        "Evidence",
        bullets(topSignals.length ? topSignals : ["No parcel-level economics watchlist rows are available in the cached demo extract."]),
      ],
      [
        "Fiscal / service interpretation",
        "Compare tax-base opportunity with observed permit activity, floodplain review, school pressure, utility readiness, and transportation context before treating any parcel as an investment-ready candidate.",
      ],
      [
        "Inspect next",
        bullets([
          "Revenue per Acre Dashboard.",
          "Underbuilt Redevelopment Watchlist.",
          "Fiscal Opportunity Score.",
          "Constraint-Adjusted Development Potential.",
          "Economic Scenario Model.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "Estimated tax context is screening-level only.",
          "Scenario values depend on assumptions.",
          "Missing utility, school, transportation, or value fields reduce confidence.",
          ...missing,
        ]),
      ],
      [
        "Consulting takeaway",
        "Traditional GIS can show where things are. CFS Economics helps explain what those places mean economically by turning parcel, tax, zoning, permit, infrastructure, and constraint data into a decision-support workflow.",
      ],
      [
        "Enterprise tool alignment",
        bullets([
          "Planning model: dimensions include Geography, Parcel, Jurisdiction, Land Use, Scenario, Time, and Constraint Domain.",
          "Measures include assessed value, land value, improvement value, value per acre, estimated county tax, tax-base lift band, revenue per acre band, public cost risk band, and data confidence.",
          "BI dataset: KPI fact, parcel economic signal fact, scenario output fact, domain readiness dimension, geography dimension, and time dimension.",
          "Decision pack: executive takeaway, evidence pack, assumptions, risk flags, caveats, and recommended next diligence.",
          "This is export-ready and connector-ready only; no live enterprise platform integration is configured.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: [
      "Portfolio Demo uses a cached demo extract.",
      "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
      "Opportunity classes are review bands, not approval recommendations.",
    ],
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["underbuilt_candidates", "tax_base_opportunity"],
      recommended_layers: [
        "Revenue per Acre Dashboard",
        "Underbuilt Redevelopment Watchlist",
        "Fiscal Opportunity Score",
        "Constraint-Adjusted Development Potential",
      ],
      sort_watchlist_by: "severity",
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Economics summary",
        `${format(summary.total_parcels_analyzed)} parcels; ${format(summary.underbuilt_candidate_count)} underbuilt candidates; ${format(summary.high_opportunity_count)} opportunity signals.`,
        "public/demo-data/economics_intelligence.json",
        summary.total_parcels_analyzed ? "available" : "limited",
      ),
      evidence(
        "Economic watchlist",
        topSignals.join("; ") || "No watchlist rows are available.",
        "public/demo-data/economics_intelligence.json",
        topSignals.length ? "available" : "limited",
      ),
    ],
    provider: "none",
    related_layers: [
      "Revenue per Acre Dashboard",
      "Underbuilt Redevelopment Watchlist",
      "Constraint-Adjusted Development Potential",
    ],
    suggested_actions: [
      "Open Economic Dashboard and compare Revenue per Acre Dashboard with the Underbuilt Redevelopment Watchlist.",
      "Use Economic Scenario Model as screening-level fiscal context only.",
      "Ask: Where is economic data confidence weak?",
      "Open Power BI & Tools for facts, dimensions, planning-model cells, and decision-pack JSON.",
    ],
  };
}

function isEconomicsWalkthroughQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "walk through",
    "tour",
    "how should i use cfs economics",
    "how do i use cfs economics",
    "what should i inspect first",
  ].some((phrase) => normalized.includes(phrase));
}

function isEconomicsDashboardQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "opportunity class chart",
    "dashboard in power bi",
    "filter first",
    "scenario comparison matrix",
    "data confidence register",
    "chart shows fiscal burden",
    "visual should i build",
  ].some((phrase) => normalized.includes(phrase));
}

function isEconomicsSegmentQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "value per acre misleading",
    "countywide",
    "economic segment",
    "segment slicer",
    "segment-aware",
    "commercial tax-base",
    "residential areas are underbuilt",
    "residential underbuilt",
    "special assets",
    "skewing the dashboard",
    "which segment",
  ].some((phrase) => normalized.includes(phrase));
}

function demoEconomicsSegmentAnswer(economics: EconomicsIntelligenceResponse): CfsAiSearchResponse {
  const segments = economics.segment_summary ?? [];
  const topSegments = segments
    .slice(0, 5)
    .map(
      (row) =>
        `${row.segment}: ${format(row.count)} rows; median value/acre ${currency(row.median_value_per_acre)}; ${format(row.underbuilt_candidate_count)} underbuilt.`,
    );
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "Value per acre is useful only when comparable parcels are grouped first. CFS Economics uses economic segments so residential, commercial, industrial/employment, civic, infrastructure, corridor, rural, and underbuilt rows are not treated as one peer set.",
      ],
      [
        "Segment interpretation",
        bullets([
          "Use the economic_segment slicer before reading the value-per-acre or improvement-to-land visuals.",
          "Median is safer than average because special assets can pull a countywide view away from ordinary parcel economics.",
          "Institutional, civic, infrastructure, utility, airport, convention, and medical-style assets should be treated as special/non-comparable context.",
          "Commercial and residential opportunity should be compared inside their own segment before using the result in a decision pack or Power BI report.",
        ]),
      ],
      ["Evidence", bullets(topSegments.length ? topSegments : ["Segment summary is not available in the cached demo extract."])],
      [
        "Power BI build path",
        bullets([
          "Use parcel_economic_signal_fact.economic_segment as the first slicer.",
          "Build value-per-acre bars after filtering to a segment.",
          "Keep special_asset_flag visible or use it as a filter when a report audience needs comparable assets only.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "CFS Economics provides screening-level bands, not official appraisal conclusions.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: [
      "Value per acre is most meaningful within similar land-use or property segments.",
      "Special assets can distort countywide views.",
    ],
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["median_value_per_acre", "underbuilt_candidates", "tax_base_opportunity"],
      recommended_layers: ["Economic Dashboard", "Power BI Desktop Practice Pack"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Economic segment summary",
        topSegments.join("; ") || "Segment summary is unavailable.",
        "public/demo-data/economics_intelligence.json",
        topSegments.length ? "available" : "limited",
      ),
    ],
    provider: "none",
    related_layers: ["Economic Dashboard", "Power BI & Tools"],
    suggested_actions: [
      "Filter Economic Dashboard by economic segment first.",
      "Use special_asset_flag in Power BI when comparing value-per-acre rows.",
      "Ask: Which residential areas are underbuilt?",
    ],
  };
}

function demoEconomicsDashboardAnswer(economics: EconomicsIntelligenceResponse): CfsAiSearchResponse {
  const classRows = economics.opportunity_class_breakdown
    .slice(0, 5)
    .map((row) => `${row.opportunity_class}: ${format(row.count)} signals`);
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "Read the Economic Dashboard like a Power BI report: start with KPI cards, use slicers to narrow geography/opportunity/confidence, then compare opportunity class, land-efficiency, scenario, fiscal burden, and data-confidence visuals.",
      ],
      [
        "Visual interpretation",
        bullets([
          "Opportunity Class Breakdown shows how screened parcels or areas distribute across economic opportunity classes.",
          "Value per Acre / Land Efficiency should be read by economic segment so non-comparable assets do not dominate the view.",
          "Scenario Output Comparison compares tax-base lift, revenue per acre, burden, and confidence as bands.",
          "Fiscal / Service Burden Matrix shows where upside may intersect public cost risk.",
          "Data Confidence Register shows which domains are ready, partial, or data-needed.",
        ]),
      ],
      [
        "Power BI build path",
        bullets([
          "Use parcel_economic_signal_fact for opportunity class, economic_segment, value/acre, confidence, and watchlist visuals.",
          "Use scenario_output_fact for scenario matrices and burden-band comparisons.",
          "Use domain_readiness_dim for the data confidence register.",
          "Use slicers for economic_segment, geography_label, opportunity_class, data_confidence, and scenario_name.",
        ]),
      ],
      ["Evidence", bullets(classRows.length ? classRows : ["Opportunity class breakdown is unavailable in the cached demo extract."])],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "CFS Economics is screening-level context, not an official appraisal, tax bill, fiscal impact study, or approval recommendation.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: [
      "Portfolio Demo uses a cached demo extract.",
      "Dashboard visuals use bands and counts, not internal model values.",
    ],
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["underbuilt_candidates", "tax_base_opportunity", "data_needed"],
      recommended_layers: ["Economic Dashboard", "Power BI & Tools"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Opportunity class breakdown",
        classRows.join("; ") || "No opportunity class rows are available.",
        "public/demo-data/economics_intelligence.json",
        classRows.length ? "available" : "limited",
      ),
    ],
    provider: "none",
    related_layers: ["Economic Dashboard", "Power BI Desktop Practice Pack"],
    suggested_actions: [
      "Filter by opportunity class or data confidence first.",
      "Open Power BI recipe expanders on each visual for table/field mapping.",
      "Use Power BI & Tools when ready to export CSV tables.",
    ],
  };
}

function demoEconomicsWalkthroughAnswer(asOf: string | null): CfsAiSearchResponse {
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "Walk through CFS Economics in four screens: Overview, Power BI & Tools, Economic Dashboard, then Print. The portfolio demo uses a sanitized cached demo extract; local live mode uses the FastAPI backend and local PostGIS economics data.",
      ],
      [
        "Recommended sequence",
        bullets([
          "1. Overview - explain what CFS Economics is and how local live data differs from the portfolio demo cached demo extract.",
          "2. Power BI & Tools - review economic tables, select useful rows, download CSV/JSON exports, and open scenario, planning-model, or decision-pack workflows.",
          "3. Economic Dashboard - monitor KPIs, watchlists, charts, data confidence, and Ask CFS Economics.",
          "4. Print - create a simple economic snapshot for presentation or review.",
        ]),
      ],
      [
        "Why it matters",
        "This flow shows how parcel economics, permit activity, constraints, scenario logic, Power BI-ready tables, planning model schema, decision packs, and data confidence fit into one screening-level decision-support platform.",
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "CFS Economics is screening-level context, not an official appraisal, tax bill, fiscal impact study, or approval recommendation.",
        ]),
      ],
    ),
    as_of: asOf ?? "",
    caveats: [
      "Portfolio Demo uses a cached demo extract.",
      "Local live mode uses the FastAPI backend and local PostGIS economics data.",
    ],
    dashboard_actions: {
      focus_domain: "economics",
      recommended_layers: ["Overview", "Power BI & Tools", "Economic Dashboard", "Print"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "CFS Economics workflow",
        "Overview -> Power BI & Tools -> Economic Dashboard -> Print.",
        "public/demo-data/economics_intelligence.json",
        "available",
      ),
    ],
    provider: "none",
    related_layers: ["Overview", "Power BI & Tools", "Economic Dashboard", "Print"],
    suggested_actions: [
      "Start in Overview, then select rows in Power BI & Tools.",
      "Use Power BI & Tools for Power BI exports, scenario outputs, planning model schema, and decision-pack previews.",
      "Use Print for the final presentation snapshot.",
    ],
  };
}

function isEconomicsPowerBiQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "power bi",
    "csv",
    "text/csv",
    "import order",
    "semantic model",
    "facts and dimensions",
    "fact and dimension",
    "fact table",
    "dimension table",
    "dax",
    "page 1",
    "relationships",
    "qa",
    "quality check",
    "check after importing",
    "slicers blank",
    "slicer blank",
    "relationships correct",
    "connect every table",
    "scenario planning page",
    "data confidence register",
    "report pages",
    "visuals",
    "chart",
    "pie",
    "donut",
    "bar",
    "matrix",
    "build your own chart",
    "dashboard visual",
    "report canvas",
    "canvas recipe",
    "report bucket",
    "bucket items",
    "add it to the bucket",
    "add this answer to the report bucket",
    "report plan",
    "report planner",
    "generate report",
    "generate visuals",
    "underbuilt dashboard",
    "fiscal burden report",
    "scenario comparison",
    "scenario comparison dashboard",
    "special asset",
    "special assets report",
    "first slicer",
    "sort order",
    "sort opportunity",
    "opportunity class sort",
    "filter special assets",
    "special asset filter",
  ].some((term) => normalized.includes(term));
}

function isEconomicsWorkspaceQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "which rows should i select",
    "what does this table mean",
    "underbuilt candidates need review",
    "rows should go to enterprise workspace",
    "where did workspace go",
    "what is power bi & tools",
    "selected rows in power bi",
    "use selected rows",
    "send rows to print",
    "what should i send to print",
    "which rows should i send",
    "send to enterprise workspace",
    "data confidence weak",
  ].some((term) => normalized.includes(term));
}

function demoEconomicsWorkspaceAnswer(
  economics: EconomicsIntelligenceResponse,
): CfsAiSearchResponse {
  const summary = economics.summary;
  const underbuilt = economics.underbuilt_watchlist.slice(0, 3);
  const weakConfidence = economics.parcel_economic_signals
    .filter((signal) =>
      ["data_needed", "proxy"].includes(signal.economic_data_confidence),
    )
    .slice(0, 3);

  return {
    answer: briefing(
      [
        "Executive takeaway",
        `Use Power BI & Tools as the screening queue. The cached demo extract has ${format(summary.total_parcels_analyzed)} parcels, ${format(summary.underbuilt_candidate_count)} underbuilt candidates, and ${format(summary.high_opportunity_count)} opportunity signals; select rows that need Power BI, scenario, decision-pack, or printable snapshot work.`,
      ],
      [
        "Rows to select first",
        bullets(
          underbuilt.length
            ? underbuilt.map((signal) => `${signal.geography_label ?? signal.parcel_id}: ${signal.opportunity_class}; ${signal.recommended_followup}`)
            : ["Underbuilt watch rows are not available in the cached demo extract."],
        ),
      ],
      [
        "How to use the table",
        bullets([
          "Prioritize underbuilt or tax-base opportunity rows with medium-or-better confidence.",
          "Use selected rows in the Power BI Export, Scenario Model, Planning Model, or Decision Pack tools.",
          "Send rows to Print when they are ready for a short economic snapshot with caveats and next diligence.",
        ]),
      ],
      [
        "Data confidence weak spots",
        bullets(
          weakConfidence.length
            ? weakConfidence.map((signal) => `${signal.geography_label ?? signal.parcel_id}: ${signal.economic_data_confidence}; verify value, acreage, constraint, or service context before recommendation.`)
            : ["No weak-confidence rows are visible in the current cached extract."],
        ),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "Power BI & Tools rows are screening-level economics, not an official appraisal, tax bill, fiscal impact study, or approval recommendation.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: economics.caveats,
    dashboard_actions: {
      filter_watchlist: { domain: "economics", status: "underbuilt_watch" },
      focus_domain: "economics",
      highlight_kpis: ["underbuilt_candidates", "tax_base_opportunity", "data_needed"],
      recommended_layers: ["Power BI & Tools", "Print"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Power BI & Tools screening rows",
        `${format(summary.underbuilt_candidate_count)} underbuilt candidates; ${format(summary.high_opportunity_count)} opportunity signals; ${format(summary.data_needed_count)} data-needed rows.`,
        "public/demo-data/economics_intelligence.json",
        "available",
      ),
    ],
    provider: "none",
    related_layers: ["Power BI & Tools", "Print"],
    suggested_actions: [
      "Select high-priority underbuilt or tax-base opportunity rows.",
      "Use selected rows in Power BI Export, Scenario Model, Planning Model, or Decision Pack.",
      "Send presentation-ready rows to Print.",
      "Check data-needed rows before making a recommendation.",
    ],
  };
}

function isEconomicsPrintQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "snapshot summary",
    "print snapshot",
    "economic snapshot",
    "caveats should i include",
    "what should go in the print snapshot",
    "frame the decision memo",
    "copy decision memo",
    "executive takeaway",
    "explain selected rows",
    "next diligence should i list",
    "present selected rows",
    "present this to a reviewer",
  ].some((term) => normalized.includes(term));
}

function demoEconomicsPrintAnswer(
  economics: EconomicsIntelligenceResponse,
): CfsAiSearchResponse {
  const summary = economics.summary;
  const scenario = economics.scenario_outputs[0];
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "Use the Print page as the final screening-level economic snapshot after Power BI & Tools selection, dashboard review, and scenario/model setup.",
      ],
      [
        "Snapshot sections",
        bullets([
          "Executive Takeaway.",
          "Selected Rows / Scope.",
          "Economic Baseline.",
          "Opportunity & Segment Summary.",
          "Fiscal / Service Burden Context.",
          "Scenario Summary.",
          "Data Confidence.",
          "Evidence Pack.",
          "Recommended Next Diligence.",
          "Caveats & Assumptions.",
          "Power BI / Export Notes.",
        ]),
      ],
      [
        "Decision memo",
        "Frame the memo around economic upside, public burden risk, data confidence, recommended next diligence, and caveats. Use Copy Decision Memo when selected rows are ready for a concise briefing.",
      ],
      [
        "Evidence to include",
        bullets([
          `${format(summary.total_parcels_analyzed)} parcels or areas analyzed.`,
          `${format(summary.underbuilt_candidate_count)} underbuilt candidates.`,
          `${format(summary.high_opportunity_count)} tax-base opportunity signals.`,
          scenario ? `${scenario.title}: tax-base lift ${scenario.estimated_tax_base_lift_band}; confidence ${scenario.data_confidence}.` : "Scenario output bands are not available.",
        ]),
      ],
      [
        "Next diligence",
        bullets([
          "Verify missing parcel/tax fields.",
          "Compare selected rows with permit activity.",
          "Review floodplain and service burden context.",
          "Check utility readiness and transportation context.",
          "Export CSVs to Power BI if preparing an external report.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "This is screening-level economics, not an official appraisal, tax bill, fiscal impact study, or approval recommendation.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: economics.caveats,
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["underbuilt_candidates", "tax_base_opportunity", "data_needed"],
      recommended_layers: ["Print", "Power BI & Tools"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Economic snapshot context",
        `${format(summary.total_parcels_analyzed)} parcels; ${format(summary.underbuilt_candidate_count)} underbuilt candidates; ${format(summary.high_opportunity_count)} opportunity signals.`,
        "public/demo-data/economics_intelligence.json",
        "available",
      ),
    ],
    provider: "none",
    related_layers: ["Print", "Power BI & Tools"],
    suggested_actions: [
      "Send selected rows from Power BI & Tools to Print.",
      "Use Print / Save as PDF for the browser-generated report.",
      "Copy the Executive Summary or Decision Memo for a memo or slide.",
      "Keep Power BI / Export Notes visible.",
    ],
  };
}

function demoEconomicsPowerBiAnswer(
  pack: EconomicsPowerBiExportResponse,
  query = "",
): CfsAiSearchResponse {
  const powerbiActions = demoPowerBiActionsForQuery(query);
  if (isPowerBiReportCommand(query)) {
    const title = powerbiActions.report_title ?? "Power BI report";
    return {
      answer: briefing(
        [
          "Generated report preview",
          `I generated a ${title} preview below. Review the visuals and tables, then save it to the Report Bucket when ready.`,
        ],
        [
          "Next step",
          "Use Save Report to Bucket, or Send Report to Print if the preview is ready for the snapshot.",
        ],
      ),
      as_of: pack.as_of,
      caveats: pack.caveats,
      dashboard_actions: {
        focus_domain: "economics",
        highlight_kpis: ["tax_base_opportunity", "data_readiness"],
        recommended_layers: ["Power BI & Tools", "Print"],
      },
      data_mode: "demo",
      domains: ["economics"],
      evidence: [
        evidence(
          "Power BI export pack",
          "CFS uses sanitized Power BI-ready economics tables for generated report previews.",
          "public/demo-data/economics_powerbi_export.json",
        ),
      ],
      powerbi_actions: powerbiActions,
      provider: "none",
      related_layers: ["Power BI & Tools", "Print"],
      suggested_actions: [
        "Review the generated report preview.",
        "Toggle summary, KPI, visual, table, caveat, and Power BI detail sections.",
        "Save the full generated report to the Report Bucket.",
      ],
    };
  }
  const tableNames = Object.keys(pack.tables);
  const relationshipLines = pack.relationships.map(
    (row) => `${row.from_table}.${row.from_column} -> ${row.to_table}.${row.to_column}`,
  );
  const guide = pack.report_builder_guide;
  const pageLines =
    guide?.pages.map(
      (page) =>
        `${page.page}: ${page.visuals.map((visual) => String(visual.title)).join(", ")}`,
    ) ?? pack.suggested_visuals.map((page) => `${page.page}: ${page.visuals.join("; ")}`);
  const measureLines =
    guide?.suggested_measures.map((measure) => measure.expression) ?? [
      "Total Signals = COUNTROWS(parcel_economic_signal_fact)",
    ];
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "Use the cached Power BI Desktop Practice Pack as a manual BI workflow: import the JSON tables, build relationships, then create an executive economics report. This is not Power BI Embedded and does not require credentials.",
      ],
      ["Tables to load", bullets(tableNames)],
      [
        "CSV or JSON",
        "Use CSV first for Power BI Desktop practice because each table imports like a normal BI source. Use the JSON pack later for app-to-app integration or semantic-model automation.",
      ],
      [
        "Relationships to build",
        bullets(relationshipLines.length ? relationshipLines : ["Relationship notes are not available in the cached demo export."]),
      ],
      [
        "Do not connect every table",
        "Start with the scenario and geography relationships. Keep summary-level tables disconnected until a visual needs them, because forcing unrelated summary tables into the model can create misleading blanks or filters.",
      ],
      [
        "Report pages to create",
        bullets(pageLines),
      ],
      [
        "Which table powers what",
        bullets([
          "Executive dashboard: economics_kpi_fact and parcel_economic_signal_fact.",
          "Parcel investment screen: parcel_economic_signal_fact and geography_dim.",
          "Scenario Model page: scenario_output_fact and scenario_dim.",
          "Data confidence register: domain_readiness_dim.",
        ]),
      ],
      [
        "AI Power BI Report Builder",
        bullets([
          "Type a request such as Build a report for underbuilt redevelopment candidates.",
          "CFS generates recommended tables, starter relationships, visuals, canvas recipes, and copyable build steps from the cached export fields.",
          "Use Add Visuals to Report Canvas when the plan looks right.",
          "Download the generated report plan JSON if you want a portable report recipe.",
        ]),
      ],
      [
        "Build Your Own Chart",
        bullets([
          "Opportunity class: use parcel_economic_signal_fact, bar or donut, category opportunity_class, values count of signal_id.",
          "Economic segment mix: use parcel_economic_signal_fact, donut or bar, category economic_segment, values count of signal_id.",
          "Scenario chart: use scenario_output_fact, bar or matrix, category scenario_name, values fiscal_attractiveness_band or service_burden_band.",
          "Data confidence matrix: use domain_readiness_dim, rows domain_name, values data_status, current_use, and next_data_need.",
          "Crowded pie charts: switch to a bar chart when there are more than six categories.",
        ]),
      ],
      [
        "Power BI Report Canvas",
        bullets([
          "Preview a chart in Build Your Own Chart, then add it to the Report Canvas.",
          "Keep Page 1 simple: KPI cards, opportunity class, segment mix, and one scenario or data-confidence visual.",
          "Copy the report recipe when you are ready to recreate the page in Power BI Desktop.",
        ]),
      ],
      [
        "Report Bucket",
        bullets([
          "Add useful chart recipes, report plans, Ask CFS answers, decision notes, or QA checklists to the Report Bucket.",
          "Toggle which bucket items should appear in Print.",
          "Use Send Bucket to Print when the draft report outline is ready for a snapshot.",
        ]),
      ],
      [
        "Sort and slicer fields",
        bullets([
          "Use economic_segment as the first slicer so value-per-acre visuals compare similar property segments.",
          "Sort opportunity_class visuals by opportunity_class_order.",
          "Sort band visuals by band_order.",
          "Use special_asset_flag to filter or isolate airports, civic/institutional assets, utilities, venues, and other non-comparable records.",
          "Use display_label for readable tables and row_id as the stable row key.",
        ]),
      ],
      [
        "Suggested measures",
        bullets(measureLines),
      ],
      [
        "Quality checks",
        bullets(powerBiImportQaChecklist),
      ],
      [
        "Blank slicer checks",
        "If slicers show blanks, confirm the related key exists on both sides before connecting more tables. Start with scenario_output_fact.scenario_id -> scenario_dim.scenario_id and parcel_economic_signal_fact.geography_label -> geography_dim.geography_label; leave unrelated summary tables disconnected.",
      ],
      [
        "Next steps",
        bullets([
          "Download economics_powerbi_export.json from Power BI & Tools.",
          "For the beginner path, download the CSV files from Flat CSV Tables and import them with Get Data -> Text/CSV.",
          "Open Power BI Desktop and use Get Data -> JSON.",
          "Load facts and dimensions, then create KPI cards, charts, slicers, and matrices from the suggested layout.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "No embedded report, Azure registration, tenant, workspace, report, client, or embed credentials are connected.",
          "Tables exclude contact fields, credential fields, model internals, and probability-style outputs.",
        ]),
      ],
    ),
    as_of: pack.as_of,
    caveats: pack.caveats,
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["tax_base_opportunity", "data_readiness"],
      recommended_layers: ["Power BI Desktop Practice Pack", "Power BI & Tools"],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Power BI export pack",
        `${tableNames.length} tables and ${pack.relationships.length} relationships in cached demo export.`,
        "public/demo-data/economics_powerbi_export.json",
        tableNames.length ? "available" : "limited",
      ),
    ],
    provider: "none",
    powerbi_actions: powerbiActions,
    related_layers: ["Power BI Desktop Practice Pack", "Power BI & Tools"],
    suggested_actions: [
      "Open Economic Intelligence -> Power BI & Tools.",
      "Use Flat CSV Tables first if you are learning Power BI Desktop.",
      "Use Build Your Own Chart to pick a table, visual, category, measure, and optional filter.",
      "Add useful previews to the Power BI Report Canvas, then copy the report recipe.",
      "Preview or download the Power BI JSON Pack.",
      "Build the suggested relationships before creating report visuals.",
      "Use the Power BI Report Builder Guide for page-by-page visual instructions.",
    ],
  };
}

function demoPowerBiActionsForQuery(query: string): CfsAiPowerBiActions {
  const normalized = query.toLowerCase();
  const visual = (
    pageName: string,
    visualTitle: string,
    visualType: "bar" | "donut" | "matrix",
    sourceTable: string,
    categoryField: string,
    valueField: string,
    options: {
      aggregation?: "count" | "sum";
      caveat?: string;
      filterField?: string;
      filterValue?: string;
    } = {},
  ) => {
    const aggregation = options.aggregation ?? "count";
    const filterText = options.filterField && options.filterValue && options.filterValue !== "All"
      ? `; filter ${options.filterField} = ${options.filterValue}`
      : "";
    return {
      aggregation,
      category_field: categoryField,
      caveat: options.caveat ?? "Screening-level economics; keep caveats visible.",
      filter_field: options.filterField ?? "",
      filter_value: options.filterValue ?? "All",
      page_name: pageName,
      powerbi_recipe: `${visualTitle}: ${visualType}; table ${sourceTable}; axis ${categoryField}; values ${aggregation} ${valueField}${filterText}.`,
      source_table: sourceTable,
      value_field: valueField,
      visual_title: visualTitle,
      visual_type: visualType,
    };
  };
  let reportTitle = "Executive Economic Dashboard";
  let reportSummary = "CFS configured a Power BI-style report plan from your prompt.";
  let selectedFilters: CfsAiPowerBiActions["selected_filters"] = {};
  let reportCanvasItems: NonNullable<CfsAiPowerBiActions["report_canvas_items"]>;

  if (normalized.includes("underbuilt") || normalized.includes("redevelopment")) {
    reportTitle = "Underbuilt Redevelopment Candidate Dashboard";
    reportSummary = "Focus on underbuilt rows, segment mix, and follow-up actions.";
    selectedFilters = { opportunity_class: "Underbuilt Redevelopment Candidate" };
    reportCanvasItems = [
      visual("Executive Economic Dashboard", "Underbuilt candidate count", "bar", "parcel_economic_signal_fact", "opportunity_class", "signal_id", { filterField: "opportunity_class", filterValue: "Underbuilt Redevelopment Candidate" }),
      visual("Parcel Investment Screen", "Underbuilt candidates by segment", "donut", "parcel_economic_signal_fact", "economic_segment", "signal_id", { filterField: "opportunity_class", filterValue: "Underbuilt Redevelopment Candidate" }),
      visual("Parcel Investment Screen", "Top underbuilt rows", "matrix", "parcel_economic_signal_fact", "geography_label", "recommended_followup", { filterField: "opportunity_class", filterValue: "Underbuilt Redevelopment Candidate" }),
    ];
  } else if (normalized.includes("scenario")) {
    reportTitle = "Scenario Comparison Dashboard";
    reportSummary = "Compare scenario output bands and burden context.";
    reportCanvasItems = [
      visual("Scenario Planning Model", "Scenario fiscal attractiveness", "bar", "scenario_output_fact", "scenario_name", "fiscal_attractiveness_band"),
      visual("Scenario Planning Model", "Scenario burden matrix", "matrix", "scenario_output_fact", "scenario_name", "service_burden_band"),
    ];
  } else if (normalized.includes("special asset")) {
    reportTitle = "Special Assets Review Page";
    reportSummary = "Isolate non-comparable assets before interpreting value-per-acre context.";
    selectedFilters = { opportunity_class: "Special Asset / Compare With Caution" };
    reportCanvasItems = [
      visual("Special Assets", "Special asset flag mix", "donut", "parcel_economic_signal_fact", "special_asset_flag", "signal_id"),
      visual("Special Assets", "Special asset review table", "matrix", "parcel_economic_signal_fact", "geography_label", "segment_caveat", { caveat: "Special assets should be compared separately.", filterField: "special_asset_flag", filterValue: "true" }),
    ];
  } else if (normalized.includes("confidence") || normalized.includes("data")) {
    reportTitle = "Data Confidence Matrix";
    reportSummary = "Show readiness and next data needs before report interpretation.";
    reportCanvasItems = [
      visual("Data Confidence Register", "Domain readiness matrix", "matrix", "domain_readiness_dim", "domain_name", "data_status"),
      visual("Data Confidence Register", "Parcel signal confidence", "donut", "parcel_economic_signal_fact", "data_confidence", "signal_id"),
    ];
  } else if (normalized.includes("burden") || normalized.includes("fiscal")) {
    reportTitle = "Fiscal and Service Burden Report";
    reportSummary = "Compare fiscal attractiveness against burden and public cost bands.";
    reportCanvasItems = [
      visual("Fiscal Burden Review", "Fiscal attractiveness bands", "bar", "parcel_economic_signal_fact", "fiscal_attractiveness_band", "signal_id"),
      visual("Fiscal Burden Review", "Opportunity vs public cost risk", "matrix", "parcel_economic_signal_fact", "opportunity_class", "public_cost_risk_band"),
      visual("Scenario Planning Model", "Scenario service burden", "matrix", "scenario_output_fact", "scenario_name", "service_burden_band"),
    ];
  } else if (normalized.includes("segment") || normalized.includes("value per acre")) {
    reportTitle = "Economic Segment Comparison Report";
    reportSummary = "Compare value-per-acre context within similar economic segments.";
    reportCanvasItems = [
      visual("Segment-Aware Economics", "Economic segment mix", "bar", "parcel_economic_signal_fact", "economic_segment", "signal_id", { caveat: "Compare value per acre within segment." }),
      visual("Segment-Aware Economics", "Value per acre bands within segment", "bar", "parcel_economic_signal_fact", "value_per_acre_band", "signal_id", { filterField: "economic_segment" }),
    ];
  } else if (normalized.includes("opportunity class") || normalized.includes("opportunity classes") || normalized.includes("pie") || normalized.includes("donut")) {
    reportTitle = "Opportunity Class Chart";
    reportSummary = "Build a compact opportunity class visual from parcel economics rows.";
    reportCanvasItems = [
      visual("Executive Economic Dashboard", "Opportunity class breakdown", "donut", "parcel_economic_signal_fact", "opportunity_class", "signal_id"),
    ];
  } else {
    reportCanvasItems = [
      visual("Executive Economic Dashboard", "Executive KPI cards", "bar", "economics_kpi_fact", "kpi_name", "value", { aggregation: "sum" }),
      visual("Executive Economic Dashboard", "Opportunity class breakdown", "bar", "parcel_economic_signal_fact", "opportunity_class", "signal_id"),
      visual("Executive Economic Dashboard", "Economic segment mix", "donut", "parcel_economic_signal_fact", "economic_segment", "signal_id"),
      visual("Scenario Planning Model", "Scenario output comparison", "matrix", "scenario_output_fact", "scenario_name", "fiscal_attractiveness_band"),
      visual("Data Confidence Register", "Data readiness matrix", "matrix", "domain_readiness_dim", "domain_name", "data_status"),
    ];
  }

  const first = reportCanvasItems[0];
  return {
    action_type: reportCanvasItems.length === 1 ? "build_chart" : "build_report",
    chart_builder_config: {
      aggregation: first.aggregation === "sum" ? "sum" : "count",
      category_field: first.category_field,
      chart_type: first.visual_type,
      filter_field: first.filter_field,
      filter_value: first.filter_value,
      table_name: first.source_table,
      title: first.visual_title,
      value_field: first.value_field,
    },
    powerbi_build_steps: [
      "Download CSV tables from Power BI & Tools.",
      "Import the recommended fact and dimension tables into Power BI Desktop.",
      "Create the starter scenario and geography relationships.",
      "Build the generated visuals and keep caveat text visible.",
    ],
    report_canvas_items: reportCanvasItems,
    report_summary: reportSummary,
    report_title: reportTitle,
    selected_filters: selectedFilters,
    selected_tool: "powerbi_export",
  };
}

function isPowerBiReportCommand(query: string) {
  const normalized = query.toLowerCase();
  return [
    "build ",
    "build me ",
    "create ",
    "generate ",
    "make ",
    "show special assets",
  ].some((prefix) => normalized.startsWith(prefix));
}

const powerBiImportQaChecklist = [
  "All 7 CSV tables downloaded.",
  "Headers are present in each CSV.",
  "No contact fields imported.",
  "No internal model values imported.",
  "No tax bill fields imported.",
  "scenario_id exists in scenario_output_fact.",
  "scenario_id exists in scenario_dim.",
  "geography_label exists in parcel_economic_signal_fact.",
  "geography_label exists in geography_dim.",
  "Relationships are created in Power BI.",
  "Report caveats are visible.",
  "Slicers are checked for blank or missing values.",
];

function isEconomicsScenarioQuery(query: string) {
  const normalized = query.toLowerCase();
  return [
    "scenario",
    "residential",
    "industrial",
    "decision memo",
    "assumption",
    "public burden",
    "fiscal impact",
    "confidence weak",
  ].some((term) => normalized.includes(term));
}

function demoEconomicsScenarioAnswer(
  economics: EconomicsIntelligenceResponse,
): CfsAiSearchResponse {
  const scenarios = economics.scenario_outputs.slice(0, 4);
  const assumptions = economics.scenario_inputs
    .slice(0, 5)
    .map((row) => `${row.assumption}: ${row.current_value} (${row.data_confidence})`);
  const outputLines = scenarios.map(
    (row) =>
      `${row.title}: tax-base lift ${row.estimated_tax_base_lift_band}; service burden ${row.service_burden_band}; confidence ${row.data_confidence}.`,
  );
  return {
    answer: briefing(
      [
        "Executive takeaway",
        "CFS Economics treats scenarios as a screening-level planning model: assumptions go in, output bands come out, and the decision memo explains what needs deeper review before anyone uses the result for fiscal or infrastructure decisions.",
      ],
      [
        "Scenario interpretation",
        bullets(
          outputLines.length
            ? outputLines
            : ["Scenario output bands are not available in the cached demo extract."],
        ),
      ],
      [
        "Fiscal / service burden tradeoff",
        "Residential scenarios usually need closer school and service-burden review. Industrial or employment scenarios emphasize non-residential tax-base context, road access, utility readiness, and environmental constraints. Targeted infrastructure scenarios can improve readiness, but they need explicit public cost assumptions.",
      ],
      [
        "Assumption sensitivity",
        bullets(
          assumptions.length
            ? assumptions
            : [
                "Intensity band, value-per-acre band, school/service burden, utility readiness, transportation access, and flood/environmental constraint level drive the output bands.",
              ],
        ),
      ],
      [
        "Recommended next diligence",
        bullets([
          "Use Scenario Model to compare Current Conditions against Residential Growth, Industrial / Employment, and Infrastructure-Constrained Growth.",
          "Check the Evidence Pack for missing utility, school, transportation, and flood/environmental data.",
          "Use the Decision Memo as a briefing draft, not as a formal fiscal finding.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Portfolio Demo uses a cached demo extract.",
          "Screening-level scenario only; not a formal fiscal impact study.",
          "Not a formal appraisal or tax bill.",
          "Scenario output depends on assumptions.",
          "Utility, school, transportation, and environmental cost data may be incomplete.",
        ]),
      ],
    ),
    as_of: economics.as_of,
    caveats: [
      "Portfolio Demo uses a cached demo extract.",
      "Scenario outputs are screening-level bands, not a formal fiscal impact study.",
      "Scenario values depend on assumptions.",
    ],
    dashboard_actions: {
      focus_domain: "economics",
      highlight_kpis: ["tax_base_opportunity", "data_readiness"],
      recommended_layers: [
        "Economic Scenario Model",
        "Revenue per Acre Dashboard",
        "Constraint-Adjusted Development Potential",
      ],
    },
    data_mode: "demo",
    domains: ["economics"],
    evidence: [
      evidence(
        "Scenario outputs",
        outputLines.join("; ") || "Scenario output bands are unavailable.",
        "public/demo-data/economics_intelligence.json",
        outputLines.length ? "available" : "limited",
      ),
      evidence(
        "Scenario assumptions",
        assumptions.join("; ") || "Scenario assumptions are unavailable.",
        "public/demo-data/economics_intelligence.json",
        assumptions.length ? "available" : "limited",
      ),
    ],
    provider: "none",
    related_layers: [
      "Economic Scenario Model",
      "Revenue per Acre Dashboard",
      "Constraint-Adjusted Development Potential",
    ],
    suggested_actions: [
      "Open Economic Intelligence -> Scenario Model.",
      "Adjust intensity, value-per-acre, service burden, utility readiness, transportation, and flood/environmental assumptions.",
      "Review the generated Decision Memo and Evidence Pack before presenting scenario takeaways.",
    ],
  };
}

function demoSelectedSignalAnswer(
  context: DemoAiContext,
  domains: CfsAiDomain[],
  signal: CfsAiSelectedSignal,
) {
  const activeDomains = domains.length ? domains : selectedSignalDemoDomains(signal);
  const evidenceItems = signal.evidence?.slice(0, 4) ?? [];
  const layers = signal.related_layers?.slice(0, 4) ?? relatedLayers(activeDomains);
  const [meaning, whyItMatters, caveat] = selectedSignalMeaning(signal.domain);
  const response = baseDemoResponse(
    briefing(
      ["What this signal means", `${signal.title}: ${meaning} Current status band: ${signal.status_band ?? "review signal"}.`],
      ["Evidence", bullets(evidenceItems.length ? evidenceItems : ["Evidence is limited in this cached demo item."])],
      ["Why it matters", whyItMatters],
      ["What to inspect next", bullets(layers.length ? layers : ["Operational Watchlist", "Methodology"])],
      ["Caveats", caveat],
    ),
    activeDomains,
    context.manifest.generated_at,
    [
      evidence(
        signal.title,
        evidenceItems.join("; ") || "Cached demo signal evidence is limited.",
        `selected_signal.${signal.id}`,
        evidenceItems.length ? "available" : "limited",
      ),
    ],
    [
      `Review ${signal.title} in the Indicator Center dashboard.`,
      "Compare the signal with recommended Explore Countywide layers.",
      "Review Methodology before using this as decision support.",
    ],
  );
  response.dashboard_actions = selectedSignalDashboardActions(signal, activeDomains);
  response.related_layers = Array.from(new Set([...response.related_layers, ...layers])).slice(0, 6);
  return response;
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
        `Based on the cached demo extract, CFS analyzed ${format(detail?.total_records ?? stats.total_permits)} observed permit records across ${format(detail?.active_parcels ?? stats.parcels_with_activity)} active parcels. Permit activity remains a broad planning workload signal, with the strongest available drivers tied to new construction, residential growth, remodeling, and additions where those fields are exposed. ${recentChangeText(detail)} This is observed permit activity, not a prediction.`,
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
        "What changed",
        `${recentChangeText(detail)} Use this change as a workload and coordination indicator, not as evidence that construction was completed.`,
      ],
      [
        "What is driving activity",
        `Top permit types are ${topTypes || "not available"}, and top permit segments are ${topSegments || "not available"}. New construction usually points to direct growth pressure; remodel and addition categories can signal reinvestment or smaller-scale residential change; other categories may include administrative or mixed records.`,
      ],
      [
        "Why it matters",
        "Use this as a review workload signal. Compare active permit areas with school pressure, floodplain review, utility readiness, transportation context, and zoning/land-use context.",
      ],
      [
        "What to inspect next",
        bullets([
          "Development Hotspots by permit segment and year range.",
          "School Utilization + Permit Pressure for attendance-area overlap.",
          "Floodplain Review, Utility Readiness, and Transportation Context around active areas.",
        ]),
      ],
      [
        "Caveats",
        bullets([
          "Observed permit records are not completed construction.",
          "Permit categories can include administrative or noisy source records.",
          "This is not a prediction or official determination.",
          "Field availability affects type, segment, and geography interpretation.",
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
  add("economics", [
    "economic",
    "economics",
    "tax",
    "value",
    "acre",
    "underbuilt",
    "redevelopment",
    "tax-base",
    "improvement-to-land",
    "more data before recommendation",
    "fiscal",
    "scenario",
    "power bi",
    "planning analytics",
    "tm1",
    "planning model",
    "measures",
    "dimensions",
    "decision pack",
    "dataset",
  ]);
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

const followUpTerms = [
  "those",
  "that",
  "them",
  "which ones",
  "what about",
  "what layers",
  "which layers",
  "inspect next",
  "why",
  "show me more",
  "explain more",
];

function resolveDemoDomains(request: CfsAiSearchRequest): CfsAiDomain[] {
  if (request.selected_signal) {
    return selectedSignalDemoDomains(request.selected_signal);
  }

  const domains = classifyDemoDomains(request.query);
  const previous = previousDemoDomains(request.conversation_context ?? []);
  const isFollowUp = followUpTerms.some((term) =>
    request.query.toLowerCase().includes(term),
  );

  if (isFollowUp && domains[0] === "general" && previous.length) {
    return previous.slice(0, 3);
  }

  return isFollowUp
    ? Array.from(new Set([...domains, ...previous])).slice(0, 3)
    : domains;
}

function previousDemoDomains(turns: CfsAiConversationTurn[]): CfsAiDomain[] {
  const domains: CfsAiDomain[] = [];
  const allowed = new Set<CfsAiDomain>([
    "data_readiness",
    "economics",
    "flood",
    "model_lab",
    "permits",
    "schools",
    "transportation",
    "utilities",
    "zoning",
  ]);

  turns
    .slice(-5)
    .reverse()
    .forEach((turn) => {
      if (allowed.has(turn.focused_domain as CfsAiDomain)) {
        domains.push(turn.focused_domain as CfsAiDomain);
      }
      (turn.related_layers ?? []).forEach((layer) => {
        classifyDemoDomains(layer).forEach((domain) => {
          if (domain !== "general") domains.push(domain);
        });
      });
    });

  return Array.from(new Set(domains));
}

function selectedSignalDemoDomains(signal: CfsAiSelectedSignal): CfsAiDomain[] {
  const normalized = signal.domain.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const direct: Record<string, CfsAiDomain> = {
    data_readiness: "data_readiness",
    economics: "economics",
    development_activity: "permits",
    flood: "flood",
    floodplain_review: "flood",
    model_lab: "model_lab",
    model_research: "model_lab",
    permits: "permits",
    school_pressure: "schools",
    schools: "schools",
    transportation: "transportation",
    transportation_context: "transportation",
    utilities: "utilities",
    utility_readiness: "utilities",
    zoning: "zoning",
    zoning_land_use: "zoning",
  };
  return [direct[normalized] ?? classifyDemoDomains(signal.domain)[0] ?? "general"];
}

function selectedSignalMeaning(domain: string): [string, string, string] {
  const normalized = domain.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "development_activity" || normalized === "permits") {
    return [
      "Observed permit activity is showing where review workload or development attention may be concentrated.",
      "Permit activity helps staff compare growth signals against schools, floodplain review, utilities, transportation, and zoning context.",
      "Permit records are observed activity only; they are not predictions and do not confirm completed construction.",
    ];
  }
  if (normalized === "school_pressure" || normalized === "schools") {
    return [
      "This combines utilization context with observed permit activity inside attendance areas.",
      "Areas where utilization context and recent permits overlap may deserve planning review before stronger conclusions are made.",
      "This is not an official enrollment forecast and does not claim school capacity findings.",
    ];
  }
  if (normalized === "flood" || normalized === "floodplain_review") {
    return [
      "Floodplain Review flags mapped floodplain context that should be checked during planning review.",
      "Overlap with active areas can change what staff inspect before planning around a parcel or district.",
      "This is a planning screen, not a permitting determination.",
    ];
  }
  if (normalized === "utility_readiness" || normalized === "utilities") {
    return [
      "Utility readiness shows where CFS has only proxy context or where official capacity data is still needed.",
      "Missing service, committed capacity, and update-date fields limit infrastructure readiness conclusions.",
      "Proxy proximity does not confirm available capacity.",
    ];
  }
  if (normalized === "transportation" || normalized === "transportation_context") {
    return [
      "Transportation context highlights road, traffic, or project context that can affect planning coordination.",
      "Comparing corridor context with permit activity helps identify places that need transportation follow-up.",
      "Project status, funding, and timing can be incomplete in the current CFS context.",
    ];
  }
  if (normalized === "model_lab" || normalized === "model_research") {
    return [
      "Model Lab shows relative research signal only and remains internal research context.",
      "It can help prioritize questions, but source records and staff review remain the evidence base.",
      "No exact probabilities, raw model values, or official model classes are shown.",
    ];
  }
  return [
    "Data readiness identifies missing or incomplete source data that limits stronger analysis.",
    "These gaps tell staff what to request before turning exploratory signals into formal review support.",
    "CFS labels missing data instead of inventing values.",
  ];
}

function selectedSignalDashboardActions(
  signal: CfsAiSelectedSignal,
  domains: CfsAiDomain[],
): CfsAiDashboardActions {
  const actions = dashboardActionsForDomains(domains);
  return {
    ...actions,
    recommended_layers: Array.from(
      new Set([...(actions.recommended_layers ?? []), ...(signal.related_layers ?? [])]),
    ).slice(0, 6),
  };
}

function dashboardActionsForDomains(domains: CfsAiDomain[]): CfsAiDashboardActions {
  const primaryDomain = domains[0] ?? "general";
  const actions: Partial<Record<CfsAiDomain, CfsAiDashboardActions>> = {
    data_readiness: {
      filter_watchlist: { domain: "data_readiness", status: "data needed" },
      focus_domain: "data_readiness",
      highlight_kpis: ["data_readiness"],
      sort_watchlist_by: "data_gap",
    },
    economics: {
      focus_domain: "economics",
      highlight_kpis: ["underbuilt_candidates", "tax_base_opportunity"],
      recommended_layers: [
        "Revenue per Acre Dashboard",
        "Underbuilt Redevelopment Watchlist",
        "Fiscal Opportunity Score",
        "Constraint-Adjusted Development Potential",
      ],
      sort_watchlist_by: "severity",
    },
    flood: {
      focus_domain: "flood",
      highlight_kpis: ["floodplain_review"],
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
      recommended_layers: ["Model Lab Research Signals"],
    },
    permits: {
      focus_domain: "permits",
      highlight_kpis: ["observed_development_activity"],
      recommended_layers: ["Development Hotspots"],
      sort_watchlist_by: "recent_activity",
    },
    schools: {
      filter_watchlist: { domain: "schools", status: "elevated review" },
      focus_domain: "schools",
      highlight_kpis: ["school_pressure"],
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
    economics: [
      "Revenue per Acre Dashboard",
      "Underbuilt Redevelopment Watchlist",
      "Constraint-Adjusted Development Potential",
    ],
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
    .replace(/will\s+develop/gi, "shows observed permit activity")
    .replace(/raw\s+score/gi, "relative research signal")
    .replace(/official\s+prediction/gi, "planning review signal");
  const sanitized = JSON.parse(serialized) as CfsAiSearchResponse;
  return {
    ...sanitized,
    context_freshness: sanitized.context_freshness ?? "cached_demo_extract",
    data_source: sanitized.data_source ?? "portfolio_demo_extract",
  };
}

function format(value: unknown) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "not available";
}

function currency(value: unknown) {
  return typeof value === "number" ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "not available";
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

