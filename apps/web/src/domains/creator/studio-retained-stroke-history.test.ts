import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./live/studio-crdt-document";
import { publishStudioCrdtDrawGraphDiff } from "./live/studio-crdt-scene-publisher";
import {
  discardStudioRetainedStrokeRedo,
  publishStudioRetainedStrokeHistory,
  restoreStudioRetainedStrokeCommitBatch,
  resumeStudioRetainedStrokeHistory,
  type StudioRetainedStrokeQueuedBatch,
  type StudioRetainedStrokeUndoneBatch,
} from "./studio-retained-stroke-history";

import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

const eraser: DrawEl = {
  id: "eraser", type: "draw", mode: "eraser", kind: "freehand", brush: "standard-eraser",
  points: [10, 10, 50, 50], pressures: [0.5, 0.5], stroke: "#000000", strokeWidth: 20,
};
const blank: PageState[] = [{ id: "page", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 }];
const pending = { pageId: "page", strokes: [eraser] };
const documents: StudioCrdtDocument[] = [];

afterEach(() => {
  for (const document of documents.splice(0)) document.destroy();
  vi.useRealTimers();
});

function retainedRedoFixture(strokes: DrawEl[] = [eraser]) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "queueMicrotask"] });
  const document = new StudioCrdtDocument();
  documents.push(document);
  const state = {
    pages: [...blank, { ...blank[0]!, id: "other-page" }],
    activePageId: "page",
    historyIndex: 3,
    blocked: false,
  };
  const pendingBatch = { pageId: "page", strokes };
  const undone = { current: {
    ...pendingBatch, retryCount: 0, historyIndex: state.historyIndex,
  } as StudioRetainedStrokeUndoneBatch | null };
  const queued = { current: null as StudioRetainedStrokeQueuedBatch | null };
  publishStudioCrdtDrawGraphDiff(document, blank, [{ ...blank[0]!, elements: strokes }]);
  const publish = vi.fn((before: readonly PageState[], after: readonly PageState[]) => {
    publishStudioCrdtDrawGraphDiff(document, before, after, { registerNewDraws: false });
    return true;
  });
  publishStudioRetainedStrokeHistory(state.pages, pendingBatch, "undo", publish);
  publish.mockClear();
  const context = {
    undone,
    pending: queued,
    getHistoryIndex: () => state.historyIndex,
    getPages: () => state.pages,
    getActivePageId: () => state.activePageId,
    isBlocked: () => state.blocked,
    flushPending: vi.fn(() => false),
    publish,
    onResumed: vi.fn(),
    showOverlay: vi.fn(),
    showEraser: vi.fn(),
    persist: vi.fn(),
    retryDelayMs: 500,
    maxRetries: 4,
  };
  return { state, undone, queued, document, context };
}

