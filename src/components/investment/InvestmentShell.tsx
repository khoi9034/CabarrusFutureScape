"use client";

import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  FileText,
  Filter,
  Gauge,
  Layers3,
  LockKeyhole,
  MapPinned,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

type InvestmentShellProps = {
  children: ReactNode;
  dataMode: string;
  onClose: () => void;
};

const investmentProductNavItems = [
  { icon: Gauge, id: "command-center", label: "Executive Overview", sublabel: "KPIs & status" },
  { icon: Filter, id: "strategy-screener", label: "Opportunity Engine", sublabel: "Strategies & filters" },
  { icon: ClipboardList, id: "candidate-intake", label: "Candidate Intake", sublabel: "Private leads" },
  { icon: MapPinned, id: "candidate-review", label: "Property Research", sublabel: "Candidate workspace" },
  { icon: Layers3, id: "compare", label: "Compare", sublabel: "Tradeoffs only" },
  { icon: BarChart3, id: "market-research", label: "Market Research", sublabel: "ACS & economics" },
  { icon: FileText, id: "report-studio", label: "Report Studio", sublabel: "Reports & print" },
  { icon: ClipboardList, id: "due-diligence", label: "Due Diligence", sublabel: "Verification sequence" },
  { icon: FileText, id: "report-bucket", label: "Report Bucket", sublabel: "Saved evidence" },
  { icon: Search, id: "data-methodology", label: "Data & Methodology", sublabel: "Sources & limits" },
] as const;

export function InvestmentShell({ children, dataMode, onClose }: InvestmentShellProps) {
  return (
    <section className="investment-shell" aria-label="CFS Investment">
      <aside className="investment-sidebar" aria-label="CFS Investment navigation">
        <div className="investment-brand">
          <span className="investment-brand-mark"><LockKeyhole className="h-4 w-4" /></span>
          <div>
            <p>CFS Investment</p>
            <span>Private Research</span>
          </div>
        </div>
        <nav className="investment-nav">
          {investmentProductNavItems.map(({ icon: Icon, id, label, sublabel }) => (
            <button key={`${id}-${label}`} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })} type="button">
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span><strong>{label}</strong><small>{sublabel}</small></span>
            </button>
          ))}
        </nav>
        <div className="investment-sidebar-footer">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <p>Local convenience gate only. Production authentication is not yet enabled.</p>
          <button onClick={onClose} type="button"><ArrowLeft className="h-4 w-4" /> Return to CFS Economics</button>
        </div>
      </aside>
      <div className="investment-workspace">
        <header className="investment-header" id="command-center">
          <div>
            <div className="investment-header-kicker">
              <span>Private Research</span>
              <span>{dataMode}</span>
            </div>
            <h1>CFS Investment</h1>
            <p>Land, Property, and Real Estate Intelligence</p>
          </div>
          <div className="investment-header-actions">
            <button className="investment-ghost-button" type="button"><Filter className="h-4 w-4" /> Filters</button>
            <button className="investment-ghost-button" onClick={onClose} type="button"><ArrowLeft className="h-4 w-4" /> CFS Economics</button>
          </div>
        </header>
        {children}
        <footer className="investment-footer" id="data-methodology">
          CFS Investment is for internal screening-level research only. It is not investment advice, not an appraisal, not a utility service confirmation, and not a guarantee of future value.
        </footer>
      </div>
    </section>
  );
}
