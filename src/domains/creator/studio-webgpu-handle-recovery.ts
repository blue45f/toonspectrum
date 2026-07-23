import type { StudioGpuStroke } from "./studio-webgpu-stroke";
import type { StudioWebGpuCanvasHandle } from "./StudioWebGpuCanvas";

export type StudioGpuHandleBaselineRecovery =
  | { readonly status: "not-needed"; readonly pending: false }
  | { readonly status: "waiting-handle"; readonly pending: true }
  | { readonly status: "cleared"; readonly pending: false }
  | { readonly status: "restored"; readonly pending: false }
  | { readonly status: "retained"; readonly pending: true };

/**
 * Restores the exact retained GPU operation baseline after a canvas-handle teardown where the
 * safer whole-group Konva promotion was rejected. The recovery flag is consumed only after both
 * the baseline and its visibility were submitted successfully, so a throwing remount can retry.
 */
export function restoreStudioGpuPendingBaselineOnHandle(input: Readonly<{
  handle: Pick<StudioWebGpuCanvasHandle, "replacePinnedStrokes" | "setPinnedVisible"> | null;
  pendingStrokes: readonly StudioGpuStroke[];
  recoveryPending: boolean;
}>): StudioGpuHandleBaselineRecovery {
  if (!input.recoveryPending) return { status: "not-needed", pending: false };
  if (!input.handle) return { status: "waiting-handle", pending: true };
  if (input.pendingStrokes.length === 0) return { status: "cleared", pending: false };
  try {
    input.handle.replacePinnedStrokes(input.pendingStrokes);
    input.handle.setPinnedVisible(true);
    return { status: "restored", pending: false };
  } catch {
    return { status: "retained", pending: true };
  }
}
