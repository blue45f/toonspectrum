import { describe, expect, it } from "vitest";

import {
  hasActiveLayerStyle,
  LAYER_STYLE_PRESETS,
  LAYER_STYLE_RANGES,
  layerStyleResetPatch,
  type LayerStylePatch,
} from "./studio-layer-styles";

// LayerStylePatch의 전체 키 집합(layerStyleResetPatch가 빠짐없이 채워야 하는 6개 키).
const ALL_PATCH_KEYS = [
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
  "shadowOpacity",
  "cornerRadius",
];

const HEX_RE = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = new Set(["shadowColor"]);

describe("LAYER_STYLE_RANGES", () => {
  it("matches the spec'd ranges for every slider", () => {
    expect(LAYER_STYLE_RANGES.shadowBlur).toEqual({ min: 0, max: 60, step: 1 });
    expect(LAYER_STYLE_RANGES.shadowOffsetX).toEqual({ min: -40, max: 40, step: 1 });
    expect(LAYER_STYLE_RANGES.shadowOffsetY).toEqual({ min: -40, max: 40, step: 1 });
    expect(LAYER_STYLE_RANGES.shadowOpacity).toEqual({ min: 0, max: 1, step: 0.05 });
    expect(LAYER_STYLE_RANGES.cornerRadius).toEqual({ min: 0, max: 120, step: 1 });
  });

  it("has min < max and positive step for each range", () => {
    for (const range of Object.values(LAYER_STYLE_RANGES)) {
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
    }
  });
});

describe("layerStyleResetPatch", () => {
  it("explicitly lists all 6 patch keys with an undefined value", () => {
    const patch = layerStyleResetPatch();
    expect(Object.keys(patch)).toHaveLength(6);
    expect(Object.keys(patch).sort()).toEqual([...ALL_PATCH_KEYS].sort());
    for (const value of Object.values(patch)) expect(value).toBeUndefined();
  });

  it("returns a fresh equal object each call", () => {
    expect(layerStyleResetPatch()).not.toBe(layerStyleResetPatch());
    expect(layerStyleResetPatch()).toEqual(layerStyleResetPatch());
  });
});

describe("LAYER_STYLE_PRESETS", () => {
  const RESET_KEYS = new Set(Object.keys(layerStyleResetPatch()));
  // 수치 키 → 범위 매핑(슬라이더와 동일). 색/문자열 키는 제외.
  const NUMERIC_RANGES = LAYER_STYLE_RANGES as Record<string, { min: number; max: number; step: number }>;

  it("has the none/기본 reset preset first and unique ids", () => {
    const ids = LAYER_STYLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LAYER_STYLE_PRESETS[0]!.id).toBe("none");
    expect(LAYER_STYLE_PRESETS[0]!.label).toBe("기본");
    expect(LAYER_STYLE_PRESETS[0]!.patch).toEqual(layerStyleResetPatch());
  });

  it("ships roughly ten presets", () => {
    expect(LAYER_STYLE_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(LAYER_STYLE_PRESETS.length).toBeLessThanOrEqual(12);
  });

  it("has non-empty labels and tips", () => {
    for (const preset of LAYER_STYLE_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.tip.trim().length).toBeGreaterThan(0);
    }
  });

  it("only uses known patch keys with in-range, well-typed values", () => {
    for (const preset of LAYER_STYLE_PRESETS.slice(1)) {
      const entries = Object.entries(preset.patch) as [keyof LayerStylePatch, unknown][];
      expect(entries.length).toBeGreaterThan(0);
      for (const [key, value] of entries) {
        // 모든 patch 키는 LayerStylePatch(=reset 키)의 부분집합이어야 한다.
        expect(RESET_KEYS.has(key)).toBe(true);
        if (value === undefined) continue;
        if (COLOR_KEYS.has(key)) {
          expect(typeof value).toBe("string");
          // 색은 유효 #rrggbb 헥스여야 한다.
          expect(HEX_RE.test(value as string)).toBe(true);
        } else {
          const range = NUMERIC_RANGES[key];
          expect(range).toBeDefined();
          expect(typeof value).toBe("number");
          expect(Number.isFinite(value as number)).toBe(true);
          expect(value as number).toBeGreaterThanOrEqual(range!.min);
          expect(value as number).toBeLessThanOrEqual(range!.max);
        }
      }
    }
  });

  it("makes every non-reset preset render a visible style", () => {
    for (const preset of LAYER_STYLE_PRESETS.slice(1)) {
      expect(hasActiveLayerStyle(preset.patch)).toBe(true);
    }
  });
});

describe("hasActiveLayerStyle", () => {
  it("treats an empty patch as inactive", () => {
    expect(hasActiveLayerStyle({})).toBe(false);
    expect(hasActiveLayerStyle(layerStyleResetPatch())).toBe(false);
  });

  it("is active when cornerRadius is positive", () => {
    expect(hasActiveLayerStyle({ cornerRadius: 10 })).toBe(true);
    expect(hasActiveLayerStyle({ cornerRadius: 0 })).toBe(false);
  });

  it("needs both a shadow color and some spread", () => {
    // 색만 있고 번짐/오프셋이 없으면 비활성.
    expect(hasActiveLayerStyle({ shadowColor: "#000" })).toBe(false);
    expect(hasActiveLayerStyle({ shadowColor: "#000", shadowBlur: 8 })).toBe(true);
    expect(hasActiveLayerStyle({ shadowColor: "#000", shadowOffsetY: 6 })).toBe(true);
    expect(hasActiveLayerStyle({ shadowColor: "#000", shadowOffsetX: -4 })).toBe(true);
  });

  it("treats spread without a color as inactive", () => {
    expect(hasActiveLayerStyle({ shadowBlur: 12, shadowOffsetY: 8 })).toBe(false);
  });

  it("treats zero opacity as inactive even with spread", () => {
    expect(hasActiveLayerStyle({ shadowColor: "#000", shadowBlur: 8, shadowOpacity: 0 })).toBe(false);
  });

  it("treats missing opacity as fully opaque", () => {
    expect(hasActiveLayerStyle({ shadowColor: "#000", shadowBlur: 8 })).toBe(true);
  });
});
