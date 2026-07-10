import { describe, expect, it, vi } from "vitest";

import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";

import type { StudioAiSqlPool } from "./studio-ai-usage.repository";

vi.mock("../../../../../lib/db", () => ({ dbPool: {} }));

function createPool(input?: {
  reserveRows?: Array<{ usageDay: string }>;
  settleRowCount?: number;
  ledgerError?: Error;
}) {
  const query = vi.fn().mockResolvedValue({
    rowCount: input?.reserveRows?.length ?? 1,
    rows: input?.reserveRows ?? [{ usageDay: "2026-07-10" }],
  });
  const clientQuery = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("UPDATE studio_ai_daily_quota")) {
      return Promise.resolve({ rowCount: input?.settleRowCount ?? 1, rows: [{ userId: "user-1" }] });
    }
    if (sql.includes("INSERT INTO studio_ai_usage_ledger") && input?.ledgerError) {
      return Promise.reject(input.ledgerError);
    }
    return Promise.resolve({ rowCount: 1, rows: [] });
  });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query: clientQuery, release });
  const pool = { query, connect } as unknown as StudioAiSqlPool;
  return { pool, query, clientQuery, connect, release };
}

describe("PostgresStudioAiUsageStore", () => {
  it("uses one UTC database-clock UPSERT for cross-instance atomic admission", async () => {
    const { pool, query } = createPool();
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.reserve({
        userId: "user-1",
        reservedTokens: 1_200,
        limits: { dailyRequests: 200, dailyTokens: 1_000_000 },
      })
    ).resolves.toEqual({ allowed: true, usageDay: "2026-07-10" });

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("RETURNING");
    expect(values).toEqual(["user-1", 1_200, 200, 1_000_000]);
  });

  it("returns a quota denial when the conditional UPSERT returns no row", async () => {
    const { pool } = createPool({ reserveRows: [] });
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.reserve({
        userId: "user-1",
        reservedTokens: 1_200,
        limits: { dailyRequests: 1, dailyTokens: 1_000 },
      })
    ).resolves.toEqual({ allowed: false });
  });

  it("settles quota and inserts only the privacy-minimized ledger fields in one transaction", async () => {
    const { pool, clientQuery, release } = createPool();
    const store = new PostgresStudioAiUsageStore(pool);

    await store.finalize({
      userId: "user-1",
      usageDay: "2026-07-10",
      reservedTokens: 1_200,
      task: "scenario",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      attemptCount: 1,
      status: "success",
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      startedAt: new Date("2026-07-10T23:59:59.900Z"),
      finishedAt: new Date("2026-07-11T00:00:00.100Z"),
    });

    expect(clientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    const updateCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE studio_ai_daily_quota"));
    expect(updateCall?.[1]).toEqual(["user-1", "2026-07-10", 1_200, 20]);
    const ledgerCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("studio_ai_usage_ledger"));
    expect(ledgerCall?.[1]).toEqual([
      "user-1",
      "scenario",
      "deepseek",
      "deepseek-v4-flash",
      1,
      "success",
      12,
      8,
      20,
      new Date("2026-07-10T23:59:59.900Z"),
      new Date("2026-07-11T00:00:00.100Z"),
    ]);
    expect(JSON.stringify(ledgerCall)).not.toContain("prompt-body");
    expect(JSON.stringify(ledgerCall)).not.toContain("provider-response");
    expect(release).toHaveBeenCalledOnce();
  });

  it("keeps missing usage null in the ledger while charging the full reservation", async () => {
    const { pool, clientQuery } = createPool();
    const store = new PostgresStudioAiUsageStore(pool);

    await store.finalize({
      userId: "user-1",
      usageDay: "2026-07-10",
      reservedTokens: 1_200,
      task: "composition",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      attemptCount: 1,
      status: "network_error",
      usage: {},
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      finishedAt: new Date("2026-07-10T00:00:01.000Z"),
    });

    const updateCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE studio_ai_daily_quota"));
    expect(updateCall?.[1]).toEqual(["user-1", "2026-07-10", 1_200, 1_200]);
    const ledgerCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("studio_ai_usage_ledger"));
    expect((ledgerCall?.[1] as unknown[]).slice(6, 9)).toEqual([null, null, null]);
  });

  it("rolls back and releases the connection if ledger insertion fails", async () => {
    const { pool, clientQuery, release } = createPool({ ledgerError: new Error("db unavailable") });
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.finalize({
        userId: "user-1",
        usageDay: "2026-07-10",
        reservedTokens: 1_200,
        task: "composition",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        attemptCount: 1,
        status: "provider_error",
        usage: {},
        startedAt: new Date("2026-07-10T00:00:00.000Z"),
        finishedAt: new Date("2026-07-10T00:00:01.000Z"),
      })
    ).rejects.toThrow("db unavailable");

    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
