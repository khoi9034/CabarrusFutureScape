import {
  infrastructureLayerContractTemplate,
  parcelLayerContractTemplate,
  permitLayerContractTemplate,
  zoningLayerContractTemplate,
} from "@/lib/gis/layerContractTemplates";
import type {
  ArcGISLayerContract,
  ArcGISServiceDefinition,
  LayerOwnershipMetadata,
} from "@/types/gisContracts";

const planningOwnership: LayerOwnershipMetadata = {
  contactPlaceholder: "Planning GIS steward",
  dataSensitivity: "internal",
  department: "Planning and Development",
  stewardRole: "Planning data steward",
  technicalOwner: "Enterprise GIS administrator",
  updateAuthority: "Planning and zoning source systems",
};

const infrastructureOwnership: LayerOwnershipMetadata = {
  contactPlaceholder: "Infrastructure data steward",
  dataSensitivity: "internal",
  department: "Infrastructure and Asset Management",
  stewardRole: "Infrastructure reviewer",
  technicalOwner: "Enterprise GIS administrator",
  updateAuthority: "Utilities, transportation, and capital project systems",
};

const riskOwnership: LayerOwnershipMetadata = {
  contactPlaceholder: "Risk and resilience GIS steward",
  dataSensitivity: "public",
  department: "Emergency Management / Environmental Review",
  stewardRole: "Risk data steward",
  technicalOwner: "Enterprise GIS administrator",
  updateAuthority: "Approved federal, state, and local hazard datasets",
};

const transportationContract: ArcGISLayerContract = {
  ...infrastructureLayerContractTemplate,
  description:
    "Transportation corridors and capacity flags used for growth readiness planning.",
  expectedGeometryType: "polyline",
  id: "transportation-layer-contract",
  mockReplacementLayerId: "infrastructure-readiness",
  popupTitleTemplate: "Transportation {assetId}",
  title: "Transportation Layer Contract",
};

const utilitiesContract: ArcGISLayerContract = {
  ...infrastructureLayerContractTemplate,
  description:
    "Utilities infrastructure features used to evaluate service readiness and capital constraints.",
  id: "utilities-infrastructure-layer-contract",
  mockReplacementLayerId: "infrastructure-readiness",
  popupTitleTemplate: "Utility {assetId}",
  title: "Utilities Infrastructure Layer Contract",
};

const landUseContract: ArcGISLayerContract = {
  ...zoningLayerContractTemplate,
  description:
    "Future land-use policy geography used for long-range planning and scenario review.",
  id: "future-land-use-layer-contract",
  mockReplacementLayerId: "scenario-envelope",
  popupTitleTemplate: "Future Land Use {zoningCode}",
  title: "Future Land Use Layer Contract",
};

const floodplainContract: ArcGISLayerContract = {
  ...zoningLayerContractTemplate,
  category: "Risk",
  description:
    "Floodplain and environmental constraint service used for parcel risk review.",
  expectedGeometryType: "polygon",
  id: "floodplain-layer-contract",
  layerKind: "MapImageLayer",
  mockReplacementLayerId: "flood-risk",
  popupFieldOrder: ["zoningCode", "zoningDescription"],
  popupTitleTemplate: "Floodplain Constraint",
  rendererExpectations: "Server-rendered floodplain or risk overlay with transparent fill.",
  serviceType: "MapServer",
  title: "Floodplain Layer Contract",
};

const baseSecurityNotes = [
  "Production service URLs, credentials, and tokens are intentionally omitted in Phase 1.",
  "Future rollout requires data owner approval and a token/auth strategy review before enabling live services.",
];

const baseGovernanceNotes = [
  "Validate field mappings against the approved layer contract before swapping any mock layer.",
  "Confirm public/internal data classification before exposing service attributes in dashboard popups or reports.",
  "Migrate one layer at a time and preserve mock fallback behavior during testing.",
];

