"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CFS_PARCEL_MAP_FOCUS_RESULT_EVENT,
  createParcelMapFocus,
  dispatchParcelMapFocusRequest,
  resolveParcelMapFocus,
  type ParcelFocusRecordLike,
} from "@/lib/map/parcelMapFocus";
import { logParcelMapFocusDiagnostic } from "@/lib/map/parcelMapFocusDiagnostics";
import type {
  ParcelFocusSource,
  ParcelMapFocus,
  ParcelMapFocusResultEventDetail,
} from "@/types/map/parcelFocus";

export function useParcelMapFocus() {
  const [selectedParcelFocus, setSelectedParcelFocus] =
    useState<ParcelMapFocus | null>(null);

  const focusResult = useMemo(
    () => resolveParcelMapFocus(selectedParcelFocus),
    [selectedParcelFocus],
  );

  const setParcelFocus = useCallback((focus: ParcelMapFocus) => {
    const focusResult = resolveParcelMapFocus(focus);
    const normalizedFocus = {
      ...focus,
      focusStatus: focusResult.focusStatus,
    };

    logParcelMapFocusDiagnostic("set parcel focus", {
      canFocus: focusResult.canFocus,
      centroid: normalizedFocus.centroid,
      extent: normalizedFocus.extent,
      focusStatus: normalizedFocus.focusStatus,
      highlightGeometryType: normalizedFocus.highlightGeometry?.type ?? null,
      officialParcelId: normalizedFocus.officialParcelId,
      pin14: normalizedFocus.pin14,
    });

    setSelectedParcelFocus(normalizedFocus);

    if (focusResult.canFocus) {
      dispatchParcelMapFocusRequest(normalizedFocus);
    }
  }, []);

  const setParcelFocusFromRecord = useCallback(
    (record: ParcelFocusRecordLike, focusSource: ParcelFocusSource) => {
      logParcelMapFocusDiagnostic("set parcel focus from record", {
        focusSource,
        officialParcelId: record.officialParcelId,
        pin14: record.pin14,
      });

      setSelectedParcelFocus(createParcelMapFocus(record, focusSource));
    },
    [],
  );

  const clearParcelFocus = useCallback(() => {
    setSelectedParcelFocus(null);
  }, []);

  useEffect(() => {
    function handleFocusResult(event: Event) {
      const detail = (
        event as CustomEvent<ParcelMapFocusResultEventDetail>
      ).detail;

      if (!detail?.officialParcelId) {
        return;
      }

      setSelectedParcelFocus((currentFocus) => {
        if (
          !currentFocus ||
          currentFocus.officialParcelId !== detail.officialParcelId
        ) {
          return currentFocus;
        }

        return {
          ...currentFocus,
          focusStatus: detail.focusStatus,
        };
      });

      logParcelMapFocusDiagnostic("received SceneView focus result", {
        focusStatus: detail.focusStatus,
        message: detail.message,
        officialParcelId: detail.officialParcelId,
      });
    }

    window.addEventListener(
      CFS_PARCEL_MAP_FOCUS_RESULT_EVENT,
      handleFocusResult,
    );

    return () => {
      window.removeEventListener(
        CFS_PARCEL_MAP_FOCUS_RESULT_EVENT,
        handleFocusResult,
      );
    };
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
