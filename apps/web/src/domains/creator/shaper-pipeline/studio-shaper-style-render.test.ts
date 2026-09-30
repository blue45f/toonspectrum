import { describe, expect, it } from "vitest";

import {
  STUDIO_SHAPER_POSE_PRESET_IDS,
  applyStudioShaperPosePreset,
} from "./studio-shaper-sketch-pipeline";
import {
  applyStudioStyleToPose,
  buildStudioRenderOutputSpec,
  createStudioStyleProfile,
  StudioStyleEthicsError,
} from "./studio-shaper-style-render";

import type { StudioStyleProfile } from "./studio-shaper-style-render";

function makeOwnedProfile(): StudioStyleProfile {
  return createStudioStyleProfile({
    source: "user-owned",
    referenceHashes: ["hash-work-1", "hash-work-2"],
    styleName: "나의 웹툰체",
    attribution: { ownerLabel: "© 김툰 (본인 작품)", workTitle: "별빛 고교" },
    userConfirmedOwnership: true,
  });
}

describe("createStudioStyleProfile (윤리 가드)", () => {
  it("본인 작품이면 프로필이 생성됩니다", () => {
    const profile = makeOwnedProfile();
    expect(profile.source).toBe("user-owned");
    expect(profile.profileId.startsWith("style-")).toBe(true);
    expect(profile.attribution.ownerLabel).toBe("© 김툰 (본인 작품)");
  });

  it("본인 작품이 아닌 source는 거부됩니다", () => {
    for (const source of ["licensed", "third-party", "unknown"] as const) {
      expect(() =>
        createStudioStyleProfile({
          source,
          referenceHashes: ["h1"],
          styleName: "남의 그림체",
          attribution: { ownerLabel: "© 타인" },
          userConfirmedOwnership: true,
        }),
      ).toThrowError(StudioStyleEthicsError);
    }
    try {
      createStudioStyleProfile({
        source: "third-party",
        referenceHashes: ["h1"],
        styleName: "남의 그림체",
        attribution: { ownerLabel: "© 타인" },
        userConfirmedOwnership: true,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as StudioStyleEthicsError).code).toBe("non-owned-source");
    }
  });

  it("본인 확인 없이는 거부됩니다", () => {
    expect(() =>
      createStudioStyleProfile({
        source: "user-owned",
        referenceHashes: ["h1"],
        styleName: "나의 웹툰체",
        attribution: { ownerLabel: "© 김툰 (본인 작품)" },
        userConfirmedOwnership: false,
      }),
    ).toThrowError(StudioStyleEthicsError);
  });

  it("출처 표시(ownerLabel) 없이는 거부됩니다", () => {
    try {
      createStudioStyleProfile({
        source: "user-owned",
        referenceHashes: ["h1"],
        styleName: "나의 웹툰체",
        attribution: { ownerLabel: "   " },
        userConfirmedOwnership: true,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as StudioStyleEthicsError).code).toBe("missing-attribution");
    }
  });

  it("참조 이미지 없이는 거부됩니다", () => {
    expect(() =>
      createStudioStyleProfile({
        source: "user-owned",
        referenceHashes: [],
        styleName: "나의 웹툰체",
        attribution: { ownerLabel: "© 김툰 (본인 작품)" },
        userConfirmedOwnership: true,
      }),
    ).toThrowError(StudioStyleEthicsError);
  });
});

describe("applyStudioStyleToPose", () => {
  it("5개 포즈에 걸쳐 line/tone 파라미터가 동일합니다", () => {
    const profile = makeOwnedProfile();
    const appliedList = STUDIO_SHAPER_POSE_PRESET_IDS.slice(0, 5).map((poseId) =>
      applyStudioStyleToPose(profile, {
        poseId,
        jointRotations: {},
        cameraAngleDeg: applyStudioShaperPosePreset(poseId).cameraAngleDeg,
        cameraElevationDeg: 0,
        lightDirection: [0.3, 1, 0.5],
      }),
    );
    const [first, ...rest] = appliedList;
    for (const applied of rest) {
      expect(applied.line).toEqual(first?.line);
      expect(applied.tone).toEqual(first?.tone);
      expect(applied.styleSeed).toBe(first?.styleSeed);
      expect(applied.profileId).toBe(profile.profileId);
    }
    // 포즈 식별은 유지됩니다.
    expect(new Set(appliedList.map((applied) => applied.poseId)).size).toBe(5);
  });

  it("프로필이 다르면 스타일 파라미터가 달라집니다", () => {
    const poseId = STUDIO_SHAPER_POSE_PRESET_IDS[0]!;
    const pose = {
      poseId,
      jointRotations: {},
      cameraAngleDeg: 0,
      cameraElevationDeg: 0,
      lightDirection: [0, 1, 0] as const,
    };
    const a = applyStudioStyleToPose(makeOwnedProfile(), pose);
    const b = applyStudioStyleToPose(
      createStudioStyleProfile({
        source: "user-owned",
        referenceHashes: ["hash-other"],
        styleName: "다른 스타일",
        attribution: { ownerLabel: "© 김툰 (본인 작품)" },
        userConfirmedOwnership: true,
      }),
      pose,
    );
    expect(b.styleSeed).not.toBe(a.styleSeed);
  });
});

describe("buildStudioRenderOutputSpec", () => {
  it("style 선택은 스타일 레이어만 포함합니다", () => {
    const profile = makeOwnedProfile();
    const applied = applyStudioStyleToPose(profile, {
      poseId: "standing-front",
      jointRotations: {},
      cameraAngleDeg: 0,
      cameraElevationDeg: 0,
      lightDirection: [0, 1, 0],
    });
    const spec = buildStudioRenderOutputSpec(profile, applied, "style");
    expect(spec.layers.map((layer) => layer.kind)).toEqual(["line", "tone"]);
    expect(spec.styleApplied).toBeDefined();
    expect(spec.ltOptions).toBeUndefined();
    expect(spec.attributionLabel).toContain("© 김툰 (본인 작품)");
    expect(spec.attributionLabel).toContain("별빛 고교");
  });

  it("both 선택은 스타일과 LT 레이어를 병행합니다", () => {
    const profile = makeOwnedProfile();
    const applied = applyStudioStyleToPose(profile, {
      poseId: "walking",
      jointRotations: {},
      cameraAngleDeg: 45,
      cameraElevationDeg: 5,
      lightDirection: [0, 1, 0],
    });
    const spec = buildStudioRenderOutputSpec(profile, applied, "both", {
      lt: { lineThreshold: 0.4, toneDensity: 0.7 },
    });
    expect(spec.layers).toHaveLength(4);
    expect(spec.styleApplied).toBeDefined();
    expect(spec.ltOptions).toMatchObject({ lineThreshold: 0.4, toneDensity: 0.7 });
  });

  it("lt 선택은 스타일 파라미터를 제외합니다", () => {
    const profile = makeOwnedProfile();
    const applied = applyStudioStyleToPose(profile, {
      poseId: "sitting",
      jointRotations: {},
      cameraAngleDeg: 30,
      cameraElevationDeg: 12,
      lightDirection: [0, 1, 0],
    });
    const spec = buildStudioRenderOutputSpec(profile, applied, "lt");
    expect(spec.styleApplied).toBeUndefined();
    expect(spec.ltOptions).toBeDefined();
  });
});
