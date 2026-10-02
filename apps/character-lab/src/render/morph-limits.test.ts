import { describe, expect, it } from "vitest";

import { ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS, describeMorphTextureMode, morphTextureRequirement } from "./morph-limits";

import type { MorphManagerFacts } from "./morph-limits";

const LIMITS = { maxTextureSize: 4096, maxArrayLayers: 128 };
const EMPTY = "morph 타깃이 있는 메시가 없습니다.";

function manager(overrides: Partial<MorphManagerFacts> = {}): MorphManagerFacts {
  return { name: "head", targetCount: 54, vertexCount: 3000, supportsNormals: true, usingTexture: true, activeTargets: 2, ...overrides };
}

describe("morph-limits", () => {
  it("텍스처 크기: 정점 × 스트라이드가 한 행을 넘으면 행이 늘고 층 = 타깃 수다", () => {
    const small = morphTextureRequirement(manager(), LIMITS);
    expect(small).toMatchObject({ layers: 54, width: 4096, height: 2, fitsLayers: true });
    expect(small.bytes).toBe(4096 * 2 * 54 * 16);
    const noNormals = morphTextureRequirement(manager({ supportsNormals: false, vertexCount: 1000 }), LIMITS);
    expect(noNormals).toMatchObject({ width: 1000, height: 1 });
  });

  it("매니저가 없으면 꺼짐과 사유", () => {
    expect(describeMorphTextureMode([], LIMITS, EMPTY)).toEqual({ status: "off", reasonKo: EMPTY });
  });

  it("머리 54 타깃은 층 한계 128 안이라 텍스처 모드 활성으로 규모를 보고한다", () => {
    const state = describeMorphTextureMode([manager()], LIMITS, EMPTY);
    expect(state.status).toBe("active");
    expect(state.detail).toContain("텍스처 모드");
    expect(state.detail).toContain("최대 타깃 54개(한계 128층)");
    expect(state.detail).toContain("4096×2×54층");
  });

  it("타깃 수가 층 한계를 넘어 attribute 모드로 내려가면 사유와 8개 제한, 무시되는 활성 수를 한글로 알린다", () => {
    const state = describeMorphTextureMode([manager({ name: "huge", targetCount: 300, usingTexture: false, activeTargets: 11 })], LIMITS, EMPTY);
    expect(state.status).toBe("unavailable");
    expect(state.reasonKo).toContain("huge(300개)");
    expect(state.reasonKo).toContain("층 한계(128층)를 넘어");
    expect(state.reasonKo).toContain(`${ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS}개까지만`);
    expect(state.reasonKo).toContain("활성 타깃 11개 중 3개는 무시됩니다");
  });

  it("층 한계 이내인데 attribute 모드면 엔진 미지원을 원인으로 보고한다", () => {
    const state = describeMorphTextureMode([manager({ usingTexture: false, activeTargets: 1 })], LIMITS, EMPTY);
    expect(state.status).toBe("unavailable");
    expect(state.reasonKo).toContain("엔진이 morph 텍스처 저장을 지원하지 않습니다");
    expect(state.reasonKo).not.toContain("무시됩니다");
  });

  it("여러 매니저 중 일부만 attribute 모드여도 불가로 보고하고 이름은 3개까지만 나열한다", () => {
    const managers = ["a", "b", "c", "d", "e"].map((name) => manager({ name, usingTexture: false, targetCount: 200 }));
    const state = describeMorphTextureMode([manager(), ...managers], LIMITS, EMPTY);
    expect(state.status).toBe("unavailable");
    expect(state.reasonKo).toContain("a(200개), b(200개), c(200개) 외 2개");
  });
});
