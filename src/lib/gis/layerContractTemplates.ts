import type {
  ArcGISLayerContract,
  LayerFieldMapping,
  ParcelQueryContract,
} from "@/types/gisContracts";

const parcelFieldMappings: LayerFieldMapping[] = [
  {
    alias: "Parcel ID",
    dataType: "string",
    description: "Stable parcel identifier used for selection, URL state, and report snapshots.",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "PARCEL_ID",
    targetField: "parcelId",
  },
  {
    alias: "Site Address",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "SITUS_ADDR",
    targetField: "address",
  },
  {
    alias: "Zoning",
    dataType: "string",
    display: true,
    requirement: "recommended",
    searchable: true,
    sourceField: "ZONING",
    targetField: "zoning",
  },
  {
    alias: "Assessed Value",
    dataType: "double",
    display: true,
    requirement: "recommended",
    sourceField: "ASSESSED_VALUE",
    targetField: "assessedValue",
  },
  {
    alias: "Acreage",
    dataType: "double",
    display: true,
    requirement: "recommended",
    sourceField: "ACRES",
    targetField: "acreage",
  },
];

const zoningFieldMappings: LayerFieldMapping[] = [
  {
    alias: "Zoning Code",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "ZONE_CODE",
    targetField: "zoningCode",
  },
  {
    alias: "Zoning Description",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "ZONE_DESC",
    targetField: "zoningDescription",
  },
  {
    alias: "Overlay District",
    dataType: "string",
    display: true,
    requirement: "optional",
    sourceField: "OVERLAY",
    targetField: "overlayDistrict",
  },
];

const infrastructureFieldMappings: LayerFieldMapping[] = [
  {
    alias: "Asset ID",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "ASSET_ID",
    targetField: "assetId",
  },
  {
    alias: "System Type",
    dataType: "string",
    display: true,
    requirement: "required",
    sourceField: "SYSTEM_TYPE",
    targetField: "systemType",
  },
  {
    alias: "Capacity Status",
    dataType: "string",
    display: true,
    domainName: "capacity_status",
    requirement: "required",
    sourceField: "CAPACITY_STATUS",
    targetField: "capacityStatus",
  },
  {
    alias: "Review Priority",
    dataType: "small-integer",
    display: true,
    requirement: "recommended",
    sourceField: "REVIEW_PRIORITY",
    targetField: "reviewPriority",
  },
];

const permitFieldMappings: LayerFieldMapping[] = [
  {
    alias: "Permit ID",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "PERMIT_ID",
    targetField: "permitId",
  },
  {
    alias: "Permit Type",
    dataType: "string",
    display: true,
    requirement: "required",
    sourceField: "PERMIT_TYPE",
    targetField: "permitType",
  },
  {
    alias: "Issued Date",
    dataType: "date",
    display: true,
    requirement: "recommended",
    sourceField: "ISSUED_DATE",
    targetField: "issuedDate",
  },
  {
    alias: "Related Parcel ID",
    dataType: "string",
    display: true,
    requirement: "recommended",
    searchable: true,
    sourceField: "PARCEL_ID",
    targetField: "parcelId",
  },
];

const eventFieldMappings: LayerFieldMapping[] = [
  {
    alias: "Event ID",
    dataType: "string",
    display: true,
    requirement: "required",
    searchable: true,
    sourceField: "EVENT_ID",
    targetField: "eventId",
  },
  {
    alias: "Event Type",
    dataType: "string",
    display: true,
    requirement: "required",
    sourceField: "EVENT_TYPE",
    targetField: "eventType",
  },
  {
    alias: "Severity",
    dataType: "string",
    display: true,
    domainName: "operational_event_severity",
    requirement: "required",
    sourceField: "SEVERITY",
    targetField: "severity",
  },
  {
    alias: "Observed Time",
    dataType: "date",
    display: true,
    requirement: "recommended",
    sourceField: "OBSERVED_AT",
    targetField: "timestamp",
  },
];

export const parcelLayerContractTemplate: ArcGISLayerContract = {
  category: "Planning",
  description:
    "Authoritative parcel polygons that can replace the Phase 1 mock parcel GraphicsLayer after schema review.",
  displayLabelField: "parcelId",
  expectedGeometryType: "polygon",
  fieldMappings: parcelFieldMappings,
  globalIdField: "GLOBALID",
  id: "parcel-layer-contract",
  integrationStage: "schema-review",
  layerKind: "FeatureLayer",
  mockReplacementLayerId: "parcel-intelligence",
  objectIdField: "OBJECTID",
  optionalFields: ["ownerType", "landUse", "taxDistrict"],
  popupFieldOrder: ["parcelId", "address", "zoning", "acreage", "assessedValue"],
  popupTitleTemplate: "{parcelId}",
  rendererExpectations: "Simple parcel outline with selected-state override supplied by CFS.",
  requiredFields: ["parcelId", "address"],
  searchFields: ["parcelId", "address"],
  serviceType: "FeatureServer",
  title: "Parcel Feature Layer Contract",
};

