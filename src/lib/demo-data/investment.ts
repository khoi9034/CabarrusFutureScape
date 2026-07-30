import { packageBackedConsultingCaseStudy } from "@/lib/consultingCaseStudyPackage";
import type {
  InvestmentAreaRadarResponse,
  InvestmentCaseStudy,
  InvestmentCaseStudyBriefResponse,
  InvestmentCaseStudyCandidate,
  InvestmentEngagement,
  InvestmentEngagementListResponse,
  InvestmentIntakeAnalysisResponse,
  InvestmentIntakeCandidate,
  InvestmentIntakeCompareResponse,
  InvestmentIntakeListResponse,
  InvestmentIntakePayload,
  InvestmentOpportunityListResponse,
  InvestmentOpportunityReference,
  InvestmentOpportunitySource,
  InvestmentRecentWorkItem,
  InvestmentRecentWorkResponse,
  InvestmentReportResponse,
  InvestmentResearchContext,
  InvestmentSavedItem,
  InvestmentSavedItemListResponse,
  InvestmentSavedSearch,
  InvestmentSavedSearchListResponse,
  InvestmentScreenCandidate,
  InvestmentScreenResponse,
  InvestmentStrategyId,
  InvestmentUnderwritingCalculation,
  InvestmentUnderwritingCompareResponse,
  InvestmentUnderwritingListResponse,
  InvestmentUnderwritingPrefillResponse,
  InvestmentUnderwritingScenario,
  InvestmentUnderwritingScenarioStatus,
  InvestmentUnderwritingScenarioType,
  InvestmentUnderwritingTemplate,
} from "@/types/api";

const DEMO_AS_OF = "2026-07-18T04:00:00Z";
const STORE_KEY = "cfs-investments-demo-session:v1";

type CaseCandidate = InvestmentCaseStudyCandidate & Record<string, unknown>;

type DemoSession = {
  intakeCandidates: InvestmentIntakeCandidate[];
  recentWork: InvestmentRecentWorkItem[];
  savedItems: InvestmentSavedItem[];
  savedSearches: InvestmentSavedSearch[];
  scenarios: InvestmentUnderwritingScenario[];
};

export function getDemoInvestmentScreen(strategy: InvestmentStrategyId): InvestmentScreenResponse {
  const candidates = getCaseCandidates(strategy);
  return {
    as_of: DEMO_AS_OF,
    candidate_count: candidates.length,
    candidates,
    caveats: [
      "Cached public-demo screening extract; no backend, database, or external account is required.",
      "Screening results are not investment advice, an appraisal, or a utility-capacity confirmation.",
    ],
    data_quality: {
      source: "CASE-1 sanitized package",
      funnel: packageBackedConsultingCaseStudy.funnel,
    },
    strategy,
    strategy_label: strategyLabel(strategy),
  };
}

export function getDemoInvestmentAreaRadar(strategy: InvestmentStrategyId): InvestmentAreaRadarResponse {
  const candidates = getCaseCandidates(strategy);
  return {
    areas: candidates.length
      ? [{
          area_classification: "Cached screening output",
          area_id: "case-1-large-development-land",
          area_name: "CASE-1 Large Development Land Search",
          candidate_count: candidates.length,
          data_confidence: "High demo confidence",
          external_search_links: [],
          major_cautions: [
            "Utility proximity does not confirm service availability or capacity.",
            "Access, title, water, sewer capacity, and field environmental conditions require verification.",
          ],
          missing_evidence: [
            "Seller asking basis",
            "Water and sewer capacity",
            "Legal access and title",
            "Professional wetland and geotechnical review",
          ],
          recommended_next_search_action: "Review the three canonical CASE-1 candidates before acquisition pricing.",
          strategy_label: strategyLabel(strategy),
          why_it_surfaced: [
            "Validated funnel: 110,017 -> 241 -> 241 -> 62 -> 10 -> 3.",
            "The public demo uses a sanitized cached extract rather than live parcel processing.",
          ],
        }]
      : [],
    caveats: ["Static portfolio-demo radar; no external listing feed is queried."],
    count: candidates.length ? 1 : 0,
    strategy,
    strategy_label: strategyLabel(strategy),
  };
}

export function getDemoInvestmentCaseStudies() {
  return {
    case_studies: [packageBackedConsultingCaseStudy],
    caveats: ["Package-backed portfolio demo case study."],
    count: 1,
  };
}

export function updateDemoInvestmentCaseStudy(slug: string, payload: { active_parcel_id?: string | null; analyst_note?: string | null; current_stage?: string | null; status?: string | null }): InvestmentCaseStudy {
  const caseStudy = { ...packageBackedConsultingCaseStudy };
  if (slug !== caseStudy.slug) throw new Error("Demo case study not found.");
  return {
    ...caseStudy,
    active_parcel_id: payload.active_parcel_id ?? caseStudy.active_parcel_id,
    current_stage: payload.current_stage ?? caseStudy.current_stage,
    status: payload.status ?? caseStudy.status,
    updated_at: DEMO_AS_OF,
    user_state: { ...caseStudy.user_state, analyst_note: payload.analyst_note ?? caseStudy.user_state.analyst_note },
  };
}

