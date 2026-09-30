import { describe, expect, it } from "vitest";

import {
  XR_VRM_EXPRESSION_PRESETS,
  XR_VRM_POSE_PRESETS,
  createXrVrmStaging,
  xrVrmBlendPose,
  xrVrmResolveExpression,
  xrVrmResolvePose,
  xrVrmStagePlacement,
} from "./xr-webtoon-vrm-staging";

describe("XR_VRM_POSE_PRESETS", () => {
  it("6종 포즈가 있고 한/영 레이블이 있다", () => {
    const ids = Object.keys(XR_VRM_POSE_PRESETS);
    expect(ids).toHaveLength(6);
    for (const preset of Object.values(XR_VRM_POSE_PRESETS)) {
      expect(preset.label.ko.length).toBeGreaterThan(0);
      expect(preset.label.en.length).toBeGreaterThan(0);
    }
  });
});

describe("xrVrmResolvePose", () => {
  it("생략된 관절은 중립으로 채운다", () => {
    const resolved = xrVrmResolvePose(XR_VRM_POSE_PRESETS.stand);
    expect(resolved.head).toEqual([0, 0, 0]);
    expect(resolved.hips).toEqual([0, 0, 0]);
  });

  it("앉기 포즈는 고관절이 접힌다", () => {
    const resolved = xrVrmResolvePose(XR_VRM_POSE_PRESETS.sit);
    expect(resolved.hips[0]).toBeLessThan(0);
    expect(resolved.upperLegL[0]).toBeGreaterThan(0);
  });
});

describe("xrVrmBlendPose", () => {
  it("t=0이면 a, t=1이면 b와 같다", () => {
    const a = XR_VRM_POSE_PRESETS.stand;
    const b = XR_VRM_POSE_PRESETS.bow;
    expect(xrVrmBlendPose(a, b, 0).spine).toEqual(xrVrmResolvePose(a).spine);
    expect(xrVrmBlendPose(a, b, 1).spine).toEqual(xrVrmResolvePose(b).spine);
  });

  it("t=0.5면 중간값이다", () => {
    const blended = xrVrmBlendPose(
      XR_VRM_POSE_PRESETS.stand,
      XR_VRM_POSE_PRESETS.bow,
      0.5,
    );
    const bowSpine = xrVrmResolvePose(XR_VRM_POSE_PRESETS.bow).spine[0];
    expect(blended.spine[0]).toBeCloseTo(bowSpine / 2, 6);
  });

  it("범위 밖 t는 클램프된다", () => {
    const b = XR_VRM_POSE_PRESETS.bow;
    expect(xrVrmBlendPose(XR_VRM_POSE_PRESETS.stand, b, 99).spine).toEqual(
      xrVrmResolvePose(b).spine,
    );
  });
});

describe("XR_VRM_EXPRESSION_PRESETS", () => {
  it("5종 표정이 있고 가중치가 0..1이다", () => {
    expect(Object.keys(XR_VRM_EXPRESSION_PRESETS)).toHaveLength(5);
    for (const preset of Object.values(XR_VRM_EXPRESSION_PRESETS)) {
      const resolved = xrVrmResolveExpression(preset);
      for (const w of [...Object.values(resolved.vrm1), ...Object.values(resolved.vrm0)]) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it("기쁨 표정은 happy 가중치가 있다", () => {
    const resolved = xrVrmResolveExpression(XR_VRM_EXPRESSION_PRESETS.happy);
    expect(resolved.vrm1.happy).toBe(1);
    expect(resolved.vrm0.joy).toBe(1);
  });
});

describe("xrVrmStagePlacement", () => {
  it("기본값은 중앙 배치다", () => {
    const p = xrVrmStagePlacement({});
    expect(p.x).toBe(0.5);
    expect(p.y).toBe(0.5);
    expect(p.mirrored).toBe(false);
  });

  it("범위를 벗어나면 클램프된다", () => {
    const p = xrVrmStagePlacement({ x: 99, scale: -1 });
    expect(p.x).toBe(1);
    expect(p.scale).toBe(0.1);
  });
});

describe("createXrVrmStaging", () => {
  it("유효한 명세를 만든다", () => {
    const staging = createXrVrmStaging({
      poseId: "wave",
      expressionId: "happy",
      placement: { x: 0.3, mirrored: true },
    });
    expect(staging.kind).toBe("toonstudio.xr-vrm-staging");
    expect(staging.poseId).toBe("wave");
    expect(staging.placement.x).toBe(0.3);
    expect(staging.placement.mirrored).toBe(true);
    expect(Object.isFrozen(staging)).toBe(true);
  });

  it("알 수 없는 포즈/표정은 에러다", () => {
    expect(() =>
      createXrVrmStaging({ poseId: "fly" as never, expressionId: "happy" }),
    ).toThrow();
    expect(() =>
      createXrVrmStaging({ poseId: "stand", expressionId: "sleepy" as never }),
    ).toThrow();
  });
});
