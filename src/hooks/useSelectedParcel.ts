"use client";

import { useCallback, useMemo, useState } from "react";
import { mockParcels } from "@/data/mock/parcelMockData";
import type { ParcelSelectionSource } from "@/types";

interface SelectParcelOptions {
  source?: ParcelSelectionSource;
}

export function useSelectedParcel() {
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(
    mockParcels[0]?.parcelId ?? null,
  );
  const [selectedParcelSource, setSelectedParcelSource] =
    useState<ParcelSelectionSource | null>("dashboard");

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
      const nextParcel = mockParcels.find((parcel) => parcel.parcelId === parcelId);

      if (!nextParcel) {
        return;
      }

      setSelectedParcelId(nextParcel.parcelId);
      setSelectedParcelSource(options.source ?? "dashboard");
    },
    [],
  );

  const clearSelectedParcel = useCallback(() => {
    setSelectedParcelId(null);
    setSelectedParcelSource(null);
  }, []);

  return {
    clearSelectedParcel,
    selectParcel,
    selectedParcel,
    selectedParcelId,
    selectedParcelSource,
  };
}
