import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type * as DatabaseRuntime from "../../platform/database";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioWorkSessionRepository } from "./studio-work-session.repository";

const connection = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !connection) throw new Error("CI must provide real PostgreSQL for work-session authority tests");
(connection ? describe : describe.skip)("work-session authority on PostgreSQL", () => {
  let pool: Pool, database: typeof DatabaseRuntime, graph: StudioProjectGraphRepository, sessions: StudioWorkSessionRepository;
  const works: string[] = [], users: string[] = [], previous = process.env.DATABASE_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = connection!; pool = new Pool({ connectionString: connection, max: 4 });
    database = await import("../../platform/database");
    graph = new (await import("./studio-project-graph.repository")).StudioProjectGraphRepository();
    sessions = new (await import("./studio-work-session.repository")).StudioWorkSessionRepository();
    const result = await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'");
    expect(result.rows.map((row) => row.tgname)).toEqual(expect.arrayContaining(["studio_revision_immutable_update", "studio_operation_immutable_update", "studio_review_snapshot_check"]));
  });
  afterEach(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const artifacts = 'SELECT artifact.id FROM studio_artifact artifact JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
      await client.query(`DELETE FROM studio_review WHERE "artifactId" IN (${artifacts})`, [works]);
      await client.query(`DELETE FROM studio_mutation_receipt WHERE "artifactId" IN (${artifacts})`, [works]);
      await client.query(`DELETE FROM studio_operation WHERE "artifactId" IN (${artifacts})`, [works]);
      await client.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (SELECT id FROM studio_revision WHERE "artifactId" IN (${artifacts}))`, [works]);
      await client.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]);
      await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
      await client.query("COMMIT"); works.length = 0; users.length = 0;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  });
  async function user() { const id = randomUUID(); users.push(id); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, "Session test actor"]); return id; }
  async function member(workId: string, role = "commenter") {
    const id = await user(); await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,'active',$4,now())`, [workId, id, role, randomUUID()]); return id;
  }
  async function fixture() {
    const actor = await user(), workId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID();
    const originId = randomUUID(), submissionId = randomUUID(), revisionId = randomUUID(), reviewId = randomUUID(); works.push(workId);
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [workId, actor, "Session fixture"]);
    await graph.createProject(actor, { projectId, workId, workspaceId: randomUUID(), artifact: { id: artifactId, kind: "review-snapshot", title: "Pinned input", scope: { projectId } },
      initialRevision: { id: originId, rootGraphHash: "a".repeat(64), deviceId: "session-test", createdAt: new Date().toISOString(), blobRefs: [] } }, randomUUID());
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [id, kind, parent] of [[submissionId, "submission", originId], [revisionId, "review-snapshot", submissionId]]) {
        await client.query('INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","createdBy","deviceId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,now())', [id, artifactId, kind, "a".repeat(64), actor, "session-test"]);
        await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)', [id, parent]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await graph.createReview(actor, artifactId, { id: reviewId, revisionId, title: "Pinned session input", reviewerIds: [actor] });
    const invited = await member(workId), uninvited = await member(workId, "editor");
    const input = { operationId: randomUUID(), id: randomUUID(), title: "Panel review", purpose: "Review the exact submitted panel", kind: "review" as const,
      input: { schemaVersion: 1 as const, workId, projectId, artifactId, reviewId, revisionId, rootGraphHash: "a".repeat(64) }, invitedUserIds: [invited] };
    return { actor, workId, projectId, artifactId, reviewId, revisionId, invited, uninvited, input };
  }
  it("persists a pinned draft and recovers the exact receipt without duplicate revisions", async () => {
    const f = await fixture(), first = await sessions.create(f.actor, f.workId, f.input);
    const replay = await sessions.create(f.actor, f.workId, f.input);
    expect(replay).toEqual(first);
    expect((await sessions.receipt(f.actor, f.workId, f.input.id, f.input.operationId)).receipt).toEqual(first.receipt);
    expect((await sessions.current(f.invited, f.workId, f.input.id)).session.input).toEqual(f.input.input);
    expect(first.view.session.participantUserIds).toEqual([f.actor]);
    await expect(sessions.create(f.actor, f.workId, { ...f.input, title: "Changed intent" })).rejects.toMatchObject({ code: "idempotency" });
    expect((await sessions.current(f.actor, f.workId, f.input.id)).session.version).toBe(1);
  });
  it("does not expose the session to an uninvited editor through lists or generic graph APIs", async () => {
    const f = await fixture(); await sessions.create(f.actor, f.workId, f.input);
    expect((await sessions.list(f.uninvited, f.workId, null)).items).toEqual([]);
    await expect(sessions.current(f.uninvited, f.workId, f.input.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(sessions.receipt(f.uninvited, f.workId, f.input.id, f.input.operationId)).rejects.toMatchObject({ code: "forbidden" });
    const project = await graph.getProject(f.uninvited, f.projectId);
    expect(project.artifacts.map((artifact) => artifact.id)).toEqual([f.artifactId]);
    const stored = (await pool.query<{ id: string }>('SELECT id FROM studio_artifact WHERE "projectId"=$1 AND id LIKE $2', [f.projectId, "studio-work-session:%"])).rows[0]!;
    await expect(graph.listRevisions(f.uninvited, stored.id)).rejects.toMatchObject({ causeCode: "work_session_endpoint_required" });
  });
  it("keeps artifact and project timestamps monotonic when the server clock trails existing records", async () => {
    const f = await fixture(); await sessions.create(f.actor, f.workId, f.input);
    const future = "2099-01-01T00:00:00.000Z";
    await pool.query(`UPDATE studio_artifact SET "createdAt"=$2,"updatedAt"=$2 WHERE "projectId"=$1 AND id LIKE 'studio-work-session:%'`, [f.projectId, future]);
    await pool.query('UPDATE studio_project_graph SET "createdAt"=$2,"updatedAt"=$2 WHERE id=$1', [f.projectId, future]);
    const result = await sessions.command(f.actor, f.workId, f.input.id, { action: "ready", operationId: randomUUID(), expectedVersion: 1 });
    expect(result.view.session).toMatchObject({ status: "ready", version: 2 });
    const artifact = (await pool.query<{ updatedAt: Date }>(`SELECT "updatedAt" FROM studio_artifact WHERE "projectId"=$1 AND id LIKE 'studio-work-session:%'`, [f.projectId])).rows[0]!;
    const project = (await pool.query<{ updatedAt: Date }>('SELECT "updatedAt" FROM studio_project_graph WHERE id=$1', [f.projectId])).rows[0]!;
    expect(artifact.updatedAt.toISOString()).toBe(future); expect(project.updatedAt.toISOString()).toBe(future);
    expect((await sessions.current(f.actor, f.workId, f.input.id)).session.version).toBe(2);
  });

  it("serializes competing updates and requires a fresh explicit decision after a conflict", async () => {
    const f = await fixture(); await sessions.create(f.actor, f.workId, f.input);
    const results = await Promise.allSettled([sessions.command(f.actor, f.workId, f.input.id, { action: "ready", operationId: randomUUID(), expectedVersion: 1 }),
      sessions.command(f.actor, f.workId, f.input.id, { action: "ready", operationId: randomUUID(), expectedVersion: 1 })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "conflict" } });
    expect((await sessions.current(f.actor, f.workId, f.input.id)).session).toMatchObject({ status: "ready", version: 2 });
  });
  it("distinguishes invite, join, note, close and manuscript approval", async () => {
    const f = await fixture(); await sessions.create(f.actor, f.workId, f.input);
    await sessions.command(f.invited, f.workId, f.input.id, { action: "join", operationId: randomUUID(), expectedVersion: 1 });
    const note = { action: "note" as const, operationId: randomUUID(), expectedVersion: 2, category: "note" as const, body: "Keep the scene's viewpoint." };
    const first = await sessions.command(f.invited, f.workId, f.input.id, note); expect(first.view.session.notes[0]?.authorUserId).toBe(f.invited);
    expect(await sessions.command(f.invited, f.workId, f.input.id, note)).toEqual(first);
    await expect(sessions.command(f.invited, f.workId, f.input.id, { ...note, operationId: randomUUID(), expectedVersion: 3, category: "decision" })).rejects.toMatchObject({ code: "forbidden" });
    await sessions.command(f.actor, f.workId, f.input.id, { action: "ready", operationId: randomUUID(), expectedVersion: 3 });
    await sessions.command(f.actor, f.workId, f.input.id, { action: "start", operationId: randomUUID(), expectedVersion: 4 });
    const closed = await sessions.command(f.actor, f.workId, f.input.id, { action: "close", operationId: randomUUID(), expectedVersion: 5, summary: "No final approval. Revise and submit again." });
    expect(closed.view.session.status).toBe("closed"); expect((await graph.getReview(f.actor, f.reviewId)).status).toBe("open");
    expect((await graph.getProject(f.actor, f.projectId)).artifacts[0]!.approvedRevisionId).toBeNull();
    await expect(sessions.command(f.actor, f.workId, f.input.id, { action: "start", operationId: randomUUID(), expectedVersion: 6 })).rejects.toMatchObject({ code: "closed" });
  });
  it("requires current membership even for receipt recovery and historical reads", async () => {
    const f = await fixture(); await sessions.create(f.actor, f.workId, f.input);
    const join = { action: "join" as const, operationId: randomUUID(), expectedVersion: 1 };
    await sessions.command(f.invited, f.workId, f.input.id, join);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.invited]);
    await expect(sessions.current(f.invited, f.workId, f.input.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(sessions.receipt(f.invited, f.workId, f.input.id, join.operationId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(sessions.command(f.invited, f.workId, f.input.id, join)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("rejects forged input and outcome references without changing the session", async () => {
    const f = await fixture();
    await expect(sessions.create(f.actor, f.workId, { ...f.input, input: { ...f.input.input, rootGraphHash: "b".repeat(64) } })).rejects.toMatchObject({ code: "invalid-target" });
    await sessions.create(f.actor, f.workId, f.input);
    await expect(sessions.command(f.actor, f.workId, f.input.id, { action: "attach-result", operationId: randomUUID(), expectedVersion: 1, result: { type: "task", id: randomUUID() } })).rejects.toMatchObject({ code: "invalid-target" });
    expect((await sessions.current(f.actor, f.workId, f.input.id)).session.version).toBe(1);
  });
});
