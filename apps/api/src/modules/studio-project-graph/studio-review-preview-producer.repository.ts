import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";

import { dbPool } from "../../db";
import type { LocatedPrivateObjectReference } from "../../platform/private-object-storage/private-object-storage.contract";
import {
  assertAccess, loadArtifactAccess, projectAccess, StudioProjectGraphRepository,
  StudioProjectNotFoundError, StudioRepositoryInvariantError, StudioIdempotencyConflictError,
} from "./studio-project-graph.repository";
import type { StudioReviewPreviewSubject } from "./studio-review-preview";
import { STUDIO_REVIEW_PREVIEW_VALIDATOR, type CanonicalStudioReviewPreview } from "./studio-review-preview-canonicalizer";
import {
  studioReviewPreviewDigest, studioReviewPreviewIntentKey, studioReviewPreviewPageAsset,
  studioReviewPreviewCaptureSchema,
  type StudioReviewPreviewCapture, type StudioReviewPreviewComplete, type StudioReviewPreviewIntent,
} from "./studio-review-preview-producer.contract";
import { lockStudioReviewPreviewStorage } from "./studio-review-preview-storage";
import { studioReviewPageRasterSchema, type StudioReviewPageRaster } from "./studio-review-source-map";

export type StudioReviewPreviewCaptureStatus = { readonly status: "pending" | "cancelled" }
  | { readonly status: "completed"; readonly subject: StudioReviewPreviewSubject };
type StoredReceipt = ({ readonly status: "cancelled" } | { readonly status: "completed"; readonly subject: StudioReviewPreviewSubject }) & { readonly fingerprint: string };
type SourceRow = { projectId: string; workId: string; ownerUserId: string; membershipRole: string | null;
  membershipStatus: string | null; revision: number; doc: unknown };

function invariant(code: string): never { throw new StudioRepositoryInvariantError(code, code); }
function artifactIdFor(workId: string): string { return `review-manuscript-${studioReviewPreviewDigest(workId)}`; }
function prepareKey(actor: string, input: StudioReviewPreviewCapture): string {
  return studioReviewPreviewDigest({ phase: "prepare", actor, workId: input.workId, intentId: input.intentId });
}
function pageGeometryKey(actor: string, intent: StudioReviewPreviewIntent, ordinal: number): string {
  return studioReviewPreviewDigest({ phase: "page-geometry", actor, workId: intent.workId, intentId: intent.intentId, ordinal });
}
function captureOf(intent: StudioReviewPreviewIntent): StudioReviewPreviewCapture {
  const { projectId: _project, artifactId: _artifact, expectedHeadRevisionId: _head, expectedHeadRootGraphHash: _hash, ...capture } = intent;
  return studioReviewPreviewCaptureSchema.parse(capture);
}
async function preparedReceipt(client: PoolClient, actor: string, input: StudioReviewPreviewCapture): Promise<StudioReviewPreviewIntent | null> {
  const result = await client.query<{ response: { intent: StudioReviewPreviewIntent } }>(
    `SELECT response FROM studio_mutation_receipt WHERE "artifactId" = $1 AND "actorUserId" = $2 AND "idempotencyKeyHash" = $3`,
    [artifactIdFor(input.workId), actor, prepareKey(actor, input)]);
  const prepared = result.rows[0]?.response.intent ?? null;
  if (prepared && canonicalJson(captureOf(prepared)) !== canonicalJson(input)) throw new StudioIdempotencyConflictError();
  return prepared;
}
async function assertPrepared(client: PoolClient, actor: string, intent: StudioReviewPreviewIntent): Promise<void> {
  const prior = await preparedReceipt(client, actor, captureOf(intent));
  if (!prior || canonicalJson(prior) !== canonicalJson(intent)) invariant("preview-intent-unprepared");
}

async function workSource(client: PoolClient, actor: string, workId: string, lock = false): Promise<SourceRow> {
  // Membership mutations use this work lock. Read membership in a fresh statement
  // after acquiring it, so a revocation that won the lock cannot leave a stale JOIN snapshot.
  if (lock) await client.query('SELECT id FROM creator_work WHERE id=$1 FOR UPDATE', [workId]);
  const result = await client.query<SourceRow>(
    `SELECT ''::text AS "projectId", work.id AS "workId", work."userId" AS "ownerUserId",
       membership.role AS "membershipRole", membership.status AS "membershipStatus", work.revision, work.doc
     FROM creator_work work LEFT JOIN creator_work_collaborator membership
       ON membership."workId" = work.id AND membership."userId" = $2
     WHERE work.id = $1`, [workId, actor]);
  const row = result.rows[0];
  if (!row) throw new StudioProjectNotFoundError("work");
  assertAccess(projectAccess(actor, row), "edit");
  return row;
}

