import { studioReviewTaskReferenceSchema } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";

import { studioReviewPreviewCompleteSchema, studioReviewPreviewDigest, studioReviewPreviewIntentKey,
  studioReviewPreviewIntentSchema } from "./studio-review-preview-producer.contract";

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
export interface StudioReviewSourcePin {
  readonly workId: string; readonly projectId: string; readonly artifactId: string; readonly rootGraphHash: string;
  readonly reviewId: string; readonly revisionId: string;
}

/** Shared saved-document proof. Raster geometry and graph lineage have separate consumers. */
export function studioReviewCaptureFromOperation(operation: unknown, pin: StudioReviewSourcePin, captureReceipt: unknown) {
  const payload = record(record(operation)?.payload), receipt = record(captureReceipt);
  const response = record(receipt?.response), subject = record(response?.subject);
  const intent = studioReviewPreviewIntentSchema.safeParse(payload?.intent);
  if (!payload || !intent.success || !receipt || typeof receipt.actorUserId !== "string" || !subject
    || intent.data.workId !== pin.workId || intent.data.projectId !== pin.projectId || intent.data.artifactId !== pin.artifactId
    || intent.data.sourceContentDigest !== pin.rootGraphHash || response?.status !== "completed"
    || response.fingerprint !== studioReviewPreviewDigest(intent.data)
    || Object.entries(pin).some(([field, value]) => subject[field] !== value)
    || receipt.idempotencyKeyHash !== studioReviewPreviewIntentKey(receipt.actorUserId, intent.data)
    || record(operation)?.commandId !== `review-capture-${receipt.idempotencyKeyHash}`) return null;
  try {
    if (payload.sourceSnapshot === undefined || studioReviewPreviewDigest(payload.sourceSnapshot) !== pin.rootGraphHash) return null;
  } catch { return null; }
  return { intent: intent.data, payload, actorUserId: receipt.actorUserId, key: receipt.idempotencyKeyHash as string };
}

/** Verify actual immutable database rows, never revision-name prefixes or client timestamps alone. */
export function studioReviewResolutionCaptureFromRows(value: unknown) {
  const row = record(value), capture = record(row?.capture), receipt = record(row?.receipt);
  const pin = studioReviewTaskReferenceSchema.shape.subject.safeParse(row?.pin);
  if (!row || !capture || !receipt || !pin.success) return null;
  const proof = studioReviewCaptureFromOperation(capture.operation, pin.data, receipt);
  if (!proof) return null;
  const { intent, payload, actorUserId, key } = proof;
  const complete = studioReviewPreviewCompleteSchema.safeParse({ intent, pages: payload.previews });
  const sequence = capture.sequence;
  if (!complete.success || typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1
    || capture.artifactId !== pin.data.artifactId || capture.resultRevisionId !== pin.data.revisionId
    || capture.commandType !== "review.snapshot-create" || record(capture.operation)?.type !== "review.snapshot-create"
    || capture.actorUserId !== actorUserId || capture.deviceId !== intent.deviceId
    || capture.commandId !== `review-capture-${key}` || capture.baseRevisionId !== intent.expectedHeadRevisionId
    || capture.payloadHash !== studioReviewPreviewDigest(payload)
    || receipt.artifactId !== pin.data.artifactId || receipt.resultRevisionId !== pin.data.revisionId
    || receipt.requestHash !== studioReviewPreviewDigest(complete.data)
    || pin.data.reviewId !== `review-${key}` || pin.data.revisionId !== `review-snapshot-${key}`) return null;
  const submissionId = `review-submission-${key}`, checkpointId = `review-checkpoint-${key}`;
  const chain = [
    [row.snapshot, "review-snapshot", pin.data.revisionId, row.snapshotParents, submissionId],
    [row.submission, "submission", submissionId, row.submissionParents, checkpointId],
    [row.checkpoint, "checkpoint", checkpointId, row.checkpointParents, intent.expectedHeadRevisionId],
  ] as const;
  for (const [revisionValue, kind, id, parents, parentId] of chain) {
    const revision = record(revisionValue);
    if (!revision || revision.id !== id || revision.kind !== kind || revision.artifactId !== pin.data.artifactId
      || revision.rootGraphHash !== pin.data.rootGraphHash || revision.operationFirst !== sequence || revision.operationLast !== sequence
      || revision.createdBy !== actorUserId || revision.deviceId !== intent.deviceId
      || !Array.isArray(parents) || parents.length !== 1 || record(parents[0])?.ordinal !== 0
      || record(parents[0])?.parentRevisionId !== parentId) return null;
  }
  const base = record(row.base);
  if (!base || base.id !== intent.expectedHeadRevisionId || base.artifactId !== pin.data.artifactId
    || base.rootGraphHash !== intent.expectedHeadRootGraphHash) return null;
  return { subject: pin.data, submissionId, sourceServerRevision: intent.sourceServerRevision, sequence };
}

