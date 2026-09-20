import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildFortuneSnapshotRuntimeAclSql } from "../../../../../scripts/fortune-snapshot-database-contract.mjs";
import { fortuneSnapshotKey, type FortunePublicSnapshot } from "./fortune-snapshot";
import { PostgresFortuneSnapshotRepository } from "./fortune-snapshot.repository";

const database = process.env.FORTUNE_TEST_DATABASE_URL;
function validateTarget(raw: string) {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/fortune_disposable_[a-z0-9_]+$/u.test(url.pathname) || url.search || url.hash) throw new Error("Explicit disposable loopback fortune_disposable_* database required");
}
describe.skipIf(!database)("fortune real PostgreSQL migration and non-owning runtime", () => {
  const schema = `fortune_${randomUUID().replaceAll("-", "")}`, role = `fortune_runtime_${randomUUID().replaceAll("-", "")}`;
  let owner: Pool, runtime: Pool, repo: PostgresFortuneSnapshotRepository;
  const value = (): FortunePublicSnapshot => ({ kind: "special-days", month: "2024-09", category: "holidays", source: "kasi", status: "external", items: [],
    policyRevision: "data-go-15012690-20260920", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
  beforeAll(async () => {
    validateTarget(database!); owner = new Pool({ connectionString: database!, max: 1, connectionTimeoutMillis: 3000, options: `-c search_path=${schema} -c statement_timeout=5000` });
    await owner.query(`CREATE SCHEMA "${schema}"; CREATE ROLE "${role}" LOGIN; GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    await owner.query(await readFile(new URL("../../db/migrations/0081_fortune_public_snapshot.sql", import.meta.url), "utf8"));
    await owner.query(buildFortuneSnapshotRuntimeAclSql(role, schema));
    const url = new URL(database!); url.username = role; url.password = "";
    runtime = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000, options: `-c search_path=${schema} -c statement_timeout=5000` });
    repo = new PostgresFortuneSnapshotRepository((sql, values) => runtime.query(sql, values));
  });
  beforeEach(async () => { await owner.query("TRUNCATE fortune_public_snapshot"); });
  afterAll(async () => {
    if (runtime) await runtime.end();
    if (owner) { await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP ROLE IF EXISTS "${role}"`); await owner.end(); }
  });
  it("persists and reuses data across repository instances without schema ownership", async () => {
    const data = value(); await repo.put(data);
    const other = new PostgresFortuneSnapshotRepository((sql, values) => runtime.query(sql, values));
    expect(await other.get(fortuneSnapshotKey(data), new Date())).toEqual(data);
    await expect(runtime.query("CREATE TABLE unexpected(id text)")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("TRUNCATE fortune_public_snapshot")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("UPDATE fortune_public_snapshot SET snapshot_key = 'changed'")).rejects.toMatchObject({ code: "42501" });
  });
  it("fences stale writers and enforces expiry in database and repository", async () => {
    const newer = value(), older = { ...newer, checkedAt: new Date(Date.parse(newer.checkedAt) - 10000).toISOString(), expiresAt: new Date(Date.parse(newer.expiresAt) - 10000).toISOString() };
    await repo.put(newer); await repo.put(older); expect(await repo.get(fortuneSnapshotKey(newer), new Date())).toEqual(newer);
    expect(await repo.get(fortuneSnapshotKey(newer), new Date(newer.expiresAt))).toBeNull();
    await expect(runtime.query("UPDATE fortune_public_snapshot SET expires_at = checked_at")).rejects.toMatchObject({ code: "23514" });
  });
  it("bounds retention cleanup and rejects private or corrupt payloads", async () => {
    const data = value(); await repo.put(data);
    await owner.query("UPDATE fortune_public_snapshot SET checked_at = CURRENT_TIMESTAMP - interval '2 hours', expires_at = CURRENT_TIMESTAMP - interval '1 hour'");
    await repo.prune(); expect((await owner.query("SELECT count(*)::int AS n FROM fortune_public_snapshot")).rows[0].n).toBe(0);
    await expect(repo.put({ ...data, birthDate: "1990-01-01" } as FortunePublicSnapshot)).rejects.toThrow();
    await repo.put(data); await owner.query("UPDATE fortune_public_snapshot SET payload = payload || '{\"birthDate\":\"1990-01-01\"}'::jsonb");
    await expect(repo.get(fortuneSnapshotKey(data), new Date())).rejects.toThrow();
  });
});
