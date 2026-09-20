import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type * as DatabaseRuntime from "../../db";
import type { CreateStudioReviewComment } from "./studio-project-graph.dto";
import { CreateStudioReviewCommentSchema } from "./studio-project-graph.dto";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { DrizzleStudioProductionRepository } from "../creator/studio-production.repository";
import type { StudioProductionWorkspaceDocument } from "../creator/studio-production.dto";

const databaseUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !databaseUrl) throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL for review decision races");
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres("PostgreSQL review decision and comment serialization", () => {
  let pool: Pool;
  let database: typeof DatabaseRuntime;
  let graph: StudioProjectGraphRepository;
  let production: DrizzleStudioProductionRepository;
  const users: string[] = [];
  const works: string[] = [];
  const applicationName = `review-race-${randomUUID()}`;
  const previousDatabase = process.env.DATABASE_URL;

  beforeAll(async () => {
    const connection = new URL(databaseUrl!);
    connection.searchParams.set("application_name", applicationName);
    process.env.DATABASE_URL = connection.toString();
    pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: `${applicationName}-probe` });
    database = await import("../../db");
    const module = await import("./studio-project-graph.repository");
    graph = new module.StudioProjectGraphRepository();
    production = new (await import("../creator/studio-production.repository")).DrizzleStudioProductionRepository();
    const triggers = await pool.query<{ count: string }>(`SELECT count(*)::text FROM pg_trigger
      WHERE tgname IN ('studio_revision_topology_revision','studio_review_snapshot_check','studio_review_reviewer_check') AND tgenabled <> 'D'`);
    expect(Number(triggers.rows[0]?.count)).toBe(3);
  });
  afterEach(async () => {
    const workIds = works.splice(0);
    const ids = users.splice(0);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Keep all accepted constraints enabled. Remove only this test's references before their
      // immutable revision targets; deferred topology checks see the fully removed fixture.
      if (workIds.length) {
        const artifacts = 'SELECT artifact.id FROM studio_artifact artifact JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
        await client.query(`DELETE FROM studio_review WHERE "artifactId" IN (${artifacts})`, [workIds]);
        await client.query(`DELETE FROM studio_mutation_receipt WHERE "artifactId" IN (${artifacts})`, [workIds]);
        await client.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (SELECT id FROM studio_revision WHERE "artifactId" IN (${artifacts}))`, [workIds]);
        await client.query('DELETE FROM creator_work WHERE id = ANY($1::text[])', [workIds]);
      }
      if (ids.length) await client.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  });

  async function fixture() {
    const actor = randomUUID(), workId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID();
    const initialId = randomUUID(), submissionId = randomUUID(), snapshotId = randomUUID(), reviewId = randomUUID();
    users.push(actor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [actor, "Review mutation integration"]);
    await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,1)',
      [workId, actor, "Review source", JSON.stringify({ pagesList: [{ id: "page", elements: [] }] })]);
    works.push(workId);
    await graph.createProject(actor, { projectId, workId, workspaceId: randomUUID(),
      artifact: { id: artifactId, kind: "review-snapshot", title: "Review source", scope: { projectId } },
      initialRevision: { id: initialId, rootGraphHash: "a".repeat(64), deviceId: "test-device",
        createdAt: new Date().toISOString(), blobRefs: [] } }, randomUUID());
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [id, kind, parent] of [[submissionId, "submission", initialId], [snapshotId, "review-snapshot", submissionId]]) {
        await client.query('INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","createdBy","deviceId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,now())',
          [id, artifactId, kind, "a".repeat(64), actor, "test-device"]);
        await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)', [id, parent]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    await graph.createReview(actor, artifactId, { id: reviewId, revisionId: snapshotId,
      title: "Pinned review", reviewerIds: [actor] });
    const input = (severity: CreateStudioReviewComment["severity"] = "required"): CreateStudioReviewComment => ({
      id: randomUUID(), body: "Correct the final panel", severity, assigneeIds: [],
      anchor: { kind: "artifact", artifactId, revisionId: snapshotId, scope: { projectId } },
    });
    return { actor, workId, projectId, artifactId, initialId, snapshotId, reviewId, input };
  }
  it("keeps comment resolution and reopening monotonic against exact stored PostgreSQL time", async () => {
    const f = await fixture(), input = f.input();
    await graph.createReviewComment(f.actor, f.reviewId, input);
    const ahead = await pool.query<{ updatedAt: string }>(
      `UPDATE studio_review_comment SET "createdAt"=statement_timestamp()+interval '1 minute',
       "updatedAt"=statement_timestamp()+interval '2 minutes' WHERE id=$1 RETURNING "updatedAt"::text`, [input.id]);
    const resolution = { status: "resolved" as const, resolutionRevisionId: f.initialId };
    const resolved = await graph.resolveReviewComment(f.actor, input.id, resolution);
    expect(resolved.status).toBe("resolved");
    expect(await graph.resolveReviewComment(f.actor, input.id, resolution)).toEqual(resolved);
    expect((await pool.query<{ monotonic: boolean }>(
      'SELECT "updatedAt">=$2::timestamptz AS monotonic FROM studio_review_comment WHERE id=$1',
      [input.id, ahead.rows[0]!.updatedAt])).rows[0]?.monotonic).toBe(true);
    const later = await pool.query<{ updatedAt: string }>(
      `UPDATE studio_review_comment SET "updatedAt"="updatedAt"+interval '1 minute'
       WHERE id=$1 RETURNING "updatedAt"::text`, [input.id]);
    const reopened = await graph.reopenReviewComment(f.actor, input.id);
    expect(reopened.status).toBe("reopened");
    expect(await graph.reopenReviewComment(f.actor, input.id)).toEqual(reopened);
    expect((await pool.query<{ monotonic: boolean }>(
      'SELECT "updatedAt">=$2::timestamptz AS monotonic FROM studio_review_comment WHERE id=$1',
      [input.id, later.rows[0]!.updatedAt])).rows[0]?.monotonic).toBe(true);
  });

  it.each(["approved", "rejected", "cancelled", "changes-requested"] as const)(
    "keeps %s decisions monotonic when stored PostgreSQL timestamps are ahead", async (status) => {
      const f = await fixture();
      const ahead = await pool.query<{ updatedAt: string }>(
        `UPDATE studio_review SET "createdAt"=statement_timestamp()+interval '1 minute',
         "updatedAt"=statement_timestamp()+interval '2 minutes' WHERE id=$1 RETURNING "updatedAt"::text`, [f.reviewId]);
      const result = await graph.decideReview(f.actor, f.reviewId, { status });
      expect(result.status).toBe(status);
      const persisted = (await pool.query<{ monotonic: boolean; decisionAligned: boolean }>(
        `SELECT "updatedAt">=$2::timestamptz AS monotonic,
         (CASE WHEN $3 THEN "decidedAt"="updatedAt" ELSE "decidedAt" IS NULL END) AS "decisionAligned"
         FROM studio_review WHERE id=$1`, [f.reviewId, ahead.rows[0]!.updatedAt, status !== "changes-requested"])).rows[0];
      expect(persisted).toEqual({ monotonic: true, decisionAligned: true });
      if (status !== "changes-requested") expect(await graph.decideReview(f.actor, f.reviewId, { status })).toEqual(result);
    },
  );

  async function waitBlocked(count: number) {
    await expect.poll(async () => Number((await pool.query<{ count: string }>(
      `SELECT count(*)::text FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%studio_review%'`,
      [applicationName])).rows[0]?.count ?? 0), { timeout: 5_000 }).toBe(count);
  }
  async function member(workId: string, role: "admin" | "editor" | "commenter" | "viewer", status: "active" | "pending" | "declined" = "active") {
    const userId = randomUUID(); users.push(userId);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [userId, `Review assignment ${role}`]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt")
      VALUES ($1,$2,$3,$4,$5,CASE WHEN $4='pending' THEN NULL ELSE now() END)`, [workId, userId, role, status, randomUUID()]);
    return userId;
  }
  async function productionFixture() {
    const f = await fixture(), editor = await member(f.workId, "editor");
    const comment = { ...f.input(), assigneeIds: [editor] };
    await graph.createReviewComment(f.actor, f.reviewId, comment);
    const empty = await production.getWorkspace(f.actor, f.workId);
    const document: StudioProductionWorkspaceDocument = { ...empty.document,
      hierarchy: [
        { id: "episode", parentId: null, kind: "episode", title: "Episode", order: 0, pageId: null },
        { id: "sequence", parentId: "episode", kind: "sequence", title: "Sequence", order: 0, pageId: null },
        { id: "scene", parentId: "sequence", kind: "scene", title: "Scene", order: 0, pageId: null },
        { id: "other-scene", parentId: "sequence", kind: "scene", title: "Other scene", order: 1, pageId: null },
        { id: "page", parentId: "scene", kind: "page", title: "Page", order: 0, pageId: "source-page" },
      ], roleAssignments: [
        { id: "role-editor", memberId: editor, displayName: "Editor", roles: ["lineart"], hierarchyNodeId: null },
        { id: "role-owner", memberId: f.actor, displayName: "Owner", roles: ["director"], hierarchyNodeId: null },
        { id: "role-ancestor", memberId: editor, displayName: "Episode editor", roles: ["lineart"], hierarchyNodeId: "episode" },
        { id: "role-same", memberId: editor, displayName: "Scene editor", roles: ["lineart"], hierarchyNodeId: "scene" },
        { id: "role-sibling", memberId: editor, displayName: "Other scene editor", roles: ["lineart"], hierarchyNodeId: "other-scene" },
        { id: "role-child", memberId: editor, displayName: "Page editor", roles: ["lineart"], hierarchyNodeId: "page" },
      ], tasks: [{ id: "task", title: "Correct panel", owner: "Editor", due: "2026-10-21", progress: 0, status: "todo", stage: "lineart",
        priority: "normal", role: "lineart", hierarchyNodeId: "scene", dependencyIds: [], assigneeIds: ["role-editor"], reviewerIds: [], blockedReason: "" }] };
    const current = await production.saveWorkspace(f.actor, f.workId, 0, document);
    const reference = { subject: { schemaVersion: 1 as const, workId: f.workId, projectId: f.projectId, artifactId: f.artifactId,
      reviewId: f.reviewId, revisionId: f.snapshotId, rootGraphHash: "a".repeat(64) }, commentId: comment.id, handoffId: null };
    const linked = (): StudioProductionWorkspaceDocument => ({ ...structuredClone(current.document),
      tasks: [{ ...current.document.tasks[0]!, reviewRef: structuredClone(reference) }] });
    return { ...f, editor, comment, current, reference, linked };
  }

  it("preserves comment and review metadata when their stored clocks are ahead", async () => {
    const f = await fixture(), comment = f.input();
    await graph.createReviewComment(f.actor, f.reviewId, comment);
    const future = (await pool.query<{ future: Date }>("SELECT now() + interval '1 day' AS future")).rows[0]!.future.toISOString();
    await pool.query('UPDATE studio_review_comment SET "createdAt"=$2,"updatedAt"=$2 WHERE id=$1', [comment.id, future]);
    const resolve = { status: "resolved" as const, resolutionRevisionId: f.initialId };
    expect((await graph.resolveReviewComment(f.actor, comment.id, resolve)).updatedAt).toBe(future);
    expect((await graph.reopenReviewComment(f.actor, comment.id)).updatedAt).toBe(future);
    expect((await graph.resolveReviewComment(f.actor, comment.id, resolve)).updatedAt).toBe(future);
    await pool.query('UPDATE studio_review SET "createdAt"=$2,"updatedAt"=$2 WHERE id=$1', [f.reviewId, future]);
    const decided = await graph.decideReview(f.actor, f.reviewId, { status: "approved" });
    expect(decided.updatedAt).toBe(future);
  });
  it("binds a production task to the actual pinned comment, retaining existing extra roles and exact read permissions", async () => {
    const f = await productionFixture(); const next = f.linked(); next.tasks[0]!.assigneeIds.push("role-owner");
    const saved = await production.saveWorkspace(f.editor, f.workId, f.current.revision, next);
    expect(saved.revision).toBe(2); expect(saved.document.tasks[0]?.reviewRef).toEqual(f.reference);
    expect(saved.document.tasks[0]?.assigneeIds).toEqual(["role-editor", "role-owner"]);
    const viewer = await member(f.workId, "viewer");
    expect((await production.getWorkspace(viewer, f.workId)).document.tasks[0]?.reviewRef).toEqual(f.reference);
    await expect(production.saveWorkspace(viewer, f.workId, saved.revision, saved.document)).rejects.toMatchObject({ name: "StudioProductionForbiddenError" });
    const other = await fixture(); await expect(production.getWorkspace(other.actor, f.workId)).rejects.toMatchObject({ name: "StudioProductionForbiddenError" });
  });

  it.each(["projectId", "artifactId", "reviewId", "revisionId", "rootGraphHash", "commentId", "workId"] as const)("rejects a forged review %s before changing production state", async (field) => {
    const f = await productionFixture(), next = f.linked();
    if (field === "commentId") next.tasks[0]!.reviewRef!.commentId = randomUUID();
    else next.tasks[0]!.reviewRef!.subject[field] = field === "rootGraphHash" ? "b".repeat(64) : randomUUID();
    await expect(production.saveWorkspace(f.actor, f.workId, 1, next)).rejects.toMatchObject({ name: "StudioProductionReviewReferenceError", reason: "reference" });
    expect((await production.getWorkspace(f.actor, f.workId)).revision).toBe(1);
  });

  it("does not accept another real work's graph/review/comment under an editable work's locator", async () => {
    const f = await productionFixture(), other = await productionFixture(), next = f.linked();
    next.tasks[0]!.reviewRef = { ...other.reference, subject: { ...other.reference.subject, workId: f.workId } };
    await expect(production.saveWorkspace(f.actor, f.workId, 1, next)).rejects.toMatchObject({ reason: "reference" });
  });

  it.each(["role-editor", "role-ancestor", "role-same"])("accepts the explicit %s role in global/ancestor/same task scope", async (roleId) => {
    const f = await productionFixture(), next = f.linked(); next.tasks[0]!.assigneeIds = [roleId];
    expect((await production.saveWorkspace(f.actor, f.workId, 1, next)).document.tasks[0]?.assigneeIds).toEqual([roleId]);
  });

  it.each(["legacy-user", "missing-user-binding", "role-sibling", "role-child", "uncovered-comment"])("rejects a new link with %s role mapping", async (kind) => {
    const f = await productionFixture(), next = f.linked();
    if (kind === "legacy-user") next.tasks[0]!.assigneeIds = [f.editor];
    else if (kind === "missing-user-binding") next.roleAssignments[0]!.memberId = null;
    else if (kind === "uncovered-comment") next.tasks[0]!.assigneeIds = ["role-owner"];
    else next.tasks[0]!.assigneeIds = [kind];
    await expect(production.saveWorkspace(f.actor, f.workId, 1, next)).rejects.toMatchObject({ reason: "assignees" });
    expect((await production.getWorkspace(f.actor, f.workId)).revision).toBe(1);
  });

  it.each(["viewer", "pending", "removed"])("rejects new assignment after the comment assignee becomes %s", async (kind) => {
    const f = await productionFixture();
    if (kind === "removed") await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.editor]);
    else await pool.query(`UPDATE creator_work_collaborator SET role=$3,status=$4,"respondedAt"=CASE WHEN $4='pending' THEN NULL ELSE now() END
      WHERE "workId"=$1 AND "userId"=$2`, [f.workId, f.editor, kind === "viewer" ? "viewer" : "editor", kind === "pending" ? "pending" : "active"]);
    await expect(production.saveWorkspace(f.actor, f.workId, 1, f.linked())).rejects.toMatchObject({ reason: "assignees" });
  });

  it("retains historical references and ordinary task edits after membership revocation, but requires fresh permission for reassignment", async () => {
    const f = await productionFixture(); const linked = f.linked(); linked.tasks[0]!.assigneeIds = ["role-editor", "role-owner"];
    const saved = await production.saveWorkspace(f.actor, f.workId, 1, linked);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.editor]);
    const next = structuredClone(saved.document); next.tasks[0]!.title = "Completed correction"; next.tasks[0]!.status = "done"; next.tasks[0]!.assigneeIds.reverse();
    next.versions = [{ id: "history", name: "Original link", createdAt: new Date().toISOString(), tasks: saved.document.tasks,
      reviews: saved.document.reviews, hierarchy: saved.document.hierarchy, roleAssignments: saved.document.roleAssignments, handoffs: saved.document.handoffs }];
    const updated = await production.saveWorkspace(f.actor, f.workId, 2, next);
    expect(updated.document.tasks[0]?.reviewRef).toEqual(f.reference); expect(updated.document.versions[0]?.tasks[0]?.reviewRef).toEqual(f.reference);
    const reassigned = structuredClone(updated.document); reassigned.tasks[0]!.assigneeIds = ["role-owner"];
    await expect(production.saveWorkspace(f.actor, f.workId, 3, reassigned)).rejects.toMatchObject({ reason: "assignees" });
    const rebound = structuredClone(updated.document); rebound.roleAssignments[0]!.memberId = f.actor;
    await expect(production.saveWorkspace(f.actor, f.workId, 3, rebound)).rejects.toMatchObject({ reason: "assignees" });
  });

  it("validates a new reference hidden only in a version without rejecting ordinary legacy user-ID tasks", async () => {
    const f = await productionFixture(), legacy = structuredClone(f.current.document); legacy.tasks[0]!.assigneeIds = [f.editor];
    const saved = await production.saveWorkspace(f.actor, f.workId, 1, legacy); expect(saved.document.tasks[0]?.assigneeIds).toEqual([f.editor]);
    const forged = structuredClone(saved.document), task = f.linked().tasks[0]!; task.reviewRef!.commentId = randomUUID();
    forged.versions = [{ id: "forged", name: "Unverified history", createdAt: new Date().toISOString(), tasks: [task], reviews: [], hierarchy: forged.hierarchy,
      roleAssignments: forged.roleAssignments, handoffs: [] }];
    await expect(production.saveWorkspace(f.actor, f.workId, 2, forged)).rejects.toMatchObject({ reason: "reference" });
  });

  it("revalidates scope changes behind an existing role ID and requires approval authority independently of the review link", async () => {
    const f = await productionFixture(); const saved = await production.saveWorkspace(f.actor, f.workId, 1, f.linked());
    const moved = structuredClone(saved.document); moved.roleAssignments[0]!.hierarchyNodeId = "other-scene";
    await expect(production.saveWorkspace(f.actor, f.workId, 2, moved)).rejects.toMatchObject({ reason: "assignees" });
    const approved = structuredClone(saved.document); approved.tasks[0]!.stage = "approved";
    await expect(production.saveWorkspace(f.editor, f.workId, 2, approved)).rejects.toMatchObject({ name: "StudioProductionForbiddenError", operation: "approve" });
    expect((await production.getWorkspace(f.actor, f.workId)).revision).toBe(2);
  });

  it("keeps a completed immutable review usable as an explicit historical task reference", async () => {
    const f = await productionFixture();
    await graph.resolveReviewComment(f.actor, f.comment.id, { status: "resolved", resolutionRevisionId: f.initialId });
    await graph.decideReview(f.actor, f.reviewId, { status: "approved" });
    const saved = await production.saveWorkspace(f.actor, f.workId, 1, f.linked());
    expect(saved.document.tasks[0]?.reviewRef).toEqual(f.reference);
    expect((await graph.getReview(f.actor, f.reviewId)).status).toBe("approved");
  });

  it("preserves mandatory CAS for duplicate saves and allows distinct explicitly selected tasks to reference the same comment", async () => {
    const f = await productionFixture(); const outcomes = await Promise.allSettled([
      production.saveWorkspace(f.actor, f.workId, 1, f.linked()), production.saveWorkspace(f.actor, f.workId, 1, f.linked()),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { name: "StudioProductionRevisionConflictError", currentRevision: 2 } });
    const current = await production.getWorkspace(f.actor, f.workId); expect(current.document.tasks).toHaveLength(1);
    const next = structuredClone(current.document); next.tasks.push({ ...next.tasks[0]!, id: "second-explicit-task" });
    const saved = await production.saveWorkspace(f.actor, f.workId, 2, next); expect(saved.document.tasks).toHaveLength(2);
  });

  it("rechecks a membership change that was already queued when linking the task", async () => {
    const f = await productionFixture(), blocker = await pool.connect();
    let save: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query('UPDATE creator_work_collaborator SET role=\'viewer\' WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.editor]);
      save = production.saveWorkspace(f.actor, f.workId, 1, f.linked()).then((value) => ({ value }), (error: unknown) => ({ error }));
      await expect.poll(async () => Number((await pool.query<{ count: string }>(`SELECT count(*)::text FROM pg_stat_activity
        WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%creator_work_collaborator%'`, [applicationName])).rows[0]?.count ?? 0)).toBe(1);
      await blocker.query("COMMIT");
      expect(await save).toMatchObject({ error: { reason: "assignees" } });
      expect((await production.getWorkspace(f.actor, f.workId)).revision).toBe(1);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await save; }
  });
  function observed<T>(promise: Promise<T>) {
    return promise.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  }
  async function race<T, U>(reviewId: string, first: () => Promise<T>, second: () => Promise<U>) {
    const blocker = await pool.connect();
    let firstResult: ReturnType<typeof observed<T>> | undefined;
    let secondResult: ReturnType<typeof observed<U>> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM studio_review WHERE id=$1 FOR UPDATE', [reviewId]);
      firstResult = observed(first()); await waitBlocked(1);
      secondResult = observed(second()); await waitBlocked(2);
      await blocker.query("COMMIT");
      return await Promise.all([firstResult, secondResult]);
    } finally {
      await blocker.query("ROLLBACK"); blocker.release();
      await Promise.allSettled([firstResult, secondResult].filter(Boolean));
    }
  }

  it("persists normalized HTTP body, user assignees and deadline, and treats order/offset-equivalent retries as one write", async () => {
    const f = await fixture(); const editor = await member(f.workId, "editor");
    const raw = { ...f.input(), body: "  Correct this panel.\n ", assigneeIds: [` ${editor} `, f.actor], dueAt: "2026-10-21T14:30:00+09:00" };
    const input = CreateStudioReviewCommentSchema.parse(raw);
    const created = await graph.createReviewComment(f.actor, f.reviewId, input);
    const replay = CreateStudioReviewCommentSchema.parse({ ...raw, assigneeIds: [f.actor, editor], dueAt: "2026-10-21T05:30:00.000Z" });
    expect(await graph.createReviewComment(f.actor, f.reviewId, replay)).toEqual(created);
    const review = await graph.getReview(f.actor, f.reviewId);
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]).toMatchObject({ body: "Correct this panel.", severity: "required", dueAt: "2026-10-21T05:30:00.000Z" });
    expect([...review.comments[0]!.assigneeIds].sort()).toEqual([editor, f.actor].sort());
  });

  it.each(["severity", "assignees", "deadline", "deadline-removed"] as const)("rejects an identical comment ID with changed %s without overwriting the first note", async (field) => {
    const f = await fixture(); const editor = await member(f.workId, "editor");
    const input = { ...f.input(), assigneeIds: [editor], dueAt: "2026-10-21T05:30:00.000Z" };
    await graph.createReviewComment(f.actor, f.reviewId, input);
    const changed = { ...input, ...(field === "severity" ? { severity: "note" as const } : {}),
      ...(field === "assignees" ? { assigneeIds: [f.actor] } : {}),
      ...(field === "deadline" ? { dueAt: "2026-10-22T05:30:00.000Z" } : {}),
      ...(field === "deadline-removed" ? { dueAt: undefined } : {}) };
    await expect(graph.createReviewComment(f.actor, f.reviewId, changed)).rejects.toMatchObject({ name: "StudioIdempotencyConflictError" });
    const stored = await graph.getReview(f.actor, f.reviewId);
    expect(stored.comments).toHaveLength(1);
    expect(stored.comments[0]).toMatchObject({ severity: "required", assigneeIds: [editor], dueAt: input.dueAt });
  });

  it("allows an active commenter to assign the work owner and active admin/editors but gives no new edit permission", async () => {
    const f = await fixture(); const commenter = await member(f.workId, "commenter"), editor = await member(f.workId, "editor"), admin = await member(f.workId, "admin");
    await graph.createReviewComment(commenter, f.reviewId, { ...f.input(), assigneeIds: [f.actor, editor, admin] });
    expect([...(await graph.getReview(commenter, f.reviewId)).comments[0]!.assigneeIds].sort()).toEqual([f.actor, editor, admin].sort());
    expect((await graph.getProject(commenter, f.projectId)).access).toMatchObject({ view: true, comment: true, edit: false });
  });

  it("compares timestamp instants at database precision rather than truncating sub-millisecond changes", async () => {
    const f = await fixture(); const input = { ...f.input(), dueAt: "2026-10-21T05:30:00.123456Z" };
    const first = await graph.createReviewComment(f.actor, f.reviewId, input);
    expect(await graph.createReviewComment(f.actor, f.reviewId, { ...input, dueAt: "2026-10-21T14:30:00.123456+09:00" })).toEqual(first);
    await expect(graph.createReviewComment(f.actor, f.reviewId, { ...input, dueAt: "2026-10-21T05:30:00.123457Z" }))
      .rejects.toMatchObject({ name: "StudioIdempotencyConflictError" });
  });

  it("rejects viewer/commenter/pending/declined and other-work assignees atomically", async () => {
    const f = await fixture(), other = await fixture();
    const invalid = [await member(f.workId, "viewer"), await member(f.workId, "commenter"),
      await member(f.workId, "editor", "pending"), await member(f.workId, "admin", "declined"), await member(other.workId, "editor"), other.actor];
    for (const userId of invalid) {
      await expect(graph.createReviewComment(f.actor, f.reviewId, { ...f.input(), assigneeIds: [f.actor, userId] }))
        .rejects.toMatchObject({ causeCode: "assignee_edit_access_missing" });
    }
    expect((await graph.getReview(f.actor, f.reviewId)).comments).toHaveLength(0);
  });

  it("preserves a committed exact replay after the assignee loses access, while rejecting every new assignment", async () => {
    const f = await fixture(); const editor = await member(f.workId, "editor");
    const input = { ...f.input(), assigneeIds: [editor] };
    const created = await graph.createReviewComment(f.actor, f.reviewId, input);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, editor]);
    expect(await graph.createReviewComment(f.actor, f.reviewId, input)).toEqual(created);
    await expect(graph.createReviewComment(f.actor, f.reviewId, { ...input, id: randomUUID() }))
      .rejects.toMatchObject({ causeCode: "assignee_edit_access_missing" });
    expect((await graph.getReview(f.actor, f.reviewId)).comments).toHaveLength(1);
  });

  it("requires the requesting actor's current comment permission even for an exact replay", async () => {
    const f = await fixture(); const actor = await member(f.workId, "commenter");
    const input = { ...f.input(), assigneeIds: [f.actor] };
    await graph.createReviewComment(actor, f.reviewId, input);
    await pool.query('UPDATE creator_work_collaborator SET role=\'viewer\' WHERE "workId"=$1 AND "userId"=$2', [f.workId, actor]);
    await expect(graph.createReviewComment(actor, f.reviewId, input)).rejects.toMatchObject({ name: "StudioProjectForbiddenError" });
  });

  it("serializes duplicate and conflicting assignments under the actual review row lock", async () => {
    const f = await fixture(); const input = { ...f.input(), assigneeIds: [f.actor], dueAt: "2026-10-21T05:30:00.000Z" };
    const [first, duplicate] = await race(f.reviewId,
      () => graph.createReviewComment(f.actor, f.reviewId, input), () => graph.createReviewComment(f.actor, f.reviewId, input));
    expect(first).toEqual(duplicate); expect(first.ok).toBe(true);
    const changed = { ...input, id: randomUUID() };
    const [accepted, conflict] = await race(f.reviewId,
      () => graph.createReviewComment(f.actor, f.reviewId, changed),
      () => graph.createReviewComment(f.actor, f.reviewId, { ...changed, severity: "note" }));
    expect(accepted.ok).toBe(true); expect(conflict).toMatchObject({ ok: false, error: { name: "StudioIdempotencyConflictError" } });
    expect((await graph.getReview(f.actor, f.reviewId)).comments).toHaveLength(2);
  });

  it.each(["approved", "rejected", "cancelled"] as const)("keeps %s history immutable while allowing exact no-op resolution/comment replay", async (status) => {
    const f = await fixture(); const input = f.input();
    const created = await graph.createReviewComment(f.actor, f.reviewId, input);
    const resolution = await graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId });
    await graph.decideReview(f.actor, f.reviewId, { status });
    expect(await graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId })).toEqual(resolution);
    expect(await graph.createReviewComment(f.actor, f.reviewId, input)).toEqual(created);
    await expect(graph.createReviewComment(f.actor, f.reviewId, f.input())).rejects.toMatchObject({ causeCode: "review_already_decided" });
    await expect(graph.reopenReviewComment(f.actor, input.id)).rejects.toMatchObject({ causeCode: "review_already_decided" });
    await expect(graph.resolveReviewComment(f.actor, input.id, { status: "dismissed", resolutionRevisionId: f.initialId }))
      .rejects.toMatchObject({ causeCode: "review_already_decided" });
    const stored = await graph.getReview(f.actor, f.reviewId);
    expect(stored.status).toBe(status); expect(stored.comments).toHaveLength(1);
    expect(stored.comments[0]).toMatchObject({ status: "resolved", resolutionRevisionId: f.initialId });
    // Recording a review decision does not silently promote an artifact's approved head.
    expect((await graph.getProject(f.actor, f.projectId)).artifacts[0]?.approvedRevisionId).toBeNull();
  });

  it("rejects resolution of a non-blocking open comment after the review was approved", async () => {
    const f = await fixture(); const input = f.input("note");
    await graph.createReviewComment(f.actor, f.reviewId, input);
    await graph.decideReview(f.actor, f.reviewId, { status: "approved" });
    await expect(graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId }))
      .rejects.toMatchObject({ causeCode: "review_already_decided" });
    expect((await graph.getReview(f.actor, f.reviewId)).comments[0]?.status).toBe("open");
  });

  it("lets approval win its queued lock and then rejects a required-comment reopen", async () => {
    const f = await fixture(); const input = f.input();
    await graph.createReviewComment(f.actor, f.reviewId, input);
    await graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId });
    const [decision, reopening] = await race(f.reviewId,
      () => graph.decideReview(f.actor, f.reviewId, { status: "approved" }),
      () => graph.reopenReviewComment(f.actor, input.id));
    expect(decision).toMatchObject({ ok: true, value: { status: "approved" } });
    expect(reopening).toMatchObject({ ok: false, error: { causeCode: "review_already_decided" } });
    expect((await graph.getReview(f.actor, f.reviewId)).comments[0]?.status).toBe("resolved");
  });

  it("lets reopening win its queued lock and then blocks approval on the reopened required note", async () => {
    const f = await fixture(); const input = f.input();
    await graph.createReviewComment(f.actor, f.reviewId, input);
    await graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId });
    const [reopening, decision] = await race(f.reviewId,
      () => graph.reopenReviewComment(f.actor, input.id),
      () => graph.decideReview(f.actor, f.reviewId, { status: "approved" }));
    expect(reopening).toMatchObject({ ok: true, value: { status: "reopened" } });
    expect(decision).toMatchObject({ ok: false, error: { causeCode: "required_review_comments_open" } });
    expect((await graph.getReview(f.actor, f.reviewId)).status).toBe("open");
  });

  it("does not add a required comment after an already queued approval commits", async () => {
    const f = await fixture();
    const [decision, creating] = await race(f.reviewId,
      () => graph.decideReview(f.actor, f.reviewId, { status: "approved" }),
      () => graph.createReviewComment(f.actor, f.reviewId, f.input()));
    expect(decision).toMatchObject({ ok: true, value: { status: "approved" } });
    expect(creating).toMatchObject({ ok: false, error: { causeCode: "review_already_decided" } });
    expect((await graph.getReview(f.actor, f.reviewId)).comments).toHaveLength(0);
  });

  it("blocks approval if a queued required-comment creation commits first", async () => {
    const f = await fixture();
    const [creating, decision] = await race(f.reviewId,
      () => graph.createReviewComment(f.actor, f.reviewId, f.input()),
      () => graph.decideReview(f.actor, f.reviewId, { status: "approved" }));
    expect(creating).toMatchObject({ ok: true, value: { status: "open" } });
    expect(decision).toMatchObject({ ok: false, error: { causeCode: "required_review_comments_open" } });
  });

  it("serializes a required resolution before approval without deadlocking comment and review locks", async () => {
    const f = await fixture(); const input = f.input();
    await graph.createReviewComment(f.actor, f.reviewId, input);
    const [resolution, decision] = await race(f.reviewId,
      () => graph.resolveReviewComment(f.actor, input.id, { status: "resolved", resolutionRevisionId: f.initialId }),
      () => graph.decideReview(f.actor, f.reviewId, { status: "approved" }));
    expect(resolution).toMatchObject({ ok: true, value: { status: "resolved" } });
    expect(decision).toMatchObject({ ok: true, value: { status: "approved" } });
  });

  it("rechecks current ACL after queued comment and review actions outlive membership", async () => {
    const f = await fixture(); const input = f.input("note"); const editor = randomUUID(); users.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "Review mutation editor"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","invitedBy","respondedAt")
      VALUES ($1,$2,'editor','active',$3,$4,now())`, [f.workId, editor, randomUUID(), f.actor]);
    await pool.query('INSERT INTO studio_review_reviewer ("reviewId","reviewerUserId") VALUES ($1,$2)', [f.reviewId, editor]);
    await graph.createReviewComment(f.actor, f.reviewId, input);
    const blocker = await pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM studio_review WHERE id=$1 FOR UPDATE', [f.reviewId]);
      pending.push(observed(graph.resolveReviewComment(editor, input.id, { status: "resolved", resolutionRevisionId: f.initialId })));
      pending.push(observed(graph.createReviewComment(editor, f.reviewId, f.input("note"))));
      pending.push(observed(graph.decideReview(editor, f.reviewId, { status: "approved" })));
      await waitBlocked(3);
      await pool.query(`UPDATE creator_work_collaborator SET status='declined',"updatedAt"=now(),"respondedAt"=now() WHERE "workId"=$1 AND "userId"=$2`, [f.workId, editor]);
      await blocker.query("COMMIT");
      expect(await Promise.all(pending)).toEqual([
        { ok: false, error: expect.objectContaining({ name: "StudioProjectForbiddenError", operation: "edit" }) },
        { ok: false, error: expect.objectContaining({ name: "StudioProjectForbiddenError", operation: "comment" }) },
        { ok: false, error: expect.objectContaining({ name: "StudioProjectForbiddenError", operation: "view" }) },
      ]);
      const review = await graph.getReview(f.actor, f.reviewId);
      expect(review.status).toBe("open"); expect(review.comments).toHaveLength(1); expect(review.comments[0]?.status).toBe("open");
    } finally {
      await blocker.query("ROLLBACK"); blocker.release(); await Promise.allSettled(pending);
    }
  });
});
