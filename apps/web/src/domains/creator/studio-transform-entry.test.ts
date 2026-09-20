import { beforeEach, describe, expect, it, vi } from "vitest";

import { enterStudioSelectionTransform, type StudioTransformEntryContext } from "./studio-transform-entry";

const focus = vi.hoisted(() => vi.fn());
vi.mock("./studio-inspector-focus", () => ({ requestStudioInspectorFocus: focus }));
beforeEach(() => vi.clearAllMocks());
function context(patch: Partial<StudioTransformEntryContext> = {}): StudioTransformEntryContext {
  return { selected: { type: "draw" }, selectedCount: 1, selectionComplete: true,
    selectionLocked: false, activeSurfaceReviewLocked: false, selectedImageMutationLocked: false,
    pixelSelectionUsable: false, isMobile: false, disarmAllPixelTools: vi.fn(),
    setTool: vi.fn(), setMenu: vi.fn(), setError: vi.fn(), announceDrawingShortcut: vi.fn(),
    openInspectorRoute: vi.fn(), preparePixelTarget: vi.fn(() => true), selectWholePixelLayer: vi.fn(), ...patch };
}
describe("selection transform entry", () => {
  it.each(["draw", "image", "text", "bubble", "shape"])("opens precise object controls for %s without rasterizing", (type) => {
    const value = context({ selected: { type } });
    enterStudioSelectionTransform(value);
    expect(value.openInspectorRoute).toHaveBeenCalledWith({ primary: "properties", image: "transform" }, null);
    expect(focus).toHaveBeenCalledWith("selection.geometry");
    expect(value.preparePixelTarget).not.toHaveBeenCalled();
  });
  it("keeps pixel-region edits on the existing raster preparation path", () => {
    const value = context({ selected: { type: "image" }, pixelSelectionUsable: true });
    enterStudioSelectionTransform(value);
    expect(value.preparePixelTarget).toHaveBeenCalledOnce();
    expect(value.selectWholePixelLayer).not.toHaveBeenCalled();
    expect(value.openInspectorRoute).toHaveBeenCalledWith({ primary: "properties", image: "retouch" }, null);
  });
  it.each([
    { selectionLocked: true }, { activeSurfaceReviewLocked: true },
    { selectionComplete: false }, { selectedImageMutationLocked: true },
  ])("rejects unavailable targets without mutating or silently switching targets", (patch) => {
    const value = context(patch); enterStudioSelectionTransform(value);
    expect(value.setError).toHaveBeenCalledOnce();
    expect(value.setTool).not.toHaveBeenCalled();
    expect(value.preparePixelTarget).not.toHaveBeenCalled();
    expect(value.openInspectorRoute).not.toHaveBeenCalled();
  });
  it("routes multiple objects to common geometry and respects the mobile sheet", () => {
    const value = context({ selected: null, selectedCount: 2, isMobile: true });
    enterStudioSelectionTransform(value);
    expect(value.openInspectorRoute).toHaveBeenCalledWith({ primary: "properties", image: "transform" }, "props");
    expect(value.selectWholePixelLayer).not.toHaveBeenCalled();
  });
  it("does nothing when raster target preparation refuses admission", () => {
    const value = context({ selected: null, selectedCount: 0, preparePixelTarget: vi.fn(() => false) });
    enterStudioSelectionTransform(value);
    expect(value.selectWholePixelLayer).not.toHaveBeenCalled();
    expect(value.openInspectorRoute).not.toHaveBeenCalled();
  });
});
