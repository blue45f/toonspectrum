import { StudioReviewCaptureDialogMount } from "./StudioReviewCaptureDialogMount";
import { useStudioReviewCapture } from "./useStudioReviewCapture";

import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioReviewCaptureBridgeDependencies } from "./studio-review-capture-bridge";

type Current<T> = { readonly current: T };
interface StudioReviewCaptureHostBindings {
  readonly studioAuthUserId: string | null;
  readonly workId: string | null;
  readonly available: boolean;
  readonly editorMountedRef: Current<boolean>;
  readonly studioRevisionProjectGenerationRef: Current<number>;
  readonly drawingRef: Current<unknown>;
  readonly pendingStrokeCommitsRef: Current<unknown>;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly getSnapshot: () => StudioProjectSnapshot;
  readonly canvasWidth: number;
  readonly isDurableMask: (surfaceId: string) => boolean;
  readonly save: StudioReviewCaptureBridgeDependencies["save"];
  readonly captureAll: StudioReviewCaptureBridgeDependencies["captureAll"];
}

/** Read authority refs at each bridge boundary, including before React publishes an edit. */
export function studioReviewCaptureHostContext(bindings: StudioReviewCaptureHostBindings) {
  const ticket = bindings.captureStudioMutationTicket();
  return {
    workId: ticket.workId,
    scopeKey: JSON.stringify([ticket.authScopeKey, ticket.workId]),
    generation: JSON.stringify([ticket.accessGeneration, ticket.documentGeneration,
      bindings.studioRevisionProjectGenerationRef.current]),
    available: bindings.available && bindings.editorMountedRef.current
      && bindings.canApplyStudioMutation(ticket)
      && !bindings.drawingRef.current && !bindings.pendingStrokeCommitsRef.current,
  };
}

/** The host supplies runtime authority; this adapter owns capture projection and its dialog. */
export function useStudioReviewCaptureHost(bindings: StudioReviewCaptureHostBindings) {
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
    dialog: <StudioReviewCaptureDialogMount
      open={capture.visible}
      snapshot={capture.snapshot}
      onSave={() => { void capture.save(); }}
      onRetry={capture.retry}
      onClose={() => { void capture.close(); }}
    />,
  };
}
