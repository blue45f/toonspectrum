import { describe, expect, it } from "vitest";

import { getWebtoonPosePresetById } from "../scene-3d/studio-3d-advanced-poses-library";
import { convertWebtoonPresetToVrmPoseBones } from "./studio-vrm-webtoon-preset-adapter";

describe("웹툰 포즈 → VRM 휴머노이드 본 어댑터", () => {
  it("관절명을 그대로 쓰고 deg를 rad로 변환한다", () => {
    const preset = getWebtoonPosePresetById("action-hero-landing");
    expect(preset).toBeDefined();
    const bones = convertWebtoonPresetToVrmPoseBones(preset!);

    const spine = bones.spine?.rotation;
    expect(spine).toBeDefined();
    expect(spine![0]).toBeCloseTo((20 * Math.PI) / 180, 10);
    expect(spine![1]).toBe(0);
    expect(spine![2]).toBe(0);

    // VRM 휴머노이드 본명을 그대로 사용한다(hips 포함).
    expect(bones.hips?.rotation?.[0]).toBeCloseTo((35 * Math.PI) / 180, 10);
  });

  it("VRM 본이 아닌 관절명은 버린다", () => {
    const bones = convertWebtoonPresetToVrmPoseBones({
      id: "test",
      name: "테스트",
      category: "action",
      gender: "any",
      figures: 1,
      tags: [],
      description: "",
      iconHint: "Zap",
      jointRotations: [
        { joint: "head", rotationEulerDeg: [10, 0, 0] },
        { joint: "not-a-vrm-bone", rotationEulerDeg: [10, 20, 30] },
      ],
    });
    expect(bones.head?.rotation?.[0]).toBeCloseTo((10 * Math.PI) / 180, 10);
    expect("not-a-vrm-bone" in bones).toBe(false);
  });
});
