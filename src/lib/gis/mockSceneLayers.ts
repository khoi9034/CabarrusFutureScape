import type Graphic from "@arcgis/core/Graphic";
import type { GraphicProperties } from "@arcgis/core/Graphic";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type { ArcGISRuntime } from "@/lib/gis/arcgisRuntime";
import { mockParcels } from "@/data/mock/parcelMockData";

type GraphicSymbolProperties = NonNullable<GraphicProperties["symbol"]>;

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
        color: [13, 22, 34, 0.1],
        outline: {
          color: [216, 184, 106, 0.9],
          width: 2,
        },
        type: "simple-fill",
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

  layers["transportation-context"] = new GraphicsLayer({
    id: "transportation-context",
    title: "Transportation Context",
  });

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
      const isDemoParcel = graphic.attributes?.graphicRole === "demo-parcel";

      if (isDemoParcel) {
        assignSymbol(
          graphic,
          getDemoParcelFootprintSymbol(parcelId === selectedParcelId),
        );
        return;
      }

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

function getDemoParcelFootprintSymbol(selected: boolean): GraphicSymbolProperties {
  return {
    color: selected ? [216, 184, 106, 0.3] : [104, 216, 255, 0.11],
    outline: {
      color: selected ? [255, 238, 178, 0.98] : [104, 216, 255, 0.56],
      width: selected ? 2.3 : 0.85,
    },
    type: "simple-fill",
  };
}

function assignSymbol(graphic: Graphic, symbol: GraphicSymbolProperties) {
  graphic.symbol = symbol as Graphic["symbol"];
}

function getParcelFootprintSymbol(
  parcel: (typeof mockParcels)[number],
  selected: boolean,
): GraphicSymbolProperties {
  return {
    color: selected ? [216, 184, 106, 0.34] : [104, 216, 255, 0.14],
    outline: {
      color: selected ? [255, 238, 178, 0.95] : [104, 216, 255, 0.48],
      width: selected ? 2 : 0.7,
    },
    type: "simple-fill",
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
    color,
    outline: {
      color: selected ? [255, 244, 205, 0.95] : [255, 255, 255, 0.22],
      width: selected ? 1.4 : 0.4,
    },
    type: "simple-fill",
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
    color: colors[parcel.floodRisk],
    outline: { color: [255, 255, 255, selected ? 0.75 : 0.28], width: 0.9 },
    type: "simple-fill",
  };
}

function getPointColumnSymbol(
  height: number,
  color: string,
  primitive: "cube" | "cylinder",
): GraphicSymbolProperties {
  return {
    color,
    outline: {
      color: [255, 255, 255, 0.78],
      width: 1,
    },
    size: Math.max(10, Math.min(34, height / 8)),
    style: primitive === "cube" ? "square" : "circle",
    type: "simple-marker",
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
