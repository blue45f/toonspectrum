import { afterEach, describe, expect, it, vi } from "vitest";

import { api, apiFetch, API_FETCH_DEFAULT_TIMEOUT_MS, WRITE_TIMEOUT_MS } from "./api";

import {
  getAuthSession,
  persistSession,
  subscribeSessionSyncRequests,
} from "@/domains/auth/public/session/auth-session-state";

describe("shared API authentication", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    persistSession(null);
    vi.restoreAllMocks();
  });

  it("공유 요청은 HttpOnly 쿠키만 포함하고 저장 bearer 헤더를 만들지 않는다", async () => {
    persistSession({ user: { id: "creator-1" }, token: "signed-session-token" });
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await api.raw("/api/authenticated-probe");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request).toBeInstanceOf(Request);
    expect(request.credentials).toBe("include");
    expect(request.headers.get("x-user-id")).toBeNull();
  });

  it("명시적인 서버 간 x-user-id 헤더는 변경하지 않는다", async () => {
    persistSession({ user: { id: "creator-1" }, token: "signed-session-token" });
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await api.raw("/api/admin-probe", { headers: { "x-user-id": "explicit-admin-token" } });

    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request.headers.get("x-user-id")).toBe("explicit-admin-token");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s 요청에 고정 CSRF 헤더를 강제로 주입한다",
    async (method) => {
      const mockFetch = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(null, { status: 204 }),
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.raw("/api/mutation-probe", {
        method,
        headers: { "x-toonstudio-csrf": "caller-value" },
      });

      const request = mockFetch.mock.calls[0]![0] as unknown as Request;
      expect(request.headers.get("x-toonstudio-csrf")).toBe("1");
    },
  );

  it("GET 요청에는 CSRF 헤더를 추가하지 않는다", async () => {
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await api.raw("/api/read-probe");

    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request.headers.has("x-toonstudio-csrf")).toBe(false);
  });

  it("보호 API의 401은 stale 세션을 지우고 서버 세션 재확인을 요청한다", async () => {
    persistSession({ user: { id: "stale-user" }, token: "stale-token" });
    const reasons: string[] = [];
    const unsubscribe = subscribeSessionSyncRequests((reason) => reasons.push(reason));
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ message: "로그인이 필요해요." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;

    await expect(api.raw("/api/protected-probe")).rejects.toBeInstanceOf(Error);
    unsubscribe();

    expect(getAuthSession()).toBeNull();
    expect(reasons).toEqual(["unauthorized"]);
  });

  it("자격 증명 입력 자체의 401은 기존 쿠키 세션을 무효화하지 않는다", async () => {
    persistSession({ user: { id: "signed-in-user" }, token: "existing-token" });
    const reasons: string[] = [];
    const unsubscribe = subscribeSessionSyncRequests((reason) => reasons.push(reason));
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: "이메일 또는 비밀번호를 확인해 주세요." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;

    const response = await api.raw("/api/auth/login", {
      method: "POST",
      throwHttpErrors: false,
    });
    unsubscribe();

    expect(response.status).toBe(401);
    expect(getAuthSession()?.user.id).toBe("signed-in-user");
    expect(reasons).toEqual([]);
  });
});

describe("서버 무응답 상한 (절전 해제·게이트웨이 정체)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function hangingFetch() {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? (input as Request).signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
  }

  it("signal 없는 apiFetch는 기본 상한 뒤 TimeoutError로 실패가 표면화된다", async () => {
    vi.useFakeTimers();
    const mockFetch = hangingFetch();
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const promise = apiFetch("/api/probe", { method: "POST" });
    const assertion = expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(API_FETCH_DEFAULT_TIMEOUT_MS - 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("apiFetch에 호출부 signal이 있으면 그 signal을 그대로 사용한다", async () => {
    let seenSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal = init?.signal;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    const response = await apiFetch("/api/probe", { signal: controller.signal });

    expect(response.status).toBe(204);
    expect(seenSignal).toBe(controller.signal);
  });

  it("signal 없는 apiFetch 성공 요청에는 내부 AbortSignal이 연결된다", async () => {
    let seenSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal = init?.signal;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await apiFetch("/api/probe");

    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("쓰기 요청은 기본 상한(WRITE_TIMEOUT_MS)에서 timeout 오류로 끝난다", async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    const promise = api.post("/api/probe", { value: 1 });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AppApiError", kind: "timeout" });
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
    await assertion;
  });

  it("쓰기 요청에 호출부가 준 timeout이 기본 상한보다 우선한다", async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    const promise = api.post("/api/probe", { value: 1 }, { timeout: 5_000 });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AppApiError", kind: "timeout" });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });
});
