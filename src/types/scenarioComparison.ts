import type { ScenarioId } from "@/types";

export type ComparisonSeverity = "critical" | "neutral" | "positive" | "watch";

export type ComparisonTrend = "down" | "flat" | "mixed" | "up";

export type BriefingSection =
  | "executive_summary"
  | "fiscal_outlook"
  | "growth_pressure"
  | "infrastructure"
  | "opportunities"
  | "recommendation"
  | "risks";

export type ExecutiveBriefingMode =
  | "executive"
  | "infrastructure"
  | "planning"
  | "risk";

export interface ScenarioComparisonMetric {
  accent: string;
  delta: string;
  description: string;
  id: string;
  label: string;
  leftValue: string;
  rightValue: string;
  severity: ComparisonSeverity;
  trend: ComparisonTrend;
}

export interface ExecutiveNarrative {
  body: string;
  id: string;
  severity: ComparisonSeverity;
  title: string;
}

export interface ExecutiveBriefingSection {
  body: string;
  bullets: string[];
  id: BriefingSection;
  severity: ComparisonSeverity;
  title: string;
}

export interface ScenarioComparison {
  fiscalOpportunityShift: string;
  id: string;
  infrastructureReadinessShift: string;
  leftScenarioId: ScenarioId;
  metrics: ScenarioComparisonMetric[];
  narratives: ExecutiveNarrative[];
  parcelPressureShift: string;
  recommendedBriefingMode: ExecutiveBriefingMode;
  rightScenarioId: ScenarioId;
  riskIndicators: string[];
  summary: string;
  title: string;
}

export interface ExecutiveBriefing {
  comparisonId: string;
  generatedAtLabel: string;
  growthPressureSummary: string;
  id: string;
  infrastructureOutlook: string;
  mode: ExecutiveBriefingMode;
  narrative: ExecutiveNarrative;
  recommendation: string;
  sections: ExecutiveBriefingSection[];
  subtitle: string;
  title: string;
  topOpportunities: string[];
  topRisks: string[];
}

export interface ScenarioComparisonPair {
  leftScenarioId: ScenarioId;
  rightScenarioId: ScenarioId;
}
