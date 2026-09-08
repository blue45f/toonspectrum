import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), lifecycle: vi.fn() }));
vi.mock("../../db", () => ({
  dbClient: { execute: mocks.execute }, db: {}, users: {},
  creatorProfiles: {}, monetizationPlans: {},
}));
vi.mock("../../server/session", () => ({ invalidateSessionUser: vi.fn() }));
vi.mock("../../server/user-lifecycle", () => ({
  ensureUserLifecycleSchema: mocks.lifecycle,
  normalizeUserAccountStatus: vi.fn(),
}));

const tables = ["creator_profile", "monetization_plan", "creator_campaign", "revenue_ledger",
  "admin_audit_logs", "admin_banned_words", "admin_promos", "admin_announcements",
  "admin_security_policies", "admin_content_reports"];
const ddl = /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i;
function queryText(query: string | { sql: string }) { return typeof query === "string" ? query : query.sql; }
function postgresError(code: string, message: string) { return Object.assign(new Error(message), { code }); }

// A fully migrated but DML-only runtime: even IF NOT EXISTS DDL is forbidden.
// The metadata responses also support the legacy implementation, so failures
// identify its attempted writes rather than an incompatible mock interface.
function restrictedRuntime(query: string | { sql: string }) {
  const text = queryText(query);
  if (ddl.test(text)) throw postgresError("42501", "permission denied for schema public");
  if (text.includes("information_schema.tables")) return { rows: tables.map(name => ({ name })) };
  if (text.includes("column_name = ?")) return { rows: [{ exists: 1 }] };
  if (text.includes("information_schema.columns")) {
    return { rows: ["reviewedBy", "reviewedAt", "reviewNote", "settledAt"].map(name => ({ name })) };
  }
  return { rows: [] };
}
function expectReadOnly() {
  expect(mocks.execute.mock.calls.every(([query]) => !ddl.test(queryText(query)))).toBe(true);
}
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  mocks.execute.mockReset().mockImplementation(restrictedRuntime);
  mocks.lifecycle.mockReset().mockResolvedValue(undefined);
});

describe("ensureAdminSchema migration-owned readiness", () => {
  it("works with DML-only credentials and caches successful readiness without attempting DDL", async () => {
    const module = await import("./admin-types");
    await module.ensureAdminSchema();
    expect(module.adminSchemaReady).toBe(true);
    expectReadOnly();
    const calls = mocks.execute.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await module.ensureAdminSchema();
    expect(mocks.execute).toHaveBeenCalledTimes(calls);
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["42P01", "relation admin_announcements does not exist"],
    ["42703", "column revenue_ledger.reviewedAt does not exist"],
    ["42501", "permission denied for table admin_audit_logs"],
  ])("fails closed with 503 for %s without publishing readiness or attempting repair", async (code, message) => {
    const failure = postgresError(code, message);
    mocks.execute.mockRejectedValue(failure);
    const module = await import("./admin-types");
    const error = await module.ensureAdminSchema().catch(error => error);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.cause).toBe(failure);
    expect(JSON.stringify(error.getResponse())).not.toContain(message);
    expect(module.adminSchemaReady).toBe(false);
    expectReadOnly();
  });

  it("rejects an absent or unusable required index rather than deferring failure to a request", async () => {
    mocks.execute.mockImplementation(query => queryText(query).includes("pg_index")
      ? { rows: [{ name: "idx_admin_reports_status" }] } : restrictedRuntime(query));
    const module = await import("./admin-types");
    await expect(module.ensureAdminSchema()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(module.adminSchemaReady).toBe(false);
    expectReadOnly();
  });

  it("shares the in-flight lifecycle and metadata probe across concurrent requests", async () => {
    const gate = deferred();
    mocks.lifecycle.mockReturnValue(gate.promise);
    const module = await import("./admin-types");
    const pending = [module.ensureAdminSchema(), module.ensureAdminSchema(), module.ensureAdminSchema()];
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(module.adminSchemaReady).toBe(false);
    gate.resolve();
    await Promise.all(pending);
    const calls = mocks.execute.mock.calls.length;
    await module.ensureAdminSchema();
    expect(mocks.execute).toHaveBeenCalledTimes(calls);
    expectReadOnly();
  });

  it("keeps metadata pending until the entire probe resolves", async () => {
    const gate = deferred();
    mocks.execute.mockImplementationOnce(async () => { await gate.promise; return { rows: [] }; });
    const module = await import("./admin-types");
    const first = module.ensureAdminSchema();
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    const second = module.ensureAdminSchema();
    expect(module.adminSchemaReady).toBe(false);
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(module.adminSchemaReady).toBe(true);
    expectReadOnly();
  });

  it("allows a successful retry after a shared failure while preserving the original cause", async () => {
    const gate = deferred();
    const failure = postgresError("42703", "missing admin metadata");
    mocks.lifecycle.mockReturnValueOnce(gate.promise);
    const module = await import("./admin-types");
    const results = Promise.allSettled([module.ensureAdminSchema(), module.ensureAdminSchema()]);
    gate.reject(failure);
    expect((await results).map(result => result.status === "rejected" && result.reason.cause)).toEqual([failure, failure]);
    expect(module.adminSchemaReady).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
    await module.ensureAdminSchema();
    expect(module.adminSchemaReady).toBe(true);
    expect(mocks.lifecycle).toHaveBeenCalledTimes(2);
    expectReadOnly();
  });

  it("rechecks repaired metadata after failure rather than caching a rejected probe", async () => {
    mocks.execute.mockRejectedValueOnce(postgresError("42P01", "missing admin metadata"));
    const module = await import("./admin-types");
    await expect(module.ensureAdminSchema()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(module.adminSchemaReady).toBe(false);
    await module.ensureAdminSchema();
    expect(module.adminSchemaReady).toBe(true);
    expectReadOnly();
  });
});
