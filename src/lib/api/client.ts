export type ApiQueryValue = boolean | number | string | null | undefined;

export type ApiQueryParams = Record<string, ApiQueryValue>;

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiClientError extends Error {
  payload: unknown;
  status: number | null;
  url: string;

  constructor(message: string, url: string, status: number | null, payload?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.payload = payload;
    this.status = status;
    this.url = url;
  }
}

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT_MS = 8000;

export const CFS_API_BASE_URL =
  process.env.NEXT_PUBLIC_CFS_API_BASE_URL ?? DEFAULT_BACKEND_BASE_URL;

export const USE_BACKEND_API =
  process.env.NEXT_PUBLIC_USE_BACKEND_API === "true";

function buildApiUrl(path: string, params?: ApiQueryParams) {
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
  const url = buildApiUrl(path, params);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const abortFromParentSignal = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", abortFromParentSignal, {
        once: true,
      });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      method: "GET",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiClientError(
        `CFS API request failed with status ${response.status}`,
        url,
        response.status,
        payload,
      );
    }

    return payload as TResponse;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "CFS API request timed out or was cancelled"
        : "CFS API request failed";

    throw new ApiClientError(message, url, null, error);
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromParentSignal);
  }
}
