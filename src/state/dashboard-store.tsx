"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { mockParcels } from "@/data/mockParcels";
import { scenarioPresets } from "@/data/mockMetrics";
import { getDefaultLayerIds } from "@/lib/layers/layerRegistry";
import type { MapStatus, ParcelIntelligence, ScenarioId } from "@/lib/types";

interface DashboardContextValue {
  activeLayerIds: string[];
  selectedParcelId: string;
  selectedParcel: ParcelIntelligence;
  scenarioId: ScenarioId;
  scenarioName: string;
  simulationYear: number;
  simulationIntensity: number;
  mapStatus: MapStatus;
  isLayerActive: (layerId: string) => boolean;
  toggleLayer: (layerId: string) => void;
  selectParcel: (parcelId: string) => void;
  setScenarioId: (scenarioId: ScenarioId) => void;
  setSimulationYear: (year: number) => void;
  setSimulationIntensity: (intensity: number) => void;
  setMapStatus: (status: MapStatus) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeLayerIds, setActiveLayerIds] = useState<string[]>(getDefaultLayerIds);
  const [selectedParcelId, setSelectedParcelId] = useState(mockParcels[0].parcelId);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("baseline");
  const [simulationYear, setSimulationYear] = useState(2030);
  const [simulationIntensity, setSimulationIntensity] = useState(58);
  const [mapStatus, setMapStatus] = useState<MapStatus>("idle");

  const selectedParcel =
    mockParcels.find((parcel) => parcel.parcelId === selectedParcelId) ??
    mockParcels[0];

  const scenarioName =
    scenarioPresets.find((scenario) => scenario.id === scenarioId)?.name ??
    "Baseline Growth";

  const isLayerActive = useCallback(
    (layerId: string) => activeLayerIds.includes(layerId),
    [activeLayerIds],
  );

  const toggleLayer = useCallback((layerId: string) => {
    setActiveLayerIds((current) =>
      current.includes(layerId)
        ? current.filter((id) => id !== layerId)
        : [...current, layerId],
    );
  }, []);

  const selectParcel = useCallback((parcelId: string) => {
    if (mockParcels.some((parcel) => parcel.parcelId === parcelId)) {
      setSelectedParcelId(parcelId);
    }
  }, []);

  const value = useMemo(
    () => ({
      activeLayerIds,
      selectedParcelId,
      selectedParcel,
      scenarioId,
      scenarioName,
      simulationYear,
      simulationIntensity,
      mapStatus,
      isLayerActive,
      toggleLayer,
      selectParcel,
      setScenarioId,
      setSimulationYear,
      setSimulationIntensity,
      setMapStatus,
    }),
    [
      activeLayerIds,
      selectedParcelId,
      selectedParcel,
      scenarioId,
      scenarioName,
      simulationYear,
      simulationIntensity,
      mapStatus,
      isLayerActive,
      toggleLayer,
      selectParcel,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardState() {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error("useDashboardState must be used within DashboardProvider");
  }

  return context;
}
