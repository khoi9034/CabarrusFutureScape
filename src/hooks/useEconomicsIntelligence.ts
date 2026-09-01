"use client";

import { useEffect, useState } from "react";
import { getEconomicsIntelligence } from "@/lib/economicsIntelligenceService";
import type { EconomicsIntelligenceResponse } from "@/types/api";

export function useEconomicsIntelligence() {
  const [data, setData] = useState<EconomicsIntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getEconomicsIntelligence()
      .then((response) => {
        if (!active) return;
        setData(response);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Economics intelligence is unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, error, isLoading: !data && !error };
}
