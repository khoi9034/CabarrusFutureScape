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
