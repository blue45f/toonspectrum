import { describe, expect, it } from "vitest";

import {
  applyStudioPoseIntensity,
  blendStudioMannequinPose,
  clampStudioPoseIntensity,
  STUDIO_POSE_INTENSITY_MAX,
  STUDIO_POSE_INTENSITY_MIN,
} from "./studio-pose-intensity";
import {
  createStudioMannequinRestPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

const SAMPLE: StudioMannequinPose = {
  joints: {
    leftShoulder: [0.5, 0, 0],
    head: [0, 0.3, 0],
  },
  pelvisOffset: [0, 0.2, 0],
};

describe("studio pose intensity", () => {
  it("강도는 0~100으로 클램프됩니다", () => {
    expect(clampStudioPoseIntensity(150)).toBe(STUDIO_POSE_INTENSITY_MAX);
    expect(clampStudioPoseIntensity(-10)).toBe(STUDIO_POSE_INTENSITY_MIN);
    expect(clampStudioPoseIntensity(Number.NaN)).toBe(0);
    expect(STUDIO_POSE_INTENSITY_MIN).toBe(0);
    expect(STUDIO_POSE_INTENSITY_MAX).toBe(100);
  });

  it("0%면 중립 포즈와 일치합니다", () => {
    const result = applyStudioPoseIntensity(SAMPLE, 0);
    expect(result).toEqual(createStudioMannequinRestPose());
  });

  it("100%면 프리셋과 일치합니다", () => {
    const result = applyStudioPoseIntensity(SAMPLE, 100);
    expect(result.joints.leftShoulder).toEqual([0.5, 0, 0]);
    expect(result.joints.head).toEqual([0, 0.3, 0]);
    expect(result.pelvisOffset).toEqual([0, 0.2, 0]);
  });

  it("50%면 중립과 프리셋의 중간값입니다", () => {
    const result = applyStudioPoseIntensity(SAMPLE, 50);
    expect(result.joints.leftShoulder?.[0]).toBeCloseTo(0.25, 10);
    expect(result.joints.head?.[1]).toBeCloseTo(0.15, 10);
    expect(result.pelvisOffset[1]).toBeCloseTo(0.1, 10);
  });

  it("blend는 한쪽에만 있는 관절을 중립으로 간주합니다", () => {
    const a: StudioMannequinPose = { joints: { head: [0.4, 0, 0] }, pelvisOffset: [0, 0, 0] };
    const b: StudioMannequinPose = { joints: {}, pelvisOffset: [0, 0, 0] };
    const mid = blendStudioMannequinPose(a, b, 0.5);
    expect(mid.joints.head?.[0]).toBeCloseTo(0.2, 10);
  });

  it("t가 범위를 벗어나면 클램프됩니다", () => {
    const mid = blendStudioMannequinPose(createStudioMannequinRestPose(), SAMPLE, 2);
    expect(mid.joints.leftShoulder).toEqual([0.5, 0, 0]);
  });
});
