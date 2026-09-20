import { StudioReviewCaptureDialogMount } from "./StudioReviewCaptureDialogMount";
import { useStudioReviewCapture } from "./useStudioReviewCapture";

import { StudioReviewEditorHandoffMount } from "../review-handoff/StudioReviewEditorHandoffMount";
import type { StudioReviewEditorHostNavigation } from "../review-handoff/studio-review-editor-host";
import { studioReviewCaptureHostContext, type StudioReviewCaptureHostBindings } from "./studio-review-capture-host-context";

export { studioReviewCaptureHostContext } from "./studio-review-capture-host-context";

/** The host supplies runtime authority; this adapter owns capture projection and its dialog. */
export function useStudioReviewCaptureHost(bindings: StudioReviewCaptureHostBindings & { readonly reviewHandoff?: StudioReviewEditorHostNavigation }) {
  const capture = useStudioReviewCapture(JSON.stringify([bindings.studioAuthUserId, bindings.workId]), {
    getContext: () => studioReviewCaptureHostContext(bindings),
    projectRuntime: async (saved) => {
      const snapshot = bindings.getSnapshot();
      const { projectStudioReviewCaptureSource } = await import("./studio-review-capture-projection");
      return projectStudioReviewCaptureSource(snapshot, saved, bindings.canvasWidth, bindings.isDurableMask);
    },
    save: bindings.save,
    captureAll: bindings.captureAll,
  });
  return {
    open: capture.open,
    dialog: <>
      {bindings.reviewHandoff && <StudioReviewEditorHandoffMount bindings={bindings} navigation={bindings.reviewHandoff} />}
      <StudioReviewCaptureDialogMount
      open={capture.visible}
      snapshot={capture.snapshot}
      onSave={() => { void capture.save(); }}
      onRetry={capture.retry}
      onClose={() => { void capture.close(); }}
    /></>,
  };
}
