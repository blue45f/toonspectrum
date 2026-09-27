import { describe, expect, it } from "vitest";

import { resolvePgPoolOptions, resolvePgShutdownTimeout } from "../platform/database/pg-connection";

describe("DB 런타임 제한과 pooler 호환", () => {
  it("직접 연결의 서버 제한과 클라이언트 제한을 함께 설정한다", () => {
    const options = resolvePgPoolOptions({});
    expect(options.statement_timeout).toBe(30_000);
    expect(options.lock_timeout).toBe(5_000);
    expect(options.idle_in_transaction_session_timeout).toBe(15_000);
    expect(options.query_timeout).toBeGreaterThan(options.statement_timeout!);
    expect(options.keepAlive).toBe(true);
    expect(options.maxLifetimeSeconds).toBe(300);
  });

  it("Neon transaction pooler에는 세션 시작 제한을 보내지 않는다", () => {
    const options = resolvePgPoolOptions({}, "postgresql://test@ep-test-pooler.us-east-2.aws.neon.tech/test");
    expect(options).not.toHaveProperty("statement_timeout");
    expect(options).not.toHaveProperty("lock_timeout");
    expect(options).not.toHaveProperty("idle_in_transaction_session_timeout");
    expect(options.query_timeout).toBe(35_000);
    expect(options.connectionTimeoutMillis).toBe(10_000);
  });

  it("커스텀 transaction pooler를 명시적으로 설정할 수 있다", () => {
    const options = resolvePgPoolOptions({ WEBDEX_PG_CONNECTION_MODE: "transaction", WEBDEX_PG_QUERY_MS: "4000" });
    expect(options).not.toHaveProperty("statement_timeout");
    expect(options.query_timeout).toBe(4_000);
  });

  it("직접 연결의 제한이 짧은 클라이언트 설정으로 무효화되지 않는다", () => {
    const options = resolvePgPoolOptions({ WEBDEX_PG_QUERY_MS: "1000", WEBDEX_PG_STATEMENT_MS: "60000" });
    expect(options.statement_timeout).toBe(60_000);
    expect(options.query_timeout).toBe(61_000);
  });

  it.each(["", "invalid", "NaN", "Infinity"])("잘못된 숫자 %s에 안전한 기본값을 적용한다", (value) => {
    const options = resolvePgPoolOptions({ WEBDEX_PG_CONNECT_MS: value, WEBDEX_PG_MAX_LIFETIME_SECONDS: value });
    expect(options.connectionTimeoutMillis).toBe(10_000);
    expect(options.maxLifetimeSeconds).toBe(300);
    expect(resolvePgShutdownTimeout({ WEBDEX_PG_SHUTDOWN_MS: value })).toBe(15_000);
  });

  it("0으로 제한을 끄거나 과도한 연결 수명을 지정할 수 없다", () => {
    const options = resolvePgPoolOptions({ WEBDEX_PG_CONNECT_MS: "0", WEBDEX_PG_STATEMENT_MS: "0", WEBDEX_PG_IDLE_TRANSACTION_MS: "0", WEBDEX_PG_MAX_LIFETIME_SECONDS: "999999" });
    expect(options.connectionTimeoutMillis).toBe(1_000);
    expect(options.statement_timeout).toBe(1_000);
    expect(options.idle_in_transaction_session_timeout).toBe(1_000);
    expect(options.maxLifetimeSeconds).toBe(3_600);
    expect(resolvePgShutdownTimeout({ WEBDEX_PG_SHUTDOWN_MS: "999999" })).toBe(60_000);
  });

  it("지원하지 않는 연결 모드를 조용히 추측하지 않는다", () => {
    expect(() => resolvePgPoolOptions({ WEBDEX_PG_CONNECTION_MODE: "unknown" })).toThrow("WEBDEX_PG_CONNECTION_MODE");
  });
});
