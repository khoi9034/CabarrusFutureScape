"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { InvestmentCaseStudy, InvestmentCaseStudyCandidate } from "@/types/api";

type InvestmentCaseStudiesProps = {
  activeCaseStudy: InvestmentCaseStudy | null;
  caseStudies: InvestmentCaseStudy[];
  codexBriefMarkdown?: string | null;
  initialUrlState?: InitialCaseStudyUrlState;
  status?: string | null;
  onAnalyzeParcel: (parcelId: string, label?: string) => void;
  onArchive: (slug: string) => void;
  onDuplicate: (slug: string) => void;
  onExportBrief: (slug: string) => void;
  onMakeActive: (slug: string, parcelId: string) => void;
  onOpen: (slug: string) => void;
  onOpenFindSites: () => void;
  onOpenIntake: () => void;
  onSaveNote: (slug: string, note: string) => void;
};

const workflowSteps = [
  { id: "define", label: "Define" },
  { id: "screen", label: "Screen" },
  { id: "shortlist", label: "Shortlist" },
  { id: "analyze", label: "Analyze" },
  { id: "underwrite", label: "Underwrite" },
  { id: "decide", label: "Decide" },
  { id: "deliver", label: "Deliver" },
] as const;

type WorkflowStep = (typeof workflowSteps)[number]["id"];
const casePanels = ["assumptions", "compare", "criteria", "rerun-screening", "change-decision", "remove-candidate", "report", "artifact", "package-status"] as const;
type CasePanel = (typeof casePanels)[number];
export type InitialCaseStudyUrlState = {
  item?: string | null;
  panel?: string | null;
  slug?: string | null;
  step?: string | null;
};

