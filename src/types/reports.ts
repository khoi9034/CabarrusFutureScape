import type { ComparisonSeverity } from "@/types/scenarioComparison";

export type ExportFormat = "csv" | "html" | "pdf" | "png" | "print";

export type ExportJobState =
  | "complete"
  | "failed"
  | "idle"
  | "preparing"
  | "ready";

export type PrintableViewMode =
  | "board-packet"
  | "briefing"
  | "parcel-snapshot"
  | "summary";

export type ReportPackageType =
  | "board-packet"
  | "executive-briefing"
  | "flood-risk-review"
  | "infrastructure-review"
  | "parcel-snapshot"
  | "scenario-comparison";

export type ReportExportIntent =
  | "board"
  | "executive"
  | "infrastructure"
  | "parcel"
  | "scenario";

export type ReportPackageId =
  | "executive-growth"
  | "flood-risk-review"
  | "infrastructure-readiness"
  | "parcel-opportunity"
  | "scenario-comparison";

export interface ReportMetadata {
  author: string;
  createdAt: string;
  department: string;
  disclaimer: string;
  source: "mock";
  tags: string[];
  updatedAt: string;
}

export interface ReportKpiSummary {
  accent: string;
  delta: string;
  id: string;
  label: string;
  status: ComparisonSeverity;
  value: string;
}

export interface ExecutiveReportSection {
  body: string;
  bullets: string[];
  id: string;
  severity: ComparisonSeverity;
  title: string;
}

export interface ExecutiveReportPackage {
  exportMetadata: ReportMetadata;
  id: ReportPackageId;
  kpiSummaries: ReportKpiSummary[];
  narrative: string;
  recommendations: string[];
  sections: ExecutiveReportSection[];
  subtitle: string;
  timestamp: string;
  title: string;
  type: ReportPackageType;
}

export interface BriefingPacket {
  exportFormat: ExportFormat;
  id: string;
  packageId: ReportPackageId;
  printableMode: PrintableViewMode;
  report: ExecutiveReportPackage;
  title: string;
}

export interface MockExportHistoryItem {
  completedAt: string;
  format: ExportFormat;
  id: string;
  packageId: ReportPackageId;
  title: string;
}

export interface ReportExportResult {
  format: ExportFormat;
  jobId: string;
  message: string;
  packageId: ReportPackageId;
  state: ExportJobState;
}
