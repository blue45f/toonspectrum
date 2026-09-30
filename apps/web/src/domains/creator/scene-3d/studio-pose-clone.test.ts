import { describe, expect, it } from "vitest";

import {
  applyStudioMannequinPoseAngles,
  cloneStudioMannequinPose,
  extractStudioMannequinPoseAngles,
} from "./studio-pose-clone";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

const SAMPLE: StudioMannequinPose = {
  joints: { leftShoulder: [0.5, 0, 0], head: [0, 0.3, 0] },
  pelvisOffset: [0, 0.2, 0],
};

describe("studio pose clone", () => {
  it("복제본은 원본과 동등합니다", () => {
    expect(cloneStudioMannequinPose(SAMPLE)).toEqual(SAMPLE);
  });

  it("복제본 수정이 원본에 영향을 주지 않습니다", () => {
    const clone = cloneStudioMannequinPose(SAMPLE);
    // 깊은 복제 확인: 중첩 객체가 다른 참조여야 한다.
    expect(clone.joints).not.toBe(SAMPLE.joints);
    expect(clone.joints.leftShoulder).not.toBe(SAMPLE.joints.leftShoulder);
    expect(clone.pelvisOffset).not.toBe(SAMPLE.pelvisOffset);
    // 값은 동등해야 한다.
    expect(clone.joints.leftShoulder).toEqual([0.5, 0, 0]);
    expect(clone.pelvisOffset).toEqual([0, 0.2, 0]);
  });

  it("추출→적용 라운드트립이 동작합니다", () => {
    const angles = extractStudioMannequinPoseAngles(SAMPLE);
    const restored = applyStudioMannequinPoseAngles(angles, [0, 0.2, 0]);
    expect(restored).toEqual(SAMPLE);
    // 추출 결과가 원본과 다른 참조인지 확인합니다.
    expect(angles.head).not.toBe(SAMPLE.joints.head);
    expect(SAMPLE.joints.head).toEqual([0, 0.3, 0]);
  });

  it("빠진 관절은 생략되어 완전한 구조를 유지합니다", () => {
    const restored = applyStudioMannequinPoseAngles({ head: [0.1, 0, 0] });
    expect(restored.joints.head).toEqual([0.1, 0, 0]);
    expect(restored.joints.leftShoulder).toBeUndefined();
    expect(restored.pelvisOffset).toEqual([0, 0, 0]);
  });
});
