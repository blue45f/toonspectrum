/** Isolated PostgreSQL integration verification. Never points at production. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { buildFeedbackCapabilitySql, buildFeedbackRuntimeAclSql } from "./feedback-database-contract.mjs";

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error("TEST_DATABASE_URL is required for the isolated feedback database.");
const target = new URL(rawUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.pathname !== "/feedback_community_test") {
  throw new Error("Refusing to modify anything except loopback /feedback_community_test.");
}
process.env.DATABASE_URL = rawUrl;
const { dbPool } = await import("../apps/api/src/db/index");
const feedback = await import("../apps/api/src/server/feedback");
const { validateFeedbackInput } = await import("../packages/core/src/feedback");
const checks: string[] = [];
const check = async (name: string, run: () => Promise<void>) => { await run(); checks.push(name); console.log(`PASS ${name}`); };
function input(category = "bug", title = "브러시 오류") {
  const value = validateFeedbackInput({ category, title, text: "필터 적용 후 브러시 입력이 멈춥니다.", tags: ["브러시"], metadata: { area: "drawing", steps: "1. 필터 적용\n2. 브러시 사용", expected: "선이 그려짐", actual: "선이 그려지지 않음" } }).value;
  assert.ok(value); return value;
}
let runtimeRole: string | null = null;
try {
  // Test-only database is rebuilt to simulate an existing Q&A installation without the new columns.
  await dbPool.query('DROP TABLE IF EXISTS feedback_vote, feedback_reply, feedback_post, "user" CASCADE');
  await dbPool.query('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, avatar TEXT, role TEXT NOT NULL DEFAULT \'user\')');
  await dbPool.query(`INSERT INTO "user"(id,name,role) VALUES ('member','창작자','user'),('other','다른 창작자','user'),('staff','운영자','operator')`);
  await dbPool.query(`CREATE TABLE feedback_post (
    id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"(id), category TEXT NOT NULL DEFAULT 'question',
    title TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', "answeredAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await dbPool.query(`INSERT INTO feedback_post(id,"userId",title,text,status) VALUES ('legacy','member','기존 이용 질문','기존 답변을 보존해야 합니다.','answered')`);
  await check("additive migration preserves legacy questions and reply state", async () => {
    await assert.rejects(feedback.ensureFeedbackTables(), { statusCode: 503 });
    const migration = await readFile(new URL("../apps/api/src/db/migrations/0038_feedback_community.sql", import.meta.url), "utf8");
    // Execute twice through the owner, never through the runtime API connection.
    for (let index = 0; index < 2; index++) await dbPool.query(`BEGIN; ${migration} COMMIT;`);
    await Promise.all([feedback.ensureFeedbackTables(), feedback.ensureFeedbackTables()]);
    const legacy = await feedback.getFeedbackPost("legacy");
    assert.equal(legacy.status, "answered"); assert.equal(legacy.progress, "received"); assert.deepEqual(legacy.metadata, {});
  });
  let bugId = "";
  await check("four native categories and structured bug fields persist", async () => {
    for (const category of ["bug", "idea", "request", "question"]) {
      const post = await feedback.createFeedbackPost("member", input(category));
      assert.equal(post.category, category); assert.equal(post.progress, "received"); assert.equal(post.voteCount, 0);
      assert.equal(post.metadata.steps, "1. 필터 적용\n2. 브러시 사용");
      if (category === "bug") bugId = post.id;
    }
  });
  await check("literal search and exact tags cannot act as LIKE wildcards", async () => {
    await feedback.createFeedbackPost("member", input("idea", "100% 확대 보기"));
    assert.equal((await feedback.listFeedbackPosts({ query: "%" })).items.length, 1);
    assert.equal((await feedback.listFeedbackPosts({ tag: "브러" })).items.length, 0);
    assert.ok((await feedback.listFeedbackPosts({ tag: "브러시" })).items.length >= 4);
  });
  await check("cursor pagination uses PostgreSQL dates and stable tie ordering", async () => {
    for (let index = 0; index < 24; index++) await feedback.createFeedbackPost("member", input("request", `추가 요청 ${index}`));
    await dbPool.query(`UPDATE feedback_post SET "createdAt" = '2026-09-01T00:00:00.000Z'`);
    const all: string[] = []; let cursor: string | null = null;
    do {
      const page = await feedback.listFeedbackPosts({ cursor, limit: 7 });
      assert.ok(page.items.length <= 7); all.push(...page.items.map((post) => post.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.equal(all.length, 30); assert.equal(new Set(all).size, all.length);
    await assert.rejects(feedback.listFeedbackPosts({ cursor: "NaN:anything" }), { statusCode: 400 });
    assert.ok((await feedback.listFeedbackPosts({ limit: Infinity })).items.length <= 20);
  });
  await check("mine requires identity and does not return another author", async () => {
    await assert.rejects(feedback.listFeedbackPosts({ mine: true }), { statusCode: 403 });
    assert.equal((await feedback.listFeedbackPosts({ mine: true, viewerId: "other" })).items.length, 0);
    assert.ok((await feedback.listFeedbackPosts({ mine: true, viewerId: "member" })).items.length > 0);
  });
  await check("simultaneous repeated votes are idempotent and retractable", async () => {
    await Promise.all(Array.from({ length: 8 }, () => feedback.setFeedbackVote(bugId, "member", true)));
    assert.equal((await feedback.getFeedbackPost(bugId, "member")).voteCount, 1);
    assert.equal((await feedback.getFeedbackPost(bugId, "member")).viewerVoted, true);
    assert.equal((await feedback.getFeedbackPost(bugId, "other")).viewerVoted, false);
    assert.equal((await feedback.setFeedbackVote(bugId, "other", true)).voteCount, 2);
    await feedback.setFeedbackVote(bugId, "member", false);
    assert.equal((await feedback.setFeedbackVote(bugId, "member", false)).voteCount, 1);
  });
  await check("official answer does not falsely mark a bug completed", async () => {
    await feedback.createFeedbackReply({ postId: bugId, userId: "staff", text: "확인하고 있습니다.", isOfficial: true });
    const post = await feedback.getFeedbackPost(bugId);
    assert.equal(post.status, "answered"); assert.equal(post.progress, "received");
  });
  await check("only server-verified operators can change progress", async () => {
    await assert.rejects(feedback.updateFeedbackProgress(bugId, "member", "completed", "완료라고 주장", "received"), { statusCode: 403 });
    const updated = await feedback.updateFeedbackProgress(bugId, "staff", "reviewing", "재현 조건을 확인하고 있습니다.", "received");
    assert.equal(updated.progress, "reviewing");
    assert.equal((await feedback.listFeedbackPosts({ progress: "reviewing" })).items.length, 1);
    const replies = await feedback.listFeedbackReplies(bugId);
    assert.ok(replies.some((reply) => reply.isOfficial && reply.text.includes("[처리 상태: 검토 중]")));
  });
  await check("stale status updates are rejected, same-state retries do not duplicate audit comments", async () => {
    await assert.rejects(feedback.updateFeedbackProgress(bugId, "staff", "completed", "반영 완료", "received"), { statusCode: 409 });
    const before = (await feedback.listFeedbackReplies(bugId)).length;
    await feedback.updateFeedbackProgress(bugId, "staff", "reviewing", "동일 요청", "reviewing");
    assert.equal((await feedback.listFeedbackReplies(bugId)).length, before);
  });
  await check("reply ancestry is same-post and depth bounded", async () => {
    const foreign = await feedback.createFeedbackPost("other", input("question", "다른 이용 질문"));
    const foreignReply = await feedback.createFeedbackReply({ postId: foreign.id, userId: "other", text: "별도 댓글", isOfficial: false });
    await assert.rejects(feedback.createFeedbackReply({ postId: bugId, parentId: foreignReply.id, userId: "member", text: "연결 불가", isOfficial: false }));
    let parent = await feedback.createFeedbackReply({ postId: bugId, userId: "member", text: "시작", isOfficial: false });
    for (let depth = 0; depth < 4; depth++) parent = await feedback.createFeedbackReply({ postId: bugId, parentId: parent.id, userId: "member", text: "하위 댓글", isOfficial: false });
    await assert.rejects(feedback.createFeedbackReply({ postId: bugId, parentId: parent.id, userId: "member", text: "깊이 초과", isOfficial: false }));
  });
  await check("hidden posts cannot be read, replied to, voted on, or progressed by ID", async () => {
    await dbPool.query('UPDATE feedback_post SET hidden = true WHERE id = $1', [bugId]);
    assert.ok(!(await feedback.listFeedbackPosts({})).items.some((post) => post.id === bugId));
    await assert.rejects(feedback.getFeedbackPost(bugId), { statusCode: 404 });
    await assert.rejects(feedback.listFeedbackReplies(bugId), { statusCode: 404 });
    await assert.rejects(feedback.setFeedbackVote(bugId, "other", true), { statusCode: 404 });
    await assert.rejects(feedback.createFeedbackReply({ postId: bugId, userId: "member", text: "숨김 글 댓글", isOfficial: false }), { statusCode: 404 });
    await assert.rejects(feedback.updateFeedbackProgress(bugId, "staff", "completed", "숨김 처리", "reviewing"), { statusCode: 404 });
  });
  await check("non-owning runtime can read, post, reply, vote and manage without DDL", async () => {
    runtimeRole = `feedback_runtime_${process.pid}`;
    await dbPool.query(`CREATE ROLE "${runtimeRole}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    await dbPool.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await dbPool.query(`GRANT SELECT ON public."user" TO "${runtimeRole}"`);
    await dbPool.query(buildFeedbackRuntimeAclSql(runtimeRole));
    await dbPool.query(buildFeedbackCapabilitySql(runtimeRole));
    const runtimeUrl = new URL(rawUrl);
    runtimeUrl.searchParams.set("options", `-c role=${runtimeRole}`);
    const script = `
      const assert = (await import('node:assert/strict')).default;
      const { dbPool } = await import('./apps/api/src/db/index.ts');
      const feedback = await import('./apps/api/src/server/feedback.ts');
      try {
        const { rows } = await dbPool.query("SELECT current_user AS name, has_schema_privilege(current_user, 'public', 'CREATE') AS ddl");
        assert.equal(rows[0].name, process.env.FEEDBACK_RUNTIME_ROLE);
        assert.equal(rows[0].ddl, false);
        await assert.rejects(dbPool.query('CREATE TABLE public.feedback_forbidden_ddl(id text)'), { code: '42501' });
        await feedback.ensureFeedbackTables();
        const value = feedback.validateFeedbackPost({ category:'request',title:'권한 분리 검증',text:'운영 권한만으로 제보합니다.' }).value;
        assert.ok(value);
        const post = await feedback.createFeedbackPost('member', value);
        assert.equal((await feedback.setFeedbackVote(post.id, 'member', true)).voteCount, 1);
        assert.equal((await feedback.setFeedbackVote(post.id, 'member', false)).voteCount, 0);
        await feedback.createFeedbackReply({ postId:post.id,userId:'member',text:'운영 권한 댓글',isOfficial:false });
        assert.equal((await feedback.listFeedbackReplies(post.id)).length, 1);
        const changed = await feedback.updateFeedbackProgress(post.id, 'staff', 'reviewing', '검토 중입니다.', 'received');
        assert.equal(changed.progress, 'reviewing');
        console.log('Restricted runtime CRUD and operator flow passed; DDL denied.');
      } finally { await dbPool.end(); }
    `;
    const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: runtimeUrl.toString(), FEEDBACK_RUNTIME_ROLE: runtimeRole }, timeout: 60_000,
    });
    console.log(child.stdout.trim());
  });
  await mkdir("artifacts/feedback", { recursive: true });
  await writeFile("artifacts/feedback/database-results.json", JSON.stringify({ status: "passed", checks, database: "isolated loopback feedback_community_test" }, null, 2));
  console.log(`Passed ${checks.length} PostgreSQL integration scenarios.`);
} finally {
  if (runtimeRole) {
    await dbPool.query(`DROP OWNED BY "${runtimeRole}"`);
    await dbPool.query(`DROP ROLE "${runtimeRole}"`);
  }
  await dbPool.end();
}
