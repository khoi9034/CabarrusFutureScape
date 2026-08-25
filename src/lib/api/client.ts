import {
  CFS_RUNTIME_CONFIG,
  type CfsDataProvider,
  type CfsRuntimeMode,
} from "@/lib/runtimeConfig";

export type ApiQueryValue = boolean | number | string | null | undefined;

export type ApiQueryParams = Record<string, ApiQueryValue>;

export interface ApiRequestOptions {
  headers?: HeadersInit;
  keepalive?: boolean;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiRequestConfig extends ApiRequestOptions {
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  params?: ApiQueryParams;
}

export type ApiClientErrorKind =
  | "cancelled"
  | "http"
  | "malformed"
  | "network"
  | "timeout"
  | "unknown";

export class ApiClientError extends Error {
  displayMessage: string;
  kind: ApiClientErrorKind;
  payload: unknown;
  requestId: string | null;
  status: number | null;
  url: string;

  constructor({
    displayMessage,
    kind,
    message,
    payload,
    requestId,
    status,
    url,
  }: {
    displayMessage: string;
    kind: ApiClientErrorKind;
    message: string;
    payload?: unknown;
    requestId?: string | null;
    status: number | null;
    url: string;
  }) {
    super(message);
    this.name = "ApiClientError";
    this.displayMessage = displayMessage;
    this.kind = kind;
    this.payload = payload;
    this.requestId = requestId ?? null;
    this.status = status;
    this.url = url;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isRetryable() {
    return (
      this.kind === "network" ||
      this.kind === "timeout" ||
      this.status === 408 ||
      this.status === 429 ||
      (this.status !== null && this.status >= 500)
    );
  }
}

const LOCAL_BACKEND_BASE_URL = "http://127.0.0.1:8000";
const PRODUCTION_BACKEND_BASE_URL = "https://cfs-api.example.invalid";
const DEFAULT_BACKEND_BASE_URL =
  process.env.NODE_ENV === "production"
    ? PRODUCTION_BACKEND_BASE_URL
    : LOCAL_BACKEND_BASE_URL;
const DEFAULT_TIMEOUT_MS = 20000;
const API_TIMEOUT_DISPLAY_MESSAGE =
  process.env.NODE_ENV === "production"
    ? "CFS API request timed out. Confirm the deployed API base URL and backend health."
    : "CFS API request timed out. Check that FastAPI is running on 127.0.0.1:8000.";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_CFS_API_BASE_URL?.trim();
if (CFS_RUNTIME_CONFIG.runtimeMode === "enterprise" && !configuredApiBaseUrl) {
  throw new Error(
    "Enterprise mode requires NEXT_PUBLIC_CFS_API_BASE_URL for the browser-safe API endpoint.",
  );
}
export const CFS_API_BASE_URL =
  configuredApiBaseUrl || DEFAULT_BACKEND_BASE_URL;

export type CfsDeploymentMode = "auto" | "demo" | "live";
export type { CfsDataProvider, CfsRuntimeMode };
export type CfsDataOrigin =
  | "derived_local_metric"
  | "enterprise_api"
  | "local_api"
  | "sanitized_demo_extract"
  | "session_only_demo"
  | "static_geographic_context"
  | "unavailable";

export interface CfsDataProvenanceEvent {
  data_origin: CfsDataOrigin;
  dataset_id: string;
  domain: string;
  runtime_mode: CfsRuntimeMode;
  served_at: string;
}

export type CfsTechnicalEventName =
  | "api_readiness"
  | "ask_cfs_request"
  | "data_adapter_used"
  | "failed_domain_load"
  | "map_fallback"
  | "map_interaction_failed"
  | "map_renderer_selected"
  | "map_retry"
  | "powerbi_export"
  | "provider_fallback"
  | "reference_basemap_unavailable"
  | "reference_basemap_fallback"
  | "report_generation";

export interface CfsTechnicalEvent {
  detail: Record<string, boolean | number | string | null>;
  event: CfsTechnicalEventName;
  occurred_at: string;
}

declare global {
  interface Window {
    __cfsDataProvenance?: CfsDataProvenanceEvent[];
    __cfsTechnicalEvents?: CfsTechnicalEvent[];
  }
}

export const CFS_DEPLOYMENT_MODE: CfsDeploymentMode =
  CFS_RUNTIME_CONFIG.runtimeMode === "demo" ? "demo" : "live";
export const CFS_RUNTIME_MODE = CFS_RUNTIME_CONFIG.runtimeMode;
export const IS_DEMO_MODE = CFS_RUNTIME_MODE === "demo";
export const IS_AUTO_MODE =
  process.env.NEXT_PUBLIC_CFS_DEPLOYMENT_MODE === "auto";
export const IS_ENTERPRISE_MODE = CFS_RUNTIME_MODE === "enterprise";

export const USE_BACKEND_API = CFS_RUNTIME_CONFIG.useBackendApi;
export const USE_DEMO_DATA = IS_DEMO_MODE;
export const USE_INTERACTIVE_MAP = true;
export const CFS_DATA_PROVIDER = CFS_RUNTIME_CONFIG.dataProvider;
export const CFS_AI_PROVIDER = CFS_RUNTIME_CONFIG.aiProvider;
export const CFS_AUTH_MODE = CFS_RUNTIME_CONFIG.authMode;
export const CFS_ARTIFACT_PROVIDER = CFS_RUNTIME_CONFIG.artifactProvider;
export const CFS_JOB_PROVIDER = CFS_RUNTIME_CONFIG.jobProvider;

export function buildApiUrl(path: string, params?: ApiQueryParams) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, CFS_API_BASE_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

export async function apiGet<TResponse>(
  path: string,
  params?: ApiQueryParams,
  options: ApiRequestOptions = {},
) {
  return apiRequest<TResponse>(path, { ...options, method: "GET", params });
}

export async function apiPost<TResponse>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
) {
  return apiRequest<TResponse>(path, { ...options, body, method: "POST" });
}

export async function apiPatch<TResponse>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
) {
  return apiRequest<TResponse>(path, { ...options, body, method: "PATCH" });
}

