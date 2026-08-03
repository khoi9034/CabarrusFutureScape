import {
  ApiClientError,
  apiGet,
  apiPatch,
  apiPost,
  type ApiQueryParams,
  type ApiRequestOptions,
} from "@/lib/api/client";
import type {
  AskCfsConversationCreateInput,
  AskCfsConversationRecord,
  AskCfsConversationUpdateInput,
  AskCfsMessageCreateInput,
  AskCfsMessageRecord,
  EconomicScenarioCreateInput,
  EconomicScenarioRecord,
  EconomicScenarioUpdateInput,
  JsonObject,
  JsonValue,
  PlanningSnapshotCreateInput,
  PlanningSnapshotRecord,
  PlanningSnapshotUpdateInput,
  ProductDataProvider,
  ProductListOptions,
  ProductPermission,
  ProductPrincipal,
  ProductProvenance,
  ProductRequestOptions,
  ProductResult,
  ProductRole,
  ProductRuntimeMode,
  ProductUpdateOptions,
  ReportCreateInput,
  ReportBucketItemCreateInput,
  ReportBucketItemRecord,
  ReportBucketItemUpdateInput,
  ReportRecord,
  ReportUpdateInput,
} from "@/lib/product/types";

export type ProductApiErrorKind =
  | "cancelled"
  | "conflict"
  | "forbidden"
  | "malformed"
  | "not_found"
  | "unauthenticated"
  | "unavailable"
  | "unknown"
  | "validation";

export class ProductApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly displayMessage: string;
  readonly kind: ProductApiErrorKind;
  readonly requestId: string | null;
  readonly status: number | null;

  constructor({
    cause,
    code,
    details,
    displayMessage,
    kind,
    requestId = null,
    status = null,
  }: {
    cause?: unknown;
    code: string;
    details?: unknown;
    displayMessage: string;
    kind: ProductApiErrorKind;
    requestId?: string | null;
    status?: number | null;
  }) {
    super(displayMessage, { cause });
    this.name = "ProductApiError";
    this.code = code;
    this.details = details;
    this.displayMessage = displayMessage;
    this.kind = kind;
    this.requestId = requestId;
    this.status = status;
  }

  get isRetryable() {
    return this.kind === "unavailable";
  }
}

type RecordParser<T> = (value: unknown) => T;

const PRODUCT_ROLES = new Set<ProductRole>([
  "Administrator",
  "Analyst",
  "Data Steward",
  "Planner",
  "Report Author",
  "Viewer",
]);
const PRODUCT_PERMISSIONS = new Set<ProductPermission>([
  "administration:write",
  "artifacts:download",
  "ask_cfs:use",
  "audit:read",
  "data:read",
  "economics:write",
  "ingestion:apply",
  "ingestion:dry_run",
  "investments:write",
  "planning:write",
  "projects:write",
  "reports:read",
  "reports:write",
  "sources:read",
  "sources:write",
]);
const RUNTIME_MODES = new Set<ProductRuntimeMode>(["demo", "enterprise", "local"]);
const DATA_PROVIDERS = new Set<ProductDataProvider>([
  "enterprise_api",
  "local_api",
  "static",
]);

export async function getProductPrincipal(
  options: ProductRequestOptions = {},
): Promise<ProductResult<ProductPrincipal>> {
  return readProductEnvelope("/api/v1/me", parseProductPrincipal, {}, {
    timeoutMs: 60_000,
    ...options,
  });
}

export function listPlanningSnapshots(options: ProductListOptions = {}) {
  return listResource(
    "/api/v1/planning/snapshots",
    parsePlanningSnapshotRecord,
    options,
  );
}

export function createPlanningSnapshot(
  input: PlanningSnapshotCreateInput,
  options: ProductRequestOptions = {},
) {
  return createResource(
    "/api/v1/planning/snapshots",
    planningSnapshotBody(input, true),
    parsePlanningSnapshotRecord,
    options,
  );
}

export function getPlanningSnapshot(
  id: string,
  options: ProductRequestOptions = {},
) {
  return getResource(
    "/api/v1/planning/snapshots",
    id,
    parsePlanningSnapshotRecord,
    options,
  );
}

