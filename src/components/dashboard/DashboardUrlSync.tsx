"use client";

import { useEffect, useRef } from "react";
import { useDashboardState } from "@/hooks/useDashboardState";
import {
  deserializeDashboardUrlState,
  mergeDashboardUrlState,
  serializeDashboardUrlState,
} from "@/lib/dashboard/urlState";

export function DashboardUrlSync() {
  const {
    applyRolePreset,
    applyWorkspacePreset,
    clearSelectedParcel,
    dashboardUrlState,
    selectParcel,
    setActiveLayerIds,
    setBriefingMode,
    setComparisonPair,
    selectReportPackage,
    setPrintableViewMode,
    setReportIntent,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
  } = useDashboardState();
  const initialStateSearchRef = useRef(
    serializeDashboardUrlState(dashboardUrlState),
  );
  const lastHydratedSearchRef = useRef<string | null>(null);
  const skipUrlWriteForSearchRef = useRef<string | null>(null);

  useEffect(() => {
    function hydrateFromCurrentUrl() {
      const currentSearch = getCurrentSearchString();

      if (lastHydratedSearchRef.current === currentSearch) {
        return;
      }

      lastHydratedSearchRef.current = currentSearch;
      skipUrlWriteForSearchRef.current = currentSearch;
      const nextState = deserializeDashboardUrlState(currentSearch);

      if (nextState.roleId) {
        applyRolePreset(nextState.roleId);
      }

      if (nextState.comparisonPair) {
        setComparisonPair(nextState.comparisonPair);
      }

      if (nextState.briefingMode) {
        setBriefingMode(nextState.briefingMode);
      }

      if (nextState.printableViewMode) {
        setPrintableViewMode(nextState.printableViewMode);
      }

      if (nextState.reportExportIntent) {
        setReportIntent(nextState.reportExportIntent);
      }

      if (nextState.activeReportPackageId) {
        selectReportPackage(nextState.activeReportPackageId);
      }

      if (nextState.viewMode) {
        applyWorkspacePreset(nextState.viewMode);
      }

      if (nextState.selectedParcelId !== undefined) {
        if (nextState.selectedParcelId) {
          selectParcel(nextState.selectedParcelId, { source: "url" });
        } else {
          clearSelectedParcel();
        }
      }

      if (nextState.scenarioId) {
        setScenarioId(nextState.scenarioId);
      }

      if (typeof nextState.simulationYear === "number") {
        setSimulationYear(nextState.simulationYear);
      }

      if (typeof nextState.simulationIntensity === "number") {
        setSimulationIntensity(nextState.simulationIntensity);
      }

      if (nextState.activeLayerIds) {
        setActiveLayerIds(nextState.activeLayerIds);
      }
    }

    hydrateFromCurrentUrl();
    window.addEventListener("popstate", hydrateFromCurrentUrl);

    return () => {
      window.removeEventListener("popstate", hydrateFromCurrentUrl);
    };
  }, [
    applyRolePreset,
    applyWorkspacePreset,
    clearSelectedParcel,
    selectParcel,
    selectReportPackage,
    setActiveLayerIds,
    setBriefingMode,
    setComparisonPair,
    setPrintableViewMode,
    setReportIntent,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
  ]);

  useEffect(() => {
    if (lastHydratedSearchRef.current === null) {
      return;
    }

    const currentSearch = getCurrentSearchString();

    if (skipUrlWriteForSearchRef.current === currentSearch) {
      skipUrlWriteForSearchRef.current = null;
      return;
    }

    const nextSearch = mergeDashboardUrlState(
      currentSearch,
      dashboardUrlState,
    );

    // Only dashboard intelligence state is synced. Camera position and map
    // movement are intentionally excluded until Phase 1 has a dedicated view
    // bookmark model, which avoids noisy URL updates while users navigate 3D.
    if (
      !currentSearch &&
      nextSearch === initialStateSearchRef.current
    ) {
      return;
    }

    if (nextSearch === currentSearch) {
      return;
    }

    window.history.replaceState(null, "", createDashboardUrl(nextSearch));
    lastHydratedSearchRef.current = nextSearch;
  }, [dashboardUrlState]);

  return null;
}

function getCurrentSearchString() {
  return window.location.search.startsWith("?")
    ? window.location.search.slice(1)
    : window.location.search;
}

function createDashboardUrl(search: string) {
  return `${window.location.pathname}${search ? `?${search}` : ""}${
    window.location.hash
  }`;
}
