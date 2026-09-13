import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../../db/schema";
import { PromotionService } from "../promotion/promotion.service";

import { CollaborationRepository } from "./collaboration.repository";
import { CollaborationService, parseCollaborationQuery } from "./collaboration.service";

import type { CollaborationInput } from "../../../../../packages/core/src/collaboration";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Only replace dependency wiring: all SQL, transactions, locks and ORM operations
// below execute against a real PostgreSQL server, never a mocked query function.
const context = vi.hoisted(() => ({
  pool: undefined as Pool | undefined,
  database: undefined as NodePgDatabase<typeof schema> | undefined,
}));
vi.mock("../../db", async () => ({
  ...await import("../../db/schema"),
  get dbPool() { return context.pool; },
  get db() { return context.database; },
}));

const enabled = process.env.CREATOR_HUB_POSTGRES_INTEGRATION === "1";
const testUrl = process.env.TEST_DATABASE_URL;
if (enabled) {
  const target = new URL(testUrl ?? "invalid:");
  if (process.env.NODE_ENV !== "test"
    || !["postgres:", "postgresql:"].includes(target.protocol)
    || !["127.0.0.1", "[::1]"].includes(target.hostname)
    || !target.username || !target.password || target.search || target.hash
    || !/^\/toonspectrum_creator_hub_test$/u.test(target.pathname)
    || process.env.VERCEL || process.env.RENDER_SERVICE_ID) {
    throw new Error("Creator hub integration requires an explicit local, disposable toonspectrum_creator_hub_test database in test mode.");
  }
}
const integration = enabled ? describe : describe.skip;
const migrations = ["0046_creator_promotion_community.sql", "0047_creator_collaboration_board.sql"];
const input: CollaborationInput = {
  type: "team", role: "ink", title: "웹툰 선화 작업자를 구합니다", payType: "negotiable", workMode: "remote",
  details: { description: "함께 웹툰을 완성할 선화 작가를 구합니다. 주간 연재 프로젝트의 작업량과 일정을 협의합니다.",
    deliverables: "주 10컷 PSD 납품", terms: "저작권과 크레딧 협의", compensation: "납품 후 7일 이내 지급",
    budgetMin: null, budgetMax: null, budgetUnit: "episode", deadline: "", location: "", genre: "판타지", tools: [], portfolioUrl: "" },
};
const application = { message: "매주 10컷 작업이 가능하고 기존 선화 작업 경험이 있습니다.", contact: "private-applicant@example.test", portfolioUrl: "https://example.test/private-portfolio" };
const promotion = { kind: "trailer", stage: "debut", genre: "판타지", title: "첫 웹툰을 소개합니다", seriesTitle: "별빛의 여행",
  description: "첫 번째 작품의 이야기를 소개합니다. 새로운 세계의 모험을 함께해 주세요.", readingUrl: "https://example.com/story",
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", cover: "", tags: ["첫연재"], contentWarning: "", rightsConfirmed: true };

integration("Creator hub real PostgreSQL migrations, privacy and concurrency", () => {
  const namespace = `creator_hub_${randomUUID().replaceAll("-", "")}`;
  let owner: Pool;
  let pool: Pool;
  let repository: CollaborationRepository;
  let collaboration: CollaborationService;
  let promotions: PromotionService;
  let created = false;

  async function migrate() {
    for (const migration of migrations) {
      await pool.query(await readFile(resolve("apps/api/src/db/migrations", migration), "utf8"));
    }
  }
  beforeAll(async () => {
    owner = new Pool({ connectionString: testUrl, max: 1, connectionTimeoutMillis: 5000 });
    await owner.query(`CREATE SCHEMA "${namespace}"`);
    created = true;
    pool = new Pool({ connectionString: testUrl, max: 12, connectionTimeoutMillis: 5000,
      options: `-c search_path=${namespace} -c statement_timeout=10000`, application_name: namespace });
    context.pool = pool;
    context.database = drizzle(pool, { schema });
    await pool.query(`CREATE TABLE "user" (id text PRIMARY KEY, name text, role text NOT NULL, status text NOT NULL)`);
    await migrate();
    repository = new CollaborationRepository(pool);
    collaboration = new CollaborationService(repository);
    promotions = new PromotionService();
  }, 20000);
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE "user" CASCADE');
    await pool.query(`INSERT INTO "user" (id,name,role,status) VALUES
      ('owner','작성자','user','active'),('applicant','지원자','user','active'),
      ('outsider','다른 사용자','user','active'),('moderator','운영자','operator','active')`);
  });
  afterAll(async () => {
    await pool?.end();
    if (created) await owner.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await owner?.end();
  });

  it("reapplies both additive migrations without losing posts or private applications", async () => {
    const { id } = await repository.create("owner", input);
    await repository.apply(id, "applicant", application);
    const promoted = await promotions.create("owner", promotion);
    await migrate();
    expect((await repository.get(id)).title).toBe(input.title);
    expect((await repository.ownApplication(id, "applicant"))?.contact).toBe(application.contact);
    expect((await promotions.detail(promoted.id)).post.title).toBe(promotion.title);
    const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname=$1`, [namespace]);
    expect(tables.rows).toHaveLength(9);
    const indexes = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE 'idx_%'`, [namespace]);
    expect(indexes.rows.length).toBeGreaterThanOrEqual(13);
  });

  it("keeps applications private across real owner, applicant and outsider identities", async () => {
    const { id } = await collaboration.create("owner", input);
    await collaboration.apply(id, "applicant", application);
    expect((await collaboration.applications(id, "owner"))[0].contact).toBe(application.contact);
    await expect(collaboration.applications(id, "outsider")).rejects.toMatchObject({ status: 403 });
    await expect(collaboration.update(id, "outsider", { ...input, version: 1 })).rejects.toMatchObject({ status: 403 });
    expect((await collaboration.detail(id, "outsider")).application).toBeNull();
    expect((await collaboration.detail(id, "applicant")).application?.contact).toBe(application.contact);
    const publicPage = JSON.stringify(await collaboration.list({}));
    expect(publicPage).not.toContain(application.contact);
    expect(publicPage).not.toContain(application.message);
    await expect(collaboration.create(undefined, input)).rejects.toMatchObject({ status: 401 });
  });

  it("erases withdrawn private details and permits an explicit new application", async () => {
    const { id } = await repository.create("owner", input);
    await repository.apply(id, "applicant", application);
    await repository.withdraw(id, "applicant");
    const withdrawn = await repository.ownApplication(id, "applicant");
    expect(withdrawn).toMatchObject({ status: "withdrawn", contact: "", message: "", portfolioUrl: "" });
    await expect(repository.setApplicationStatus(id, withdrawn!.id, "owner", "shortlisted")).rejects.toMatchObject({ status: 409 });
    await repository.apply(id, "applicant", { ...application, contact: "new@example.test" });
    expect(await repository.ownApplication(id, "applicant")).toMatchObject({ status: "submitted", contact: "new@example.test" });
  });

  it("removes bookmarks and private application contents when an owner deletes a post", async () => {
    const { id } = await repository.create("owner", input);
    await repository.apply(id, "applicant", application);
    await repository.bookmark(id, "outsider", true);
    await repository.remove(id, "owner");
    await expect(repository.get(id)).rejects.toMatchObject({ status: 404 });
    expect(await repository.ownApplication(id, "applicant")).toMatchObject({ status: "withdrawn", contact: "", message: "", portfolioUrl: "" });
    expect((await pool.query(`SELECT * FROM creator_collab_bookmark WHERE "postId"=$1`, [id])).rows).toHaveLength(0);
  });

  it("serializes competing edits so exactly one stale-version update succeeds", async () => {
    const { id } = await repository.create("owner", input);
    const results = await Promise.allSettled([repository.update(id, "owner", input, 1), repository.update(id, "owner", { ...input, title: "변경된 선화 작업자 모집" }, 1)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await repository.get(id)).version).toBe(2);
  });

  it("never duplicates a concurrently submitted application", async () => {
    const { id } = await repository.create("owner", input);
    const results = await Promise.allSettled([repository.apply(id, "applicant", application), repository.apply(id, "applicant", application)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await repository.applications(id, "owner")).toHaveLength(1);
  });

  it("rejects an application waiting on the parent lock after closure commits", async () => {
    const { id } = await repository.create("owner", input);
    const blocker = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT id FROM creator_collab_post WHERE id=$1 FOR UPDATE`, [id]);
      pending = repository.apply(id, "applicant", application).catch((error: unknown) => error);
      await vi.waitFor(async () => {
        const waits = await owner.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'`, [namespace]);
        expect(waits.rows[0].count).toBeGreaterThan(0);
      }, { timeout: 5000, interval: 20 });
      await blocker.query(`UPDATE creator_collab_post SET status='closed',version=version+1 WHERE id=$1`, [id]);
      await blocker.query("COMMIT");
      expect(await pending).toMatchObject({ status: 409 });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
    }
    expect(await repository.applications(id, "owner")).toHaveLength(0);
  });

  it("enforces the daily collaboration quota under simultaneous requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => repository.create("owner", input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 });
    expect((await repository.list(parseCollaborationQuery({}))).items).toHaveLength(5);
  });

  it("keeps moderated collaboration posts out of public and saved views", async () => {
    const { id } = await repository.create("owner", input);
    await repository.bookmark(id, "outsider", true);
    await expect(repository.moderate(id, "outsider", true)).rejects.toMatchObject({ status: 403 });
    await repository.moderate(id, "moderator", true);
    await expect(repository.get(id, "outsider")).rejects.toMatchObject({ status: 404 });
    expect((await repository.list(parseCollaborationQuery({ view: "saved" }, "outsider"), "outsider")).items).toHaveLength(0);
    await repository.bookmark(id, "outsider", false);
    expect((await repository.get(id, "owner")).hidden).toBe(true);
  });

  it("publishes and searches promotions with literal SQL wildcard characters", async () => {
    const { id } = await promotions.create("owner", { ...promotion, title: "100%_작품을 소개합니다" });
    await promotions.create("outsider", promotion);
    expect((await promotions.list({ q: "%_" })).items.map((post) => post.id)).toEqual([id]);
    expect((await promotions.detail(id)).post.title).toBe("100%_작품을 소개합니다");
  });

  it("protects promotion ownership and optimistic versions with real SQL", async () => {
    const { id } = await promotions.create("owner", promotion);
    await expect(promotions.update(id, "outsider", { ...promotion, version: 1 })).rejects.toMatchObject({ status: 409 });
    const results = await Promise.allSettled([promotions.update(id, "owner", { ...promotion, version: 1 }), promotions.update(id, "owner", { ...promotion, version: 1 })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await promotions.detail(id)).post.version).toBe(2);
  });

  it("hides archived promotions and blocks new comments", async () => {
    const { id } = await promotions.create("owner", promotion);
    await promotions.archive(id, "owner", { archived: true, version: 1 });
    expect((await promotions.list({})).items).toHaveLength(0);
    await expect(promotions.detail(id, "outsider")).rejects.toMatchObject({ status: 404 });
    await expect(promotions.comment(id, "outsider", { text: "비공개 댓글" })).rejects.toMatchObject({ status: 404 });
    expect((await promotions.detail(id, "owner")).post.archived).toBe(true);
  });

  it("protects comments and moderation across different accounts", async () => {
    const { id } = await promotions.create("owner", promotion);
    await promotions.comment(id, "applicant", { text: "작품을 응원합니다" });
    const comment = (await promotions.detail(id)).comments[0];
    await expect(promotions.deleteComment(id, comment.id, "outsider")).rejects.toMatchObject({ status: 403 });
    await expect(promotions.moderate(id, "outsider", { hidden: true })).rejects.toMatchObject({ status: 403 });
    await promotions.deleteComment(id, comment.id, "applicant");
    await promotions.report(id, "outsider", { reason: "검토가 필요한 게시물 신고입니다." });
    expect(await promotions.reports("moderator")).toHaveLength(1);
    await promotions.moderate(id, "moderator", { hidden: true });
    await expect(promotions.detail(id, "outsider")).rejects.toMatchObject({ status: 404 });
    expect((await promotions.detail(id, "owner")).post.hidden).toBe(true);
  });

  it("enforces the promotion quota while concurrent transactions hold advisory locks", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => promotions.create("owner", promotion)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 });
    expect((await promotions.list({})).items).toHaveLength(5);
  });
});
