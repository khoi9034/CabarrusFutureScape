"use client";

import { useMemo, useState } from "react";
import type { InvestmentCaseStudy } from "@/types/api";

type InvestmentCaseStudiesProps = {
  activeCaseStudy: InvestmentCaseStudy | null;
  caseStudies: InvestmentCaseStudy[];
  codexBriefMarkdown?: string | null;
  status?: string | null;
  onAnalyzeParcel: (parcelId: string, label?: string) => void;
  onArchive: (slug: string) => void;
  onCompare: (parcelIds: string[]) => void;
  onDuplicate: (slug: string) => void;
  onExportBrief: (slug: string) => void;
  onMakeActive: (slug: string, parcelId: string) => void;
  onOpen: (slug: string) => void;
  onOpenIntake: () => void;
  onReport: () => void;
  onSaveNote: (slug: string, note: string) => void;
  onUnderwrite: (parcelId?: string | null) => void;
};

const caseStudyTabs = [
  "Overview",
  "Strategy",
  "Screening",
  "Candidates",
  "Deep Dive",
  "Underwriting",
  "Recommendation",
  "Due Diligence",
  "Deliverables",
  "Activity",
] as const;

type CaseStudyTab = (typeof caseStudyTabs)[number];

const caseStudyWorkflowSteps = [
  "Strategy",
  "Screening",
  "Candidate Review",
  "Deep Analysis",
  "Underwriting",
  "Recommendation",
  "Deliverables",
] as const;

