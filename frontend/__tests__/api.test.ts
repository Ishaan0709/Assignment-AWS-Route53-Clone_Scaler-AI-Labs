import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  apiFetch,
  buildQuery,
  configureApi,
  isApiError,
  resetApiConfig,
} from "@/lib/api";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiConfig();
});

describe("buildQuery", () => {
  it("serializes defined values and skips null, undefined and empty strings", () => {
    expect(buildQuery({ page: 2, q: "www", type: undefined, alias: null, name: "" })).toBe(
      "?page=2&q=www",
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({ q: undefined })).toBe("");
  });

  it("encodes special characters", () => {
    expect(buildQuery({ q: "a b&c" })).toBe("?q=a+b%26c");
  });
});

describe("apiFetch", () => {
  it("sends cookies, JSON headers and the serialized body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    const result = await apiFetch<{ ok: boolean }>("/api/hostedzones", {
      method: "POST",
      body: { name: "example.com" },
      query: { page: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/hostedzones?page=1");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe(JSON.stringify({ name: "example.com" }));
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("passes FormData through without a JSON content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const form = new FormData();
    form.set("dry_run", "true");

    await api.post("/api/hostedzones/Z1/import", form);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe(form);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204 responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete("/api/hostedzones/Z1")).resolves.toBeUndefined();
  });

  it("parses the error envelope into an ApiError with code and fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: {
          code: "HostedZoneAlreadyExists",
          message: "A hosted zone with that name already exists.",
          fields: { name: "Already exists." },
        },
      }),
    );

    const error = await api.post("/api/hostedzones", { name: "example.com" }).catch((e) => e);

    expect(isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.isConflict).toBe(true);
    expect(apiError.code).toBe("HostedZoneAlreadyExists");
    expect(apiError.message).toBe("A hosted zone with that name already exists.");
    expect(apiError.fieldError("name")).toBe("Already exists.");
    expect(apiError.fieldError("missing")).toBeUndefined();
  });

  it("falls back to an HttpError when the body is not the error envelope", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }),
    );

    const error = (await api.get("/api/hostedzones").catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("HttpError");
    expect(error.message).toBe("Bad Gateway");
    expect(error.fields).toEqual({});
  });

  it("calls the unauthorized handler with the current path on 401", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    window.history.pushState({}, "", "/hostedzones?page=2");
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: "Unauthorized", message: "Not signed in", fields: {} } }),
    );

    const error = (await api.get("/api/hostedzones").catch((e) => e)) as ApiError;

    expect(error.isUnauthorized).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledWith("/hostedzones?page=2");
  });

  it("does not redirect on 401 when redirectOn401 is false", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: "Unauthorized", message: "Not signed in", fields: {} } }),
    );

    await expect(
      api.get("/api/auth/me", undefined, { redirectOn401: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("does not redirect for other error statuses", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: { code: "NoSuchHostedZone", message: "Missing", fields: {} } }),
    );

    await expect(api.get("/api/hostedzones/Z404")).rejects.toMatchObject({ isNotFound: true });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("wraps network failures in a NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = (await api.get("/api/health").catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe("NetworkError");
  });

  it("re-throws aborts untouched so callers can ignore cancelled requests", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);

    await expect(api.get("/api/health")).rejects.toBe(abort);
  });
});
