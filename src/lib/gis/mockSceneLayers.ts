import type Graphic from "@arcgis/core/Graphic";
import type { GraphicProperties } from "@arcgis/core/Graphic";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type { Edges3DProperties } from "@arcgis/core/symbols/edges/Edges3D";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import { mockParcels } from "@/data/mock/parcelMockData";

type GraphicSymbolProperties = NonNullable<GraphicProperties["symbol"]>;
type SolidEdgesProperties = Edges3DProperties & { type: "solid" };

export type MockSceneLayerMap = Record<string, GraphicsLayer>;
export type MockSceneLayerLookup = Partial<Record<string, GraphicsLayer>>;

export function createMockSceneLayers(runtime: ArcGISRuntime): MockSceneLayerMap {
  const { Graphic, GraphicsLayer } = runtime;
  const layers: MockSceneLayerMap = {};

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
      Array.from({
        length: Math.min(4, Math.ceil(parcel.nearbyPermits / 4)),
      }).map(
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
                  depth: 42,
                  height: 42,
                  resource: { primitive: "sphere" },
                  width: 42,
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

export function applyLayerVisibility(
  layers: MockSceneLayerLookup,
  activeLayerIds: string[],
) {
  Object.values(layers).forEach((layer) => {
    if (layer) {
      layer.visible = activeLayerIds.includes(layer.id);
    }
  });
}

export function updateSelectedParcelSymbols(
  layers: MockSceneLayerLookup,
  selectedParcelId: string | null,
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
        assignSymbol(graphic, getOpportunitySymbol(parcel, selected));
      } else if (layerId === "flood-risk") {
        assignSymbol(graphic, getFloodSymbol(parcel, selected));
      } else {
        assignSymbol(graphic, getParcelFootprintSymbol(parcel, selected));
      }
    });
  });
}

function assignSymbol(graphic: Graphic, symbol: GraphicSymbolProperties) {
  graphic.symbol = symbol as Graphic["symbol"];
}

function getParcelFootprintSymbol(
  parcel: (typeof mockParcels)[number],
  selected: boolean,
): GraphicSymbolProperties {
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
): GraphicSymbolProperties {
  const color = selected
    ? [240, 205, 121, 0.86]
    : scoreToColor(parcel.opportunityScore);

  return {
    symbolLayers: [
      {
        edges: getSolidEdges(
          selected ? [255, 244, 205, 0.95] : [255, 255, 255, 0.22],
          selected ? 1.4 : 0.4,
        ),
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
): GraphicSymbolProperties {
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
): GraphicSymbolProperties {
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

function getSolidEdges(
  color: [number, number, number, number],
  size: number,
): SolidEdgesProperties {
  return {
    color,
    size,
    type: "solid",
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