export function duplicateDemoInvestmentCaseStudy(slug: string): InvestmentCaseStudy {
  if (slug !== packageBackedConsultingCaseStudy.slug) throw new Error("Demo case study not found.");
  return {
    ...packageBackedConsultingCaseStudy,
    id: `${packageBackedConsultingCaseStudy.id}-session-copy`,
    slug: `${packageBackedConsultingCaseStudy.slug}-session-copy`,
    title: `${packageBackedConsultingCaseStudy.title} (Session Copy)`,
    user_state: { session_only: true },
  };
}

export function archiveDemoInvestmentCaseStudy(slug: string): InvestmentCaseStudy {
  return { ...updateDemoInvestmentCaseStudy(slug, {}), status: "Archived", updated_at: DEMO_AS_OF };
}

export function exportDemoInvestmentCaseStudyCodexBrief(slug: string): InvestmentCaseStudyBriefResponse {
  if (slug !== packageBackedConsultingCaseStudy.slug) throw new Error("Demo case study not found.");
  const markdown = `# ${packageBackedConsultingCaseStudy.title}

- Priority candidate: CFS-PARCEL-0149758869
- Funnel: 110,017 -> 241 -> 241 -> 62 -> 10 -> 3
- Recommendation: targeted diligence only; do not advance to acquisition pricing yet.
- Underwriting: no current scenario supports a positive land basis.`;
  return { brief: { source: "CASE-1 public demo package" }, caveats: ["Session-only generated markdown."], markdown };
}

export function getDemoInvestmentResearchContext(parcelId: string, strategy: InvestmentStrategyId): InvestmentResearchContext {
  const candidate = findCaseCandidate(parcelId);
  if (!candidate) throw new Error("Demo research context not found.");
  const market = candidate.market_context as Record<string, unknown> | undefined;
  return {
    brand: "CFS Investment",
    acquisition_basis: {
      asking_basis_summary: "Asking price unavailable; do not infer acquisition basis from demo data.",
    },
    comparable_context: { basis_context_band: "Insufficient Basis Information" },
    development_readiness: { development_activity_class: candidate.development_activity_class, review_band: candidate.review_band },
    economic_context: { screening_score: candidate.screening_score, residual_land_basis: "No positive scenario support" },
    environmental_context: toEnvironmentalContext(candidate),
    evidence_quality: { overall_data_confidence_band: candidate.data_confidence ?? "Needs Verification" },
    identity: {
      approximate_acreage: candidate.gross_acres ?? null,
      geography_label: packageBackedConsultingCaseStudy.geography,
      parcel_id: candidate.parcel_id,
      private_candidate_label: candidate.label ?? candidate.parcel_id,
    },
    limitations: ["Screening-level demo context only.", "Not investment advice or an appraisal."],
    market_area_context: {
      acs_year: market?.acs_year,
      data_confidence: market?.data_confidence ?? "Medium",
      geography_type: "Census tract proxy",
      growth_context: { band: market?.population_context ?? "Area context", summary: "Aggregate ACS context only." },
      household_context: { band: market?.household_context ?? "Area context", summary: "Aggregate ACS context only." },
      housing_context: {
        housing_unit_context_band: "Area context",
        occupancy_band: String(market?.housing_context ?? "Area context"),
        summary: "Aggregate ACS context only.",
        tenure_band: "Area context",
      },
      income_context: { band: market?.income_context ?? "Area context", summary: "Aggregate ACS context only." },
      limitations: (market?.limitations as string[] | undefined) ?? ["ACS does not prove parcel demand."],
      population_context: { band: market?.population_context ?? "Area context", summary: "Aggregate ACS context only." },
      source: String(market?.source ?? "U.S. Census Bureau ACS API cached extract"),
      source_attribution: "Cached public-demo extract",
    },
    missing_evidence: candidate.missing_information ?? candidate.missing_evidence ?? [],
    parcel_fundamentals: { gross_acres: candidate.gross_acres, developable_acres: candidate.preliminary_developable_acres },
    planning_context: { jurisdiction: candidate.jurisdiction, zoning_code: candidate.zoning_code, zoning_confidence: candidate.zoning_confidence },
    safe_summary: `${candidate.parcel_id} is a ${candidate.review_band ?? "screening"} candidate with score ${candidate.screening_score ?? "not scored"}.`,
    selected_strategy: strategy,
    source_registry: [{ name: "CASE-1 public demo package", limitation: "Sanitized cached extract." }],
    utility_context: { sewer_proxy_class: candidate.sewer_proxy_class, utility_readiness_proxy_class: candidate.utility_readiness_proxy_class },
    verification_requirements: candidate.missing_information ?? ["Verify planning, utility, access, title, and environmental conditions."],
  };
}

