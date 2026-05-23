"use client";

import { Maximize2, MousePointer2, Satellite, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { mockParcels } from "@/data/mockParcels";
import { useDashboardState } from "@/state/dashboard-store";

type ArcGISModule<T> = {
  default: T;
};

type ArcGISConstructor<T> = new (properties: Record<string, unknown>) => T;

type ArcGISGraphic = {
  attributes?: Record<string, unknown>;
  symbol?: unknown;
};

type ArcGISLayer = {
  add: (graphic: unknown) => void;
  addMany: (graphics: unknown[]) => void;
  id: string;
  visible: boolean;
  graphics?: {
    forEach: (callback: (graphic: ArcGISGraphic) => void) => void;
  };
};

type ArcGISMapInstance = {
  addMany: (layers: ArcGISLayer[]) => void;
};

type ArcGISSceneView = {
  destroy: () => void;
  hitTest: (event: unknown) => Promise<{
    results: Array<{ graphic?: ArcGISGraphic }>;
  }>;
  on: (
    eventName: "click",
    callback: (event: unknown) => void | Promise<void>,
  ) => { remove: () => void };
  when: () => Promise<void>;
};

export function SceneViewMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ArcGISSceneView | null>(null);
  const layerRefs = useRef<Record<string, ArcGISLayer>>({});
  const {
    activeLayerIds,
    mapStatus,
    selectedParcel,
    selectedParcelId,
    selectParcel,
    setMapStatus,
  } = useDashboardState();
  const activeLayerIdsRef = useRef(activeLayerIds);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    let clickHandle: { remove: () => void } | null = null;

    async function initializeScene() {
      setMapStatus("loading");

      try {
        const [
          { default: ArcGISMap },
          { default: SceneView },
          { default: GraphicsLayer },
          { default: Graphic },
        ] = (await Promise.all([
          import("@arcgis/core/Map.js"),
          import("@arcgis/core/views/SceneView.js"),
          import("@arcgis/core/layers/GraphicsLayer.js"),
          import("@arcgis/core/Graphic.js"),
        ])) as unknown as [
          ArcGISModule<ArcGISConstructor<ArcGISMapInstance>>,
          ArcGISModule<ArcGISConstructor<ArcGISSceneView>>,
          ArcGISModule<ArcGISConstructor<ArcGISLayer>>,
          ArcGISModule<ArcGISConstructor<unknown>>,
        ];

        if (cancelled || !containerRef.current) {
          return;
        }

        const map = new ArcGISMap({
          basemap: "arcgis-streets-night",
          ground: "world-elevation",
        });

        const view = new SceneView({
          camera: {
            heading: 38,
            position: {
              latitude: 35.3882,
              longitude: -80.5795,
              z: 6500,
            },
            tilt: 62,
          },
          container: containerRef.current,
          environment: {
            atmosphere: {
              quality: "high",
            },
            background: {
              color: [4, 8, 14, 1],
              type: "color",
            },
            lighting: {
              ambientOcclusionEnabled: true,
              date: new Date("2026-05-22T19:15:00-04:00"),
              directShadowsEnabled: true,
            },
            starsEnabled: true,
          },
          map,
          qualityProfile: "high",
          ui: {
            components: [],
          },
        });

        await view.when();

        if (cancelled) {
          view.destroy();
          return;
        }

        const layers = createMockSceneLayers(GraphicsLayer, Graphic);
        map.addMany(Object.values(layers));
        layerRefs.current = layers;
        applyLayerVisibility(layers, activeLayerIdsRef.current);

        clickHandle = view.on("click", async (event: unknown) => {
          const response = await view.hitTest(event);
          const hit = response.results.find(
            (result: { graphic?: ArcGISGraphic }) =>
              typeof result.graphic?.attributes?.parcelId === "string",
          );

          const parcelId = hit?.graphic?.attributes?.parcelId;

          if (typeof parcelId === "string") {
            selectParcel(parcelId);
          }
        });

        viewRef.current = view;
        setMapStatus("online");
      } catch (error) {
        console.error("ArcGIS SceneView failed to initialize", error);
        setMapStatus("degraded");
      }
    }

    initializeScene();

    return () => {
      cancelled = true;
      clickHandle?.remove();
      viewRef.current?.destroy();
      viewRef.current = null;
      layerRefs.current = {};
    };
  }, [selectParcel, setMapStatus]);

  useEffect(() => {
    activeLayerIdsRef.current = activeLayerIds;
    applyLayerVisibility(layerRefs.current, activeLayerIds);
  }, [activeLayerIds]);

  useEffect(() => {
    updateSelectedParcelSymbols(layerRefs.current, selectedParcelId);
  }, [selectedParcelId]);

  return (
    <section className="relative h-full min-h-[58vh] overflow-hidden rounded-lg border border-white/10 bg-[#050911] shadow-[0_28px_120px_rgba(0,0,0,0.46)] lg:min-h-0">
      <div className="absolute inset-0" ref={containerRef} />
      <div className="scene-mask pointer-events-none absolute inset-0" />
      <div className="map-scanline pointer-events-none absolute inset-0 opacity-40" />

      <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg border border-white/10 bg-[#060b12]/72 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-[#d8b86a]" />
          <p className="text-xs font-medium uppercase text-slate-400">
            Cabarrus 3D Scene
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-md border border-[#d8b86a]/25 bg-[#d8b86a]/10 px-2 py-1 text-[#f0cd79]">
            {mapStatus === "online" ? "Live Scene" : "Scene Standby"}
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            Concord origin
          </span>
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            Mock parcels
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="rounded-lg border border-white/10 bg-[#060b12]/74 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
            <MousePointer2 className="h-3.5 w-3.5 text-[#68d8ff]" />
            Active Selection
          </div>
          <p className="mt-1 text-lg font-semibold text-white">
            {selectedParcel.parcelId}
          </p>
          <p className="text-xs text-slate-400">{selectedParcel.address}</p>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-[#060b12]/74 text-center backdrop-blur-xl">
          <SceneStat label="Opportunity" value={selectedParcel.opportunityScore} />
          <SceneStat label="Pressure" value={selectedParcel.developmentPressure} />
          <SceneStat
            label="Readiness"
            value={selectedParcel.infrastructureReadiness}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 hidden items-center gap-2 rounded-lg border border-white/10 bg-[#060b12]/72 p-2 backdrop-blur-xl md:flex">
        <Sparkles className="h-4 w-4 text-[#8fe7ff]" />
        <div className="h-5 w-px bg-white/10" />
        <Maximize2 className="h-4 w-4 text-slate-300" />
      </div>
    </section>
  );
}

function SceneStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[92px] border-r border-white/10 px-3 py-2 last:border-r-0">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value}</p>
    </div>
  );
}

function applyLayerVisibility(
  layers: Record<string, ArcGISLayer>,
  activeLayerIds: string[],
) {
  Object.values(layers).forEach((layer) => {
    layer.visible = activeLayerIds.includes(layer.id);
  });
}

function updateSelectedParcelSymbols(
  layers: Record<string, ArcGISLayer>,
  selectedParcelId: string,
) {
  const parcelLayerIds = [
    "parcel-intelligence",
    "opportunity-extrusions",
    "flood-risk",
  ];

  parcelLayerIds.forEach((layerId) => {
    const layer = layers[layerId];

    layer?.graphics?.forEach((graphic) => {
      const parcelId = graphic.attributes?.parcelId;
      const parcel = mockParcels.find((item) => item.parcelId === parcelId);

      if (!parcel) {
        return;
      }

      const selected = parcel.parcelId === selectedParcelId;

      if (layerId === "opportunity-extrusions") {
        graphic.symbol = getOpportunitySymbol(parcel, selected);
      } else if (layerId === "flood-risk") {
        graphic.symbol = getFloodSymbol(parcel, selected);
      } else {
        graphic.symbol = getParcelFootprintSymbol(parcel, selected);
      }
    });
  });
}

function createMockSceneLayers(
  GraphicsLayer: ArcGISConstructor<ArcGISLayer>,
  Graphic: ArcGISConstructor<unknown>,
) {
  const layers: Record<string, ArcGISLayer> = {};

  layers["county-boundary"] = new GraphicsLayer({
    id: "county-boundary",
    title: "County Boundary",
  });
  layers["county-boundary"].add(
    new Graphic({
      geometry: {
        rings: [
          [
            [-80.861, 35.197],
            [-80.835, 35.548],
            [-80.513, 35.574],
            [-80.346, 35.414],
            [-80.386, 35.238],
            [-80.861, 35.197],
          ],
        ],
        spatialReference: { wkid: 4326 },
        type: "polygon",
      },
      symbol: {
        symbolLayers: [
          {
            material: { color: [13, 22, 34, 0.1] },
            outline: {
              color: [216, 184, 106, 0.9],
              size: 2,
            },
            type: "fill",
          },
        ],
        type: "polygon-3d",
      },
    }),
  );

  layers["parcel-intelligence"] = new GraphicsLayer({
    id: "parcel-intelligence",
    title: "Parcel Intelligence",
  });
  layers["parcel-intelligence"].addMany(
    mockParcels.map(
      (parcel) =>
        new Graphic({
          attributes: {
            parcelId: parcel.parcelId,
            zoning: parcel.zoning,
          },
          geometry: {
            rings: parcel.geometry.rings,
            spatialReference: parcel.geometry.spatialReference,
            type: "polygon",
          },
          symbol: getParcelFootprintSymbol(parcel, false),
        }),
    ),
  );

  layers["opportunity-extrusions"] = new GraphicsLayer({
    elevationInfo: { mode: "on-the-ground" },
    id: "opportunity-extrusions",
    title: "Opportunity Extrusions",
  });
  layers["opportunity-extrusions"].addMany(
    mockParcels.map(
      (parcel) =>
        new Graphic({
          attributes: {
            parcelId: parcel.parcelId,
          },
          geometry: {
            rings: parcel.geometry.rings,
            spatialReference: parcel.geometry.spatialReference,
            type: "polygon",
          },
          symbol: getOpportunitySymbol(parcel, false),
        }),
    ),
  );

  layers["development-pressure"] = new GraphicsLayer({
    elevationInfo: { mode: "relative-to-ground" },
    id: "development-pressure",
    title: "Development Pressure",
  });
  layers["development-pressure"].addMany(
    mockParcels.map(
      (parcel) =>
        new Graphic({
          geometry: {
            latitude: parcel.geometry.centroid[1],
            longitude: parcel.geometry.centroid[0],
            type: "point",
          },
          symbol: getPointColumnSymbol(
            parcel.developmentPressure * 6,
            "#ffb454",
            "cylinder",
          ),
        }),
    ),
  );

  layers["infrastructure-readiness"] = new GraphicsLayer({
    elevationInfo: { mode: "relative-to-ground" },
    id: "infrastructure-readiness",
    title: "Infrastructure Readiness",
  });
  layers["infrastructure-readiness"].addMany(
    mockParcels.map(
      (parcel) =>
        new Graphic({
          geometry: {
            latitude: parcel.geometry.centroid[1] + 0.003,
            longitude: parcel.geometry.centroid[0] + 0.003,
            type: "point",
          },
          symbol: getPointColumnSymbol(
            parcel.infrastructureReadiness * 4,
            "#55d38f",
            "cube",
          ),
        }),
    ),
  );

  layers["flood-risk"] = new GraphicsLayer({
    id: "flood-risk",
    title: "Flood Risk",
  });
  layers["flood-risk"].addMany(
    mockParcels.map(
      (parcel) =>
        new Graphic({
          attributes: {
            parcelId: parcel.parcelId,
          },
          geometry: {
            rings: parcel.geometry.rings,
            spatialReference: parcel.geometry.spatialReference,
            type: "polygon",
          },
          symbol: getFloodSymbol(parcel, false),
        }),
    ),
  );

  layers["permit-activity"] = new GraphicsLayer({
    elevationInfo: { mode: "relative-to-ground" },
    id: "permit-activity",
    title: "Permit Activity",
  });
  layers["permit-activity"].addMany(
    mockParcels.flatMap((parcel, index) =>
      Array.from({ length: Math.min(4, Math.ceil(parcel.nearbyPermits / 4)) }).map(
        (_, permitIndex) =>
          new Graphic({
            geometry: {
              latitude:
                parcel.geometry.centroid[1] +
                (permitIndex + 1) * 0.0018 -
                index * 0.0006,
              longitude:
                parcel.geometry.centroid[0] -
                (permitIndex + 1) * 0.0017 +
                index * 0.0005,
              type: "point",
            },
            symbol: {
              symbolLayers: [
                {
                  material: { color: [181, 151, 255, 0.92] },
                  outline: { color: [255, 255, 255, 0.45], size: 0.5 },
                  resource: { primitive: "sphere" },
                  size: 42,
                  type: "object",
                },
              ],
              type: "point-3d",
            },
          }),
      ),
    ),
  );

  layers["scenario-envelope"] = new GraphicsLayer({
    id: "scenario-envelope",
    title: "Scenario Envelope",
  });
  layers["scenario-envelope"].add(
    new Graphic({
      geometry: {
        rings: [
          [
            [-80.692, 35.312],
            [-80.633, 35.501],
            [-80.524, 35.524],
            [-80.419, 35.414],
            [-80.486, 35.256],
            [-80.692, 35.312],
          ],
        ],
        spatialReference: { wkid: 4326 },
        type: "polygon",
      },
      symbol: {
        symbolLayers: [
          {
            material: { color: [104, 216, 255, 0.12] },
            outline: { color: [104, 216, 255, 0.75], size: 1.2 },
            type: "fill",
          },
        ],
        type: "polygon-3d",
      },
    }),
  );

  return layers;
}

function getParcelFootprintSymbol(
  parcel: (typeof mockParcels)[number],
  selected: boolean,
) {
  return {
    symbolLayers: [
      {
        material: {
          color: selected
            ? [216, 184, 106, 0.34]
            : [104, 216, 255, 0.14],
        },
        outline: {
          color: selected
            ? [255, 238, 178, 0.95]
            : [104, 216, 255, 0.48],
          size: selected ? 2 : 0.7,
        },
        type: "fill",
      },
    ],
    type: "polygon-3d",
  };
}

function getOpportunitySymbol(
  parcel: (typeof mockParcels)[number],
  selected: boolean,
) {
  const color = selected
    ? [240, 205, 121, 0.86]
    : scoreToColor(parcel.opportunityScore);

  return {
    symbolLayers: [
      {
        edges: {
          color: selected ? [255, 244, 205, 0.95] : [255, 255, 255, 0.22],
          size: selected ? 1.4 : 0.4,
          type: "solid",
        },
        material: { color },
        size: selected
          ? parcel.opportunityScore * 2.9 + 80
          : parcel.opportunityScore * 2.4 + 40,
        type: "extrude",
      },
    ],
    type: "polygon-3d",
  };
}

function getFloodSymbol(
  parcel: (typeof mockParcels)[number],
  selected: boolean,
) {
  const colors = {
    Elevated: [255, 180, 84, selected ? 0.38 : 0.28],
    Low: [85, 211, 143, selected ? 0.26 : 0.18],
    Moderate: [104, 216, 255, selected ? 0.3 : 0.2],
    Severe: [255, 107, 107, selected ? 0.44 : 0.32],
  };

  return {
    symbolLayers: [
      {
        material: { color: colors[parcel.floodRisk] },
        outline: { color: [255, 255, 255, selected ? 0.75 : 0.28], size: 0.9 },
        type: "fill",
      },
    ],
    type: "polygon-3d",
  };
}

function getPointColumnSymbol(
  height: number,
  color: string,
  primitive: "cube" | "cylinder",
) {
  return {
    symbolLayers: [
      {
        depth: 44,
        height,
        material: { color },
        resource: { primitive },
        width: 44,
        type: "object",
      },
    ],
    type: "point-3d",
  };
}

function scoreToColor(score: number) {
  if (score >= 86) {
    return [216, 184, 106, 0.74];
  }

  if (score >= 78) {
    return [104, 216, 255, 0.62];
  }

  return [85, 211, 143, 0.52];
}
