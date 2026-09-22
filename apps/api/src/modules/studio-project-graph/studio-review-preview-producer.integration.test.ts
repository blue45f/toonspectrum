import type { PinnedShareCreate } from "@toonspectrum/studio-project-model/pinned-review-share";
import { createHash, randomUUID } from "node:crypto";
import { Image, decodePng, encodePng } from "image-js";
import { Pool } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { studioHandoffReceiptQuery } from "../creator/studio-handoff-receipt-query";
import { createStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseRuntime from "../../db";
import type { PrivateObjectStoragePort } from "../../infrastructure/private-object-storage/private-object-storage.port";
import type { DrizzleStudioWorkAssetRepository } from "../creator/studio-work-asset.repository";
import type { StudioWorkAssetService } from "../creator/studio-work-asset.service";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioReviewPreviewProducerRepository } from "./studio-review-preview-producer.repository";
import type { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import type { StudioReviewPreviewService } from "./studio-review-preview.service";
import type { deleteWork as DeleteWork } from "../../server/creator/works";
import { studioReviewPreviewDigest, studioReviewPreviewIntentKey, studioReviewPreviewPageAsset,
  type StudioReviewPreviewCapture, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";

const URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !URL) throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; review preview pin/delete transactions cannot be skipped");
const withPostgres = URL ? describe : describe.skip;

withPostgres("review capture PostgreSQL ownership, immutable history and object lifetime", () => {
  let pool: Pool;
  let database: typeof DatabaseRuntime;
  let assets: DrizzleStudioWorkAssetRepository;
  let assetService: StudioWorkAssetService;
  let graph: StudioProjectGraphRepository;
  let repository: StudioReviewPreviewProducerRepository;
  let service: StudioReviewPreviewProducerService;
  let reader: StudioReviewPreviewService;
  let deleteWork: typeof DeleteWork;
  const users: string[] = [];
  const stored = new Map<string, Buffer>();
  const previousDatabase = process.env.DATABASE_URL;
  const previousAdmission = process.env.STUDIO_WORK_ASSET_ADMISSION;
  const pixels = new Uint8Array([10, 20, 30, 40, 255, 0, 127, 0]);
  const png = Buffer.from(encodePng(new Image(2, 1, { data: pixels, colorModel: "RGBA" })));
  const file = () => ({ buffer: Buffer.from(png), size: png.length, mimetype: "image/png" });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL!;
    pool = new Pool({ connectionString: URL, max: 3, application_name: "studio-review-preview-integration" });
    database = await import("../../db");
    const assetModule = await import("../creator/studio-work-asset.repository");
    const assetServiceModule = await import("../creator/studio-work-asset.service");
    const graphModule = await import("./studio-project-graph.repository");
    const producerModule = await import("./studio-review-preview-producer.repository");
    const producerServiceModule = await import("./studio-review-preview-producer.service");
    const readerModule = await import("./studio-review-preview.service");
    deleteWork = (await import("../../server/creator/works")).deleteWork;
    const storage: PrivateObjectStoragePort = {
      async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
      async uploadImmutable(input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
          purpose: input.purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`, byteLength: input.bytes.length, contentType: input.contentType };
        stored.set(`${object.purpose}:${object.digest}`, Buffer.from(input.bytes));
        return object;
      },
      async createSignedReadUrl({ object, expiresInSeconds }) {
        if (!stored.has(`${object.purpose}:${object.digest}`)) throw new Error("missing test object");
        return { url: `https://preview.invalid/${object.digest.slice(7)}`, expiresAtEpochMs: Date.now() + expiresInSeconds * 1000 };
      },
      async deleteGeneratedObject({ object }) { stored.delete(`${object.purpose}:${object.digest}`); },
    };
    assets = new assetModule.DrizzleStudioWorkAssetRepository();
    assetService = new assetServiceModule.StudioWorkAssetService(assets, storage);
    graph = new graphModule.StudioProjectGraphRepository();
    repository = new producerModule.StudioReviewPreviewProducerRepository(graph);
    service = new producerServiceModule.StudioReviewPreviewProducerService(repository, assetService);
    reader = new readerModule.StudioReviewPreviewService(graph, storage);
  });
  beforeEach(() => { process.env.STUDIO_WORK_ASSET_ADMISSION = "enable-immutable-readonly-work-assets-v1"; });
  afterEach(async () => {
    const ids = users.splice(0);
    try {
      if (ids.length) {
        // Remove owned graph history first: immutable revisions intentionally
        // reject the createdBy SET NULL caused by deleting their actor first.
        const cleanup = await pool.connect();
        try {
          await cleanup.query('BEGIN');
          const revisions = 'SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId" JOIN creator_work work ON work.id=project."workId" WHERE work."userId"=ANY($1::text[])';
          await cleanup.query(`DELETE FROM studio_review WHERE "revisionId" IN (${revisions})`, [ids]);
          await cleanup.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (${revisions})`, [ids]);
          await cleanup.query(`DELETE FROM studio_operation WHERE "resultRevisionId" IN (${revisions})`, [ids]);
          await cleanup.query(`DELETE FROM studio_mutation_receipt WHERE "resultRevisionId" IN (${revisions})`, [ids]);
          await cleanup.query('DELETE FROM creator_work WHERE "userId" = ANY($1::text[])', [ids]);
          await cleanup.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [ids]);
          await cleanup.query('COMMIT');
        } catch (error) { await cleanup.query('ROLLBACK'); throw error; }
        finally { cleanup.release(); }
      }
    } finally { stored.clear(); }
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousAdmission === undefined) delete process.env.STUDIO_WORK_ASSET_ADMISSION; else process.env.STUDIO_WORK_ASSET_ADMISSION = previousAdmission;
  });

  it.each(["studio_project_graph", "studio_artifact"] as const)("keeps capture timestamps monotonic when %s is ahead of the current clock", async (table) => {
    const f = await capture(1), id = table === "studio_project_graph" ? f.intent.projectId : f.intent.artifactId;
    // Model clock rollback deterministically without sleeps or weaker constraints.
    await pool.query(`UPDATE ${table} SET "createdAt"=clock_timestamp()+interval '1 hour', "updatedAt"=clock_timestamp()+interval '2 hours' WHERE id=$1`, [id]);
    const before = (await pool.query(`SELECT "updatedAt" FROM ${table} WHERE id=$1`, [id])).rows[0]!;
    const result = await completeCapture(f.actor, f.intent);
    const after = (await pool.query(`SELECT "updatedAt">=$2::timestamptz AS retained, "updatedAt">="createdAt" AS valid FROM ${table} WHERE id=$1`, [id, before.updatedAt])).rows[0]!;
    expect(after).toEqual({ retained: true, valid: true });
    expect((await graph.getReview(f.actor, result.subject.reviewId)).status).toBe("open");
  });

  async function capture(pageCount = 2, extension: Record<string, unknown> = {}) {
    const actor = randomUUID(), workId = randomUUID(); users.push(actor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [actor, "Review capture integration"]);
    const doc = { ...extension, version: 3, width: 2, pagesList: Array.from({ length: pageCount }, (_, index) => ({ id: `page-${index}`, canvasH: 1,
      elements: [{ id: `cut-${index}`, type: "frame", x: 0, y: 0, width: 1, height: 1 }] })) };
    await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,4)', [workId, actor, "Review source", JSON.stringify(doc)]);
    const input: StudioReviewPreviewCapture = { intentId: randomUUID(), workId, sourceServerRevision: 4, sourceContentDigest: studioReviewPreviewDigest(doc), pageCount,
      title: "Pinned review", deviceId: "test-device", createdAt: new Date().toISOString() };
    const intent = await service.prepare(actor, input);
    return { actor, input, intent, doc };
  }

  async function completeCapture(actor: string, intent: StudioReviewPreviewIntent) {
    const pages = [];
    for (let ordinal = 0; ordinal < intent.pageCount; ordinal += 1) {
      const page = await service.upload(actor, intent, ordinal, file());
      pages.push({ ordinal, sha256: page.sha256 });
    }
    const result = await service.complete(actor, { intent, pages });
    if (result.status !== "completed") throw new Error("capture did not complete");
    const revision = (await graph.listRevisions(actor, intent.artifactId)).find((row) => row.id === result.subject.revisionId);
    if (!revision || revision.parentIds.length !== 1) throw new Error("missing actual capture submission");
    return { subject: result.subject, submissionId: revision.parentIds[0]! };
  }

  async function resolutionFixture(advanceSavedSource = true) {
    const f = await capture(1);
    const original = await completeCapture(f.actor, f.intent);
    const comment = await graph.createReviewComment(f.actor, original.subject.reviewId, { id: randomUUID(), body: "Correct this saved cut",
      severity: "note", assigneeIds: [], anchor: { kind: "artifact", artifactId: f.intent.artifactId,
        revisionId: original.subject.revisionId, scope: { projectId: f.intent.projectId } } });
    const newDoc = advanceSavedSource ? { ...f.doc, correction: "second saved document" } : f.doc;
    if (advanceSavedSource) await pool.query('UPDATE creator_work SET revision=5,doc=$2::jsonb WHERE id=$1', [f.input.workId, JSON.stringify(newDoc)]);
    // Deliberately older client clock: only saved revision and server sequence prove succession.
    const nextIntent = await service.prepare(f.actor, { ...f.input, intentId: randomUUID(), sourceServerRevision: advanceSavedSource ? 5 : 4,
      sourceContentDigest: studioReviewPreviewDigest(newDoc), createdAt: "2020-01-01T00:00:00Z" });
    const replacement = await completeCapture(f.actor, nextIntent);
    return { ...f, original, comment, replacement, nextIntent,
      resolve: { status: "resolved" as const, resolutionRevisionId: replacement.submissionId, resolutionSourceRef: replacement.subject } };
  }

  it.each([
    { roles: [], briefs: ["brief"] },
    { roles: ["role"], briefs: [] },
    { roles: [], briefs: [] },
    { roles: ["role-a", "role-b"], briefs: ["brief-a", "brief-b"] },
  ])("executes the handoff receipt query with PostgreSQL array parameters %j", async ({ roles, briefs }) => {
    const f = await capture(1);
    const query = new PgDialect().sqlToQuery(studioHandoffReceiptQuery(f.input.workId, roles, briefs));
    expect((await pool.query(query.sql, query.params)).rows).toEqual([]);
  });

  async function completionFixture() {
    const f = await resolutionFixture();
    await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve);
    const production = new (await import("../creator/studio-production.repository")).DrizzleStudioProductionRepository();
    const completion = new (await import("../creator/studio-review-task-completion.repository")).StudioReviewTaskCompletionRepository();
    const empty = await production.getWorkspace(f.actor, f.input.workId);
    const at = new Date().toISOString(), taskId = "선화 수정 1";
    const task = { id: taskId, title: "Correct the saved cut", owner: "", due: "2026-09-20", progress: 50, status: "doing" as const,
      stage: "lineart" as const, priority: "normal" as const, role: null, hierarchyNodeId: "episode", dependencyIds: [], assigneeIds: [], reviewerIds: [], blockedReason: "",
      reviewRef: { subject: f.original.subject, commentId: f.comment.id, handoffId: "handoff" } };
    await production.saveWorkspace(f.actor, f.input.workId, empty.revision, { ...empty.document,
      tasks: [task, { ...task, id: "other-task", reviewRef: undefined }],
      hierarchy: [{ id: "episode", kind: "episode", parentId: null, title: "Episode", order: 0, pageId: null }],
      handoffs: [{ id: "handoff", hierarchyNodeId: "episode", fromRole: "story", toRole: "lineart", status: "ready", scenePurpose: "", emotionalBeat: "",
        mustShow: [], continuityNotes: [], lockedFields: [], acceptanceCriteria: ["Direction corrected", "Sleeve preserved"], createdBy: "", assignedTo: "", updatedAt: at }] });
    const input = async () => { const context = await completion.read(f.actor, f.input.workId, taskId);
      return { requestId: randomUUID(), baseRevision: context.baseRevision, proofDigest: context.proofDigest, confirmedCriteria: context.criteria }; };
    return { ...f, completion, production, taskId, completionInput: input };
  }

  async function handoffFixture() {
    const f = await completionFixture(), recipient = randomUUID(); users.push(recipient);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [recipient, "Handoff recipient"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'viewer','active',$3,now())`, [f.input.workId, recipient, randomUUID()]);
    const current = await f.production.getWorkspace(f.actor, f.input.workId);
    await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document,
      roleAssignments: [{ id: "handoff-role", memberId: recipient, displayName: "Line artist", roles: ["lineart"], hierarchyNodeId: "episode" }] });
    await f.completion.complete(f.actor, f.input.workId, f.taskId, await f.completionInput());
    const Repository = (await import("../creator/studio-handoff-envelope.repository")).StudioHandoffEnvelopeRepository;
    const handoff = new Repository(), prepared = await handoff.prepare(f.actor, f.input.workId, f.taskId);
    expect(prepared.recipients).toHaveLength(1);
    const choice = prepared.recipients[0]!;
    const envelopeInput = { envelopeId: randomUUID(), taskId: f.taskId, baseRevision: prepared.baseRevision,
      completionFingerprint: prepared.completionFingerprint, recipient: { userId: choice.userId, roleAssignmentId: choice.roleAssignmentId },
      recipientBindingDigest: choice.bindingDigest, usageConditions: "Use only for this saved cut", remainingNotes: "Preserve the sleeve" };
    return { ...f, recipient, handoff, Repository, envelopeInput };
  }

  it("persists a handoff across repository instances with distinct reading and recipient acceptance", async () => {
    const f = await handoffFixture(), sent = await f.handoff.create(f.actor, f.input.workId, f.envelopeInput);
    const later = new f.Repository();
    expect((await later.list(f.recipient, f.input.workId, null)).items).toEqual([expect.objectContaining({ id: sent.envelope.id, direction: "received", status: "delivered" })]);
    const action = () => ({ requestId: randomUUID(), envelopeDigest: sent.envelopeDigest });
    await expect(later.act(f.recipient, f.input.workId, sent.envelope.id, "accept", { ...action(), confirmed: true })).rejects.toMatchObject({ code: "not-opened" });
    const opens = await Promise.all([later.act(f.recipient, f.input.workId, sent.envelope.id, "open", action()), f.handoff.act(f.recipient, f.input.workId, sent.envelope.id, "open", action())]);
    expect(opens[0]!.opened).toEqual(opens[1]!.opened);
    const accepts = await Promise.all([later.act(f.recipient, f.input.workId, sent.envelope.id, "accept", { ...action(), confirmed: true }), f.handoff.act(f.recipient, f.input.workId, sent.envelope.id, "accept", { ...action(), confirmed: true })]);
    expect(accepts[0]!.accepted).toEqual(accepts[1]!.accepted); expect(accepts[0]!.status).toBe("accepted");
    expect((await later.read(f.actor, f.input.workId, sent.envelope.id)).envelope).toEqual(sent.envelope);
    const records = await pool.query(`SELECT response->>'phase' AS phase, count(*)::int AS count FROM studio_mutation_receipt WHERE response->>'contract'='studio-handoff-envelope-action-v1' AND response->>'envelopeId'=$1 GROUP BY response->>'phase'`, [sent.envelope.id]);
    expect(records.rows).toEqual(expect.arrayContaining([{ phase: "open", count: 1 }, { phase: "accept", count: 1 }]));
    expect((await graph.getReview(f.actor, f.original.subject.reviewId)).status).toBe("open");
  });

  it("preserves identical delivery retries and permanently invalidates changed briefs without rewriting history", async () => {
    const f = await handoffFixture(), sent = await f.handoff.create(f.actor, f.input.workId, f.envelopeInput);
    expect((await f.handoff.create(f.actor, f.input.workId, f.envelopeInput)).envelope).toEqual(sent.envelope);
    await expect(f.handoff.create(f.actor, f.input.workId, { ...f.envelopeInput, usageConditions: "different" })).rejects.toMatchObject({ code: "idempotency" });
    let current = await f.production.getWorkspace(f.actor, f.input.workId);
    current = await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document,
      roleAssignments: current.document.roleAssignments.map((role) => ({ ...role, displayName: "Label only" })) });
    expect((await f.handoff.read(f.recipient, f.input.workId, sent.envelope.id)).status).toBe("delivered");
    const original = current.document.handoffs[0]!.scenePurpose;
    for (const scenePurpose of ["Changed purpose", original]) current = await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document,
      handoffs: current.document.handoffs.map((brief) => ({ ...brief, scenePurpose })) });
    const changed = await f.handoff.read(f.recipient, f.input.workId, sent.envelope.id);
    expect(changed.status).toBe("changed"); expect(changed.canAccept).toBe(false); expect(changed.envelope).toEqual(sent.envelope);
  });

  it("denies revoked recipients and keeps a regranted invitation from reviving old acceptance", async () => {
    const f = await handoffFixture(), sent = await f.handoff.create(f.actor, f.input.workId, f.envelopeInput);
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, f.recipient]);
    await expect(f.handoff.read(f.recipient, f.input.workId, sent.envelope.id)).rejects.toMatchObject({ code: "forbidden" });
    await pool.query(`UPDATE creator_work_collaborator SET status='active',"invitationId"=$3 WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, f.recipient, randomUUID()]);
    expect((await f.handoff.read(f.recipient, f.input.workId, sent.envelope.id)).status).toBe("changed");
    const cancelled = await f.handoff.act(f.actor, f.input.workId, sent.envelope.id, "cancel", { requestId: randomUUID(), envelopeDigest: sent.envelopeDigest });
    expect(cancelled.status).toBe("cancelled"); expect(cancelled.envelope).toEqual(sent.envelope);
  });

  it("records real captured review task completion atomically and replays without another workspace write", async () => {
    const f = await completionFixture(), input = await f.completionInput();
    const before = await f.production.getWorkspace(f.actor, f.input.workId);
    const result = await f.completion.complete(f.actor, f.input.workId, f.taskId, input);
    expect(result.evidence?.current).toBe(true); expect(result.evidence?.receipt.completedBy).toBe(f.actor);
    expect(result.evidence?.receipt.completedAt).toMatch(/\.\d{6}Z$/u);
    const after = await f.production.getWorkspace(f.actor, f.input.workId);
    expect(after.revision).toBe(before.revision + 1); expect(after.document.tasks[0]).toMatchObject({ status: "done", progress: 100, stage: "lineart" });
    expect(after.document.tasks[1]).toEqual(before.document.tasks[1]);
    expect((await f.completion.complete(f.actor, f.input.workId, f.taskId, input)).evidence).toEqual(result.evidence);
    expect((await f.production.getWorkspace(f.actor, f.input.workId)).revision).toBe(after.revision);
    expect((await graph.getReview(f.actor, f.original.subject.reviewId)).status).toBe("open");
    const receipt = (await pool.query(`SELECT response FROM studio_mutation_receipt WHERE response->>'requestId'=$1`, [input.requestId])).rows;
    expect(receipt).toHaveLength(1);
  });

  it("preserves evidence on unrelated saves and permanently invalidates criteria A -> B -> A", async () => {
    const f = await completionFixture(), input = await f.completionInput(); await f.completion.complete(f.actor, f.input.workId, f.taskId, input);
    let current = await f.production.getWorkspace(f.actor, f.input.workId);
    current = await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document, title: "Renamed workspace",
      tasks: current.document.tasks.map((task) => task.id === "other-task" ? { ...task, title: "Unrelated task renamed" } : task) });
    expect((await f.completion.read(f.actor, f.input.workId, f.taskId)).evidence?.current).toBe(true);
    const criteria = [...current.document.handoffs[0]!.acceptanceCriteria];
    current = await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document,
      handoffs: current.document.handoffs.map((handoff) => ({ ...handoff, acceptanceCriteria: ["Changed criterion"] })) });
    current = await f.production.saveWorkspace(f.actor, f.input.workId, current.revision, { ...current.document,
      handoffs: current.document.handoffs.map((handoff) => ({ ...handoff, acceptanceCriteria: criteria })) });
    expect((await f.completion.read(f.actor, f.input.workId, f.taskId)).evidence?.current).toBe(false);
    expect((await f.completion.complete(f.actor, f.input.workId, f.taskId, input)).evidence?.current).toBe(false);
    expect((await f.production.getWorkspace(f.actor, f.input.workId)).revision).toBe(current.revision);
    const invalidated = (await pool.query(`SELECT count(*)::int AS count FROM studio_mutation_receipt WHERE response->>'contract'='studio-review-task-completion-invalidated-v1' AND response->>'workId'=$1`, [f.input.workId])).rows[0];
    expect(invalidated.count).toBe(2);
    expect((await f.completion.complete(f.actor, f.input.workId, f.taskId, await f.completionInput())).evidence?.current).toBe(true);
  });

  it("compares exact PostgreSQL microseconds and rejects reopened or unattested sources", async () => {
    const f = await completionFixture();
    const base = (await pool.query(`SELECT to_char(date_trunc('millisecond',clock_timestamp()) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0].at;
    await pool.query(`UPDATE studio_review_comment SET "updatedAt"=$2::timestamptz+interval '1 microsecond' WHERE id=$1`, [f.comment.id, base]);
    await f.completion.complete(f.actor, f.input.workId, f.taskId, await f.completionInput());
    await pool.query(`UPDATE studio_review_comment SET "updatedAt"=$2::timestamptz+interval '2 microseconds' WHERE id=$1`, [f.comment.id, base]);
    expect((await f.completion.read(f.actor, f.input.workId, f.taskId)).evidence?.current).toBe(false);
    await graph.reopenReviewComment(f.actor, f.comment.id);
    await expect(f.completion.read(f.actor, f.input.workId, f.taskId)).rejects.toMatchObject({ code: "unresolved" });
  });

  it("denies a revoked editor on replay and rejects generic workspace evidence injection", async () => {
    const f = await completionFixture(), editor = randomUUID(); users.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "Completion editor"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`, [f.input.workId, editor, randomUUID()]);
    const input = await f.completionInput(); const done = await f.completion.complete(editor, f.input.workId, f.taskId, input);
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, editor]);
    await expect(f.completion.complete(editor, f.input.workId, f.taskId, input)).rejects.toMatchObject({ code: "forbidden" });
    const workspace = await f.production.getWorkspace(f.actor, f.input.workId);
    const { StudioProductionWorkspaceDocumentSchema } = await import("../creator/studio-production.dto");
    expect(StudioProductionWorkspaceDocumentSchema.safeParse({ ...workspace.document, tasks: [{ ...workspace.document.tasks[0], reviewCompletion: done.evidence?.receipt }] }).success).toBe(false);
  });

  it("resolves against the actual newer capture submission, survives lost completion/replay and later graph heads", async () => {
    const f = await resolutionFixture();
    expect((await service.status(f.actor, f.nextIntent))).toMatchObject({ status: "completed", subject: f.replacement.subject });
    expect((await service.cancel(f.actor, f.nextIntent))).toMatchObject({ status: "completed", subject: f.replacement.subject });
    const result = await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve);
    expect(result).toMatchObject({ status: "resolved", resolutionRevisionId: f.replacement.submissionId });
    expect(Object.keys(result).sort()).toEqual(["id", "resolutionRevisionId", "resolvedBy", "status", "updatedAt"]);
    const next = await service.prepare(f.actor, { ...f.input, intentId: randomUUID(), sourceServerRevision: 5,
      sourceContentDigest: f.nextIntent.sourceContentDigest });
    await completeCapture(f.actor, next);
    expect(await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).toEqual(result);
    await graph.reopenReviewComment(f.actor, f.comment.id);
    expect(await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).toMatchObject({ status: "resolved" });
  });

  it("rejects same-artifact unrelated submissions, same snapshots and forged pins without changing the note", async () => {
    const f = await resolutionFixture();
    const references = [f.original.subject,
      ...(["workId", "projectId", "artifactId", "reviewId", "revisionId", "rootGraphHash"] as const)
        .map((field) => ({ ...f.replacement.subject, [field]: field === "rootGraphHash" ? "f".repeat(64) : randomUUID() }))];
    for (const resolutionSourceRef of references) await expect(graph.resolveReviewComment(f.actor, f.comment.id,
      { ...f.resolve, resolutionSourceRef })).rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
    await expect(graph.resolveReviewComment(f.actor, f.comment.id, { ...f.resolve, resolutionRevisionId: f.original.submissionId }))
      .rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
    expect((await graph.getReview(f.actor, f.original.subject.reviewId)).comments[0]).toMatchObject({ status: "open", resolutionRevisionId: null });
  });

  it("requires a later saved source, not just a new capture or a later client date", async () => {
    const f = await resolutionFixture(false);
    await expect(graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
    // Legacy manual resolution remains a distinct compatible operation.
    expect(await graph.resolveReviewComment(f.actor, f.comment.id, { status: "resolved", resolutionRevisionId: f.replacement.submissionId }))
      .toMatchObject({ status: "resolved" });
    await expect(graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
  });

  it.each(["original", "replacement"] as const)("does not infer producer authority from graph operations without the %s completed receipt", async (side) => {
    const f = await resolutionFixture();
    // Only this fixture's receipt is removed; immutable graph rows and all database guards stay enabled.
    await pool.query('DELETE FROM studio_mutation_receipt WHERE "resultRevisionId"=$1 AND response->>\'status\'=\'completed\'', [f[side].subject.revisionId]);
    await expect(graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
    expect((await graph.getReview(f.actor, f.original.subject.reviewId)).comments[0]).toMatchObject({ status: "open", resolutionRevisionId: null });
    expect(await graph.resolveReviewComment(f.actor, f.comment.id, { status: "resolved", resolutionRevisionId: f.replacement.submissionId }))
      .toMatchObject({ status: "resolved" });
  });

  it.each(["approved", "rejected", "cancelled"] as const)("keeps %s review decisions and exact verified retry semantics", async (status) => {
    const f = await resolutionFixture();
    const untouched = await graph.createReviewComment(f.actor, f.original.subject.reviewId, { id: randomUUID(), body: "Another note",
      severity: "note", assigneeIds: [], anchor: { kind: "artifact", artifactId: f.intent.artifactId,
        revisionId: f.original.subject.revisionId, scope: { projectId: f.intent.projectId } } });
    const result = await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve);
    await graph.decideReview(f.actor, f.original.subject.reviewId, { status });
    expect(await graph.resolveReviewComment(f.actor, f.comment.id, f.resolve)).toEqual(result);
    await expect(graph.resolveReviewComment(f.actor, f.comment.id, { ...f.resolve,
      resolutionSourceRef: { ...f.resolve.resolutionSourceRef, rootGraphHash: "e".repeat(64) } }))
      .rejects.toMatchObject({ causeCode: "review_resolution_source_mismatch" });
    await expect(graph.resolveReviewComment(f.actor, untouched.id, f.resolve)).rejects.toMatchObject({ causeCode: "review_already_decided" });
  });

  it("allows another current editor to resolve captured work but denies a revoked editor even on exact replay", async () => {
    const f = await resolutionFixture(), editor = randomUUID(); users.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "Review resolver"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`,
      [f.input.workId, editor, randomUUID()]);
    expect(await graph.resolveReviewComment(editor, f.comment.id, f.resolve)).toMatchObject({ resolvedBy: editor });
    await pool.query(`UPDATE creator_work_collaborator SET role='viewer' WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, editor]);
    await expect(graph.resolveReviewComment(editor, f.comment.id, f.resolve)).rejects.toMatchObject({ name: "StudioProjectForbiddenError" });
  });

  it("keeps two identical transparent pages distinct through actual admission, snapshot commit and authenticated historical reading", async () => {
    const { actor, intent, doc } = await capture();
    const pages = await Promise.all([service.upload(actor, intent, 0, file()), service.upload(actor, intent, 1, file())]);
    expect(pages[0]!.sha256).not.toBe(pages[1]!.sha256);
    const refs = pages.map(({ ordinal, sha256 }) => ({ ordinal, sha256 }));
    const completed = await service.complete(actor, { intent, pages: refs });
    expect(completed.status).toBe("completed"); if (completed.status !== "completed") throw new Error("capture did not complete");
    const read = await reader.read(actor, completed.subject, null);
    expect(read).toMatchObject({ ok: true, previews: refs, nextCursor: null });
    if (!read.ok) throw new Error("missing preview");
    expect(read.previews.map((preview) => preview.mapping)).toMatchObject([
      { status: "mapped", sourceServerRevision: 4, sourceContentDigest: intent.sourceContentDigest,
        page: { ordinal: 0, id: "page-0", width: 2, height: 1, renderWidth: 2, renderHeight: 1, frames: [{ id: "cut-0" }] } },
      { status: "mapped", page: { ordinal: 1, id: "page-1", frames: [{ id: "cut-1" }] } },
    ]);
    const spatial = createStudioReviewSpatialAnchor(read.previews[0]!.mapping, { kind: "panel", frameId: "cut-0" });
    if (!spatial) throw new Error("missing spatial source");
    const note = { id: randomUUID(), body: "Pinned first cut", severity: "note" as const, assigneeIds: [],
      anchor: { ...spatial, artifactId: completed.subject.artifactId, revisionId: completed.subject.revisionId, scope: { projectId: completed.subject.projectId } } };
    expect(await graph.createReviewComment(actor, completed.subject.reviewId, note)).toMatchObject({ anchor: note.anchor });
    await expect(graph.createReviewComment(actor, completed.subject.reviewId, { ...note, id: randomUUID(),
      anchor: { ...note.anchor, source: { ...note.anchor.source, frameId: "cut-1" } },
    })).rejects.toMatchObject({ causeCode: "review_source_anchor_mismatch" });
    await expect(graph.createReviewComment(actor, completed.subject.reviewId, { ...note, id: randomUUID(),
      anchor: { ...note.anchor, scope: { ...note.anchor.scope, episodeId: "guessed-episode", panelId: "page-0" } },
    })).rejects.toMatchObject({ causeCode: "review_anchor_scope_mismatch" });
    await pool.query('UPDATE creator_work SET revision=5,doc=$2::jsonb WHERE id=$1', [intent.workId, JSON.stringify({ width: 900, pagesList: [] })]);
    expect(await reader.read(actor, completed.subject, null)).toMatchObject({ ok: true,
      previews: [{ mapping: { sourceServerRevision: 4, page: { id: "page-0", width: 2 } } }, { mapping: { page: { id: "page-1" } } }] });
    for (const page of refs) expect([...decodePng(stored.get(`derived:sha256:${page.sha256}`)!).getRawImage().data]).toEqual([...pixels]);
    const operation = await pool.query<{ operation: { payload: { sourceSnapshot: unknown } } }>('SELECT operation FROM studio_operation WHERE "resultRevisionId"=$1', [completed.subject.revisionId]);
    expect(operation.rows[0]!.operation.payload.sourceSnapshot).toEqual(doc);
    expect(await service.complete(actor, { intent, pages: refs })).toEqual(completed);
    expect(await service.cancel(actor, intent)).toEqual(completed);
    await pool.query('UPDATE studio_review SET status=\'approved\',"decidedAt"=now(),"decidedBy"=$2 WHERE id=$1', [completed.subject.reviewId, actor]);
    expect(await reader.read(actor, completed.subject, null)).toMatchObject({ ok: true, previews: refs });
    const assetId = studioReviewPreviewPageAsset(studioReviewPreviewIntentKey(actor, intent), 0);
    await expect(assetService.deleteGeneratedObject(actor, intent.workId, assetId, "derived", assetId, `sha256:${refs[0]!.sha256}`)).rejects.toMatchObject({ status: 409 });
    expect(stored.has(`derived:sha256:${refs[0]!.sha256}`)).toBe(true);
  });

  it("retains a lost prepare receipt after document edits but refuses to capture the changed source", async () => {
    const { actor, input, intent } = await capture();
    await pool.query('UPDATE creator_work SET revision=5,doc=$2::jsonb WHERE id=$1', [intent.workId, JSON.stringify({ pagesList: [] })]);
    expect(await service.prepare(actor, input)).toEqual(intent);
    await expect(service.upload(actor, intent, 0, file())).rejects.toMatchObject({ status: 409 });
    expect(stored.size).toBe(0);
    await expect(service.prepare(actor, { ...input, title: "changed under same key" })).rejects.toMatchObject({ status: 409 });
    expect(await service.cancel(actor, input)).toEqual({ status: "cancelled", cleanupPending: false });
  });

  it("journals cancellation, reclaims exact owned uploads and cannot revive from late upload/complete", async () => {
    const { actor, intent } = await capture(1);
    const page = await service.upload(actor, intent, 0, file());
    expect(await service.cancel(actor, intent)).toEqual({ status: "cancelled", cleanupPending: false });
    expect(stored.has(`derived:sha256:${page.sha256}`)).toBe(false);
    await expect(service.upload(actor, intent, 0, file())).rejects.toMatchObject({ status: 409 });
    expect(await service.complete(actor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] })).toEqual({ status: "cancelled" });
    const reviews = await pool.query('SELECT id FROM studio_review WHERE "artifactId"=$1', [intent.artifactId]);
    expect(reviews.rows).toEqual([]);
  });

  it("serializes a real generated-object deletion against snapshot publication on the existing row lock", async () => {
    const { actor, intent } = await capture(1);
    const page = await service.upload(actor, intent, 0, file());
    const assetId = studioReviewPreviewPageAsset(studioReviewPreviewIntentKey(actor, intent), 0);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT digest FROM creator_asset_storage_object WHERE purpose='derived' AND digest=$1 FOR UPDATE", [`sha256:${page.sha256}`]);
      const deleting = assets.beginGeneratedStorageReferenceDelete(actor, { workId: intent.workId, sourceAssetId: assetId, purpose: "derived", referenceId: assetId, expectedDigest: `sha256:${page.sha256}` });
      await expect.poll(async () => Number((await pool.query<{ count: string }>(`SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%creator_asset_storage_object%'`)).rows[0]?.count ?? 0), { timeout: 5000 }).toBeGreaterThan(0);
      const publishing = service.complete(actor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] });
      const rejected = expect(publishing).rejects.toThrow();
      await blocker.query("COMMIT");
      const plan = await deleting;
      await rejected;
      expect(plan.remoteDeleteRequired).toBe(true);
      const reviews = await pool.query('SELECT id FROM studio_review WHERE "artifactId"=$1', [intent.artifactId]);
      expect(reviews.rows).toHaveLength(0);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });

  it("keeps configured-off admission closed even for an otherwise authorized saved source", async () => {
    const { actor, intent } = await capture(1);
    delete process.env.STUDIO_WORK_ASSET_ADMISSION;
    await expect(service.upload(actor, intent, 0, file())).rejects.toMatchObject({ status: 403 });
    expect(stored.size).toBe(0);
    const blobs = await pool.query('SELECT "blobHash" FROM studio_revision_blob WHERE "revisionId"=$1', [intent.expectedHeadRevisionId]);
    expect(blobs.rows).toHaveLength(0);
  });

  it("assigns the owner without promoting an editing submitter and rejects a revoked reader", async () => {
    const { actor: owner, input } = await capture(1);
    const editor = randomUUID(); users.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "Editing submitter"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`, [input.workId, editor, randomUUID()]);
    const intent = await service.prepare(editor, { ...input, intentId: randomUUID() });
    const page = await service.upload(editor, intent, 0, file());
    const result = await service.complete(editor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] });
    if (result.status !== "completed") throw new Error("capture did not complete");
    expect((await pool.query('SELECT "reviewerUserId" FROM studio_review_reviewer WHERE "reviewId"=$1', [result.subject.reviewId])).rows).toEqual([{ reviewerUserId: owner }]);
    await expect(graph.decideReview(editor, result.subject.reviewId, { status: "approved" })).rejects.toThrow();
    expect(await reader.read(editor, result.subject, null)).toMatchObject({ ok: true });
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [intent.workId, editor]);
    await expect(reader.read(editor, result.subject, null)).rejects.toMatchObject({ status: 403 });
    await expect(service.status(editor, intent)).rejects.toMatchObject({ status: 403 });
  });

  it("preserves work-delete authorization and generated cleanup, rolls back graph cleanup, then deletes the owned whole work", async () => {
    const { actor, intent } = await capture(1);
    const page = await service.upload(actor, intent, 0, file());
    const result = await service.complete(actor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] });
    if (result.status !== "completed") throw new Error("capture did not complete");
    const stranger = randomUUID(); users.push(stranger);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [stranger, "Unauthorized deleter"]);
    await expect(deleteWork(stranger, intent.workId, false)).rejects.toThrow("작성자만");
    await expect(assetService.deleteGeneratedObjectsForWork(stranger, intent.workId, false)).rejects.toMatchObject({ status: 403 });
    await expect(deleteWork(actor, intent.workId, false)).rejects.toThrow("생성 에셋 정리");
    expect(await reader.read(actor, result.subject, null)).toMatchObject({ ok: true });
    expect(await assetService.deleteGeneratedObjectsForWork(actor, intent.workId, false)).toBe(1);
    const trigger = `test_review_delete_${randomUUID().replaceAll("-", "")}`;
    try {
      await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${intent.workId}' THEN RAISE EXCEPTION 'test work delete failure'; END IF; RETURN OLD; END $$`);
      await pool.query(`CREATE TRIGGER ${trigger} BEFORE DELETE ON creator_work FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
      await expect(deleteWork(actor, intent.workId, false)).rejects.toThrow();
      expect((await pool.query('SELECT id FROM studio_review WHERE id=$1', [result.subject.reviewId])).rows).toHaveLength(1);
      expect((await pool.query('SELECT "revisionId" FROM studio_revision_parent WHERE "revisionId"=$1', [result.subject.revisionId])).rows).toHaveLength(1);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON creator_work`);
      await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
    }
    expect(await deleteWork(actor, intent.workId, false)).toEqual({ deleted: true });
    expect((await pool.query('SELECT id FROM studio_project_graph WHERE id=$1', [intent.projectId])).rows).toHaveLength(0);
    expect((await pool.query('SELECT id FROM studio_revision WHERE id=$1', [result.subject.revisionId])).rows).toHaveLength(0);
    expect(stored.has(`derived:sha256:${page.sha256}`)).toBe(false);
  });

  it("reads permission after a concurrent revocation wins the work lock instead of publishing from a stale join snapshot", async () => {
    const { input } = await capture(1);
    const editor = randomUUID(); users.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "Revoked pending submitter"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`, [input.workId, editor, randomUUID()]);
    const intent = await service.prepare(editor, { ...input, intentId: randomUUID() });
    const page = await service.upload(editor, intent, 0, file());
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM creator_work WHERE id=$1 FOR UPDATE', [intent.workId]);
      const completing = service.complete(editor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] });
      const rejected = expect(completing).rejects.toMatchObject({ status: 403 });
      await expect.poll(async () => Number((await pool.query<{ count: string }>(`SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%creator_work%'`)).rows[0]?.count ?? 0), { timeout: 5000 }).toBeGreaterThan(0);
      await blocker.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [intent.workId, editor]);
      await blocker.query('COMMIT');
      await rejected;
      expect((await pool.query('SELECT id FROM studio_review WHERE "artifactId"=$1', [intent.artifactId])).rows).toHaveLength(0);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  });

  it("persists reading agenda against captured source, not a later work document, with per-item CAS", async () => {
    const f = await capture(2), captured = await completeCapture(f.actor, f.intent);
    const SessionRepository = (await import("./studio-work-session.repository")).StudioWorkSessionRepository;
    const sessions = new SessionRepository(), sessionId = randomUUID();
    const created = await sessions.create(f.actor, f.input.workId, { id: sessionId, operationId: randomUUID(),
      title: "Pinned reading", purpose: "Discuss the actual captured cuts", kind: "reading", input: captured.subject, invitedUserIds: [] });
    const resources = await sessions.resources(f.actor, f.input.workId, sessionId, 0);
    expect(resources.sourceStatus).toBe("mapped"); expect(resources.pages).toHaveLength(2);
    expect(resources.pages[0]!.source.pageId).toBe("page-0"); expect(resources.pages[0]!.frameIds).toEqual(["cut-0"]);
    expect(resources.pages[1]!.previewCursor).toMatch(/^0\.[a-f0-9]{64}$/u);
    // The actual saved document diverges; the session still reads the immutable captured input.
    await pool.query('UPDATE creator_work SET doc=$2::jsonb,revision=5 WHERE id=$1', [f.input.workId, JSON.stringify({ ...f.doc, pagesList: [] })]);
    expect((await sessions.resources(f.actor, f.input.workId, sessionId, 0)).pages).toEqual(resources.pages);
    const item = { id: randomUUID(), source: { ...resources.pages[0]!.source, frameId: "cut-0" },
      title: "First cut", purpose: "Gaze continuity", dialogue: "Proposed dialogue", assignedUserId: f.actor };
    const add = { action: "agenda-add" as const, operationId: randomUUID(), expectedVersion: created.view.session.version, item };
    const added = await sessions.command(f.actor, f.input.workId, sessionId, add);
    expect(await sessions.command(f.actor, f.input.workId, sessionId, add)).toEqual(added);
    const current = () => sessions.current(f.actor, f.input.workId, sessionId);
    const edit = { action: "agenda-edit" as const, itemId: item.id, expectedItemRevision: 1, title: "Changed proposal", purpose: "Purpose", dialogue: "Revised", assignedUserId: f.actor };
    await sessions.command(f.actor, f.input.workId, sessionId, { ...edit, operationId: randomUUID(), expectedVersion: 2 });
    await expect(sessions.command(f.actor, f.input.workId, sessionId, { ...edit, operationId: randomUUID(), expectedVersion: 3 }))
      .rejects.toMatchObject({ code: "conflict" });
    expect((await current()).session.workflow!.agenda[0]!.revision).toBe(2);
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "ready", operationId: randomUUID(), expectedVersion: 3 });
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "start", operationId: randomUUID(), expectedVersion: 4 });
    const focused = await sessions.command(f.actor, f.input.workId, sessionId, { action: "agenda-focus", itemId: item.id, operationId: randomUUID(), expectedVersion: 5 });
    expect(focused.view.session.readerUserId).toBe(f.actor);
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "agenda-conclude", itemId: item.id, expectedItemRevision: 2,
      body: "Revise the dialogue separately", operationId: randomUUID(), expectedVersion: 6 });
    const later = await new SessionRepository().current(f.actor, f.input.workId, sessionId);
    expect(later.session.workflow!.agenda[0]!.outcome!.body).toBe("Revise the dialogue separately");
    expect((await graph.getReview(f.actor, captured.subject.reviewId)).status).toBe("open");
    const work = await pool.query('SELECT doc,revision FROM creator_work WHERE id=$1', [f.input.workId]);
    expect(work.rows[0].revision).toBe(5); expect(work.rows[0].doc.pagesList).toEqual([]);
    const forged = { ...item, id: randomUUID(), source: { ...item.source, pageId: "invented-page" } };
    await expect(sessions.command(f.actor, f.input.workId, sessionId, { action: "agenda-add", item: forged, operationId: randomUUID(), expectedVersion: 7 }))
      .rejects.toMatchObject({ code: "invalid-target" });
    expect((await current()).session.version).toBe(7);
  });

  it("keeps material ballots actor-owned, freezes decision evidence, and rejects deleted or substituted bytes", async () => {
    const f = await capture(1), captured = await completeCapture(f.actor, f.intent);
    const SessionRepository = (await import("./studio-work-session.repository")).StudioWorkSessionRepository;
    const sessions = new SessionRepository(), sessionId = randomUUID(), member = randomUUID(), outsider = randomUUID();
    for (const id of [member, outsider]) {
      users.push(id); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, "Material participant"]);
      await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt")
        VALUES ($1,$2,'commenter','active',$3,now())`, [f.input.workId, id, randomUUID()]);
    }
    await sessions.create(f.actor, f.input.workId, { id: sessionId, operationId: randomUUID(), title: "Material selection", purpose: "Choose bytes, not a mutable URL",
      kind: "material-choice", input: captured.subject, invitedUserIds: [member] });
    await expect(sessions.resources(outsider, f.input.workId, sessionId, 0)).rejects.toMatchObject({ code: "forbidden" });
    const resources = await sessions.resources(member, f.input.workId, sessionId, 0);
    const registered = resources.assets.find((item) => item.elementType === "image")!;
    expect(registered).toBeTruthy();
    const proposal = { id: randomUUID(), title: "Pinned image", rationale: "Compare this exact version", usageConditions: "Permission still needs review",
      asset: { assetId: registered.assetId, sha256: registered.sha256, elementType: registered.elementType } };
    await sessions.command(member, f.input.workId, sessionId, { action: "join", operationId: randomUUID(), expectedVersion: 1 });
    await expect(sessions.command(member, f.input.workId, sessionId, { action: "material-propose", candidate: { ...proposal, asset: { ...proposal.asset, sha256: "f".repeat(64) } },
      operationId: randomUUID(), expectedVersion: 2 })).rejects.toMatchObject({ code: "invalid-target" });
    await sessions.command(member, f.input.workId, sessionId, { action: "material-propose", candidate: proposal, operationId: randomUUID(), expectedVersion: 2 });
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "ready", operationId: randomUUID(), expectedVersion: 3 });
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "start", operationId: randomUUID(), expectedVersion: 4 });
    const ballot = { action: "material-vote" as const, candidateId: proposal.id, rationale: "Fits the cut", expectedVersion: 5, operationId: randomUUID() };
    const voted = await sessions.command(member, f.input.workId, sessionId, ballot);
    expect(await sessions.command(member, f.input.workId, sessionId, ballot)).toEqual(voted);
    expect(voted.view.session.workflow!.materialVotes[0]!.userId).toBe(member);
    await expect(sessions.command(member, f.input.workId, sessionId, { action: "material-decide", candidateId: proposal.id, observedVersion: 6,
      rationale: "Cannot decide", operationId: randomUUID(), expectedVersion: 6 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(sessions.command(f.actor, f.input.workId, sessionId, { action: "material-decide", candidateId: proposal.id, observedVersion: 5,
      rationale: "Stale ballots", operationId: randomUUID(), expectedVersion: 6 })).rejects.toMatchObject({ code: "conflict" });
    const decided = await sessions.command(f.actor, f.input.workId, sessionId, { action: "material-decide", candidateId: proposal.id, observedVersion: 6,
      rationale: "Record selection without insertion or rights grant", operationId: randomUUID(), expectedVersion: 6 });
    expect(decided.view.session.workflow!.materialDecisions[0]!.votes).toEqual(voted.view.session.workflow!.materialVotes);
    expect((await graph.getReview(f.actor, captured.subject.reviewId)).status).toBe("open");
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.input.workId, member]);
    await expect(sessions.receipt(member, f.input.workId, sessionId, ballot.operationId)).rejects.toMatchObject({ code: "forbidden" });
    await sessions.command(f.actor, f.input.workId, sessionId, { action: "material-decide", candidateId: null, observedVersion: 7,
      rationale: "Reevaluate", operationId: randomUUID(), expectedVersion: 7 });
    await pool.query('DELETE FROM creator_work_asset WHERE "workId"=$1 AND "assetId"=$2', [f.input.workId, registered.assetId]);
    await expect(sessions.command(f.actor, f.input.workId, sessionId, { action: "material-vote", candidateId: proposal.id, rationale: "Deleted file",
      operationId: randomUUID(), expectedVersion: 8 })).rejects.toMatchObject({ code: "invalid-target" });
    const later = await new SessionRepository().current(f.actor, f.input.workId, sessionId);
    expect(later.session.version).toBe(8); expect(later.session.workflow!.materialDecisions).toHaveLength(2);
    expect(later.session.workflow!.materialCandidates[0]!.asset.sha256).toBe(registered.sha256);
  });

  it("reads only attested pinned AI evidence and persists explicit citations without approving or editing", async () => {
    const operation = { id: "preserved-ai", kind: "text", status: "failed", provider: "Recorded provider", model: "Recorded model", transport: "local",
      createdAt: "2026-09-20T00:00:00.000Z", prompt: { sha256: "e".repeat(64), raw: "PRIVATE PROMPT" }, requestId: "PRIVATE REQUEST", seed: "PRIVATE SEED",
      error: { message: "PRIVATE PROVIDER ERROR" }, target: { pageId: "page-0", frameId: "cut-0" }, usage: { promptTokens: 0, totalTokens: 9 } };
    const f = await capture(2, { aiProvenance: { version: 1, operations: [operation] } }), captured = await completeCapture(f.actor, f.intent);
    const { StudioWorkSessionRepository } = await import("./studio-work-session.repository");
    const { StudioSessionEvidenceService } = await import("./studio-session-evidence.controller");
    const sessions = new StudioWorkSessionRepository(), evidence = new StudioSessionEvidenceService(sessions), id = randomUUID();
    const invited = randomUUID(), outsider = randomUUID();
    for (const user of [invited, outsider]) {
      users.push(user); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [user, "Evidence audience"]);
      await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'commenter','active',$3,now())`, [f.input.workId, user, randomUUID()]);
    }
    await sessions.create(f.actor, f.input.workId, { id, operationId: randomUUID(), title: "Evidence review", purpose: "Inspect preserved records", kind: "review", input: captured.subject, invitedUserIds: [invited] });
    const before = await evidence.read(invited, f.input.workId, id, 0);
    expect(before.evidence!.sourceContentDigest).toBe(captured.subject.rootGraphHash);
    expect(before.evidence!.aiOperations[0]).toMatchObject({ id: operation.id, status: "failed", usage: { promptTokens: 0, totalTokens: 9 }, targetStatus: "mapped", target: { frameId: "cut-0" } });
    expect(JSON.stringify(before)).not.toContain("PRIVATE");
    // Change the current manuscript after capturing it: the evidence must remain on the original pin.
    await pool.query('UPDATE creator_work SET doc=$2::jsonb,revision=5 WHERE id=$1', [f.input.workId, JSON.stringify({ ...f.doc, aiProvenance: { version: 1, operations: [] } })]);
    expect((await evidence.read(invited, f.input.workId, id, 0)).evidence).toEqual(before.evidence);
    await expect(evidence.read(outsider, f.input.workId, id)).rejects.toMatchObject({ code: "forbidden" });
    await sessions.command(invited, f.input.workId, id, { action: "join", operationId: randomUUID(), expectedVersion: 1 });
    const note = { action: "note" as const, category: "ai-evidence" as const, body: `Preserved source ${captured.subject.rootGraphHash}; operation ${operation.id}; billing not verified.`, operationId: randomUUID(), expectedVersion: 2 };
    const saved = await sessions.command(invited, f.input.workId, id, note);
    expect(await sessions.command(invited, f.input.workId, id, note)).toEqual(saved);
    expect((await sessions.current(f.actor, f.input.workId, id)).session.notes).toHaveLength(1);
    expect((await graph.getReview(f.actor, captured.subject.reviewId)).status).toBe("open");
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [f.input.workId])).rows[0].revision).toBe(5);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.input.workId, invited]);
    await expect(evidence.read(invited, f.input.workId, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(sessions.receipt(invited, f.input.workId, id, note.operationId)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("returns no fabricated evidence for a session pin with no producer attestation", async () => {
    const f = await capture(1), captured = await completeCapture(f.actor, f.intent);
    const { StudioWorkSessionRepository } = await import("./studio-work-session.repository");
    const { StudioSessionEvidenceService } = await import("./studio-session-evidence.controller");
    const sessions = new StudioWorkSessionRepository(), id = randomUUID();
    const duplicateReviewId = randomUUID();
    await graph.createReview(f.actor, captured.subject.artifactId, { id: duplicateReviewId, revisionId: captured.subject.revisionId, title: "Unattested alias", reviewerIds: [f.actor] });
    await sessions.create(f.actor, f.input.workId, { id, operationId: randomUUID(), title: "Legacy source", purpose: "No producer proof", kind: "review", input: { ...captured.subject, reviewId: duplicateReviewId }, invitedUserIds: [] });
    const value = await new StudioSessionEvidenceService(sessions).read(f.actor, f.input.workId, id);
    expect(value.evidence).toBeNull(); expect(value.nextOffset).toBeNull();
  });

  async function pinnedShareFixture(purpose: PinnedShareCreate["purpose"] = "external-review") {
    const f = await capture(2), captured = await completeCapture(f.actor, f.intent);
    const { PinnedReviewShareRepository } = await import("./pinned-share/pinned-share.repository");
    const shares = new PinnedReviewShareRepository();
    if (purpose === "showcase") await graph.decideReview(f.actor, captured.subject.reviewId, { status: "approved" });
    const input: PinnedShareCreate = { id: randomUUID(), operationId: randomUUID(), subject: captured.subject, title: "Explicit shared title", instructions: "Only inspect the selected page",
      purpose, role: purpose === "showcase" ? "viewer" : "commenter", pageOrdinals: [0], expiresInHours: 24, watermark: true,
      rightsStatement: purpose === "showcase" ? "Owner-stated permission for this submitted image; no third-party certification" : "", publicationConsent: purpose === "showcase" };
    const created = await shares.create(f.actor, f.input.workId, input);
    return { ...f, captured, shares, shareInput: input, created };
  }
  it.each(["external-review", "mentoring"] as const)("keeps %s access on selected immutable pages without giving work membership", async (purpose) => {
    const f = await pinnedShareFixture(purpose), token = f.created.token!;
    const view = await f.shares.view({ token });
    expect(view.pages.map((page) => page.ordinal)).toEqual([0]); expect(view.title).toBe("Explicit shared title");
    expect(view.purpose).toBe(purpose); expect(view.feedback).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(f.actor); expect(JSON.stringify(view)).not.toContain(f.input.workId);
    expect(JSON.stringify(view)).not.toContain("objectPath"); expect(JSON.stringify(view)).not.toContain("sourceSnapshot");
    await pool.query('UPDATE creator_work SET title=$2,doc=$3::jsonb,revision=5 WHERE id=$1', [f.input.workId, "PRIVATE CURRENT TITLE", JSON.stringify({ private: "CURRENT PRIVATE DOCUMENT" })]);
    const after = await f.shares.view({ token }); expect(after.pages).toEqual(view.pages); expect(after.title).toBe(view.title);
    expect(JSON.stringify(after)).not.toContain("PRIVATE");
    expect((await f.shares.image({ token }, 0)).page.sha256).toBe(view.pages[0]!.sha256);
    await expect(f.shares.image({ token }, 1)).rejects.toMatchObject({ code: "forbidden" });
    await expect(f.shares.view({ publicId: f.created.share.id })).rejects.toMatchObject({ code: "not-found" });
    const legacy = new (await import("../creator/studio-production.repository")).DrizzleStudioProductionRepository();
    await expect(legacy.getExternalReview(token)).rejects.toMatchObject({ reason: "invalid" });
    const storedShare = (await pool.query('SELECT * FROM studio_pinned_review_share WHERE id=$1', [f.shareInput.id])).rows[0];
    expect(JSON.stringify(storedShare)).not.toContain(token); expect(storedShare.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  });
  it("recovers creation by exact operation identity without persisting or redisclosing the token", async () => {
    const f = await pinnedShareFixture();
    const again = await f.shares.create(f.actor, f.input.workId, f.shareInput);
    expect(again).toMatchObject({ token: null, replayed: true, share: { id: f.shareInput.id } });
    await expect(f.shares.create(f.actor, f.input.workId, { ...f.shareInput, title: "Different intent" })).rejects.toMatchObject({ code: "conflict" });
    expect((await f.shares.list(f.actor, f.input.workId, null)).items).toHaveLength(1);
    const concurrent = { ...f.shareInput, id: randomUUID(), operationId: randomUUID() };
    const attempts = await Promise.all([f.shares.create(f.actor, f.input.workId, concurrent), f.shares.create(f.actor, f.input.workId, concurrent)]);
    expect(attempts.filter((result) => result.token !== null)).toHaveLength(1);
    expect((await f.shares.list(f.actor, f.input.workId, null)).items).toHaveLength(2);
  });
  it("persists isolated comments once and never changes internal approval or page scope", async () => {
    const f = await pinnedShareFixture(), access = { token: f.created.token! };
    const input = { id: randomUUID(), pageOrdinal: 0, reviewerName: "External display name", body: "Please clarify this submitted page." };
    const first = await f.shares.comment(access, input); expect(await f.shares.comment(access, input)).toEqual(first);
    expect((await f.shares.view(access)).feedback).toEqual([first]);
    await expect(f.shares.comment(access, { ...input, body: "A different request" })).rejects.toMatchObject({ code: "conflict" });
    await expect(f.shares.comment(access, { ...input, id: randomUUID(), pageOrdinal: 1 })).rejects.toMatchObject({ code: "forbidden" });
    expect((await graph.getReview(f.actor, f.captured.subject.reviewId)).status).toBe("open");
    expect((await graph.getReview(f.actor, f.captured.subject.reviewId)).comments).toEqual([]);
    await expect(pool.query('UPDATE studio_pinned_review_feedback SET content=$2::jsonb WHERE "shareId"=$1', [f.shareInput.id, JSON.stringify({ ...input, body: "overwrite" })])).rejects.toThrow("immutable");
  });
  it("makes revocation idempotent and one-way even when a caller still knows the old token", async () => {
    const f = await pinnedShareFixture(), access = { token: f.created.token! };
    const first = await f.shares.revoke(f.actor, f.input.workId, f.shareInput.id);
    expect(first.revokedAt).not.toBeNull(); expect(await f.shares.revoke(f.actor, f.input.workId, f.shareInput.id)).toEqual(first);
    await expect(f.shares.view(access)).rejects.toMatchObject({ code: "revoked" });
    await expect(f.shares.image(access, 0)).rejects.toMatchObject({ code: "revoked" });
    await expect(f.shares.comment(access, { id: randomUUID(), pageOrdinal: 0, reviewerName: "Guest", body: "Late comment" })).rejects.toMatchObject({ code: "revoked" });
    await expect(pool.query('UPDATE studio_pinned_review_share SET "revokedAt"=NULL WHERE id=$1', [f.shareInput.id])).rejects.toThrow("immutable");
    await expect(pool.query(`UPDATE studio_pinned_review_share SET snapshot=jsonb_set(snapshot,'{input,title}','"replaced"') WHERE id=$1`, [f.shareInput.id])).rejects.toThrow("immutable");
  });
  it("requires a current manager, preserves grant identity across role loss, and hides prior links after regrant", async () => {
    const f = await pinnedShareFixture(), admin = randomUUID(); users.push(admin);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [admin, "External link manager"]);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`, [f.input.workId, admin, randomUUID()]);
    await expect(f.shares.create(admin, f.input.workId, { ...f.shareInput, id: randomUUID(), operationId: randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
    await pool.query(`UPDATE creator_work_collaborator SET role='admin',"updatedAt"=now() WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, admin]);
    const shared = await f.shares.create(admin, f.input.workId, { ...f.shareInput, id: randomUUID(), operationId: randomUUID() });
    expect((await f.shares.view({ token: shared.token! })).pages).toHaveLength(1);
    await pool.query(`UPDATE creator_work_collaborator SET role='viewer',"updatedAt"=now() WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, admin]);
    await expect(f.shares.view({ token: shared.token! })).rejects.toMatchObject({ code: "forbidden" });
    await pool.query(`UPDATE creator_work_collaborator SET role='admin',"updatedAt"=now() WHERE "workId"=$1 AND "userId"=$2`, [f.input.workId, admin]);
    await expect(f.shares.view({ token: shared.token! })).rejects.toMatchObject({ code: "revoked" });
  });
  it("requires separate explicit publication of an approved snapshot and removes a revoked showcase", async () => {
    const f = await pinnedShareFixture();
    const publish: PinnedShareCreate = { ...f.shareInput, id: randomUUID(), operationId: randomUUID(), purpose: "showcase", role: "viewer", publicationConsent: true, rightsStatement: "Owner confirmed image display rights" };
    await expect(f.shares.create(f.actor, f.input.workId, publish)).rejects.toMatchObject({ code: "invalid-source" });
    await graph.decideReview(f.actor, f.captured.subject.reviewId, { status: "approved" });
    const publicShare = await f.shares.create(f.actor, f.input.workId, publish);
    expect(publicShare.token).toBeNull();
    const view = await f.shares.view({ publicId: publicShare.share.id }); expect(view.role).toBe("viewer"); expect(view.purpose).toBe("showcase");
    expect((await f.shares.publicList(null)).items.some((item) => item.id === publicShare.share.id)).toBe(true);
    await expect(f.shares.comment({ publicId: publicShare.share.id }, { id: randomUUID(), pageOrdinal: 0, reviewerName: "Visitor", body: "Should not post" })).rejects.toMatchObject({ code: "forbidden" });
    await f.shares.revoke(f.actor, f.input.workId, publicShare.share.id);
    expect((await f.shares.publicList(null)).items.some((item) => item.id === publicShare.share.id)).toBe(false);
    await expect(f.shares.view({ publicId: publicShare.share.id })).rejects.toMatchObject({ code: "revoked" });
  });

  it("grants a non-owning share runtime only read/insert and the single revocation column", async () => {
    const f = await pinnedShareFixture(), role = `pinned_share_test_${randomUUID().replaceAll("-", "")}`;
    const { buildStudioProductionRuntimeAclSql, buildStudioProductionRuntimeAclViolationSql } = await import("../../../../../scripts/run-production-database-migrations.mjs");
    await pool.query(`CREATE ROLE "${role}" NOLOGIN`);
    try {
      await pool.query(buildStudioProductionRuntimeAclSql(role));
      expect((await pool.query(`SELECT ${buildStudioProductionRuntimeAclViolationSql(role)} AS invalid`)).rows[0].invalid).toBe(false);
      const client = await pool.connect();
      try {
        await client.query("BEGIN"); await client.query(`SET LOCAL ROLE "${role}"`);
        expect((await client.query('SELECT id FROM studio_pinned_review_share WHERE id=$1', [f.shareInput.id])).rows).toHaveLength(1);
        await expect(client.query('UPDATE studio_pinned_review_share SET "snapshotHash"=$2 WHERE id=$1', [f.shareInput.id, "f".repeat(64)])).rejects.toThrow(/permission denied/u);
        await client.query("ROLLBACK"); await client.query("BEGIN"); await client.query(`SET LOCAL ROLE "${role}"`);
        await client.query('UPDATE studio_pinned_review_share SET "revokedAt"=GREATEST(statement_timestamp(),"createdAt") WHERE id=$1', [f.shareInput.id]);
        await client.query("COMMIT");
      } finally { await client.query("ROLLBACK"); client.release(); }
    } finally { await pool.query(`DROP OWNED BY "${role}"`); await pool.query(`DROP ROLE "${role}"`); }
  });

  it("expires a share independently of browser state without rewriting immutable timestamps", async () => {
    const f = await pinnedShareFixture(), access = { token: f.created.token! };
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.created.share.expiresAt) + 1);
    try {
      await expect(f.shares.view(access)).rejects.toMatchObject({ code: "expired" });
      await expect(f.shares.image(access, 0)).rejects.toMatchObject({ code: "expired" });
      await expect(f.shares.comment(access, { id: randomUUID(), pageOrdinal: 0, reviewerName: "Guest", body: "Past deadline" })).rejects.toMatchObject({ code: "expired" });
    } finally { clock.mockRestore(); }
  });

  it.each(["createdAt", "updatedAt"] as const)("keeps task completion timestamps monotonic when saved %s is ahead of the server clock", async (field) => {
    const f = await completionFixture();
    await pool.query(`UPDATE creator_work_production_workspace SET
      "createdAt"=CASE WHEN $2::boolean THEN clock_timestamp()+interval '1 hour' ELSE "createdAt" END,
      "updatedAt"=clock_timestamp()+interval '2 hours' WHERE "workId"=$1`, [f.input.workId, field === "createdAt"]);
    const before = (await pool.query('SELECT "createdAt","updatedAt" FROM creator_work_production_workspace WHERE "workId"=$1', [f.input.workId])).rows[0]!;
    const input = await f.completionInput();
    const completed = await f.completion.complete(f.actor, f.input.workId, f.taskId, input);
    expect(completed.evidence?.current).toBe(true);
    const after = (await pool.query(`SELECT "updatedAt">=$2::timestamptz AS monotonic,"updatedAt">="createdAt" AS valid,
      document->>'updatedAt' AS "documentAt",revision FROM creator_work_production_workspace WHERE "workId"=$1`, [f.input.workId, before.updatedAt])).rows[0]!;
    expect(after).toMatchObject({ monotonic: true, valid: true, revision: completed.baseRevision });
    expect(after.documentAt).toBe(completed.evidence!.receipt.completedAt);
    const replay = await f.completion.complete(f.actor, f.input.workId, f.taskId, input);
    expect(replay.evidence?.receipt).toEqual(completed.evidence?.receipt);
    expect((await graph.getReview(f.actor, f.original.subject.reviewId)).status).toBe("open");
  });

});