export function getDemoInvestmentIntake(): InvestmentIntakeListResponse {
  const candidates = session().intakeCandidates;
  return {
    candidates,
    caveats: ["Session-only demo opportunities; nothing is saved to a server."],
    count: candidates.length,
  };
}

export function createDemoInvestmentIntakeCandidate(payload: InvestmentIntakePayload): InvestmentIntakeAnalysisResponse {
  if (!payload.candidate_name.trim()) throw new Error("Candidate label is required.");
  const candidate = toIntakeCandidate(payload);
  mutate((state) => {
    state.intakeCandidates = [candidate, ...state.intakeCandidates.filter((item) => item.id !== candidate.id)].slice(0, 20);
  });
  return analyzeIntakeCandidate(candidate);
}

export function updateDemoInvestmentIntakeCandidate(candidateId: string, payload: Partial<InvestmentIntakePayload>): InvestmentIntakeAnalysisResponse {
  const current = session().intakeCandidates.find((item) => item.id === candidateId);
  if (!current) throw new Error("Demo intake candidate not found.");
  const next = { ...current, ...payload, id: candidateId, date_added: current.date_added, last_verified: DEMO_AS_OF } as InvestmentIntakeCandidate;
  mutate((state) => {
    state.intakeCandidates = state.intakeCandidates.map((item) => item.id === candidateId ? next : item);
  });
  return analyzeIntakeCandidate(next);
}

export function deleteDemoInvestmentIntakeCandidate(candidateId: string) {
  mutate((state) => {
    state.intakeCandidates = state.intakeCandidates.filter((item) => item.id !== candidateId);
  });
  return { deleted: true };
}

export function getDemoInvestmentIntakeAnalysis(candidateId: string): InvestmentIntakeAnalysisResponse {
  const candidate = session().intakeCandidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Demo intake candidate not found.");
  return analyzeIntakeCandidate(candidate);
}

export function compareDemoInvestmentIntakeCandidates(candidateIds: string[]): InvestmentIntakeCompareResponse {
  const intake_candidates = candidateIds.map(getDemoInvestmentIntakeAnalysis);
  return {
    caveats: ["Session-only comparison."],
    comparison_summary: ["Compare acreage, source confidence, constraint burden, and missing diligence before advancing."],
    intake_candidates,
    screening_comparison: null,
  };
}

export function importDemoInvestmentIntakeCsv(csvText: string) {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(1, 51);
  const created = lines.map((line, index) => {
    const [parcel_id, candidate_name, source_type, source_name, source_url] = line.split(",");
    return toIntakeCandidate({
      candidate_name: candidate_name || `Session demo opportunity ${index + 1}`,
      parcel_id: parcel_id || null,
      source_name: source_name || "CSV demo import",
      source_type: (source_type || "Manual Research") as InvestmentIntakePayload["source_type"],
      source_url: source_url || null,
      strategy: "development_land",
    });
  });
  mutate((state) => {
    state.intakeCandidates = [...created, ...state.intakeCandidates].slice(0, 20);
  });
  return { created, created_count: created.length, duplicates: [], errors: [], unmatched_parcel_ids: [] };
}

export function getDemoInvestmentOpportunities(): InvestmentOpportunityListResponse {
  const opportunities = session().intakeCandidates.map((candidate): InvestmentOpportunityReference => ({
    acreage: null,
    asking_price: candidate.asking_price ?? null,
    cfs_review_signal: "Session-only demo opportunity.",
    data_freshness_band: "Session",
    external_opportunity_id: candidate.id,
    general_location: packageBackedConsultingCaseStudy.geography,
    listing_status: candidate.listing_status ?? "Session-only demo opportunity",
    parcel_id: candidate.parcel_id ?? null,
    parcel_match_status: candidate.parcel_id ? "Parcel supplied by user" : "Manual verification required",
    price_per_acre: null,
    property_type: candidate.property_type ?? "Development land",
    source_caveat: "Session-only demo opportunity.",
    source_id: "session-demo",
    source_name: candidate.source_name ?? "Session demo",
    source_type: candidate.source_type,
    source_url: candidate.source_url ?? null,
    storage_policy: "Session-only demo store",
    title: candidate.candidate_name,
  }));
  return { as_of: DEMO_AS_OF, caveats: ["No external opportunity feed is queried in public demo mode."], count: opportunities.length, opportunities, source_modes: ["session-only"] };
}

export function getDemoInvestmentOpportunitySources(): { sources: InvestmentOpportunitySource[] } {
  return { sources: [{ access_mode: "Disabled in public demo", attribution_required: "N/A", coverage: "Session-created demo opportunities only", data_confidence: "User-entered demo", enabled: false, license_status: "Static in portfolio demo", source_id: "session-demo", source_name: "Session-only demo opportunities", source_type: "Demo", storage_allowed: "sessionStorage only" }] };
}

