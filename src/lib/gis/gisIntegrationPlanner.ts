import { getLayerContractTemplateById } from "@/lib/gis/layerContractTemplates";
import {
  candidateArcGISServiceRegistry,
  getCandidateArcGISServiceById,
} from "@/lib/gis/serviceRegistry";
import type { OperationalLayer } from "@/types";
import type {
  ArcGISLayerContract,
  ArcGISServiceDefinition,
  ContractValidationIssue,
  LayerContractValidationResult,
  LayerMigrationPlan,
  MockLiveContractComparison,
  ServiceReadinessSummary,
} from "@/types/gisContracts";

export function validateLayerContract(
  contract: ArcGISLayerContract,
): LayerContractValidationResult {
  const targetFields = new Set(
    contract.fieldMappings.map((field) => field.targetField),
  );
  const missingRequiredMappings = contract.requiredFields.filter(
    (field) => !targetFields.has(field),
  );
  const issues: ContractValidationIssue[] = [];

  if (!contract.fieldMappings.length) {
    issues.push({
      message: "Contract has no field mappings.",
      severity: "critical",
    });
  }

  if (missingRequiredMappings.length) {
    issues.push({
      message: `Missing required target mappings: ${missingRequiredMappings.join(", ")}.`,
      severity: "critical",
    });
  }

  if (!contract.popupFieldOrder.length) {
    issues.push({
      message: "Popup field order is not defined yet.",
      severity: "warning",
    });
  }

  if (!contract.mockReplacementLayerId) {
    issues.push({
      message: "No mock replacement layer is documented for migration testing.",
      severity: "warning",
    });
  }

  if (contract.integrationStage === "contract-draft") {
    issues.push({
      message: "Contract is still in draft and needs owner review.",
      severity: "info",
    });
  }

  const penalty = issues.reduce((score, issue) => {
    if (issue.severity === "critical") {
      return score + 34;
    }

    if (issue.severity === "warning") {
      return score + 14;
    }

    return score + 6;
  }, 0);

  return {
    contractId: contract.id,
    issues,
    missingRequiredMappings,
    readinessScore: Math.max(0, 100 - penalty),
    valid: !missingRequiredMappings.length,
  };
}

export function validateServiceReadiness(
  service: ArcGISServiceDefinition,
): ServiceReadinessSummary {
  const contractResult = validateLayerContract(service.contract);
  const forcedHighRisk =
    service.connectionStatus === "production-disabled" ||
    service.serviceEnvironment === "production";
  const riskLevel =
    forcedHighRisk || contractResult.readinessScore < 70
      ? "high"
      : contractResult.readinessScore < 88
        ? "medium"
        : "low";

  return {
    connectionStatus: service.connectionStatus,
    contractResult,
    environment: service.serviceEnvironment,
    integrationStage: service.onboardingStage,
    riskLevel,
    serviceId: service.id,
    title: service.title,
  };
}

export function compareMockToLiveContract(
  mockLayer: OperationalLayer,
  contract: ArcGISLayerContract,
): MockLiveContractComparison {
  const mockFields = new Set(mockLayer.fields?.map((field) => field.name) ?? []);
  const contractFields = new Set(
    contract.fieldMappings.map((field) => field.targetField),
  );

  const matchingFields = [...contractFields].filter((field) =>
    mockFields.has(field),
  );
  const missingMockFields = contract.requiredFields.filter(
    (field) => !mockFields.has(field),
  );
  const contractOnlyFields = [...contractFields].filter(
    (field) => !mockFields.has(field),
  );

  return {
    contractId: contract.id,
    contractOnlyFields,
    matchingFields,
    missingMockFields,
    mockLayerId: mockLayer.id,
  };
}

export function prepareLayerMigration(serviceId: string): LayerMigrationPlan {
  const service = getCandidateArcGISServiceById(serviceId);

  if (!service) {
    return {
      blockedBy: ["Candidate service is not registered."],
      serviceId,
      steps: ["Register a candidate service before preparing migration."],
      targetEnvironment: "production-disabled",
    };
  }

  const contractResult = validateLayerContract(service.contract);
  const blockedBy = [
    ...contractResult.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.message),
  ];

  if (service.serviceEnvironment === "production-disabled") {
    blockedBy.push("Live connections are disabled for the current Phase 1 environment.");
  }

  if (service.connectionStatus === "production-disabled") {
    blockedBy.push(service.disabledReason);
  }

  return {
    blockedBy,
    mockLayerId: service.contract.mockReplacementLayerId,
    serviceId: service.id,
    steps: [
      "Confirm service ownership, update cadence, and data sensitivity.",
      "Validate required field mappings against the layer contract.",
      "Test service in staging with mock fallback still available.",
      "Update operational layer registry only after approval.",
      "Monitor dashboard URL, identify, popup, and report behavior after migration.",
    ],
    targetEnvironment: service.serviceEnvironment,
  };
}

export function summarizeIntegrationRisk(service: ArcGISServiceDefinition) {
  const readiness = validateServiceReadiness(service);
  const blockers = prepareLayerMigration(service.id).blockedBy;

  return {
    blockers,
    guidance:
      readiness.riskLevel === "high"
        ? "Keep disconnected until governance and schema blockers are resolved."
        : readiness.riskLevel === "medium"
          ? "Continue schema review and stage with mock fallback."
          : "Candidate is close to staging once environment access is approved.",
    readiness,
  };
}

export function getCandidateServiceReadinessSummaries() {
  return candidateArcGISServiceRegistry.map(validateServiceReadiness);
}

export function getContractTemplateReadiness(contractId: string) {
  const contract = getLayerContractTemplateById(contractId);

  return contract ? validateLayerContract(contract) : null;
}
