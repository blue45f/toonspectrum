import { describe, expect, it } from "vitest";

import { getWebtoonPosePresetById } from "./studio-3d-advanced-poses-library";
import { convertWebtoonPresetToMannequinPose } from "./studio-webtoon-pose-mannequin-adapter";

describe("웹툰 포즈 → 데생 인형 포즈 어댑터", () => {
  it("hips를 pelvis로 매핑하고 deg를 rad로 변환한다", () => {
    const preset = getWebtoonPosePresetById("action-hero-landing");
    expect(preset).toBeDefined();
    const pose = convertWebtoonPresetToMannequinPose(preset!);

    // hips [35, 0, 0]deg → pelvis [35deg in rad, 0, 0]
    const pelvis = pose.joints.pelvis;
    expect(pelvis).toBeDefined();
    expect(pelvis![0]).toBeCloseTo((35 * Math.PI) / 180, 5);
    expect(pelvis![1]).toBe(0);
    expect(pelvis![2]).toBe(0);

    // 마네킹에 없는 관절("hips" 원본명)은 남지 않는다.
    expect("hips" in pose.joints).toBe(false);
  });

  it("모르는 관절명은 버리고 관절 한계 안으로 클램프한다", () => {
    const pose = convertWebtoonPresetToMannequinPose({
      id: "test",
      name: "테스트",
      category: "action",
      gender: "any",
      figures: 1,
      tags: [],
      description: "",
      iconHint: "Zap",
      jointRotations: [
        { joint: "leftUpperArm", rotationEulerDeg: [-400, 0, 0] },
        { joint: "not-a-joint", rotationEulerDeg: [10, 20, 30] },
      ],
    });
    // leftUpperArm 한계는 X [-172, 172] — -400deg는 클램프된다.
    const arm = pose.joints.leftUpperArm;
    expect(arm).toBeDefined();
    expect(arm![0]).toBeGreaterThanOrEqual((-172 * Math.PI) / 180 - 1e-9);
    expect("not-a-joint" in pose.joints).toBe(false);
  });

  it("골반 오프셋은 rest(0)를 유지한다", () => {
    const preset = getWebtoonPosePresetById("dramatic-kneeling-despair");
    const pose = convertWebtoonPresetToMannequinPose(preset!);
    expect(pose.pelvisOffset).toEqual([0, 0, 0]);
  });
});
