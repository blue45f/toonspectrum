import { describe, expect, it, vi } from "vitest";

import { inspectPostgresRuntime } from "./inspect-postgres-runtime.mts";

function mockClient(readOnly = "on") {
  return { query: vi.fn(async (sql: string) => ({
    rows: sql === "SHOW transaction_read_only" ? [{ transaction_read_only: readOnly }] : [{ count: 0 }],
  })) };
}

describe("읽기 전용 DB 집계 진단", () => {
  it("읽기 전용 트랜잭션과 제한 시간을 적용한 뒤 반드시 롤백한다", async () => {
    const client = mockClient();
    const report = await inspectPostgresRuntime(client);
    const queries = client.query.mock.calls.map(([sql]) => sql);
    expect(queries[0]).toBe("BEGIN READ ONLY");
    expect(queries[1]).toBe("SET LOCAL statement_timeout = '5s'");
    expect(queries[2]).toBe("SET LOCAL lock_timeout = '1s'");
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(report.readOnly).toBe(true);
    expect(queries.some((sql) => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/u.test(sql))).toBe(false);
    expect(queries.some((sql) => /SELECT.*\bquery\b/iu.test(sql))).toBe(false);
  });

  it("읽기 전용 상태를 확인하지 못하면 집계 실행 없이 실패한다", async () => {
    const client = mockClient("off");
    await expect(inspectPostgresRuntime(client)).rejects.toThrow("읽기 전용");
    expect(client.query.mock.calls).toHaveLength(5);
    expect(client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
  });

  it("중간 쿼리 오류에서도 롤백을 시도하고 실패를 전파한다", async () => {
    const client = mockClient();
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT")) throw new Error("diagnostic failure");
      return { rows: [{ transaction_read_only: "on" }] };
    });
    await expect(inspectPostgresRuntime(client)).rejects.toThrow("diagnostic failure");
    expect(client.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
  });
});
