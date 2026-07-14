"use client";

import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  Layers3,
  LockKeyhole,
  MapPinned,
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
  group: string;
  pages: Array<{
    icon: typeof Gauge;
    id: InvestmentPageId;
    label: string;
    sublabel: string;
  }>;
}> = [
  {
    group: "Guided",
    pages: [
      { icon: Gauge, id: "overview", label: "Home", sublabel: "Start here" },
      { icon: Search, id: "area-radar", label: "Find", sublabel: "Areas and opportunities" },
      { icon: MapPinned, id: "research", label: "Analyze", sublabel: "One property workspace" },
      { icon: Layers3, id: "compare", label: "Compare", sublabel: "Tradeoffs only" },
      { icon: BriefcaseBusiness, id: "engagements", label: "Projects", sublabel: "Criteria and shortlists" },
      { icon: FileText, id: "report-studio", label: "Reports", sublabel: "Studio and bucket" },
      { icon: BookOpen, id: "methodology", label: "More", sublabel: "Sources and advanced tools" },
    ],
  },
];

export const investmentPages = investmentPageGroups.flatMap((group) => group.pages);

type InvestmentShellProps = {
  activePage: InvestmentPageId;
  children: ReactNode;
  currentCandidateLabel?: string | null;
  dataMode: string;
  shortlistCount?: number;
  viewMode?: "guided" | "advanced";
  onClose: () => void;
  onAskCfs: () => void;
  onPageChange: (page: InvestmentPageId) => void;
  onViewModeChange?: (mode: "guided" | "advanced") => void;
};

export function InvestmentShell({
  activePage,
  children,
  currentCandidateLabel,
  dataMode,
  shortlistCount = 0,
  viewMode = "guided",
  onAskCfs,
  onClose,
  onPageChange,
  onViewModeChange,
}: InvestmentShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = investmentPages.find((page) => page.id === activePage) ?? investmentPages[0];
  return (
    <section className={`investment-shell ${collapsed ? "is-collapsed" : ""}`} aria-label="CFS Investment">
      <aside className="investment-sidebar" aria-label="CFS Investment navigation">
        <div className="investment-brand">
          <span className="investment-brand-mark"><LockKeyhole className="h-4 w-4" /></span>
          <div>
            <p>CFS Investment</p>
            <span>Private Research</span>
          </div>
          <button className="investment-icon-button" onClick={() => setCollapsed((value) => !value)} type="button" aria-label={collapsed ? "Expand CFS Investment navigation" : "Collapse CFS Investment navigation"}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="investment-nav">
          {investmentPageGroups.map((group) => (
            <div className="investment-nav-group" key={group.group}>
              <p>{group.group}</p>
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
          <p>Local convenience gate only. Production authentication is not yet enabled.</p>
          <button onClick={onClose} type="button"><ArrowLeft className="h-4 w-4" /> Return to CFS Economics</button>
        </div>
      </aside>
      <div className="investment-workspace">
        <header className="investment-header">
          <div>
            <div className="investment-header-kicker">
              <span>Private Research</span>
              <span>{dataMode}</span>
              <span>{shortlistCount} shortlisted</span>
              {currentCandidateLabel ? <span>{currentCandidateLabel}</span> : null}
            </div>
            <h1>{active.label}</h1>
            <p>CFS Investment · Land, Property, and Real Estate Intelligence</p>
          </div>
          <div className="investment-header-actions">
            <div className="investment-view-toggle" role="group" aria-label="CFS Investment view mode">
              <button aria-pressed={viewMode === "guided"} onClick={() => onViewModeChange?.("guided")} type="button">Guided</button>
              <button aria-pressed={viewMode === "advanced"} onClick={() => onViewModeChange?.("advanced")} type="button">Advanced</button>
            </div>
            <button className="investment-primary-button" onClick={onAskCfs} type="button"><Sparkles className="h-4 w-4" /> Ask CFS</button>
            <button className="investment-ghost-button" onClick={onClose} type="button"><ArrowLeft className="h-4 w-4" /> CFS Economics</button>
          </div>
        </header>
        <main className="investment-page-shell" data-investment-page={activePage}>
          {children}
        </main>
        <footer className="investment-footer">
          CFS Investment is for internal screening-level research only. It is not investment advice, not an appraisal, not a utility service confirmation, and not a guarantee of future value.
        </footer>
      </div>
    </section>
  );
}
