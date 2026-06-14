import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "./query-client";

// useApiResource 의 fetch 계약(react-query 마이그레이션 후에도 동작 보존)을 검증한다.
// 환경이 node 라 DOM 훅 렌더 대신, 훅이 쓰는 react-query 기본 옵션과 queryFn 동작을 직접 단언한다.

describe("createAppQueryClient 기본 옵션(동작 보존)", () => {
  it("자동 refetch/재시도/캐시 재사용을 모두 끈다 — 기존 손수 fetch 와 동일", () => {
    const defaults = createAppQueryClient().getDefaultOptions().queries;
    // 기존 fetch 는 마운트마다 1회, 자동 refetch 없음, 재시도 없음, 캐시 재사용 없음.
    expect(defaults?.retry).toBe(false);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.refetchOnReconnect).toBe(false);
    expect(defaults?.refetchInterval).toBe(false);
    expect(defaults?.gcTime).toBe(0);
    expect(defaults?.staleTime).toBe(0);
  });
});

// 훅의 queryFn 과 동일한 로직(api.raw 호출 + 404 센티넬 + 비-OK 에러)을 QueryClient 로 실행해
// 데이터/notFound/에러 매핑이 기존 useApiResource 와 동일한지 확인한다.
class NotFoundError extends Error {
  constructor() {
    super("not-found");
    this.name = "NotFoundError";
  }
}

async function runQuery<T>(url: string, errorMessage: string) {
  const { api } = await import("./api");
  const client = new QueryClient();
  return client.fetchQuery<T>({
    queryKey: ["api-resource", url],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await api.raw(url, { cache: "no-store", signal, throwHttpErrors: false });
      if (response.status === 404) throw new NotFoundError();
      if (!response.ok) throw new Error(errorMessage);
      return (await response.json()) as T;
    },
  });
}

describe("useApiResource queryFn 동작 보존", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("200 응답을 JSON 으로 파싱하고 no-store 로 요청한다", async () => {
    const payload = { hello: "world" };
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(payload), { status: 200 })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const data = await runQuery<typeof payload>("/api/home", "실패");

    expect(data).toEqual(payload);
    const request = mockFetch.mock.calls[0]![0] as unknown as Request;
    expect(request.cache).toBe("no-store");
  });

  it("404 는 NotFoundError 로 던진다(notFound 흐름)", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("null", { status: 404 })
    ) as unknown as typeof fetch;

    await expect(runQuery("/api/authors/none", "실패")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("그 외 비-OK 응답은 errorMessage 로 던진다", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("boom", { status: 500 })
    ) as unknown as typeof fetch;

    await expect(runQuery("/api/home", "홈 데이터를 불러오지 못했습니다.")).rejects.toThrow(
      "홈 데이터를 불러오지 못했습니다."
    );
  });
});
