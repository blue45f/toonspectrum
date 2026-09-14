import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  clearStudioBg3dCommandHistory,
  commitStudioBg3dDebouncedHistory,
  commitStudioBg3dHistoryTransition,
  resetStudioBg3dCommandHistory,
  stepStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
} from "./studio-bg3d-history-command-adapter";

function snapshot(x: number) {
  return createStudioBg3dHistorySnapshot({
    primitives: [{
      id: "box-1",
      kind: "box",
      position: [x, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: "#ffffff",
    }],
    customModels: [],
    document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  });
}

function refs(): StudioBg3dHistoryCommandRefs {
  return {
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  };
}

describe("Studio BG3D legacy history command adapter", () => {
  it("mirrors reset, commit, undo and redo into existing refs", () => {
    const state = refs();
    resetStudioBg3dCommandHistory(state, snapshot(0));
    const receipt = commitStudioBg3dHistoryTransition(state, {
      before: snapshot(0),
      after: snapshot(2),
      commandId: "bg3d.object.move",
      label: "Move object",
      source: "canvas",
    });

    expect(receipt.canUndo).toBe(true);
    expect(state.historyRef.current).toHaveLength(2);
    expect(state.historyIndexRef.current).toBe(1);
    expect(stepStudioBg3dCommandHistory(state, "undo")?.state.primitives[0]?.position[0]).toBe(0);
    expect(state.historyIndexRef.current).toBe(0);
    expect(stepStudioBg3dCommandHistory(state, "redo")?.state.primitives[0]?.position[0]).toBe(2);
  });

  it("flushes a pending debounced edit before an immediate command", () => {
    const state = refs();
    resetStudioBg3dCommandHistory(state, snapshot(0));

    const receipt = commitStudioBg3dHistoryTransition(state, {
      before: snapshot(1),
      after: snapshot(2),
    });

    expect(receipt.pendingCommit?.status).toBe("applied");
    expect(state.historyRef.current).toHaveLength(3);
    expect(stepStudioBg3dCommandHistory(state, "undo")?.state.primitives[0]?.position[0]).toBe(1);
    expect(stepStudioBg3dCommandHistory(state, "undo")?.state.primitives[0]?.position[0]).toBe(0);
  });

  it("rebases camera/current anchor without adding a separate undo step", () => {
    const state = refs();
    resetStudioBg3dCommandHistory(state, snapshot(0));
    const rebased = {
      ...snapshot(0),
      document: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        camera: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
          position: [7, 4, 3] as const,
        },
      },
    };

    commitStudioBg3dDebouncedHistory(state, {
      rebasedCurrent: rebased,
      next: { ...snapshot(3), document: rebased.document },
    });

    expect(state.historyRef.current).toHaveLength(2);
    const undo = stepStudioBg3dCommandHistory(state, "undo");
    expect(undo?.state.primitives[0]?.position[0]).toBe(0);
    expect(undo?.state.document.camera.position).toEqual([7, 4, 3]);
  });

  it("invalidates the timeline and legacy refs together on clear", () => {
    const state = refs();
    resetStudioBg3dCommandHistory(state, snapshot(0));
    clearStudioBg3dCommandHistory(state);

    expect(state.historyCommandTimelineRef.current).toBeNull();
    expect(state.historyRef.current).toEqual([]);
    expect(state.historyIndexRef.current).toBe(-1);
  });
});
