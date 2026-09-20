import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildCareerConfirmationCapabilitySql, buildCareerConfirmationRuntimeAclSql } from "../../../../../scripts/creator-career-confirmation-database-contract.mjs";
import { buildHiringRuntimeAclSql } from "../../../../../scripts/creator-hiring-database-contract.mjs";
import { HiringStore } from "../collaboration/hiring.store";

import { CareerConfirmationController } from "./career-confirmation.controller";
import { CareerConfirmationRepository } from "./career-confirmation.repository";
import { CreatorCareerRepository } from "./career.repository";
import { CreatorTeamRepository } from "./team.repository";

import type { CareerConfirmationRequestInput } from "../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerInput } from "../../../../../packages/contracts/src/creator-hiring";

// Coordinator only: same explicit opt-in and disposable URL guard as hiring-postgres.
// This file never creates or starts a database server or reads operator dotenv.
const database = process.env.CREATOR_HIRING_TEST_DATABASE_URL;
function disposable(raw: string) {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/creator_hiring_disposable_[a-z0-9_]+$/u.test(url.pathname) || url.search || url.hash) throw new Error("Explicit disposable loopback creator_hiring_disposable_* database required");
}
const content: CreatorCareerInput = { title: "완료한 선화", role: "lineart", startMonth: "2026-01", endMonth: "2026-06", episodeFrom: 1, episodeTo: 5, scope: "5회 선화 범위", contribution: "선화 직접 제작", portfolioUrl: "https://example.com/private-evidence", rights: "owned", visibility: "private", expectedRevision: 0 };