function verifySource(row: SourceRow, input: StudioReviewPreviewCapture): void {
  const pages = row.doc && typeof row.doc === "object" && !Array.isArray(row.doc)
    ? (row.doc as Record<string, unknown>).pagesList : null;
  if (row.revision !== input.sourceServerRevision || studioReviewPreviewDigest(row.doc) !== input.sourceContentDigest
    || !Array.isArray(pages) || pages.length !== input.pageCount) invariant("preview-source-version-mismatch");
}

async function target(client: PoolClient, actor: string, intent: StudioReviewPreviewIntent, checkHead: boolean) {
  const found = await loadArtifactAccess(client, actor, intent.artifactId, true);
  if (!found) throw new StudioProjectNotFoundError("artifact");
  assertAccess(found.access, "edit");
  if (found.row.workId !== intent.workId || found.row.projectId !== intent.projectId
    || intent.artifactId !== artifactIdFor(intent.workId)) invariant("preview-target-mismatch");
  const head = await client.query<{ rootGraphHash: string; kind: string }>(
    `SELECT revision."rootGraphHash", artifact.kind FROM studio_revision revision
     JOIN studio_artifact artifact ON artifact.id = revision."artifactId"
     WHERE revision.id = $1 AND revision."artifactId" = $2`, [found.row.headRevisionId, intent.artifactId]);
  if (head.rows[0]?.kind !== "review-snapshot") invariant("preview-target-mismatch");
  if (checkHead) {
    if (found.row.headRevisionId !== intent.expectedHeadRevisionId
      || head.rows[0]?.rootGraphHash !== intent.expectedHeadRootGraphHash) invariant("preview-head-version-mismatch");
  }
  return found;
}

async function receipt(client: PoolClient, actor: string, intent: StudioReviewPreviewIntent): Promise<StoredReceipt | null> {
  const result = await client.query<{ response: StoredReceipt }>(
    `SELECT response FROM studio_mutation_receipt WHERE "artifactId" = $1 AND "actorUserId" = $2 AND "idempotencyKeyHash" = $3`,
    [intent.artifactId, actor, studioReviewPreviewIntentKey(actor, intent)]);
  const found = result.rows[0]?.response ?? null;
  if (found && found.fingerprint !== studioReviewPreviewDigest(intent)) throw new StudioIdempotencyConflictError();
  return found;
}

async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

@Injectable()
export class StudioReviewPreviewProducerRepository {
  constructor(@Inject(StudioProjectGraphRepository) private readonly graph: StudioProjectGraphRepository) {}

