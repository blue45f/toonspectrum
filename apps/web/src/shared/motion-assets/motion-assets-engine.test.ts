import { describe, expect, it, vi } from "vitest";

import {
  easeInOutQuad,
  easeOutCubic,
  isLowPowerEnvironment,
  motionAssetClass,
  MOTION_ASSET_SIZES,
  prefersReducedMotion,
  resolveAssetSize,
} from "./motion-assets-engine";
import {
  getMotionAssetLabels,
  normalizeMotionAssetLang,
} from "./motion-assets-labels";

describe("prefersReducedMotion", () => {
  it("matchMedia가 없으면 false", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("reduce 설정이면 true", () => {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({ matches: query.includes("reduce"), media: query }),
    });
    expect(prefersReducedMotion()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("no-preference면 false", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false, media: "" }) });
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("isLowPowerEnvironment", () => {
  it("navigator가 없으면 false", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isLowPowerEnvironment()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("코어가 2개 이하면 true", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
    expect(isLowPowerEnvironment()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("고성능이면 false", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 8, deviceMemory: 8 });
    expect(isLowPowerEnvironment()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("easing", () => {
  it("easeOutCubic 경계값", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 3);
  });

  it("easeInOutQuad 경계값", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.5)).toBe(0.5);
  });
});

describe("사이즈/클래스", () => {
  it("프리셋 해석", () => {
    expect(resolveAssetSize("xs")).toBe(MOTION_ASSET_SIZES.xs);
    expect(resolveAssetSize("xl")).toBe(MOTION_ASSET_SIZES.xl);
    expect(resolveAssetSize(64)).toBe(64);
  });

  it("motionAssetClass", () => {
    expect(motionAssetClass()).toBe("motion-asset");
    expect(motionAssetClass("extra")).toBe("motion-asset extra");
  });
});

describe("라벨", () => {
  it("ko/en 라벨", () => {
    expect(getMotionAssetLabels("ko").emptySearchTitle).toBe("검색 결과가 없어요");
    expect(getMotionAssetLabels("en").emptySearchTitle).toBe("No results found");
  });

  it("stepOf/gaugeOf 포맷", () => {
    expect(getMotionAssetLabels("ko").stepOf(2, 5)).toBe("5단계 중 2단계");
    expect(getMotionAssetLabels("en").gaugeOf(30, 100)).toBe("30 of 100");
  });

  it("언어 정규화", () => {
    expect(normalizeMotionAssetLang("ko-KR")).toBe("ko");
    expect(normalizeMotionAssetLang("en-US")).toBe("en");
    expect(normalizeMotionAssetLang("ja")).toBe("ko");
  });
});
