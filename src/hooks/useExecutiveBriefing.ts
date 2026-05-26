"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getDefaultScenarioComparisonPair,
  mockScenarioComparisonAdapter,
} from "@/lib/dashboard/scenarioComparisonAdapter";
import type { ScenarioId } from "@/types";
import type {
  ExecutiveBriefingMode,
  ScenarioComparisonPair,
} from "@/types/scenarioComparison";

export type BriefingGenerationState = "mock-ready" | "preparing";

export function useExecutiveBriefing() {
  const defaultPair = getDefaultScenarioComparisonPair();
  const [comparisonPair, setComparisonPairState] =
    useState<ScenarioComparisonPair>(defaultPair);
  const [briefingMode, setBriefingMode] =
    useState<ExecutiveBriefingMode>("executive");
  const [selectedNarrativeId, setSelectedNarrativeId] = useState<string | null>(
    null,
  );
  const [briefingGenerationState] =
    useState<BriefingGenerationState>("mock-ready");

  const activeComparison = useMemo(
    () =>
      mockScenarioComparisonAdapter.compareScenarios({
        ...comparisonPair,
        briefingMode,
      }),
    [briefingMode, comparisonPair],
  );

  const executiveBriefing = useMemo(
    () =>
      mockScenarioComparisonAdapter.generateExecutiveBriefing({
        ...comparisonPair,
        briefingMode,
      }),
    [briefingMode, comparisonPair],
  );

  const selectedExecutiveNarrative = useMemo(
    () =>
      activeComparison.narratives.find(
        (narrative) => narrative.id === selectedNarrativeId,
      ) ??
      executiveBriefing.narrative ??
      activeComparison.narratives[0],
    [activeComparison.narratives, executiveBriefing.narrative, selectedNarrativeId],
  );

  const setComparisonPair = useCallback((nextPair: ScenarioComparisonPair) => {
    setComparisonPairState(nextPair);
  }, []);

  const setComparisonScenarioIds = useCallback(
    (leftScenarioId: ScenarioId, rightScenarioId: ScenarioId) => {
      setComparisonPairState({ leftScenarioId, rightScenarioId });
    },
    [],
  );

  return {
    activeComparison,
    briefingGenerationState,
    briefingMode,
    comparisonMetrics: activeComparison.metrics,
    comparisonPair,
    executiveBriefing,
    briefingSections: executiveBriefing.sections,
    selectedExecutiveNarrative,
    selectedNarrativeId,
    selectExecutiveNarrative: setSelectedNarrativeId,
    setBriefingMode,
    setComparisonPair,
    setComparisonScenarioIds,
  };
}
