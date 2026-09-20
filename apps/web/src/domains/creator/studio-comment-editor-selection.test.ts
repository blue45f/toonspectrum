import { describe, expect, it, vi } from "vitest";

import { selectStudioEditorCommentTarget, studioEditorTargetForComment,
  type StudioEditorCommentSelectionPort } from "./studio-comment-editor-selection";

function fixture() {
  let pageId = "first";
  const port: StudioEditorCommentSelectionPort = {
    getPages: () => [{ id: "first", elements: [] }, { id: "second", elements: [{ id: "cut", type: "frame" }, { id: "image", type: "image" }] }],
    getMasterElements: () => [{ id: "logo", type: "image" }],
    getCurrentPageId: () => pageId,
    changePage: vi.fn((next) => { pageId = next; return true; }),
    applySelection: vi.fn(), onMissing: vi.fn(),
  };
  return { port };
}
describe("real editor comment selection adapter", () => {
  it("changes page first and selects the exact cut only after transport confirms success", () => {
    const { port } = fixture();
    vi.mocked(port.applySelection).mockImplementation((value) => {
      expect(port.getCurrentPageId()).toBe("second"); expect(value.elementId).toBe("cut");
    });
    expect(selectStudioEditorCommentTarget(studioEditorTargetForComment({ type: "frame", pageId: "second", frameId: "cut" }), port)).toBe(true);
    expect(port.applySelection).toHaveBeenCalledOnce();
  });
  it.each(["rejected", "unconfirmed"])("preserves existing selection when an ordinary comment page change is %s", (mode) => {
    const { port } = fixture(); vi.mocked(port.changePage).mockReturnValue(mode === "unconfirmed");
    expect(selectStudioEditorCommentTarget(studioEditorTargetForComment({ type: "frame", pageId: "second", frameId: "cut" }), port)).toBe(false);
    expect(port.applySelection).not.toHaveBeenCalled(); expect(port.onMissing).not.toHaveBeenCalled();
  });
  it("does not move for missing/ambiguous/wrong-kind targets", () => {
    const { port } = fixture();
    expect(selectStudioEditorCommentTarget({ pageId: "missing" }, port)).toBe(false);
    expect(selectStudioEditorCommentTarget({ pageId: "second", elementId: "image", frame: true }, port)).toBe(false);
    expect(port.changePage).not.toHaveBeenCalled(); expect(port.applySelection).not.toHaveBeenCalled();
  });
  it("selects explicit master elements and clears other selection modes through one application", () => {
    const { port } = fixture();
    expect(selectStudioEditorCommentTarget({ pageId: "second", elementId: "logo", master: true }, port)).toBe(true);
    expect(port.applySelection).toHaveBeenCalledWith({ elementId: "logo", master: true, point: null });
  });
  it("retains normalized ordinary comment points and never applies late selection after an authority change", () => {
    const { port } = fixture();
    expect(selectStudioEditorCommentTarget(studioEditorTargetForComment({ type: "point", pageId: "second", x: 0.25, y: 0.5 }), port)).toBe(true);
    expect(port.applySelection).toHaveBeenCalledWith({ elementId: null, master: false, point: { pageId: "second", x: 0.25, y: 0.5 } });
    vi.mocked(port.applySelection).mockClear();
    const current = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(selectStudioEditorCommentTarget({ pageId: "second", elementId: "cut" }, port, current)).toBe(false);
    expect(port.applySelection).not.toHaveBeenCalled();
  });
});
