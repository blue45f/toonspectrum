import { getStudioTeam } from "../studio-team-client";
import { loadStudioServerProductionWorkspace } from "../studio-production/studio-production-server-client";
import { verifyStudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-invitation";

import { parseStudioReviewProductionRequest, StudioReviewProductionError,
  type StudioReviewProductionAuthority, type StudioReviewProductionRequest } from "./studio-review-production-model";

export interface StudioReviewProductionReaders {
  verify: typeof verifyStudioVirtualSpaceReviewSubject;
  workspace: typeof loadStudioServerProductionWorkspace;
  team: typeof getStudioTeam;
  now(): number;
}
const SERVER: StudioReviewProductionReaders = { verify: verifyStudioVirtualSpaceReviewSubject,
  workspace: loadStudioServerProductionWorkspace, team: getStudioTeam, now: Date.now };

export async function readStudioReviewProductionAuthority(
  raw: StudioReviewProductionRequest, actorId: string, signal: AbortSignal, readers = SERVER,
): Promise<StudioReviewProductionAuthority> {
  const request = parseStudioReviewProductionRequest(raw), started = readers.now();
  if (!request || !actorId || signal.aborted) throw new StudioReviewProductionError("unavailable");
  const [verified, workspace, team] = await Promise.all([
    readers.verify(request.subject, "view"), readers.workspace(request.subject.workId, signal), readers.team(request.subject.workId, signal),
  ]);
  if (signal.aborted) throw new StudioReviewProductionError("context-changed");
  if (!verified.ok || !verified.project.access.edit || !workspace.capabilities.edit
    || workspace.workId !== request.subject.workId || workspace.document.scopeKey !== `work:${request.subject.workId}`
    || team.workId !== request.subject.workId || team.viewer.userId !== actorId || team.viewer.status !== "active"
    || !team.viewer.capabilities.view || !team.viewer.capabilities.comment || !team.viewer.capabilities.edit) throw new StudioReviewProductionError("access-denied");
  const matches = verified.review.comments.filter((comment) => comment.id === request.commentId && comment.reviewId === request.subject.reviewId);
  const comment = matches[0];
  if (matches.length !== 1 || comment?.anchor.artifactId !== request.subject.artifactId || comment.anchor.revisionId !== request.subject.revisionId) {
    throw new StudioReviewProductionError("unavailable");
  }
  const expiresAt = Math.min(started + 15_000, verified.expiresAt);
  if (readers.now() >= expiresAt) throw new StudioReviewProductionError("expired");
  return { request, comment, workspace, team, actorId, expiresAt };
}
