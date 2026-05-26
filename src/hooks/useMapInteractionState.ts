"use client";

import { useCallback, useState } from "react";
import type { DashboardStatus } from "@/types";

export function useMapInteractionState() {
  const [mapStatus, setMapStatus] = useState<DashboardStatus>("idle");
  const [mapError, setMapError] = useState<string | null>(null);

  const clearMapError = useCallback(() => {
    setMapError(null);
  }, []);

  return {
    clearMapError,
    mapError,
    mapStatus,
    setMapError,
    setMapStatus,
  };
}
