import { useSyncExternalStore } from "react";
import { getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioReviewEditorRequest } from "../review-handoff/studio-review-editor-handoff";
import type { StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";
import { parseStudioReviewResolutionRequest, studioReviewResolutionHref } from "./studio-review-resolution-route";

export interface StudioReviewCaptureOrigin { readonly actorId: string; readonly workId: string; readonly request: StudioReviewEditorRequest }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function StudioReviewCaptureReturnLink({ origin, replacement, className }: {
  readonly origin: StudioReviewCaptureOrigin; readonly replacement: StudioVirtualSpaceReviewSubject; readonly className: string;
}) {
  const bt = useBilingual("StudioReviewCaptureReturnLink"), actor = useSyncExternalStore(subscribe, getAuthUserId, () => null);
  const request = parseStudioReviewResolutionRequest({ origin: origin.request, replacement });
  if (actor !== origin.actorId || origin.workId !== replacement.workId || !request) return null;
  return <a className={className} href={studioReviewResolutionHref(request)} onClick={(event) => {
    if (getAuthUserId() !== origin.actorId) event.preventDefault();
  }}>{bt("원래 의견에서 수정본 확인", "Check the correction against the original note")}</a>;
}