export function updatePlanningSnapshot(
  id: string,
  input: PlanningSnapshotUpdateInput,
  options: ProductUpdateOptions = {},
) {
  return updateResource(
    "/api/v1/planning/snapshots",
    id,
    planningSnapshotBody(input, false),
    parsePlanningSnapshotRecord,
    options,
  );
}

export function versionPlanningSnapshot(
  id: string,
  note: string | null = null,
  options: ProductRequestOptions = {},
) {
  return versionResource(
    "/api/v1/planning/snapshots",
    id,
    note,
    parsePlanningSnapshotRecord,
    options,
  );
}

export function archivePlanningSnapshot(
  id: string,
  options: ProductRequestOptions = {},
) {
  return archiveResource(
    "/api/v1/planning/snapshots",
    id,
    parsePlanningSnapshotRecord,
    options,
  );
}

export function listEconomicScenarios(options: ProductListOptions = {}) {
  return listResource(
    "/api/v1/economics/scenarios",
    parseEconomicScenarioRecord,
    options,
  );
}

export function createEconomicScenario(
  input: EconomicScenarioCreateInput,
  options: ProductRequestOptions = {},
) {
  return createResource(
    "/api/v1/economics/scenarios",
    economicScenarioBody(input, true),
    parseEconomicScenarioRecord,
    options,
  );
}

export function getEconomicScenario(
  id: string,
  options: ProductRequestOptions = {},
) {
  return getResource(
    "/api/v1/economics/scenarios",
    id,
    parseEconomicScenarioRecord,
    options,
  );
}

export function updateEconomicScenario(
  id: string,
  input: EconomicScenarioUpdateInput,
  options: ProductUpdateOptions = {},
) {
  return updateResource(
    "/api/v1/economics/scenarios",
    id,
    economicScenarioBody(input, false),
    parseEconomicScenarioRecord,
    options,
  );
}

export function versionEconomicScenario(
  id: string,
  note: string | null = null,
  options: ProductRequestOptions = {},
) {
  return versionResource(
    "/api/v1/economics/scenarios",
    id,
    note,
    parseEconomicScenarioRecord,
    options,
  );
}

export function archiveEconomicScenario(
  id: string,
  options: ProductRequestOptions = {},
) {
  return archiveResource(
    "/api/v1/economics/scenarios",
    id,
    parseEconomicScenarioRecord,
    options,
  );
}

export function listReports(options: ProductListOptions = {}) {
  return listResource("/api/v1/reports", parseReportRecord, options);
}

export function createReport(
  input: ReportCreateInput,
  options: ProductRequestOptions = {},
) {
  return createResource(
    "/api/v1/reports",
    reportBody(input, true),
    parseReportRecord,
    options,
  );
}

export function getReport(
  id: string,
  options: ProductRequestOptions = {},
) {
  return getResource("/api/v1/reports", id, parseReportRecord, options);
}

export function updateReport(
  id: string,
  input: ReportUpdateInput,
  options: ProductUpdateOptions = {},
) {
  return updateResource(
    "/api/v1/reports",
    id,
    reportBody(input, false),
    parseReportRecord,
    options,
  );
}

export function archiveReport(
  id: string,
  options: ProductRequestOptions = {},
) {
  return archiveResource("/api/v1/reports", id, parseReportRecord, options);
}

export function listReportBucketItems(options: ProductListOptions = {}) {
  return listResource(
    "/api/v1/reports/bucket",
    parseReportBucketItemRecord,
    options,
  );
}

export function createReportBucketItem(
  input: ReportBucketItemCreateInput,
  options: ProductRequestOptions = {},
) {
  return createResource(
    "/api/v1/reports/bucket",
    reportBucketItemBody(input, true),
    parseReportBucketItemRecord,
    options,
  );
}

export function getReportBucketItem(
  id: string,
  options: ProductRequestOptions = {},
) {
  return getResource(
    "/api/v1/reports/bucket",
    id,
    parseReportBucketItemRecord,
    options,
  );
}

export function updateReportBucketItem(
  id: string,
  input: ReportBucketItemUpdateInput,
  options: ProductUpdateOptions = {},
) {
  return updateResource(
    "/api/v1/reports/bucket",
    id,
    reportBucketItemBody(input, false),
    parseReportBucketItemRecord,
    options,
  );
}

