import { CFS_RUNTIME_CONFIG, type CfsRuntimeMode } from "@/lib/runtimeConfig";
import {
  addAskCfsMessage,
  archiveReport,
  archiveAskCfsConversation,
  archiveEconomicScenario,
  archivePlanningSnapshot,
  archiveReportBucketItem,
  createAskCfsConversation,
  createEconomicScenario,
  createPlanningSnapshot,
  createReport,
  createReportBucketItem,
  getAskCfsConversation,
  getEconomicScenario,
  getPlanningSnapshot,
  getReport,
  getReportBucketItem,
  listAskCfsConversations,
  listAskCfsMessages,
  listEconomicScenarios,
  listPlanningSnapshots,
  listReports,
  listReportBucketItems,
  parseAskCfsConversationRecord,
  parseAskCfsMessageRecord,
  parseEconomicScenarioRecord,
  parsePlanningSnapshotRecord,
  parseReportRecord,
  parseReportBucketItemRecord,
  ProductApiError,
  resetAskCfsConversation,
  updateAskCfsConversation,
  updateEconomicScenario,
  updatePlanningSnapshot,
  updateReport,
  updateReportBucketItem,
  versionEconomicScenario,
  versionPlanningSnapshot,
} from "@/lib/product/apiClient";
import type {
  AskCfsConversationCreateInput,
  AskCfsConversationRepository,
  AskCfsConversationUpdateInput,
  AskCfsMessageCreateInput,
  AskCfsMessageRecord,
  EconomicScenarioCreateInput,
  EconomicScenarioRepository,
  EconomicScenarioUpdateInput,
  PlanningSnapshotCreateInput,
  PlanningSnapshotRepository,
  PlanningSnapshotUpdateInput,
  ProductListOptions,
  ProductPagination,
  ProductRepositories,
  ProductRequestOptions,
  ProductResult,
  ProductUpdateOptions,
  ReportCreateInput,
  ReportBucketItemCreateInput,
  ReportBucketItemUpdateInput,
  ReportBucketRepository,
  ReportRepository,
  ReportUpdateInput,
} from "@/lib/product/types";

const DEMO_KEYS = {
  askConversations: "cfs-product-demo:ask-conversations:v1",
  askMessages: "cfs-product-demo:ask-messages:v1",
  economicScenarios: "cfs-product-demo:economic-scenarios:v1",
  planningSnapshots: "cfs-product-demo:planning-snapshots:v1",
  reports: "cfs-product-demo:reports:v1",
  reportBucket: "cfs-product-demo:report-bucket:v1",
} as const;

interface DemoRecord {
  archived_at: string | null;
  created_at: string;
  id: string;
  project_id: string | null;
  updated_at: string;
}

class DemoResourceStore<T extends DemoRecord> {
  constructor(
    private readonly key: string,
    private readonly parser: (value: unknown) => T,
  ) {}

  list(options: ProductListOptions = {}) {
    assertNotAborted(options.signal);
    let records = this.read().filter((record) =>
      options.status === "Archived" ? record.archived_at : !record.archived_at,
    );
    if (options.projectId) {
      records = records.filter((record) => record.project_id === options.projectId);
    }
    if (options.status && options.status !== "Archived") {
      records = records.filter((record) =>
        ["status", "review_status"].some(
          (field) => field in record && record[field as keyof T] === options.status,
        ),
      );
    }
    records.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
    const pagination = { page, pageSize, total: records.length };
    return demoResult(
      records.slice((page - 1) * pageSize, page * pageSize),
      pagination,
    );
  }

  get(id: string, options: ProductRequestOptions = {}) {
    assertNotAborted(options.signal);
    return demoResult(this.find(id));
  }

  create(record: T, options: ProductRequestOptions = {}) {
    assertNotAborted(options.signal);
    this.write([record, ...this.read()]);
    return demoResult(record);
  }

  update(
    id: string,
    options: ProductUpdateOptions,
    change: (current: T, now: string) => T,
  ) {
    assertNotAborted(options.signal);
    const records = this.read();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw notFound();
    const current = records[index];
    if (
      options.expectedUpdatedAt &&
      current.updated_at !== options.expectedUpdatedAt
    ) {
      throw new ProductApiError({
        code: "conflict",
        displayMessage: "The record changed after it was loaded.",
        kind: "conflict",
        status: 409,
      });
    }
    const next = this.parser(change(current, new Date().toISOString()));
    records[index] = next;
    this.write(records);
    return demoResult(next);
  }

  private find(id: string) {
    const record = this.read().find((candidate) => candidate.id === id);
    if (!record) throw notFound();
    return record;
  }

