import { createHash } from "node:crypto";
import { canonicalJson, studioReviewTaskCompletionContextSchema, studioReviewTaskCompletionInputSchema,
  studioReviewTaskCompletionReceiptSchema, type StudioReviewTaskCompletionContext,
  type StudioReviewTaskCompletionInput } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";

import { dbPool } from "../../db";
import { loadStudioReviewResolutionCaptures } from "../studio-project-graph/studio-review-capture-attestation";
import { resolveCreatorCollaborationAccess } from "./creator-collaboration.policy";
import { studioReviewTaskCompletionBasis, studioReviewTaskCompletionFingerprint } from "./studio-review-task-completion-invalidation";
import { StudioProductionWorkspaceDocumentSchema } from "./studio-production.dto";

export class StudioReviewTaskCompletionError extends Error {
  constructor(readonly code: "not-found" | "forbidden" | "unresolved" | "criteria" | "source" | "conflict" | "idempotency") { super(code); }
}
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const fail = (code: StudioReviewTaskCompletionError["code"]): never => { throw new StudioReviewTaskCompletionError(code); };

/** Work -> review -> comment lock order; resolution mutations also lock review before comment. */
async function inspect(client: PoolClient, actor: string, workId: string, taskId: string) {
  const work = (await client.query<{ userId: string }>('SELECT "userId" FROM creator_work WHERE id=$1 FOR UPDATE', [workId])).rows[0];
  if (!work) return fail("not-found");
  const member = (await client.query<{ userId: string; role: string; status: string }>(
    'SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor])).rows[0];
  const access = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership: member ?? null });
  if (!access.edit) return fail("forbidden");
  const stored = (await client.query<{ revision: number; document: unknown }>(
    'SELECT revision,document FROM creator_work_production_workspace WHERE "workId"=$1', [workId])).rows[0];
  if (!stored) return fail("not-found");
  const document = StudioProductionWorkspaceDocumentSchema.parse(stored.document);
  const task = document.tasks.find((candidate) => candidate.id === taskId), ref = task?.reviewRef;
  if (!task || !ref || ref.subject.workId !== workId || document.scopeKey !== `work:${workId}`) return fail("not-found");
  const handoff = document.handoffs.find((candidate) => candidate.id === ref.handoffId);
  if (!handoff || handoff.hierarchyNodeId !== task.hierarchyNodeId || !handoff.acceptanceCriteria.length) return fail("criteria");
  const pin = ref.subject;
  const review = (await client.query(
    `SELECT review.id FROM studio_review review JOIN studio_revision revision ON revision.id=review."revisionId"
     JOIN studio_artifact artifact ON artifact.id=review."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId"
     WHERE review.id=$1 AND review."artifactId"=$2 AND revision.id=$3 AND revision."artifactId"=artifact.id
       AND revision.kind='review-snapshot' AND revision."rootGraphHash"=$4 AND project.id=$5 AND project."workId"=$6
     FOR SHARE OF review`, [pin.reviewId, pin.artifactId, pin.revisionId, pin.rootGraphHash, pin.projectId, workId])).rows[0];
  if (!review) return fail("source");
  const comment = (await client.query<{ body: string; status: string; resolutionRevisionId: string | null; resolvedBy: string | null; updatedAt: string }>(
    `SELECT body,status,"resolutionRevisionId","resolvedBy",to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt" FROM studio_review_comment
     WHERE id=$1 AND "reviewId"=$2 AND anchor->>'artifactId'=$3 AND anchor->>'revisionId'=$4 FOR SHARE`,
    [ref.commentId, pin.reviewId, pin.artifactId, pin.revisionId])).rows[0];
  if (!comment || comment.status !== "resolved" || !comment.resolutionRevisionId || !comment.resolvedBy) return fail("unresolved");
  const replacements = await client.query<{ id: string }>(
    `SELECT review.id FROM studio_review review JOIN studio_revision_parent edge ON edge."revisionId"=review."revisionId"
     WHERE review."artifactId"=$1 AND edge."parentRevisionId"=$2`, [pin.artifactId, comment.resolutionRevisionId]);
  if (replacements.rows.length !== 1) return fail("source");
  const captures = await loadStudioReviewResolutionCaptures(client, pin.artifactId, [pin.reviewId, replacements.rows[0]!.id]);
  const original = captures.find((capture) => capture?.subject.reviewId === pin.reviewId);
  const replacement = captures.find((capture) => capture?.subject.reviewId === replacements.rows[0]!.id);
  if (captures.length !== 2 || !original || !replacement || canonicalJson(original.subject) !== canonicalJson(pin)
    || replacement.subject.workId !== workId || replacement.subject.projectId !== pin.projectId
    || replacement.submissionId !== comment.resolutionRevisionId
    || replacement.sourceServerRevision <= original.sourceServerRevision || replacement.sequence <= original.sequence) return fail("source");
  const resolution = { revisionId: comment.resolutionRevisionId, resolvedBy: comment.resolvedBy, updatedAt: comment.updatedAt };
  const basis = { taskId, obligation: studioReviewTaskCompletionBasis(document, taskId), replacement: replacement.subject, resolution };
  const proofDigest = hash(basis);
  const previous = (await client.query<{ response: unknown }>(
    `SELECT response FROM studio_mutation_receipt WHERE "artifactId"=$1 AND response->>'contract'='studio-review-task-completion-v1'
     AND response->>'workId'=$2 AND response->>'taskId'=$3 ORDER BY (response->>'workspaceRevision')::bigint DESC,"createdAt" DESC,"idempotencyKeyHash" DESC LIMIT 1`,
    [pin.artifactId, workId, taskId])).rows[0];
  const receipt = studioReviewTaskCompletionReceiptSchema.safeParse(previous?.response);
  const invalidated = receipt.success && (await client.query(
    `SELECT 1 FROM studio_mutation_receipt WHERE "artifactId"=$1 AND response->>'contract'='studio-review-task-completion-invalidated-v1'
      AND response->>'completionFingerprint'=$2 LIMIT 1`, [pin.artifactId, studioReviewTaskCompletionFingerprint(receipt.data)])).rows.length > 0;
  const context = studioReviewTaskCompletionContextSchema.parse({ workId, taskId, taskTitle: task.title, commentBody: comment.body,
    reference: ref, replacement: replacement.subject, criteria: handoff.acceptanceCriteria, resolution,
    baseRevision: stored.revision, proofDigest,
    evidence: receipt.success ? { receipt: receipt.data, current: receipt.data.proofDigest === proofDigest
      && !invalidated && task.status === "done" && task.progress === 100 } : null });
  return { document, context };
}