export function archiveReportBucketItem(
  id: string,
  options: ProductRequestOptions = {},
) {
  return archiveResource(
    "/api/v1/reports/bucket",
    id,
    parseReportBucketItemRecord,
    options,
  );
}

export function listAskCfsConversations(options: ProductListOptions = {}) {
  return listResource(
    "/api/v1/ask-cfs/conversations",
    parseAskCfsConversationRecord,
    options,
  );
}

export function createAskCfsConversation(
  input: AskCfsConversationCreateInput,
  options: ProductRequestOptions = {},
) {
  return createResource(
    "/api/v1/ask-cfs/conversations",
    askCfsConversationBody(input, true),
    parseAskCfsConversationRecord,
    options,
  );
}

export function getAskCfsConversation(
  id: string,
  options: ProductRequestOptions = {},
) {
  return getResource(
    "/api/v1/ask-cfs/conversations",
    id,
    parseAskCfsConversationRecord,
    options,
  );
}

export function updateAskCfsConversation(
  id: string,
  input: AskCfsConversationUpdateInput,
  options: ProductUpdateOptions = {},
) {
  return updateResource(
    "/api/v1/ask-cfs/conversations",
    id,
    askCfsConversationBody(input, false),
    parseAskCfsConversationRecord,
    options,
  );
}

export function archiveAskCfsConversation(
  id: string,
  options: ProductRequestOptions = {},
) {
  return archiveResource(
    "/api/v1/ask-cfs/conversations",
    id,
    parseAskCfsConversationRecord,
    options,
  );
}

export async function addAskCfsMessage(
  conversationId: string,
  input: AskCfsMessageCreateInput,
  options: ProductRequestOptions = {},
) {
  const body = askCfsMessageBody(input);
  return writeProductEnvelope(
    () =>
      apiPost<unknown>(
        `/api/v1/ask-cfs/conversations/${resourceId(conversationId)}/messages`,
        body,
        requestOptions(options),
      ),
    parseAskCfsMessageRecord,
  );
}

export function listAskCfsMessages(
  conversationId: string,
  options: ProductListOptions = {},
) {
  const path = `/api/v1/ask-cfs/conversations/${resourceId(conversationId)}/messages`;
  return readProductEnvelope(
    path,
    (value) => array(value, path).map(parseAskCfsMessageRecord),
    { page: options.page, page_size: options.pageSize },
    options,
    true,
  );
}

export async function resetAskCfsConversation(
  id: string,
  options: ProductRequestOptions = {},
) {
  return writeProductEnvelope(
    () =>
      apiPost<unknown>(
        `/api/v1/ask-cfs/conversations/${resourceId(id)}/reset`,
        undefined,
        requestOptions(options),
      ),
    parseAskCfsConversationRecord,
  );
}

export function parsePlanningSnapshotRecord(value: unknown): PlanningSnapshotRecord {
  const item = object(value, "planning snapshot");
  return {
    archived_at: nullableTimestamp(item.archived_at, "archived_at"),
    created_at: timestamp(item.created_at, "created_at"),
    created_by: nullableText(item.created_by, "created_by"),
    current_version: positiveInteger(item.current_version, "current_version"),
    id: uuid(item.id, "id"),
    included_sections: stringArray(item.included_sections, "included_sections"),
    map_state: jsonObject(item.map_state, "map_state"),
    notes: nullableText(item.notes, "notes"),
    organization_id: nullableText(item.organization_id, "organization_id"),
    payload: jsonObject(item.payload, "payload"),
    project_id: nullableText(item.project_id, "project_id"),
    review_status: text(item.review_status, "review_status"),
    title: text(item.title, "title"),
    updated_at: timestamp(item.updated_at, "updated_at"),
  };
}

