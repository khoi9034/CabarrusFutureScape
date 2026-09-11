"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardState } from "@/hooks/useDashboardState";
import {
  deserializeDashboardUrlState,
  mergeDashboardUrlState,
  serializeDashboardUrlState,
} from "@/lib/dashboard/urlState";
import {
  hasUnresolvedManagementTarget,
  readManagementHandoff,
} from "@/lib/managementHandoff";

export function DashboardUrlSync() {
  const {
    applyRolePreset,
    applyWorkspacePreset,
    cfsAppMode,
    clearSelectedParcel,
    dashboardUrlState,
    selectParcel,
    setCfsAppMode,
    setActiveLayerIds,
    setBriefingMode,
    setComparisonPair,
    selectReportPackage,
    setPrintableViewMode,
    setReportIntent,
    setScenarioId,
    setSimulationIntensity,
    setSimulationYear,
    setEconomicsSection,
    setOverviewCommandMode,
    setSelectedDevelopmentHotspotContext,
    setSelectedModelResearchContext,
  } = useDashboardState();
  const [handoffError, setHandoffError] = useState(false);
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
      // Deserialization validates every dashboard param against mock registries.
      // Invalid share URLs fall back to the current mock-safe state instead of
      // throwing or reaching for production county services.
      const nextState = deserializeDashboardUrlState(currentSearch);
      const handoff = readManagementHandoff(window.history.state, currentSearch);
      setHandoffError(hasUnresolvedManagementTarget(currentSearch) && !handoff);
      const appMode = new URLSearchParams(currentSearch).get("app");
      if (
        appMode === "management" ||
        appMode === "planning" ||
        appMode === "economics" ||
        appMode === "master-data"
      ) {
        setCfsAppMode(appMode);
      } else {
        setCfsAppMode(null);
        return;
      }

      if (appMode === "management" || appMode === "master-data") {
        return;
      }

      if (handoff) {
        if (handoff.targetWorkspace === "economics") {
          setEconomicsSection("dashboard");
        } else {
          setOverviewCommandMode(handoff.planningMode ?? "countywide");
          if (handoff.selectedHotspotContext) {
            setSelectedDevelopmentHotspotContext(handoff.selectedHotspotContext);
          }
          if (handoff.selectedSignalContext) {
            setSelectedModelResearchContext(handoff.selectedSignalContext);
          }
        }
      }

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
    setCfsAppMode,
    setActiveLayerIds,
    setBriefingMode,
    setComparisonPair,
    setPrintableViewMode,
    setReportIntent,
    setScenarioId,
    setEconomicsSection,
    setOverviewCommandMode,
    setSelectedDevelopmentHotspotContext,
    setSelectedModelResearchContext,
    setSimulationIntensity,
    setSimulationYear,
  ]);

  useEffect(() => {
    if (lastHydratedSearchRef.current === null) {
      return;
    }

    if (
      !cfsAppMode ||
      cfsAppMode === "management" ||
      cfsAppMode === "master-data"
    ) {
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
  }, [cfsAppMode, dashboardUrlState]);

  return handoffError ? (
    <div className="fixed left-1/2 top-3 z-[120] -translate-x-1/2 rounded-lg border border-amber-300/25 bg-[#17130a]/95 px-4 py-2 text-sm text-amber-100 shadow-xl" role="status">
      The selected Management item is no longer available.
    </div>
  ) : null;
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
