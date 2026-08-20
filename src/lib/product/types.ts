export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ProductRuntimeMode = "demo" | "enterprise" | "local";
export type ProductDataProvider = "enterprise_api" | "local_api" | "static";

export interface ProductProvenance {
  apiVersion: "v1";
  dataProvider: ProductDataProvider;
  runtimeMode: ProductRuntimeMode;
}

export interface ProductPagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductResult<T> {
  data: T;
  pagination?: ProductPagination;
  provenance: ProductProvenance;
  requestId: string;
  timestamp: string;
}

export type ProductRole =
  | "Administrator"
  | "Analyst"
  | "Data Steward"
  | "Planner"
  | "Report Author"
  | "Viewer";

export type ProductPermission =
  | "administration:write"
  | "artifacts:download"
  | "ask_cfs:use"
  | "audit:read"
  | "data:read"
  | "economics:write"
  | "ingestion:apply"
  | "ingestion:dry_run"
  | "investments:write"
  | "master_data:export"
  | "master_data:view"
  | "planning:write"
  | "projects:write"
  | "reports:read"
  | "reports:write"
  | "sources:read"
  | "sources:write";

export interface ProductPrincipal {
  authenticated: boolean;
  organization_id: string | null;
  permissions: ProductPermission[];
  roles: ProductRole[];
  subject: string;
  user_id: string | null;
}

export interface ProductRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ProductListOptions extends ProductRequestOptions {
  page?: number;
  pageSize?: number;
  projectId?: string;
  sort?: string;
  status?: string;
}

export interface ProductUpdateOptions extends ProductRequestOptions {
  expectedUpdatedAt?: string | null;
}

export interface PlanningSnapshotRecord {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  current_version: number;
  id: string;
  included_sections: string[];
  map_state: JsonObject;
  notes: string | null;
  organization_id: string | null;
  payload: JsonObject;
  project_id: string | null;
  review_status: string;
  title: string;
  updated_at: string;
}

export interface PlanningSnapshotCreateInput {
  included_sections?: string[];
  map_state?: JsonObject;
  notes?: string | null;
  payload?: JsonObject;
  project_id?: string | null;
  review_status?: string;
  title: string;
}

export type PlanningSnapshotUpdateInput = Partial<PlanningSnapshotCreateInput>;

export interface EconomicScenarioRecord {
  archived_at: string | null;
  assumptions: JsonObject;
  comparison_set_id: string | null;
  created_at: string;
  created_by: string | null;
  current_version: number;
  id: string;
  name: string;
  notes: string | null;
  organization_id: string | null;
  outputs: JsonObject;
  payload: JsonObject;
  project_id: string | null;
  status: string;
  updated_at: string;
}

export interface EconomicScenarioCreateInput {
  assumptions?: JsonObject;
  comparison_set_id?: string | null;
  name: string;
  notes?: string | null;
  outputs?: JsonObject;
  payload?: JsonObject;
  project_id?: string | null;
  status?: string;
}

export type EconomicScenarioUpdateInput = Partial<EconomicScenarioCreateInput>;

export interface ReportRecord {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  id: string;
  organization_id: string | null;
  payload: JsonObject;
  project_id: string | null;
  report_type: string;
  status: string;
  title: string;
  updated_at: string;
}

export interface ReportCreateInput {
  payload?: JsonObject;
  project_id?: string | null;
  report_type: string;
  status?: string;
  title: string;
}

export type ReportUpdateInput = Partial<ReportCreateInput>;

export interface ReportBucketItemRecord {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  id: string;
  include_in_print: boolean;
  object_id: string;
  object_type: string;
  organization_id: string | null;
  payload: JsonObject;
  position: number | null;
  project_id: string | null;
  report_id: string | null;
  title: string;
  updated_at: string;
}

export interface ReportBucketItemCreateInput {
  include_in_print?: boolean;
  object_id: string;
  object_type: string;
  payload?: JsonObject;
  position?: number | null;
  project_id?: string | null;
  report_id?: string | null;
  title: string;
}

export type ReportBucketItemUpdateInput = Partial<ReportBucketItemCreateInput>;

export interface AskCfsConversationRecord {
  archived_at: string | null;
  created_at: string;
  id: string;
  organization_id: string | null;
  product_context: JsonObject;
  project_id: string | null;
  reset_at: string | null;
  retention_until: string | null;
  title: string;
  updated_at: string;
  user_id: string | null;
}

export interface AskCfsConversationCreateInput {
  product_context?: JsonObject;
  project_id?: string | null;
  retention_until?: string | null;
  title: string;
}

export type AskCfsConversationUpdateInput = Partial<AskCfsConversationCreateInput>;

export type AskCfsMessageRole = "assistant" | "user";

export interface AskCfsMessageRecord {
  conversation_id: string;
  created_at: string;
  entity_context: JsonObject;
  id: string;
  prompt_version: string | null;
  provider_mode: string;
  role: AskCfsMessageRole;
  safe_answer_summary: string | null;
  safe_question: string | null;
  safety_status: string;
}

