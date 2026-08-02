export interface DataAdministrationRuntime {
  aiProvider: string;
  artifactProvider: string;
  authMode: string;
  dataProvider: string;
  jobProvider: string;
  runtimeMode: string;
}

export interface DataAdministrationMigration {
  checkedAt: string | null;
  currentRevision: string | null;
  pendingCount: number | null;
  status: string;
}

export interface DataAdministrationSource {
  freshness: string;
  id: string;
  name: string;
  qualityStatus: string;
  rowCount: number | null;
  updatedAt: string | null;
}

export interface DataAdministrationIngestionRun {
  finishedAt: string | null;
  id: string;
  sourceId: string;
  startedAt: string | null;
  status: string;
}

export interface DataAdministrationQualityResult {
  checkedAt: string | null;
  failedCount: number | null;
  id: string;
  rule: string;
  sourceId: string;
  status: string;
}

export interface DataAdministrationJob {
  finishedAt: string | null;
  id: string;
  jobType: string;
  queuedAt: string | null;
  status: string;
}

export interface DataAdministrationAuditEvent {
  action: string;
  id: string;
  objectType: string;
  occurredAt: string | null;
}

export interface DataAdministrationSummary {
  audit: DataAdministrationAuditEvent[];
  generatedAt: string | null;
  ingestionRuns: DataAdministrationIngestionRun[];
  jobs: DataAdministrationJob[];
  migration: DataAdministrationMigration;
  qualityResults: DataAdministrationQualityResult[];
  requestId: string | null;
  runtime: DataAdministrationRuntime;
  sources: DataAdministrationSource[];
  summarySource: "api" | "sanitized_demo_registry";
}
