import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

import { persistSession } from "@/src/compat/auth-session-state";

describe("shared API authentication", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    persistSession(null);
    vi.restoreAllMocks();
  });

  it("현재 서명 세션 토큰을 모든 공유 요청에 x-user-id로 주입한다", async () => {
    persistSession({ user: { id: "creator-1" }, token: "signed-session-token" });
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await api.raw("/api/authenticated-probe");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request).toBeInstanceOf(Request);
    expect(request.headers.get("x-user-id")).toBe("signed-session-token");
  });

  it("호출부가 명시한 x-user-id를 세션 토큰으로 덮어쓰지 않는다", async () => {
    persistSession({ user: { id: "creator-1" }, token: "signed-session-token" });
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await api.raw("/api/admin-probe", { headers: { "x-user-id": "explicit-admin-token" } });

    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request.headers.get("x-user-id")).toBe("explicit-admin-token");
  });
});