export function parseEconomicScenarioRecord(value: unknown): EconomicScenarioRecord {
  const item = object(value, "economic scenario");
  return {
    archived_at: nullableTimestamp(item.archived_at, "archived_at"),
    assumptions: jsonObject(item.assumptions, "assumptions"),
    comparison_set_id: nullableText(item.comparison_set_id, "comparison_set_id"),
    created_at: timestamp(item.created_at, "created_at"),
    created_by: nullableText(item.created_by, "created_by"),
    current_version: positiveInteger(item.current_version, "current_version"),
    id: uuid(item.id, "id"),
    name: text(item.name, "name"),
    notes: nullableText(item.notes, "notes"),
    organization_id: nullableText(item.organization_id, "organization_id"),
    outputs: jsonObject(item.outputs, "outputs"),
    payload: jsonObject(item.payload, "payload"),
    project_id: nullableText(item.project_id, "project_id"),
    status: text(item.status, "status"),
    updated_at: timestamp(item.updated_at, "updated_at"),
  };
}

export function parseReportRecord(value: unknown): ReportRecord {
  const item = object(value, "report");
  return {
    archived_at: nullableTimestamp(item.archived_at, "archived_at"),
    created_at: timestamp(item.created_at, "created_at"),
    created_by: nullableText(item.created_by, "created_by"),
    id: uuid(item.id, "id"),
    organization_id: nullableText(item.organization_id, "organization_id"),
    payload: jsonObject(item.payload, "payload"),
    project_id: nullableText(item.project_id, "project_id"),
    report_type: text(item.report_type, "report_type"),
    status: text(item.status, "status"),
    title: text(item.title, "title"),
    updated_at: timestamp(item.updated_at, "updated_at"),
  };
}

export function parseReportBucketItemRecord(value: unknown): ReportBucketItemRecord {
  const item = object(value, "report bucket item");
  return {
    archived_at: nullableTimestamp(item.archived_at, "archived_at"),
    created_at: timestamp(item.created_at, "created_at"),
    created_by: nullableText(item.created_by, "created_by"),
    id: uuid(item.id, "id"),
    include_in_print: boolean(item.include_in_print, "include_in_print"),
    object_id: text(item.object_id, "object_id"),
    object_type: text(item.object_type, "object_type"),
    organization_id: nullableText(item.organization_id, "organization_id"),
    payload: jsonObject(item.payload, "payload"),
    position: nullableInteger(item.position, "position"),
    project_id: nullableText(item.project_id, "project_id"),
    report_id: nullableText(item.report_id, "report_id"),
    title: text(item.title, "title"),
    updated_at: timestamp(item.updated_at, "updated_at"),
  };
}

export function parseAskCfsConversationRecord(value: unknown): AskCfsConversationRecord {
  const item = object(value, "Ask CFS conversation");
  return {
    archived_at: nullableTimestamp(item.archived_at, "archived_at"),
    created_at: timestamp(item.created_at, "created_at"),
    id: uuid(item.id, "id"),
    organization_id: nullableText(item.organization_id, "organization_id"),
    product_context: jsonObject(item.product_context, "product_context"),
    project_id: nullableText(item.project_id, "project_id"),
    reset_at: nullableTimestamp(item.reset_at, "reset_at"),
    retention_until: nullableTimestamp(item.retention_until, "retention_until"),
    title: text(item.title, "title"),
    updated_at: timestamp(item.updated_at, "updated_at"),
    user_id: nullableText(item.user_id, "user_id"),
  };
}

export function parseAskCfsMessageRecord(value: unknown): AskCfsMessageRecord {
  const item = object(value, "Ask CFS message");
  const role = text(item.role, "role");
  if (role !== "assistant" && role !== "user") {
    throw malformed("Ask CFS message role is invalid.");
  }
  return {
    conversation_id: uuid(item.conversation_id, "conversation_id"),
    created_at: timestamp(item.created_at, "created_at"),
    entity_context: jsonObject(item.entity_context, "entity_context"),
    id: uuid(item.id, "id"),
    prompt_version: nullableText(item.prompt_version, "prompt_version"),
    provider_mode: text(item.provider_mode, "provider_mode"),
    role,
    safe_answer_summary: nullableText(item.safe_answer_summary, "safe_answer_summary"),
    safe_question: nullableText(item.safe_question, "safe_question"),
    safety_status: text(item.safety_status, "safety_status"),
  };
}

