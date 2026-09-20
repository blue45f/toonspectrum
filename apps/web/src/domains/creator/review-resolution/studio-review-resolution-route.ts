import { canonicalJson } from "@toonspectrum/studio-project-model";

import { parseStudioReviewEditorRequest, type StudioReviewEditorRequest } from "../review-handoff/studio-review-editor-handoff";
import { studioReviewEditorRequestFromLocation } from "../review-handoff/studio-review-editor-route";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { parseStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

export interface StudioReviewResolutionRequest {
  readonly origin: StudioReviewEditorRequest;
  readonly replacement: StudioVirtualSpaceReviewSubject;
}
export function parseStudioReviewResolutionRequest(raw: StudioReviewResolutionRequest): StudioReviewResolutionRequest | null {
  const origin = parseStudioReviewEditorRequest(raw?.origin), replacement = parseStudioVirtualSpaceReviewSubject(raw?.replacement);
  if (!origin || !replacement || origin.subject.workId !== replacement.workId || origin.subject.projectId !== replacement.projectId
    || origin.subject.artifactId !== replacement.artifactId || origin.subject.reviewId === replacement.reviewId
    || origin.subject.revisionId === replacement.revisionId) return null;
  return { origin, replacement };
}

/** Locators only. The destination must independently read both pins and the saved comment. */
export function studioReviewResolutionHref(raw: StudioReviewResolutionRequest): string {
  const request = parseStudioReviewResolutionRequest(raw);
  if (!request) throw new Error("Invalid saved review resolution request");
  const base = studioVirtualSpaceReviewHref(request.origin.subject), query = new URLSearchParams(base.split("?")[1]);
  query.set("reviewComment", request.origin.commentId);
  query.set("correctedReview", request.replacement.reviewId);
  query.set("correctedRevision", request.replacement.revisionId);
  query.set("correctedDigest", request.replacement.rootGraphHash);
  return `${base.split("?")[0]}?${query.toString()}`;
}
export function studioReviewResolutionRequestFromLocation(workId: string, search: string): StudioReviewResolutionRequest | null {
  const query = new URLSearchParams(search), origin = studioReviewEditorRequestFromLocation(workId, search);
  if (!origin || ["correctedReview", "correctedRevision", "correctedDigest"].some((key) => query.getAll(key).length !== 1)) return null;
  return parseStudioReviewResolutionRequest({ origin, replacement: { ...origin.subject,
    reviewId: query.get("correctedReview")!, revisionId: query.get("correctedRevision")!, rootGraphHash: query.get("correctedDigest")! } });
}
export function studioReviewResolutionMatchesComment(request: StudioReviewResolutionRequest | null, subject: StudioVirtualSpaceReviewSubject, commentId: string): boolean {
  return !!request && request.origin.commentId === commentId && canonicalJson(request.origin.subject) === canonicalJson(subject);
}
