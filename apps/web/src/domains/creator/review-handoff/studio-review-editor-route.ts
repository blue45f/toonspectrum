import { studioCanvasPathname } from "../studio-workspace-route";
import { studioVirtualSpaceReviewHref, studioVirtualSpaceReviewSubjectFromLocation } from "../virtual-space/studio-virtual-space-review-invitation";

import { parseStudioReviewEditorRequest, type StudioReviewEditorRequest } from "./studio-review-editor-handoff";

/** Stable identities only. No anchor, document body, private preview URL or auth material travels. */
export function studioReviewEditorHref(raw: StudioReviewEditorRequest): string {
  const request = parseStudioReviewEditorRequest(raw);
  if (!request) throw new Error("Invalid review editor request");
  const query = new URLSearchParams(studioVirtualSpaceReviewHref(request.subject).split("?")[1]);
  query.delete("view"); query.set("reviewComment", request.commentId);
  return `${studioCanvasPathname(request.subject.workId)}?${query.toString()}`;
}
export function studioReviewEditorRequestFromLocation(workId: string | null, search: string): StudioReviewEditorRequest | null {
  if (!workId) return null;
  const query = new URLSearchParams(search), subject = studioVirtualSpaceReviewSubjectFromLocation(workId, search);
  if (!subject || query.getAll("reviewComment").length !== 1) return null;
  return parseStudioReviewEditorRequest({ subject, commentId: query.get("reviewComment") ?? "" });
}
