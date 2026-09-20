import { describe, expect, it, vi } from "vitest";

import { studioReviewCaptureSaveNavigation } from "./studio-review-capture-navigation";
import { studioReviewCaptureHostContext } from "./useStudioReviewCaptureHost";

import type { StudioEditorMutationTicket } from "../studio-editor-scope";

describe("review capture host authority", () => {
  function fixture() {
    let ticket: StudioEditorMutationTicket = { authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 2 };
    const bindings = {
      studioAuthUserId: "actor", workId: "work", available: true,
      editorMountedRef: { current: true }, studioRevisionProjectGenerationRef: { current: 3 },
      drawingRef: { current: null as unknown }, pendingStrokeCommitsRef: { current: null as unknown },
      captureStudioMutationTicket: () => ticket, canApplyStudioMutation: vi.fn(() => true),
      getSnapshot: () => { throw new Error("Context checks must not read or capture the document"); },
      canvasWidth: 800, isDurableMask: () => false,
      save: vi.fn(async () => {}), captureAll: vi.fn(async () => []),
    };
    return { bindings, replace: (next: StudioEditorMutationTicket) => { ticket = next; } };
  }
  it("reads the current ticket and synchronous edit refs without waiting for a render", () => {
    const f = fixture();
    expect(studioReviewCaptureHostContext(f.bindings)).toEqual({
      workId: "work", scopeKey: '["actor","work"]', generation: "[1,2,3]", available: true,
    });
    f.replace({ authScopeKey: "next-actor", workId: "next-work", accessGeneration: 4, documentGeneration: 5 });
    f.bindings.studioRevisionProjectGenerationRef.current = 6;
    expect(studioReviewCaptureHostContext(f.bindings)).toEqual({
      workId: "next-work", scopeKey: '["next-actor","next-work"]', generation: "[4,5,6]", available: true,
    });
    expect(f.bindings.canApplyStudioMutation).toHaveBeenLastCalledWith({
      authScopeKey: "next-actor", workId: "next-work", accessGeneration: 4, documentGeneration: 5,
    });
    expect(f.bindings.captureAll).not.toHaveBeenCalled();
    expect(f.bindings.save).not.toHaveBeenCalled();
  });
  it.each(["availability", "unmounted", "authority", "drawing", "pending"])("denies capture on %s", (reason) => {
    const { bindings } = fixture();
    if (reason === "availability") bindings.available = false;
    if (reason === "unmounted") bindings.editorMountedRef.current = false;
    if (reason === "authority") bindings.canApplyStudioMutation.mockReturnValue(false);
    if (reason === "drawing") bindings.drawingRef.current = { id: "active" };
    if (reason === "pending") bindings.pendingStrokeCommitsRef.current = { pageId: "page", strokes: [] };
    expect(studioReviewCaptureHostContext(bindings).available).toBe(false);
  });
});

describe("review capture save navigation", () => {
  it("retains only the current-work success route while preserving options and history navigation", () => {
    const navigate = vi.fn();
    const preserving = studioReviewCaptureSaveNavigation(navigate, "work", true);
    preserving("/create/work");
    expect(navigate).not.toHaveBeenCalled();
    preserving("/create/new-work", { replace: true, state: { saved: true } });
    expect(navigate).toHaveBeenLastCalledWith("/create/new-work", { replace: true, state: { saved: true } });
    preserving({ pathname: "/recover" }, { preventScrollReset: true });
    expect(navigate).toHaveBeenLastCalledWith({ pathname: "/recover" }, { preventScrollReset: true });
    preserving(-1);
    expect(navigate).toHaveBeenLastCalledWith(-1);
    studioReviewCaptureSaveNavigation(navigate, "work")("/create/work");
    expect(navigate).toHaveBeenLastCalledWith("/create/work", undefined);
    studioReviewCaptureSaveNavigation(navigate, null, true)("/create/new-work");
    expect(navigate).toHaveBeenLastCalledWith("/create/new-work", undefined);
  });
});
