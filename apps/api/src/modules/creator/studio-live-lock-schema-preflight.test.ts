import { describe, expect, it, vi } from "vitest";

import { dbPool } from "../../db";

import {
  preflightStudioLiveLockSchema,
  STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT,
  studioLiveLockSchemaPreflightProvider,
} from "./studio-live-lock-schema-preflight";

vi.mock("../../db", () => ({ dbPool: { query: vi.fn() } }));

function completeSchema(overrides: Record<string, unknown> = {}) {
  return {
    lockTable: "creator_work_live_lock",
    clockTable: "creator_work_live_lock_clock",
    ledgerTable: "toonspectrum_schema_migration",
    revisionNotNull: true,
    revisionDefault: null,
    revisionType: "bigint",
    ...overrides,
  };
}

describe("Studio live-lock revision schema preflight", () => {
  it("accepts only the migrated schema with its durable cutover ledger", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchema()] })
      .mockResolvedValueOnce({ rows: [{ applied: true }] });

    await expect(preflightStudioLiveLockSchema({ query } as never)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([
      "0017_creator_work_live_lock_revision",
    ]);
  });

  it.each([
    ["lock table", { lockTable: null }],
    ["clock table", { clockTable: null }],
    ["migration ledger", { ledgerTable: null }],
    ["nullable revision", { revisionNotNull: false }],
    ["revision default", { revisionDefault: "0" }],
    ["revision type", { revisionType: "integer" }],
  ])("fails closed when the %s contract is incomplete", async (_case, override) => {
    const query = vi.fn().mockResolvedValue({ rows: [completeSchema(override)] });

    await expect(preflightStudioLiveLockSchema({ query } as never)).rejects.toThrow(
      /apply migration 0017/u
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects a final-looking Drizzle schema until the coordinated cutover is recorded", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [completeSchema()] })
      .mockResolvedValueOnce({ rows: [{ applied: false }] });

    await expect(preflightStudioLiveLockSchema({ query } as never)).rejects.toThrow(
      /cutover is not recorded/u
    );
  });

  it("exports an eager Nest provider token for CreatorModule boot", () => {
    expect(studioLiveLockSchemaPreflightProvider.provide).toBe(
      STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT
    );
    expect(studioLiveLockSchemaPreflightProvider.useFactory).toEqual(expect.any(Function));
  });

  it("keeps the API booting when the preflight cannot reach the database at all", async () => {
    vi.mocked(dbPool.query).mockRejectedValue(
      Object.assign(new Error("compute time quota exceeded"), { code: "53000" })
    );

    await expect(studioLiveLockSchemaPreflightProvider.useFactory()).resolves.toBe(true);
  });

  it("still refuses boot through the provider when the schema contract is violated", async () => {
    vi.mocked(dbPool.query).mockResolvedValue({ rows: [] } as never);

    await expect(studioLiveLockSchemaPreflightProvider.useFactory()).rejects.toThrow(
      /apply migration 0017/u
    );
  });
});
