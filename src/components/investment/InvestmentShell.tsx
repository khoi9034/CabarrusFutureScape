"use client";

import {
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  MapPinned,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export type InvestmentPageId =
  | "overview"
  | "opportunity-feed"
  | "area-radar"
  | "opportunity"
  | "intake"
  | "research"
  | "compare"
  | "market"
  | "underwriting"
  | "due-diligence"
  | "report-studio"
  | "engagements"
  | "report-bucket"
  | "methodology";

export const investmentPageGroups: Array<{
  pages: Array<{
    icon: typeof Gauge;
    id: InvestmentPageId;
    label: string;
  }>;
}> = [
  {
    pages: [
      { icon: Gauge, id: "overview", label: "Home" },
      { icon: BriefcaseBusiness, id: "engagements", label: "Projects" },
      { icon: Search, id: "area-radar", label: "Find Sites" },
      { icon: MapPinned, id: "research", label: "Property Review" },
      { icon: FileText, id: "report-studio", label: "Reports" },
    ],
  },
];

const legacyInvestmentPages: Array<(typeof investmentPageGroups)[number]["pages"][number]> = [
  { icon: Search, id: "opportunity-feed", label: "External Opportunities" },
  { icon: Search, id: "opportunity", label: "Advanced Screening" },
  { icon: Search, id: "intake", label: "Add External Opportunity" },
  { icon: Gauge, id: "market", label: "Market & Access" },
  { icon: Gauge, id: "underwriting", label: "Review Assumptions" },
  { icon: ShieldCheck, id: "due-diligence", label: "Due Diligence" },
  { icon: FileText, id: "report-bucket", label: "Supporting Exhibits" },
  { icon: BookOpen, id: "methodology", label: "Data & Methods" },
];

export const investmentPages = [...investmentPageGroups.flatMap((group) => group.pages), ...legacyInvestmentPages];

type InvestmentShellProps = {
  activePage: InvestmentPageId;
  activeProperty?: {
    acreage?: number | null;
    dataConfidence?: string | null;
    label: string;
    parcelId: string;
    researchStatus?: string | null;
    strategy?: string | null;
  } | null;
  activeProject?: {
    candidateCount?: number | null;
    propertyRole?: string | null;
    stage?: string | null;
    title: string;
  } | null;
  children: ReactNode;
  currentCandidateLabel?: string | null;
  dataMode: string;
  onAskCfs: () => void;
  onActiveAnalyze?: () => void;
  onActiveClear?: () => void;
  onActiveCompare?: () => void;
  onActiveReport?: () => void;
  onActiveShortlist?: () => void;
  onActiveUnderwrite?: () => void;
  onPageChange: (page: InvestmentPageId) => void;
};

export function InvestmentShell({
  activePage,
  activeProperty,
  activeProject,
  children,
  dataMode,
  onAskCfs,
  onActiveAnalyze,
  onActiveClear,
  onActiveCompare,
  onActiveReport,
  onActiveShortlist,
  onActiveUnderwrite,
  onPageChange,
}: InvestmentShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = consultingPageMeta[primaryPageFor(activePage)];
  return (
    <section className={`investment-shell ${collapsed ? "is-collapsed" : ""}`} aria-label="CFS Consulting">
      <aside className="investment-sidebar" aria-label="CFS Consulting navigation">
        <div className="investment-brand">
          <span className="investment-brand-mark"><BriefcaseBusiness className="h-4 w-4" /></span>
          <div>
            <p>CFS Consulting</p>
            <span>Real Estate Intelligence</span>
          </div>
          <button className="investment-icon-button" onClick={() => setCollapsed((value) => !value)} type="button" aria-label={collapsed ? "Expand CFS Consulting navigation" : "Collapse CFS Consulting navigation"}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="investment-nav">
          {investmentPageGroups.map((group) => (
            <div className="investment-nav-group" key="consulting">
              {group.pages.map(({ icon: Icon, id, label }) => (
                <button
                  aria-current={primaryPageFor(activePage) === id ? "page" : undefined}
                  aria-label={label}
                  title={label}
                  key={id}
                  onClick={() => onPageChange(id)}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span><strong>{label}</strong></span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button
          aria-current={primaryPageFor(activePage) === "methodology" ? "page" : undefined}
          aria-label="Data & Methods"
          className="investment-secondary-nav-link"
          onClick={() => onPageChange("methodology")}
          title="Data & Methods"
          type="button"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>Data & Methods</span>
        </button>
        <div className="investment-sidebar-footer">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <p><span className="investment-status-dot" aria-hidden="true" />{dataMode}</p>
        </div>
      </aside>
      <div className="investment-workspace">
        <header className="investment-header">
          <div>
            <h1>{active.label}</h1>
            <p>{active.description}</p>
          </div>
          <div className="investment-header-actions">
            <button className="investment-primary-button" onClick={() => onPageChange(active.primaryPage)} type="button">{active.primaryAction}</button>
            <button className="investment-ghost-button" onClick={onAskCfs} type="button"><Sparkles className="h-4 w-4" /> Ask CFS</button>
          </div>
        </header>
        {activeProject ? (
          <section className="investment-context-bar" aria-label="Active consulting context">
            <span><strong>Project</strong> {activeProject.title}</span>
            {activeProperty ? <span><strong>Property</strong> {activeProperty.parcelId}</span> : null}
            {activeProject.propertyRole ? <span><strong>Role</strong> {activeProject.propertyRole}</span> : null}
            {activeProject.stage ? <span><strong>Stage</strong> {activeProject.stage}</span> : null}
            {activeProject.candidateCount ? <span><strong>Candidates</strong> {activeProject.candidateCount}</span> : null}
            <button onClick={() => onPageChange("engagements")} type="button">Return to Project</button>
          </section>
        ) : null}
        {activeProperty ? (
          <section className="investment-active-property" aria-label="Active property">
            <div>
              <span>Active Property</span>
              <strong>{activeProperty.label}</strong>
              <small>
                Parcel {activeProperty.parcelId}
                {activeProperty.acreage ? ` · ${activeProperty.acreage.toLocaleString("en-US", { maximumFractionDigits: 2 })} acres` : ""}
                {activeProperty.strategy ? ` · ${activeProperty.strategy}` : ""}
                {activeProperty.dataConfidence ? ` · ${activeProperty.dataConfidence}` : ""}
                {activeProperty.researchStatus ? ` · Research ${activeProperty.researchStatus}` : ""}
              </small>
            </div>
            <div className="investment-row-actions">
              <button className="investment-primary-button" onClick={onActiveAnalyze} type="button">Review Property</button>
              <button onClick={onActiveCompare} type="button">Compare Candidates</button>
              <details className="investment-active-overflow">
                <summary><MoreHorizontal className="h-4 w-4" /> More</summary>
                <button onClick={onActiveShortlist} type="button">Add to Shortlist</button>
                <button onClick={onActiveUnderwrite} type="button">Review Assumptions</button>
                <button onClick={onActiveReport} type="button">Create Report</button>
                <button onClick={onActiveClear} type="button">Clear Active Property</button>
              </details>
            </div>
          </section>
        ) : null}
        <main className="investment-page-shell" data-investment-page={activePage}>
          {children}
        </main>
        <footer className="investment-footer">
          CFS Consulting is for screening-level real estate research only. It is not investment advice, not an appraisal, not a utility service confirmation, and not a guarantee of future value.
        </footer>
      </div>
    </section>
  );
}

const consultingPageMeta: Record<InvestmentPageId, { description: string; label: string; primaryAction: string; primaryPage: InvestmentPageId }> = {
  overview: { label: "Consulting Home", description: "Continue active work or begin a new site-selection review.", primaryAction: "Continue Active Project", primaryPage: "engagements" },
  engagements: { label: "Projects", description: "Manage acquisition reviews, site-selection studies, and deliverables.", primaryAction: "New Project", primaryPage: "engagements" },
  "area-radar": { label: "Find Sites", description: "Screen county parcels or add an external opportunity.", primaryAction: "Run Screening", primaryPage: "area-radar" },
  research: { label: "Property Review", description: "Evaluate one property's planning, market, access, utility, and constraint evidence.", primaryAction: "Select Property", primaryPage: "research" },
  "report-studio": { label: "Reports", description: "Create and manage recommendations, exhibits, and case-study deliverables.", primaryAction: "Create Report", primaryPage: "report-studio" },
  methodology: { label: "Data & Methods", description: "Review source coverage, methodology, assumptions, and advanced tools.", primaryAction: "View Sources", primaryPage: "methodology" },
  "opportunity-feed": { label: "Find Sites", description: "Review external opportunities inside the site-finding workflow.", primaryAction: "Run Screening", primaryPage: "area-radar" },
  opportunity: { label: "Find Sites", description: "Use advanced screening inside the site-finding workflow.", primaryAction: "Run Screening", primaryPage: "area-radar" },
  intake: { label: "Find Sites", description: "Add an external opportunity without changing reviewed project results.", primaryAction: "Run Screening", primaryPage: "area-radar" },
  market: { label: "Property Review", description: "Review market and access context for the active property.", primaryAction: "Select Property", primaryPage: "research" },
  compare: { label: "Projects", description: "Compare candidates inside the active project workflow.", primaryAction: "Open Projects", primaryPage: "engagements" },
  underwriting: { label: "Projects", description: "Review assumptions inside the active project workflow.", primaryAction: "Open Projects", primaryPage: "engagements" },
  "due-diligence": { label: "Projects", description: "Review due-diligence conditions inside the active project workflow.", primaryAction: "Open Projects", primaryPage: "engagements" },
  "report-bucket": { label: "Reports", description: "Manage supporting exhibits for recommendations and print outputs.", primaryAction: "Create Report", primaryPage: "report-studio" },
};

function primaryPageFor(page: InvestmentPageId): InvestmentPageId {
  if (["opportunity-feed", "opportunity", "intake"].includes(page)) return "area-radar";
  if (page === "market") return "research";
  if (["compare", "underwriting", "due-diligence"].includes(page)) return "engagements";
  if (page === "report-bucket") return "report-studio";
  return page;
}
