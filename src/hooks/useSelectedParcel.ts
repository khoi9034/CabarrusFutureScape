"use client";

import { useCallback, useMemo, useState } from "react";
import type { ParcelSearchRecord } from "@/data/intelligence/parcelSearchData";
import { mockParcels } from "@/data/mock/parcelMockData";
import type { ParcelSelectionSource } from "@/types";

interface SelectParcelOptions {
  source?: ParcelSelectionSource;
}

export type SelectedParcelIntelligenceSource = "api" | "fallback" | "static";

export function useSelectedParcel() {
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedParcelSource, setSelectedParcelSource] =
    useState<ParcelSelectionSource | null>(null);
  const [selectedParcelIntelligence, setSelectedParcelIntelligenceState] =
    useState<ParcelSearchRecord | null>(null);
  const [
    selectedParcelIntelligenceSource,
    setSelectedParcelIntelligenceSource,
  ] = useState<SelectedParcelIntelligenceSource | null>(null);

  const selectedParcel = useMemo(
    () =>
      selectedParcelId
        ? mockParcels.find((parcel) => parcel.parcelId === selectedParcelId) ??
          null
        : null,
    [selectedParcelId],
  );

  const selectParcel = useCallback(
    (parcelId: string, options: SelectParcelOptions = {}) => {
      if (selectedParcelId === parcelId) {
        setSelectedParcelSource(
          options.source ?? selectedParcelSource ?? "dashboard",
        );
        return;
      }

      setSelectedParcelId(parcelId);
      setSelectedParcelSource(options.source ?? "dashboard");
      setSelectedParcelIntelligenceState(null);
      setSelectedParcelIntelligenceSource(null);
    },
    [selectedParcelId, selectedParcelSource],
  );

  const setSelectedParcelIntelligence = useCallback(
    (
      parcel: ParcelSearchRecord,
      source: SelectedParcelIntelligenceSource,
    ) => {
      setSelectedParcelId(parcel.officialParcelId);
      setSelectedParcelSource("dashboard");
      setSelectedParcelIntelligenceState(parcel);
      setSelectedParcelIntelligenceSource(source);
    },
    [],
  );

  const clearSelectedParcel = useCallback(() => {
    setSelectedParcelId(null);
    setSelectedParcelSource(null);
    setSelectedParcelIntelligenceState(null);
    setSelectedParcelIntelligenceSource(null);
  }, []);

  return {
    clearSelectedParcel,
    selectParcel,
    selectedParcel,
    selectedParcelId,
    selectedParcelIntelligence,
    selectedParcelIntelligenceSource,
    selectedParcelSource,
    setSelectedParcelIntelligence,
  };
}