export function InvestmentCaseStudies({
  activeCaseStudy,
  caseStudies,
  codexBriefMarkdown,
  initialUrlState,
  status,
  onAnalyzeParcel,
  onArchive,
  onDuplicate,
  onExportBrief,
  onMakeActive,
  onOpen,
  onOpenFindSites,
  onOpenIntake,
  onSaveNote,
}: InvestmentCaseStudiesProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("updated");
  const initialCaseStudyUrlState = normalizeInitialCaseStudyUrl(initialUrlState);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(() => initialCaseStudyUrlState.slug);
  const [step, setStep] = useState<WorkflowStep>(() => initialCaseStudyUrlState.step ?? "analyze");
  const [panel, setPanel] = useState<CasePanel | null>(() => initialCaseStudyUrlState.panel);
  const [panelItem, setPanelItem] = useState<string | null>(() => initialCaseStudyUrlState.item);
  const [note, setNote] = useState("");
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...caseStudies]
      .filter((item) => statusFilter === "All" || item.status === statusFilter)
      .filter((item) => !normalized || [item.title, item.description, item.geography, item.current_stage].join(" ").toLowerCase().includes(normalized))
      .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title) : String(right.updated_at).localeCompare(String(left.updated_at)));
  }, [caseStudies, query, sort, statusFilter]);
  const selected = workspaceSlug
    ? caseStudies.find((item) => item.slug === workspaceSlug) ?? activeCaseStudy ?? visible[0] ?? null
    : null;
  const selectedSlug = selected?.slug;

  useEffect(() => {
    const syncCaseStudyUrl = () => {
      const next = readCaseStudyUrl();
      setWorkspaceSlug(next.slug);
      setStep(next.step ?? "analyze");
      setPanel(next.panel);
      setPanelItem(next.item);
    };
    window.addEventListener("popstate", syncCaseStudyUrl);
    window.addEventListener("pageshow", syncCaseStudyUrl);
    window.addEventListener("cfs:case-study-url", syncCaseStudyUrl);
    return () => {
      window.removeEventListener("popstate", syncCaseStudyUrl);
      window.removeEventListener("pageshow", syncCaseStudyUrl);
      window.removeEventListener("cfs:case-study-url", syncCaseStudyUrl);
    };
  }, []);

  useEffect(() => {
    if (selectedSlug) stepHeadingRef.current?.focus();
  }, [selectedSlug, step]);

  const openWorkspace = (slug: string) => {
    const nextStep = "analyze" as const;
    setWorkspaceSlug(slug);
    setStep(nextStep);
    setPanel(null);
    setPanelItem(null);
    writeCaseStudyUrl(slug, nextStep, null, null, "push");
    onOpen(slug);
  };
  const backToLibrary = () => {
    setWorkspaceSlug(null);
    setPanel(null);
    setPanelItem(null);
    writeCaseStudyUrl(null, null, null, null, "push");
  };
  const chooseStep = (nextStep: WorkflowStep) => {
    if (!selected) return;
    setStep(nextStep);
    setPanel(null);
    setPanelItem(null);
    writeCaseStudyUrl(selected.slug, nextStep, null, null, "push");
  };
  const openPanel = (nextStep: WorkflowStep, nextPanel: CasePanel, item?: string | null) => {
    if (!selected) return;
    setStep(nextStep);
    setPanel(nextPanel);
    setPanelItem(item ?? null);
    writeCaseStudyUrl(selected.slug, nextStep, nextPanel, item ?? null, "push");
  };
  const closePanel = () => {
    if (!selected) return;
    setPanel(null);
    setPanelItem(null);
    writeCaseStudyUrl(selected.slug, step, null, null, "push");
  };
  const reviewAssumptions = () => openPanel("underwrite", "assumptions");
  const clearLibraryFilters = () => {
    setQuery("");
    setStatusFilter("All");
    setSort("updated");
  };

  if (!selected) {
    return (
      <section className="investment-card case-study-library" aria-label="Case Studies library">
        <div className="investment-section-heading">
          <div>
            <p>Case Studies</p>
            <h2>Open a saved acquisition review</h2>
            <span className="investment-muted">Continue a project, import a package, or create a new case study.</span>
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
            Sort
            <select className="investment-select" onChange={(event) => setSort(event.target.value)} value={sort}>
              <option value="updated">Last updated</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
        {visible.length ? (
          <div className="case-study-card-grid">
            {visible.map((item) => {
              const normalized = normalizeCaseStudy(item);
              return (
                <article className="investment-result-card" key={item.slug}>
                  <span>{item.status}</span>
                  <h3>{item.title}</h3>
                  <Matrix rows={[
                    ["Strategy", item.strategy],
                    ["Geography", item.geography],
                    ["Current stage", item.current_stage],
                    ["Candidates", displayCount(normalized.candidates.length || item.candidate_count)],
                    ["Priority candidate", item.priority_candidate_id ?? "Not set"],
                    ["Last updated", formatDate(item.updated_at)],
                  ]} />
                  <p>{normalized.nextAction}</p>
                  <div className="investment-row-actions mt-3">
                    <button className="investment-primary-button" onClick={() => openWorkspace(item.slug)} type="button">Continue</button>
                    <button onClick={() => onDuplicate(item.slug)} type="button">Duplicate</button>
                    <button onClick={() => onArchive(item.slug)} type="button">Archive</button>
                    <button onClick={() => onExportBrief(item.slug)} type="button">Export Codex Brief</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="investment-empty">
            No case studies match those filters.
            <div className="investment-row-actions mt-3">
              <button className="investment-primary-button" onClick={clearLibraryFilters} type="button">Clear Filters</button>
              <button className="investment-ghost-button" onClick={onOpenFindSites} type="button">Open Find Sites</button>
            </div>
          </div>
        )}
        {status ? <p className="investment-status">{status}</p> : null}
      </section>
    );
  }

  const normalized = normalizeCaseStudy(selected);
  const activeParcelId = selected.active_parcel_id ?? normalized.caseStudy.active_parcel_id ?? selected.priority_candidate_id ?? null;
  const currentCandidate = normalized.candidates.find((candidate) => candidate.parcel_id === activeParcelId) ?? normalized.candidates[0] ?? null;
  const continueStep = nextWorkflowStep(step);

  return (
    <section className="case-study-workspace" aria-label="Case study workspace">
      <section className="investment-card case-study-workspace-header">
        <button className="investment-ghost-button" onClick={backToLibrary} type="button">Back to Case Studies</button>
        <div className="investment-section-heading">
          <div>
            <p>{selected.case_study_type}</p>
            <h2 ref={titleRef} tabIndex={-1}>{selected.title}</h2>
            <span className="investment-muted">Development-Land Acquisition Review</span>
          </div>
          <span className="investment-pill">{selected.status}</span>
        </div>
        <div className="investment-step-strip" aria-label="Case-study metadata">
          <span>Status: {selected.status}</span>
          <span>Stage: {selected.current_stage}</span>
          <span>Geography: {selected.geography}</span>
          <span>Active candidate: {activeParcelId ?? "Not set"}</span>
          <span>Updated: {formatDate(selected.updated_at)}</span>
        </div>
        <div className="investment-row-actions mt-4">
          <button className="investment-primary-button" onClick={() => chooseStep(continueStep)} type="button">Continue Next Step</button>
          <button className="investment-ghost-button" onClick={() => activeParcelId ? onAnalyzeParcel(activeParcelId, selected.title) : undefined} type="button">Open Active Property</button>
          <button className="investment-ghost-button" onClick={() => openPanel(step, "compare")} type="button">Compare Candidates</button>
          <button className="investment-ghost-button" onClick={() => onExportBrief(selected.slug)} type="button">Export Codex Brief</button>
          <details className="investment-active-overflow">
            <summary>More</summary>
            <button onClick={reviewAssumptions} type="button">Start Underwriting</button>
            <button onClick={() => openPanel("deliver", "report")} type="button">Create Report</button>
            <button onClick={() => onDuplicate(selected.slug)} type="button">Duplicate</button>
            <button onClick={() => onArchive(selected.slug)} type="button">Archive</button>
          </details>
        </div>
      </section>

      <section className="investment-card">
        <div className="consulting-workflow-stepper" aria-label="Case-study workflow">
          {workflowSteps.map((item) => {
            const status = normalized.workflow[item.label] ?? "Needs Review";
            return (
              <button aria-current={step === item.id ? "step" : undefined} key={item.id} onClick={() => chooseStep(item.id)} type="button">
                <strong>{item.label}</strong>
                <span>{status}</span>
              </button>
            );
          })}
        </div>
      </section>

      {step === "define" ? <CaseStudyOverview normalized={normalized} selected={selected} /> : null}
      <CaseStudyStep
        activeParcelId={activeParcelId}
        candidate={currentCandidate}
        codexBriefMarkdown={codexBriefMarkdown}
        normalized={normalized}
        note={note || String(selected.user_state?.analyst_note ?? "")}
        onAnalyzeParcel={onAnalyzeParcel}
        onCompare={() => openPanel(step, "compare")}
        onExportBrief={() => onExportBrief(selected.slug)}
        onMakeActive={(parcelId) => onMakeActive(selected.slug, parcelId)}
        onNoteChange={setNote}
        onOpenFindSites={onOpenFindSites}
        onOpenIntake={onOpenIntake}
        onOpenPanel={openPanel}
        onReport={() => openPanel("deliver", "report")}
        onSaveNote={() => onSaveNote(selected.slug, note || String(selected.user_state?.analyst_note ?? ""))}
        headingRef={stepHeadingRef}
        onUnderwrite={reviewAssumptions}
        selected={selected}
        step={step}
      />
      {panel ? (
        <CaseStudyPanel
          item={panelItem}
          normalized={normalized}
          onClose={closePanel}
          panel={panel}
          selected={selected}
        />
      ) : null}
      <details className="investment-disclosure">
        <summary>Interpretation and safety</summary>
        <SignalList values={normalized.limitations.length ? normalized.limitations : [
          "Screening-level research only.",
          "Not investment advice, not an appraisal, and not a purchase recommendation.",
          "Utility capacity, access, title, entitlement, and field environmental conditions require professional verification.",
        ]} />
      </details>
    </section>
  );
}

function CaseStudyOverview({ normalized, selected }: { normalized: NormalizedCaseStudy; selected: InvestmentCaseStudy }) {
  const funnel = normalized.funnel;
  return (
    <section className="investment-card case-study-overview">
      <div className="investment-section-heading"><div><p>Overview</p><h2>What this case study is answering</h2></div></div>
      <div className="investment-two-column">
        <div>
          <Matrix rows={[
            ["Assignment", "Which large Cabarrus County properties should advance into formal acquisition and due-diligence review?"],
            ["Current status", selected.status],
            ["Next action", normalized.nextAction],
          ]} />
          <div className="case-study-funnel" aria-label="Candidate funnel">
            {[funnel.countywide_reviewed, funnel.minimum_acreage_pass, funnel.initial_screen_pass, funnel.manual_review_count, funnel.final_shortlist_count].map((value, index) => (
              <span key={index}>{displayCount(value)}</span>
            ))}
          </div>
        </div>
        <div>
          <SignalList title="Current shortlist" values={normalized.candidates.map((candidate) => `${candidate.role_in_case_study ?? "Candidate"}: ${candidate.parcel_id} - ${candidate.decision ?? "Needs review"}`)} />
          <SignalList title="Main unresolved risks" values={[
            "Utility capacity",
            "Legal access",
            "Zoning interpretation",
            "Asking basis",
            "Environmental field verification",
            "Infrastructure cost",
          ]} />
        </div>
      </div>
    </section>
  );
}

function CaseStudyStep({
  activeParcelId,
  candidate,
  codexBriefMarkdown,
  headingRef,
  normalized,
  note,
  onAnalyzeParcel,
  onCompare,
  onExportBrief,
  onMakeActive,
  onNoteChange,
  onOpenFindSites,
  onOpenIntake,
  onOpenPanel,
  onReport,
  onSaveNote,
  onUnderwrite,
  selected,
  step,
}: {
  activeParcelId: string | null;
  candidate: InvestmentCaseStudyCandidate | null;
  codexBriefMarkdown?: string | null;
  normalized: NormalizedCaseStudy;
  note: string;
  onAnalyzeParcel: (parcelId: string, label?: string) => void;
  onCompare: () => void;
  onExportBrief: () => void;
  onMakeActive: (parcelId: string) => void;
  onNoteChange: (value: string) => void;
  onOpenFindSites: () => void;
  onOpenIntake: () => void;
  onOpenPanel: (step: WorkflowStep, panel: CasePanel, item?: string | null) => void;
  onReport: () => void;
  onSaveNote: () => void;
  onUnderwrite: () => void;
  selected: InvestmentCaseStudy;
  step: WorkflowStep;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  if (step === "define") {
    const strategy = normalized.strategy;
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Define</p><h2 ref={headingRef} tabIndex={-1}>Strategy and criteria</h2></div></div>
        <Matrix rows={[
          ["Client", normalized.caseStudy.client_label ?? "Hypothetical client"],
          ["Strategy", selected.strategy],
          ["Geography", selected.geography],
          ["Minimum acreage", displayCount(strategy.minimum_acres ?? 100)],
          ["Risk tolerance", "Use CFS screening evidence; verify utility, title, entitlement, access, and field conditions before advancing."],
        ]} />
        <SignalList title="Criteria" values={normalized.criteria} />
        <label className="mt-4 grid gap-2 text-xs text-[var(--investment-text-muted)]">
          Analyst note
          <textarea className="investment-input min-h-24" onChange={(event) => onNoteChange(event.target.value)} value={note} />
        </label>
        <button className="investment-primary-button mt-3" onClick={onSaveNote} type="button">Save Note</button>
      </section>
    );
  }
  if (step === "screen") {
    const funnel = normalized.funnel;
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Screen</p><h2 ref={headingRef} tabIndex={-1}>Saved screening revision</h2></div><span className="investment-pill">{displayCount(funnel.final_shortlist_count)} shortlisted</span></div>
        <Matrix rows={[
          ["Screening question", "Which large Cabarrus County parcels meet the development-land review criteria?"],
          ["Search date", String(funnel.screened_at ?? "Not available")],
          ["Data vintage", String(funnel.data_vintage ?? "Not available")],
          ["Countywide reviewed", displayCount(funnel.countywide_reviewed)],
          ["Minimum acreage pass", displayCount(funnel.minimum_acreage_pass)],
          ["Evidence ready", displayCount(funnel.evidence_ready)],
          ["Initial screen pass", displayCount(funnel.initial_screen_pass)],
          ["Manual review", displayCount(funnel.manual_review_count)],
          ["Final shortlist", displayCount(funnel.final_shortlist_count)],
          ["Reproducibility", "Saved package revision; reruns create a new screening revision."],
        ]} />
        <SignalList title="Criteria used" values={normalized.criteria} />
        <div className="investment-row-actions mt-4">
          <button className="investment-primary-button" onClick={onOpenFindSites} type="button">Open Find Sites</button>
          <button className="investment-ghost-button" onClick={() => onOpenPanel("screen", "criteria")} type="button">View Criteria</button>
          <button className="investment-ghost-button" onClick={onExportBrief} type="button">Export Funnel</button>
          <details className="investment-active-overflow">
            <summary>More</summary>
            <button onClick={() => onOpenPanel("screen", "rerun-screening")} type="button">Rerun Screening</button>
            <p className="investment-muted">Rerunning may create a new screening revision. Existing reviewed results will be preserved.</p>
          </details>
        </div>
      </section>
    );
  }
  if (step === "shortlist") {
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Shortlist</p><h2 ref={headingRef} tabIndex={-1}>Three candidate decisions</h2></div></div>
        {normalized.candidates.length ? (
          <div className="case-study-card-grid">
            {normalized.candidates.map((item) => (
              <article className="investment-result-card" key={item.parcel_id}>
                <span>{item.role_in_case_study ?? "Candidate"}</span>
                <h3>{item.parcel_id}</h3>
                <p>{item.why_it_surfaced ?? "Case-study candidate evidence requires review."}</p>
                <Matrix rows={[
                  ["Case-study acreage", displayCount(item.gross_acres)],
                  ["Developable estimate", displayCount(item.developable_area_estimate ?? item.preliminary_developable_acres)],
                  ["Screening score", typeof item.screening_score === "number" ? `${item.screening_score}/100` : "Score unavailable - case-study sync requires review"],
                  ["Review band", item.review_band ?? "Needs review"],
                  ["Decision", item.decision ?? "Needs review"],
                  ["Data confidence", item.data_confidence ?? "Needs Verification"],
                  ["Verification burden", item.verification_burden ?? ((item.missing_information ?? []).slice(0, 2).join("; ") || "Needs verification")],
                ]} />
                <SignalList compact title="Biggest advantage" values={[item.main_advantage ?? item.positive_evidence?.[0] ?? "Needs analyst review"]} />
                <SignalList compact title="Biggest risk" values={[item.main_risk ?? item.major_cautions?.[0] ?? "Needs analyst review"]} />
                <SignalList compact title="Missing evidence" values={(item.missing_evidence ?? item.missing_information ?? []).slice(0, 3)} />
                <ScoreBreakdown candidate={item} />
                <div className="investment-row-actions mt-3">
                  <button className="investment-primary-button" onClick={() => onAnalyzeParcel(item.parcel_id, item.parcel_id)} type="button">Analyze</button>
                  <button onClick={onCompare} type="button">Compare</button>
                  <details className="investment-active-overflow">
                    <summary>More</summary>
                    <button onClick={() => onMakeActive(item.parcel_id)} type="button">Make Active</button>
                    <button onClick={onUnderwrite} type="button">Start Underwriting</button>
                    <button onClick={() => onOpenPanel("shortlist", "change-decision", item.parcel_id)} type="button">Change Decision</button>
                    <button onClick={() => onOpenPanel("shortlist", "remove-candidate", item.parcel_id)} type="button">Remove from Case Study</button>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : <MissingState message="The case-study package is linked, but detailed candidate evidence has not been synchronized." onViewPackageStatus={() => onOpenPanel("shortlist", "package-status")} />}
      </section>
    );
  }
  if (step === "analyze") {
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Analyze</p><h2 ref={headingRef} tabIndex={-1}>Active property evidence</h2></div><span className="investment-pill">{activeParcelId ?? "No active parcel"}</span></div>
        {candidate ? (
          <>
            <Matrix rows={[
              ["Candidate role", candidate.role_in_case_study ?? "Candidate"],
              ["Current decision", candidate.decision ?? "Needs review"],
              ["Case-study score", typeof candidate.screening_score === "number" ? `${candidate.screening_score}/100` : "Score unavailable"],
              ["Case-study acreage", displayCount(candidate.gross_acres)],
              ["Developable-area estimate", displayCount(candidate.developable_area_estimate ?? candidate.preliminary_developable_acres)],
              ["Current CFS evidence", "Open Analyze Property for live planning, market, access, constraints, financial context, verification, and sources."],
            ]} />
            <SignalList title="Evidence still missing" values={candidate.missing_evidence ?? candidate.missing_information ?? []} />
            <button className="investment-primary-button mt-4" onClick={() => onAnalyzeParcel(candidate.parcel_id, selected.title)} type="button">Analyze Property</button>
          </>
        ) : <MissingState message="No active case-study candidate is selected." onViewPackageStatus={() => onOpenPanel("analyze", "package-status")} />}
      </section>
    );
  }
  if (step === "underwrite") {
    const diagnosticResults = normalized.diagnosticScenarios.map((scenario) =>
      `${scenario.scenario} residual after selling/carry: ${formatMoneyMillions(scenario.residual_after_selling_carry)} - ${scenario.status ?? "Needs Review"}`,
    );
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Underwrite</p><h2 ref={headingRef} tabIndex={-1}>Assumptions Required</h2></div></div>
        <div className="investment-two-column">
          <SignalList title="Evidence already available" values={[
            `Gross acreage: ${displayCount(candidate?.gross_acres)}`,
            `Developable-area screening estimate: ${displayCount(candidate?.developable_area_estimate ?? candidate?.preliminary_developable_acres)}`,
            "Planning evidence",
            "Market context",
            "Environmental context",
            "Utility proximity proxy",
            "Transportation context",
          ]} />
          <SignalList title="Analyst inputs still required" values={[
            "Density",
            "Unit or lot count",
            "Finished-lot or unit value",
            "Development cost",
            "Utility-extension allowance",
            "Timeline",
            "Contingency",
            "Developer margin",
            "Scenario acquisition basis",
          ]} />
          {diagnosticResults.length ? <SignalList title="Diagnostic residual results" values={diagnosticResults} /> : null}
        </div>
        {diagnosticResults.length ? (
          <p className="investment-empty mt-4">No scenario supports a positive land basis; targeted diligence only; do not advance to acquisition pricing yet.</p>
        ) : null}
        <button className="investment-primary-button mt-4" onClick={onUnderwrite} type="button">Review Assumptions</button>
      </section>
    );
  }
  if (step === "decide") {
    return (
      <section className="investment-card">
        <div className="investment-section-heading"><div><p>Decide</p><h2 ref={headingRef} tabIndex={-1}>Recommendation and due diligence</h2></div><span className="investment-pill">Needs Review</span></div>
        <Matrix rows={[
          ["Priority candidate", selected.priority_candidate_id ?? "Not set"],
          ["Secondary candidate", normalized.candidates[1]?.parcel_id ?? "Not set"],
          ["Deferred candidate", normalized.candidates[2]?.parcel_id ?? "Not set"],
          ["Recommendation status", String(normalized.recommendation.status ?? "Needs Review")],
          ["Approval status", "Needs Review"],
        ]} />
        <SignalList title="Conditions & due diligence" values={normalized.dueDiligence.immediate_verification ?? []} />
      </section>
    );
  }
  return (
    <section className="investment-card">
      <div className="investment-section-heading"><div><p>Deliver</p><h2 ref={headingRef} tabIndex={-1}>Deliverable checklist</h2></div></div>
      <div className="investment-table-wrap">
        <table className="investment-table investment-table--compact">
          <thead><tr><th>Deliverable</th><th>Type</th><th>Status</th><th>Review</th></tr></thead>
          <tbody>{normalized.deliverables.map((item, index) => <tr key={`${item.title}-${item.type}`}><td>{item.title}</td><td>{item.type}</td><td>{item.status}</td><td><button onClick={() => onOpenPanel("deliver", "artifact", String(index))} type="button">{item.review_status ?? "Review"}</button></td></tr>)}</tbody>
        </table>
      </div>
      <div className="investment-row-actions mt-4">
        <button className="investment-primary-button" onClick={onReport} type="button">Create Report</button>
        <button className="investment-ghost-button" onClick={onOpenIntake} type="button">Add External Opportunity</button>
      </div>
      {codexBriefMarkdown ? <textarea className="investment-input mt-4 min-h-64" readOnly value={codexBriefMarkdown} /> : null}
    </section>
  );
}

function ScoreBreakdown({ candidate }: { candidate: InvestmentCaseStudyCandidate }) {
  const rows = candidate.score_breakdown ?? candidate.score_categories ?? [];
  return (
    <details className="investment-disclosure mt-3">
      <summary>Score breakdown</summary>
      <div className="investment-table-wrap mt-3">
        <table className="investment-table investment-table--compact">
          <thead><tr><th>Category</th><th>Points</th><th>Evidence</th></tr></thead>
          <tbody>{rows.map((item) => {
            const row = item as Record<string, unknown>;
            return (
              <tr key={String(row.category)}>
                <td>{String(row.category)}</td>
                <td>{displayCount(row.awarded_points)} / {displayCount(row.maximum_points)}</td>
                <td>{String(row.analyst_explanation ?? row.available_evidence ?? "Needs review")}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="investment-disclaimer mt-3">This is an analyst screening score, not a development probability or purchase recommendation.</div>
    </details>
  );
}

function Matrix({ rows }: { rows: Array<[string, string]> }) {
  return <div className="investment-matrix">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function SignalList({ compact = false, title, values }: { compact?: boolean; title?: string; values: string[] }) {
  if (!values.length) return <p className="investment-empty">No evidence is attached yet. Retry sync or review the case-study package status.</p>;
  return <div className={compact ? "investment-signal-list" : "investment-signal-list mt-4"}>{title ? <h3>{title}</h3> : null}{values.map((value) => <p key={value}>{value}</p>)}</div>;
}

function CaseStudyPanel({
  item,
  normalized,
  onClose,
  panel,
  selected,
}: {
  item: string | null;
  normalized: NormalizedCaseStudy;
  onClose: () => void;
  panel: CasePanel;
  selected: InvestmentCaseStudy;
}) {
  const candidate = normalized.candidates.find((row) => row.parcel_id === item) ?? normalized.candidates[0] ?? null;
  const artifact = panel === "artifact" ? normalized.deliverables[Number(item)] : null;
  const artifactHref = caseStudyArtifactHref(artifact);
  const title = {
    artifact: artifact?.title ?? "Deliverable review",
    assumptions: "Underwriting assumption review",
    compare: "Candidate comparison",
    criteria: "Screening criteria",
    "change-decision": "Decision change review",
    "package-status": "Package status",
    "remove-candidate": "Candidate removal review",
    report: "Report preparation",
    "rerun-screening": "Screening rerun review",
  }[panel];
  return (
    <section className="investment-card" aria-label={title}>
      <div className="investment-section-heading">
        <div><p>Project detail</p><h2>{title}</h2></div>
        <button className="investment-ghost-button" onClick={onClose} type="button">Return to {panel === "artifact" || panel === "report" ? "Deliver" : panel === "assumptions" ? "Underwrite" : "Project"}</button>
      </div>
      {panel === "assumptions" ? (
        <div className="investment-two-column">
          <SignalList title="Prefilled from CFS evidence" values={[
            `Active candidate: ${candidate?.parcel_id ?? selected.priority_candidate_id ?? "Not set"}`,
            `Gross acreage: ${displayCount(candidate?.gross_acres)}`,
            `Developable-area screening estimate: ${displayCount(candidate?.developable_area_estimate ?? candidate?.preliminary_developable_acres)}`,
            "Planning, market, transportation, utility-proxy, and environmental context are evidence inputs.",
          ]} />
          {normalized.diagnosticScenarios.length ? (
            <SignalList title="Diagnostic residual results" values={normalized.diagnosticScenarios.map((scenario) => `${scenario.scenario}: ${formatMoneyMillions(scenario.residual_after_selling_carry)} after selling/carry`)} />
          ) : null}
          <SignalList title="Still needs analyst approval" values={["Density", "Revenue/value basis", "Horizontal costs", "Utility and off-site allowances", "Timeline", "Contingency", "Developer margin", "Scenario acquisition basis"]} />
        </div>
      ) : null}
      {panel === "compare" ? (
        <div className="investment-table-wrap">
          <table className="investment-table investment-table--compact">
            <thead><tr><th>Parcel</th><th>Role</th><th>Score</th><th>Developable estimate</th><th>Decision</th></tr></thead>
            <tbody>{normalized.candidates.map((row) => <tr key={row.parcel_id}><td>{row.parcel_id}</td><td>{row.role_in_case_study ?? "Candidate"}</td><td>{displayCount(row.screening_score)}</td><td>{displayCount(row.developable_area_estimate ?? row.preliminary_developable_acres)}</td><td>{row.decision ?? "Needs review"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {panel === "criteria" ? <SignalList values={normalized.criteria} /> : null}
      {panel === "rerun-screening" ? <p className="investment-empty">Rerunning is intentionally blocked for this preserved package. Create a new screening revision before replacing reviewed results.</p> : null}
      {panel === "change-decision" ? <p className="investment-empty">Decision changes require analyst approval for {candidate?.parcel_id ?? "the selected candidate"} before the CASE-1 package is updated.</p> : null}
      {panel === "remove-candidate" ? <p className="investment-empty">Candidate removal is blocked for this validated shortlist. Start a new revision to change the reviewed three-candidate package.</p> : null}
      {panel === "report" ? <SignalList title="Available deliverables" values={normalized.deliverables.map((row) => `${row.title}: ${row.status}; ${row.review_status ?? "Needs Review"}`)} /> : null}
      {panel === "artifact" ? (
        <>
          <Matrix rows={[
            ["Deliverable", artifact?.title ?? "Not found"],
            ["Type", artifact?.type ?? "Not available"],
            ["Status", artifact?.status ?? "Not available"],
            ["Review status", artifact?.review_status ?? "Needs Review"],
            ["Package path", artifact?.path ?? "Not available"],
          ]} />
          {artifactHref ? (
            <a className="investment-primary-button mt-4" href={artifactHref} rel="noreferrer" target="_blank">
              Open artifact
            </a>
          ) : (
            <p className="investment-empty mt-4">No downloadable artifact is registered for this deliverable.</p>
          )}
        </>
      ) : null}
      {panel === "package-status" ? <Matrix rows={[
        ["Case-study status", selected.status],
        ["Current stage", selected.current_stage],
        ["Underwriting", selected.underwriting_status ?? "Needs Review"],
        ["Deliverables", selected.deliverable_status ?? "Needs Review"],
      ]} /> : null}
    </section>
  );
}

function MissingState({ message, onViewPackageStatus }: { message: string; onViewPackageStatus?: () => void }) {
  return (
    <div className="investment-empty">
      {message}
      <div className="investment-row-actions mt-3">
        <button className="investment-primary-button" onClick={onViewPackageStatus} type="button">Retry</button>
        <button className="investment-ghost-button" onClick={onViewPackageStatus} type="button">View Package Status</button>
      </div>
    </div>
  );
}

function caseStudyArtifactHref(artifact: Deliverable | null) {
  const fileName = artifact?.path?.split(/[\\/]/).pop();

  if (!fileName) return null;
  if (fileName === "page.tsx") return "/case-studies/large-development-land";
  if (
    [
      "CFS_Development_Land_Acquisition_Review.pptx",
      "CFS_Development_Land_Underwriting.xlsx",
      "cfs-investment-acquisition-presentation.md",
      "cfs-investment-executive-recommendation.md",
      "cfs-investment-interview-walkthrough.md",
      "cfs-investment-large-development-land.md",
      "final_diagnostic_exhibits.json",
    ].includes(fileName)
  ) {
    return `/case-studies/large-development-land/artifacts/${encodeURIComponent(fileName)}`;
  }
  return null;
}

function normalizeCaseStudy(caseStudy: InvestmentCaseStudy): NormalizedCaseStudy {
  const packageData = caseStudy.package as CaseStudyPackage;
  const artifacts = packageData.artifacts ?? {};
  const candidates = (caseStudy.candidates?.length ? caseStudy.candidates : artifacts.shortlisted_candidates?.candidates ?? []).map(normalizeCandidate);
  const funnel = caseStudy.funnel ?? {};
  const rawWorkflow = caseStudy.workflow ?? [];
  const workflow = Object.fromEntries(workflowSteps.map((item) => [item.label, rawWorkflow.find((row) => row.step === item.label)?.status ?? defaultWorkflowStatus(item.label)]));
  return {
    caseStudy: caseStudy.case_study ?? {
      active_parcel_id: caseStudy.active_parcel_id,
      client_label: packageData.client_label,
      slug: caseStudy.slug,
      title: caseStudy.title,
    },
    candidates,
    criteria: (funnel.criteria as string[] | undefined) ?? artifacts.screening_funnel?.criteria ?? [],
    deliverables: (caseStudy.deliverables as Deliverable[] | undefined) ?? packageData.deliverables ?? [],
    diagnosticScenarios: artifacts.final_diagnostic_exhibits?.scenario_comparison ?? [],
    dueDiligence: (caseStudy.due_diligence as DueDiligence | undefined) ?? artifacts.due_diligence_plan ?? {},
    funnel: {
      countywide_reviewed: Number(funnel.countywide_reviewed ?? artifacts.screening_funnel?.counts?.countywide_parcels_reviewed),
      data_vintage: String(funnel.data_vintage ?? packageData.source_data_vintage ?? ""),
      evidence_ready: Number(funnel.evidence_ready ?? artifacts.screening_funnel?.counts?.parcels_with_usable_planning_and_investment_evidence),
      final_shortlist_count: Number(funnel.final_shortlist_count ?? artifacts.screening_funnel?.counts?.final_shortlist_count),
      initial_screen_pass: Number(funnel.initial_screen_pass ?? artifacts.screening_funnel?.counts?.parcels_passing_initial_screens),
      manual_review_count: Number(funnel.manual_review_count ?? artifacts.screening_funnel?.counts?.parcels_receiving_preliminary_manual_review),
      minimum_acreage_pass: Number(funnel.minimum_acreage_pass ?? artifacts.screening_funnel?.counts?.parcels_meeting_minimum_100_acres),
      screened_at: String(funnel.screened_at ?? artifacts.screening_funnel?.as_of ?? ""),
    },
    limitations: artifacts.limitations?.case_study_limitations ?? packageData.safety_rules ?? [],
    nextAction: packageData.next_action ?? "Review the active property's evidence and developable-area assumptions.",
    recommendation: (caseStudy.recommendation as Recommendation | undefined) ?? { status: packageData.recommendation_status },
    strategy: packageData.engagement ?? {},
    workflow,
  };
}

function normalizeCandidate(candidate: InvestmentCaseStudyCandidate): InvestmentCaseStudyCandidate {
  const positive = candidate.positive_evidence ?? [];
  const negative = candidate.negative_evidence ?? candidate.major_cautions ?? [];
  const missing = candidate.missing_evidence ?? candidate.missing_information ?? [];
  return {
    ...candidate,
    developable_area_estimate: candidate.developable_area_estimate ?? candidate.preliminary_developable_acres,
    main_advantage: candidate.main_advantage ?? positive[0],
    main_risk: candidate.main_risk ?? negative[0],
    missing_evidence: missing,
    negative_evidence: negative,
    score_breakdown: candidate.score_breakdown ?? candidate.score_categories,
    verification_burden: candidate.verification_burden ?? missing.slice(0, 2).join("; "),
  };
}

function readCaseStudyUrl(): { item: string | null; panel: CasePanel | null; slug: string | null; step: WorkflowStep | null } {
  if (typeof window === "undefined") return { item: null, panel: null, slug: null, step: null };
  const params = new URLSearchParams(window.location.search);
  const step = params.get("caseStep");
  const panel = params.get("casePanel");
  return {
    item: params.get("caseItem"),
    panel: isCasePanel(panel) ? panel : null,
    slug: params.get("caseStudy"),
    step: isWorkflowStep(step) ? step : null,
  };
}

function normalizeInitialCaseStudyUrl(state: InitialCaseStudyUrlState | undefined): {
  item: string | null;
  panel: CasePanel | null;
  slug: string | null;
  step: WorkflowStep | null;
} {
  const panel = state?.panel ?? null;
  const step = state?.step ?? null;
  return {
    item: state?.item ?? null,
    panel: isCasePanel(panel) ? panel : null,
    slug: state?.slug ?? null,
    step: isWorkflowStep(step) ? step : null,
  };
}

function writeCaseStudyUrl(slug: string | null, step: WorkflowStep | null, panel: CasePanel | null, item: string | null, mode: "push" | "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("app", "consulting");
  url.searchParams.set("consultingPage", "case-studies");
  url.searchParams.set("investmentPage", "engagements");
  if (slug) url.searchParams.set("caseStudy", slug);
  else url.searchParams.delete("caseStudy");
  if (step) url.searchParams.set("caseStep", step);
  else url.searchParams.delete("caseStep");
  if (panel) url.searchParams.set("casePanel", panel);
  else url.searchParams.delete("casePanel");
  if (item) url.searchParams.set("caseItem", item);
  else url.searchParams.delete("caseItem");
  if (url.href !== window.location.href) {
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
    window.dispatchEvent(new Event("cfs:case-study-url"));
  }
}

function nextWorkflowStep(step: WorkflowStep): WorkflowStep {
  const index = workflowSteps.findIndex((item) => item.id === step);
  return workflowSteps[Math.min(index + 1, workflowSteps.length - 1)].id;
}

function isWorkflowStep(value: string | null): value is WorkflowStep {
  return Boolean(value && workflowSteps.some((item) => item.id === value));
}

function isCasePanel(value: string | null): value is CasePanel {
  return Boolean(value && casePanels.includes(value as CasePanel));
}

function defaultWorkflowStatus(label: string) {
  if (["Define", "Screen", "Shortlist"].includes(label)) return "Complete";
  if (label === "Analyze") return "In Progress";
  if (label === "Underwrite") return "Assumptions Required";
  if (label === "Decide") return "Needs Review";
  return "Draft / Incomplete";
}

function displayCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value == null || value === "" || (typeof value === "number" && Number.isNaN(value))) return "Not available";
  return String(value);
}

function formatMoneyMillions(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not available";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${(Math.abs(value) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}M`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US");
}

type NormalizedCaseStudy = {
  caseStudy: NonNullable<InvestmentCaseStudy["case_study"]>;
  candidates: InvestmentCaseStudyCandidate[];
  criteria: string[];
  deliverables: Deliverable[];
  diagnosticScenarios: DiagnosticScenario[];
  dueDiligence: DueDiligence;
  funnel: {
    countywide_reviewed?: number;
    data_vintage?: string;
    evidence_ready?: number;
    final_shortlist_count?: number;
    initial_screen_pass?: number;
    manual_review_count?: number;
    minimum_acreage_pass?: number;
    screened_at?: string;
  };
  limitations: string[];
  nextAction: string;
  recommendation: Recommendation;
  strategy: { minimum_acres?: number; criteria?: Array<{ criterion?: string }> };
  workflow: Record<string, string>;
};

type CaseStudyPackage = {
  artifacts?: {
    due_diligence_plan?: DueDiligence;
    final_diagnostic_exhibits?: { scenario_comparison?: DiagnosticScenario[] };
    limitations?: { case_study_limitations?: string[] };
    screening_funnel?: {
      as_of?: string;
      counts?: Record<string, number>;
      criteria?: string[];
    };
    shortlisted_candidates?: { candidates?: InvestmentCaseStudyCandidate[] };
  };
  client_label?: string;
  deliverables?: Deliverable[];
  engagement?: { minimum_acres?: number; criteria?: Array<{ criterion?: string }> };
  next_action?: string;
  recommendation_status?: string;
  safety_rules?: string[];
  source_data_vintage?: string;
};

type DiagnosticScenario = {
  residual_after_selling_carry?: number;
  scenario: string;
  status?: string;
};

type Deliverable = {
  path?: string;
  review_status?: string;
  status: string;
  title: string;
  type: string;
};

type DueDiligence = {
  immediate_verification?: string[];
};

type Recommendation = {
  status?: unknown;
};