export function addDemoInvestmentOpportunityToIntake(opportunityId: string, strategy: InvestmentStrategyId) {
  const opportunity = getDemoInvestmentOpportunities().opportunities.find((item) => item.external_opportunity_id === opportunityId);
  if (!opportunity) throw new Error("Demo opportunity not found.");
  return createDemoInvestmentIntakeCandidate({
    candidate_name: opportunity.title,
    parcel_id: opportunity.parcel_id ?? null,
    property_type: opportunity.property_type,
    source_name: opportunity.source_name,
    source_type: "Manual Research",
    source_url: opportunity.source_url ?? null,
    strategy,
  });
}

export function getDemoInvestmentEngagements(): InvestmentEngagementListResponse {
  const engagement: InvestmentEngagement = {
    brief: { source: "CASE-1 public demo package" },
    criteria: ((packageBackedConsultingCaseStudy.package as { engagement?: { criteria?: Array<Record<string, unknown>> } }).engagement?.criteria ?? []),
    engagement_name: packageBackedConsultingCaseStudy.title,
    engagement_status: "Session demo active",
    id: packageBackedConsultingCaseStudy.engagement_id,
    portfolio_summary: { recommendation: "Targeted diligence only." },
    selected_strategy: "development_land",
    shortlist: packageBackedConsultingCaseStudy.candidates?.map((candidate) => ({
      item_id: candidate.parcel_id,
      item_type: "parcel",
      status: candidate.review_band,
    })) ?? [],
  };
  return { caveats: ["Package-backed demo engagement."], count: 1, engagements: [engagement] };
}

export function createDemoInvestmentEngagement(payload: Record<string, unknown>): InvestmentEngagement {
  return {
    brief: { session_only: true },
    criteria: [{ criterion: payload.minimum_acres ? `Minimum ${payload.minimum_acres} acres` : "Demo criteria", type: "Demo" }],
    engagement_name: String(payload.engagement_name ?? "Session demo engagement"),
    engagement_status: "Session demo active",
    id: `demo-engagement-${Date.now()}`,
    portfolio_summary: { session_only: true },
    selected_strategy: (payload.selected_strategy as InvestmentStrategyId | undefined) ?? "development_land",
    shortlist: [],
  };
}

export function addDemoInvestmentEngagementShortlistItem() {
  return getDemoInvestmentEngagements().engagements[0];
}

export function getDemoInvestmentSavedSearches(): InvestmentSavedSearchListResponse {
  const searches = session().savedSearches;
  return { caveats: ["Session-only demo saved searches."], count: searches.length, searches };
}

export function createDemoInvestmentSavedSearch(payload: {
  advanced_criteria?: Record<string, unknown>;
  essential_criteria?: Record<string, unknown>;
  goal: string;
  guided_or_advanced?: "advanced" | "guided";
  location_type?: string;
  location_value?: string | null;
  result_summary?: Record<string, unknown>;
  search_name: string;
}): InvestmentSavedSearch {
  const search: InvestmentSavedSearch = {
    advanced_criteria: payload.advanced_criteria ?? {},
    created_at: new Date().toISOString(),
    essential_criteria: payload.essential_criteria ?? {},
    goal: payload.goal,
    guided_or_advanced: payload.guided_or_advanced ?? "advanced",
    id: `demo-search-${Date.now()}`,
    location_type: payload.location_type ?? "All Cabarrus County",
    location_value: payload.location_value ?? null,
    result_summary: payload.result_summary ?? {},
    search_name: payload.search_name,
    updated_at: new Date().toISOString(),
  };
  mutate((state) => {
    state.savedSearches = [search, ...state.savedSearches].slice(0, 12);
  });
  return search;
}

export function getDemoInvestmentSavedItems(): InvestmentSavedItemListResponse {
  const items = session().savedItems;
  return { caveats: ["Session-only demo shortlist."], count: items.length, items };
}

export function createDemoInvestmentSavedItem(payload: Omit<InvestmentSavedItem, "created_at" | "id" | "status" | "updated_at"> & { status?: InvestmentSavedItem["status"] }): InvestmentSavedItem {
  const item: InvestmentSavedItem = {
    ...payload,
    created_at: new Date().toISOString(),
    id: `demo-item-${payload.item_reference_id}`,
    status: payload.status ?? "Saved",
    updated_at: new Date().toISOString(),
  };
  mutate((state) => {
    state.savedItems = [item, ...state.savedItems.filter((existing) => existing.id !== item.id)].slice(0, 24);
  });
  return item;
}

export function updateDemoInvestmentSavedItem(itemId: string, payload: Partial<Pick<InvestmentSavedItem, "label" | "private_notes" | "status" | "summary">>): InvestmentSavedItem {
  const current = session().savedItems.find((item) => item.id === itemId);
  if (!current) throw new Error("Demo saved item not found.");
  const item = { ...current, ...payload, updated_at: new Date().toISOString() };
  mutate((state) => {
    state.savedItems = state.savedItems.map((existing) => existing.id === itemId ? item : existing);
  });
  return item;
}