export async function apiDelete<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
) {
  return apiRequest<TResponse>(path, { ...options, method: "DELETE" });
}

export async function apiRequest<TResponse>(
  path: string,
  {
    body,
    headers: requestHeaders,
    keepalive,
    method = "GET",
    params,
    requestId: suppliedRequestId,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: ApiRequestConfig = {},
) {
  const url = buildApiUrl(path, params);
  const controller = new AbortController();
  const requestId = suppliedRequestId ?? createRequestId();
  let timedOut = false;

  const abortFromParentSignal = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromParentSignal, {
        once: true,
      });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(requestHeaders);
    headers.set("Accept", "application/json");
    headers.set("X-Request-ID", requestId);
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, {
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers,
      keepalive,
      method,
      signal: controller.signal,
    });

    const payload = await parseApiPayload(response, url);
    const responseRequestId =
      response.headers.get("x-request-id") ??
      requestIdFromPayload(payload) ??
      requestId;

    if (!response.ok) {
      throw new ApiClientError({
        displayMessage:
          errorMessageFromPayload(payload) ??
          getHttpDisplayMessage(response.status, url),
        kind: "http",
        message: `CFS API request failed with status ${response.status} for ${url}`,
        payload,
        requestId: responseRequestId,
        status: response.status,
        url,
      });
    }

    recordDataProvenance(
      path,
      CFS_DATA_PROVIDER === "enterprise_api" ? "enterprise_api" : "local_api",
    );
    return payload as TResponse;
  } catch (error) {
    recordDataProvenance(path, "unavailable");
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      const kind = timedOut ? "timeout" : "cancelled";
      throw new ApiClientError({
        displayMessage: timedOut
          ? API_TIMEOUT_DISPLAY_MESSAGE
          : "CFS API request was cancelled.",
        kind,
        message: timedOut
          ? `CFS API request timed out for ${url}`
          : `CFS API request was cancelled for ${url}`,
        payload: error,
        requestId,
        status: null,
        url,
      });
    }

    const kind =
      error instanceof TypeError && error.message.toLowerCase().includes("fetch")
        ? "network"
        : "unknown";
    throw new ApiClientError({
      displayMessage:
        kind === "network"
          ? "CFS API is unreachable. Confirm the backend is running and the API base URL is correct."
          : "CFS API request failed unexpectedly.",
      kind,
      message: `CFS API request failed for ${url}`,
      payload: error,
      requestId,
      status: null,
      url,
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParentSignal);
  }
}