export function toProductApiError(error: unknown): ProductApiError {
  if (error instanceof ProductApiError) return error;
  if (!(error instanceof ApiClientError)) {
    return new ProductApiError({
      cause: error,
      code: "unknown_error",
      displayMessage: "The Product V1 request failed unexpectedly.",
      kind: "unknown",
    });
  }

  const payload = optionalObject(error.payload);
  const errorBody = optionalObject(payload?.error);
  const code = optionalText(errorBody?.code) ?? httpCode(error);
  const details = errorBody?.details;
  const kind = errorKind(error);
  return new ProductApiError({
    cause: error,
    code,
    details,
    displayMessage: error.displayMessage,
    kind,
    requestId: error.requestId,
    status: error.status,
  });
}

async function listResource<T>(
  path: string,
  parser: RecordParser<T>,
  options: ProductListOptions,
): Promise<ProductResult<T[]>> {
  const query: ApiQueryParams = {
    page: options.page,
    page_size: options.pageSize,
    project_id: options.projectId,
    sort: options.sort,
    status: options.status,
  };
  return readProductEnvelope(path, (value) => array(value, path).map(parser), query, options, true);
}

function createResource<T>(
  path: string,
  body: JsonObject,
  parser: RecordParser<T>,
  options: ProductRequestOptions,
) {
  return writeProductEnvelope(
    () => apiPost<unknown>(path, body, requestOptions(options)),
    parser,
  );
}

function getResource<T>(
  path: string,
  id: string,
  parser: RecordParser<T>,
  options: ProductRequestOptions,
) {
  return readProductEnvelope(`${path}/${resourceId(id)}`, parser, {}, options);
}

function updateResource<T>(
  path: string,
  id: string,
  body: JsonObject,
  parser: RecordParser<T>,
  options: ProductUpdateOptions,
) {
  const expectedUpdatedAt = optionalNullableTimestamp(
    options.expectedUpdatedAt,
    "expectedUpdatedAt",
  );
  const expected = expectedUpdatedAt
    ? `?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`
    : "";
  return writeProductEnvelope(
    () =>
      apiPatch<unknown>(
        `${path}/${resourceId(id)}${expected}`,
        body,
        requestOptions(options),
      ),
    parser,
  );
}

function versionResource<T>(
  path: string,
  id: string,
  note: string | null,
  parser: RecordParser<T>,
  options: ProductRequestOptions,
) {
  return writeProductEnvelope(
    () =>
      apiPost<unknown>(
        `${path}/${resourceId(id)}/versions`,
        { note: boundedNullableText(note, "note", 10_000) },
        requestOptions(options),
      ),
    parser,
  );
}

function archiveResource<T>(
  path: string,
  id: string,
  parser: RecordParser<T>,
  options: ProductRequestOptions,
) {
  return writeProductEnvelope(
    () =>
      apiPost<unknown>(
        `${path}/${resourceId(id)}/archive`,
        undefined,
        requestOptions(options),
      ),
    parser,
  );
}

async function readProductEnvelope<T>(
  path: string,
  parser: RecordParser<T>,
  query: ApiQueryParams,
  options: ProductRequestOptions,
  requirePagination = false,
): Promise<ProductResult<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await apiGet<unknown>(path, query, requestOptions(options));
      return parseEnvelope(payload, parser, requirePagination);
    } catch (error) {
      lastError = error;
      if (
        attempt === 0 &&
        error instanceof ApiClientError &&
        error.isRetryable &&
        !options.signal?.aborted
      ) {
        continue;
      }
      throw toProductApiError(error);
    }
  }
  throw toProductApiError(lastError);
}

async function writeProductEnvelope<T>(
  request: () => Promise<unknown>,
  parser: RecordParser<T>,
): Promise<ProductResult<T>> {
  try {
    return parseEnvelope(await request(), parser, false);
  } catch (error) {
    throw toProductApiError(error);
  }
}

