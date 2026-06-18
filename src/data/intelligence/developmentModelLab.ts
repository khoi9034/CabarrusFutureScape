export const developmentModelLabSummary = {
  aggregateMetrics: [
    {
      caveat:
        "Aggregate Phase 16C test metric for the selected internal variant; not a parcel-level score.",
      label: "PR-AUC",
      value: "0.137928",
    },
    {
      caveat:
        "Aggregate top-5% ranking lift from Phase 16C; exact parcel probabilities remain hidden.",
      label: "Lift@top 5%",
      value: "4.051123",
    },
    {
      caveat:
        "Aggregate precision within the top 5% of test rows; not a public parcel classification.",
      label: "Precision@top 5%",
      value: "0.155245",
    },
  ],
  bestAblationVariant: "transportation_plus_tax_value_only",
  currentBestInternalVariant: "Zoning + Transportation + Tax/Value",
  excludedFeatureGroups: [
    "Accela plan reviews",
    "Central Area Plan layers",
    "utility proxy",
    "current-context metadata flags",
  ],
  featureRows: "1,430,221",
  helpedFeatureGroups: [
    "historical zoning",
    "transportation accessibility",
    "tax/value enrichment",
  ],
  historicalOutcome: "new construction permits",
  modelName: "Development Model",
  plainEnglishFlow: [
    "Permits show what happened historically.",
    "Parcel-year features describe parcel context before development.",
    "The model studies which conditions are associated with future new construction.",
    "CFS reviews results at an aggregate level.",
    "Parcel-level probabilities stay hidden until calibration and official data improve.",
  ],
  productionReady: false,
  publicFacing: false,
  question:
    "Which parcel conditions are associated with future new construction activity?",
  status: "Internal research preview",
  target: "new construction permit within next 3 years",
  unit: "parcel-year",
  whatItUses: [
    "new construction permit labels",
    "parcel-year feature matrix",
    "historical zoning",
    "transportation accessibility / STIP / AADT",
    "tax/value enrichment",
    "model QA and governance outputs",
  ],
  whyNotPublicFacing: [
    "exact probability calibration is weak and still under review",
    "official utility capacity is missing",
    "official school capacity and enrollment are missing",
    "official rezoning case records are missing",
    "countywide development pipeline and subdivision approval data are missing",
  ],
};

export const futureModelLabPlaceholders = [
  {
    caveat: "Not built yet; future phase after validated historical event data.",
    status: "Future phase",
    title: "Flood Prediction Model",
  },
  {
    caveat: "Needs official capacity and enrollment data before scoring.",
    status: "Needs official data",
    title: "School Capacity Pressure Model",
  },
  {
    caveat: "Needs true WSACC service capacity and allocation data.",
    status: "Needs official data",
    title: "Utility Readiness Model",
  },
  {
    caveat: "Needs dated planned project data and scenario assumptions.",
    status: "Needs project data",
    title: "Infrastructure Scenario Model",
  },
];

export const modelResearchLegendLabels = [
  "Very Strong Research Signal",
  "Strong Research Signal",
  "Moderate Research Signal",
  "Lower Research Signal",
  "Insufficient Data",
];

export const modelResearchSignalLegend = [
  {
    description:
      "Highest-ranked internal research band; not an exact probability.",
    dotClassName:
      "border-[#fed7aa] bg-[#f97316] shadow-[0_0_14px_rgba(249,115,22,0.45)]",
    label: "Very Strong Research Signal",
  },
  {
    description:
      "Stronger relative band from the current safe preview source.",
    dotClassName:
      "border-[#fde68a] bg-[#facc15] shadow-[0_0_12px_rgba(250,204,21,0.32)]",
    label: "Strong Research Signal",
  },
  {
    description: "Middle relative band; useful for context, not decisions.",
    dotClassName:
      "border-[#bfdbfe] bg-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.22)]",
    label: "Moderate Research Signal",
  },
  {
    description: "Lower relative research band; shown subtly.",
    dotClassName: "border-[#cbd5e1] bg-[#64748b]",
    label: "Lower Research Signal",
  },
  {
    description: "Not enough map-safe context to interpret as a signal.",
    dotClassName: "border-[#64748b] bg-[#1e293b]",
    label: "Insufficient Data",
  },
];