export class StudioReviewTaskCompletionRepository {
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await dbPool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  read(actor: string, workId: string, taskId: string): Promise<StudioReviewTaskCompletionContext> {
    return this.transaction(async (client) => (await inspect(client, actor, workId, taskId)).context);
  }
  complete(actor: string, workId: string, taskId: string, raw: StudioReviewTaskCompletionInput): Promise<StudioReviewTaskCompletionContext> {
    const input = studioReviewTaskCompletionInputSchema.parse(raw);
    return this.transaction(async (client) => {
      const { context, document } = await inspect(client, actor, workId, taskId);
      const key = hash({ contract: "studio-review-task-completion-v1", actor, workId, taskId, requestId: input.requestId });
      const requestHash = hash(input), artifactId = context.reference.subject.artifactId;
      const existing = (await client.query<{ response: unknown; requestHash: string }>(
        'SELECT response,"requestHash" FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3',
        [artifactId, actor, key])).rows[0];
      if (existing) {
        if (existing.requestHash !== requestHash) return fail("idempotency");
        const receipt = studioReviewTaskCompletionReceiptSchema.parse(existing.response);
        // Replay never rewrites the workspace or upgrades a stale historical receipt.
        return { ...context, evidence: { receipt, current: context.evidence?.current === true
          && context.evidence.receipt.requestId === receipt.requestId && context.evidence.receipt.completedBy === actor } };
      }
      if (context.baseRevision !== input.baseRevision || context.proofDigest !== input.proofDigest) return fail("conflict");
      if (canonicalJson(context.criteria) !== canonicalJson(input.confirmedCriteria)) return fail("criteria");
      const now = (await client.query<{ now: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`)).rows[0]!.now;
      const nextRevision = context.baseRevision + 1;
      const next = StudioProductionWorkspaceDocumentSchema.parse({ ...document, revision: nextRevision, updatedAt: now,
        tasks: document.tasks.map((task) => task.id === taskId ? { ...task, status: "done", progress: 100 } : task) });
      const receipt = studioReviewTaskCompletionReceiptSchema.parse({ contract: "studio-review-task-completion-v1", workId, taskId,
        requestId: input.requestId, reference: context.reference, replacement: context.replacement, criteria: context.criteria,
        resolution: context.resolution, proofDigest: context.proofDigest, workspaceRevision: nextRevision, completedBy: actor, completedAt: now });
      const updated = await client.query(`UPDATE creator_work_production_workspace SET revision=$3,document=$4::jsonb,"updatedBy"=$5,"updatedAt"=$6
        WHERE "workId"=$1 AND revision=$2`, [workId, context.baseRevision, nextRevision, JSON.stringify(next), actor, now]);
      if (updated.rowCount !== 1) return fail("conflict");
      await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response,"createdAt")
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [artifactId, actor, key, requestHash, context.reference.subject.revisionId, JSON.stringify(receipt), now]);
      return { ...context, baseRevision: nextRevision, evidence: { receipt, current: true } };
    });
  }
}