function parseEnvelope<T>(
  value: unknown,
  parser: RecordParser<T>,
  requirePagination: boolean,
): ProductResult<T> {
  const envelope = object(value, "Product V1 response envelope");
  const requestId = text(envelope.request_id, "request_id");
  const result: ProductResult<T> = {
    data: parser(envelope.data),
    provenance: parseProvenance(envelope.provenance),
    requestId,
    timestamp: timestamp(envelope.timestamp, "timestamp"),
  };
  if (requirePagination || envelope.pagination !== undefined) {
    const pagination = object(envelope.pagination, "pagination");
    result.pagination = {
      page: positiveInteger(pagination.page, "pagination.page"),
      pageSize: positiveInteger(pagination.page_size, "pagination.page_size"),
      total: nonnegativeInteger(pagination.total, "pagination.total"),
    };
  }
  return result;
}

function parseProductPrincipal(value: unknown): ProductPrincipal {
  const principal = object(value, "Product V1 principal");
  const roles = stringArray(principal.roles, "roles");
  const permissions = stringArray(principal.permissions, "permissions");
  if (!roles.every((role): role is ProductRole => PRODUCT_ROLES.has(role as ProductRole))) {
    throw malformed("Product V1 principal contains an unknown role.");
  }
  if (
    !permissions.every((permission): permission is ProductPermission =>
      PRODUCT_PERMISSIONS.has(permission as ProductPermission),
    )
  ) {
    throw malformed("Product V1 principal contains an unknown permission.");
  }
  return {
    authenticated: boolean(principal.authenticated, "authenticated"),
    organization_id: nullableText(principal.organization_id, "organization_id"),
    permissions,
    roles,
    subject: text(principal.subject, "subject"),
    user_id: nullableText(principal.user_id, "user_id"),
  };
}

function parseProvenance(value: unknown): ProductProvenance {
  const provenance = object(value, "provenance");
  const runtimeMode = text(provenance.runtime_mode, "provenance.runtime_mode");
  const dataProvider = text(provenance.data_provider, "provenance.data_provider");
  if (provenance.api_version !== "v1") {
    throw malformed("Product V1 response has an unexpected API version.");
  }
  if (!RUNTIME_MODES.has(runtimeMode as ProductRuntimeMode)) {
    throw malformed("Product V1 response has an unknown runtime mode.");
  }
  if (!DATA_PROVIDERS.has(dataProvider as ProductDataProvider)) {
    throw malformed("Product V1 response has an unknown data provider.");
  }
  return {
    apiVersion: "v1",
    dataProvider: dataProvider as ProductDataProvider,
    runtimeMode: runtimeMode as ProductRuntimeMode,
  };
}

function planningSnapshotBody(
  input: PlanningSnapshotCreateInput | PlanningSnapshotUpdateInput,
  create: boolean,
): JsonObject {
  const value = inputObject(input, [
    "included_sections",
    "map_state",
    "notes",
    "payload",
    "project_id",
    "review_status",
    "title",
  ]);
  if (create && value.title === undefined) throw validation("title is required.");
  return compact({
    included_sections: optionalStringArray(value.included_sections, "included_sections"),
    map_state: optionalJsonObject(value.map_state, "map_state"),
    notes: optionalBoundedNullableText(value.notes, "notes", 100_000),
    payload: optionalJsonObject(value.payload, "payload"),
    project_id: optionalBoundedNullableText(value.project_id, "project_id", 36),
    review_status: optionalBoundedText(value.review_status, "review_status", 40),
    title: optionalBoundedText(value.title, "title", 240),
  });
}

function economicScenarioBody(
  input: EconomicScenarioCreateInput | EconomicScenarioUpdateInput,
  create: boolean,
): JsonObject {
  const value = inputObject(input, [
    "assumptions",
    "comparison_set_id",
    "name",
    "notes",
    "outputs",
    "payload",
    "project_id",
    "status",
  ]);
  if (create && value.name === undefined) throw validation("name is required.");
  return compact({
    assumptions: optionalJsonObject(value.assumptions, "assumptions"),
    comparison_set_id: optionalBoundedNullableText(value.comparison_set_id, "comparison_set_id", 36),
    name: optionalBoundedText(value.name, "name", 240),
    notes: optionalBoundedNullableText(value.notes, "notes", 100_000),
    outputs: optionalJsonObject(value.outputs, "outputs"),
    payload: optionalJsonObject(value.payload, "payload"),
    project_id: optionalBoundedNullableText(value.project_id, "project_id", 36),
    status: optionalBoundedText(value.status, "status", 40),
  });
}