export const zoningLayerContractTemplate: ArcGISLayerContract = {
  category: "Planning",
  description:
    "Current zoning or policy geography used for planning review and parcel context.",
  displayLabelField: "zoningCode",
  expectedGeometryType: "polygon",
  fieldMappings: zoningFieldMappings,
  id: "zoning-layer-contract",
  integrationStage: "contract-draft",
  layerKind: "FeatureLayer",
  mockReplacementLayerId: "future-zoning-map-service",
  objectIdField: "OBJECTID",
  optionalFields: ["overlayDistrict", "effectiveDate"],
  popupFieldOrder: ["zoningCode", "zoningDescription", "overlayDistrict"],
  popupTitleTemplate: "Zoning {zoningCode}",
  rendererExpectations: "Unique-value zoning renderer controlled by policy category.",
  requiredFields: ["zoningCode", "zoningDescription"],
  searchFields: ["zoningCode", "zoningDescription"],
  serviceType: "FeatureServer",
  title: "Zoning Layer Contract",
};

export const infrastructureLayerContractTemplate: ArcGISLayerContract = {
  category: "Infrastructure",
  description:
    "Utility, transportation, and service-capacity features used for readiness review.",
  displayLabelField: "assetId",
  expectedGeometryType: "polyline",
  fieldMappings: infrastructureFieldMappings,
  id: "infrastructure-layer-contract",
  integrationStage: "schema-review",
  layerKind: "FeatureLayer",
  mockReplacementLayerId: "infrastructure-readiness",
  objectIdField: "OBJECTID",
  optionalFields: ["owner", "lastInspection", "projectedUpgradeYear"],
  popupFieldOrder: ["assetId", "systemType", "capacityStatus", "reviewPriority"],
  popupTitleTemplate: "{systemType}: {assetId}",
  rendererExpectations: "Capacity-aware line or asset renderer with risk emphasis.",
  requiredFields: ["assetId", "systemType", "capacityStatus"],
  searchFields: ["assetId", "systemType"],
  serviceType: "FeatureServer",
  title: "Infrastructure Layer Contract",
};

export const permitLayerContractTemplate: ArcGISLayerContract = {
  category: "Planning",
  description:
    "Permit activity points or related parcel joins used for development pressure context.",
  displayLabelField: "permitId",
  expectedGeometryType: "point",
  fieldMappings: permitFieldMappings,
  id: "permit-layer-contract",
  integrationStage: "contract-draft",
  layerKind: "FeatureLayer",
  mockReplacementLayerId: "permit-activity",
  objectIdField: "OBJECTID",
  optionalFields: ["status", "applicant", "estimatedValue"],
  popupFieldOrder: ["permitId", "permitType", "issuedDate", "parcelId"],
  popupTitleTemplate: "Permit {permitId}",
  rendererExpectations: "Recent permit activity marker renderer with type and recency emphasis.",
  requiredFields: ["permitId", "permitType"],
  searchFields: ["permitId", "parcelId"],
  serviceType: "FeatureServer",
  title: "Permit Activity Layer Contract",
};

export const eventLayerContractTemplate: ArcGISLayerContract = {
  category: "Intelligence",
  description:
    "Operational event feed geometry or table contract for alerts, notices, and system messages.",
  displayLabelField: "eventId",
  expectedGeometryType: "point",
  fieldMappings: eventFieldMappings,
  id: "event-layer-contract",
  integrationStage: "contract-draft",
  layerKind: "FeatureLayer",
  mockReplacementLayerId: "development-pressure",
  objectIdField: "OBJECTID",
  optionalFields: ["parcelId", "layerId", "scenarioId", "actionTarget"],
  popupFieldOrder: ["eventId", "eventType", "severity", "timestamp"],
  popupTitleTemplate: "{eventType}",
  rendererExpectations: "Severity-coded marker renderer with unread/read state controlled by CFS.",
  requiredFields: ["eventId", "eventType", "severity"],
  searchFields: ["eventId", "eventType", "parcelId"],
  serviceType: "FeatureServer",
  title: "Operational Event Layer Contract",
};

export const parcelQueryContract: ParcelQueryContract = {
  alternateParcelIdFields: ["PIN", "REID", "ACCOUNT_ID"],
  expectedSpatialReferenceWkid: 4326,
  geometryRequired: true,
  notes: [
    "Parcel lookup remains mock-only in Phase 1.",
    "Future live lookup should validate IDs before updating dashboard URL state.",
    "Future token handling belongs outside client-only dashboard components.",
  ],
  primaryParcelIdField: "PARCEL_ID",
  returnFields: [
    "PARCEL_ID",
    "SITUS_ADDR",
    "ZONING",
    "ACRES",
    "ASSESSED_VALUE",
  ],
  selectionToleranceMeters: 8,
  serviceId: "parcel-feature-service",
};

export const layerContractTemplates = [
  parcelLayerContractTemplate,
  zoningLayerContractTemplate,
  infrastructureLayerContractTemplate,
  permitLayerContractTemplate,
  eventLayerContractTemplate,
];

export function getLayerContractTemplateById(contractId: string) {
  return layerContractTemplates.find((contract) => contract.id === contractId);
}
