import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildHiringCapabilitySql, buildHiringRuntimeAclSql } from "../../../../../scripts/creator-hiring-database-contract.mjs";
import { buildHiringAutomationCapabilitySql, buildHiringAutomationRuntimeAclSql } from "../../../../../scripts/creator-hiring-automation-database-contract.mjs";
import { buildCareerConfirmationCapabilitySql, buildCareerConfirmationRuntimeAclSql } from "../../../../../scripts/creator-career-confirmation-database-contract.mjs";
import { HiringAutomationRepository } from "./hiring-automation.repository";
import { hiringAutomationConfig } from "./hiring-automation.config";
import { HiringCampaignRepository } from "./hiring-campaign.repository";
import { HiringSlotRepository } from "./hiring-slot.repository";
import { HiringStore } from "./hiring.store";

import type { CampaignJob } from "./hiring-automation.repository";
import type { HiringSlotTerms } from "../../../../../packages/contracts/src/creator-hiring";

const database = process.env.CREATOR_HIRING_TEST_DATABASE_URL;
const config = hiringAutomationConfig({ CREATOR_HIRING_AUTOMATION: "in-app-v1" });
const schema = `hiring_auto_${randomUUID().replaceAll("-", "")}`;
const role = `hiring_auto_runtime_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!database)("automatic hiring on the real 0078/0079/0080 runtime boundary", () => {
  let admin: Pool, owner: Pool, runtime: Pool, store: HiringStore, jobs: HiringAutomationRepository, campaigns: HiringCampaignRepository, slots: HiringSlotRepository;
  let terms: HiringSlotTerms;
  beforeAll(async () => {
    const url = new URL(database!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/creator_hiring_disposable_[a-z0-9_]+$/u.test(url.pathname) || url.search || url.hash) throw new Error("An explicitly disposable loopback hiring database is required");
    admin = new Pool({ connectionString: database!, max: 1 });
    await admin.query(`CREATE SCHEMA "${schema}"; CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    owner = new Pool({ connectionString: database!, max: 2, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=3000` });
    await owner.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text NOT NULL,status text NOT NULL DEFAULT 'active',role text NOT NULL DEFAULT 'user');
      CREATE TABLE member_message_block("blockerId" text NOT NULL,"blockedUserId" text NOT NULL,PRIMARY KEY("blockerId","blockedUserId"))`);
    for (const file of ["0047_creator_collaboration_board.sql", "0078_creator_hiring_workspace.sql", "0079_creator_hiring_automation.sql", "0080_creator_career_confirmation.sql"]) await owner.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), "utf8"));
    await owner.query(buildHiringRuntimeAclSql(role, schema));
    await owner.query(buildHiringAutomationRuntimeAclSql(role, schema));
    await owner.query(buildCareerConfirmationRuntimeAclSql(role, schema));
    await owner.query(`GRANT UPDATE(status) ON "user" TO "${role}"`);
    await owner.query(buildHiringCapabilitySql(role, schema));
    await owner.query(buildHiringAutomationCapabilitySql(role, schema));
    await owner.query(buildCareerConfirmationCapabilitySql(role, schema));
    runtime = new Pool({ connectionString: database!, max: 4, options: `-c search_path=${schema} -c role=${role} -c statement_timeout=10000 -c lock_timeout=3000` });
    store = new HiringStore(runtime); campaigns = new HiringCampaignRepository(store); jobs = new HiringAutomationRepository(store, config, campaigns); slots = new HiringSlotRepository(store);
  }, 30000);
  afterAll(async () => {
    if (runtime) await runtime.end(); if (owner) await owner.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP OWNED BY "${role}"; DROP ROLE IF EXISTS "${role}"`); await admin.end(); }
  });
  beforeEach(async () => {
    await owner.query(`TRUNCATE "user",creator_hiring_outbox,member_message_block CASCADE;
      INSERT INTO "user"(id,name) VALUES ('recruiter','모집자'),('outsider','외부인');
      INSERT INTO "user"(id,name) SELECT 'artist_'||lpad(n::text,2,'0'),'작가 '||n FROM generate_series(1,12) n;
      INSERT INTO creator_hiring_capacity(user_id) SELECT id FROM "user" WHERE id LIKE 'artist_%';
      INSERT INTO creator_hiring_availability(user_id,starts_at,ends_at,confirmed_at,expires_at,roles,tools,formats,min_rate,rate_unit,discoverable,notification_opt_in,revision)
        SELECT id,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()+interval '1 hour','["lineart"]','["ToonStudio"]','["PNG"]',1000,'cut',true,true,1 FROM "user" WHERE id LIKE 'artist_%'`);
    terms = { model: "freelance-task", role: "lineart", publicScope: "선화 작업", quantity: 3, quantityUnit: "cut", startsAt: new Date(Date.now()+60000).toISOString(), dueAt: new Date(Date.now()+3600000).toISOString(), timeZone: "Asia/Seoul", compensation: "paid", currency: "KRW", minRate: 1000, maxRate: 2000, rateUnit: "cut", tools: ["ToonStudio"], formats: ["PNG"], revisionRounds: 1, acceptanceCriteria: "선화 검수", ndaRequired: false, creditPolicy: "필명 기재", portfolioPolicy: "approval-required", aiPolicy: "prohibited" };
  });
  async function fixture() {
    const postId = randomUUID();
    await owner.query(`INSERT INTO creator_collab_post(id,"userId",type,role,title,"payType","workMode",details) VALUES ($1,'recruiter','commission','ink','선화 모집','paid','remote','{}')`, [postId]);
    const slot = await slots.save("recruiter", postId, null, { terms, expectedRevision: 0, expectedPostVersion: 1 });
    return { postId, slotId: slot.id, input: { mutationId: randomUUID(), expectedRevision: 1, expectedPostVersion: 1, mode: "automatic" as const } };
  }
  async function started() { const f = await fixture(); await jobs.start("recruiter", f.postId, f.slotId, f.input); return f; }
  async function claim(): Promise<CampaignJob> { const job = await jobs.claim(); expect(job).not.toBeNull(); return job!; }
  async function count() { return Number((await owner.query(`SELECT count(*) AS n FROM creator_hiring_invitation`)).rows[0].n); }

  it("serializes two claimers and retains the same start receipt", async () => {
    const f = await fixture();
    const first = await jobs.start("recruiter", f.postId, f.slotId, f.input);
    expect(await jobs.start("recruiter", f.postId, f.slotId, f.input)).toEqual(first);
    const claimed = await Promise.all([jobs.claim(), jobs.claim()]); expect(claimed.filter(Boolean)).toHaveLength(1);
    const state = await jobs.state("recruiter", f.postId, f.slotId);
    expect(JSON.stringify(state)).not.toContain("claim_token"); expect(JSON.stringify(state)).not.toContain(claimed.find(Boolean)!.claim_token!);
  });
  it("replays a committed round after lost acknowledgement without duplicate invitations", async () => {
    const f = await started(); const job = await claim();
    const result = await jobs.execute(job); expect(result).toMatchObject({ round: 1, sent: 5 });
    expect(await jobs.execute(job)).toEqual(result); expect(await count()).toBe(5);
    await owner.query(`UPDATE creator_hiring_campaign_job SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`, [job.id]);
    const recovered = await claim(); expect(recovered.claim_token).not.toBe(job.claim_token);
    expect(await jobs.execute(recovered)).toEqual(result); await jobs.acknowledge(recovered);
    expect(await count()).toBe(5); expect((await jobs.state("recruiter", f.postId, f.slotId)).job?.status).toBe("queued");
    await expect(jobs.acknowledge(job)).rejects.toMatchObject({ status: 409 });
  });
  it("sends the second bounded batch only when due and completes with distinct recipients", async () => {
    await started(); const first = await claim(); await jobs.execute(first); await jobs.acknowledge(first);
    expect(await jobs.claim()).toBeNull();
    await owner.query(`UPDATE creator_hiring_campaign SET next_dispatch_at=clock_timestamp()-interval '1 second'; UPDATE creator_hiring_campaign_job SET next_execution_at=clock_timestamp()-interval '1 second'`);
    const second = await claim(); expect(await jobs.execute(second)).toMatchObject({ round: 2, sent: 7 }); await jobs.acknowledge(second);
    expect(await count()).toBe(12); expect(await jobs.claim()).toBeNull();
    const result = await owner.query(`SELECT count(DISTINCT candidate_id)::int AS n FROM creator_hiring_invitation`); expect(result.rows[0].n).toBe(12);
  });
  it("manual and automatic execution cannot double-dispatch a round", async () => {
    const f = await started(), job = await claim();
    await Promise.allSettled([campaigns.dispatch("recruiter", f.postId, f.slotId, randomUUID()), jobs.execute(job)]);
    expect(await count()).toBe(5);
    expect((await owner.query(`SELECT round FROM creator_hiring_campaign WHERE slot_id=$1`, [f.slotId])).rows[0].round).toBe(1);
  });
  it("cancels queued invitations and fences a claimed job when stopped", async () => {
    const f = await started(), job = await claim(); await jobs.execute(job);
    await jobs.stop("recruiter", f.postId, f.slotId);
    await expect(jobs.execute(job)).rejects.toMatchObject({ status: 409 });
    expect((await owner.query(`SELECT count(*)::int AS n FROM creator_hiring_invitation WHERE state<>'cancelled'`)).rows[0].n).toBe(0);
    expect(await jobs.claim()).toBeNull();
  });
  it("stops on a terms change and requires fresh version-bound consent", async () => {
    const f = await started(), old = await claim();
    await slots.save("recruiter", f.postId, f.slotId, { terms: { ...terms, quantity: 4 }, expectedRevision: 1, expectedPostVersion: 1 });
    await expect(jobs.execute(old)).rejects.toMatchObject({ status: 409 });
    await expect(jobs.start("recruiter", f.postId, f.slotId, { ...f.input, mutationId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await jobs.start("recruiter", f.postId, f.slotId, { ...f.input, mutationId: randomUUID(), expectedRevision: 2 });
    const fresh = await claim(); expect(fresh.generation).toBe(2); await expect(jobs.execute(old)).rejects.toMatchObject({ status: 409 });
    expect(await jobs.execute(fresh)).toMatchObject({ sent: 5 });
  });
  it("account suspension permanently stops the pending generation", async () => {
    await started(); const job = await claim();
    await owner.query(`UPDATE "user" SET status='suspended' WHERE id='recruiter'; UPDATE "user" SET status='active' WHERE id='recruiter'`);
    await expect(jobs.execute(job)).rejects.toMatchObject({ status: 409 }); expect(await count()).toBe(0); expect(await jobs.claim()).toBeNull();
  });
  it("rechecks notification consent, blocks and task deadlines before effects", async () => {
    const f = await started(); const job = await claim();
    await owner.query(`UPDATE creator_hiring_availability SET notification_opt_in=false WHERE user_id='artist_01'; INSERT INTO member_message_block VALUES ('artist_02','recruiter')`);
    await jobs.execute(job);
    expect((await owner.query(`SELECT count(*)::int AS n FROM creator_hiring_invitation WHERE candidate_id IN ('artist_01','artist_02')`)).rows[0].n).toBe(0);
    await jobs.acknowledge(job);
    await owner.query(`UPDATE creator_hiring_slot SET starts_at=clock_timestamp()-interval '2 hours',due_at=clock_timestamp()-interval '1 second' WHERE id=$1;`, [f.slotId]);
    await owner.query(`UPDATE creator_hiring_campaign_job SET next_execution_at=clock_timestamp()-interval '1 second'`);
    expect(await jobs.claim()).toBeNull(); expect((await jobs.state("recruiter", f.postId, f.slotId)).job?.status).toBe("expired");
  });
  it("bounds retries, rejects stolen claims and never exposes private errors", async () => {
    await started(); const first = await claim(); await expect(jobs.execute({ ...first, claim_token: randomUUID() })).rejects.toMatchObject({ status: 409 });
    for (let attempt=1; attempt<=5; attempt++) {
      const job = attempt === 1 ? first : await claim(); await jobs.fail(job);
      if (attempt<5) await owner.query(`UPDATE creator_hiring_campaign_job SET next_execution_at=clock_timestamp()-interval '1 second'`);
    }
    expect(await jobs.claim()).toBeNull(); expect((await owner.query(`SELECT status,terminal_reason FROM creator_hiring_campaign_job`)).rows[0]).toEqual({ status: "failed", terminal_reason: "attempts-exhausted" });
  });
  it("keeps new automation unavailable without its readiness while manual hiring remains functional", async () => {
    const f=await fixture(); await owner.query(`ALTER FUNCTION creator_hiring_automation_require_ready() RENAME TO fixture_unavailable`);
    try {
      await expect(jobs.start("recruiter", f.postId, f.slotId, f.input)).rejects.toMatchObject({ status: 503 });
      expect(await campaigns.dispatch("recruiter", f.postId, f.slotId, randomUUID())).toMatchObject({ sent: 5 });
    } finally { await owner.query(`ALTER FUNCTION fixture_unavailable() RENAME TO creator_hiring_automation_require_ready`); }
  });
  it("uses non-owner DML only and protects immutable effect receipts", async () => {
    await started(); const job=await claim(); await jobs.execute(job);
    await expect(runtime.query(`UPDATE creator_hiring_campaign_round SET result='{}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(owner.query(`UPDATE creator_hiring_campaign_round SET result='{}'`)).rejects.toThrow(/immutable/u);
    await expect(runtime.query(`DELETE FROM creator_hiring_campaign_job`)).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query(`CREATE TABLE forbidden(id text)`)).rejects.toMatchObject({ code: "42501" });
    await owner.query(buildHiringAutomationCapabilitySql(role,schema)); await owner.query(buildCareerConfirmationCapabilitySql(role,schema));
  });
  it("rejects non-owners and keeps default-off starts fail-closed", async () => {
    const f=await fixture(); await expect(jobs.start("outsider",f.postId,f.slotId,f.input)).rejects.toMatchObject({ status: 403 });
    const disabled=new HiringAutomationRepository(store,hiringAutomationConfig({}),campaigns);
    await expect(async () => disabled.start("recruiter",f.postId,f.slotId,f.input)).rejects.toMatchObject({ status: 503 });
    expect((await disabled.state("recruiter",f.postId,f.slotId)).enabled).toBe(false); expect(await count()).toBe(0);
  });
});
