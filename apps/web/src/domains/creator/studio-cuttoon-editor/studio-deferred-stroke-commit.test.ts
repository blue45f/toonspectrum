import { afterEach, describe, expect, it, vi } from "vitest";

import { captureLayerComp } from "../layer/studio-layer-comps";
import * as pagePayload from "../live/studio-crdt-page-payload";
import { STUDIO_CRDT_PAGE_MAX_BYTES } from "../live/studio-crdt-scene-schema";
import { withPageMeta } from "../studio-page-meta";
import { duplicateMirroredPage, duplicatePageState } from "../studio-pages";
import { serializeStudioProjectFile } from "../studio-project-file";
import { discardStudioRetainedStrokeRedo } from "../studio-retained-stroke-history";

import { createStudioDeferredStrokeCommitEngine } from "./studio-deferred-stroke-commit";

import type { DrawEl, El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { StudioRetainedStrokeUndoneBatch } from "../studio-retained-stroke-history";
import type { PendingStrokeCommitBatch, StudioDeferredStrokeCommitEngineContext } from "./studio-deferred-stroke-commit";

const stroke: DrawEl = {
  id: "undone", type: "draw", mode: "pen", kind: "freehand", brush: "pencil",
  points: [10, 10, 30, 30], stroke: "#000000", strokeWidth: 10,
};
const element: El = {
  id: "layer", type: "image", x: 0, y: 0, width: 20, height: 20,
  src: "data:image/png;base64,AA==", rotation: 0, opacity: 1,
};

function createEditor(page: PageState = {
  id: "A", elements: [element], bg: "#ffffff", bgGrad: null, canvasH: 1080,
}) {
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
    pendingStrokeCommitsRef: { current: null as PendingStrokeCommitBatch | null },
    flushPendingStrokeCommitsRef: { current: vi.fn(() => true) },
  };
  // Rendering/provider ports are intentionally absent: these page-history operations must not
  // depend on a mounted canvas or a GPU provider. All history and validation code is real.
  const engine = () => createStudioDeferredStrokeCommitEngine(state as unknown as StudioDeferredStrokeCommitEngineContext);
  return { state, engine, undone, discardPixels, page };
}

afterEach(() => { vi.restoreAllMocks(); });

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