  private read() {
    const stored = demoStorage().getItem(this.key);
    if (!stored) return [];
    try {
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value)) throw new Error("not an array");
      return value.map(this.parser);
    } catch (error) {
      throw new ProductApiError({
        cause: error,
        code: "malformed_demo_record",
        displayMessage: "The session-only demo record library is invalid.",
        kind: "malformed",
      });
    }
  }

  private write(records: T[]) {
    try {
      demoStorage().setItem(this.key, JSON.stringify(records));
    } catch (error) {
      throw new ProductApiError({
        cause: error,
        code: "demo_storage_unavailable",
        displayMessage: "Session-only demo storage is unavailable.",
        kind: "unavailable",
      });
    }
  }
}

export class ApiPlanningSnapshotRepository implements PlanningSnapshotRepository {
  readonly provider = "api" as const;
  archive = archivePlanningSnapshot;
  create = createPlanningSnapshot;
  get = getPlanningSnapshot;
  list = listPlanningSnapshots;
  update = updatePlanningSnapshot;
  version = versionPlanningSnapshot;
}

export class DemoPlanningSnapshotRepository implements PlanningSnapshotRepository {
  readonly provider = "demo" as const;
  private readonly store = new DemoResourceStore(
    DEMO_KEYS.planningSnapshots,
    parsePlanningSnapshotRecord,
  );

  async archive(id: string, options: ProductRequestOptions = {}) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      archived_at: now,
      updated_at: now,
    }));
  }

  async create(input: PlanningSnapshotCreateInput, options: ProductRequestOptions = {}) {
    const now = new Date().toISOString();
    return this.store.create(
      {
        archived_at: null,
        created_at: now,
        created_by: null,
        current_version: 1,
        id: newId(),
        included_sections: input.included_sections ?? [],
        map_state: input.map_state ?? {},
        notes: input.notes ?? null,
        organization_id: null,
        payload: input.payload ?? {},
        project_id: input.project_id ?? null,
        review_status: input.review_status ?? "Draft",
        title: input.title,
        updated_at: now,
      },
      options,
    );
  }

  async get(id: string, options?: ProductRequestOptions) {
    return this.store.get(id, options);
  }

  async list(options?: ProductListOptions) {
    return this.store.list(options);
  }

  async update(
    id: string,
    input: PlanningSnapshotUpdateInput,
    options: ProductUpdateOptions = {},
  ) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      ...input,
      updated_at: now,
    }));
  }

  async version(
    id: string,
    _note: string | null = null,
    options: ProductRequestOptions = {},
  ) {
    void _note;
    return this.store.update(id, options, (current, now) => ({
      ...current,
      current_version: current.current_version + 1,
      updated_at: now,
    }));
  }
}

export class ApiEconomicScenarioRepository implements EconomicScenarioRepository {
  readonly provider = "api" as const;
  archive = archiveEconomicScenario;
  create = createEconomicScenario;
  get = getEconomicScenario;
  list = listEconomicScenarios;
  update = updateEconomicScenario;
  version = versionEconomicScenario;
}

export class DemoEconomicScenarioRepository implements EconomicScenarioRepository {
  readonly provider = "demo" as const;
  private readonly store = new DemoResourceStore(
    DEMO_KEYS.economicScenarios,
    parseEconomicScenarioRecord,
  );

  async archive(id: string, options: ProductRequestOptions = {}) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      archived_at: now,
      status: "Archived",
      updated_at: now,
    }));
  }

  async create(input: EconomicScenarioCreateInput, options: ProductRequestOptions = {}) {
    const now = new Date().toISOString();
    return this.store.create(
      {
        archived_at: null,
        assumptions: input.assumptions ?? {},
        comparison_set_id: input.comparison_set_id ?? null,
        created_at: now,
        created_by: null,
        current_version: 1,
        id: newId(),
        name: input.name,
        notes: input.notes ?? null,
        organization_id: null,
        outputs: input.outputs ?? {},
        payload: input.payload ?? {},
        project_id: input.project_id ?? null,
        status: input.status ?? "Draft",
        updated_at: now,
      },
      options,
    );
  }

  async get(id: string, options?: ProductRequestOptions) {
    return this.store.get(id, options);
  }

  async list(options?: ProductListOptions) {
    return this.store.list(options);
  }

  async update(
    id: string,
    input: EconomicScenarioUpdateInput,
    options: ProductUpdateOptions = {},
  ) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      ...input,
      updated_at: now,
    }));
  }

  async version(
    id: string,
    _note: string | null = null,
    options: ProductRequestOptions = {},
  ) {
    void _note;
    return this.store.update(id, options, (current, now) => ({
      ...current,
      current_version: current.current_version + 1,
      updated_at: now,
    }));
  }
}