export function InvestmentCaseStudies({
  activeCaseStudy,
  caseStudies,
  codexBriefMarkdown,
  status,
  onAnalyzeParcel,
  onArchive,
  onCompare,
  onDuplicate,
  onExportBrief,
  onMakeActive,
  onOpen,
  onOpenIntake,
  onReport,
  onSaveNote,
  onUnderwrite,
}: InvestmentCaseStudiesProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [strategyFilter, setStrategyFilter] = useState("All");
  const [sort, setSort] = useState("updated");
  const [tab, setTab] = useState<CaseStudyTab>("Overview");
  const [note, setNote] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...caseStudies]
      .filter((item) => statusFilter === "All" || item.status === statusFilter)
      .filter((item) => strategyFilter === "All" || item.strategy === strategyFilter)
      .filter((item) => !normalized || [item.title, item.description, item.geography, item.current_stage].join(" ").toLowerCase().includes(normalized))
      .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title) : String(right.updated_at).localeCompare(String(left.updated_at)));
  }, [caseStudies, query, sort, statusFilter, strategyFilter]);
  const selected = activeCaseStudy ?? visible[0] ?? null;
  const packageData = selected?.package as CaseStudyPackage | undefined;
  const artifacts = packageData?.artifacts ?? {};
  const candidates = artifacts.shortlisted_candidates?.candidates ?? [];
  const candidateIds = candidates.map((candidate) => candidate.parcel_id).filter(Boolean);
  const activeParcelId = selected?.active_parcel_id ?? packageData?.active_parcel_id ?? selected?.priority_candidate_id ?? null;
  const currentWorkflowStep = selected ? currentCaseStudyWorkflowStep(selected.current_stage) : "Strategy";
  const continueTab = workflowStepToTab(currentWorkflowStep);
  const openUnderwriting = (parcelId?: string | null) => {
    setTab("Underwriting");
    onUnderwrite(parcelId);
  };

  return (
    <section className="investment-work-grid">
      <div className="investment-primary-column">
        <section className="investment-card">
          <div className="investment-section-heading">
            <div>
              <p>Case Studies</p>
              <h2>Acquisition and consulting case-study workspace</h2>
            </div>
            <span className="investment-pill">{caseStudies.length} saved</span>
          </div>
          <div className="investment-action-grid mb-4">
            <label>
              Search
              <input className="investment-input" onChange={(event) => setQuery(event.target.value)} placeholder="Search case studies" value={query} />
            </label>
            <label>
              Status
              <select className="investment-select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                {["All", "Draft", "Screening", "Candidate Review", "Deep Analysis", "Underwriting", "Recommendation Review", "Final", "Archived"].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Strategy
              <select className="investment-select" onChange={(event) => setStrategyFilter(event.target.value)} value={strategyFilter}>
                {["All", ...Array.from(new Set(caseStudies.map((item) => item.strategy).filter(Boolean)))].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select className="investment-select" onChange={(event) => setSort(event.target.value)} value={sort}>
                <option value="updated">Last updated</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>
          {visible.length ? (
            <div className="investment-table-wrap">
              <table className="investment-table investment-table--compact">
                <thead>
                  <tr>
                    <th>Case Study</th>
                    <th>Stage</th>
                    <th>Candidates</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Next Action</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const pkg = item.package as CaseStudyPackage;
                    return (
                      <tr className={selected?.slug === item.slug ? "is-active" : undefined} key={item.slug}>
                        <td>
                          <strong>{item.title}</strong>
                          <br />
                          <span className="investment-muted">{item.description}</span>
                          <br />
                          <span className="investment-muted">{item.strategy} | {item.geography}</span>
                        </td>
                        <td>{item.current_stage}</td>
                        <td>{item.candidate_count}</td>
                        <td>{item.priority_candidate_id ?? "Not set"}</td>
                        <td>{item.status}</td>
                        <td>{pkg.next_action ?? "Review case-study workspace"}</td>
                        <td>
                          <div className="investment-row-actions">
                            <button className="investment-primary-button" onClick={() => { setTab("Overview"); onOpen(item.slug); }} type="button">Open</button>
                            <button onClick={() => onDuplicate(item.slug)} type="button">Duplicate</button>
                            <button onClick={() => onArchive(item.slug)} type="button">Archive</button>
                            <button onClick={() => onExportBrief(item.slug)} type="button">Export Codex Brief</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="investment-empty">
              No case studies have been created yet.
              <div className="investment-row-actions mt-3">
                <button className="investment-primary-button" type="button">Create Case Study</button>
                <button className="investment-ghost-button" type="button">Convert Project to Case Study</button>
                <button className="investment-ghost-button" type="button">Import Case-Study Package</button>
              </div>
            </div>
          )}
        </section>

        {selected ? (
          <section className="investment-card">
            <div className="investment-section-heading">
              <div>
                <p>{selected.case_study_type}</p>
                <h2>{selected.title}</h2>
              </div>
              <span className="investment-pill">{selected.status}</span>
            </div>
            <div className="investment-step-strip" aria-label="Case-study status">
              {[
                ["Strategy", selected.strategy],
                ["Geography", selected.geography],
                ["Stage", selected.current_stage],
                ["Active candidate", activeParcelId ?? "Not set"],
                ["Last updated", formatDate(selected.updated_at)],
              ].map(([label, value]) => <span key={label}>{label}: {value}</span>)}
            </div>
            <div className="investment-step-strip investment-step-strip--workflow mt-4" aria-label="Case-study workflow">
              {caseStudyWorkflowSteps.map((step) => (
                <span aria-current={currentWorkflowStep === step ? "step" : undefined} key={step}>{step}</span>
              ))}
            </div>
            <div className="investment-row-actions mt-4">
              <button className="investment-primary-button" onClick={() => setTab(continueTab)} type="button">Continue Next Step</button>
              <button className="investment-ghost-button" onClick={() => activeParcelId ? onAnalyzeParcel(activeParcelId, selected.title) : undefined} type="button">Open Active Candidate</button>
              <button className="investment-ghost-button" onClick={() => onCompare(candidateIds)} type="button">Compare Candidates</button>
              <button className="investment-ghost-button" onClick={() => openUnderwriting(activeParcelId)} type="button">Start or Continue Underwriting</button>
              <button className="investment-ghost-button" onClick={onReport} type="button">Create Report</button>
              <button className="investment-ghost-button" onClick={() => onExportBrief(selected.slug)} type="button">Export Codex Brief</button>
            </div>
            <div className="investment-tabs mt-4" role="tablist" aria-label="Case study workspace tabs">
              {caseStudyTabs.map((item) => (
                <button aria-selected={tab === item} key={item} onClick={() => setTab(item)} role="tab" type="button">{item}</button>
              ))}
            </div>
            <div className="mt-4">
              <CaseStudyTabPanel
                activeParcelId={activeParcelId}
                caseStudy={selected}
                candidates={candidates}
                codexBriefMarkdown={codexBriefMarkdown}
                note={note || String(selected.user_state?.analyst_note ?? "")}
                onAnalyzeParcel={onAnalyzeParcel}
                onCompare={onCompare}
                onExportBrief={onExportBrief}
                onMakeActive={onMakeActive}
                onNoteChange={setNote}
                onOpenIntake={onOpenIntake}
                onReport={onReport}
                onSaveNote={() => onSaveNote(selected.slug, note || String(selected.user_state?.analyst_note ?? ""))}
                onUnderwrite={openUnderwriting}
                packageData={packageData}
                tab={tab}
              />
            </div>
          </section>
        ) : null}
      </div>
      <aside className="investment-rail">
        <section className="investment-card">
          <div className="investment-section-heading"><div><p>Workspace Guardrails</p><h2>Interpretation and safety</h2></div></div>
          <SignalList values={[
            "Internal screening-level research only.",
            "Not investment advice, not an appraisal, and not a guarantee of future value.",
            "Utility service, utility capacity, entitlement, access, title, and field environmental conditions require professional verification.",
            "Owner, mailing, grantor, grantee, raw WSACC, raw model score, exact probability, token, and credential data are excluded.",
          ]} />
        </section>
        {status ? <p className="investment-status">{status}</p> : null}
      </aside>
    </section>
  );
}

function CaseStudyTabPanel({
  activeParcelId,
  caseStudy,
  candidates,
  codexBriefMarkdown,
  note,
  onAnalyzeParcel,
  onCompare,
  onExportBrief,
  onMakeActive,
  onNoteChange,
  onOpenIntake,
  onReport,
  onSaveNote,
  onUnderwrite,
  packageData,
  tab,
}: {
  activeParcelId: string | null;
  caseStudy: InvestmentCaseStudy;
  candidates: CaseStudyCandidate[];
  codexBriefMarkdown?: string | null;
  note: string;
  onAnalyzeParcel: (parcelId: string, label?: string) => void;
  onCompare: (parcelIds: string[]) => void;
  onExportBrief: (slug: string) => void;
  onMakeActive: (slug: string, parcelId: string) => void;
  onNoteChange: (value: string) => void;
  onOpenIntake: () => void;
  onReport: () => void;
  onSaveNote: () => void;
  onUnderwrite: (parcelId?: string | null) => void;
  packageData?: CaseStudyPackage;
  tab: CaseStudyTab;
}) {
  const artifacts = packageData?.artifacts ?? {};
  const strategy = artifacts.strategy ?? {};
  const funnel = artifacts.screening_funnel;
  const activeAnalysis = artifacts.active_property_analysis;
  const developable = artifacts.developable_area_analysis;
  const underwriting = artifacts.underwriting_scenarios;
  const dueDiligence = artifacts.due_diligence_plan;
  const comparison = artifacts.candidate_comparison;
  const limitations = artifacts.limitations;
  const deliverables = packageData?.deliverables ?? [];

  if (tab === "Overview") {
    return (
      <div className="investment-two-column">
        <div>
          <Matrix rows={[
            ["Acquisition question", String(strategy.strategy ?? "Review large development-land acquisition candidates.")],
            ["Hypothetical client", String(packageData?.client_label ?? "Hypothetical client")],
            ["Current preliminary conclusion", String(activeAnalysis?.recommendation ?? "Needs review")],
            ["Candidate funnel", `${displayCount(funnel?.counts?.final_shortlist_count)} shortlisted from ${displayCount(funnel?.counts?.countywide_parcels_reviewed)} countywide parcels`],
            ["Priority candidate", caseStudy.priority_candidate_id ?? "Not set"],
            ["Research completeness", caseStudy.research_completeness ?? "Needs review"],
            ["Underwriting", caseStudy.underwriting_status ?? "Assumptions require review"],
            ["Deliverables", caseStudy.deliverable_status ?? "Needs review"],
            ["Next action", String(packageData?.next_action ?? "Continue case study")],
          ]} />
          <div className="mt-4">
            <label className="grid gap-2 text-xs text-[var(--investment-text-muted)]">
              Analyst note
              <textarea className="investment-input min-h-24" onChange={(event) => onNoteChange(event.target.value)} value={note} />
            </label>
            <button className="investment-primary-button mt-3" onClick={onSaveNote} type="button">Save Note</button>
          </div>
        </div>
        <div>
          <SignalList title="Main unresolved risks" values={activeAnalysis?.what_limits_development_potential ?? []} />
          <SignalList title="Missing evidence" values={activeAnalysis?.evidence_still_missing ?? []} />
        </div>
      </div>
    );
  }
  if (tab === "Strategy") {
    const requirements = strategy.primary_requirements ?? {};
    return (
      <>
        <Matrix rows={Object.entries(requirements).map(([key, value]) => [titleText(key), displayValue(value)])} />
        <div className="investment-disclaimer mt-4">Screening results may need to be rerun if criteria change. Hypothetical client requirements, analyst-defined criteria, CFS evidence, and professional verification requirements are tracked separately in the parent Engagement.</div>
        <SignalList title="Engagement criteria" values={(packageData?.engagement?.criteria ?? []).map((item) => `${item.source ?? "Criterion"}: ${item.type} - ${item.criterion}`)} />
      </>
    );
  }
  if (tab === "Screening") {
    return (
      <>
        <Matrix rows={Object.entries(funnel?.counts ?? {}).map(([key, value]) => [titleText(key), displayCount(value)])} />
        <SignalList title="Criteria used" values={funnel?.criteria ?? []} />
        <div className="investment-row-actions mt-4">
          <button className="investment-primary-button" onClick={onOpenIntake} type="button">Open Find with Criteria</button>
          <button className="investment-ghost-button" type="button">Rerun Screening</button>
          <button className="investment-ghost-button" type="button">Review Manual Set</button>
          <button className="investment-ghost-button" onClick={onOpenIntake} type="button">Add Candidate</button>
          <button className="investment-ghost-button" onClick={() => onExportBrief(caseStudy.slug)} type="button">Export Funnel</button>
        </div>
      </>
    );
  }
  if (tab === "Candidates") {
    return (
      <>
        {candidates.length ? (
          <div className="investment-result-grid">
            {candidates.map((candidate) => (
              <article className="investment-result-card" key={candidate.parcel_id}>
                <span>{candidate.role_in_case_study}</span>
                <h3>{candidate.parcel_id}</h3>
                <p>{candidate.why_it_surfaced}</p>
                <Matrix rows={[
                  ["Approximate acreage", displayCount(candidate.gross_acres)],
                  ["Developable estimate", displayCount(candidate.preliminary_developable_acres)],
                  ["Screening score", `${candidate.screening_score}/100`],
                  ["Review band", candidate.review_band],
                  ["Data confidence", candidate.data_confidence ?? "Needs Verification"],
                  ["Decision", candidate.decision],
                  ["Verification burden", (candidate.missing_information ?? []).slice(0, 2).join("; ") || "Needs verification"],
                ]} />
                <SignalList title="Main advantage" values={candidate.positive_evidence?.slice(0, 3) ?? []} compact />
                <SignalList title="Main risk" values={candidate.major_cautions?.slice(0, 3) ?? []} compact />
                <ScoreBreakdown candidate={candidate} />
                <div className="investment-row-actions mt-3">
                  <button onClick={() => onAnalyzeParcel(candidate.parcel_id, candidate.parcel_id)} type="button">Analyze</button>
                  <button onClick={() => onMakeActive(caseStudy.slug, candidate.parcel_id)} type="button">Make Active</button>
                  <button onClick={() => onCompare(candidates.map((item) => item.parcel_id))} type="button">Compare</button>
                  <button onClick={() => onUnderwrite(candidate.parcel_id)} type="button">Underwrite</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="investment-empty">This case study does not yet have a shortlist.</div>
        )}
      </>
    );
  }
  if (tab === "Deep Dive") {
    const developableRow = developable?.candidates?.find((item) => item.parcel_id === activeParcelId) ?? activeAnalysis?.developable_area;
    return (
      <>
        <div className="investment-disclaimer">Preliminary developable-area screening estimate. This is not engineering-confirmed acreage.</div>
        <Matrix rows={[
          ["Active parcel", activeParcelId ?? "Not set"],
          ["Gross acreage", displayCount(developableRow?.gross_acres)],
          ["Unioned mapped constrained acreage", displayCount(developableRow?.unioned_flood_wetland_constraint_acres)],
          ["Preliminary net acreage", displayCount(developableRow?.preliminary_net_acres_after_unioned_flood_wetland)],
          ["Open-space/stormwater assumption", `${displayCount(developableRow?.additional_open_space_stormwater_assumption_percent)}%`],
          ["Estimated developable acreage", displayCount(developableRow?.estimated_developable_acres)],
          ["Overlap handling", String(developable?.critical_rule ?? "Do not double-count overlapping constraints.")],
          ["Methodology", String(developable?.method ?? developableRow?.method_label ?? "Preliminary screening estimate")],
        ]} />
        <SignalList title="Professional verification requirements" values={activeAnalysis?.evidence_still_missing ?? []} />
        <button className="investment-primary-button mt-4" onClick={() => activeParcelId ? onAnalyzeParcel(activeParcelId, caseStudy.title) : undefined} type="button">Open Full Property Analysis</button>
      </>
    );
  }
  if (tab === "Underwriting") {
    return (
      <>
        <div className="investment-disclaimer">Underwriting assumptions require user review. CFS has not created a final Excel workbook and does not invent asking price, density, finished-lot value, infrastructure cost, or utility-extension cost.</div>
        <Matrix rows={[
          ["Status", underwriting?.status ?? caseStudy.underwriting_status ?? "Assumptions Required"],
          ["Asking price", underwriting?.asking_price_status ?? "Not available"],
          ["Scenario source", underwriting?.scenario_source ?? "CFS Underwriting Lab"],
          ["Excel workbook", packageData?.excel_workbook_status ?? "Not Started"],
        ]} />
        <div className="investment-table-wrap mt-4">
          <table className="investment-table investment-table--compact">
            <thead><tr><th>Scenario</th><th>Developable acres</th><th>Units/lots</th><th>Status</th><th>Top sensitivity</th></tr></thead>
            <tbody>{(underwriting?.scenarios ?? []).map((scenario) => <tr key={scenario.scenario}><td>{scenario.scenario}</td><td>{displayCount(scenario.developable_acres)}</td><td>{displayCount(scenario.estimated_units_or_lots)}</td><td>Needs Verification</td><td>{(scenario.largest_sensitivity_drivers ?? []).join("; ")}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="investment-row-actions mt-4">
          <button className="investment-primary-button" onClick={() => onUnderwrite(activeParcelId)} type="button">Open Underwriting Lab</button>
          <button className="investment-ghost-button" type="button">Create Scenario</button>
          <button className="investment-ghost-button" type="button">Compare Scenarios</button>
          <button className="investment-ghost-button" onClick={onReport} type="button">Add to Report</button>
        </div>
      </>
    );
  }
  if (tab === "Recommendation") {
    return (
      <>
        <Matrix rows={[
          ["Priority candidate", caseStudy.priority_candidate_id ?? "Not set"],
          ["Secondary candidate", candidates[1]?.parcel_id ?? "Not set"],
          ["Deferred candidate", candidates[2]?.parcel_id ?? "Not set"],
          ["Recommendation status", packageData?.recommendation_status ?? "Needs Review"],
          ["Approval status", "Needs Review"],
        ]} />
        <SignalList title="Why decisions were reached" values={(comparison?.summary ?? []).map((item) => `${item.parcel_id}: ${item.decision} - ${item.main_advantage}; risk: ${item.main_risk}`)} />
        <SignalList title="Conditions before advancing" values={activeAnalysis?.evidence_still_missing ?? []} />
      </>
    );
  }
  if (tab === "Due Diligence") {
    return (
      <div className="investment-three-column">
        {[
          ["Immediate Verification", dueDiligence?.immediate_verification ?? []],
          ["Technical Due Diligence", dueDiligence?.technical_due_diligence ?? []],
          ["Financial and Market Review", dueDiligence?.financial_and_market_review ?? []],
        ].map(([title, values]) => (
          <section className="investment-signal-list" key={String(title)}>
            <h3>{String(title)}</h3>
            {(values as string[]).map((item) => <p key={item}><span className="investment-chip">Needs Verification</span> {item}</p>)}
          </section>
        ))}
      </div>
    );
  }
  if (tab === "Deliverables") {
    return (
      <>
        <div className="investment-table-wrap">
          <table className="investment-table investment-table--compact">
            <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Source</th><th>Review</th></tr></thead>
            <tbody>{deliverables.map((item) => <tr key={`${item.title}-${item.type}`}><td>{item.title}</td><td>{item.type}</td><td>{item.status}</td><td>{item.source}</td><td>{item.review_status ?? "Needs Review"}</td></tr>)}</tbody>
          </table>
        </div>
        {codexBriefMarkdown ? <textarea className="investment-input mt-4 min-h-64" readOnly value={codexBriefMarkdown} /> : null}
      </>
    );
  }
  return (
    <>
      <SignalList title="Activity" values={(caseStudy.activity ?? []).map((item) => `${formatDate(item.timestamp)} - ${item.action}: ${item.safe_summary}`)} />
      <SignalList title="Limitations" values={limitations?.case_study_limitations ?? packageData?.safety_rules ?? []} />
    </>
  );
}

function ScoreBreakdown({ candidate }: { candidate: CaseStudyCandidate }) {
  return (
    <details className="investment-disclosure mt-3">
      <summary>100-point score explanation</summary>
      <div className="investment-table-wrap mt-3">
        <table className="investment-table investment-table--compact">
          <thead><tr><th>Category</th><th>Max</th><th>Points</th><th>Explanation</th></tr></thead>
          <tbody>
            {(candidate.score_categories ?? []).map((item) => (
              <tr key={item.category}>
                <td>{item.category}</td>
                <td>{item.maximum_points}</td>
                <td>{item.awarded_points}</td>
                <td>{item.analyst_explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="investment-disclaimer mt-3">This score is an explainable analyst screening aid. It is not a probability, not Model Lab output, not an appraisal, and not a purchase recommendation.</div>
    </details>
  );
}

function Matrix({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="investment-matrix">
      {rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}

function SignalList({ compact = false, title, values }: { compact?: boolean; title?: string; values: string[] }) {
  if (!values.length) return <p className="investment-empty">No entries yet.</p>;
  return (
    <div className={compact ? "investment-signal-list" : "investment-signal-list mt-4"}>
      {title ? <h3>{title}</h3> : null}
      {values.map((value) => <p key={value}>{value}</p>)}
    </div>
  );
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "Not available";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "number") return displayCount(value);
  return String(value);
}

function displayCount(value: unknown) {
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value == null || value === "") return "Not available";
  return String(value);
}

function titleText(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
}

function currentCaseStudyWorkflowStep(stage: string): (typeof caseStudyWorkflowSteps)[number] {
  const normalized = stage.toLowerCase();
  if (normalized.includes("deliverable")) return "Deliverables";
  if (normalized.includes("recommend")) return "Recommendation";
  if (normalized.includes("underwriting")) return "Underwriting";
  if (normalized.includes("deep")) return "Deep Analysis";
  if (normalized.includes("candidate")) return "Candidate Review";
  if (normalized.includes("screen")) return "Screening";
  return "Strategy";
}

function workflowStepToTab(step: (typeof caseStudyWorkflowSteps)[number]): CaseStudyTab {
  if (step === "Candidate Review") return "Candidates";
  if (step === "Deep Analysis") return "Deep Dive";
  return step;
}

type CaseStudyPackage = {
  active_parcel_id?: string;
  artifacts?: {
    active_property_analysis?: {
      developable_area?: DevelopableArea;
      evidence_still_missing?: string[];
      recommendation?: string;
      what_limits_development_potential?: string[];
      what_makes_it_interesting?: string[];
    };
    candidate_comparison?: {
      summary?: Array<{ decision: string; main_advantage: string; main_risk: string; parcel_id: string }>;
    };
    developable_area_analysis?: {
      candidates?: DevelopableArea[];
      critical_rule?: string;
      method?: string;
    };
    due_diligence_plan?: {
      financial_and_market_review?: string[];
      immediate_verification?: string[];
      technical_due_diligence?: string[];
    };
    limitations?: { case_study_limitations?: string[] };
    screening_funnel?: {
      counts?: Record<string, number>;
      criteria?: string[];
    };
    shortlisted_candidates?: {
      candidates?: CaseStudyCandidate[];
    };
    strategy?: {
      primary_requirements?: Record<string, unknown>;
      strategy?: string;
    };
    underwriting_scenarios?: {
      asking_price_status?: string;
      scenario_source?: string;
      scenarios?: Array<{
        developable_acres?: number;
        estimated_units_or_lots?: number;
        largest_sensitivity_drivers?: string[];
        scenario: string;
      }>;
      status?: string;
    };
  };
  client_label?: string;
  deliverables?: Array<{
    last_updated?: string;
    path?: string;
    reference_id?: string;
    review_status?: string;
    source: string;
    status: string;
    title: string;
    type: string;
  }>;
  deliverable_status?: string;
  engagement?: { criteria?: Array<{ criterion: string; source?: string; type: string }> };
  excel_workbook_status?: string;
  next_action?: string;
  recommendation_status?: string;
  safety_rules?: string[];
  underwriting_status?: string;
};

type DevelopableArea = {
  additional_open_space_stormwater_assumption_percent?: number;
  estimated_developable_acres?: number;
  gross_acres?: number;
  method_label?: string;
  parcel_id?: string;
  preliminary_net_acres_after_unioned_flood_wetland?: number;
  unioned_flood_wetland_constraint_acres?: number;
};

type CaseStudyCandidate = {
  data_confidence?: string;
  decision: string;
  gross_acres?: number;
  major_cautions?: string[];
  missing_information?: string[];
  parcel_id: string;
  positive_evidence?: string[];
  preliminary_developable_acres?: number;
  review_band: string;
  role_in_case_study?: string;
  score_categories?: Array<{
    analyst_explanation: string;
    awarded_points: number;
    category: string;
    maximum_points: number;
  }>;
  screening_score: number;
  why_it_surfaced?: string;
};