export const candidateArcGISServiceRegistry: ArcGISServiceDefinition[] = [
  {
    category: "Planning",
    connectionStatus: "schema-review",
    contract: parcelLayerContractTemplate,
    description:
      "Authoritative parcel fabric candidate for future identify/query and parcel intelligence workflows.",
    disabledReason:
      "Production parcel services are disconnected until schema, security, and ownership reviews are complete.",
    expectedGeometryType: "polygon",
    governanceNotes: baseGovernanceNotes,
    id: "parcel-feature-service",
    layerKind: "FeatureLayer",
    onboardingStage: "schema-review",
    ownership: planningOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/Parcels/FeatureServer/0",
    refreshCadence: "Nightly or assessor-cycle refresh expectation",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Parcel Feature Service",
  },
  {
    category: "Planning",
    connectionStatus: "planned",
    contract: zoningLayerContractTemplate,
    description:
      "Current zoning candidate service for planning context, command search, and parcel review.",
    disabledReason:
      "Zoning service URL remains a placeholder until approved service metadata is provided.",
    expectedGeometryType: "polygon",
    governanceNotes: baseGovernanceNotes,
    id: "zoning-feature-layer",
    layerKind: "FeatureLayer",
    onboardingStage: "contract-draft",
    ownership: planningOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/Zoning/FeatureServer/0",
    refreshCadence: "As zoning map amendments are published",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Zoning Feature Layer",
  },
  {
    category: "Planning",
    connectionStatus: "planned",
    contract: landUseContract,
    description:
      "Future land-use service candidate for long-range planning and scenario comparison.",
    disabledReason:
      "Future land-use service is planning metadata only until a reviewed source layer is selected.",
    expectedGeometryType: "polygon",
    governanceNotes: baseGovernanceNotes,
    id: "future-land-use-layer",
    layerKind: "FeatureLayer",
    onboardingStage: "contract-draft",
    ownership: planningOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/FutureLandUse/FeatureServer/0",
    refreshCadence: "Comprehensive plan update cadence",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Future Land Use Layer",
  },
  {
    category: "Risk",
    connectionStatus: "disconnected",
    contract: floodplainContract,
    description:
      "Floodplain and environmental constraint candidate service for risk review overlays.",
    disabledReason:
      "Floodplain service must be reviewed for source authority and update cadence before live display.",
    expectedGeometryType: "polygon",
    governanceNotes: baseGovernanceNotes,
    id: "floodplain-layer",
    layerKind: "MapImageLayer",
    onboardingStage: "discovery",
    ownership: riskOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/Floodplain/MapServer",
    refreshCadence: "As FEMA/local hazard layers are certified",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "MapServer",
    title: "Floodplain Layer",
  },
  {
    category: "Infrastructure",
    connectionStatus: "schema-review",
    contract: transportationContract,
    description:
      "Transportation corridor candidate service for readiness and capital planning overlays.",
    disabledReason:
      "Transportation service remains disconnected pending field mapping and data classification review.",
    expectedGeometryType: "polyline",
    governanceNotes: baseGovernanceNotes,
    id: "transportation-layer",
    layerKind: "FeatureLayer",
    onboardingStage: "schema-review",
    ownership: infrastructureOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/Transportation/FeatureServer/0",
    refreshCadence: "Monthly or capital-program update expectation",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Transportation Layer",
  },
  {
    category: "Infrastructure",
    connectionStatus: "production-disabled",
    contract: utilitiesContract,
    description:
      "Utilities infrastructure candidate service for service-capacity and constraint review.",
    disabledReason:
      "Utilities data is production-disabled until access controls and sensitive attribute handling are approved.",
    expectedGeometryType: "polyline",
    governanceNotes: [
      ...baseGovernanceNotes,
      "Review sensitive utility attributes before enabling any client-visible field or popup.",
    ],
    id: "utilities-infrastructure-layer",
    layerKind: "FeatureLayer",
    onboardingStage: "production-disabled",
    ownership: infrastructureOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/Utilities/FeatureServer/0",
    refreshCadence: "Owner-approved asset management refresh cadence",
    securityNotes: [
      ...baseSecurityNotes,
      "Future implementation should prefer server-side token brokering for sensitive utilities layers.",
    ],
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Utilities Infrastructure Layer",
  },
  {
    category: "Planning",
    connectionStatus: "ready-for-testing",
    contract: permitLayerContractTemplate,
    description:
      "Permit activity candidate service for development pressure and operational event context.",
    disabledReason:
      "Permit activity remains mock-only until endpoint, refresh cadence, and parcel join fields are reviewed.",
    expectedGeometryType: "point",
    governanceNotes: baseGovernanceNotes,
    id: "permit-activity-service",
    layerKind: "FeatureLayer",
    onboardingStage: "testing-ready",
    ownership: planningOwnership,
    placeholderUrl:
      "https://services.example.invalid/arcgis/rest/services/Cabarrus/PermitActivity/FeatureServer/0",
    refreshCadence: "Daily or near-real-time permitting feed expectation",
    securityNotes: baseSecurityNotes,
    serviceEnvironment: "production-disabled",
    serviceType: "FeatureServer",
    title: "Permit Activity Service",
  },
];

export function getCandidateArcGISServiceById(serviceId: string) {
  return candidateArcGISServiceRegistry.find((service) => service.id === serviceId);
}
