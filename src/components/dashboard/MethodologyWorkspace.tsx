"use client";

import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Filter,
  GitBranch,
  HelpCircle,
  Lightbulb,
  LockKeyhole,
  MapPinned,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  developmentPredictionPublicBlockers,
  developmentPredictionRoadmap,
  standardizedDevelopmentPredictionMetrics,
  useDevelopmentPredictionResearchStatus,
} from "@/hooks/useDevelopmentPredictionResearchStatus";
import {
  developmentModelLabSummary,
  modelResearchLegendLabels,
} from "@/data/intelligence/developmentModelLab";
import {
  useEnterpriseDiagnostics,
  type EnterpriseDiagnosticCheck,
  type EnterpriseDiagnosticStatus,
} from "@/hooks/useEnterpriseDiagnostics";

type ExplorerSection =
  | "overview"
  | "capabilities"
  | "data"
  | "model"
  | "needs"
  | "roadmap";

type CapabilityGroup =
  | "Planning Snapshot"
  | "Planning Context"
  | "Constraints"
  | "Governance";

type CapabilityStatus =
  | "Context Only"
  | "Internal Research Only"
  | "Live in App"
  | "Model Related"
  | "Needs Official Data"
  | "Not Public-Facing"
  | "Presentation-Derived"
  | "Proxy Only"
  | "Reporting Related"
  | "Verified Source";

type DataDomainStatus =
  | "Available"
  | "Current Context"
  | "Internal Research"
  | "Needs Official Data"
  | "Presentation-Derived"
  | "Proxy Only";

type OpenAccordionSet = ReadonlySet<string>;

const currentBestModelFallback = {
  excludedGroups: developmentModelLabSummary.excludedFeatureGroups,
  variantLabel: developmentModelLabSummary.currentBestInternalVariant,
  variantValue: developmentModelLabSummary.bestAblationVariant,
};

function toggleOpenAccordionId(openIds: OpenAccordionSet, id: string) {
  const nextOpenIds = new Set(openIds);

  if (nextOpenIds.has(id)) {
    nextOpenIds.delete(id);
  } else {
    nextOpenIds.add(id);
  }

  return nextOpenIds;
}

const explorerSections: {
  id: ExplorerSection;
  label: string;
  shortLabel: string;
  helper: string;
}[] = [
  {
    helper: "What CFS is and what it is not.",
    id: "overview",
    label: "CFS Overview",
    shortLabel: "Overview",
  },
  {
    helper: "What staff can use today.",
    id: "capabilities",
    label: "Capabilities",
    shortLabel: "Capabilities",
  },
  {
    helper: "What data is already included.",
    id: "data",
    label: "Data Inventory",
    shortLabel: "Data Inventory",
  },
  {
    helper: "What the model does and does not do.",
    id: "model",
    label: "Model Research",
    shortLabel: "Model",
  },
  {
    helper: "What should be requested next.",
    id: "needs",
    label: "Data Still Needed",
    shortLabel: "Data Needed",
  },
  {
    helper: "Next phases, caveats, and FAQ.",
    id: "roadmap",
    label: "Roadmap & Guardrails",
    shortLabel: "Roadmap",
  },
];

const overviewBadges = [
  "Parcel Intelligence",
  "Planning Snapshot",
  "Executive Summary",
  "FEMA Flood Context",
  "School Assignment",
  "Transportation Context",
  "Internal Model Research",
  "Not Production-Ready",
];

const cfsAtAGlanceCards = [
  {
    items: [
      "Parcel-based planning intelligence prototype.",
      "Supports due diligence, constraints review, and executive reporting.",
    ],
    title: "What CFS Is",
  },
  {
    items: [
      "Parcels, zoning/current + historical, permits/new construction.",
      "FEMA flood, schools, transportation, utility proxy, and model governance.",
    ],
    title: "What CFS Has",
  },
  {
    items: [
      "Search and select a parcel, save a Planning Snapshot, and generate an Executive Summary.",
      "Inspect methodology, capability status, and aggregate model governance.",
    ],
    title: "What CFS Can Do Today",
  },
  {
    items: [
      "Internal development prediction model research pipeline.",
      "Current best internal variant: Zoning + Transportation + Tax/Value.",
      "No parcel-level prediction scores are published.",
    ],
    title: "Internal Model Research",
  },
  {
    items: [
      "WSACC true utility capacity and official school capacity/enrollment.",
      "Countywide future land use, rezoning records, and development pipeline approvals.",
    ],
    title: "What Is Still Needed",
  },
];

const systemFlow = [
  {
    detail: "Collect parcel, zoning, permit, flood, school, transportation, and planning-context sources.",
    label: "Ingest data",
  },
  {
    detail: "Normalize identifiers, repair spatial layers where needed, and write QA outputs.",
    label: "Clean and normalize",
  },
  {
    detail: "Use the official parcel id as the common review unit across domains.",
    label: "Join to parcels",
  },
  {
    detail: "Create selected-parcel summaries, context cards, and constraint flags.",
    label: "Build parcel intelligence",
  },
  {
    detail: "Show saved snapshot context, map overlays, and report-ready caveats.",
    label: "Display review context",
  },
  {
    detail: "Run internal experiments only; do not publish parcel predictions.",
    label: "Run internal model research",
  },
  {
    detail: "Explain readiness, limitations, missing data, and what not to claim.",
    label: "Report governance",
  },
];

const plainEnglishLogic = [
  "Parcels are the main unit. CFS organizes evidence around an official parcel id.",
  "Permits show what happened historically. They describe past development activity.",
  "Features describe parcel context: zoning, transportation, flood exposure, value, and related evidence.",
  "The model studies patterns for internal research, but it does not publish parcel predictions.",
  "Planning Snapshot and Executive Summary are descriptive review tools, not automated decision tools.",
];

const modelResearchFlow = developmentModelLabSummary.plainEnglishFlow;

