import { studioReviewPageMappingSchema } from "@toonspectrum/studio-project-model";

import { verifyStudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-invitation";
import { getStudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";

import { StudioReviewEditorError, type StudioReviewEditorAuthority, type StudioReviewEditorRequest } from "./studio-review-editor-handoff";

export interface StudioReviewEditorReader {
  verify: typeof verifyStudioVirtualSpaceReviewSubject;
  previews: typeof getStudioVirtualSpaceReviewPreview;
  now(): number;
}
const SERVER: StudioReviewEditorReader = {
  verify: verifyStudioVirtualSpaceReviewSubject, previews: getStudioVirtualSpaceReviewPreview, now: Date.now,
};

/** Read only the requested saved comment and server-derived mapping. Discard all signed URLs. */
export async function readStudioReviewEditorAuthority(
  request: StudioReviewEditorRequest, signal: AbortSignal, reader: StudioReviewEditorReader = SERVER,
): Promise<StudioReviewEditorAuthority> {
  const check = (expiresAt = Infinity) => {
    if (signal.aborted) throw new StudioReviewEditorError("context-changed");
    if (reader.now() >= expiresAt) throw new StudioReviewEditorError("access-denied");
  };
  check();
  const verified = await reader.verify(request.subject, "view");
  check();
  if (!verified.ok) throw new StudioReviewEditorError(verified.reason === "access-denied" ? "access-denied" : "unavailable");
  if (!verified.project.access.edit) throw new StudioReviewEditorError("access-denied");
  const comments = verified.review.comments.filter((comment) => comment.id === request.commentId && comment.reviewId === request.subject.reviewId);
  const comment = comments.length === 1 ? comments[0] : undefined;
  if (!comment?.anchor.source) throw new StudioReviewEditorError("unmapped");
  const ordinal = comment.anchor.source.pageOrdinal;
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    check(verified.expiresAt);
    const previews = await reader.previews(request.subject, cursor);
    check(verified.expiresAt);
    if (!previews.ok) throw new StudioReviewEditorError(previews.reason === "access-denied" ? "access-denied" : "unavailable");
    const preview = previews.previews.find((page) => page.ordinal === ordinal);
    if (preview) {
      const mapping = studioReviewPageMappingSchema.parse(preview.mapping);
      if (mapping.status !== "mapped") throw new StudioReviewEditorError("unmapped");
      return { anchor: comment.anchor, mapping, expiresAt: verified.expiresAt };
    }
    if (previews.previews.some((page) => page.ordinal > ordinal) || !previews.nextCursor || cursors.has(previews.nextCursor)) break;
    cursor = previews.nextCursor; cursors.add(cursor);
  } while (cursor);
  throw new StudioReviewEditorError("unmapped");
}
