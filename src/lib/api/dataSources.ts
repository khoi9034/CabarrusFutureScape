import { apiGet } from "@/lib/api/client";

export interface RegisteredDataSource {
  authorityLevel: string;
  domain: string;
  expectedRefresh: string | null;
  id: string;
  limitations: string | null;
  ownerRole: string;
  providerSystem: string;
  schemaVersion: string;
  sourceDate: string | null;
  sourceName: string;
  status: string;
  validationDate: string | null;
}

export async function getRegisteredDataSources(signal?: AbortSignal) {
  const envelope = record(
    await apiGet<unknown>("/api/v1/data-sources", undefined, {
      signal,
      timeoutMs: 12000,
    }),
  );
  if (!Array.isArray(envelope.data)) {
    throw new Error("The governed source registry response is invalid.");
  }
  return envelope.data.flatMap(normalizeSource);
}

function normalizeSource(value: unknown): RegisteredDataSource[] {
  const source = record(value);
  const id = text(source.id);
  const domain = text(source.domain);
  const sourceName = text(source.source_name);
  if (!id || !domain || !sourceName) {
    return [];
  }
  return [
    {
      authorityLevel: text(source.authority_level) ?? "Not recorded",
      domain,
      expectedRefresh: text(source.expected_refresh),
      id,
      limitations: text(source.limitations),
      ownerRole: text(source.owner_role) ?? "Not recorded",
      providerSystem: text(source.provider_system) ?? "Not recorded",
      schemaVersion: text(source.schema_version) ?? "Not recorded",
      sourceDate: text(source.source_date),
      sourceName,
      status: text(source.status) ?? "Status unavailable",
      validationDate: text(source.validation_date),
    },
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : null;
}