const capabilityCards: {
  caveat: string;
  dataBehindIt: string;
  group: CapabilityGroup;
  id: string;
  status: CapabilityStatus[];
  title: string;
  whatItDoes: string;
  whereToSeeIt: string;
}[] = [
  {
    caveat: "Parcel quality flags still require source review when records are unusual.",
    dataBehindIt: "Parcels, assessor/tax enrichment, parcel quality, zoning joins, geometry.",
    group: "Planning Snapshot",
    id: "parcel-search",
    status: ["Live in App", "Verified Source"],
    title: "Parcel Search and Active Selection",
    whatItDoes: "Search by parcel ID, PIN, owner, address, subdivision, or neighborhood, then focus the map and selected parcel context.",
    whereToSeeIt: "Top search bar, Active Selection overlay, Overview.",
  },
  {
    caveat: "Planning Snapshot supports review; it does not replace official staff determinations.",
    dataBehindIt: "Selected parcel detail, zoning, permits, flood, schools, transportation, utility proxy, and caveats.",
    group: "Planning Snapshot",
    id: "due-diligence",
    status: ["Live in App"],
    title: "Planning Snapshot Review",
    whatItDoes: "Captures selected parcel facts, active context, caveats, explainable metrics, and recommended review actions.",
    whereToSeeIt: "Planning Snapshot mode.",
  },
  {
    caveat: "Report preview is a planning memo format, not a final legal finding.",
    dataBehindIt: "Saved Planning Snapshot context, explainable metrics, caveats, model safety text.",
    group: "Planning Snapshot",
    id: "executive-print",
    status: ["Live in App", "Reporting Related"],
    title: "Executive Summary Report",
    whatItDoes: "Creates a print-friendly memo-style summary from the saved Planning Snapshot for stakeholder discussion and portfolio demos.",
    whereToSeeIt: "Planning Snapshot Executive Summary tab.",
  },
  {
    caveat: "Official rezoning case approvals still require separate dated case records.",
    dataBehindIt: "Current zoning, historical zoning snapshots, zoning map-change foundation.",
    group: "Planning Context",
    id: "zoning",
    status: ["Live in App", "Context Only"],
    title: "Zoning and Historical Zoning",
    whatItDoes: "Shows zoning jurisdiction, code, category, assignment quality, historical zoning context, and map-change caveats.",
    whereToSeeIt: "Planning Snapshot, Executive Summary, and model documentation.",
  },
  {
    caveat: "Permit segmentation is descriptive. It does not prove causality.",
    dataBehindIt: "Real Property permits, permit-to-parcel joins, permit segmentation outputs.",
    group: "Planning Context",
    id: "development-activity",
    status: ["Live in App", "Verified Source"],
    title: "Development / Permit Activity",
    whatItDoes: "Summarizes permit activity, recent events, development context, and hotspot concentration.",
    whereToSeeIt: "Overview, Planning Snapshot, Development Hotspots layer.",
  },
  {
    caveat: "Used as historical outcome evidence for research; not a live prediction.",
    dataBehindIt: "New construction permit labels and selected parcel permit history.",
    group: "Planning Context",
    id: "new-construction",
    status: ["Live in App", "Model Related"],
    title: "New Construction Permit History",
    whatItDoes: "Shows matched new construction permit history and supports internal label research.",
    whereToSeeIt: "Planning Snapshot and model documentation.",
  },
  {
    caveat: "FEMA NFHL remains authoritative for regulatory flood context.",
    dataBehindIt: "FEMA NFHL flood zones and parcel flood overlay outputs.",
    group: "Constraints",
    id: "flood",
    status: ["Live in App", "Verified Source"],
    title: "Flood Constraint Review",
    whatItDoes: "Review FEMA flood constraints, high-review parcels, FEMA polygons, and selected parcel flood caveats.",
    whereToSeeIt: "Flood Constraints layer, FEMA Flood Zones layer, Planning Snapshot.",
  },
  {
    caveat: "Utilization seed is presentation-derived and needs official verification.",
    dataBehindIt: "CCS attendance-zone polygon overlap and SY 2024-2025 utilization seed.",
    group: "Constraints",
    id: "schools",
    status: [
      "Live in App",
      "Presentation-Derived",
      "Needs Official Data",
    ],
    title: "School Assignment Review",
    whatItDoes: "Review attendance-zone assignment and preliminary utilization context without implying official capacity scoring.",
    whereToSeeIt: "Planning Snapshot and School Utilization Seed layer.",
  },
  {
    caveat: "Transportation features are current-context and not historical production features yet.",
    dataBehindIt: "Centerlines, STIP, AADT, accessibility features, traffic context.",
    group: "Constraints",
    id: "transportation",
    status: ["Live in App", "Context Only", "Model Related"],
    title: "Transportation Context Review",
    whatItDoes: "Review road, rail, STIP, AADT, and accessibility context as current planning evidence.",
    whereToSeeIt: "Planning Snapshot, Methodology, model documentation.",
  },
  {
    caveat: "Proxy only. It does not confirm available utility capacity.",
    dataBehindIt: "WSACC/RevalMap utility proxy context and planning/utility feature outputs.",
    group: "Constraints",
    id: "utility",
    status: ["Context Only", "Proxy Only", "Needs Official Data"],
    title: "Utility / Infrastructure Proxy",
    whatItDoes: "Provides service-context clues and highlights where true capacity data is still needed.",
    whereToSeeIt: "Planning Snapshot and data request packet.",
  },
  {
    caveat: "Methodology explains capabilities and governance; it does not activate predictions.",
    dataBehindIt: "Source registries, QA outputs, demo documentation, model governance docs, and live aggregate status APIs.",
    group: "Governance",
    id: "methodology-explorer",
    status: ["Live in App", "Reporting Related"],
    title: "Methodology / Capability Explorer",
    whatItDoes: "Explains data sources, capability status, model safety, guardrails, and what official data is still needed.",
    whereToSeeIt: "Methodology mode.",
  },
  {
    caveat: "No parcel-level probability or ranking class is exposed.",
    dataBehindIt: "Feature matrices, model QA outputs, ranking summaries, governance flags.",
    group: "Governance",
    id: "model-governance",
    status: [
      "Internal Research Only",
      "Model Related",
      "Not Public-Facing",
    ],
    title: "Internal Development Prediction Model Research",
    whatItDoes: "Documents the internal model pipeline, current best internal variant, calibration caveats, and why parcel-level outputs remain hidden.",
    whereToSeeIt: "Methodology model research section and backend aggregate summaries.",
  },
];

const capabilityGroups: CapabilityGroup[] = [
  "Planning Snapshot",
  "Planning Context",
  "Constraints",
  "Governance",
];

const capabilityFilterOptions: ("All" | CapabilityStatus)[] = [
  "All",
  "Live in App",
  "Internal Research Only",
  "Needs Official Data",
  "Context Only",
  "Model Related",
  "Reporting Related",
];

const dataInventory: {
  available: boolean;
  domain: string;
  items: string[];
  limitation: string;
  nextNeededData: string;
  status: DataDomainStatus;
  usedFor: string;
  usedInDueDiligence: boolean;
  usedInModelResearch: boolean;
}[] = [
  {
    available: true,
    domain: "Parcel / Tax",
    items: ["parcels", "Tax Parcels Full enrichment"],
    limitation: "Some parcel quality and semantic edge cases still require source review.",
    nextNeededData: "Ongoing assessor refresh cadence and governance review.",
    status: "Available",
    usedFor: "Parcel identity, selected parcel hydration, parcel search, ownership/value context, and report headers.",
    usedInDueDiligence: true,
    usedInModelResearch: true,
  },
  {
    available: true,
    domain: "Zoning / Planning",
    items: [
      "current zoning",
      "historical zoning",
      "Central Area Plan / future land use context",
    ],
    limitation: "Current-context and plan layers should not be treated as dated rezoning approvals.",
    nextNeededData: "Official rezoning case table and countywide future land use GIS with dates.",
    status: "Current Context",
    usedFor: "Zoning jurisdiction/code, historical map-change context, planning caveats, and model feature governance.",
    usedInDueDiligence: true,
    usedInModelResearch: true,
  },
  {
    available: true,
    domain: "Development / Permits",
    items: ["Real Property permits", "new construction permits", "Accela plan reviews"],
    limitation: "Accela activity needs stronger temporal and jurisdiction QA before production modeling.",
    nextNeededData: "Countywide development pipeline and subdivision approvals.",
    status: "Available",
    usedFor: "Development activity summaries, new construction history, permit timeline, and hotspot concentration.",
    usedInDueDiligence: true,
    usedInModelResearch: true,
  },
  {
    available: true,
    domain: "Flood / Environmental",
    items: ["FEMA NFHL flood zones", "FEMA parcel flood overlay"],
    limitation: "FEMA is authoritative for regulatory flood context; additional environmental suitability remains incomplete.",
    nextNeededData: "Detailed environmental suitability layers and local QA references.",
    status: "Available",
    usedFor: "Parcel flood review flags, FEMA polygon reference, constrained-area caveats, and map overlays.",
    usedInDueDiligence: true,
    usedInModelResearch: false,
  },
  {
    available: true,
    domain: "Schools",
    items: ["school attendance zones", "school utilization seed"],
    limitation: "School utilization seed is presentation-derived and capacity scoring is not active.",
    nextNeededData: "Official school enrollment, functional capacity, grade-level history, projections.",
    status: "Presentation-Derived",
    usedFor: "Attendance-zone assignment review and preliminary utilization caveats for selected parcels.",
    usedInDueDiligence: true,
    usedInModelResearch: false,
  },
  {
    available: true,
    domain: "Transportation",
    items: ["transportation centerlines", "STIP", "AADT"],
    limitation: "Transportation features are current-context unless historical/project dates are available.",
    nextNeededData: "Dated local transportation project GIS and historical traffic/project records.",
    status: "Current Context",
    usedFor: "Accessibility context, STIP/AADT proximity, road/rail context, and internal model experiments.",
    usedInDueDiligence: true,
    usedInModelResearch: true,
  },
  {
    available: true,
    domain: "Utility / Infrastructure",
    items: ["WSACC/RevalMap utility proxy"],
    limitation: "Proxy only; it does not confirm available utility capacity.",
    nextNeededData: "True capacity, service readiness, constraints, and planned extension data.",
    status: "Proxy Only",
    usedFor: "Infrastructure context and caveat language that identifies where official utility data is needed.",
    usedInDueDiligence: true,
    usedInModelResearch: false,
  },
  {
    available: true,
    domain: "Model Governance / Feature Matrices",
    items: [
      "parcel-year features",
      "labels",
      "model QA outputs",
      "feature governance outputs",
    ],
    limitation: "Internal research only; model probability values are hidden and parcel-level classes are not exposed.",
    nextNeededData: "Better calibration, more official dated features, and governance approval.",
    status: "Internal Research",
    usedFor: "Aggregate model transparency, feature readiness, safety flags, and non-public research documentation.",
    usedInDueDiligence: false,
    usedInModelResearch: true,
  },
  {
    available: true,
    domain: "Reporting",
    items: ["Planning Snapshot review", "Executive Summary report", "demo and leadership documentation"],
    limitation: "Reports are planning-support summaries, not official determinations.",
    nextNeededData: "Staff-reviewed report templates and approved distribution language.",
    status: "Available",
    usedFor: "Stakeholder-ready selected parcel summaries, caveat communication, and portfolio/demo presentation.",
    usedInDueDiligence: true,
    usedInModelResearch: false,
  },
];

