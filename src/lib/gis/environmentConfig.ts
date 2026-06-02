import type { ServiceEnvironment } from "@/types/gisContracts";

export interface GISServiceEnvironmentConfig {
  allowsLiveConnections: boolean;
  description: string;
  id: ServiceEnvironment;
  label: string;
  notes: string[];
  tokenStrategy: string;
  usesPlaceholderUrls: boolean;
}

export const gisServiceEnvironmentConfigs: Record<
  ServiceEnvironment,
  GISServiceEnvironmentConfig
> = {
  local: {
    allowsLiveConnections: false,
    description: "Local development mode with mock data and placeholder service contracts.",
    id: "local",
    label: "Local Mock",
    notes: [
      "Use for interface development and contract validation only.",
      "No county service URLs or production credentials should be present.",
    ],
    tokenStrategy: "No token handling in Phase 1 local mode.",
    usesPlaceholderUrls: true,
  },
  "production-disabled": {
    allowsLiveConnections: false,
    description:
      "Default Phase 1 safety mode. Production service concepts are documented but not connected.",
    id: "production-disabled",
    label: "Production Disabled",
    notes: [
      "Candidate services use example.invalid placeholder URLs.",
      "Layer factories should continue to render mock GraphicsLayers only.",
      "Real service activation requires security, ownership, and field mapping approval.",
    ],
    tokenStrategy: "Future production token flow must be reviewed before implementation.",
    usesPlaceholderUrls: true,
  },
  production: {
    allowsLiveConnections: false,
    description:
      "Reserved future production mode. Intentionally disabled until Phase 2+ authorization work.",
    id: "production",
    label: "Production Reserved",
    notes: [
      "Do not enable directly from the frontend shell.",
      "Future production mode should use approved authentication and environment isolation.",
    ],
    tokenStrategy: "Reserved for approved token broker or ArcGIS identity workflow.",
    usesPlaceholderUrls: false,
  },
  staging: {
    allowsLiveConnections: false,
    description:
      "Reserved future staging mode for reviewed ArcGIS services and non-production credentials.",
    id: "staging",
    label: "Staging Reserved",
    notes: [
      "Staging remains disabled in Phase 1.",
      "Use only after candidate contracts pass schema review.",
    ],
    tokenStrategy: "Reserved for reviewed staging token strategy.",
    usesPlaceholderUrls: false,
  },
};

export const defaultGISServiceEnvironment: ServiceEnvironment =
  "production-disabled";

export function getGISServiceEnvironmentConfig(
  environment: ServiceEnvironment = defaultGISServiceEnvironment,
) {
  return gisServiceEnvironmentConfigs[environment];
}

export function liveServiceConnectionsEnabled(environment = defaultGISServiceEnvironment) {
  return getGISServiceEnvironmentConfig(environment).allowsLiveConnections;
}
