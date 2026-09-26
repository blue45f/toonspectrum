import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { pinnedSharePageSchema, type PinnedShareCreate, type PinnedSharePage } from "@toonspectrum/studio-project-model/pinned-review-share";

import { resolveCreatorCollaborationAccess } from "../../creator/creator-collaboration.policy";
import { loadStudioReviewResolutionCaptures } from "../studio-review-capture-attestation";
import { studioReviewPageRasterSchema } from "../studio-review-source-map";
import { lockStudioReviewPreviewStorage } from "../studio-review-preview-storage";
import { studioReviewPreviewObject, type StudioReviewPreviewBlobRow } from "../studio-review-preview";
import type { LocatedPrivateObjectReference } from "../../../platform/adapters/private-object-storage/private-object-storage.contract";

export class PinnedShareError extends Error {
  constructor(readonly code: "forbidden" | "not-found" | "expired" | "revoked" | "invalid-source" | "conflict" | "quota" | "unavailable") { super(`pinned_share_${code}`); }
}
export const failShare = (code: PinnedShareError["code"]): never => { throw new PinnedShareError(code); };
export const shareHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Lock work, user, membership before share rows to avoid read/revoke lock inversions. */
export async function requireShareManager(client: PoolClient, actorId: string, workId: string, write = false): Promise<string> {
  const work = (await client.query<{ userId: string }>(`SELECT "userId" FROM creator_work WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [workId])).rows[0];
  const user = (await client.query<{ status: string; sessionVersion: number }>('SELECT status,"sessionVersion" FROM "user" WHERE id=$1 FOR SHARE', [actorId])).rows[0];
  if (!work || user?.status !== "active") return failShare("forbidden");
  const membership = (await client.query<{ userId: string; role: string; status: string; invitationId: string; updatedAt: string }>('SELECT "userId",role,status,"invitationId","updatedAt"::text AS "updatedAt" FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actorId])).rows[0];
  if (!resolveCreatorCollaborationAccess({ actorUserId: actorId, ownerUserId: work.userId, membership }).manageMembers) return failShare("forbidden");
  return shareHash({ workId, actorId, owner: work.userId, sessionVersion: user.sessionVersion, membership: actorId === work.userId ? null : membership });
}
type Subject = PinnedShareCreate["subject"];
export async function pinnedShareCapture(client: PoolClient, subject: Subject) {
  const proofs = await loadStudioReviewResolutionCaptures(client, subject.artifactId, [subject.reviewId]);
  if (proofs.length !== 1 || !proofs[0] || canonicalJson(proofs[0].subject) !== canonicalJson(subject)) return failShare("invalid-source");
  const row = (await client.query<{ status: string; decidedBy: string | null; decidedAt: string | null; rasters: unknown }>(
    `SELECT review.status,review."decidedBy",to_char(review."decidedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "decidedAt",
      operation.operation->'payload'->'pageRasters' AS rasters
     FROM studio_review review JOIN studio_operation operation ON operation."artifactId"=review."artifactId"
      AND operation."resultRevisionId"=review."revisionId" AND operation."commandType"='review.snapshot-create'
     WHERE review.id=$1 AND review."artifactId"=$2 AND review."revisionId"=$3 FOR SHARE OF review`, [subject.reviewId, subject.artifactId, subject.revisionId])).rows;
  if (row.length !== 1 || !row[0] || row[0].status === "cancelled") return failShare("invalid-source");
  const rasters = z.array(studioReviewPageRasterSchema).min(1).max(100_000).safeParse(row[0].rasters);
  if (!rasters.success || rasters.data.some((page, i) => page.ordinal !== i)) return failShare("invalid-source");
  const approvalDigest = row[0].status === "approved" && row[0].decidedBy && row[0].decidedAt
    ? shareHash({ subject, decidedBy: row[0].decidedBy, decidedAt: row[0].decidedAt }) : null;
  return { rasters: rasters.data, approvalDigest, decidedAt: approvalDigest ? row[0].decidedAt : null };
}
export async function pinnedShareImages(client: PoolClient, subject: Subject,
  capture: Awaited<ReturnType<typeof pinnedShareCapture>>, ordinals: readonly number[]): Promise<{ pages: PinnedSharePage[]; objects: LocatedPrivateObjectReference[] }> {
  const rows = (await client.query<Omit<StudioReviewPreviewBlobRow, "workStorageObject">>(
    `SELECT blob.hash,ref.ordinal,blob.size,blob."mediaType",blob."objectKey",blob."encryptionMetadata",blob."malwareStatus",blob."formatStatus"
     FROM studio_revision_blob ref JOIN studio_blob blob ON blob.hash=ref."blobHash"
     WHERE ref."revisionId"=$1 AND ref.role='preview' AND ref.ordinal=ANY($2::integer[]) ORDER BY blob.hash,ref.ordinal`, [subject.revisionId, ordinals])).rows;
  if (rows.length !== ordinals.length || new Set(rows.map((row) => row.ordinal)).size !== rows.length) return failShare("invalid-source");
  const byOrdinal = new Map<number, { page: PinnedSharePage; object: LocatedPrivateObjectReference }>();
  for (const row of rows) {
    const raster = capture.rasters[row.ordinal];
    if (!raster || raster.sha256 !== row.hash) return failShare("invalid-source");
    let owned: LocatedPrivateObjectReference;
    try { owned = await lockStudioReviewPreviewStorage(client, subject.workId, row.hash); } catch { return failShare("unavailable"); }
    const object = studioReviewPreviewObject({ ...row, workStorageObject: owned });
    if (!object) return failShare("unavailable");
    const parsed = pinnedSharePageSchema.safeParse({ ordinal: row.ordinal, sha256: row.hash, byteLength: Number(row.size), mediaType: row.mediaType, width: raster.width, height: raster.height });
    if (!parsed.success) return failShare("invalid-source");
    byOrdinal.set(row.ordinal, { page: parsed.data, object });
  }
  return { pages: ordinals.map((ordinal) => byOrdinal.get(ordinal)!.page), objects: ordinals.map((ordinal) => byOrdinal.get(ordinal)!.object) };
}