export function deleteDemoInvestmentSavedItem(itemId: string) {
  mutate((state) => {
    state.savedItems = state.savedItems.filter((item) => item.id !== itemId);
  });
  return { deleted: true };
}

export function getDemoInvestmentRecentWork(): InvestmentRecentWorkResponse {
  const items = session().recentWork;
  return { caveats: ["Session-only recent work."], count: items.length, items, max_items: 20 };
}

export function recordDemoInvestmentRecentWork(payload: Omit<InvestmentRecentWorkItem, "context" | "id" | "last_opened_at"> & { context?: Record<string, unknown> }): InvestmentRecentWorkResponse {
  const item: InvestmentRecentWorkItem = {
    ...payload,
    context: payload.context ?? {},
    id: `demo-recent-${Date.now()}`,
    last_opened_at: new Date().toISOString(),
  };
  mutate((state) => {
    state.recentWork = [item, ...state.recentWork].slice(0, 20);
  });
  return getDemoInvestmentRecentWork();
}

export function generateDemoInvestmentReport(payload: { candidate_id?: string | null; parcel_id?: string | null; report_type: string; strategy?: InvestmentStrategyId }): InvestmentReportResponse {
  const parcelId = payload.parcel_id ?? packageBackedConsultingCaseStudy.priority_candidate_id ?? null;
  const candidate = parcelId ? findCaseCandidate(parcelId) : null;
  const title = `${strategyLabel(payload.strategy ?? "development_land")} Demo Report`;
  const sections = [
    { id: "summary", title: "Executive Summary", body: `${parcelId ?? "Session candidate"} is reviewed using cached public-demo evidence. ${candidate?.decision ?? "Targeted diligence only."}`, limitations: ["Screening-level only."], sources: [{ name: "CASE-1 public demo package" }] },
    { id: "screening", title: "Screening Result", body: candidate ? `Score ${candidate.screening_score}; ${candidate.review_band}; ${candidate.why_it_surfaced}` : "Session-only opportunity; verify all source evidence.", limitations: ["No backend or external data feed used."], sources: [{ name: "Cached demo extract" }] },
    { id: "diligence", title: "Next Diligence", body: (candidate?.missing_information ?? ["Verify source, access, title, utilities, and environmental conditions."]).join(" "), limitations: ["Not an appraisal or acquisition recommendation."], sources: [{ name: "CFS Investments demo logic" }] },
  ];
  return {
    as_of: DEMO_AS_OF,
    brand: "CFS Investment",
    candidate_id: payload.candidate_id ?? null,
    limitations: ["Portfolio demo report; not investment advice, appraisal, or utility confirmation."],
    parcel_id: parcelId,
    purpose: "Screening-level public-demo report.",
    report_bucket_item: {
      caveats: ["Session-only report bucket item."],
      content: sections.map((section) => `${section.title}\n${section.body}`).join("\n\n"),
      summary: "Deterministic demo report generated from cached CASE-1 evidence.",
      title,
      type: "generated_report",
    },
    report_title: title,
    report_type: payload.report_type,
    sections,
    strategy: payload.strategy ?? "development_land",
  };
}

export function getDemoInvestmentUnderwritingScenarios(): InvestmentUnderwritingListResponse {
  const scenarios = session().scenarios.length ? session().scenarios : seedScenarios();
  return { caveats: ["Demo underwriting uses CASE-1 assumptions; not an appraisal."], count: scenarios.length, scenarios };
}

export function calculateDemoInvestmentUnderwriting(payload: { assumptions: Record<string, number | string | null>; candidate_id?: string | null; parcel_id?: string | null; scenario_name: string; scenario_type: InvestmentUnderwritingScenarioType; strategy?: InvestmentStrategyId }): InvestmentUnderwritingCalculation {
  const units = numberValue(payload.assumptions.scenario_unit_count, 941);
  const salePrice = numberValue(payload.assumptions.sale_price_per_unit, 125000);
  const acquisition = numberValue(payload.assumptions.acquisition_basis ?? payload.assumptions.purchase_price, 18000000);
  const site = numberValue(payload.assumptions.site_preparation_cost, 48932000);
  const utility = numberValue(payload.assumptions.utility_extension_cost, 7000000);
  const revenue = units * salePrice;
  const total = acquisition + site + utility;
  const margin = revenue - total;
  return {
    as_of: DEMO_AS_OF,
    assumption_evidence: { source: "User-entered public-demo assumptions." },
    assumptions: Object.fromEntries(Object.entries(payload.assumptions).map(([key, value]) => [key, numberValue(value, 0)])),
    brand: "CFS Investment",
    candidate_id: payload.candidate_id ?? null,
    limitations: ["Deterministic demo scenario; not an appraisal or forecast."],
    missing_inputs: [],
    parcel_id: payload.parcel_id ?? packageBackedConsultingCaseStudy.priority_candidate_id ?? null,
    research_context_summary: { recommendation: "No current CASE-1 diagnostic scenario supports a positive land basis." },
    results: { estimated_scenario_margin: margin, estimated_scenario_revenue: revenue, total_project_cost: total, unlevered_return_context: `${((margin / Math.max(total, 1)) * 100).toFixed(2)}%` },
    scenario_name: payload.scenario_name,
    scenario_type: payload.scenario_type,
    scenario_type_label: scenarioTypeLabel(payload.scenario_type),
    sensitivity: { matrix: [], status: "Demo sensitivity available in CASE-1 exhibits", variables: ["sale_price_per_unit", "scenario_unit_count"] },
    strategy: payload.strategy ?? "development_land",
    warnings: ["Review all assumptions before use."],
  };
}

