import type {
  ExecutiveReportPackage,
  PrintableViewMode,
  ReportExportIntent,
  ReportPackageId,
} from "@/types/reports";

export const defaultReportPackageId: ReportPackageId = "executive-growth";
export const defaultPrintableViewMode: PrintableViewMode = "briefing";
export const defaultReportExportIntent: ReportExportIntent = "executive";

export const mockReportPackages: ExecutiveReportPackage[] = [
  {
    id: "executive-growth",
    type: "executive-briefing",
    title: "Executive Growth Briefing",
    subtitle: "Countywide growth, readiness, fiscal upside, and risk posture.",
    timestamp: "2026-05-25T08:00:00-04:00",
    narrative:
      "This mock packet frames Cabarrus County growth pressure as an executive operating decision: capture opportunity where readiness is high, and sequence capital where pressure is outrunning service capacity.",
    recommendations: [
      "Advance high-readiness growth areas with weekly executive monitoring.",
      "Keep infrastructure readiness and scenario envelope layers active for packet review.",
      "Use critical notices and scenario comparisons as the executive meeting cadence.",
    ],
    kpiSummaries: [
      {
        id: "growth-index",
        label: "Growth Index",
        value: "78.4",
        delta: "+4.8%",
        status: "positive",
        accent: "#d8b86a",
      },
      {
        id: "readiness",
        label: "Readiness",
        value: "73%",
        delta: "+2.1%",
        status: "positive",
        accent: "#55d38f",
      },
      {
        id: "risk-exposure",
        label: "Constraint Exposure",
        value: "18%",
        delta: "-1.3%",
        status: "watch",
        accent: "#ff8d7a",
      },
    ],
    sections: [
      {
        id: "executive-summary",
        title: "Executive Summary",
        severity: "watch",
        body:
          "Growth remains corridor-led, with the strongest mock upside around readiness-supported parcels and active permit nodes.",
        bullets: [
          "Growth pressure is high but still governable.",
          "Infrastructure readiness is the primary gating signal.",
          "Fiscal opportunity improves when scenario reviews stay sequenced.",
        ],
      },
      {
        id: "decision-posture",
        title: "Decision Posture",
        severity: "positive",
        body:
          "Leadership can use this packet as a recurring board briefing frame before real export automation exists.",
        bullets: [
          "Review corridor-level readiness.",
          "Track critical operational events.",
          "Compare baseline and accelerated growth before action.",
        ],
      },
    ],
    exportMetadata: {
      author: "CFS Mock Intelligence Desk",
      createdAt: "2026-05-25T08:00:00-04:00",
      department: "County Administration",
      disclaimer: "Mock Phase 1 report package. Not a production record.",
      source: "mock",
      tags: ["executive", "growth", "briefing"],
      updatedAt: "2026-05-25T08:00:00-04:00",
    },
  },
  {
    id: "infrastructure-readiness",
    type: "infrastructure-review",
    title: "Infrastructure Readiness Packet",
    subtitle: "Capacity-first briefing for utilities, transportation, and corridor readiness.",
    timestamp: "2026-05-25T08:05:00-04:00",
    narrative:
      "This mock packet organizes infrastructure review around readiness margins, service constraints, and capital sequencing signals that would later be sourced from live county systems.",
    recommendations: [
      "Prioritize corridors where readiness and parcel pressure diverge.",
      "Use infrastructure-first comparisons for capital timing review.",
      "Keep flood risk and readiness overlays paired during packet review.",
    ],
    kpiSummaries: [
      {
        id: "readiness",
        label: "Readiness",
        value: "73%",
        delta: "+2.1%",
        status: "positive",
        accent: "#55d38f",
      },
      {
        id: "utility-strain",
        label: "Utility Strain",
        value: "Medium",
        delta: "+3 flags",
        status: "watch",
        accent: "#68d8ff",
      },
      {
        id: "corridor-readiness",
        label: "Corridor Readiness",
        value: "73%",
        delta: "+5 pts",
        status: "positive",
        accent: "#f0cd79",
      },
    ],
    sections: [
      {
        id: "readiness-overview",
        title: "Readiness Overview",
        severity: "positive",
        body:
          "The mock infrastructure review shows capacity alignment improving when growth is gated by service readiness.",
        bullets: [
          "Capital sequencing remains the controlling workflow.",
          "Transportation and utility flags should be reviewed together.",
          "Scenario comparisons support infrastructure-first recommendations.",
        ],
      },
      {
        id: "capacity-risks",
        title: "Capacity Risks",
        severity: "watch",
        body:
          "High-growth assumptions reduce readiness margin and should be exported with explicit risk notes.",
        bullets: [
          "Readiness gaps widen under accelerated absorption.",
          "Flood overlays should remain visible in review packets.",
          "Corridor phasing should be tracked before approvals accelerate.",
        ],
      },
    ],
    exportMetadata: {
      author: "CFS Mock Infrastructure Desk",
      createdAt: "2026-05-25T08:05:00-04:00",
      department: "Infrastructure Review",
      disclaimer: "Mock Phase 1 report package. Not a production record.",
      source: "mock",
      tags: ["infrastructure", "capacity", "readiness"],
      updatedAt: "2026-05-25T08:05:00-04:00",
    },
  },
  {
    id: "flood-risk-review",
    type: "flood-risk-review",
    title: "Flood Risk Review Packet",
    subtitle: "Constraint exposure, flood overlay posture, and risk review notes.",
    timestamp: "2026-05-25T08:10:00-04:00",
    narrative:
      "This mock risk packet prepares a future printable review of parcels, overlays, and corridor constraints requiring board-level visibility before growth acceleration.",
    recommendations: [
      "Review flood-risk parcels before accelerated growth actions.",
      "Keep risk notices tied to parcel and layer context.",
      "Use risk review mode when creating board packets for constrained corridors.",
    ],
    kpiSummaries: [
      {
        id: "constraint-exposure",
        label: "Constraint Exposure",
        value: "18%",
        delta: "-1.3%",
        status: "watch",
        accent: "#ff8d7a",
      },
      {
        id: "critical-notices",
        label: "Critical Notices",
        value: "1",
        delta: "Active",
        status: "critical",
        accent: "#ff6b6b",
      },
      {
        id: "risk-balance",
        label: "Risk Balance",
        value: "64",
        delta: "+2 pts",
        status: "neutral",
        accent: "#68d8ff",
      },
    ],
    sections: [
      {
        id: "risk-summary",
        title: "Risk Summary",
        severity: "critical",
        body:
          "Mock risk exposure remains concentrated where flood constraints overlap with active growth pressure.",
        bullets: [
          "Review constrained parcels before permit escalation.",
          "Pair flood risk with infrastructure readiness.",
          "Export risk context with scenario comparisons.",
        ],
      },
      {
        id: "board-note",
        title: "Board Note",
        severity: "watch",
        body:
          "This packet is structured as a future board-ready risk appendix, not a regulatory determination.",
        bullets: [
          "No production flood service is connected.",
          "All risk values are local mock values.",
          "Future exports should include source citations.",
        ],
      },
    ],
    exportMetadata: {
      author: "CFS Mock Risk Desk",
      createdAt: "2026-05-25T08:10:00-04:00",
      department: "Risk Review",
      disclaimer: "Mock Phase 1 report package. Not a production record.",
      source: "mock",
      tags: ["risk", "flood", "constraints"],
      updatedAt: "2026-05-25T08:10:00-04:00",
    },
  },
  {
    id: "parcel-opportunity",
    type: "parcel-snapshot",
    title: "Parcel Opportunity Summary",
    subtitle: "Parcel intelligence snapshot for opportunity, readiness, and nearby permits.",
    timestamp: "2026-05-25T08:15:00-04:00",
    narrative:
      "This mock parcel snapshot packages selected parcel intelligence into a future printable one-page review for analyst and planning workflows.",
    recommendations: [
      "Use selected parcel context before exporting a future record packet.",
      "Pair opportunity score with flood and permit layers.",
      "Reserve production parcel exports for authenticated source data.",
    ],
    kpiSummaries: [
      {
        id: "parcel-watch",
        label: "Watched Parcels",
        value: "1,284",
        delta: "+96",
        status: "neutral",
        accent: "#68d8ff",
      },
      {
        id: "tax-lift",
        label: "Modeled Tax Lift",
        value: "$42.6M",
        delta: "+$3.4M",
        status: "positive",
        accent: "#f0cd79",
      },
      {
        id: "nearby-permits",
        label: "Nearby Permits",
        value: "14",
        delta: "+4",
        status: "watch",
        accent: "#ffb454",
      },
    ],
    sections: [
      {
        id: "parcel-summary",
        title: "Parcel Summary",
        severity: "neutral",
        body:
          "The parcel report preview is designed for a future source-linked snapshot of ownership, zoning, permits, and scoring context.",
        bullets: [
          "Selected parcel state can drive future exports.",
          "Nearby permits remain mock values.",
          "No assessor system is connected.",
        ],
      },
      {
        id: "analyst-note",
        title: "Analyst Note",
        severity: "positive",
        body:
          "This structure keeps parcel export UX ready while source data contracts are still intentionally absent.",
        bullets: [
          "Preserve parcel ID in URL state.",
          "Keep identify/query flow separate from reporting.",
          "Attach official sources in later phases.",
        ],
      },
    ],
    exportMetadata: {
      author: "CFS Mock Parcel Desk",
      createdAt: "2026-05-25T08:15:00-04:00",
      department: "Parcel Intelligence",
      disclaimer: "Mock Phase 1 report package. Not a production record.",
      source: "mock",
      tags: ["parcel", "opportunity", "snapshot"],
      updatedAt: "2026-05-25T08:15:00-04:00",
    },
  },
  {
    id: "scenario-comparison",
    type: "scenario-comparison",
    title: "Scenario Comparison Export",
    subtitle: "Briefing-ready scenario deltas, risk indicators, and executive recommendation.",
    timestamp: "2026-05-25T08:20:00-04:00",
    narrative:
      "This mock export package frames the current scenario comparison as a future report section for executive packets and board workflows.",
    recommendations: [
      "Export the active comparison after confirming briefing mode.",
      "Include KPI deltas and risk indicators in future PDF packets.",
      "Keep scenario assumptions visible in the print layout.",
    ],
    kpiSummaries: [
      {
        id: "growth-pressure",
        label: "Growth Pressure",
        value: "+12.8",
        delta: "Scenario delta",
        status: "watch",
        accent: "#d8b86a",
      },
      {
        id: "fiscal-lift",
        label: "Fiscal Lift",
        value: "+$18.4M",
        delta: "Mock delta",
        status: "positive",
        accent: "#f0cd79",
      },
      {
        id: "readiness-gap",
        label: "Readiness Gap",
        value: "-7 pts",
        delta: "Mock delta",
        status: "watch",
        accent: "#55d38f",
      },
    ],
    sections: [
      {
        id: "comparison-summary",
        title: "Comparison Summary",
        severity: "watch",
        body:
          "Scenario export readiness packages mock comparison metrics and narratives without generating a real document yet.",
        bullets: [
          "Comparison pair is URL-shareable.",
          "Briefing mode determines narrative emphasis.",
          "Future exports can bind to PDF generation.",
        ],
      },
      {
        id: "future-export-path",
        title: "Future Export Path",
        severity: "neutral",
        body:
          "A later service can render this same structured package as PDF, HTML, or board-packet sections.",
        bullets: [
          "Keep data structured.",
          "Avoid report-specific UI coupling.",
          "Add citations when live services connect.",
        ],
      },
    ],
    exportMetadata: {
      author: "CFS Mock Scenario Desk",
      createdAt: "2026-05-25T08:20:00-04:00",
      department: "Scenario Intelligence",
      disclaimer: "Mock Phase 1 report package. Not a production record.",
      source: "mock",
      tags: ["scenario", "comparison", "export"],
      updatedAt: "2026-05-25T08:20:00-04:00",
    },
  },
];