export interface AskCfsMessageCreateInput {
  entity_context?: JsonObject;
  prompt_version?: string | null;
  provider_mode?: string;
  role: AskCfsMessageRole;
  safe_answer_summary?: string | null;
  safe_question?: string | null;
  safety_status?: string;
}

export interface PlanningSnapshotRepository {
  readonly provider: "api" | "demo";
  archive(id: string, options?: ProductRequestOptions): Promise<ProductResult<PlanningSnapshotRecord>>;
  create(input: PlanningSnapshotCreateInput, options?: ProductRequestOptions): Promise<ProductResult<PlanningSnapshotRecord>>;
  get(id: string, options?: ProductRequestOptions): Promise<ProductResult<PlanningSnapshotRecord>>;
  list(options?: ProductListOptions): Promise<ProductResult<PlanningSnapshotRecord[]>>;
  update(id: string, input: PlanningSnapshotUpdateInput, options?: ProductUpdateOptions): Promise<ProductResult<PlanningSnapshotRecord>>;
  version(id: string, note?: string | null, options?: ProductRequestOptions): Promise<ProductResult<PlanningSnapshotRecord>>;
}

export interface EconomicScenarioRepository {
  readonly provider: "api" | "demo";
  archive(id: string, options?: ProductRequestOptions): Promise<ProductResult<EconomicScenarioRecord>>;
  create(input: EconomicScenarioCreateInput, options?: ProductRequestOptions): Promise<ProductResult<EconomicScenarioRecord>>;
  get(id: string, options?: ProductRequestOptions): Promise<ProductResult<EconomicScenarioRecord>>;
  list(options?: ProductListOptions): Promise<ProductResult<EconomicScenarioRecord[]>>;
  update(id: string, input: EconomicScenarioUpdateInput, options?: ProductUpdateOptions): Promise<ProductResult<EconomicScenarioRecord>>;
  version(id: string, note?: string | null, options?: ProductRequestOptions): Promise<ProductResult<EconomicScenarioRecord>>;
}

export interface ReportBucketRepository {
  readonly provider: "api" | "demo";
  archive(id: string, options?: ProductRequestOptions): Promise<ProductResult<ReportBucketItemRecord>>;
  create(input: ReportBucketItemCreateInput, options?: ProductRequestOptions): Promise<ProductResult<ReportBucketItemRecord>>;
  get(id: string, options?: ProductRequestOptions): Promise<ProductResult<ReportBucketItemRecord>>;
  list(options?: ProductListOptions): Promise<ProductResult<ReportBucketItemRecord[]>>;
  update(id: string, input: ReportBucketItemUpdateInput, options?: ProductUpdateOptions): Promise<ProductResult<ReportBucketItemRecord>>;
}

export interface ReportRepository {
  readonly provider: "api" | "demo";
  archive(id: string, options?: ProductRequestOptions): Promise<ProductResult<ReportRecord>>;
  create(input: ReportCreateInput, options?: ProductRequestOptions): Promise<ProductResult<ReportRecord>>;
  get(id: string, options?: ProductRequestOptions): Promise<ProductResult<ReportRecord>>;
  list(options?: ProductListOptions): Promise<ProductResult<ReportRecord[]>>;
  update(id: string, input: ReportUpdateInput, options?: ProductUpdateOptions): Promise<ProductResult<ReportRecord>>;
}

export interface AskCfsConversationRepository {
  readonly provider: "api" | "demo";
  addMessage(conversationId: string, input: AskCfsMessageCreateInput, options?: ProductRequestOptions): Promise<ProductResult<AskCfsMessageRecord>>;
  archive(id: string, options?: ProductRequestOptions): Promise<ProductResult<AskCfsConversationRecord>>;
  create(input: AskCfsConversationCreateInput, options?: ProductRequestOptions): Promise<ProductResult<AskCfsConversationRecord>>;
  get(id: string, options?: ProductRequestOptions): Promise<ProductResult<AskCfsConversationRecord>>;
  list(options?: ProductListOptions): Promise<ProductResult<AskCfsConversationRecord[]>>;
  listMessages(conversationId: string, options?: ProductListOptions): Promise<ProductResult<AskCfsMessageRecord[]>>;
  reset(id: string, options?: ProductRequestOptions): Promise<ProductResult<AskCfsConversationRecord>>;
  update(id: string, input: AskCfsConversationUpdateInput, options?: ProductUpdateOptions): Promise<ProductResult<AskCfsConversationRecord>>;
}

export interface ProductRepositories {
  askCfsConversations: AskCfsConversationRepository;
  economicScenarios: EconomicScenarioRepository;
  planningSnapshots: PlanningSnapshotRepository;
  reports: ReportRepository;
  reportBucket: ReportBucketRepository;
}
