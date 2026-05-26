"use client";

import { useMemo, useState } from "react";
import {
  initialDashboardState,
  scenarioPresets,
} from "@/data/mock/dashboardMockData";
import type { ScenarioId } from "@/types";

export function useScenarioState() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(
    initialDashboardState.scenarioId,
  );
  const [simulationYear, setSimulationYear] = useState<number>(
    initialDashboardState.selectedSimulationYear,
  );
  const [simulationIntensity, setSimulationIntensity] = useState<number>(
    initialDashboardState.simulationIntensity,
  );

  const activeScenario = useMemo(
    () =>
      scenarioPresets.find((scenario) => scenario.id === scenarioId) ??
      scenarioPresets[0],
    [scenarioId],
  );

  return {
    activeScenario,
    scenarioId,
    scenarioName: activeScenario.name,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
    simulationIntensity,
    simulationYear,
  };
}
