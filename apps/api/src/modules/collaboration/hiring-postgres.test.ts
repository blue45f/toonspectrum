import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildHiringCapabilitySql, buildHiringRuntimeAclSql } from "../../../../../scripts/creator-hiring-database-contract.mjs";

import { CreatorMeetingRepository } from "../meeting/meeting.repository";
import { CreatorCareerRepository } from "../recruitment/career.repository";
import { CreatorTeamRepository } from "../recruitment/team.repository";
import { CollaborationRepository } from "./collaboration.repository";
import { HiringAvailabilityRepository } from "./hiring-availability.repository";
import { HiringOfferRepository } from "./hiring-offer.repository";
import { HiringPositionRepository } from "./hiring-position.controller";
import { HiringResumeRepository } from "./hiring-resume.repository";
import { HiringSlotRepository } from "./hiring-slot.repository";
import { HiringStore } from "./hiring.store";

import type { HiringResumeInput, HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

// Opt-in only, with an explicitly disposable loopback database. Never use DATABASE_URL,
// dotenv, an existing application schema, or a remote service for this suite.
const database = process.env.CREATOR_HIRING_TEST_DATABASE_URL;
function assertDisposable(raw: string) {
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/creator_hiring_disposable_[a-z0-9_]+$/u.test(url.pathname) || url.search || url.hash) {
    throw new Error("A dedicated creator_hiring_disposable_* database on loopback, without URL options, is required.");
  }
}
const resume: HiringResumeInput = { title: "선화 이력서", expectedRevision: 0, content: { penName: "작가", summary: "선화 작업", roles: ["lineart"], tools: ["Clip Studio Paint"], formats: ["PSD"], languages: ["한국어"], experiences: [], portfolio: [{ title: "내 작업", url: "https://example.com/work", contribution: "선화", permission: "owned" }] } };

