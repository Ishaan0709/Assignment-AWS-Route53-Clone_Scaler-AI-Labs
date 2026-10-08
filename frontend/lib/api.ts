import type { ApiErrorBody } from "@/types/api";

/** Query-string values the client knows how to serialize. */
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-serialized unless it is `FormData`. */
  body?: unknown;
  query?: QueryParams;
  /** When `false` a 401 only throws; it does not send the browser to `/login`. */
  redirectOn401?: boolean;
  signal?: AbortSignal;
}

/**
 * Error thrown for every non-2xx response. Mirrors the backend's
 * `{ error: { code, message, fields } }` body so UI code can map field errors
 * straight onto form inputs.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** Error for the given form field, if the server reported one. */
  fieldError(name: string): string | undefined {
    return this.fields[name];
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const LOGIN_PATH = "/login";

type UnauthorizedHandler = (currentPath: string) => void;

function defaultUnauthorizedHandler(currentPath: string): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith(LOGIN_PATH)) return;
  const next = encodeURIComponent(currentPath);
  window.location.assign(`${LOGIN_PATH}?next=${next}`);
}

let onUnauthorized: UnauthorizedHandler = defaultUnauthorizedHandler;

/** Override the 401 behaviour (used by tests and by the router-aware app shell). */
export function configureApi(options: { onUnauthorized?: UnauthorizedHandler }): void {
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
}

export function resetApiConfig(): void {
  onUnauthorized = defaultUnauthorizedHandler;
}

export function buildQuery(params: QueryParams | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function isErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== "object" || payload === null) return false;
  const error = (payload as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (isErrorBody(payload)) {
    const { code, message, fields } = payload.error;
    return new ApiError(response.status, code, message, fields ?? {});
  }
  const fallback = response.statusText || `Request failed with status ${response.status}`;
  return new ApiError(response.status, "HttpError", fallback);
}

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Typed `fetch` wrapper. Always sends the session cookie, serializes JSON,
 * parses the error envelope into `ApiError`, and redirects to `/login` on 401.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, redirectOn401 = true, signal } = options;
  const headers = new Headers({ Accept: "application/json" });
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${path}${buildQuery(query)}`, {
      method,
      headers,
      body: payload,
      credentials: "include",
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "NetworkError", "Could not reach the server. Check your connection.");
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401 && redirectOn401) onUnauthorized(currentPath());
    throw error;
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Fetch a non-JSON body (used by the zone-file export). */
export async function apiFetchBlob(
  path: string,
  query?: QueryParams,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(`${path}${buildQuery(query)}`, { credentials: "include" });
  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401) onUnauthorized(currentPath());
    throw error;
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

export const api = {
  get: <T>(path: string, query?: QueryParams, options?: Omit<RequestOptions, "query" | "method">) =>
    apiFetch<T>(path, { ...options, method: "GET", query }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(
    path: string,
    query?: QueryParams,
    options?: Omit<RequestOptions, "query" | "method">,
  ) => apiFetch<T>(path, { ...options, method: "DELETE", query }),
};
