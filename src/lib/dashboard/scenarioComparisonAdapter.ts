import {
  defaultScenarioComparisonPair,
  mockExecutiveBriefings,
  mockScenarioComparisons,
} from "@/data/mock/scenarioComparisonMockData";
import type { ScenarioId } from "@/types";
import type {
  ExecutiveBriefing,
  ExecutiveBriefingMode,
  ComparisonTrend,
  ScenarioComparison,
  ScenarioComparisonMetric,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";

export interface ScenarioComparisonRequest extends ScenarioComparisonPair {
  briefingMode?: ExecutiveBriefingMode;
}

export interface ScenarioComparisonAdapter {
  compareScenarios: (
    request: ScenarioComparisonRequest,
  ) => ScenarioComparison;
  generateExecutiveBriefing: (
    request: ScenarioComparisonRequest,
  ) => ExecutiveBriefing;
  getComparisonOptions: () => ScenarioComparison[];
  summarizeGrowthPressure: (comparisonId: string) => string;
  summarizeInfrastructureImpact: (comparisonId: string) => string;
  summarizeScenarioRisk: (comparisonId: string) => string;
}

// Phase 1 comparison intelligence is intentionally mock-only. This adapter is
// the boundary for future report export, service-backed scenario analytics,
// and AI-assisted briefing generation without coupling UI components to those
// systems before real governance and data contracts exist.
export const mockScenarioComparisonAdapter: ScenarioComparisonAdapter = {
  compareScenarios: (request) => getComparisonForPair(request),
  generateExecutiveBriefing: (request) => {
    const comparison = getComparisonForPair(request);
    const briefingMode =
      request.briefingMode ?? comparison.recommendedBriefingMode;

    return (
      mockExecutiveBriefings.find(
        (briefing) =>
          briefing.comparisonId === comparison.id &&
          briefing.mode === briefingMode,
      ) ??
      mockExecutiveBriefings.find(
        (briefing) => briefing.comparisonId === comparison.id,
      ) ??
      mockExecutiveBriefings[0]
    );
  },
  getComparisonOptions: () => mockScenarioComparisons,
  summarizeGrowthPressure: (comparisonId) =>
    getComparisonById(comparisonId).parcelPressureShift,
  summarizeInfrastructureImpact: (comparisonId) =>
    getComparisonById(comparisonId).infrastructureReadinessShift,
  summarizeScenarioRisk: (comparisonId) =>
    getComparisonById(comparisonId).riskIndicators.join(" "),
};

export function createScenarioComparisonId(
  leftScenarioId: ScenarioId,
  rightScenarioId: ScenarioId,
) {
  return `${leftScenarioId}__${rightScenarioId}`;
}

export function getDefaultScenarioComparisonPair() {
  return defaultScenarioComparisonPair;
}

export function getScenarioComparisonOptions() {
  return mockScenarioComparisons;
}

export function isScenarioComparisonPair(
  leftScenarioId: ScenarioId,
  rightScenarioId: ScenarioId,
) {
  return Boolean(findComparison(leftScenarioId, rightScenarioId));
}

function getComparisonForPair(request: ScenarioComparisonRequest) {
  return (
    findComparison(request.leftScenarioId, request.rightScenarioId) ??
    findComparison(
      defaultScenarioComparisonPair.leftScenarioId,
      defaultScenarioComparisonPair.rightScenarioId,
    ) ??
    mockScenarioComparisons[0]
  );
}

function getComparisonById(comparisonId: string) {
  return (
    mockScenarioComparisons.find((comparison) => comparison.id === comparisonId) ??
    mockScenarioComparisons[0]
  );
}

function findComparison(
  leftScenarioId: ScenarioId,
  rightScenarioId: ScenarioId,
) {
  const directId = createScenarioComparisonId(leftScenarioId, rightScenarioId);
  const reverseId = createScenarioComparisonId(rightScenarioId, leftScenarioId);
  const direct = mockScenarioComparisons.find(
    (comparison) => comparison.id === directId,
  );

  if (direct) {
    return direct;
  }

  const reverse = mockScenarioComparisons.find(
    (comparison) => comparison.id === reverseId,
  );

  return reverse ? invertComparison(reverse) : undefined;
}

function invertComparison(comparison: ScenarioComparison): ScenarioComparison {
  return {
    ...comparison,
    fiscalOpportunityShift: invertSignedLabel(comparison.fiscalOpportunityShift),
    id: createScenarioComparisonId(
      comparison.rightScenarioId,
      comparison.leftScenarioId,
    ),
    infrastructureReadinessShift: invertSignedLabel(
      comparison.infrastructureReadinessShift,
    ),
    leftScenarioId: comparison.rightScenarioId,
    metrics: comparison.metrics.map(invertMetric),
    parcelPressureShift: invertSignedLabel(comparison.parcelPressureShift),
    rightScenarioId: comparison.leftScenarioId,
    title: invertTitle(comparison.title),
  };
}

function invertMetric(metric: ScenarioComparisonMetric) {
  return {
    ...metric,
    delta: invertSignedLabel(metric.delta),
    leftValue: metric.rightValue,
    rightValue: metric.leftValue,
    trend: invertTrend(metric.trend),
  };
}

function invertTrend(trend: ScenarioComparisonMetric["trend"]): ComparisonTrend {
  switch (trend) {
    case "down":
      return "up";
    case "up":
      return "down";
    case "flat":
    case "mixed":
    default:
      return trend;
  }
}

function invertSignedLabel(label: string) {
  if (label.startsWith("+")) {
    return `-${label.slice(1)}`;
  }

  if (label.startsWith("-")) {
    return `+${label.slice(1)}`;
  }

  return label;
}

function invertTitle(title: string) {
  const [left, right] = title.split(" vs ");

  return left && right ? `${right} vs ${left}` : title;
}
