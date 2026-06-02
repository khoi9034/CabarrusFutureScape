import type { LayerCategory, OperationalLayerKind } from "@/types";

export type ArcGISServiceType =
  | "FeatureServer"
  | "ImageServer"
  | "MapServer"
  | "SceneServer";

export type ArcGISGeometryType =
  | "multipatch"
  | "none"
  | "point"
  | "polygon"
  | "polyline"
  | "unknown";

export type ServiceEnvironment =
  | "local"
  | "production"
  | "production-disabled"
  | "staging";

export type ServiceConnectionStatus =
  | "disconnected"
  | "planned"
  | "production-disabled"
  | "ready-for-testing"
  | "schema-review"
  | "staging";

export type GISIntegrationStage =
  | "contract-draft"
  | "discovery"
  | "production-disabled"
  | "schema-review"
  | "staging-validation"
  | "testing-ready";

export type LayerFieldRequirement = "optional" | "recommended" | "required";

export type LayerFieldDataType =
  | "date"
  | "double"
  | "global-id"
  | "integer"
  | "object-id"
  | "small-integer"
  | "string";

export interface LayerFieldMapping {
  alias: string;
  dataType: LayerFieldDataType;
  description?: string;
  display?: boolean;
  domainName?: string;
  requirement: LayerFieldRequirement;
  searchable?: boolean;
  sourceField: string;
  targetField: string;
}

export interface LayerOwnershipMetadata {
  contactPlaceholder?: string;
  dataSensitivity: "internal" | "public" | "restricted" | "unknown";
  department: string;
  stewardRole: string;
  technicalOwner?: string;
  updateAuthority: string;
}

export interface ArcGISLayerContract {
  category: LayerCategory;
  description: string;
  displayLabelField?: string;
  expectedGeometryType: ArcGISGeometryType;
  fieldMappings: LayerFieldMapping[];
  globalIdField?: string;
  id: string;
  integrationStage: GISIntegrationStage;
  layerKind: OperationalLayerKind;
  mockReplacementLayerId?: string;
  objectIdField?: string;
  optionalFields: string[];
  popupFieldOrder: string[];
  popupTitleTemplate?: string;
  rendererExpectations?: string;
  requiredFields: string[];
  searchFields?: string[];
  serviceType: ArcGISServiceType;
  title: string;
}

export interface ArcGISServiceDefinition {
  category: LayerCategory;
  connectionStatus: ServiceConnectionStatus;
  contract: ArcGISLayerContract;
  description: string;
  disabledReason: string;
  expectedGeometryType: ArcGISGeometryType;
  governanceNotes: string[];
  id: string;
  layerKind: OperationalLayerKind;
  onboardingStage: GISIntegrationStage;
  ownership: LayerOwnershipMetadata;
  placeholderUrl: string;
  refreshCadence: string;
  securityNotes: string[];
  serviceEnvironment: ServiceEnvironment;
  serviceType: ArcGISServiceType;
  title: string;
}

export interface ParcelQueryContract {
  alternateParcelIdFields: string[];
  expectedSpatialReferenceWkid: number;
  geometryRequired: boolean;
  notes: string[];
  primaryParcelIdField: string;
  returnFields: string[];
  selectionToleranceMeters: number;
  serviceId: string;
}

export interface ContractValidationIssue {
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface LayerContractValidationResult {
  contractId: string;
  issues: ContractValidationIssue[];
  missingRequiredMappings: string[];
  readinessScore: number;
  valid: boolean;
}

export interface ServiceReadinessSummary {
  connectionStatus: ServiceConnectionStatus;
  contractResult: LayerContractValidationResult;
  environment: ServiceEnvironment;
  integrationStage: GISIntegrationStage;
  riskLevel: "high" | "low" | "medium";
  serviceId: string;
  title: string;
}

export interface MockLiveContractComparison {
  contractId: string;
  contractOnlyFields: string[];
  matchingFields: string[];
  mockLayerId: string;
  missingMockFields: string[];
}

export interface LayerMigrationPlan {
  blockedBy: string[];
  mockLayerId?: string;
  serviceId: string;
  steps: string[];
  targetEnvironment: ServiceEnvironment;
}
