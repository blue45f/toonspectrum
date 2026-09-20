import { getAuthSessionRevision, getAuthUserId } from "@/compat/auth-session-state";

import { studioReviewCaptureHostContext, type StudioReviewCaptureHostBindings } from "../review-capture/studio-review-capture-host-context";
import { projectStudioReviewCaptureSource } from "../review-capture/studio-review-capture-projection";
import type { StudioEditorCommentTarget } from "../studio-comment-editor-selection";

import type { StudioReviewEditorDependencies } from "./studio-review-editor-handoff";

export interface StudioReviewEditorHostNavigation {
  readonly search: string;
  getCurrentPageId(): string;
  hasActivePointer(): boolean;
  select(target: StudioEditorCommentTarget, current: () => boolean): boolean;
}

/** Same ref-backed runtime authority and save projection used by actual preview capture. */
export function studioReviewEditorHostBindings(
  bindings: StudioReviewCaptureHostBindings, navigation: StudioReviewEditorHostNavigation,
): Pick<StudioReviewEditorDependencies, "getContext" | "projectRuntime" | "select"> {
  return {
    getContext: () => {
      const context = studioReviewCaptureHostContext(bindings);
      return { ...context, generation: JSON.stringify([context.generation, getAuthSessionRevision()]),
        pageId: navigation.getCurrentPageId(), available: context.available && bindings.studioAuthUserId !== null
          && getAuthUserId() === bindings.studioAuthUserId && !navigation.hasActivePointer() };
    },
    projectRuntime: (saved) => projectStudioReviewCaptureSource(bindings.getSnapshot(), saved, bindings.canvasWidth, bindings.isDurableMask),
    select: (target, current) => navigation.select(target, current),
  };
}
