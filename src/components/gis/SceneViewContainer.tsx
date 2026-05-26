"use client";

import type SceneView from "@arcgis/core/views/SceneView";
import { useEffect, useRef } from "react";
import { MapViewportPlaceholder } from "@/components/gis/MapViewportPlaceholder";
import { useDashboardState } from "@/hooks/useDashboardState";
import { loadArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import {
  updateSelectedParcelSymbols,
} from "@/lib/gis/mockSceneLayers";
import {
  applyOperationalLayerVisibility,
  createOperationalLayers,
  getMockGraphicsLayerSubset,
  getRenderableOperationalLayers,
  type OperationalLayerInstanceMap,
} from "@/lib/gis/layerFactory";
import { operationalLayerRegistry } from "@/lib/gis/layerRegistry";
import { createMapInteractionController } from "@/lib/gis/mapInteractionController";
import { createCabarrusSceneView } from "@/lib/gis/sceneViewFactory";

type ArcGISHandle = {
  remove: () => void;
};

export function SceneViewContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<SceneView | null>(null);
  const layerRefs = useRef<OperationalLayerInstanceMap>({});
  const activeLayerIdsRef = useRef<string[]>([]);
  const {
    activeLayerIds,
    clearMapError,
    clearSelectedParcel,
    mapStatus,
    mapError,
    selectedParcel,
    selectedParcelId,
    selectParcel,
    setMapError,
    setMapStatus,
  } = useDashboardState();
  const selectedParcelIdRef = useRef(selectedParcelId);

  useEffect(() => {
    activeLayerIdsRef.current = activeLayerIds;
  }, [activeLayerIds]);

  useEffect(() => {
    selectedParcelIdRef.current = selectedParcelId;
  }, [selectedParcelId]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    let clickHandle: ArcGISHandle | null = null;
    let hoverHandle: ArcGISHandle | null = null;
    let localView: SceneView | null = null;

    async function initializeScene(container: HTMLDivElement) {
      clearMapError();
      setMapStatus("loading");

      try {
        const runtime = await loadArcGISRuntime();

        if (cancelled) {
          return;
        }

        const { map, view } = createCabarrusSceneView(runtime, container);
        localView = view;
        viewRef.current = view;

        await view.when();

        if (cancelled) {
          view.destroy();
          return;
        }

        const { layers } = createOperationalLayers(
          runtime,
          operationalLayerRegistry,
        );
        map.addMany(getRenderableOperationalLayers(layers));
        layerRefs.current = layers;
        applyOperationalLayerVisibility(layers, activeLayerIdsRef.current);
        updateSelectedParcelSymbols(
          getMockGraphicsLayerSubset(layers, operationalLayerRegistry),
          selectedParcelIdRef.current,
        );

        const interactionController = createMapInteractionController({
          emptyClickBehavior: "preserve-selection",
          getActiveLayerIds: () => activeLayerIdsRef.current,
          onError: (error) => {
            console.error("ArcGIS map interaction failed", error);
          },
          onSelection: (event) => {
            if (event.action === "select" && event.parcelId) {
              selectParcel(event.parcelId, { source: event.source });
              return;
            }

            if (event.action === "clear") {
              clearSelectedParcel();
            }
          },
          view,
        });

        clickHandle = view.on("click", (event) => {
          void interactionController.handleClick(event);
        });
        hoverHandle = view.on("pointer-move", (event) => {
          interactionController.handleHover(event);
        });

        setMapStatus("online");
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("ArcGIS SceneView failed to initialize", error);
        setMapError(getSceneErrorMessage(error));
        setMapStatus("degraded");
      }
    }

    initializeScene(containerRef.current);

    return () => {
      cancelled = true;
      clickHandle?.remove();
      hoverHandle?.remove();
      layerRefs.current = {};
      viewRef.current = null;

      if (localView && !localView.destroyed) {
        localView.destroy();
      }
    };
  }, [
    clearMapError,
    clearSelectedParcel,
    selectParcel,
    setMapError,
    setMapStatus,
  ]);

  useEffect(() => {
    applyOperationalLayerVisibility(layerRefs.current, activeLayerIds);
  }, [activeLayerIds]);

  useEffect(() => {
    updateSelectedParcelSymbols(
      getMockGraphicsLayerSubset(layerRefs.current, operationalLayerRegistry),
      selectedParcelId,
    );
  }, [selectedParcelId]);

  return (
    <MapViewportPlaceholder
      mapStatus={mapStatus}
      sceneError={mapError}
      selectedParcel={selectedParcel}
    >
      <div
        aria-label="Cabarrus County ArcGIS SceneView"
        className="absolute inset-0"
        ref={containerRef}
      />
    </MapViewportPlaceholder>
  );
}

function getSceneErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "ArcGIS modules could not initialize in the browser.";
}