export const modelResearchDriverSources = [
  "historical zoning",
  "transportation accessibility",
  "tax/value enrichment",
  "new construction permit labels",
];

export const modelResearchMapReadingSteps = [
  "Warmer bands show stronger relative research signal.",
  "Research bands compare parcels against other parcels in the county; they are not probability percentages.",
  "Drivers explain which parcel context features contributed.",
  "Missing official data means this remains research-only.",
  "Use this to guide questions, not decisions.",
];

export const modelResearchDriverExplanations: Record<string, string> = {
  "historical zoning":
    "Historical/current zoning pattern was useful in the model.",
  "new construction permit labels":
    "Historical permit outcomes were used as the model learning target.",
  "tax/value enrichment":
    "Land, building, and value context improved the best internal model.",
  "transportation accessibility":
    "Road, STIP, and AADT context helped separate stronger development patterns.",
  historical_zoning:
    "Historical/current zoning pattern was useful in the model.",
  new_construction_permit_labels:
    "Historical permit outcomes were used as the model learning target.",
  tax_value_enrichment:
    "Land, building, and value context improved the best internal model.",
  transportation_accessibility:
    "Road, STIP, and AADT context helped separate stronger development patterns.",
};

export function formatModelResearchDriverLabel(driver: string) {
  switch (driver) {
    case "historical zoning":
    case "historical_zoning":
      return "Zoning context";
    case "transportation accessibility":
    case "transportation_accessibility":
      return "Transportation accessibility";
    case "tax/value enrichment":
    case "tax_value_enrichment":
      return "Tax/value enrichment";
    case "new construction permit labels":
    case "new_construction_permit_labels":
      return "New construction history";
    default:
      return driver
        .split("_")
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
  }
}

export function getModelResearchDriverExplanation(driver: string) {
  return (
    modelResearchDriverExplanations[driver] ??
    "Qualitative driver group from the safe internal research preview."
  );
}

export function formatRelativeDevelopmentSignalBand({
  rankBand,
  signalLabel,
}: {
  rankBand?: string | null;
  signalLabel?: string | null;
}) {
  switch (rankBand) {
    case "top_1_percent_research_band":
    case "top_5_percent_research_band":
      return "Very Strong Research Signal";
    case "top_15_percent_research_band":
      return "Strong Research Signal";
    case "remaining_research_band":
      return "Lower Research Signal";
    case "insufficient_data":
      return "Insufficient Data";
    default:
      break;
  }

  switch (signalLabel) {
    case "Higher research signal":
      return "Very Strong Research Signal";
    case "Moderate research signal":
      return "Moderate Research Signal";
    case "Lower research signal":
      return "Lower Research Signal";
    case "Insufficient data":
      return "Insufficient Data";
    default:
      return "Relative Research Signal";
  }
}

export function getModelResearchBandMeaning(band: string | null | undefined) {
  switch (band) {
    case "Very Strong Research Signal":
      return "Highest-ranked internal research band. It means the parcel or area is near the top of the relative signal list, not that it has a 5% chance of development.";
    case "Strong Research Signal":
      return "Stronger relative research band based on similarity to places where new construction occurred historically.";
    case "Moderate Research Signal":
      return "Middle relative research band. It provides context but should not be treated as a decision finding.";
    case "Lower Research Signal":
      return "Lower relative research band in the current internal preview.";
    case "Insufficient Data":
      return "Not enough map-safe context is available to interpret a relative research signal.";
    default:
      return "Relative research bands rank parcels or areas against each other. They are not probability percentages.";
  }
}
