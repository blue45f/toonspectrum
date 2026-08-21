import { describe, expect, it, vi } from "vitest";

import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";

import type { StudioAiSqlPool } from "./studio-ai-usage.repository";

vi.mock("../../db", () => ({ dbPool: {} }));

function createPool(input?: {
  clockRows?: Array<{ usageDay: string }>;
  globalReserveRows?: Array<{ usageDay: string }>;
  userReserveRows?: Array<{ usageDay: string }>;
  globalSettleRowCount?: number;
  userSettleRowCount?: number;
  ledgerError?: Error;
}) {
  const clientQuery = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")) {
      const rows = input?.clockRows ?? [{ usageDay: "2026-07-10" }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes("INSERT INTO studio_ai_global_daily_quota")) {
      const rows = input?.globalReserveRows ?? [{ usageDay: "2026-07-10" }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes("INSERT INTO studio_ai_daily_quota")) {
      const rows = input?.userReserveRows ?? [{ usageDay: "2026-07-10" }];
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (sql.includes("UPDATE studio_ai_global_daily_quota")) {
      return Promise.resolve({
        rowCount: input?.globalSettleRowCount ?? 1,
        rows: [{ usageDay: "2026-07-10" }],
      });
    }
    if (sql.includes("UPDATE studio_ai_daily_quota")) {
      return Promise.resolve({
        rowCount: input?.userSettleRowCount ?? 1,
        rows: [{ userId: "user-1" }],
      });
    }
    if (sql.includes("INSERT INTO studio_ai_usage_ledger") && input?.ledgerError) {
      return Promise.reject(input.ledgerError);
    }
    return Promise.resolve({ rowCount: 1, rows: [] });
  });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query: clientQuery, release });
  const pool = { connect } as unknown as StudioAiSqlPool;
  return { pool, clientQuery, connect, release };
}

describe("PostgresStudioAiUsageStore", () => {
  it("atomically reserves global and per-user UTC quotas in one short transaction", async () => {
    const { pool, clientQuery, release } = createPool();
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.reserve({
        userId: "user-1",
        reservedTokens: 1_200,
        limits: {
          dailyRequests: 200,
          dailyTokens: 1_000_000,
          globalDailyRequests: 500,
          globalDailyTokens: 2_000_000,
        },
      })
    ).resolves.toEqual({ allowed: true, usageDay: "2026-07-10" });

    expect(clientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "SELECT",
      "INSERT",
      "INSERT",
      "COMMIT",
    ]);
    const globalCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO studio_ai_global_daily_quota")
    );
    expect(globalCall?.[1]).toEqual(["2026-07-10", 1_200, 500, 2_000_000]);
    const userCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO studio_ai_daily_quota")
    );
    expect(userCall?.[1]).toEqual(["user-1", "2026-07-10", 1_200, 200, 1_000_000]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back before user admission when the service-wide quota is exhausted", async () => {
    const { pool, clientQuery } = createPool({ globalReserveRows: [] });
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.reserve({
        userId: "user-1",
        reservedTokens: 1_200,
        limits: {
          dailyRequests: 1,
          dailyTokens: 1_000,
          globalDailyRequests: 1,
          globalDailyTokens: 1_000,
        },
      })
    ).resolves.toEqual({ allowed: false });
    expect(
      clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO studio_ai_daily_quota"))
    ).toBe(false);
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("rolls back the global reservation when the individual quota is exhausted", async () => {
    const { pool, clientQuery } = createPool({ userReserveRows: [] });
    const store = new PostgresStudioAiUsageStore(pool);

    await expect(
      store.reserve({
        userId: "user-1",
        reservedTokens: 1_200,
        limits: {
          dailyRequests: 1,
          dailyTokens: 1_000,
          globalDailyRequests: 500,
          globalDailyTokens: 2_000_000,
        },
      })
    ).resolves.toEqual({ allowed: false });
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
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
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    const globalUpdateCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE studio_ai_global_daily_quota")
    );
    expect(globalUpdateCall?.[1]).toEqual(["2026-07-10", 1_200, 20]);
    const userUpdateCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE studio_ai_daily_quota")
    );
    expect(userUpdateCall?.[1]).toEqual(["user-1", "2026-07-10", 1_200, 20]);
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

    const globalUpdateCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE studio_ai_global_daily_quota")
    );
    expect(globalUpdateCall?.[1]).toEqual(["2026-07-10", 1_200, 1_200]);
    const userUpdateCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE studio_ai_daily_quota")
    );
    expect(userUpdateCall?.[1]).toEqual(["user-1", "2026-07-10", 1_200, 1_200]);
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

  it("rolls back both settlements when the global reservation is missing", async () => {
    const { pool, clientQuery, release } = createPool({ globalSettleRowCount: 0 });
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
    ).rejects.toThrow("global quota reservation");

    expect(
      clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE studio_ai_daily_quota"))
    ).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
