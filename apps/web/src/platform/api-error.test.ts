// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, apiFetch, isAppApiError } from "./api";
import { SERVICE_CAPABILITY_ERROR_EVENT } from "./api-error";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("application API error contract", () => {
  it("preserves safe 503 capability metadata and emits a runtime signal", async () => {
    const events: unknown[] = [];
    const listener = (event: Event) => {
      events.push(event instanceof CustomEvent ? event.detail : null);
    };
    globalThis.addEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    globalThis.fetch = vi.fn(async () => jsonResponse({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.posts.read",
      retryable: true,
      retryAfterSeconds: 30,
      requestId: "req_test",
      incidentId: "inc_test",
      message: "Request could not be completed",
    }, 503, {
      "Retry-After": "30",
      "X-Request-Id": "req_test",
      "X-Incident-Id": "inc_test",
    })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await api.get("/community/posts", { retry: 0 });
    } catch (error) {
      caught = error;
    } finally {
      globalThis.removeEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    }

    expect(isAppApiError(caught)).toBe(true);
    expect(caught).toMatchObject({
      kind: "capability_unavailable",
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.posts.read",
      retryable: true,
      retryAfterSeconds: 30,
      requestId: "req_test",
      incidentId: "inc_test",
    });
    expect((caught as Error).message).toContain("일부 온라인 기능");
    expect(events).toContainEqual(expect.objectContaining({
      capability: "community.posts.read",
      incidentId: "inc_test",
    }));
  });

  it("observes response-oriented 503 calls without forcing callers to throw", async () => {
    const events: unknown[] = [];
    const listener = (event: Event) => {
      events.push(event instanceof CustomEvent ? event.detail : null);
    };
    globalThis.addEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    globalThis.fetch = vi.fn(async () => jsonResponse({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      capability: "community.write",
      retryable: true,
      incidentId: "inc_raw",
    }, 503)) as unknown as typeof fetch;

    try {
      const response = await apiFetch("/community/posts", { method: "POST" });
      expect(response.status).toBe(503);
    } finally {
      globalThis.removeEventListener(SERVICE_CAPABILITY_ERROR_EVENT, listener);
    }
    expect(events).toContainEqual(expect.objectContaining({
      capability: "community.write",
      incidentId: "inc_raw",
    }));
  });

  it("uses Retry-After for rate-limit guidance", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 429, message: "too many requests" },
      429,
      { "Retry-After": "7" },
    )) as unknown as typeof fetch;

    await expect(api.get("/limited", { retry: 0 })).rejects.toMatchObject({
      kind: "rate_limited",
      status: 429,
      retryAfterSeconds: 7,
      retryable: true,
      message: expect.stringContaining("7초 후"),
    });
  });

  it("preserves safe validation messages without reclassifying them", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { statusCode: 422, message: "제목을 입력해 주세요." },
      422,
    )) as unknown as typeof fetch;

    await expect(api.get("/validation", { retry: 0 })).rejects.toMatchObject({
      kind: "validation",
      status: 422,
      message: "제목을 입력해 주세요.",
    });
  });

  it("classifies transport failures as reachable retries without leaking raw text", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(api.get("/transport", { retry: 0 })).rejects.toMatchObject({
      kind: "unreachable",
      status: null,
      retryable: true,
      message: expect.stringContaining("서버에 연결할 수 없습니다"),
    });
  });
});