const progressItems = [
  {
    detail: "Tables and templates are ready; scoring waits for vetted source files.",
    title: "Official school capacity/enrollment ingestion when data is received",
  },
  {
    detail: "Current UI uses proxy context only; true service readiness requires official WSACC data.",
    title: "WSACC true utility capacity/service readiness",
  },
  {
    detail: "Planning sources are inventoried; countywide GIS with effective dates would improve due diligence and model readiness.",
    title: "Countywide future land use / small-area plan integration",
  },
  {
    detail: "Historical zoning map changes exist, but official case records are still needed.",
    title: "Official rezoning records",
  },
  {
    detail: "Permit history is available; approved pipeline/subdivision status would improve forward-looking context.",
    title: "Countywide development pipeline/subdivision approvals",
  },
  {
    detail: "STIP/AADT context exists; local project geometry and dates would make features stronger.",
    title: "Local planned transportation projects",
  },
  {
    detail: "Model research remains internal until better features and calibration are validated.",
    title: "Refined model validation after better data",
  },
  {
    detail: "Executive Summary exists; scenario reporting can expand after core data confidence improves.",
    title: "Potential scenario planning/reporting improvements",
  },
];

const dataNeeds = [
  {
    datasets: [
      "WSACC true utility capacity / service areas / capacity constraints",
      "official school enrollment and capacity by school",
      "countywide future land use / small-area plan GIS",
      "official rezoning case records",
    ],
    level: "Priority 1 - Needed For Stronger Planning Decisions",
    value: "Directly improves due diligence confidence and reduces the largest caveats.",
  },
  {
    datasets: [
      "countywide development pipeline / subdivision approvals",
      "planned local road projects with dates/status",
      "planned utility extensions",
      "parks/greenways/bike-ped plans",
    ],
    level: "Priority 2 - Needed For Stronger Model And Scenario Work",
    value: "Adds stronger planning intent, infrastructure timing, and near-term context.",
  },
];

const dataNeedDetails = [
  {
    dataset: "WSACC true utility capacity / service areas / capacity constraints",
    format: "REST/GIS/table preferred. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Replaces utility proxy wording with verified service-readiness context.",
    pdfLimit: "PDF maps are hard to join reliably to parcels.",
    why: "Utility capacity is one of the biggest readiness questions for development review.",
  },
  {
    dataset: "Official school enrollment and capacity by school",
    format: "CSV/XLSX/table with school year and school identifiers. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Enables verified capacity status after QA.",
    pdfLimit: "Presentation maps cannot replace source enrollment/capacity records.",
    why: "CFS currently shows assignment and presentation-derived utilization only.",
  },
  {
    dataset: "Countywide future land use / small-area plan GIS",
    format: "GIS polygons with plan name, category, adoption/effective date. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Adds planning intent context and better model feature governance.",
    pdfLimit: "PDF-only plans are not parcel-joinable without manual digitizing.",
    why: "Future land use helps staff interpret whether parcel context aligns with adopted plans.",
  },
  {
    dataset: "Official rezoning case records",
    format: "Table/GIS with case id, decision date, status, old zoning, new zoning. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Distinguishes official rezoning events from map-change detections.",
    pdfLimit: "Case PDFs are useful for review but weak for automated feature engineering.",
    why: "Dated rezoning records are essential for time-safe model features.",
  },
  {
    dataset: "Countywide development pipeline / subdivision approvals",
    format: "GIS/table with project status, units/sqft, dates, jurisdiction, geometry. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Adds forward-looking but official development context.",
    pdfLimit: "Narrative-only lists are difficult to validate or spatially join.",
    why: "Pipeline data helps explain near-term pressure beyond permit history.",
  },
  {
    dataset: "Planned local road projects with dates/status",
    format: "GIS lines/points plus project table. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Makes transportation context more time-aware.",
    pdfLimit: "Plan diagrams lack consistent geometry and dates.",
    why: "Access and transportation investment can shape development feasibility.",
  },
  {
    dataset: "Planned utility extensions",
    format: "GIS lines/polygons plus project table with status, expected year, and service area. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Separates existing utility proxy context from documented planned service changes.",
    pdfLimit: "Static maps rarely include enough attribution for parcel-level readiness.",
    why: "Planned service extensions can change near-term development feasibility.",
  },
  {
    dataset: "Parks/greenways/bike-ped plans",
    format: "GIS lines/polygons plus project table with plan status, project type, and expected timing. PDF-only is useful for reference but weaker for automated CFS integration.",
    improvement: "Adds quality-of-place and access context for parcel and corridor review.",
    pdfLimit: "PDF plan maps are harder to connect to parcels and future update cycles.",
    why: "Public realm and mobility plans help explain planning intent and contextual suitability.",
  },
];

const roadmapSteps = [
  {
    horizon: "Current",
    items: ["Demo-ready internal planning intelligence prototype"],
    status: "Now",
  },
  {
    horizon: "Next",
    items: [
      "official missing data ingestion",
      "validated staff review of Planning Snapshot and Executive Summary",
      "stronger internal model validation after better source data",
    ],
    status: "Near term",
  },
  {
    horizon: "Later",
    items: [
      "refined suitability scoring after verified data",
      "validated internal model with improved calibration",
    ],
    status: "Future",
  },
  {
    horizon: "Future",
    items: [
      "scenario planning and executive reporting",
      "possible simplified public viewer after governance review",
    ],
    status: "Longer term",
  },
];

const guardrails = [
  "CFS does not predict exact parcel probability.",
  "CFS does not make entitlement decisions.",
  "CFS does not confirm utility capacity.",
  "CFS does not provide official school capacity scoring yet.",
  "CFS does not replace FEMA as the authoritative flood source.",
  "CFS does not replace official rezoning case records.",
  "CFS does not expose parcel-level model outputs.",
];

const approvedLanguage = [
  "internal planning intelligence prototype",
  "internal model research",
  "due diligence support",
  "context and constraints",
  "aggregate model transparency",
];

