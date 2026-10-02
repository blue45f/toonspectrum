import { describe, expect, it } from "vitest";

import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_ACCENT_OPTIONS,
  STUDIO_AVATAR_EXPRESSION_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
  STUDIO_AVATAR_SKIN_OPTIONS,
} from "./studio-virtual-space-avatar-options";

describe("아바타 꾸미기 옵션 카탈로그", () => {
  it("요구 수량을 만족한다 (피부 10·헤어색 12·헤어스타일 18·의상 18·액세서리 16)", () => {
    expect(STUDIO_AVATAR_SKIN_OPTIONS).toHaveLength(10);
    expect(STUDIO_AVATAR_HAIR_COLOR_OPTIONS).toHaveLength(12);
    expect(STUDIO_AVATAR_HAIR_STYLE_OPTIONS.length).toBeGreaterThanOrEqual(10);
    expect(STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS.length).toBeGreaterThanOrEqual(10);
    expect(STUDIO_AVATAR_ACCESSORY_OPTIONS).toHaveLength(16);
    expect(STUDIO_AVATAR_EXPRESSION_OPTIONS).toHaveLength(4);
  });

  it("모든 색상 값이 oklch 형식이다", () => {
    for (const option of [
      ...STUDIO_AVATAR_SKIN_OPTIONS,
      ...STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
      ...STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
      ...STUDIO_AVATAR_ACCENT_OPTIONS,
    ]) {
      expect(option.value.startsWith("oklch(")).toBe(true);
    }
  });

  it("헤어 색상마다 하이라이트가 짝지어진다", () => {
    for (const option of STUDIO_AVATAR_HAIR_COLOR_OPTIONS) {
      expect(option.highlight.startsWith("oklch(")).toBe(true);
      expect(option.highlight).not.toBe(option.value);
    }
  });

  it("모든 옵션에 한·영 라벨이 있다", () => {
    const all = [
      ...STUDIO_AVATAR_SKIN_OPTIONS,
      ...STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
      ...STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
      ...STUDIO_AVATAR_ACCENT_OPTIONS,
      ...STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
      ...STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
      ...STUDIO_AVATAR_ACCESSORY_OPTIONS,
      ...STUDIO_AVATAR_EXPRESSION_OPTIONS,
    ];
    for (const option of all) {
      expect(option.labelKo.trim().length).toBeGreaterThan(0);
      expect(option.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("키가 중복되지 않는다", () => {
    for (const options of [
      STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
      STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
      STUDIO_AVATAR_ACCESSORY_OPTIONS,
      STUDIO_AVATAR_EXPRESSION_OPTIONS,
    ]) {
      const keys = options.map((option) => option.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("액세서리에 '없음' 옵션이 있다", () => {
    expect(STUDIO_AVATAR_ACCESSORY_OPTIONS.some((option) => option.key === "none")).toBe(true);
  });
});
