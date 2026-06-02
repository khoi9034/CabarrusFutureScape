import { mockDatasetRegistryEntries } from "@/data/mock/dataRegistryMockData";
import { getLayerContractTemplateById } from "@/lib/gis/layerContractTemplates";
import { getLayerById } from "@/lib/gis/layerRegistry";
import { getCandidateArcGISServiceById } from "@/lib/gis/serviceRegistry";
import type {
  DatasetCategory,
  DatasetIntegrationStatus,
  DatasetReadinessSummary,
  DatasetRegistryEntry,
} from "@/types/dataRegistry";

export const datasetIntegrationStatuses: DatasetIntegrationStatus[] = [
  "blocked",
  "candidate",
  "contract-draft",
  "mocked",
  "not-started",
  "production-disabled",
  "ready-for-staging",
  "schema-review",
];

export function getDatasetRegistryEntries() {
  return mockDatasetRegistryEntries;
}

export function getDatasetById(datasetId: string) {
  return mockDatasetRegistryEntries.find((dataset) => dataset.id === datasetId);
}

export function getDatasetsByCategory(category: DatasetCategory) {
  return mockDatasetRegistryEntries.filter(
    (dataset) => dataset.category === category,
  );
}

export function getDatasetsByIntegrationStatus(
  integrationStatus: DatasetIntegrationStatus,
) {
  return mockDatasetRegistryEntries.filter(
    (dataset) => dataset.integrationStatus === integrationStatus,
  );
}

export function getDatasetRisks(datasetId: string) {
  const dataset = getDatasetById(datasetId);

  return dataset ? [...dataset.risks, ...dataset.unknowns] : [];
}

export function getDatasetReadinessSummary(): DatasetReadinessSummary {
  const statusCounts = datasetIntegrationStatuses.reduce<
    Record<DatasetIntegrationStatus, number>
  >((counts, status) => {
    counts[status] = 0;
    return counts;
  }, {} as Record<DatasetIntegrationStatus, number>);

  mockDatasetRegistryEntries.forEach((dataset) => {
    statusCounts[dataset.integrationStatus] += 1;
  });

  const blockedCount =
    statusCounts.blocked + statusCounts["production-disabled"];
  const readyForStagingCount = statusCounts["ready-for-staging"];
  const highPriorityCount = mockDatasetRegistryEntries.filter(
    (dataset) => dataset.integrationPriority === "high",
  ).length;
  const unknownOwnershipOrSchemaCount = mockDatasetRegistryEntries.filter(
    hasOwnershipSchemaOrAccessUnknowns,
  ).length;

  return {
    blockedCount,
    highPriorityCount,
    readyForStagingCount,
    statusCounts,
    totalCount: mockDatasetRegistryEntries.length,
    unknownOwnershipOrSchemaCount,
  };
}

export function getHighPriorityDatasets() {
  return mockDatasetRegistryEntries.filter(
    (dataset) => dataset.integrationPriority === "high",
  );
}

export function getDatasetsBlockedByUnknowns() {
  return mockDatasetRegistryEntries.filter(hasOwnershipSchemaOrAccessUnknowns);
}

export function getDatasetRegistryReferenceStatus(dataset: DatasetRegistryEntry) {
  const relatedService = dataset.relatedServiceRegistryId
    ? getCandidateArcGISServiceById(dataset.relatedServiceRegistryId)
    : null;
  const relatedContract = dataset.layerContractId
    ? getLayerContractTemplateById(dataset.layerContractId)
    : null;
  const relatedLayer = dataset.relatedCfsLayerId
    ? getLayerById(dataset.relatedCfsLayerId, { includeFuture: true })
    : null;

  return {
    hasLayer: Boolean(relatedLayer),
    hasLayerContract: Boolean(relatedContract),
    hasServiceCandidate: Boolean(relatedService),
    relatedContract,
    relatedLayer,
    relatedService,
  };
}

function hasOwnershipSchemaOrAccessUnknowns(dataset: DatasetRegistryEntry) {
  const unknownText = dataset.unknowns.join(" ").toLowerCase();
  const riskText = dataset.risks.join(" ").toLowerCase();
  const combinedText = `${unknownText} ${riskText}`;

  return (
    dataset.accessLevel === "unknown" ||
    dataset.qualityStatus === "unknown" ||
    combinedText.includes("owner") ||
    combinedText.includes("ownership") ||
    combinedText.includes("schema") ||
    combinedText.includes("access") ||
    combinedText.includes("security")
  );
}
