import { createHash, randomUUID } from "node:crypto";
import { Image, decodePng, encodePng } from "image-js";
import { Pool } from "pg";
import { createStudioReviewSpatialAnchor } from "@toonspectrum/studio-project-model";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

  async function capture(pageCount = 2) {
    const actor = randomUUID(), workId = randomUUID(); users.push(actor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [actor, "Review capture integration"]);
    const doc = { version: 3, width: 2, pagesList: Array.from({ length: pageCount }, (_, index) => ({ id: `page-${index}`, canvasH: 1,
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
});