function reportBody(
  input: ReportCreateInput | ReportUpdateInput,
  create: boolean,
): JsonObject {
  const value = inputObject(input, [
    "payload",
    "project_id",
    "report_type",
    "status",
    "title",
  ]);
  if (create) {
    for (const field of ["report_type", "title"] as const) {
      if (value[field] === undefined) throw validation(`${field} is required.`);
    }
  }
  return compact({
    payload: optionalJsonObject(value.payload, "payload"),
    project_id: optionalBoundedNullableText(value.project_id, "project_id", 36),
    report_type: optionalBoundedText(value.report_type, "report_type", 80),
    status: optionalBoundedText(value.status, "status", 40),
    title: optionalBoundedText(value.title, "title", 240),
  });
}

function reportBucketItemBody(
  input: ReportBucketItemCreateInput | ReportBucketItemUpdateInput,
  create: boolean,
): JsonObject {
  const value = inputObject(input, [
    "include_in_print",
    "object_id",
    "object_type",
    "payload",
    "position",
    "project_id",
    "report_id",
    "title",
  ]);
  if (create) {
    for (const field of ["object_id", "object_type", "title"] as const) {
      if (value[field] === undefined) throw validation(`${field} is required.`);
    }
  }
  return compact({
    include_in_print: optionalBoolean(value.include_in_print, "include_in_print"),
    object_id: optionalBoundedText(value.object_id, "object_id", 120),
    object_type: optionalBoundedText(value.object_type, "object_type", 80),
    payload: optionalJsonObject(value.payload, "payload"),
    position: optionalNullableInteger(value.position, "position"),
    project_id: optionalBoundedNullableText(value.project_id, "project_id", 36),
    report_id: optionalBoundedNullableText(value.report_id, "report_id", 36),
    title: optionalBoundedText(value.title, "title", 240),
  });
}

function askCfsConversationBody(
  input: AskCfsConversationCreateInput | AskCfsConversationUpdateInput,
  create: boolean,
): JsonObject {
  const value = inputObject(input, [
    "product_context",
    "project_id",
    "retention_until",
    "title",
  ]);
  if (create && value.title === undefined) throw validation("title is required.");
  return compact({
    product_context: optionalJsonObject(value.product_context, "product_context"),
    project_id: optionalBoundedNullableText(value.project_id, "project_id", 36),
    retention_until: optionalNullableTimestamp(value.retention_until, "retention_until"),
    title: optionalBoundedText(value.title, "title", 240),
  });
}

function askCfsMessageBody(input: AskCfsMessageCreateInput): JsonObject {
  const value = inputObject(input, [
    "entity_context",
    "prompt_version",
    "provider_mode",
    "role",
    "safe_answer_summary",
    "safe_question",
    "safety_status",
  ]);
  if (value.role !== "assistant" && value.role !== "user") {
    throw validation("role must be user or assistant.");
  }
  return compact({
    entity_context: optionalJsonObject(value.entity_context, "entity_context") ?? {},
    prompt_version: optionalBoundedNullableText(value.prompt_version, "prompt_version", 100),
    provider_mode: optionalBoundedText(value.provider_mode, "provider_mode", 40) ?? "none",
    role: value.role,
    safe_answer_summary: optionalBoundedNullableText(value.safe_answer_summary, "safe_answer_summary", 2_000),
    safe_question: optionalBoundedNullableText(value.safe_question, "safe_question", 500),
    safety_status: optionalBoundedText(value.safety_status, "safety_status", 40) ?? "accepted",
  });
}

function requestOptions(options: ProductRequestOptions): ApiRequestOptions {
  return { signal: options.signal, timeoutMs: options.timeoutMs ?? 12_000 };
}

function errorKind(error: ApiClientError): ProductApiErrorKind {
  if (error.kind === "cancelled") return "cancelled";
  if (error.status === 401) return "unauthenticated";
  if (error.status === 403) return "forbidden";
  if (error.status === 404) return "not_found";
  if (error.status === 409) return "conflict";
  if (error.status === 422) return "validation";
  if (error.isRetryable || error.kind === "network" || error.kind === "timeout") {
    return "unavailable";
  }
  if (error.kind === "malformed") return "malformed";
  return "unknown";
}

