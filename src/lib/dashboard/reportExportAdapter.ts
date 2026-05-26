import {
  defaultPrintableViewMode,
  defaultReportExportIntent,
  defaultReportPackageId,
  mockReportPackages,
} from "@/data/mock/reportMockData";
import type {
  BriefingPacket,
  ExecutiveReportPackage,
  ExportFormat,
  PrintableViewMode,
  ReportExportIntent,
  ReportExportResult,
  ReportPackageId,
} from "@/types/reports";

export interface ReportExportAdapter {
  exportInfrastructureReview: () => ExecutiveReportPackage;
  exportParcelSummary: () => ExecutiveReportPackage;
  exportScenarioComparison: () => ExecutiveReportPackage;
  exportToPdf: (packageId: ReportPackageId) => ReportExportResult;
  exportToPrintView: (
    packageId: ReportPackageId,
    printableMode: PrintableViewMode,
  ) => BriefingPacket;
  generateBoardPacket: () => ExecutiveReportPackage;
  generateExecutivePacket: () => ExecutiveReportPackage;
  getReportPackage: (packageId: ReportPackageId) => ExecutiveReportPackage;
  getReportPackages: () => ExecutiveReportPackage[];
}

// Phase 1 report/export readiness stays fully local. This adapter is the
// future boundary for server-side PDF generation, board-packet automation,
// citation-aware report rendering, and AI-assisted narrative workflows. No
// production export service, document renderer, or county record system is
// connected here.
export const mockReportExportAdapter: ReportExportAdapter = {
  exportInfrastructureReview: () =>
    getReportPackageById("infrastructure-readiness"),
  exportParcelSummary: () => getReportPackageById("parcel-opportunity"),
  exportScenarioComparison: () => getReportPackageById("scenario-comparison"),
  exportToPdf: (packageId) =>
    createMockExportResult(packageId, "pdf", "Mock PDF export prepared."),
  exportToPrintView: (packageId, printableMode) => ({
    exportFormat: "print",
    id: `print:${packageId}:${printableMode}`,
    packageId,
    printableMode,
    report: getReportPackageById(packageId),
    title: `${getReportPackageById(packageId).title} Print Preview`,
  }),
  generateBoardPacket: () => getReportPackageById("executive-growth"),
  generateExecutivePacket: () => getReportPackageById("executive-growth"),
  getReportPackage: getReportPackageById,
  getReportPackages: () => mockReportPackages,
};

export function getDefaultReportPackageId() {
  return defaultReportPackageId;
}

export function getDefaultPrintableViewMode() {
  return defaultPrintableViewMode;
}

export function getDefaultReportExportIntent() {
  return defaultReportExportIntent;
}

export function getReportPackages() {
  return mockReportPackages;
}

export function isReportPackageId(
  value: string | null,
): value is ReportPackageId {
  return Boolean(
    value &&
      mockReportPackages.some((reportPackage) => reportPackage.id === value),
  );
}

export function isPrintableViewMode(
  value: string | null,
): value is PrintableViewMode {
  const validModes: PrintableViewMode[] = [
    "board-packet",
    "briefing",
    "parcel-snapshot",
    "summary",
  ];

  return Boolean(value && validModes.includes(value as PrintableViewMode));
}

export function isReportExportIntent(
  value: string | null,
): value is ReportExportIntent {
  const validIntents: ReportExportIntent[] = [
    "board",
    "executive",
    "infrastructure",
    "parcel",
    "scenario",
  ];

  return Boolean(value && validIntents.includes(value as ReportExportIntent));
}

export function resolveReportPackageForIntent(
  intent: ReportExportIntent,
): ReportPackageId {
  switch (intent) {
    case "board":
    case "executive":
      return "executive-growth";
    case "infrastructure":
      return "infrastructure-readiness";
    case "parcel":
      return "parcel-opportunity";
    case "scenario":
      return "scenario-comparison";
  }
}

function getReportPackageById(packageId: ReportPackageId) {
  return (
    mockReportPackages.find((reportPackage) => reportPackage.id === packageId) ??
    mockReportPackages[0]
  );
}

function createMockExportResult(
  packageId: ReportPackageId,
  format: ExportFormat,
  message: string,
): ReportExportResult {
  return {
    format,
    jobId: `mock-export-${packageId}-${format}`,
    message,
    packageId,
    state: "complete",
  };
}
