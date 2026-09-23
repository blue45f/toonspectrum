import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  applyAndCommitStudio3dGradeCommand,
  beginStudio3dGradeDocumentGesture,
  classifyStudio3dLightingGestureCommandId,
  commitGradeRoutedHistoryTransition,
  commitStudio3dGradeDocumentGesture,
  ensureStudio3dGradeHistory,
  stepUnifiedStudio3dHistory,
} from "./studio-bg3d-grade-history-bridge";
import {
  applyStudio3dLightingSettings,
  createStudio3dHistory,
  serializeStudio3dScene,
} from "./studio-bg3d-grade-plates";
import {
  resetStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
} from "./studio-bg3d-history-command-adapter";

function refs(): StudioBg3dHistoryCommandRefs {
  return {
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  };
}

function snap(document = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT) {
  return createStudioBg3dHistorySnapshot({
    primitives: [],
    customModels: [],
    document,
  });
}

describe("studio-bg3d-grade-history-bridge", () => {
  it("dual-writes grade past and adapter timeline for offered light commands", () => {
    const state = refs();
    const start = createStudio3dHistory();
    resetStudioBg3dCommandHistory(state, snap(start.scene));

    const first = applyAndCommitStudio3dGradeCommand({
      grade: start,
      refs: state,
      primitives: [],
      customModels: [],
      command: { id: "set-light", azimuth: 0.4, elevation: 0.6, intensity: 1.4 },
    });
    expect(first.receipt.canUndo).toBe(true);
    expect(first.grade.past).toHaveLength(1);
    expect(first.scene.lighting.key.intensity).toBeCloseTo(1.4);

    const second = applyAndCommitStudio3dGradeCommand({
      grade: first.grade,
      refs: state,
      primitives: [],
      customModels: [],
      command: { id: "set-fill-light", azimuth: -0.2, elevation: 0.3, intensity: 0.55 },
    });
    expect(second.grade.past).toHaveLength(2);

    const undone = stepUnifiedStudio3dHistory(state, second.grade, "undo");
    expect(undone.via).toBe("adapter");
    expect(undone.snapshot).not.toBeNull();
    expect(undone.grade.scene.lighting.fill.intensity).toBeCloseTo(start.scene.lighting.fill.intensity);
    expect(undone.grade.scene.lighting.key.intensity).toBeCloseTo(1.4);

    const redone = stepUnifiedStudio3dHistory(state, undone.grade, "redo");
    expect(redone.grade.scene.lighting.fill.intensity).toBeCloseTo(0.55);
  });

  it("keeps remove-prop grade stacks aligned when production after-snapshot differs in primitives", () => {
    const state = refs();
    const grade = ensureStudio3dGradeHistory(null, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
    resetStudioBg3dCommandHistory(state, snap());

    const before = snap();
    const afterDoc = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      lighting: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting,
        key: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting.key,
          intensity: 0.42,
        },
      },
    };
    const after = createStudioBg3dHistorySnapshot({
      primitives: [{
        id: "crate",
        kind: "box",
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: "#ffffff",
      }],
      customModels: [],
      document: afterDoc,
    });
    const committed = commitGradeRoutedHistoryTransition({
      grade,
      refs: state,
      before,
      after,
      commandIds: ["remove-prop"],
      label: "소품 제거",
    });
    expect(committed.grade.past).toHaveLength(1);
    expect(serializeStudio3dScene(committed.grade.scene)).toBe(serializeStudio3dScene(afterDoc));
    expect(committed.receipt.canUndo).toBe(true);

    const stepped = stepUnifiedStudio3dHistory(state, committed.grade, "undo");
    expect(stepped.via).toBe("adapter");
    expect(serializeStudio3dScene(stepped.grade.scene)).toBe(serializeStudio3dScene(before.document));
  });

  it("falls back to pure grade undo when the adapter timeline is empty", () => {
    const state = refs();
    let grade = createStudio3dHistory();
    grade = applyAndCommitStudio3dGradeCommand({
      grade,
      refs: state,
      primitives: [],
      customModels: [],
      command: { id: "set-camera", yaw: 0.5, pitch: -0.1, fov: 50 },
    }).grade;
    // Clear adapter only — grade past remains.
    state.historyCommandTimelineRef.current = null;
    state.historyRef.current = [];
    state.historyIndexRef.current = -1;

    const stepped = stepUnifiedStudio3dHistory(state, grade, "undo");
    expect(stepped.via).toBe("grade-only");
    expect(stepped.grade.past).toHaveLength(0);
    expect(stepped.grade.future).toHaveLength(1);
  });
});

describe("studio-bg3d-grade-history-bridge document gestures", () => {
  it("coalesces continuous light previews into one dual-write at commit", () => {
    const state = refs();
    const start = createStudio3dHistory();
    resetStudioBg3dCommandHistory(state, snap(start.scene));

    const gesture = beginStudio3dGradeDocumentGesture(null, {
      grade: start,
      beforeDocument: start.scene,
      primaryCommandId: "set-light",
    });
    // Intermediate preview documents are ignored until commit.
    const mid = applyStudio3dLightingSettings(start.scene, {
      key: { ...start.scene.lighting.key, intensity: 0.9 },
    });
    const end = applyStudio3dLightingSettings(mid, {
      key: { ...mid.lighting.key, intensity: 1.75 },
    });
    const stillOpen = beginStudio3dGradeDocumentGesture(gesture, {
      grade: start,
      beforeDocument: mid,
      primaryCommandId: "set-fill-light",
    });
    expect(stillOpen).toBe(gesture);
    expect(stillOpen.primaryCommandId).toBe("set-light");

    const committed = commitStudio3dGradeDocumentGesture({
      gesture,
      refs: state,
      primitives: [],
      customModels: [],
      afterDocument: end,
    });
    expect(committed).not.toBeNull();
    expect(committed!.grade.past).toHaveLength(1);
    expect(committed!.grade.scene.lighting.key.intensity).toBeCloseTo(1.75);
    expect(committed!.receipt.canUndo).toBe(true);

    const undone = stepUnifiedStudio3dHistory(state, committed!.grade, "undo");
    expect(undone.via).toBe("adapter");
    expect(undone.grade.scene.lighting.key.intensity).toBeCloseTo(start.scene.lighting.key.intensity);
  });

  it("classifies key vs fill lighting gestures", () => {
    const base = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
    const keyNext = applyStudio3dLightingSettings(base, {
      key: { ...base.lighting.key, intensity: 2 },
    });
    expect(classifyStudio3dLightingGestureCommandId(base, keyNext)).toBe("set-light");
    const fillNext = applyStudio3dLightingSettings(base, {
      fill: { ...base.lighting.fill, intensity: 0.2 },
    });
    expect(classifyStudio3dLightingGestureCommandId(base, fillNext)).toBe("set-fill-light");
  });
});
