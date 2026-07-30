import { apiGet, type ApiRequestOptions } from "@/lib/api/client";

export interface ApiRootStatusResponse {
  api_groups?: Record<string, string>;
  database_health?: string;
  docs?: string;
  health?: string;
  service?: string;
  status?: string;
  version?: string;
}

export interface ApiHealthResponse {
  status?: string;
}

export interface ApiDatabaseHealthResponse {
  database?: string;
}

export interface ApiReadyResponse {
  database?: string;
  status?: string;
}

export interface ApiAiStatusResponse {
  ai_enabled?: boolean;
  api_key_configured?: boolean;
  backend_status?: string;
  configured_provider?: "none" | "openai";
  deterministic_fallback_available?: boolean;
  model_configured?: boolean;
}

export function getApiRootStatus(options?: ApiRequestOptions) {
  return apiGet<ApiRootStatusResponse>("/", undefined, options);
}

export function getApiHealth(options?: ApiRequestOptions) {
  return apiGet<ApiHealthResponse>("/health", undefined, options);
}

export function getApiDatabaseHealth(options?: ApiRequestOptions) {
  return apiGet<ApiDatabaseHealthResponse>(
    "/health/database",
    undefined,
    options,
  );
}

export function getApiReady(options?: ApiRequestOptions) {
  return apiGet<ApiReadyResponse>("/health/ready", undefined, options);
}

export function getApiAiStatus(options?: ApiRequestOptions) {
  return apiGet<ApiAiStatusResponse>("/ai/status", undefined, options);
}
