import { describe, expect, it, vi } from "vitest";

import { resolveTrafficD1Config, TrafficD1HttpExecutor } from "./traffic-analytics-d1.client";

const secret = "private-traffic-rpc-token-0000000000000";
const config = { url: "https://analytics.example.com/query", token: secret, timeoutMs: 100 };
const statements = [{ sql: "SELECT 1 AS ready", params: [] }];

describe("D1 서버 RPC 경계", () => {
  it("고정 HTTPS endpoint에 서버 토큰을 전달하고 유효한 batch 결과만 반환한다", async () => {
    const network = vi.fn<typeof fetch>(async () => Response.json({ results: [{ results: [{ ready: 1 }], meta: { changes: 0 } }] }));
    await expect(new TrafficD1HttpExecutor(config, network).execute(statements)).resolves.toEqual([{ results: [{ ready: 1 }] }]);
    expect(network).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledWith(config.url, expect.objectContaining({
      redirect: "error", method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ statements }),
    }));
  });

  it.each([302, 403, 429, 500])("HTTP %s를 재시도하거나 오류 본문을 노출하지 않는다", async (status) => {
    const network = vi.fn<typeof fetch>(async () => new Response(secret, { status }));
    await expect(new TrafficD1HttpExecutor(config, network).execute(statements)).rejects.toMatchObject({
      response: { code: "TRAFFIC_ANALYTICS_UNAVAILABLE" }, status: 503,
    });
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([{ results: [] }, { results: [{ results: [null] }] }, { results: [{ error: secret }] }])("불완전한 성공 envelope를 성공으로 간주하지 않는다", async (body) => {
    const network = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(new TrafficD1HttpExecutor(config, network).execute(statements)).rejects.toThrow("트래픽 분석 저장소를 사용할 수 없습니다.");
    expect(network).toHaveBeenCalledOnce();
  });

  it("전송 중단은 같은 쓰기를 다시 실행하지 않고 하위 오류를 제거한다", async () => {
    const network = vi.fn<typeof fetch>(async (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error(`timeout ${secret}`)), { once: true });
    }));
    await expect(new TrafficD1HttpExecutor(config, network).execute(statements)).rejects.toThrow("트래픽 분석 저장소를 사용할 수 없습니다.");
    expect(network).toHaveBeenCalledOnce();
  });

  it("과도한 응답을 버리고 본문에 포함된 비밀은 노출하지 않는다", async () => {
    const network = vi.fn<typeof fetch>(async () => new Response(secret.repeat(40_000)));
    await expect(new TrafficD1HttpExecutor(config, network).execute(statements)).rejects.toThrow("트래픽 분석 저장소를 사용할 수 없습니다.");
  });

  it.each([
    { TRAFFIC_ANALYTICS_D1_RPC_URL: "http://analytics.example.com/query" },
    { TRAFFIC_ANALYTICS_D1_RPC_URL: "https://user:password@example.com/query" },
    { TRAFFIC_ANALYTICS_D1_RPC_URL: "https://analytics.example.com/query?token=private" },
    { TRAFFIC_ANALYTICS_D1_RPC_URL: "https://analytics.example.com/wrong" },
    { TRAFFIC_ANALYTICS_D1_RPC_TOKEN: "short" },
    { TRAFFIC_ANALYTICS_D1_TIMEOUT_MS: "0" },
  ])("설정 오류가 있을 때 fail closed한다", (override) => {
    expect(() => resolveTrafficD1Config({
      TRAFFIC_ANALYTICS_D1_RPC_URL: config.url, TRAFFIC_ANALYTICS_D1_RPC_TOKEN: secret, ...override,
    })).toThrow("트래픽 분석 D1 설정이 올바르지 않습니다.");
  });
});
