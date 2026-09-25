import { describe, expect, it, vi } from "vitest";

import { handleAnalyticsRequest, type AnalyticsEnvironment } from "./index";

const token = "local-test-analytics-rpc-credential-only";
function setup() {
  const bind = vi.fn().mockReturnValue({ prepared: true });
  const prepare = vi.fn().mockReturnValue({ bind });
  const batch = vi.fn().mockResolvedValue([{ success: true, results: [{ count: 2 }], meta: { rows_read: 2 } }]);
  const env: AnalyticsEnvironment = { ANALYTICS_RPC_TOKEN: token, ANALYTICS_DB: { prepare, batch } };
  return { env, prepare, bind, batch };
}
function request(body: unknown, authorization = `Bearer ${token}`) {
  return new Request("https://analytics.example/query", {
    method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const query = { statements: [{ sql: "SELECT count(*) AS count FROM traffic_session", params: [] }] };

describe("분석 전용 D1 Worker", () => {
  it("서버 인증과 준비된 파라미터를 검증하고 D1 batch를 한 번 실행한다", async () => {
    const { env, batch, prepare, bind } = setup();
    const response = await handleAnalyticsRequest(request(query), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ results: [{ count: 2 }], meta: { rows_read: 2 } }] });
    expect(prepare).toHaveBeenCalledWith(query.statements[0].sql);
    expect(bind).toHaveBeenCalledWith();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
  it.each(["", `Bearer ${token}x`, `bearer ${token}`, "Bearer wrong"])("미인증 요청은 DB를 읽지 않는다: %s", async (authorization) => {
    const { env, batch } = setup();
    expect((await handleAnalyticsRequest(request(query, authorization), env)).status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });
  it("Core가 허용하는 최대 길이 토큰도 동일하게 인증한다", async () => {
    const { env, batch } = setup();
    env.ANALYTICS_RPC_TOKEN = "x".repeat(4_096);
    expect((await handleAnalyticsRequest(request(query, `Bearer ${env.ANALYTICS_RPC_TOKEN}`), env)).status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it.each(["x".repeat(4_097), `${token} with-space`])("Core가 허용하지 않는 토큰은 Worker에서도 거부한다", async (secret) => {
    const { env, batch } = setup(); env.ANALYTICS_RPC_TOKEN = secret;
    expect((await handleAnalyticsRequest(request(query, `Bearer ${secret}`), env)).status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });
  it.each(["DROP TABLE traffic_session", "SELECT 1; DELETE FROM traffic_session", "PRAGMA table_info(traffic_session)", "ATTACH DATABASE 'x' AS y", "SELECT load_extension('x')"])("DDL·복수문 실행을 차단한다: %s", async (sql) => {
    const { env, batch } = setup();
    expect((await handleAnalyticsRequest(request({ statements: [{ sql, params: [] }] }), env)).status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });
  it.each([{}, { statements: [] }, { statements: Array.from({ length: 33 }, () => query.statements[0]) },
    { statements: [{ sql: "SELECT ?", params: [{}] }] },
    { statements: [{ sql: "SELECT ?", params: ["x".repeat(262_145)] }] }])("잘못된 요청은 SQL 실행 전에 거부한다", async (body) => {
    const { env, batch } = setup();
    expect((await handleAnalyticsRequest(request(body), env)).status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });
  it("멀티바이트 SQL은 문자 수가 아닌 UTF-8 크기로 제한한다", async () => {
    const { env, batch } = setup();
    const sql = `SELECT '${"한".repeat(17_000)}'`;
    expect(sql.length).toBeLessThan(50_000);
    expect((await handleAnalyticsRequest(request({ statements: [{ sql, params: [] }] }), env)).status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });
  it("확정 여부를 알 수 없는 저장 오류를 재실행하거나 노출하지 않는다", async () => {
    const { env, batch } = setup();
    batch.mockRejectedValue(new Error(`SQL with private hash and ${token}`));
    const response = await handleAnalyticsRequest(request(query), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "storage_unavailable" });
    expect(batch).toHaveBeenCalledTimes(1);
  });
  it("불완전한 batch 결과를 성공으로 반환하지 않는다", async () => {
    const { env, batch } = setup(); batch.mockResolvedValue([]);
    expect((await handleAnalyticsRequest(request(query), env)).status).toBe(503);
  });
  it("인증된 liveness는 DB 쿼터를 사용하지 않는다", async () => {
    const { env, batch } = setup();
    const response = await handleAnalyticsRequest(new Request("https://analytics.example/health/live", {
      headers: { authorization: `Bearer ${token}` },
    }), env);
    expect(response.status).toBe(200); expect(batch).not.toHaveBeenCalled();
  });
  it("누락되거나 짧은 운영 비밀을 허용하지 않는다", async () => {
    const { env, batch } = setup(); env.ANALYTICS_RPC_TOKEN = "short";
    expect((await handleAnalyticsRequest(request(query, "Bearer short"), env)).status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });
});