export function createDemoInvestmentUnderwritingScenario(payload: Parameters<typeof calculateDemoInvestmentUnderwriting>[0] & { private_notes?: string | null; scenario_status?: InvestmentUnderwritingScenarioStatus }): InvestmentUnderwritingScenario {
  const calculation = calculateDemoInvestmentUnderwriting(payload);
  const scenario: InvestmentUnderwritingScenario = {
    assumptions: calculation.assumptions,
    calculation,
    candidate_id: payload.candidate_id ?? null,
    created_at: new Date().toISOString(),
    id: `demo-scenario-${Date.now()}`,
    last_calculated_at: calculation.as_of,
    limitations: calculation.limitations,
    parcel_id: payload.parcel_id ?? null,
    private_notes: payload.private_notes ?? "Session-only demo scenario.",
    results: calculation.results,
    scenario_name: payload.scenario_name,
    scenario_status: payload.scenario_status ?? "Draft",
    scenario_type: payload.scenario_type,
    scenario_type_label: calculation.scenario_type_label,
    strategy: calculation.strategy,
    updated_at: new Date().toISOString(),
  };
  mutate((state) => {
    state.scenarios = [scenario, ...state.scenarios].slice(0, 12);
  });
  return scenario;
}

export function updateDemoInvestmentUnderwritingScenario(scenarioId: string, payload: Partial<InvestmentUnderwritingScenario>): InvestmentUnderwritingScenario {
  const scenario = getDemoInvestmentUnderwritingScenarios().scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("Demo scenario not found.");
  const next = { ...scenario, ...payload, updated_at: new Date().toISOString() };
  mutate((state) => {
    state.scenarios = [next, ...state.scenarios.filter((item) => item.id !== scenarioId)];
  });
  return next;
}

export function deleteDemoInvestmentUnderwritingScenario(scenarioId: string) {
  mutate((state) => {
    state.scenarios = state.scenarios.filter((item) => item.id !== scenarioId);
  });
  return { deleted: true };
}

export function compareDemoInvestmentUnderwritingScenarios(scenarioIds: string[]): InvestmentUnderwritingCompareResponse {
  const scenarios = getDemoInvestmentUnderwritingScenarios().scenarios.filter((item) => scenarioIds.includes(item.id));
  return { caveats: ["Demo comparison only."], count: scenarios.length, scenarios, summary: ["No current CASE-1 diagnostic scenario supports acquisition pricing."] };
}

export function getDemoInvestmentUnderwritingTemplates(): { templates: InvestmentUnderwritingTemplate[] } {
  return { templates: [{ assumptions: defaultUnderwritingAssumptions(), default_source: "CASE-1 public demo package", id: "case-1-development-land", scenario_type: "development_land", template_name: "CASE-1 Development Land Demo", values_requiring_confirmation: ["acquisition_basis", "utility_extension_cost", "sale_price_per_unit"] }] };
}

export function prefillDemoInvestmentUnderwriting(payload: { existing_assumptions?: Record<string, number | string | null>; scenario_type: InvestmentUnderwritingScenarioType; template_id?: string | null }): InvestmentUnderwritingPrefillResponse {
  const template = getDemoInvestmentUnderwritingTemplates().templates[0];
  const assumptions = { ...defaultUnderwritingAssumptions(), ...payload.existing_assumptions };
  return {
    assumptions,
    caveats: ["Prefill is a public-demo starting point; review every value."],
    field_sources: Object.fromEntries(Object.keys(assumptions).map((key) => [key, "CASE-1 public demo package or user edit"])),
    prefill_summary: { next: ["Review assumptions", "Calculate scenario", "Do not treat output as an appraisal"] },
    scenario_type: payload.scenario_type,
    template,
  };
}

function getCaseCandidates(strategy: InvestmentStrategyId): InvestmentScreenCandidate[] {
  if (strategy !== "development_land") return [];
  return (packageBackedConsultingCaseStudy.candidates ?? []).map(toScreenCandidate);
}

function findCaseCandidate(parcelId: string): CaseCandidate | null {
  return (packageBackedConsultingCaseStudy.candidates?.find((candidate) => candidate.parcel_id === parcelId) as CaseCandidate | undefined) ?? null;
}

