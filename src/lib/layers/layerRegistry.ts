import type { LayerCategory, LayerDefinition } from "@/lib/types";

export const layerRegistry: LayerDefinition[] = [
  {
    id: "county-boundary",
    title: "County Boundary",
    category: "Base",
    description: "Cabarrus operating extent and digital twin frame",
    kind: "graphics",
    defaultVisible: true,
    accent: "#d8b86a",
    opacity: 0.82,
    futureSource: "Enterprise boundary feature service",
  },
  {
    id: "parcel-intelligence",
    title: "Parcel Intelligence",
    category: "Planning",
    description: "Selectable parcel footprint layer",
    kind: "graphics",
    defaultVisible: true,
    accent: "#68d8ff",
    opacity: 0.78,
    futureSource: "Parcel fabric and assessor feed",
  },
  {
    id: "opportunity-extrusions",
    title: "Opportunity Extrusions",
    category: "Intelligence",
    description: "3D opportunity scoring surface",
    kind: "graphics",
    defaultVisible: true,
    accent: "#d8b86a",
    opacity: 0.88,
    futureSource: "Scoring model output service",
  },
  {
    id: "development-pressure",
    title: "Development Pressure",
    category: "Intelligence",
    description: "Active growth pressure indicators",
    kind: "graphics",
    defaultVisible: true,
    accent: "#ffb454",
    opacity: 0.86,
    futureSource: "Permit, sales, and entitlement model",
  },
  {
    id: "infrastructure-readiness",
    title: "Infrastructure Readiness",
    category: "Infrastructure",
    description: "Capacity and service readiness signals",
    kind: "graphics",
    defaultVisible: true,
    accent: "#55d38f",
    opacity: 0.78,
    futureSource: "Water, sewer, road, school, and broadband feeds",
  },
  {
    id: "flood-risk",
    title: "Flood Risk",
    category: "Risk",
    description: "Environmental constraint overlay",
    kind: "graphics",
    defaultVisible: false,
    accent: "#ff6b6b",
    opacity: 0.62,
    futureSource: "FEMA and local hydrology layers",
  },
  {
    id: "permit-activity",
    title: "Permit Activity",
    category: "Planning",
    description: "Nearby permit heat and activity markers",
    kind: "graphics",
    defaultVisible: false,
    accent: "#b597ff",
    opacity: 0.84,
    futureSource: "Planning and inspections permit service",
  },
  {
    id: "scenario-envelope",
    title: "Scenario Envelope",
    category: "Intelligence",
    description: "Growth scenario influence area",
    kind: "scenario",
    defaultVisible: true,
    accent: "#8fe7ff",
    opacity: 0.44,
    futureSource: "Simulation service output",
  },
];

export const layerCategories: LayerCategory[] = [
  "Base",
  "Planning",
  "Infrastructure",
  "Risk",
  "Intelligence",
];

export function getDefaultLayerIds() {
  return layerRegistry
    .filter((layer) => layer.defaultVisible)
    .map((layer) => layer.id);
}

export function getLayerById(layerId: string) {
  return layerRegistry.find((layer) => layer.id === layerId);
}
