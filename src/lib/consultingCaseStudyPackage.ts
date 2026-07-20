import caseStudyManifest from "../../case-studies/large-development-land/case-study.json";
import activePropertyAnalysis from "../../case-studies/large-development-land/active_property_analysis.json";
import candidateComparison from "../../case-studies/large-development-land/candidate_comparison.json";
import developableAreaAnalysis from "../../case-studies/large-development-land/developable_area_analysis.json";
import dueDiligencePlan from "../../case-studies/large-development-land/due_diligence_plan.json";
import limitations from "../../case-studies/large-development-land/limitations.json";
import screeningFunnel from "../../case-studies/large-development-land/screening_funnel.json";
import shortlistedCandidates from "../../case-studies/large-development-land/shortlisted_candidates.json";
import strategy from "../../case-studies/large-development-land/strategy.json";
import underwritingScenarios from "../../case-studies/large-development-land/underwriting_scenarios.json";
import type { InvestmentCaseStudy, InvestmentCaseStudyCandidate } from "@/types/api";

const manifest = caseStudyManifest as typeof caseStudyManifest & {
  active_parcel_id: string;
  candidate_ids: string[];
  priority_candidate_id: string;
};
const artifacts = {
  active_property_analysis: activePropertyAnalysis,
  candidate_comparison: candidateComparison,
  developable_area_analysis: developableAreaAnalysis,
  due_diligence_plan: dueDiligencePlan,
  limitations,
  screening_funnel: screeningFunnel,
  shortlisted_candidates: shortlistedCandidates,
  strategy,
  underwriting_scenarios: underwritingScenarios,
};
const candidates = shortlistedCandidates.candidates as InvestmentCaseStudyCandidate[];

export const packageBackedConsultingCaseStudy: InvestmentCaseStudy = {
  active_parcel_id: manifest.active_parcel_id,
  activity: manifest.activity_seed,
  candidate_count: candidates.length,
  candidates,
  case_study: {
    active_parcel_id: manifest.active_parcel_id,
    client_label: manifest.client_label,
    current_stage: manifest.current_stage,
    description: manifest.description,
    geography: manifest.geography,
    last_updated: manifest.generated_at,
    priority_candidate_id: manifest.priority_candidate_id,
    slug: manifest.slug,
    status: manifest.status,
    strategy: manifest.strategy,
    title: manifest.title,
    workflow_step: "Analyze",
  },
  case_study_type: manifest.case_study_type,
  created_at: manifest.generated_at,
  current_stage: manifest.current_stage,
  deliverables: manifest.deliverables,
  deliverable_status: manifest.deliverable_status,
  description: manifest.description,
  due_diligence: dueDiligencePlan,
  engagement_id: manifest.engagement.existing_engagement_id,
  funnel: {
    countywide_reviewed: screeningFunnel.counts.countywide_parcels_reviewed,
    criteria: screeningFunnel.criteria,
    data_vintage: manifest.source_data_vintage,
    evidence_ready: screeningFunnel.counts.parcels_with_usable_planning_and_investment_evidence,
    final_shortlist_count: screeningFunnel.counts.final_shortlist_count,
    initial_screen_pass: screeningFunnel.counts.parcels_passing_initial_screens,
    manual_review_count: screeningFunnel.counts.parcels_receiving_preliminary_manual_review,
    minimum_acreage_pass: screeningFunnel.counts.parcels_meeting_minimum_100_acres,
    screened_at: screeningFunnel.as_of,
    source: screeningFunnel.source,
  },
  geography: manifest.geography,
  id: manifest.slug,
  last_synced_at: null,
  manifest_path: "case-studies/large-development-land/case-study.json",
  package: { ...manifest, artifacts },
  priority_candidate: (candidates.find((item) => item.parcel_id === manifest.priority_candidate_id) as unknown as Record<string, unknown> | undefined) ?? null,
  priority_candidate_id: manifest.priority_candidate_id,
  recommendation: {
    comparison: candidateComparison,
    priority_candidate_id: manifest.priority_candidate_id,
    status: manifest.recommendation_status,
  },
  research_completeness: manifest.research_completeness,
  slug: manifest.slug,
  source_package_version: manifest.version,
  status: manifest.status,
  strategy: manifest.strategy,
  title: manifest.title,
  underwriting: underwritingScenarios,
  underwriting_status: manifest.underwriting_status,
  updated_at: manifest.generated_at,
  user_state: {},
  workflow: [
    { step: "Define", status: "Complete" },
    { step: "Screen", status: "Complete" },
    { step: "Shortlist", status: "Complete" },
    { step: "Analyze", status: "In Progress" },
    { step: "Underwrite", status: manifest.underwriting_status },
    { step: "Decide", status: manifest.recommendation_status },
    { step: "Deliver", status: manifest.deliverable_status },
  ],
};