function toScreenCandidate(candidate: NonNullable<InvestmentCaseStudy["candidates"]>[number]): InvestmentScreenCandidate {
  const source = candidate as CaseCandidate;
  const fields = {
    environmental_constraint_band: source.environmental_constraint_band,
    mapped_wetland_context: source.wetland_context_band,
    sewer_proxy_class: source.sewer_proxy_class,
    soil_limitation_band: source.soil_limitation_band,
    terrain_context: source.terrain_context_band,
    usable_area_screening_proxy: candidate.preliminary_developable_acres ? `${candidate.preliminary_developable_acres} preliminary developable acres` : "Verify",
    utility_readiness_proxy_class: source.utility_readiness_proxy_class,
  };
  return {
    basis_context_band: "Insufficient Basis Information",
    basis_caution_reasons: candidate.missing_information ?? [],
    basis_data_confidence: candidate.data_confidence ?? "Medium",
    basis_positive_reasons: candidate.positive_evidence ?? [],
    basis_verification_required: true,
    candidate_band: String(source.cfs_investment_candidate_band ?? candidate.review_band ?? "Review Candidate"),
    caution_reason_codes: candidate.major_cautions ?? [],
    comparable_confidence_band: "Low",
    comparable_context_summary: "Comparable and acquisition basis require professional verification.",
    comparable_count_band: "No verified comparable evidence",
    data_confidence_band: candidate.data_confidence ?? "Medium",
    dimension_bands: {
      basis_context: "Insufficient Basis Information",
      constraint_burden: String(source.environmental_constraint_band ?? "Verify"),
      data_confidence: candidate.data_confidence ?? "Medium",
      readiness_signal: candidate.review_band ?? "Review Candidate",
      strategy_fit: "Large Development Land",
    },
    factor_groups: { score_categories: candidate.score_categories ?? [] },
    freshness_context: "Cached CASE-1 public demo extract",
    parcel_id: candidate.parcel_id,
    positive_reason_codes: candidate.positive_evidence ?? [],
    safe_display_fields: fields,
    sale_quality_band: "Not Available",
    sale_recency_band: "No sale information available",
    sort_order: Math.max(1, 100 - (candidate.screening_score ?? 0)),
    strategy: "development_land",
    strategy_label: "Large Development Land",
    verification_requirements: candidate.missing_information ?? ["Verify planning, utility, access, title, and field conditions."],
  };
}

function toEnvironmentalContext(candidate: Record<string, unknown>) {
  return {
    environmental_data_confidence: String(candidate.data_confidence ?? "Medium"),
    environmental_facility_context: String(candidate.epa_context ?? "Data unavailable"),
    flood_context: String(candidate.environmental_constraint_band ?? "Verify"),
    limitations: ["Mapped environmental context is preliminary and requires field verification."],
    mapped_wetland_context: String(candidate.wetland_context_band ?? "Data unavailable"),
    overall_environmental_constraint_band: String(candidate.environmental_constraint_band ?? "Verify"),
    soil_context: String(candidate.soil_limitation_band ?? "Verify"),
    source_attribution: { source: "CASE-1 cached demo extract" },
    terrain_context: String(candidate.terrain_context_band ?? "Verify"),
    usable_area_screening_proxy: candidate.preliminary_developable_acres ? `${candidate.preliminary_developable_acres} preliminary developable acres` : "Verify",
    verification_requirements: ["Wetland delineation", "Floodplain review", "Geotechnical review"],
  };
}

function toIntakeCandidate(payload: InvestmentIntakePayload): InvestmentIntakeCandidate {
  const parcelCandidate = payload.parcel_id ? findCaseCandidate(payload.parcel_id) : null;
  return {
    acquisition_basis_band: payload.asking_price ? "User-entered asking basis" : "Acquisition basis unavailable",
    asking_price: payload.asking_price ?? null,
    asking_price_date: payload.asking_price_date ?? null,
    candidate_name: `${payload.candidate_name} (Session-only demo opportunity)`,
    comparable_context: "Verify",
    constraint_burden: String(parcelCandidate?.environmental_constraint_band ?? "Insufficient Information"),
    data_confidence: parcelCandidate?.data_confidence ?? "User-entered",
    environmental_constraint_band: String(parcelCandidate?.environmental_constraint_band ?? "Insufficient Information"),
    environmental_data_confidence: parcelCandidate?.data_confidence ?? "Data Needed",
    id: `demo-intake-${slug(payload.candidate_name)}-${Date.now()}`,
    date_added: new Date().toISOString(),
    last_verified: DEMO_AS_OF,
    listing_status: "Session-only demo opportunity",
    mapped_wetland_context: String(parcelCandidate?.wetland_context_band ?? "Data Unavailable"),
    parcel_id: payload.parcel_id ?? null,
    parcel_match_status: payload.parcel_id ? "User-provided parcel ID" : "Manual verification required",
    property_type: payload.property_type ?? "Development land",
    readiness_signal: parcelCandidate?.review_band ?? "Verify",
    review_status: payload.review_status ?? "New",
    source_name: payload.source_name ?? "Session demo",
    source_type: payload.source_type,
    source_url: payload.source_url ?? null,
    strategy: payload.strategy ?? "development_land",
    strategy_fit: strategyLabel(payload.strategy ?? "development_land"),
    terrain_context: String(parcelCandidate?.terrain_context_band ?? "Data Unavailable"),
    user_notes: payload.user_notes ?? null,
  };
}

