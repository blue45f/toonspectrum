import { useState } from "react";
import { StudioReviewCaptureDialogMount } from "./StudioReviewCaptureDialogMount";
import { useStudioReviewCapture } from "./useStudioReviewCapture";

import { StudioReviewEditorHandoffMount } from "../review-handoff/StudioReviewEditorHandoffMount";
import type { StudioReviewEditorHostNavigation } from "../review-handoff/studio-review-editor-host";
import { studioReviewEditorRequestFromLocation } from "../review-handoff/studio-review-editor-route";
import type { StudioReviewCaptureOrigin } from "../review-resolution/StudioReviewCaptureReturnLink";
import { useStudioStableHandlers } from "../studio-stable-handlers";
import { studioReviewCaptureHostContext, type StudioReviewCaptureHostBindings } from "./studio-review-capture-host-context";

export { studioReviewCaptureHostContext } from "./studio-review-capture-host-context";

/** The host supplies runtime authority; this adapter owns capture projection and its dialog. */
export function useStudioReviewCaptureHost(bindings: StudioReviewCaptureHostBindings & { readonly reviewHandoff?: StudioReviewEditorHostNavigation }) {
  const scopeKey = JSON.stringify([bindings.studioAuthUserId, bindings.workId]);
  const [origin, setOrigin] = useState<{ key: string; value: StudioReviewCaptureOrigin | null } | null>(null);
  const capture = useStudioReviewCapture(scopeKey, {
    getContext: () => studioReviewCaptureHostContext(bindings),
    projectRuntime: async (saved) => {
      const snapshot = bindings.getSnapshot();
      const { projectStudioReviewCaptureSource } = await import("./studio-review-capture-projection");
      return projectStudioReviewCaptureSource(snapshot, saved, bindings.canvasWidth, bindings.isDurableMask);
    },
    save: bindings.save,
    captureAll: bindings.captureAll,
  });
  const handlers = useStudioStableHandlers({ open: () => {
    // Only a new capture owner can choose a new origin. Reopening or retrying the
    // same intent must not relabel it after another comment's route is opened.
    if (!capture.open()) return;
    const request = studioReviewEditorRequestFromLocation(bindings.workId, bindings.reviewHandoff?.search ?? "");
    setOrigin({ key: scopeKey, value: request && bindings.studioAuthUserId && bindings.workId
      ? { actorId: bindings.studioAuthUserId, workId: bindings.workId, request } : null });
  } });
  return {
    open: handlers.open,
    dialog: <>
      {bindings.reviewHandoff && <StudioReviewEditorHandoffMount bindings={bindings} navigation={bindings.reviewHandoff} />}
      <StudioReviewCaptureDialogMount
      open={capture.visible}
      snapshot={capture.snapshot}
      origin={origin?.key === scopeKey ? origin.value : null}
      onSave={() => { void capture.save(); }}
      onRetry={capture.retry}
      onClose={() => { void capture.close(); }}
    /></>,
  };
}
