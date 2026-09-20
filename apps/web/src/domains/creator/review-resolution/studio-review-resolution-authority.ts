import { canonicalJson } from "@toonspectrum/studio-project-model";

import { listStudioArtifactRevisions } from "../project-graph/studio-project-graph-client";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";

import { parseStudioReviewResolutionRequest, type StudioReviewResolutionRequest } from "./studio-review-resolution-route";

export type StudioReviewResolutionReason = "unavailable" | "access-denied" | "invalid-source" | "context-changed" | "expired" | "closed" | "conflict" | "uncertain";
export class StudioReviewResolutionError extends Error { constructor(readonly reason: StudioReviewResolutionReason) { super(reason); } }
export interface StudioReviewResolutionAuthority {
  readonly origin: StudioVirtualSpaceVerifiedReview;
  readonly replacement: StudioVirtualSpaceVerifiedReview;
  readonly comment: StudioVirtualSpaceVerifiedReview["review"]["comments"][number];
  readonly submissionId: string;
  readonly expiresAt: number;
  readonly resolved: boolean;
}
export interface StudioReviewResolutionReaders {
  verify: typeof verifyStudioVirtualSpaceReviewSubject;
  revisions: typeof listStudioArtifactRevisions;
  now(): number;
}
const SERVER: StudioReviewResolutionReaders = { verify: verifyStudioVirtualSpaceReviewSubject, revisions: listStudioArtifactRevisions, now: Date.now };

/** This only establishes current UI authority and graph identity. The resolve API separately
 * proves both capture receipts, exact saved-document digests and strictly advancing source versions. */
export async function readStudioReviewResolutionAuthority(raw: StudioReviewResolutionRequest, signal: AbortSignal, readers = SERVER): Promise<StudioReviewResolutionAuthority> {
  const request = parseStudioReviewResolutionRequest(raw), started = readers.now();
  if (!request || signal.aborted) throw new StudioReviewResolutionError("invalid-source");
  const [origin, replacement] = await Promise.all([readers.verify(request.origin.subject, "view"), readers.verify(request.replacement, "view")]);
  if (signal.aborted) throw new StudioReviewResolutionError("context-changed");
  if (!origin.ok || !replacement.ok || !origin.project.access.edit || !replacement.project.access.edit) throw new StudioReviewResolutionError("access-denied");
  if (canonicalJson(origin.subject) !== canonicalJson(request.origin.subject) || canonicalJson(replacement.subject) !== canonicalJson(request.replacement)) throw new StudioReviewResolutionError("invalid-source");
  const comments = origin.review.comments.filter((comment) => comment.id === request.origin.commentId && comment.reviewId === origin.subject.reviewId);
  const comment = comments[0];
  if (comments.length !== 1 || !comment || comment.anchor.artifactId !== origin.subject.artifactId || comment.anchor.revisionId !== origin.subject.revisionId) throw new StudioReviewResolutionError("invalid-source");
  const revisions = await readers.revisions(request.replacement.artifactId);
  if (signal.aborted) throw new StudioReviewResolutionError("context-changed");
  const snapshots = revisions.filter((revision) => revision.id === replacement.subject.revisionId), snapshot = snapshots[0];
  if (snapshots.length !== 1 || !snapshot || snapshot.artifactId !== replacement.subject.artifactId || snapshot.kind !== "review-snapshot"
    || snapshot.rootGraphHash !== replacement.subject.rootGraphHash || snapshot.parentIds.length !== 1) throw new StudioReviewResolutionError("invalid-source");
  const parents = revisions.filter((revision) => revision.id === snapshot.parentIds[0]), submission = parents[0];
  if (parents.length !== 1 || !submission || submission.kind !== "submission" || submission.artifactId !== snapshot.artifactId
    || submission.rootGraphHash !== snapshot.rootGraphHash) throw new StudioReviewResolutionError("invalid-source");
  const resolved = comment.status === "resolved" && comment.resolutionRevisionId === submission.id;
  if (!resolved && !["open", "changes-requested"].includes(origin.review.status)) throw new StudioReviewResolutionError("closed");
  if (!resolved && !["open", "reopened"].includes(comment.status)) throw new StudioReviewResolutionError("conflict");
  const expiresAt = Math.min(started + 15_000, origin.expiresAt, replacement.expiresAt);
  if (readers.now() >= expiresAt || readers.now() < started) throw new StudioReviewResolutionError("expired");
  return { origin, replacement, comment, submissionId: submission.id, expiresAt, resolved };
}
