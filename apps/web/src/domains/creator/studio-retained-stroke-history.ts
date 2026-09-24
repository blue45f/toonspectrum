import { mergeStudioPendingStrokeElements, type StudioPendingStrokeBatch } from "./studio-pending-stroke-durability";

import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

type StudioRetainedStrokeHistoryTransition = {
  readonly withoutPending: readonly PageState[];
  readonly withPending: readonly PageState[];
};

/**
 * Builds both sides of a retained-stroke history transition from the current converged page.
 *
 * Another tab may echo our still-pending stroke through the CRDT frontier before local history
 * commits it. In that state the old projection helper returned `no-new-strokes`, and Undo was
 * consumed without changing either the document or the local queue. Constructing the two explicit
 * frontiers makes the operation idempotent whether the current React page already contains the
 * streamed stroke or still relies solely on the retained overlay.
 */
function retainedStrokeHistoryTransition(
  pages: readonly PageState[],
  batch: StudioPendingStrokeBatch<DrawEl>,
): StudioRetainedStrokeHistoryTransition | null {
  if (batch.strokes.length === 0) return null;
  const targetIndexes: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    if (pages[index]?.id === batch.pageId) targetIndexes.push(index);
  }
  if (targetIndexes.length !== 1) return null;

  const pendingIds = new Set<string>();
  for (const stroke of batch.strokes) {
    if (typeof stroke.id !== "string" || stroke.id.trim().length === 0) return null;
    pendingIds.add(stroke.id);
  }
  if (pendingIds.size === 0) return null;

  const targetIndex = targetIndexes[0]!;
  const targetPage = pages[targetIndex]!;
  const containsPending = targetPage.elements.some((element) => pendingIds.has(element.id));
  const withoutPending = containsPending
    ? (() => {
        const next = [...pages];
        next[targetIndex] = {
          ...targetPage,
          elements: targetPage.elements.filter((element) => !pendingIds.has(element.id)),
        };
        return next;
      })()
    : pages;
  const withPendingElements = mergeStudioPendingStrokeElements(
    targetPage.elements,
    batch.strokes,
  );
  const withPending = [...pages];
  withPending[targetIndex] = {
    ...targetPage,
    elements: withPendingElements,
  };
  return { withoutPending, withPending };
}

/** Retained ink is already published to CRDT even while it is outside page-snapshot history. */
export function publishStudioRetainedStrokeHistory(
  pages: readonly PageState[],
  batch: StudioPendingStrokeBatch<DrawEl>,
  direction: "undo" | "redo",
  publish: (before: readonly PageState[], after: readonly PageState[]) => boolean,
): boolean {
  const transition = retainedStrokeHistoryTransition(pages, batch);
  if (!transition) return false;
  return direction === "undo"
    ? publish(transition.withPending, transition.withoutPending)
    : publish(transition.withoutPending, transition.withPending);
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

export type StudioRetainedStrokeRealtimeHistoryRange = {
  readonly strokeIds: readonly string[];
  readonly baseIndex: number;
  readonly finalIndex: number;
};

/**
 * Records one contiguous set of realtime-authored strokes after a deferred batch has been expanded
 * into one local undo step per stroke. Adjacent drawing batches coalesce into one compact range.
 */
export function appendStudioRetainedStrokeRealtimeHistoryRange(
  ranges: readonly StudioRetainedStrokeRealtimeHistoryRange[],
  strokeIds: readonly string[],
  finalIndex: number,
): readonly StudioRetainedStrokeRealtimeHistoryRange[] {
  const ids = [...new Set(strokeIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0 || !Number.isInteger(finalIndex) || finalIndex < 0) return ranges;
  const baseIndex = Math.max(0, finalIndex - ids.length);
  const retained = ranges.filter((range) => range.finalIndex <= baseIndex);
  const previous = retained.at(-1);
  if (previous?.finalIndex === baseIndex) {
    return [
      ...retained.slice(0, -1),
      {
        strokeIds: [...new Set([...previous.strokeIds, ...ids])],
        baseIndex: previous.baseIndex,
        finalIndex,
      },
    ];
  }
  return [...retained, { strokeIds: ids, baseIndex, finalIndex }];
}

/**
 * A new edit after Undo cuts only future realtime provenance. Earlier ranges remain available so
 * later history traversal can still mirror those exact local strokes into the live CRDT.
 */
export function truncateStudioRetainedStrokeRealtimeHistoryRanges(
  ranges: readonly StudioRetainedStrokeRealtimeHistoryRange[],
  historyIndex: number,
): readonly StudioRetainedStrokeRealtimeHistoryRange[] {
  if (!Number.isInteger(historyIndex) || historyIndex < 0) return [];
  const next: StudioRetainedStrokeRealtimeHistoryRange[] = [];
  for (const range of ranges) {
    if (historyIndex <= range.baseIndex) continue;
    if (historyIndex >= range.finalIndex) {
      next.push(range);
      continue;
    }
    const keep = Math.min(range.strokeIds.length, historyIndex - range.baseIndex);
    if (keep <= 0) continue;
    next.push({
      strokeIds: range.strokeIds.slice(0, keep),
      baseIndex: range.baseIndex,
      finalIndex: historyIndex,
    });
  }
  return next;
}

export function studioRetainedStrokeRealtimeIdsForUndo(
  ranges: readonly StudioRetainedStrokeRealtimeHistoryRange[],
  undoIndex: number,
): readonly string[] {
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index]!;
    if (undoIndex > range.baseIndex && undoIndex <= range.finalIndex) return range.strokeIds;
  }
  return [];
}

export function studioRetainedStrokeRealtimeIdsForRedo(
  ranges: readonly StudioRetainedStrokeRealtimeHistoryRange[],
  historyIndex: number,
  nextIndex: number,
): readonly string[] {
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index]!;
    if (
      historyIndex >= range.baseIndex
      && nextIndex > historyIndex
      && nextIndex <= range.finalIndex
    ) return range.strokeIds;
  }
  return [];
}

type MutableRef<T> = { current: T };

type StudioRetainedStrokeUndoContext = {
  pending: MutableRef<StudioRetainedStrokeQueuedBatch | null>;
  undone: MutableRef<StudioRetainedStrokeUndoneBatch | null>;
  getPages: () => readonly PageState[];
  getHistoryIndex: () => number;
  isBlocked: (batch: StudioRetainedStrokeQueuedBatch) => boolean;
  publish: (before: readonly PageState[], after: readonly PageState[]) => boolean;
  onUndone: (batch: StudioRetainedStrokeCommitBatch) => void;
  persist: (pagesWithoutPending: readonly PageState[]) => void;
};

/** Replace the pending recovery snapshot after a successful Undo, before returning to input. */
export function undoStudioRetainedStrokeHistory(context: StudioRetainedStrokeUndoContext): boolean {
  const batch = context.pending.current;
  if (!batch || context.isBlocked(batch)) return false;
  const transition = retainedStrokeHistoryTransition(context.getPages(), batch);
  if (!transition || !context.publish(transition.withPending, transition.withoutPending)) {
    return false;
  }
  context.pending.current = null;
  if (batch.timer !== null) globalThis.clearTimeout(batch.timer);
  const taken = { pageId: batch.pageId, strokes: batch.strokes, retryCount: batch.retryCount };
  context.undone.current = { ...taken, historyIndex: context.getHistoryIndex() };
  // The host advances its edit generation even if the earlier pointerup receipt is still pending.
  // With an empty pending fingerprint on both sides, that generation is the only dirty signal.
  context.onUndone(taken);
  context.persist(transition.withoutPending);
  return true;
}

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
