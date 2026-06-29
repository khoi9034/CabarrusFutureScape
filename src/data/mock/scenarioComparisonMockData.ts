import type {
  ExecutiveBriefing,
  ScenarioComparison,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";

export const defaultScenarioComparisonPair: ScenarioComparisonPair = {
  leftScenarioId: "baseline",
  rightScenarioId: "accelerated-growth",
};

export const mockScenarioComparisons: ScenarioComparison[] = [
  {
    id: "baseline__accelerated-growth",
    title: "Baseline vs Accelerated Growth",
    summary:
      "Accelerated Growth increases fiscal upside and parcel activity, but it pushes near-term infrastructure and risk review demand above the baseline posture.",
    leftScenarioId: "baseline",
    rightScenarioId: "accelerated-growth",
    recommendedBriefingMode: "executive",
    fiscalOpportunityShift: "+$18.4M modeled tax opportunity",
    infrastructureReadinessShift: "-7 pts readiness margin",
    parcelPressureShift: "+19% parcel pressure",
    riskIndicators: [
      "Corridor absorption outpaces staged utility readiness.",
      "Permit activity clusters near flood and transportation review zones.",
      "Executive oversight should focus on capital timing.",
    ],
    metrics: [
      {
        id: "growth-pressure",
        label: "Growth Pressure",
        leftValue: "78.4",
        rightValue: "91.2",
        delta: "+12.8",
        trend: "up",
        severity: "watch",
        accent: "#d8b86a",
        description:
          "Mock demand pressure rises under accelerated absorption assumptions.",
      },
      {
        id: "readiness-margin",
        label: "Readiness Margin",
        leftValue: "73%",
        rightValue: "66%",
        delta: "-7 pts",
        trend: "down",
        severity: "watch",
        accent: "#55d38f",
        description:
          "Service readiness tightens as growth outruns staged capacity.",
      },
      {
        id: "fiscal-lift",
        label: "Fiscal Lift",
        leftValue: "$42.6M",
        rightValue: "$61.0M",
        delta: "+$18.4M",
        trend: "up",
        severity: "positive",
        accent: "#f0cd79",
        description:
          "Modeled tax opportunity improves, subject to infrastructure pacing.",
      },
      {
        id: "constraint-exposure",
        label: "Constraint Exposure",
        leftValue: "18%",
        rightValue: "24%",
        delta: "+6 pts",
        trend: "up",
        severity: "critical",
        accent: "#ff8d7a",
        description:
          "More parcels require risk and infrastructure screening before approval.",
      },
    ],
    narratives: [
      {
        id: "accelerated-executive-summary",
        title: "Executive posture",
        severity: "watch",
        body:
          "Accelerated Growth is attractive for revenue and economic momentum, but it requires a stricter capital sequencing posture to avoid capacity drag.",
      },
      {
        id: "accelerated-risk-summary",
        title: "Risk posture",
        severity: "critical",
        body:
          "The mock risk spread suggests executive review should keep flood and corridor readiness overlays visible during scenario review.",
      },
    ],
  },
  {
    id: "baseline__infrastructure-first",
    title: "Baseline vs Infrastructure First",
    summary:
      "Infrastructure First reduces exposure and improves service readiness, while lowering near-term growth pressure and fiscal lift compared with baseline momentum.",
    leftScenarioId: "baseline",
    rightScenarioId: "infrastructure-first",
    recommendedBriefingMode: "infrastructure",
    fiscalOpportunityShift: "-$6.8M modeled tax opportunity",
    infrastructureReadinessShift: "+11 pts readiness margin",
    parcelPressureShift: "-14% parcel pressure",
    riskIndicators: [
      "Lower growth pressure reduces near-term zoning conflict.",
      "Capital alignment improves corridor readiness.",
      "Fiscal upside is deferred rather than removed.",
    ],
    metrics: [
      {
        id: "growth-pressure",
        label: "Growth Pressure",
        leftValue: "78.4",
        rightValue: "67.5",
        delta: "-10.9",
        trend: "down",
        severity: "neutral",
        accent: "#d8b86a",
        description:
          "Mock pressure falls as capacity gates slow absorption.",
      },
      {
        id: "readiness-margin",
        label: "Readiness Margin",
        leftValue: "73%",
        rightValue: "84%",
        delta: "+11 pts",
        trend: "up",
        severity: "positive",
        accent: "#55d38f",
        description:
          "Readiness improves as growth aligns with staged infrastructure.",
      },
      {
        id: "fiscal-lift",
        label: "Fiscal Lift",
        leftValue: "$42.6M",
        rightValue: "$35.8M",
        delta: "-$6.8M",
        trend: "down",
        severity: "neutral",
        accent: "#f0cd79",
        description:
          "Near-term revenue softens as development shifts into capacity-ready areas.",
      },
      {
        id: "constraint-exposure",
        label: "Constraint Exposure",
        leftValue: "18%",
        rightValue: "12%",
        delta: "-6 pts",
        trend: "down",
        severity: "positive",
        accent: "#ff8d7a",
        description:
          "Risk exposure falls when infrastructure readiness constrains growth timing.",
      },
    ],
    narratives: [
      {
        id: "infrastructure-executive-summary",
        title: "Executive posture",
        severity: "positive",
        body:
          "Infrastructure First is the safer operational posture when county leadership wants to protect service quality while keeping growth options open.",
      },
      {
        id: "infrastructure-tradeoff-summary",
        title: "Tradeoff posture",
        severity: "neutral",
        body:
          "The mock fiscal tradeoff is timing-based: capacity investments reduce immediate lift but preserve cleaner long-term growth sequencing.",
      },
    ],
  },
  {
    id: "infill-priority__accelerated-growth",
    title: "Infill Priority vs Accelerated Growth",
    summary:
      "Infill Priority concentrates opportunity inside serviceable areas, while Accelerated Growth maximizes pressure and revenue but widens operational review load.",
    leftScenarioId: "infill-priority",
    rightScenarioId: "accelerated-growth",
    recommendedBriefingMode: "planning",
    fiscalOpportunityShift: "+$11.2M modeled tax opportunity",
    infrastructureReadinessShift: "-16 pts readiness margin",
    parcelPressureShift: "+23% parcel pressure",
    riskIndicators: [
      "Accelerated Growth increases review volume outside compact service areas.",
      "Infill Priority produces lower pressure but cleaner planning alignment.",
      "Permit activity should be compared with zoning review capacity.",
    ],
    metrics: [
      {
        id: "growth-pressure",
        label: "Growth Pressure",
        leftValue: "69.1",
        rightValue: "91.2",
        delta: "+22.1",
        trend: "up",
        severity: "critical",
        accent: "#d8b86a",
        description:
          "Accelerated Growth materially increases mock parcel pressure.",
      },
      {
        id: "readiness-margin",
        label: "Readiness Margin",
        leftValue: "82%",
        rightValue: "66%",
        delta: "-16 pts",
        trend: "down",
        severity: "critical",
        accent: "#55d38f",
        description:
          "Readiness drops when growth spreads beyond compact service areas.",
      },
      {
        id: "fiscal-lift",
        label: "Fiscal Lift",
        leftValue: "$49.8M",
        rightValue: "$61.0M",
        delta: "+$11.2M",
        trend: "up",
        severity: "positive",
        accent: "#f0cd79",
        description:
          "Revenue lift improves in exchange for higher planning workload.",
      },
      {
        id: "constraint-exposure",
        label: "Constraint Exposure",
        leftValue: "14%",
        rightValue: "24%",
        delta: "+10 pts",
        trend: "up",
        severity: "critical",
        accent: "#ff8d7a",
        description:
          "Constraint exposure widens under the high-growth posture.",
      },
    ],
    narratives: [
      {
        id: "planning-comparison-summary",
        title: "Planning posture",
        severity: "watch",
        body:
          "The planning tradeoff is clear: compact infill lowers review complexity, while accelerated growth raises the need for permit triage.",
      },
      {
        id: "planning-risk-summary",
        title: "Risk posture",
        severity: "critical",
        body:
          "Accelerated Growth should not be reviewed without flood and infrastructure overlays active in the map workspace.",
      },
    ],
  },
  {
    id: "infrastructure-first__accelerated-growth",
    title: "Constrained Infrastructure vs High Growth",
    summary:
      "This executive contrast frames the widest operating spread: high growth maximizes opportunity, while constrained infrastructure protects readiness and risk posture.",
    leftScenarioId: "infrastructure-first",
    rightScenarioId: "accelerated-growth",
    recommendedBriefingMode: "risk",
    fiscalOpportunityShift: "+$25.2M modeled tax opportunity",
    infrastructureReadinessShift: "-18 pts readiness margin",
    parcelPressureShift: "+31% parcel pressure",
    riskIndicators: [
      "Highest mock upside also creates the steepest service-readiness gap.",
      "High growth should be paired with capital triggers before approval.",
      "Risk review should focus on flood, mobility, and utility sequencing.",
    ],
    metrics: [
      {
        id: "growth-pressure",
        label: "Growth Pressure",
        leftValue: "67.5",
        rightValue: "91.2",
        delta: "+23.7",
        trend: "up",
        severity: "critical",
        accent: "#d8b86a",
        description:
          "High growth creates the largest pressure spread in the mock model.",
      },
      {
        id: "readiness-margin",
        label: "Readiness Margin",
        leftValue: "84%",
        rightValue: "66%",
        delta: "-18 pts",
        trend: "down",
        severity: "critical",
        accent: "#55d38f",
        description:
          "Capacity margin narrows sharply without infrastructure-first pacing.",
      },
      {
        id: "fiscal-lift",
        label: "Fiscal Lift",
        leftValue: "$35.8M",
        rightValue: "$61.0M",
        delta: "+$25.2M",
        trend: "up",
        severity: "positive",
        accent: "#f0cd79",
        description:
          "Mock fiscal gain is meaningful, but depends on staged service delivery.",
      },
      {
        id: "constraint-exposure",
        label: "Constraint Exposure",
        leftValue: "12%",
        rightValue: "24%",
        delta: "+12 pts",
        trend: "up",
        severity: "critical",
        accent: "#ff8d7a",
        description:
          "Risk exposure doubles in the comparison spread.",
      },
    ],
    narratives: [
      {
        id: "review-executive-summary",
        title: "Executive posture",
        severity: "critical",
        body:
          "This is the highest-stakes mock comparison and should be treated as a briefing lens for capital timing, corridor readiness, and risk acceptance.",
      },
      {
        id: "review-infrastructure-summary",
        title: "Infrastructure posture",
        severity: "watch",
        body:
          "Infrastructure sequencing becomes the deciding variable between opportunity capture and service strain.",
      },
    ],
  },
];

export const mockExecutiveBriefings: ExecutiveBriefing[] = [
  {
    id: "briefing:baseline__accelerated-growth:executive",
    comparisonId: "baseline__accelerated-growth",
    mode: "executive",
    title: "Executive Growth Brief",
    subtitle: "Baseline policy momentum compared with accelerated absorption.",
    generatedAtLabel: "Mock briefing generated for Phase 1",
    narrative: mockScenarioComparisons[0].narratives[0],
    topOpportunities: [
      "Capture higher modeled tax lift along active corridors.",
      "Use permit clusters to prioritize capital sequencing.",
      "Focus executive review on parcels with strong readiness scores.",
    ],
    topRisks: [
      "Readiness margin narrows under accelerated growth.",
      "Constraint exposure rises near corridor and flood review zones.",
      "Planning staff workload increases with permit velocity.",
    ],
    infrastructureOutlook:
      "Infrastructure readiness remains viable if high-pressure areas are sequenced through capacity review before approvals accelerate.",
    growthPressureSummary:
      "Growth pressure increases from baseline to a high-watch posture, especially around Concord Parkway, Midland, and Kannapolis nodes.",
    recommendation:
      "Advance only with infrastructure triggers, risk-overlay review, and executive monitoring of corridor readiness.",
    sections: [
      {
        id: "executive_summary",
        title: "Executive Summary",
        severity: "watch",
        body:
          "Accelerated Growth can produce stronger upside, but the scenario should be governed as a readiness-managed strategy.",
        bullets: [
          "Fiscal upside improves materially.",
          "Infrastructure review becomes the gating workflow.",
          "Risk overlays should remain active in executive mode.",
        ],
      },
      {
        id: "recommendation",
        title: "Recommended Action",
        severity: "watch",
        body:
          "Use a staged adoption posture rather than a full high-growth release.",
        bullets: [
          "Tie growth areas to service readiness checkpoints.",
          "Review critical notices weekly.",
          "Keep capital timing in the executive briefing pack.",
        ],
      },
    ],
  },
  {
    id: "briefing:baseline__infrastructure-first:infrastructure",
    comparisonId: "baseline__infrastructure-first",
    mode: "infrastructure",
    title: "Infrastructure Sequencing Brief",
    subtitle: "Baseline momentum compared with capacity-first growth timing.",
    generatedAtLabel: "Mock briefing generated for Phase 1",
    narrative: mockScenarioComparisons[1].narratives[0],
    topOpportunities: [
      "Protect service levels while preserving long-term growth options.",
      "Use readiness gains to target capital investments.",
      "Lower constraint exposure before permit pressure rises.",
    ],
    topRisks: [
      "Near-term fiscal lift is deferred.",
      "Some growth corridors may face slower absorption.",
      "Public messaging must explain timing tradeoffs.",
    ],
    infrastructureOutlook:
      "Capacity-first sequencing improves readiness and reduces exposure, creating a cleaner operating posture for infrastructure reviewers.",
    growthPressureSummary:
      "Growth pressure softens under capacity gates, but the scenario keeps opportunity focused in serviceable corridors.",
    recommendation:
      "Use this posture when service reliability and capital alignment are more important than short-term revenue acceleration.",
    sections: [
      {
        id: "infrastructure",
        title: "Infrastructure Outlook",
        severity: "positive",
        body:
          "Readiness improves as capital timing becomes the controlling growth variable.",
        bullets: [
          "Readiness margin improves by double digits.",
          "Risk exposure falls in capacity-constrained areas.",
          "Fiscal lift moves into a longer sequencing window.",
        ],
      },
      {
        id: "fiscal_outlook",
        title: "Fiscal Tradeoff",
        severity: "neutral",
        body:
          "The mock model shifts some opportunity into later years rather than removing it.",
        bullets: [
          "Near-term modeled lift declines.",
          "Long-term service confidence improves.",
          "Capital readiness becomes easier to communicate.",
        ],
      },
    ],
  },
  {
    id: "briefing:infill-priority__accelerated-growth:planning",
    comparisonId: "infill-priority__accelerated-growth",
    mode: "planning",
    title: "Planning Comparison Brief",
    subtitle: "Compact infill review compared with high-growth pressure.",
    generatedAtLabel: "Mock briefing generated for Phase 1",
    narrative: mockScenarioComparisons[2].narratives[0],
    topOpportunities: [
      "Use infill to keep pressure inside serviceable areas.",
      "Compare permit volume against zoning review capacity.",
      "Focus parcel review where redevelopment potential is strongest.",
    ],
    topRisks: [
      "Accelerated growth can overwhelm review queues.",
      "Infrastructure readiness drops outside compact service zones.",
      "Constraint exposure rises with broader parcel pressure.",
    ],
    infrastructureOutlook:
      "Infill Priority keeps readiness stronger, while Accelerated Growth requires more active infrastructure triage.",
    growthPressureSummary:
      "The growth-pressure gap is wide and should be treated as a planning workload signal.",
    recommendation:
      "Use Infill Priority as the operating default and review Accelerated Growth as an exception path with added capacity checks.",
    sections: [
      {
        id: "growth_pressure",
        title: "Growth Pressure",
        severity: "critical",
        body:
          "Accelerated Growth creates the highest planning workload in this comparison.",
        bullets: [
          "Parcel pressure jumps above compact infill posture.",
          "Permit activity needs triage.",
          "Zoning review capacity becomes a key constraint.",
        ],
      },
      {
        id: "opportunities",
        title: "Planning Opportunity",
        severity: "positive",
        body:
          "Infill Priority offers a more controlled path for parcel intelligence review.",
        bullets: [
          "Better service-area fit.",
          "Cleaner redevelopment targeting.",
          "Lower constraint review burden.",
        ],
      },
    ],
  },
  {
    id: "briefing:infrastructure-first__accelerated-growth:risk",
    comparisonId: "infrastructure-first__accelerated-growth",
    mode: "risk",
    title: "Risk Acceptance Brief",
    subtitle: "Capacity-constrained strategy compared with high-growth upside.",
    generatedAtLabel: "Mock briefing generated for Phase 1",
    narrative: mockScenarioComparisons[3].narratives[0],
    topOpportunities: [
      "High growth creates the strongest modeled fiscal upside.",
      "Capital triggers can convert pressure into sequenced opportunity.",
      "Executive briefings can monitor the largest operating spread.",
    ],
    topRisks: [
      "Constraint exposure doubles in the mock spread.",
      "Readiness margin drops sharply without capacity pacing.",
      "Risk acceptance must be explicit before growth acceleration.",
    ],
    infrastructureOutlook:
      "Infrastructure becomes the deciding factor: high growth is only viable with strict capital triggers and corridor readiness checks.",
    growthPressureSummary:
      "This comparison produces the most aggressive pressure profile in the mock dashboard.",
    recommendation:
      "Treat high growth as an executive decision path requiring documented risk acceptance and staged infrastructure commitments.",
    sections: [
      {
        id: "risks",
        title: "Risk Review",
        severity: "critical",
        body:
          "The comparison should be used to brief leadership on the cost of accepting pressure before readiness catches up.",
        bullets: [
          "Constraint exposure doubles.",
          "Readiness margin falls sharply.",
          "Flood and mobility overlays should remain active.",
        ],
      },
      {
        id: "recommendation",
        title: "Decision Guidance",
        severity: "watch",
        body:
          "High growth should be approved only with explicit capital timing and risk governance.",
        bullets: [
          "Require infrastructure triggers.",
          "Use executive briefing cadence.",
          "Preserve risk review as a gate.",
        ],
      },
    ],
  },
];