  async prepare(actor: string, input: StudioReviewPreviewCapture): Promise<StudioReviewPreviewIntent> {
    const client = await dbPool.connect();
    try {
      const source = await workSource(client, actor, input.workId);
      const prior = await preparedReceipt(client, actor, input);
      if (prior) return prior;
      verifySource(source, input);
    } finally { client.release(); }
    const artifactId = artifactIdFor(input.workId);
    const initialId = `review-initial-${studioReviewPreviewDigest(input.workId)}`;
    const bootstrap = (projectId: string) => ({ workspaceId: `review-workspace-${studioReviewPreviewDigest(input.workId)}`,
      artifact: { id: artifactId, kind: "review-snapshot" as const, title: "Review manuscript", scope: { projectId } },
      initialRevision: { id: initialId, rootGraphHash: input.sourceContentDigest, deviceId: input.deviceId, createdAt: input.createdAt, blobRefs: [] } });
    let project;
    try { project = await this.graph.getProjectByWork(actor, input.workId); }
    catch (error) {
      if (!(error instanceof StudioProjectNotFoundError) || error.target !== "project") throw error;
      const projectId = `review-project-${studioReviewPreviewDigest(input.workId)}`;
      // The existing bootstrap enforces manageMembers; creating a review never grants access.
      try { await this.graph.createProject(actor, { projectId, workId: input.workId, ...bootstrap(projectId) }, `review-prepare:${input.intentId}`); }
      catch (cause) {
        // A concurrent legitimate project bootstrap may have won the unique work binding.
        try { project = await this.graph.getProjectByWork(actor, input.workId); } catch { throw cause; }
      }
      project ??= await this.graph.getProjectByWork(actor, input.workId);
    }
    if (!project.artifacts.some((artifact) => artifact.id === artifactId)) {
      try { await this.graph.createArtifact(actor, project.id, bootstrap(project.id), `review-artifact:${input.intentId}`); }
      catch (error) {
        project = await this.graph.getProjectByWork(actor, input.workId);
        if (!project.artifacts.some((artifact) => artifact.id === artifactId)) throw error;
      }
      project = await this.graph.getProjectByWork(actor, input.workId);
    }
    const artifact = project.artifacts.find((value) => value.id === artifactId)!;
    if (artifact.kind !== "review-snapshot") invariant("preview-target-mismatch");
    const revisions = await this.graph.listRevisions(actor, artifactId);
    const head = revisions.find((revision) => revision.id === artifact.headRevisionId);
    if (!head) invariant("preview-head-version-mismatch");
    const intent: StudioReviewPreviewIntent = { ...input, projectId: project.id, artifactId,
      expectedHeadRevisionId: artifact.headRevisionId, expectedHeadRootGraphHash: head.rootGraphHash };
    return transaction(async (connection) => {
      const source = await workSource(connection, actor, intent.workId, true);
      await target(connection, actor, intent, false);
      const prior = await preparedReceipt(connection, actor, input);
      if (prior) return prior;
      verifySource(source, intent);
      await target(connection, actor, intent, true);
      await connection.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [intent.artifactId, actor, prepareKey(actor, input), studioReviewPreviewDigest(input), intent.expectedHeadRevisionId, JSON.stringify({ status: "prepared", intent })]);
      return intent;
    });
  }

  async assertPending(actor: string, intent: StudioReviewPreviewIntent): Promise<void> {
    await transaction(async (client) => {
      verifySource(await workSource(client, actor, intent.workId, true), intent);
      await target(client, actor, intent, true);
      await assertPrepared(client, actor, intent);
      if (await receipt(client, actor, intent)) invariant("preview-intent-terminal");
    });
  }

  async status(actor: string, intent: StudioReviewPreviewIntent): Promise<StudioReviewPreviewCaptureStatus> {
    return transaction(async (client) => {
      await workSource(client, actor, intent.workId, true);
      await target(client, actor, intent, false);
      await assertPrepared(client, actor, intent);
      return await receipt(client, actor, intent) ?? { status: "pending" };
    });
  }

  async findPrepared(actor: string, input: StudioReviewPreviewCapture): Promise<StudioReviewPreviewIntent | null> {
    const client = await dbPool.connect();
    try { await workSource(client, actor, input.workId); return await preparedReceipt(client, actor, input); }
    finally { client.release(); }
  }

  async registerPage(actor: string, intent: StudioReviewPreviewIntent, ordinal: number,
    canonical: CanonicalStudioReviewPreview, object: LocatedPrivateObjectReference): Promise<void> {
    if (canonical.validator !== STUDIO_REVIEW_PREVIEW_VALIDATOR || studioReviewPreviewDigestBytes(canonical.bytes) !== canonical.sha256
      || object.byteLength !== canonical.bytes.byteLength || object.digest !== `sha256:${canonical.sha256}`) invariant("preview-validation-mismatch");
    await transaction(async (client) => {
      verifySource(await workSource(client, actor, intent.workId, true), intent);
      await target(client, actor, intent, true);
      await assertPrepared(client, actor, intent);
      if (await receipt(client, actor, intent)) invariant("preview-intent-terminal");
      const assetId = studioReviewPreviewPageAsset(studioReviewPreviewIntentKey(actor, intent), ordinal);
      await lockStudioReviewPreviewStorage(client, intent.workId, canonical.sha256, { object, sourceAssetId: assetId, referenceId: assetId });
      const registered = await client.query(
        `INSERT INTO studio_blob (hash, size, "mediaType", "objectKey", "encryptionMetadata", "malwareStatus", "formatStatus")
         VALUES ($1, $2, 'image/png', $3, NULL, 'clean', 'valid')
         ON CONFLICT (hash) DO UPDATE SET "malwareStatus" = 'clean', "formatStatus" = 'valid'
         WHERE studio_blob.size = EXCLUDED.size AND studio_blob."mediaType" = EXCLUDED."mediaType"
           AND studio_blob."objectKey" = EXCLUDED."objectKey" AND studio_blob."encryptionMetadata" IS NULL
           AND studio_blob."malwareStatus" IN ('pending', 'clean') AND studio_blob."formatStatus" IN ('pending', 'valid')
         RETURNING hash`, [canonical.sha256, canonical.bytes.byteLength, canonicalJson(object)]);
      if (registered.rows.length !== 1) invariant("preview-blob-metadata-conflict");
      // Persist server-decoded raster dimensions, never dimensions supplied by the browser.
      const raster = studioReviewPageRasterSchema.parse({ ordinal, sha256: canonical.sha256, width: canonical.width, height: canonical.height });
      const response = { intentDigest: studioReviewPreviewDigest(intent), raster };
      const geometryKey = pageGeometryKey(actor, intent, ordinal);
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT ("artifactId","actorUserId","idempotencyKeyHash") DO NOTHING`,
      [intent.artifactId, actor, geometryKey, studioReviewPreviewDigest(response), intent.expectedHeadRevisionId, JSON.stringify(response)]);
      const geometry = await client.query<{ response: unknown }>(`SELECT response FROM studio_mutation_receipt
        WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3`, [intent.artifactId, actor, geometryKey]);
      if (canonicalJson(geometry.rows[0]?.response) !== canonicalJson(response)) throw new StudioIdempotencyConflictError();
    });
  }

  async complete(actor: string, input: StudioReviewPreviewComplete): Promise<StudioReviewPreviewCaptureStatus> {
    const { intent, pages } = input;
    return transaction(async (client) => {
      const source = await workSource(client, actor, intent.workId, true);
      const access = await target(client, actor, intent, false);
      await assertPrepared(client, actor, intent);
      const prior = await receipt(client, actor, intent);
      if (prior) {
        if (prior.status === "completed") {
          const existing = await client.query<{ blobHash: string; ordinal: number }>(
            `SELECT "blobHash", ordinal FROM studio_revision_blob WHERE "revisionId" = $1 AND role = 'preview' ORDER BY ordinal`, [prior.subject.revisionId]);
          if (canonicalJson(existing.rows.map((row) => ({ sha256: row.blobHash, ordinal: row.ordinal }))) !== canonicalJson(pages)) throw new StudioIdempotencyConflictError();
        }
        return prior;
      }
      verifySource(source, intent);
      await target(client, actor, intent, true);
      const key = studioReviewPreviewIntentKey(actor, intent);
      const pageRasters: StudioReviewPageRaster[] = [];
      // Stable lock order matches generated-object deletion and prevents cross-work hash reuse.
      for (const page of [...pages].sort((a, b) => a.sha256.localeCompare(b.sha256))) {
        const assetId = studioReviewPreviewPageAsset(key, page.ordinal);
        const object = await lockStudioReviewPreviewStorage(client, intent.workId, page.sha256, { sourceAssetId: assetId, referenceId: assetId });
        const blob = await client.query(
          `SELECT hash FROM studio_blob WHERE hash = $1 AND size = $2 AND "mediaType" = 'image/png'
           AND "objectKey" = $3 AND "encryptionMetadata" IS NULL AND "malwareStatus" = 'clean' AND "formatStatus" = 'valid'`,
          [page.sha256, object.byteLength, canonicalJson(object)]);
        if (blob.rows.length !== 1) invariant("preview-blob-unready");
        const geometry = await client.query<{ response: { intentDigest?: string; raster?: unknown } }>(`SELECT response FROM studio_mutation_receipt
          WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3`,
        [intent.artifactId, actor, pageGeometryKey(actor, intent, page.ordinal)]);
        const stored = geometry.rows[0]?.response;
        if (stored) {
          const raster = studioReviewPageRasterSchema.safeParse(stored.raster);
          if (stored.intentDigest !== studioReviewPreviewDigest(intent) || !raster.success
            || raster.data.ordinal !== page.ordinal || raster.data.sha256 !== page.sha256) invariant("preview-page-geometry-mismatch");
          pageRasters.push(raster.data);
        }
      }
      const checkpointId = `review-checkpoint-${key}`, submissionId = `review-submission-${key}`, revisionId = `review-snapshot-${key}`, reviewId = `review-${key}`;
      const sequenceResult = await client.query<{ next: number | string }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM studio_operation WHERE "artifactId" = $1`, [intent.artifactId]);
      const sequence = Number(sequenceResult.rows[0]?.next ?? 1);
      const revisions = [[checkpointId, "checkpoint", intent.expectedHeadRevisionId], [submissionId, "submission", checkpointId], [revisionId, "review-snapshot", submissionId]] as const;
      for (const [id, kind, parentId] of revisions) {
        await client.query(
          `INSERT INTO studio_revision (id, "artifactId", kind, "rootGraphHash", "operationFirst", "operationLast", "createdBy", "deviceId", "createdAt", message)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9)`,
          [id, intent.artifactId, kind, intent.sourceContentDigest, sequence, actor, intent.deviceId, intent.createdAt, intent.title]);
        await client.query(`INSERT INTO studio_revision_parent ("revisionId", "parentRevisionId", ordinal) VALUES ($1,$2,0)`, [id, parentId]);
      }
      for (const page of pages) await client.query(
        `INSERT INTO studio_revision_blob ("revisionId", "blobHash", role, ordinal) VALUES ($1,$2,'preview',$3)`, [revisionId, page.sha256, page.ordinal]);
      const payload = { intent, sourceSnapshot: source.doc, previews: pages, validation: STUDIO_REVIEW_PREVIEW_VALIDATOR,
        ...(pageRasters.length === pages.length ? { sourceMapVersion: 1, pageRasters: pageRasters.sort((a, b) => a.ordinal - b.ordinal) } : {}) };
      const operation = { commandId: `review-capture-${key}`, type: "review.snapshot-create", payload, patches: [], inversePatches: [], invalidations: [] };
      await client.query(
        `INSERT INTO studio_operation ("artifactId", sequence, "commandId", "baseRevisionId", "resultRevisionId", "actorUserId", "deviceId", "commandType", scope, "payloadHash", operation, "issuedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'review.snapshot-create',$8::jsonb,$9,$10::jsonb,$11)`,
        [intent.artifactId, sequence, operation.commandId, intent.expectedHeadRevisionId, revisionId, actor, intent.deviceId,
          JSON.stringify(access.row.projectScope), studioReviewPreviewDigest(payload), JSON.stringify(operation), intent.createdAt]);
      await client.query(`INSERT INTO studio_review (id,"artifactId","revisionId","requestedBy",title,status) VALUES ($1,$2,$3,$4,$5,'open')`,
        [reviewId, intent.artifactId, revisionId, actor, intent.title]);
      // The owner already has decision authority. Submission must not promote an
      // editing collaborator into a designated reviewer who can self-approve.
      await client.query(`INSERT INTO studio_review_reviewer ("reviewId","reviewerUserId") VALUES ($1,$2)`,
        [reviewId, source.ownerUserId]);
      // Keep metadata monotonic across clock adjustment and legacy client-dated
      // artifacts without relaxing either database time constraint.
      await client.query(`UPDATE studio_artifact SET "headRevisionId"=$2,"updatedAt"=GREATEST("createdAt","updatedAt",clock_timestamp()) WHERE id=$1`, [intent.artifactId, checkpointId]);
      await client.query(`UPDATE studio_project_graph SET "updatedAt"=GREATEST("createdAt","updatedAt",clock_timestamp()) WHERE id=$1`, [intent.projectId]);
      const result: StoredReceipt = { status: "completed", fingerprint: studioReviewPreviewDigest(intent), subject: {
        schemaVersion: 1, workId: intent.workId, projectId: intent.projectId, artifactId: intent.artifactId,
        reviewId, revisionId, rootGraphHash: intent.sourceContentDigest } };
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [intent.artifactId, actor, key, studioReviewPreviewDigest(input), revisionId, JSON.stringify(result)]);
      return result;
    });
  }

  async cancel(actor: string, intent: StudioReviewPreviewIntent): Promise<StudioReviewPreviewCaptureStatus> {
    return transaction(async (client) => {
      await workSource(client, actor, intent.workId, true);
      const access = await target(client, actor, intent, false);
      await assertPrepared(client, actor, intent);
      const prior = await receipt(client, actor, intent);
      if (prior) return prior;
      const result: StoredReceipt = { status: "cancelled", fingerprint: studioReviewPreviewDigest(intent) };
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [intent.artifactId, actor, studioReviewPreviewIntentKey(actor, intent), studioReviewPreviewDigest(intent), access.row.headRevisionId, JSON.stringify(result)]);
      return result;
    });
  }

  async listCaptureAssets(actor: string, intent: StudioReviewPreviewIntent): Promise<readonly { assetId: string; sha256: string; generated: boolean }[]> {
    const client = await dbPool.connect();
    try {
      await workSource(client, actor, intent.workId);
      const key = studioReviewPreviewIntentKey(actor, intent);
      const result = await client.query<{ assetId: string; sha256: string; generated: boolean }>(
        `SELECT asset."assetId", asset.sha256, EXISTS(SELECT 1 FROM creator_work_asset_storage_reference reference
           WHERE reference."workId"=asset."workId" AND reference."sourceAssetId"=asset."assetId" AND reference.purpose='derived') AS generated
         FROM creator_work_asset asset WHERE asset."workId"=$1 AND asset."uploadedBy"=$2 AND asset."assetId" LIKE $3`,
        [intent.workId, actor, `review-preview-${key}-%`]);
      return result.rows;
    } finally { client.release(); }
  }
}

// Keep the byte proof separate from canonical JSON hashing.
function studioReviewPreviewDigestBytes(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