function httpCode(error: ApiClientError) {
  return error.status ? `http_${error.status}` : error.kind;
}

function resourceId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw validation("resource id must be a UUID.");
  }
  return encodeURIComponent(value);
}

function inputObject(value: unknown, allowed: readonly string[]) {
  const result = object(value, "request payload");
  const unknown = Object.keys(result).filter((key) => !allowed.includes(key));
  if (unknown.length) throw validation(`Unknown fields: ${unknown.sort().join(", ")}.`);
  return result;
}

function compact(value: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  );
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw malformed(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw malformed(`${label} must be an array.`);
  return value;
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw malformed(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableText(value: unknown, label: string) {
  if (value === null || value === undefined) return null;
  return text(value, label);
}

function timestamp(value: unknown, label: string) {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) throw malformed(`${label} must be an ISO timestamp.`);
  return result;
}

function nullableTimestamp(value: unknown, label: string) {
  return value === null || value === undefined ? null : timestamp(value, label);
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw malformed(`${label} must be a boolean.`);
  return value;
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw malformed(`${label} must be a positive integer.`);
  }
  return value as number;
}

function nonnegativeInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw malformed(`${label} must be a nonnegative integer.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string) {
  return value === null || value === undefined ? null : nonnegativeInteger(value, label);
}

function uuid(value: unknown, label: string) {
  const result = text(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw malformed(`${label} must be a UUID.`);
  }
  return result;
}

function stringArray(value: unknown, label: string) {
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}

function jsonObject(value: unknown, label: string): JsonObject {
  const result = jsonValue(value, label);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw malformed(`${label} must be a JSON object.`);
  }
  return result;
}

function jsonValue(
  value: unknown,
  label: string,
  seen = new WeakSet<object>(),
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw malformed(`${label} must not contain circular references.`);
    seen.add(value);
    const result = value.map((item, index) =>
      jsonValue(item, `${label}[${index}]`, seen),
    );
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw malformed(`${label} must not contain class instances.`);
    }
    if (seen.has(value)) throw malformed(`${label} must not contain circular references.`);
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        jsonValue(item, `${label}.${key}`, seen),
      ]),
    );
    seen.delete(value);
    return result;
  }
  throw malformed(`${label} must contain only JSON values.`);
}

function optionalBoundedText(value: unknown, label: string, maximum: number) {
  return value === undefined ? undefined : boundedText(value, label, maximum);
}

function boundedText(value: unknown, label: string, maximum: number) {
  const result = typeof value === "string" && value.trim() ? value : null;
  if (!result) throw validation(`${label} must be a non-empty string.`);
  if (result.length > maximum) throw validation(`${label} exceeds ${maximum} characters.`);
  return result;
}

function boundedNullableText(value: unknown, label: string, maximum: number) {
  if (value === null || value === undefined) return null;
  return boundedText(value, label, maximum);
}

function optionalBoundedNullableText(value: unknown, label: string, maximum: number) {
  return value === undefined ? undefined : boundedNullableText(value, label, maximum);
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw validation(`${label} must be a boolean.`);
  return value;
}

function optionalNullableInteger(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw validation(`${label} must be a nonnegative integer or null.`);
  }
  return value as number;
}

function optionalStringArray(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw validation(`${label} must be an array.`);
  return value.map((item, index) => boundedText(item, `${label}[${index}]`, 120));
}

function optionalJsonObject(value: unknown, label: string) {
  if (value === undefined) return undefined;
  try {
    return jsonObject(value, label);
  } catch (error) {
    if (error instanceof ProductApiError) throw validation(error.displayMessage);
    throw error;
  }
}

function optionalNullableTimestamp(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw validation(`${label} must be an ISO timestamp or null.`);
  }
  return value;
}

function malformed(displayMessage: string) {
  return new ProductApiError({
    code: "malformed_response",
    displayMessage,
    kind: "malformed",
  });
}

function validation(displayMessage: string) {
  return new ProductApiError({
    code: "client_validation_error",
    displayMessage,
    kind: "validation",
    status: 422,
  });
}