describe("offline page changes preserve the layer comp wire limit", () => {
  function pageAtWireLimit(): PageState {
    const elements = Array.from({ length: 20 }, (_, index) => ({ ...element, id: `e${index}` }));
    const comp = {
      ...captureLayerComp("표시", elements.map(({ id }) => ({ id, visible: true, opacity: 1 })), "comp", 1),
      notes: "",
    };
    const page: PageState = {
      id: "A", elements, bg: "#ffffff", bgGrad: null, canvasH: 1080, note: "x", layerComps: [comp],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(pagePayload.studioPageToCrdtPage(page).payload)).byteLength;
    comp.notes = "x".repeat(STUDIO_CRDT_PAGE_MAX_BYTES - bytes);
    expect(new TextEncoder().encode(JSON.stringify(pagePayload.studioPageToCrdtPage(page).payload)).byteLength)
      .toBe(STUDIO_CRDT_PAGE_MAX_BYTES);
    expect(() => serializeStudioProjectFile({ version: 2, pagesList: [page] })).not.toThrow();
    return page;
  }

  function expectRejectedStatePreserved(editor: ReturnType<typeof createEditor>, history: PageState[][]) {
    expect(editor.state.pagesHistoryRef.current).toBe(history);
    expect(editor.state.pagesHiRef.current).toBe(0);
    expect(editor.undone.current).not.toBeNull();
    expect(editor.discardPixels).not.toHaveBeenCalled();
    expect(editor.state.onHistoryBranch).not.toHaveBeenCalled();
    expect(editor.state.setPagesHistory).not.toHaveBeenCalled();
    expect(editor.state.recordStudioHistoryTransition).not.toHaveBeenCalled();
    expect(editor.state.publishStudioCrdtSceneTransition).not.toHaveBeenCalled();
    expect(editor.state.invalidateAdvancedFillWork).not.toHaveBeenCalled();
    expect(editor.state.setError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("콤프 저장 용량"));
  }

  it.each(["duplicate", "mirror"] as const)("rejects %s when remapped UUIDs make the preset exceed its budget", (operation) => {
    const page = pageAtWireLimit();
    const editor = createEditor(page);
    const history = editor.state.pagesHistoryRef.current;
    const copy = operation === "duplicate"
      ? duplicatePageState(page, () => crypto.randomUUID())
      : duplicateMirroredPage(page, () => crypto.randomUUID(), 800);
    expect(copy.layerComps?.[0].layerStates[copy.elements[0].id]?.layerId).toBe(copy.elements[0].id);
    expect(() => pagePayload.studioPageToCrdtPage(copy)).toThrow(/8KiB/u);
    editor.state.pendingStrokeCommitsRef.current = { pageId: page.id, strokes: [stroke], retryCount: 0 };

    expect(editor.engine().commitPages([page, copy])).toBe(false);

    expectRejectedStatePreserved(editor, history);
    expect(editor.state.flushPendingStrokeCommitsRef.current).not.toHaveBeenCalled();
    expect(editor.state.pendingStrokeCommitsRef.current?.strokes).toEqual([stroke]);
  });

  it.each(["elements", "pages"] as const)("rejects a one-byte page note increase through %s before accepting history", (operation) => {
    const page = pageAtWireLimit();
    const editor = createEditor(page);
    const history = editor.state.pagesHistoryRef.current;
    editor.state.coalesceKeyRef.current = "existing-edit";
    const nextPages = withPageMeta([page], page.id, { note: "xy" });
    expect(() => pagePayload.studioPageToCrdtPage(nextPages[0])).toThrow(/8KiB/u);

    const accepted = operation === "elements"
      ? editor.engine().commit(page.elements, { note: "xy" })
      : editor.engine().commitPages(nextPages);

    expect(accepted).toBe(false);
    expectRejectedStatePreserved(editor, history);
    expect(editor.state.coalesceKeyRef.current).toBe("existing-edit");
    expect(page.note).toBe("x");
  });

  it.each(["elements", "pages"] as const)("accepts a valid correction or preset deletion through %s", (operation) => {
    for (const patch of [{ note: "x" }, { layerComps: [] }]) {
      const page = { ...pageAtWireLimit(), note: "xy" };
      const editor = createEditor(page);
      expect(() => pagePayload.studioPageToCrdtPage(page)).toThrow(/8KiB/u);

      const accepted = operation === "elements"
        ? editor.engine().commit(page.elements, patch)
        : editor.engine().commitPages([{ ...page, ...patch }]);

      expect(accepted).toBe(true);
      const acceptedPages = editor.state.pagesHistoryRef.current[editor.state.pagesHiRef.current];
      expect(() => serializeStudioProjectFile({ version: 2, pagesList: acceptedPages })).not.toThrow();
      expect(editor.undone.current).toBeNull();
      expect(editor.state.setError).not.toHaveBeenCalled();
    }
  });

  it.each(["elements", "coalesced", "pages"] as const)("does not serialize unchanged page metadata during a %s drawing edit", (operation) => {
    const page = pageAtWireLimit();
    const editor = createEditor(page);
    const serialize = vi.spyOn(pagePayload, "studioPageToCrdtPage");
    const nextElements = [...page.elements, stroke];

    if (operation === "elements") expect(editor.engine().commit(nextElements)).toBe(true);
    else if (operation === "coalesced") editor.engine().commitCoalesced(nextElements, "draw");
    else expect(editor.engine().commitPages([{ ...page, elements: nextElements }])).toBe(true);

    expect(serialize).not.toHaveBeenCalled();
    expect(editor.state.pagesHistoryRef.current[editor.state.pagesHiRef.current][0].elements).toContain(stroke);
    expect(editor.undone.current).toBeNull();
  });

  it("keeps the existing offline editing scope for pages without presets", () => {
    const editor = createEditor();
    expect(editor.engine().commit(editor.page.elements, { note: "x".repeat(9000) })).toBe(true);
    const current = editor.state.pagesHistoryRef.current[editor.state.pagesHiRef.current][0];
    expect(editor.engine().commitPages([{ ...current, note: `${current.note}x` }])).toBe(true);
    const accepted = editor.state.pagesHistoryRef.current[editor.state.pagesHiRef.current][0];
    expect(accepted.note).toHaveLength(9001);
    expect(accepted.layerComps).toBeUndefined();
    expect(editor.state.setError).not.toHaveBeenCalled();
  });
});