/** Call after the original comment's edit ACL and review lock. These rows are immutable;
 * taking a second review update lock would introduce opposite-direction resolution deadlocks. */
export async function loadStudioReviewResolutionCaptures(client: PoolClient, artifactId: string, reviewIds: readonly string[]) {
  const result = await client.query(
    `SELECT jsonb_build_object('schemaVersion',1,'workId',project."workId",'projectId',artifact."projectId",
        'artifactId',artifact.id,'reviewId',review.id,'revisionId',snapshot.id,'rootGraphHash',snapshot."rootGraphHash") AS pin,
      to_jsonb(snapshot) AS snapshot, to_jsonb(submission) AS submission, to_jsonb(checkpoint) AS checkpoint,
      to_jsonb(base) AS base, to_jsonb(capture) AS capture, to_jsonb(receipt) AS receipt,
      (SELECT jsonb_agg(edge ORDER BY edge.ordinal) FROM studio_revision_parent edge WHERE edge."revisionId"=snapshot.id) AS "snapshotParents",
      (SELECT jsonb_agg(edge ORDER BY edge.ordinal) FROM studio_revision_parent edge WHERE edge."revisionId"=submission.id) AS "submissionParents",
      (SELECT jsonb_agg(edge ORDER BY edge.ordinal) FROM studio_revision_parent edge WHERE edge."revisionId"=checkpoint.id) AS "checkpointParents"
     FROM studio_review review
     JOIN studio_artifact artifact ON artifact.id=review."artifactId"
     JOIN studio_project_graph project ON project.id=artifact."projectId"
     JOIN studio_revision snapshot ON snapshot.id=review."revisionId" AND snapshot."artifactId"=artifact.id
     JOIN studio_operation capture ON capture."artifactId"=artifact.id AND capture."resultRevisionId"=snapshot.id
       AND capture.sequence=snapshot."operationLast" AND capture."commandType"='review.snapshot-create'
     JOIN studio_mutation_receipt receipt ON receipt."artifactId"=artifact.id AND receipt."resultRevisionId"=snapshot.id
       AND receipt.response->>'status'='completed' AND receipt.response->'subject'->>'reviewId'=review.id
     LEFT JOIN studio_revision_parent snapshot_edge ON snapshot_edge."revisionId"=snapshot.id AND snapshot_edge.ordinal=0
     LEFT JOIN studio_revision submission ON submission.id=snapshot_edge."parentRevisionId"
     LEFT JOIN studio_revision_parent submission_edge ON submission_edge."revisionId"=submission.id AND submission_edge.ordinal=0
     LEFT JOIN studio_revision checkpoint ON checkpoint.id=submission_edge."parentRevisionId"
     LEFT JOIN studio_revision base ON base.id=capture."baseRevisionId"
     WHERE artifact.id=$1 AND review.id=ANY($2::text[])`, [artifactId, reviewIds]);
  return result.rows.map(studioReviewResolutionCaptureFromRows);
}