export class ApiReportBucketRepository implements ReportBucketRepository {
  readonly provider = "api" as const;
  archive = archiveReportBucketItem;
  create = createReportBucketItem;
  get = getReportBucketItem;
  list = listReportBucketItems;
  update = updateReportBucketItem;
}

export class ApiReportRepository implements ReportRepository {
  readonly provider = "api" as const;
  archive = archiveReport;
  create = createReport;
  get = getReport;
  list = listReports;
  update = updateReport;
}

export class DemoReportRepository implements ReportRepository {
  readonly provider = "demo" as const;
  private readonly store = new DemoResourceStore(
    DEMO_KEYS.reports,
    parseReportRecord,
  );

  async archive(id: string, options: ProductRequestOptions = {}) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      archived_at: now,
      updated_at: now,
    }));
  }

  async create(input: ReportCreateInput, options: ProductRequestOptions = {}) {
    const now = new Date().toISOString();
    return this.store.create(
      {
        archived_at: null,
        created_at: now,
        created_by: null,
        id: newId(),
        organization_id: null,
        payload: input.payload ?? {},
        project_id: input.project_id ?? null,
        report_type: input.report_type,
        status: input.status ?? "Draft",
        title: input.title,
        updated_at: now,
      },
      options,
    );
  }

  async get(id: string, options?: ProductRequestOptions) {
    return this.store.get(id, options);
  }

  async list(options?: ProductListOptions) {
    return this.store.list(options);
  }

  async update(
    id: string,
    input: ReportUpdateInput,
    options: ProductUpdateOptions = {},
  ) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      ...input,
      updated_at: now,
    }));
  }
}

export class DemoReportBucketRepository implements ReportBucketRepository {
  readonly provider = "demo" as const;
  private readonly store = new DemoResourceStore(
    DEMO_KEYS.reportBucket,
    parseReportBucketItemRecord,
  );

  async archive(id: string, options: ProductRequestOptions = {}) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      archived_at: now,
      updated_at: now,
    }));
  }

  async create(input: ReportBucketItemCreateInput, options: ProductRequestOptions = {}) {
    const now = new Date().toISOString();
    return this.store.create(
      {
        archived_at: null,
        created_at: now,
        created_by: null,
        id: newId(),
        include_in_print: input.include_in_print ?? true,
        object_id: input.object_id,
        object_type: input.object_type,
        organization_id: null,
        payload: input.payload ?? {},
        position: input.position ?? null,
        project_id: input.project_id ?? null,
        report_id: input.report_id ?? null,
        title: input.title,
        updated_at: now,
      },
      options,
    );
  }

  async get(id: string, options?: ProductRequestOptions) {
    return this.store.get(id, options);
  }

  async list(options?: ProductListOptions) {
    return this.store.list(options);
  }

  async update(
    id: string,
    input: ReportBucketItemUpdateInput,
    options: ProductUpdateOptions = {},
  ) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      ...input,
      updated_at: now,
    }));
  }
}

export class ApiAskCfsConversationRepository implements AskCfsConversationRepository {
  readonly provider = "api" as const;
  addMessage = addAskCfsMessage;
  archive = archiveAskCfsConversation;
  create = createAskCfsConversation;
  get = getAskCfsConversation;
  list = listAskCfsConversations;
  listMessages = listAskCfsMessages;
  reset = resetAskCfsConversation;
  update = updateAskCfsConversation;
}

export class DemoAskCfsConversationRepository implements AskCfsConversationRepository {
  readonly provider = "demo" as const;
  private readonly store = new DemoResourceStore(
    DEMO_KEYS.askConversations,
    parseAskCfsConversationRecord,
  );

  async addMessage(
    conversationId: string,
    input: AskCfsMessageCreateInput,
    options: ProductRequestOptions = {},
  ) {
    assertNotAborted(options.signal);
    this.store.get(conversationId, options);
    const messages = readDemoMessages();
    const message = parseAskCfsMessageRecord({
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      entity_context: input.entity_context ?? {},
      id: newId(),
      prompt_version: input.prompt_version ?? null,
      provider_mode: input.provider_mode ?? "none",
      role: input.role,
      safe_answer_summary: input.safe_answer_summary ?? null,
      safe_question: input.safe_question ?? null,
      safety_status: input.safety_status ?? "accepted",
    });
    writeDemoMessages([...messages, message]);
    return demoResult(message);
  }