describe.skipIf(!database)("career confirmation actual 0078 + managed 0080 runtime persistence", () => {
  const schema = `career_test_${randomUUID().replaceAll("-", "")}`, role = `career_runtime_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool, pool: Pool, runtime: HiringStore, confirmations: CareerConfirmationRepository, career: CreatorCareerRepository, teams: CreatorTeamRepository, controller: CareerConfirmationController;
  beforeAll(async () => {
    disposable(database!);
    admin = new Pool({ connectionString: database!, max: 1, connectionTimeoutMillis: 3000 });
    await admin.query(`CREATE SCHEMA "${schema}"; CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    pool = new Pool({ connectionString: database!, max: 2, connectionTimeoutMillis: 3000, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text NOT NULL,status text NOT NULL DEFAULT 'active',role text NOT NULL DEFAULT 'user');
      CREATE TABLE member_message_block("blockerId" text NOT NULL,"blockedUserId" text NOT NULL,PRIMARY KEY("blockerId","blockedUserId"))`);
    for (const file of ["0047_creator_collaboration_board.sql", "0078_creator_hiring_workspace.sql", "0080_creator_career_confirmation.sql"]) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), "utf8"));
    await pool.query(buildHiringRuntimeAclSql(role, schema));
    await pool.query(buildCareerConfirmationRuntimeAclSql(role, schema));
    // Existing auth permission, needed for row locks; not granted by confirmation ACL.
    await pool.query(`GRANT UPDATE(status) ON "user" TO "${role}"`);
    await pool.query(buildCareerConfirmationCapabilitySql(role, schema));
    runtime = new HiringStore({ connect: async () => {
      const c = await pool.connect(); await c.query(`SET ROLE "${role}"`);
      return { query: c.query.bind(c), release: () => { void c.query("RESET ROLE").then(() => c.release(), () => c.release(true)); } };
    } } as unknown as Pool);
    confirmations = new CareerConfirmationRepository(runtime); career = new CreatorCareerRepository(runtime); teams = new CreatorTeamRepository(runtime); controller = new CareerConfirmationController(confirmations);
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP ROLE IF EXISTS "${role}"`); await admin.end(); }
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE creator_career_confirmation_event,creator_career_confirmation_receipt,creator_career_confirmation_request,"user",creator_hiring_outbox CASCADE; TRUNCATE member_message_block`);
    await pool.query(`INSERT INTO "user"(id,name) VALUES ('author','작성자'),('target','현재 팀원'),('other','제삼자')`);
  });
  async function fixture(visibility: "private" | "public" = "private") {
    const team = await teams.create("author", "선화 팀");
    await teams.invite("author", team.id, "target"); await teams.respond("target", team.id, true, 1);
    const source = await career.save("author", null, { ...content, visibility });
    const preview = await controller.preview({ careerId: source.id, versionId: source.versionId, teamId: team.id, targetAccountId: "target" }, "author");
    const input: CareerConfirmationRequestInput = { careerId: source.id, versionId: source.versionId, teamId: team.id, targetAccountId: "target", sourceDigest: preview.sourceDigest, requesterMembershipRevision: preview.requesterMembershipRevision, targetMembershipRevision: preview.targetMembershipRevision, mutationId: randomUUID(), consent: "exact-version-2026-09-20" };
    return { source, team, preview, input };
  }
  const respond = (id: string, action: "confirmed" | "declined" | "revoked", actor = "target", expectedRevision = 1) => controller.action(id, { action, expectedRevision, mutationId: randomUUID() }, actor);
  const summary = (id: string) => controller.publicSummaries({ careerIds: [id] });
  it("uses real runtime API requests, immutable snapshots and recipient-only confirmation without publishing private careers", async () => {
    const f = await fixture(); const request = await controller.request(f.input, "author");
    expect((await confirmations.list("target", "received")).items[0]).toMatchObject({ snapshot: f.preview.snapshot, direction: "received", canRespond: true });
    expect((await confirmations.list("other", "received")).items).toEqual([]);
    await expect(respond(request.id, "confirmed", "author")).rejects.toMatchObject({ status: 403 });
    await expect(respond(request.id, "confirmed", "other")).rejects.toMatchObject({ status: 404 });
    expect(await respond(request.id, "confirmed")).toMatchObject({ state: "confirmed", revision: 2 });
    expect(await summary(f.source.id)).toEqual([]);
    expect((await career.list("author"))[0].visibility).toBe("private");
    expect((await pool.query(`SELECT action FROM creator_career_confirmation_event ORDER BY revision`)).rows.map((r) => r.action)).toEqual(["requested", "confirmed"]);
  });
  it("rejects self, unrelated, invited, left and forged recipients, and stale preview membership epochs", async () => {
    const f = await fixture();
    const selection = { careerId: f.source.id, versionId: f.source.versionId, teamId: f.team.id, targetAccountId: "author" };
    await expect(controller.preview(selection, "author")).rejects.toMatchObject({ status: 403 });
    await expect(controller.preview({ ...selection, targetAccountId: "other" }, "author")).rejects.toMatchObject({ status: 403 });
    await teams.invite("author", f.team.id, "other");
    await expect(controller.preview({ ...selection, targetAccountId: "other" }, "author")).rejects.toMatchObject({ status: 403 });
    await teams.removeMember("author", f.team.id, "target");
    await expect(controller.request(f.input, "author")).rejects.toMatchObject({ status: 403 });
    await teams.invite("author", f.team.id, "target"); const invite = (await teams.invitations("target"))[0]; await teams.respond("target", f.team.id, true, invite.revision);
    await expect(controller.request(f.input, "author")).rejects.toMatchObject({ status: 409 });
    expect((await confirmations.collaborators("other")).items).toEqual([]);
  });
  it("has durable UUID receipts, 409 changed payloads, and one active request per version/target under races", async () => {
    const f = await fixture(); const first = await controller.request(f.input, "author");
    expect(await controller.request(f.input, "author")).toEqual(first);
    await expect(controller.request({ ...f.input, sourceDigest: "0".repeat(64) }, "author")).rejects.toMatchObject({ status: 409 });
    await expect(controller.request({ ...f.input, mutationId: randomUUID() }, "author")).rejects.toMatchObject({ status: 409 });
    const command = { action: "confirmed", expectedRevision: 1, mutationId: randomUUID() };
    const action = await controller.action(first.id, command, "target");
    expect(await controller.action(first.id, command, "target")).toEqual(action);
    await expect(controller.action(first.id, { ...command, action: "revoked" }, "target")).rejects.toMatchObject({ status: 409 });
    await respond(first.id, "revoked", "author", 2);
    expect(await controller.action(first.id, command, "target")).toEqual(action); // receipt remains historical
    expect((await confirmations.list("target", "received")).items[0].state).toBe("revoked");
  });
  it("supports declines and either-party revocation, with no content copied into audit/receipts", async () => {
    const f = await fixture(); const first = await controller.request(f.input, "author");
    await respond(first.id, "declined"); await expect(respond(first.id, "confirmed", "target", 2)).rejects.toMatchObject({ status: 409 });
    const second = await controller.request({ ...f.input, mutationId: randomUUID() }, "author");
    await respond(second.id, "confirmed"); await respond(second.id, "revoked", "target", 2);
    const third = await controller.request({ ...f.input, mutationId: randomUUID() }, "author"); await respond(third.id, "revoked", "author");
    const audit = JSON.stringify((await pool.query(`SELECT to_jsonb(e) FROM creator_career_confirmation_event e UNION ALL SELECT to_jsonb(r) FROM creator_career_confirmation_receipt r`)).rows);
    expect(audit).not.toContain("private-evidence"); expect(audit).not.toContain(content.contribution);
  });
  it("public batch exposes only a factual current tier/date/scope and ceases after publication-only version changes", async () => {
    const f = await fixture("public"); const first = await controller.request(f.input, "author"); await respond(first.id, "confirmed");
    const publicRows = await summary(f.source.id); expect(publicRows).toHaveLength(1);
    expect(Object.keys(publicRows[0]).sort()).toEqual(["careerId", "publicDigest", "tier", "confirmedAt", "expiresAt", "scope", "contribution", "startMonth", "endMonth"].sort());
    const wire = JSON.stringify(publicRows); for (const value of [first.id, f.source.versionId, f.team.id, "target", "private-evidence"]) expect(wire).not.toContain(`"${value}"`);
    await career.save("author", f.source.id, { ...content, expectedRevision: 1, visibility: "private" });
    expect(await summary(f.source.id)).toEqual([]);
    expect((await confirmations.list("target", "received")).items[0]).toMatchObject({ snapshot: null, state: "revoked" });
    await career.save("author", f.source.id, { ...content, expectedRevision: 2, visibility: "public" }); expect(await summary(f.source.id)).toEqual([]);
  });
  it("source edit and rights withdrawal redact snapshots and forbid acceptance; historical resumes remain self-declared", async () => {
    const f = await fixture("public"); const resume = await career.importResume("author", f.source.id, f.source.versionId, "작가", randomUUID());
    const before = (await pool.query(`SELECT content FROM creator_hiring_resume_version WHERE resume_id=$1`, [resume.id])).rows;
    const request = await controller.request(f.input, "author"); await career.revoke("author", f.source.id);
    await expect(respond(request.id, "confirmed")).rejects.toMatchObject({ status: 409 });
    expect((await confirmations.list("target", "received")).items[0].snapshot).toBeNull();
    expect((await pool.query(`SELECT content FROM creator_hiring_resume_version WHERE resume_id=$1`, [resume.id])).rows).toEqual(before);
    expect(JSON.stringify(before)).not.toContain("confirmed"); expect(await summary(f.source.id)).toEqual([]);
  });
  it.each(["suspended", "deleted"])("account %s redacts both audiences and cannot revive after restoration", async (status) => {
    const f = await fixture("public"); const request = await controller.request(f.input, "author"); await respond(request.id, "confirmed");
    await pool.query(`UPDATE "user" SET status=$1 WHERE id='target'`, [status]); expect(await summary(f.source.id)).toEqual([]);
    expect((await confirmations.list("author", "sent")).items[0].snapshot).toBeNull();
    await pool.query(`UPDATE "user" SET status='active' WHERE id='target'`); expect(await summary(f.source.id)).toEqual([]);
    await expect(respond(request.id, "confirmed", "target", 3)).rejects.toBeDefined();
  });
  it("bilateral blocks revoke and redact, and unblock/rejoin never revive requests", async () => {
    const f = await fixture("public"); const request = await controller.request(f.input, "author");
    await pool.query(`INSERT INTO member_message_block VALUES ('target','author')`);
    await expect(respond(request.id, "confirmed")).rejects.toMatchObject({ status: 403 });
    expect((await confirmations.list("target", "received")).items[0].snapshot).toBeNull();
    await pool.query(`DELETE FROM member_message_block`); expect(await summary(f.source.id)).toEqual([]);
    const second = await controller.request({ ...f.input, mutationId: randomUUID() }, "author");
    await teams.removeMember("target", f.team.id, "target");
    expect((await confirmations.list("author", "sent")).items.find((r) => r.id === second.id)?.snapshot).toBeNull();
    await teams.invite("author", f.team.id, "target"); const invite = (await teams.invitations("target"))[0]; await teams.respond("target", f.team.id, true, invite.revision);
    await expect(respond(second.id, "confirmed", "target", 2)).rejects.toMatchObject({ status: 409 });
  });
  it("source and physical account deletion keep only required immutable audit metadata", async () => {
    const f = await fixture(); const request = await controller.request(f.input, "author"); await career.remove("author", f.source.id, 1);
    const row = (await pool.query(`SELECT * FROM creator_career_confirmation_request WHERE id=$1`, [request.id])).rows[0];
    expect(row.snapshot).toBeNull(); expect(row.redaction_reason).toBe("source-deleted"); expect(row.source_digest).toBe(f.preview.sourceDigest);
    const source = await career.save("author", null, content);
    const preview = await confirmations.preview("author", { ...f.input, careerId: source.id, versionId: source.versionId });
    await controller.request({ ...f.input, careerId: source.id, versionId: source.versionId, sourceDigest: preview.sourceDigest, mutationId: randomUUID() }, "author");
    await pool.query(`DELETE FROM "user" WHERE id='author'`);
    const rows = (await pool.query(`SELECT snapshot FROM creator_career_confirmation_request`)).rows; expect(rows.every((r) => r.snapshot === null)).toBe(true);
  });
  it("persists command-time expiry with DB clock without a worker", async () => {
    const f = await fixture(); const id = randomUUID();
    await pool.query(`INSERT INTO creator_career_confirmation_request(id,requester_id,target_id,career_id,version_id,version_revision,team_id,requester_membership_revision,target_membership_revision,snapshot,source_digest,consent,created_at,expires_at)
      VALUES ($1,'author','target',$2,$3,1,$4,1,1,$5,$6,'exact-version-2026-09-20',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 second')`, [id, f.source.id, f.source.versionId, f.team.id, JSON.stringify(f.preview.snapshot), f.preview.sourceDigest]);
    expect((await confirmations.list("target", "received")).items[0].state).toBe("expired");
    expect(await respond(id, "confirmed")).toMatchObject({ state: "expired", revision: 2 });
    expect((await pool.query(`SELECT action FROM creator_career_confirmation_event WHERE request_id=$1`, [id])).rows[0].action).toBe("expired");
    expect(await summary(f.source.id)).toEqual([]);
  });
  it.each(["requester", "target"])("enforces persisted daily %s bounds before creating a request", async (limited) => {
    const f = await fixture();
    await pool.query(`INSERT INTO creator_career_confirmation_request(id,requester_id,target_id,career_id,version_id,version_revision,team_id,requester_membership_revision,target_membership_revision,snapshot,source_digest,consent,state)
      SELECT gen_random_uuid(),$1,'target',$2,$3,1,$4,1,1,$5,$6,'exact-version-2026-09-20','declined' FROM generate_series(1,$7::int)`,
    [limited === "requester" ? "author" : "other", f.source.id, f.source.versionId, f.team.id, JSON.stringify(f.preview.snapshot), f.preview.sourceDigest, limited === "requester" ? 20 : 50]);
    await expect(confirmations.request("author", f.input)).rejects.toMatchObject({ status: 429 });
    expect((await pool.query(`SELECT count(*)::int AS count FROM creator_career_confirmation_receipt`)).rows[0].count).toBe(0);
  });
  it("source changes serialize with acceptance and cannot leave active stale proof", async () => {
    const f = await fixture("public"); const request = await controller.request(f.input, "author");
    await Promise.allSettled([respond(request.id, "confirmed"), career.save("author", f.source.id, { ...content, visibility: "public", expectedRevision: 1, contribution: "새 기여" })]);
    expect((await career.list("author"))[0].revision).toBe(2); expect(await summary(f.source.id)).toEqual([]);
    expect((await confirmations.list("target", "received")).items[0]).toMatchObject({ state: "revoked", snapshot: null });
  });
  it("concurrent accept and revoke end in revoked state and concurrent requests cannot duplicate", async () => {
    const f = await fixture("public");
    const results = await Promise.allSettled([controller.request(f.input, "author"), controller.request({ ...f.input, mutationId: randomUUID() }, "author")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const request = (await confirmations.list("author", "sent")).items[0];
    await Promise.allSettled([respond(request.id, "confirmed"), respond(request.id, "revoked", "author")]);
    expect(await summary(f.source.id)).toEqual([]); expect((await confirmations.list("author", "sent")).items[0].state).toBe("revoked");
  });
  it("denies immutable audience/version/payload edits, event edits/deletes and DDL using the real runtime role", async () => {
    const f = await fixture(); const request = await controller.request(f.input, "author"); const c = await pool.connect();
    try {
      await c.query(`SET ROLE "${role}"`);
      for (const sql of [`UPDATE creator_career_confirmation_request SET target_id='other'`, `UPDATE creator_career_confirmation_request SET version_id='forged'`, `UPDATE creator_career_confirmation_event SET action='confirmed'`, `DELETE FROM creator_career_confirmation_event`, `DELETE FROM creator_career_confirmation_request`, `CREATE TABLE unauthorized(id text)`]) await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
      await expect(c.query(`UPDATE creator_career_confirmation_request SET snapshot='{}',revision=revision+1 WHERE id=$1`, [request.id])).rejects.toThrow(/redaction/u);
      await c.query("RESET ROLE");
      await c.query(`GRANT UPDATE(result) ON creator_career_confirmation_receipt TO "${role}"`);
      await expect(confirmations.capability("author")).rejects.toMatchObject({ status: 503 });
      await c.query(buildCareerConfirmationRuntimeAclSql(role, schema));
    } finally { await c.query("RESET ROLE"); c.release(); }
  });
  it("optional missing readiness is 503 while original career/manual/resume flows remain usable", async () => {
    const f = await fixture();
    await pool.query(`ALTER FUNCTION creator_career_confirmation_require_ready() RENAME TO fixture_unavailable`);
    try {
      await expect(confirmations.capability("author")).rejects.toMatchObject({ status: 503 });
      expect((await career.list("author"))[0].id).toBe(f.source.id);
      expect(await career.importResume("author", f.source.id, f.source.versionId, "작가", randomUUID())).toHaveProperty("id");
      expect((await teams.list("author"))[0].id).toBe(f.team.id);
    } finally { await pool.query(`ALTER FUNCTION fixture_unavailable() RENAME TO creator_career_confirmation_require_ready`); }
  });
});
