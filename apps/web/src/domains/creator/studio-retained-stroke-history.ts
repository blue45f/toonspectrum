import { projectStudioPendingStrokes, type StudioPendingStrokeBatch } from "./studio-pending-stroke-durability";

import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

/** Retained ink is already published to CRDT even while it is outside page-snapshot history. */
export function publishStudioRetainedStrokeHistory(
  pages: readonly PageState[],
  batch: StudioPendingStrokeBatch<DrawEl>,
  direction: "undo" | "redo",
  publish: (before: readonly PageState[], after: readonly PageState[]) => boolean,
): boolean {
  const projected = projectStudioPendingStrokes(pages, batch);
  if (projected.status !== "projected") return false;
  return direction === "undo"
    ? publish(projected.pagesList, pages)
    : publish(pages, projected.pagesList);
}

/** A new accepted edit consumes only the undone strokes, never older retained handoffs. */
export function discardStudioRetainedStrokeRedo<T extends StudioPendingStrokeBatch<DrawEl>>(
  pending: { current: T | null },
  discardPixels: (strokeIds: readonly string[]) => void,
): boolean {
  const batch = pending.current;
  if (!batch) return false;
  pending.current = null;
  discardPixels(batch.strokes.map((stroke) => stroke.id));
  return true;
}

export type StudioRetainedStrokeCommitBatch = {
  pageId: string;
  strokes: DrawEl[];
  retryCount: number;
};

export type StudioRetainedStrokeQueuedBatch = StudioRetainedStrokeCommitBatch & {
  timer: ReturnType<typeof setTimeout> | null;
};

export type StudioRetainedStrokeUndoneBatch = StudioRetainedStrokeCommitBatch & {
  historyIndex: number;
};

type MutableRef<T> = { current: T };

/** Finish the previous page's batch before accepting a stroke on another page. */
export function prepareStudioPendingStrokeCommitPage(
  pending: MutableRef<StudioRetainedStrokeQueuedBatch | null>,
  pageId: string,
  synchronousFlush: MutableRef<boolean>,
  flush: () => boolean,
): boolean {
  if (!pending.current || pending.current.pageId === pageId) return true;
  const previous = synchronousFlush.current;
  synchronousFlush.current = true;
  try {
    if (!flush()) return false;
    // A callback can report success after scheduling work. Ownership must actually have moved.
    return pending.current === null || pending.current.pageId === pageId;
  } finally {
    synchronousFlush.current = previous;
  }
}

type RetainedStrokeRetry = {
  flush: () => boolean;
  retryDelayMs: number;
  maxRetries: number;
};

/** A failed canonical commit keeps its original page and payload, even after retries run out. */
export function restoreStudioRetainedStrokeCommitBatch(
  pending: MutableRef<StudioRetainedStrokeQueuedBatch | null>,
  batch: StudioRetainedStrokeCommitBatch,
  retry: RetainedStrokeRetry,
): void {
  const restored: StudioRetainedStrokeQueuedBatch = {
    ...batch,
    retryCount: batch.retryCount + 1,
    timer: null,
  };
  pending.current = restored;
  if (restored.retryCount <= retry.maxRetries) {
    restored.timer = globalThis.setTimeout(retry.flush, retry.retryDelayMs);
  }
}

type StudioRetainedStrokeResumeContext = {
  undone: MutableRef<StudioRetainedStrokeUndoneBatch | null>;
  pending: MutableRef<StudioRetainedStrokeQueuedBatch | null>;
  getHistoryIndex: () => number;
  getPages: () => readonly PageState[];
  getActivePageId: () => string;
  isBlocked: () => boolean;
  flushPending: () => boolean;
  publish: (before: readonly PageState[], after: readonly PageState[]) => boolean;
  onResumed: () => void;
  showOverlay: (strokeIds: readonly string[]) => void;
  showEraser: (stroke: DrawEl) => void;
  persist: () => void;
  retryDelayMs: number;
  maxRetries: number;
};

/**
 * Resume the undone batch's owning page, independently of the currently selected page.
 * Flush and publication failures leave Redo available; publication succeeds before ownership
 * moves to the pending queue, whose payload survives any later canonical-commit failure.
 */
export function resumeStudioRetainedStrokeHistory(context: StudioRetainedStrokeResumeContext): boolean {
  const batch = context.undone.current;
  if (!batch || context.isBlocked() || context.getHistoryIndex() !== batch.historyIndex) return false;
  if (context.pending.current && !context.flushPending()) return false;
  // A successful flush can itself branch history or replace the batch. Re-read these refs.
  if (context.pending.current !== null || context.undone.current !== batch
    || context.getHistoryIndex() !== batch.historyIndex || context.isBlocked()) return false;
  if (!publishStudioRetainedStrokeHistory(context.getPages(), batch, "redo", context.publish)) {
    return false;
  }
  // Explicit Redo starts a fresh bounded retry cycle, including an exhausted original batch.
  restoreStudioRetainedStrokeCommitBatch(context.pending, { ...batch, retryCount: 0 }, {
    flush: context.flushPending,
    retryDelayMs: context.retryDelayMs,
    maxRetries: context.maxRetries,
  });
  context.undone.current = null;
  context.onResumed();
  if (context.getActivePageId() === batch.pageId) {
    for (const stroke of batch.strokes) {
      if (stroke.mode === "eraser") context.showEraser(stroke);
    }
    context.showOverlay(batch.strokes.map((stroke) => stroke.id));
  } else {
    context.flushPending();
  }
  globalThis.queueMicrotask(context.persist);
  return true;
}