  async archive(id: string, options: ProductRequestOptions = {}) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      archived_at: now,
      updated_at: now,
    }));
  }

  async create(input: AskCfsConversationCreateInput, options: ProductRequestOptions = {}) {
    const now = new Date().toISOString();
    return this.store.create(
      {
        archived_at: null,
        created_at: now,
        id: newId(),
        organization_id: null,
        product_context: input.product_context ?? {},
        project_id: input.project_id ?? null,
        reset_at: null,
        retention_until: input.retention_until ?? null,
        title: input.title,
        updated_at: now,
        user_id: null,
      },
      options,
    );
  }

  async get(id: string, options?: ProductRequestOptions) {
    return this.store.get(id, options);
  }

  async list(options?: ProductListOptions) {
    return this.store.list(options);
  }

  async listMessages(conversationId: string, options: ProductListOptions = {}) {
    assertNotAborted(options.signal);
    this.store.get(conversationId, options);
    const messages = readDemoMessages().filter(
      (message) => message.conversation_id === conversationId,
    );
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
    return demoResult(
      messages.slice((page - 1) * pageSize, page * pageSize),
      { page, pageSize, total: messages.length },
    );
  }

  async reset(id: string, options: ProductRequestOptions = {}) {
    const result = this.store.update(id, options, (current, now) => ({
      ...current,
      reset_at: now,
      updated_at: now,
    }));
    writeDemoMessages(
      readDemoMessages().filter((message) => message.conversation_id !== id),
    );
    return result;
  }

  async update(
    id: string,
    input: AskCfsConversationUpdateInput,
    options: ProductUpdateOptions = {},
  ) {
    return this.store.update(id, options, (current, now) => ({
      ...current,
      ...input,
      updated_at: now,
    }));
  }
}

const demoRepositories: ProductRepositories = {
  askCfsConversations: new DemoAskCfsConversationRepository(),
  economicScenarios: new DemoEconomicScenarioRepository(),
  planningSnapshots: new DemoPlanningSnapshotRepository(),
  reports: new DemoReportRepository(),
  reportBucket: new DemoReportBucketRepository(),
};
const apiRepositories: ProductRepositories = {
  askCfsConversations: new ApiAskCfsConversationRepository(),
  economicScenarios: new ApiEconomicScenarioRepository(),
  planningSnapshots: new ApiPlanningSnapshotRepository(),
  reports: new ApiReportRepository(),
  reportBucket: new ApiReportBucketRepository(),
};

export function getProductRepositories(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return runtimeMode === "demo" ? demoRepositories : apiRepositories;
}

export function getPlanningSnapshotRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return getProductRepositories(runtimeMode).planningSnapshots;
}

export function getEconomicScenarioRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return getProductRepositories(runtimeMode).economicScenarios;
}

export function getReportBucketRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return getProductRepositories(runtimeMode).reportBucket;
}

export function getReportRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return getProductRepositories(runtimeMode).reports;
}

export function getAskCfsConversationRepository(
  runtimeMode: CfsRuntimeMode = CFS_RUNTIME_CONFIG.runtimeMode,
) {
  return getProductRepositories(runtimeMode).askCfsConversations;
}

function readDemoMessages() {
  const stored = demoStorage().getItem(DEMO_KEYS.askMessages);
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) throw new Error("not an array");
    return value.map(parseAskCfsMessageRecord);
  } catch (error) {
    throw new ProductApiError({
      cause: error,
      code: "malformed_demo_record",
      displayMessage: "The session-only Ask CFS message library is invalid.",
      kind: "malformed",
    });
  }
}

function writeDemoMessages(messages: AskCfsMessageRecord[]) {
  try {
    if (messages.length) {
      demoStorage().setItem(DEMO_KEYS.askMessages, JSON.stringify(messages));
    } else {
      demoStorage().removeItem(DEMO_KEYS.askMessages);
    }
  } catch (error) {
    throw new ProductApiError({
      cause: error,
      code: "demo_storage_unavailable",
      displayMessage: "Session-only demo storage is unavailable.",
      kind: "unavailable",
    });
  }
}

function demoStorage() {
  if (typeof window === "undefined") {
    throw new ProductApiError({
      code: "demo_storage_unavailable",
      displayMessage: "Session-only demo storage is available only in the browser.",
      kind: "unavailable",
    });
  }
  return window.sessionStorage;
}

function demoResult<T>(
  data: T,
  pagination?: ProductPagination,
): ProductResult<T> {
  return {
    data,
    ...(pagination ? { pagination } : {}),
    provenance: {
      apiVersion: "v1",
      dataProvider: "static",
      runtimeMode: "demo",
    },
    requestId: `demo-${newId()}`,
    timestamp: new Date().toISOString(),
  };
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ProductApiError({
      code: "cancelled",
      displayMessage: "The Product V1 request was cancelled.",
      kind: "cancelled",
    });
  }
}

function notFound() {
  return new ProductApiError({
    code: "not_found",
    displayMessage: "The Product V1 record was not found.",
    kind: "not_found",
    status: 404,
  });
}

function newId() {
  return globalThis.crypto.randomUUID();
}
