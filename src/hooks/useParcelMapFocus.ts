"use client";

import { useCallback, useMemo, useState } from "react";
import {
  createParcelMapFocus,
  resolveParcelMapFocus,
  type ParcelFocusRecordLike,
} from "@/lib/map/parcelMapFocus";
import type {
  ParcelFocusSource,
  ParcelMapFocus,
} from "@/types/map/parcelFocus";

export function useParcelMapFocus() {
  const [selectedParcelFocus, setSelectedParcelFocus] =
    useState<ParcelMapFocus | null>(null);

  const focusResult = useMemo(
    () => resolveParcelMapFocus(selectedParcelFocus),
    [selectedParcelFocus],
  );

  const setParcelFocus = useCallback((focus: ParcelMapFocus) => {
    setSelectedParcelFocus({
      ...focus,
      focusStatus: resolveParcelMapFocus(focus).focusStatus,
    });
  }, []);

  const setParcelFocusFromRecord = useCallback(
    (record: ParcelFocusRecordLike, focusSource: ParcelFocusSource) => {
      setSelectedParcelFocus(createParcelMapFocus(record, focusSource));
    },
    [],
  );

  const clearParcelFocus = useCallback(() => {
    setSelectedParcelFocus(null);
  }, []);

  return {
    canFocusMap: focusResult.canFocus,
    clearParcelFocus,
    focusMessage: focusResult.message,
    focusResult,
    focusStatus: focusResult.focusStatus,
    selectedParcelFocus,
    setParcelFocus,
    setParcelFocusFromRecord,
  };
}

export type ParcelMapFocusState = ReturnType<typeof useParcelMapFocus>;