function analyzeIntakeCandidate(candidate: InvestmentIntakeCandidate): InvestmentIntakeAnalysisResponse {
  const screen = candidate.parcel_id ? getCaseCandidates(candidate.strategy).find((item) => item.parcel_id === candidate.parcel_id) ?? null : null;
  return {
    acquisition_basis: {
      asking_basis_band: candidate.acquisition_basis_band ?? "Acquisition basis unavailable",
      asking_basis_summary: "Session-only demo opportunity; verify source and acquisition basis before use.",
      asking_price: candidate.asking_price ?? null,
      asking_price_date_age_days: null,
      asking_price_per_acre: null,
      basis_caution_reasons: ["Asking basis, ownership, title, access, utilities, and environmental conditions require verification."],
      basis_positive_reasons: ["Session-only opportunity was captured for demonstration workflow continuity."],
      evidence_type: "User-entered demo",
      parcel_acres: candidate.parcel_id ? findCaseCandidate(candidate.parcel_id)?.gross_acres ?? null : null,
      usable_acreage_note: "Use CASE-1 developable-area estimate only where available.",
    },
    candidate,
    caveats: ["Session-only demo opportunity; no backend write occurred."],
    data_attribution: { asking_basis: "User-entered demo value", environmental_context: "Cached CASE-1 extract where matched", historical_sale_context: "Not available in demo" },
    environmental_context: candidate.parcel_id ? toEnvironmentalContext((findCaseCandidate(candidate.parcel_id) ?? {}) as Record<string, unknown>) : undefined,
    market_area_context: screen ? getDemoInvestmentResearchContext(screen.parcel_id, candidate.strategy).market_area_context as InvestmentIntakeAnalysisResponse["market_area_context"] : undefined,
    parcel_match_status: candidate.parcel_match_status ?? "Manual verification required",
    screening_context: screen,
    source_note: "Stored in this browser session only.",
  };
}

function seedScenarios(): InvestmentUnderwritingScenario[] {
  return ["Downside", "Base", "Upside"].map((name) => createScenarioSeed(name));
}

function createScenarioSeed(name: string): InvestmentUnderwritingScenario {
  const calculation = calculateDemoInvestmentUnderwriting({
    assumptions: defaultUnderwritingAssumptions(),
    parcel_id: packageBackedConsultingCaseStudy.priority_candidate_id,
    scenario_name: `${name} CASE-1 demo scenario`,
    scenario_type: "development_land",
    strategy: "development_land",
  });
  return {
    assumptions: calculation.assumptions,
    calculation,
    created_at: DEMO_AS_OF,
    id: `case-1-${slug(name)}`,
    last_calculated_at: DEMO_AS_OF,
    limitations: calculation.limitations,
    parcel_id: calculation.parcel_id,
    results: calculation.results,
    scenario_name: calculation.scenario_name,
    scenario_status: "Needs Verification",
    scenario_type: "development_land",
    scenario_type_label: "Development Land",
    strategy: "development_land",
    updated_at: DEMO_AS_OF,
  };
}

function defaultUnderwritingAssumptions() {
  return {
    acquisition_basis: 18000000,
    sale_price_per_unit: 125000,
    scenario_unit_count: 941,
    site_preparation_cost: 48932000,
    utility_extension_cost: 7000000,
  };
}

function session(): DemoSession {
  if (typeof window === "undefined") return emptySession();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? "null") as Partial<DemoSession> | null;
    return { ...emptySession(), ...parsed };
  } catch {
    window.sessionStorage.removeItem(STORE_KEY);
    return emptySession();
  }
}

function mutate(fn: (state: DemoSession) => void) {
  if (typeof window === "undefined") return;
  const state = session();
  fn(state);
  window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function emptySession(): DemoSession {
  return { intakeCandidates: [], recentWork: [], savedItems: [], savedSearches: [], scenarios: [] };
}

function strategyLabel(strategy: InvestmentStrategyId) {
  return strategy === "development_land" ? "Large Development Land" :
    strategy === "entitlement_repositioning" ? "Entitlement / Repositioning" :
      strategy === "existing_use" ? "Existing-Use Acquisition" :
        "Long-Term Land Banking";
}

function scenarioTypeLabel(type: InvestmentUnderwritingScenarioType) {
  return type === "development_land" ? "Development Land" :
    type === "entitlement_repositioning" ? "Entitlement / Repositioning" :
      type === "existing_use_acquisition" ? "Existing-Use Acquisition" :
        "Long-Term Land Banking";
}

function numberValue(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "demo";
}
