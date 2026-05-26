"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getDefaultLayerIds,
  operationalLayerRegistry,
} from "@/lib/gis/layerRegistry";

const validLayerIds = new Set(operationalLayerRegistry.map((layer) => layer.id));

export function useLayerVisibility() {
  const [activeLayerIds, setActiveLayerIdsState] =
    useState<string[]>(getDefaultLayerIds);

  const setActiveLayerIds = useCallback((layerIds: string[]) => {
    const nextLayerIds = layerIds.filter((layerId) => validLayerIds.has(layerId));
    setActiveLayerIdsState(Array.from(new Set(nextLayerIds)));
  }, []);

  const isLayerActive = useCallback(
    (layerId: string) => activeLayerIds.includes(layerId),
    [activeLayerIds],
  );

  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    if (!validLayerIds.has(layerId)) {
      return;
    }

    setActiveLayerIdsState((current) => {
      const currentSet = new Set(current);

      if (visible) {
        currentSet.add(layerId);
      } else {
        currentSet.delete(layerId);
      }

      return Array.from(currentSet);
    });
  }, []);

  const toggleLayer = useCallback(
    (layerId: string) => {
      setLayerVisibility(layerId, !activeLayerIds.includes(layerId));
    },
    [activeLayerIds, setLayerVisibility],
  );

  const activeLayers = useMemo(
    () =>
      operationalLayerRegistry.filter((layer) =>
        activeLayerIds.includes(layer.id),
      ),
    [activeLayerIds],
  );

  return {
    activeLayerIds,
    activeLayers,
    isLayerActive,
    setActiveLayerIds,
    setLayerVisibility,
    toggleLayer,
  };
}