const faqItems = [
  {
    answer: "CFS is a parcel-based planning intelligence prototype that organizes evidence for due diligence, constraints, reporting, and internal model governance.",
    question: "What is CFS?",
  },
  {
    answer: "No. It is demo-ready as an internal prototype, but it still needs production deployment, security, governance, and support review.",
    question: "Is this production-ready?",
  },
  {
    answer: "No. The current experience is intended for internal review, demo, and portfolio discussion.",
    question: "Is this public-facing?",
  },
  {
    answer: "It studies development patterns internally, but it does not publish parcel predictions or model probability values.",
    question: "Does it predict development?",
  },
  {
    answer: "Calibration is weak and still under review. Showing precise probability values would overstate model readiness.",
    question: "Why are probabilities hidden?",
  },
  {
    answer: "Official school capacity, true utility capacity, future land use GIS, official rezoning cases, development pipeline, and dated local transportation projects.",
    question: "What data is missing?",
  },
  {
    answer: "It reduces the time needed to assemble parcel context and makes caveats easier to communicate.",
    question: "How does this help planning staff?",
  },
  {
    answer: "It turns GIS layers into API-backed summaries, map overlays, QA outputs, and reusable planning evidence.",
    question: "How does this help GIS staff?",
  },
  {
    answer: "Validate the due diligence workflow with staff, then prioritize the official data request packet.",
    question: "What is the next practical step?",
  },
  {
    answer: "Yes, potentially, after production hardening, user testing, security review, and data governance decisions.",
    question: "Could this become an official county tool later?",
  },
];

