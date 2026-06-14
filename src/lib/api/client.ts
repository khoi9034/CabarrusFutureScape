export type ApiQueryValue = boolean | number | string | null | undefined;

export type ApiQueryParams = Record<string, ApiQueryValue>;

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
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
  status: number | null;
  url: string;

  constructor({
    displayMessage,
    kind,
    message,
    payload,
    status,
    url,
  }: {
    displayMessage: string;
    kind: ApiClientErrorKind;
    message: string;
    payload?: unknown;
    status: number | null;
    url: string;
  }) {
    super(message);
    this.name = "ApiClientError";
    this.displayMessage = displayMessage;
    this.kind = kind;
    this.payload = payload;
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

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT_MS = 20000;

export const CFS_API_BASE_URL =
  process.env.NEXT_PUBLIC_CFS_API_BASE_URL ?? DEFAULT_BACKEND_BASE_URL;

export const USE_BACKEND_API =
  process.env.NEXT_PUBLIC_USE_BACKEND_API === "true";

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
  const url = buildApiUrl(path, params);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;

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

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      method: "GET",
      signal: controller.signal,
    });

    const payload = await parseApiPayload(response, url);

    if (!response.ok) {
      throw new ApiClientError({
        displayMessage: getHttpDisplayMessage(response.status, url),
        kind: "http",
        message: `CFS API request failed with status ${response.status} for ${url}`,
        payload,
        status: response.status,
        url,
      });
    }

    return payload as TResponse;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      const kind = timedOut ? "timeout" : "cancelled";
      throw new ApiClientError({
        displayMessage: timedOut
          ? "CFS API request timed out. Check that FastAPI is running on 127.0.0.1:8000."
          : "CFS API request was cancelled.",
        kind,
        message: timedOut
          ? `CFS API request timed out for ${url}`
          : `CFS API request was cancelled for ${url}`,
        payload: error,
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
      status: null,
      url,
    });
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromParentSignal);
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

function getPathForDisplay(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
