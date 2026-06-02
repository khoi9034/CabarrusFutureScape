export type DatasetCategory =
  | "built-environment"
  | "demographics"
  | "infrastructure"
  | "land-use"
  | "parcel"
  | "permit"
  | "planning"
  | "public-facilities"
  | "risk"
  | "transportation";

export type DatasetSourceType =
  | "arcgis-feature-service"
  | "arcgis-map-service"
  | "arcgis-scene-service"
  | "external-open-data"
  | "manual-inventory"
  | "tabular-export"
  | "unknown";

export type DatasetGeometryType =
  | "multipatch"
  | "none"
  | "point"
  | "polygon"
  | "polyline"
  | "raster"
  | "table"
  | "unknown";

export type DatasetRefreshCadence =
  | "annual"
  | "as-needed"
  | "daily"
  | "event-driven"
  | "monthly"
  | "quarterly"
  | "real-time"
  | "unknown"
  | "weekly";

export type DatasetAccessLevel =
  | "confidential"
  | "internal"
  | "public"
  | "restricted"
  | "unknown";

export type DatasetQualityStatus =
  | "deprecated"
  | "needs-review"
  | "partial"
  | "trusted"
  | "unknown";

export type DatasetIntegrationStatus =
  | "blocked"
  | "candidate"
  | "contract-draft"
  | "mocked"
  | "not-started"
  | "production-disabled"
  | "ready-for-staging"
  | "schema-review";

export type DatasetUsageContext =
  | "command-search"
  | "event-stream"
  | "executive-reporting"
  | "infrastructure-review"
  | "layer-toggle"
  | "map-context"
  | "parcel-selection"
  | "planning-review"
  | "risk-review"
  | "scenario-modeling";

export interface DatasetOwnerMetadata {
  contactPlaceholder?: string;
  department: string;
  stewardRole: string;
  technicalOwner?: string;
  updateAuthority: string;
}

export interface DatasetFieldMapping {
  alias: string;
  cfsField: string;
  description?: string;
  isKey?: boolean;
  required: boolean;
  sourceField: string;
}

export interface DatasetRegistryEntry {
  accessLevel: DatasetAccessLevel;
  category: DatasetCategory;
  description: string;
  expectedGeometryType: DatasetGeometryType;
  expectedKeyFields: DatasetFieldMapping[];
  id: string;
  integrationPriority: "high" | "low" | "medium";
  integrationStatus: DatasetIntegrationStatus;
  layerContractId?: string;
  name: string;
  notes: string[];
  owner: DatasetOwnerMetadata;
  qualityStatus: DatasetQualityStatus;
  refreshCadence: DatasetRefreshCadence;
  relatedCfsLayerId?: string;
  relatedServiceRegistryId?: string;
  risks: string[];
  sourceType: DatasetSourceType;
  usageContexts: DatasetUsageContext[];
  unknowns: string[];
}

export interface DatasetReadinessSummary {
  blockedCount: number;
  highPriorityCount: number;
  readyForStagingCount: number;
  statusCounts: Record<DatasetIntegrationStatus, number>;
  totalCount: number;
  unknownOwnershipOrSchemaCount: number;
}
