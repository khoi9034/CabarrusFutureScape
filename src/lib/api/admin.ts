import { getDatasetRegistryEntries } from "@/lib/data/dataRegistry";
import {
  apiGet,
  CFS_AI_PROVIDER,
  CFS_ARTIFACT_PROVIDER,
  CFS_AUTH_MODE,
  CFS_DATA_PROVIDER,
  CFS_JOB_PROVIDER,
  CFS_RUNTIME_MODE,
  USE_DEMO_DATA,
} from "@/lib/api/client";
import type {
  DataAdministrationAuditEvent,
  DataAdministrationIngestionRun,
  DataAdministrationJob,
  DataAdministrationMigration,
  DataAdministrationQualityResult,
  DataAdministrationSource,
  DataAdministrationSummary,
} from "@/types/api/admin";

export async function getDataAdministrationSummary(signal?: AbortSignal) {
  if (USE_DEMO_DATA || CFS_DATA_PROVIDER === "static") {
    return demoAdministrationSummary();
  }

  const payload = await apiGet<unknown>(
    "/api/v1/admin/summary",
    undefined,
    { signal, timeoutMs: 12000 },
  );
  return normalizeAdministrationSummary(payload);
}

function demoAdministrationSummary(): DataAdministrationSummary {
  const sources = getDatasetRegistryEntries().map((source) => ({
    freshness: source.refreshCadence,
    id: source.id,
    name: source.name,
    qualityStatus: source.qualityStatus,
    rowCount: null,
    updatedAt: null,
  }));

  return {
    audit: [],
    generatedAt: null,
    ingestionRuns: [],
    jobs: [],
    migration: {
      checkedAt: null,
      currentRevision: null,
      pendingCount: null,
      status: "Not applicable in static demo mode",
    },
    qualityResults: sources.map((source) => ({
      checkedAt: null,
      failedCount: null,
      id: `${source.id}:registry-review`,
      rule: "Registry quality review",
      sourceId: source.id,
      status: source.qualityStatus,
    })),
    requestId: null,
    runtime: runtimeSummary(),
    sources,
    summarySource: "sanitized_demo_registry",
  };
}

function normalizeAdministrationSummary(
  payload: unknown,
): DataAdministrationSummary {
  const envelope = record(payload);
  const root = record(envelope.data ?? envelope);
  const runtime = record(root.runtime);

  return {
    audit: array(root.audit ?? root.audit_events)
      .slice(0, 50)
      .map(normalizeAuditEvent),
    generatedAt: text(envelope.timestamp ?? root.generated_at),
    ingestionRuns: array(root.ingestion_runs)
      .slice(0, 50)
      .map(normalizeIngestionRun),
    jobs: array(root.jobs).slice(0, 50).map(normalizeJob),
    migration: normalizeMigration(root.migration),
    qualityResults: array(root.quality_results)
      .slice(0, 100)
      .map(normalizeQualityResult),
    requestId: text(envelope.request_id ?? root.request_id),
    runtime: {
      aiProvider: text(runtime.ai_provider) ?? CFS_AI_PROVIDER,
      artifactProvider:
        text(runtime.artifact_provider) ?? CFS_ARTIFACT_PROVIDER,
      authMode: text(runtime.auth_mode) ?? CFS_AUTH_MODE,
      dataProvider: text(runtime.data_provider) ?? CFS_DATA_PROVIDER,
      jobProvider: text(runtime.job_provider) ?? CFS_JOB_PROVIDER,
      runtimeMode: text(runtime.runtime_mode) ?? CFS_RUNTIME_MODE,
    },
    sources: array(root.sources).slice(0, 100).map(normalizeSource),
    summarySource: "api",
  };
}

function runtimeSummary() {
  return {
    aiProvider: CFS_AI_PROVIDER,
    artifactProvider: CFS_ARTIFACT_PROVIDER,
    authMode: CFS_AUTH_MODE,
    dataProvider: CFS_DATA_PROVIDER,
    jobProvider: CFS_JOB_PROVIDER,
    runtimeMode: CFS_RUNTIME_MODE,
  };
}

function normalizeMigration(value: unknown): DataAdministrationMigration {
  const item = record(value);
  return {
    checkedAt: text(item.checked_at),
    currentRevision: text(item.current_revision ?? item.revision),
    pendingCount: count(item.pending_count),
    status: text(item.status) ?? "Status unavailable",
  };
}

function normalizeSource(value: unknown): DataAdministrationSource {
  const item = record(value);
  const id = text(item.id ?? item.source_id ?? item.dataset_id) ?? "unknown";
  const freshness =
    text(item.freshness_status ?? item.status ?? item.freshness) ?? "Unknown";
  const cadence =
    text(item.refresh_cadence ?? item.expected_refresh) ?? "Cadence not specified";
  return {
    freshness: `${freshness} · ${cadence}`,
    id,
    name: text(item.name ?? item.source_name ?? item.dataset_name) ?? id,
    qualityStatus:
      text(item.validation_status ?? item.quality_status ?? item.quality) ??
      "Not checked",
    rowCount: count(item.row_count ?? item.record_count),
    updatedAt: text(
      item.last_ingestion_at ?? item.updated_at ?? item.last_refreshed_at,
    ),
  };
}

function normalizeIngestionRun(
  value: unknown,
): DataAdministrationIngestionRun {
  const item = record(value);
  return {
    finishedAt: text(item.finished_at ?? item.completed_at),
    id: text(item.id ?? item.run_id) ?? "unknown",
    sourceId: text(item.source_id ?? item.dataset_id) ?? "unknown",
    startedAt: text(item.started_at ?? item.created_at),
    status: text(item.status) ?? "Unknown",
  };
}

function normalizeQualityResult(
  value: unknown,
): DataAdministrationQualityResult {
  const item = record(value);
  return {
    checkedAt: text(item.checked_at ?? item.created_at),
    failedCount: count(item.failed_count ?? item.failure_count),
    id: text(item.id ?? item.result_id) ?? "unknown",
    rule: text(item.rule ?? item.rule_name) ?? "Quality check",
    sourceId: text(item.source_id ?? item.dataset_id) ?? "unknown",
    status: text(item.status) ?? "Unknown",
  };
}

function normalizeJob(value: unknown): DataAdministrationJob {
  const item = record(value);
  return {
    finishedAt: text(item.finished_at ?? item.completed_at),
    id: text(item.id ?? item.job_id) ?? "unknown",
    jobType: text(item.job_type ?? item.type) ?? "Background job",
    queuedAt: text(item.queued_at ?? item.created_at),
    status: text(item.status) ?? "Unknown",
  };
}

function normalizeAuditEvent(value: unknown): DataAdministrationAuditEvent {
  const item = record(value);
  return {
    action: text(item.action ?? item.event_type) ?? "Recorded event",
    id: text(item.id ?? item.event_id) ?? "unknown",
    objectType: text(item.object_type ?? item.resource_type) ?? "system",
    occurredAt: text(item.occurred_at ?? item.created_at),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}
