import type { KPIMetric, ScenarioPreset } from "@/lib/types";

export const scenarioPresets: ScenarioPreset[] = [
  {
    id: "baseline",
    name: "Baseline Growth",
    label: "Baseline",
    description: "Current policy and permit momentum",
    pressureMultiplier: 1,
    infrastructureWeight: 0.72,
  },
  {
    id: "accelerated-growth",
    name: "Accelerated Growth",
    label: "Growth",
    description: "Higher absorption around active corridors",
    pressureMultiplier: 1.24,
    infrastructureWeight: 0.68,
  },
  {
    id: "infill-priority",
    name: "Infill Priority",
    label: "Infill",
    description: "Redevelopment and compact service areas",
    pressureMultiplier: 0.9,
    infrastructureWeight: 0.88,
  },
  {
    id: "infrastructure-first",
    name: "Infrastructure First",
    label: "Capacity",
    description: "Growth constrained by readiness scoring",
    pressureMultiplier: 0.82,
    infrastructureWeight: 1,
  },
];

export const kpiMetrics: KPIMetric[] = [
  {
    id: "growth-index",
    label: "Growth Index",
    value: "78.4",
    delta: "+4.8%",
    status: "positive",
    accent: "#d8b86a",
    icon: "growth",
    trend: [42, 48, 52, 57, 64, 71, 78],
  },
  {
    id: "parcel-watch",
    label: "Parcels Watched",
    value: "1,284",
    delta: "+96",
    status: "neutral",
    accent: "#68d8ff",
    icon: "parcels",
    trend: [32, 37, 36, 44, 49, 54, 61],
  },
  {
    id: "readiness",
    label: "Infrastructure Readiness",
    value: "73%",
    delta: "+2.1%",
    status: "positive",
    accent: "#55d38f",
    icon: "infrastructure",
    trend: [55, 56, 58, 61, 66, 70, 73],
  },
  {
    id: "tax-lift",
    label: "Modeled Tax Lift",
    value: "$42.6M",
    delta: "+$3.4M",
    status: "positive",
    accent: "#f0cd79",
    icon: "revenue",
    trend: [21, 24, 29, 31, 33, 38, 43],
  },
  {
    id: "risk-exposure",
    label: "Constraint Exposure",
    value: "18%",
    delta: "-1.3%",
    status: "watch",
    accent: "#ff8d7a",
    icon: "risk",
    trend: [28, 26, 25, 22, 20, 19, 18],
  },
];

export const scoreSignals = [
  { label: "Opportunity", value: 86, accent: "#d8b86a" },
  { label: "Pressure", value: 73, accent: "#ffb454" },
  { label: "Readiness", value: 77, accent: "#55d38f" },
  { label: "Risk Balance", value: 64, accent: "#68d8ff" },
];

export const timeHorizonTicks = ["2026", "2028", "2030", "2032", "2035"];
