"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  const selectedParcelIdRef = useRef<string | null>(null);
  const selectedParcelSourceRef = useRef<ParcelSelectionSource | null>(null);
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
      if (selectedParcelIdRef.current === parcelId) {
        const source =
          options.source ?? selectedParcelSourceRef.current ?? "dashboard";
        selectedParcelSourceRef.current = source;
        setSelectedParcelSource(source);
        return;
      }

      selectedParcelIdRef.current = parcelId;
      selectedParcelSourceRef.current = options.source ?? "dashboard";
      setSelectedParcelId(parcelId);
      setSelectedParcelSource(selectedParcelSourceRef.current);
      setSelectedParcelIntelligenceState(null);
      setSelectedParcelIntelligenceSource(null);
    },
    [],
  );

  const setSelectedParcelIntelligence = useCallback(
    (
      parcel: ParcelSearchRecord,
      source: SelectedParcelIntelligenceSource,
    ) => {
      selectedParcelIdRef.current = parcel.officialParcelId;
      selectedParcelSourceRef.current = "dashboard";
      setSelectedParcelId(parcel.officialParcelId);
      setSelectedParcelSource("dashboard");
      setSelectedParcelIntelligenceState(parcel);
      setSelectedParcelIntelligenceSource(source);
    },
    [],
  );

  const clearSelectedParcel = useCallback(() => {
    selectedParcelIdRef.current = null;
    selectedParcelSourceRef.current = null;
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
