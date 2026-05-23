export type RiskLevel = "Low" | "Moderate" | "Elevated" | "Severe";

export type LayerCategory =
  | "Base"
  | "Planning"
  | "Infrastructure"
  | "Risk"
  | "Intelligence";

export type LayerKind = "graphics" | "feature" | "scenario" | "placeholder";

export type ScenarioId =
  | "baseline"
  | "accelerated-growth"
  | "infill-priority"
  | "infrastructure-first";

export type MapStatus = "idle" | "loading" | "online" | "degraded";

export interface LayerDefinition {
  id: string;
  title: string;
  category: LayerCategory;
  description: string;
  kind: LayerKind;
  defaultVisible: boolean;
  accent: string;
  opacity: number;
  futureSource?: string;
}

export interface ParcelGeometry {
  rings: number[][][];
  spatialReference: {
    wkid: number;
  };
  centroid: [number, number];
}

export interface ParcelIntelligence {
  parcelId: string;
  address: string;
  ownerType: "Private" | "Municipal" | "Institutional" | "Commercial";
  zoning: string;
  acreage: number;
  assessedValue: number;
  floodRisk: RiskLevel;
  opportunityScore: number;
  developmentPressure: number;
  infrastructureReadiness: number;
  taxOpportunity: number;
  nearbyPermits: number;
  redevelopmentPotential: number;
  geometry: ParcelGeometry;
}

export interface KPIMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  status: "positive" | "watch" | "critical" | "neutral";
  accent: string;
  icon: "growth" | "parcels" | "infrastructure" | "revenue" | "risk";
  trend: number[];
}

export interface ScenarioPreset {
  id: ScenarioId;
  name: string;
  label: string;
  description: string;
  pressureMultiplier: number;
  infrastructureWeight: number;
}
