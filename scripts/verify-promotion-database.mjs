import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";

const connectionString = process.env.TEST_DATABASE_URL;
const target = validatePostgresIntegrationUrl(connectionString);
assert.equal(target.databaseName, "promotion_test", "Use the dedicated disposable promotion_test database only");
process.env.DATABASE_URL = connectionString;
const { dbPool } = await import("../apps/api/src/platform/database/index.ts");
const { PromotionService } = await import("../apps/api/src/modules/promotion/promotion.service.ts");
const service = new PromotionService();
const prefix = `promotion-test-${randomUUID()}`;
const owner = `${prefix}-owner`, reader = `${prefix}-reader`, moderator = `${prefix}-admin`;
const quotaUser = `${prefix}-quota`, pageUser = `${prefix}-page`, totalUser = `${prefix}-total`;
const actors = [owner, reader, moderator, quotaUser, pageUser, totalUser];
const input = { kind: "series", stage: "amateur", genre: "판타지", title: "새로운 작품 소개", seriesTitle: "나의 첫 작품",
  description: "창작자가 직접 소개하는 작품으로 독자의 응원과 구체적인 피드백을 기다립니다.",
  readingUrl: "https://example.com/series", videoUrl: "", cover: "", tags: ["신작"], contentWarning: "", rightsConfirmed: true };
const status = (expected) => (error) => error?.getStatus?.() === expected;

await test("promotion PostgreSQL integration", async (t) => {
  try {
    await dbPool.query('CREATE TABLE IF NOT EXISTS "user" (id text PRIMARY KEY, name text, role text NOT NULL DEFAULT \'user\')');
    const migration = await readFile(new URL("../apps/api/src/platform/database/migrations/0046_creator_promotion_community.sql", import.meta.url), "utf8");
    for (const id of actors) await dbPool.query('INSERT INTO "user" (id, name, role) VALUES ($1, $2, $3)', [id, id, id === moderator ? "admin" : "user"]);
    await t.test("additive migration is repeatable and creates all four tables", async () => {
      await dbPool.query(migration); await dbPool.query(migration);
      const { rows } = await dbPool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'creator_promotion_%'");
      assert.equal(rows.length, 4);
    });
    const { id } = await service.create(owner, { ...input, userId: reader });
    await t.test("ownership, guest access, and optimistic concurrency", async () => {
      assert.equal((await service.detail(id)).post.author.id, owner);
      await assert.rejects(service.list({ mine: "true" }), status(401));
      await assert.rejects(service.list({ saved: "true" }), status(401));
      await assert.rejects(service.update(id, reader, { ...input, version: 1 }), status(409));
      const updates = await Promise.allSettled([service.update(id, owner, { ...input, version: 1 }), service.update(id, owner, { ...input, version: 1 })]);
      assert.equal(updates.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(updates.find((result) => result.status === "rejected").reason.getStatus(), 409);
      assert.equal((await service.detail(id, owner)).post.version, 2);
    });
    await t.test("bookmarks are idempotent and viewer-scoped", async () => {
      await Promise.all([service.bookmark(id, reader, { saved: true }), service.bookmark(id, reader, { saved: true })]);
      assert.equal((await service.detail(id, reader)).post.saved, true);
      assert.equal((await service.detail(id, owner)).post.saved, false);
      assert.equal((await service.list({ saved: "true" }, reader)).items.filter((post) => post.id === id).length, 1);
      await service.bookmark(id, reader, { saved: false });
      assert.equal((await service.detail(id, reader)).post.saved, false);
    });
    await t.test("comments enforce author ownership and reports enforce moderation", async () => {
      await service.comment(id, reader, { text: "멋진 작품을 응원합니다.", userId: owner });
      const [comment] = (await service.detail(id)).comments;
      assert.equal(comment.author.id, reader);
      await assert.rejects(service.deleteComment(id, comment.id, owner), status(403));
      await service.deleteComment(id, comment.id, reader);
      assert.equal((await service.detail(id)).comments.length, 0);
      await Promise.all([service.report(id, reader, { reason: "원작자 확인이 필요한 게시물입니다." }), service.report(id, reader, { reason: "원작자 확인이 필요한 게시물입니다." })]);
      await assert.rejects(service.reports(reader), status(403));
      await assert.rejects(service.moderate(id, reader, { hidden: true }), status(403));
      assert.equal((await service.reports(moderator)).filter((report) => report.postId === id).length, 1);
    });
    await t.test("hidden and archived posts remain private through restoration", async () => {
      await service.moderate(id, moderator, { hidden: true });
      await assert.rejects(service.detail(id, reader), status(404));
      await assert.rejects(service.comment(id, reader, { text: "비공개 댓글" }), status(404));
      const hidden = await service.detail(id, owner);
      await service.archive(id, owner, { archived: true, version: hidden.post.version });
      await service.archive(id, owner, { archived: false, version: hidden.post.version + 1 });
      assert.equal((await service.detail(id, owner)).post.hidden, true);
      assert.equal((await service.list({})).items.some((post) => post.id === id), false);
      await service.moderate(id, moderator, { hidden: false });
      assert.equal((await service.detail(id, reader)).post.hidden, false);
      await service.archive(id, owner, { archived: true, version: (await service.detail(id, owner)).post.version });
      await assert.rejects(service.detail(id), status(404));
    });
    await t.test("concurrent publication cannot exceed the daily quota", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.create(quotaUser, input)));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
      for (const result of results.filter((item) => item.status === "rejected")) assert.equal(result.reason.getStatus(), 429);
      assert.equal((await service.list({ mine: "true" }, quotaUser)).items.length, 5);
    });
    const insertPost = (author, createdAt, title = input.title) => dbPool.query('INSERT INTO creator_promotion_post (id, "userId", title, kind, stage, genre, payload, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [randomUUID(), author, title, input.kind, input.stage, input.genre, JSON.stringify({ ...input, title }), createdAt]);
    await t.test("keyset pages preserve tied timestamps and escape search wildcards", async () => {
      for (let index = 0; index < 23; index += 1) await insertPost(pageUser, new Date("2026-01-01T00:00:00.000Z"), index === 0 ? "100%_완성 작품" : input.title);
      const first = await service.list({ mine: "true" }, pageUser);
      const second = await service.list({ mine: "true", cursor: first.nextCursor }, pageUser);
      assert.equal(first.items.length, 20); assert.equal(first.hasMore, true);
      assert.equal(second.items.length, 3); assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.items, ...second.items].map((post) => post.id)).size, 23);
      assert.equal((await service.list({ mine: "true", q: "%_" }, pageUser)).items.length, 1);
      await assert.rejects(service.list({ cursor: "invalid" }), status(400));
    });
    await t.test("lifetime quota includes old posts and rejects further publication", async () => {
      for (let index = 0; index < 100; index += 1) await insertPost(totalUser, new Date("2026-01-01T00:00:00.000Z"));
      await assert.rejects(service.create(totalUser, input), status(429));
      const { rows } = await dbPool.query('SELECT count(*)::int AS count FROM creator_promotion_post WHERE "userId" = $1', [totalUser]);
      assert.equal(rows[0].count, 100);
    });
  } finally {
    try { await dbPool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [actors]); }
    finally { await dbPool.end(); }
  }
});
