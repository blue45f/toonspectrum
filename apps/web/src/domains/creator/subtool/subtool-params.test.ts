import { describe, expect, it } from "vitest";

import {
  createDefaultSubToolParams,
  normalizeSubToolParams,
  subToolParamsEqual,
} from "./subtool-params";

describe("createDefaultSubToolParams", () => {
  it("6개 파라미터 그룹을 모두 포함한 기본값을 반환한다", () => {
    const params = createDefaultSubToolParams();
    expect(params.tip).toEqual({ shape: "round", size: 24, angle: 0, roundness: 1 });
    expect(params.spacing).toEqual({ percent: 25, jitter: 0 });
    expect(params.texture).toEqual({ strength: 0, scale: 1, mode: "multiply" });
    expect(params.dualBrush.enabled).toBe(false);
    expect(params.colorJitter).toEqual({ hue: 0, saturation: 0, value: 0, opacity: 0 });
    expect(params.blending).toEqual({ mode: "normal", opacity: 1 });
  });
});

describe("normalizeSubToolParams", () => {
  it("빈 입력에도 완전한 기본 파라미터를 반환한다", () => {
    for (const input of [undefined, null, {}, "문자열", 42, []]) {
      expect(normalizeSubToolParams(input)).toEqual(createDefaultSubToolParams());
    }
  });

  it("범위를 벗어난 숫자를 경계값으로 클램핑한다", () => {
    const params = normalizeSubToolParams({
      tip: { size: 9999, angle: -50, roundness: 5 },
      spacing: { percent: 0, jitter: 2 },
      texture: { strength: -1, scale: 99 },
      dualBrush: { sizeRatio: 0, spacingPercent: 1000 },
      colorJitter: { hue: 400, saturation: -0.5, value: 3, opacity: 1.5 },
      blending: { opacity: -2 },
    });
    expect(params.tip.size).toBe(200);
    expect(params.tip.angle).toBe(0);
    expect(params.tip.roundness).toBe(1);
    expect(params.spacing.percent).toBe(1);
    expect(params.spacing.jitter).toBe(1);
    expect(params.texture.strength).toBe(0);
    expect(params.texture.scale).toBe(4);
    expect(params.dualBrush.sizeRatio).toBe(0.1);
    expect(params.dualBrush.spacingPercent).toBe(200);
    expect(params.colorJitter.hue).toBe(180);
    expect(params.colorJitter.saturation).toBe(0);
    expect(params.colorJitter.value).toBe(1);
    expect(params.colorJitter.opacity).toBe(1);
    expect(params.blending.opacity).toBe(0);
  });

  it("범위 안의 값은 그대로 유지한다", () => {
    const params = normalizeSubToolParams({
      tip: { shape: "neon", size: 48, angle: 120, roundness: 0.4 },
      spacing: { percent: 60, jitter: 0.3 },
      texture: { strength: 0.7, scale: 2, mode: "overlay" },
      dualBrush: { enabled: true, sizeRatio: 0.6, spacingPercent: 80, blendMode: "screen" },
      colorJitter: { hue: 45, saturation: 0.2, value: 0.3, opacity: 0.4 },
      blending: { mode: "multiply", opacity: 0.8 },
    });
    expect(params.tip).toEqual({ shape: "neon", size: 48, angle: 120, roundness: 0.4 });
    expect(params.spacing).toEqual({ percent: 60, jitter: 0.3 });
    expect(params.texture).toEqual({ strength: 0.7, scale: 2, mode: "overlay" });
    expect(params.dualBrush).toEqual({
      enabled: true,
      sizeRatio: 0.6,
      spacingPercent: 80,
      blendMode: "screen",
    });
    expect(params.colorJitter).toEqual({ hue: 45, saturation: 0.2, value: 0.3, opacity: 0.4 });
    expect(params.blending).toEqual({ mode: "multiply", opacity: 0.8 });
  });

  it("알 수 없는 enum 문자열은 기본값으로 대체한다", () => {
    const params = normalizeSubToolParams({
      tip: { shape: "hexagon" },
      texture: { mode: "dissolve" },
      blending: { mode: "difference" },
      dualBrush: { blendMode: "vivid-light" },
    });
    expect(params.tip.shape).toBe("round");
    expect(params.texture.mode).toBe("multiply");
    expect(params.blending.mode).toBe("normal");
    expect(params.dualBrush.blendMode).toBe("normal");
  });

  it("숫자가 아닌 값은 기본값으로 대체한다", () => {
    const params = normalizeSubToolParams({
      tip: { size: "큼", angle: Number.NaN },
      spacing: { percent: null },
    });
    const defaults = createDefaultSubToolParams();
    expect(params.tip.size).toBe(defaults.tip.size);
    expect(params.tip.angle).toBe(defaults.tip.angle);
    expect(params.spacing.percent).toBe(defaults.spacing.percent);
  });

  it("Infinity도 기본값으로 대체한다", () => {
    const params = normalizeSubToolParams({
      tip: { size: Number.POSITIVE_INFINITY },
    });
    expect(params.tip.size).toBe(createDefaultSubToolParams().tip.size);
  });

  it("부분 패치를 병합해도 다른 그룹은 유지된다", () => {
    const base = normalizeSubToolParams({ tip: { size: 64, shape: "flat" } });
    const merged = normalizeSubToolParams({ ...base, spacing: { percent: 80 } });
    expect(merged.tip.size).toBe(64);
    expect(merged.tip.shape).toBe("flat");
    expect(merged.spacing.percent).toBe(80);
    expect(merged.spacing.jitter).toBe(0);
  });
});

describe("subToolParamsEqual", () => {
  it("같은 파라미터는 true, 다른 파라미터는 false를 반환한다", () => {
    const a = createDefaultSubToolParams();
    const b = normalizeSubToolParams({});
    const c = normalizeSubToolParams({ tip: { size: 25 } });
    expect(subToolParamsEqual(a, b)).toBe(true);
    expect(subToolParamsEqual(a, c)).toBe(false);
  });
});