describe.skipIf(!database)("real disposable PostgreSQL hiring invariants (requires explicit test database)", () => {
  let pool: Pool, admin: Pool, store: HiringStore, resumes: HiringResumeRepository, slots: HiringSlotRepository,
    available: HiringAvailabilityRepository, offers: HiringOfferRepository, legacy: CollaborationRepository;
  const schema = `hiring_test_${randomUUID().replaceAll("-", "")}`;
  let base: number;
  beforeAll(async () => {
    assertDisposable(database!);
    admin = new Pool({ connectionString: database!, max: 1, connectionTimeoutMillis: 3000 });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: database!, max: 2, connectionTimeoutMillis: 3000, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text NOT NULL,status text NOT NULL DEFAULT 'active',role text NOT NULL DEFAULT 'user');
      CREATE TABLE member_message_block("blockerId" text NOT NULL,"blockedUserId" text NOT NULL,PRIMARY KEY("blockerId","blockedUserId"))`);
    await pool.query(await readFile(new URL("../../db/migrations/0047_creator_collaboration_board.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../../db/migrations/0078_creator_hiring_workspace.sql", import.meta.url), "utf8"));
    store = new HiringStore(pool); resumes = new HiringResumeRepository(store); slots = new HiringSlotRepository(store);
    available = new HiringAvailabilityRepository(store); offers = new HiringOfferRepository(store, available); legacy = new CollaborationRepository(pool);
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE "${schema}"."user", "${schema}".creator_hiring_outbox CASCADE`); await pool.query(`TRUNCATE member_message_block`);
    await pool.query(`INSERT INTO "user"(id,name,role) VALUES ('recruiter','모집자','user'),('a','작가 가','user'),('b','작가 나','user'),('outsider','관리자','admin')`);
    base = Date.now();
  });
  const iso = (offset: number) => new Date(base + offset).toISOString();
  const terms = (start = 60000, end = 3600000): HiringSlotTerms => ({ model: "freelance-task", role: "lineart", publicScope: "공개 선화 작업", quantity: 10, quantityUnit: "cut", startsAt: iso(start), dueAt: iso(end), timeZone: "Asia/Seoul", compensation: "paid", currency: "KRW", minRate: 10000, maxRate: 20000, rateUnit: "cut", tools: ["Clip Studio Paint"], formats: ["PSD"], revisionRounds: 2, acceptanceCriteria: "검수 완료", ndaRequired: false, creditPolicy: "활동명 표기", portfolioPolicy: "approval-required", aiPolicy: "prohibited" });
  async function post() {
    const id = randomUUID(); await pool.query(`INSERT INTO creator_collab_post(id,"userId",type,role,title,"payType","workMode",details) VALUES ($1,'recruiter','commission','ink','선화 모집','paid','remote','{}')`, [id]); return id;
  }
  async function confirm(actor = "a", capacity = 1) {
    return available.save(actor, { startsAt: iso(-1000), endsAt: iso(86400000), roles: ["lineart"], tools: ["Clip Studio Paint"], formats: ["PSD"], capacity, minRate: 10000, rateUnit: "cut", discoverable: true, notificationOptIn: true, expectedRevision: 0 });
  }
  async function offer(postId: string, candidate = "a", value = terms()) {
    const slot = await slots.save("recruiter", postId, null, { terms: value, expectedRevision: 0, expectedPostVersion: 1 });
    const result = await offers.send("recruiter", postId, slot.id, { candidateId: candidate, expectedRevision: 1, expiresAt: iso(1800000), mutationId: randomUUID() });
    return { ...result, slotId: slot.id };
  }
  async function submit(postId: string) {
    const source = await resumes.save("a", null, resume);
    const input = { resumeVersionId: source.versionId, portfolioIndexes: [0], message: "선화 작업에 지원합니다. 작업 일정을 협의하고 싶습니다.", contact: "artist@example.com", consentRevision: "2026-09-20" as const, expectedPostVersion: 1, mutationId: randomUUID() };
    return { source, input, receipt: await resumes.submit("a", postId, input) };
  }
  async function reserved() { return Number((await pool.query(`SELECT count(*) FROM creator_hiring_commitment WHERE state IN ('reserved','active')`)).rows[0].count); }

  it("finds eligible candidates beyond 100 exhausted accounts with one real SQL read and a truthful 30-result bound", async () => {
    const p = await post(), value = terms();
    await pool.query(`INSERT INTO "user"(id,name) SELECT 'bulk_'||lpad(n::text,3,'0'),'작가 '||n FROM generate_series(1,132) AS n;
      INSERT INTO creator_hiring_capacity(user_id) SELECT id FROM "user" WHERE id LIKE 'bulk_%';
      INSERT INTO creator_hiring_availability(user_id,starts_at,ends_at,confirmed_at,expires_at,roles,tools,formats,min_rate,rate_unit,discoverable,notification_opt_in,revision)
      SELECT id,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()+interval '1 hour',
      '["lineart"]','["Clip Studio Paint"]','["PSD"]',10000,'cut',true,true,1 FROM "user" WHERE id LIKE 'bulk_%'`);
    await pool.query(`INSERT INTO creator_hiring_slot(id,post_id,terms,starts_at,due_at)
      SELECT 'busy_'||n,$1,$2,$3,$4 FROM generate_series(1,100) AS n`, [p, JSON.stringify(value), value.startsAt, value.dueAt]);
    await pool.query(`INSERT INTO creator_hiring_offer(id,slot_id,candidate_id,recruiter_id,terms_revision,terms,expires_at)
      SELECT 'offer_'||n,'busy_'||n,'bulk_'||lpad(n::text,3,'0'),'recruiter',1,$1,$2 FROM generate_series(1,100) AS n`, [JSON.stringify(value), iso(1800000)]);
    await pool.query(`INSERT INTO creator_hiring_commitment(id,slot_id,offer_id,candidate_id,state,starts_at,ends_at,hold_expires_at)
      SELECT 'commit_'||n,'busy_'||n,'offer_'||n,'bulk_'||lpad(n::text,3,'0'),'active',$1,$2,$3 FROM generate_series(1,100) AS n`, [value.startsAt, value.dueAt, iso(1800000)]);
    const c = await pool.connect();
    try {
      const query = vi.spyOn(c, "query");
      const found = await available.candidates(c, "recruiter", value, true);
      expect(query).toHaveBeenCalledTimes(1); query.mockRestore();
      expect(found).toHaveLength(30); expect(found[0].userId).toBe("bulk_101"); expect(found.at(-1)?.userId).toBe("bulk_130");
      expect(found.every((candidate) => candidate.capacity === 1)).toBe(true);
      // HTTP discovery reads one sentinel beyond30 without changing campaign bounds.
      const first = await available.discover("recruiter", p, "busy_1", { expectedRevision: 1 });
      expect(first.items.map((item) => item.userId)).toEqual(found.map((item) => item.userId));
      expect(first.next).not.toBeNull(); expect(first.termsRevision).toBe(1);
      const second = await available.discover("recruiter", p, "busy_1", { expectedRevision: 1, after: first.next! });
      expect(second.items.map((item) => item.userId)).toEqual(["bulk_131", "bulk_132"]); expect(second.next).toBeNull();
      await expect(available.discover("outsider", p, "busy_1", { after: first.next! })).rejects.toMatchObject({ status: 403 });
      await expect(available.discover("recruiter", p, "busy_2", { after: first.next! })).rejects.toMatchObject({ status: 409 });
      await expect(available.discover("recruiter", p, "busy_1", { expectedRevision: 2 })).rejects.toMatchObject({ status: 409 });
      await c.query(`UPDATE creator_hiring_availability SET discoverable=false WHERE user_id='bulk_131'; INSERT INTO member_message_block VALUES ('bulk_132','recruiter')`);
      expect((await available.discover("recruiter", p, "busy_1", { after: first.next! })).items).toEqual([]);
      await c.query(`UPDATE creator_hiring_availability SET discoverable=true WHERE user_id='bulk_131'; DELETE FROM member_message_block`);
      await c.query(`UPDATE creator_collab_post SET version=version+1 WHERE id=$1`, [p]);
      await expect(available.discover("recruiter", p, "busy_1", { after: first.next! })).rejects.toMatchObject({ status: 409 });
      expect((await available.discover("recruiter", p, "busy_1")).items).toHaveLength(30);
      // Adjacent intervals must remain eligible in the SQL sweep as in peakOverlap.
      await c.query(`UPDATE creator_hiring_commitment SET starts_at=$1::timestamptz-interval '1 hour',ends_at=$1`, [value.startsAt]);
      expect((await available.candidates(c, "recruiter", value))[0].userId).toBe("bulk_001");
    } finally { c.release(); }
  });
  it("executes least-privilege ACL/capability SQL and repository writes as a non-owning runtime role", async () => {
    const role = `hiring_runtime_${randomUUID().replaceAll("-", "")}`;
    const c = await pool.connect();
    try {
      await c.query(`CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      await c.query(buildHiringRuntimeAclSql(role, schema));
      await c.query(buildHiringCapabilitySql(role, schema));
      // Existing auth contract grants status UPDATE, required for SELECT FOR SHARE.
      await c.query(`GRANT UPDATE(status) ON "user" TO "${role}"`);
      await c.query(`SET ROLE "${role}"`);
      await c.query(`SELECT creator_hiring_require_ready()`);
      const runtimeStore = new HiringStore({ connect: async () => ({ query: c.query.bind(c), release: () => {} }) } as unknown as Pool);
      const runtimeResumes = new HiringResumeRepository(runtimeStore);
      const saved = await runtimeResumes.save("a", null, resume);
      expect((await runtimeResumes.versions("a", saved.id))[0].id).toBe(saved.versionId);
      await runtimeResumes.remove("a", saved.id, 1);
      await c.query(`INSERT INTO creator_hiring_resume(id,user_id,title,revision) VALUES ('acl-resume','a','비공개',1);
        INSERT INTO creator_hiring_resume_version(id,resume_id,revision,content) VALUES ('acl-version','acl-resume',1,'{}')`);
      await expect(c.query(`UPDATE creator_hiring_resume_version SET content='{}' WHERE id='acl-version'`)).rejects.toMatchObject({ code: "42501" });
      await expect(c.query(`INSERT INTO creator_hiring_activity_ledger(id,user_id,source_type,source_id,kind,points) VALUES ('award','a','verified-production-completion','fake','award',10)`)).rejects.toMatchObject({ code: "42501" });
      await expect(c.query(`CREATE TABLE unauthorized(id text)`)).rejects.toMatchObject({ code: "42501" });
      await c.query(`DELETE FROM creator_hiring_resume WHERE id='acl-resume'`);
      await c.query(`RESET ROLE`);
      // Capability rejects drift even at the column level, then normalization repairs it.
      await c.query(`GRANT UPDATE(content) ON creator_hiring_resume_version TO "${role}"`);
      await expect(c.query(buildHiringCapabilitySql(role, schema))).rejects.toThrow(/column privileges/u);
      await c.query(buildHiringRuntimeAclSql(role, schema));
      await c.query(buildHiringCapabilitySql(role, schema));
    } finally {
      await c.query(`RESET ROLE; DROP OWNED BY "${role}"; DROP ROLE "${role}"`); c.release();
    }
  });
  it("sets local HTTP timeouts and releases a blocked transaction without retry", async () => {
    const p = await post(), blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query(`SELECT id FROM creator_collab_post WHERE id=$1 FOR UPDATE`, [p]);
      await expect(store.tx(async (c) => {
        expect((await c.query("SHOW statement_timeout")).rows[0].statement_timeout).toBe("10s");
        expect((await c.query("SHOW lock_timeout")).rows[0].lock_timeout).toBe("3s");
        await c.query(`SELECT id FROM creator_collab_post WHERE id=$1 FOR UPDATE`, [p]);
      })).rejects.toMatchObject({ status: 503 });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect((await pool.query("SHOW lock_timeout")).rows[0].lock_timeout).toBe("5s");
  });
  it("expires task-deadline holds and hides pending actions even with future offer expiry", async () => {
    await confirm("a"); await confirm("b"); const p = await post();
    const value = { ...terms(), startsAt: iso(-500), dueAt: new Date(Date.now() + 3000).toISOString() };
    const first = await offer(p, "a", value);
    const second = await offers.send("recruiter", p, first.slotId, { candidateId: "b", expectedRevision: 1, expiresAt: iso(1800000), mutationId: randomUUID() });
    const accepted = await offers.accept("a", first.id, randomUUID());
    expect(accepted.holdExpiresAt).toBe(value.dueAt);
    // Simulate a pre-fix long hold using a mutable fixture column; terms stay immutable.
    await pool.query(`UPDATE creator_hiring_commitment SET hold_expires_at=$1`, [iso(1800000)]);
    await pool.query(`SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp()))+0.05)`, [value.dueAt]);
    expect((await offers.list("b"))[0].state).toBe("expired");
    expect((await offers.list("a"))[0].state).toBe("expired");
    await expect(offers.accept("b", second.id, randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(offers.send("recruiter", p, first.slotId, { candidateId: "b", expectedRevision: 1, expiresAt: iso(1800000), mutationId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    const c = await pool.connect();
    try { expect(await available.candidates(c, "recruiter", value)).toEqual([]); } finally { c.release(); }
    expect((await slots.list("recruiter", p))[0].state).toBe("paused");
    expect((await pool.query(`SELECT state FROM creator_hiring_commitment`)).rows[0].state).toBe("expired");
    expect((await pool.query(`SELECT state FROM creator_hiring_outbox`)).rows[0].state).toBe("failed");
  });
  it("persists immutable owned versions and snapshots; legacy withdrawal/resubmission cannot revive old payloads", async () => {
    const p = await post(), data = await submit(p);
    await expect(resumes.snapshots("outsider", p, data.receipt.applicationId)).rejects.toMatchObject({ status: 404 });
    await expect(resumes.versions("b", data.source.id)).rejects.toMatchObject({ status: 404 });
    await resumes.save("a", data.source.id, { ...resume, expectedRevision: 1, content: { ...resume.content, summary: "수정된 내용" } });
    expect((await resumes.snapshots("recruiter", p, data.receipt.applicationId))[0].content?.summary).toBe("선화 작업");
    await expect(pool.query(`UPDATE creator_hiring_resume_version SET content='{}' WHERE id=$1`, [data.source.versionId])).rejects.toMatchObject({ code: "23514" });
    await expect(resumes.save("a", data.source.id, { ...resume, expectedRevision: 1 })).rejects.toMatchObject({ status: 409 });
    await legacy.withdraw(p, "a");
    await legacy.apply(p, "a", { message: data.input.message, contact: "new@example.com", portfolioUrl: "" });
    expect((await resumes.snapshots("recruiter", p, data.receipt.applicationId))[0].content).toBeNull();
    await legacy.withdraw(p, "a");
    const next = await resumes.submit("a", p, { ...data.input, mutationId: randomUUID() });
    expect(next.applicationId).toBe(data.receipt.applicationId);
    await resumes.remove("a", data.source.id, 2);
    expect((await resumes.snapshots("recruiter", p, next.applicationId)).every((s) => s.content === null)).toBe(true);
  });
  it("redacts snapshot payloads through legacy post deletion and account status deletion", async () => {
    const p = await post(), data = await submit(p);
    await pool.query(`UPDATE "user" SET status='deleted' WHERE id='a'`);
    expect((await pool.query(`SELECT resume_payload FROM creator_hiring_application_snapshot WHERE id=$1`, [data.receipt.snapshotId])).rows[0].resume_payload).toBeNull();
    expect((await legacy.applications(p, "recruiter"))[0]).toMatchObject({ message: "", contact: "", portfolioUrl: "", status: "withdrawn" });
    await expect(resumes.snapshots("recruiter", p, data.receipt.applicationId)).rejects.toMatchObject({ status: 404 });
    await pool.query(`UPDATE "user" SET status='active' WHERE id='a'`);
    const p2 = await post(), second = await submit(p2); await legacy.remove(p2, "recruiter");
    expect((await pool.query(`SELECT resume_payload FROM creator_hiring_application_snapshot WHERE id=$1`, [second.receipt.snapshotId])).rows[0].resume_payload).toBeNull();
  });
  it("returns the same persisted receipt after retry and rejects changed input with the same key", async () => {
    const p = await post(), data = await submit(p);
    expect(await resumes.submit("a", p, data.input)).toEqual(data.receipt);
    await expect(resumes.submit("a", p, { ...data.input, contact: "different@example.com" })).rejects.toMatchObject({ status: 409 });
    await legacy.remove(p, "recruiter");
    expect(await resumes.submit("a", p, data.input)).toEqual(data.receipt);
  });
  it("serializes two candidates for one slot and queues only one pending onboarding event", async () => {
    await confirm("a"); await confirm("b"); const p = await post(), a = await offer(p);
    const b = await offers.send("recruiter", p, a.slotId, { candidateId: "b", expectedRevision: 1, expiresAt: iso(1800000), mutationId: randomUUID() });
    const results = await Promise.allSettled([offers.accept("a", a.id, randomUUID()), offers.accept("b", b.id, randomUUID())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect(await reserved()).toBe(1);
    const receipt = results.find((r) => r.status === "fulfilled");
    if (receipt?.status === "fulfilled") expect(receipt.value).toMatchObject({ onboardingStatus: "pending", documentAccessGranted: false });
    expect((await pool.query(`SELECT state,payload FROM creator_hiring_outbox`)).rows).toHaveLength(1);
    expect((await pool.query(`SELECT count(*) FROM creator_hiring_commitment WHERE state='active'`)).rows[0].count).toBe("0");
  });
  it("serializes the candidate across different posts without forbidding adjacent work", async () => {
    await confirm(); const a = await offer(await post()), b = await offer(await post());
    const results = await Promise.allSettled([offers.accept("a", a.id, randomUUID()), offers.accept("a", b.id, randomUUID())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect(await reserved()).toBe(1);
    const next = await offer(await post(), "a", terms(3600000, 7200000));
    await offers.accept("a", next.id, randomUUID()); expect(await reserved()).toBe(2);
    const retry = randomUUID(), later = await offer(await post(), "a", terms(7200000, 10800000));
    const accepted = await offers.accept("a", later.id, retry); expect(await offers.accept("a", later.id, retry)).toEqual(accepted);
  });
  it("releases expired holds without a worker and enforces the partial unique slot index", async () => {
    await confirm(); const p = await post(), a = await offer(p); await offers.accept("a", a.id, randomUUID());
    const other = await pool.query(`INSERT INTO creator_hiring_offer(id,slot_id,candidate_id,recruiter_id,terms_revision,terms,expires_at) VALUES ($1,$2,'b','recruiter',1,$3,$4) RETURNING id`, [randomUUID(), a.slotId, JSON.stringify(terms()), iso(1800000)]);
    await expect(pool.query(`INSERT INTO creator_hiring_commitment(id,slot_id,offer_id,candidate_id,state,starts_at,ends_at,hold_expires_at) VALUES ($1,$2,$3,'b','reserved',$4,$5,$6)`, [randomUUID(), a.slotId, other.rows[0].id, iso(60000), iso(3600000), iso(1800000)])).rejects.toMatchObject({ code: "23505" });
    await pool.query(`UPDATE creator_hiring_commitment SET hold_expires_at=clock_timestamp()-interval '1 second'`);
    expect((await new HiringPositionRepository(store).list({ postId: p })).items).toHaveLength(1);
    expect((await offers.list("a"))[0].state).toBe("expired");
    expect((await slots.list("recruiter", p))[0].state).toBe("open"); expect(await reserved()).toBe(0);
    expect((await pool.query(`SELECT state FROM creator_hiring_outbox`)).rows[0].state).toBe("failed");
    const b = await offer(await post()); await offers.accept("a", b.id, randomUUID()); expect(await reserved()).toBe(1);
  });
  it("post closure and legacy withdrawal races never leave a reserved commitment", async () => {
    await confirm(); const p = await post(), a = await offer(p);
    await Promise.allSettled([offers.accept("a", a.id, randomUUID()), legacy.setStatus(p, "recruiter", "closed", 1)]);
    expect(await reserved()).toBe(0);
    const p2 = await post(); await submit(p2); const b = await offer(p2);
    await Promise.allSettled([offers.accept("a", b.id, randomUUID()), legacy.withdraw(p2, "a")]);
    expect(await reserved()).toBe(0);
    expect((await pool.query(`SELECT count(*) FROM creator_hiring_outbox WHERE state IN ('pending','processing')`)).rows[0].count).toBe("0");
  });
  it("a revoked availability/blocked pair cannot accept a previously issued offer", async () => {
    await confirm(); const a = await offer(await post());
    await pool.query(`UPDATE creator_hiring_availability SET notification_opt_in=false WHERE user_id='a'`);
    await expect(offers.accept("a", a.id, randomUUID())).rejects.toMatchObject({ status: 409 });
    await pool.query(`UPDATE creator_hiring_availability SET notification_opt_in=true WHERE user_id='a'`);
    await pool.query(`INSERT INTO member_message_block VALUES ('a','recruiter')`);
    await expect(offers.accept("a", a.id, randomUUID())).rejects.toMatchObject({ status: 409 }); expect(await reserved()).toBe(0);
  });
  it("targets team invitations and makes removed room admission terminal across re-invitation", async () => {
    const teams = new CreatorTeamRepository(store), rooms = new CreatorMeetingRepository(store, teams);
    const t = await teams.create("recruiter", "제작팀"); await teams.invite("recruiter", t.id, "a");
    await expect(teams.respond("b", t.id, true, 1)).rejects.toMatchObject({ status: 409 });
    await teams.respond("a", t.id, true, 1);
    await expect(teams.removeMember("recruiter", t.id, "recruiter")).rejects.toMatchObject({ status: 409 });
    await expect(teams.saveGroup("recruiter", t.id, null, "다른 팀원", ["b"])).rejects.toMatchObject({ status: 403 });
    const room = await rooms.create("recruiter", { kind: "meeting", title: "회의", teamId: t.id, applicationId: null, participantIds: ["a"], startsAt: iso(60000), endsAt: iso(3600000) });
    await rooms.enter("a", room.id, 1); await rooms.host("recruiter", room.id, { action: "admit", targetAccountId: "a", expectedEpoch: 1 });
    await expect(rooms.message("a", room.id, { expectedEpoch: 1, audience: "admitted", text: "오래된 세대" })).rejects.toMatchObject({ status: 409 });
    await teams.removeMember("recruiter", t.id, "a"); await teams.invite("recruiter", t.id, "a"); await teams.respond("a", t.id, true, 3);
    await expect(rooms.get("a", room.id)).rejects.toMatchObject({ status: 403 });
  });
  it("career rights revocation hides public links and erases submitted derived copies", async () => {
    const careers = new CreatorCareerRepository(store);
    const career = await careers.save("a", null, { title: "내 작품", role: "lineart", startMonth: "2026-01", endMonth: null, episodeFrom: 1, episodeTo: 3, scope: "선화", contribution: "선화 담당", portfolioUrl: "https://example.com/portfolio", rights: "owned", visibility: "public", expectedRevision: 0 });
    const imported = await careers.importResume("a", career.id, career.versionId, "작가", randomUUID());
    const version = (await resumes.versions("a", imported.id))[0], p = await post();
    await resumes.submit("a", p, { resumeVersionId: version.id, portfolioIndexes: [0], message: "선화 작업에 지원합니다. 경력 버전을 제출합니다.", contact: "a@example.com", consentRevision: "2026-09-20", expectedPostVersion: 1, mutationId: randomUUID() });
    expect(await careers.gallery()).toHaveLength(1); await careers.revoke("a", career.id); expect(await careers.gallery()).toHaveLength(0);
    expect((await resumes.list("a"))[0].submissionBlocked).toBe(true);
    expect((await pool.query(`SELECT resume_payload FROM creator_hiring_application_snapshot`)).rows[0].resume_payload).toBeNull();
    await expect(careers.importResume("a", career.id, career.versionId, "작가", randomUUID())).rejects.toMatchObject({ status: 409 });
  });
});