export function MethodologyWorkspace() {
  const [activeSection, setActiveSection] = useState<ExplorerSection>(() =>
    typeof window !== "undefined" &&
    window.location.hash === "#methodology-model-lab"
      ? "model"
      : "overview",
  );
  const [capabilityFilter, setCapabilityFilter] = useState<
    "All" | CapabilityStatus
  >("All");
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const [openCapabilityIds, setOpenCapabilityIds] =
    useState<OpenAccordionSet>(() =>
      new Set(capabilityCards[0]?.id ? [capabilityCards[0].id] : []),
    );
  const [openDataDomainIds, setOpenDataDomainIds] =
    useState<OpenAccordionSet>(() =>
      new Set(dataInventory[0]?.domain ? [dataInventory[0].domain] : []),
    );
  const [openNeedDatasetIds, setOpenNeedDatasetIds] =
    useState<OpenAccordionSet>(() =>
      new Set(dataNeedDetails[0]?.dataset ? [dataNeedDetails[0].dataset] : []),
    );
  const [openFaqQuestionIds, setOpenFaqQuestionIds] =
    useState<OpenAccordionSet>(() =>
      new Set(faqItems[0]?.question ? [faqItems[0].question] : []),
    );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.hash !== "#methodology-model-lab") {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById("development-model-lab")
        ?.scrollIntoView({ block: "start" });
    });
  }, []);

  const filteredCapabilities = useMemo(() => {
    const normalizedQuery = capabilityQuery.trim().toLowerCase();

    return capabilityCards.filter((card) => {
      const matchesFilter =
        capabilityFilter === "All" || card.status.includes(capabilityFilter);

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        card.title,
        card.whatItDoes,
        card.dataBehindIt,
        card.caveat,
        card.group,
        card.whereToSeeIt,
        ...card.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [capabilityFilter, capabilityQuery]);

  return (
    <main className="relative z-10 min-h-0 flex-1 overflow-auto p-3 lg:p-4">
      <section className="methodology-workspace relative overflow-hidden rounded-xl border border-white/10 bg-[#07111d]/92 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.32)]">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(104,216,255,0.13),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(216,184,106,0.11),transparent_31%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent_36%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:42px_42px]" />
        </div>

        <div className="relative">
          <ExplorerHero />
          <SectionTabs
            activeSection={activeSection}
            onChange={setActiveSection}
          />

          <div
            aria-labelledby={`methodology-tab-${activeSection}`}
            className="mt-5"
            id={`methodology-section-${activeSection}`}
            role="tabpanel"
          >
            {activeSection === "overview" ? <OverviewSection /> : null}
            {activeSection === "capabilities" ? (
              <CapabilitiesSection
                capabilityFilter={capabilityFilter}
                capabilityQuery={capabilityQuery}
                filteredCapabilities={filteredCapabilities}
                onFilterChange={setCapabilityFilter}
                onToggleCapability={(id) =>
                  setOpenCapabilityIds((openIds) =>
                    toggleOpenAccordionId(openIds, id),
                  )
                }
                onQueryChange={setCapabilityQuery}
                openCapabilityIds={openCapabilityIds}
              />
            ) : null}
            {activeSection === "data" ? (
              <DataInventorySection
                onToggleDomain={(domain) =>
                  setOpenDataDomainIds((openIds) =>
                    toggleOpenAccordionId(openIds, domain),
                  )
                }
                openDataDomainIds={openDataDomainIds}
              />
            ) : null}
            {activeSection === "model" ? <ModelSection /> : null}
            {activeSection === "needs" ? (
              <DataNeedsSection
                onToggleDataset={(dataset) =>
                  setOpenNeedDatasetIds((openIds) =>
                    toggleOpenAccordionId(openIds, dataset),
                  )
                }
                openNeedDatasetIds={openNeedDatasetIds}
              />
            ) : null}
            {activeSection === "roadmap" ? (
              <RoadmapGuardrailsSection
                onToggleQuestion={(question) =>
                  setOpenFaqQuestionIds((openIds) =>
                    toggleOpenAccordionId(openIds, question),
                  )
                }
                openQuestionIds={openFaqQuestionIds}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function ExplorerHero() {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#68d8ff]">
          Methodology
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
          CFS Capability Explorer
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          A plain-English in-app guide to what Cabarrus FutureScape includes,
          what it can do today, what remains internal research, and which
          official datasets would make the platform stronger.
        </p>
      </div>
      <div className="grid min-w-[15rem] grid-cols-2 gap-2 text-xs">
        <StatusPill label="Prediction" value="Internal only" tone="amber" />
        <StatusPill label="School score" value="Not scored" tone="cyan" />
        <StatusPill label="Flood source" value="FEMA NFHL" tone="green" />
        <StatusPill label="Utilization" value="Seed only" tone="rose" />
      </div>
    </div>
  );
}

function SectionTabs({
  activeSection,
  onChange,
}: {
  activeSection: ExplorerSection;
  onChange: (section: ExplorerSection) => void;
}) {
  return (
    <div className="mt-4">
      <div className="cfs-methodology-rail-shell">
        <div
          aria-label="Methodology capability explorer sections"
          className="cfs-methodology-rail-scroll no-scrollbar"
          role="tablist"
        >
          <div className="grid gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {explorerSections.map((section) => {
              const active = section.id === activeSection;

              return (
                <button
                  aria-controls={`methodology-section-${section.id}`}
                  aria-selected={active}
                  className={`min-h-[4rem] rounded-xl border px-3 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#f0cd79]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060b12] ${
                    active
                      ? "border-[#68d8ff]/45 bg-[#68d8ff]/11 text-white shadow-[0_0_18px_rgba(104,216,255,0.12)]"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/18 hover:bg-white/[0.055] hover:text-slate-100"
                  }`}
                  id={`methodology-tab-${section.id}`}
                  key={section.id}
                  onClick={() => onChange(section.id)}
                  role="tab"
                  type="button"
                >
                  <span className="block text-xs font-semibold">
                    {section.shortLabel}
                  </span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                    {section.helper}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-4">
      <MethodCard
        icon={Sparkles}
        kicker="CFS at a glance"
        title="CFS at a Glance"
      >
        <p className="max-w-4xl text-sm leading-6 text-slate-400">
          CFS is a parcel-centered planning intelligence prototype. It brings
          together real local data, documented caveats, and aggregate-only model
          governance so staff can explain parcel context without overclaiming.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {cfsAtAGlanceCards.map((card) => (
            <section
              className="rounded-xl border border-white/10 bg-black/20 p-3"
              key={card.title}
            >
              <h3 className="text-sm font-semibold text-white">
                {card.title}
              </h3>
              <MethodList items={card.items} />
            </section>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {overviewBadges.map((badge) => (
            <StatusTag key={badge} label={badge} tone="cyan" />
          ))}
        </div>
      </MethodCard>

      <SystemSection />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <MethodCard
          icon={ShieldCheck}
          kicker="Decision boundary"
          title="What CFS Is Safe To Claim"
        >
          <div className="space-y-3">
            <BoundaryRow
              label="Use it for"
              text="Parcel due diligence support, context review, map-based explanation, and demo-ready executive reporting."
              tone="green"
            />
            <BoundaryRow
              label="Keep internal"
              text="Development model research, aggregate ranking summaries, feature governance, and calibration review."
              tone="amber"
            />
            <BoundaryRow
              label="Do not claim"
              text="Exact parcel probability, production-ready prediction, official school capacity scoring, or confirmed utility capacity."
              tone="rose"
            />
          </div>
        </MethodCard>

        <PlatformDiagnosticsCard />
      </div>
    </div>
  );
}

function SystemSection() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <MethodCard icon={Workflow} kicker="Process flow" title="How CFS Works">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {systemFlow.map((step, index) => (
            <div
              className="rounded-lg border border-white/10 bg-black/18 p-3"
              key={step.label}
            >
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-xs font-semibold text-[#bfefff]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {step.label}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {step.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </MethodCard>

      <MethodCard
        icon={BookOpen}
        kicker="Plain English"
        title="Model Foundation Without The Jargon"
      >
        <MethodList items={plainEnglishLogic} />
        <div className="mt-4 rounded-lg border border-[#f0cd79]/20 bg-[#1d1607]/36 p-3">
          <p className="text-sm font-semibold text-white">
            Core principle
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            CFS should explain what is known before it suggests what might
            happen. The current model work stays internal because probabilities
            are not calibrated well enough for public or parcel-level use.
          </p>
        </div>
      </MethodCard>
    </div>
  );
}

function CapabilitiesSection({
  capabilityFilter,
  capabilityQuery,
  filteredCapabilities,
  onFilterChange,
  onToggleCapability,
  onQueryChange,
  openCapabilityIds,
}: {
  capabilityFilter: "All" | CapabilityStatus;
  capabilityQuery: string;
  filteredCapabilities: typeof capabilityCards;
  onFilterChange: (filter: "All" | CapabilityStatus) => void;
  onToggleCapability: (id: string) => void;
  onQueryChange: (query: string) => void;
  openCapabilityIds: OpenAccordionSet;
}) {
  return (
    <div className="space-y-4">
      <MethodCard
        icon={Filter}
        kicker="What CFS can do"
        title="Current Capabilities"
      >
        <p className="mb-4 max-w-4xl text-sm leading-6 text-slate-400">
          These cards describe what a staff viewer can actually do in the
          prototype today, where to find it, and the caveat that should travel
          with the workflow.
        </p>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Search workflows
            </span>
            <span className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/24 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search parcel, flood, school, model, print..."
                type="search"
                value={capabilityQuery}
              />
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {capabilityFilterOptions.map((filter) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === capabilityFilter
                    ? "border-[#68d8ff]/45 bg-[#68d8ff]/12 text-white"
                    : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-white/20 hover:text-slate-100"
                }`}
                key={filter}
                onClick={() => onFilterChange(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </MethodCard>

      {filteredCapabilities.length > 0 ? (
        <div className="space-y-4">
          {capabilityGroups.map((group) => {
            const cards = filteredCapabilities.filter(
              (card) => card.group === group,
            );

            if (cards.length === 0) {
              return null;
            }

            return (
              <section
                className="rounded-xl border border-white/10 bg-black/14 p-3"
                key={group}
              >
                <div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Capability group
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-white">
                      {group}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {cards.length} workflow{cards.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {cards.map((card) => (
                    <CapabilityCard
                      card={card}
                      isOpen={openCapabilityIds.has(card.id)}
                      key={card.id}
                      onToggle={() => onToggleCapability(card.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <MethodCard
          icon={Search}
          kicker="No results"
          title="No capability matched that filter"
        >
          <p>
            Try another status filter or search term. The explorer is static,
            so no backend data is required to display these explanations.
          </p>
        </MethodCard>
      )}
    </div>
  );
}

function CapabilityCard({
  card,
  isOpen,
  onToggle,
}: {
  card: (typeof capabilityCards)[number];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#081522]/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">{card.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {card.whatItDoes}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.status.map((status) => (
          <StatusTag key={status} label={status} tone={getStatusTone(status)} />
        ))}
      </div>
      {isOpen ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoTile label="Data behind it" text={card.dataBehindIt} />
          <InfoTile label="Caveat" text={card.caveat} tone="amber" />
          <InfoTile label="Where to see it" text={card.whereToSeeIt} />
        </div>
      ) : null}
    </article>
  );
}

function DataInventorySection({
  onToggleDomain,
  openDataDomainIds,
}: {
  onToggleDomain: (domain: string) => void;
  openDataDomainIds: OpenAccordionSet;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <MethodCard
        icon={Database}
        kicker="What CFS has"
        title="Data Domains Already Included"
      >
        <p className="mb-4 text-sm leading-6 text-slate-400">
          CFS organizes evidence by domain so a selected parcel can be reviewed
          consistently across planning, constraints, activity, reporting, and
          model-governance context.
        </p>
        <div className="space-y-2">
          {dataInventory.map((domain) => (
            <AccordionRow
              isOpen={openDataDomainIds.has(domain.domain)}
              key={domain.domain}
              onToggle={() => onToggleDomain(domain.domain)}
              title={domain.domain}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <StatusTag
                    label={domain.status}
                    tone={getDataStatusTone(domain.status)}
                  />
                  <StatusTag
                    label={
                      domain.usedInDueDiligence
                        ? "Used in Planning Snapshot"
                        : "Not in Planning Snapshot"
                    }
                    tone={domain.usedInDueDiligence ? "green" : "slate"}
                  />
                  <StatusTag
                    label={
                      domain.usedInModelResearch
                        ? "Used in Model Research"
                        : "Not Model Research"
                    }
                    tone={domain.usedInModelResearch ? "cyan" : "slate"}
                  />
                </div>
                <InfoTile
                  label="Available inputs"
                  text={domain.items.join("; ")}
                />
                <InfoTile label="How CFS uses it" text={domain.usedFor} />
                <InfoTile
                  label="Limitation"
                  text={domain.limitation}
                  tone="amber"
                />
                <InfoTile
                  label="Next needed data"
                  text={domain.nextNeededData}
                />
              </div>
            </AccordionRow>
          ))}
        </div>
      </MethodCard>

      <MethodCard
        icon={MapPinned}
        kicker="How to read this"
        title="Evidence, Context, And Caveats"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MethodMini label="Available domains" value="9 major groups" />
          <MethodMini label="Planning Snapshot" value="Most domains feed saved review context" />
          <MethodMini label="Model research" value="Limited to governed features" />
          <MethodMini label="Capacity data" value="Still official-data needed" />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          This is not a raw table dump. Each domain explains whether the data is
          available, how CFS uses it, what limitation should be named during a
          demo, and what source would make the platform stronger.
        </p>
        <div className="mt-4 space-y-2">
          <BoundaryRow
            label="Verified evidence"
            text="Use directly for parcel review when source quality and joins are documented."
            tone="green"
          />
          <BoundaryRow
            label="Current context"
            text="Useful for explanation, but not automatically time-safe for historical model claims."
            tone="amber"
          />
          <BoundaryRow
            label="Proxy or seed"
            text="Helpful for planning conversation, but must stay caveated until official data arrives."
            tone="rose"
          />
        </div>
      </MethodCard>
    </div>
  );
}

function ModelSection() {
  return (
    <div className="space-y-4" id="development-model-lab">
      <MethodCard
        icon={BrainCircuit}
        kicker="Internal research only"
        title="Development Model Lab"
      >
        <p className="mb-4 rounded-lg border border-[#68d8ff]/18 bg-[#68d8ff]/[0.055] px-3 py-2 text-sm leading-6 text-slate-300">
          CFS includes an internal development model research pipeline. It
          studies historical new construction permit outcomes against
          parcel-year context, but it does not publish parcel-level prediction
          scores or model probability values.
        </p>
        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-2 sm:grid-cols-2">
            <ResearchStatusItem
              label="Target"
              value={developmentModelLabSummary.target}
            />
            <ResearchStatusItem
              label="Unit"
              value={developmentModelLabSummary.unit}
            />
            <ResearchStatusItem
              label="Feature rows"
              value={`${developmentModelLabSummary.featureRows} parcel-year records`}
            />
            <ResearchStatusItem
              label="Historical outcome"
              value={developmentModelLabSummary.historicalOutcome}
            />
            <ResearchStatusItem
              label="Current best internal model"
              value={developmentModelLabSummary.currentBestInternalVariant}
            />
            <ResearchStatusItem
              label="Best ablation variant"
              value={developmentModelLabSummary.bestAblationVariant}
            />
            <ResearchStatusItem
              label="Calibration"
              tone="amber"
              value="Weak / under review"
            />
            <ResearchStatusItem
              label="Production ready"
              tone="rose"
              value="No"
            />
            <ResearchStatusItem
              label="Public exposure"
              tone="rose"
              value="Not allowed"
            />
            <ResearchStatusItem
              label="Parcel-level probabilities"
              tone="rose"
              value="Not shown"
            />
            <ResearchStatusItem
              label="Parcel-level ranking classes"
              tone="rose"
              value="Not shown"
            />
          </div>
          <div className="grid gap-3">
            <ResearchListCard
              accent="cyan"
              items={developmentModelLabSummary.helpedFeatureGroups}
              title="Strong Feature Groups"
            />
            <ResearchListCard
              accent="rose"
              items={developmentModelLabSummary.excludedFeatureGroups}
              title="Excluded For Now"
            />
            <ResearchListCard
              accent="cyan"
              items={developmentModelLabSummary.whatItUses}
              title="Research Inputs"
            />
          </div>
        </div>
        <section className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <h4 className="text-sm font-semibold text-white">
            Plain-English Flow
          </h4>
          <MethodList items={modelResearchFlow} />
        </section>
      </MethodCard>
      <DevelopmentPredictionResearchStatusCard />
      <div className="grid gap-4 lg:grid-cols-3">
        <MethodCard
          icon={LockKeyhole}
          kicker="Why hidden"
          title="Why Parcel-Level Outputs Stay Hidden"
        >
          <MethodList
            items={[
              "Calibration remains weak, so model probability values could mislead users.",
              "Some important official datasets are still missing.",
              "The model is intended for internal QA and feature governance only.",
              "Parcel-level scores and ranking classes are not shown in the app.",
            ]}
          />
        </MethodCard>
        <MethodCard
          icon={Lightbulb}
          kicker="Phase 16C finding"
          title="What Helped And What Did Not"
        >
          <MethodList
            items={[
              "Tax/value features helped the current best internal variant.",
              "Accela, Central Area Plan, utility proxy, and current-context metadata remain useful as context.",
              "Those excluded feature groups were not recommended for the current best model because they hurt top-k ranking or need better source coverage.",
            ]}
          />
        </MethodCard>
        <MethodCard
          icon={ShieldCheck}
          kicker="Governance"
          title="Feature Governance Matters"
        >
          <MethodList
            items={[
              "Features need dates, coverage, and clear source definitions.",
              "Current context cannot be treated as historical fact.",
              "Proxy data should not be renamed as capacity or readiness.",
              "A better model still needs human governance before any public signal.",
            ]}
          />
        </MethodCard>
      </div>
    </div>
  );
}

function ProgressSection() {
  return (
    <MethodCard
      icon={Route}
      kicker="Roadmap context"
      title="What Is In The Works"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {progressItems.map((item) => (
          <div
            className="rounded-lg border border-white/10 bg-black/18 p-3"
            key={item.title}
          >
            <h3 className="text-sm font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-lg border border-[#68d8ff]/20 bg-[#68d8ff]/[0.055] px-3 py-2 text-sm leading-6 text-slate-300">
        These are roadmap items, not failures. The prototype is strongest when
        it clearly separates what is live, what is context, and what official
        data would make the next phase stronger.
      </p>
    </MethodCard>
  );
}

function DataNeedsSection({
  onToggleDataset,
  openNeedDatasetIds,
}: {
  onToggleDataset: (dataset: string) => void;
  openNeedDatasetIds: OpenAccordionSet;
}) {
  const dataNeedColumns = splitIntoIndependentColumns(dataNeedDetails);

  return (
    <div className="space-y-4">
      <MethodCard
        icon={Database}
        kicker="Priority requests"
        title="Data Still Needed"
      >
        <p>
          These are the official datasets that would most improve verified due
          diligence, internal model validation, and future scenario planning.
          REST, GIS, or structured tables are preferred. PDF-only sources are
          useful for reference but weaker for automated CFS integration.
        </p>
      </MethodCard>
      <div className="grid gap-3 lg:grid-cols-2">
        {dataNeeds.map((need) => (
          <MethodCard
            icon={Database}
            key={need.level}
            kicker="Data request"
            title={need.level}
          >
            <p className="text-sm leading-6 text-slate-400">{need.value}</p>
            <MethodList items={need.datasets} />
          </MethodCard>
        ))}
      </div>
      <MethodCard
        icon={FileText}
        kicker="Request format"
        title="What To Ask For And Why It Matters"
      >
        <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
          {dataNeedColumns.map((column, columnIndex) => (
            <div className="space-y-2" key={`data-need-column-${columnIndex}`}>
              {column.map((need) => (
                <AccordionRow
                  isOpen={openNeedDatasetIds.has(need.dataset)}
                  key={need.dataset}
                  onToggle={() => onToggleDataset(need.dataset)}
                  title={need.dataset}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoTile label="Why it matters" text={need.why} />
                    <InfoTile label="Best format" text={need.format} />
                    <InfoTile
                      label="PDF-only limitation"
                      text={need.pdfLimit}
                      tone="amber"
                    />
                    <InfoTile
                      label="How it improves CFS"
                      text={need.improvement}
                    />
                  </div>
                </AccordionRow>
              ))}
            </div>
          ))}
        </div>
      </MethodCard>
    </div>
  );
}

function splitIntoIndependentColumns<T>(items: T[]) {
  return items.reduce<[T[], T[]]>(
    (columns, item, index) => {
      columns[index % 2].push(item);
      return columns;
    },
    [[], []],
  );
}

function RoadmapGuardrailsSection({
  onToggleQuestion,
  openQuestionIds,
}: {
  onToggleQuestion: (question: string) => void;
  openQuestionIds: OpenAccordionSet;
}) {
  return (
    <div className="space-y-4">
      <MethodCard
        icon={GitBranch}
        kicker="Next phases"
        title="Roadmap & Guardrails"
      >
        <p className="mb-4 text-sm leading-6 text-slate-400">
          This section combines what is next, what is already in progress, what
          not to claim, and the plain-English answers most useful in a demo or
          manager review.
        </p>
        <div className="grid gap-3 lg:grid-cols-4">
          {roadmapSteps.map((step) => (
            <div
              className="rounded-xl border border-white/10 bg-black/20 p-4"
              key={step.horizon}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">
                  {step.horizon}
                </h3>
                <StatusTag label={step.status} tone="cyan" />
              </div>
              <MethodList items={step.items} />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-[#ff8d7a]/20 bg-[#2a100c]/34 p-3">
          <p className="text-sm font-semibold text-white">
            Public model exposure remains locked down.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Any future simplified public viewer should show descriptive context
            only unless validation, calibration, governance, and legal review
            explicitly approve a different scope.
          </p>
        </div>
      </MethodCard>

      <ProgressSection />
      <GuardrailsSection />
      <FaqSection
        onToggleQuestion={onToggleQuestion}
        openQuestionIds={openQuestionIds}
      />
    </div>
  );
}

function GuardrailsSection() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
      <MethodCard
        icon={AlertTriangle}
        kicker="What CFS does not claim"
        title="What Not To Claim"
      >
        <p className="mb-3 text-sm font-semibold text-white">
          What CFS Does Not Claim
        </p>
        <MethodList items={guardrails} />
      </MethodCard>
      <MethodCard
        icon={ShieldCheck}
        kicker="Approved language"
        title="Safe Demo Wording"
      >
        <div className="flex flex-wrap gap-2">
          {approvedLanguage.map((phrase) => (
            <StatusTag key={phrase} label={phrase} tone="green" />
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-400">
          Use: CFS is a demo-ready internal planning intelligence prototype with
          parcel-based due diligence, constraint review, executive reporting,
          and aggregate-only model governance.
        </p>
      </MethodCard>
    </div>
  );
}

function FaqSection({
  onToggleQuestion,
  openQuestionIds,
}: {
  onToggleQuestion: (question: string) => void;
  openQuestionIds: OpenAccordionSet;
}) {
  const faqColumns = splitIntoIndependentColumns(faqItems);

  return (
    <MethodCard
      icon={HelpCircle}
      kicker="Plain-English Q&A"
      title="Common Questions"
    >
      <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
        {faqColumns.map((column, columnIndex) => (
          <div className="space-y-2" key={`faq-column-${columnIndex}`}>
            {column.map((item) => (
              <AccordionRow
                isOpen={openQuestionIds.has(item.question)}
                key={item.question}
                onToggle={() => onToggleQuestion(item.question)}
                title={item.question}
              >
                <p className="text-sm leading-6 text-slate-400">
                  {item.answer}
                </p>
              </AccordionRow>
            ))}
          </div>
        ))}
      </div>
    </MethodCard>
  );
}

function PlatformDiagnosticsCard() {
  const { checks, isLoading, lastCheckedAt } = useEnterpriseDiagnostics();

  return (
    <MethodCard
      className="border-[#5cd38f]/15 bg-[#071c18]/78"
      icon={ShieldCheck}
      kicker="Runtime diagnostics"
      title="Local Platform Readiness"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          A compact live check for local demo readiness. It verifies service
          health, database connectivity, core aggregate APIs, and model-safety
          flags without requesting parcel-level predictions or rendering the 3D
          map.
        </p>
        <span className="shrink-0 rounded border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase leading-4 text-slate-400">
          {isLoading
            ? "Checking"
            : lastCheckedAt
              ? `Checked ${formatDiagnosticsTime(lastCheckedAt)}`
              : "Not checked"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <DiagnosticCheckTile check={check} key={check.id} />
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-400">
        Prediction guardrail: CFS exposes aggregate model research status only.
        Parcel-level probabilities and ranking classes remain unavailable in the
        frontend and public API.
      </p>
    </MethodCard>
  );
}

function DiagnosticCheckTile({ check }: { check: EnterpriseDiagnosticCheck }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          {check.label}
        </p>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-4 ${getDiagnosticStatusClass(
            check.status,
          )}`}
        >
          {formatDiagnosticStatus(check.status)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{check.detail}</p>
    </div>
  );
}

function DevelopmentPredictionResearchStatusCard() {
  const { errorMessage, featuresSummary, isLoading, rankingSummary, source } =
    useDevelopmentPredictionResearchStatus();
  const currentBestVariant =
    featuresSummary?.current_best_internal_model_variant ??
    currentBestModelFallback.variantValue;
  const excludedGroups =
    featuresSummary?.excluded_feature_groups_current_best?.length
      ? featuresSummary.excluded_feature_groups_current_best
      : currentBestModelFallback.excludedGroups;

  return (
    <MethodCard
      className="border-[#68d8ff]/15 bg-[#071827]/86"
      icon={BrainCircuit}
      kicker="Model transparency"
      title="Development Prediction Research Status"
    >
      <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ResearchStatusItem
              label="Target"
              value={standardizedDevelopmentPredictionMetrics.target}
            />
            <ResearchStatusItem
              label="Model status"
              tone="amber"
              value="Internal research only"
            />
            <ResearchStatusItem label="Production ready" tone="rose" value="No" />
            <ResearchStatusItem
              label="Prediction probabilities"
              tone="rose"
              value="Not available"
            />
            <ResearchStatusItem
              label="Public exposure"
              tone="rose"
              value="Not allowed"
            />
            <ResearchStatusItem
              label="Best experiment"
              value={
                featuresSummary?.recommended_internal_model_experiment_id ??
                rankingSummary.experiment_id ??
                "phase16c ablation"
              }
            />
            <ResearchStatusItem
              label="Calibration"
              tone="amber"
              value={formatStatusLabel(
                rankingSummary.calibration_status ??
                  "weak_probability_calibration",
              )}
            />
            <ResearchStatusItem
              label="Recommended use"
              value="Internal ranking research and model QA"
            />
          </div>

          <section className="rounded-lg border border-[#f0cd79]/20 bg-[#1d1607]/36 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0cd79]">
              Current Best Internal Model
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              {currentBestModelFallback.variantLabel}
            </h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ResearchStatusItem
                label="Variant"
                value={formatStatusLabel(currentBestVariant)}
              />
              <ResearchStatusItem
                label="Production ready"
                tone="rose"
                value={
                  featuresSummary?.current_best_internal_model_production_ready
                    ? "Yes"
                    : "No"
                }
              />
              <ResearchStatusItem
                label="Public exposure"
                tone="rose"
                value={
                  featuresSummary?.current_best_internal_model_public_exposure_allowed
                    ? "Allowed"
                    : "Not allowed"
                }
              />
              <ResearchStatusItem
                label="Model status"
                tone="amber"
                value="Internal research only"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Selected after Phase 16C ablation because it produced the
              strongest internal ranking performance while excluding noisy
              planning, pipeline, and proxy-only feature groups.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Research band language
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">
              Relative ranking only
            </h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {modelResearchLegendLabels.map((label) => (
                <StatusTag
                  key={label}
                  label={label}
                  tone={
                    label === "Very Strong Research Signal" ||
                    label === "Strong Research Signal"
                      ? "amber"
                      : label === "Insufficient Data"
                        ? "slate"
                        : "cyan"
                  }
                />
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Very Strong Research Signal corresponds to the highest-ranked
              internal research band. These labels compare parcels or areas
              against each other; they are not precise parcel probability
              outputs, official parcel scores, or operational development
              predictions.
            </p>
          </section>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#f0cd79]" />
              <p className="text-xs leading-5 text-slate-400">
                This section intentionally shows aggregate research status only.
                It does not display parcel IDs, parcel ranking classes, or model probability values.
              </p>
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
              Source:{" "}
              {source === "api"
                ? "Live FastAPI aggregate summaries"
                : "Documented aggregate summary"}
              {isLoading ? " (loading)" : ""}
            </p>
            <p className="mt-2 rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5 text-[11px] leading-5 text-slate-400">
              Current safety flags: model inactive, probability output
              unavailable, production readiness false, and public exposure not
              allowed.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs leading-5 text-[#f0cd79]">
                Live summary unavailable; showing documented aggregate summary.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Research output boundary
                </p>
                <h4 className="mt-1 text-sm font-semibold text-white">
                  Aggregate status only
                </h4>
              </div>
              <LockKeyhole className="h-4 w-4 text-[#f0cd79]" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ResearchStatusItem
                label="Ranking rows"
                value={
                  rankingSummary.ranking_row_count
                    ? "Internal rows available"
                    : "Summary only"
                }
              />
              <ResearchStatusItem
                label="Parcel-level classes"
                tone="rose"
                value="Hidden"
              />
              <ResearchStatusItem
                label="Probability values"
                tone="rose"
                value="Hidden"
              />
              <ResearchStatusItem
                label="Decision use"
                tone="amber"
                value="Not public-facing"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Methodology intentionally avoids listing model class names or
              parcel-level rows. It explains the research boundary without
              turning internal ranking outputs into a public-facing product
              signal.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Internal model comparison
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ResearchMetric
                label="Baseline PR-AUC"
                value={standardizedDevelopmentPredictionMetrics.baselinePrAuc}
              />
              <ResearchMetric
                label="Zoning-enhanced PR-AUC"
                value={standardizedDevelopmentPredictionMetrics.zoningEnhancedPrAuc}
              />
              <ResearchMetric
                label="Baseline tie-aware lift@top 5%"
                value={standardizedDevelopmentPredictionMetrics.baselineLiftAtTop5}
              />
              <ResearchMetric
                label="Zoning-enhanced tie-aware lift@top 5%"
                value={
                  standardizedDevelopmentPredictionMetrics.zoningEnhancedLiftAtTop5
                }
              />
              <ResearchMetric
                label="Current best PR-AUC"
                value={standardizedDevelopmentPredictionMetrics.currentBestPrAuc}
              />
              <ResearchMetric
                label="Current best lift@top 5%"
                value={
                  standardizedDevelopmentPredictionMetrics.currentBestLiftAtTop5
                }
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              The current best internal variant improved PR-AUC and top-5% lift
              in Phase 16C, but weak calibration means parcel-level probability
              values remain unavailable.
            </p>
          </section>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-black/20 p-3 lg:col-span-2">
          <h4 className="text-sm font-semibold text-white">
            Feature Group Governance
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <ResearchListCard
              accent="cyan"
              items={[
                "New construction labels and permit history.",
                "Historical zoning snapshots and map-change context.",
                "Transportation accessibility, STIP, and AADT context.",
                "Tax/value enrichment after Phase 16C ablation.",
              ]}
              title="Helped Current Variant"
            />
            <ResearchListCard
              accent="rose"
              items={excludedGroups.map((group) => formatStatusLabel(group))}
              title="Excluded For Now"
            />
            <ResearchListCard
              accent="rose"
              items={[
                "Current-context only or jurisdiction-limited coverage.",
                "Proxy-only utility context, not true capacity.",
                "Noisy top-k ranking behavior in ablation.",
                "Not time-safe enough for public model claims.",
              ]}
              title="Why Excluded"
            />
          </div>
        </section>
        <ResearchListCard
          accent="rose"
          items={developmentPredictionPublicBlockers}
          title="Why Not Public Yet?"
        />
        <ResearchListCard
          accent="cyan"
          items={developmentPredictionRoadmap}
          ordered
          title="Research Roadmap"
        />
      </div>
    </MethodCard>
  );
}

function AccordionRow({
  children,
  isOpen,
  onToggle,
  title,
}: {
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <div
      className={`self-start overflow-hidden rounded-lg border bg-black/18 transition ${
        isOpen
          ? "border-[#68d8ff]/28 shadow-[0_0_24px_rgba(104,216,255,0.08)]"
          : "border-white/10"
      }`}
    >
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68d8ff]/70"
        onClick={onToggle}
        type="button"
      >
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
      </button>
      {isOpen ? <div className="border-t border-white/10 p-3">{children}</div> : null}
    </div>
  );
}

function BoundaryRow({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "amber" | "green" | "rose";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/18 p-3">
      <StatusTag label={label} tone={tone} />
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function InfoTile({
  label,
  text,
  tone = "cyan",
}: {
  label: string;
  text: string;
  tone?: "amber" | "cyan";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "amber"
          ? "border-[#d8b86a]/18 bg-[#d8b86a]/[0.055]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{text}</p>
    </div>
  );
}

function StatusTag({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "cyan" | "green" | "rose" | "slate";
}) {
  const toneClass = {
    amber: "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]",
    cyan: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bfefff]",
    green: "border-[#5cd38f]/25 bg-[#5cd38f]/10 text-[#c7ffd8]",
    rose: "border-[#ff8d7a]/25 bg-[#ff8d7a]/10 text-[#ffc2b6]",
    slate: "border-white/10 bg-white/[0.04] text-slate-400",
  };

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}

function getDiagnosticStatusClass(status: EnterpriseDiagnosticStatus) {
  switch (status) {
    case "ok":
      return "border-[#5cd38f]/25 bg-[#5cd38f]/10 text-[#c7ffd8]";
    case "checking":
      return "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bfefff]";
    case "degraded":
      return "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]";
    case "unavailable":
      return "border-[#ff8d7a]/25 bg-[#ff8d7a]/10 text-[#ffc2b6]";
  }
}

function formatDiagnosticStatus(status: EnterpriseDiagnosticStatus) {
  switch (status) {
    case "ok":
      return "OK";
    case "checking":
      return "Checking";
    case "degraded":
      return "Review";
    case "unavailable":
      return "Offline";
  }
}

function formatDiagnosticsTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MethodCard({
  children,
  className,
  icon: Icon,
  kicker,
  title,
}: {
  children: ReactNode;
  className?: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
}) {
  return (
    <article
      className={`rounded-xl border border-white/10 bg-[#081522]/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#8fe7ff] shadow-[0_0_28px_rgba(104,216,255,0.14)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {kicker}
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-400">{children}</div>
    </article>
  );
}

function ResearchListCard({
  accent,
  items,
  ordered = false,
  title,
}: {
  accent: "cyan" | "rose";
  items: string[];
  ordered?: boolean;
  title: string;
}) {
  const dotClass = accent === "cyan" ? "bg-[#68d8ff]" : "bg-[#ff8d7a]";
  const ListTag = ordered ? "ol" : "ul";

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ListTag className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li className="flex gap-2 text-xs leading-5 text-slate-400" key={item}>
            {ordered ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-slate-300">
                {index + 1}
              </span>
            ) : (
              <span
                className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
              />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ListTag>
    </section>
  );
}

function ResearchMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {value.toFixed(6)}
      </p>
    </div>
  );
}

function ResearchStatusItem({
  label,
  tone = "cyan",
  value,
}: {
  label: string;
  tone?: "amber" | "cyan" | "rose";
  value: string;
}) {
  const toneClass = {
    amber: "border-[#d8b86a]/20 bg-[#d8b86a]/[0.06]",
    cyan: "border-[#68d8ff]/16 bg-[#68d8ff]/[0.055]",
    rose: "border-[#ff8d7a]/20 bg-[#ff8d7a]/[0.055]",
  };

  return (
    <div className={`rounded-lg border p-3 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-100">
        {value}
      </p>
    </div>
  );
}

function MethodList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li className="flex gap-2 text-sm leading-6 text-slate-400" key={item}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d8b86a]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MethodMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "cyan" | "green" | "rose";
  value: string;
}) {
  const toneClass = {
    amber: "border-[#d8b86a]/25 bg-[#d8b86a]/10 text-[#f0cd79]",
    cyan: "border-[#68d8ff]/25 bg-[#68d8ff]/10 text-[#bfefff]",
    green: "border-[#5cd38f]/25 bg-[#5cd38f]/10 text-[#c7ffd8]",
    rose: "border-[#ff8d7a]/25 bg-[#ff8d7a]/10 text-[#ffc2b6]",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-75">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  );
}

function getStatusTone(status: CapabilityStatus) {
  switch (status) {
    case "Live in App":
    case "Verified Source":
      return "green";
    case "Internal Research Only":
    case "Not Public-Facing":
    case "Needs Official Data":
    case "Presentation-Derived":
    case "Proxy Only":
      return "amber";
    case "Model Related":
    case "Reporting Related":
    case "Context Only":
      return "cyan";
  }
}

function getDataStatusTone(status: DataDomainStatus) {
  switch (status) {
    case "Available":
      return "green";
    case "Internal Research":
    case "Current Context":
      return "cyan";
    case "Needs Official Data":
    case "Presentation-Derived":
    case "Proxy Only":
      return "amber";
  }
}

function formatStatusLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
