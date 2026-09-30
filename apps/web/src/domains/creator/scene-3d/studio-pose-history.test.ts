import { describe, expect, it } from "vitest";

import {
  canRedoStudioPose,
  canUndoStudioPose,
  createStudioPoseHistory,
  describeStudioPoseHistory,
  recordStudioPoseHistory,
  redoStudioPoseHistory,
  STUDIO_POSE_HISTORY_MAX_DEPTH,
  undoStudioPoseHistory,
  type StudioPoseHistory,
} from "./studio-pose-history";
import {
  createStudioMannequinRestPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

function poseWithSpine(xDeg: number): StudioMannequinPose {
  const rad = (xDeg * Math.PI) / 180;
  return { joints: { spine: [rad, 0, 0] }, pelvisOffset: [0, 0, 0] };
}

describe("studio-pose-history (되돌리기/다시실행)", () => {
  it("빈 히스토리는 되돌리기·다시실행이 불가능하다", () => {
    const history = createStudioPoseHistory();
    expect(canUndoStudioPose(history)).toBe(false);
    expect(canRedoStudioPose(history)).toBe(false);
    expect(undoStudioPoseHistory(history, createStudioMannequinRestPose())).toBeNull();
    expect(redoStudioPoseHistory(history, createStudioMannequinRestPose())).toBeNull();
  });

  it("기록 → 되돌리기 → 다시실행 순서로 포즈가 오간다", () => {
    const rest = createStudioMannequinRestPose();
    const poseA = poseWithSpine(10);
    const poseB = poseWithSpine(30);

    let history: StudioPoseHistory = createStudioPoseHistory();
    history = recordStudioPoseHistory(history, rest);
    history = recordStudioPoseHistory(history, poseA);

    const undone = undoStudioPoseHistory(history, poseB);
    expect(undone).not.toBeNull();
    expect(undone?.pose).toBe(poseA);
    expect(canUndoStudioPose(undone!.history)).toBe(true);
    expect(canRedoStudioPose(undone!.history)).toBe(true);

    const undone2 = undoStudioPoseHistory(undone!.history, undone!.pose);
    expect(undone2?.pose).toBe(rest);
    expect(canUndoStudioPose(undone2!.history)).toBe(false);

    const redone = redoStudioPoseHistory(undone2!.history, undone2!.pose);
    expect(redone?.pose).toBe(poseA);
    const redone2 = redoStudioPoseHistory(redone!.history, redone!.pose);
    expect(redone2?.pose).toBe(poseB);
    expect(canRedoStudioPose(redone2!.history)).toBe(false);
  });

  it("새 결정을 내리면 다시실행 스택이 비워진다", () => {
    const rest = createStudioMannequinRestPose();
    const poseA = poseWithSpine(10);
    const poseB = poseWithSpine(20);
    const poseC = poseWithSpine(40);

    let history = recordStudioPoseHistory(createStudioPoseHistory(), rest);
    const undone = undoStudioPoseHistory(history, poseA);
    expect(canRedoStudioPose(undone!.history)).toBe(true);

    history = recordStudioPoseHistory(undone!.history, poseB);
    expect(canRedoStudioPose(history)).toBe(false);
    expect(canUndoStudioPose(history)).toBe(true);
    // 다시실행 스택이 비워졌으므로 poseA 로는 돌아갈 수 없다.
    const back = undoStudioPoseHistory(history, poseC);
    expect(back?.pose).toBe(poseB);
  });

  it(`최대 ${STUDIO_POSE_HISTORY_MAX_DEPTH}개를 넘지 않는다`, () => {
    let history = createStudioPoseHistory();
    for (let i = 0; i < STUDIO_POSE_HISTORY_MAX_DEPTH + 10; i += 1) {
      history = recordStudioPoseHistory(history, poseWithSpine(i));
    }
    const summary = describeStudioPoseHistory(history);
    expect(summary.undoCount).toBe(STUDIO_POSE_HISTORY_MAX_DEPTH);
    expect(summary.canUndo).toBe(true);
    expect(summary.canRedo).toBe(false);
    expect(summary.redoCount).toBe(0);
  });

  it("상태 요약을 돌려준다", () => {
    const rest = createStudioMannequinRestPose();
    let history = recordStudioPoseHistory(createStudioPoseHistory(), rest);
    expect(describeStudioPoseHistory(history)).toEqual({
      canUndo: true,
      canRedo: false,
      undoCount: 1,
      redoCount: 0,
    });
  });
});
