import { describe, expect, it, vi } from "vitest";

import { discardStudioRetainedStrokeRedo } from "../studio-retained-stroke-history";

import { createStudioDeferredStrokeCommitEngine } from "./studio-deferred-stroke-commit";

import type { DrawEl, El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioRetainedStrokeUndoneBatch } from "../studio-retained-stroke-history";
import type { StudioDeferredStrokeCommitEngineContext } from "./studio-deferred-stroke-commit";

const stroke: DrawEl = {
  id: "undone", type: "draw", mode: "pen", kind: "freehand", brush: "pencil",
  points: [10, 10, 30, 30], stroke: "#000000", strokeWidth: 10,
};
const element: El = {
  id: "layer", type: "image", x: 0, y: 0, width: 20, height: 20,
  src: "data:image/png;base64,AA==", rotation: 0, opacity: 1,
};

function createEditor() {
  const page: PageState = { id: "A", elements: [element], bg: "#ffffff", bgGrad: null, canvasH: 1080 };
  const undone = { current: { pageId: "A", strokes: [stroke], retryCount: 0, historyIndex: 0 } as StudioRetainedStrokeUndoneBatch | null };
  const discardPixels = vi.fn();
  const state = {
    activePage: page, pages: [page], elements: page.elements,
    editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false },
    collaborationAccessRef: { current: { locked: false } },
    collaborationLockMessage: () => "locked", bg3dDccSourceRef: { current: null },
    masterEditMode: false, pageEditLocked: false, advancedFillApplyingRef: { current: false },
    invalidateAdvancedFillWork: vi.fn(() => true), coalesceKeyRef: { current: null as string | null },
    currentPageIdRef: { current: "A" }, pagesHiRef: { current: 0 }, pagesHistoryRef: { current: [[page]] },
    studioCrdtDocumentRef: { current: null }, studioCrdtSceneRuntimeRef: { current: null },
    publishStudioCrdtSceneTransition: vi.fn(() => true),
    onHistoryBranch: vi.fn(() => { discardStudioRetainedStrokeRedo(undone, discardPixels); }),
    recordStudioHistoryTransition: vi.fn(), recordStudioHistoryJournalPages: vi.fn(),
    noteStudioHistoryRetention: vi.fn(), setPagesHistory: vi.fn(), setPagesHi: vi.fn(),
    setError: vi.fn(), setSharedDocumentNotice: vi.fn(),
    drawingRef: { current: null }, drawingPointerTransportRef: { current: { getSession: () => null } },
    pendingStrokeCommitsRef: { current: null }, flushPendingStrokeCommitsRef: { current: () => true },
  };
  // Rendering/provider ports are intentionally absent: these page-history operations must not
  // depend on a mounted canvas or a GPU provider. All history and validation code is real.
  const engine = () => createStudioDeferredStrokeCommitEngine(state as unknown as StudioDeferredStrokeCommitEngineContext);
  return { state, engine, undone, discardPixels, page };
}

describe("accepted history branches consume retained stroke redo", () => {
  it.each(["elements", "coalesced", "pages"] as const)("consumes redo after a %s edit", (kind) => {
    const editor = createEditor();
    const changed = [{ ...element, opacity: 0.4 }];
    const engine = editor.engine();
    if (kind === "elements") expect(engine.commit(changed)).toBe(true);
    else if (kind === "coalesced") engine.commitCoalesced(changed, "opacity");
    else expect(engine.commitPages([{ ...editor.page, elements: changed }])).toBe(true);
    expect(editor.undone.current).toBeNull();
    expect(editor.discardPixels).toHaveBeenCalledExactlyOnceWith(["undone"]);
    expect(editor.state.pagesHistoryRef.current[editor.state.pagesHiRef.current]?.[0]?.elements[0]?.opacity).toBe(0.4);
  });

  it("also consumes redo when a coalesced edit replaces the current snapshot", () => {
    const editor = createEditor();
    editor.state.coalesceKeyRef.current = "opacity";
    editor.engine().commitCoalesced([{ ...element, opacity: 0.4 }], "opacity");
    expect(editor.state.pagesHistoryRef.current).toHaveLength(1);
    expect(editor.undone.current).toBeNull();
    expect(editor.discardPixels).toHaveBeenCalledExactlyOnceWith(["undone"]);
  });

  it.each(["save", "collaboration", "review", "publication"] as const)("preserves redo when %s rejects the edit", (gate) => {
    const editor = createEditor();
    if (gate === "save") editor.state.documentSaveInFlightRef.current = true;
    if (gate === "collaboration") editor.state.collaborationAccessRef.current.locked = true;
    if (gate === "review") editor.state.pageEditLocked = true;
    if (gate === "publication") editor.state.publishStudioCrdtSceneTransition.mockReturnValue(false);
    const before = editor.undone.current;
    const engine = editor.engine();
    expect(engine.commit([{ ...element, opacity: 0.4 }])).toBe(false);
    engine.commitCoalesced([{ ...element, opacity: 0.4 }], "opacity");
    expect(editor.undone.current).toBe(before);
    expect(editor.discardPixels).not.toHaveBeenCalled();
    expect(editor.state.onHistoryBranch).not.toHaveBeenCalled();
    expect(editor.state.pagesHistoryRef.current).toEqual([[editor.page]]);
  });
});