export function getApiErrorDisplayMessage(
  error: unknown,
  fallback = "CFS API data is unavailable.",
) {
  if (error instanceof ApiClientError) {
    return error.displayMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function recordDataProvenance(
  datasetId: string,
  dataOrigin: CfsDataOrigin,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = datasetId.replace(/^https?:\/\/[^/]+/i, "");
  const domain = normalized.split("/").filter(Boolean)[0] ?? "unknown";
  const events = window.__cfsDataProvenance ?? [];
  window.__cfsDataProvenance = [
    ...events,
    {
      data_origin: dataOrigin,
      dataset_id: normalized,
      domain,
      runtime_mode: CFS_RUNTIME_MODE,
      served_at: new Date().toISOString(),
    },
  ].slice(-200);
  recordTechnicalEvent(
    dataOrigin === "unavailable"
      ? "failed_domain_load"
      : "data_adapter_used",
    {
      data_origin: dataOrigin,
      dataset_id: normalized,
      domain,
      runtime_mode: CFS_RUNTIME_MODE,
    },
  );
}

export function recordTechnicalEvent(
  event: CfsTechnicalEventName,
  detail: CfsTechnicalEvent["detail"] = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  const events = window.__cfsTechnicalEvents ?? [];
  window.__cfsTechnicalEvents = [
    ...events,
    {
      detail,
      event,
      occurred_at: new Date().toISOString(),
    },
  ].slice(-200);
}

function getHttpDisplayMessage(status: number, url: string) {
  const path = getPathForDisplay(url);

  if (status === 404) {
    return `No CFS API record was found for ${path}.`;
  }

  if (status === 408 || status === 504) {
    return `CFS API timed out while loading ${path}.`;
  }

  if (status === 429) {
    return `CFS API is rate limiting requests for ${path}.`;
  }

  if (status >= 500) {
    return `CFS API service error while loading ${path}.`;
  }

  if (status === 401 || status === 403) {
    return `CFS API rejected access to ${path}.`;
  }

  return `CFS API request failed with status ${status} for ${path}.`;
}

async function parseApiPayload(response: Response, url: string) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    if (response.ok) {
      throw new ApiClientError({
        displayMessage: `CFS API returned a non-JSON response for ${getPathForDisplay(url)}.`,
        kind: "malformed",
        message: `CFS API returned non-JSON response for ${url}`,
        payload: text,
        status: response.status,
        url,
      });
    }

    return text;
  }

  try {
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiClientError({
      displayMessage: `CFS API returned malformed JSON for ${getPathForDisplay(url)}.`,
      kind: "malformed",
      message: `CFS API returned malformed JSON for ${url}`,
      payload: error,
      status: response.status,
      url,
    });
  }
}

function createRequestId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `cfs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestIdFromPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const rootRequestId = safeString(payload.request_id);
  if (rootRequestId) {
    return rootRequestId;
  }

  return isRecord(payload.error)
    ? safeString(payload.error.request_id)
    : null;
}

function errorMessageFromPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.error)) {
    return safeString(payload.error.message);
  }

  return safeString(payload.message);
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPathForDisplay(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
