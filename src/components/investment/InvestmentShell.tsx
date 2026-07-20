"use client";

import {
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  Layers3,
  LockKeyhole,
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
    sublabel: string;
  }>;
}> = [
  {
    pages: [
      { icon: Gauge, id: "overview", label: "Home", sublabel: "Current work and next action" },
      { icon: BriefcaseBusiness, id: "engagements", label: "Case Studies", sublabel: "Projects, candidates, and deliverables" },
      { icon: Search, id: "area-radar", label: "Find Sites", sublabel: "Screen parcels and opportunities" },
      { icon: MapPinned, id: "research", label: "Analyze Property", sublabel: "One-property due diligence" },
      { icon: Layers3, id: "compare", label: "Compare", sublabel: "Candidate tradeoffs" },
      { icon: FileText, id: "report-studio", label: "Reports", sublabel: "Recommendations and deliverables" },
      { icon: BookOpen, id: "methodology", label: "Data & Methods", sublabel: "Sources, status, assumptions, and advanced tools" },
    ],
  },
];

const legacyInvestmentPages: Array<(typeof investmentPageGroups)[number]["pages"][number]> = [
  { icon: Search, id: "opportunity-feed", label: "Opportunity Feed", sublabel: "External references" },
  { icon: Search, id: "opportunity", label: "Opportunity Engine", sublabel: "Advanced screening" },
  { icon: Search, id: "intake", label: "Candidate Intake", sublabel: "Writable candidate queue" },
  { icon: Gauge, id: "market", label: "Market Research", sublabel: "ACS and market context" },
  { icon: Gauge, id: "underwriting", label: "Underwriting", sublabel: "Scenario lab" },
  { icon: ShieldCheck, id: "due-diligence", label: "Due Diligence", sublabel: "Checklist library" },
  { icon: FileText, id: "report-bucket", label: "Report Bucket", sublabel: "Print collection" },
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
  children: ReactNode;
  currentCandidateLabel?: string | null;
  dataMode: string;
  caseStudyCandidateCount?: number;
  shortlistCount?: number;
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
  children,
  currentCandidateLabel,
  dataMode,
  caseStudyCandidateCount,
  shortlistCount = 0,
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
  const active = investmentPages.find((page) => page.id === activePage) ?? investmentPages[0];
  return (
    <section className={`investment-shell ${collapsed ? "is-collapsed" : ""}`} aria-label="CFS Consulting">
      <aside className="investment-sidebar" aria-label="CFS Consulting navigation">
        <div className="investment-brand">
          <span className="investment-brand-mark"><LockKeyhole className="h-4 w-4" /></span>
          <div>
            <p>CFS Consulting</p>
            <span>Real Estate, Site Selection & Due Diligence</span>
          </div>
          <button className="investment-icon-button" onClick={() => setCollapsed((value) => !value)} type="button" aria-label={collapsed ? "Expand CFS Consulting navigation" : "Collapse CFS Consulting navigation"}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="investment-nav">
          {investmentPageGroups.map((group) => (
            <div className="investment-nav-group" key="consulting">
              {group.pages.map(({ icon: Icon, id, label, sublabel }) => (
                <button
                  aria-current={activePage === id ? "page" : undefined}
                  key={id}
                  onClick={() => onPageChange(id)}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span><strong>{label}</strong><small>{sublabel}</small></span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="investment-sidebar-footer">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <p>{dataMode}</p>
        </div>
      </aside>
      <div className="investment-workspace">
        <header className="investment-header">
          <div>
            <div className="investment-header-kicker">
              <span>Consulting Engine</span>
              <span>{dataMode}</span>
              {caseStudyCandidateCount ? <span>{caseStudyCandidateCount} case-study candidates</span> : null}
              <span>Global Shortlist: {shortlistCount}</span>
              {currentCandidateLabel ? <span>{currentCandidateLabel}</span> : null}
            </div>
            <h1>{active.label}</h1>
            <p>CFS Consulting - Real Estate, Site Selection & Due Diligence</p>
          </div>
          <div className="investment-header-actions">
            <button className="investment-primary-button" onClick={onAskCfs} type="button"><Sparkles className="h-4 w-4" /> Ask CFS</button>
          </div>
        </header>
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
              <button className="investment-primary-button" onClick={onActiveAnalyze} type="button">Open Analysis</button>
              <button onClick={onActiveCompare} type="button">Compare</button>
              <button onClick={onActiveUnderwrite} type="button">Underwrite</button>
              <details className="investment-active-overflow">
                <summary><MoreHorizontal className="h-4 w-4" /> More</summary>
                <button onClick={onActiveShortlist} type="button">Add to Shortlist</button>
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