describe("retained stroke history", () => {
  it("tombstones deferred live ink on Undo, restores it on Redo, and keeps it deleted on a new edit", () => {
    const document = new StudioCrdtDocument();
    const livePages = [{ ...blank[0]!, elements: [eraser] }];
    publishStudioCrdtDrawGraphDiff(document, blank, livePages);
    const publish = (before: readonly PageState[], after: readonly PageState[]) => {
      publishStudioCrdtDrawGraphDiff(document, before, after, { registerNewDraws: false });
      return true;
    };
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(true);
    expect(document.getStroke("eraser", true)?.deleted).toBe(true);
    expect(publishStudioRetainedStrokeHistory(blank, pending, "redo", publish)).toBe(true);
    expect(document.getStroke("eraser", true)?.deleted).toBe(false);
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(true);
    const next = { ...eraser, id: "next", mode: "pen" as const, brush: "pen" as const };
    publishStudioCrdtDrawGraphDiff(document, blank, [{ ...blank[0]!, elements: [next] }]);
    expect(document.getStrokes().map(stroke => stroke.id)).toEqual(["next"]);
    expect(blank[0]!.elements).toEqual([]);
    expect(pending.strokes).toEqual([eraser]);
    document.destroy();
  });

  it("preserves the pending batch when its page or publication is unavailable", () => {
    const publish = vi.fn(() => false);
    expect(publishStudioRetainedStrokeHistory([], pending, "undo", publish)).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(false);
    expect(pending.strokes).toEqual([eraser]);
  });

  it("restores the original page's CRDT and queue after switching pages, even if canonical flush fails", () => {
    const { state, undone, queued, document, context } = retainedRedoFixture();
    state.activePageId = "other-page";
    const batch = undone.current!;
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(true);
    expect(document.getStroke(eraser.id)).toMatchObject({ pageId: "page", deleted: false });
    expect(queued.current).toMatchObject({ pageId: "page", retryCount: 1 });
    expect(queued.current!.strokes).toBe(batch.strokes);
    expect(undone.current).toBeNull();
    expect(context.flushPending).toHaveBeenCalledTimes(1);
    expect(context.showOverlay).not.toHaveBeenCalled();
    expect(context.showEraser).not.toHaveBeenCalled();
    expect(context.onResumed).toHaveBeenCalledOnce();
    expect(context.persist).not.toHaveBeenCalled();
    vi.runAllTicks();
    expect(context.persist).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(500);
    expect(context.flushPending).toHaveBeenCalledTimes(2);
    expect(queued.current!.strokes).toBe(batch.strokes);
    expect(state.pages[1]!.elements).toEqual([]);
  });

  it("restores eraser and overlay presentation only on the owning active page, once", () => {
    const pencil: DrawEl = { ...eraser, id: "pencil", mode: "pen", brush: "pencil" };
    const { context, queued, document } = retainedRedoFixture([pencil, eraser]);
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(true);
    expect(context.showEraser).toHaveBeenCalledExactlyOnceWith(eraser);
    expect(context.showOverlay).toHaveBeenCalledExactlyOnceWith([pencil.id, eraser.id]);
    expect(document.getStrokes().map(stroke => stroke.id)).toEqual([pencil.id, eraser.id]);
    expect(context.flushPending).not.toHaveBeenCalled();
    expect(queued.current?.pageId).toBe("page");
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(false);
    expect(context.publish).toHaveBeenCalledOnce();
    expect(context.showEraser).toHaveBeenCalledOnce();
  });

  it("never resurrects ink when a pre-existing pending queue cannot flush", () => {
    const { undone, queued, document, context } = retainedRedoFixture();
    const batch = undone.current;
    const existing = { pageId: "other-page", strokes: [], retryCount: 2, timer: null };
    queued.current = existing;
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(false);
    expect(context.flushPending).toHaveBeenCalledOnce();
    expect(context.publish).not.toHaveBeenCalled();
    expect(document.getStroke(eraser.id, true)?.deleted).toBe(true);
    expect(undone.current).toBe(batch);
    expect(queued.current).toBe(existing);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["queue", "history", "batch", "blocked"])(
    "revalidates %s after a successful preparation flush",
    (change) => {
      const { state, undone, queued, context } = retainedRedoFixture();
      const existing = { ...pending, retryCount: 1, timer: null };
      queued.current = existing;
      context.flushPending.mockImplementation(() => {
        queued.current = change === "queue" ? existing : null;
        if (change === "history") state.historyIndex += 1;
        if (change === "batch") undone.current = { ...undone.current! };
        if (change === "blocked") state.blocked = true;
        return true;
      });
      expect(resumeStudioRetainedStrokeHistory(context)).toBe(false);
      expect(context.publish).not.toHaveBeenCalled();
      expect(context.onResumed).not.toHaveBeenCalled();
    },
  );

  it("uses the current post-flush snapshot when publishing the resumed batch", () => {
    const { state, queued, context } = retainedRedoFixture();
    queued.current = { pageId: "other-page", strokes: [], retryCount: 0, timer: null };
    context.flushPending.mockImplementation(() => {
      queued.current = null;
      state.pages = state.pages.map(page => ({ ...page, bg: "#ffddaa" }));
      return true;
    });
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(true);
    expect(context.publish.mock.calls[0]![0]).toBe(state.pages);
    expect(context.publish.mock.calls[0]![1][0]!.bg).toBe("#ffddaa");
  });

  it.each(["missing-page", "publication", "blocked", "history"])(
    "preserves Redo and avoids timers when %s prevents resurrection",
    (failure) => {
      const { state, undone, queued, document, context } = retainedRedoFixture();
      const batch = undone.current;
      if (failure === "missing-page") state.pages = [];
      if (failure === "publication") context.publish.mockReturnValue(false);
      if (failure === "blocked") state.blocked = true;
      if (failure === "history") state.historyIndex -= 1;
      expect(resumeStudioRetainedStrokeHistory(context)).toBe(false);
      expect(undone.current).toBe(batch);
      expect(queued.current).toBeNull();
      expect(document.getStroke(eraser.id, true)?.deleted).toBe(true);
      expect(context.onResumed).not.toHaveBeenCalled();
      expect(context.showOverlay).not.toHaveBeenCalled();
      expect(context.persist).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("invalidates a retained redo exactly once for a successful edit and cannot resurrect it later", () => {
    const { undone, document, context } = retainedRedoFixture();
    const discard = vi.fn();
    expect(discardStudioRetainedStrokeRedo(undone, discard)).toBe(true);
    expect(discard).toHaveBeenCalledExactlyOnceWith([eraser.id]);
    expect(discardStudioRetainedStrokeRedo(undone, discard)).toBe(false);
    expect(resumeStudioRetainedStrokeHistory(context)).toBe(false);
    expect(context.publish).not.toHaveBeenCalled();
    expect(document.getStroke(eraser.id, true)?.deleted).toBe(true);
  });

  it("retains the authoritative original-page payload after exhausting canonical commit retries", () => {
    const { undone, queued } = retainedRedoFixture();
    const batch = undone.current!;
    const flush = vi.fn(() => {
      restoreStudioRetainedStrokeCommitBatch(queued, queued.current!, retry);
      return false;
    });
    const retry = { flush, retryDelayMs: 500, maxRetries: 2 };
    restoreStudioRetainedStrokeCommitBatch(queued, batch, retry);
    expect(queued.current?.retryCount).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(queued.current).toMatchObject({ pageId: "page", retryCount: 3, timer: null });
    expect(queued.current!.strokes).toBe(batch.strokes);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
